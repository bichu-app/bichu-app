// BICHUS-238 — a lista `limpezasAoSair` de `lib/app.dart`, entrada por entrada.
//
// ## O que estava de pe ate aqui
//
// A lista tinha duas entradas e **uma isca**. Tirar `_cofreDoQr.limpar`
// reprovava (`qr_na_tela_test.dart`, `ISCA 3`); tirar
// `() async => _cacheDeMeusPets.limpar()` deixava a suite inteira verde em
// 528/528, com o cache de `Perfil` > `Meus pets` da tutora anterior vivo em
// memoria para quem entrasse em seguida no mesmo aparelho. O mecanismo existia
// e funcionava; ele so nao tinha sido escrito para aquela entrada.
//
// ## DESLIGAR PARA VER REPROVAR, e o que foi medido em 22/09/2026
//
//   1. Em `lib/app.dart`, tire `() async => _cacheDeMeusPets.limpar()` da
//      lista `limpezasAoSair`.
//      Medido: **2 casos reprovam** neste arquivo --
//        - `ISCA — o cache de \`Meus pets\` nao sobrevive ao logout`
//          > `depois de sair(), os pets da tutora anterior nao estao em lugar nenhum`
//        - `O REGISTRO da lista limpezasAoSair`
//          > `a lista de app.dart e exatamente a lista registrada aqui`
//      O segundo e o que importa para o futuro: ele acusa a **remocao** de
//      qualquer entrada, inclusive de uma que ainda nao existe hoje.
//
//   2. Em `lib/app.dart`, tire `_cofreDoQr.limpar`.
//      Medido: **2 casos reprovam** -- o `ISCA 3` de `qr_na_tela_test.dart` e,
//      de novo, o registro deste arquivo.
//
//   3. Acrescente uma entrada nova a lista sem registra-la aqui.
//      Medido: o registro reprova, nomeando a entrada orfa.
//
// ## Por que o registro existe, e nao so a isca
//
// `limpezasAoSair` acumula entrada de entrega diferente (BICHUS-164 pos o
// cache de pets, BICHUS-235 pos o cofre do QR, a `FilaOffline` e a terceira
// candidata). Lista assim e lugar de onde some item sem ninguem ver, e uma
// isca por entrada so protege as entradas que alguem lembrou de escrever.
//
// O registro abaixo inverte o onus: a lista do `app.dart` e comparada com a
// lista declarada aqui, nos **dois sentidos**. Acrescentar entrada sem
// registrar reprova; apagar entrada registrada reprova. E o registro nao
// aceita nome de isca inventado -- ele confere que o arquivo existe e que o
// grupo citado esta escrito la dentro.
//
// Isso nao substitui a isca de comportamento: ele obriga a escreve-la, e
// reprova no minuto em que a entrada some.

import 'dart:io';
import 'dart:typed_data';

import 'package:bichu/api/cache_de_imagens.dart';
import 'package:bichu/api/fila_offline.dart';
import 'package:bichu/escopo.dart';
import 'package:bichu/telas/perfil/meus_pets.dart';
import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:http/http.dart' as http;

import '../api/pets_api_listar_test.dart' show petDoContrato;
import '../telas/a_foto_sobe_de_verdade_test.dart'
    show grupoDaIscaDaFotoPendente;
import '../telas/contador_do_auau_test.dart'
    show grupoDaIscaDoContadorNoLogout;
import '../notificacoes/contador_de_avisos_test.dart'
    show grupoDaIscaDoLogout;
import '../telas/ajuda_de_tela.dart';

/// O nome do grupo desta isca, escrito uma vez so.
///
/// Ele e citado pelo registro logo abaixo, e um registro que aponte para um
/// grupo que nao existe reprova. Constante, e nao literal repetido, para que
/// renomear o grupo nao deixe o registro apontando para o nada.
/// O grupo da isca do CACHE DE IMAGEM EM DISCO (BICHUS-296).
///
/// Mora neste arquivo e nao no da frente porque o que ele mede e o LOGOUT, e e
/// aqui que existe um app montado com `sair()` alcancavel pelo controlador --
/// que e o unico caminho que cobre os quatro desfechos.
const String grupoDaIscaDoCacheDeImagens =
    'a foto de PESSOA em disco morre no logout';

const String grupoDaIscaDoCache =
    'ISCA — o cache de `Meus pets` nao sobrevive ao logout';

