import 'package:flutter/material.dart';
import 'package:go_router/go_router.dart';

import '../../acessibilidade/anunciar.dart';
import '../../api/falhas.dart';
import '../../api/mensagens_de_erro.dart';
import '../../api/modelos_caso.dart';
import '../../api/modelos_pet.dart';
import '../../api/problem.dart';
import '../../dispositivo/saida_do_app.dart';
import '../../escopo.dart';
import '../../formato/quando.dart';
import '../../perdido/rascunho_do_caso.dart';
import '../../roteamento/rotas.dart';
import '../../theme/bichu_colors.dart';
import '../../theme/bichu_tokens.g.dart';
import '../../widgets/convite_para_entrar.dart';
import '../../widgets/botao_primario.dart';
import '../../widgets/cartao_de_pet.dart';
import '../../widgets/faixa_de_aviso.dart';
import '../../widgets/folha_destrutiva.dart';
import '../../widgets/moldura.dart';
import '../../widgets/qr_da_plaquinha.dart';
import '../../widgets/saida_da_tela.dart';
import '../perdido/tela_de_quem_e_o_caso.dart';
import 'textos_do_detalhe.dart';

/// T.1 — Detalhe do pet (UX, secao 7.6.3).
class TelaDetalheDoPet extends StatefulWidget {
  const TelaDetalheDoPet({required this.petId, super.key});

  final String petId;

  @override
  State<TelaDetalheDoPet> createState() => _TelaDetalheDoPetState();
}

/// Os desfechos de uma abertura.
enum _Fase { carregando, carregado, foraDaConta, semConta, falha }

class _TelaDetalheDoPetState extends State<TelaDetalheDoPet> {
  _Fase _fase = _Fase.carregando;
  Pet? _pet;
  String? _textoDaFalha;

  /// O estado da imagem do QR.
  EstadoDoQrDaPlaquinha _estadoDoQr = EstadoDoQrDaPlaquinha.carregando;

  /// O provedor que o cofre devolveu.
  ImageProvider? _qr;

  /// `code_suffix` da tag em vigor.
  String _sufixoDaTag = '';

  /// Se este pet TEM pedido da plaquinha, e por isso se o link de
  /// acompanhamento tem para onde levar.
  bool _temPedidoDePlaquinha = false;

  /// Se o encerramento do caso esta em curso.
  bool _encerrandoOCaso = false;

  /// O que deu errado ao encerrar, se deu.
  String? _erroAoEncerrar;

  /// O caso que ESTA TELA acabou de encerrar, enquanto a janela de reabertura
  /// estiver aberta.
  CasoDePerdido? _casoEncerradoAgora;

  /// O CASO ABERTO deste pet, lido do servidor.
  CasoDePerdido? _casoAberto;

  /// O que deu errado ao abrir a FOLHA de compartilhamento, se deu.
  String? _erroAoCompartilhar;

  /// Se a reabertura esta em curso.
  bool _reabrindoOCaso = false;

  /// O que deu errado ao REABRIR, se deu.
  String? _erroAoReabrir;

  bool _iniciou = false;

  @override
  void didChangeDependencies() {
    super.didChangeDependencies();
    if (_iniciou) return;
    _iniciou = true;
    _carregar();
  }

  Future<void> _carregar() async {
    if (!mounted) return;
    setState(() {
      _fase = _Fase.carregando;
      _textoDaFalha = null;
    });
    try {
      final pet = await Escopo.of(context).pets.buscarPet(widget.petId);
      if (!mounted) return;
      setState(() {
        _pet = pet;
        _fase = _Fase.carregado;
      });
      await _carregarOQr(pet);
      await _carregarOPedidoDaPlaquinha(pet);
      await _carregarOCasoAberto(pet);
    } on FalhaDeChamada catch (falha) {
      if (!mounted) return;
      setState(() {
        if (faltaConta(falha)) {
          _fase = _Fase.semConta;
        } else if (_ehForaDaConta(falha)) {
          _fase = _Fase.foraDaConta;
        } else {
          _textoDaFalha = MensagensDeErro.de(falha).texto;
          _fase = _Fase.falha;
        }
      });
    } on Object catch (erro, pilha) {
      registrarFalhaInesperada(erro, pilha, onde: 'ao carregar o detalhe do pet');
      if (!mounted) return;
      setState(() {
        _textoDaFalha = MensagensDeErro.servidorFora;
        _fase = _Fase.falha;
      });
    }
  }

