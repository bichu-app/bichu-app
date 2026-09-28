import 'dart:async';
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

  static const String tituloDoVazio = 'A Rede ainda não tem encontros';
  static const String explicacaoDoVazio =
      'Os encontros da comunidade em praças e parques aparecem aqui assim que '
      'forem marcados.';
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
      'fim, e os privados saem da lista.';
  static const String ordemTrocadaPeloServidor =
      'A ordem escolhida não está disponível agora. A lista usa a ordem '
      'marcada acima.';

  /// "Carregar mais" (ATENCAO: a especificacao nao desenhou a paginacao da
  /// agenda; texto no padrao de 28.2, `Tentar de novo` refaz uma coisa so).
  static const String rotuloDeCarregarMais = 'Carregar mais encontros';
  static const String falhaAoCarregarMais =
      'Não conseguimos carregar mais encontros.';
  static const String rotuloDeTentar = 'Tentar de novo';

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
  String _ordemEfetiva = OrdemDaRede.proximos.codigo;

  /// As distancias ja medidas, por `slug`, DESACOPLADAS da pagina da agenda.
  ///
  /// Elas vem de `listNearbyNetworkEvents` com `sort=proximos` e dependem so
  /// de quais encontros publicos o recorte tem ([RecorteDaRede.
  /// assinaturaDasDistancias]): nao da pagina carregada e nao do termo de
  /// busca. Assim digitar nao repete a pergunta, e "Carregar mais" so pede a
  /// proxima pagina de distancias quando falta medida para um cartao novo.
  final Map<String, int?> _medidas = <String, int?>{};
  String? _assinaturaDasMedidas;
  int _paginaDasMedidas = 0;
  bool _medidasEsgotadas = false;

  bool _carregandoMais = false;
  bool _falhaAoCarregarMais = false;

  /// A espera da busca: a pergunta sai 300 ms depois da ultima tecla. A
  /// agenda tem teto de 300 perguntas por hora (contrato, `x-rate-limit`).
  Timer? _esperaDaBusca;
  static const Duration esperaDaBusca = Duration(milliseconds: 300);

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
    _esperaDaBusca?.cancel();
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

  /// Ha regiao cadastrada no perfil (`Me.reference_area`). Sem ela nao ha
  /// distancia, e a pergunta de distancias nao sai (UX 28.3, decisao 3).
  bool get _temRegiao =>
      Escopo.of(context).sessao.usuario?.regiaoDeReferencia != null;

  /// Carrega a primeira pagina do recorte, ou a seguinte com [maisUma].
  Future<void> _carregar({bool maisUma = false}) async {
    if (!mounted) return;
    final escopo = Escopo.of(context);
    final logado = escopo.sessao.logado;
    if (_logadoDaUltimaCarga != null && _logadoDaUltimaCarga != logado) {
      // Outra conta, outra regiao: as medidas antigas nao valem.
      _limparMedidas();
    }
    _logadoDaUltimaCarga = logado;
    if (!logado && _aba == AbaDaRede.pedidos) _aba = AbaDaRede.proximos;

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
      setState(() => _fase = _Fase.carregando);
    }
    final recorte = _recorte.copiar(pagina: maisUma ? _pagina + 1 : 1);
    final rede = RedeApi(escopo.api);
    final medir = logado &&
        _temRegiao &&
        _aba == AbaDaRede.proximos &&
        !recorte.pedeDistancia &&
        recorte.visibilidade != VisibilidadeDoEncontro.privado;

    try {
      late final List<_ItemDaAgenda> itens;
      late final int total;
      late final int pagina;
      late final String efetiva;

      switch (_aba) {
        case AbaDaRede.pedidos:
          final p = await rede.meusPedidos(recorte.queryDePedidos);
          itens = <_ItemDaAgenda>[
            for (final m in p.itens)
              _ItemDaAgenda(
                m.encontro,
                // Estado desconhecido vira `Pedido enviado`, nunca recusa.
                pedido: m.estado ?? EstadoDoPedido.enviado,
              ),
          ];
          (total, pagina) = (p.total, p.pagina);
          efetiva = OrdemDaRede.proximos.codigo;
        case AbaDaRede.encerrados:
          final p = await rede.listar(
            recorte.queryDaAgenda(quandoDaAba: QuandoDaRede.passados),
          );
          _cidadesConhecidas.addAll(p.cidades);
          itens = <_ItemDaAgenda>[for (final e in p.itens) _ItemDaAgenda(e)];
          (total, pagina) = (p.total, p.pagina);
          efetiva = p.ordemEfetiva.codigo;
        case AbaDaRede.proximos:
          if (logado && _temRegiao && recorte.pedeDistancia) {
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
                  // So publico recebe medida; o teaser nao tem onde por.
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
        // A pagina seguinte falhou: os cartoes que ja estao na tela ficam,
        // porque o recorte deles e o mesmo, e so o fim da lista diz.
        _carregandoMais = false;
        _falhaAoCarregarMais = true;
        return;
      }
      // Os cartoes antigos saem: sob uma faixa de erro eles afirmariam um
      // recorte que a tela nao conseguiu aplicar.
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

  /// Pede paginas de distancias ate cobrir os [slugs] da tela, no maximo
  /// tres por vez. Falha nao derruba a agenda: o cartao sai sem a linha.
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

  bool get _temMais => _itens.length < _total;

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
        _esperaDaBusca?.cancel();
        final limpo = texto.trim();
        // `minLength: 2` no contrato: um caractere so produziria 400.
        if (limpo.isNotEmpty && limpo.length < 2) {
          setState(() {});
          return;
        }
        final termo = limpo.isEmpty ? null : limpo;
        if (termo == _recorte.termoLimpo) return;
        // A pergunta sai 300 ms depois da ultima tecla, e nao a cada tecla.
        _esperaDaBusca = Timer(esperaDaBusca, () {
          if (mounted) _trocarRecorte(_recorteCom(termo: termo));
        });
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
