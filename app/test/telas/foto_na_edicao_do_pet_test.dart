// A foto na edicao do pet (BICHUS-61, criterios 4, 9, 10 e 11).
//
// ## O QUE ESTE ARQUIVO EXISTE PARA IMPEDIR
//
// Quatro classes de defeito, e cada uma tem aqui o caso que PRECISA reprovar
// quando o mecanismo e desligado:
//
//  1. **A tela baixar o ORIGINAL da foto.** O original carrega o EXIF com a
//     coordenada da casa do tutor ate o worker limpa-lo, e tem o peso de um
//     arquivo de camera. A tela desenha a DERIVADA (`card_url`, com
//     `thumb_url` de reserva) e nada mais.
//  2. **`Salvar` reenviar a foto que ninguem trocou.** O `PATCH` nao carrega
//     foto nenhuma, e o envio sai so do arquivo escolhido agora. Um envio
//     disparado por `Salvar` gastaria a internet do tutor a cada correcao de
//     nome.
//  3. **A ausencia de foto virar pendencia acusada** (criterio 10). Sem foto a
//     tela mostra convite, e nao faixa de erro.
//  4. **A remocao sair sem a folha confirmar.** O `DELETE` so pode partir do
//     botao destrutivo.
//
// **O DELETE e o envio sao CONTADOS, e nao inferidos do desfecho da tela.**
// Uma tela que nao chamasse nada pareceria identica a uma que removeu, e o
// contrario tambem.
//
// ESTE ARQUIVO FOI ESCRITO E **NAO FOI RODADO** nesta entrega, por instrucao
// do cliente (17/10/2026): nada de suite unitaria. Ele passou por
// `flutter analyze`, que confere tipo e assinatura, e nao por execucao.

import 'package:bichu/api/modelos_pet.dart';
import 'package:bichu/dispositivo/camera_e_galeria.dart';
import 'package:bichu/roteamento/rotas.dart';
import 'package:bichu/telas/pet/tela_editar_pet.dart';
import 'package:bichu/telas/pet/textos_do_detalhe.dart';
import 'package:bichu/widgets/folha_destrutiva.dart';
import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:http/http.dart' as http;

import '../api/pets_api_listar_test.dart' show fotoDoContrato, petDoContrato;
import 'ajuda_de_tela.dart';

const String _idDoPet = '3f1d7a9e-0000-7000-8000-000000000001';
const String _idDaFoto = 'f-1';

/// A DERIVADA de cartao. O endereco que a moldura grande tem de pedir.
const String _card = 'https://midia.bichu.app/pets/card/CARTAO.jpeg';

/// A derivada de miniatura. Reserva, e nao a preferida da moldura grande.
const String _thumb = 'https://midia.bichu.app/pets/thumb/MINI.jpeg';

/// O armazenamento e **outro host**, como em producao.
const String _armazenamento = 'https://objetos.exemplo.test/bichu-privado';

/// O que a rede recebeu, para os casos contarem em vez de inferirem.
class _Rede {
  final List<http.Request> pedidos = <http.Request>[];

  Iterable<http.Request> get intencoes =>
      pedidos.where((p) => p.url.path.endsWith('/media/pet-photo-intents'));

  Iterable<http.Request> get aoArmazenamento =>
      pedidos.where((p) => p.url.toString().startsWith(_armazenamento));

  Iterable<http.Request> get confirmacoes => pedidos.where(
    (p) => p.method == 'POST' && p.url.path.endsWith('/pets/$_idDoPet/photos'),
  );

  Iterable<http.Request> get remocoes =>
      pedidos.where((p) => p.method == 'DELETE' && p.url.path.contains('/photos/'));

  Iterable<http.Request> get patches =>
      pedidos.where((p) => p.method == 'PATCH');
}

Map<String, dynamic> _petComFoto() => petDoContrato(
  id: _idDoPet,
  fotos: <Map<String, dynamic>>[
    fotoDoContrato(thumb: _thumb, card: _card),
  ],
);

