/// **F3.2 SEM FOTO: O BOTÃO HABILITA, E A FAIXA AVISA SEM ASSUSTAR.**
///
/// O cliente, em 03/11/2026: *"quando o tutor vai registrar que o seu pet foi
/// perdido, se o pet não tiver foto cadastrada, o botão avisar agora não fica
/// habilitado"*. Com as três saídas na mesa — manter a trava com um caminho
/// para a foto, tirar a trava, ou abrir e cobrar a foto depois — ele escolheu
/// **tirar a trava**: pet perdido é questão de horas.
///
/// O QUE ESTE ARQUIVO MEDE, E QUE NENHUM OUTRO MEDIA
///
/// Medido em 03/11/2026: `grep -rn 'pet_photo_missing' app/test` voltava
/// VAZIO, e os quatro dublês de `lost-case-preview` da suíte mandavam todos
/// `'blockers': []`. O caminho bloqueado existia só no servidor. Ou seja: a
/// trava que o cliente viu no aparelho **não tinha nenhum caso de teste**.
///
/// A PROVA DE QUE ELE REPROVA ANTES DO CONSERTO
///
/// Medido em 03/11/2026, sobre `fb8e5c2d` limpo, com UMA diferença: as duas
/// constantes novas (`semFotoDe` e `fotoEmProcessamentoDe`) viraram o texto
/// LITERAL idêntico, porque elas não existem na base e sem isso o arquivo não
/// compilaria lá. Placar na base: **3 passaram, 3 reprovaram**.
///
/// Os TRÊS que reprovaram na base são os que medem a decisão:
///   - `a faixa de SEM FOTO é informativa, e não de erro`;
///   - `FOTO EM PROCESSAMENTO tem texto PRÓPRIO, e não o de sem foto`;
///   - `SEM FOTO a frase do alcance promete a DESCRIÇÃO, e não a foto`.
///
/// Os TRÊS que passam dos dois lados são guardas de regressão, e estão aqui
/// com o nome disso: o dublê manda a resposta do contrato NOVO (`blockers`
/// vazio, `warnings` com a foto), então o app da base também habilita o botão
/// diante dela. Quem mede a trava de verdade -- com o servidor decidindo o que
/// vai em `blockers` -- é `tests/integration/caso-de-perdido-sem-foto.test.ts`,
/// e lá os cinco casos reprovam na base.
///
/// AS DUAS COISAS QUE NÃO PODEM SE CONFUNDIR
///
/// `blockers` desabilita o envio; `warnings` nunca. Os outros dois bloqueios
/// (canal não verificado, pet já perdido) **continuam travando** — o critério
/// do botão não virou "nenhum aviso", ele continua sendo "nenhum bloqueio", e a
/// foto saiu da lista de bloqueios. O caso `o canal não verificado CONTINUA
/// travando` existe para que trocar um pelo outro reprove.
///
/// E A FAIXA DIFERENCIA DOIS ESTADOS que o texto antigo juntava: pet que nunca
/// teve foto, e foto que está em `processing`. "Este pet ainda não tem foto
/// pronta" cobria os dois e não ajudava em nenhum.
library;

import 'package:bichu/theme/bichu_tokens.g.dart';
import 'package:bichu/api/modelos.dart';
import 'package:bichu/roteamento/rotas.dart';
import 'package:bichu/telas/perdido/tela_alcance_do_alerta.dart';
import 'package:bichu/telas/perdido/tela_onde_e_quando.dart';
import 'package:bichu/telas/pet/textos_do_detalhe.dart';
import 'package:bichu/widgets/botao_primario.dart';
import 'package:bichu/widgets/faixa_de_aviso.dart';
import 'package:flutter/material.dart';
import 'package:go_router/go_router.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:http/http.dart' as http;

import '../api/pets_api_listar_test.dart' show fotoDoContrato, petDoContrato;
import 'ajuda_de_tela.dart';

const String _petId = 'p-1';
const String _nomeDoPet = 'Rex';