/// Onde mora a prova de cada entrada de `limpezasAoSair`.
///
/// **A chave e o campo do `_BichuAppState` que a entrada limpa**, exatamente
/// como ele aparece em `lib/app.dart`. O valor diz onde olhar quando esta
/// entrada reprovar -- e, mais importante, e o que obriga quem acrescenta uma
/// entrada a ter escrito a isca dela antes de a suite ficar verde.
const Map<String, ({String arquivo, String grupo})> iscasDaLista =
    <String, ({String arquivo, String grupo})>{
  '_cacheDeMeusPets': (
    arquivo: 'test/sessao/limpezas_ao_sair_test.dart',
    grupo: grupoDaIscaDoCache,
  ),
  '_cofreDoQr': (
    arquivo: 'test/telas/qr_na_tela_test.dart',
    grupo: 'ISCA 3 — a imagem nao sobrevive ao logout',
  ),
  // ACRESCENTADA PELA BICHUS-21, que ligou a `FilaOffline`.
  //
  // Ela e a terceira entrada da lista e a unica das tres que guarda em
  // **DISCO**: o cache de pets e o cofre do QR morrem com o processo, e o pior
  // caso deles e a proxima pessoa na mesma sessao do app. O corpo de cada acao
  // enfileirada carrega o que a tutora digitou -- nome do pet, endereco de
  // referencia, telefone de contato --, e disco sobrevive ao logout, ao app
  // ser encerrado pelo sistema e ao aparelho ser desligado.
  '_fila': (
    arquivo: 'test/telas/marcar_como_perdido_test.dart',
    grupo: 'a fila offline morre no logout',
  ),
  // ACRESCENTADA COM O ENVIO DE FOTO DO APP (BICHUS-87, criterios 6 e 7).
  //
  // A quarta entrada, e a SEGUNDA em disco. O que ela apaga e o registro de
  // qual arquivo local pertence a qual pet: o caminho de uma foto do animal de
  // uma pessoa, guardado porque o criterio 6 manda o arquivo permanecer no
  // aparelho quando o envio falha por falta de sinal.
  //
  // O dano de esquecer esta entrada e MAIOR que o das outras tres, e vale
  // dizer por que: alem de o dado ficar, a varredura de arranque
  // (`_retomarAsFotos`) sobe o que estiver no registro assim que houver
  // sessao. Sobrevivendo ao logout, a foto do pet da tutora anterior seria
  // enviada **para a conta de quem entrasse depois naquele aparelho**.
  '_fotosPendentes': (
    arquivo: 'test/telas/a_foto_sobe_de_verdade_test.dart',
    grupo: grupoDaIscaDaFotoPendente,
  ),
  // ACRESCENTADA PELA BICHUS-75, o aviso persistente de cadastro.
  //
  // Ela e a quarta entrada e a segunda em DISCO. O que ela apaga e o registro
  // de dispensas do aviso: quando a pessoa tocou em `Agora nao` pela ultima
  // vez, e quantas vezes ja tocou.
  //
  // Parece contagem inocua e nao e. O e-mail sobre o qual a pessoa pediu
  // silencio e dado dela, e o CONTADOR decide o texto: a partir da terceira
  // dispensa o app passa a perguntar se o endereco esta certo. Herdado, o
  // proximo tutor deste celular ganha duas coisas que nunca pediu -- sete dias
  // de silencio sobre um aviso que ele precisa ler, e a suspeita sobre um
  // endereco que e dele e esta correto.
  //
  // A isca dela aponta para o lado OPOSTO da de
  // `test/dispositivo/oportunidades_de_aviso_test.dart`, que reprova se a
  // entrada dela APARECER nesta lista: aquele registro e do APARELHO (o
  // dialogo do iOS e gasto uma vez por instalacao) e este e da CONTA. As duas
  // iscas existem para que ninguem uniformize uma pela outra.
  '_avisoDeCadastro': (
    arquivo: 'test/sessao/registro_do_aviso_de_cadastro_test.dart',
    grupo: 'ISCA — o registro SOME no logout',
  ),
  // ACRESCENTADA PELO CONTADOR DE NAO LIDO DA ABA `AuAu` (20/10/2026).
  //
  // A unica entrada da lista que NAO guarda em disco e e VISIVEL: as outras
  // apagam dado que vive em memoria ou em arquivo, e o pior caso delas e uma
  // leitura. Este numero esta PINTADO na barra de baixo, e a barra aparece
  // deslogada de proposito -- deslogado e estado de navegacao, nao muro. Sem
  // esta entrada, a proxima pessoa a abrir o app neste aparelho ve na aba
  // `AuAu` quantos recados a anterior tinha, sem precisar entrar em conta
  // nenhuma.
  //
  // E a limpeza e `esquecer()`, que devolve o contador a NULO -- "ninguem
  // contou ainda" -- e nao a zero: zero afirmaria que a conta que saiu nao
  // tinha recado nenhum, e a barra pintaria essa afirmacao.
  '_contadores': (
    arquivo: 'test/telas/contador_do_auau_test.dart',
    grupo: grupoDaIscaDoContadorNoLogout,
  ),
  // ACRESCENTADA EM 19/10/2026, quando o sino da barra de topo ganhou numero.
  //
  // A sexta entrada, e a terceira em MEMORIA -- junto com o cache de pets e o
  // cofre do QR. O que ela apaga e um inteiro, e e o menor dado desta lista;
  // o dano de esquece-la nao e o tamanho dele, e o que ele faz na tela.
  //
  // `ContadorDeAvisos` vive no `Escopo`, logo enquanto o PROCESSO viver. Sem
  // esta entrada, o tutor seguinte neste aparelho -- o celular da recepcao do
  // pet shop, o do casal, o usado que acabou de ser vendido -- entra na conta
  // dele e encontra `9+` pintado no sino. Ele toca para ler os avisos, e os
  // avisos sao de outra pessoa (a caixa dele, essa sim, vem do servidor e vem
  // certa). O numero afirma, sobre a conta DELE, uma coisa que o app soube
  // sobre outra conta.
  //
  // A isca dela mede o OBJETO e nao o sino pintado, e ha razao escrita no
  // caso: deslogado o sino e `SizedBox.shrink`, entao medir a tela passaria
  // por vacuidade com o numero intacto esperando o proximo login.
  '_contadorDeAvisos': (
    arquivo: 'test/notificacoes/contador_de_avisos_test.dart',
    grupo: grupoDaIscaDoLogout,
  ),
  // ACRESCENTADA PELO CACHE DE IMAGEM NO APARELHO (BICHUS-296, cliente
  // 26/10/2026: *"um cache local no device do usuario para as imagens"*).
  //
  // A setima entrada, e a TERCEIRA em disco -- junto com a fila offline e o
  // registro de fotos pendentes. O que ela apaga e a **foto de perfil das
  // conexoes** de quem acabou de sair.
  //
  // **E a unica entrada desta lista cujo motivo e uma decisao de privacidade
  // do cliente, e nao so herancas entre contas.** A Emenda 3 do ADR-0010
  // (19/10/2026) diz que a foto de uma pessoa aparece para outra *"apenas
  // quando as duas ja aceitaram conexao"*. No servidor isso e uma clausula
  // `WHERE`; no aparelho, um arquivo gravado continua gravado. Sem esta linha,
  // a proxima pessoa a entrar neste telefone -- o da recepcao do pet shop, o
  // do casal, o usado que acabou de ser vendido -- teria no disco o rosto das
  // conexoes da anterior, e a decisao dele estaria valendo so na tela.
  //
  // **A limpeza e `esquecerTodasAsPessoas()` e nao um `limpar()` geral**, e a
  // assimetria e deliberada: foto de pet perdido e capa de encontro ficam. Elas
  // nao sao de ninguem, nao vazam de uma conta para a seguinte, e apaga-las
  // jogaria fora exatamente o que o cliente pediu -- abertura rapida -- sem
  // fechar risco nenhum. Ha caso medindo as duas direcoes.
  '_cacheDeImagens': (
    arquivo: 'test/sessao/limpezas_ao_sair_test.dart',
    grupo: grupoDaIscaDoCacheDeImagens,
  ),
};

