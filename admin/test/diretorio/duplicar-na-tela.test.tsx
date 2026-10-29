/**
 * DUPLICAR NA TELA: a fiacao do recurso, e nao a regra.
 *
 * `duplicar.test.ts` guarda O QUE A COPIA LEVA. Este arquivo guarda que o
 * caminho existe e termina num `POST`:
 *
 * - a lista OFERECE duplicar, e leva a `/perto/novo?duplicarDe=<slug>`;
 * - aquela rota LE a fonte e preenche o formulario de cadastro com ela;
 * - salvar dali e **criar** (`POST`), e nunca **editar** a fonte (`PATCH`).
 *
 * O ultimo e o caso que paga por este arquivo. `valoresDuplicados` pode estar
 * perfeito e o recurso ainda destruir dado, se a carga da fonte tivesse caido
 * em `entrada`/`etag`: `salvar` escolhe `PATCH` por eles, e "duplicar" teria
 * virado "sobrescrever o original" -- com os dados certos, em silencio, e sem
 * nenhum caso de `duplicar.test.ts` reprovando.
 *
 * ## As iscas, e como cada uma foi provada
 *
 * Desligadas no codigo de producao em 28/10/2026, conferidas no disco, suite
 * rodada e reprovada, arquivo restaurado:
 *
 * | o que foi desligado | `fail` |
 * |---|---|
 * | `setEntrada(data)` tambem no ramo de duplicar (vira `PATCH`) | 2 |
 * | o `MenuDeAcoes` da lista (ninguem alcanca o recurso) | 1 |
 * | `slugParaCarregar` so com `entrySlug` (a fonte nunca e lida) | 2 |
 */
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { createMemoryRouter, RouterProvider } from 'react-router';
import { describe, expect, it, vi } from 'vitest';

import type { Esquemas } from '../../src/api/cliente.ts';
import { criarRotas } from '../../src/rotas.tsx';
import {
  criarServidorFalso,
  json,
  SESSAO,
  type Resposta,
  type Rota,
} from '../apoio/servidor-falso.ts';

const FONTE: Esquemas['AdminDirectoryEntry'] = {
  slug: 'clinica-sao-jorge',
  kind: 'clinic',
  kinds: ['clinic', 'vet'],
  entity_kind: 'organization',
  display_name: 'Clínica São Jorge',
  about: 'Atende cães e gatos desde 1998.',
  city: 'São Paulo',
  state: 'SP',
  neighborhood: 'Pinheiros',
  phone_e164: '+551130612200',
  status: 'published',
  // A GALERIA (29/10/2026) e `required` na resposta. Vazia aqui: o que este
  // arquivo mede e a FIACAO de duplicar, e a regra do que a copia leva tem
  // arquivo proprio (`duplicar.test.ts`), onde a fonte tem galeria.
  images: [],
  verification: { level: 'document_verified', evidence_kinds: ['cnpj'] },
  source: 'import',
  claim_status: 'claimed',
  missing_to_publish: [],
  created_at: '2026-01-02T03:04:05.000Z',
  updated_at: '2026-10-27T10:00:00.000Z',
  version: 7,
} as unknown as Esquemas['AdminDirectoryEntry'];

function montar(caminho: string, rotas: Record<string, Rota | Resposta> = {}) {
  const servidor = criarServidorFalso({ 'GET /admin/session': json(200, SESSAO), ...rotas });
  const router = createMemoryRouter(
    criarRotas({ fetch: servidor.fetch, navegarParaFora: vi.fn() }),
    { initialEntries: [caminho] },
  );
  render(<RouterProvider router={router} />);
  return { servidor, router };
}

const UMA_PAGINA = json(200, { items: [FONTE], total: 1, page: 1, limit: 50 });
const A_FONTE = json(200, FONTE, { ETag: 'W/"7"' });

