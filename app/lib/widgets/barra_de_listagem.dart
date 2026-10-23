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
  /// Quem passa `true` desenha [LinhaDeBuscaDaListagem] onde quiser, e decide
  /// se ela aparece com [BarraDeListagem.desenha].
  ///
  /// **Desde 18/10/2026 isto leva o GATILHO embora junto com o campo.** Os
  /// dois viraram uma linha so por pedido do cliente (*"colocar na frente do
  /// campo de busca e nao embaixo"*), e a linha nao pode se partir entre dois
  /// lugares da tela: com `true`, a barra nao desenha mais o gatilho.
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

/// Abre a folha de filtro e ordem **sem a barra**.
///
/// ## Por que ela é pública, e quando usar
///
/// A barra só se desenha quando há lista (`BarraDeListagem.desenha` responde
/// falso com `total: 0` e nenhum recorte aplicado), e essa regra está certa: o
/// controle de recorte sobre o nada é controle sem desfecho.
///
/// Há um caso em que ela deixa de valer, e ele nasceu com a listagem pública de
/// perdidos: quando a folha tem um [CampoDeTextoDoFiltro] **obrigatório**, ela
/// não é o que recorta a lista — ela é o que FAZ a lista existir. O visitante
/// sem conta não tem cidade, a rota não é chamada, `total` é zero, a barra não
/// nasce, e sem esta função ele leria a linha única sem caminho nenhum para
/// sair dela. Esse é o beco que o critério 2 da BICHUS-62 proíbe.
///
/// Quem chama desenha o próprio controle (um botão, no corpo) e passa os mesmos
/// três objetos que daria à barra. **A folha é a mesma**, e isso é o ponto: uma
/// segunda folha divergiria da primeira na primeira edição.
Future<void> abrirFolhaDeFiltros(
  BuildContext context, {
  required void Function(EscolhaDaFolha escolha) aoAplicar,
  ControleDeFiltro? filtro,
  ControleDeOrdenacao? ordenacao,
}) {
  return showModalBottomSheet<void>(
    context: context,
    showDragHandle: true,
    isScrollControlled: true,
    useSafeArea: true,
    builder: (_) => _FolhaDeFiltros(
      filtro: filtro,
      ordenacao: ordenacao,
      aoAplicar: aoAplicar,
    ),
  );
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
    return acaoDeRecorte(
      context,
      total: b.total,
      busca: b.busca,
      filtro: b.filtro,
      ordenacao: b.ordenacao,
      aoAplicar: b.aoAplicar,
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
        // A LINHA DE BUSCA: **o gatilho de recorte NA FRENTE do campo**, na
        // mesma linha (decisao do cliente, 18/10/2026): *"os campos de filtro
        // nao devem vir com o texto, apenas com o icone, e colocar na frente
        // do campo de busca e nao embaixo"*.
        //
        // Isto REVERTE duas coisas de 17 e 19/10, e as duas reversoes sao
        // dele: o campo em largura TOTAL (ele agora divide a linha com um
        // alvo de 48 dp) e o gatilho com rotulo pintado logo ABAIXO da busca
        // (ele agora e so o glifo, e vem antes). Quem ler isto em tres meses:
        // nenhuma das reversoes e defeito.
        //
        // Quem desenha a linha e [LinhaDeBuscaDaListagem], e nao esta `Row`
        // direto, porque a `Rede` e a listagem publica de perdidos a desenham
        // FORA da barra ([buscaAcima]) e precisam da MESMA linha.
        if (comCampo)
          LinhaDeBuscaDaListagem(
            total: b.total,
            busca: b.busca!,
            filtro: b.filtro,
            ordenacao: b.ordenacao,
            aoAplicar: b.aoAplicar,
          ),
        // **SEM CAMPO AQUI, o gatilho fica sozinho e continua no corpo.**
        //
        // Com [buscaAcima] a tela ja desenhou a linha inteira (campo mais
        // gatilho) acima de si, e repetir o gatilho aqui o faria aparecer
        // duas vezes. Sem busca nenhuma, nao ha linha a dividir: o gatilho e
        // o unico controle, e ele se alinha a esquerda.
        if (!comCampo && !b.buscaAcima && acao != null)
          Align(
            alignment: Alignment.centerLeft,
            child: GatilhoDeRecorteNoCorpo(acao: acao),
          ),
        if (comCampo || (!b.buscaAcima && acao != null))
          const SizedBox(height: BichuEspaco.e3),
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

  /// Quantas letras faltam para o piso, **na redacao de UM lugar so**.
  ///
  /// Nulo quando nao falta nenhuma, e **nulo tambem com campo vazio**: "faltam
  /// 3 letras" sobre campo em branco seria cobrar quem ainda nao comecou.
  ///
  /// Existe publico porque DOIS desenhos dizem a mesma contagem: o nome
  /// acessivel da lupa aqui dentro, e o vazio que `BuscaDePessoas` desenha
  /// abaixo do piso. Duas copias da frase divergem no dia em que alguem mexer
  /// numa delas -- e quem le o produto veria a tela e o leitor de tela
  /// contando letras diferentes.
  String? get faltamLetras {
    final digitado = controlador.text.trim();
    if (digitado.isEmpty) return null;
    final faltam = minimoDeCaracteres - digitado.length;
    if (faltam <= 0) return null;
    return 'faltam $faltam ${faltam == 1 ? 'letra' : 'letras'}';
  }

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
    this.codigoPadrao,
  });

  /// O identificador que volta em [ControleDeFiltro.aoAplicar].
  final String chave;

  final String titulo;
  final List<OpcaoDeRecorte> opcoes;

  /// O codigo **aplicado**, ou nulo para "qualquer um".
  final String? selecionado;

  /// O codigo que E a ausencia de recorte, quando o grupo tem um.
  ///
  /// ## Por que ele existe (19/10/2026)
  ///
  /// Quase todo grupo desta folha expressa "nenhum recorte" por
  /// `selecionado: null`, e nada mais e preciso. **O grupo `Quando` da `Rede`
  /// nao consegue:** a lista esta SEMPRE numa janela de tempo -- ela e a
  /// agenda do que vem, ou a dos encerrados --, e `null` significaria "janela
  /// nenhuma", que nao e um estado que a rota tenha.
  ///
  /// Quando as tres abas da agenda viraram filtro, `Próximos` passou a ser uma
  /// opcao do grupo, e marca-la por padrao -- que e a verdade da lista --
  /// fazia [ControleDeFiltro.ativos] contar **1**. As consequencias foram
  /// MEDIDAS numa agenda vazia e sem recorte nenhum:
  ///
  ///   - o distintivo da barra nascia com `1` sobre uma lista que ninguem
  ///     filtrou;
  ///   - `_recorteAtivo` virava verdadeiro, a barra passava a ser desenhada
  ///     sobre a lista vazia, e o estado vazio trocava de frase: em vez de
  ///     *"A Rede ainda nao tem eventos"* a tela dizia *"Nenhum evento com
  ///     esses filtros"* e oferecia `Limpar filtro` -- um botao que nao tinha
  ///     o que limpar.
  ///
  /// Com [codigoPadrao], a pastilha da verdade da lista fica MARCADA e **nao
  /// conta como recorte**. Quem desmarca volta ao mesmo lugar, e o distintivo
  /// so acende quando ha recorte de verdade.
  ///
  /// **Nulo nos outros grupos, e eles nao mudam uma linha:** sem padrao
  /// declarado, `selecionado != null` continua sendo a conta inteira.
  final String? codigoPadrao;

  /// Se a escolha atual deste grupo e um recorte DE VERDADE.
  bool get recortaDeFato =>
      selecionado != null && selecionado != codigoPadrao;

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

