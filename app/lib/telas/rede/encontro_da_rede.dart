import 'package:flutter/material.dart';
import 'package:go_router/go_router.dart';

import '../../api/falhas.dart';
import '../../api/mensagens_de_erro.dart';
import '../../api/modelos_pet.dart';
import '../../api/modelos_rede.dart';
import '../../api/rede_api.dart';
import '../../dispositivo/saida_do_app.dart';
import '../../escopo.dart';
import '../../roteamento/rotas.dart';
import '../../theme/bichu_colors.dart';
import '../../theme/bichu_tokens.g.dart';
import '../../widgets/faixa_de_aviso.dart';
import '../../widgets/marca.dart';
import 'local_do_encontro.dart';
import 'pecas_da_rede.dart';

/// A pagina de um encontro da `Rede` (design system 24.12 a 24.17, textos da
/// UX 28.1, 28.6 e 28.7).
///
/// ## ELA VOLTOU EM 20/10/2026, e a volta e correcao de pedido
///
/// Esta tela foi APAGADA em 19/10/2026 (`be057793`), e o cliente corrigiu o
/// pedido no dia seguinte, literal: *"eu nao pedi pra voce remover, eu pedi
/// para remover o clique para o usuario nnao conseguir acessar a pagina de
/// detalhes e pedi pra voce resumir a listagem com foto, titulo do evento"*.
///
/// O que ele pediu em 19/10 eram DUAS coisas -- tirar o clique e resumir o
/// cartao --, e a entrega leu como uma terceira: apagar a pagina. O arquivo
/// voltou do historico (`be057793^`), e nao foi reescrito.
///
/// **E o clique agora depende da SESSAO**, que e o pedido de 20/10 inteiro:
/// *"quando o usuario estiver deslogado e tentar clicar para ver detalhes de
/// algum conteudo, como por exemplo os eventos, que ele precisa estar logado
/// para ver mais informacoes"*. Quem decide e `agenda_da_rede.dart`, que
/// conhece a sessao; deslogado o toque abre a folha com o convite e **nao**
/// esta pagina.
///
/// ## O EVENTO PRIVADO NAO VOLTOU, e a ausencia e decisao dele
///
/// *"vamos deixar apenas os eventos abertos por enquanto, no futuro
/// analisamos a necessidade"*. Sairam desta pagina, em relacao a versao
/// restaurada: o teaser do privado, `Pedir para participar`, `Desistir do
/// pedido`, a caixa de estado do pedido, a folha de guarda de acao do pedido,
/// o selo `Privado` e a leitura de `getNetworkEventPrivateDetails`. Com eles
/// saiu a intencao `pedir_para_participar` -- que ja nao tinha executor
/// registrado em `app.dart`.
///
/// **`TeaserDoPrivado` continua no modelo**, porque o contrato continua
/// podendo mandar um: se ele chegar, esta pagina desenha so o que o teaser
/// carrega (banner, titulo e o dia) e nenhuma caixa de pedido. Ela nao
/// inventa frase para um estado que o produto nao tem.
///
/// ## Ordem, de cima para baixo (24.15, com as trocas de 24.17)
///
/// Capa 16:9 com `Voltar` flutuante; cabecalho (titulo, `Organizado pela
/// equipe do Bichu`, selo de valor); aviso de cancelado; `Quando`; `Local`
/// (com o mapa); `Sobre o evento`; `Links`; `Fotos`; `Para quais cães`; `O que
/// levar`; `Cuidados no evento`; `Acessibilidade e estrutura`;
/// `Observações`. **Sem `Quem organiza` e sem `Compartilhar`** (24.17.1 e
/// 24.15 item 4). Sem check-in, sem galeria da comunidade e sem lista de
/// presenca (ADR-0025).
///
/// ## Duas operacoes, e a segunda so quando pode
///
/// - `getNetworkEvent`, sem token, sempre. Medido em 20/10/2026 na
///   homologacao: `GET /v1/network/events/{slug}` responde **200 sem conta**.
/// - `getNetworkEventLocation`, **so com conta** e so quando o encontro nao
///   esta cancelado. Medido no mesmo dia: a rota responde **401
///   unauthenticated** sem token e 200 com token -- e ela e a unica
///   informacao de evento que o servidor de fato guarda atras de conta. Sem
///   conta nao ha pergunta, nao ha ponto e nao ha mapa: o bloco `Local` fica
///   so com o endereco que veio na projecao publica (a isca confere que a
///   chamada nao sai).
///
/// ## A distancia
///
/// Vem do cartao, que a leu de `listNearbyNetworkEvents` (a regiao
/// cadastrada; o GPS nao participa). Nunca em encerrado nem em cancelado.
class TelaDoEncontro extends StatefulWidget {
  const TelaDoEncontro({
    required this.slug,
    super.key,
    this.distanciaEmMetros,
  });

