import 'package:flutter/material.dart';

import '../theme/bichu_colors.dart';
import '../theme/bichu_tokens.g.dart';
import 'bichu_field.dart';

/// O topo de **toda pagina com listagem** do app: busca, filtro e ordenacao.
///
/// Regra do cliente, 22/09/2026, nas palavras dele: *"todas as paginas que
/// tiverem registros/listagem devem ter campo de busca no topo da pagina,
/// campo com o icone de filtro e ordenacao"*. `Perto` e a primeira; `Meus
/// pets`, a lista publica de perdidos, `Loja` e `Rede` herdam **este**
/// componente, e nao uma copia dele.
///
/// Esta prosa e a especificacao do componente, no formato das secoes do
/// paragrafo 11 do design system. Ela mora aqui porque
/// `docs/06-design-system.md` e somente leitura para quem escreveu isto; o
/// texto para transcricao esta na entrega.
///
/// ---------------------------------------------------------------------------
/// ## Anatomia
///
/// ```
/// [ campo de busca ..................... ] [ filtro 48 ] [ ordem 48 ]
/// <n> resultados · <ordem que DE FATO valeu>
/// [ faixa: por que a ordem pedida nao pode ser cumprida ]   (condicional)
/// [ nota: o alcance real da busca ]                          (condicional)
/// ```
///
/// | Item | Valor | Token |
/// |---|---|---|
/// | Alvo dos dois icones | 48 x 48dp | `target.min` |
/// | Espaco entre os tres controles | 8dp | `space.2` |
/// | Espaco da barra ate o primeiro item | 16dp | `space.4` |
/// | Desenho do icone | 24dp | padrao do `IconButton` |
/// | Linha de resumo | `body-sm` em `text-secondary` | |
/// | Raio do distintivo de filtros | `full` | `radius.full` |
///
/// **48 e nao 64.** O piso critico de 64dp do paragrafo 6.5 vale para
/// superficie critica (o achador, a marcacao de perdido); um filtro de
/// listagem nao e uma delas, e tres alvos de 64 lado a lado com o campo de
/// busca nao cabem em 320dp.
///
/// **A barra fica no CORPO, no topo da lista, e nao na barra de topo.** O
/// paragrafo 11.23.1 da **uma** acao de 64 x 64 na `AppBar`, e em `Pets` e em
/// `Perto` essa acao e o `Filtros`. Sao tres controles agora, e dois deles nao
/// caberiam. **Consequencia declarada: o `Filtros` sai da barra de topo e
/// desce para o corpo**, junto com os outros dois; o slot unico da direita
/// fica **livre**, que e o que o portao da gaveta cobra.
///
/// ---------------------------------------------------------------------------
/// ## O que ele nao sabe
///
/// **Nada sobre o dominio de quem o usa.** Nao ha uma palavra de diretorio,
/// de profissional, de pet ou de produto neste arquivo. Quem usa declara os
/// filtros e as ordens **que a rota dele aceita**, em [GrupoDeFiltro] e
/// [OpcaoDeRecorte], e recebe de volta o codigo escolhido. Vocabulario de uma
/// tela embutido aqui faria a segunda tela reescrever o componente, que e
/// exatamente o que este arquivo existe para impedir.
///
/// ---------------------------------------------------------------------------
/// ## Os tres casos em que um controle nao nasce
///
/// O criterio 2 da BICHUS-62 — nenhum toque termina sem resposta — vale para
/// os tres controles, e e por isso que cada um deles pode **nao existir**.
/// Controle desabilitado nao serve: ele continua se anunciando e continua sem
/// desfecho.
///
/// 1. **A busca sem servidor.** [ControleDeBusca] exige declarar o
///    [AlcanceDaBusca]. Quem nao tem rota de busca passa `busca: null` e o
///    campo **nao e desenhado**. Quem so consegue filtrar o que ja esta na
///    memoria passa [AlcanceDaBusca.paginaCarregada], e o componente
///    **escreve na tela** que a busca olha so o que esta carregado — campo de
///    busca que mente sobre o alcance e pior que campo ausente.
/// 2. **O filtro sem opcao.** Grupo sem opcao nenhuma nao aparece na folha, e
///    filtro sem nenhum grupo com opcao **nao desenha o icone**. Uma folha
///    vazia e um toque que termina em nada.
/// 3. **A ordenacao com uma opcao so.** Um unico jeito de ordenar nao e uma
///    escolha: o icone **nao e desenhado** e a ordem aparece so na linha de
///    resumo, como informacao.
///
/// ---------------------------------------------------------------------------
/// ## A ordem mostrada e a ordem REAL
///
/// [ControleDeOrdenacao.efetiva] e a ordem em que a lista **esta**, e nao a
/// que foi pedida. As duas divergem de verdade: `GET /directory/entries`
/// responde `distance_available: false` e devolve a lista por nome mesmo
/// quando `sort=distance` foi pedido. Quando divergem, quem usa preenche
/// [ControleDeOrdenacao.porQueNaoEAPedida] e o componente mostra a faixa com
/// o motivo. **A faixa nao aceita botao**: a causa costuma morar no servidor,
/// e um rotulo de saida sem caminho que a conserte e acao sem destino com
/// cara de conserto.
///
/// O componente **nao guarda** a ordem pedida e nao tem como mostra-la: nao
/// existe caminho no codigo daqui que pinte `Mais perto` selecionado sobre
/// uma lista que saiu por nome.
///
/// ---------------------------------------------------------------------------
/// ## Lista vazia e lista de um item
///
/// - **Zero itens e nenhum recorte ativo** (o estado em que `Loja` e `Rede`
///   vao nascer): a barra **nao e desenhada**. Filtrar o nada e ordenar o
///   nada sao tres controles sem desfecho, e o `EstadoVazio` da tela fica
///   sozinho, que e o desenho do paragrafo 11.10.
/// - **Zero itens com recorte ativo** (a pessoa filtrou e nao sobrou nada): a
///   barra **fica**, com a linha `0 resultados`. Tirar a barra aqui prenderia
///   a pessoa num vazio sem o controle que o produziu — e o unico caminho de
///   volta seria sair da secao.
/// - **Um item**: identico a lista cheia, com `1 resultado` no singular. A
///   barra nao some com pouca coisa: sumir e voltar conforme a contagem faz o
///   topo da tela pular a cada carregamento.
class BarraDeListagem extends StatelessWidget {
  const BarraDeListagem({
    required this.total,
    super.key,
    this.busca,
    this.filtro,
    this.ordenacao,
    this.substantivo = const SubstantivoDaListagem(),
  });

