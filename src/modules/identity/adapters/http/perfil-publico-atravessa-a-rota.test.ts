import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import type { AuditLog } from '../../../audit/ports/audit-log.js';
import { carregarContrato } from '../../../../shared/http/contract.js';
import { criarServidor } from '../../../../shared/http/server.js';
import type { RegistradorDeRotas } from '../../../../shared/http/registrar-rota.js';
import { tetoDeTeste } from '../../../../shared/http/teto-de-teste.js';
import type { AbsoluteUrl, Instant, UserId } from '../../../../shared/types/brands.js';
import { dataFixa, INSTANTE_FIXO, relogioParado } from '../../../../shared/time/relogio-de-teste.js';
import { criarAuthService } from '../../application/auth-service.js';
import type {
  CamposDoPerfil,
  Conta,
  FotoDoPerfil,
  IdentityRepository,
} from '../../ports/identity-repository.js';
import type { Mailer } from '../../ports/mailer.js';
import type { TokenSigner } from '../../ports/token-signer.js';
import { RepositorioQueRecusaTudo } from '../persistence/repositorio-que-recusa-tudo-de-teste.js';
import { registrarRotasDeIdentidade, type DependenciasDasRotas } from './routes.js';

const DONA = 'a1b2c3d4-0000-7000-8000-000000000001' as UserId;
const TOKEN = 'acesso-da-dona';
const PROBLEM_BASE_URL = 'https://api.exemplo.invalid/problems' as AbsoluteUrl;

function conta(displayName: string | null, apelido: string | null, perfilPublico: boolean): Conta {
  return {
    id: DONA,
    email: 'marina@exemplo.com.br',
    emailVerifiedAt: null,
    displayName,
    handle: apelido,
    phoneE164: null,
    phoneVerifiedAt: null,
    referencePostalCode: null,
    referenceNeighborhood: null,
    referenceCity: null,
    referenceState: null,
    pendingEmail: null,
    emailDeliverable: true,
    publicProfileEnabled: perfilPublico,
    status: 'active',
    sessionsInvalidBefore: 0 as Instant,
    createdAt: dataFixa(INSTANTE_FIXO),
  };
}

interface Bancada {
  readonly app: RegistradorDeRotas;
  readonly fotosTrocadas: (string | null)[];
  readonly camposGravados: CamposDoPerfil[];
}

