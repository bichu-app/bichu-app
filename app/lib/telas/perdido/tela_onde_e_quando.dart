import 'package:flutter/material.dart';
import 'package:go_router/go_router.dart';

import '../../api/estados_brasileiros.dart';
import '../../escopo.dart';
import '../../perdido/quando_foi_visto.dart';
import '../../perdido/rascunho_do_caso.dart';
import '../../roteamento/rotas.dart';
import '../../theme/bichu_colors.dart';
import '../../theme/bichu_tokens.g.dart';
import '../../widgets/barra_de_acao_fixa.dart';
import '../../widgets/bichu_field.dart';
import '../../widgets/botao_primario.dart';
import '../../widgets/faixa_de_aviso.dart';
import '../../widgets/grupo_de_opcoes.dart';
import '../../widgets/seletor_de_lista.dart';
import '../../widgets/saida_da_tela.dart';
import 'cabecalho_do_pet.dart';

/// **F3.1 — Confirmar perdido: onde e quando.** A tela desta historia.
class TelaOndeEQuando extends StatefulWidget {
  const TelaOndeEQuando({
    required this.rascunho,
    super.key,
    this.agora = DateTime.now,
    this.erroInicial,
  });

  final RascunhoDoCaso rascunho;

  /// A falha da abertura que trouxe a pessoa de volta (UX 8.3, regra 4).
  final String? erroInicial;

  /// O relogio entra pela porta.
  final DateTime Function() agora;

  static const String titulo = 'Marcar como perdido';

  /// A pergunta de F3.1, palavra por palavra.
  static const String perguntaDeOnde = 'Onde ele foi visto pela última vez?';

  static const String perguntaDeQuando = 'Quando?';

  /// O rotulo do campo de estado, que deixou de ser `UF` digitada.
  static const String rotuloDoEstado = 'Estado';

  /// O que o seletor mostra enquanto nada foi escolhido.
  static const String escolherOEstado = 'Escolher na lista';

  /// O campo opcional do criterio 4, palavra por palavra.
  static const String perguntaDeAjuda =
      'Alguma coisa que ajude quem for procurar?';

  static const String exemploDeAjuda =
      'coleira vermelha, fugiu pelo portão da frente';

  static const String rotuloDeContinuar = 'Continuar';

  /// O criterio 10 dito na tela: o padrao e verdadeiro e a pessoa **ve** que e,
  /// em vez de responder mais uma pergunta no pior momento.
  static const String rotuloDaListaPublica =
      'Entrar na lista pública de pets perdidos';

  static const String explicacaoDaListaPublica =
      'A lista mostra a foto, o bairro e a data. Nunca o seu telefone nem o '
      'seu endereço.';

  @override
  State<TelaOndeEQuando> createState() => _TelaOndeEQuandoState();
}

class _TelaOndeEQuandoState extends State<TelaOndeEQuando> {
  late final TextEditingController _bairro;
  late final TextEditingController _cidade;
  late final TextEditingController _ajuda;

  String? _uf;

  final FocusNode _focoDoBairro = FocusNode();

  bool _preencheuDaReferencia = false;

  String? _erro;

  @override
  void initState() {
    super.initState();
    final r = widget.rascunho;
    _bairro = TextEditingController(text: r.bairro);
    _cidade = TextEditingController(text: r.cidade);
    _uf = siglaDeEstadoValida(r.uf);
    _ajuda = TextEditingController(text: r.descricao);
    _erro = widget.erroInicial;
  }

  @override
  void didChangeDependencies() {
    super.didChangeDependencies();
    if (_preencheuDaReferencia) return;
    _preencheuDaReferencia = true;

    final regiao = Escopo.of(context).sessao.usuario?.regiaoDeReferencia;
    if (regiao != null && widget.rascunho.area == null) {
      setState(() {
        if (_bairro.text.isEmpty) _bairro.text = regiao.bairro ?? '';
        if (_cidade.text.isEmpty) _cidade.text = regiao.cidade ?? '';
        _uf ??= siglaDeEstadoValida(regiao.uf);
        _sincronizar();
      });
    }

    if (widget.rascunho.area == null) {
      WidgetsBinding.instance.addPostFrameCallback((_) {
        if (mounted) _focoDoBairro.requestFocus();
      });
    }
  }

