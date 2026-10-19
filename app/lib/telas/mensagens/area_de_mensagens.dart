/// A AREA DE MENSAGENS: a lista de conversas, e a porta da conversa aberta.
///
/// ---------------------------------------------------------------------------
/// ## O que esta tela desfaz
///
/// O servidor tem a conversa mediada no ar e o app nao consumia nenhuma das
/// rotas dela. O recado de quem acha o pet era gravado e **ninguem podia
/// ler** -- num produto cuja cunha e perdido/achado. Esta e a tela que o
/// produto mais precisava.
///
/// ---------------------------------------------------------------------------
/// ## DESTINO INDEPENDENTE, e de proposito
///
/// Em 19/10/2026 o cliente decidiu que `Mensagens` **vira secao da barra
/// principal** e que o `Perfil` sai da barra (vira uma foto pequena na barra de
/// topo). A reestruturacao da barra, do avatar no topo e do menu e de **outro
/// agente**, que e o dono de `casca_com_abas.dart`, `abas.dart`,
/// `gaveta_de_secoes.dart` e `rotas.dart`.
///
/// Por isso este arquivo **nao se amarra a navegacao nenhuma**: ele exporta
/// [RotasDeMensagens] com os dois caminhos e [AreaDeMensagens] como raiz, e
/// quem monta a barra pluga os dois onde estiver montando. Nao ha uma linha
/// aqui que dependa de ser aba, de ser filha da casca ou de ter barra embaixo.
///
/// **A medida do rotulo, que o agente da barra precisa antes de decidir:**
/// `Mensagens` **NAO CABE** no slot de 64,0 dp -- ele quebra em duas linhas e
/// transborda 5,0 dp nas **cinco** larguras suportadas (320, 360, 375, 390 e
/// 412 dp), medido com a `Inter` real em
/// `test/telas/rotulo_de_mensagens_cabe_test.dart`. `Avisos` cabe nas cinco.
/// Ver aquele arquivo para a tabela inteira.
///
/// ---------------------------------------------------------------------------
/// ## O PADRAO DE LISTAGEM VALE AQUI (decisao do cliente, 18/10/2026)
///
/// Nas palavras dele: *"adicione um campo de busca/filtro na secao de
/// mensagens, para o usuario conseguir filtrar quando tiver muitos usuarios"*.
///
/// **Isto REVERTE o que este arquivo dizia** -- "sem busca, sem filtro e sem
/// ordenacao: nao ha o que recortar numa lista de conversas" --, e a reversao e
/// dele. Quem abrir este arquivo em tres meses e achar que a regra foi
/// quebrada por descuido esta lendo o commit errado: este paragrafo e o
/// registro.
///
/// O desenho que sai disto:
///
/// - **O campo de busca e o da [BarraDeListagem]**, o componente compartilhado
///   por toda pagina com registros, e nao um `TextField` desenhado aqui. Ele
///   fica no topo do CORPO, nunca na barra de topo.
/// - **A busca e do SERVIDOR** (`AlcanceDaBusca.servidor`): `q` entrou no
///   contrato em `listConversations`, e recorta por nome do pet e por nome de
///   exibicao do outro lado, dentro das conversas de quem chamou. Recortar na
///   memoria seria pior do que nada aqui -- com rolagem infinita de dez em dez,
///   a busca olharia so as dez primeiras, que e exatamente o caso que o pedido
///   ("quando tiver muitos usuarios") existe para resolver.
/// - **NAO HA FILTRO E NAO HA ORDENACAO**, e a ausencia e do componente e nao
///   um esquecimento: `listConversations` nao declara nenhum recorte de lista
///   fechada, e a ordem e uma so. A propria `BarraDeListagem` nao desenha o
///   gatilho nesses dois casos ("o filtro sem opcao", "a ordenacao com uma
///   opcao so"), porque seria um toque que termina em nada. O dia em que o
///   contrato ganhar um recorte, passar `filtro:` aqui e uma linha.
/// - **Sem texto de apoio** -- o cliente mandou removê-los em 18/10 --, e por
///   isso a lista vazia e **uma linha** e nada mais.
///
/// ## A ORDEM E A DA ULTIMA MENSAGEM, E ELA VEM DO SERVIDOR
///
/// Pedido do cliente no mesmo dia: *"ordene por ultima mensagem"*. A chave e
/// `coalesce(last_message_at, opened_at)` e mora no `ORDER BY` da consulta
/// (`kysely-conversation-repository.ts`, `CHAVE_DA_ORDEM`).
///
/// **Esta tela nao reordena nada.** Com rolagem infinita, ordenar aqui
/// ordenaria so o que ja chegou: a pagina seguinte entraria com itens mais
/// novos embaixo dos mais antigos, e a lista se embaralharia a cada rolada.
///
/// ## ROLAGEM INFINITA, DE DEZ EM DEZ
///
/// Numero do cliente (*"trazendo as 10 ultimas conversas e incrementando por
/// 10"*), e nao escolha de engenharia: ver `ConversasApi.limiteDaLista`. O
/// botao `Carregar mais conversas` **saiu**; o que ficou no rodape e o giro de
/// carregamento, e a faixa de erro com `Tentar de novo` para o caso em que a
/// pagina seguinte nao chega -- rolagem que falha em silencio e uma lista que
/// simplesmente para de crescer.
///
/// ## NENHUM AVATAR DE FOTO, E O PEDIDO DO CLIENTE NAO CABE
///
/// O cliente pediu em 18/10: *"na conversa, traga a foto do usuario como icone
/// das conversas"*. **Nao ha foto de terceiro neste produto**, e a ausencia foi
/// medida em tres lugares independentes:
///
/// 1. **O contrato proibe, por extenso e em dois pontos.**
///    `Conversation/properties/participants` e
///    `FinderConversation/properties/participants` declaram `display_name`
///    como *"Primeiro nome ou apelido. **Nunca** sobrenome completo, telefone,
///    e-mail nem foto de perfil"*. `participants[]` tem **dois** campos, e nao
///    existe um terceiro para uma URL de imagem cair.
/// 2. **A decisao registrada proibe avatar de terceiro** (ADR-0025, decisao 2:
///    *"nao existe campo com pessoas, em forma nenhuma: nem nome, nem primeiro
///    nome, nem apelido, nem `slug`, nem avatar, nem contagem por bairro"*), e
///    e por isso que `Me.photo.url` e a UNICA resposta do contrato que traz
///    foto de pessoa -- e quem a ve e o dono (ver `api/me_api.dart`).
/// 3. **O desenho da frente de perfil recusa esta superficie por nome.** O
///    plano de `feat/comunidade-perfil-e-conexao` lista as tres telas em que o
///    avatar pode aparecer (o proprio perfil, o perfil de outra pessoa, a
///    lista de conexoes e de pedidos) e diz, da conversa mediada: *"o avatar
///    **nao** entra na conversa mediada, e eu recomendo que **nao entre
///    nunca**"*, por tres razoes -- o achador pode nao ter conta (canal
///    assimetrico), a conversa vive sob a sombra do golpe do falso achador
///    (rosto e insumo de engenharia social), e e o canal que **atravessa o
///    bloqueio**.
///
/// **O que ficou de fora, dito em voz alta:** a foto. O icone da conversa
/// continua sendo a marca neutra -- a inicial do `display_name` --, e o lado
/// despersonalizado (`Tutor` / `Quem achou`) ganha a marca em cinza desligado.
///
/// **O que foi entregue do pedido:** o TOQUE. O icone e um controle, e o
/// destino dele mora num ponto unico e nomeado, [PortaDoPerfilDoParticipante].
library;

