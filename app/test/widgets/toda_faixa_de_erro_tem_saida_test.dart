// TODA FAIXA QUE NASCE DE `MensagensDeErro` TEM SAIDA ALCANCAVEL.
//
// ===========================================================================
// ISTO E PORTAO, E NAO TESTE -- e a diferenca e o que ele cobre
// ===========================================================================
//
// Um caso de widget por tela mediria TREZE telas e aprovaria a QUATORZE que
// nascer amanha. O que precisa valer nao e "esta tela tem botao": e que
// **nao existe** no aplicativo faixa de erro que receba uma `MensagemDeErro`
// e jogue fora a saida dela. Isso se mede lendo `lib/` do disco, e e por isso
// que este arquivo nao abre tela nenhuma.
//
// ===========================================================================
// O DEFEITO QUE ELE GUARDA, com relato e medicao
// ===========================================================================
//
// O cliente mandou remover, em 18/10/2026, o TEXTO do `401 unauthenticated`
// (*"remova esse bloco de texto 'entre na sua conta para continuar...'"*) e
// **manteve a saida**, o botao `Entrar`. O catalogo obedeceu ao pe da letra:
// `ProblemTipo.naoAutenticado => MensagemDeErro(texto: '', acao: 'Entrar',
// proximaAcao: ProximaAcao.entrar)` (`lib/api/mensagens_de_erro.dart`).
//
// Uma tela que escreve `FaixaDeAviso(texto: mensagem.texto)` e so isso
// descarta `acao` e `proximaAcao`. No `401` o resultado e uma tarja vermelha
// com o icone e **mais nada** -- sem frase e sem botao. `faixa_de_aviso.dart`
// chama esse estado, com estas palavras, de *falha calada*, e ele foi
// REPRODUZIDO em emulador com o APK release, no Mural deslogado, em
// 20/10/2026. TREZE montagens estavam assim -- o Mural, consertado primeiro,
// e as doze que este portao passou a cobrar.
//
// **O TEXTO DO `401` NAO VOLTA.** Este portao mede a SAIDA e nunca a frase: um
// caso que cobrasse texto pressionaria a proxima pessoa a desfazer a decisao
// do cliente para ficar verde.
//
// ===========================================================================
// DESLIGAR PARA VER REPROVAR -- medido
// ===========================================================================
//
// Em qualquer uma das telas ligadas, troque
// `FaixaDeAviso(texto: x.texto, rotuloDaAcao: x.acao, aoTocarNaAcao:
// saidaDaMensagem(context, x))` por `FaixaDeAviso(texto: x.texto)`.
//   -> reprova `nenhuma faixa de `MensagensDeErro` descarta a saida dela`,
//      **nomeando o arquivo e a linha**. E o nome que importa: um portao que
//      so diz "alguma tela esta errada" manda a proxima pessoa procurar.
//
// Troque o `saidaDaMensagem(context, x)` de uma delas por um callback escrito
// a mao.
//   -> reprova `a saida sai de UM lugar so`. A resolucao de destino ja
//      divergiu uma vez nesta casa: `rede/criar_encontro.dart` e
//      `perto/sugerir_profissional.dart` tinham a mesma logica em duas
//      redacoes, e a segunda esquecia o ramo de `verificarEmail` -- que e
//      exatamente a saida do `409 contact-channel-unverified`.

import 'dart:io';

import 'package:flutter_test/flutter_test.dart';

import '../dispositivo/diretivas_dart.dart';

/// O diretorio de telas, relativo a raiz de `app/` (de onde `flutter test`
/// roda).
const String _telas = 'lib/telas';

/// Uma montagem de `FaixaDeAviso` encontrada na fonte.
class _Faixa {
  _Faixa({
    required this.arquivo,
    required this.linha,
    required this.mensagem,
    required this.argumentos,
  });

  final String arquivo;
  final int linha;

  /// O nome da variavel de [MensagemDeErro] que alimenta `texto:`.
  final String mensagem;
  final String argumentos;

