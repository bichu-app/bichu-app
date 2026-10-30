import 'package:flutter/material.dart';

import '../../theme/bichu_colors.dart';
import '../../theme/bichu_tokens.g.dart';
import '../../widgets/botao_primario.dart';
import 'textos_da_localizacao.dart';

/// Os dois pontos do app em que a localizacao e pedida, e nao ha um terceiro.
enum PontoDeUsoDaLocalizacao {
  /// F3.1 — o tutor marcando o pet como perdido.
  marcarPerdido,

  /// F3.5 — quem achou um pet na rua registrando o achado.
  registrarAchado;

  String get titulo => switch (this) {
        PontoDeUsoDaLocalizacao.marcarPerdido =>
          TextosDaLocalizacao.tituloPerdido,
        PontoDeUsoDaLocalizacao.registrarAchado =>
          TextosDaLocalizacao.tituloAchado,
      };

  String get corpo => switch (this) {
        PontoDeUsoDaLocalizacao.marcarPerdido =>
          TextosDaLocalizacao.corpoPerdido,
        PontoDeUsoDaLocalizacao.registrarAchado =>
          TextosDaLocalizacao.corpoAchado,
      };
}

/// A antessala do pedido de permissao de localizacao (criterios 3 e 4).
class AntessalaDeLocalizacao extends StatelessWidget {
  const AntessalaDeLocalizacao({required this.pontoDeUso, super.key});

  final PontoDeUsoDaLocalizacao pontoDeUso;

  /// Abre a folha e devolve o que a pessoa escolheu.
  static Future<RespostaDaAntessala> mostrar(
    BuildContext context, {
    required PontoDeUsoDaLocalizacao pontoDeUso,
  }) async {
    final resposta = await showModalBottomSheet<RespostaDaAntessala>(
      context: context,
      isScrollControlled: true,
      useSafeArea: true,
      builder: (_) => AntessalaDeLocalizacao(pontoDeUso: pontoDeUso),
    );
    return resposta ?? RespostaDaAntessala.digitarOBairro;
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
                pontoDeUso.titulo,
                style: textos.headlineSmall?.copyWith(color: cores.primary),
              ),
            ),
            const SizedBox(height: BichuEspaco.e4),
            Text(pontoDeUso.corpo, style: textos.bodyLarge),
            const SizedBox(height: BichuEspaco.e6),
            BotaoPrimario(
              rotulo: TextosDaLocalizacao.usarMinhaLocalizacao,
              aoTocar: () => Navigator.of(context).pop(
                RespostaDaAntessala.usarALocalizacao,
              ),
            ),
            const SizedBox(height: BichuAlvoDeToque.gapConsequenciaAlta),
            OutlinedButton(
              onPressed: () => Navigator.of(context).pop(
                RespostaDaAntessala.digitarOBairro,
              ),
              style: OutlinedButton.styleFrom(
                minimumSize: const Size.fromHeight(BichuAlvoDeToque.min),
                side: BorderSide(
                  color: cores.outline,
                  width: BichuBorda.hairline,
                ),
              ),
              child: const Text(TextosDaLocalizacao.preferoDigitarOBairro),
            ),
          ],
        ),
      ),
    );
  }
}

/// O que a pessoa escolheu na antessala.
enum RespostaDaAntessala {
  /// Abrir o dialogo do sistema.
  usarALocalizacao,

  /// Ir direto para o campo de bairro.
  digitarOBairro,
}
