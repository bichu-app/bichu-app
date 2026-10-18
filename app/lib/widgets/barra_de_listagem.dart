import 'package:flutter/material.dart';

import '../theme/bichu_colors.dart';
import '../theme/bichu_tokens.g.dart';
import 'bichu_field.dart';
import 'botao_primario.dart';

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
/// barra de topo:  [ gaveta 64 ][ titulo ] ....... [ filtro e ordem 64 ]
/// corpo:          [ campo de busca, LARGURA TOTAL .................. ]
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
/// ---------------------------------------------------------------------------
/// ## O PADRAO DE LISTAGEM MUDOU POR DECISAO DO CLIENTE (17/10/2026)
///
/// Nas palavras dele: *"suba todos os filtros para a barra do titulo da pagina
/// e deixe o campo de busca sempre ocupando a area toda"*.
///
/// **Isto REVERTE a regra registrada do projeto** de 22/09/2026 -- "busca,
/// filtro e ordenacao no topo do CORPO da tela, nunca na barra do aplicativo"
/// --, e a reversao e dele. Quem abrir este arquivo em tres meses e achar que
/// a regra antiga foi quebrada por descuido esta lendo o commit errado: ela
/// foi trocada de proposito, e este paragrafo e o registro.
///
/// O desenho que sai disto:
///
/// - **O acesso ao filtro (e a ordem) vai para o slot unico de acao da
///   `AppBar`**, que e o que o paragrafo 11.23.1 sempre reservou a ele
///   (UX 27.5.1 a 27.5.4). Ele cabe porque e **um** controle: a ordem entrou
///   na mesma folha no lote anterior do mesmo dia, e a busca nao sobe.
/// - **O campo de busca ocupa a largura TOTAL do corpo, sempre.** Ele nao
///   encolhe mais para abrir espaco ao icone, porque nao ha mais icone ao
///   lado dele.
/// - **O gatilho da gaveta nao foi tocado.** Ele mora no slot da ESQUERDA, que
///   na raiz de secao esta vazio por desenho (23.4). Nada se empilha: sao dois
///   slots diferentes.
///
/// A publicacao e por [SlotDaBarraDeListagem], e nao por parametro de cada
/// tela: a `AppBar` e da casca (`TelaDeAba`) e o estado do filtro e da
/// listagem. Um parametro obrigaria cada uma das cinco secoes a repassar
/// estado que nao e dela.
///
/// ---------------------------------------------------------------------------
/// ## NADA SE APLICA SOZINHO (decisao do cliente, 17/10/2026)
///
/// Nas palavras dele: *"Todos os filtros do app, nao devem ser filtrados
/// automaticamente, voce deve colocar um botao para o usuario clicar e aplicar
/// os filtros"*. O desenho que isto produz tem tres partes, e as tres moram
/// **aqui**, uma vez, e nao em cada tela:
///
/// 1. **A folha de filtros guarda a escolha PENDENTE.** Tocar numa pastilha
///    nao chama a tela e nao fecha a folha: ele mexe num mapa local. O
///    `Aplicar` manda **todos** os grupos de uma vez, em
///    [ControleDeFiltro.aoAplicar], e e o unico caminho de saida com efeito.
///    Antes disso a lista continua mostrando o resultado anterior, de
///    proposito.
/// 2. **A busca tem o mesmo contrato, e a razao e coerencia.** Deixar o filtro
///    manual e a busca automatica seria duas regras no mesmo topo de tela. O
///    termo vale quando a pessoa aperta a lupa dentro do campo **ou** a tecla
///    de busca do teclado (`TextInputAction.search`) -- as duas sao a mesma
///    acao, e nao ha uma terceira. Digitar deixou de perguntar ao servidor:
///    sumiu com isso a espera de 300/350 ms que cada tela carregava por conta.
/// 3. **O botao habilitado E o aviso de pendencia.** Nao ha selo e nao ha
///    faixa. `Aplicar` nasce desabilitado e so habilita quando a escolha
///    pendente difere da aplicada; a lupa segue a mesma regra sobre o texto
///    digitado.
///
/// **Isto contradiz, de proposito e num lugar so, a regra de "controle
/// desabilitado nao serve" da secao seguinte.** Ali a regra fala de controle
/// que **nunca** tem desfecho -- um filtro sem opcao, uma ordem com uma opcao
/// so --, e a saida certa continua sendo nao desenha-lo. `Aplicar` sem nada
/// pendente e outra coisa: e um controle que existe, cujo desfecho depende de
/// um estado que a propria pessoa acabou de mexer, e cujo estado desabilitado
/// e a informacao que o cliente pediu que ficasse visivel.
///
/// **A ordenacao entrou na MESMA folha** (segundo pedido do cliente no mesmo
/// dia: *"coloque o campo de ordenacao dentro da modal de filtro"*). Fora do
/// corpo da tela ficou so a busca, e o icone unico abre filtro e ordem juntos.
/// Com isso o `Aplicar` manda **um** recorte -- filtros e ordem --, e trocar
/// os dois deixou de ser duas chamadas a rota com duas voltas a primeira
/// pagina.
///
/// **Isto NAO briga com a regra registrada do projeto** ("busca, filtro e
/// ordenacao no topo do corpo da tela, nunca na barra do aplicativo"): a regra
/// decide que os tres nao sobem para a `AppBar`, e a folha e do corpo -- ela
/// nasce de um controle que esta no corpo e cobre a tela por baixo da barra.
/// O slot unico de acao da `AppBar` continua livre.
///
/// **A ordem nao se desmarca.** Uma lista sempre esta em alguma ordem: a
/// pastilha marcada nao vira "qualquer uma" no segundo toque, e o `Limpar`
/// nao a toca.
///
/// ---------------------------------------------------------------------------
/// ## O recorte ativo e o APLICADO, e nunca o digitado
///
/// [ControleDeBusca.termoAplicado] e o termo que **produziu** a lista que esta
/// na tela, e e ele que [_recorteAtivo] le.
///
/// **Isto consertou um defeito medido.** Ate 17/10 o componente lia
/// `busca.controlador.text` no momento de construir, e nao escutava o
/// controlador: o estado do topo da tela dependia de alguem chamar `setState`
/// na tela certa, no instante certo. `Loja` chamava (e o comentario dela dizia
/// por que); `Rede` chamava so no ramo de um caractere; `Perto` nao chamava em
/// ramo nenhum -- entao entre a tecla e o fim da espera a barra decidia
/// aparecer ou sumir pelo texto da tecla anterior. Com o termo aplicado no
/// lugar do texto digitado o estado deixa de depender de quem escuta o que: o
/// unico momento em que ele muda e o momento em que a lista muda.
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
class BarraDeListagem extends StatefulWidget {
  const BarraDeListagem({
    required this.total,
    super.key,
    this.busca,
    this.filtro,
    this.ordenacao,
    this.substantivo = const SubstantivoDaListagem(),
    this.buscaAcima = false,
    this.aoAplicar,
  });

