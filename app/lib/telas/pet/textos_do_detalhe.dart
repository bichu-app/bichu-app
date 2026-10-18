/// Os textos do detalhe do pet (T.1), da edicao (BICHUS-61) e da exclusao
/// (BICHUS-60).
///
/// Separados da tela pelo mesmo motivo de [TextosDoCadastro]: quem revisa a
/// palavra nao deveria precisar ler um `build`, e a isca que cobra a frase
/// precisa de um lugar estavel para apontar.
///
/// ## A frase que esta historia existe para dizer
///
/// A ADR-0004 e a decisao mais dura do produto: **"o codigo pertence ao pet e
/// e imutavel. Nao se edita, nao se transfere para outro pet, nao se
/// reativa."** Excluir o pet revoga a tag com `pet_deleted`, e dali em diante
/// aquele codigo responde 410 para sempre.
///
/// **Quem exclui por engano nao recupera a plaquinha.** Nao ha atendimento que
/// desfaca, nao ha reciclagem do codigo, e o plastico que esta na coleira vira
/// um objeto que so sabe dizer que foi desativado. A tela precisa dizer isso
/// **antes** da confirmacao, e precisa dizer de um jeito que se leia.
///
/// **Por que e uma frase, e nao um paragrafo.** Aviso longo e aviso nao lido:
/// a pessoa que chegou ate aqui ja decidiu, e um muro de texto treina o olho a
/// pular direto para o botao. O que a folha faz e separar a consequencia
/// (uma frase, em [aTagNaoVolta]) da enumeracao do que some (a lista de
/// marcadores do 11.9.1). A frase carrega a parte irreversivel; a lista
/// carrega o resto.
library;

import '../../api/modelos_pet.dart';
import '../perdido/tela_de_quem_e_o_caso.dart';
import 'textos_do_cadastro.dart';

/// Os textos de T.1, da edicao e da exclusao.
abstract final class TextosDoDetalhe {
  // -- Detalhe (T.1) --------------------------------------------------------

  static const String editar = 'Editar';
  static const String excluir = 'Excluir';

  /// `Marcar como perdido`, trazida para a pagina do pet (cliente, 18/10).
  ///
  /// **E um apelido para o titulo de F3.0, e nao uma quarta copia da frase.**
  /// `TelaDeQuemEOCaso.titulo` ja e `Marcar como perdido`, e `Perfil` >
  /// `Meus pets` tem a mesma palavra num terceiro lugar. Escrever o literal
  /// aqui criaria o dia em que uma das tres muda e as outras nao.
  ///
  /// **Nao e importado de `perfil/meus_pets.dart` de proposito**: aquela tela
  /// esta sendo reescrita para virar so menus, e perder a acao. Prender o
  /// rotulo da pagina do pet a uma constante que esta saindo faria esta tela
  /// quebrar com a reescrita da outra. O destino -- F3.0/F3.1 -- nao esta
  /// saindo de lugar nenhum.
  static const String marcarComoPerdido = TelaDeQuemEOCaso.titulo;

  /// O titulo da tela de edicao. O nome nao entra: ele e o primeiro campo, e
  /// repeti-lo na barra gasta a largura que o 11.23.4 reserva para o titulo
  /// longo em fonte ampliada.
  static const String tituloDaEdicao = 'Editar os dados';

  static const String salvar = 'Salvar';

  /// O pet que a conta nao tem (ADR-0021).
  ///
  /// **A tela nao distingue "nao existe" de "nao e seu", porque o servidor
  /// tambem nao.** `GET /pets/{petId}` responde 404 nos dois casos, de
  /// proposito: um 403 confirmaria a existencia do registro para quem nao e o
  /// dono, e transformaria a rota num oraculo de enumeracao. O texto daqui
  /// precisa ser verdadeiro nos dois casos ao mesmo tempo, e por isso fala da
  /// **conta**, e nunca do registro.
  static const String petForaDaConta =
      'Este pet não está na sua conta.';

  static const String petForaDaContaExplicacao =
      'Ou ele foi excluído, ou o endereço é de outra conta. Volte para Meus '
      'pets para ver os seus.';

