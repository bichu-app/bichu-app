import 'package:flutter/material.dart';

import '../../achado/envio_do_achado.dart';
import '../../achado/rascunho_do_achado.dart';
import '../../api/api_client.dart';
import '../../api/falhas.dart';
import '../../api/mensagens_de_erro.dart';
import '../../api/modelos_pet.dart';
import '../../dispositivo/camera_e_galeria.dart';
import '../../escopo.dart';
import '../../perdido/quando_foi_visto.dart';
import '../../theme/bichu_colors.dart';
import '../../theme/bichu_tokens.g.dart';
import '../../widgets/barra_de_acao_fixa.dart';
import '../../widgets/bichu_field.dart';
import '../../widgets/botao_primario.dart';
import '../../widgets/faixa_de_aviso.dart';
import '../../widgets/grupo_de_opcoes.dart';
import '../../widgets/grupo_segmentado.dart';
import '../../widgets/previa_da_foto.dart';
import '../../widgets/saida_da_tela.dart';
import '../../widgets/seletor_de_lista.dart';
import '../localizacao/antessala_de_localizacao.dart';
import '../localizacao/captura_de_localizacao.dart';
import 'textos_do_achado.dart';

/// **F3.5 — Registrar um achado avulso, sem QR.** A tela desta historia.
///
/// ## O que ela exige, e o que ela aceita vazio
///
/// A lista de exigencias e `StrayFoundReportInput` do contrato, e nada alem
/// dele: `species`, `size`, `found_at` e **um** dos dois ramos de lugar. Os
/// quatro se respondem olhando para o animal. Raca, cor, sexo e observacao
/// sao opcionais no contrato e opcionais aqui; nenhum campo desta tela pede o
/// que quem acha um pet na rua nao tem como saber, e a isca
/// `porta_da_frente_test.dart` reprova se isso mudar.
///
/// ## A captura de localizacao e EMBUTIDA, e nao reescrita
///
/// [CapturaDeLocalizacao] e a peca da BICHUS-23, escrita exatamente para ser
/// embutida por esta tela e por F3.1. Esta tela consome o `Onde?` que ela
/// publica e nao sabe nada sobre permissao.
///
/// ## Esta tela NAO oferece a captura de localizacao (29/10/2026)
///
/// Decisao do cliente, verbatim: *"remove os botoes e deixa os campos de cep,
/// endereco para o usuario preencher, no mesmo padrao das outras paginas"*. A
/// peca abre direto nos campos -- CEP, bairro, cidade e estado --, e os dois
/// botoes (`Usar minha localizacao` e `Prefiro digitar o bairro`) nao aparecem.
/// Quem escolhe isso e o `pontoDeUso`; ver `_ofereceCaptura` na peca.
///
/// **O achado desta tela nao tem coordenada, nunca.** Isso foi decidido com o
/// custo medido na mesa: `location` ia ao servidor e o cruzamento usa a
/// coordenada em quatro lugares (`src/modules/found/domain/cruzamento.ts`), de
/// modo que o achado passa a casar **por cidade e nao por quarteirao**, e fica
/// atras de quem tem ponto no desempate da ordenacao.
///
/// ## Por que nao ha mais aviso sobre o lugar
///
/// Havia uma `FaixaDeAviso` aqui com dois textos condicionais, e **os dois
/// deixaram de poder ser verdade**:
///
/// - `semRotuloDeArea` dizia *"O tutor vai ver a distancia, e nao o bairro"*.
///   Sem coordenada nao ha distancia nenhuma para o tutor ver, entao a frase
///   passaria a **mentir** -- e nao a ficar velha;
/// - `semCoordenada` dizia que a busca vale na cidade inteira. Virou verdade em
///   **todo** achado, e uma faixa que aparece sempre nao distingue nada: deixa
///   de ser aviso e passa a ser decoracao com cara de problema, na tela de quem
///   esta com um animal na rua. E o mesmo argumento que a propria peca ja
///   escreve para nao usar `FaixaDeAviso` onde nao ha o que avisar.
///
/// O que restava de acionavel -- *"escreva o bairro se quiser que ele
/// apareca"* -- esta no formulario, que mostra o campo de bairro rotulado e
/// opcional a um toque de distancia.
///
/// ## O que esta tela NAO faz
///
/// - **Nao cruza nada.** O cruzamento por especie, porte, raca e cor e o
///   achado que chega por link compartilhado sao regra de dominio, e o
///   servidor os resolve. A tela nao adianta candidato e nao mostra "pode ser
///   a Nina" antes de a confirmacao humana do tutor acontecer.
/// - **Nao le a foto de volta.** `photo_url` volta nulo por criterio: a foto
///   do achador e vista pelo tutor dentro da conversa mediada, e so. A tela
///   mostra a foto que esta no aparelho, e nunca um endereco que o servidor
///   nao assinou.
/// - **Nao guarda nada em disco por conta propria.** O que sobrevive ao app
///   fechar sao duas pecas que ja existem e que ja tem limpeza registrada em
///   `limpezasAoSair`: o envelope de intencao (`GuardaDeAcao`) e a fila
///   offline (`FilaOffline`). Uma terceira gaveta desta tela seria dado de
///   conta esperando a proxima pessoa que entrasse neste aparelho.
class TelaRegistrarAchado extends StatefulWidget {
  const TelaRegistrarAchado({
    super.key,
    this.rascunho,
    this.erroInicial,
    this.agora = DateTime.now,
  });