  /// Quantos itens o recorte atual tem **no servidor**, e nao quantos vieram
  /// nesta pagina. E o numero que a linha de resumo mostra.
  final int total;

  final ControleDeBusca? busca;
  final ControleDeFiltro? filtro;
  final ControleDeOrdenacao? ordenacao;

  /// Chamado **uma vez**, no `Aplicar` da folha, com o recorte inteiro:
  /// a escolha de cada grupo de filtro e a ordem.
  ///
  /// **Mora aqui, e nao em [ControleDeFiltro] nem em [ControleDeOrdenacao]**,
  /// porque a folha e uma so e o `Aplicar` dela e um so. Um callback em cada
  /// controle daria duas chamadas a rota para um toque, e a segunda chegaria
  /// com a lista da primeira ainda carregando.
  ///
  /// Sem ele o icone da folha **nao nasce**: um controle que abre uma folha
  /// cujo botao nao leva a lugar nenhum e o toque sem desfecho que o criterio
  /// 2 proibe.
  final void Function(EscolhaDaFolha escolha)? aoAplicar;

  /// Como chamar o que esta listado. `Perto` lista `resultado`; `Meus pets`
  /// listaria `pet`.
  final SubstantivoDaListagem substantivo;

  /// O campo de busca foi desenhado pela TELA, acima deste widget, e a barra
  /// nao o desenha de novo.
  ///
  /// Existe por um pedido do cliente de 17/10/2026 sobre a `Rede`: *"coloque o
  /// campo de busca acima do texto e das abas proximos e encerrados"*. As abas
  /// e a linha de reforco da secao ficam **entre** o campo e os dois icones, e
  /// nenhum dos dois pode entrar neste arquivo -- a barra nao sabe o que e uma
  /// aba, e as abas precisam continuar na tela mesmo nos estados em que a
  /// barra nao e desenhada.
  ///
  /// **A barra continua recebendo [busca] mesmo assim**, e nao `null`: e dela
  /// que sai [ControleDeBusca.termoAplicado], e sem o termo a barra sumiria no
  /// exato caso que a secao de lista vazia manda ela ficar -- a pessoa buscou
  /// e nao sobrou nada.
  ///
  /// Quem passa `true` desenha [CampoDeBuscaDaListagem] onde quiser, e decide
  /// se ele aparece com [BarraDeListagem.desenha].
  final bool buscaAcima;

  /// Ha pelo menos um controle com desfecho.
  bool get _temControle => busca != null || _temFolha;

  /// A folha de filtro e ordem tem o que oferecer, e tem para onde mandar.
  bool get _temFolha =>
      aoAplicar != null &&
      ((filtro?.temOpcao ?? false) || (ordenacao?.temEscolha ?? false));

  @override
  State<BarraDeListagem> createState() => _EstadoDaBarraDeListagem();

  /// A pessoa recortou a lista de alguma forma.
  ///
  /// Le o termo **aplicado**, e nao o digitado. Ver a secao "O recorte ativo e
  /// o APLICADO" na prosa desta classe: o texto do controlador era um estado
  /// que este widget nao escutava.
  bool get _recorteAtivo =>
      (filtro?.ativos ?? 0) > 0 ||
      (busca?.termoAplicado?.trim().isNotEmpty ?? false);

