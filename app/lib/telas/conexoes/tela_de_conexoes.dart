/// A ENTRADA UNICA DE CONEXOES: `Conexões` · `Pendentes` · `Bloqueados`.
///
/// Decisao do cliente de 28/10/2026, literal: *"devemos centralizar tudo em um
/// unico local"*. Desenhada e aprovada em
/// `design/prototipos/menu-unificado/`.
///
/// ## Tres telas que existiam, debaixo de um titulo so
///
/// Nada aqui e lista nova. As tres abas montam os corpos que ja existiam, cada
/// um com o seu estado e as suas chamadas:
///
/// | aba | corpo | o que ela responde |
/// |---|---|---|
/// | `Conexões` | [TelaDeMinhasConexoes] | quem ja e conexao |
/// | `Pendentes` | [TelaDePedidosDeConexao] | quem espera decisao |
/// | `Bloqueados` | [TelaDeBloqueados] | quem eu recusei |
///
/// **O titulo e `Conexões`**, que e o rotulo do menu: quem procura a funcao
/// pelo nome do menu precisa ver o mesmo nome na barra da tela que abriu. E ele
/// nao foi inventado -- `TelaDeMinhasConexoes.titulo` ja era `'Conexões'` desde
/// 22/10/2026.
///
/// ## Abre na aba 1, e nao em `Pendentes`
///
/// A aba 1 e o que a pessoa vem ver no caso comum; `Pendentes` esta quase
/// sempre vazia. O NUMERO na aba 2 e o que a traz quando ha o que decidir --
/// e nao o contrario, uma aba de pendentes vazia recebendo quem veio ver as
/// conexoes.
///
/// ## O CONTADOR, e por que ele mora AQUI
///
/// A escolha do cliente para o pedido pendente foi literal: *"aba interna de
/// pendentes **+** notificacao"* -- as duas coisas. Em 28/10 ele acrescentou a
/// terceira: a LINHA do menu tambem (ver `widgets/item_de_menu.dart`). O numero
/// e o mesmo nos tres lugares e sai de **`requests_received_count`**, que ja
/// existe no contrato: e mudanca de lugar, nao construcao.
///
/// **So o recebido conta.** `pending_sent_count` fica fora: pedido que eu
/// mandei nao espera nada de mim, e um numero que soma os dois manda a pessoa
/// decidir algo que nao e dela.
///
/// **Zero nao vira pastilha com `0`** -- a pastilha some. Pastilha com zero e
/// um aviso que afirma que nao ha aviso.
///
/// O resumo e lido PELA CASCA e nao pela aba: a aba 2 pode nunca ser aberta, e
/// o numero dela tem de existir antes do primeiro toque. Ele e relido quando a
/// aba 2 avisa que agiu ([TelaDePedidosDeConexao.aoMudarOsPedidos]): aceitar ou
/// recusar muda a contagem no servidor, e uma pastilha que ficasse no numero
/// velho afirmaria pedidos que a propria pessoa acabou de resolver.
///
/// ## UMA `TabBar` SO, e os chips de `Recebidos`/`Enviados`
///
/// `Pedidos de conexão` tinha duas abas internas, por pedido do cliente de
/// 26/10 (*"divida recebidos e enviados por abas, igual na pagina de rede"*).
/// Com `Pendentes` virando aba, as duas **nao cabem** como `TabBar`: aba dentro
/// de aba e o controle que ninguem sabe qual dos dois esta mexendo. Elas
/// viraram **chips no topo do corpo**, que e onde o padrao de listagem deste
/// projeto manda por controle -- no corpo, nunca na barra. O segmento FICA
/// mesmo com `Recebidos` vazio: esconde-lo faria o controle aparecer e sumir
/// sob a mao da pessoa, e ela nao teria como descobrir que ha pedidos
/// **enviados** esperando resposta do outro lado.
///
/// ## TRES FORMAS DE CARTAO, E ELAS NAO FORAM IGUALADAS
///
/// | aba | foto | controles |
/// |---|---|---|
/// | `Conexões` | **sim**, 56 dp | nenhum |
/// | `Pendentes` | **nao** | `Aceitar` / `Recusar` |
/// | `Bloqueados` | **nao** | `Desbloquear` |
///
/// A ausencia de foto nao e descuido: a **emenda 3 do ADR-0010** libera a foto
/// de perfil **entre conexoes aceitas**, e pedido pendente e exatamente o
/// estado em que ninguem aceitou; `PessoaBloqueada` **nao traz foto no
/// contrato**. Debaixo de um titulo so, a aba 1 com foto e as outras duas sem
/// leem como inconsistencia -- e isso **nao foi resolvido aqui de proposito**:
/// resolver mexeria no ADR-0010, que e decisao e nao desenho.
///
/// ## O CAMINHO DO DESBLOQUEIO, que e o risco medido desta frente
///
/// O bloqueio e **simetrico no servidor**: quem bloqueia alguem passa a receber
/// `404` no perfil dessa pessoa, e o `Desbloquear` morava dentro do menu
/// daquele perfil -- que nunca mais abre. **A aba 3 e o unico lugar de onde o
/// desbloqueio sai no aplicativo inteiro.** A decisao do cliente tira a palavra
/// `bloqueados` do menu e a poe debaixo de `Conexões`, que e o oposto do que a
/// pessoa veio desfazer, e o custo esta desenhado no protovipo e nao escondido.
///
/// **Tres coisas seguram o caminho, e nenhuma delas e opiniao:**
///
///   1. `Rotas.pessoasBloqueadas` **continua de pe e abre JA na aba 3**
///      ([abaInicial]). O endereco que a gaveta usa, e qualquer link antigo,
///      pousa no destino -- e nao na aba 1 pedindo um segundo toque. Custa um
///      toque, igual a hoje.
///   2. a aba se chama `Bloqueados`, que e a palavra que a pessoa procura;
///   3. dentro dela o `Desbloquear` esta em cada linha, com a frase que diz o
///      que o desbloqueio **nao** faz.
///
/// O que a decisao custa de verdade esta medido e reportado: quem procurava a
/// funcao **lendo o menu** deixa de achar a palavra la.
library;