/// `GET /pets` com o pet pedido, e a prévia pedida em `lost-case-preview`.
Future<http.Response> Function(http.Request) _rede({
  required List<Map<String, dynamic>> fotos,
  required Map<String, dynamic> previa,
}) {
  final corpoDoPet = petDoContrato(id: _petId, nome: _nomeDoPet, fotos: fotos);
  return (req) async {
    if (req.url.path == '/v1/pets' && req.method == 'GET') {
      return json200(<String, dynamic>{
        'items': <Map<String, dynamic>>[corpoDoPet],
      });
    }
    if (req.url.path.endsWith('/lost-case-preview') && req.method == 'GET') {
      return json200(previa);
    }
    // A porta mora na pagina do pet (T.1) desde 18/10: sem o que T.1 le ao
    // nascer, o fluxo nao e alcancavel e os casos reprovariam por nao achar a
    // porta -- reprovacao que nao e a deste arquivo.
    if (req.url.path == '/v1/pets/$_petId' && req.method == 'GET') {
      return json200(corpoDoPet);
    }
    // Pet sem plaquinha nao mostra QR, por decisao: um duble que devolvesse
    // plaquinha faria estes casos pedirem `qr.png`, que nao e o que medem.
    if (req.url.path == '/v1/pets/$_petId/tags' && req.method == 'GET') {
      return json200(<String, dynamic>{'items': <dynamic>[]});
    }
    if (req.url.path.endsWith('/reference-data') && req.method == 'GET') {
      return json200(referenciaDeTeste());
    }
    // Tudo o que ninguem declarou responde 404 DE PROPOSITO: duble que
    // inventa sucesso esconde a chamada a mais.
    return http.Response('', 404);
  };
}

/// A prévia do contrato: alcance calculado, e `blockers`/`warnings` por parâmetro.
Map<String, dynamic> _previa({
  List<String> bloqueios = const <String>[],
  List<String> avisos = const <String>[],
}) {
  return <String, dynamic>{
    'reach_status': 'computed',
    'reachable_tutors': 46,
    'radius_m': 5000,
    'area_label': 'Vila Madalena',
    'blockers': bloqueios,
    'warnings': avisos,
  };
}

/// Avanca o quadro SEM esperar que a arvore assente.
///
/// **`pumpAndSettle` nao serve quando ha foto em `processing`**: a `Moldura` do
/// paragrafo 11.4 desenha um esqueleto com brilho, que anima para sempre. O
/// caso morreria em `pumpAndSettle timed out`, falando de animacao em vez do
/// que ele mede. Medido em 03/11/2026 neste proprio arquivo.
Future<void> _avancar(WidgetTester tester) async {
  for (var i = 0; i < 6; i++) {
    await tester.pump(const Duration(milliseconds: 120));
  }
}

/// O mesmo que `desencostarDaBarraDeTopo` de `ajuda_de_tela.dart`, mas com
/// [_avancar] no lugar de `pumpAndSettle`.
///
/// **A copia e deliberada e tem uma razao propria**: a compartilhada chama
/// `pumpAndSettle`, e este arquivo nao pode -- a `Moldura` em `processing`
/// desenha um esqueleto que anima para sempre, e `pumpAndSettle` morreria no
/// prazo falando de animacao. Ver [_avancar].
///
/// Por que ela e necessaria desde 06/11/2026: a ficha do pet passou a usar
/// `CascaDaPaginaInterna`, onde a barra de topo FLUTUA sobre a lista num
/// `Stack` em vez de ser descontada por um `Scaffold`. Alvo encostado no topo
/// existe, esta visivel, e o `tap` cai na barra.
Future<void> _desencostarDaBarra(WidgetTester tester, Finder alvo) async {
  if (alvo.evaluate().length != 1) return;
  final rolagem = find.ancestor(of: alvo, matching: find.byType(Scrollable));
  if (rolagem.evaluate().isEmpty) return;
  final topo = tester.getTopLeft(alvo).dy;
  if (topo >= BichuAlvoDeToque.critico) return;
  await tester.drag(
    rolagem.first,
    Offset(0, BichuAlvoDeToque.critico - topo + BichuEspaco.e2),
  );
  await _avancar(tester);
}

