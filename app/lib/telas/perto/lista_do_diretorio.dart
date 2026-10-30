import 'dart:async';
import 'dart:collection';

import 'package:flutter/material.dart';
import 'package:url_launcher/url_launcher.dart';

import '../../api/falhas.dart';
import '../../api/mensagens_de_erro.dart';
import '../../api/modelos_diretorio.dart';
import '../../escopo.dart';
import '../../roteamento/rotas.dart';
import '../../theme/bichu_colors.dart';
import '../../theme/bichu_tokens.g.dart';
import '../../widgets/arrastar_para_atualizar.dart';
import '../../widgets/barra_de_listagem.dart';
import '../../widgets/cidade_por_localizacao.dart';
import '../../widgets/convite_para_entrar.dart';
import '../../widgets/faixa_de_aviso.dart';
import '../../widgets/icone_do_inscrito.dart';
import '../../widgets/imagem_da_rede.dart';
import '../../widgets/listagem_preservada.dart';
import '../../widgets/moldura.dart';
import '../../widgets/rodape_da_paginacao.dart';
import '../casca_com_abas.dart';
import 'pagina_do_local.dart';

/// `Perto` — o diretorio de profissionais e estabelecimentos.
class ListaDoDiretorio extends StatefulWidget {
  const ListaDoDiretorio({super.key});

  /// O que a lista esta mostrando **enquanto nao ha cidade**.
  static const String explicacaoSemCidade =
      'Mostrando profissionais de todas as cidades.';

  /// O rotulo do campo de BAIRRO da folha de filtros (BICHUS-315, 28/10/2026).
  static const String rotuloDoBairro = 'Bairro';

  /// A unica linha que o campo mostra alem do rotulo, e so quando o valor nao
  /// serve.
  static const String validacaoDoBairro =
      'Escreva ao menos duas letras do bairro.';

  /// A dica DENTRO do campo. Um bairro de Sao Paulo, porque e a cidade do
  /// pedido.
  static const String exemploDoBairro = 'Pinheiros';

  /// O titulo do vazio sem nenhum filtro: a secao ainda nao tem entrada na
  /// regiao de quem esta olhando.
  static const String tituloDoVazio = 'Ainda não há profissionais por aqui';

  static const String explicacaoDoVazio =
      'O Bichu está convidando veterinários, banhos e tosas e clínicas da sua '
      'região. Quando os primeiros entrarem, eles aparecem nesta lista.';

  /// O vazio **depois de filtrar**.
  static const String tituloDoVazioFiltrado = 'Nada com esses filtros';

  static const String explicacaoDoVazioFiltrado =
      'Tire um filtro para ver mais profissionais da sua região.';

  /// A frase do fim da lista (paragrafo 11.20), no plural e no singular.
  static String fimDaLista(int total) => total == 1
      ? 'Você viu o único profissional desta região.'
      : 'Você viu todos os $total profissionais desta região.';

  /// Quando a pagina seguinte nao chega.
  static const String falhaAoCarregarMais =
      'Não foi possível carregar mais profissionais.';

  static const String rotuloDeAtualizar = 'Atualizar';

  /// O rotulo da porta de indicar.
  static const String rotuloDeIndicar = 'Indicar quem atende bem';

  @override
  State<ListaDoDiretorio> createState() => _ListaDoDiretorioState();
}

/// Os desfechos de uma carga.
enum _Fase { carregando, lista, falha }

