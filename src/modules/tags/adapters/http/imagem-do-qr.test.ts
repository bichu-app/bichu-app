/**
 * `GET /v1/pets/{petId}/tags/{tagId}/qr.png` e o `qr_png_url` da emissão, pela
 * borda inteira.
 *
 * ## O que esta rota fecha
 *
 * O critério 2 da BICHUS-63 exige que a emissão devolva `code`, `url` **e**
 * `qr_png_url`. Até aqui ela devolvia os dois primeiros, e a ausência do
 * terceiro era deliberada e honesta: `getPetTagQrImage` estava declarada no
 * contrato e não existia em `src/`. O cliente viu os dois lados dessa lacuna no
 * primeiro teste em aparelho (BICHUS-225 e BICHUS-226) — código em texto sem
 * QR, e o botão da tag desabilitado.
 *
 * ## Por que os casos são escritos assim
 *
 * O que se prova aqui é o **efeito**: a resposta é um PNG de verdade, ele
 * decodifica, e o endereço prometido na emissão é o endereço que responde. Um
 * caso que conferisse "`qr_png_url` está presente" ficaria verde apontando para
 * uma rota que responde 404 — que é exatamente a promessa quebrada que o
 * comentário anterior de `tag-routes.ts` existia para não fazer.
 *
 * O último caso é o que amarra os dois: ele **segue** a URL devolvida pela
 * emissão, com o servidor de verdade, em vez de montar o caminho à mão.
 */
import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import * as jsqrModulo from 'jsqr';
import sharp from 'sharp';

import type { RegistradorDeRotas } from '../../../../shared/http/registrar-rota.js';
import type { AuditEvent, AuditLog } from '../../../audit/ports/audit-log.js';
import { carregarContrato } from '../../../../shared/http/contract.js';
import { criarServidor } from '../../../../shared/http/server.js';
import { tetoDeTeste } from '../../../../shared/http/teto-de-teste.js';
import { vigiarParametrosDasRotas } from '../../../../shared/http/validacao-de-parametros.js';
import type { Idempotencia } from '../../../../shared/http/idempotency.js';
import type { Clock, IdGenerator, SecretCipher } from '../../../../shared/ports/index.js';
import type {
  AbsoluteUrl,
  Instant,
  OpaqueToken,
  PetId,
  TagId,
  UserId,
} from '../../../../shared/types/brands.js';
import { criarTagService } from '../../application/tag-service.js';
import { criarRasterizadorDeQr } from '../external/sharp-rasterizador-de-qr.js';
import type { Autenticador } from '../../ports/autenticador.js';
import type { TagParaReimpressao, TagRepository } from '../../ports/tag-repository.js';
import { registrarRotasDeTags, type DependenciasDasRotasDeTag } from './tag-routes.js';

/** Ver a nota de interoperabilidade em `domain/qr-da-tag.test.ts`. */
type Decodificador = (
  pixels: Uint8ClampedArray,
  largura: number,
  altura: number,
) => { readonly data: string } | null;
const jsQR = (jsqrModulo as unknown as { default: Decodificador }).default;

const DONO = '018f3a2b-0000-7000-8000-0000000000aa' as UserId;
const PET = '018f3a2b-0000-7000-8000-0000000000cc' as PetId;
const TAG = '018f3a2b-0000-7000-8000-0000000000dd' as TagId;
const CODIGO_CANONICO = 'GQSM0XHBT4D9G31S';
const AGORA = 1_800_000_000_000 as Instant;
const TOKEN_DE_ACESSO = 'acesso-do-tutor';
const PROBLEM_BASE_URL = 'https://api.exemplo.invalid/problems' as AbsoluteUrl;
const BASE_DA_TAG = 'https://tag.exemplo.invalido' as AbsoluteUrl;
const BASE_DA_API = 'https://api.exemplo.invalido';

function naoUsado(nome: string): never {
  throw new Error(`o dublê não implementa ${nome}: nenhum caso deste arquivo chega aqui`);
}

interface Bancada {
  readonly app: RegistradorDeRotas;
  /** Quais argumentos chegaram à consulta vinculada, em ordem. */
  readonly buscas: { petId: PetId; tagId: TagId; dono: UserId }[];
  /** A conferência de subida. Chamar depois de as rotas existirem. */
  readonly conferirParametros: () => void;
}

