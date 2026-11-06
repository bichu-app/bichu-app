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
import '../../api/envio_de_foto.dart';
import '../../api/pets_api.dart';
import '../../dispositivo/camera_e_galeria.dart';
import '../../widgets/casca_da_pagina_interna.dart';
import '../../widgets/convite_para_entrar.dart';
import '../../widgets/botao_primario.dart';
import '../../widgets/cartao_de_pet.dart';
import '../../widgets/faixa_de_aviso.dart';
import '../../widgets/folha_destrutiva.dart';
import '../../widgets/grupo_segmentado.dart';
import '../../widgets/moldura.dart';
import '../../widgets/qr_da_plaquinha.dart';
import '../../widgets/recorte_de_imagem.dart';
import '../../widgets/saida_da_tela.dart';
import '../rede/pecas_da_rede.dart';
import '../perdido/tela_de_quem_e_o_caso.dart';
import 'textos_do_detalhe.dart';

/// T.1 — Detalhe do pet (UX, secao 7.6.3).
class TelaDetalheDoPet extends StatefulWidget {
  const TelaDetalheDoPet({required this.petId, super.key});

  final String petId;

  @override
  State<TelaDetalheDoPet> createState() => _TelaDetalheDoPetState();
}

enum _Fase { carregando, carregado, foraDaConta, semConta, falha }

class _TelaDetalheDoPetState extends State<TelaDetalheDoPet> {
  _Fase _fase = _Fase.carregando;
  Pet? _pet;
  String? _textoDaFalha;

  EstadoDoQrDaPlaquinha _estadoDoQr = EstadoDoQrDaPlaquinha.carregando;

  ImageProvider? _qr;

  String _sufixoDaTag = '';

  bool _temPedidoDePlaquinha = false;

  bool _encerrandoOCaso = false;

  String? _erroAoEncerrar;

  CasoDePerdido? _casoEncerradoAgora;

  CasoDePerdido? _casoAberto;

  String? _erroAoCompartilhar;

  bool _reabrindoOCaso = false;

  String? _erroAoReabrir;

  bool _iniciou = false;

  /// Os bytes da capa estao subindo agora (cliente, 06/11/2026).
  bool _enviandoACapa = false;

  /// O que dizer sobre a ultima tentativa de capa: a faixa informativa de
  /// "chegou, aparece em instantes" ou a de recusa.
  String? _avisoDaCapa;

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

  void _marcarComoPerdido(Pet pet) {
    context.push(Rotas.marcarPerdido, extra: RascunhoDoCaso(pet: pet));
  }

  Future<void> _encontreiMeuPet(Pet pet) async {
    final caseId = pet.idDoCasoAberto;
    if (caseId == null || caseId.isEmpty) return;

    final escolha = await _confirmarEncerramento(pet);
    if (escolha == null) return;
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
        desfecho: escolha.desfecho,
        canal: escolha.canal,
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
    anunciar(
      context,
      escolha.desfecho == DesfechoDoCaso.reencontrado
          ? TextosDoDetalhe.casoEncerrado(pet.nome)
          : TextosDoDetalhe.casoEncerradoSemEncontrar(pet.nome),
    );
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

  /// Abre a folha e devolve **o desfecho e o canal**, ou `null` se desistiu.
  ///
  /// Devolvia `bool`, e o `true` virava `DesfechoDoCaso.reencontrado` CHUMBADO
  /// com `canal` nenhum na chamada abaixo -- o defeito que apagava a metrica
  /// central do produto: `reunion_channel` nunca chegava ao banco, e a razao
  /// de `reunited` existir e ser atribuivel a um canal.
  Future<EscolhaDoEncerramento?> _confirmarEncerramento(Pet pet) async {
    return showModalBottomSheet<EscolhaDoEncerramento>(
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
        perguntaDoDesfecho: TextosDoDetalhe.perguntaDoDesfecho,
        rotuloDeReencontrado: TextosDoDetalhe.desfechoReencontrado(pet.nome),
        rotuloDeNaoEncontrado: TextosDoDetalhe.desfechoNaoEncontrado,
        perguntaDoCanal: TextosDoDetalhe.perguntaDoCanal(pet.nome),
        faltaResponder: TextosDoDetalhe.faltaResponder,
      ),
    );
  }

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
    final pet = _pet;

