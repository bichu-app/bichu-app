// TODO CAMPO DE TELEFONE DO APP TEM `MascaraDeTelefone`.
//
// ===========================================================================
// ISTO E PORTAO, E NAO TESTE -- e a diferenca e o pedido que o fez nascer
// ===========================================================================
//
// O cliente pediu em 26/10/2026: *"voce deve colocar mascara de telefone em
// todos os inputs que necessitam de telefone"* (BICHUS-308). **E a SEGUNDA vez
// que ele pede "em todos"**: em 18/10/2026 foi *"coloque mascara no campo cep
// de todos os formularios"*, e naquela rodada SOBROU CAMPO -- a prosa de
// `lib/telas/perto/sugerir_profissional.dart` registra o remendo com as
// palavras do proprio cliente (*"no formulario de indicacao do profissional, o
// campo cep nao entrou tambem"*).
//
// O que sobrou agora foi o campo de contato publico da indicacao: ele JA
// trocava o teclado para `TextInputType.phone` quando o tipo escolhido era
// `phone` -- **sabia que era telefone e nao mascarava**.
//
// Um caso de widget por tela mediria os QUATRO campos de hoje e aprovaria o
// QUINTO que nascer amanha. O que precisa valer nao e "esta tela mascara": e
// que **nao existe** no aplicativo campo de texto que receba telefone sem
// `MascaraDeTelefone`. Isso se mede lendo `lib/` do disco, e e por isso que
// este arquivo nao abre tela nenhuma.
//
// ===========================================================================
// DESLIGAR PARA VER REPROVAR -- medido em 26/10/2026
// ===========================================================================
//
// Em `lib/telas/perfil/tela_dados_pessoais.dart`, apague a linha
// `formatadores: const <TextInputFormatter>[MascaraDeTelefone()],` do campo de
// telefone.
//   -> reprova `nenhum campo de telefone fica sem mascara`, **nomeando o
//      arquivo e a linha**:
//
//      REPROVA: 1 campo(s) de telefone sem `MascaraDeTelefone`:
//        - lib/telas/perfil/tela_dados_pessoais.dart:824 (sinais:
//          AutofillHints.telephoneNumber, limiteDoTelefone,
//          TextInputType.phone, identificador de telefone)
//
//      E o NOME que importa: um portao que so diz "algum campo esta errado"
//      manda a proxima pessoa procurar em 225 arquivos.
//
// Religue com `git show <sha>:app/lib/telas/perfil/tela_dados_pessoais.dart`.
//
// Troque o `formatadores:` condicional de `sugerir_profissional.dart` por
// `null`.
//   -> reprova o mesmo caso, nomeando `sugerir_profissional.dart`.
//
// ===========================================================================
// OS CONTRAPESOS, e por que sao metade do portao
// ===========================================================================
//
// Varredura de fonte morre CALADA: um `Directory` errado, um construtor
// renomeado ou um sinal com erro de digitacao devolve ZERO campo, e zero campo
// sem mascara e verde. Os quatro grupos abaixo medem a PROPRIA varredura:
//
//   1. ela leu `lib/` de verdade (225 arquivos, nao zero);
//   2. ela achou as montagens de campo de texto (91, nao zero);
//   3. **cada um dos seis sinais de "isto e telefone" casou com pelo menos um
//      campo de verdade.** Sem isto, apagar um `r` de uma expressao regular
//      desliga aquele sinal em silencio -- e e exatamente por um sinal
//      desligado que o quinto campo passaria;
//   4. o conjunto de campos de telefone e EXATAMENTE os quatro congelados
//      aqui. Campo novo reprova pelo nome; campo que desaparecer reprova
//      tambem, porque uma tela apagada e uma decisao, nao um detalhe.
//
// **A mascara NAO e o que vai para a API, e este portao nao mede isso.** Quem
// produz valor de contrato e `telefoneEmE164` (`lib/formato/telefone.dart`), e
// `me_api.dart` diz que a camada de API nao adivinha mascara. Um portao que
// cobrasse o corpo aqui estaria medindo outra coisa.

import 'dart:io';

import 'package:flutter_test/flutter_test.dart';

import '../dispositivo/diretivas_dart.dart';

/// A raiz do codigo, relativa a `app/` (de onde `flutter test` roda).
const String _raiz = 'lib';

