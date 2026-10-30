import 'package:flutter/material.dart';

import '../theme/bichu_tokens.g.dart';
import 'marca_da_pessoa.dart';
import 'selo_de_validado.dart';

/// **UMA PESSOA, ESCRITA DO MESMO JEITO EM TODA LISTAGEM**: o circulo dela, o
/// nome dela e o selo dela, **sempre os tres juntos e nesta ordem**.
class FichaDaPessoa extends StatelessWidget {
  const FichaDaPessoa({
    required this.nome,
    required this.urlDaFoto,
    required this.comSelo,
    super.key,
    this.lado = 40,
    this.estiloDoNome,
    this.abaixoDoNome,
  });

  /// Como a pessoa e escrita.
  final String nome;

  /// A derivada `thumb` de 176 px da foto, **ou nula**.
  final String? urlDaFoto;

  /// `contact_channel_verified` do servidor, **e nunca uma comparacao desta
  /// camada**.
  final bool comSelo;

  /// O lado do circulo, em dp.
  final double lado;

  /// O estilo do nome. Nulo deixa o [NomeComSelo] herdar do tema.
  final TextStyle? estiloDoNome;

  /// A segunda linha, quando ela existe: `@apelido`, as contagens, a data do
  /// bloqueio.
  final Widget? abaixoDoNome;

  @override
  Widget build(BuildContext context) {
    return Row(
      crossAxisAlignment: CrossAxisAlignment.center,
      children: <Widget>[
        MarcaDaPessoa(
          urlDoIcone: urlDaFoto,
          inicial: MarcaDaPessoa.letraDe(nome),
          lado: lado,
        ),
        const SizedBox(width: BichuEspaco.e3),
        Expanded(
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            mainAxisSize: MainAxisSize.min,
            children: <Widget>[
              NomeComSelo(nome: nome, comSelo: comSelo, estilo: estiloDoNome),
              ?abaixoDoNome,
            ],
          ),
        ),
      ],
    );
  }
}
