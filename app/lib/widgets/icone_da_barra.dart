// ===========================================================================
// DESLIGADO EM 26/10/2026 -- E ELE FICOU SEM CHAMADOR EM `lib/`
// ===========================================================================
//
// **MEDIDO, e nao suposto: nada em `app/lib/` importa este arquivo hoje.** A
// barra voltou aos glifos do Material (o cliente reprovou o desenho --
// *"tava muito feio o icone do cachorro"*), e `casca_com_abas.dart` deixou de
// importar o pintor. Quem o alcanca e `test/telas/icones_da_barra_test.dart`,
// que o monta e rasteriza para provar que ele emite tinta.
//
// Isto e codigo de producao sem chamador em producao, e e deliberado -- mas
// alguem tem razao em chamar isso de codigo morto. **A troca foi consciente:**
// o caminho SVG -> Dart -> pixel esta medido e provado, e reconstrui-lo no dia
// da arte aprovada custaria mais do que mante-lo coberto. Se a decisao for
// apagar, o que sai e este arquivo MAIS o gerador, os dez SVG, o alvo do
// `make` e o portao -- e nao so este.
//
// **COMO RELIGAR:** `fonteAtivaDaBarra` para `desenhoDoCliente` e os cinco
// destinos de volta para `desenho`/`desenhoSelecionado`, no mesmo commit.
//
// O PINTOR DOS ICONES DA BARRA DE BAIXO.
//
// Ele existe porque os desenhos do cliente existiam e o app nao os lia: a
// barra desenhava `Icons.pets`, `Icons.groups`, `Icons.dynamic_feed`,
// `Icons.shopping_bag` e `Icons.chat` -- cinco glifos do Material Symbols --
// enquanto os dez SVG dele estavam numa pasta que nada no app abria.
//
// ---------------------------------------------------------------------------
// NENHUMA COR MORA NESTE ARQUIVO, e e a regra de token cumprida ao contrario
// ---------------------------------------------------------------------------
//
// A tinta vem do `IconTheme` ambiente, que o `NavigationBar` resolve por
// estado a partir do `iconTheme` de `BichuTheme`: `text-secondary` em repouso,
// `on-primary-container` quando selecionado. Entao este arquivo nao escreve
// cor, nao le `BichuColors` para pintar e nao tem constante de cor nenhuma --
// e o `IconTheme` tambem e o que faz o modo escuro funcionar sem uma linha
// aqui. O unico `fallback` e `textPrimary`, e ele so e alcancado fora de um
// `NavigationBar` (ver `_tinta`).
//
// ---------------------------------------------------------------------------
// POR QUE UM PARSER PROPRIO, E NAO `caminhoDaMarca`
// ---------------------------------------------------------------------------
//
// `widgets/marca.dart` ja tem um leitor de `d`, e reusa-lo foi a primeira
// ideia. Ele NAO serve, e alargar ele seria pior que escrever este:
//
//   * ele aceita `M`, `C` e `Z` e LANCA em qualquer outro comando. **OITO dos
//     dez usam `L`** (contado por leitor de `d`: `mural` 14 cada, `auau` 7 e
//     6, `loja` 5 cada, `pets` 4 cada), porque contorno de 24 dp e feito de
//     retas. Os dois `rede` nao usam `L` -- eles desenham `<circle>`, que
//     `caminhoDaMarca` tambem nao sabe ler;
//   * essa recusa dele e uma PROTECAO da marca, e nao uma limitacao: o portao
//     `vetor_da_marca_test.dart` cobra que os SVG da marca so tenham `M`, `C` e
//     `Z`, e o `FormatException` de `caminhoDaMarca` e o segundo cinto da
//     mesma regra. Acrescentar `L` la deixaria um `L` num SVG de marca PINTAR
//     em vez de estourar, e a protecao morreria para atender um caso que nem e
//     da marca;
//   * ele fixa `PathFillType.evenOdd`, que a marca precisa (ela tem vazados) e
//     estes nao: o padrao do SVG e `nonzero`, e os preenchidos daqui sao
//     contornos fechados simples.
//
// Dois leitores pequenos com regras declaradas, e nao um grande com um
// parametro de modo que alguem passa errado.
import 'package:flutter/material.dart';

import '../theme/bichu_colors.dart';
import '../theme/icones_da_barra.g.dart';

