import 'dart:math' as math;

import 'package:flutter/material.dart';

import '../theme/bichu_colors.dart';
import '../theme/bichu_tokens.g.dart';
import '../widgets/marca.dart';

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
///
/// **A marca aqui e VETOR, e isso e regra, nao preferencia.** Ate 21/09/2026
/// esta tela compunha `Text('Bichu')` em `displaySmall`, e o paragrafo 8.4 do
/// design system diz que o logotipo e desenho e que nenhuma tela o recompoe
/// digitando. A divergencia durou enquanto nao havia vetor para por no lugar.
/// Quem voltar a digitar a palavra aqui derruba
/// `test/marca/logotipo_em_vetor_test.dart`, que mede o que a tela RENDERIZA e
/// nao o que o arquivo contem.
class TelaDeAbertura extends StatelessWidget {
  const TelaDeAbertura({super.key});

  @override
  Widget build(BuildContext context) {
    final cores = BichuColors.of(context).cores;

    // O piso do lockup sem descritor e 120px de largura (secao 3.10). Numa tela
    // muito estreita o respiro cede antes do piso: marca abaixo do piso nao e
    // marca, e apertada com folga zero e defeito de leiaute.
    final larguraDaTela = MediaQuery.sizeOf(context).width;
    final larguraDaMarca = math.max(
      MarcaLockup.pisoDeLargura,
      math.min<double>(200, larguraDaTela - BichuEspaco.e6 * 2),
    );

    return Scaffold(
      backgroundColor: cores.surface,
      body: Center(
        child: Column(
          mainAxisAlignment: MainAxisAlignment.center,
          children: <Widget>[
            MarcaLockup(largura: larguraDaMarca),
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
