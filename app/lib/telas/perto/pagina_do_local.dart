import 'package:flutter/material.dart';
import 'package:go_router/go_router.dart';
import 'package:url_launcher/url_launcher.dart';

import '../../acessibilidade/anunciar.dart';
import '../../api/falhas.dart';
import '../../api/mensagens_de_erro.dart';
import '../../api/modelos_diretorio.dart';
import '../../api/problem.dart';
import '../../dispositivo/saida_do_app.dart';
import '../../escopo.dart';
import '../../roteamento/rotas.dart';
import '../../roteamento/saida_da_mensagem.dart';
import '../../theme/bichu_colors.dart';
import '../../theme/bichu_tokens.g.dart';
import '../../widgets/bichu_field.dart';
import '../../widgets/botao_primario.dart';
import '../../widgets/convite_para_entrar.dart';
import '../../widgets/faixa_de_aviso.dart';
import '../../widgets/folha_destrutiva.dart';
import '../../widgets/grupo_de_opcoes.dart';
import '../../widgets/icone_do_inscrito.dart';
import '../../widgets/imagem_da_rede.dart';
import '../../widgets/moldura.dart';
import '../../widgets/rodape_da_paginacao.dart';
import '../casca_com_abas.dart';
import 'lista_do_diretorio.dart';

/// A pagina de um local do `Perto`: `GET /v1/directory/entries/{slug}`
/// (`getDirectoryEntry`), com as avaliacoes de `listDirectoryEntryReviews`.
///
/// **Ela existe por um pedido do cliente de 18/10/2026**: que os locais do
/// diretorio virassem clicaveis, com pagina propria, pontuacao de 1 a 5 e
/// recomendacao em texto "onde ficara disponivel para outros usuarios, como
/// acontece na playstore". Ate aqui o `Perto` era uma lista sem destino, e o
/// comentario de `CartaoDoDiretorio` dizia isso com todas as letras.
///
/// ## Ordem, de cima para baixo (prototipo de desenho de 18/10)
///
/// Cabecalho (nome, atividade, lugar, distancia, **o que foi verificado**,
/// `Ligar`); `Informações` com o `about`; `Avaliações` com media, contagem e
/// histograma; `A minha avaliação`; `O que outras pessoas disseram`, com a
/// ordenacao no corpo e o rodape de paginacao.
///
/// ## O que esta tela NAO tem, e nenhuma ausencia e esquecimento
///
/// - **Site, e-mail, WhatsApp, redes sociais, horario de funcionamento, foto,
///   capa, endereco de rua, mapa e preco.** Nao sao colunas de
///   `professionals`: nao ha de onde preenche-los e eles nao estao no
///   contrato. Desenhar espaco para eles produziria uma tela com seis linhas
///   vazias permanentes, que e pior do que uma tela curta.
/// - **Selo generico.** A verificacao diz O QUE foi provado, por
///   `VerificacaoDaEntrada.oQueFoiVerificado`. A BICHUS-165 nao passou
///   justamente por carimbar "Verificado" sem dizer o que.
/// - **`Denunciar este local`**, que o protótipo desenha. Nao existe operacao
///   para isso no contrato -- `reportDirectoryEntryReview` denuncia uma
///   AVALIACAO, nunca a entrada. Um botao aqui seria acao sem destino, que e o
///   defeito que o criterio 2 da BICHUS-62 proibe.
/// - **Filtro "só com comentário"**, que o protótipo desenha ao lado da
///   ordenacao. `listDirectoryEntryReviews` aceita `sort` e mais nada;
///   filtrar em memoria a pagina de 10 seria um filtro que funciona com 10
///   avaliacoes e mente com 128.
/// - **Resposta do profissional.** O ADR-0011 lhe da direito de resposta
///   publica, e o contrato ainda nao tem a rota.
///
/// ## A ordenacao fica no CORPO, e isso nao contradiz 17/10
///
/// Em 17/10 o cliente mandou o acesso ao filtro e a ordem das **listagens de
/// aba** subir para a barra de titulo, pelo slot unico de `casca_com_abas.dart`
/// (`BarraDeListagem`). Esta tela e **empilhada** e nao tem aquele slot: ela
/// tem barra propria, com `Voltar` no lugar do `leading` e o nome do local no
/// titulo. A ordenacao das avaliacoes mora no topo do conteudo da secao a que
/// ela pertence, que e onde a pessoa esta olhando quando decide reordenar.
///
/// ## Quem ve o que
///
/// - **Sem conta**: nao ha o que mostrar. `getDirectoryEntry` exige conta no
///   contrato -- ela devolve `phone_e164`, que
///   `src/tools/portao-contrato-publico.ts` proibe em rota publica --, entao a
///   tela **nao faz a chamada** e convida a entrar. Chamar para colher 401
///   seria gastar uma requisicao para descobrir o que o contrato ja diz.
/// - **Conta sem e-mail confirmado** (`can_review: false` com
///   `review_blocked_reason: unverified_channel`): le tudo, e **o campo nao e
///   desenhado**. No lugar dele vai a frase e a porta de confirmar o e-mail --
///   oferecer o campo faria a pessoa escrever um texto e perde-lo num 403.
/// - **Conta que pode avaliar**: o campo, com a nota obrigatoria e o texto
///   opcional.
/// - **Conta que ja avaliou**: a minha no topo, com `Editar` e `Apagar`.
class PaginaDoLocal extends StatefulWidget {
  const PaginaDoLocal({required this.slug, super.key});

  final String slug;

  /// Empilha o local no ramo do `Perto`, com a barra de abas: voltar devolve a
  /// lista com a busca e o filtro de quem estava procurando.
  static Future<void> abrir(BuildContext context, String slug) {
    return context.push<void>(Rotas.localDoPertoDe(slug));
  }

  static const String tituloDaTela = 'Local';
  static const String rotuloDeAtualizar = 'Atualizar';
  static const String carregandoOLocal = 'Carregando o local';

  static const String tituloDasInformacoes = 'Informações';
  static const String tituloDasAvaliacoes = 'Avaliações';
  static const String tituloDaMinha = 'A minha avaliação';
  static const String tituloDasOutras = 'O que outras pessoas disseram';

  /// O 404 do contrato, com **uma** frase.
  ///
  /// Rascunho, oculto, removido e inexistente sao quatro causas e um texto: a
  /// tela nao tem o que fazer com a diferenca, e distinguir contaria a quem
  /// esta de fora que existe uma entrada que ninguem publicou (ADR-0021).
  static const String tituloDoNaoEncontrado = 'Este local saiu do Perto';

  static const String explicacaoDoNaoEncontrado =
      'Ele pode ter sido retirado. Veja quem está atendendo na sua região '
      'agora.';

  /// **O TEXTO MUDOU EM 19/10/2026 com a secao.** Era `Ver o Perto`, e
  /// `Perto` deixou de existir: o diretorio virou a aba `Comunidade` da
  /// `Rede`. Um botao que oferece uma secao que o app nao tem e um caminho
  /// que promete e nao entrega. O NOME da constante fica, para nao espalhar
  /// a renomeacao por quem a le.
  static const String rotuloDeVoltarParaPerto = 'Ver a Rede';

  /// Sem conta nao ha leitura, e a frase diz por que **sem culpar a pessoa**.
  static const String tituloDoVisitante = 'Entre para ver este local';

  /// **A frase nao promete mais o telefone.** Ela dizia *"mostra o telefone
  /// comercial e a distância até você"*, e a primeira metade deixou de ser
  /// verdade em 19/10/2026: o numero saiu da tela por pedido do cliente. O
  /// que sobrou e o que a pagina de fato da a quem entra.
  static const String explicacaoDoVisitante =
      'A página de um profissional mostra a distância até você, e o Bichu só '
      'mostra isso para quem tem conta. Depois de entrar, você lê as '
      'avaliações e pode escrever a sua.';

  static const String rotuloDeEntrar = 'Entrar ou criar conta';

  /// O estado zero da pontuacao: **sem media e sem estrela**.
  static const String tituloSemAvaliacoes = 'Ainda sem avaliações';

  static const String explicacaoSemAvaliacoes =
      'Seja a primeira pessoa a contar como foi o atendimento aqui.';

  /// O rotulo **VISIVEL** do botao de contato: so `Ligar`.
  ///
  /// Pedido do cliente em 18/10/2026: *"os botoes de ligar para devem ser
  /// apenas 'Ligar' com o icone, nao devem trazer repetidamente o nome da
  /// clinica"*. Nesta pagina o nome e o TITULO, a poucos dp acima do botao:
  /// repeti-lo dentro dele era a terceira vez que a mesma tela dizia a mesma
  /// palavra.
  static const String rotuloDeLigar = 'Ligar';

  /// O rotulo do toque que abre o endereco no aplicativo de mapas.
  ///
  /// **A MESMA frase do encontro da Rede** (`LocalDoEncontro.rotuloDoMapa`), e
  /// nao uma segunda redacao dela: as duas acoes fazem a mesma coisa pelo mesmo
  /// caminho, e duas palavras para a mesma acao ensinam que sao acoes
  /// diferentes.
  static const String rotuloDoMapa = 'Abrir no app de mapas';

  /// Quando o aparelho nao tem aplicativo de mapas que atenda a intencao
  /// `geo:`. Nao e erro nosso e nao tem o que tentar de novo: a frase diz o que
  /// aconteceu.
  static const String falhaAoAbrirMapa =
      'Não encontramos um app de mapas neste aparelho.';

  static const String rotuloDaNota = 'Sua nota';
  static const String ajudaDaNota = 'Toque nas estrelas para dar de 1 a 5.';
  static const String notaObrigatoria = 'Escolha uma nota de 1 a 5.';
  static const String rotuloDoTexto = 'Seu comentário';
  static const String ajudaDoTexto = 'A nota já basta. O texto é opcional.';
  static const String exemploDoTexto = 'Conte como foi o atendimento.';
  static const String rotuloDeEnviar = 'Enviar avaliação';
  static const String rotuloDeSalvarEdicao = 'Salvar alteração';

  /// A publicacao e IMEDIATA, e a tela diz isso **antes** do toque.
  ///
  /// Nao ha fila de aprovacao (decisao do cliente, 18/10), e isto fala do nome
  /// de um negocio real: quem escreve tem de saber que aparece na hora e com o
  /// seu nome de exibicao.
  static const String avisoDePublicacaoImediata =
      'A sua avaliação aparece na hora, junto com o seu nome de exibição.';

  /// As duas frases do desfecho, escolhidas por `created` da RESPOSTA.
  static const String avaliacaoPublicada = 'Avaliação publicada.';
  static const String avaliacaoAtualizada = 'Avaliação atualizada.';
  static const String avaliacaoApagada = 'A sua avaliação foi apagada.';

  static const String rotuloDeEditar = 'Editar';
  static const String rotuloDeApagar = 'Apagar';
  static const String rotuloDeCancelarEdicao = 'Cancelar';
  static const String seloDaMinha = 'Sua avaliação';
  static const String marcaDeEditada = 'editada';

  static const String tituloDeApagar = 'Apagar a sua avaliação?';

  static const String corpoDeApagar =
      'Ela sai da página deste local na hora, e a média e a contagem caem '
      'junto. Você pode avaliar de novo depois.';

  static const String confirmarApagar = 'Apagar';

