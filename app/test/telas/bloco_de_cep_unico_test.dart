// O BLOCO DE CEP E UM SO, E A SIGLA DO ESTADO E CONFERIDA (30/10/2026).
//
// ===========================================================================
// O QUE ESTE ARQUIVO DEFENDE, E POR QUE ELE E PORTAO E NAO SO TESTE
// ===========================================================================
// Em 30/10/2026 o bloco de CEP estava escrito SEIS vezes, uma por tela, e a
// repeticao escondia um defeito: TRES das seis punham no formulario a sigla de
// estado que a base de CEP mandasse, de duas letras, sem conferir se ela e uma
// das 27. `siglaDeEstadoValida` existia em `api/estados_brasileiros.dart` e as
// outras tres a chamavam.
//
// A unificacao conserta as tres de uma vez, e e por isso que a defesa nao pode
// ser so "a tela X valida": na hora em que alguem reescrever o bloco dentro de
// uma tela, as seis voltam a divergir e o defeito volta por onde saiu. Este
// arquivo cobra as duas coisas:
//
//   1. a ISCA ESTRUTURAL -- nenhuma tela tem copia privada do bloco, cobrada
//      POR NOME;
//   2. o MECANISMO -- `BlocoDeCep` recusa sigla que nao existe, preenche so
//      campo vazio e dispara no OITAVO digito.
//
// O caso por TELA vive em `bloco_de_cep_nas_seis_telas_test.dart`, com o
// formulario de verdade montado.
//
// ===========================================================================
// A ISCA E ASSERCAO DE AUSENCIA, E POR ISSO ELA TEM CONTROLE POSITIVO
// ===========================================================================
// "Nenhum arquivo de `app/lib/telas` escreve `_buscandoOCep`" fica VERDE de
// dois jeitos: porque ninguem escreve, ou porque a agulha tem erro de
// digitacao e nao casa com nada. O segundo e silencioso, e foi assim que outra
// frente passou verde num zero que nao media nada.
//
// Entao cada agulha e provada nos DOIS SENTIDOS:
//
//   - CONTROLE POSITIVO DA AGULHA: a mesma varredura tem de ACHAR a agulha em
//     algum lugar de `app/lib` FORA de `app/lib/telas`. Agulha com erro de
//     digitacao nao esta em lugar nenhum, e o controle reprova. Os quatro
//     nomes de campo (`_buscaDoCep`, `_buscandoOCep`, `_cepJaBuscado`,
//     `_buscarOCep`) sobrevivem de proposito na PROSA de
//     `lib/formulario/bloco_de_cep.dart`, e aquele arquivo diz isso na cara;
//   - CONTROLE POSITIVO DO DETECTOR: o MESMO detector, rodado sobre uma copia
//     literal do bloco COMO ELE ERA antes desta entrega, tem de reprovar e
//     nomear as agulhas. Isso prova o sentido que importa -- que a isca pega a
//     copia privada voltando -- sem precisar sujar o repositorio para ver;
//   - CONTROLE DE ALCANCE: a varredura reprova se achar menos arquivos do que
//     o piso. Varredura cega fica verde sem conferir nada.

import 'dart:io' as io;

import 'package:bichu/api/busca_de_cep.dart';
import 'package:bichu/formulario/bloco_de_cep.dart';
import 'package:bichu/formulario/origem_dos_valores.dart';
import 'package:flutter/widgets.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:http/http.dart' as http;
import 'package:http/testing.dart';

import '../dispositivo/literais_de_abrir_mapa.dart'
    show caminhoRelativoNoPacote, dartsDeLib, raizDoPacoteDoApp;

/// A peca compartilhada, no caminho em que ela mora.
const String _caminhoDoBloco = 'lib/formulario/bloco_de_cep.dart';

/// O recorte que a isca vigia.
const String _pastaDasTelas = 'lib/telas/';

