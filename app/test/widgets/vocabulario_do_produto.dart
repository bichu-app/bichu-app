// **A VARREDURA DO VOCABULARIO DO PRODUTO, numa fonte so.**
//
// As tres palavras que o **texto de usuario** de `app/lib` nao pode mais
// conter, e a varredura que as cobra.
//
// ---------------------------------------------------------------------------
// POR QUE ELA EXISTE
// ---------------------------------------------------------------------------
// Em 22/10/2026 o cliente pediu TRES substituicoes de vocabulario no app:
//
//   - `bicho`/`bichos`   -> `pet`/`pets`;
//   - `cao`/`caes`       -> `cachorro`/`cachorros`;
//   - `pessoa`/`pessoas` -> `usuario`/`usuarios`.
//
// Substituicao de texto sem portao **volta na primeira edicao**. No mesmo dia
// o produto tinha cinco redacoes de um rotulo de selo e tres da mesma frase de
// abrir mapa, as duas por falta de alguem cobrando. Esta e a cobranca das tres
// palavras.
//
// ---------------------------------------------------------------------------
// ELA ESTENDE O MOTOR QUE JA EXISTE -- NAO E UM SEGUNDO
// ---------------------------------------------------------------------------
// [semProsaDeDart], [dartsDeLib] e [caminhoRelativoNoPacote] vem de
// `test/dispositivo/literais_de_abrir_mapa.dart`, que ja varre `app/lib`
// apagando comentario. Escrever uma segunda caminhada daria duas definicoes de
// "o que e superficie", e a segunda envelheceria calada.
//
// ---------------------------------------------------------------------------
// ELA VARRE **LITERAL DE CADEIA**, E NAO CODIGO SOLTO
// ---------------------------------------------------------------------------
// Esta e a diferenca em relacao a varredura de abrir mapa, e ela e obrigatoria
// aqui: as agulhas sao PALAVRAS, nao frases. `\bpessoa\b` casa com
// `widget.pessoa.nomeParaLer` -- o ponto e fronteira de palavra --, e um portao
// que reprovasse ali cobraria renomear campo, que e exatamente o que o pedido
// PROIBE. Entao:
//
//   1. a prosa sai ([semProsaDeDart]);
//   2. linha de `import`/`export`/`part` sai (caminho de arquivo nao e texto);
//   3. so o conteudo dos literais entra;
//   4. **a interpolacao sai de dentro do literal** (`$x` e `${x.y}`): ela e
//      codigo, e `'${widget.pessoa.nomeParaLer}'` nao escreve "pessoa" para
//      ninguem ler.
//
// ---------------------------------------------------------------------------
// AS AGULHAS SAO POR PALAVRA INTEIRA, E ISSO PROTEGE QUATRO FAMILIAS
// ---------------------------------------------------------------------------
// Por substring, a troca destruiria o produto. Medido em 22/10/2026 sobre
// `4a8cf72d`:
//
//   - **`Bichu` e a MARCA** (9590 ocorrencias no repositorio). `bich` -> `pet`
//     faria `Petu`, `petu.app`, `app.petu`, `PetuEspaco`. [ocorrenciasDeBichu]
//     existe so para reprovar se a contagem mudar.
//   - **`bichano`** (2) e GATO, nao "bicho";
//   - **`balcao`** (1) e **`Caominhada`** (3) contem `cao` e nao sao cao: a
//     segunda e o nome de um evento da Rede (cao + caminhada), e trocar daria
//     "Cachorrominhada";
//   - **`pessoal`/`pessoais`** (247) e "pessoal", nao "pessoa": `dados
//     pessoais` viraria `dados usuariois`.
//
// A fronteira de palavra (`\b`) cobre as quatro sem precisar de excecao.

import 'dart:io' as io;

import 'package:flutter_test/flutter_test.dart';

import '../dispositivo/literais_de_abrir_mapa.dart';

