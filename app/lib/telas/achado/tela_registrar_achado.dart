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
import '../../widgets/recorte_de_imagem.dart';
import '../../widgets/saida_da_tela.dart';
import '../../widgets/seletor_de_lista.dart';
import '../localizacao/antessala_de_localizacao.dart';
import '../localizacao/captura_de_localizacao.dart';
import 'textos_do_achado.dart';

/// **F3.5 — Registrar um achado avulso, sem QR.** A tela desta historia.
class TelaRegistrarAchado extends StatefulWidget {
  const TelaRegistrarAchado({
    super.key,
    this.rascunho,
    this.erroInicial,
    this.agora = DateTime.now,
  });

  /// O rascunho, quando a pessoa esta voltando (envelope de intencao que
  /// falhou).
  final RascunhoDoAchado? rascunho;

  /// A falha da tentativa que trouxe a pessoa de volta (UX 8.3, regra 4).
  final String? erroInicial;

  /// O relogio entra pela porta.
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

  String? _chave;

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
    if (!mounted || foto == null) return;
    final ajustada = await _ajustar(camera, foto);
    if (!mounted || ajustada == null) return;
    setState(() => _rascunho.foto = ajustada);
  }

  Future<void> _escolherDaGaleria() async {
    final camera = Escopo.of(context).camera;
    final foto = await camera.escolherDaGaleria();
    if (!mounted || foto == null) return;
    final ajustada = await _ajustar(camera, foto);
    if (!mounted || ajustada == null) return;
    setState(() => _rascunho.foto = ajustada);
  }

  Future<FotoLocal?> _ajustar(CameraEGaleria camera, FotoLocal foto) =>
      ajustarAFoto(
        context,
        camera: camera,
        foto: foto,
        formato: FormatoDoRecorte.fotoDoAchado,
        titulo: 'Ajuste a foto do animal',
      );

  Future<void> _escolherData() async {
    final agora = widget.agora();
    final escolhida = await showDatePicker(
      context: context,
      initialDate: _rascunho.dataEscolhida ?? agora,
      firstDate: agora.subtract(const Duration(days: 365)),
      lastDate: agora,
      helpText: 'Quando você achou',
    );
    if (escolhida == null || !mounted) return;
    setState(() => _rascunho.dataEscolhida = escolhida);
  }

  Future<void> _registrar() async {
    _rascunho.observacao = _observacao.text;
    final chave = _chave ??= ApiClient.novaChaveDeIdempotencia();
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

  int _passo = 0;

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

  Widget _barra(BichuCores cores, DateTime agora) {
    if (_passo == 0) {
      final impedimento = _rascunho.impedimentoDoPasso1();
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

  /// Avisa a tela de que o rascunho mudou.
  final VoidCallback aoMudar;

  final VoidCallback aoTirarFoto;
  final VoidCallback aoEscolherFoto;
  final VoidCallback aoAbrirAjustes;

  @override
  Widget build(BuildContext context) {
    return ListView(
      padding: const EdgeInsets.all(BichuEspaco.e4),
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
          rotulo: TextosDoAchado.nomeDaEspecie,
          rotuloVisivel: false,
          selecionado: rascunho.especie,
          opcoes: <OpcaoSegmentada<Especie>>[
            for (final e in Especie.values)
              OpcaoSegmentada<Especie>(valor: e, rotulo: e.rotulo),
          ],
          aoSelecionar: (escolha) {
            rascunho.especie = escolha;
            rascunho.racaCodigo = null;
            aoMudar();
          },
        ),
        const SizedBox(height: BichuEspaco.e6),
        SeletorDeLista(
          rotulo: TextosDoAchado.rotuloDaRaca,
          estadoInicial: TextosDoAchado.escolherNaLista,
          itens: racas,
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
        Text(
          TextosDoAchado.fotoSoNaConversa,
          style: textos.bodyMedium?.copyWith(color: cores.textSecondary),
        ),
        const SizedBox(height: BichuEspaco.e1),
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
