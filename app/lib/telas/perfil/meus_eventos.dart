import 'package:flutter/material.dart';

import '../../api/api_client.dart';
import '../../api/falhas.dart';
import '../../api/mensagens_de_erro.dart';
import '../../api/modelos_rede.dart';
import '../../api/rede_api.dart';
import '../../escopo.dart';
import '../../theme/bichu_colors.dart';
import '../../theme/bichu_tokens.g.dart';
import '../../widgets/arrastar_para_atualizar.dart';
import '../../widgets/convite_para_entrar.dart';
import '../../widgets/faixa_de_aviso.dart';
import '../../widgets/folha_destrutiva.dart';
import '../../widgets/saida_da_tela.dart';
import '../rede/pecas_da_rede.dart';

/// `Perfil` > **`Meus eventos`**: os encontros que esta conta criou.
///
/// ---------------------------------------------------------------------------
/// ## POR QUE ESTA TELA EXISTE, e por que ela e o lugar do `Cancelar`
/// ---------------------------------------------------------------------------
///
/// `cancelNetworkEvent` existia desde 17/10/2026 e **nao tinha caminho
/// nenhum**: nada na resposta da agenda diz de quem e o encontro
/// (`NetworkEventPublic` nao tem campo de autoria, e nao pode ter -- item 7 do
/// ADR-0010), entao quem criou um encontro nao tinha como voltar a ele.
///
/// O cliente escolheu o lugar em 19/10/2026, literal: *"Uma tela com os eventos
/// que voce criou, e o cancelar mora la. Nao suja o cartao da agenda, que voce
/// acabou de mandar limpar, e e onde as pessoas procuram"*.
///
/// **Ela mora em `Perfil`, pelas mesmas tres razoes de `Meus achados`**: a
/// agenda da `Rede` e alcancavel SEM CONTA (`listNetworkEvents` declara
/// `security: []`), `listMyNetworkEvents` exige conta com a autorizacao no
/// `WHERE` do servidor, e o "meu" mora em `Perfil` -- como `Meus pets` e
/// `Meus achados`. A porta e um `ItemDeMenu` entre `Meus achados` e
/// `Sair da conta`, que e onde `abas.dart` declara que item novo entra.
///
/// ---------------------------------------------------------------------------
/// ## O QUE O CARTAO MOSTRA, e a justificativa de cada linha
/// ---------------------------------------------------------------------------
///
/// A decisao de 19/10 fixou o cartao da AGENDA em **foto + titulo**, mais a
/// palavra `Cancelado`. Esta lista nao e a vitrine publica: ela e a lista do
/// dono, e cada coisa a mais se justifica sozinha.
///
/// 1. **Foto e titulo** -- o cartao da agenda, igual. As duas pecas sao as
///    MESMAS (`ImagemDoEncontroOuBanner`, `DistintivoDeSituacao`): o encontro
///    tem de parecer o mesmo encontro nas duas telas.
/// 2. **A data e a faixa de horario** -- *qual dos meus*. O teto e de tres
///    encontros ativos por conta, e nada impede que os tres se chamem
///    "Encontro no parque": tres cartoes identicos com um `Cancelar` cada e
///    uma armadilha. A data e o que distingue.
/// 3. **A palavra da situacao** (`Acontecendo agora`, `Encerrado`,
///    `Cancelado`) -- *o que ja aconteceu com ele*. E a mesma peca da agenda, e
///    e ela que explica por que o `Cancelar` nao esta ali.
/// 4. **O estado da capa, com o motivo do servidor quando recusada** -- *a
///    minha foto entrou?*. Esta tela e o UNICO lugar do produto onde essa
///    pergunta tem resposta: a capa sobe no mesmo `POST` de criar, o
///    processador pode recusa-la depois do `201`, `NetworkEventPublic` nao tem
///    `rejection_reason`, a pagina de detalhe do encontro foi apagada por
///    decisao do cliente e o cartao da agenda e foto + titulo. Outra frente
///    mediu a ausencia em 19/10 e relatou em vez de inventar campo.
/// 5. **`Cancelar`** -- a acao que o cliente pediu aqui.
///
/// **O que NAO entra**: lugar, resumo, observacoes, galeria, preco, portes,
/// idade, vacinacao, area cercada, estrutura, o que levar, ingresso e
/// Instagram. Nenhuma delas responde "qual dos meus", "da para cancelar" nem
/// "a minha foto entrou", e o servidor nao as manda nesta operacao
/// (`MyNetworkEvent` tem sete propriedades e `additionalProperties: false`).
///
/// ---------------------------------------------------------------------------
/// ## O `ETag` E LIDO NO TOQUE, e nao na carga da lista
/// ---------------------------------------------------------------------------
///
/// `cancelNetworkEvent` exige `If-Match` com a versao da ultima leitura.
/// `listMyNetworkEvents` **nao** devolve `ETag`, e nao e esquecimento: um
/// cabecalho de resposta vale para a resposta inteira, e a versao que o
/// cancelamento precisa e de UM encontro -- um `ETag` de pagina apresentado
/// como versao de um item daria 412 em toda tentativa, e o defeito pareceria
/// conserto.
///
/// Entao o toque em `Cancelar` faz `getMyNetworkEvent` (a UNICA leitura da
/// `Rede` que emite `ETag`) **antes** de abrir a folha, e e aquele valor que
/// vai no `If-Match`. Ler no toque, e nao na carga, e o que mantem a trava
/// viva: uma versao relida dentro do `aoConfirmar` nunca daria 412, e a trava
/// de concorrencia existiria sem travar nada.
class MeusEventos extends StatefulWidget {
  const MeusEventos({super.key});