  /// Quantos itens o recorte atual tem **no servidor**, e nao quantos vieram
  /// nesta pagina. E o numero que a linha de resumo mostra.
  final int total;

  final ControleDeBusca? busca;
  final ControleDeFiltro? filtro;
  final ControleDeOrdenacao? ordenacao;

  /// Como chamar o que esta listado. `Perto` lista `resultado`; `Meus pets`
  /// listaria `pet`.
  final SubstantivoDaListagem substantivo;

  /// Ha pelo menos um controle com desfecho.
  bool get _temControle =>
      busca != null ||
      (filtro?.temOpcao ?? false) ||
      (ordenacao?.temEscolha ?? false);

  /// A pessoa recortou a lista de alguma forma.
  bool get _recorteAtivo =>
      (filtro?.ativos ?? 0) > 0 ||
      (busca?.controlador.text.trim().isNotEmpty ?? false);

  @override
  Widget build(BuildContext context) {
    if (!_temControle) return const SizedBox.shrink();
    if (total == 0 && !_recorteAtivo) return const SizedBox.shrink();

    final cores = BichuColors.of(context).cores;
    final textos = Theme.of(context).textTheme;
    final aviso = ordenacao?.porQueNaoEAPedida;

    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: <Widget>[
        Row(
          crossAxisAlignment: CrossAxisAlignment.end,
          children: <Widget>[
            if (busca != null)
              Expanded(child: _CampoDeBusca(busca: busca!))
            else
              const Spacer(),
            if (filtro?.temOpcao ?? false) ...<Widget>[
              const SizedBox(width: BichuEspaco.e2),
              _BotaoDeFolha(
                icone: Icons.tune,
                // O nome acessivel carrega o ESTADO, e nao so o verbo: quem
                // usa leitor de tela nao ve o distintivo com o numero.
                rotulo: filtro!.ativos == 0
                    ? 'Filtrar'
                    : 'Filtrar, ${filtro!.ativos} ${filtro!.ativos == 1 ? 'filtro ativo' : 'filtros ativos'}',
                distintivo: filtro!.ativos == 0 ? null : '${filtro!.ativos}',
                aoTocar: () => _abrirFiltros(context),
              ),
            ],
            if (ordenacao?.temEscolha ?? false) ...<Widget>[
              const SizedBox(width: BichuEspaco.e2),
              _BotaoDeFolha(
                icone: Icons.swap_vert,
                // A ordem que o leitor de tela ouve e a EFETIVA, pela mesma
                // razao da linha de resumo.
                rotulo: 'Ordenar, ${ordenacao!.rotuloEfetivo}',
                aoTocar: () => _abrirOrdenacao(context),
              ),
            ],
          ],
        ),
        const SizedBox(height: BichuEspaco.e2),
        Text(
          _resumo,
          style: textos.bodySmall?.copyWith(color: cores.textSecondary),
        ),
        if (aviso != null) ...<Widget>[
          const SizedBox(height: BichuEspaco.e3),
          _FaixaDaOrdem(ordenacao: ordenacao!),
        ],
        if (busca?.avisoDeAlcance != null) ...<Widget>[
          const SizedBox(height: BichuEspaco.e2),
          Text(
            busca!.avisoDeAlcance!,
            style: textos.bodySmall?.copyWith(color: cores.textSecondary),
          ),
        ],
        const SizedBox(height: BichuEspaco.e4),
      ],
    );
  }

  /// `12 resultados · Nome`.
  ///
  /// A ordem entra aqui **sempre**, e em texto, e nao so dentro do icone: e a
  /// unica forma de a ordem real estar visivel sem a pessoa abrir nada.
  String get _resumo {
    final contagem = '$total ${total == 1 ? substantivo.singular : substantivo.plural}';
    final ordem = ordenacao;
    if (ordem == null) return contagem;
    return '$contagem · ${ordem.rotuloEfetivo}';
  }

  Future<void> _abrirFiltros(BuildContext context) async {
    await showModalBottomSheet<void>(
      context: context,
      showDragHandle: true,
      isScrollControlled: true,
      useSafeArea: true,
      builder: (_) => _FolhaDeFiltros(filtro: filtro!),
    );
  }

  Future<void> _abrirOrdenacao(BuildContext context) async {
    final escolhido = await showModalBottomSheet<String>(
      context: context,
      showDragHandle: true,
      useSafeArea: true,
      builder: (_) => _FolhaDeOrdenacao(ordenacao: ordenacao!),
    );
    if (escolhido != null) ordenacao!.aoEscolher(escolhido);
  }
}

