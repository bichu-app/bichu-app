// GERADO POR app/tool/gen_icones_da_barra.dart A PARTIR DE design/icones-da-barra/*.svg — NÃO EDITE.
//
// Para mudar um ícone da barra, mude o SVG na raiz do repositório e rode, de
// dentro de app/:
//   dart run tool/gen_icones_da_barra.dart
//
// ignore_for_file: lines_longer_than_80_chars

/// Uma forma de um ícone da barra: curva ou círculo.
///
/// Duas formas e não duas classes porque o `const` de um campo
/// de [GrupoDoIcone] precisa de UM tipo. [d] não nulo é curva;
/// [r] não nulo é círculo. Nunca os dois, e nunca nenhum —
/// o `assert` abaixo é o que torna isso verdade em `const`.
class FormaDoIcone {
  const FormaDoIcone.curva(this.d)
      : cx = null,
        cy = null,
        r = null;

  const FormaDoIcone.circulo({
    required double this.cx,
    required double this.cy,
    required double this.r,
  }) : d = null;

  /// O atributo `d` do SVG, com os comandos `M`, `C`, `L` e `Z`.
  final String? d;

  /// Centro e raio, quando a forma é um `<circle>`.
  final double? cx;
  final double? cy;
  final double? r;

  bool get ehCurva => d != null;
}

/// Um grupo do SVG: as formas que compartilham o mesmo preenchimento.
class GrupoDoIcone {
  const GrupoDoIcone({required this.preenchido, required this.formas});

  /// `fill="currentColor"` no SVG; `false` é `fill="none"`.
  ///
  /// É ESTE campo que separa o estado selecionado do de repouso:
  /// contorno em repouso, preenchido no selecionado (M3).
  final bool preenchido;

  final List<FormaDoIcone> formas;
}

/// Um ícone da barra, como o SVG de origem o declara.
///
/// NENHUMA COR MORA AQUI, e a ausência é a regra e não o esquecimento:
/// o SVG pinta `currentColor` e quem resolve a tinta é o `iconTheme` de
/// `BichuTheme`, que troca entre `text-secondary` e
/// `on-primary-container` por estado. Cor escrita neste arquivo seria o
/// papel do tema virando constante solta.
class DesenhoDoIcone {
  const DesenhoDoIcone({
    required this.arquivo,
    required this.rotuloDaArte,
    required this.lado,
    required this.espessura,
    required this.grupos,
  });

  /// O nome do arquivo em `design/icones-da-barra/`.
  final String arquivo;

  /// O `aria-label` do SVG.
  ///
  /// **NÃO é o nome acessível da aba**, e isto está escrito para não ser
  /// confundido: o glifo da barra é DECORATIVO e não entra na árvore de
  /// semântica (UX 27.7, regra 2) — quem anuncia a aba é
  /// `DestinoDeNavegacao.nomeAcessivelCom`. Este campo existe para o
  /// portão poder dizer que o arquivo certo foi para o destino certo.
  final String rotuloDaArte;

  /// O lado do `viewBox` quadrado, em unidades do desenho.
  final double lado;

  /// `stroke-width` do SVG, nas mesmas unidades de [lado].
  final double espessura;

  final List<GrupoDoIcone> grupos;
}

/// Os dez ícones que a barra de baixo consome.
abstract final class IconesDaBarra {

  static const DesenhoDoIcone pets = DesenhoDoIcone(
    arquivo: 'pets.svg',
    rotuloDaArte: 'Pets',
    lado: 24.0,
    espessura: 2.0,
    grupos: <GrupoDoIcone>[
      GrupoDoIcone(
        preenchido: false,
        formas: <FormaDoIcone>[
          FormaDoIcone.curva('M 12 11.4 C 15.8 11.4 18.6 13.8 18.6 16.8 C 18.6 19.4 16.5 20.6 14.3 19.9 C 13.2 19.5 12.7 19.3 12 19.3 C 11.3 19.3 10.8 19.5 9.7 19.9 C 7.5 20.6 5.4 19.4 5.4 16.8 C 5.4 13.8 8.2 11.4 12 11.4 Z'),
          FormaDoIcone.curva('M 4.5 9.6 L 4.1 8.2'),
          FormaDoIcone.curva('M 8.9 7.6 L 8.7 6'),
          FormaDoIcone.curva('M 15.1 7.6 L 15.3 6'),
          FormaDoIcone.curva('M 19.5 9.6 L 19.9 8.2'),
        ],
      ),
    ],
  );

