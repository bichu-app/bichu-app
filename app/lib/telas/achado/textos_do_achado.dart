/// Os textos de F3.5, num lugar so.
///
/// **Constante e nao literal espalhado**, pela razao de sempre: o mesmo texto
/// aparece na tela, na isca e no anuncio de leitor de tela, e tres copias
/// divergem na primeira correcao de virgula.
///
/// **CUIDADO COM A ISCA TAUTOLOGICA.** Uma isca que compare o texto
/// renderizado com a constante que o produz fica verde com qualquer coisa
/// escrita aqui -- inclusive com a frase errada. As iscas desta historia que
/// medem PALAVRA escrevem a palavra a mao, de proposito; as que usam estas
/// constantes medem **presenca de um texto especifico em um estado
/// especifico**, que e outra afirmacao.
library;

import '../../dispositivo/camera_e_galeria.dart';

abstract final class TextosDoAchado {
  /// O titulo da barra de topo.
  ///
  /// **Nao e o rotulo do botao**, e a diferenca e proposital: a barra diz onde
  /// a pessoa esta e o botao diz o que o toque faz. Titulo e acao com a mesma
  /// palavra deixam a tela com dois "Registrar achado" -- e quem navega por
  /// leitor de tela ouve o mesmo texto duas vezes, sem saber qual dos dois
  /// aciona alguma coisa.
  static const String titulo = 'Achei um pet';

  /// A frase de abertura, palavra por palavra do criterio 1.
  static const String chamada = 'Você achou um pet. Conte o que dá para ver.';

  // -- Foto -----------------------------------------------------------------

  static const String rotuloDaFoto = 'Foto';

  static const String tirarFoto = 'Tirar foto';
  static const String escolherDaGaleria = 'Escolher da galeria';
  static const String trocarAFoto = 'Trocar a foto';

  /// O rotulo que o leitor de tela anuncia sobre a previa.
  static const String fotoEscolhidaDoAchado = 'Foto escolhida do pet achado';

  /// Quem ve a foto, numa linha (cliente, 17/10/2026).
  ///
  /// **O paragrafo saiu; a afirmacao de privacidade ficou.** O cliente pediu
  /// para tirar o texto da foto, e o que ele nomeou -- "a foto nao aparece em
  /// lista nenhuma" -- saiu. O que sobra e o unico pedaco com peso de
  /// privacidade: a quem a foto e mostrada. Apagar isso tambem seria apagar o
  /// aviso de uso de dado, e esse apagamento nao e meu para fazer.
  static const String fotoSoNaConversa = 'Mostrada só ao tutor, na conversa.';

  /// A orientacao de tamanho, numa linha (cliente, 17/10/2026).
  ///
  /// Vem de `orientacaoDeTamanhoDaImagem` e nao e escrita aqui: o numero e o
  /// mesmo teto que o contrato declara e que o balde impoe na politica
  /// assinada.
  static const String orientacaoDaFoto = orientacaoDeTamanhoDaImagem;

  static const String cameraNosAjustes =
      'A câmera está bloqueada para o Bichu. Dá para liberar nos ajustes do '
      'sistema.';

  static const String semCamera =
      'Este aparelho não tem câmera disponível para o Bichu. Dá para escolher '
      'uma foto da galeria.';

  static const String abrirAjustes = 'Abrir os ajustes';

  // -- Os campos ------------------------------------------------------------

  static const String rotuloDaEspecie = 'O que é o bicho?';
  static const String rotuloDoPorte = 'Do tamanho de quê?';
  static const String rotuloDoSexo = 'Macho ou fêmea?';
  static const String rotuloDaRaca = 'Raça';
  static const String rotuloDaCor = 'Cor';
  static const String escolherNaLista = 'Escolher na lista';

  /// A ajuda da raca e da cor, dita junto do campo.
  static const String listaSoSeVoceSouber =
      'Só se você souber. Em branco funciona.';

  static const String rotuloDeOnde = 'Onde você achou?';
  static const String rotuloDeQuando = 'Quando?';

  static const String rotuloDaObservacao =
      'Alguma coisa que ajude a reconhecer?';

  static const String exemploDaObservacao =
      'coleira azul sem placa, mancha branca no peito, mancava da pata '
      'traseira';

  // -- O que acontece sem rotulo de area ------------------------------------

