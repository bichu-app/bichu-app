/**
 * ISCA (B): `GET /v1/tags/{code}` devolve a FOTO do pet.
 *
 * ## O defeito que ela desliga
 *
 * O cliente escaneou a plaquinha e a tela do pet abriu **sem a foto**. A causa
 * não estava no aplicativo: `tag-routes.ts` escrevia `photo_url: null` numa
 * linha fixa, com um comentário dizendo que o módulo `media` não existia nesta
 * entrega. Ele existe (`src/modules/media/`), o contrato declara
 * `TagResolution.pet.photo_url` desde sempre e o próprio exemplo de 200 de
 * `resolveTagCode` traz um endereço. O aplicativo lia o campo, recebia `null`
 * todas as vezes, e — corretamente, pela regra 5.4 do design system — não
 * desenhava moldura nenhuma.
 *
 * ## Por que ela é prova por DESLIGAMENTO, e não asserção trivial
 *
 * O primeiro caso dá ao repositório um pet COM chave de foto e exige o
 * endereço montado no corpo. Devolver `null` fixo outra vez — que é a linha
 * exata que estava aqui — reprova. Montar o endereço com a base errada
 * (`baseDaWeb`, que é outro host por decisão do cliente) também reprova,
 * porque o caso compara com a base de mídia e elas são diferentes de propósito.
 *
 * O segundo caso é o contrapeso, e sem ele o primeiro poderia ser satisfeito
 * por um endereço constante: sem chave de foto o campo volta a ser `null`, e
 * `null` aqui significa "este pet não tem capa pronta", nunca "esta rota não
 * sabe responder". É essa distinção que o defeito apagava.
 *
 * ESCRITA E NÃO RODADA nesta entrega, por instrução do cliente.
 */
import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import type { AuditEvent, AuditLog } from '../../../audit/ports/audit-log.js';
import { carregarContrato } from '../../../../shared/http/contract.js';
import { criarServidor } from '../../../../shared/http/server.js';
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
import type { TagRepository, TagResolvida } from '../../ports/tag-repository.js';
import { registrarRotasDeTags, type DependenciasDasRotasDeTag } from './tag-routes.js';
import { tetoDeTeste } from '../../../../shared/http/teto-de-teste.js';

const DONO = '018f3a2b-0000-7000-8000-0000000000aa' as UserId;
const PET = '018f3a2b-0000-7000-8000-0000000000cc' as PetId;
const TAG = '018f3a2b-0000-7000-8000-0000000000dd' as TagId;
const CODIGO = 'GQSM-0XHB-T4D9-G31S';
const AGORA = 1_800_000_000_000 as Instant;
const PROBLEM_BASE_URL = 'https://api.exemplo.invalid/problems' as AbsoluteUrl;

/** A base de mídia, DIFERENTE da base da web de propósito: ver o cabeçalho. */
const BASE_DE_MIDIA = 'https://midia.exemplo.invalido' as AbsoluteUrl;
const BASE_DA_WEB = 'https://web.exemplo.invalido' as AbsoluteUrl;

/** A chave de um objeto de capa já pronto, como `pet_photos.card_key` a grava. */
const CHAVE_DA_CAPA = 'p/018f3a2b00007000800000000000cc/card.webp';

function naoUsado(nome: string): never {
  throw new Error(`o dublê não implementa ${nome}: nenhum caso deste arquivo chega aqui`);
}

function tagComFoto(photoKey: string | null): TagResolvida {
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
      photoKey,
    },
  };
}

function montar(photoKey: string | null) {
  const repositorio: TagRepository = {
    resolverPorCodigo: () => Promise.resolve(tagComFoto(photoKey)),
    buscarContextoDoDono: () => naoUsado('buscarContextoDoDono'),
    listarTagsDoPet: () => naoUsado('listarTagsDoPet'),
    buscarParaReimpressao: () => naoUsado('buscarParaReimpressao'),
    emitir: () => naoUsado('emitir'),
    registrarScan: () => Promise.resolve(),
    registrarAviso: () => naoUsado('registrarAviso'),
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
    opaqueToken: () => 'token-1' as OpaqueToken,
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
    // A fila do aviso ao tutor. Esta bancada nao exercita o aviso; a isca
    // que confere o enfileiramento e `escanear-enfileira-aviso-ao-tutor.test.ts`.
    fila: { enqueue: () => Promise.resolve('trabalho-de-bancada') },
    chaveDoIndiceDoCodigo: Buffer.alloc(32, 0x5e),
    baseDaTag: 'https://tag.exemplo.invalido' as AbsoluteUrl,
    baseDaWeb: BASE_DA_WEB,
    baseDeMidia: BASE_DE_MIDIA,
    rasterizador: criarRasterizadorDeQr(),
  });

  const autenticador: Autenticador = { autenticar: () => naoUsado('autenticar') };
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
    baseDaApi: 'https://api.exemplo.invalido',
  };
  void app.register(
    (escopo, _opcoes, pronto) => {
      registrarRotasDeTags(escopo, deps);
      pronto();
    },
    { prefix: '/v1' },
  );
  return app;
}

async function resolver(photoKey: string | null): Promise<Record<string, unknown>> {
  const app = montar(photoKey);
  const resposta = await app.inject({ method: 'GET', url: `/v1/tags/${CODIGO}` });
  assert.equal(
    resposta.statusCode,
    200,
    'REPROVA: a resolução do código parou de responder 200 para uma tag ativa. ' +
      'Sem o 200 não há corpo a medir, e este arquivo reprova em vez de passar ' +
      'cobrindo menos do que diz cobrir.',
  );
  return JSON.parse(resposta.body) as Record<string, unknown>;
}

void describe('GET /v1/tags/{code}: a foto do pet sai no corpo', () => {
  void it('devolve `pet.photo_url` montado sobre a base de MÍDIA quando há capa pronta', async () => {
    const corpo = await resolver(CHAVE_DA_CAPA);
    const pet = corpo['pet'] as Record<string, unknown>;

    assert.equal(
      pet['photo_url'],
      `${BASE_DE_MIDIA}/${CHAVE_DA_CAPA}`,
      'REPROVA: o pet tem capa pronta e a rota não devolveu o endereço dela. ' +
        'Era exatamente este o defeito do cliente: ele escaneou a plaquinha e a ' +
        'tela abriu sem a foto, porque `tag-routes.ts` escrevia `photo_url: null` ' +
        'numa linha fixa. O contrato declara o campo e o exemplo de 200 de ' +
        '`resolveTagCode` traz um endereço. Se esta linha voltar a ser `null`, ou ' +
        'se o endereço for montado sobre `baseDaWeb` (que é OUTRO host por decisão ' +
        'do cliente), quem está com o animal no colo perde o único elemento que ' +
        'confirma que é o bicho certo.',
    );
  });

  void it('devolve `pet.photo_url` nulo quando o pet NÃO tem capa pronta', async () => {
    const corpo = await resolver(null);
    const pet = corpo['pet'] as Record<string, unknown>;

    assert.equal(
      pet['photo_url'],
      null,
      'REPROVA: um pet sem capa pronta ganhou endereço de foto. Endereço montado ' +
        'para objeto que ninguém gravou dá quadro quebrado na mão de quem está na ' +
        'rua, que é a preocupação legítima do comentário antigo desta rota. O ' +
        '`null` aqui significa "este pet não tem capa", e é essa distinção que o ' +
        '`null` fixo apagava.',
    );
  });
});