/// Como chamar o que a lista mostra, no singular e no plural.
class SubstantivoDaListagem {
  const SubstantivoDaListagem({
    this.singular = 'resultado',
    this.plural = 'resultados',
  });

  final String singular;
  final String plural;
}

/// Ate onde a busca de fato alcanca.
enum AlcanceDaBusca {
  /// A rota aceita o termo e o servidor procura na base inteira.
  servidor,

  /// Nao ha rota: o termo filtra o que ja esta carregado nesta pagina.
  ///
  /// **Este valor obriga o componente a escrever o alcance na tela.** Ele
  /// existe para a escolha ser declarada e visivel, e nao para ser usada sem
  /// consequencia.
  paginaCarregada,
}

/// O campo de busca. Ausente quando a listagem nao tem como buscar.
class ControleDeBusca {
  const ControleDeBusca({
    required this.controlador,
    required this.aoMudar,
    required this.alcance,
    required this.exemplo,
    this.rotulo = 'Buscar',
  });

  final TextEditingController controlador;
  final ValueChanged<String> aoMudar;
  final AlcanceDaBusca alcance;

  /// O texto de exemplo dentro do campo.
  final String exemplo;

  final String rotulo;

  /// A frase que o componente escreve sob o campo, ou nulo.
  String? get avisoDeAlcance => switch (alcance) {
        AlcanceDaBusca.servidor => null,
        AlcanceDaBusca.paginaCarregada => textoDoAlcanceLocal,
      };

  /// Palavra por palavra, num lugar so: duas copias divergem no dia em que
  /// alguem mexer numa delas.
  static const String textoDoAlcanceLocal =
      'A busca olha só o que já está carregado nesta página.';
}

/// Uma opcao de recorte: o codigo que vai para a rota e o rotulo que a pessoa
/// le.
class OpcaoDeRecorte {
  const OpcaoDeRecorte({required this.codigo, required this.rotulo});

  final String codigo;
  final String rotulo;
}

