import 'package:flutter/material.dart';
import 'package:go_router/go_router.dart';

import '../../api/achados_api.dart';
import '../../api/falhas.dart';
import '../../api/modelos_achado.dart';
import '../../api/mensagens_de_erro.dart';
import '../../escopo.dart';
import '../../roteamento/rotas.dart';
import '../../theme/bichu_colors.dart';
import '../../theme/bichu_tokens.g.dart';
import '../../widgets/arrastar_para_atualizar.dart';
import '../../widgets/botao_primario.dart';
import '../../widgets/convite_para_entrar.dart';
import '../../widgets/faixa_de_aviso.dart';
import '../../widgets/saida_da_tela.dart';

/// `Perfil` > **`Meus achados`**: os avisos de achado que esta conta registrou.
class MeusAchados extends StatefulWidget {
  const MeusAchados({super.key});

  /// O NOME DA TELA, E O ROTULO DO MENU.
  static const String titulo = 'Achados';

  /// O ROTULO DO BOTAO FIXO NO TOPO DO CORPO (28/10/2026).
  static const String rotuloDeRegistrar = 'Registrar um achado avulso';

  /// Uma linha, e só uma, em cada estado em que a lista não tem o que mostrar.
  static const String vazio = 'Você ainda não registrou nenhum achado.';
  /// **O TEXTO DE `semConta` SAIU, E A PAGINA ENTROU** (19/10/2026).
  static const String falha = 'Não foi possível carregar os seus achados agora.';

  static const String rotuloDeCarregarMais = 'Carregar mais';

  /// O estado do aviso, em palavra.
  static String rotuloDoEstado(StatusDoAchado status) => switch (status) {
        StatusDoAchado.aberto => 'Em análise',
        StatusDoAchado.comCorrespondencia => 'Possível tutor encontrado',
        StatusDoAchado.encerrado => 'Encerrado',
        StatusDoAchado.desconhecido => 'Registrado',
      };

  static String fimDaLista(int quantos) => quantos == 1
      ? 'Você registrou 1 achado.'
      : 'Você registrou $quantos achados.';

  @override
  State<MeusAchados> createState() => _EstadoDeMeusAchados();
}

enum _Fase { carregando, lista, falha, semConta }

class _EstadoDeMeusAchados extends State<MeusAchados> {
  _Fase _fase = _Fase.carregando;

  List<AchadoRegistrado> _itens = const <AchadoRegistrado>[];
  String? _cursor;

  bool _carregandoMais = false;
  bool _falhaAoCarregarMais = false;

  int _geracao = 0;
  bool _primeiraCarga = true;

  @override
  void didChangeDependencies() {
    super.didChangeDependencies();
    if (!_primeiraCarga) return;
    _primeiraCarga = false;
    WidgetsBinding.instance.addPostFrameCallback((_) {
      if (mounted) _carregar();
    });
  }

  Future<void> _carregar({bool maisUma = false}) async {
    if (!mounted) return;
    final escopo = Escopo.of(context);
    if (!escopo.sessao.logado) {
      setState(() {
        _fase = _Fase.semConta;
        _itens = const <AchadoRegistrado>[];
        _cursor = null;
      });
      return;
    }

    final int geracao;
    if (maisUma) {
      if (_carregandoMais || _cursor == null) return;
      geracao = _geracao;
      setState(() {
        _carregandoMais = true;
        _falhaAoCarregarMais = false;
      });
    } else {
      geracao = ++_geracao;
      setState(() => _fase = _Fase.carregando);
    }

    try {
      final pagina = await AchadosApi(escopo.api).listarMeus(
        cursor: maisUma ? _cursor : null,
      );
      if (!mounted || geracao != _geracao) return;
      setState(() {
        _itens = maisUma
            ? <AchadoRegistrado>[..._itens, ...pagina.itens]
            : pagina.itens;
        _cursor = pagina.proximoCursor;
        _fase = _Fase.lista;
        _carregandoMais = false;
      });
    } on FalhaDeChamada catch (falha) {
      _falhou(geracao, maisUma: maisUma, semConta: faltaConta(falha));
    } on FormatException {
      _falhou(geracao, maisUma: maisUma);
    }
  }

  void _falhou(
    int geracao, {
    required bool maisUma,
    bool semConta = false,
  }) {
    if (!mounted || geracao != _geracao) return;
    setState(() {
      if (maisUma) {
        _carregandoMais = false;
        _falhaAoCarregarMais = true;
        return;
      }
      _itens = const <AchadoRegistrado>[];
      _fase = semConta ? _Fase.semConta : _Fase.falha;
    });
  }

