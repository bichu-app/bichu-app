import '../../widgets/arrastar_para_atualizar.dart';
import 'dart:async';
import 'dart:collection';

import 'package:flutter/material.dart';

import '../../api/falhas.dart';
import '../../api/modelos_pet.dart';
import '../../api/modelos_rede.dart';
import '../../api/rede_api.dart';
import '../../escopo.dart';
import '../../roteamento/rotas.dart';
import '../../theme/bichu_colors.dart';
import '../../theme/bichu_tokens.g.dart';
import '../../widgets/barra_de_listagem.dart';
import '../../widgets/cidade_por_localizacao.dart';
import '../../widgets/convite_para_entrar.dart';
import '../../widgets/faixa_de_aviso.dart';
import '../../widgets/listagem_preservada.dart';
import '../casca_com_abas.dart';
import 'cartao_do_encontro.dart';
import 'encontro_da_rede.dart';
import 'pecas_da_rede.dart';

/// `Rede`: a agenda dos encontros (design system 24.14 com 24.15 a 24.17,
/// textos da UX 28.7.4).
class AgendaDaRede extends StatefulWidget {
  const AgendaDaRede({super.key, this.reforcoDaSecao});

  /// A linha que explica a secao, que ate 17/10 era desenhada pela casca
  /// (`TelaDeAba.reforco`) **acima** de tudo o que esta tela monta.
  final String? reforcoDaSecao;

  static const String tituloDoVazio = 'A Rede ainda não tem eventos';
  static const String explicacaoDoVazio =
      'Aparecem aqui assim que forem criados.';
  static const String tituloDoVazioDeEncerrados = 'Nenhum evento encerrado';
  static const String explicacaoDoVazioDeEncerrados =
      'Os eventos que já aconteceram ficam aqui.';
  static const String tituloDoVazioFiltrado =
      'Nenhum evento com esses filtros';
  static const String explicacaoDoVazioFiltrado =
      'Tente outra palavra, outro período ou menos filtros.';
  static const String textoDaFalha =
      'Não conseguimos carregar os eventos agora.';
  static const String rotuloDeAtualizar = 'Atualizar';
  static const String exemploDaBusca = 'passeio, praça, Pinheiros';

  /// O rotulo da porta de criar.
  static const String rotuloDeMarcar = 'Criar evento';
  static const String ordemTrocadaPeloServidor =
      'A ordem escolhida não está disponível agora. A lista usa a ordem '
      'marcada acima.';

  /// "Carregar mais" (ATENCAO: a especificacao nao desenhou a paginacao da
  /// agenda; texto no padrao de 28.2, `Tentar de novo` refaz uma coisa so).
  static const String rotuloDeCarregarMais = 'Carregar mais eventos';
  /// O que a lista esta mostrando **enquanto nao ha cidade**.
  static const String explicacaoSemCidade =
      'Mostrando os eventos mais recentes de todas as cidades.';

  static const String falhaAoCarregarMais =
      'Não conseguimos carregar mais eventos agora.';
  static const String rotuloDeTentar = 'Tentar de novo';

  static String tituloDoVazioComBusca(String termo) =>
      'Nenhum evento com “$termo”';

  @override
  State<AgendaDaRede> createState() => _AgendaDaRedeState();
}

class _ItemDaAgenda {
  const _ItemDaAgenda(this.encontro, {this.distancia});
  final EncontroDaRede encontro;
  final int? distancia;
}

enum _Fase { carregando, lista, falha }