    // ======================================================================
    // A CASCA COM CAPA, e SO na fase carregada
    //
    // Pedido do cliente, 06/11/2026: *"gostei muito da forma como ele
    // apresenta o perfil do pet, com a foto de capa, como fazemos na pagina de
    // eventos e profissionais"*.
    //
    // `CascaDaPaginaInterna` e a MESMA peca do encontro da comunidade e da
    // pagina do profissional -- nenhuma peca nova foi inventada aqui. Ela
    // entrega as tres coisas que o cliente nomeou: a capa de borda a borda, o
    // `Voltar` redondo sobre a foto e a barra que volta com a rolagem.
    //
    // **`temCapa: true` SEMPRE, e isto e decisao de desenho e nao descuido**:
    // a faixa 16:9 existe mesmo sem foto, e sem foto ela recebe o
    // `BannerDaMarca` -- a mesma saida que o encontro sem capa ja da. No dia em
    // que isto sobe, 100% dos pets estarao sem capa, porque a coluna nasce
    // agora: esse e o estado DOMINANTE, e ele tem de parecer acabado e convidar
    // o envio, nao fazer a casca desaparecer. Passar
    // `temCapa: pet.urlDaCapa != null` deixaria a barra de cima colada em cima
    // na ficha de quase todo mundo, e a tela mudaria de forma quando a primeira
    // foto subisse.
    //
    // As outras quatro fases ficam no `Scaffold` com `BarraDeConta`: carga,
    // falha, visitante e pet de outra pessoa nao tem nome nem capa para
    // mostrar, e a casca anuncia a rota com o nome.
    // ======================================================================
    if (_fase == _Fase.carregado && pet != null) {
      return CascaDaPaginaInterna(
        nome: pet.nome,
        prefixoAnunciado: TextosDoDetalhe.anuncioDaPagina,
        aoVoltar: _voltar,
        proporcaoDaCapa: proporcaoDaCapa,
        recuo: const EdgeInsets.only(bottom: BichuEspaco.e8),
        filhos: _pagina(pet),
      );
    }

