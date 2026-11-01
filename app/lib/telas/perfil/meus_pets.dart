import 'package:flutter/material.dart';
import 'package:go_router/go_router.dart';

import '../../api/falhas.dart';
import '../../api/mensagens_de_erro.dart';
import '../../api/modelos_pet.dart';
import '../../escopo.dart';
import '../../roteamento/rotas.dart';
import '../../theme/bichu_colors.dart';
import '../../theme/bichu_tokens.g.dart';
import '../../widgets/arrastar_para_atualizar.dart';
import '../../widgets/botao_primario.dart';
import '../../widgets/cartao_de_pet.dart';
import '../../widgets/convite_para_entrar.dart';
import '../../widgets/faixa_de_aviso.dart';
import '../avisos/aviso_de_cadastro_incompleto.dart';
import '../../widgets/item_de_menu.dart';
import '../../widgets/moldura.dart';
import '../../widgets/saida_da_tela.dart';
import '../casca_com_abas.dart';

/// O cache de leitura de `GET /pets`, do criterio 7 da BICHUS-62.
class CacheDeMeusPets {
  String? _idDoDono;
  List<Pet>? _pets;

  /// O que esta guardado para [idDoDono].
  List<Pet>? pets(String? idDoDono) {
    if (idDoDono == null) return null;
    if (_idDoDono != idDoDono) {
      limpar();
      return null;
    }
    return _pets;
  }

  void guardar(String? idDoDono, List<Pet> pets) {
    if (idDoDono == null) return;
    _idDoDono = idDoDono;
    _pets = List<Pet>.unmodifiable(pets);
  }

  void limpar() {
    _idDoDono = null;
    _pets = null;
  }
}

/// `Perfil` › `Meus pets` (BICHUS-62, destino fixado pela secao 27.6 do UX).
class MeusPets extends StatefulWidget {
  const MeusPets({
    required this.cache,
    this.teto,
    this.comCabecalho = true,
    super.key,
  });

  /// Injetado, e nao criado aqui dentro: o cache precisa sobreviver a
  /// reconstrucao do widget, e um teste precisa conseguir prepara-lo.
  final CacheDeMeusPets cache;

  /// QUANTOS CARTOES O BLOCO DESENHA, no maximo.
  final int? teto;

  /// Se o bloco desenha o proprio [TituloDeGrupoDeMenu].
  final bool comCabecalho;

  /// O TETO DA SECAO DO PERFIL: tres.
  static const int tetoDoPerfil = 3;

  /// O rotulo do botao, **palavra por palavra do cliente**.
  static const String rotuloDeVerTodos = 'Ver todos';

  /// O titulo do estado vazio (criterio 11).
  static const String tituloDoVazio = 'Seu primeiro pet entra aqui.';

  static const String explicacaoDoVazio =
      'Cadastre seu pet para gerar a plaquinha com QR.';

  /// A faixa do criterio 7, palavra por palavra.
  static const String faixaDeCache =
      'Mostrando o que temos salvo. Não conseguimos atualizar agora.';

  static const String rotuloDeAtualizar = 'Atualizar';

  static const String titulo = 'Meus pets';

  /// A acao da BICHUS-21, palavra por palavra do criterio 11.
  static const String rotuloDeMarcarPerdido = 'Marcar como perdido';

  @override
  State<MeusPets> createState() => _MeusPetsState();
}

enum _Fase { carregando, lista, falhaComCache, falhaSemCache }

