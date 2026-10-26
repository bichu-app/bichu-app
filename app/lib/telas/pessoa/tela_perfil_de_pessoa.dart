import 'dart:async';

import 'package:flutter/material.dart';

import '../../api/conexoes_api.dart';
import '../../api/falhas.dart';
import '../../api/mensagens_de_erro.dart';
import '../../api/modelos_conexao.dart';
import '../../api/modelos_pessoa.dart';
import '../../api/pessoas_api.dart';
import '../../api/problem.dart';
import '../../api/seguranca_api.dart';
import '../../theme/bichu_colors.dart';
import '../../theme/bichu_tokens.g.dart';
import '../../widgets/arrastar_para_atualizar.dart';
import '../../widgets/botao_primario.dart';
import '../../widgets/convite_para_entrar.dart';
import '../../widgets/faixa_de_aviso.dart';
import '../../widgets/imagem_da_rede.dart';
import '../../widgets/selo_de_validado.dart';
import '../seguranca/menu_do_perfil.dart';

/// **O PERFIL DE OUTRA PESSOA** — a tela que o cliente disse não ter subido
/// ("*a parte do usuário adicionar outras pessoas, ou o perfil do usuário,
/// também não subiu*", 18/10/2026).
///
/// ## O que ela mostra, e a lista é decisão do cliente
///
/// Perguntado em 19/10/2026 o que alguém que **não é conexão** pode ver, ele
/// respondeu, literal: *"ele pode ver nome, quantidade de pets, conexões, mas
/// não as fotos publicadas e nem a timeline do usuário"*. É a emenda 2 do
/// ADR-0010.
///
/// | | Não é conexão | Pedido pendente | Conexão aceita |
/// |---|---|---|---|
/// | nome | vê | vê | vê |
/// | **quantidade** de pets | vê | vê | vê |
/// | **quantidade** de conexões | vê | vê | vê |
/// | fotos da vitrine | **não** | **não** | vê |
/// | denunciar e bloquear | pode | pode | pode |
///
/// **"Conexões" é a CONTAGEM e não a lista**, e a leitura está declarada na
/// emenda: a lista não aparece a ninguém, nem ao dono (plano 4-B), não existe
/// `GET /connections` e expor a rede de alguém a um estranho não foi pedido.
/// Está no relatório da entrega como pendência de confirmação com ele.
///
/// **A quantidade de pets é NÚMERO, e não um atalho.** Não há nome de pet, não
/// há miniatura e não há toque que leve a um pet: o item 7 do ADR-0010 proíbe
/// *"outros pets do mesmo tutor, e qualquer coisa que permita agrupá-los"*, e a
/// emenda abriu a **contagem**. O modelo desta tela não carrega atributo de pet
/// nenhum — não é disciplina de quem desenha, é o tipo.
///
/// **Não há timeline, não há publicação e não há curtida.** Não existem no
/// produto: a migração `20261018000030` registra *"uma timeline de quem você
/// segue É a lista de presença com hora... Encerrado, não se reabre"*.
///
/// **Não há cidade e não há bairro.** Ele não mencionou nenhum dos dois.
///
/// ## A DENÚNCIA NÃO É NOVA, E É POR ISSO QUE ELA ESTÁ AQUI
///
/// [MenuDoPerfil] já existia em `telas/seguranca/` desde 18/10 e **nunca teve
/// hospedeiro**: ele foi escrito para *"o ⋮ da barra do perfil"* de uma tela que
/// não existia. Esta tela é essa barra. Nada de moderação foi criado aqui —
/// nenhum filtro de palavra, nenhuma segunda folha de motivos, nenhuma lista de
/// denúncia —, e o motivo é decisão do cliente: o modelo é mínimo e **quem
/// modera é o administrador, no backoffice**.
///
/// ## A PORTA DE PEDIR CONEXÃO, e o que mudou em 20/10/2026
///
/// **O parágrafo que estava aqui dizia o contrário do que o código faz hoje, e
/// foi corrigido em vez de deixado contradizendo o método ao lado.** Ele dizia
/// que `POST /connections` recebe *"um token de convite, nunca um apelido"*, e
/// que por isso o botão só existia com um convite na mão. As duas frases
/// deixaram de valer: o cliente reverteu aquela recusa junto com a busca de
/// pessoas, e `ConnectionInvite` passou a ser um `oneOf` de **uma** das duas
/// credenciais.
///
/// Hoje o botão **aparece sempre que a permissão da comunidade permite**, e o
/// que varia é a credencial que ele manda:
///
/// - **com** [tokenDoConvite] — quem chegou pelo QR de convite de alguém —, ele
///   manda o token, e o servidor grava procedência `invite_link`;
/// - **sem** token — quem chegou pela aba `Usuários` ou por um link interno —,
///   ele manda o **apelido**, e a procedência é `people_search`.
///
/// **O que a reversão não comprou**, e é o que impede isto de virar um oráculo:
/// apelido inexistente, apelido de pet, apelido reservado, conta desabilitada,
/// quem bloqueou quem pede e perfil que quem pede denunciou respondem o **mesmo
/// 404**, fundidos na cláusula `WHERE`. Esta tela não distingue qual dos seis
/// foi, e não tem como.
///
/// A porta respeita a **mesma** regra das outras ações de comunidade
/// ([podeAgirNaComunidade]): sessão **e** e-mail verificado, como em
/// `podeCriarNaComunidade`. Política nova não foi inventada.
///
/// ## O 404 é ambíguo, e a tela não tenta desfazer a ambiguidade
///
/// Pessoa inexistente, apelido de pet, conta desabilitada, par bloqueado e
/// perfil que esta pessoa denunciou: o **mesmo** 404 (ADR-0021, nunca 403). A
/// tela diz [naoEncontramos] e oferece voltar. É a mesma frase que
/// `MenuDoPerfil.aoPerderOAlvo` já usava, pela mesma razão: descobrir que foi
/// bloqueado é o que gera retaliação.
class TelaDePerfilDePessoa extends StatefulWidget {
  const TelaDePerfilDePessoa({
    required this.apelido,
    required this.pessoas,
    required this.conexoes,
    required this.seguranca,
    super.key,
    this.podeAgirNaComunidade = false,
    this.tokenDoConvite,
  });

