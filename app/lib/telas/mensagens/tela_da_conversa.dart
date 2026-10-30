/// A CONVERSA ABERTA: ler o que o achador escreveu, paginar e responder.
library;

import 'package:flutter/material.dart';

import '../../api/falhas.dart';
import '../../api/mensagens_de_erro.dart';
import '../../api/conversas_api.dart';
import '../../api/envio_de_foto.dart';
import '../../widgets/recorte_de_imagem.dart';
import '../../api/modelos_conversa.dart';
import '../../dispositivo/camera_e_galeria.dart';
import '../../escopo.dart';
import '../../theme/bichu_colors.dart';
import '../../theme/bichu_tokens.g.dart';
import '../../widgets/convite_para_entrar.dart';
import '../../widgets/faixa_de_aviso.dart';
import '../../widgets/botao_primario.dart';
import '../../widgets/marca_da_pessoa.dart';
import '../../widgets/saida_da_tela.dart';
import 'area_de_mensagens.dart';
import 'foto_na_barra_de_escrever.dart';
import 'textos_da_foto_na_conversa.dart';
import 'titulo_da_conversa.dart';

class TelaDaConversa extends StatefulWidget {
  const TelaDaConversa({
    required this.conversaId,
    super.key,
    this.conversas,
    this.camera,
    this.envioDeFoto,
    this.intencaoDeFoto,
  });

  /// O cliente de conversa. Nulo usa o do [Escopo].
  final ConversasApi? conversas;

  /// A porta da camera e da galeria.
  final CameraEGaleria? camera;

  /// O unico caminho de bytes do app.
  final EnvioDeFoto? envioDeFoto;

  /// Quem emite a autorizacao de upload da foto desta conversa.
  final IntencaoDeFotoDeAchado? intencaoDeFoto;

  /// O id vem do caminho. **Nao e pintado em lugar nenhum** (ADR-0010).
  final String conversaId;

  @override
  State<TelaDaConversa> createState() => _EstadoDaTelaDaConversa();
}

class _EstadoDaTelaDaConversa extends State<TelaDaConversa> {
  final TextEditingController _controlador = TextEditingController();
  final List<MensagemDaConversa> _mensagens = <MensagemDaConversa>[];

  ConversasApi get _api =>
      widget.conversas ?? ConversasApi(Escopo.of(context).api);

  CameraEGaleria get _camera => widget.camera ?? Escopo.of(context).camera;

  EnvioDeFoto get _envio => widget.envioDeFoto ?? Escopo.of(context).envioDeFoto;

  IntencaoDeFotoDeAchado get _intencaoDeFoto =>
      widget.intencaoDeFoto ?? Escopo.of(context).achados;

  /// A foto que a pessoa escolheu e **ainda nao mandou**.
  FotoLocal? _foto;

  FaseDaFotoEscolhida _faseDaFoto = FaseDaFotoEscolhida.subindo;

  /// Bytes do arquivo ja aceitos pelo socket, e o total.
  int _bytesEnviados = 0;
  int _bytesTotais = 0;

  /// O texto da recusa, **do servidor quando ele mandou um**.
  String? _motivoDaRecusaDaFoto;

  /// O destino que guarda o `upload_id` depois de os bytes chegarem.
  EnvioParaConfirmarDepois? _destinoDaFoto;

  /// Quantas vezes a mensagem foi recusada por **higiene da foto em curso**.
  int _tentativasDePreparo = 0;

  /// A espera entre as tentativas quando o servidor diz que a foto nao esta
  /// pronta: **crescente, e com fim**.
  static const List<Duration> _esperasDoPreparo = <Duration>[
    Duration(milliseconds: 400),
    Duration(milliseconds: 800),
    Duration(milliseconds: 1600),
    Duration(milliseconds: 3600),
  ];

  Conversa? _conversa;
  String? _cursor;
  bool _carregando = true;
  bool _carregandoAnteriores = false;
  bool _enviando = false;

  /// Por que a tela nao carregou.
  String? _falhaDeCarga;

  /// A falha de carga foi **falta de conta**, e nao defeito.
  bool _faltaConta = false;

  /// Por que o ENVIO falhou. Nulo quando nao falhou.
  String? _falhaDeEnvio;