  /// O rascunho, quando a pessoa esta voltando (envelope de intencao que
  /// falhou). Nulo abre a tela em branco.
  final RascunhoDoAchado? rascunho;

  /// A falha da tentativa que trouxe a pessoa de volta (UX 8.3, regra 4).
  final String? erroInicial;

  /// O relogio entra pela porta. Sem isso, "amanha nao e aceito" so seria
  /// exercitavel esperando um dia, e a regra ficaria sem isca.
  final DateTime Function() agora;

  @override
  State<TelaRegistrarAchado> createState() => _TelaRegistrarAchadoState();
}

enum _Fase { preenchendo, enviando }

class _TelaRegistrarAchadoState extends State<TelaRegistrarAchado> {
  late final RascunhoDoAchado _rascunho = widget.rascunho ?? RascunhoDoAchado();
  late final TextEditingController _observacao =
      TextEditingController(text: _rascunho.observacao);

  _Fase _fase = _Fase.preenchendo;
  MensagemDeErro? _erro;
  String? _erroInicial;

  DadosDeReferencia? _referencia;
  EstadoDaPermissao _permissaoDaCamera = EstadoDaPermissao.negada;

  /// A chave de idempotencia **da primeira tentativa**, e nao de cada uma.
  ///
  /// Ela nasce aqui e sobrevive a `Tentar de novo` e a ida para a fila
  /// offline. Uma chave por tentativa faria cada reenvio virar um achado novo,
  /// e a mesma tutora receberia a mesma sugestao varias vezes -- que e o
  /// defeito que o criterio 13 da BICHUS-31 nomeia.
  String? _chave;

  /// O arranque roda em `didChangeDependencies`, e nao em `initState`.
  ///
  /// `Escopo` e um `InheritedWidget`, e le-lo dentro de `initState` e erro de
  /// framework. O sinalizador impede que o arranque rode de novo a cada
  /// mudanca de tema, de tamanho de fonte ou de rotacao.
  bool _iniciou = false;

  @override
  void initState() {
    super.initState();
    _erroInicial = widget.erroInicial;
  }

  @override
  void didChangeDependencies() {
    super.didChangeDependencies();
    if (_iniciou) return;
    _iniciou = true;
    _carregarReferencia();
    _consultarACamera();
  }

  @override
  void dispose() {
    _observacao.dispose();
    super.dispose();
  }

  /// A lista fechada de `GET /public/reference-data` (criterio 8).
  ///
  /// **A lista que nao carrega nao trava o registro**, e a razao e a mesma do
  /// cadastro de pet, so que mais forte aqui: raca e cor sao opcionais no
  /// contrato, e perder o achado por causa de um campo que ninguem precisa
  /// preencher seria o pior desfecho possivel. O que **nao** acontece e o
  /// campo virar texto livre como plano B -- raca digitada a mao produz falso
  /// negativo justamente no caso que importa.
  Future<void> _carregarReferencia() async {
    try {
      final dados = await Escopo.of(context).pets.dadosDeReferencia();
      if (!mounted) return;
      setState(() {
        _referencia = dados;
        _rascunho.versaoDaReferencia = dados.versao;
      });
    } on FalhaDeChamada {
      if (!mounted) return;
      setState(() => _referencia = null);
    }
  }

  Future<void> _consultarACamera() async {
    final estado = await Escopo.of(context).camera.estadoDaCamera();
    if (!mounted) return;
    setState(() => _permissaoDaCamera = estado);
  }

  // -------------------------------------------------------------------------
  // A foto
  // -------------------------------------------------------------------------

