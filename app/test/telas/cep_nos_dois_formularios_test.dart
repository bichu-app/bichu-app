// **O CEP nos DOIS formularios que o cliente cobrou em 18/10/2026**: a
// indicacao de profissional ("no formulario de indicacao do profissional, o
// campo cep nao entrou tambem") e a pagina de avisar que encontrou um pet ("na
// pagina de avisar que encontrou um pet o cep tambem nao entrou").
//
// **ESTES CASOS NAO FORAM RODADOS.** A tarefa que os escreveu proibia rodar
// suite unitaria e de integracao; o que rodou foi `flutter analyze` e os
// portoes offline. Isso precisa ser dito aqui em vez de descoberto depois.
//
// ## Prova por DESLIGAMENTO, e as tres regras que ela protege
//
// Cada grupo abaixo nomeia, no proprio texto, o que mexer no codigo para ver o
// caso reprovar. Isca que ninguem sabe desligar e isca que ninguem sabe se
// mede alguma coisa.
//
//   1. **o CEP PREENCHE** bairro, cidade e estado nos dois formularios. Sem
//      isso o campo existe e nao serve para nada, que e pior que nao existir:
//      a pessoa digita oito digitos e continua digitando o resto;
//   2. **o preenchimento automatico NAO SOBRESCREVE o que a pessoa digitou.**
//      E a regra do proprio `api/busca_de_cep.dart` -- *so campo vazio
//      recebe* --, e e a que se perde primeiro quando alguem "melhora" o
//      preenchimento: a base de CEP erra, e quem esta olhando o endereco e a
//      pessoa;
//   3. **o CEP NAO BLOQUEIA o envio do achado.** Servico de terceiro fora do
//      ar, CEP inexistente, CEP vazio: nenhum dos tres pode prender quem esta
//      com um animal na rua dentro de um formulario.
//
// ## A ASSIMETRIA ENTRE OS DOIS FORMULARIOS, que e o que mais se perde aqui
//
// **A indicacao GUARDA o CEP e o achado NAO**, e isso nao e meio caminho:
//
// - na indicacao o CEP viaja como `DirectorySuggestionInput.postal_code`
//   (opcional, oito digitos sem hifen), acrescentado ao contrato em 18/10 por
//   autorizacao do cliente -- "pode armazenar o cep sim!" --, porque ha
//   DESTINATARIO: a fila de revisao do painel precisa achar o estabelecimento
//   para convida-lo (ADR-0011);
// - no achado **nao ha revisor**, e `Area` do contrato nao tem `postal_code`.
//   Guardar o CEP de onde um animal foi achado seria retencao sem
//   destinatario, e seria mais fino que bairro e cidade -- o teto do ADR-0010.
//   La o CEP e so busca.
//
// Os grupos 3 e 4 abaixo sao as duas iscas que o cliente pediu por extenso
// quando autorizou guardar: **uma que falha se o CEP aparecer em resposta
// publica**, e **uma que falha se o CEP virar obrigatorio na indicacao**.

import 'dart:convert';
import 'dart:io';

import 'package:bichu/roteamento/rotas.dart';
import 'package:bichu/telas/achado/textos_do_achado.dart';
import 'package:bichu/telas/localizacao/textos_da_localizacao.dart';
import 'package:bichu/telas/perto/sugerir_profissional.dart';
import 'package:bichu/widgets/bichu_field.dart';
import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:http/http.dart' as http;

import 'ajuda_de_tela.dart';
import 'registrar_achado_test.dart'
    show avancarParaOPasso2, localizacaoConcedida, tocarEmRegistrar;
import 'sugerir_profissional_test.dart'
    show abrirAPorta, abrirPerto, diretorioVazio, escolherNaLista;

/// O que a rede viu, para os casos poderem separar "a busca falhou" de "o
/// envio falhou".
class _Registro {
  final List<String> chamadasDeCep = <String>[];
  final List<Map<String, String>> cabecalhosDeCep = <Map<String, String>>[];
  final List<Map<String, dynamic>> corposEnviados = <Map<String, dynamic>>[];
  final List<Map<String, dynamic>> corposDeAchado = <Map<String, dynamic>>[];
  int registrosDeAchado = 0;
}

