import 'package:flutter/material.dart';
import 'package:go_router/go_router.dart';

import '../../api/envio_de_foto.dart';
import '../../api/falhas.dart';
import '../../api/mensagens_de_erro.dart';
import '../../api/modelos_pet.dart';
import '../../api/problem.dart';
import '../../dispositivo/camera_e_galeria.dart';
import '../../escopo.dart';
import '../../roteamento/rotas.dart';
import '../../roteamento/saida_da_mensagem.dart';
import '../../theme/bichu_colors.dart';
import '../../theme/bichu_tokens.g.dart';
import '../../widgets/barra_de_acao_fixa.dart';
import '../../widgets/botao_primario.dart';
import '../../widgets/faixa_de_aviso.dart';
import '../../widgets/folha_destrutiva.dart';
import '../../widgets/item_de_menu.dart';
import '../../widgets/moldura.dart';
import '../../widgets/previa_da_foto.dart';
import '../../widgets/recorte_de_imagem.dart';
import '../../widgets/saida_da_tela.dart';
import 'campos_do_pet.dart';
import 'rascunho_de_pet.dart';
import 'textos_do_detalhe.dart';

/// Editar os dados do pet (BICHUS-61), derivada de F1.3 e F1.5.
class TelaEditarPet extends StatefulWidget {
  const TelaEditarPet({required this.pet, super.key});

  /// O pet **ja carregado**, e nao um id.
  final Pet pet;

  @override
  State<TelaEditarPet> createState() => _TelaEditarPetState();
}

/// Em que pe esta a foto, do ponto de vista desta tela.
enum _PassoDaFoto {
  /// Nada em curso. O que a tela mostra e o que o servidor tem.
  parada,

  /// Os bytes estao subindo.
  subindo,

  /// A remocao esta em curso.
  removendo,
}

class _TelaEditarPetState extends State<TelaEditarPet> {
  late final RascunhoDePet _rascunho = RascunhoDePet.doPet(widget.pet);

  final GlobalKey<CamposDeIdentificacaoState> _identificacao =
      GlobalKey<CamposDeIdentificacaoState>();
  final GlobalKey<CamposDeSinaisState> _sinais =
      GlobalKey<CamposDeSinaisState>();

  bool _salvando = false;
  MensagemDeErro? _faixa;

  /// O pet **como o servidor o tem agora**, e nao como ele chegou.
  late Pet _pet = widget.pet;

  /// A foto mudou no servidor desde que esta tela abriu?
  bool _fotoMudou = false;

  _PassoDaFoto _passoDaFoto = _PassoDaFoto.parada;

  /// A foto que a pessoa ACABOU de escolher, enquanto a derivada nao existe.
  FotoLocal? _fotoEscolhida;

  /// O recado do bloco da foto: informativo quase sempre.
  String? _recadoDaFoto;

  /// O recado e um erro, ou so uma informacao?
  bool _recadoEhErro = false;

  EstadoDaPermissao _permissaoDaCamera = EstadoDaPermissao.negada;
  bool _consultandoPermissao = true;

  /// Ver o mesmo sinalizador em F1.4 e F1.6: `Escopo` e `InheritedWidget`, e
  /// le-lo em `initState` e erro de framework.
  bool _iniciou = false;

  @override
  void didChangeDependencies() {
    super.didChangeDependencies();
    if (_iniciou) return;
    _iniciou = true;
    _consultarPermissao();
  }

  Future<void> _consultarPermissao() async {
    final estado = await Escopo.of(context).camera.estadoDaCamera();
    if (!mounted) return;
    setState(() {
      _permissaoDaCamera = estado;
      _consultandoPermissao = false;
    });
  }

  @override
  void dispose() {
    _rascunho.dispose();
    super.dispose();
  }

  /// Rele o pet para pegar a lista de fotos que o servidor passou a ter.
  Future<void> _recarregarOPet() async {
    try {
      final fresco = await Escopo.of(context).pets.buscarPet(widget.pet.id);
      if (!mounted) return;
      setState(() {
        _pet = fresco;
        _fotoMudou = true;
      });
    } on Object {
      if (!mounted) return;
      setState(() => _fotoMudou = true);
    }
  }

