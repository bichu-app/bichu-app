import 'package:flutter/material.dart';

import '../../dispositivo/saida_do_app.dart';
import '../../theme/bichu_colors.dart';
import '../../theme/bichu_tokens.g.dart';
import '../../widgets/botao_primario.dart';

/// Os textos do pedido de aceite, num lugar so.
///
/// Separados pelo mesmo motivo de `TextosDaAtualizacao`: a tela e o teste leem
/// a MESMA cadeia, e nao duas copias que divergem na primeira correcao de
/// portugues.
class TextosDoAceiteDosTermos {
  const TextosDoAceiteDosTermos._();

  static const String titulo = 'Os termos mudaram';

  static const String corpo =
      'Atualizamos os Termos de Uso e a Política de Privacidade. '
      'Leia e confirme para continuar usando o Bichu.';

  static const String semantica =
      'Os termos mudaram. Leia os Termos de Uso e a Política de Privacidade e confirme o aceite.';

  static const String lerOsTermos = 'Ler os Termos de Uso';

  static const String lerAPrivacidade = 'Ler a Política de Privacidade';

  /// O QUE SUBSTITUI OS LINKS quando o build nao recebeu as URLs.
  ///
  /// Pedir aceite sem o texto a ler e pedir assinatura em folha em branco, e um
  /// botao morto seria pior que a frase: a pessoa toca e nada acontece.
  static const String semOsLinks =
      'Este build não recebeu os endereços dos textos legais. '
      'Eles estão em bichu.app/termos e bichu.app/privacidade.';

  static const String aceitar = 'Aceito os termos';

  static const String agoraNao = 'Agora não';

  /// A FALHA DO ENVIO. A pessoa apertou o botao: ela precisa saber que o aceite
  /// **nao** foi registrado, em vez de ver a tela sair como se tivesse sido.
  static const String naoDeuParaRegistrar =
      'Não conseguimos registrar o seu aceite agora. Tente de novo em instantes.';
}

/// O PEDIDO DE ACEITE para quem JA tem conta.
///
/// Quem a desenha e [PortaoDeAceiteDosTermos], que a poe por cima do aplicativo
/// inteiro quando o aceite registrado nao e a versao que este binario exige.
///
/// ## Ela nao e um muro sem porta, e sao DUAS portas
///
/// 1. **Ler** o texto, no site, pelas URLs do proprio build
///    (`TERMS_URL`/`PRIVACY_URL`). O aplicativo nao carrega copia dos termos:
///    quem publica o texto e o site, e e la que a pessoa le o que esta
///    aceitando.
/// 2. **Recusar por enquanto** ([aoRecusar]). O que recusar significa e decisao
///    de PRODUTO, e nao desta tela: ela so chama o que lhe deram.
class TelaDeAceiteDosTermos extends StatefulWidget {
  const TelaDeAceiteDosTermos({
    required this.aoAceitar,
    required this.aoRecusar,
    super.key,
    this.urlDosTermos,
    this.urlDaPrivacidade,
  });

  /// Grava o aceite. Devolve `false` quando NAO deu para gravar.
  final Future<bool> Function() aoAceitar;

  final VoidCallback aoRecusar;

  final Uri? urlDosTermos;
  final Uri? urlDaPrivacidade;

  @override
  State<TelaDeAceiteDosTermos> createState() => _TelaDeAceiteDosTermosState();
}

class _TelaDeAceiteDosTermosState extends State<TelaDeAceiteDosTermos> {
  bool _enviando = false;
  bool _falhou = false;

  Future<void> _aceitar() async {
    if (_enviando) return;
    setState(() {
      _enviando = true;
      _falhou = false;
    });
    final deu = await widget.aoAceitar();
    if (!mounted) return;
    setState(() {
      _enviando = false;
      _falhou = !deu;
    });
  }

  @override
  Widget build(BuildContext context) {
    final cores = BichuColors.of(context).cores;
    final textos = Theme.of(context).textTheme;
    final termos = widget.urlDosTermos;
    final privacidade = widget.urlDaPrivacidade;
    final temLinks = termos != null || privacidade != null;

    // `canPop: false`: o botao de voltar do aparelho nao e a saida daqui. A
    // saida e "Agora nao", que esta escrita na tela -- porque saida invisivel
    // nao e saida.
    return PopScope(
      canPop: false,
      child: Scaffold(
        backgroundColor: cores.surface,
        body: SafeArea(
          child: Center(
            child: SingleChildScrollView(
              padding: const EdgeInsets.all(BichuEspaco.e6),
              child: Semantics(
                container: true,
                label: TextosDoAceiteDosTermos.semantica,
                child: Column(
                  mainAxisSize: MainAxisSize.min,
                  crossAxisAlignment: CrossAxisAlignment.stretch,
                  children: <Widget>[
                    Icon(
                      Icons.gavel_outlined,
                      size: BichuEspaco.e10,
                      color: cores.primary,
                      semanticLabel: null,
                    ),
                    const SizedBox(height: BichuEspaco.e6),
                    Semantics(
                      header: true,
                      child: Text(
                        TextosDoAceiteDosTermos.titulo,
                        style: textos.headlineSmall?.copyWith(color: cores.primary),
                      ),
                    ),
                    const SizedBox(height: BichuEspaco.e4),
                    Text(TextosDoAceiteDosTermos.corpo, style: textos.bodyLarge),
                    const SizedBox(height: BichuEspaco.e4),
                    if (!temLinks)
                      Text(
                        TextosDoAceiteDosTermos.semOsLinks,
                        style: textos.bodyMedium?.copyWith(color: cores.textSecondary),
                      ),
                    if (termos != null)
                      _Link(
                        rotulo: TextosDoAceiteDosTermos.lerOsTermos,
                        destino: termos,
                      ),
                    if (privacidade != null)
                      _Link(
                        rotulo: TextosDoAceiteDosTermos.lerAPrivacidade,
                        destino: privacidade,
                      ),
                    const SizedBox(height: BichuEspaco.e6),
                    if (_falhou) ...<Widget>[
                      Text(
                        TextosDoAceiteDosTermos.naoDeuParaRegistrar,
                        style: textos.bodyMedium?.copyWith(color: cores.error),
                      ),
                      const SizedBox(height: BichuEspaco.e4),
                    ],
                    // `carregando` e NAO `aoTocar: null`: o proprio
                    // `BotaoPrimario` manda nao desabilitar por estado de rede,
                    // e quem protege do toque duplo e a guarda `_enviando`
                    // dentro de `_aceitar`.
                    BotaoPrimario(
                      rotulo: TextosDoAceiteDosTermos.aceitar,
                      aoTocar: _aceitar,
                      carregando: _enviando,
                    ),
                    const SizedBox(height: BichuEspaco.e2),
                    TextButton(
                      onPressed: _enviando ? null : widget.aoRecusar,
                      style: TextButton.styleFrom(
                        minimumSize: const Size.fromHeight(BichuAlvoDeToque.min),
                      ),
                      child: const Text(TextosDoAceiteDosTermos.agoraNao),
                    ),
                  ],
                ),
              ),
            ),
          ),
        ),
      ),
    );
  }
}

class _Link extends StatelessWidget {
  const _Link({required this.rotulo, required this.destino});

  final String rotulo;
  final Uri destino;

  @override
  Widget build(BuildContext context) {
    return TextButton(
      onPressed: () => SaidaDoApp.atual.abrirLink(destino),
      style: TextButton.styleFrom(
        minimumSize: const Size.fromHeight(BichuAlvoDeToque.min),
      ),
      child: Text(rotulo),
    );
  }
}
