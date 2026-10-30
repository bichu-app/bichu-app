import 'package:flutter/material.dart';

import '../theme/bichu_colors.dart';
import '../theme/bichu_tokens.g.dart';

/// **O SELO DE VALIDADO**, ao lado do nome de uma pessoa.
class SeloDeValidado extends StatelessWidget {
  const SeloDeValidado({super.key, this.cor});

  /// A COR DO GLIFO. Nula e `cor/success`, que e o padrao e continua sendo o
  /// selo em toda superficie de `surface`.
  final Color? cor;

  /// O nome acessivel. **"Contato confirmado", e nunca mais do que isso.**
  static const String rotulo = 'Contato confirmado';

  /// 20 dp: `icon.size.inline` do `design/tokens.json`, *"dentro de texto e
  /// chip"*, que e exatamente o que este selo e.
  static const double lado = BichuEspaco.e5;

  /// O vao entre o nome e o selo: `space.1`.
  static const double vao = BichuEspaco.e1;

  /// **O QUE O SELO CUSTA DE LARGURA: 24 dp.** [lado] + [vao].
  static const double custoDeLargura = lado + vao;

  @override
  Widget build(BuildContext context) {
    final cores = BichuColors.of(context).cores;
    return Semantics(
      label: rotulo,
      child: ExcludeSemantics(
        child: Icon(
          Icons.verified,
          size: lado,
          color: cor ?? cores.success,
        ),
      ),
    );
  }
}

/// **O NOME DE UMA PESSOA, com o selo de validado ao lado quando ele existe.**
class NomeComSelo extends StatelessWidget {
  const NomeComSelo({
    required this.nome,
    required this.comSelo,
    super.key,
    this.estilo,
    this.corDoSelo,
    this.alinhamento = MainAxisAlignment.start,
  });

  final String nome;

  /// **`contact_channel_verified` do servidor, e nunca uma comparacao desta
  /// camada.**
  final bool comSelo;

  final TextStyle? estilo;

  /// A cor do selo, quando ela nao pode ser a padrao.
  final Color? corDoSelo;

  final MainAxisAlignment alinhamento;

  @override
  Widget build(BuildContext context) {
    return Row(
      mainAxisAlignment: alinhamento,
      mainAxisSize: MainAxisSize.min,
      children: <Widget>[
        Flexible(
          child: Text(
            nome,
            style: estilo,
            maxLines: 1,
            overflow: TextOverflow.ellipsis,
          ),
        ),
        if (comSelo) ...<Widget>[
          const SizedBox(width: SeloDeValidado.vao),
          SeloDeValidado(cor: corDoSelo),
        ],
      ],
    );
  }
}
