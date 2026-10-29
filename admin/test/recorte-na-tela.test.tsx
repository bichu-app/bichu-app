/**
 * RECORTAR E REPOSICIONAR NA TELA (BICHUS-314, cliente 28 e 29/10/2026:
 * *"um recurso para o usuario subir a imagem e reposicionar a imagem, pois voce
 * esta cropando no lugar errado"*).
 *
 * ## O que cada isca prova, e o que desligar para ela reprovar
 *
 * | isca | o que desligar |
 * |---|---|
 * | **a posição que a pessoa escolheu é a que sai nos bytes enviados** | não abrir o enquadramento, ou mandar o arquivo cru |
 * | o enquadramento abre no campo de UMA imagem (logo e foto do local) | tirar o diálogo de `CampoDeImagem` |
 * | a imagem é lida com a orientação do EXIF aplicada | tirar `imageOrientation: 'from-image'` de `lerImagem` |
 * | escolher VÁRIOS arquivos sobe os vários, sem fila de diálogos | abrir o diálogo também no lote |
 * | cada item do lote pode ser reenquadrado depois, pelo arquivo CRU | reenquadrar a partir de `arquivo` em vez de `original` |
 * | cancelar o enquadramento não envia nada | enviar o arquivo cru ao fechar |
 * | o recorte abaixo da mínima do propósito não pode ser confirmado | tirar a conferência de `curta` do diálogo |
 *
 * **A primeira isca é a do pedido**, e ela reprova pelo NOME em qualquer árvore
 * sem o recurso: sem o diálogo não existe `recorte-palco`, e sem ele não há
 * enquadramento para a pessoa escolher.
 *
 * **Nenhuma isca sobe bytes.** O envio real é `XMLHttpRequest` contra o
 * armazenamento; o que se mede aqui é o ARQUIVO que o painel manda enviar, e
 * dentro dele a janela que o `drawImage` recortou.
 */
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { useState } from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { criarClienteDaApi } from '../src/api/cliente.ts';
import { CampoDeImagem } from '../src/componentes/CampoDeImagem.tsx';
import { Galeria, type ImagemDaGaleria } from '../src/componentes/Galeria.tsx';
import { criarServidorFalso, json } from './apoio/servidor-falso.ts';

/** Um retrato de celular: a foto em que a heurística do servidor desce para a folhagem. */
const RETRATO = { largura: 1600, altura: 2000 };

interface Recorte {
  left: number;
  top: number;
  width: number;
  height: number;
  destino: { largura: number; altura: number };
}

let ultimoDesenho: Recorte | undefined;
const orientacoesPedidas: (string | undefined)[] = [];

/**
 * Um navegador que sabe recortar, de mentira: `createImageBitmap` devolve o
 * tamanho da imagem, o contexto 2D ANOTA a janela de `drawImage` e `toBlob`
 * devolve essa anotação COMO OS BYTES. Assim o arquivo que o painel manda
 * enviar carrega, dentro dele, a região exata que foi recortada -- e a isca
 * mede o que subiu, e não o que a tela desenhou.
 */
function instalarNavegadorQueRecorta(imagem = RETRATO) {
  ultimoDesenho = undefined;
  orientacoesPedidas.length = 0;
  vi.stubGlobal('createImageBitmap', async (blob: Blob, opcoes?: { imageOrientation?: string }) => {
    orientacoesPedidas.push(opcoes?.imageOrientation);
    // Um blob que é a anotação de um recorte "mede" o tamanho desse recorte:
    // é o que faz `enviarImagem` declarar a dimensão do RECORTE na intenção.
    const anotacao = await lerAnotacao(blob);
    return anotacao
      ? { width: anotacao.destino.largura, height: anotacao.destino.altura, close: () => undefined }
      : { width: imagem.largura, height: imagem.altura, close: () => undefined };
  });
  vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockImplementation(function (this: HTMLCanvasElement) {
    // O destino e lido AQUI, e nao dentro do `drawImage`: a tela do recorte ja
    // nasce com o tamanho final, e a do palco pede o contexto de novo a cada
    // render (que e quando a proporcao pode mudar).
    const destino = { largura: this.width, altura: this.height };
    return {
      clearRect: () => undefined,
      drawImage: (_fonte: unknown, left: number, top: number, width: number, height: number) => {
        ultimoDesenho = { left, top, width, height, destino };
      },
    } as unknown as CanvasRenderingContext2D;
  });
  vi.spyOn(HTMLCanvasElement.prototype, 'toBlob').mockImplementation(function (
    this: HTMLCanvasElement,
    devolver: BlobCallback,
    tipo?: string,
  ) {
    devolver(new Blob([JSON.stringify(ultimoDesenho)], { type: tipo ?? 'image/png' }));
  });
  vi.spyOn(URL, 'createObjectURL').mockReturnValue('blob:teste');
  vi.spyOn(URL, 'revokeObjectURL').mockImplementation(() => undefined);
}