import 'package:flutter/material.dart';
import 'package:go_router/go_router.dart';

import '../../api/falhas.dart';
import '../../api/conversas_api.dart';
import '../../api/mensagens_de_erro.dart';
import '../../api/modelos_conversa.dart';
import '../../escopo.dart';
import '../../formato/quando.dart';
import '../../theme/bichu_colors.dart';
import '../../theme/bichu_tokens.g.dart';
import '../../widgets/barra_de_listagem.dart';
import '../../widgets/faixa_de_aviso.dart';

/// Os enderecos da area de mensagens, num lugar so.
///
/// **E isto que o agente da barra consome**, e e isto que o agente do aviso ao
/// tutor precisa para o toque na notificacao abrir a conversa certa.
abstract final class RotasDeMensagens {
  /// A raiz da secao: a lista de conversas. Widget: [AreaDeMensagens].
  static const String area = '/mensagens';

  /// Uma conversa, pelo id. Widget: `TelaDaConversa`.
  ///
  /// **E ESTE o destino do toque na notificacao.** O agente que emite o aviso
  /// ao tutor monta o caminho com [conversaDe] e nao com interpolacao crua.
  static const String conversa = '/mensagens/:conversaId';

  /// O nome do parametro de caminho, num lugar so: quem monta o endereco e
  /// quem o le usam a mesma palavra.
  static const String parametroDaConversa = 'conversaId';

  /// O endereco da conversa [conversaId].
  ///
  /// `Uri.encodeComponent` porque o id vem da resposta do servidor, e nao
  /// desta tela: montar caminho com interpolacao crua e como um id com barra
  /// vira uma rota que nao existe.
  static String conversaDe(String conversaId) =>
      '/mensagens/${Uri.encodeComponent(conversaId)}';
}

/// **O PONTO UNICO DO TOQUE NO ICONE DA CONVERSA.** Ligar aqui, e so aqui.
///
/// ---------------------------------------------------------------------------
/// ## Por que ele existe em vez de uma rota escrita na linha da lista
///
/// O cliente pediu em 18/10/2026: *"faca a imagem ser clicada levando o
/// usuario para o perfil do usuario, assim como na barra principal superior"*.
///
/// **MEDIDO em `origin/development`, e o destino NAO EXISTE:**
///
/// - `roteamento/rotas.dart` nao tem rota de perfil de TERCEIRO. As 46 rotas
///   declaradas incluem `/perfil`, `/perfil/dados`, `/perfil/achados` e
///   `/perfil/minhas-fotos` -- todas da PROPRIA conta -- e nenhuma que receba
///   outra pessoa por parametro.
/// - A comparacao do cliente com a barra de topo **nao serve de atalho**:
///   `AvatarDaConta`, em `telas/casca_com_abas.dart`, tem o nome acessivel
///   `Sua conta` e faz `GoRouter.of(context).go(Rotas.perfil)`. Aquela foto
///   leva a pessoa para a conta DELA. Reusar a mesma rota aqui abriria a
///   propria conta ao tocar no icone de outra pessoa -- a mesma rota, e o
///   destino errado.
/// - A tela de perfil de terceiro e da branch `feat/comunidade-perfil-e-conexao`,
///   por decisao do cliente. Medido: naquela branch ha **dois arquivos** de
///   diferenca contra a base (`design/prototipos/conexao-e-vitrine/PLANO.md` e
///   `index.html`) -- o desenho existe, a tela nao. Construir uma aqui
///   duplicaria aquele trabalho e colidiria na mescla.
///
/// ## O que este tipo faz, e o que ele NAO faz
///
/// Ele e a **unica** decisao de destino do icone. [destino] devolve o endereco
/// do perfil daquele participante, ou `null` quando nao ha endereco.
///
/// **`null` NAO desenha um controle.** `MarcaNeutraDoParticipante` fica
/// decorativa, exatamente como hoje: um icone que se anuncia como botao e nao
/// leva a lugar nenhum e o toque sem desfecho que o criterio 2 da BICHUS-62
/// proibe, e um aviso de "em breve" e o mesmo beco com uma frase em cima.
///
/// ## COMO LIGAR, NA MESCLA, numa linha
///
/// ```dart
/// PortaDoPerfilDoParticipante.destino =
///     (outro) => Rotas.perfilDe(outro.handle);
/// ```
///
/// Em `main.dart` ou no `Escopo`, uma vez. Nada mais neste arquivo muda: a
/// fiacao do toque, o rotulo acessivel e o alvo de 48 dp ja estao de pe, e as
/// iscas de `test/mensagens/foto_da_conversa_test.dart` provam os dois estados.
///
/// **Campo e nao metodo**, de proposito: funcao estatica nao se troca, e sem
/// troca nao existe isca que prove que o toque navega. O preco e um estado
/// global, e ele e aceitavel porque e UM, e porque e exatamente o que a mescla
/// precisa alcancar.
abstract final class PortaDoPerfilDoParticipante {
  /// O endereco do perfil de [outro], ou `null` quando ele nao existe.
  ///
  /// Nasce devolvendo `null` porque e essa a medida de hoje. Ver o doc da
  /// classe: o destino nao existe em `origin/development`.
  static String? Function(ParticipanteDaConversa outro) destino = _semDestino;

