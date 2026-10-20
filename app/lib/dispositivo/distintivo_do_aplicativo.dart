/// O CAMINHO DO NUMERO NO ICONE DO APLICATIVO -- construido, e INERTE.
///
/// Pedido do cliente (20/10/2026), literal: *"e o icone do aplicativo, quando
/// ficar fechado, tambem vai ficar com +1, igual o instagram e linkedin
/// fazem"*.
///
/// Este arquivo existe para o caminho ter um lugar, um nome e um portao. Ele
/// **nao acende nada hoje**, e as tres razoes abaixo foram medidas, nao
/// supostas.
///
/// ## A PRIMEIRA COISA A ENTENDER: com o app FECHADO, isto nao e codigo Dart
///
/// Com o aplicativo encerrado nao ha isolate rodando, e nenhuma linha deste
/// arquivo executa. O numero no icone, nesse estado, vem **da mensagem de
/// push**, pintado pelo sistema operacional:
///
///   * iOS -- `apns.payload.aps.badge` na mensagem;
///   * Android -- o lancador soma os avisos ATIVOS do canal, e o numero exato
///     sai de `android.notification.notification_count`.
///
/// Quer dizer: **o numero do icone com o app fechado e trabalho de SERVIDOR,
/// na carga do push, e nao do aplicativo.** Esta porta cobre o outro estado --
/// app em primeiro plano ou em segundo plano vivo --, e e por isso que ela
/// existe apesar de inerte: no dia em que o push sair, os dois estados tem de
/// mostrar o mesmo numero, e o caminho do estado vivo nao pode nascer naquele
/// dia.
///
/// ## O QUE FALTA PARA ACENDER. Sao quatro coisas, e nenhuma e minha de fazer
///
/// 1. **A carga do push nao leva contagem nenhuma.** Medido em
///    `src/modules/notifications/adapters/external/fcm-http-v1.ts`: nao existe
///    bloco `apns` -- a ausencia esta comentada no proprio arquivo, e e por
///    causa da chave APNs pendente -- e o bloco `android` leva
///    `collapse_key` e imagem, e **nao** leva `notification_count`. Sem isto,
///    o icone nao recebe numero em nenhuma plataforma, com o app fechado.
/// 2. **O push nao sai.** O transporte escolhido em homologacao e
///    `log-push-sender.ts`, que nao envia: o arquivo diz, literal, que *"sem
///    ele `fcm` nao tem para onde enviar"*. Em producao o bloqueio e a
///    permissao da conta de servico na VM.
/// 3. **Nao ha pacote que pinte o numero no estado vivo.** Varrido o
///    `pubspec.yaml` em 20/10/2026: `firebase_messaging` esta declarado,
///    `flutter_local_notifications` **nao esta**, e nao ha nenhum pacote de
///    distintivo de icone. Pintar o numero com o app aberto exige um, mais a
///    configuracao por plataforma -- e pacote novo e decisao de dependencia,
///    nao conserto de quem liga um contador.
/// 4. **iOS nao tem como, e nao e questao de codigo.** Falta a chave APNs
///    (`.p8`), que e da conta Apple (BICHUS-136), e no aparelho do cliente o
///    provisionamento e gratuito -- sem a capacidade de push declarada, nenhum
///    push chega, com qualquer carga. A decisao de 23/09 ja e so Android.
///
/// ## O QUE ESTE ARQUIVO SE PROIBE DE FAZER, e o defeito que isso evita
///
/// **Nenhuma tela afirma que a pessoa sera avisada.** Houve um defeito exato
/// desta forma neste produto: o servidor respondia `owner_notified: true`, a
/// tela repetia a frase e o app ainda tinha um `?? true` por cima -- tres
/// lugares afirmando juntos um aviso que nao saiu. Uma porta que devolvesse
/// "pronto" sem acender nada seria o quarto.
///
/// Entao [definir] **devolve o que aconteceu**, e o que aconteceu hoje e
/// [ResultadoDoDistintivo.naoAplicado]. Quem chamar e guardar o resultado tem
/// a verdade na mao; quem ignorar o retorno nao ganha uma mentira, ganha
/// nada.
///
/// ## COMO ACENDER, no dia em que as quatro acima cairem
///
/// Trocar [DistintivoInerte] por uma implementacao de verdade na construcao de
/// `ContadoresDeNaoLido`, em `app.dart`. Nada mais muda: o contador ja chama
/// esta porta a cada numero novo, e o portao de
/// `app/test/telas/contador_do_auau_test.dart` ja cobra que ela e chamada com
/// o numero certo.
library;

/// O que aconteceu com o pedido de pintar o numero no icone.
enum ResultadoDoDistintivo {
  /// Pintado. **Nenhuma implementacao devolve isto hoje**, e nao e descuido:
  /// ver a lista de quatro no cabecalho deste arquivo.
  aplicado,

  /// O caminho recebeu o numero e **nao pintou**. E o valor honesto de hoje.
  naoAplicado,
}

/// A porta. Uma implementacao, e ela nao acende.
abstract interface class DistintivoDoAplicativo {
  /// Recebe a contagem, devolve o que aconteceu de verdade.
  ///
  /// Sincrona de proposito: uma `Future` convidaria quem chama a esperar por
  /// algo que nao acontece, e a espera de um contador nao pode atrasar o
  /// quadro em que a aba pinta.
  ResultadoDoDistintivo definir(int naoLidas);
}

/// A implementacao de hoje: recebe o numero e **nao faz nada com ele**.
///
/// Nao e um esboco e nao lanca `UnimplementedError`: lancar faria o contador
/// -- que a chama a cada numero novo -- quebrar a tela por causa de um
/// recurso que nunca foi prometido. Ela e a resposta correta enquanto as
/// quatro pendencias do cabecalho estiverem de pe.
final class DistintivoInerte implements DistintivoDoAplicativo {
  const DistintivoInerte();

  @override
  ResultadoDoDistintivo definir(int naoLidas) => ResultadoDoDistintivo.naoAplicado;
}
