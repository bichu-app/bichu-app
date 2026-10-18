import 'package:bichu/formato/telefone.dart';
import 'package:flutter_test/flutter_test.dart';

// ---------------------------------------------------------------------------
// ESTE ARQUIVO FOI ESCRITO E **NAO FOI EXECUTADO**
// ---------------------------------------------------------------------------
//
// Por decisao de quem pediu a entrega (17/10/2026), nenhuma suite rodou nesta
// branch. Rodou `flutter analyze`. **Nenhuma afirmacao aqui esta provada.**
//
// ---------------------------------------------------------------------------
// O QUE ESTE ARQUIVO MEDE, E POR QUE ELE EXISTE SEPARADO DA TELA
// ---------------------------------------------------------------------------
//
// A mascara e a conversao para E.164 sao funcoes puras, e o teste delas nao
// precisa de Flutter nem de tela. Separa-las importa por um motivo concreto:
// `telefoneEmE164` e a UNICA funcao que produz valor de contrato, e um defeito
// nela sai como 400 numa rota autenticada -- longe daqui, e dificil de ligar
// a causa.
//
// **O par desta regra vive no painel, em TypeScript**
// (`admin/src/formato/telefone.ts`). Nao da para importar um do outro, entao
// os casos abaixo sao deliberadamente os mesmos que aquele arquivo afirma:
// fixo de oito, celular de nove, mascara progressiva, digito a mais
// descartado. Quando um dos dois mudar, o outro reprova aqui.

void main() {
  group('mascaraDeTelefone — progressiva, e na gramatica que se le', () {
    test('vazio continua vazio', () {
      expect(mascaraDeTelefone(''), '');
      expect(mascaraDeTelefone('abc'), '');
    });

    test('formata enquanto se digita, sem esperar o campo encher', () {
      expect(mascaraDeTelefone('1'), '(1');
      expect(mascaraDeTelefone('11'), '(11');
      expect(mascaraDeTelefone('119'), '(11) 9');
      // `(11) 9876-5`, COM o hifen. As duas implementacoes do par -- esta e a
      // do painel (`admin/src/formato/telefone.ts`, linhas 74-88) -- cortam em
      // 4+4 ate oito digitos depois do DDD, e com cinco digitos no resto o
      // quinto ja cai depois do hifen. As duas dizem a mesma coisa em prosa,
      // com estas palavras: "a troca acontece no digito, nao no fim da
      // digitacao". A isca pedia o hifen so a partir do oitavo digito, que
      // nenhuma das duas faz -- e o painel, cujo arquivo esta nomeado aqui
      // como a referencia, produz `(11) 9876-5` para esta entrada.
      expect(mascaraDeTelefone('1198765'), '(11) 9876-5');
    });

    test('oito digitos depois do DDD leem como FIXO', () {
      expect(mascaraDeTelefone('1130612200'), '(11) 3061-2200');
    });

    test('nove digitos depois do DDD leem como CELULAR', () {
      expect(mascaraDeTelefone('11987654321'), '(11) 98765-4321');
    });

    test('digito alem do teto e DESCARTADO, e nao aceito para recusar depois', () {
      expect(mascaraDeTelefone('119876543219999'), '(11) 98765-4321');
    });

    test('o que a pessoa colou formatado continua valendo', () {
      expect(mascaraDeTelefone('(11) 98765-4321'), '(11) 98765-4321');
    });
  });

  group('telefoneEmE164 — a unica que produz valor de contrato', () {
    test('celular e fixo viram `+55` e os digitos', () {
      expect(telefoneEmE164('11987654321'), '+5511987654321');
      expect(telefoneEmE164('(11) 98765-4321'), '+5511987654321');
      expect(telefoneEmE164('1130612200'), '+551130612200');
    });

    test('o `+55` colado de outro lugar nao e contado duas vezes', () {
      expect(telefoneEmE164('+55 11 98765-4321'), '+5511987654321');
      expect(telefoneEmE164('5511987654321'), '+5511987654321');
    });

    test('curto, longo ou vazio RECUSA, e nao adivinha', () {
      expect(telefoneEmE164(''), isNull);
      expect(telefoneEmE164('987654321'), isNull);
      expect(telefoneEmE164('119876543219'), isNull);
    });

    test('DDD impossivel recusa: forma certa com numero errado e pior', () {
      // Nao existe DDD comecando em 0 nem em 1 sozinho.
      expect(telefoneEmE164('0198765432'), isNull);
      expect(telefoneEmE164('1098765432'), isNull);
    });

    test('o que sai casa com o `pattern` do contrato', () {
      // A mesma forma que `DeliveryAddress.recipient_phone` e
      // `MeUpdate.phone_e164` declaram. Um valor que passasse aqui e falhasse
      // la seria 400 numa rota autenticada.
      final valor = telefoneEmE164('11987654321');
      expect(valor, isNotNull);
      expect(RegExp(r'^\+55\d{10,11}$').hasMatch(valor!), isTrue);
    });
  });
}