/// Quantas vezes `bichu` (em qualquer caixa) aparece em `app/lib`.
///
/// **Este numero e a defesa da marca.** Ele nao mede qualidade de nada: ele
/// existe para que uma substituicao descuidada de `bich` -> `pet` reprove aqui
/// em vez de renomear `Bichu` para `Petu` no app inteiro e passar.
///
/// Medido em 22/10/2026 sobre `4a8cf72d`, antes e depois das tres trocas, com
/// o mesmo resultado -- que e a prova de que as trocas nao tocaram a marca.
///
/// ATUALIZADO NA MESCLA DA ONDA 6 (22/10/2026): 2675 -> 2672. O numero acima
/// foi medido sobre `4a8cf72d` + a troca de vocabulario SOZINHA; a arvore
/// mesclada tem mais sete entradas, e quatro delas mexeram em arquivos de
/// `app/lib` que citam a marca. O saldo de -3 foi medido ARQUIVO POR ARQUIVO,
/// comparando a ponta do vocabulario (aa0be5df) com o commit de mescla, e
/// fecha exatamente:
///   -4  telas/mural/publicar_no_mural.dart      (19 -> 15)
///   -11 telas/perto/lista_do_diretorio.dart     (42 -> 31)
///   +5  telas/perto/pagina_do_local.dart        (132 -> 137)
///   +7  widgets/visualizador_de_imagem.dart     (16 -> 23)
///   +0  sessao/localizacao_da_sessao.dart       (arquivo novo, 0 mencoes)
///
/// NAO E A ARMADILHA QUE ESTE NUMERO VIGIA, e isso foi medido e nao suposto:
/// `petu` nao aparece em `app/lib`, `app/test`, `src`, `admin/src` nem
/// `web/src` (as unicas ocorrencias sao a prosa deste proprio portao, que
/// descreve a armadilha), e as ancoras da marca estao todas de pe --
/// `bichu.app` 12, `app.bichu` 2, `BichuEspaco` 1048, `BichuColors` 231,
/// `Bichu` 1979. O que mudou foi a QUANTIDADE DE LINHAS que citam a marca,
/// por tela que enxugou e tela que cresceu, e nao a marca.
const int ocorrenciasDeBichu = 2672;

/// As tres agulhas, por palavra inteira e sem distincao de caixa.
///
/// Cada uma cobre o singular e o plural numa entrada so. `cao`/`caes` precisa
/// das duas formas escritas porque o plural portugues nao e sufixo do
/// singular.
final List<RegExp> agulhasDoVocabulario = <RegExp>[
  RegExp(r'\bbichos?\b', caseSensitive: false),
  RegExp('\\b(c\u00e3o|c\u00e3es)\\b', caseSensitive: false),
  RegExp(r'\bpessoas?\b', caseSensitive: false),
];

