/// A CAIXA DE NOTIFICACOES: o conteudo que fica atras do sino da barra de topo.
library;

import 'dart:async';

import 'package:flutter/material.dart';
import 'package:go_router/go_router.dart';

import '../../api/falhas.dart';
import '../../api/mensagens_de_erro.dart';
import '../../api/modelos_notificacao.dart';
import '../../api/notificacoes_api.dart';
import '../../escopo.dart';
import '../../sessao/contador_de_avisos.dart';
import '../../theme/bichu_colors.dart';
import '../../theme/bichu_tokens.g.dart';
import '../../widgets/arrastar_para_atualizar.dart';
import '../../widgets/botao_primario.dart';
import '../../widgets/convite_para_entrar.dart';
import '../../widgets/faixa_de_aviso.dart';
import '../../widgets/rodape_da_paginacao.dart';
import '../../widgets/saida_da_tela.dart';

/// O endereco da caixa, num lugar so.
abstract final class RotasDaCaixa {
  /// A caixa de notificacoes.
  static const String caixa = '/notificacoes';
}

/// O endereco do DESTINO de uma linha da caixa, ou `null` quando nao ha.
abstract final class PortaDoDestinoDoAviso {
  /// O endereco de [aviso], ou `null` quando ele nao tem destino.
  static String? Function(AvisoDaCaixa aviso) destino = _semDestino;

  /// O default, nomeado para a isca poder voltar a ele num `addTearDown`.
  static String? _semDestino(AvisoDaCaixa aviso) => null;

  /// Volta ao estado de fabrica.
  static void soltar() => destino = _semDestino;
}

/// Os textos da caixa, num lugar so.
abstract final class TextosDaCaixa {
  static const String titulo = 'Avisos';

  /// A lista vazia: **uma linha**, e sem texto de apoio (decisao do cliente de
  /// 18/10).
  static const String vazio = 'Você ainda não tem avisos.';

  static const String marcarTodas = 'Marcar todas como lidas';

  /// O estado de cada linha, em PALAVRA e nao em cor.
  static const String naoLido = 'Não lido';
  static const String lido = 'Lido';

  static const String naoConseguimosMarcar =
      'Não conseguimos marcar este aviso. Tente de novo.';

  /// O rotulo acessivel do "x".
  static const String fechar = 'Fechar este aviso';

  static const String naoConseguimosFechar =
      'Não conseguimos fechar este aviso. Tente de novo.';

  static const String naoConseguimosMarcarTodas =
      'Não conseguimos marcar seus avisos. Tente de novo.';

  static const String falhaDeMais = 'Não foi possível carregar mais avisos.';

  /// Quantos avisos a linha resume, quando resume mais de um.
  static String resumo(int quantos) => 'Resume $quantos avisos';

  /// A frase do fim da lista, no singular e no plural.
  static String fimDaLista(int total) => total == 1
      ? 'Este é o seu único aviso.'
      : 'Você viu todos os seus $total avisos.';
}

/// A tela da caixa de notificacoes.
class CaixaDeNotificacoes extends StatefulWidget {
  const CaixaDeNotificacoes({super.key, this.notificacoes});

  /// A camada de API, injetavel.
  final NotificacoesApi? notificacoes;

  @override
  State<CaixaDeNotificacoes> createState() => _CaixaDeNotificacoesState();
}

enum _Fase { carregando, lista, falha }

class _CaixaDeNotificacoesState extends State<CaixaDeNotificacoes> {
  _Fase _fase = _Fase.carregando;

  /// A falha da lista foi **falta de conta**, e nao defeito.
  bool _faltaConta = false;
  List<AvisoDaCaixa> _itens = const <AvisoDaCaixa>[];
  int _total = 0;
  int _pagina = 1;
  bool _carregandoMais = false;
  String? _falhaDaLista;
  String? _falhaDeMais;
  String? _falhaDaAcao;

  /// O mesmo sinalizador de `TelaAcompanharPlaquinha` e das outras telas que
  /// leem `Escopo`: ler um `InheritedWidget` em `initState` estoura
  /// `dependOnInheritedWidgetOfExactType ...
  bool _iniciou = false;

  NotificacoesApi get _api =>
      widget.notificacoes ?? NotificacoesApi(Escopo.of(context).api);

  /// O contador do sino, **ou nulo quando esta tela esta montada fora do app**.
  ContadorDeAvisos? _contador;

  @override
  void didChangeDependencies() {
    super.didChangeDependencies();
    if (_iniciou) return;
    _iniciou = true;
    _contador = context
        .dependOnInheritedWidgetOfExactType<Escopo>()
        ?.contadorDeAvisos;
    _carregar();
    _marcarListaVista();
  }

