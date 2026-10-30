import 'package:flutter/material.dart';

import '../config/app_config.dart';
import '../theme/bichu_colors.dart';
import '../theme/bichu_tokens.g.dart';

/// O CARIMBO DE BUILD: a linha que diz QUAL build esta neste aparelho.
class CarimboDoBuild extends StatelessWidget {
  const CarimboDoBuild({super.key});

  /// A chave do rodape. A isca aponta para ela, e nao para o texto: texto de
  /// carimbo e justamente o que muda, e asserir sobre ele faria a isca reprovar
  /// por renomeacao em vez de por ausencia.
  static const Key chave = ValueKey<String>('carimbo-do-build');

  /// O que aparece quando o build nao declarou o commit.
  static const String semCommit = 'commit não declarado';

  /// O que aparece quando o build nao declarou a versao.
  static const String semVersao = 'versão não declarada';

  /// O texto do carimbo, a partir dos dois valores do build.
  static String textoDe({required String? versao, required String? commit}) {
    final v = (versao == null || versao.trim().isEmpty)
        ? semVersao
        : 'Versão ${versao.trim()}';
    final c = (commit == null || commit.trim().isEmpty)
        ? semCommit
        : 'commit ${commit.trim()}';
    return '$v  ·  $c';
  }

  @override
  Widget build(BuildContext context) {
    final cores = BichuColors.of(context).cores;
    final textos = Theme.of(context).textTheme;
    final config = AppConfig.instancia;

    return Padding(
      key: chave,
      padding: const EdgeInsets.only(top: BichuEspaco.e6),
      child: Text(
        textoDe(
          versao: config.versaoDoApp,
          commit: config.commitCurtoDoBuild,
        ),
        textAlign: TextAlign.center,
        style: textos.labelSmall?.copyWith(color: cores.textMuted),
      ),
    );
  }
}