async function lerAnotacao(blob: Blob): Promise<Recorte | undefined> {
  try {
    const lido: unknown = JSON.parse(await blob.text());
    return lido && typeof lido === 'object' && 'destino' in lido ? (lido as Recorte) : undefined;
  } catch {
    return undefined;
  }
}

afterEach(() => {
  vi.unstubAllGlobals();
});

const foto = (nome = 'foto.jpg', tipo = 'image/jpeg') => new File(['x'.repeat(2000)], nome, { type: tipo });

function GaleriaDeTeste({ enviar, proposito }: { enviar: (f: File, p: (n: number) => void) => Promise<string>; proposito: 'network_event' | 'store_item' }) {
  const [imagens, setImagens] = useState<ImagemDaGaleria[]>([]);
  return (
    <Galeria
      id="fotos"
      imagens={imagens}
      aoMudar={(atualizar) => setImagens(atualizar)}
      enviar={enviar}
      proposito={proposito}
      mostrarErrosDeDescricao={false}
      descricaoObrigatoria={false}
    />
  );
}

/** Abre o enquadramento escolhendo UM arquivo, e devolve o palco. */
async function escolherUm(testid = 'fotos-arquivo') {
  fireEvent.change(screen.getByTestId(testid), { target: { files: [foto()] } });
  return await screen.findByTestId('recorte-palco');
}

// ---------------------------------------------------------------------------
// A ISCA DO PEDIDO.
// ---------------------------------------------------------------------------
describe('a posição que a pessoa escolhe é a que sai no envio', () => {
  it('mover o enquadramento para cima sobe a janela recortada, e os bytes enviados são os dessa janela', async () => {
    instalarNavegadorQueRecorta();
    const enviados: File[] = [];
    const enviar = vi.fn(async (arquivo: File) => {
      enviados.push(arquivo);
      return Promise.resolve('018f7c1e-0000-7000-8000-00000000000a');
    });
    render(<GaleriaDeTeste enviar={enviar} proposito="network_event" />);

    const palco = await escolherUm();
    // 1600 x 2000 numa moldura 16:9 dá 1600 x 900, centrada em `top` 550.
    expect(screen.getByTestId('recorte-medida')).toHaveTextContent('1600 × 900');
    // Quatro setas para cima, 5% da região visível cada: 550 - 4 x 45 = 370.
    for (let i = 0; i < 4; i++) fireEvent.keyDown(palco, { key: 'ArrowUp' });
    fireEvent.click(screen.getByRole('button', { name: 'Usar este enquadramento' }));

    await waitFor(() => {
      expect(enviar).toHaveBeenCalledTimes(1);
    });
    const anotacao = await lerAnotacao(enviados[0]!);
    expect(anotacao).toEqual({ left: 0, top: 370, width: 1600, height: 900, destino: { largura: 1600, altura: 900 } });
    // E o centro, que é o que o servidor escolheria sozinho, NÃO é o que subiu.
    expect(anotacao?.top).not.toBe(550);
  });

  it('a imagem é lida com a orientação do EXIF já aplicada nos pixeis', async () => {
    instalarNavegadorQueRecorta();
    render(<GaleriaDeTeste enviar={vi.fn(() => Promise.resolve('x'))} proposito="network_event" />);
    await escolherUm();
    expect(orientacoesPedidas).toContain('from-image');
  });

  it('cancelar o enquadramento não envia nada', async () => {
    instalarNavegadorQueRecorta();
    const enviar = vi.fn(() => Promise.resolve('x'));
    render(<GaleriaDeTeste enviar={enviar} proposito="network_event" />);
    await escolherUm();
    fireEvent.click(screen.getByRole('button', { name: 'Cancelar' }));
    await waitFor(() => {
      expect(screen.queryByTestId('recorte-palco')).toBeNull();
    });
    expect(enviar).not.toHaveBeenCalled();
    expect(screen.getByText('0 de 8 imagens')).toBeInTheDocument();
  });

  it('o recorte abaixo da mínima do propósito não pode ser confirmado', async () => {
    // 900 x 900 na Loja: a moldura é livre, mas a mínima é 800 x 800, e o zoom
    // de 4x deixa o recorte em 225 x 225.
    instalarNavegadorQueRecorta({ largura: 900, altura: 900 });
    render(<GaleriaDeTeste enviar={vi.fn(() => Promise.resolve('x'))} proposito="store_item" />);
    await escolherUm();
    const confirmar = screen.getByRole('button', { name: 'Usar este enquadramento' });
    expect(confirmar).toBeEnabled();
    fireEvent.change(screen.getByTestId('recorte-zoom'), { target: { value: '400' } });
    expect(await screen.findByText(/pelo menos 800 × 800 pixels/, { selector: '.help.err' })).toBeInTheDocument();
    expect(confirmar).toBeDisabled();
  });
});