  /// Se a barra tem o que desenhar com estes controles.
  ///
  /// Publico e estatico porque a tela que sobe o campo de busca para cima do
  /// proprio conteudo ([buscaAcima]) precisa da **mesma** decisao, e duas
  /// copias dela divergem na primeira edicao.
  static bool desenha({
    required int total,
    ControleDeBusca? busca,
    ControleDeFiltro? filtro,
    ControleDeOrdenacao? ordenacao,
    void Function(EscolhaDaFolha escolha)? aoAplicar,
  }) {
    final barra = BarraDeListagem(
      total: total,
      busca: busca,
      filtro: filtro,
      ordenacao: ordenacao,
      aoAplicar: aoAplicar,
    );
    if (!barra._temControle) return false;
    return total != 0 || barra._recorteAtivo;
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

  /// O nome acessivel do unico controle de recorte, agora na `AppBar`.
  String get _rotuloDaFolha {
    final ordena = ordenacao?.temEscolha ?? false;
    final filtra = filtro?.temOpcao ?? false;
    final verbo = filtra && ordena
        ? 'Filtrar e ordenar'
        : ordena
            ? 'Ordenar'
            : 'Filtrar';
    final ativos = filtro?.ativos ?? 0;
    final estado = <String>[
      if (ativos > 0)
        '$ativos ${ativos == 1 ? 'filtro ativo' : 'filtros ativos'}',
      // A ordem que o leitor de tela ouve e a EFETIVA, pela mesma razao da
      // linha de resumo: a barra nunca anuncia a ordem PEDIDA.
      if (ordena) ordenacao!.rotuloEfetivo,
    ];
    return estado.isEmpty ? verbo : '$verbo, ${estado.join(', ')}';
  }

  Future<void> _abrirFolha(BuildContext context) async {
    await showModalBottomSheet<void>(
      context: context,
      showDragHandle: true,
      isScrollControlled: true,
      useSafeArea: true,
      builder: (_) => _FolhaDeFiltros(
        filtro: filtro,
        ordenacao: ordenacao,
        aoAplicar: aoAplicar!,
      ),
    );
  }
}

class _EstadoDaBarraDeListagem extends State<BarraDeListagem> {
  SlotDaBarraDeListagem? _slot;

  @override
  void didChangeDependencies() {
    super.didChangeDependencies();
    final novo = SlotDaBarraDeListagem.maybeOf(context);
    if (identical(novo, _slot)) return;
    // Trocou de casca (ou achou uma pela primeira vez): o slot antigo nao
    // pode ficar com o controle desta tela pendurado nele.
    _slot?.publicar(null);
    _slot = novo;
  }

  @override
  void dispose() {
    // A lista saiu da tela: o controle da `AppBar` sai junto. Sem isto a
    // barra de topo guardaria um `Filtros` que nao abre mais nada --
    // exatamente o toque sem desfecho que o criterio 2 proibe.
    //
    // **Depois do quadro, e nao aqui dentro** -- a mesma regra que o `build`
    // logo abaixo ja seguia, e que este metodo violava. `dispose` roda com a
    // arvore TRAVADA: mexer no `ValueNotifier` que a casca escuta marca esse
    // ancestral sujo durante a desmontagem, e o Flutter afirma contra isso com
    // `setState() or markNeedsBuild() called when widget tree was locked`.
    //
    // O notificador e da CASCA e vive mais que este estado, entao limpar
    // depois do quadro e seguro; o `try` cobre o unico caso em que ele nao
    // vive mais -- o app inteiro sendo descartado no mesmo quadro --, e ai nao
    // ha barra de topo para limpar.
    final slot = _slot;
    if (slot != null) {
      WidgetsBinding.instance.addPostFrameCallback((_) {
        try {
          slot.publicar(null);
        } on FlutterError {
          // A casca foi embora junto: nao ha o que limpar.
        }
      });
    }
    super.dispose();
  }

  /// O que a `AppBar` desenha agora, ou nulo quando nao ha folha a abrir.
  ///
  /// Nulo tambem quando a barra do corpo nao e desenhada: filtrar o nada e um
  /// toque sem desfecho, e um icone que fica na barra de topo sobre uma lista
  /// vazia e pior do que um que some com ela.
  AcaoDeListagem? _acao(BuildContext context) {
    final b = widget;
    if (!b._temFolha) return null;
    if (b.total == 0 && !b._recorteAtivo) return null;
    final ativos = b.filtro?.ativos ?? 0;
    return AcaoDeListagem(
      rotulo: b._rotuloDaFolha,
      distintivo: ativos == 0 ? null : '$ativos',
      aoTocar: () => b._abrirFolha(context),
    );
  }

