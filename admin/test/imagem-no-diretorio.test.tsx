/**
 * LOGO E FOTO DA ENTRADA DO DIRETORIO (18/10/2026).
 *
 * ## O que cada isca prova, e o que desligar para ela reprovar
 *
 * | isca | o que desligar |
 * |---|---|
 * | arquivo acima de 5 MB e recusado **antes** de qualquer chamada | tirar o `conferirArquivo` de `CampoDeImagem` |
 * | a orientacao de 5 MB e a minima ficam SEMPRE em tela | mover a orientacao para dentro do `if` de erro |
 * | a minima da logo e 256 x 256 e a da foto 600 x 600 | mudar `DIMENSAO_MINIMA` |
 * | o envio pede a politica com o proposito do campo | trocar o proposito, ou escrever um segundo caminho de envio |
 * | campo INTOCADO nao entra no `PATCH` | mandar `logo_upload_id` sempre |
 * | remover a gravada manda `null` | mandar `undefined`, ou omitir a chave |
 *
 * **Nenhuma isca sobe bytes.** O envio real e `XMLHttpRequest` contra o
 * armazenamento, e o que interessa aqui e a politica (o pedido da intencao) e
 * o corpo da escrita.
 */
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { createMemoryRouter, RouterProvider } from 'react-router';
import { describe, expect, it, vi } from 'vitest';

import type { Esquemas } from '../src/api/cliente.ts';
import {
  conferirArquivo,
  DIMENSAO_MINIMA,
  LIMITE_DE_BYTES,
  ORIENTACAO_DE_TAMANHO,
} from '../src/componentes/envio-de-imagem.ts';
import { criarRotas } from '../src/rotas.tsx';
import { criarServidorFalso, json, problema, SESSAO, type Resposta, type Rota } from './apoio/servidor-falso.ts';

const INTENCAO = 'POST /admin/media/catalog-image-intents';

function entrada(extra: Partial<Esquemas['AdminDirectoryEntry']> = {}): Esquemas['AdminDirectoryEntry'] {
  return {
    slug: 'passeios-da-bia',
    kind: 'walker',
    kinds: ['walker'],
    // `entity_kind` passou a ser obrigatorio na resposta com o eixo do tipo
    // de entidade (`20261018000012`), e esta massa nasceu no ramo da midia,
    // antes dele. `professional` e o DEFAULT da coluna e o que toda entrada
    // antiga vale.
    entity_kind: 'professional',
    display_name: 'Passeios da Bia',
    // A GALERIA e obrigatoria na resposta desde 29/10/2026, e `[]` e o estado
    // normal: a entrada sem foto responde lista vazia, nao campo ausente.
    images: [],
    status: 'draft',
    verification: { level: 'none', evidence_kinds: [] },
    source: 'import',
    claim_status: 'unclaimed',
    missing_to_publish: [],
    created_at: '2026-10-18T12:00:00.000Z',
    updated_at: '2026-10-18T12:00:00.000Z',
    version: 1,
    ...extra,
  };
}

const LOGO_GRAVADA: Esquemas['AdminCatalogImage'] = {
  source: 'uploaded',
  status: 'ready',
  url: 'https://cdn.example/logo-512.webp',
};

function montar(caminho: string, rotas: Record<string, Rota | Resposta> = {}) {
  const servidor = criarServidorFalso({ 'GET /admin/session': json(200, SESSAO), ...rotas });
  const router = createMemoryRouter(criarRotas({ fetch: servidor.fetch, navegarParaFora: vi.fn() }), {
    initialEntries: [caminho],
  });
  render(<RouterProvider router={router} />);
  return { servidor, router };
}

/** Um arquivo de imagem com o tamanho pedido, sem alocar os bytes. */
function arquivo(bytes: number, nome = 'logo.png', tipo = 'image/png'): File {
  const f = new File([new Uint8Array(1)], nome, { type: tipo });
  Object.defineProperty(f, 'size', { value: bytes });
  return f;
}

function escolher(rotulo: string, f: File) {
  fireEvent.change(screen.getByLabelText(rotulo), { target: { files: [f] } });
}