/// Um recorte que a pessoa **digita**, e nao escolhe de uma lista.
///
/// ## Por que ele existe, e por que so agora
///
/// Toda a folha era de lista fechada, e isso cobria `Perto`, a `Loja` e a
/// `Rede`: as opcoes delas sao codigos do contrato, e uma lista fechada e a
/// forma certa de oferecer codigo. A listagem publica de perdidos trouxe o
/// primeiro recorte que **nao tem lista**: `city` e obrigatoria no contrato e
/// o aplicativo nao tem de onde tirar uma lista de cidades -- nao ha operacao
/// que as devolva, nao ha geocodificacao (ADR-0006) e montar a lista a partir
/// dos casos que voltaram ofereceria um recorte diferente a cada pagina.
///
/// Deslogado, este campo e a **unica** fonte de cidade: sem ele a rota nao e
/// chamada, e a secao em que o aplicativo abre fica vazia para quem nao tem
/// conta -- que e exatamente quem a vizinhanca precisa que veja a lista.
///
/// ## Ele obedece as mesmas duas regras da folha
///
/// 1. **Nada se aplica sozinho.** Digitar nao chama a rota; o `Aplicar` manda,
///    junto com as pastilhas, numa chamada so. Por isso o valor digitado mora
///    no estado da folha e nao num `TextEditingController` de quem chama.
/// 2. **O botao habilitado E o aviso de pendencia.** Nao ha selo e nao ha
///    faixa; com [obrigatorio] vazio o `Aplicar` nasce desabilitado e o texto
///    de [textoDeValidacao] aparece sob o campo.
///
/// O valor volta em [EscolhaDaFolha.filtros], na mesma chave: para quem recebe
/// a escolha, texto digitado e pastilha escolhida sao a mesma coisa.
class CampoDeTextoDoFiltro {
  const CampoDeTextoDoFiltro({
    required this.chave,
    required this.rotulo,
    required this.valor,
    this.obrigatorio = false,
    this.textoDeValidacao,
    this.limite,
    this.minimoDeCaracteres = 2,
    this.exemplo,
  });