  /// Pergunta ao servidor se este pet tem pedido da plaquinha.
  Future<void> _carregarOPedidoDaPlaquinha(Pet pet) async {
    try {
      final pedidos =
          await Escopo.of(context).pets.listarPedidosDePlaquinha(pet.id);
      if (!mounted) return;
      setState(() => _temPedidoDePlaquinha = pedidos.isNotEmpty);
    } on Object {
      if (!mounted) return;
      setState(() => _temPedidoDePlaquinha = false);
    }
  }

  /// Le o caso ABERTO do pet, quando ha um.
  Future<void> _carregarOCasoAberto(Pet pet) async {
    final caseId = pet.idDoCasoAberto;
    if (caseId == null || caseId.isEmpty) {
      if (!mounted) return;
      setState(() => _casoAberto = null);
      return;
    }
    try {
      final caso = await Escopo.of(context).casos.buscarCaso(caseId);
      if (!mounted) return;
      setState(() => _casoAberto = caso);
    } on Object {
      if (!mounted) return;
      setState(() => _casoAberto = null);
    }
  }

  /// `Compartilhar`: abre a FOLHA DO SISTEMA com o texto do caso.
  Future<void> _compartilharOCaso(Pet pet) async {
    final caso = _casoAberto;
    final url = caso?.urlDeCompartilhar;
    if (caso == null || url == null || url.isEmpty) return;

    final abriu = await SaidaDoApp.atual.compartilharTexto(
      texto: TextosDoDetalhe.mensagemDeCompartilhar(
        nome: pet.nome,
        rotuloDaArea: caso.rotuloDaArea,
        url: url,
      ),
      assunto: TextosDoDetalhe.assuntoDeCompartilhar(
        nome: pet.nome,
        rotuloDaArea: caso.rotuloDaArea,
      ),
    );
    if (!mounted || abriu) return;
    setState(() => _erroAoCompartilhar = TextosDoDetalhe.folhaNaoAbriu);
  }

  /// Busca a tag em vigor e, com o `tagId` dela, a IMAGEM do QR.
  Future<void> _carregarOQr(Pet pet) async {
    final escopo = Escopo.of(context);
    final api = escopo.api;
    final pets = escopo.pets;
    final cofre = escopo.cofreDoQr;

    if (pet.semTag) {
      if (!mounted) return;
      setState(() {
        _qr = null;
        _sufixoDaTag = '';
        _estadoDoQr = EstadoDoQrDaPlaquinha.semTag;
      });
      return;
    }

    setState(() {
      _qr = null;
      _estadoDoQr = EstadoDoQrDaPlaquinha.carregando;
    });

    try {
      final tags = await pets.listarTags(pet.id);
      TagDoPet? ativa;
      for (final tag in tags) {
        if (tag.ativa && tag.id.isNotEmpty) {
          ativa = tag;
          break;
        }
      }
      if (ativa == null) {
        if (!mounted) return;
        setState(() {
          _sufixoDaTag = '';
          _estadoDoQr = EstadoDoQrDaPlaquinha.semTag;
        });
        return;
      }

      final TagDoPet tagAtiva = ativa;
      final bytes = await api.baixarImagem(
        pets.enderecoDaImagemDoQr(petId: pet.id, tagId: tagAtiva.id),
      );
      final provedor = await cofre.guardar(bytes);
      if (!mounted) return;
      setState(() {
        _qr = provedor;
        _sufixoDaTag = tagAtiva.sufixo;
        _estadoDoQr = EstadoDoQrDaPlaquinha.pronto;
      });
    } on FalhaDeChamada {
      if (!mounted) return;
      setState(() {
        _qr = null;
        _estadoDoQr = EstadoDoQrDaPlaquinha.falhou;
      });
    } on Object catch (erro, pilha) {
      registrarFalhaInesperada(erro, pilha, onde: 'ao carregar o QR do pet');
      if (!mounted) return;
      setState(() {
        _qr = null;
        _estadoDoQr = EstadoDoQrDaPlaquinha.falhou;
      });
    }
  }

