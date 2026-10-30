/** **O CEP da sugestao e guardado para quem REVISA, e nunca sai.** */
import assert from 'node:assert/strict';
import { resolve } from 'node:path';
import { describe, it } from 'node:test';

import { carregarContrato } from '../../../shared/http/contract.js';
import { comoData } from '../../../shared/time/clock.js';
import { CHAVES_PROIBIDAS_EM_RESPOSTA_PUBLICA } from '../../../shared/http/vazamento-publico.js';
import {
  ehOperacaoSemConta,
  inspecionarCamposPublicos,
} from '../../../tools/portao-contrato-publico.js';
import type { Instant, UserId } from '../../../shared/types/brands.js';
import type { AuditEvent } from '../../audit/ports/audit-log.js';
import { SugestaoDoDiretorio } from '../application/sugestao-do-diretorio.js';
import type {
  DirectorySuggestionRepository,
  SugestaoAGravar,
} from '../ports/directory-suggestion-repository.js';
import type { ConferenciasDeTexto } from '../ports/conferencias-de-texto.js';
import type { CorpoDaSugestaoDoDiretorio } from './sugestao-do-diretorio.js';

const CEP = '01310100';
const REF = 'Xk3Qm9TbPz7Lw2Rv5Nd8Hq';
const CRIADO_EM = comoData(Date.UTC(2026, 9, 18, 12, 0, 0) as Instant);

const CORPO: CorpoDaSugestaoDoDiretorio = {
  display_name: 'Clinica Veterinaria Bichinho',
  kind: 'clinic',
  city: 'Sao Paulo',
  state: 'SP',
  public_contact: { kind: 'phone', value: '+5511999999999' },
};

/** O detector nao e importavel deste modulo (ver `sugestao-do-diretorio.test.ts`). */
const CONFERENCIAS: ConferenciasDeTexto = {
  errosDeTextoDeUsuario: () => [],
  handleDoInstagram: (valor) => valor.replace('@', ''),
};

interface Observado {
  readonly gravadas: SugestaoAGravar[];
  readonly trilha: AuditEvent[];
  readonly caso: SugestaoDoDiretorio;
}

function cenario(): Observado {
  const gravadas: SugestaoAGravar[] = [];
  const trilha: AuditEvent[] = [];
  const sugestoes: DirectorySuggestionRepository = {
    registrar: (sugestao) => {
      gravadas.push(sugestao);
      return Promise.resolve({
        tipo: 'gravada' as const,
        sugestao: { ref: REF, createdAt: CRIADO_EM },
      });
    },
    listarDoAutor: () =>
      Promise.reject(new Error('cenario de escrita: listarDoAutor nao e exercitado aqui')),
  };
  return {
    gravadas,
    trilha,
    caso: new SugestaoDoDiretorio({
      sugestoes,
      trilha: {
        record: (evento) => {
          trilha.push(evento);
          return Promise.resolve();
        },
      },
      conferencias: CONFERENCIAS,
      canal: { temCanalVerificado: () => Promise.resolve(true) },
    }),
  };
}

const contrato = carregarContrato(resolve(process.cwd(), 'api/openapi.yaml'));

function schema(nome: string): Record<string, unknown> {
  const componentes = contrato.spec['components'] as Record<string, unknown>;
  const schemas = componentes['schemas'] as Record<string, unknown>;
  return schemas[nome] as Record<string, unknown>;
}

void describe('o CEP e GRAVADO, e esse e o pedido do cliente', () => {
  void it('chega ao repositorio como `postalCode`, sem hifen', async () => {
    const { caso, gravadas } = cenario();
    await caso.sugerir(
      { userId: 'u1' as UserId, correlationId: 'c1', ip: undefined },
      { ...CORPO, postal_code: CEP },
    );
    assert.equal(
      gravadas[0]?.postalCode,
      CEP,
      'REPROVA: o CEP nao chegou a camada que grava. O cliente autorizou guardar, e o destinatario e a fila de revisao do painel -- sem o valor ela nao acha o estabelecimento para convida-lo (ADR-0011).',
    );
  });

  void it('sem CEP no corpo, grava nulo e nao recusa', async () => {
    const { caso, gravadas } = cenario();
    await caso.sugerir(
      { userId: 'u1' as UserId, correlationId: 'c1', ip: undefined },
      CORPO,
    );
    assert.equal(gravadas[0]?.postalCode, null);
  });
});