  final String slug;
  final int? distanciaEmMetros;

  static const String tituloDaTela = 'Evento';
  static const String rotuloDeAtualizar = 'Atualizar';
  static const String organizadoPor = 'Organizado pela equipe do Bichu';
  static const String avisoDeCancelado =
      'A equipe do Bichu cancelou este evento. Ele não vai acontecer.';
  static const String rotuloDoCalendario = 'Adicionar ao calendário';
  static const String falhaDoCalendario =
      'Não conseguimos abrir o calendário.';

  /// As quatro frases de `Cuidados no evento` (UX 28.7.1). A segunda varia
  /// por `fenced_off_leash_area`.
  static List<String> cuidados({required bool areaCercada}) => <String>[
        'Recolha o cocô e leve o saquinho embora.',
        areaCercada
            ? 'Na área cercada, o cão pode ficar solto. Fora dela, na guia.'
            : 'Mantenha o cão na guia o tempo todo.',
        'Se o seu cão parecer desconfortável, afaste-se do grupo com ele por '
            'um tempo.',
        'Fêmea no cio fica em casa.',
      ];

  /// Empilha o encontro no ramo da `Rede`, com a barra de abas.
  static Future<void> abrir(
    BuildContext context,
    String slug, {
    int? distanciaEmMetros,
  }) {
    return context.push<void>(
      Rotas.encontroDaRedeDe(slug),
      extra: distanciaEmMetros,
    );
  }

  @override
  State<TelaDoEncontro> createState() => _TelaDoEncontroState();
}

enum _Fase { carregando, pronto, falha }

class _TelaDoEncontroState extends State<TelaDoEncontro> {
  _Fase _fase = _Fase.carregando;
  String? _textoDaFalha;
  EncontroDaRede? _encontro;

  PontoNoBloco _ponto = const SoEndereco();

  /// `street_address`, que vem da mesma chamada do ponto e exige conta. Nulo
  /// sem conta, no cancelado e no encontro que nao tem endereco escrito.
  String? _endereco;

  final ScrollController _rolagem = ScrollController();
  bool _barraVisivel = false;

  bool _cargaAgendada = false;

  @override
  void initState() {
    super.initState();
    _rolagem.addListener(_aoRolar);
    _agendarCarga();
  }

  @override
  void dispose() {
    _rolagem.dispose();
    super.dispose();
  }

  void _agendarCarga() {
    if (_cargaAgendada) return;
    _cargaAgendada = true;
    WidgetsBinding.instance.addPostFrameCallback((_) {
      _cargaAgendada = false;
      if (mounted) _carregar();
    });
  }

  /// A barra de topo normal volta quando a capa sai da tela (24.17.1, item
  /// 7): a partir da altura da capa menos 48 dp.
  void _aoRolar() {
    final largura = MediaQuery.sizeOf(context).width;
    final limite = largura / proporcaoDaCapa - BichuAlvoDeToque.min;
    final visivel = _rolagem.hasClients && _rolagem.offset > limite;
    if (visivel != _barraVisivel) setState(() => _barraVisivel = visivel);
  }

  bool get _logado => Escopo.of(context).sessao.logado;

  RedeApi get _rede => RedeApi(Escopo.of(context).api);

  Future<void> _carregar() async {
    if (!mounted) return;
    setState(() {
      _fase = _Fase.carregando;
      _textoDaFalha = null;
    });
    try {
      final encontro = await _rede.detalhar(widget.slug);
      if (!mounted) return;
      setState(() {
        _encontro = encontro;
        _fase = _Fase.pronto;
      });
      _carregarPonto();
    } on FalhaDeChamada catch (falha) {
      if (!mounted) return;
      setState(() {
        _textoDaFalha = MensagensDeErro.de(falha).texto;
        _encontro = null;
        _fase = _Fase.falha;
      });
    } on FormatException {
      if (!mounted) return;
      setState(() {
        _textoDaFalha = MensagensDeErro.servidorFora;
        _encontro = null;
        _fase = _Fase.falha;
      });
    }
  }

  /// O ponto so e perguntado com conta, com lugar na tela e sem cancelamento.
  bool get _deveBuscarPonto {
    final e = _encontro;
    if (!_logado || e == null) return false;
    if (e.situacao == SituacaoDoEncontro.cancelado) return false;
    // **`EncontroPublico` e o unico caso que pergunta.** `TeaserDoPrivado`
    // nao tem lugar na tela para o ponto cair, e o produto nao tem evento
    // privado desde 19/10/2026.
    return e is EncontroPublico;
  }

