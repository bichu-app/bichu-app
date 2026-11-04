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
import 'lista_da_regiao.dart';

/// As TRES abas da secao `Rede` reunida (cliente, 19/10 e 21/10/2026).
enum AbaDaSecaoRede {
  eventos('Eventos', Icons.event_outlined),
  comunidade('Comunidade', Icons.place_outlined),

  /// A ABA QUE ENTROU EM 21/10/2026, e o pedido dele e literal: *"na aba rede,
  /// temos que ter uma aba de usuarios, e o campo buscar para encontrar e
  /// adicionar as pessoas"*.
  usuarios('Usuários', Icons.person_search_outlined);

  const AbaDaSecaoRede(this.rotulo, this.glifo);

  final String rotulo;

  /// O glifo da aba. Ver a prosa acima do enum: a escolha e minha.
  final IconData glifo;
}

/// A SECAO `Rede` INTEIRA: a casca de aba, as duas abas e a acao flutuante.
class SecaoDaRede extends StatefulWidget {
  const SecaoDaRede({super.key, this.abaInicial});

  /// A aba em que a secao abre, quando o endereco pede uma.
  final AbaDaSecaoRede? abaInicial;

  @override
  State<SecaoDaRede> createState() => _SecaoDaRedeState();
}

class _SecaoDaRedeState extends State<SecaoDaRede>
    with SingleTickerProviderStateMixin {
  late AbaDaSecaoRede _aba = widget.abaInicial ?? AbaDaSecaoRede.eventos;

  late final TabController _abas = TabController(
    length: 3,
    initialIndex: _aba.index,
    vsync: this,
  );

  @override
  void initState() {
    super.initState();
    WidgetsBinding.instance.addPostFrameCallback((_) {
      if (!mounted) return;
      _marcarVista(_aba);
      _apagarOPedidoDoEndereco();
    });
  }

  /// O endereco pediu outra aba **com a secao ja montada**.
  @override
  void didUpdateWidget(SecaoDaRede anterior) {
    super.didUpdateWidget(anterior);
    final pedida = widget.abaInicial;
    if (pedida == null) return;
    if (pedida != _aba) {
      _abas.index = pedida.index;
      _trocarAba(pedida);
    }
    WidgetsBinding.instance.addPostFrameCallback((_) {
      if (mounted) _apagarOPedidoDoEndereco();
    });
  }

  /// Tira o `?aba=` do endereco **depois de ele ter sido atendido**.
  ///
  /// ## O DEFEITO QUE ISTO CONSERTA (cliente, 03/11/2026)
  ///
  /// Ele relatou duas telas com o mesmo sintoma: *"o botao filtrar encerrado
  /// na pagina de eventos esta levando o usuario para a pagina de usuarios
  /// quando o filtro e aplicado e acaba nao listando nada por isso"*, e
  /// depois *"nos filtros dos profissionais recomendados acontece o mesmo
  /// problema"*.
  ///
  /// A aba tinha DUAS fontes da verdade: o estado [_aba], que o dedo move na
  /// `TabBar`, e o `?aba=` do endereco, que [AbaRede.abaPedidaPor] lia a CADA
  /// construcao. Trocar de aba com o dedo nao reescreve o endereco, entao um
  /// `?aba=usuarios` ficava PENDURADO -- e `didUpdateWidget` o reimpunha na
  /// reconstrucao seguinte, por cima da escolha da pessoa.
  ///
  /// **Por que `Usuarios` e nao outra aba:** `?aba=usuarios` e o unico valor
  /// que alguem escreve no endereco ([Rotas.redeNaBuscaDePessoas], usada por
  /// `tela_do_mural.dart` e por `tela_minhas_conexoes.dart`). Quem chegou a
  /// `Rede` por uma dessas portas carregava o pedido consigo pelo resto da
  /// visita.
  ///
  /// **O `?aba=` e um PEDIDO DE NAVEGACAO, e nao o estado da aba.** Atendido,
  /// ele sai do endereco -- e sair e o que faz a porta do Mural continuar
  /// funcionando quando tocada de novo: o endereco volta a MUDAR, e a secao
  /// volta a atender.
  void _apagarOPedidoDoEndereco() {
    final pedido = GoRouterState.of(
      context,
    ).uri.queryParameters[Rotas.parametroDaAbaDaRede];
    if (pedido == null) return;
    context.go(Rotas.rede);
  }

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
    _marcarVista(aba);
  }

  void _marcarVista(AbaDaSecaoRede aba) {
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

    return SlotDaBuscaFixa(
      busca: _buscaDoTopo,
      child: AnimatedBuilder(
      animation: sessao,
      builder: (context, _) => TelaDeAba(
        raizDeSecao: true,
        titulo: destino.rotulo,
        acaoDeCriar: _acaoDeCriar(context, sessao),
        cabecalhoFixo: _topoFixo(),
        reforco: null,
        filhos: <Widget>[
          ..._corpoDaAba(sessao.logado),
        ],
      ),
      ),
    );
  }

  Widget _abasDaSecao() {
    return TabBar(
        controller: _abas,
        isScrollable: true,
        tabAlignment: TabAlignment.start,
        onTap: (i) => _trocarAba(AbaDaSecaoRede.values[i]),
        tabs: <Widget>[
          for (final a in AbaDaSecaoRede.values)
            Tab(
              height: BichuAlvoDeToque.min,
              child: Row(
                mainAxisSize: MainAxisSize.min,
                children: <Widget>[
                  Icon(a.glifo, size: 20),
                  const SizedBox(width: BichuEspaco.e1),
                  Text(a.rotulo),
                ],
              ),
            ),
        ],
    );
  }

  Widget _topoFixo() {
    final cores = BichuColors.of(context).cores;
    return DecoratedBox(
      decoration: BoxDecoration(
        color: cores.surface,
        border: Border(
          bottom: BorderSide(color: cores.outline, width: BichuBorda.hairline),
        ),
      ),
      child: Padding(
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

  Widget? _acaoDeCriar(BuildContext context, ControladorDeSessao sessao) {
    if (!podeCriarNaComunidade(sessao)) return null;
    switch (_aba) {
      case AbaDaSecaoRede.eventos:
        return AcaoDeCriarFlutuante(
          icone: Icons.more_time,
          rotulo: AgendaDaRede.rotuloDeMarcar,
          aoTocar: () => context.push(Rotas.criarEncontroDaRede),
        );
      case AbaDaSecaoRede.comunidade:
        return AcaoDeCriarFlutuante(
          icone: Icons.group_add,
          rotulo: ListaDoDiretorio.rotuloDeIndicar,
          aoTocar: () => context.push(Rotas.sugerirProfissional),
        );
      case AbaDaSecaoRede.usuarios:
        return null;
    }
  }

  List<Widget> _corpoDaAba(bool logado) {
    switch (_aba) {
      case AbaDaSecaoRede.eventos:
        return <Widget>[AgendaDaRede(reforcoDaSecao: '')];
      case AbaDaSecaoRede.comunidade:
        return <Widget>[
          const ListaDoDiretorio(),
        ];
      case AbaDaSecaoRede.usuarios:
        final escopo = Escopo.of(context);
        final pessoas = PessoasApi(escopo.api);
        return <Widget>[
          BuscaDePessoas(
            pessoas: pessoas,
            conexoes: escopo.conexoes,
            logado: logado,
            // A LISTAGEM DA PROPRIA REGIAO (cliente, 02/11/2026). Ela so e
            // montada COM sessao: sem conta nao ha regiao com que casar, e a
            // rota exige `bearerAuth` sem alternativa vazia.
            listaDaRegiao: !logado
                ? null
                : ListaDaRegiao(
                    pessoas: pessoas,
                    conexoes: escopo.conexoes,
                    me: escopo.me,
                    usuario: escopo.sessao.usuario,
                    aoAtualizarOUsuario: escopo.sessao.atualizarUsuario,
                    aoAbrirOPerfil: (apelido) =>
                        context.push(Rotas.perfilDe(apelido)),
                  ),
          ),
        ];
    }
  }
}
