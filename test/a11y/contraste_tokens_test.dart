// Contraste recalculado sobre o JSON: os 70 pares do paragrafo 7, medidos
// direto de design/tokens.json e nao de uma copia.
//
// Eram 58 na paleta ambar. Passaram a 70 com a identidade Framboesa: quatro
// papeis novos (community-fill, on-community-fill, accent-fill,
// on-accent-fill), a framboesa medida como tinta nas tres superficies claras e
// nas tres escuras, e o anel de foco medido sobre os TRES preenchimentos de
// marca em vez de um so.
//
// E o item 3 da trava B (paragrafo 18.2.2). A lista de pares vive em
// design/contrast-pairs.json, nao no codigo daqui, para que mudar um par seja
// mudar um dado e nao editar um verificador.
//
// Duas regras, e a segunda e a que pega o caso real:
//   1. par com veredito `passa` precisa ficar acima do piso;
//   2. a razao calculada precisa bater com a publicada no paragrafo 7. Um
//      token alterado sem a tabela ser regerada continua passando no piso e
//      nenhuma ferramenta de contraste reclamaria; e por essa fresta que o
//      documento e o produto se afastam sem alarme.

import 'dart:convert';
import 'dart:io';

import 'package:flutter_test/flutter_test.dart';

import 'tokens.dart';
import 'verificador.dart';