  static const String titulo = 'Meus eventos';

  /// Uma linha, e so uma, no estado vazio -- como na listagem de perdidos e em
  /// `Meus achados`, pelo pedido do cliente de 18/10/2026.
  static const String vazio = 'Você ainda não criou nenhum encontro.';

  static const String falha =
      'Não foi possível carregar os seus encontros agora.';

  /// A faixa de quem tocou em `Cancelar` num encontro que saiu da conta.
  ///
  /// **O texto vale para os quatro casos de 404 ao mesmo tempo** (não existe,
  /// não é seu, é do painel, foi retirado), porque o servidor responde o mesmo
  /// corpo nos quatro (ADR-0021) e a tela não tem como distinguir — nem deve.
  static const String saiuDaConta =
      'Este encontro não está mais na sua conta. Atualize a lista.';

  /// Quando a leitura responde 200 **sem** `ETag`.
  ///
  /// Não deveria acontecer: `getMyNetworkEvent` declara o cabeçalho. Se
  /// acontecer, a tela diz que não deu e **não** manda `If-Match` vazio — isso
  /// colheria um 428 que parece defeito de servidor.
  static const String semVersao =
      'Não conseguimos confirmar a versão deste encontro. Atualize a lista e '
      'tente de novo.';

  static String fimDaLista(int quantos) => quantos == 1
      ? 'Você criou 1 encontro.'
      : 'Você criou $quantos encontros.';

  @override
  State<MeusEventos> createState() => _EstadoDeMeusEventos();
}

/// Os textos da folha de confirmação do cancelamento.
///
/// ---------------------------------------------------------------------------
/// ## NENHUMA LINHA AQUI AFIRMA QUE ALGUÉM FOI AVISADO
/// ---------------------------------------------------------------------------
///
/// É o mesmo cuidado de `TextosDoDetalhe.oQueAconteceAoEncerrar`, do mesmo dia,
/// e pelo mesmo motivo medido: **nada é enviado a ninguém no cancelamento**.
/// `EncontroDaComunidade.cancelar` grava `publication_status = 'cancelled'`, o
/// instante e a nota, e registra a trilha — e mais nada: não há mensagem de
/// sistema, não há trabalho enfileirado e não há envio. E o push está bloqueado
/// em produção por falta de permissão da conta de serviço, e não funciona
/// nenhum no iPhone do cliente.
///
/// Esta casa já pagou por esta classe de defeito: o servidor devolvia
/// `owner_notified: true`, a tela afirmava isso em texto fixo e o
/// desserializador tinha `?? true` — três lugares mentindo juntos. A frase daqui
/// diz o que de fato acontece: quem ia descobre ao abrir a agenda.
abstract final class TextosDoCancelamento {
  static const String titulo = 'Cancelar este encontro?';

