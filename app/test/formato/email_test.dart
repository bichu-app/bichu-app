import 'package:bichu/formato/email.dart';
import 'package:flutter_test/flutter_test.dart';

/// ESCRITO E NAO RODADO (regra do cliente nesta tarefa).
void main() {
  group('e-mail: apara espaco e NAO abaixa a caixa', () {
    test('apara espaco em volta', () {
      expect(emailParaEnvio('  leandro@tecla.test  '), 'leandro@tecla.test');
      expect(emailParaEnvio('\tleandro@tecla.test\n'), 'leandro@tecla.test');
    });

    test('ISCA: a caixa que a pessoa escreveu CHEGA INTEIRA no contrato', () {
      // Quem normaliza e `normalizarEmail` em
      // `src/modules/identity/domain/email.ts` (trim + toLowerCase). Uma
      // segunda normalizacao no aparelho criaria duas definicoes do mesmo
      // endereco. Se este caso reprovar, alguem pos `toLowerCase()` no app.
      expect(emailParaEnvio('Leandro@Tecla.Test'), 'Leandro@Tecla.Test');
      expect(
        emailParaEnvio(' A.B+etiqueta@Exemplo.COM '),
        'A.B+etiqueta@Exemplo.COM',
      );
    });
  });

  group('e-mail: conferencia tolerante, sem mascara', () {
    test('endereco incomum passa', () {
      for (final endereco in <String>[
        'leandro@tecla.test',
        'a.b+etiqueta@exemplo.com.br',
        'x@y.co',
        "o'brien@exemplo.test",
      ]) {
        expect(emailPlausivel(endereco), isTrue, reason: endereco);
      }
    });

    test('o obviamente errado nao passa', () {
      for (final endereco in <String>[
        '',
        '   ',
        'leandro',
        '@tecla.test',
        'leandro@',
        'leandro@tecla',
        'leandro@.test',
      ]) {
        expect(emailPlausivel(endereco), isFalse, reason: endereco);
      }
    });
  });

  group('a conferencia ao sair do campo', () {
    test('campo vazio nao erra ao sair', () {
      expect(erraAoSairDoCampo(''), isFalse);
      expect(erraAoSairDoCampo('   '), isFalse);
    });

    test('campo escrito e implausivel erra ao sair', () {
      expect(erraAoSairDoCampo('leandro'), isTrue);
      expect(erraAoSairDoCampo('leandro@tecla'), isTrue);
    });

    test('a mensagem e UMA LINHA', () {
      expect(erroAoSairDoEmail, 'Confira o e-mail.');
      expect(erroAoSairDoEmail.contains('\n'), isFalse);
      expect(erroAoSairDoEmail.length, lessThan(40));
    });
  });
}