void main() {
  late TokensBichu tokens;
  late Map<String, dynamic> pares;

  setUpAll(() {
    tokens = TokensBichu.doDisco();
    final arquivo = File('${diretorioDesign().path}/contrast-pairs.json');
    if (!arquivo.existsSync()) {
      throw StateError(
        'REPROVA: ${arquivo.path} nao existe. Sem a lista de pares o portao de '
        'contraste fica verde sem olhar para nada, que e a confianca falsa que '
        'ele existe para impedir.',
      );
    }
    pares = jsonDecode(arquivo.readAsStringSync()) as Map<String, dynamic>;
  });

  test('a lista tem os 70 pares que o paragrafo 7 declara', () {
    expect(
      (pares['pares'] as List).length,
      70,
      reason:
          'o paragrafo 7 mede 70 pares. Se o numero mudou, a tabela do '
          'documento e este arquivo sairam de sincronia, e o portao passa a '
          'cobrir menos do que anuncia.',
    );
  });

  test('todos os pares fecham contra tokens.json', () {
    final resultados = verificarPares(tokens, pares);
    final reprovados = resultados.where((r) => !r.aprovado).toList();

    expect(
      reprovados,
      isEmpty,
      reason:
          'pares fora de conformidade:\n'
          '${reprovados.map((r) => '  - $r').join('\n')}',
    );

    // A reprovacao nomeada de sempre: o anel de foco sobre o preenchimento de
    // acao no escuro, isento por nao-adjacencia. Se ela deixar de estar
    // marcada como isenta, ou o anel perdeu o afastamento de 2px ou alguem
    // apagou a justificativa. O valor caiu de 1.18 (anel ambar sobre ambar)
    // para 1.15 (anel framboesa-claro sobre manteiga) com a identidade nova.
    final anel = resultados.firstWhere(
      (r) => r.id == 'escuro/anel-sobre-action-fill',
    );
    expect(anel.veredito, 'isento');
    expect(anel.calculado, closeTo(1.15, 0.005));

    // A isencao por nao-adjacencia deixou de ser UMA e passou a ser TRES, e o
    // numero fica exato aqui de proposito. A identidade nova tem tres
    // preenchimentos de marca (Manteiga, Verde suave, Goiaba suave) com o
    // mesmo valor nos dois temas, enquanto a tinta da marca clareia no escuro:
    // o anel claro sobre preenchimento claro da 1.15, 1.24 e 1.05. Um limite
    // "pelo menos uma" deixaria uma quarta isencao entrar sem diff visivel.
    final naoAdjacentes = (pares['pares'] as List)
        .cast<Map<String, dynamic>>()
        .where(
          (p) =>
              p['veredito'] == 'isento' &&
              (p['isencao'] as Map<String, dynamic>?)?['motivo']
                      ?.toString()
                      .startsWith('NAO-ADJACENCIA') ==
                  true,
        )
        .map((p) => p['id'])
        .toList();
    expect(
      naoAdjacentes,
      unorderedEquals(<String>[
        'escuro/anel-sobre-action-fill',
        'escuro/anel-sobre-community-fill',
        'escuro/anel-sobre-accent-fill',
      ]),
      reason:
          'a lista de isencoes por nao-adjacencia mudou. Ou o anel de foco '
          'perdeu o afastamento de 2px, ou um preenchimento de marca novo '
          'entrou sem ser medido.',
    );
  });

  test('o piso critico de 7.0 cobre as superficies criticas', () {
    final lista = (pares['pares'] as List).cast<Map<String, dynamic>>();
    final criticos = lista.where((p) => (p['piso'] as num) >= 7.0);
    // 19 no claro e 19 no escuro. O numero e exato de proposito: um limite
    // "pelo menos N" deixa passar a troca silenciosa de um piso de 7.0 por 4.5
    // desde que outro par entre no lugar, e e assim que um piso AAA some par a
    // par sem nenhuma linha de diff chamar atencao.
    expect(
      criticos.length,
      38,
      reason:
          'o numero de pares cobrados em 7:1 mudou. Ou uma superficie '
          'critica saiu da lista, ou um piso foi afrouxado (paragrafo 6.5).',
    );
  });

  test('preenchimento de marca nao aparece como FRENTE em par nenhum', () {
    // Trava A vista do outro lado: se alguem acrescentar um par com um dos
    // preenchimentos de marca na FRENTE, e porque passou a existir texto
    // Manteiga, Verde suave ou Goiaba suave no sistema, e o documento diz que
    // isso e estrutural, nao um valor a ajustar.
    //
    // A lista NAO esta escrita aqui: sai de $extensions.bichu.nunca-texto em
    // design/tokens.json, que e o mesmo contrato que o gerador Dart precisa
    // cobrir com nome feio. Duas copias da mesma lista divergem; uma nao.
    final declarados =
        (tokens.raiz[r'$extensions']
                as Map<String, dynamic>)['bichu.nunca-texto']
            as Map<String, dynamic>;
    final papeis = declarados.keys.where((k) => !k.startsWith(r'$')).toSet();

    expect(
      papeis,
      unorderedEquals(<String>[
        'action-fill',
        'action-fill-pressed',
        'community-fill',
        'accent-fill',
      ]),
      reason:
          'a declaracao de papeis que nunca podem ser texto mudou em '
          'design/tokens.json. Ela e o contrato do nome feio no Dart '
          '(paragrafo 18.2.1): mexer nela sem mexer no gerador deixa uma cor '
          'de 1.6:1 disponivel com nome bonito.',
    );

    // Toda cor declarada precisa mesmo estar abaixo de 3:1 contra a superficie
    // CLARA, que e onde a medicao sustenta a proibicao (1.43 a 2.20:1). Papel
    // que entra nesta lista sendo legivel e ruido, e ruido em lista de
    // proibicao e como uma proibicao inteira deixa de ser levada a serio.
    //
    // No tema escuro estas mesmas cores sao legiveis sobre bark.900 (7.8 a
    // 12:1) e a proibicao continua valendo por DOUTRINA, nao por medicao:
    // preenchimento que vira texto so no escuro e um sistema com duas regras,
    // e a cor e a mesma da marca nos dois temas. Cobrar o limite de 3:1
    // tambem la faria este teste reprovar por um motivo falso. Quem cobre o
    // escuro e a ultima verificacao deste teste, que varre os dois temas.
    for (final papel in papeis) {
      final r = razaoWcag(
        tokens.cor('cor.claro.$papel'),
        tokens.cor('cor.claro.surface'),
      );
      expect(
        r,
        lessThan(3.0),
        reason:
            '"$papel" esta declarado como nunca-texto e mede '
            '${r.toStringAsFixed(2)}:1 sobre a superficie clara. Ou a cor '
            'mudou, ou o papel nao deveria estar na lista.',
      );
    }

    // Comparar o ultimo segmento do caminho, e nao procurar a substring:
    // `on-community-fill` CONTEM `community-fill`, e a versao por substring
    // acusaria justamente o par correto (tinta escura sobre o verde) como se
    // fosse o erro. Achado de busca aponta um lugar, nao um defeito.
    final lista = (pares['pares'] as List).cast<Map<String, dynamic>>();
    final comPreenchimentoNaFrente = lista
        .where((p) {
          final ref = (p['frente'] as String).replaceAll(RegExp(r'[{}]'), '');
          return papeis.contains(ref.split('.').last);
        })
        .map((p) => p['id'])
        .toList();
    expect(
      comPreenchimentoNaFrente,
      isEmpty,
      reason:
          'preenchimento de marca aparece como cor de FRENTE em: '
          '$comPreenchimentoNaFrente. Manteiga, Verde suave e Goiaba suave '
          'sao so preenchimento (paragrafo 6.3). Par de texto assim nao e um '
          'valor a ajustar: e o erro que a trava A existe para impedir.',
    );
  });
}