  // -- Sinais e vazios ------------------------------------------------------

  static const String semSinais = 'Nenhum sinal cadastrado.';

  static const String adicionarSinais = 'Adicionar sinais';

  static String semTag(String nome) =>
      '${_o(nome)} ainda não tem tag na coleira.';

  // -- Edicao ---------------------------------------------------------------

  /// Criterio 3 da BICHUS-61, palavra por palavra.
  ///
  /// Fica visivel **enquanto a pessoa edita**, e nao depois de salvar: depois
  /// de salvar a informacao ja nao muda decisao nenhuma. O cartaz e o alerta
  /// que sairam carregam os dados do momento em que sairam, e nada nesta tela
  /// os reescreve.
  static const String oAlertaJaSaiu =
      'O alerta que já saiu mostra os dados antigos.';

  static const String naoConseguimosSalvar =
      'Não conseguimos salvar. Seus dados continuam aqui.';

  // -- A foto na edicao -----------------------------------------------------

  /// O rotulo do bloco. "Foto" e nao "Foto do pet": o nome do pet ja esta no
  /// primeiro campo da mesma tela.
  static const String tituloDaFoto = 'Foto';

  static const String adicionarFoto = 'Adicionar foto';
  static const String trocarAFoto = 'Trocar a foto';
  static const String removerAFoto = 'Remover a foto';

  static const String semFotoAinda = 'Nenhuma foto ainda.';

  /// **Campo vazio a preencher, e nao pendencia acusada.** O criterio 10 da
  /// BICHUS-61 pede isso por nome: a ausencia de foto nao e erro de quem
  /// cadastrou, e a tela nao a trata como um problema a consertar.
  static const String fotoEmProcessamento =
      'A foto está sendo processada. Ela aparece aqui em instantes.';

  static const String fotoSubindo = 'Enviando a foto…';

  static const String fotoEnviada =
      'Foto enviada. Ela aparece aqui quando o processamento terminar.';

  static const String fotoSemSinal =
      'Sem conexão para enviar a foto. Ela sai sozinha quando o sinal voltar.';

  static const String fotoRecusada =
      'O envio foi recusado. Tente outra foto.';

  static const String naoConseguimosRemoverAFoto =
      'Não conseguimos remover a foto. Ela continua aqui.';

  /// O 409 de `deletePetPhoto`, se o servidor algum dia o emitir.
  ///
  /// Texto escrito **agora** de proposito: o contrato declara a recusa, e um
  /// `switch` que nao a cobre devolveria a mensagem generica no unico caso em
  /// que ha algo concreto a dizer.
  static const String fotoPresaAoCasoAberto =
      'Esta é a única foto, e o caso de perdido está aberto. Sem foto o alerta '
      'não funciona. Troque a foto, ou encerre o caso antes de removê-la.';

  static const String tituloDaRemocaoDaFoto = 'Remover a foto?';

  static String corpoDaRemocaoDaFoto(String nome) =>
      'Isso apaga a foto ${_de(nome)} do cadastro. Você pode enviar outra '
      'depois.';

  static const String confirmarRemocaoDaFoto = 'Remover';

  static String confirmarRemocaoDaFotoAcessivel(String nome) =>
      'Remover a foto de $nome do cadastro';

  /// O texto alternativo da foto atual (SC 1.1.1). Diz **de quem** e a foto:
  /// "Foto" sozinho nao informa nada a quem usa leitor de tela.
  static String fotoAtualDe(String nome) => 'Foto atual de $nome';

  /// A camera negada para sempre: o mesmo texto do cadastro, e **a mesma
  /// razao**. Nao ha microcopy nova aqui -- duas frases diferentes para o
  /// mesmo estado do aparelho e como as telas divergem sem ninguem ver.
  static const String cameraNegada = TextosDoCadastro.cameraNegada;
  static const String abrirOsAjustes = TextosDoCadastro.abrirOsAjustes;
  static const String cameraNaoEmbarcada =
      TextosDoCadastro.cameraNaoEmbarcada;
  static const String tirarFoto = TextosDoCadastro.tirarFoto;
  static const String escolherDaGaleria = TextosDoCadastro.escolherDaGaleria;