describe('duplicar: da lista até o formulário', () => {
  it('a lista oferece Duplicar, e ele leva para o cadastro com a fonte na URL', async () => {
    const { router } = montar('/perto', { 'GET /admin/directory/entries': UMA_PAGINA });
    await screen.findByText('Clínica São Jorge');

    fireEvent.click(screen.getByRole('button', { name: 'Mais ações para Clínica São Jorge' }));
    fireEvent.click(await screen.findByRole('menuitem', { name: 'Duplicar' }));

    await waitFor(() => {
      expect(router.state.location.pathname).toBe('/perto/novo');
    });
    expect(router.state.location.search).toBe('?duplicarDe=clinica-sao-jorge');
  });

  it('a rota de cópia lê a fonte e preenche o cadastro, com o identificador VAZIO', async () => {
    montar('/perto/novo?duplicarDe=clinica-sao-jorge', {
      'GET /admin/directory/entries/{entrySlug}': A_FONTE,
    });

    // O titulo diz que e copia, e nao o nome da fonte (que seria a tela de
    // edicao) nem "Nova entrada" (que esconderia de onde os dados vieram).
    expect(await screen.findByRole('heading', { name: 'Cópia de entrada' })).toBeTruthy();

    expect(screen.getByLabelText<HTMLInputElement>('Nome *').value).toBe('Clínica São Jorge');
    expect(screen.getByLabelText<HTMLInputElement>('Identificador *').value).toBe('');
    expect(screen.getByLabelText<HTMLInputElement>('Cidade *').value).toBe('São Paulo');
    // Os dois eixos vieram: atividade marcada e tipo escolhido.
    expect(screen.getByLabelText<HTMLInputElement>('Clínica').checked).toBe(true);
    expect(screen.getByLabelText<HTMLSelectElement>('Tipo *').value).toBe('organization');
    // E o botao e de CADASTRAR, nao de salvar alteracoes.
    expect(screen.getByRole('button', { name: 'Cadastrar entrada' })).toBeTruthy();
  });

  it('salvar a cópia é um POST, e não um PATCH na fonte', async () => {
    const { servidor } = montar('/perto/novo?duplicarDe=clinica-sao-jorge', {
      'GET /admin/directory/entries/{entrySlug}': A_FONTE,
      'POST /admin/directory/entries': json(201, { ...FONTE, slug: 'clinica-sao-jorge-itaim' }, {
        ETag: 'W/"1"',
      }),
    });
    await screen.findByRole('heading', { name: 'Cópia de entrada' });

    fireEvent.change(screen.getByLabelText('Identificador *'), {
      target: { value: 'clinica-sao-jorge-itaim' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Cadastrar entrada' }));

    await waitFor(() => {
      expect(
        servidor.requisicoes.some((r) => r.metodo === 'POST' && r.caminho === '/admin/directory/entries'),
      ).toBe(true);
    });

    // O CONTRAPESO QUE IMPORTA: nenhum `PATCH` saiu. Se a carga da fonte
    // tivesse caido em `entrada`/`etag`, este clique teria EDITADO a
    // `clinica-sao-jorge` em vez de criar a copia.
    expect(servidor.requisicoes.filter((r) => r.metodo === 'PATCH')).toEqual([]);

    const criado = servidor.requisicoes.find((r) => r.metodo === 'POST');
    const corpo = criado?.corpo as Record<string, unknown>;
    // O endereco publico e o NOVO, e os dados de preenchimento vieram da fonte.
    expect(corpo.slug).toBe('clinica-sao-jorge-itaim');
    expect(corpo.display_name).toBe('Clínica São Jorge');
    expect(corpo.kinds).toEqual(['clinic', 'vet']);
    expect(corpo.entity_kind).toBe('organization');
    expect(corpo.city).toBe('São Paulo');
    // E nada de IDENTIDADE nem de HISTORIA atravessou para o corpo.
    //
    // **`status` SAIU desta lista em 29/10/2026**, e saiu porque deixou de ser
    // historia: o cadastro passou a escolher a situacao (decisao do cliente, a
    // entrada nasce "No ar"), e o formulario manda a escolha. O que o caso
    // guarda e que ela nao e HERDADA da fonte, e isso esta medido logo abaixo e
    // em `duplicar.test.ts`.
    for (const proibido of ['version', 'created_at', 'updated_at', 'rating', 'verification']) {
      expect(corpo).not.toHaveProperty(proibido);
    }
    // A situacao vai no corpo e e a do CADASTRO NOVO. A fonte esta publicada,
    // entao as duas coincidem aqui; quem separa as duas coisas e o caso da
    // entrada RETIRADA em `duplicar.test.ts`.
    expect(corpo.status).toBe('published');
  });
});
