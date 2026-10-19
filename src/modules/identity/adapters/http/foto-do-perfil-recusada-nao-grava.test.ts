/**
 * `PATCH /v1/me` que recusa por falta de nome **nao grava a foto**.
 *
 * ## O DEFEITO, MEDIDO E NAO SUPOSTO
 *
 * Relato do cliente em 18/10/2026, contra homologacao: *"no perfil do usuario,
 * para subir a foto esta dando erro"*. Medido contra a pilha efemera de
 * integracao, no commit `f8c74714` -- o MESMO que
 * `https://hml.bichu.app/v1/health` reportava --, com uma conta de
 * `display_name` nulo, que e o estado de 2 das 7 contas de homologacao:
 *
 *     POST /v1/media/my-photo-intents
 *     201 {"upload_id":"01a151f1-5e6a-70da-935c-3d6998208ec1",...}
 *
 *     PATCH /v1/me  {"photo_upload_id":"01a151f1-5e6a-70da-935c-3d6998208ec1"}
 *     400 {"errors":[{"field":"display_name","code":"required",
 *          "message":"Diga como voce quer ser chamado para continuar."}]}
 *
 *     GET /v1/me
 *     200 {... "display_name":null, "photo":{"status":"processing","url":null} ...}
 *
 * Leia a terceira resposta junto da segunda: **a foto FICOU gravada depois de o
 * servidor dizer que recusou**. `PATCH /v1/me` faz dois atos em transacoes
 * diferentes -- `trocarMinhaFoto` primeiro, `atualizarMeuPerfil` depois --, e a
 * trava do nome morava so no segundo. O primeiro comitava, o segundo recusava,
 * e o app mostrava "o envio foi recusado" para uma foto que estava no banco.
 *
 * ## A TRAVA NAO FOI AFROUXADA, E ISSO E DELIBERADO
 *
 * A decisao do cliente de 18/10/2026 -- *"nao permitir atualizar o cadastro, se
 * nao tiver algum nome cadastrado"* -- vale para o corpo inteiro, e a foto e
 * cadastro. O conserto e a ORDEM: cobrar a trava ANTES do primeiro ato. A
 * resposta e a mesma 400 que nomeia o campo; o que muda e que nada e escrito.
 *
 * Afrouxar a trava para a foto seria decisao de produto, e nao de
 * implementacao.
 *
 * ## A SAIDA DO BECO E O CASO 2
 *
 * Quem esta sem nome manda `display_name` JUNTO com `photo_upload_id` e passa.
 * Sem esse caso, alguem poderia "consertar" isto cobrando a trava sempre que a
 * conta nao tem nome, inclusive no PATCH que esta preenchendo o nome, e as 2
 * contas de homologacao ficariam presas para sempre.
 *
 * ## ISCA CONFERIDA
 *
 * Em 18/10/2026, tirando a linha `await deps.auth.exigirNomeJaCadastrado(...)`
 * de dentro do `if (corpo.photo_upload_id !== undefined)` de `routes.ts` -- a
 * reproducao exata do defeito --, o caso 1 reprova pelo nome em
 * `trocarFotoDoPerfil`, que e a escrita que nao devia ter acontecido.
 */
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
/** O `upload_id` da medicao de 18/10/2026. */
const UPLOAD = '01a151f1-5e6a-70da-935c-3d6998208ec1';
const PROBLEM_BASE_URL = 'https://api.exemplo.invalid/problems' as AbsoluteUrl;

function conta(displayName: string | null): Conta {
  return {
    id: DONA,
    email: 'marina@exemplo.com.br',
    emailVerifiedAt: null,
    displayName,
    handle: null,
    phoneE164: null,
    phoneVerifiedAt: null,
    referencePostalCode: null,
    referenceNeighborhood: null,
    referenceCity: null,
    referenceState: null,
    pendingEmail: null,
    emailDeliverable: true,
    status: 'active',
    sessionsInvalidBefore: 0 as Instant,
    createdAt: dataFixa(INSTANTE_FIXO),
  };
}

interface Bancada {
  readonly app: RegistradorDeRotas;
  /** Os `upload_id` que `trocarFotoDoPerfil` recebeu. Vazio = nada foi escrito. */
  readonly fotosTrocadas: (string | null)[];
  /** O que `atualizarPerfil` recebeu. */
  readonly camposGravados: CamposDoPerfil[];
}

