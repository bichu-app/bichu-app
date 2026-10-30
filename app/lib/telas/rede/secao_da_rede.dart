import 'dart:async';

import 'package:flutter/material.dart';
import 'package:go_router/go_router.dart';

import '../../api/contadores_api.dart';
import '../../api/pessoas_api.dart';
import '../../escopo.dart';
import '../../roteamento/rotas.dart';
import '../../sessao/controlador_de_sessao.dart';
import '../../theme/bichu_colors.dart';
import '../../theme/bichu_tokens.g.dart';
import '../../widgets/acao_de_criar_flutuante.dart';
import '../../widgets/barra_de_listagem.dart';
import '../abas.dart';
import '../casca_com_abas.dart';
import '../perto/lista_do_diretorio.dart';
import 'agenda_da_rede.dart';
import 'busca_de_pessoas.dart';

/// As TRES abas da secao `Rede` reunida (cliente, 19/10 e 21/10/2026).
///
/// `Eventos` primeiro porque e o conteudo historico da secao e o que o
/// arranque do app abre (`Rotas.destinoDoArranque`). `Comunidade` e o que era
/// a secao `Perto`.
///
/// **`Comunidade` e ABA e nao nome de secao, e a razao e MEDIDA.** Ela pede
/// **113,25 dp** num slot de barra de 64,00 e reprova em 320, 375 e 412 dp --
/// a mesma parede que recusou `Mensagens` (103,67 dp). `Rede` pede 45,08 e
/// cabe nos tres. Como ABA ela nao disputa slot de 64 dp: a aba recebe a
/// largura do proprio texto (ver `isScrollable` em [SecaoDaRede]).
/// ## O GLIFO DE CADA ABA (cliente, 22/10/2026)
///
/// Literal: *"na secao rede, nas abas eventos, comunidade e usuarios, vamos
/// trazer um icone para deixar mais bonito"*. **A ESCOLHA DOS TRES GLIFOS E
/// MINHA e pode ser revista por ele** -- ele pediu icone, nao disse quais.
///
/// Cada um foi escolhido pelo CONTEUDO da aba e nao pela estetica:
///
///   - `event` para `Eventos` -- o calendario marcado, que e o objeto da aba;
///   - `place` para `Comunidade` -- o alfinete. Ele e o glifo que ESTE conteudo
///     ja carregava: `Perto` era uma secao da barra com
///     `CampoSemantico.lugar`, e quando ela virou esta aba em 19/10/2026 o
///     campo saiu do enum junto (ver a prosa de [CampoSemantico]). O conteudo
///     nao mudou, so o lugar dele, e o alfinete volta com ele;
///   - `person_search` para `Usuarios` -- a cabeca COM a lupa, e nao `groups`
///     nem `people`. Os dois ultimos desenham cabecas, que e exatamente o que
///     `groups` desenha na barra para a secao `Rede` inteira: um deles aqui
///     poria o mesmo desenho duas vezes na mesma tela, uma na barra e outra
///     numa aba dela. A lupa tambem diz o que a aba FAZ, que e buscar.
///
/// **O campo semantico da barra nao se aplica**, e isto nao e descuido: o
/// registro de [CampoSemantico] e de SECAO, e a prosa dele diz com todas as
/// letras que *aba NAO declara campo semantico*. O portao `glifos_da_barra`
/// varre `CascaComAbas.destinos`, e nenhuma destas tres entra lá.
enum AbaDaSecaoRede {
  eventos('Eventos', Icons.event_outlined),
  comunidade('Comunidade', Icons.place_outlined),

