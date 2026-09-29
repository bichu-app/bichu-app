/**
 * Defeitos que o QA achou na `2bfd026` e os casos que estavam sem teste. Cada
 * teste reprova se o defeito voltar.
 */
import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { createMemoryRouter, RouterProvider } from 'react-router';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { Entrar } from '../src/entrar/Entrar.tsx';
import { criarRotas } from '../src/rotas.tsx';
import { item, pagina, parceiro, tag } from './apoio/massa.ts';
import { criarServidorFalso, json, problema, SESSAO, type Resposta, type Rota } from './apoio/servidor-falso.ts';

const L6 = 'Alguém alterou este produto enquanto você editava, e nada foi gravado. Recarregar traz a versão atual e descarta o que você mudou aqui.';

function montar(caminho: string, rotas: Record<string, Rota | Resposta> = {}) {
  const servidor = criarServidorFalso({
    'GET /admin/session': json(200, SESSAO),
    'GET /admin/store/partners': json(200, pagina([parceiro()])),
    'GET /admin/store/tags': json(200, pagina([tag('adulto'), tag('filhote')])),
    'GET /admin/store/items': json(200, { ...pagina([item()]), effective_sort: 'atualizado' }),
    ...rotas,
  });
  const navegarParaFora = vi.fn();
  const router = createMemoryRouter(criarRotas({ fetch: servidor.fetch, navegarParaFora }), { initialEntries: [caminho] });
  render(<RouterProvider router={router} />);
  return { servidor, router, navegarParaFora };
}

async function preencherObrigatorios() {
  fireEvent.change(await screen.findByLabelText('Nome *'), { target: { value: 'Ração seca para cães adultos 15 kg' } });
  fireEvent.change(screen.getByLabelText('Descrição *'), { target: { value: 'Para cães adultos.' } });
  fireEvent.change(screen.getByLabelText('Categoria *'), { target: { value: 'food' } });
  fireEvent.click(screen.getByLabelText('Cão'));
  fireEvent.change(screen.getByLabelText('Parceiro *'), { target: { value: 'pet-center-aurora' } });
  fireEvent.change(screen.getByLabelText('Link do produto no parceiro *'), { target: { value: 'https://petcenteraurora.com.br/racao' } });
}

afterEach(() => {
  sessionStorage.clear();
  vi.useRealTimers();
});

describe('defeito 2: publicar depois de criar nunca duplica o item', () => {
  it('PUT que falha por excecao leva para a edicao do item criado, e o proximo clique nao cria outro', async () => {
    const { servidor, router } = montar('/loja/novo', {
      'POST /admin/store/items': json(201, item({ publication_state: 'draft', version: 1 }), { ETag: '"1"' }),
      'PUT /admin/store/items/{itemSlug}/publication': () => {
        throw new TypeError('Failed to fetch');
      },
      'GET /admin/store/items/{itemSlug}': json(200, item({ publication_state: 'draft', version: 1 }), { ETag: '"1"' }),
      'PATCH /admin/store/items/{itemSlug}': json(200, item({ publication_state: 'draft', version: 2 }), { ETag: '"2"' }),
    });
    await preencherObrigatorios();
    fireEvent.click(screen.getByRole('button', { name: 'Publicar' }));
    await waitFor(() => expect(router.state.location.pathname).toBe('/loja/racao-adulto-15kg'));
    expect(await screen.findByText('O produto foi salvo, mas não conseguimos publicar. Tente publicar de novo.')).toBeInTheDocument();
    await screen.findByLabelText('Nome *');
    fireEvent.click(screen.getByRole('button', { name: 'Publicar' }));
    await waitFor(() => expect(servidor.requisicoes.filter((r) => r.metodo === 'PUT')).toHaveLength(2));
    expect(servidor.requisicoes.filter((r) => r.metodo === 'POST' && r.caminho === '/admin/store/items')).toHaveLength(1);
    expect(servidor.requisicoes.filter((r) => r.metodo === 'PATCH')).toHaveLength(1);
  });
});