import 'dart:async';

import 'package:flutter/material.dart';

import '../../api/conexoes_api.dart';
import '../../api/falhas.dart';
import '../../api/seguranca_api.dart';
import '../../theme/bichu_colors.dart';
import '../../theme/bichu_tokens.g.dart';
import '../seguranca/tela_de_bloqueados.dart';
import 'tela_minhas_conexoes.dart';
import 'tela_pedidos_de_conexao.dart';

/// As tres abas, na ordem em que o cliente as pediu.
///
/// `enum` e nao indice cru: a `length` do controlador sai de
/// `AbaDeConexoes.values`, e uma aba nova no futuro nao pode existir no enum e
/// faltar na barra -- que e o defeito que um `3` escrito a mao deixaria passar.
enum AbaDeConexoes {
  conexoes('Conexões'),
  pendentes('Pendentes'),
  bloqueados('Bloqueados');

  const AbaDeConexoes(this.rotulo);

  /// O que a aba diz. **`Bloqueados` e nao `Usuários bloqueados`**: a barra de
  /// abas tem tres rotulos lado a lado numa tela de 320 dp, e a palavra que a
  /// pessoa procura e `bloqueados`.
  final String rotulo;
}

class TelaDeConexoes extends StatefulWidget {
  const TelaDeConexoes({
    required this.conexoes,
    required this.seguranca,
    super.key,
    this.abaInicial = AbaDeConexoes.conexoes,
  });

  final ConexoesApi conexoes;
  final SegurancaApi seguranca;

  /// Em qual aba a tela POUSA.
  ///
  /// O padrao e [AbaDeConexoes.conexoes]. As outras duas existem porque as
  /// rotas antigas continuam de pe e tem de pousar no destino que elas
  /// prometem: `Rotas.pedidosDeConexao` (que e tambem onde o toque na
  /// notificacao `connection_requested` cai) e `Rotas.pessoasBloqueadas`.
  final AbaDeConexoes abaInicial;

  @override
  State<TelaDeConexoes> createState() => _EstadoDeConexoes();
}

