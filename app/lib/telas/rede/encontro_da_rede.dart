import 'package:flutter/material.dart';

import '../../api/falhas.dart';
import '../../api/mensagens_de_erro.dart';
import '../../api/modelos_rede.dart';
import '../../api/rede_api.dart';
import '../../escopo.dart';
import '../../theme/bichu_colors.dart';
import '../../theme/bichu_tokens.g.dart';
import '../../widgets/faixa_de_aviso.dart';
import 'agenda_da_rede.dart';

/// Um encontro da `Rede`, com a galeria e a confirmacao de presenca.
///
/// `GET /v1/network/events/{eventSlug}` (`getNetworkEvent`) e
/// `POST .../check-in` (`checkInNetworkEvent`).
///
/// ## O QUE ESTA TELA NAO TEM, e cada ausencia e o ADR-0024
///
/// - **Nao ha lista de quem confirmou presenca.** Ha [PresencasDoEncontro],
///   que desenha um NUMERO. Nao existe nome, primeiro nome, apelido, avatar
///   nem `slug` de pessoa em campo nenhum da resposta, e portanto nao existe
///   widget que pudesse desenha-los.
/// - **Nao ha escolha de pet no check-in.** O botao e um botao: ele nao abre
///   folha, nao abre seletor e nao pergunta nada. O check-in e da PESSOA, e a
///   requisicao nao tem corpo porque nao ha o que escolher.
/// - **A foto da galeria nao tem autor.** Nao ha "enviada por" e nao ha como
///   haver: `submitted_by_user_id` existe no banco para remocao e auditoria e
///   **nunca e projetado**. Dez fotos assinadas seriam dez nomes presentes,
///   com imagem do lugar junto.
/// - **Nao ha envio de foto.** A galeria desta fatia e exibida e nao enviada:
///   o envio pela comunidade depende de moderacao, que nao existe em lugar
///   nenhum deste repositorio.
/// - **Nao ha mapa, nao ha endereco e nao ha CEP.**
///
/// ## A tela e alcancada por `push`, e nao por rota nova
///
/// `lib/roteamento/rotas.dart` nao e desta entrega e nenhum endereco foi
/// inventado aqui. O cartao da agenda empilha esta tela no navegador do proprio
/// ramo, o que mantem a barra de abas e a volta. Quando a `Rede` ganhar deep
/// link, o endereco nasce la e [abrir] passa a ser o unico ponto a mudar.
class TelaDoEncontro extends StatefulWidget {
  const TelaDoEncontro({required this.slug, super.key});

  final String slug;

  static const String tituloDaTela = 'Encontro';

  static const String rotuloDeConfirmar = 'Confirmar presença';

  /// O que a tela mostra enquanto a chamada esta no ar.
  static const String confirmando = 'Confirmando sua presença…';

  /// O que a tela diz a quem ja confirmou.
  ///
  /// **Nao e um botao desabilitado.** Um controle que continua se anunciando e
  /// nao tem desfecho e o que o criterio 2 da BICHUS-62 proibe; e repetir a
  /// chamada nao mudaria nada, porque o banco recusa o segundo check-in da
  /// mesma pessoa. Entao aqui nao ha controle: ha uma afirmacao.
  static const String jaConfirmou = 'Você confirmou presença neste encontro.';

  /// O que a tela diz a quem nao tem conta.
  ///
  /// A operacao exige token e responde 401 sem ele. Desenhar o botao para
  /// quem nao pode usa-lo produziria um toque que termina em erro, e o erro
  /// nao e o desfecho: e a consequencia de a tela ter perguntado errado.
  static const String precisaDeConta =
      'Entre na sua conta para confirmar presença neste encontro.';

  static const String tituloDaGaleria = 'Fotos do encontro';

  /// O que a galeria diz quando o encontro ainda nao tem foto.
  static const String galeriaVazia =
      'Este encontro ainda não tem foto na galeria.';

  static const String rotuloDeAtualizar = 'Atualizar';

