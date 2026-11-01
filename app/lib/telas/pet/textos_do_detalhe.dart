/// Os textos do detalhe do pet (T.1), da edicao (BICHUS-61) e da exclusao
/// (BICHUS-60).
library;

import '../../api/modelos_pet.dart';
import '../perdido/tela_de_quem_e_o_caso.dart';
import 'textos_do_cadastro.dart';

/// Os textos de T.1, da edicao e da exclusao.
abstract final class TextosDoDetalhe {

  /// O rotulo da acao. `Compartilhar` e nao `Compartilhar no WhatsApp`: o
  /// cliente pediu *"aquela barra no celular para o usuario selecionar onde ele
  /// quer compartilhar"*, e o WhatsApp e **uma** das opcoes que o sistema
  /// lista, junto de Telegram, mensagem, e-mail e copiar.
  static const String compartilhar = 'Compartilhar';

  /// O rotulo acessivel: diz DE QUEM e o caso, porque numa lista de acoes o
  /// leitor de tela le os rotulos fora de contexto.
  static String compartilharAcessivel(String nome) =>
      'Compartilhar o desaparecimento de $nome';

  /// Quando a folha do sistema nao abriu.
  static const String folhaNaoAbriu =
      'Não conseguimos abrir as opções de compartilhamento agora. Tente de novo.';

  /// A MENSAGEM QUE SAI DO PRODUTO E CHEGA EM ESTRANHOS.
  static String mensagemDeCompartilhar({
    required String nome,
    required String? rotuloDaArea,
    required String url,
  }) {
    final lugar = rotuloDaArea?.trim() ?? '';
    final abertura = lugar.isEmpty ? '$nome sumiu.' : '$nome sumiu — $lugar.';
    return '$abertura\n'
        'A foto e os sinais estão nesta página, e por ela dá para falar com '
        'quem procura:\n'
        '$url';
  }

  /// O assunto, que vira `EXTRA_SUBJECT` no Android e o assunto do e-mail
  /// quando o destino escolhido na folha e um aplicativo de e-mail.
  static String assuntoDeCompartilhar({
    required String nome,
    required String? rotuloDaArea,
  }) {
    final lugar = rotuloDaArea?.trim() ?? '';
    return lugar.isEmpty ? '$nome sumiu' : '$nome sumiu — $lugar';
  }

  static const String editar = 'Editar';
  static const String excluir = 'Excluir';

  /// `Marcar como perdido`, trazida para a pagina do pet (cliente, 18/10).
  static const String marcarComoPerdido = TelaDeQuemEOCaso.titulo;

  /// O link para a pagina de acompanhamento do pedido da plaquinha.
  static const String acompanharPlaquinha = 'Acompanhar o pedido da plaquinha';

  /// O titulo da tela de edicao.
  static const String tituloDaEdicao = 'Editar os dados';

  static const String salvar = 'Salvar';

  /// O pet que a conta nao tem (ADR-0021).
  static const String petForaDaConta =
      'Este pet não está na sua conta.';

  static const String petForaDaContaExplicacao =
      'Ou ele foi excluído, ou o endereço é de outra conta. Volte para Meus '
      'pets para ver os seus.';

  /// `Encontrei meu pet`: a acao que faltava.
  static const String encontreiMeuPet = 'Encontrei meu pet';

  /// O que a tela diz depois de o caso encerrar.
  static String casoEncerrado(String nome) =>
      '${_o(nome)} está de volta. O caso foi encerrado e as conversas abertas '
      'não recebem mais mensagem.';

  /// O titulo da folha. Pergunta, e nao afirmacao: quem abriu a folha ainda nao
  /// decidiu nada.
  static String tituloDoEncerramento(String nome) =>
      'Encontrou ${_o(nome)}?';

  /// O corpo da folha: **o que vai acontecer**, e nada mais.
  static String corpoDoEncerramento(String nome) =>
      'Encerrar o caso tira ${_o(nome)} da lista pública de pets perdidos e '
      'encerra a busca.';