  /// O apelido, **sem o `@`**: o `@` é símbolo de leitura.
  final String apelido;

  final PessoasApi pessoas;

  /// A porta das conexões. É dela que saem aceitar, recusar, cancelar, desfazer
  /// e — com um convite na mão — pedir.
  final ConexoesApi conexoes;

  /// A porta de denunciar e bloquear, entregue a [MenuDoPerfil].
  final SegurancaApi seguranca;

  /// Sessão **e** e-mail verificado, como `podeCriarNaComunidade`. Pedir
  /// conexão é ação de comunidade, e a porta é a mesma.
  final bool podeAgirNaComunidade;

  /// O **token de convite**, quando quem abriu esta tela tem um. Nulo não
  /// desenha a porta de pedir.
  final String? tokenDoConvite;

  /// **O TÍTULO DA BARRA DE TOPO DESTA TELA É A PALAVRA `Perfil`**, e não o
  /// nome da pessoa (cliente, 23/10/2026).
  ///
  /// Palavras dele, literais: *"a barra principal fica perfil e logo abaixo o
  /// titulo da pagina fica o nome do usuário do jeito que esta atualmente. Me
  /// refiro na pagina que outro usuário acessa, que mostra a vitrine com as
  /// publicações do usuário."*
  ///
  /// **A SEGUNDA METADE DO PEDIDO JÁ ESTAVA FEITA, e isso foi medido antes de
  /// mexer em qualquer coisa.** O nome já era o primeiro elemento do corpo —
  /// [NomeComSelo] em `titleLarge`, logo abaixo da barra (ver [_corpo]) —,
  /// desde a fatia G desta tela. O que havia de errado era o nome aparecer
  /// **duas vezes**: na barra e no corpo. Então o conserto é de um lado só, a
  /// barra, e o *"do jeito que esta atualmente"* dele é cumprido por não se
  /// tocar no nome do corpo: ele continua exatamente o que era, com o mesmo
  /// estilo e o mesmo selo.
  ///
  /// **ISTO NÃO ALCANÇA A TELA DA PRÓPRIA CONTA, e a separação é estrutural e
  /// não disciplina.** A seção `Perfil` do dono é `AbaPerfil`
  /// (`telas/abas.dart`), que monta a barra por `TelaDeAba`
  /// (`telas/casca_com_abas.dart`) e tira o título de `tituloDaTelaDaConta` —
  /// outro arquivo, outro widget, outra função. Esta tela monta um `Scaffold`
  /// e um `AppBar` próprios e **não usa `TelaDeAba`**: não há parâmetro a
  /// passar porque não há componente compartilhado entre as duas barras. A
  /// decisão do cliente de 19/10 (*"a tela do usuario, deve ter como titulo da
  /// pagina na barra principal o slug do usuario"*) continua valendo intacta,
  /// e quem a cobra é
  /// `test/telas/navegacao_mensagens_e_avatar_test.dart` — que afirma
  /// `findsNothing` para a palavra `Perfil` no `AppBar` **daquela** tela.
  static const String tituloDaBarra = 'Perfil';