Map<String, dynamic> _petSemFoto() => petDoContrato(id: _idDoPet);

/// Abre a edicao pelo roteador de verdade, com o `extra` que a rota espera.
///
/// Tela montada solta passaria aqui e quebraria no aparelho: a rota cai no
/// detalhe quando o `extra` nao e um [Pet].
Future<_Rede> _abrirAEdicao(
  WidgetTester tester, {
  required Map<String, dynamic> pet,
  CameraDeTeste? camera,
  /// O que `DELETE /pets/{id}/photos/{fotoId}` responde.
  Future<http.Response> Function()? aoRemover,
}) async {
  final rede = _Rede();
  await abrirOApp(
    tester,
    camera:
        camera ??
        CameraDeTeste(
          EstadoDaPermissao.concedida,
          foto: fotoEscolhidaDeTeste,
        ),
    deposito: depositoLogado(),
    rede: (requisicao) async {
      rede.pedidos.add(requisicao);
      final caminho = requisicao.url.path;

      if (requisicao.url.toString().startsWith(_armazenamento)) {
        return http.Response('', 204);
      }
      if (caminho.endsWith('/reference-data')) {
        return json200(referenciaDeTeste());
      }
      if (caminho.endsWith('/media/pet-photo-intents')) {
        return json200(<String, dynamic>{
          'upload_id': 'u-1',
          'method': 'PUT',
          'url': _armazenamento,
          'headers': <String, String>{'Content-Type': 'image/jpeg'},
          'expires_at': '2026-10-17T13:00:00Z',
          'max_bytes': 5242880,
        });
      }
      if (caminho.endsWith('/pets/$_idDoPet/photos') &&
          requisicao.method == 'POST') {
        // 202: aceito, ainda nao pronto.
        return http.Response('', 202);
      }
      if (requisicao.method == 'DELETE' && caminho.contains('/photos/')) {
        return (aoRemover ?? () async => http.Response('', 204))();
      }
      if (caminho == '/v1/pets/$_idDoPet') {
        return json200(pet);
      }
      if (caminho == '/v1/pets') {
        return json200(<String, dynamic>{
          'items': <dynamic>[pet],
        });
      }
      return http.Response('', 404);
    },
  );

  await irPara(
    tester,
    Rotas.editarPetDe(_idDoPet),
    extra: Pet.doJson(pet),
  );
  return rede;
}

/// A `Image` que a moldura da edicao desenha, se houver uma.
Finder _imagemDaMoldura() => find.descendant(
  of: find.byType(TelaEditarPet),
  matching: find.byType(Image),
);

