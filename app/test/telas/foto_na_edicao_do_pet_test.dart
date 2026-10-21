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
import 'package:bichu/widgets/moldura.dart';
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
  /// O que o ARMAZENAMENTO responde aos bytes. `204` quando nao se diz nada;
  /// um `4xx` aqui e a recusa definitiva, que vira [DesfechoDoEnvio.recusada].
  Future<http.Response> Function()? aoArmazenar,
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
        return (aoArmazenar ?? () async => http.Response('', 204))();
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

/// O `FileImage` de uma [Image], **desembrulhando o `ResizeImage`**.
///
/// Desde 21/10/2026 a moldura da edicao desenha a foto escolhida por
/// `PreviaDaFoto`, e essa peca passa `cacheWidth` -- o que embrulha o provedor
/// num `ResizeImage` POR CIMA do `FileImage`. Um caso que olhasse
/// `image is FileImage` ficaria **vazio** e reprovaria dizendo que a foto nao
/// esta na tela, quando ela esta.
///
/// O desembrulho e o mesmo de `imagem_do_profissional_test.dart`, e nao uma
/// segunda forma de fazer a mesma coisa.
FileImage? _doArquivo(Image imagem) {
  final provedor = imagem.image;
  if (provedor is ResizeImage) {
    final interno = provedor.imageProvider;
    return interno is FileImage ? interno : null;
  }
  return provedor is FileImage ? provedor : null;
}

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

    // -----------------------------------------------------------------------
    // ISCA — A PREVIA MOSTRA A FOTO RECEM-ESCOLHIDA
    //
    // O defeito relatado pelo cliente em 20/10/2026, nas palavras dele: *"a
    // edicao da foto do pet, ao selecionar ele pisca, mas ele nao atualiza o
    // preview para o usuario antes de salvar o cadastro"* -- e, antes disso,
    // *"a foto do cadastro do pet nao fez o upload"*. **Eram o mesmo defeito.**
    //
    // O envio SEMPRE funcionou: os tres casos acima contam intencao, bytes e
    // confirmacao, e medi o armazenamento de homologacao respondendo. O que
    // nao funcionava era o retorno: `_MolduraDaEdicao` so sabia desenhar
    // `fotoDeCapa`, `confirmPetPhoto` responde 202 com a foto em `processing`,
    // e `fotoDeCapa` nao devolve foto nao exibivel. Sem polling no app, a
    // moldura caia de volta na foto ANTIGA e ficava nela. Um envio que deu
    // certo ficava indistinguivel de um que falhou.
    //
    // **O caso mede a IMAGEM, e nao o estado.** Que o widget de moldura existe,
    // que `setState` rodou, que o passo virou `subindo` -- nada disso prova que
    // a pessoa viu a foto dela. O que prova e o `FileImage` apontando para o
    // arquivo escolhido. Com o mecanismo desligado este caso reprova aqui, e
    // nao numa assercao vizinha.
    testWidgets(
      'a moldura mostra a foto RECEM-ESCOLHIDA, e nao a antiga',
      (tester) async {
        final camera = CameraDeTeste(
          EstadoDaPermissao.concedida,
          foto: fotoEscolhidaDeTeste,
        );
        await _abrirAEdicao(tester, pet: _petComFoto(), camera: camera);

        await tocar(tester, find.text(TextosDoDetalhe.trocarAFoto));
        await tocar(tester, find.text(TextosDoDetalhe.escolherDaGaleria));

        final imagens = tester
            .widgetList<Image>(_imagemDaMoldura())
            .toList(growable: false);
        expect(
          imagens,
          isNotEmpty,
          reason:
              'REPROVA: a moldura nao desenha imagem nenhuma depois da escolha '
              '-- e o esqueleto no lugar da foto, que foi o "pisca" relatado.',
        );
        final doArquivo = imagens
            .map(_doArquivo)
            .whereType<FileImage>()
            .map((f) => f.file.path)
            .toList(growable: false);
        // E A FOTO GANHOU `cacheWidth` NESTA TELA, que ela nao tinha: ao adotar
        // `PreviaDaFoto` ela passou a ser decodificada na largura PINTADA, e
        // nao na do arquivo. Antes era `Image.file` cru aqui dentro, com o
        // provedor `FileImage` pelado -- foto de celular de 12,2 MP custava
        // 48.771.072 bytes decodificada. A assercao e no TIPO DO PROVEDOR
        // porque e so ele que mostra a diferenca.
        expect(
          imagens.map((i) => i.image).whereType<ResizeImage>(),
          isNotEmpty,
          reason:
              'REPROVA: a foto escolhida voltou a ser decodificada no tamanho '
              'do ARQUIVO. `PreviaDaFoto` passa `cacheWidth`, e sem ele o '
              'provedor fica `FileImage` cru. ISCA: apague `cacheWidth: '
              'largura` de `lib/widgets/previa_da_foto.dart`.',
        );
        expect(
          doArquivo,
          contains(fotoEscolhidaDeTeste.caminho),
          reason:
              'REPROVA: a moldura nao mostra o arquivo que a pessoa acabou de '
              'escolher. Sem esta imagem nao existe retorno nenhum na tela, e '
              'um envio que funciona fica indistinguivel de um que falha -- que '
              'e exatamente o que o cliente relatou como "nao fez o upload".',
        );
        expect(
          imagens.where((i) => i.image is NetworkImage),
          isEmpty,
          reason:
              'REPROVA: a foto ANTIGA continua na moldura depois de a pessoa '
              'escolher outra. A derivada da nova ainda esta em `processing`, '
              'entao mostrar a antiga aqui afirma que nada mudou.',
        );
      },
    );

    // CONTRAPESO. Sem ele a isca acima passaria com uma moldura que mostra
    // qualquer arquivo o tempo todo.
    testWidgets(
      'escolher e ser RECUSADO volta para a foto anterior',
      (tester) async {
        final camera = CameraDeTeste(
          EstadoDaPermissao.concedida,
          foto: fotoEscolhidaDeTeste,
        );
        await _abrirAEdicao(
          tester,
          pet: _petComFoto(),
          camera: camera,
          // Recusa definitiva do armazenamento: tipo fora da politica, acima
          // do teto, autorizacao vencida. Nenhuma melhora com insistencia.
          aoArmazenar: () async => http.Response('', 403),
        );

        await tocar(tester, find.text(TextosDoDetalhe.trocarAFoto));
        await tocar(tester, find.text(TextosDoDetalhe.escolherDaGaleria));

        final imagens = tester
            .widgetList<Image>(_imagemDaMoldura())
            .toList(growable: false);
        expect(
          imagens.map(_doArquivo).whereType<FileImage>(),
          isEmpty,
          reason:
              'REPROVA: a foto recusada ficou na moldura. A tela estaria '
              'exibindo como salva uma imagem que nao existe em lugar nenhum '
              '-- a mentira inversa da que esta correcao fecha.',
        );
        expect(
          imagens
              .where((i) => i.image is NetworkImage)
              .map((i) => (i.image as NetworkImage).url),
          contains(_card),
          reason:
              'REPROVA: a foto ANTERIOR nao voltou. Recusar o envio nao apaga '
              'a foto que o pet ja tinha.',
        );
      },
    );

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
      // O recado da foto e desenhado no bloco da foto, no alto da tela
      // (`tela_editar_pet.dart`, linhas 709-715). Logo depois de a folha de
      // confirmacao fechar ele ainda nao esta achavel, e **medi os tres
      // caminhos**: `pumpAndSettle` sozinho nao resolve, `ensureVisible`
      // sozinho nao resolve, e `rolarAte` -- que rola e bombeia quadros ate o
      // alvo existir -- resolve. Nao afirmo aqui qual e o mecanismo, porque
      // nao o isolei: a tela e `SingleChildScrollView` e nao `ListView`, entao
      // nao e a virtualizacao obvia. O que esta medido e que o recado APARECE,
      // e e isso que o caso cobra.
      // =====================================================================
      // A FOLHA FICA ABERTA NA RECUSA, E E PRECISO FECHA-LA (20/10/2026)
      // =====================================================================
      //
      // `FolhaDestrutiva` **nao fecha quando `aoConfirmar` lanca** -- ela pinta
      // o erro generico dentro de si e espera. O recado especifico do 409 e
      // escrito pela TELA, e a tela so o escreve quando
      // `mostrarFolhaDestrutiva` RETORNA: `_recadoDaFoto =
      // _mensagemDaRemocao(erro)` esta depois do `await`. Enquanto a folha
      // estiver aberta, o recado **nao existe na arvore** -- medido:
      // `find.text(..., skipOffstage: false)` acha zero.
      //
      // **O CASO FECHAVA A FOLHA POR ACIDENTE, e isto e o achado.** Ele
      // chamava `rolarAte(..., passo: -120)`, que arrasta
      // `find.byType(Scrollable).first` para baixo; `.first` era o rolavel da
      // PROPRIA folha, e arrastar uma `showModalBottomSheet` para baixo a
      // DISPENSA. O caso dependia de um gesto de dispensa disfarcado de
      // rolagem, e a prosa dele dizia textualmente *"nao afirmo aqui qual e o
      // mecanismo, porque nao o isolei"*. Ele quebrou quando a casca fixa de
      // 20/10 acrescentou um `Scaffold` por baixo da tela e `.first` deixou de
      // ser o rolavel da folha: as 50 tentativas passaram a arrastar outra
      // coisa e o caso morreu com `Bad state: No element`.
      //
      // Agora a folha e fechada pelo controle que a pessoa usa -- `Cancelar`,
      // o rotulo padrao de `mostrarFolhaDestrutiva` --, e o recado e procurado
      // depois. O mecanismo esta dito, e e o da pessoa.
      await tocar(tester, find.widgetWithText(OutlinedButton, 'Cancelar'));
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
  // =========================================================================
  // ISCA — OS TRÊS RAMOS COMPARTILHAM A MESMA MOLDURA
  // =========================================================================
  //
  // Esta é a isca que fecha o agravante achado na mescla da onda 4. Até ela,
  // CADA RAMO montava a própria `Moldura` — a foto escolhida, a derivada por
  // rede e o vazio. Enquanto as três eram iguais isso funcionava **por
  // coincidência**; no dia em que um ramo ganhasse outro quadro, **a foto
  // trocaria de moldura no instante em que a derivada chegasse** — o mesmo
  // salto que `_pontoFocal` existe para evitar, um nível acima.
  //
  // Agora a `Moldura` fica FORA, envolvendo os três, e é isso que estes casos
  // afirmam. Sem eles, a próxima edição separa os ramos de novo e o salto
  // volta sem ninguém ver: nenhum outro caso deste arquivo olha QUANTAS
  // molduras existem.
  //
  // DESLIGAR PARA VER REPROVAR: em `lib/telas/pet/tela_editar_pet.dart`,
  // devolva um `Moldura(...)` de dentro de `_imagem()` em vez de só a imagem.
  // Esperado: `há UMA moldura` reprova com 2.
  group('ISCA — os três ramos compartilham a mesma moldura', () {
    /// A moldura ESTRUTURAL: a que envolve o ramo, e não a de reserva.
    ///
    /// **A distinção não é preciosismo.** Em teste de widget `Image.network`
    /// não tem rede e cai no `errorBuilder`, e o `errorBuilder` da derivada
    /// devolve uma `Moldura` vazia — que fica na árvore, DENTRO da `Image`.
    /// Essa é reserva de falha, não o quadro do ramo: contá-la faria este caso
    /// reprovar o desenho certo, que é o defeito caro.
    ///
    /// O que importa é quantas molduras ENVOLVEM o conteúdo, e essas são as
    /// que não descendem de uma `Image`.
    Finder molduras() => find.descendant(
      of: find.byType(TelaEditarPet),
      matching: find.byType(Moldura),
    );
    Finder molduraDeReserva() => find.descendant(
      of: find.byType(Image),
      matching: find.byType(Moldura),
    );

    Future<double> umaMolduraSo(WidgetTester tester, String ramo) async {
      final todas = molduras().evaluate().toList(growable: false);
      final reservas = molduraDeReserva().evaluate().toSet();
      final estruturais = todas
          .where((e) => !reservas.contains(e))
          .toList(growable: false);
      expect(
        estruturais,
        hasLength(1),
        reason:
            'REPROVA: o ramo "$ramo" tem ${estruturais.length} molduras '
            'estruturais, e não uma (${todas.length} no total, '
            '${reservas.length} de reserva de falha). Cada ramo montando a sua '
            'faz a foto TROCAR DE MOLDURA quando a derivada chega -- o mesmo '
            'salto que o ponto focal existe para evitar. A moldura é de fora, '
            'e envolve os três.',
      );
      return (estruturais.single.widget as Moldura).largura;
    }

    testWidgets('a mesma moldura nos três ramos, e a mesma largura', (
      tester,
    ) async {
      // RAMO 3 — sem foto nenhuma.
      await _abrirAEdicao(tester, pet: _petSemFoto());
      final semFoto = await umaMolduraSo(tester, 'sem foto');

      // RAMO 2 — a derivada que veio do servidor.
      await _abrirAEdicao(tester, pet: _petComFoto());
      final daRede = await umaMolduraSo(tester, 'derivada da rede');

      // RAMO 1 — a foto recém-escolhida no aparelho.
      await tocar(tester, find.text(TextosDoDetalhe.trocarAFoto));
      await tocar(tester, find.text(TextosDoDetalhe.escolherDaGaleria));
      final escolhida = await umaMolduraSo(tester, 'foto escolhida');

      expect(
        <double>{semFoto, daRede, escolhida},
        hasLength(1),
        reason:
            'REPROVA: os três ramos desenham molduras de LARGURAS diferentes '
            '(sem foto: $semFoto, derivada: $daRede, escolhida: $escolhida). '
            'Uma moldura compartilhada que muda de tamanho entre os estados é '
            'o salto de volta, por outro caminho.',
      );
      expect(
        escolhida,
        BichuMoldura.larguraFotoLg,
        reason: 'REPROVA: a moldura da edição deixou de ser `foto/lg`.',
      );
    });

    testWidgets('o ponto focal é o MESMO na escolhida e na derivada', (
      tester,
    ) async {
      // Ponto focal que diferisse entre os dois CAUSARIA o salto em vez de
      // evitá-lo: a foto se reposicionaria quando a derivada chegasse.
      await _abrirAEdicao(tester, pet: _petComFoto());
      final daRede = tester.widget<Image>(_imagemDaMoldura()).alignment;

      await tocar(tester, find.text(TextosDoDetalhe.trocarAFoto));
      await tocar(tester, find.text(TextosDoDetalhe.escolherDaGaleria));
      final doArquivo = tester
          .widgetList<Image>(_imagemDaMoldura())
          .where((i) => _doArquivo(i) != null)
          .map((i) => i.alignment)
          .toList(growable: false);

      expect(doArquivo, isNotEmpty, reason: 'REPROVA NA ÂNCORA: sem imagem de arquivo.');
      expect(
        doArquivo.first,
        daRede,
        reason:
            'REPROVA: a foto escolhida ($doArquivo) e a derivada ($daRede) usam '
            'pontos focais diferentes. O recorte mudaria no instante em que a '
            'derivada chegasse, que é exatamente o salto que o ponto focal '
            'existe para evitar.',
      );
      expect(
        daRede,
        const Alignment(0, -1 / 3),
        reason:
            'REPROVA: o ponto focal deixou de ser o terço superior, onde fica a '
            'cabeça do animal na foto típica de tutor (design system 5.4).',
      );
    });
  });
}