/// A rede dos dois formularios, com os dois servicos de CEP.
///
/// `cepFora` derruba **so** a busca de CEP: as rotas da nossa API continuam de
/// pe, e e assim que a isca 3 separa as duas coisas.
Future<http.Response> Function(http.Request) _rede(
  _Registro registro, {
  bool cepFora = false,
  bool cepInexistente = false,
}) {
  return (req) async {
    // **Nenhum destes dois e a nossa API**, e nenhum recebe `Authorization`.
    if (req.url.host == 'viacep.com.br' || req.url.host == 'brasilapi.com.br') {
      registro.chamadasDeCep.add(req.url.toString());
      registro.cabecalhosDeCep.add(Map<String, String>.from(req.headers));
      if (cepFora) throw const SocketException('servico de CEP fora do ar');
      if (cepInexistente) return json200(<String, dynamic>{'erro': 'true'});
      return json200(<String, dynamic>{
        'cep': '22041-001',
        'logradouro': 'Avenida Atlântica',
        'complemento': 'até 609 - lado ímpar',
        'bairro': 'Copacabana',
        'localidade': 'Rio de Janeiro',
        'uf': 'RJ',
      });
    }

    final caminho = req.url.path;
    if (caminho.endsWith('/reference-data')) {
      return json200(referenciaDeTeste());
    }
    if (caminho == '/v1/pets' && req.method == 'GET') {
      return json200(<String, dynamic>{'items': <dynamic>[]});
    }
    if (caminho == '/v1/directory/entries' && req.method == 'GET') {
      return json200(diretorioVazio());
    }
    if (caminho == '/v1/directory/suggestions' && req.method == 'POST') {
      registro.corposEnviados.add(jsonDecode(req.body) as Map<String, dynamic>);
      return json200(
        <String, dynamic>{
          'reference': 'Xk3Qm9TbPz7Lw2Rv5Nd8Hq',
          'state': 'pending',
          'created_at': '2026-10-18T12:00:00Z',
        },
        status: 201,
      );
    }
    if (caminho == '/v1/found-reports' && req.method == 'POST') {
      registro.registrosDeAchado += 1;
      registro.corposDeAchado.add(jsonDecode(req.body) as Map<String, dynamic>);
      return json200(<String, dynamic>{
        'id': '0199a0d0-0000-7000-8000-000000000001',
        'status': 'open',
        'species': 'dog',
        'size': 'medium',
        'found_at': '2026-10-18T12:00:00Z',
        'area_label': 'Copacabana, Rio de Janeiro',
        'has_location': false,
        'photo_url': null,
        'notes': null,
        'conversation_id': null,
        'created_at': '2026-10-18T12:00:00Z',
      }, status: 201);
    }
    return problema('not-found', 404);
  };
}

/// O `TextField` do [BichuField] cujo rotulo e [rotulo].
///
/// Pelo rotulo DECLARADO no widget, e nao por `widgetWithText`: o rotulo do
/// `BichuField` e um `Text` irmao do campo, e nao um descendente dele.
Finder _campo(String rotulo) => find.descendant(
      of: find.byWidgetPredicate((w) => w is BichuField && w.rotulo == rotulo),
      matching: find.byType(TextField),
    );

String _textoDoCampo(WidgetTester tester, String rotulo) =>
    tester.widget<TextField>(_campo(rotulo)).controller?.text ?? '';

/// Rola ate o campo, venha ele de cima ou de baixo da dobra.
///
/// Os casos preenchem os campos **fora da ordem da tela** de proposito -- a
/// 1b digita a cidade e o bairro ANTES do CEP, e o CEP esta ACIMA dos dois na
/// tela --, e `scrollUntilVisible` so procura num sentido: com o passo
/// positivo ele roda ate o fim da lista sem achar o que ficou para tras e
/// estoura `Bad state: No element`. Voltar ao topo e procurar para baixo
/// acerta nos dois casos, e e o que a pessoa faz.
Future<void> _rolarAteOCampo(WidgetTester tester, String rotulo) async {
  final alvo = _campo(rotulo);
  if (alvo.evaluate().isNotEmpty) {
    await tester.ensureVisible(alvo);
    await tester.pumpAndSettle();
    return;
  }
  final rolagem = find.byType(Scrollable).first;
  for (var i = 0; i < 6 && alvo.evaluate().isEmpty; i++) {
    await tester.drag(rolagem, const Offset(0, 3000));
    await tester.pumpAndSettle();
  }
  await rolarAte(tester, alvo);
}

Future<void> _digitar(
  WidgetTester tester,
  String rotulo,
  String valor,
) async {
  await _rolarAteOCampo(tester, rotulo);
  await tester.enterText(_campo(rotulo), valor);
  await tester.pumpAndSettle();
}

/// Abre o formulario de indicacao de profissional, pela porta do `Perto`.
Future<void> _abrirAIndicacao(
  WidgetTester tester,
  _Registro registro, {
  bool cepFora = false,
}) async {
  await abrirPerto(tester, rede: _rede(registro, cepFora: cepFora));
  // A porta do `Perto` mudou de forma duas vezes: deixou de ser o botao de
  // largura total do corpo em 18/10/2026 e virou icone da BARRA DE TOPO, e em
  // 19/10 saiu da barra e virou ACAO FLUTUANTE no corpo (decisao do cliente:
  // *"O botao criar sai da barra"*). O texto `Indicar quem atende bem` nao
  // esta na tela em nenhuma das duas, e `tocar` sobre ele estourava `Bad
  // state: No element`. `abrirAPorta` mora em
  // `sugerir_profissional_test.dart` justamente para a porta ter um lugar so
  // -- e e por isso que as duas mudancas custaram UMA edicao aqui: nenhuma.
  await abrirAPorta(tester);
  expect(find.byType(TelaSugerirProfissional), findsOneWidget);
}

