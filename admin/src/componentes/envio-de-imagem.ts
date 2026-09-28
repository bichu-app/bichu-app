import type { ClienteDaApi, Esquemas } from '../api/cliente.ts';

/**
 * Envio de imagem de catalogo (ADR-0007, `createAdminCatalogImageIntent`): o
 * painel pede a politica, manda os bytes direto ao armazenamento e so depois a
 * escrita do item confirma o envio com o `upload_id`.
 */
export const TIPOS_ACEITOS = ['image/jpeg', 'image/png', 'image/webp'] as const;
export type TipoAceito = (typeof TIPOS_ACEITOS)[number];
/** 5 MiB, o `maximum` de `byte_size` no contrato. A tela diz "5 MB". */
export const LIMITE_DE_BYTES = 5_242_880;
export const MAXIMO_DE_IMAGENS = 8;

export type Proposito = Esquemas['AdminCatalogImageIntentInput']['purpose'];

const DIMENSAO_MINIMA: Record<Proposito, { largura: number; altura: number }> = {
  store_item: { largura: 800, altura: 800 },
  network_event: { largura: 1600, altura: 900 },
};

function megabytes(bytes: number): string {
  return (bytes / 1_048_576).toLocaleString('pt-BR', { maximumFractionDigits: 1, minimumFractionDigits: 1 });
}

/** O que da para conferir antes do envio (UX 29.4). A dimensao so e certa depois, no worker. */
export function conferirArquivo(arquivo: { type: string; size: number }): string | undefined {
  if (!(TIPOS_ACEITOS as readonly string[]).includes(arquivo.type)) return 'Use JPG, PNG ou WebP.';
  if (arquivo.size > LIMITE_DE_BYTES) return `Esta imagem tem ${megabytes(arquivo.size)} MB. O limite é 5 MB.`;
  return undefined;
}

/**
 * Confere a dimensao no navegador quando ele sabe ler a imagem. Conveniencia:
 * a autoridade e o worker, que marca `rejected` com o motivo.
 */
export async function conferirDimensao(arquivo: Blob, proposito: Proposito): Promise<string | undefined> {
  if (typeof globalThis.createImageBitmap !== 'function') return undefined;
  try {
    const bitmap = await globalThis.createImageBitmap(arquivo);
    const { width, height } = bitmap;
    bitmap.close();
    const minimo = DIMENSAO_MINIMA[proposito];
    if (width < minimo.largura || height < minimo.altura) {
      return `A imagem precisa ter pelo menos ${minimo.largura} × ${minimo.altura} pixels. Esta tem ${width} × ${height}.`;
    }
  } catch {
    return undefined;
  }
  return undefined;
}

export class FalhaDeEnvio extends Error {
  constructor(public readonly mensagem: string) {
    super(mensagem);
  }
}

/** Manda os bytes pelo metodo da politica, com progresso (fetch nao informa progresso de envio). */
export function enviarBytes(
  politica: Esquemas['UploadIntent'],
  arquivo: Blob,
  aoProgredir: (porcentagem: number) => void,
): Promise<void> {
  return new Promise((resolver, rejeitar) => {
    const xhr = new XMLHttpRequest();
    const metodo = politica.method ?? 'POST';
    xhr.open(metodo, politica.url);
    xhr.upload.onprogress = (e) => {
      if (e.lengthComputable) aoProgredir(Math.round((e.loaded / e.total) * 100));
    };
    xhr.onload = () => (xhr.status >= 200 && xhr.status < 300 ? resolver() : rejeitar(new FalhaDeEnvio('A imagem não foi enviada.')));
    xhr.onerror = () => rejeitar(new FalhaDeEnvio('A imagem não foi enviada.'));
    if (metodo === 'PUT') {
      for (const [nome, valor] of Object.entries(politica.headers ?? {})) {
        // O navegador define Content-Length sozinho e recusa quem tenta.
        if (nome.toLowerCase() !== 'content-length') xhr.setRequestHeader(nome, valor);
      }
      xhr.send(arquivo);
    } else {
      const formulario = new FormData();
      for (const [nome, valor] of Object.entries(politica.fields ?? {})) formulario.append(nome, valor);
      formulario.append('file', arquivo);
      xhr.send(formulario);
    }
  });
}

/** Politica + bytes. Devolve o `upload_id` que a escrita do item confirma. */
export async function enviarImagem(
  api: ClienteDaApi,
  arquivo: File,
  proposito: Proposito,
  aoProgredir: (porcentagem: number) => void,
): Promise<string> {
  const { data, response } = await api.POST('/admin/media/catalog-image-intents', {
    body: { purpose: proposito, content_type: arquivo.type as TipoAceito, byte_size: arquivo.size },
  });
  if (!data) {
    if (response.status === 415) throw new FalhaDeEnvio('Use JPG, PNG ou WebP.');
    throw new FalhaDeEnvio('A imagem não foi enviada.');
  }
  await enviarBytes(data, arquivo, aoProgredir);
  return data.upload_id;
}
