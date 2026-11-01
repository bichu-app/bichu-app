import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { hashDeToken } from '../../../shared/crypto/digest.js';
import type { AbsoluteUrl, Instant, OpaqueToken, UserId } from '../../../shared/types/brands.js';
import { dataFixa, INSTANTE_FIXO } from '../../../shared/time/relogio-de-teste.js';
import type { Conta, NovoTokenDeVerificacao } from '../ports/identity-repository.js';
import type { Mailer, Mensagem } from '../ports/mailer.js';
import type { AvisoAoTitular } from './dependencies.js';
import { criarAvisoDeReusoAoTitular } from './aviso-de-reuso.js';

const VITIMA = '0192f3a1-7c2b-7e3d-9a10-6b4c8d2e5f01' as UserId;
const ENDERECO_DA_VITIMA = 'tutora@exemplo.invalid';

const AVISO: AvisoAoTitular = {
  tipo: 'refresh_reuse_detected',
  userId: VITIMA,
  ocorridoEm: INSTANTE_FIXO,
  correlationId: 'corr-do-reuso',
  ipHmac: Buffer.from('hmac-de-quem-reusou'.padEnd(32, '.')),
};

function contaDaVitima(): Conta {
  return {
    id: VITIMA,
    email: ENDERECO_DA_VITIMA,
    emailVerifiedAt: dataFixa(),
    displayName: 'Marina Prado',
    handle: null,
    phoneE164: '+5511987654321',
    phoneVerifiedAt: dataFixa(),
    referencePostalCode: '01310-000',
    referenceNeighborhood: 'Consolação',
    referenceCity: 'São Paulo',
    referenceState: 'SP',
    pendingEmail: null,
    emailDeliverable: true,
    status: 'active',
    sessionsInvalidBefore: 0 as Instant,
    createdAt: dataFixa(),
  };
}

interface Bancada {
  readonly avisar: (aviso: AvisoAoTitular) => Promise<void>;
  readonly enviadas: Mensagem[];
  readonly consultados: UserId[];
  readonly registros: { dados: Record<string, unknown>; mensagem: string }[];
  readonly tokens: NovoTokenDeVerificacao[];
}

const TOKEN_EM_CLARO = 'tokenOpacoDeTrintaEDoisBytesEmBase64Url';
const BASE_DA_WEB = 'https://bichu.exemplo.invalid/' as AbsoluteUrl;

function montar(conta: Conta | undefined): Bancada {
  const enviadas: Mensagem[] = [];
  const consultados: UserId[] = [];
  const registros: { dados: Record<string, unknown>; mensagem: string }[] = [];
  const tokens: NovoTokenDeVerificacao[] = [];

  const mailer: Mailer = {
    enviar(mensagem) {
      enviadas.push(mensagem);
      return Promise.resolve();
    },
  };

  const avisar = criarAvisoDeReusoAoTitular({
    repositorio: {
      buscarContaPorId(id: UserId): Promise<Conta | undefined> {
        consultados.push(id);
        return Promise.resolve(conta);
      },
      criarTokenDeVerificacao(novo: NovoTokenDeVerificacao): Promise<void> {
        tokens.push(novo);
        return Promise.resolve();
      },
    },
    mailer,
    registrarOcorrencia: (dados, mensagem) => {
      registros.push({ dados, mensagem });
    },
    ids: {
      uuidv7: () => '0192f3a1-7c2b-7e3d-9a10-000000000001',
      opaqueToken: () => TOKEN_EM_CLARO as OpaqueToken,
      random128: () => { throw new Error('random128: o aviso de reuso nao usa'); },
      random80: () => { throw new Error('random80: o aviso de reuso nao usa'); },
    },
    baseDaWeb: BASE_DA_WEB,
  });

  return { avisar, enviadas, consultados, registros, tokens };
}

function unicaMensagem(bancada: Bancada): Mensagem {
  assert.equal(bancada.enviadas.length, 1, 'a detecção de reuso manda exatamente um e-mail');
  return bancada.enviadas[0]!;
}

