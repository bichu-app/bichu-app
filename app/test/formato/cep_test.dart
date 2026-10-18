import 'package:bichu/formato/cep.dart';
import 'package:flutter/services.dart';
import 'package:flutter_test/flutter_test.dart';

// ---------------------------------------------------------------------------
// ESTE ARQUIVO FOI ESCRITO E **NAO FOI EXECUTADO**
// ---------------------------------------------------------------------------
//
// Por decisao de quem pediu a entrega (18/10/2026), nenhuma suite rodou nesta
// branch. Rodou `flutter analyze` e os portoes offline. **Nenhuma afirmacao
// aqui esta provada.**
//
// ---------------------------------------------------------------------------
// AS DUAS ISCAS QUE O CLIENTE PEDIU POR EXTENSO, E A LINHA QUE AS SEPARA
// ---------------------------------------------------------------------------
//
// A mascara entrou em 18/10 ("coloque mascara no campo cep de todos os
// formularios"), e com ela entrou um risco novo e preciso: **a tela passa a
// mostrar `01310-100` e o contrato continua esperando `01310100`**. Essa
// divergencia nao e pega por portao nenhum -- `oasdiff` compara contratos,
// `verificar-conformidade-do-app` compara tipos, e nenhum dos dois olha o que
// o `TextEditingController` guarda. Ela sai como 400 em producao, no aparelho
// de quem preencheu tudo certo.
//
// Entao sao duas iscas, e cada uma pega um lado:
//
//   1. **[cepParaOContrato] devolve a forma do CONTRATO**, oito digitos sem
//      hifen, e e ela a unica tradutora. Falha se alguem fizer a tela mandar
//      `controlador.text`, ou se a funcao passar a devolver com hifen;
//   2. **[mascaraDeCep] aceita digitacao CONTINUA, sem hifen.** Falha se
//      alguem "endurecer" a mascara para exigir o hifen, ou passar a recusar
//      o valor incompleto -- e recusar e justamente o que ela nao pode fazer:
//      no formulario de achado, CEP incompleto nao trava `Registrar`.
//
// **DESLIGAR PARA VER REPROVAR**, em `app/lib/formato/cep.dart`:
//
//   - troque o `return digitos` de `cepParaOContrato` por
//     `return mascaraDeCep(digitos)`: o grupo 1 reprova inteiro, e e
//     exatamente o defeito que manda `22041-001` contra `^[0-9]{8}$`;
//   - troque a guarda de `mascaraDeCep` por
//     `if (!bruto.contains('-')) return '';`: o grupo 2 reprova, e e a mascara
//     exigindo o hifen que ela mesma deveria pôr.

