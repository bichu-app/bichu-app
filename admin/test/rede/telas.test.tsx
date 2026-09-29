/**
 * As telas da Rede de ponta a ponta contra o duble do contrato, digitando de
 * verdade (user-event). As duas iscas do briefing entram aqui como
 * verificacao sobre o registro do duble: nenhuma operacao sensivel sai sem a
 * senha de reautenticacao, e nenhuma observacao com telefone chega ao servidor.
 */
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { createMemoryRouter, Outlet, RouterProvider } from 'react-router';
import { describe, expect, it, vi } from 'vitest';

import { encontroDeExemplo } from '../../src/rede/duble/massa.ts';
import { criarDuble, SENHA_DO_DUBLE, type Duble } from '../../src/rede/duble/servidor.ts';
import { rotasDaRede } from '../../src/rede/rotas.tsx';
import { ProvedorDeSessao } from '../../src/sessao/ProvedorDeSessao.tsx';
import { observacoesComContatoEnviadas, sensiveisSemReautenticacao } from './verificacoes.ts';

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
    expect(await screen.findByText('4 encontros')).toBeInTheDocument();
    const linha = screen.getByRole('link', { name: 'Socialização para filhotes' }).closest('tr');
    if (!linha) throw new Error('linha nao encontrada');
    expect(within(linha).getByText('Privado')).toBeInTheDocument();
    expect(within(linha).getByText('· R$ 30 por cão')).toBeInTheDocument();
    expect(within(linha).getByRole('link', { name: '3 pedidos pendentes' })).toHaveAttribute('href', '/rede/k3Jx9QpL2mZt7VwR4cYb/pedidos');
    expect(within(linha).getByText('Agendado')).toBeInTheDocument();
    expect(screen.getByText('Acontecendo agora', { selector: '.selo' })).toBeInTheDocument();
    expect(screen.getByText('Encerrado', { selector: '.selo' })).toBeInTheDocument();
  });

  it('filtro de escolha única vira parâmetro do contrato e a contagem diz o filtro', async () => {
    const { duble, usuario } = montar('/rede');
    await screen.findByText('4 encontros');
    await usuario.click(screen.getByRole('radio', { name: 'Encerrados' }));
    expect(await screen.findByText('1 encontro em Encerrados')).toBeInTheDocument();
    const consulta = duble.registro.at(-1)?.consulta;
    expect(consulta?.get('timing')).toBe('ended');
    expect(consulta?.get('publication_status')).toBe('published');
  });

  it('busca digitada chega ao servidor e o sem resultado diz o que limpar', async () => {
    const { usuario } = montar('/rede');
    await screen.findByText('4 encontros');
    const busca = screen.getByRole('searchbox', { name: 'Buscar encontros' });
    // O servidor busca em title, summary e place_name: o placeholder diz os tres.
    expect(busca).toHaveAttribute('placeholder', 'Buscar por título, resumo ou local');
    await usuario.type(busca, 'jacaré');
    expect(await screen.findByText('Nenhum encontro com “jacaré”.')).toBeInTheDocument();
    await usuario.click(screen.getAllByRole('button', { name: 'Limpar busca' }).at(-1) as HTMLElement);
    expect(await screen.findByText('4 encontros')).toBeInTheDocument();
  });

  it('vazia e erro ao carregar', async () => {
    montar('/rede', criarDuble({ encontros: [], pedidos: [] }));
    expect(await screen.findByRole('heading', { name: 'A Rede ainda não tem encontros' })).toBeInTheDocument();
  });

  it('erro ao carregar tem Atualizar, que recarrega a lista inteira', async () => {
    const { usuario } = montar('/rede', criarDuble({ falharLista: true }));
    expect(await screen.findByText('Não conseguimos carregar os encontros.')).toBeInTheDocument();
    await usuario.click(screen.getByRole('button', { name: 'Atualizar' }));
    expect(await screen.findByText('4 encontros')).toBeInTheDocument();
  });

  it('encontro encerrado não oferece cancelar', async () => {
    const { usuario } = montar('/rede');
    await screen.findByText('4 encontros');
    await usuario.click(screen.getByRole('button', { name: 'Mais ações para Piquenique dos vira-latas' }));
    const menu = screen.getByRole('menu');
    expect(within(menu).queryByRole('menuitem', { name: 'Cancelar encontro' })).toBeNull();
    expect(within(menu).getByRole('menuitem', { name: 'Remover' })).toBeInTheDocument();
  });
});

