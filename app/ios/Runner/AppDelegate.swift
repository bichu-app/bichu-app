import Flutter
import UIKit

/// O canal `app.bichu/calendario` no iOS, **espelho do `MainActivity.kt`**.
///
/// ## O defeito que ele conserta
///
/// O cliente mediu em 20/10/2026: *"o botao de adicionar o evento ao
/// calendario no ios nao esta funcionando"*. A causa nao era permissao, nao
/// era formato de data e nao era fuso: **nao havia handler nenhum**. O Dart
/// chamava `app.bichu/calendario`, o engine nao achava quem respondesse,
/// `invokeMethod` levantava `MissingPluginException`, e
/// `SaidaDoAparelho.adicionarAoCalendario` a pegava e devolvia `false`. A tela
/// dizia "Nao conseguimos abrir o calendario" e estava tecnicamente correta --
/// e nada, em lugar nenhum, dizia por que.
///
/// ## Por que `.ics`, e nao EventKit
///
/// A hipotese natural e que falta `NSCalendarsUsageDescription` no
/// `Info.plist`. **Ela descreve o outro caminho.** EventKit
/// (`EKEventStore`/`EKEventEditViewController`) LE e GRAVA o calendario, e por
/// isso exige a chave, exige `NSCalendarsWriteOnlyAccessUsageDescription` no
/// iOS 17+, e faz o sistema PERGUNTAR a pessoa.
///
/// O Android nunca fez nada disso. `Intent.ACTION_INSERT` so abre a tela de
/// "novo evento" ja preenchida -- quem salva e a pessoa, no app dela --, e o
/// `MainActivity.kt` diz, na prosa dele, que e por isso que o app nao pede
/// `READ_CALENDAR` nem `WRITE_CALENDAR`.
///
/// Um arquivo `.ics` e o equivalente exato no iOS: o Calendario o reconhece,
/// abre a folha "Adicionar evento" com os campos preenchidos, e **espera o
/// toque da pessoa**. Nenhuma permissao, nenhuma chave de justificativa,
/// nenhum dialogo do sistema -- e a invariante que `saida_do_app.dart`
/// declara ("cinco saidas, e nenhuma pede permissao") continua inteira nos
/// DOIS sistemas.
///
/// Escolher EventKit aqui teria custado uma chave nova no `Info.plist`, um
/// dialogo de permissao que o Android nao mostra, e uma assimetria de produto
/// -- a mesma classe de assimetria que este commit existe para fechar.
@main
@objc class AppDelegate: FlutterAppDelegate, FlutterImplicitEngineDelegate {
  /// O nome do canal, **igual ao do `MainActivity.kt` e ao do
  /// `saida_do_app.dart`**. Tres copias da mesma cadeia e o preco de o canal
  /// ser um contrato entre linguagens; errar uma letra aqui devolve o app ao
  /// defeito de 20/10, calado.
  private static let canalDoCalendario = "app.bichu/calendario"

  /// **Campo, e nao variavel local, e isso nao e estilo.**
  ///
  /// `UIDocumentInteractionController` nao e retido por quem o apresenta: solto
  /// numa variavel local ele e desalocado no fim do metodo, a folha nunca
  /// aparece, e `presentPreview` ja devolveu `true`. O botao responderia
  /// "abriu" e a tela nao apareceria -- defeito pior que o que estamos
  /// consertando, porque este nem a mensagem de falha mostra.
  private var apresentadorDoIcs: UIDocumentInteractionController?

  override func application(
    _ application: UIApplication,
    didFinishLaunchingWithOptions launchOptions: [UIApplication.LaunchOptionsKey: Any]?
  ) -> Bool {
    return super.application(application, didFinishLaunchingWithOptions: launchOptions)
  }

  func didInitializeImplicitFlutterEngine(_ engineBridge: FlutterImplicitEngineBridge) {
    GeneratedPluginRegistrant.register(with: engineBridge.pluginRegistry)

    // **Aqui, e nao em `didFinishLaunchingWithOptions`.** Com `UIScene` o
    // `FlutterViewController` ainda nao existe no fim do lancamento, e o
    // caminho classico (`window?.rootViewController as? FlutterViewController`)
    // devolve `nil` sem reclamar -- o canal ficaria sem registro exatamente
    // como esta hoje, e o conserto nasceria com o defeito dentro.
    let canal = FlutterMethodChannel(
      name: AppDelegate.canalDoCalendario,
      binaryMessenger: engineBridge.applicationRegistrar.messenger()
    )
    canal.setMethodCallHandler { [weak self] chamada, resposta in
      guard chamada.method == "adicionar" else {
        resposta(FlutterMethodNotImplemented)
        return
      }
      guard let self else {
        resposta(false)
        return
      }
      resposta(self.abrirFolhaDeNovoEvento(chamada.arguments as? [String: Any] ?? [:]))
    }
  }

  // -------------------------------------------------------------------------
  // A folha de "novo evento"
  // -------------------------------------------------------------------------

