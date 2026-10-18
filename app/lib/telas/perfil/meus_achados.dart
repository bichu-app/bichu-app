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
import '../../widgets/faixa_de_aviso.dart';
import '../../widgets/saida_da_tela.dart';

/// `Perfil` > **`Meus achados`**: os avisos de achado que esta conta registrou.
///
/// ---------------------------------------------------------------------------
/// ## POR QUE ELA MORA EM `Perfil`, E NÃO NA ABA `Pets`
///
/// A decisão é medida em três coisas, e nenhuma delas é gosto:
///
/// 1. **A aba `Pets` é pública e deslogada.** A listagem de perdidos que vive
///    lá declara `security: []` no contrato — é o que faz a vizinhança achar o
///    pet, e o visitante sem conta chega nela. `listMyFoundReports` declara
///    `bearerAuth` e a autorização está no `WHERE` do servidor
///    (`reporter_user_id = :dono`). Uma lista que só existe com conta, dentro
///    da seção que existe sem conta, obriga a seção a significar duas coisas —
///    e a primeira coisa que quem não tem conta veria ali seria uma lista vazia
///    que não é dele.
/// 2. **`Perfil` é onde "o meu" já mora, e está escrito.** `abas.dart` registra
///    a regra com todas as letras: *"`Pets` é a vizinhança (perdidos, achados,
///    adoções); cadastrar o **meu** pet é custódia, e custódia é conta"*, e por
///    isso `Meus pets` é o primeiro bloco de `Perfil`. `Meus achados` é a mesma
///    categoria de coisa: registro meu, sob a minha conta.
/// 3. **A forma de `Perfil` aceita a porta sem reestruturar nada.** A seção é
///    um menu de `ItemDeMenu` desde 18/10/2026, e item novo entra entre
///    `Meus dados` e `Sair da conta`. Uma aba em `Pets` exigiria um `TabBar`
///    novo no corpo de uma seção que está sendo reestruturada por outra frente.
///
/// O contraexemplo honesto é `Minhas indicações`, que virou **aba** de `Perto`.
/// A diferença é a seção: `Perto` é o diretório inteiro e exige conta para
/// quase tudo; `Pets` é a vitrine pública do produto.
///
/// ---------------------------------------------------------------------------
/// ## A OPERAÇÃO EXISTIA E NÃO TINHA CHAMADOR
///
/// `GET /v1/found-reports` (`listMyFoundReports`) está registrada no servidor
/// desde a BICHUS-35 (`found-report-routes.ts`) e **nenhuma tela a chamava**: o
/// único caminho do app até um achado registrado era o `Ver o achado` do
/// desfecho do registro, que serve a um achado — o último. Quem registrou três
/// na semana não tinha como voltar a dois deles.
///
/// A tela de detalhe (`TelaDoAchado`, `Rotas.achadoDe`) já existia. Esta lista
/// é o que faltava para ela ter mais de um caminho de entrada.
///
/// ---------------------------------------------------------------------------
/// ## PAGINAÇÃO POR CURSOR, E AQUI O CONTRATO MANDA CURSOR
///
/// `FoundReportPage` declara `next_cursor` e **não declara `total`**, então esta
/// tela não pode dizer "1 a 20 de 87" — e não finge. `RodapeDaPaginacao` exige
/// `total` para decidir se há mais, e com cursor esse número não existe; por
/// isso o pé daqui é próprio, e pequeno: `Carregar mais` enquanto houver cursor,
/// e a contagem do que **está na tela** quando não houver.
///
/// É deliberadamente diferente da listagem pública de perdidos, que é numerada.
/// As duas seguem o contrato, e o contrato segue o uso.
///
/// ## SEM FOTO NO CARTÃO, E ISSO NÃO É ECONOMIA
///
/// `FoundReport.photo_url` volta **nulo** enquanto não houver conversa mediada
/// (critério 9): a foto do achador é vista pelo tutor dentro da conversa, e só.
/// Esta lista custa **zero byte de imagem**, e um lugar reservado de foto que
/// nunca preenche pareceria defeito.
class MeusAchados extends StatefulWidget {
  const MeusAchados({super.key});

  static const String titulo = 'Meus achados';

  /// Uma linha, e só uma, em cada estado em que a lista não tem o que mostrar.
  static const String vazio = 'Você ainda não registrou nenhum achado.';
  static const String semConta = 'Entre na sua conta para ver os achados que você registrou.';
  static const String falha = 'Não foi possível carregar os seus achados agora.';

  static const String rotuloDeCarregarMais = 'Carregar mais';

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
    } on FalhaDeChamada {
      _falhou(geracao, maisUma: maisUma);
    } on FormatException {
      _falhou(geracao, maisUma: maisUma);
    }
  }

  void _falhou(int geracao, {required bool maisUma}) {
    if (!mounted || geracao != _geracao) return;
    setState(() {
      if (maisUma) {
        _carregandoMais = false;
        _falhaAoCarregarMais = true;
        return;
      }
      _itens = const <AchadoRegistrado>[];
      _fase = _Fase.falha;
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
        bottom: false,
        child: AnimatedBuilder(
          animation: sessao,
          builder: (context, _) => ListView(
            padding: const EdgeInsets.all(BichuEspaco.e4),
            addSemanticIndexes: false,
            children: _corpo(),
          ),
        ),
      ),
    );
  }

  List<Widget> _corpo() {
    switch (_fase) {
      case _Fase.semConta:
        return <Widget>[_UmaLinha(texto: MeusAchados.semConta)];
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
///
/// **O toque leva a `Rotas.achadoDe`**, a tela de detalhe que já existia. É o
/// mesmo destino do `Ver o achado` do desfecho do registro, e é por isso que
/// esta lista não desenha nada além do que identifica o aviso: quem quiser o
/// resto abre.
class _CartaoDoMeuAchado extends StatelessWidget {
  const _CartaoDoMeuAchado({required this.achado});

  final AchadoRegistrado achado;

  /// O estado do aviso, em palavra. **Nunca em cor sozinha** (SC 1.4.1), e o
  /// desconhecido vira a palavra neutra: versão antiga do app continua no
  /// bolso de alguém quando o servidor ganhar um estado novo, e um `switch` que
  /// não o conhece não pode derrubar a tela.
  static String rotuloDoEstado(StatusDoAchado status) => switch (status) {
        StatusDoAchado.aberto => 'Em análise',
        StatusDoAchado.comCorrespondencia => 'Possível tutor encontrado',
        StatusDoAchado.encerrado => 'Encerrado',
        StatusDoAchado.desconhecido => 'Registrado',
      };

  /// O título. O achado avulso não tem nome de pet — ele é de um animal que
  /// ninguém identificou ainda —, e por isso o título é **o que a pessoa
  /// informou**: espécie e porte. `FoundReport.species` e `size` são opcionais
  /// no contrato, e sem os dois sobra a origem do aviso.
  static String tituloDe(AchadoRegistrado achado) {
    return switch (achado.origem) {
      OrigemDoAchado.leituraDeTag => 'Achado pela plaquinha',
      _ => 'Achado que você registrou',
    };
  }

  /// `dd/mm/aaaa` no fuso de quem lê, sem `intl`. **`found_at` é anulável** no
  /// contrato, e o nulo não vira data inventada: a linha simplesmente não sai.
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
      rotuloDoEstado(achado.status),
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
                  rotuloDoEstado(achado.status),
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
