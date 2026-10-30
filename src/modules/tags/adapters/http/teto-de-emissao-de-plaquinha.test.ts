/**
 * O teto de emissao de plaquinhas de `POST /pets/{petId}/tags`, medido pela
 * POSICAO da recusa, na dimensao `pet`.
 */
import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { carregarContrato } from '../../../../shared/http/contract.js';
import { criarServidor } from '../../../../shared/http/server.js';
import type { RegistradorDeRotas } from '../../../../shared/http/registrar-rota.js';
import { criarContadorDesligado, criarContadorEmMemoria } from '../../../../shared/http/rate-limit.js';
import { tetoDeTeste } from '../../../../shared/http/teto-de-teste.js';
import type { Idempotencia } from '../../../../shared/http/idempotency.js';
import type { RateLimitEntry } from '../../../../shared/http/route-definition.js';
import type { RateLimitStore } from '../../../../shared/ports/rate-limit-store.js';
import type { Clock, IdGenerator, SecretCipher } from '../../../../shared/ports/index.js';
import type { AuditLog } from '../../../audit/ports/audit-log.js';
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
import type { NovaTag, TagDoTutor, TagRepository } from '../../ports/tag-repository.js';
import {
  registrarRotasDeTags,
  rotaDeEmissaoDeTag,
  type DependenciasDasRotasDeTag,
} from './tag-routes.js';

const PREFIXO_DA_API = '/v1';
const PROBLEM_BASE_URL = 'https://api.exemplo.invalid/problems' as AbsoluteUrl;
const AGORA = 1_800_000_000_000 as Instant;
const DONO = '018f3a2b-0000-7000-8000-0000000000aa' as UserId;
const PET_A = '018f3a2b-0000-7000-8000-0000000000c1' as PetId;
const PET_B = '018f3a2b-0000-7000-8000-0000000000c2' as PetId;
const TOKEN_DE_ACESSO = 'acesso-do-tutor';

/** Da DECLARACAO, nunca escrito a mao. */
const EMISSAO = rotaDeEmissaoDeTag.path;

/** O teto de emissoes por pet, literal e com fonte. */
const TETO_POR_PET = 10;

function naoUsado(nome: string): never {
  throw new Error(`o duble nao implementa ${nome}: nenhum caso deste arquivo chega la`);
}

interface Bancada {
  readonly app: RegistradorDeRotas;
  /** Toda emissao que chegou ao repositorio, na ordem. */
  readonly emitidas: NovaTag[];
}

function bancada(contador: RateLimitStore = criarContadorEmMemoria(() => Date.now())): Bancada {
  const emitidas: NovaTag[] = [];
  let sequencia = 0;

  const repositorio: TagRepository = {
    emitir: (nova) => {
      emitidas.push(nova);
      const tag: TagDoTutor = {
        id: nova.id,
        status: 'active',
        codeSuffix: nova.codeSuffix,
        label: nova.label,
        scanCount: 0,
        lastScannedAt: null,
        revokedAt: null,
        revocationReason: null,
        createdAt: new Date(AGORA),
      };
      return Promise.resolve({ tipo: 'emitida', tag });
    },
    resolverPorCodigo: () => naoUsado('resolverPorCodigo'),
    buscarContextoDoDono: () => naoUsado('buscarContextoDoDono'),
    listarTagsDoPet: () => naoUsado('listarTagsDoPet'),
    buscarParaReimpressao: () => naoUsado('buscarParaReimpressao'),
    registrarScan: () => naoUsado('registrarScan'),
    registrarAviso: () => naoUsado('registrarAviso'),
    avisoRecenteDoMesmoAchador: () => naoUsado('avisoRecenteDoMesmoAchador'),
    jaAvisouRecentemente: () => naoUsado('jaAvisouRecentemente'),
  };
  const trilha: AuditLog = { record: () => Promise.resolve() };
  const clock: Clock = { now: () => AGORA };
  const ids: IdGenerator = {
    uuidv7: () => {
      sequencia += 1;
      return `018f3a2b-0000-7000-8000-00000000${String(sequencia).padStart(4, '0')}` as TagId;
    },
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
    conversaDoAviso: { aoRegistrarAviso: () => Promise.resolve() },
    fila: { enqueue: () => Promise.resolve('trabalho-de-bancada') },
    chaveDoIndiceDoCodigo: Buffer.alloc(32, 0x5e),
    baseDaTag: 'https://tag.exemplo.invalido' as AbsoluteUrl,
    baseDaWeb: 'https://exemplo.invalido' as AbsoluteUrl,
    baseDeMidia: 'https://midia.exemplo.invalido' as AbsoluteUrl,
    rasterizador: criarRasterizadorDeQr(),
  });
  const autenticador: Autenticador = {
    autenticar: (token) =>
      token === TOKEN_DE_ACESSO
        ? Promise.resolve({ userId: DONO })
        : naoUsado('autenticar com token desconhecido'),
  };
  const idempotencia: Idempotencia = {
    reservar: () => Promise.resolve(undefined),
    concluir: () => Promise.resolve(),
    liberar: () => Promise.resolve(),
  };

  const app = criarServidor({
    problemBaseUrl: PROBLEM_BASE_URL,
    isProduction: false,
    teto: tetoDeTeste(contador),
  });
  const deps: DependenciasDasRotasDeTag = {
    tags,
    autenticador,
    idempotencia,
    contrato: carregarContrato('api/openapi.yaml'),
    clock,
    ipHmacKey: Buffer.alloc(32, 7),
    chaveDoIndiceDoCodigo: Buffer.alloc(32, 0x5e),
    baseDaApi: 'https://api.exemplo.invalido',
  };
  void app.register(
    (escopo, _opcoes, pronto) => {
      registrarRotasDeTags(escopo, deps);
      pronto();
    },
    { prefix: PREFIXO_DA_API },
  );
  return { app, emitidas };
}

