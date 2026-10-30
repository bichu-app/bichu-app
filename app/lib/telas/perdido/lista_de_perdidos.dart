import '../../widgets/arrastar_para_atualizar.dart';
import 'dart:async';

import 'package:flutter/material.dart';
import 'package:go_router/go_router.dart';

import '../../api/falhas.dart';
import '../../api/modelos.dart';
import '../../api/modelos_perdido.dart';
import '../../api/contadores_api.dart';
import '../../api/modelos_pet.dart';
import '../../api/perdidos_api.dart';
import '../../escopo.dart';
import '../../dispositivo/localizacao.dart';
import '../../roteamento/rotas.dart';
import '../../sessao/localizacao_da_sessao.dart';
import '../../sessao/cidade_escolhida.dart';
import '../../theme/bichu_colors.dart';
import '../../theme/bichu_tokens.g.dart';
import '../../widgets/barra_de_listagem.dart';
import '../../widgets/faixa_de_aviso.dart';
import '../../widgets/moldura.dart';
import '../../widgets/listagem_preservada.dart';
import '../../widgets/rodape_da_paginacao.dart';
import 'cartao_do_perdido.dart';

/// O corpo da seção `Pets`: **a listagem pública dos pets perdidos da região.**
class ListaDePerdidos extends StatefulWidget {
  const ListaDePerdidos({super.key});

  /// Uma linha, e só uma, em cada estado em que a lista não tem o que mostrar.
  static const String vazio = 'Nenhum pet perdido agora.';
  static const String vazioFiltrado = 'Nenhum pet perdido com esse recorte.';

  /// As frases de [_LinhaDoRecorte].
  static const String origemDoAparelho = 'da sua localização';
  static const String origemDaRegiao = 'da sua região cadastrada';
  static const String origemDaUltimaBusca = 'da sua última busca';
  static const String semRecorteGeografico = 'Pets perdidos de todo o Brasil';
  static const String rotuloDeVerTodas = 'Ver todas';
  static const String rotuloDeUsarLocalizacao = 'Usar minha localização';

  /// O rótulo do campo de cidade, que é também o nome acessível dele.
  static const String rotuloDaCidade = 'Cidade';
  static const String exemploDaCidade = 'São Paulo';

  /// A única linha que o campo mostra além do rótulo, e só quando o valor não
  /// serve.
  static const String validacaoDaCidade =
      'Escreva o nome da cidade, com dois caracteres ou mais.';

  static const String falha = 'Não foi possível carregar os pets perdidos agora.';
  static const String rotuloDeTentar = 'Tentar de novo';

  /// 1. A localização não está liberada para este app.
  static const String avisoSemPermissao =
      'A localização não está liberada para o Bichu. Dá para liberar nos '
      'ajustes do aparelho, ou escolher a cidade no filtro.';

  /// 2. A permissão existe e o serviço do aparelho está desligado.
  static const String avisoServicoDesligado =
      'A localização do aparelho está desligada. Dá para ligar nos ajustes, '
      'ou escolher a cidade no filtro.';

  /// 3. Veio coordenada e não veio nome de cidade.
  static const String avisoCidadeNaoDescoberta =
      'Não deu para descobrir sua cidade agora. Dá para tentar de novo, ou '
      'escolher a cidade no filtro.';

  /// 5. VEIO O PONTO, NÃO VEIO O NOME — e a reserva já está na tela.
  static const String avisoCidadeSemNome =
      'Achamos onde você está, mas não deu para nomear sua cidade. A lista '
      'abaixo é do Brasil todo — escolha a cidade no filtro para recortar.';

  /// O CÓDIGO DO MOTIVO, colado no fim da faixa.
  static String comCodigo(String frase, String codigo, String? detalhe) =>
      detalhe == null || detalhe.isEmpty
          ? '$frase · cód. $codigo'
          : '$frase · cód. $codigo ($detalhe)';

  /// 4. A localização FUNCIONOU, e a cidade não tem pet perdido.
  static String avisoSemPetsNaCidade(String cidade) =>
      'A localização funcionou: você está em $cidade. Não há nenhum pet '
      'perdido cadastrado aí agora.';

  /// O que a pessoa lê ENQUANTO o aparelho mede.
  static const String avisoProcurando = 'Procurando sua localização…';

  /// As duas saídas das faixas.
  static const String rotuloDeAbrirAjustes = 'Abrir os ajustes';
  static const String rotuloDeTentarALocalizacao = 'Tentar a localização de novo';

  static const String rotuloDaBusca = 'Buscar pet perdido';
  static const String dicaDaBusca = 'Buscar pelo nome do pet';