  /// O default, nomeado para a isca poder voltar a ele num `addTearDown`.
  static String? _semDestino(ParticipanteDaConversa outro) => null;

  /// Volta ao estado de fabrica. **Para a isca**, e nao para a tela.
  static void soltar() => destino = _semDestino;
}

/// Os textos da area, num lugar so.
abstract final class TextosDasMensagens {
  static const String titulo = 'Mensagens';

  /// A lista vazia: **uma linha**, sem texto de apoio (decisao do cliente).
  static const String listaVazia = 'Você ainda não tem mensagens.';

  static const String naoConseguimosCarregar =
      'Não conseguimos carregar suas mensagens. Toque em Tentar de novo.';

  /// O 410 nos dois casos -- encerrada, e conta desabilitada do outro lado.
  ///
  /// **Uma frase so para os dois**, porque o servidor manda um erro so de
  /// proposito: distinguir contaria a esta pessoa o que aconteceu com a conta
  /// da outra. A frase diz o estado e o que ainda da para fazer (ler), e nao
  /// promete uma saida que nao existe.
  static const String conversaEncerrada = 'Esta conversa está encerrada.';

  static const String aindaDaParaLer =
      'Você continua lendo o que foi escrito, e não é possível enviar mensagem '
      'nova.';

  static const String conversaIndisponivel =
      'Esta conversa não está disponível. Volte para a lista de mensagens.';

  static const String carregarAnteriores = 'Carregar mensagens anteriores';

  /// O nome do campo de busca. Vai na dica DENTRO do campo e no nome
  /// acessivel: ver `ControleDeBusca.rotulo`, que e onde essa regra mora.
  static const String buscarConversa = 'Buscar conversa';

  /// Como chamar o que esta listado, para a linha de resumo da barra.
  static const SubstantivoDaListagem substantivo = SubstantivoDaListagem(
    singular: 'conversa',
    plural: 'conversas',
  );

  /// A busca nao achou nada. **Nao e a lista vazia** [listaVazia]: a pessoa TEM
  /// mensagens, e o que nao casou foi o termo. Dizer "voce ainda nao tem
  /// mensagens" aqui seria afirmar o contrario do que e verdade.
  static const String nadaParaEsteTermo =
      'Nenhuma conversa com esse termo.';

  static const String campoDeMensagem = 'Escreva uma mensagem';

  static const String enviar = 'Enviar a mensagem';

  static const String naoFoiEnviada =
      'A mensagem não foi enviada. Confira a conexão e toque em Tentar de novo '
      '— o que você escreveu continua aí.';

  static const String dadoRetirado =
      'Retiramos um dado de contato da mensagem. O combinado acontece por aqui.';

  /// O rotulo acessivel da linha da lista.
  ///
  /// **Nao carrega id**: ADR-0010 proibe UUID interno em saida publica, e um
  /// rotulo lido por leitor de tela e saida.
  static String rotuloDaLinha({
    required String quem,
    required String pet,
    required bool naoLida,
    String? quando,
  }) {
    final marca = naoLida ? ', mensagem nova' : '';
    final momento = quando == null ? '' : ', $quando';
    return 'Conversa com $quem sobre $pet$marca$momento';
  }

  static String rotuloDaMarcaNeutra(String quem) => 'Marca de $quem';

  /// O nome acessivel do icone QUANDO ELE E UM CONTROLE.
  ///
  /// **Diz o que o toque ABRE, e nao o que o icone mostra** -- a mesma regra de
  /// `AvatarDaConta.rotuloAcessivel` (*"a imagem nao e a informacao, o destino
  /// e"*). Com o destino ausente este rotulo nao e usado: o icone volta a ser
  /// decorativo e ganha [rotuloDaMarcaNeutra].
  static String rotuloDaPortaDoPerfil(String quem) => 'Abrir o perfil de $quem';
}

/// A raiz da area de mensagens: a lista de conversas.
///
/// **E ESTE o widget de entrada que o agente da barra pluga.**
class AreaDeMensagens extends StatefulWidget {
  const AreaDeMensagens({super.key, this.conversas, this.aoContarNaoLidas});

  /// O cliente de conversa. Nulo usa o do [Escopo], que e o caminho do app.
  ///
  /// **Existe para o teste atravessar o `ApiClient` de verdade** -- a camada de
  /// API, a traducao de `Problem` e o 410 -- em vez de um dublê de tela
  /// responder "encerrada" por conta propria. E a mesma razao pela qual
  /// `agenda_da_rede.dart` monta `RedeApi(escopo.api)` na tela: nao ha estado
  /// global para um teste trocar.
  final ConversasApi? conversas;

