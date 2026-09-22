import 'package:flutter/material.dart';

import '../theme/bichu_colors.dart';
import '../theme/bichu_tokens.g.dart';

/// A geometria da moldura (design system 5.1, grupo `moldura` de
/// `design/tokens.json`).
///
/// **Estes tres fatores sao tokens, e nao numeros escolhidos aqui.** Eles
/// estao em `design/tokens.json` e o gerador `tool/gen_tokens.dart` **nao os
/// emite** hoje: ele so atravessa grupos de `$type: dimension`, e `moldura` e
/// `$type: number`. Enquanto o gerador nao cobrir o grupo, a copia vive aqui,
/// num lugar so, e `test/widgets/moldura_test.dart` **le o JSON e reprova se
/// os tres divergirem**. Copia sem portao e como o design system e o codigo se
/// afastam sem ninguem ver; a falta no gerador esta nomeada no relatorio e e
/// da familia da BICHUS-109.
///
/// A forma e `RoundedRectangleBorder` com raios proporcionais a largura, e
/// **nunca** um `CustomClipper`: o paragrafo 5.1 fixa isso porque recorte por
/// caminho perde a borda e o anti-serrilhado em tela de baixa densidade.
abstract final class BichuMoldura {
  /// `moldura.proporcao`: altura dividida pela largura.
  static const double proporcao = 1.1;

  /// `moldura.raio-superior`: fator sobre a largura. O topo e um semicirculo.
  static const double fatorDoRaioSuperior = 0.5;

  /// `moldura.raio-inferior`: fator sobre a largura. A base e larga e estavel.
  static const double fatorDoRaioInferior = 0.3;

  /// `foto/sm` (design system 5.4): 56 x 62, o tamanho do cartao de pet na
  /// lista.
  ///
  /// **Esta largura nao tem token.** O paragrafo 5.4 publica a tabela de
  /// tamanhos de foto e `design/tokens.json` nao tem grupo `foto`; o
  /// `BichuEspaco` tambem nao tem 56, porque 56 nao e espacamento. O numero e
  /// o do documento, e nao uma invencao do widget. Nomeado no relatorio.
  static const double larguraFotoSm = 56;

  /// A altura que [proporcao] impoe a [larguraFotoSm].
  ///
  /// 61,6 dp. A tabela do 5.4 publica 62, que e o mesmo valor arredondado;
  /// quem manda e a proporcao, porque ela e o token.
  static double get alturaFotoSm => larguraFotoSm * proporcao;

  /// `foto/lg` (design system 5.4): 160 x 176, o tamanho que a tabela publica
  /// para **"Perfil do pet"** -- que e a tela de detalhe da BICHUS-60 e da
  /// BICHUS-61.
  ///
  /// Vale aqui a mesma ressalva de [larguraFotoSm]: **esta largura nao tem
  /// token.** A tabela do 5.4 publica os seis tamanhos de foto e
  /// `design/tokens.json` nao tem grupo `foto`. O numero e o do documento, e
  /// nao uma invencao do widget. Nomeado no relatorio.
  static const double larguraFotoLg = 160;

  /// O raio composto da forma, para uma largura qualquer.
  ///
  /// Os raios verticais sao os horizontais divididos por [proporcao]: e o que
  /// faz a curva ser a mesma em qualquer tamanho, que e a razao de a
  /// especificacao dar fatores e nao pixels.
  static BorderRadius raio(double largura) {
    final superiorX = largura * fatorDoRaioSuperior;
    final inferiorX = largura * fatorDoRaioInferior;
    return BorderRadius.only(
      topLeft: Radius.elliptical(superiorX, superiorX / proporcao),
      topRight: Radius.elliptical(superiorX, superiorX / proporcao),
      bottomLeft: Radius.elliptical(inferiorX, inferiorX / proporcao),
      bottomRight: Radius.elliptical(inferiorX, inferiorX / proporcao),
    );
  }
}

