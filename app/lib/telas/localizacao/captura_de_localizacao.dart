import 'dart:async';

import 'package:flutter/material.dart';

import '../../acessibilidade/anunciar.dart';
import '../../formato/cep.dart';
import '../../api/estados_brasileiros.dart';
import '../../api/modelos_localizacao.dart';
import '../../dispositivo/localizacao.dart';
import '../../escopo.dart';
import '../../formulario/bloco_de_cep.dart';
import '../../formulario/origem_dos_valores.dart';
import '../../theme/bichu_colors.dart';
import '../../theme/bichu_tokens.g.dart';
import '../../widgets/bichu_field.dart';
import '../../widgets/botao_primario.dart';
import '../../widgets/faixa_de_aviso.dart';
import '../../widgets/seletor_de_lista.dart';
import 'antessala_de_localizacao.dart';
import 'textos_da_localizacao.dart';

/// A captura da localizacao **no ponto de uso** (BICHUS-23).
class CapturaDeLocalizacao extends StatefulWidget {
  const CapturaDeLocalizacao({
    required this.pontoDeUso,
    required this.aoMudar,
    super.key,
    this.prazoDaMedicao = const Duration(seconds: 12),
  });

  final PontoDeUsoDaLocalizacao pontoDeUso;

  /// Chamado a cada mudanca do "onde", inclusive com `null`.
  final ValueChanged<Onde?> aoMudar;

  /// Quanto tempo esperar o aparelho fixar antes de desistir.
  final Duration prazoDaMedicao;

  @override
  State<CapturaDeLocalizacao> createState() => _CapturaDeLocalizacaoState();
}

enum _Fase { escolhendo, capturando, comPonto, digitando }

class _CapturaDeLocalizacaoState extends State<CapturaDeLocalizacao> {
  /// **O achado NAO oferece a captura** (cliente, 29/10/2026: *"remove os
  /// botoes e deixa os campos de cep, endereco para o usuario preencher, no
  /// mesmo padrao das outras paginas"*).
  bool get _ofereceCaptura =>
      widget.pontoDeUso != PontoDeUsoDaLocalizacao.registrarAchado;

  late _Fase _fase;

  /// A regiao de referencia ja foi aplicada na montagem.
  bool _regiaoAplicada = false;

  PontoCapturado? _ponto;
  MotivoDeNaoTerPonto? _motivo;

  /// **Campo de busca, e nao campo do `Onde`.** Mora no estado desta peca pelo
  /// mesmo motivo dos outros dois controladores: e o que faz o que foi digitado
  /// sobreviver ao vai e volta entre os dois passos do formulario de achado
  /// (`IndexedStack`, que mantem os dois filhos montados).
  final TextEditingController _bairro = TextEditingController();
  final TextEditingController _cidade = TextEditingController();
  final FocusNode _focoDoBairro = FocusNode();

  /// AS CHAVES DOS TRES CAMPOS do `Onde`, para [OrigemDosValores].
  static const String _chaveBairro = 'bairro';
  static const String _chaveCidade = 'cidade';
  static const String _chaveUf = 'uf';

  /// DE ONDE VEIO O VALOR DE CADA CAMPO -- o mecanismo COMPARTILHADO, e nao um
  /// segundo.
  final OrigemDosValores _origem = OrigemDosValores();

  /// A sigla escolhida na lista de estados, ou nulo.
  String? _uf;

  /// O BLOCO DE CEP COMPARTILHADO -- `formulario/bloco_de_cep.dart`, o mesmo
  /// das outras cinco telas que tem CEP.
  ///
  /// **O campo de CEP mora nele**, e e por isso que ele sobrevive ao vai e
  /// volta entre os dois passos do formulario de achado: o bloco e deste
  /// estado, e o `IndexedStack` mantem os dois filhos montados.
  ///
  /// **Ele nao sabe de localizacao, e isso e a fronteira do ADR-0006.** O
  /// preenchimento da CIDADE pelo GPS (emenda 1, 19/10/2026) continua sendo
  /// `_preencherACidadeDaLocalizacao`, nesta tela, escrevendo so em `_cidade`.
  late final BlocoDeCep _cepBloco = BlocoDeCep(
    origem: _origem,
    atualizar: setState,
    montado: () => mounted,
    destino: DestinoDoCep(
      bairro: _bairro,
      chaveDoBairro: _chaveBairro,
      cidade: _cidade,
      chaveDaCidade: _chaveCidade,
      chaveDoEstado: _chaveUf,
      estadoEscolhido: () => _uf,
      aoEscolherEstado: (sigla) => _uf = sigla,
    ),
  );