/**
 * CIDADE, UF E TELEFONE, que o cadastro passou a cobrar em 29/10/2026 (decisao
 * do cliente: a entrada nasce "No ar" e publicar cobra os tres). Os casos deste
 * arquivo medem a LOGO e a FOTO; sem os tres eles reprovariam pela regra do
 * outro item, antes de chegarem ao assunto.
 */
function preencherOsTresDaPublicacao() {
  fireEvent.change(screen.getByLabelText('Cidade *'), { target: { value: 'São Paulo' } });
  fireEvent.change(screen.getByLabelText('UF *'), { target: { value: 'SP' } });
  fireEvent.change(screen.getByLabelText('Telefone comercial *'), {
    target: { value: '(11) 3061-2200' },
  });
}

describe('tamanho e dimensao dos dois campos novos', () => {
  it('a minima da logo e 256 x 256, e a da foto do local 600 x 600', () => {
    expect(DIMENSAO_MINIMA.directory_logo).toEqual({ largura: 256, altura: 256 });
    expect(DIMENSAO_MINIMA.directory_photo).toEqual({ largura: 600, altura: 600 });
  });

  it('ISCA (a): arquivo acima do teto e recusado pelo `conferirArquivo`, com o teto derivado dos bytes', () => {
    expect(conferirArquivo({ type: 'image/png', size: LIMITE_DE_BYTES })).toBeUndefined();
    expect(conferirArquivo({ type: 'image/png', size: LIMITE_DE_BYTES + 1 })).toBe(
      'Esta imagem tem 5,0 MB. O limite é 5 MB.',
    );
    // E o tipo errado nem chega a olhar o tamanho.
    expect(conferirArquivo({ type: 'image/svg+xml', size: 10 })).toBe('Use JPG, PNG ou WebP.');
  });

  it('a orientacao de tamanho sai do limite em bytes, e nao de "5 MB" escrito a mao', () => {
    expect(ORIENTACAO_DE_TAMANHO).toBe('Envie uma imagem de até 5 MB.');
  });
});

