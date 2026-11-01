import { createHash, createHmac } from 'node:crypto';
import type {
  AutorizacaoDeEnvio,
  Cabecalho,
  Classe,
  ObjectStorage,
  OperacaoDeRede,
  PedidoDeEnvio,
} from '../../ports/object-storage.js';
import { PrazoDoArmazenamentoEsgotadoError } from '../../ports/object-storage.js';
import { ehTipoAceito, ehTipoDeDerivada } from '../../domain/chave-de-objeto.js';
import type { ObjectStorageConfig } from '../../../../shared/config/app-config.js';
import type { AbsoluteUrl, ObjectKey } from '../../../../shared/types/brands.js';

/** O DIALETO da assinatura V4 (ADR-0007 Emenda 1). */
export type DialetoDeAssinatura = 'amz' | 'goog';

interface Dialeto {
  readonly algoritmo: string;
  readonly prefixoDaChave: string;
  readonly servico: string;
  readonly terminador: string;
  readonly campo: string;
  readonly parametro: string;
  readonly exigeCriptografiaNoFormulario: boolean;
}

const DIALETOS: Readonly<Record<DialetoDeAssinatura, Dialeto>> = {
  amz: {
    algoritmo: 'AWS4-HMAC-SHA256',
    prefixoDaChave: 'AWS4',
    servico: 's3',
    terminador: 'aws4_request',
    campo: 'x-amz-',
    parametro: 'X-Amz-',
    exigeCriptografiaNoFormulario: true,
  },
  goog: {
    algoritmo: 'GOOG4-HMAC-SHA256',
    prefixoDaChave: 'GOOG4',
    servico: 'storage',
    terminador: 'goog4_request',
    campo: 'x-goog-',
    parametro: 'X-Goog-',
    exigeCriptografiaNoFormulario: false,
  },
};

const SERVICO = 's3';

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

function chaveDeAssinatura(d: Dialeto, secret: string, dataCurta: string, regiao: string): Buffer {
  return hmac(hmac(hmac(hmac(`${d.prefixoDaChave}${secret}`, dataCurta), regiao), d.servico), d.terminador);
}

function ehEstouroDePrazo(erro: unknown): boolean {
  return erro instanceof Error && erro.name === 'TimeoutError';
}