  /// O identificador que volta em [EscolhaDaFolha.filtros].
  final String chave;

  /// O rotulo, que e tambem o **nome acessivel** do campo: `BichuField` o
  /// publica com `rotuloVisivel`, e campo com dica e sem rotulo e campo mudo.
  final String rotulo;

  /// O valor **aplicado** na lista agora. Nulo quando nao ha.
  final String? valor;

  /// A lista nao existe sem este recorte. Vazio desabilita o `Aplicar`.
  final bool obrigatorio;

  /// A unica linha de texto que este campo mostra alem do rotulo, e so quando
  /// o valor nao serve. **Nao e texto de apoio**: o cliente mandou remover os
  /// de apoio em 18/10/2026, e mensagem de validacao nao e um deles.
  final String? textoDeValidacao;

  /// O teto de caracteres, que e o do contrato e nao uma escolha da tela.
  final int? limite;

  /// O piso que o valor precisa alcancar para o `Aplicar` habilitar.
  final int minimoDeCaracteres;

  /// A dica DENTRO do campo (`BichuField.exemplo`).
  final String? exemplo;

  /// O valor serve para ir a rota.
  bool serve(String digitado) {
    final limpo = digitado.trim();
    if (limpo.isEmpty) return !obrigatorio;
    return limpo.length >= minimoDeCaracteres;
  }
}

/// Os grupos de filtro da folha.
///
/// **Nao carrega callback.** Quem aplica e a folha inteira, por
/// [BarraDeListagem.aoAplicar]: um callback por grupo era o que havia antes, e
/// com ele cada toque numa pastilha fechava a folha e recarregava a lista --
/// que e exatamente a aplicacao automatica que o cliente recusou.
class ControleDeFiltro {
  const ControleDeFiltro({
    required this.grupos,
    this.campos = const <CampoDeTextoDoFiltro>[],
  });

  final List<GrupoDeFiltro> grupos;

  /// Os recortes que a pessoa DIGITA. Vazio nas tres telas que existiam antes
  /// deles, e por isso o parametro tem padrao: nenhuma delas muda uma linha.
  final List<CampoDeTextoDoFiltro> campos;

  /// **O campo obrigatorio NAO conta como filtro ativo.** Ele e a pergunta que
  /// a rota exige para responder qualquer coisa, e nao um recorte que a pessoa
  /// escolheu: contado, o distintivo da barra nasceria com `1` numa lista que
  /// ninguem filtrou.
  int get ativos =>
      grupos.where((g) => g.recortaDeFato).length +
      campos
          .where((c) =>
              !c.obrigatorio && (c.valor?.trim().isNotEmpty ?? false))
          .length;