  /// O corpo: **o que vai acontecer**, no futuro, porque nada aconteceu ainda.
  static const String corpo =
      'Cancelar avisa a agenda de que o encontro não vai mais acontecer. Ele '
      'não é apagado.';

  /// As consequências, em lista. **Cada linha é uma coisa medida.**
  ///
  /// A primeira: o contrato e o servidor deixam o cancelado visível com
  /// `status` `cancelled` até o fim previsto, e depois dele ele segue a regra do
  /// encerrado (`statusDoEncontro`, decisões do cliente de 23/09 e 28/09).
  ///
  /// A segunda: **ninguém é avisado**. Ver o cabeçalho desta classe.
  ///
  /// A terceira: não há operação de descancelar. Só encontro `published` se
  /// cancela, então uma segunda tentativa cai em `event_not_published`.
  ///
  /// A quarta: o teto de três ativos por conta libera uma vaga — está no
  /// contrato (*"o encontro cancelado sai do teto de 3 ativos"*) e é informação
  /// útil para quem quer remarcar.
  static const List<String> oQueAcontece = <String>[
    'O encontro fica na agenda com a palavra Cancelado até o fim previsto, '
        'para quem ia saber que não vai mais acontecer.',
    'Ninguém recebe aviso. Quem ia descobre quando abrir a agenda.',
    'Não dá para desfazer. Se mudar de ideia, é marcar um encontro novo.',
    'Ele deixa de contar nos seus três encontros marcados.',
  ];

  static const String confirmar = 'Cancelar o encontro';

  /// O nome acessível do botão destrutivo: o 11.9.1 exige que ele diga **o
  /// que** será destruído, e quem navega por leitor de tela chega nele sem o
  /// contexto que a pessoa vidente tem da folha inteira na frente dela.
  static String confirmarAcessivel(String titulo) =>
      'Cancelar o encontro $titulo';

  /// O rótulo de dispensar. **`Manter o encontro` e não `Cancelar`**: numa
  /// folha cujo botão destrutivo se chama `Cancelar o encontro`, um `Cancelar`
  /// ao lado é a pior palavra possível — os dois toques leem igual e fazem o
  /// contrário um do outro.
  static const String manter = 'Manter o encontro';

  /// A nota que vai na trilha.
  ///
  /// **A tela não pede motivo, e isso é decisão e não falta.**
  /// `CommunityNetworkEventCancellation.note` é obrigatória (2 a 280), e o
  /// contrato diz que ela fica **só na trilha**: o app não mostra motivo de
  /// cancelamento em lugar nenhum, nem o do painel. Um campo de texto livre
  /// aqui pediria à pessoa uma frase que ela nunca mais veria — atrito por
  /// nada, e texto de pessoa na trilha sobrevive à exclusão da conta. A nota
  /// fixa registra o que de fato se sabe: por onde o cancelamento entrou.
  static const String nota = 'Cancelado pelo organizador no aplicativo.';
}

enum _Fase { carregando, lista, falha, semConta }

class _EstadoDeMeusEventos extends State<MeusEventos> {
  _Fase _fase = _Fase.carregando;

  List<MeuEncontro> _itens = const <MeuEncontro>[];

  /// A faixa de erro de uma AÇÃO (ler a versão, cancelar), separada da fase da
  /// lista: a lista continua na tela enquanto a faixa explica o que não deu.
  String? _erroDaAcao;

