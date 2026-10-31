/**
 * AS IMAGENS DA INDICACAO NA FILA DO PAINEL.
 *
 * Ate o PR #122 o contrato nao projetava imagem nenhuma na fila:
 * `AdminDirectorySuggestion` tinha 13 campos e `additionalProperties: false`, e
 * a migracao que criou a coluna do logotipo escreveu que *"este UUID nunca sai
 * em resposta; hoje ninguem le"*. O PR #122 acrescentou `logo_url` (derivada
 * `thumb`), `photo_urls` (derivadas `card`, **so as `ready`**) e
 * `photos_total`. Quem revisa decidia **sem ver nada**.
 *
 * Os tres estados que este arquivo guarda:
 *
 * 1. **com imagens** -- logo e ate quatro fotos, em tamanho de julgar;
 * 2. **processando** -- `photos_total` maior que `photo_urls.length`: a tela
 *    DIZ quantas faltam, em vez de mostrar buraco;
 * 3. **sem imagem** -- caso legitimo (o campo e opcional), e que nao pode virar
 *    `img` sem `src`, que o navegador pinta como imagem quebrada.
 *
 * ## A ISCA, e por que ela nao e decorativa
 *
 * `faltandoNaTela` compara as URLs que o SERVIDOR entregou com as que a tela
 * DESENHOU. Cada conferencia roda duas vezes: contra a tela de verdade, onde
 * precisa passar, e contra uma isca que desenha a indicacao sem o bloco de
 * imagens -- exatamente o codigo de antes deste trabalho --, onde precisa
 * REPROVAR nomeando as URLs que ficaram de fora. Conferencia que nao consegue
 * reprovar a isca nao confere nada, e o teste cai.
 *
 * Alem da isca em arquivo, as quatro abaixo foram desligadas no codigo de
 * producao em 30/10/2026, conferidas no disco, a suite rodada e reprovada, e o
 * arquivo restaurado:
 *
 * | o que foi desligado | `fail` |
 * |---|---|
 * | `<ImagensDaIndicacao>` nos dois dialogos (o revisor volta a decidir no escuro) | 6 |
 * | `<LogoDaIndicacao>` e `marcaDasFotos` na linha da fila | 2 |
 * | o bloco `processando > 0` (a foto que falta vira silencio) | 2 |
 * | o estado "sem imagem" trocado por `<img src="">` (a imagem quebrada) | 1 |
 *
 * A primeira reprovou NOMEANDO as cinco URLs que o servidor entregou e a tela
 * nao desenhou -- que e o que se pede de uma isca: falhar com o nome do que
 * falta, e nao com "esperava true, veio false".
 */
import { fireEvent, render, screen, within } from '@testing-library/react';
import { createMemoryRouter, RouterProvider } from 'react-router';
import { describe, expect, it, vi } from 'vitest';

import type { Esquemas } from '../../src/api/cliente.ts';
import { imagensDa, marcaDasFotos } from '../../src/diretorio/fila.ts';
import { criarRotas } from '../../src/rotas.tsx';
import { criarServidorFalso, json, SESSAO, type Resposta, type Rota } from '../apoio/servidor-falso.ts';

type Indicacao = Esquemas['AdminDirectorySuggestion'];

const LOGO = 'https://img.bichu.app/directory/thumb/pata-amiga.jpeg';
const FOTO1 = 'https://img.bichu.app/directory/card/pata-amiga-1.jpeg';
const FOTOS = [
  FOTO1,
  'https://img.bichu.app/directory/card/pata-amiga-2.jpeg',
  'https://img.bichu.app/directory/card/pata-amiga-3.jpeg',
  'https://img.bichu.app/directory/card/pata-amiga-4.jpeg',
];

function indicacao(extra: Partial<Indicacao> = {}): Indicacao {
  return {
    reference: 'Ab12Cd34Ef56Gh78Ij90Kl',
    display_name: 'Clínica Pata Amiga',
    kind: 'clinic',
    entity_kind: 'organization',
    city: 'São Paulo',
    state: 'SP',
    neighborhood: 'Pinheiros',
    public_contact: { kind: 'phone', value: '+5511955550100' },
    note: null,
    review_status: 'pending',
    created_at: '2026-10-29T12:00:00.000Z',
    decided_at: null,
    decline_reason: null,
    entry_slug: null,
    logo_url: null,
    photo_urls: [],
    photos_total: 0,
    ...extra,
  };
}