    return Scaffold(
      appBar: BarraDeConta(
        titulo: _pet?.nome ?? '',
        saida: TipoDeSaida.voltar,
      ),
      body: SafeArea(child: _corpo()),
    );
  }

  void _voltar() {
    if (context.canPop()) {
      context.pop();
    } else {
      context.go(Rotas.pets);
    }
  }

  /// A pagina da fase carregada, montada como lista de filhos da casca.
  ///
  /// A capa e o PRIMEIRO filho e vai de borda a borda, entao a margem de 16 dp
  /// **nao pode mais estar no `padding` da lista** -- ela desceu para cada bloco
  /// do corpo, em `_Margem`, que e exatamente o arranjo de `pagina_do_local`.
  List<Widget> _pagina(Pet pet) {
    return <Widget>[
      _FaixaDaCapa(
        pet: pet,
        enviando: _enviandoACapa,
        aoTocar: _enviandoACapa ? null : () => _trocarACapa(pet),
      ),
      _Margem(
        child: _Conteudo(
          pet: pet,
          avisoDaCapa: _avisoDaCapa,
          enviandoACapa: _enviandoACapa,
          aoTrocarACapa: _enviandoACapa ? null : () => _trocarACapa(pet),
          aoEditar: _editar,
          aoExcluir: _excluir,
          estadoDoQr: _estadoDoQr,
          qr: _qr,
          sufixoDaTag: _sufixoDaTag,
          aoTentarOQr: () => _carregarOQr(pet),
          aoMarcarPerdido: () => _marcarComoPerdido(pet),
          aoEncontrarOPet: () => _encontreiMeuPet(pet),
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
          aoCompartilhar: () => _compartilharOCaso(pet),
          temPedidoDePlaquinha: _temPedidoDePlaquinha,
          aoAcompanharPlaquinha: () =>
              context.push(Rotas.acompanharPlaquinhaDe(pet.id)),
        ),
      ),
    ];
  }

  /// Escolhe, recorta em 16:9 e envia a FOTO DE CAPA (cliente, 06/11/2026).
  ///
  /// `FormatoDoRecorte.capaDoEncontro` e 1280 x 720 e **ja existia**: e a mesma
  /// geometria, e dar um nome novo ao mesmo numero daria dois lugares para o
  /// piso divergir.
  Future<void> _trocarACapa(Pet pet) async {
    final escopo = Escopo.of(context);
    final camera = escopo.camera;
    final escolhida = await camera.escolherDaGaleria();
    if (!mounted || escolhida == null) return;

    final ajustada = await ajustarAFoto(
      context,
      camera: camera,
      foto: escolhida,
      formato: FormatoDoRecorte.capaDoEncontro,
      titulo: TextosDoDetalhe.ajusteACapa,
    );
    if (!mounted || ajustada == null) return;

    // **Sem HEIC**: a capa anda na esteira de catalogo, que nao o decodifica, e
    // a rota de intencao recusa o tipo por IGUALDADE. Recusar aqui diz o motivo
    // no aparelho, em vez de gastar um envio para colher um 415.
    final recusa = recusaDeTipoDaFoto(
      ajustada.tipoDeConteudo,
      tiposDeFotoAceitosSemHeic,
    );
    if (recusa != null) {
      setState(() => _avisoDaCapa = recusa);
      return;
    }

    setState(() {
      _enviandoACapa = true;
      _avisoDaCapa = null;
    });

    final desfecho = await escopo.envioDeFoto.enviar(
      foto: ajustada,
      destino: CapaDePet(api: PetsApi(escopo.api), petId: pet.id),
    );
    if (!mounted) return;

    setState(() {
      _enviandoACapa = false;
      _avisoDaCapa = switch (desfecho) {
        DesfechoDoEnvio.enviada => TextosDoDetalhe.capaEmProcessamento,
        DesfechoDoEnvio.semSinal => TextosDoDetalhe.capaSemSinal,
        DesfechoDoEnvio.recusada => TextosDoDetalhe.capaRecusada,
      };
    });

    if (desfecho == DesfechoDoEnvio.enviada) {
      anunciar(context, TextosDoDetalhe.capaEmProcessamento);
      // Recarrega para o caso de o worker ter sido rapido. `cover_image_url`
      // nulo e o desfecho ESPERADO aqui: a derivada ainda nao existe quando o
      // `PUT` responde 202, e a faixa continua no banner da marca ate ela
      // existir.
      await _carregar();
    }
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
      // A fase carregada nao passa por aqui: ela monta
      // `CascaDaPaginaInterna` no `build`, com a capa.
      _Fase.carregado => const SizedBox.shrink(),
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
    required this.avisoDaCapa,
    required this.enviandoACapa,
    required this.aoTrocarACapa,
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

  /// O que dizer sobre a ultima tentativa de capa, ou nulo.
  final String? avisoDaCapa;

  final bool enviandoACapa;

  /// Nulo enquanto os bytes sobem: nao da para pedir duas capas de uma vez.
  final VoidCallback? aoTrocarACapa;

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

  bool get _jaProcurado =>
      pet.status == StatusDoPet.perdido || pet.idDoCasoAberto != null;

  String? get _linkDoCaso {
    final caso = casoAberto;
    if (caso == null) return null;
    if (caso.status != 'open') return null;
    final url = caso.urlDeCompartilhar;
    if (url == null || url.isEmpty) return null;
    return url;
  }

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

    // **`Column` e nao `ListView`**: a rolagem agora e da casca
    // (`CascaDaPaginaInterna` monta o `ListView`), e uma lista dentro de outra
    // daria duas rolagens encaixadas. A ORDEM VERTICAL do corpo nao mudou.
    return Column(
      crossAxisAlignment: CrossAxisAlignment.stretch,
      children: <Widget>[
        // O RETRATO sobe sobre a capa. `Transform.translate` desloca o desenho
        // SEM tirar a altura do fluxo, entao o `SizedBox` negativo abaixo
        // recolhe os 56 dp que sobrariam em branco -- sem ele a tela ganharia
        // um buraco do tamanho da sobreposicao.
        Center(child: _RetratoSobreACapa(pet: pet)),
        const SizedBox(height: BichuEspaco.e3),

        // O NOME DESCE DA BARRA PARA A PAGINA (cliente, 06/11/2026). Ele
        // continua na barra que volta com a rolagem, e a repeticao e a mesma
        // que o encontro da comunidade ja tem.
        Semantics(
          header: true,
          child: Text(pet.nome, style: textos.headlineSmall),
        ),
        const SizedBox(height: BichuEspaco.e2),

        Text(
          CartaoDePet.atributosDe(pet),
          style: textos.bodyLarge?.copyWith(color: cores.textSecondary),
        ),

        if (pet.semTag) ...<Widget>[
          const SizedBox(height: BichuEspaco.e4),
          FaixaDeAviso(
            peso: PesoDaFaixa.informativo,
            texto: TextosDoDetalhe.semTag(pet.nome),
          ),
        ],

        if (avisoDaCapa != null) ...<Widget>[
          const SizedBox(height: BichuEspaco.e4),
          FaixaDeAviso(texto: avisoDaCapa!, peso: PesoDaFaixa.informativo),
        ],

        if (pet.motivoDaFotoRecusada != null) ...<Widget>[
          const SizedBox(height: BichuEspaco.e4),
          FaixaDeAviso(
            texto: pet.motivoDaFotoRecusada!,
            peso: PesoDaFaixa.informativo,
          ),
        ],
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

        // =====================================================================
        // OS TRES CAMPOS DE 02/11/2026 NA FICHA (castracao, chip, RG Animal)
        //
        // Eles entraram no cadastro e na edicao no mesmo dia e a ficha nao os
        // mostrava: quem preenchia so reencontrava o valor reabrindo a edicao.
        //
        // **CADA UM E UM BLOCO PROPRIO, e nenhum deles entra em
        // `CartaoDePet.atributosDe`.** Aquele texto pinta o cartao do pet em
        // TODA lista, e "Castrado" ao lado do nome do animal poria dado de
        // saude num lugar que o cliente nao escolheu -- alem de ser mudanca
        // visual em telas que este pedido nao toca.
        //
        // **CAMPO SEM VALOR NAO VIRA LINHA VAZIA**, e a defesa e dupla:
        // `_CartaoDeTexto` sem `vazio` devolve `SizedBox.shrink()`, e o `if`
        // de cada bloco tira TAMBEM o respiro de cima. Sem o `if` a ficha de
        // um pet sem nenhum dos tres ganharia tres espacos em branco entre
        // `Cuidados` e as acoes -- invisivel na revisao e visivel no aparelho.
        //
        // **`Prefiro nao informar` NAO APARECE AQUI: o nulo omite o bloco.**
        // A assimetria com o cadastro, onde a terceira opcao nasce
        // selecionada, e deliberada. No cadastro ela e um CONTROLE diante de
        // uma pergunta, e nascer marcada evita gravar `false` por omissao; na
        // ficha ela seria uma AFIRMACAO sobre o animal, lida por quem abriu a
        // pagina. E `neutered` nulo nao distingue "o tutor escolheu nao
        // informar" de "o tutor nunca viu a pergunta": os pets cadastrados
        // antes de 02/11/2026 estao todos no segundo caso e sao a MAIORIA.
        // Escrever `Prefiro nao informar` na ficha deles publicaria resposta
        // que ninguem deu, que e o mesmo defeito de gravar `false`. A terceira
        // opcao existe para o tutor RECUSAR a pergunta, e recusa nao tem o que
        // exibir.
        //
        // **NEM MASCARA NEM FORMATACAO nos dois numeros**, por decisao escrita
        // na migracao de 17/09 (*"SEM validacao automatica: o SinPatinhas nao
        // tem API publica"*): a ficha mostra o que foi guardado, byte a byte.
        // Formatar aqui faria a ficha discordar do campo da edicao.
        //
        // A ACESSIBILIDADE E A DOS VIZINHOS, sem anuncio proprio: o titulo de
        // `_CartaoDeTexto` ja e `Semantics(header: true)`, igual a `Sinais
        // particulares` e a `Cuidados`, e o leitor de tela percorre os tres
        // blocos novos como percorre aqueles dois.
        // =====================================================================
        if (pet.castrado != null) ...<Widget>[
          const SizedBox(height: BichuEspaco.e4),
          _CartaoDeTexto(
            titulo: TextosDoDetalhe.rotuloDaCastracao,
            texto: Castracao.de(pet.castrado).rotulo,
          ),
        ],

        if (pet.chip != null && pet.chip!.isNotEmpty) ...<Widget>[
          const SizedBox(height: BichuEspaco.e4),
          _CartaoDeTexto(
            titulo: TextosDoDetalhe.rotuloDoChip,
            texto: pet.chip,
          ),
        ],

        if (pet.rgAnimal != null && pet.rgAnimal!.isNotEmpty) ...<Widget>[
          const SizedBox(height: BichuEspaco.e4),
          _CartaoDeTexto(
            titulo: TextosDoDetalhe.rotuloDoRgAnimal,
            texto: pet.rgAnimal,
          ),
        ],

        const SizedBox(height: BichuEspaco.e8),

        // A CAPA entra como ACAO EM TEXTO, junto de `Editar` e `Excluir`
        // (desenho aprovado pelo cliente em 06/11/2026). A redacao muda com o
        // estado: quem nao tem capa ADICIONA, quem tem TROCA.
        //
        // **A ORDEM DO RESTO NAO MUDOU** -- QR da plaquinha antes de Sinais
        // particulares, Cuidados abaixo de Sinais, Editar e Excluir por ultimo.
        // E decisao do cliente de 22/10/2026 e tem caso de teste que mede a
        // coordenada vertical (`ordem_do_detalhe_do_pet_test.dart`).
        _AcaoEmTexto(
          rotulo: pet.urlDaCapa == null
              ? TextosDoDetalhe.adicionarACapa
              : TextosDoDetalhe.trocarACapa,
          aoTocar: enviandoACapa ? () {} : (aoTrocarACapa ?? () {}),
        ),
        const SizedBox(height: BichuEspaco.e4),
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

/// A margem horizontal de 16 dp que saiu do `padding` da lista.
///
/// Ela desceu para ca porque a capa e de BORDA A BORDA: um `padding` na lista
/// recuaria a faixa 16 dp de cada lado, e a capa deixaria de encostar na borda
/// -- que e exatamente a coisa que o cliente nomeou. Mesmo arranjo de
/// `pagina_do_local`.
class _Margem extends StatelessWidget {
  const _Margem({required this.child});

  final Widget child;

  @override
  Widget build(BuildContext context) => Padding(
        padding: const EdgeInsets.symmetric(horizontal: BichuEspaco.e4),
        child: child,
      );
}

/// A FAIXA 16:9 DO TOPO: a capa, ou o banner da marca com o convite.
///
/// ## A faixa SEMPRE existe (decisao de desenho, 06/11/2026)
///
/// `ImagemDoEncontroOuBanner` com `url` nulo pinta o `BannerDaMarca` dentro de
/// um `AspectRatio` 16:9 -- e isso ja e, de fabrica, o estado "sem capa" que o
/// encontro da comunidade mostra hoje. **A casca nao desaparece quando falta a
/// foto**: no dia em que isto sobe, nenhum pet tem capa, e e esse o estado que
/// o tutor vai ver primeiro. Ele tem de parecer acabado e convidar o envio.
///
/// ## Nao ha VEU sobre a capa, e nao ha porque nao ha texto sobre ela
///
/// A pastilha de `Adicionar capa` tem fundo `surface` OPACO, que e o recurso
/// que o `DistintivoDeSituacao` do encontro usa justamente para o contraste nao
/// depender da foto. Veu escurecendo a imagem seria necessario se houvesse
/// texto por cima dela; nao ha.
///
/// ## A pastilha aparece SO sem capa
///
/// Com capa, quem troca usa `Trocar a foto de capa` lá embaixo, junto de
/// `Editar` e `Excluir` -- um controle sobre a foto do animal seria a unica
/// coisa tocavel em cima de uma imagem em todo o aplicativo.
class _FaixaDaCapa extends StatelessWidget {
  const _FaixaDaCapa({
    required this.pet,
    required this.enviando,
    required this.aoTocar,
  });

  final Pet pet;

  /// Os bytes estao subindo: a faixa fica com o indicador e nao aceita toque.
  final bool enviando;

  final VoidCallback? aoTocar;

  @override
  Widget build(BuildContext context) {
    final cores = BichuColors.of(context).cores;
    final temCapa = pet.urlDaCapa != null;

    final faixa = Stack(
      children: <Widget>[
        ImagemDoEncontroOuBanner(
          url: pet.urlDaCapa,
          textoAlternativo: temCapa ? TextosDoDetalhe.capaDe(pet.nome) : null,
        ),
        if (enviando)
          Positioned.fill(
            child: Center(
              child: DecoratedBox(
                decoration: BoxDecoration(
                  color: cores.surface,
                  shape: BoxShape.circle,
                ),
                child: const Padding(
                  padding: EdgeInsets.all(BichuEspaco.e3),
                  child: SizedBox(
                    width: BichuEspaco.e6,
                    height: BichuEspaco.e6,
                    child: CircularProgressIndicator(strokeWidth: 2),
                  ),
                ),
              ),
            ),
          )
        else if (!temCapa)
          Positioned(
            right: BichuEspaco.e3,
            bottom: BichuEspaco.e3,
            child: _PastilhaDeAdicionarCapa(aoTocar: aoTocar),
          ),
      ],
    );

    return Semantics(
      image: temCapa,
      label: temCapa ? TextosDoDetalhe.capaDe(pet.nome) : null,
      child: faixa,
    );
  }
}

/// A pastilha `Adicionar capa`, na mesma forma do `DistintivoDeSituacao`.
class _PastilhaDeAdicionarCapa extends StatelessWidget {
  const _PastilhaDeAdicionarCapa({required this.aoTocar});

  final VoidCallback? aoTocar;

  @override
  Widget build(BuildContext context) {
    final cores = BichuColors.of(context).cores;
    final textos = Theme.of(context).textTheme;

    return Semantics(
      button: true,
      label: TextosDoDetalhe.adicionarACapa,
      excludeSemantics: true,
      child: Material(
        color: cores.surface,
        shape: StadiumBorder(
          side: BorderSide(color: cores.outline, width: BichuBorda.hairline),
        ),
        child: InkWell(
          onTap: aoTocar,
          customBorder: const StadiumBorder(),
          child: Padding(
            padding: const EdgeInsets.symmetric(
              horizontal: BichuEspaco.e3,
              vertical: BichuEspaco.e2,
            ),
            child: Row(
              mainAxisSize: MainAxisSize.min,
              children: <Widget>[
                Icon(
                  Icons.add_photo_alternate_outlined,
                  size: BichuEspaco.e5,
                  color: cores.primary,
                ),
                const SizedBox(width: BichuEspaco.e2),
                Text(
                  TextosDoDetalhe.pastilhaDeAdicionarCapa,
                  style: textos.labelLarge?.copyWith(color: cores.primary),
                ),
              ],
            ),
          ),
        ),
      ),
    );
  }
}

/// O RETRATO encostado na capa, com o anel de `surface` em volta.
///
/// ## O retrato CONTINUA existindo, e a capa nao o substitui
///
/// Sao duas imagens com dois papeis: o retrato e a identidade do animal, e a
/// derivada `card` dele (1024 x 1126, proporcao 1 : 1,1) alimenta a pagina
/// publica do caso, o **cartaz IMPRESSO** de pet perdido, a tela de quem achou,
/// o perfil publico e a pagina da plaquinha. A capa e o ambiente dele, e so
/// esta ficha a desenha. Se a capa 16:9 tomasse o lugar do retrato, o cartaz de
/// pet perdido passaria a sair deitado.
///
/// ## O que aqui e DECISAO DE DESENHO desta rodada, e nao precedente
///
/// Nem o encontro nem a pagina do profissional sobrepoem imagem a capa. A
/// sobreposicao de -56 dp e o anel de 3 dp sao desenho novo, aprovado pelo
/// cliente em 06/11/2026 ("a segunda imagem com capa"). O anel usa `surface` e
/// nao uma borda colorida de proposito: ele existe para separar o retrato da
/// foto atras dele, e nao para decorar.
class _RetratoSobreACapa extends StatelessWidget {
  const _RetratoSobreACapa({required this.pet});

  final Pet pet;

  /// Quanto o retrato sobe sobre a capa.
  static const double sobreposicao = 56;

  /// A espessura do anel de `surface` em volta do retrato.
  static const double anel = 3;

  /// A largura do conjunto retrato + anel: 160 + 3 + 3 = 166.
  static const double larguraComAnel = BichuMoldura.larguraFotoLg + anel * 2;

  /// A altura do conjunto: 160 x 1,1 = 176, mais os dois aneis = 182.
  static const double alturaComAnel =
      BichuMoldura.larguraFotoLg * BichuMoldura.proporcao + anel * 2;

  /// A altura que o retrato OCUPA no fluxo depois de subir: 182 - 56 = 126.
  static const double alturaNoFluxo = alturaComAnel - sobreposicao;

  @override
  Widget build(BuildContext context) {
    final cores = BichuColors.of(context).cores;
    final forma = BichuMoldura.raio(larguraComAnel);

    // **`OverflowBox` e nao `Transform.translate`**, e a diferenca nao e
    // estetica: `Transform` desloca o DESENHO e deixa a altura inteira no
    // fluxo, entao seria preciso recolher os 56 dp com um `SizedBox` de altura
    // NEGATIVA -- que o `RenderConstrainedBox` do Flutter recusa em tempo de
    // layout (`BoxConstraints` com minimo negativo). `OverflowBox` resolve as
    // duas coisas de uma vez: ele declara ao pai a altura JA descontada
    // ([alturaNoFluxo]) e deixa o filho transbordar para cima, sobre a capa.
    return SizedBox(
      width: larguraComAnel,
      height: alturaNoFluxo,
      child: OverflowBox(
        minHeight: alturaComAnel,
        maxHeight: alturaComAnel,
        alignment: Alignment.bottomCenter,
        child: Semantics(
          image: true,
          label: TextosDoDetalhe.fotoDe(pet.nome),
          child: Container(
            padding: const EdgeInsets.all(anel),
            decoration: BoxDecoration(color: cores.surface, borderRadius: forma),
            child: _FotoGrande(pet: pet),
          ),
        ),
      ),
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
/// O que a folha de encerramento devolve: **o desfecho e o canal**.
///
/// Os dois juntos num tipo so, e nao dois retornos, porque e assim que a
/// combinacao impossivel nao existe: `canal` so e preenchido com
/// `DesfechoDoCaso.reencontrado`, que e o que o contrato diz do campo
/// (*"so faz sentido com `outcome: reunited`"*).
@immutable
class EscolhaDoEncerramento {
  const EscolhaDoEncerramento({required this.desfecho, this.canal});

  final DesfechoDoCaso desfecho;

  /// `reunion_channel`. Nulo quando o desfecho nao e reencontro.
  final CanalDoReencontro? canal;
}

/// Os cinco canais, **na ordem em que a folha os oferece**, com o texto que a
/// pessoa le.
///
/// Os VALORES de fio vem de `CanalDoReencontro`, que espelha o contrato: esta
/// lista escolhe ordem e redacao, nunca valor. A ordem comeca pelo que o
/// produto construiu (a plaquinha e o alerta) e termina em `other`.
const List<(CanalDoReencontro, String)> _canaisDaFolha =
    <(CanalDoReencontro, String)>[
  (CanalDoReencontro.pelaTag, TextosDoDetalhe.canalPelaTag),
  (CanalDoReencontro.peloAlerta, TextosDoDetalhe.canalPeloAlerta),
  (CanalDoReencontro.peloCartazOuLink, TextosDoDetalhe.canalPeloCartazOuLink),
  (CanalDoReencontro.porContaPropria, TextosDoDetalhe.canalPorContaPropria),
  (CanalDoReencontro.outro, TextosDoDetalhe.canalOutro),
];

class _FolhaDoEncerramento extends StatefulWidget {
  const _FolhaDoEncerramento({
    required this.titulo,
    required this.corpo,
    required this.oQueAcontece,
    required this.rotuloDeConfirmar,
    required this.rotuloAcessivelDeConfirmar,
    required this.rotuloDeCancelar,
    required this.perguntaDoDesfecho,
    required this.rotuloDeReencontrado,
    required this.rotuloDeNaoEncontrado,
    required this.perguntaDoCanal,
    required this.faltaResponder,
  });

  final String titulo;
  final String corpo;

  /// O que vai acontecer, em lista.
  final List<String> oQueAcontece;

  final String rotuloDeConfirmar;

  /// O nome acessivel do botao que age.
  final String rotuloAcessivelDeConfirmar;

  final String rotuloDeCancelar;

  /// O rotulo do grupo do desfecho.
  final String perguntaDoDesfecho;

  final String rotuloDeReencontrado;
  final String rotuloDeNaoEncontrado;

  /// O rotulo do grupo do canal, que so aparece com reencontro escolhido.
  final String perguntaDoCanal;

  /// O que explica o botao desligado.
  final String faltaResponder;

  @override
  State<_FolhaDoEncerramento> createState() => _FolhaDoEncerramentoState();
}

class _FolhaDoEncerramentoState extends State<_FolhaDoEncerramento> {
  DesfechoDoCaso? _desfecho;
  CanalDoReencontro? _canal;

  /// **NAO ha valor inicial, e isso e o conserto.**
  ///
  /// Um `_desfecho` que nascesse `reencontrado` seria o chumbo de volta, agora
  /// com cara de escolha; e um `_canal` com valor inicial gravaria um canal que
  /// ninguem apontou, que e pior que o nulo de hoje -- nulo se ve, canal errado
  /// nao.
  bool get _completo {
    switch (_desfecho) {
      case null:
        return false;
      case DesfechoDoCaso.reencontrado:
        return _canal != null;
      case DesfechoDoCaso.naoEncontrado:
      case DesfechoDoCaso.abertoPorEngano:
        return true;
    }
  }

  void _escolherDesfecho(DesfechoDoCaso qual) {
    setState(() {
      _desfecho = qual;
      // Trocar para um desfecho sem reencontro LIMPA o canal: mandar
      // `reunion_channel` com `not_found` contradiz o proprio campo.
      if (qual != DesfechoDoCaso.reencontrado) _canal = null;
    });
  }

  void _confirmar() {
    final desfecho = _desfecho;
    if (desfecho == null || !_completo) return;
    Navigator.of(context).pop(
      EscolhaDoEncerramento(
        desfecho: desfecho,
        canal: desfecho == DesfechoDoCaso.reencontrado ? _canal : null,
      ),
    );
  }

  @override
  Widget build(BuildContext context) {
    final cores = BichuColors.of(context).cores;
    final textos = Theme.of(context).textTheme;

    return Semantics(
      scopesRoute: true,
      namesRoute: true,
      explicitChildNodes: true,
      label: widget.titulo,
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
                  widget.titulo,
                  style: textos.titleLarge?.copyWith(color: cores.textPrimary),
                ),
              ),
              const SizedBox(height: BichuEspaco.e3),
              Text(widget.corpo, style: textos.bodyMedium),
              const SizedBox(height: BichuEspaco.e3),
              ...widget.oQueAcontece.map(
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
              const SizedBox(height: BichuEspaco.e4),

              // A PRIMEIRA PERGUNTA: o desfecho, que antes era chumbado.
              GrupoSegmentado<DesfechoDoCaso>(
                rotulo: widget.perguntaDoDesfecho,
                selecionado: _desfecho,
                aoSelecionar: _escolherDesfecho,
                opcoes: <OpcaoSegmentada<DesfechoDoCaso>>[
                  OpcaoSegmentada<DesfechoDoCaso>(
                    valor: DesfechoDoCaso.reencontrado,
                    rotulo: widget.rotuloDeReencontrado,
                  ),
                  OpcaoSegmentada<DesfechoDoCaso>(
                    valor: DesfechoDoCaso.naoEncontrado,
                    rotulo: widget.rotuloDeNaoEncontrado,
                  ),
                ],
              ),

              // A SEGUNDA PERGUNTA, e ela so existe com reencontro escolhido:
              // o contrato diz que `reunion_channel` "so faz sentido com
              // `outcome: reunited`".
              if (_desfecho == DesfechoDoCaso.reencontrado) ...<Widget>[
                const SizedBox(height: BichuEspaco.e4),
                GrupoSegmentado<CanalDoReencontro>(
                  rotulo: widget.perguntaDoCanal,
                  selecionado: _canal,
                  aoSelecionar: (canal) => setState(() => _canal = canal),
                  opcoes: <OpcaoSegmentada<CanalDoReencontro>>[
                    for (final (canal, rotulo) in _canaisDaFolha)
                      OpcaoSegmentada<CanalDoReencontro>(
                        valor: canal,
                        rotulo: rotulo,
                      ),
                  ],
                ),
              ],

              if (!_completo) ...<Widget>[
                const SizedBox(height: BichuEspaco.e3),
                Text(
                  widget.faltaResponder,
                  style: textos.bodySmall?.copyWith(color: cores.textSecondary),
                ),
              ],

              const SizedBox(height: BichuEspaco.e6),

              SizedBox(
                width: double.infinity,
                height: BichuAlvoDeToque.critico,
                child: OutlinedButton(
                  onPressed: () => Navigator.of(context).pop(),
                  child: Text(widget.rotuloDeCancelar),
                ),
              ),
              const SizedBox(height: BichuEspaco.e4),
              Semantics(
                button: true,
                enabled: _completo,
                label: widget.rotuloAcessivelDeConfirmar,
                excludeSemantics: true,
                onTap: _completo ? _confirmar : null,
                child: SizedBox(
                  width: double.infinity,
                  height: BichuAlvoDeToque.min,
                  child: FilledButton(
                    onPressed: _completo ? _confirmar : null,
                    child: Text(
                      widget.rotuloDeConfirmar,
                      style: textos.labelLarge,
                    ),
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
