import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:go_router/go_router.dart';

import '../../acessibilidade/anunciar.dart';
import '../../api/api_client.dart';
import '../../api/envio_de_foto.dart';
import '../../api/falhas.dart';
import '../../api/mensagens_de_erro.dart';
import '../../api/modelos_pet.dart';
import '../../dispositivo/oportunidades_de_aviso.dart';
import '../../escopo.dart';
import '../../roteamento/rotas.dart';
import '../../theme/bichu_colors.dart';
import '../../theme/bichu_tokens.g.dart';
import '../../widgets/barra_de_acao_fixa.dart';
import '../../widgets/botao_primario.dart';
import '../../widgets/faixa_de_aviso.dart';
import '../../widgets/saida_da_tela.dart';
import '../avisos/antessala_de_aviso.dart';
import '../avisos/pedido_de_aviso.dart';
import 'resultado_do_cadastro.dart';
import 'textos_do_cadastro.dart';

/// F1.6 — Pet cadastrado / QR gerado.
class TelaPetCadastrado extends StatefulWidget {
  const TelaPetCadastrado({required this.resultado, super.key});

  final ResultadoDoCadastro resultado;

  @override
  State<TelaPetCadastrado> createState() => _TelaPetCadastradoState();
}

class _TelaPetCadastradoState extends State<TelaPetCadastrado> {
  final String _chaveDeIdempotencia = ApiClient.novaChaveDeIdempotencia();

  TagEmitida? _tag;
  bool _emitindo = true;
  MensagemDeErro? _faixa;

  _EstadoDoQr _estadoDoQr = _EstadoDoQr.semEndereco;

  MemoryImage? _qr;

  late _EstadoDaFoto _estadoDaFoto = widget.resultado.fotoPendente == null
      ? _EstadoDaFoto.semFoto
      : _EstadoDaFoto.subindo;

  Pet get _pet => widget.resultado.pet;

  bool _iniciou = false;

  @override
  void didChangeDependencies() {
    super.didChangeDependencies();
    if (_iniciou) return;
    _iniciou = true;
    _emitir();
    _enviarAFoto();
  }

  Future<void> _enviarAFoto() async {
    final foto = widget.resultado.fotoPendente;
    if (foto == null) return;

    final retomada = Escopo.of(context).retomadaDeFotos;

    if (mounted) setState(() => _estadoDaFoto = _EstadoDaFoto.subindo);

    final desfecho = await retomada.enviarDoPet(petId: _pet.id, foto: foto);
    if (!mounted) return;
    setState(() {
      _estadoDaFoto = switch (desfecho) {
        DesfechoDoEnvio.enviada => _EstadoDaFoto.enviada,
        DesfechoDoEnvio.semSinal => _EstadoDaFoto.semSinal,
        DesfechoDoEnvio.recusada => _EstadoDaFoto.recusada,
      };
    });
  }

  Future<void> _emitir() async {
    setState(() {
      _emitindo = true;
      _faixa = null;
    });
    try {
      final tag = await Escopo.of(context).pets.emitirTag(
            petId: _pet.id,
            idempotencyKey: _chaveDeIdempotencia,
          );
      if (!mounted) return;
      setState(() {
        _tag = tag;
        _emitindo = false;
      });
      await _baixarOQr(tag);
      if (!mounted) return;
      await _resolverAviso();
    } on FalhaDeChamada catch (falha) {
      if (!mounted) return;
      setState(() {
        _emitindo = false;
        _faixa = falha is FalhaDeConexao
            ? MensagemDeErro(
                texto: TextosDoCadastro.salvoNesteCelular(_pet.nome),
              )
            : MensagemDeErro(
                texto: TextosDoCadastro.tagNaoSaiu(_pet.nome),
                acao: MensagensDeErro.tentarDeNovo,
              );
      });
    } on Object catch (erro, pilha) {
      registrarFalhaInesperada(erro, pilha, onde: 'ao emitir a plaquinha');
      if (!mounted) return;
      setState(() {
        _emitindo = false;
        _faixa = MensagemDeErro(
          texto: TextosDoCadastro.tagNaoSaiu(_pet.nome),
          acao: MensagensDeErro.tentarDeNovo,
        );
      });
    }
  }

