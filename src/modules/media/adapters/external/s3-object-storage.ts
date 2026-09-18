/**
 * Armazenamento de objeto pela API S3, com assinatura V4 escrita aqui.
 *
 * **Este é o único arquivo do sistema que sabe que existe S3**, e é por isso que
 * ele mora em `adapters/external/` — o único lugar onde o ADR-0007 permite falar
 * com provedor. Nenhum outro módulo o importa; todos enxergam a porta.
 *
 * ## Por que a assinatura é escrita à mão, e não trazida por SDK
 *
 * O projeto tem quatro dependências de produção (`fastify`, `kysely`, `pg`,
 * `yaml`). O SDK da AWS traria dezenas de pacotes transitivos para usar três
 * operações, e — pior — o nome do provedor entraria em `package.json`, que é o
 * lugar mais difícil de tirar depois. O ADR-0007 mantém a porta aberta para S3,
 * GCS em modo de interoperabilidade, R2 ou Spaces; a assinatura V4 é a **mesma**
 * nos quatro, porque é isso que "compatível com S3" significa.
 *
 * São ~150 linhas de aritmética bem documentada, contra um acoplamento que o
 * ADR existe para evitar. A decisão pode se inverter no dia em que precisarmos
 * de upload multiparte ou de replicação — e nesse dia ela se inverte AQUI, sem
 * tocar em mais nada.
 *
 * ## O que este arquivo não faz
 *
 * Não recebe bytes de foto pela rota HTTP. `put` e `get` existem para o WORKER,
 * que precisa ler o original para validar e gravar as derivadas. O caminho do
 * usuário é: pede autorização → envia direto ao armazenamento → confirma.
 */
import { createHash, createHmac } from 'node:crypto';
import type {
  AutorizacaoDeEnvio,
  Cabecalho,
  Classe,
  ObjectStorage,
  PedidoDeEnvio,
} from '../../ports/object-storage.js';
import type { ObjectStorageConfig } from '../../../../shared/config/app-config.js';
import type { AbsoluteUrl, ObjectKey } from '../../../../shared/types/brands.js';

const SERVICO = 's3';
const ALGORITMO = 'AWS4-HMAC-SHA256';

/** `20260918T120000Z` e `20260918`, os dois formatos que a V4 exige. */
function carimbos(agora: Date): { longo: string; curto: string } {
  const longo = agora.toISOString().replace(/[-:]/g, '').replace(/\.\d{3}/, '');
  return { longo, curto: longo.slice(0, 8) };
}

function hmac(chave: Buffer | string, dado: string): Buffer {
  return createHmac('sha256', chave).update(dado, 'utf8').digest();
}

function sha256Hex(dado: Buffer | string): string {
  return createHash('sha256').update(dado).digest('hex');
}

/**
 * A cadeia de derivação da V4: data, região, serviço, `aws4_request`.
 *
 * Quatro HMACs encadeados, e a ordem é normativa. Ela existe para que a chave
 * que assina um pedido **não sirva** para outra data, outra região ou outro
 * serviço: uma assinatura vazada expira com o dia.
 */
function chaveDeAssinatura(secret: string, dataCurta: string, regiao: string): Buffer {
  return hmac(hmac(hmac(hmac(`AWS4${secret}`, dataCurta), regiao), SERVICO), 'aws4_request');
}