  /// Ha pelo menos um grupo com opcao, ou um campo para digitar. Sem isto o
  /// icone nao nasce.
  bool get temOpcao =>
      grupos.any((g) => g.opcoes.isNotEmpty) || campos.isNotEmpty;
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
    // **A contagem vem de [ControleDeBusca.faltamLetras], e nao de uma conta
    // feita aqui.** O texto renderizado nao mudou nesta troca -- as iscas de
    // `loja_com_dados`, `agenda_da_rede`, `barra_de_listagem_aplica` e
    // `busca_de_pessoas` continuam esperando `Buscar, faltam 1 letra` --, e o
    // que mudou e haver um dono da frase.
    final faltam = busca.faltamLetras;
    if (faltam != null) return 'Buscar, $faltam';
    // Inalcancavel: os tres ramos acima cobrem todo caso em que a lupa nao
    // aplica. Existe porque [ControleDeBusca.faltamLetras] e anulavel por
    // construcao, e 'Buscar, null' seria pior que o verbo sozinho.
    return 'Buscar';
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
/// **SO O ICONE, SEM ROTULO PINTADO, E NA FRENTE DA BUSCA (18/10/2026).**
///
/// Pedido literal do cliente: *"os campos de filtro nao devem vir com o texto,
/// apenas com o icone, e colocar na frente do campo de busca e nao embaixo"*.
/// Isto REVERTE o rotulo pintado que este gatilho tinha desde 19/10, e a
/// reversao e dele.
///
/// O nome acessivel nao se perdeu com o texto: ele vive no `tooltip`, que e
/// como este app sempre declarou nome de controle de icone (o gatilho da
/// gaveta e a foto da conta fazem igual), e e por isso que os portoes o
/// procuram por `byTooltip`. O rotulo longo continua carregando o estado por
/// extenso ("Filtrar e ordenar, 2 filtros ativos"), e agora ele e a UNICA
/// forma de o estado ser anunciado -- por isso o distintivo com o numero
/// continua pintado sobre o glifo, para quem ve.
///
/// A medida e **48 x 48**, quadrada: o piso do SC 2.5.8, e o mesmo do campo de
/// busca ao lado. Nao e o piso critico de 64 da barra de topo -- ali o
/// controle disputa a borda com o titulo e com o polegar que segura o
/// aparelho; aqui ele esta no corpo, com folga em volta.
class GatilhoDeRecorteNoCorpo extends StatelessWidget {
  const GatilhoDeRecorteNoCorpo({required this.acao, super.key});

  final AcaoDeListagem acao;

