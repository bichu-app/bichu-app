import 'dart:async';

import 'package:flutter/material.dart';

import '../../api/api_client.dart';
import '../../api/falhas.dart';
import '../../api/mensagens_de_erro.dart';
import '../../api/modelos_rede.dart';
import '../../api/rede_api.dart';
import '../../escopo.dart';
import '../../theme/bichu_colors.dart';
import '../../theme/bichu_tokens.g.dart';
import '../../widgets/arrastar_para_atualizar.dart';
import '../../widgets/convite_para_entrar.dart';
import '../../widgets/faixa_de_aviso.dart';
import '../../widgets/folha_destrutiva.dart';
import '../../widgets/saida_da_tela.dart';
import '../rede/encontro_da_rede.dart';
import '../rede/pecas_da_rede.dart';

/// `Perfil` > **`Meus eventos`**: os encontros que esta conta criou.
class MeusEventos extends StatefulWidget {
  const MeusEventos({super.key});

  static const String titulo = 'Meus eventos';

  /// Uma linha, e so uma, no estado vazio -- como na listagem de perdidos e em
  /// `Meus achados`, pelo pedido do cliente de 18/10/2026.
  static const String vazio = 'Você ainda não criou nenhum encontro.';

  static const String falha =
      'Não foi possível carregar os seus encontros agora.';

  /// A faixa de quem tocou em `Cancelar` num encontro que saiu da conta.
  static const String saiuDaConta =
      'Este encontro não está mais na sua conta. Atualize a lista.';

  /// Quando a leitura responde 200 **sem** `ETag`.
  static const String semVersao =
      'Não conseguimos confirmar a versão deste encontro. Atualize a lista e '
      'tente de novo.';

  static String fimDaLista(int quantos) => quantos == 1
      ? 'Você criou 1 encontro.'
      : 'Você criou $quantos encontros.';

  @override
  State<MeusEventos> createState() => _EstadoDeMeusEventos();
}

/// Os textos da folha de confirmação do cancelamento.
abstract final class TextosDoCancelamento {
  static const String titulo = 'Cancelar este encontro?';

  /// O corpo: **o que vai acontecer**, no futuro, porque nada aconteceu ainda.
  static const String corpo =
      'O encontro passa a aparecer como Cancelado na agenda. Ele não é '
      'apagado, e ninguém recebe aviso.';

  /// As consequências, em lista.
  static const List<String> oQueAcontece = <String>[
    'Fica na agenda com a palavra Cancelado até o fim previsto.',
    'Ninguém recebe aviso. Quem ia descobre quando abrir a agenda.',
    'Não dá para desfazer. Se mudar de ideia, é marcar um encontro novo.',
    'Ele deixa de contar nos seus três encontros marcados.',
  ];

  static const String confirmar = 'Cancelar o encontro';

  /// O nome acessível do botão destrutivo: o 11.9.1 exige que ele diga **o
  /// que** será destruído, e quem navega por leitor de tela chega nele sem o
  /// contexto que a pessoa vidente tem da folha inteira na frente dela.
  static String confirmarAcessivel(String titulo) =>
      'Cancelar o encontro $titulo';

  /// O rótulo de dispensar. **`Manter o encontro` e não `Cancelar`**: numa
  /// folha cujo botão destrutivo se chama `Cancelar o encontro`, um `Cancelar`
  /// ao lado é a pior palavra possível — os dois toques leem igual e fazem o
  /// contrário um do outro.
  static const String manter = 'Manter o encontro';

  /// A nota que vai na trilha.
  static const String nota = 'Cancelado pelo organizador no aplicativo.';
}

enum _Fase { carregando, lista, falha, semConta }

class _EstadoDeMeusEventos extends State<MeusEventos> {
  _Fase _fase = _Fase.carregando;

  List<MeuEncontro> _itens = const <MeuEncontro>[];

  /// A faixa de erro de uma AÇÃO (ler a versão, cancelar), separada da fase da
  /// lista: a lista continua na tela enquanto a faixa explica o que não deu.
  String? _erroDaAcao;

  /// O `slug` cuja versão está sendo lida.
  String? _lendoAVersaoDe;

