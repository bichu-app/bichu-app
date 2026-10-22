// **OS CASOS DO PORTAO DE VOCABULARIO.**
//
// A varredura mora em `test/widgets/vocabulario_do_produto.dart`, ao lado da
// lista de palavras e da lista de excecoes. Aqui ficam so os casos, e eles
// apontam para TRES lados:
//
//   1. a varredura **passa** no estado correto -- com DOIS controles positivos
//      provando que ela leu arquivo e leu literal, porque "nenhuma ocorrencia"
//      e indistinguivel de "nao varri";
//   2. a varredura **reprova** quando alguem planta `bicho`, `cao` ou `pessoa`
//      num texto de usuario -- uma isca por palavra;
//   3. a varredura **nao** reprova nas quatro familias que PARECEM as palavras
//      trocadas e nao sao (`Bichu`, `bichano`, `balcao`/`Caominhada`,
//      `pessoal`), e a contagem de `Bichu` fica travada num numero.
//
// O terceiro lado e o que protege a MARCA. Uma substituicao de `bich` -> `pet`
// feita por substring transformaria `Bichu` em `Petu` no nome do app, nos
// textos juridicos, no dominio `bichu.app` e no identificador `app.bichu`. O
// caso `a contagem de Bichu nao mudou` existe para reprovar isso em vez de
// deixar passar.

import 'dart:io' as io;

import 'package:flutter_test/flutter_test.dart';

import '../dispositivo/literais_de_abrir_mapa.dart';
import 'vocabulario_do_produto.dart';

/// Quantas vezes `bichu` aparece em `app/lib`, em qualquer caixa.
///
/// Conta sobre o texto CRU, com comentario e tudo: a marca aparece em prosa,
/// em nome de classe e em literal, e a defesa precisa cobrir as tres. Apagar a
/// marca de um comentario tambem e apagar a marca.
int _ocorrenciasDeBichuAgora() {
  final RegExp marca = RegExp('bichu', caseSensitive: false);
  int total = 0;
  for (final io.File arquivo in dartsDeLib()) {
    total += marca.allMatches(arquivo.readAsStringSync()).length;
  }
  return total;
}

