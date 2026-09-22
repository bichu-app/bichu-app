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
bool temFormaDeCodigoDeTag(String texto) {
  var simbolos = 0;
  for (final caractere in texto.toUpperCase().split('')) {
    if (caractere == '-' || caractere == ' ' || caractere == '.') continue;
    if (!MascaraDoCodigoDaTag.aceitos.hasMatch(caractere)) return false;
    simbolos += 1;
    if (simbolos > MascaraDoCodigoDaTag.simbolos) return false;
  }
  return simbolos == MascaraDoCodigoDaTag.simbolos;
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
