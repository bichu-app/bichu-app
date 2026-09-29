import 'package:flutter/material.dart';

import '../theme/bichu_colors.dart';
import '../theme/bichu_tokens.g.dart';

/// A acao primaria: botao preenchido de largura total, na manteiga.
///
/// O estado de carregando **mantem o rotulo visivel**. O Material 3 nao define
/// esse estado, e a alternativa comum, trocar o rotulo por um indicador, tira
/// da tela a unica pista do que esta acontecendo no momento em que a pessoa
/// mais precisa dela.
///
/// [critico] troca o alvo de toque de 48 para 64 dp. Use nas acoes de tela
/// critica: pessoa em pe, com um animal em um dos bracos, usando o polegar da
/// outra mao (secao 6.5).
class BotaoPrimario extends StatelessWidget {
  const BotaoPrimario({
    required this.rotulo,
    required this.aoTocar,
    super.key,
    this.carregando = false,
    this.critico = false,
  });

  final String rotulo;

  /// Nulo desabilita. **Nao desabilite por estado de rede**: o detector de
  /// offline erra, e deixar a pessoa sem caminho e pior que deixa-la tentar.
  final VoidCallback? aoTocar;

  final bool carregando;
  final bool critico;

  @override
  Widget build(BuildContext context) {
    final bichu = BichuColors.of(context);
    final estilo =
        critico ? bichu.filledButtonStyleCritico : bichu.filledButtonStyle;
    final textos = Theme.of(context).textTheme;

    // A acao efetiva, numa variavel so, usada pelos tres lugares que precisam
    // concordar: o `onPressed` do botao, o `onTap` da semantica e o `enabled`
    // anunciado. Enquanto ela viveu apenas dentro do `onPressed`, os tres
    // divergiram em silencio.
    final VoidCallback? acao = carregando ? null : aoTocar;

    return Semantics(
      button: true,
      // `enabled` segue [acao], e nao [aoTocar]: enquanto seguia `aoTocar`, o
      // botao carregando se anunciava HABILITADO sem ter acao nenhuma, e o
      // leitor de tela oferecia um controle que nao responde.
      enabled: acao != null,
      label: carregando ? '$rotulo, em andamento' : rotulo,
      excludeSemantics: true,
      // A LINHA QUE FALTAVA.
      //
      // `excludeSemantics: true` apaga a arvore do filho INTEIRA, e com ela a
      // acao de toque que o `FilledButton` publica. O que sobrava era um no
      // com `button: true` e ZERO acoes. Medido na arvore: `Cadastrar meu pet`
      // saia com `btn=true tap=false`, enquanto o `BotaoSecundario` ao lado,
      // que nao embrulha nada, saia com `tap=true`.
      //
      // Quem navega por TalkBack ou VoiceOver ouvia que existe um botao e nao
      // recebia a acao: a acao primaria de quase toda tela do produto era
      // inalcancavel pelo leitor de tela (WCAG 2.1 SC 4.1.2, nome/funcao/valor).
      //
      // Redeclarar e o preco de `excludeSemantics`, e esquecer nao aparece em
      // teste manual nem em revisao de codigo. Quem cobra agora e
      // `test/a11y/acao_de_controle_test.dart`, em TODO no anunciado como
      // botao -- a classe, e nao este caso.
      onTap: acao,
      child: FilledButton(
        onPressed: acao,
        style: estilo,
        child: Row(
          mainAxisAlignment: MainAxisAlignment.center,
          mainAxisSize: MainAxisSize.min,
          children: <Widget>[
            if (carregando) ...<Widget>[
              SizedBox(
                width: 18,
                height: 18,
                child: CircularProgressIndicator(
                  strokeWidth: 2.5,
                  color: bichu.cores.onActionFill,
                ),
              ),
              const SizedBox(width: BichuEspaco.e3),
            ],
            Flexible(
              child: Text(
                rotulo,
                style: textos.labelLarge,
                textAlign: TextAlign.center,
              ),
            ),
          ],
        ),
      ),
    );
  }
}

/// A acao secundaria: contorno de 2px.
///
/// Botao tonal sobre superficie clara fica com 1.3:1 de contraste de
/// container, e o usuario nao identifica onde e o alvo sob sol; por isso o
/// sistema nao usa `FilledTonalButton` (divergencia 7 da secao 15.6).
/// [carregando] segue o paragrafo 11.20: o rotulo **permanece** e o indicador
/// entra a esquerda dele. Mesma razao do [BotaoPrimario] -- trocar o rotulo por
/// um indicador tira da tela a unica pista do que esta acontecendo no momento
/// em que a pessoa mais precisa dela.
///
/// Este botao **nao** embrulha o filho em `Semantics(excludeSemantics: true)`,
/// e por isso nao precisa redeclarar `onTap`: o `OutlinedButton` publica a
/// propria acao, e ja sai com `tap=true`. Carregando, `onPressed` fica nulo e
/// o botao se anuncia desabilitado, que e a verdade.
class BotaoSecundario extends StatelessWidget {
  const BotaoSecundario({
    required this.rotulo,
    required this.aoTocar,
    super.key,
    this.carregando = false,
  });

  final String rotulo;
  final VoidCallback? aoTocar;

  final bool carregando;

  @override
  Widget build(BuildContext context) {
    if (!carregando) {
      return OutlinedButton(onPressed: aoTocar, child: Text(rotulo));
    }

    final cores = BichuColors.of(context).cores;

    return OutlinedButton(
      onPressed: null,
      child: Row(
        mainAxisAlignment: MainAxisAlignment.center,
        mainAxisSize: MainAxisSize.min,
        children: <Widget>[
          SizedBox(
            width: 18,
            height: 18,
            child: CircularProgressIndicator(
              strokeWidth: 2.5,
              color: cores.textSecondary,
              // Quem usa leitor de tela ouve o botao DESABILITADO e nao
              // saberia por que. O indicador diz.
              semanticsLabel: 'Carregando',
            ),
          ),
          const SizedBox(width: BichuEspaco.e3),
          Flexible(child: Text(rotulo, textAlign: TextAlign.center)),
        ],
      ),
    );
  }
}