  /// Os tres desfechos da busca, nos textos DESTA tela.
  static const TextosDaBuscaDeCep _textosDaBusca = TextosDaBuscaDeCep(
    indisponivel: TextosDaLocalizacao.buscaDoCepIndisponivel,
  );

  @override
  void initState() {
    super.initState();
    _fase = _ofereceCaptura ? _Fase.escolhendo : _Fase.digitando;
    for (final c in <TextEditingController>[_bairro, _cidade]) {
      c.addListener(_publicar);
    }
  }

  /// A regiao de referencia do tutor, para quem abre direto nos campos.
  @override
  void didChangeDependencies() {
    super.didChangeDependencies();
    if (_ofereceCaptura || _regiaoAplicada) return;
    _regiaoAplicada = true;
    WidgetsBinding.instance.addPostFrameCallback((_) {
      if (!mounted) return;
      setState(_preencherDaRegiaoDeReferencia);
      _publicar();
    });
  }

  @override
  void dispose() {
    for (final c in <TextEditingController>[_bairro, _cidade]) {
      c
        ..removeListener(_publicar)
        ..dispose();
    }
    _cepBloco.dispose();
    _focoDoBairro.dispose();
    super.dispose();
  }

  AreaDigitada? get _area => AreaDigitada.montar(
        cidade: _cidade.text,
        bairro: _bairro.text,
        uf: _uf,
      );

  /// A pessoa comecou a descrever a area e deixou a cidade de fora.
  bool get _faltaACidade =>
      _cidade.text.trim().isEmpty &&
      (_bairro.text.trim().isNotEmpty || _uf != null);

  void _publicar() {
    widget.aoMudar(montarOnde(ponto: _ponto, area: _area));
  }

  /// O CEP preenche os campos e, quando preencheu, o `Onde` sai de novo.
  ///
  /// **O nome e novo de proposito.** O nome antigo deste metodo e um dos
  /// marcadores do portao `bloco_de_cep_unico_test.dart`, que reprova a volta
  /// de uma copia privada do bloco dentro de uma tela -- e o portao nao abre
  /// excecao para prosa, porque excecao para prosa e por onde a copia volta.
  /// Aqui so sobrou o que e DESTA tela, publicar o `Onde`: a busca inteira
  /// esta no bloco compartilhado.
  Future<void> _oCepPreencheEPublica() async {
    if (await _cepBloco.buscar(Escopo.of(context).buscaDeCep)) _publicar();
  }

  /// A regiao de referencia do tutor nos campos que estao VAZIOS.
  void _preencherDaRegiaoDeReferencia() {
    final regiao = Escopo.of(context).sessao.usuario?.regiaoDeReferencia;
    if (regiao == null) return;
    _origem.doGuardado(_bairro, regiao.bairro ?? '', _chaveBairro);
    _origem.doGuardado(_cidade, regiao.cidade ?? '', _chaveCidade);
    final ufDaRegiao = siglaDeEstadoValida(regiao.uf);
    if (ufDaRegiao != null && _uf == null) {
      _uf = ufDaRegiao;
      _origem.anotarDaConta(_chaveUf, temValor: true);
    }
  }

  /// O caminho de `Usar minha localizacao`.
  Future<void> _usarALocalizacao() async {
    final porta = Escopo.of(context).localizacao;
    var permissao = await porta.estado();
    if (!mounted) return;

    if (permissao == PermissaoDeLocalizacao.naoPedida ||
        permissao == PermissaoDeLocalizacao.negada) {
      final resposta = await AntessalaDeLocalizacao.mostrar(
        context,
        pontoDeUso: widget.pontoDeUso,
      );
      if (!mounted) return;
      if (resposta == RespostaDaAntessala.digitarOBairro) {
        _irParaODigitado(null);
        return;
      }
      permissao = await porta.pedir();
      if (!mounted) return;
    }

    setState(() => _fase = _Fase.capturando);
    anunciar(context, TextosDaLocalizacao.capturando);

    final resultado = await porta.pontoAproximado(prazo: widget.prazoDaMedicao);
    if (!mounted) return;

    switch (resultado) {
      case CapturaComPonto(:final ponto):
        setState(() {
          _ponto = ponto;
          _motivo = null;
          _fase = _Fase.comPonto;
        });
        _publicar();
        unawaited(_preencherACidadeDaLocalizacao());
      case CapturaSemPonto(:final motivo):
        _irParaODigitado(motivo);
    }
  }