class _EstadoDeConexoes extends State<TelaDeConexoes>
    with SingleTickerProviderStateMixin {
  late final TabController _abas = TabController(
    length: AbaDeConexoes.values.length,
    initialIndex: widget.abaInicial.index,
    vsync: this,
  );

  /// Quantos pedidos RECEBIDOS esperam decisao, ou nulo quando ninguem contou.
  ///
  /// Nulo e zero sao coisas diferentes e as duas desenham o mesmo nada: nao ha
  /// o que distinguir na tela entre "o servidor disse nenhum" e "nao consegui
  /// perguntar". O que nao pode acontecer e a pastilha afirmar um numero que o
  /// servidor nao deu.
  int? _recebidos;

  @override
  void initState() {
    super.initState();
    unawaited(_lerOResumo());
  }

  @override
  void dispose() {
    _abas.dispose();
    super.dispose();
  }

  /// **A falha deixa a pastilha de fora e NAO desenha faixa de erro.**
  ///
  /// O contador e aviso, nao e o que a pessoa veio fazer: ela veio ver as
  /// conexoes. Uma faixa vermelha no topo das tres abas culparia a tela inteira
  /// por uma leitura auxiliar, e cada corpo ja tem a propria faixa para a
  /// propria falha.
  Future<void> _lerOResumo() async {
    try {
      final resumo = await widget.conexoes.resumo();
      if (!mounted) return;
      setState(() => _recebidos = resumo.requestsReceivedCount);
    } on FalhaDeChamada {
      if (!mounted) return;
      setState(() => _recebidos = null);
    }
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(
        title: const Text(TelaDeMinhasConexoes.titulo),
        // A BARRA DE ABAS FICA NA BARRA DE TOPO, e isto NAO contraria o padrao
        // de listagem desta casa.
        //
        // O padrao manda busca, filtro e ordenacao no topo do CORPO -- eles
        // sao controles sobre a lista que esta ali. Aba e NAVEGACAO entre tres
        // listas diferentes, e e o mesmo lugar que `rede/secao_da_rede.dart`
        // usa. Os chips `Recebidos`/`Enviados`, que SAO filtro de uma lista
        // so, continuam no corpo.
        bottom: TabBar(
          controller: _abas,
          tabs: <Widget>[
            for (final aba in AbaDeConexoes.values)
              Tab(
                // `height` amarrado ao token, como em `secao_da_rede.dart`: o
                // alvo passa a vir de `design/tokens.json` e nao de
                // `kTextTabBarHeight`, que e constante do SDK e pode mudar numa
                // atualizacao sem ninguem reparar.
                height: BichuAlvoDeToque.min,
                child: aba == AbaDeConexoes.pendentes
                    ? _RotuloComContador(
                        rotulo: aba.rotulo,
                        contador: _recebidos,
                      )
                    : Text(aba.rotulo),
              ),
          ],
        ),
      ),
      body: SafeArea(
        top: false,
        child: TabBarView(
          controller: _abas,
          children: <Widget>[
            TelaDeMinhasConexoes(conexoes: widget.conexoes),
            TelaDePedidosDeConexao(
              conexoes: widget.conexoes,
              // Aceitar ou recusar muda a contagem NO SERVIDOR. Sem este
              // aviso a pastilha ficaria no numero velho, afirmando pedidos
              // que a propria pessoa acabou de resolver.
              aoMudarOsPedidos: () => unawaited(_lerOResumo()),
            ),
            TelaDeBloqueados(seguranca: widget.seguranca),
          ],
        ),
      ),
    );
  }
}

/// O rotulo de uma aba com a pastilha do numero ao lado.
///
/// **Zero e nulo nao pintam nada** -- ver [_EstadoDeConexoes._recebidos].
///
/// `primary` / `onPrimary`, e o par JA esta medido:
/// `claro/on-primary-sobre-primary` e `escuro/on-primary-sobre-primary` em
/// `design/contrast-pairs.json`, piso 7,0, razoes 7,84 e 8,59.
class _RotuloComContador extends StatelessWidget {
  const _RotuloComContador({required this.rotulo, required this.contador});

  final String rotulo;
  final int? contador;

  @override
  Widget build(BuildContext context) {
    final quantos = contador;
    if (quantos == null || quantos <= 0) return Text(rotulo);

    final cores = BichuColors.of(context).cores;
    final textos = Theme.of(context).textTheme;

    return Row(
      mainAxisSize: MainAxisSize.min,
      children: <Widget>[
        Text(rotulo),
        const SizedBox(width: BichuEspaco.e2),
        // A `TabBar` do M3 ja anuncia `aba 2 de 3` e o estado de selecionada.
        // O numero entra como `Semantics` proprio com a FRASE, e nao como o
        // digito solto: `3` anunciado sozinho ao lado de `Pendentes` nao diz
        // de que ele e.
        Semantics(
          label: TelaDePedidosDeConexao.quantosEsperam(quantos),
          excludeSemantics: true,
          child: Container(
            constraints: const BoxConstraints(minWidth: 20),
            height: 20,
            alignment: Alignment.center,
            padding: const EdgeInsets.symmetric(horizontal: BichuEspaco.e1),
            decoration: BoxDecoration(
              color: cores.primary,
              borderRadius: BorderRadius.circular(BichuRaio.full),
            ),
            child: Text(
              '$quantos',
              style: textos.labelSmall?.copyWith(color: cores.onPrimary),
            ),
          ),
        ),
      ],
    );
  }
}
