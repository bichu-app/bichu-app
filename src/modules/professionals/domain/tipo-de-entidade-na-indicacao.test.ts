/**
 * O TIPO DE ENTIDADE NA FILA DE INDICACAO, na camada de regra (cliente,
 * 29/10/2026).
 *
 * Pedido: *"esta faltando o campo se e um profissional, ong ou
 * estabelecimento"* no formulario de INDICAR do aplicativo.
 *
 * ## O QUE ESTE ARQUIVO MEDE, E O QUE ELE DELIBERADAMENTE NAO MEDE
 *
 * Mede as DUAS PROJECOES -- a do painel (`projetarIndicacao`) e a de quem
 * indicou (`projetarMinhaIndicacao`) -- carregarem o campo, e os dois EIXOS
 * continuarem separados.
 *
 * **Nao mede a travessia da aprovacao**, que e o pedido de verdade: o valor vai
 * de `directory_suggestions.entity_kind` ate `professionals.entity_kind`
 * passando por duas tabelas na MESMA transacao e por uma funcao SQL de treze
 * argumentos. Dublê mediria o dublê. Isso esta em
 * `tests/integration/fila-de-indicacoes-do-diretorio.test.ts`, caso `(a4)`, que
 * exige banco -- e o proprio arquivo diz como desligar o mecanismo para
 * conferir a reprovacao.
 *
 * ## AS ISCAS, provadas NOS DOIS SENTIDOS
 *
 * | o que se tira do codigo de producao | reprova |
 * |---|---|
 * | `entity_kind: i.entityKind` de `projetarIndicacao` | 2 |
 * | `entity_kind: i.entityKind` de `projetarMinhaIndicacao` | 1 |
 */
import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { comoData } from '../../../shared/time/clock.js';
import type { Instant } from '../../../shared/types/brands.js';
import { projetarIndicacao, type IndicacaoNaFila } from './fila-de-indicacoes.js';
import { projetarMinhaIndicacao } from './sugestao-do-diretorio.js';

const CRIADA_EM = Date.UTC(2026, 9, 29, 12, 0, 0) as Instant;

function naFila(sobre: Partial<IndicacaoNaFila> = {}): IndicacaoNaFila {
  return {
    ref: 'u7YkQwE2tLm9ZpR4sAbC',
    displayName: 'ONG Patas Livres',
    kind: 'clinic',
    entityKind: 'professional',
    city: 'São Paulo',
    state: 'SP',
    neighborhood: 'Bela Vista',
    contatoKind: 'phone',
    contatoValue: '+551130612200',
    note: null,
    reviewStatus: 'pending',
    createdAt: comoData(CRIADA_EM),
    decidedAt: null,
    declineReason: null,
    entradaSlug: null,
    ...sobre,
  };
}

void describe('o tipo de entidade na indicacao (cliente, 29/10/2026)', () => {
  void it('a fila do PAINEL carrega o tipo: e por ele que quem revisa sabe o que aprova', () => {
    // Sem este campo na fila, quem revisa aprovaria uma ONG como profissional
    // sem nunca ter visto a declaracao de quem indicou -- e a correcao teria de
    // acontecer depois, a mao, na edicao da entrada.
    const projetada = projetarIndicacao(naFila({ entityKind: 'organization' }));
    assert.equal(projetada.entity_kind, 'organization');
  });

  void it('`professional` tambem sai, e nao e omitido por ser o padrao', () => {
    // Omitir o padrao faria a tela nao saber distinguir "declarou profissional"
    // de "esta versao nao manda o campo", e as duas coisas tem efeitos
    // diferentes na aprovacao.
    assert.equal(projetarIndicacao(naFila()).entity_kind, 'professional');
  });

  void it('OS DOIS EIXOS ficam separados: `kind` e o que ela FAZ, `entity_kind` e o que ela E', () => {
    // Uma ONG que atende como clinica tem as duas coisas ao mesmo tempo, e e
    // por isso que um campo so nao as expressava (ADR, `EntityKind`).
    const projetada = projetarIndicacao(naFila({ kind: 'clinic', entityKind: 'organization' }));
    assert.equal(projetada.kind, 'clinic');
    assert.equal(projetada.entity_kind, 'organization');
  });

  void it('a projecao de QUEM INDICOU tambem carrega o tipo', () => {
    // Quem indicou declarou o tipo; esconde-lo na tela dela faria a lista
    // mostrar menos do que ela mandou.
    const minha = projetarMinhaIndicacao({
      ref: 'u7YkQwE2tLm9ZpR4sAbC',
      displayName: 'ONG Patas Livres',
      kind: 'clinic',
      entityKind: 'organization',
      city: 'São Paulo',
      state: 'SP',
      neighborhood: null,
      contatoKind: 'phone',
      contatoValue: '+551130612200',
      reviewStatus: 'pending',
      createdAt: comoData(CRIADA_EM),
      decidedAt: null,
      declineReason: null,
      entradaSlug: null,
    });
    assert.equal(minha.entity_kind, 'organization');
    // E o recado para quem revisa continua FORA desta projecao: ele nao e
    // conteudo da pessoa sobre a entidade (ADR-0011 secao 5.4).
    assert.ok(!Object.keys(minha).includes('note'));
  });

  void it('a fila do painel NAO entrega nada de quem indicou', () => {
    // O campo novo nao abriu porta nenhuma: a projecao continua sem autoria,
    // sem `id` e sem contagem por entidade (BICHUS-174).
    const projetada = projetarIndicacao(naFila({ entityKind: 'organization' }));
    const texto = JSON.stringify(projetada);
    for (const proibido of ['suggested_by', 'user_id', 'author', 'id"']) {
      assert.ok(!texto.includes(proibido), `a projecao carrega ${proibido}: ${texto}`);
    }
  });
});
