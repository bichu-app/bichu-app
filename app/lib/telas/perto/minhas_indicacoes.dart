import 'package:flutter/material.dart';
import 'package:go_router/go_router.dart';

import '../../api/diretorio_api.dart';
import '../../api/falhas.dart';
import '../../api/modelos_diretorio.dart';
import '../../escopo.dart';
import '../../roteamento/rotas.dart';
import '../../theme/bichu_colors.dart';
import '../../theme/bichu_tokens.g.dart';
import '../../widgets/arrastar_para_atualizar.dart';
import '../../widgets/barra_de_listagem.dart';
import '../../widgets/botao_primario.dart';
import '../../widgets/rodape_da_paginacao.dart';

/// `Minhas indicações`: o que ESTA CONTA indicou para o `Perto`, e em que pé
/// está cada uma.
class MinhasIndicacoes extends StatefulWidget {
  const MinhasIndicacoes({super.key});

  static const String tituloDaTela = 'Minhas indicações';

  /// A lista vazia **não fica em branco, e uma linha basta.**
  static const String vazio = 'Você ainda não indicou ninguém.';

  /// Vazio **por causa do filtro**, que é outro estado: dizer "você ainda não
  /// indicou ninguém" a quem tem três indicações e filtrou por recusadas seria
  /// mentira.
  static String vazioComFiltro(String rotulo) => 'Nenhuma indicação $rotulo.';

  static const String rotuloDeIndicar = 'Indicar quem atende bem';
  /// **O TEXTO MUDOU EM 28/10/2026 com a seção, e o NOME da constante fica.**
  static const String rotuloDeVerNoPerto = 'Ver na Rede';
  static const String carregando = 'Carregando as suas indicações';
  static const String falha = 'Não foi possível carregar as suas indicações.';
  static const String falhaDeMais = 'Não foi possível carregar mais indicações.';

  /// O rótulo de cada estado, e ele é o MESMO em todo lugar desta tela: no selo
  /// do cartão e na opção do filtro.
  static String rotuloDoEstado(EstadoDaSugestao estado) => switch (estado) {
    EstadoDaSugestao.pending => 'Em análise',
    EstadoDaSugestao.approved => 'Aprovada',
    EstadoDaSugestao.declined => 'Recusada',
  };

  /// A linha que explica a aprovada que ainda não está no ar.
  static const String aprovadaForaDoAr = 'Ainda não está na Rede.';

  /// O prefixo do motivo, para o motivo não parecer texto do app.
  static const String prefixoDoMotivo = 'Motivo: ';

  /// A frase do fim da lista, no plural e no singular.
  static String fimDaLista(int total) => total == 1
      ? 'Esta é a sua única indicação.'
      : 'Você viu todas as suas $total indicações.';

  static const String chaveDoFiltroDeEstado = 'state';

  @override
  State<MinhasIndicacoes> createState() => _MinhasIndicacoesState();
}

enum _Fase { carregando, lista, falha }