  /// Conta sem e-mail confirmado: a frase, e a porta.
  static const String tituloDoCanalNaoVerificado =
      'Confirme o seu e-mail para avaliar';

  static const String explicacaoDoCanalNaoVerificado =
      'É a mesma regra de marcar um encontro: a confirmação do e-mail é o que '
      'libera escrever para a comunidade. Você continua podendo ler todas as '
      'avaliações.';

  static const String rotuloDeConfirmarEmail = 'Confirmar o meu e-mail';

  /// `can_review: false` sem motivo declarado.
  ///
  /// O `enum` do contrato tem um valor so hoje e e aberto de proposito: no dia
  /// em que o bloqueio por moderacao entrar, uma versao antiga do app cai
  /// aqui. **Ela nao desenha o campo** -- oferecer o campo levaria a um 403
  /// depois do texto escrito.
  static const String bloqueioSemMotivo =
      'Não é possível avaliar este local com a sua conta agora.';

  /// Quando a lista de avaliacoes nao chega, mas a pagina chegou.
  ///
  /// **A pagina FICA.** Nome, telefone e media vieram de outra chamada e
  /// continuam certos; apagar a tela por causa da lista puniria quem so queria
  /// o telefone.
  static const String falhaDasAvaliacoes =
      'Não foi possível carregar as avaliações agora.';

  static const String falhaDeMaisAvaliacoes =
      'Não foi possível carregar mais avaliações.';

  static const String rotuloDeOrdenar = 'Ordenar as avaliações';

  /// A frase do fim da lista (paragrafo 11.20), no plural e no singular.
  static String fimDasAvaliacoes(int total) => total == 1
      ? 'Esta é a única avaliação deste local.'
      : 'Você viu todas as $total avaliações deste local.';

  /// `Ligar para a Clínica Pata Firme` — o nome **ACESSIVEL**, e nao o visivel.
  ///
  /// **O rotulo visivel encurtou em 18/10/2026; este NAO.** O nome acessivel
  /// leva PARA QUEM e a ligacao: `Ligar` sozinho e um controle indistinguivel
  /// para quem navega por leitor de tela e chegou nele sem ver a tela inteira
  /// (WCAG 2.1 SC 4.1.2). Ele chega ao botao por `nomeAcessivel`, e nao por
  /// `rotulo`.
  ///
  /// O SC 2.5.3 continua satisfeito: [rotuloDeLigar] e PREFIXO desta string,
  /// entao quem usa comando de voz diz "Ligar" e acerta o controle.
  static String ligarPara(String nome) => '$rotuloDeLigar para $nome';

  /// O rotulo da faixa do local, para quem nao ve a imagem.
  ///
  /// **A faixa NAO e decorativa, ao contrario da logo no cartao da lista.** La
  /// a logo fica ao lado do nome e o nome e o rotulo; aqui a faixa vem ANTES
  /// do nome, e e a fachada ou o ambiente -- a unica informacao desta pagina
  /// que nao esta escrita em lugar nenhum. Imagem sem rotulo seria uma parada
  /// de foco muda sobre um dado que ninguem mais conta.
  static String fotoDe(String nome) => 'Foto de $nome';

  /// A minha avaliacao existe, mas nao esta em nenhuma pagina ja carregada.
  ///
  /// **`my_review_ref` diz que ela existe; ele nao traz a nota nem o texto**, e
  /// nao ha operacao no contrato que leia a minha sozinha (`GET
  /// .../reviews/me` nao existe). Com 128 avaliacoes, a minha pode estar na
  /// pagina 7. Entao a tela **nao finge** ter o conteudo: ela diz onde ele
  /// esta e oferece as duas acoes que nao dependem dele -- carregar mais, e
  /// apagar, que o `DELETE` resolve so com a conta.
  static const String minhaForaDaPagina =
      'Você já avaliou este local. A sua avaliação aparece na lista abaixo; '
      'carregue mais avaliações para encontrá-la e editar.';

  @override
  State<PaginaDoLocal> createState() => _PaginaDoLocalState();
}

/// Os desfechos de uma carga.
///
/// **`naoEncontrado` e `semConta` sao separados de `falha`**, e os tres pedem
/// coisas diferentes: um pede a volta para o `Perto` (a pergunta chegou e a
/// resposta foi "nao existe"), um pede entrar (a pergunta nao pode nem ser
/// feita) e o terceiro pede `Atualizar` (a pergunta nao chegou). Um estado so
/// ofereceria `Atualizar` para quem vai receber o mesmo 404 de novo.
enum _Fase { carregando, pronto, naoEncontrado, semConta, falha }

class _PaginaDoLocalState extends State<PaginaDoLocal> {
  _Fase _fase = _Fase.carregando;
  String? _textoDaFalha;
  DetalheDoLocal? _detalhe;

  /// A pontuacao **de agora**, que comeca na do detalhe e e trocada pela que
  /// volta no `PUT` e pela recarga depois do `DELETE`.
  ///
  /// Ela nao fica dentro de [_detalhe] porque [DetalheDoLocal] e imutavel e a
  /// media muda sem o resto da pagina mudar: o contrato manda a pontuacao nova
  /// na resposta da escrita exatamente para a tela nao precisar de uma segunda
  /// chamada -- e para a media nao ficar velha se essa segunda chamada
  /// falhasse.
  PontuacaoDoLocal? _pontuacao;

  /// O `ref` da minha avaliacao, ou nulo. Comeca em `my_review_ref`.
  String? _refDaMinha;

  /// A minha avaliacao, quando a tela tem o objeto dela: ou porque ela veio
  /// numa pagina carregada, ou porque o `PUT` acabou de devolve-la.
  AvaliacaoDoLocal? _minha;

  /// As avaliacoes de **todas** as paginas pedidas, na ordem em que chegaram.
  final List<AvaliacaoDoLocal> _avaliacoes = <AvaliacaoDoLocal>[];

  PaginaDeAvaliacoes? _paginaDeAvaliacoes;
  OrdemDasAvaliacoes _ordem = OrdemDasAvaliacoes.recentes;
  bool _carregandoAvaliacoes = false;
  /// A falha foi **falta de conta**, e nao defeito. Ver [faltaConta].
  bool _faltaConta = false;
  String? _falhaDasAvaliacoes;
  bool _carregandoMais = false;
  String? _falhaDeMais;

  /// O campo esta aberto para escrever. Fora da edicao ele so aparece quando
  /// ainda nao ha avaliacao minha.
  bool _editando = false;
  int? _nota;
  final TextEditingController _texto = TextEditingController();
  bool _enviando = false;

  /// A recusa do envio da minha avaliacao, **inteira**.
  ///
  /// **Nao e `String`, e a diferenca nao e de tipo.** Guardar so o `.texto`
  /// descarta `acao` e `proximaAcao`, e e por eles que a faixa sabe que saida
  /// oferecer: no `409 contact-channel-unverified` a mensagem chega com
  /// `Confirmar meu e-mail` e `verify_email`, e com o estado em `String` os
  /// dois morriam aqui -- a pessoa lia que precisa confirmar o e-mail e nao
  /// tinha onde tocar. Quem resolve o destino e [saidaDaMensagem].
  MensagemDeErro? _erroDoFormulario;
  String? _erroDaNota;

  bool _cargaAgendada = false;

  bool get _logado => Escopo.of(context).sessao.logado;

  @override
  void initState() {
    super.initState();
    _agendarCarga();
  }

  @override
  void dispose() {
    _texto.dispose();
    super.dispose();
  }

  void _agendarCarga() {
    if (_cargaAgendada) return;
    _cargaAgendada = true;
    WidgetsBinding.instance.addPostFrameCallback((_) {
      _cargaAgendada = false;
      if (mounted) _carregar();
    });
  }

  Future<void> _carregar() async {
    if (!mounted) return;

    // **Sem conta a chamada nao sai.** `getDirectoryEntry` e `bearerAuth` no
    // contrato: pedir para colher 401 gastaria uma requisicao para descobrir
    // o que o contrato ja diz, e o 401 chegaria como "servidor fora".
    if (!_logado) {
      setState(() {
        _fase = _Fase.semConta;
        _detalhe = null;
        _textoDaFalha = null;
      });
      return;
    }

    final escopo = Escopo.of(context);
    setState(() {
      _fase = _Fase.carregando;
      _textoDaFalha = null;
    });

    try {
      final detalhe = await escopo.diretorio.detalhar(widget.slug);
      if (!mounted) return;
      setState(() {
        _detalhe = detalhe;
        _pontuacao = detalhe.pontuacao;
        _refDaMinha = detalhe.minhaAvaliacaoRef;
        _minha = null;
        _editando = false;
        _nota = null;
        _erroDoFormulario = null;
        _erroDaNota = null;
        _texto.clear();
        _fase = _Fase.pronto;
      });
      await _carregarAvaliacoes();
    } on FalhaDaApi catch (falha) {
      if (!mounted) return;
      if (falha.tipo == ProblemTipo.naoEncontrado) {
        setState(() {
          _detalhe = null;
          _fase = _Fase.naoEncontrado;
        });
        return;
      }
      setState(() {
        // `next_action: sign_in` do servidor. Medido:
        // `/v1/directory/entries/{slug}` responde `401 unauthenticated`.
        _faltaConta = faltaConta(falha);
        _textoDaFalha =
            textoDoTetoDoDiretorio(falha) ?? MensagensDeErro.de(falha).texto;
        _detalhe = null;
        _fase = _Fase.falha;
      });
    } on FalhaDeChamada catch (falha) {
      if (!mounted) return;
      setState(() {
        _faltaConta = faltaConta(falha);
        _textoDaFalha = MensagensDeErro.de(falha).texto;
        _detalhe = null;
        _fase = _Fase.falha;
      });
    } on FormatException catch (erro) {
      if (!mounted) return;
      setState(() {
        _textoDaFalha = MensagensDeErro.servidorFora;
        _detalhe = null;
        _fase = _Fase.falha;
      });
      debugPrint('Resposta da pagina do local fora do contrato: $erro');
    }
  }

  /// A **primeira** pagina de avaliacoes da ordem atual, sempre.
  ///
  /// A falha aqui nao derruba a pagina: ver
  /// [PaginaDoLocal.falhaDasAvaliacoes].
  Future<void> _carregarAvaliacoes() async {
    if (!mounted) return;
    final escopo = Escopo.of(context);
    setState(() {
      _carregandoAvaliacoes = true;
      _falhaDasAvaliacoes = null;
      _falhaDeMais = null;
      _carregandoMais = false;
      _avaliacoes.clear();
    });

    try {
      final pagina = await escopo.diretorio.avaliacoes(
        widget.slug,
        ordem: _ordem,
      );
      if (!mounted) return;
      setState(() {
        _paginaDeAvaliacoes = pagina;
        _avaliacoes
          ..clear()
          ..addAll(pagina.itens);
        _carregandoAvaliacoes = false;
        _acharAMinha();
      });
    } on FalhaDeChamada catch (falha) {
      if (!mounted) return;
      setState(() {
        _carregandoAvaliacoes = false;
        _paginaDeAvaliacoes = null;
        _falhaDasAvaliacoes = textoDoTetoDoDiretorio(falha) ??
            PaginaDoLocal.falhaDasAvaliacoes;
      });
    } on FormatException catch (erro) {
      if (!mounted) return;
      setState(() {
        _carregandoAvaliacoes = false;
        _paginaDeAvaliacoes = null;
        _falhaDasAvaliacoes = PaginaDoLocal.falhaDasAvaliacoes;
      });
      debugPrint('Resposta das avaliacoes fora do contrato: $erro');
    }
  }