/// Os literais que **podem** manter a palavra, por caminho, com a razao.
///
/// **Nenhuma entrada aqui e "excecao porque deu trabalho".** Cada uma e uma de
/// tres coisas, e a razao esta escrita na linha:
///
///   1. **nao e texto de usuario** (rota, nome de arquivo, semente de apelido,
///      mensagem de `assert`, diagnostico de telemetria);
///   2. **tem dono agora** -- outra frente estava editando o arquivo em
///      22/10/2026, e duas frentes no mesmo arquivo custou horas no dia
///      anterior. Sai na segunda passada;
///   3. **tem redacao propria pedida pelo cliente**, que nao e a troca
///      generica.
///
/// A chave e o caminho relativo ao pacote; o valor, o conteudo exato do
/// literal (ja sem interpolacao) que fica liberado naquele arquivo.
const Map<String, List<String>> excecoesDoVocabulario = <String, List<String>>{
  // ---- 1. NAO E TEXTO DE USUARIO ----

  // Rota do contrato. Trocar o segmento quebra o link publico do perfil.
  'lib/roteamento/rotas.dart': <String>['/pessoa/:', '/pessoa/'],

  // Nome de arquivo de imagem no bundle.
  'lib/telas/conta/tela_entrar.dart': <String>[
    'assets/ilustracoes/tres-pessoas-no-parque.webp',
  ],

  // Semente do apelido sugerido (`pessoa-01`). O apelido tem conjunto de
  // caracteres fechado e **nao aceita acento**: `usuario` passaria, `usuario`
  // com acento nao, e trocar aqui e trocar o apelido que o produto oferece --
  // dado, nao texto.
  'lib/formato/apelido.dart': <String>['pessoa'],

  // Mensagem de `assert`: quem le e quem escreve a tela, nao quem usa o app.
  //
  // **E o PEDACO da cadeia, e nao a frase inteira**: Dart concatena cadeias
  // adjacentes, e a extracao devolve um literal por pedaco. Uma excecao
  // escrita com a frase montada nao casaria com nenhum deles -- foi assim que
  // este portao reprovou na primeira execucao.
  'lib/widgets/acoes_de_criar_flutuantes.dart': <String>[
    'existe para oferecer uma coisa: um toque a mais entre a pessoa e a ',
  ],

  // Diagnostico de telemetria (`_relatar`), lido em investigacao de defeito.
  'lib/intencao/guarda_de_acao.dart': <String>[
    'envelope ileg\u00edvel descartado: a pessoa entra na conta e vai para o In\u00edcio',
    'a pessoa voltou para ',
  ],

  // ---- 2. TEM DONO AGORA: SEGUNDA PASSADA ----

  // Fluxo do achado. A frente que o enxuga em 22/10/2026 esta removendo
  // justamente `O que e o bicho?`, e tambem reescreve as duas linhas de ajuda.
  'lib/telas/achado/textos_do_achado.dart': <String>[
    'O que \u00e9 o bicho?',
    'Olhe se o bicho tem plaquinha ou coleira com c\u00f3digo. Escanear o QR da ',
    'Procure o bicho na lista de pets perdidos, na se\u00e7\u00e3o Pets. Ela mostra ',
  ],

  // Mesma frente. E tambem o caso de SENTIDO: `outro bicho` e a terceira opcao
  // de especie, e o cliente pediu na mesma rodada para manter `cachorro, gato
  // e outro`. `outro pet` dentro de uma frase que ja diz `cachorro, gato` e
  // decisao de microcopia dele, nao troca mecanica.
  'lib/achado/rascunho_do_achado.dart': <String>[
    'Diga se \u00e9 cachorro, gato ou outro bicho.',
  ],

  // Localizacao (sessao e pre-preenchimento): outra frente.
  'lib/telas/localizacao/textos_da_localizacao.dart': <String>[
    'Se quiser, diga o bairro. \u00c9 ele que aparece para as outras pessoas ',
  ],

  // Pagina de publicacao do usuario: outra frente.
  'lib/telas/mural/comentarios_da_publicacao.dart': <String>[
    'Seja a primeira pessoa a comentar nesta publica\u00e7\u00e3o.',
  ],

  // Pagina interna e listagem do profissional: outra frente.
  'lib/telas/perto/pagina_do_local.dart': <String>[
    'O que outras pessoas disseram',
    'Seja a primeira pessoa a contar como foi o atendimento aqui.',
  ],
  'lib/telas/perto/sugerir_profissional.dart': <String>[
    'Diga o nome do lugar ou da pessoa.',
  ],

  // O rotulo da especie. `Cao` -> `Cachorro` e a troca de maior valor das tres
  // -- ela entrega tambem o pedido de `cachorro, gato e outro` -- e esta
  // BLOQUEADA por dono: 15 asserts de `find.text('Cao')` moram em cinco
  // arquivos de teste de frente alheia (`registrar_achado_test.dart`,
  // `registrar_achado_dois_passos_test.dart`, `cep_nos_dois_formularios_test.dart`,
  // `localizacao_do_botao_test.dart`, `perdidos_e_meus_achados_test.dart`).
  // Mudar o rotulo sem mudar os asserts deixa a suite vermelha; mudar os
  // asserts e editar arquivo de outra frente. Sai na segunda passada, junto
  // com `admin/src/loja/dominio.ts` e `web/src/dominio/texto-do-pet.ts`, que
  // carregam o MESMO rotulo -- os tres mudam no mesmo commit ou o produto fica
  // dizendo `Cachorro` no site e `Cao` no app.
  'lib/api/modelos_pet.dart': <String>['C\u00e3o'],

  // ---- 3. REDACAO PROPRIA, PEDIDA PELO CLIENTE ----

  // O cliente pediu, na mesma rodada, `Uma pessoa com esse nome` ->
  // `Um usuario encontrado em sua busca`. A troca generica daria `Um usuario
  // com esse nome`, que **contraria o que ele escreveu**. As DUAS linhas ficam:
  // elas sao os dois ramos de `_fimDaLista` (um resultado / varios), e mudar so
  // a segunda deixaria o par divergente antes de ele decidir a primeira.
  'lib/telas/rede/busca_de_pessoas.dart': <String>[
    'Uma pessoa com esse nome.',
    'Voc\u00ea viu todas as ',
  ],
};

