import 'dart:collection';

import 'package:flutter/material.dart';

import '../../api/falhas.dart';
import '../../api/modelos_pet.dart';
import '../../api/modelos_rede.dart';
import '../../api/rede_api.dart';
import '../../escopo.dart';
import '../../theme/bichu_colors.dart';
import '../../theme/bichu_tokens.g.dart';
import '../../widgets/barra_de_listagem.dart';
import '../../widgets/faixa_de_aviso.dart';
import '../casca_com_abas.dart';
import 'cartao_do_encontro.dart';

/// `Rede`: a agenda dos encontros (design system 24.14 com 24.15 a 24.17,
/// textos da UX 28.7.4).
///
/// ## Tres abas, tres operacoes
///
/// | Aba | Operacao | Ordem |
/// |---|---|---|
/// | `Próximos` | `listNetworkEvents` com `when=upcoming` (ou `today`, `weekend`, `next_30_days`); com `Mais perto` ou `Distância`, `listNearbyNetworkEvents` | `Data mais próxima`; `Mais perto` com regiao |
/// | `Meus pedidos` | `listMyNetworkEventJoinRequests`, so com conta | `Data mais próxima`, unica |
/// | `Encerrados` | `listNetworkEvents` com `when=past` | `Mais recente primeiro`, unica |
///
/// Trocar de aba limpa filtros e ordem, porque cada aba tem os seus. Sem
/// conta, `Meus pedidos` **nao aparece** (nao fica desabilitada): controle sem
/// desfecho.
///
/// ## Busca, filtro e ordem: o componente que ja existe
///
/// [BarraDeListagem], sem copia. Filtros de lista fechada, os do contrato e
/// so eles (`when`, `admission`, `visibility`, `city`, `size`, `max_km`,
/// `state`), cada um so na aba cuja operacao o aceita.
///
/// ## A distancia e da regiao cadastrada, e nunca do GPS
///
/// Com conta, `Próximos` faz duas perguntas em paralelo: a agenda publica (que
/// tem o teaser do privado) e `listNearbyNetworkEvents` com `sort=proximos`
/// (APP-2 da matriz de rastreabilidade), so para ler `distance_m` de cada
/// encontro publico. **Nenhuma coordenada sai do aparelho**: o servidor usa a
/// regiao ja gravada. Se a segunda pergunta falhar, a agenda sai igual, sem a
/// linha de distancia (UX 28.3, decisao 3: a distancia nao atrasa nem derruba
/// a tela). `Mais perto` e o filtro `Distância` so aparecem depois que a
/// resposta mostrou que ha regiao cadastrada, e somem sem aviso quando nao ha.
///
/// ## A situacao vem do servidor
///
/// O cancelado fica em `Próximos` ate o fim previsto, com o selo `Cancelado`
/// (ADR-0027 12.6). Esta tela nao recalcula nada.
class AgendaDaRede extends StatefulWidget {
  const AgendaDaRede({super.key});

  static const String tituloDoVazio = 'A Rede ainda não tem encontro';
  static const String explicacaoDoVazio =
      'Os encontros da comunidade em praças e parques vão aparecer nesta '
      'agenda. Quando o primeiro for marcado, ele fica aqui.';
  static const String tituloDoVazioDePedidos = 'Nenhum pedido ainda';
  static const String explicacaoDoVazioDePedidos =
      'Quando você pedir para participar de um encontro privado, ele aparece '
      'aqui.';
  static const String tituloDoVazioDeEncerrados = 'Nenhum encontro encerrado';
  static const String explicacaoDoVazioDeEncerrados =
      'Os encontros que já aconteceram ficam aqui.';
  static const String tituloDoVazioFiltrado =
      'Nenhum encontro com esses filtros';
  static const String explicacaoDoVazioFiltrado =
      'Tente outra palavra, outro período ou menos filtros.';
  static const String textoDaFalha =
      'Não conseguimos carregar os encontros agora.';
  static const String rotuloDeAtualizar = 'Atualizar';
  static const String exemploDaBusca = 'passeio, praça, Pinheiros';
  static const String notaDasCidades =
      'As cidades abaixo são as que já apareceram na agenda. O filtro procura '
      'na base inteira.';
  static const String notaDaDistancia =
      'Calculada a partir da região do seu perfil. Só entram os encontros '
      'públicos que têm mapa.';
  static const String notaDeMaisPerto =
      'Mais perto usa a região do seu perfil. Os encontros sem mapa ficam no '
      'fim, e os privados não aparecem nesta ordem.';
  static const String ordemTrocadaPeloServidor =
      'O servidor devolveu a agenda em outra ordem. A lista está na ordem '
      'mostrada acima.';