/// O que marca uma chamada como MONTAGEM DE CAMPO DE TEXTO: ela passa um
/// controlador por argumento nomeado.
///
/// ## Por que nao uma lista de construtores -- medido, e o portao reprovou
///
/// A primeira redacao deste portao procurava `BichuField(`, `TextField(`,
/// `TextFormField(` e `CupertinoTextField(`. Ela achou **um** dos quatro
/// campos de telefone do app, e os contrapesos a reprovaram: os outros tres
/// (`perfil/tela_dados_pessoais`, `perfil/tela_endereco_de_entrega`,
/// `pet/tela_solicitar_plaquinha`) nao montam `BichuField` direto -- cada tela
/// tem um ajudante PRIVADO `_campo(...)`, que e quem monta. Uma lista de
/// construtores nao enxerga ajudante privado, e o quinto campo nasceria dentro
/// de um `_campo` novo sem o portao piscar.
///
/// `controlador:` (e `controller:`, do Flutter) e o que **toda** montagem de
/// campo editavel tem, com ajudante ou sem. A declaracao do ajudante nao casa,
/// porque parametro nao leva dois-pontos (`TextEditingController controlador,`).
final RegExp _passaControlador =
    RegExp(r'control(?:ador|ler)\s*:');

/// Uma palavra que diz "telefone" num identificador ou num rotulo.
///
/// `contato` NAO esta aqui, e e deliberado: o contato publico da indicacao e
/// telefone, site OU Instagram, e cobrar mascara de um campo de site faria o
/// portao mandar apagar `https://` enquanto se digita.
final RegExp _palavraDeTelefone =
    RegExp(r'telefone|celular|whats_?app|phone|fone', caseSensitive: false);

/// Uma montagem de campo de texto encontrada na fonte.
class _Campo {
  _Campo({
    required this.arquivo,
    required this.linha,
    required this.construtor,
    required this.inicio,
    required this.fim,
    required this.argumentos,
    required this.argumentosComLiterais,
  });

  final String arquivo;
  final int linha;

  /// O nome da chamada que monta o campo: `BichuField`, `TextField` ou o
  /// ajudante privado da tela (`_campo`).
  final String construtor;

  /// Os limites da montagem no fonte, para o contrapeso de ANINHAMENTO.
  final int inicio;
  final int fim;

  /// Os argumentos com comentario E literal mascarados. Serve a quem procura
  /// IDENTIFICADOR: `MascaraDeTelefone` citado dentro de uma string de prosa
  /// nao e mascara ligada.
  final String argumentos;

  /// Os argumentos com o comentario mascarado e o literal PRESERVADO. Serve ao
  /// unico sinal que precisa do texto: `rotulo: 'Telefone'`.
  final String argumentosComLiterais;

  bool get temMascara => argumentos.contains('MascaraDeTelefone');

  /// Os sinais de "este campo recebe telefone", em ordem estavel.
  ///
  /// **Um sinal basta.** Nenhum deles e obrigatorio sozinho: um campo pode
  /// nascer sem `autofill`, sem `limite` e com o rotulo vindo de outro
  /// arquivo. Exigir a conjuncao faria o portao perder o campo que estiver
  /// faltando qualquer um deles -- que e o campo que ele existe para achar.
  Set<String> get sinais {
    final achados = <String>{};
    if (argumentos.contains('AutofillHints.telephoneNumber')) {
      achados.add(_Sinal.autofill);
    }
    if (argumentos.contains('limiteDoTelefone')) {
      achados.add(_Sinal.limite);
    }
    if (argumentos.contains('TextInputType.phone')) {
      achados.add(_Sinal.teclado);
    }
    if (temMascara) {
      achados.add(_Sinal.mascara);
    }
    // `controlador:` / `controller:` apontando para um nome de telefone.
    if (RegExp(
      r'control(?:ador|ler)\s*:\s*[A-Za-z0-9_.!?]*'
      r'(?:telefone|celular|whats_?app|phone|fone)',
      caseSensitive: false,
    ).hasMatch(argumentos)) {
      achados.add(_Sinal.identificador);
    }
    // `rotulo:` com palavra de telefone -- no identificador
    // (`_TextosDosDados.telefone`) ou no literal (`rotulo: 'Telefone'`). E o
    // unico sinal que le o literal, e por isso le o OUTRO recorte.
    final doRotulo = RegExp(
      'rotulo\\s*:\\s*(?:\'[^\']*\'|"[^"]*"|[A-Za-z0-9_.!?]+)',
    ).firstMatch(argumentosComLiterais);
    if (doRotulo != null && _palavraDeTelefone.hasMatch(doRotulo.group(0)!)) {
      achados.add(_Sinal.rotulo);
    }
    return achados;
  }

  bool get ehDeTelefone => sinais.isNotEmpty;

  @override
  String toString() => '$arquivo:$linha';
}

