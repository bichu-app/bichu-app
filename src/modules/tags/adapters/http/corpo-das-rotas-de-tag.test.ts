import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import type { RegistradorDeRotas } from '../../../../shared/http/registrar-rota.js';

import type { AuditEvent, AuditLog } from '../../../audit/ports/audit-log.js';
import { carregarContrato, type Contrato } from '../../../../shared/http/contract.js';
import { criarServidor } from '../../../../shared/http/server.js';
import type { Idempotencia } from '../../../../shared/http/idempotency.js';
import type { Clock, IdGenerator, SecretCipher } from '../../../../shared/ports/index.js';
import { comoData } from '../../../../shared/time/clock.js';
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
import type {
  NovaTag,
  NovoAviso,
  NovoScan,
  TagDoTutor,
  TagRepository,
  TagResolvida,
} from '../../ports/tag-repository.js';
import { registrarRotasDeTags, type DependenciasDasRotasDeTag } from './tag-routes.js';
import { tetoDeTeste } from '../../../../shared/http/teto-de-teste.js';

const DONO = '018f3a2b-0000-7000-8000-0000000000aa' as UserId;
const PET = '018f3a2b-0000-7000-8000-0000000000cc' as PetId;
const TAG = '018f3a2b-0000-7000-8000-0000000000dd' as TagId;
const CODIGO = 'GQSM-0XHB-T4D9-G31S';
const AGORA = 1_800_000_000_000 as Instant;
const TOKEN_DE_ACESSO = 'acesso-do-tutor';
const CHAVE_DE_IDEMPOTENCIA = '018f3a2b-0000-7000-8000-000000000e01';
const PROBLEM_BASE_URL = 'https://api.exemplo.invalid/problems' as AbsoluteUrl;

interface Registros {
  readonly avisos: NovoAviso[];
  readonly tags: NovaTag[];
  readonly scans: NovoScan[];
}

interface Bancada {
  readonly app: RegistradorDeRotas;
  readonly contrato: Contrato;
  readonly registros: Registros;
}

function tetoDeTexto(contrato: Contrato, operationId: string, campo: string): number {
  const schema = contrato.requestBodySchema(operationId);
  const propriedades = schema?.['properties'];
  const propriedade =
    typeof propriedades === 'object' && propriedades !== null
      ? (propriedades as Record<string, unknown>)[campo]
      : undefined;
  const teto =
    typeof propriedade === 'object' && propriedade !== null
      ? (propriedade as Record<string, unknown>)['maxLength']
      : undefined;
  if (typeof teto !== 'number') {
    throw new Error(
      `O contrato não declara \`maxLength\` em \`${campo}\` de \`${operationId}\`. ` +
        `Sem o teto no documento não há o que a borda imponha, e este arquivo ` +
        `reprova em vez de passar cobrindo menos do que diz cobrir.`,
    );
  }
  return teto;
}

function tagAtiva(): TagResolvida {
  return {
    tagId: TAG,
    petId: PET,
    ownerUserId: DONO,
    status: 'active',
    petIndisponivel: false,
    pet: {
      displayName: 'Thor',
      species: 'dog',
      breedLabel: 'Vira-lata',
      size: 'M',
      primaryColor: 'preto e branco',
      distinctiveMarks: 'Coleira vermelha.',
      careNotes: 'É medroso. Não corra atrás.',
      isLost: true,
      photoKey: null,
    },
  };
}

function naoUsado(nome: string): never {
  throw new Error(`o dublê não implementa ${nome}: nenhum caso deste arquivo deveria chegar aqui`);
}