/// O PISO de arquivos em `lib/telas`: medido em 95 em 30/10/2026, e o piso
/// esta abaixo de proposito -- ele existe para pegar varredura CEGA, nao para
/// cobrar o censo (quem cobra o censo e `_arvoreDasTelas`).
const int _pisoDeTelas = 80;

/// AS AGULHAS. Cada uma e um pedaco do bloco antigo, e nenhuma tem razao de
/// aparecer numa tela depois desta entrega.
///
/// `MascaraDeCep` entra porque a mascara agora chega pela constante
/// `formatadoresDeCep`: tela que a instancia esta remontando o campo a mao.
/// Os tres tipos de `api/busca_de_cep.dart` entram porque **quem os nomeia
/// esta lendo a resposta da busca**, que e justamente o que o bloco faz.
const Map<String, String> _agulhas = <String, String>{
  '_buscarOCep': 'o metodo da busca, que era igual nas seis',
  '_buscandoOCep': 'o sinalizador de "buscando", que era igual nas seis',
  '_cepJaBuscado': 'a memoria do ultimo CEP, que era igual nas seis',
  '_buscaDoCep': 'o desfecho da ultima busca, que era igual nas seis',
  'MascaraDeCep': 'a mascara do campo, que hoje vem em `formatadoresDeCep`',
  'ResultadoDaBusca': 'o desfecho da busca, que so o bloco le',
  'RespostaDaBuscaDeCep': 'a resposta da busca, que so o bloco le',
  'EnderecoDoCep': 'o endereco que a busca devolveu, que so o bloco le',
};

/// AS SEIS TELAS que tem o bloco, por lista e nao por contagem.
///
/// Por LISTA de proposito: contar seis deixaria passar uma tela trocada por
/// outra, e e exatamente a tela que perdeu o bloco que ninguem procura.
const List<String> _seisTelas = <String>[
  'lib/telas/localizacao/captura_de_localizacao.dart',
  'lib/telas/perfil/tela_dados_pessoais.dart',
  'lib/telas/perfil/tela_endereco_de_entrega.dart',
  'lib/telas/perto/sugerir_profissional.dart',
  'lib/telas/pet/tela_solicitar_plaquinha.dart',
  'lib/telas/rede/criar_encontro.dart',
];

/// O BLOCO COMO ELE ERA, copiado de `lib/telas/perfil/tela_dados_pessoais.dart`
/// na arvore `b189d734`.
///
/// Ele esta aqui para o CONTROLE POSITIVO DO DETECTOR: o detector rodado sobre
/// este texto tem de reprovar. **Nao e exemplo nem documentacao** -- e o
/// unico jeito de provar que a isca pega a copia privada voltando sem ter de
/// escrever a copia numa tela para ver.
const String _oBlocoComoEleEra = r'''
  ResultadoDaBusca? _buscaDoCep;
  bool _buscandoOCep = false;
  String _cepJaBuscado = '';

  Future<void> _buscarOCep() async {
    final cep = _soDigitos(_cep.text);
    if (cep.length != 8 || cep == _cepJaBuscado) return;
    _cepJaBuscado = cep;
    setState(() {
      _buscandoOCep = true;
      _buscaDoCep = null;
    });
    final resposta = await Escopo.of(context).buscaDeCep.buscar(cep);
    if (!mounted) return;
    setState(() {
      _buscandoOCep = false;
      _buscaDoCep = resposta.resultado;
      final endereco = resposta.endereco;
      if (endereco == null) return;
      _preencherSeVazio(_bairro, endereco.bairro, _CamposDosDados.bairro);
      _preencherSeVazio(_cidade, endereco.cidade, _CamposDosDados.cidade);
      if (_uf == null && endereco.uf.length == 2) {
        _uf = endereco.uf;
        _erros.remove(_CamposDosDados.uf);
      }
    });
  }
''';