  Future<void> _carregarPonto() async {
    if (!_deveBuscarPonto) {
      setState(() {
        _ponto = const SoEndereco();
        _endereco = null;
      });
      return;
    }
    setState(() => _ponto = const PontoCarregando());
    try {
      final local = await _rede.localizacao(widget.slug);
      if (!mounted) return;
      final ponto = local.ponto;
      setState(() {
        _ponto = ponto == null ? const SoEndereco() : PontoConhecido(ponto);
        _endereco = local.endereco;
      });
    } on FalhaDaApi catch (falha) {
      if (!mounted) return;
      // 404 aqui e "sem ponto para esta conta", com o mesmo corpo de "nao
      // existe": o bloco fica so com o endereco, sem acusar nada.
      setState(() {
        _ponto = falha.problem.status == 404
            ? const SoEndereco()
            : const PontoComFalha();
        _endereco = null;
      });
    } on FalhaDeChamada {
      if (!mounted) return;
      setState(() {
        _ponto = const PontoComFalha();
        _endereco = null;
      });
    } on FormatException {
      if (!mounted) return;
      setState(() {
        _ponto = const PontoComFalha();
        _endereco = null;
      });
    }
  }

  void _avisar(String texto) {
    ScaffoldMessenger.maybeOf(context)?.showSnackBar(
      SnackBar(content: Text(texto)),
    );
  }

  Future<void> _adicionarAoCalendario(ConteudoDoEncontro c) async {
    final abriu = await SaidaDoApp.atual.adicionarAoCalendario(
      EventoDeCalendario(
        titulo: c.titulo,
        inicio: c.horario.inicio,
        fim: c.horario.fim,
        local: c.lugar.linhaCompleta,
        descricao: c.resumo,
      ),
    );
    if (!abriu && mounted) _avisar(TelaDoEncontro.falhaDoCalendario);
  }

  void _voltar() {
    if (context.canPop()) {
      context.pop();
    } else {
      context.go(Rotas.rede);
    }
  }

  // -------------------------------------------------------------------------
  // A pagina
  // -------------------------------------------------------------------------

  @override
  Widget build(BuildContext context) {
    final encontro = _encontro;
    if (_fase != _Fase.pronto || encontro == null) {
      return Scaffold(
        appBar: AppBar(
          toolbarHeight: BichuAlvoDeToque.critico,
          leadingWidth: BichuAlvoDeToque.critico,
          leading: _BotaoVoltar(aoTocar: _voltar),
          title: const Text(TelaDoEncontro.tituloDaTela),
        ),
        body: SafeArea(
          child: ListView(
            padding: const EdgeInsets.all(BichuEspaco.e4),
            children: <Widget>[
              if (_fase == _Fase.carregando)
                const _EsqueletoDoEncontro()
              else
                FaixaDeAviso(
                  texto: _textoDaFalha ?? MensagensDeErro.servidorFora,
                  rotuloDaAcao: TelaDoEncontro.rotuloDeAtualizar,
                  aoTocarNaAcao: _carregar,
                ),
            ],
          ),
        ),
      );
    }

    final cores = BichuColors.of(context).cores;
    final textos = Theme.of(context).textTheme;

    return Scaffold(
      body: SafeArea(
        child: Semantics(
          // A rota anuncia `Evento: {título}`: nao ha titulo visivel na
          // barra do topo enquanto a capa esta na tela (UX 28.7.2).
          scopesRoute: true,
          namesRoute: true,
          explicitChildNodes: true,
          label: '${TelaDoEncontro.tituloDaTela}: ${encontro.titulo}',
          child: Stack(
            children: <Widget>[
              ListView(
                controller: _rolagem,
                padding: const EdgeInsets.only(bottom: BichuEspaco.e8),
                children: _pagina(encontro),
              ),
              if (_barraVisivel)
                Positioned(
                  left: 0,
                  right: 0,
                  top: 0,
                  child: Material(
                    color: cores.surface,
                    elevation: 0,
                    child: Container(
                      height: BichuAlvoDeToque.critico,
                      decoration: BoxDecoration(
                        border: Border(
                          bottom: BorderSide(
                            color: cores.outline,
                            width: BichuBorda.hairline,
                          ),
                        ),
                        boxShadow: Theme.of(context).brightness ==
                                Brightness.dark
                            ? null
                            : BichuSombra.sm,
                      ),
                      child: Row(
                        children: <Widget>[
                          _BotaoVoltar(aoTocar: _voltar),
                          Expanded(
                            child: Text(
                              encontro.titulo,
                              maxLines: 1,
                              overflow: TextOverflow.ellipsis,
                              style: textos.titleMedium,
                            ),
                          ),
                          const SizedBox(width: BichuEspaco.e4),
                        ],
                      ),
                    ),
                  ),
                )
              else
                Positioned(
                  left: BichuEspaco.e2,
                  top: BichuEspaco.e2,
                  child: _BotaoVoltarSobreMidia(aoTocar: _voltar),
                ),
            ],
          ),
        ),
      ),
    );
  }

