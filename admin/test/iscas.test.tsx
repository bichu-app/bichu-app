/**
 * ISCAS da sessao (ADR-0027 itens 2 e 3). Cada conferencia daqui roda duas
 * vezes: contra o painel de verdade, onde precisa passar, e contra uma isca
 * que quebra a regra de proposito, onde precisa REPROVAR. Conferencia que nao
 * consegue reprovar a isca nao confere nada, e o teste cai.
 */
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { readdirSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { criarClienteDaApi } from '../src/api/cliente.ts';
import { DialogoDeConfirmacao } from '../src/componentes/DialogoDeConfirmacao.tsx';
import { Entrar } from '../src/entrar/Entrar.tsx';
import { guardarRascunho } from '../src/sessao/rascunho.ts';
import { ProvedorDeSessao, useSessao } from '../src/sessao/ProvedorDeSessao.tsx';
import { semSessao, type EstrategiaDeSessao } from '../src/sessao/sessao.ts';
import { criarServidorFalso, json, SESSAO, type RequisicaoGravada } from './apoio/servidor-falso.ts';

const METODOS_SEGUROS = new Set(['GET', 'HEAD']);

/** Escritas em /admin que sairam sem o token anti-CSRF esperado. */
export function escritasSemCsrf(requisicoes: RequisicaoGravada[], token: string): RequisicaoGravada[] {
  return requisicoes.filter(
    (r) => r.caminho.startsWith('/admin/') && r.caminho !== '/admin/auth/login' && !METODOS_SEGUROS.has(r.metodo) && r.cabecalhos.get('X-CSRF-Token') !== token,
  );
}

/** Algum segredo da sessao no armazenamento do navegador. */
export function segredosNoArmazenamento(segredos: string[]): string[] {
  const achados: string[] = [];
  for (const [nome, armazenamento] of [
    ['localStorage', globalThis.localStorage],
    ['sessionStorage', globalThis.sessionStorage],
  ] as const) {
    for (let i = 0; i < armazenamento.length; i += 1) {
      const chave = armazenamento.key(i) ?? '';
      const valor = armazenamento.getItem(chave) ?? '';
      for (const segredo of [...segredos, '__Host-bichu_adm']) {
        if (chave.includes(segredo) || valor.includes(segredo)) achados.push(`${nome}:${chave}`);
      }
    }
  }
  return achados;
}

afterEach(() => {
  localStorage.clear();
  sessionStorage.clear();
});

describe('isca: X-CSRF-Token em toda escrita administrativa', () => {
  it('a conferencia REPROVA um cliente que nao manda o token (isca)', async () => {
    const servidor = criarServidorFalso({ 'POST /admin/store/partners': json(201, {}) });
    const isca: EstrategiaDeSessao = semSessao;
    const api = criarClienteDaApi({ fetch: servidor.fetch, sessao: isca });
    await api.POST('/admin/store/partners', { body: { slug: 'loja-do-bairro', name: 'Loja do Bairro', site_url: 'https://lojadobairro.com.br', sort_order: 0 } });
    expect(escritasSemCsrf(servidor.requisicoes, SESSAO.csrf_token)).toHaveLength(1);
  });

  it('o painel de verdade passa: sessao, escrita e escrita confirmada levam o token, sem senha', async () => {
    const servidor = criarServidorFalso({
      'GET /admin/session': json(200, SESSAO),
      'POST /admin/store/partners': json(201, {}),
      'DELETE /admin/store/items/{itemSlug}/publication': json(200, {}),
    });
    function Escritas() {
      const { api } = useSessao();
      return (
        <>
          <button
            type="button"
            onClick={() => void api.POST('/admin/store/partners', { body: { slug: 'loja-do-bairro', name: 'Loja do Bairro', site_url: 'https://lojadobairro.com.br', sort_order: 0 } })}
          >
            parceiro
          </button>
          <DialogoDeConfirmacao
            titulo="Retirar?"
            corpo="corpo"
            rotuloDaAcao="Retirar"
            aoFechar={() => undefined}
            executar={async () => {
              await api.DELETE('/admin/store/items/{itemSlug}/publication', {
                params: { path: { itemSlug: 'racao' }, header: { 'If-Match': '"1"' } },
              });
              return { ok: true };
            }}
          />
        </>
      );
    }
    render(
      <ProvedorDeSessao fetch={servidor.fetch} navegarParaFora={vi.fn()}>
        <Escritas />
      </ProvedorDeSessao>,
    );
    fireEvent.click(await screen.findByRole('button', { name: 'parceiro' }));
    expect(screen.queryByLabelText('Sua senha')).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: 'Retirar' }));
    await waitFor(() => expect(servidor.requisicoes.some((r) => r.metodo === 'DELETE')).toBe(true));

    const escritas = servidor.requisicoes.filter((r) => r.metodo !== 'GET');
    expect(escritas.map((r) => r.caminho).sort()).toEqual(['/admin/store/items/racao/publication', '/admin/store/partners']);
    expect(escritasSemCsrf(servidor.requisicoes, SESSAO.csrf_token)).toEqual([]);
    const retirada = servidor.requisicoes.find((r) => r.caminho === '/admin/store/items/racao/publication');
    expect(retirada?.cabecalhos.get('X-Admin-Reauth-Token')).toBeNull();
    expect(retirada?.cabecalhos.get('If-Match')).toBe('"1"');
  });
});

