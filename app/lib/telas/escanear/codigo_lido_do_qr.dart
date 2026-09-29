/// O que separa o QR da plaquinha do Bichu de qualquer outro QR do mundo.
///
/// **Funcao pura, e num arquivo so.** A camera devolve texto; texto nao e
/// codigo de tag. O criterio 3 da BICHUS-54 exige que um QR de outra origem
/// seja recusado **sem sair da camera**, e recusar sem sair da camera quer
/// dizer recusar **aqui**, sem ida e volta de rede.
///
/// ## A regra, e por que ela e a forma da URL e nao um texto qualquer
///
/// O QR da plaquinha carrega **exatamente** `{base}/t/{codigo}`, a mesma
/// cadeia que a emissao devolve em `url` -- e isso esta garantido do outro
/// lado, em `src/modules/tags/domain/qr-da-tag.ts`, que emite as duas de uma
/// funcao so justamente para o QR e a linha legivel nunca apontarem para
/// lugares diferentes depois da prensa.
///
/// Entao a regra e a forma da URL, e **texto solto nao e aceito**. Um QR que
/// carregasse `7K2MQ1D4B8NV3XZ0` e 16 simbolos validos e passaria por um teste
/// de alfabeto; ele so nao e do Bichu. Quem tem o codigo em maos e nao tem o
/// QR usa a entrada manual, que e o caminho de igual valor e aceita a forma
/// solta de proposito.
///
/// ## O hospedeiro, e o que acontece quando o ambiente nao e producao
///
/// `bichu.app` e os subdominios dele valem sempre. O hospedeiro da
/// `apiBaseUrl` do build tambem vale, e e ele que faz a plaquinha de
/// homologacao ser lida pelo app de homologacao sem ninguem recompilar nada.
/// A lista **nao** e aberta: aceitar `/t/{codigo}` em qualquer hospedeiro
/// deixaria um cartaz colado no poste mandar o app resolver um codigo que o
/// dono do cartaz escolheu, e a resposta dessa resolucao e a pagina de um pet.
///
/// ## O que esta funcao NAO faz, e nao e esquecimento
///
/// Ela **nao normaliza** o codigo. A normalizacao dos cinco passos e do
/// contrato e roda no servidor (ADR-0004, e o criterio 7 da historia a
/// descreve passo a passo). Repeti-la aqui criaria a segunda fonte da mesma
/// regra, e a do aplicativo envelheceria no bolso de quem nao atualiza. O que
/// ela faz e uma conferencia de **forma**, deliberadamente mais larga que o
/// contrato: 16 simbolos do alfabeto tolerante, com `I`, `L` e `O` dentro
/// porque o servidor os substitui. Errar para o lado largo manda o caso
/// duvidoso para quem tem autoridade; errar para o lado estreito faria o app
/// recusar um codigo que o servidor aceitaria.
library;

import 'mascara_do_codigo_da_tag.dart';

/// O caminho que a URL da tag sempre tem, e so ele.
const String segmentoDaTag = 't';

/// O hospedeiro de producao, e a raiz dos subdominios aceitos.
const String hospedeiroDoBichu = 'bichu.app';

/// Extrai o codigo da tag de um QR lido, ou **nulo quando o QR nao e do
/// Bichu**.
///
/// [apiBaseUrl] entra por parametro em vez de ser lida do `AppConfig` aqui
/// dentro para que esta funcao continue pura: o caso de teste do hospedeiro de
/// homologacao e um `expect` e nao um app montado.
String? codigoDeTagDoQr(String conteudo, {required Uri apiBaseUrl}) {
  final bruto = conteudo.trim();
  if (bruto.isEmpty) return null;

  final endereco = _comoUri(bruto);
  if (endereco == null) return null;
  if (!_hospedeiroEDoBichu(endereco.host, apiBaseUrl: apiBaseUrl)) return null;

  // `pathSegments` ja descarta as barras vazias das pontas, entao
  // `/t/ABCD/` e `/t/ABCD` chegam iguais aqui.
  final trechos = endereco.pathSegments
      .where((trecho) => trecho.isNotEmpty)
      .toList(growable: false);
  if (trechos.length != 2) return null;
  if (trechos.first.toLowerCase() != segmentoDaTag) return null;

  final codigo = Uri.decodeComponent(trechos[1]);
  return temFormaDeCodigoDeTag(codigo) ? codigo : null;
}

/// Se [texto] tem a **forma** de um codigo de tag: 16 simbolos do alfabeto
/// tolerante, com ou sem hifen, em qualquer caixa.
///
/// Conferencia de forma, nunca de validade. O simbolo de verificacao da
/// Emenda 1 do ADR-0004 e conferido no servidor, e continua sendo.
///
/// Uma linha so, sobre [formaDoCodigoDeTag]: as duas conferem a MESMA coisa, e
/// a diferenca e que esta responde sim/nao e a outra diz **por que nao**. O
/// caminho do QR nao tem o que fazer com o motivo -- ninguem digitou nada, e um
/// QR que nao e do Bichu simplesmente nao e --, entao ele fica com esta. O
/// caminho digitado precisa do motivo para dizer a frase certa, e fica com a
/// outra. Derivar uma da outra e o que impede o app de aceitar num campo o que
/// recusa no campo ao lado.
bool temFormaDeCodigoDeTag(String texto) =>
    formaDoCodigoDeTag(texto) == FormaDoCodigo.valida;