  List<Widget> _pagina(EncontroDaRede encontro) {
    final cores = BichuColors.of(context).cores;
    final textos = Theme.of(context).textTheme;
    final situacao = encontro.situacao;
    final cancelado = situacao == SituacaoDoEncontro.cancelado;
    final encerrado = situacao == SituacaoDoEncontro.encerrado;
    final vivo = !cancelado && !encerrado;
    final ano = DateTime.now().year;

    // O conteudo desenhavel. **`TeaserDoPrivado` da nulo**, e nao o detalhe
    // oculto: o evento privado saiu do produto em 19/10/2026 por decisao do
    // cliente, e com ele a leitura de `getNetworkEventPrivateDetails`. Um
    // teaser que chegasse desenha so o que ele carrega -- banner, titulo e o
    // dia --, sem caixa de pedido e sem frase inventada para um estado que o
    // produto nao tem.
    final ConteudoDoEncontro? conteudo = switch (encontro) {
      EncontroPublico() => encontro,
      TeaserDoPrivado() => null,
    };

    // A distancia: nunca fora de "a vir" / "acontecendo".
    final distancia = vivo ? widget.distanciaEmMetros : null;

    // A CAPA. **Verbatim de `be057793^`, menos UMA coisa: o cinza.**
    //
    // O distintivo sobre a imagem FICA -- `Cancelado` grande no centro,
    // `Acontecendo agora` / `Encerrado` no canto --, e ele e informacao e nao
    // enfeite nesta tela: quem abre a pagina de um encontro precisa saber, na
    // primeira dobra, que ele nao vai acontecer ou que ja aconteceu.
    // `DistintivoDeSituacao` nao foi reescrito; ele ja estava de volta em
    // `pecas_da_rede.dart`, trazido por `feat/meus-eventos-e-cancelar`.
    //
    // **O que NAO voltou e o `cancelado: true` da imagem**, que pintava a capa
    // em escala de cinza. Ele saiu em 19/10 porque cor sozinha nao e sinal
    // (SC 1.4.1) e nao voltou no cartao; repo-lo aqui so nesta tela faria a
    // mesma informacao ter dois desenhos no mesmo app. A palavra basta, e ela
    // esta em dois lugares: este distintivo e o [_AvisoDeCancelado] em texto,
    // logo abaixo do cabecalho.
    //
    // `cover_banner_url` PRIMEIRO: esta capa e de borda a borda, 360 a 430 dp
    // (1080 a 1290 px a 3x), e borrava de leve com a derivada de 1024 px que o
    // cartao da agenda usa. Com a capa como reserva, o encontro gravado antes
    // desta derivada existir continua desenhando.
    final capa = Stack(
      children: <Widget>[
        ImagemDoEncontroOuBanner(
          url: conteudo?.urlDoBannerDaCapa ?? conteudo?.urlDaCapa,
          textoAlternativo: conteudo?.urlDaCapa == null
              ? null
              : conteudo?.textoAlternativoDaCapa,
        ),
        if (cancelado)
          const Positioned.fill(
            child: Center(
              child: DistintivoDeSituacao(
                situacao: SituacaoDoEncontro.cancelado,
                grande: true,
              ),
            ),
          )
        else if (situacao != null && rotuloDaSituacao(situacao) != null)
          Positioned(
            right: BichuEspaco.e3,
            bottom: BichuEspaco.e3,
            child: DistintivoDeSituacao(situacao: situacao),
          ),
      ],
    );

    final cabecalho = Padding(
      padding: const EdgeInsets.fromLTRB(
        BichuEspaco.e4,
        BichuEspaco.e4,
        BichuEspaco.e4,
        0,
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: <Widget>[
          Semantics(
            header: true,
            child: Text(encontro.titulo, style: textos.headlineSmall),
          ),
          const SizedBox(height: BichuEspaco.e2),
          Row(
            children: <Widget>[
              const ExcludeSemantics(child: MarcaSimbolo(altura: BichuEspaco.e6)),
              const SizedBox(width: BichuEspaco.e2),
              Expanded(
                child: Text(
                  TelaDoEncontro.organizadoPor,
                  style: textos.bodySmall?.copyWith(color: cores.textSecondary),
                ),
              ),
            ],
          ),
          const SizedBox(height: BichuEspaco.e3),
          Wrap(
            spacing: BichuEspaco.e2,
            runSpacing: BichuEspaco.e2,
            children: <Widget>[
              // O SELO DE VALOR FICA. Ele saiu do CARTAO por pedido do
              // cliente (*"apenas a foto e o titulo"*), e `Gratuito` ou
              // `R$ 15 por cão` e justamente o tipo de coisa que a pessoa vem
              // procurar na pagina -- e que o cartao resumido nao diz mais.
              if (conteudo != null) seloDeValor(conteudo.entrada),
            ],
          ),
        ],
      ),
    );

    final secoes = <Widget>[];
    void secao(IconData icone, String titulo, Widget filho) {
      secoes
        ..add(const SizedBox(height: BichuEspaco.e6))
        ..add(_Secao(icone: icone, titulo: titulo, child: filho));
    }

    if (cancelado) {
      secoes
        ..add(const SizedBox(height: BichuEspaco.e4))
        ..add(const _Margem(child: _AvisoDeCancelado()));
    }

    // QUANDO: o dia sempre; horario e calendario so com conteudo.
    secao(
      Icons.event_outlined,
      'Quando',
      _CaixaQuando(
        dia: encontro.dia,
        ano: ano,
        horario: conteudo?.horario,
        acao: conteudo != null && vivo
            ? OutlinedButton.icon(
                onPressed: () => _adicionarAoCalendario(conteudo),
                style: OutlinedButton.styleFrom(
                  minimumSize: const Size.fromHeight(BichuAlvoDeToque.critico),
                ),
                icon: const Icon(Icons.edit_calendar_outlined),
                label: const Text(TelaDoEncontro.rotuloDoCalendario),
              )
            : null,
      ),
    );

    if (conteudo != null) {
      secao(
        Icons.place_outlined,
        'Local',
        LocalDoEncontro(
          lugar: conteudo.lugar,
          ponto: cancelado ? const SoEndereco() : _ponto,
          enderecoPorExtenso: cancelado ? null : _endereco,
          distanciaEmMetros: distancia,
          aoTentarDeNovo: _carregarPonto,
        ),
      );
      secao(
        Icons.notes_outlined,
        'Sobre o evento',
        Text(conteudo.resumo, style: textos.bodyLarge),
      );
      // Links publicos: nao dependem de conta, e so aparecem os que vieram.
      // Sem nenhum dos dois, a secao inteira nao existe -- nada de moldura
      // vazia (pedido do cliente de 01/10).
      if (!cancelado &&
          (conteudo.urlDoConvite != null || conteudo.urlDoInstagram != null)) {
        secao(
          Icons.link_outlined,
          'Links',
          _Links(
            convite: conteudo.urlDoConvite,
            instagram: conteudo.urlDoInstagram,
          ),
        );
      }
      if (!cancelado && conteudo.imagens.length > 1) {
        secao(
          Icons.photo_library_outlined,
          'Fotos',
          _Fotos(imagens: conteudo.imagens),
        );
      }
      if (vivo) {
        secao(Icons.pets_outlined, 'Para quais cães', _ParaQuaisCaes(c: conteudo));
        if (conteudo.oQueLevar.isNotEmpty) {
          secao(
            Icons.backpack_outlined,
            'O que levar',
            _OQueLevar(itens: conteudo.oQueLevar),
          );
        }
        secao(
          Icons.health_and_safety_outlined,
          'Cuidados no evento',
          _Cuidados(
            frases: TelaDoEncontro.cuidados(
              areaCercada: conteudo.areaCercadaParaSoltar,
            ),
          ),
        );
        final estrutura = <String>[
          if (conteudo.areaCercadaParaSoltar) 'Área cercada para cães soltos',
          for (final e in conteudo.estrutura) e.rotulo,
        ];
        if (estrutura.isNotEmpty) {
          secao(
            Icons.accessible_outlined,
            'Acessibilidade e estrutura',
            _ListaComVisto(itens: estrutura),
          );
        }
        final notas = conteudo.observacoes;
        if (notas != null) {
          secao(
            Icons.info_outline,
            'Observações',
            // Texto puro: nada vira link (contrato, `NetworkEventNotes`).
            Text(notas, style: textos.bodySmall),
          );
        }
      }
    }

    return <Widget>[capa, cabecalho, ...secoes];
  }

}