  @override
  Widget build(BuildContext context) {
    // **Publicado depois do quadro**, e nao durante: mexer num `ValueNotifier`
    // que um ancestral escuta no meio do proprio `build` marca esse ancestral
    // sujo durante a construcao, que e o erro que o Flutter afirma contra.
    // `AcaoDeListagem` compara por VALOR (e ignora o fecho), entao publicar a
    // cada quadro nao reconstroi a casca -- sem isso isto seria um laco.
    // **O CONTROLE DE RECORTE VOLTOU PARA O CORPO (19/10).**
    //
    // Ele subiu para o slot da `AppBar` em 17/10 e voltou agora, por decisao
    // do cliente: *"qualquer coisa, pense em outro lugar para colocar o filtro
    // da pagina"*. O lugar e a casa original dele -- busca, filtro e ordenacao
    // no topo do CORPO da tela, nunca na barra.
    //
    // A publicacao continua existindo e passou a publicar **sempre nulo**: e
    // ela que garante que nenhuma `AppBar` fique com um `Filtros` pendurado
    // de uma lista que saiu da tela. O mecanismo nao foi arrancado porque ele
    // tambem e a limpeza; o que mudou foi o que ele entrega.
    //
    // O que isso libera: os 64 dp do slot, que e o que faz o sino da barra de
    // topo caber ao lado da foto.
    final acao = _acao(context);
    final slot = _slot;
    if (slot != null) {
      WidgetsBinding.instance.addPostFrameCallback((_) {
        if (mounted) slot.publicar(null);
      });
    }

    final b = widget;
    if (!b._temControle) return const SizedBox.shrink();
    if (b.total == 0 && !b._recorteAtivo) return const SizedBox.shrink();

    final cores = BichuColors.of(context).cores;
    final textos = Theme.of(context).textTheme;
    final aviso = b.ordenacao?.porQueNaoEAPedida;
    final comCampo = b.busca != null && !b.buscaAcima;

    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: <Widget>[
        // **O campo ocupa a largura TOTAL, sempre** (decisao do cliente,
        // 17/10/2026). Ele nao divide mais a linha com icone nenhum: os dois
        // que ficavam aqui viraram um so e subiram para a `AppBar`. Nao ha
        // `Row`, entao nao ha o que encolher -- nem com o teclado aberto, nem
        // em 320 dp.
        if (comCampo) ...<Widget>[
          CampoDeBuscaDaListagem(busca: b.busca!),
          const SizedBox(height: BichuEspaco.e2),
        ],
        // O GATILHO DE FILTRO E ORDEM, no corpo e logo abaixo da busca.
        //
        // **Com rotulo visivel, e nao so o glifo.** Na `AppBar` ele era um
        // icone de 64 dp cujo nome vivia no `tooltip`; aqui ha largura, e um
        // controle que diz o que faz por escrito e melhor para todo mundo --
        // nao so para quem usa leitor de tela. O distintivo de filtros ativos
        // continua no proprio rotulo, pelo `_rotuloDaFolha`, que ja dizia
        // "Filtrar e ordenar, 2 filtros ativos".
        //
        // **Nao e botao de largura total**: o cliente reprovou botao grande
        // ocupando o corpo (18/10). Ele se ajusta ao texto.
        if (acao != null) ...<Widget>[
          Align(
            alignment: Alignment.centerLeft,
            child: GatilhoDeRecorteNoCorpo(acao: acao),
          ),
          const SizedBox(height: BichuEspaco.e3),
        ],
        Text(
          b._resumo,
          style: textos.bodySmall?.copyWith(color: cores.textSecondary),
        ),
        if (aviso != null) ...<Widget>[
          const SizedBox(height: BichuEspaco.e3),
          _FaixaDaOrdem(ordenacao: b.ordenacao!),
        ],
        if (comCampo && b.busca?.avisoDeAlcance != null) ...<Widget>[
          const SizedBox(height: BichuEspaco.e2),
          Text(
            b.busca!.avisoDeAlcance!,
            style: textos.bodySmall?.copyWith(color: cores.textSecondary),
          ),
        ],
        const SizedBox(height: BichuEspaco.e4),
      ],
    );
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
    required this.aoAplicar,
    required this.alcance,
    required this.termoAplicado,
    this.rotulo = 'Buscar',
    this.minimoDeCaracteres = 1,
  });

  final TextEditingController controlador;

  /// Chamado **so** quando a pessoa pede a busca: a lupa dentro do campo ou a
  /// tecla de busca do teclado.
  ///
  /// Recebe o termo ja sem espaco nas pontas, ou `null` quando o campo ficou
  /// vazio -- e `null` significa "volte para a lista inteira", nunca "nao
  /// mexer".
  final ValueChanged<String?> aoAplicar;

  final AlcanceDaBusca alcance;

  /// O termo que **produziu** a lista que esta na tela agora, ou nulo.
  ///
  /// E o unico estado de busca que o componente le para decidir qualquer
  /// coisa. O texto do controlador e intencao, e intencao nao recorta lista.
  final String? termoAplicado;

  /// O nome do campo. Vai na **dica dentro do campo** e no nome acessivel.
  ///
  /// **O rotulo visivel acima do campo saiu** por pedido do cliente de
  /// 17/10/2026: *"Tire o texto do app buscar encontro (opcional), coloque o
  /// texto no placeholder do campo buscar"*. Ele continua existindo como nome
  /// acessivel -- ver [BichuField.rotuloVisivel], onde esta a razao.
  final String rotulo;

  /// Quantas letras a rota exige antes de aceitar o termo.
  ///
  /// `minLength: 2` da `Rede` e da `Loja`, e o piso de trigrama de `Perto`,
  /// deixavam cada tela decidir sozinha o que fazer com uma letra: uma
  /// chamava `setState` e engolia, outra mandava e tomava 400. Aqui ele vira
  /// estado do controle: abaixo do piso a lupa **nao habilita**, e o nome
  /// acessivel dela diz quantas letras faltam.
  final int minimoDeCaracteres;

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

