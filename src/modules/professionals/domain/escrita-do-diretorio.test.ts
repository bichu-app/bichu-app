/**
 * A regra da escrita do diretorio, sem banco, sem servidor e sem Docker.
 *
 * ## As iscas deste arquivo
 *
 * - **editar nao despublica**: sem `status` no corpo, uma entrada publicada
 *   continua publicada;
 * - **a edicao nao pode quebrar a publicacao**: apagar `city` de uma entrada no
 *   ar e recusado, nomeando o campo, e nao aceito e despublicado em silencio;
 * - **despublicar e explicito**, e nao exige completude: tirar do ar uma entrada
 *   incompleta passa;
 * - **`null` apaga e ausente nao mexe**, e a distincao sobrevive a decisao;
 * - **o marco de publicacao e so da transicao**: editar entrada ja publicada
 *   nao o regrava;
 * - **a projecao nao carrega `id`, coordenada, documento nem vinculo**;
 * - **`missing_to_publish` e a MESMA lista que recusa a publicacao**: duas
 *   definicoes de "completo" e o defeito que o ADR-0023 secao 2 proibe.
 */
import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { comoData } from '../../../shared/time/clock.js';
import type { Instant } from '../../../shared/types/brands.js';
import {
  comoEtag,
  errosDaFalta,
  errosDaUf,
  errosDeTexto,
  errosDoTelefone,
  faltasParaPublicar,
  ORDEM_DA_FALTA,
  ORIGEM_DO_PAINEL,
  planejarEdicao,
  projetarEntradaAdministrativa,
  retratoDaEntrada,
  STATUS_INICIAL,
  TITULARIDADE_DO_PAINEL,
  type EntradaAdministrativa,
} from './escrita-do-diretorio.js';

// `comoData` e nao `new Date(...)`: dominio nao constroi tempo real, e a regra
// de arquitetura reprova a construcao direta tambem no teste. As tres marcas
// vem de constantes, que e o que um teste de regra precisa.
const NASCEU_EM = Date.UTC(2026, 8, 30, 12, 0, 0) as Instant;
const NO_AR_DESDE = Date.UTC(2026, 9, 1, 12, 0, 0) as Instant;
const MEXERAM_EM = Date.UTC(2026, 9, 2, 12, 0, 0) as Instant;

const COMPLETA: EntradaAdministrativa = {
  slug: 'clinica-sao-jorge',
  kind: 'clinic',
  entityKind: 'professional',
  displayName: 'Clínica Veterinária São Jorge',
  about: null,
  city: 'São Paulo',
  state: 'SP',
  neighborhood: 'Vila Mariana',
  // O endereco de rua existe na entrada desde 18/10/2026 e e OPCIONAL: esta
  // fixa o deixa nulo de proposito, porque uma entrada sem endereco tem de
  // continuar completa para publicar.
  postalCode: null,
  street: null,
  streetNumber: null,
  complement: null,
  phoneE164: '+551130612200',
  status: 'published',
  source: 'import',
  claimStatus: 'unclaimed',
  verificacoes: [{ evidenceKind: 'cnpj', decision: 'approved' }],
  publishedAt: comoData(NO_AR_DESDE),
  createdAt: comoData(NASCEU_EM),
  updatedAt: comoData(MEXERAM_EM),
  version: 3,
};

const RASCUNHO_INCOMPLETO: EntradaAdministrativa = {
  ...COMPLETA,
  slug: 'passeios-da-bia',
  kind: 'walker',
  displayName: 'Passeios da Bia',
  city: null,
  state: null,
  phoneE164: null,
  status: 'draft',
  verificacoes: [],
  publishedAt: null,
};

void describe('como a entrada do painel nasce', () => {
  void it('nasce rascunho, sem titular e por importacao', () => {
    // Os tres valores andam juntos: sao os unicos que o CHECK
    // `professionals_aceite_antes_do_perfil` admite sem titular.
    assert.equal(STATUS_INICIAL, 'draft');
    assert.equal(ORIGEM_DO_PAINEL, 'import');
    assert.equal(TITULARIDADE_DO_PAINEL, 'unclaimed');
  });
});

