/// O telefone brasileiro: mascara para quem digita, **E.164 para a API**.
///
/// ## Por que este arquivo nasceu, e onde procurei antes
///
/// **Nao havia telefone digitavel em lugar nenhum do app** ate 17/10/2026.
/// Procurei em `app/lib/formato/` (ha `dinheiro.dart` e `email.dart`, e mais
/// nada), em `app/lib/widgets/` e em `app/lib/telas/` -- a unica mascara do
/// app e `MascaraDoCodigoDaTag`, que e de outra coisa. O telefone do
/// destinatario da plaquinha e o primeiro campo de telefone que alguem digita
/// neste app, e por isso a mascara mora aqui, ao lado das outras duas, e nao
/// dentro do formulario que a usou primeiro.
///
/// ## A outra metade desta regra vive no painel, em outra linguagem
///
/// `admin/src/formato/telefone.ts` (BICHUS, 17/10) faz o mesmo trabalho para o
/// backoffice. **Nao da para importar TypeScript em Dart**, entao a duplicacao
/// aqui e de LINGUAGEM e nao de decisao -- e para ela nao virar duas verdades,
/// as regras abaixo sao deliberadamente as MESMAS daquele arquivo:
///
/// - fixo de oito digitos, celular de nove, distinguidos pela QUANTIDADE e
///   nunca pelo primeiro digito;
/// - mascara progressiva, que formata o que ja existe sem esperar o campo
///   encher;
/// - digito alem do teto e DESCARTADO na digitacao, e nao aceito para ser
///   recusado depois;
/// - a mascara mexe no que se ve e **nao decide o que vai para a API**. Quem
///   decide e [telefoneEmE164], e ela recusa devolvendo `null` em vez de
///   adivinhar.
///
/// ## Aqui e `+55`, e la nao e
///
/// A diferenca e de dominio, e nao divergencia: o telefone do diretorio aceita
/// E.164 de qualquer pais, porque o produto nao promete que toda clinica seja
/// brasileira. **Este telefone e de uma entrega no Brasil** -- o endereco que
/// ele acompanha tem CEP e UF brasileiros --, e o contrato exige
/// `^\+55\d{10,11}$`, o mesmo padrao de `MeUpdate.phone_e164`. Aceitar outro
/// pais aqui produziria um valor que o servidor recusaria.
library;

import 'package:flutter/services.dart';

/// O prefixo do Brasil.
const String discagemDoBrasil = '55';

const int digitosDoFixo = 8;
const int digitosDoCelular = 9;
const int _digitosDoDdd = 2;

/// DDD + fixo, e DDD + celular. Os dois unicos tamanhos aceitos.
const int _minimoDeDigitos = _digitosDoDdd + digitosDoFixo;
const int _maximoDeDigitos = _digitosDoDdd + digitosDoCelular;

/// O maximo que a mascara brasileira ocupa: `(11) 98765-4321`.
const int limiteDoTelefone = 15;

/// **A MESMA forma do contrato** (`^\+55\d{10,11}$`), e nao uma segunda
/// redacao dela: `MeUpdate.phone_e164` e `DeliveryAddress.recipient_phone`
/// declaram esta expressao, e um campo que aceitasse mais produziria 400.
final RegExp formaDeE164DoBrasil = RegExp(r'^\+55\d{10,11}$');

String _somenteDigitos(String valor) => valor.replaceAll(RegExp(r'[^0-9]'), '');

/// O que a pessoa digitou, na gramatica brasileira que se le.
///
/// Progressiva de proposito: formata o que ja existe sem esperar o campo ficar
/// completo, porque mascara que so aparece no ultimo digito faz o campo
/// parecer quebrado enquanto se digita.
String mascaraDeTelefone(String bruto) {
  final digitos = _somenteDigitos(bruto);
  if (digitos.isEmpty) return '';

  final cortado = digitos.length > _maximoDeDigitos
      ? digitos.substring(0, _maximoDeDigitos)
      : digitos;

  if (cortado.length <= _digitosDoDdd) return '($cortado';

  final ddd = cortado.substring(0, _digitosDoDdd);
  final resto = cortado.substring(_digitosDoDdd);

  // O ponto de corte e o nono digito depois do DDD: ate oito, le-se como
  // fixo (`3061-2200`); com nove, como celular (`98765-4321`).
  final tamanhoDoPrefixo = resto.length > digitosDoFixo ? 5 : 4;
  if (resto.length <= tamanhoDoPrefixo) return '($ddd) $resto';

  final prefixo = resto.substring(0, tamanhoDoPrefixo);
  final sufixo = resto.substring(tamanhoDoPrefixo);
  return '($ddd) $prefixo-$sufixo';
}