/// O que a folha devolve no `Aplicar`: o recorte inteiro, de uma vez.
class EscolhaDaFolha {
  const EscolhaDaFolha({required this.filtros, this.ordem});

  /// A chave de cada grupo DECLARADO para o codigo escolhido, ou `null` para
  /// "qualquer um". Grupo que a tela nao declarou nao aparece aqui, e quem
  /// recebe nao deve apaga-lo do recorte por ausencia.
  final Map<String, String?> filtros;

  /// A ordem pedida, ou nulo quando a listagem nao oferece escolha de ordem.
  ///
  /// Uma lista sempre esta em ALGUMA ordem: este campo so e nulo quando nao ha
  /// o que escolher, e nunca significa "sem ordem".
  final String? ordem;
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
    this.dependeDe,
  });

  /// O identificador que volta em [ControleDeFiltro.aoAplicar].
  final String chave;

  final String titulo;
  final List<OpcaoDeRecorte> opcoes;

  /// O codigo **aplicado**, ou nulo para "qualquer um".
  final String? selecionado;

  /// Uma linha de explicacao sob o titulo. `Perto` usa para dizer que o nivel
  /// de verificacao e **piso e nao igualdade**, que e a regra do contrato que
  /// ninguem adivinha olhando a lista.
  final String? nota;

  /// A chave do grupo de quem as opcoes deste dependem, quando ha um.
  ///
  /// A `Loja` tem o caso: as subcategorias sao as **da categoria escolhida**.
  /// Com a escolha virando pendente, trocar a categoria na folha deixaria uma
  /// subcategoria da categoria anterior marcada, e o par iria para a rota
  /// junto -- recorte que item nenhum satisfaz, e a lista voltaria vazia sem a
  /// pessoa entender por que. Declarado aqui, a folha solta a escolha
  /// pendente deste grupo (e para de desenha-lo) no instante em que a do pai
  /// muda.
  final String? dependeDe;
}

/// Os grupos de filtro da folha.
///
/// **Nao carrega callback.** Quem aplica e a folha inteira, por
/// [BarraDeListagem.aoAplicar]: um callback por grupo era o que havia antes, e
/// com ele cada toque numa pastilha fechava a folha e recarregava a lista --
/// que e exatamente a aplicacao automatica que o cliente recusou.
class ControleDeFiltro {
  const ControleDeFiltro({required this.grupos});

  final List<GrupoDeFiltro> grupos;

  int get ativos => grupos.where((g) => g.selecionado != null).length;

  /// Ha pelo menos um grupo com opcao. Sem isto o icone nao nasce.
  bool get temOpcao => grupos.any((g) => g.opcoes.isNotEmpty);
}