async function emitirPara(b: Bancada, pet: PetId): Promise<number> {
  const resposta = await b.app.inject({
    method: 'POST',
    url: `${PREFIXO_DA_API}${EMISSAO.replace(':petId', pet)}`,
    headers: { authorization: `Bearer ${TOKEN_DE_ACESSO}` },
  });
  return resposta.statusCode;
}

void describe('o teto de emissao por pet de POST /pets/{petId}/tags, pela posicao da recusa', () => {
  void it('a decima primeira plaquinha do mesmo pet responde 429, e NAO chega ao repositorio', async () => {
    const b = bancada();
    const status: number[] = [];
    for (let i = 0; i < TETO_POR_PET + 1; i += 1) {
      status.push(await emitirPara(b, PET_A));
    }
    await b.app.close();

    assert.deepEqual(
      status.slice(0, TETO_POR_PET),
      Array.from({ length: TETO_POR_PET }, () => 201),
      `as ${String(TETO_POR_PET)} primeiras emissoes deviam sair 201 e sairam ` +
        `${JSON.stringify(status)}. Um 429 antes da decima tira do tutor plaquinha que o ` +
        'contrato promete a ele.',
    );
    assert.equal(
      status[TETO_POR_PET],
      429,
      `a ${String(TETO_POR_PET + 1)}a emissao respondeu ${String(status[TETO_POR_PET])}, e o ` +
        `conjunto foi ${JSON.stringify(status)}. Emissao em massa e o vetor: cada plaquinha e ` +
        'uma credencial ao portador impressa, e sem teto uma conta gera codigo sem fim.',
    );

    assert.equal(
      b.emitidas.length,
      TETO_POR_PET,
      `${String(b.emitidas.length)} emissoes chegaram ao repositorio, e deviam ter chegado ` +
        `${String(TETO_POR_PET)}. A ${String(TETO_POR_PET + 1)}a atravessou a borda e foi ` +
        'recusada mais adiante -- ou nem foi. Em producao o repositorio tambem recusa a 11a, ' +
        'com o mesmo 429 e o mesmo `type`, entao o status sozinho nao distingue os dois ' +
        'mundos: a diferenca e uma transacao por tentativa, paga por chamada, numa rota que ' +
        'existe justamente para nao ser barata de repetir.',
    );
  });

  void it('o balde e do PET: o segundo pet do mesmo tutor comeca do zero', async () => {
    const b = bancada();
    for (let i = 0; i < TETO_POR_PET; i += 1) {
      await emitirPara(b, PET_A);
    }
    const primeiraDoSegundoPet = await emitirPara(b, PET_B);
    const decimaPrimeiraDoPrimeiro = await emitirPara(b, PET_A);
    await b.app.close();

    assert.equal(
      primeiraDoSegundoPet,
      201,
      `a primeira plaquinha do segundo pet respondeu ${String(primeiraDoSegundoPet)}. O balde ` +
        'deixou de ser do pet: quem tem dois animais perde o segundo por causa do primeiro.',
    );
    assert.equal(
      decimaPrimeiraDoPrimeiro,
      429,
      `o primeiro pet respondeu ${String(decimaPrimeiraDoPrimeiro)} na ` +
        `${String(TETO_POR_PET + 1)}a. Sem isto, o caso acima poderia estar verde por o teto ` +
        'ter sido afrouxado em vez de por ele ser por pet.',
    );
  });

  void it('a rota declara o teto que o contrato declara', () => {
    const declaradas: readonly RateLimitEntry[] = rotaDeEmissaoDeTag.rateLimit;
    assert.equal(
      declaradas.length,
      1,
      'POST /pets/{petId}/tags deixou de declarar exatamente uma entrada de `x-rate-limit`. ' +
        'O contrato declara uma (`api/openapi.yaml`, `issuePetTag`).',
    );
    const entrada = declaradas[0];
    assert.ok(entrada !== undefined);
    assert.deepEqual(
      {
        dimension: [...entrada.dimension],
        limit: entrada.limit,
        window: entrada.window,
        onExceed: entrada.onExceed,
      },
      { dimension: ['pet'], limit: TETO_POR_PET, window: '24h', onExceed: 'deny_429' },
      'o teto de emissao por pet divergiu do contrato (`api/openapi.yaml`, `issuePetTag`: ' +
        'dimension [pet], limit 10, window 24h, on_exceed deny_429). `on_exceed` merece ' +
        'atencao especial: so `deny_429` recusa, e trocar por `log_and_alert` deixa a rota ' +
        'declarando teto e emitindo sem teto.',
    );
  });
});

void it('ISCA: com o contador desligado a decima primeira emissao chega ao repositorio', async () => {
  const b = bancada(criarContadorDesligado());
  const status: number[] = [];
  for (let i = 0; i < TETO_POR_PET + 1; i += 1) {
    status.push(await emitirPara(b, PET_A));
  }
  await b.app.close();

  assert.deepEqual(
    status,
    Array.from({ length: TETO_POR_PET + 1 }, () => 201),
    'com o contador desligado nada e recusado na borda, e as onze saem 201.',
  );
  assert.equal(
    b.emitidas.length,
    TETO_POR_PET + 1,
    'com o contador desligado a 11a chega ao repositorio. Se ela nao chegou, quem a barrou ' +
      'nao foi o teto da borda, e o caso de posicao acima esta medindo outra coisa.',
  );
});
