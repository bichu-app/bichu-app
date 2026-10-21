/// A microcopia da saida para o app de mapas do aparelho, **numa fonte so**.
///
/// ## POR QUE ESTE ARQUIVO EXISTE
///
/// Em 21/10/2026 a mesma acao tinha TRES redacoes no aplicativo, e **duas
/// delas declaravam na propria prosa que eram copia fiel de uma quarta**:
///
/// - o encontro da Rede dizia `Abrir no mapa` e
///   `Nao conseguimos abrir o app de mapas.`;
/// - a linha de lugar da pagina do local dizia `Abrir <lugar> no mapa` e
///   `Nao conseguimos abrir o aplicativo de mapas.`, com a prosa afirmando ser
///   *"a mesma frase do encontro da Rede"*;
/// - a linha de logradouro da mesma pagina dizia `Abrir no app de mapas` e
///   `Nao encontramos um app de mapas neste aparelho.`, com a prosa afirmando
///   ser *"a MESMA frase do encontro da Rede"*.
///
/// Nenhuma das duas era copia. **Comentario que afirma copia sem portao que a
/// cobre produz divergencia silenciosa** -- e foi assim que uma acao virou
/// tres frases sem ninguem decidir que virasse.
///
/// A mescla da onda 4 convergiu os textos por COPIA MEDIDA (mesma frase em
/// duas constantes, com um caso comparando as duas). Isto aqui e o passo
/// seguinte que aquela decisao prometeu: uma fonte, lida pelas tres
/// superficies, e um portao que varre a FONTE do aplicativo para que a quarta
/// redacao nao possa ser escrita a mao em lugar nenhum.
///
/// O portao esta em `app/test/telas/endereco_do_local_abre_no_mapa_test.dart`,
/// grupo *"PORTAO -- a fonte e esta, e nenhuma tela escreve o texto a mao"*.
/// Ele le os arquivos de `app/lib/` com a prosa apagada e reprova qualquer
/// um que contenha estes literais, menos este arquivo.
///
/// ## A REDACAO NAO MUDA AQUI, E NAO POR INERCIA
///
/// Os tres textos sao, caractere por caractere, os que a onda 4 deixou em
/// `origin/development`. Unificar e mudar redacao sao dois trabalhos, e o
/// segundo e decisao do cliente -- microcopia nao se escolhe por refatoracao.
///
/// **A frase de falha NAO ATRIBUI CAUSA, e isso e o conteudo dela.**
/// `SaidaDoApp.abrirEnderecoNoAppDeMapas` e `SaidaDoApp.abrirNoAppDeMapas`
/// devolvem `false` tanto para *"nao ha app de mapas no aparelho"* quanto para
/// *"havia e a tentativa falhou"* -- a porta nao distingue os dois casos, e
/// nada abaixo dela distingue. A redacao recusada da onda 4 era
/// *"Nao encontramos um app de mapas neste aparelho"*: ela afirma o primeiro
/// quando pode ser o segundo, e manda a pessoa instalar um app que ela talvez
/// ja tenha. Se alguem for reescrever esta frase, a pergunta e se o codigo
/// passou a saber a causa; se nao passou, a frase nao pode afirma-la.
///
/// ## POR QUE EM `dispositivo/` E NAO EM `telas/`
///
/// O que estas tres frases tem em comum nao e a tela: e a PORTA. As tres
/// superficies ficam em pastas diferentes (`telas/rede/` e `telas/perto/`) e
/// chamam a mesma `SaidaDoApp`, que mora aqui ao lado. Um `textos_*.dart`
/// dentro de uma das duas pastas faria a outra importar da tela da vizinha, e
/// a terceira superficie que aparecer nao teria motivo para escolher uma das
/// duas. Alem disso, arquivo novo em `app/lib/telas` move a constante
/// `_arvoreDasTelas` do portao estrutural sem precisar.
library;

/// Os textos da saida para o app de mapas. **Fonte unica das tres
/// superficies**; ver o cabecalho deste arquivo antes de mexer.
abstract final class TextosDoAppDeMapas {
  /// O rotulo do toque que abre um ENDERECO POR EXTENSO no app de mapas.
  ///
  /// Lido por tres superficies: o endereco do encontro da Rede
  /// (`LocalDoEncontro`), a linha de lugar e a linha de logradouro da pagina
  /// do local (`PaginaDoLocal`). Nas tres o nome anunciado ao leitor de tela e
  /// `<rotulo>: <endereco>` -- a acao vem antes do dado, porque quem ouve
  /// precisa saber o que o toque faz antes de ouvir a rua.
  ///
  /// **Quem resolve o texto do endereco e o app de mapas do aparelho**
  /// (ADR-0006: o Bichu nao geocodifica).
  static const String rotuloDoEndereco = 'Abrir no mapa';

  /// O rotulo do botao que abre um PONTO (latitude e longitude) no app de
  /// mapas, sob a area de mapa estatico do encontro da Rede.
  ///
  /// **E uma acao diferente de [rotuloDoEndereco] e por isso tem texto
  /// diferente**: ali vai o texto da rua, aqui vai a coordenada com o nome do
  /// lugar como rotulo. Esta constante mora aqui pela mesma razao que a outra
  /// -- o portao de fonte varre os literais de abrir mapa em `app/lib/`, e uma
  /// excecao para este deixaria uma porta aberta do tamanho exato dela.
  static const String rotuloDoPonto = 'Abrir no app de mapas';

  /// Quando o app de mapas nao abre -- por qualquer motivo.
  ///
  /// **Nao atribui causa, de proposito.** Ver o cabecalho deste arquivo: a
  /// porta devolve `false` para "nao ha app" e para "falhou", sem distinguir.
  static const String falhaAoAbrir = 'Não conseguimos abrir o app de mapas.';
}