  /// As consequencias, em lista.
  static List<String> oQueAconteceAoEncerrar(String nome) => <String>[
        '${_o(nome)} sai da lista pública de pets perdidos, e a página pública '
            'do caso deixa de abrir.',
        'As conversas abertas do caso param de aceitar mensagem nova e ficam '
            'em modo leitura. Quem estava ajudando vê isso ao abrir a conversa.',
        'Dá para reabrir o caso por 7 dias, se você encerrar sem querer.',
      ];

  /// O rotulo do botao que confirma.
  static const String confirmarEncerramento = 'Encerrar o caso';

  /// O nome acessivel do botao de confirmar: ele precisa dizer SOBRE O QUE e.
  static String confirmarEncerramentoAcessivel(String nome) =>
      'Encerrar o caso de ${_o(nome)}';

  /// O rotulo de cancelar, nesta folha.
  static const String naoEncontreiAinda = 'Ainda não encontrei';

  /// `Reabrir o caso`: o desfazer que o contrato prometia e nao existia.
  static const String reabrirOCaso = 'Reabrir o caso';

  /// A faixa que explica a oferta de reabrir, com o prazo.
  static String podeReabrirAte(String dia) =>
      'Encerrou sem querer? Dá para reabrir este caso até $dia.';

  /// O que a tela diz depois de o caso REABRIR.
  static String casoReaberto(String nome) =>
      'O caso ${_de(nome)} está aberto de novo. O alerta não foi reenviado.';

  /// O rotulo do campo de sinais **no detalhe**.
  static const String rotuloDosSinais = TextosDoCadastro.rotuloDosSinais;

  static const String semSinais = 'Nenhum sinal cadastrado.';

  static const String adicionarSinais = 'Adicionar sinais';

  static String semTag(String nome) =>
      '${_o(nome)} ainda não tem tag na coleira.';

  /// Criterio 3 da BICHUS-61, palavra por palavra.
  static const String oAlertaJaSaiu =
      'O alerta que já saiu mostra os dados antigos.';

  static const String naoConseguimosSalvar =
      'Não conseguimos salvar. Seus dados continuam aqui.';

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

  /// O texto alternativo da foto atual (SC 1.1.1).
  static String fotoAtualDe(String nome) => 'Foto atual de $nome';

  /// A camera negada para sempre: o mesmo texto do cadastro, e **a mesma
  /// razao**.
  static const String cameraNegada = TextosDoCadastro.cameraNegada;
  static const String abrirOsAjustes = TextosDoCadastro.abrirOsAjustes;
  static const String cameraNaoEmbarcada =
      TextosDoCadastro.cameraNaoEmbarcada;
  static const String tirarFoto = TextosDoCadastro.tirarFoto;
  static const String escolherDaGaleria = TextosDoCadastro.escolherDaGaleria;

  static String tituloDaExclusao(String nome) => 'Excluir ${_o(nome)}?';

  /// **A frase da ADR-0004**, e o motivo de esta historia pedir revisao de
  /// seguranca.
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
      'A plaquinha: quem escanear vai ler que ela foi desativada',
      'Os casos de perdido já encerrados',
    ];
  }

  /// Criterio 4: o caso aberto nao pode ser descoberto depois da exclusao.
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

  static String _o(String nome) => nome;

  static String _de(String nome) => 'de $nome';

  /// O limite de `care_notes` continua sendo o do cadastro: a edicao usa as
  /// **mesmas regras** (criterio 7 da BICHUS-61), e duplicar o numero aqui
  /// seria a primeira divergencia.
  static const int limiteDosCuidados = TextosDoCadastro.limiteDosCuidados;

  /// O rotulo acessivel da foto grande (cliente, 17/10/2026).
  static String fotoDe(String nome) => 'Foto de $nome';
}