function montar(apelidoAtual: string | null): Bancada {
  const fotosTrocadas: (string | null)[] = [];
  const camposGravados: CamposDoPerfil[] = [];
  const nome = 'Marina';
  let apelido = apelidoAtual;
  let perfilPublico = false;

  const repositorio: IdentityRepository = new (class extends RepositorioQueRecusaTudo {
    protected recusar(porta: string): never {
      throw new assert.AssertionError({
        message:
          `a rota chamou \`${porta}\`, que esta bancada nao implementa. Ou a rota passou ` +
          'a fazer trabalho novo, ou o dublê ficou atras dela.',
      });
    }
    override buscarContaPorId(): Promise<Conta | undefined> {
      return Promise.resolve(conta(nome, apelido, perfilPublico));
    }
    override trocarFotoDoPerfil(_id: UserId, uploadId: string | null): Promise<Conta | undefined> {
      fotosTrocadas.push(uploadId);
      return Promise.resolve(conta(nome, apelido, perfilPublico));
    }
    /**
     * **O duble GRAVA**, e e isso que faz este arquivo medir a travessia inteira:
     * o que ele devolve e lido de volta pela projecao da resposta, entao um
     * campo que a rota descartasse apareceria como `false` no corpo do `200`.
     */
    override atualizarPerfil(_id: UserId, campos: CamposDoPerfil): Promise<Conta | undefined> {
      camposGravados.push(campos);
      if (campos.handle !== undefined) apelido = campos.handle;
      if (campos.publicProfileEnabled !== undefined) perfilPublico = campos.publicProfileEnabled;
      return Promise.resolve(conta(nome, apelido, perfilPublico));
    }
    override fotoDoPerfil(): Promise<FotoDoPerfil | null> {
      return Promise.resolve(
        fotosTrocadas.length === 0
          ? null
          : { status: 'processing' as const, publicKey: null, rejectionReason: null },
      );
    }
  })();

  const trilha: AuditLog = {
    record: () => Promise.resolve(),
  };
  const mailer: Mailer = {
    enviar: () => {
      throw new Error('nenhum caso deste arquivo manda e-mail');
    },
  };
  const assinador: TokenSigner = {
    emitir: (_sub, agora, jti) => ({
      token: TOKEN,
      expiresInSeconds: 900,
      issuedAt: Math.floor(agora / 1000),
      jti,
    }),
    verificar: (token) =>
      token === TOKEN
        ? {
            ok: true as const,
            claims: {
              sub: DONA,
              iss: 'https://api.bichu.test',
              aud: 'https://api.bichu.test',
              iat: Math.floor(INSTANTE_FIXO / 1000),
              exp: Math.floor(INSTANTE_FIXO / 1000) + 900,
              jti: 'jti-1',
            },
          }
        : { ok: false as const, motivo: 'malformado' as const },
    jwks: () => [],
  };

  const auth = criarAuthService({
    urlDeMidia: (chave: string) => `https://midia.invalido/${chave}`,
    removerPushDaConta: () => Promise.resolve(0),
    apagarLocalizacaoDaSessao: () => Promise.resolve(0),
    repositorio,
    assinador,
    trilha,
    ids: {
      uuidv7: () => 'a1b2c3d4-0000-7000-8000-0000000000ff',
      opaqueToken: () => {
        throw new Error('nao usado');
      },
      random128: () => new Uint8Array(16),
      random80: () => new Uint8Array(10),
    },
    clock: relogioParado(INSTANTE_FIXO),
    janelas: {
      idleTtlSeconds: 30 * 86_400,
      staySignedInIdleTtlSeconds: 180 * 86_400,
      absoluteTtlSeconds: 180 * 86_400,
    },
    hmacDeIp: () => null,
    avisarTitular: () => Promise.resolve(),
    mailer,
    registrarOcorrencia: () => {
      // Nenhum caso deste arquivo afirma log.
    },
    baseDaWeb: 'https://bichu.test' as AbsoluteUrl,
  });

  const app = criarServidor({
    problemBaseUrl: PROBLEM_BASE_URL,
    isProduction: false,
    teto: tetoDeTeste(),
    reautenticacao: () => {
      throw new Error('nenhum caso deste arquivo exercita X-Reauth-Token');
    },
  });

  const deps: DependenciasDasRotas = {
    auth,
    assinador,
    contrato: carregarContrato('api/openapi.yaml'),
    issuer: 'https://api.bichu.test',
    apiBaseUrl: 'https://api.bichu.test',
    urlDeMidia: (chave: string) => `https://midia.invalido/${chave}`,
  };
  void app.register(
    (escopo, _opcoes, pronto) => {
      registrarRotasDeIdentidade(escopo, deps);
      pronto();
    },
    { prefix: '/v1' },
  );
  return { app, fotosTrocadas, camposGravados };
}

function patchDoPerfil(bancada: Bancada, corpo: Record<string, unknown>) {
  return bancada.app.inject({
    method: 'PATCH',
    url: '/v1/me',
    headers: { authorization: `Bearer ${TOKEN}`, 'content-type': 'application/json' },
    payload: corpo,
  });
}

