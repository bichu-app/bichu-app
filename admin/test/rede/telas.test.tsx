/**
 * As telas da Rede de ponta a ponta contra o duble do contrato, digitando de
 * verdade (user-event). As duas iscas do briefing entram aqui como
 * verificacao sobre o registro do duble: nenhuma operacao sensivel sai sem a
 * senha de reautenticacao, e nenhuma observacao com telefone chega ao servidor.
 */
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { createMemoryRouter, Outlet, RouterProvider } from 'react-router';
import { describe, expect, it, vi } from 'vitest';

import { encontroDeExemplo } from '../../src/rede/duble/massa.ts';
import { criarDuble, type Duble } from '../../src/rede/duble/servidor.ts';
import { rotasDaRede } from '../../src/rede/rotas.tsx';
import { ProvedorDeSessao } from '../../src/sessao/ProvedorDeSessao.tsx';
import { observacoesComContatoEnviadas, pedidosDeSenha } from './verificacoes.ts';

function montar(rota: string, duble: Duble = criarDuble()) {
  const router = createMemoryRouter(
    [
      {
        path: '/',
        element: (
          <ProvedorDeSessao fetch={duble.fetch} navegarParaFora={vi.fn()}>
            <main>
              <Outlet />
            </main>
          </ProvedorDeSessao>
        ),
        children: rotasDaRede,
      },
    ],
    { initialEntries: [rota] },
  );
  render(<RouterProvider router={router} />);
  return { duble, router, usuario: userEvent.setup() };
}

const escritas = (d: Duble, metodo: string, fim: RegExp) => d.registro.filter((r) => r.metodo === metodo && fim.test(r.caminho));

describe('Rede: lista', () => {
  it('mostra os encontros com selo, acesso, pedidos pendentes e a contagem', async () => {
    montar('/rede');
    expect(await screen.findByText('4 eventos')).toBeInTheDocument();
    const linha = screen.getByRole('link', { name: 'Socialização para filhotes' }).closest('tr');
    if (!linha) throw new Error('linha nao encontrada');
    expect(within(linha).getByText('Privado')).toBeInTheDocument();
    // Encontro antigo com per_dog: aparece como "por pet".
    expect(within(linha).getByText('· R$ 30 por pet')).toBeInTheDocument();
    expect(within(linha).getByRole('link', { name: '3 pedidos pendentes' })).toHaveAttribute('href', '/rede/k3Jx9QpL2mZt7VwR4cYb/pedidos');
    expect(within(linha).getByText('Agendado')).toBeInTheDocument();
    expect(screen.getByText('Acontecendo agora', { selector: '.selo' })).toBeInTheDocument();
    expect(screen.getByText('Encerrado', { selector: '.selo' })).toBeInTheDocument();
  });

  it('filtro de escolha única vira parâmetro do contrato e a contagem diz o filtro', async () => {
    const { duble, usuario } = montar('/rede');
    await screen.findByText('4 eventos');
    await usuario.click(screen.getByRole('radio', { name: 'Encerrados' }));
    expect(await screen.findByText('1 evento em Encerrados')).toBeInTheDocument();
    const consulta = duble.registro.at(-1)?.consulta;
    expect(consulta?.get('timing')).toBe('ended');
    expect(consulta?.get('publication_status')).toBe('published');
  });

  it('busca digitada chega ao servidor e o sem resultado diz o que limpar', async () => {
    const { usuario } = montar('/rede');
    await screen.findByText('4 eventos');
    const busca = screen.getByRole('searchbox', { name: 'Buscar eventos' });
    // O servidor busca em title, summary e place_name: o placeholder diz os tres.
    expect(busca).toHaveAttribute('placeholder', 'Buscar por título, resumo ou local');
    await usuario.type(busca, 'jacaré');
    expect(await screen.findByText('Nenhum evento com “jacaré”.')).toBeInTheDocument();
    await usuario.click(screen.getAllByRole('button', { name: 'Limpar busca' }).at(-1) as HTMLElement);
    expect(await screen.findByText('4 eventos')).toBeInTheDocument();
  });

  it('vazia e erro ao carregar', async () => {
    montar('/rede', criarDuble({ encontros: [], pedidos: [] }));
    expect(await screen.findByRole('heading', { name: 'A Rede ainda não tem eventos' })).toBeInTheDocument();
  });

  it('erro ao carregar tem Atualizar, que recarrega a lista inteira', async () => {
    const { usuario } = montar('/rede', criarDuble({ falharLista: true }));
    expect(await screen.findByText('Não conseguimos carregar os eventos.')).toBeInTheDocument();
    await usuario.click(screen.getByRole('button', { name: 'Atualizar' }));
    expect(await screen.findByText('4 eventos')).toBeInTheDocument();
  });

  it('encontro encerrado não oferece cancelar', async () => {
    const { usuario } = montar('/rede');
    await screen.findByText('4 eventos');
    await usuario.click(screen.getByRole('button', { name: 'Mais ações para Piquenique dos vira-latas' }));
    const menu = screen.getByRole('menu');
    expect(within(menu).queryByRole('menuitem', { name: 'Cancelar evento' })).toBeNull();
    expect(within(menu).getByRole('menuitem', { name: 'Remover' })).toBeInTheDocument();
  });
});

