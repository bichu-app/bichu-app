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
/// ## O padrao de listagem, e a excecao que o cliente abriu
///
/// Sem busca, sem filtro e sem ordenacao: nao ha o que recortar numa lista de
/// conversas, e um campo de busca aqui seria controle sem funcao. **Sem texto
/// de apoio** -- o cliente mandou removê-los em 18/10 --, e por isso a lista
/// vazia e **uma linha** e nada mais.
///
/// ## NENHUM AVATAR DE FOTO
///
/// Ver `api/modelos_conversa.dart`: o contrato declara em dois lugares que
/// `participants` **nunca** traz foto de perfil. A marca e a inicial do nome,
/// igual para os dois lados, e o lado despersonalizado (`Tutor` / `Quem
/// achou`) ganha a marca em cinza desligado -- forma, nao dado novo.
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
import '../../widgets/faixa_de_aviso.dart';
import '../../widgets/botao_primario.dart';
import '../../widgets/convite_para_entrar.dart';

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

  static const String carregarMais = 'Carregar mais conversas';

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

  ConversasApi get _api =>
      widget.conversas ?? ConversasApi(Escopo.of(context).api);
  String? _cursor;
  bool _carregando = true;
  bool _carregandoMais = false;
  String? _falha;

  /// A falha foi **falta de conta**, e nao defeito. Ver [faltaConta].
  bool _faltaConta = false;

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
    WidgetsBinding.instance.addPostFrameCallback((_) => _carregar());
  }

  Future<void> _carregar() async {
    setState(() {
      _carregando = true;
      _falha = null;
      _faltaConta = false;
    });
    try {
      final pagina = await _api.listar();
      if (!mounted) return;
      setState(() {
        _conversas
          ..clear()
          ..addAll(pagina.items);
        _cursor = pagina.nextCursor;
        _naoLidas = pagina.unreadCount;
        _carregando = false;
      });
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
    } on FalhaDeChamada catch (falha) {
      // A lista anterior e LIMPADA na primeira pagina, como as outras
      // listagens do app: a pessoa veria o resultado antigo como se fosse o
      // novo. O texto diz o que fazer.
      //
      // **O 401 NAO E UMA DESTAS FALHAS.** Esta tela nem consultava o
      // catalogo de `MensagensDeErro`: ela escrevia a propria frase, e a
      // frase manda `Toque em Tentar de novo` -- um conselho impossivel de
      // seguir sem conta, porque a tentativa seguinte sai igualmente sem
      // `Authorization`. Medido: `/v1/conversations` responde
      // `401 unauthenticated` com `next_action: sign_in`.
      if (!mounted) return;
      setState(() {
        _conversas.clear();
        _carregando = false;
        _faltaConta = faltaConta(falha);
        _falha = _faltaConta ? null : TextosDasMensagens.naoConseguimosCarregar;
      });
    } on FormatException {
      if (!mounted) return;
      setState(() {
        _conversas.clear();
        _carregando = false;
        _falha = TextosDasMensagens.naoConseguimosCarregar;
      });
    }
  }

  /// A pagina seguinte, **por cursor**.
  ///
  /// No erro aqui a lista **fica**: o recorte nao mudou, e as conversas na tela
  /// continuam sendo a resposta certa. Apagar tudo porque a segunda pagina nao
  /// chegou seria punir quem rolou mais (`RodapeDaPaginacao`, 11.20).
  Future<void> _carregarMais() async {
    final cursor = _cursor;
    if (cursor == null || _carregandoMais) return;
    setState(() {
      _carregandoMais = true;
      _falha = null;
    });
    try {
      final pagina = await _api.listar(cursor: cursor);
      if (!mounted) return;
      setState(() {
        _conversas.addAll(pagina.items);
        _cursor = pagina.nextCursor;
        _naoLidas = pagina.unreadCount;
        _carregandoMais = false;
      });
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

  Widget _corpo() {
    if (_carregando) {
      return const Center(child: CircularProgressIndicator());
    }

    // SEM CONTA NAO E ERRO, e vem antes de tudo: nao ha lista para mostrar,
    // nao ha `Tentar de novo` que funcione, e o que a pessoa precisa saber e
    // o que esta secao e.
    if (_faltaConta) {
      return ListView(
        padding: const EdgeInsets.all(BichuEspaco.e4),
        children: const <Widget>[
          ConviteParaEntrar(secao: SecaoComConta.mensagens),
        ],
      );
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

    if (_conversas.isEmpty) {
      // A LISTA VAZIA E UMA LINHA. Sem titulo, sem ilustracao e sem texto de
      // apoio: o cliente mandou remover os textos de apoio em 18/10.
      return Padding(
        padding: const EdgeInsets.all(BichuEspaco.e4),
        child: Text(
          TextosDasMensagens.listaVazia,
          style: Theme.of(context).textTheme.bodyLarge,
        ),
      );
    }

    return ListView.separated(
      padding: const EdgeInsets.symmetric(vertical: BichuEspaco.e2),
      itemCount: _conversas.length + 1,
      separatorBuilder: (context, i) => const Divider(height: 1),
      itemBuilder: (context, i) {
        if (i == _conversas.length) return _rodape();
        return LinhaDaConversa(conversa: _conversas[i]);
      },
    );
  }

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
    return Padding(
      padding: const EdgeInsets.all(BichuEspaco.e4),
      child: BotaoSecundario(
        rotulo: TextosDasMensagens.carregarMais,
        aoTocar: _carregarMais,
        carregando: _carregandoMais,
      ),
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
      // `excludeSemantics` para a linha ser UM controle para o leitor de tela,
      // com o rotulo acima -- e nao quatro nos soltos sem papel.
      excludeSemantics: true,
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
              MarcaNeutraDoParticipante(
                inicial: marca,
                quem: quem,
                desligada: emLeitura,
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

/// A MARCA NEUTRA do participante. **Nunca uma foto.**
///
/// O contrato declara em dois lugares que `participants` nao traz foto de
/// perfil, e por isso nao existe caminho neste widget por onde uma imagem
/// chegue: ele recebe uma **letra**.
///
/// [desligada] pinta a marca em cinza desligado. E a leitura do pedido do
/// cliente (*"a foto deve trazer um avatar padrao cinza, como se tivesse
/// desabilitado"*) num schema que nao tem foto: o lado desabilitado aparece
/// **despersonalizado**, o que o servidor ja faz devolvendo `Tutor` / `Quem
/// achou`, e a forma acompanha. A tela **nao sabe** se e conta desabilitada ou
/// conversa encerrada, e nao deve saber.
class MarcaNeutraDoParticipante extends StatelessWidget {
  const MarcaNeutraDoParticipante({
    required this.inicial,
    required this.quem,
    super.key,
    this.desligada = false,
    this.tamanho = 40,
  });

  final String inicial;

  /// Para o rotulo acessivel. Nome de exibicao, **nunca id**.
  final String quem;

  final bool desligada;

  final double tamanho;

  @override
  Widget build(BuildContext context) {
    final cores = BichuColors.of(context).cores;
    return Semantics(
      label: TextosDasMensagens.rotuloDaMarcaNeutra(quem),
      child: ExcludeSemantics(
        child: Container(
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
        ),
      ),
    );
  }
}
