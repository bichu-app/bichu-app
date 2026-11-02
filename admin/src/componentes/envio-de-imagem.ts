import type { ClienteDaApi, Esquemas } from '../api/cliente.ts';
import { tipoDoProblema } from '../api/problema.ts';

/**
 * Envio de imagem de catalogo (ADR-0007, `createAdminCatalogImageIntent`): o
 * painel pede a politica, manda os bytes direto ao armazenamento e so depois a
 * escrita do item confirma o envio com o `upload_id`.
 */
export const TIPOS_ACEITOS = ['image/jpeg', 'image/png', 'image/webp'] as const;
export type TipoAceito = (typeof TIPOS_ACEITOS)[number];
/** 5 MiB, o `maximum` de `byte_size` no contrato. */
export const LIMITE_DE_BYTES = 5_242_880;
export const MAXIMO_DE_IMAGENS = 8;

/**
 * O teto COMO A TELA O ESCREVE ("5 MB"), derivado do limite em bytes: 5_242_880 /
 * 1_048_576 = 5.
 */
export const LIMITE_EM_MB = (LIMITE_DE_BYTES / 1_048_576).toLocaleString('pt-BR', {
  maximumFractionDigits: 1,
});

/**
 * A orientacao de tamanho, para ficar SEMPRE em tela e nao so no erro (pedido do
 * cliente de 18/10/2026: *"devemos sempre trazer essa informacao para o usuario na
 * pagina como orientacao"*).
 */
export const ORIENTACAO_DE_TAMANHO = `Envie uma imagem de até ${LIMITE_EM_MB} MB.`;

export type Proposito = Esquemas['AdminCatalogImageIntentInput']['purpose'];

/**
 * As minimas do contrato (`AdminCatalogImageIntentInput`): 800 x 800 na Loja, 600
 * x 600 no encontro (01/10), e desde 18/10/2026 a logo e a foto do diretorio --
 * 256 x 256 na logo, que e quadrada e pequena.
 *
 * ## A FOTO E A GALERIA DO LOCAL SAO 1280 x 720 DESDE 02/11/2026
 *
 * Eram 600 x 600, o numero da LOGO, que e QUADRADA -- e os dois propositos sao
 * enquadrados em 16:9 (`PROPORCAO_DA_MOLDURA`). Uma faixa 16:9 so alcanca 600
 * de altura com 1067 de largura, entao o piso velho era uma **regra
 * impossivel**: o cliente escolheu uma foto de 1028 de largura, o recorte saiu
 * com 578 de altura e a tela recusou por um numero que o proprio recorte nao
 * conseguia entregar.
 *
 * 1280 x 720 e o tamanho da MAIOR derivada do servidor (`banner`), escolhido
 * pelo cliente em 02/11/2026: no piso nada e ampliado.
 *
 * O caso que impede o proximo vazamento de numero esta em
 * `test/recorte-de-imagem.test.ts`: **todo proposito com moldura tem de ter o
 * piso alcancavel nessa moldura**. `network_event` ainda nao tem, e isso espera
 * decisao do cliente.
 */
export const DIMENSAO_MINIMA: Record<Proposito, { largura: number; altura: number }> = {
  store_item: { largura: 800, altura: 800 },
  network_event: { largura: 600, altura: 600 },
  directory_logo: { largura: 256, altura: 256 },
  directory_photo: { largura: 1280, altura: 720 },
  directory_gallery: { largura: 1280, altura: 720 },
};

/**
 * A recusa COMO O OPERADOR A LE, e ela nao fala "16:9": o cliente perdeu tempo
 * exatamente aqui. A frase antiga era *"A imagem precisa ter pelo menos 600 ×
 * 600 pixels. Esta tem 1028 × 578. Escolha outra imagem."* -- ela dava um
 * numero e um impasse, sem dizer por que a foto grande que ele escolheu virou
 * um recorte pequeno, nem o que fazer.
 *
 * Agora ela diz **o que fazer**: foto maior, e que o enquadramento corta (e o
 * zoom corta mais). Os numeros saem de [DIMENSAO_MINIMA], proposito a
 * proposito, e nunca escritos a mao.
 */
function textoDaMinima(proposito: Proposito, dimensao?: { width: number; height: number }): string {
  const m = DIMENSAO_MINIMA[proposito];
  const base = `A imagem precisa ter pelo menos ${String(m.largura)} × ${String(m.altura)} pixels.`;
  const saida = 'Escolha uma foto maior: o enquadramento corta a imagem, e dar zoom corta mais ainda.';
  return dimensao ? `${base} Esta tem ${String(dimensao.width)} × ${String(dimensao.height)}. ${saida}` : `${base} ${saida}`;
}

/**
 * Largura e altura como o navegador as le do arquivo; `undefined` quando ele nao
 * sabe ler.
 */
export async function lerDimensao(arquivo: Blob): Promise<{ width: number; height: number } | undefined> {
  if (typeof globalThis.createImageBitmap !== 'function') return undefined;
  try {
    const bitmap = await globalThis.createImageBitmap(arquivo);
    const { width, height } = bitmap;
    bitmap.close();
    return { width, height };
  } catch {
    return undefined;
  }
}

function megabytes(bytes: number): string {
  return (bytes / 1_048_576).toLocaleString('pt-BR', { maximumFractionDigits: 1, minimumFractionDigits: 1 });
}

/** O que da para conferir antes do envio (UX 29.4). */
export function conferirArquivo(arquivo: { type: string; size: number }): string | undefined {
  if (!(TIPOS_ACEITOS as readonly string[]).includes(arquivo.type)) return 'Use JPG, PNG ou WebP.';
  if (arquivo.size > LIMITE_DE_BYTES) return `Esta imagem tem ${megabytes(arquivo.size)} MB. O limite é ${LIMITE_EM_MB} MB.`;
  return undefined;
}

/** Confere a dimensao no navegador quando ele sabe ler a imagem. */
export async function conferirDimensao(arquivo: Blob, proposito: Proposito): Promise<string | undefined> {
  const d = await lerDimensao(arquivo);
  if (!d) return undefined;
  const minimo = DIMENSAO_MINIMA[proposito];
  return d.width < minimo.largura || d.height < minimo.altura ? textoDaMinima(proposito, d) : undefined;
}

export class FalhaDeEnvio extends Error {
  constructor(public readonly mensagem: string) {
    super(mensagem);
  }
}

/**
 * Manda os bytes pelo metodo da politica, com progresso (fetch nao informa
 * progresso de envio).
 */
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
  const dimensao = await lerDimensao(arquivo);
  const { data, error, response } = await api.POST('/admin/media/catalog-image-intents', {
    body: { purpose: proposito, content_type: arquivo.type as TipoAceito, byte_size: arquivo.size, ...(dimensao ?? {}) },
  });
  if (!data) {
    if (response.status === 415) throw new FalhaDeEnvio('Use JPG, PNG ou WebP.');
    if (response.status === 422 && tipoDoProblema(error) === 'image-too-small') throw new FalhaDeEnvio(textoDaMinima(proposito, dimensao));
    throw new FalhaDeEnvio('A imagem não foi enviada.');
  }
  await enviarBytes(data, arquivo, aoProgredir);
  return data.upload_id;
}
