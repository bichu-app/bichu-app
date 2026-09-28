import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { useEffect } from 'react';
import { createMemoryRouter, RouterProvider } from 'react-router';
import { describe, expect, it, vi } from 'vitest';

import { lerPrazos, prazosDaResposta, renovarPorUso } from '../src/sessao/prazos.ts';
import { ProvedorDeSessao, useSessao } from '../src/sessao/ProvedorDeSessao.tsx';
import { criarRotas } from '../src/rotas.tsx';
import { criarServidorFalso, json, problema, sessaoCom, SESSAO, type Rota, type Resposta } from './apoio/servidor-falso.ts';

function Escritor({ aoMontar }: { aoMontar?: (s: ReturnType<typeof useSessao>) => void }) {
  const sessao = useSessao();
  useEffect(() => aoMontar?.(sessao), [sessao, aoMontar]);
  return (
    <>
      <p>Olá, {sessao.nome}</p>
      <button type="button" onClick={() => void sessao.api.POST('/admin/store/tags', { body: { label: 'Porte medio' } })}>
        escrever
      </button>
      <button type="button" onClick={() => void sessao.api.GET('/admin/store/tags')}>
        ler
      </button>
    </>
  );
}

function montar(rotas: Record<string, Rota | Resposta>, props: { agora?: () => number } = {}) {
  const servidor = criarServidorFalso(rotas);
  const navegarParaFora = vi.fn();
  render(
    <ProvedorDeSessao fetch={servidor.fetch} navegarParaFora={navegarParaFora} rotaAtual={() => '/loja/novo'} {...props}>
      <Escritor />
    </ProvedorDeSessao>,
  );
  return { servidor, navegarParaFora };
}

describe('sessao por cookie com anti-CSRF (ADR-0027 itens 2 e 3)', () => {
  it('carrega a sessao e manda X-CSRF-Token em metodo nao seguro, e so nele', async () => {
    const { servidor } = montar({
      'GET /admin/session': json(200, SESSAO),
      'POST /admin/store/tags': json(201, { slug: 'porte-medio', label: 'Porte medio', active: true, item_count: 0, created_at: '', updated_at: '', version: 1 }),
      'GET /admin/store/tags': json(200, { items: [], page: 1, limit: 50, total: 0 }),
    });
    await screen.findByText('Olá, Marina Rocha');
    fireEvent.click(screen.getByRole('button', { name: 'escrever' }));
    fireEvent.click(screen.getByRole('button', { name: 'ler' }));
    await waitFor(() => expect(servidor.requisicoes).toHaveLength(3));
    const sessao = servidor.requisicoes.find((r) => r.caminho === '/admin/session');
    const escrita = servidor.requisicoes.find((r) => r.metodo === 'POST');
    const leitura = servidor.requisicoes.find((r) => r.caminho === '/admin/store/tags' && r.metodo === 'GET');
    expect(sessao?.cabecalhos.get('X-CSRF-Token')).toBeNull();
    expect(escrita?.metodo).toBe('POST');
    expect(escrita?.cabecalhos.get('X-CSRF-Token')).toBe(SESSAO.csrf_token);
    expect(leitura?.cabecalhos.get('X-CSRF-Token')).toBeNull();
    // Mesma origem, cookie pelo navegador; nunca Bearer (D36).
    for (const r of servidor.requisicoes) {
      expect(r.credenciais).toBe('same-origin');
      expect(r.cabecalhos.get('Authorization')).toBeNull();
    }
  });

  it('a reautenticacao rotaciona o token: a escrita seguinte leva o novo', async () => {
    let sessaoAtual: ReturnType<typeof useSessao> | undefined;
    const servidor = criarServidorFalso({
      'GET /admin/session': json(200, SESSAO),
      'POST /admin/auth/reauth': json(200, { reauth_token: 'reauth-1', expires_in: 300, scope: 'store_item_retirement', csrf_token: 'csrf-novo-0123456789abcdef0123456789abcd' }),
      'POST /admin/store/tags': json(201, {}),
    });
    render(
      <ProvedorDeSessao fetch={servidor.fetch} navegarParaFora={vi.fn()}>
        <Escritor aoMontar={(s) => {
          sessaoAtual = s;
        }} />
      </ProvedorDeSessao>,
    );
    await screen.findByText('Olá, Marina Rocha');
    const r = await sessaoAtual!.reautenticar('uma frase longa de verdade', 'store_item_retirement');
    expect(r).toEqual({ ok: true, token: 'reauth-1' });
    fireEvent.click(screen.getByRole('button', { name: 'escrever' }));
    await waitFor(() => expect(servidor.requisicoes.at(-1)?.caminho).toBe('/admin/store/tags'));
    expect(servidor.requisicoes.find((x) => x.caminho === '/admin/auth/reauth')?.cabecalhos.get('X-CSRF-Token')).toBe(SESSAO.csrf_token);
    expect(servidor.requisicoes.at(-1)?.cabecalhos.get('X-CSRF-Token')).toBe('csrf-novo-0123456789abcdef0123456789abcd');
  });

  it('senha errada na reautenticacao NAO derruba a sessao', async () => {
    let sessaoAtual: ReturnType<typeof useSessao> | undefined;
    const navegarParaFora = vi.fn();
    const servidor = criarServidorFalso({
      'GET /admin/session': json(200, SESSAO),
      'POST /admin/auth/reauth': problema(401, 'invalid-credentials'),
    });
    render(
      <ProvedorDeSessao fetch={servidor.fetch} navegarParaFora={navegarParaFora}>
        <Escritor aoMontar={(s) => {
          sessaoAtual = s;
        }} />
      </ProvedorDeSessao>,
    );
    await screen.findByText('Olá, Marina Rocha');
    expect(await sessaoAtual!.reautenticar('errada', 'store_item_retirement')).toEqual({ ok: false, motivo: 'incorreta' });
    await new Promise((r) => setTimeout(r, 20));
    expect(navegarParaFora).not.toHaveBeenCalled();
  });

  it('sem sessao na primeira visita manda entrar, sem aviso de sessao terminada', async () => {
    const { navegarParaFora } = montar({ 'GET /admin/session': problema(401, 'unauthenticated') });
    await waitFor(() => expect(navegarParaFora).toHaveBeenCalledWith('/entrar/?volta=%2Floja%2Fnovo'));
  });

  it('sessao que cai no meio do trabalho manda entrar com 1.7 e volta para a rota', async () => {
    const { navegarParaFora } = montar({
      'GET /admin/session': json(200, SESSAO),
      'POST /admin/store/tags': problema(401, 'token-expired'),
    });
    await screen.findByText('Olá, Marina Rocha');
    fireEvent.click(screen.getByRole('button', { name: 'escrever' }));
    await waitFor(() => expect(navegarParaFora).toHaveBeenCalledWith('/entrar/?motivo=expirada&volta=%2Floja%2Fnovo'));
  });
});

