/** As cinco amarras da janela de reautenticação, sem banco e sem servidor. */
import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import type { Instant } from '../../../shared/types/brands.js';
import {
  conferirJanela,
  expiracaoDaJanela,
  JANELA_DE_REAUTENTICACAO_EM_SEGUNDOS,
  type ApresentacaoDaJanela,
  type JanelaDeReautenticacao,
} from './reautenticacao.js';

const AGORA = 1_800_000_000_000 as Instant;
const DONO = '018f3a2b-0000-7000-8000-0000000000aa';
const OUTRA_CONTA = '018f3a2b-0000-7000-8000-0000000000bb';
const JTI = '018f3a2b-0000-7000-8000-00000000cc01';
const OUTRO_JTI = '018f3a2b-0000-7000-8000-00000000cc02';

/** Uma barreira bem antiga: nenhum caso abaixo é recusado por ela sem pedir. */
const BARREIRA_VELHA = (AGORA - 90 * 24 * 60 * 60 * 1000) as Instant;

const janelaBoa: JanelaDeReautenticacao = {
  id: '018f3a2b-0000-7000-8000-00000000dd01',
  userId: DONO,
  escopo: 'session_revocation',
  acessoJti: JTI,
  emitidaEm: (AGORA - 60_000) as Instant,
  expiraEm: (AGORA + 240_000) as Instant,
  consumidaEm: null,
};

const apresentacaoBoa: ApresentacaoDaJanela = {
  userId: DONO,
  escopoExigido: 'session_revocation',
  acessoJti: JTI,
  barreiraDaConta: BARREIRA_VELHA,
  agora: AGORA,
};

void describe('a janela de reautenticação dura 300 segundos, e o número mora num lugar só', () => {
  void it('300 segundos, como o critério 10 e o contrato dizem', () => {
    assert.equal(JANELA_DE_REAUTENTICACAO_EM_SEGUNDOS, 300);
  });

  void it('`expiracaoDaJanela` conta a partir da emissão, e não do relógio de quem pergunta', () => {
    assert.equal(expiracaoDaJanela(AGORA), AGORA + 300_000);
  });
});

void describe('a janela boa vale', () => {
  void it('senha conferida, escopo certo, mesma sessão, dentro do prazo: vale', () => {
    assert.deepEqual(conferirJanela(janelaBoa, apresentacaoBoa), { vale: true });
  });
});

void describe('cada amarra recusa sozinha, e nomeia o motivo', () => {
  /** Cada linha muda **uma** coisa em relação ao caso que vale. */
  const casos: readonly {
    nome: string;
    janela?: Partial<JanelaDeReautenticacao>;
    apresentacao?: Partial<ApresentacaoDaJanela>;
    motivo: string;
  }[] = [
    {
      nome: 'expirada por um milissegundo',
      janela: { expiraEm: AGORA },
      motivo: 'expirada',
    },
    {
      nome: 'aberta para revogar a tag, apresentada para derrubar as sessões',
      janela: { escopo: 'tag_revocation' },
      motivo: 'escopo_diferente',
    },
    {
      nome: 'aberta noutro aparelho da mesma conta',
      apresentacao: { acessoJti: OUTRO_JTI },
      motivo: 'outra_sessao',
    },
    {
      nome: 'já usada uma vez',
      janela: { consumidaEm: (AGORA - 1_000) as Instant },
      motivo: 'ja_consumida',
    },
    {
      nome: 'emitida antes da troca de senha (SEC-006)',
      apresentacao: { barreiraDaConta: AGORA },
      motivo: 'anterior_a_barreira',
    },
    {
      nome: 'de outra conta',
      janela: { userId: OUTRA_CONTA },
      motivo: 'de_outra_conta',
    },
  ];

  for (const caso of casos) {
    void it(`recusa a janela ${caso.nome} com \`${caso.motivo}\``, () => {
      const veredicto = conferirJanela(
        { ...janelaBoa, ...caso.janela },
        { ...apresentacaoBoa, ...caso.apresentacao },
      );
      assert.equal(
        veredicto.vale,
        false,
        `a janela ${caso.nome} foi aceita. A amarra correspondente saiu de \`conferirJanela\`.`,
      );
      assert.equal(veredicto.vale === false ? veredicto.motivo : '', caso.motivo);
    });
  }
});

void describe('os limites de cada comparação, que é onde o defeito mora', () => {
  void it('a janela vale no último milissegundo antes de expirar', () => {
    const veredicto = conferirJanela(
      { ...janelaBoa, expiraEm: (AGORA + 1) as Instant },
      apresentacaoBoa,
    );
    assert.equal(veredicto.vale, true, '`>` virou `>=` e a janela morre um instante cedo demais');
  });

  void it('a janela emitida EXATAMENTE na barreira continua valendo', () => {
    const veredicto = conferirJanela(
      { ...janelaBoa, emitidaEm: AGORA },
      { ...apresentacaoBoa, barreiraDaConta: AGORA },
    );
    assert.equal(veredicto.vale, true);
  });

  void it('a conta errada é vista antes do escopo: a janela alheia nem chega a ser comparada', () => {
    const veredicto = conferirJanela(
      { ...janelaBoa, userId: OUTRA_CONTA, escopo: 'tag_revocation' },
      apresentacaoBoa,
    );
    assert.equal(veredicto.vale === false ? veredicto.motivo : '', 'de_outra_conta');
  });
});
