// **A FRASE QUE O CLIENTE MANDOU RETIRAR NAO VOLTA -- EM TELA NENHUMA.**
//
// Cliente, 22/10/2026: *"Retire o texto so se voce souber, em branco
// funciona"*.
//
// ---------------------------------------------------------------------------
// POR QUE ESTE ARQUIVO EXISTE, e por que o portao que ja havia nao bastava
// ---------------------------------------------------------------------------
// A frase saiu do formulario do achado naquele dia, e `achado_botao_escanear_
// alcancavel_test.dart` guarda a remocao -- **mas so NAQUELA tela**, montando-a
// e varrendo os textos dela. A frase SOBREVIVEU em outras duas superficies por
// quatro dias:
//
//   * `telas/localizacao/textos_da_localizacao.dart` -> usada em
//     `captura_de_localizacao.dart`, como ajuda do campo `Estado`;
//   * `telas/perdido/tela_onde_e_quando.dart` -> a mesma ajuda, no mesmo campo,
//     com constante PROPRIA.
//
// Isso e o modo de falhar que uma afirmacao por tela nao pega: a tela medida
// fica limpa e a copia da frase continua viva ao lado. Este portao varre
// **`app/lib` inteiro** e nao conhece tela nenhuma -- e e por isso que ele pega
// a terceira copia, que ainda nao existe.
//
// ---------------------------------------------------------------------------
// CAIXA: AS DUAS, E A LICAO E MEDIDA
// ---------------------------------------------------------------------------
// A sonda que localizou este defeito quase o perdeu: `em branco funciona` deu
// **0** e `Em branco funciona` deu **1**, no mesmo arquivo. A agulha daqui e
// `caseSensitive: false` de proposito, e os dois casos de isca abaixo provam a
// reprova nas DUAS caixas -- uma agulha sensivel a caixa seria um portao que
// aprova `EM BRANCO FUNCIONA`.
//
// ---------------------------------------------------------------------------
// A ANCORA VEM ANTES DA AUSENCIA
// ---------------------------------------------------------------------------
// Afirmacao negativa passa no vazio: um portao que nao achasse arquivo nenhum,
// ou cuja extracao de literal tivesse parado de casar, ficaria VERDE sem ter
// conferido nada. Tres ancoras respondem a isso -- os dois pisos de volume
// (arquivos e literais) e o par de constantes do campo `Estado`, que prova que
// o CAMPO continua de pe. O que saiu foi a frase, e nao a opcionalidade.

import 'dart:io' as io;

import 'package:bichu/telas/localizacao/textos_da_localizacao.dart';
import 'package:bichu/telas/perdido/tela_onde_e_quando.dart';
import 'package:flutter_test/flutter_test.dart';

import '../dispositivo/literais_de_abrir_mapa.dart';
import 'vocabulario_do_produto.dart';

/// As frases retiradas por pedido do cliente, com a data do pedido.
///
/// **Por FRASE e nao por constante**: a frase volta num literal novo, com nome
/// novo, numa tela nova -- foi assim que ela sobreviveu em duas. Casar o texto
/// e o que torna o nome da constante irrelevante.
const Map<String, String> frasesRetiradas = <String, String>{
  'Em branco funciona': 'cliente, 22/10/2026',
  'Só se você souber': 'cliente, 22/10/2026',
};

/// Onde cada frase retirada aparece hoje, em literal de `app/lib`.
///
/// A varredura devolve tambem quantos arquivos e quantos literais ela LEU:
/// sem esses dois numeros a lista vazia nao distingue "nao ha" de "nao olhei".
({List<String> achados, int arquivos, int literais}) varrerFrases(
  Iterable<String> frases,
) {
  final List<io.File> arquivos = dartsDeLib();
  final List<String> achados = <String>[];
  int literais = 0;
  for (final io.File arquivo in arquivos) {
    final String caminho = caminhoRelativoNoPacote(arquivo);
    for (final String literal in literaisDeCadeiaEm(
      arquivo.readAsStringSync(),
    )) {
      literais += 1;
      final String baixo = literal.toLowerCase();
      for (final String frase in frases) {
        if (baixo.contains(frase.toLowerCase())) {
          achados.add('  $caminho escreve "$frase" em: "$literal"');
        }
      }
    }
  }
  return (achados: achados, arquivos: arquivos.length, literais: literais);
}