describe('prazos da sessao (UX 29.2)', () => {
  const inicio = Date.parse('2026-09-28T12:00:00Z');
  const prazos = prazosDaResposta(sessaoCom(inicio), inicio);

  it('S.1 aos 28 minutos sem uso; S.2 a 10 minutos do teto; vencida no fim', () => {
    expect(lerPrazos(prazos, inicio + 27 * 60_000).avisarInatividade).toBe(false);
    expect(lerPrazos(prazos, inicio + 28 * 60_000).avisarInatividade).toBe(true);
    expect(lerPrazos(prazos, inicio + 30 * 60_000).vencida).toBe(true);

    let usado = prazos;
    for (let t = 0; t < 12 * 60; t += 20) usado = renovarPorUso(usado, inicio + t * 60_000);
    expect(lerPrazos(usado, inicio + (11 * 60 + 49) * 60_000).avisarTeto).toBe(false);
    expect(lerPrazos(usado, inicio + (11 * 60 + 50) * 60_000).avisarTeto).toBe(true);
    // O uso nao empurra o teto.
    expect(lerPrazos(usado, inicio + 12 * 3_600_000).vencida).toBe(true);
  });

  it('o uso renova a inatividade descontando o minuto de folga do servidor', () => {
    const renovado = renovarPorUso(prazos, inicio + 10 * 60_000);
    expect(renovado.fimPorInatividade).toBe(inicio + 39 * 60_000);
  });

  it('o dialogo S.1 aparece e "Continuar conectado" renova no servidor', async () => {
    let agora = Date.parse('2026-09-28T12:00:00Z');
    const servidor = criarServidorFalso({ 'GET /admin/session': () => json(200, sessaoCom(agora)) });
    vi.useFakeTimers({ shouldAdvanceTime: true, now: agora });
    try {
      render(
        <ProvedorDeSessao fetch={servidor.fetch} navegarParaFora={vi.fn()} agora={() => agora}>
          <Escritor />
        </ProvedorDeSessao>,
      );
      await screen.findByText('Olá, Marina Rocha');
      agora += 28 * 60_000 + 1000;
      await act(async () => {
        await vi.advanceTimersByTimeAsync(28 * 60_000 + 1000);
      });
      const dialogo = await screen.findByRole('alertdialog', { name: 'Sua sessão termina em 2 minutos por falta de uso.' });
      expect(screen.getByRole('button', { name: 'Continuar conectado' })).toHaveFocus();
      fireEvent.click(screen.getByRole('button', { name: 'Continuar conectado' }));
      await waitFor(() => expect(dialogo).not.toBeInTheDocument());
      expect(servidor.requisicoes.filter((r) => r.caminho === '/admin/session')).toHaveLength(2);
    } finally {
      vi.useRealTimers();
    }
  });

  it('S.2: o banner do teto aparece na casca', async () => {
    const agora = Date.parse('2026-09-28T12:00:00Z');
    const servidor = criarServidorFalso({
      'GET /admin/session': json(200, sessaoCom(agora, { absolute_expires_at: new Date(agora + 9 * 60_000).toISOString() })),
      'GET /admin/store/items': json(200, { items: [], page: 1, limit: 20, total: 0, effective_sort: 'atualizado' }),
    });
    const router = createMemoryRouter(criarRotas({ fetch: servidor.fetch, navegarParaFora: vi.fn(), agora: () => agora }), {
      initialEntries: ['/loja'],
    });
    render(<RouterProvider router={router} />);
    expect(await screen.findByText('Sua sessão termina em 10 minutos. Salve o que estiver fazendo; depois, entre de novo.')).toBeInTheDocument();
  });
});
