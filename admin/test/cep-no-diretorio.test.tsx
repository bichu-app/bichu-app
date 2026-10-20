/**
 * ISCAS DO CEP NO FORMULARIO DE ENTRADA DO DIRETORIO -- **escritas e NAO
 * rodadas** nesta entrega, por regra do cliente de 18/10/2026 (sem suite
 * unitaria, sem integracao).
 *
 * ## O que cada isca prova, e o que desligar para ela reprovar
 *
 * | isca | o que desligar |
 * |---|---|
 * | o CEP preenche rua, bairro, cidade e UF | remover a chamada a `buscarEndereco` do `aoCompletar` |
 * | **nao sobrescreve** o que o operador digitou | trocar `v.cidade.trim() === '' ? data.city : v.cidade` por `data.city` |
 * | CEP nao encontrado **nao bloqueia salvar** | fazer `buscarEndereco` escrever em `erros` ou em `setFalha` |
 * | servico fora do ar **nao bloqueia salvar** | idem |
 * | a chamada sai para o NOSSO endpoint | fazer o formulario chamar ViaCEP direto |
 * | o envio manda oito digitos, sem hifen | mandar `valores.cep` cru no corpo |
 * | o campo e OPCIONAL | marcar `postal_code` como obrigatorio na conferencia local |
 *
 * **Nenhuma isca toca a rede.** O `fetch` e o servidor falso: uma isca que
 * chamasse o ViaCEP de verdade falharia sem internet e gastaria cota de
 * terceiro a cada execucao da esteira.
 */
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { createMemoryRouter, RouterProvider } from 'react-router';
import { describe, expect, it, vi } from 'vitest';

import type { Esquemas } from '../src/api/cliente.ts';
import { criarRotas } from '../src/rotas.tsx';
import {
  criarServidorFalso,
  json,
  problema,
  SESSAO,
  type Resposta,
  type Rota,
} from './apoio/servidor-falso.ts';

const CEP = '05435-000';
const OITO_DIGITOS = '05435000';

const ENDERECO_DO_CEP: Esquemas['PostalCodeAddress'] = {
  street: 'Rua Harmonia',
  neighborhood: 'Sumarezinho',
  city: 'São Paulo',
  state: 'SP',
};