  /// Pede a pagina seguinte e **acrescenta** o que vier.
  ///
  /// A falha aqui nao apaga as avaliacoes na tela, ao contrario da falha da
  /// pagina 1: aqui a ordem e a mesma, e o que esta na tela continua sendo a
  /// resposta certa para ela.
  Future<void> _carregarMais() async {
    if (!mounted || _carregandoMais) return;
    final atual = _paginaDeAvaliacoes;
    if (atual == null) return;

    final escopo = Escopo.of(context);
    setState(() {
      _carregandoMais = true;
      _falhaDeMais = null;
    });

    try {
      final pagina = await escopo.diretorio.avaliacoes(
        widget.slug,
        ordem: _ordem,
        pagina: atual.pagina + 1,
      );
      if (!mounted) return;
      setState(() {
        _paginaDeAvaliacoes = pagina;
        _avaliacoes.addAll(pagina.itens);
        _carregandoMais = false;
        _acharAMinha();
      });
    } on FalhaDeChamada catch (falha) {
      if (!mounted) return;
      setState(() {
        _carregandoMais = false;
        _falhaDeMais = textoDoTetoDoDiretorio(falha) ??
            PaginaDoLocal.falhaDeMaisAvaliacoes;
      });
    } on FormatException catch (erro) {
      if (!mounted) return;
      setState(() {
        _carregandoMais = false;
        _falhaDeMais = PaginaDoLocal.falhaDeMaisAvaliacoes;
      });
      debugPrint('Resposta das avaliacoes fora do contrato: $erro');
    }
  }

  /// Tira a minha do fluxo da lista.
  ///
  /// **O servidor manda a minha na mesma lista, marcada com `mine: true`**, e
  /// nao num bloco separado -- isso evita a resposta em que a mesma avaliacao
  /// chega duas vezes. Quem a separa e esta linha.
  void _acharAMinha() {
    for (final a in _avaliacoes) {
      if (a.minha || (a.ref == _refDaMinha && _refDaMinha != null)) {
        _minha = a;
        _refDaMinha = a.ref;
        return;
      }
    }
  }

  /// As avaliacoes das OUTRAS pessoas: a lista carregada menos a minha.
  List<AvaliacaoDoLocal> get _dasOutras => <AvaliacaoDoLocal>[
        for (final a in _avaliacoes)
          if (!a.minha && a.ref != _refDaMinha) a,
      ];

  void _trocarOrdem(OrdemDasAvaliacoes nova) {
    if (nova == _ordem) return;
    setState(() => _ordem = nova);
    _carregarAvaliacoes();
  }

  void _voltar() {
    if (context.canPop()) {
      context.pop();
    } else {
      // `Rotas.rede` e nao `Rotas.perto`: a secao `Perto` deixou de
      // existir em 19/10 e esta pagina virou filha do ramo da `Rede`.
      context.go(Rotas.rede);
    }
  }

  Future<void> _ligar(String telefoneE164) async {
    // `tel:` vai para o discador do sistema, que **mostra o numero e espera a
    // pessoa confirmar**: o app nao disca sozinho. Mesmo caminho do cartao da
    // listagem.
    await launchUrl(Uri(scheme: 'tel', path: telefoneE164));
  }

  /// Abre o endereco comercial no aplicativo de mapas do aparelho.
  ///
  /// **`SaidaDoApp.abrirEnderecoNoAppDeMapas`, e nao um caminho novo.** E a
  /// MESMA porta que o encontro da Rede usa (`local_do_encontro.dart`):
  /// intencao `geo:0,0?q=<texto>`, uma implementacao, um lugar. Escrever um
  /// segundo jeito de abrir mapa aqui seria duplicar o que ja existe.
  ///
  /// O texto vem de `textoParaBuscaNoMapa`, que **nao e a linha exibida**: o
  /// complemento sai e o bairro, a cidade e a UF entram. Nulo nao chega aqui --
  /// quem desenha o toque e quem ja decidiu que ha endereco.
  Future<void> _abrirNoMapa(String endereco) async {
    final abriu =
        await SaidaDoApp.atual.abrirEnderecoNoAppDeMapas(endereco: endereco);
    if (!abriu && mounted) {
      ScaffoldMessenger.maybeOf(context)?.showSnackBar(
        const SnackBar(content: Text(PaginaDoLocal.falhaAoAbrirMapa)),
      );
    }
  }

  // -------------------------------------------------------------------------
  // A minha avaliacao
  // -------------------------------------------------------------------------

  void _abrirEdicao() {
    final minha = _minha;
    setState(() {
      _editando = true;
      _nota = minha?.nota;
      _texto.text = minha?.texto ?? '';
      _erroDoFormulario = null;
      _erroDaNota = null;
    });
  }

  void _fecharEdicao() {
    setState(() {
      _editando = false;
      _nota = null;
      _texto.clear();
      _erroDoFormulario = null;
      _erroDaNota = null;
    });
  }

  Future<void> _enviar() async {
    final nota = _nota;
    // **A nota e obrigatoria e o texto nao.** Enviar sem nota seria enviar uma
    // avaliacao sem avaliacao: a nota E a avaliacao, e o contrato a declara
    // `required` com `CHECK` no banco atras.
    if (nota == null) {
      setState(() => _erroDaNota = PaginaDoLocal.notaObrigatoria);
      return;
    }

    final escopo = Escopo.of(context);
    setState(() {
      _enviando = true;
      _erroDoFormulario = null;
      _erroDaNota = null;
    });

    try {
      final gravada = await escopo.diretorio.gravarMinhaAvaliacao(
        widget.slug,
        nota: nota,
        texto: _texto.text,
      );
      if (!mounted) return;
      setState(() {
        _enviando = false;
        _editando = false;
        _minha = gravada.avaliacao;
        _refDaMinha = gravada.avaliacao.ref;
        // **A media e a contagem sao as da RESPOSTA, sem segunda chamada.** O
        // contrato manda `rating` ja com esta avaliacao dentro justamente para
        // isto, e uma segunda chamada deixaria a media velha na tela se ela
        // falhasse.
        _pontuacao = gravada.pontuacao;
        // A minha sai do fluxo das outras na hora, inclusive quando ela ja
        // estava na lista carregada (edicao).
        for (var i = 0; i < _avaliacoes.length; i++) {
          if (_avaliacoes[i].ref == gravada.avaliacao.ref) {
            _avaliacoes[i] = gravada.avaliacao;
          }
        }
        _texto.clear();
        _nota = null;
      });
      // **A frase sai de `created`, nao do estado que a tela tinha.** Esse
      // estado pode estar velho: outra sessao da mesma conta pode ter escrito.
      anunciar(
        context,
        gravada.criada
            ? PaginaDoLocal.avaliacaoPublicada
            : PaginaDoLocal.avaliacaoAtualizada,
      );
    } on FalhaDaApi catch (falha) {
      if (!mounted) return;
      setState(() {
        _enviando = false;
        // O nome do campo recusado vem do `Problem`, e e o que diz a quem
        // escreveu 1600 caracteres qual dos dois campos o servidor negou.
        //
        // **AS DUAS METADES DO MESMO CONSERTO, e elas vieram de PRs
        // diferentes que mexeram nesta mesma linha.**
        //
        // `acaoEmCurso` (do #49) e o que faz o `409
        // contact-channel-unverified` desta rota falar de AVALIACAO. Sem ele
        // esta faixa dizia a quem avaliou um veterinario que *"os tutores por
        // perto vao receber a foto"*: o `type` e o mesmo de abrir caso de pet
        // perdido, de proposito, e era a frase de la que chegava aqui.
        //
        // A ausencia de `.texto` (do #51) e o que faz a mensagem ir INTEIRA
        // para o estado. Com `.texto`, o rotulo e o `next_action` -- a saida
        // `Confirmar meu e-mail` -- eram jogados fora antes de a faixa
        // existir, e a pessoa lia o motivo sem ter onde tocar.
        //
        // Pegar um lado so reintroduz um dos dois defeitos, e **as duas formas
        // COMPILAM**: nenhum teste de tipo acusaria a escolha errada. Esta
        // linha foi conferida a mao depois da uniao, nos dois `catch`.
        _erroDoFormulario = MensagensDeErro.de(
          falha,
          acaoEmCurso: AcaoEmCurso.avaliarLocal,
        );
      });
    } on FalhaDeChamada catch (falha) {
      if (!mounted) return;
      setState(() {
        _enviando = false;
        // O irmao da linha acima, e com as duas metades pelo mesmo motivo:
        // `acaoEmCurso` do #49, sem `.texto` do #51.
        _erroDoFormulario = MensagensDeErro.de(
          falha,
          acaoEmCurso: AcaoEmCurso.avaliarLocal,
        );
      });
    } on FormatException catch (erro) {
      if (!mounted) return;
      setState(() {
        _enviando = false;
        // **Sem `acao`, e de proposito**: nao ha endereco que resolva
        // resposta fora do contrato, e `Tentar de novo` aqui ofereceria um
        // reenvio que vai falhar igual. A faixa sai so com a frase, como
        // saia antes.
        _erroDoFormulario = const MensagemDeErro(
          texto: MensagensDeErro.servidorFora,
        );
      });
      debugPrint('Resposta da escrita da avaliacao fora do contrato: $erro');
    }
  }

  Future<void> _apagar() async {
    final escopo = Escopo.of(context);
    final apagou = await mostrarFolhaDestrutiva(
      context,
      titulo: PaginaDoLocal.tituloDeApagar,
      corpo: PaginaDoLocal.corpoDeApagar,
      oQueSome: const <String>[
        'A sua nota, que sai da média e da contagem deste local.',
        'O seu comentário, se você escreveu um.',
      ],
      rotuloDeConfirmar: PaginaDoLocal.confirmarApagar,
      rotuloAcessivelDeConfirmar: 'Apagar a minha avaliação deste local',
      aoConfirmar: () => escopo.diretorio.apagarMinhaAvaliacao(widget.slug),
    );
    if (!mounted || !apagou) return;
    anunciar(context, PaginaDoLocal.avaliacaoApagada);
    // **Recarrega, e nao desconta um da media na mao.** A media e calculada na
    // consulta e o `DELETE` responde 204 sem corpo: subtrair aqui seria a tela
    // reimplementando uma agregacao que ela nao tem como acertar.
    await _carregar();
  }

  // -------------------------------------------------------------------------
  // A denuncia de uma avaliacao
  // -------------------------------------------------------------------------

  Future<void> _denunciar(AvaliacaoDoLocal avaliacao) async {
    final escopo = Escopo.of(context);
    final enviou = await showModalBottomSheet<bool>(
      context: context,
      showDragHandle: true,
      useSafeArea: true,
      isScrollControlled: true,
      builder: (contexto) => _FolhaDeDenuncia(
        nomeDeQuemEscreveu: avaliacao.nomeDeQuemLe,
        aoEnviar: (motivo, detalhe) => escopo.diretorio.denunciarAvaliacao(
          widget.slug,
          avaliacao.ref,
          motivo: motivo,
          detalhe: detalhe,
        ),
      ),
    );
    if (!mounted || enviou != true) return;
    anunciar(context, _FolhaDeDenuncia.recebida);
  }