void describe('o que falta para publicar', () => {
  void it('nada falta numa entrada completa', () => {
    assert.deepEqual(faltasParaPublicar(COMPLETA), []);
  });

  void it('nomeia as tres faltas do rascunho, na ordem do formulario', () => {
    assert.deepEqual(faltasParaPublicar(RASCUNHO_INCOMPLETO), ['city', 'state', 'phone_e164']);
  });

  void it('acusa a falta de endereco publico', () => {
    // A coluna aceita nulo, e a massa de qa pode ter linha sem endereco.
    const semSlug = { ...COMPLETA, slug: null as unknown as string };
    assert.deepEqual(faltasParaPublicar(semSlug), ['slug']);
  });

  void it('a lista respeita ORDEM_DA_FALTA, e nao a ordem em que o codigo testa', () => {
    const todas = faltasParaPublicar({ slug: null as unknown as string, city: null, state: null, phoneE164: null });
    assert.deepEqual(todas, [...ORDEM_DA_FALTA]);
  });

  void it('o que a edicao vai gravar conta: preencher no corpo tira a falta', () => {
    const faltas = faltasParaPublicar(RASCUNHO_INCOMPLETO, {
      city: 'Campinas',
      state: 'SP',
      phone_e164: '+551932312200',
    });
    assert.deepEqual(faltas, []);
  });

  void it('`null` no corpo APAGA, e cria falta onde nao havia', () => {
    assert.deepEqual(faltasParaPublicar(COMPLETA, { city: null }), ['city']);
  });

  void it('cada falta vira um erro de campo com `code: required`', () => {
    const erros = errosDaFalta(['state', 'city']);
    assert.deepEqual(
      erros.map((e) => [e.field, e.code]),
      [
        ['city', 'required'],
        ['state', 'required'],
      ],
    );
  });
});

void describe('planejarEdicao', () => {
  void it('editar NAO despublica: sem `status` no corpo o estado nao muda', () => {
    const r = planejarEdicao(COMPLETA, { phone_e164: '+551130610000' });
    assert.ok(r.ok);
    assert.equal(r.plano.statusResultante, 'published');
  });

  void it('nao regrava o marco quando a entrada JA estava publicada', () => {
    const r = planejarEdicao(COMPLETA, { display_name: 'Outro nome' });
    assert.ok(r.ok);
    assert.equal(r.plano.gravaMarcoDePublicacao, false);
  });

  void it('grava o marco SO na transicao para publicado', () => {
    const r = planejarEdicao(
      { ...RASCUNHO_INCOMPLETO, city: 'Campinas', state: 'SP', phoneE164: '+551932312200' },
      { status: 'published' },
    );
    assert.ok(r.ok);
    assert.equal(r.plano.gravaMarcoDePublicacao, true);
  });

  void it('recusa a edicao que QUEBRARIA a publicacao, nomeando os campos', () => {
    const r = planejarEdicao(COMPLETA, { city: null, phone_e164: null });
    assert.equal(r.ok, false);
    if (r.ok) return;
    assert.deepEqual(
      r.erros.map((e) => e.field),
      ['city', 'phone_e164'],
    );
  });

  void it('recusa publicar um rascunho incompleto, com a MESMA lista de `missing_to_publish`', () => {
    const r = planejarEdicao(RASCUNHO_INCOMPLETO, { status: 'published' });
    assert.equal(r.ok, false);
    if (r.ok) return;
    assert.deepEqual(
      r.erros.map((e) => e.field),
      faltasParaPublicar(RASCUNHO_INCOMPLETO),
    );
  });

  void it('despublicar e explicito e NAO exige completude', () => {
    // Tirar do ar uma entrada que perdeu dado nao pode ser bloqueado: seria
    // obrigar o operador a completar a entrada para poder retira-la.
    const r = planejarEdicao({ ...COMPLETA, city: null }, { status: 'hidden' });
    assert.ok(r.ok);
    assert.equal(r.plano.statusResultante, 'hidden');
  });

  void it('remover tambem passa com entrada incompleta', () => {
    const r = planejarEdicao({ ...COMPLETA, phoneE164: null }, { status: 'removed' });
    assert.ok(r.ok);
  });
});