  /// `Marcar como perdido`, **reaproveitando o fluxo que ja existe**.
  void _marcarComoPerdido(Pet pet) {
    context.push(Rotas.marcarPerdido, extra: RascunhoDoCaso(pet: pet));
  }

  /// `Encontrei meu pet`: a ACAO INVERSA, pedida pelo cliente em 18/10/2026.
  Future<void> _encontreiMeuPet(Pet pet) async {
    final caseId = pet.idDoCasoAberto;
    if (caseId == null || caseId.isEmpty) return;

    if (!await _confirmarEncerramento(pet)) return;
    if (!mounted) return;

    final escopo = Escopo.of(context);
    setState(() {
      _encerrandoOCaso = true;
      _erroAoEncerrar = null;
    });

    final CasoDePerdido encerrado;
    try {
      encerrado = await escopo.casos.encerrarCaso(
        caseId: caseId,
        desfecho: DesfechoDoCaso.reencontrado,
      );
    } on FalhaDeChamada catch (falha) {
      if (!mounted) return;
      setState(() {
        _encerrandoOCaso = false;
        _erroAoEncerrar = MensagensDeErro.de(falha).texto;
      });
      return;
    } on Object catch (erro, pilha) {
      registrarFalhaInesperada(erro, pilha, onde: 'ao encerrar o caso do pet');
      if (!mounted) return;
      setState(() {
        _encerrandoOCaso = false;
        _erroAoEncerrar = MensagensDeErro.servidorFora;
      });
      return;
    }

    escopo.cacheDeMeusPets.limpar();

    if (!mounted) return;
    anunciar(context, TextosDoDetalhe.casoEncerrado(pet.nome));
    setState(() {
      _casoEncerradoAgora = encerrado;
      _erroAoReabrir = null;
      _casoAberto = null;
      _erroAoCompartilhar = null;
    });

    try {
      final atualizado = await escopo.pets.buscarPet(widget.petId);
      if (!mounted) return;
      setState(() {
        _pet = atualizado;
        _encerrandoOCaso = false;
      });
    } on Object {
      if (!mounted) return;
      setState(() => _encerrandoOCaso = false);
    }
  }

  /// A FOLHA DE CONFIRMACAO do encerramento.
  Future<bool> _confirmarEncerramento(Pet pet) async {
    final confirmou = await showModalBottomSheet<bool>(
      context: context,
      showDragHandle: true,
      useSafeArea: true,
      isScrollControlled: true,
      builder: (contexto) => _FolhaDoEncerramento(
        titulo: TextosDoDetalhe.tituloDoEncerramento(pet.nome),
        corpo: TextosDoDetalhe.corpoDoEncerramento(pet.nome),
        oQueAcontece: TextosDoDetalhe.oQueAconteceAoEncerrar(pet.nome),
        rotuloDeConfirmar: TextosDoDetalhe.confirmarEncerramento,
        rotuloAcessivelDeConfirmar:
            TextosDoDetalhe.confirmarEncerramentoAcessivel(pet.nome),
        rotuloDeCancelar: TextosDoDetalhe.naoEncontreiAinda,
      ),
    );
    return confirmou ?? false;
  }

  /// `Reabrir o caso`: o desfazer que o contrato prometia e que nao existia.
  Future<void> _reabrirOCaso(CasoDePerdido caso) async {
    final escopo = Escopo.of(context);
    setState(() {
      _reabrindoOCaso = true;
      _erroAoReabrir = null;
    });

    try {
      await escopo.casos.reabrirCaso(caso.id);
    } on FalhaDeChamada catch (falha) {
      if (!mounted) return;
      setState(() {
        _reabrindoOCaso = false;
        _erroAoReabrir = MensagensDeErro.de(falha).texto;
      });
      return;
    } on Object catch (erro, pilha) {
      registrarFalhaInesperada(erro, pilha, onde: 'ao reabrir o caso do pet');
      if (!mounted) return;
      setState(() {
        _reabrindoOCaso = false;
        _erroAoReabrir = MensagensDeErro.servidorFora;
      });
      return;
    }

    escopo.cacheDeMeusPets.limpar();

    if (!mounted) return;
    anunciar(context, TextosDoDetalhe.casoReaberto(_pet?.nome ?? ''));
    setState(() {
      _casoEncerradoAgora = null;
      _erroAoEncerrar = null;
    });

    try {
      final atualizado = await escopo.pets.buscarPet(widget.petId);
      if (!mounted) return;
      setState(() {
        _pet = atualizado;
        _reabrindoOCaso = false;
      });
      await _carregarOCasoAberto(atualizado);
    } on Object {
      if (!mounted) return;
      setState(() => _reabrindoOCaso = false);
    }
  }