class _ListaDoDiretorioState extends State<ListaDoDiretorio>
    with PublicaAAtualizacao {
  /// A BUSCA QUE O ARRASTO REFAZ (cliente, 18/10/2026).
  @override
  Future<void> aoArrastarParaAtualizar() => _carregar();

  _Fase _fase = _Fase.carregando;
  RecorteDoDiretorio _recorte = const RecorteDoDiretorio();

  /// O ESTADO QUE ATRAVESSA A IDA E VOLTA (BICHUS-316).
  final PreservacaoDaListagem _preservacao =
      PreservacaoDaListagem(teto: tetoDeItensPreservados);

  /// A pergunta que as entradas na tela respondem.
  String get _assinaturaDaListagem => assinaturaDaListagem(
        pergunta: <String, String>{
          ..._recorte.query,
          'cidade_em_uso': _cidadeEmUso ?? '',
        },
        referencia: _referenciaDaConta,
      );

  /// A localizacao de referencia da conta -- o gatilho de invalidacao que
  /// ninguem lembraria.
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
  PaginaDoDiretorio? _pagina;
  String? _textoDaFalha;

  /// A falha foi **falta de conta**, e nao defeito.
  bool _faltaConta = false;

  /// As entradas de **todas** as paginas ja pedidas, na ordem em que chegaram.
  final List<EntradaDoDiretorio> _itens = <EntradaDoDiretorio>[];

  /// A pagina seguinte esta em voo.
  bool _carregandoMais = false;

  /// Por que a pagina seguinte nao chegou.
  String? _falhaDeMais;

  bool _visivel = false;
  bool _cargaAgendada = false;

  /// O campo de busca por nome (`q`, desde 30/09).
  final TextEditingController _busca = TextEditingController();

  /// As cidades que esta lista JA VIU, para o grupo `Cidade` da folha.
  final SplayTreeSet<String> _cidadesConhecidas = SplayTreeSet<String>();

  /// A CIDADE DO APARELHO, pela mesma peca que `Pets` e `Eventos` usam.
  CidadeDoAparelho? _cidadeDoAparelho;

  /// A FOLHA decidiu a cidade, e por isso a derivada nao manda mais.
  bool _folhaDecidiuACidade = false;

  /// Recarrega quando a tela volta a aparecer, pelo mesmo mecanismo de `Perfil`
  /// > `Meus pets`: `TickerMode` responde as duas maneiras de esta tela sumir
  /// da vista (trocar de aba, e ser coberta por uma rota opaca do navegador
  /// raiz) sem a tela precisar saber qual delas aconteceu.
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

  /// Cria o resolvedor de cidade e **dispara a resolucao de abertura**.
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

  /// A caixa e a frase dela dependem do resolvedor; `setState` vazio basta.
  void _aResolucaoAndou() {
    if (!mounted) return;
    setState(() {});
  }

  /// A CIDADE QUE VALE AGORA, e e ela que vai para `city` na rota.
  String? get _cidadeEmUso =>
      _folhaDecidiuACidade ? _recorte.cidade : _cidadeDoAparelho?.cidade;

  /// O recorte como ele vai para a ROTA: com a cidade em uso aplicada.
  RecorteDoDiretorio _paraAChamada(RecorteDoDiretorio base) {
    final cidade = _cidadeEmUso;
    return base.com(cidade: cidade, limparCidade: cidade == null);
  }

  /// Em que estado de sessao a lista na tela foi carregada.
  bool? _logadoDaUltimaCarga;

  /// **A UNICA decisao de qual operacao atende a lista**, e ela e uma so de
  /// proposito: ha DOIS chamadores (a primeira pagina e o `Carregar mais`), e
  /// um deles escolhendo diferente faria a pagina 2 vir de outra operacao que a
  /// 1 -- entrada repetida e entrada faltando no fim da lista, pelo mesmo
  /// motivo que `_paraAChamada` mora num lugar so.
  Future<PaginaDoDiretorio> _pedirPagina(
    Escopo escopo,
    RecorteDoDiretorio recorte,
  ) {
    final chamada = _paraAChamada(recorte);
    return escopo.sessao.logado
        ? escopo.diretorio.listar(chamada)
        : escopo.diretorio.listarPublico(chamada);
  }

  /// O TOQUE em `Usar minha localização`.
  Future<void> _usarMinhaLocalizacao() async {
    final resolvedor = _cidadeDoAparelho;
    if (resolvedor == null) return;
    await resolvedor.resolverPorToque();
    if (!mounted) return;
    if (resolvedor.cidade == null) return;
    setState(() {
      _folhaDecidiuACidade = false;
      if (_recorte.cidade != null) {
        _recorte = _recorte.com(limparCidade: true);
      }
    });
    await _carregar();
  }

  void _agendarCarga() {
    if (_cargaAgendada) return;
    _cargaAgendada = true;
    WidgetsBinding.instance.addPostFrameCallback((_) {
      _cargaAgendada = false;
      if (mounted) _carregar();
    });
  }

  /// Carrega a **primeira** pagina do recorte atual, sempre.
  Future<void> _carregar() async {
    if (!mounted) return;
    final escopo = Escopo.of(context);
    final recorte =
        _recorte.pagina == 1 ? _recorte : _recorte.com(pagina: 1);
    _preservacao.descartar();
    SlotDaRolagem.maybeOf(context)?.aListaFoiDescartada();
    setState(() {
      _recorte = recorte;
      _fase = _Fase.carregando;
      _textoDaFalha = null;
      _faltaConta = false;
      _falhaDeMais = null;
      _carregandoMais = false;
      _itens.clear();
    });
    _logadoDaUltimaCarga = escopo.sessao.logado;

    try {
      final pagina = await _pedirPagina(escopo, recorte);
      if (!mounted) return;
      setState(() {
        _pagina = pagina;
        _itens
          ..clear()
          ..addAll(pagina.itens);
        _guardarAsCidades(pagina.itens);
        _fase = _Fase.lista;
      });
      _preservacao.marcar(_assinaturaDaListagem);
    } on FalhaDeChamada catch (falha) {
      if (!mounted) return;
      setState(() {
        _faltaConta = faltaConta(falha);
        _textoDaFalha =
            textoDoTetoDoDiretorio(falha) ?? MensagensDeErro.de(falha).texto;
        _pagina = null;
        _fase = _Fase.falha;
      });
    } on FormatException catch (erro) {
      if (!mounted) return;
      setState(() {
        _textoDaFalha = MensagensDeErro.servidorFora;
        _pagina = null;
        _fase = _Fase.falha;
      });
      debugPrint('Resposta do diretorio fora do contrato: $erro');
    }
  }

  @override
  void dispose() {
    _busca.dispose();
    _cidadeDoAparelho?.dispose();
    super.dispose();
  }

  /// Recolhe as cidades das entradas que chegaram, para o grupo `Cidade`.
  void _guardarAsCidades(List<EntradaDoDiretorio> entradas) {
    for (final e in entradas) {
      final c = e.cidade?.trim();
      if (c != null && c.isNotEmpty) _cidadesConhecidas.add(c);
    }
  }

  void _trocarRecorte(RecorteDoDiretorio novo) {
    setState(() => _recorte = novo);
    _carregar();
  }

  /// Pede a pagina seguinte e **acrescenta** o que vier.
  Future<void> _carregarMais() async {
    if (!mounted || _carregandoMais) return;
    final atual = _pagina;
    if (atual == null) return;

    final escopo = Escopo.of(context);
    final proximo = _recorte.com(pagina: atual.pagina + 1);
    setState(() {
      _carregandoMais = true;
      _falhaDeMais = null;
    });

    try {
      final pagina = await _pedirPagina(escopo, proximo);
      if (!mounted) return;
      setState(() {
        _recorte = proximo;
        _pagina = pagina;
        _itens.addAll(pagina.itens);
        _guardarAsCidades(pagina.itens);
        _carregandoMais = false;
      });
      _preservacao.marcar(_assinaturaDaListagem);
    } on FalhaDeChamada catch (falha) {
      if (!mounted) return;
      setState(() {
        _carregandoMais = false;
        _falhaDeMais =
            textoDoTetoDoDiretorio(falha) ?? ListaDoDiretorio.falhaAoCarregarMais;
      });
    } on FormatException catch (erro) {
      if (!mounted) return;
      setState(() {
        _carregandoMais = false;
        _falhaDeMais = ListaDoDiretorio.falhaAoCarregarMais;
      });
      debugPrint('Resposta do diretorio fora do contrato: $erro');
    }
  }

  /// O TOQUE NO CARTAO, e o destino dele.
  void _tocarNoCartao(EntradaDoDiretorio entrada, {required bool logado}) {
    if (!logado) {
      unawaited(
        mostrarConviteParaEntrar(
          context,
          secao: SecaoComConta.paginaDoLocal,
          rotaDeVolta: Rotas.localDoPertoDe(entrada.slug),
        ),
      );
      return;
    }
    PaginaDoLocal.abrir(context, entrada.slug);
  }

  @override
  Widget build(BuildContext context) {
    final sessao = Escopo.of(context).sessao;
    return AnimatedBuilder(
      animation: sessao,
      builder: (context, _) {
        if (_logadoDaUltimaCarga != null &&
            _logadoDaUltimaCarga != sessao.logado) {
          _agendarCarga();
        }
        return _conteudo(logado: sessao.logado);
      },
    );
  }

  Widget _conteudo({required bool logado}) {
    final pagina = _pagina;

    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: <Widget>[
        BuscaNoTopoFixo(
          total: pagina?.total ?? 0,
          busca: _controleDeBusca(),
          filtro: _controleDeFiltro(),
          ordenacao: pagina == null ? null : _controleDeOrdenacao(pagina),
          aoAplicar: _aplicarAFolha,
        ),
        if (_fase != _Fase.carregando) ...<Widget>[
          CaixaDeLocalizacao(
            cidadeEmUso: _cidadeEmUso,
            explicacao: ListaDoDiretorio.explicacaoSemCidade,
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
        if (pagina != null)
          BarraDeListagem(
            total: pagina.total,
            buscaAcima: true,
            busca: _controleDeBusca(),
            filtro: _controleDeFiltro(),
            ordenacao: _controleDeOrdenacao(pagina),
            aoAplicar: _aplicarAFolha,
          ),
        ..._corpo(logado: logado),
      ],
    );
  }

  /// A busca por NOME, servida pelo servidor (`q`).
  ControleDeBusca _controleDeBusca() {
    return ControleDeBusca(
      controlador: _busca,
      alcance: AlcanceDaBusca.servidor,
      rotulo: 'Buscar profissional',
      termoAplicado: _recorte.termo,
      minimoDeCaracteres: 3,
      aoAplicar: (termo) => _trocarRecorte(
        termo == null
            ? _recorte.com(limparTermo: true, pagina: 1)
            : _recorte.com(termo: termo, pagina: 1),
      ),
    );
  }

  /// O filtro: atividade e nivel de verificacao, que sao os dois recortes que a
  /// rota aceita.
  ControleDeFiltro _controleDeFiltro() {
    final cidades = SplayTreeSet<String>.from(_cidadesConhecidas);
    final emUso = _cidadeEmUso;
    if (emUso != null) cidades.add(emUso);
    return ControleDeFiltro(
      campos: <CampoDeTextoDoFiltro>[
        CampoDeTextoDoFiltro(
          chave: 'neighborhood',
          rotulo: ListaDoDiretorio.rotuloDoBairro,
          valor: _recorte.bairro,
          textoDeValidacao: ListaDoDiretorio.validacaoDoBairro,
          limite: 80,
          minimoDeCaracteres: 2,
          exemplo: ListaDoDiretorio.exemploDoBairro,
        ),
      ],
      grupos: <GrupoDeFiltro>[
        if (cidades.isNotEmpty)
          GrupoDeFiltro(
            chave: 'city',
            titulo: 'Cidade',
            selecionado: emUso,
            opcoes: <OpcaoDeRecorte>[
              for (final c in cidades) OpcaoDeRecorte(codigo: c, rotulo: c),
            ],
          ),
        GrupoDeFiltro(
          chave: 'kind',
          titulo: 'Atividade',
          selecionado: _recorte.atividade?.codigo,
          opcoes: <OpcaoDeRecorte>[
            for (final a in AtividadeDoDiretorio.values)
              OpcaoDeRecorte(codigo: a.codigo, rotulo: a.rotulo),
          ],
        ),
        GrupoDeFiltro(
          chave: 'verification_level',
          titulo: 'Verificação',
          selecionado: _recorte.nivelMinimo?.codigo,
          nota: 'É um piso: quem pede contato verificado recebe também quem '
              'tem documento verificado.',
          opcoes: const <OpcaoDeRecorte>[
            OpcaoDeRecorte(
              codigo: 'contact_verified',
              rotulo: 'Contato verificado',
            ),
            OpcaoDeRecorte(
              codigo: 'document_verified',
              rotulo: 'Documento verificado',
            ),
          ],
        ),
      ],
    );
  }

  /// Os dois grupos **e a ordem** de uma vez, no `Aplicar`: uma chamada a rota,
  /// e a lista sempre de volta a `pagina: 1`.
  void _aplicarAFolha(EscolhaDaFolha escolha) {
    final atividade = escolha.filtros['kind'];
    final nivel = escolha.filtros['verification_level'];

    var cidade = _recorte.cidade;
    var limparCidade = false;
    if (escolha.filtros.containsKey('city')) {
      final escolhida = escolha.filtros['city'];
      if (escolhida == _cidadeDoAparelho?.cidade) {
        cidade = null;
        limparCidade = true;
      } else {
        cidade = escolhida;
        limparCidade = escolhida == null;
        _folhaDecidiuACidade = true;
      }
    }

    final bairro = escolha.filtros['neighborhood']?.trim();
    final semBairro = bairro == null || bairro.isEmpty;

    _trocarRecorte(
      _recorte.com(
        atividade: AtividadeDoDiretorio.porCodigo(atividade),
        limparAtividade: atividade == null,
        nivelMinimo: nivel == null ? null : NivelDeVerificacao.porCodigo(nivel),
        limparNivel: nivel == null,
        cidade: cidade,
        limparCidade: limparCidade,
        bairro: semBairro ? null : bairro,
        limparBairro: semBairro,
        ordem: OrdemDoDiretorio.porCodigo(escolha.ordem),
        pagina: 1,
      ),
    );
  }

  /// A ordenacao, montada a partir do que **de fato** aconteceu.
  ControleDeOrdenacao _controleDeOrdenacao(PaginaDoDiretorio pagina) {
    final efetiva = pagina.ordemEfetiva;

    return ControleDeOrdenacao(
      opcoes: <OpcaoDeRecorte>[
        for (final o in OrdemDoDiretorio.values)
          OpcaoDeRecorte(codigo: o.codigo, rotulo: o.rotulo),
      ],
      efetiva: efetiva.codigo,
    );
  }

  /// O corpo da lista.
  List<Widget> _corpo({required bool logado}) {
    if (_fase == _Fase.carregando) {
      return const <Widget>[
        _EsqueletoDeEntrada(),
        SizedBox(height: BichuEspaco.e3),
        _EsqueletoDeEntrada(),
      ];
    }

    final pagina = _pagina;
    if (_fase == _Fase.falha || pagina == null) {
      if (_faltaConta) {
        return const <Widget>[
          ConviteParaEntrar(secao: SecaoComConta.diretorio),
        ];
      }
      return <Widget>[
        FaixaDeAviso(
          texto: _textoDaFalha ?? MensagensDeErro.servidorFora,
          rotuloDaAcao: ListaDoDiretorio.rotuloDeAtualizar,
          aoTocarNaAcao: _carregar,
        ),
      ];
    }

    if (_itens.isEmpty) {
      return <Widget>[
        if (_recorte.quantidadeDeFiltros > 0)
          const EstadoVazio(
            titulo: ListaDoDiretorio.tituloDoVazioFiltrado,
            explicacao: ListaDoDiretorio.explicacaoDoVazioFiltrado,
          )
        else
          const EstadoVazio(
            titulo: ListaDoDiretorio.tituloDoVazio,
            explicacao: ListaDoDiretorio.explicacaoDoVazio,
          ),
      ];
    }

    return <Widget>[
      for (var i = 0; i < _itens.length; i++) ...<Widget>[
        if (i > 0) const SizedBox(height: BichuEspaco.e3),
        CartaoDoDiretorio(
          entrada: _itens[i],
          aoTocar: () => _tocarNoCartao(_itens[i], logado: logado),
        ),
      ],
      const SizedBox(height: espacoAcimaDoRodape),
      RodapeDaPaginacao(
        carregados: _itens.length,
        total: pagina.total,
        carregando: _carregandoMais,
        textoDaFalha: _falhaDeMais,
        fimDaLista: ListaDoDiretorio.fimDaLista,
        aoPedirMais: _carregarMais,
      ),
    ];
  }
}

/// O cartao de uma entrada do diretorio.
class CartaoDoDiretorio extends StatelessWidget {
  const CartaoDoDiretorio({
    required this.entrada,
    required this.aoTocar,
    super.key,
  });

  final EntradaDoDiretorio entrada;

  /// O que o toque no bloco faz, **decidido por quem conhece a sessao**.
  final VoidCallback aoTocar;

  /// O rotulo **VISIVEL**: so `Ligar`, e nunca o nome do local.
  static const String rotuloDeLigar = 'Ligar';

  /// O nome **ACESSIVEL**: `Ligar para a Clinica Santa Barbara`.
  static String ligarPara(String nome) => '$rotuloDeLigar para $nome';

  /// A LINHA DA NOTA, como o cartao a escreve (BICHUS-313, 28/10/2026).
  static String textoDaAvaliacao(PontuacaoDoLocal pontuacao) {
    final media = pontuacao.mediaEmTexto;
    if (!pontuacao.temAvaliacoes || media == null) {
      return PaginaDoLocal.tituloSemAvaliacoes;
    }
    return '$media · ${pontuacao.quantidadeEmTexto}';
  }

  /// O rotulo **ACESSIVEL** da nota: `Média 4,8 de 5 estrelas, 128 avaliações`.
  static String rotuloDaAvaliacao(PontuacaoDoLocal pontuacao) {
    final media = pontuacao.mediaEmTexto;
    if (!pontuacao.temAvaliacoes || media == null) {
      return PaginaDoLocal.tituloSemAvaliacoes;
    }
    return 'Média $media de 5 estrelas, ${pontuacao.quantidadeEmTexto}';
  }

  /// A distancia em texto, ou nulo.
  static String? distanciaEmTexto(int? metros) {
    if (metros == null) return null;
    if (metros < 1000) return 'a $metros m';
    final km = (metros / 100).round() / 10;
    final texto = km.toStringAsFixed(1).replaceAll('.', ',');
    return 'a $texto km';
  }

  @override
  Widget build(BuildContext context) {
    final cores = BichuColors.of(context).cores;
    final textos = Theme.of(context).textTheme;

    final atividade = entrada.atividade?.rotulo;
    final bairro = linhaDeLugarDe(bairro: entrada.bairro);
    final telefone = entrada.telefoneE164;
    final logo = entrada.logoUrl;
    final pontuacao = entrada.pontuacao;

    return Container(
      width: double.infinity,
      padding: const EdgeInsets.all(BichuEspaco.e4),
      decoration: BoxDecoration(
        color: cores.surface,
        borderRadius: BorderRadius.circular(BichuRaio.lg),
        border: Border.all(color: cores.outline, width: BichuBorda.hairline),
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: <Widget>[
          InkWell(
            onTap: aoTocar,
            borderRadius: BorderRadius.circular(BichuRaio.md),
            child: MergeSemantics(
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: <Widget>[
                  Row(
                    crossAxisAlignment: CrossAxisAlignment.center,
                    children: <Widget>[
                      if (logo != null)
                        ImagemDaRede(
                          url: logo,
                          descricao: null,
                          largura: BichuMoldura.larguraFotoSm,
                          raio: BichuRaio.sm,
                          simboloDeFalha: Icons.storefront_outlined,
                        )
                      else
                        IconeDoInscrito(
                          atividade: entrada.atividade,
                          tipoDeEntidade: entrada.tipoDeEntidade,
                          largura: BichuMoldura.larguraFotoSm,
                          raio: BichuRaio.sm,
                        ),
                      const SizedBox(width: BichuEspaco.e3),
                      Expanded(
                        child: Column(
                          crossAxisAlignment: CrossAxisAlignment.start,
                          children: <Widget>[
                            Text(entrada.nome, style: textos.titleMedium),
                            if (atividade != null) ...<Widget>[
                              const SizedBox(height: BichuEspaco.e1),
                              Text(
                                atividade,
                                style: textos.bodyMedium
                                    ?.copyWith(color: cores.textSecondary),
                              ),
                            ],
                            if (bairro != null) ...<Widget>[
                              const SizedBox(height: BichuEspaco.e1),
                              Row(
                                crossAxisAlignment: CrossAxisAlignment.start,
                                children: <Widget>[
                                  Icon(
                                    Icons.place_outlined,
                                    size: BichuEspaco.e4,
                                    color: cores.textSecondary,
                                  ),
                                  const SizedBox(width: BichuEspaco.e1),
                                  Expanded(
                                    child: Text(
                                      bairro,
                                      style: textos.bodyMedium?.copyWith(
                                        color: cores.textSecondary,
                                      ),
                                    ),
                                  ),
                                ],
                              ),
                            ],
                            if (pontuacao != null) ...<Widget>[
                              const SizedBox(height: BichuEspaco.e1),
                              Semantics(
                                label: CartaoDoDiretorio.rotuloDaAvaliacao(
                                  pontuacao,
                                ),
                                child: ExcludeSemantics(
                                  child: Row(
                                    crossAxisAlignment:
                                        CrossAxisAlignment.start,
                                    children: <Widget>[
                                      if (pontuacao.temAvaliacoes) ...<Widget>[
                                        Icon(
                                          Icons.star,
                                          size: BichuEspaco.e4,
                                          color: cores.primary,
                                        ),
                                        const SizedBox(width: BichuEspaco.e1),
                                      ],
                                      Expanded(
                                        child: Text(
                                          CartaoDoDiretorio.textoDaAvaliacao(
                                            pontuacao,
                                          ),
                                          style:
                                              textos.bodyMedium?.copyWith(
                                            color: cores.textSecondary,
                                          ),
                                        ),
                                      ),
                                    ],
                                  ),
                                ),
                              ),
                            ],
                          ],
                        ),
                      ),
                    ],
                  ),
                ],
              ),
            ),
          ),
          if (telefone != null) ...<Widget>[
            const SizedBox(height: BichuEspaco.e3),
            Align(
              alignment: Alignment.centerLeft,
              child: Semantics(
                button: true,
                label: ligarPara(entrada.nome),
                excludeSemantics: true,
                onTap: () => _ligar(telefone),
                child: TextButton.icon(
                  onPressed: () => _ligar(telefone),
                  icon: const Icon(Icons.call_outlined),
                  label: const Text(rotuloDeLigar),
                ),
              ),
            ),
          ],
        ],
      ),
    );
  }

  Future<void> _ligar(String telefoneE164) async {
    await launchUrl(Uri(scheme: 'tel', path: telefoneE164));
  }
}