// ---------------------------------------------------------------------------
// As pecas da pagina
// ---------------------------------------------------------------------------

class _Margem extends StatelessWidget {
  const _Margem({required this.child});
  final Widget child;

  @override
  Widget build(BuildContext context) => Padding(
        padding: const EdgeInsets.symmetric(horizontal: BichuEspaco.e4),
        child: child,
      );
}

class _Secao extends StatelessWidget {
  const _Secao({required this.icone, required this.titulo, required this.child});

  final IconData icone;
  final String titulo;
  final Widget child;

  @override
  Widget build(BuildContext context) {
    final cores = BichuColors.of(context).cores;
    final textos = Theme.of(context).textTheme;
    return _Margem(
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: <Widget>[
          Row(
            children: <Widget>[
              ExcludeSemantics(child: Icon(icone, color: cores.primary)),
              const SizedBox(width: BichuEspaco.e2),
              Expanded(
                child: Semantics(
                  header: true,
                  child: Text(titulo, style: textos.titleMedium),
                ),
              ),
            ],
          ),
          const SizedBox(height: BichuEspaco.e3),
          child,
        ],
      ),
    );
  }
}

class _AvisoDeCancelado extends StatelessWidget {
  const _AvisoDeCancelado();

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
      child: Text(
        TelaDoEncontro.avisoDeCancelado,
        style: textos.bodyLarge?.copyWith(color: cores.textPrimary),
      ),
    );
  }
}