void describe('ISCA — o CEP NAO sai em resposta', () => {
  void it('o recibo do caso de uso tem TRES chaves, e nenhuma e o CEP', async () => {
    const { caso } = cenario();
    const recibo = await caso.sugerir(
      { userId: 'u1' as UserId, correlationId: 'c1', ip: undefined },
      { ...CORPO, postal_code: CEP },
    );
    assert.deepEqual(
      Object.keys(recibo).sort(),
      ['created_at', 'reference', 'state'],
      'REPROVA: o recibo ganhou chave. Ele e o recibo de uma FILA, e devolver o que foi sugerido faria a tela parecer publicacao -- com o CEP dentro, viraria vazamento.',
    );
    assert.equal(
      JSON.stringify(recibo).includes(CEP),
      false,
      'REPROVA: o CEP aparece no corpo da resposta, em alguma profundidade.',
    );
  });

  void it('a TRILHA guarda a existencia do CEP, nunca o valor', async () => {
    const { caso, trilha } = cenario();
    await caso.sugerir(
      { userId: 'u1' as UserId, correlationId: 'c1', ip: undefined },
      { ...CORPO, postal_code: CEP },
    );
    const evento = trilha[0];
    assert.equal((evento?.after as Record<string, unknown>)['has_postal_code'], true);
    assert.equal(
      JSON.stringify(evento?.after).includes(CEP),
      false,
      'REPROVA: o valor do CEP foi para a trilha. A trilha sobrevive a exclusao da conta, e o que ela precisa responder e "quem mandou quantas sugestoes, de que tipo e para onde" -- nao o endereco de um terceiro. Oito digitos sao mais finos que bairro e cidade, que e o teto do ADR-0010, e nenhum portao de superficie publica olha a trilha.',
    );
  });

  void it('`DirectorySuggestionReceipt` nao DECLARA o CEP, e e fechado', () => {
    const recibo = schema('DirectorySuggestionReceipt');
    assert.equal(
      recibo['additionalProperties'],
      false,
      'REPROVA: o recibo deixou de ser fechado, e campo a mais numa resposta nao quebra cliente nenhum -- nenhum comparador de contrato o acusa.',
    );
    const propriedades = Object.keys(recibo['properties'] as Record<string, unknown>);
    assert.equal(
      propriedades.includes('postal_code'),
      false,
      'REPROVA: o contrato passou a permitir o CEP de volta no recibo. Guardar para quem revisa nao e devolver para quem envia.',
    );
  });

  /**
   * `ehOperacaoSemConta` NAO e opcional aqui, e a ausencia dele era o defeito deste
   * caso.
   */
  void it('nenhuma resposta ALCANCAVEL SEM CONTA declara o CEP', () => {
    const semConta = [...contrato.operacoes.values()].filter(ehOperacaoSemConta);
    assert.ok(
      semConta.length > 0,
      'REPROVA: o filtro nao devolveu operacao nenhuma. Sem conta a varredura abaixo nao olha nada e o caso vira verde vazio.',
    );
    const achados = inspecionarCamposPublicos(contrato.spec, semConta);
    assert.deepEqual(
      achados.filter((a) => a.campo === 'postal_code'),
      [],
      'REPROVA: alguma operacao sem conta passou a declarar `postal_code` em resposta. Rua e CEP nao saem em superficie publica (ADR-0010 itens 4 e 5).',
    );
  });

  void it('`postal_code` continua na lista de chave proibida em resposta publica', () => {
    assert.equal(
      CHAVES_PROIBIDAS_EM_RESPOSTA_PUBLICA.has('postal_code'),
      true,
      'REPROVA: `postal_code` saiu da lista do detector de vazamento. Essa lista e o que confere o que a ROTA responde, e o portao de contrato confere o que o CONTRATO declara -- as duas coisas divergem exatamente onde dói.',
    );
  });
});

void describe('ISCA — o CEP NAO pode virar obrigatorio', () => {
  void it('`DirectorySuggestionInput.required` nao tem o CEP', () => {
    const entrada = schema('DirectorySuggestionInput');
    const exigidos = entrada['required'] as string[];
    assert.equal(
      exigidos.includes('postal_code'),
      false,
      'REPROVA: o CEP virou exigencia. Quem indica uma clinica de outro bairro quase sempre nao sabe o CEP dela, e cobra-lo troca uma indicacao por um campo inventado -- o mesmo juizo que deixou `neighborhood` opcional.',
    );
    assert.deepEqual(
      exigidos.sort(),
      ['city', 'display_name', 'kind', 'public_contact', 'state'],
      'REPROVA: a lista de exigidos mudou. Esta assercao e o teto: ela reprova qualquer campo novo que vire obrigatorio, e nao so o CEP.',
    );
  });

  void it('o CEP e DECLARADO, com a forma do contrato', () => {
    const entrada = schema('DirectorySuggestionInput');
    const propriedades = entrada['properties'] as Record<string, unknown>;
    const cep = propriedades['postal_code'] as Record<string, unknown>;
    assert.notEqual(
      cep,
      undefined,
      'REPROVA: `postal_code` nao esta declarado. O schema e `additionalProperties: false`, e com o Ajv de `removeAdditional: true` do Fastify o campo seria APAGADO EM SILENCIO -- o app mandaria o CEP, receberia 201 e nada seria guardado.',
    );
    assert.equal(
      cep['pattern'],
      '^[0-9]{8}$',
      'REPROVA: a forma do CEP no contrato mudou. O app traduz por `cepParaOContrato`, que devolve oito digitos sem hifen: as duas pontas tem de dizer a mesma coisa, e esta e a divergencia que nenhum portao do projeto pega.',
    );
    assert.equal(entrada['additionalProperties'], false);
  });
});