  Future<void> _entrar() async {
    await context.push<void>(Rotas.entrar);
    if (!mounted) return;
    // Quem voltou com conta ve a pagina; quem voltou sem conta ve o convite de
    // novo. Quem decide e `_logado`, e nao o desfecho da rota.
    await _carregar();
  }

  @override
  Widget build(BuildContext context) {
    final detalhe = _detalhe;
    final titulo = detalhe?.nome;

    return Scaffold(
      appBar: AppBar(
        toolbarHeight: BichuAlvoDeToque.critico,
        leadingWidth: BichuAlvoDeToque.critico,
        leading: _BotaoVoltar(aoTocar: _voltar),
        // **A barra tem `Voltar` e o nome, e nada mais.** O slot de acao fica
        // vazio de proposito: a ordenacao das avaliacoes e um controle do
        // conteudo e mora no corpo, no topo da secao a que pertence.
        title: Text(
          titulo ?? PaginaDoLocal.tituloDaTela,
          maxLines: 1,
          overflow: TextOverflow.ellipsis,
        ),
      ),
      body: SafeArea(
        child: Semantics(
          scopesRoute: true,
          namesRoute: true,
          explicitChildNodes: true,
          label: titulo == null
              ? PaginaDoLocal.tituloDaTela
              : '${PaginaDoLocal.tituloDaTela}: $titulo',
          child: ListView(
            padding: const EdgeInsets.symmetric(vertical: BichuEspaco.e4),
            children: _corpo(detalhe),
          ),
        ),
      ),
    );
  }

  List<Widget> _corpo(DetalheDoLocal? detalhe) {
    if (_fase == _Fase.carregando) {
      return const <Widget>[_Margem(child: _EsqueletoDoLocal())];
    }

    if (_fase == _Fase.semConta) {
      return <Widget>[
        _Margem(
          child: EstadoVazio(
            titulo: PaginaDoLocal.tituloDoVisitante,
            explicacao: PaginaDoLocal.explicacaoDoVisitante,
            acao: SizedBox(
              width: double.infinity,
              child: BotaoPrimario(
                rotulo: PaginaDoLocal.rotuloDeEntrar,
                aoTocar: _entrar,
              ),
            ),
          ),
        ),
      ];
    }

    if (_fase == _Fase.naoEncontrado) {
      return <Widget>[
        _Margem(
          child: EstadoVazio(
            titulo: PaginaDoLocal.tituloDoNaoEncontrado,
            explicacao: PaginaDoLocal.explicacaoDoNaoEncontrado,
            acao: SizedBox(
              width: double.infinity,
              height: BichuAlvoDeToque.min,
              child: OutlinedButton(
                onPressed: () => context.go(Rotas.rede),
                child: const Text(PaginaDoLocal.rotuloDeVoltarParaPerto),
              ),
            ),
          ),
        ),
      ];
    }

    if (_fase == _Fase.falha || detalhe == null) {
      // SEM CONTA NAO E ERRO. Ver `widgets/convite_para_entrar.dart`.
      if (_faltaConta) {
        return const <Widget>[
          _Margem(child: ConviteParaEntrar(secao: SecaoComConta.paginaDoLocal)),
        ];
      }
      return <Widget>[
        _Margem(
          child: FaixaDeAviso(
            texto: _textoDaFalha ?? MensagensDeErro.servidorFora,
            rotuloDaAcao: PaginaDoLocal.rotuloDeAtualizar,
            aoTocarNaAcao: _carregar,
          ),
        ),
      ];
    }

    final pontuacao = _pontuacao ?? detalhe.pontuacao;

    return <Widget>[
      // A FOTO DO LUGAR, de borda a borda, acima de tudo (cliente,
      // 18/10/2026: "pode liberar as imagens do profissional no app").
      //
      // **Fora de `_Margem`, e e o unico filho desta pagina que fica fora
      // dela.** A derivada e `banner` 1280 x 720 e o servidor a mediu para
      // exatamente esta pintura: 360 a 430 dp de borda a borda, 1080 a
      // 1290 px a 3x.
      // Enfiada na margem de 16 dp de cada lado ela pagaria o mesmo peso para
      // pintar menos.
      //
      // **Local sem foto nao tem faixa vazia**: `fotoUrl` e nulo em tres casos
      // normais (sem foto, ainda processando, recusada nos bytes) e a pagina
      // abre no nome, exatamente como antes de a foto existir.
      //
      // **Sem foto a pagina continua abrindo no nome, e NAO numa faixa 16:9
      // vazia.** Quem desenha o tipo nesse caso e o quadrado do
      // [_Cabecalho] -- ver a prosa dele. Um retangulo cinza de borda a borda
      // e da altura de uma faixa empurraria `Informações` e a media para
      // baixo da dobra em toda entrada sem foto, que e a maioria delas; foi
      // medido aqui, com `Atende cão e gato.` saindo da arvore do `ListView`
      // ao tentar.
      if (detalhe.fotoUrl case final String foto) ...<Widget>[
        _FaixaDoLocal(url: foto, nome: detalhe.nome),
        const SizedBox(height: BichuEspaco.e4),
      ],
      _Margem(child: _Cabecalho(detalhe: detalhe, aoLigar: _ligar)),
      const _Divisor(),
      _Secao(
        icone: Icons.notes_outlined,
        titulo: PaginaDoLocal.tituloDasInformacoes,
        child: _Informacoes(detalhe: detalhe, aoAbrirNoMapa: _abrirNoMapa),
      ),
      const _Divisor(),
      _Secao(
        icone: Icons.star_outline,
        titulo: PaginaDoLocal.tituloDasAvaliacoes,
        child: _BlocoDaPontuacao(pontuacao: pontuacao),
      ),
      const SizedBox(height: BichuEspaco.e6),
      _Secao(
        icone: Icons.rate_review_outlined,
        titulo: PaginaDoLocal.tituloDaMinha,
        child: _blocoDaMinha(detalhe),
      ),
      const _Divisor(),
      _Secao(
        icone: Icons.forum_outlined,
        titulo: PaginaDoLocal.tituloDasOutras,
        child: _blocoDasOutras(),
      ),
      const SizedBox(height: BichuEspaco.e8),
    ];
  }

  /// O bloco `A minha avaliação`, nos quatro estados do protótipo.
  Widget _blocoDaMinha(DetalheDoLocal detalhe) {
    // (d) ja avaliei, e a tela tem o objeto: a minha com `Editar` e `Apagar`.
    if (_minha case final AvaliacaoDoLocal minha when !_editando) {
      return Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: <Widget>[
          _CartaoDeAvaliacao(
            avaliacao: minha,
            minha: true,
            aoEditar: _abrirEdicao,
            aoApagar: _apagar,
          ),
          const SizedBox(height: BichuEspaco.e2),
          _Nota(texto: PaginaDoLocal.avisoDePublicacaoImediata),
        ],
      );
    }

    // Ja avaliei, mas a minha nao esta em nenhuma pagina carregada. A tela nao
    // finge ter o conteudo: ver `PaginaDoLocal.minhaForaDaPagina`.
    if (_refDaMinha != null && !_editando) {
      return Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: <Widget>[
          _Caixa(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: <Widget>[
                const _Corpo(texto: PaginaDoLocal.minhaForaDaPagina),
                const SizedBox(height: BichuEspaco.e3),
                Align(
                  alignment: Alignment.centerLeft,
                  child: TextButton(
                    onPressed: _apagar,
                    child: const Text(PaginaDoLocal.rotuloDeApagar),
                  ),
                ),
              ],
            ),
          ),
        ],
      );
    }

    // (c) pode avaliar, ou esta editando a que ja escreveu.
    if (_editando || detalhe.podeAvaliar) {
      return _Formulario(
        nota: _nota,
        erroDaNota: _erroDaNota,
        texto: _texto,
        enviando: _enviando,
        erro: _erroDoFormulario,
        editando: _editando,
        aoEscolherNota: (nota) => setState(() {
          _nota = nota;
          _erroDaNota = null;
        }),
        aoEnviar: _enviar,
        aoCancelar: _editando ? _fecharEdicao : null,
      );
    }

    // (b) conta com e-mail nao confirmado. **O campo nao e desenhado.**
    if (detalhe.motivoDeNaoPoderAvaliar ==
        MotivoDeNaoPoderAvaliar.canalNaoVerificado) {
      return _Caixa(
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: <Widget>[
            _Titulo(texto: PaginaDoLocal.tituloDoCanalNaoVerificado),
            const SizedBox(height: BichuEspaco.e2),
            const _Corpo(texto: PaginaDoLocal.explicacaoDoCanalNaoVerificado),
            const SizedBox(height: BichuEspaco.e4),
            SizedBox(
              width: double.infinity,
              height: BichuAlvoDeToque.min,
              child: OutlinedButton(
                onPressed: () => context.push(Rotas.verifiqueSeuEmail),
                child: const Text(PaginaDoLocal.rotuloDeConfirmarEmail),
              ),
            ),
          ],
        ),
      );
    }

    // `can_review: false` com motivo que esta versao do app nao conhece.
    return const _Caixa(child: _Corpo(texto: PaginaDoLocal.bloqueioSemMotivo));
  }

  Widget _blocoDasOutras() {
    if (_carregandoAvaliacoes) {
      return const _EsqueletoDeAvaliacoes();
    }

    final falha = _falhaDasAvaliacoes;
    if (falha != null) {
      return FaixaDeAviso(
        texto: falha,
        rotuloDaAcao: PaginaDoLocal.rotuloDeAtualizar,
        aoTocarNaAcao: _carregarAvaliacoes,
      );
    }

    final pagina = _paginaDeAvaliacoes;
    if (pagina == null) {
      return FaixaDeAviso(
        texto: PaginaDoLocal.falhaDasAvaliacoes,
        rotuloDaAcao: PaginaDoLocal.rotuloDeAtualizar,
        aoTocarNaAcao: _carregarAvaliacoes,
      );
    }

    final outras = _dasOutras;

    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: <Widget>[
        // **A ordenacao no CORPO, no topo do conteudo.** Ver o cabecalho da
        // classe: a reversao de 17/10 vale para as listagens de aba, que tem o
        // slot da casca; esta tela e empilhada e nao tem aquele slot.
        //
        // So aparece quando ha mais de uma avaliacao: reordenar uma lista de
        // um item e um controle que nao faz nada.
        if (pagina.total > 1) ...<Widget>[
          _ChipsDeOrdem(ordem: _ordem, aoTrocar: _trocarOrdem),
          const SizedBox(height: BichuEspaco.e4),
        ],
        if (outras.isEmpty)
          _Corpo(
            texto: _refDaMinha == null
                ? PaginaDoLocal.explicacaoSemAvaliacoes
                : 'Por enquanto a sua é a única avaliação deste local.',
          )
        else
          for (var i = 0; i < outras.length; i++) ...<Widget>[
            if (i > 0) const SizedBox(height: BichuEspaco.e3),
            _CartaoDeAvaliacao(
              avaliacao: outras[i],
              minha: false,
              aoDenunciar: () => _denunciar(outras[i]),
            ),
          ],
        if (_avaliacoes.isNotEmpty) ...<Widget>[
          const SizedBox(height: espacoAcimaDoRodape),
          RodapeDaPaginacao(
            // `carregados` conta TUDO o que veio, inclusive a minha: ela
            // tambem e uma avaliacao do local e tambem conta no `total`. Tirar
            // a minha daqui faria o rodape pedir eternamente uma pagina que
            // nao existe.
            carregados: _avaliacoes.length,
            total: pagina.total,
            carregando: _carregandoMais,
            textoDaFalha: _falhaDeMais,
            fimDaLista: PaginaDoLocal.fimDasAvaliacoes,
            aoPedirMais: _carregarMais,
          ),
        ],
      ],
    );
  }
}