class _MeusPetsState extends State<MeusPets>
    with PublicaAAtualizacao {
  /// A BUSCA QUE O ARRASTO REFAZ (cliente, 18/10/2026).
  @override
  Future<void> aoArrastarParaAtualizar() => _carregar();

  _Fase _fase = _Fase.carregando;

  bool _faltaConta = false;
  List<Pet> _pets = const <Pet>[];
  String? _textoDaFalha;

  bool _visivel = false;

  bool _cargaAgendada = false;

  /// O gatilho de recarga da BICHUS-220.
  @override
  void didChangeDependencies() {
    super.didChangeDependencies();
    if (!TickerMode.valuesOf(context).enabled) {
      _visivel = false;
      return;
    }
    if (_visivel) return;
    _visivel = true;
    _agendarCarga();
  }

  void _agendarCarga() {
    if (_cargaAgendada) return;
    _cargaAgendada = true;
    WidgetsBinding.instance.addPostFrameCallback((_) {
      _cargaAgendada = false;
      if (mounted) _carregar();
    });
  }

  Future<void> _carregar() async {
    if (!mounted) return;
    final escopo = Escopo.of(context);
    final idDoDono = escopo.sessao.usuario?.id;
    final salvo = widget.cache.pets(idDoDono);

    setState(() {
      _fase = _Fase.carregando;
      _pets = salvo ?? const <Pet>[];
      _textoDaFalha = null;
      _faltaConta = false;
    });

    try {
      final pets = await escopo.pets.listarMeusPets();
      widget.cache.guardar(idDoDono, pets);
      if (!mounted) return;
      setState(() {
        _pets = pets;
        _fase = _Fase.lista;
      });
    } on FalhaDeChamada catch (falha) {
      if (!mounted) return;
      final cache = widget.cache.pets(idDoDono);
      final semConta = faltaConta(falha);
      setState(() {
        _textoDaFalha = MensagensDeErro.de(falha).texto;
        _faltaConta = semConta;
        if (semConta) {
          _pets = const <Pet>[];
          _fase = _Fase.falhaSemCache;
        } else if (cache != null && cache.isNotEmpty) {
          _pets = cache;
          _fase = _Fase.falhaComCache;
        } else {
          _pets = const <Pet>[];
          _fase = _Fase.falhaSemCache;
        }
      });
    } on Object catch (erro, pilha) {
      registrarFalhaInesperada(erro, pilha, onde: 'ao listar meus pets');
      if (!mounted) return;
      final cache = widget.cache.pets(idDoDono);
      setState(() {
        _textoDaFalha = MensagensDeErro.servidorFora;
        if (cache != null && cache.isNotEmpty) {
          _pets = cache;
          _fase = _Fase.falhaComCache;
        } else {
          _pets = const <Pet>[];
          _fase = _Fase.falhaSemCache;
        }
      });
    }
  }

  bool get _temMaisQueOTeto {
    final teto = widget.teto;
    return teto != null && _pets.length > teto;
  }

  @override
  Widget build(BuildContext context) {
    final cores = BichuColors.of(context).cores;

    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: <Widget>[
        if (widget.comCabecalho) _cabecalho(),
        ..._corpo(cores),
      ],
    );
  }

  Widget _cabecalho() {
    return Row(
      crossAxisAlignment: CrossAxisAlignment.center,
      children: <Widget>[
        const Expanded(child: TituloDeGrupoDeMenu(MeusPets.titulo)),
        if (_temMaisQueOTeto)
          Padding(
            padding: const EdgeInsets.only(bottom: BichuEspaco.e2),
            child: TextButton(
              onPressed: () => context.push(Rotas.meusPets),
              child: const Text(MeusPets.rotuloDeVerTodos),
            ),
          ),
      ],
    );
  }

  List<Widget> _corpo(BichuCores cores) {
    return switch (_fase) {
      _Fase.carregando when _pets.isEmpty => <Widget>[
          const _EsqueletoDeCartao(),
          const SizedBox(height: BichuEspaco.e3),
          const _EsqueletoDeCartao(),
          const SizedBox(height: BichuEspaco.e6),
          _acaoDeCadastrar(),
        ],
      _Fase.carregando => <Widget>[
          ..._cartoes(),
          const SizedBox(height: BichuEspaco.e6),
          _acaoDeCadastrar(),
        ],
      _Fase.lista when _pets.isEmpty => <Widget>[
          EstadoVazio(
            titulo: MeusPets.tituloDoVazio,
            explicacao: MeusPets.explicacaoDoVazio,
            acao: _acaoDeCadastrar(),
          ),
        ],
      _Fase.lista => <Widget>[
          ..._cartoes(),
          const SizedBox(height: BichuEspaco.e6),
          _acaoDeCadastrar(),
        ],
      _Fase.falhaComCache => <Widget>[
          FaixaDeAviso(
            peso: PesoDaFaixa.informativo,
            texto: MeusPets.faixaDeCache,
            rotuloDaAcao: MeusPets.rotuloDeAtualizar,
            aoTocarNaAcao: _carregar,
          ),
          const SizedBox(height: BichuEspaco.e4),
          ..._cartoes(),
          const SizedBox(height: BichuEspaco.e6),
          _acaoDeCadastrar(),
        ],
      _Fase.falhaSemCache when _faltaConta => const <Widget>[
          ConviteParaEntrar(secao: SecaoComConta.meusPets),
        ],
      _Fase.falhaSemCache => <Widget>[
          FaixaDeAviso(
            texto: _textoDaFalha ?? MensagensDeErro.servidorFora,
            rotuloDaAcao: MeusPets.rotuloDeAtualizar,
            aoTocarNaAcao: _carregar,
          ),
          const SizedBox(height: BichuEspaco.e6),
          _acaoDeCadastrar(),
        ],
    };
  }

  BotaoPrimario _acaoDeCadastrar() {
    return BotaoPrimario(
      rotulo: 'Cadastrar meu pet',
      aoTocar: () => context.push(Rotas.cadastrarPet),
    );
  }

  List<Widget> _cartoes() {
    final saida = <Widget>[];
    final teto = widget.teto;
    final quantos = teto == null
        ? _pets.length
        : (_pets.length < teto ? _pets.length : teto);
    for (var i = 0; i < quantos; i++) {
      if (i > 0) saida.add(const SizedBox(height: BichuEspaco.e3));
      final pet = _pets[i];
      saida.add(
        CartaoDePet(
          pet: pet,
          aoTocar: () => context.push(Rotas.detalheDoPetDe(pet.id)),
          linhaDeAviso: (Escopo.of(context).sessao.usuario?.emailVerificado ??
                  true)
              ? null
              : TextosDoAvisoDeCadastro.naoConfirmado,
        ),
      );
    }
    return saida;
  }
}