describe('isca: nada da sessao em localStorage nem sessionStorage', () => {
  it('a conferencia REPROVA quem guarda o token no navegador (isca)', () => {
    localStorage.setItem('bichu-adm', JSON.stringify({ csrf: SESSAO.csrf_token }));
    expect(segredosNoArmazenamento([SESSAO.csrf_token])).toEqual(['localStorage:bichu-adm']);
    localStorage.clear();
    sessionStorage.setItem('x', '__Host-bichu_adm=abc');
    expect(segredosNoArmazenamento([])).toEqual(['sessionStorage:x']);
  });

  it('o painel de verdade passa: login, sessao e rascunho nao deixam segredo', async () => {
    const senha = 'uma frase longa de verdade';
    const servidor = criarServidorFalso({
      'POST /admin/auth/login': json(200, SESSAO),
      'GET /admin/session': json(200, SESSAO),
    });
    const entrar = render(<Entrar obterToken={() => Promise.resolve('token-do-captcha-com-mais-de-vinte')} busca="" navegarParaFora={vi.fn()} fetch={servidor.fetch} />);
    fireEvent.change(screen.getByLabelText('E-mail'), { target: { value: 'operacao@exemplo.com.br' } });
    fireEvent.change(screen.getByLabelText('Senha'), { target: { value: senha } });
    fireEvent.click(screen.getByRole('button', { name: 'Entrar' }));
    await waitFor(() => expect(servidor.requisicoes).toHaveLength(1));
    entrar.unmount();

    function Consumidor() {
      useSessao();
      return <p>pronto</p>;
    }
    render(
      <ProvedorDeSessao fetch={servidor.fetch} navegarParaFora={vi.fn()}>
        <Consumidor />
      </ProvedorDeSessao>,
    );
    await screen.findByText('pronto');
    guardarRascunho('/loja/novo', { titulo: 'Ração', preco: '189,90' });

    expect(sessionStorage.length, 'o rascunho do formulario deveria estar la').toBe(1);
    expect(segredosNoArmazenamento([SESSAO.csrf_token, senha])).toEqual([]);
  });

  it('nenhum arquivo de src/ usa localStorage, e sessionStorage so no rascunho', () => {
    const src = path.resolve(import.meta.dirname, '../src');
    const arquivos = (function listar(dir: string, rel = ''): string[] {
      return readdirSync(dir, { withFileTypes: true }).flatMap((e) => {
        const r = rel ? `${rel}/${e.name}` : e.name;
        if (e.isDirectory()) return r === 'api/generated' ? [] : listar(path.join(dir, e.name), r);
        return /\.(tsx?)$/.test(e.name) ? [r] : [];
      });
    })(src);
    expect(arquivos.length, 'a varredura nao achou arquivo em src/').toBeGreaterThan(10);
    const semComentario = (t: string) => t.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:])\/\/.*$/gm, '$1');
    const usaLocal = (t: string) => /\blocalStorage\b/.test(semComentario(t));
    const usaSessao = (t: string) => /\bsessionStorage\b/.test(semComentario(t));
    // Isca do detector: codigo que guarda o token precisa ser pego; comentario nao.
    expect(usaLocal("localStorage.setItem('t', csrf)")).toBe(true);
    expect(usaLocal('// nunca em localStorage')).toBe(false);

    const achados = arquivos.flatMap((r) => {
      const texto = readFileSync(path.join(src, r), 'utf8');
      return [...(usaLocal(texto) ? [`${r}: localStorage`] : []), ...(usaSessao(texto) && r !== 'sessao/rascunho.ts' ? [`${r}: sessionStorage`] : [])];
    });
    expect(achados).toEqual([]);
  });
});