  /// O `slug` cuja versão está sendo lida. Desabilita só o botão daquele
  /// cartão, e não os outros.
  String? _lendoAVersaoDe;

  int _geracao = 0;
  bool _primeiraCarga = true;

  @override
  void didChangeDependencies() {
    super.didChangeDependencies();
    if (!_primeiraCarga) return;
    _primeiraCarga = false;
    WidgetsBinding.instance.addPostFrameCallback((_) {
      if (mounted) _carregar();
    });
  }

  RedeApi _api(ApiClient cliente) => RedeApi(cliente);

  Future<void> _carregar() async {
    if (!mounted) return;
    final escopo = Escopo.of(context);
    if (!escopo.sessao.logado) {
      setState(() {
        _fase = _Fase.semConta;
        _itens = const <MeuEncontro>[];
        _erroDaAcao = null;
      });
      return;
    }

    final geracao = ++_geracao;
    setState(() {
      _fase = _Fase.carregando;
      _erroDaAcao = null;
    });

    try {
      final pagina = await _api(escopo.api).meusEncontros();
      if (!mounted || geracao != _geracao) return;
      setState(() {
        _itens = pagina.itens;
        _fase = _Fase.lista;
      });
    } on FalhaDeChamada catch (falha) {
      _falhou(geracao, semConta: faltaConta(falha));
    } on FormatException {
      _falhou(geracao);
    }
  }

  void _falhou(int geracao, {bool semConta = false}) {
    if (!mounted || geracao != _geracao) return;
    setState(() {
      _itens = const <MeuEncontro>[];
      // A SESSÃO PODE CAIR DEPOIS DA GUARDA: `_carregar` confere
      // `sessao.logado` antes de chamar, mas o refresh pode ser recusado dentro
      // da chamada, e o 401 chega aqui. Sem este ramo, quem foi deslogada no
      // meio do uso veria faixa de erro com `Tentar de novo`.
      _fase = semConta ? _Fase.semConta : _Fase.falha;
    });
  }

  /// O toque em `Cancelar`: lê a versão, abre a folha, e só então cancela.
  ///
  /// A ORDEM É O DESENHO. A leitura vem antes da folha para que o `If-Match`
  /// seja a versão do instante da decisão, e para que a folha não abra sobre um
  /// encontro que já saiu da conta. Ler dentro do `aoConfirmar` daria um
  /// `If-Match` sempre fresco, e a trava de concorrência nunca travaria nada.
  Future<void> _cancelar(MeuEncontro encontro) async {
    final api = _api(Escopo.of(context).api);
    setState(() {
      _lendoAVersaoDe = encontro.slug;
      _erroDaAcao = null;
    });

    final MeuEncontroComVersao? lido;
    try {
      lido = await api.meuEncontro(encontro.slug);
    } on FalhaDeChamada catch (falha) {
      if (!mounted) return;
      setState(() {
        _lendoAVersaoDe = null;
        _erroDaAcao = MensagensDeErro.de(falha).texto;
      });
      return;
    } on FormatException {
      if (!mounted) return;
      setState(() {
        _lendoAVersaoDe = null;
        _erroDaAcao = MeusEventos.falha;
      });
      return;
    }
    if (!mounted) return;
    setState(() => _lendoAVersaoDe = null);

    // 404: os quatro casos do ADR-0021 num só texto, que é verdade nos quatro.
    //
    // **A RECARGA VEM ANTES DA FAIXA, e a ordem é o conserto.** `_carregar`
    // limpa `_erroDaAcao` ao começar — é o certo para um recarregar pedido pela
    // pessoa —, então pôr a faixa primeiro a apagava no mesmo quadro e a tela
    // ficava sem dizer nada. Medido pela isca `o 404 do getMyNetworkEvent nao
    // abre folha nenhuma`, que reprovava por não achar o texto.
    if (lido == null) {
      await _carregar();
      if (!mounted) return;
      setState(() => _erroDaAcao = MeusEventos.saiuDaConta);
      return;
    }
    final etag = lido.etag;
    if (etag == null) {
      setState(() => _erroDaAcao = MeusEventos.semVersao);
      return;
    }

    final cancelou = await mostrarFolhaDestrutiva(
      context,
      titulo: TextosDoCancelamento.titulo,
      corpo: TextosDoCancelamento.corpo,
      oQueSome: TextosDoCancelamento.oQueAcontece,
      rotuloDeConfirmar: TextosDoCancelamento.confirmar,
      rotuloAcessivelDeConfirmar:
          TextosDoCancelamento.confirmarAcessivel(encontro.titulo),
      rotuloDeCancelar: TextosDoCancelamento.manter,
      // A FALHA FICA NA FOLHA, e a folha não fecha: é `FolhaDestrutiva` quem
      // trata, e é por isso que o 412 (`Alguém mexeu neste evento enquanto você
      // olhava`) aparece ali, sobre a explicação, em vez de numa faixa genérica
      // atrás de uma folha que já sumiu.
      aoConfirmar: () => api.cancelar(
        encontro.slug,
        ifMatch: etag,
        nota: TextosDoCancelamento.nota,
      ),
    );
    if (!mounted || !cancelou) return;
    await _carregar();
  }