  static String tituloDoVazioComBusca(String termo) =>
      'Nenhum encontro com “$termo”';

  @override
  State<AgendaDaRede> createState() => _AgendaDaRedeState();
}

enum AbaDaRede {
  proximos('Próximos'),
  pedidos('Meus pedidos'),
  encerrados('Encerrados');

  const AbaDaRede(this.rotulo);
  final String rotulo;
}

/// Um cartao da lista: o encontro e o que so a lista sabe dele.
class _ItemDaAgenda {
  const _ItemDaAgenda(this.encontro, {this.distancia, this.pedido});
  final EncontroDaRede encontro;
  final int? distancia;
  final EstadoDoPedido? pedido;
}

enum _Fase { carregando, lista, falha }

class _AgendaDaRedeState extends State<AgendaDaRede>
    with TickerProviderStateMixin {
  AbaDaRede _aba = AbaDaRede.proximos;
  RecorteDaRede _recorte = const RecorteDaRede();
  _Fase _fase = _Fase.carregando;

  List<_ItemDaAgenda> _itens = const <_ItemDaAgenda>[];
  int _total = 0;
  int _pagina = 1;
  int _limite = 20;
  String _ordemEfetiva = OrdemDaRede.proximos.codigo;

  /// Visto numa resposta desta tela: ha regiao cadastrada. Fica ligado ate a
  /// sessao mudar, para o filtro de distancia nao sumir justamente depois de
  /// esvaziar a lista.
  bool _temRegiao = false;
  bool? _logadoDaUltimaCarga;

  final SplayTreeSet<String> _cidadesConhecidas = SplayTreeSet<String>();
  final TextEditingController _buscaControlador = TextEditingController();
  TabController? _abas;

  bool _visivel = false;
  bool _cargaAgendada = false;

  /// Cada carga ganha um numero; resposta de carga velha e descartada.
  int _geracao = 0;

  @override
  void dispose() {
    _buscaControlador.dispose();
    _abas?.dispose();
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
    _agendarCarga();
  }

  void _agendarCarga() {
    if (_cargaAgendada) return;
    _cargaAgendada = true;
    WidgetsBinding.instance.addPostFrameCallback((_) {
      _cargaAgendada = false;
      if (mounted) _carregar();
    });
  }

  List<AbaDaRede> _abasVisiveis(bool logado) => <AbaDaRede>[
        AbaDaRede.proximos,
        if (logado) AbaDaRede.pedidos,
        AbaDaRede.encerrados,
      ];

  /// O `TabController` acompanha quantas abas existem (duas sem conta, tres
  /// com), e e refeito quando isso muda.
  TabController _controladorDasAbas(List<AbaDaRede> abas) {
    final atual = _abas;
    final indice = abas.indexOf(_aba).clamp(0, abas.length - 1);
    if (atual != null && atual.length == abas.length) {
      if (atual.index != indice) atual.index = indice;
      return atual;
    }
    atual?.dispose();
    final novo = TabController(length: abas.length, vsync: this, initialIndex: indice);
    _abas = novo;
    return novo;
  }

  Future<void> _carregar() async {
    if (!mounted) return;
    final geracao = ++_geracao;
    final escopo = Escopo.of(context);
    final logado = escopo.sessao.logado;
    if (_logadoDaUltimaCarga != null && _logadoDaUltimaCarga != logado) {
      _temRegiao = false;
    }
    _logadoDaUltimaCarga = logado;
    if (!logado && _aba == AbaDaRede.pedidos) _aba = AbaDaRede.proximos;

    setState(() => _fase = _Fase.carregando);
    final rede = RedeApi(escopo.api);

    try {
      late final List<_ItemDaAgenda> itens;
      late final int total;
      late final int pagina;
      late final int limite;
      late final String efetiva;

      switch (_aba) {
        case AbaDaRede.pedidos:
          final p = await rede.meusPedidos(_recorte.queryDePedidos);
          itens = <_ItemDaAgenda>[
            for (final m in p.itens)
              _ItemDaAgenda(
                m.encontro,
                // Estado desconhecido vira `Pedido enviado`, nunca recusa.
                pedido: m.estado ?? EstadoDoPedido.enviado,
              ),
          ];
          (total, pagina, limite) = (p.total, p.pagina, p.limite);
          efetiva = OrdemDaRede.proximos.codigo;
        case AbaDaRede.encerrados:
          final p = await rede.listar(
            _recorte.queryDaAgenda(quandoDaAba: QuandoDaRede.passados),
          );
          _cidadesConhecidas.addAll(p.cidades);
          itens = <_ItemDaAgenda>[for (final e in p.itens) _ItemDaAgenda(e)];
          (total, pagina, limite) = (p.total, p.pagina, p.limite);
          efetiva = p.ordemEfetiva.codigo;
        case AbaDaRede.proximos:
          if (logado && _recorte.pedeDistancia) {
            final p = await rede.listarPorPerto(
              _recorte.queryPorPerto(
                ordemPorPerto: _recorte.ordem == OrdemPorPerto.distancia.codigo
                    ? OrdemPorPerto.distancia
                    : OrdemPorPerto.proximos,
              ),
            );
            _temRegiao = _temRegiao || p.temRegiao;
            for (final i in p.itens) {
              _cidadesConhecidas.add(i.encontro.lugar.cidade);
            }
            itens = <_ItemDaAgenda>[
              for (final i in p.itens)
                _ItemDaAgenda(i.encontro, distancia: i.distanciaEmMetros),
            ];
            (total, pagina, limite) = (p.total, p.pagina, p.limite);
            efetiva = p.ordemEfetiva.codigo;
          } else {
            final lista = rede.listar(
              _recorte.queryDaAgenda(quandoDaAba: QuandoDaRede.aVir),
            );
            final distancias = logado &&
                    _recorte.visibilidade != VisibilidadeDoEncontro.privado
                ? _distancias(rede)
                : Future<PaginaPorPerto?>.value();
            final p = await lista;
            final porPerto = await distancias;
            if (porPerto != null) _temRegiao = _temRegiao || porPerto.temRegiao;
            final medidas = porPerto?.distanciasPorSlug ?? const <String, int>{};
            _cidadesConhecidas.addAll(p.cidades);
            itens = <_ItemDaAgenda>[
              for (final e in p.itens)
                _ItemDaAgenda(
                  e,
                  // So publico recebe medida; o teaser nao tem onde por.
                  distancia: e is EncontroPublico ? medidas[e.slug] : null,
                ),
            ];
            (total, pagina, limite) = (p.total, p.pagina, p.limite);
            efetiva = p.ordemEfetiva.codigo;
          }
      }

      if (!mounted || geracao != _geracao) return;
      setState(() {
        _itens = itens;
        _total = total;
        _pagina = pagina;
        _limite = limite;
        _ordemEfetiva = efetiva;
        _fase = _Fase.lista;
      });
    } on FalhaDeChamada {
      if (!mounted || geracao != _geracao) return;
      setState(() {
        // Os cartoes antigos saem: sob uma faixa de erro eles afirmariam um
        // recorte que a tela nao conseguiu aplicar.
        _itens = const <_ItemDaAgenda>[];
        _fase = _Fase.falha;
      });
    } on FormatException {
      if (!mounted || geracao != _geracao) return;
      setState(() {
        _itens = const <_ItemDaAgenda>[];
        _fase = _Fase.falha;
      });
    }
  }

  /// A segunda pergunta de `Próximos`: so as distancias. Falha vira nulo, e
  /// a agenda sai sem a linha.
  Future<PaginaPorPerto?> _distancias(RedeApi rede) async {
    try {
      return await rede.listarPorPerto(
        _recorte.queryPorPerto(ordemPorPerto: OrdemPorPerto.proximos),
      );
    } on FalhaDeChamada {
      return null;
    } on FormatException {
      return null;
    }
  }

  void _trocarRecorte(RecorteDaRede novo) {
    setState(() => _recorte = novo);
    _carregar();
  }

  void _trocarAba(AbaDaRede aba) {
    if (aba == _aba) return;
    setState(() {
      _aba = aba;
      // Filtros e ordem sao de cada aba; a busca vale para as tres.
      _recorte = RecorteDaRede(termo: _recorte.termo);
    });
    _carregar();
  }

  bool get _podeMedir =>
      Escopo.of(context).sessao.logado && _temRegiao && _aba == AbaDaRede.proximos;

  @override
  Widget build(BuildContext context) {
    final sessao = Escopo.of(context).sessao;
    return AnimatedBuilder(
      animation: sessao,
      builder: (context, _) {
        final logado = sessao.logado;
        if (_logadoDaUltimaCarga != null && _logadoDaUltimaCarga != logado) {
          // Entrou ou saiu com a agenda aberta: recarrega na aba certa.
          _agendarCarga();
        }
        final abas = _abasVisiveis(logado);
        if (!abas.contains(_aba)) _aba = AbaDaRede.proximos;
        final controlador = _controladorDasAbas(abas);

        return Column(
          crossAxisAlignment: CrossAxisAlignment.stretch,
          children: <Widget>[
            TabBar(
              controller: controlador,
              onTap: (i) => _trocarAba(abas[i]),
              tabs: <Widget>[
                for (final a in abas)
                  Tab(height: BichuAlvoDeToque.min, text: a.rotulo),
              ],
            ),
            const SizedBox(height: BichuEspaco.e4),
            if (_fase != _Fase.carregando)
              BarraDeListagem(
                total: _total,
                substantivo: _aba == AbaDaRede.pedidos
                    ? const SubstantivoDaListagem(
                        singular: 'pedido',
                        plural: 'pedidos',
                      )
                    : const SubstantivoDaListagem(
                        singular: 'encontro',
                        plural: 'encontros',
                      ),
                busca: _controleDeBusca(),
                filtro: _controleDeFiltro(),
                ordenacao: _controleDeOrdenacao(),
              ),
            ..._corpo(),
          ],
        );
      },
    );
  }

  ControleDeBusca _controleDeBusca() {
    return ControleDeBusca(
      controlador: _buscaControlador,
      alcance: AlcanceDaBusca.servidor,
      exemplo: AgendaDaRede.exemploDaBusca,
      rotulo: 'Buscar encontro',
      aoMudar: (texto) {
        final limpo = texto.trim();
        // `minLength: 2` no contrato: um caractere so produziria 400.
        if (limpo.isNotEmpty && limpo.length < 2) {
          setState(() {});
          return;
        }
        _trocarRecorte(_recorteCom(termo: limpo.isEmpty ? null : limpo));
      },
    );
  }

  /// Copia o recorte trocando so o que foi passado. `_Nada` marca "nao
  /// mexer", para `null` poder significar "limpar".
  RecorteDaRede _recorteCom({
    Object? termo = const _Nada(),
    Object? quando = const _Nada(),
    Object? entrada = const _Nada(),
    Object? visibilidade = const _Nada(),
    Object? cidade = const _Nada(),
    Object? porte = const _Nada(),
    Object? distanciaMaxima = const _Nada(),
    Object? ordem = const _Nada(),
    Object? estadoDoPedido = const _Nada(),
  }) {
    final r = _recorte;
    T? v<T>(Object? novo, T? atual) => novo is _Nada ? atual : novo as T?;
    return RecorteDaRede(
      termo: v<String>(termo, r.termo),
      quando: v<QuandoDaRede>(quando, r.quando),
      entrada: v<TipoDeEntrada>(entrada, r.entrada),
      visibilidade: v<VisibilidadeDoEncontro>(visibilidade, r.visibilidade),
      cidade: v<String>(cidade, r.cidade),
      porte: v<Porte>(porte, r.porte),
      distanciaMaxima: v<DistanciaMaxima>(distanciaMaxima, r.distanciaMaxima),
      ordem: v<String>(ordem, r.ordem),
      estadoDoPedido: v<EstadoDoPedido>(estadoDoPedido, r.estadoDoPedido),
    );
  }

  ControleDeFiltro _controleDeFiltro() {
    final r = _recorte;
    final grupos = <GrupoDeFiltro>[];

    if (_aba == AbaDaRede.pedidos) {
      // `listMyNetworkEventJoinRequests` nao aceita `admission`, `size` nem
      // distancia: filtrar por valor oculto entregaria o valor.
      grupos.add(
        GrupoDeFiltro(
          chave: 'state',
          titulo: 'Situação do pedido',
          selecionado: r.estadoDoPedido?.codigo,
          opcoes: <OpcaoDeRecorte>[
            for (final e in EstadoDoPedido.doFiltro)
              OpcaoDeRecorte(
                codigo: e.codigo,
                rotulo: e == EstadoDoPedido.enviado ? 'Enviado' : 'Aprovado',
              ),
          ],
        ),
      );
    } else {
      if (_aba == AbaDaRede.proximos) {
        grupos.add(
          GrupoDeFiltro(
            chave: 'when',
            titulo: 'Quando',
            selecionado: r.quando?.codigo,
            opcoes: <OpcaoDeRecorte>[
              for (final q in QuandoDaRede.subRecortes)
                OpcaoDeRecorte(codigo: q.codigo, rotulo: q.rotulo),
            ],
          ),
        );
      }
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
      // Com a lista vindo de `listNearbyNetworkEvents` (so publicos), o grupo
      // de visibilidade nao tem desfecho, e nao aparece.
      if (!r.pedeDistancia) {
        grupos.add(
          GrupoDeFiltro(
            chave: 'visibility',
            titulo: 'Público ou privado',
            selecionado: r.visibilidade?.codigo,
            opcoes: <OpcaoDeRecorte>[
              for (final v in VisibilidadeDoEncontro.values)
                OpcaoDeRecorte(codigo: v.codigo, rotulo: v.rotulo),
            ],
          ),
        );
      }
      final cidades = SplayTreeSet<String>.from(_cidadesConhecidas);
      if (r.cidade != null) cidades.add(r.cidade!);
      grupos.add(
        GrupoDeFiltro(
          chave: 'city',
          titulo: 'Cidade',
          nota: AgendaDaRede.notaDasCidades,
          selecionado: r.cidade,
          opcoes: <OpcaoDeRecorte>[
            for (final c in cidades) OpcaoDeRecorte(codigo: c, rotulo: c),
          ],
        ),
      );
      grupos.add(
        GrupoDeFiltro(
          chave: 'size',
          titulo: 'Porte do cão',
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
            nota: AgendaDaRede.notaDaDistancia,
            selecionado: r.distanciaMaxima?.codigo,
            opcoes: <OpcaoDeRecorte>[
              for (final d in DistanciaMaxima.values)
                OpcaoDeRecorte(codigo: d.codigo, rotulo: d.rotulo),
            ],
          ),
        );
      }
    }

    return ControleDeFiltro(
      grupos: grupos,
      aoEscolher: (chave, codigo) {
        Navigator.of(context).pop();
        _trocarRecorte(switch (chave) {
          'state' => _recorteCom(estadoDoPedido: EstadoDoPedido.porCodigo(codigo)),
          'when' => _recorteCom(quando: QuandoDaRede.porCodigo(codigo)),
          'admission' => _recorteCom(entrada: TipoDeEntrada.porCodigo(codigo)),
          'visibility' =>
            _recorteCom(visibilidade: VisibilidadeDoEncontro.porCodigo(codigo)),
          'city' => _recorteCom(cidade: codigo),
          'size' => _recorteCom(porte: Porte.de(codigo)),
          'max_km' => _recorteCom(
              distanciaMaxima: DistanciaMaxima.porCodigo(codigo),
              // Lista so de publicos: o filtro de visibilidade sai junto.
              visibilidade: codigo == null ? const _Nada() : null,
            ),
          _ => _recorte,
        });
      },
      aoLimpar: () {
        Navigator.of(context).pop();
        _trocarRecorte(RecorteDaRede(termo: _recorte.termo, ordem: _recorte.ordem));
      },
    );
  }

  ControleDeOrdenacao _controleDeOrdenacao() {
    final opcoes = <OpcaoDeRecorte>[];
    switch (_aba) {
      case AbaDaRede.proximos:
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
      case AbaDaRede.pedidos:
        opcoes.add(
          OpcaoDeRecorte(
            codigo: OrdemDaRede.proximos.codigo,
            rotulo: OrdemDaRede.proximos.rotulo,
          ),
        );
      case AbaDaRede.encerrados:
        opcoes.add(
          OpcaoDeRecorte(
            codigo: OrdemDaRede.recentes.codigo,
            rotulo: OrdemDaRede.recentes.rotulo,
          ),
        );
    }
    // A barra mostra a ordem REAL. Se o servidor devolveu uma que a aba nao
    // oferece, ela entra na lista em vez de a barra mentir.
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
      nota: _podeMedir ? AgendaDaRede.notaDeMaisPerto : null,
      porQueNaoEAPedida: pedida != null && pedida != _ordemEfetiva
          ? AgendaDaRede.ordemTrocadaPeloServidor
          : null,
      aoEscolher: (codigo) {
        final distancia = codigo == OrdemPorPerto.distancia.codigo;
        _trocarRecorte(
          _recorteCom(
            ordem: codigo,
            visibilidade: distancia ? null : const _Nada(),
          ),
        );
      },
    );
  }

  List<Widget> _corpo() {
    if (_fase == _Fase.carregando) {
      return <Widget>[
        Semantics(
          label: 'Carregando encontros',
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
          distanciaEmMetros: _itens[i].distancia,
          estadoDoPedido: _itens[i].pedido,
        ),
      ],
      const SizedBox(height: BichuEspaco.e4),
      _LinhaDaPagina(
        pagina: _pagina,
        limite: _limite,
        naPagina: _itens.length,
        total: _total,
      ),
    ];
  }

  Widget _vazio() {
    final r = _recorte;
    final filtros = r.quantidadeDeFiltros;
    if (!r.temBusca && filtros == 0) {
      return switch (_aba) {
        AbaDaRede.proximos => const EstadoVazio(
            titulo: AgendaDaRede.tituloDoVazio,
            explicacao: AgendaDaRede.explicacaoDoVazio,
          ),
        AbaDaRede.pedidos => const EstadoVazio(
            titulo: AgendaDaRede.tituloDoVazioDePedidos,
            explicacao: AgendaDaRede.explicacaoDoVazioDePedidos,
          ),
        AbaDaRede.encerrados => const EstadoVazio(
            titulo: AgendaDaRede.tituloDoVazioDeEncerrados,
            explicacao: AgendaDaRede.explicacaoDoVazioDeEncerrados,
          ),
      };
    }
    final filtroTexto = filtros == 1 ? 'filtro' : 'filtros';
    final rotulo = r.temBusca && filtros > 0
        ? 'Limpar busca e $filtroTexto'
        : r.temBusca
            ? 'Limpar busca'
            : 'Limpar $filtroTexto';
    return EstadoVazio(
      titulo: r.temBusca
          ? AgendaDaRede.tituloDoVazioComBusca(r.termoLimpo!)
          : AgendaDaRede.tituloDoVazioFiltrado,
      explicacao: AgendaDaRede.explicacaoDoVazioFiltrado,
      acao: OutlinedButton(
        onPressed: () {
          if (r.temBusca) _buscaControlador.clear();
          _trocarRecorte(RecorteDaRede(ordem: r.ordem));
        },
        style: OutlinedButton.styleFrom(
          minimumSize: const Size.fromHeight(BichuAlvoDeToque.min),
        ),
        child: Text(rotulo),
      ),
    );
  }
}

class _Nada {
  const _Nada();
}

class _LinhaDaPagina extends StatelessWidget {
  const _LinhaDaPagina({
    required this.pagina,
    required this.limite,
    required this.naPagina,
    required this.total,
  });

  final int pagina;
  final int limite;
  final int naPagina;
  final int total;

  @override
  Widget build(BuildContext context) {
    final cores = BichuColors.of(context).cores;
    final textos = Theme.of(context).textTheme;
    final primeiro = (pagina - 1) * limite + 1;
    final ultimo = primeiro + naPagina - 1;
    return Text(
      'Mostrando $primeiro a $ultimo de $total',
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
