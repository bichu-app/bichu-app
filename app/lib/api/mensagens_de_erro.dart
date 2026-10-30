import '../roteamento/rotas.dart';
import 'falhas.dart';
import 'problem.dart';

/// O que a tela mostra quando algo falha.
class MensagemDeErro {
  const MensagemDeErro({
    required this.texto,
    this.acao,
    this.proximaAcao,
    this.rotaDaAcao,
  });

  /// A frase que a pessoa le.
  final String texto;

  /// O rotulo da saida, quando a situacao tem uma.
  final String? acao;

  /// A saida que o servidor indicou em `next_action`, quando indicou.
  final ProximaAcao? proximaAcao;

  /// O endereco **dentro do app** para onde [acao] leva, quando a saida e uma
  /// navegacao simples e nao uma operacao.
  final String? rotaDaAcao;
}

/// Local: qual situacao de tela estava em curso quando a recusa chegou,
/// decidida no aparelho.
enum AcaoEmCurso {
  /// `POST /v1/lost-cases` (F3.1), a partir de
  /// `perdido/tela_alcance_do_alerta`.
  avisarPetPerdido,

  /// `POST /v1/community/events`, a partir de `rede/criar_encontro`.
  criarEncontro,

  /// `POST` da sugestao do diretorio, a partir de `perto/sugerir_profissional`.
  indicarProfissional,

  /// A escrita da minha avaliacao, a partir de `perto/pagina_do_local`.
  avaliarLocal,
}

/// Traduz uma falha de chamada na mensagem da tela.
abstract final class MensagensDeErro {
  /// Texto da acao que da para enfileirar e vai sair quando o sinal voltar.
  static const String semConexaoEnfileirada =
      'Você está sem conexão. Vamos enviar assim que o sinal voltar.';

  /// Texto da acao que exige servidor agora e nao da para enfileirar.
  static const String semConexaoImpossivel =
      'Isso precisa de conexão. Tente de novo quando tiver sinal.';

  /// O rotulo das duas saidas que apontavam para o vazio ate a BICHUS-62.
  static const String verMeusPets = 'Ver meus pets';

  static const String servidorFora =
      'O Bichu está fora do ar por alguns minutos. Já estamos arrumando.';

  static const String tempoEsgotado = 'Está demorando mais que o normal.';

  static const String sessaoExpirou =
      'Sua sessão expirou. Entre de novo; o que você escreveu está salvo.';

  static const String emailJaCadastrado =
      'Este e-mail já tem conta no Bichu.';

  /// O agradecimento de quem abriu o cartaz de um pet **que ja voltou**.
  static const String petReencontrado =
      'Obrigado por se preocupar. Este pet já foi encontrado e está em casa, '
      'e você não precisa mais se preocupar com ele.';

  static const String senhaCurta =
      'A senha precisa de pelo menos 10 caracteres.';

  static const String credencialNaoConfere = 'E-mail ou senha não conferem.';

  /// C.2, campo vazio antes de enviar (UX 8.2.2).
  static const String digiteSeuEmail = 'Digite seu e-mail.';

  static const String digiteSuaSenha = 'Digite sua senha.';

  /// C.2, e-mail com formato obviamente errado (UX 8.2.2 e secao 13).
  static const String confiraOEmail =
      'Confira o e-mail. Parece que faltou o arroba.';

  /// C.2, sem conexao (UX 8.2.2).
  static const String precisamosDeConexaoParaEntrar =
      'Precisamos de conexão para entrar. O que você escreveu está salvo aqui.';

  static const String tentarDeNovo = 'Tentar de novo';

  /// A saida dos dois desfechos de `If-Match` (412 e 428).
  static const String recarregar = 'Recarregar';

  static const String esqueciMinhaSenha = 'Esqueci minha senha';

  /// A saida comum as quatro telas de falha do codigo da tag (UX 12.4).
  static const String registrarAchado = 'Registrar que achei um pet';

  /// `tag-code-malformed`, 400 (UX 12.6).
  static const String codigoMalformado =
      'Confira o código. Parece que faltou alguma coisa, ou entrou um '
      'caractere a mais. O código está impresso embaixo do QR, na plaquinha.';

  /// `tag-code-not-found`, 404 (UX 12.6).
  static const String codigoNaoEncontrado =
      'Esse código não é de nenhuma tag do Bichu. Confira se a plaquinha é do '
      'Bichu.';

  /// `tag-code-not-found`, 404, **quando o codigo veio do campo de digitacao**
  /// (BICHUS-153).
  static const String codigoNaoEncontradoDigitado =
      'Esse código não é de nenhuma tag do Bichu. Confira se algum caractere '
      'saiu trocado, ou registre o achado sem o código.';

  /// O campo do codigo vazio, no toque em `Continuar` (UX secao 13: o requisito
  /// e dito antes do erro, e o toque que nao faz nada e o erro que nao se diz).
  static const String digiteOCodigo = 'Digite o código.';

  /// O codigo digitado nao tem 16 simbolos, conferido **no app** antes da
  /// chamada.
  static String codigoComTamanhoDiferente(int digitados) =>
      'O código tem 16 caracteres. Você digitou $digitados.';