  @override
  Widget build(BuildContext context) {
    final sessao = Escopo.of(context).sessao;
    return Scaffold(
      appBar: const BarraDeConta(
        titulo: MeusEventos.titulo,
        saida: TipoDeSaida.voltar,
      ),
      body: SafeArea(
        top: false,
        bottom: false,
        child: AnimatedBuilder(
          animation: sessao,
          builder: (context, _) => ArrastarParaAtualizar(
            aoAtualizar: _carregar,
            child: ListView(
              padding: const EdgeInsets.all(BichuEspaco.e4),
              addSemanticIndexes: false,
              children: _corpo(),
            ),
          ),
        ),
      ),
    );
  }

  List<Widget> _corpo() {
    final erro = _erroDaAcao;
    return <Widget>[
      if (erro != null) ...<Widget>[
        FaixaDeAviso(
          texto: erro,
          rotuloDaAcao: MensagensDeErro.tentarDeNovo,
          aoTocarNaAcao: _carregar,
        ),
        const SizedBox(height: BichuEspaco.e4),
      ],
      ..._porFase(),
    ];
  }

  List<Widget> _porFase() {
    switch (_fase) {
      case _Fase.semConta:
        return const <Widget>[
          ConviteParaEntrar(secao: SecaoComConta.meusEventos),
        ];
      case _Fase.carregando:
        return <Widget>[
          Semantics(
            label: 'Carregando os seus encontros',
            liveRegion: true,
            child: const Center(child: CircularProgressIndicator()),
          ),
        ];
      case _Fase.falha:
        return <Widget>[
          FaixaDeAviso(
            texto: MeusEventos.falha,
            rotuloDaAcao: MensagensDeErro.tentarDeNovo,
            aoTocarNaAcao: _carregar,
          ),
        ];
      case _Fase.lista:
        if (_itens.isEmpty) {
          return const <Widget>[_UmaLinha(texto: MeusEventos.vazio)];
        }
        return <Widget>[
          for (var i = 0; i < _itens.length; i++) ...<Widget>[
            if (i > 0) const SizedBox(height: BichuEspaco.e4),
            CartaoDoMeuEncontro(
              encontro: _itens[i],
              lendoAVersao: _lendoAVersaoDe == _itens[i].slug,
              aoCancelar: () => _cancelar(_itens[i]),
            ),
          ],
          const SizedBox(height: BichuEspaco.e4),
          Text(
            MeusEventos.fimDaLista(_itens.length),
            style: Theme.of(context).textTheme.bodySmall?.copyWith(
                  color: BichuColors.of(context).cores.textSecondary,
                ),
          ),
        ];
    }
  }
}