describe('Rede: cancelar e remover confirmam, sem senha (07/10)', () => {
  it('cancelar exige motivo, confirma e cancela sem pedir senha', async () => {
    const { duble, usuario } = montar('/rede');
    await screen.findByText('4 eventos');
    await usuario.click(screen.getByRole('button', { name: 'Mais ações para Encontro de cães no parque' }));
    await usuario.click(screen.getByRole('menuitem', { name: 'Cancelar evento' }));
    const dialogo = screen.getByRole('alertdialog', { name: 'Cancelar “Encontro de cães no parque”?' });
    expect(within(dialogo).getByText(/^O evento continua no app, marcado como cancelado, até o horário de fim, às 11:00 de 11\/10\/2026\./)).toBeInTheDocument();
    expect(within(dialogo).getByRole('button', { name: 'Voltar' })).toBeInTheDocument();

    await usuario.click(within(dialogo).getByRole('button', { name: 'Cancelar evento' }));
    expect(within(dialogo).getByText('Escreva o motivo.')).toBeInTheDocument();
    expect(escritas(duble, 'POST', /cancellation$/)).toHaveLength(0);

    expect(within(dialogo).queryByLabelText('Sua senha')).toBeNull();
    await usuario.type(within(dialogo).getByLabelText('Motivo *'), 'A praça vai estar interditada para obra.');
    await usuario.click(within(dialogo).getByRole('button', { name: 'Cancelar evento' }));
    expect(await screen.findByText('Evento cancelado. O app mostra o aviso de cancelado até o horário de fim, às 11:00 de 11/10/2026.')).toBeInTheDocument();
    expect(screen.queryByRole('alertdialog')).toBeNull();
    const [cancelamento] = escritas(duble, 'POST', /cancellation$/);
    expect(cancelamento?.corpo).toEqual({ note: 'A praça vai estar interditada para obra.' });
    expect(cancelamento?.cabecalhos['if-match']).toBe('"1"');
    expect(pedidosDeSenha(duble.registro)).toEqual([]);
    expect(screen.getAllByText('Cancelado', { selector: '.selo' })).toHaveLength(1);
  });

  it('bug 5: encontro sem fim fica no app até o fim do dia, e o diálogo diz isso', async () => {
    const { usuario } = montar('/rede');
    await screen.findByText('4 eventos');
    await usuario.click(screen.getByRole('button', { name: 'Mais ações para Caminhada de fim de tarde' }));
    await usuario.click(screen.getByRole('menuitem', { name: 'Cancelar evento' }));
    const dialogo = screen.getByRole('alertdialog', { name: 'Cancelar “Caminhada de fim de tarde”?' });
    expect(
      within(dialogo).getByText(/^O evento não tem horário de fim, então continua no app, marcado como cancelado, até o fim do dia 28\/09\/2026\./),
    ).toBeInTheDocument();
    expect(within(dialogo).queryByText(/horário previsto de fim/)).toBeNull();
    await usuario.type(within(dialogo).getByLabelText('Motivo *'), 'Chuva forte.');
    await usuario.click(within(dialogo).getByRole('button', { name: 'Cancelar evento' }));
    expect(await screen.findByText('Evento cancelado. O app mostra o aviso de cancelado até o fim do dia 28/09/2026.')).toBeInTheDocument();
  });

  it('nenhuma escrita protegida por If-Match sai sem ele (o servidor responderia 428)', async () => {
    const { duble, usuario } = montar('/rede');
    await screen.findByText('4 eventos');
    await usuario.click(screen.getByRole('button', { name: 'Mais ações para Encontro de cães no parque' }));
    await usuario.click(screen.getByRole('menuitem', { name: 'Cancelar evento' }));
    const dialogo = screen.getByRole('alertdialog');
    await usuario.type(within(dialogo).getByLabelText('Motivo *'), 'Obra na praça.');
    await usuario.click(within(dialogo).getByRole('button', { name: 'Cancelar evento' }));
    await screen.findByText(/^Evento cancelado\./);
    const protegidas = duble.registro.filter(
      (r) => (r.metodo === 'PATCH' || r.metodo === 'DELETE' || r.metodo === 'POST') && /\/admin\/network\/events\/[^/]+(\/(relocation|cancellation|access))?$/.test(r.caminho),
    );
    expect(protegidas.length).toBeGreaterThan(0);
    expect(protegidas.filter((r) => !r.cabecalhos['if-match'])).toEqual([]);
  });

  it('o foco fica preso no diálogo e Esc devolve o foco ao menu', async () => {
    const { usuario } = montar('/rede');
    await screen.findByText('4 eventos');
    await usuario.click(screen.getByRole('button', { name: 'Mais ações para Encontro de cães no parque' }));
    await usuario.click(screen.getByRole('menuitem', { name: 'Remover' }));
    const dialogo = screen.getByRole('alertdialog', { name: 'Remover “Encontro de cães no parque”?' });
    expect(within(dialogo).getByRole('button', { name: 'Cancelar' })).toHaveFocus();
    expect(within(dialogo).queryByLabelText('Sua senha')).toBeNull();
    for (let i = 0; i < 8; i += 1) {
      await usuario.tab();
      expect(dialogo.contains(document.activeElement)).toBe(true);
    }
    await usuario.keyboard('{Escape}');
    expect(screen.queryByRole('alertdialog')).toBeNull();
    expect(screen.getByRole('button', { name: 'Mais ações para Encontro de cães no parque' })).toHaveFocus();
  });

  it('remover confirma sem senha, e Cancelar não envia nada', async () => {
    const { duble, usuario } = montar('/rede');
    await screen.findByText('4 eventos');
    await usuario.click(screen.getByRole('button', { name: 'Mais ações para Encontro de cães no parque' }));
    await usuario.click(screen.getByRole('menuitem', { name: 'Remover' }));
    const dialogo = screen.getByRole('alertdialog');
    expect(within(dialogo).getByText('O evento sai do app, e não dá para desfazer. Para avisar que ele não vai acontecer, use Cancelar evento.')).toBeInTheDocument();
    expect(within(dialogo).queryByLabelText('Sua senha')).toBeNull();
    await usuario.click(within(dialogo).getByRole('button', { name: 'Cancelar' }));
    expect(escritas(duble, 'DELETE', /events\/[^/]+$/)).toHaveLength(0);
    await usuario.click(screen.getByRole('button', { name: 'Mais ações para Encontro de cães no parque' }));
    await usuario.click(screen.getByRole('menuitem', { name: 'Remover' }));
    await usuario.click(within(screen.getByRole('alertdialog')).getByRole('button', { name: 'Remover' }));
    expect(await screen.findByText('Evento removido. Ele saiu da Rede do app.')).toBeInTheDocument();
    expect(escritas(duble, 'DELETE', /events\/[^/]+$/)).toHaveLength(1);
    expect(pedidosDeSenha(duble.registro)).toEqual([]);
  });
});

