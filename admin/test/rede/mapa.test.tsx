import { fireEvent, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { useState } from 'react';
import { describe, expect, it, vi } from 'vitest';

import type { Ponto } from '../../src/rede/dominio/tipos.ts';
import { SeletorDePonto, URL_DOS_TILES } from '../../src/rede/mapa/SeletorDePonto.tsx';

function Controlado({ inicial = null, aoMudar }: { inicial?: Ponto | null; aoMudar?: (p: Ponto | null) => void }) {
  const [p, setP] = useState<Ponto | null>(inicial);
  return (
    <SeletorDePonto
      ponto={p}
      aoMudar={(novo) => {
        aoMudar?.(novo);
        setP(novo);
      }}
    />
  );
}

describe('seletor de ponto no mapa', () => {
  it('sem ponto diz que nada foi marcado, e o mapa é alcançável pelo teclado', () => {
    render(<Controlado />);
    expect(screen.getByText('Nenhum ponto marcado.')).toBeInTheDocument();
    const mapa = screen.getByRole('application', { name: 'Mapa para marcar o ponto do encontro' });
    expect(mapa).toHaveAttribute('tabindex', '0');
    expect(mapa).toHaveAccessibleDescription(/Setas movem a mira\. Enter marca o ponto\. \+ aproxima e − afasta\./);
  });

  it('Enter marca o centro da mira, sem mouse (WCAG 2.1.1)', async () => {
    const aoMudar = vi.fn();
    render(<Controlado aoMudar={aoMudar} />);
    const mapa = screen.getByTestId('mapa');
    mapa.focus();
    await userEvent.keyboard('{Enter}');
    expect(aoMudar).toHaveBeenCalledWith({ lat: -23.5505, lon: -46.6333 });
    expect(screen.getByText('Ponto marcado: −23,5505, −46,6333')).toBeInTheDocument();
  });

  it('seta move o mapa sob a mira antes de marcar', () => {
    const aoMudar = vi.fn();
    render(<Controlado aoMudar={aoMudar} />);
    const mapa = screen.getByTestId('mapa');
    mapa.focus();
    fireEvent.keyDown(mapa, { key: 'ArrowRight', code: 'ArrowRight', keyCode: 39 });
    fireEvent.keyDown(mapa, { key: 'Enter', code: 'Enter', keyCode: 13 });
    const marcado = aoMudar.mock.calls.at(-1)?.[0] as Ponto;
    expect(marcado.lat).toBeCloseTo(-23.5505, 3);
    expect(marcado.lon).toBeGreaterThan(-46.6333);
  });

  it('com ponto mostra a coordenada, Mudar o ponto leva o foco ao mapa e o ponto pode sair', async () => {
    const aoMudar = vi.fn();
    render(<Controlado inicial={{ lat: -23.5731, lon: -46.6293 }} aoMudar={aoMudar} />);
    expect(screen.getByText('Ponto marcado: −23,5731, −46,6293')).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'Mudar o ponto' }));
    expect(screen.getByTestId('mapa')).toHaveFocus();
    await userEvent.click(screen.getByRole('button', { name: 'Tirar o ponto' }));
    expect(aoMudar).toHaveBeenLastCalledWith(null);
    expect(screen.getByText('Nenhum ponto marcado.')).toBeInTheDocument();
  });

  it('tiles que não carregam viram a falha do mapa, e Tentar de novo recria só o mapa', async () => {
    const largura = vi.spyOn(HTMLElement.prototype, 'clientWidth', 'get').mockReturnValue(560);
    const altura = vi.spyOn(HTMLElement.prototype, 'clientHeight', 'get').mockReturnValue(320);
    const { container } = render(<Controlado />);
    const tiles = [...container.querySelectorAll('img.leaflet-tile')];
    expect(tiles.length, 'nenhum tile pedido: o teste nao exercitaria a falha').toBeGreaterThanOrEqual(4);
    tiles.forEach((t) => fireEvent.error(t));
    expect(await screen.findByText('Não conseguimos carregar o mapa agora.')).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'Tentar de novo' }));
    expect(screen.getByTestId('mapa')).toBeInTheDocument();
    largura.mockRestore();
    altura.mockRestore();
  });

  it('carrega tiles só do host que a CSP libera (ADR-0027 item 6)', () => {
    expect(new URL(URL_DOS_TILES.replace(/\{[xyz]\}/g, '0')).host).toBe('tile.openstreetmap.org');
  });
});