  /// A ABA QUE ENTROU EM 21/10/2026, e o pedido dele e literal: *"na aba rede,
  /// temos que ter uma aba de usuarios, e o campo buscar para encontrar e
  /// adicionar as pessoas"*.
  ///
  /// **O ROTULO CABE, E A ABA NASCE CORTADA -- as duas coisas sao verdade, e a
  /// segunda e que decide o desenho.** Medido com a `Inter SemiBold` em 18 dp,
  /// que e o estilo real do rotulo de aba desta tela:
  ///
  ///   `Eventos`      69,81 dp de texto -> 101,81 dp de slot
  ///   `Comunidade`  110,62 dp de texto -> 142,62 dp de slot
  ///   `Usuarios`     77,31 dp de texto -> 109,31 dp de slot
  ///
  /// `Usuarios` pede **33,31 dp menos** que `Comunidade` e a 200% de escala
  /// continua sem reticencia -- entao ele cabe, e a barra rolavel desta secao
  /// nao corta nenhum dos tres.
  ///
  /// O que ele **nao** tem e visibilidade inicial. Os tres slots somam
  /// **353,74 dp**. Em 320 dp o corpo tem 288 dp de area util e a terceira aba
  /// comeca em 244,43: aparecem **43,57 dos 109,31 dp**, cerca de 40% do
  /// rotulo. A 200% de escala ela comeca em 424,86 dp de um viewport de 288 --
  /// **inteira fora da tela**.
  ///
  /// **E e por isso que o botao do Mural vazio nao e enfeite: ele e o caminho
  /// real.** A aba que destrava o produto nao pode depender de a pessoa
  /// descobrir que a barra rola. Os dois caminhos existem, e o do Mural e o que
  /// todo mundo atravessa no primeiro dia.
  ///
  /// **Terceira e nao segunda**, e a ordem foi escolhida: trocar com
  /// `Comunidade` poria `Usuarios` inteira na tela, mas empurraria o diretorio
  /// -- que e conteudo publico, alcancavel sem conta -- para tras de uma aba
  /// que exige conta.
  usuarios('Usuários', Icons.person_search_outlined);

  const AbaDaSecaoRede(this.rotulo, this.glifo);

  final String rotulo;

  /// O glifo da aba. Ver a prosa acima do enum: a escolha e minha.
  final IconData glifo;
}

/// A SECAO `Rede` INTEIRA: a casca de aba, as duas abas e a acao flutuante.
///
/// ## Por que esta classe existe, e por que ela nao mora em `abas.dart`
///
/// A acao flutuante **troca com a aba**, e quem conhece a aba e esta classe.
/// `TelaDeAba.acaoDeCriar` e um parametro, nao um slot publicavel: quem monta
/// a casca tem de saber qual acao entregar, e por isso o estado da aba sobe
/// para o widget que monta a casca. `AbaRede`, em `abas.dart`, passou a ser
/// uma linha que devolve esta classe -- a casca entrega o corpo da secao, e as
/// abas sao conteudo dele.
///
/// ## AS CINCO ABAS ANTIGAS EM DUAS, MAIS FILTRO
///
/// Eram cinco, em duas secoes:
///
/// ```
/// Rede   ->  Próximos | Meus pedidos | Encerrados   (agenda_da_rede.dart)
/// Perto  ->  Profissionais | Minhas indicações      (corpo_do_perto.dart)
/// ```
///
/// O destino de cada uma, e nenhuma foi apagada:
///
/// | Hoje | Vai para | Por que |
/// |---|---|---|
/// | `Próximos` | **filtro** `Quando -> Próximos` (padrao) | mesma entidade, mesma rota, janela de tempo diferente |
/// | `Encerrados` | **filtro** `Quando -> Encerrados` | idem |
/// | `Meus pedidos` | **filtro** `Meu envolvimento -> Só onde eu pedi` | mesma entidade; o cartao ja pinta o estado do pedido |
/// | `Profissionais` | **aba `Comunidade`** | e o conteudo da aba |
/// | `Minhas indicações` | **porta propria** (`Rotas.minhasIndicacoes`), e desde 26/10/2026 ela mora no MENU DO PERFIL (`abas.dart`, `AbaPerfil`, grupo `Comunidade`) e nao mais no pe desta aba | a entidade MUDA: indicacao em analise nao e local da lista, e filtrar devolveria zero no unico caso que importa |
///
/// A conta de por que as tres primeiras cabem no filtro e a quarta nao esta
/// em `agenda_da_rede.dart` (os grupos) e em `Rotas.minhasIndicacoes` (a
/// porta).
///
/// ## A `TabBar` E ROLAVEL, e a decisao e minha e esta medida
///
/// Medido com a `Inter` real, em 320 dp, numa `TabBar` NAO rolavel de dois
/// itens (slot de 144,00 dp cada):
///
///   `Eventos`     69,81 dp
///   `Comunidade` 110,62 dp
///
/// As duas cabem lado a lado **ate 130%** de escala de texto. A **200%**,
/// `Comunidade` pede 221,24 dp e corta por **77,24 dp**. Abreviar nao resolve:
/// o nome e o que o cliente escolheu, e `Comun...` nao diz a secao.
///
/// **`isScrollable: true` e o que resolve sem abreviar**: cada aba recebe a
/// largura do proprio texto e a barra rola, em vez de as duas dividirem a tela
/// em partes iguais. O custo e que as abas deixam de ocupar a largura toda.
///
/// **O contexto que torna isto uma MELHORA e nao uma troca:** as TRES abas de
/// hoje (`Próximos`, `Meus pedidos`, `Encerrados`) ja cortam **duas** em
/// 320 dp a **100%** de escala, numa `TabBar` nao rolavel. A composicao nova
/// e melhor do que a que esta no ar em QUALQUER escala. O portao
/// `a TabBar da Rede e rolavel e nenhuma das duas abas corta` mede as duas
/// coisas: que ela e rolavel, e que nenhum dos dois rotulos sai com
/// reticencia a 200%.
///
/// ## AS DUAS ABAS EXISTEM SEM CONTA, e isso e diferente das abas antigas
///
/// `Meus pedidos` e `Minhas indicações` sumiam sem sessao, porque sao listas
/// do que a pessoa fez. **As duas abas de agora nao sao disso:** `Eventos` e
/// a agenda publica (`listNetworkEvents` declara a rota alcancavel sem conta)
/// e `Comunidade` e o diretorio, que desenha o proprio `ConviteParaEntrar`
/// quando nao ha sessao. Nenhuma das duas e "minha", e por isso nenhuma
/// aparece e desaparece com a sessao -- e por isso o `TabController` desta
/// classe tem comprimento FIXO 2, e nao precisa ser refeito quando a sessao
/// muda, que e o que `agenda_da_rede.dart` e `corpo_do_perto.dart` tinham de
/// fazer.
class SecaoDaRede extends StatefulWidget {
  const SecaoDaRede({super.key, this.abaInicial});