/// Os nomes dos sinais, num lugar so: o contrapeso 3 percorre esta lista, e
/// uma constante nova sem campo que a case reprova sozinha.
abstract final class _Sinal {
  static const String autofill = 'AutofillHints.telephoneNumber';
  static const String limite = 'limiteDoTelefone';
  static const String teclado = 'TextInputType.phone';
  static const String mascara = 'MascaraDeTelefone';
  static const String identificador = 'identificador de telefone';
  static const String rotulo = 'rotulo de telefone';

  static const List<String> todos = <String>[
    autofill,
    limite,
    teclado,
    mascara,
    identificador,
    rotulo,
  ];
}

/// OS QUATRO CAMPOS DE TELEFONE DO APP, congelados.
///
/// Os tres primeiros ja tinham mascara antes de 26/10/2026; o quarto e o que o
/// pedido do cliente acrescentou.
const Set<String> _congelados = <String>{
  'lib/telas/perfil/tela_dados_pessoais.dart',
  'lib/telas/perfil/tela_endereco_de_entrega.dart',
  'lib/telas/pet/tela_solicitar_plaquinha.dart',
  'lib/telas/perto/sugerir_profissional.dart',
};

/// Todos os `.dart` de [_raiz], com o caminho relativo a `app/`.
Map<String, String> _fontes() {
  final raiz = Directory(_raiz);
  // `TestFailure` e nao `expect`: as duas varreduras rodam na montagem do
  // arquivo, ANTES do primeiro `test(...)`, e `expect` fora de um caso estoura
  // com outra mensagem -- que e pior que a mensagem certa.
  if (!raiz.existsSync()) {
    throw TestFailure(
      'REPROVA: o caso roda do diretorio errado. Ele tem de rodar da raiz de '
      '`app/`, que e de onde `flutter test` roda.',
    );
  }
  final fontes = <String, String>{};
  for (final f in raiz.listSync(recursive: true)) {
    if (f is! File || !f.path.endsWith('.dart')) continue;
    fontes[f.path] = f.readAsStringSync();
  }
  return fontes;
}

/// Toda chamada de [fontes] que passa um controlador, isto e: toda montagem de
/// campo de texto, com ajudante privado ou sem.
///
/// Os parenteses sao equilibrados A MAO, e nao casados por expressao regular:
/// os argumentos carregam chamadas aninhadas e listas, e um `\)` preguicoso
/// cortaria a montagem no meio -- o que faria o portao nao achar a mascara que
/// esta la. O equilibrio corre sobre o recorte com LITERAL MASCARADO, porque
/// um `)` dentro de uma string (`ajuda: 'ligue (11) 3061-2200'`) desconta um
/// nivel que nunca foi aberto.
///
/// **`controlador:` e cobrado no NIVEL ZERO da chamada**, e nao em qualquer
/// lugar dos argumentos. Sem isso todo `Column(children: [...])` que CONTEM um
/// campo contaria como campo, e os sinais do campo de dentro seriam lidos como
/// se fossem do `Column` -- o portao passaria a nomear o arquivo certo e o
/// widget errado, e a culpar uma `Column` por telefone sem mascara.
List<_Campo> _camposDeTexto(Map<String, String> fontes) {
  final achados = <_Campo>[];
  fontes.forEach((caminho, bruto) {
    final semLiteral = mascaraSemComentarios(bruto, mascararLiterais: true);
    final comLiteral = mascaraSemComentarios(bruto);
    // As duas mascaras preservam comprimento e quebra de linha (ver
    // `mascaraSemComentarios`), entao um indice vale nas duas e no original.
    // Sem isto os dois recortes falariam de trechos diferentes do arquivo.
    if (semLiteral.length != bruto.length ||
        comLiteral.length != bruto.length) {
      throw TestFailure(
        'REPROVA NO CONTRAPESO: `mascaraSemComentarios` mudou o comprimento '
        'de `$caminho`. Os dois recortes deste portao sao indexados pela '
        'MESMA posicao; se um encurtar, os sinais passam a ler o trecho '
        'errado -- calado.',
      );
    }
    for (final m in RegExp(r'([A-Za-z_$][A-Za-z0-9_$]*)\s*\(')
        .allMatches(semLiteral)) {
      // `if (`, `for (`, `while (`, `switch (`, `return (`, `catch (`: tem a
      // forma de chamada e nao e. Nenhuma delas passa `controlador:` no nivel
      // zero, entao o filtro abaixo ja as descarta -- esta lista so evita o
      // trabalho.
      const palavras = <String>{
        'if', 'for', 'while', 'switch', 'return', 'catch', 'assert', 'do'
      };
      if (palavras.contains(m.group(1))) continue;

      var i = m.end;
      var profundidade = 1;
      // O NIVEL ZERO dos argumentos: o que esta dentro de `(`, `[` ou `{`
      // aninhado vira espaco, preservando a posicao.
      final nivelZero = StringBuffer();
      var aninhado = 0;
      while (i < semLiteral.length && profundidade > 0) {
        final c = semLiteral[i];
        if (c == '(') {
          profundidade++;
          aninhado++;
        } else if (c == '[' || c == '{') {
          aninhado++;
        } else if (c == ')') {
          profundidade--;
          if (profundidade > 0) aninhado--;
        } else if (c == ']' || c == '}') {
          if (aninhado > 0) aninhado--;
        }
        if (profundidade > 0) {
          nivelZero.write(aninhado == 0 || c == '\n' ? c : ' ');
        }
        i++;
      }
      if (profundidade != 0) continue; // montagem truncada no fim do arquivo
      if (!_passaControlador.hasMatch(nivelZero.toString())) continue;

      achados.add(
        _Campo(
          arquivo: caminho,
          linha: '\n'.allMatches(semLiteral.substring(0, m.start)).length + 1,
          construtor: m.group(1)!,
          inicio: m.start,
          fim: i - 1,
          argumentos: semLiteral.substring(m.end, i - 1),
          argumentosComLiterais: comLiteral.substring(m.end, i - 1),
        ),
      );
    }
  });
  achados.sort((a, b) => a.toString().compareTo(b.toString()));
  return achados;
}