  @override
  Widget build(BuildContext context) {
    final sessao = Escopo.of(context).sessao;
    return Scaffold(
      appBar: const BarraDeConta(
        titulo: MeusAchados.titulo,
        saida: TipoDeSaida.voltar,
      ),
      body: SafeArea(
        top: false,
        child: AnimatedBuilder(
          animation: sessao,
          builder: (context, _) => ArrastarParaAtualizar(
            aoAtualizar: _carregar,
            child: CustomScrollView(
              slivers: <Widget>[
                if (_fase != _Fase.semConta)
                  SliverPersistentHeader(
                    pinned: true,
                    delegate: _BarraDeRegistrar(
                      aoTocar: () => context.push(Rotas.registrarAchado),
                    ),
                  ),
                SliverPadding(
                  padding: const EdgeInsets.all(BichuEspaco.e4),
                  sliver: SliverList(
                    delegate: SliverChildListDelegate(
                      _corpo(),
                      addSemanticIndexes: false,
                    ),
                  ),
                ),
              ],
            ),
          ),
        ),
      ),
    );
  }

  List<Widget> _corpo() {
    switch (_fase) {
      case _Fase.semConta:
        return const <Widget>[
          ConviteParaEntrar(secao: SecaoComConta.meusAchados),
        ];
      case _Fase.carregando:
        return <Widget>[
          Semantics(
            label: 'Carregando os seus achados',
            liveRegion: true,
            child: const Center(child: CircularProgressIndicator()),
          ),
        ];
      case _Fase.falha:
        return <Widget>[
          FaixaDeAviso(
            texto: MeusAchados.falha,
            rotuloDaAcao: MensagensDeErro.tentarDeNovo,
            aoTocarNaAcao: _carregar,
          ),
        ];
      case _Fase.lista:
        if (_itens.isEmpty) {
          return <Widget>[_UmaLinha(texto: MeusAchados.vazio)];
        }
        return <Widget>[
          for (var i = 0; i < _itens.length; i++) ...<Widget>[
            if (i > 0) const SizedBox(height: BichuEspaco.e4),
            _CartaoDoMeuAchado(achado: _itens[i]),
          ],
          const SizedBox(height: BichuEspaco.e4),
          if (_cursor == null)
            Text(
              MeusAchados.fimDaLista(_itens.length),
              style: Theme.of(context).textTheme.bodySmall?.copyWith(
                    color: BichuColors.of(context).cores.textSecondary,
                  ),
            )
          else ...<Widget>[
            if (_falhaAoCarregarMais) ...<Widget>[
              Text(
                MeusAchados.falha,
                style: Theme.of(context).textTheme.bodySmall,
              ),
              const SizedBox(height: BichuEspaco.e2),
            ],
            OutlinedButton(
              onPressed: _carregandoMais ? null : () => _carregar(maisUma: true),
              style: OutlinedButton.styleFrom(
                minimumSize: const Size.fromHeight(BichuAlvoDeToque.min),
              ),
              child: Text(
                _falhaAoCarregarMais
                    ? MensagensDeErro.tentarDeNovo
                    : MeusAchados.rotuloDeCarregarMais,
              ),
            ),
          ],
        ];
    }
  }
}

/// O cartão de um achado meu.
class _CartaoDoMeuAchado extends StatelessWidget {
  const _CartaoDoMeuAchado({required this.achado});

  final AchadoRegistrado achado;

  /// O título. O achado avulso não tem nome de pet — ele é de um animal que
  /// ninguém identificou ainda —, e por isso o título é **o que a pessoa
  /// informou**: espécie e porte.
  static String tituloDe(AchadoRegistrado achado) {
    return switch (achado.origem) {
      OrigemDoAchado.leituraDeTag => 'Achado pela plaquinha',
      _ => 'Achado que você registrou',
    };
  }

  /// `dd/mm/aaaa` no fuso de quem lê, sem `intl`.
  static String? quandoDe(AchadoRegistrado achado) {
    final quando = achado.achadoEm;
    if (quando == null) return null;
    final local = quando.toLocal();
    final dia = local.day.toString().padLeft(2, '0');
    final mes = local.month.toString().padLeft(2, '0');
    return 'Achado em $dia/$mes/${local.year}';
  }