  /// `Tirar foto` e a **primeira acao** (criterio 1), e ela continua visivel
  /// com a permissao negada: toca-la abre o dialogo enquanto ele ainda abre, e
  /// leva aos ajustes quando ele nao abre mais. Esconder o botao faria a
  /// pessoa achar que o app perdeu a funcao.
  Future<void> _tirarFoto() async {
    final camera = Escopo.of(context).camera;
    var estado = _permissaoDaCamera;
    if (estado == EstadoDaPermissao.negada) {
      estado = await camera.pedirCamera();
      if (!mounted) return;
      setState(() => _permissaoDaCamera = estado);
    }
    if (estado != EstadoDaPermissao.concedida) return;
    final foto = await camera.tirarFoto();
    if (!mounted) return;
    if (foto != null) setState(() => _rascunho.foto = foto);
  }

  Future<void> _escolherDaGaleria() async {
    final foto = await Escopo.of(context).camera.escolherDaGaleria();
    if (!mounted) return;
    if (foto != null) setState(() => _rascunho.foto = foto);
  }

  // -------------------------------------------------------------------------
  // O quando
  // -------------------------------------------------------------------------

  Future<void> _escolherData() async {
    final agora = widget.agora();
    final escolhida = await showDatePicker(
      context: context,
      initialDate: _rascunho.dataEscolhida ?? agora,
      firstDate: agora.subtract(const Duration(days: 365)),
      // **O calendario nao oferece o futuro.** E a primeira das tres defesas
      // contra "achei amanha"; as outras duas sao o impedimento do rascunho,
      // que e o que segura relogio de aparelho adiantado, e a borda do
      // servidor, que e a autoridade.
      lastDate: agora,
      helpText: 'Quando você achou',
    );
    if (escolhida == null || !mounted) return;
    setState(() => _rascunho.dataEscolhida = escolhida);
  }

  // -------------------------------------------------------------------------
  // O envio
  // -------------------------------------------------------------------------

  Future<void> _registrar() async {
    _rascunho.observacao = _observacao.text;
    final chave = _chave ??= ApiClient.novaChaveDeIdempotencia();
    // **O ENVIO NAO MORA MAIS AQUI.** Ele foi para `achado/envio_do_achado.dart`
    // quando `TelaEncontreiEstePet` nasceu (26/10/2026, o defeito de redigitar
    // especie, cor e porte de um pet que ja tem cadastro): as duas telas tem os
    // MESMOS cinco desfechos -- conta que falta, rede caida, sessao vencida,
    // falha de api e registro --, e uma segunda copia deles envelheceria calada,
    // porque nenhum teste de uma tela le a outra. O comportamento desta tela
    // nao mudou em nada: os cinco ramos sao os mesmos, na mesma ordem.
    await enviarAchado(
      context: context,
      rascunho: _rascunho,
      agora: widget.agora(),
      chave: chave,
      aoComecar: () => setState(() {
        _fase = _Fase.enviando;
        _erro = null;
        _erroInicial = null;
      }),
      aoFalhar: (erro) => setState(() {
        _fase = _Fase.preenchendo;
        _erro = erro;
      }),
      aoVoltarDoLogin: () => setState(() => _fase = _Fase.preenchendo),
    );
  }

  // -------------------------------------------------------------------------

  List<ItemDeLista> get _cores => <ItemDeLista>[
        for (final cor in _referencia?.cores ?? const <OpcaoDeReferencia>[])
          ItemDeLista(codigo: cor.codigo, rotulo: cor.rotulo),
      ];

  List<ItemDeLista> get _racas {
    final referencia = _referencia;
    final especie = _rascunho.especie;
    if (referencia == null || especie == null) return const <ItemDeLista>[];
    return <ItemDeLista>[
      for (final raca in referencia.racasDe(especie))
        ItemDeLista(codigo: raca.codigo, rotulo: raca.rotulo),
    ];
  }

  /// Em qual dos dois passos a pessoa esta (0 ou 1).
  ///
  /// **O passo e a UNICA coisa que a divisao acrescentou ao estado.** Tudo o
  /// que a pessoa preenche continua em [_rascunho] e em [_observacao], que
  /// moram aqui, acima dos dois passos: nenhuma pagina guarda copia de nada,
  /// e por isso nao ha par de paginas para discordar.
  int _passo = 0;

  // -------------------------------------------------------------------------
  // O desenho
  // -------------------------------------------------------------------------