  /// Escreve o `.ics` e pede ao sistema que o abra. Devolve se a folha subiu.
  ///
  /// **Os nomes dos argumentos sao os do `MainActivity.kt`** (`titulo`,
  /// `inicioEmMs`, `fimEmMs`, `local`, `descricao`), porque e o mesmo mapa que
  /// o Dart monta uma vez para os dois sistemas.
  private func abrirFolhaDeNovoEvento(_ argumentos: [String: Any]) -> Bool {
    // `inicioEmMs` e o unico campo sem o qual nao ha evento: sem instante, o
    // Calendario nao tem onde desenhar. Os outros tres sao opcionais no
    // Android tambem -- `putExtra` com `nil` simplesmente nao poe o campo.
    guard let inicioEmMs = (argumentos["inicioEmMs"] as? NSNumber)?.doubleValue else {
      return false
    }
    let fimEmMs = (argumentos["fimEmMs"] as? NSNumber)?.doubleValue

    let ics = Self.textoDoIcs(
      titulo: argumentos["titulo"] as? String,
      inicio: Date(timeIntervalSince1970: inicioEmMs / 1000),
      // Nulo de proposito quando o encontro nao declara fim: o Calendario poe
      // a duracao padrao dele, e o app nao inventa uma. Mesma regra do
      // `EventoDeCalendario.fim` em `saida_do_app.dart`.
      fim: fimEmMs.map { Date(timeIntervalSince1970: $0 / 1000) },
      local: argumentos["local"] as? String,
      descricao: argumentos["descricao"] as? String
    )

    // **`temporaryDirectory`, e o arquivo some com a sessao.** O `.ics` nao e
    // dado do produto: ele e o recado que atravessa a fronteira para o
    // Calendario, e guardar recado em `Documents` e lixo que cresce.
    //
    // O nome e fixo, e nao com carimbo de tempo: dois toques seguidos no
    // mesmo botao sobrescrevem o mesmo arquivo em vez de deixarem dois.
    let destino = FileManager.default.temporaryDirectory
      .appendingPathComponent("encontro-do-bichu.ics")
    do {
      try ics.write(to: destino, atomically: true, encoding: .utf8)
    } catch {
      // Disco cheio ou sandbox recusando. A tela diz que nao conseguiu, que e
      // o mesmo desfecho do Android sem app de calendario.
      return false
    }

    // **Confere ANTES de apresentar, e descarta o resultado.** O
    // `presentPreview` nao recebe a tela: ele a pede ao delegate, e o
    // protocolo pede nao-opcional -- sem cena ativa, o delegate devolveria um
    // `UIViewController` vazio e a folha subiria sobre o nada, devolvendo
    // `true`. Esta linha e o que impede o botao de mentir.
    guard Self.telaQueApresenta() != nil else { return false }

    let folha = UIDocumentInteractionController(url: destino)
    folha.delegate = self
    folha.uti = "com.apple.ical.ics"
    apresentadorDoIcs = folha

    // `presentPreview` devolve se a PREVIA subiu, e nao o que a pessoa fez
    // nela -- exatamente como `startActivity` no Android, e exatamente o que
    // `adicionarAoCalendario` promete a quem chama. Cancelar a folha e um
    // desfecho legitimo, e a tela nao reclama dele.
    if folha.presentPreview(animated: true) { return true }

    // Nao subiu: nenhum app reivindica `.ics`. Improvavel no iPhone de
    // fabrica (o Calendario vem instalado) e possivel em aparelho gerenciado
    // por empresa, com o Calendario removido por politica.
    apresentadorDoIcs = nil
    return false
  }

  /// A tela em cima da qual a folha sobe.
  ///
  /// **Pela cena ativa, e nao por `UIApplication.shared.windows`**, que esta
  /// obsoleto desde o iOS 15 e devolve janela de qualquer cena -- inclusive a
  /// do teclado externo e a de um `CarPlay`. `presentPreview` sobre a janela
  /// errada nao aparece para ninguem e devolve `true`.
  private static func telaQueApresenta() -> UIViewController? {
    let cenas = UIApplication.shared.connectedScenes
      .compactMap { $0 as? UIWindowScene }
      .filter { $0.activationState == .foregroundActive }
    let janelas = cenas.flatMap(\.windows)
    return (janelas.first(where: \.isKeyWindow) ?? janelas.first)?.rootViewController
  }

  // -------------------------------------------------------------------------
  // O `.ics`
  // -------------------------------------------------------------------------

  /// Os instantes do `.ics` vao em **UTC**, com o `Z` no fim.
  ///
  /// O Dart manda `millisecondsSinceEpoch`, que e instante absoluto; o
  /// Calendario desenha no fuso do aparelho. Escrever hora local aqui
  /// (`DTSTART:20261025T190000`, sem `Z`) faria o encontro andar quando a
  /// pessoa viajasse -- e seria o defeito que `EventoDeCalendario.inicio`
  /// documenta ter evitado do lado do Dart.
  ///
  /// `Locale(identifier: "en_US_POSIX")` e obrigatorio: com o locale do
  /// aparelho, um iPhone em calendario budista (`th_TH`) escreveria o ANO
  /// 2569, e o arquivo sairia com uma data que ninguem pediu.
  private static let formatoUtc: DateFormatter = {
    let f = DateFormatter()
    f.locale = Locale(identifier: "en_US_POSIX")
    f.timeZone = TimeZone(secondsFromGMT: 0)
    f.dateFormat = "yyyyMMdd'T'HHmmss'Z'"
    return f
  }()