  int _geracao = 0;
  bool _primeiraCarga = true;

  @override
  void didChangeDependencies() {
    super.didChangeDependencies();
    if (!_primeiraCarga) return;
    _primeiraCarga = false;
    WidgetsBinding.instance.addPostFrameCallback((_) {
      if (mounted) _carregar();
    });
  }

  RedeApi _api(ApiClient cliente) => RedeApi(cliente);

  Future<void> _carregar() async {
    if (!mounted) return;
    final escopo = Escopo.of(context);
    if (!escopo.sessao.logado) {
      setState(() {
        _fase = _Fase.semConta;
        _itens = const <MeuEncontro>[];
        _erroDaAcao = null;
      });
      return;
    }

    final geracao = ++_geracao;
    setState(() {
      _fase = _Fase.carregando;
      _erroDaAcao = null;
    });

    try {
      final pagina = await _api(escopo.api).meusEncontros();
      if (!mounted || geracao != _geracao) return;
      setState(() {
        _itens = pagina.itens;
        _fase = _Fase.lista;
      });
    } on FalhaDeChamada catch (falha) {
      _falhou(geracao, semConta: faltaConta(falha));
    } on FormatException {
      _falhou(geracao);
    }
  }

  void _falhou(int geracao, {bool semConta = false}) {
    if (!mounted || geracao != _geracao) return;
    setState(() {
      _itens = const <MeuEncontro>[];
      _fase = semConta ? _Fase.semConta : _Fase.falha;
    });
  }

  /// O toque em `Cancelar`: lê a versão, abre a folha, e só então cancela.
  Future<void> _cancelar(MeuEncontro encontro) async {
    final api = _api(Escopo.of(context).api);
    setState(() {
      _lendoAVersaoDe = encontro.slug;
      _erroDaAcao = null;
    });

    final MeuEncontroComVersao? lido;
    try {
      lido = await api.meuEncontro(encontro.slug);
    } on FalhaDeChamada catch (falha) {
      if (!mounted) return;
      setState(() {
        _lendoAVersaoDe = null;
        _erroDaAcao = MensagensDeErro.de(falha).texto;
      });
      return;
    } on FormatException {
      if (!mounted) return;
      setState(() {
        _lendoAVersaoDe = null;
        _erroDaAcao = MeusEventos.falha;
      });
      return;
    }
    if (!mounted) return;
    setState(() => _lendoAVersaoDe = null);

    if (lido == null) {
      await _carregar();
      if (!mounted) return;
      setState(() => _erroDaAcao = MeusEventos.saiuDaConta);
      return;
    }
    final etag = lido.etag;
    if (etag == null) {
      setState(() => _erroDaAcao = MeusEventos.semVersao);
      return;
    }

    final cancelou = await mostrarFolhaDestrutiva(
      context,
      titulo: TextosDoCancelamento.titulo,
      corpo: TextosDoCancelamento.corpo,
      oQueSome: TextosDoCancelamento.oQueAcontece,
      rotuloDeConfirmar: TextosDoCancelamento.confirmar,
      rotuloAcessivelDeConfirmar:
          TextosDoCancelamento.confirmarAcessivel(encontro.titulo),
      rotuloDeCancelar: TextosDoCancelamento.manter,
      aoConfirmar: () => api.cancelar(
        encontro.slug,
        ifMatch: etag,
        nota: TextosDoCancelamento.nota,
      ),
    );
    if (!mounted || !cancelou) return;
    await _carregar();
  }

  /// O toque no cartao: a pagina do encontro, pelo `slug` (BICHUS-297).
  void _abrirODetalhe(MeuEncontro encontro) {
    unawaited(TelaDoEncontro.abrir(context, encontro.slug));
  }

  @override
  Widget build(BuildContext context) {
    final sessao = Escopo.of(context).sessao;
    return Scaffold(
      appBar: const BarraDeConta(
        titulo: MeusEventos.titulo,
        saida: TipoDeSaida.voltar,
      ),
      body: SafeArea(
        top: false,
        bottom: false,
        child: AnimatedBuilder(
          animation: sessao,
          builder: (context, _) => ArrastarParaAtualizar(
            aoAtualizar: _carregar,
            child: ListView(
              padding: const EdgeInsets.all(BichuEspaco.e4),
              addSemanticIndexes: false,
              children: _corpo(),
            ),
          ),
        ),
      ),
    );
  }