  /// Abre a folha com as duas origens e envia o que vier.
  Future<void> _trocarAFoto() async {
    if (_passoDaFoto != _PassoDaFoto.parada) return;

    final origem = await showModalBottomSheet<_Origem>(
      context: context,
      backgroundColor: BichuColors.of(context).cores.surface,
      barrierColor: BichuColors.of(context).cores.scrim,
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
              if (_cameraPodeFuncionar) ...<Widget>[
                BotaoPrimario(
                  rotulo: TextosDoDetalhe.tirarFoto,
                  critico: true,
                  aoTocar: () =>
                      Navigator.of(contexto).pop(_Origem.camera),
                ),
                const SizedBox(height: BichuEspaco.e2),
                BotaoSecundario(
                  rotulo: TextosDoDetalhe.escolherDaGaleria,
                  aoTocar: () =>
                      Navigator.of(contexto).pop(_Origem.galeria),
                ),
              ] else ...<Widget>[
                BotaoPrimario(
                  rotulo: TextosDoDetalhe.escolherDaGaleria,
                  critico: true,
                  aoTocar: () =>
                      Navigator.of(contexto).pop(_Origem.galeria),
                ),
                if (_permissaoDaCamera != EstadoDaPermissao.indisponivel)
                  ...<Widget>[
                  const SizedBox(height: BichuEspaco.e2),
                  BotaoSecundario(
                    rotulo: TextosDoDetalhe.tirarFoto,
                    aoTocar: () =>
                        Navigator.of(contexto).pop(_Origem.camera),
                  ),
                ],
              ],
            ],
          ),
        ),
      ),
    );

    if (!mounted || origem == null) return;

    final camera = Escopo.of(context).camera;

    if (origem == _Origem.camera) {
      if (_permissaoDaCamera == EstadoDaPermissao.negada) {
        final novo = await camera.pedirCamera();
        if (!mounted) return;
        setState(() => _permissaoDaCamera = novo);
        if (novo != EstadoDaPermissao.concedida) return;
      }
      if (_permissaoDaCamera != EstadoDaPermissao.concedida) return;
    }

    final foto = origem == _Origem.camera
        ? await camera.tirarFoto()
        : await camera.escolherDaGaleria();
    if (!mounted || foto == null) return;

    final ajustada = await _ajustar(camera, foto);
    if (!mounted || ajustada == null) return;

    await _enviar(ajustada);
  }

  /// O RECORTE, entre "a pessoa escolheu" e o envio.
  Future<FotoLocal?> _ajustar(CameraEGaleria camera, FotoLocal foto) =>
      ajustarAFoto(
        context,
        camera: camera,
        foto: foto,
        formato: FormatoDoRecorte.fotoDePet,
        titulo: 'Ajuste a foto do pet',
      );

  Future<void> _enviar(FotoLocal foto) async {
    final retomada = Escopo.of(context).retomadaDeFotos;

    setState(() {
      _fotoEscolhida = foto;
      _passoDaFoto = _PassoDaFoto.subindo;
      _recadoDaFoto = TextosDoDetalhe.fotoSubindo;
      _recadoEhErro = false;
    });

    final desfecho = await retomada.enviarDoPet(petId: widget.pet.id, foto: foto);
    if (!mounted) return;

    setState(() {
      _passoDaFoto = _PassoDaFoto.parada;
      _recadoDaFoto = switch (desfecho) {
        DesfechoDoEnvio.enviada => TextosDoDetalhe.fotoEnviada,
        DesfechoDoEnvio.semSinal => TextosDoDetalhe.fotoSemSinal,
        DesfechoDoEnvio.recusada => TextosDoDetalhe.fotoRecusada,
      };
      _recadoEhErro = desfecho == DesfechoDoEnvio.recusada;
      if (desfecho == DesfechoDoEnvio.recusada) _fotoEscolhida = null;
    });

    if (desfecho == DesfechoDoEnvio.enviada) await _recarregarOPet();
  }

  /// Remover **sem substituir**, que e o que o servidor permite.
  Future<void> _removerAFoto() async {
    if (_passoDaFoto != _PassoDaFoto.parada) return;
    final capa = _pet.fotoDeCapa;
    if (capa == null) return;

    final escopo = Escopo.of(context);
    FalhaDeChamada? falha;

    final removeu = await mostrarFolhaDestrutiva(
      context,
      titulo: TextosDoDetalhe.tituloDaRemocaoDaFoto,
      corpo: TextosDoDetalhe.corpoDaRemocaoDaFoto(_pet.nome),
      oQueSome: <String>[TextosDoDetalhe.fotoAtualDe(_pet.nome)],
      avisoExtra: _pet.idDoCasoAberto == null
          ? null
          : TextosDoDetalhe.casoAbertoSeraEncerrado(_pet.nome),
      rotuloDeConfirmar: TextosDoDetalhe.confirmarRemocaoDaFoto,
      rotuloAcessivelDeConfirmar:
          TextosDoDetalhe.confirmarRemocaoDaFotoAcessivel(_pet.nome),
      aoConfirmar: () async {
        try {
          await escopo.pets.excluirFotoDoPet(
            petId: _pet.id,
            photoId: capa.id,
          );
        } on FalhaDeChamada catch (erro) {
          falha = erro;
          rethrow;
        }
      },
    );

    if (!mounted) return;

    if (!removeu) {
      final erro = falha;
      if (erro == null) return;
      setState(() {
        _recadoDaFoto = _mensagemDaRemocao(erro);
        _recadoEhErro = true;
      });
      return;
    }

    setState(() {
      _recadoDaFoto = null;
      _recadoEhErro = false;
      _fotoEscolhida = null;
    });
    await _recarregarOPet();
  }

  /// O 409 de `deletePetPhoto`, tratado antes de o servidor emiti-lo.
  String _mensagemDaRemocao(FalhaDeChamada falha) {
    if (falha is FalhaDaApi &&
        (falha.problem.tipo == ProblemTipo.petSemFoto ||
            falha.problem.status == 409)) {
      return TextosDoDetalhe.fotoPresaAoCasoAberto;
    }
    if (falha is FalhaDaApi &&
        (falha.problem.tipo == ProblemTipo.naoEncontrado ||
            falha.problem.status == 404)) {
      return TextosDoDetalhe.naoConseguimosRemoverAFoto;
    }
    return MensagensDeErro.de(falha).texto;
  }

  /// A camera pode funcionar neste aparelho, agora?
  bool get _cameraPodeFuncionar =>
      !_consultandoPermissao &&
      (_permissaoDaCamera == EstadoDaPermissao.concedida ||
          _permissaoDaCamera == EstadoDaPermissao.negada);

  Future<void> _salvar() async {
    final identificacaoOk = _identificacao.currentState?.validar() ?? false;
    final sinaisOk = _sinais.currentState?.validar() ?? false;
    if (!identificacaoOk || !sinaisOk) return;

    setState(() {
      _faixa = null;
      _salvando = true;
    });

    try {
      final atualizado = await Escopo.of(context).pets.atualizarPet(
        petId: widget.pet.id,
        nome: _rascunho.nome,
        especie: _rascunho.especie!,
        porte: _rascunho.porte!,
        breedCode: _rascunho.breedCode,
        breedFreeText: _rascunho.breedFreeTextParaEnvio,
        refDataVersion: _rascunho.refDataVersion,
        corPrincipalCodigo: _rascunho.corPrincipalCodigo,
        segundaCorCodigo: _rascunho.segundaCorCodigo,
        sexo: _rascunho.sexo,
        sinaisParticulares: _rascunho.sinaisParticulares,
        cuidados: _rascunho.cuidados,
      );
      if (!mounted) return;
      context.pop(atualizado);
    } on FalhaDeChamada catch (falha) {
      if (!mounted) return;
      setState(() => _faixa = _mensagem(falha));
    } on Object catch (erro, pilha) {
      registrarFalhaInesperada(erro, pilha, onde: 'ao salvar a edicao do pet');
      if (!mounted) return;
      setState(
        () => _faixa = const MensagemDeErro(texto: MensagensDeErro.servidorFora),
      );
    } finally {
      if (mounted) setState(() => _salvando = false);
    }
  }

  /// **Decide por `type`, nunca por status.**
  MensagemDeErro _mensagem(FalhaDeChamada falha) {
    if (falha is FalhaDaApi &&
        falha.problem.tipo == ProblemTipo.validacaoFalhou) {
      final primeiro = falha.problem.campos.isEmpty
          ? null
          : falha.problem.campos.first.mensagem;
      return MensagemDeErro(
        texto: primeiro ?? TextosDoDetalhe.naoConseguimosSalvar,
      );
    }
    if (falha is FalhaDaApi &&
        (falha.problem.tipo == ProblemTipo.naoEncontrado ||
            falha.problem.status == 404)) {
      return const MensagemDeErro(texto: TextosDoDetalhe.petForaDaConta);
    }
    return MensagensDeErro.de(falha);
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: BarraDeConta(
        titulo: TextosDoDetalhe.tituloDaEdicao,
        saida: TipoDeSaida.voltar,
        resultado: () => _fotoMudou ? _pet : null,
      ),
      bottomNavigationBar: BarraDeAcaoFixa(
        acoes: <Widget>[
          BotaoPrimario(
            rotulo: TextosDoDetalhe.salvar,
            critico: true,
            carregando: _salvando,
            aoTocar: _salvar,
          ),
        ],
      ),
      body: SafeArea(
        child: SingleChildScrollView(
          padding: const EdgeInsets.all(BichuEspaco.e4),
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.stretch,
            children: <Widget>[
              if (widget.pet.idDoCasoAberto != null) ...<Widget>[
                const FaixaDeAviso(
                  peso: PesoDaFaixa.informativo,
                  texto: TextosDoDetalhe.oAlertaJaSaiu,
                ),
                const SizedBox(height: BichuEspaco.e6),
              ],
              CamposDeIdentificacao(key: _identificacao, rascunho: _rascunho),
              const SizedBox(height: BichuEspaco.e6),
              _BlocoDaFoto(
                pet: _pet,
                escolhida: _fotoEscolhida,
                passo: _passoDaFoto,
                recado: _recadoDaFoto,
                recadoEhErro: _recadoEhErro,
                permissao: _permissaoDaCamera,
                aoTrocar: _trocarAFoto,
                aoRemover: _removerAFoto,
                aoAbrirOsAjustes: () =>
                    Escopo.of(context).camera.abrirAjustesDoSistema(),
              ),
              const SizedBox(height: BichuEspaco.e6),
              CamposDeSinais(key: _sinais, rascunho: _rascunho),
              const SizedBox(height: BichuEspaco.e6),
              ItemDeMenu(
                rotulo: _TextosDoEnderecoDoPet.rotulo,
                apoio: _TextosDoEnderecoDoPet.apoio,
                aoTocar: () => GoRouter.of(context)
                    .push(Rotas.enderecoDeEntregaDoPet(_pet.id)),
              ),
              if (_faixa != null) ...<Widget>[
                const SizedBox(height: BichuEspaco.e6),
                FaixaDeAviso(
                  texto: _faixa!.texto,
                  rotuloDaAcao: _faixa!.acao,
                  aoTocarNaAcao: saidaDaMensagem(context, _faixa!),
                ),
              ],
            ],
          ),
        ),
      ),
    );
  }
}