  /// A CIDADE DA LOCALIZACAO AUTORIZADA, nos campos que estao vazios.
  Future<void> _preencherACidadeDaLocalizacao() async {
    final resultado = await Escopo.of(context).localizacaoDaSessao.cidade();
    if (!mounted) return;
    if (resultado is! CidadeResolvida) return;
    final preencheu = _origem.doGuardado(
      _cidade,
      resultado.cidade,
      _chaveCidade,
    );
    if (!preencheu) return;
    setState(() {});
  }

  /// Vai para o campo de bairro **com o teclado aberto** (criterio 5), **a nao
  /// ser que o bairro ja venha preenchido**.
  void _irParaODigitado(MotivoDeNaoTerPonto? motivo) {
    setState(() {
      _ponto = null;
      _motivo = motivo;
      _fase = _Fase.digitando;
      _preencherDaRegiaoDeReferencia();
    });
    _publicar();
    if (_bairro.text.trim().isNotEmpty) return;
    WidgetsBinding.instance.addPostFrameCallback((_) {
      if (mounted) _focoDoBairro.requestFocus();
    });
  }

  @override
  Widget build(BuildContext context) {
    return Column(
      crossAxisAlignment: CrossAxisAlignment.stretch,
      children: <Widget>[
        ..._conteudoDaFase(),
      ],
    );
  }

  List<Widget> _conteudoDaFase() {
    switch (_fase) {
      case _Fase.escolhendo:
        return <Widget>[
          Text(
            TextosDaLocalizacao.oQueCadaCaminhoPreenche,
            style: Theme.of(context).textTheme.bodyMedium?.copyWith(
                  color: BichuColors.of(context).cores.textSecondary,
                ),
          ),
          const SizedBox(height: BichuEspaco.e4),
          BotaoPrimario(
            rotulo: TextosDaLocalizacao.usarMinhaLocalizacao,
            aoTocar: _usarALocalizacao,
          ),
          const SizedBox(height: BichuAlvoDeToque.gapConsequenciaAlta),
          OutlinedButton(
            onPressed: () => _irParaODigitado(null),
            style: OutlinedButton.styleFrom(
              minimumSize: const Size.fromHeight(BichuAlvoDeToque.min),
            ),
            child: const Text(TextosDaLocalizacao.preferoDigitarOBairro),
          ),
        ];

      case _Fase.capturando:
        return <Widget>[
          Semantics(
            liveRegion: true,
            child: Row(
              children: <Widget>[
                const SizedBox(
                  height: 20,
                  width: 20,
                  child: CircularProgressIndicator(strokeWidth: 2),
                ),
                const SizedBox(width: BichuEspaco.e4),
                Expanded(child: Text(TextosDaLocalizacao.capturando)),
              ],
            ),
          ),
        ];

      case _Fase.comPonto:
        final precisao = _ponto?.precisaoEmMetros;
        return <Widget>[
          FaixaDeAviso(
            peso: PesoDaFaixa.informativo,
            texto: precisao == null
                ? TextosDaLocalizacao.pontoSemPrecisao
                : TextosDaLocalizacao.pontoComPrecisao(
                    _arredondarPrecisao(precisao),
                  ),
          ),
          const SizedBox(height: BichuEspaco.e4),
          Text(TextosDaLocalizacao.bairroOpcionalComGps),
          const SizedBox(height: BichuEspaco.e4),
          ..._camposDeArea(comFoco: false),
          const SizedBox(height: BichuAlvoDeToque.gapConsequenciaAlta),
          OutlinedButton(
            onPressed: () => _irParaODigitado(null),
            style: OutlinedButton.styleFrom(
              minimumSize: const Size.fromHeight(BichuAlvoDeToque.min),
            ),
            child: const Text(TextosDaLocalizacao.trocarPeloBairro),
          ),
        ];

      case _Fase.digitando:
        return <Widget>[
          if (_motivo != null) ...<Widget>[
            FaixaDeAviso(
              peso: PesoDaFaixa.informativo,
              texto: _fraseDoMotivo(_motivo!),
              rotuloDaAcao: _rotuloDaAcaoDoMotivo(_motivo!),
              aoTocarNaAcao: _acaoDoMotivo(_motivo!),
            ),
            const SizedBox(height: BichuEspaco.e4),
          ],
          ..._camposDeArea(comFoco: _ofereceCaptura),
        ];
    }
  }