void describe('`public_profile_enabled` ATRAVESSA a rota (02/11/2026)', () => {
  /**
   * **POR QUE ESTE ARQUIVO EXISTE.**
   *
   * Este repositorio tem quatro casos medidos de atributo declarado que nada le:
   * `x-audit` que nao gravava, `ImageCrop` que o servidor descartava, `on_exceed`
   * que so escrevia no log e `challenge` que nao desafiava. Um campo novo em
   * `MeUpdate` e exatamente a forma de produzir o quinto: o esquema do contrato
   * ACEITA o corpo, a rota nao mapeia o campo, o `PATCH` responde `200`, e o
   * interruptor que o contrato promete nao liga nada.
   *
   * O que o caso abaixo mede nao e a validacao: e a TRAVESSIA. Sem a linha de
   * mapeamento em `routes.ts` ele reprova no `camposGravados`.
   */
  void it('o campo chega aos campos gravados e volta no corpo do 200', async () => {
    const bancada = montar('marina');

    const resposta = await patchDoPerfil(bancada, { public_profile_enabled: true });

    assert.equal(resposta.statusCode, 200);
    assert.deepEqual(
      bancada.camposGravados,
      [{ publicProfileEnabled: true }],
      'o corpo trouxe `public_profile_enabled` e a rota NAO o repassou. O contrato ' +
        'prometeria um interruptor que nao liga nada -- a mesma classe de defeito de ' +
        '`ImageCrop` e `x-audit`.',
    );
    assert.equal(
      resposta.json<{ public_profile_enabled: boolean }>().public_profile_enabled,
      true,
      'a resposta nao devolveu o estado novo: a tela nao teria como desenhar o interruptor',
    );
  });

  void it('ausente nao mexe: o `PATCH` de outro campo nao desliga o perfil publico', async () => {
    const bancada = montar('marina');

    const resposta = await patchDoPerfil(bancada, { display_name: 'Marina Silva' });

    assert.equal(resposta.statusCode, 200);
    assert.deepEqual(
      bancada.camposGravados,
      [{ displayName: 'Marina Silva' }],
      '`publicProfileEnabled` entrou num `PATCH` que nao o mencionou: campo ausente de ' +
        'um `PATCH` significa "nao mexer", e mandar `undefined` como `false` desligaria ' +
        'o perfil de quem so trocou o nome',
    );
  });

  void it('`false` DESLIGA, e false nao e ausente', async () => {
    const bancada = montar('marina');

    const resposta = await patchDoPerfil(bancada, { public_profile_enabled: false });

    assert.equal(resposta.statusCode, 200);
    assert.deepEqual(
      bancada.camposGravados,
      [{ publicProfileEnabled: false }],
      '`false` foi tratado como ausente: a pessoa nao teria como DESLIGAR o perfil, e ' +
        'adesao que nao se revoga nao e adesao',
    );
  });
});

void describe('ligar o perfil publico EXIGE apelido', () => {
  void it('conta SEM apelido recebe 400 com o campo e a instrucao, e NADA e gravado', async () => {
    const bancada = montar(null);

    const resposta = await patchDoPerfil(bancada, { public_profile_enabled: true });

    assert.equal(resposta.statusCode, 400);
    assert.deepEqual(
      bancada.camposGravados,
      [],
      'o perfil publico foi gravado por um pedido recusado. O `CHECK` do banco o ' +
        'impediria, mas a pessoa veria erro de servidor em vez de erro de campo',
    );
    assert.deepEqual(
      resposta.json<{ errors?: { field: string; code: string; message?: string }[] }>().errors,
      [
        {
          field: 'public_profile_enabled',
          code: 'public_profile_requires_handle',
          message: 'Escolha um apelido (@) antes de deixar seu perfil público.',
        },
      ],
      'a recusa precisa DIZER o que fazer: `GET /v1/people/{handle}` e a unica forma de ' +
        'alcancar o perfil, entao sem apelido ele nao tem endereco',
    );
  });

  void it('escolher o apelido NO MESMO `PATCH` e a saida do beco', async () => {
    const bancada = montar(null);

    const resposta = await patchDoPerfil(bancada, {
      handle: 'marina-silva',
      public_profile_enabled: true,
    });

    assert.equal(
      resposta.statusCode,
      200,
      'escolher o apelido junto e a saida, e ela nao pode fechar: `atualizarPerfil` grava ' +
        'o apelido na MESMA transacao, antes do `UPDATE` de `users`',
    );
    assert.deepEqual(bancada.camposGravados, [
      { handle: 'marina-silva', publicProfileEnabled: true },
    ]);
  });

  void it('DESLIGAR nao exige apelido: a trava e so para ligar', async () => {
    const bancada = montar(null);

    const resposta = await patchDoPerfil(bancada, { public_profile_enabled: false });

    assert.equal(
      resposta.statusCode,
      200,
      'exigir apelido para DESLIGAR prenderia na visibilidade quem nao tem apelido',
    );
    assert.deepEqual(bancada.camposGravados, [{ publicProfileEnabled: false }]);
  });
});