  /// A aba em que a secao abre, quando o endereco pede uma.
  ///
  /// Nulo e o normal, e abre em `Eventos`. Quem manda valor e o estado vazio do
  /// Mural, por `Rotas.redeNaBuscaDePessoas` -- ver a conta dos 40% de rotulo
  /// visivel em [AbaDaSecaoRede.usuarios].
  final AbaDaSecaoRede? abaInicial;

  /// O rotulo da porta de `Minhas indicações`, no pe da aba `Comunidade`.
  ///
  // `rotuloDasMinhasIndicacoes` SAIU EM 26/10/2026, com a porta. A palavra
  // continua UMA SO, e agora a fonte unica dela e `TelaDeMinhasIndicacoes.titulo`
  // -- que e a tela que a porta abre. Deixar a constante aqui, orfa, faria a
  // proxima edicao desta secao reabrir a porta sem perceber.

  @override
  State<SecaoDaRede> createState() => _SecaoDaRedeState();
}

class _SecaoDaRedeState extends State<SecaoDaRede>
    with SingleTickerProviderStateMixin {
  late AbaDaSecaoRede _aba = widget.abaInicial ?? AbaDaSecaoRede.eventos;

  /// Comprimento FIXO 3: as tres abas existem em todo estado de sessao. Ver a
  /// prosa de [SecaoDaRede] -- e por isso que nao ha aqui o
  /// `_controladorDasAbas` que a agenda e o corpo do `Perto` precisavam.
  ///
  /// **`Usuarios` tambem nao vai e vem com a sessao**, e a razao e diferente
  /// das outras duas: a rota dela **exige** conta, mas a aba desenha
  /// `ConviteParaEntrar` no proprio corpo quando nao ha sessao. Esconder a aba
  /// faria a secao ter duas abas para quem nao entrou e tres para quem entrou,
  /// e o `TabController` voltaria a precisar de refazimento a cada troca de
  /// sessao -- que e exatamente o que a unificacao de 19/10 tirou daqui.
  late final TabController _abas = TabController(
    length: 3,
    initialIndex: _aba.index,
    vsync: this,
  );

  @override
  void initState() {
    super.initState();
    // A SUB-ABA EM QUE A SECAO ABRE TAMBEM FOI VISTA (BICHUS-278).
    //
    // Sem esta linha, o selo da `Rede` nunca zeraria a parcela de `Eventos`
    // para quem abre a secao e nao troca de aba -- que e o caminho normal, ja
    // que `Eventos` e a aba inicial. O marcador por sub-aba so funciona se a
    // sub-aba INICIAL contar como vista.
    //
    // `addPostFrameCallback` porque `Escopo.of` depende do `InheritedWidget`
    // acima, e `initState` corre antes de `didChangeDependencies`.
    WidgetsBinding.instance.addPostFrameCallback((_) {
      if (mounted) _marcarVista(_aba);
    });
  }

  /// O endereco pediu outra aba **com a secao ja montada**.
  ///
  /// Acontece quando alguem toca em `Buscar pessoas` no Mural vazio: o ramo da
  /// `Rede` ja esta na arvore, e o `go` troca o endereco sem remontar o estado.
  /// Sem isto a secao abriria em `Eventos` e o botao do Mural levaria a pessoa
  /// para a aba errada -- que e o defeito que o botao existe para consertar.
  ///
  /// **Nulo nao volta para `Eventos`.** Quem sai da `Rede` e volta pela barra
  /// de baixo chega sem `?aba=`, e jogar a pessoa de volta na primeira aba
  /// apagaria a navegacao que ela acabou de fazer.
  @override
  void didUpdateWidget(SecaoDaRede anterior) {
    super.didUpdateWidget(anterior);
    final pedida = widget.abaInicial;
    if (pedida == null || pedida == _aba) return;
    _abas.index = pedida.index;
    _trocarAba(pedida);
  }

  /// A BUSCA QUE O CORPO DA ABA PUBLICA NO TOPO FIXO.
  ///
  /// Quem publica e `BuscaNoTopoFixo`, dentro de cada uma das tres abas; quem
  /// desenha e `LinhaDeBuscaFixaDaSecao`, dentro de [_topoFixo]. **Mora aqui, e
  /// nao na casca**, porque o topo fixo e desta secao: `Mural`, `Pets`, `Loja`
  /// e `Perfil` nao tem topo fixo e nao teriam o que publicar.
  final ValueNotifier<BuscaFixaDaSecao?> _buscaDoTopo =
      ValueNotifier<BuscaFixaDaSecao?>(null);

  @override
  void dispose() {
    _abas.dispose();
    _buscaDoTopo.dispose();
    super.dispose();
  }

  void _trocarAba(AbaDaSecaoRede aba) {
    if (aba == _aba) return;
    setState(() => _aba = aba);
    // TROCAR DE SUB-ABA E UMA VISITA NOVA, e e aqui que o marcador separado se
    // paga: `Eventos` e `Comunidade` tem marcadores DIFERENTES
    // (`section_list_views`), entao ver uma derruba so a parcela dela e o selo
    // da aba `Rede` -- que e a SOMA das duas -- desce em dois passos.
    //
    // Um marcador unico para a secao faria entrar em `Eventos` apagar a
    // contagem de `Comunidade`: o app teria afirmado que a pessoa viu um
    // profissional novo que nunca apareceu na tela dela.
    _marcarVista(aba);
  }

  /// Avisa o contador de que esta sub-aba foi vista. **A falha e engolida
  /// dentro de `marcarSecaoVista`**, pelo mesmo motivo da lista de perdidos:
  /// isto nao e dado que a pessoa pediu.
  void _marcarVista(AbaDaSecaoRede aba) {
    // **`Usuarios` NAO TEM CONTADOR, e a ausencia e do contrato.**
    // `SectionCounters` declara tres numeros -- perdidos, eventos e diretorio
    // --, e nenhum deles e "pessoas novas". Inventar um codigo de fio aqui
    // mandaria ao servidor um valor que o contrato nao declara, e o portao de
    // conformidade reprova.
    //
    // **E nao e lacuna a preencher depois**: "quantas pessoas novas entraram no
    // Bichu" e uma contagem da base inteira, que e justamente o que a reversao
    // da busca nao autorizou -- um selo com esse numero seria a listagem de
    // pessoas reduzida a um inteiro.
    final secao = switch (aba) {
      AbaDaSecaoRede.eventos => SecaoComContador.eventosDaRede,
      AbaDaSecaoRede.comunidade => SecaoComContador.comunidadeDaRede,
      AbaDaSecaoRede.usuarios => null,
    };
    if (secao == null) return;
    unawaited(Escopo.of(context).contadores.marcarSecaoVista(secao));
  }

  @override
  Widget build(BuildContext context) {
    final destino = CascaComAbas.porRota(Rotas.rede);
    final sessao = Escopo.of(context).sessao;

    // `AnimatedBuilder` porque a visibilidade da porta de criar depende da
    // SESSAO: sem ele, quem entra ou confirma o e-mail com a `Rede` aberta
    // continuaria sem a acao flutuante ate trocar de aba.
    return SlotDaBuscaFixa(
      busca: _buscaDoTopo,
      child: AnimatedBuilder(
      animation: sessao,
      builder: (context, _) => TelaDeAba(
        raizDeSecao: true,
        titulo: destino.rotulo,
        acaoDeCriar: _acaoDeCriar(context, sessao),
        // **O TOPO QUE NAO ROLA** (cliente, 29/10/2026): as tres abas e a
        // linha de busca. Ver [_topoFixo].
        cabecalhoFixo: _topoFixo(),
        // **O reforco desce para o corpo, e nao sai da tela.** `TelaDeAba` o
        // desenha como PRIMEIRA linha, acima dos filhos, e o cliente pediu em
        // 17/10 que o campo de busca fique acima dele e das abas -- e o campo
        // pertence ao estado da agenda. Entao o texto vai para quem sabe a
        // ordem. Hoje ele e vazio nas cinco secoes de qualquer jeito.
        reforco: null,
        filhos: <Widget>[
          // **UMA ABA MONTADA POR VEZ, e nao um `TabBarView`.** As duas
          // listas publicam no mesmo `SlotDaBarraDeListagem` da casca e
          // desenham o proprio gatilho de filtro; com as duas montadas, as
          // duas publicariam e o recorte mostrado seria o da aba que nao esta
          // na frente. Mesma escolha que a agenda e o corpo do `Perto` ja
          // faziam, pelo mesmo motivo.
          ..._corpoDaAba(sessao.logado),
        ],
      ),
      ),
    );
  }

  /// AS TRES ABAS DA SECAO.
  ///
  /// **ELAS SAIRAM DE `filhos` E FORAM PARA O TOPO FIXO EM 29/10/2026**, por
  /// pedido do cliente. Ate aqui eram o primeiro filho do `ListView` da casca
  /// e rolavam com a lista: numa lista longa elas saiam da tela, e quem
  /// chegasse ao fim de `Comunidade` nao tinha como voltar para `Eventos` sem
  /// rolar tudo de volta.
  ///
  /// **A RAZAO DE ELAS FICAREM FORA DA `BarraDeListagem` NAO MUDOU, e ficou
  /// mais forte:** a barra nao e desenhada em alguns estados (carregando,
  /// vazio sem recorte, falha), e abas dentro dela sumiriam junto. No topo
  /// fixo elas nao dependem de estado nenhum do corpo.
  Widget _abasDaSecao() {
    return TabBar(
        controller: _abas,
        // Ver a conta inteira na prosa de [SecaoDaRede]: `Comunidade`
        // corta por 77,24 dp a 200% numa barra NAO rolavel de dois itens,
        // e rolar e o que a mantem inteira sem abreviar o nome que o
        // cliente escolheu.
        isScrollable: true,
        // **`tabAlignment: TabAlignment.start`**: com `isScrollable` o
        // padrao do M3 e `startOffset`, que abre um vao de 52 dp antes da
        // primeira aba -- e a tela ja tem a margem de 16 dp do corpo. Com
        // os dois, `Eventos` nasceria a 68 dp da borda, desalinhada de
        // tudo o que esta abaixo dela.
        tabAlignment: TabAlignment.start,
        onTap: (i) => _trocarAba(AbaDaSecaoRede.values[i]),
        // **O GLIFO FICA AO LADO DO ROTULO, e a horizontal e o que
        // mantem a ALTURA desta barra.** O cliente pediu o icone em
        // 22/10/2026.
        //
        // **A vertical foi tentada primeiro e MEDIDA a reprovar.** Com
        // `Tab(icon:, text:)` o M3 empilha e pede 72 dp de altura; a 200%
        // de escala de fonte a linha do rotulo cresce e a pilha estoura a
        // propria aba -- `RenderFlex overflowed by 2.0 pixels on the
        // bottom`, em CINCO casos de 200% de quatro arquivos
        // (`casca_de_cinco_secoes`, `gaveta_com_submenus`,
        // `barra_fixa_em_toda_tela`, `widget_test`). Qualquer altura fixa
        // tem a mesma falha mais adiante na escala: o que nao cabe nao e
        // o numero, e a altura fixa.
        //
        // **Deitado, a aba cresce para o LADO -- e e a dimensao que esta
        // barra tem de sobra**, porque ela e `isScrollable`. A altura
        // continua sendo `BichuAlvoDeToque.min`, que e o que os casos de
        // 200% ja mediam e continuam medindo.
        //
        // **O CUSTO E DE LARGURA, e ele esta medido e nao escondido**: ver
        // o caso `o glifo das abas nao empurra `Usuários` para fora da
        // tela` em `test/rede/glifos_das_abas_da_rede_test.dart`, que mede
        // onde a terceira aba comeca a 320 dp antes e depois do glifo.
        tabs: <Widget>[
          for (final a in AbaDaSecaoRede.values)
            Tab(
              height: BichuAlvoDeToque.min,
              child: Row(
                mainAxisSize: MainAxisSize.min,
                children: <Widget>[
                  // 20 dp e nao 24: o glifo aqui acompanha uma linha de
                  // texto e nao e alvo proprio, e cada dp dele e dp que
                  // empurra a terceira aba para fora de uma tela de
                  // 320 dp. O alvo de toque continua sendo a aba inteira.
                  Icon(a.glifo, size: 20),
                  const SizedBox(width: BichuEspaco.e1),
                  Text(a.rotulo),
                ],
              ),
            ),
        ],
    );
  }

  /// O TOPO QUE NAO ROLA: as tres abas e a linha de busca.
  ///
  /// Pedido do cliente, 29/10/2026, literal: *"na pagina de rede vamos manter
  /// as abas eventos, comunidade, usuarios e o campo de busca fixo na pagina e
  /// deixar apenas o conteudo com a rolagem"*.
  ///
  /// **NO CORPO, E NUNCA NA `AppBar`.** O padrao de listagem do projeto manda
  /// busca, filtro e ordenacao no topo do CORPO da tela; "fixo" aqui quer dizer
  /// fora da area de rolagem, e nao promovido a barra do aplicativo. O
  /// `GatilhoDeRecorteNoCorpo` que viaja junto com a linha continua sendo o
  /// alvo de 48 dp do corpo, e nao o de 64 da barra.
  ///
  /// **SO A BUSCA SOBE, e a `CaixaDeLocalizacao` FICA NO CONTEUDO.** Ele pediu
  /// as abas e o campo de busca, e nada alem disso. A caixa e, alem de nao
  /// pedida, a peca que mais varia de altura das tres -- ela desaparece quando
  /// ha cidade em uso --, e um topo fixo que encolhe no meio da leitura e o
  /// defeito que este trabalho existe para tirar.
  ///
  /// **A LINHA DE BUSCA E A DA ABA DA FRENTE**, publicada por `BuscaNoTopoFixo`
  /// de dentro do corpo dela. As tres abas publicam no mesmo slot e so uma
  /// esta montada por vez, entao nao ha disputa -- a mesma razao pela qual
  /// [_corpoDaAba] monta uma aba por vez e nao um `TabBarView`.
  Widget _topoFixo() {
    final cores = BichuColors.of(context).cores;
    return DecoratedBox(
      // **O FIO EMBAIXO E O QUE EXPLICA O CORTE.** Sem ele o primeiro cartao
      // da lista entra por baixo do topo e aparece cortado ao meio, sem nada
      // na tela dizendo por que. Mesmo desenho que `perfil/meus_achados.dart`
      // usou em 28/10 para o botao fixo dele, e pelo mesmo motivo.
      decoration: BoxDecoration(
        color: cores.surface,
        border: Border(
          bottom: BorderSide(color: cores.outline, width: BichuBorda.hairline),
        ),
      ),
      child: Padding(
        // A MARGEM LATERAL DE 16 e a mesma do `ListView` da casca: o topo
        // deixou de ser filho dele e teria perdido o alinhamento com a lista.
        padding: const EdgeInsets.all(BichuEspaco.e4),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.stretch,
          children: <Widget>[
            _abasDaSecao(),
            const SizedBox(height: BichuEspaco.e4),
            LinhaDeBuscaFixaDaSecao(busca: _buscaDoTopo),
          ],
        ),
      ),
    );
  }

  /// A PORTA DE CRIAR DA SECAO REUNIDA: **uma so, e ela TROCA COM A ABA.**
  ///
  /// ## O problema que a unificacao criou, e como ele foi resolvido
  ///
  /// Antes da unificacao havia **duas** acoes flutuantes, uma em cada secao:
  /// `Criar evento` (`Icons.more_time`) na `Rede` e `Indicar`
  /// (`Icons.group_add`) no `Perto`. Com as duas secoes virando uma, as duas
  /// acoes passariam a conviver na MESMA tela -- e **duas nao cabem**: o
  /// `floatingActionButton` do `Scaffold` e um slot unico, e dois alvos de
  /// 56 dp empilhados no canto cobririam 136 dp do pe da lista em vez dos
  /// 72,00 dp que a folga do `padding` paga.
  ///
  /// **A solucao e a que o desenho previu: a acao segue a aba.** Em `Eventos`
  /// ela e `Criar evento`; em `Comunidade` ela e `Indicar`. Uma acao por tela,
  /// e a tela diz qual -- que e exatamente o que um slot unico comporta.
  ///
  /// **E ela e MELHOR do que duas, e nao um remendo:** a acao de criar de uma
  /// aba que nao esta na frente seria uma acao sobre uma lista que a pessoa
  /// nao esta vendo. Quem esta comparando veterinarios nao quer marcar um
  /// evento, e o contrario tambem.
  ///
  /// ## O `heroTag` continua desligado, e continua sendo conserto de defeito
  /// MEDIDO
  ///
  /// `AcaoDeCriarFlutuante` passa `heroTag: null`, e isso **nao deixou de ser
  /// necessario com a unificacao** -- ficou mais necessario. Os ramos
  /// visitados da casca continuam MONTADOS (`IndexedStack` deixa o inativo em
  /// `Offstage`, que nao pinta mas continua na arvore de elementos), e agora
  /// ha acao flutuante em `Rede` **e** em `Pets`: os dois
  /// `FloatingActionButton` coexistem, e com o `heroTag` padrao o Hero reclama
  /// de duas etiquetas iguais na mesma subarvore. `find.byType` nao veria o
  /// irmao -- os finders pulam o que esta `Offstage` por padrao, e o Hero nao
  /// pula.
  ///
  /// ## A REGUA E A MESMA DAS DUAS, e ela nao afrouxou na unificacao
  ///
  /// `podeCriarNaComunidade` -- sessao **e** e-mail confirmado -- governava as
  /// duas acoes antes e governa a unica agora. Sem conta nao ha acao flutuante
  /// nenhuma no corpo da `Rede`: ela **nao nasce desabilitada, nao nasce**.
  Widget? _acaoDeCriar(BuildContext context, ControladorDeSessao sessao) {
    if (!podeCriarNaComunidade(sessao)) return null;
    switch (_aba) {
      case AbaDaSecaoRede.eventos:
        // `Icons.more_time` -- o relogio com o sinal de mais --, escolhido por
        // eliminacao dentro da familia fechada do 10.1 e ja aprovado: o
        // calendario com mais nao existe nesta versao, `edit_calendar` ja
        // significa "adicionar ao meu calendario" dentro desta propria secao,
        // `event_available` leria "vou participar" e `event` sozinho e o glifo
        // decorativo de "quando" em quatro telas.
        return AcaoDeCriarFlutuante(
          icone: Icons.more_time,
          rotulo: AgendaDaRede.rotuloDeMarcar,
          aoTocar: () => context.push(Rotas.criarEncontroDaRede),
        );
      case AbaDaSecaoRede.comunidade:
        // `Icons.group_add` -- as pessoas juntas com o sinal --, escolhido por
        // ELE: *"o icone de recomendar um profissional, pode ser igual do
        // instagram, as 3 pessoas juntos, para adicionar uma nova
        // recomendacao"*. O sinal nao e enfeite: pessoas juntas SEM ele leria
        // "ver a lista de profissionais", que e o que esta aba ja mostra.
        //
        // **A vizinhanca a vigiar ficou MAIS estreita com a unificacao, e esta
        // escrita aqui para nao ser descoberta no aparelho:** a secao desenha
        // `groups` na barra de BAIXO e este `group_add` no canto do corpo, e
        // os dois saem do mesmo campo de "pessoas juntas" -- agora na MESMA
        // secao, e nao em duas. Eles continuam em superficies diferentes (slot
        // de 24 dp na barra contra alvo de 56 dp flutuante) e com sentidos que
        // o sinal de mais separa. Se ele ler as duas como a mesma coisa no
        // aparelho, quem muda e esta linha -- nao o glifo da barra, que e o da
        // secao inteira.
        return AcaoDeCriarFlutuante(
          icone: Icons.group_add,
          // A MESMA palavra da tela, de uma fonte so: "Indicar", nunca
          // "Cadastrar". A emenda 1 do ADR-0011 diz que a comunidade convida e
          // avalia, nunca cria, e `Cadastrar` prometeria publicacao -- nada e
          // publicado por esta porta.
          rotulo: ListaDoDiretorio.rotuloDeIndicar,
          aoTocar: () => context.push(Rotas.sugerirProfissional),
        );
      case AbaDaSecaoRede.usuarios:
        // **NAO HA ACAO FLUTUANTE EM `Usuarios`, e a ausencia e desenho.**
        //
        // A acao desta aba e o proprio campo de busca, que fica no topo do
        // corpo e ocupa a largura toda. Um alvo de 56 dp no canto teria de
        // levar a alguma coisa, e as duas candidatas nao servem: "buscar" ja
        // esta na tela e seria a mesma porta em dois lugares, e "convidar
        // alguem" mora no AuAu, numa tela empilhada -- acao flutuante que
        // saltasse para outra secao e o que a regra 4 do portao da gaveta
        // proibe.
        //
        // E o slot vazio nao custa nada: `TelaDeAba.acaoDeCriar` e anulavel, e
        // `Pets` ja passou por aqui quando o leitor de QR saiu da barra dela.
        return null;
    }
  }

  List<Widget> _corpoDaAba(bool logado) {
    switch (_aba) {
      case AbaDaSecaoRede.eventos:
        // O reforco da secao vai vazio: as cinco secoes mandam
        // `reforcoDaPagina: ''` desde 18/10, e a agenda ja pula a linha e o
        // respiro quando ele e vazio.
        return <Widget>[AgendaDaRede(reforcoDaSecao: '')];
      case AbaDaSecaoRede.comunidade:
        return <Widget>[
          const ListaDoDiretorio(),
          // **A PORTA DE `Minhas indicações` SAIU DAQUI EM 26/10/2026.**
          //
          // Cliente, 22/10/2026: *"Remova o link minhas indicacoes da pagina
          // de comunidade"* -- e ele a quer no menu do Perfil. As DUAS metades
          // sao o pedido: tirar daqui sem por la deixaria a tela de
          // `Minhas indicações` sem porta humana nenhuma, que e exatamente
          // como `Pedidos de conexao` passou de 18/10 a 19/10 sem ele ver.
          //
          // **A PORTA AGORA E `telas/abas.dart`, `AbaPerfil`, grupo
          // `Comunidade`** -- o mesmo caminho que `Convide tutores` acabou de
          // fazer em 26/10, pela mesma razao: a gaveta esta OCULTA desde
          // 19/10, e por-la so la seria nao por em lugar nenhum.
          //
          // **O `if (logado)` nao precisou viajar com ela, e isso e medido e
          // nao suposto**: o menu do Perfil so existe logado
          // (`AbaPerfil.build` troca o corpo inteiro quando
          // `sessao.estado != EstadoDaSessao.logado`), entao a regua de sessao
          // que esta aba precisava declarar a mao ficou ESTRUTURAL la. Quem
          // mover a porta de volta para ca tem de trazer o `if (logado)` de
          // volta com ela.
        ];
      case AbaDaSecaoRede.usuarios:
        // **A ABA DESENHA O MESMO CORPO LOGADO E DESLOGADO**, e quem trata a
        // ausencia de sessao e a propria `BuscaDePessoas`: a rota responde 401,
        // a falha chega com `next_action: sign_in`, e o corpo troca para
        // `ConviteParaEntrar`. Ramificar por `logado` aqui criaria a segunda
        // regra de "quem pode buscar", e a segunda divergiria da resposta do
        // servidor no dia em que a sessao expirasse com a aba aberta.
        final escopo = Escopo.of(context);
        return <Widget>[
          BuscaDePessoas(
            // `PessoasApi` nao mora no `Escopo` -- ela e construida de
            // `escopo.api`, como `rotas.dart` ja faz para o perfil de pessoa.
            pessoas: PessoasApi(escopo.api),
            conexoes: escopo.conexoes,
            // **`logado` NAO ramifica o corpo**, e o paragrafo acima continua
            // valendo: ele entra como dado porque a aba guarda estado de busca
            // que a troca de sessao invalida -- o `_termoAplicado` do 401 que
            // deixava a lupa morta depois de entrar. Ver `BuscaDePessoas.logado`.
            // O `AnimatedBuilder` desta tela, que ja escuta a sessao, e o que
            // faz o valor novo chegar.
            logado: logado,
          ),
        ];
    }
  }
}