  /// A frase do fim da lista.
  static String fimDaLista(int total) =>
      total == 1 ? 'Um pet perdido.' : '$total pets perdidos.';

  @override
  State<ListaDePerdidos> createState() => _EstadoDaListaDePerdidos();
}

/// **`semCidade` SAIU em 19/10/2026.** Ela era a fase em que a tela não tinha o
/// que mostrar porque ninguém havia digitado uma cidade, e a cidade deixou de
/// ser obrigatória: não há mais pergunta a fazer antes de listar.
enum _Fase { carregando, lista, falha }

/// O RECORTE COM QUE A PÁGINA ABRE: **`case_state=open`, só os perdidos.**
const RecorteDePerdidos _recorteDeAbertura = RecorteDePerdidos(
  estado: EstadoDoCasoNaLista.aberto,
);

/// De onde veio a cidade que esta valendo.
enum _OrigemDaCidade {
  /// A pessoa digitou (ou apagou) na folha de filtro.
  escolhida,

  /// Resolvida pelo aparelho, com permissao concedida.
  aparelho,

  /// `Me.reference_area.city`, a cidade que a pessoa informou no perfil.
  regiao,

  /// A ultima cidade que valeu neste aparelho (`CidadeEscolhida`).
  ultimaBusca,

  /// Nenhuma: os 20 mais recentes do pais inteiro.
  nenhuma,
}

/// O QUE O TOQUE EM `Usar minha localização` DEIXOU NA TELA.
enum _AvisoDaLocalizacao {
  /// O aparelho está medindo.
  procurando,

  /// A localização não está liberada para este app.
  semPermissao,

  /// A permissão existe e o serviço do aparelho está desligado.
  servicoDesligado,

  /// A resolução falhou, e falhou de um jeito que pode ser tentado de novo.
  cidadeNaoDescoberta,

  /// Veio coordenada e não veio nome de cidade.
  cidadeSemNome,

  /// Deu certo, e a cidade não tem caso aberto.
  semPetsNaCidade,
}

