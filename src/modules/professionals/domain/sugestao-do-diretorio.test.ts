/**
 * A conferencia pura da sugestao do diretorio.
 *
 * ## O que este arquivo NAO consegue exercitar, dito antes de alguem acreditar
 * no verde
 *
 * O detector de D59 de verdade (`temContatoOuPagamento`, por
 * `errosDeTextoDeUsuario`) mora em `modules/network/domain`, e
 * `arquitetura/fronteira-de-modulo` reprova importa-lo de dentro de
 * `src/modules/professionals/` -- **inclusive de um `.test.ts`**, porque aquela
 * regra nao tem isencao para teste. Medido:
 *
 *     error  Import de 'professionals' para 'network/domain'.
 *            Módulo só conversa com módulo por porta.
 *
 * Entao o que estes casos provam e o que ESTE modulo faz: que
 * `display_name` e `note` sao levados ao detector com o campo e os tetos
 * certos, e que uma recusa dele chega inteira ao `400`. **Que o detector
 * reconhece "chama no 11 98765-4321" e caso da suite da `Rede`**, e nao se
 * repete aqui -- repeti-lo com um dobro feito a mao provaria o dobro.
 *
 * O contato publico e diferente, e por isso ele e testado de verdade: o
 * telefone usa a regua do banco que esta neste arquivo, e o site usa o
 * `errosDoEnderecoCompleto` de `shared/url`, que e importavel e e o de
 * producao.
 */
import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import type { ProblemFieldError } from '../../../shared/http/problem.js';
import { comoData } from '../../../shared/time/clock.js';
import type { Instant } from '../../../shared/types/brands.js';
import type { ConferenciasDeTexto } from '../ports/conferencias-de-texto.js';
import {
  errosDaSugestao,
  projetarRecibo,
  TETO_DO_NOME,
  TETO_DO_RECADO,
  type CorpoDaSugestaoDoDiretorio,
} from './sugestao-do-diretorio.js';

interface ChamadaDoDetector {
  readonly campo: string;
  readonly valor: string;
  readonly minimo: number;
  readonly maximo: number;
}

/**
 * O dobro das conferencias injetadas.
 *
 * `recusar` faz o detector acusar o que ele acusaria em producao, com o MESMO
 * `code` que `errosDeTextoDeUsuario` usa. A gramatica do handle do Instagram e
 * a documentada em `handleDoInstagram` (1 a 30 de letra, digito, ponto e
 * sublinhado): aqui ela existe para que os casos do `@` exercitem o DESPACHO
 * deste modulo, que e a parte que este arquivo responde por.
 */
function conferenciasDobradas(opcoes: {
  readonly recusar?: readonly string[];
  readonly chamadas?: ChamadaDoDetector[];
} = {}): ConferenciasDeTexto {
  return {
    errosDeTextoDeUsuario: (campo, valor, minimo, maximo): ProblemFieldError[] => {
      opcoes.chamadas?.push({ campo, valor, minimo, maximo });
      return (opcoes.recusar ?? []).includes(campo)
        ? [
            {
              field: campo,
              code: 'contact_or_payment_detected',
              message: 'Este texto não pode ter telefone, e-mail, link, perfil, chave PIX nem dados de pagamento.',
            },
          ]
        : [];
    },
    handleDoInstagram: (valor): string | null => {
      const texto = valor.trim().startsWith('@') ? valor.trim().slice(1) : valor.trim();
      return /^[A-Za-z0-9._]{1,30}$/.test(texto) ? texto.toLowerCase() : null;
    },
  };
}

const CORPO: CorpoDaSugestaoDoDiretorio = {
  display_name: 'Clínica Veterinária Santa Bárbara',
  kind: 'clinic',
  city: 'São Paulo',
  state: 'SP',
  neighborhood: 'Pinheiros',
  public_contact: { kind: 'phone', value: '+551130612200' },
};