/// Os estados da moldura (design system 11.4).
enum EstadoDaMoldura {
  /// Ha conteudo para pintar.
  repouso,

  /// Esqueleto. A foto esta a caminho.
  carregando,

  /// Nao ha conteudo, ou ele falhou. Fundo `primary-container`, simbolo em
  /// `primary` a 40% da largura.
  vazio,
}

/// A moldura do paragrafo 11.4: componente base de foto, icone e selo.
///
/// **Nao e interativa por si.** Quando envolvida por um alvo de toque, foco e
/// pressionado pertencem ao alvo e nao a ela -- e por isso este widget nao tem
/// `onTap`, nao tem `Focus` e nao aparece na arvore de semantica: o cartao que
/// a contem e uma parada de foco unica (criterio 5 da BICHUS-62), e um no
/// semantico aqui dentro seria o controle dentro do controle que o criterio
/// proibe.
class Moldura extends StatelessWidget {
  const Moldura({
    required this.largura,
    super.key,
    this.estado = EstadoDaMoldura.vazio,
    this.filho,
    this.simbolo = Icons.pets_outlined,
  });

  /// A largura em dp. A altura sai de [BichuMoldura.proporcao].
  final double largura;

  final EstadoDaMoldura estado;

  /// O que preenche a moldura em [EstadoDaMoldura.repouso].
  final Widget? filho;

  /// O simbolo do estado vazio.
  ///
  /// O padrao e um icone generico **de proposito**: o paragrafo 5.4 proibe
  /// ilustracao de animal no lugar da foto porque desenho de um animal que nao
  /// e aquele faz o achador duvidar de que e o pet certo. Aqui, porem, nao ha
  /// achador nenhum: esta e a lista do proprio tutor, que sabe quais sao os
  /// pets dele. A regra que vale e a ultima linha do 5.4, que mantem a moldura
  /// vazia com simbolo valida em "estado vazio de lista".
  final IconData simbolo;

  @override
  Widget build(BuildContext context) {
    final cores = BichuColors.of(context).cores;
    final altura = largura * BichuMoldura.proporcao;
    final forma = BichuMoldura.raio(largura);

    final Widget conteudo = switch (estado) {
      EstadoDaMoldura.repouso => filho ?? const SizedBox.shrink(),
      EstadoDaMoldura.carregando => _Esqueleto(cor: cores.surfaceSunken),
      EstadoDaMoldura.vazio => ColoredBox(
          color: cores.primaryContainer,
          child: Center(
            child: Icon(
              simbolo,
              // 40% da largura, paragrafo 11.4. O fator e da especificacao.
              size: largura * 0.4,
              color: cores.primary,
            ),
          ),
        ),
    };

    return ExcludeSemantics(
      child: SizedBox(
        width: largura,
        height: altura,
        child: ClipRRect(
          borderRadius: forma,
          child: conteudo,
        ),
      ),
    );
  }
}

/// O esqueleto com brilho de 1200 ms do paragrafo 5.4.
///
/// **Nunca um spinner dentro da forma**, que e o que aquele paragrafo proibe
/// por nome.
class _Esqueleto extends StatefulWidget {
  const _Esqueleto({required this.cor});

  final Color cor;

  @override
  State<_Esqueleto> createState() => _EsqueletoState();
}

class _EsqueletoState extends State<_Esqueleto>
    with SingleTickerProviderStateMixin {
  late final AnimationController _controlador = AnimationController(
    vsync: this,
    duration: BichuMovimento.skeleton,
  )..repeat(reverse: true);

  @override
  void dispose() {
    _controlador.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    return FadeTransition(
      // O brilho e variacao de opacidade sobre a mesma cor, e nao um gradiente
      // que atravessa a forma: gradiente em forma irregular deixa banda
      // visivel na borda em tela de 60 Hz barata.
      opacity: Tween<double>(begin: 0.45, end: 1).animate(
        CurvedAnimation(parent: _controlador, curve: BichuCurva.standard),
      ),
      child: ColoredBox(color: widget.cor),
    );
  }
}