void describe('aviso de reuso de refresh: montagem da mensagem (BICHUS-15, critério 10)', () => {
  void it('escreve para o endereço da conta, com assunto que diz o que aconteceu', async () => {
    const bancada = montar(contaDaVitima());

    await bancada.avisar(AVISO);

    const mensagem = unicaMensagem(bancada);
    assert.equal(mensagem.para, ENDERECO_DA_VITIMA);
    assert.deepEqual(bancada.consultados, [VITIMA]);
    assert.equal(mensagem.assunto, 'Encerramos as sessões da sua conta no Bichu');
  });

  void it('diz no corpo que as sessões foram encerradas e por quê', async () => {
    const bancada = montar(contaDaVitima());

    await bancada.avisar(AVISO);

    const corpo = unicaMensagem(bancada).corpo;
    assert.match(corpo, /encerramos por precaução a sessão que apresentou/i);
    assert.match(corpo, /copiado o acesso da sua conta/i);
    assert.ok(corpo.trim().length > 0, 'corpo vazio é detecção silenciosa com selo de entregue');
  });

  void it('diz à pessoa O QUE FAZER, e não só que algo aconteceu', async () => {
    const bancada = montar(contaDaVitima());

    await bancada.avisar(AVISO);

    const corpo = unicaMensagem(bancada).corpo;
    assert.match(corpo, /entre de novo no aplicativo/i);
    assert.match(corpo, /se não foi você, abra este link/i);
    assert.match(corpo, /encerra TODAS as sessões/i);
    assert.match(corpo, /não pede senha nem login/i);
  });

  void it('não carrega telefone, endereço nem UUID de banco (ADR-0010 item 6, contato mediado)', async () => {
    const conta = contaDaVitima();
    const bancada = montar(conta);

    await bancada.avisar(AVISO);

    const mensagem = unicaMensagem(bancada);
    const tudo = `${mensagem.assunto}\n${mensagem.corpo}`;
    for (const proibido of [
      conta.phoneE164,
      conta.referencePostalCode,
      conta.referenceNeighborhood,
      conta.referenceCity,
      conta.id,
      AVISO.correlationId,
    ]) {
      assert.ok(
        !tudo.includes(proibido as string),
        `a mensagem não pode conter ${proibido as string}`,
      );
    }
    assert.doesNotMatch(tudo, /[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/i);
  });

void it('emite o token do "Não fui eu" e põe o LINK no corpo (BICHUS-215, critério 4)', async () => {
    const bancada = montar(contaDaVitima());

    await bancada.avisar(AVISO);

    assert.equal(bancada.tokens.length, 1, 'um aviso, um link de uso único');
    const token = bancada.tokens[0]!;
    assert.equal(token.proposito, 'session_disavow');
    assert.equal(token.userId, VITIMA);
    assert.equal(token.enviadoPara, ENDERECO_DA_VITIMA);
    assert.equal(token.expiraEm, INSTANTE_FIXO + 7 * 24 * 60 * 60 * 1000);
    assert.deepEqual(token.ipHmac, AVISO.ipHmac);

    assert.match(
      unicaMensagem(bancada).corpo,
      new RegExp(`https://bichu\\.exemplo\\.invalid/nao-fui-eu\\?token=${TOKEN_EM_CLARO}`),
    );
  });

  void it('guarda o HASH do token, nunca o valor em claro', async () => {
    const bancada = montar(contaDaVitima());

    await bancada.avisar(AVISO);

    const token = bancada.tokens[0]!;
    assert.notEqual(token.tokenHash, TOKEN_EM_CLARO);
    assert.deepEqual(token.tokenHash, hashDeToken(TOKEN_EM_CLARO));
    assert.equal(
      token.tokenHash.length,
      32,
      'SHA-256 tem 32 bytes; 44 seria o texto base64 deles',
    );
  });

  void it('o token em claro NÃO aparece em log nenhum (critério 11 das histórias de token)', async () => {
    const bancada = montar(contaDaVitima());

    await bancada.avisar(AVISO);

    const tudoQueFoiRegistrado = JSON.stringify(bancada.registros);
    assert.ok(
      !tudoQueFoiRegistrado.includes(TOKEN_EM_CLARO),
      'o link do "Não fui eu" vazou para o log',
    );
  });

  void it('conta apagada: não emite token nenhum', async () => {
    const bancada = montar(undefined);

    await bancada.avisar(AVISO);

    assert.deepEqual(bancada.tokens, []);
  });

  void it('conta apagada entre a detecção e o aviso: não envia nada', async () => {
    const bancada = montar(undefined);

    await bancada.avisar(AVISO);

    assert.deepEqual(bancada.enviadas, [], 'sem conta não há para quem escrever');
  });

  void it('registra a ocorrência no log mesmo sem conta: quem investiga depois precisa dela', async () => {
    const bancada = montar(undefined);

    await bancada.avisar(AVISO);

    assert.equal(bancada.registros.length, 1);
    assert.deepEqual(bancada.registros[0]?.dados, {
      tipo: 'refresh_reuse_detected',
      correlationId: 'corr-do-reuso',
    });
  });
});