  bool _ehForaDaConta(FalhaDeChamada falha) =>
      falha is FalhaDaApi &&
      (falha.problem.tipo == ProblemTipo.naoEncontrado ||
          falha.problem.status == 404);

  /// Abre a edicao e **recarrega com o que ela devolveu**.
  Future<void> _editar() async {
    final pet = _pet;
    if (pet == null) return;
    final atualizado = await context.push<Pet>(
      Rotas.editarPetDe(pet.id),
      extra: pet,
    );
    if (!mounted || atualizado == null) return;
    setState(() => _pet = atualizado);
  }

  /// A exclusao (BICHUS-60).
  Future<void> _excluir() async {
    final pet = _pet;
    if (pet == null) return;
    final escopo = Escopo.of(context);

    final excluiu = await mostrarFolhaDestrutiva(
      context,
      titulo: TextosDoDetalhe.tituloDaExclusao(pet.nome),
      corpo: TextosDoDetalhe.corpoDaExclusao(pet.nome),
      oQueSome: TextosDoDetalhe.oQueSome(pet),
      avisoExtra: pet.idDoCasoAberto == null
          ? null
          : TextosDoDetalhe.casoAbertoSeraEncerrado(pet.nome),
      rotuloDeConfirmar: TextosDoDetalhe.confirmarExclusao,
      rotuloAcessivelDeConfirmar:
          TextosDoDetalhe.confirmarExclusaoAcessivel(pet.nome),
      aoConfirmar: () => escopo.pets.excluirPet(pet.id),
    );
    if (!mounted || !excluiu) return;

    escopo.cacheDeMeusPets.limpar();

    if (!mounted) return;
    anunciar(context, TextosDoDetalhe.excluido(pet.nome));
    context.go(Rotas.perfil);
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: BarraDeConta(
        titulo: _pet?.nome ?? '',
        saida: TipoDeSaida.voltar,
      ),
      body: SafeArea(child: _corpo()),
    );
  }

  Widget _corpo() {
    return switch (_fase) {
      _Fase.carregando => const Center(child: CircularProgressIndicator()),
      _Fase.foraDaConta => _ForaDaConta(),
      _Fase.semConta => const Padding(
          padding: EdgeInsets.all(BichuEspaco.e4),
          child: ConviteParaEntrar(secao: SecaoComConta.paginaDoPet),
        ),
      _Fase.falha => _Falha(
          texto: _textoDaFalha!,
          aoTentarDeNovo: _carregar,
        ),
      _Fase.carregado => _Conteudo(
          pet: _pet!,
          aoEditar: _editar,
          aoExcluir: _excluir,
          estadoDoQr: _estadoDoQr,
          qr: _qr,
          sufixoDaTag: _sufixoDaTag,
          aoTentarOQr: () => _carregarOQr(_pet!),
          aoMarcarPerdido: () => _marcarComoPerdido(_pet!),
          aoEncontrarOPet: () => _encontreiMeuPet(_pet!),
          encerrandoOCaso: _encerrandoOCaso,
          erroAoEncerrar: _erroAoEncerrar,
          casoEncerradoAgora: _casoEncerradoAgora,
          reabrindoOCaso: _reabrindoOCaso,
          erroAoReabrir: _erroAoReabrir,
          aoReabrirOCaso: () {
            final caso = _casoEncerradoAgora;
            if (caso != null) _reabrirOCaso(caso);
          },
          casoAberto: _casoAberto,
          erroAoCompartilhar: _erroAoCompartilhar,
          aoCompartilhar: () => _compartilharOCaso(_pet!),
          temPedidoDePlaquinha: _temPedidoDePlaquinha,
          aoAcompanharPlaquinha: () =>
              context.push(Rotas.acompanharPlaquinhaDe(_pet!.id)),
        ),
    };
  }
}