  /// **A COSTURA DO SINO**, para quem monta a barra de topo.
  ///
  /// Dispara com `unread_count` **como o servidor mandou**, sem teto, cada vez
  /// que a lista chega. Quem desenha o distintivo passa o numero por
  /// [seloDoContador] (`9+`) e por [rotuloDoSino] (o numero inteiro, por
  /// extenso, para quem ouve a tela).
  ///
  /// Existe como callback e nao como leitura de um estado global porque o sino
  /// e de OUTRO ramo: assim ele pluga sem que esta tela conheca a barra, e sem
  /// que a barra conheca `ConversasApi`.
  ///
  /// **O sino nao e alimentado so por aqui.** Quem precisa do numero sem a
  /// pessoa abrir a area chama `ConversasApi.listar()` e le `unreadCount` --
  /// e a MESMA fonte, e nunca uma contagem local.
  final ValueChanged<int>? aoContarNaoLidas;

  @override
  State<AreaDeMensagens> createState() => _EstadoDaAreaDeMensagens();
}

class _EstadoDaAreaDeMensagens extends State<AreaDeMensagens> {
  final List<Conversa> _conversas = <Conversa>[];

  /// O que a pessoa DIGITA. Intencao, e nao recorte: ver [_termoAplicado].
  final TextEditingController _buscaControlador = TextEditingController();

  /// O controlador da rolagem, e **a origem da pagina seguinte**.
  ///
  /// Proprio e nao herdado: a rolagem infinita precisa escutar ESTA lista, e um
  /// `PrimaryScrollController` que a casca trocasse levaria o gatilho com ele.
  final ScrollController _rolagem = ScrollController();

  ConversasApi get _api =>
      widget.conversas ?? ConversasApi(Escopo.of(context).api);
  String? _cursor;
  bool _carregando = true;
  bool _carregandoMais = false;
  String? _falha;

  /// O termo que **produziu** a lista que esta na tela, ou nulo.
  ///
  /// E ele que vai para a `BarraDeListagem`, e nunca o texto do controlador: o
  /// texto digitado e intencao, e intencao nao recorta lista. A razao inteira
  /// esta em `BarraDeListagem`, secao "O recorte ativo e o APLICADO".
  String? _termoAplicado;

  /// `ConversationPage.total`: quantas conversas o recorte tem **no servidor**.
  ///
  /// Nunca `_conversas.length`: com dez por pagina, a linha de resumo diria
  /// `10` a quem tem 57, e a pessoa leria que a busca nao achou o resto.
  int _total = 0;

  /// A pagina seguinte comeca a ser buscada a esta distancia do fim, em dp.
  ///
  /// Ela existe para a lista crescer **antes** de a pessoa encostar no fim: com
  /// o gatilho no fim exato, cada dez linhas rendem um giro parado no rodape.
  ///
  /// **400 dp sao pouco mais de quatro linhas**, medido: sete linhas de
  /// conversa cabem na janela de 600 x 800 dp da bancada de teste, o que poe a
  /// linha perto de 90 dp. Com dez por pagina, a folga fica abaixo de meia
  /// pagina -- grande o bastante para a pagina seguinte chegar antes de a
  /// pessoa alcancar o fim, e pequena o bastante para a chamada nao sair por
  /// uma rolada de um dedo no alto da lista.
  static const double _folgaDoGatilho = 400;

  /// O numero do sino, como o SERVIDOR mandou. Nunca contado aqui.
  ///
  /// Guardado mesmo sem o sino morar nesta tela: ele e da barra de topo, que e
  /// de outro ramo, e este campo e o ponto unico de onde o valor sai quando ela
  /// chegar. Contar `_conversas.where(unread)` seria errado por tres motivos de
  /// uma vez -- a pagina nao e a conta inteira, a lista vista nao conta, e a
  /// excecao do aviso de plaquinha nao e exprimivel aqui.
  int _naoLidas = 0;

  @override
  void initState() {
    super.initState();
    _rolagem.addListener(_aoRolar);
    WidgetsBinding.instance.addPostFrameCallback((_) => _carregar());
  }

  @override
  void dispose() {
    _rolagem
      ..removeListener(_aoRolar)
      ..dispose();
    _buscaControlador.dispose();
    super.dispose();
  }

  /// ROLOU: a pagina seguinte, quando falta menos de [_folgaDoGatilho] para o
  /// fim.
  void _aoRolar() {
    if (!_rolagem.hasClients) return;
    final posicao = _rolagem.position;
    if (posicao.pixels < posicao.maxScrollExtent - _folgaDoGatilho) return;
    _carregarMais();
  }

  /// A LISTA QUE NAO ROLA tambem precisa crescer.
  ///
  /// **Este metodo existe por um defeito que a rolagem infinita tem de
  /// nascenca**, e ele nao e teorico: dez conversas podem nao encher a tela de
  /// um aparelho alto, e `maxScrollExtent` fica em zero. Sem isto, `_aoRolar`
  /// nunca dispara -- porque nao ha rolagem para disparar --, o `cursor` fica
  /// guardado para sempre e a lista para em dez com mais quarenta no servidor.
  /// A pessoa nao recebe erro nenhum: ela so nao tem o resto.
  void _completarATela() {
    if (!mounted || _cursor == null) return;
    if (!_rolagem.hasClients) return;
    if (_rolagem.position.maxScrollExtent > 0) return;
    _carregarMais();
  }

  /// Depois do quadro, porque a extensao da rolagem so existe depois do
  /// `layout`: chamar [_completarATela] dentro do `setState` leria o
  /// `maxScrollExtent` do quadro ANTERIOR.
  void _aposOQuadro() {
    WidgetsBinding.instance.addPostFrameCallback((_) => _completarATela());
  }

