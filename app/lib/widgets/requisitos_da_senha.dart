import 'package:flutter/material.dart';

import '../theme/bichu_colors.dart';
import '../theme/bichu_tokens.g.dart';
import '../validacao/politica_de_senha.dart';

/// A lista de requisitos da senha, atualizada **enquanto a pessoa digita**.
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

  /// A cor do estado, **sempre de token**.
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
      return 'Requisitos da senha: $todos.';
    }

    final partes = <String>[
      'Requisitos da senha, ${atendidas.length} de ${estados.length} '
          'atendidos.',
      if (atendidas.isNotEmpty) 'Atendidos: ${atendidas.join('; ')}.',
      if (faltando.isNotEmpty) 'Falta: ${faltando.join('; ')}.',
    ];
    return partes.join(' ');
  }
}