/// O pet que a conta nao tem (ADR-0021).
class _ForaDaConta extends StatelessWidget {
  @override
  Widget build(BuildContext context) {
    final cores = BichuColors.of(context).cores;
    final textos = Theme.of(context).textTheme;
    return Padding(
      padding: const EdgeInsets.all(BichuEspaco.e4),
      child: Column(
        mainAxisAlignment: MainAxisAlignment.center,
        children: <Widget>[
          Text(
            TextosDoDetalhe.petForaDaConta,
            style: textos.titleLarge,
            textAlign: TextAlign.center,
          ),
          const SizedBox(height: BichuEspaco.e3),
          Text(
            TextosDoDetalhe.petForaDaContaExplicacao,
            style: textos.bodyMedium?.copyWith(color: cores.textSecondary),
            textAlign: TextAlign.center,
          ),
        ],
      ),
    );
  }
}

class _Falha extends StatelessWidget {
  const _Falha({required this.texto, required this.aoTentarDeNovo});

  final String texto;
  final VoidCallback aoTentarDeNovo;

  @override
  Widget build(BuildContext context) {
    return Padding(
      padding: const EdgeInsets.all(BichuEspaco.e4),
      child: FaixaDeAviso(
        texto: texto,
        rotuloDaAcao: 'Atualizar',
        aoTocarNaAcao: aoTentarDeNovo,
      ),
    );
  }
}

/// O corpo de T.1, na ordem da 7.6.3.
class _Conteudo extends StatelessWidget {
  const _Conteudo({
    required this.pet,
    required this.aoEditar,
    required this.aoExcluir,
    required this.estadoDoQr,
    required this.qr,
    required this.sufixoDaTag,
    required this.aoTentarOQr,
    required this.aoMarcarPerdido,
    required this.aoEncontrarOPet,
    required this.encerrandoOCaso,
    required this.erroAoEncerrar,
    required this.casoEncerradoAgora,
    required this.reabrindoOCaso,
    required this.erroAoReabrir,
    required this.aoReabrirOCaso,
    required this.casoAberto,
    required this.erroAoCompartilhar,
    required this.aoCompartilhar,
    required this.temPedidoDePlaquinha,
    required this.aoAcompanharPlaquinha,
  });

  final Pet pet;
  final VoidCallback aoEditar;
  final VoidCallback aoExcluir;
  final EstadoDoQrDaPlaquinha estadoDoQr;
  final ImageProvider? qr;
  final String sufixoDaTag;
  final VoidCallback aoTentarOQr;
  final VoidCallback aoMarcarPerdido;

  /// `Encontrei meu pet`: a acao inversa (cliente, 18/10/2026).
  final VoidCallback aoEncontrarOPet;

  final bool encerrandoOCaso;

  /// O que deu errado ao encerrar, se deu.
  final String? erroAoEncerrar;

  /// O caso que ESTA SESSAO DE TELA encerrou, se encerrou.
  final CasoDePerdido? casoEncerradoAgora;

  final bool reabrindoOCaso;

  /// O que deu errado ao REABRIR, se deu.
  final String? erroAoReabrir;

  final VoidCallback aoReabrirOCaso;

  /// O caso ABERTO deste pet, quando o servidor o entregou.
  final CasoDePerdido? casoAberto;

  /// O que deu errado ao abrir a folha de compartilhamento.
  final String? erroAoCompartilhar;

  final VoidCallback aoCompartilhar;

  /// Se ha pedido da plaquinha para este pet.
  final bool temPedidoDePlaquinha;
  final VoidCallback aoAcompanharPlaquinha;

  /// Se o pet **ja** esta sendo procurado.
  bool get _jaProcurado =>
      pet.status == StatusDoPet.perdido || pet.idDoCasoAberto != null;

  /// O ENDERECO PUBLICO do caso, ou `null` quando nao ha o que compartilhar.
  String? get _linkDoCaso {
    final caso = casoAberto;
    if (caso == null) return null;
    if (caso.status != 'open') return null;
    final url = caso.urlDeCompartilhar;
    if (url == null || url.isEmpty) return null;
    return url;
  }