void main() {
  final fontes = _fontes();
  final campos = _camposDeTexto(fontes);
  final deTelefone = campos.where((c) => c.ehDeTelefone).toList();

  group('a varredura mede alguma coisa (os contrapesos)', () {
    test('leu `lib/` de verdade, e nao zero arquivo', () {
      expect(
        fontes.length,
        greaterThan(150),
        reason: 'REPROVA NO CONTRAPESO: li ${fontes.length} arquivo(s) de '
            '`$_raiz` (eram 225 em 26/10/2026). O portao ficaria verde por '
            'VAZIO, que e como esta classe de defeito passa despercebida.',
      );
    });

    test('achou as montagens de campo de texto', () {
      expect(
        campos.length,
        greaterThan(30),
        reason: 'REPROVA NO CONTRAPESO: achei ${campos.length} montagem(ns) '
            'de campo de texto (eram 91 em 26/10/2026). Com zero, "nenhum '
            'campo sem mascara" e verdade vazia -- e `controlador:` virando '
            'outro nome e o jeito mais barato de desligar este portao sem '
            'querer.',
      );
    });

    test('CADA sinal de "isto e telefone" casou com um campo de verdade', () {
      final semCasar = <String>[];
      for (final sinal in _Sinal.todos) {
        if (!deTelefone.any((c) => c.sinais.contains(sinal))) {
          semCasar.add(sinal);
        }
      }
      expect(
        semCasar,
        isEmpty,
        reason: 'REPROVA NO CONTRAPESO: ${semCasar.length} sinal(is) nao '
            'casou com campo nenhum: ${semCasar.join(', ')}. Filtro que nao '
            'casa devolve zero de tudo: um sinal desligado por erro de '
            'digitacao deixa de achar o campo que ele era o unico a '
            'reconhecer, e o portao continua verde.',
      );
    });

    test('os campos de telefone sao EXATAMENTE os quatro congelados', () {
      final arquivos = deTelefone.map((c) => c.arquivo).toSet();
      final novos = arquivos.difference(_congelados);
      expect(
        novos,
        isEmpty,
        reason: 'REPROVA: ${novos.length} arquivo(s) com campo de telefone '
            'que este portao nao conhecia:\n'
            '${novos.map((a) => '  - $a').join('\n')}\n'
            'Se o campo e de telefone, ele tem de ter `MascaraDeTelefone` e '
            'o arquivo entra em `_congelados` -- NA MAO, para a proxima '
            'pessoa ler a decisao. Se nao e, o sinal que o pegou esta largo '
            'demais e a correcao e no sinal.',
      );
      final sumidos = _congelados.difference(arquivos);
      expect(
        sumidos,
        isEmpty,
        reason: 'REPROVA: ${sumidos.length} arquivo(s) congelado(s) nao tem '
            'mais campo de telefone:\n'
            '${sumidos.map((a) => '  - $a').join('\n')}\n'
            'Isso pode ser certo (a tela saiu) ou ser o campo tendo perdido '
            'os sinais que o identificam -- que e como ele sairia deste '
            'portao sem sair do app. Confira e tire da lista a mao.',
      );
    });
  });

  group('nenhum campo de telefone fica sem mascara', () {
    test('BICHUS-308: "mascara de telefone em todos os inputs"', () {
      final sem = deTelefone.where((c) => !c.temMascara).toList();
      expect(
        sem,
        isEmpty,
        reason: 'REPROVA: ${sem.length} campo(s) de telefone sem '
            '`MascaraDeTelefone`:\n'
            '${sem.map((c) => '  - $c (${c.construtor} sinais: '
                '${(c.sinais.toList()..sort()).join(', ')})').join('\n')}\n'
            'O cliente pediu "em todos" DUAS vezes (CEP em 18/10, telefone '
            'em 26/10) e na primeira sobrou campo. Ponha '
            '`MascaraDeTelefone()` em `formatadores:` -- e, se o campo for '
            'POLIMORFICO como o contato publico da indicacao, condicional ao '
            'tipo, porque a mascara descarta `https://` e `@`.',
      );
    });

    test('os quatro campos de hoje estao cobertos, um a um', () {
      final porArquivo = <String, List<_Campo>>{};
      for (final c in deTelefone) {
        porArquivo.putIfAbsent(c.arquivo, () => <_Campo>[]).add(c);
      }
      for (final arquivo in _congelados) {
        final naquele = porArquivo[arquivo] ?? const <_Campo>[];
        expect(
          naquele.where((c) => c.temMascara),
          isNotEmpty,
          reason: 'REPROVA: `$arquivo` nao tem nenhum campo de telefone '
              'mascarado. Achei ${naquele.length} campo(s) de telefone nele.',
        );
      }
    });
  });

  group('a mascara do contato publico da indicacao e CONDICIONAL', () {
    // Este campo e o unico POLIMORFICO do app: o mesmo `BichuField` recebe
    // telefone, site ou Instagram conforme `TipoDeContatoPublico`. Uma mascara
    // fixa aqui apagaria `https://` e `@` enquanto a pessoa digita -- um campo
    // que come o que se escreve e pior que um campo sem mascara. O caso acima
    // ficaria verde com a mascara fixa; este e o contrapeso dele.
    const String arquivo = 'lib/telas/perto/sugerir_profissional.dart';

    test('a mascara entra e sai com `TipoDeContatoPublico.phone`', () {
      final fonte = fontes[arquivo];
      expect(
        fonte,
        isNotNull,
        reason: 'REPROVA: `$arquivo` nao existe. O campo de contato publico '
            'da indicacao e o campo que BICHUS-308 acrescentou.',
      );
      final campo = campos.firstWhere(
        (c) => c.arquivo == arquivo && c.temMascara,
        orElse: () => throw TestFailure(
          'REPROVA: nenhum campo mascarado em `$arquivo`.',
        ),
      );
      expect(
        RegExp(
          r'formatadores\s*:\s*tipo\s*==\s*TipoDeContatoPublico\.phone\s*\?',
        ).hasMatch(campo.argumentos),
        isTrue,
        reason: 'REPROVA: `$arquivo` monta a mascara de telefone SEM '
            'condicionar ao tipo escolhido. `MascaraDeTelefone` descarta tudo '
            'o que nao e digito: no ramo `website` ela apagaria `https://` e '
            'no `instagram` o `@`, letra por letra, enquanto a pessoa digita.',
      );
    });

    test('o corpo leva E.164, e nunca o texto mascarado', () {
      final fonte = fontes[arquivo]!;
      final semComentario = mascaraSemComentarios(fonte);
      expect(
        RegExp(
          r'contato\s*:\s*_tipoDeContato\s*==\s*TipoDeContatoPublico\.phone'
          r'\s*\?\s*telefoneEmE164\(',
        ).hasMatch(semComentario),
        isTrue,
        reason: 'REPROVA: `$arquivo` manda para a API o que esta na tela. '
            '`DirectorySuggestionContact.value` declara E.164 para '
            '`kind: phone` (`+5511...`): `(11) 98765-4321` toma `400` '
            'nomeando `public_contact.value`. A mascara e de EXIBICAO, e '
            '`telefoneEmE164` e a unica funcao de `formato/telefone.dart` '
            'que produz valor de contrato.',
      );
      expect(
        RegExp(r'_Impedimento\.telefoneIncompleto').hasMatch(semComentario),
        isTrue,
        reason: 'REPROVA: `$arquivo` nao impede o envio de telefone pela '
            'metade. Com o campo mascarado, `(11` tem tres caracteres e passa '
            'pelo `length < 3` de `semContato` -- o botao habilita sobre um '
            'numero incompleto e `telefoneEmE164` devolveria `null`.',
      );
    });
  });
}