  /// O codigo digitado tem caractere que o codigo nao usa (na pratica `U`),
  /// conferido **no app** antes da chamada.
  static const String codigoComCaractereDeFora =
      'Confira o código. Tem um caractere que a plaquinha não usa.';

  /// A saida que devolve o foco ao campo **com o que foi digitado** (UX 12.4).
  static const String digitarDeNovo = 'Digitar de novo';

  /// A ajuda do campo de digitacao do codigo (UX 12.4).
  static const String ajudaDoCampoDeCodigo =
      'São 16 caracteres, em quatro grupos de quatro. Pode digitar com ou sem '
      'hífen, em maiúscula ou minúscula. Se confundir I com 1 ou O com 0, a '
      'gente entende.';

  /// A saida das quatro recusas de canal nao verificado.
  static const String confirmarMeuEmail = 'Confirmar meu e-mail';

  /// `contact-channel-unverified` ao **abrir caso de pet perdido**.
  static const String canalNaoVerificadoParaAvisar =
      'Confirme seu e-mail antes de avisar. Os tutores por perto vão receber '
      'a foto. Se alguém encontrar, é pelo seu e-mail que a gente avisa.';

  /// `contact-channel-unverified` ao **criar encontro na `Rede`**.
  static const String canalNaoVerificadoParaCriarEncontro =
      'Confirme seu e-mail antes de criar. O evento vai aparecer para toda '
      'a comunidade com o seu nome.';

  /// `contact-channel-unverified` ao **indicar profissional no `Perto`**.
  static const String canalNaoVerificadoParaIndicar =
      'Confirme seu e-mail antes de indicar. A indicação fala de um '
      'estabelecimento de verdade, e quem confere precisa saber de quem ela '
      'veio.';

  /// `contact-channel-unverified` ao **avaliar um local do diretorio**.
  static const String canalNaoVerificadoParaAvaliar =
      'Confirme seu e-mail antes de avaliar. A avaliação aparece com o seu '
      'nome na página de um negócio real.';

  /// `contact-channel-unverified` **sem situacao declarada por quem chama**.
  static const String canalNaoVerificadoSemSituacao =
      'Confirme seu e-mail antes de continuar. É a confirmação do e-mail que '
      'libera criar e escrever na comunidade.';

  /// `validation-failed` que chegou **sem nomear campo nenhum** (UX 12.6).
  static const String naoConseguimosSalvar =
      'Não conseguimos salvar. Confira o que você preencheu e tente de novo.';

  /// A mensagem de uma falha qualquer, fora do contexto de um formulario.
  static MensagemDeErro de(
    FalhaDeChamada falha, {
    bool podeEnfileirar = false,
    bool codigoDigitado = false,
    AcaoEmCurso? acaoEmCurso,
  }) {
    return switch (falha) {
      FalhaDeConexao() => MensagemDeErro(
          texto: podeEnfileirar ? semConexaoEnfileirada : semConexaoImpossivel,
        ),
      FalhaDeTempo() => const MensagemDeErro(
          texto: tempoEsgotado,
          acao: tentarDeNovo,
        ),
      FalhaDaApi(:final problem) =>
          _daApi(problem, codigoDigitado, acaoEmCurso),
      FalhaDeEnderecoRecusado() => const MensagemDeErro(
          texto: servidorFora,
          acao: tentarDeNovo,
        ),
    };
  }