  /// A conversa fechou. Vem do `status` no carregamento, **ou do 410 no
  /// envio**.
  bool _emLeitura = false;

  @override
  void initState() {
    super.initState();
    WidgetsBinding.instance.addPostFrameCallback((_) => _carregar());
  }

  @override
  void dispose() {
    _controlador.dispose();
    super.dispose();
  }

  Future<void> _carregar() async {
    setState(() {
      _carregando = true;
      _falhaDeCarga = null;
      _faltaConta = false;
    });
    try {
      final conversa = await _api.buscar(widget.conversaId);
      if (!mounted) return;
      setState(() {
        _conversa = conversa;
        _mensagens
          ..clear()
          ..addAll(conversa.messages);
        _cursor = conversa.nextCursor;
        _emLeitura = !conversa.status.aceitaMensagem;
        _carregando = false;
      });
    } on FalhaDaApi catch (falha) {
      if (!mounted) return;
      setState(() {
        _carregando = false;
        _faltaConta = faltaConta(falha);
        _falhaDeCarga = _faltaConta
            ? null
            : falha.problem.status == 404
                ? TextosDasMensagens.conversaIndisponivel
                : TextosDasMensagens.naoConseguimosCarregar;
      });
    } on FalhaDeChamada catch (falha) {
      if (!mounted) return;
      setState(() {
        _carregando = false;
        _faltaConta = faltaConta(falha);
        _falhaDeCarga =
            _faltaConta ? null : TextosDasMensagens.naoConseguimosCarregar;
      });
    } on FormatException {
      if (!mounted) return;
      setState(() {
        _carregando = false;
        _falhaDeCarga = TextosDasMensagens.naoConseguimosCarregar;
      });
    }
  }

  /// As mensagens anteriores, **por cursor**.
  Future<void> _carregarAnteriores() async {
    final cursor = _cursor;
    if (cursor == null || _carregandoAnteriores) return;
    setState(() => _carregandoAnteriores = true);
    try {
      final pagina = await _api.buscar(widget.conversaId, cursor: cursor);
      if (!mounted) return;
      setState(() {
        _mensagens.insertAll(0, pagina.messages);
        _cursor = pagina.nextCursor;
        _carregandoAnteriores = false;
      });
    } on FalhaDeChamada {
      if (!mounted) return;
      setState(() {
        _carregandoAnteriores = false;
        _falhaDeEnvio = null;
        _falhaDeCarga = null;
      });
    } on FormatException {
      if (!mounted) return;
      setState(() => _carregandoAnteriores = false);
    }
  }

  /// O aviso de achado desta conversa, ou nulo.
  String? get _avisoDoAchado => _conversa?.foundReportId;

  /// Ha botao de anexar nesta tela.
  bool get _podeAnexarFoto =>
      !_emLeitura && !_faltaConta && _avisoDoAchado != null;

  /// Uma foto que esta pessoa mandar vai ser legivel pelo outro lado.
  bool get _fotoAlcancaOOutroLado => _conversa?.fotoAlcancaOOutroLado ?? true;

  /// QUEM ESCREVEU esta mensagem, entre os participantes da conversa.
  ParticipanteDaConversa? _autorDe(MensagemDaConversa mensagem) {
    final conversa = _conversa;
    if (conversa == null) return null;
    for (final participante in conversa.participants) {
      if (participante.role == mensagem.senderRole) return participante;
    }
    return null;
  }
  /// O PAPEL DE QUEM ESTA USANDO O APP nesta conversa.
  PapelNaConversa get _papelDoChamador =>
      _conversa?.papelDoChamador ?? PapelNaConversa.tutor;

  /// A legenda esta vazia. Ver [TextosDaFotoNaConversa.aFotoPrecisaDeLegenda].
  bool get _faltaLegenda => _controlador.text.trim().isEmpty;

  /// A foto nao impede o envio da mensagem.
  bool get _fotoPermiteEnviar =>
      _foto == null || _destinoDaFoto?.uploadId != null;

