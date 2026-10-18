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
/// [ campo de busca ............... (x) ] [ filtro 48 ] [ ordem 48 ]
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
/// **O que a ordenacao faz, e por que ela nao mudou.** A folha de ordem tem
/// **um** valor e uma opcao por linha: tocar numa linha E a decisao, e a folha
/// fecha nesse toque. Nao existe estado intermediario para um botao de aplicar
/// confirmar, e um `Aplicar` ali pediria dois toques para uma escolha so.
/// Ordem tambem nao e filtro: ela nao tira nada da lista.
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
class BarraDeListagem extends StatelessWidget {
  const BarraDeListagem({
    required this.total,
    super.key,
    this.busca,
    this.filtro,
    this.ordenacao,
    this.substantivo = const SubstantivoDaListagem(),
    this.buscaAcima = false,
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
  bool get _temControle =>
      busca != null ||
      (filtro?.temOpcao ?? false) ||
      (ordenacao?.temEscolha ?? false);

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
  }) {
    final barra = BarraDeListagem(
      total: total,
      busca: busca,
      filtro: filtro,
      ordenacao: ordenacao,
    );
    if (!barra._temControle) return false;
    return total != 0 || barra._recorteAtivo;
  }

  @override
  Widget build(BuildContext context) {
    if (!_temControle) return const SizedBox.shrink();
    if (total == 0 && !_recorteAtivo) return const SizedBox.shrink();

    final cores = BichuColors.of(context).cores;
    final textos = Theme.of(context).textTheme;
    final aviso = ordenacao?.porQueNaoEAPedida;
    final comCampo = busca != null && !buscaAcima;

    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: <Widget>[
        Row(
          crossAxisAlignment: CrossAxisAlignment.end,
          children: <Widget>[
            if (comCampo)
              Expanded(child: CampoDeBuscaDaListagem(busca: busca!))
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
        if (comCampo && busca?.avisoDeAlcance != null) ...<Widget>[
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

/// O icone de filtro e a folha que ele abre.
class ControleDeFiltro {
  const ControleDeFiltro({required this.grupos, required this.aoAplicar});

  final List<GrupoDeFiltro> grupos;

  /// Chamado **uma vez**, no `Aplicar`, com a escolha de todos os grupos
  /// declarados: a chave do grupo para o codigo escolhido, ou `null` para
  /// "qualquer um".
  ///
  /// Um callback por grupo era o que havia antes, e com ele cada toque numa
  /// pastilha fechava a folha e recarregava a lista -- que e exatamente a
  /// aplicacao automatica que o cliente recusou. Com o mapa inteiro de uma
  /// vez, trocar tres filtros e **uma** chamada a rota, e a lista volta para
  /// a primeira pagina uma vez, e nao tres.
  final void Function(Map<String, String?> escolhas) aoAplicar;

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

/// A folha de filtros, que guarda a escolha PENDENTE e so aplica no botao.
///
/// Ela e `Stateful` por isso: a escolha vive aqui, em [_pendente], ate o
/// `Aplicar`. Enquanto a folha esta aberta a tela nao e chamada nenhuma vez, e
/// a lista atras dela continua sendo a lista do recorte anterior -- que e o
/// desenho pedido, e nao um atraso.
class _FolhaDeFiltros extends StatefulWidget {
  const _FolhaDeFiltros({required this.filtro});

  final ControleDeFiltro filtro;

  static const String rotuloDeAplicar = 'Aplicar';
  static const String rotuloDeLimpar = 'Limpar';

  @override
  State<_FolhaDeFiltros> createState() => _EstadoDaFolhaDeFiltros();
}

class _EstadoDaFolhaDeFiltros extends State<_FolhaDeFiltros> {
  /// A escolha de cada grupo declarado, como ela esta **nesta folha**.
  late final Map<String, String?> _pendente = <String, String?>{
    for (final g in widget.filtro.grupos) g.chave: g.selecionado,
  };

  /// O que esta aplicado na lista agora.
  Map<String, String?> get _aplicado => <String, String?>{
        for (final g in widget.filtro.grupos) g.chave: g.selecionado,
      };

  /// Ha diferenca entre o que a folha mostra e o que a lista tem.
  ///
  /// **E este booleano que habilita o `Aplicar`**, e e so ele que avisa que ha
  /// mudanca pendente: o cliente pediu o botao habilitado e nenhum selo.
  bool get _mudou {
    final aplicado = _aplicado;
    return _pendente.keys.any((c) => _pendente[c] != aplicado[c]);
  }

  /// Ha alguma escolha pendente para o `Limpar` tirar.
  bool get _temEscolha => _pendente.values.any((v) => v != null);

  /// Os grupos desenhados: com opcao, e com o pai ainda no valor aplicado.
  List<GrupoDeFiltro> get _visiveis {
    final aplicado = _aplicado;
    return widget.filtro.grupos.where((g) {
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
      for (final g in widget.filtro.grupos) {
        if (g.dependeDe == grupo.chave) _pendente[g.chave] = null;
      }
    });
  }

  void _aplicar() {
    final escolhas = Map<String, String?>.unmodifiable(_pendente);
    Navigator.of(context).pop();
    widget.filtro.aoAplicar(escolhas);
  }

  @override
  Widget build(BuildContext context) {
    final textos = Theme.of(context).textTheme;
    final cores = BichuColors.of(context).cores;
    final visiveis = _visiveis;

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
                  ],
                ),
              ),
            ),
            // **`Limpar` mexe na folha, e nao na lista.** Ele desmarca tudo e
            // o `Aplicar` continua sendo o unico caminho com efeito: duas
            // formas de recortar a lista a partir da mesma folha era o que
            // havia antes, e uma delas aplicava sozinha.
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
