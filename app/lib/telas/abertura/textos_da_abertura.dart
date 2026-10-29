/// Os textos do recado de abertura sem conexao.
///
/// Separados da tela pelo mesmo motivo de [TextosDaAtualizacao]: quem revisa a
/// palavra nao deveria precisar ler um `build`, e a isca que cobra a frase
/// precisa de um lugar estavel para apontar.
///
/// ## A regra de linguagem desta tela
///
/// Quem le isto acabou de abrir o aplicativo e nao conseguiu entrar. Entao:
///
/// - **O sujeito do TITULO e o aplicativo, nao a pessoa.** "Nao conseguimos
///   abrir o Bichu", e nao "voce esta sem internet" -- porque metade das vezes
///   o defeito e do nosso lado (servidor fora), e a tela nao sabe qual das
///   duas foi.
///
///   **O CORPO deixou de seguir esta regra em 28/10/2026, por decisao do
///   cliente**, e a excecao esta escrita em [TextosDaAbertura.corpoSemConexao]
///   com a frase dele. A regra continua valendo para o titulo, que e quem
///   AFIRMA; o corpo passou a ser so a sugestao do que tentar.
/// - **Nada de "erro de rede", "timeout" nem "host".** Sao palavras de
///   sistema.
/// - **Um caminho visivel.** Tentar de novo e a acao; seguir sem internet e a
///   saida, porque este app tem fila offline e foto pendente e o metro e o
///   elevador sao operacao normal dele.
library;

/// Os textos da abertura sem conexao.
abstract final class TextosDaAbertura {
  /// O titulo. **Nao afirma de quem e a culpa**, porque a sonda nao sabe: sem
  /// internet no aparelho e servidor fora chegam aqui pelo mesmo caminho (ver
  /// `SondaDeConexao.servidorRespondeu`).
  static const String tituloSemConexao = 'Não conseguimos abrir o Bichu';

  /// O QUE FAZER, e so isso (cliente, 28/10/2026).
  ///
  /// **A primeira frase saiu por decisao dele**, literal: *"Retire a parte do
  /// bichu nao conseguiu falar com o servidor, e deixe apenas a parte do
  /// confira sua conexao com a internet e tente novamente"*. Era
  /// *"O Bichu nao conseguiu falar com o servidor. Confira sua conexao com a
  /// internet e tente de novo."*
  ///
  /// **E ISTO MUDA O QUE A TELA AFIRMA, e a mudanca e consciente.** A regra de
  /// linguagem no topo deste arquivo diz que o sujeito e o aplicativo e nao a
  /// pessoa, *"porque metade das vezes o defeito e do nosso lado (servidor
  /// fora), e a tela nao sabe qual das duas foi"*. O corpo agora manda conferir
  /// **a internet dela**, e com o servidor fora esse e conselho inutil -- a
  /// pessoa vai olhar o Wi-Fi que esta funcionando.
  ///
  /// O que segura a honestidade da tela e o TITULO, que continua sem culpar
  /// ninguem (`Não conseguimos abrir o Bichu`): ele e a afirmacao, o corpo e a
  /// sugestao. Quem decidiu a troca foi o cliente, com a frase acima, e ela
  /// nao se reverte por leitura de codigo.
  ///
  /// **`tente de novo` e nao `tente novamente`**, embora ele tenha escrito
  /// `novamente`: a palavra tem de casar com [tentarDeNovo], que e o rotulo do
  /// botao logo abaixo. Corpo e botao com verbos diferentes para a mesma acao
  /// fariam a pessoa procurar um segundo botao.
  static const String corpoSemConexao =
      'Confira sua conexão com a internet e tente de novo.';

  /// A acao primaria: perguntar outra vez.
  static const String tentarDeNovo = 'Tentar de novo';

  /// A SAIDA, e ela nao e enfeite.
  ///
  /// Sem ela esta tela seria um bloqueio -- e bloquear o app por falta de rede
  /// contradiz o desenho inteiro do produto: `PortaoDeVersao` nasce liberado
  /// justamente porque "metro, elevador, aviao e sinal ruim sao operacao
  /// normal deste produto", e a fila offline existe para guardar o caso do pet
  /// sumido ate o sinal voltar. Quem abre sem internet precisa poder chegar
  /// nela.
  static const String seguirSemInternet = 'Usar sem internet';

  /// O que o leitor de tela anuncia ao abrir o recado. Diz que HA saida,
  /// porque quem nao ve a tela precisa saber disso antes de procurar.
  static const String semanticaSemConexao =
      'Não foi possível falar com o servidor. Você pode tentar de novo ou '
      'seguir usando o aplicativo sem internet.';
}