describe('Rede: cancelar e remover pedem a senha (isca)', () => {
  it('cancelar exige motivo e senha, recusa a senha errada e só então cancela', async () => {
    const { duble, usuario } = montar('/rede');
    await screen.findByText('4 encontros');
    await usuario.click(screen.getByRole('button', { name: 'Mais ações para Encontro de cães no parque' }));
    await usuario.click(screen.getByRole('menuitem', { name: 'Cancelar encontro' }));
    const dialogo = screen.getByRole('alertdialog', { name: 'Cancelar “Encontro de cães no parque”?' });
    expect(within(dialogo).getByText(/^O encontro continua no app, marcado como cancelado, até o horário de fim, às 11:00 de 11\/10\/2026\./)).toBeInTheDocument();
    expect(within(dialogo).getByRole('button', { name: 'Voltar' })).toBeInTheDocument();

    await usuario.click(within(dialogo).getByRole('button', { name: 'Cancelar encontro' }));
    expect(within(dialogo).getByText('Escreva o motivo.')).toBeInTheDocument();
    expect(escritas(duble, 'POST', /cancellation$/)).toHaveLength(0);

    await usuario.type(within(dialogo).getByLabelText('Motivo *'), 'A praça vai estar interditada para obra.');
    await usuario.click(within(dialogo).getByRole('button', { name: 'Cancelar encontro' }));
    expect(within(dialogo).getByText('Digite sua senha para confirmar.', { selector: '.err' })).toBeInTheDocument();
    expect(escritas(duble, 'POST', /cancellation$/)).toHaveLength(0);

    await usuario.type(within(dialogo).getByLabelText('Sua senha'), 'errada');
    await usuario.click(within(dialogo).getByRole('button', { name: 'Cancelar encontro' }));
    expect(await within(dialogo).findByText('Senha incorreta.')).toBeInTheDocument();
    expect(escritas(duble, 'POST', /cancellation$/)).toHaveLength(0);

    await usuario.type(within(dialogo).getByLabelText('Sua senha'), SENHA_DO_DUBLE);
    await usuario.click(within(dialogo).getByRole('button', { name: 'Cancelar encontro' }));
    expect(await screen.findByText('Encontro cancelado. O app mostra o aviso de cancelado até o horário de fim, às 11:00 de 11/10/2026.')).toBeInTheDocument();
    expect(screen.queryByRole('alertdialog')).toBeNull();
    const [cancelamento] = escritas(duble, 'POST', /cancellation$/);
    expect(cancelamento?.corpo).toEqual({ note: 'A praça vai estar interditada para obra.' });
    expect(cancelamento?.cabecalhos['if-match']).toBe('"1"');
    expect(sensiveisSemReautenticacao(duble.registro)).toEqual([]);
    expect(screen.getAllByText('Cancelado', { selector: '.selo' })).toHaveLength(1);
  });

  it('bug 5: encontro sem fim fica no app até o fim do dia, e o diálogo diz isso', async () => {
    const { usuario } = montar('/rede');
    await screen.findByText('4 encontros');
    await usuario.click(screen.getByRole('button', { name: 'Mais ações para Caminhada de fim de tarde' }));
    await usuario.click(screen.getByRole('menuitem', { name: 'Cancelar encontro' }));
    const dialogo = screen.getByRole('alertdialog', { name: 'Cancelar “Caminhada de fim de tarde”?' });
    expect(
      within(dialogo).getByText(/^O encontro não tem horário de fim, então continua no app, marcado como cancelado, até o fim do dia 28\/09\/2026\./),
    ).toBeInTheDocument();
    expect(within(dialogo).queryByText(/horário previsto de fim/)).toBeNull();
    await usuario.type(within(dialogo).getByLabelText('Motivo *'), 'Chuva forte.');
    await usuario.type(within(dialogo).getByLabelText('Sua senha'), SENHA_DO_DUBLE);
    await usuario.click(within(dialogo).getByRole('button', { name: 'Cancelar encontro' }));
    expect(await screen.findByText('Encontro cancelado. O app mostra o aviso de cancelado até o fim do dia 28/09/2026.')).toBeInTheDocument();
  });

  it('o foco fica preso no diálogo e Esc devolve o foco ao menu', async () => {
    const { usuario } = montar('/rede');
    await screen.findByText('4 encontros');
    await usuario.click(screen.getByRole('button', { name: 'Mais ações para Encontro de cães no parque' }));
    await usuario.click(screen.getByRole('menuitem', { name: 'Remover' }));
    const dialogo = screen.getByRole('alertdialog', { name: 'Remover “Encontro de cães no parque”?' });
    expect(within(dialogo).getByLabelText('Sua senha')).toHaveFocus();
    for (let i = 0; i < 8; i += 1) {
      await usuario.tab();
      expect(dialogo.contains(document.activeElement)).toBe(true);
    }
    await usuario.keyboard('{Escape}');
    expect(screen.queryByRole('alertdialog')).toBeNull();
    expect(screen.getByRole('button', { name: 'Mais ações para Encontro de cães no parque' })).toHaveFocus();
  });

  it('remover sem senha não envia nada; com senha, remove e a linha diz Removido', async () => {
    const { duble, usuario } = montar('/rede');
    await screen.findByText('4 encontros');
    await usuario.click(screen.getByRole('button', { name: 'Mais ações para Encontro de cães no parque' }));
    await usuario.click(screen.getByRole('menuitem', { name: 'Remover' }));
    const dialogo = screen.getByRole('alertdialog');
    expect(within(dialogo).getByText('O encontro sai do app, e não dá para desfazer. Para avisar que ele não vai acontecer, use Cancelar encontro.')).toBeInTheDocument();
    await usuario.click(within(dialogo).getByRole('button', { name: 'Remover' }));
    expect(within(dialogo).getByText('Digite sua senha para confirmar.', { selector: '.err' })).toBeInTheDocument();
    expect(escritas(duble, 'DELETE', /events\/[^/]+$/)).toHaveLength(0);
    await usuario.type(within(dialogo).getByLabelText('Sua senha'), `${SENHA_DO_DUBLE}{Enter}`);
    expect(await screen.findByText('Encontro removido. Ele saiu da Rede do app.')).toBeInTheDocument();
    expect(escritas(duble, 'DELETE', /events\/[^/]+$/)).toHaveLength(1);
    expect(sensiveisSemReautenticacao(duble.registro)).toEqual([]);
  });
});