class _CaixaQuando extends StatelessWidget {
  const _CaixaQuando({
    required this.dia,
    required this.ano,
    required this.horario,
    required this.acao,
  });

  final DiaDoEncontro dia;
  final int ano;

  /// Nulo no privado nao aprovado: so a data, sem hora (24.16).
  final HorarioDoEncontro? horario;
  final Widget? acao;

  @override
  Widget build(BuildContext context) {
    final cores = BichuColors.of(context).cores;
    final textos = Theme.of(context).textTheme;
    final h = horario;
    return Container(
      width: double.infinity,
      padding: const EdgeInsets.all(BichuEspaco.e4),
      decoration: BoxDecoration(
        color: cores.surfaceAlt,
        borderRadius: BorderRadius.circular(BichuRaio.lg),
        border: Border.all(color: cores.outline, width: BichuBorda.hairline),
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: <Widget>[
          Row(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: <Widget>[
              BlocoDoDia(dia: dia, comFundo: false),
              const SizedBox(width: BichuEspaco.e4),
              Expanded(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: <Widget>[
                    Text(
                      dia.dataLonga(anoCorrente: ano),
                      style: textos.labelLarge?.copyWith(
                        color: cores.textPrimary,
                      ),
                    ),
                    if (h != null) ...<Widget>[
                      const SizedBox(height: BichuEspaco.e1),
                      Text(h.faixaComDuracao, style: textos.bodySmall),
                      const SizedBox(height: BichuEspaco.e1),
                      Text(
                        h.fuso.rotulo,
                        style: textos.labelSmall?.copyWith(
                          color: cores.textSecondary,
                        ),
                      ),
                    ],
                  ],
                ),
              ),
            ],
          ),
          if (acao != null) ...<Widget>[
            const SizedBox(height: BichuEspaco.e4),
            acao!,
          ],
        ],
      ),
    );
  }
}

class _Fotos extends StatelessWidget {
  const _Fotos({required this.imagens});

  final List<ImagemDoEncontro> imagens;

  /// A miniatura: 144 dp de largura (pedido P-M6), 4:3.
  static const double _largura = 144;

  @override
  Widget build(BuildContext context) {
    final cores = BichuColors.of(context).cores;
    return SizedBox(
      height: _largura / proporcaoDaFoto,
      child: ListView.separated(
        scrollDirection: Axis.horizontal,
        itemCount: imagens.length,
        separatorBuilder: (_, _) => const SizedBox(width: BichuEspaco.e3),
        itemBuilder: (context, i) => ClipRRect(
          borderRadius: BorderRadius.circular(BichuRaio.md),
          child: SizedBox(
            width: _largura,
            child: Image.network(
              // A MINIATURA, e nao a capa de 1024 px. Esta galeria desenha
              // 144 dp em 4:3 (432 px a 3x) e baixava 1024 px -- cinco vezes o
              // dado que ela pinta, oito vezes numa galeria cheia.
              imagens[i].urlParaGaleria,
              fit: BoxFit.cover,
              semanticLabel: imagens[i].textoAlternativo,
              errorBuilder: (_, _, _) => ColoredBox(color: cores.surfaceSunken),
            ),
          ),
        ),
      ),
    );
  }
}

class _Pilula extends StatelessWidget {
  const _Pilula({required this.texto, this.icone});

  final String texto;
  final IconData? icone;

  @override
  Widget build(BuildContext context) {
    final cores = BichuColors.of(context).cores;
    final textos = Theme.of(context).textTheme;
    return Container(
      padding: const EdgeInsets.symmetric(
        horizontal: BichuEspaco.e3,
        vertical: BichuEspaco.e1,
      ),
      decoration: BoxDecoration(
        color: cores.surfaceSunken,
        borderRadius: BorderRadius.circular(BichuRaio.full),
        border: Border.all(color: cores.outline, width: BichuBorda.hairline),
      ),
      child: Row(
        mainAxisSize: MainAxisSize.min,
        children: <Widget>[
          if (icone != null) ...<Widget>[
            ExcludeSemantics(
              child: Icon(icone, size: BichuEspaco.e5, color: cores.primary),
            ),
            const SizedBox(width: BichuEspaco.e1),
          ],
          Flexible(
            child: Text(
              texto,
              style: textos.labelMedium?.copyWith(color: cores.textPrimary),
            ),
          ),
        ],
      ),
    );
  }
}