function montar(nomeAtual: string | null): Bancada {
  const fotosTrocadas: (string | null)[] = [];
  const camposGravados: CamposDoPerfil[] = [];
  let nome = nomeAtual;

  const repositorio: IdentityRepository = new (class extends RepositorioQueRecusaTudo {
    protected recusar(porta: string): never {
      throw new assert.AssertionError({
        message:
          `a rota chamou \`${porta}\`, que esta bancada nao implementa. Ou a rota passou ` +
          'a fazer trabalho novo, ou o dublê ficou atras dela.',
      });
    }
    override buscarContaPorId(): Promise<Conta | undefined> {
      return Promise.resolve(conta(nome));
    }
    override trocarFotoDoPerfil(_id: UserId, uploadId: string | null): Promise<Conta | undefined> {
      fotosTrocadas.push(uploadId);
      return Promise.resolve(conta(nome));
    }
    override atualizarPerfil(_id: UserId, campos: CamposDoPerfil): Promise<Conta | undefined> {
      camposGravados.push(campos);
      if (campos.displayName !== undefined) nome = campos.displayName;
      return Promise.resolve(conta(nome));
    }
    override fotoDoPerfil(): Promise<FotoDoPerfil | null> {
      // A foto como a medicao de 18/10/2026 a leu depois do 400: `processing`.
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

void describe('`PATCH /v1/me` recusado por falta de nome não grava a foto (defeito de 18/10/2026)', () => {
  void it('ISCA: conta SEM nome mandando só `photo_upload_id` recebe 400 e a foto NÃO é trocada', async () => {
    const bancada = montar(null);

    const resposta = await patchDoPerfil(bancada, { photo_upload_id: UPLOAD });

    assert.equal(resposta.statusCode, 400, 'a trava do nome vale para o corpo inteiro');
    assert.deepEqual(
      bancada.fotosTrocadas,
      [],
      'a foto foi gravada por um pedido que o servidor recusou. É o defeito medido em ' +
        '18/10/2026: o `PATCH` devolvia 400 `display_name required` e o `GET /v1/me` ' +
        'seguinte já trazia `photo.status: "processing"` -- o app dizia "o envio foi ' +
        'recusado" e a foto estava no banco. A trava precisa ser cobrada ANTES do ' +
        'primeiro ato, porque os dois atos estão em transações diferentes.',
    );
    assert.deepEqual(bancada.camposGravados, [], 'nem a foto nem os campos');

    const corpo = resposta.json<{ errors?: { field: string; code: string; message?: string }[] }>();
    assert.deepEqual(
      corpo.errors,
      [
        {
          field: 'display_name',
          code: 'required',
          message: 'Diga como você quer ser chamado para continuar.',
        },
      ],
      'a recusa precisa DIZER o que preencher: "erro" não é instrução, e é por isso ' +
        'que o campo e a mensagem fazem parte da asserção.',
    );
  });

  void it('a conta SEM nome que manda `display_name` JUNTO com a foto é aceita (a saída do beco)', async () => {
    const bancada = montar(null);

    const resposta = await patchDoPerfil(bancada, {
      display_name: 'Marina',
      photo_upload_id: UPLOAD,
    });

    assert.equal(resposta.statusCode, 200, 'preencher o nome é a saída, e ela não pode fechar');
    assert.deepEqual(bancada.fotosTrocadas, [UPLOAD], 'a foto foi trocada');
    assert.deepEqual(
      bancada.camposGravados.map((c) => c.displayName),
      ['Marina'],
      'e o nome foi gravado no mesmo pedido',
    );
  });

  void it('a conta COM nome continua trocando a foto num `PATCH` só com `photo_upload_id`', async () => {
    const bancada = montar('Marina');

    const resposta = await patchDoPerfil(bancada, { photo_upload_id: UPLOAD });

    // O caminho normal, que é o que o app manda ao subir a foto do perfil
    // (`gravarFotoDoUsuario`). Sem este caso, "consertar" o anterior recusando
    // todo `PATCH` de foto deixaria a suíte verde com a foto quebrada para
    // todo mundo.
    assert.equal(resposta.statusCode, 200);
    assert.deepEqual(bancada.fotosTrocadas, [UPLOAD]);
  });
});
