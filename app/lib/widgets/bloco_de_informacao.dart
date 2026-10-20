import 'package:flutter/material.dart';

import '../theme/bichu_colors.dart';
import '../theme/bichu_tokens.g.dart';

/// Um bloco de informacao: um titulo e as linhas dele.
///
/// **Existe para o leitor de tela, e nao para economizar linha de codigo.** As
/// secoes de `Quem foi avisado` e `O que fazer agora` sao assuntos diferentes,
/// e sem `header: true` no titulo quem navega por cabecalho nao tem como pular
/// entre eles -- a tela inteira seria um bloco corrido de dez paragrafos. E o
/// mesmo `Semantics(header: true, ...)` que `resultado_da_abertura.dart` usa.
///
/// **Linha vazia nao desenha.** Um `Text('')` deixaria o respiro de 8 dp para
/// nada -- o mesmo buraco que `TelaDeAba` aprendeu a nao abrir com `reforco`
/// vazio.
///
/// ## Por que ele mora AQUI, e nao dentro de uma tela
///
/// Ele nasceu privado em `achado/tela_achado_registrado.dart`, quando so o
/// desfecho tinha blocos. **A tela do achado (`/achados/:id`) passou a ter os
/// mesmos tres blocos**, e um `_Bloco` copiado nas duas divergiria na primeira
/// correcao: a disciplina que este widget carrega -- `header: true` no titulo e
/// linha vazia que nao desenha -- e justamente a que nao aparece num teste que
/// so procure o texto na arvore. Uma das duas copias perderia o `header` e
/// ninguem veria.
class BlocoDeInformacao extends StatelessWidget {
  const BlocoDeInformacao({
    required this.titulo,
    required this.linhas,
    super.key,
  });

  final String titulo;
  final List<String> linhas;

  @override
  Widget build(BuildContext context) {
    final cores = BichuColors.of(context).cores;
    final textos = Theme.of(context).textTheme;
    final cheias = linhas.where((l) => l.isNotEmpty).toList(growable: false);

    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: <Widget>[
        Semantics(header: true, child: Text(titulo, style: textos.titleMedium)),
        for (final linha in cheias) ...<Widget>[
          const SizedBox(height: BichuEspaco.e2),
          Text(
            linha,
            style: textos.bodyLarge?.copyWith(color: cores.textSecondary),
          ),
        ],
      ],
    );
  }
}