  static const String naoEncontramos = 'Não encontramos este usuário.';
  static const String falhaAoCarregar = 'Não conseguimos carregar este perfil agora.';
  static const String falhaAoAgir = 'Não conseguimos registrar isso agora.';
  static const String pedirConexao = 'Pedir conexão';
  static const String aceitar = 'Aceitar';
  static const String recusar = 'Recusar';
  static const String cancelarPedido = 'Cancelar pedido';
  static const String desfazerConexao = 'Desfazer conexão';
  static const String pedidoEnviado = 'Pedido enviado. Ela decide quando responder.';
  static const String pedidoRecebido = 'Este usuário quer se conectar com você.';

  // A LINHA `Vocês estão conectados.` SAIU (cliente, 22/10/2026): *"Retire o
  // texto vocês estão conectados."*
  //
  // **Ela nao era pedido dele**, e isto foi conferido antes de apagar: ela
  // nasceu com a fatia G do perfil de terceiro (`108b6832`), que cita o
  // cliente sobre O QUE SE VE no perfil de quem nao e conexao -- nunca sobre
  // esta frase. Nao ha decisao dele sendo desfeita aqui.
  //
  // **E o estado continua dito, por quem nao e texto de apoio.** O ramo
  // `EstadoDaConexao.conectado` desenha `Desfazer conexão`, e so quem **é**
  // conexao ve esse botao: a acao afirma o vinculo melhor que a frase, porque
  // ela tambem o resolve. O que saiu foi a linha que repetia em palavras o que
  // o botao abaixo dela ja dizia.

  /// **A frase do estado de estranho**, e ela diz o que falta e não o que é
  /// proibido: a vitrine não é um recurso bloqueado, é uma coisa que a conexão
  /// abre. Sem esta linha a tela terminaria em branco embaixo das contagens, e a
  /// pessoa não saberia que há mais ali.
  static const String fotosSoParaConexao = 'As fotos aparecem para quem é conexão.';

  /// O vazio de quem **é** conexão. Diferente da frase acima de propósito: uma
  /// diria "você não pode ver" para quem pode.
  static const String conexaoSemFoto = 'Este usuário ainda não publicou fotos.';

  /// O lado da célula, em dp — **o mesmo da vitrine do dono**, e por isso a
  /// mesma derivada de 320 px serve: 104 dp dão 312 px reais a 3x.
  static const double ladoDaCelula = 104;
  static const double vaoDaGrade = 2;

