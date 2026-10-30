/// O que separa o QR da plaquinha do Bichu de qualquer outro QR do mundo.
library;

import 'mascara_do_codigo_da_tag.dart';

/// O caminho que a URL da tag sempre tem, e so ele.
const String segmentoDaTag = 't';

/// O hospedeiro de producao, e a raiz dos subdominios aceitos.
const String hospedeiroDoBichu = 'bichu.app';

/// Extrai o codigo da tag de um QR lido, ou **nulo quando o QR nao e do
/// Bichu**.
String? codigoDeTagDoQr(String conteudo, {required Uri apiBaseUrl}) {
  final bruto = conteudo.trim();
  if (bruto.isEmpty) return null;

  final endereco = _comoUri(bruto);
  if (endereco == null) return null;
  if (!_hospedeiroEDoBichu(endereco.host, apiBaseUrl: apiBaseUrl)) return null;

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
bool temFormaDeCodigoDeTag(String texto) =>
    formaDoCodigoDeTag(texto) == FormaDoCodigo.valida;

/// O que ha de errado com a **forma** de um codigo digitado, quando ha algo.
enum FormaDoCodigo {
  /// 16 simbolos, todos do alfabeto tolerante.
  valida,

  /// Nenhum simbolo. Campo vazio, ou so separadores.
  vazia,

  /// Menos de 16 simbolos.
  curta,

  /// Mais de 16 simbolos. **O caso do cliente**: 26 simbolos colados de uma
  /// plaquinha da forma antiga.
  longa,

  /// Tem caractere que o codigo nao usa -- na pratica `U`, o unico alfanumerico
  /// de fora, porque ele nao tem substituicao em Crockford e nunca aparece num
  /// codigo emitido.
  foraDoAlfabeto,
}

/// Diagnostica a forma de [texto], contando simbolos como o servidor conta.
FormaDoCodigo formaDoCodigoDeTag(String texto) {
  var simbolos = 0;
  var temForasteiro = false;
  for (final caractere in texto.toUpperCase().split('')) {
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
int simbolosDoCodigo(String texto) {
  var simbolos = 0;
  for (final caractere in texto.split('')) {
    if (caractere == '-' || caractere == ' ' || caractere == '.') continue;
    simbolos += 1;
  }
  return simbolos;
}

/// Le o texto como URI, aceitando a forma impressa sem esquema.
Uri? _comoUri(String bruto) {
  final tentativa = Uri.tryParse(bruto);
  if (tentativa != null && tentativa.hasScheme && tentativa.host.isNotEmpty) {
    return tentativa;
  }
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
