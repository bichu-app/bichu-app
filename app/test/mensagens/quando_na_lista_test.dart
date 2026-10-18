// O "quando" da linha da lista, e o selo do sino.
//
// O relogio entra por argumento em `QuandoNaLista.de`, e e por isso que estes
// casos existem: a virada de dia e o unico lugar em que esta funcao erra na
// pratica, e sem o relogio injetado ela so seria observavel deixando a suite
// rodando ate a meia-noite.

import 'package:bichu/api/modelos_conversa.dart';
import 'package:bichu/formato/quando.dart';
import 'package:flutter_test/flutter_test.dart';

void main() {
  group('QuandoNaLista', () {
    // Uma quarta-feira, 18:30.
    final agora = DateTime(2026, 10, 14, 18, 30);

    test('hoje sai como hora, com dois digitos', () {
      expect(
        QuandoNaLista.de(DateTime(2026, 10, 14, 9, 5), agora: agora),
        '09:05',
      );
      expect(
        QuandoNaLista.de(DateTime(2026, 10, 14, 14, 2), agora: agora),
        '14:02',
      );
    });

    test('ISCA: a virada de dia -- 23:59 de ontem NAO e "hoje"', () {
      // Uma hora e meia de diferenca, e dois dias do calendario. Uma funcao
      // escrita sobre `difference(agora).inDays` responderia "hoje" aqui,
      // porque 1h30 arredonda para zero dia -- e a lista diria a hora de uma
      // mensagem de ontem como se fosse de hoje.
      final ontemTarde = DateTime(2026, 10, 13, 23, 59);
      expect(
        QuandoNaLista.de(ontemTarde, agora: DateTime(2026, 10, 14, 1, 30)),
        'ontem',
      );
    });

    test('CONTRAPESO: 00:01 de hoje E "hoje", e nao "ontem"', () {
      // Sem este contrapeso, uma funcao que respondesse "ontem" para tudo
      // passaria na isca acima.
      expect(
        QuandoNaLista.de(
          DateTime(2026, 10, 14, 0, 1),
          agora: DateTime(2026, 10, 14, 1, 30),
        ),
        '00:01',
      );
    });

    test('nos ultimos 7 dias sai o dia da semana', () {
      // 12/10/2026 e uma segunda.
      expect(QuandoNaLista.de(DateTime(2026, 10, 12, 10), agora: agora), 'seg');
      // 9/10/2026 e uma sexta.
      expect(QuandoNaLista.de(DateTime(2026, 10, 9, 10), agora: agora), 'sex');
    });

    test('antes de 7 dias sai dia e mes abreviado', () {
      expect(
        QuandoNaLista.de(DateTime(2026, 10, 2, 10), agora: agora),
        '2 out',
      );
      expect(
        QuandoNaLista.de(DateTime(2026, 1, 31, 10), agora: agora),
        '31 jan',
      );
    });

    test('instante no FUTURO cai em hoje, e nao numa frase sobre o futuro', () {
      // O relogio do aparelho pode estar atrasado em relacao ao servidor. A
      // alternativa seria o app chamar de errado um dado que esta certo.
      expect(
        QuandoNaLista.de(DateTime(2026, 10, 14, 23, 50), agora: agora),
        '23:50',
      );
    });
  });

  group('seloDoContador e rotuloDoSino', () {
    test('ISCA: zero NAO desenha selo', () {
      // Um `0` pintado chama o olho para dizer que nao ha motivo para olhar.
      expect(seloDoContador(0), isNull);
      expect(seloDoContador(-7), isNull);
    });

    test('ISCA: o selo corta em 9+, porque tres digitos nao cabem', () {
      expect(seloDoContador(10), '9+');
      expect(seloDoContador(237), '9+');
    });

    test('CONTRAPESO: de 1 a 9 o numero sai inteiro', () {
      expect(seloDoContador(1), '1');
      expect(seloDoContador(9), '9');
    });

    test('ISCA: quem OUVE a tela recebe o numero real, e nunca "9 mais"', () {
      // O corte existe porque tres digitos nao cabem em 64 dp de barra, e essa
      // restricao e de quem VE. Anunciar "nove mais" para quem tem 23 seria
      // aplicar a quem ouve um limite que nao e dele.
      expect(rotuloDoSino(23), 'Mensagens, 23 não lidas');
      expect(rotuloDoSino(237), 'Mensagens, 237 não lidas');
      expect(rotuloDoSino(23), isNot(contains('9+')));
    });

    test('o singular e o vazio', () {
      expect(rotuloDoSino(1), 'Mensagens, 1 não lida');
      expect(rotuloDoSino(0), 'Mensagens');
    });
  });
}