  @override
  Widget build(BuildContext context) {
    final cores = BichuColors.of(context).cores;
    final agora = widget.agora();

    return Scaffold(
      appBar: const BarraDeConta(
        titulo: TextosDoAchado.titulo,
        saida: TipoDeSaida.voltar,
      ),
      body: SafeArea(
        top: false,
        bottom: false,
        // **`IndexedStack`, e nao `PageView` nem rota nova.** Os dois passos
        // ficam MONTADOS; so um e desenhado. Isso e o que faz "ir ao 2, voltar
        // ao 1 e avancar de novo" devolver o passo 2 preenchido: a captura de
        // localizacao guarda bairro, cidade e UF em `TextEditingController`
        // dentro do estado DELA, e desmontar aquele trecho -- que e o que uma
        // rota nova ou um `if` fariam -- jogaria fora o que a pessoa digitou
        // sem nada na tela dizendo que jogou.
        //
        // `RenderIndexedStack` so visita o filho do indice ao montar a
        // semantica, entao o leitor de tela continua ouvindo UMA pagina.
        child: IndexedStack(
          index: _passo,
          children: <Widget>[
            _Passo1(
              rascunho: _rascunho,
              racas: _racas,
              cores: _cores,
              permissaoDaCamera: _permissaoDaCamera,
              erroInicial: _erroInicial,
              aoMudar: () => setState(() {}),
              aoTirarFoto: _tirarFoto,
              aoEscolherFoto: _escolherDaGaleria,
              aoAbrirAjustes: () =>
                  Escopo.of(context).camera.abrirAjustesDoSistema(),
            ),
            _Passo2(
              rascunho: _rascunho,
              observacao: _observacao,
              erro: _erro,
              aoMudar: () => setState(() {}),
              aoEscolherData: _escolherData,
            ),
          ],
        ),
      ),
      bottomNavigationBar: _barra(cores, agora),
    );
  }

  /// A barra de baixo, que muda com o passo -- e **sempre** diz o que falta.
  ///
  /// O motivo vem ACIMA do botao nos dois passos: quem usa leitor de tela
  /// chegaria no botao desabilitado sem ter ouvido por que.
  Widget _barra(BichuCores cores, DateTime agora) {
    if (_passo == 0) {
      final impedimento = _rascunho.impedimentoDoPasso1();
      // =====================================================================
      // O PASSO 1 PERDEU O MOTIVO VISIVEL, E NAO PERDEU O MOTIVO
      // (decisao do cliente, 22/10/2026)
      // =====================================================================
      //
      // Ele pediu *"remova essa funcionalidade, deixe apenas o botao
      // continuar"*, e a frase era ambigua entre duas coisas que a medicao
      // separou: o TEXTO do impedimento e a TRAVA que ele explica. Medido,
      // antes de perguntar:
      //
      //   em branco        Continuar desabilitado, tela diz `semEspecie`
      //   so especie       Continuar desabilitado, tela diz `semPorte`
      //   especie + porte  Continuar HABILITADO, nenhum texto
      //
      // Com as duas opcoes e os custos na mesa ele decidiu: **tirar o texto,
      // manter a trava.** Entao `MotivoDoBloqueioDoAchado` saiu DAQUI -- e so daqui:
      // o passo 2 continua com o motivo visivel, porque a decisao foi sobre
      // o `Continuar` e nao sobre o `Registrar achado`.
      //
      // **E A TELA NAO FICOU MUDA PARA QUEM NAO VE.** Ele pediu o texto fora
      // da tela; nao pediu um botao cinza sem explicacao para quem navega por
      // leitor de tela. O motivo passa a viajar no NOME ACESSIVEL do botao
      // desabilitado, que e um canal que `BotaoPrimario` ja tinha
      // (`nomeAcessivel`) e que nao desenha um pixel.
      //
      // **A REDACAO E A DO `ImpedimentoDeRegistrar`, e nao uma segunda.** A
      // frase sai de `impedimento.texto` -- a mesma que o passo 2 ainda
      // escreve e a mesma que `porta_da_frente_test.dart` ancora. Este
      // projeto ja pagou redacao duplicada em rotulo e em frase de mapa, e
      // uma copia aqui divergiria na primeira correcao de virgula.
      //
      // **COMECA PELO ROTULO VISIVEL, por SC 2.5.3** (o nome acessivel tem de
      // CONTER o rotulo, senao comando de voz nao aciona o controle). A prosa
      // de `nomeAcessivel` em `BotaoPrimario` manda exatamente isso: comecar
      // pelo rotulo e acrescentar contexto depois dele. Dai
      // `'Continuar. <motivo>'`, e nunca so o motivo.
      //
      // `enabled` e `onTap` do no de semantica seguem a acao, que e nula aqui
      // -- entao o leitor de tela anuncia o nome E o estado desabilitado, sem
      // oferecer um toque que nao responde.
      return BarraDeAcaoFixa(
        acoes: <Widget>[
          BotaoPrimario(
            rotulo: TextosDoAchado.continuar,
            nomeAcessivel: impedimento == null
                ? null
                : '${TextosDoAchado.continuar}. ${impedimento.texto}',
            aoTocar:
                impedimento != null ? null : () => setState(() => _passo = 1),
          ),
        ],
      );
    }

    final impedimento = _rascunho.impedimentoEm(agora);
    return BarraDeAcaoFixa(
      acoes: <Widget>[
        if (impedimento != null)
          MotivoDoBloqueioDoAchado(texto: impedimento.texto, cor: cores.textPrimary),
        BotaoPrimario(
          rotulo: TextosDoAchado.registrar,
          critico: true,
          carregando: _fase == _Fase.enviando,
          aoTocar: (impedimento != null || _fase == _Fase.enviando)
              ? null
              : _registrar,
        ),
        // **Voltar nao perde nada**, e e por isso que ele pode ser um botao
        // comum e nao uma pergunta de confirmacao.
        OutlinedButton(
          onPressed: _fase == _Fase.enviando
              ? null
              : () => setState(() => _passo = 0),
          style: OutlinedButton.styleFrom(
            minimumSize: const Size.fromHeight(BichuAlvoDeToque.min),
          ),
          child: const Text(TextosDoAchado.voltarAoPasso1),
        ),
      ],
    );
  }
}