  Future<void> _baixarOQr(TagEmitida tag) async {
    final endereco = tag.qrPngUrl;
    if (endereco == null || endereco.isEmpty) {
      if (mounted) setState(() => _estadoDoQr = _EstadoDoQr.semEndereco);
      return;
    }

    final api = Escopo.of(context).api;
    final cofre = Escopo.of(context).cofreDoQr;

    setState(() {
      _estadoDoQr = _EstadoDoQr.carregando;
      _qr = null;
    });

    try {
      final Uint8List bytes = await api.baixarImagem(endereco);
      final provedor = await cofre.guardar(bytes);
      if (!mounted) return;
      setState(() {
        _qr = provedor;
        _estadoDoQr = _EstadoDoQr.pronto;
      });
    } on FalhaDeChamada {
      if (!mounted) return;
      setState(() {
        _qr = null;
        _estadoDoQr = _EstadoDoQr.falhou;
      });
    }
  }

  Future<void> _resolverAviso() async {
    final desfecho = await PedidoDeAviso.oferecer(
      context,
      oportunidade: OportunidadeDeAviso.primeiroPetCadastrado,
      nomeDoPet: _pet.nome,
    );
    if (desfecho != DesfechoDoPedido.registroFalhou) return;
    if (!mounted) return;
    setState(() {
      _faixa = MensagemDeErro(
        texto: TextosDaAntessala.avisoNaoFicouLigado(_pet.nome),
      );
    });
  }

  List<Widget> _linhaDaFoto(TextTheme textos, BichuCores cores) {
    final discreto = textos.bodyMedium?.copyWith(color: cores.textSecondary);
    switch (_estadoDaFoto) {
      case _EstadoDaFoto.semFoto:
      case _EstadoDaFoto.enviada:
        return const <Widget>[];

      case _EstadoDaFoto.subindo:
        return <Widget>[
          const SizedBox(height: BichuEspaco.e1),
          Text(
            TextosDoCadastro.fotoAindaSubindo(_pet.nome),
            style: discreto,
          ),
        ];

      case _EstadoDaFoto.semSinal:
        return <Widget>[
          const SizedBox(height: BichuEspaco.e2),
          FaixaDeAviso(
            peso: PesoDaFaixa.informativo,
            texto: TextosDoCadastro.fotoNaoSubiuSemSinal(_pet.nome),
            rotuloDaAcao: TextosDoCadastro.tentarEnviarAgora,
            aoTocarNaAcao: _enviarAFoto,
          ),
        ];

      case _EstadoDaFoto.recusada:
        return <Widget>[
          const SizedBox(height: BichuEspaco.e2),
          FaixaDeAviso(
            peso: PesoDaFaixa.informativo,
            texto: TextosDoCadastro.fotoNaoSubiuRecusada(_pet.nome),
          ),
        ];
    }
  }

  Future<void> _copiar() async {
    final codigo = _tag?.codigo;
    if (codigo == null) return;
    await Clipboard.setData(ClipboardData(text: codigo));
    if (!mounted) return;
    anunciar(context, TextosDoCadastro.codigoCopiado);
    ScaffoldMessenger.of(context).showSnackBar(
      const SnackBar(content: Text(TextosDoCadastro.codigoCopiado)),
    );
  }

