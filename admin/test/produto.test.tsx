import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { useState } from 'react';
import { createMemoryRouter, RouterProvider } from 'react-router';
import { describe, expect, it, vi } from 'vitest';

import { Galeria, type ImagemDaGaleria } from '../src/componentes/Galeria.tsx';
import { criarRotas } from '../src/rotas.tsx';
import { item, pagina, parceiro, tag } from './apoio/massa.ts';
import { criarServidorFalso, json, problema, SESSAO, type Resposta, type Rota } from './apoio/servidor-falso.ts';

const SEIS_TAGS = ['adulto', 'filhote', 'porte pequeno', 'porte médio', 'porte grande', 'natural'].map((t) => tag(t));

function montar(caminho: string, rotas: Record<string, Rota | Resposta> = {}) {
  const servidor = criarServidorFalso({
    'GET /admin/session': json(200, SESSAO),
    'GET /admin/store/partners': json(200, pagina([parceiro()])),
    'GET /admin/store/tags': json(200, pagina(SEIS_TAGS)),
    'GET /admin/store/items': json(200, { ...pagina([item()]), effective_sort: 'atualizado' }),
    ...rotas,
  });
  const router = createMemoryRouter(criarRotas({ fetch: servidor.fetch, navegarParaFora: vi.fn() }), { initialEntries: [caminho] });
  render(<RouterProvider router={router} />);
  return { servidor, router };
}

async function preencherObrigatorios() {
  fireEvent.change(await screen.findByLabelText('Nome *'), { target: { value: 'Ração seca para cães adultos 15 kg' } });
  fireEvent.change(screen.getByLabelText('Descrição *'), { target: { value: 'Para cães adultos de porte médio e grande.' } });
  fireEvent.change(screen.getByLabelText('Categoria *'), { target: { value: 'food' } });
  fireEvent.click(screen.getByLabelText('Cão'));
  fireEvent.change(screen.getByLabelText('Parceiro *'), { target: { value: 'pet-center-aurora' } });
  fireEvent.change(screen.getByLabelText('Link do produto no parceiro *'), { target: { value: 'https://petcenteraurora.com.br/racao-15kg' } });
}