  /// O rótulo da contagem de pets. Plural tratado porque "1 pets" é o tipo de
  /// detalhe que faz uma tela parecer inacabada.
  static String rotuloDePets(int quantos) => quantos == 1 ? '1 pet' : '$quantos pets';

  static String rotuloDeConexoes(int quantas) =>
      quantas == 1 ? '1 conexão' : '$quantas conexões';

  @override
  State<TelaDePerfilDePessoa> createState() => _EstadoDoPerfilDePessoa();
}

class _EstadoDoPerfilDePessoa extends State<TelaDePerfilDePessoa> {
  PerfilDePessoa? _perfil;
  bool _carregando = true;
  bool _perdeuOAlvo = false;
  String? _falha;

  /// A falha foi **falta de conta**, e nao defeito. Ver [faltaConta].
  ///
  /// Separado de [_falha] porque os dois desenham coisas diferentes, e porque
  /// o que esta tela desenhava para o 401 era o defeito de 19/10 inteiro: o
  /// catalogo devolve `texto: ''` para `unauthenticated` desde 18/10, entao a
  /// faixa saia com o icone de ERRO, NENHUMA frase e um `Tentar de novo` ao
  /// lado -- e tentar de novo sai igualmente sem conta.
  bool _faltaConta = false;
  bool _agindo = false;

  @override
  void initState() {
    super.initState();
    unawaited(_carregar());
  }

  Future<void> _carregar() async {
    setState(() {
      _carregando = true;
      _falha = null;
      _faltaConta = false;
    });
    try {
      final perfil = await widget.pessoas.perfil(widget.apelido);
      if (!mounted) return;
      setState(() {
        _perfil = perfil;
        _carregando = false;
        _perdeuOAlvo = false;
      });
    } on FalhaDeChamada catch (falha) {
      if (!mounted) return;
      setState(() {
        _carregando = false;
        // **404 NÃO é "falha de rede"**, e misturar os dois daria um botão de
        // "tentar de novo" para uma pessoa que não existe — a tela ficaria
        // tentando em laço. O 404 é um desfecho; o resto é uma falha.
        if (falha is FalhaDaApi && falha.tipo == ProblemTipo.naoEncontrado) {
          _perdeuOAlvo = true;
          _perfil = null;
        } else if (faltaConta(falha)) {
          // SEM CONTA NAO E ERRO. Decidido pelo `next_action` do corpo, e nao
          // pelo status. Ver `widgets/convite_para_entrar.dart`.
          _faltaConta = true;
          _perfil = null;
        } else {
          _falha = MensagensDeErro.de(falha).texto;
        }
      });
    }
  }

  Future<void> _agir(Future<void> Function() acao) async {
    if (_agindo) return;
    setState(() {
      _agindo = true;
      _falha = null;
    });
    try {
      await acao();
      if (!mounted) return;
      setState(() => _agindo = false);
      // **Recarrega em vez de adivinhar o estado novo.** Quem decide o estado é
      // o servidor (o teto de 150, o descanso de 90 dias, uma corrida com a
      // outra pessoa), e uma tela que escrevesse o próximo estado por conta
      // própria mostraria "conectados" sobre um pedido que foi recusado.
      await _carregar();
    } on FalhaDeChamada catch (falha) {
      if (!mounted) return;
      setState(() {
        _agindo = false;
        if (falha is FalhaDaApi && falha.tipo == ProblemTipo.naoEncontrado) {
          _perdeuOAlvo = true;
          _perfil = null;
          return;
        }
        // A SESSAO CAIU NO MEIO DA ACAO. O corpo do perfil ja esta na tela, e
        // ele e que sai: a pessoa nao pode aceitar nem recusar nada sem conta,
        // e deixar os botoes de pe com uma faixa vazia em cima e o defeito que
        // este campo existe para fechar.
        if (faltaConta(falha)) {
          _faltaConta = true;
          _perfil = null;
          return;
        }
        _falha = MensagensDeErro.de(falha).texto;
      });
    }
  }