/// **Passo 1: o animal.** Especie, raca, sexo, porte e foto, nesta ordem
/// (cliente, 17/10/2026).
///
/// A especie vem primeiro porque a lista de racas e POR especie: perguntar a
/// raca antes deixaria o campo desabilitado na primeira leitura, que e o
/// defeito que esta tela acabou de pagar em outro campo.
class _Passo1 extends StatelessWidget {
  const _Passo1({
    required this.rascunho,
    required this.racas,
    required this.cores,
    required this.permissaoDaCamera,
    required this.erroInicial,
    required this.aoMudar,
    required this.aoTirarFoto,
    required this.aoEscolherFoto,
    required this.aoAbrirAjustes,
  });

  final RascunhoDoAchado rascunho;
  final List<ItemDeLista> racas;
  final List<ItemDeLista> cores;
  final EstadoDaPermissao permissaoDaCamera;
  final String? erroInicial;

  /// Avisa a tela de que o rascunho mudou. **O rascunho e da tela**, e este
  /// passo so escreve nele -- nao ha segunda copia para sincronizar.
  final VoidCallback aoMudar;

  final VoidCallback aoTirarFoto;
  final VoidCallback aoEscolherFoto;
  final VoidCallback aoAbrirAjustes;

  @override
  Widget build(BuildContext context) {
    return ListView(
      padding: const EdgeInsets.all(BichuEspaco.e4),
      // Pelo mesmo motivo da BICHUS-62: o padrao do `ListView` embrulha cada
      // filho direto num `IndexedSemantics`, e com ele cada bloco desta tela
      // viraria UM no de semantica com tudo colapsado dentro.
      addSemanticIndexes: false,
      children: <Widget>[
        const IndicadorDePasso(
          passo: 1,
          total: 2,
          titulo: TextosDoAchado.tituloDoPasso1,
        ),
        if (erroInicial != null) ...<Widget>[
          const SizedBox(height: BichuEspaco.e6),
          FaixaDeAviso(texto: erroInicial!),
        ],
        const SizedBox(height: BichuEspaco.e6),
        GrupoSegmentado<Especie>(
          // **SEM ROTULO VISIVEL** (cliente, 22/10/2026): o titulo do passo 1
          // ja faz a pergunta, e a linha abaixo dele a fazia de novo. Ver a
          // prosa de `TextosDoAchado.nomeDaEspecie`: as tres opcoes ficam, e
          // o grupo continua tendo NOME para o leitor de tela.
          rotulo: TextosDoAchado.nomeDaEspecie,
          rotuloVisivel: false,
          selecionado: rascunho.especie,
          opcoes: <OpcaoSegmentada<Especie>>[
            for (final e in Especie.values)
              OpcaoSegmentada<Especie>(valor: e, rotulo: e.rotulo),
          ],
          aoSelecionar: (escolha) {
            rascunho.especie = escolha;
            // Trocar de especie **apaga a raca escolhida**: a lista de racas e
            // por especie, e um `shih_tzu` guardado sob `cat` viajaria para o
            // servidor e sairia do cruzamento pela porta errada.
            rascunho.racaCodigo = null;
            aoMudar();
          },
        ),
        const SizedBox(height: BichuEspaco.e6),
        SeletorDeLista(
          rotulo: TextosDoAchado.rotuloDaRaca,
          estadoInicial: TextosDoAchado.escolherNaLista,
          // **SEM LINHA DE AJUDA** (cliente, 22/10/2026): *"retirar 'só se
          // você souber, em branco funciona'"*. O campo continua opcional e
          // continua dizendo `Escolher na lista` enquanto nada foi escolhido.
          itens: racas,
          // Desabilitado sem especie, porque a lista e POR especie, e
          // desabilitado sem lista, porque nao ha o que escolher.
          habilitado: racas.isNotEmpty,
          selecionado: rascunho.racaCodigo,
          aoSelecionar: (codigo) {
            rascunho.racaCodigo = codigo;
            aoMudar();
          },
        ),
        const SizedBox(height: BichuEspaco.e4),
        SeletorDeLista(
          rotulo: TextosDoAchado.rotuloDaCor,
          estadoInicial: TextosDoAchado.escolherNaLista,
          // **SEM LINHA DE AJUDA** (cliente, 22/10/2026): *"retirar 'só se
          // você souber, em branco funciona'"*. O campo continua opcional e
          // continua dizendo `Escolher na lista` enquanto nada foi escolhido.
          // **Rotulada em texto, nunca amostra de cor sem nome** (criterio 2).
          itens: cores,
          habilitado: cores.isNotEmpty,
          selecionado: rascunho.corCodigo,
          aoSelecionar: (codigo) {
            rascunho.corCodigo = codigo;
            aoMudar();
          },
        ),
        const SizedBox(height: BichuEspaco.e6),
        GrupoSegmentado<Sexo>(
          rotulo: TextosDoAchado.rotuloDoSexo,
          selecionado: rascunho.sexo,
          opcoes: <OpcaoSegmentada<Sexo>>[
            for (final s in Sexo.values)
              OpcaoSegmentada<Sexo>(valor: s, rotulo: s.rotulo),
          ],
          aoSelecionar: (escolha) {
            rascunho.sexo = escolha;
            aoMudar();
          },
        ),
        const SizedBox(height: BichuEspaco.e6),
        GrupoSegmentado<Porte>(
          rotulo: TextosDoAchado.rotuloDoPorte,
          selecionado: rascunho.porte,
          opcoes: <OpcaoSegmentada<Porte>>[
            for (final p in Porte.values)
              OpcaoSegmentada<Porte>(valor: p, rotulo: p.rotulo),
          ],
          aoSelecionar: (escolha) {
            rascunho.porte = escolha;
            aoMudar();
          },
        ),
        const SizedBox(height: BichuEspaco.e6),
        BlocoDaFotoDoAchado(
          foto: rascunho.foto,
          permissao: permissaoDaCamera,
          aoTirar: aoTirarFoto,
          aoEscolher: aoEscolherFoto,
          aoAbrirAjustes: aoAbrirAjustes,
        ),
      ],
    );
  }
}