describe('3 · Loja: formulario', () => {
  it('salva rascunho com o preco em centavos inteiros e os campos do contrato', async () => {
    const { servidor, router } = montar('/loja/novo', {
      'POST /admin/store/items': json(201, item({ publication_state: 'draft' }), { ETag: '"1"' }),
    });
    await preencherObrigatorios();
    fireEvent.click(screen.getByRole('button', { name: /adulto/ }));
    fireEvent.change(screen.getByLabelText('Preço (R$)'), { target: { value: '189,90' } });
    fireEvent.change(screen.getByLabelText('Consultado em'), { target: { value: '2026-09-15' } });
    fireEvent.click(screen.getByRole('button', { name: 'Salvar rascunho' }));

    await waitFor(() => expect(router.state.location.pathname).toBe('/loja'));
    const criacao = servidor.requisicoes.find((r) => r.metodo === 'POST' && r.caminho === '/admin/store/items');
    expect(criacao?.corpo).toEqual({
      partner_slug: 'pet-center-aurora',
      title: 'Ração seca para cães adultos 15 kg',
      summary: 'Para cães adultos de porte médio e grande.',
      category: 'food',
      species: ['dog'],
      tag_slugs: ['adulto'],
      target_url: 'https://petcenteraurora.com.br/racao-15kg',
      images: [],
      sort_order: 0,
      price: { amount: 18990, currency: 'BRL', checked_at: '2026-09-15' },
    });
    expect(Number.isInteger((criacao?.corpo as { price: { amount: number } }).price.amount)).toBe(true);
    expect(criacao?.cabecalhos.get('X-CSRF-Token')).toBe(SESSAO.csrf_token);
    expect(await screen.findByText('Rascunho salvo. Ele não aparece no app até ser publicado.')).toBeInTheDocument();
  });

  it('publicar e criar e depois publishAdminStoreItem com If-Match', async () => {
    const { servidor } = montar('/loja/novo', {
      'POST /admin/store/items': json(201, item({ publication_state: 'draft', version: 1 }), { ETag: '"1"' }),
      'PUT /admin/store/items/{itemSlug}/publication': json(200, item(), { ETag: '"2"' }),
    });
    await preencherObrigatorios();
    fireEvent.click(screen.getByRole('button', { name: 'Publicar' }));
    expect(await screen.findByText('Produto publicado. Ele já aparece na Loja do app.')).toBeInTheDocument();
    const pub = servidor.requisicoes.find((r) => r.metodo === 'PUT');
    expect(pub?.caminho).toBe('/admin/store/items/racao-adulto-15kg/publication');
    expect(pub?.cabecalhos.get('If-Match')).toBe('"1"');
  });

  it('erros: resumo no topo com um link por campo e foco no resumo; nada vai ao servidor', async () => {
    const { servidor } = montar('/loja/novo');
    fireEvent.click(await screen.findByRole('button', { name: 'Publicar' }));
    const resumo = await screen.findByRole('alert');
    expect(resumo).toHaveTextContent('Corrija 6 campos para publicar:');
    await waitFor(() => expect(resumo).toHaveFocus());
    expect(within(resumo).getAllByRole('link').map((a) => a.textContent)).toEqual([
      'Nome',
      'Descrição',
      'Categoria',
      'Para quais animais',
      'Parceiro',
      'Link do produto no parceiro',
    ]);
    const nome = screen.getByLabelText('Nome *');
    expect(nome).toHaveAttribute('aria-invalid', 'true');
    expect(nome).toHaveAccessibleDescription('Informe o nome do produto.');
    expect(servidor.requisicoes.some((r) => r.metodo === 'POST')).toBe(false);
  });

  it('o erro do servidor volta para o campo pelo codigo', async () => {
    montar('/loja/novo', {
      'POST /admin/store/items': problema(400, 'validation-failed', { errors: [{ field: 'target_url', code: 'host_mismatch' }] }),
    });
    await preencherObrigatorios();
    fireEvent.click(screen.getByRole('button', { name: 'Salvar rascunho' }));
    await screen.findByText('Corrija 1 campo para salvar:');
    expect(screen.getByLabelText('Link do produto no parceiro *')).toHaveAccessibleDescription(
      'O link precisa ser do site do parceiro escolhido (petcenteraurora.com.br).',
    );
  });

  it('L3: tag recusada pelo servidor aparece marcada com o erro no proprio chip', async () => {
    montar('/loja/novo', {
      'POST /admin/store/items': problema(400, 'validation-failed', { errors: [{ field: 'tag_slugs[1]', code: 'unknown_tag' }] }),
    });
    await preencherObrigatorios();
    fireEvent.click(screen.getByRole('button', { name: 'adulto' }));
    fireEvent.click(screen.getByRole('button', { name: 'filhote' }));
    fireEvent.click(screen.getByRole('button', { name: 'Salvar rascunho' }));
    await screen.findByText('Corrija 1 campo para salvar:');
    const recusado = screen.getByRole('button', { name: /^filhote/ });
    expect(recusado).toHaveClass('err');
    expect(recusado).toHaveAttribute('aria-pressed', 'true');
    expect(recusado).toHaveAccessibleDescription(
      'Uma das tags mudou de nome desde que você abriu este formulário. Desmarque a tag indicada, escolha de novo e salve.',
    );
    expect(screen.getByRole('button', { name: 'adulto' })).not.toHaveClass('err');
    // Desmarcar tira o erro do chip.
    fireEvent.click(recusado);
    expect(screen.getByRole('button', { name: 'filhote' })).not.toHaveClass('err');
  });

  it('tags: ate 5 do vocabulario; a sexta fica inativa', async () => {
    montar('/loja/novo');
    await screen.findByLabelText('Nome *');
    const grupo = screen.getByRole('group', { name: 'Tags' });
    const chips = within(grupo).getAllByRole('button').filter((b) => b.hasAttribute('aria-pressed'));
    expect(chips).toHaveLength(6);
    chips.slice(0, 5).forEach((c) => fireEvent.click(c));
    expect(screen.getByText('5 de 5')).toBeInTheDocument();
    expect(chips[5]).toBeDisabled();
    chips.slice(0, 5).forEach((c) => expect(c).toHaveAttribute('aria-pressed', 'true'));
    fireEvent.click(chips[0]!);
    expect(chips[5]).toBeEnabled();
  });

  it('editar produto publicado: If-Match do ETag, Salvar alteracoes e Retirar com senha', async () => {
    const { servidor } = montar('/loja/racao-adulto-15kg', {
      'GET /admin/store/items/{itemSlug}': json(200, item(), { ETag: '"4"' }),
      'PATCH /admin/store/items/{itemSlug}': json(200, item({ version: 5 }), { ETag: '"5"' }),
      'POST /admin/auth/reauth': json(200, { reauth_token: 'r-1', expires_in: 300, scope: 'store_item_retirement', tokens: [{ scope: 'store_item_retirement', reauth_token: 'r-1' }], csrf_token: 'csrf-2-0123456789abcdef0123456789abcdef' }),
      'DELETE /admin/store/items/{itemSlug}/publication': json(200, item({ publication_state: 'retired' })),
    });
    expect(await screen.findByLabelText('Preço (R$)')).toHaveValue('189,90');
    fireEvent.click(screen.getByRole('button', { name: 'Retirar' }));
    const dialogo = screen.getByRole('alertdialog', { name: 'Retirar “Ração seca para cães adultos 15 kg”?' });
    // Botao sempre habilitado; senha vazia vira erro no campo (UX 29.6).
    fireEvent.click(within(dialogo).getByRole('button', { name: 'Retirar' }));
    expect(within(dialogo).getByLabelText('Sua senha')).toHaveAccessibleDescription('Digite sua senha para confirmar.');
    fireEvent.change(within(dialogo).getByLabelText('Sua senha'), { target: { value: 'uma frase longa de verdade' } });
    fireEvent.click(within(dialogo).getByRole('button', { name: 'Retirar' }));
    expect(await screen.findByText('Produto retirado. Ele saiu da Loja do app.')).toBeInTheDocument();
    const reauth = servidor.requisicoes.find((r) => r.caminho === '/admin/auth/reauth');
    expect(reauth?.corpo).toEqual({ password: 'uma frase longa de verdade', scope: 'store_item_retirement' });
    const retirada = servidor.requisicoes.find((r) => r.metodo === 'DELETE');
    expect(retirada?.cabecalhos.get('X-Admin-Reauth-Token')).toBe('r-1');
    expect(retirada?.cabecalhos.get('If-Match')).toBe('"4"');
    expect(retirada?.cabecalhos.get('X-CSRF-Token')).toBe('csrf-2-0123456789abcdef0123456789abcdef');
  });
});