  static const DesenhoDoIcone petsSelecionado = DesenhoDoIcone(
    arquivo: 'pets-selecionado.svg',
    rotuloDaArte: 'Pets, selecionado',
    lado: 24.0,
    espessura: 2.0,
    grupos: <GrupoDoIcone>[
      GrupoDoIcone(
        preenchido: true,
        formas: <FormaDoIcone>[
          FormaDoIcone.curva('M 12 11.4 C 15.8 11.4 18.6 13.8 18.6 16.8 C 18.6 19.4 16.5 20.6 14.3 19.9 C 13.2 19.5 12.7 19.3 12 19.3 C 11.3 19.3 10.8 19.5 9.7 19.9 C 7.5 20.6 5.4 19.4 5.4 16.8 C 5.4 13.8 8.2 11.4 12 11.4 Z'),
        ],
      ),
      GrupoDoIcone(
        preenchido: false,
        formas: <FormaDoIcone>[
          FormaDoIcone.curva('M 4.5 9.6 L 4.1 8.2'),
          FormaDoIcone.curva('M 8.9 7.6 L 8.7 6'),
          FormaDoIcone.curva('M 15.1 7.6 L 15.3 6'),
          FormaDoIcone.curva('M 19.5 9.6 L 19.9 8.2'),
        ],
      ),
    ],
  );

  static const DesenhoDoIcone rede = DesenhoDoIcone(
    arquivo: 'rede.svg',
    rotuloDaArte: 'Rede',
    lado: 24.0,
    espessura: 2.0,
    grupos: <GrupoDoIcone>[
      GrupoDoIcone(
        preenchido: false,
        formas: <FormaDoIcone>[
          FormaDoIcone.circulo(cx: 7.5, cy: 7.8, r: 2.5),
          FormaDoIcone.circulo(cx: 16.5, cy: 7.8, r: 2.5),
          FormaDoIcone.curva('M 3.4 20.9 C 3.4 16.6 7.2 14.4 12 14.4 C 16.8 14.4 20.6 16.6 20.6 20.9 Z'),
        ],
      ),
    ],
  );

  static const DesenhoDoIcone redeSelecionado = DesenhoDoIcone(
    arquivo: 'rede-selecionado.svg',
    rotuloDaArte: 'Rede, selecionado',
    lado: 24.0,
    espessura: 2.0,
    grupos: <GrupoDoIcone>[
      GrupoDoIcone(
        preenchido: true,
        formas: <FormaDoIcone>[
          FormaDoIcone.circulo(cx: 7.5, cy: 7.8, r: 2.5),
          FormaDoIcone.circulo(cx: 16.5, cy: 7.8, r: 2.5),
          FormaDoIcone.curva('M 3.4 20.9 C 3.4 16.6 7.2 14.4 12 14.4 C 16.8 14.4 20.6 16.6 20.6 20.9 Z'),
        ],
      ),
    ],
  );

  static const DesenhoDoIcone mural = DesenhoDoIcone(
    arquivo: 'mural.svg',
    rotuloDaArte: 'Mural',
    lado: 24.0,
    espessura: 2.0,
    grupos: <GrupoDoIcone>[
      GrupoDoIcone(
        preenchido: false,
        formas: <FormaDoIcone>[
          FormaDoIcone.curva('M 3.4 9.2 C 3.4 7.6 4.6 7 5.6 7.6 L 7.4 9 C 8 8.6 8.8 8.4 9.6 8.4 L 14.8 8.4 L 14.8 5 C 14.8 3.6 16 2.8 17.2 3.2 L 20.2 4.2 C 21.1 4.5 21.1 5.6 20.2 5.9 L 17.2 6.6 L 20.4 9 C 21.3 9.6 20.8 10.9 19.8 10.9 L 18.4 10.9 L 18.4 11.2 C 18.4 13 16.8 14.4 14.8 14.4 L 14.2 14.4 L 14.2 19 C 14.2 19.8 13.4 20.4 12.6 20.4 C 11.8 20.4 11 19.8 11 19 L 11 14.4 L 8 14.4 L 8 19 C 8 19.8 7.2 20.4 6.4 20.4 C 5.6 20.4 4.8 19.8 4.8 19 L 4.8 12.6 C 3.9 11.6 3.4 10.4 3.4 9.2 Z'),
        ],
      ),
    ],
  );

  static const DesenhoDoIcone muralSelecionado = DesenhoDoIcone(
    arquivo: 'mural-selecionado.svg',
    rotuloDaArte: 'Mural, selecionado',
    lado: 24.0,
    espessura: 2.0,
    grupos: <GrupoDoIcone>[
      GrupoDoIcone(
        preenchido: true,
        formas: <FormaDoIcone>[
          FormaDoIcone.curva('M 3.4 9.2 C 3.4 7.6 4.6 7 5.6 7.6 L 7.4 9 C 8 8.6 8.8 8.4 9.6 8.4 L 14.8 8.4 L 14.8 5 C 14.8 3.6 16 2.8 17.2 3.2 L 20.2 4.2 C 21.1 4.5 21.1 5.6 20.2 5.9 L 17.2 6.6 L 20.4 9 C 21.3 9.6 20.8 10.9 19.8 10.9 L 18.4 10.9 L 18.4 11.2 C 18.4 13 16.8 14.4 14.8 14.4 L 14.2 14.4 L 14.2 19 C 14.2 19.8 13.4 20.4 12.6 20.4 C 11.8 20.4 11 19.8 11 19 L 11 14.4 L 8 14.4 L 8 19 C 8 19.8 7.2 20.4 6.4 20.4 C 5.6 20.4 4.8 19.8 4.8 19 L 4.8 12.6 C 3.9 11.6 3.4 10.4 3.4 9.2 Z'),
        ],
      ),
    ],
  );