  /// Empilha a tela sobre a agenda.
  static Future<void> abrir(BuildContext context, String slug) {
    return Navigator.of(context).push<void>(
      MaterialPageRoute<void>(builder: (_) => TelaDoEncontro(slug: slug)),
    );
  }

  @override
  State<TelaDoEncontro> createState() => _TelaDoEncontroState();
}

enum _Fase { carregando, pronto, falha }

class _TelaDoEncontroState extends State<TelaDoEncontro> {
  _Fase _fase = _Fase.carregando;
  EncontroComGaleria? _encontro;
  String? _textoDaFalha;

  /// Uma confirmacao em curso. Existe para o segundo toque nao sair enquanto o
  /// primeiro nao voltou -- nao por causa da contagem, que o banco protege, mas
  /// porque dois toques sem resposta sao dois toques sem desfecho.
  bool _confirmando = false;

  /// A falha da confirmacao, que e **outra** da falha da carga: perder a
  /// resposta do check-in nao apaga o encontro que ja esta na tela.
  String? _falhaDaConfirmacao;

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

  Future<void> _carregar() async {
    if (!mounted) return;
    setState(() {
      _fase = _Fase.carregando;
      _textoDaFalha = null;
      _falhaDaConfirmacao = null;
    });

    try {
      final encontro =
          await RedeApi(Escopo.of(context).api).detalhar(widget.slug);
      if (!mounted) return;
      setState(() {
        _encontro = encontro;
        _fase = _Fase.pronto;
      });
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

  /// Confirma a presenca **de quem esta chamando**, e de mais ninguem.
  ///
  /// A contagem nova vem da RESPOSTA e nao de uma soma local: somar um por
  /// conta propria diverge da contagem do servidor no primeiro check-in
  /// simultaneo, e a tela passaria a mostrar um numero que nao existe.
  Future<void> _confirmar() async {
    final atual = _encontro;
    if (atual == null || _confirmando) return;
    setState(() {
      _confirmando = true;
      _falhaDaConfirmacao = null;
    });

    try {
      final desfecho =
          await RedeApi(Escopo.of(context).api).confirmarPresenca(widget.slug);
      if (!mounted) return;
      setState(() {
        _encontro = EncontroComGaleria(
          encontro: EncontroDaRede(
            slug: atual.encontro.slug,
            titulo: atual.encontro.titulo,
            resumo: atual.encontro.resumo,
            lugar: atual.encontro.lugar,
            comeca: atual.encontro.comeca,
            situacao: atual.encontro.situacao,
            presencas: desfecho.presencas,
            quantidadeDeFotos: atual.encontro.quantidadeDeFotos,
            urlDaCapa: atual.encontro.urlDaCapa,
          ),
          galeria: atual.galeria,
          vocePresente: desfecho.vocePresente,
        );
        _confirmando = false;
      });
    } on FalhaDeChamada catch (falha) {
      if (!mounted) return;
      setState(() {
        _falhaDaConfirmacao = MensagensDeErro.de(falha).texto;
        _confirmando = false;
      });
    } on FormatException {
      if (!mounted) return;
      setState(() {
        _falhaDaConfirmacao = MensagensDeErro.servidorFora;
        _confirmando = false;
      });
    }
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(
        toolbarHeight: BichuAlvoDeToque.critico,
        leadingWidth: BichuAlvoDeToque.critico,
        leading: const _VoltarDoEncontro(),
        title: const Text(TelaDoEncontro.tituloDaTela),
      ),
      body: SafeArea(
        child: ListView(
          addSemanticIndexes: false,
          padding: const EdgeInsets.all(BichuEspaco.e4),
          children: _corpo(),
        ),
      ),
    );
  }

  List<Widget> _corpo() {
    if (_fase == _Fase.carregando) {
      return const <Widget>[_EsqueletoDoEncontro()];
    }

    final comGaleria = _encontro;
    if (_fase == _Fase.falha || comGaleria == null) {
      return <Widget>[
        FaixaDeAviso(
          texto: _textoDaFalha ?? MensagensDeErro.servidorFora,
          rotuloDaAcao: TelaDoEncontro.rotuloDeAtualizar,
          aoTocarNaAcao: _carregar,
        ),
      ];
    }

    final encontro = comGaleria.encontro;
    final situacao = CartaoDoEncontro.rotuloDaSituacao(encontro.situacao);
    final cores = BichuColors.of(context).cores;
    final textos = Theme.of(context).textTheme;

    return <Widget>[
      if (encontro.urlDaCapa != null) ...<Widget>[
        ClipRRect(
          borderRadius: BorderRadius.circular(BichuRaio.md),
          child: Image.network(
            encontro.urlDaCapa!,
            height: 200,
            width: double.infinity,
            fit: BoxFit.cover,
            semanticLabel: 'Foto de ${encontro.titulo}',
            errorBuilder: (_, _, _) => const SizedBox.shrink(),
          ),
        ),
        const SizedBox(height: BichuEspaco.e4),
      ],
      if (situacao != null) ...<Widget>[
        Text(situacao, style: textos.labelLarge),
        const SizedBox(height: BichuEspaco.e2),
      ],
      Text(encontro.titulo, style: textos.headlineSmall),
      const SizedBox(height: BichuEspaco.e2),
      Text(
        encontro.resumo,
        style: textos.bodyLarge?.copyWith(color: cores.textSecondary),
      ),
      const SizedBox(height: BichuEspaco.e4),
      // A DATA COM A HORA DO FUSO DO EVENTO.
      Text(encontro.comeca.porExtenso, style: textos.bodyLarge),
      const SizedBox(height: BichuEspaco.e1),
      // O LUGAR EM ROTULO. Nao ha mapa e nao ha endereco.
      Text(
        encontro.lugar.linha,
        style: textos.bodyMedium?.copyWith(color: cores.textSecondary),
      ),
      const SizedBox(height: BichuEspaco.e4),
      PresencasDoEncontro(quantas: encontro.presencas),
      const SizedBox(height: BichuEspaco.e4),
      ..._confirmacao(comGaleria),
      const SizedBox(height: BichuEspaco.e6),
      Text(TelaDoEncontro.tituloDaGaleria, style: textos.titleMedium),
      const SizedBox(height: BichuEspaco.e3),
      ..._galeria(comGaleria),
    ];
  }

  List<Widget> _confirmacao(EncontroComGaleria comGaleria) {
    final cores = BichuColors.of(context).cores;
    final textos = Theme.of(context).textTheme;

    if (comGaleria.vocePresente) {
      return <Widget>[
        Text(
          TelaDoEncontro.jaConfirmou,
          style: textos.bodyMedium?.copyWith(color: cores.textPrimary),
        ),
      ];
    }

    if (!Escopo.of(context).sessao.logado) {
      return <Widget>[
        Text(
          TelaDoEncontro.precisaDeConta,
          style: textos.bodyMedium?.copyWith(color: cores.textSecondary),
        ),
      ];
    }

    return <Widget>[
      // **Sem botao desabilitado enquanto a chamada esta no ar.** Um controle
      // que continua se anunciando e nao responde e o que o criterio 2 da
      // BICHUS-62 proibe; no lugar dele entra o desfecho em curso, que e uma
      // resposta ao toque.
      if (_confirmando)
        Row(
          children: <Widget>[
            const SizedBox(
              width: 20,
              height: 20,
              child: CircularProgressIndicator(strokeWidth: 2),
            ),
            const SizedBox(width: BichuEspaco.e3),
            Text(
              TelaDoEncontro.confirmando,
              style: textos.bodyMedium?.copyWith(color: cores.textSecondary),
            ),
          ],
        )
      else
        SizedBox(
          width: double.infinity,
          height: BichuAlvoDeToque.min,
          child: FilledButton(
            onPressed: _confirmar,
            child: const Text(TelaDoEncontro.rotuloDeConfirmar),
          ),
        ),
      if (_falhaDaConfirmacao != null) ...<Widget>[
        const SizedBox(height: BichuEspaco.e3),
        FaixaDeAviso(texto: _falhaDaConfirmacao!),
      ],
    ];
  }

  /// A galeria: imagem e legenda, e **mais nada**.
  List<Widget> _galeria(EncontroComGaleria comGaleria) {
    final cores = BichuColors.of(context).cores;
    final textos = Theme.of(context).textTheme;

    if (comGaleria.galeria.isEmpty) {
      return <Widget>[
        Text(
          TelaDoEncontro.galeriaVazia,
          style: textos.bodyMedium?.copyWith(color: cores.textSecondary),
        ),
      ];
    }

    return <Widget>[
      for (final foto in comGaleria.galeria) ...<Widget>[
        ClipRRect(
          borderRadius: BorderRadius.circular(BichuRaio.md),
          child: Image.network(
            foto.urlDaImagem,
            width: double.infinity,
            height: 180,
            fit: BoxFit.cover,
            // O nome acessivel e a LEGENDA, quando ha. Nao ha autor para
            // nomear, e um "foto de fulano" aqui seria a lista de presenca
            // voltando pelo leitor de tela.
            semanticLabel: foto.legenda ?? 'Foto do encontro',
            errorBuilder: (_, _, _) => const SizedBox.shrink(),
          ),
        ),
        if (foto.legenda != null) ...<Widget>[
          const SizedBox(height: BichuEspaco.e1),
          Text(
            foto.legenda!,
            style: textos.bodySmall?.copyWith(color: cores.textSecondary),
          ),
        ],
        const SizedBox(height: BichuEspaco.e3),
      ],
    ];
  }
}

/// A presenca do encontro: **um numero, e nunca uma lista**.
///
/// Esta classe recebe um `int` e nao tem nenhum outro parametro. A forma e a
/// decisao: nao ha construtor aqui que aceite pessoas, entao nao ha caminho
/// pelo qual alguem as passe amanha sem reescrever a assinatura e reler este
/// comentario.
class PresencasDoEncontro extends StatelessWidget {
  const PresencasDoEncontro({required this.quantas, super.key});