  Future<void> _carregar() async {
    setState(() {
      _carregando = true;
      _falha = null;
    });
    try {
      final pagina = await _api.listar(termo: _termoAplicado);
      if (!mounted) return;
      setState(() {
        _conversas
          ..clear()
          ..addAll(pagina.items);
        _cursor = pagina.nextCursor;
        _naoLidas = pagina.unreadCount;
        _total = pagina.total;
        _carregando = false;
      });
      _aposOQuadro();
      widget.aoContarNaoLidas?.call(_naoLidas);
      // A AREA FOI VISTA: zera o CONTADOR, e **nao** marca item nenhum.
      //
      // Depois do `await` da lista e nao antes: se a lista nao carregou, a
      // pessoa nao viu nada, e zerar o sino aqui esconderia o aviso de quem
      // abriu a area num elevador sem sinal.
      //
      // As marcas de nao lida das linhas na tela NAO mudam. "Lido" e o item
      // aberto, e a isca `abrir_a_lista_nao_marca_itens` reprova se mudarem.
      await _api.marcarListaVista();
    } on FalhaDeChamada {
      // A lista anterior e LIMPADA na primeira pagina, como as outras
      // listagens do app: a pessoa veria o resultado antigo como se fosse o
      // novo. O texto diz o que fazer.
      if (!mounted) return;
      setState(() {
        _conversas.clear();
        _total = 0;
        _carregando = false;
        _falha = TextosDasMensagens.naoConseguimosCarregar;
      });
    } on FormatException {
      if (!mounted) return;
      setState(() {
        _conversas.clear();
        _total = 0;
        _carregando = false;
        _falha = TextosDasMensagens.naoConseguimosCarregar;
      });
    }
  }

  /// A BUSCA foi aplicada: volta para a PRIMEIRA pagina do recorte novo.
  ///
  /// **O cursor e zerado junto**, e nao e detalhe: ele e um endereco DENTRO da
  /// ordem do recorte anterior. Reaproveita-lo faria a pagina seguinte do termo
  /// novo continuar de um lugar da lista velha.
  ///
  /// `null` em [termo] significa *"volte para a lista inteira"*, e nunca "nao
  /// mexer" -- e o contrato de `ControleDeBusca.aoAplicar`.
  void _aplicarBusca(String? termo) {
    if (termo == _termoAplicado) return;
    setState(() {
      _termoAplicado = termo;
      _cursor = null;
    });
    _carregar();
  }

