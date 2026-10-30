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
import '../../widgets/botao_primario.dart';
import '../../widgets/casca_da_pagina_interna.dart';
import '../../widgets/faixa_de_aviso.dart';
import '../../widgets/marca.dart';
import '../../widgets/visualizador_de_imagem.dart';
import 'local_do_encontro.dart';
import 'pecas_da_rede.dart';

/// A pagina de um encontro da `Rede` (design system 24.12 a 24.17, textos da UX
/// 28.1, 28.6 e 28.7).
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
  /// Cadastrado pela EQUIPE (`origin: admin`).
  static const String cadastradoPelaEquipe = 'Cadastrado pela equipe do Bichu';

  /// Cadastrado por uma conta do app (`origin: community`).
  static const String cadastradoPelaComunidade = 'Cadastrado pela comunidade';

  /// O rotulo da origem, ou **nulo quando o servidor nao disse**.
  static String? rotuloDaOrigem(OrigemDoEncontro? origem) {
    return switch (origem) {
      OrigemDoEncontro.equipe => cadastradoPelaEquipe,
      OrigemDoEncontro.comunidade => cadastradoPelaComunidade,
      null => null,
    };
  }

  /// O nome acessivel da capa quando o contrato nao traz `alt_text`.
  static const String nomeDaCapaSemTexto = 'Foto do evento';

  /// O que o toque na capa faz.
  static const String dicaDeAmpliarACapa = 'Ampliar';

  /// O nome acessivel de UMA miniatura da faixa `Fotos`.
  static String nomeDaFoto({required int posicao, required int total}) =>
      'Foto $posicao de $total';

  /// O que o toque na miniatura faz.
  static const String dicaDeAmpliarAFoto = dicaDeAmpliarACapa;
  static const String avisoDeCancelado =
      'A equipe do Bichu cancelou este evento. Ele não vai acontecer.';
  static const String rotuloDoCalendario = 'Adicionar ao calendário';
  static const String falhaDoCalendario =
      'Não conseguimos abrir o calendário.';

  /// O rotulo da acao. **`Compartilhar`, a mesma palavra da ficha do pet**, e
  /// nao `Convidar no WhatsApp`: quem decide o que a folha lista e o sistema, e
  /// duas palavras para o mesmo gesto fariam o app parecer ter dois recursos.
  static const String rotuloDeCompartilhar = 'Compartilhar';

  /// O nome acessivel: diz DE QUE evento e a acao, porque numa lista de acoes o
  /// leitor de tela le os rotulos fora de contexto.
  static String compartilharAcessivel(String titulo) =>
      'Compartilhar o evento $titulo';

  /// Quando a folha do sistema nao abriu.
  static const String falhaDoCompartilhar =
      'Não conseguimos abrir as opções de compartilhamento agora. '
      'Tente de novo.';

  /// A MENSAGEM QUE SAI DO PRODUTO E CHEGA EM ESTRANHOS.
  static String mensagemDeCompartilhar({
    required String titulo,
    required String dia,
    required String horario,
    required String lugar,
    Uri? link,
  }) {
    return '$titulo\n'
        '$dia · $horario\n'
        '$lugar\n'
        'Encontrei no Bichu. Vamos juntos?'
        '${link == null ? '' : '\n$link'}';
  }

  /// O assunto, que vira `EXTRA_SUBJECT` no Android e o assunto do e-mail
  /// quando o destino escolhido na folha e um aplicativo de e-mail.
  static String assuntoDeCompartilhar(String titulo) => 'Vamos juntos? $titulo';

  /// As quatro frases de `Cuidados no evento` (UX 28.7.1).
  static List<String> cuidados({required bool areaCercada}) => <String>[
        'Recolha o cocô e descarte em local adequado.',
        areaCercada
            ? 'Na área cercada, o cachorro pode ficar solto. Fora dela, na guia.'
            : 'Mantenha o cachorro na guia o tempo todo.',
        'Se o seu cachorro parecer desconfortável, afaste-se do grupo com ele por '
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

  /// `street_address`, que vem da mesma chamada do ponto e exige conta.
  String? _endereco;

  bool _cargaAgendada = false;

  @override
  void initState() {
    super.initState();
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

  /// `Compartilhar`: abre a FOLHA DO SISTEMA com o texto do encontro.
  Future<void> _compartilharOEncontro(
    EncontroDaRede encontro,
    ConteudoDoEncontro c,
  ) async {
    final abriu = await SaidaDoApp.atual.compartilharTexto(
      texto: TelaDoEncontro.mensagemDeCompartilhar(
        titulo: encontro.titulo,
        dia: encontro.dia.dataLonga(anoCorrente: DateTime.now().year),
        horario: c.horario.faixa,
        lugar: c.lugar.linhaCompleta,
        link: c.linkDaPagina,
      ),
      assunto: TelaDoEncontro.assuntoDeCompartilhar(encontro.titulo),
    );
    if (!abriu && mounted) _avisar(TelaDoEncontro.falhaDoCompartilhar);
  }

  void _voltar() {
    if (context.canPop()) {
      context.pop();
    } else {
      context.go(Rotas.rede);
    }
  }

  @override
  Widget build(BuildContext context) {
    final encontro = _encontro;
    if (_fase != _Fase.pronto || encontro == null) {
      return Scaffold(
        appBar: AppBar(
          toolbarHeight: BichuAlvoDeToque.critico,
          leadingWidth: BichuAlvoDeToque.critico,
          leading: BotaoVoltarNaBarra(aoTocar: _voltar),
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

    return CascaDaPaginaInterna(
      nome: encontro.titulo,
      prefixoAnunciado: TelaDoEncontro.tituloDaTela,
      aoVoltar: _voltar,
      proporcaoDaCapa: proporcaoDaCapa,
      recuo: const EdgeInsets.only(bottom: BichuEspaco.e8),
      filhos: _pagina(encontro),
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

    final ConteudoDoEncontro? conteudo = switch (encontro) {
      EncontroPublico() => encontro,
      TeaserDoPrivado() => null,
    };

    final distancia = vivo ? widget.distanciaEmMetros : null;

    final urlDaCapa = conteudo?.urlDoBannerDaCapa ?? conteudo?.urlDaCapa;
    final textoAlternativoDaCapa =
        conteudo?.urlDaCapa == null ? null : conteudo?.textoAlternativoDaCapa;

    final urlsParaAmpliar =
        conteudo?.urlsParaAmpliar ?? const <String>[];

    final capa = Stack(
      children: <Widget>[
        if (urlDaCapa == null)
          ImagemDoEncontroOuBanner(
            url: urlDaCapa,
            textoAlternativo: textoAlternativoDaCapa,
          )
        else
          Semantics(
            button: true,
            label: textoAlternativoDaCapa ?? TelaDoEncontro.nomeDaCapaSemTexto,
            hint: TelaDoEncontro.dicaDeAmpliarACapa,
            excludeSemantics: true,
            child: InkWell(
              onTap: () => VisualizadorDeImagem.abrirVarias(
                context,
                urls: urlsParaAmpliar,
                textoAlternativo: textoAlternativoDaCapa,
              ),
              child: ImagemDoEncontroOuBanner(
                url: urlDaCapa,
                textoAlternativo: textoAlternativoDaCapa,
              ),
            ),
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

    final rotuloDaOrigem = TelaDoEncontro.rotuloDaOrigem(conteudo?.origem);

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
          if (rotuloDaOrigem != null) ...<Widget>[
            const SizedBox(height: BichuEspaco.e2),
            Row(
              children: <Widget>[
                const ExcludeSemantics(child: MarcaSimbolo(altura: BichuEspaco.e6)),
                const SizedBox(width: BichuEspaco.e2),
                Expanded(
                  child: Text(
                    rotuloDaOrigem,
                    style: textos.bodySmall?.copyWith(color: cores.textSecondary),
                  ),
                ),
              ],
            ),
          ],
          const SizedBox(height: BichuEspaco.e3),
          Wrap(
            spacing: BichuEspaco.e2,
            runSpacing: BichuEspaco.e2,
            children: <Widget>[
              if (conteudo != null) seloDeValor(conteudo.entrada),
            ],
          ),
        ],
      ),
    );

    final convidar = conteudo != null && vivo
        ? _Margem(
            child: Padding(
              padding: const EdgeInsets.only(top: BichuEspaco.e4),
              child: BotaoSecundario(
                rotulo: TelaDoEncontro.rotuloDeCompartilhar,
                nomeAcessivel: TelaDoEncontro.compartilharAcessivel(
                  encontro.titulo,
                ),
                aoTocar: () => _compartilharOEncontro(encontro, conteudo),
              ),
            ),
          )
        : null;

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
      if (!cancelado &&
          (conteudo.urlDoConvite != null || conteudo.urlDoInstagram != null)) {
        secao(
          Icons.link_outlined,
          'Links',
          _Links(
            convite: conteudo.urlDoConvite,
            instagram: conteudo.urlDoInstagram,
            gratuito: conteudo.entrada.tipo == TipoDeEntrada.gratuito,
          ),
        );
      }
      if (!cancelado && conteudo.imagens.length > 1) {
        secao(
          Icons.photo_library_outlined,
          'Fotos',
          _Fotos(imagens: conteudo.imagens, urlsParaAmpliar: urlsParaAmpliar),
        );
      }
      if (vivo) {
        secao(Icons.pets_outlined, 'Para quais cachorros', _ParaQuaisCaes(c: conteudo));
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
          if (conteudo.areaCercadaParaSoltar) 'Área cercada para cachorros soltos',
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
            Text(notas, style: textos.bodySmall),
          );
        }
      }
    }

    return <Widget>[
      capa,
      cabecalho,
      ?convidar,
      ...secoes,
    ];
  }

}

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

/// A FAIXA `Fotos` DO DETALHE, e **cada miniatura abre o visualizador**.
class _Fotos extends StatelessWidget {
  const _Fotos({required this.imagens, required this.urlsParaAmpliar});

  final List<ImagemDoEncontro> imagens;

  /// As derivadas GRANDES, na ordem de [imagens].
  final List<String> urlsParaAmpliar;

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
        itemBuilder: (context, i) => _Miniatura(
          imagem: imagens[i],
          posicao: i + 1,
          total: imagens.length,
          largura: _largura,
          cores: cores,
          aoTocar: i >= urlsParaAmpliar.length
              ? null
              : () => VisualizadorDeImagem.abrirVarias(
                    context,
                    urls: urlsParaAmpliar,
                    inicial: i,
                    textoAlternativo: imagens[i].textoAlternativo,
                  ),
        ),
      ),
    );
  }
}