  /// Abre a folha com as duas origens e sobe o que vier.
  Future<void> _anexarFoto() async {
    if (_foto != null || !_podeAnexarFoto) return;

    final cores = BichuColors.of(context).cores;
    final origem = await showModalBottomSheet<_OrigemDaFoto>(
      context: context,
      backgroundColor: cores.surface,
      barrierColor: cores.scrim,
      shape: const RoundedRectangleBorder(
        borderRadius: BorderRadius.vertical(top: Radius.circular(BichuRaio.xl)),
      ),
      builder: (contexto) => SafeArea(
        child: Padding(
          padding: const EdgeInsets.all(BichuEspaco.e4),
          child: Column(
            mainAxisSize: MainAxisSize.min,
            crossAxisAlignment: CrossAxisAlignment.stretch,
            children: <Widget>[
              BotaoPrimario(
                rotulo: _TextosDaFolhaDeFoto.tirarFoto,
                aoTocar: () =>
                    Navigator.of(contexto).pop(_OrigemDaFoto.camera),
              ),
              const SizedBox(height: BichuEspaco.e2),
              BotaoSecundario(
                rotulo: _TextosDaFolhaDeFoto.escolherDaGaleria,
                aoTocar: () =>
                    Navigator.of(contexto).pop(_OrigemDaFoto.galeria),
              ),
              const SizedBox(height: BichuEspaco.e3),
              Text(
                TextosDaFotoNaConversa.aLocalizacaoSai,
                style: Theme.of(contexto)
                    .textTheme
                    .bodySmall
                    ?.copyWith(color: cores.textSecondary),
              ),
            ],
          ),
        ),
      ),
    );
    if (origem == null || !mounted) return;

    final camera = _camera;
    FotoLocal? escolhida;
    if (origem == _OrigemDaFoto.camera) {
      var estado = await camera.estadoDaCamera();
      if (estado == EstadoDaPermissao.negada) estado = await camera.pedirCamera();
      if (!mounted) return;
      if (estado != EstadoDaPermissao.concedida) return;
      escolhida = await camera.tirarFoto();
    } else {
      escolhida = await camera.escolherDaGaleria();
    }
    if (!mounted || escolhida == null) return;

    final ajustada = await ajustarAFoto(
      context,
      camera: camera,
      foto: escolhida,
      formato: FormatoDoRecorte.fotoDoAchado,
      titulo: 'Ajuste a foto',
    );
    if (!mounted || ajustada == null) return;
    escolhida = ajustada;

    final recusaDeTipo =
        recusaDeTipoDaFoto(escolhida.tipoDeConteudo, tiposDeFotoAceitos);
    final recusa = recusaDeTipo ??
        (escolhida.tamanhoEmBytes > tetoDeBytesDaFoto
            ? orientacaoDeTamanhoDaImagem
            : null);

    setState(() {
      _foto = escolhida;
      _bytesEnviados = 0;
      _bytesTotais = escolhida!.tamanhoEmBytes;
      _tentativasDePreparo = 0;
      _destinoDaFoto = null;
      _motivoDaRecusaDaFoto = recusa;
      _faseDaFoto = recusa == null
          ? FaseDaFotoEscolhida.subindo
          : FaseDaFotoEscolhida.recusada;
    });
    if (recusa != null) return;
    await _subirAFoto();
  }

  /// Sobe os bytes e guarda o `upload_id`.
  Future<void> _subirAFoto() async {
    final foto = _foto;
    final aviso = _avisoDoAchado;
    if (foto == null || aviso == null) return;

    setState(() {
      _faseDaFoto = FaseDaFotoEscolhida.subindo;
      _bytesEnviados = 0;
      _bytesTotais = foto.tamanhoEmBytes;
      _motivoDaRecusaDaFoto = null;
      _destinoDaFoto = null;
      _tentativasDePreparo = 0;
    });

    final porta = _intencaoDeFoto;
    final destino = EnvioParaConfirmarDepois(
      pedir: ({required String tipoDeConteudo, required int tamanhoEmBytes}) =>
          porta.intencaoDeFotoDoAchado(
        foundReportId: aviso,
        tipoDeConteudo: tipoDeConteudo,
        tamanhoEmBytes: tamanhoEmBytes,
      ),
    );

    final desfecho = await _envio.enviar(
      foto: foto,
      destino: destino,
      aoProgredir: (int enviados, int total) {
        if (!mounted) return;
        if (_foto != foto) return;
        setState(() {
          _bytesEnviados = enviados;
          _bytesTotais = total;
        });
      },
    );
    if (!mounted || _foto != foto) return;

    setState(() {
      switch (desfecho) {
        case DesfechoDoEnvio.enviada:
          _destinoDaFoto = destino;
          _faseDaFoto = FaseDaFotoEscolhida.pronta;
        case DesfechoDoEnvio.semSinal:
          _faseDaFoto = FaseDaFotoEscolhida.semSinal;
        case DesfechoDoEnvio.recusada:
          _faseDaFoto = FaseDaFotoEscolhida.recusada;
      }
    });
  }

