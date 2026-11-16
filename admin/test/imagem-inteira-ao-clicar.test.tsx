/**
 * A IMAGEM INTEIRA AO CLICAR NA MINIATURA (cliente, 15/11/2026: *"no upload do
 * cadastro das imagens de Rede, ainda esta aparecendo cortado quando eu clico em
 * cima, precisa corrigir para abrir a imagem completa"*).
 *
 * ## O que foi medido antes de escrever isto, em 15/11/2026
 *
 * No painel, com o dublê da Rede e uma imagem de 1200 x 400:
 *
 * - a miniatura é um quadrado com `object-fit: cover` — `naturalWidth` 1200 e
 *   `naturalHeight` 400 desenhados em 146 x 146 —, então o corte é **da tela**, e
 *   não do arquivo (o arquivo que subiu nas posições 1+ já é inteiro desde
 *   05/11/2026, `proporcaoDaMolduraNaPosicao`);
 * - **o clique na miniatura não abria nada**: nenhum ancestral `button`, nenhum
 *   `onclick`, zero diálogos no documento depois do clique. Não havia onde ver a
 *   imagem sem corte, e é isso que ele chama de "ainda aparecendo cortado".
 *
 * ## O que cada caso prova, e o que desligar para ele reprovar
 *
 * | caso | o que desligar |
 * |---|---|
 * | clicar na miniatura ABRE um diálogo com a imagem, pelo mesmo endereço | tirar o botão `data-abrir` da miniatura |
 * | o que abre é o VISOR, e não o diálogo de recorte | abrir `DialogoDeRecorte` no lugar |
 * | o visor é fechável, por botão e por Esc | tirar o `aoFechar` ou o botão |
 * | a regra que pinta o visor NÃO corta (`contain`, e não `cover`) | trocar `contain` por `cover` em `.visor-img img` |
 *
 * O último caso lê o CSS como texto porque o jsdom não aplica folha de estilo: o
 * mesmo caminho de `sem-cor-a-mao.test.ts`. Ele tem controle positivo — o detector
 * precisa ENXERGAR o `cover` da miniatura — para varredura vazia não passar verde.
 */
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { useState } from 'react';
import { describe, expect, it, vi } from 'vitest';

import { Galeria, type ImagemDaGaleria } from '../src/componentes/Galeria.tsx';

const CAPA = 'https://midia.bichu.app/network-events/capa-1280x720.jpeg';
const FOTO = 'https://midia.bichu.app/network-events/foto-1200x400.jpeg';

function galeriaDoEncontro(): ImagemDaGaleria[] {
  return [
    { chave: 'a', uploadId: 'u-1', alt: 'Capa', estado: 'ready', previa: CAPA },
    { chave: 'b', uploadId: 'u-2', alt: 'Foto', estado: 'ready', previa: FOTO },
  ];
}

function GaleriaDeTeste({ imagens: iniciais = galeriaDoEncontro() }: { imagens?: ImagemDaGaleria[] }) {
  const [imagens, setImagens] = useState<ImagemDaGaleria[]>(iniciais);
  return (
    <Galeria
      id="fotos"
      titulo="Fotos"
      principal="Capa"
      imagens={imagens}
      aoMudar={(atualizar) => setImagens(atualizar)}
      enviar={vi.fn(() => Promise.resolve('x'))}
      proposito="network_event"
      mostrarErrosDeDescricao={false}
      descricaoObrigatoria={false}
    />
  );
}

const abrir = (posicao: number) => screen.getByRole('button', { name: `Ver inteira a imagem ${posicao} de 2` });

describe('clicar na miniatura abre a imagem inteira', () => {
  it('a FOTO (posição 2) abre num diálogo, com o mesmo endereço da miniatura', async () => {
    render(<GaleriaDeTeste />);
    fireEvent.click(abrir(2));

    const visor = await screen.findByRole('dialog');
    const imagem = within(visor).getByRole('img');
    expect(imagem).toHaveAttribute('src', FOTO);
    // E é a foto que ele clicou, e não a capa que está ao lado.
    expect(imagem).not.toHaveAttribute('src', CAPA);
  });

  it('a CAPA (posição 1) também abre, pelo endereço dela', async () => {
    render(<GaleriaDeTeste />);
    fireEvent.click(abrir(1));
    expect(within(await screen.findByRole('dialog')).getByRole('img')).toHaveAttribute('src', CAPA);
  });

  it('o que abre é o VISOR, e não o diálogo de recorte', async () => {
    render(<GaleriaDeTeste />);
    fireEvent.click(abrir(2));
    await screen.findByTestId('visor-img');
    // O recorte é do ENVIO, e reenquadrar é outro botão: ver não reenquadra.
    expect(screen.queryByTestId('recorte-palco')).toBeNull();
    expect(screen.queryByRole('button', { name: 'Usar este enquadramento' })).toBeNull();
  });

  it('o visor fecha pelo botão e pelo Esc', async () => {
    render(<GaleriaDeTeste />);
    fireEvent.click(abrir(2));
    fireEvent.click(await screen.findByRole('button', { name: 'Fechar' }));
    await waitFor(() => {
      expect(screen.queryByTestId('visor-img')).toBeNull();
    });

    fireEvent.click(abrir(2));
    await screen.findByTestId('visor-img');
    fireEvent.keyDown(document, { key: 'Escape' });
    await waitFor(() => {
      expect(screen.queryByTestId('visor-img')).toBeNull();
    });
  });

  it('a imagem que ainda não tem prévia não oferece o visor', () => {
    render(<GaleriaDeTeste imagens={[{ chave: 'c', alt: '', estado: 'enviando', progresso: 10 }]} />);
    expect(screen.queryByRole('button', { name: /^Ver inteira a imagem/ })).toBeNull();
  });
});

describe('a regra que pinta o visor não corta', () => {
  const CSS = readFileSync(path.resolve(import.meta.dirname, '../src/theme/componentes.css'), 'utf8');

  /** O corpo de um seletor, como texto. */
  function regra(seletor: string): string {
    const i = CSS.indexOf(`\n${seletor} {`);
    expect(i, `seletor ${seletor} não existe em componentes.css`).toBeGreaterThan(-1);
    return CSS.slice(i, CSS.indexOf('}', i));
  }

  it('CONTROLE POSITIVO: o detector enxerga o `cover` da miniatura', () => {
    expect(regra('.tile-img img')).toMatch(/object-fit:\s*cover/);
  });

  it('`.visor-img img` usa `contain`, e nunca `cover`', () => {
    const corpo = regra('.visor-img img');
    expect(corpo).toMatch(/object-fit:\s*contain/);
    expect(corpo).not.toMatch(/object-fit:\s*cover/);
    // Caber dentro da janela sem esticar: é isto que mantém a proporção.
    expect(corpo).toMatch(/max-width:\s*100%/);
    expect(corpo).toMatch(/max-height:/);
  });

  it('a janela do visor é limitada pela JANELA do navegador, sem rolagem horizontal', () => {
    // Medido em 15/11/2026: `max-width: 100%` não segura, porque a coluna do
    // `.scrim` cresce com o conteúdo (diálogo de 896 px numa janela de 375).
    expect(regra('.dialog:has(.visor-img)')).toMatch(/width:\s*min\([^)]*100vw/);
  });
});