/// De onde a foto vem. Local da folha, nao trafega e nao espelha lista do
/// contrato.
enum _Origem { camera, galeria }

/// O bloco da foto: a foto atual, as acoes e o recado.
class _BlocoDaFoto extends StatelessWidget {
  const _BlocoDaFoto({
    required this.pet,
    required this.escolhida,
    required this.passo,
    required this.recado,
    required this.recadoEhErro,
    required this.permissao,
    required this.aoTrocar,
    required this.aoRemover,
    required this.aoAbrirOsAjustes,
  });

  final Pet pet;

  /// A foto recem-escolhida, enquanto a derivada do servidor nao existe.
  final FotoLocal? escolhida;
  final _PassoDaFoto passo;
  final String? recado;
  final bool recadoEhErro;
  final EstadoDaPermissao permissao;
  final VoidCallback aoTrocar;
  final VoidCallback aoRemover;
  final VoidCallback aoAbrirOsAjustes;

  @override
  Widget build(BuildContext context) {
    final cores = BichuColors.of(context).cores;
    final textos = Theme.of(context).textTheme;
    final capa = pet.fotoDeCapa;
    final ocupado = passo != _PassoDaFoto.parada;

    return Column(
      crossAxisAlignment: CrossAxisAlignment.stretch,
      children: <Widget>[
        Text(TextosDoDetalhe.tituloDaFoto, style: textos.titleMedium),
        const SizedBox(height: BichuEspaco.e4),
        Align(
          alignment: Alignment.centerLeft,
          child: _MolduraDaEdicao(
            pet: pet,
            capa: capa,
            escolhida: escolhida,
            subindo: passo == _PassoDaFoto.subindo,
          ),
        ),
        const SizedBox(height: BichuEspaco.e4),
        BotaoSecundario(
          rotulo: capa == null
              ? TextosDoDetalhe.adicionarFoto
              : TextosDoDetalhe.trocarAFoto,
          carregando: passo == _PassoDaFoto.subindo,
          aoTocar: ocupado ? null : aoTrocar,
        ),
        if (capa != null) ...<Widget>[
          const SizedBox(height: BichuEspaco.e2),
          BotaoSecundario(
            rotulo: TextosDoDetalhe.removerAFoto,
            carregando: passo == _PassoDaFoto.removendo,
            aoTocar: ocupado ? null : aoRemover,
          ),
        ],
        if (capa == null && escolhida == null && !pet.temFotoEmProcessamento) ...<Widget>[
          const SizedBox(height: BichuEspaco.e2),
          Text(
            TextosDoDetalhe.semFotoAinda,
            style: textos.bodySmall?.copyWith(color: cores.textSecondary),
          ),
        ],
        if (pet.temFotoEmProcessamento && recado == null) ...<Widget>[
          const SizedBox(height: BichuEspaco.e2),
          Text(
            TextosDoDetalhe.fotoEmProcessamento,
            style: textos.bodySmall?.copyWith(color: cores.textSecondary),
          ),
        ],
        if (pet.motivoDaFotoRecusada case final motivo?) ...<Widget>[
          const SizedBox(height: BichuEspaco.e4),
          FaixaDeAviso(peso: PesoDaFaixa.informativo, texto: motivo),
        ],
        if (recado case final texto?) ...<Widget>[
          const SizedBox(height: BichuEspaco.e4),
          FaixaDeAviso(
            peso: recadoEhErro ? PesoDaFaixa.erro : PesoDaFaixa.informativo,
            texto: texto,
          ),
        ],
        if (permissao == EstadoDaPermissao.negadaPermanentemente) ...<Widget>[
          const SizedBox(height: BichuEspaco.e4),
          FaixaDeAviso(
            peso: PesoDaFaixa.informativo,
            texto: TextosDoDetalhe.cameraNegada,
            rotuloDaAcao: TextosDoDetalhe.abrirOsAjustes,
            aoTocarNaAcao: aoAbrirOsAjustes,
          ),
        ] else if (permissao == EstadoDaPermissao.indisponivel) ...<Widget>[
          const SizedBox(height: BichuEspaco.e4),
          const FaixaDeAviso(
            peso: PesoDaFaixa.informativo,
            texto: TextosDoDetalhe.cameraNaoEmbarcada,
          ),
        ],
      ],
    );
  }
}

