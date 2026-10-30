/// Os textos de F3.5, num lugar so.
library;

import '../../dispositivo/camera_e_galeria.dart';

abstract final class TextosDoAchado {
  /// O titulo da barra de topo.
  static const String titulo = 'Achei um pet';

  /// A frase de abertura, palavra por palavra do criterio 1.
  static const String chamada = 'Você achou um pet. Conte o que dá para ver.';

  static const String rotuloDaFoto = 'Foto';

  static const String tirarFoto = 'Tirar foto';
  static const String escolherDaGaleria = 'Escolher da galeria';
  static const String trocarAFoto = 'Trocar a foto';

  /// O rotulo que o leitor de tela anuncia sobre a previa.
  static const String fotoEscolhidaDoAchado = 'Foto escolhida do pet achado';

  /// Quem ve a foto, numa linha (cliente, 17/10/2026).
  static const String fotoSoNaConversa = 'Mostrada só ao tutor, na conversa.';

  /// A orientacao de tamanho, numa linha (cliente, 17/10/2026).
  static const String orientacaoDaFoto = orientacaoDeTamanhoDaImagem;

  static const String cameraNosAjustes =
      'A câmera está bloqueada para o Bichu. Dá para liberar nos ajustes do '
      'sistema.';

  static const String semCamera =
      'Este aparelho não tem câmera disponível para o Bichu. Dá para escolher '
      'uma foto da galeria.';

  static const String abrirAjustes = 'Abrir os ajustes';

  /// A ESPECIE NAO TEM ROTULO VISIVEL (cliente, 22/10/2026).
  static const String nomeDaEspecie = 'Espécie';

  /// O porte, na redacao que ele ditou em 22/10/2026.
  static const String rotuloDoPorte = 'Qual é o porte?';
  static const String rotuloDoSexo = 'Macho ou fêmea?';
  static const String rotuloDaRaca = 'Raça';
  static const String rotuloDaCor = 'Cor';
  static const String escolherNaLista = 'Escolher na lista';

  static const String rotuloDeOnde = 'Onde você achou?';
  static const String rotuloDeQuando = 'Quando?';

  /// **A REDACAO E DO CLIENTE (22/10/2026), literal**: *"Altere a frase para:
  /// Alguma coisa que ajude a reconhecer para Alguma caracteristica especifica
  /// que ajude a identifica-lo."*
  static const String rotuloDaObservacao =
      'Alguma característica específica que ajude a identificá-lo.';

  static const String exemploDaObservacao =
      'coleira azul sem placa, mancha branca no peito, mancava da pata '
      'traseira';

  /// O titulo do passo 1, **palavra por palavra do cliente (17/10/2026)**.
  static const String tituloDoPasso1 = 'Qual o animalzinho está perdido?';

  /// O titulo do passo 2.
  static const String tituloDoPasso2 = 'Onde e quando';

  static const String continuar = 'Continuar';
  static const String voltarAoPasso1 = 'Voltar';

  static const String registrar = 'Registrar achado';

  /// O titulo da barra da tela nova.
  static const String tituloDeEncontrei = 'Achei este pet';

  /// A headline, com o nome do pet.
  static String chamadaDeEncontrei(String nome) => 'Você achou o $nome.';

  /// A frase que diz POR QUE a tela nao pergunta o animal.
  static const String oQueJaSabemos =
      'A gente já sabe quem ele é. Conte só o que só você sabe.';

  /// O rotulo do cartao de identificacao do pet.
  static const String rotuloDeQuemE = 'O pet que você achou';

  /// A descricao da foto do pet, para leitor de tela.
  static String fotoDoPetDoCaso(String nome) => 'Foto do $nome';

  /// A linha de especie e porte do cartao, **somente leitura**.
  static String especieEPorte(String especie, String porte) =>
      '$especie · $porte';

  /// O rotulo do recado, nesta tela.
  static const String rotuloDoRecado = 'Quer deixar um recado para o tutor?';

  static const String exemploDoRecado =
      'está bem, está comigo em casa, pode me procurar à tarde';

  /// O rotulo do botao de envio.
  static const String avisarOTutor = 'Avisar o tutor';

  /// O titulo da barra de topo do desfecho.
  static const String tituloDaBarraDoDesfecho = 'Achado';

  static const String tituloDoRegistrado = 'Achado registrado';