  Future<void> _marcarListaVista() async {
    try {
      await _api.marcarListaVista();
      if (!mounted) return;
      _contador?.zerarPorqueAListaFoiVista();
    } on FalhaDeChamada {
      // **Engolida de proposito, e e a unica chamada desta tela que e.** Nada na tela depende dela: o que ela faz e derrubar o numero do sino, que e desenhado por outra tela e lido do servidor.
    } on Object catch (erro, pilha) {
      registrarFalhaInesperada(erro, pilha, onde: 'ao marcar a caixa como vista');
    }
  }

  Future<void> _carregar() async {
    setState(() {
      _fase = _Fase.carregando;
      _falhaDaLista = null;
      _faltaConta = false;
      _falhaDeMais = null;
      _falhaDaAcao = null;
    });
    try {
      final pagina = await _api.listar(pagina: 1);
      if (!mounted) return;
      setState(() {
        _itens = pagina.itens;
        _total = pagina.total;
        _pagina = pagina.pagina;
        _fase = _Fase.lista;
      });
    } on FalhaDeChamada catch (falha) {
      if (!mounted) return;
      setState(() {
        _fase = _Fase.falha;
        _faltaConta = faltaConta(falha);
        _falhaDaLista = MensagensDeErro.de(falha).texto;
      });
    } on FormatException {
      if (!mounted) return;
      setState(() {
        _fase = _Fase.falha;
        _falhaDaLista = MensagensDeErro.servidorFora;
      });
    } on Object catch (erro, pilha) {
      registrarFalhaInesperada(erro, pilha, onde: 'ao ler a caixa de avisos');
      if (!mounted) return;
      setState(() {
        _fase = _Fase.falha;
        _falhaDaLista = MensagensDeErro.servidorFora;
      });
    }
  }

  Future<void> _carregarMais() async {
    if (_carregandoMais) return;
    setState(() {
      _carregandoMais = true;
      _falhaDeMais = null;
    });
    try {
      final pagina = await _api.listar(pagina: _pagina + 1);
      if (!mounted) return;
      setState(() {
        _itens = <AvisoDaCaixa>[..._itens, ...pagina.itens];
        _total = pagina.total;
        _pagina = pagina.pagina;
        _carregandoMais = false;
      });
    } on FalhaDeChamada {
      if (!mounted) return;
      setState(() {
        _carregandoMais = false;
        _falhaDeMais = TextosDaCaixa.falhaDeMais;
      });
    } on FormatException {
      if (!mounted) return;
      setState(() {
        _carregandoMais = false;
        _falhaDeMais = TextosDaCaixa.falhaDeMais;
      });
    }
  }

  /// O toque na linha: o item foi ABERTO, e a pessoa vai ao destino.
  Future<void> _abrir(AvisoDaCaixa aviso) async {
    setState(() => _falhaDaAcao = null);
    try {
      await _api.marcarComoLido(aviso.ref);
      if (!mounted) return;
      setState(() {
        _itens = <AvisoDaCaixa>[
          for (final item in _itens)
            if (item.ref == aviso.ref) item.comoLido() else item,
        ];
      });
      _irAoDestino(aviso);
    } on FalhaDeChamada {
      if (!mounted) return;
      setState(() => _falhaDaAcao = TextosDaCaixa.naoConseguimosMarcar);
    }
  }

  /// O toque no "x": a linha foi DISPENSADA.
  Future<void> _dispensar(AvisoDaCaixa aviso) async {
    setState(() => _falhaDaAcao = null);
    try {
      await _api.dispensar(aviso.ref);
      if (!mounted) return;
      setState(() {
        _itens = <AvisoDaCaixa>[
          for (final item in _itens)
            if (item.ref != aviso.ref) item,
        ];
        if (_total > 0) _total -= 1;
      });
    } on FalhaDeChamada {
      if (!mounted) return;
      setState(() => _falhaDaAcao = TextosDaCaixa.naoConseguimosFechar);
    }
  }

  /// Empilha a tela de destino, **quando ha uma**.
  void _irAoDestino(AvisoDaCaixa aviso) {
    if (!mounted) return;
    if (!aviso.temDestino) return;
    final endereco = PortaDoDestinoDoAviso.destino(aviso);
    if (endereco == null || endereco.isEmpty) return;
    unawaited(context.push<void>(endereco));
  }