  @override
  Widget build(BuildContext context) {
    final cores = BichuColors.of(context).cores;
    final textos = Theme.of(context).textTheme;
    final tag = _tag;

    return Scaffold(
      appBar: const BarraDeConta(
        titulo: 'Pet cadastrado',
        saida: TipoDeSaida.fechar,
      ),
      bottomNavigationBar: BarraDeAcaoFixa(
        acoes: <Widget>[
          BotaoPrimario(
            rotulo: TextosDoCadastro.fazerATag,
            critico: true,
            aoTocar: () => context.push(Rotas.solicitarPlaquinha, extra: _pet.id),
          ),
          TextButton(
            onPressed: () => context.go(Rotas.perfil),
            child: const Text(TextosDoCadastro.depois),
          ),
        ],
      ),
      body: SafeArea(
        child: ListView(
          padding: const EdgeInsets.all(BichuEspaco.e4),
          children: <Widget>[
            Semantics(
              header: true,
              child: Text(
                TextosDoCadastro.tituloPetCadastrado(_pet.nome),
                style: textos.headlineSmall?.copyWith(color: cores.primary),
              ),
            ),
            const SizedBox(height: BichuEspaco.e2),
            Text(_pet.nome, style: textos.titleLarge),
            ..._linhaDaFoto(textos, cores),
            const SizedBox(height: BichuEspaco.e4),
            Text(
              TextosDoCadastro.corpoPetCadastrado,
              style: textos.bodyLarge,
            ),
            const SizedBox(height: BichuEspaco.e6),
            if (_emitindo)
              const Center(child: CircularProgressIndicator())
            else if (tag != null)
              _BlocoDoCodigo(
                tag: tag,
                nome: _pet.nome,
                aoCopiar: _copiar,
                estadoDoQr: _estadoDoQr,
                qr: _qr,
                aoTentarDeNovo: () => _baixarOQr(tag),
              ),
            if (_faixa != null) ...<Widget>[
              const SizedBox(height: BichuEspaco.e6),
              FaixaDeAviso(
                peso: PesoDaFaixa.informativo,
                texto: _faixa!.texto,
                rotuloDaAcao: _faixa!.acao,
                aoTocarNaAcao: _faixa!.acao == null ? null : _emitir,
              ),
            ],
            if (_pet.redacoesDeCuidados.isNotEmpty) ...<Widget>[
              const SizedBox(height: BichuEspaco.e6),
              FaixaDeAviso(
                peso: PesoDaFaixa.informativo,
                texto: TextosDoCadastro.redacaoDeCuidados(
                  _pet.redacoesDeCuidados
                      .map((r) => r.comoSeChama)
                      .toList(growable: false),
                  _pet.nome,
                ),
              ),
            ],
          ],
        ),
      ),
    );
  }
}

enum _EstadoDoQr {
  /// A emissao nao prometeu imagem (`qr_png_url` ausente).
  semEndereco,

  /// A requisicao esta em curso.
  carregando,

  /// Os bytes chegaram e estao desenhados.
  pronto,

  /// A requisicao saiu e nao voltou imagem.
  falhou,
}

enum _EstadoDaFoto {
  /// O cadastro veio sem foto.
  semFoto,

  /// Os bytes estao a caminho.
  subindo,

  /// Os bytes chegaram e a confirmacao saiu.
  enviada,

  /// Faltou rede. Faixa informativa **com** `Enviar a foto de novo`.
  semSinal,

  /// O servidor ou o armazenamento recusaram.
  recusada,
}

const double _ladoDoQr = 200;

class _BlocoDoCodigo extends StatelessWidget {
  const _BlocoDoCodigo({
    required this.tag,
    required this.nome,
    required this.aoCopiar,
    required this.estadoDoQr,
    required this.qr,
    required this.aoTentarDeNovo,
  });

  final TagEmitida tag;
  final String nome;
  final VoidCallback aoCopiar;
  final _EstadoDoQr estadoDoQr;
  final MemoryImage? qr;
  final VoidCallback aoTentarDeNovo;