function GaleriaDeTeste({ inicial, enviar }: { inicial: ImagemDaGaleria[]; enviar: (f: File, p: (n: number) => void) => Promise<string> }) {
  const [imagens, setImagens] = useState(inicial);
  return (
    <Galeria
      id="imagens"
      imagens={imagens}
      aoMudar={(atualizar) => setImagens(atualizar)}
      enviar={enviar}
      proposito="store_item"
      mostrarErrosDeDescricao
    />
  );
}

const pronta = (i: number): ImagemDaGaleria => ({ chave: `k${i}`, uploadId: `018f7c1e-0000-7000-8000-00000000000${i}`, alt: `Foto ${i}`, estado: 'ready', previa: null });
const arquivo = (nome: string, tipo = 'image/jpeg', tamanho = 1000) => new File(['x'.repeat(tamanho)], nome, { type: tipo });

describe('galeria: ate 8 imagens', () => {
  it('com 8, o botao de adicionar fica inativo e diz o limite', () => {
    render(<GaleriaDeTeste inicial={Array.from({ length: 8 }, (_, i) => pronta(i))} enviar={vi.fn()} />);
    expect(screen.getByText('8 de 8 imagens')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Limite de 8 imagens atingido' })).toBeDisabled();
  });

  it('escolher mais arquivos do que cabe so envia ate completar 8', async () => {
    const enviar = vi.fn(() => Promise.resolve('018f7c1e-0000-7000-8000-0000000000aa'));
    vi.spyOn(URL, 'createObjectURL').mockReturnValue('blob:teste');
    render(<GaleriaDeTeste inicial={Array.from({ length: 6 }, (_, i) => pronta(i))} enviar={enviar} />);
    fireEvent.change(screen.getByTestId('imagens-arquivo'), {
      target: { files: [arquivo('a.jpg'), arquivo('b.jpg'), arquivo('c.jpg'), arquivo('d.jpg')] },
    });
    await waitFor(() => expect(enviar).toHaveBeenCalledTimes(2));
    expect(screen.getByText('8 de 8 imagens')).toBeInTheDocument();
  });

  it('confere tipo e tamanho antes de enviar', async () => {
    const enviar = vi.fn(() => Promise.resolve('x'));
    vi.spyOn(URL, 'createObjectURL').mockReturnValue('blob:teste');
    render(<GaleriaDeTeste inicial={[]} enviar={enviar} />);
    fireEvent.change(screen.getByTestId('imagens-arquivo'), { target: { files: [arquivo('a.gif', 'image/gif')] } });
    expect(await screen.findByText('Use JPG, PNG ou WebP.', { selector: '.tile-over span' })).toBeInTheDocument();
    fireEvent.change(screen.getByTestId('imagens-arquivo'), { target: { files: [arquivo('b.jpg', 'image/jpeg', 7_549_747)] } });
    expect(await screen.findByText('Esta imagem tem 7,2 MB. O limite é 5 MB.', { selector: '.tile-over span' })).toBeInTheDocument();
    expect(enviar).not.toHaveBeenCalled();
  });

  it('mover e usar como principal, com a posicao no nome acessivel', () => {
    render(<GaleriaDeTeste inicial={[pronta(1), pronta(2), pronta(3)]} enviar={vi.fn()} />);
    fireEvent.click(screen.getByRole('button', { name: 'Usar como principal a imagem 3 de 3' }));
    const itens = screen.getAllByRole('listitem');
    expect(itens[0]).toHaveAccessibleName('Imagem 1 de 3, principal');
    expect(within(itens[0]!).getByLabelText('Descrição da imagem *')).toHaveValue('Foto 3');
    expect(screen.getByRole('button', { name: 'Mover para a esquerda a imagem 1 de 3' })).toBeDisabled();
  });
});