  List<Widget> _corpo() {
    final erro = _erroDaAcao;
    return <Widget>[
      if (erro != null) ...<Widget>[
        FaixaDeAviso(
          texto: erro,
          rotuloDaAcao: MensagensDeErro.tentarDeNovo,
          aoTocarNaAcao: _carregar,
        ),
        const SizedBox(height: BichuEspaco.e4),
      ],
      ..._porFase(),
    ];
  }

  List<Widget> _porFase() {
    switch (_fase) {
      case _Fase.semConta:
        return const <Widget>[
          ConviteParaEntrar(secao: SecaoComConta.meusEventos),
        ];
      case _Fase.carregando:
        return <Widget>[
          Semantics(
            label: 'Carregando os seus encontros',
            liveRegion: true,
            child: const Center(child: CircularProgressIndicator()),
          ),
        ];
      case _Fase.falha:
        return <Widget>[
          FaixaDeAviso(
            texto: MeusEventos.falha,
            rotuloDaAcao: MensagensDeErro.tentarDeNovo,
            aoTocarNaAcao: _carregar,
          ),
        ];
      case _Fase.lista:
        if (_itens.isEmpty) {
          return const <Widget>[_UmaLinha(texto: MeusEventos.vazio)];
        }
        return <Widget>[
          for (var i = 0; i < _itens.length; i++) ...<Widget>[
            if (i > 0) const SizedBox(height: BichuEspaco.e4),
            CartaoDoMeuEncontro(
              encontro: _itens[i],
              lendoAVersao: _lendoAVersaoDe == _itens[i].slug,
              aoCancelar: () => _cancelar(_itens[i]),
              aoTocar: () => _abrirODetalhe(_itens[i]),
            ),
          ],
          const SizedBox(height: BichuEspaco.e4),
          Text(
            MeusEventos.fimDaLista(_itens.length),
            style: Theme.of(context).textTheme.bodySmall?.copyWith(
                  color: BichuColors.of(context).cores.textSecondary,
                ),
          ),
        ];
    }
  }
}

/// O cartão de um encontro meu: foto, título, data, situação, estado da capa e
/// `Cancelar`.
class CartaoDoMeuEncontro extends StatelessWidget {
  const CartaoDoMeuEncontro({
    required this.encontro,
    required this.aoCancelar,
    required this.aoTocar,
    super.key,
    this.lendoAVersao = false,
  });

  final MeuEncontro encontro;
  final VoidCallback aoCancelar;

  /// O que o toque no cartao faz: a pagina do encontro (BICHUS-297).
  final VoidCallback aoTocar;

  /// Enquanto a versão deste encontro está sendo lida, o botão fica
  /// desabilitado: dois toques dispararam duas folhas sobre a mesma linha.
  final bool lendoAVersao;

  /// A linha de data: `sábado, 27 de setembro · Das 9h às 11h`.
  static String quandoDe(MeuEncontro encontro, {required int anoCorrente}) {
    final dia = encontro.dia.dataLonga(anoCorrente: anoCorrente);
    return '$dia · ${encontro.horario.faixa}';
  }

  /// O rótulo acessível do cartão inteiro.
  static String rotuloAcessivelDe(
    MeuEncontro encontro, {
    required int anoCorrente,
  }) {
    final situacao = rotuloDaSituacao(encontro.situacao);
    final capa = encontro.capa;
    return <String>[
      encontro.titulo,
      quandoDe(encontro, anoCorrente: anoCorrente),
      ?situacao,
      if (capa != null && capa.recusadaComMotivo)
        '${_FotoRecusada.rotulo} ${capa.motivoDaRecusa!}',
      if (capa != null && capa.emPreparo) _FotoEmPreparo.rotulo,
    ].join(', ');
  }