async function preencherObrigatorios(usuario: ReturnType<typeof userEvent.setup>) {
  await usuario.type(await screen.findByLabelText('Título *'), 'Encontro na praça');
  await usuario.type(screen.getByLabelText('Descrição *'), 'Manhã para os cães do bairro.');
  await usuario.type(screen.getByLabelText('Início *'), '2026-12-05T09:00');
  await usuario.type(screen.getByLabelText('Nome do lugar *'), 'Praça Benedito Calixto');
  await usuario.type(screen.getByLabelText('Bairro *'), 'Pinheiros');
  await usuario.type(screen.getByLabelText('Cidade *'), 'São Paulo');
}

describe('Rede: formulário novo', () => {
  it('observação com telefone não sai do formulário (isca), e o resumo leva ao campo', async () => {
    const { duble, usuario } = montar('/rede/novo');
    await preencherObrigatorios(usuario);
    await usuario.type(screen.getByLabelText('Observações'), 'Dúvidas no zap 11 98765-4321');
    await usuario.click(screen.getByRole('button', { name: 'Publicar evento' }));

    const resumo = await screen.findByRole('alert');
    expect(resumo).toHaveTextContent('Corrija 1 campo para publicar:');
    // O foco vai para o resumo quando ele aparece (3.13).
    await waitFor(() => expect(resumo).toHaveFocus());
    expect(screen.getByLabelText('Observações')).toHaveAccessibleDescription(/Tire das observações telefone, e-mail, chave Pix ou dados de outra pessoa\./);
    expect(escritas(duble, 'POST', /\/admin\/network\/events$/)).toHaveLength(0);
    expect(observacoesComContatoEnviadas(duble.registro)).toEqual([]);

    await usuario.click(within(resumo).getByRole('link', { name: 'Observações' }));
    expect(screen.getByLabelText('Observações')).toHaveFocus();
  });

  it('publica com os campos do contrato e volta para a lista com o aviso', async () => {
    const { duble, usuario, router } = montar('/rede/novo');
    await preencherObrigatorios(usuario);
    await usuario.click(screen.getByRole('radio', { name: /^Privado/ }));
    await usuario.click(screen.getByRole('radio', { name: /^Pago/ }));
    // UX 30.10 P6: sem valor digitado, a previa mostra um marcador, e nao um valor.
    expect(screen.getByText('R$ {valor} por pet')).toBeInTheDocument();
    await usuario.type(screen.getByLabelText('Valor em reais *'), '15,50');
    const cobrado = screen.getByLabelText('Cobrado');
    expect([...(cobrado as HTMLSelectElement).options].map((o) => o.text)).toEqual(['por pet', 'por humano', 'por dupla (1 humano + 1 pet)', 'por dupla (2 humanos)']);
    await usuario.selectOptions(cobrado, 'por dupla (1 humano + 1 pet)');
    // A previa diz a quem o preco se refere.
    expect(screen.getByText('R$ 15,50 por dupla (1 humano + 1 pet)')).toBeInTheDocument();
    await usuario.click(screen.getByRole('checkbox', { name: 'Guia' }));
    expect(screen.getByRole('checkbox', { name: 'Saquinhos para cocô' })).toBeInTheDocument();
    await usuario.click(screen.getByRole('checkbox', { name: 'Gigante' }));
    await usuario.click(screen.getByRole('checkbox', { name: 'Sombra' }));
    await usuario.type(screen.getByLabelText('Observações'), 'Ponto ao lado do coreto.');
    await usuario.click(screen.getByRole('button', { name: 'Publicar evento' }));

    expect(await screen.findByText('Evento publicado. Ele já aparece na Rede do app.')).toBeInTheDocument();
    expect(router.state.location.pathname).toBe('/rede');
    const [criacao] = escritas(duble, 'POST', /\/admin\/network\/events$/);
    expect(criacao?.corpo).toEqual({
      title: 'Encontro na praça',
      summary: 'Manhã para os cães do bairro.',
      place: { place_name: 'Praça Benedito Calixto', neighborhood: 'Pinheiros', city: 'São Paulo', state: 'SP' },
      starts_at: '2026-12-05T12:00:00.000Z',
      time_zone: 'America/Sao_Paulo',
      images: [],
      accepted_sizes: ['P', 'M', 'G'],
      dog_age: 'any',
      vaccination_required: true,
      fenced_off_leash_area: false,
      amenities: ['shade'],
      visibility: 'private',
      admission: { kind: 'paid', price: { amount: 1550, currency: 'BRL', unit: 'per_pair' } },
      bring_items: ['leash'],
      notes: 'Ponto ao lado do coreto.',
    });
  });

  it('descrição: área de várias linhas, até 200, com contador', async () => {
    const { usuario } = montar('/rede/novo');
    const descricao = await screen.findByLabelText('Descrição *');
    expect(descricao.tagName).toBe('TEXTAREA');
    expect(descricao).toHaveAccessibleDescription(/^Aparece na lista de eventos do app e no topo da página do evento\./);
    await usuario.type(descricao, 'Primeira linha.{Enter}Segunda linha.');
    expect(descricao).toHaveValue('Primeira linha.\nSegunda linha.');
    expect(screen.getByText('30/200')).toBeInTheDocument();
  });

  it('ISCA: o contador da descrição conta 🐶 como 1 e deixa chegar a 200 emojis', async () => {
    const { usuario } = montar('/rede/novo');
    const descricao = await screen.findByLabelText('Descrição *');
    expect(descricao).not.toHaveAttribute('maxlength');
    await usuario.click(descricao);
    await usuario.paste('🐶'.repeat(150));
    expect(screen.getByText('150/200')).toBeInTheDocument();
    await usuario.paste('🐶'.repeat(60));
    expect([...(descricao as HTMLTextAreaElement).value]).toHaveLength(200);
    expect(screen.getByText('200/200')).toBeInTheDocument();
  });

  it('endereço: opcional, ao lado do nome do lugar, com contador em code points', async () => {
    const { usuario } = montar('/rede/novo');
    const endereco = await screen.findByLabelText('Endereço');
    expect(endereco).not.toHaveAttribute('maxlength');
    expect(endereco).toHaveAccessibleDescription(/^Rua e número de um lugar público, nunca de uma casa\. No app, só quem tem conta vê\. Por exemplo: Rua Mourato Coelho, 1200 – Pinheiros, São Paulo\/SP\. Opcional\./);
    await usuario.type(endereco, 'Rua Mourato Coelho, 1200');
    expect(screen.getByText('24/200')).toBeInTheDocument();
  });

  it('endereço vai no corpo da criação, e a recusa de contato aparece no próprio campo', async () => {
    const { duble, usuario } = montar('/rede/novo');
    await preencherObrigatorios(usuario);
    await usuario.type(screen.getByLabelText('Endereço'), 'Rua Mourato Coelho, 1200, fone (11) 98765-4321');
    await usuario.click(screen.getByRole('button', { name: 'Publicar evento' }));
    expect(await screen.findByText('Corrija 1 campo para publicar:')).toBeInTheDocument();
    expect(screen.getByLabelText('Endereço')).toHaveAccessibleDescription(/^Tire do endereço telefone, e-mail, link, perfil ou chave Pix\. Rua, número e CEP podem ficar\./);
    await usuario.clear(screen.getByLabelText('Endereço'));
    await usuario.type(screen.getByLabelText('Endereço'), 'Rua Mourato Coelho, 1200 – Pinheiros, São Paulo/SP');
    await usuario.click(screen.getByRole('button', { name: 'Publicar evento' }));
    expect(await screen.findByText('Evento publicado. Ele já aparece na Rede do app.')).toBeInTheDocument();
    const criacoes = escritas(duble, 'POST', /\/admin\/network\/events$/);
    expect((criacoes.at(-1)?.corpo as { street_address?: string }).street_address).toBe('Rua Mourato Coelho, 1200 – Pinheiros, São Paulo/SP');
  });

  it('o formulário não tem mapa (decisão do cliente de 01/10), na criação e na edição', async () => {
    for (const rota of ['/rede/novo', '/rede/encontro-de-caes-no-parque']) {
      montar(rota);
      await screen.findByLabelText('Título *');
      expect(screen.queryByRole('application')).toBeNull();
      expect(document.querySelector('.leaflet-container')).toBeNull();
      expect(screen.queryByText(/mapa/i)).toBeNull();
      document.body.innerHTML = '';
    }
  });

  it('encontro antigo com per_dog mostra "por pet" e salvar sem mexer não toca no preço', async () => {
    const { duble, usuario } = montar('/rede/k3Jx9QpL2mZt7VwR4cYb');
    expect(await screen.findByLabelText('Cobrado')).toHaveDisplayValue('por pet');
    expect(screen.getByText('R$ 30 por pet')).toBeInTheDocument();
    const titulo = screen.getByLabelText('Título *');
    await usuario.type(titulo, '!');
    await usuario.click(screen.getByRole('button', { name: 'Salvar alterações' }));
    expect(await screen.findByText('Alterações salvas. O app já mostra os dados novos.')).toBeInTheDocument();
    expect(escritas(duble, 'POST', /access$/)).toHaveLength(0);
    expect(duble.encontros.get('k3Jx9QpL2mZt7VwR4cYb')?.admission.price?.unit).toBe('per_dog');
  });

  it('links: o Instagram mostra o @ como vai aparecer, e os dois vão na criação', async () => {
    const { duble, usuario } = montar('/rede/novo');
    await preencherObrigatorios(usuario);
    await usuario.type(screen.getByLabelText('Link do convite ou ingresso'), 'https://sympla.com.br/e/1');
    await usuario.type(screen.getByLabelText('Instagram para dúvidas'), 'https://www.instagram.com/Org.Pet/');
    expect(screen.getByText('Aparece no app como @org.pet.')).toBeInTheDocument();
    expect(screen.getByText('Os dois aparecem para todos no app. Mudar um deles avisa todos os administradores por e-mail, com o antes e o depois.')).toBeInTheDocument();
    await usuario.click(screen.getByRole('button', { name: 'Publicar evento' }));
    expect(await screen.findByText('Evento publicado. Ele já aparece na Rede do app.')).toBeInTheDocument();
    // `instagram_url` com a URL COMPLETA, como a pessoa digitou: o campo de
    // entrada deixou de ser `instagram_handle` em 17/10/2026
    // (`NetworkEventInstagramUrlInput` em `api/openapi.yaml`, que diz
    // "Substituiu `instagram_handle`"), e o painel nao normaliza nada antes
    // de mandar -- quem guarda o handle canonico e o servidor.
    const corpo = escritas(duble, 'POST', /\/admin\/network\/events$/).at(-1)?.corpo as { ticket_url?: string; instagram_url?: string };
    expect(corpo.ticket_url).toBe('https://sympla.com.br/e/1');
    expect(corpo.instagram_url).toBe('https://www.instagram.com/Org.Pet/');
  });

  it('recusas do servidor nos links aparecem no campo, com o texto de cada código', async () => {
    const casos: Array<[string, string, string, string]> = [
      ['ticket_url', 'ticket_url_local_host', 'Link do convite ou ingresso', 'O link precisa ser de um site público.'],
      ['ticket_url', 'ticket_url_has_credentials', 'Link do convite ou ingresso', 'Tire o usuário e a senha do link.'],
      ['ticket_url', 'ticket_url_ip_literal', 'Link do convite ou ingresso', 'Use o endereço do site, e não um número de IP.'],
      // `instagram_url_invalid`, e nao `instagram_handle_invalid`: o campo e os
      // `code` passaram a ser de URL em 17/10/2026, e o apelido cru deixou de
      // ser aceito (`api/openapi.yaml`, `NetworkEventInstagramUrlInput`).
      ['instagram_url', 'instagram_url_invalid', 'Instagram para dúvidas', 'Falta o perfil no fim do endereço. Por exemplo: https://instagram.com/bichu.app'],
    ];
    for (const [field, code, rotulo, texto] of casos) {
      const duble = criarDuble({ recusaDeCampo: { field, code } });
      const { usuario } = montar('/rede/encontro-de-caes-no-parque', duble);
      await usuario.type(await screen.findByLabelText('Link do convite ou ingresso'), 'https://sympla.com.br/e/1');
      // URL completa: com `@org.pet` o painel recusa ANTES de chamar o
      // servidor, e o caso deixaria de exercitar a recusa do servidor.
      await usuario.type(screen.getByLabelText('Instagram para dúvidas'), 'https://instagram.com/org.pet');
      await usuario.click(screen.getByRole('button', { name: 'Salvar alterações' }));
      expect(await screen.findByText('Corrija 1 campo para salvar:')).toBeInTheDocument();
      const campo = screen.getByLabelText(rotulo);
      expect(campo).toHaveAttribute('aria-invalid', 'true');
      expect(campo).toHaveAccessibleDescription(new RegExp(`^${texto.replace(/[.()@]/g, (c) => `\\${c}`)}`));
      document.body.innerHTML = '';
    }
  });

  it('link do convite em http não sai do painel', async () => {
    const { duble, usuario } = montar('/rede/novo');
    await preencherObrigatorios(usuario);
    await usuario.type(screen.getByLabelText('Link do convite ou ingresso'), 'http://sympla.com.br/e/1');
    await usuario.click(screen.getByRole('button', { name: 'Publicar evento' }));
    expect(await screen.findByText('Corrija 1 campo para publicar:')).toBeInTheDocument();
    expect(screen.getByLabelText('Link do convite ou ingresso')).toHaveAccessibleDescription(/^O link precisa começar com https:\/\/\./);
    expect(escritas(duble, 'POST', /\/admin\/network\/events$/)).toHaveLength(0);
  });

  it('fim antes do início e campos vazios dão as mensagens aprovadas', async () => {
    const { duble, usuario } = montar('/rede/novo');
    await usuario.type(await screen.findByLabelText('Início *'), '2026-12-05T09:00');
    await usuario.type(screen.getByLabelText('Fim'), '2026-12-05T08:00');
    await usuario.click(screen.getByRole('button', { name: 'Publicar evento' }));
    expect(await screen.findByText('Corrija 6 campos para publicar:')).toBeInTheDocument();
    expect(screen.getByText('Informe o título do evento.')).toBeInTheDocument();
    expect(screen.getByText('O fim precisa ser depois do início.')).toBeInTheDocument();
    expect(escritas(duble, 'POST', /\/admin\/network\/events$/)).toHaveLength(0);
  });
});