  // -- Exclusao (BICHUS-60) -------------------------------------------------

  static String tituloDaExclusao(String nome) => 'Excluir ${_o(nome)}?';

  /// **A frase da ADR-0004**, e o motivo de esta historia pedir revisao de
  /// seguranca.
  ///
  /// Ela diz as duas metades que as pessoas confundem: a plaquinha para de
  /// funcionar (o efeito) **e** o codigo nao volta (a irreversibilidade).
  /// Quem le so a primeira metade imagina que o atendimento religa; a segunda
  /// fecha essa porta antes de a pessoa tocar no botao.
  static const String aTagNaoVolta =
      'A plaquinha da coleira para de funcionar, e não tem como voltar atrás: '
      'o código é desativado para sempre e não pode ser usado em outro pet.';

  static String corpoDaExclusao(String nome) =>
      'Isso apaga o cadastro ${_de(nome)}. $aTagNaoVolta';

  /// O que some, em marcadores, com quantidade concreta quando existir
  /// (11.9.1).
  static List<String> oQueSome(Pet pet) {
    final nome = pet.nome;
    return <String>[
      if (pet.fotos.isNotEmpty)
        pet.fotos.length == 1
            ? 'A foto ${_de(nome)}'
            : 'As ${pet.fotos.length} fotos ${_de(nome)}',
      'Os sinais e o cartão de manejo',
      // Nao e "a tag some": ela **responde**, e o que ela responde e o que
      // decide se o achador chega a alguem. A ADR-0004 poe isso como o motivo
      // de o 410 nao ser 404.
      'A plaquinha: quem escanear vai ler que ela foi desativada',
      'Os casos de perdido já encerrados',
    ];
  }

  /// Criterio 4: o caso aberto nao pode ser descoberto depois da exclusao.
  ///
  /// Entra como [FolhaDestrutiva.avisoExtra], acima das acoes, e **so quando
  /// existe caso aberto**. Um aviso que aparece sempre e um aviso que ninguem
  /// le no dia em que ele vale.
  static String casoAbertoSeraEncerrado(String nome) =>
      '${_o(nome)} está dado como perdido agora. Excluir encerra esse caso '
      'sem desfecho, e quem já recebeu o alerta não é avisado disso.';

  static const String confirmarExclusao = 'Excluir mesmo assim';

  /// O nome acessivel do botao destrutivo (11.9.1): diz **o que** sera
  /// destruido, e nao so "Confirmar".
  static String confirmarExclusaoAcessivel(String nome) =>
      'Excluir $nome e desativar a plaquinha para sempre';

  static String excluido(String nome) => '$nome foi excluído.';

  /// A exclusao exige conexao, e diz isso **em vez de falhar no meio** (T.1,
  /// "Sem conexao").
  static const String exclusaoPrecisaDeConexao =
      'Precisamos de conexão para excluir. Nada foi apagado.';

  // -- Concordancia ---------------------------------------------------------

  /// `o`/`a` pelo nome nao da para adivinhar, e o contrato nao traz genero de
  /// nome proprio: [Pet.sexo] e do animal, nao da palavra. O texto foi escrito
  /// para funcionar sem artigo definido antes do nome, que e o que evita
  /// "a Thor" e "o Nina" com a mesma linha.
  static String _o(String nome) => nome;

  static String _de(String nome) => 'de $nome';

  /// O limite de `care_notes` continua sendo o do cadastro: a edicao usa as
  /// **mesmas regras** (criterio 7 da BICHUS-61), e duplicar o numero aqui
  /// seria a primeira divergencia.
  static const int limiteDosCuidados = TextosDoCadastro.limiteDosCuidados;

  /// O rotulo acessivel da foto grande (cliente, 17/10/2026).
  ///
  /// Curto de proposito: o leitor de tela ja leu o nome na barra, e uma frase
  /// aqui seria a terceira vez.
  static String fotoDe(String nome) => 'Foto de $nome';
}
