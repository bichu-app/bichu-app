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
import 'textos_do_cadastro.dart';

/// Os textos de T.1, da edicao e da exclusao.
abstract final class TextosDoDetalhe {
  // -- Detalhe (T.1) --------------------------------------------------------

  static const String editar = 'Editar';
  static const String excluir = 'Excluir';

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

  static String semSinais(String nome) =>
      'Nenhum sinal cadastrado. Sinais são o que faz alguém reconhecer '
      '${_o(nome)} na rua.';

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
}