  /// A pagina seguinte, **por cursor**.
  ///
  /// No erro aqui a lista **fica**: o recorte nao mudou, e as conversas na tela
  /// continuam sendo a resposta certa. Apagar tudo porque a segunda pagina nao
  /// chegou seria punir quem rolou mais (`RodapeDaPaginacao`, 11.20).
  ///
  /// **Chamada pela ROLAGEM** (e por [_completarATela]), e nao mais por um
  /// botao. As tres guardas da primeira linha sao o que impede a rolagem
  /// infinita de virar uma rajada: sem `_carregandoMais`, cada quadro de uma
  /// rolada rapida dispararia uma chamada, e dez chamadas voltariam com a mesma
  /// pagina para somar dez vezes na lista. Sem `_carregando`, a rolada que
  /// acontece durante uma busca nova pediria a pagina 2 do recorte antigo.
  Future<void> _carregarMais() async {
    final cursor = _cursor;
    if (cursor == null || _carregandoMais || _carregando) return;
    setState(() {
      _carregandoMais = true;
      _falha = null;
    });
    try {
      final pagina = await _api.listar(cursor: cursor, termo: _termoAplicado);
      if (!mounted) return;
      setState(() {
        _conversas.addAll(pagina.items);
        _cursor = pagina.nextCursor;
        _naoLidas = pagina.unreadCount;
        _total = pagina.total;
        _carregandoMais = false;
      });
      _aposOQuadro();
      widget.aoContarNaoLidas?.call(_naoLidas);
    } on FalhaDeChamada {
      if (!mounted) return;
      setState(() {
        _carregandoMais = false;
        _falha = TextosDasMensagens.naoConseguimosCarregar;
      });
    } on FormatException {
      if (!mounted) return;
      setState(() {
        _carregandoMais = false;
        _falha = TextosDasMensagens.naoConseguimosCarregar;
      });
    }
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(title: const Text(TextosDasMensagens.titulo)),
      body: SafeArea(child: _corpo()),
    );
  }

  /// O campo de busca, para a [BarraDeListagem].
  ///
  /// `AlcanceDaBusca.servidor` porque `q` existe no contrato: declarar
  /// `paginaCarregada` aqui faria o componente escrever na tela que a busca
  /// olha so o que esta carregado -- verdade para um aplicativo que filtrasse
  /// na memoria, e mentira para este.
  ///
  /// `minimoDeCaracteres: 2` e o `minLength` de `ConversationSearch`, e aqui
  /// ele vira estado da lupa: abaixo do piso ela nao habilita, em vez de a
  /// chamada sair e voltar 400 para a tela traduzir.
  ControleDeBusca _controleDeBusca() {
    return ControleDeBusca(
      controlador: _buscaControlador,
      alcance: AlcanceDaBusca.servidor,
      rotulo: TextosDasMensagens.buscarConversa,
      termoAplicado: _termoAplicado,
      minimoDeCaracteres: 2,
      aoAplicar: _aplicarBusca,
    );
  }

  Widget _corpo() {
    if (_carregando) {
      return const Center(child: CircularProgressIndicator());
    }

    final falha = _falha;
    if (_conversas.isEmpty && falha != null) {
      return ListView(
        padding: const EdgeInsets.all(BichuEspaco.e4),
        children: <Widget>[
          FaixaDeAviso(
            texto: falha,
            rotuloDaAcao: MensagensDeErro.tentarDeNovo,
            aoTocarNaAcao: _carregar,
          ),
        ],
      );
    }

    final busca = _controleDeBusca();
    // **A BARRA SO APARECE QUANDO ELA TEM O QUE DESENHAR**, e a decisao e do
    // componente: `desenha` responde falso com zero itens e nenhum recorte
    // aplicado -- buscar o nada e um controle sem desfecho --, e verdadeiro
    // quando a pessoa buscou e nao sobrou nada, que e justamente quando tirar
    // o campo a prenderia no vazio que ela mesma produziu.
    //
    // **Nao ha `filtro:` nem `ordenacao:`**, e a ausencia esta medida no
    // cabecalho deste arquivo: `listConversations` nao declara recorte de lista
    // fechada, e a ordem e uma so.
    final comBarra = BarraDeListagem.desenha(total: _total, busca: busca);

    // A BARRA FICA FORA DA ROLAGEM, e isso e decisao.
    //
    // Ela e o topo do CORPO (o padrao de listagem), e nao a primeira linha da
    // lista: dentro do `ListView` ela sairia da arvore na primeira rolada, e
    // com rolagem infinita a pessoa que rolou vinte linhas teria de rolar as
    // vinte de volta para alcancar a busca que acabou de usar. E tambem o
    // arranjo que `agenda_da_rede.dart` ja usa -- `Column` com o campo fixo
    // acima do conteudo --, e duas listagens com arranjos diferentes seriam
    // duas respostas para a mesma pergunta.
    final barra = comBarra
        ? Padding(
            padding: const EdgeInsets.fromLTRB(
              BichuEspaco.e4,
              BichuEspaco.e2,
              BichuEspaco.e4,
              0,
            ),
            child: BarraDeListagem(
              total: _total,
              busca: busca,
              substantivo: TextosDasMensagens.substantivo,
            ),
          )
        : const SizedBox.shrink();

    if (_conversas.isEmpty) {
      // DOIS VAZIOS DIFERENTES, e a frase diz qual dos dois e. Com termo
      // aplicado a pessoa TEM mensagens: dizer "voce ainda nao tem mensagens"
      // seria afirmar o contrario do que e verdade, e esconderia que o caminho
      // de volta e limpar a busca -- que e o campo que fica logo acima.
      final vazio = _termoAplicado == null
          ? TextosDasMensagens.listaVazia
          : TextosDasMensagens.nadaParaEsteTermo;
      return Column(
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: <Widget>[
          barra,
          Padding(
            padding: const EdgeInsets.all(BichuEspaco.e4),
            child: Text(vazio, style: Theme.of(context).textTheme.bodyLarge),
          ),
        ],
      );
    }

    return Column(
      crossAxisAlignment: CrossAxisAlignment.stretch,
      children: <Widget>[
        barra,
        Expanded(
          child: ListView.separated(
            controller: _rolagem,
            padding: const EdgeInsets.symmetric(vertical: BichuEspaco.e2),
            itemCount: _conversas.length + 1,
            separatorBuilder: (context, i) => const Divider(height: 1),
            itemBuilder: (context, i) {
              if (i == _conversas.length) return _rodape();
              return LinhaDaConversa(conversa: _conversas[i]);
            },
          ),
        ),
      ],
    );
  }

  /// O RODAPE DA ROLAGEM INFINITA. Sem botao.
  ///
  /// Tres estados, e cada um e uma afirmacao diferente:
  ///
  /// - **falha**: a faixa com `Tentar de novo`, apontando para a PAGINA
  ///   SEGUINTE e nao para a primeira. Rolagem infinita que falha em silencio e
  ///   uma lista que simplesmente para de crescer: a pessoa rola, nada vem, e
  ///   nao ha nada na tela dizendo por que nem oferecendo outra tentativa.
  /// - **ha mais**: o giro. Ele e o que diz "vem mais", e aparece tanto durante
  ///   a chamada quanto no instante entre o gatilho e ela.
  /// - **fim**: um respiro, e nada escrito. "Fim da lista" seria texto de apoio,
  ///   e o cliente mandou remove-los em 18/10.
  Widget _rodape() {
    final falha = _falha;
    if (falha != null) {
      return Padding(
        padding: const EdgeInsets.all(BichuEspaco.e4),
        child: FaixaDeAviso(
          texto: falha,
          rotuloDaAcao: MensagensDeErro.tentarDeNovo,
          aoTocarNaAcao: _carregarMais,
        ),
      );
    }
    if (_cursor == null) return const SizedBox(height: BichuEspaco.e4);
    return const Padding(
      padding: EdgeInsets.all(BichuEspaco.e4),
      child: Center(child: CircularProgressIndicator()),
    );
  }
}

/// Uma linha da lista: quem escreveu, o trecho, quando, e a marca de nao lida.
///
/// ## A MARCA DE NAO LIDA VEM DO SERVIDOR
///
/// `Conversa.unread` e lido da resposta, e **nao calculado aqui**. O servidor
/// guarda ate quando cada lado leu (`conversation_reads`, migracao
/// `20261018000014`); o app nao tem esse dado, e se o inventasse dois aparelhos
/// da mesma pessoa divergiriam -- o primeiro a abrir mentiria para o segundo.
///
/// **Abrir a lista NAO apaga esta marca.** "Lido" e o ITEM ABERTO: quem abre a
/// area para de ver o numero no sino e continua vendo QUAL conversa ainda nao
/// leu. Sem essa separacao, uma passada de olho apagaria a unica pista de onde
/// esta o recado -- que e o buraco que esta tela existe para fechar.
///
/// ## A PREVIA JA VEM REDIGIDA, e esta tela nao mexe nela
///
/// `last_message_preview` sai, no servidor, do corpo GRAVADO da ultima
/// mensagem -- que ja passou pela redacao de telefone, e-mail, endereco e link.
/// Esta tela **pinta o texto como veio**: nao corta, nao mascara e nao
/// reescreve. Qualquer tratamento aqui seria uma segunda regra de redacao, e
/// duas regras divergem na primeira que alguem esquecer de atualizar.
class LinhaDaConversa extends StatelessWidget {
  const LinhaDaConversa({required this.conversa, super.key});

