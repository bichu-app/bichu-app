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

  it('editar produto publicado: If-Match e Retirar com confirmacao, sem senha', async () => {
    const { servidor } = montar('/loja/racao-adulto-15kg', {
      'GET /admin/store/items/{itemSlug}': json(200, item(), { ETag: '"4"' }),
      'PATCH /admin/store/items/{itemSlug}': json(200, item({ version: 5 }), { ETag: '"5"' }),
      'DELETE /admin/store/items/{itemSlug}/publication': json(200, item({ publication_state: 'retired' })),
    });
    expect(await screen.findByLabelText('Preço (R$)')).toHaveValue('189,90');
    fireEvent.click(screen.getByRole('button', { name: 'Retirar' }));
    const dialogo = screen.getByRole('alertdialog', { name: 'Retirar “Ração seca para cães adultos 15 kg”?' });
    expect(within(dialogo).queryByLabelText('Sua senha')).toBeNull();
    fireEvent.click(within(dialogo).getByRole('button', { name: 'Retirar' }));
    expect(await screen.findByText('Produto retirado. Ele saiu da Loja do app.')).toBeInTheDocument();
    expect(servidor.requisicoes.some((r) => r.caminho === '/admin/auth/reauth')).toBe(false);
    const retirada = servidor.requisicoes.find((r) => r.metodo === 'DELETE');
    expect(retirada?.cabecalhos.get('X-Admin-Reauth-Token')).toBeNull();
    expect(retirada?.cabecalhos.get('If-Match')).toBe('"4"');
    expect(retirada?.cabecalhos.get('X-CSRF-Token')).toBe(SESSAO.csrf_token);
  });
});