// ---------------------------------------------------------------------------
// O cabecalho
// ---------------------------------------------------------------------------

/// A faixa 16:9 com a foto do lugar, de borda a borda.
///
/// ## O custo, medido e nao estimado
///
/// `cacheWidth` pede ao decodificador a largura que a tela PINTA. Num aparelho
/// de 412 dp a 3x isso da 1236 px, e a imagem decodificada custa
/// `1236 x 695 x 4` = **3,28 MiB**; sem `cacheWidth` ela custaria os 1280 x
/// 720 do arquivo, 3,52 MiB, em qualquer aparelho. A 2x o mesmo codigo cobra
/// 1,11 MiB, e e esse o ponto: o numero acompanha a tela.
///
/// **Uma por pagina, e e por isso que ela cabe.** Vinte destas numa listagem
/// seriam 65,6 MiB de imagem decodificada (20 x 3,28 MiB), e e exatamente a
/// conta que mantem a faixa fora do cartao do `Perto`.
class _FaixaDoLocal extends StatelessWidget {
  const _FaixaDoLocal({required this.url, required this.nome});

  final String url;
  final String nome;

  /// 16:9, a proporcao da derivada `banner` do contrato. Recortar numa
  /// proporcao diferente da que o servidor cortou deixaria tarja.
  static const double proporcao = 16 / 9;

  @override
  Widget build(BuildContext context) => ImagemDaRede(
        url: url,
        descricao: PaginaDoLocal.fotoDe(nome),
        proporcao: proporcao,
        // Sem raio: de borda a borda, raio arredondaria contra a borda da
        // tela e deixaria quatro cantos de fundo aparecendo.
        raio: BichuRaio.none,
        simboloDeFalha: Icons.storefront_outlined,
      );
}

/// Nome, atividade, lugar, distancia, **o que foi verificado** e `Ligar`.
///
/// ## O quadrado do TIPO, ao lado do nome
///
/// Pedido do cliente em 18/10/2026: *"tem que colocar o icone de clinica,
/// estabelecimento, profissional, caso a foto/logo da empresa nao tenha sido
/// cadastrada"*. Ele entra AQUI, e nao no lugar da faixa, por duas razoes:
///
/// 1. **medida**: um `IconeDoInscrito` em 16:9 de borda a borda no topo
///    empurrava `Informações` e a media para fora da arvore do `ListView` numa
///    pagina sem foto -- o caso `local SEM foto nao tem faixa vazia` deixou de
///    achar `Atende cão e gato.` na primeira tentativa desta entrega. A pagina
///    sem foto tem de abrir no nome, e esse era o motivo original de nao haver
///    faixa vazia;
/// 2. **o mesmo desenho da lista**: no cartao do `Perto` o glifo fica num
///    quadrado de `larguraFotoSm` ao lado do nome, e e o mesmo quadrado aqui.
///    Duas geometrias para o mesmo conceito divergem na primeira edicao.
///
/// **So quando nao ha faixa.** Com `photo_url`, a foto do lugar ja esta
/// desenhada acima e o tipo esta escrito em palavras na linha da atividade:
/// um terceiro lugar dizendo a mesma coisa seria ruido.
class _Cabecalho extends StatelessWidget {
  const _Cabecalho({required this.detalhe, required this.aoLigar});

  final DetalheDoLocal detalhe;
  final Future<void> Function(String telefoneE164) aoLigar;

  @override
  Widget build(BuildContext context) {
    final cores = BichuColors.of(context).cores;
    final textos = Theme.of(context).textTheme;

    final atividade = detalhe.atividade?.rotulo;
    final lugar = detalhe.linhaDeLugar;
    // A MESMA formatacao do cartao da listagem, e de proposito: o servidor
    // arredonda a 100 m (ADR-0006) e `2,73 km` inventaria dois digitos.
    final distancia =
        CartaoDoDiretorio.distanciaEmTexto(detalhe.distanciaEmMetros);
    final verificacao = detalhe.verificacao.oQueFoiVerificado;
    final telefone = detalhe.telefoneE164;

    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: <Widget>[
        MergeSemantics(
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: <Widget>[
              if (detalhe.fotoUrl == null)
                Row(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: <Widget>[
                    IconeDoInscrito(
                      atividade: detalhe.atividade,
                      tipoDeEntidade: detalhe.tipoDeEntidade,
                      largura: BichuMoldura.larguraFotoSm,
                      raio: BichuRaio.sm,
                    ),
                    const SizedBox(width: BichuEspaco.e3),
                    Expanded(
                      child: Semantics(
                        header: true,
                        child:
                            Text(detalhe.nome, style: textos.headlineSmall),
                      ),
                    ),
                  ],
                )
              else
                Semantics(
                  header: true,
                  child: Text(detalhe.nome, style: textos.headlineSmall),
                ),
              if (atividade != null) ...<Widget>[
                const SizedBox(height: BichuEspaco.e2),
                Text(
                  atividade,
                  style:
                      textos.labelLarge?.copyWith(color: cores.textSecondary),
                ),
              ],
              if (lugar != null) ...<Widget>[
                const SizedBox(height: BichuEspaco.e3),
                _LinhaComIcone(icone: Icons.place_outlined, texto: lugar),
              ],
              // Distancia nula **nao escreve linha nenhuma**: nem "distância
              // indisponível", nem traco. Ela e nula com frequencia aqui, e
              // quem chegou por link direto nao perdeu nada que soubesse que
              // existia.
              if (distancia != null) ...<Widget>[
                const SizedBox(height: BichuEspaco.e2),
                _LinhaComIcone(
                  icone: Icons.schedule_outlined,
                  texto: distancia,
                ),
              ],
            ],
          ),
        ),
        // **O QUE foi verificado, nunca "Verificado".** `oQueFoiVerificado`
        // devolve nulo em `level: none` -- que e estado legitimo e publicavel
        // (ADR-0011) -- e tambem quando a resposta afirma ter verificado sem
        // listar a prova. Nos dois casos a tela fica calada em vez de inventar
        // a palavra.
        if (verificacao != null) ...<Widget>[
          const SizedBox(height: BichuEspaco.e4),
          _Selo(texto: verificacao),
        ],
        // **A unica acao de contato e ligar, e so com telefone.** Sem
        // `phone_e164` nao ha botao desabilitado: nao ha botao.
        if (telefone != null) ...<Widget>[
          const SizedBox(height: BichuEspaco.e5),
          SizedBox(
            width: double.infinity,
            child: BotaoPrimario(
              // VISIVEL `Ligar`, com o telefone; ANUNCIADO `Ligar para <nome>`.
              // Ver `rotuloDeLigar` e `ligarPara`.
              rotulo: PaginaDoLocal.rotuloDeLigar,
              nomeAcessivel: PaginaDoLocal.ligarPara(detalhe.nome),
              icone: Icons.call_outlined,
              aoTocar: () => aoLigar(telefone),
            ),
          ),
        ],
      ],
    );
  }
}

/// `Informações`: o `about` e o lugar. **O telefone NAO.**
///
/// ## O numero saiu daqui, e era o unico lugar que o pintava
///
/// Ate 19/10/2026 esta secao desenhava `Telefone comercial: +5511987654321`
/// -- o `phone_e164` do contrato, por extenso, em texto. O cliente pediu
/// *"sem aparecer o telefone quando for profissionais/clinicas"*, e esta
/// linha era o pedido inteiro: medido, nao havia outro lugar do app que
/// escrevesse o numero na tela.
///
/// **O botao `Ligar` do cabecalho FICA.** Ele nao mostra numero nenhum: o
/// rotulo visivel e `Ligar` e o nome acessivel e `Ligar para <nome>`. O
/// numero so aparece depois, no discador do sistema, que e tela do aparelho
/// e nao desta pagina -- e e o discador que mostra o numero e espera a
/// confirmacao, que e a razao de o app nunca discar sozinho.
///
/// ## O ENDERECO COMERCIAL entrou em 21/10/2026
///
/// Decisao do cliente, nestas palavras: *"o endereco completo do
/// profissional"*, para a pessoa tocar nele e abrir o aplicativo de mapas. A
/// prosa anterior dizia que o protótipo "marca onde caberia o endereco e diz na
/// mesma linha que nada disso existe hoje"; o endereco existe, e os outros
/// continuam valendo a frase.
///
/// **TRES CASOS, os mesmos tres do `local_do_encontro.dart` da Rede**, porque
/// sao as tres formas que o dado chega:
///
/// 1. **com endereco de rua** -- a linha do endereco e TOCAVEL e abre o mapa,
///    e a linha de lugar continua embaixo dela;
/// 2. **sem endereco de rua, com bairro/cidade/UF** -- so a linha de lugar, sem
///    toque. E o caso do autonomo, e e a maioria;
/// 3. **sem nada** -- nenhuma linha. **Endereco ausente nao vira toque que abre
///    o mapa no nada**, e e por isso que a condicao e `temEnderecoDeRua` e nao
///    "algum dos quatro campos veio".
///
/// **E so isso que existe.** E-mail, WhatsApp, redes e horario continuam sem
/// coluna, e nenhum deles e desenhado aqui: espaco reservado ensinaria quem le
/// que o dado vem.
class _Informacoes extends StatelessWidget {
  const _Informacoes({required this.detalhe, required this.aoAbrirNoMapa});

  final DetalheDoLocal detalhe;

  /// Recebe o TEXTO da busca, ja montado, e repassa a
  /// `SaidaDoApp.abrirEnderecoNoAppDeMapas` -- a mesma porta do encontro.
  final Future<void> Function(String endereco) aoAbrirNoMapa;

  static const String semSobre =
      'Este local ainda não escreveu uma apresentação.';