  @override
  Widget build(BuildContext context) {
    final cores = BichuColors.of(context).cores;
    final textos = Theme.of(context).textTheme;
    final anoCorrente = DateTime.now().year;
    final capa = encontro.capa;

    return Material(
      color: cores.surface,
      borderRadius: BorderRadius.circular(BichuRaio.lg),
      clipBehavior: Clip.antiAlias,
      child: InkWell(
        onTap: aoTocar,
        borderRadius: BorderRadius.circular(BichuRaio.lg),
        excludeFromSemantics: true,
        child: Container(
          decoration: BoxDecoration(
            borderRadius: BorderRadius.circular(BichuRaio.lg),
            border: Border.all(
              color: cores.outline,
              width: BichuBorda.hairline,
            ),
          ),
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: <Widget>[
              ImagemDoEncontroOuBanner(url: capa?.url),
              Padding(
                padding: const EdgeInsets.all(BichuEspaco.e4),
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: <Widget>[
                    Semantics(
                      container: true,
                      button: true,
                      excludeSemantics: true,
                      label: rotuloAcessivelDe(encontro, anoCorrente: anoCorrente),
                      onTap: aoTocar,
                      child: Column(
                        crossAxisAlignment: CrossAxisAlignment.start,
                        children: <Widget>[
                          Text(encontro.titulo, style: textos.titleMedium),
                          const SizedBox(height: BichuEspaco.e1),
                          Text(
                            quandoDe(encontro, anoCorrente: anoCorrente),
                            style: textos.bodySmall
                                ?.copyWith(color: cores.textSecondary),
                          ),
                          if (encontro.situacao != null &&
                              rotuloDaSituacao(encontro.situacao) != null) ...<Widget>[
                            const SizedBox(height: BichuEspaco.e2),
                            DistintivoDeSituacao(situacao: encontro.situacao!),
                          ],
                        ],
                      ),
                    ),
                    if (capa != null && capa.emPreparo) ...<Widget>[
                      const SizedBox(height: BichuEspaco.e3),
                      FaixaDeAviso(
                        peso: PesoDaFaixa.informativo,
                        texto: _FotoEmPreparo.rotulo,
                      ),
                    ],
                    if (capa != null && capa.recusadaComMotivo) ...<Widget>[
                      const SizedBox(height: BichuEspaco.e3),
                      FaixaDeAviso(
                        peso: PesoDaFaixa.informativo,
                        texto: '${_FotoRecusada.rotulo} ${capa.motivoDaRecusa!}',
                      ),
                    ],
                    if (encontro.podeCancelar) ...<Widget>[
                      const SizedBox(height: BichuEspaco.e4),
                      _BotaoDeCancelar(
                        rotuloAcessivel: TextosDoCancelamento.confirmarAcessivel(
                          encontro.titulo,
                        ),
                        aoTocar: lendoAVersao ? null : aoCancelar,
                      ),
                    ],
                  ],
                ),
              ),
            ],
          ),
        ),
      ),
    );
  }
}

/// A primeira frase da faixa da capa recusada.
abstract final class _FotoRecusada {
  static const String rotulo = 'A foto deste encontro foi recusada.';
}

/// A frase da capa que ainda esta sendo processada.
abstract final class _FotoEmPreparo {
  static const String rotulo =
      'A foto deste encontro chegou e está sendo preparada. '
      'Ela aparece na agenda em instantes.';
}

/// `Cancelar o encontro`: contorno, e **não** preenchido em `urgency`.
class _BotaoDeCancelar extends StatelessWidget {
  const _BotaoDeCancelar({required this.rotuloAcessivel, required this.aoTocar});

  final String rotuloAcessivel;
  final VoidCallback? aoTocar;

  @override
  Widget build(BuildContext context) {
    return Semantics(
      container: true,
      button: true,
      enabled: aoTocar != null,
      label: rotuloAcessivel,
      excludeSemantics: true,
      onTap: aoTocar,
      child: SizedBox(
        width: double.infinity,
        child: OutlinedButton(
          onPressed: aoTocar,
          style: OutlinedButton.styleFrom(
            minimumSize: const Size.fromHeight(BichuAlvoDeToque.min),
          ),
          child: const Text(TextosDoCancelamento.confirmar),
        ),
      ),
    );
  }
}

/// O estado vazio: **uma linha**, como em `Meus achados`.
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