/// Rola ate o alvo sem esperar assentamento, pelo mesmo motivo de [_avancar].
Future<void> _rolarAte(WidgetTester tester, Finder alvo) async {
  if (alvo.evaluate().isNotEmpty) {
    await tester.ensureVisible(alvo);
    await _avancar(tester);
    return;
  }
  final rolagem = find.byType(Scrollable).last;
  for (var i = 0; i < 8 && alvo.evaluate().isEmpty; i++) {
    await tester.drag(rolagem, const Offset(0, -300));
    await _avancar(tester);
  }
  await tester.ensureVisible(alvo);
  await _avancar(tester);
  await _desencostarDaBarra(tester, alvo);
}

/// Toca sem esperar assentamento, pelo mesmo motivo de [_avancar].
Future<void> _tocarSemAssentar(WidgetTester tester, Finder alvo) async {
  await tester.ensureVisible(alvo);
  await _avancar(tester);
  await _desencostarDaBarra(tester, alvo);
  await tester.tap(alvo);
  await _avancar(tester);
}

/// Atravessa a porta do pet até F3.2, que é onde o envio acontece.
Future<void> _irAteF32(
  WidgetTester tester, {
  required Future<http.Response> Function(http.Request) rede,
}) async {
  await abrirOApp(
    tester,
    rede: rede,
    deposito: depositoLogado(
      regiaoDeReferencia: const RegiaoDeReferencia(
        bairro: 'Vila Madalena',
        cidade: 'São Paulo',
        uf: 'SP',
      ),
    ),
  );
  final contexto = tester.element(find.byType(Scaffold).first);
  GoRouter.of(contexto).push(Rotas.detalheDoPetDe(_petId));
  await _avancar(tester);
  await _tocarSemAssentar(tester, find.text(TextosDoDetalhe.marcarComoPerdido));
  // `Quando?` fica abaixo da dobra em F3.1: o `ListView` so constroi o que
  // cabe, e um toque em widget ainda nao construido reprova por motivo que
  // nao e o do caso.
  await _rolarAte(tester, find.text('Agora'));
  await _tocarSemAssentar(tester, find.text('Agora'));
  await _tocarSemAssentar(
    tester,
    find.widgetWithText(BotaoPrimario, TelaOndeEQuando.rotuloDeContinuar),
  );
  // A previa de F3.2 e uma chamada de rede: sem este avanco, a tela ainda
  // esta em `Calculando` e nem o botao nem a faixa existem.
  await _avancar(tester);
}

BotaoPrimario _botaoDeAvisar(WidgetTester tester) {
  final alvo = find.byWidgetPredicate(
    (w) =>
        w is BotaoPrimario &&
        (w.rotulo == TelaAlcanceDoAlerta.rotuloDeAvisar ||
            w.rotulo == TelaAlcanceDoAlerta.rotuloDeAbrirMesmoAssim),
  );
  return tester.widget<BotaoPrimario>(alvo);
}