  bool get temRotulo => RegExp(r'rotuloDaAcao\s*:').hasMatch(argumentos);
  bool get temToque => RegExp(r'aoTocarNaAcao\s*:').hasMatch(argumentos);

  /// O rotulo vem da propria mensagem (e nao e um rotulo de OPERACAO escrito
  /// pela tela, como `Tentar de novo`).
  bool get rotuloEhDaMensagem =>
      RegExp('rotuloDaAcao\\s*:\\s*$mensagem!?\\.acao').hasMatch(argumentos);

  bool get usaOPontoUnico => argumentos.contains('saidaDaMensagem(');

  @override
  String toString() => '$arquivo:$linha';
}

/// Os `.dart` de [_telas], com o caminho relativo a `app/`.
Map<String, String> _fontesDasTelas() {
  final raiz = Directory(_telas);
  expect(
    raiz.existsSync(),
    isTrue,
    reason:
        'REPROVA: o caso roda do diretorio errado. Ele tem de rodar da raiz '
        'de `app/`, que e de onde `flutter test` roda.',
  );
  final fontes = <String, String>{};
  for (final f in raiz.listSync(recursive: true)) {
    if (f is! File || !f.path.endsWith('.dart')) continue;
    fontes[f.path] = f.readAsStringSync();
  }
  expect(
    fontes.length,
    greaterThan(20),
    reason:
        'REPROVA: li ${fontes.length} arquivos de `$_telas`. O portao ficaria '
        'verde por VAZIO, que e como esta classe de defeito passa '
        'despercebida.',
  );
  return fontes;
}

/// Toda `FaixaDeAviso(...)` cujo `texto:` e o `.texto` de uma
/// [MensagemDeErro], nos arquivos que montam mensagem pelo catalogo.
///
/// Os parenteses sao equilibrados a mao, e nao casados por expressao regular:
/// os argumentos carregam chamadas aninhadas (`saidaDaMensagem(context, x)`),
/// e um `\)` preguicoso cortaria a montagem no meio -- que deixaria o portao
/// achar que falta saida onde ela esta.
List<_Faixa> _faixasDeMensagem(Map<String, String> fontes) {
  final achadas = <_Faixa>[];
  fontes.forEach((caminho, bruto) {
    // ===================================================================
    // 21/10/2026 -- A VARREDURA LIA COMENTARIO COMO CODIGO, DE TRES JEITOS
    // ===================================================================
    //
    // Ela percorria o fonte BRUTO. Isso dava tres leituras erradas, e as
    // tres sao silenciosas:
    //
    //   1. um `FaixaDeAviso(` COMENTADO -- o exemplo numa nota, o trecho que
    //      alguem desligou -- entrava na lista como montagem de verdade. Sem
    //      `rotuloDaAcao:` nos argumentos dele, o portao REPROVAVA uma tela
    //      que nao tem defeito nenhum;
    //   2. `rotuloDaAcao:` ou `aoTocarNaAcao:` escrito num comentario DENTRO
    //      dos argumentos satisfazia `temRotulo`/`temToque`. Uma faixa que de
    //      fato jogou a saida fora PASSAVA -- e esse e o furo que este portao
    //      existe para fechar;
    //   3. o equilibrio de parenteses contava `(` e `)` de comentario e de
    //      literal. Um `texto: 'tudo bem :)'` desconta um nivel que nunca foi
    //      aberto, e o recorte dos argumentos termina ANTES do fim da
    //      montagem -- o que faz o portao nao achar a saida que esta la.
    //
    // `mascaraSemComentarios` troca comentario (e, aqui, o conteudo dos
    // literais) por espaco **sem mudar comprimento nem numero de linha**. A
    // posicao continua valendo no fonte original, que e o que o `linha:`
    // reportado precisa. Mascarar literal e obrigatorio AQUI porque esta
    // varredura EQUILIBRA DELIMITADOR; quem so procura identificador nao deve
    // mascarar.
    final fonte = mascaraSemComentarios(bruto, mascararLiterais: true);
    if (!fonte.contains('MensagensDeErro.de(')) return;
    for (final m in RegExp(r'FaixaDeAviso\(').allMatches(fonte)) {
      var i = m.end;
      var profundidade = 1;
      while (i < fonte.length && profundidade > 0) {
        final c = fonte[i];
        if (c == '(') {
          profundidade++;
        } else if (c == ')') {
          profundidade--;
        }
        i++;
      }
      final argumentos = fonte.substring(m.end, i - 1);
      final doTexto = RegExp(
        r'texto:\s*([A-Za-z_][A-Za-z0-9_]*)!?\.texto',
      ).firstMatch(argumentos);
      // `texto:` com uma `String` (uma constante da tela, um motivo de
      // recusa) nao e deste portao: nao ha `acao` nenhuma a descartar.
      if (doTexto == null) continue;
      achadas.add(
        _Faixa(
          arquivo: caminho,
          linha: '\n'.allMatches(fonte.substring(0, m.start)).length + 1,
          mensagem: doTexto.group(1)!,
          argumentos: argumentos,
        ),
      );
    }
  });
  return achadas;
}