function montar(reimpressao: TagParaReimpressao | undefined): Bancada {
  const buscas: { petId: PetId; tagId: TagId; dono: UserId }[] = [];
  /**
   * O cifrado que a EMISSÃO gravou.
   *
   * Sem isto a bancada devolveria um cifrado fixo, e o caso que compara `url`
   * com o conteúdo do QR compararia dois códigos diferentes — ele reprovaria
   * dizendo a verdade sobre a bancada e mentindo sobre o código. O repositório
   * de verdade devolve o que foi gravado, e aqui também.
   */
  let cifradoGravado: Uint8Array | undefined;

  const repositorio: TagRepository = {
    resolverPorCodigo: () => naoUsado('resolverPorCodigo'),
    buscarContextoDoDono: () => naoUsado('buscarContextoDoDono'),
    listarTagsDoPet: () => naoUsado('listarTagsDoPet'),
    buscarParaReimpressao: (petId, tagId, dono) => {
      buscas.push({ petId, tagId, dono });
      if (reimpressao === undefined) return Promise.resolve(undefined);
      if (dono !== DONO || petId !== PET || tagId !== TAG) return Promise.resolve(undefined);
      if (cifradoGravado === undefined) return Promise.resolve(reimpressao);
      return Promise.resolve({ ...reimpressao, codeCiphertext: cifradoGravado });
    },
    emitir: (nova) => {
      cifradoGravado = nova.codeCiphertext;
      return Promise.resolve({
        tipo: 'emitida',
        tag: {
          id: TAG,
          status: 'active',
          codeSuffix: nova.codeSuffix,
          label: nova.label,
          scanCount: 0,
          lastScannedAt: null,
          revokedAt: null,
          revocationReason: null,
          createdAt: new Date(AGORA),
        },
      });
    },
    registrarScan: () => Promise.resolve(),
    registrarAviso: () => Promise.resolve(),
    avisoRecenteDoMesmoAchador: () => Promise.resolve(undefined),
    jaAvisouRecentemente: () => Promise.resolve(false),
  };

  const eventos: AuditEvent[] = [];
  const trilha: AuditLog = {
    record: (evento) => {
      eventos.push(evento);
      return Promise.resolve();
    },
  };
  const clock: Clock = { now: () => AGORA };
  const ids: IdGenerator = {
    uuidv7: () => '018f3a2b-0000-7000-8000-000000000001',
    opaqueToken: () => 'token' as OpaqueToken,
    random128: () => new Uint8Array(16).fill(0x2b),
    random80: () => new Uint8Array(10).fill(0x2b),
  };
  const cifra: SecretCipher = {
    encrypt: (texto) => Promise.resolve(new TextEncoder().encode(texto)),
    decrypt: (bytes) => Promise.resolve(new TextDecoder().decode(bytes)),
  };

  const tags = criarTagService({
    repositorio,
    cifra,
    ids,
    clock,
    trilha,
    baseDaTag: BASE_DA_TAG,
    baseDaWeb: 'https://exemplo.invalido' as AbsoluteUrl,
    chaveDoIndiceDoCodigo: Buffer.alloc(32, 0x5e),
   rasterizador: criarRasterizadorDeQr(),
  });

  const autenticador: Autenticador = {
    autenticar: (token) =>
      token === TOKEN_DE_ACESSO
        ? Promise.resolve({ userId: DONO })
        : Promise.reject(new Error('token desconhecido')),
  };

  const idempotencia: Idempotencia = {
    reservar: () => Promise.resolve(undefined),
    concluir: () => Promise.resolve(),
    liberar: () => Promise.resolve(),
  };

  const app = criarServidor({
    problemBaseUrl: PROBLEM_BASE_URL,
    isProduction: false,
    teto: tetoDeTeste(),
  });

  const deps: DependenciasDasRotasDeTag = {
    tags,
    autenticador,
    idempotencia,
    contrato: carregarContrato('api/openapi.yaml'),
    clock,
    ipHmacKey: Buffer.alloc(32, 7),
    chaveDoIndiceDoCodigo: Buffer.alloc(32, 0x5e),
    baseDaApi: BASE_DA_API,
  };

  // O mesmo par de `src/bin/api.ts`: o gancho `onRoute` instala `schema.params`
  // a partir do contrato, e sem ele esta bancada não exercitaria a validação de
  // parâmetro que a rota de verdade recebe. Uma bancada que registra a rota sem
  // a fiação da borda mede outra coisa e diz que mediu esta.
  const conferirParametros = vigiarParametrosDasRotas(app, deps.contrato, '/v1');

  void app.register(
    (escopo, _opcoes, pronto) => {
      registrarRotasDeTags(escopo, deps);
      pronto();
    },
    { prefix: '/v1' },
  );

  return { app, buscas, conferirParametros };
}

function ativa(): TagParaReimpressao {
  return { status: 'active', codeCiphertext: new TextEncoder().encode(CODIGO_CANONICO) };
}

async function decodificar(png: Buffer): Promise<string | undefined> {
  const { data, info } = await sharp(png)
    .ensureAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true });
  const lido = jsQR(new Uint8ClampedArray(data), info.width, info.height);
  return lido === null ? undefined : lido.data;
}

