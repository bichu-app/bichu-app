import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { createMemoryRouter, RouterProvider } from 'react-router';
import { describe, expect, it, vi } from 'vitest';

import { criarRotas } from '../src/rotas.tsx';
import { item, pagina, parceiro, tag } from './apoio/massa.ts';
import { criarServidorFalso, json, problema, SESSAO, type Resposta, type Rota } from './apoio/servidor-falso.ts';

function montar(caminho: string, rotas: Record<string, Rota | Resposta>) {
  const servidor = criarServidorFalso({ 'GET /admin/session': json(200, SESSAO), ...rotas });
  const router = createMemoryRouter(criarRotas({ fetch: servidor.fetch, navegarParaFora: vi.fn() }), { initialEntries: [caminho] });
  render(<RouterProvider router={router} />);
  return { servidor, router };
}

const ITENS = [
  item(),
  item({
    slug: 'arranhador-sisal',
    title: 'Arranhador de sisal para gatos',
    category: 'toy',
    species: ['cat'],
    price: { amount: 7490, currency: 'BRL', checked_at: '2026-08-12', valid_until: '2026-09-11' },
    price_status: 'vencido',
    version: 7,
  }),
  item({ slug: 'coleira', title: 'Coleira refletiva', category: 'accessory', species: ['dog', 'cat'], price: null, price_status: 'sem_preco', publication_state: 'draft' }),
];

