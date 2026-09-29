import '../roteamento/rotas.dart';
import 'falhas.dart';
import 'problem.dart';

/// O que a tela mostra quando algo falha.
///
/// Toda mensagem diz **o que houve** e **o que fazer agora**. Nenhuma contem as
/// palavras "erro", "invalido", "falhou", "ops", "algo deu errado", nem codigo
/// tecnico. Os textos sao os da tabela 12.4 de docs/05-ux-research.md, copiados
/// e nao reescritos: microcopy e especificacao.
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
  ///
  /// Existe porque um rotulo de acao sem destino e o defeito que a BICHUS-62
  /// veio fechar: `Ver meus pets` estava escrito em dois lugares deste arquivo
  /// e nao levava a lugar nenhum, e a tela que o renderizava com um toque
  /// **reenviava o cadastro**, porque era o unico `aoTocarNaAcao` que ela
  /// tinha. Quem renderiza a faixa le este campo **antes** de decidir o que o
  /// toque faz.
  ///
  /// Nao e `ProximaAcao`: aquele enum carrega os valores de `next_action` que
  /// o **servidor** manda, e inventar um membro para uma navegacao que o
  /// contrato nunca declarou poria vocabulario nosso dentro do vocabulario
  /// dele.
  final String? rotaDaAcao;
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

  /// O rotulo das duas saidas que apontavam para o vazio ate a BICHUS-62.
  ///
  /// Escrito uma vez so: eram duas copias da mesma frase, e a terceira era
  /// questao de tempo. O destino e `Perfil` > `Meus pets` (UX 27.6).
  static const String verMeusPets = 'Ver meus pets';

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

  /// Texto de `unauthenticated` **fora** da tela de entrar (UX 12.6).
  static const String entreParaContinuar =
      'Entre na sua conta para continuar. O que você escreveu está salvo aqui.';

  /// C.2, campo vazio antes de enviar (UX 8.2.2).
  static const String digiteSeuEmail = 'Digite seu e-mail.';

  static const String digiteSuaSenha = 'Digite sua senha.';

  /// C.2, e-mail com formato obviamente errado (UX 8.2.2 e secao 13).
  static const String confiraOEmail =
      'Confira o e-mail. Parece que faltou o arroba.';

  /// C.2, sem conexao (UX 8.2.2). Texto proprio: a segunda frase e verdadeira,
  /// porque os campos permanecem preenchidos.
  static const String precisamosDeConexaoParaEntrar =
      'Precisamos de conexão para entrar. O que você escreveu está salvo aqui.';

  static const String tentarDeNovo = 'Tentar de novo';

  static const String esqueciMinhaSenha = 'Esqueci minha senha';

  /// A saida comum as quatro telas de falha do codigo da tag (UX 12.4).
  static const String registrarAchado = 'Registrar que achei um pet';

  /// `tag-code-malformed`, 400 (UX 12.6).
  static const String codigoMalformado =
      'Confira o código. Parece que faltou alguma coisa, ou entrou um '
      'caractere a mais. O código está impresso embaixo do QR, na plaquinha.';

  /// `tag-code-not-found`, 404 (UX 12.6).
  ///
  /// **Este texto deixou de ser o destino de um erro de digitacao**, e era esse
  /// o defeito dele. Ate a Emenda 1 do ADR-0004 o codigo nao tinha simbolo de
  /// verificacao, entao um caractere trocado normalizava para um codigo bem
  /// formado e inexistente e caia AQUI: a tela acusava a plaquinha ("nao e do
  /// Bichu") quando o que houve foi um dedo no lugar errado. Com o simbolo de
  /// verificacao, esse caso vira 400 e [codigoMalformado], e este texto passa a
  /// dizer a verdade -- ele so aparece quando o codigo e mesmo de outra coisa.
  static const String codigoNaoEncontrado =
      'Esse código não é de nenhuma tag do Bichu. Confira se a plaquinha é do '
      'Bichu.';

  /// `tag-code-not-found`, 404, **quando o codigo veio do campo de digitacao**
  /// (BICHUS-153). Microcopy da UX: nao reescrever.
  ///
  /// **Os dois textos existem porque as duas situacoes sao diferentes, e nao
  /// porque uma e mais gentil.** No caminho escaneado o dedo nao participou:
  /// a camera leu o que estava impresso, entao "confira se a plaquinha e do
  /// Bichu" e verdade e continua sendo o texto de la. No caminho digitado a
  /// pessoa pode ter errado um caractere, e acusar a plaquinha de ser de outro
  /// produto manda embora quem so precisava corrigir uma letra.
  ///
  /// **O simbolo de verificacao do ADR-0004 nao fecha este caso.** Ele
  /// transforma a maior parte dos erros de dedo em 400, e isso e ganho real --
  /// mas o 404 legitimo nunca desaparece: tag revogada, tag de outro produto,
  /// codigo inventado com sorte, e a propria transposicao que o simbolo nao
  /// pega. Para esse resto o texto continua precisando estar certo.
  ///
  /// Quem le isto esta na rua com um animal no colo, ja falhou em escanear e
  /// esta no caminho degradado. Um empurrao a mais aqui e uma desistencia, e
  /// do outro lado dela ha um tutor esperando (risco R1 do UX).
  static const String codigoNaoEncontradoDigitado =
      'Esse código não é de nenhuma tag do Bichu. Confira se algum caractere '
      'saiu trocado, ou registre o achado sem o código.';

  /// O campo do codigo vazio, no toque em `Continuar` (UX secao 13: o
  /// requisito e dito antes do erro, e o toque que nao faz nada e o erro que
  /// nao se diz).
  ///
  /// Mesma forma de [digiteSeuEmail] e [digiteSuaSenha], porque e o mesmo
  /// caso: campo obrigatorio vazio na hora de enviar.
  static const String digiteOCodigo = 'Digite o código.';

  /// O codigo digitado nao tem 16 simbolos, conferido **no app** antes da
  /// chamada.
  ///
  /// **O numero entra na frase**, e e ele que faz a mensagem valer a pena. O
  /// defeito que esta frase fecha era a mascara cortar no 16o em silencio:
  /// quem colava 26 simbolos via 16 na tela, mandava um fragmento e recebia do
  /// servidor uma recusa sobre um codigo que nunca digitou. Dizer "confira o
  /// codigo" aqui seria trocar um silencio por um encolher de ombros; dizer o
  /// numero e a unica forma de a pessoa entender por que.
  ///
  /// Duas frases curtas, e nenhuma explicacao de por que sao 16:
  /// [ajudaDoCampoDeCodigo] ja esta acima do campo, e repetir a regra dentro
  /// do erro e o texto a mais que o cliente reprovou em 28/09.
  static String codigoComTamanhoDiferente(int digitados) =>
      'O código tem 16 caracteres. Você digitou $digitados.';

  /// O codigo digitado tem caractere que o codigo nao usa (na pratica `U`),
  /// conferido **no app** antes da chamada.
  static const String codigoComCaractereDeFora =
      'Confira o código. Tem um caractere que a plaquinha não usa.';

  /// A saida que devolve o foco ao campo **com o que foi digitado** (UX 12.4).
  ///
  /// Limpar o campo aqui seria cobrar de novo o trabalho que ja falhou uma
  /// vez: a pessoa precisa trocar um caractere, e nao redigitar dezesseis.
  static const String digitarDeNovo = 'Digitar de novo';

  /// A ajuda do campo de digitacao do codigo (UX 12.4).
  ///
  /// Sem esta linha a tolerancia do contrato existe e ninguem usa: o campo
  /// continua parecendo exigir transcricao exata dos 16 caracteres.
  static const String ajudaDoCampoDeCodigo =
      'São 16 caracteres, em quatro grupos de quatro. Pode digitar com ou sem '
      'hífen, em maiúscula ou minúscula. Se confundir I com 1 ou O com 0, a '
      'gente entende.';

  /// `validation-failed` que chegou **sem nomear campo nenhum** (UX 12.6).
  ///
  /// O contrato manda o servidor nomear o campo em `errors[]`, e quando ele
  /// nao nomeia o defeito e nosso. A tela nao pode ficar muda, mas tambem nao
  /// pode acusar um campo que ninguem apontou.
  static const String naoConseguimosSalvar =
      'Não conseguimos salvar. Confira o que você preencheu e tente de novo.';

  /// A mensagem de uma falha qualquer, fora do contexto de um formulario.
  ///
  /// [podeEnfileirar] separa as duas linhas de "sem conexao" da tabela 12.4:
  /// acao que o produto consegue guardar para reenviar, e acao que exige
  /// servidor agora. A diferenca nao e de tom, e de verdade.
  /// [codigoDigitado] diz que o codigo saiu do campo de digitacao, e nao da
  /// camera. **So o 404 da tag muda de texto por causa dele** (BICHUS-153);
  /// todos os outros desfechos, inclusive o 400 de [codigoMalformado],
  /// continuam identicos. Fundir os dois desfechos desfaria a separacao de
  /// 17/09 em F4.5, e nao e isto que esta acontecendo aqui: o que se separa e
  /// a **origem** do codigo, dentro de um desfecho so.
  static MensagemDeErro de(
    FalhaDeChamada falha, {
    bool podeEnfileirar = false,
    bool codigoDigitado = false,
  }) {
    return switch (falha) {
      FalhaDeConexao() => MensagemDeErro(
          texto: podeEnfileirar ? semConexaoEnfileirada : semConexaoImpossivel,
        ),
      FalhaDeTempo() => const MensagemDeErro(
          texto: tempoEsgotado,
          acao: tentarDeNovo,
        ),
      FalhaDaApi(:final problem) => _daApi(problem, codigoDigitado),
      // O endereco veio de um corpo de resposta e nao e desta API, entao a
      // requisicao NAO saiu e o token NAO viajou. Para quem esta lendo a tela
      // isso e indistinguivel de servidor fora, e o movimento util e o mesmo;
      // o diagnostico de verdade esta no `type` da classe, nao no texto.
      FalhaDeEnderecoRecusado() => const MensagemDeErro(
          texto: servidorFora,
          acao: tentarDeNovo,
        ),
    };
  }

  static MensagemDeErro _daApi(Problem problem, [bool codigoDigitado = false]) {
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
      // Os tres 401 que agora tem tipo proprio. Textos da tabela 12.6 do UX,
      // que e o catalogo geral; a tela de entrar tem os seus, diferentes para
      // dois deles, e por isso ela usa [deEntrar] e nao este caminho.
      ProblemTipo.naoAutenticado => const MensagemDeErro(
          texto: entreParaContinuar,
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
      // Os quatro desfechos de `GET /v1/tags/{code}` (F2.1 e F4.5). As quatro
      // mensagens carregam **a mesma saida**, com o mesmo texto e o mesmo
      // botao, e e isso que impede o beco sem saida: quem esta com um animal
      // no colo nao precisa do codigo para registrar o achado (UX 12.4 e F4.5).
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

  /// A mensagem da tela **C.2 — Entrar** (UX 8.2.2).
  ///
  /// Existe separada de [de] porque dois dos quatro 401 tem texto diferente
  /// aqui e no resto do produto, e a diferenca nao e de tom:
  ///
  /// - `unauthenticated` fora daqui diz "entre na sua conta"; **dentro** daqui
  ///   isso seria absurdo, porque a pessoa ja esta entrando e
  ///   `POST /auth/login` e operacao aberta. Se este tipo chegar como resposta
  ///   do envio, e defeito nosso, e o texto e o de servidor fora.
  /// - `token-expired` aqui e **estado de chegada** e nao resposta do envio.
  ///
  /// **A decisao e por `type`, nunca por status.** Um `switch` em 401 acerta
  /// hoje por sorte, porque so `invalid-credentials` chega a esta tela, e erra
  /// calado no dia em que outro dos quatro chegar: a tela diria a pessoa que a
  /// senha esta errada e ela trocaria uma senha que estava certa. Ha teste que
  /// cobra os quatro.
  static MensagemDeErro deEntrar(FalhaDeChamada falha) {
    if (falha is FalhaDeConexao) {
      // O botao continua habilitado sem conexao e a tentativa acontece: o
      // detector de offline erra, e deixar a pessoa sem caminho e pior.
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
      // `reauthentication-required` nao e esta tela (e a folha de confirmacao
      // de senha da acao sensivel) e `forbidden` e 403 e nunca aparece aqui.
      // Os dois caem no catalogo geral de proposito: se chegarem, a tela mostra
      // o texto do catalogo em vez de mentir que a credencial nao confere.
      _ => null,
    };
    if (porTipo != null) return porTipo;

    // 429. A saida para a recuperacao de senha **fica**: quem estourou o limite
    // quase sempre nao lembra a senha, e manda-la esperar sem o unico caminho
    // que resolve e desenhar um beco (UX 8.2.2).
    if (falha.problem.status == 429) {
      return MensagemDeErro(
        texto: _muitasTentativas(falha.problem.tenteDepoisDe),
        acao: esqueciMinhaSenha,
      );
    }

    // Tipo que este build nao conhece, ou 500. O catalogo geral resolve, e
    // nenhum caminho daqui afirma que a credencial nao confere.
    return de(falha);
  }

  /// `pet-limit-reached`, 409 (UX 12.6).
  ///
  /// **O numero vem da resposta, nunca escrito na frase.** O esquema `Problem`
  /// de `api/openapi.yaml` nao declara campo nenhum que o carregue hoje; se um
  /// dia declarar, e so ele chegar, esta funcao passa a dizer o teto. Enquanto
  /// nao chega, a tela diz que o limite foi atingido **sem numero**, em vez de
  /// escrever "20" no binario: uma versao antiga do app continua instalada por
  /// semanas depois de o servidor mudar o teto, e ela repetiria o numero
  /// errado com a mesma confianca.
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

  static String _muitasTentativas(Duration? esperar) {
    const abertura = 'Espere um pouco antes de tentar de novo. Vieram muitas '
        'tentativas deste aparelho nos últimos minutos.';
    if (esperar == null) return abertura;
    final minutos = (esperar.inSeconds / 60).ceil();
    if (minutos <= 1) return '$abertura Tente de novo em um minuto.';
    return '$abertura Tente de novo em $minutos minutos.';
  }
}