void describe('a sugestao valida passa inteira', () => {
  void it('sem bairro e sem recado, zero erro: os dois sao opcionais no contrato', () => {
    const { neighborhood, ...semBairro } = CORPO;
    assert.equal(neighborhood, 'Pinheiros');
    assert.deepEqual(errosDaSugestao(semBairro, conferenciasDobradas()), []);
  });

  void it('com bairro e recado, zero erro', () => {
    assert.deepEqual(
      errosDaSugestao({ ...CORPO, note: 'Atenderam meu cão de madrugada.' }, conferenciasDobradas()),
      [],
    );
  });
});

void describe('D59 e o controle bidirecional valem em `display_name` e em `note`', () => {
  void it('o detector e chamado para os DOIS campos, com os tetos do contrato', () => {
    const chamadas: ChamadaDoDetector[] = [];
    errosDaSugestao({ ...CORPO, note: 'Recomendo muito.' }, conferenciasDobradas({ chamadas }));
    assert.deepEqual(
      chamadas.map((c) => [c.campo, c.minimo, c.maximo]),
      [
        ['display_name', 2, TETO_DO_NOME],
        ['note', 2, TETO_DO_RECADO],
      ],
    );
  });

  void it('ISCA: a recusa de `display_name` chega inteira, com campo e `code`', () => {
    const erros = errosDaSugestao(CORPO, conferenciasDobradas({ recusar: ['display_name'] }));
    assert.equal(erros.length, 1);
    assert.equal(erros[0]?.field, 'display_name');
    assert.equal(erros[0]?.code, 'contact_or_payment_detected');
  });

  void it('ISCA: a recusa de `note` chega inteira, com campo e `code`', () => {
    const erros = errosDaSugestao(
      { ...CORPO, note: 'Chama no zap' },
      conferenciasDobradas({ recusar: ['note'] }),
    );
    assert.equal(erros.length, 1);
    assert.equal(erros[0]?.field, 'note');
    assert.equal(erros[0]?.code, 'contact_or_payment_detected');
  });

  void it('`note` ausente nao e conferido: o detector nao e chamado por um campo que nao veio', () => {
    const chamadas: ChamadaDoDetector[] = [];
    errosDaSugestao(CORPO, conferenciasDobradas({ chamadas }));
    assert.deepEqual(chamadas.map((c) => c.campo), ['display_name']);
  });

  void it('os erros vem TODOS DE UMA VEZ: nome e recado juntos, e nao um por rodada', () => {
    const erros = errosDaSugestao(
      { ...CORPO, note: 'Pix 123.456.789-09' },
      conferenciasDobradas({ recusar: ['display_name', 'note'] }),
    );
    assert.deepEqual(erros.map((e) => e.field), ['display_name', 'note']);
  });
});