/// `Para quais cães`: portes, idade e `Vacinação em dia` (so quando exigida).
/// **Sem pilula de guia** (UX 28.7.2): a frase inteira esta em `Cuidados`.
class _ParaQuaisCaes extends StatelessWidget {
  const _ParaQuaisCaes({required this.c});

  final ConteudoDoEncontro c;

  @override
  Widget build(BuildContext context) {
    final todos = c.portesAceitos.length == Porte.values.length;
    final idade = c.idadeDosCaes;
    return Wrap(
      spacing: BichuEspaco.e2,
      runSpacing: BichuEspaco.e2,
      children: <Widget>[
        if (todos)
          const _Pilula(texto: 'Todos os portes')
        else
          for (final p in Porte.values)
            if (c.portesAceitos.contains(p)) _Pilula(texto: p.rotulo),
        if (idade != null) _Pilula(texto: idade.rotulo),
        if (c.vacinacaoExigida)
          const _Pilula(
            texto: 'Vacinação em dia',
            icone: Icons.check_circle_outline,
          ),
      ],
    );
  }
}

/// `O que levar`, em duas colunas, com o icone fixo de cada item (24.13.3).
class _OQueLevar extends StatelessWidget {
  const _OQueLevar({required this.itens});

  final List<ItemParaLevar> itens;

  static IconData icone(ItemParaLevar item) => switch (item) {
        ItemParaLevar.agua => Icons.water_drop_outlined,
        ItemParaLevar.poteDeAgua => Icons.water_drop_outlined,
        ItemParaLevar.saquinho => Icons.shopping_bag_outlined,
        ItemParaLevar.guia => Icons.link,
        ItemParaLevar.petisco => Icons.star_outline,
        ItemParaLevar.brinquedo => Icons.sports_baseball_outlined,
        ItemParaLevar.toalha => Icons.check_circle_outline,
        ItemParaLevar.carteiraDeVacinacao => Icons.check_circle_outline,
      };

  @override
  Widget build(BuildContext context) {
    final cores = BichuColors.of(context).cores;
    final textos = Theme.of(context).textTheme;
    return LayoutBuilder(
      builder: (context, limites) {
        final coluna = (limites.maxWidth - BichuEspaco.e3) / 2;
        return Wrap(
          spacing: BichuEspaco.e3,
          runSpacing: BichuEspaco.e2,
          children: <Widget>[
            for (final item in itens)
              SizedBox(
                width: coluna,
                child: Row(
                  children: <Widget>[
                    ExcludeSemantics(
                      child: Icon(
                        icone(item),
                        size: BichuEspaco.e5,
                        color: cores.primary,
                      ),
                    ),
                    const SizedBox(width: BichuEspaco.e2),
                    Expanded(child: Text(item.rotulo, style: textos.bodySmall)),
                  ],
                ),
              ),
          ],
        );
      },
    );
  }
}

/// `Cuidados no evento`, com marcador NEUTRO: um ponto de 8 dp em
/// `textSecondary`, sem o visto, que se lia como "feito" (24.17.1, item 1).
class _Cuidados extends StatelessWidget {
  const _Cuidados({required this.frases});

  final List<String> frases;

  @override
  Widget build(BuildContext context) {
    final cores = BichuColors.of(context).cores;
    final textos = Theme.of(context).textTheme;
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: <Widget>[
        for (final f in frases)
          Padding(
            padding: const EdgeInsets.only(bottom: BichuEspaco.e2),
            child: Row(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: <Widget>[
                Padding(
                  padding: const EdgeInsets.only(top: BichuEspaco.e2),
                  child: Container(
                    width: BichuEspaco.e2,
                    height: BichuEspaco.e2,
                    decoration: BoxDecoration(
                      color: cores.textSecondary,
                      shape: BoxShape.circle,
                    ),
                  ),
                ),
                const SizedBox(width: BichuEspaco.e3),
                Expanded(child: Text(f, style: textos.bodyMedium)),
              ],
            ),
          ),
      ],
    );
  }
}

class _ListaComVisto extends StatelessWidget {
  const _ListaComVisto({required this.itens});

  final List<String> itens;

  @override
  Widget build(BuildContext context) {
    final cores = BichuColors.of(context).cores;
    final textos = Theme.of(context).textTheme;
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: <Widget>[
        for (final i in itens)
          Padding(
            padding: const EdgeInsets.only(bottom: BichuEspaco.e2),
            child: Row(
              children: <Widget>[
                ExcludeSemantics(
                  child: Icon(
                    Icons.check_circle_outline,
                    size: BichuEspaco.e5,
                    color: cores.primary,
                  ),
                ),
                const SizedBox(width: BichuEspaco.e2),
                Expanded(child: Text(i, style: textos.bodyMedium)),
              ],
            ),
          ),
      ],
    );
  }
}