  Future<void> _marcarTodas() async {
    setState(() => _falhaDaAcao = null);
    try {
      await _api.marcarTodasComoLidas();
      if (!mounted) return;
      setState(() {
        _itens = <AvisoDaCaixa>[
          for (final item in _itens) item.comoLido(),
        ];
      });
    } on FalhaDeChamada {
      if (!mounted) return;
      setState(() => _falhaDaAcao = TextosDaCaixa.naoConseguimosMarcarTodas);
    }
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: const BarraDeConta(
        titulo: TextosDaCaixa.titulo,
        saida: TipoDeSaida.voltar,
      ),
      body: SafeArea(
        child: ArrastarParaAtualizar(
          aoAtualizar: _carregar,
          child: _corpo(),
        ),
      ),
    );
  }

  Widget _corpo() {
    switch (_fase) {
      case _Fase.carregando:
        return const Center(child: CircularProgressIndicator());
      case _Fase.falha:
        if (_faltaConta) {
          return const Padding(
            padding: EdgeInsets.all(BichuEspaco.e4),
            child: ConviteParaEntrar(secao: SecaoComConta.notificacoes),
          );
        }
        return Padding(
          padding: const EdgeInsets.all(BichuEspaco.e4),
          child: FaixaDeAviso(
            texto: _falhaDaLista ?? MensagensDeErro.servidorFora,
            rotuloDaAcao: MensagensDeErro.tentarDeNovo,
            aoTocarNaAcao: _carregar,
          ),
        );
      case _Fase.lista:
        return ListView(
          padding: const EdgeInsets.symmetric(vertical: BichuEspaco.e2),
          children: _lista(),
        );
    }
  }

  List<Widget> _lista() {
    if (_itens.isEmpty) {
      return <Widget>[
        Padding(
          padding: const EdgeInsets.all(BichuEspaco.e4),
          child: Text(
            TextosDaCaixa.vazio,
            style: Theme.of(context).textTheme.bodyLarge,
          ),
        ),
      ];
    }

    return <Widget>[
      if (_falhaDaAcao != null)
        Padding(
          padding: const EdgeInsets.fromLTRB(
            BichuEspaco.e4,
            BichuEspaco.e2,
            BichuEspaco.e4,
            BichuEspaco.e2,
          ),
          child: FaixaDeAviso(texto: _falhaDaAcao!),
        ),
      Padding(
        padding: const EdgeInsets.fromLTRB(
          BichuEspaco.e4,
          BichuEspaco.e2,
          BichuEspaco.e4,
          BichuEspaco.e3,
        ),
        child: BotaoSecundario(
          rotulo: TextosDaCaixa.marcarTodas,
          aoTocar: _marcarTodas,
        ),
      ),
      for (final aviso in _itens)
        _LinhaDoAviso(
          key: ValueKey<String>(aviso.ref),
          aviso: aviso,
          aoTocar: () => _abrir(aviso),
          aoFechar: () => _dispensar(aviso),
        ),
      Padding(
        padding: const EdgeInsets.fromLTRB(
          BichuEspaco.e4,
          espacoAcimaDoRodape,
          BichuEspaco.e4,
          BichuEspaco.e4,
        ),
        child: RodapeDaPaginacao(
          carregados: _itens.length,
          total: _total,
          aoPedirMais: _carregarMais,
          fimDaLista: TextosDaCaixa.fimDaLista,
          carregando: _carregandoMais,
          textoDaFalha: _falhaDeMais,
        ),
      ),
    ];
  }
}

/// Uma linha da caixa: o tipo, o assunto, o estado, quando aconteceu e o "x".
class _LinhaDoAviso extends StatelessWidget {
  const _LinhaDoAviso({
    required this.aviso,
    required this.aoTocar,
    required this.aoFechar,
    super.key,
  });

  final AvisoDaCaixa aviso;
  final VoidCallback aoTocar;

  /// O "x": dispensa a linha.
  final VoidCallback aoFechar;

  @override
  Widget build(BuildContext context) {
    final cores = BichuColors.of(context).cores;
    final textos = Theme.of(context).textTheme;

    final estado = aviso.lido ? TextosDaCaixa.lido : TextosDaCaixa.naoLido;
    final partes = <String>[
      estado,
      aviso.dataEmTexto,
      if (aviso.resumeVarios) TextosDaCaixa.resumo(aviso.agrupados),
    ];

    return InkWell(
      onTap: aoTocar,
      child: Padding(
        padding: const EdgeInsets.symmetric(
          horizontal: BichuEspaco.e4,
          vertical: BichuEspaco.e3,
        ),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: <Widget>[
            Row(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: <Widget>[
                Expanded(
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: <Widget>[
                      Text(
                        aviso.tipo.rotulo,
                        style: textos.titleMedium?.copyWith(
                          fontWeight:
                              aviso.lido ? FontWeight.w400 : FontWeight.w600,
                        ),
                      ),
                      if (aviso.assunto != null) ...<Widget>[
                        const SizedBox(height: BichuEspaco.e1),
                        Text(aviso.assunto!, style: textos.bodyMedium),
                      ],
                      const SizedBox(height: BichuEspaco.e1),
                      Text(
                        partes.join(' · '),
                        style: textos.bodySmall
                            ?.copyWith(color: cores.textSecondary),
                      ),
                    ],
                  ),
                ),
                IconButton(
                  key: ValueKey<String>('fechar:${aviso.ref}'),
                  onPressed: aoFechar,
                  tooltip: TextosDaCaixa.fechar,
                  visualDensity: VisualDensity.compact,
                  icon: Icon(Icons.close, size: 20, color: cores.textSecondary),
                ),
              ],
            ),
            const SizedBox(height: BichuEspaco.e3),
            Divider(height: 1, color: cores.outline),
          ],
        ),
      ),
    );
  }
}