void describe('o contato publico e conferido CONTRA O `kind` declarado', () => {
  void it('`phone` aceita E.164, pela regua de `professionals.phone_e164`', () => {
    for (const valor of ['+551130612200', '+5511987654321', '+12025550123']) {
      assert.deepEqual(
        errosDaSugestao({ ...CORPO, public_contact: { kind: 'phone', value: valor } }, conferenciasDobradas()),
        [],
        valor,
      );
    }
  });

  void it('`phone` RECUSA o que o CHECK do banco recusaria, nomeando `public_contact.value`', () => {
    for (const valor of ['11 3061-2200', '+0511130612200', '551130612200', '+55', '+55113061220099999']) {
      const erros = errosDaSugestao(
        { ...CORPO, public_contact: { kind: 'phone', value: valor } },
        conferenciasDobradas(),
      );
      assert.equal(erros.length, 1, valor);
      assert.equal(erros[0]?.field, 'public_contact.value', valor);
      assert.equal(erros[0]?.code, 'public_contact_phone_invalid', valor);
    }
  });

  void it('`website` exige o endereco COMPLETO com https://, pelo validador de `shared/url`', () => {
    assert.deepEqual(
      errosDaSugestao(
        { ...CORPO, public_contact: { kind: 'website', value: 'https://clinicasantabarbara.com.br/contato' } },
        conferenciasDobradas(),
      ),
      [],
    );
  });

  void it('ISCA: `website` sem esquema, com http:// e para host local, cada um com `code` proprio', () => {
    const casos: [string, string][] = [
      ['clinicasantabarbara.com.br', 'public_contact_not_https'],
      ['http://clinicasantabarbara.com.br', 'public_contact_not_https'],
      ['https://localhost/contato', 'public_contact_local_host'],
      ['https://10.0.0.1/contato', 'public_contact_ip_literal'],
    ];
    for (const [valor, code] of casos) {
      const erros = errosDaSugestao(
        { ...CORPO, public_contact: { kind: 'website', value: valor } },
        conferenciasDobradas(),
      );
      assert.equal(erros[0]?.field, 'public_contact.value', valor);
      assert.equal(erros[0]?.code, code, valor);
    }
  });

  void it('`instagram` aceita o perfil com `@`, como o contrato o descreve', () => {
    for (const valor of ['@bichu.app', '@clinica_santa_barbara', '@vet24h']) {
      assert.deepEqual(
        errosDaSugestao({ ...CORPO, public_contact: { kind: 'instagram', value: valor } }, conferenciasDobradas()),
        [],
        valor,
      );
    }
  });

  void it('ISCA: `instagram` sem `@`, ou com handle impossivel, e recusado', () => {
    for (const valor of ['bichu.app', 'https://instagram.com/bichu.app', '@com espaço', '@']) {
      const erros = errosDaSugestao(
        { ...CORPO, public_contact: { kind: 'instagram', value: valor } },
        conferenciasDobradas(),
      );
      assert.equal(erros.length, 1, valor);
      assert.equal(erros[0]?.field, 'public_contact.value', valor);
      assert.equal(erros[0]?.code, 'public_contact_instagram_invalid', valor);
    }
  });

  void it('ISCA: cada `kind` recusa o formato DOS OUTROS -- o tipo nao e adivinhado', () => {
    const cruzados: [CorpoDaSugestaoDoDiretorio['public_contact']['kind'], string][] = [
      ['phone', 'https://clinicasantabarbara.com.br'],
      ['phone', '@bichu.app'],
      ['website', '+551130612200'],
      ['website', '@bichu.app'],
      ['instagram', '+551130612200'],
      ['instagram', 'https://clinicasantabarbara.com.br'],
    ];
    for (const [kind, value] of cruzados) {
      const erros = errosDaSugestao({ ...CORPO, public_contact: { kind, value } }, conferenciasDobradas());
      assert.equal(erros.length > 0, true, `${kind} aceitou ${value}`);
      assert.equal(erros[0]?.field, 'public_contact.value', `${kind} / ${value}`);
    }
  });
});

void describe('o recibo e recibo, e nao o recurso sugerido', () => {
  void it('traz `reference`, `state: pending` e `created_at`, e MAIS NADA', () => {
    const recibo = projetarRecibo({
      ref: 'u7YkQwE2tLm9ZpR4sA',
      // `comoData` e nao `new Date`: a camada pura nao le o relogio, e a regra
      // de lint vale tambem no teste.
      createdAt: comoData(Date.UTC(2026, 9, 17, 12, 0, 0) as Instant),
    });
    assert.deepEqual(Object.keys(recibo).sort(), ['created_at', 'reference', 'state']);
    assert.equal(recibo.state, 'pending');
    assert.equal(recibo.reference, 'u7YkQwE2tLm9ZpR4sA');
    assert.equal(recibo.created_at, '2026-10-17T12:00:00.000Z');
  });

  void it('ISCA: o `id` interno nao tem como entrar no recibo -- ele nao e parametro', () => {
    const recibo = projetarRecibo({ ref: 'u7YkQwE2tLm9ZpR4sA', createdAt: comoData(0 as Instant) });
    assert.equal(JSON.stringify(recibo).includes('id'), false);
  });
});