  @override
  void dispose() {
    _bairro.dispose();
    _cidade.dispose();
    _ajuda.dispose();
    _focoDoBairro.dispose();
    super.dispose();
  }

  void _sincronizar() {
    widget.rascunho
      ..bairro = _bairro.text
      ..cidade = _cidade.text
      ..uf = _uf ?? ''
      ..descricao = _ajuda.text;
  }

  void _aoDigitar(String _) => setState(() {
        _sincronizar();
        _erro = null;
      });

  Future<void> _escolherData() async {
    final agora = widget.agora();
    final escolhida = await showDatePicker(
      context: context,
      initialDate: widget.rascunho.dataEscolhida ?? agora,
      firstDate: agora.subtract(const Duration(days: 365)),
      lastDate: agora,
      helpText: 'Quando ele foi visto pela última vez',
    );
    if (escolhida == null || !mounted) return;
    setState(() => widget.rascunho.dataEscolhida = escolhida);
  }

  void _continuar() {
    final agora = widget.agora();
    final impedimento = widget.rascunho.impedimentoEm(agora);
    if (impedimento == ImpedimentoDeContinuar.semBairro) {
      _focoDoBairro.requestFocus();
      return;
    }
    if (impedimento != null) return;
    context.push(Rotas.marcarPerdidoAlcance, extra: widget.rascunho);
  }