/** As URLs de imagem que a arvore REALMENTE desenhou. */
export function urlsDesenhadas(raiz: HTMLElement): string[] {
  return [...raiz.querySelectorAll('img')].map((e) => e.getAttribute('src') ?? '');
}

/**
 * A CONFERENCIA: o que o servidor entregou e a tela nao desenhou.
 * Lista vazia e aprovacao; qualquer URL aqui nomeia o que o revisor nao viu.
 */
export function faltandoNaTela(raiz: HTMLElement, entregues: readonly string[]): string[] {
  const desenhadas = new Set(urlsDesenhadas(raiz));
  return entregues.filter((u) => !desenhadas.has(u));
}

/** `img` sem endereco: o buraco que o navegador pinta como imagem quebrada. */
export function imagensQuebradas(raiz: HTMLElement): number {
  return urlsDesenhadas(raiz).filter((s) => s.trim() === '').length;
}

/**
 * A ISCA: a indicacao desenhada SEM o bloco de imagens -- o codigo de antes
 * deste trabalho, que mostrava nome, lugar e contato e mais nada.
 */
function IscaSemImagens({ indicacao: i }: { indicacao: Indicacao }) {
  return (
    <div>
      <span>{i.display_name}</span>
      <span>
        {i.city} · {i.state}
      </span>
      <span>{i.public_contact.value}</span>
    </div>
  );
}

function montar(rotas: Record<string, Rota | Resposta> = {}) {
  const servidor = criarServidorFalso({ 'GET /admin/session': json(200, SESSAO), ...rotas });
  const router = createMemoryRouter(criarRotas({ fetch: servidor.fetch, navegarParaFora: vi.fn() }), {
    initialEntries: ['/perto/indicacoes'],
  });
  render(<RouterProvider router={router} />);
  return { servidor, router };
}

function pagina(i: Indicacao): Resposta {
  return json(200, { items: [i], total: 1, page: 1, limit: 50, pending_total: 1 });
}

/** A linha da fila, depois que a lista pintou. */
async function linhaDaFila(): Promise<HTMLElement> {
  await screen.findByText('Clínica Pata Amiga');
  const el = document.querySelector<HTMLElement>('[data-cy="indicacao-linha"]');
  if (el === null) throw new Error('a linha da fila não foi desenhada');
  return el;
}

/** Abre o diálogo de decidir, que é onde quem revisa julga. */
async function abrirAprovacao(nome = 'Clínica Pata Amiga') {
  fireEvent.click(await screen.findByRole('button', { name: `Aprovar a indicação de ${nome}` }));
  return await screen.findByRole('alertdialog');
}

describe('a conferência sabe reprovar (a isca)', () => {
  it('REPROVA a isca que não desenha as imagens, nomeando as cinco URLs', () => {
    const i = indicacao({ logo_url: LOGO, photo_urls: FOTOS, photos_total: 4 });
    const { container } = render(<IscaSemImagens indicacao={i} />);

    const faltam = faltandoNaTela(container, [LOGO, ...FOTOS]);

    expect(faltam).toEqual([LOGO, ...FOTOS]);
    expect(faltam).toHaveLength(5);
  });
});

describe('estado 1: com imagens', () => {
  it('a tela de verdade desenha o logotipo e as quatro fotos que o contrato entregou', async () => {
    const i = indicacao({ logo_url: LOGO, photo_urls: FOTOS, photos_total: 4 });
    montar({ 'GET /admin/directory/suggestions': pagina(i) });
    const dialogo = await abrirAprovacao();

    expect(faltandoNaTela(dialogo, [LOGO, ...FOTOS])).toEqual([]);
    expect(imagensQuebradas(dialogo)).toBe(0);
  });

  it('cada foto tem descrição com a posição, e o logotipo nomeia a indicação', async () => {
    const i = indicacao({ logo_url: LOGO, photo_urls: FOTOS, photos_total: 4 });
    montar({ 'GET /admin/directory/suggestions': pagina(i) });
    const dialogo = await abrirAprovacao();

    for (const n of [1, 2, 3, 4]) {
      expect(
        within(dialogo).getByAltText(`Foto ${String(n)} do estabelecimento indicado`),
      ).toBeInTheDocument();
    }
    expect(
      within(dialogo).getByAltText('Logotipo enviado na indicação de Clínica Pata Amiga'),
    ).toBeInTheDocument();
  });

  it('a LINHA leva a logo e a contagem, e não as quatro fotos (20 linhas × 4 = 80 `card`)', async () => {
    const i = indicacao({ logo_url: LOGO, photo_urls: FOTOS, photos_total: 4 });
    montar({ 'GET /admin/directory/suggestions': pagina(i) });

    const linha = await linhaDaFila();
    expect(urlsDesenhadas(linha)).toEqual([LOGO]);
    expect(linha.textContent).toContain('4 fotos');
  });

  it('o mesmo bloco aparece ao RECUSAR: a foto é o que mostra que o lugar fechou', async () => {
    const i = indicacao({ logo_url: LOGO, photo_urls: FOTOS, photos_total: 4 });
    montar({ 'GET /admin/directory/suggestions': pagina(i) });

    fireEvent.click(
      await screen.findByRole('button', { name: 'Recusar a indicação de Clínica Pata Amiga' }),
    );
    const dialogo = await screen.findByRole('alertdialog');

    expect(faltandoNaTela(dialogo, [LOGO, ...FOTOS])).toEqual([]);
  });
});

