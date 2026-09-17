import 'package:bichu/api/falhas.dart';
import 'package:bichu/api/mensagens_de_erro.dart';
import 'package:bichu/api/problem.dart';
import 'package:flutter_test/flutter_test.dart';

void main() {
  group('Problem, RFC 9457', () {
    test('resolve o type pelo ultimo segmento, e nao pelo dominio', () {
      // O dominio e variavel de servidor no contrato (`api.{dominio}`) e muda
      // entre local, homologacao e producao. Comparar a URI inteira faria o
      // app tratar o mesmo erro de tres jeitos conforme o ambiente.
      const local = 'http://localhost:3000/problems/email-already-registered';
      const producao = 'https://bichu.app/problems/email-already-registered';
      expect(ProblemTipo.deUri(local), ProblemTipo.emailJaCadastrado);
      expect(ProblemTipo.deUri(producao), ProblemTipo.emailJaCadastrado);
    });

    test('type desconhecido nao quebra o app', () {
      // Versao antiga do app continua instalada por semanas e vai receber
      // `type` novo. A tela cai no texto generico, e nao numa tela em branco.
      final problem = Problem.doJson(
        <String, dynamic>{
          'type': 'https://bichu.app/problems/algo-que-ainda-nao-existe',
          'title': 'Alguma coisa',
          'status': 409,
        },
        status: 409,
      );
      expect(problem.tipo, ProblemTipo.desconhecido);
      expect(MensagensDeErro.de(FalhaDaApi(problem)).texto, isNotEmpty);
    });

    test('le next_action, correlation_id e os erros de campo', () {
      final problem = Problem.doJson(
        <String, dynamic>{
          'type': 'https://bichu.app/problems/validation-failed',
          'title': 'Dados invalidos',
          'status': 400,
          'correlation_id': '018f7c1e-7a2b-7c3d-9e4f-2b1a0c9d8e7f',
          'next_action': 'sign_in',
          'errors': <dynamic>[
            <String, dynamic>{
              'field': 'password',
              'code': 'too_short',
              'message': 'minimo de 10',
            },
          ],
        },
        status: 400,
      );

      expect(problem.tipo, ProblemTipo.validacaoFalhou);
      expect(problem.proximaAcao, ProximaAcao.entrar);
      expect(problem.correlationId, isNotNull);
      expect(problem.campo('password')?.codigo, 'too_short');
      expect(problem.campo('email'), isNull);
    });

    test('corpo que nao e problem+json vira um Problem sintetico', () {
      // Um proxy no meio do caminho devolve HTML num 502. Isso nao pode travar
      // o app nem produzir tela muda.
      final problem = Problem.semCorpo(502);
      expect(problem.tipo, ProblemTipo.desconhecido);
      expect(problem.status, 502);
    });
  });

  group('a tela decide por type, nunca pelo texto', () {
    // Este e o teste que o criterio de aceite pede: mudar `title` e `detail` no
    // servidor **nao pode** mudar comportamento de tela.
    Problem comTextos(String titulo, String detalhe) => Problem.doJson(
          <String, dynamic>{
            'type': 'https://bichu.app/problems/email-already-registered',
            'title': titulo,
            'detail': detalhe,
            'status': 409,
          },
          status: 409,
        );

    test('textos diferentes, mesmo comportamento', () {
      final a = MensagensDeErro.de(FalhaDaApi(comTextos('E-mail ja cadastrado',
          'Existe uma conta com este e-mail.')));
      final b = MensagensDeErro.de(FalhaDaApi(comTextos(
          'Texto completamente diferente escrito amanha', 'Outro detalhe.')));

      expect(a.texto, b.texto);
      expect(a.acao, b.acao);
      expect(a.proximaAcao, b.proximaAcao);
      expect(a.texto, MensagensDeErro.emailJaCadastrado);
    });

    test('nenhuma mensagem do produto usa as palavras proibidas', () {
      const proibidas = <String>[
        'erro',
        'inválido',
        'invalido',
        'falhou',
        'ops',
        'algo deu errado',
      ];
      const mensagens = <String>[
        MensagensDeErro.semConexaoEnfileirada,
        MensagensDeErro.semConexaoImpossivel,
        MensagensDeErro.servidorFora,
        MensagensDeErro.tempoEsgotado,
        MensagensDeErro.sessaoExpirou,
        MensagensDeErro.emailJaCadastrado,
        MensagensDeErro.senhaCurta,
        MensagensDeErro.credencialNaoConfere,
      ];

      for (final mensagem in mensagens) {
        for (final palavra in proibidas) {
          expect(
            mensagem.toLowerCase(),
            isNot(contains(palavra)),
            reason: 'A mensagem "$mensagem" usa a palavra proibida "$palavra". '
                'Toda mensagem diz o que houve e o que fazer agora.',
          );
        }
      }
    });
  });

  group('sem conexao tem duas mensagens, e a diferenca e de verdade', () {
    test('acao enfileiravel promete o reenvio', () {
      final m = MensagensDeErro.de(
        const FalhaDeConexao(),
        podeEnfileirar: true,
      );
      expect(m.texto, MensagensDeErro.semConexaoEnfileirada);
    });

    test('acao que exige servidor nao promete nada', () {
      final m = MensagensDeErro.de(const FalhaDeConexao());
      expect(m.texto, MensagensDeErro.semConexaoImpossivel);
    });
  });

  test('o 429 usa o Retry-After do contrato, em vez de um numero fixo', () {
    final problem = Problem.semCorpo(
      429,
      tenteDepoisDe: const Duration(minutes: 3),
    );
    final mensagem = MensagensDeErro.de(FalhaDaApi(problem));
    expect(mensagem.texto, contains('3 minutos'));
  });
}