/// O que ha de errado com a **forma** de um codigo digitado, quando ha algo.
///
/// Nao e um `bool` porque a mensagem que a pessoa le depende do motivo: "o
/// codigo tem 16 caracteres, voce digitou 26" e outra coisa que "confira o
/// codigo", e a diferenca entre as duas e a diferenca entre saber e nao saber
/// o que fazer em seguida.
///
/// **Nenhum membro aqui fala do simbolo de verificacao**, e a ausencia e
/// deliberada. Ele e do servidor (ADR-0004, Emenda 1, e
/// `src/modules/tags/domain/tag-code.ts`); repetir a aritmetica dele aqui
/// criaria a segunda fonte da mesma regra, e a do aplicativo envelheceria no
/// bolso de quem nao atualiza o app. Forma o app confere; validade o servidor
/// decide.
enum FormaDoCodigo {
  /// 16 simbolos, todos do alfabeto tolerante. **Forma valida nao quer dizer
  /// codigo valido**: o simbolo de verificacao ainda pode estar errado, e
  /// quem diz isso e a resposta de `GET /v1/tags/{code}`.
  valida,

  /// Nenhum simbolo. Campo vazio, ou so separadores.
  vazia,

  /// Menos de 16 simbolos.
  curta,

  /// Mais de 16 simbolos. **O caso do cliente**: 26 simbolos colados de uma
  /// plaquinha da forma antiga.
  longa,

  /// Tem caractere que o codigo nao usa -- na pratica `U`, o unico
  /// alfanumerico de fora, porque ele nao tem substituicao em Crockford e
  /// nunca aparece num codigo emitido.
  foraDoAlfabeto,
}

/// Diagnostica a forma de [texto], contando simbolos como o servidor conta.
///
/// **Tamanho antes de alfabeto**, e a ordem importa para quem le a tela: com os
/// dois problemas juntos, o numero e o fato que a pessoa consegue conferir
/// olhando a plaquinha, e o caractere de fora aparece na segunda passada. A
/// ordem inversa faria quem colou 26 simbolos ouvir falar de um `U` no meio
/// deles.
FormaDoCodigo formaDoCodigoDeTag(String texto) {
  var simbolos = 0;
  var temForasteiro = false;
  for (final caractere in texto.toUpperCase().split('')) {
    // Os separadores da forma impressa. **Descartar separador nao e descartar
    // entrada**: `normalizarCodigoDaTag` tira `[^0-9A-Za-z]` no servidor, e o
    // hifen da plaquinha e a forma de ler o codigo, nao parte dele.
    if (caractere == '-' || caractere == ' ' || caractere == '.') continue;
    simbolos += 1;
    if (!MascaraDoCodigoDaTag.aceitos.hasMatch(caractere)) temForasteiro = true;
  }
  if (simbolos == 0) return FormaDoCodigo.vazia;
  if (simbolos < MascaraDoCodigoDaTag.simbolos) return FormaDoCodigo.curta;
  if (simbolos > MascaraDoCodigoDaTag.simbolos) return FormaDoCodigo.longa;
  if (temForasteiro) return FormaDoCodigo.foraDoAlfabeto;
  return FormaDoCodigo.valida;
}

/// Quantos simbolos [texto] tem, ignorando os separadores da forma impressa.
///
/// Existe para a mensagem poder dizer o numero. Um texto que diga "tamanho
/// errado" sem o numero devolve a pessoa ao trabalho de contar 26 caracteres a
/// mao, e foi para nao contar que ela colou.
int simbolosDoCodigo(String texto) {
  var simbolos = 0;
  for (final caractere in texto.split('')) {
    if (caractere == '-' || caractere == ' ' || caractere == '.') continue;
    simbolos += 1;
  }
  return simbolos;
}

/// Le o texto como URI, aceitando a forma impressa sem esquema.
///
/// A plaquinha imprime `bichu.app/t/<codigo>` sem `https://` (ADR-0004: o TLD
/// `.app` esta na lista de pre-carregamento de HSTS, e sao oito caracteres a
/// menos numa etiqueta em que cada caractere disputa espaco com o QR). O QR em
/// si carrega a forma absoluta, mas quem gerar um QR a partir da linha
/// legivel gera a outra, e as duas sao a mesma plaquinha.
Uri? _comoUri(String bruto) {
  final tentativa = Uri.tryParse(bruto);
  if (tentativa != null && tentativa.hasScheme && tentativa.host.isNotEmpty) {
    // `mailto:`, `tel:`, `javascript:` e companhia nao tem hospedeiro e ja
    // caem fora acima. O que sobra e conferido pelo hospedeiro.
    return tentativa;
  }
  // Sem esquema, `Uri.parse` poe tudo no caminho e deixa o hospedeiro vazio.
  final comEsquema = Uri.tryParse('https://$bruto');
  if (comEsquema == null || comEsquema.host.isEmpty) return null;
  return comEsquema;
}

bool _hospedeiroEDoBichu(String host, {required Uri apiBaseUrl}) {
  final alvo = host.toLowerCase();
  if (alvo == hospedeiroDoBichu) return true;
  if (alvo.endsWith('.$hospedeiroDoBichu')) return true;
  final daApi = apiBaseUrl.host.toLowerCase();
  return daApi.isNotEmpty && alvo == daApi;
}