/// **Passo 2: onde e quando.** `Quando?`, a localizacao e a observacao, nesta
/// ordem (cliente, 17/10/2026).
class _Passo2 extends StatelessWidget {
  const _Passo2({
    required this.rascunho,
    required this.observacao,
    required this.erro,
    required this.aoMudar,
    required this.aoEscolherData,
  });

  final RascunhoDoAchado rascunho;
  final TextEditingController observacao;
  final MensagemDeErro? erro;
  final VoidCallback aoMudar;
  final VoidCallback aoEscolherData;

  @override
  Widget build(BuildContext context) {
    return ListView(
      padding: const EdgeInsets.all(BichuEspaco.e4),
      addSemanticIndexes: false,
      children: <Widget>[
        const IndicadorDePasso(
          passo: 2,
          total: 2,
          titulo: TextosDoAchado.tituloDoPasso2,
        ),
        const SizedBox(height: BichuEspaco.e6),
        GrupoDeOpcoes<QuandoFoiVisto>(
          rotulo: TextosDoAchado.rotuloDeQuando,
          selecionado: rascunho.quando,
          opcoes: <OpcaoDeLinha<QuandoFoiVisto>>[
            for (final q in QuandoFoiVisto.values)
              OpcaoDeLinha<QuandoFoiVisto>(valor: q, rotulo: q.rotulo),
          ],
          aoSelecionar: (escolha) {
            rascunho.quando = escolha;
            // Trocar de `Outra data` para outra opcao **apaga** a data
            // escolhida: deixa-la guardada gravaria o achado com a data de um
            // calendario que a pessoa ja abandonou.
            if (!escolha.pedeCalendario) rascunho.dataEscolhida = null;
            aoMudar();
            if (escolha.pedeCalendario) aoEscolherData();
          },
        ),
        if (rascunho.quando?.pedeCalendario ?? false) ...<Widget>[
          const SizedBox(height: BichuEspaco.e3),
          DataEscolhidaDoAchado(
            data: rascunho.dataEscolhida,
            aoTrocar: aoEscolherData,
          ),
        ],
        const SizedBox(height: BichuEspaco.e6),
        Semantics(
          header: true,
          child: Text(
            TextosDoAchado.rotuloDeOnde,
            style: Theme.of(context).textTheme.titleMedium,
          ),
        ),
        const SizedBox(height: BichuEspaco.e4),
        // A PECA DA BICHUS-23, EMBUTIDA. Ver o cabecalho desta tela.
        CapturaDeLocalizacao(
          pontoDeUso: PontoDeUsoDaLocalizacao.registrarAchado,
          aoMudar: (onde) {
            rascunho.onde = onde;
            aoMudar();
          },
        ),
        const SizedBox(height: BichuEspaco.e6),
        BichuField(
          rotulo: TextosDoAchado.rotuloDaObservacao,
          controlador: observacao,
          // Opcional **em texto**, e nao por asterisco: asterisco falha para
          // leitor de tela e para quem nao conhece a convencao.
          opcional: true,
          linhas: 3,
          limite: RascunhoDoAchado.limiteDaObservacao,
          exemplo: TextosDoAchado.exemploDaObservacao,
          capitalizacao: TextCapitalization.sentences,
        ),
        if (erro != null) ...<Widget>[
          const SizedBox(height: BichuEspaco.e6),
          FaixaDeAviso(texto: erro!.texto),
        ],
      ],
    );
  }
}

