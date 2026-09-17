import 'falhas.dart';
import 'problem.dart';

/// O que a tela mostra quando algo falha.
///
/// Toda mensagem diz **o que houve** e **o que fazer agora**. Nenhuma contem as
/// palavras "erro", "invalido", "falhou", "ops", "algo deu errado", nem codigo
/// tecnico. Os textos sao os da tabela 12.4 de docs/05-ux-research.md, copiados
/// e nao reescritos: microcopy e especificacao.
class MensagemDeErro {
  const MensagemDeErro({required this.texto, this.acao, this.proximaAcao});

  /// A frase que a pessoa le.
  final String texto;

  /// O rotulo da saida, quando a situacao tem uma.
  final String? acao;

  /// A saida que o servidor indicou em `next_action`, quando indicou.
  final ProximaAcao? proximaAcao;
}

/// Traduz uma falha de chamada na mensagem da tela.
///
/// **A decisao e por `type` e por situacao, nunca pelo texto que o servidor
/// mandou.** Mudar `title` ou `detail` no backend nao pode mudar o que a tela
/// faz, e ha teste que exige isso.
abstract final class MensagensDeErro {
  /// Texto da acao que da para enfileirar e vai sair quando o sinal voltar.
  static const String semConexaoEnfileirada =
      'Você está sem conexão. Vamos enviar assim que o sinal voltar.';

  /// Texto da acao que exige servidor agora e nao da para enfileirar.
  static const String semConexaoImpossivel =
      'Isso precisa de conexão. Tente de novo quando tiver sinal.';

  static const String servidorFora =
      'O Bichu está fora do ar por alguns minutos. Já estamos arrumando.';

  static const String tempoEsgotado = 'Está demorando mais que o normal.';

  static const String sessaoExpirou =
      'Sua sessão expirou. Entre de novo; o que você escreveu está salvo.';

  static const String emailJaCadastrado =
      'Este e-mail já tem conta no Bichu.';

  static const String senhaCurta =
      'A senha precisa de pelo menos 10 caracteres.';

  static const String credencialNaoConfere = 'E-mail ou senha não conferem.';

  static const String tentarDeNovo = 'Tentar de novo';

  /// A mensagem de uma falha qualquer, fora do contexto de um formulario.
  ///
  /// [podeEnfileirar] separa as duas linhas de "sem conexao" da tabela 12.4:
  /// acao que o produto consegue guardar para reenviar, e acao que exige
  /// servidor agora. A diferenca nao e de tom, e de verdade.
  static MensagemDeErro de(
    FalhaDeChamada falha, {
    bool podeEnfileirar = false,
  }) {
    return switch (falha) {
      FalhaDeConexao() => MensagemDeErro(
          texto: podeEnfileirar ? semConexaoEnfileirada : semConexaoImpossivel,
        ),
      FalhaDeTempo() => const MensagemDeErro(
          texto: tempoEsgotado,
          acao: tentarDeNovo,
        ),
      FalhaDaApi(:final problem) => _daApi(problem),
    };
  }

  static MensagemDeErro _daApi(Problem problem) {
    final saida = problem.proximaAcao;

    final porTipo = switch (problem.tipo) {
      ProblemTipo.emailJaCadastrado => const MensagemDeErro(
          texto: emailJaCadastrado,
          acao: 'Entrar com este e-mail',
          proximaAcao: ProximaAcao.entrar,
        ),
      ProblemTipo.canalDeContatoNaoVerificado => const MensagemDeErro(
          texto: 'Confirme seu e-mail antes de avisar. Os tutores por perto '
              'vão receber a foto. Se alguém encontrar, é pelo seu e-mail que '
              'a gente avisa.',
          acao: 'Confirmar meu e-mail',
          proximaAcao: ProximaAcao.verificarEmail,
        ),
      ProblemTipo.petSemFoto => const MensagemDeErro(
          texto: 'A foto não foi enviada. Ela está salva aqui.',
          acao: tentarDeNovo,
          proximaAcao: ProximaAcao.enviarFotoDoPet,
        ),
      ProblemTipo.tagRevogada => const MensagemDeErro(
          texto: 'Esta tag foi desativada pelo tutor. Se você está com um '
              'animal agora, registre o achado.',
          acao: 'Registrar que achei um pet',
          proximaAcao: ProximaAcao.registrarAchadoAvulso,
        ),
      ProblemTipo.reautenticacaoNecessaria => const MensagemDeErro(
          texto: 'Confirme sua senha. Esta ação não pode ser desfeita, então '
              'pedimos a senha de novo.',
          acao: 'Confirmar',
        ),
      ProblemTipo.validacaoFalhou || ProblemTipo.desconhecido => null,
    };

    if (porTipo != null) return porTipo;

    // Fallback por familia de status. Nao e o contrato: o contrato manda
    // decidir por `type`, e so seis `type` estao nomeados na especificacao
    // hoje. Enquanto o catalogo nao fecha, isto evita tela muda.
    return switch (problem.status) {
      401 => const MensagemDeErro(texto: sessaoExpirou, acao: 'Entrar'),
      429 => MensagemDeErro(
          texto: _muitasTentativas(problem.tenteDepoisDe),
          acao: null,
        ),
      >= 500 => const MensagemDeErro(texto: servidorFora, acao: tentarDeNovo),
      _ => MensagemDeErro(
          texto: servidorFora,
          acao: tentarDeNovo,
          proximaAcao: saida,
        ),
    };
  }

  static String _muitasTentativas(Duration? esperar) {
    const abertura = 'Espere um pouco antes de tentar de novo. Vieram muitas '
        'tentativas deste aparelho nos últimos minutos.';
    if (esperar == null) return abertura;
    final minutos = (esperar.inSeconds / 60).ceil();
    if (minutos <= 1) return '$abertura Tente de novo em um minuto.';
    return '$abertura Tente de novo em $minutos minutos.';
  }
}