async function preencherObrigatorios(usuario: ReturnType<typeof userEvent.setup>) {
  await usuario.type(await screen.findByLabelText('Título *'), 'Encontro na praça');
  await usuario.type(screen.getByLabelText('Descrição *'), 'Manhã para os cães do bairro.');
  await usuario.type(screen.getByLabelText('Início *'), '2026-12-05T09:00');
  await usuario.type(screen.getByLabelText('Nome do local *'), 'Praça Benedito Calixto');
  await usuario.type(screen.getByLabelText('Bairro *'), 'Pinheiros');
  await usuario.type(screen.getByLabelText('Cidade *'), 'São Paulo');
}

describe('Rede: formulário novo', () => {
  it('observação com telefone não sai do formulário (isca), e o resumo leva ao campo', async () => {
    const { duble, usuario } = montar('/rede/novo');
    await preencherObrigatorios(usuario);
    await usuario.type(screen.getByLabelText('Observações'), 'Dúvidas no zap 11 98765-4321');
    await usuario.click(screen.getByRole('button', { name: 'Publicar encontro' }));

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
    await usuario.type(screen.getByLabelText('Valor em reais *'), '15,50');
    await usuario.selectOptions(screen.getByLabelText('Cobrado'), 'por dupla');
    expect(screen.getByText('R$ 15,50 por dupla')).toBeInTheDocument();
    await usuario.click(screen.getByRole('checkbox', { name: 'Guia' }));
    expect(screen.getByRole('checkbox', { name: 'Saquinhos para cocô' })).toBeInTheDocument();
    await usuario.click(screen.getByRole('checkbox', { name: 'Gigante' }));
    await usuario.click(screen.getByRole('checkbox', { name: 'Sombra' }));
    await usuario.type(screen.getByLabelText('Observações'), 'Ponto ao lado do coreto.');
    screen.getByTestId('mapa').focus();
    await usuario.keyboard('{Enter}');
    await usuario.click(screen.getByRole('button', { name: 'Publicar encontro' }));

    expect(await screen.findByText('Encontro publicado. Ele já aparece na Rede do app.')).toBeInTheDocument();
    expect(router.state.location.pathname).toBe('/rede');
    const [criacao] = escritas(duble, 'POST', /\/admin\/network\/events$/);
    expect(criacao?.corpo).toEqual({
      title: 'Encontro na praça',
      summary: 'Manhã para os cães do bairro.',
      place: { place_name: 'Praça Benedito Calixto', neighborhood: 'Pinheiros', city: 'São Paulo', state: 'SP', point: { lat: -23.5505, lon: -46.6333 } },
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

  it('fim antes do início e campos vazios dão as mensagens aprovadas', async () => {
    const { duble, usuario } = montar('/rede/novo');
    await usuario.type(await screen.findByLabelText('Início *'), '2026-12-05T09:00');
    await usuario.type(screen.getByLabelText('Fim'), '2026-12-05T08:00');
    await usuario.click(screen.getByRole('button', { name: 'Publicar encontro' }));
    expect(await screen.findByText('Corrija 6 campos para publicar:')).toBeInTheDocument();
    expect(screen.getByText('Informe o título do encontro.')).toBeInTheDocument();
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

  it('mudar o local pede motivo e senha e vai por relocation', async () => {
    const { duble, usuario } = montar('/rede/encontro-de-caes-no-parque');
    const local = await screen.findByLabelText('Nome do local *');
    await usuario.clear(local);
    await usuario.type(local, 'Praça General Polidoro');
    await usuario.click(screen.getByRole('button', { name: 'Salvar alterações' }));
    const dialogo = await screen.findByRole('alertdialog', { name: 'Salvar a mudança de local?' });
    expect(within(dialogo).getByText('Vai no e-mail que avisa os administradores. Não aparece no app.')).toBeInTheDocument();
    expect(within(dialogo).getByText('Todos os administradores recebem um e-mail com o antes e o depois.')).toBeInTheDocument();
    expect(escritas(duble, 'POST', /relocation$/)).toHaveLength(0);
    await usuario.type(within(dialogo).getByLabelText('Motivo *'), 'O parque fechou para manutenção.');
    await usuario.type(within(dialogo).getByLabelText('Sua senha'), SENHA_DO_DUBLE);
    await usuario.click(within(dialogo).getByRole('button', { name: 'Salvar a mudança' }));
    expect(await screen.findByText('Alterações salvas. O app já mostra os dados novos.')).toBeInTheDocument();
    const [mudanca] = escritas(duble, 'POST', /relocation$/);
    expect(mudanca?.corpo).toMatchObject({ reason: 'O parque fechou para manutenção.', place: { place_name: 'Praça General Polidoro' } });
    expect(sensiveisSemReautenticacao(duble.registro)).toEqual([]);
  });

  it('bug 1: local e acesso juntos pedem a senha uma vez e gravam os dois', async () => {
    const { duble, usuario } = montar('/rede/encontro-de-caes-no-parque');
    const local = await screen.findByLabelText('Nome do local *');
    await usuario.clear(local);
    await usuario.type(local, 'Praça General Polidoro');
    await usuario.click(screen.getByRole('radio', { name: /^Pago/ }));
    await usuario.type(screen.getByLabelText('Valor em reais *'), '20');
    await usuario.click(screen.getByRole('button', { name: 'Salvar alterações' }));
    const dialogo = await screen.findByRole('alertdialog', { name: 'Salvar a mudança de local e de acesso?' });
    await usuario.type(within(dialogo).getByLabelText('Motivo *'), 'O parque passou a cobrar.');
    await usuario.type(within(dialogo).getByLabelText('Sua senha'), SENHA_DO_DUBLE);
    await usuario.click(within(dialogo).getByRole('button', { name: 'Salvar a mudança' }));
    expect(await screen.findByText('Alterações salvas. O app já mostra os dados novos.')).toBeInTheDocument();
    const reauths = duble.registro.filter((r) => r.caminho.endsWith('/auth/reauth'));
    expect(reauths).toHaveLength(1);
    expect(reauths[0]?.corpo).toMatchObject({ scopes: ['network_event_relocation', 'network_event_access_change'] });
    expect(escritas(duble, 'POST', /relocation$/)).toHaveLength(1);
    expect(escritas(duble, 'POST', /access$/)).toHaveLength(1);
    expect(sensiveisSemReautenticacao(duble.registro)).toEqual([]);
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
      await screen.findByText('A foto 2 veio de uma conta que não existe mais. Ela fica no encontro enquanto você não mexer na galeria; qualquer mudança nas fotos a tira do encontro.'),
    ).toBeInTheDocument();
    const afetada = screen.getByRole('listitem', { name: 'Imagem 2 de 2, Sai se a galeria mudar' });
    expect(within(afetada).getByText('Sai se a galeria mudar')).toBeInTheDocument();
    expect(within(screen.getByRole('listitem', { name: 'Imagem 1 de 2, capa' })).queryByText('Sai se a galeria mudar')).toBeNull();
  });

  it('encontro encerrado mostra o aviso de correção', async () => {
    montar('/rede/piquenique-dos-vira-latas');
    expect(await screen.findByText('Este encontro já aconteceu. Você ainda pode corrigir os dados, e a correção aparece no app.')).toBeInTheDocument();
  });

  it('encontro cancelado trava data, local e acesso', async () => {
    const duble = criarDuble({ encontros: [encontroDeExemplo({ publication_status: 'cancelled' })], pedidos: [] });
    montar('/rede/encontro-de-caes-no-parque', duble);
    expect(await screen.findByLabelText('Nome do local *')).toBeDisabled();
    expect(screen.getByRole('radio', { name: /^Privado/ })).toBeDisabled();
    expect(screen.getByLabelText('Título *')).toBeEnabled();
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
    expect(screen.getByText('Recusar não avisa a pessoa. No app, o pedido dela continua como “Pedido enviado” até a data do encontro.')).toBeInTheDocument();
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
    expect(await screen.findByText('Este encontro foi cancelado. Os pedidos dele não podem mais ser aprovados nem recusados.')).toBeInTheDocument();
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
    expect(await screen.findByText('Este encontro já aconteceu. Os pedidos dele não podem mais ser aprovados nem recusados.')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /Aprovar o pedido/ })).toBeNull();
    expect(duble.pedidos.find((p) => p.ref.startsWith('rq_Carla'))?.status).toBe('pending');
  });

  it('encontro público não tem fila', async () => {
    montar('/rede/encontro-de-caes-no-parque/pedidos');
    expect(await screen.findByText('Este encontro é público.')).toBeInTheDocument();
  });
});