class _AgendaDaRedeState extends State<AgendaDaRede>
    with PublicaAAtualizacao {
  /// A BUSCA QUE O ARRASTO REFAZ (cliente, 18/10/2026).
  @override
  Future<void> aoArrastarParaAtualizar() => _carregar();

  RecorteDaRede _recorte = const RecorteDaRede();
  _Fase _fase = _Fase.carregando;

  List<_ItemDaAgenda> _itens = const <_ItemDaAgenda>[];

  final PreservacaoDaListagem _preservacao =
      PreservacaoDaListagem(teto: tetoDeItensPreservadosComCapa);

  String get _assinaturaDaListagem => assinaturaDaListagem(
        pergunta: <String, String>{
          'termo': _recorte.termo ?? '',
          'quando': _recorte.quando?.name ?? '',
          'situacao': _recorte.situacao?.name ?? '',
          'entrada': _recorte.entrada?.name ?? '',
          'porte': _recorte.porte?.name ?? '',
          'distancia': _recorte.distanciaMaxima?.name ?? '',
          'ordem': _recorte.ordem ?? '',
          'cidade_em_uso': _cidadeEmUso ?? '',
        },
        referencia: _referenciaDaConta,
      );

  String? get _referenciaDaConta {
    final regiao = Escopo.of(context).sessao.usuario?.regiaoDeReferencia;
    if (regiao == null) return null;
    return textoDaReferencia(
      cep: regiao.cep,
      bairro: regiao.bairro,
      cidade: regiao.cidade,
      uf: regiao.uf,
    );
  }
  int _total = 0;
  int _pagina = 1;
  String _ordemEfetiva = OrdemDaRede.proximos.codigo;

  final Map<String, int?> _medidas = <String, int?>{};
  String? _assinaturaDasMedidas;
  int _paginaDasMedidas = 0;
  bool _medidasEsgotadas = false;

  bool _carregandoMais = false;
  bool _falhaAoCarregarMais = false;

  bool? _logadoDaUltimaCarga;

  final SplayTreeSet<String> _cidadesConhecidas = SplayTreeSet<String>();
  final TextEditingController _buscaControlador = TextEditingController();

  CidadeDoAparelho? _cidadeDoAparelho;

  bool _folhaDecidiuACidade = false;

  bool _visivel = false;
  bool _cargaAgendada = false;

  int _geracao = 0;

  @override
  void dispose() {
    _buscaControlador.dispose();
    _cidadeDoAparelho?.dispose();
    super.dispose();
  }

  @override
  void didChangeDependencies() {
    super.didChangeDependencies();
    if (!TickerMode.valuesOf(context).enabled) {
      _visivel = false;
      return;
    }
    if (_visivel) return;
    _visivel = true;
    _criarAResolucaoDaCidade();
    if (_preservacao.vale(
      itens: _itens.length,
      assinatura: _assinaturaDaListagem,
    )) {
      return;
    }
    _agendarCarga();
  }

  void _criarAResolucaoDaCidade() {
    if (_cidadeDoAparelho != null) return;
    final resolvedor = CidadeDoAparelho.doEscopo(context)
      ..addListener(_aResolucaoAndou);
    _cidadeDoAparelho = resolvedor;
    unawaited(
      resolvedor.resolverNaAbertura().then((trocou) {
        if (!mounted || !trocou) return;
        if (_folhaDecidiuACidade) return;
        _carregar();
      }),
    );
  }

  void _aResolucaoAndou() {
    if (!mounted) return;
    setState(() {});
  }

  String? get _cidadeEmUso =>
      _folhaDecidiuACidade ? _recorte.cidade : _cidadeDoAparelho?.cidade;

  Future<void> _usarMinhaLocalizacao() async {
    final resolvedor = _cidadeDoAparelho;
    if (resolvedor == null) return;
    final trocou = await resolvedor.resolverPorToque();
    if (!mounted) return;
    if (resolvedor.cidade == null) return;
    setState(() {
      _folhaDecidiuACidade = false;
      if (_recorte.cidade != null) _recorte = _recorte.copiar(semCidade: true);
    });
    if (trocou || _cidadeEmUso != null) await _carregar();
  }

  void _agendarCarga() {
    if (_cargaAgendada) return;
    _cargaAgendada = true;
    WidgetsBinding.instance.addPostFrameCallback((_) {
      _cargaAgendada = false;
      if (mounted) _carregar();
    });
  }

  QuandoDaRede get _quandoEfetivo => _recorte.quando ?? QuandoDaRede.aVir;

  bool get _encerrados => _quandoEfetivo == QuandoDaRede.passados;

  bool get _naAgendaDoQueVem => !_encerrados;

  bool get _temRegiao =>
      Escopo.of(context).sessao.usuario?.regiaoDeReferencia != null;

  Future<void> _carregar({bool maisUma = false}) async {
    if (!mounted) return;
    final escopo = Escopo.of(context);
    final logado = escopo.sessao.logado;
    if (_logadoDaUltimaCarga != null && _logadoDaUltimaCarga != logado) {
      _limparMedidas();
    }
    _logadoDaUltimaCarga = logado;

    final int geracao;
    if (maisUma) {
      if (_carregandoMais) return;
      geracao = _geracao;
      setState(() {
        _carregandoMais = true;
        _falhaAoCarregarMais = false;
      });
    } else {
      geracao = ++_geracao;
      _preservacao.descartar();
      SlotDaRolagem.maybeOf(context)?.aListaFoiDescartada();
      setState(() => _fase = _Fase.carregando);
    }
    final cidade = _cidadeEmUso;
    final recorte = _recorte.copiar(
      pagina: maisUma ? _pagina + 1 : 1,
      cidade: cidade,
      semCidade: cidade == null,
    );
    final rede = RedeApi(escopo.api);
    final medir = logado &&
        _temRegiao &&
        _naAgendaDoQueVem &&
        !recorte.pedeDistancia;

    try {
      late final List<_ItemDaAgenda> itens;
      late final int total;
      late final int pagina;
      late final String efetiva;

      if (_encerrados) {
        final p = await rede.listar(
          recorte.queryDaAgenda(quandoDaAba: QuandoDaRede.passados),
        );
        _cidadesConhecidas.addAll(p.cidades);
        itens = <_ItemDaAgenda>[for (final e in p.itens) _ItemDaAgenda(e)];
        (total, pagina) = (p.total, p.pagina);
        efetiva = p.ordemEfetiva.codigo;
      } else {
        if (logado && _temRegiao && recorte.pedeDistancia && recorte.situacao == null) {
          final p = await rede.listarPorPerto(
            recorte.queryPorPerto(
              ordemPorPerto: recorte.ordem == OrdemPorPerto.distancia.codigo
                  ? OrdemPorPerto.distancia
                  : OrdemPorPerto.proximos,
            ),
          );
          for (final i in p.itens) {
            _cidadesConhecidas.add(i.encontro.lugar.cidade);
          }
          itens = <_ItemDaAgenda>[
            for (final i in p.itens)
              _ItemDaAgenda(i.encontro, distancia: i.distanciaEmMetros),
          ];
          (total, pagina) = (p.total, p.pagina);
          efetiva = p.ordemEfetiva.codigo;
        } else {
          final p = await rede.listar(
            recorte.queryDaAgenda(quandoDaAba: QuandoDaRede.aVir),
          );
          _cidadesConhecidas.addAll(p.cidades);
          if (medir) {
            await _garantirMedidas(rede, recorte, <String>[
              for (final e in p.itens)
                if (e is EncontroPublico) e.slug,
            ]);
          }
          itens = <_ItemDaAgenda>[
            for (final e in p.itens)
              _ItemDaAgenda(
                e,
                distancia: medir && e is EncontroPublico ? _medidas[e.slug] : null,
              ),
          ];
          (total, pagina) = (p.total, p.pagina);
          efetiva = p.ordemEfetiva.codigo;
        }
      }

      if (!mounted || geracao != _geracao) return;
      setState(() {
        _itens = maisUma ? <_ItemDaAgenda>[..._itens, ...itens] : itens;
        _total = total;
        _pagina = pagina;
        _ordemEfetiva = efetiva;
        _fase = _Fase.lista;
        _carregandoMais = false;
      });
      _preservacao.marcar(_assinaturaDaListagem);
    } on FalhaDeChamada {
      _falhou(geracao, maisUma: maisUma);
    } on FormatException {
      _falhou(geracao, maisUma: maisUma);
    }
  }

  void _falhou(int geracao, {required bool maisUma}) {
    if (!mounted || geracao != _geracao) return;
    setState(() {
      if (maisUma) {
        _carregandoMais = false;
        _falhaAoCarregarMais = true;
        return;
      }
      _itens = const <_ItemDaAgenda>[];
      _fase = _Fase.falha;
    });
  }

  void _limparMedidas() {
    _medidas.clear();
    _assinaturaDasMedidas = null;
    _paginaDasMedidas = 0;
    _medidasEsgotadas = false;
  }

  Future<void> _garantirMedidas(
    RedeApi rede,
    RecorteDaRede recorte,
    List<String> slugs,
  ) async {
    final r = Escopo.of(context).sessao.usuario?.regiaoDeReferencia;
    final assinatura = recorte.assinaturaDasDistancias(
      regiao: <Object?>[r?.bairro, r?.cidade, r?.uf, r?.cep].join('/'),
    );
    if (assinatura != _assinaturaDasMedidas) {
      _limparMedidas();
      _assinaturaDasMedidas = assinatura;
    }
    for (var rodada = 0; rodada < 3; rodada++) {
      if (_medidasEsgotadas) return;
      if (slugs.every(_medidas.containsKey)) return;
      try {
        final p = await rede.listarPorPerto(
          recorte
              .copiar(pagina: _paginaDasMedidas + 1, semTermo: true)
              .queryPorPerto(ordemPorPerto: OrdemPorPerto.proximos),
        );
        _paginaDasMedidas = p.pagina;
        for (final i in p.itens) {
          _medidas[i.encontro.slug] = i.distanciaEmMetros;
        }
        if (p.itens.isEmpty || p.pagina * p.limite >= p.total) {
          _medidasEsgotadas = true;
        }
      } on FalhaDeChamada {
        return;
      } on FormatException {
        return;
      }
    }
  }

  void _trocarRecorte(RecorteDaRede novo) {
    setState(() => _recorte = novo);
    _carregar();
  }

  bool get _podeMedir =>
      Escopo.of(context).sessao.logado && _temRegiao && _naAgendaDoQueVem;

  bool get _temMais => _itens.length < _total;

  void _tocarNoCartao(_ItemDaAgenda item, {required bool logado}) {
    final slug = item.encontro.slug;
    if (!logado) {
      unawaited(
        mostrarConviteParaEntrar(
          context,
          secao: SecaoComConta.encontroDaRede,
          rotaDeVolta: Rotas.encontroDaRedeDe(slug),
        ),
      );
      return;
    }
    unawaited(
      TelaDoEncontro.abrir(
        context,
        slug,
        distanciaEmMetros: item.distancia,
      ),
    );
  }

  @override
  Widget build(BuildContext context) {
    final sessao = Escopo.of(context).sessao;
    return AnimatedBuilder(
      animation: sessao,
      builder: (context, _) {
        final logado = sessao.logado;
        if (_logadoDaUltimaCarga != null && _logadoDaUltimaCarga != logado) {
          _agendarCarga();
        }
        final busca = _controleDeBusca();
        final filtro = _controleDeFiltro();
        final ordenacao = _controleDeOrdenacao();
        final reforco = widget.reforcoDaSecao;

        return Column(
          crossAxisAlignment: CrossAxisAlignment.stretch,
          children: <Widget>[
            BuscaNoTopoFixo(
              total: _total,
              busca: busca,
              filtro: filtro,
              ordenacao: ordenacao,
              aoAplicar: _aplicarAFolha,
            ),
            if (reforco != null && reforco.isNotEmpty) ...<Widget>[
              Text(
                reforco,
                style: Theme.of(context)
                    .textTheme
                    .bodyLarge
                    ?.copyWith(color: BichuColors.of(context).cores.textSecondary),
              ),
              const SizedBox(height: BichuEspaco.e6),
            ],
            if (_fase != _Fase.carregando) ...<Widget>[
              CaixaDeLocalizacao(
                cidadeEmUso: _cidadeEmUso,
                explicacao: AgendaDaRede.explicacaoSemCidade,
                podeOferecer: _cidadeDoAparelho?.podeOferecer ?? false,
                aviso: _cidadeDoAparelho?.aviso,
                aoUsarLocalizacao: (_cidadeDoAparelho?.procurando ?? true)
                    ? null
                    : _usarMinhaLocalizacao,
              ),
              if (_cidadeEmUso == null &&
                  (_cidadeDoAparelho?.podeOferecer ?? false))
                const SizedBox(height: BichuEspaco.e4),
            ],
            if (_fase != _Fase.carregando)
              BarraDeListagem(
                total: _total,
                substantivo: const SubstantivoDaListagem(
                  singular: 'evento',
                  plural: 'eventos',
                ),
                buscaAcima: true,
                busca: busca,
                filtro: filtro,
                ordenacao: ordenacao,
                aoAplicar: _aplicarAFolha,
              ),
            ..._corpo(logado: logado),
          ],
        );
      },
    );
  }

  ControleDeBusca _controleDeBusca() {
    return ControleDeBusca(
      controlador: _buscaControlador,
      alcance: AlcanceDaBusca.servidor,
      rotulo: 'Buscar evento',
      termoAplicado: _recorte.termoLimpo,
      minimoDeCaracteres: 2,
      aoAplicar: (termo) {
        if (termo == _recorte.termoLimpo) return;
        _trocarRecorte(_recorteCom(termo: termo));
      },
    );
  }

  RecorteDaRede _recorteCom({
    Object? termo = const _Nada(),
    Object? quando = const _Nada(),
    Object? situacao = const _Nada(),
    Object? entrada = const _Nada(),
    Object? cidade = const _Nada(),
    Object? porte = const _Nada(),
    Object? distanciaMaxima = const _Nada(),
    Object? ordem = const _Nada(),
  }) {
    final r = _recorte;
    T? v<T>(Object? novo, T? atual) => novo is _Nada ? atual : novo as T?;
    return RecorteDaRede(
      termo: v<String>(termo, r.termo),
      quando: v<QuandoDaRede>(quando, r.quando),
      situacao: v<SituacaoDoEncontro>(situacao, r.situacao),
      entrada: v<TipoDeEntrada>(entrada, r.entrada),
      cidade: v<String>(cidade, r.cidade),
      porte: v<Porte>(porte, r.porte),
      distanciaMaxima: v<DistanciaMaxima>(distanciaMaxima, r.distanciaMaxima),
      ordem: v<String>(ordem, r.ordem),
    );
  }

  ControleDeFiltro _controleDeFiltro() {
    final r = _recorte;
    final grupos = <GrupoDeFiltro>[];

    {
      grupos.add(
        GrupoDeFiltro(
          chave: 'when',
          titulo: 'Quando',
          selecionado: _quandoEfetivo.codigo,
          codigoPadrao: QuandoDaRede.aVir.codigo,
          opcoes: <OpcaoDeRecorte>[
            OpcaoDeRecorte(
              codigo: QuandoDaRede.aVir.codigo,
              rotulo: QuandoDaRede.aVir.rotulo,
            ),
            OpcaoDeRecorte(
              codigo: QuandoDaRede.passados.codigo,
              rotulo: QuandoDaRede.passados.rotulo,
            ),
            for (final q in QuandoDaRede.subRecortes)
              OpcaoDeRecorte(codigo: q.codigo, rotulo: q.rotulo),
          ],
        ),
      );
      grupos.add(
        GrupoDeFiltro(
          chave: 'status',
          titulo: 'Situação',
          selecionado: r.situacao?.codigo,
          opcoes: <OpcaoDeRecorte>[
            OpcaoDeRecorte(
              codigo: SituacaoDoEncontro.cancelado.codigo,
              rotulo: rotuloDaSituacao(SituacaoDoEncontro.cancelado) ?? 'Cancelado',
            ),
          ],
        ),
      );
      grupos.add(
        GrupoDeFiltro(
          chave: 'admission',
          titulo: 'Valor',
          selecionado: r.entrada?.codigo,
          opcoes: <OpcaoDeRecorte>[
            for (final t in TipoDeEntrada.values)
              OpcaoDeRecorte(codigo: t.codigo, rotulo: t.rotulo),
          ],
        ),
      );
      final cidades = SplayTreeSet<String>.from(_cidadesConhecidas);
      if (r.cidade != null) cidades.add(r.cidade!);
      final emUso = _cidadeEmUso;
      if (emUso != null) cidades.add(emUso);
      grupos.add(
        GrupoDeFiltro(
          chave: 'city',
          titulo: 'Cidade',
          selecionado: emUso,
          opcoes: <OpcaoDeRecorte>[
            for (final c in cidades) OpcaoDeRecorte(codigo: c, rotulo: c),
          ],
        ),
      );
      grupos.add(
        GrupoDeFiltro(
          chave: 'size',
          titulo: 'Porte do cachorro',
          selecionado: r.porte?.valor,
          opcoes: <OpcaoDeRecorte>[
            for (final p in Porte.values)
              OpcaoDeRecorte(codigo: p.valor, rotulo: p.rotulo),
          ],
        ),
      );
      if (_podeMedir) {
        grupos.add(
          GrupoDeFiltro(
            chave: 'max_km',
            titulo: 'Distância',
            selecionado: r.distanciaMaxima?.codigo,
            opcoes: <OpcaoDeRecorte>[
              for (final d in DistanciaMaxima.values)
                OpcaoDeRecorte(codigo: d.codigo, rotulo: d.rotulo),
            ],
          ),
        );
      }
    }

    return ControleDeFiltro(grupos: grupos);
  }

  void _aplicarAFolha(EscolhaDaFolha escolha) {
    final filtros = escolha.filtros;
    Object? v(String chave, Object? Function(String?) de) =>
        filtros.containsKey(chave) ? de(filtros[chave]) : const _Nada();
    Object? cidadeDaFolha = const _Nada();
    if (filtros.containsKey('city')) {
      final escolhida = filtros['city'];
      if (escolhida == _cidadeDoAparelho?.cidade) {
        cidadeDaFolha = null;
      } else {
        cidadeDaFolha = escolhida;
        _folhaDecidiuACidade = true;
      }
    }
    final ordem = escolha.ordem;
    _trocarRecorte(
      _recorteCom(
        quando: v(
          'when',
          (c) => c == QuandoDaRede.aVir.codigo
              ? null
              : QuandoDaRede.porCodigo(c),
        ),
        situacao: v('status', SituacaoDoEncontro.porCodigo),
        entrada: v('admission', TipoDeEntrada.porCodigo),
        cidade: cidadeDaFolha,
        porte: v('size', Porte.de),
        distanciaMaxima: v('max_km', DistanciaMaxima.porCodigo),
        ordem: ordem ?? const _Nada(),
      ),
    );
  }

  ControleDeOrdenacao _controleDeOrdenacao() {
    final opcoes = <OpcaoDeRecorte>[];
    if (_encerrados) {
      opcoes.add(
        OpcaoDeRecorte(
          codigo: OrdemDaRede.recentes.codigo,
          rotulo: OrdemDaRede.recentes.rotulo,
        ),
      );
    } else {
      opcoes.add(
        OpcaoDeRecorte(
          codigo: OrdemDaRede.proximos.codigo,
          rotulo: OrdemDaRede.proximos.rotulo,
        ),
      );
      if (_podeMedir) {
        opcoes.add(
          OpcaoDeRecorte(
            codigo: OrdemPorPerto.distancia.codigo,
            rotulo: OrdemPorPerto.distancia.rotulo,
          ),
        );
      }
    }
    if (!opcoes.any((o) => o.codigo == _ordemEfetiva)) {
      final rotulo = OrdemDaRede.porCodigo(_ordemEfetiva)?.rotulo ??
          OrdemPorPerto.porCodigo(_ordemEfetiva)?.rotulo ??
          _ordemEfetiva;
      opcoes.add(OpcaoDeRecorte(codigo: _ordemEfetiva, rotulo: rotulo));
    }
    final pedida = _recorte.ordem;
    return ControleDeOrdenacao(
      opcoes: opcoes,
      efetiva: _ordemEfetiva,
      porQueNaoEAPedida: pedida != null && pedida != _ordemEfetiva
          ? AgendaDaRede.ordemTrocadaPeloServidor
          : null,
    );
  }

  List<Widget> _corpo({required bool logado}) {
    if (_fase == _Fase.carregando) {
      return <Widget>[
        Semantics(
          label: 'Carregando eventos',
          liveRegion: true,
          child: const Column(
            children: <Widget>[
              _EsqueletoDeEncontro(),
              SizedBox(height: BichuEspaco.e3),
              _EsqueletoDeEncontro(),
            ],
          ),
        ),
      ];
    }

    if (_fase == _Fase.falha) {
      return <Widget>[
        FaixaDeAviso(
          texto: AgendaDaRede.textoDaFalha,
          rotuloDaAcao: AgendaDaRede.rotuloDeAtualizar,
          aoTocarNaAcao: _carregar,
        ),
      ];
    }

    if (_itens.isEmpty) return <Widget>[_vazio()];

    return <Widget>[
      for (var i = 0; i < _itens.length; i++) ...<Widget>[
        if (i > 0) const SizedBox(height: BichuEspaco.e4),
        CartaoDoEncontro(
          encontro: _itens[i].encontro,
          aoTocar: () => _tocarNoCartao(_itens[i], logado: logado),
        ),
      ],
      const SizedBox(height: BichuEspaco.e4),
      _LinhaDaPagina(naTela: _itens.length, total: _total),
      if (_temMais) ...<Widget>[
        const SizedBox(height: BichuEspaco.e3),
        if (_falhaAoCarregarMais) ...<Widget>[
          Text(
            AgendaDaRede.falhaAoCarregarMais,
            style: Theme.of(context).textTheme.bodySmall,
          ),
          const SizedBox(height: BichuEspaco.e2),
        ],
        OutlinedButton(
          onPressed: _carregandoMais ? null : () => _carregar(maisUma: true),
          style: OutlinedButton.styleFrom(
            minimumSize: const Size.fromHeight(BichuAlvoDeToque.min),
          ),
          child: Text(
            _falhaAoCarregarMais
                ? AgendaDaRede.rotuloDeTentar
                : AgendaDaRede.rotuloDeCarregarMais,
          ),
        ),
      ],
    ];
  }

  Widget _vazio() {
    final r = _recorte;
    final filtros = _controleDeFiltro().ativos;
    if (!r.temBusca && filtros == 0) {
      return const EstadoVazio(
        titulo: AgendaDaRede.tituloDoVazio,
        explicacao: AgendaDaRede.explicacaoDoVazio,
      );
    }

    final filtroTexto = filtros == 1 ? 'filtro' : 'filtros';
    final rotulo = r.temBusca && filtros > 0
        ? 'Limpar busca e $filtroTexto'
        : r.temBusca
            ? 'Limpar busca'
            : 'Limpar $filtroTexto';
    final limpar = OutlinedButton(
      onPressed: () {
        if (r.temBusca) _buscaControlador.clear();
        _trocarRecorte(RecorteDaRede(ordem: r.ordem));
      },
      style: OutlinedButton.styleFrom(
        minimumSize: const Size.fromHeight(BichuAlvoDeToque.min),
      ),
      child: Text(rotulo),
    );

    if (!r.temBusca && filtros == 1) {
      if (_encerrados) {
        return EstadoVazio(
          titulo: AgendaDaRede.tituloDoVazioDeEncerrados,
          explicacao: AgendaDaRede.explicacaoDoVazioDeEncerrados,
          acao: limpar,
        );
      }
    }

    return EstadoVazio(
      titulo: r.temBusca
          ? AgendaDaRede.tituloDoVazioComBusca(r.termoLimpo!)
          : AgendaDaRede.tituloDoVazioFiltrado,
      explicacao: AgendaDaRede.explicacaoDoVazioFiltrado,
      acao: limpar,
    );
  }
}

class _Nada {
  const _Nada();
}

class _LinhaDaPagina extends StatelessWidget {
  const _LinhaDaPagina({required this.naTela, required this.total});

  final int naTela;
  final int total;

  @override
  Widget build(BuildContext context) {
    final cores = BichuColors.of(context).cores;
    final textos = Theme.of(context).textTheme;
    return Text(
      'Mostrando 1 a $naTela de $total',
      style: textos.bodySmall?.copyWith(color: cores.textSecondary),
    );
  }
}

class _EsqueletoDeEncontro extends StatelessWidget {
  const _EsqueletoDeEncontro();

  @override
  Widget build(BuildContext context) {
    final cores = BichuColors.of(context).cores;
    return ExcludeSemantics(
      child: AspectRatio(
        aspectRatio: 1,
        child: DecoratedBox(
          decoration: BoxDecoration(
            color: cores.surfaceSunken,
            borderRadius: BorderRadius.circular(BichuRaio.lg),
          ),
        ),
      ),
    );
  }
}