describe('Rede: edição', () => {
  it('só título: PATCH sem senha, com If-Match', async () => {
    const { duble, usuario } = montar('/rede/encontro-de-caes-no-parque');
    const titulo = await screen.findByLabelText('Título *');
    await usuario.clear(titulo);
    await usuario.type(titulo, 'Encontro de cães no Parque da Aclimação');
    await usuario.click(screen.getByRole('button', { name: 'Salvar alterações' }));
    expect(await screen.findByText('Alterações salvas. O app já mostra os dados novos.')).toBeInTheDocument();
    const [patch] = escritas(duble, 'PATCH', /events\/[^/]+$/);
    expect(patch?.corpo).toEqual({ title: 'Encontro de cães no Parque da Aclimação' });
    expect(patch?.cabecalhos['if-match']).toBe('"1"');
    expect(duble.registro.some((r) => r.caminho.endsWith('/auth/reauth'))).toBe(false);
  });

  it('mudar o local pede motivo, sem senha, e vai por relocation', async () => {
    const { duble, usuario } = montar('/rede/encontro-de-caes-no-parque');
    const local = await screen.findByLabelText('Nome do lugar *');
    await usuario.clear(local);
    await usuario.type(local, 'Praça General Polidoro');
    await usuario.click(screen.getByRole('button', { name: 'Salvar alterações' }));
    const dialogo = await screen.findByRole('alertdialog', { name: 'Salvar a mudança de local?' });
    expect(within(dialogo).getByText('Vai no e-mail que avisa os administradores. Não aparece no app.')).toBeInTheDocument();
    expect(within(dialogo).getByText('Todos os administradores recebem um e-mail com o antes e o depois.')).toBeInTheDocument();
    expect(escritas(duble, 'POST', /relocation$/)).toHaveLength(0);
    await usuario.type(within(dialogo).getByLabelText('Motivo *'), 'O parque fechou para manutenção.');
    await usuario.click(within(dialogo).getByRole('button', { name: 'Salvar a mudança' }));
    expect(await screen.findByText('Alterações salvas. O app já mostra os dados novos.')).toBeInTheDocument();
    const [mudanca] = escritas(duble, 'POST', /relocation$/);
    expect(mudanca?.corpo).toMatchObject({ reason: 'O parque fechou para manutenção.', place: { place_name: 'Praça General Polidoro' } });
    expect(pedidosDeSenha(duble.registro)).toEqual([]);
  });

  it('local e acesso juntos: um motivo, sem senha, e gravam os dois', async () => {
    const { duble, usuario } = montar('/rede/encontro-de-caes-no-parque');
    const local = await screen.findByLabelText('Nome do lugar *');
    await usuario.clear(local);
    await usuario.type(local, 'Praça General Polidoro');
    await usuario.click(screen.getByRole('radio', { name: /^Pago/ }));
    await usuario.type(screen.getByLabelText('Valor em reais *'), '20');
    await usuario.click(screen.getByRole('button', { name: 'Salvar alterações' }));
    const dialogo = await screen.findByRole('alertdialog', { name: 'Salvar a mudança de local e de acesso?' });
    await usuario.type(within(dialogo).getByLabelText('Motivo *'), 'O parque passou a cobrar.');
    await usuario.click(within(dialogo).getByRole('button', { name: 'Salvar a mudança' }));
    expect(await screen.findByText('Alterações salvas. O app já mostra os dados novos.')).toBeInTheDocument();
    expect(escritas(duble, 'POST', /relocation$/)).toHaveLength(1);
    expect(escritas(duble, 'POST', /access$/)).toHaveLength(1);
    expect(pedidosDeSenha(duble.registro)).toEqual([]);
  });

  it('editar lugar e endereço: um relocation com os dois, e nenhum PATCH com endereço', async () => {
    const { duble, usuario } = montar('/rede/encontro-de-caes-no-parque');
    const local = await screen.findByLabelText('Nome do lugar *');
    await usuario.clear(local);
    await usuario.type(local, 'Praça General Polidoro');
    await usuario.type(screen.getByLabelText('Endereço'), 'Rua Muniz de Sousa, 1119');
    await usuario.click(screen.getByRole('button', { name: 'Salvar alterações' }));
    const dialogo = await screen.findByRole('alertdialog', { name: 'Salvar a mudança de local?' });
    await usuario.type(within(dialogo).getByLabelText('Motivo *'), 'O parque fechou.');
    await usuario.click(within(dialogo).getByRole('button', { name: 'Salvar a mudança' }));
    expect(await screen.findByText('Alterações salvas. O app já mostra os dados novos.')).toBeInTheDocument();
    expect(pedidosDeSenha(duble.registro)).toEqual([]);
    const [mudanca] = escritas(duble, 'POST', /relocation$/);
    expect(mudanca?.corpo).toMatchObject({ place: { place_name: 'Praça General Polidoro' }, street_address: 'Rua Muniz de Sousa, 1119', reason: 'O parque fechou.' });
    expect(escritas(duble, 'PATCH', /events\/[^/]+$/).filter((r) => 'street_address' in ((r.corpo as object) ?? {}))).toEqual([]);
    expect(duble.encontros.get('encontro-de-caes-no-parque')?.street_address).toBe('Rua Muniz de Sousa, 1119');
  });

  it('ISCA: endereço com contato recusado na mudança de lugar mostra o texto do endereço e marca o campo', async () => {
    const { usuario } = montar('/rede/encontro-de-caes-no-parque');
    const local = await screen.findByLabelText('Nome do lugar *');
    await usuario.clear(local);
    await usuario.type(local, 'Praça General Polidoro');
    await usuario.type(screen.getByLabelText('Endereço'), 'Rua Muniz de Sousa, 1119, zap (11) 98765-4321');
    await usuario.click(screen.getByRole('button', { name: 'Salvar alterações' }));
    const dialogo = await screen.findByRole('alertdialog', { name: 'Salvar a mudança de local?' });
    await usuario.type(within(dialogo).getByLabelText('Motivo *'), 'O parque fechou.');
    await usuario.click(within(dialogo).getByRole('button', { name: 'Salvar a mudança' }));
    const texto = 'Tire do endereço telefone, e-mail, link, perfil ou chave Pix. Rua, número e CEP podem ficar.';
    expect(await within(dialogo).findByText(texto)).toBeInTheDocument();
    expect(within(dialogo).queryByText(/observações/)).toBeNull();
    expect(screen.getByLabelText('Endereço')).toHaveAttribute('aria-invalid', 'true');
    expect(screen.getByLabelText('Endereço')).toHaveAccessibleDescription(new RegExp(`^${texto.replace(/[.]/g, '\\.')}`));
  });

  it('ISCA: o diálogo da mudança de lugar mostra o endereço que continua, antes do motivo', async () => {
    const duble = criarDuble({ encontros: [encontroDeExemplo({ street_address: 'Rua Muniz de Sousa, 1119' })], pedidos: [] });
    const { usuario } = montar('/rede/encontro-de-caes-no-parque', duble);
    const local = await screen.findByLabelText('Nome do lugar *');
    await usuario.clear(local);
    await usuario.type(local, 'Praça General Polidoro');
    await usuario.click(screen.getByRole('button', { name: 'Salvar alterações' }));
    const dialogo = await screen.findByRole('alertdialog', { name: 'Salvar a mudança de local?' });
    const aviso = within(dialogo).getByText('O endereço continua: Rua Muniz de Sousa, 1119. Se mudou, corrija antes de confirmar.');
    const motivo = within(dialogo).getByLabelText('Motivo *');
    expect(aviso.compareDocumentPosition(motivo) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  });

  it('observação com telefone na edição também não sai (isca)', async () => {
    const { duble, usuario } = montar('/rede/encontro-de-caes-no-parque');
    const obs = await screen.findByLabelText('Observações');
    await usuario.clear(obs);
    await usuario.type(obs, 'Liga pra mim 11987654321');
    await usuario.click(screen.getByRole('button', { name: 'Salvar alterações' }));
    expect(await screen.findByText('Corrija 1 campo para salvar:')).toBeInTheDocument();
    expect(escritas(duble, 'PATCH', /events\/[^/]+$/)).toHaveLength(0);
    expect(observacoesComContatoEnviadas(duble.registro)).toEqual([]);
  });

  it('foto sem envio: alerta com a posição e a marca na própria foto (UX 30.7 R1)', async () => {
    const duble = criarDuble({
      encontros: [
        encontroDeExemplo({
          images: [
            { source: 'uploaded', status: 'ready', url: null, rejection_reason: null, upload_id: '00000000-0000-4000-8000-000000000001', position: 0, alt_text: 'Gramado' },
            { source: 'uploaded', status: 'ready', url: null, rejection_reason: null, upload_id: null, position: 1, alt_text: 'Lago' },
          ],
        }),
      ],
      pedidos: [],
    });
    montar('/rede/encontro-de-caes-no-parque', duble);
    expect(
      await screen.findByText('A foto 2 veio de uma conta que não existe mais. Ela fica no evento enquanto você não mexer na galeria; qualquer mudança nas fotos a tira do evento.'),
    ).toBeInTheDocument();
    const afetada = screen.getByRole('listitem', { name: 'Imagem 2 de 2, Sai se a galeria mudar' });
    expect(within(afetada).getByText('Sai se a galeria mudar')).toBeInTheDocument();
    expect(within(screen.getByRole('listitem', { name: 'Imagem 1 de 2, capa' })).queryByText('Sai se a galeria mudar')).toBeNull();
  });

  it('encontro encerrado mostra o aviso de correção', async () => {
    montar('/rede/piquenique-dos-vira-latas');
    expect(await screen.findByText('Este evento já aconteceu. Você ainda pode corrigir os dados, e a correção aparece no app.')).toBeInTheDocument();
  });

  it('encontro cancelado trava data, local e acesso', async () => {
    const duble = criarDuble({ encontros: [encontroDeExemplo({ publication_status: 'cancelled' })], pedidos: [] });
    montar('/rede/encontro-de-caes-no-parque', duble);
    expect(await screen.findByLabelText('Nome do lugar *')).toBeDisabled();
    expect(screen.getByLabelText('Nome do lugar *')).toHaveAccessibleDescription(
      'Como o lugar é conhecido, do jeito que aparece no app. Por exemplo: Praça Benedito Calixto ou Parque da Aclimação. Rua e número vão em Endereço.',
    );
    expect(screen.getByRole('radio', { name: /^Privado/ })).toBeDisabled();
    expect(screen.getByLabelText('Título *')).toBeEnabled();
  });
});

describe('ISCA: cada campo editável do encontro sai para o servidor', () => {
  type U = ReturnType<typeof userEvent.setup>;
  const casos: Array<[string, (u: U) => Promise<void>, RegExp]> = [
    ['título', async (u) => u.type(screen.getByLabelText('Título *'), '!'), /events\/[^/]+$/],
    ['descrição', async (u) => u.type(screen.getByLabelText('Descrição *'), '!'), /events\/[^/]+$/],
    ['descrição da foto', async (u) => u.type(screen.getByLabelText(/Descrição da imagem/), '!'), /events\/[^/]+$/],
    ['o que levar', async (u) => u.click(screen.getByRole('checkbox', { name: 'Brinquedo' })), /events\/[^/]+$/],
    ['observações', async (u) => u.type(screen.getByLabelText('Observações'), '!'), /events\/[^/]+$/],
    ['portes', async (u) => u.click(screen.getByRole('checkbox', { name: 'Gigante' })), /events\/[^/]+$/],
    ['idade', async (u) => u.click(screen.getByRole('radio', { name: 'Até 1 ano' })), /events\/[^/]+$/],
    ['vacina', async (u) => u.click(screen.getAllByRole('radio', { name: 'Não' })[0] as HTMLElement), /events\/[^/]+$/],
    ['estrutura', async (u) => u.click(screen.getByRole('checkbox', { name: 'Bancos' })), /events\/[^/]+$/],
    ['link do convite', async (u) => u.type(screen.getByLabelText('Link do convite ou ingresso'), 'https://sympla.com.br/e/1'), /events\/[^/]+$/],
    // URL completa do perfil: o apelido cru e recusado desde 17/10/2026
    // (`NetworkEventInstagramUrlInput`), e com `@org.pet` o painel para no
    // proprio formulario e nada sai para o servidor.
    ['Instagram', async (u) => u.type(screen.getByLabelText('Instagram para dúvidas'), 'https://instagram.com/org.pet'), /events\/[^/]+$/],
    ['horário de início', () => Promise.resolve(void fireEvent.change(screen.getByLabelText('Início *'), { target: { value: '2026-10-11T08:00' } })), /relocation$/],
    ['fim', () => Promise.resolve(void fireEvent.change(screen.getByLabelText('Fim'), { target: { value: '2026-10-11T12:00' } })), /relocation$/],
    ['nome do lugar', async (u) => u.type(screen.getByLabelText('Nome do lugar *'), '!'), /relocation$/],
    ['endereço', async (u) => u.type(screen.getByLabelText('Endereço'), 'Rua Muniz de Sousa, 1119'), /relocation$/],
    ['bairro', async (u) => u.type(screen.getByLabelText('Bairro *'), '!'), /relocation$/],
    ['visibilidade', async (u) => u.click(screen.getByRole('radio', { name: /^Privado/ })), /access$/],
    ['preço', async (u) => { await u.click(screen.getByRole('radio', { name: /^Pago/ })); await u.type(screen.getByLabelText('Valor em reais *'), '20'); }, /access$/],
  ];
  it.each(casos)('%s', async (_nome, editar, destino) => {
    const { duble, usuario } = montar('/rede/encontro-de-caes-no-parque');
    await screen.findByLabelText('Título *');
    await editar(usuario);
    await usuario.click(screen.getByRole('button', { name: 'Salvar alterações' }));
    const dialogo = screen.queryByRole('alertdialog');
    if (dialogo) {
      await usuario.type(within(dialogo).getByLabelText('Motivo *'), 'Ajuste.');
      expect(within(dialogo).queryByLabelText('Sua senha')).toBeNull();
      await usuario.click(within(dialogo).getByRole('button', { name: 'Salvar a mudança' }));
    }
    expect(await screen.findByText('Alterações salvas. O app já mostra os dados novos.')).toBeInTheDocument();
    expect(duble.registro.filter((r) => r.metodo !== 'GET' && destino.test(r.caminho)).length).toBeGreaterThan(0);
  });

  it('salvar sem mudar nada não envia e diz "Nada mudou"', async () => {
    const { duble, usuario } = montar('/rede/encontro-de-caes-no-parque');
    await screen.findByLabelText('Título *');
    await usuario.click(screen.getByRole('button', { name: 'Salvar alterações' }));
    expect(await screen.findByText('Nada mudou. Altere algum campo antes de salvar.')).toBeInTheDocument();
    expect(screen.queryByText(/Alterações salvas/)).toBeNull();
    expect(duble.registro.filter((r) => r.metodo !== 'GET' && !r.caminho.endsWith('/session'))).toEqual([]);
  });
});

describe('Rede: fila de pedidos', () => {
  const PRIVADO = '/rede/k3Jx9QpL2mZt7VwR4cYb/pedidos';

  it('abas com contagem, nome nulo, conta validada e mês de criação', async () => {
    montar(PRIVADO);
    const pendentes = await screen.findByRole('tab', { name: /Pendentes/ });
    expect(pendentes).toHaveAttribute('aria-selected', 'true');
    await waitFor(() => expect(screen.getByRole('tab', { name: 'Aprovados 1' })).toBeInTheDocument());
    expect(screen.getByRole('tab', { name: 'Pendentes 3' })).toBeInTheDocument();
    expect(await screen.findByText('Conta sem nome de exibição')).toBeInTheDocument();
    const carla = screen.getByText('Carla M.').closest('li');
    if (!carla) throw new Error('pedido nao encontrado');
    expect(within(carla).getByText('Conta validada')).toBeInTheDocument();
    expect(within(carla).getByText(/Conta criada em março de 2026 · Pediu em 21\/09\/2026 às 14:32/)).toBeInTheDocument();
    expect(screen.getByText('Recusar não avisa a pessoa. No app, o pedido dela continua como “Pedido enviado” até a data do evento.')).toBeInTheDocument();
  });

  it('aprovar não tem desfazer; recusar tem, e desfazer aprova', async () => {
    const { duble, usuario } = montar(PRIVADO);
    await usuario.click(await screen.findByRole('button', { name: 'Aprovar o pedido de Carla M.' }));
    const aprovado = await screen.findByText('Pedido de Carla M. aprovado.');
    expect(within(aprovado.closest('.banner') as HTMLElement).queryByRole('button', { name: 'Desfazer' })).toBeNull();

    await usuario.click(await screen.findByRole('button', { name: 'Recusar o pedido de João Pedro' }));
    const recusado = await screen.findByText('Pedido de João Pedro recusado. A pessoa não é avisada.');
    await usuario.click(within(recusado.closest('.banner') as HTMLElement).getByRole('button', { name: 'Desfazer' }));
    expect(await screen.findByText('Pedido de João Pedro aprovado.')).toBeInTheDocument();
    expect(duble.pedidos.find((p) => p.ref.startsWith('rq_Joao'))?.status).toBe('approved');
  });

  it('decidir atualiza lista e contagens na tela, sem reler a fila (D56)', async () => {
    const { duble, usuario } = montar(PRIVADO);
    await screen.findByText('Carla M.');
    await waitFor(() => expect(screen.getByRole('tab', { name: 'Recusados 1' })).toBeInTheDocument());
    const leituras = () => duble.registro.filter((r) => r.metodo === 'GET' && r.caminho.endsWith('/join-requests')).length;
    const antes = leituras();
    await usuario.click(screen.getByRole('button', { name: 'Aprovar o pedido de Carla M.' }));
    await screen.findByText('Pedido de Carla M. aprovado.');
    await usuario.click(screen.getByRole('button', { name: 'Recusar o pedido de João Pedro' }));
    await screen.findByText('Pedido de João Pedro recusado. A pessoa não é avisada.');
    expect(screen.queryByText('Carla M.')).toBeNull();
    expect(screen.queryByText('João Pedro')).toBeNull();
    expect(screen.getByRole('tab', { name: 'Pendentes 1' })).toBeInTheDocument();
    expect(screen.getByRole('tab', { name: 'Aprovados 2' })).toBeInTheDocument();
    expect(screen.getByRole('tab', { name: 'Recusados 2' })).toBeInTheDocument();
    expect(leituras()).toBe(antes);
  });

  it('teto de linhas da fila estourado (429) diz quanto esperar', async () => {
    montar(PRIVADO, criarDuble({ tetoDeLinhasDaFila: 2 }));
    expect(await screen.findByText('A fila foi consultada muitas vezes na última hora. Tente de novo em 1 hora.')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Atualizar' })).toBeInTheDocument();
  });

  it('aba Aprovados não oferece recusar; Recusados oferece aprovar; setas trocam de aba', async () => {
    const { usuario } = montar(PRIVADO);
    const pendentes = await screen.findByRole('tab', { name: /Pendentes/ });
    pendentes.focus();
    await usuario.keyboard('{ArrowRight}');
    expect(screen.getByRole('tab', { name: /Aprovados/ })).toHaveFocus();
    expect(await screen.findByText('Rafael T.')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /Recusar/ })).toBeNull();
    await usuario.keyboard('{ArrowRight}');
    expect(await screen.findByRole('button', { name: 'Aprovar o pedido de Marcos V.' })).toBeInTheDocument();
  });

  it('a contagem das outras abas pede uma linha só (D56)', async () => {
    const { duble } = montar(PRIVADO);
    await screen.findByText('Carla M.');
    await waitFor(() => expect(duble.registro.filter((r) => r.caminho.endsWith('/join-requests'))).toHaveLength(3));
    const limites = duble.registro.filter((r) => r.caminho.endsWith('/join-requests')).map((r) => [r.consulta.get('status'), r.consulta.get('limit')]);
    expect(limites).toEqual(expect.arrayContaining([['pending', '50'], ['approved', '1'], ['declined', '1']]));
  });

  it('encontro cancelado: a fila avisa que fechou e não oferece aprovar nem recusar', async () => {
    const duble = criarDuble();
    const privado = duble.encontros.get('k3Jx9QpL2mZt7VwR4cYb');
    if (!privado) throw new Error('massa sem o privado');
    privado.publication_status = 'cancelled';
    montar(PRIVADO, duble);
    expect(await screen.findByText('Este evento foi cancelado. Os pedidos dele não podem mais ser aprovados nem recusados.')).toBeInTheDocument();
    await screen.findByText('Carla M.');
    expect(screen.queryByRole('button', { name: /Aprovar o pedido/ })).toBeNull();
    expect(screen.queryByRole('button', { name: /Recusar o pedido/ })).toBeNull();
  });

  it('409 event-not-open na decisão (encontro fechou depois da leitura) tira os botões e diz o motivo', async () => {
    const { duble, usuario } = montar(PRIVADO);
    await usuario.click(await screen.findByRole('button', { name: 'Aprovar o pedido de Carla M.' }).then((b) => {
      const privado = duble.encontros.get('k3Jx9QpL2mZt7VwR4cYb');
      if (privado) privado.timing = 'ended';
      return b;
    }));
    expect(await screen.findByText('Este evento já aconteceu. Os pedidos dele não podem mais ser aprovados nem recusados.')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /Aprovar o pedido/ })).toBeNull();
    expect(duble.pedidos.find((p) => p.ref.startsWith('rq_Carla'))?.status).toBe('pending');
  });

  it('encontro público não tem fila', async () => {
    montar('/rede/encontro-de-caes-no-parque/pedidos');
    expect(await screen.findByText('Este evento é público.')).toBeInTheDocument();
  });
});