  /// A ACAO DE ESTADO DO ANIMAL, nas DUAS direcoes e com **aparencia diferente
  /// em cada uma** (cliente, 18/10/2026).
  List<Widget> _acaoDeEstadoDoPet(BuildContext context) {
    final cores = BichuColors.of(context).cores;
    final textos = Theme.of(context).textTheme;

    if (_jaProcurado) {
      return <Widget>[
        Semantics(
          liveRegion: true,
          container: true,
          child: Container(
            width: double.infinity,
            padding: const EdgeInsets.all(BichuEspaco.e4),
            decoration: BoxDecoration(
              color: cores.urgency,
              borderRadius: BorderRadius.circular(BichuRaio.lg),
            ),
            child: Text(
              '${pet.nome}: ${TelaDeQuemEOCaso.jaProcurado}',
              style: textos.titleMedium?.copyWith(color: cores.onUrgency),
            ),
          ),
        ),
        const SizedBox(height: BichuEspaco.e4),
        if (_linkDoCaso != null) ...<Widget>[
          if (erroAoCompartilhar != null) ...<Widget>[
            Semantics(
              liveRegion: true,
              container: true,
              child: FaixaDeAviso(texto: erroAoCompartilhar!),
            ),
            const SizedBox(height: BichuEspaco.e4),
          ],
          BotaoSecundario(
            rotulo: TextosDoDetalhe.compartilhar,
            nomeAcessivel: TextosDoDetalhe.compartilharAcessivel(pet.nome),
            aoTocar: aoCompartilhar,
          ),
          const SizedBox(height: BichuEspaco.e6),
        ],
        if (erroAoEncerrar != null) ...<Widget>[
          FaixaDeAviso(texto: erroAoEncerrar!),
          const SizedBox(height: BichuEspaco.e4),
        ],
        BotaoPrimario(
          rotulo: TextosDoDetalhe.encontreiMeuPet,
          critico: true,
          carregando: encerrandoOCaso,
          aoTocar: aoEncontrarOPet,
        ),
        const SizedBox(height: BichuEspaco.e6),
      ];
    }
    return <Widget>[
      ...?_ofertaDeReabrir(context),
      BotaoSecundario(
        rotulo: TextosDoDetalhe.marcarComoPerdido,
        aoTocar: aoMarcarPerdido,
      ),
      const SizedBox(height: BichuEspaco.e6),
    ];
  }

  /// A oferta de REABRIR, ou `null` quando ela nao se aplica.
  List<Widget>? _ofertaDeReabrir(BuildContext context) {
    final caso = casoEncerradoAgora;
    if (caso == null) return null;
    if (!caso.janelaDeReaberturaAberta(DateTime.now())) return null;
    final prazo = caso.prazoDeReabertura;
    if (prazo == null) return null;

    return <Widget>[
      Semantics(
        liveRegion: true,
        container: true,
        child: FaixaDeAviso(
          peso: PesoDaFaixa.informativo,
          texto: TextosDoDetalhe.podeReabrirAte(QuandoNaLista.diaEMes(prazo)),
        ),
      ),
      const SizedBox(height: BichuEspaco.e4),
      if (erroAoReabrir != null) ...<Widget>[
        FaixaDeAviso(texto: erroAoReabrir!),
        const SizedBox(height: BichuEspaco.e4),
      ],
      BotaoSecundario(
        rotulo: TextosDoDetalhe.reabrirOCaso,
        carregando: reabrindoOCaso,
        aoTocar: aoReabrirOCaso,
      ),
      const SizedBox(height: BichuEspaco.e6),
    ];
  }

