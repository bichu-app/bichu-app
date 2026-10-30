/**
 * O TIPO DE ENTIDADE NA FILA DE INDICACAO, na camada de regra (cliente,
 * 29/10/2026).
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
    const projetada = projetarIndicacao(naFila({ entityKind: 'organization' }));
    assert.equal(projetada.entity_kind, 'organization');
  });

  void it('`professional` tambem sai, e nao e omitido por ser o padrao', () => {
    assert.equal(projetarIndicacao(naFila()).entity_kind, 'professional');
  });

  void it('OS DOIS EIXOS ficam separados: `kind` e o que ela FAZ, `entity_kind` e o que ela E', () => {
    const projetada = projetarIndicacao(naFila({ kind: 'clinic', entityKind: 'organization' }));
    assert.equal(projetada.kind, 'clinic');
    assert.equal(projetada.entity_kind, 'organization');
  });

  void it('a projecao de QUEM INDICOU tambem carrega o tipo', () => {
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
    assert.ok(!Object.keys(minha).includes('note'));
  });

  void it('a fila do painel NAO entrega nada de quem indicou', () => {
    const projetada = projetarIndicacao(naFila({ entityKind: 'organization' }));
    const texto = JSON.stringify(projetada);
    for (const proibido of ['suggested_by', 'user_id', 'author', 'id"']) {
      assert.ok(!texto.includes(proibido), `a projecao carrega ${proibido}: ${texto}`);
    }
  });
});