void main() {
  group('a mascara MOSTRA, e e progressiva', () {
    test('o hifen nasce sozinho no sexto digito', () {
      expect(mascaraDeCep('0'), '0');
      expect(mascaraDeCep('01310'), '01310');
      expect(mascaraDeCep('013101'), '01310-1');
      expect(mascaraDeCep('01310100'), '01310-100');
    });

    test('digito alem do teto e DESCARTADO, e nao aceito para recusar depois',
        () {
      expect(
        mascaraDeCep('013101009999'),
        '01310-100',
        reason: 'REPROVA: a mascara deixou passar mais de oito digitos. Digito '
            'a mais que entra no campo vira recusa do servidor mais tarde, '
            'longe de onde foi digitado.',
      );
    });

    test('vazio continua vazio: a mascara nao inventa hifen', () {
      expect(mascaraDeCep(''), '');
      expect(mascaraDeCep('abc'), '');
    });
  });

  // -------------------------------------------------------------------------
  // ISCA 1 -- O FORMATO ENVIADO NAO PODE DIVERGIR DO CONTRATO
  // -------------------------------------------------------------------------
  group('ISCA — o que vai para o servidor e a forma do contrato', () {
    test('devolve oito digitos SEM hifen, venha como vier', () {
      for (final digitado in <String>[
        '01310100',
        '01310-100',
        '01.310-100',
        ' 01310-100 ',
      ]) {
        expect(
          cepParaOContrato(digitado),
          '01310100',
          reason: 'REPROVA: "$digitado" nao produziu a forma do contrato. '
              '`TagRequestInput.postal_code` e '
              '`DirectorySuggestionInput.postal_code` declaram oito digitos '
              'sem hifen, e qualquer outra forma volta como 400 no aparelho '
              'de quem preencheu tudo certo.',
        );
      }
    });

    test('o que a mascara MOSTRA passa pela tradutora sem sobra', () {
      // O par exato que a tela produz: a mascara formata, a tradutora traduz,
      // e o resultado tem de bater com o `pattern` do contrato. Este caso e o
      // que liga as duas pontas -- sem ele, as duas funcoes podem estar certas
      // sozinhas e erradas juntas.
      final naTela = mascaraDeCep('01310100');
      expect(naTela, '01310-100');
      expect(
        formaDoCepNoContrato.hasMatch(naTela),
        isFalse,
        reason: 'A FORMA DA TELA NAO E A DO CONTRATO, e e por isso que a '
            'tradutora existe. Se este `expect` passar a dar `true`, alguem '
            'tirou o hifen da mascara e o cliente pediu o hifen.',
      );
      expect(
        cepParaOContrato(naTela),
        '01310100',
        reason: 'REPROVA: a tela mostra uma forma que a tradutora nao sabe '
            'traduzir. Esta e A divergencia que nenhum portao do projeto pega.',
      );
    });

    test('incompleto devolve null, e null NAO e recusa', () {
      for (final curto in <String>['', '0131', '0131010', 'abcdefgh']) {
        expect(
          cepParaOContrato(curto),
          isNull,
          reason: 'REPROVA: "$curto" produziu valor de contrato. A funcao nao '
              'adivinha: quem chama decide, e nas quatro telas a decisao e '
              'nao mandar o campo -- nunca marcar erro.',
        );
      }
    });
  });

  // -------------------------------------------------------------------------
  // ISCA 2 -- A MASCARA NAO PODE RECUSAR DIGITACAO CONTINUA
  // -------------------------------------------------------------------------
  group('ISCA — digitacao continua, sem hifen, nao e recusada', () {
    test('digitar os oito seguidos chega a `01310-100`, tecla por tecla', () {
      const mascara = MascaraDeCep();
      var valor = TextEditingValue.empty;
      for (final tecla in '01310100'.split('')) {
        final digitado = TextEditingValue(
          text: '${valor.text}$tecla',
          selection: TextSelection.collapsed(offset: valor.text.length + 1),
        );
        valor = mascara.formatEditUpdate(valor, digitado);
        expect(
          valor.text,
          isNotEmpty,
          reason: 'REPROVA: a mascara apagou o campo no meio da digitacao. '
              'Ela FORMATA e nao valida -- apagar o que a pessoa escreveu e a '
              'forma mais rapida de ela desistir do formulario.',
        );
      }
      expect(
        valor.text,
        '01310-100',
        reason: 'REPROVA: a digitacao continua sem hifen nao chegou ao CEP '
            'formatado. Ninguem digita o hifen: a mascara existe para pô-lo.',
      );
      expect(
        valor.selection.baseOffset,
        valor.text.length,
        reason: 'REPROVA: o cursor nao ficou no fim, e vai cair antes do hifen '
            'na proxima tecla.',
      );
    });

    test('letra e simbolo nao passam, e o que ja havia NAO e perdido', () {
      const mascara = MascaraDeCep();
      final comCinco = mascara.formatEditUpdate(
        TextEditingValue.empty,
        const TextEditingValue(text: '01310'),
      );
      final comLixo = mascara.formatEditUpdate(
        comCinco,
        TextEditingValue(text: '${comCinco.text}a'),
      );
      expect(
        comLixo.text,
        '01310',
        reason: 'REPROVA: a letra entrou no campo de CEP, ou o que já estava '
            'digitado foi descartado junto com ela.',
      );
    });

    test('o teto do campo cabe a mascara: nove, e nao oito', () {
      expect(
        limiteDoCep,
        mascaraDeCep('01310100').length,
        reason: 'REPROVA: o `limite` dos campos nao cabe o que a mascara '
            'mostra. Com 8, o `maxLength` do `BichuField` corta o ultimo '
            'digito EM SILENCIO -- o CEP fica errado na tela e no corpo.',
      );
    });
  });
}