class _MinhasIndicacoesState extends State<MinhasIndicacoes>
    with PublicaAAtualizacao {
  /// A BUSCA QUE O ARRASTO REFAZ (cliente, 18/10/2026).
  @override
  Future<void> aoArrastarParaAtualizar() => _carregar();

  _Fase _fase = _Fase.carregando;
  List<MinhaIndicacao> _itens = const <MinhaIndicacao>[];
  int _total = 0;
  int _pagina = 1;
  bool _carregandoMais = false;
  String? _falhaDeMais;

  EstadoDaSugestao? _estado;

  DiretorioApi get _api => DiretorioApi(Escopo.of(context).api);

  @override
  void initState() {
    super.initState();
  }

  bool _jaCarregou = false;

  @override
  void didChangeDependencies() {
    super.didChangeDependencies();
    if (_jaCarregou) return;
    _jaCarregou = true;
    _carregar();
  }

  Future<void> _carregar() async {
    setState(() {
      _fase = _Fase.carregando;
      _falhaDeMais = null;
    });
    try {
      final pagina = await _api.minhasIndicacoes(
        pagina: 1,
        estado: _estado,
      );
      if (!mounted) return;
      setState(() {
        _itens = pagina.itens;
        _total = pagina.total;
        _pagina = 1;
        _fase = _Fase.lista;
      });
    } on FalhaDeChamada {
      if (!mounted) return;
      setState(() => _fase = _Fase.falha);
    } on FormatException {
      if (!mounted) return;
      setState(() => _fase = _Fase.falha);
    }
  }

  Future<void> _carregarMais() async {
    if (_carregandoMais) return;
    setState(() {
      _carregandoMais = true;
      _falhaDeMais = null;
    });
    try {
      final pagina = await _api.minhasIndicacoes(
        pagina: _pagina + 1,
        estado: _estado,
      );
      if (!mounted) return;
      setState(() {
        _itens = <MinhaIndicacao>[..._itens, ...pagina.itens];
        _total = pagina.total;
        _pagina += 1;
        _carregandoMais = false;
      });
    } on FalhaDeChamada {
      if (!mounted) return;
      setState(() {
        _carregandoMais = false;
        _falhaDeMais = MinhasIndicacoes.falhaDeMais;
      });
    } on FormatException {
      if (!mounted) return;
      setState(() {
        _carregandoMais = false;
        _falhaDeMais = MinhasIndicacoes.falhaDeMais;
      });
    }
  }

  void _aplicar(EscolhaDaFolha escolha) {
    final codigo = escolha.filtros[MinhasIndicacoes.chaveDoFiltroDeEstado];
    setState(() => _estado = EstadoDaSugestao.porCodigo(codigo));
    _carregar();
  }

  ControleDeFiltro _controleDeFiltro() {
    return ControleDeFiltro(
      grupos: <GrupoDeFiltro>[
        GrupoDeFiltro(
          chave: MinhasIndicacoes.chaveDoFiltroDeEstado,
          titulo: 'Situação',
          selecionado: _estado?.codigo,
          opcoes: <OpcaoDeRecorte>[
            for (final estado in EstadoDaSugestao.values)
              OpcaoDeRecorte(
                codigo: estado.codigo,
                rotulo: MinhasIndicacoes.rotuloDoEstado(estado),
              ),
          ],
        ),
      ],
    );
  }

  @override
  Widget build(BuildContext context) {
    return Column(
      crossAxisAlignment: CrossAxisAlignment.stretch,
      children: _corpo(),
    );
  }

  List<Widget> _corpo() {
    switch (_fase) {
      case _Fase.carregando:
        return <Widget>[
          Padding(
            padding: const EdgeInsets.all(BichuEspaco.e6),
            child: Center(
              child: Semantics(
                label: MinhasIndicacoes.carregando,
                child: const CircularProgressIndicator.adaptive(),
              ),
            ),
          ),
        ];
      case _Fase.falha:
        return <Widget>[
          Padding(
            padding: const EdgeInsets.all(BichuEspaco.e4),
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.stretch,
              children: <Widget>[
                Text(MinhasIndicacoes.falha),
                const SizedBox(height: BichuEspaco.e4),
                BotaoSecundario(rotulo: 'Tentar de novo', aoTocar: _carregar),
              ],
            ),
          ),
        ];
      case _Fase.lista:
        return <Widget>[
          if (BarraDeListagem.desenha(
            total: _total,
            filtro: _controleDeFiltro(),
            aoAplicar: _aplicar,
          ))
            BarraDeListagem(
              total: _total,
              filtro: _controleDeFiltro(),
              aoAplicar: _aplicar,
              substantivo: const SubstantivoDaListagem(
                singular: 'indicação',
                plural: 'indicações',
              ),
            ),
          ..._lista(),
        ];
    }
  }

  List<Widget> _lista() {
    if (_itens.isEmpty) {
      return <Widget>[
        Padding(
          padding: const EdgeInsets.all(BichuEspaco.e4),
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.stretch,
            children: <Widget>[
              Text(
                _estado == null
                    ? MinhasIndicacoes.vazio
                    : MinhasIndicacoes.vazioComFiltro(
                        MinhasIndicacoes.rotuloDoEstado(
                          _estado!,
                        ).toLowerCase(),
                      ),
              ),
              const SizedBox(height: BichuEspaco.e4),
              if (_estado == null)
                BotaoSecundario(
                  rotulo: MinhasIndicacoes.rotuloDeIndicar,
                  aoTocar: () => context.push(Rotas.sugerirProfissional),
                ),
            ],
          ),
        ),
      ];
    }

    return <Widget>[
      for (final indicacao in _itens) _CartaoDaIndicacao(indicacao: indicacao),
      RodapeDaPaginacao(
        carregados: _itens.length,
        total: _total,
        aoPedirMais: _carregarMais,
        fimDaLista: MinhasIndicacoes.fimDaLista,
        carregando: _carregandoMais,
        textoDaFalha: _falhaDeMais,
      ),
    ];
  }
}