describe('3 · Loja: lista', () => {
  it('mostra preco, selo, contagem e ordena por "Atualizados por ultimo" por padrao', async () => {
    const { servidor } = montar('/loja', { 'GET /admin/store/items': json(200, { ...pagina(ITENS), effective_sort: 'atualizado' }) });
    expect(await screen.findByText('3 produtos')).toBeInTheDocument();
    const linhas = screen.getAllByRole('row').slice(1);
    expect(within(linhas[0]!).getByText('R$ 189,90')).toBeInTheDocument();
    expect(within(linhas[0]!).getByText('consultado em 15/09/2026')).toBeInTheDocument();
    expect(within(linhas[1]!).getByText('Preço vencido')).toBeInTheDocument();
    expect(within(linhas[1]!).getByText('Publicado')).toBeInTheDocument();
    expect(within(linhas[2]!).getByText('Sem preço de referência')).toBeInTheDocument();
    expect(within(linhas[2]!).getByText('Rascunho')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Mais ações para Coleira refletiva' })).toBeInTheDocument();
    const q = servidor.requisicoes.find((r) => r.caminho === '/admin/store/items')!.busca;
    expect(q.get('sort')).toBe('atualizado');
    expect(q.get('limit')).toBe('20');
  });

  it('3.3 vazia: estado vazio com Novo produto, e a barra some', async () => {
    montar('/loja', { 'GET /admin/store/items': json(200, { ...pagina([]), effective_sort: 'atualizado' }) });
    expect(await screen.findByText('A Loja ainda não tem produtos')).toBeInTheDocument();
    expect(screen.getByText('Cadastre o primeiro. Ele aparece no app quando for publicado.')).toBeInTheDocument();
    expect(screen.queryByPlaceholderText('Buscar pelo nome do produto')).toBeNull();
  });

  it('filtros na URL: Retirados, Preco vencido e "Preco vencido primeiro"', async () => {
    const { servidor, router } = montar('/loja?filtro=vencido&ordem=validade&q=ra%C3%A7%C3%A3o', {
      'GET /admin/store/items': json(200, { ...pagina([ITENS[1]!]), effective_sort: 'validade' }),
    });
    expect(await screen.findByText('1 produto com “ração” em Preço vencido')).toBeInTheDocument();
    let q = servidor.requisicoes.find((r) => r.caminho === '/admin/store/items')!.busca;
    expect(q.get('price_status')).toBe('vencido');
    expect(q.get('publication_state')).toBeNull();
    expect(q.get('sort')).toBe('validade');
    expect(q.get('q')).toBe('ração');

    fireEvent.click(screen.getByRole('radio', { name: 'Retirados' }));
    await waitFor(() => expect(router.state.location.search).toContain('filtro=retired'));
    await waitFor(() => {
      q = servidor.requisicoes.filter((r) => r.caminho === '/admin/store/items').at(-1)!.busca;
      expect(q.get('publication_state')).toBe('retired');
    });
    expect(q.get('price_status')).toBeNull();
    expect(screen.getByRole('button', { name: 'Limpar busca e filtro' })).toBeInTheDocument();
  });

  it('sem resultado diz o que falta e o botao diz o que limpa', async () => {
    montar('/loja?filtro=vencido', { 'GET /admin/store/items': json(200, { ...pagina([]), effective_sort: 'atualizado' }) });
    expect(await screen.findByText('Nenhum produto em Preço vencido.')).toBeInTheDocument();
    expect(screen.getAllByRole('button', { name: 'Limpar filtro' }).length).toBeGreaterThan(0);
  });

  it('erro ao carregar: banner com Atualizar, que recarrega a lista', async () => {
    let falhar = true;
    montar('/loja', {
      'GET /admin/store/items': () => (falhar ? problema(500, 'internal') : json(200, { ...pagina(ITENS), effective_sort: 'atualizado' })),
    });
    expect(await screen.findByText('Não conseguimos carregar os produtos.')).toBeInTheDocument();
    falhar = false;
    fireEvent.click(screen.getByRole('button', { name: 'Atualizar' }));
    expect(await screen.findByText('3 produtos')).toBeInTheDocument();
  });

  it('Renovar consulta pede o preco de novo e manda centavos com a data de hoje', async () => {
    const { servidor } = montar('/loja', {
      'GET /admin/store/items': json(200, { ...pagina(ITENS), effective_sort: 'atualizado' }),
      'PATCH /admin/store/items/{itemSlug}': ({ corpo }) => json(200, item({ slug: 'arranhador-sisal', title: 'Arranhador de sisal para gatos', ...(corpo as object), version: 8 })),
    });
    await screen.findByText('3 produtos');
    fireEvent.click(screen.getByRole('button', { name: 'Renovar consulta' }));
    const dialogo = screen.getByRole('alertdialog', { name: 'Renovar a consulta de preço' });
    const campo = within(dialogo).getByLabelText('Preço (R$)');
    expect(campo).toHaveValue('74,90');
    expect(campo).toHaveFocus();
    fireEvent.change(campo, { target: { value: 'abc' } });
    fireEvent.click(within(dialogo).getByRole('button', { name: 'Renovar' }));
    expect(campo).toHaveAccessibleDescription('Informe o preço em reais, por exemplo 89,90.');
    fireEvent.change(campo, { target: { value: '79,90' } });
    fireEvent.click(within(dialogo).getByRole('button', { name: 'Renovar' }));
    expect(await screen.findByText('Alterações salvas.')).toBeInTheDocument();
    const patch = servidor.requisicoes.find((r) => r.metodo === 'PATCH')!;
    expect(patch.cabecalhos.get('If-Match')).toBe('"7"');
    const corpo = patch.corpo as { price: { amount: number; currency: string; checked_at: string } };
    expect(corpo.price.amount).toBe(7990);
    expect(corpo.price.currency).toBe('BRL');
    expect(corpo.price.checked_at).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  });

  it('menu do rascunho publica com If-Match', async () => {
    const { servidor } = montar('/loja', {
      'GET /admin/store/items': json(200, { ...pagina(ITENS), effective_sort: 'atualizado' }),
      'PUT /admin/store/items/{itemSlug}/publication': json(200, item({ slug: 'coleira', title: 'Coleira refletiva', publication_state: 'published' })),
    });
    fireEvent.click(await screen.findByRole('button', { name: 'Mais ações para Coleira refletiva' }));
    const menu = screen.getByRole('menu');
    expect(within(menu).getAllByRole('menuitem').map((m) => m.textContent)).toEqual(['Editar', 'Publicar']);
    fireEvent.click(within(menu).getByRole('menuitem', { name: 'Publicar' }));
    expect(await screen.findByText('Produto publicado. Ele já aparece na Loja do app.')).toBeInTheDocument();
    expect(servidor.requisicoes.find((r) => r.metodo === 'PUT')?.caminho).toBe('/admin/store/items/coleira/publication');
  });
});

describe('5 · Parceiros', () => {
  it('lista e cadastra: o identificador sai do nome e vai no corpo (slug obrigatorio no contrato)', async () => {
    const { servidor } = montar('/loja/parceiros', {
      'GET /admin/store/partners': json(200, pagina([parceiro(), parceiro({ slug: 'emporio-focinho', name: 'Empório Focinho', active: false, item_count: 0 })])),
      'POST /admin/store/partners': json(201, parceiro({ slug: 'casa-do-bicho-lapa' })),
    });
    expect(await screen.findByText('2 parceiros')).toBeInTheDocument();
    expect(screen.getByText('Inativo')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('link', { name: 'Novo parceiro' }));
    fireEvent.change(await screen.findByLabelText('Nome *'), { target: { value: 'Casa do Bicho Lapa' } });
    expect(screen.getByLabelText('Identificador *')).toHaveValue('casa-do-bicho-lapa');
    fireEvent.change(screen.getByLabelText('Site do parceiro *'), { target: { value: 'https://casadobicholapa.com.br/' } });
    fireEvent.click(screen.getByRole('button', { name: 'Cadastrar parceiro' }));
    expect(await screen.findByLabelText('Site do parceiro *')).toHaveAccessibleDescription('Escreva só o endereço do site, sem https:// e sem barra.');
    fireEvent.change(screen.getByLabelText('Site do parceiro *'), { target: { value: 'casadobicholapa.com.br' } });
    fireEvent.click(screen.getByRole('button', { name: 'Cadastrar parceiro' }));
    await waitFor(() => expect(servidor.requisicoes.some((r) => r.metodo === 'POST')).toBe(true));
    expect(servidor.requisicoes.find((r) => r.metodo === 'POST')?.corpo).toEqual({
      slug: 'casa-do-bicho-lapa',
      name: 'Casa do Bicho Lapa',
      host: 'casadobicholapa.com.br',
      sort_order: 0,
    });
  });

  it('edita mandando so o que mudou, com If-Match', async () => {
    const { servidor } = montar('/loja/parceiros/pet-center-aurora', {
      'GET /admin/store/partners/{partnerSlug}': json(200, parceiro(), { ETag: '"3"' }),
      'PATCH /admin/store/partners/{partnerSlug}': json(200, parceiro({ active: false })),
      'GET /admin/store/partners': json(200, pagina([parceiro()])),
    });
    fireEvent.click(await screen.findByLabelText('Inativo'));
    fireEvent.click(screen.getByRole('button', { name: 'Salvar alterações' }));
    await waitFor(() => expect(servidor.requisicoes.some((r) => r.metodo === 'PATCH')).toBe(true));
    const patch = servidor.requisicoes.find((r) => r.metodo === 'PATCH')!;
    expect(patch.corpo).toEqual({ active: false });
    expect(patch.cabecalhos.get('If-Match')).toBe('"3"');
  });
});

describe('6 · Tags', () => {
  it('conta ativas e inativas, desativa e renomeia pelo contrato', async () => {
    const ativas = [tag('adulto', { item_count: 3 }), tag('filhote')];
    const { servidor } = montar('/loja/tags', {
      'GET /admin/store/tags': ({ busca }) => {
        if (busca.get('limit') === '1') return json(200, { ...pagina([]), total: busca.get('active') === 'true' ? 2 : 1 });
        return json(200, pagina([...ativas, tag('sem grãos', { active: false, item_count: 0 })]));
      },
      'PATCH /admin/store/tags/{tagSlug}': ({ corpo }) => json(200, { ...tag('adulto', { item_count: 3 }), ...(corpo as object), version: 2 }),
    });
    expect(await screen.findByText('2 de 40 tags ativas · 1 inativa')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Desativar a tag adulto' }));
    expect(await screen.findByText(/Tag “adulto” desativada\. Ela some do app/)).toBeInTheDocument();
    let patch = servidor.requisicoes.filter((r) => r.metodo === 'PATCH').at(-1)!;
    expect(patch.corpo).toEqual({ active: false });
    expect(patch.cabecalhos.get('If-Match')).toBe('"1"');

    fireEvent.click(screen.getByRole('button', { name: 'Renomear a tag filhote' }));
    const dialogo = screen.getByRole('alertdialog', { name: 'Renomear a tag “filhote”' });
    fireEvent.change(within(dialogo).getByLabelText('Nome da tag'), { target: { value: 'x' } });
    fireEvent.click(within(dialogo).getByRole('button', { name: 'Renomear' }));
    expect(within(dialogo).getByLabelText('Nome da tag')).toHaveAccessibleDescription('Use de 2 a 24 caracteres.');
    fireEvent.change(within(dialogo).getByLabelText('Nome da tag'), { target: { value: 'Filhotes' } });
    fireEvent.click(within(dialogo).getByRole('button', { name: 'Renomear' }));
    await waitFor(() => expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument());
    patch = servidor.requisicoes.filter((r) => r.metodo === 'PATCH').at(-1)!;
    expect(patch.caminho).toBe('/admin/store/tags/filhote');
    expect(patch.corpo).toEqual({ label: 'Filhotes' });
  });

  it('com 40 ativas, Criar tag fica inativo e o banner explica', async () => {
    montar('/loja/tags', {
      'GET /admin/store/tags': ({ busca }) =>
        busca.get('limit') === '1' ? json(200, { ...pagina([]), total: busca.get('active') === 'true' ? 40 : 0 }) : json(200, pagina([tag('adulto')])),
    });
    expect(await screen.findByText('Há 40 tags ativas, o limite. Para criar outra, desative uma que não é usada.')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Criar tag' })).toBeDisabled();
  });
});
