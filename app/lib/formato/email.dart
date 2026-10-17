/// O **unico** lugar do app que decide o que e um e-mail plausivel e o que sai
/// do campo de e-mail para o contrato.
///
/// ## E-mail nao tem mascara, e isso e decisao
///
/// Nao existe mascara de e-mail e tentar uma faz dano: a parte local do RFC
/// 5321 aceita ponto, `+`, `_`, `-` e muito mais, entao qualquer mascara ou
/// recusa endereco valido ou nao recusa nada. O que vale aqui e o teclado de
/// e-mail, a correcao automatica desligada, a maiuscula automatica desligada,
/// o espaco aparado e **uma** conferencia ao sair do campo.
///
/// ## Por que este arquivo existe
///
/// A mesma regra de plausibilidade estava escrita TRES vezes:
/// `_emailPlausivel` em `telas/conta/tela_criar_conta.dart`, `_emailPlausivel`
/// em `telas/conta/tela_entrar.dart` e, sem nome nenhum, no corpo de
/// `_enviarOLink` em `telas/conta/tela_esqueci_minha_senha.dart`. Tres copias
/// da mesma condicao divergem na primeira correcao.
///
/// ## O que o app NAO faz: minuscula
///
/// **O app nao abaixa a caixa do endereco.** Quem normaliza e o servidor, em
/// `src/modules/identity/domain/email.ts` (`normalizarEmail`: `trim()` +
/// `toLowerCase()`), e ele normaliza ANTES de conferir e antes de gravar. Se o
/// app abaixasse tambem, passariam a existir duas normalizacoes para o mesmo
/// endereco e a primeira divergencia entre elas ficaria invisivel -- o caso
/// classico e o aparelho aplicar uma regra de equivalencia que o servidor
/// recusa aplicar (pontos na parte local e sufixo `+etiqueta`, que o arquivo do
/// servidor documenta como deliberadamente NAO normalizados).
///
/// O app apara espaco porque espaco em volta e erro de digitacao e de colagem,
/// nunca intencao, e porque o campo precisa poder dizer "falta o arroba" sobre
/// o que a pessoa de fato escreveu.
library;

/// A mensagem da conferencia ao sair do campo.
///
/// **Uma linha, e a mesma nas tres telas.** Curta porque o cliente reprovou
/// texto excessivo em tela, e generica porque ela cobre todo endereco
/// implausivel: `MensagensDeErro.confiraOEmail` diz "parece que faltou o
/// arroba", o que e falso para `leandro@g`.
const String erroAoSairDoEmail = 'Confira o e-mail.';

/// O que vai para o contrato: o texto aparado, **na caixa que a pessoa
/// escreveu**.
String emailParaEnvio(String bruto) => bruto.trim();

/// Conferencia tolerante (UX 13): recusa o obviamente errado, aceita o
/// incomum. Endereco real e mais estranho que a maioria das expressoes
/// regulares, e a prova de que o endereco existe e o e-mail de verificacao,
/// nao uma regex.
///
/// Exige um `@` que nao seja o primeiro caractere e um ponto depois dele que
/// nao seja colado nele. E a mesma condicao que as tres telas ja aplicavam.
bool emailPlausivel(String bruto) {
  final v = emailParaEnvio(bruto);
  final arroba = v.indexOf('@');
  return arroba > 0 && v.indexOf('.', arroba) > arroba + 1;
}

/// `true` quando o campo tem algo escrito e o que esta escrito nao e
/// plausivel. **Campo vazio nao e erro ao sair do campo:** quem tocou o campo
/// e desistiu nao levou erro nenhum, e dizer "digite o e-mail" para quem ainda
/// vai digitar e o texto excessivo que o cliente reprovou. Vazio continua
/// sendo erro **no envio**, e quem decide isso e a tela.
bool erraAoSairDoCampo(String bruto) {
  final v = emailParaEnvio(bruto);
  return v.isNotEmpty && !emailPlausivel(v);
}