  @override
  Widget build(BuildContext context) {
    final cores = BichuColors.of(context).cores;
    final textos = Theme.of(context).textTheme;
    final perfil = _perfil;

    return Scaffold(
      appBar: AppBar(
        // **`Perfil`, e não o nome da pessoa** (cliente, 23/10/2026). O nome é
        // o título da PÁGINA, logo abaixo desta barra, e quem o pinta é
        // `NomeComSelo` no topo de `_corpo` — onde ele já estava. Ver
        // [TelaDePerfilDePessoa.tituloDaBarra] para o pedido inteiro e para a
        // razão pela qual isto não alcança a tela da própria conta.
        title: const Text(TelaDePerfilDePessoa.tituloDaBarra),
        actions: <Widget>[
          // **O "⋮" EM TODOS OS ESTADOS DO PERFIL**, menos quando não há alvo:
          // sem `public_ref` não há a quem endereçar denúncia nem bloqueio, e
          // um menu que abrisse sem alvo seria um controle que falha no toque.
          if (perfil != null)
            MenuDoPerfil(
              refDaPessoa: perfil.publicRef,
              api: widget.seguranca,
              // Depois de denunciar, o servidor **oculta** este perfil para
              // quem denunciou — a próxima leitura responde 404. Então a tela
              // não recarrega: ela passa ao estado de alvo perdido, que é o que
              // de fato aconteceu.
              aoPerderOAlvo: () => setState(() {
                _perdeuOAlvo = true;
                _perfil = null;
              }),
              aoMudarOBloqueio: (_) => unawaited(_carregar()),
            ),
        ],
      ),
      // ACHADO DA MESCLA DE 19/10/2026: era `RefreshIndicator` cru.
      //
      // A frente `estado-deslogado-nas-secoes` trouxe o ponto unico do gesto
      // (`widgets/arrastar_para_atualizar.dart`) e o portao
      // `nenhuma tela usa RefreshIndicator cru`, que le `lib/` do disco. Esta
      // tela nasceu noutra frente, com o indicador colado dentro, e as duas
      // nao se cruzam em nenhuma linha -- o git mesclou sem conflito e o
      // portao reprovou sobre a UNIAO. A conversao e a mesma que
      // `tela_pedidos_de_conexao.dart` recebeu em 18/10.
      body: ArrastarParaAtualizar(
        aoAtualizar: _carregar,
        child: ListView(
          padding: const EdgeInsets.all(BichuEspaco.e4),
          children: <Widget>[
            if (_falha != null) ...<Widget>[
              FaixaDeAviso(
                texto: _falha as String,
                rotuloDaAcao: 'Tentar de novo',
                aoTocarNaAcao: () => unawaited(_carregar()),
              ),
              const SizedBox(height: BichuEspaco.e4),
            ],
            // SEM CONTA VEM PRIMEIRO, e os dois estados sao exclusivos por
            // construcao: `_carregar` liga UM dos dois, e uma acao so pode
            // falhar com o perfil carregado -- que e justamente quando
            // `_perdeuOAlvo` e falso. A ordem esta escrita para o dia em que
            // alguem acrescentar um terceiro caminho: sem conta o servidor
            // nao chegou a dizer se o alvo existe, e afirmar `nao
            // encontramos` seria a tela contando o que nao mediu.
            if (_faltaConta)
              const ConviteParaEntrar(secao: SecaoComConta.paginaDaPessoa)
            else if (_perdeuOAlvo)
              _semAlvo(cores, textos)
            else if (_carregando && perfil == null)
              const Center(
                child: Padding(
                  padding: EdgeInsets.all(BichuEspaco.e8),
                  child: CircularProgressIndicator(),
                ),
              )
            else if (perfil != null)
              ..._corpo(perfil, cores, textos),
          ],
        ),
      ),
    );
  }