export function criarObjectStorage(config: ObjectStorageConfig): ObjectStorage {
  const bucketDa = (classe: Classe): string =>
    classe === 'privado' ? config.bucketPrivate : config.bucketPublic;

  /**
   * O endereço do bucket.
   *
   * `forcePathStyle` não é preferência: o MinIO serve por caminho
   * (`http://host:9000/bucket/chave`) e a maioria dos gerenciados serve por
   * subdomínio (`https://bucket.host/chave`). O contrato do ADR-0007 é que isso
   * seja **variável de ambiente**, e não um `if` por provedor espalhado no código.
   */
  const baseDoBucket = (classe: Classe): URL => {
    const bucket = bucketDa(classe);
    const base = new URL(config.endpoint ?? `https://${SERVICO}.${config.region}.amazonaws.com`);
    if (config.forcePathStyle) {
      base.pathname = `/${bucket}`;
      return base;
    }
    base.hostname = `${bucket}.${base.hostname}`;
    return base;
  };

  const urlDoObjeto = (classe: Classe, chave: ObjectKey): URL => {
    const base = baseDoBucket(classe);
    const url = new URL(base.toString());
    url.pathname = `${base.pathname.replace(/\/$/, '')}/${chave}`;
    return url;
  };

  /** Assina um pedido comum (cabeçalho `Authorization`). Usado pelo worker. */
  const assinar = (
    metodo: string,
    url: URL,
    corpo: Buffer | undefined,
    agora: Date,
  ): Record<string, string> => {
    const { longo, curto } = carimbos(agora);
    const conteudoHash = sha256Hex(corpo ?? '');

    const cabecalhos: Record<string, string> = {
      host: url.host,
      'x-amz-content-sha256': conteudoHash,
      'x-amz-date': longo,
    };
    const nomes = Object.keys(cabecalhos).sort();
    const canonicos = nomes.map((n) => `${n}:${cabecalhos[n]!}\n`).join('');
    const assinados = nomes.join(';');

    const pedidoCanonico = [
      metodo,
      url.pathname,
      url.search.replace(/^\?/, ''),
      canonicos,
      assinados,
      conteudoHash,
    ].join('\n');

    const escopo = `${curto}/${config.region}/${SERVICO}/aws4_request`;
    const aAssinar = [ALGORITMO, longo, escopo, sha256Hex(pedidoCanonico)].join('\n');
    const assinatura = createHmac('sha256', chaveDeAssinatura(config.secretAccessKey, curto, config.region))
      .update(aAssinar, 'utf8')
      .digest('hex');

    return {
      ...cabecalhos,
      authorization:
        `${ALGORITMO} Credential=${config.accessKeyId}/${escopo}, ` +
        `SignedHeaders=${assinados}, Signature=${assinatura}`,
    };
  };

  return {
    createUploadIntent(pedido: PedidoDeEnvio): Promise<AutorizacaoDeEnvio> {
      const agora = new Date();
      const { longo, curto } = carimbos(agora);
      const expiraEm = new Date(agora.getTime() + pedido.validadeEmSegundos * 1000);
      const credencial = `${config.accessKeyId}/${curto}/${config.region}/${SERVICO}/aws4_request`;

      // A POLÍTICA É O CONTRATO COM O ARMAZENAMENTO, e cada condição abaixo é
      // uma coisa que o cliente NÃO consegue fazer com esta autorização.
      const politica = {
        expiration: expiraEm.toISOString(),
        conditions: [
          { bucket: bucketDa(pedido.classe) },
          // Chave EXATA, não prefixo: com prefixo, quem recebe a autorização de
          // uma foto pode sobrescrever qualquer outra abaixo dele.
          { key: pedido.chave },
          { 'Content-Type': pedido.contentType },
          // O teto de tamanho vive AQUI e não na aplicação: o backend nunca vê
          // os bytes, então recusar depois seria recusar o que já foi gravado.
          ['content-length-range', 0, pedido.maxBytes],
          { 'x-amz-algorithm': ALGORITMO },
          { 'x-amz-credential': credencial },
          { 'x-amz-date': longo },
        ],
      };

      const politicaB64 = Buffer.from(JSON.stringify(politica)).toString('base64');
      const assinatura = createHmac('sha256', chaveDeAssinatura(config.secretAccessKey, curto, config.region))
        .update(politicaB64, 'utf8')
        .digest('hex');

      return Promise.resolve({
        metodo: 'POST',
        url: baseDoBucket(pedido.classe).toString() as AbsoluteUrl,
        campos: {
          key: pedido.chave,
          'Content-Type': pedido.contentType,
          'x-amz-algorithm': ALGORITMO,
          'x-amz-credential': credencial,
          'x-amz-date': longo,
          'x-amz-server-side-encryption': 'AES256',
          policy: politicaB64,
          'x-amz-signature': assinatura,
        },
        expiraEm,
        maxBytes: pedido.maxBytes,
      });
    },

    getSignedReadUrl(classe, chave, validadeEmSegundos): Promise<AbsoluteUrl> {
      const agora = new Date();
      const { longo, curto } = carimbos(agora);
      const url = urlDoObjeto(classe, chave);
      const escopo = `${curto}/${config.region}/${SERVICO}/aws4_request`;

      url.searchParams.set('X-Amz-Algorithm', ALGORITMO);
      url.searchParams.set('X-Amz-Credential', `${config.accessKeyId}/${escopo}`);
      url.searchParams.set('X-Amz-Date', longo);
      url.searchParams.set('X-Amz-Expires', String(validadeEmSegundos));
      url.searchParams.set('X-Amz-SignedHeaders', 'host');
      url.searchParams.sort();

      const pedidoCanonico = [
        'GET',
        url.pathname,
        url.search.replace(/^\?/, ''),
        `host:${url.host}\n`,
        'host',
        'UNSIGNED-PAYLOAD',
      ].join('\n');

      const aAssinar = [ALGORITMO, longo, escopo, sha256Hex(pedidoCanonico)].join('\n');
      const assinatura = createHmac('sha256', chaveDeAssinatura(config.secretAccessKey, curto, config.region))
        .update(aAssinar, 'utf8')
        .digest('hex');
      url.searchParams.set('X-Amz-Signature', assinatura);

      return Promise.resolve(url.toString() as AbsoluteUrl);
    },

    async head(classe, chave): Promise<Cabecalho | null> {
      const url = urlDoObjeto(classe, chave);
      const resposta = await fetch(url, { method: 'HEAD', headers: assinar('HEAD', url, undefined, new Date()) });
      if (resposta.status === 404) return null;
      if (!resposta.ok) throw new Error(`HEAD ${String(resposta.status)} no armazenamento`);
      return {
        contentLength: Number(resposta.headers.get('content-length') ?? '0'),
        contentType: resposta.headers.get('content-type') ?? undefined,
        etag: resposta.headers.get('etag') ?? undefined,
      };
    },

    async get(classe, chave): Promise<Buffer> {
      const url = urlDoObjeto(classe, chave);
      const resposta = await fetch(url, { method: 'GET', headers: assinar('GET', url, undefined, new Date()) });
      if (!resposta.ok) throw new Error(`GET ${String(resposta.status)} no armazenamento`);
      return Buffer.from(await resposta.arrayBuffer());
    },

    async put(classe, chave, bytes, contentType): Promise<void> {
      const url = urlDoObjeto(classe, chave);
      const resposta = await fetch(url, {
        method: 'PUT',
        headers: { ...assinar('PUT', url, bytes, new Date()), 'content-type': contentType },
        body: new Uint8Array(bytes),
      });
      if (!resposta.ok) throw new Error(`PUT ${String(resposta.status)} no armazenamento`);
    },

    async delete(classe, chave): Promise<void> {
      const url = urlDoObjeto(classe, chave);
      const resposta = await fetch(url, { method: 'DELETE', headers: assinar('DELETE', url, undefined, new Date()) });
      // 404 no apagar é sucesso: o estado desejado é "não existe".
      if (!resposta.ok && resposta.status !== 404) {
        throw new Error(`DELETE ${String(resposta.status)} no armazenamento`);
      }
    },
  };
}
