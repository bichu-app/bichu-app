import 'package:flutter/material.dart';

import '../config/app_config.dart';
import '../theme/bichu_colors.dart';
import '../theme/bichu_tokens.g.dart';

/// O CARIMBO DE BUILD: a linha que diz QUAL build esta neste aparelho.
///
/// ## Por que ele existe
///
/// Medido em 26/10/2026 nesta arvore: `GIT_SHA`, `GIT_COMMIT`, `BUILD_SHA` e
/// `COMMIT_SHA` davam ZERO ocorrencias em `app/lib`, e `APP_VERSION` era
/// `1.0.0` em todo build. Dois APKs gerados em dias diferentes, com trabalho
/// diferente dentro, se apresentavam com o MESMO nome -- e nao havia nada no
/// aplicativo que distinguisse um do outro.
///
/// A consequencia nao era tecnica. O cliente relatou DUAS vezes que coisas
/// prontas "nao chegaram" no aparelho dele, e nao havia como responder: nem
/// ele nem quem gerou o APK conseguia dizer qual commit estava instalado. Esta
/// linha nao conserta defeito nenhum do produto; ela torna aquela pergunta
/// respondivel, em voz alta, por quem esta com o aparelho na mao.
///
/// ## Por que ele nunca fica VAZIO
///
/// Quando o build nao declarou `BUILD_COMMIT`, o carimbo **nao desaparece**:
/// ele escreve [semCommit] no lugar do valor. Rodape em branco e
/// indistinguivel de rodape que sumiu, e essa indistinguibilidade e o defeito
/// original -- nao saber e um estado, e estado que nao aparece na tela nao
/// existe para quem olha. A isca
/// `app/test/telas/carimbo_do_build_test.dart` cobra as duas coisas, por caso
/// separado: que a linha ESTA na tela e que ela nao vem vazia.
///
/// ## Por que a chave e `BUILD_COMMIT`, e nao um nome novo
///
/// Porque o nome ja existe neste repositorio: `Dockerfile`, `Makefile` e
/// `compose.yaml` exigem `BUILD_COMMIT` desde a BICHUS-210 para estampar o
/// commit nos containers. Inventar `GIT_SHA` para o aplicativo daria dois
/// conceitos de "qual build e este" no mesmo produto, e quem estampa o
/// servidor com um nome e o aplicativo com outro nao consegue comparar os
/// dois. Quem le o valor no Dart e [AppConfig.commitDoBuild].
class CarimboDoBuild extends StatelessWidget {
  const CarimboDoBuild({super.key});

  /// A chave do rodape. A isca aponta para ela, e nao para o texto: texto de
  /// carimbo e justamente o que muda, e asserir sobre ele faria a isca
  /// reprovar por renomeacao em vez de por ausencia.
  static const Key chave = ValueKey<String>('carimbo-do-build');

  /// O que aparece quando o build nao declarou o commit.
  ///
  /// **Nao e cadeia vazia, e nao e um tracinho.** Tem de dar para LER em voz
  /// alta e reconhecer como "o build errado", e nao como "a tela quebrou".
  static const String semCommit = 'commit não declarado';

  /// O que aparece quando o build nao declarou a versao. Mesma regra.
  static const String semVersao = 'versão não declarada';

  /// O texto do carimbo, a partir dos dois valores do build.
  ///
  /// Funcao pura e publica de proposito: assim a isca mede a COMPOSICAO do
  /// texto (inclusive os dois casos de ausencia) sem montar o aplicativo
  /// inteiro, e mede a presenca na tela num caso separado.
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