  @override
  Widget build(BuildContext context) {
    final cores = BichuColors.of(context).cores;
    final textos = Theme.of(context).textTheme;

    return Container(
      padding: const EdgeInsets.all(BichuEspaco.e4),
      decoration: BoxDecoration(
        color: const Color(0xFFFFFFFF),
        borderRadius: BorderRadius.circular(BichuRaio.lg),
        border: Border.all(color: cores.outline, width: BichuBorda.hairline),
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: <Widget>[
          _ImagemDoQr(
            estado: estadoDoQr,
            provedor: qr,
            codigo: tag.codigo,
            aoTentarDeNovo: aoTentarDeNovo,
          ),
          const SizedBox(height: BichuEspaco.e4),
          Row(
            crossAxisAlignment: CrossAxisAlignment.center,
            children: <Widget>[
              Expanded(
                child: SelectableText(
                  tag.codigo,
                  style: textos.titleLarge?.copyWith(
                    color: const Color(0xFF000000),
                    fontFeatures: const <FontFeature>[
                      FontFeature.slashedZero(),
                      FontFeature.tabularFigures(),
                    ],
                  ),
                ),
              ),
              const SizedBox(width: BichuEspaco.e3),
              Semantics(
                button: true,
                container: true,
                label: '${TextosDoCadastro.copiarOCodigo} da tag de $nome',
                excludeSemantics: true,
                onTap: aoCopiar,
                child: TextButton.icon(
                  onPressed: aoCopiar,
                  icon: const Icon(Icons.copy, size: 20),
                  label: const Text(TextosDoCadastro.copiarOCodigo),
                  style: TextButton.styleFrom(
                    minimumSize: const Size(0, BichuAlvoDeToque.min),
                  ),
                ),
              ),
            ],
          ),
          const SizedBox(height: BichuEspaco.e3),
          Text(
            TextosDoCadastro.soAquiPorExtenso(tag.sufixo),
            style: textos.bodyMedium?.copyWith(color: cores.textSecondary),
          ),
        ],
      ),
    );
  }
}

/// O lugar do QR, nos quatro estados.
class _ImagemDoQr extends StatelessWidget {
  const _ImagemDoQr({
    required this.estado,
    required this.provedor,
    required this.codigo,
    required this.aoTentarDeNovo,
  });

  final _EstadoDoQr estado;
  final MemoryImage? provedor;
  final String codigo;
  final VoidCallback aoTentarDeNovo;

  @override
  Widget build(BuildContext context) {
    final cores = BichuColors.of(context).cores;
    final textos = Theme.of(context).textTheme;
    final imagem = provedor;

    switch (estado) {
      case _EstadoDoQr.semEndereco:
        return Text(
          TextosDoCadastro.qrSemImagem,
          style: textos.bodyMedium?.copyWith(color: cores.textSecondary),
        );

      case _EstadoDoQr.carregando:
        return Center(
          child: Semantics(
            label: TextosDoCadastro.qrCarregando,
            liveRegion: true,
            child: const SizedBox(
              width: _ladoDoQr,
              height: _ladoDoQr,
              child: Center(child: CircularProgressIndicator()),
            ),
          ),
        );

      case _EstadoDoQr.pronto:
        if (imagem == null) {
          return Text(
            TextosDoCadastro.qrSemImagem,
            style: textos.bodyMedium?.copyWith(color: cores.textSecondary),
          );
        }
        return Center(
          child: Semantics(
            image: true,
            label: codigo,
            child: Image(
              image: imagem,
              width: _ladoDoQr,
              height: _ladoDoQr,
              gaplessPlayback: false,
            ),
          ),
        );

      case _EstadoDoQr.falhou:
        return FaixaDeAviso(
          peso: PesoDaFaixa.informativo,
          texto: TextosDoCadastro.qrNaoCarregou,
          rotuloDaAcao: MensagensDeErro.tentarDeNovo,
          aoTocarNaAcao: aoTentarDeNovo,
        );
    }
  }
}