  final int quantas;

  @override
  Widget build(BuildContext context) {
    final cores = BichuColors.of(context).cores;
    final textos = Theme.of(context).textTheme;

    return Container(
      width: double.infinity,
      padding: const EdgeInsets.all(BichuEspaco.e4),
      decoration: BoxDecoration(
        color: cores.surfaceSunken,
        borderRadius: BorderRadius.circular(BichuRaio.md),
        border: Border.all(color: cores.outline, width: BichuBorda.hairline),
      ),
      child: Text(
        AgendaDaRede.linhaDePresencas(quantas),
        style: textos.bodyMedium?.copyWith(color: cores.textPrimary),
      ),
    );
  }
}

/// A volta desta tela.
///
/// Ela nao usa `SaidaDaTela` porque aquele controle desempilha pelo `GoRouter`,
/// e esta tela foi empilhada no `Navigator` do ramo: `context.pop()` ali
/// olharia para outra pilha. O alvo continua sendo o piso critico de 64 dp e o
/// `tooltip` continua sendo o nome acessivel, que e o que o controle precisa
/// para nao ser anunciado como "botão" e nada mais.
class _VoltarDoEncontro extends StatelessWidget {
  const _VoltarDoEncontro();

  @override
  Widget build(BuildContext context) {
    return IconButton(
      onPressed: () => Navigator.of(context).pop(),
      tooltip: 'Voltar',
      icon: const Icon(Icons.arrow_back),
      iconSize: 24,
      constraints: const BoxConstraints(
        minWidth: BichuAlvoDeToque.critico,
        minHeight: BichuAlvoDeToque.critico,
      ),
      padding: EdgeInsets.zero,
      color: BichuColors.of(context).cores.textPrimary,
    );
  }
}

class _EsqueletoDoEncontro extends StatelessWidget {
  const _EsqueletoDoEncontro();

  @override
  Widget build(BuildContext context) {
    final cores = BichuColors.of(context).cores;
    return Container(
      width: double.infinity,
      height: 280,
      decoration: BoxDecoration(
        color: cores.surfaceSunken,
        borderRadius: BorderRadius.circular(BichuRaio.lg),
      ),
    );
  }
}