  /// **`Na fila` NAO e `Registrado`**, e a distancia entre as duas frases e o
  /// criterio 2 da BICHUS-31: tela de sucesso para o que nao aconteceu faz a
  /// pessoa parar de procurar caminho.
  static const String tituloDaFila = 'Vamos registrar quando a conexão voltar';

  /// O corpo do desfecho, ENXUGADO em 22/10/2026 (*"tem muito texto, vamos
  /// resumir isso"*).
  static const String registradoCorpo =
      'Se aparecer um tutor procurando um pet parecido, a gente te avisa.';

  /// O corpo da fila, com a promessa que a fila de fato cumpre.
  static const String filaCorpo =
      'O que você escreveu está guardado no aparelho e sai sozinho assim que '
      'houver sinal. Pode fechar o app.';

  /// O estado da foto que ainda nao subiu (criterio 4).
  static const String fotoAindaNaoSubiu =
      'A foto ainda não foi enviada. O achado já vale sem ela.';

  static const String semFoto = 'Você registrou este achado sem foto.';

  /// ONDE A FOTO ESTA, na tela do achado (`/achados/:id`), que **nao tem foto
  /// para desenhar**.
  static const String fotoNaoApareceAqui =
      'Se você enviou uma foto, ela não aparece aqui: a foto do achado é '
      'mostrada só ao tutor, na conversa.';

  /// O cabecalho do bloco do registro.
  static const String tituloDoQueGuardamos = 'O que a gente guardou';

  /// O estado do aviso em PALAVRA, nunca em cor sozinha (SC 1.4.1).
  static const String estadoEmAnalise = 'Em análise';

  /// Quando o servidor nao mandou rotulo de area.
  static const String regiaoNaoInformada = 'Região não informada';

  /// `Achado em dd/mm/aaaa`, com o nulo tratado por quem chama.
  static String achadoEmTexto(DateTime quando) {
    final local = quando.toLocal();
    final dia = local.day.toString().padLeft(2, '0');
    final mes = local.month.toString().padLeft(2, '0');
    return 'Achado em $dia/$mes/${local.year}';
  }

  /// O que a pessoa escreveu para ajudar a reconhecer, com rotulo.
  static const String rotuloDosSinais = 'Os sinais que você descreveu';

  /// O cabecalho do bloco mais delicado da tela.
  static const String tituloDeQuemFoiAvisado = 'Quem foi avisado';

  /// **NINGUEM, e a tela diz isso com todas as letras.**
  static const String ninguemFoiAvisado = 'Ninguém foi avisado ainda.';

  /// O que o tutor recebe, e **quando**, sem prometer o aviso no celular.
  static const String oQueOTutorRecebe =
      'Se um tutor abrir um caso de um pet parecido, é a foto e os sinais que '
      'você descreveu que ele vai receber. Quem confirma se é o mesmo animal é '
      'o tutor, nunca o Bichu sozinho.';

  /// **O aviso no celular NAO funciona, e a tela diz.**
  static const String avisoNoCelularNaoFunciona =
      'Quando a gente diz que te avisa, é aqui dentro do aplicativo: o aviso '
      'no celular ainda não está funcionando no Bichu. Não espere um toque no '
      'telefone, confira você mesmo por aqui.';

  static const String tituloDoQueFazerAgora = 'O que fazer agora';

  /// O passo 1, e e o unico que alcanca o tutor **sem depender de nada nosso**.
  static const String passoDaPlaquinha =
      'Olhe se o bicho tem plaquinha ou coleira com código. Escanear o QR da '
      'plaquinha chega direto no tutor, na hora.';

  /// O passo 2: a lista publica de perdidos existe desde 18/10 e e o lugar em
  /// que a pessoa pode fazer a correspondencia com as proprias maos.
  static const String passoDaListaDePerdidos =
      'Procure o bicho na lista de pets perdidos, na seção Pets. Ela mostra '
      'quem está sendo procurado, com foto e bairro.';

  /// O passo 3, e ele e sobre o animal e nao sobre o app.
  static const String passoDeCuidar =
      'Deixe o animal num lugar seguro e volte aqui para acompanhar o achado. '
      'Nada que você fez se perde.';

  /// O rotulo da acao de escanear, no corpo da tela.
  static const String escanearAPlaquinha = 'Escanear a plaquinha';

  static const String voltarParaOsPets = 'Voltar';

  /// A acao que leva ao registro que a pessoa acabou de criar.
  static const String verOAchado = 'Ver o achado';

  /// O que a tela do achado diz quando o servidor responde ausencia.
  static const String naoEncontrado =
      'Não encontramos este achado na sua conta.';
}