void main() {
  group('o portao de vocabulario do produto', () {
    test(
      'nenhum texto de usuario de `app/lib` escreve bicho, cao ou pessoa',
      () {
        conferirVocabularioDoProduto();
      },
    );

    test(
      'CONTROLE POSITIVO: a varredura LE os literais de `app/lib`',
      () {
        // Uma varredura que achasse zero literal passaria no vazio, e o caso
        // acima ficaria verde por nao ter conferido nada. Este caso mede o que
        // ela de fato leu, e procura uma palavra que SE SABE estar la.
        int literais = 0;
        int comCachorro = 0;
        int comUsuario = 0;
        for (final io.File arquivo in dartsDeLib()) {
          for (final String texto in literaisDeCadeiaEm(
            arquivo.readAsStringSync(),
          )) {
            literais++;
            if (texto.contains('cachorro')) comCachorro++;
            if (texto.contains('usuário')) comUsuario++;
          }
        }

        expect(
          literais,
          greaterThan(3000),
          reason:
              'REPROVA: a extracao achou so $literais literais em `app/lib`. '
              'A expressao regular de literal parou de casar, e a varredura '
              'esta cega sobre arquivos que ELA ESTA LENDO.',
        );
        expect(
          comCachorro,
          greaterThanOrEqualTo(5),
          reason:
              'REPROVA: a varredura nao achou os literais com "cachorro" que '
              'a troca de 22/10/2026 escreveu em `app/lib` (achou '
              '$comCachorro). Se ela nao ve o texto novo, tambem nao veria o '
              'texto velho, e o caso de cima estaria verde por cegueira.',
        );
        expect(
          comUsuario,
          greaterThanOrEqualTo(5),
          reason:
              'REPROVA: a varredura nao achou os literais com "usuário" '
              'que a troca de 22/10/2026 escreveu em `app/lib` (achou '
              '$comUsuario). Mesma razao do controle de "cachorro", e com o '
              'ACENTO de proposito: o `grep` desta maquina falha calado com '
              'acento, e uma agulha acentuada que nunca casa deixa o portao '
              'verde sem conferir.',
        );
      },
    );

    test('ISCA: `bicho` plantado num texto de usuario REPROVA', () {
      const String amostra =
          "const String rotulo = 'Diga o nome do bicho';";
      expect(
        literaisDeCadeiaEm(amostra).expand(palavrasTrocadasEm).toList(),
        contains('bicho'),
        reason:
            'REPROVA: a varredura NAO viu `bicho` plantado num literal. A '
            'troca de 22/10/2026 volta na primeira edicao sem alguem cobrando.',
      );
    });

    test('ISCA: `cao` plantado num texto de usuario REPROVA', () {
      const String amostra =
          "const String rotulo = 'Porte do cão';";
      expect(
        literaisDeCadeiaEm(amostra).expand(palavrasTrocadasEm).toList(),
        contains('cão'),
        reason:
            'REPROVA: a varredura NAO viu `cão` plantado num literal -- e '
            'a palavra tem ACENTO, que e exatamente onde a busca desta '
            'maquina falha calada.',
      );
    });

    test('ISCA: `pessoa` plantada num texto de usuario REPROVA', () {
      const String amostra =
          "const String rotulo = 'Convide uma pessoa';";
      expect(
        literaisDeCadeiaEm(amostra).expand(palavrasTrocadasEm).toList(),
        contains('pessoa'),
        reason:
            'REPROVA: a varredura NAO viu `pessoa` plantada num literal.',
      );
    });

    test(
      'ISCA DA ISCA: a prosa e a interpolacao saem, e o literal fica',
      () {
        // Os dois modos de falhar que fariam o portao reprovar o que ele
        // DEVE deixar passar, e os dois estao medidos aqui.
        const String amostra = '''
// Este comentario fala de bicho, de cao e de pessoa de proposito.
/// E este tambem: a pessoa com o bicho no colo.
const String rotulo = 'Pets na rua';
final String linha = '\${widget.pessoa.nomeParaLer}';
''';
        final List<String> literais = literaisDeCadeiaEm(amostra);
        final List<String> achadas =
            literais.expand(palavrasTrocadasEm).toList();

        expect(
          literais.any((String l) => l.contains('Pets na rua')),
          isTrue,
          reason:
              'REPROVA: a extracao perdeu o literal de verdade junto com a '
              'prosa. Um portao que nao ve o texto nao cobra nada.',
        );
        expect(
          achadas,
          isEmpty,
          reason:
              'REPROVA: a varredura acusou $achadas numa amostra onde as tres '
              'palavras aparecem SO em comentario e SO dentro de '
              'interpolacao. Comentario nao e texto de usuario -- e o '
              'cabecalho de varios arquivos de `app/lib` conta a historia da '
              'troca, entao varrer prosa reprovaria justamente quem documenta '
              'a regra. E `\${widget.pessoa.nomeParaLer}` e CODIGO: cobrar ali '
              'seria cobrar renomear campo, que o pedido do cliente PROIBE.',
        );
      },
    );

    test(
      'A MARCA: a contagem de `Bichu` em `app/lib` nao mudou',
      () {
        // **Esta e a defesa contra a armadilha numero um.** `Bichu` e a marca,
        // e uma troca descuidada de `bich` -> `pet` faria `Petu` -- no nome do
        // app, nos textos juridicos, no dominio `bichu.app`, no identificador
        // `app.bichu`, em `BichuEspaco`, `BichuColors` e em nome de arquivo.
        //
        // O numero foi medido ANTES e DEPOIS das tres trocas de 22/10/2026,
        // com o mesmo resultado, e e isso que ele prova: as trocas nao
        // encostaram na marca.
        expect(
          _ocorrenciasDeBichuAgora(),
          ocorrenciasDeBichu,
          reason:
              'REPROVA: `app/lib` tem ${_ocorrenciasDeBichuAgora()} '
              'ocorrencias de `bichu` e o travado e $ocorrenciasDeBichu. '
              '**A MARCA MUDOU DE TAMANHO.** Se foi uma substituicao de '
              'vocabulario, ela pegou `Bichu` por substring e virou `Petu`: '
              'desfaca e troque so a palavra inteira. Se a marca mudou de '
              'proposito (arquivo novo que a cita, tela que saiu), mude o '
              'numero NESTA linha e diga por que.',
        );
      },
    );

    test(
      'AS QUATRO FAMILIAS QUE PARECEM E NAO SAO continuam passando',
      () {
        // Sem fronteira de palavra, cada uma destas seria destruida pela
        // troca. O caso existe para que a fronteira nunca seja afrouxada por
        // engano.
        const Map<String, String> inocentes = <String, String>{
          "'Abra o Bichu e escaneie'": 'a MARCA',
          "'app.bichu'": 'o identificador do pacote',
          "'bichu.app'": 'o dominio',
          "'Um bichano de rua'": 'bichano e GATO, nao bicho',
          "'Atendimento no balcão'":
              'balcao CONTEM cao e nao e cao',
          "'Cãominhada no parque'":
              'nome de evento (cao + caminhada): trocar daria Cachorrominhada',
          "'Seus dados pessoais'": 'pessoal NAO e pessoa',
          "'Informe os dados pessoais'": 'mesma familia, no plural',
        };

        inocentes.forEach((String amostra, String porque) {
          final List<String> achadas =
              literaisDeCadeiaEm(amostra).expand(palavrasTrocadasEm).toList();
          expect(
            achadas,
            isEmpty,
            reason:
                'REPROVA: a varredura acusou $achadas em $amostra, e ali nao '
                'ha nada para trocar -- $porque. A fronteira de palavra '
                '(`\\b`) das agulhas e o que separa as duas coisas, e ela '
                'acabou de ser afrouxada.',
          );
        });
      },
    );
  });
}