class _EstadoDaListaDePerdidos extends State<ListaDePerdidos>
    with PublicaAAtualizacao {
  /// A BUSCA QUE O ARRASTO REFAZ (cliente, 18/10/2026).
  @override
  Future<void> aoArrastarParaAtualizar() => _carregar();

  _Fase _fase = _Fase.carregando;

  List<PerdidoPublico> _itens = const <PerdidoPublico>[];

  /// O ESTADO QUE ATRAVESSA A IDA E VOLTA (BICHUS-316).
  final PreservacaoDaListagem _preservacao =
      PreservacaoDaListagem(teto: tetoDeItensPreservados);

  /// A pergunta que os cartoes na tela respondem.
  String get _assinaturaDaListagem => assinaturaDaListagem(
        pergunta: _recorte?.query ?? const <String, String>{},
        referencia: _referenciaDaConta,
      );

  /// A localizacao de referencia da conta: `Me.reference_area`, que recorta
  /// esta lista pela cidade.
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

  RecorteDePerdidos? _recorte;

  /// A PESSOA mexeu no campo de cidade.
  bool _pessoaMexeu = false;

  /// A cidade que a pessoa escolheu.
  String? _cidadeDigitada;

  /// A cidade resolvida pelo aparelho, quando deu.
  String? _cidadeDoAparelho;

  /// A última cidade que ficou valendo **neste aparelho**, lida de
  /// [CidadeEscolhida].
  String? _cidadeDaUltimaBusca;

  /// A leitura do depósito já foi PEDIDA.
  bool _pediuODeposito = false;

  /// A resolução já foi PEDIDA nesta montagem.
  bool _pediuAResolucao = false;

  /// A permissão de localização, como a porta a vê.
  PermissaoDeLocalizacao? _permissao;

  /// O que o último TOQUE em `Usar minha localização` deixou na tela.
  _AvisoDaLocalizacao? _aviso;

  /// A cidade que [_AvisoDaLocalizacao.semPetsNaCidade] nomeia.
  String? _cidadeDoAviso;

  /// O CÓDIGO do motivo do último aviso, e o detalhe que a plataforma deu.
  String? _codigoDoAviso;
  String? _detalheDoAviso;

  bool _carregandoMais = false;
  bool _falhaAoCarregarMais = false;

  final TextEditingController _buscaControlador = TextEditingController();

  /// Cada carga ganha um número; resposta de carga velha é descartada.
  int _geracao = 0;

  bool _visivel = false;
  bool _cargaAgendada = false;

  /// O instante de referência das frases relativas dos cartões, fixado **por
  /// carga** e não lido a cada pintura: um `DateTime.now()` dentro do `build`
  /// faria dois cartões da mesma lista discordarem sobre o que é "hoje" na
  /// virada da meia-noite.
  DateTime _agora = DateTime.now();

  @override
  void dispose() {
    _buscaControlador.dispose();
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
    if (_preservacao.vale(
      itens: _itens.length,
      assinatura: _assinaturaDaListagem,
    )) {
      return;
    }
    _agendarCarga();
  }

  void _agendarCarga() {
    if (_cargaAgendada) return;
    _cargaAgendada = true;
    WidgetsBinding.instance.addPostFrameCallback((_) {
      _cargaAgendada = false;
      if (!mounted) return;
      _carregar();
      if (!_pediuODeposito) {
        _pediuODeposito = true;
        unawaited(_lerODeposito());
      }
      if (!_pediuAResolucao) {
        _pediuAResolucao = true;
        unawaited(_resolverACidade());
      }
    });
  }

  /// A cidade que vale agora.
  String? get _cidadeEmUso => _pessoaMexeu
      ? _cidadeDigitada
      : (_cidadeDoAparelho ?? _cidadeDaRegiao ?? _cidadeDaUltimaBusca);

  /// De onde a cidade que está valendo veio.
  _OrigemDaCidade get _origemDaCidade {
    if (_cidadeEmUso == null) return _OrigemDaCidade.nenhuma;
    if (_pessoaMexeu) return _OrigemDaCidade.escolhida;
    if (_cidadeDoAparelho != null) return _OrigemDaCidade.aparelho;
    if (_cidadeDaRegiao != null) return _OrigemDaCidade.regiao;
    return _OrigemDaCidade.ultimaBusca;
  }

  /// A cidade da região cadastrada: a **segunda** reserva da cadeia.
  String? get _cidadeDaRegiao {
    final c = _regiao?.cidade?.trim();
    return (c == null || c.isEmpty) ? null : c;
  }

  /// Onde a última cidade fica guardada **neste aparelho**.
  CidadeEscolhida get _cidadeGuardada => Escopo.of(context).cidadeEscolhida;

  /// Lê a última cidade guardada neste aparelho, **sem a tela esperar**.
  Future<void> _lerODeposito() async {
    final guardada = await _cidadeGuardada.ler();
    if (!mounted || guardada == null) return;
    if (_pessoaMexeu ||
        _cidadeDoAparelho != null ||
        _cidadeDaRegiao != null) {
      return;
    }
    setState(() => _cidadeDaUltimaBusca = guardada);
    await _carregar();
  }

  /// Resolve a cidade pelo aparelho, **sem a tela esperar**.
  Future<void> _resolverACidade() async {
    final sessao = Escopo.of(context).localizacaoDaSessao;
    final permissao = await sessao.estado();
    if (!mounted) return;
    setState(() => _permissao = permissao);
    if (permissao != PermissaoDeLocalizacao.concedida) return;
    await _resolverEAplicar(sessao, porToque: false);
  }

  /// O caminho do TOQUE: pede a permissão e, concedida, resolve.
  Future<void> _pedirEResolver() async {
    if (_aviso == _AvisoDaLocalizacao.procurando) return;
    final sessao = Escopo.of(context).localizacaoDaSessao;
    setState(() {
      _codigoDoAviso = null;
      _detalheDoAviso = null;
      _aviso = _AvisoDaLocalizacao.procurando;
    });
    final antes = await sessao.estado();
    if (!mounted) return;
    if (antes == PermissaoDeLocalizacao.negadaPermanentemente) {
      setState(() {
        _permissao = antes;
        _codigoDoAviso = MotivoDeNaoTerCidade.permissaoNegadaPermanentemente
            .codigo;
        _aviso = _AvisoDaLocalizacao.semPermissao;
      });
      await sessao.abrirAjustesDoSistema();
      return;
    }
    final depois = await sessao.pedir();
    if (!mounted) return;
    setState(() => _permissao = depois);
    switch (depois) {
      case PermissaoDeLocalizacao.negada:
      case PermissaoDeLocalizacao.negadaPermanentemente:
      case PermissaoDeLocalizacao.naoPedida:
        setState(() {
          _codigoDoAviso = MotivoDeNaoTerCidade.permissaoNegada.codigo;
          _aviso = _AvisoDaLocalizacao.semPermissao;
        });
        return;
      case PermissaoDeLocalizacao.indisponivel:
        setState(() {
          _codigoDoAviso = MotivoDeNaoTerCidade.indisponivel.codigo;
          _detalheDoAviso = 'permissão indisponível após pedir';
          _aviso = _AvisoDaLocalizacao.cidadeNaoDescoberta;
        });
        return;
      case PermissaoDeLocalizacao.concedida:
        break;
    }
    await _resolverEAplicar(sessao, porToque: true);
  }

  /// Resolve a cidade e aplica, **por um dos DOIS caminhos**.
  Future<void> _resolverEAplicar(
    LocalizacaoDaSessao sessao, {
    required bool porToque,
  }) async {
    final resultado = await sessao.cidade(forcar: porToque);
    if (!mounted) return;
    switch (resultado) {
      case CidadeNaoResolvida(motivo: final motivo, detalhe: final detalhe):
        if (!porToque) return;
        setState(() {
          _codigoDoAviso = motivo.codigo;
          _detalheDoAviso = detalhe;
          _aviso = switch (motivo) {
            MotivoDeNaoTerCidade.permissaoNegada ||
            MotivoDeNaoTerCidade.permissaoNegadaPermanentemente =>
              _AvisoDaLocalizacao.semPermissao,
            MotivoDeNaoTerCidade.servicoDesligado =>
              _AvisoDaLocalizacao.servicoDesligado,
            MotivoDeNaoTerCidade.semResultado =>
              _AvisoDaLocalizacao.cidadeSemNome,
            MotivoDeNaoTerCidade.semFixNoPrazo ||
            MotivoDeNaoTerCidade.resolucaoSemResposta ||
            MotivoDeNaoTerCidade.indisponivel ||
            MotivoDeNaoTerCidade.geocoderAusente ||
            MotivoDeNaoTerCidade.falhaDoServico =>
              _AvisoDaLocalizacao.cidadeNaoDescoberta,
          };
        });
        return;
      case CidadeResolvida(cidade: final cidade):
        if (porToque) {
          _pessoaMexeu = false;
          _cidadeDigitada = null;
        } else {
          if (_pessoaMexeu) return;
          if (cidade == _cidadeDoAparelho) return;
          if (cidade == _cidadeEmUso) {
            setState(() => _cidadeDoAparelho = cidade);
            return;
          }
        }
        setState(() {
          _cidadeDoAparelho = cidade;
          _aviso = null;
          _codigoDoAviso = null;
          _detalheDoAviso = null;
        });
        await _carregar();
        if (!mounted || !porToque) return;
        if (_fase == _Fase.lista && _itens.isEmpty) {
          setState(() {
            _cidadeDoAviso = cidade;
            _aviso = _AvisoDaLocalizacao.semPetsNaCidade;
          });
        }
    }
  }
  /// A região cadastrada do tutor.
  RegiaoDeReferencia? get _regiao =>
      Escopo.of(context).sessao.usuario?.regiaoDeReferencia;

  String? get _meuBairro {
    final b = _regiao?.bairro?.trim();
    return (b == null || b.isEmpty) ? null : b;
  }

  Future<void> _carregar({bool maisUma = false}) async {
    if (!mounted) return;
    final cidade = _cidadeEmUso;
    final atual =
        (_recorte ?? _recorteDeAbertura).copiar(cidade: cidade);
    if (cidade != null) unawaited(_cidadeGuardada.guardar(cidade));

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
      setState(() {
        _fase = _Fase.carregando;
        _agora = DateTime.now();
      });
    }

    final pedido = atual.copiar(pagina: maisUma ? _pagina + 1 : 1);
    final api = PerdidosApi(Escopo.of(context).api);

    try {
      final pagina = await api.listar(pedido);
      if (!mounted || geracao != _geracao) return;
      setState(() {
        _recorte = atual;
        _itens = maisUma
            ? <PerdidoPublico>[..._itens, ...pagina.itens]
            : pagina.itens;
        _total = pagina.total;
        _pagina = pagina.pagina;
        _fase = _Fase.lista;
        _carregandoMais = false;
      });
      _preservacao.marcar(_assinaturaDaListagem);
      if (!maisUma) {
        unawaited(
          Escopo.of(context).contadores.marcarSecaoVista(SecaoComContador.pets),
        );
      }
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
      _itens = const <PerdidoPublico>[];
      _fase = _Fase.falha;
    });
  }

  void _trocarRecorte(RecorteDePerdidos novo) {
    setState(() => _recorte = novo);
    _carregar();
  }

  ControleDeBusca _controleDeBusca() {
    return ControleDeBusca(
      controlador: _buscaControlador,
      alcance: AlcanceDaBusca.servidor,
      rotulo: ListaDePerdidos.rotuloDaBusca,
      termoAplicado: _recorte?.termoLimpo,
      minimoDeCaracteres: 2,
      aoAplicar: (termo) {
        final base = _recorte;
        if (base == null) return;
        if (termo == base.termoLimpo) return;
        _trocarRecorte(base.copiar(termo: termo, pagina: 1));
      },
    );
  }

  /// O campo de cidade da folha.
  CampoDeTextoDoFiltro get _campoDaCidade => CampoDeTextoDoFiltro(
        chave: 'city',
        rotulo: ListaDePerdidos.rotuloDaCidade,
        valor: _recorte?.cidadeLimpa,
        textoDeValidacao: ListaDePerdidos.validacaoDaCidade,
        limite: 80,
        minimoDeCaracteres: 2,
        exemplo: ListaDePerdidos.exemploDaCidade,
      );

  ControleDeFiltro _controleDeFiltro() {
    final base = _recorte;
    final bairro = _meuBairro;
    if (base == null) {
      return ControleDeFiltro(
        grupos: const <GrupoDeFiltro>[],
        campos: <CampoDeTextoDoFiltro>[_campoDaCidade],
      );
    }
    return ControleDeFiltro(
      campos: <CampoDeTextoDoFiltro>[_campoDaCidade],
      grupos: <GrupoDeFiltro>[
        GrupoDeFiltro(
          chave: 'case_state',
          titulo: 'Estado',
          selecionado: (base.estado ?? EstadoDoCasoNaLista.aberto).codigo,
          codigoPadrao: EstadoDoCasoNaLista.aberto.codigo,
          opcoes: <OpcaoDeRecorte>[
            for (final e in EstadoDoCasoNaLista.values)
              OpcaoDeRecorte(codigo: e.codigo, rotulo: e.rotulo),
          ],
          nota: 'A lista traz os perdidos. Encontrados mostra só quem voltou '
              'com a ajuda de alguém da comunidade, nos últimos 30 dias.',
        ),
        if (bairro != null)
          GrupoDeFiltro(
            chave: 'neighborhood',
            titulo: 'Bairro',
            selecionado: base.bairro,
            opcoes: <OpcaoDeRecorte>[
              OpcaoDeRecorte(codigo: bairro, rotulo: bairro),
            ],
            nota: 'O bairro que você cadastrou no perfil.',
          ),
        GrupoDeFiltro(
          chave: 'species',
          titulo: 'Espécie',
          selecionado: base.especie?.valor,
          opcoes: <OpcaoDeRecorte>[
            for (final e in Especie.values)
              OpcaoDeRecorte(codigo: e.valor, rotulo: e.rotulo),
          ],
        ),
        GrupoDeFiltro(
          chave: 'size',
          titulo: 'Porte',
          selecionado: base.porte?.valor,
          opcoes: <OpcaoDeRecorte>[
            for (final p in Porte.values)
              OpcaoDeRecorte(codigo: p.valor, rotulo: p.rotulo),
          ],
        ),
        GrupoDeFiltro(
          chave: 'period',
          titulo: 'Perdido desde',
          selecionado: base.janela?.codigo,
          opcoes: <OpcaoDeRecorte>[
            for (final j in JanelaDePerdidos.values)
              OpcaoDeRecorte(codigo: j.codigo, rotulo: j.rotulo),
          ],
          nota: 'A janela conta de quando o pet foi visto pela última vez.',
        ),
      ],
    );
  }

  /// O `Aplicar` da folha: **um** recorte, **uma** chamada à rota.
  void _aplicarAFolha(EscolhaDaFolha escolha) {
    final base = _recorte ?? _recorteDeAbertura;
    _pessoaMexeu = true;
    _cidadeDigitada = escolha.filtros['city'];
    _aviso = null;
    _cidadeDoAviso = null;
    _codigoDoAviso = null;
    _detalheDoAviso = null;
    _trocarRecorte(
      base.copiar(
        cidade: escolha.filtros['city'],
        bairro: escolha.filtros['neighborhood'],
        especie: Especie.de(escolha.filtros['species']),
        porte: Porte.de(escolha.filtros['size']),
        janela: JanelaDePerdidos.de(escolha.filtros['period']),
        estado: EstadoDoCasoNaLista.de(escolha.filtros['case_state']) ??
            EstadoDoCasoNaLista.aberto,
        pagina: 1,
      ),
    );
  }

  /// ## A CAIXA DO RECORTE APARECE, OU NÃO — decisão do cliente, 20/10/2026
  bool get _caixaDoRecorteAparece =>
      _cidadeEmUso == null || _podeOferecerLocalizacao || _localizacaoPendente;

  /// A localização ainda não entregou cidade, e a caixa tem função.
  bool get _localizacaoPendente => switch (_aviso) {
        null => false,
        _AvisoDaLocalizacao.procurando ||
        _AvisoDaLocalizacao.semPermissao ||
        _AvisoDaLocalizacao.servicoDesligado ||
        _AvisoDaLocalizacao.cidadeNaoDescoberta ||
        _AvisoDaLocalizacao.cidadeSemNome =>
          true,
        _AvisoDaLocalizacao.semPetsNaCidade => false,
      };

  /// Oferecer `Usar minha localização` só faz sentido quando ela ainda pode dar
  /// em algo.
  bool get _podeOferecerLocalizacao {
    if (_cidadeDoAparelho != null && !_pessoaMexeu) return false;
    return _permissao != PermissaoDeLocalizacao.indisponivel;
  }

  /// A frase da faixa do toque, ou nula quando não há faixa.
  String? get _textoDoAviso => switch (_aviso) {
        null => null,
        _AvisoDaLocalizacao.procurando => ListaDePerdidos.avisoProcurando,
        _AvisoDaLocalizacao.semPermissao => ListaDePerdidos.avisoSemPermissao,
        _AvisoDaLocalizacao.servicoDesligado =>
          ListaDePerdidos.avisoServicoDesligado,
        _AvisoDaLocalizacao.cidadeNaoDescoberta =>
          ListaDePerdidos.avisoCidadeNaoDescoberta,
        _AvisoDaLocalizacao.cidadeSemNome =>
          ListaDePerdidos.avisoCidadeSemNome,
        _AvisoDaLocalizacao.semPetsNaCidade =>
          ListaDePerdidos.avisoSemPetsNaCidade(_cidadeDoAviso ?? ''),
      };

  /// A frase da faixa COM o código do motivo, que é o que a tela mostra.
  String? get _textoDaFaixa {
    final frase = _textoDoAviso;
    final codigo = _codigoDoAviso;
    if (frase == null || codigo == null) return frase;
    return ListaDePerdidos.comCodigo(frase, codigo, _detalheDoAviso);
  }

  /// A saída que a faixa oferece, **e ela não é a mesma nas quatro**.
  String? get _rotuloDaAcaoDoAviso => switch (_aviso) {
        _AvisoDaLocalizacao.semPermissao ||
        _AvisoDaLocalizacao.servicoDesligado =>
          ListaDePerdidos.rotuloDeAbrirAjustes,
        _AvisoDaLocalizacao.cidadeNaoDescoberta =>
          ListaDePerdidos.rotuloDeTentarALocalizacao,
        _AvisoDaLocalizacao.cidadeSemNome ||
        _AvisoDaLocalizacao.procurando ||
        _AvisoDaLocalizacao.semPetsNaCidade ||
        null =>
          null,
      };

  VoidCallback? get _acaoDoAviso => switch (_aviso) {
        _AvisoDaLocalizacao.semPermissao ||
        _AvisoDaLocalizacao.servicoDesligado =>
          () => Escopo.of(context)
              .localizacaoDaSessao
              .abrirAjustesDoSistema(),
        _AvisoDaLocalizacao.cidadeNaoDescoberta => _pedirEResolver,
        _AvisoDaLocalizacao.cidadeSemNome ||
        _AvisoDaLocalizacao.procurando ||
        _AvisoDaLocalizacao.semPetsNaCidade ||
        null =>
          null,
      };

  /// `Ver todas`: tira a cidade do recorte, venha ela de onde vier.
  void _verTodas() {
    _pessoaMexeu = true;
    _cidadeDigitada = null;
    _aviso = null;
    _cidadeDoAviso = null;
    _codigoDoAviso = null;
    _detalheDoAviso = null;
    final base = _recorte ?? _recorteDeAbertura;
    _trocarRecorte(base.copiar(cidade: null, pagina: 1));
  }

  bool get _temRecorteAtivo {
    final base = _recorte;
    if (base == null) return false;
    return base.cidadeLimpa != null ||
        base.temBusca ||
        base.bairro != null ||
        base.especie != null ||
        base.porte != null ||
        base.janela != null ||
        base.estado == EstadoDoCasoNaLista.reencontrado;
  }

  @override
  Widget build(BuildContext context) {
    final sessao = Escopo.of(context).sessao;
    return AnimatedBuilder(
      animation: sessao,
      builder: (context, _) {
        final busca = _controleDeBusca();
        final filtro = _controleDeFiltro();
        final comControles = _fase == _Fase.lista &&
            BarraDeListagem.desenha(
              total: _total,
              busca: busca,
              filtro: filtro,
              aoAplicar: _aplicarAFolha,
            );

        return Column(
          crossAxisAlignment: CrossAxisAlignment.stretch,
          children: <Widget>[
            if (_fase != _Fase.carregando && _caixaDoRecorteAparece) ...<Widget>[
              _LinhaDoRecorte(
                cidade: _cidadeEmUso,
                origem: _origemDaCidade,
                podeOferecerLocalizacao: _podeOferecerLocalizacao,
                aoVerTodas: _verTodas,
                aoUsarLocalizacao: _aviso == _AvisoDaLocalizacao.procurando
                    ? null
                    : _pedirEResolver,
              ),
              const SizedBox(height: BichuEspaco.e4),
            ],
            if (_textoDaFaixa != null) ...<Widget>[
              FaixaDeAviso(
                texto: _textoDaFaixa!,
                peso: PesoDaFaixa.informativo,
                rotuloDaAcao: _rotuloDaAcaoDoAviso,
                aoTocarNaAcao: _acaoDoAviso,
              ),
              const SizedBox(height: BichuEspaco.e4),
            ],
            if (comControles) ...<Widget>[
              LinhaDeBuscaDaListagem(
                total: _total,
                busca: busca,
                filtro: filtro,
                aoAplicar: _aplicarAFolha,
              ),
              const SizedBox(height: BichuEspaco.e4),
            ],
            if (_fase == _Fase.lista)
              BarraDeListagem(
                total: _total,
                substantivo: const SubstantivoDaListagem(
                  singular: 'pet perdido',
                  plural: 'pets perdidos',
                ),
                buscaAcima: true,
                busca: busca,
                filtro: filtro,
                aoAplicar: _aplicarAFolha,
              ),
            ..._corpo(),
          ],
        );
      },
    );
  }

  List<Widget> _corpo() {
    switch (_fase) {
      case _Fase.carregando:
        return <Widget>[
          Semantics(
            label: 'Carregando pets perdidos',
            liveRegion: true,
            child: const Column(
              children: <Widget>[
                _EsqueletoDePerdido(),
                SizedBox(height: BichuEspaco.e4),
                _EsqueletoDePerdido(),
              ],
            ),
          ),
        ];
      case _Fase.falha:
        return <Widget>[
          FaixaDeAviso(
            texto: ListaDePerdidos.falha,
            rotuloDaAcao: ListaDePerdidos.rotuloDeTentar,
            aoTocarNaAcao: _carregar,
          ),
        ];
      case _Fase.lista:
        if (_itens.isEmpty) {
          return <Widget>[
            _UmaLinha(
              texto: _temRecorteAtivo
                  ? ListaDePerdidos.vazioFiltrado
                  : ListaDePerdidos.vazio,
            ),
          ];
        }
        return <Widget>[
          for (var i = 0; i < _itens.length; i++) ...<Widget>[
            if (i > 0) const SizedBox(height: BichuEspaco.e4),
            CartaoDoPerdido(
              perdido: _itens[i],
              agora: _agora,
              aoTocar: () => context.push(
                Rotas.casoPublicoDe(_itens[i].shareToken),
              ),
            ),
          ],
          const SizedBox(height: espacoAcimaDoRodape),
          RodapeDaPaginacao(
            carregados: _itens.length,
            total: _total,
            carregando: _carregandoMais,
            textoDaFalha: _falhaAoCarregarMais ? ListaDePerdidos.falha : null,
            aoPedirMais: () => _carregar(maisUma: true),
            fimDaLista: ListaDePerdidos.fimDaLista,
          ),
        ];
    }
  }
}

