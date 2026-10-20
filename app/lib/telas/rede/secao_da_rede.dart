import 'dart:async';

import 'package:flutter/material.dart';
import 'package:go_router/go_router.dart';

import '../../api/contadores_api.dart';
import '../../escopo.dart';
import '../../roteamento/rotas.dart';
import '../../sessao/controlador_de_sessao.dart';
import '../../theme/bichu_tokens.g.dart';
import '../../widgets/acao_de_criar_flutuante.dart';
import '../../widgets/item_de_menu.dart';
import '../abas.dart';
import '../casca_com_abas.dart';
import '../perto/lista_do_diretorio.dart';
import 'agenda_da_rede.dart';

/// As DUAS abas da secao `Rede` reunida (decisao do cliente, 19/10/2026).
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
enum AbaDaSecaoRede {
  eventos('Eventos'),
  comunidade('Comunidade');

  const AbaDaSecaoRede(this.rotulo);

  final String rotulo;
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
/// | `Minhas indicações` | **porta propria** (`Rotas.minhasIndicacoes`) | a entidade MUDA: indicacao em analise nao e local da lista, e filtrar devolveria zero no unico caso que importa |
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
  const SecaoDaRede({super.key});

  /// O rotulo da porta de `Minhas indicações`, no pe da aba `Comunidade`.
  ///
  /// **A MESMA palavra da aba que ela substituiu.** Quem procurava a aba acha
  /// a porta pelo texto; trocar a redacao aqui faria a funcao parecer removida
  /// em vez de mudada de lugar.
  static const String rotuloDasMinhasIndicacoes = 'Minhas indicações';

  @override
  State<SecaoDaRede> createState() => _SecaoDaRedeState();
}

class _SecaoDaRedeState extends State<SecaoDaRede>
    with SingleTickerProviderStateMixin {
  AbaDaSecaoRede _aba = AbaDaSecaoRede.eventos;

  /// Comprimento FIXO 2: as duas abas existem em todo estado de sessao. Ver a
  /// prosa de [SecaoDaRede] -- e por isso que nao ha aqui o
  /// `_controladorDasAbas` que a agenda e o corpo do `Perto` precisavam.
  late final TabController _abas = TabController(length: 2, vsync: this);

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

  @override
  void dispose() {
    _abas.dispose();
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
    final secao = switch (aba) {
      AbaDaSecaoRede.eventos => SecaoComContador.eventosDaRede,
      AbaDaSecaoRede.comunidade => SecaoComContador.comunidadeDaRede,
    };
    unawaited(Escopo.of(context).contadores.marcarSecaoVista(secao));
  }

  @override
  Widget build(BuildContext context) {
    final destino = CascaComAbas.porRota(Rotas.rede);
    final sessao = Escopo.of(context).sessao;

    // `AnimatedBuilder` porque a visibilidade da porta de criar depende da
    // SESSAO: sem ele, quem entra ou confirma o e-mail com a `Rede` aberta
    // continuaria sem a acao flutuante ate trocar de aba.
    return AnimatedBuilder(
      animation: sessao,
      builder: (context, _) => TelaDeAba(
        raizDeSecao: true,
        titulo: destino.rotulo,
        acaoDeCriar: _acaoDeCriar(context, sessao),
        // **O reforco desce para o corpo, e nao sai da tela.** `TelaDeAba` o
        // desenha como PRIMEIRA linha, acima dos filhos, e o cliente pediu em
        // 17/10 que o campo de busca fique acima dele e das abas -- e o campo
        // pertence ao estado da agenda. Entao o texto vai para quem sabe a
        // ordem. Hoje ele e vazio nas cinco secoes de qualquer jeito.
        reforco: null,
        filhos: <Widget>[
          // **AS ABAS FICAM ACIMA DO CORPO E FORA DA BARRA DE LISTAGEM**, e
          // isso e herdado da agenda por um motivo medido: a barra de listagem
          // nao e desenhada em alguns estados (carregando, vazio sem recorte,
          // falha), e abas dentro dela sumiriam junto -- quem filtrasse ate o
          // vazio em `Comunidade` ficaria sem como voltar para `Eventos`.
          TabBar(
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
            tabs: <Widget>[
              for (final a in AbaDaSecaoRede.values)
                Tab(height: BichuAlvoDeToque.min, text: a.rotulo),
            ],
          ),
          const SizedBox(height: BichuEspaco.e4),
          // **UMA ABA MONTADA POR VEZ, e nao um `TabBarView`.** As duas
          // listas publicam no mesmo `SlotDaBarraDeListagem` da casca e
          // desenham o proprio gatilho de filtro; com as duas montadas, as
          // duas publicariam e o recorte mostrado seria o da aba que nao esta
          // na frente. Mesma escolha que a agenda e o corpo do `Perto` ja
          // faziam, pelo mesmo motivo.
          ..._corpoDaAba(sessao.logado),
        ],
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
          // **A PORTA DE `Minhas indicações`, NO PE DA ABA.**
          //
          // Ela e o que sobrou da aba que nao caber no filtro: ver a conta
          // inteira em `Rotas.minhasIndicacoes`. Porta, e nao filtro, porque
          // uma indicacao em analise nao e um local da lista.
          //
          // **No PE e nao no topo**, e pela mesma razao que a porta de
          // `Adoções` tinha: o conteudo da aba e a lista de locais, e uma
          // porta para a minha lista pessoal acima dela inverteria a ordem de
          // leitura -- quem abre `Comunidade` vem ver quem atende bem, nao o
          // historico do que indicou.
          //
          // **DENTRO da aba e nao da secao**: pendurada fora das abas, ela
          // apareceria embaixo de `Eventos` tambem, oferecendo o historico de
          // indicacoes a quem foi ver a agenda.
          //
          // **SEM SESSAO ELA NAO NASCE, e nao fica desabilitada.** Sem conta
          // nao existe "minhas indicacoes": nao ha o que listar e a rota
          // responderia `401`. Uma porta que convidasse a entrar seria um
          // controle cujo desfecho e uma recusa -- o mesmo criterio 2 que a
          // aba antiga ja obedecia.
          //
          // **A REGUA E SESSAO, e nao `podeCriarNaComunidade`**, e a diferenca
          // e medida: indicar e ESCREVER sobre um terceiro e o servidor exige
          // canal verificado (`409 contact-channel-unverified`); ver as minhas
          // e LER o que eu ja fiz, e quem indicou enquanto estava validado e
          // depois trocou de e-mail continua tendo indicacoes na fila.
          // Esconder a porta dela esconderia o trabalho dela mesma.
          if (logado) ...<Widget>[
            const SizedBox(height: BichuEspaco.e6),
            ItemDeMenu(
              rotulo: SecaoDaRede.rotuloDasMinhasIndicacoes,
              aoTocar: () => context.push(Rotas.minhasIndicacoes),
            ),
          ],
        ];
    }
  }
}
