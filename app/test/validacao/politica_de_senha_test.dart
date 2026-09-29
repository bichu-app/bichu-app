import 'dart:io';

import 'package:bichu/validacao/politica_de_senha.dart';
import 'package:flutter_test/flutter_test.dart';

/// ISCAS da politica de senha espelhada no aparelho.
///
/// A regra que os casos abaixo guardam, nas duas direcoes:
///
/// > **A tela mostra exatamente as regras que o servidor aplica.** Nem uma a
/// > mais -- exigir composicao frustra sem motivo --, nem uma a menos --
/// > esconder uma regra deixa a pessoa levar erro depois de enviar.
///
/// O lado "nem uma a mais" e o que o pedido do cliente tocou: ele pediu
/// "caractere especial", e a politica do servidor **nao** exige composicao, de
/// proposito (NIST SP 800-63B, ADR-0003).
void main() {
  group('ISCA — o conjunto de regras e o do servidor, medido no arquivo dele',
      () {
    /// O `password-policy.ts`, lido do disco.
    ///
    /// **Reprova alto quando nao acha.** Um caso que compare a tela com um
    /// arquivo ausente fica verde por vazio, e a divergencia que ele existe
    /// para pegar passa exatamente no dia em que alguem mover o arquivo.
    File arquivoDaPolitica() {
      const caminho = 'src/modules/identity/domain/password-policy.ts';
      var dir = Directory.current.absolute;
      while (true) {
        final candidato = File('${dir.path}/$caminho');
        if (candidato.existsSync()) return candidato;
        final pai = dir.parent;
        if (pai.path == dir.path) break;
        dir = pai;
      }
      throw StateError(
        'REPROVA: nao achei `$caminho` subindo a partir de '
        '"${Directory.current.path}". Esta isca compara a lista da tela com a '
        'politica do servidor; sem o arquivo nao ha o que comparar, e ficar '
        'verde assim seria pior que nao existir.',
      );
    }

    /// Os `code` que `validarSenha` emite, extraidos do fonte.
    Set<String> codigosDoServidor() {
      final fonte = arquivoDaPolitica().readAsStringSync();
      final achados = RegExp(r"code:\s*'([a-z_]+)'")
          .allMatches(fonte)
          .map((m) => m.group(1)!)
          .toSet();
      expect(
        achados,
        isNotEmpty,
        reason: 'REPROVA: nao extrai nenhum `code` de '
            '`password-policy.ts`. O arquivo existe mas mudou de forma, e esta '
            'isca passou a comparar a tela com o vazio.',
      );
      return achados;
    }

    test('o servidor emite os quatro codigos que esta suite conhece', () {
      // Ancora escrita POR EXTENSO, e nao derivada de `RegraDeSenha`: um caso
      // que comparasse o arquivo com o proprio enum e depois o enum com o
      // arquivo seria um circulo que aprova qualquer coisa.
      expect(
        codigosDoServidor(),
        <String>{'too_short', 'too_long', 'blank', 'similar_to_identity'},
        reason: 'REPROVA: o conjunto de recusas do servidor mudou. Se uma '
            'regra entrou, a tela precisa passar a mostra-la; se uma saiu, a '
            'tela precisa parar de exigi-la. Decidir isso e o ponto desta '
            'isca -- ela nao existe para ser ajustada ate ficar verde.',
      );
    });

    test('a tela nao ESCONDE regra que o servidor aplica', () {
      final doServidor = codigosDoServidor();
      final daTela =
          RegraDeSenha.values.map((r) => r.codigoDoServidor).toSet();
      expect(
        doServidor.difference(daTela),
        isEmpty,
        reason: 'REPROVA: o servidor recusa por um motivo que a lista da tela '
            'nao mostra. A pessoa preenche, ve tudo verde, envia e leva o '
            'erro -- que e exatamente o que esta entrega foi feita para '
            'acabar.',
      );
    });

    test('a tela nao INVENTA regra que o servidor nao aplica', () {
      final doServidor = codigosDoServidor();
      final daTela =
          RegraDeSenha.values.map((r) => r.codigoDoServidor).toSet();
      expect(
        daTela.difference(doServidor),
        isEmpty,
        reason: 'REPROVA: a lista da tela cobra algo que o servidor aceita. '
            'Tela mais exigente que o servidor frustra sem motivo, e e como '
            'entra a regra de composicao que a ADR-0003 recusa: exigir '
            'caractere especial empurra para `Senha@123`, que e pior que uma '
            'frase longa.',
      );
    });

    test('composicao NAO entra na lista, nem por outro nome', () {
      // O cliente pediu caractere especial em 22/09/2026. A divergencia foi
      // levada a ele; ate que ele mande o contrario, a tela segue o servidor.
      // Este caso e a forma executavel dessa decisao: quem reabrir o assunto
      // reprova aqui e tem de dizer por que, em vez de acrescentar uma linha.
      final textos = RegraDeSenha.values.map((r) => r.texto.toLowerCase());
      for (final proibido in <String>[
        'especial',
        'maiúscula',
        'minúscula',
        'símbolo',
        'número',
      ]) {
        expect(
          textos.where((t) => t.contains(proibido)),
          isEmpty,
          reason: 'REPROVA: a lista passou a pedir "$proibido". A politica do '
              'servidor nao exige composicao (NIST SP 800-63B, ADR-0003), e '
              'uma tela que exige mais que o servidor recusa senha que o '
              'servidor aceitaria.',
        );
      }
    });
  });

  group('ISCA — o veredito bate com o do servidor, caso a caso', () {
    // Os esperados sao escritos POR EXTENSO. Compara-los com
    // `PoliticaDeSenha.avaliar` de novo seria a tautologia que ja passou por
    // este projeto tres vezes.
    const String email = 'marina@exemplo.com.br';
    const String nome = 'Marina Prado';

    List<RegraDeSenha> violacoes(String senha) =>
        PoliticaDeSenha.violacoes(senha: senha, email: email, nome: nome);

    test('frase longa sem numero, sem maiuscula e sem simbolo passa', () {
      expect(
        violacoes('o gato subiu no telhado'),
        isEmpty,
        reason: 'REPROVA: a tela recusou uma senha que o servidor aceita. '
            'Esta e exatamente a frase que a ADR-0003 prefere a `Senha@123`.',
      );
    });

    test('nove caracteres reprovam, dez passam', () {
      expect(violacoes('123456789'), <RegraDeSenha>[
        RegraDeSenha.tamanhoMinimo,
      ]);
      expect(violacoes('1234567890'), isEmpty);
    });

    test('dez espacos tem dez caracteres e mesmo assim reprova', () {
      // `blank` nao e consequencia de `too_short`: uma lista que so mostrasse
      // o tamanho aprovaria isto na tela e levaria a recusa do servidor.
      expect(violacoes('          '), <RegraDeSenha>[RegraDeSenha.soEspacos]);
    });

    test('257 caracteres reprovam pelo teto, 256 passam', () {
      expect(violacoes('a' * 256), isEmpty);
      expect(violacoes('a' * 257), <RegraDeSenha>[RegraDeSenha.tamanhoMaximo]);
    });

    test('senha que contem a parte local do e-mail reprova', () {
      expect(
        violacoes('marina1998xyz'),
        <RegraDeSenha>[RegraDeSenha.diferenteDaIdentidade],
      );
    });

    test('a comparacao ignora ponto, acento e caixa, como no servidor', () {
      // `Marina.2024` e `marina2024` sao a mesma senha para quem ataca a
      // partir do endereco da conta.
      expect(
        PoliticaDeSenha.violacoes(
          senha: 'M4rina.2024',
          email: 'marina@exemplo.com.br',
          nome: '',
        ),
        isEmpty,
        reason: 'o `4` no lugar do `a` muda a forma normalizada, e o servidor '
            'tambem deixa passar: a tela nao pode ser mais esperta que ele',
      );
      expect(
        PoliticaDeSenha.violacoes(
          senha: 'Marina.2024',
          email: 'marina@exemplo.com.br',
          nome: '',
        ),
        <RegraDeSenha>[RegraDeSenha.diferenteDaIdentidade],
      );
      expect(
        PoliticaDeSenha.violacoes(
          senha: 'Antônio-do-Prado',
          email: 'contato@exemplo.com.br',
          nome: 'Antonio do Prado',
        ),
        <RegraDeSenha>[RegraDeSenha.diferenteDaIdentidade],
        reason: 'REPROVA: o acento fez a tela deixar passar o que o servidor '
            'recusa. O servidor normaliza com NFKD antes de comparar.',
      );
    });

    test('candidato curto nao casa: o piso de 4 caracteres vale', () {
      expect(
        PoliticaDeSenha.violacoes(
          senha: 'anacondadourada',
          email: 'ana@exemplo.com.br',
          nome: '',
        ),
        isEmpty,
        reason: 'REPROVA: `ana` tem tres caracteres e o servidor descarta '
            'candidato com menos de quatro. Sem esse piso, e-mail curto '
            'reprovaria quase toda senha.',
      );
    });

    test('campo vazio nao acusa quatro faltas de uma vez', () {
      final estados =
          PoliticaDeSenha.avaliar(senha: '', email: email, nome: nome);
      expect(
        estados.values.toSet(),
        <EstadoDaRegra>{EstadoDaRegra.aguardando},
        reason: 'REPROVA: a tela abre acusando a pessoa de quatro faltas que '
            'ela nao teve tempo de cometer.',
      );
    });
  });

  group('ISCA — o codigo do servidor vira a frase certa', () {
    test('cada codigo conhecido devolve a regra correspondente', () {
      expect(
        PoliticaDeSenha.porCodigoDoServidor('too_short'),
        RegraDeSenha.tamanhoMinimo,
      );
      expect(
        PoliticaDeSenha.porCodigoDoServidor('similar_to_identity'),
        RegraDeSenha.diferenteDaIdentidade,
      );
    });

    test('codigo que este build nao conhece devolve nulo, e nao um chute', () {
      // O caso da lista de vazamento quando ela sair da porta, e o caso de
      // toda regra que o servidor ganhar depois deste APK estar instalado.
      expect(PoliticaDeSenha.porCodigoDoServidor('pwned'), isNull);
      expect(
        senhaRecusadaPeloServidor,
        isNot(contains('10')),
        reason: 'REPROVA: o texto de recusa desconhecida voltou a falar de '
            'tamanho. Quem for recusado por vazamento vai acrescentar '
            'caracteres e ser recusado de novo, sem fim.',
      );
    });
  });
}
