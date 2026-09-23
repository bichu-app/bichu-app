import 'package:flutter/material.dart';
import 'package:go_router/go_router.dart';

import '../../achado/rascunho_do_achado.dart';
import '../../api/achados_api.dart';
import '../../api/api_client.dart';
import '../../api/falhas.dart';
import '../../api/fila_offline.dart';
import '../../api/mensagens_de_erro.dart';
import '../../api/modelos_pet.dart';
import '../../api/problem.dart';
import '../../dispositivo/camera_e_galeria.dart';
import '../../escopo.dart';
import '../../intencao/achado_como_intencao.dart';
import '../../perdido/quando_foi_visto.dart';
import '../../roteamento/rotas.dart';
import '../../theme/bichu_colors.dart';
import '../../theme/bichu_tokens.g.dart';
import '../../widgets/barra_de_acao_fixa.dart';
import '../../widgets/bichu_field.dart';
import '../../widgets/botao_primario.dart';
import '../../widgets/faixa_de_aviso.dart';
import '../../widgets/grupo_de_opcoes.dart';
import '../../widgets/grupo_segmentado.dart';
import '../../widgets/saida_da_tela.dart';
import '../../widgets/seletor_de_lista.dart';
import '../localizacao/antessala_de_localizacao.dart';
import '../localizacao/captura_de_localizacao.dart';
import 'resultado_do_achado.dart';
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
/// embutida por esta tela e por F3.1. Ela ja trata os cinco motivos de nao
/// haver ponto, a antessala, o prazo de 12 s e a precisao arredondada para
/// cima -- e ja oferece o campo de bairro **junto** com o GPS, que e o caminho
/// conservador da pergunta que foi para a pauta de refinamento. Esta tela
/// consome o `Onde?` que ela publica e nao sabe nada sobre permissao.
///
/// ## O que esta tela faz quando nao ha rotulo de area
///
/// Ela **diz**. Quem concede o GPS e nao digita nada aparece para o tutor com
/// a distancia e sem o bairro, porque `area_label` so se monta com texto
/// digitado (`rotuloDaArea` le `city` e `neighborhood`, e coordenada nao entra
/// ali nem arredondada). Derivar o bairro da coordenada e o que o ADR-0006
/// proibe. Entao a tela escreve [TextosDoAchado.semRotuloDeArea] ao lado da
/// captura, com o campo de bairro a um toque -- e **nao bloqueia nada**.
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
    final escopo = Escopo.of(context);
    final agora = widget.agora();
    final especie = _rascunho.especie;
    final porte = _rascunho.porte;
    final onde = _rascunho.onde;
    final achadoEm = _rascunho.instanteEm(agora);
    if (especie == null || porte == null || onde == null || achadoEm == null) {
      // Defesa de programacao: o botao so habilita com os quatro. Chegar aqui
      // sem eles e caminho de automacao ou de teclado fisico, e a tela responde
      // a coisa certa em vez de montar um corpo pela metade.
      return;
    }
    _rascunho.observacao = _observacao.text;

    // **Deslogada: a guarda assume ANTES da viagem de rede** (criterio 3).
    //
    // Nao e otimizacao: um POST sem token volta 401, e tratar o 401 seria
    // esperar o servidor dizer o que o app ja sabe -- na rua, com o sinal que
    // ha. O envelope guarda tudo, inclusive o caminho da foto, e depois de
    // autenticar o achado e REGISTRADO e a pessoa cai na tela do achado. Ela
    // nao ve a home e nao digita nada duas vezes.
    if (!escopo.sessao.logado) {
      await escopo.guarda.guardar(
        intencaoDeRegistrarAchado(_rascunho, criadaEm: agora),
      );
      if (!mounted) return;
      context.push(Rotas.entrar);
      return;
    }

    final chave = _chave ??= ApiClient.novaChaveDeIdempotencia();
    final corpo = AchadosApi.corpoDeRegistro(
      especie: especie,
      porte: porte,
      achadoEm: achadoEm,
      onde: onde,
      sexo: _rascunho.sexo,
      racaCodigo: _rascunho.racaCodigo,
      corCodigo: _rascunho.corCodigo,
      versaoDaReferencia: _rascunho.versaoDaReferencia,
      observacao: _rascunho.observacao,
      shareToken: _rascunho.shareToken,
    );

    setState(() {
      _fase = _Fase.enviando;
      _erro = null;
      _erroInicial = null;
    });

    try {
      final achado = await escopo.achados.registrar(
        corpo: corpo,
        idempotencyKey: chave,
      );
      if (!mounted) return;
      context.pushReplacement(
        Rotas.achadoRegistrado,
        extra: ResultadoDoAchado.registrado(
          achado: achado,
          foto: _rascunho.foto,
        ),
      );
    } on FalhaDeConexao {
      // **A acao vai para a fila, e a tela diz que ela foi para a fila.**
      // O criterio 2 da BICHUS-31 proibe tela de sucesso para o que nao
      // aconteceu: "achado registrado" seria mentira, e a pessoa pararia de
      // procurar caminho por acreditar que o aviso saiu.
      //
      // **A foto nao vai junto**, e a tela diz isso tambem: o corpo
      // enfileirado e o corpo do contrato, e o upload da foto exige um achado
      // que ainda nao existe. Achado sem foto vale menos, mas vale.
      await escopo.fila.enfileirar(
        AcaoEnfileirada(
          id: ApiClient.novaChaveDeIdempotencia(),
          metodo: 'POST',
          caminho: AchadosApi.caminhoDeRegistro,
          corpo: corpo,
          // A MESMA chave. Ver [_chave].
          idempotencyKey: chave,
          criadaEm: agora,
        ),
      );
      if (!mounted) return;
      context.pushReplacement(
        Rotas.achadoRegistrado,
        extra: ResultadoDoAchado.naFila(foto: _rascunho.foto),
      );
    } on FalhaDaApi catch (falha) {
      if (!mounted) return;
      if (falha.tipo == ProblemTipo.naoAutenticado ||
          falha.tipo == ProblemTipo.tokenExpirado) {
        // A sessao caiu entre abrir a tela e tocar no botao. Mesmo caminho do
        // deslogado: o envelope guarda, e o achado e registrado depois.
        await escopo.guarda.guardar(
          intencaoDeRegistrarAchado(_rascunho, criadaEm: agora),
        );
        if (!mounted) return;
        context.push(Rotas.entrar);
        setState(() => _fase = _Fase.preenchendo);
        return;
      }
      setState(() {
        _fase = _Fase.preenchendo;
        _erro = MensagensDeErro.de(falha);
      });
    } on FalhaDeChamada catch (falha) {
      if (!mounted) return;
      setState(() {
        _fase = _Fase.preenchendo;
        _erro = MensagensDeErro.de(falha);
      });
    }
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

  /// A frase sobre o lugar, ou nada.
  ///
  /// **Tres estados e nao dois**: com ponto e sem texto, com texto e sem
  /// ponto, e com os dois (que nao precisa de aviso nenhum). Sem lugar
  /// nenhum, quem fala e o impedimento do botao, e repetir a informacao aqui
  /// seria dizer duas vezes.
  String? get _avisoDoLugar {
    final onde = _rascunho.onde;
    if (onde == null) return null;
    if (!_rascunho.temRotuloDeArea) return TextosDoAchado.semRotuloDeArea;
    if (!_rascunho.temCoordenada) return TextosDoAchado.semCoordenada;
    return null;
  }

  @override
  Widget build(BuildContext context) {
    final cores = BichuColors.of(context).cores;
    final textos = Theme.of(context).textTheme;
    final agora = widget.agora();
    final impedimento = _rascunho.impedimentoEm(agora);
    final aviso = _avisoDoLugar;

    return Scaffold(
      appBar: const BarraDeConta(
        titulo: TextosDoAchado.titulo,
        saida: TipoDeSaida.voltar,
      ),
      body: SafeArea(
        top: false,
        bottom: false,
        child: ListView(
          padding: const EdgeInsets.all(BichuEspaco.e4),
          // Pelo mesmo motivo da BICHUS-62: o padrao do `ListView` embrulha
          // cada filho direto num `IndexedSemantics`, e com ele cada bloco
          // desta tela viraria UM no de semantica com tudo colapsado dentro.
          // Este e o corpo rolavel de uma pagina, e nao uma lista de itens.
          addSemanticIndexes: false,
          children: <Widget>[
            Semantics(
              header: true,
              child: Text(TextosDoAchado.chamada, style: textos.headlineSmall),
            ),
            const SizedBox(height: BichuEspaco.e2),
            Text(
              TextosDoAchado.soOQueDerParaVer,
              style: textos.bodyLarge?.copyWith(color: cores.textSecondary),
            ),
            if (_erroInicial != null) ...<Widget>[
              const SizedBox(height: BichuEspaco.e6),
              FaixaDeAviso(texto: _erroInicial!),
            ],
            const SizedBox(height: BichuEspaco.e6),
            _BlocoDaFoto(
              foto: _rascunho.foto,
              permissao: _permissaoDaCamera,
              aoTirar: _tirarFoto,
              aoEscolher: _escolherDaGaleria,
              aoAbrirAjustes: () =>
                  Escopo.of(context).camera.abrirAjustesDoSistema(),
            ),
            const SizedBox(height: BichuEspaco.e6),
            GrupoSegmentado<Especie>(
              rotulo: TextosDoAchado.rotuloDaEspecie,
              selecionado: _rascunho.especie,
              opcoes: <OpcaoSegmentada<Especie>>[
                for (final e in Especie.values)
                  OpcaoSegmentada<Especie>(valor: e, rotulo: e.rotulo),
              ],
              aoSelecionar: (escolha) => setState(() {
                _rascunho.especie = escolha;
                // Trocar de especie **apaga a raca escolhida**: a lista de
                // racas e por especie, e um `shih_tzu` guardado sob `cat`
                // viajaria para o servidor e sairia do cruzamento pela porta
                // errada.
                _rascunho.racaCodigo = null;
              }),
            ),
            const SizedBox(height: BichuEspaco.e6),
            GrupoSegmentado<Porte>(
              rotulo: TextosDoAchado.rotuloDoPorte,
              selecionado: _rascunho.porte,
              opcoes: <OpcaoSegmentada<Porte>>[
                for (final p in Porte.values)
                  OpcaoSegmentada<Porte>(valor: p, rotulo: p.rotulo),
              ],
              aoSelecionar: (escolha) =>
                  setState(() => _rascunho.porte = escolha),
            ),
            const SizedBox(height: BichuEspaco.e6),
            SeletorDeLista(
              rotulo: TextosDoAchado.rotuloDaRaca,
              estadoInicial: TextosDoAchado.escolherNaLista,
              ajuda: TextosDoAchado.listaSoSeVoceSouber,
              itens: _racas,
              // Desabilitado sem especie, porque a lista e POR especie, e
              // desabilitado sem lista, porque nao ha o que escolher.
              habilitado: _racas.isNotEmpty,
              selecionado: _rascunho.racaCodigo,
              aoSelecionar: (codigo) =>
                  setState(() => _rascunho.racaCodigo = codigo),
            ),
            const SizedBox(height: BichuEspaco.e4),
            SeletorDeLista(
              rotulo: TextosDoAchado.rotuloDaCor,
              estadoInicial: TextosDoAchado.escolherNaLista,
              ajuda: TextosDoAchado.listaSoSeVoceSouber,
              // **Rotulada em texto, nunca amostra de cor sem nome**
              // (criterio 2). `SeletorDeLista` so conhece rotulo, e e por isso
              // que ele e o componente certo aqui.
              itens: _cores,
              habilitado: _cores.isNotEmpty,
              selecionado: _rascunho.corCodigo,
              aoSelecionar: (codigo) =>
                  setState(() => _rascunho.corCodigo = codigo),
            ),
            const SizedBox(height: BichuEspaco.e6),
            GrupoSegmentado<Sexo>(
              rotulo: TextosDoAchado.rotuloDoSexo,
              selecionado: _rascunho.sexo,
              opcoes: <OpcaoSegmentada<Sexo>>[
                for (final s in Sexo.values)
                  OpcaoSegmentada<Sexo>(valor: s, rotulo: s.rotulo),
              ],
              aoSelecionar: (escolha) =>
                  setState(() => _rascunho.sexo = escolha),
            ),
            const SizedBox(height: BichuEspaco.e6),
            Semantics(
              header: true,
              child: Text(
                TextosDoAchado.rotuloDeOnde,
                style: textos.titleMedium,
              ),
            ),
            const SizedBox(height: BichuEspaco.e4),
            // A PECA DA BICHUS-23, EMBUTIDA. Ver o cabecalho desta classe.
            CapturaDeLocalizacao(
              pontoDeUso: PontoDeUsoDaLocalizacao.registrarAchado,
              aoMudar: (onde) => setState(() => _rascunho.onde = onde),
            ),
            if (aviso != null) ...<Widget>[
              const SizedBox(height: BichuEspaco.e4),
              FaixaDeAviso(peso: PesoDaFaixa.informativo, texto: aviso),
            ],
            const SizedBox(height: BichuEspaco.e6),
            GrupoDeOpcoes<QuandoFoiVisto>(
              rotulo: TextosDoAchado.rotuloDeQuando,
              selecionado: _rascunho.quando,
              opcoes: <OpcaoDeLinha<QuandoFoiVisto>>[
                for (final q in QuandoFoiVisto.values)
                  OpcaoDeLinha<QuandoFoiVisto>(valor: q, rotulo: q.rotulo),
              ],
              aoSelecionar: (escolha) {
                setState(() {
                  _rascunho.quando = escolha;
                  // Trocar de `Outra data` para outra opcao **apaga** a data
                  // escolhida: deixa-la guardada gravaria o achado com a data
                  // de um calendario que a pessoa ja abandonou.
                  if (!escolha.pedeCalendario) _rascunho.dataEscolhida = null;
                });
                if (escolha.pedeCalendario) _escolherData();
              },
            ),
            if (_rascunho.quando?.pedeCalendario ?? false) ...<Widget>[
              const SizedBox(height: BichuEspaco.e3),
              _DataEscolhida(
                data: _rascunho.dataEscolhida,
                aoTrocar: _escolherData,
              ),
            ],
            const SizedBox(height: BichuEspaco.e6),
            BichuField(
              rotulo: TextosDoAchado.rotuloDaObservacao,
              controlador: _observacao,
              // Opcional **em texto**, e nao por asterisco: asterisco falha
              // para leitor de tela e para quem nao conhece a convencao.
              opcional: true,
              linhas: 3,
              limite: RascunhoDoAchado.limiteDaObservacao,
              exemplo: TextosDoAchado.exemploDaObservacao,
              capitalizacao: TextCapitalization.sentences,
            ),
            if (_erro != null) ...<Widget>[
              const SizedBox(height: BichuEspaco.e6),
              FaixaDeAviso(texto: _erro!.texto),
            ],
          ],
        ),
      ),
      bottomNavigationBar: BarraDeAcaoFixa(
        acoes: <Widget>[
          // **O MOTIVO, VISIVEL, ACIMA DO BOTAO.** A ordem de leitura precisa
          // entregar o motivo antes do controle: quem usa leitor de tela
          // chegaria no botao desabilitado sem ter ouvido por que.
          if (impedimento != null)
            _MotivoDoBloqueio(
              texto: impedimento.texto,
              cor: cores.textPrimary,
            ),
          BotaoPrimario(
            rotulo: TextosDoAchado.registrar,
            critico: true,
            carregando: _fase == _Fase.enviando,
            aoTocar: (impedimento != null || _fase == _Fase.enviando)
                ? null
                : _registrar,
          ),
        ],
      ),
    );
  }
}

/// O bloco da foto: a camera primeiro, sempre.
class _BlocoDaFoto extends StatelessWidget {
  const _BlocoDaFoto({
    required this.foto,
    required this.permissao,
    required this.aoTirar,
    required this.aoEscolher,
    required this.aoAbrirAjustes,
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
          // **O nome do arquivo, e nao os pixels.** Desenhar a imagem aqui
          // pediria `dart:io` dentro de `lib/telas`, que o portao de diretivas
          // proibe -- e com razao: tela que abre arquivo e tela que fala com o
          // aparelho por fora da porta.
          Text(
            'Foto escolhida.',
            style: textos.bodyMedium?.copyWith(color: cores.textSecondary),
          ),
        ],
      ],
    );
  }
}

/// O motivo do botao desabilitado, anunciado quando aparece e quando muda.
class _MotivoDoBloqueio extends StatelessWidget {
  const _MotivoDoBloqueio({required this.texto, required this.cor});

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
class _DataEscolhida extends StatelessWidget {
  const _DataEscolhida({required this.data, required this.aoTrocar});

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