describe('estado 2: processando', () => {
  it('diz na tela quantas faltam quando `photos_total` é maior que as prontas', async () => {
    const i = indicacao({ logo_url: null, photo_urls: [FOTO1], photos_total: 4 });
    montar({ 'GET /admin/directory/suggestions': pagina(i) });
    const dialogo = await abrirAprovacao();

    // A que ficou pronta aparece...
    expect(faltandoNaTela(dialogo, [FOTO1])).toEqual([]);
    // ...e as tres que faltam sao DITAS, nao omitidas.
    expect(dialogo.textContent).toContain('Mais 3 fotos ainda estão sendo processadas');
    expect(imagensQuebradas(dialogo)).toBe(0);
  });

  it('nenhuma pronta e quatro enviadas ainda é "processando", e não "sem fotos"', async () => {
    const i = indicacao({ photo_urls: [], photos_total: 4 });
    montar({ 'GET /admin/directory/suggestions': pagina(i) });
    const dialogo = await abrirAprovacao();

    expect(dialogo.textContent).toContain('Mais 4 fotos ainda estão sendo processadas');
    expect(dialogo.textContent).not.toContain('Esta indicação não tem imagens');
  });

  it('a linha separa os dois casos na contagem', () => {
    expect(marcaDasFotos(indicacao({ photo_urls: [FOTO1], photos_total: 4 }))).toBe(
      '1 de 4 fotos prontas',
    );
    expect(marcaDasFotos(indicacao({ photo_urls: [], photos_total: 4 }))).toBe('0 de 4 fotos prontas');
    expect(marcaDasFotos(indicacao({ photo_urls: FOTOS, photos_total: 4 }))).toBe('4 fotos');
    expect(marcaDasFotos(indicacao())).toBe('Sem fotos');
  });
});

describe('estado 3: sem imagem', () => {
  it('é dito com palavra, e nunca com uma imagem quebrada', async () => {
    montar({ 'GET /admin/directory/suggestions': pagina(indicacao()) });
    const dialogo = await abrirAprovacao();

    expect(dialogo.textContent).toContain('Esta indicação não tem imagens');
    expect(imagensQuebradas(dialogo)).toBe(0);
    expect(dialogo.querySelectorAll('img')).toHaveLength(0);
  });

  it('a linha também não desenha `img` nenhum quando não há logotipo', async () => {
    montar({ 'GET /admin/directory/suggestions': pagina(indicacao()) });

    const linha = await linhaDaFila();
    expect(linha.querySelectorAll('img')).toHaveLength(0);
    expect(linha.textContent).toContain('Sem fotos');
  });
});

describe('a leitura dos três campos', () => {
  it('`processando` nunca é negativo, mesmo com total menor que a lista', () => {
    const r = imagensDa(indicacao({ photo_urls: FOTOS, photos_total: 1 }));
    expect(r.processando).toBe(0);
  });

  it('`temAlgo` é falso só quando não há logo, nem pronta, nem processando', () => {
    expect(imagensDa(indicacao()).temAlgo).toBe(false);
    expect(imagensDa(indicacao({ logo_url: LOGO })).temAlgo).toBe(true);
    expect(imagensDa(indicacao({ photo_urls: [], photos_total: 2 })).temAlgo).toBe(true);
  });
});