/// O DETECTOR, UM SO: as agulhas que [fonte] escreve.
///
/// Uma funcao so, usada pela isca E pelos dois controles -- duas copias do
/// detector divergiriam, e a que divergiria e a que ninguem roda.
List<String> _agulhasEm(String fonte) {
  final List<String> achadas = <String>[];
  for (final String agulha in _agulhas.keys) {
    if (fonte.contains(agulha)) achadas.add(agulha);
  }
  return achadas;
}

/// Os `.dart` de `lib/telas`, com o caminho relativo ao pacote.
List<(String, String)> _fontesDasTelas() {
  final List<(String, String)> fontes = <(String, String)>[];
  for (final io.File arquivo in dartsDeLib()) {
    final String caminho = caminhoRelativoNoPacote(arquivo);
    if (!caminho.startsWith(_pastaDasTelas)) continue;
    fontes.add((caminho, arquivo.readAsStringSync()));
  }
  return fontes;
}

/// Os `.dart` de `lib` que **nao** sao de `lib/telas`.
List<(String, String)> _fontesForaDasTelas() {
  final List<(String, String)> fontes = <(String, String)>[];
  for (final io.File arquivo in dartsDeLib()) {
    final String caminho = caminhoRelativoNoPacote(arquivo);
    if (caminho.startsWith(_pastaDasTelas)) continue;
    fontes.add((caminho, arquivo.readAsStringSync()));
  }
  return fontes;
}

String _lerDoPacote(String relativo) {
  final io.File arquivo = io.File('${raizDoPacoteDoApp()}/$relativo');
  expect(
    arquivo.existsSync(),
    isTrue,
    reason: 'REPROVA: nao achei "$relativo". Sem ele nao ha o que conferir, e '
        'ficar verde assim seria pior que nao existir.',
  );
  return arquivo.readAsStringSync();
}

