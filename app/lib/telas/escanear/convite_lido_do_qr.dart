/// O que separa o QR de **convite de conexão** do QR da plaquinha, e de
/// qualquer outro QR do mundo.
///
/// **Função pura, e num arquivo só**, pelo mesmo motivo de
/// `codigo_lido_do_qr.dart`: a câmera devolve texto, e texto não é credencial.
/// Recusar sem sair da câmera quer dizer recusar **aqui**, sem ida e volta de
/// rede.
///
/// ## O QR DO CONVITE CARREGA O TOKEN CRU, E ISSO É O CONTRÁRIO DA PLAQUINHA
///
/// A plaquinha carrega `{base}/t/{codigo}` — uma URL — e o cabeçalho de
/// `qr_da_plaquinha.dart` defende aquela escolha com duas medições: o leitor do
/// app exige a forma da URL, e **a câmera comum do celular abre URL**, servida
/// por `web/src/pages/t/[code].astro`, que é a página de quem achou o pet.
/// Um QR só serve os dois casos, e por isso não há escolha a fazer lá.
///
/// **Aqui as duas medições apontam para o outro lado**, e as quatro estão
/// escritas para ninguém "consertar" isto depois:
///
/// 1. **O destino do convite exige conta.** `resolveConnectionInvite` é
///    `bearerAuth` sem alternativa vazia. Quem aponta a câmera comum para o QR
///    e não tem conta no Bichu não tem como chegar ao perfil de ninguém — a
///    URL não compraria nada para quem a abrisse.
/// 2. **A página não existe.** `web/src/pages/` não tem diretório para
///    convite, e o caminho que o protótipo rascunhou — `/c/{token}` — **já é
///    de outra coisa**: `/c/{finderToken}` é a conversa do achador (ADR-0017).
///    Os outros seis caminhos públicos também estão ocupados.
/// 3. **O app não abre por link.** `AndroidManifest.xml` tem **um**
///    `intent-filter`, MAIN/LAUNCHER, e nenhum `android:host`; o
///    `assetlinks.json` da borda está com a lista vazia. Nenhum endereço
///    `https://` abre este binário, nem por App Link nem por `intent://`.
/// 4. **O servidor recusa montar o endereço**, e escreveu por quê:
///    *"devolver URL absoluta amarraria o convite ao domínio do dia"*. E o app
///    não tem de onde montá-lo — `AppConfig` conhece `API_BASE_URL` e mais
///    nada, e as URLs de superfície web deste produto entram inteiras por
///    `--dart-define` justamente para ninguém compor `<base>/caminho` de uma
///    página que não desenhou.
///
/// Somadas: um QR com URL seria um QR que, lido pela câmera comum, abre um
/// **404** — e o 404 deste site serve um cartão de pré-visualização que diz,
/// com estas letras, `Esta página não existe no site do Bichu`. Essa é
/// exatamente a classe de defeito que `site_page_availability` foi criada para
/// conter. Um QR com o token cru, lido pela câmera comum, mostra texto sem
/// sentido — que é um não-evento, e não uma afirmação falsa.
///
/// ## AS DUAS FORMAS SÃO MUTUAMENTE EXCLUSIVAS POR CONSTRUÇÃO
///
/// Não há ordem de tentativa que mude o resultado, e isso é o que permite o
/// leitor reusar o caminho do achador sem risco de quebrá-lo:
///
/// | | plaquinha | convite |
/// |---|---|---|
/// | forma | URL com hospedeiro e caminho `/t/` | **uma palavra só**, sem `.`, sem `/`, sem `:` |
/// | tamanho | **16** símbolos | **20 a 64** (são 43 na prática) |
/// | alfabeto | base32 tolerante, maiúsculas, com `-`/espaço/`.` de separador | base64url: maiúscula, minúscula, dígito, `-` e `_` |
///
/// O alfabeto do token **não tem `.`, `/` nem `:`**, então `bichu.app/t/ABC` é
/// recusado aqui pela própria forma, sem precisar de nenhum caso especial. E
/// um código de plaquinha de 16 símbolos é recusado pelo piso de 20. As duas
/// recusas são da forma, e não de uma lista de exceções que alguém precise
/// manter.
///
/// ## O QUE ESTA FUNÇÃO NÃO FAZ, e não é esquecimento
///
/// Ela **não diz se o convite vale**. Vencido, revogado e inexistente são o
/// mesmo 404 do servidor, de propósito, e nenhum deles tem forma diferente.
/// O que ela faz é conferência de **forma**, para o app não gastar uma
/// requisição — e o teto de 20 tentativas inválidas por hora — com texto que
/// não podia ser um token.
library;

/// O piso do token, copiado de `minLength` do contrato.
///
/// **A faixa é larga de propósito, e o contrato é que a escolheu:** o gerador
/// produz 43 caracteres (32 bytes em base64url), e o contrato declara 20 a 64
/// em vez de fixar 43. Conferir 43 aqui seria apertar mais que o contrato, e o
/// lado apertado é o lado errado de errar: faria o app recusar um token que o
/// servidor aceitaria no dia em que o gerador mudasse de tamanho.
const int minimoDoTokenDeConvite = 20;

/// O teto do token, copiado de `maxLength` do contrato.
const int maximoDoTokenDeConvite = 64;

/// Os símbolos que base64url usa, e só eles.
final RegExp _alfabetoDoToken = RegExp(r'^[A-Za-z0-9_-]+$');

/// Extrai o token de convite de um QR lido, ou **nulo quando o conteúdo não
/// tem a forma de um token de convite**.
///
/// Nulo aqui não quer dizer "QR estranho": quer dizer *"não é um convite"*. É
/// o leitor que decide o que fazer com isso, e o que ele faz é tentar a outra
/// forma — a da plaquinha — antes de dizer que o código não é do Bichu.
String? tokenDeConviteDoQr(String conteudo) {
  final bruto = conteudo.trim();
  if (bruto.length < minimoDoTokenDeConvite) return null;
  if (bruto.length > maximoDoTokenDeConvite) return null;
  if (!_alfabetoDoToken.hasMatch(bruto)) return null;
  return bruto;
}

/// Se [conteudo] tem a forma de um token de convite.
///
/// Existe para quem só precisa do sim/não não ter de comparar com nulo — a
/// mesma divisão que `temFormaDeCodigoDeTag` faz do lado da plaquinha.
bool temFormaDeTokenDeConvite(String conteudo) =>
    tokenDeConviteDoQr(conteudo) != null;