  @override
  Widget build(BuildContext context) {
    final sobre = detalhe.sobre;
    final lugar = detalhe.linhaDeLugar;
    final endereco = detalhe.endereco.porExtenso;
    final busca = detalhe.endereco.textoParaBuscaNoMapa(
      bairro: detalhe.bairro,
      cidade: detalhe.cidade,
      estado: detalhe.estado,
    );

    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: <Widget>[
        // O texto INTEIRO, com as quebras de linha que o painel gravou: nao ha
        // `Ler mais` nesta tela, pela mesma razao do detalhe do produto -- a
        // pagina e de um local so e nao ha o que empurrar para baixo.
        if (sobre != null && sobre.isNotEmpty)
          _Corpo(texto: sobre)
        else
          const _Corpo(texto: semSobre),
        // CASO 1: ha endereco de rua. A linha e o controle, e o rotulo
        // ANUNCIADO diz a acao antes do endereco -- `Abrir no app de mapas:
        // Rua Teodoro Sampaio, 1020` --, porque um leitor de tela que anuncia
        // o endereco primeiro faz a pessoa ouvir a linha inteira para descobrir
        // que ela e tocavel. Mesma forma do botao do encontro.
        //
        // As duas condicoes sao a MESMA (`temEnderecoDeRua`), e as duas estao
        // escritas porque o tipo nao as liga: sem a segunda, o `!` abaixo seria
        // uma aposta.
        if (endereco != null && busca != null) ...<Widget>[
          const SizedBox(height: BichuEspaco.e4),
          Semantics(
            button: true,
            label: '${PaginaDoLocal.rotuloDoMapa}: $endereco',
            onTap: () => aoAbrirNoMapa(busca),
            excludeSemantics: true,
            child: InkWell(
              onTap: () => aoAbrirNoMapa(busca),
              child: ConstrainedBox(
                constraints: const BoxConstraints(
                  minHeight: BichuAlvoDeToque.critico,
                ),
                child: _LinhaComIcone(
                  icone: Icons.map_outlined,
                  texto: endereco,
                ),
              ),
            ),
          ),
        ],
        // CASO 2: a linha de lugar, com ou sem endereco acima dela. CASO 3 e a
        // ausencia das duas, e ele nao precisa de codigo: nao ha `else`.
        if (lugar != null) ...<Widget>[
          const SizedBox(height: BichuEspaco.e4),
          _LinhaComIcone(icone: Icons.place_outlined, texto: lugar),
        ],
      ],
    );
  }
}

// ---------------------------------------------------------------------------
// A pontuacao
// ---------------------------------------------------------------------------

/// A media, a contagem e o histograma — **ou o estado zero**.
///
/// O estado zero **nao tem media e nao tem estrela**: `average` e nulo quando
/// `count` e zero, e desenhar `0,0` diria "pessimo" sobre um local que ninguem
/// avaliou.
class _BlocoDaPontuacao extends StatelessWidget {
  const _BlocoDaPontuacao({required this.pontuacao});

  final PontuacaoDoLocal pontuacao;

  @override
  Widget build(BuildContext context) {
    final cores = BichuColors.of(context).cores;
    final textos = Theme.of(context).textTheme;
    final media = pontuacao.mediaEmTexto;

    if (!pontuacao.temAvaliacoes || media == null) {
      return _Caixa(
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: const <Widget>[
            _Titulo(texto: PaginaDoLocal.tituloSemAvaliacoes),
            SizedBox(height: BichuEspaco.e2),
            _Corpo(texto: PaginaDoLocal.explicacaoSemAvaliacoes),
          ],
        ),
      );
    }

    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: <Widget>[
        Row(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: <Widget>[
            MergeSemantics(
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: <Widget>[
                  Text(media, style: textos.displaySmall),
                  const SizedBox(height: BichuEspaco.e1),
                  _Estrelas(
                    fracao: (pontuacao.media ?? 0) / 5,
                    rotulo: 'Média $media de 5 estrelas',
                  ),
                  const SizedBox(height: BichuEspaco.e1),
                  Text(
                    'de 5',
                    style: textos.bodySmall
                        ?.copyWith(color: cores.textSecondary),
                  ),
                ],
              ),
            ),
            const SizedBox(width: BichuEspaco.e5),
            Expanded(child: _Histograma(pontuacao: pontuacao)),
          ],
        ),
        const SizedBox(height: BichuEspaco.e3),
        Text(
          pontuacao.quantidadeEmTexto,
          style: textos.bodyMedium?.copyWith(color: cores.textSecondary),
        ),
      ],
    );
  }
}

/// As cinco barras, de 5 para 1.
///
/// **As cinco existem sempre, inclusive vazias** (contrato): a barra de uma
/// nota que ninguem deu precisa existir, senao o grafico muda de forma e deixa
/// de ser comparavel entre locais.
class _Histograma extends StatelessWidget {
  const _Histograma({required this.pontuacao});

  final PontuacaoDoLocal pontuacao;

  @override
  Widget build(BuildContext context) {
    final cores = BichuColors.of(context).cores;
    final textos = Theme.of(context).textTheme;

    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: <Widget>[
        for (final nota in PontuacaoDoLocal.notasDeCimaParaBaixo)
          Padding(
            padding: const EdgeInsets.only(bottom: BichuEspaco.e1),
            child: Semantics(
              label: pontuacao.rotuloDaBarra(nota),
              child: ExcludeSemantics(
                child: Row(
                  children: <Widget>[
                    SizedBox(
                      width: BichuEspaco.e4,
                      child: Text('$nota', style: textos.labelMedium),
                    ),
                    const SizedBox(width: BichuEspaco.e2),
                    Expanded(
                      child: ClipRRect(
                        borderRadius: BorderRadius.circular(BichuRaio.sm),
                        child: LinearProgressIndicator(
                          value: pontuacao.fracaoDaNota(nota),
                          minHeight: BichuEspaco.e2,
                          backgroundColor: cores.surfaceSunken,
                          color: cores.primary,
                        ),
                      ),
                    ),
                  ],
                ),
              ),
            ),
          ),
      ],
    );
  }
}

/// Cinco estrelas preenchidas por [fracao], de 0 a 1.
///
/// **Decorativas**: a arvore de acessibilidade recebe [rotulo], que diz a nota
/// por extenso. Cinco icones anunciados um a um nao dizem nota nenhuma.
class _Estrelas extends StatelessWidget {
  const _Estrelas({required this.fracao, required this.rotulo});

  final double fracao;
  final String rotulo;

  /// 16 dp: a medida em que cinco estrelas cabem ao lado da data sem empurrar
  /// a linha para baixo com a fonte do sistema em 200%.
  static const double _medida = BichuEspaco.e4;

  @override
  Widget build(BuildContext context) {
    final cores = BichuColors.of(context).cores;
    const medida = _medida;

    return Semantics(
      label: rotulo,
      image: true,
      child: ExcludeSemantics(
        child: SizedBox(
          width: medida * 5,
          height: medida,
          child: Stack(
            children: <Widget>[
              Row(
                children: <Widget>[
                  for (var i = 0; i < 5; i++)
                    Icon(
                      Icons.star,
                      size: medida,
                      color: cores.surfaceSunken,
                    ),
                ],
              ),
              // O recorte pela fracao desenha meia estrela sem precisar de um
              // icone de meia estrela, que nao existe em todas as medidas.
              ClipRect(
                clipper: _RecorteDaFracao(fracao.clamp(0.0, 1.0)),
                child: Row(
                  children: <Widget>[
                    for (var i = 0; i < 5; i++)
                      Icon(Icons.star, size: medida, color: cores.primary),
                  ],
                ),
              ),
            ],
          ),
        ),
      ),
    );
  }
}

class _RecorteDaFracao extends CustomClipper<Rect> {
  const _RecorteDaFracao(this.fracao);

  final double fracao;

  @override
  Rect getClip(Size size) =>
      Rect.fromLTWH(0, 0, size.width * fracao, size.height);

  @override
  bool shouldReclip(_RecorteDaFracao antigo) => antigo.fracao != fracao;
}

// ---------------------------------------------------------------------------
// O formulario da minha avaliacao
// ---------------------------------------------------------------------------

/// A nota (obrigatoria) e o texto (opcional, com limite e contador).
class _Formulario extends StatelessWidget {
  const _Formulario({
    required this.nota,
    required this.texto,
    required this.enviando,
    required this.editando,
    required this.aoEscolherNota,
    required this.aoEnviar,
    this.erroDaNota,
    this.erro,
    this.aoCancelar,
  });

  final int? nota;
  final String? erroDaNota;
  final TextEditingController texto;
  final bool enviando;

  /// A recusa do envio, **inteira**: a faixa precisa de `acao` e de
  /// `proximaAcao` para ter saida, e nao so da frase.
  final MensagemDeErro? erro;
  final bool editando;
  final ValueChanged<int> aoEscolherNota;
  final VoidCallback aoEnviar;
  final VoidCallback? aoCancelar;

  @override
  Widget build(BuildContext context) {
    return _Caixa(
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: <Widget>[
          _SeletorDeNota(
            nota: nota,
            erro: erroDaNota,
            aoEscolher: aoEscolherNota,
          ),
          const SizedBox(height: BichuEspaco.e5),
          // **Opcional em TEXTO no rotulo**, que e o padrao do campo do app: a
          // nota e a avaliacao e o texto e o extra (decisao do cliente,
          // 18/10). O contador e o limite saem de `limiteDoTextoDaAvaliacao`,
          // que e o limite da COLUNA -- texto maior leva 400.
          BichuField(
            rotulo: PaginaDoLocal.rotuloDoTexto,
            controlador: texto,
            opcional: true,
            ajuda: PaginaDoLocal.ajudaDoTexto,
            exemplo: PaginaDoLocal.exemploDoTexto,
            limite: limiteDoTextoDaAvaliacao,
            linhas: 5,
            capitalizacao: TextCapitalization.sentences,
          ),
          if (erro != null) ...<Widget>[
            const SizedBox(height: BichuEspaco.e4),
            // A SAIDA SAI DA MENSAGEM, e nao desta tela: o catalogo diz o
            // rotulo e `saidaDaMensagem` diz o destino. Rotulo de operacao
            // (`Tentar de novo`) nao tem endereco e nao vira botao -- a faixa
            // so o desenha com rotulo E callback, e e isso que impede saida
            // que nao leva a lugar nenhum.
            FaixaDeAviso(
              texto: erro!.texto,
              rotuloDaAcao: erro!.acao,
              aoTocarNaAcao: saidaDaMensagem(context, erro!),
            ),
          ],
          const SizedBox(height: BichuEspaco.e4),
          SizedBox(
            width: double.infinity,
            child: BotaoPrimario(
              rotulo: editando
                  ? PaginaDoLocal.rotuloDeSalvarEdicao
                  : PaginaDoLocal.rotuloDeEnviar,
              aoTocar: aoEnviar,
              carregando: enviando,
            ),
          ),
          if (aoCancelar != null) ...<Widget>[
            const SizedBox(height: BichuEspaco.e2),
            SizedBox(
              width: double.infinity,
              child: BotaoSecundario(
                rotulo: PaginaDoLocal.rotuloDeCancelarEdicao,
                aoTocar: aoCancelar!,
              ),
            ),
          ],
          const SizedBox(height: BichuEspaco.e3),
          _Nota(texto: PaginaDoLocal.avisoDePublicacaoImediata),
        ],
      ),
    );
  }
}

/// As cinco estrelas de toque.
///
/// **E um grupo com rotulo, e cada estrela diz a nota que ela da.** Cinco
/// botoes chamados `★` seriam cinco paradas indistinguiveis no leitor de tela.
/// Cada alvo tem 48 dp, que e o minimo do 11.1.
///
/// **Nao ha meia estrela**: o cliente pediu nota de 1 a 5, e meia estrela
/// mudaria o tipo da coluna depois de haver dado gravado.
class _SeletorDeNota extends StatelessWidget {
  const _SeletorDeNota({
    required this.nota,
    required this.aoEscolher,
    this.erro,
  });

  final int? nota;
  final String? erro;
  final ValueChanged<int> aoEscolher;

  static String rotuloDaEstrela(int valor) =>
      valor == 1 ? '1 estrela de 5' : '$valor estrelas de 5';