/// O cartão de um encontro meu: foto, título, data, situação, estado da capa e
/// `Cancelar`.
///
/// A justificativa de cada linha está no cabeçalho de [MeusEventos].
class CartaoDoMeuEncontro extends StatelessWidget {
  const CartaoDoMeuEncontro({
    required this.encontro,
    required this.aoCancelar,
    super.key,
    this.lendoAVersao = false,
  });

  final MeuEncontro encontro;
  final VoidCallback aoCancelar;

  /// Enquanto a versão deste encontro está sendo lida, o botão fica
  /// desabilitado: dois toques dispararam duas folhas sobre a mesma linha.
  final bool lendoAVersao;

  /// A linha de data: `sábado, 27 de setembro · Das 9h às 11h`.
  ///
  /// É o que distingue um dos meus três encontros do outro — ver o item 2 do
  /// cabeçalho de [MeusEventos].
  static String quandoDe(MeuEncontro encontro, {required int anoCorrente}) {
    final dia = encontro.dia.dataLonga(anoCorrente: anoCorrente);
    return '$dia · ${encontro.horario.faixa}';
  }

  /// O rótulo acessível do cartão inteiro.
  ///
  /// **A situação vem DEPOIS do título, e nunca no lugar dele.** O defeito que
  /// esta ordem evita foi medido nesta rodada noutra tela: um `MergeSemantics`
  /// fazia o leitor de tela anunciar só `Cancelado` e sumir com o título — pior
  /// que não ter rótulo.
  static String rotuloAcessivelDe(
    MeuEncontro encontro, {
    required int anoCorrente,
  }) {
    final situacao = rotuloDaSituacao(encontro.situacao);
    final capa = encontro.capa;
    return <String>[
      encontro.titulo,
      quandoDe(encontro, anoCorrente: anoCorrente),
      ?situacao,
      if (capa != null && capa.recusadaComMotivo)
        '${_FotoRecusada.rotulo} ${capa.motivoDaRecusa!}',
    ].join(', ');
  }

  @override
  Widget build(BuildContext context) {
    final cores = BichuColors.of(context).cores;
    final textos = Theme.of(context).textTheme;
    final anoCorrente = DateTime.now().year;
    final cancelado = encontro.situacao == SituacaoDoEncontro.cancelado;
    final capa = encontro.capa;

    return Container(
      decoration: BoxDecoration(
        color: cores.surface,
        borderRadius: BorderRadius.circular(BichuRaio.lg),
        border: Border.all(color: cores.outline, width: BichuBorda.hairline),
      ),
      clipBehavior: Clip.antiAlias,
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: <Widget>[
          // A MESMA peça da agenda, e de propósito: o encontro tem de parecer o
          // mesmo encontro nas duas telas. Decorativa aqui (texto alternativo
          // nulo): o rótulo do cartão, logo abaixo, já diz qual encontro é.
          ImagemDoEncontroOuBanner(url: capa?.url, cancelado: cancelado),
          Padding(
            padding: const EdgeInsets.all(BichuEspaco.e4),
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: <Widget>[
                // O BLOCO DE TEXTO vai num nó só do leitor de tela, com o
                // título PRIMEIRO. As ações ficam fora dele: um nó que
                // misturasse texto e botão não teria como ser acionado.
                Semantics(
                  container: true,
                  excludeSemantics: true,
                  label: rotuloAcessivelDe(encontro, anoCorrente: anoCorrente),
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: <Widget>[
                      Text(encontro.titulo, style: textos.titleMedium),
                      const SizedBox(height: BichuEspaco.e1),
                      Text(
                        quandoDe(encontro, anoCorrente: anoCorrente),
                        style: textos.bodySmall
                            ?.copyWith(color: cores.textSecondary),
                      ),
                      if (encontro.situacao != null &&
                          rotuloDaSituacao(encontro.situacao) != null) ...<Widget>[
                        const SizedBox(height: BichuEspaco.e2),
                        DistintivoDeSituacao(situacao: encontro.situacao!),
                      ],
                    ],
                  ),
                ),
                if (capa != null && capa.recusadaComMotivo) ...<Widget>[
                  const SizedBox(height: BichuEspaco.e3),
                  // O MOTIVO DO SERVIDOR, literal, e nunca uma frase própria:
                  // só o servidor sabe se o problema foi o formato, a dimensão
                  // mínima ou um arquivo truncado, e um texto genérico deixa a
                  // pessoa sem saber o que consertar.
                  FaixaDeAviso(
                    peso: PesoDaFaixa.informativo,
                    texto: '${_FotoRecusada.rotulo} ${capa.motivoDaRecusa!}',
                  ),
                ],
                if (encontro.podeCancelar) ...<Widget>[
                  const SizedBox(height: BichuEspaco.e4),
                  _BotaoDeCancelar(
                    rotuloAcessivel: TextosDoCancelamento.confirmarAcessivel(
                      encontro.titulo,
                    ),
                    aoTocar: lendoAVersao ? null : aoCancelar,
                  ),
                ],
              ],
            ),
          ),
        ],
      ),
    );
  }
}