void describe('forma dos campos', () => {
  void it('mede o texto APARADO, porque e aparado que ele e gravado', () => {
    assert.deepEqual(errosDeTexto('display_name', '  a  ', 2, 120).map((e) => e.code), ['length']);
    assert.deepEqual(errosDeTexto('display_name', '  ab  ', 2, 120), []);
  });

  void it('a UF e duas letras, e nada mais', () => {
    assert.deepEqual(errosDaUf('state', 'SP'), []);
    assert.deepEqual(errosDaUf('state', ' sp '), []);
    assert.deepEqual(errosDaUf('state', 'S1').map((e) => e.code), ['uf_invalid']);
    assert.deepEqual(errosDaUf('state', 'SPO').map((e) => e.code), ['uf_invalid']);
  });

  void it('o telefone e E.164, com a MESMA forma do CHECK do banco', () => {
    assert.deepEqual(errosDoTelefone('phone_e164', '+551130612200'), []);
    // Sem `+`, com zero depois do `+`, ou curto demais: recusados.
    assert.deepEqual(errosDoTelefone('phone_e164', '1130612200').map((e) => e.code), ['phone_invalid']);
    assert.deepEqual(errosDoTelefone('phone_e164', '+0511306122').map((e) => e.code), ['phone_invalid']);
    assert.deepEqual(errosDoTelefone('phone_e164', '+5511').map((e) => e.code), ['phone_invalid']);
  });

  void it('aceita telefone de fora do Brasil: o diretorio nao promete so brasileiros', () => {
    assert.deepEqual(errosDoTelefone('phone_e164', '+351211234567'), []);
  });
});

void describe('projecao', () => {
  void it('nao carrega `id`, coordenada, documento nem vinculo', () => {
    const projetada = projetarEntradaAdministrativa(COMPLETA) as unknown as Record<string, unknown>;
    for (const proibido of ['id', 'geo', 'cnpj', 'crmv_number', 'crmv_uf', 'claimed_by_user_id', 'verification_level']) {
      assert.equal(proibido in projetada, false, `${proibido} nao pode sair na resposta`);
    }
  });

  void it('deriva a verificacao das provas aprovadas, e nao de uma coluna', () => {
    const projetada = projetarEntradaAdministrativa(COMPLETA);
    assert.equal(projetada.verification.level, 'document_verified');
    assert.deepEqual(projetada.verification.evidence_kinds, ['cnpj']);
  });

  void it('`missing_to_publish` vem vazio quando nada falta', () => {
    assert.deepEqual(projetarEntradaAdministrativa(COMPLETA).missing_to_publish, []);
  });

  void it('`published_at` nulo e um resultado, e nao `created_at`', () => {
    const projetada = projetarEntradaAdministrativa(RASCUNHO_INCOMPLETO);
    assert.equal(projetada.published_at, null);
    assert.equal(projetada.created_at, comoData(NASCEU_EM).toISOString());
  });

  void it('o ETag e a versao entre aspas', () => {
    assert.equal(comoEtag(3), '"3"');
  });
});

void describe('retrato da trilha', () => {
  void it('nao carrega marca de tempo nem versao', () => {
    // As duas mudam em TODA escrita, e deixa-las aqui faria a diferenca
    // antes/depois acusar mudanca em toda linha da trilha.
    const retrato = retratoDaEntrada(COMPLETA);
    assert.equal('updated_at' in retrato, false);
    assert.equal('version' in retrato, false);
    assert.equal(retrato['status'], 'published');
  });
});
