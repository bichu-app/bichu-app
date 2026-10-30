import 'package:flutter/material.dart';

import '../../theme/bichu_colors.dart';
import '../../theme/bichu_tokens.g.dart';
import '../../widgets/botao_primario.dart';

/// A microcopy da antessala de notificacao.
abstract final class TextosDaAntessala {
  /// UX 10.1, antessala C.3. Sem o artigo antes do nome (ver o topo).
  static String titulo(String nomeDoPet) =>
      'Quer ser avisada se alguém encontrar $nomeDoPet?';

  /// UX 10.1. "a tag dela" virou "a tag" pelo mesmo motivo do titulo.
  static const String corpo =
      'A gente manda um aviso no seu celular na hora em que alguém escanear a '
      'tag. E avisa também quando um pet sumir perto de você.';

  static const String sim = 'Sim, quero ser avisada';

  static const String agoraNao = 'Agora não';

  /// UX 10.1, segunda antessala.
  static String tituloDaSegunda(String nomeDoPet) =>
      'Alguém pode achar $nomeDoPet nos próximos minutos';

  static const String corpoDaSegunda =
      'Ligue o aviso no celular para saber na hora.';

  static const String ligarOAviso = 'Ligar o aviso';

  static const String continuarSem = 'Continuar sem';

  /// A linha fixa de quem recusou o aviso no dialogo do sistema.
  static const String semAvisoPorPerto =
      'Você não recebe aviso de pet perdido por perto.';

  /// O unico caminho de volta que existe depois de a permissao ser negada.
  static const String ligarNosAjustes = 'Ligar nos ajustes';

  /// A rede de seguranca, dita junto: o caso proprio NAO depende do push.
  static const String oEmailCobreOCasoProprio =
      'Se alguém achar um pet seu, a gente avisa por e-mail.';

  /// Faixa informativa em F1.6 quando `POST /me/devices` nao completa.
  static String avisoNaoFicouLigado(String nomeDoPet) =>
      'Os avisos no celular não ficaram ligados agora. Você vai receber por '
      'e-mail se alguém achar $nomeDoPet.';
}

/// Qual das duas antessalas esta sendo exibida (UX 10.1).
enum QualAntessala {
  /// C.3, em F1.6, depois de o QR do primeiro pet aparecer.
  primeira,

  /// A segunda e ultima, em F3.2, ao confirmar o primeiro caso de perdido.
  segunda,
}

/// C.3 — Antessala do pedido de permissao de notificacao (UX 10 e 10.1).
class AntessalaDeAviso extends StatelessWidget {
  const AntessalaDeAviso({
    required this.nomeDoPet,
    this.qual = QualAntessala.primeira,
    super.key,
  });

  final String nomeDoPet;

  final QualAntessala qual;

  String get _titulo => switch (qual) {
        QualAntessala.primeira => TextosDaAntessala.titulo(nomeDoPet),
        QualAntessala.segunda => TextosDaAntessala.tituloDaSegunda(nomeDoPet),
      };

  String get _corpo => switch (qual) {
        QualAntessala.primeira => TextosDaAntessala.corpo,
        QualAntessala.segunda => TextosDaAntessala.corpoDaSegunda,
      };

  String get _aceitar => switch (qual) {
        QualAntessala.primeira => TextosDaAntessala.sim,
        QualAntessala.segunda => TextosDaAntessala.ligarOAviso,
      };

  String get _recusar => switch (qual) {
        QualAntessala.primeira => TextosDaAntessala.agoraNao,
        QualAntessala.segunda => TextosDaAntessala.continuarSem,
      };

  /// Abre a folha e devolve `true` so quando a pessoa pediu para ser avisada.
  static Future<bool> mostrar(
    BuildContext context, {
    required String nomeDoPet,
    QualAntessala qual = QualAntessala.primeira,
  }) async {
    final resposta = await showModalBottomSheet<bool>(
      context: context,
      isScrollControlled: true,
      useSafeArea: true,
      builder: (_) => AntessalaDeAviso(nomeDoPet: nomeDoPet, qual: qual),
    );
    return resposta ?? false;
  }

  @override
  Widget build(BuildContext context) {
    final cores = BichuColors.of(context).cores;
    final textos = Theme.of(context).textTheme;

    return SafeArea(
      top: false,
      child: Padding(
        padding: const EdgeInsets.all(BichuEspaco.e6),
        child: Column(
          mainAxisSize: MainAxisSize.min,
          crossAxisAlignment: CrossAxisAlignment.stretch,
          children: <Widget>[
            Semantics(
              header: true,
              child: Text(
                _titulo,
                style: textos.headlineSmall?.copyWith(color: cores.primary),
              ),
            ),
            const SizedBox(height: BichuEspaco.e4),
            Text(_corpo, style: textos.bodyLarge),
            const SizedBox(height: BichuEspaco.e6),
            BotaoPrimario(
              rotulo: _aceitar,
              aoTocar: () => Navigator.of(context).pop(true),
            ),
            const SizedBox(height: BichuAlvoDeToque.gapConsequenciaAlta),
            OutlinedButton(
              onPressed: () => Navigator.of(context).pop(false),
              style: OutlinedButton.styleFrom(
                minimumSize: const Size.fromHeight(BichuAlvoDeToque.min),
                side:
                    BorderSide(color: cores.outline, width: BichuBorda.hairline),
              ),
              child: Text(_recusar),
            ),
          ],
        ),
      ),
    );
  }
}
