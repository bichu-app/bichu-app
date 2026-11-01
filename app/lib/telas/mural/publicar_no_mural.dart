import 'package:flutter/material.dart';

import '../../acessibilidade/anunciar.dart';
import '../../api/envio_de_foto.dart';
import '../../api/falhas.dart';
import '../../api/mensagens_de_erro.dart';
import '../../api/mural_api.dart';
import '../../dispositivo/camera_e_galeria.dart';
import '../../roteamento/saida_da_mensagem.dart';
import '../../theme/bichu_colors.dart';
import '../../theme/bichu_tokens.g.dart';
import '../../widgets/barra_de_acao_fixa.dart';
import '../../widgets/bichu_field.dart';
import '../../widgets/botao_primario.dart';
import '../../widgets/faixa_de_aviso.dart';
import '../../widgets/previa_da_foto.dart';
import '../../widgets/recorte_de_imagem.dart';

/// PUBLICAR NO MURAL — **a caixa de texto que o cliente pediu.**
class PublicarNoMural extends StatefulWidget {
  const PublicarNoMural({
    required this.escrita,
    required this.camera,
    required this.envio,
    super.key,
    this.aoPublicar,
  });

  final EscritaDoMural escrita;
  final CameraEGaleria camera;
  final EnvioDeFoto envio;

  /// Chamado depois de publicar, para quem abriu recarregar a linha do tempo.
  final VoidCallback? aoPublicar;

  /// O teto do contrato, COPIADO de la (`PublicationInput.body.maxLength`).
  static const int tetoDoTexto = 280;

  static const String tituloDaTela = 'Publicar';
  static const String rotuloDoCampo = 'Conte esse momento';
  static const String exemploDoCampo = 'O que está acontecendo?';
  static const String tirarFoto = 'Tirar uma foto';
  static const String escolherDaGaleria = 'Escolher da galeria';
  static const String publicar = 'Publicar';
  static const String textoObrigatorio = 'Escreva uma mensagem para publicar.';
  static const String fotoSemSinal =
      'A foto não subiu: sem conexão. Escolha a foto de novo.';
  static const String fotoRecusada =
      'Essa foto não foi aceita. Tente outra, de até 5 MB.';
  static const String publicada = 'Publicado.';

  /// A PROPORCAO em que a publicacao sai, e ela e **1:1** -- medida, nao
  /// suposta.
  static const double proporcaoDaPublicacao = 1;

  @override
  State<PublicarNoMural> createState() => _PublicarNoMuralState();
}

class _PublicarNoMuralState extends State<PublicarNoMural> {
  final TextEditingController _texto = TextEditingController();

  FotoLocal? _escolhida;

  String? _uploadPendente;

  bool _enviando = false;
  bool _publicando = false;
  MensagemDeErro? _faixa;
  String? _erroDoTexto;

  @override
  void initState() {
    super.initState();
    _texto.addListener(_textoMudou);
  }

  @override
  void dispose() {
    _texto.removeListener(_textoMudou);
    _texto.dispose();
    super.dispose();
  }

  void _textoMudou() {
    setState(() {
      if (_erroDoTexto != null && _texto.text.trim().isNotEmpty) {
        _erroDoTexto = null;
      }
    });
  }

  int get _usados => _texto.text.characters.length;

  bool get _temTexto => _texto.text.trim().isNotEmpty;
  bool get _cabe => _usados <= PublicarNoMural.tetoDoTexto;
  bool get _ocupado => _enviando || _publicando;

  Future<void> _tirarFoto() async {
    var estado = await widget.camera.estadoDaCamera();
    if (!mounted) return;
    if (estado == EstadoDaPermissao.negada) {
      estado = await widget.camera.pedirCamera();
      if (!mounted) return;
    }
    if (estado != EstadoDaPermissao.concedida) return;
    final foto = await widget.camera.tirarFoto();
    if (!mounted || foto == null) return;
    final ajustada = await _ajustar(foto);
    if (!mounted || ajustada == null) return;
    await _escolheu(ajustada);
  }

  Future<void> _escolherDaGaleria() async {
    final foto = await widget.camera.escolherDaGaleria();
    if (!mounted || foto == null) return;
    final ajustada = await _ajustar(foto);
    if (!mounted || ajustada == null) return;
    await _escolheu(ajustada);
  }

  Future<FotoLocal?> _ajustar(FotoLocal foto) => ajustarAFoto(
        context,
        camera: widget.camera,
        foto: foto,
        formato: FormatoDoRecorte.publicacaoDoMural,
        titulo: 'Ajuste a foto da publicação',
      );

  Future<void> _escolheu(FotoLocal foto) async {
    final recusa = recusaDeTipoDaFoto(foto.tipoDeConteudo, tiposDeFotoAceitos);
    if (recusa != null) {
      setState(() {
        _escolhida = null;
        _uploadPendente = null;
        _faixa = MensagemDeErro(texto: recusa);
      });
      anunciar(context, recusa);
      return;
    }

    setState(() {
      _escolhida = foto;
      _uploadPendente = null;
      _faixa = null;
      _enviando = true;
    });

    final destino = EnvioParaConfirmarDepois(
      pedir: widget.escrita.intencaoDeFotoDaPublicacao,
    );
    final desfecho = await widget.envio.enviar(foto: foto, destino: destino);
    if (!mounted) return;

    setState(() {
      _enviando = false;
      switch (desfecho) {
        case DesfechoDoEnvio.enviada:
          _uploadPendente = destino.uploadId;
        case DesfechoDoEnvio.semSinal:
          _escolhida = null;
          _faixa = const MensagemDeErro(texto: PublicarNoMural.fotoSemSinal);
        case DesfechoDoEnvio.recusada:
          _escolhida = null;
          _faixa = const MensagemDeErro(texto: PublicarNoMural.fotoRecusada);
      }
    });
    if (!mounted) return;
    final aviso = _faixa?.texto;
    if (aviso != null) anunciar(context, aviso);
  }