/// O `d` de um icone da barra, em `Path`.
///
/// Aceita `M`, `C`, `L` e `Z` -- os quatro que os dez arquivos usam -- e
/// **lanca** em qualquer outro. Lancar e deliberado: um comando que o leitor
/// ignorasse sumiria com um trecho do desenho e o icone sairia incompleto, o
/// que e exatamente o tipo de defeito que ninguem rastreia. O gerador ja
/// reprova antes, na fonte; isto e o segundo cinto, para o caso de alguem
/// editar o `.g.dart` a mao.
Path caminhoDoIcone(String d) {
  final caminho = Path();
  final simbolos = RegExp(r'[MCLZmclz]|-?\d+(?:\.\d+)?(?:[eE][-+]?\d+)?');
  final fichas = simbolos.allMatches(d).map((m) => m.group(0)!).toList();

  var i = 0;
  double numero(String comando) {
    if (i >= fichas.length) {
      throw FormatException('Faltou número no comando "$comando" do ícone.');
    }
    final f = fichas[i++];
    final v = double.tryParse(f);
    if (v == null) {
      throw FormatException('Esperava número no comando "$comando" e achei "$f".');
    }
    return v;
  }

  while (i < fichas.length) {
    final comando = fichas[i++];
    switch (comando) {
      case 'M':
      case 'm':
        caminho.moveTo(numero(comando), numero(comando));
      case 'L':
      case 'l':
        caminho.lineTo(numero(comando), numero(comando));
      case 'C':
      case 'c':
        caminho.cubicTo(
          numero(comando),
          numero(comando),
          numero(comando),
          numero(comando),
          numero(comando),
          numero(comando),
        );
      case 'Z':
      case 'z':
        caminho.close();
      default:
        throw FormatException(
          'Comando "$comando" não é M, C, L nem Z. O gerador só emite esses '
          'quatro; um `d` com outro comando não saiu dele.',
        );
    }
  }
  return caminho;
}

/// Um icone da barra de baixo, desenhado a partir do SVG do cliente.
///
/// Ele ocupa o lugar que um `Icon` ocupava e se comporta como um: pega tinta e
/// tamanho do `IconTheme` ambiente, e **nao entra na arvore de semantica**.
/// A ausencia de rotulo e deliberada e e a mesma decisao que o `Icon` sem
/// `semanticLabel` carregava: o glifo da aba e decorativo, porque o rotulo ao
/// lado ja diz a mesma coisa, e nomear os dois e anuncio duplo no VoiceOver e
/// no TalkBack (UX 27.7, regra 2). Quem anuncia a aba e o `Semantics` que
/// `BarraDeBaixo` poe em volta do destino.
class IconeDaBarra extends StatelessWidget {
  const IconeDaBarra(this.desenho, {super.key});

  final DesenhoDoIcone desenho;

  /// A tinta, pela ordem que o componente manda.
  ///
  /// `IconTheme` primeiro porque e ele que o `NavigationBar` resolve por
  /// estado. O `fallback` em `textPrimary` NAO e alcancavel dentro de uma aba
  /// -- `BichuTheme` sempre declara a cor --, e existe para o widget continuar
  /// visivel se alguem o usar fora da barra; pintar transparente ali seria um
  /// icone que desaparece sem erro.
  Color _tinta(BuildContext context) =>
      IconTheme.of(context).color ?? BichuColors.of(context).cores.textPrimary;

  @override
  Widget build(BuildContext context) {
    final tema = IconTheme.of(context);
    final lado = tema.size ?? desenho.lado;
    return SizedBox.square(
      dimension: lado,
      child: CustomPaint(
        painter: _PintorDoIcone(
          desenho: desenho,
          tinta: _tinta(context),
          opacidade: tema.opacity ?? 1.0,
        ),
      ),
    );
  }
}

class _PintorDoIcone extends CustomPainter {
  const _PintorDoIcone({
    required this.desenho,
    required this.tinta,
    required this.opacidade,
  });

  final DesenhoDoIcone desenho;
  final Color tinta;
  final double opacidade;

  @override
  void paint(Canvas canvas, Size size) {
    // A escala sai do `viewBox` declarado, e nao de 24 fixo: o `IconTheme`
    // pode pedir outro tamanho (a barra pede 24, e o `textScaler` do sistema
    // nao mexe em icone), e o desenho precisa acompanhar.
    final escala = size.shortestSide / desenho.lado;
    final cor = tinta.withValues(alpha: tinta.a * opacidade);

    canvas.save();
    canvas.scale(escala);

    for (final grupo in desenho.grupos) {
      final caminho = Path();
      for (final forma in grupo.formas) {
        if (forma.ehCurva) {
          caminho.addPath(caminhoDoIcone(forma.d!), Offset.zero);
        } else {
          caminho.addOval(
            Rect.fromCircle(center: Offset(forma.cx!, forma.cy!), radius: forma.r!),
          );
        }
      }

      // PREENCHE **E** CONTORNA quando o grupo e preenchido, e nao so
      // preenche: o SVG declara `fill="currentColor"` E `stroke="currentColor"
      // stroke-width="2"` no mesmo grupo, e e o traco que da ao estado
      // selecionado o mesmo peso visual do de repouso. So preencher deixaria o
      // icone selecionado MENOR que o de contorno -- em 24 dp a diferenca e de
      // 1 dp em cada borda, e ela aparece como a aba acesa "encolhendo".
      if (grupo.preenchido) {
        canvas.drawPath(
          caminho,
          Paint()
            ..color = cor
            ..isAntiAlias = true,
        );
      }
      canvas.drawPath(
        caminho,
        Paint()
          ..color = cor
          ..isAntiAlias = true
          ..style = PaintingStyle.stroke
          ..strokeWidth = desenho.espessura
          ..strokeCap = StrokeCap.round
          ..strokeJoin = StrokeJoin.round,
      );
    }

    canvas.restore();
  }

  @override
  bool shouldRepaint(_PintorDoIcone antigo) =>
      antigo.desenho.arquivo != desenho.arquivo ||
      antigo.tinta != tinta ||
      antigo.opacidade != opacidade;
}
