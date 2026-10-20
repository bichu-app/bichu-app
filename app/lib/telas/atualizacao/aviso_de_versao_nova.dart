import 'package:flutter/material.dart';

import '../../dispositivo/saida_do_app.dart';
import '../../theme/bichu_colors.dart';
import '../../theme/bichu_tokens.g.dart';
import 'textos_da_atualizacao.dart';

/// O AVISO BRANDO de versao nova. **Dispensavel, e nao bloqueia nada.**
///
/// ====================================================================
/// O QUE O SEPARA DO BLOQUEIO, E POR QUE SAO DUAS PECAS E NAO UMA
/// ====================================================================
///
/// Os dois estados vem do contrato como valores DIFERENTES de
/// `AppVersionStatus.verdict` (`update_recommended` e `update_required`), e nao
/// de um booleano. Aqui eles tambem sao duas pecas de interface diferentes, e a
/// separacao e o que impede os dois de se confundirem no codigo:
///
/// | | bloqueio | aviso brando |
/// |---|---|---|
/// | ocupa a tela | sim, inteira | nao, uma faixa no topo |
/// | da para fechar | **nao** | sim, `Agora nao` |
/// | o app continua usavel | nao | **sim, inteiro** |
/// | gesto de voltar | bloqueado (`PopScope`) | nao interfere |
///
/// Uma peca unica com um `if` decidindo se ha botao de fechar seria a forma
/// mais curta de, um dia, o bloqueio ganhar um "Agora nao" por engano.
///
/// ====================================================================
/// DISPENSAR VALE ATE A PESSOA FECHAR O APP, E SO ISSO
/// ====================================================================
///
/// O estado de dispensa vive em memoria, no portao que monta esta faixa. Nao
/// vai para disco de proposito: um "nao mostre mais" persistido precisaria
/// saber POR QUAL VERSAO foi dispensado para nao silenciar o aviso da proxima,
/// e isso exigiria o aplicativo guardar e comparar numero de versao -- que e
/// exatamente o que o desenho deste mecanismo tira do aplicativo.
///
/// O preco e que o aviso volta na proxima abertura. Para um bilhete que ocupa
/// uma faixa e sai com um toque, esse preco e menor que uma comparacao de
/// versao a mais no cliente.
class AvisoDeVersaoNova extends StatelessWidget {
  const AvisoDeVersaoNova({
    required this.aoDispensar,
    super.key,
    this.loja,
  });

  /// Chamado pelo `Agora nao`. O portao esquece o aviso ate a proxima abertura.
  final VoidCallback aoDispensar;

  /// Para onde o `Atualizar` manda. **Nula, a acao nao aparece** -- mesma
  /// regra do bloqueio: nao se desenha caminho que nao leva a lugar.
  final Uri? loja;

  @override
  Widget build(BuildContext context) {
    final cores = BichuColors.of(context).cores;
    final textos = Theme.of(context).textTheme;
    final destino = loja;

    return Material(
      color: cores.warningContainer,
      child: SafeArea(
        bottom: false,
        child: Padding(
          padding: const EdgeInsets.symmetric(
            horizontal: BichuEspaco.e4,
            vertical: BichuEspaco.e2,
          ),
          child: Semantics(
            // `liveRegion`, e nao `alert`: o leitor de tela anuncia quando
            // chega a vez, sem interromper o que a pessoa esta fazendo. A
            // interrupcao e do bloqueio, nao do bilhete.
            liveRegion: true,
            container: true,
            child: Row(
              children: <Widget>[
                Icon(Icons.info_outline, color: cores.textPrimary, size: BichuEspaco.e5),
                const SizedBox(width: BichuEspaco.e3),
                Expanded(
                  child: Text(
                    TextosDaAtualizacao.avisoDeVersaoNova,
                    style: textos.bodyMedium?.copyWith(color: cores.textPrimary),
                  ),
                ),
                if (destino != null)
                  TextButton(
                    onPressed: () => SaidaDoApp.atual.abrirLink(destino),
                    child: const Text(TextosDaAtualizacao.atualizar),
                  ),
                // O `Agora nao` existe SEMPRE, inclusive sem loja: sem ele a
                // faixa seria permanente, e faixa que nao sai e bloqueio com
                // outro nome.
                TextButton(
                  onPressed: aoDispensar,
                  child: const Text(TextosDaAtualizacao.agoraNao),
                ),
              ],
            ),
          ),
        ),
      ),
    );
  }
}
