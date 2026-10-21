// **O PORTAO DE ROTULO DO SELO DE VALIDADO, numa fonte so.**
//
// As palavras que o rotulo acessivel de um selo de validado **nao pode
// conter**, em nenhuma forma, e a varredura que as cobra.
//
// ---------------------------------------------------------------------------
// POR QUE ELE SAIU DE DENTRO DE `selo_de_validado_test.dart`
// ---------------------------------------------------------------------------
// A lista nasceu la, em 21/10/2026, para o selo que os OUTROS veem. No mesmo
// dia o cliente mandou unificar a regua do selo com a do selo do DONO, e
// pediu de passagem: *"Tambem revisa o rotulo 'Conta validada' daquela tela,
// que promete mais do que entrega."*
//
// Entao sao DUAS telas com rotulo de selo, e a escolha aqui foi **estender o
// portao que existe** em vez de escrever um segundo. Duas listas de palavras
// proibidas seriam duas definicoes de "rotulo honesto", e a segunda
// envelheceria calada -- exatamente a forma do defeito que o cliente acabou de
// mandar consertar na regua.
//
// ---------------------------------------------------------------------------
// O QUE O ROTULO PODE PROMETER
// ---------------------------------------------------------------------------
// O booleano e `contact_channel_verified`, que no servidor e
// `email_verified_at IS NOT NULL OR phone_verified_at IS NOT NULL`. Ele prova
// **um canal de contato confirmado** -- hoje, e-mail -- e NADA sobre
// documento, identidade ou conferencia humana. Palavra dele, 21/10/2026:
// *"nao estamos validando documentos de faco, apenas e-mail por enquanto e
// futuramente telefone"*.
//
// Quem usa leitor de tela recebe SO o rotulo, e nao tem o glifo para
// interpretar: um rotulo dizendo "usuario verificado" faria o produto assinar
// por uma conferencia de identidade que ninguem faz.
//
// `confirmado` **nao** esta na lista de proposito, porque e exatamente o que o
// dado prova; o que esta e "confirmado pela equipe", que afirma um revisor que
// nao existe.

import 'package:flutter_test/flutter_test.dart';

/// As palavras proibidas, em minusculas e por substring.
///
/// **Por substring e nao por palavra inteira**: "verificad" pega verificado,
/// verificada e verificacao numa entrada so, e e a flexao que escaparia de uma
/// lista de palavras exatas.
const List<String> palavrasProibidasNoRotulo = <String>[
  'verificad', // verificado, verificada, verificação
  'confiáve', // confiável
  'confiave',
  'confiança',
  'confianca',
  'autentic', // autenticado
  'identidade',
  'documento',
  'pela equipe',
  'pela nossa equipe',
  'oficial',
  'validad', // validado, validada -- "Conta validada" (tela do dono, 21/10)
];

/// Verdadeiro quando [rotulo] contem alguma das palavras proibidas.
///
/// Existe separado de [conferirRotuloDoSelo] porque a **isca da isca** precisa
/// da resposta como valor: ela alimenta rotulos mentirosos de propósito e exige
/// que a varredura os veja.
bool rotuloPrometeDemais(String rotulo) {
  final String baixo = rotulo.toLowerCase();
  return palavrasProibidasNoRotulo.any(baixo.contains);
}

/// Reprova se o rotulo do selo prometer mais do que o dado prova.
///
/// [onde] entra na mensagem porque as duas telas chamam esta funcao, e uma
/// reprovacao que nao diga qual delas manda quem le procurar nas duas.
void conferirRotuloDoSelo(String rotulo, {required String onde}) {
  final String baixo = rotulo.toLowerCase();
  for (final String proibida in palavrasProibidasNoRotulo) {
    expect(
      baixo.contains(proibida),
      isFalse,
      reason:
          'o rotulo acessivel do selo em $onde contem "$proibida" ("$rotulo"). '
          'O booleano prova um canal de contato confirmado (hoje, e-mail) e '
          'NADA sobre documento, identidade ou conferencia humana -- e um '
          'rotulo que afirme isso faz o produto assinar por uma conferencia '
          'que ninguem faz.',
    );
  }
}
