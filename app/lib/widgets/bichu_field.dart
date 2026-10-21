import 'package:flutter/material.dart';
import 'package:flutter/services.dart';

import '../acessibilidade/anunciar.dart';
import '../theme/bichu_colors.dart';
import '../theme/bichu_tokens.g.dart';
import 'barra_do_teclado.dart';

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

  /// A mensagem de erro do campo. Diz o que houve e o que fazer, e nunca
  /// contem "erro", "invalido", "falhou" nem codigo tecnico.
  final String? erro;

  final bool opcional;

  /// Quando o rotulo e DESENHADO acima do campo.
  ///
  /// **Falso nao apaga o rotulo**: ele deixa de ser desenhado e continua sendo
  /// o nome acessivel do campo, por um `Semantics` em volta do `TextField`.
  /// Campo com dica e sem rotulo e campo **mudo** para leitor de tela
  /// (SC 3.3.2 e SC 4.1.2): a dica desaparece no instante em que a pessoa
  /// digita a primeira letra, e com ela desapareceria o unico nome que o
  /// campo tinha. O `MergeSemantics` existe para o nome e o no editavel serem
  /// **um** no, e nao um rotulo solto ao lado de um campo sem nome.
  ///
  /// Existe para o campo de busca da listagem, por pedido do cliente de
  /// 17/10/2026: *"Tire o texto do app buscar encontro (opcional), coloque o
  /// texto no placeholder do campo buscar"*. Formulario nenhum passa por aqui
  /// -- ali o rotulo fixo acima do campo e a divergencia deliberada do M3 que
  /// a prosa desta classe explica, e ela continua valendo.
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

  /// Chamado quando o foco **sai** do campo.
  ///
  /// Existe para a conferencia ao sair do campo, que e o momento em que o
  /// e-mail pode ser conferido sem interromper quem ainda esta digitando: a
  /// cada tecla, `leandro@g` seria erro durante toda a digitacao.
  ///
  /// A fiacao fica **aqui**, e nao em cada tela: o `Focus` em volta do campo
  /// nao pede foco nem entra na travessia, entao ele observa a perda de foco
  /// da subarvore sem mudar a ordem de tabulacao nem o alvo de toque.
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
              // SO EM TEXTO CORRIDO. Campo de uma linha ja tem desfecho na
              // propria tecla de retorno (`done` desenha o certo, `next` a
              // flecha), e o teclado do sistema tem UMA tecla de retorno com
              // 13 rotulos possiveis -- `next` e `previous` existem como
              // rotulo, mas so um cabe nela. Quem precisa de faixa e o campo
              // em que a tecla insere linha em vez de concluir: ver
              // `widgets/barra_do_teclado.dart`.
              //
              // `obscurecer` entra na conta porque o campo de senha forca uma
              // linha so logo abaixo, e um campo de senha com faixa de
              // travessia seria faixa num campo que nunca precisa dela.
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
            // Colar habilitado no campo de senha: bloquear colar empurra a
            // pessoa para uma senha que ela consegue digitar, que e pior.
            enableInteractiveSelection: true,
            autocorrect: correcaoAutomatica,
            textCapitalization: capitalizacao,
            textInputAction: acaoDeTeclado,
            // TOCAR FORA FECHA O TECLADO, e esta linha e o que liga isso no
            // celular.
            //
            // **O Flutter recusa este gesto no telefone de proposito**, e nao
            // por esquecimento: `EditableText._defaultOnTapOutside` tem um
            // `switch` por plataforma em que Android, iOS e Fuchsia caem num
            // `break` -- so desktop desfoca. Sem este `onTapOutside`, nenhum
            // dos campos do app fecha o teclado por toque fora: medido, 0 de
            // 22 telas.
            //
            // **E o conserto dos becos sem saida.** Levantado em 20/10/2026
            // sobre a arvore inteira: 65 campos de texto em 22 telas, e em 7
            // delas o teclado subia e nao descia -- 16 campos sao de texto
            // corrido, e num campo de varias linhas a tecla de retorno insere
            // linha em vez de concluir. No Android o botao voltar salvava a
            // pessoa; no iOS nao ha equivalente, e e literalmente o defeito de
            // iOS que o cliente relatou duas vezes no mesmo dia.
            //
            // **Tocar em OUTRO CAMPO continua NAO fechando, e isso e certo.**
            // Quem decide e o `groupId` do `TextFieldTapRegion` que o
            // `EditableText` desenha em volta de si: ele e a propria classe
            // `EditableText` para todos os campos, entao um campo esta DENTRO
            // da regiao do outro e o toque nem chega aqui. E o que faz a troca
            // entre campos de um formulario nao piscar o teclado. Ha caso
            // proprio medindo os dois lados.
            //
            // `primaryFocus`, e nao `FocusScope.of(context).unfocus()`: o que
            // fecha o teclado e o no que esta com o foco, e ele pode nao estar
            // no escopo deste `context` quando o campo vive dentro de folha
            // modal.
            onTapOutside: (PointerDownEvent _) =>
                FocusManager.instance.primaryFocus?.unfocus(),
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

/// Embala o campo com a faixa de `Concluir` **so quando ele e texto corrido**.
///
/// Com [textoCorrido] falso nao ha no nenhum a mais na arvore -- nem um
/// `Focus`, nem um `State` --, e isso e o contrapeso escrito como codigo: os
/// 49 campos de uma linha do app nao pagam nada pelo conserto dos 16 de texto
/// corrido, e nao ganham um segundo controle para o que a tecla de retorno
/// deles ja resolve.
Widget _comBarraDoTeclado({required bool textoCorrido, required Widget filho}) {
  if (!textoCorrido) return filho;
  return AcessorioDeTextoCorrido(child: filho);
}

/// Da ao campo sem rotulo visivel um nome acessivel, e nada mais.
///
/// Com [visivel] verdadeiro nao ha no nenhum a mais na arvore: o rotulo esta
/// desenhado acima e o `TextField` ja o tem como nome. Com falso, o
/// `MergeSemantics` cola o nome no no editavel -- sem ele seriam dois nos, um
/// com o nome e outro com o campo, e o leitor de tela pararia num campo que
/// nao se chama nada.
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
///
/// Sem [aoPerderFoco] nao ha no nenhum a mais na arvore: um `Focus` inutil em
/// todo campo do produto mudaria a travessia de teclado de telas que nao
/// pediram nada.
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