function entrada(extra: Partial<Esquemas['AdminDirectoryEntry']> = {}): Esquemas['AdminDirectoryEntry'] {
  return {
    slug: 'passeios-da-bia',
    kind: 'walker',
    // `entity_kind` passou a ser obrigatorio na resposta com o eixo do tipo
    // de entidade (`20261018000012`), e esta massa nasceu no ramo da midia,
    // antes dele. `professional` e o DEFAULT da coluna e o que toda entrada
    // antiga vale.
    entity_kind: 'professional',
    display_name: 'Passeios da Bia',
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

function montar(caminho: string, rotas: Record<string, Rota | Resposta> = {}) {
  const servidor = criarServidorFalso({
    'GET /admin/session': json(200, SESSAO),
    ...rotas,
  });
  const router = createMemoryRouter(
    criarRotas({ fetch: servidor.fetch, navegarParaFora: vi.fn() }),
    { initialEntries: [caminho] },
  );
  render(<RouterProvider router={router} />);
  return { servidor, router };
}

/** O valor de um campo pelo rotulo. `getByLabelText` devolve `HTMLElement`. */
function valorDoCampo(rotulo: string): string {
  return screen.getByLabelText<HTMLInputElement>(rotulo).value;
}

async function preencherObrigatorios() {
  fireEvent.change(await screen.findByLabelText('Nome *'), { target: { value: 'Passeios da Bia' } });
  fireEvent.change(screen.getByLabelText('Atividade *'), { target: { value: 'walker' } });
}

describe('CEP no formulario de entrada do diretorio', () => {
  it('ISCA (a): o CEP completo preenche rua, bairro, cidade e UF', async () => {
    montar('/perto/novo', {
      [`GET /admin/postal-codes/${OITO_DIGITOS}`]: json(200, ENDERECO_DO_CEP),
    });
    await preencherObrigatorios();
    fireEvent.change(screen.getByLabelText('CEP'), { target: { value: CEP } });

    await waitFor(() => {
      expect(valorDoCampo('Rua')).toBe('Rua Harmonia');
    });
    expect(valorDoCampo('Bairro')).toBe('Sumarezinho');
    expect(valorDoCampo('Cidade')).toBe('São Paulo');
    expect(valorDoCampo('UF')).toBe('SP');
  });

  it('ISCA: a chamada sai para o NOSSO endpoint, com os oito digitos no caminho', async () => {
    const { servidor } = montar('/perto/novo', {
      [`GET /admin/postal-codes/${OITO_DIGITOS}`]: json(200, ENDERECO_DO_CEP),
    });
    await preencherObrigatorios();
    fireEvent.change(screen.getByLabelText('CEP'), { target: { value: CEP } });

    await waitFor(() => {
      expect(
        servidor.requisicoes.some(
          (r) => r.metodo === 'GET' && r.caminho === `/admin/postal-codes/${OITO_DIGITOS}`,
        ),
      ).toBe(true);
    });
    // E nenhuma chamada a servico de fora: o painel so conhece a nossa origem.
    expect(servidor.requisicoes.every((r) => r.caminho.startsWith('/'))).toBe(true);
  });

  it('ISCA (b): NAO sobrescreve o que o administrador digitou', async () => {
    montar('/perto/novo', {
      [`GET /admin/postal-codes/${OITO_DIGITOS}`]: json(200, ENDERECO_DO_CEP),
    });
    await preencherObrigatorios();
    // O operador digita cidade e bairro ANTES do CEP, e os dois diferem da base.
    fireEvent.change(screen.getByLabelText('Cidade'), { target: { value: 'Osasco' } });
    fireEvent.change(screen.getByLabelText('Bairro'), { target: { value: 'Centro' } });
    fireEvent.change(screen.getByLabelText('CEP'), { target: { value: CEP } });

    // A rua estava vazia, entao ela E preenchida.
    await waitFor(() => {
      expect(valorDoCampo('Rua')).toBe('Rua Harmonia');
    });
    // E o que a pessoa digitou fica EXATAMENTE como ela deixou.
    expect(valorDoCampo('Cidade')).toBe('Osasco');
    expect(valorDoCampo('Bairro')).toBe('Centro');
  });

  it('ISCA (d): CEP nao encontrado NAO bloqueia salvar', async () => {
    const { servidor, router } = montar('/perto/novo', {
      [`GET /admin/postal-codes/${OITO_DIGITOS}`]: problema(404, 'not-found'),
      'POST /admin/directory/entries': json(201, entrada(), { ETag: '"1"' }),
    });
    await preencherObrigatorios();
    fireEvent.change(screen.getByLabelText('Identificador *'), { target: { value: 'passeios-da-bia' } });
    fireEvent.change(screen.getByLabelText('CEP'), { target: { value: CEP } });
    await screen.findByText(/Não encontramos este CEP/);

    fireEvent.click(screen.getByRole('button', { name: 'Cadastrar entrada' }));
    await waitFor(() => expect(router.state.location.pathname).toBe('/perto'));

    const criacao = servidor.requisicoes.find(
      (r) => r.metodo === 'POST' && r.caminho === '/admin/directory/entries',
    );
    // O CEP digitado VAI, com oito digitos e sem hifen: a mascara e da tela.
    expect((criacao?.corpo as { postal_code?: string }).postal_code).toBe(OITO_DIGITOS);
    // E nada de rua, porque a busca nao achou e ninguem digitou.
    expect((criacao?.corpo as { street?: string }).street).toBeUndefined();
  });

  it('ISCA (c/d): servico fora do ar (503) NAO bloqueia salvar, e nao estoura a tela', async () => {
    const { router } = montar('/perto/novo', {
      [`GET /admin/postal-codes/${OITO_DIGITOS}`]: problema(503, 'postal-code-lookup-unavailable'),
      'POST /admin/directory/entries': json(201, entrada(), { ETag: '"1"' }),
    });
    await preencherObrigatorios();
    fireEvent.change(screen.getByLabelText('Identificador *'), { target: { value: 'passeios-da-bia' } });
    fireEvent.change(screen.getByLabelText('CEP'), { target: { value: CEP } });
    await screen.findByText(/Não conseguimos consultar o CEP agora/);

    fireEvent.click(screen.getByRole('button', { name: 'Cadastrar entrada' }));
    await waitFor(() => expect(router.state.location.pathname).toBe('/perto'));
  });

  it('ISCA (e): o campo novo NAO e obrigatorio -- salva sem CEP e sem rua', async () => {
    const { servidor, router } = montar('/perto/novo', {
      'POST /admin/directory/entries': json(201, entrada(), { ETag: '"1"' }),
    });
    await preencherObrigatorios();
    fireEvent.change(screen.getByLabelText('Identificador *'), { target: { value: 'passeios-da-bia' } });
    fireEvent.click(screen.getByRole('button', { name: 'Cadastrar entrada' }));

    await waitFor(() => expect(router.state.location.pathname).toBe('/perto'));
    const criacao = servidor.requisicoes.find(
      (r) => r.metodo === 'POST' && r.caminho === '/admin/directory/entries',
    );
    const corpo = criacao?.corpo as Record<string, unknown>;
    for (const campo of ['postal_code', 'street', 'street_number', 'complement']) {
      expect(corpo[campo]).toBeUndefined();
    }
  });

  it('ISCA: CEP incompleto nao gasta chamada, e nao recusa o formulario', async () => {
    const { servidor } = montar('/perto/novo', {
      'POST /admin/directory/entries': json(201, entrada(), { ETag: '"1"' }),
    });
    await preencherObrigatorios();
    fireEvent.change(screen.getByLabelText('CEP'), { target: { value: '054' } });
    expect(
      servidor.requisicoes.some((r) => r.caminho.startsWith('/admin/postal-codes')),
    ).toBe(false);
  });

  it('ISCA: a edicao mostra o CEP gravado com mascara, e o PATCH manda sem hifen', async () => {
    const gravada = entrada({
      postal_code: OITO_DIGITOS,
      street: 'Rua Harmonia',
      street_number: '120A',
      complement: 'Sala 2',
    });
    const { servidor, router } = montar('/perto/passeios-da-bia', {
      'GET /admin/directory/entries/passeios-da-bia': json(200, gravada, { ETag: '"1-zstd"' }),
      'PATCH /admin/directory/entries/passeios-da-bia': json(200, { ...gravada, version: 2 }),
    });
    await waitFor(() => {
      expect(valorDoCampo('CEP')).toBe(CEP);
    });
    expect(valorDoCampo('Número')).toBe('120A');

    fireEvent.change(screen.getByLabelText('Número'), { target: { value: '121' } });
    fireEvent.click(screen.getByRole('button', { name: 'Salvar alterações' }));
    await waitFor(() => expect(router.state.location.pathname).toBe('/perto'));

    const patch = servidor.requisicoes.find((r) => r.metodo === 'PATCH');
    // SO o numero mudou: o CEP nao entra no corpo, porque comparar os oito
    // digitos com os oito digitos nao da diferenca.
    expect(patch?.corpo).toEqual({ street_number: '121' });
    // E o `If-Match` continua saindo da `version`, e nao do ETag sufixado pela
    // borda ("1-zstd"): o campo novo nao mexeu nisso.
    expect(patch?.cabecalhos.get('If-Match')).toBe('"1"');
  });
});