/// A LINHA QUE DIZ QUAL RECORTE ESTÁ VALENDO, e de onde ele veio.
class _LinhaDoRecorte extends StatelessWidget {
  const _LinhaDoRecorte({
    required this.cidade,
    required this.origem,
    required this.podeOferecerLocalizacao,
    required this.aoVerTodas,
    required this.aoUsarLocalizacao,
  });

  final String? cidade;
  final _OrigemDaCidade origem;
  final bool podeOferecerLocalizacao;
  final VoidCallback aoVerTodas;

  /// **Nulo desenha o botão DESABILITADO**, e não o esconde.
  final VoidCallback? aoUsarLocalizacao;

  String get _texto {
    final c = cidade;
    if (c == null) return ListaDePerdidos.semRecorteGeografico;
    return switch (origem) {
      _OrigemDaCidade.aparelho =>
        'Pets perdidos em $c \u00b7 ${ListaDePerdidos.origemDoAparelho}',
      _OrigemDaCidade.regiao =>
        'Pets perdidos em $c \u00b7 ${ListaDePerdidos.origemDaRegiao}',
      _OrigemDaCidade.ultimaBusca =>
        'Pets perdidos em $c \u00b7 ${ListaDePerdidos.origemDaUltimaBusca}',
      _OrigemDaCidade.escolhida => 'Pets perdidos em $c',
      _OrigemDaCidade.nenhuma => ListaDePerdidos.semRecorteGeografico,
    };
  }