/// O bloco da foto: a camera primeiro, sempre.
class BlocoDaFotoDoAchado extends StatelessWidget {
  const BlocoDaFotoDoAchado({
    required this.foto,
    required this.permissao,
    required this.aoTirar,
    required this.aoEscolher,
    required this.aoAbrirAjustes,
    super.key,
  });

  final FotoLocal? foto;
  final EstadoDaPermissao permissao;
  final VoidCallback aoTirar;
  final VoidCallback aoEscolher;
  final VoidCallback aoAbrirAjustes;

  @override
  Widget build(BuildContext context) {
    final cores = BichuColors.of(context).cores;
    final textos = Theme.of(context).textTheme;
    final escolhida = foto != null;

    return Column(
      crossAxisAlignment: CrossAxisAlignment.stretch,
      children: <Widget>[
        Semantics(
          header: true,
          child: Text(TextosDoAchado.rotuloDaFoto, style: textos.titleMedium),
        ),
        const SizedBox(height: BichuEspaco.e2),
        // O destino da foto, dito ANTES de ela ser tirada (criterio 9).
        Text(
          TextosDoAchado.fotoSoNaConversa,
          style: textos.bodyMedium?.copyWith(color: cores.textSecondary),
        ),
        const SizedBox(height: BichuEspaco.e1),
        // A orientacao de tamanho, uma linha, antes do envio (cliente,
        // 17/10/2026). Ela e orientacao e nao recusa: quem recusa e a politica
        // assinada, no balde, com o mesmo numero.
        Text(
          TextosDoAchado.orientacaoDaFoto,
          style: textos.bodySmall?.copyWith(color: cores.textSecondary),
        ),
        const SizedBox(height: BichuEspaco.e4),
        if (permissao == EstadoDaPermissao.negadaPermanentemente) ...<Widget>[
          FaixaDeAviso(
            peso: PesoDaFaixa.informativo,
            texto: TextosDoAchado.cameraNosAjustes,
            rotuloDaAcao: TextosDoAchado.abrirAjustes,
            aoTocarNaAcao: aoAbrirAjustes,
          ),
          const SizedBox(height: BichuEspaco.e4),
        ],
        // **Com `indisponivel` o botao da camera some**, e o oposto do caso
        // acima e de proposito: ali ha o que liberar e o botao ensina isso;
        // aqui nao ha, e um botao que nao leva a nada e pior que a ausencia
        // dele (design system 11.10).
        if (permissao == EstadoDaPermissao.indisponivel) ...<Widget>[
          const FaixaDeAviso(
            peso: PesoDaFaixa.informativo,
            texto: TextosDoAchado.semCamera,
          ),
          const SizedBox(height: BichuEspaco.e4),
        ] else ...<Widget>[
          BotaoSecundario(
            rotulo: escolhida
                ? TextosDoAchado.trocarAFoto
                : TextosDoAchado.tirarFoto,
            aoTocar: aoTirar,
          ),
          const SizedBox(height: BichuEspaco.e3),
        ],
        OutlinedButton(
          onPressed: aoEscolher,
          style: OutlinedButton.styleFrom(
            minimumSize: const Size.fromHeight(BichuAlvoDeToque.min),
          ),
          child: const Text(TextosDoAchado.escolherDaGaleria),
        ),
        if (escolhida) ...<Widget>[
          const SizedBox(height: BichuEspaco.e3),
          // **A IMAGEM, e nao a frase "Foto escolhida."** (cliente,
          // 17/10/2026). Desenhar o arquivo aqui dentro pediria `dart:io` em
          // `lib/telas`, que o portao de diretivas proibe -- entao quem
          // desenha e `PreviaDaFoto`, em `widgets/`, a MESMA peca do cadastro
          // de pet. Mais baixa que la (180 contra 300) porque este formulario
          // e longo e a foto aqui e opcional.
          //
          // Sem estado vazio: quem nao escolheu foto nao ganha um retangulo
          // cinza ocupando a tela para dizer que nao escolheu.
          PreviaDaFoto(
            foto: foto,
            descricao: TextosDoAchado.fotoEscolhidaDoAchado,
            altura: 180,
          ),
        ],
      ],
    );
  }
}

