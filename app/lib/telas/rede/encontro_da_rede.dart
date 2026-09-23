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

/// Um encontro da `Rede`: titulo, resumo, data e lugar.
///
/// `GET /v1/network/events/{eventSlug}` (`getNetworkEvent`).
///
/// ## O QUE ESTA TELA NAO TEM
///
/// - **Nao ha confirmacao de presenca nem galeria de fotos.** BICHUS-251,
///   decisao do cliente de 23/09/2026: as duas saem desta versao e voltam
///   depois. Nao ha botao, nao ha texto de "voce confirmou", nao ha contagem
///   de presencas e nao ha secao de fotos. A versao com elas esta na branch
///   `guarda/rede-checkin-galeria`. O caso
///   `ISCA -- o detalhe nao tem check-in nem galeria` em
///   `test/rede/encontro_da_rede_test.dart` reprova se qualquer uma voltar.
/// - **Nao ha lista de quem vai**, em forma nenhuma (ADR-0025): nao existe
///   nome, apelido, avatar nem `slug` de pessoa em campo nenhum que esta tela
///   leia.
/// - **Nao ha envio de foto** (ADR-0025 decisao 4): depende de moderacao, que
///   nao existe em lugar nenhum deste repositorio.
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
  EncontroDaRede? _encontro;
  String? _textoDaFalha;

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

    final encontro = _encontro;
    if (_fase == _Fase.falha || encontro == null) {
      return <Widget>[
        FaixaDeAviso(
          texto: _textoDaFalha ?? MensagensDeErro.servidorFora,
          rotuloDaAcao: TelaDoEncontro.rotuloDeAtualizar,
          aoTocarNaAcao: _carregar,
        ),
      ];
    }

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
    ];
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
