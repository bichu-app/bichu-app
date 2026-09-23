import 'package:flutter/material.dart';

import '../theme/bichu_colors.dart';
import '../theme/bichu_tokens.g.dart';
import '../validacao/politica_de_senha.dart';

/// A lista de requisitos da senha, atualizada **enquanto a pessoa digita**.
///
/// Substitui o texto de ajuda estatico que ficava sob o campo de senha ("Pelo
/// menos 10 caracteres. Uma frase curta funciona melhor que uma senha
/// complicada."). Pedido do cliente em 22/09/2026: _"colocar aquelas validacoes
/// do campo dinamico conforme o usuario for preenchendo e ir respeitando a
/// politica de senha."_
///
/// O texto estatico dizia **um** dos quatro requisitos e so virava erro depois
/// do toque no botao. A lista diz os quatro e responde a cada tecla.
///
/// ## Tres decisoes que o codigo nao entrega sozinho
///
/// **Escuta os controladores, e nao um `setState` da tela.** A regra
/// `similar_to_identity` depende do e-mail e do nome, entao a lista precisa
/// reagir a **tres** campos. Amarrar isso a `onChanged` de cada um deixaria a
/// lista parada no dia em que alguem acrescentasse um `onChanged` proprio a um
/// deles e esquecesse de encadear. Aqui o `Listenable.merge` nao tem como ser
/// esquecido.
///
/// **Um no de semantica para a lista inteira, com regiao viva.** Oito nos
/// (icone e texto de cada linha) fariam o leitor de tela recitar fragmentos
/// soltos. O rotulo composto diz quantos requisitos estao atendidos, quais, e o
/// que falta, numa frase.
///
/// E ele **so muda quando um requisito vira**, nunca a cada tecla: o rotulo e
/// montado a partir dos estados, e nao do que foi digitado. Regiao viva que
/// muda de texto a cada caractere interrompe a fala do TalkBack sem parar,
/// que e o jeito conhecido de tornar um campo de senha inutilizavel para quem
/// nao enxerga.
///
/// **Cor nao e o unico indicador** (WCAG 2.1 SC 1.4.1): cada estado tem icone
/// proprio, e verde e vermelho saem de token (`cores.success`, `cores.error`).
class RequisitosDaSenha extends StatelessWidget {
  const RequisitosDaSenha({
    required this.senha,
    required this.email,
    required this.nome,
    super.key,
  });

  /// O campo de senha. A lista se redesenha a cada mudanca dele.
  final TextEditingController senha;

  /// O campo de e-mail, porque `similar_to_identity` o compara com a senha.
  final TextEditingController email;

  /// O campo de nome, pelo mesmo motivo.
  final TextEditingController nome;

  @override
  Widget build(BuildContext context) {
    return AnimatedBuilder(
      animation: Listenable.merge(<Listenable>[senha, email, nome]),
      builder: (context, _) {
        final estados = PoliticaDeSenha.avaliar(
          senha: senha.text,
          email: email.text.trim(),
          nome: nome.text.trim(),
        );
        final cores = BichuColors.of(context).cores;
        final textos = Theme.of(context).textTheme;

        return Semantics(
          container: true,
          liveRegion: true,
          label: _rotulo(estados),
          excludeSemantics: true,
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: <Widget>[
              for (final entrada in estados.entries)
                Padding(
                  padding: const EdgeInsets.only(bottom: BichuEspaco.e1),
                  child: Row(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: <Widget>[
                      Icon(
                        _icone(entrada.value),
                        size: 18,
                        color: _cor(entrada.value, cores),
                      ),
                      const SizedBox(width: BichuEspaco.e2),
                      Expanded(
                        child: Text(
                          entrada.key.texto,
                          style: textos.bodyMedium
                              ?.copyWith(color: _cor(entrada.value, cores)),
                        ),
                      ),
                    ],
                  ),
                ),
              const SizedBox(height: BichuEspaco.e1),
              Text(
                avisoDoQueOServidorAindaConfere,
                style: textos.bodySmall?.copyWith(color: cores.textSecondary),
              ),
            ],
          ),
        );
      },
    );
  }

  static IconData _icone(EstadoDaRegra estado) {
    switch (estado) {
      case EstadoDaRegra.aguardando:
        return Icons.circle_outlined;
      case EstadoDaRegra.atendida:
        return Icons.check_circle_outline;
      case EstadoDaRegra.naoAtendida:
        return Icons.cancel_outlined;
    }
  }

  /// A cor do estado, **sempre de token**. Literal hexadecimal aqui reprova o
  /// portao de tokens, e com razao: verde e vermelho de estado sao decisao do
  /// sistema de design, e ja tem par de contraste medido.
  static Color _cor(EstadoDaRegra estado, BichuCores cores) {
    switch (estado) {
      case EstadoDaRegra.aguardando:
        return cores.textSecondary;
      case EstadoDaRegra.atendida:
        return cores.success;
      case EstadoDaRegra.naoAtendida:
        return cores.error;
    }
  }

  /// A frase que o leitor de tela le, montada dos estados.
  static String _rotulo(Map<RegraDeSenha, EstadoDaRegra> estados) {
    final atendidas = <String>[
      for (final e in estados.entries)
        if (e.value == EstadoDaRegra.atendida) e.key.texto.toLowerCase(),
    ];
    final faltando = <String>[
      for (final e in estados.entries)
        if (e.value == EstadoDaRegra.naoAtendida) e.key.texto.toLowerCase(),
    ];

    if (atendidas.isEmpty && faltando.isEmpty) {
      final todos = estados.keys.map((r) => r.texto.toLowerCase()).join('; ');
      return 'Requisitos da senha: $todos. '
          '$avisoDoQueOServidorAindaConfere';
    }

    final partes = <String>[
      'Requisitos da senha, ${atendidas.length} de ${estados.length} '
          'atendidos.',
      if (atendidas.isNotEmpty) 'Atendidos: ${atendidas.join('; ')}.',
      if (faltando.isNotEmpty) 'Falta: ${faltando.join('; ')}.',
      avisoDoQueOServidorAindaConfere,
    ];
    return partes.join(' ');
  }
}