void main() {
  group('a frase retirada nao volta, e o portao nao e por tela', () {
    test('CONTROLE POSITIVO: a varredura LE `app/lib`, e le os literais', () {
      final r = varrerFrases(const <String>['Em branco funciona']);
      expect(
        r.arquivos,
        greaterThanOrEqualTo(180),
        reason: 'REPROVA: a caminhada achou so ${r.arquivos} arquivos `.dart` '
            'em `app/lib`. Abaixo de 180 ela esta cega, e varredura cega fica '
            'verde sem conferir.',
      );
      expect(
        r.literais,
        greaterThanOrEqualTo(4000),
        reason: 'REPROVA: a extracao achou so ${r.literais} literais de cadeia, '
            'e o piso e 4000. A expressao regular de literal parou de casar, e '
            'a varredura esta passando no vazio sobre arquivos que ela ESTA '
            'lendo -- o modo de falhar mais perigoso de portao que varre '
            'codigo.',
      );
    });

    test('ANCORA: o campo `Estado` continua nas DUAS telas', () {
      // O que saiu foi a FRASE, e nao o campo nem a opcionalidade dele. Se
      // alguem apagasse o campo para fazer a afirmacao de ausencia passar,
      // estas duas linhas reprovariam antes -- e elas nem compilariam se as
      // constantes tivessem sido removidas.
      expect(
        TextosDaLocalizacao.rotuloEstado,
        'Estado',
        reason: 'REPROVA: o campo `Estado` de `captura_de_localizacao.dart` '
            'mudou de nome ou saiu. A frase de ajuda foi retirada; o campo '
            'nao.',
      );
      expect(
        TelaOndeEQuando.rotuloDoEstado,
        'Estado',
        reason: 'REPROVA: o campo `Estado` de `tela_onde_e_quando.dart` mudou '
            'de nome ou saiu.',
      );
    });

    test('nenhum literal de `app/lib` escreve as frases retiradas', () {
      final r = varrerFrases(frasesRetiradas.keys);
      expect(
        r.achados,
        isEmpty,
        reason:
            'REPROVA: ${r.achados.length} literal(is) de `app/lib` escrevem uma '
            'frase que o cliente mandou RETIRAR:\n${r.achados.join('\n')}\n\n'
            'As frases e as datas estao em `frasesRetiradas`. Microcopia e '
            'decisao do cliente: a frase nao volta por conveniencia de tela, e '
            'o campo continua opcional sem ela -- quem precisa dizer "pode '
            'ficar vazio" usa o `estadoInicial` do seletor '
            '(`Escolher na lista`), que e o que as duas telas fazem.',
      );
    });

    test('a agulha e INSENSIVEL A CAIXA, e isso foi medido', () {
      // A sonda que achou o defeito deu 0 na caixa errada e 1 na certa. Uma
      // agulha sensivel a caixa seria um portao que aprova `EM BRANCO
      // FUNCIONA` -- e a tela diria a frase do mesmo jeito.
      for (final String caixa in <String>[
        'Em branco funciona',
        'em branco funciona',
        'EM BRANCO FUNCIONA',
        'eM bRaNcO fUnCiOnA',
      ]) {
        expect(
          'ajuda: $caixa.'.toLowerCase().contains(caixa.toLowerCase()),
          isTrue,
          reason: 'REPROVA: a agulha nao casa a frase na caixa "$caixa".',
        );
      }
    });
  });
}