/// Os literais de cadeia de Dart, nas quatro formas de aspas.
///
/// **A ordem importa**: a forma TRIPLA vem primeiro, senao as aspas simples
/// casariam o comeco de uma cadeia tripla como duas cadeias vazias e o resto
/// do arquivo sairia desalinhado. O prefixo `r` de cadeia crua fica fora do
/// casamento de proposito: o que interessa e o conteudo.
final RegExp _literalDeCadeia = RegExp(
  r"'''([\s\S]*?)'''"
  r'|"""([\s\S]*?)"""'
  r"|'((?:\\.|[^'\\\n])*)'"
  r'|"((?:\\.|[^"\\\n])*)"',
);

/// O conteudo dos literais de cadeia de [fonte], ja sem prosa e sem
/// interpolacao.
///
/// Existe separada de [conferirVocabularioDoProduto] porque **a isca da isca
/// precisa da resposta como VALOR**: ela alimenta amostras de proposito e exige
/// que a extracao as veja.
List<String> literaisDeCadeiaEm(String fonte) {
  final String limpo = semProsaDeDart(fonte);
  final List<String> uteis = <String>[];
  for (final String linha in limpo.split('\n')) {
    final String t = linha.trimLeft();
    if (t.startsWith('import ') ||
        t.startsWith('export ') ||
        t.startsWith('part ') ||
        t.startsWith('part of ')) {
      continue;
    }
    uteis.add(linha);
  }
  final String corpo = uteis.join('\n');

  final List<String> achados = <String>[];
  for (final RegExpMatch m in _literalDeCadeia.allMatches(corpo)) {
    final String? bruto =
        m.group(1) ?? m.group(2) ?? m.group(3) ?? m.group(4);
    if (bruto == null) continue;
    achados.add(semInterpolacao(bruto));
  }
  return achados;
}

/// O literal sem as interpolacoes: `${...}` e `$identificador` saem.
///
/// Elas sao CODIGO dentro do texto. `'${widget.pessoa.nomeParaLer}'` nao
/// escreve "pessoa" para ninguem ler, e um portao que reprovasse ali cobraria
/// renomear campo -- que e o que o pedido proibe.
String semInterpolacao(String literal) {
  return literal
      .replaceAll(RegExp(r'\$\{[^}]*\}'), ' ')
      .replaceAll(RegExp(r'\$[A-Za-z_][A-Za-z0-9_]*'), ' ');
}

/// As agulhas que [texto] contem, ou vazio. Valor, para a isca da isca.
List<String> palavrasTrocadasEm(String texto) {
  final List<String> achadas = <String>[];
  for (final RegExp agulha in agulhasDoVocabulario) {
    final RegExpMatch? m = agulha.firstMatch(texto);
    if (m != null) achadas.add(m.group(0)!);
  }
  return achadas;
}