  @override
  Widget build(BuildContext context) {
    final cores = BichuColors.of(context).cores;
    final textos = Theme.of(context).textTheme;

    return ListView(
      padding: const EdgeInsets.all(BichuEspaco.e4),
      children: <Widget>[
        if (pet.semTag) ...<Widget>[
          FaixaDeAviso(
            peso: PesoDaFaixa.informativo,
            texto: TextosDoDetalhe.semTag(pet.nome),
          ),
          const SizedBox(height: BichuEspaco.e4),
        ],

        Center(
          child: Semantics(
            image: true,
            label: TextosDoDetalhe.fotoDe(pet.nome),
            child: _FotoGrande(pet: pet),
          ),
        ),

        if (pet.motivoDaFotoRecusada != null) ...<Widget>[
          const SizedBox(height: BichuEspaco.e4),
          FaixaDeAviso(
            texto: pet.motivoDaFotoRecusada!,
            peso: PesoDaFaixa.informativo,
          ),
        ],
        const SizedBox(height: BichuEspaco.e4),

        Text(
          CartaoDePet.atributosDe(pet),
          style: textos.bodyLarge?.copyWith(color: cores.textSecondary),
        ),
        const SizedBox(height: BichuEspaco.e6),

        ..._acaoDeEstadoDoPet(context),

        const SizedBox(height: BichuEspaco.e6),
        Semantics(
          header: true,
          child: Text(QrDaPlaquinha.titulo, style: textos.titleMedium),
        ),
        const SizedBox(height: BichuEspaco.e3),
        QrDaPlaquinha(
          estado: estadoDoQr,
          provedor: qr,
          sufixo: sufixoDaTag,
          nomeDoPet: pet.nome,
          aoTentarDeNovo: aoTentarOQr,
        ),

        if (temPedidoDePlaquinha) ...<Widget>[
          const SizedBox(height: BichuEspaco.e4),
          _AcaoEmTexto(
            rotulo: TextosDoDetalhe.acompanharPlaquinha,
            aoTocar: aoAcompanharPlaquinha,
          ),
        ],

        const SizedBox(height: BichuEspaco.e6),
        _CartaoDeTexto(
          titulo: TextosDoDetalhe.rotuloDosSinais,
          texto: pet.sinaisParticulares,
          vazio: TextosDoDetalhe.semSinais,
        ),

        if (pet.cuidados != null && pet.cuidados!.isNotEmpty) ...<Widget>[
          const SizedBox(height: BichuEspaco.e4),
          _CartaoDeTexto(titulo: 'Cuidados', texto: pet.cuidados),
        ],

        const SizedBox(height: BichuEspaco.e8),
        _AcaoEmTexto(rotulo: TextosDoDetalhe.editar, aoTocar: aoEditar),
        const SizedBox(height: BichuEspaco.e4),
        _AcaoEmTexto(
          rotulo: TextosDoDetalhe.excluir,
          aoTocar: aoExcluir,
          destrutiva: true,
        ),
      ],
    );
  }
}

class _FotoGrande extends StatelessWidget {
  const _FotoGrande({required this.pet});

  final Pet pet;

  @override
  Widget build(BuildContext context) {
    final capa = pet.fotoDeCapa;
    final endereco = capa?.urlDeCartao;
    return Moldura(
      largura: BichuMoldura.larguraFotoLg,
      estado: endereco == null
          ? (pet.temFotoEmProcessamento
              ? EstadoDaMoldura.carregando
              : EstadoDaMoldura.vazio)
          : EstadoDaMoldura.repouso,
      filho: endereco == null
          ? null
          : Image.network(
              endereco,
              fit: BoxFit.cover,
              alignment: const Alignment(0, -1 / 3),
              errorBuilder: (context, erro, pilha) =>
                  const Moldura(largura: BichuMoldura.larguraFotoLg),
            ),
    );
  }
}

/// Um cartao de texto corrido.
class _CartaoDeTexto extends StatelessWidget {
  const _CartaoDeTexto({
    required this.titulo,
    required this.texto,
    this.vazio,
  });

  final String titulo;
  final String? texto;
  final String? vazio;

  @override
  Widget build(BuildContext context) {
    final cores = BichuColors.of(context).cores;
    final textos = Theme.of(context).textTheme;
    final conteudo = texto == null || texto!.isEmpty ? vazio : texto;
    if (conteudo == null) return const SizedBox.shrink();

    return Container(
      width: double.infinity,
      padding: const EdgeInsets.all(BichuEspaco.e4),
      decoration: BoxDecoration(
        color: cores.surfaceSunken,
        borderRadius: BorderRadius.circular(BichuRaio.lg),
        border: Border.all(color: cores.outline, width: BichuBorda.hairline),
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: <Widget>[
          Semantics(
            header: true,
            child: Text(titulo, style: textos.titleMedium),
          ),
          const SizedBox(height: BichuEspaco.e2),
          Text(conteudo, style: textos.bodyMedium),
        ],
      ),
    );
  }
}

