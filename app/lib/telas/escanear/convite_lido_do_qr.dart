/// O que separa o QR de **convite de conexão** do QR da plaquinha, e de
/// qualquer outro QR do mundo.
library;

/// O piso do token, copiado de `minLength` do contrato.
const int minimoDoTokenDeConvite = 20;

/// O teto do token, copiado de `maxLength` do contrato.
const int maximoDoTokenDeConvite = 64;

/// Os símbolos que base64url usa, e só eles.
final RegExp _alfabetoDoToken = RegExp(r'^[A-Za-z0-9_-]+$');

/// Extrai o token de convite de um QR lido, ou **nulo quando o conteúdo não tem
/// a forma de um token de convite**.
String? tokenDeConviteDoQr(String conteudo) {
  final bruto = conteudo.trim();
  if (bruto.length < minimoDoTokenDeConvite) return null;
  if (bruto.length > maximoDoTokenDeConvite) return null;
  if (!_alfabetoDoToken.hasMatch(bruto)) return null;
  return bruto;
}

/// Se [conteudo] tem a forma de um token de convite.
bool temFormaDeTokenDeConvite(String conteudo) =>
    tokenDeConviteDoQr(conteudo) != null;