/// A primeira frase da faixa da capa recusada.
///
/// Ela diz **o que** aconteceu; o que vem depois é o motivo do servidor, e os
/// dois nunca se substituem. Numa classe própria para a isca poder afirmar que
/// a frase genérica aparece **só** acompanhada do motivo.
abstract final class _FotoRecusada {
  static const String rotulo = 'A foto deste encontro foi recusada.';
}

/// `Cancelar o encontro`: contorno, e **não** preenchido em `urgency`.
///
/// O botão vermelho mora na folha de confirmação, que é onde a destruição
/// acontece (11.9.1). Aqui ele é a porta para a folha, e um cartão de lista com
/// botão vermelho em cada linha transforma a lista num campo minado — além de
/// pintar de alerta um encontro que está tudo bem.
class _BotaoDeCancelar extends StatelessWidget {
  const _BotaoDeCancelar({required this.rotuloAcessivel, required this.aoTocar});

  final String rotuloAcessivel;
  final VoidCallback? aoTocar;

  @override
  Widget build(BuildContext context) {
    return Semantics(
      button: true,
      enabled: aoTocar != null,
      label: rotuloAcessivel,
      excludeSemantics: true,
      // `excludeSemantics: true` apaga a árvore do filho e levaria junto a ação
      // que o botão publica; sem este `onTap` o nó sai com `btn=true
      // tap=false`, e `test/a11y/acao_de_controle_test.dart` reprova — com
      // razão: quem usa leitor de tela ouviria que existe um botão e não teria
      // como acioná-lo.
      onTap: aoTocar,
      child: SizedBox(
        width: double.infinity,
        child: OutlinedButton(
          onPressed: aoTocar,
          style: OutlinedButton.styleFrom(
            minimumSize: const Size.fromHeight(BichuAlvoDeToque.min),
          ),
          child: const Text(TextosDoCancelamento.confirmar),
        ),
      ),
    );
  }
}

/// O estado vazio: **uma linha**, como em `Meus achados`.
class _UmaLinha extends StatelessWidget {
  const _UmaLinha({required this.texto});

  final String texto;

  @override
  Widget build(BuildContext context) {
    final cores = BichuColors.of(context).cores;
    return Container(
      width: double.infinity,
      padding: const EdgeInsets.all(BichuEspaco.e6),
      decoration: BoxDecoration(
        color: cores.surfaceSunken,
        borderRadius: BorderRadius.circular(BichuRaio.lg),
        border: Border.all(color: cores.outline, width: BichuBorda.hairline),
      ),
      child: Text(texto, style: Theme.of(context).textTheme.titleMedium),
    );
  }
}