  @override
  Widget build(BuildContext context) {
    final cores = BichuColors.of(context).cores;
    final textos = Theme.of(context).textTheme;
    final escolhida = nota;

    return Semantics(
      container: true,
      label: PaginaDoLocal.rotuloDaNota,
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: <Widget>[
          Text(
            PaginaDoLocal.rotuloDaNota,
            style: textos.labelLarge?.copyWith(color: cores.textPrimary),
          ),
          const SizedBox(height: BichuEspaco.e1),
          Text(
            PaginaDoLocal.ajudaDaNota,
            style: textos.bodySmall?.copyWith(color: cores.textSecondary),
          ),
          const SizedBox(height: BichuEspaco.e2),
          Row(
            children: <Widget>[
              for (var valor = 1; valor <= 5; valor++)
                Semantics(
                  inMutuallyExclusiveGroup: true,
                  checked: escolhida == valor,
                  label: rotuloDaEstrela(valor),
                  child: IconButton(
                    onPressed: () => aoEscolher(valor),
                    constraints: const BoxConstraints(
                      minWidth: BichuAlvoDeToque.min,
                      minHeight: BichuAlvoDeToque.min,
                    ),
                    icon: ExcludeSemantics(
                      child: Icon(
                        escolhida != null && valor <= escolhida
                            ? Icons.star
                            : Icons.star_outline,
                        color: escolhida != null && valor <= escolhida
                            ? cores.primary
                            : cores.outlineControl,
                      ),
                    ),
                  ),
                ),
            ],
          ),
          if (erro != null) ...<Widget>[
            const SizedBox(height: BichuEspaco.e1),
            Semantics(
              liveRegion: true,
              child: Text(
                erro!,
                style: textos.bodyMedium?.copyWith(color: cores.error),
              ),
            ),
          ],
        ],
      ),
    );
  }
}

// ---------------------------------------------------------------------------
// Uma avaliacao na lista
// ---------------------------------------------------------------------------

/// O cartao de uma avaliacao: quem escreveu, a nota, a data, o texto.
///
/// Tres regras do contrato vivem aqui:
///
/// - **`author_display_name` nulo escreve `Alguém da comunidade`**, por
///   `AvaliacaoDoLocal.nomeDeQuemLe`. Linha muda parece defeito de
///   carregamento.
/// - **`body` nulo nao desenha paragrafo**, e isso e normal e frequente: quem
///   deu so a nota.
/// - **`edited_at` nao nulo escreve `editada`.** Avaliacao reescrita depois de
///   alguem ter lido a primeira versao e um formato conhecido de ma-fe.
///
/// **Nada do autor alem do nome sai daqui**: nem conta, nem quantos pets tem,
/// nem as outras avaliacoes dele. A BICHUS-174 proibe expor vinculo entre duas
/// pessoas, e um nome navegavel seria exatamente isso -- e por isso o nome
/// **nao e um link**.
class _CartaoDeAvaliacao extends StatelessWidget {
  const _CartaoDeAvaliacao({
    required this.avaliacao,
    required this.minha,
    this.aoDenunciar,
    this.aoEditar,
    this.aoApagar,
  });

  final AvaliacaoDoLocal avaliacao;
  final bool minha;
  final VoidCallback? aoDenunciar;
  final VoidCallback? aoEditar;
  final VoidCallback? aoApagar;

  /// O nome acessivel do controle de denuncia. Numa lista de dez, dez
  /// controles chamados so `Denunciar` sao dez paradas indistinguiveis no
  /// leitor de tela.
  static String denunciarDe(String nome) => 'Denunciar a avaliação de $nome';

  @override
  Widget build(BuildContext context) {
    final cores = BichuColors.of(context).cores;
    final textos = Theme.of(context).textTheme;
    final texto = avaliacao.texto;

    return Container(
      width: double.infinity,
      padding: const EdgeInsets.all(BichuEspaco.e4),
      decoration: BoxDecoration(
        color: minha ? cores.surfaceSunken : cores.surface,
        borderRadius: BorderRadius.circular(BichuRaio.lg),
        border: Border.all(
          color: minha ? cores.primary : cores.outline,
          width: minha ? BichuBorda.medium : BichuBorda.hairline,
        ),
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: <Widget>[
          // Nome, nota, data e texto sao UMA parada de foco: quem usa leitor de
          // tela ouve a avaliacao inteira num deslize. Os controles ficam fora
          // do merge, porque cada um precisa da propria parada.
          MergeSemantics(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: <Widget>[
                if (minha) ...<Widget>[
                  _Selo(texto: PaginaDoLocal.seloDaMinha),
                  const SizedBox(height: BichuEspaco.e3),
                ],
                Text(avaliacao.nomeDeQuemLe, style: textos.titleSmall),
                const SizedBox(height: BichuEspaco.e2),
                Row(
                  children: <Widget>[
                    _Estrelas(
                      fracao: avaliacao.nota / 5,
                      rotulo: avaliacao.notaEmTexto,
                    ),
                    const SizedBox(width: BichuEspaco.e2),
                    Text(
                      avaliacao.foiEditada
                          // A data mostrada e a da edicao, e a palavra diz que
                          // houve uma: a data sozinha esconderia o fato.
                          ? '${avaliacao.dataEmTexto} · '
                              '${PaginaDoLocal.marcaDeEditada}'
                          : avaliacao.dataEmTexto,
                      style: textos.bodySmall
                          ?.copyWith(color: cores.textSecondary),
                    ),
                  ],
                ),
                // **Avaliacao so com nota nao ganha paragrafo vazio.**
                if (texto != null) ...<Widget>[
                  const SizedBox(height: BichuEspaco.e3),
                  Text(
                    texto,
                    style:
                        textos.bodyMedium?.copyWith(color: cores.textPrimary),
                  ),
                ],
              ],
            ),
          ),
          if (aoEditar != null || aoApagar != null) ...<Widget>[
            const SizedBox(height: BichuEspaco.e2),
            Row(
              children: <Widget>[
                if (aoEditar != null)
                  TextButton(
                    onPressed: aoEditar,
                    child: const Text(PaginaDoLocal.rotuloDeEditar),
                  ),
                if (aoApagar != null)
                  TextButton(
                    onPressed: aoApagar,
                    style: TextButton.styleFrom(foregroundColor: cores.error),
                    child: const Text(PaginaDoLocal.rotuloDeApagar),
                  ),
              ],
            ),
          ],
          if (aoDenunciar != null) ...<Widget>[
            const SizedBox(height: BichuEspaco.e2),
            Align(
              alignment: Alignment.centerLeft,
              child: TextButton.icon(
                onPressed: aoDenunciar,
                icon: const Icon(Icons.flag_outlined),
                style: TextButton.styleFrom(
                  foregroundColor: cores.textSecondary,
                ),
                // Numa lista de dez, dez controles chamados so `Denunciar` sao
                // dez paradas indistinguiveis no leitor de tela.
                label: Text(denunciarDe(avaliacao.nomeDeQuemLe)),
              ),
            ),
          ],
        ],
      ),
    );
  }
}

/// As tres ordens do contrato, no corpo da tela.
///
/// **Nao ha "mais útil"**: nao existe voto de utilidade neste produto, e
/// oferecer a ordem sem o voto ordenaria por nada.
class _ChipsDeOrdem extends StatelessWidget {
  const _ChipsDeOrdem({required this.ordem, required this.aoTrocar});

  final OrdemDasAvaliacoes ordem;
  final ValueChanged<OrdemDasAvaliacoes> aoTrocar;

  @override
  Widget build(BuildContext context) {
    final cores = BichuColors.of(context).cores;
    final textos = Theme.of(context).textTheme;

    return Semantics(
      container: true,
      label: PaginaDoLocal.rotuloDeOrdenar,
      child: Wrap(
        spacing: BichuAlvoDeToque.gapMin,
        runSpacing: BichuAlvoDeToque.gapMin,
        children: <Widget>[
          for (final o in OrdemDasAvaliacoes.values)
            Semantics(
              inMutuallyExclusiveGroup: true,
              selected: o == ordem,
              button: true,
              label: o.rotulo,
              child: ExcludeSemantics(
                child: InkWell(
                  onTap: () => aoTrocar(o),
                  borderRadius: BorderRadius.circular(BichuRaio.full),
                  child: Container(
                    constraints: const BoxConstraints(
                      minHeight: BichuAlvoDeToque.min,
                    ),
                    alignment: Alignment.center,
                    padding: const EdgeInsets.symmetric(
                      horizontal: BichuEspaco.e4,
                    ),
                    decoration: BoxDecoration(
                      color:
                          o == ordem ? cores.primaryContainer : cores.surface,
                      borderRadius: BorderRadius.circular(BichuRaio.full),
                      // A diferenca **nao e so de cor**: a espessura da borda
                      // muda, e `Semantics.selected` a diz por extenso
                      // (SC 1.4.1).
                      border: Border.all(
                        color: o == ordem ? cores.primary : cores.outline,
                        width: o == ordem
                            ? BichuBorda.medium
                            : BichuBorda.hairline,
                      ),
                    ),
                    child: Text(
                      o.rotulo,
                      style: textos.labelLarge?.copyWith(
                        color: o == ordem
                            ? cores.onPrimaryContainer
                            : cores.textPrimary,
                      ),
                    ),
                  ),
                ),
              ),
            ),
        ],
      ),
    );
  }
}

// ---------------------------------------------------------------------------
// A folha da denuncia
// ---------------------------------------------------------------------------

/// A denuncia de uma avaliacao: motivo de **lista fechada** e detalhe
/// opcional.
///
/// **Lista fechada e nao texto livre**, pelo desenho de `conversation_reports`:
/// a fila de moderacao precisa ser triada, e campo livre nao tria.
///
/// **O desfecho e `202`, e o texto nao promete decisao.** A rota promete que o
/// pedido foi recebido; prometer analise seria mentir sobre o que existe --
/// nao ha equipe de moderacao de plantao.
class _FolhaDeDenuncia extends StatefulWidget {
  const _FolhaDeDenuncia({
    required this.nomeDeQuemEscreveu,
    required this.aoEnviar,
  });

  final String nomeDeQuemEscreveu;

  final Future<void> Function(MotivoDaDenuncia motivo, String? detalhe)
      aoEnviar;

  static const String titulo = 'Denunciar esta avaliação';

  static const String explicacao =
      'A denúncia vai para a moderação do Bichu. A avaliação continua na '
      'página enquanto a equipe não decidir — esconder na denúncia tornaria a '
      'denúncia o jeito mais fácil de apagar a avaliação de um concorrente.';

  static const String rotuloDoMotivo = 'Motivo';
  static const String rotuloDoDetalhe = 'Quer contar mais?';
  static const String escolhaUmMotivo = 'Escolha um motivo.';
  static const String rotuloDeEnviar = 'Enviar denúncia';
  static const String rotuloDeCancelar = 'Cancelar';

  static const String recebida =
      'Denúncia recebida. A moderação do Bichu vai olhar.';

  @override
  State<_FolhaDeDenuncia> createState() => _FolhaDeDenunciaState();
}

class _FolhaDeDenunciaState extends State<_FolhaDeDenuncia> {
  MotivoDaDenuncia? _motivo;
  final TextEditingController _detalhe = TextEditingController();
  bool _enviando = false;
  String? _erro;
  String? _erroDoMotivo;

  @override
  void dispose() {
    _detalhe.dispose();
    super.dispose();
  }