/// Um grupo de filtro: um titulo e opcoes mutuamente exclusivas.
class GrupoDeFiltro {
  const GrupoDeFiltro({
    required this.chave,
    required this.titulo,
    required this.opcoes,
    required this.selecionado,
    this.nota,
  });

  /// O identificador que volta em [ControleDeFiltro.aoEscolher].
  final String chave;

  final String titulo;
  final List<OpcaoDeRecorte> opcoes;

  /// O codigo escolhido, ou nulo para "qualquer um".
  final String? selecionado;

  /// Uma linha de explicacao sob o titulo. `Perto` usa para dizer que o nivel
  /// de verificacao e **piso e nao igualdade**, que e a regra do contrato que
  /// ninguem adivinha olhando a lista.
  final String? nota;
}

/// O icone de filtro e a folha que ele abre.
class ControleDeFiltro {
  const ControleDeFiltro({
    required this.grupos,
    required this.aoEscolher,
    required this.aoLimpar,
  });

  final List<GrupoDeFiltro> grupos;

  /// Chamado com a chave do grupo e o codigo escolhido. Codigo nulo limpa
  /// aquele grupo.
  final void Function(String chave, String? codigo) aoEscolher;

  final VoidCallback aoLimpar;

  int get ativos => grupos.where((g) => g.selecionado != null).length;

  /// Ha pelo menos um grupo com opcao. Sem isto o icone nao nasce.
  bool get temOpcao => grupos.any((g) => g.opcoes.isNotEmpty);
}

/// O icone de ordenacao e a folha que ele abre.
class ControleDeOrdenacao {
  const ControleDeOrdenacao({
    required this.opcoes,
    required this.efetiva,
    required this.aoEscolher,
    this.porQueNaoEAPedida,
    this.nota,
  });

  final List<OpcaoDeRecorte> opcoes;

  /// Uma linha de explicacao na folha de ordem, sob o titulo. A `Rede` usa
  /// para dizer de onde `Mais perto` mede e o que fica de fora (design
  /// system 24.17.1, item 6). Mesma forma de [GrupoDeFiltro.nota].
  final String? nota;

  /// **O codigo da ordem em que a lista esta**, e nao o da que foi pedida.
  final String efetiva;

  final ValueChanged<String> aoEscolher;

  /// Por que a ordem pedida nao valeu. Nulo quando pedida e efetiva batem.
  ///
  /// **Explicacao, e nao acao.** O componente nao aceita um botao aqui: a
  /// causa de a ordem nao poder ser cumprida costuma morar no servidor, e um
  /// rotulo de saida sem caminho que a conserte e acao sem destino com cara
  /// de conserto. Quem tiver uma saida de verdade a desenha na propria tela,
  /// onde ela pode ser medida.
  final String? porQueNaoEAPedida;

  bool get temEscolha => opcoes.length > 1;

  String get rotuloEfetivo {
    for (final o in opcoes) {
      if (o.codigo == efetiva) return o.rotulo;
    }
    // Ordem efetiva fora da lista de opcoes e defeito de quem monta o
    // controle, e some em silencio se virar string vazia.
    throw StateError(
      'A ordem efetiva "$efetiva" nao esta entre as opcoes declaradas '
      '(${opcoes.map((o) => o.codigo).join(', ')}). O componente mostra a '
      'ordem REAL da lista, e nao tem como mostrar uma que nao existe.',
    );
  }
}

// ---------------------------------------------------------------------------
// As pecas
// ---------------------------------------------------------------------------

class _CampoDeBusca extends StatelessWidget {
  const _CampoDeBusca({required this.busca});

  final ControleDeBusca busca;

  @override
  Widget build(BuildContext context) {
    return BichuField(
      rotulo: busca.rotulo,
      controlador: busca.controlador,
      exemplo: busca.exemplo,
      opcional: true,
      aoMudar: busca.aoMudar,
      acaoDeTeclado: TextInputAction.search,
      correcaoAutomatica: false,
    );
  }
}

/// Um icone de 48 x 48 que abre uma folha, com nome acessivel obrigatorio.
///
/// `rotulo` e `aoTocar` sao exigidos: um `IconButton` sem rotulo e anunciado
/// como "botão" e nada mais (SC 4.1.2), e um com `onPressed: null` e o
/// controle mudo que o criterio 2 proibe.
class _BotaoDeFolha extends StatelessWidget {
  const _BotaoDeFolha({
    required this.icone,
    required this.rotulo,
    required this.aoTocar,
    this.distintivo,
  });