/// Preenche o resto da indicacao (tudo menos o CEP) e envia.
///
/// O CEP fica FORA deste ajudante de proposito: cada caso digita o seu antes
/// de chamar, e e justamente o CEP que esta sendo medido.
Future<void> _preencherORestoEEnviar(WidgetTester tester) async {
  // Sobe ate o PRIMEIRO campo antes de comecar. Quem chamou acabou de digitar
  // o CEP, e o campo do CEP esta abaixo de `Nome do lugar`: o `ListView` rolou
  // para baixo, `Nome do lugar` saiu da arvore e `rolarAte` com passo POSITIVO
  // procuraria para baixo o que ficou para tras -- `scrollUntilVisible` roda
  // ate o fim e estoura `Bad state: No element`. O passo negativo existe em
  // `rolarAte` (`ajuda_de_tela.dart`, linhas 711-730) exatamente para isso.
  await rolarAte(tester, _campo('Nome do lugar'), passo: -120);
  await _digitar(tester, 'Nome do lugar', 'Clínica Veterinária Bichinho');
  // Pelo `InkWell` do seletor, e nao pelo `Text` do rotulo: o rotulo nao abre
  // a folha. Ver `escolherNaLista`, em `sugerir_profissional_test.dart`.
  await escolherNaLista(tester, 'O que eles fazem', 'Clínica');
  await _digitar(tester, 'Cidade', 'Rio de Janeiro');
  // **O estado agora e ESCOLHA, e nao digitacao** (cliente, 17/10/2026).
  await escolherEstadoNaLista(tester, 'RJ');
  await escolherNaLista(tester, 'Como entrar em contato', 'Telefone');
  await _digitar(tester, 'Telefone', '+5521988887777');
  await rolarAte(tester, find.text(TelaSugerirProfissional.rotuloDeIndicar));
  await tocar(tester, find.text(TelaSugerirProfissional.rotuloDeIndicar));
}

/// Abre o passo 2 do achado, no ramo DIGITADO (sem coordenada).
Future<void> _abrirOPasso2Digitado(
  WidgetTester tester,
  _Registro registro, {
  bool cepFora = false,
  bool cepInexistente = false,
}) async {
  await abrirOApp(
    tester,
    rede: _rede(registro, cepFora: cepFora, cepInexistente: cepInexistente),
    deposito: depositoLogado(),
    localizacao: localizacaoConcedida(),
  );
  await irPara(tester, Rotas.registrarAchado);
  await rolarAte(tester, find.text('Cão'));
  await tocar(tester, find.text('Cão'));
  await rolarAte(tester, find.text('Médio'));
  await tocar(tester, find.text('Médio'));
  await avancarParaOPasso2(tester);
  await rolarAte(tester, find.text(TextosDaLocalizacao.preferoDigitarOBairro));
  await tocar(tester, find.text(TextosDaLocalizacao.preferoDigitarOBairro));
}

