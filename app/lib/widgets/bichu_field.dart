import 'package:flutter/material.dart';
import 'package:flutter/services.dart';

import '../acessibilidade/anunciar.dart';
import '../theme/bichu_colors.dart';
import '../theme/bichu_tokens.g.dart';
import 'barra_do_teclado.dart';

/// O campo de formulario do Bichu.
class BichuField extends StatelessWidget {
  const BichuField({
    required this.rotulo,
    required this.controlador,
    super.key,
    this.ajuda,
    this.erro,
    this.opcional = false,
    this.rotuloVisivel = true,
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
    this.limite,
    this.formatadores,
    this.linhas = 1,
    this.exemplo,
    this.aoPerderFoco,
  });

  final String rotulo;
  final TextEditingController controlador;

  /// O requisito, dito antes da tentativa.
  final String? ajuda;

  /// A mensagem de erro do campo.
  final String? erro;

  final bool opcional;

  /// Quando o rotulo e DESENHADO acima do campo.
  final bool rotuloVisivel;

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

  /// O teto de caracteres do contrato, com contador visivel.
  final int? limite;

  /// Formatadores aplicados a cada toque.
  final List<TextInputFormatter>? formatadores;

  /// Quantas linhas o campo mostra.
  final int linhas;

  /// Um exemplo dentro do campo.
  final String? exemplo;

  /// Chamado quando o foco **sai** do campo.
  final VoidCallback? aoPerderFoco;

  @override
  Widget build(BuildContext context) {
    final cores = BichuColors.of(context).cores;
    final textos = Theme.of(context).textTheme;
    final temErro = erro != null && erro!.isNotEmpty;

    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: <Widget>[
        if (rotuloVisivel) ...<Widget>[
          Text(
            opcional ? '$rotulo (opcional)' : rotulo,
            style: textos.labelLarge?.copyWith(color: cores.textPrimary),
          ),
          const SizedBox(height: BichuEspaco.e1),
        ],
        if (ajuda != null) ...<Widget>[
          Text(
            ajuda!,
            style: textos.bodyMedium?.copyWith(color: cores.textSecondary),
          ),
          const SizedBox(height: BichuEspaco.e2),
        ],
        _comAvisoDePerdaDeFoco(
          aoPerderFoco: aoPerderFoco,
          filho: _comNomeAcessivel(
            rotulo: rotulo,
            visivel: rotuloVisivel,
            filho: _comBarraDoTeclado(
              textoCorrido: linhas > 1 && !obscurecer,
              filho: TextField(
            controller: controlador,
            focusNode: foco,
            enabled: habilitado,
            maxLength: limite,
            inputFormatters: formatadores,
            maxLines: obscurecer ? 1 : linhas,
            minLines: obscurecer ? 1 : linhas,
            keyboardType: tipoDeTeclado,
            autofillHints: autofill,
            obscureText: obscurecer,
            enableInteractiveSelection: true,
            autocorrect: correcaoAutomatica,
            textCapitalization: capitalizacao,
            textInputAction: acaoDeTeclado,
            onTapOutside: (PointerDownEvent _) =>
                FocusManager.instance.primaryFocus?.unfocus(),
            onSubmitted: aoEnviar,
            onChanged: aoMudar,
            style: textos.bodyLarge?.copyWith(color: cores.textPrimary),
            decoration: InputDecoration(
              suffixIcon: sufixo,
              errorText: temErro ? erro : null,
              hintText: exemplo,
              labelText: null,
              counterText: '',
            ),
            ),
            ),
          ),
        ),
        if (limite != null) ...<Widget>[
          const SizedBox(height: BichuEspaco.e1),
          Align(
            alignment: Alignment.centerRight,
            child: ValueListenableBuilder<TextEditingValue>(
              valueListenable: controlador,
              builder: (context, valor, _) {
                return Semantics(
                  label: '${valor.text.characters.length} de $limite '
                      'caracteres',
                  excludeSemantics: true,
                  child: Text(
                    '${valor.text.characters.length}/$limite',
                    style: textos.bodySmall?.copyWith(color: cores.textMuted),
                  ),
                );
              },
            ),
          ),
        ],
      ],
    );
  }
}

/// Embala o campo com a faixa de `Concluir` **so quando ele e texto corrido**.
Widget _comBarraDoTeclado({required bool textoCorrido, required Widget filho}) {
  if (!textoCorrido) return filho;
  return AcessorioDeTextoCorrido(child: filho);
}

/// Da ao campo sem rotulo visivel um nome acessivel, e nada mais.
Widget _comNomeAcessivel({
  required String rotulo,
  required bool visivel,
  required Widget filho,
}) {
  if (visivel) return filho;
  return MergeSemantics(
    child: Semantics(label: rotulo, textField: true, child: filho),
  );
}

/// Envolve o campo num `Focus` que so observa, quando ha quem observar.
Widget _comAvisoDePerdaDeFoco({
  required Widget filho,
  VoidCallback? aoPerderFoco,
}) {
  if (aoPerderFoco == null) return filho;
  return Focus(
    canRequestFocus: false,
    skipTraversal: true,
    onFocusChange: (tem) {
      if (!tem) aoPerderFoco();
    },
    child: filho,
  );
}

/// O olho que revela a senha, com o estado anunciado.
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