  /// CEP, bairro, cidade e estado, na mesma ordem nas duas fases.
  List<Widget> _camposDeArea({required bool comFoco}) => <Widget>[
        BichuField(
          rotulo: TextosDaLocalizacao.rotuloCep,
          controlador: _cepBloco.cep,
          opcional: true,
          limite: limiteDoCep,
          tipoDeTeclado: TextInputType.number,
          ajuda: TextosDaLocalizacao.ajudaDoCep,
          formatadores: formatadoresDeCep,
          correcaoAutomatica: false,
          aoMudar: (_) => _oCepPreencheEPublica(),
        ),
        if (_cepBloco.temDesfecho) ...<Widget>[
          const SizedBox(height: BichuEspaco.e2),
          LinhaDaBuscaDeCep(
            bloco: _cepBloco,
            textos: _textosDaBusca,
            anunciarEnquantoBusca: true,
          ),
        ],
        const SizedBox(height: BichuEspaco.e4),
        BichuField(
          rotulo: TextosDaLocalizacao.rotuloBairro,
          controlador: _bairro,
          foco: comFoco ? _focoDoBairro : null,
          opcional: true,
          capitalizacao: TextCapitalization.words,
          aoMudar: (_) => _origem.soltar(_chaveBairro),
        ),
        const SizedBox(height: BichuEspaco.e4),
        BichuField(
          rotulo: TextosDaLocalizacao.rotuloCidade,
          controlador: _cidade,
          opcional: _ponto != null,
          capitalizacao: TextCapitalization.words,
          erro: _faltaACidade ? TextosDaLocalizacao.cidadeObrigatoria : null,
          aoMudar: (_) => _origem.soltar(_chaveCidade),
        ),
        const SizedBox(height: BichuEspaco.e4),
        SeletorDeLista(
          rotulo: TextosDaLocalizacao.rotuloEstado,
          estadoInicial: TextosDaLocalizacao.escolherOEstado,
          itens: estadosBrasileiros,
          selecionado: _uf,
          aoSelecionar: (codigo) {
            setState(() {
              _uf = codigo;
              _origem.soltar(_chaveUf);
            });
            _publicar();
          },
        ),
      ];

  /// Arredonda para cima, em centenas de metros.
  static int _arredondarPrecisao(double metros) {
    if (metros <= 0) return 100;
    return (metros / 100).ceil() * 100;
  }

  String _fraseDoMotivo(MotivoDeNaoTerPonto motivo) => switch (motivo) {
        MotivoDeNaoTerPonto.permissaoNegada =>
          TextosDaLocalizacao.negouDestaVez,
        MotivoDeNaoTerPonto.permissaoNegadaPermanentemente =>
          TextosDaLocalizacao.negouEmDefinitivo,
        MotivoDeNaoTerPonto.servicoDesligado =>
          TextosDaLocalizacao.servicoDesligado,
        MotivoDeNaoTerPonto.semFixNoPrazo => TextosDaLocalizacao.semFixNoPrazo,
        MotivoDeNaoTerPonto.indisponivel => TextosDaLocalizacao.indisponivel,
      };

  /// So dois dos cinco motivos tem acao, e os outros tres nao ganham uma de
  /// enfeite: um botao que nao muda nada e pior que nenhum botao.
  String? _rotuloDaAcaoDoMotivo(MotivoDeNaoTerPonto motivo) =>
      switch (motivo) {
        MotivoDeNaoTerPonto.permissaoNegadaPermanentemente ||
        MotivoDeNaoTerPonto.servicoDesligado =>
          TextosDaLocalizacao.abrirAjustes,
        MotivoDeNaoTerPonto.semFixNoPrazo ||
        MotivoDeNaoTerPonto.permissaoNegada =>
          TextosDaLocalizacao.tentarDeNovo,
        MotivoDeNaoTerPonto.indisponivel => null,
      };

  VoidCallback? _acaoDoMotivo(MotivoDeNaoTerPonto motivo) => switch (motivo) {
        MotivoDeNaoTerPonto.permissaoNegadaPermanentemente ||
        MotivoDeNaoTerPonto.servicoDesligado =>
          () => Escopo.of(context).localizacao.abrirAjustesDoSistema(),
        MotivoDeNaoTerPonto.semFixNoPrazo ||
        MotivoDeNaoTerPonto.permissaoNegada =>
          _usarALocalizacao,
        MotivoDeNaoTerPonto.indisponivel => null,
      };
}