void main() {
  // =========================================================================
  // FORMULARIO 1 -- INDICAR PROFISSIONAL (`Perto`)
  // =========================================================================
  group('indicar profissional: o CEP preenche e nao atropela', () {
    // -----------------------------------------------------------------------
    // ISCA 1a -- O CEP PREENCHE
    //
    // DESLIGAR PARA VER REPROVAR: em
    // `lib/telas/perto/sugerir_profissional.dart`, apague as tres chamadas de
    // `_preencherSeVazio` dentro de `_buscarOCep`. A busca continua saindo (a
    // linha de texto ainda aparece) e **nenhum campo se preenche** -- que e
    // exatamente o defeito que o cliente reclamou, com o campo na tela.
    // -----------------------------------------------------------------------
    testWidgets('1a. o CEP preenche bairro, cidade e UF', (tester) async {
      final registro = _Registro();
      await _abrirAIndicacao(tester, registro);

      await _digitar(tester, TelaSugerirProfissional.rotuloDoCep, '22041001');

      expect(
        registro.chamadasDeCep,
        hasLength(1),
        reason: 'REPROVA: o campo de CEP nao buscou nada. O cliente pediu o '
            'ViaCEP em todo cadastro com CEP, e um campo que so guarda oito '
            'digitos nao e o que ele pediu.',
      );
      expect(
        registro.chamadasDeCep.single,
        contains('viacep.com.br'),
        reason: 'REPROVA: a PRINCIPAL e o ViaCEP, por nome, na decisao do '
            'cliente de 17/10. A BrasilAPI e reserva e nao pode ser a '
            'primeira.',
      );
      expect(_textoDoCampo(tester, 'Bairro'), 'Copacabana');
      expect(_textoDoCampo(tester, 'Cidade'), 'Rio de Janeiro');
      // O estado virou SELETOR: a afirmacao continua sendo a sigla, que e o
      // que viaja no corpo, e nao o nome que a tela desenha.
      expect(siglaEscolhidaNoSeletor(tester), 'RJ');
    });

    // -----------------------------------------------------------------------
    // ISCA 1b -- O PREENCHIMENTO NAO SOBRESCREVE O DIGITADO
    //
    // DESLIGAR PARA VER REPROVAR: em `_preencherSeVazio`, apague a condicao
    // `|| campo.text.trim().isNotEmpty`. A tela passa a atropelar o que a
    // pessoa escreveu, e este caso reprova nas duas primeiras asserções.
    // -----------------------------------------------------------------------
    testWidgets('1b. o que a pessoa digitou VENCE a base de CEP',
        (tester) async {
      final registro = _Registro();
      await _abrirAIndicacao(tester, registro);

      // Ela escreveu a cidade e o bairro ANTES de digitar o CEP: a clinica
      // fica na cidade vizinha, e ela sabe disso melhor que a base.
      await _digitar(tester, 'Cidade', 'Niterói');
      await _digitar(tester, 'Bairro', 'Icaraí');
      await _digitar(tester, TelaSugerirProfissional.rotuloDoCep, '22041001');

      expect(
        _textoDoCampo(tester, 'Cidade'),
        'Niterói',
        reason: 'REPROVA: o preenchimento automatico atropelou a cidade que a '
            'pessoa digitou. A regra de `api/busca_de_cep.dart` e preencher '
            'SO campo vazio, e ela existe porque a base erra e quem esta '
            'olhando o endereco e a pessoa.',
      );
      expect(_textoDoCampo(tester, 'Bairro'), 'Icaraí');

      // E o campo vazio recebeu, no mesmo ato: a regra e "so o vazio", e nao
      // "nada quando algum estiver escrito". **O estado e seletor agora**, e a
      // regra passou a valer sobre ele igual: escolha vazia recebe.
      expect(
        siglaEscolhidaNoSeletor(tester),
        'RJ',
        reason: 'REPROVA: um campo escrito desligou o preenchimento dos '
            'outros. A regra e por CAMPO, e nao por formulario.',
      );

      // E o que a busca preencheu continua TROCAVEL -- antes isso se media
      // digitando outra sigla; agora se mede escolhendo outro estado na lista,
      // que e a mesma afirmacao: a busca sugere e a pessoa decide.
      await escolherEstadoNaLista(tester, 'SP');
      expect(siglaEscolhidaNoSeletor(tester), 'SP');
    });

    // -----------------------------------------------------------------------
    // ISCA 1c -- O CEP DIGITADO CHEGA AO SERVIDOR
    //
    // DESLIGAR PARA VER REPROVAR: em `DiretorioApi.corpoDaSugestao`, apague a
    // linha `if (cepLimpo != null && _oitoDigitos.hasMatch(cepLimpo))
    // 'postal_code': cepLimpo,`. A tela continua preenchendo os campos e o
    // envio continua dando 201 -- **o CEP so deixa de ser guardado**, em
    // silencio, que e a forma de defeito que nenhuma verificacao de tela pega.
    // -----------------------------------------------------------------------
    testWidgets('1c. o CEP digitado VIAJA no corpo, como `postal_code`',
        (tester) async {
      final registro = _Registro();
      await _abrirAIndicacao(tester, registro);

      await _digitar(tester, TelaSugerirProfissional.rotuloDoCep, '22041001');
      await _preencherORestoEEnviar(tester);

      expect(registro.corposEnviados, hasLength(1));
      expect(
        registro.corposEnviados.single['postal_code'],
        '22041001',
        reason: 'REPROVA: o CEP que a pessoa digitou nao chegou ao servidor. O '
            'cliente autorizou guardar em 18/10, e o destinatario e a fila de '
            'revisao do painel -- sem este campo a revisao nao tem como achar '
            'o estabelecimento para convida-lo (ADR-0011).',
      );
    });

    // -----------------------------------------------------------------------
    // ISCA 1c2 -- CEP PELA METADE NAO VIRA RECUSA, E NAO VAI NO CORPO
    //
    // O contrato declara oito-digitos-sem-hifen e `additionalProperties: false`: mandar
    // `postal_code: '0543'` levaria um 400 para quem apenas parou de digitar.
    //
    // DESLIGAR PARA VER REPROVAR: em `corpoDaSugestao`, troque a guarda de
    // `_oitoDigitos.hasMatch(cepLimpo)` por `cepLimpo.isNotEmpty`.
    // -----------------------------------------------------------------------
    testWidgets('1c2. CEP incompleto nao vai no corpo e nao recusa o envio',
        (tester) async {
      final registro = _Registro();
      await _abrirAIndicacao(tester, registro);

      await _digitar(tester, TelaSugerirProfissional.rotuloDoCep, '2204');
      await _preencherORestoEEnviar(tester);

      expect(
        registro.corposEnviados,
        hasLength(1),
        reason: 'REPROVA: um CEP pela metade impediu a indicacao. O campo e '
            'opcional, e campo opcional incompleto e campo que nao existe.',
      );
      expect(
        registro.corposEnviados.single.containsKey('postal_code'),
        isFalse,
        reason: 'REPROVA: foi enviado um `postal_code` que nao bate com o '
            '`pattern` oito-digitos-sem-hifen do contrato. O servidor responderia 400, e '
            'a pessoa so tinha parado de digitar.',
      );
      expect(
        registro.chamadasDeCep,
        isEmpty,
        reason: 'REPROVA: a busca saiu com menos de oito digitos, gastando '
            'chamada em servico gratuito de terceiro por nada.',
      );
    });

    // -----------------------------------------------------------------------
    // ISCA 1c4 -- O CEP NAO PODE VIRAR OBRIGATORIO
    //
    // O par desta isca esta no servidor
    // (`src/modules/professionals/domain/cep-da-sugestao-nao-sai.test.ts`),
    // onde ela olha o `required` do contrato. Aqui ela olha a TELA, e as duas
    // precisam existir: o contrato pode continuar certo e a tela cobrar o
    // campo por conta propria, que e o defeito mais provavel dos dois.
    //
    // DESLIGAR PARA VER REPROVAR: acrescente `semCep` a `_Impedimento` e
    // devolva-o em `_impedimento` quando `_cep.text` estiver vazio.
    // -----------------------------------------------------------------------
    testWidgets('1c4. ISCA — sem CEP nenhum, a indicacao vai do mesmo jeito',
        (tester) async {
      final registro = _Registro();
      await _abrirAIndicacao(tester, registro);

      await _preencherORestoEEnviar(tester);

      expect(
        registro.corposEnviados,
        hasLength(1),
        reason: 'REPROVA: o CEP virou exigencia da tela. Quem indica uma '
            'clinica de outro bairro quase sempre nao sabe o CEP dela, e '
            'cobra-lo troca uma indicacao por um campo inventado -- o mesmo '
            'juizo que deixou o bairro opcional.',
      );
      expect(
        registro.corposEnviados.single.containsKey('postal_code'),
        isFalse,
        reason: 'REPROVA: foi enviado um `postal_code` que ninguem digitou.',
      );
      expect(
        find.text(TelaSugerirProfissional.recebido),
        findsOneWidget,
        reason: 'REPROVA: a tela nao deu o recibo. Sem CEP a indicacao e tao '
            'valida quanto com, e o recibo e o que diz que ela foi para a '
            'fila de conferencia.',
      );
    });

    // -----------------------------------------------------------------------
    // ISCA 1c3 -- A MASCARA NA TELA, OITO DIGITOS NO CORPO
    //
    // **A isca da divergencia**, pela tela e nao pela funcao pura (essa esta
    // em `app/test/formato/cep_test.dart`). Ela existe porque as duas podem
    // estar certas sozinhas e erradas juntas: basta a tela mandar
    // `_cep.text` em vez de passar por `cepParaOContrato`, e o resultado e um
    // 400 no aparelho de quem preencheu tudo certo -- com a forma CERTA na
    // tela, que e o que torna o defeito tao dificil de ver.
    //
    // DESLIGAR PARA VER REPROVAR: em `DiretorioApi.corpoDaSugestao`, troque
    // `cepParaOContrato(cep)` por `cep`. A tela nao muda em nada, a mascara
    // continua perfeita, e o campo enviado passa a ser `22041-001`.
    // -----------------------------------------------------------------------
    testWidgets(
        '1c3. ISCA — a tela mostra `22041-001` e o corpo leva `22041001`',
        (tester) async {
      final registro = _Registro();
      await _abrirAIndicacao(tester, registro);

      // Digitacao CONTINUA, sem hifen: e assim que a pessoa digita.
      await _digitar(tester, TelaSugerirProfissional.rotuloDoCep, '22041001');

      expect(
        _textoDoCampo(tester, TelaSugerirProfissional.rotuloDoCep),
        '22041-001',
        reason: 'REPROVA: a mascara nao apareceu no campo. O cliente pediu '
            'mascara no CEP de todos os formularios, e quem digita oito '
            'digitos seguidos nao digita o hifen.',
      );

      await _preencherORestoEEnviar(tester);

      expect(
        registro.corposEnviados.single['postal_code'],
        '22041001',
        reason: 'REPROVA: O QUE A TELA MOSTRA FOI ENVIADO AO SERVIDOR. '
            '`DirectorySuggestionInput.postal_code` declara oito digitos sem '
            'hifen, entao `22041-001` volta como 400 -- e nenhum portao do '
            'projeto pega isso: `oasdiff` compara contratos, '
            '`verificar-conformidade-do-app` compara tipos, e nenhum dos dois '
            'olha o que o controlador guarda.',
      );
    });

    // -----------------------------------------------------------------------
    // ISCA 1d -- SERVICO FORA DO AR NAO IMPEDE A INDICACAO
    //
    // DESLIGAR PARA VER REPROVAR: em `_buscarOCep`, troque o `setState` final
    // por `_errosDeCampo = {'city': 'Confira o CEP.'}` quando
    // `resposta.endereco == null`. O botao continua vivo, mas a tela passa a
    // acusar campo por causa de um servico de terceiro.
    // -----------------------------------------------------------------------
    testWidgets('1d. ISCA — CEP fora do ar nao marca campo nem trava o envio',
        (tester) async {
      final registro = _Registro();
      await _abrirAIndicacao(tester, registro, cepFora: true);

      await _digitar(tester, TelaSugerirProfissional.rotuloDoCep, '22041001');
      expect(
        find.text(TelaSugerirProfissional.buscaIndisponivel),
        findsOneWidget,
        reason: 'REPROVA: a tela ficou calada sobre a busca que nao deu. Os '
            'tres desfechos querem dizer "digite voce mesmo", e silencio deixa '
            'a pessoa esperando.',
      );

      // A mesma sequencia do ajudante, e nao uma copia dela: a copia tocava
      // no `Text` do rotulo do seletor, que nao abre a folha.
      await _preencherORestoEEnviar(tester);

      expect(
        registro.corposEnviados,
        hasLength(1),
        reason: 'REPROVA: um servico gratuito de terceiro fora do ar impediu '
            'alguem de indicar um profissional. A busca de CEP e conveniencia '
            'de digitacao, e nunca pre-requisito.',
      );
    });
  });

  // =========================================================================
  // FORMULARIO 2 -- AVISAR QUE ENCONTROU UM PET (passo 2)
  // =========================================================================
  group('achado: o CEP preenche, sobrevive ao vai e volta, e nunca trava',
      () {
    // -----------------------------------------------------------------------
    // ISCA 2a -- O CEP PREENCHE, NO PASSO 2
    //
    // DESLIGAR PARA VER REPROVAR: em
    // `lib/telas/localizacao/captura_de_localizacao.dart`, apague as duas
    // chamadas de `_preencherSeVazio` e a atribuicao de `_uf` dentro de
    // `_buscarOCep`.
    // -----------------------------------------------------------------------
    testWidgets('2a. o CEP preenche bairro, cidade e estado', (tester) async {
      final registro = _Registro();
      await _abrirOPasso2Digitado(tester, registro);

      await _digitar(tester, TextosDaLocalizacao.rotuloCep, '22041001');

      expect(registro.chamadasDeCep, hasLength(1));
      expect(
        _textoDoCampo(tester, TextosDaLocalizacao.rotuloBairro),
        'Copacabana',
      );
      expect(
        _textoDoCampo(tester, TextosDaLocalizacao.rotuloCidade),
        'Rio de Janeiro',
        reason: 'REPROVA: a cidade e o UNICO campo que faz o `onde` existir '
            '(`Area.required: [city]`). Um CEP que nao a preenche nao poupa a '
            'digitacao que importa.',
      );
      expect(
        find.text('Rio de Janeiro'),
        findsWidgets,
        reason: 'REPROVA: o estado preenchido pelo CEP nao chegou ao `Onde` -- '
            'o seletor de UF nao notifica sozinho, e sem o `_publicar()` '
            'depois da busca a sigla fica na tela e nao viaja.',
      );
    });

    // -----------------------------------------------------------------------
    // ISCA 2b -- O CEP NAO ATROPELA O DIGITADO, NEM A COORDENADA
    //
    // DESLIGAR PARA VER REPROVAR (duas formas):
    //   - apague `|| campo.text.trim().isNotEmpty` de `_preencherSeVazio`: o
    //     bairro digitado e atropelado;
    //   - acrescente `_ponto = null;` dentro do `setState` de `_buscarOCep`:
    //     a coordenada que a pessoa concedeu desaparece, e a ultima asserção
    //     reprova.
    // -----------------------------------------------------------------------
    testWidgets('2b. nem o digitado nem a localizacao do aparelho sao trocados',
        (tester) async {
      final registro = _Registro();
      await abrirOApp(
        tester,
        rede: _rede(registro),
        deposito: depositoLogado(),
        localizacao: localizacaoConcedida(),
      );
      await irPara(tester, Rotas.registrarAchado);
      await rolarAte(tester, find.text('Cão'));
      await tocar(tester, find.text('Cão'));
      await rolarAte(tester, find.text('Médio'));
      await tocar(tester, find.text('Médio'));
      await avancarParaOPasso2(tester);

      // A pessoa USOU a localizacao do aparelho: ha coordenada, e nenhum
      // campo de texto foi preenchido por ela (ADR-0006 proibe derivar
      // bairro de coordenada, e e por isso que os campos continuam na tela).
      await rolarAte(
        tester,
        find.text(TextosDaLocalizacao.usarMinhaLocalizacao),
      );
      await tocar(tester, find.text(TextosDaLocalizacao.usarMinhaLocalizacao));
      expect(
        _textoDoCampo(tester, TextosDaLocalizacao.rotuloBairro),
        isEmpty,
        reason: 'REPROVA: a coordenada virou bairro. Esse e o sentido que o '
            'ADR-0006 proibe, e nao ha pacote no binario que o faca -- se este '
            'caso reprovar, alguem o trouxe.',
      );

      // Ela digitou o bairro que sabe, e so depois o CEP.
      await _digitar(
        tester,
        TextosDaLocalizacao.rotuloBairro,
        'Leme',
      );
      await _digitar(tester, TextosDaLocalizacao.rotuloCep, '22041001');

      expect(
        _textoDoCampo(tester, TextosDaLocalizacao.rotuloBairro),
        'Leme',
        reason: 'REPROVA: o CEP atropelou o bairro digitado. So campo vazio '
            'recebe.',
      );
      expect(
        _textoDoCampo(tester, TextosDaLocalizacao.rotuloCidade),
        'Rio de Janeiro',
        reason: 'REPROVA: o campo vazio deixou de receber porque um vizinho '
            'estava escrito. A regra e por campo.',
      );
      // A coordenada continua de pe: `Registrar` segue habilitado e o aviso
      // de precisao do ponto continua na tela.
      // O pedaco COMUM das duas redacoes do aviso do ponto, e nao
      // `pontoSemPrecisao`: `localizacaoConcedida()` devolve um ponto COM
      // margem, e a tela usa `pontoComPrecisao(metros)`
      // (`textos_da_localizacao.dart`, linhas 65-71). A constante sem margem
      // so aparece quando a margem e desconhecida -- a isca pedia a redacao
      // que este duble nunca produz. `Ninguém vê esse ponto` esta nas duas e
      // **so** e escrito quando existe ponto, que e o que o caso afirma.
      await rolarAte(
        tester,
        find.textContaining('Ninguém vê esse ponto'),
        passo: -120,
      );
      expect(
        find.textContaining('Ninguém vê esse ponto'),
        findsWidgets,
        reason: 'REPROVA: a busca de CEP apagou ou substituiu a coordenada que '
            'o aparelho mediu. O CEP escreve TEXTO e nunca ponto; os dois nao '
            'disputam o mesmo campo, e esta asserção e o que garante que '
            'continuam sem disputar.',
      );
    });

    // -----------------------------------------------------------------------
    // ISCA 2c -- O CEP SOBREVIVE AO VAI E VOLTA ENTRE OS PASSOS
    //
    // O cliente pediu em 17/10: "pode manter o formulario preenchido, se o
    // usuario for para a segunda pagina e voltar".
    //
    // DESLIGAR PARA VER REPROVAR: em `tela_registrar_achado.dart`, troque o
    // `IndexedStack` por `_passo == 0 ? _Passo1(...) : _Passo2(...)`. O
    // controlador do CEP morre com a desmontagem, junto de bairro e cidade.
    // -----------------------------------------------------------------------
    testWidgets('2c. voltar ao passo 1 e avancar NAO limpa o CEP digitado',
        (tester) async {
      final registro = _Registro();
      await _abrirOPasso2Digitado(tester, registro);
      await _digitar(tester, TextosDaLocalizacao.rotuloCep, '22041001');

      final voltar = find.widgetWithText(
        OutlinedButton,
        TextosDoAchado.voltarAoPasso1,
      );
      await rolarAte(tester, voltar);
      await tocar(tester, voltar);
      await avancarParaOPasso2(tester);

      // `22041-001`, COM a mascara: o campo de CEP mostra o hifen por decisao
      // do cliente de 18/10 ("coloque mascara no campo cep de todos os
      // formularios"), e a isca 1c3 deste mesmo arquivo afirma exatamente
      // isso -- a tela mostra `22041-001` e o corpo leva `22041001`. Pedir
      // `22041001` AQUI contradizia a 1c3, que passa.
      expect(
        _textoDoCampo(tester, TextosDaLocalizacao.rotuloCep),
        '22041-001',
        reason: 'REPROVA: o vai e volta entre os passos apagou o CEP. O '
            'cliente pediu o formulario preservado, e o campo novo nao e '
            'excecao.',
      );
      expect(
        _textoDoCampo(tester, TextosDaLocalizacao.rotuloCidade),
        'Rio de Janeiro',
        reason: 'REPROVA: a cidade que o CEP preencheu se perdeu na volta.',
      );
      expect(
        registro.chamadasDeCep,
        hasLength(1),
        reason: 'REPROVA: a volta ao passo 2 disparou a busca DE NOVO. '
            '`_cepJaBuscado` existe para isso: servico gratuito de terceiro '
            'nao se consulta duas vezes pelo mesmo CEP.',
      );
    });

    // -----------------------------------------------------------------------
    // ISCA 2d -- O CEP NAO PODE BLOQUEAR O REGISTRO DO ACHADO
    //
    // E a isca que o cliente pediu por extenso. Quem esta com um animal na
    // rua nao fica preso num formulario porque um servico gratuito caiu.
    //
    // DESLIGAR PARA VER REPROVAR (qualquer das duas):
    //   - acrescente `semCep` a `ImpedimentoDeRegistrar` e devolva-o em
    //     `impedimentoDoPasso2` quando o CEP estiver vazio;
    //   - faca `_buscarOCep` lancar no caminho `indisponivel` em vez de
    //     seguir.
    //
    // Nos dois casos `Registrar` para de registrar, e `registrosDeAchado`
    // fica em zero.
    // -----------------------------------------------------------------------
    testWidgets(
        '2d. ISCA — CEP vazio e CEP fora do ar NAO impedem registrar o achado',
        (tester) async {
      final registro = _Registro();
      await _abrirOPasso2Digitado(tester, registro, cepFora: true);

      // Ela tenta o CEP, o servico esta fora, e ela digita a cidade a mao.
      await _digitar(tester, TextosDaLocalizacao.rotuloCep, '22041001');
      expect(
        find.text(TextosDaLocalizacao.buscaDoCepIndisponivel),
        findsOneWidget,
      );
      await _digitar(
        tester,
        TextosDaLocalizacao.rotuloCidade,
        'Rio de Janeiro',
      );
      // `passo: -120`, para CIMA: `Quando?` e o PRIMEIRO bloco do passo 2
      // (`tela_registrar_achado.dart`, linhas 659-665) e a localizacao vem depois
      // dele, entao a lista ja rolou para baixo quando se chega aqui. Com passo
      // positivo o `scrollUntilVisible` procura para baixo o que ficou para tras,
      // roda ate o fim e estoura `Bad state: No element`.
      await rolarAte(tester, find.text('Agora'), passo: -120);
      await tocar(tester, find.text('Agora'));

      await tocarEmRegistrar(tester);

      expect(
        registro.registrosDeAchado,
        1,
        reason: 'REPROVA: o CEP entrou no caminho que habilita `Registrar`. '
            'Ele nao esta em `ImpedimentoDeRegistrar`, nao entra em '
            '`montarOnde` e nenhum desfecho da busca pode desabilitar o '
            'botao -- quem esta com um animal na rua nao pode ficar preso '
            'aqui.',
      );
      // **A ASSIMETRIA, medida no corpo do ACHADO e nao no da indicacao.**
      // A indicacao GUARDA o CEP (`DirectorySuggestionInput.postal_code`,
      // 18/10); o achado nao, porque la nao ha revisor -- `Area` do contrato
      // nao tem `postal_code`, e `additionalProperties` nao salva ninguem:
      // o Ajv do Fastify roda com `removeAdditional: true` e APAGARIA o campo
      // em silencio, o que e pior que recusar.
      final corpo = registro.corposDeAchado.single;
      final area = corpo['area'] as Map<String, dynamic>?;
      expect(
        corpo.containsKey('postal_code'),
        isFalse,
        reason: 'REPROVA: o achado passou a mandar CEP. Guardar o CEP de onde '
            'um animal foi achado e retencao SEM DESTINATARIO -- nao ha '
            'revisor neste caminho --, e e mais fino que bairro e cidade, que '
            'e o teto do ADR-0010 para superficie publica.',
      );
      expect(
        area?.containsKey('postal_code'),
        isFalse,
        reason: 'REPROVA: o CEP entrou dentro de `area`. `Area` do contrato '
            'declara `city`, `neighborhood` e `state`, e nada mais.',
      );
      expect(
        area?['city'],
        'Rio de Janeiro',
        reason: 'REPROVA: a cidade digitada a mao nao chegou. O caso inteiro '
            'depende de o envio ter acontecido COM o servico de CEP fora.',
      );
    });
  });
}