describe('logo e foto no formulario da entrada', () => {
  it('ISCA (b): a orientacao de 5 MB e a minima ficam em tela SEMPRE, sem erro nenhum', async () => {
    montar('/perto/novo');
    // Uma orientacao por campo, e as duas visiveis desde que a tela abriu.
    expect(
      await screen.findByText('Envie uma imagem de até 5 MB. JPG, PNG ou WebP, com pelo menos 256 × 256 pixels.'),
    ).toBeVisible();
    expect(
      screen.getByText('Envie uma imagem de até 5 MB. JPG, PNG ou WebP, com pelo menos 600 × 600 pixels.'),
    ).toBeVisible();
    // E a orientacao DESCREVE o campo, em vez de ser texto solto ao lado dele.
    const campo = screen.getByLabelText('Logo');
    const descritores = (campo.getAttribute('aria-describedby') ?? '').split(' ');
    expect(descritores).toContain('e-logo-orientacao');
  });

  it('ISCA (a): arquivo de 6 MB nao gasta pedido de politica, e diz o motivo no campo', async () => {
    const { servidor } = montar('/perto/novo', { [INTENCAO]: problema(500, 'internal') });
    await screen.findByLabelText('Logo');
    escolher('Logo', arquivo(6 * 1_048_576));

    // A frase aparece duas vezes de proposito: na faixa de erro do campo e no
    // anuncio para leitor de tela.
    const ditos = await screen.findAllByText('Esta imagem tem 6,0 MB. O limite é 5 MB.');
    expect(ditos.map((e) => e.id)).toContain('e-logo-erro');
    expect(screen.getByLabelText('Logo')).toHaveAttribute('aria-invalid', 'true');
    // NENHUMA chamada: a recusa e local, antes do envio.
    expect(servidor.requisicoes.some((r) => r.caminho === '/admin/media/catalog-image-intents')).toBe(false);
  });

  it('ISCA: cada campo pede a politica com o SEU proposito', async () => {
    const { servidor } = montar('/perto/novo', { [INTENCAO]: problema(500, 'internal') });
    await screen.findByLabelText('Logo');
    escolher('Logo', arquivo(1024));
    await waitFor(() => {
      expect(servidor.requisicoes.some((r) => r.caminho === '/admin/media/catalog-image-intents')).toBe(true);
    });
    expect(servidor.requisicoes.at(-1)?.corpo).toEqual({
      purpose: 'directory_logo',
      content_type: 'image/png',
      byte_size: 1024,
    });

    escolher('Foto do local', arquivo(2048, 'fachada.jpg', 'image/jpeg'));
    await waitFor(() => {
      expect(
        servidor.requisicoes.filter((r) => r.caminho === '/admin/media/catalog-image-intents').length,
      ).toBe(2);
    });
    expect(servidor.requisicoes.at(-1)?.corpo).toEqual({
      purpose: 'directory_photo',
      content_type: 'image/jpeg',
      byte_size: 2048,
    });
  });

  it('a edicao mostra a logo gravada, e a recusada diz o motivo', async () => {
    montar('/perto/passeios-da-bia', {
      'GET /admin/directory/entries/passeios-da-bia': json(
        200,
        entrada({
          logo: LOGO_GRAVADA,
          photo: { source: 'uploaded', status: 'rejected', url: null, rejection_reason: 'Imagem com texto.' },
        }),
        { ETag: '"1"' },
      ),
    });
    const previa = await waitFor(() => {
      const img = document.querySelector<HTMLImageElement>(`img[src="${LOGO_GRAVADA.url ?? ''}"]`);
      expect(img).not.toBeNull();
      return img;
    });
    // Decorativa: quem descreve o campo e o rotulo, nao a previa.
    expect(previa?.getAttribute('alt')).toBe('');
    expect(screen.getByText('Imagem recusada')).toBeVisible();
    expect(screen.getByText('Imagem com texto.')).toBeVisible();
  });

  it('a imagem em processamento mostra o lugar dela, e nao um erro', async () => {
    montar('/perto/passeios-da-bia', {
      'GET /admin/directory/entries/passeios-da-bia': json(
        200,
        entrada({ logo: { source: 'uploaded', status: 'processing', url: null } }),
        { ETag: '"1"' },
      ),
    });
    expect(await screen.findByText('Conferindo a imagem…')).toBeVisible();
    expect(screen.queryByText('Imagem recusada')).toBeNull();
  });

  it('ISCA (c): campo de imagem INTOCADO nao entra no PATCH', async () => {
    const gravada = entrada({ logo: LOGO_GRAVADA, street_number: '120A' });
    const { servidor, router } = montar('/perto/passeios-da-bia', {
      'GET /admin/directory/entries/passeios-da-bia': json(200, gravada, { ETag: '"1"' }),
      'PATCH /admin/directory/entries/passeios-da-bia': json(200, { ...gravada, version: 2 }),
    });
    await waitFor(() => {
      expect(screen.getByLabelText<HTMLInputElement>('Número').value).toBe('120A');
    });
    fireEvent.change(screen.getByLabelText('Número'), { target: { value: '121' } });
    fireEvent.click(screen.getByRole('button', { name: 'Salvar alterações' }));
    await waitFor(() => expect(router.state.location.pathname).toBe('/perto'));

    const patch = servidor.requisicoes.find((r) => r.metodo === 'PATCH');
    // So o numero. Nem `logo_upload_id` nem `photo_upload_id` aparecem.
    expect(patch?.corpo).toEqual({ street_number: '121' });
  });

  it('ISCA (c): remover a logo gravada manda `logo_upload_id: null`, e so ela', async () => {
    const gravada = entrada({ logo: LOGO_GRAVADA });
    const { servidor, router } = montar('/perto/passeios-da-bia', {
      'GET /admin/directory/entries/passeios-da-bia': json(200, gravada, { ETag: '"1"' }),
      'PATCH /admin/directory/entries/passeios-da-bia': json(200, { ...gravada, logo: null, version: 2 }),
    });
    fireEvent.click(await screen.findByRole('button', { name: 'Remover Logo' }));
    fireEvent.click(screen.getByRole('button', { name: 'Salvar alterações' }));
    await waitFor(() => expect(router.state.location.pathname).toBe('/perto'));

    const patch = servidor.requisicoes.find((r) => r.metodo === 'PATCH');
    expect(patch?.corpo).toEqual({ logo_upload_id: null });
    // `null` e PRESENTE no corpo: trocar por `undefined` sumiria com a chave e
    // a remocao nao aconteceria.
    expect(Object.keys(patch?.corpo as Record<string, unknown>)).toEqual(['logo_upload_id']);
  });

  it('sem imagem gravada nao ha o que remover, e o campo nao oferece o botao', async () => {
    montar('/perto/passeios-da-bia', {
      'GET /admin/directory/entries/passeios-da-bia': json(200, entrada(), { ETag: '"1"' }),
    });
    await screen.findByLabelText('Logo');
    expect(screen.queryByRole('button', { name: 'Remover Logo' })).toBeNull();
    expect(screen.queryByRole('button', { name: 'Remover Foto do local' })).toBeNull();
  });

  it('o seletor aceita um arquivo so, e so os tres tipos do contrato', async () => {
    montar('/perto/novo');
    const logo = await screen.findByLabelText('Logo');
    expect(logo.getAttribute('accept')).toBe('image/jpeg,image/png,image/webp');
    expect(logo.hasAttribute('multiple')).toBe(false);
  });

  it('erro de campo do servidor cai no campo certo', async () => {
    const { servidor } = montar('/perto/novo', {
      'POST /admin/directory/entries': problema(422, 'validation-failed', {
        errors: [{ field: 'logo_upload_id', code: 'upload_not_usable' }],
      }),
    });
    fireEvent.change(await screen.findByLabelText('Nome *'), { target: { value: 'Passeios da Bia' } });
    // A atividade virou CAIXA em 21/10/2026 (atividades multiplas).
    fireEvent.click(screen.getByLabelText('Dog Walker'));
    fireEvent.change(screen.getByLabelText('Identificador *'), { target: { value: 'passeios-da-bia' } });
    // OS TRES DA PUBLICACAO (29/10/2026): o cadastro nasce "No ar" e cobra
    // cidade, UF e telefone. Sem eles a regua local recusa antes da rede, e
    // este caso -- que mede o erro de campo do SERVIDOR -- nao chegaria a
    // mandar nada.
    preencherOsTresDaPublicacao();
    fireEvent.click(screen.getByRole('button', { name: 'Cadastrar entrada' }));

    expect(
      await screen.findByText('Não conseguimos usar esta imagem como logo. Envie a imagem de novo.'),
    ).toBeVisible();
    // E o resumo de erros no topo leva ao campo.
    expect(screen.getByRole('link', { name: 'Logo' })).toHaveAttribute('href', '#e-logo');
    expect(servidor.requisicoes.some((r) => r.metodo === 'POST')).toBe(true);
  });

  it('o cadastro NAO manda chave de imagem quando ninguem escolheu imagem', async () => {
    const { servidor, router } = montar('/perto/novo', {
      'POST /admin/directory/entries': json(201, entrada(), { ETag: '"1"' }),
    });
    fireEvent.change(await screen.findByLabelText('Nome *'), { target: { value: 'Passeios da Bia' } });
    // A atividade virou CAIXA em 21/10/2026 (atividades multiplas).
    fireEvent.click(screen.getByLabelText('Dog Walker'));
    fireEvent.change(screen.getByLabelText('Identificador *'), { target: { value: 'passeios-da-bia' } });
    preencherOsTresDaPublicacao();
    fireEvent.click(screen.getByRole('button', { name: 'Cadastrar entrada' }));
    await waitFor(() => expect(router.state.location.pathname).toBe('/perto'));

    const corpo = servidor.requisicoes.find((r) => r.metodo === 'POST' && r.caminho === '/admin/directory/entries')
      ?.corpo as Record<string, unknown>;
    expect(corpo.logo_upload_id).toBeUndefined();
    expect(corpo.photo_upload_id).toBeUndefined();
  });
});