void main() {
  group('a peca compartilhada existe e e ela que confere a sigla', () {
    test('`$_caminhoDoBloco` existe e nao esta vazio', () {
      final String fonte = _lerDoPacote(_caminhoDoBloco);
      expect(
        fonte.length,
        greaterThan(1000),
        reason: 'REPROVA: $_caminhoDoBloco tem ${fonte.length} caracteres. '
            'Peca esvaziada deixaria as seis telas sem bloco e os casos de '
            'ausencia abaixo verdes por vazio.',
      );
    });

    test('e e o bloco que chama `siglaDeEstadoValida`', () {
      final String fonte = _lerDoPacote(_caminhoDoBloco);
      expect(
        fonte.contains('siglaDeEstadoValida'),
        isTrue,
        reason: 'REPROVA: $_caminhoDoBloco nao chama `siglaDeEstadoValida`. '
            'ESTE e o conserto de 30/10/2026: tres das seis telas aceitavam '
            'qualquer par de letras que a base de CEP devolvesse. Tirar esta '
            'chamada reabre o defeito nas SEIS de uma vez.',
      );
    });
  });

  group('ISCA: nenhuma tela tem copia privada do bloco de CEP', () {
    test('CONTROLE DE ALCANCE: a varredura achou arquivo de tela', () {
      final List<(String, String)> fontes = _fontesDasTelas();
      expect(
        fontes.length,
        greaterThanOrEqualTo(_pisoDeTelas),
        reason: 'REPROVA: a varredura achou so ${fontes.length} arquivos em '
            '`$_pastaDasTelas`, e o piso e $_pisoDeTelas. Abaixo disso ela '
            'esta cega, e varredura cega fica verde sem conferir nada.',
      );
      for (final (String caminho, String fonte) in fontes) {
        expect(
          fonte,
          isNotEmpty,
          reason: 'REPROVA: "$caminho" veio vazio da varredura.',
        );
      }
    });

    test('CONTROLE POSITIVO DA AGULHA: cada agulha existe em `lib`', () {
      final List<(String, String)> fontes = _fontesForaDasTelas();
      final List<String> semCasamento = <String>[];
      for (final String agulha in _agulhas.keys) {
        final bool achou = fontes.any((f) => f.$2.contains(agulha));
        if (!achou) semCasamento.add(agulha);
      }
      expect(
        semCasamento,
        isEmpty,
        reason: 'REPROVA: estas agulhas nao aparecem em NENHUM arquivo de '
            '`lib` fora de `$_pastaDasTelas`: ${semCasamento.join(', ')}.\n'
            'A isca deste arquivo e assercao de AUSENCIA: agulha que nao casa '
            'com nada deixa o caso de ausencia verde sem conferir nada, e e '
            'assim que um erro de digitacao vira portao morto.\n'
            'Os quatro nomes de campo vivem na PROSA de $_caminhoDoBloco de '
            'proposito, e o arquivo explica por que. Se este caso reprovou '
            'depois de alguem reescrever aquela prosa, o conserto e devolver '
            'os nomes a ela (ou mover o controle para outro lugar, de '
            'proposito), nunca apagar a agulha.',
      );
    });

    test('CONTROLE POSITIVO DO DETECTOR: o bloco ANTIGO reprova', () {
      // Sem este caso, um detector quebrado (`contains` trocado por igualdade,
      // agulhas vazias, varredura que le o arquivo errado) passaria verde: o
      // repositorio esta limpo agora, e limpo e o que um detector morto
      // tambem ve.
      final List<String> achadas = _agulhasEm(_oBlocoComoEleEra);
      expect(
        achadas,
        containsAll(<String>[
          '_buscarOCep',
          '_buscandoOCep',
          '_cepJaBuscado',
          '_buscaDoCep',
          'ResultadoDaBusca',
        ]),
        reason: 'REPROVA: o detector rodou sobre a copia LITERAL do bloco como '
            'ele era antes de 30/10/2026 e nao o reconheceu. Achou: '
            '${achadas.join(', ')}.\n'
            'Isto nao e falha do codigo do app: e falha da ISCA. Um detector '
            'que nao pega o bloco antigo nao pega a copia privada voltando, e '
            'e ele que precisa de conserto.',
      );
    });

    test('nenhum arquivo de `$_pastaDasTelas` escreve uma agulha', () {
      final List<String> reprovas = <String>[];
      for (final (String caminho, String fonte) in _fontesDasTelas()) {
        for (final String agulha in _agulhasEm(fonte)) {
          reprovas.add('  $caminho escreve `$agulha` -- ${_agulhas[agulha]}');
        }
      }
      expect(
        reprovas,
        isEmpty,
        reason: 'REPROVA: uma copia privada do bloco de CEP voltou para dentro '
            'de uma tela.\n${reprovas.join('\n')}\n'
            'O bloco de CEP e UM, e mora em $_caminhoDoBloco. Ele estava '
            'escrito seis vezes em 30/10/2026, e a sexta copia escondia o '
            'defeito que esta entrega consertou: tres telas aceitavam sigla '
            'de estado que nao existe. Uma copia nova reabre a divergencia, e '
            'o lugar de mudar o comportamento da busca e a peca, nao a tela.',
      );
    });

    test('tela que fala com a porta `buscaDeCep` usa `BlocoDeCep`', () {
      // A isca de nome acima nao fecha sozinha: da para escrever uma copia
      // privada sem nomear nenhum dos tipos, com `final resposta = await ...`.
      // O que a copia NAO consegue evitar e chamar a porta -- e este caso
      // cobra que quem chama a porta passe pela peca.
      final List<String> reprovas = <String>[];
      for (final (String caminho, String fonte) in _fontesDasTelas()) {
        if (!fonte.contains('buscaDeCep')) continue;
        if (fonte.contains('BlocoDeCep')) continue;
        reprovas.add('  $caminho chama `buscaDeCep` sem `BlocoDeCep`');
      }
      expect(
        reprovas,
        isEmpty,
        reason: 'REPROVA: tela chamando a porta de busca de CEP por fora da '
            'peca compartilhada.\n${reprovas.join('\n')}\n'
            'Quem le a resposta da busca decide se a sigla do estado vale, e '
            'essa decisao e de $_caminhoDoBloco.',
      );
    });

    test('as SEIS telas que tem CEP usam a peca, por LISTA', () {
      final List<String> faltando = <String>[];
      for (final String tela in _seisTelas) {
        final String fonte = _lerDoPacote(tela);
        final bool usa = fonte.contains('BlocoDeCep') &&
            fonte.contains('formulario/bloco_de_cep.dart');
        if (!usa) faltando.add('  $tela');
      }
      expect(
        faltando,
        isEmpty,
        reason: 'REPROVA: estas telas tem o bloco de CEP e nao usam a peca '
            'compartilhada:\n${faltando.join('\n')}\n'
            'Censo por LISTA e nao por contagem de proposito: contar seis '
            'deixaria passar uma tela trocada por outra, e e a tela que '
            'PERDEU o bloco que ninguem procura.',
      );
    });
  });

  // =========================================================================
  // O MECANISMO
  // =========================================================================
  group('o mecanismo do `BlocoDeCep`', () {
    late TextEditingController bairro;
    late TextEditingController cidade;
    late TextEditingController logradouro;
    late String? uf;
    late List<String> preenchidos;
    late List<String> cepsPedidos;

    /// Quantas vezes `atualizar` rodou -- o `setState` da tela.
    late int quadros;

    BlocoDeCep montar({OrigemDosValores? origem}) {
      return BlocoDeCep(
        origem: origem,
        atualizar: (fn) {
          quadros++;
          fn();
        },
        montado: () => true,
        destino: DestinoDoCep(
          logradouro: logradouro,
          chaveDoLogradouro: 'street',
          bairro: bairro,
          chaveDoBairro: 'neighborhood',
          cidade: cidade,
          chaveDaCidade: 'city',
          chaveDoEstado: 'state',
          estadoEscolhido: () => uf,
          aoEscolherEstado: (sigla) => uf = sigla,
          aoPreencher: preenchidos.add,
        ),
      );
    }

    /// A porta de busca com o `uf` que o caso quiser.
    BuscaDeCep porta({
      String uf = 'RJ',
      String bairro = 'Copacabana',
      String cidade = 'Rio de Janeiro',
      String logradouro = 'Avenida Atlântica',
    }) {
      return BuscaDeCep(
        cliente: MockClient((req) async {
          cepsPedidos.add(req.url.pathSegments.join('/'));
          return http.Response(
            '{"logradouro":"$logradouro","bairro":"$bairro",'
            '"localidade":"$cidade","uf":"$uf"}',
            200,
            headers: const <String, String>{
              'content-type': 'application/json; charset=utf-8',
            },
          );
        }),
      );
    }

    setUp(() {
      bairro = TextEditingController();
      cidade = TextEditingController();
      logradouro = TextEditingController();
      uf = null;
      preenchidos = <String>[];
      cepsPedidos = <String>[];
      quadros = 0;
    });

    tearDown(() {
      bairro.dispose();
      cidade.dispose();
      logradouro.dispose();
    });

    test('CONTROLE POSITIVO: com `RJ`, a sigla ENTRA', () {
      // Sem este caso, um bloco que recusasse TODA sigla passaria no caso de
      // `XX` abaixo -- e o campo de estado nunca se preencheria em tela
      // nenhuma, que e um defeito pior que o que foi consertado.
      final BlocoDeCep bloco = montar();
      addTearDown(bloco.dispose);
      bloco.cep.text = '22041-001';
      return bloco.buscar(porta()).then((bool aplicou) {
        expect(aplicou, isTrue);
        expect(uf, 'RJ');
        expect(bairro.text, 'Copacabana');
        expect(cidade.text, 'Rio de Janeiro');
        expect(logradouro.text, 'Avenida Atlântica');
        expect(preenchidos, containsAll(<String>['neighborhood', 'city', 'state']));
      });
    });

    test('O CONSERTO: com `XX`, a sigla NAO entra', () async {
      // DESLIGAR PARA VER REPROVAR: em `lib/formulario/bloco_de_cep.dart`,
      // troque `siglaDeEstadoValida(ufDaBusca)` por `ufDaBusca` em
      // `_escolherOEstado`. Era isto que tres das seis telas faziam.
      final BlocoDeCep bloco = montar();
      addTearDown(bloco.dispose);
      bloco.cep.text = '22041-001';
      await bloco.buscar(porta(uf: 'XX'));
      expect(
        uf,
        isNull,
        reason: 'REPROVA: `XX` nao e um dos 27 estados e entrou no '
            'formulario. Era o defeito de `tela_dados_pessoais`, '
            '`tela_endereco_de_entrega` e `tela_solicitar_plaquinha`.',
      );
      expect(preenchidos, isNot(contains('state')));
      // O resto do endereco CONTINUA preenchendo: a sigla ruim nao derruba a
      // busca inteira, senao o conserto teria tirado valor de quem usa.
      expect(bairro.text, 'Copacabana');
      expect(cidade.text, 'Rio de Janeiro');
    });

    test('a busca dispara no OITAVO digito, e nao antes', () async {
      final BlocoDeCep bloco = montar();
      addTearDown(bloco.dispose);
      for (final String parcial in <String>['2', '22', '2204', '22041-00']) {
        bloco.cep.text = parcial;
        expect(await bloco.buscar(porta()), isFalse, reason: '"$parcial"');
      }
      expect(cepsPedidos, isEmpty);
      expect(quadros, 0);

      bloco.cep.text = '22041-001';
      expect(await bloco.buscar(porta()), isTrue);
      expect(cepsPedidos, hasLength(1));
    });

    test('o MESMO CEP nao e buscado duas vezes', () async {
      final BlocoDeCep bloco = montar();
      addTearDown(bloco.dispose);
      bloco.cep.text = '22041-001';
      expect(await bloco.buscar(porta()), isTrue);
      expect(await bloco.buscar(porta()), isFalse);
      expect(cepsPedidos, hasLength(1));
    });

    test('campo escrito pela PESSOA nao e atropelado', () async {
      final BlocoDeCep bloco = montar();
      addTearDown(bloco.dispose);
      bairro.text = 'Leme';
      cidade.text = 'Niterói';
      uf = 'SP';
      bloco.cep.text = '22041-001';
      await bloco.buscar(porta());
      expect(bairro.text, 'Leme');
      expect(cidade.text, 'Niterói');
      expect(uf, 'SP');
    });

    test('valor que veio DA CONTA, nao tocado, a busca substitui', () async {
      // A regra de 17/10/2026, que as tres telas com `OrigemDosValores` tem e
      // as outras tres nao: a peca recebe a origem de quem a tem, e uma origem
      // VAZIA se comporta como "so campo vazio recebe".
      final OrigemDosValores origem = OrigemDosValores();
      final BlocoDeCep bloco = montar(origem: origem);
      addTearDown(bloco.dispose);
      origem.doGuardado(bairro, 'Leme', 'neighborhood');
      bloco.cep.text = '22041-001';
      await bloco.buscar(porta());
      expect(bairro.text, 'Copacabana');
    });

    test('`naoBuscarDeNovo` cala a busca do CEP que ja esta no campo', () async {
      final BlocoDeCep bloco = montar();
      addTearDown(bloco.dispose);
      bloco.cep.text = '22041-001';
      bloco.naoBuscarDeNovo('22041001');
      expect(bloco.nenhumaBuscaAinda, isFalse);
      expect(await bloco.buscar(porta()), isFalse);
      expect(cepsPedidos, isEmpty);

      // `esquecerABusca` devolve o bloco ao estado de quem nunca buscou -- e o
      // que o pedido da plaquinha faz quando a pessoa troca de pet.
      bloco.esquecerABusca();
      expect(bloco.nenhumaBuscaAinda, isTrue);
      expect(await bloco.buscar(porta()), isTrue);
      expect(cepsPedidos, hasLength(1));
    });
  });
}