/// O E.164 do servidor **na gramatica da tela**, para preencher o campo.
///
/// ## Por que ela precisa existir, e por que `mascaraDeTelefone` nao serve
///
/// `mascaraDeTelefone` le DIGITOS DIGITADOS, e nao E.164: ela descarta tudo o
/// que nao e digito, inclusive o `+`, e ai `+5511987654321` entra como os treze
/// digitos `5511987654321`, e cortado em onze vira `55119876543` -- `(55)
/// 11987-6543`. O numero aparece ERRADO na tela, e, pior, um `Salvar` o
/// reencoda para `+5555119876543` e grava um telefone que nao e o da pessoa.
/// Foi assim que `tela_dados_pessoais.dart` abria: ela preenchia o campo com
/// `mascaraDeTelefone(dados.telefone)`, e `dados.telefone` e E.164.
///
/// **O par desta funcao vive no painel** (`admin/src/formato/telefone.ts`,
/// `telefoneDoE164`), e as regras sao as mesmas, de proposito: sem `+55` na
/// frente, ou com uma quantidade nacional que nao e 10 nem 11, devolve o valor
/// CRU -- mostrar o que o servidor mandou e melhor que mostrar uma mascara
/// mentirosa sobre um numero que esta forma nao descreve.
String telefoneDoE164(String? e164) {
  if (e164 == null || e164.isEmpty) return '';
  final digitos = _somenteDigitos(e164);
  if (!digitos.startsWith(discagemDoBrasil)) return e164;
  final nacional = digitos.substring(discagemDoBrasil.length);
  if (nacional.length != _minimoDeDigitos &&
      nacional.length != _maximoDeDigitos) {
    return e164;
  }
  return mascaraDeTelefone(nacional);
}

/// O valor que vai para a API, ou `null` quando o que foi digitado nao serve.
///
/// **A unica funcao deste arquivo que produz valor de contrato.** Ela nao
/// adivinha: numero curto demais, longo demais ou com DDD impossivel devolve
/// `null`, e quem chama decide o que dizer a pessoa.
String? telefoneEmE164(String bruto) {
  var digitos = _somenteDigitos(bruto);

  // `+55` digitado, ou colado de outro lugar: o prefixo sai antes da contagem,
  // senao um numero correto pareceria ter digito demais.
  if (digitos.length > _maximoDeDigitos && digitos.startsWith(discagemDoBrasil)) {
    digitos = digitos.substring(discagemDoBrasil.length);
  }
  if (digitos.length < _minimoDeDigitos || digitos.length > _maximoDeDigitos) {
    return null;
  }
  // DDD brasileiro comeca em 11. `0` e `1` na primeira casa nao existem, e
  // aceita-los produziria um E.164 com a forma certa e o numero errado.
  final ddd = int.tryParse(digitos.substring(0, _digitosDoDdd));
  if (ddd == null || ddd < 11) return null;

  final e164 = '+$discagemDoBrasil$digitos';
  return formaDeE164DoBrasil.hasMatch(e164) ? e164 : null;
}

/// A mascara aplicada enquanto se digita.
///
/// Fora de [mascaraDeTelefone] de proposito: a funcao pura e testavel sem
/// Flutter, e e ela que o teste exercita.
class MascaraDeTelefone extends TextInputFormatter {
  const MascaraDeTelefone();

  @override
  TextEditingValue formatEditUpdate(
    TextEditingValue antes,
    TextEditingValue depois,
  ) {
    final formatado = mascaraDeTelefone(depois.text);
    return TextEditingValue(
      text: formatado,
      // O cursor no fim: a mascara so cresce a direita enquanto se digita, e
      // manter o deslocamento antigo o jogaria para o meio do parenteses.
      selection: TextSelection.collapsed(offset: formatado.length),
    );
  }
}
