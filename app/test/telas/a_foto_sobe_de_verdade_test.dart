// F1.6 — a foto escolhida em F1.4 de fato sai do aparelho.
//
// O DEFEITO QUE ESTE ARQUIVO EXISTE PARA IMPEDIR DE VOLTAR, e ele e real:
// ate 22/09/2026 **nenhum caminho do app enviava bytes**.
// `PetsApi.intencaoDeFotoDoPet` estava escrita desde a BICHUS-62 e nunca era
// chamada, e esta tela ja mostrava "A foto de Nina ainda está sendo enviada"
// -- uma frase sobre um envio inexistente. A tela nao mentia por erro de
// texto: ela anunciava o efeito de uma chamada que ninguem fazia. O cliente
// cadastrou pet num celular fisico naquele dia e isso passou despercebido,
// porque a tela nao muda quando o envio nao acontece.
//
// POR QUE OS CASOS DAQUI CONTAM REQUISICOES, e nao chamadas de metodo. Um caso
// que afirme "a tela chama `enviar()`" fica verde com o furo inteiro de pe:
// basta a tela chamar um `enviar` que nao envia. E foi assim que o furo
// sobreviveu a uma suite de 750 casos. O que se mede aqui e o efeito -- quantos
// pedidos chegaram ao ARMAZENAMENTO, que e outro host, com que corpo.
//
// A isca correspondente: comentar a chamada a `_enviarAFoto()` em
// `didChangeDependencies` de `tela_pet_cadastrado.dart` leva o contador a
// zero e reprova o primeiro caso deste arquivo. Nenhum dos 750 casos
// anteriores muda de cor com essa remocao.

import 'dart:convert';

import 'package:bichu/api/modelos_pet.dart';
import 'package:bichu/dispositivo/camera_e_galeria.dart';
import 'package:bichu/roteamento/rotas.dart';
import 'package:bichu/telas/pet/resultado_do_cadastro.dart';
import 'package:flutter/material.dart';
import 'package:flutter/semantics.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:http/http.dart' as http;

import 'ajuda_de_tela.dart';

/// O armazenamento e **outro host**, como em producao. Nao e enfeite de
/// cenario: e o que permite separar "pedido a nossa API" de "bytes da foto", e
/// e o que torna verificavel que o token da sessao nao vai junto.
const String _armazenamento = 'https://objetos.exemplo.test/bichu-privado';

Pet _nina() {
  return const Pet(
    id: '018f7c1e-7a2b-7c3d-9e4f-2b1a0c9d8e7f',
    nome: 'Nina',
    especie: Especie.cao,
    redacoesDeCuidados: <RedacaoDeCuidados>[],
  );
}

/// A resposta de `POST /v1/pets/{petId}/tags`, no formato do contrato.
http.Response _tagEmitida() {
  return json200(
    <String, dynamic>{
      'id': '11111111-2222-3333-4444-555555555555',
      'status': 'active',
      'code_suffix': '1QD',
      'created_at': '2026-09-22T18:20:00Z',
      'code': 'BCH-7K2M-91QD',
      'url': 'https://bichu.app/t/BCH-7K2M-91QD',
    },
    status: 201,
  );
}

/// `UploadIntent` do contrato, forma `POST` com politica de formulario.
http.Response _autorizacao() {
  return json200(
    <String, dynamic>{
      'upload_id': 'up-42',
      'method': 'POST',
      'url': _armazenamento,
      'fields': <String, String>{
        'key': 'privado/pets/nina.jpg',
        'Content-Type': 'image/jpeg',
        'policy': 'politica-assinada',
      },
      'expires_at': '2026-09-22T18:30:00Z',
      'max_bytes': 10485760,
    },
    status: 201,
  );
}

/// O que saiu na rede, separado por destino, mais o que foi LEMBRADO em disco.
class _Rede {
  final List<http.Request> pedidos = <http.Request>[];

  /// O registro de fotos pendentes do app montado, com o conteudo a vista.
  late final DepositoDeFotosEmMemoria registro;

  Iterable<http.Request> get aoArmazenamento =>
      pedidos.where((p) => p.url.toString().startsWith(_armazenamento));