  /// Descarta a previa. **Nao manda nada e nao fala com a rede.**
  void _descartarAFoto() {
    setState(() {
      _foto = null;
      _destinoDaFoto = null;
      _motivoDaRecusaDaFoto = null;
      _bytesEnviados = 0;
      _bytesTotais = 0;
      _tentativasDePreparo = 0;
      _faseDaFoto = FaseDaFotoEscolhida.subindo;
    });
  }

  /// Envia, e **nao limpa o campo antes da confirmacao**.
  Future<void> _enviar() async {
    final texto = _controlador.text.trim();
    if (texto.isEmpty || _enviando || _emLeitura) return;
    if (!_fotoPermiteEnviar) return;

    final fotoUploadId = _destinoDaFoto?.uploadId;

    setState(() {
      _enviando = true;
      _falhaDeEnvio = null;
    });

    try {
      final mensagem = await _api.enviar(
        widget.conversaId,
        texto,
        fotoUploadId: fotoUploadId,
      );
      if (!mounted) return;
      setState(() {
        _mensagens.add(mensagem);
        _enviando = false;
        _foto = null;
        _destinoDaFoto = null;
        _bytesEnviados = 0;
        _bytesTotais = 0;
        _tentativasDePreparo = 0;
        _faseDaFoto = FaseDaFotoEscolhida.subindo;
      });
      _controlador.clear();
    } on FalhaDaApi catch (falha) {
      if (!mounted) return;
      if (fotoUploadId != null &&
          _foto != null &&
          fotoAindaNaoEstaPronta(falha.problem) &&
          _tentativasDePreparo < _esperasDoPreparo.length) {
        final espera = _esperasDoPreparo[_tentativasDePreparo];
        setState(() {
          _enviando = false;
          _tentativasDePreparo += 1;
          _faseDaFoto = FaseDaFotoEscolhida.preparando;
          _falhaDeEnvio = null;
        });
        await Future<void>.delayed(espera);
        if (!mounted || _foto == null) return;
        await _enviar();
        return;
      }
      if (_foto != null && fotoFoiRecusadaPeloServidor(falha.problem)) {
        setState(() {
          _enviando = false;
          _tentativasDePreparo = 0;
          _faseDaFoto = FaseDaFotoEscolhida.recusada;
          _motivoDaRecusaDaFoto = falha.problem.detalhe;
          _falhaDeEnvio = null;
        });
        return;
      }
      setState(() {
        _enviando = false;
        if (_faseDaFoto == FaseDaFotoEscolhida.preparando) {
          _faseDaFoto = FaseDaFotoEscolhida.pronta;
        }
        if (conversaNaoAceitaMais(falha.problem)) {
          _emLeitura = true;
          _falhaDeEnvio = null;
        } else {
          _falhaDeEnvio = TextosDasMensagens.naoFoiEnviada;
        }
      });
    } on FalhaDeChamada {
      if (!mounted) return;
      setState(() {
        _enviando = false;
        if (_faseDaFoto == FaseDaFotoEscolhida.preparando) {
          _faseDaFoto = FaseDaFotoEscolhida.pronta;
        }
        _falhaDeEnvio = TextosDasMensagens.naoFoiEnviada;
      });
    } on FormatException {
      if (!mounted) return;
      setState(() {
        _enviando = false;
        if (_faseDaFoto == FaseDaFotoEscolhida.preparando) {
          _faseDaFoto = FaseDaFotoEscolhida.pronta;
        }
        _falhaDeEnvio = TextosDasMensagens.naoFoiEnviada;
      });
    }
  }