/// O prazo da divida da `FilaOffline` (BICHUS-201).
///
/// **PREMISSA, e e esta a unica linha a mudar quando a decisao mudar.** A
/// classe esta correta, tem 221 linhas de teste e **nada no app a instancia**.
/// Ela nao foi removida porque a historia que a liga ja existe e esta no
/// backlog: a **BICHUS-21** (`Marcar o pet como perdido`), cujo criterio 6 diz
/// que a F3.1 funciona inteira sem conexao e o envio acontece na F3.2. O
/// criterio 1 da BICHUS-31 -- `Concluido` -- ja exige a fila em disco, e o 13
/// exige o reenvio com a MESMA `Idempotency-Key`: o que esta classe guarda e
/// justamente o que um reescrever-depois perderia.
///
/// O que este prazo impede e a terceira opcao, a ruim: codigo morto com
/// cobertura, parado por tempo indefinido, parecendo seguranca. Vencido o
/// prazo sem a fila ligada, o caso abaixo REPROVA e a decisao volta para a
/// mesa -- ligar ou remover --, em vez de virar um comentario que ninguem le.
final DateTime prazoDaFilaOffline = DateTime.utc(2026, 10, 31);

/// A rede dos casos de tela deste arquivo.
///
/// O `204` no logout e deliberado: sem ele o `sair()` cairia em
/// `recusadaPeloServidor`, que o observador padrao manda para
/// `FlutterError.reportError` -- e o caso reprovaria por um 404 na revogacao,
/// e nao pelo que ele foi escrito para medir.
Future<http.Response> Function(http.Request) redeComPetsEComLogout(
  List<Map<String, dynamic>> items,
) {
  return (req) async {
    if (req.url.path == '/v1/pets' && req.method == 'GET') {
      return json200(<String, dynamic>{'items': items});
    }
    if (req.url.path.endsWith('/auth/logout')) return http.Response('', 204);
    return problema('not-found', 404);
  };
}

