import 'package:flutter/material.dart';
import 'package:flutter/services.dart';

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
    this.limite,
    this.formatadores,
    this.linhas = 1,
    this.exemplo,
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

  /// O teto de caracteres do contrato, com contador visivel.
  ///
  /// **O contador e prevencao, e nao punicao** (UX F1.3 e F1.5): ele existe
  /// para o limite ser sabido **antes** da tentativa, que e a regra da secao
  /// 13. O campo para de aceitar no teto em vez de deixar o servidor recusar
  /// depois, porque o limite e do contrato e nao ha ambiguidade a resolver.
  final int? limite;

  /// Formatadores aplicados a cada toque. Hoje o unico e a mascara do codigo
  /// da tag; o campo nao conhece nenhum deles, e e essa a intencao.
  final List<TextInputFormatter>? formatadores;

  /// Quantas linhas o campo mostra. Acima de uma, ele e de texto corrido.
  final int linhas;

  /// Um exemplo dentro do campo. **Nao e rotulo:** o rotulo fica acima e
  /// persiste. O exemplo existe onde a especificacao pede um ("coleira
  /// vermelha, mancha branca no peito, rabo curto").
  final String? exemplo;

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
          maxLength: limite,
          inputFormatters: formatadores,
          maxLines: obscurecer ? 1 : linhas,
          minLines: obscurecer ? 1 : linhas,
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
            hintText: exemplo,
            // O rotulo ja esta acima. Repeti-lo aqui produziria dois rotulos
            // para o leitor de tela.
            labelText: null,
            // O contador do M3 e desenhado dentro da decoracao; o do produto e
            // uma linha propria abaixo, alinhada a direita, porque a
            // especificacao a escreve assim ("Contador: 0/280") e porque o
            // contador do M3 some quando ha `errorText`, que e justamente
            // quando a pessoa precisa dele.
            counterText: '',
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
                  // Anunciado como estado, e nao como conteudo: o contador
                  // mudando a cada tecla nao pode interromper a fala.
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