  final IconData icone;
  final String rotulo;
  final VoidCallback aoTocar;
  final String? distintivo;

  @override
  Widget build(BuildContext context) {
    final cores = BichuColors.of(context).cores;
    final textos = Theme.of(context).textTheme;

    return SizedBox(
      width: BichuAlvoDeToque.min,
      height: BichuAlvoDeToque.min,
      child: IconButton(
        onPressed: aoTocar,
        tooltip: rotulo,
        icon: Stack(
          clipBehavior: Clip.none,
          children: <Widget>[
            Icon(icone, color: cores.textPrimary),
            if (distintivo != null)
              Positioned(
                right: -BichuEspaco.e2,
                top: -BichuEspaco.e2,
                child: Container(
                  padding: const EdgeInsets.symmetric(
                    horizontal: BichuEspaco.e1,
                  ),
                  constraints: const BoxConstraints(minWidth: BichuEspaco.e4),
                  decoration: BoxDecoration(
                    color: cores.primary,
                    borderRadius: BorderRadius.circular(BichuRaio.full),
                  ),
                  child: Text(
                    distintivo!,
                    textAlign: TextAlign.center,
                    // O distintivo repete o que o `tooltip` ja diz, e dois
                    // anuncios do mesmo estado no mesmo controle e ruido.
                    semanticsLabel: '',
                    style: textos.labelSmall?.copyWith(
                      color: cores.onActionFill,
                    ),
                  ),
                ),
              ),
          ],
        ),
      ),
    );
  }
}

/// A faixa que explica por que a ordem pedida nao valeu.
///
/// `informativo` e nao `erro`: **nada deu errado**. O servidor nao tem a
/// localizacao de referencia, e isso e um estado normal.
class _FaixaDaOrdem extends StatelessWidget {
  const _FaixaDaOrdem({required this.ordenacao});

  final ControleDeOrdenacao ordenacao;

  @override
  Widget build(BuildContext context) {
    final cores = BichuColors.of(context).cores;
    final textos = Theme.of(context).textTheme;

    return Semantics(
      liveRegion: true,
      container: true,
      child: Container(
        width: double.infinity,
        padding: const EdgeInsets.all(BichuEspaco.e4),
        decoration: BoxDecoration(
          color: cores.surfaceSunken,
          borderRadius: BorderRadius.circular(BichuRaio.md),
          border: Border.all(color: cores.outline, width: BichuBorda.hairline),
        ),
        child: Text(
          ordenacao.porQueNaoEAPedida!,
          style: textos.bodyMedium?.copyWith(color: cores.textPrimary),
        ),
      ),
    );
  }
}

class _FolhaDeFiltros extends StatelessWidget {
  const _FolhaDeFiltros({required this.filtro});

  final ControleDeFiltro filtro;

  @override
  Widget build(BuildContext context) {
    final textos = Theme.of(context).textTheme;
    final cores = BichuColors.of(context).cores;
    final comOpcao =
        filtro.grupos.where((g) => g.opcoes.isNotEmpty).toList(growable: false);

    return SafeArea(
      child: Padding(
        padding: const EdgeInsets.all(BichuEspaco.e6),
        child: Column(
          mainAxisSize: MainAxisSize.min,
          crossAxisAlignment: CrossAxisAlignment.start,
          children: <Widget>[
            Text('Filtros', style: textos.titleLarge),
            const SizedBox(height: BichuEspaco.e4),
            Flexible(
              child: SingleChildScrollView(
                child: Column(
                  mainAxisSize: MainAxisSize.min,
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: <Widget>[
                    for (final grupo in comOpcao) ...<Widget>[
                      Text(grupo.titulo, style: textos.titleMedium),
                      if (grupo.nota != null) ...<Widget>[
                        const SizedBox(height: BichuEspaco.e1),
                        Text(
                          grupo.nota!,
                          style: textos.bodySmall
                              ?.copyWith(color: cores.textSecondary),
                        ),
                      ],
                      const SizedBox(height: BichuEspaco.e2),
                      Wrap(
                        spacing: BichuEspaco.e2,
                        runSpacing: BichuEspaco.e2,
                        children: <Widget>[
                          for (final opcao in grupo.opcoes)
                            _Pastilha(
                              rotulo: opcao.rotulo,
                              marcada: grupo.selecionado == opcao.codigo,
                              // Tocar no que ja esta marcado **desmarca**. Sem
                              // isso o unico jeito de voltar a "qualquer um"
                              // seria limpar tudo.
                              aoTocar: () => filtro.aoEscolher(
                                grupo.chave,
                                grupo.selecionado == opcao.codigo
                                    ? null
                                    : opcao.codigo,
                              ),
                            ),
                        ],
                      ),
                      const SizedBox(height: BichuEspaco.e6),
                    ],
                  ],
                ),
              ),
            ),
            if (filtro.ativos > 0)
              TextButton(
                onPressed: filtro.aoLimpar,
                child: const Text('Limpar os filtros'),
              ),
          ],
        ),
      ),
    );
  }
}