void main() {
  // -------------------------------------------------------------------------
  // ISCA 1 — a derivada, nunca o original
  // -------------------------------------------------------------------------
  group('ISCA — a foto atual e a DERIVADA', () {
    testWidgets('a moldura pede `card_url`, e nao o original', (tester) async {
      await _abrirAEdicao(tester, pet: _petComFoto());

      expect(_imagemDaMoldura(), findsOneWidget);
      final imagem = tester.widget<Image>(_imagemDaMoldura());
      final provedor = imagem.image as NetworkImage;

      expect(
        provedor.url,
        _card,
        reason:
            'REPROVA: a moldura grande da edicao precisa da derivada `card` '
            '(1024 px, cortada na proporcao da moldura). A `thumb` tem 176 px '
            'e apareceria esticada quase tres vezes a 3x; o ORIGINAL carrega o '
            'EXIF com a coordenada da casa do tutor e o peso de um arquivo de '
            'camera, e o app nunca deve baixa-lo.',
      );
      expect(
        provedor.url.contains('original'),
        isFalse,
        reason: 'REPROVA: a tela montou o endereco de um ORIGINAL.',
      );
    });

    testWidgets('sem `card_url` cai na `thumb`, e nao no vazio', (
      tester,
    ) async {
      // As duas derivadas saem nulas enquanto o worker nao as gravou, e
      // `card_url` pode chegar depois da `thumb`. Com uma das duas ha foto
      // para mostrar.
      await _abrirAEdicao(
        tester,
        pet: petDoContrato(
          id: _idDoPet,
          fotos: <Map<String, dynamic>>[fotoDoContrato(thumb: _thumb)],
        ),
      );

      final provedor =
          tester.widget<Image>(_imagemDaMoldura()).image as NetworkImage;
      expect(provedor.url, _thumb);
    });
  });

  // -------------------------------------------------------------------------
  // ISCA 2 — `Salvar` nao reenvia foto
  // -------------------------------------------------------------------------
  group('ISCA — `Salvar` nao mexe na foto', () {
    testWidgets('salvar sem trocar a foto NAO produz envio nenhum', (
      tester,
    ) async {
      final rede = await _abrirAEdicao(tester, pet: _petComFoto());

      await tocar(tester, find.text(TextosDoDetalhe.salvar));

      expect(
        rede.patches,
        hasLength(1),
        reason: 'o `PATCH` dos campos tem de sair: e o que `Salvar` faz.',
      );
      expect(
        rede.intencoes,
        isEmpty,
        reason:
            'REPROVA: `Salvar` pediu autorizacao de envio de foto. Ninguem '
            'trocou a foto, e `PetInput` nao tem campo de foto nenhum -- cada '
            'correcao de nome gastaria a internet do tutor subindo de novo uma '
            'imagem que ja esta no servidor.',
      );
      expect(rede.aoArmazenamento, isEmpty);
      expect(rede.confirmacoes, isEmpty);
    });
  });

  // -------------------------------------------------------------------------
  // ISCA 3 — a ausencia e convite, nao pendencia
  // -------------------------------------------------------------------------
  group('ISCA — sem foto nao e erro', () {
    testWidgets('o pet sem foto mostra convite, e nao faixa de erro', (
      tester,
    ) async {
      await _abrirAEdicao(tester, pet: _petSemFoto());

      expect(find.text(TextosDoDetalhe.adicionarFoto), findsOneWidget);
      expect(find.text(TextosDoDetalhe.semFotoAinda), findsOneWidget);
      expect(
        _imagemDaMoldura(),
        findsNothing,
        reason: 'sem foto nao ha `Image`: a moldura fica no estado vazio.',
      );
      expect(
        find.text(TextosDoDetalhe.removerAFoto),
        findsNothing,
        reason:
            'REPROVA: `Remover a foto` na arvore de um pet sem foto. Nao ha '
            '`photoId` para citar, e o toque viraria uma chamada para '
            '`/photos/` sem id.',
      );
    });

    testWidgets('com foto o rotulo e `Trocar`, e nao `Adicionar`', (
      tester,
    ) async {
      await _abrirAEdicao(tester, pet: _petComFoto());

      expect(find.text(TextosDoDetalhe.trocarAFoto), findsOneWidget);
      expect(find.text(TextosDoDetalhe.adicionarFoto), findsNothing);
      expect(find.text(TextosDoDetalhe.removerAFoto), findsOneWidget);
    });
  });

  // -------------------------------------------------------------------------
  // ISCA 4 — a troca passa pelos tres passos
  // -------------------------------------------------------------------------
  group('a troca da foto usa o caminho que existe', () {
    testWidgets('escolher da galeria produz intencao, bytes e confirmacao', (
      tester,
    ) async {
      final camera = CameraDeTeste(
        EstadoDaPermissao.concedida,
        foto: fotoEscolhidaDeTeste,
      );
      final rede = await _abrirAEdicao(tester, pet: _petComFoto(), camera: camera);

      await tocar(tester, find.text(TextosDoDetalhe.trocarAFoto));
      await tocar(tester, find.text(TextosDoDetalhe.escolherDaGaleria));

      expect(
        rede.intencoes,
        hasLength(1),
        reason: 'o primeiro passo e `POST /media/pet-photo-intents`.',
      );
      expect(
        rede.aoArmazenamento,
        hasLength(1),
        reason:
            'REPROVA: os bytes nao sairam. E o passo do meio, e e o unico que '
            'separa "o app envia" de "o app diz que envia".',
      );
      expect(
        rede.confirmacoes,
        hasLength(1),
        reason:
            'REPROVA: faltou `POST /pets/{id}/photos`. E ESTA chamada que '
            'enfileira o processamento; sem ela a foto fica no armazenamento e '
            'fora do pet.',
      );
      expect(
        rede.aoArmazenamento.single.headers['Authorization'],
        isNull,
        reason:
            'REPROVA: a credencial da sessao saiu junto dos bytes para um host '
            'que o servidor nomeou no corpo de uma resposta.',
      );
    });

    testWidgets('cancelar o seletor NAO envia nada', (tester) async {
      // `foto` nula e a pessoa desistindo no seletor do sistema. E o que
      // garante que so o arquivo escolhido agora vira envio.
      final camera = CameraDeTeste(EstadoDaPermissao.concedida);
      final rede = await _abrirAEdicao(tester, pet: _petComFoto(), camera: camera);

      await tocar(tester, find.text(TextosDoDetalhe.trocarAFoto));
      await tocar(tester, find.text(TextosDoDetalhe.escolherDaGaleria));

      expect(rede.intencoes, isEmpty);
      expect(rede.aoArmazenamento, isEmpty);
    });
  });

  // -------------------------------------------------------------------------
  // ISCA 5 — a remocao, e a folha que a guarda
  // -------------------------------------------------------------------------
  group('ISCA — remover passa pela folha', () {
    testWidgets('confirmar na folha remove no caminho do contrato', (
      tester,
    ) async {
      final rede = await _abrirAEdicao(tester, pet: _petComFoto());

      await tocar(tester, find.text(TextosDoDetalhe.removerAFoto));
      expect(find.byType(FolhaDestrutiva), findsOneWidget);
      expect(rede.remocoes, isEmpty, reason: 'abrir a folha nao remove.');

      await tocar(tester, find.text(TextosDoDetalhe.confirmarRemocaoDaFoto));

      expect(rede.remocoes, hasLength(1));
      expect(
        rede.remocoes.single.url.path,
        '/v1/pets/$_idDoPet/photos/$_idDaFoto',
        reason:
            'REPROVA: o `DELETE` nao citou o `photoId`. `deletePetPhoto` e '
            '`/pets/{petId}/photos/{photoId}`, e remover sem o id nao e a '
            'mesma rota.',
      );
    });

    testWidgets('ISCA — cancelar a folha NAO remove', (tester) async {
      final rede = await _abrirAEdicao(tester, pet: _petComFoto());

      await tocar(tester, find.text(TextosDoDetalhe.removerAFoto));
      await tocar(tester, find.text('Cancelar'));

      expect(
        rede.remocoes,
        isEmpty,
        reason:
            'REPROVA: o `DELETE` saiu do caminho de cancelar. Ele so pode '
            'partir do botao destrutivo.',
      );
    });

    testWidgets('o 409 do contrato tem frase propria', (tester) async {
      // `deletePetPhoto` declara 409 para "e a unica foto de um pet com caso
      // aberto". **O servidor de hoje NAO o emite** -- `excluirFoto` nao
      // confere caso aberto nenhum --, e este caso existe para o dia em que
      // ele passar a emitir nao ser o dia em que o app engole a recusa.
      final rede = await _abrirAEdicao(
        tester,
        pet: _petComFoto(),
        aoRemover: () async => problema('pet-photo-missing', 409),
      );

      await tocar(tester, find.text(TextosDoDetalhe.removerAFoto));
      await tocar(tester, find.text(TextosDoDetalhe.confirmarRemocaoDaFoto));

      expect(rede.remocoes, hasLength(1));
      expect(
        find.text(TextosDoDetalhe.fotoPresaAoCasoAberto),
        findsOneWidget,
        reason:
            'REPROVA: a recusa caiu na mensagem generica. O 409 e o unico caso '
            'em que ha uma saida concreta a oferecer -- trocar a foto, ou '
            'encerrar o caso.',
      );
    });
  });
}