/// `Perfil` › `Meus pets` › **a lista inteira** (22/10/2026, pedido do
/// cliente).
class TelaDeTodosOsPets extends StatefulWidget {
  const TelaDeTodosOsPets({super.key});

  @override
  State<TelaDeTodosOsPets> createState() => _TelaDeTodosOsPetsState();
}

class _TelaDeTodosOsPetsState extends State<TelaDeTodosOsPets> {
  final RecargaDaSecao _recarga = RecargaDaSecao();

  @override
  void dispose() {
    _recarga.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: const BarraDeConta(
        titulo: MeusPets.titulo,
        saida: TipoDeSaida.voltar,
        escape: Rotas.perfil,
      ),
      body: SafeArea(
        top: false,
        bottom: false,
        child: SlotDeAtualizacao(
          recarga: _recarga,
          child: ArrastarParaAtualizar.doSlot(
            recarga: _recarga,
            child: ListView(
              padding: const EdgeInsets.all(BichuEspaco.e4),
              addSemanticIndexes: false,
              children: <Widget>[
                MeusPets(
                  cache: Escopo.of(context).cacheDeMeusPets,
                  comCabecalho: false,
                ),
              ],
            ),
          ),
        ),
      ),
    );
  }
}

/// O esqueleto de um cartao: moldura mais tres barras (paragrafo 11.3).
class _EsqueletoDeCartao extends StatelessWidget {
  const _EsqueletoDeCartao();

  @override
  Widget build(BuildContext context) {
    final cores = BichuColors.of(context).cores;
    return ExcludeSemantics(
      child: Container(
        padding: const EdgeInsets.all(BichuEspaco.e4),
        decoration: BoxDecoration(
          color: cores.surface,
          borderRadius: BorderRadius.circular(BichuRaio.lg),
          border: Border.all(color: cores.outline, width: BichuBorda.hairline),
        ),
        child: Row(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: <Widget>[
            const Moldura(
              largura: BichuMoldura.larguraFotoSm,
              estado: EstadoDaMoldura.carregando,
            ),
            const SizedBox(width: BichuEspaco.e4),
            Expanded(
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: <Widget>[
                  _Barra(cor: cores.surfaceSunken, fracao: 0.6),
                  const SizedBox(height: BichuEspaco.e2),
                  _Barra(cor: cores.surfaceSunken, fracao: 0.9),
                  const SizedBox(height: BichuEspaco.e2),
                  _Barra(cor: cores.surfaceSunken, fracao: 0.4),
                ],
              ),
            ),
          ],
        ),
      ),
    );
  }
}

class _Barra extends StatelessWidget {
  const _Barra({required this.cor, required this.fracao});

  final Color cor;
  final double fracao;

  @override
  Widget build(BuildContext context) {
    return FractionallySizedBox(
      alignment: Alignment.centerLeft,
      widthFactor: fracao,
      child: Container(
        height: MediaQuery.textScalerOf(context).scale(BichuEspaco.e3),
        decoration: BoxDecoration(
          color: cor,
          borderRadius: BorderRadius.circular(BichuRaio.sm),
        ),
      ),
    );
  }
}