// ---------------------------------------------------------------------------
// O LOTE, e o reenquadramento depois.
// ---------------------------------------------------------------------------
describe('o lote sobe sem fila de diálogos, e cada item é reenquadrável depois', () => {
  it('três arquivos de uma vez sobem os três, e nenhum diálogo abre', async () => {
    instalarNavegadorQueRecorta();
    const enviar = vi.fn(() => Promise.resolve('018f7c1e-0000-7000-8000-00000000000b'));
    render(<GaleriaDeTeste enviar={enviar} proposito="network_event" />);
    fireEvent.change(screen.getByTestId('fotos-arquivo'), { target: { files: [foto('a.jpg'), foto('b.jpg'), foto('c.jpg')] } });
    await waitFor(() => {
      expect(enviar).toHaveBeenCalledTimes(3);
    });
    expect(screen.queryByTestId('recorte-palco')).toBeNull();
  });

  it('reenquadrar um item do lote parte do arquivo CRU, e não do recorte anterior', async () => {
    instalarNavegadorQueRecorta();
    const enviados: File[] = [];
    const enviar = vi.fn(async (arquivo: File) => {
      enviados.push(arquivo);
      return Promise.resolve('018f7c1e-0000-7000-8000-00000000000c');
    });
    render(<GaleriaDeTeste enviar={enviar} proposito="network_event" />);
    fireEvent.change(screen.getByTestId('fotos-arquivo'), { target: { files: [foto('a.jpg'), foto('b.jpg')] } });
    await waitFor(() => {
      expect(enviar).toHaveBeenCalledTimes(2);
    });

    fireEvent.click(await screen.findByRole('button', { name: 'Reenquadrar a imagem 2 de 2' }));
    const palco = await screen.findByTestId('recorte-palco');
    // O palco mede a imagem CRUA (1600 x 2000), e não o recorte de 1600 x 900
    // que já subiu: reenquadrar a partir do recorte impediria afastar o zoom.
    expect(screen.getByTestId('recorte-medida')).toHaveTextContent('1600 × 900');
    fireEvent.keyDown(palco, { key: 'ArrowDown' });
    fireEvent.click(screen.getByRole('button', { name: 'Usar este enquadramento' }));
    await waitFor(() => {
      expect(enviar).toHaveBeenCalledTimes(3);
    });
    const anotacao = await lerAnotacao(enviados[2]!);
    expect(anotacao).toEqual({ left: 0, top: 595, width: 1600, height: 900, destino: { largura: 1600, altura: 900 } });
  });
});

// ---------------------------------------------------------------------------
// O CAMPO DE UMA IMAGEM: a logo e a foto do local do diretorio.
// ---------------------------------------------------------------------------
describe('o campo de uma imagem também enquadra', () => {
  it('a logo abre o enquadramento 1:1, e a intenção de envio declara a dimensão do RECORTE', async () => {
    instalarNavegadorQueRecorta();
    const servidor = criarServidorFalso({
      'POST /admin/media/catalog-image-intents': json(201, {
        upload_id: '018f7c1e-0000-7000-8000-00000000000d',
        url: 'https://armazenamento.example/envio',
        method: 'PUT',
        headers: {},
        expires_at: '2026-10-29T12:00:00.000Z',
      }),
    });
    render(
      <CampoDeImagem
        id="e-logo"
        rotulo="Logo"
        proposito="directory_logo"
        api={criarClienteDaApi({ fetch: servidor.fetch })}
        uploadId={undefined}
        aoMudar={vi.fn()}
      />,
    );

    const palco = await escolherUm('e-logo-arquivo');
    // 1600 x 2000 numa moldura 1:1 dá 1600 x 1600.
    expect(screen.getByTestId('recorte-medida')).toHaveTextContent('1600 × 1600');
    fireEvent.keyDown(palco, { key: 'ArrowUp' });
    fireEvent.click(screen.getByRole('button', { name: 'Usar este enquadramento' }));

    await waitFor(() => {
      expect(servidor.requisicoes.length).toBe(1);
    });
    // A dimensão declarada é a do RECORTE (1600 x 1600), e não a do arquivo
    // escolhido (1600 x 2000): é o recorte que sobe.
    expect(servidor.requisicoes[0]?.corpo).toMatchObject({ purpose: 'directory_logo', width: 1600, height: 1600 });
  });
});