/// AS DUAS DISPENSAS, escritas A MAO e com a razao de cada uma.
///
/// **Nenhuma delas e "esta tela e especial".** As duas INTERCEPTAM
/// `ProblemTipo.naoAutenticado` **antes** de montar a mensagem: guardam o
/// rascunho na guarda de intencao e empurram `Rotas.entrar` sozinhas. A faixa
/// delas nunca recebe o `401` de texto vazio, que e o estado que este portao
/// existe para impedir.
///
/// A dispensa tem PRE-CONDICAO, e ela e conferida abaixo: o arquivo tem de
/// continuar interceptando. No dia em que alguem tirar a intercepcao, a
/// dispensa para de valer e o portao volta a cobrar a saida -- em vez de
/// sobreviver como um buraco que ninguem lembra de ter aberto.
/// OS TRES RESOLVEDORES ESCRITOS A MAO QUE JA EXISTIAM, e o que prende cada um.
///
/// Eles sao ANTERIORES a esta branch e nao foram tocados por ela -- as tres
/// telas estao fora do recorte desta tarefa, por decisao do coordenador. A
/// lista existe para a divergencia ficar RASTREADA em vez de silenciosa, e
/// cada entrada carrega a pre-condicao que a mantem honesta.
///
/// **Duas delas sao copia literal de `saidaDaMensagem`** (mesmos tres ramos,
/// mesma ordem), e sao exatamente as duas que o cabecalho de
/// `lib/roteamento/saida_da_mensagem.dart` nomeia como a razao de aquele
/// arquivo existir: *"a mesma resolucao estava escrita a mao em
/// `rede/criar_encontro.dart` e em `perto/sugerir_profissional.dart`, em duas
/// redacoes, e a segunda tinha dois ramos onde a primeira tinha tres: faltava
/// `verificarEmail`"*. A pre-condicao das duas e justamente o ramo que ja foi
/// esquecido uma vez.
///
/// **A terceira NAO e copia, e migra-la seria perder comportamento.**
/// `_acaoDaFaixa` de `tela_cadastrar_sinais.dart` cai no `_cadastrar` da
/// propria tela quando a mensagem nao tem endereco -- e o `Tentar de novo` do
/// formulario. `saidaDaMensagem` devolveria `null` ali e o botao sumiria.
const Map<String, String> _resolvedoresDeLegado = <String, String>{
  'lib/telas/perto/sugerir_profissional.dart': 'ProximaAcao.verificarEmail',
  'lib/telas/rede/criar_encontro.dart': 'ProximaAcao.verificarEmail',
  'lib/telas/pet/tela_cadastrar_sinais.dart': 'return _cadastrar;',
};