class _Pastilha extends StatelessWidget {
  const _Pastilha({
    required this.rotulo,
    required this.marcada,
    required this.aoTocar,
  });

  final String rotulo;
  final bool marcada;
  final VoidCallback aoTocar;

  @override
  Widget build(BuildContext context) {
    final cores = BichuColors.of(context).cores;
    final textos = Theme.of(context).textTheme;

    return Semantics(
      button: true,
      selected: marcada,
      label: rotulo,
      // **`onTap` redeclarado junto com `excludeSemantics`.** Esquecer esta
      // linha e a forma exata dos quatro `btn=true tap=false` que este app ja
      // teve; `app/test/a11y/acao_de_controle_test.dart` reprova por ela.
      onTap: aoTocar,
      excludeSemantics: true,
      child: Material(
        color: marcada ? cores.primary : cores.surfaceSunken,
        borderRadius: BorderRadius.circular(BichuRaio.full),
        child: InkWell(
          onTap: aoTocar,
          borderRadius: BorderRadius.circular(BichuRaio.full),
          child: ConstrainedBox(
            constraints: const BoxConstraints(minHeight: BichuAlvoDeToque.min),
            child: Padding(
              padding: const EdgeInsets.symmetric(
                horizontal: BichuEspaco.e4,
                vertical: BichuEspaco.e3,
              ),
              child: Text(
                rotulo,
                style: textos.labelLarge?.copyWith(
                  color: marcada ? cores.onActionFill : cores.textPrimary,
                ),
              ),
            ),
          ),
        ),
      ),
    );
  }
}

class _FolhaDeOrdenacao extends StatelessWidget {
  const _FolhaDeOrdenacao({required this.ordenacao});

  final ControleDeOrdenacao ordenacao;

  @override
  Widget build(BuildContext context) {
    final textos = Theme.of(context).textTheme;

    return SafeArea(
      child: Padding(
        padding: const EdgeInsets.all(BichuEspaco.e6),
        child: Column(
          mainAxisSize: MainAxisSize.min,
          crossAxisAlignment: CrossAxisAlignment.start,
          children: <Widget>[
            Text('Ordenar por', style: textos.titleLarge),
            if (ordenacao.nota != null) ...<Widget>[
              const SizedBox(height: BichuEspaco.e1),
              Text(
                ordenacao.nota!,
                style: textos.bodySmall?.copyWith(
                  color: BichuColors.of(context).cores.textSecondary,
                ),
              ),
            ],
            const SizedBox(height: BichuEspaco.e4),
            for (final opcao in ordenacao.opcoes)
              Semantics(
                button: true,
                // **A marca acompanha a ordem EFETIVA.** Marcar a pedida aqui
                // seria a mesma mentira, escondida dentro da folha.
                selected: opcao.codigo == ordenacao.efetiva,
                label: opcao.rotulo,
                onTap: () => Navigator.of(context).pop(opcao.codigo),
                excludeSemantics: true,
                child: InkWell(
                  onTap: () => Navigator.of(context).pop(opcao.codigo),
                  child: ConstrainedBox(
                    constraints: const BoxConstraints(
                      minHeight: BichuAlvoDeToque.min,
                    ),
                    child: Row(
                      children: <Widget>[
                        Icon(
                          opcao.codigo == ordenacao.efetiva
                              ? Icons.radio_button_checked
                              : Icons.radio_button_unchecked,
                        ),
                        const SizedBox(width: BichuEspaco.e4),
                        Expanded(
                          child: Text(opcao.rotulo, style: textos.bodyLarge),
                        ),
                      ],
                    ),
                  ),
                ),
              ),
          ],
        ),
      ),
    );
  }
}