  @override
  Widget build(BuildContext context) {
    final cores = BichuColors.of(context).cores;
    final textos = Theme.of(context).textTheme;
    return Container(
      width: double.infinity,
      padding: const EdgeInsets.symmetric(
        horizontal: BichuEspaco.e4,
        vertical: BichuEspaco.e3,
      ),
      decoration: BoxDecoration(
        color: cores.surfaceSunken,
        borderRadius: BorderRadius.circular(BichuRaio.md),
        border: Border.all(color: cores.outline, width: BichuBorda.hairline),
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: <Widget>[
          Semantics(
            liveRegion: true,
            child: Text(_texto, style: textos.bodyMedium),
          ),
          if (cidade != null || podeOferecerLocalizacao) ...<Widget>[
            const SizedBox(height: BichuEspaco.e2),
            Wrap(
              spacing: BichuEspaco.e4,
              children: <Widget>[
                if (cidade != null)
                  TextButton(
                    onPressed: aoVerTodas,
                    child: const Text(ListaDePerdidos.rotuloDeVerTodas),
                  ),
                if (podeOferecerLocalizacao)
                  TextButton(
                    onPressed: aoUsarLocalizacao,
                    child:
                        const Text(ListaDePerdidos.rotuloDeUsarLocalizacao),
                  ),
              ],
            ),
          ],
        ],
      ),
    );
  }
}

