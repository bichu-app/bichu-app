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

  // -- Compartilhar o caso (cliente, 20/10/2026) ----------------------------

  /// O rotulo da acao. `Compartilhar` e nao `Compartilhar no WhatsApp`: o
  /// cliente pediu *"aquela barra no celular para o usuario selecionar onde ele
  /// quer compartilhar"*, e o WhatsApp e **uma** das opcoes que o sistema
  /// lista, junto de Telegram, mensagem, e-mail e copiar. Prometer um
  /// aplicativo no rotulo seria prometer o que nao e nosso para garantir -- e
  /// mentiria no aparelho que nao o tem instalado.
  static const String compartilhar = 'Compartilhar';

  /// O rotulo acessivel: diz DE QUEM e o caso, porque numa lista de acoes o
  /// leitor de tela le os rotulos fora de contexto.
  static String compartilharAcessivel(String nome) =>
      'Compartilhar o desaparecimento de $nome';

  /// Quando a folha do sistema nao abriu.
  ///
  /// **Nao diz "WhatsApp"** e nao manda instalar nada: quem decide o que a
  /// folha mostra e o sistema, e a unica coisa que o app sabe aqui e que ela
  /// nao abriu. Oferece o que resta -- o link ja esta na pagina do caso.
  static const String folhaNaoAbriu =
      'Não conseguimos abrir as opções de compartilhamento agora. Tente de novo.';

  /// A MENSAGEM QUE SAI DO PRODUTO E CHEGA EM ESTRANHOS.
  ///
  /// ## De onde cada parte vem, e por que ela esta aqui
  ///
  /// **`$nome sumiu`** e literal da voz ja aprovada do alerta de vizinhanca
  /// (`notifications/domain/conteudo-do-push.ts`, `alertaDeVizinhanca`:
  /// `` `${nome} sumiu${lugar}` ``). Nenhuma voz nova foi inventada para esta
  /// acao: a mensagem fala com o mesmo vizinho, no mesmo momento, sobre o
  /// mesmo fato.
  ///
  /// **O lugar entra VERBATIM, como [rotuloDaArea] chegou do servidor.** Ele e
  /// o `area_label` de `LostCase`, composto por `shared/lugar/rotulo-de-area.ts`
  /// como `"Bairro, Cidade"` -- e **a coordenada nunca entra la**. Esta funcao
  /// nao recorta, nao reordena e nao acrescenta: para alguem conseguir por uma
  /// rua nesta mensagem teria de mudar o servidor, e e isso que torna a isca de
  /// privacidade dificil de furar por descuido. Lugar ausente vira a variante
  /// SEM lugar, e nao um lugar vago inventado aqui.
  ///
  /// **`A foto e os sinais estao nesta pagina`** e adaptado de
  /// "Toque para ver a foto e os sinais" (UX 12.2). "Toque" saiu porque esta
  /// mensagem e lida FORA do app, num grupo de bairro, onde nao ha o que tocar.
  ///
  /// **`falar com quem procura`** diz que existe um canal sem prometer aviso a
  /// ninguem -- o push esta bloqueado em producao e nao funciona no iPhone do
  /// cliente, e tres lugares desta casa ja afirmaram juntos um aviso que nao
  /// acontecia. E e `quem procura`, e nao `comigo`, porque a mensagem e
  /// REPASSADA: quem a cola no terceiro grupo nao e o tutor.
  ///
  /// **O link e [url], que veio do servidor em `share_url`.** Ele nunca e
  /// montado aqui a partir de identificador: `LostCase` nao carrega
  /// `share_token` -- so `id`, que e UUID e que o ADR-0010 item 6 proibe em
  /// saida publica. O app **nao tem** com o que montar o endereco, e isso e
  /// proposital.
  ///
  /// ## O que esta ausente de proposito
  ///
  /// Telefone, endereco, recompensa (o ADR-0010 a proibe em qualquer forma),
  /// qualquer afirmacao de que alguem foi avisado, e qualquer identificador
  /// interno. A isca `o texto compartilhado nao carrega endereco exato nem
  /// identificador interno` cobra as tres primeiras linhas desta lista contra o
  /// texto REAL montado, e nao contra um literal de tela.
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
  ///
  /// **Sem o link**: o assunto de um e-mail nao e lugar de endereco, e o corpo
  /// ja o carrega. Mesmo lugar verbatim da mensagem, pela mesma razao.
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

  /// O link para a pagina de acompanhamento do pedido da plaquinha.
  ///
  /// **So aparece quando ha pedido** -- ver `TelaDetalheDoPet`. Texto curto,
  /// sem frase de apoio: o cliente mandou tirar os paragrafos explicativos do
  /// app em 18/10.
  static const String acompanharPlaquinha = 'Acompanhar o pedido da plaquinha';

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

  // -- A ACAO INVERSA DE `Marcar como perdido` (cliente, 18/10/2026) ---------

  /// `Encontrei meu pet`: a acao que faltava.
  ///
  /// O cliente mediu a falta com estas palavras: *"no perfil do cachorro, o
  /// botao de marcar como perdido esta funcionando. Mas nao tem uma opcao de
  /// desmarcar como perdido ou que foi encontrado."*
  ///
  /// **`Encontrei meu pet` e nao `Desmarcar como perdido`.** As duas descrevem
  /// o mesmo toque e pedem coisas diferentes de quem le: a segunda descreve o
  /// efeito no banco, e a primeira descreve o que aconteceu na vida da pessoa.
  /// A operacao do contrato tambem nao e um desmarcar -- ela ENCERRA o caso com
  /// desfecho declarado (`outcome: reunited`), e o desfecho e o que o contrato
  /// chama de instrumento de medicao do produto.
  static const String encontreiMeuPet = 'Encontrei meu pet';

  /// O que a tela diz depois de o caso encerrar.
  ///
  /// **Afirma no passado porque, quando esta frase aparece, o servidor
  /// respondeu 200.** Nao e tela de sucesso antes do sucesso, que e o que o
  /// criterio 2 da BICHUS-31 proibe.
  ///
  /// ## A SEGUNDA FRASE FOI CORRIGIDA, e a correcao e o ponto
  ///
  /// Ela dizia *"quem estava ajudando foi avisado"*. Isso era **falso em dois
  /// niveis, medidos nesta branch**:
  ///
  /// 1. **Nada e enviado a ninguem ao encerrar.** `LostCaseService.encerrar`
  ///    nao toca em conversa nenhuma, e nao existe no servidor caminho que
  ///    grave mensagem de sistema no encerramento -- embora o contrato o
  ///    prometa (*"Ao encerrar, toda conversa aberta recebe a mensagem de
  ///    sistema que avisa quem ajudou"*). O que acontece e que a conversa passa
  ///    a `closed`, DERIVADO do estado do caso a cada leitura
  ///    (`estadoDaConversa`, com o sinal `casoEncerrado`): ela vira modo
  ///    leitura. Nada e gravado, e ninguem e acordado.
  /// 2. **O push nao sai.** O envio esta bloqueado em producao por falta de
  ///    permissao da conta de servico na VM, e no iPhone do cliente nao
  ///    funciona nenhum (provisionamento gratuito, sem capacidade de
  ///    notificacao).
  ///
  /// Esta casa ja pagou por esta classe de defeito: o servidor devolvia
  /// `owner_notified: true`, a tela afirmava isso em texto fixo E o
  /// desserializador tinha `?? true` -- tres lugares mentindo juntos. A frase
  /// agora diz o que **de fato** acontece, no tempo certo: a conversa para de
  /// receber mensagem. Quem ajudou descobre quando abrir a conversa, e e isso
  /// que o texto promete.
  static String casoEncerrado(String nome) =>
      '${_o(nome)} está de volta. O caso foi encerrado e as conversas abertas '
      'não recebem mais mensagem.';

  // -- A FOLHA DE CONFIRMACAO DO ENCERRAMENTO -------------------------------
  //
  // Antes dela, `Encontrei meu pet` era UM TOQUE sem volta aparente: ele
  // chamava `closeLostCase` direto, e a operacao de desfazer que o contrato
  // promete (`reopenLostCase`) nao tinha rota no servidor. A folha e a metade
  // de tela deste trabalho; a rota e a outra.

  /// O titulo da folha. Pergunta, e nao afirmacao: quem abriu a folha ainda
  /// nao decidiu nada.
  static String tituloDoEncerramento(String nome) =>
      'Encontrou ${_o(nome)}?';

  /// O corpo da folha: **o que vai acontecer**, e nada mais.
  ///
  /// Uma frase por consequencia, no futuro, porque nada aconteceu ainda.
  static String corpoDoEncerramento(String nome) =>
      'Encerrar o caso tira ${_o(nome)} da lista pública de pets perdidos e '
      'encerra a busca.';

  /// As consequencias, em lista. **Cada linha e uma coisa que foi MEDIDA.**
  ///
  /// A primeira: o caso sai da lista publica e a pagina publica dele deixa de
  /// abrir (`getPublicLostCase` responde 410 em caso encerrado).
  ///
  /// A segunda: as conversas abertas viram modo leitura. **Ela NAO diz que
  /// alguem foi avisado**, e a diferenca nao e de estilo -- e o que o texto
  /// afirma sobre o mundo. O que o servidor faz ao encerrar e deixar
  /// `estadoDaConversa` devolver `closed` na proxima leitura daquela conversa:
  /// ninguem recebe nada, e quem estava ajudando descobre quando voltar lá.
  /// Nenhuma mensagem de sistema e gravada (o contrato promete uma e o servidor
  /// nao a grava), e o push esta bloqueado em producao e nao funciona no
  /// iPhone do cliente. Escrever "sera avisado" aqui seria repetir, de novo, o
  /// defeito dos tres lugares mentindo juntos.
  ///
  /// A terceira: a janela de 7 dias. O numero esta aqui porque e o do contrato
  /// e do servidor -- `reopen_deadline` grava `agora + 7 dias` --, e ele e o
  /// que torna a decisao reversivel para quem esta lendo.
  static List<String> oQueAconteceAoEncerrar(String nome) => <String>[
        '${_o(nome)} sai da lista pública de pets perdidos, e a página pública '
            'do caso deixa de abrir.',
        'As conversas abertas do caso param de aceitar mensagem nova e ficam '
            'em modo leitura. Quem estava ajudando vê isso ao abrir a conversa.',
        'Dá para reabrir o caso por 7 dias, se você encerrar sem querer.',
      ];

  /// O rotulo do botao que confirma. Diz a ACAO, e nao "Confirmar".
  static const String confirmarEncerramento = 'Encerrar o caso';

  /// O nome acessivel do botao de confirmar: ele precisa dizer SOBRE O QUE e.
  ///
  /// Quem navega por leitor de tela chega no botao sem o contexto que a pessoa
  /// vidente tem da folha inteira na frente dela.
  static String confirmarEncerramentoAcessivel(String nome) =>
      'Encerrar o caso de ${_o(nome)}';

  /// O rotulo de cancelar, nesta folha. `Agora não` e nao `Cancelar`: quem
  /// abriu a folha por engano nao esta cancelando um pedido, esta dizendo que
  /// o animal ainda nao voltou.
  static const String naoEncontreiAinda = 'Ainda não encontrei';

  // -- A REABERTURA (`reopenLostCase`) --------------------------------------

  /// `Reabrir o caso`: o desfazer que o contrato prometia e nao existia.
  static const String reabrirOCaso = 'Reabrir o caso';

  /// A faixa que explica a oferta de reabrir, com o prazo.
  ///
  /// **O prazo sai da RESPOSTA** (`reopen_deadline`), e nao de uma conta de 7
  /// dias refeita no aparelho: numero de produto escrito no binario continua
  /// sendo dito por versao antiga do app depois de o servidor mudar o valor. E
  /// a mesma regra do `Retry-After` e do teto de pets.
  static String podeReabrirAte(String dia) =>
      'Encerrou sem querer? Dá para reabrir este caso até $dia.';

  /// O que a tela diz depois de o caso REABRIR.
  ///
  /// **Nao promete alerta novo**, e a ausencia e medida: reabrir nao dispara
  /// nada. Quem quer avisar a vizinhanca de novo usa o reenvio do alerta, que
  /// tem teto de um por dia e e um toque explicito.
  static String casoReaberto(String nome) =>
      'O caso ${_de(nome)} está aberto de novo. O alerta não foi reenviado.';

  // -- Sinais e vazios ------------------------------------------------------

  /// O rotulo do campo de sinais **no detalhe**.
  ///
  /// `Sinais particulares`, e nao `Sinais`: o cliente leu `Sinais` nesta tela e
  /// PERGUNTOU o que era (18/10/2026). O nome do campo no contrato e
  /// `distinctive_marks`, e o formulario que o preenche sempre o chamou de
  /// `Sinais particulares` -- quem cadastrava escrevia num campo com um nome e
  /// relia noutro.
  ///
  /// **E a constante do cadastro, e nao um literal novo**: duas redacoes para o
  /// mesmo campo sao duas redacoes que divergem na primeira manutencao.
  static const String rotuloDosSinais = TextosDoCadastro.rotuloDosSinais;

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
