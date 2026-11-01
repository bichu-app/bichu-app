import 'package:flutter/material.dart';

import '../../achado/envio_do_achado.dart';
import '../../achado/rascunho_do_achado.dart';
import '../../api/api_client.dart';
import '../../api/mensagens_de_erro.dart';
import '../../api/modelos_perdido.dart';
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
import '../../widgets/imagem_da_rede.dart';
import '../../widgets/saida_da_tela.dart';
import '../localizacao/antessala_de_localizacao.dart';
import '../localizacao/captura_de_localizacao.dart';
import 'tela_registrar_achado.dart';
import '../../widgets/recorte_de_imagem.dart';
import 'textos_do_achado.dart';

/// **Achei ESTE pet** — o destino de `Encontrei este animal` na pagina publica
/// de um caso.
class TelaEncontreiEstePet extends StatefulWidget {
  const TelaEncontreiEstePet({
    required this.perdido,
    super.key,
    this.agora = DateTime.now,
  });

  /// O caso, como a pagina publica o leu.
  final PerdidoPublico perdido;

  /// O relogio entra pela porta, como em F3.5: sem isso, "amanha nao e aceito"
  /// so seria exercitavel esperando um dia.
  final DateTime Function() agora;

  @override
  State<TelaEncontreiEstePet> createState() => _TelaEncontreiEstePetState();
}

enum _Fase { preenchendo, enviando }

class _TelaEncontreiEstePetState extends State<TelaEncontreiEstePet> {
  late final RascunhoDoAchado _rascunho = RascunhoDoAchado(
    especie: widget.perdido.especie,
    porte: widget.perdido.porte,
    shareToken: widget.perdido.shareToken,
  );

  late final TextEditingController _recado = TextEditingController();

  _Fase _fase = _Fase.preenchendo;
  MensagemDeErro? _erro;
  EstadoDaPermissao _permissaoDaCamera = EstadoDaPermissao.negada;

  String? _chave;

  bool _consultou = false;

  @override
  void didChangeDependencies() {
    super.didChangeDependencies();
    if (_consultou) return;
    _consultou = true;
    _consultarACamera();
  }

  @override
  void dispose() {
    _recado.dispose();
    super.dispose();
  }

  Future<void> _consultarACamera() async {
    final estado = await Escopo.of(context).camera.estadoDaCamera();
    if (!mounted) return;
    setState(() => _permissaoDaCamera = estado);
  }