const Map<String, String> _dispensas = <String, String>{
  'lib/telas/perdido/tela_alcance_do_alerta.dart':
      'intercepta `naoAutenticado` e empurra `Rotas.entrar` com a guarda de '
          'intencao; o `409 contact-channel-unverified` desta tela tem faixa '
          'PROPRIA, com `Confirmar meu e-mail` e callback, logo abaixo',
  'lib/telas/achado/tela_registrar_achado.dart':
      'intercepta `naoAutenticado` e empurra `Rotas.entrar` com a guarda de '
          'intencao, guardando a foto ja enviada',
};

void main() {
  // =========================================================================
  // AS ISCAS DA LEITURA -- AS DUAS DIRECOES, E A SEGUNDA E A QUE IMPORTA MAIS
  // =========================================================================
  //
  // A varredura e alimentada A MAO aqui: `_faixasDeMensagem` recebe um mapa de
  // fontes, entao a isca nao precisa escrever no disco nem depender do que
  // `lib/` tem hoje.
  //
  // A primeira direcao prova que o falso positivo morreu. A segunda prova que a
  // mascara NAO cegou o portao -- e essa e a que decide se o conserto valeu:
  // trocar `mascaraSemComentarios` por `(f, {mascararLiterais}) => ""` apagaria
  // o portao inteiro em silencio, e so uma isca de REPROVA acusa isso.
  group('a leitura da varredura: comentario nao e montagem', () {
    test('NAO acha a `FaixaDeAviso(` que esta COMENTADA', () {
      final achadas = _faixasDeMensagem(<String, String>{
        'lib/telas/isca.dart': '''
final m = MensagensDeErro.de(erro);
// FaixaDeAviso(texto: m.texto)
/* FaixaDeAviso(texto: m.texto) */
void nada() {}
''',
      });
      expect(
        achadas,
        isEmpty,
        reason:
            'achado FALSO: montagem COMENTADA entrou na lista. Sem '
            '`rotuloDaAcao:` nela, o portao reprovaria uma tela sem defeito '
            'nenhum -- e o comentario costuma ser justamente a nota que '
            'explica por que aquela faixa nao existe mais.',
      );
    });

    test('ACHA a montagem de verdade, e ve que ela esta SEM saida', () {
      final achadas = _faixasDeMensagem(<String, String>{
        'lib/telas/isca.dart': '''
final m = MensagensDeErro.de(erro);
// Nota que cita FaixaDeAviso( para explicar o portao.
Widget b() => FaixaDeAviso(texto: m.texto);
''',
      });
      expect(
        achadas,
        hasLength(1),
        reason:
            'o portao ficou CEGO: a montagem de verdade deixou de ser achada. '
            'Uma mascara gulosa -- apagar a LINHA que tenha `//` -- da '
            'exatamente este resultado.',
      );
      expect(achadas.single.linha, 3,
          reason:
              'a LINHA reportada saiu do lugar: a mascara mudou comprimento ou '
              'comeu `\n`, e o relatorio passa a apontar para outro trecho.');
      expect(achadas.single.temRotulo, isFalse);
      expect(achadas.single.temToque, isFalse);
    });

    test('`rotuloDaAcao:` COMENTADO dentro dos argumentos NAO conta como saida',
        () {
      // Esta e a direcao cega, e e a pior das duas: aqui o portao APROVA uma
      // faixa que de fato jogou a saida fora.
      final achadas = _faixasDeMensagem(<String, String>{
        'lib/telas/isca.dart': '''
final m = MensagensDeErro.de(erro);
Widget b() => FaixaDeAviso(
      texto: m.texto,
      // rotuloDaAcao: m.acao,
      // aoTocarNaAcao: () {},
    );
''',
      });
      expect(achadas, hasLength(1));
      expect(
        achadas.single.temRotulo,
        isFalse,
        reason:
            'o portao APROVOU uma faixa cuja saida esta COMENTADA. Prosa nao '
            'desenha botao: essa faixa chega ao usuario sem saida.',
      );
      expect(achadas.single.temToque, isFalse);
    });

    test('parentese dentro de LITERAL nao corta o recorte dos argumentos', () {
      // O `:)` fecha um nivel que nunca foi aberto. Sem mascarar o literal, o
      // recorte terminava antes do `rotuloDaAcao:` e o portao cobrava uma
      // saida que esta escrita logo abaixo.
      final achadas = _faixasDeMensagem(<String, String>{
        'lib/telas/isca.dart': """
final m = MensagensDeErro.de(erro);
Widget b() => FaixaDeAviso(
      texto: m.texto,
      rodape: 'tudo bem :)',
      rotuloDaAcao: m.acao,
      aoTocarNaAcao: () {},
    );
""",
      });
      expect(achadas, hasLength(1));
      expect(
        achadas.single.temRotulo,
        isTrue,
        reason:
            'o recorte dos argumentos foi cortado por um `)` que mora DENTRO '
            'de uma string. A saida existe e o portao nao a viu.',
      );
      expect(achadas.single.temToque, isTrue);
    });
  });

  group('toda faixa de erro tem saida', () {
    test(
      'nenhuma faixa de `MensagensDeErro` descarta a saida dela',
      () {
        final fontes = _fontesDasTelas();
        final faixas = _faixasDeMensagem(fontes);

        // CONTRAPESO: o portao achou faixa de verdade. Sem ele, uma expressao
        // regular quebrada deixaria a lista vazia e o portao verde -- que e
        // a forma mais facil de um portao de omissao nao medir nada.
        expect(
          faixas.length,
          greaterThanOrEqualTo(20),
          reason:
              'REPROVA NO CONTRAPESO: achei ${faixas.length} faixa(s) de '
              '`MensagensDeErro` em `$_telas`. Em 21/10/2026 eram VINTE, '
              'CONTADAS e nao estimadas. Menos que isso e a varredura '
              'quebrada -- e varredura quebrada aprova o aplicativo inteiro '
              'em silencio, que e o modo de falha que este portao nao pode '
              'ter.',
        );

        final mudas = <String>[];
        for (final f in faixas) {
          final dispensa = _dispensas[f.arquivo];
          if (dispensa != null) {
            // A PRE-CONDICAO da dispensa.
            expect(
              fontes[f.arquivo],
              contains('ProblemTipo.naoAutenticado'),
              reason:
                  'REPROVA: `${f.arquivo}` esta dispensado deste portao '
                  'porque $dispensa -- e NAO intercepta mais '
                  '`naoAutenticado`. Ou a intercepcao volta, ou a dispensa '
                  'sai e a faixa ganha `rotuloDaAcao` e `aoTocarNaAcao`.',
            );
            continue;
          }
          if (!f.temRotulo || !f.temToque) mudas.add(f.toString());
        }

        expect(
          mudas,
          isEmpty,
          reason:
              'REPROVA: ${mudas.length} faixa(s) recebem uma `MensagemDeErro` '
              'e descartam a saida dela -- ${mudas.join(', ')}. No `401 '
              'unauthenticated` isso e uma tarja vermelha com o icone e MAIS '
              'NADA: o cliente mandou tirar o TEXTO em 18/10/2026 e manteve o '
              'botao `Entrar`, e quem passa so `texto:` desfaz a metade '
              'errada da decisao. A forma e `rotuloDaAcao: x.acao` + '
              '`aoTocarNaAcao: saidaDaMensagem(context, x)` '
              '(`lib/roteamento/saida_da_mensagem.dart`). Rotulo de OPERACAO '
              'nao vira botao morto: `saidaDaMensagem` devolve `null` para '
              'ele e `FaixaDeAviso` so desenha o botao com rotulo E callback.',
        );
      },
    );

    test('a saida sai de UM lugar so', () {
      // A metade que o caso de cima nao cobre: ele aceitaria doze callbacks
      // escritos a mao, que e como a resolucao de destino ja divergiu uma vez
      // nesta casa -- duas redacoes, e a segunda sem o ramo de
      // `verificarEmail`.
      //
      // So vale para quem usa o rotulo DA MENSAGEM: uma tela que oferece
      // `Tentar de novo` passa o proprio `_carregar`, e esta certa.
      final fontes = _fontesDasTelas();
      final faixas = _faixasDeMensagem(fontes);

      // AS TRES DE LEGADO continuam presas pela pre-condicao delas: a entrada
      // da lista so vale enquanto o arquivo ainda carrega o ramo que ela
      // nomeia. Tirar o ramo nao passa calado -- reprova aqui.
      _resolvedoresDeLegado.forEach((caminho, ramo) {
        expect(
          fontes[caminho],
          isNotNull,
          reason: 'REPROVA: `$caminho` esta na lista de legado e nao existe mais.',
        );
        expect(
          fontes[caminho],
          contains(ramo),
          reason:
              'REPROVA: `$caminho` resolve o destino por conta propria e '
              'PERDEU `$ramo`. Era exatamente assim que a copia divergia '
              'antes de `saidaDaMensagem` existir: dois ramos onde a outra '
              'tinha tres. Ou o ramo volta, ou a tela passa a usar o ponto '
              'unico e sai desta lista.',
        );
      });

      final aMao = faixas
          .where(
            (f) =>
                f.rotuloEhDaMensagem &&
                !f.usaOPontoUnico &&
                !_resolvedoresDeLegado.containsKey(f.arquivo),
          )
          .map((f) => f.toString())
          .toList();

      expect(
        aMao,
        isEmpty,
        reason:
            'REPROVA: NOVO resolvedor escrito a mao em ${aMao.join(', ')}. '
            'Estas faixas oferecem o rotulo que a MENSAGEM '
            'declara e resolvem o destino por conta propria. Quem traduz '
            '`rotaDaAcao` e `proximaAcao` em endereco deste aplicativo e '
            '`saidaDaMensagem`, e e um lugar so de proposito: a copia ja '
            'divergiu entre `rede/criar_encontro.dart` e '
            '`perto/sugerir_profissional.dart`, e a segunda tinha dois ramos '
            'onde a primeira tinha tres.',
      );

      // CONTRAPESO: ha faixas usando o ponto unico. Sem ele, o caso acima
      // ficaria verde num mundo em que nenhuma faixa oferece rotulo de
      // mensagem nenhum -- isto e, com o defeito de volta em todas.
      expect(
        faixas.where((f) => f.usaOPontoUnico).length,
        greaterThanOrEqualTo(14),
        reason:
            'REPROVA NO CONTRAPESO: so '
            '${faixas.where((f) => f.usaOPontoUnico).length} faixa(s) usam '
            '`saidaDaMensagem`. Em 21/10/2026 eram QUATORZE, contadas: as '
            'doze desta branch, mais `mural/tela_do_mural.dart` e '
            '`perto/pagina_do_local.dart`. Um numero menor significa que '
            'alguem desligou a saida de alguma tela.',
      );
    });

    // =======================================================================
    // A OUTRA METADE DO MESMO DEFEITO, e por que ela NAO se mede pelo texto
    // =======================================================================
    //
    // 22/10/2026. O Mural deslogado foi relatado com *"a tarja que convida a
    // entrar aparece sem texto nenhum -- so o icone e o link"*. E a MESMA
    // forma de defeito que os casos acima guardam, e os casos acima
    // APROVARAM: a faixa do Mural tinha `rotuloDaAcao` e `aoTocarNaAcao`
    // desde 20/10 -- a saida estava la --, e o que faltava era a frase.
    //
    // **E este portao continua sem medir frase, de proposito.** O texto do
    // `401 unauthenticated` e `''` por decisao do cliente de 18/10/2026, e um
    // caso que cobrasse texto de faixa pressionaria a proxima pessoa a
    // desfazer aquela decisao, em TODAS as telas, para ficar verde. O
    // cabecalho deste arquivo ja dizia isso, e segue valendo.
    //
    // O conserto certo nao e devolver a frase: e o 401 **sair do caminho de
    // faixa**. Quem decidiu isso foi o cliente, em 19/10/2026, depois de
    // testar no iPhone -- *"mas tem que ter uma pagina de deslogado, nao da
    // para mostrar so uma mensagem de erro para atualizar"* --, e o objeto
    // dessa decisao e `ConviteParaEntrar`, com um `SecaoComConta` por
    // superficie murada. O Mural era a ultima superficie murada sem entrada no
    // catalogo, e por isso ele caia no ramo de erro.
    //
    // Entao o que este caso cobra e a LIGACAO, e nao a redacao: toda entrada
    // do catalogo de superficies muradas esta de fato ligada a alguma tela. E
    // text-blind, nao encosta na decisao de 18/10, e reprova no dia em que
    // alguem desfizer uma das dezesseis conversoes -- inclusive a do Mural.
    //
    // **O QUE ELE NAO PEGA, dito por extenso:** uma superficie murada que
    // nunca ganhe entrada no catalogo. Foi exatamente assim que o Mural passou
    // -- nao havia `SecaoComConta.mural` para ficar orfa. Fechar esse furo
    // pede um mapa de rota-de-contrato para tela (`security: [bearerAuth]` sem
    // alternativa vazia em `api/openapi.yaml`, cruzado com a `*_api.dart` que
    // a tela usa), e esse mapa NAO existe neste portao.
    //
    // DESLIGAR PARA VER REPROVAR -- medido:
    //   apague a linha `ConviteParaEntrar(secao: SecaoComConta.mural)` de
    //   `lib/telas/mural/tela_do_mural.dart`
    //   -> reprova `toda superficie murada do catalogo esta ligada a uma tela`,
    //      nomeando `mural`.
    test('toda superficie murada do catalogo esta ligada a uma tela', () {
      final catalogo = File('lib/widgets/convite_para_entrar.dart');
      expect(
        catalogo.existsSync(),
        isTrue,
        reason: 'REPROVA: `${catalogo.path}` nao existe. O catalogo de '
            'superficies muradas mudou de lugar, e este caso ficaria verde '
            'por vazio.',
      );

      // As entradas DECLARADAS, lidas do corpo do `enum` e nao de uma lista
      // escrita aqui: uma lista a mao concordaria com qualquer recorte futuro.
      final fonteDoCatalogo = mascaraSemComentarios(
        catalogo.readAsStringSync(),
        mascararLiterais: true,
      );
      final corpo = RegExp(
        r'enum SecaoComConta\s*\{(.*?)\n\}',
        dotAll: true,
      ).firstMatch(fonteDoCatalogo);
      expect(
        corpo,
        isNotNull,
        reason: 'REPROVA: nao achei o corpo de `enum SecaoComConta`. A '
            'varredura quebrou, e varredura quebrada aprova em silencio.',
      );
      final declaradas = RegExp(r'^  ([a-z][A-Za-z0-9]*)\(', multiLine: true)
          .allMatches(corpo!.group(1)!)
          .map((m) => m.group(1)!)
          .toSet();

      // CONTRAPESO: o `enum` tem entradas de verdade. Sem ele, uma expressao
      // regular quebrada deixaria o conjunto vazio e o caso verde -- que e a
      // forma mais facil de um portao de omissao nao medir nada.
      expect(
        declaradas.length,
        greaterThanOrEqualTo(16),
        reason: 'REPROVA NO CONTRAPESO: li ${declaradas.length} entrada(s) de '
            '`SecaoComConta`. Em 22/10/2026 eram DEZESSEIS, contadas. Menos '
            'que isso e a leitura do `enum` quebrada.',
      );

      // As entradas USADAS, em `lib/` inteiro e nao so em `lib/telas`: o
      // convite aparece tambem na folha curta de `widgets/`. O proprio
      // catalogo nao conta -- e la que elas sao declaradas.
      final usadas = <String>{};
      for (final f in Directory('lib').listSync(recursive: true)) {
        if (f is! File || !f.path.endsWith('.dart')) continue;
        if (f.path == catalogo.path) continue;
        final fonte = mascaraSemComentarios(
          f.readAsStringSync(),
          mascararLiterais: true,
        );
        for (final m
            in RegExp(r'SecaoComConta\.([a-z][A-Za-z0-9]*)').allMatches(fonte)) {
          usadas.add(m.group(1)!);
        }
      }

      // CONTRAPESO: a varredura de uso achou algo. Um `lib/` lido como vazio
      // deixaria TODA entrada orfa e o caso reprovaria por motivo errado.
      //
      // **O PISO E FOLGADO DE PROPOSITO, e isto foi medido.** Com o piso em
      // DEZESSEIS -- o numero exato de hoje --, desligar UMA ligacao derrubava
      // este contrapeso em vez da asercao de orfas, e o relatorio dizia *"a
      // varredura de uso quebrou"* quando o que havia acontecido era
      // precisamente o defeito que o caso existe para nomear. Medido em
      // 22/10/2026 trocando `SecaoComConta.mural` por `.mensagens` no Mural:
      // reprovava aqui, com a mensagem errada, e a lista de orfas nunca era
      // impressa. O piso tem de separar "a varredura morreu" de "uma tela
      // perdeu a ligacao", e por isso ele e DEZ e nao dezesseis.
      expect(
        usadas.length,
        greaterThanOrEqualTo(10),
        reason: 'REPROVA NO CONTRAPESO: achei apenas ${usadas.length} '
            'referencia(s) distinta(s) a `SecaoComConta` em `lib/`. Este piso '
            'e folgado -- ele separa "a varredura morreu" de "uma ligacao '
            'caiu", que a asercao de orfas abaixo nomeia. Abaixo de dez, o '
            'que quebrou foi a leitura.',
      );

      final orfas = declaradas.difference(usadas).toList()..sort();
      expect(
        orfas,
        isEmpty,
        reason: 'REPROVA: ${orfas.length} superficie(s) do catalogo de '
            'deslogado nao estao ligadas a tela nenhuma -- '
            '${orfas.join(', ')}. Cada entrada de `SecaoComConta` existe '
            'porque uma superficie MURADA precisa dizer o que ela e a quem '
            'nao tem conta; uma entrada orfa significa que aquela superficie '
            'voltou a mandar o `401 unauthenticated` para `FaixaDeAviso`, e o '
            'catalogo devolve `texto: \'\'` para ele desde 18/10/2026 -- '
            'ou seja, o icone de erro e MAIS NADA sobre o botao `Entrar`. Foi '
            'esse o relato do Mural deslogado em 22/10/2026. O conserto NAO e '
            'devolver o texto do 401: e `if (faltaConta(falha))` no `catch` da '
            'carga e `ConviteParaEntrar(secao: ...)` no `build`, como nas '
            'outras quinze.',
      );
    });

    test('as dispensas sao DUAS, e cada uma existe no disco', () {
      // A lista e escrita a mao de proposito: derivar "toda tela que
      // intercepta" deixaria o portao concordar com qualquer recorte futuro.
      // Acrescentar uma dispensa tem de ser um ato com nome no diff.
      final fontes = _fontesDasTelas();
      expect(_dispensas, hasLength(2));
      for (final caminho in _dispensas.keys) {
        expect(
          fontes.containsKey(caminho),
          isTrue,
          reason:
              'REPROVA: `$caminho` esta dispensado e nao existe mais. Se a '
              'tela mudou de nome, a dispensa muda com ela -- e a mudanca e '
              'deliberada.',
        );
      }
    });
  });
}