  @override
  Widget build(BuildContext context) {
    final cores = BichuColors.of(context).cores;
    final textos = Theme.of(context).textTheme;
    final r = widget.rascunho;
    final agora = widget.agora();
    final impedimento = r.impedimentoEm(agora);

    return Scaffold(
      appBar: const BarraDeConta(
        titulo: TelaOndeEQuando.titulo,
        saida: TipoDeSaida.voltar,
      ),
      body: SafeArea(
        top: false,
        bottom: false,
        child: ListView(
          padding: const EdgeInsets.all(BichuEspaco.e4),
          addSemanticIndexes: false,
          children: <Widget>[
            CabecalhoDoPet(pet: r.pet),
            if (_erro != null) ...<Widget>[
              const SizedBox(height: BichuEspaco.e6),
              FaixaDeAviso(texto: _erro!),
            ],
            const SizedBox(height: BichuEspaco.e6),
            Semantics(
              header: true,
              child: Text(
                TelaOndeEQuando.perguntaDeOnde,
                style: textos.titleMedium,
              ),
            ),
            const SizedBox(height: BichuEspaco.e4),
            BichuField(
              rotulo: 'Bairro',
              controlador: _bairro,
              foco: _focoDoBairro,
              aoMudar: _aoDigitar,
              limite: 80,
              capitalizacao: TextCapitalization.words,
              acaoDeTeclado: TextInputAction.next,
            ),
            const SizedBox(height: BichuEspaco.e4),
            BichuField(
              rotulo: 'Cidade',
              controlador: _cidade,
              aoMudar: _aoDigitar,
              limite: 80,
              capitalizacao: TextCapitalization.words,
              acaoDeTeclado: TextInputAction.done,
              ajuda: 'A cidade é o que a gente precisa para achar quem está '
                  'por perto.',
            ),
            const SizedBox(height: BichuEspaco.e4),
            SeletorDeLista(
              rotulo: TelaOndeEQuando.rotuloDoEstado,
              estadoInicial: TelaOndeEQuando.escolherOEstado,
              itens: estadosBrasileiros,
              selecionado: _uf,
              aoSelecionar: (codigo) => setState(() {
                _uf = codigo;
                _sincronizar();
                _erro = null;
              }),
            ),
            const SizedBox(height: BichuEspaco.e6),
            GrupoDeOpcoes<QuandoFoiVisto>(
              rotulo: TelaOndeEQuando.perguntaDeQuando,
              selecionado: r.quando,
              opcoes: <OpcaoDeLinha<QuandoFoiVisto>>[
                for (final q in QuandoFoiVisto.values)
                  OpcaoDeLinha<QuandoFoiVisto>(valor: q, rotulo: q.rotulo),
              ],
              aoSelecionar: (escolha) {
                setState(() {
                  r.quando = escolha;
                  if (!escolha.pedeCalendario) r.dataEscolhida = null;
                });
                if (escolha.pedeCalendario) _escolherData();
              },
            ),
            if (r.quando != null && r.quando!.pedeCalendario) ...<Widget>[
              const SizedBox(height: BichuEspaco.e3),
              _DataEscolhida(
                data: r.dataEscolhida,
                aoTrocar: _escolherData,
              ),
            ],
            const SizedBox(height: BichuEspaco.e6),
            BichuField(
              rotulo: TelaOndeEQuando.perguntaDeAjuda,
              controlador: _ajuda,
              aoMudar: _aoDigitar,
              opcional: true,
              linhas: 3,
              limite: RascunhoDoCaso.limiteDaDescricao,
              exemplo: TelaOndeEQuando.exemploDeAjuda,
              capitalizacao: TextCapitalization.sentences,
            ),
            const SizedBox(height: BichuEspaco.e6),
            _ListaPublica(
              ligado: r.compartilharNaListaPublica,
              aoTrocar: (valor) => setState(
                () => r.compartilharNaListaPublica = valor,
              ),
            ),
          ],
        ),
      ),
      bottomNavigationBar: BarraDeAcaoFixa(
        acoes: <Widget>[
          if (impedimento != null)
            _MotivoDoBloqueio(texto: impedimento.texto, cor: cores.textPrimary),
          BotaoPrimario(
            rotulo: TelaOndeEQuando.rotuloDeContinuar,
            critico: true,
            aoTocar: impedimento == null ? _continuar : null,
          ),
        ],
      ),
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
        : 'Visto em ${comoTexto(escolhida)}. Trocar a data';
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
              : 'Visto em ${comoTexto(escolhida)}',
        ),
      ),
    );
  }
}

/// O interruptor da lista publica (criterio 10).
class _ListaPublica extends StatelessWidget {
  const _ListaPublica({required this.ligado, required this.aoTrocar});

  final bool ligado;
  final ValueChanged<bool> aoTrocar;

  @override
  Widget build(BuildContext context) {
    final cores = BichuColors.of(context).cores;
    final textos = Theme.of(context).textTheme;

    return Semantics(
      toggled: ligado,
      label: '${TelaOndeEQuando.rotuloDaListaPublica}. '
          '${TelaOndeEQuando.explicacaoDaListaPublica}',
      excludeSemantics: true,
      onTap: () => aoTrocar(!ligado),
      child: InkWell(
        onTap: () => aoTrocar(!ligado),
        borderRadius: BorderRadius.circular(BichuRaio.md),
        child: Padding(
          padding: const EdgeInsets.symmetric(vertical: BichuEspaco.e2),
          child: Row(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: <Widget>[
              Expanded(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: <Widget>[
                    Text(
                      TelaOndeEQuando.rotuloDaListaPublica,
                      style: textos.labelLarge,
                    ),
                    const SizedBox(height: BichuEspaco.e1),
                    Text(
                      TelaOndeEQuando.explicacaoDaListaPublica,
                      style: textos.bodySmall?.copyWith(
                        color: cores.textSecondary,
                      ),
                    ),
                  ],
                ),
              ),
              const SizedBox(width: BichuEspaco.e3),
              Switch(value: ligado, onChanged: aoTrocar),
            ],
          ),
        ),
      ),
    );
  }
}