/// A moldura `foto/lg` desta tela, nos quatro estados.
class _MolduraDaEdicao extends StatelessWidget {
  const _MolduraDaEdicao({
    required this.pet,
    required this.capa,
    required this.escolhida,
    required this.subindo,
  });

  final Pet pet;
  final FotoDoPet? capa;

  /// A foto recem-escolhida. Tem precedencia sobre [capa], e e o conserto.
  final FotoLocal? escolhida;
  final bool subindo;

  /// O ponto focal das DUAS imagens desta moldura.
  static const Alignment _pontoFocal = Alignment(0, -1 / 3);

  @override
  Widget build(BuildContext context) {
    return Moldura(
      largura: BichuMoldura.larguraFotoLg,
      estado: _estado,
      filho: _imagem(),
    );
  }

  /// O estado da moldura, decidido num lugar so.
  EstadoDaMoldura get _estado {
    if (escolhida != null) return EstadoDaMoldura.repouso;
    if (capa != null && !subindo) return EstadoDaMoldura.repouso;
    return subindo || pet.temFotoEmProcessamento
        ? EstadoDaMoldura.carregando
        : EstadoDaMoldura.vazio;
  }

  /// A imagem que a moldura recebe, ou nulo nos estados sem imagem.
  Widget? _imagem() {
    final local = escolhida;
    if (local != null) {
      return Semantics(
        image: true,
        label: TextosDoDetalhe.fotoAtualDe(pet.nome),
        child: PreviaDaFoto(
          foto: local,
          descricao: TextosDoDetalhe.fotoAtualDe(pet.nome),
          pontoFocal: _pontoFocal,
          comInvolucroProprio: false,
          aoNaoAbrir: (context) => Moldura(
            largura: BichuMoldura.larguraFotoLg,
            estado: subindo
                ? EstadoDaMoldura.carregando
                : EstadoDaMoldura.vazio,
          ),
        ),
      );
    }

    final atual = capa;
    if (atual != null && !subindo) {
      return Semantics(
        image: true,
        label: TextosDoDetalhe.fotoAtualDe(pet.nome),
        child: Image.network(
          atual.urlDeCartao!,
          fit: BoxFit.cover,
          alignment: _pontoFocal,
          errorBuilder: (context, erro, pilha) =>
              const Moldura(largura: BichuMoldura.larguraFotoLg),
        ),
      );
    }

    return null;
  }
}

/// Os textos da porta do endereco de entrega deste pet.
abstract final class _TextosDoEnderecoDoPet {
  static const String rotulo = 'Endereco de entrega';

  /// **Diz para que serve, diz que e DESTE pet, e nao promete prazo.**
  static const String apoio = 'Para onde mandar a plaquinha deste pet';
}