describe('defeito 3: rascunho restaurado usa o ETag da leitura original', () => {
  it('guarda o ETag junto com o rascunho quando a sessao cai', async () => {
    const { navegarParaFora } = montar('/loja/racao-adulto-15kg', {
      'GET /admin/store/items/{itemSlug}': json(200, item(), { ETag: '"4"' }),
      'PATCH /admin/store/items/{itemSlug}': problema(401, 'token-expired'),
    });
    fireEvent.change(await screen.findByLabelText('Nome *'), { target: { value: 'Nome editado' } });
    fireEvent.click(screen.getByRole('button', { name: 'Salvar alterações' }));
    await waitFor(() => expect(navegarParaFora).toHaveBeenCalled());
    const guardado = JSON.parse(sessionStorage.getItem('bichu-adm-rascunho:/loja/racao-adulto-15kg') ?? '{}') as { etag?: string; valores?: { titulo: string } };
    expect(guardado.etag).toBe('"4"');
    expect(guardado.valores?.titulo).toBe('Nome editado');
  });

  it('depois do login, o If-Match e o ETag antigo; alguem salvou no meio: 412 com o texto L6 e Recarregar', async () => {
    sessionStorage.setItem(
      'bichu-adm-rascunho:/loja/racao-adulto-15kg',
      JSON.stringify({ etag: '"4"', valores: { ...(await import('../src/loja/formulario-do-produto.ts')).valoresDoItem(item()), titulo: 'Nome editado' } }),
    );
    const { servidor } = montar('/loja/racao-adulto-15kg', {
      'GET /admin/store/items/{itemSlug}': json(200, item({ version: 9 }), { ETag: '"9"' }),
      'PATCH /admin/store/items/{itemSlug}': ({ cabecalhos }) =>
        cabecalhos.get('If-Match') === '"9"' ? json(200, item({ version: 10 })) : problema(412, 'precondition-failed'),
    });
    expect(await screen.findByLabelText('Nome *')).toHaveValue('Nome editado');
    fireEvent.click(screen.getByRole('button', { name: 'Salvar alterações' }));
    expect(await screen.findByText(L6)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Recarregar' })).toBeInTheDocument();
    expect(servidor.requisicoes.find((r) => r.metodo === 'PATCH')?.cabecalhos.get('If-Match')).toBe('"4"');
  });
});

describe('defeito 4: retirar com o formulario alterado pede confirmacao', () => {
  it('pergunta antes de abrir o dialogo de senha, e Continuar editando mantem o que foi digitado', async () => {
    montar('/loja/racao-adulto-15kg', { 'GET /admin/store/items/{itemSlug}': json(200, item(), { ETag: '"4"' }) });
    fireEvent.change(await screen.findByLabelText('Nome *'), { target: { value: 'Nome editado' } });
    fireEvent.click(screen.getByRole('button', { name: 'Retirar' }));
    const confirmacao = screen.getByRole('alertdialog', { name: 'Retirar sem salvar as alterações?' });
    fireEvent.click(within(confirmacao).getByRole('button', { name: 'Continuar editando' }));
    expect(screen.queryByRole('alertdialog')).toBeNull();
    expect(screen.getByLabelText('Nome *')).toHaveValue('Nome editado');
    fireEvent.click(screen.getByRole('button', { name: 'Retirar' }));
    fireEvent.click(within(screen.getByRole('alertdialog')).getByRole('button', { name: 'Retirar sem salvar' }));
    expect(screen.getByRole('alertdialog', { name: 'Retirar “Ração seca para cães adultos 15 kg”?' })).toBeInTheDocument();
  });

  it('sem alteracao, vai direto para a senha', async () => {
    montar('/loja/racao-adulto-15kg', { 'GET /admin/store/items/{itemSlug}': json(200, item(), { ETag: '"4"' }) });
    await screen.findByLabelText('Nome *');
    fireEvent.click(screen.getByRole('button', { name: 'Retirar' }));
    expect(screen.getByRole('alertdialog', { name: 'Retirar “Ração seca para cães adultos 15 kg”?' })).toBeInTheDocument();
  });
});

describe('defeito 5: renovar no formulario usa o ETag inteiro', () => {
  it('If-Match leva o ETag como veio, sem derivar numero', async () => {
    const vencido = item({ price_status: 'vencido', price: { amount: 7490, currency: 'BRL', checked_at: '2026-08-12', valid_until: '2026-09-11' } });
    const { servidor } = montar('/loja/racao-adulto-15kg', {
      'GET /admin/store/items/{itemSlug}': json(200, vencido, { ETag: 'W/"v-4-abc"' }),
      'PATCH /admin/store/items/{itemSlug}': json(200, item({ version: 5 }), { ETag: 'W/"v-5-def"' }),
    });
    expect(await screen.findByText(/O preço venceu em 11\/09\/2026/)).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Renovar consulta' }));
    fireEvent.click(within(screen.getByRole('alertdialog')).getByRole('button', { name: 'Renovar' }));
    await waitFor(() => expect(servidor.requisicoes.some((r) => r.metodo === 'PATCH')).toBe(true));
    expect(servidor.requisicoes.find((r) => r.metodo === 'PATCH')?.cabecalhos.get('If-Match')).toBe('W/"v-4-abc"');
  });
});

describe('defeito 6: todos os parceiros ativos, nao so os 100 primeiros', () => {
  it('pagina ate o total', async () => {
    const primeiros = Array.from({ length: 100 }, (_, i) => parceiro({ slug: `parceiro-${i}`, name: `Parceiro ${i}` }));
    const ultimo = parceiro({ slug: 'parceiro-cento-e-um', name: 'Parceiro 101' });
    const { servidor } = montar('/loja/novo', {
      'GET /admin/store/partners': ({ busca }) => (busca.get('page') === '2' ? json(200, { ...pagina([ultimo]), total: 101 }) : json(200, { ...pagina(primeiros), total: 101 })),
    });
    await screen.findByLabelText('Nome *');
    expect(within(screen.getByLabelText('Parceiro *')).getByRole('option', { name: 'Parceiro 101' })).toBeInTheDocument();
    expect(servidor.requisicoes.filter((r) => r.caminho === '/admin/store/partners').map((r) => r.busca.get('page'))).toEqual(['1', '2']);
  });
});

describe('defeito 7: ganchos data-cy para o teste de ponta a ponta de hml', () => {
  it('login', () => {
    const { container } = render(<Entrar obterToken={() => Promise.resolve('t')} busca="?motivo=saiu" navegarParaFora={vi.fn()} />);
    for (const g of ['entrar-email', 'entrar-senha', 'entrar-botao', 'entrar-aviso']) expect(container.querySelector(`[data-cy="${g}"]`), g).not.toBeNull();
  });

  it('lista e formulario da Loja', async () => {
    montar('/loja');
    await screen.findByText('1 produto');
    for (const g of ['nav-loja', 'nav-parceiros', 'nav-tags', 'nav-rede', 'loja-novo-produto', 'busca', 'filtro-vencido', 'produto-linha', 'menu-de-acoes']) {
      expect(document.querySelector(`[data-cy="${g}"]`), g).not.toBeNull();
    }
    fireEvent.click(document.querySelector<HTMLElement>('[data-cy="loja-novo-produto"]')!);
    await screen.findByLabelText('Nome *');
    for (const g of [
      'produto-nome',
      'produto-descricao',
      'produto-categoria',
      'produto-especie-dog',
      'produto-tag',
      'imagens-arquivo',
      'produto-parceiro',
      'produto-link',
      'produto-preco',
      'produto-consultado-em',
      'produto-consultei-hoje',
      'produto-rascunho',
      'produto-publicar',
    ]) {
      expect(document.querySelector(`[data-cy="${g}"]`), g).not.toBeNull();
    }
  });
});

describe('casos que estavam sem teste', () => {
  it('imagem em conferencia: o polling traz o estado recusado com o motivo', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    let chamadas = 0;
    const imagem = (status: 'processing' | 'rejected') => ({
      upload_id: '018f7c1e-7a2b-7c3d-9e4f-2b1a0c9d8e70',
      position: 0,
      alt_text: 'Saco de ração',
      source: 'uploaded' as const,
      status,
      url: null,
      rejection_reason: status === 'rejected' ? 'A imagem tem 640 × 480 pixels. O mínimo é 800 × 800.' : null,
    });
    montar('/loja/racao-adulto-15kg', {
      'GET /admin/store/items/{itemSlug}': () => {
        chamadas += 1;
        return json(200, item({ images: [imagem(chamadas === 1 ? 'processing' : 'rejected')] }), { ETag: '"4"' });
      },
    });
    expect(await screen.findByText('Conferindo a imagem…')).toBeInTheDocument();
    await act(async () => {
      await vi.advanceTimersByTimeAsync(4100);
    });
    expect(await screen.findByText('Imagem recusada')).toBeInTheDocument();
    expect(screen.getByText('A imagem tem 640 × 480 pixels. O mínimo é 800 × 800.')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Enviar outra' })).toBeInTheDocument();
  });

  it('parceiro e tag inativos do item continuam visiveis; a tag desmarcada nao volta', async () => {
    montar('/loja/racao-adulto-15kg', {
      'GET /admin/store/items/{itemSlug}': json(
        200,
        item({
          partner: { slug: 'emporio-focinho', name: 'Empório Focinho', host: 'emporiofocinho.com.br' },
          target_url: 'https://emporiofocinho.com.br/x',
          tags: [{ slug: 'sem-graos', label: 'sem grãos', active: false }],
        }),
        { ETag: '"4"' },
      ),
    });
    const parceiroEscolhido = await screen.findByLabelText('Parceiro *');
    expect(parceiroEscolhido).toHaveValue('emporio-focinho');
    expect(within(parceiroEscolhido).getByRole('option', { name: 'Empório Focinho (inativo)' })).toBeInTheDocument();
    const inativa = screen.getByRole('button', { name: 'sem grãos (inativa)' });
    expect(inativa).toHaveAttribute('aria-pressed', 'true');
    fireEvent.click(inativa);
    expect(screen.getByRole('button', { name: 'sem grãos (inativa)' })).toBeDisabled();
  });

  it('429 na reautenticacao: muitas tentativas e o botao fica inativo', async () => {
    montar('/loja', { 'POST /admin/auth/reauth': problema(429, 'rate-limited', {}, { 'Retry-After': '900' }) });
    fireEvent.click(await screen.findByRole('button', { name: 'Mais ações para Ração seca para cães adultos 15 kg' }));
    fireEvent.click(screen.getByRole('menuitem', { name: 'Retirar' }));
    const dialogo = screen.getByRole('alertdialog');
    fireEvent.change(within(dialogo).getByLabelText('Sua senha'), { target: { value: 'uma frase longa de verdade' } });
    fireEvent.click(within(dialogo).getByRole('button', { name: 'Retirar' }));
    expect(await within(dialogo).findByText('Muitas tentativas. Tente de novo em 15 minutos.')).toBeInTheDocument();
    expect(within(dialogo).getByRole('button', { name: 'Retirar' })).toBeDisabled();
  });

  it('busca com 1 caractere nao vai ao servidor (o minimo do contrato e 2)', async () => {
    const { servidor } = montar('/loja?q=r');
    await screen.findByText('1 produto');
    expect(servidor.requisicoes.find((r) => r.caminho === '/admin/store/items')?.busca.has('q')).toBe(false);
  });

  it('retirar recusado: 403 e janela de senha invalida mantem o dialogo aberto com o motivo', async () => {
    let resposta: Resposta = problema(403, 'forbidden');
    montar('/loja', {
      'POST /admin/auth/reauth': json(200, { reauth_token: 'r', expires_in: 300, scope: 'store_item_retirement', tokens: [{ scope: 'store_item_retirement', reauth_token: 'r' }], csrf_token: 'csrf-novo-0123456789abcdef0123456789abcd' }),
      'DELETE /admin/store/items/{itemSlug}/publication': () => resposta,
    });
    fireEvent.click(await screen.findByRole('button', { name: 'Mais ações para Ração seca para cães adultos 15 kg' }));
    fireEvent.click(screen.getByRole('menuitem', { name: 'Retirar' }));
    const dialogo = screen.getByRole('alertdialog');
    fireEvent.change(within(dialogo).getByLabelText('Sua senha'), { target: { value: 'uma frase longa de verdade' } });
    fireEvent.click(within(dialogo).getByRole('button', { name: 'Retirar' }));
    expect(await within(dialogo).findByText('Não conseguimos retirar o produto. Tente de novo.')).toBeInTheDocument();

    resposta = problema(401, 'reauthentication-required');
    fireEvent.change(within(dialogo).getByLabelText('Sua senha'), { target: { value: 'uma frase longa de verdade' } });
    fireEvent.click(within(dialogo).getByRole('button', { name: 'Retirar' }));
    expect(await within(dialogo).findByText('A confirmação com senha expirou. Digite a senha de novo e confirme.')).toBeInTheDocument();
    expect(screen.getByText('Publicado')).toBeInTheDocument();
  });
});

describe('imagem sem envio (upload_id nulo) na galeria da Loja', () => {
  const imagens: Parameters<typeof item>[0] = {
    images: [
      { source: 'uploaded', status: 'ready', url: null, rejection_reason: null, upload_id: '00000000-0000-4000-8000-000000000001', position: 0, alt_text: 'Saco de ração' },
      { source: 'uploaded', status: 'ready', url: null, rejection_reason: null, upload_id: null, position: 1, alt_text: 'Tabela nutricional' },
    ],
  };

  it('a imagem afetada tem a marca e o alerta diz a posição', async () => {
    montar('/loja/racao-adulto-15kg', { 'GET /admin/store/items/{itemSlug}': json(200, item(imagens), { ETag: '"4"' }) });
    expect(
      await screen.findByText('A imagem 2 veio de uma conta que não existe mais. Ela fica no produto enquanto você não mexer na galeria; qualquer mudança nas imagens a tira do produto.'),
    ).toBeInTheDocument();
    const afetada = screen.getByRole('listitem', { name: 'Imagem 2 de 2, Sai se a galeria mudar' });
    expect(within(afetada).getByText('Sai se a galeria mudar')).toBeInTheDocument();
    expect(within(screen.getByRole('listitem', { name: 'Imagem 1 de 2, principal' })).queryByText('Sai se a galeria mudar')).toBeNull();
  });

  it('editar só o nome não manda images, e a imagem sem envio fica no produto', async () => {
    const { servidor } = montar('/loja/racao-adulto-15kg', {
      'GET /admin/store/items/{itemSlug}': json(200, item(imagens), { ETag: '"4"' }),
      'PATCH /admin/store/items/{itemSlug}': json(200, item({ ...imagens, version: 5 }), { ETag: '"5"' }),
    });
    fireEvent.change(await screen.findByLabelText('Nome *'), { target: { value: 'Ração seca 15 kg' } });
    fireEvent.click(screen.getByRole('button', { name: 'Salvar alterações' }));
    await waitFor(() => expect(servidor.requisicoes.some((r) => r.metodo === 'PATCH')).toBe(true));
    const patch = servidor.requisicoes.find((r) => r.metodo === 'PATCH')?.corpo as Record<string, unknown>;
    expect(patch.title).toBe('Ração seca 15 kg');
    expect(patch).not.toHaveProperty('images');
  });
});