  /// A frase que a tela mostra quando ha coordenada e **nenhum texto
  /// digitado** (criterio 6, e a consequencia da BICHUS-23).
  ///
  /// Ela nao repreende e nao bloqueia: o achado vale, e o que muda e a forma
  /// como ele aparece para o tutor. Derivar o bairro da coordenada e o que o
  /// ADR-0006 proibe, entao a unica saida honesta e perguntar -- e o campo de
  /// bairro esta logo ali, oferecido junto com o GPS.
  static const String semRotuloDeArea =
      'O tutor vai ver a distância, e não o bairro. Escreva o bairro e a '
      'cidade acima se quiser que ele apareça.';

  /// A frase que a tela mostra quando ha area digitada e **nenhuma
  /// coordenada** (criterio 6).
  ///
  /// O cruzamento **nao deixa de existir**: ele perde o criterio de distancia
  /// e passa a valer dentro da mesma cidade. Dizer "não vai funcionar" seria
  /// mentira, e dizer nada deixaria a pessoa achar que a distancia foi medida.
  static const String semCoordenada =
      'Sem o ponto no mapa, a busca por um tutor parecido vale na cidade '
      'inteira, e não no seu quarteirão.';

  // -- Os dois passos -------------------------------------------------------

  /// O titulo do passo 1, **palavra por palavra do cliente (17/10/2026)**.
  ///
  /// **PENDENTE DE CONFIRMACAO.** Ele ditou esta frase testando o registro de
  /// ACHADO, e quem acha um animal na rua nao sabe se ele esta perdido --
  /// pode ser abandonado, pode estar passeando solto. A frase e dele e esta
  /// aqui como ele a escreveu; trocar "perdido" por "achou" e decisao dele.
  static const String tituloDoPasso1 = 'Qual o animalzinho está perdido?';

  /// O titulo do passo 2.
  static const String tituloDoPasso2 = 'Onde e quando';

  static const String continuar = 'Continuar';
  static const String voltarAoPasso1 = 'Voltar';

  // -- O envio --------------------------------------------------------------

  static const String registrar = 'Registrar achado';

  // -- A tela do achado registrado -----------------------------------------

  /// O titulo da barra de topo do desfecho.
  ///
  /// **Neutro, e nao o estado.** A barra e a headline diziam a mesma frase, e
  /// o resultado era o mesmo texto duas vezes na arvore de semantica: quem usa
  /// leitor de tela ouve a resposta, ouve de novo, e nao sabe se sao duas
  /// coisas. O estado mora na headline, que e onde a pessoa olha.
  static const String tituloDaBarraDoDesfecho = 'Achado';

  static const String tituloDoRegistrado = 'Achado registrado';

  /// **`Na fila` NAO e `Registrado`**, e a distancia entre as duas frases e o
  /// criterio 2 da BICHUS-31: tela de sucesso para o que nao aconteceu faz a
  /// pessoa parar de procurar caminho.
  static const String tituloDaFila = 'Vamos registrar quando a conexão voltar';

  static const String registradoCorpo =
      'Se aparecer um tutor procurando um pet parecido, a gente te avisa. '
      'Quem confirma se é o mesmo animal é o tutor, nunca o Bichu sozinho.';

  /// O corpo da fila, com a promessa que a fila de fato cumpre.
  static const String filaCorpo =
      'O que você escreveu está guardado no aparelho e sai sozinho assim que '
      'houver sinal. Pode fechar o app.';

  /// O estado da foto que ainda nao subiu (criterio 4).
  ///
  /// *"achado sem foto vale menos, mas vale"* -- e por isso a frase diz o que
  /// falta sem sugerir que o achado nao existe.
  static const String fotoAindaNaoSubiu =
      'A foto ainda não foi enviada. O achado já vale sem ela, e a foto entra '
      'na conversa quando o tutor aparecer.';

  static const String semFoto = 'Você registrou este achado sem foto.';

  static const String voltarParaOsPets = 'Voltar';

  /// O que a tela do achado diz quando o servidor responde ausencia.
  ///
  /// **A mesma frase para "nao existe" e para "nao e seu"**, e a igualdade e
  /// o ponto: um texto diferente para cada caso confirmaria a existencia do
  /// registro para quem nao e o dono (ADR-0021).
  static const String naoEncontrado =
      'Não encontramos este achado na sua conta.';
}