function montar(): Bancada {
  const registros: Registros = { avisos: [], tags: [], scans: [] };

  const repositorio: TagRepository = {
    resolverPorCodigo: () => Promise.resolve(tagAtiva()),
    buscarContextoDoDono: () => naoUsado('buscarContextoDoDono'),
    listarTagsDoPet: () => naoUsado('listarTagsDoPet'),
    buscarParaReimpressao: () => naoUsado('buscarParaReimpressao'),
    emitir: (nova) => {
      registros.tags.push(nova);
      const tag: TagDoTutor = {
        id: nova.id,
        status: 'active',
        codeSuffix: nova.codeSuffix,
        label: nova.label,
        scanCount: 0,
        lastScannedAt: null,
        revokedAt: null,
        revocationReason: null,
        createdAt: comoData(AGORA),
      };
      return Promise.resolve({ tipo: 'emitida', tag });
    },
    registrarScan: (scan) => {
      registros.scans.push(scan);
      return Promise.resolve();
    },
    registrarAviso: (aviso) => {
      registros.avisos.push(aviso);
      return Promise.resolve();
    },
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
  let sequencia = 0;
  const ids: IdGenerator = {
    uuidv7: () => {
      sequencia += 1;
      return `018f3a2b-0000-7000-8000-00000000${String(sequencia).padStart(4, '0')}`;
    },
    opaqueToken: () => `token-${String(sequencia)}` as OpaqueToken,
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

  const contrato = carregarContrato('api/openapi.yaml');
  const app = criarServidor({
    problemBaseUrl: PROBLEM_BASE_URL,
    isProduction: false,
    teto: tetoDeTeste(),
  });
  const deps: DependenciasDasRotasDeTag = {
    tags,
    autenticador,
    idempotencia,
    contrato,
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
    { prefix: '/v1' },
  );

  return { app, contrato, registros };
}

interface Resposta {
  readonly status: number;
  readonly corpo: Record<string, unknown> | undefined;
}

async function avisar(
  bancada: Bancada,
  corpo: Record<string, unknown> | undefined,
): Promise<Resposta> {
  const resposta = await bancada.app.inject({
    method: 'POST',
    url: `/v1/tags/${CODIGO}/found-reports`,
    headers: {
      'idempotency-key': CHAVE_DE_IDEMPOTENCIA,
      ...(corpo === undefined ? {} : { 'content-type': 'application/json' }),
    },
    ...(corpo === undefined ? {} : { payload: corpo }),
  });
  return {
    status: resposta.statusCode,
    corpo:
      resposta.body === '' ? undefined : (JSON.parse(resposta.body) as Record<string, unknown>),
  };
}

async function emitirTag(
  bancada: Bancada,
  corpo: Record<string, unknown> | undefined,
): Promise<Resposta> {
  const resposta = await bancada.app.inject({
    method: 'POST',
    url: `/v1/pets/${PET}/tags`,
    headers: {
      authorization: `Bearer ${TOKEN_DE_ACESSO}`,
      ...(corpo === undefined ? {} : { 'content-type': 'application/json' }),
    },
    ...(corpo === undefined ? {} : { payload: corpo }),
  });
  return {
    status: resposta.statusCode,
    corpo:
      resposta.body === '' ? undefined : (JSON.parse(resposta.body) as Record<string, unknown>),
  };
}

void describe('POST /v1/tags/{code}/found-reports: o teto de `client_note` vale em runtime', () => {
  void it('recusa com 400 a nota acima do teto do contrato, e não grava nada', async () => {
    const bancada = montar();
    const teto = tetoDeTexto(bancada.contrato, 'createFoundReportFromTag', 'client_note');

    const resposta = await avisar(bancada, { client_note: 'a'.repeat(teto + 1) });

    assert.equal(resposta.status, 400, `nota de ${String(teto + 1)} caracteres precisa ser recusada`);
    assert.equal(
      resposta.corpo?.['type'],
      `${PROBLEM_BASE_URL}/validation-failed`,
      'a recusa é de validação, e o corpo é Problem Details',
    );
    assert.deepEqual(
      bancada.registros.avisos,
      [],
      'entrada recusada na borda não chega ao repositório',
    );
  });

  void it('aceita a nota exatamente no teto, e ela chega inteira ao repositório', async () => {
    const bancada = montar();
    const teto = tetoDeTexto(bancada.contrato, 'createFoundReportFromTag', 'client_note');
    const nota = 'a'.repeat(teto);

    const resposta = await avisar(bancada, { client_note: nota });

    assert.equal(resposta.status, 201, 'o teto é inclusivo: o limite exato passa');
    assert.equal(
      bancada.registros.avisos[0]?.notes,
      nota,
      'a nota não é truncada nem reescrita no caminho',
    );
  });

  void it('um toque, zero campos: sem corpo nenhum continua respondendo 201', async () => {
    const bancada = montar();

    const resposta = await avisar(bancada, undefined);

    assert.equal(resposta.status, 201, 'a operação mais crítica do produto funciona sem corpo');
    assert.equal(bancada.registros.avisos[0]?.notes, null, 'sem nota, a coluna fica nula');
  });

  void it('corpo vazio explícito também passa', async () => {
    const bancada = montar();

    const resposta = await avisar(bancada, {});

    assert.equal(resposta.status, 201);
  });
});

void describe('POST /v1/pets/{petId}/tags: o `label` que o contrato não declarava', () => {
  void it('recusa com 400 o label acima do teto, e nenhuma tag é emitida', async () => {
    const bancada = montar();
    const teto = tetoDeTexto(bancada.contrato, 'issuePetTag', 'label');

    const resposta = await emitirTag(bancada, { label: 'a'.repeat(teto + 1) });

    assert.equal(resposta.status, 400, `label de ${String(teto + 1)} caracteres precisa ser recusado`);
    assert.deepEqual(bancada.registros.tags, [], 'entrada recusada não emite código de plaquinha');
  });

  void it('recusa com 400 o label vazio, que é o que o CHECK da tabela recusaria', async () => {
    const bancada = montar();

    const resposta = await emitirTag(bancada, { label: '' });

    assert.equal(resposta.status, 400, 'string vazia viola `pet_tags_label_tamanho`');
    assert.deepEqual(bancada.registros.tags, []);
  });

  void it('aceita o label no teto exato', async () => {
    const bancada = montar();
    const teto = tetoDeTexto(bancada.contrato, 'issuePetTag', 'label');
    const label = 'a'.repeat(teto);

    const resposta = await emitirTag(bancada, { label });

    assert.equal(resposta.status, 201);
    assert.equal(bancada.registros.tags[0]?.label, label);
  });

  void it('emitir sem corpo continua sendo o caminho comum, e responde 201', async () => {
    const bancada = montar();

    const resposta = await emitirTag(bancada, undefined);

    assert.equal(resposta.status, 201, 'plaquinha sem apelido é um POST sem corpo');
    assert.equal(bancada.registros.tags[0]?.label, null);
  });
});