  Iterable<http.Request> get aApi =>
      pedidos.where((p) => p.url.host == 'localhost');
}

/// Abre F1.6 com o app inteiro montado e a foto pendente que F1.5 entregaria.
///
/// Pelo roteador de verdade e com o `extra` que a rota espera, como o resto da
/// suite: uma tela montada solta passaria aqui e quebraria no aparelho.
Future<_Rede> _abrirF16(
  WidgetTester tester, {
  required CameraDeTeste camera,
  bool comFoto = true,
  /// O que o armazenamento responde aos bytes.
  Future<http.Response> Function()? armazenamento,
  /// O registro de fotos pendentes, quando o caso precisa monta-lo ja com
  /// conteudo -- que e o estado de quem escolheu a foto ontem, sem sinal.
  DepositoDeFotosEmMemoria? registro,
}) async {
  final rede = _Rede();
  rede.registro = registro ?? DepositoDeFotosEmMemoria();
  await abrirOApp(
    tester,
    camera: camera,
    deposito: depositoLogado(),
    depositoDeFotos: rede.registro,
    rede: (requisicao) async {
      rede.pedidos.add(requisicao);
      final endereco = requisicao.url.toString();
      if (endereco.startsWith(_armazenamento)) {
        return (armazenamento ?? () async => http.Response('', 204))();
      }
      if (requisicao.url.path.endsWith('/media/pet-photo-intents')) {
        return _autorizacao();
      }
      if (requisicao.url.path.endsWith('/tags')) return _tagEmitida();
      // `POST /v1/pets/{id}/photos` responde 202: a foto existe e ainda nao
      // foi processada.
      return http.Response('', 202);
    },
  );
  await irPara(
    tester,
    Rotas.petCadastrado,
    extra: ResultadoDoCadastro(
      pet: _nina(),
      fotoPendente: comFoto ? fotoEscolhidaDeTeste : null,
    ),
  );
  return rede;
}

/// Acha um `Text` cujo conteudo contenha [trecho].
///
/// **Procura por trecho literal, e nao pela constante que produz o texto.**
/// Comparar o texto renderizado com `TextosDoCadastro.fotoNaoSubiuSemSinal`
/// seria comparar a tela com ela mesma: o caso ficaria verde com qualquer
/// frase, inclusive com a errada.
Finder _textoContendo(String trecho) {
  return find.byWidgetPredicate(
    (w) => w is Text && (w.data ?? '').contains(trecho),
    description: 'Text contendo "$trecho"',
  );
}