/// O motivo do botao desabilitado, anunciado quando aparece e quando muda.
class MotivoDoBloqueioDoAchado extends StatelessWidget {
  const MotivoDoBloqueioDoAchado({
    required this.texto,
    required this.cor,
    super.key,
  });

  final String texto;
  final Color cor;

  @override
  Widget build(BuildContext context) {
    final textos = Theme.of(context).textTheme;
    return Padding(
      padding: const EdgeInsets.only(bottom: BichuEspaco.e3),
      child: Semantics(
        liveRegion: true,
        child: Text(texto, style: textos.bodyMedium?.copyWith(color: cor)),
      ),
    );
  }
}

/// A data que o calendario devolveu, escrita por extenso.
///
/// **Ela e mostrada, e nao so guardada.** Sem esta linha, `Outra data` fica
/// selecionada sem a tela dizer qual data, e quem fechou o calendario por
/// engano nao tem como descobrir o que ficou gravado.
class DataEscolhidaDoAchado extends StatelessWidget {
  const DataEscolhidaDoAchado({
    required this.data,
    required this.aoTrocar,
    super.key,
  });

  final DateTime? data;
  final VoidCallback aoTrocar;

  /// `dd/mm/aaaa`, sem depender de `intl`: o app nao traz o pacote, e uma
  /// dependencia nova por uma linha de texto e custo que a historia nao pede.
  static String comoTexto(DateTime data) {
    final dia = data.day.toString().padLeft(2, '0');
    final mes = data.month.toString().padLeft(2, '0');
    return '$dia/$mes/${data.year}';
  }

  @override
  Widget build(BuildContext context) {
    final escolhida = data;
    final rotulo = escolhida == null
        ? 'Escolher a data'
        : 'Achei em ${comoTexto(escolhida)}. Trocar a data';
    return Semantics(
      button: true,
      label: rotulo,
      excludeSemantics: true,
      // **`onTap` redeclarado.** `excludeSemantics` apaga a arvore do filho e
      // levaria junto a acao que o `OutlinedButton` publica: e a forma exata
      // do `btn=true tap=false` que ja apareceu quatro vezes neste app.
      onTap: aoTrocar,
      child: OutlinedButton.icon(
        onPressed: aoTrocar,
        icon: const Icon(Icons.event_outlined, size: 24),
        label: Text(
          escolhida == null
              ? 'Escolher a data'
              : 'Achei em ${comoTexto(escolhida)}',
        ),
      ),
    );
  }
}
