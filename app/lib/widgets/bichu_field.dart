import 'package:flutter/material.dart';

import '../acessibilidade/anunciar.dart';
import '../theme/bichu_colors.dart';
import '../theme/bichu_tokens.g.dart';

/// O campo de formulario do Bichu.
///
/// Divergencia deliberada do Material 3 (secao 15.6, item 8): **o rotulo fica
/// fixo acima do campo, nunca flutuante**. O rotulo flutuante reduz a altura
/// util e some quando o campo esta preenchido, que e exatamente quando a
/// pessoa revisa o que digitou.
///
/// Padroes que valem para todo campo do produto (UX secao 13):
/// - o requisito e dito **antes** do erro, em [ajuda];
/// - campo opcional e marcado em texto no rotulo, "(opcional)", e nao por
///   asterisco: asterisco falha para leitor de tela e para quem nao conhece a
///   convencao;
/// - o erro fica associado ao campo e e anunciado por regiao viva.
class BichuField extends StatelessWidget {
  const BichuField({
    required this.rotulo,
    required this.controlador,
    super.key,
    this.ajuda,
    this.erro,
    this.opcional = false,
    this.tipoDeTeclado,
    this.autofill = const <String>[],
    this.obscurecer = false,
    this.aoEnviar,
    this.aoMudar,
    this.habilitado = true,
    this.sufixo,
    this.foco,
    this.acaoDeTeclado,
    this.capitalizacao = TextCapitalization.none,
    this.correcaoAutomatica = true,
  });

  final String rotulo;
  final TextEditingController controlador;

  /// O requisito, dito antes da tentativa.
  final String? ajuda;

  /// A mensagem de erro do campo. Diz o que houve e o que fazer, e nunca
  /// contem "erro", "invalido", "falhou" nem codigo tecnico.
  final String? erro;

  final bool opcional;
  final TextInputType? tipoDeTeclado;
  final List<String> autofill;
  final bool obscurecer;
  final ValueChanged<String>? aoEnviar;
  final ValueChanged<String>? aoMudar;
  final bool habilitado;
  final Widget? sufixo;
  final FocusNode? foco;
  final TextInputAction? acaoDeTeclado;
  final TextCapitalization capitalizacao;
  final bool correcaoAutomatica;

  @override
  Widget build(BuildContext context) {
    final cores = BichuColors.of(context).cores;
    final textos = Theme.of(context).textTheme;
    final temErro = erro != null && erro!.isNotEmpty;

    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: <Widget>[
        Text(
          opcional ? '$rotulo (opcional)' : rotulo,
          style: textos.labelLarge?.copyWith(color: cores.textPrimary),
        ),
        const SizedBox(height: BichuEspaco.e1),
        if (ajuda != null) ...<Widget>[
          Text(
            ajuda!,
            style: textos.bodyMedium?.copyWith(color: cores.textSecondary),
          ),
          const SizedBox(height: BichuEspaco.e2),
        ],
        TextField(
          controller: controlador,
          focusNode: foco,
          enabled: habilitado,
          keyboardType: tipoDeTeclado,
          autofillHints: autofill,
          obscureText: obscurecer,
          // Colar habilitado no campo de senha: bloquear colar empurra a
          // pessoa para uma senha que ela consegue digitar, que e pior.
          enableInteractiveSelection: true,
          autocorrect: correcaoAutomatica,
          textCapitalization: capitalizacao,
          textInputAction: acaoDeTeclado,
          onSubmitted: aoEnviar,
          onChanged: aoMudar,
          style: textos.bodyLarge?.copyWith(color: cores.textPrimary),
          decoration: InputDecoration(
            suffixIcon: sufixo,
            errorText: temErro ? erro : null,
            // O rotulo ja esta acima. Repeti-lo aqui produziria dois rotulos
            // para o leitor de tela.
            labelText: null,
          ),
        ),
      ],
    );
  }
}

/// O olho que revela a senha, com o estado anunciado.
///
/// O rotulo acessivel muda junto com o icone: sem isso, quem usa leitor de
/// tela ouve "botao" e nao sabe se a senha esta visivel.
class BotaoRevelarSenha extends StatelessWidget {
  const BotaoRevelarSenha({
    required this.visivel,
    required this.aoAlternar,
    super.key,
  });

  final bool visivel;
  final VoidCallback aoAlternar;

  @override
  Widget build(BuildContext context) {
    final rotulo = visivel ? 'senha visível' : 'senha oculta';
    return IconButton(
      onPressed: () {
        aoAlternar();
        anunciar(context, visivel ? 'senha oculta' : 'senha visível');
      },
      tooltip: visivel ? 'Ocultar a senha' : 'Mostrar a senha',
      icon: Icon(visivel ? Icons.visibility_off : Icons.visibility),
      iconSize: 24,
      constraints: const BoxConstraints(
        minWidth: BichuAlvoDeToque.min,
        minHeight: BichuAlvoDeToque.min,
      ),
      color: BichuColors.of(context).cores.textSecondary,
      selectedIcon: null,
      isSelected: visivel,
      // O estado vai no rotulo semantico, nao so no icone.
      autofocus: false,
      focusColor: BichuColors.of(context).cores.focusRing,
      padding: EdgeInsets.zero,
      style: IconButton.styleFrom(
        shape: RoundedRectangleBorder(
          borderRadius: BorderRadius.circular(BichuRaio.sm),
        ),
      ),
      key: ValueKey<String>('revelar-senha:$rotulo'),
    );
  }
}