  Future<void> _enviar() async {
    final motivo = _motivo;
    if (motivo == null) {
      setState(() => _erroDoMotivo = _FolhaDeDenuncia.escolhaUmMotivo);
      return;
    }
    setState(() {
      _enviando = true;
      _erro = null;
    });
    try {
      await widget.aoEnviar(motivo, _detalhe.text);
      if (!mounted) return;
      Navigator.of(context).pop(true);
    } on FalhaDeChamada catch (falha) {
      if (!mounted) return;
      setState(() {
        _enviando = false;
        _erro = MensagensDeErro.de(falha).texto;
      });
    } on FormatException {
      if (!mounted) return;
      setState(() {
        _enviando = false;
        _erro = MensagensDeErro.servidorFora;
      });
    }
  }

  @override
  Widget build(BuildContext context) {
    final cores = BichuColors.of(context).cores;
    final textos = Theme.of(context).textTheme;

    return Padding(
      padding: EdgeInsets.only(
        left: BichuEspaco.e4,
        right: BichuEspaco.e4,
        bottom: BichuEspaco.e4 + MediaQuery.viewInsetsOf(context).bottom,
      ),
      child: SingleChildScrollView(
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: <Widget>[
            Semantics(
              header: true,
              child: Text(
                _FolhaDeDenuncia.titulo,
                style: textos.titleLarge,
              ),
            ),
            const SizedBox(height: BichuEspaco.e2),
            Text(
              _FolhaDeDenuncia.explicacao,
              style: textos.bodyMedium?.copyWith(color: cores.textSecondary),
            ),
            const SizedBox(height: BichuEspaco.e4),
            GrupoDeOpcoes<MotivoDaDenuncia>(
              rotulo: _FolhaDeDenuncia.rotuloDoMotivo,
              selecionado: _motivo,
              erro: _erroDoMotivo,
              opcoes: <OpcaoDeLinha<MotivoDaDenuncia>>[
                for (final m in MotivoDaDenuncia.values)
                  OpcaoDeLinha<MotivoDaDenuncia>(
                    valor: m,
                    rotulo: m.rotulo,
                  ),
              ],
              aoSelecionar: (m) => setState(() {
                _motivo = m;
                _erroDoMotivo = null;
              }),
            ),
            const SizedBox(height: BichuEspaco.e4),
            BichuField(
              rotulo: _FolhaDeDenuncia.rotuloDoDetalhe,
              controlador: _detalhe,
              opcional: true,
              limite: limiteDoDetalheDaDenuncia,
              linhas: 3,
              capitalizacao: TextCapitalization.sentences,
            ),
            if (_erro != null) ...<Widget>[
              const SizedBox(height: BichuEspaco.e4),
              FaixaDeAviso(texto: _erro!),
            ],
            const SizedBox(height: BichuEspaco.e4),
            SizedBox(
              width: double.infinity,
              child: BotaoPrimario(
                rotulo: _FolhaDeDenuncia.rotuloDeEnviar,
                aoTocar: _enviar,
                carregando: _enviando,
              ),
            ),
            const SizedBox(height: BichuEspaco.e2),
            SizedBox(
              width: double.infinity,
              child: BotaoSecundario(
                rotulo: _FolhaDeDenuncia.rotuloDeCancelar,
                aoTocar: () => Navigator.of(context).pop(false),
              ),
            ),
          ],
        ),
      ),
    );
  }
}

// ---------------------------------------------------------------------------
// As pecas de pagina, no mesmo vocabulario do detalhe do produto
// ---------------------------------------------------------------------------

/// A margem lateral da pagina: a mesma de `loja/produto_da_loja.dart` e de
/// `rede/encontro_da_rede.dart`.
class _Margem extends StatelessWidget {
  const _Margem({required this.child});
  final Widget child;

  @override
  Widget build(BuildContext context) => Padding(
        padding: const EdgeInsets.symmetric(horizontal: BichuEspaco.e4),
        child: child,
      );
}

/// Um bloco com icone e titulo, no mesmo desenho do detalhe do produto.
class _Secao extends StatelessWidget {
  const _Secao({
    required this.icone,
    required this.titulo,
    required this.child,
  });

  final IconData icone;
  final String titulo;
  final Widget child;

  @override
  Widget build(BuildContext context) {
    final cores = BichuColors.of(context).cores;
    final textos = Theme.of(context).textTheme;
    return _Margem(
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: <Widget>[
          Row(
            children: <Widget>[
              ExcludeSemantics(child: Icon(icone, color: cores.primary)),
              const SizedBox(width: BichuEspaco.e2),
              Expanded(
                child: Semantics(
                  header: true,
                  child: Text(titulo, style: textos.titleMedium),
                ),
              ),
            ],
          ),
          const SizedBox(height: BichuEspaco.e3),
          child,
        ],
      ),
    );
  }
}

/// O divisor entre secoes, com a margem da pagina.
class _Divisor extends StatelessWidget {
  const _Divisor();

  @override
  Widget build(BuildContext context) {
    final cores = BichuColors.of(context).cores;
    return Padding(
      padding: const EdgeInsets.symmetric(vertical: BichuEspaco.e6),
      child: Divider(
        height: BichuBorda.hairline,
        thickness: BichuBorda.hairline,
        color: cores.outline,
        indent: BichuEspaco.e4,
        endIndent: BichuEspaco.e4,
      ),
    );
  }
}

/// A caixa neutra que embrulha um bloco de conteudo: mesmo desenho do cartao.
class _Caixa extends StatelessWidget {
  const _Caixa({required this.child});

  final Widget child;

  @override
  Widget build(BuildContext context) {
    final cores = BichuColors.of(context).cores;
    return Container(
      width: double.infinity,
      padding: const EdgeInsets.all(BichuEspaco.e4),
      decoration: BoxDecoration(
        color: cores.surface,
        borderRadius: BorderRadius.circular(BichuRaio.lg),
        border: Border.all(color: cores.outline, width: BichuBorda.hairline),
      ),
      child: child,
    );
  }
}

class _Titulo extends StatelessWidget {
  const _Titulo({required this.texto});

  final String texto;

  @override
  Widget build(BuildContext context) {
    return Semantics(
      header: true,
      child: Text(texto, style: Theme.of(context).textTheme.titleMedium),
    );
  }
}

class _Corpo extends StatelessWidget {
  const _Corpo({required this.texto});

  final String texto;

  @override
  Widget build(BuildContext context) {
    final cores = BichuColors.of(context).cores;
    return Text(
      texto,
      style: Theme.of(context)
          .textTheme
          .bodyMedium
          ?.copyWith(color: cores.textPrimary),
    );
  }
}

/// Uma observacao discreta, em `body-sm` e `text-secondary`.
class _Nota extends StatelessWidget {
  const _Nota({required this.texto});

  final String texto;

  @override
  Widget build(BuildContext context) {
    final cores = BichuColors.of(context).cores;
    return Text(
      texto,
      style: Theme.of(context)
          .textTheme
          .bodySmall
          ?.copyWith(color: cores.textSecondary),
    );
  }
}

/// A pilula neutra: a palavra e a informacao, e nenhuma cor diz nada.
///
/// **No cabecalho ela diz O QUE foi verificado**, nunca "Verificado" sozinho:
/// a BICHUS-165 nao passou por selo generico.
class _Selo extends StatelessWidget {
  const _Selo({required this.texto});

  final String texto;

  @override
  Widget build(BuildContext context) {
    final cores = BichuColors.of(context).cores;
    final textos = Theme.of(context).textTheme;

    return Container(
      padding: const EdgeInsets.symmetric(
        horizontal: BichuEspaco.e3,
        vertical: BichuEspaco.e1,
      ),
      decoration: BoxDecoration(
        color: cores.surfaceSunken,
        borderRadius: BorderRadius.circular(BichuRaio.full),
        border: Border.all(color: cores.outline, width: BichuBorda.hairline),
      ),
      child: Text(
        texto,
        style: textos.labelSmall?.copyWith(color: cores.textPrimary),
      ),
    );
  }
}

class _LinhaComIcone extends StatelessWidget {
  const _LinhaComIcone({required this.icone, required this.texto});

  final IconData icone;
  final String texto;

  @override
  Widget build(BuildContext context) {
    final cores = BichuColors.of(context).cores;
    final textos = Theme.of(context).textTheme;

    return Row(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: <Widget>[
        ExcludeSemantics(
          child: Icon(icone, size: BichuEspaco.e5, color: cores.textSecondary),
        ),
        const SizedBox(width: BichuEspaco.e2),
        Expanded(
          child: Text(
            texto,
            style: textos.bodyMedium?.copyWith(color: cores.textSecondary),
          ),
        ),
      ],
    );
  }
}

class _BotaoVoltar extends StatelessWidget {
  const _BotaoVoltar({required this.aoTocar});
  final VoidCallback aoTocar;

  @override
  Widget build(BuildContext context) {
    return IconButton(
      onPressed: aoTocar,
      tooltip: 'Voltar',
      icon: const Icon(Icons.arrow_back),
      constraints: const BoxConstraints(
        minWidth: BichuAlvoDeToque.critico,
        minHeight: BichuAlvoDeToque.critico,
      ),
      color: BichuColors.of(context).cores.textPrimary,
    );
  }
}

/// O esqueleto da pagina: nome, duas linhas de meta e o bloco da pontuacao.
///
/// **Anunciado**: sem o `Semantics` o leitor de tela encontraria uma pagina
/// sem nada enquanto a chamada esta em voo.
class _EsqueletoDoLocal extends StatelessWidget {
  const _EsqueletoDoLocal();

  @override
  Widget build(BuildContext context) {
    return Semantics(
      label: PaginaDoLocal.carregandoOLocal,
      child: const Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: <Widget>[
          _Barra(fracao: 0.7),
          SizedBox(height: BichuEspaco.e3),
          _Barra(fracao: 0.4),
          SizedBox(height: BichuEspaco.e3),
          _Barra(fracao: 0.5),
          SizedBox(height: BichuEspaco.e6),
          _Barra(fracao: 0.9),
          SizedBox(height: BichuEspaco.e3),
          _Barra(fracao: 0.8),
        ],
      ),
    );
  }
}

/// O esqueleto da lista de avaliacoes: duas linhas por item.
class _EsqueletoDeAvaliacoes extends StatelessWidget {
  const _EsqueletoDeAvaliacoes();

  @override
  Widget build(BuildContext context) {
    return const ExcludeSemantics(
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: <Widget>[
          _Barra(fracao: 0.35),
          SizedBox(height: BichuEspaco.e2),
          _Barra(fracao: 0.9),
          SizedBox(height: BichuEspaco.e5),
          _Barra(fracao: 0.3),
          SizedBox(height: BichuEspaco.e2),
          _Barra(fracao: 0.75),
        ],
      ),
    );
  }
}

class _Barra extends StatelessWidget {
  const _Barra({required this.fracao});

  final double fracao;

  @override
  Widget build(BuildContext context) {
    final cores = BichuColors.of(context).cores;
    return FractionallySizedBox(
      alignment: Alignment.centerLeft,
      widthFactor: fracao,
      child: Container(
        // A altura acompanha a escala de fonte do sistema: esqueleto de altura
        // fixa fica menor que o texto que ele representa em 200% e a pagina
        // pula quando carrega.
        height: MediaQuery.textScalerOf(context).scale(BichuEspaco.e3),
        decoration: BoxDecoration(
          color: cores.surfaceSunken,
          borderRadius: BorderRadius.circular(BichuRaio.sm),
        ),
      ),
    );
  }
}