void main() {
  group('os bytes da foto saem do aparelho', () {
    testWidgets('ISCA — F1.6 produz UM pedido ao armazenamento, com os bytes '
        'da foto dentro', (tester) async {
      final camera = CameraDeTeste(EstadoDaPermissao.concedida);
      final rede = await _abrirF16(tester, camera: camera);

      expect(
        rede.aoArmazenamento.length,
        1,
        reason: 'REPROVA: a foto escolhida em F1.4 nao chegou ao '
            'armazenamento. Este contador e o unico que separa "o app envia a '
            'foto" de "o app tem uma funcao de envio que ninguem chama" -- e o '
            'segundo foi o estado real do produto ate 22/09/2026, com a tela '
            'dizendo "ainda está sendo enviada" o tempo todo. Um caso que '
            'medisse texto de tela continuaria verde com este defeito de pe.',
      );

      expect(
        camera.vezesQueLeuOsBytes,
        1,
        reason: 'REPROVA: ninguem leu o arquivo do aparelho. Um pedido ao '
            'armazenamento sem esta leitura esta subindo outra coisa.',
      );

      final corpo = rede.aoArmazenamento.single.bodyBytes;
      expect(
        _contem(corpo, bytesDeFotoDeTeste),
        isTrue,
        reason: 'REPROVA: o pedido saiu sem os bytes da foto dentro. Um '
            'multipart com os campos assinados e sem o arquivo sobe um objeto '
            'vazio, e o armazenamento responde 204 do mesmo jeito.',
      );
    });

    testWidgets('os tres passos saem, e a confirmacao leva o `upload_id` que '
        'a autorizacao emitiu', (tester) async {
      final rede = await _abrirF16(
        tester,
        camera: CameraDeTeste(EstadoDaPermissao.concedida),
      );

      final intencao = rede.aApi.firstWhere(
        (p) => p.url.path.endsWith('/media/pet-photo-intents'),
      );
      final corpoDaIntencao =
          jsonDecode(intencao.body) as Map<String, dynamic>;
      expect(corpoDaIntencao['pet_id'], _nina().id);
      expect(
        corpoDaIntencao['byte_size'],
        bytesDeFotoDeTeste.length,
        reason: 'REPROVA: o tamanho declarado nao e o dos bytes que sobem. A '
            'politica assinada carrega esse teto, e a recusa chega DEPOIS de o '
            'upload inteiro sair.',
      );

      final confirmacao = rede.aApi.where(
        (p) => p.url.path == '/v1/pets/${_nina().id}/photos',
      );
      expect(
        confirmacao.length,
        1,
        reason: 'REPROVA: os bytes subiram e a foto nao foi confirmada. Ela '
            'fica no armazenamento e fora do pet: o produto nao depende de '
            'notificacao de bucket para saber que ela chegou.',
      );
      expect(
        (jsonDecode(confirmacao.single.body) as Map<String, dynamic>)['upload_id'],
        'up-42',
      );
    });

    testWidgets('a credencial da sessao NAO acompanha os bytes',
        (tester) async {
      final rede = await _abrirF16(
        tester,
        camera: CameraDeTeste(EstadoDaPermissao.concedida),
      );

      // O cenario nao e cego: a chamada de intencao, que vai para a NOSSA
      // API, LEVA o token. Sem esta metade o caso ficaria verde num app que
      // nao autentica nada.
      final intencao = rede.aApi.firstWhere(
        (p) => p.url.path.endsWith('/media/pet-photo-intents'),
      );
      expect(
        intencao.headers['authorization'],
        startsWith('Bearer '),
        reason: 'REPROVA: a chamada de intencao saiu sem token, e ai o caso '
            'abaixo nao prova nada.',
      );

      final cabecalhos = rede.aoArmazenamento.single.headers.keys
          .map((k) => k.toLowerCase())
          .toSet();
      expect(
        cabecalhos.contains('authorization'),
        isFalse,
        reason: 'REPROVA: o token da sessao saiu junto dos bytes para um host '
            'que um campo de resposta nomeou.',
      );
    });

    testWidgets('cadastro sem foto: nenhum byte sai, e nenhuma linha aparece',
        (tester) async {
      final camera = CameraDeTeste(EstadoDaPermissao.concedida);
      final rede = await _abrirF16(tester, camera: camera, comFoto: false);

      expect(rede.aoArmazenamento, isEmpty);
      expect(camera.vezesQueLeuOsBytes, 0);
      expect(
        rede.aApi.where((p) => p.url.path.contains('photo')),
        isEmpty,
        reason: 'REPROVA: o app pediu autorizacao de upload sem foto nenhuma. '
            'A intencao conta contra o teto de 20 chamadas por hora da conta.',
      );
      expect(_textoContendo('ainda está sendo enviada'), findsNothing);
    });
  });

  group('a tela diz o que aconteceu, e so o que aconteceu', () {
    testWidgets('a foto subiu: a linha SOME, e nenhuma tela anuncia sucesso',
        (tester) async {
      await _abrirF16(
        tester,
        camera: CameraDeTeste(EstadoDaPermissao.concedida),
      );

      expect(
        _textoContendo('ainda está sendo enviada'),
        findsNothing,
        reason: 'REPROVA: a foto ja subiu e a tela continua dizendo que ela '
            'esta subindo. A frase so pode aparecer enquanto o envio esta em '
            'curso -- era exatamente por ela nao depender de envio nenhum que '
            'o furo de 22/09 passou despercebido.',
      );
      expect(
        _textoContendo('não subiu'),
        findsNothing,
        reason: 'REPROVA: o envio deu certo e a tela acusa falha.',
      );
    });

    testWidgets('sem sinal: a tela diz que NAO subiu, e nao promete fila',
        (tester) async {
      await _abrirF16(
        tester,
        camera: CameraDeTeste(EstadoDaPermissao.concedida),
        armazenamento: () async => throw http.ClientException('sem rota'),
      );

      expect(
        _textoContendo('não subiu: faltou sinal'),
        findsOne,
        reason: 'REPROVA: os bytes nao sairam e a tela nao diz nada, ou diz '
            'que estao subindo. O criterio 2 da BICHUS-31 proibe tela de '
            'sucesso para o que nao aconteceu, e "ainda está sendo enviada" '
            'sobre um envio que terminou em falha e exatamente isso.',
      );
      expect(
        _textoContendo('ainda está sendo enviada'),
        findsNothing,
      );
    });

    testWidgets('sem sinal: `Tentar agora` faz sair um SEGUNDO '
        'pedido ao armazenamento', (tester) async {
      var falhar = true;
      final rede = await _abrirF16(
        tester,
        camera: CameraDeTeste(EstadoDaPermissao.concedida),
        armazenamento: () async {
          if (falhar) throw http.ClientException('sem rota');
          return http.Response('', 204);
        },
      );

      expect(rede.aoArmazenamento.length, 1);
      falhar = false;

      await tocar(tester, find.text('Tentar agora'));

      expect(
        rede.aoArmazenamento.length,
        2,
        reason: 'REPROVA: o botao existe e nao envia nada. Um rotulo que '
            'promete uma acao e nao a executa e o defeito que a BICHUS-62 ja '
            'pegou nesta mesma tela, em outro botao.',
      );
      expect(_textoContendo('não subiu'), findsNothing);
    });

    testWidgets('recusada: a tela diz outra coisa, e NAO oferece tentar de '
        'novo', (tester) async {
      await _abrirF16(
        tester,
        camera: CameraDeTeste(EstadoDaPermissao.concedida),
        armazenamento: () async =>
            http.Response('<Error>AccessDenied</Error>', 403),
      );

      expect(_textoContendo('Não consegui enviar a foto'), findsOne);
      expect(
        find.text('Tentar agora'),
        findsNothing,
        reason: 'REPROVA: a recusa ganhou um botao de repetir. Repetir uma '
            'recusa devolve a mesma recusa, e o rotulo promete um caminho que '
            'nao existe -- o mesmo laco do 409 de limite de pets que a '
            'BICHUS-62 desfez.',
      );
    });

    testWidgets('acessibilidade: `Tentar agora` e botao COM acao de '
        'toque', (tester) async {
      await _abrirF16(
        tester,
        camera: CameraDeTeste(EstadoDaPermissao.concedida),
        armazenamento: () async => throw http.ClientException('sem rota'),
      );

      // A arvore do APP MONTADO, e nao o widget isolado: `btn=true tap=false`
      // nasce justamente da composicao (um `Semantics` com `button: true` por
      // cima de um filho cuja acao foi excluida), e medir o widget solto nao
      // enxerga isso.
      final nos = _todosOsNos(tester)
          .where((n) => n.label == 'Tentar agora')
          .toList();
      expect(
        nos,
        isNotEmpty,
        reason: 'REPROVA: nao ha no de semantica chamado exatamente "Enviar a '
            'foto de novo". Sem sinal, este e o UNICO caminho desta tela para '
            'a foto subir, e para quem usa leitor de tela ele nao existe.',
      );
      for (final no in nos) {
        final dados = no.getSemanticsData();
        expect(
          dados.flagsCollection.isButton,
          isTrue,
          reason: 'REPROVA: o controle nao se anuncia como botao.',
        );
        expect(
          dados.hasAction(SemanticsAction.tap),
          isTrue,
          reason: 'REPROVA: `btn=true tap=false` -- o no diz que e botao e nao '
              'carrega acao de toque. O TalkBack e o VoiceOver anunciam um '
              'botao que nao ativa (SC 4.1.2), e quatro widgets deste app ja '
              'sairam assim.',
        );
      }
    });
  });
  group('a foto que nao subiu FICA no aparelho (BICHUS-87, criterios 6 e 7)',
      () {
    testWidgets('sem sinal: o caminho do arquivo e gravado em disco',
        (tester) async {
      final rede = await _abrirF16(
        tester,
        camera: CameraDeTeste(EstadoDaPermissao.concedida),
        armazenamento: () async => throw http.ClientException('sem rota'),
      );

      expect(
        rede.registro.fotos.length,
        1,
        reason: 'REPROVA: a foto nao foi lembrada, e a tela promete que ela '
            'sobe depois. Promessa sobre o que nao aconteceu e o que o '
            'criterio 2 da BICHUS-31 proibe, e o criterio 6 da BICHUS-87 '
            'manda o arquivo permanecer no disco do aparelho.',
      );
      expect(rede.registro.fotos.single['pet_id'], _nina().id);
      expect(
        rede.registro.fotos.single['caminho'],
        fotoEscolhidaDeTeste.caminho,
        reason: 'REPROVA: o registro nao guarda ONDE o arquivo esta. Sem o '
            'caminho nao ha o que retomar.',
      );
    });

    testWidgets('a foto subiu: NADA fica no registro', (tester) async {
      final rede = await _abrirF16(
        tester,
        camera: CameraDeTeste(EstadoDaPermissao.concedida),
      );

      expect(
        rede.registro.fotos,
        isEmpty,
        reason: 'REPROVA: a foto subiu e continua no registro. A varredura do '
            'proximo arranque a subiria de novo, e o pet ganharia duas fotos '
            'que ninguem escolheu.',
      );
    });

    testWidgets('recusada: NADA fica no registro, porque repetir devolve a '
        'mesma recusa', (tester) async {
      final rede = await _abrirF16(
        tester,
        camera: CameraDeTeste(EstadoDaPermissao.concedida),
        armazenamento: () async =>
            http.Response('<Error>AccessDenied</Error>', 403),
      );

      expect(
        rede.registro.fotos,
        isEmpty,
        reason: 'REPROVA: uma recusa definitiva ficou guardada para ser '
            'retentada no arranque, para sempre. E o laco que gasta bateria e '
            'nunca avisa ninguem (criterio 19 da BICHUS-87).',
      );
    });

    testWidgets('ISCA — o app que ABRE com foto pendente a envia sozinho',
        (tester) async {
      final registro = DepositoDeFotosEmMemoria()
        ..conteudo = jsonEncode(<Map<String, dynamic>>[
          <String, dynamic>{
            'pet_id': _nina().id,
            'caminho': fotoEscolhidaDeTeste.caminho,
            'tipo_de_conteudo': 'image/jpeg',
            'tamanho_em_bytes': 27,
            'criada_em': '2026-09-21T22:10:00.000Z',
          },
        ]);

      final rede = _Rede()..registro = registro;
      await abrirOApp(
        tester,
        camera: CameraDeTeste(EstadoDaPermissao.concedida),
        deposito: depositoLogado(),
        depositoDeFotos: registro,
        rede: (requisicao) async {
          rede.pedidos.add(requisicao);
          if (requisicao.url.toString().startsWith(_armazenamento)) {
            return http.Response('', 204);
          }
          if (requisicao.url.path.endsWith('/media/pet-photo-intents')) {
            return _autorizacao();
          }
          return http.Response('', 202);
        },
      );

      expect(
        rede.aoArmazenamento.length,
        1,
        reason: 'REPROVA: o app abriu com uma foto pendente e nao a enviou. E '
            'o criterio 7 da BICHUS-87 -- sem esta varredura a foto escolhida '
            'sem sinal fica no aparelho para sempre, e a frase da tela ("sobe '
            'na próxima vez que você abrir o app") vira mentira.',
      );
      expect(
        registro.fotos,
        isEmpty,
        reason: 'REPROVA: subiu e continua no registro.',
      );
    });

    testWidgets('SEM sessao, o arranque NAO toca no pendente', (tester) async {
      final registro = DepositoDeFotosEmMemoria()
        ..conteudo = jsonEncode(<Map<String, dynamic>>[
          <String, dynamic>{
            'pet_id': _nina().id,
            'caminho': fotoEscolhidaDeTeste.caminho,
            'tipo_de_conteudo': 'image/jpeg',
            'tamanho_em_bytes': 27,
            'criada_em': '2026-09-21T22:10:00.000Z',
          },
        ]);

      final rede = _Rede()..registro = registro;
      await abrirOApp(
        tester,
        camera: CameraDeTeste(EstadoDaPermissao.concedida),
        // Sem `depositoLogado()`: o app abre deslogado.
        depositoDeFotos: registro,
        rede: (requisicao) async {
          rede.pedidos.add(requisicao);
          return http.Response('', 401);
        },
      );

      expect(
        rede.aoArmazenamento,
        isEmpty,
        reason: 'REPROVA: o app tentou enviar sem sessao.',
      );
      expect(
        registro.fotos.length,
        1,
        reason: 'REPROVA: o arranque deslogado APAGOU a foto pendente. A rota '
            'de intencao e `bearerAuth`: sem token ela responde 401, que o '
            'mecanismo classifica como recusa, e recusa descarta. A varredura '
            'sem guarda de sessao apaga exatamente o que ela existe para '
            'salvar.',
      );
    });
  });

  group(grupoDaIscaDaFotoPendente, () {
    testWidgets('o registro fica vazio depois de sair da conta',
        (tester) async {
      final rede = await _abrirF16(
        tester,
        camera: CameraDeTeste(EstadoDaPermissao.concedida),
        armazenamento: () async => throw http.ClientException('sem rota'),
      );

      // **A isca so vale se o cenario de fato encheu o registro.** Um caso que
      // saisse da conta com o arquivo ja vazio mediria nada e ficaria verde
      // por isso.
      expect(
        rede.registro.fotos,
        hasLength(1),
        reason: 'A isca nao entrou no cenario: o registro precisa ter '
            'conteudo ANTES do logout.',
      );

      // Sai pelo CONTROLADOR, e nao pelo botao: os quatro desfechos de
      // `sair()` passam por la, inclusive o refresh recusado, que nao passa
      // por tela nenhuma.
      await escopoDoApp(tester).sessao.sair();
      await tester.pumpAndSettle();

      expect(
        rede.registro.fotos,
        isEmpty,
        reason: 'REPROVA: a foto pendente sobreviveu ao logout. O que esta no '
            'arquivo e o CAMINHO de uma foto do animal de uma pessoa, EM '
            'DISCO, e disco sobrevive ao logout, ao app ser encerrado pelo '
            'sistema e ao aparelho ser desligado. Pior que ficar: a varredura '
            'do proximo arranque subiria essa foto para a conta de quem '
            'entrasse depois no mesmo aparelho. A entrada e '
            '`_fotosPendentes.limpar` na lista `limpezasAoSair` de '
            '`lib/app.dart`.',
      );
      expect(
        jsonDecode(rede.registro.conteudo ?? '[]'),
        isEmpty,
        reason: 'REPROVA: a lista em memoria esvaziou e o ARQUIVO continua '
            'cheio. A leitura seguinte traria tudo de volta, e o logout teria '
            '*parecido* funcionar.',
      );
    });
  });
}