  /// Escapa um valor TEXT do iCalendar (RFC 5545, secao 3.3.11).
  ///
  /// **A contrabarra vem primeiro**, e a ordem e a correcao inteira: trocar
  /// `,` por `\,` antes de escapar `\` escaparia a contrabarra que acabou de
  /// ser escrita, e o titulo chegaria ao Calendario com `\\,` -- uma
  /// contrabarra visivel no nome do evento.
  ///
  /// Titulo e descricao sao texto de TERCEIRO: quem cria o encontro na `Rede`
  /// digita o que quiser, e `;` e `,` em "Feira de adocao, Sabado; 10h" sem
  /// escape partem o campo em tres propriedades do ponto de vista do parser.
  private static func escapado(_ bruto: String) -> String {
    return bruto
      .replacingOccurrences(of: "\\", with: "\\\\")
      .replacingOccurrences(of: ";", with: "\\;")
      .replacingOccurrences(of: ",", with: "\\,")
      .replacingOccurrences(of: "\r\n", with: "\\n")
      .replacingOccurrences(of: "\n", with: "\\n")
      .replacingOccurrences(of: "\r", with: "\\n")
  }

  /// O arquivo inteiro.
  ///
  /// **`\r\n` entre as linhas, e nao `\n`**: a RFC 5545 exige CRLF, e o
  /// Calendario do iOS recusa o arquivo calado quando ele vem com LF puro --
  /// a folha simplesmente nao abre, e o botao volta a "nao conseguimos".
  ///
  /// **Sem `UID`, sem `DTSTAMP` e sem `METHOD`, e as tres ausencias sao
  /// deliberadas.** Elas pertencem a convite (`METHOD:REQUEST`), que tem
  /// organizador, participantes e resposta; aqui o arquivo e um RASCUNHO que a
  /// pessoa salva no calendario dela. `METHOD` faria o Calendario tratar a
  /// folha como convite recebido e oferecer "Aceitar/Recusar" para um evento
  /// que ninguem enviou a ninguem.
  static func textoDoIcs(
    titulo: String?,
    inicio: Date,
    fim: Date?,
    local: String?,
    descricao: String?
  ) -> String {
    var linhas: [String] = [
      "BEGIN:VCALENDAR",
      "VERSION:2.0",
      // O identificador do produtor. Texto livre pela RFC, e e o que aparece
      // em ferramenta de diagnostico quando alguem abre o arquivo para
      // entender de onde ele veio.
      "PRODID:-//Bichu//Rede//PT-BR",
      "BEGIN:VEVENT",
      "DTSTART:\(formatoUtc.string(from: inicio))",
    ]
    if let fim { linhas.append("DTEND:\(formatoUtc.string(from: fim))") }
    // Campo vazio nao e escrito: `SUMMARY:` pelado faz o Calendario desenhar
    // um evento sem nome, e o `MainActivity.kt` tambem nao poe extra nulo.
    if let titulo, !titulo.isEmpty { linhas.append("SUMMARY:\(escapado(titulo))") }
    if let local, !local.isEmpty { linhas.append("LOCATION:\(escapado(local))") }
    if let descricao, !descricao.isEmpty {
      linhas.append("DESCRIPTION:\(escapado(descricao))")
    }
    linhas.append("END:VEVENT")
    linhas.append("END:VCALENDAR")
    return linhas.joined(separator: "\r\n") + "\r\n"
  }
}

extension AppDelegate: UIDocumentInteractionControllerDelegate {
  func documentInteractionControllerViewControllerForPreview(
    _ controller: UIDocumentInteractionController
  ) -> UIViewController {
    // `telaQueApresenta()` ja respondeu uma vez antes de `presentPreview`, e
    // responde de novo aqui porque o protocolo pede nao-opcional. O
    // `UIViewController()` vazio e inalcancavel na pratica e existe para nao
    // haver `!` neste arquivo: um `fatalError` aqui derrubaria o app por causa
    // de um botao de calendario.
    return AppDelegate.telaQueApresenta() ?? UIViewController()
  }

  /// A folha fechou: solta o apresentador.
  ///
  /// Sem isto ele vive pelo resto da sessao, e com ele o `.ics` aberto. Nao e
  /// vazamento grande -- um controlador e um arquivo de 300 bytes --, mas e o
  /// tipo de referencia que cresce por toque num botao que a pessoa pode
  /// tocar vinte vezes.
  func documentInteractionControllerDidDismissOpenInMenu(
    _ controller: UIDocumentInteractionController
  ) {
    apresentadorDoIcs = nil
  }

  func documentInteractionControllerDidEndPreview(
    _ controller: UIDocumentInteractionController
  ) {
    apresentadorDoIcs = nil
  }
}