function GaleriaDeTeste({
  inicial,
  enviar,
  obrigatoria = true,
}: {
  inicial: ImagemDaGaleria[];
  enviar: (f: File, p: (n: number) => void) => Promise<string>;
  obrigatoria?: boolean;
}) {
  const [imagens, setImagens] = useState(inicial);
  return (
    <Galeria
      id="imagens"
      imagens={imagens}
      aoMudar={(atualizar) => setImagens(atualizar)}
      enviar={enviar}
      proposito="store_item"
      mostrarErrosDeDescricao
      descricaoObrigatoria={obrigatoria}
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

// ---------------------------------------------------------------------------
// Os quatro pedidos do cliente de 17/10/2026
// ---------------------------------------------------------------------------

describe('3 · Loja: capa, ordem, descrição e rascunho (17/10/2026)', () => {
  const COM_TRES = item({
    publication_state: 'draft',
    published_at: null,
    missing_to_publish: [],
    images: [
      { upload_id: '018f7c1e-0000-7000-8000-000000000001', position: 0, alt_text: 'Primeira', source: 'uploaded', status: 'ready', url: 'https://m.test/1.webp', rejection_reason: null },
      { upload_id: '018f7c1e-0000-7000-8000-000000000002', position: 1, alt_text: 'Segunda', source: 'uploaded', status: 'ready', url: 'https://m.test/2.webp', rejection_reason: null },
      { upload_id: '018f7c1e-0000-7000-8000-000000000003', position: 2, alt_text: 'Terceira', source: 'uploaded', status: 'ready', url: 'https://m.test/3.webp', rejection_reason: null },
    ],
  });

  it('ESCOLHER A CAPA: "usar como principal" na terceira manda a galeria com ela em PRIMEIRO lugar', async () => {
    const { servidor } = montar('/loja/racao-adulto-15kg', {
      'GET /admin/store/items/{itemSlug}': json(200, COM_TRES, { ETag: '"4"' }),
      'PATCH /admin/store/items/{itemSlug}': json(200, item({ version: 5 }), { ETag: '"5"' }),
    });
    fireEvent.click(await screen.findByRole('button', { name: 'Usar como principal a imagem 3 de 3' }));
    fireEvent.click(screen.getByRole('button', { name: 'Salvar rascunho' }));

    await waitFor(() => expect(servidor.requisicoes.some((r) => r.metodo === 'PATCH')).toBe(true));
    const patch = servidor.requisicoes.find((r) => r.metodo === 'PATCH');
    expect((patch?.corpo as { images: { upload_id: string }[] }).images.map((i) => i.upload_id)).toEqual([
      '018f7c1e-0000-7000-8000-000000000003',
      '018f7c1e-0000-7000-8000-000000000001',
      '018f7c1e-0000-7000-8000-000000000002',
    ]);
    // Nenhum campo de posicao e nenhum sinalizador de capa: a ORDEM e o dado.
    expect(JSON.stringify(patch?.corpo)).not.toContain('position');
    expect(patch?.cabecalhos.get('If-Match')).toBe('"4"');
  });

  it('DEFINIR A ORDEM: mover para a direita troca duas imagens de lugar no corpo, sem dependência de arrastar', async () => {
    const { servidor } = montar('/loja/racao-adulto-15kg', {
      'GET /admin/store/items/{itemSlug}': json(200, COM_TRES, { ETag: '"4"' }),
      'PATCH /admin/store/items/{itemSlug}': json(200, item({ version: 5 }), { ETag: '"5"' }),
    });
    fireEvent.click(await screen.findByRole('button', { name: 'Mover para a direita a imagem 1 de 3' }));
    fireEvent.click(screen.getByRole('button', { name: 'Salvar rascunho' }));

    await waitFor(() => expect(servidor.requisicoes.some((r) => r.metodo === 'PATCH')).toBe(true));
    const patch = servidor.requisicoes.find((r) => r.metodo === 'PATCH');
    expect((patch?.corpo as { images: { upload_id: string }[] }).images.map((i) => i.upload_id)).toEqual([
      '018f7c1e-0000-7000-8000-000000000002',
      '018f7c1e-0000-7000-8000-000000000001',
      '018f7c1e-0000-7000-8000-000000000003',
    ]);
  });

  it('TEXTO ALTERNATIVO OPCIONAL: o rótulo diz "(opcional)" e a descrição vazia OMITE alt_text do corpo', async () => {
    const { servidor } = montar('/loja/racao-adulto-15kg', {
      'GET /admin/store/items/{itemSlug}': json(200, COM_TRES, { ETag: '"4"' }),
      'PATCH /admin/store/items/{itemSlug}': json(200, item({ version: 5 }), { ETag: '"5"' }),
    });
    const campos = await screen.findAllByLabelText('Descrição da imagem (opcional)');
    expect(campos).toHaveLength(3);
    fireEvent.change(campos[0]!, { target: { value: '' } });
    fireEvent.click(screen.getByRole('button', { name: 'Salvar rascunho' }));

    await waitFor(() => expect(servidor.requisicoes.some((r) => r.metodo === 'PATCH')).toBe(true));
    const imagens = (servidor.requisicoes.find((r) => r.metodo === 'PATCH')?.corpo as { images: unknown[] }).images;
    // Omitido, e NAO `alt_text: ''`: o contrato recusa texto vazio (`minLength: 2`).
    expect(imagens[0]).toEqual({ upload_id: '018f7c1e-0000-7000-8000-000000000001' });
    expect(imagens[1]).toEqual({ upload_id: '018f7c1e-0000-7000-8000-000000000002', alt_text: 'Segunda' });
  });

  it('a imagem lida do servidor sem alt_text abre com o campo vazio, e não quebra a tela', async () => {
    montar('/loja/racao-adulto-15kg', {
      'GET /admin/store/items/{itemSlug}': json(
        200,
        item({
          images: [
            { upload_id: '018f7c1e-0000-7000-8000-000000000001', position: 0, alt_text: null, source: 'uploaded', status: 'ready', url: 'https://m.test/1.webp', rejection_reason: null },
          ],
        }),
        { ETag: '"4"' },
      ),
    });
    expect(await screen.findByLabelText('Descrição da imagem (opcional)')).toHaveValue('');
  });

  it('DESCRIÇÃO É ÁREA DE TEXTO: o campo é textarea, com várias linhas, e a quebra chega no corpo', async () => {
    const { servidor, router } = montar('/loja/novo', {
      'POST /admin/store/items': json(201, item({ publication_state: 'draft' }), { ETag: '"1"' }),
    });
    const descricao = await screen.findByLabelText('Descrição *');
    expect(descricao.tagName).toBe('TEXTAREA');
    expect(Number(descricao.getAttribute('rows'))).toBeGreaterThanOrEqual(4);
    expect(descricao).toHaveAttribute('maxlength', '180');

    fireEvent.change(screen.getByLabelText('Nome *'), { target: { value: 'Ração com parágrafos' } });
    fireEvent.change(descricao, { target: { value: 'Primeira linha.\nSegunda linha.' } });
    fireEvent.click(screen.getByRole('button', { name: 'Salvar rascunho' }));

    await waitFor(() => expect(router.state.location.pathname).toBe('/loja'));
    const criacao = servidor.requisicoes.find((r) => r.metodo === 'POST');
    expect((criacao?.corpo as { summary: string }).summary).toBe('Primeira linha.\nSegunda linha.');
  });

  it('RASCUNHO SÓ COM O NOME: salva, e o corpo OMITE os campos em branco', async () => {
    const { servidor, router } = montar('/loja/novo', {
      'POST /admin/store/items': json(201, item({ publication_state: 'draft' }), { ETag: '"1"' }),
    });
    fireEvent.change(await screen.findByLabelText('Nome *'), { target: { value: 'Produto que ainda estou pesquisando' } });
    fireEvent.click(screen.getByRole('button', { name: 'Salvar rascunho' }));

    await waitFor(() => expect(router.state.location.pathname).toBe('/loja'));
    const criacao = servidor.requisicoes.find((r) => r.metodo === 'POST' && r.caminho === '/admin/store/items');
    expect(criacao?.corpo).toEqual({
      title: 'Produto que ainda estou pesquisando',
      tag_slugs: [],
      images: [],
      sort_order: 0,
    });
  });

  it('ISCA: o rascunho afrouxou, a PUBLICAÇÃO não — publicar sem os campos continua barrado e nada vai ao servidor', async () => {
    const { servidor } = montar('/loja/novo');
    fireEvent.change(await screen.findByLabelText('Nome *'), { target: { value: 'Só o nome' } });
    fireEvent.click(screen.getByRole('button', { name: 'Publicar' }));

    const resumo = await screen.findByRole('alert');
    expect(resumo).toHaveTextContent('Corrija 5 campos para publicar:');
    expect(within(resumo).getAllByRole('link').map((a) => a.textContent)).toEqual([
      'Descrição',
      'Categoria',
      'Para quais animais',
      'Parceiro',
      'Link do produto no parceiro',
    ]);
    expect(servidor.requisicoes.some((r) => r.metodo === 'POST')).toBe(false);
  });

  it('a tela DIZ o que falta para publicar, em vez de só deixar o botão sem explicação', async () => {
    montar('/loja/novo');
    fireEvent.change(await screen.findByLabelText('Nome *'), { target: { value: 'Só o nome' } });
    const aviso = await screen.findByText(/Para publicar, falta preencher/);
    expect(aviso).toHaveTextContent('descrição');
    expect(aviso).toHaveTextContent('parceiro');
    // E o botao continua clicavel: botao morto e o mesmo problema em outra forma.
    expect(screen.getByRole('button', { name: 'Publicar' })).not.toBeDisabled();

    fireEvent.change(screen.getByLabelText('Descrição *'), { target: { value: 'Uma descrição.' } });
    expect(screen.queryByText(/falta preencher: descrição/)).toBeNull();
  });

  it('esvaziar um campo do rascunho manda `null`, que é o que LIMPA no servidor', async () => {
    const { servidor } = montar('/loja/racao-adulto-15kg', {
      'GET /admin/store/items/{itemSlug}': json(200, item({ publication_state: 'draft', published_at: null }), { ETag: '"4"' }),
      'PATCH /admin/store/items/{itemSlug}': json(200, item({ version: 5 }), { ETag: '"5"' }),
    });
    fireEvent.change(await screen.findByLabelText('Descrição *'), { target: { value: '' } });
    fireEvent.click(screen.getByRole('button', { name: 'Salvar rascunho' }));

    await waitFor(() => expect(servidor.requisicoes.some((r) => r.metodo === 'PATCH')).toBe(true));
    const corpo = servidor.requisicoes.find((r) => r.metodo === 'PATCH')?.corpo as { summary: unknown };
    expect(corpo.summary).toBeNull();
  });
});

describe('galeria: a descrição é opcional só onde se pede', () => {
  it('por padrão (a Rede) o rótulo continua obrigatório', () => {
    render(<GaleriaDeTeste inicial={[pronta(1)]} enviar={vi.fn()} />);
    expect(screen.getByLabelText('Descrição da imagem *')).toBeInTheDocument();
  });

  it('com `descricaoObrigatoria={false}` (a Loja) o campo vazio não vira erro, e uma letra vira', () => {
    render(<GaleriaDeTeste inicial={[{ ...pronta(1), alt: '' }]} enviar={vi.fn()} obrigatoria={false} />);
    expect(screen.getByLabelText('Descrição da imagem (opcional)')).toBeInTheDocument();
    expect(screen.queryByText('Descreva a imagem.')).toBeNull();

    render(<GaleriaDeTeste inicial={[{ ...pronta(2), alt: 'a' }]} enviar={vi.fn()} obrigatoria={false} />);
    expect(screen.getAllByText('Escreva pelo menos duas letras, ou deixe o campo vazio.').length).toBeGreaterThan(0);
  });
});