/// A volta com a barra de topo normal.
class _BotaoVoltar extends StatelessWidget {
  const _BotaoVoltar({required this.aoTocar});
  final VoidCallback aoTocar;

  @override
  Widget build(BuildContext context) {
    return IconButton(
      onPressed: aoTocar,
      tooltip: 'Voltar',
      icon: const Icon(Icons.arrow_back),
      constraints: const BoxConstraints(
        minWidth: BichuAlvoDeToque.critico,
        minHeight: BichuAlvoDeToque.critico,
      ),
      color: BichuColors.of(context).cores.textPrimary,
    );
  }
}

/// `Botão sobre mídia`: 48 dp, fundo `surface`, sombra propria, para o
/// contraste nao depender da foto (24.12.1 e 24.12.6).
class _BotaoVoltarSobreMidia extends StatelessWidget {
  const _BotaoVoltarSobreMidia({required this.aoTocar});
  final VoidCallback aoTocar;

  @override
  Widget build(BuildContext context) {
    final cores = BichuColors.of(context).cores;
    final escuro = Theme.of(context).brightness == Brightness.dark;
    return DecoratedBox(
      decoration: BoxDecoration(
        color: cores.surface,
        shape: BoxShape.circle,
        boxShadow: escuro ? null : BichuSombra.md,
        border: escuro
            ? Border.all(color: cores.outline, width: BichuBorda.hairline)
            : null,
      ),
      child: IconButton(
        onPressed: aoTocar,
        tooltip: 'Voltar',
        icon: const Icon(Icons.arrow_back),
        constraints: const BoxConstraints(
          minWidth: BichuAlvoDeToque.min,
          minHeight: BichuAlvoDeToque.min,
        ),
        color: cores.textPrimary,
      ),
    );
  }
}

class _EsqueletoDoEncontro extends StatelessWidget {
  const _EsqueletoDoEncontro();

  @override
  Widget build(BuildContext context) {
    final cores = BichuColors.of(context).cores;
    return Semantics(
      label: 'Carregando o evento',
      child: AspectRatio(
        aspectRatio: proporcaoDaCapa,
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

/// Os links publicos do encontro: uma linha por link, e so os que vieram.
///
/// **Sem moldura vazia**: a secao nao e montada quando os dois sao nulos, e
/// aqui cada linha depende do seu link. Abrem no navegador do aparelho.
class _Links extends StatelessWidget {
  const _Links({required this.convite, required this.instagram});

  final Uri? convite;
  final Uri? instagram;

  static const String rotuloDoConvite = 'Comprar convite';
  static const String rotuloDoInstagram = 'Instagram';
  static const String falhaAoAbrir = 'Não conseguimos abrir o link.';

  static Future<void> _abrir(BuildContext context, Uri link) async {
    final mensageiro = ScaffoldMessenger.maybeOf(context);
    final abriu = await SaidaDoApp.atual.abrirLink(link);
    if (!abriu) {
      mensageiro?.showSnackBar(const SnackBar(content: Text(falhaAoAbrir)));
    }
  }

  @override
  Widget build(BuildContext context) {
    final c = convite;
    final i = instagram;
    return Column(
      crossAxisAlignment: CrossAxisAlignment.stretch,
      children: <Widget>[
        if (c != null) _LinhaDeLink(rotulo: rotuloDoConvite, link: c),
        if (c != null && i != null) const SizedBox(height: BichuEspaco.e2),
        if (i != null) _LinhaDeLink(rotulo: rotuloDoInstagram, link: i),
      ],
    );
  }
}

class _LinhaDeLink extends StatelessWidget {
  const _LinhaDeLink({required this.rotulo, required this.link});

  final String rotulo;
  final Uri link;

  @override
  Widget build(BuildContext context) {
    return Semantics(
      button: true,
      label: rotulo,
      onTap: () => _Links._abrir(context, link),
      excludeSemantics: true,
      child: OutlinedButton(
        onPressed: () => _Links._abrir(context, link),
        style: OutlinedButton.styleFrom(
          minimumSize: const Size.fromHeight(BichuAlvoDeToque.critico),
        ),
        child: Row(
          mainAxisAlignment: MainAxisAlignment.center,
          children: <Widget>[
            Flexible(child: Text(rotulo)),
            const SizedBox(width: BichuEspaco.e2),
            const Icon(Icons.open_in_new, size: BichuEspaco.e5),
          ],
        ),
      ),
    );
  }
}