/// O nome do grupo da isca de logout, escrito uma vez so.
///
/// Citado por `iscasDaLista` em `test/sessao/limpezas_ao_sair_test.dart`: um
/// registro que aponte para um grupo inexistente reprova la, e uma constante e
/// o que impede renomear o grupo aqui e deixar o registro apontando para nada.
const String grupoDaIscaDaFotoPendente =
    'a foto pendente morre no logout';

/// Todos os nos da arvore de semantica do app montado.
List<SemanticsNode> _todosOsNos(WidgetTester tester) {
  final raiz = tester.getSemantics(find.byType(MaterialApp));
  final todos = <SemanticsNode>[];
  void andar(SemanticsNode no) {
    todos.add(no);
    no.visitChildren((filho) {
      andar(filho);
      return true;
    });
  }

  andar(raiz);
  return todos;
}

/// `agulha` aparece inteira, em sequencia, dentro de `palheiro`?
bool _contem(List<int> palheiro, List<int> agulha) {
  if (agulha.isEmpty) return false;
  for (var i = 0; i + agulha.length <= palheiro.length; i += 1) {
    var bate = true;
    for (var j = 0; j < agulha.length; j += 1) {
      if (palheiro[i + j] != agulha[j]) {
        bate = false;
        break;
      }
    }
    if (bate) return true;
  }
  return false;
}