  static MensagemDeErro _daApi(
    Problem problem, [
    bool codigoDigitado = false,
    AcaoEmCurso? acaoEmCurso,
  ]) {
    final saida = problem.proximaAcao;

    final porTipo = switch (problem.tipo) {
      ProblemTipo.emailJaCadastrado => const MensagemDeErro(
          texto: emailJaCadastrado,
          acao: 'Entrar com este e-mail',
          proximaAcao: ProximaAcao.entrar,
        ),
      ProblemTipo.canalDeContatoNaoVerificado => MensagemDeErro(
          texto: _canalNaoVerificado(acaoEmCurso),
          acao: confirmarMeuEmail,
          proximaAcao: ProximaAcao.verificarEmail,
        ),
      ProblemTipo.limiteDeEncontrosDaComunidade =>
        _limiteDeEncontros(problem),
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
      ProblemTipo.conversaEncerrada => const MensagemDeErro(
          texto: 'Esta conversa está encerrada e não aceita mensagem nova. '
              'Você continua lendo o que foi escrito.',
          acao: 'Voltar para as mensagens',
        ),
      ProblemTipo.casoEncerrado => const MensagemDeErro(
          texto: 'Este link não leva mais a um caso aberto.',
          acao: 'Registrar um achado',
        ),
      ProblemTipo.casoReencontrado => const MensagemDeErro(
          texto: petReencontrado,
        ),
      ProblemTipo.precondicaoFalhou => const MensagemDeErro(
          texto: 'Alguém mexeu neste evento enquanto você olhava. Recarregue '
              'para ver como ele está agora.',
          acao: recarregar,
        ),
      ProblemTipo.precondicaoNecessaria => const MensagemDeErro(
          texto: 'Não conseguimos confirmar a versão deste evento. Recarregue '
              'e tente de novo.',
          acao: recarregar,
        ),
      ProblemTipo.reautenticacaoNecessaria => const MensagemDeErro(
          texto: 'Confirme sua senha. Esta ação não pode ser desfeita, então '
              'pedimos a senha de novo.',
          acao: 'Confirmar',
        ),
      ProblemTipo.naoAutenticado => const MensagemDeErro(
          texto: '',
          acao: 'Entrar',
          proximaAcao: ProximaAcao.entrar,
        ),
      ProblemTipo.tokenExpirado => const MensagemDeErro(
          texto: sessaoExpirou,
          acao: 'Entrar',
          proximaAcao: ProximaAcao.entrar,
        ),
      ProblemTipo.credencialInvalida => const MensagemDeErro(
          texto: credencialNaoConfere,
          acao: esqueciMinhaSenha,
        ),
      ProblemTipo.codigoDeTagMalformado => const MensagemDeErro(
          texto: codigoMalformado,
          acao: registrarAchado,
          proximaAcao: ProximaAcao.registrarAchadoAvulso,
        ),
      ProblemTipo.codigoDeTagNaoEncontrado => MensagemDeErro(
          texto: codigoDigitado
              ? codigoNaoEncontradoDigitado
              : codigoNaoEncontrado,
          acao: registrarAchado,
          proximaAcao: ProximaAcao.registrarAchadoAvulso,
        ),
      ProblemTipo.naoEncontrado => const MensagemDeErro(
          texto: 'Isso não está mais aqui.',
          acao: verMeusPets,
          rotaDaAcao: Rotas.perfil,
        ),
      ProblemTipo.limiteDePetsAtingido => _limiteDePets(problem),
      ProblemTipo.limiteDeTentativas => MensagemDeErro(
          texto: _muitasTentativas(problem.tenteDepoisDe),
        ),
      ProblemTipo.validacaoFalhou || ProblemTipo.desconhecido => null,
    };

    if (porTipo != null) return porTipo;

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

  /// A mensagem da tela **C.2 — Entrar** (UX 8.2.2).
  static MensagemDeErro deEntrar(FalhaDeChamada falha) {
    if (falha is FalhaDeConexao) {
      return const MensagemDeErro(texto: precisamosDeConexaoParaEntrar);
    }

    if (falha is! FalhaDaApi) return de(falha);

    final porTipo = switch (falha.problem.tipo) {
      ProblemTipo.credencialInvalida => const MensagemDeErro(
          texto: credencialNaoConfere,
          acao: esqueciMinhaSenha,
        ),
      ProblemTipo.naoAutenticado => const MensagemDeErro(
          texto: servidorFora,
          acao: tentarDeNovo,
        ),
      ProblemTipo.tokenExpirado => const MensagemDeErro(texto: sessaoExpirou),
      _ => null,
    };
    if (porTipo != null) return porTipo;

    if (falha.problem.status == 429) {
      return MensagemDeErro(
        texto: _muitasTentativas(falha.problem.tenteDepoisDe),
        acao: esqueciMinhaSenha,
      );
    }

    return de(falha);
  }

  /// A frase do `409 contact-channel-unverified`, pela situacao de quem chama.
  static String _canalNaoVerificado(AcaoEmCurso? acaoEmCurso) =>
      switch (acaoEmCurso) {
        AcaoEmCurso.avisarPetPerdido => canalNaoVerificadoParaAvisar,
        AcaoEmCurso.criarEncontro => canalNaoVerificadoParaCriarEncontro,
        AcaoEmCurso.indicarProfissional => canalNaoVerificadoParaIndicar,
        AcaoEmCurso.avaliarLocal => canalNaoVerificadoParaAvaliar,
        null => canalNaoVerificadoSemSituacao,
      };

  /// `pet-limit-reached`, 409 (UX 12.6).
  static MensagemDeErro _limiteDePets(Problem problem) {
    final limite = problem.inteiro('limit') ?? problem.inteiro('pet_limit');
    final abertura = limite == null
        ? 'Você chegou ao limite de pets nesta conta.'
        : 'Você chegou ao limite de $limite pets nesta conta.';
    return MensagemDeErro(
      texto: '$abertura Se precisar de mais, fale com a gente.',
      acao: verMeusPets,
      rotaDaAcao: Rotas.perfil,
    );
  }

  /// `community-event-limit-reached`, 409 (ADR-0025 emenda 3).
  static MensagemDeErro _limiteDeEncontros(Problem problem) {
    final limite = problem.inteiro('limit');
    final abertura = limite == null
        ? 'Você já tem o máximo de eventos em aberto.'
        : 'Você já tem $limite eventos em aberto.';
    return MensagemDeErro(
      texto: '$abertura Cancele ou espere terminar um deles para criar outro.',
      acao: 'Ver meus eventos',
      rotaDaAcao: Rotas.rede,
    );
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