  @override
  Widget build(BuildContext context) {
    final cores = BichuColors.of(context).cores;
    final textos = Theme.of(context).textTheme;
    final distintivo = acao.distintivo;

    return Tooltip(
      message: acao.rotulo,
      child: OutlinedButton(
        onPressed: acao.aoTocar,
        // Quadrado e TRAVADO em 48: sem `fixedSize` o `OutlinedButton` herda
        // a largura minima de 64 dp do tema e rouba 16 dp da busca.
        // `padding: zero` porque nao ha mais texto para afastar da borda.
        style: OutlinedButton.styleFrom(
          minimumSize: const Size.square(BichuAlvoDeToque.min),
          fixedSize: const Size.square(BichuAlvoDeToque.min),
          padding: EdgeInsets.zero,
        ),
        child: Stack(
          clipBehavior: Clip.none,
          children: <Widget>[
            const Icon(Icons.tune),
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

/// A LINHA DE BUSCA DA LISTAGEM: o gatilho de recorte **na frente** do campo.
///
/// Ela existe pelo pedido do cliente de 18/10/2026 -- *"colocar na frente do
/// campo de busca e nao embaixo"* --, e e publica pela mesma razao que
/// [CampoDeBuscaDaListagem] e: a `Rede` e a listagem publica de perdidos
/// desenham a busca FORA da barra (ver [BarraDeListagem.buscaAcima]), acima
/// das abas e do reforco da secao, e o gatilho tem de subir junto. Duas copias
/// desta `Row` divergiriam na primeira edicao.
///
/// Quem passa [BarraDeListagem.buscaAcima] desenha ESTA linha, e nao
/// [CampoDeBuscaDaListagem] sozinho: a barra para de desenhar o gatilho nesse
/// arranjo, justamente para ele nao aparecer duas vezes.
///
/// O gatilho **nao nasce** quando nao ha folha a abrir, nem quando a lista esta
/// vazia sem recorte: a decisao e a mesma de [BarraDeListagem.desenha], e sai
/// do mesmo lugar.
class LinhaDeBuscaDaListagem extends StatelessWidget {
  const LinhaDeBuscaDaListagem({
    required this.total,
    required this.busca,
    super.key,
    this.filtro,
    this.ordenacao,
    this.aoAplicar,
  });

  final int total;
  final ControleDeBusca busca;
  final ControleDeFiltro? filtro;
  final ControleDeOrdenacao? ordenacao;
  final void Function(EscolhaDaFolha escolha)? aoAplicar;

  @override
  Widget build(BuildContext context) {
    final acao = acaoDeRecorte(
      context,
      total: total,
      busca: busca,
      filtro: filtro,
      ordenacao: ordenacao,
      aoAplicar: aoAplicar,
    );

    return Row(
      // O gatilho e o campo tem alturas proprias (48 dp e a do `BichuField`),
      // e `center` e o que mantem o glifo na linha do texto da busca.
      crossAxisAlignment: CrossAxisAlignment.center,
      children: <Widget>[
        // **A BUSCA VEM PRIMEIRO, E O GATILHO FICA A DIREITA (19/10/2026).**
        //
        // **Isto REVERTE o pedido dele de 18/10**, que era o contrario
        // (*"colocar na frente do campo de busca e nao embaixo"*), e a
        // reversao e DELE, do dia seguinte. Nao e defeito, nao e descuido e
        // nao e volta ao arranjo de 17/10: o gatilho continua **so icone**,
        // continua **na mesma linha** da busca e continua sendo um alvo de
        // 48 dp -- o que mudou foi so de que lado da linha ele fica.
        //
        // **A INVERSAO MORA NESTA UNICA `Row`, e isso foi conferido.** As
        // cinco telas que usam o padrao de listagem chegam todas aqui: tres
        // pelo ramo `comCampo` de [BarraDeListagem] (`lista_do_diretorio`,
        // `minhas_indicacoes`, `vitrine_da_loja`) e duas desenhando esta
        // linha direto, por `buscaAcima` (`lista_de_perdidos`,
        // `agenda_da_rede`). Nenhuma delas tem copia desta ordem, e por isso
        // nenhuma mudou de linha para esta reversao.
        //
        // `Expanded` ANTES do gatilho: a largura que o campo recebe e a mesma
        // de antes -- a linha continua dividida entre um alvo de 48 dp, 8 dp
        // de respiro e o resto --, e o portao de larguras mede isso nas cinco
        // larguras suportadas.
        Expanded(child: CampoDeBuscaDaListagem(busca: busca)),
        if (acao != null) ...<Widget>[
          const SizedBox(width: BichuEspaco.e2),
          GatilhoDeRecorteNoCorpo(acao: acao),
        ],
      ],
    );
  }
}

/// O que o gatilho de recorte desenha agora, ou nulo quando nao ha folha.
///
/// **Uma verdade so**: [BarraDeListagem] e [LinhaDeBuscaDaListagem] chamam
/// esta funcao, e nao cada uma a sua copia da decisao. Nulo quando nao ha
/// folha com desfecho, e nulo quando a lista esta vazia sem recorte -- filtrar
/// o nada e o toque sem desfecho que o criterio 2 proibe.
AcaoDeListagem? acaoDeRecorte(
  BuildContext context, {
  required int total,
  ControleDeBusca? busca,
  ControleDeFiltro? filtro,
  ControleDeOrdenacao? ordenacao,
  void Function(EscolhaDaFolha escolha)? aoAplicar,
}) {
  final b = BarraDeListagem(
    total: total,
    busca: busca,
    filtro: filtro,
    ordenacao: ordenacao,
    aoAplicar: aoAplicar,
  );
  if (!b._temFolha) return null;
  if (total == 0 && !b._recorteAtivo) return null;
  final ativos = filtro?.ativos ?? 0;
  return AcaoDeListagem(
    rotulo: b._rotuloDaFolha,
    distintivo: ativos == 0 ? null : '$ativos',
    aoTocar: () => b._abrirFolha(context),
  );
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

  /// Os recortes digitados. Vazio nas telas que so tem lista fechada.
  List<CampoDeTextoDoFiltro> get campos =>
      filtro?.campos ?? const <CampoDeTextoDoFiltro>[];

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

  /// Um controlador por campo digitado, criado com o valor APLICADO.
  ///
  /// Os controladores sao da folha e nao de quem chama, pela mesma razao por
  /// que `_pendente` e: digitar nao aplica, e um controlador de fora faria o
  /// texto da folha e o recorte da lista serem a mesma variavel -- que e a
  /// aplicacao automatica que o cliente recusou.
  late final Map<String, TextEditingController> _digitado =
      <String, TextEditingController>{
    for (final c in widget.campos)
      c.chave: TextEditingController(text: c.valor ?? ''),
  };

  @override
  void dispose() {
    for (final c in _digitado.values) {
      c.dispose();
    }
    super.dispose();
  }

  /// O texto de cada campo, aparado. Vazio vira nulo: ausencia nao e texto
  /// vazio, e `''` numa query string e um recorte que o servidor recusa.
  Map<String, String?> get _textosPendentes => <String, String?>{
        for (final c in widget.campos)
          c.chave: _digitado[c.chave]?.text.trim().isEmpty ?? true
              ? null
              : _digitado[c.chave]!.text.trim(),
      };

  /// Todos os campos digitados servem para ir a rota.
  bool get _camposServem => widget.campos
      .every((c) => c.serve(_digitado[c.chave]?.text ?? ''));

  /// O que esta aplicado na lista agora -- pastilhas e campos digitados.
  Map<String, String?> get _aplicado => <String, String?>{
        for (final g in widget.grupos) g.chave: g.selecionado,
        for (final c in widget.campos)
          c.chave: (c.valor?.trim().isEmpty ?? true) ? null : c.valor!.trim(),
      };

  /// Ha diferenca entre o que a folha mostra e o que a lista tem.
  ///
  /// **E este booleano que habilita o `Aplicar`**, e e so ele que avisa que ha
  /// mudanca pendente: o cliente pediu o botao habilitado e nenhum selo.
  bool get _mudou {
    // **Campo obrigatorio vazio desabilita o `Aplicar` mesmo com mudanca.**
    // Aplicar um recorte que a rota recusa gastaria uma chamada para voltar
    // 400, e a pessoa leria uma falha de servidor onde falta um dado dela.
    if (!_camposServem) return false;
    final aplicado = _aplicado;
    final textos = _textosPendentes;
    if (textos.keys.any((c) => textos[c] != aplicado[c])) return true;
    if (_pendente.keys.any((c) => _pendente[c] != aplicado[c])) return true;
    return _ordemPendente != widget.ordenacao?.efetiva;
  }

  /// Ha algum FILTRO pendente para o `Limpar` tirar. A ordem nao entra: uma
  /// lista sempre esta em alguma ordem.
  bool get _temEscolha =>
      _pendente.values.any((v) => v != null) ||
      widget.campos.any((c) =>
          !c.obrigatorio && (_digitado[c.chave]?.text.trim().isNotEmpty ?? false));

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
      // Pastilhas e textos no MESMO mapa: para quem recebe a escolha, recorte
      // digitado e recorte escolhido sao a mesma coisa.
      filtros: Map<String, String?>.unmodifiable(<String, String?>{
        ..._pendente,
        ..._textosPendentes,
      }),
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
                    // OS CAMPOS DIGITADOS VEM PRIMEIRO, e nao e ordem
                    // arbitraria: o campo obrigatorio e a pergunta sem a qual a
                    // rota nao responde nada. Pastilhas abaixo de um campo
                    // vazio ofereceriam recortar uma lista que ainda nao
                    // existe.
                    for (final campo in widget.campos) ...<Widget>[
                      BichuField(
                        // O rotulo e o nome acessivel, e ele fica VISIVEL:
                        // campo com dica e sem rotulo e campo mudo.
                        rotulo: campo.rotulo,
                        controlador: _digitado[campo.chave]!,
                        exemplo: campo.exemplo,
                        limite: campo.limite,
                        opcional: !campo.obrigatorio,
                        capitalizacao: TextCapitalization.words,
                        correcaoAutomatica: false,
                        // A UNICA linha alem do rotulo, e so quando o valor
                        // nao serve. Nao ha texto de apoio nesta folha.
                        erro: campo.serve(_digitado[campo.chave]!.text)
                            ? null
                            : campo.textoDeValidacao,
                        // Digitar nao aplica -- ele so repinta o `Aplicar` e a
                        // mensagem de validacao. Quem aplica e o botao.
                        aoMudar: (_) => setState(() {}),
                        // A tecla de confirmacao do teclado NAO aplica: o
                        // `Aplicar` manda o recorte inteiro, e aplicar pela
                        // tecla mandaria o recorte pela metade.
                        acaoDeTeclado: TextInputAction.done,
                      ),
                      const SizedBox(height: BichuEspaco.e6),
                    ],
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
                onPressed: () => setState(() {
                  _pendente.updateAll((_, _) => null);
                  // **O obrigatorio NAO e limpo.** Limpa-lo desabilitaria o
                  // proprio `Aplicar` e deixaria a folha sem saida: a pessoa
                  // tocaria em `Limpar` e descobriria que precisa redigitar a
                  // cidade para voltar a ter lista.
                  for (final c in widget.campos) {
                    if (!c.obrigatorio) _digitado[c.chave]?.clear();
                  }
                }),
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