export function criarObjectStorage(config: ObjectStorageConfig): ObjectStorage {
  const d = DIALETOS[config.dialetoDeAssinatura ?? 'amz'];
  const ALGORITMO = d.algoritmo;
  const escopoDe = (curto: string): string => `${curto}/${config.region}/${d.servico}/${d.terminador}`;
  const chaveDe = (curto: string): Buffer => chaveDeAssinatura(d, config.secretAccessKey, curto, config.region);
  const comPrazo = async <T>(
    operacao: OperacaoDeRede,
    prazoMs: number,
    chamada: (sinal: AbortSignal) => Promise<T>,
  ): Promise<T> => {
    try {
      return await chamada(AbortSignal.timeout(prazoMs));
    } catch (erro) {
      if (ehEstouroDePrazo(erro)) throw new PrazoDoArmazenamentoEsgotadoError(operacao, prazoMs);
      throw erro;
    }
  };

  const bucketDa = (classe: Classe): string =>
    classe === 'privado' ? config.bucketPrivate : config.bucketPublic;

  const baseDoBucket = (classe: Classe, paraOCliente = false): URL => {
    const bucket = bucketDa(classe);
    const endpoint = paraOCliente ? (config.publicEndpoint ?? config.endpoint) : config.endpoint;
    const base = new URL(endpoint ?? `https://${SERVICO}.${config.region}.amazonaws.com`);
    if (config.forcePathStyle) {
      base.pathname = `/${bucket}`;
      return base;
    }
    base.hostname = `${bucket}.${base.hostname}`;
    return base;
  };

  const urlDoObjeto = (classe: Classe, chave: ObjectKey, paraOCliente = false): URL => {
    const base = baseDoBucket(classe, paraOCliente);
    const url = new URL(base.toString());
    url.pathname = `${base.pathname.replace(/\/$/, '')}/${chave}`;
    return url;
  };

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
      [`${d.campo}content-sha256`]: conteudoHash,
      [`${d.campo}date`]: longo,
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

    const escopo = escopoDe(curto);
    const aAssinar = [ALGORITMO, longo, escopo, sha256Hex(pedidoCanonico)].join('\n');
    const assinatura = createHmac('sha256', chaveDe(curto))
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
      if (!ehTipoAceito(pedido.contentType)) {
        return Promise.reject(
          new Error(
            `Autorização de envio recusada: content-type ` +
              `${JSON.stringify(pedido.contentType)} não é tipo aceito.`,
          ),
        );
      }
      const agora = new Date();
      const { longo, curto } = carimbos(agora);
      const expiraEm = new Date(agora.getTime() + pedido.validadeEmSegundos * 1000);
      const credencial = `${config.accessKeyId}/${escopoDe(curto)}`;
      const criptografia = d.exigeCriptografiaNoFormulario
        ? { [`${d.campo}server-side-encryption`]: 'AES256' }
        : {};

      const politica = {
        expiration: expiraEm.toISOString(),
        conditions: [
          { bucket: bucketDa(pedido.classe) },
          { key: pedido.chave },
          { 'Content-Type': pedido.contentType },
          ['content-length-range', 1, pedido.maxBytes],
          ...(d.exigeCriptografiaNoFormulario ? [criptografia] : []),
          { [`${d.campo}algorithm`]: ALGORITMO },
          { [`${d.campo}credential`]: credencial },
          { [`${d.campo}date`]: longo },
        ],
      };

      const politicaB64 = Buffer.from(JSON.stringify(politica)).toString('base64');
      const assinatura = createHmac('sha256', chaveDe(curto))
        .update(politicaB64, 'utf8')
        .digest('hex');

      return Promise.resolve({
        metodo: 'POST',
        url: baseDoBucket(pedido.classe, true).toString() as AbsoluteUrl,
        campos: {
          key: pedido.chave,
          'Content-Type': pedido.contentType,
          [`${d.campo}algorithm`]: ALGORITMO,
          [`${d.campo}credential`]: credencial,
          [`${d.campo}date`]: longo,
          ...criptografia,
          policy: politicaB64,
          [`${d.campo}signature`]: assinatura,
        },
        expiraEm,
        maxBytes: pedido.maxBytes,
      });
    },

    getSignedReadUrl(classe, chave, validadeEmSegundos): Promise<AbsoluteUrl> {
      const agora = new Date();
      const { longo, curto } = carimbos(agora);
      const url = urlDoObjeto(classe, chave, true);
      const escopo = escopoDe(curto);

      url.searchParams.set(`${d.parametro}Algorithm`, ALGORITMO);
      url.searchParams.set(`${d.parametro}Credential`, `${config.accessKeyId}/${escopo}`);
      url.searchParams.set(`${d.parametro}Date`, longo);
      url.searchParams.set(`${d.parametro}Expires`, String(validadeEmSegundos));
      url.searchParams.set(`${d.parametro}SignedHeaders`, 'host');
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
      const assinatura = createHmac('sha256', chaveDe(curto))
        .update(aAssinar, 'utf8')
        .digest('hex');
      url.searchParams.set(`${d.parametro}Signature`, assinatura);

      return Promise.resolve(url.toString() as AbsoluteUrl);
    },

    head(classe, chave): Promise<Cabecalho | null> {
      const url = urlDoObjeto(classe, chave);
      return comPrazo('HEAD', config.prazoCurtoMs, async (signal) => {
        const resposta = await fetch(url, {
          method: 'HEAD',
          headers: assinar('HEAD', url, undefined, new Date()),
          signal,
        });
        if (resposta.status === 404) return null;
        if (!resposta.ok) throw new Error(`HEAD ${String(resposta.status)} no armazenamento`);
        return {
          contentLength: Number(resposta.headers.get('content-length') ?? '0'),
          contentType: resposta.headers.get('content-type') ?? undefined,
          etag: resposta.headers.get('etag') ?? undefined,
        };
      });
    },

    get(classe, chave): Promise<Buffer> {
      const url = urlDoObjeto(classe, chave);
      return comPrazo('GET', config.prazoDeTransferenciaMs, async (signal) => {
        const resposta = await fetch(url, {
          method: 'GET',
          headers: assinar('GET', url, undefined, new Date()),
          signal,
        });
        if (!resposta.ok) throw new Error(`GET ${String(resposta.status)} no armazenamento`);
        return Buffer.from(await resposta.arrayBuffer());
      });
    },

    async put(classe, chave, bytes, contentType): Promise<void> {
      if (!ehTipoDeDerivada(contentType)) {
        throw new Error(
          `PUT recusado: content-type ${JSON.stringify(contentType)} não é tipo de derivada.`,
        );
      }
      const url = urlDoObjeto(classe, chave);
      await comPrazo('PUT', config.prazoDeTransferenciaMs, async (signal) => {
        const resposta = await fetch(url, {
          method: 'PUT',
          headers: { ...assinar('PUT', url, bytes, new Date()), 'content-type': contentType },
          body: new Uint8Array(bytes),
          signal,
        });
        if (!resposta.ok) throw new Error(`PUT ${String(resposta.status)} no armazenamento`);
      });
    },

    delete(classe, chave): Promise<void> {
      const url = urlDoObjeto(classe, chave);
      return comPrazo('DELETE', config.prazoCurtoMs, async (signal) => {
        const resposta = await fetch(url, {
          method: 'DELETE',
          headers: assinar('DELETE', url, undefined, new Date()),
          signal,
        });
        if (!resposta.ok && resposta.status !== 404) {
          throw new Error(`DELETE ${String(resposta.status)} no armazenamento`);
        }
      });
    },
  };
}