  void _tirarAFoto() {
    setState(() {
      _escolhida = null;
      _uploadPendente = null;
    });
  }

  Future<void> _publicar() async {
    if (!_temTexto) {
      setState(() => _erroDoTexto = PublicarNoMural.textoObrigatorio);
      anunciar(context, PublicarNoMural.textoObrigatorio, urgente: true);
      return;
    }

    setState(() {
      _publicando = true;
      _faixa = null;
    });

    try {
      await widget.escrita.publicar(
        texto: _texto.text.trim(),
        uploadId: _uploadPendente,
      );
      if (!mounted) return;
      setState(() {
        _publicando = false;
        _escolhida = null;
        _uploadPendente = null;
      });
      _texto.clear();
      widget.aoPublicar?.call();
      anunciar(context, PublicarNoMural.publicada);
      if (!mounted) return;
      Navigator.of(context).maybePop(true);
    } on FalhaDeChamada catch (falha) {
      if (!mounted) return;
      final mensagem = MensagensDeErro.de(falha);
      setState(() {
        _publicando = false;
        _faixa = mensagem;
      });
      if (!mounted) return;
      anunciar(context, mensagem.texto, urgente: true);
    }
  }

  /// A ORDEM DA TELA, e ela e pedido do cliente de 22/10/2026: *"Ordene melhor
  /// essa pagina, primeiro a imagem, depois o campo de texto e por fim o botao
  /// publicar"*.
  @override
  Widget build(BuildContext context) {
    final cores = BichuColors.of(context).cores;
    final textos = Theme.of(context).textTheme;
    final local = _escolhida;
    final faixa = _faixa;

    return Scaffold(
      appBar: AppBar(title: const Text(PublicarNoMural.tituloDaTela)),
      body: SafeArea(
        child: ListView(
          padding: const EdgeInsets.all(BichuEspaco.e4),
          children: <Widget>[
            if (faixa != null) ...<Widget>[
              FaixaDeAviso(
                texto: faixa.texto,
                rotuloDaAcao: faixa.acao,
                aoTocarNaAcao: saidaDaMensagem(context, faixa),
              ),
              const SizedBox(height: BichuEspaco.e4),
            ],

            if (local != null || _enviando) ...<Widget>[
              _enviando && local == null
                  ? const SizedBox(
                      height: 200,
                      child: Center(child: CircularProgressIndicator()),
                    )
                  : LayoutBuilder(
                      builder: (context, limites) => PreviaDaFoto(
                        foto: local,
                        descricao: 'Foto escolhida',
                        altura: limites.maxWidth.isFinite
                            ? limites.maxWidth /
                                PublicarNoMural.proporcaoDaPublicacao
                            : 300,
                      ),
                    ),
              const SizedBox(height: BichuEspaco.e2),
              if (_uploadPendente != null)
                TextButton(
                  onPressed: _ocupado ? null : _tirarAFoto,
                  child: const Text('Remover a foto'),
                ),
              const SizedBox(height: BichuEspaco.e4),
            ],

            if (local == null && !_enviando) ...<Widget>[
              BotaoPrimario(
                rotulo: PublicarNoMural.tirarFoto,
                icone: Icons.photo_camera_outlined,
                aoTocar: _ocupado ? null : _tirarFoto,
              ),
              const SizedBox(height: BichuEspaco.e2),
              OutlinedButton.icon(
                onPressed: _ocupado ? null : _escolherDaGaleria,
                icon: const Icon(Icons.photo_library_outlined),
                label: const Text(PublicarNoMural.escolherDaGaleria),
              ),
              const SizedBox(height: BichuEspaco.e6),
            ],

            BichuField(
              rotulo: PublicarNoMural.rotuloDoCampo,
              controlador: _texto,
              exemplo: PublicarNoMural.exemploDoCampo,
              erro: _erroDoTexto,
              habilitado: !_ocupado,
              linhas: 5,
              capitalizacao: TextCapitalization.sentences,
            ),
            const SizedBox(height: BichuEspaco.e2),
            _contador(textos, cores),
          ],
        ),
      ),
      bottomNavigationBar: BarraDeAcaoFixa(
        acoes: <Widget>[
          BotaoPrimario(
            rotulo: PublicarNoMural.publicar,
            carregando: _publicando,
            aoTocar: _ocupado || !_temTexto || !_cabe ? null : _publicar,
          ),
        ],
      ),
    );
  }

  Widget _contador(TextTheme textos, BichuCores cores) {
    final restantes = PublicarNoMural.tetoDoTexto - _usados;
    final passou = restantes < 0;
    return Align(
      alignment: Alignment.centerRight,
      child: ExcludeSemantics(
        child: Text(
          passou
              ? '${(-restantes).toString()} caracteres a mais'
              : '$restantes',
          style: textos.bodySmall?.copyWith(
            color: passou ? cores.error : cores.textSecondary,
          ),
        ),
      ),
    );
  }
}