/// A ordem da lista, e as ordens que a rota aceita.
///
/// **Nao carrega callback**, pela mesma razao de [ControleDeFiltro]: desde
/// 17/10/2026 a ordem mora DENTRO da folha de filtros e sai no mesmo
/// `Aplicar`.
class ControleDeOrdenacao {
  const ControleDeOrdenacao({
    required this.opcoes,
    required this.efetiva,
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

/// O campo de busca da listagem, com a lupa que APLICA o termo.
///
/// Publico porque a `Rede` o desenha fora da barra, acima do reforco da secao
/// e das abas (ver [BarraDeListagem.buscaAcima]). Quem o desenha fora continua
/// passando o mesmo [ControleDeBusca] a barra, e decide se ele aparece com
/// [BarraDeListagem.desenha].
class CampoDeBuscaDaListagem extends StatelessWidget {
  const CampoDeBuscaDaListagem({required this.busca, super.key});

  final ControleDeBusca busca;

  /// O termo digitado agora, sem espaco nas pontas.
  String get _digitado => busca.controlador.text.trim();

  /// O que a lupa manda: nulo quando o campo ficou vazio.
  String? get _aAplicar => _digitado.isEmpty ? null : _digitado;

  /// Ha termo digitado diferente do aplicado, e ele pode ir.
  ///
  /// Campo vazio sempre pode ir quando ha termo aplicado: limpar a busca e o
  /// caminho de volta para a lista inteira, e o piso de caracteres da rota
  /// nao vale para ele.
  bool get _podeAplicar {
    if (_aAplicar == busca.termoAplicado) return false;
    if (_aAplicar == null) return true;
    return _digitado.length >= busca.minimoDeCaracteres;
  }

  @override
  Widget build(BuildContext context) {
    return ValueListenableBuilder<TextEditingValue>(
      // **O componente escuta o controlador.** Sem isto a lupa habilitaria
      // uma tecla atrasada, que e a mesma classe de defeito que o termo
      // aplicado tirou de `_recorteAtivo`.
      valueListenable: busca.controlador,
      builder: (context, _, _) {
        return BichuField(
          rotulo: busca.rotulo,
          rotuloVisivel: false,
          controlador: busca.controlador,
          exemplo: busca.rotulo,
          aoMudar: null,
          aoEnviar: (_) {
            if (_podeAplicar) busca.aoAplicar(_aAplicar);
          },
          acaoDeTeclado: TextInputAction.search,
          correcaoAutomatica: false,
          sufixo: _LupaQueAplica(
            habilitada: _podeAplicar,
            rotulo: _rotuloDaLupa,
            aoTocar: () => busca.aoAplicar(_aAplicar),
          ),
        );
      },
    );
  }

  /// O nome acessivel da lupa, que carrega o ESTADO e nao so o verbo.
  ///
  /// Quem usa leitor de tela nao ve o botao apagado: ouvir "Buscar" e nao
  /// acontecer nada e o toque sem desfecho que este projeto persegue, e por
  /// isso o motivo entra no nome.
  String get _rotuloDaLupa {
    if (_podeAplicar) return 'Buscar';
    if (_aAplicar == null) return 'Buscar, nada digitado';
    if (_aAplicar == busca.termoAplicado) return 'Buscar, a busca já é esta';
    final faltam = busca.minimoDeCaracteres - _digitado.length;
    return 'Buscar, faltam $faltam ${faltam == 1 ? 'letra' : 'letras'}';
  }
}

/// A lupa dentro do campo. Desabilitada quando nao ha o que aplicar.
class _LupaQueAplica extends StatelessWidget {
  const _LupaQueAplica({
    required this.habilitada,
    required this.rotulo,
    required this.aoTocar,
  });

  final bool habilitada;
  final String rotulo;
  final VoidCallback aoTocar;

  @override
  Widget build(BuildContext context) {
    final cores = BichuColors.of(context).cores;
    return SizedBox(
      width: BichuAlvoDeToque.min,
      height: BichuAlvoDeToque.min,
      child: IconButton(
        onPressed: habilitada ? aoTocar : null,
        tooltip: rotulo,
        icon: Icon(
          Icons.search,
          color: habilitada ? cores.textPrimary : cores.textMuted,
        ),
      ),
    );
  }
}

/// O controle que a listagem publica no slot unico da `AppBar`.
///
/// **Compara por VALOR, e o fecho fica de fora da comparacao** ([aoTocar] e
/// recriado a cada `build` da listagem). Sem isto, publicar a cada quadro
/// trocaria o valor do notificador a cada quadro, a casca reconstruiria, a
/// listagem publicaria de novo -- e o laco nao pararia.
@immutable
class AcaoDeListagem {
  const AcaoDeListagem({
    required this.rotulo,
    required this.aoTocar,
    this.distintivo,
  });

  /// O nome acessivel, com o ESTADO dentro: quem usa leitor de tela nao ve o
  /// distintivo com o numero.
  final String rotulo;

  final VoidCallback aoTocar;

  /// O numero de filtros ativos, ou nulo quando nao ha nenhum.
  final String? distintivo;

  @override
  bool operator ==(Object other) =>
      other is AcaoDeListagem &&
      other.rotulo == rotulo &&
      other.distintivo == distintivo;

  @override
  int get hashCode => Object.hash(rotulo, distintivo);
}

/// O canal entre a listagem (que tem o estado) e a casca (que tem a `AppBar`).
///
/// A listagem publica o controle; a casca o desenha no slot unico da direita.
/// `null` quer dizer "nao ha o que desenhar", e e o estado em que a casca
/// passa `actions: null` -- e nao uma lista com um widget vazio dentro, que
/// deixaria o portao da gaveta achar uma acao onde nao ha nenhuma.
class SlotDaBarraDeListagem extends InheritedWidget {
  const SlotDaBarraDeListagem({
    required this.acao,
    required super.child,
    super.key,
  });

  final ValueNotifier<AcaoDeListagem?> acao;

  static SlotDaBarraDeListagem? maybeOf(BuildContext context) =>
      context.dependOnInheritedWidgetOfExactType<SlotDaBarraDeListagem>();

  /// Publica (ou apaga) o controle, **sem reconstruir por valor igual**.
  void publicar(AcaoDeListagem? nova) {
    if (acao.value == nova) return;
    acao.value = nova;
  }

  @override
  bool updateShouldNotify(SlotDaBarraDeListagem antigo) =>
      antigo.acao != acao;
}

/// Um icone de 64 x 64 que abre a folha, com nome acessivel obrigatorio.
///
/// 64 e nao 48: este e o slot unico de acao da `AppBar`, e o 11.23.1 fixa os
/// dois alvos da barra de topo em 64 x 64. Enquanto ele morou no corpo, ao
/// lado do campo de busca, 48 era a medida certa -- tres alvos de 64 lado a
/// lado com o campo nao cabiam em 320 dp. Nao ha mais tres, e nao ha mais
/// corpo.
///
/// `rotulo` e `aoTocar` sao exigidos: um `IconButton` sem rotulo e anunciado
/// como "botão" e nada mais (SC 4.1.2), e um com `onPressed: null` e o
/// controle mudo que o criterio 2 proibe.
/// O gatilho de filtro e ordem, **no corpo da tela**.
///
/// Ele existe desde 19/10, quando o cliente mandou o filtro sair da barra de
/// topo: *"qualquer coisa, pense em outro lugar para colocar o filtro da
/// pagina"*. O lugar e a casa original dele -- busca, filtro e ordenacao no
/// topo do corpo --, e a saida da barra foi o que liberou os 64 dp de que o
/// sino precisava.
///
/// **Ele nao substitui [BotaoDeAcaoDaListagem], que continua existindo** para
/// a tela que ainda quiser um controle de canto; o que mudou e quem a
/// `BarraDeListagem` desenha por padrao.
///
/// O rotulo vem de `AcaoDeListagem.rotulo`, que ja carrega o estado por
/// extenso ("Filtrar e ordenar, 2 filtros ativos"): no corpo ha largura para
/// ele ser PINTADO, e nao so anunciado no `tooltip`. Um controle que diz o que
/// faz por escrito e melhor para todo mundo, e nao so para quem nao ve.
class GatilhoDeRecorteNoCorpo extends StatelessWidget {
  const GatilhoDeRecorteNoCorpo({required this.acao, super.key});

  final AcaoDeListagem acao;

  @override
  Widget build(BuildContext context) {
    final distintivo = acao.distintivo;

    return OutlinedButton.icon(
      onPressed: acao.aoTocar,
      icon: const Icon(Icons.tune),
      // O alvo de 48 dp do SC 2.5.8. Nao e o piso critico de 64 da barra de
      // topo: ali o controle disputa a borda com o titulo e com o polegar que
      // segura o aparelho; aqui ele esta no corpo, com folga em volta.
      style: OutlinedButton.styleFrom(
        minimumSize: const Size(0, BichuAlvoDeToque.min),
      ),
      // **O rotulo pintado e curto; o longo e o nome acessivel.** Pintar
      // "Filtrar e ordenar, 2 filtros ativos" encheria a linha, entao o
      // numero aparece entre parenteses e a frase inteira vai para o
      // `tooltip` -- que e como este app sempre declarou nome acessivel de
      // controle (o gatilho da gaveta e a foto da conta fazem igual), e e por
      // isso que os portoes o procuram por `byTooltip`.
      //
      // `ExcludeSemantics` no texto pintado: sem ele o leitor de tela
      // anunciaria "Filtrar (2)" e depois a frase inteira, dois nomes para o
      // mesmo controle.
      label: Tooltip(
        message: acao.rotulo,
        child: ExcludeSemantics(
          child: Text(
            distintivo == null ? _verbo : '$_verbo ($distintivo)',
          ),
        ),
      ),
    );
  }

  /// A primeira palavra do rotulo longo: `Filtrar`, `Ordenar` ou
  /// `Filtrar e ordenar`. Sai do mesmo texto, para nao haver duas verdades.
  String get _verbo => acao.rotulo.split(',').first;
}

class BotaoDeAcaoDaListagem extends StatelessWidget {
  const BotaoDeAcaoDaListagem({required this.acao, super.key});

  final AcaoDeListagem acao;

  @override
  Widget build(BuildContext context) {
    final cores = BichuColors.of(context).cores;
    final textos = Theme.of(context).textTheme;
    final icone = Icons.tune;
    final rotulo = acao.rotulo;
    final distintivo = acao.distintivo;
    final aoTocar = acao.aoTocar;

    return SizedBox(
      width: BichuAlvoDeToque.critico,
      height: BichuAlvoDeToque.critico,
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
                    distintivo,
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

/// A folha de filtro E ordem, que guarda a escolha PENDENTE e so aplica no
/// botao.
///
/// Ela e `Stateful` por isso: a escolha vive aqui, em [_pendente] e
/// [_ordemPendente], ate o `Aplicar`. Enquanto a folha esta aberta a tela nao
/// e chamada nenhuma vez, e a lista atras dela continua sendo a lista do
/// recorte anterior -- que e o desenho pedido, e nao um atraso.
class _FolhaDeFiltros extends StatefulWidget {
  const _FolhaDeFiltros({
    required this.aoAplicar,
    this.filtro,
    this.ordenacao,
  });

  final ControleDeFiltro? filtro;
  final ControleDeOrdenacao? ordenacao;
  final void Function(EscolhaDaFolha escolha) aoAplicar;

  static const String rotuloDeAplicar = 'Aplicar';
  static const String rotuloDeLimpar = 'Limpar';
  static const String tituloDaOrdem = 'Ordenar por';

  List<GrupoDeFiltro> get grupos =>
      filtro?.grupos ?? const <GrupoDeFiltro>[];

  /// A folha ordena quando ha mais de uma ordem para escolher.
  bool get ordena => ordenacao?.temEscolha ?? false;

  @override
  State<_FolhaDeFiltros> createState() => _EstadoDaFolhaDeFiltros();
}

class _EstadoDaFolhaDeFiltros extends State<_FolhaDeFiltros> {
  /// A escolha de cada grupo declarado, como ela esta **nesta folha**.
  late final Map<String, String?> _pendente = <String, String?>{
    for (final g in widget.grupos) g.chave: g.selecionado,
  };

  /// A ordem escolhida nesta folha. Comeca na EFETIVA, e nao na pedida: a
  /// folha nao pinta marcada uma ordem em que a lista nao esta.
  late String? _ordemPendente = widget.ordenacao?.efetiva;

  /// O que esta aplicado na lista agora.
  Map<String, String?> get _aplicado => <String, String?>{
        for (final g in widget.grupos) g.chave: g.selecionado,
      };

  /// Ha diferenca entre o que a folha mostra e o que a lista tem.
  ///
  /// **E este booleano que habilita o `Aplicar`**, e e so ele que avisa que ha
  /// mudanca pendente: o cliente pediu o botao habilitado e nenhum selo.
  bool get _mudou {
    final aplicado = _aplicado;
    if (_pendente.keys.any((c) => _pendente[c] != aplicado[c])) return true;
    return _ordemPendente != widget.ordenacao?.efetiva;
  }

  /// Ha algum FILTRO pendente para o `Limpar` tirar. A ordem nao entra: uma
  /// lista sempre esta em alguma ordem.
  bool get _temEscolha => _pendente.values.any((v) => v != null);

  /// Os grupos desenhados: com opcao, e com o pai ainda no valor aplicado.
  List<GrupoDeFiltro> get _visiveis {
    final aplicado = _aplicado;
    return widget.grupos.where((g) {
      if (g.opcoes.isEmpty) return false;
      final pai = g.dependeDe;
      // Grupo dependente de um pai que a folha acabou de mexer: as opcoes
      // desenhadas sao as do valor APLICADO do pai, e nao as do pendente.
      // Desenha-las sobre outro pai ofereceria a escolha errada.
      if (pai != null && _pendente[pai] != aplicado[pai]) return false;
      return true;
    }).toList(growable: false);
  }

  void _escolher(GrupoDeFiltro grupo, String? codigo) {
    setState(() {
      _pendente[grupo.chave] = codigo;
      // Mexer no pai solta o filho: a escolha guardada pertencia ao pai
      // anterior (ver `GrupoDeFiltro.dependeDe`).
      for (final g in widget.grupos) {
        if (g.dependeDe == grupo.chave) _pendente[g.chave] = null;
      }
    });
  }

  void _aplicar() {
    final escolha = EscolhaDaFolha(
      filtros: Map<String, String?>.unmodifiable(_pendente),
      ordem: widget.ordena ? _ordemPendente : null,
    );
    Navigator.of(context).pop();
    widget.aoAplicar(escolha);
  }

  @override
  Widget build(BuildContext context) {
    final textos = Theme.of(context).textTheme;
    final cores = BichuColors.of(context).cores;
    final visiveis = _visiveis;
    final ordenacao = widget.ordenacao;

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
                    for (final grupo in visiveis) ...<Widget>[
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
                              marcada: _pendente[grupo.chave] == opcao.codigo,
                              // Tocar no que ja esta marcado **desmarca**. Sem
                              // isso o unico jeito de voltar a "qualquer um"
                              // seria limpar tudo.
                              aoTocar: () => _escolher(
                                grupo,
                                _pendente[grupo.chave] == opcao.codigo
                                    ? null
                                    : opcao.codigo,
                              ),
                            ),
                        ],
                      ),
                      const SizedBox(height: BichuEspaco.e6),
                    ],
                    // A ORDEM, na mesma folha (pedido do cliente de 17/10).
                    // Ela vem por ULTIMO: os filtros decidem o que entra na
                    // lista, e a ordem so arruma o que sobrou.
                    if (widget.ordena && ordenacao != null) ...<Widget>[
                      Text(
                        _FolhaDeFiltros.tituloDaOrdem,
                        style: textos.titleMedium,
                      ),
                      if (ordenacao.nota != null) ...<Widget>[
                        const SizedBox(height: BichuEspaco.e1),
                        Text(
                          ordenacao.nota!,
                          style: textos.bodySmall
                              ?.copyWith(color: cores.textSecondary),
                        ),
                      ],
                      const SizedBox(height: BichuEspaco.e2),
                      Wrap(
                        spacing: BichuEspaco.e2,
                        runSpacing: BichuEspaco.e2,
                        children: <Widget>[
                          for (final opcao in ordenacao.opcoes)
                            _Pastilha(
                              rotulo: opcao.rotulo,
                              marcada: _ordemPendente == opcao.codigo,
                              // **A ordem nao se desmarca.** Tocar na marcada
                              // nao a tira: a lista sempre esta em alguma
                              // ordem, e "nenhuma" nao e um estado possivel.
                              aoTocar: () => setState(
                                () => _ordemPendente = opcao.codigo,
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
            // **`Limpar` mexe na folha, e nao na lista.** Ele desmarca os
            // filtros e o `Aplicar` continua sendo o unico caminho com efeito:
            // duas formas de recortar a lista a partir da mesma folha era o
            // que havia antes, e uma delas aplicava sozinha. A ordem nao e
            // tocada.
            if (_temEscolha)
              TextButton(
                onPressed: () => setState(
                  () => _pendente.updateAll((_, _) => null),
                ),
                child: const Text(_FolhaDeFiltros.rotuloDeLimpar),
              ),
            const SizedBox(height: BichuEspaco.e2),
            BotaoPrimario(
              rotulo: _FolhaDeFiltros.rotuloDeAplicar,
              aoTocar: _mudou ? _aplicar : null,
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