  @override
  Widget build(BuildContext context) {
    final conversa = _conversa;
    final outro = conversa?.outroLadoVistoPor(_papelDoChamador);
    final nomeDoOutro = conversa == null ? null : outro?.displayName.trim();
    final nomeNoTitulo = nomeDoOutro == null || nomeDoOutro.isEmpty
        ? TextosDasMensagens.titulo
        : nomeDoOutro;
    final petNoTitulo = conversa?.petDisplayName;

    return Scaffold(
      appBar: AppBar(
        toolbarHeight: TituloDaConversa.alturaDaBarra(
          context,
          nome: nomeNoTitulo,
          pet: petNoTitulo,
        ),
        leading: const SaidaDaTela(
          tipo: TipoDeSaida.voltar,
          escape: RotasDeMensagens.area,
        ),
        title: TituloDaConversa(nome: nomeNoTitulo, pet: petNoTitulo),
      ),
      body: SafeArea(
        child: Column(
          children: <Widget>[
            Expanded(child: _corpo()),
            if (!_carregando && _falhaDeCarga == null && !_faltaConta)
              if (_emLeitura)
                const _AvisoDeConversaEncerrada()
              else ...<Widget>[
                if (_foto case final FotoLocal escolhida)
                  PreviaDaFotoDaConversa(
                    foto: escolhida,
                    fase: _faseDaFoto,
                    enviados: _bytesEnviados,
                    total: _bytesTotais,
                    faltaLegenda: _faltaLegenda,
                    motivoDaRecusa: _motivoDaRecusaDaFoto,
                    aoDescartar: _descartarAFoto,
                    aoTentarDeNovo: _subirAFoto,
                    alcancaOOutroLado: _fotoAlcancaOOutroLado,
                  ),
                _caixa(),
              ],
          ],
        ),
      ),
    );
  }

  Widget _corpo() {
    if (_carregando) {
      return const Center(child: CircularProgressIndicator());
    }

    if (_faltaConta) {
      return ListView(
        padding: const EdgeInsets.all(BichuEspaco.e4),
        children: const <Widget>[
          ConviteParaEntrar(secao: SecaoComConta.umaConversa),
        ],
      );
    }

    final falha = _falhaDeCarga;
    if (falha != null) {
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

    final falhaDeEnvio = _falhaDeEnvio;

    return ListView(
      padding: const EdgeInsets.all(BichuEspaco.e4),
      children: <Widget>[
        if (_cursor != null)
          Padding(
            padding: const EdgeInsets.only(bottom: BichuEspaco.e4),
            child: BotaoSecundario(
              rotulo: TextosDasMensagens.carregarAnteriores,
              aoTocar: _carregarAnteriores,
              carregando: _carregandoAnteriores,
            ),
          ),
        for (final mensagem in _mensagens)
          Padding(
            key: ValueKey<String>('mensagem-${mensagem.id}'),
            padding: const EdgeInsets.only(bottom: BichuEspaco.e3),
            child: _Bolha(
              mensagem: mensagem,
              autor: _autorDe(mensagem),
              aoBuscarDeNovo: _carregar,
              fotoAlcancaOOutroLado: _fotoAlcancaOOutroLado,
              papelDoChamador: _papelDoChamador,
            ),
          ),
        if (falhaDeEnvio != null)
          FaixaDeAviso(
            texto: falhaDeEnvio,
            rotuloDaAcao: MensagensDeErro.tentarDeNovo,
            aoTocarNaAcao: _enviar,
          ),
      ],
    );
  }

  Widget _caixa() {
    final cores = BichuColors.of(context).cores;
    final textos = Theme.of(context).textTheme;
    return DecoratedBox(
      decoration: BoxDecoration(
        border: Border(top: BorderSide(color: cores.outline)),
      ),
      child: Padding(
        padding: const EdgeInsets.all(BichuEspaco.e3),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: <Widget>[
            if (_podeAnexarFoto && !_fotoAlcancaOOutroLado)
              Padding(
                padding: const EdgeInsets.only(bottom: BichuEspaco.e2),
                child: Text(
                  TextosDaFotoNaConversa.aFotoNaoChegaDoOutroLado,
                  style: textos.bodySmall?.copyWith(color: cores.textSecondary),
                ),
              ),
            if (_podeAnexarFoto)
              Padding(
                padding: const EdgeInsets.only(bottom: BichuEspaco.e2),
                child: Text(
                  TextosDaFotoNaConversa.aLocalizacaoSai,
                  style: textos.bodySmall?.copyWith(color: cores.textMuted),
                ),
              ),
            Row(
          crossAxisAlignment: CrossAxisAlignment.end,
          children: <Widget>[
            if (_podeAnexarFoto && _foto == null) ...<Widget>[
              IconButton(
                onPressed: _anexarFoto,
                tooltip: TextosDaFotoNaConversa.anexarFoto,
                constraints: const BoxConstraints(
                  minWidth: BichuAlvoDeToque.min,
                  minHeight: BichuAlvoDeToque.min,
                ),
                icon: const Icon(Icons.add_a_photo_outlined),
              ),
              const SizedBox(width: BichuEspaco.e1),
            ],
            Expanded(
              child: TextField(
                controller: _controlador,
                minLines: 1,
                maxLines: 4,
                onChanged: (_) {
                  if (_foto != null) setState(() {});
                },
                maxLength: 1000,
                textCapitalization: TextCapitalization.sentences,
                keyboardType: TextInputType.multiline,
                onTapOutside: (PointerDownEvent _) =>
                    FocusManager.instance.primaryFocus?.unfocus(),
                decoration: InputDecoration(
                  labelText: _foto == null
                      ? TextosDasMensagens.campoDeMensagem
                      : TextosDaFotoNaConversa.campoDeLegenda,
                  counterText: '',
                ),
              ),
            ),
            const SizedBox(width: BichuEspaco.e2),
            IconButton.filled(
              onPressed: (_enviando || !_fotoPermiteEnviar) ? null : _enviar,
              tooltip: TextosDasMensagens.enviar,
              icon: _enviando
                  ? const SizedBox(
                      width: 18,
                      height: 18,
                      child: CircularProgressIndicator(strokeWidth: 2),
                    )
                  : const Icon(Icons.arrow_upward),
            ),
              ],
            ),
          ],
        ),
      ),
    );
  }
}