  static String rotuloAcessivelDe(AchadoRegistrado achado) {
    return <String>[
      MeusAchados.rotuloDoEstado(achado.status),
      tituloDe(achado),
      achado.rotuloDaArea ?? 'Região não informada',
      quandoDe(achado) ?? '',
    ].where((parte) => parte.isNotEmpty).join(', ');
  }

  @override
  Widget build(BuildContext context) {
    final cores = BichuColors.of(context).cores;
    final textos = Theme.of(context).textTheme;
    final quando = quandoDe(achado);

    return Semantics(
      container: true,
      excludeSemantics: true,
      button: true,
      label: rotuloAcessivelDe(achado),
      child: InkWell(
        onTap: () => context.push(Rotas.achadoDe(achado.id)),
        borderRadius: BorderRadius.circular(BichuRaio.lg),
        child: Container(
          padding: const EdgeInsets.all(BichuEspaco.e4),
          decoration: BoxDecoration(
            color: cores.surface,
            borderRadius: BorderRadius.circular(BichuRaio.lg),
            border: Border.all(color: cores.outline, width: BichuBorda.hairline),
          ),
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: <Widget>[
              Container(
                padding: const EdgeInsets.symmetric(
                  horizontal: BichuEspaco.e2,
                  vertical: BichuEspaco.e1,
                ),
                decoration: BoxDecoration(
                  color: cores.primaryContainer,
                  borderRadius: BorderRadius.circular(BichuRaio.full),
                ),
                child: Text(
                  MeusAchados.rotuloDoEstado(achado.status),
                  style: textos.labelSmall?.copyWith(
                    color: cores.onPrimaryContainer,
                  ),
                ),
              ),
              const SizedBox(height: BichuEspaco.e2),
              Text(tituloDe(achado), style: textos.titleMedium),
              const SizedBox(height: BichuEspaco.e2),
              Text(
                achado.rotuloDaArea ?? 'Região não informada',
                style: textos.bodySmall?.copyWith(color: cores.textSecondary),
              ),
              if (quando != null) ...<Widget>[
                const SizedBox(height: BichuEspaco.e1),
                Text(
                  quando,
                  style: textos.bodySmall?.copyWith(color: cores.textSecondary),
                ),
              ],
            ],
          ),
        ),
      ),
    );
  }
}

/// O estado vazio: **uma linha**, como na listagem de perdidos, e pelo mesmo
/// pedido do cliente de 18/10/2026.
class _UmaLinha extends StatelessWidget {
  const _UmaLinha({required this.texto});

  final String texto;

  @override
  Widget build(BuildContext context) {
    final cores = BichuColors.of(context).cores;
    return Container(
      width: double.infinity,
      padding: const EdgeInsets.all(BichuEspaco.e6),
      decoration: BoxDecoration(
        color: cores.surfaceSunken,
        borderRadius: BorderRadius.circular(BichuRaio.lg),
        border: Border.all(color: cores.outline, width: BichuBorda.hairline),
      ),
      child: Text(texto, style: Theme.of(context).textTheme.titleMedium),
    );
  }
}

/// O CHAO FIXO COM `Registrar um achado avulso`, no topo do corpo.
class _BarraDeRegistrar extends SliverPersistentHeaderDelegate {
  const _BarraDeRegistrar({required this.aoTocar});

  final VoidCallback aoTocar;

  /// `e3` em cima e embaixo do alvo de 48 dp.
  static const double _altura = BichuAlvoDeToque.min + BichuEspaco.e3 * 2;

  @override
  double get maxExtent => _altura;

  @override
  double get minExtent => _altura;

  @override
  Widget build(BuildContext context, double deslocamento, bool sobrepondo) {
    final cores = BichuColors.of(context).cores;
    return Container(
      decoration: BoxDecoration(
        color: cores.surface,
        border: Border(
          bottom: BorderSide(color: cores.outline, width: BichuBorda.hairline),
        ),
      ),
      padding: const EdgeInsets.symmetric(
        horizontal: BichuEspaco.e4,
        vertical: BichuEspaco.e3,
      ),
      child: BotaoPrimario(
        rotulo: MeusAchados.rotuloDeRegistrar,
        icone: Icons.add,
        aoTocar: aoTocar,
      ),
    );
  }

  /// **Reconstroi quando a acao muda, e so.** O rotulo e constante e a altura e
  /// fixa; comparar por identidade de `aoTocar` e o que evita um `rebuild` a
  /// cada quadro de rolagem.
  @override
  bool shouldRebuild(_BarraDeRegistrar velho) => velho.aoTocar != aoTocar;
}