  final Conversa conversa;

  /// O PONTO UNICO da marca. Vem do servidor (`Conversation.unread`).
  bool get naoLida => conversa.unread;

  @override
  Widget build(BuildContext context) {
    final cores = BichuColors.of(context).cores;
    final textos = Theme.of(context).textTheme;

    // O outro lado, visto pelo TUTOR. A sessao e quem sabe o papel do
    // chamador, e o contrato nao manda esse campo (e nao deve: seria mais um
    // jeito de ligar a conversa a uma conta). O tutor e o papel de quem usa o
    // app com conta no caminho da plaquinha.
    final outro = conversa.outroLadoVistoPor(PapelNaConversa.tutor);
    final quem = outro?.displayName ?? '';
    final marca = outro?.marcaNeutra ?? '';
    // A conversa encerrada e o unico sinal do lado desabilitado que a tela
    // tem, e ela nao afirma qual dos dois e: ver `TextosDasMensagens`.
    final emLeitura = !conversa.status.aceitaMensagem;
    // A PREVIA DO SERVIDOR primeiro, e o corpo da mensagem carregada como
    // reserva: a LISTA manda `messages: []` e traz `last_message_preview`, e o
    // DETALHE manda as mensagens e tambem a previa. `TrechoDaUltimaMensagem`
    // continua existindo para a segunda vista, e porque e ele que trata uma
    // resposta antiga (versao de servidor sem o campo) sem pintar linha vazia.
    final trecho = conversa.lastMessagePreview ?? TrechoDaUltimaMensagem.de(conversa);
    final quando = conversa.lastMessageAt;
    // O DESTINO DO TOQUE NO ICONE, lido UMA vez e num lugar so: o rotulo
    // acessivel da linha e o do icone dependem do mesmo fato, e duas leituras
    // poderiam discordar entre si no mesmo quadro.
    final porta = outro == null
        ? null
        : PortaDoPerfilDoParticipante.destino(outro);

    return Semantics(
      button: true,
      label: TextosDasMensagens.rotuloDaLinha(
        quem: quem,
        pet: conversa.petDisplayName,
        naoLida: naoLida,
        // O "quando" entra no rotulo acessivel porque ele e informacao da
        // linha, e `excludeSemantics` abaixo colapsa a linha num no so: sem
        // isto, quem usa leitor de tela perderia a hora que quem ve tem.
        quando: quando == null
            ? null
            : QuandoNaLista.de(quando, agora: DateTime.now()),
      ),
      // `excludeSemantics` COLAPSA A LINHA num no so -- mas **nao** quando o
      // icone e um controle de verdade.
      //
      // Com dois destinos na mesma linha (a conversa e o perfil), colapsar
      // esconderia o segundo: quem usa leitor de tela ouviria "Conversa com
      // Marina sobre Tobias" e nao teria como alcancar o perfil, que e o toque
      // que o cliente acabou de pedir. Sem destino, o icone e decorativo e a
      // linha volta a ser um no so -- que e o desenho certo para quatro
      // pedacos de texto sem papel proprio.
      excludeSemantics: porta == null,
      child: InkWell(
        onTap: () =>
            context.push(RotasDeMensagens.conversaDe(conversa.id)),
        child: Padding(
          padding: const EdgeInsets.symmetric(
            horizontal: BichuEspaco.e4,
            vertical: BichuEspaco.e3,
          ),
          child: Row(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: <Widget>[
              // O ICONE DA CONVERSA, e a porta do perfil quando ela existe.
              //
              // `outro` inteiro e nao so a inicial: quem decide o destino e
              // `PortaDoPerfilDoParticipante`, e ela precisa do participante --
              // nao da letra que a tela desenhou dele.
              MarcaNeutraDoParticipante(
                inicial: marca,
                quem: quem,
                desligada: emLeitura,
                participante: outro,
              ),
              const SizedBox(width: BichuEspaco.e3),
              Expanded(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: <Widget>[
                    Text.rich(
                      TextSpan(
                        children: <InlineSpan>[
                          TextSpan(
                            text: quem,
                            style: textos.titleSmall?.copyWith(
                              color: cores.textPrimary,
                            ),
                          ),
                          TextSpan(
                            text: '  ·  ${conversa.petDisplayName}',
                            style: textos.bodySmall?.copyWith(
                              color: cores.textSecondary,
                            ),
                          ),
                        ],
                      ),
                      maxLines: 1,
                      overflow: TextOverflow.ellipsis,
                    ),
                    // O TRECHO SO APARECE QUANDO A RESPOSTA O TRAZ.
                    //
                    // `listConversations` manda `messages: []` em cada item,
                    // por desenho do servidor (evita N+1 na tela que o tutor
                    // abre com o telefone tocando). A linha some em vez de a
                    // tela pedir `getConversation` por linha so para ter a
                    // previa -- ver `TrechoDaUltimaMensagem`.
                    if (trecho != null)
                      Padding(
                        padding: const EdgeInsets.only(top: 2),
                        child: Text(
                          trecho,
                          maxLines: 1,
                          overflow: TextOverflow.ellipsis,
                          style: textos.bodySmall?.copyWith(
                            color: naoLida
                                ? cores.textPrimary
                                : cores.textSecondary,
                            fontWeight: naoLida ? FontWeight.w600 : null,
                          ),
                        ),
                      )
                    else if (emLeitura)
                      Padding(
                        padding: const EdgeInsets.only(top: 2),
                        child: Text(
                          TextosDasMensagens.conversaEncerrada,
                          style: textos.bodySmall?.copyWith(
                            color: cores.textSecondary,
                          ),
                        ),
                      ),
                  ],
                ),
              ),
              if (quando != null || naoLida)
                Padding(
                  padding: const EdgeInsets.only(left: BichuEspaco.e2),
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.end,
                    children: <Widget>[
                      if (quando != null)
                        Text(
                          QuandoNaLista.de(quando, agora: DateTime.now()),
                          style: textos.bodySmall?.copyWith(
                            color: cores.textMuted,
                          ),
                        ),
                      if (naoLida)
                        Container(
                          margin: const EdgeInsets.only(top: BichuEspaco.e2),
                          width: 10,
                          height: 10,
                          decoration: BoxDecoration(
                            color: cores.primary,
                            shape: BoxShape.circle,
                          ),
                        ),
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

/// O ICONE DA CONVERSA: a marca neutra do participante. **Nunca uma foto.**
///
/// O contrato declara em dois lugares que `participants` nao traz foto de
/// perfil, e por isso nao existe caminho neste widget por onde uma imagem
/// chegue: ele recebe uma **letra**. O cabecalho deste arquivo tem a medida
/// inteira, e diz por que o pedido do cliente de 18/10 (*"traga a foto do
/// usuario como icone das conversas"*) nao cabe.
///
/// [desligada] pinta a marca em cinza desligado. E a leitura do pedido do
/// cliente (*"a foto deve trazer um avatar padrao cinza, como se tivesse
/// desabilitado"*) num schema que nao tem foto: o lado desabilitado aparece
/// **despersonalizado**, o que o servidor ja faz devolvendo `Tutor` / `Quem
/// achou`, e a forma acompanha. A tela **nao sabe** se e conta desabilitada ou
/// conversa encerrada, e nao deve saber.
///
/// ---------------------------------------------------------------------------
/// ## O TOQUE, quando ha destino
///
/// Com [participante] e com [PortaDoPerfilDoParticipante.destino] devolvendo um
/// endereco, o icone vira um **controle**: alvo de [alvoDeToque] dp, nome
/// acessivel que diz o que ele ABRE, e `context.push` para o perfil.
///
/// **Sem destino ele continua decorativo**, e isso e decisao e nao fallback: um
/// circulo que se anuncia como botao e nao leva a lugar nenhum e o toque sem
/// desfecho que o criterio 2 da BICHUS-62 proibe. Ver o doc de
/// [PortaDoPerfilDoParticipante], que e onde a medida mora.
class MarcaNeutraDoParticipante extends StatelessWidget {
  const MarcaNeutraDoParticipante({
    required this.inicial,
    required this.quem,
    super.key,
    this.desligada = false,
    this.tamanho = 40,
    this.participante,
  });

  final String inicial;

  /// Para o rotulo acessivel. Nome de exibicao, **nunca id**.
  final String quem;

  final bool desligada;

  final double tamanho;

  /// O outro lado, quando a linha o conhece.
  ///
  /// Nulo nas duas vistas em que nao ha outro lado para abrir: a conversa so
  /// com o sistema, e a resposta de um servidor que nao mandou participante
  /// nenhum. Sem ele nao ha toque -- nao ha para onde ir.
  final ParticipanteDaConversa? participante;

  /// O alvo de toque do icone, em dp.
  ///
  /// **48 e nao 64**, pelo mesmo motivo de `AvatarDaConta` e do gatilho de
  /// filtro da `BarraDeListagem`: o piso de 64 dp do paragrafo 6.5 vale para
  /// superficie critica (o achador, a marcacao de perdido), e o icone de uma
  /// linha de lista nao e uma delas. A marca desenhada continua com [tamanho],
  /// e e o alvo que cresce -- 48 dp esta acima do piso do M3 e do SC 2.5.8.
  static const double alvoDeToque = 48;

  @override
  Widget build(BuildContext context) {
    final cores = BichuColors.of(context).cores;
    final marca = Container(
      width: tamanho,
      height: tamanho,
      alignment: Alignment.center,
      decoration: BoxDecoration(
        color: desligada ? cores.disabledSurface : cores.primaryContainer,
        shape: BoxShape.circle,
      ),
      child: Text(
        inicial.isEmpty ? '·' : inicial,
        style: Theme.of(context).textTheme.titleMedium?.copyWith(
          color: desligada ? cores.onDisabled : cores.primary,
        ),
      ),
    );

    final quemEle = participante;
    final destino = quemEle == null
        ? null
        : PortaDoPerfilDoParticipante.destino(quemEle);
    if (destino == null) {
      return Semantics(
        label: TextosDasMensagens.rotuloDaMarcaNeutra(quem),
        child: ExcludeSemantics(child: marca),
      );
    }

    return Semantics(
      button: true,
      label: TextosDasMensagens.rotuloDaPortaDoPerfil(quem),
      // `excludeSemantics` aqui pelo mesmo motivo da linha: a letra nao diz
      // nada que o rotulo acima nao diga, e anunciada ao lado dele e ruido.
      excludeSemantics: true,
      child: InkWell(
        // `push` e nao `go`: o perfil e uma tela que COBRE a area de mensagens,
        // e voltar dele tem de devolver a lista onde a pessoa estava -- com o
        // termo buscado e as paginas que ela ja rolou. `go` trocaria de ramo e
        // a lista voltaria do zero.
        onTap: () => context.push(destino),
        customBorder: const CircleBorder(),
        child: SizedBox(
          width: alvoDeToque,
          height: alvoDeToque,
          child: Center(child: marca),
        ),
      ),
    );
  }
}
