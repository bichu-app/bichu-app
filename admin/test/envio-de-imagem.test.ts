/**
 * Dimensao minima da imagem de catalogo (01/10): 600 x 600 no encontro, 800 x
 * 800 na Loja. O painel confere antes, manda `width`/`height` no pedido da
 * intencao, e trata o 422 `image-too-small` com o minimo e o tamanho lido.
 *
 * A RECUSA MUDOU DE REDACAO em 02/11/2026, com o piso da foto do local: ela
 * terminava em *"Escolha outra imagem."*, que dava um numero e um impasse.
 * Agora diz o que fazer -- foto maior, e que o enquadramento corta. Os casos
 * daqui medem o ENCONTRO e a LOJA, cujos pisos nao mudaram, de proposito: a
 * frase e a mesma para todo proposito, e e isso que eles cobram.
 */
import { afterEach, describe, expect, it, vi } from 'vitest';

import { criarClienteDaApi } from '../src/api/cliente.ts';
import { conferirDimensao, DIMENSAO_MINIMA, enviarImagem, FalhaDeEnvio } from '../src/componentes/envio-de-imagem.ts';
import { criarServidorFalso, problema } from './apoio/servidor-falso.ts';

function comDimensao(width: number, height: number) {
  vi.stubGlobal('createImageBitmap', () => Promise.resolve({ width, height, close: () => undefined }));
}

afterEach(() => vi.unstubAllGlobals());

const arquivo = () => new File([new Uint8Array(10)], 'foto.jpg', { type: 'image/jpeg' });

describe('dimensao minima por proposito', () => {
  it('encontro 600 x 600; Loja continua 800 x 800', () => {
    expect(DIMENSAO_MINIMA.network_event).toEqual({ largura: 600, altura: 600 });
    expect(DIMENSAO_MINIMA.store_item).toEqual({ largura: 800, altura: 800 });
  });

  it('700 x 700 passa no encontro e e recusada na Loja; 599 de altura e recusada no encontro', async () => {
    comDimensao(700, 700);
    expect(await conferirDimensao(arquivo(), 'network_event')).toBeUndefined();
    expect(await conferirDimensao(arquivo(), 'store_item')).toBe(
      'A imagem precisa ter pelo menos 800 × 800 pixels. Esta tem 700 × 700. Escolha uma foto maior: o enquadramento corta a imagem, e dar zoom corta mais ainda.',
    );
    comDimensao(1200, 599);
    expect(await conferirDimensao(arquivo(), 'network_event')).toBe(
      'A imagem precisa ter pelo menos 600 × 600 pixels. Esta tem 1200 × 599. Escolha uma foto maior: o enquadramento corta a imagem, e dar zoom corta mais ainda.',
    );
  });

  // O CASO DO CLIENTE, 02/11/2026, com os numeros dele: a foto saiu do recorte
  // 16:9 com 1028 x 578 e o piso e 1280 x 720. Ela CONTINUA recusada, e esta
  // certo -- ela e pequena para a faixa do topo da ficha. O que mudou e que a
  // recusa passou a ser alcancavel e a dizer o que fazer.
  it('a foto do local: 1028 × 578 e recusada, e a frase diz o que fazer', async () => {
    comDimensao(1028, 578);
    expect(await conferirDimensao(arquivo(), 'directory_photo')).toBe(
      'A imagem precisa ter pelo menos 1280 × 720 pixels. Esta tem 1028 × 578. Escolha uma foto maior: o enquadramento corta a imagem, e dar zoom corta mais ainda.',
    );
    // E 1280 x 720 EXATO passa: o piso e a maior derivada, e nada e ampliado.
    comDimensao(1280, 720);
    expect(await conferirDimensao(arquivo(), 'directory_photo')).toBeUndefined();
    expect(await conferirDimensao(arquivo(), 'directory_gallery')).toBeUndefined();
  });
});

describe('pedido da intencao', () => {
  it('manda width e height lidos do arquivo', async () => {
    comDimensao(1200, 900);
    const servidor = criarServidorFalso({ 'POST /admin/media/catalog-image-intents': problema(500, 'internal') });
    const api = criarClienteDaApi({ fetch: servidor.fetch });
    await expect(enviarImagem(api, arquivo(), 'network_event', () => undefined)).rejects.toBeInstanceOf(FalhaDeEnvio);
    expect(servidor.requisicoes[0]?.corpo).toEqual({ purpose: 'network_event', content_type: 'image/jpeg', byte_size: 10, width: 1200, height: 900 });
  });

  it('sem leitura de dimensao no navegador, o pedido sai sem width e height (o worker confere nos bytes)', async () => {
    const servidor = criarServidorFalso({ 'POST /admin/media/catalog-image-intents': problema(500, 'internal') });
    await expect(enviarImagem(criarClienteDaApi({ fetch: servidor.fetch }), arquivo(), 'network_event', () => undefined)).rejects.toThrow();
    expect(servidor.requisicoes[0]?.corpo).toEqual({ purpose: 'network_event', content_type: 'image/jpeg', byte_size: 10 });
  });

  it('422 image-too-small vira a mensagem com o minimo do proposito e o tamanho lido', async () => {
    comDimensao(500, 500);
    const servidor = criarServidorFalso({
      'POST /admin/media/catalog-image-intents': problema(422, 'image-too-small', { errors: [{ field: 'width', code: 'minimum' }] }),
    });
    const envio = enviarImagem(criarClienteDaApi({ fetch: servidor.fetch }), arquivo(), 'network_event', () => undefined);
    await expect(envio).rejects.toMatchObject({
      mensagem:
        'A imagem precisa ter pelo menos 600 × 600 pixels. Esta tem 500 × 500. Escolha uma foto maior: o enquadramento corta a imagem, e dar zoom corta mais ainda.',
    });
  });
});