/// O esqueleto de uma entrada: tres barras dentro da mesma moldura do cartao.
class _EsqueletoDeEntrada extends StatelessWidget {
  const _EsqueletoDeEntrada();

  @override
  Widget build(BuildContext context) {
    final cores = BichuColors.of(context).cores;

    return ExcludeSemantics(
      child: Container(
        width: double.infinity,
        padding: const EdgeInsets.all(BichuEspaco.e4),
        decoration: BoxDecoration(
          color: cores.surface,
          borderRadius: BorderRadius.circular(BichuRaio.lg),
          border: Border.all(color: cores.outline, width: BichuBorda.hairline),
        ),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: <Widget>[
            _Barra(cor: cores.surfaceSunken, fracao: 0.6),
            const SizedBox(height: BichuEspaco.e2),
            _Barra(cor: cores.surfaceSunken, fracao: 0.4),
            const SizedBox(height: BichuEspaco.e2),
            _Barra(cor: cores.surfaceSunken, fracao: 0.8),
          ],
        ),
      ),
    );
  }
}

class _Barra extends StatelessWidget {
  const _Barra({required this.cor, required this.fracao});

  final Color cor;
  final double fracao;

  @override
  Widget build(BuildContext context) {
    return FractionallySizedBox(
      alignment: Alignment.centerLeft,
      widthFactor: fracao,
      child: Container(
        height: MediaQuery.textScalerOf(context).scale(BichuEspaco.e3),
        decoration: BoxDecoration(
          color: cor,
          borderRadius: BorderRadius.circular(BichuRaio.sm),
        ),
      ),
    );
  }
}