/// O `app/` do repositorio, achado a partir do diretorio corrente.
///
/// **Reprova quando nao acha.** Portao que nao encontra o que conferir fica
/// verde por vazio, e e essa a classe de defeito que este arquivo existe para
/// fechar.
Directory raizDoApp() {
  var dir = Directory.current.absolute;
  while (true) {
    if (File('${dir.path}/lib/app.dart').existsSync()) return dir;
    final pai = dir.parent;
    if (pai.path == dir.path) break;
    dir = pai;
  }
  throw StateError(
    'REPROVA: nao achei `lib/app.dart` subindo a partir de '
    '"${Directory.current.path}". Sem ele este portao nao confere nada, e '
    'ficar verde sem conferir e exatamente o que ele existe para impedir.',
  );
}

/// O texto entre os colchetes de `limpezasAoSair: <LimpezaAoSair>[ ... ]`.
String blocoDaLista(String fonte) {
  const String marca = 'limpezasAoSair: <LimpezaAoSair>[';
  final inicio = fonte.indexOf(marca);
  if (inicio < 0) {
    throw StateError(
      'REPROVA: nao achei `$marca` em `lib/app.dart`. Ou a lista mudou de '
      'forma, ou ela sumiu. Nos dois casos este portao parou de conferir a '
      'lista de limpezas do logout, e isso nao pode passar calado.',
    );
  }
  var profundidade = 0;
  for (var i = inicio + marca.length - 1; i < fonte.length; i += 1) {
    final c = fonte[i];
    if (c == '[' || c == '(' || c == '{') profundidade += 1;
    if (c == ']' || c == ')' || c == '}') {
      profundidade -= 1;
      if (profundidade == 0) {
        return fonte.substring(inicio + marca.length, i);
      }
    }
  }
  throw StateError(
    'REPROVA: os colchetes de `limpezasAoSair` nao fecham em `lib/app.dart`.',
  );
}

/// Os campos limpos pela lista, um por entrada, na ordem em que aparecem.
///
/// **Reprova quando nao consegue ler uma entrada.** Uma entrada em forma que
/// este leitor nao entende nao pode virar "nenhuma entrada": seria o portao
/// aprovando por cegueira, que e pior do que nao existir.
List<String> camposDaLista(String bloco) {
  final semComentarios = bloco
      .split('\n')
      .map((l) {
        final corte = l.indexOf('//');
        return corte < 0 ? l : l.substring(0, corte);
      })
      .join('\n');

  final entradas = <String>[];
  final atual = StringBuffer();
  var profundidade = 0;
  for (final c in semComentarios.split('')) {
    if (c == '[' || c == '(' || c == '{') profundidade += 1;
    if (c == ']' || c == ')' || c == '}') profundidade -= 1;
    if (c == ',' && profundidade == 0) {
      entradas.add(atual.toString());
      atual.clear();
      continue;
    }
    atual.write(c);
  }
  entradas.add(atual.toString());

  final campos = <String>[];
  for (final bruta in entradas) {
    final entrada = bruta.trim();
    if (entrada.isEmpty) continue;
    final achados = RegExp(r'_[A-Za-z0-9_]+')
        .allMatches(entrada)
        .map((m) => m.group(0)!)
        .toSet();
    if (achados.length != 1) {
      throw StateError(
        'REPROVA: nao consegui dizer QUAL campo a entrada "$entrada" de '
        '`limpezasAoSair` limpa (achei ${achados.length} candidatos: '
        '$achados). Este portao existe para saber, entrada por entrada, o que '
        'a lista limpa; uma entrada que ele nao le seria uma entrada sem '
        'cobertura passando por cima dele. Escreva a entrada na forma '
        '`_campo.limpar` (ou `() async => _campo.limpar()`), ou ensine este '
        'leitor a ler a forma nova -- nunca deixe o portao adivinhando.',
      );
    }
    campos.add(achados.single);
  }
  return campos;
}