/// De onde a foto vem. Local: e escolha de aparelho, e nao campo de contrato.
enum _OrigemDaFoto { camera, galeria }

/// Os dois rotulos da folha de origem.
abstract final class _TextosDaFolhaDeFoto {
  static const String tirarFoto = 'Tirar foto';
  static const String escolherDaGaleria = 'Escolher da galeria';
}

/// O rodape do modo leitura.
class _AvisoDeConversaEncerrada extends StatelessWidget {
  const _AvisoDeConversaEncerrada();

  @override
  Widget build(BuildContext context) {
    final cores = BichuColors.of(context).cores;
    final textos = Theme.of(context).textTheme;
    return Container(
      width: double.infinity,
      decoration: BoxDecoration(
        color: cores.surfaceAlt,
        border: Border(top: BorderSide(color: cores.outline)),
      ),
      padding: const EdgeInsets.all(BichuEspaco.e4),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: <Widget>[
          Text(
            TextosDasMensagens.conversaEncerrada,
            style: textos.titleSmall?.copyWith(color: cores.textPrimary),
          ),
          const SizedBox(height: BichuEspaco.e1),
          Text(
            TextosDasMensagens.aindaDaParaLer,
            style: textos.bodySmall?.copyWith(color: cores.textSecondary),
          ),
        ],
      ),
    );
  }
}

/// Uma mensagem.
class _Bolha extends StatelessWidget {
  const _Bolha({
    required this.mensagem,
    required this.autor,
    required this.aoBuscarDeNovo,
    required this.fotoAlcancaOOutroLado,
    required this.papelDoChamador,
  });

  final MensagemDaConversa mensagem;

  /// QUEM ESCREVEU, para a marca ao lado da fala.
  final ParticipanteDaConversa? autor;
  /// O PAPEL DE QUEM ESTA LENDO esta conversa (`Conversation.viewer_role`).
  final PapelNaConversa papelDoChamador;

  /// Rele a conversa, para as URLs assinadas virem com assinatura nova.
  final VoidCallback aoBuscarDeNovo;

  /// O fato do CANAL: uma foto que ESTE chamador mandar alcanca o outro lado.
  final bool fotoAlcancaOOutroLado;