void main() {
  testWidgets(
      'SEM FOTO o botão de avisar HABILITA: a trava virou aviso em 03/11/2026',
      (tester) async {
    await _irAteF32(
      tester,
      rede: _rede(
        fotos: const <Map<String, dynamic>>[],
        previa: _previa(avisos: <String>['pet_photo_missing']),
      ),
    );

    expect(
      _botaoDeAvisar(tester).aoTocar,
      isNotNull,
      reason: 'REPROVA: o pet sem foto não pode ter o botão de avisar '
          'desabilitado. O cliente decidiu em 03/11/2026 tirar a trava: pet '
          'perdido é questão de horas, e mandar o tutor resolver foto antes '
          'de avisar a vizinhança custa as horas que importam. Se este caso '
          'reprova, `pet_photo_missing` voltou a ser tratado como bloqueio.',
    );
  });

  testWidgets('a faixa de SEM FOTO é informativa, e não de erro',
      (tester) async {
    await _irAteF32(
      tester,
      rede: _rede(
        fotos: const <Map<String, dynamic>>[],
        previa: _previa(avisos: <String>['pet_photo_missing']),
      ),
    );

    final faixa = tester.widget<FaixaDeAviso>(
      find.widgetWithText(FaixaDeAviso, TelaAlcanceDoAlerta.semFotoDe(_nomeDoPet)),
    );

    expect(
      faixa.peso,
      PesoDaFaixa.informativo,
      reason: 'REPROVA: a falta de foto saiu como ERRO. O alerta vai sair; o '
          'que a faixa tem de fazer é informar que ele sai valendo menos, e '
          'faixa de erro diz à pessoa em pânico que algo deu errado.',
    );
    expect(
      faixa.aoTocarNaAcao,
      isNull,
      reason: 'REPROVA: a faixa ganhou ação. A decisão de 03/11 foi TIRAR a '
          'trava, e não manter a trava com um caminho para a foto (opção 1) '
          'nem cobrar a foto depois (opção 3).',
    );
  });

  testWidgets('FOTO EM PROCESSAMENTO tem texto PRÓPRIO, e não o de sem foto',
      (tester) async {
    await _irAteF32(
      tester,
      rede: _rede(
        // Foto enviada, ainda não derivada: `processing` não serve a rota
        // pública, então o servidor avisa — mas aqui nada falta ao tutor.
        fotos: <Map<String, dynamic>>[
          fotoDoContrato(status: 'processing', thumb: null),
        ],
        previa: _previa(avisos: <String>['pet_photo_missing']),
      ),
    );

    expect(
      find.text(TelaAlcanceDoAlerta.fotoEmProcessamentoDe(_nomeDoPet)),
      findsOneWidget,
      reason: 'REPROVA: foto em processamento recebeu o texto de "não tem '
          'foto no cadastro". São estados diferentes com saídas diferentes: '
          'num deles a foto está a caminho, e dizer que ela não existe manda '
          'a pessoa procurar um problema que ela já resolveu.',
    );
    expect(
      find.text(TelaAlcanceDoAlerta.semFotoDe(_nomeDoPet)),
      findsNothing,
      reason: 'REPROVA: os dois textos apareceram juntos.',
    );
  });

  testWidgets('COM FOTO não há faixa nenhuma, e a frase promete a FOTO',
      (tester) async {
    await _irAteF32(
      tester,
      rede: _rede(
        fotos: <Map<String, dynamic>>[fotoDoContrato()],
        previa: _previa(),
      ),
    );

    expect(_botaoDeAvisar(tester).aoTocar, isNotNull);
    expect(find.byType(FaixaDeAviso), findsNothing);
    expect(
      find.textContaining('Eles vão receber a foto de $_nomeDoPet'),
      findsOneWidget,
      reason: 'REPROVA: com foto a tela deixou de prometer a foto.',
    );
  });

  testWidgets('SEM FOTO a frase do alcance promete a DESCRIÇÃO, e não a foto',
      (tester) async {
    await _irAteF32(
      tester,
      rede: _rede(
        fotos: const <Map<String, dynamic>>[],
        previa: _previa(avisos: <String>['pet_photo_missing']),
      ),
    );

    expect(
      find.textContaining('Eles vão receber a descrição de $_nomeDoPet'),
      findsOneWidget,
      reason: 'REPROVA: a tela continua dizendo "vão receber a FOTO" num caso '
          'que não tem foto. Era verdade enquanto a trava garantia a foto; no '
          'dia em que caso sem foto passou a existir, virou mentira na tela '
          'de quem está em pânico.',
    );
    expect(
      find.textContaining('Eles vão receber a foto de $_nomeDoPet'),
      findsNothing,
    );
  });

  testWidgets('o canal não verificado CONTINUA travando, mesmo sem foto',
      (tester) async {
    await _irAteF32(
      tester,
      rede: _rede(
        fotos: const <Map<String, dynamic>>[],
        previa: _previa(
          bloqueios: <String>['contact_channel_unverified'],
          avisos: <String>['pet_photo_missing'],
        ),
      ),
    );

    expect(
      _botaoDeAvisar(tester).aoTocar,
      isNull,
      reason: 'REPROVA: o critério do botão virou "nenhum AVISO" em vez de '
          '"nenhum BLOQUEIO". Tirar a trava da foto não afrouxa os outros '
          'dois: sem canal verificado, o aviso de quem achar o pet cai no '
          'vazio, e é por isso que esse bloqueio existe.',
    );
  });
}
