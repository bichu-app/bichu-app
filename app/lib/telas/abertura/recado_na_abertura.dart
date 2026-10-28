import 'package:flutter/material.dart';

import '../../theme/bichu_colors.dart';
import '../../theme/bichu_tokens.g.dart';
import '../../widgets/botao_primario.dart';

/// UM RECADO QUE OCUPA A ABERTURA DO APLICATIVO.
///
/// ====================================================================
/// POR QUE ELA EXISTE: PARA NAO HAVER UMA TERCEIRA TELA DE ERRO DE ABERTURA
/// ====================================================================
///
/// Ate 26/10/2026 havia **uma** tela desta forma, a
/// `TelaDeBloqueioPorVersao`, e o pedido do cliente de 26/10 (mensagem quando
/// o app abre sem internet) pedia outra com o mesmo desenho: icone, titulo,
/// uma frase de consequencia e um caminho. Escrever a segunda do zero faria
/// duas telas de abertura divergirem no primeiro ajuste de respiro -- e no
/// dia em que o design system mudasse o piso de toque, uma das duas ficaria
/// atras.
///
/// Entao o corpo e **um** widget, e as duas telas sao chamadas dele. A
/// `TelaDeBloqueioPorVersao` continua existindo como TIPO, porque e por tipo
/// que os portoes dela procuram na arvore -- o que ela deixou de ter e um
/// `build` proprio.
///
/// ====================================================================
/// O QUE FECHA A TELA, E O QUE NAO
/// ====================================================================
///
/// [aoFechar] e o que separa **bloqueio** de **recado**:
///
/// - Nulo (bloqueio): `PopScope(canPop: false)`, nenhuma acao secundaria e
///   nenhuma `AppBar`. Bloqueio com saida nao e bloqueio.
/// - Preenchido (recado): o gesto de voltar do sistema fecha, e a acao
///   secundaria aparece em palavras. Quem esta sem internet nao pode ficar
///   preso: a fila offline e as fotos pendentes deste app existem justamente
///   para o metro e o elevador, e trancar a abertura trocaria um app sem
///   explicacao por um app sem uso.
///
/// A tela NAO fala com o aparelho: quem precisa abrir link passa um
/// [aoTocarNaAcao] que chama a porta `SaidaDoApp`, como a tela de bloqueio
/// faz. E o arranjo que `porta_nao_contornada_test.dart` exige.
class RecadoNaAbertura extends StatelessWidget {
  const RecadoNaAbertura({
    required this.icone,
    required this.titulo,
    required this.corpo,
    required this.semantica,
    super.key,
    this.rotuloDaAcao,
    this.aoTocarNaAcao,
    this.semAcao,
    this.rotuloDeFechar,
    this.aoFechar,
  });

  final IconData icone;
  final String titulo;
  final String corpo;

  /// O que o leitor de tela anuncia ao abrir. Quem nao ve a tela precisa saber
  /// se existe saida antes de procurar por uma.
  final String semantica;

  /// A acao primaria. **Nula, o botao nao existe** e [semAcao] aparece no
  /// lugar dele.
  final String? rotuloDaAcao;
  final VoidCallback? aoTocarNaAcao;

  /// A instrucao em palavras que SUBSTITUI o botao quando nao ha destino.
  ///
  /// Botao que leva a lugar nenhum e pior que nenhum botao: ele parece a
  /// saida, a pessoa toca, nada acontece, e ela conclui que o aplicativo esta
  /// quebrado.
  final String? semAcao;

  /// A saida secundaria. Nula, a tela nao fecha -- ver o cabecalho.
  final String? rotuloDeFechar;
  final VoidCallback? aoFechar;

  @override
  Widget build(BuildContext context) {
    final cores = BichuColors.of(context).cores;
    final textos = Theme.of(context).textTheme;
    final fechar = aoFechar;
    final acao = aoTocarNaAcao;

    return PopScope(
      // Sem saida declarada, o gesto de borda do Android nao descarta nada.
      canPop: fechar != null,
      child: Scaffold(
        backgroundColor: cores.surface,
        // Sem `AppBar`: a seta que o `Scaffold` desenharia sozinho seria uma
        // saida que ninguem decidiu.
        body: SafeArea(
          child: Center(
            child: SingleChildScrollView(
              // Rola de proposito: com a escala do sistema em 200% (SC 1.4.4)
              // este texto nao cabe em tela pequena, e conteudo cortado numa
              // tela de recado e uma pessoa sem instrucao.
              padding: const EdgeInsets.all(BichuEspaco.e6),
              child: Semantics(
                container: true,
                label: semantica,
                child: Column(
                  mainAxisSize: MainAxisSize.min,
                  crossAxisAlignment: CrossAxisAlignment.stretch,
                  children: <Widget>[
                    Icon(
                      icone,
                      size: BichuEspaco.e10,
                      color: cores.primary,
                      // Decoracao: quem usa leitor de tela recebe o rotulo do
                      // `Semantics` acima, e um icone anunciado seria uma
                      // leitura a mais sem informacao a mais.
                      semanticLabel: null,
                    ),
                    const SizedBox(height: BichuEspaco.e6),
                    Semantics(
                      header: true,
                      child: Text(
                        titulo,
                        style: textos.headlineSmall?.copyWith(
                          color: cores.primary,
                        ),
                      ),
                    ),
                    const SizedBox(height: BichuEspaco.e4),
                    Text(corpo, style: textos.bodyLarge),
                    const SizedBox(height: BichuEspaco.e6),
                    if (acao == null || rotuloDaAcao == null)
                      if (semAcao != null)
                        Text(
                          semAcao!,
                          style: textos.bodyMedium?.copyWith(
                            color: cores.textSecondary,
                          ),
                        )
                      else
                        const SizedBox.shrink()
                    else
                      BotaoPrimario(rotulo: rotuloDaAcao!, aoTocar: acao),
                    if (fechar != null && rotuloDeFechar != null) ...<Widget>[
                      const SizedBox(height: BichuEspaco.e2),
                      TextButton(
                        onPressed: fechar,
                        // **O PISO DE TOQUE EXPLICITO**, como a antessala de
                        // aviso faz na mesma posicao: `TextButton` nasce com
                        // 36 dp de altura, e o piso generico do produto e 48
                        // (`BichuAlvoDeToque.min`, design system 6.5). Sem
                        // esta linha a saida desta tela nasceria abaixo do
                        // piso -- e e ela que impede o recado de ser um
                        // bloqueio.
                        style: TextButton.styleFrom(
                          minimumSize:
                              const Size.fromHeight(BichuAlvoDeToque.min),
                        ),
                        child: Text(rotuloDeFechar!),
                      ),
                    ],
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