void describe('getPetTagQrImage: a imagem para mandar imprimir', () => {
  void it('devolve 200 com um PNG que decodifica para a URL da plaquinha', async () => {
    const bancada = montar(ativa());

    const resposta = await bancada.app.inject({
      method: 'GET',
      url: `/v1/pets/${PET}/tags/${TAG}/qr.png`,
      headers: { authorization: `Bearer ${TOKEN_DE_ACESSO}` },
    });

    assert.equal(resposta.statusCode, 200);
    assert.equal(resposta.headers['content-type'], 'image/png');

    // O que sai da rota é entregue a um decodificador independente. Conferir só
    // o `content-type` e o tamanho do corpo aprovaria uma imagem ilegível, que
    // é o defeito que só aparece depois de impresso.
    const lido = await decodificar(resposta.rawPayload);
    assert.equal(lido, `${BASE_DA_TAG}/t/${CODIGO_CANONICO}`);
  });

  void it('a autorização chega à consulta com o dono do token, e não do caminho', async () => {
    const bancada = montar(ativa());

    await bancada.app.inject({
      method: 'GET',
      url: `/v1/pets/${PET}/tags/${TAG}/qr.png`,
      headers: { authorization: `Bearer ${TOKEN_DE_ACESSO}` },
    });

    assert.deepEqual(bancada.buscas, [{ petId: PET, tagId: TAG, dono: DONO }]);
  });

  void it('sem token é 401, e a consulta nunca acontece', async () => {
    const bancada = montar(ativa());

    const resposta = await bancada.app.inject({
      method: 'GET',
      url: `/v1/pets/${PET}/tags/${TAG}/qr.png`,
    });

    assert.equal(resposta.statusCode, 401);
    assert.deepEqual(bancada.buscas, []);
  });

  void it('tag que não é do chamador responde 404, nunca 403 (ADR-0021)', async () => {
    const bancada = montar(undefined);

    const resposta = await bancada.app.inject({
      method: 'GET',
      url: `/v1/pets/${PET}/tags/${TAG}/qr.png`,
      headers: { authorization: `Bearer ${TOKEN_DE_ACESSO}` },
    });

    assert.equal(resposta.statusCode, 404);
    assert.equal(resposta.headers['content-type'], 'application/problem+json; charset=utf-8');
  });

  void it('tag revogada responde 410: o QR não é reimpresso', async () => {
    const bancada = montar({ status: 'revoked', codeCiphertext: null });

    const resposta = await bancada.app.inject({
      method: 'GET',
      url: `/v1/pets/${PET}/tags/${TAG}/qr.png`,
      headers: { authorization: `Bearer ${TOKEN_DE_ACESSO}` },
    });

    assert.equal(resposta.statusCode, 410);
  });

  void it('`petId` que não é UUID é 400, e não 500 vindo do banco', async () => {
    const bancada = montar(ativa());

    const resposta = await bancada.app.inject({
      method: 'GET',
      url: `/v1/pets/nao-e-uuid/tags/${TAG}/qr.png`,
      headers: { authorization: `Bearer ${TOKEN_DE_ACESSO}` },
    });

    // O 400 vem do `schema.params` que o contrato instala por `onRoute`, e é
    // por isso que esta operação precisou declarar `400` em `api/openapi.yaml`:
    // sem a declaração a aplicação nem sobe.
    assert.equal(resposta.statusCode, 400);
    assert.deepEqual(bancada.buscas, []);
  });

  void it('a conferência de subida aprova a rota: o contrato declara o 400 dela', async () => {
    const bancada = montar(ativa());
    await bancada.app.ready();

    // `vigiarParametrosDasRotas` DERRUBA a subida quando uma operação cujos
    // parâmetros podem recusar não declara 400 — e `petId`/`tagId` declaram
    // `format: uuid`, então esta pode recusar. Apagar o
    // `400: { $ref: ... ValidationFailed }` de `getPetTagQrImage` em
    // `api/openapi.yaml` reprova aqui, na máquina de quem apagou, em vez de
    // virar um contêiner que não sobe num log que alguém precisa ir ler.
    assert.doesNotThrow(() => {
      bancada.conferirParametros();
    });
  });

  void it('o arquivo não é guardado em cache nem indexado', async () => {
    const bancada = montar(ativa());

    const resposta = await bancada.app.inject({
      method: 'GET',
      url: `/v1/pets/${PET}/tags/${TAG}/qr.png`,
      headers: { authorization: `Bearer ${TOKEN_DE_ACESSO}` },
    });

    // O código viaja DENTRO da imagem. Ela acaba num aplicativo de mensagem na
    // hora de mandar imprimir, e não pode ficar num cache intermediário.
    assert.equal(resposta.headers['cache-control'], 'no-store');
    assert.equal(resposta.headers['x-robots-tag'], 'noindex, nofollow');
    assert.equal(resposta.headers['referrer-policy'], 'no-referrer');
  });

  void it('o nome do arquivo leva o sufixo de quatro, e nunca o código inteiro', async () => {
    const bancada = montar(ativa());

    const resposta = await bancada.app.inject({
      method: 'GET',
      url: `/v1/pets/${PET}/tags/${TAG}/qr.png`,
      headers: { authorization: `Bearer ${TOKEN_DE_ACESSO}` },
    });

    const disposicao = String(resposta.headers['content-disposition']);
    assert.equal(disposicao.includes(CODIGO_CANONICO.slice(-4)), true);
    assert.equal(
      disposicao.includes(CODIGO_CANONICO),
      false,
      'Nome de arquivo sobrevive em pasta de download e em histórico de conversa.',
    );
  });
});

