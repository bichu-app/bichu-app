import 'package:flutter/material.dart';

import '../theme/bichu_colors.dart';
import '../theme/bichu_tokens.g.dart';

/// A tela de abertura.
///
/// Ela existe pelo tempo de ler o chaveiro, e nao mais. Splash que dura por
/// decisao de marca gasta o unico segundo que o tutor em panico tem, entao
/// aqui ela some assim que o estado da sessao e conhecido.
///
/// **Ela nao tem saida, e nao e esquecimento.** Nao e desvio nem destino: e
/// um estado de passagem que dura o tempo de uma leitura de chaveiro. O
/// redirecionamento do roteador tira a pessoa daqui assim que a sessao e
/// conhecida, entao esta tela nao e um lugar em que se pode ficar parado --
/// nem por link direto, porque `/` tambem redireciona. Um botao de voltar
/// aqui apontaria para fora do app, e um de fechar fecharia o que ja esta
/// fechando sozinho.
///
/// O fundo e `surface` solida, nao a manteiga: a regra de contencao do sistema
/// e que o preenchimento de marca aparece so como acao e como selo, nunca como
/// fundo de tela (secao 6.1.6).
class TelaDeAbertura extends StatelessWidget {
  const TelaDeAbertura({super.key});

  @override
  Widget build(BuildContext context) {
    final cores = BichuColors.of(context).cores;
    final textos = Theme.of(context).textTheme;

    return Scaffold(
      backgroundColor: cores.surface,
      body: Center(
        child: Column(
          mainAxisAlignment: MainAxisAlignment.center,
          children: <Widget>[
            Text(
              'Bichu',
              style: textos.displaySmall?.copyWith(color: cores.primary),
            ),
            const SizedBox(height: BichuEspaco.e6),
            Semantics(
              liveRegion: true,
              label: 'Abrindo o Bichu',
              child: SizedBox(
                width: 24,
                height: 24,
                child: CircularProgressIndicator(
                  strokeWidth: 2.5,
                  color: cores.primary,
                ),
              ),
            ),
          ],
        ),
      ),
    );
  }
}