  Future<void> _tirarFoto() async {
    final camera = Escopo.of(context).camera;
    final foto = await camera.tirarFoto();
    if (!mounted) return;
    if (foto == null) {
      await _consultarACamera();
      return;
    }
    final ajustada = await _ajustar(camera, foto);
    if (!mounted) return;
    if (ajustada != null) setState(() => _rascunho.foto = ajustada);
    await _consultarACamera();
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
      firstDate: DateTime(agora.year - 1),
      lastDate: agora,
    );
    if (!mounted) return;
    setState(() {
      if (escolhida != null) _rascunho.dataEscolhida = escolhida;
    });
  }

  Future<void> _avisar() async {
    _rascunho.observacao = _recado.text;
    final chave = _chave ??= ApiClient.novaChaveDeIdempotencia();
    await enviarAchado(
      context: context,
      rascunho: _rascunho,
      agora: widget.agora(),
      chave: chave,
      aoComecar: () => setState(() {
        _fase = _Fase.enviando;
        _erro = null;
      }),
      aoFalhar: (erro) => setState(() {
        _fase = _Fase.preenchendo;
        _erro = erro;
      }),
      aoVoltarDoLogin: () => setState(() => _fase = _Fase.preenchendo),
    );
  }

  @override
  Widget build(BuildContext context) {
    final cores = BichuColors.of(context).cores;
    final textos = Theme.of(context).textTheme;
    final agora = widget.agora();
    final impedimento = _rascunho.impedimentoDoPasso2(agora);

    return Scaffold(
      appBar: const BarraDeConta(
        titulo: TextosDoAchado.tituloDeEncontrei,
        saida: TipoDeSaida.voltar,
      ),
      body: SafeArea(
        top: false,
        bottom: false,
        child: ListView(
          padding: const EdgeInsets.all(BichuEspaco.e4),
          addSemanticIndexes: false,
          children: <Widget>[
            Semantics(
              header: true,
              child: Text(
                TextosDoAchado.chamadaDeEncontrei(widget.perdido.nome),
                style: textos.titleLarge,
              ),
            ),
            const SizedBox(height: BichuEspaco.e2),
            Text(
              TextosDoAchado.oQueJaSabemos,
              style: textos.bodyMedium?.copyWith(color: cores.textSecondary),
            ),
            const SizedBox(height: BichuEspaco.e6),
            _CartaoDoPet(perdido: widget.perdido),
            const SizedBox(height: BichuEspaco.e6),
            GrupoDeOpcoes<QuandoFoiVisto>(
              rotulo: TextosDoAchado.rotuloDeQuando,
              selecionado: _rascunho.quando,
              opcoes: <OpcaoDeLinha<QuandoFoiVisto>>[
                for (final q in QuandoFoiVisto.values)
                  OpcaoDeLinha<QuandoFoiVisto>(valor: q, rotulo: q.rotulo),
              ],
              aoSelecionar: (escolha) {
                _rascunho.quando = escolha;
                if (!escolha.pedeCalendario) _rascunho.dataEscolhida = null;
                setState(() {});
                if (escolha.pedeCalendario) _escolherData();
              },
            ),
            if (_rascunho.quando?.pedeCalendario ?? false) ...<Widget>[
              const SizedBox(height: BichuEspaco.e3),
              DataEscolhidaDoAchado(
                data: _rascunho.dataEscolhida,
                aoTrocar: _escolherData,
              ),
            ],
            const SizedBox(height: BichuEspaco.e6),
            Semantics(
              header: true,
              child: Text(
                TextosDoAchado.rotuloDeOnde,
                style: textos.titleMedium,
              ),
            ),
            const SizedBox(height: BichuEspaco.e4),
            CapturaDeLocalizacao(
              pontoDeUso: PontoDeUsoDaLocalizacao.registrarAchado,
              aoMudar: (onde) {
                _rascunho.onde = onde;
                setState(() {});
              },
            ),
            const SizedBox(height: BichuEspaco.e6),
            BichuField(
              rotulo: TextosDoAchado.rotuloDoRecado,
              controlador: _recado,
              opcional: true,
              linhas: 3,
              limite: RascunhoDoAchado.limiteDaObservacao,
              exemplo: TextosDoAchado.exemploDoRecado,
              capitalizacao: TextCapitalization.sentences,
            ),
            const SizedBox(height: BichuEspaco.e6),
            BlocoDaFotoDoAchado(
              foto: _rascunho.foto,
              permissao: _permissaoDaCamera,
              aoTirar: _tirarFoto,
              aoEscolher: _escolherDaGaleria,
              aoAbrirAjustes: () =>
                  Escopo.of(context).camera.abrirAjustesDoSistema(),
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
          if (impedimento != null)
            MotivoDoBloqueioDoAchado(
              texto: impedimento.texto,
              cor: cores.textPrimary,
            ),
          BotaoPrimario(
            rotulo: TextosDoAchado.avisarOTutor,
            critico: true,
            carregando: _fase == _Fase.enviando,
            aoTocar: (impedimento != null || _fase == _Fase.enviando)
                ? null
                : _avisar,
          ),
        ],
      ),
    );
  }
}

/// O cartao de LEITURA do pet: foto, nome, especie e porte.
class _CartaoDoPet extends StatelessWidget {
  const _CartaoDoPet({required this.perdido});

  final PerdidoPublico perdido;

  @override
  Widget build(BuildContext context) {
    final cores = BichuColors.of(context).cores;
    final textos = Theme.of(context).textTheme;
    final url = perdido.urlDaFoto;

    return Container(
      padding: const EdgeInsets.all(BichuEspaco.e4),
      decoration: BoxDecoration(
        color: cores.surfaceAlt,
        borderRadius: BorderRadius.circular(BichuRaio.md),
      ),
      child: Row(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: <Widget>[
          if (url != null) ...<Widget>[
            ImagemDaRede(
              url: url,
              descricao: TextosDoAchado.fotoDoPetDoCaso(perdido.nome),
              largura: 72,
              simboloDeFalha: Icons.pets_outlined,
            ),
            const SizedBox(width: BichuEspaco.e4),
          ],
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: <Widget>[
                Text(
                  TextosDoAchado.rotuloDeQuemE,
                  style: textos.labelMedium
                      ?.copyWith(color: cores.textSecondary),
                ),
                const SizedBox(height: BichuEspaco.e1),
                Text(perdido.nome, style: textos.titleMedium),
                const SizedBox(height: BichuEspaco.e1),
                Text(
                  TextosDoAchado.especieEPorte(
                    perdido.especie.rotulo,
                    perdido.porte.rotulo,
                  ),
                  style: textos.bodyMedium
                      ?.copyWith(color: cores.textSecondary),
                ),
              ],
            ),
          ),
        ],
      ),
    );
  }
}