  /// ESTA foto alcancou o outro lado.
  bool get _alcancouOOutroLado =>
      mensagem.senderRole != papelDoChamador || fotoAlcancaOOutroLado;

  /// O LADO DO CÍRCULO da marca de quem falou, em dp.
  static const double ladoDaMarca = 32;

  /// O vão entre a marca e a bolha, em dp.
  static const double respiroDaMarca = BichuEspaco.e2;

  /// A fração da largura da tela que a fala podia ocupar ANTES da marca.
  static const double fracaoDaLargura = 0.78;

  /// O que sobra para a bolha depois de a marca e o respiro serem pagos.
  static double _larguraMaximaDaBolha(double larguraDaTela) {
    final teto =
        larguraDaTela * fracaoDaLargura - (ladoDaMarca + respiroDaMarca);
    return teto < 0 ? 0 : teto;
  }

  @override
  Widget build(BuildContext context) {
    final cores = BichuColors.of(context).cores;
    final textos = Theme.of(context).textTheme;

    if (mensagem.doSistema) {
      return Container(
        width: double.infinity,
        decoration: BoxDecoration(
          color: cores.infoContainer,
          borderRadius: BorderRadius.circular(BichuRaio.md),
        ),
        padding: const EdgeInsets.all(BichuEspaco.e3),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: <Widget>[
            Text(
              mensagem.body,
              style: textos.bodySmall?.copyWith(color: cores.textPrimary),
            ),
            if (mensagem.photoUrl case final String url when url.isNotEmpty)
              Padding(
                padding: const EdgeInsets.only(top: BichuEspaco.e2),
                child: FotoDaMensagem(
                  url: url,
                  papel: PapelNaConversa.sistema,
                  aoBuscarDeNovo: aoBuscarDeNovo,
                  alcancouOOutroLado: _alcancouOOutroLado,
                ),
              ),
          ],
        ),
      );
    }

    final minha = mensagem.senderRole == papelDoChamador;

    final marca = MarcaDaPessoa(
      urlDoIcone: autor?.photoIconUrl,
      inicial: autor?.marcaNeutra ?? '',
      lado: ladoDaMarca,
      estiloDaInicial: textos.bodyMedium,
    );

    return Row(
      mainAxisAlignment: minha ? MainAxisAlignment.end : MainAxisAlignment.start,
      crossAxisAlignment: CrossAxisAlignment.start,
      children: <Widget>[
        if (!minha) ...<Widget>[
          marca,
          const SizedBox(width: respiroDaMarca),
        ],
        ConstrainedBox(
        constraints: BoxConstraints(
          maxWidth: _larguraMaximaDaBolha(MediaQuery.sizeOf(context).width),
        ),
        child: Column(
          crossAxisAlignment: minha
              ? CrossAxisAlignment.end
              : CrossAxisAlignment.start,
          children: <Widget>[
            Container(
              decoration: BoxDecoration(
                color: minha ? cores.primaryContainer : cores.surfaceSunken,
                borderRadius: BorderRadius.circular(BichuRaio.md),
              ),
              padding: const EdgeInsets.all(BichuEspaco.e3),
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: <Widget>[
                  if (mensagem.photoUrl case final String url
                      when url.isNotEmpty)
                    Padding(
                      padding: const EdgeInsets.only(bottom: BichuEspaco.e2),
                      child: FotoDaMensagem(
                        url: url,
                        papel: mensagem.senderRole,
                        aoBuscarDeNovo: aoBuscarDeNovo,
                        alcancouOOutroLado: _alcancouOOutroLado,
                      ),
                    ),
                  Text(
                    mensagem.body,
                    style: textos.bodyMedium?.copyWith(
                      color: cores.textPrimary,
                    ),
                  ),
                ],
              ),
            ),
            if (mensagem.redactions.isNotEmpty)
              Padding(
                padding: const EdgeInsets.only(top: BichuEspaco.e1),
                child: Text(
                  TextosDasMensagens.dadoRetirado,
                  style: textos.bodySmall?.copyWith(color: cores.textSecondary),
                ),
              ),
          ],
        ),
        ),
        if (minha) ...<Widget>[
          const SizedBox(width: respiroDaMarca),
          marca,
        ],
      ],
    );
  }
}
