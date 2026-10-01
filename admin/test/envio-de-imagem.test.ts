/**
 * Dimensao minima da imagem de catalogo (01/10): 600 x 600 no encontro, 800 x
 * 800 na Loja. O painel confere antes, manda `width`/`height` no pedido da
 * intencao, e trata o 422 `image-too-small` com o minimo e o tamanho lido.
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
    expect(await conferirDimensao(arquivo(), 'store_item')).toBe('A imagem precisa ter pelo menos 800 × 800 pixels. Esta tem 700 × 700. Escolha outra imagem.');
    comDimensao(1200, 599);
    expect(await conferirDimensao(arquivo(), 'network_event')).toBe('A imagem precisa ter pelo menos 600 × 600 pixels. Esta tem 1200 × 599. Escolha outra imagem.');
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
    await expect(envio).rejects.toMatchObject({ mensagem: 'A imagem precisa ter pelo menos 600 × 600 pixels. Esta tem 500 × 500. Escolha outra imagem.' });
  });
});