/// Verdadeiro quando [literal] esta liberado em [caminho].
///
/// Casa por **prefixo** do literal liberado, e nao por igualdade: um literal
/// quebrado em varias linhas de Dart (concatenacao implicita) chega aqui como
/// pedaco, e exigir igualdade deixaria a excecao sem efeito.
bool liberadoPorExcecao(String caminho, String literal) {
  final List<String>? liberados = excecoesDoVocabulario[caminho];
  if (liberados == null) return false;
  final String alvo = literal.trim();
  for (final String ok in liberados) {
    final String okt = ok.trim();
    if (okt.isEmpty) continue;
    if (alvo == okt || okt.startsWith(alvo) || alvo.startsWith(okt)) {
      return true;
    }
  }
  return false;
}

/// Reprova se algum literal de `app/lib` escrever `bicho`, `cao` ou `pessoa`.
///
/// [minimoDeArquivos] e [minimoDeLiterais] sao o **controle positivo**, e sao
/// dois de proposito: uma caminhada que achasse zero arquivo passaria no
/// vazio, e uma extracao de literal quebrada (uma expressao regular que
/// parasse de casar) passaria no vazio AINDA ACHANDO os arquivos. O segundo
/// piso e o que pega esse caso, que e o modo de falhar mais perigoso de portao
/// que varre codigo.
void conferirVocabularioDoProduto({
  int minimoDeArquivos = 180,
  int minimoDeLiterais = 4000,
}) {
  final List<io.File> arquivos = dartsDeLib();
  expect(
    arquivos.length,
    greaterThanOrEqualTo(minimoDeArquivos),
    reason:
        'REPROVA: a caminhada achou so ${arquivos.length} arquivos `.dart` em '
        '`app/lib`. Abaixo de $minimoDeArquivos ela esta cega, e varredura '
        'cega fica verde sem conferir.',
  );

  int literaisVistos = 0;
  final List<String> reprovas = <String>[];
  for (final io.File arquivo in arquivos) {
    final String caminho = caminhoRelativoNoPacote(arquivo);
    final List<String> literais = literaisDeCadeiaEm(arquivo.readAsStringSync());
    literaisVistos += literais.length;
    for (final String literal in literais) {
      if (liberadoPorExcecao(caminho, literal)) continue;
      for (final String palavra in palavrasTrocadasEm(literal)) {
        reprovas.add('  $caminho escreve "$palavra" em: "$literal"');
      }
    }
  }

  expect(
    literaisVistos,
    greaterThanOrEqualTo(minimoDeLiterais),
    reason:
        'REPROVA: a extracao achou so $literaisVistos literais de cadeia em '
        '`app/lib`, e o piso e $minimoDeLiterais. A expressao regular de '
        'literal parou de casar, e a varredura esta passando no vazio sobre '
        'arquivos que ela ESTA lendo -- exatamente o modo de falhar que os '
        'dois pisos existem para separar.',
  );

  expect(
    reprovas,
    isEmpty,
    reason:
        'REPROVA: ${reprovas.length} literal(is) de `app/lib` ainda escrevem '
        'uma das tres palavras trocadas em 22/10/2026:\n'
        '${reprovas.join('\n')}\n\n'
        'As trocas sao `bicho`->`pet`, `cao`->`cachorro`, '
        '`pessoa`->`usuario`, e valem **so para texto que o usuario le**. Se o '
        'literal NAO e texto de usuario (rota, nome de arquivo, semente de '
        'apelido, `assert`, diagnostico), ou tem dono, ou tem redacao propria '
        'pedida pelo cliente, ele entra em `excecoesDoVocabulario` **com a '
        'razao escrita na linha** -- e nao e so acrescentado. Microcopia e '
        'decisao do cliente, nao de quem edita a tela.',
  );
}