/// Um cartão da lista: a indicação e o estado dela.
class _CartaoDaIndicacao extends StatelessWidget {
  const _CartaoDaIndicacao({required this.indicacao});

  final MinhaIndicacao indicacao;

  @override
  Widget build(BuildContext context) {
    final cores = BichuColors.of(context).cores;
    final textos = Theme.of(context).textTheme;

    final lugar = indicacao.bairro == null
        ? '${indicacao.cidade}, ${indicacao.uf}'
        : '${indicacao.bairro}, ${indicacao.cidade}, ${indicacao.uf}';

    return Padding(
      padding: const EdgeInsets.symmetric(
        horizontal: BichuEspaco.e4,
        vertical: BichuEspaco.e2,
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: <Widget>[
          Text(indicacao.nome, style: textos.titleMedium),
          const SizedBox(height: BichuEspaco.e1),
          Text(
            '${indicacao.atividade.rotulo} · $lugar',
            style: textos.bodySmall?.copyWith(color: cores.textSecondary),
          ),
          const SizedBox(height: BichuEspaco.e2),
          _SeloDoEstado(estado: indicacao.estado),
          if (indicacao.estado == EstadoDaSugestao.approved &&
              !indicacao.levaAoPerto) ...<Widget>[
            const SizedBox(height: BichuEspaco.e1),
            Text(
              MinhasIndicacoes.aprovadaForaDoAr,
              style: textos.bodySmall?.copyWith(color: cores.textSecondary),
            ),
          ],
          if (indicacao.motivoDaRecusa != null) ...<Widget>[
            const SizedBox(height: BichuEspaco.e1),
            Text(
              '${MinhasIndicacoes.prefixoDoMotivo}${indicacao.motivoDaRecusa}',
              style: textos.bodySmall,
            ),
          ],
          if (indicacao.levaAoPerto) ...<Widget>[
            const SizedBox(height: BichuEspaco.e2),
            BotaoSecundario(
              rotulo: MinhasIndicacoes.rotuloDeVerNoPerto,
              aoTocar: () =>
                  context.go(Rotas.localDoPertoDe(indicacao.entradaSlug!)),
            ),
          ],
          const SizedBox(height: BichuEspaco.e2),
          Divider(height: 1, color: cores.outline),
        ],
      ),
    );
  }
}

/// O selo do estado: a palavra, e a cor como reforço — nunca a cor sozinha.
class _SeloDoEstado extends StatelessWidget {
  const _SeloDoEstado({required this.estado});

  final EstadoDaSugestao estado;

  @override
  Widget build(BuildContext context) {
    final cores = BichuColors.of(context).cores;
    final textos = Theme.of(context).textTheme;

    final cor = switch (estado) {
      EstadoDaSugestao.pending => cores.textSecondary,
      EstadoDaSugestao.approved => cores.success,
      EstadoDaSugestao.declined => cores.error,
    };

    return Text(
      MinhasIndicacoes.rotuloDoEstado(estado),
      style: textos.labelLarge?.copyWith(color: cor),
    );
  }
}