/// O estado vazio desta seção: **uma linha**, e nada mais.
class _UmaLinha extends StatelessWidget {
  const _UmaLinha({required this.texto});

  final String texto;

  @override
  Widget build(BuildContext context) {
    final cores = BichuColors.of(context).cores;
    return Container(
      width: double.infinity,
      padding: const EdgeInsets.all(BichuEspaco.e6),
      decoration: BoxDecoration(
        color: cores.surfaceSunken,
        borderRadius: BorderRadius.circular(BichuRaio.lg),
        border: Border.all(color: cores.outline, width: BichuBorda.hairline),
      ),
      child: Text(texto, style: Theme.of(context).textTheme.titleMedium),
    );
  }
}

/// O esqueleto do cartão, com a mesma geometria do cartão de verdade: sem isso
/// a lista dá um salto de layout quando os dados chegam.
class _EsqueletoDePerdido extends StatelessWidget {
  const _EsqueletoDePerdido();

  @override
  Widget build(BuildContext context) {
    final cores = BichuColors.of(context).cores;
    return Container(
      padding: const EdgeInsets.all(BichuEspaco.e4),
      decoration: BoxDecoration(
        color: cores.surface,
        borderRadius: BorderRadius.circular(BichuRaio.lg),
        border: Border.all(color: cores.outline, width: BichuBorda.hairline),
      ),
      child: Row(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: <Widget>[
          const Moldura(
            largura: BichuMoldura.larguraFotoSm,
            estado: EstadoDaMoldura.carregando,
          ),
          const SizedBox(width: BichuEspaco.e4),
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: <Widget>[
                _Barrinha(cor: cores.surfaceSunken, fracao: 0.4),
                const SizedBox(height: BichuEspaco.e2),
                _Barrinha(cor: cores.surfaceSunken, fracao: 0.8),
                const SizedBox(height: BichuEspaco.e2),
                _Barrinha(cor: cores.surfaceSunken, fracao: 0.6),
              ],
            ),
          ),
        ],
      ),
    );
  }
}

class _Barrinha extends StatelessWidget {
  const _Barrinha({required this.cor, required this.fracao});

  final Color cor;
  final double fracao;

  @override
  Widget build(BuildContext context) {
    return FractionallySizedBox(
      alignment: Alignment.centerLeft,
      widthFactor: fracao,
      child: Container(
        height: BichuEspaco.e3,
        decoration: BoxDecoration(
          color: cor,
          borderRadius: BorderRadius.circular(BichuRaio.sm),
        ),
      ),
    );
  }
}
