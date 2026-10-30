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

  /// Comprimento FIXO 3: as tres abas existem em todo estado de sessao.
  late final TabController _abas = TabController(
    length: 3,
    initialIndex: _aba.index,
    vsync: this,
  );

  @override
  void initState() {
    super.initState();
    WidgetsBinding.instance.addPostFrameCallback((_) {
      if (mounted) _marcarVista(_aba);
    });
  }

  /// O endereco pediu outra aba **com a secao ja montada**.
  @override
  void didUpdateWidget(SecaoDaRede anterior) {
    super.didUpdateWidget(anterior);
    final pedida = widget.abaInicial;
    if (pedida == null || pedida == _aba) return;
    _abas.index = pedida.index;
    _trocarAba(pedida);
  }

  /// A BUSCA QUE O CORPO DA ABA PUBLICA NO TOPO FIXO.
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

  /// Avisa o contador de que esta sub-aba foi vista.
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

  /// AS TRES ABAS DA SECAO.
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

  /// O TOPO QUE NAO ROLA: as tres abas e a linha de busca.
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

  /// A PORTA DE CRIAR DA SECAO REUNIDA: **uma so, e ela TROCA COM A ABA.**
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
        return <Widget>[
          BuscaDePessoas(
            pessoas: PessoasApi(escopo.api),
            conexoes: escopo.conexoes,
            logado: logado,
          ),
        ];
    }
  }
}