void describe('critério 2: a emissão devolve code, url e qr_png_url', () => {
  async function emitir(bancada: Bancada): Promise<Record<string, unknown>> {
    const resposta = await bancada.app.inject({
      method: 'POST',
      url: `/v1/pets/${PET}/tags`,
      headers: { authorization: `Bearer ${TOKEN_DE_ACESSO}` },
    });
    assert.equal(resposta.statusCode, 201);
    return JSON.parse(resposta.body) as Record<string, unknown>;
  }

  void it('os três campos vêm na resposta da emissão', async () => {
    const corpo = await emitir(montar(ativa()));

    assert.equal(typeof corpo['code'], 'string');
    assert.equal(typeof corpo['url'], 'string');
    assert.equal(
      typeof corpo['qr_png_url'],
      'string',
      'Critério 2 da BICHUS-63: a emissão traz os TRÊS. Sem `qr_png_url` o app ' +
        'não entra no `if (qr != null)` e a tela mostra só o código em texto.',
    );
  });

  void it('`url` e o conteúdo do QR são a MESMA cadeia', async () => {
    const bancada = montar(ativa());
    const corpo = await emitir(bancada);

    const imagem = await bancada.app.inject({
      method: 'GET',
      url: `/v1/pets/${PET}/tags/${TAG}/qr.png`,
      headers: { authorization: `Bearer ${TOKEN_DE_ACESSO}` },
    });

    // O texto legível e o QR ficam lado a lado na mesma plaquinha prensada.
    // Apontar para lugares diferentes é um defeito sem conserto por atualização.
    assert.equal(await decodificar(imagem.rawPayload), corpo['url']);
  });

  void it('o `qr_png_url` prometido é um endereço que RESPONDE', async () => {
    const bancada = montar(ativa());
    const corpo = await emitir(bancada);

    // Segue a URL devolvida, em vez de montar o caminho à mão. É o que impede
    // esta suíte de aprovar um campo presente apontando para 404 — a promessa
    // quebrada que o cliente descobriria na hora de imprimir.
    const prometida = String(corpo['qr_png_url']);
    assert.equal(prometida.startsWith(`${BASE_DA_API}/v1/`), true, prometida);

    const resposta = await bancada.app.inject({
      method: 'GET',
      url: prometida.slice(BASE_DA_API.length),
      headers: { authorization: `Bearer ${TOKEN_DE_ACESSO}` },
    });

    assert.equal(resposta.statusCode, 200, `O endereço prometido respondeu ${String(resposta.statusCode)}.`);
    assert.equal(resposta.headers['content-type'], 'image/png');
  });

  void it('o QR não carrega nenhum UUID, embora `qr_png_url` carregue dois', async () => {
    const bancada = montar(ativa());
    const corpo = await emitir(bancada);

    // Os dois são coisas diferentes, e a distinção é o ADR-0010 item 6:
    // `qr_png_url` é uma rota autenticada desta API, numa resposta para o dono;
    // o QR é o que vai impresso na coleira, alcançável por qualquer pessoa na
    // rua. O primeiro pode levar identificador interno; o segundo não.
    const formaDeUuid = /[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/i;
    assert.equal(formaDeUuid.test(String(corpo['qr_png_url'])), true);

    const imagem = await bancada.app.inject({
      method: 'GET',
      url: `/v1/pets/${PET}/tags/${TAG}/qr.png`,
      headers: { authorization: `Bearer ${TOKEN_DE_ACESSO}` },
    });
    const lido = await decodificar(imagem.rawPayload);
    assert.ok(lido !== undefined);
    assert.equal(formaDeUuid.test(lido), false, `O QR decodificou para '${lido}'.`);
  });
});