  static const DesenhoDoIcone loja = DesenhoDoIcone(
    arquivo: 'loja.svg',
    rotuloDaArte: 'Loja',
    lado: 24.0,
    espessura: 2.0,
    grupos: <GrupoDoIcone>[
      GrupoDoIcone(
        preenchido: false,
        formas: <FormaDoIcone>[
          FormaDoIcone.curva('M 5.6 8.6 L 18.4 8.6 L 19.3 19.4 C 19.4 20.8 18.5 21.2 17.5 21.2 L 6.5 21.2 C 5.5 21.2 4.6 20.8 4.7 19.4 Z'),
          FormaDoIcone.curva('M 8.9 8.6 L 8.9 7 C 8.9 4.9 10.3 3.7 12 3.7 C 13.7 3.7 15.1 4.9 15.1 7 L 15.1 8.6'),
        ],
      ),
    ],
  );

  static const DesenhoDoIcone lojaSelecionado = DesenhoDoIcone(
    arquivo: 'loja-selecionado.svg',
    rotuloDaArte: 'Loja, selecionado',
    lado: 24.0,
    espessura: 2.0,
    grupos: <GrupoDoIcone>[
      GrupoDoIcone(
        preenchido: true,
        formas: <FormaDoIcone>[
          FormaDoIcone.curva('M 5.6 8.6 L 18.4 8.6 L 19.3 19.4 C 19.4 20.8 18.5 21.2 17.5 21.2 L 6.5 21.2 C 5.5 21.2 4.6 20.8 4.7 19.4 Z'),
        ],
      ),
      GrupoDoIcone(
        preenchido: false,
        formas: <FormaDoIcone>[
          FormaDoIcone.curva('M 8.9 8.6 L 8.9 7 C 8.9 4.9 10.3 3.7 12 3.7 C 13.7 3.7 15.1 4.9 15.1 7 L 15.1 8.6'),
        ],
      ),
    ],
  );

  static const DesenhoDoIcone auau = DesenhoDoIcone(
    arquivo: 'auau.svg',
    rotuloDaArte: 'AuAu',
    lado: 24.0,
    espessura: 2.0,
    grupos: <GrupoDoIcone>[
      GrupoDoIcone(
        preenchido: false,
        formas: <FormaDoIcone>[
          FormaDoIcone.curva('M 6.4 4.6 L 17.6 4.6 C 19.5 4.6 21 6.1 21 8 L 21 13.2 C 21 15.1 19.5 16.6 17.6 16.6 L 10.9 16.6 L 7 20.4 C 6.4 21 5.5 20.6 5.6 19.8 L 5.9 16.6 C 4.3 16.3 3 14.9 3 13.2 L 3 8 C 3 6.1 4.5 4.6 6.4 4.6 Z'),
          FormaDoIcone.curva('M 7.4 12.6 L 14.6 12.6'),
        ],
      ),
    ],
  );

  static const DesenhoDoIcone auauSelecionado = DesenhoDoIcone(
    arquivo: 'auau-selecionado.svg',
    rotuloDaArte: 'AuAu, selecionado',
    lado: 24.0,
    espessura: 2.0,
    grupos: <GrupoDoIcone>[
      GrupoDoIcone(
        preenchido: true,
        formas: <FormaDoIcone>[
          FormaDoIcone.curva('M 6.4 4.6 L 17.6 4.6 C 19.5 4.6 21 6.1 21 8 L 21 13.2 C 21 15.1 19.5 16.6 17.6 16.6 L 10.9 16.6 L 7 20.4 C 6.4 21 5.5 20.6 5.6 19.8 L 5.9 16.6 C 4.3 16.3 3 14.9 3 13.2 L 3 8 C 3 6.1 4.5 4.6 6.4 4.6 Z'),
        ],
      ),
    ],
  );

  /// Os dez, por nome de arquivo.
  ///
  /// O portão itera ESTE mapa em vez de repetir os dez nomes: portão
  /// que guarda uma cópia da lista fica verde no dia em que a lista muda.
  static const Map<String, DesenhoDoIcone> porArquivo =
      <String, DesenhoDoIcone>{
    'pets.svg': pets,
    'pets-selecionado.svg': petsSelecionado,
    'rede.svg': rede,
    'rede-selecionado.svg': redeSelecionado,
    'mural.svg': mural,
    'mural-selecionado.svg': muralSelecionado,
    'loja.svg': loja,
    'loja-selecionado.svg': lojaSelecionado,
    'auau.svg': auau,
    'auau-selecionado.svg': auauSelecionado,
  };
}