void main() {
  // ------------------------------------------------------------------------
  // A isca que faltava. Ela olha o EFEITO -- o que sobrou onde --, e nao a
  // chamada: um caso que conferisse "o logout chamou `limpar()`" ficaria verde
  // com o furo inteiro de pe, porque a chamada pode existir sobre o objeto
  // errado. Foi assim que este mesmo defeito ja aconteceu uma vez: a limpeza
  // morava no `onPressed` de `abas.dart` e os quatro desfechos de `sair()`
  // nao passam todos por botao.
  //
  // DESLIGAR PARA VER REPROVAR: em `lib/app.dart`, tire
  // `() async => _cacheDeMeusPets.limpar()` da lista `limpezasAoSair`.
  // ------------------------------------------------------------------------
  group(grupoDaIscaDoCache, () {
    testWidgets('MEDICAO: abrir `Meus pets` deixa os pets no cache',
        (tester) async {
      // A medicao que justifica o resto do grupo, e nao uma exigencia de
      // produto. Se um dia ela falhar, a premissa mudou -- o cache deixou de
      // guardar, ou deixou de ser por dono -- e a limpeza do logout precisa
      // ser reavaliada, nao apagada.
      final cache = CacheDeMeusPets();
      await abrirOApp(
        tester,
        rede: redeComPetsEComLogout(<Map<String, dynamic>>[petDoContrato()]),
        deposito: depositoLogado(),
        cacheDeMeusPets: cache,
      );
      await irParaAConta(tester);

      expect(
        cache.pets('u-1'),
        isNotNull,
        reason: 'A tela nao guardou nada no cache, e sem isso o caso do '
            'logout mediria a limpeza de um cache que ja estava vazio -- '
            'passaria sempre, inclusive com o furo aberto.',
      );
      expect(cache.pets('u-1')!.single.nome, 'Nina');
    });

    testWidgets(
        'depois de `sair()`, os pets da tutora anterior nao estao em lugar '
        'nenhum', (tester) async {
      final cache = CacheDeMeusPets();
      await abrirOApp(
        tester,
        rede: redeComPetsEComLogout(<Map<String, dynamic>>[petDoContrato()]),
        deposito: depositoLogado(),
        cacheDeMeusPets: cache,
      );
      await irParaAConta(tester);
      expect(cache.pets('u-1'), isNotNull);

      // Pelo controlador, e nao pelo botao: os QUATRO desfechos de `sair()`
      // passam por aqui, inclusive o que nao tem botao nenhum -- a sessao
      // derrubada por refresh recusado. Foi exatamente assim que este cache
      // sobreviveu quando a limpeza morava no `onPressed` de `abas.dart`.
      final escopo = Escopo.of(tester.element(find.byType(Scaffold).first));
      await escopo.sessao.sair();
      await tester.pumpAndSettle();

      expect(
        cache.pets('u-1'),
        isNull,
        reason: 'REPROVA: os pets da tutora que acabou de sair continuam no '
            'cache de `Perfil` > `Meus pets`, e o cache vive enquanto o '
            'processo viver. Nome, especie, porte, estado de caso aberto e '
            'quantas tags o animal tem ficam em memoria para a proxima pessoa '
            'que usar este aparelho -- o celular da recepcao do pet shop, o do '
            'casal, o usado que acabou de ser vendido. Descartar a tela nao '
            'resolve: ela e descartada e a entrada FICA, que e a mesma forma '
            'do defeito do cofre do QR.',
      );

      // "Em lugar nenhum" precisa valer para qualquer chave, e nao so para a
      // que este caso conhece: um `limpar()` que so esquecesse a lista e
      // mantivesse o dono deixaria o dado la, alcancavel por quem soubesse
      // pedir.
      for (final chave in <String>['u-1', 'u-2', 'qualquer-outra']) {
        expect(
          cache.pets(chave),
          isNull,
          reason: 'REPROVA: o cache ainda devolve alguma coisa para "$chave" '
              'depois do logout. Depois de `sair()` ele tem de estar como '
              'recem-criado.',
        );
      }
    });
  });

  // ------------------------------------------------------------------------
  // A ISCA DO CACHE DE IMAGEM EM DISCO (BICHUS-296).
  //
  // Medido pelo EFEITO e nao pela presenca da linha: depois de `sair()`, os
  // bytes da foto de uma conexao nao estao em lugar nenhum do disco.
  //
  // DESLIGAR PARA VER REPROVAR: em `lib/app.dart`, tire
  // `() async => _cacheDeImagens?.esquecerTodasAsPessoas()` da lista
  // `limpezasAoSair`. Reprova
  // `depois de `sair()`, a foto da conexao anterior nao esta no disco`.
  //
  // **`runAsync` nos trechos que tocam arquivo**: dentro de `testWidgets` o
  // relogio e falso e `pumpAndSettle` adianta TIMERS, nao I/O de disco. Sem
  // isso o caso penduraria com `pumpAndSettle timed out`, que nao aponta para
  // a causa.
  // ------------------------------------------------------------------------
  group(grupoDaIscaDoCacheDeImagens, () {
    /// Uma pasta por caso, apagada no fim. Duas execucoes dividindo diretorio
    /// de cache se destroem, e uma delas sai verde com o furo aberto.
    CacheDeImagensNoAparelho cacheEmPastaNova() {
      final pasta = Directory.systemTemp.createTempSync('bichu-logout-imagens');
      addTearDown(() {
        if (pasta.existsSync()) pasta.deleteSync(recursive: true);
      });
      return CacheDeImagensNoAparelho(pasta: () async => pasta);
    }

    final Uint8List bytesDaFoto = Uint8List.fromList(List<int>.filled(64, 9));

    testWidgets(
        'depois de `sair()`, a foto da conexao anterior nao esta no disco',
        (tester) async {
      final cache = cacheEmPastaNova();
      final daConexao = ChaveDeImagem.dePessoa(
        'https://m.bichu.app/u/4b2e/thumb.webp',
        apelido: 'marina',
      )!;

      await abrirOApp(
        tester,
        rede: redeComPetsEComLogout(<Map<String, dynamic>>[petDoContrato()]),
        deposito: depositoLogado(),
        cacheDeImagens: cache,
      );

      await tester.runAsync(() => cache.gravar(daConexao, bytesDaFoto));
      final antes = await tester.runAsync(() => cache.ler(daConexao));
      expect(
        antes,
        isNotNull,
        reason: 'A MEDICAO QUE SUSTENTA O RESTO: sem o arquivo em disco agora, '
            'o `isNull` abaixo mediria a limpeza de um cache que ja estava '
            'vazio -- passaria sempre, inclusive com o furo aberto.',
      );

      // Pelo controlador, e nao por um botao: os QUATRO desfechos de `sair()`
      // passam por aqui, inclusive o que nao tem botao nenhum -- a sessao
      // derrubada por refresh recusado.
      final escopo = Escopo.of(tester.element(find.byType(Scaffold).first));
      await tester.runAsync(() async {
        await escopo.sessao.sair();
        await Future<void>.delayed(const Duration(milliseconds: 100));
      });
      await tester.pump();

      final depois = await tester.runAsync(() => cache.ler(daConexao));
      expect(
        depois,
        isNull,
        reason: 'REPROVA: a foto de perfil de uma CONEXAO da pessoa que acabou '
            'de sair continua gravada no disco deste aparelho. A Emenda 3 do '
            'ADR-0010 (cliente, 19/10/2026) diz que a foto de uma pessoa '
            'aparece para outra "SO quando as duas pessoas ja aceitaram '
            'conexao" -- e quem entrar nesta conta depois nao e conexao de '
            'ninguem. Diferente das outras entradas desta lista, aqui o dado '
            'nao morre com o processo: ele sobrevive ao logout, ao app ser '
            'encerrado pelo sistema e ao aparelho ser desligado.',
      );
    });

    testWidgets('o logout NAO apaga a imagem publica, e isso e deliberado',
        (tester) async {
      // O CONTRAPESO. Sem este caso, "limpar tudo no logout" passaria no caso
      // acima e jogaria fora exatamente o que o cliente pediu em 26/10/2026 --
      // menos trafego e abertura mais rapida --, sem fechar risco nenhum: foto
      // de pet perdido e capa de encontro sao superficie publica e nao sao de
      // ninguem.
      final cache = cacheEmPastaNova();
      final publica = ChaveDeImagem.publica(
        'https://m.bichu.app/p/9f3a/card.webp',
      )!;

      await abrirOApp(
        tester,
        rede: redeComPetsEComLogout(<Map<String, dynamic>>[petDoContrato()]),
        deposito: depositoLogado(),
        cacheDeImagens: cache,
      );

      await tester.runAsync(() => cache.gravar(publica, bytesDaFoto));
      expect(await tester.runAsync(() => cache.ler(publica)), isNotNull);

      final escopo = Escopo.of(tester.element(find.byType(Scaffold).first));
      await tester.runAsync(() async {
        await escopo.sessao.sair();
        await Future<void>.delayed(const Duration(milliseconds: 100));
      });
      await tester.pump();

      expect(
        await tester.runAsync(() => cache.ler(publica)),
        isNotNull,
        reason: 'REPROVA: o logout apagou imagem PUBLICA. O cartaz de pet '
            'perdido existe para ser compartilhado -- a derivada mora em balde '
            'publico, sem assinatura e com cache de um ano --, nao pertence a '
            'conta que saiu e nao vaza nada para a proxima. Apaga-la troca o '
            'ganho que o cliente pediu por nenhuma protecao.',
      );
    });
  });

  // ------------------------------------------------------------------------
  // O REGISTRO. Este grupo nao mede comportamento do app: ele mede a LISTA,
  // que e a peca fragil. Ver o cabecalho do arquivo.
  // ------------------------------------------------------------------------
  group('O REGISTRO da lista `limpezasAoSair`', () {
    late String fonteDoApp;
    late Directory app;

    setUp(() {
      app = raizDoApp();
      fonteDoApp = File('${app.path}/lib/app.dart').readAsStringSync();
    });

    test('a lista de `app.dart` e exatamente a lista registrada aqui', () {
      final campos = camposDaLista(blocoDaLista(fonteDoApp)).toSet();
      final registrados = iscasDaLista.keys.toSet();

      final semIsca = campos.difference(registrados);
      expect(
        semIsca,
        isEmpty,
        reason: 'REPROVA: a lista `limpezasAoSair` ganhou entrada que ninguem '
            'registrou aqui: $semIsca. Toda entrada dessa lista apaga dado de '
            'uma conta no logout, e entrada sem isca e entrada que uma '
            'refatoracao apaga amanha sem nenhum caso ficar vermelho -- foi '
            'exatamente o que a BICHUS-238 encontrou. Escreva a isca da '
            'entrada nova (olhando o EFEITO: depois de `sair()`, o dado nao '
            'esta em lugar nenhum) e acrescente a linha em `iscasDaLista`.',
      );

      final sumiram = registrados.difference(campos);
      expect(
        sumiram,
        isEmpty,
        reason: 'REPROVA: entrada registrada SUMIU de `limpezasAoSair` em '
            '`lib/app.dart`: $sumiram. Se a remocao foi deliberada, ela tem '
            'de vir junto com a remocao da linha em `iscasDaLista` e com o '
            'motivo -- e ai a isca daquela entrada tambem reprova, que e o '
            'aviso que se quer. Se nao foi deliberada, o dado da conta '
            'anterior acabou de voltar a sobreviver ao logout.',
      );
    });

    test('cada isca registrada existe mesmo, no arquivo que ela diz', () {
      // O portao do portao: sem isto, `iscasDaLista` aceitaria nome inventado
      // e o registro viraria uma lista de promessas.
      for (final entrada in iscasDaLista.entries) {
        final arquivo = File('${app.path}/${entrada.value.arquivo}');
        expect(
          arquivo.existsSync(),
          isTrue,
          reason: 'REPROVA: `${entrada.key}` aponta para '
              '`${entrada.value.arquivo}`, e esse arquivo nao existe.',
        );
        expect(
          arquivo.readAsStringSync(),
          contains(entrada.value.grupo),
          reason: 'REPROVA: `${entrada.key}` diz que a isca dela e o grupo '
              '"${entrada.value.grupo}" em `${entrada.value.arquivo}`, e esse '
              'texto nao esta la. Registro que aponta para o nada e pior que '
              'registro nenhum: ele diz que a entrada tem prova quando ela '
              'nao tem.',
        );
      }
    });

    test('a lista tem pelo menos uma entrada', () {
      // Uma lista vazia passaria nos dois casos acima se alguem esvaziasse o
      // registro junto. Este caso e o piso: o app guarda dado de conta
      // em memoria, e o logout tem de apagar alguma coisa.
      expect(
        camposDaLista(blocoDaLista(fonteDoApp)),
        isNotEmpty,
        reason: 'REPROVA: `limpezasAoSair` ficou vazia. O app guarda cache de '
            'pets e a imagem do QR em memoria; logout que nao apaga nada '
            'entrega a conta anterior para quem entrar em seguida.',
      );
    });
  });

  // ------------------------------------------------------------------------
  // A DIVIDA da `FilaOffline` (BICHUS-201), com data e com quem a cobra.
  //
  // Nao e um comentario: e um caso que REPROVA no dia em que o prazo vence.
  // ------------------------------------------------------------------------
  group('a divida da `FilaOffline` tem dono, prazo e obrigacao', () {
    late Directory app;
    late List<String> ondeEstaLigada;

    setUp(() {
      app = raizDoApp();
      final fontes = Directory('${app.path}/lib')
          .listSync(recursive: true)
          .whereType<File>()
          .where((f) => f.path.endsWith('.dart'))
          .where((f) => !f.path.endsWith('api/fila_offline.dart'))
          .toList(growable: false);
      expect(
        fontes,
        isNotEmpty,
        reason: 'REPROVA: nao achei fonte nenhuma em `lib/`. Portao sem o que '
            'conferir reprova; verde por vazio e o defeito.',
      );
      ondeEstaLigada = fontes
          .where((f) => RegExp(r'\bFilaOffline\s*\(').hasMatch(
                f.readAsStringSync(),
              ))
          .map((f) => f.path.substring(app.path.length + 1))
          .toList(growable: false);
    });

    test('enquanto ela for codigo morto, o prazo vale', () {
      if (ondeEstaLigada.isNotEmpty) return;
      expect(
        DateTime.now().toUtc().isBefore(prazoDaFilaOffline),
        isTrue,
        reason: 'REPROVA: o prazo da divida da `FilaOffline` venceu em '
            '${prazoDaFilaOffline.toIso8601String()} e nada no app ainda a '
            'instancia. Sao 221 linhas de teste cobrindo codigo que nao roda: '
            'isso nao e seguranca, e a aparencia dela, e a proxima pessoa a '
            'ler a cobertura vai acreditar que o caminho offline existe. A '
            'decisao volta para a mesa AGORA, e ela e uma das duas: ligar a '
            'fila (a BICHUS-21, `Marcar o pet como perdido`, e a historia que '
            'a pede, criterio 6) ou apagar a classe e os dois arquivos de '
            'teste. Empurrar a data e a terceira, e ela precisa de motivo '
            'escrito nesta linha.',
      );
    });

    test('no dia em que ela for ligada, ela entra em `limpezasAoSair` junto',
        () {
      if (ondeEstaLigada.isEmpty) return;
      // A obrigacao que o cabecalho da propria classe declara, transformada em
      // caso. A fila guarda em DISCO o que a pessoa digitou -- nome do pet,
      // endereco de referencia, telefone de contato --, e fila que sobrevive
      // ao logout e dado de uma conta esperando a proxima pessoa que entrar
      // naquele aparelho.
      final bloco = blocoDaLista(
        File('${app.path}/lib/app.dart').readAsStringSync(),
      );
      expect(
        bloco.toLowerCase(),
        contains('fila'),
        reason: 'REPROVA: a `FilaOffline` passou a ser instanciada '
            '($ondeEstaLigada) e a limpeza dela NAO entrou em '
            '`limpezasAoSair` no `lib/app.dart`. Ela guarda dado da conta em '
            'disco, e disco sobrevive a tudo -- inclusive ao logout e ao app '
            'ser encerrado pelo sistema. O registro em `iscasDaLista` e a '
            'isca da entrada nova vem no mesmo commit.',
      );
    });

    test('a classe continua onde o registro diz que ela esta', () {
      // Sem isto, apagar a classe deixaria os dois casos acima verdes por
      // vazio: nenhum arquivo a instancia, e o prazo nunca mais seria cobrado.
      expect(
        File('${app.path}/lib/api/fila_offline.dart').existsSync(),
        isTrue,
        reason: 'REPROVA: `lib/api/fila_offline.dart` sumiu. Se a decisao foi '
            'remover a fila, este grupo inteiro sai junto, no mesmo commit, e '
            'a BICHUS-201 registra o motivo. O que nao pode e a classe sumir e '
            'o prazo continuar aqui cobrando um fantasma.',
      );
      expect(FilaOffline.teto, greaterThan(0));
    });
  });
}