/// Acao em texto, com alvo de toque de 48 dp.
class _AcaoEmTexto extends StatelessWidget {
  const _AcaoEmTexto({
    required this.rotulo,
    required this.aoTocar,
    this.destrutiva = false,
  });

  final String rotulo;
  final VoidCallback aoTocar;
  final bool destrutiva;

  @override
  Widget build(BuildContext context) {
    final cores = BichuColors.of(context).cores;
    final textos = Theme.of(context).textTheme;

    return Semantics(
      button: true,
      label: rotulo,
      excludeSemantics: true,
      onTap: aoTocar,
      child: InkWell(
        onTap: aoTocar,
        borderRadius: BorderRadius.circular(BichuRaio.md),
        child: SizedBox(
          height: BichuAlvoDeToque.min,
          width: double.infinity,
          child: Align(
            alignment: Alignment.centerLeft,
            child: Text(
              rotulo,
              style: textos.labelLarge?.copyWith(
                color: destrutiva ? cores.error : cores.primary,
              ),
            ),
          ),
        ),
      ),
    );
  }
}

/// A FOLHA DE CONFIRMACAO do encerramento do caso (11.9, sem o 11.9.1).
class _FolhaDoEncerramento extends StatelessWidget {
  const _FolhaDoEncerramento({
    required this.titulo,
    required this.corpo,
    required this.oQueAcontece,
    required this.rotuloDeConfirmar,
    required this.rotuloAcessivelDeConfirmar,
    required this.rotuloDeCancelar,
  });

  final String titulo;
  final String corpo;

  /// O que vai acontecer, em lista.
  final List<String> oQueAcontece;

  final String rotuloDeConfirmar;

  /// O nome acessivel do botao que age.
  final String rotuloAcessivelDeConfirmar;

  final String rotuloDeCancelar;

  @override
  Widget build(BuildContext context) {
    final cores = BichuColors.of(context).cores;
    final textos = Theme.of(context).textTheme;

    return Semantics(
      scopesRoute: true,
      namesRoute: true,
      explicitChildNodes: true,
      label: titulo,
      child: SingleChildScrollView(
        child: Padding(
          padding: EdgeInsets.only(
            left: BichuEspaco.e4,
            right: BichuEspaco.e4,
            bottom: MediaQuery.of(context).viewPadding.bottom + BichuEspaco.e4,
          ),
          child: Column(
            mainAxisSize: MainAxisSize.min,
            crossAxisAlignment: CrossAxisAlignment.start,
            children: <Widget>[
              Semantics(
                header: true,
                child: Text(
                  titulo,
                  style: textos.titleLarge?.copyWith(color: cores.textPrimary),
                ),
              ),
              const SizedBox(height: BichuEspaco.e3),
              Text(corpo, style: textos.bodyMedium),
              const SizedBox(height: BichuEspaco.e3),
              ...oQueAcontece.map(
                (item) => Padding(
                  padding: const EdgeInsets.only(bottom: BichuEspaco.e2),
                  child: Row(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: <Widget>[
                      ExcludeSemantics(
                        child: Padding(
                          padding: const EdgeInsets.only(right: BichuEspaco.e2),
                          child: Text('•', style: textos.bodyMedium),
                        ),
                      ),
                      Expanded(child: Text(item, style: textos.bodyMedium)),
                    ],
                  ),
                ),
              ),
              const SizedBox(height: BichuEspaco.e6),

              SizedBox(
                width: double.infinity,
                height: BichuAlvoDeToque.critico,
                child: OutlinedButton(
                  onPressed: () => Navigator.of(context).pop(false),
                  child: Text(rotuloDeCancelar),
                ),
              ),
              const SizedBox(height: BichuEspaco.e4),
              Semantics(
                button: true,
                label: rotuloAcessivelDeConfirmar,
                excludeSemantics: true,
                onTap: () => Navigator.of(context).pop(true),
                child: SizedBox(
                  width: double.infinity,
                  height: BichuAlvoDeToque.min,
                  child: FilledButton(
                    onPressed: () => Navigator.of(context).pop(true),
                    child: Text(rotuloDeConfirmar, style: textos.labelLarge),
                  ),
                ),
              ),
            ],
          ),
        ),
      ),
    );
  }
}