  /// O estado de alvo perdido. **Uma frase e uma saída**, e nenhuma explicação
  /// do motivo: os cinco motivos do 404 são indistinguíveis de propósito.
  Widget _semAlvo(BichuCores cores, TextTheme textos) {
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: <Widget>[
        Text(
          TelaDePerfilDePessoa.naoEncontramos,
          style: textos.bodyLarge?.copyWith(color: cores.textPrimary),
        ),
        const SizedBox(height: BichuEspaco.e4),
        BotaoSecundario(
          rotulo: 'Voltar',
          aoTocar: () => Navigator.of(context).maybePop(),
        ),
      ],
    );
  }

  List<Widget> _corpo(PerfilDePessoa perfil, BichuCores cores, TextTheme textos) {
    return <Widget>[
      // O NOME, no corpo e não só na barra: a barra corta em telas estreitas, e
      // o nome é a primeira das três coisas que o cliente liberou.
      //
      // **E É AQUI QUE O SELO DE VALIDADO ENTRA, e não no título da barra** —
      // emenda do ADR-0010 de 21/10/2026. A razão é a mesma frase acima: a barra
      // corta em telas estreitas, e um selo lá custaria 24 dp de um orçamento
      // que já é o mais apertado da tela. No corpo o nome tem a largura inteira
      // menos as margens, e é `NomeComSelo` que resolve a disputa — o nome
      // encolhe com `…` e o selo fica.
      NomeComSelo(
        nome: perfil.nomeParaLer,
        comSelo: perfil.canalConfirmado,
        estilo: textos.titleLarge?.copyWith(color: cores.textPrimary),
      ),
      const SizedBox(height: BichuEspaco.e1),
      // O apelido embaixo do nome, porque é o endereço dela — e é ele que uma
      // pessoa repete para outra. Quando o nome é nulo, `nomeParaLer` já é o
      // apelido, e esta linha não repete.
      if (perfil.displayName != null && perfil.displayName!.trim().isNotEmpty)
        Text(
          '@${perfil.handle}',
          style: textos.bodyMedium?.copyWith(color: cores.textSecondary),
        ),
      const SizedBox(height: BichuEspaco.e4),
      _contagens(perfil, cores, textos),
      const SizedBox(height: BichuEspaco.e6),
      ..._acoesDaRelacao(perfil, cores, textos),
      const SizedBox(height: BichuEspaco.e6),
      _vitrine(perfil, cores, textos),
    ];
  }

  /// As DUAS contagens, lado a lado. **Texto, e não controle**: nenhuma das duas
  /// é tocável, porque não há para onde ir — a lista de pets e a lista de
  /// conexões não existem para terceiro, e um toque que não leva a nada é pior
  /// do que nenhum.
  Widget _contagens(PerfilDePessoa perfil, BichuCores cores, TextTheme textos) {
    final estilo = textos.bodyLarge?.copyWith(color: cores.textPrimary);
    return Semantics(
      // Um rótulo só para as duas: o leitor de tela anuncia a linha inteira em
      // vez de parar duas vezes em dois números sem contexto.
      label:
          '${TelaDePerfilDePessoa.rotuloDePets(perfil.petsCount)}, '
          '${TelaDePerfilDePessoa.rotuloDeConexoes(perfil.connectionsCount)}',
      child: ExcludeSemantics(
        child: Row(
          children: <Widget>[
            Text(TelaDePerfilDePessoa.rotuloDePets(perfil.petsCount), style: estilo),
            Padding(
              padding: const EdgeInsets.symmetric(horizontal: BichuEspaco.e2),
              child: Text('·', style: estilo),
            ),
            Text(TelaDePerfilDePessoa.rotuloDeConexoes(perfil.connectionsCount), style: estilo),
          ],
        ),
      ),
    );
  }

  /// A área de ação, **uma por estado**.
  List<Widget> _acoesDaRelacao(
    PerfilDePessoa perfil,
    BichuCores cores,
    TextTheme textos,
  ) {
    final ref = perfil.connectionRef;

    switch (perfil.connectionState) {
      case EstadoDaConexao.pedidoRecebido:
        return <Widget>[
          _linhaDeEstado(TelaDePerfilDePessoa.pedidoRecebido, cores, textos),
          const SizedBox(height: BichuEspaco.e3),
          BotaoPrimario(
            rotulo: TelaDePerfilDePessoa.aceitar,
            carregando: _agindo,
            aoTocar: ref == null ? null : () => unawaited(_agir(() => widget.conexoes.aceitar(ref))),
          ),
          const SizedBox(height: BichuEspaco.e2),
          // **Recusar e desfazer são a MESMA operação** (`DELETE`), e o app não
          // diz qual: a semântica é derivada do estado no servidor. A resposta é
          // 204 sem corpo, e é isso que mantém a recusa silenciosa — não há nada
          // para a tela da outra pessoa ler que diga "ela recusou você".
          BotaoSecundario(
            rotulo: TelaDePerfilDePessoa.recusar,
            carregando: _agindo,
            aoTocar: ref == null ? null : () => unawaited(_agir(() => widget.conexoes.encerrar(ref))),
          ),
        ];

      case EstadoDaConexao.pedidoEnviado:
        return <Widget>[
          _linhaDeEstado(TelaDePerfilDePessoa.pedidoEnviado, cores, textos),
          const SizedBox(height: BichuEspaco.e3),
          BotaoSecundario(
            rotulo: TelaDePerfilDePessoa.cancelarPedido,
            carregando: _agindo,
            aoTocar: ref == null ? null : () => unawaited(_agir(() => widget.conexoes.encerrar(ref))),
          ),
        ];

      case EstadoDaConexao.conectado:
        // **SEM LINHA DE ESTADO**, e a ausencia e pedido do cliente de
        // 22/10/2026 (ver a nota de `Vocês estão conectados.` no cabecalho).
        // O botao e o primeiro elemento deste ramo agora, e nao ha vao antes
        // dele: o `SizedBox` que ficava aqui separava a frase do botao, e sem
        // a frase ele seria recuo no topo do bloco.
        return <Widget>[
          BotaoSecundario(
            rotulo: TelaDePerfilDePessoa.desfazerConexao,
            carregando: _agindo,
            aoTocar: ref == null ? null : () => unawaited(_agir(() => widget.conexoes.encerrar(ref))),
          ),
        ];

      case null:
        // SEM RELAÇÃO. **A porta de pedir deixou de depender de um convite na
        // mão em 20/10/2026**, e o parágrafo do cabeçalho que a condicionava ao
        // token foi corrigido junto, e não deixado aqui contradizendo o código.
        // Ela continua condicionada à mesma permissão das outras ações da
        // comunidade.
        if (!widget.podeAgirNaComunidade) return const <Widget>[];
        final convite = widget.tokenDoConvite;
        return <Widget>[
          BotaoPrimario(
            rotulo: TelaDePerfilDePessoa.pedirConexao,
            carregando: _agindo,
            aoTocar: () => unawaited(
              _agir(() async {
                // **A CREDENCIAL É UMA DAS DUAS, e a tela sabe qual tem.** O
                // `oneOf` do contrato recusa corpo com as duas e corpo com
                // nenhuma, e é por isso que há dois métodos em `ConexoesApi` e
                // não um com dois parâmetros anuláveis.
                //
                // **O token GANHA quando existe**, e a escolha não é
                // indiferente: é ele que o servidor grava como procedência
                // (`invite_link` contra `people_search`). Mandar o apelido de
                // quem chegou por um convite registraria uma busca que não
                // houve.
                //
                // `idempotencyKey` é obrigatória: um reenvio da mesma tentativa
                // não pode virar um segundo pedido na caixa da outra pessoa. A
                // chave sai da CREDENCIAL e não de um sorteio por toque — dois
                // toques no mesmo botão são a mesma tentativa. E ela é
                // prefixada pela credencial para a mesma pessoa alcançada pelos
                // dois caminhos não dividir uma chave só.
                if (convite != null) {
                  await widget.conexoes.pedir(
                    tokenDoConvite: convite,
                    idempotencyKey: 'conexao-convite-$convite',
                  );
                  return;
                }
                await widget.conexoes.pedirPorApelido(
                  apelido: widget.apelido,
                  idempotencyKey: 'conexao-apelido-${widget.apelido}',
                );
              }),
            ),
          ),
        ];
    }
  }

  Widget _linhaDeEstado(String frase, BichuCores cores, TextTheme textos) {
    return Text(frase, style: textos.bodyMedium?.copyWith(color: cores.textSecondary));
  }

  /// A VITRINE. **Três estados, e os três são diferentes**: fora de alcance,
  /// conexão sem foto, e a grade.
  Widget _vitrine(PerfilDePessoa perfil, BichuCores cores, TextTheme textos) {
    final fotos = perfil.vitrine;

    // `null` é "você não pode ver" — a chave nem veio na resposta. A frase diz o
    // que a conexão abre, e não o que está proibido.
    if (fotos == null) {
      return _recado(TelaDePerfilDePessoa.fotosSoParaConexao, cores, textos);
    }
    // `[]` é "esta conexão não publicou nada". Frase diferente de propósito: a
    // de cima diria "você não pode ver" para quem pode.
    if (fotos.isEmpty) {
      return _recado(TelaDePerfilDePessoa.conexaoSemFoto, cores, textos);
    }

    return GridView.builder(
      // `shrinkWrap` porque a grade mora dentro de um `ListView`: duas áreas de
      // rolagem encaixadas é o que faz o gesto da pessoa ir para a errada.
      shrinkWrap: true,
      physics: const NeverScrollableScrollPhysics(),
      padding: EdgeInsets.zero,
      itemCount: fotos.length,
      gridDelegate: const SliverGridDelegateWithMaxCrossAxisExtent(
        maxCrossAxisExtent: TelaDePerfilDePessoa.ladoDaCelula,
        mainAxisSpacing: TelaDePerfilDePessoa.vaoDaGrade,
        crossAxisSpacing: TelaDePerfilDePessoa.vaoDaGrade,
        childAspectRatio: 1,
      ),
      itemBuilder: (context, indice) => _celula(fotos[indice]),
    );
  }

  Widget _recado(String frase, BichuCores cores, TextTheme textos) {
    return Container(
      width: double.infinity,
      padding: const EdgeInsets.all(BichuEspaco.e4),
      decoration: BoxDecoration(
        color: cores.surfaceSunken,
        borderRadius: BorderRadius.circular(BichuRaio.lg),
        border: Border.all(color: cores.outline, width: BichuBorda.hairline),
      ),
      child: Text(
        frase,
        textAlign: TextAlign.center,
        style: textos.bodyMedium?.copyWith(color: cores.textSecondary),
      ),
    );
  }

  /// Uma célula da grade.
  ///
  /// **`ImagemDaRede`, e nunca `Image.network` cru.** Ela faz as duas coisas que
  /// decidem o peso desta tela — `cacheWidth` pela largura que a célula
  /// realmente pinta, e `errorBuilder` sempre. A medição que motivou a regra:
  /// 88 MiB numa página sem `cacheWidth` contra 2,15 MiB com ele.
  ///
  /// **`gridUrl` e nunca `openUrl`**: a derivada de 1024 px é 1,6x mais dado do
  /// que a célula pinta, e a grade desenha até nove de uma vez.
  Widget _celula(FotoDoPerfil foto) {
    return ImagemDaRede(
      url: foto.gridUrl,
      descricao: foto.altText,
      raio: BichuRaio.sm,
      // O retrato de uma pessoa falhando pede outro desenho que uma fachada
      // falhando, e é por isso que este símbolo é parâmetro.
      simboloDeFalha: Icons.photo_outlined,
    );
  }
}