/// UMA miniatura da faixa `Fotos`.
class _Miniatura extends StatelessWidget {
  const _Miniatura({
    required this.imagem,
    required this.posicao,
    required this.total,
    required this.largura,
    required this.cores,
    required this.aoTocar,
  });

  final ImagemDoEncontro imagem;
  final int posicao;
  final int total;
  final double largura;
  final BichuCores cores;

  /// **Nulo nao e botao.** Ver a guarda em `_Fotos`.
  final VoidCallback? aoTocar;

  @override
  Widget build(BuildContext context) {
    final foto = ClipRRect(
      borderRadius: BorderRadius.circular(BichuRaio.md),
      child: SizedBox(
        width: largura,
        child: Image.network(
          imagem.urlParaGaleria,
          fit: BoxFit.cover,
          semanticLabel: imagem.textoAlternativo,
          errorBuilder: (_, _, _) => ColoredBox(color: cores.surfaceSunken),
        ),
      ),
    );
    if (aoTocar == null) return foto;
    return Semantics(
      button: true,
      label: imagem.textoAlternativo.isEmpty
          ? TelaDoEncontro.nomeDaFoto(posicao: posicao, total: total)
          : imagem.textoAlternativo,
      hint: TelaDoEncontro.dicaDeAmpliarAFoto,
      excludeSemantics: true,
      child: InkWell(
        onTap: aoTocar,
        borderRadius: BorderRadius.circular(BichuRaio.md),
        child: foto,
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

/// `Para quais cachorros`: portes, idade e `Vacinação em dia` (so quando
/// exigida).
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
class _Links extends StatelessWidget {
  const _Links({
    required this.convite,
    required this.instagram,
    required this.gratuito,
  });

  final Uri? convite;
  final Uri? instagram;

  /// Se a entrada deste encontro e `free`.
  final bool gratuito;

  /// O rotulo do link do ingresso, **nos dois estados** (cliente, 22/10/2026):
  /// *"O botao de comprar convite, deve ser alterado para Comprar Ingresso,
  /// porem caso o evento seja gratuito, temos que alterar
  static String rotuloDoConvite({required bool gratuito}) =>
      gratuito ? 'Retirar Ingresso' : 'Comprar Ingresso';
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
        if (c != null)
          _LinhaDeLink(
            rotulo: rotuloDoConvite(gratuito: gratuito),
            link: c,
          ),
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
