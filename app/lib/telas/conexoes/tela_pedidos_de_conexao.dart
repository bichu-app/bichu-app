import '../../widgets/arrastar_para_atualizar.dart';
import 'dart:async';

import 'package:flutter/material.dart';
import 'package:go_router/go_router.dart';

import '../../api/conexoes_api.dart';
import '../../api/falhas.dart';
import '../../api/modelos_conexao.dart';
import '../../roteamento/rotas.dart';
import '../../theme/bichu_colors.dart';
import '../../theme/bichu_tokens.g.dart';
import '../../widgets/convite_para_entrar.dart';
import '../../widgets/faixa_de_aviso.dart';
import '../../widgets/selo_de_validado.dart';

/// **Os pedidos de conexão.** A única tela desta fatia, e a lista que ela
/// mostra é de **pedidos** — nunca de conexões.
///
/// ## A TELA DE "MINHAS CONEXÕES" PASSOU A EXISTIR EM 22/10/2026
///
/// Esta seção dizia *"Por que não existe uma tela de 'minhas conexões'"*, e
/// explicava que a lista *"não aparece a ninguém, nem a quem é conectado"*
/// (plano 4-B, decisão do cliente de 18/10/2026). **O cliente emendou a própria
/// decisão**, literal: *"o usuário pode abrir a lista de usuários que é sua
/// conexão"*.
///
/// Ela é `TelaDeMinhasConexoes`, em `tela_minhas_conexoes.dart`, com rota
/// própria — **e não uma terceira aba desta tela**. A razão é de desenho e
/// está escrita lá: caixa de pedidos é o que **espera decisão**, e conexão
/// aceita não espera nada. Uma terceira aba ao lado de `Recebidos` e
/// `Enviados` poria no mesmo controle duas perguntas diferentes.
///
/// **A TROCA DO SEGMENTO PELA ABA (26/10/2026) NÃO REABRIU ISTO.** O controle
/// mudou de FORMA e continua com DUAS posições: o argumento acima é sobre a
/// PERGUNTA que o controle faz, e não sobre o widget que a faz. A palavra
/// "segmento" virou "aba" nestas linhas e nada mais mudou nelas.
///
/// **Esta tela não mudou de trabalho**: ela continua mostrando **pedidos**, e o
/// que o dono vê aqui sobre as conexões aceitas continua sendo o **número**, na
/// linha de resumo do topo. A isca `ISCA (b)` de
/// `test/telas/pedidos_de_conexao_test.dart` continua valendo inteira, sem uma
/// linha mudada: esta tela não pede `GET /connections` e não escreve
/// "Conexões".
///
/// ## AS DUAS CAIXAS SÃO ABAS, E NÃO SEGMENTOS (cliente, 26/10/2026)
///
/// Literal: *"pedidos de conexão, vamos trocar essas caixas de recebidos e
/// enviados por abas, igual na pagina de rede."*
///
/// **O destino que ele nomeia é a `TabBar` de `rede/secao_da_rede.dart`**, que
/// é a ÚNICA `TabBar` do aplicativo — e por isso o padrão veio de lá inteiro:
/// `isScrollable` com `tabAlignment: TabAlignment.start`, e `Tab` com
/// `height: BichuAlvoDeToque.min`. Cada escolha dessas tem a conta medida
/// escrita na prosa de `SecaoDaRede`, e nenhuma foi reinventada aqui.
///
/// **UMA DIFERENÇA DELIBERADA: não há glifo.** O ícone nas abas da `Rede` é
/// pedido DELE, de 22/10/2026, e para AQUELA seção; a prosa de lá diz por
/// extenso que a escolha dos glifos é de quem escreveu e pode ser revista.
/// Inventar dois glifos aqui seria escolha minha entrando como decisão dele.
///
/// **AS ABAS DE `Próximos`/`Encerrados` QUE O PEDIDO CITA NÃO EXISTEM MAIS.**
/// Elas viraram FILTRO em 19/10/2026, por decisão dele — está escrito no alto
/// de `rede/agenda_da_rede.dart`. O que a página da `Rede` tem hoje são as
/// abas `Eventos`/`Comunidade`/`Usuários`, de `rede/secao_da_rede.dart`, e é
/// esse o desenho que ele viu no aparelho quando pediu "igual na pagina de
/// rede". **O pedido vale inteiro**: ele nomeou a FORMA, e a forma está lá.
///
/// **TROCAR DE ABA NÃO RECARREGA A CAIXA JÁ VISTA**, e isto o segmento não
/// fazia: cada troca dele chamava `_carregar()`, a roda substituía a lista e a
/// caixa voltava do zero. Ver [_EstadoDosPedidos._paginas].
///
/// ## Por que não existe campo de busca AQUI
///
/// A busca de PESSOAS existe desde 20/10/2026, e ela é a aba `Usuários` da
/// `Rede` — não esta tela. O que não cabe aqui é filtrar **pedidos** por pessoa:
/// **o dano mora na enumeração**, não no perfil. O padrão de listagem desta casa põe busca, filtro e ordenação no
/// topo do corpo da tela — e aqui o que cabe no topo é a **escolha da caixa**
/// (as abas, desde 26/10/2026) e o resumo. Sem busca, e sem seletor de ordem: a ordem é fixa, mais recentes
/// primeiro, porque qualquer recorte por pessoa aqui seria uma superfície de
/// enumeração.
///
/// ## Por que não existe botão de "conectar"
///
/// Um pedido só nasce de um **convite**, e os dois emissores de convite são
/// outras fatias: a conexão **ancorada** no contexto (caso devolvido, encontro
/// em comum) e o **código presencial** de 5 minutos. Enquanto nenhuma existir,
/// não há de onde partir um pedido — e oferecer o controle seria desenhar um
/// caminho que o servidor recusa com 404.
///
/// ## Duas abas, e a recusa é silenciosa nas duas
///
/// | Aba | O que traz | O que a pessoa faz |
/// |---|---|---|
/// | `Recebidos` | pedidos que chegaram | **Aceitar** ou **Recusar** |
/// | `Enviados` | pedidos que a conta mandou | **Cancelar** |
///
/// Em `Enviados`, um pedido **recusado** continua aparecendo como enviado até
/// expirar, e depois desaparece. **Isso é o desenho, e esta tela não tem como
/// contrariá-lo**: o servidor não manda `declined`, não existe esse valor no
/// modelo, e não há ramo aqui que o desenhe. É o que impede o *"ela recusou
/// você"* que faz as pessoas aceitarem estranhos para não criar atrito.
///
/// ## Nenhum identificador interno aparece
///
/// A pessoa é nomeada pelo **apelido**; com apelido nulo cai para o nome de
/// exibição; com os dois nulos a tela escreve [semNome], que é texto de tela e
/// não de servidor. O `ref` que viaja nos botões é **da aresta**, não da pessoa.
class TelaDePedidosDeConexao extends StatefulWidget {
  const TelaDePedidosDeConexao({required this.conexoes, super.key});

  /// Entregue por quem monta a tela.
  ///
  /// **Não vem do `Escopo`** porque o `Escopo` é de outra frente e está sendo
  /// mexido por outra sessão; ligar a porta lá é um passo de fiação, e está
  /// pedido no relatório da entrega.
  final ConexoesApi conexoes;

  static const String titulo = 'Pedidos de conexão';
  static const String semNome = 'Usuário sem nome';
  static const String vazioRecebidos = 'Nenhum pedido esperando você';
  static const String vazioEnviados = 'Você não tem pedidos esperando resposta';
  static const String falhaAoCarregar = 'Não conseguimos carregar seus pedidos agora.';
  static const String falhaAoAgir = 'Não conseguimos registrar isso agora.';

  /// O rótulo acessível da PORTA DO PERFIL, no nome de quem pediu.
  ///
  /// Diz o que o toque **abre**, e não o que o controle é: sem ele, quem usa
  /// leitor de tela ouviria só o apelido e não teria como saber que ali há um
  /// destino. É a mesma frase de `rotuloDaPortaDoPerfil` na área de mensagens,
  /// e repeti-la é deliberado — as duas telas são de módulos diferentes, e um
  /// texto compartilhado acoplaria esta fatia ao de mensagens por uma string.
  static String rotuloDoPerfilDe(String quem) => 'Abrir o perfil de $quem';

  @override
  State<TelaDePedidosDeConexao> createState() => _EstadoDosPedidos();
}

class _EstadoDosPedidos extends State<TelaDePedidosDeConexao>
    with SingleTickerProviderStateMixin {
  CaixaDePedidos _caixa = CaixaDePedidos.recebidos;

  /// O controlador das DUAS abas, criado UMA vez e com `initialIndex`.
  ///
  /// **Ele mora no estado e não no `build`**, e é isso que faz a aba escolhida
  /// sobreviver a reconstrução — inclusive à reconstrução que acontece quando
  /// o perfil de quem pediu é EMPILHADO por cima desta tela e depois sai. Ver
  /// o comentário do `push` em [_nomeDeQuemPediu]: ele já dizia que voltar do
  /// perfil tem de devolver a caixa que a pessoa estava olhando, e com um
  /// controlador refeito a cada `build` a aba voltaria a `Recebidos`.
  ///
  /// `length` vem de `CaixaDePedidos.values` e não de um `2` escrito à mão:
  /// uma caixa nova no contrato quebraria o controlador em silêncio, com a
  /// aba existindo no `enum` e não na barra.
  late final TabController _abas = TabController(
    length: CaixaDePedidos.values.length,
    initialIndex: _caixa.index,
    vsync: this,
  );

  /// A PÁGINA JÁ CARREGADA DE CADA CAIXA, e a razão de ela ser um MAPA.
  ///
  /// Era um `PaginaDePedidosDeConexao?` único. Com o controle segmentado, cada
  /// troca de caixa chamava `_carregar()`: a lista da caixa anterior era
  /// jogada fora, a roda tomava o lugar dela e voltar mostrava a caixa **do
  /// zero**. É a mesma perda que o comentário do `push` em [_nomeDeQuemPediu]
  /// cita como o que `go` faria — e ela estava acontecendo pelo outro lado,
  /// a cada toque no controle.
  ///
  /// Com ABAS essa perda fica visível toda hora, porque trocar de aba é gesto
  /// de LEITURA e não de filtragem: ninguém espera que voltar para a aba de
  /// onde veio recomece. Então a caixa já vista aparece com a lista que já
  /// estava na mão — **sem roda e sem pergunta nova ao servidor** — e só a
  /// caixa inédita carrega.
  ///
  /// **O mapa é ESVAZIADO em [_agir]**, e isso não é zelo: aceitar, recusar ou
  /// cancelar muda a lista NO SERVIDOR, e aí o que está guardado aqui passa a
  /// ser mentira nas duas caixas. Arrastar para atualizar também força a
  /// pergunta, porque passa por [_carregar].
  final Map<CaixaDePedidos, PaginaDePedidosDeConexao> _paginas =
      <CaixaDePedidos, PaginaDePedidosDeConexao>{};

  ResumoDeConexoes? _resumo;
  bool _carregando = true;
  String? _falha;

  /// A falha foi **falta de conta**, e nao defeito. Ver [faltaConta].
  bool _faltaConta = false;
  final Set<String> _emCurso = <String>{};

  @override
  void initState() {
    super.initState();
    unawaited(_carregar());
  }

  @override
  void dispose() {
    _abas.dispose();
    super.dispose();
  }

  Future<void> _carregar() async {
    // A CAIXA É FIXADA AQUI, e não lida de novo depois do `await`: a resposta
    // pode chegar DEPOIS de a pessoa trocar de aba, e sem isto a página de
    // `Recebidos` seria guardada sob a chave de `Enviados` — a lista certa na
    // aba errada, que é pior do que recarregar.
    final CaixaDePedidos caixa = _caixa;
    setState(() {
      _carregando = true;
      _falha = null;
      _faltaConta = false;
    });
    try {
      // As duas perguntas em paralelo: o resumo não atrasa nem derruba a lista,
      // e a lista não atrasa o número.
      //
      // **A falha do resumo é tratada NO MOMENTO em que a chamada parte**, com
      // `onError`, e não num `try` em volta do `await`. Sem isso, quando a
      // LISTA falha primeiro, o `await` do resumo nunca acontece e a falha dele
      // sobe como erro assíncrono sem dono — que o teste de widget acusa como
      // reprovação e, em produção, viraria um erro solto no console. Medido em
      // 18/10/2026.
      final pedidos = widget.conexoes.pedidos(caixa: caixa);
      final resumo = widget.conexoes
          .resumo()
          .then<ResumoDeConexoes?>((ResumoDeConexoes r) => r)
          .onError<FalhaDeChamada>((Object erro, StackTrace pilha) => _resumo);
      final pagina = await pedidos;
      final numeros = await resumo;
      if (!mounted) return;
      setState(() {
        _paginas[caixa] = pagina;
        _resumo = numeros;
        // A roda só sai se esta carga é a da aba que está na frente: a outra
        // tem a carga dela em voo, e apagar a roda aqui mostraria o vazio
        // dela por um quadro.
        if (caixa == _caixa) _carregando = false;
      });
    } on FalhaDeChamada catch (falha) {
      if (!mounted) return;
      // A falha de uma caixa que já não está na frente não desenha nada. A
      // aba atual, se é inédita, tem a própria carga em voo e o próprio
      // desfecho; se é a já vista, está mostrando a lista que tem.
      if (caixa != _caixa) return;
      setState(() {
        _carregando = false;
        // `next_action: sign_in` do servidor. Medido:
        // `/v1/connections/requests` responde `401 unauthenticated`.
        _faltaConta = faltaConta(falha);
        _falha =
            _faltaConta ? null : TelaDePedidosDeConexao.falhaAoCarregar;
      });
    }
  }

  Future<void> _aceitar(String ref) => _agir(ref, () => widget.conexoes.aceitar(ref));

  Future<void> _encerrar(String ref) => _agir(ref, () => widget.conexoes.encerrar(ref));

  Future<void> _agir(String ref, Future<void> Function() acao) async {
    if (_emCurso.contains(ref)) return;
    setState(() {
      _emCurso.add(ref);
      _falha = null;
    });
    try {
      await acao();
      if (!mounted) return;
      _emCurso.remove(ref);
      // O GUARDADO DAS DUAS CAIXAS CAI AQUI. Aceitar tira o pedido de
      // `Recebidos`, cancelar tira de `Enviados`, e o resumo muda nos dois
      // casos: mostrar a outra caixa a partir do mapa depois disto seria
      // desenhar uma lista que o servidor já não tem. `_carregar()` logo
      // abaixo refaz a da frente; a outra refaz quando for aberta.
      _paginas.clear();
      await _carregar();
    } on FalhaDeChamada {
      if (!mounted) return;
      setState(() {
        _emCurso.remove(ref);
        _falha = TelaDePedidosDeConexao.falhaAoAgir;
      });
    }
  }

  /// O TOQUE NA ABA. **Só a caixa inédita pergunta ao servidor.**
  ///
  /// Ver [_paginas] para o porquê. O `GrupoSegmentado` que esta aba substituiu
  /// chamava `_carregar()` em TODA troca, sem exceção.
  void _trocarCaixa(CaixaDePedidos escolhida) {
    if (escolhida == _caixa) return;
    final bool jaVista = _paginas.containsKey(escolhida);
    setState(() {
      _caixa = escolhida;
      // O aviso de falha era da caixa ANTERIOR, e ele não atravessa a troca:
      // "não conseguimos carregar" ao lado da lista de outra caixa afirma
      // sobre a lista que está na tela algo que é de outra.
      _falha = null;
    });
    if (!jaVista) unawaited(_carregar());
  }

  @override
  Widget build(BuildContext context) {
    final cores = BichuColors.of(context).cores;
    final textos = Theme.of(context).textTheme;
    final itens = _paginas[_caixa]?.items ?? const <Conexao>[];

    // SEM CONTA A TELA INTEIRA E O CONVITE, e a escolha de caixa **nao**
    // aparece: duas abas que nao podem mudar nada sao um controle sem
    // desfecho, a mesma regra pela qual `Minhas indicações` nao e desenhada
    // deslogado. Nao ha `RefreshIndicator` tambem -- arrastar para atualizar
    // repetiria o 401.
    if (_faltaConta) {
      return Scaffold(
        appBar: AppBar(title: const Text(TelaDePedidosDeConexao.titulo)),
        body: const SafeArea(
          child: Padding(
            padding: EdgeInsets.all(BichuEspaco.e4),
            child: ConviteParaEntrar(secao: SecaoComConta.pedidosDeConexao),
          ),
        ),
      );
    }

    return Scaffold(
      appBar: AppBar(title: const Text(TelaDePedidosDeConexao.titulo)),
      // **ERA UM `RefreshIndicator` CRU, e passou a ser o componente.** Esta
      // era a UNICA tela do app com o gesto, escrita antes de ele existir em
      // lugar nenhum; o cliente mandou o gesto para o app inteiro em
      // 18/10/2026, e manter o cru aqui deixaria uma tela com rotulo de leitor
      // de tela diferente das outras dez.
      body: ArrastarParaAtualizar(
        aoAtualizar: _carregar,
        child: ListView(
          padding: const EdgeInsets.all(BichuEspaco.e4),
          children: <Widget>[
            // O CONTROLE NO TOPO DO CORPO, e não na barra: é o padrão de
            // listagem desta casa, e a aba herda exatamente o lugar do
            // segmento que ela substituiu. **DUAS abas, porque não há uma
            // terceira caixa** -- ver a prosa da classe.
            //
            // **ELAS FICAM DENTRO DA `ListView`, e isso é escolha e não
            // descuido.** Em `secao_da_rede.dart` as abas ficam FORA do corpo
            // rolante, e o motivo medido está escrito lá: a barra de listagem
            // daquela tela desaparece em alguns estados e levaria as abas
            // junto. **Aqui não há barra de listagem**, e o lugar do controle
            // é o topo do corpo pelo padrão desta casa; tirá-lo da `ListView`
            // reestruturaria a tela e passaria por cima do gesto de arrastar
            // para atualizar, que é o pai desta lista.
            Semantics(
              container: true,
              // `Caixa` era o `rotulo` do `GrupoSegmentado`, e ele continua
              // aqui pelo motivo que está escrito lá: sem o nome do grupo,
              // quem usa leitor de tela ouve `Recebidos` e não tem como saber
              // qual era a pergunta. A `TabBar` do M3 já anuncia `aba 1 de 2`
              // e o estado de selecionada -- o que ela NÃO tem é a pergunta.
              label: 'Caixa',
              child: TabBar(
                controller: _abas,
                // AS DUAS VÊM DE `secao_da_rede.dart`, e a conta foi
                // REFEITA para ESTES dois rótulos em vez de herdada
                // (320 dp de tela, 200% de escala de fonte):
                //
                // | barra | largura dada | precisa de | linhas |
                // |---|---|---|---|
                // | NÃO rolável (`fill`) | 112,0 dp | 252,9 / 224,8 | **2** |
                // | `isScrollable` | 252,9 / 224,8 dp | idem | 1 |
                //
                // **ISTO CORRIGE O QUE EU HAVIA ESCRITO AQUI.** Eu disse que
                // o rótulo "corta" numa barra não rolável, copiando a palavra
                // da prosa da `Rede`. MEDIDO: **não corta** --
                // `didExceedMaxLines` é falso e nenhuma exceção sobe. O que
                // acontece é que ele QUEBRA EM DUAS LINHAS, com 112 dp onde
                // pede 252,9, e o texto passa de 40,0 para 48,0 dp de altura.
                // Logo: rolar não evita uma quebra de layout, evita que o
                // rótulo vire duas linhas. É escolha de qualidade e não
                // conserto de defeito, e dizer o contrário seria inventar
                // gravidade para justificar a decisão.
                //
                // `tabAlignment: TabAlignment.start` porque com
                // `isScrollable` o padrão do M3 é `startOffset`, que abre um
                // vão de 52 dp antes da primeira aba -- somado à margem de
                // 16 dp deste corpo, `Recebidos` nasceria a 68 dp da borda,
                // desalinhada de tudo o que está abaixo dela.
                //
                // O CUSTO É DE LARGURA, e está medido e não escondido: a 200%
                // a segunda aba termina em 541,7 dp, fora de uma tela de 320
                // -- e é por isso mesmo que esta barra rola.
                isScrollable: true,
                tabAlignment: TabAlignment.start,
                onTap: (int i) => _trocarCaixa(CaixaDePedidos.values[i]),
                tabs: const <Widget>[
                  // `height` EXPLÍCITO, amarrado ao token, e a conta está
                  // MEDIDA (26/10/2026, neste Flutter 3.47.4):
                  //
                  // | `height` | caixa do `Tab` | ALVO DE TOQUE |
                  // |---|---|---|
                  // | ausente | 46,0 dp | **48,0 dp** |
                  // | `BichuAlvoDeToque.min` | 48,0 dp | **50,0 dp** |
                  //
                  // **O alvo nunca esteve abaixo do piso**, e dizer que isto
                  // conserta um alvo pequeno seria falso: a `TabBar` envolve
                  // cada aba num `Padding(bottom: indicatorWeight)` por
                  // DENTRO do `InkWell`, então o alvo é 2 dp mais alto que a
                  // caixa do `Tab`. Sem `height` ele dá 48,0 — no piso, com
                  // folga ZERO.
                  //
                  // O que o token compra é a folga e o VÍNCULO: a altura
                  // passa a vir de `design/tokens.json` e não de
                  // `kTextTabBarHeight`, que é constante do SDK e pode mudar
                  // numa atualização sem ninguém reparar. É também o que o
                  // padrão da casa faz em `rede/secao_da_rede.dart`.
                  Tab(height: BichuAlvoDeToque.min, child: Text('Recebidos')),
                  Tab(height: BichuAlvoDeToque.min, child: Text('Enviados')),
                ],
              ),
            ),
            const SizedBox(height: BichuEspaco.e4),
            if (_resumo != null) _linhaDoResumo(cores, textos, _resumo as ResumoDeConexoes),
            if (_falha != null) ...<Widget>[
              const SizedBox(height: BichuEspaco.e3),
              FaixaDeAviso(texto: _falha as String),
            ],
            const SizedBox(height: BichuEspaco.e4),
            if (_carregando)
              const Center(child: Padding(
                padding: EdgeInsets.all(BichuEspaco.e8),
                child: CircularProgressIndicator(),
              ))
            // Com falha, o vazio NÃO é anunciado: "nenhum pedido" e "não
            // consegui perguntar" são afirmações diferentes, e a primeira seria
            // mentira em cima da segunda.
            else if (itens.isEmpty && _falha == null)
              Padding(
                padding: const EdgeInsets.symmetric(vertical: BichuEspaco.e8),
                child: Text(
                  _caixa == CaixaDePedidos.recebidos
                      ? TelaDePedidosDeConexao.vazioRecebidos
                      : TelaDePedidosDeConexao.vazioEnviados,
                  style: textos.bodyMedium?.copyWith(color: cores.textSecondary),
                  textAlign: TextAlign.center,
                ),
              )
            else
              ...itens.map((Conexao pedido) => _cartao(cores, textos, pedido)),
          ],
        ),
      ),
    );
  }

  /// **Só números.** Esta linha é o que existe no lugar da lista de conexões.
  Widget _linhaDoResumo(BichuCores cores, TextTheme textos, ResumoDeConexoes resumo) {
    return Semantics(
      container: true,
      child: Text(
        'Você tem ${resumo.connectedCount} de ${resumo.connectionLimit} conexões. '
        'Pode enviar ${resumo.remainingRequestsToday} pedidos hoje.',
        style: textos.bodySmall?.copyWith(color: cores.textSecondary),
      ),
    );
  }

  /// O NOME DE QUEM PEDIU, e a porta do perfil dele quando há apelido.
  ///
  /// ## O defeito que isto desfaz
  ///
  /// `telas/pessoa/tela_perfil_de_pessoa.dart` existe, tem rota
  /// ([Rotas.perfilDePessoa]) e desenha os quatro estados de conexão — mas até
  /// 19/10/2026 o único jeito de chegar lá era a foto da conversa, em
  /// `telas/mensagens/area_de_mensagens.dart`. A tela de pedidos é o OUTRO
  /// lugar onde o app já nomeia uma pessoa de verdade: quem decide aceitar
  /// precisa poder olhar quem está pedindo ANTES de aceitar, e sem isto a
  /// decisão é tomada sobre um apelido solto.
  ///
  /// ## Por que o nome, e não o cartão inteiro
  ///
  /// O cartão tem `Aceitar`/`Recusar` dentro dele. Um `InkWell` em volta do
  /// cartão poria um destino por baixo de dois controles destrutivos — o
  /// gesto que erra o botão viraria navegação, e a navegação por acidente num
  /// cartão de decisão é pior que não ter porta. **Não há foto aqui**, e isso
  /// é o contrato e não um esquecimento: a emenda 3 do ADR-0010 libera a foto
  /// de perfil **entre conexões aceitas**, e um pedido pendente é exatamente o
  /// estado em que as duas pessoas ainda não aceitaram. `PessoaDaConexao` tem
  /// só `handle` e `display_name`.
  ///
  /// ## Apelido ausente: texto, e não controle
  ///
  /// A rota é por **apelido** (ADR-0010 proíbe identificador interno em
  /// superfície pública, e o `ref` que viaja nos botões é da ARESTA e não da
  /// pessoa). `handle` é anulável no contrato, e com ele nulo a tela já cai
  /// para o nome de exibição ou para [TelaDePedidosDeConexao.semNome]. Nesses
  /// dois estados o nome **volta a ser texto puro**: um destino montado com
  /// nulo abriria `/pessoa/null`, e um rótulo de botão sem desfecho é o toque
  /// que não leva a lugar nenhum.
  ///
  /// ## O SELO FICA AQUI DENTRO, e por que isto e uniao e nao escolha
  ///
  /// Duas frentes da onda 4 mexeram nesta linha: uma a transformou em CONTROLE
  /// (48 dp, `push` para o perfil, nome acessivel de botao) e a outra lhe deu o
  /// SELO DE VALIDADO. As duas coisas cabem na mesma linha, e cabem nos dois
  /// caminhos deste ajudante -- com apelido e sem.
  ///
  /// **O selo sai IGUAL no pedido recebido e no enviado**, porque e atributo da
  /// conta e nao algo que o aceite libere: condiciona-lo faria a mesma pessoa
  /// aparecer validada no perfil e nao aqui, que e a divergencia que a regua
  /// unica existe para impedir.
  ///
  /// `nomeParaLer` pode ser nulo (as duas pontas de nome sao anulaveis no
  /// contrato) e cai para `semNome`. **O selo nao cai com ele**: o booleano e
  /// sobre a CONTA, e uma conta sem nome de exibicao pode ter confirmado o
  /// e-mail. E ele tambem nao cai com a AUSENCIA DE APELIDO, que e o caminho em
  /// que esta linha nao e tocavel -- selo e sobre a conta, toque e sobre haver
  /// perfil para abrir, e as duas condicoes sao independentes.
  Widget _nomeDeQuemPediu(
    BichuCores cores,
    TextTheme textos,
    Conexao pedido,
  ) {
    final nome = pedido.person.nomeParaLer ?? TelaDePedidosDeConexao.semNome;
    final estilo = textos.titleMedium?.copyWith(color: cores.textPrimary);
    final comSelo = pedido.person.canalConfirmado;
    final apelido = pedido.person.handle;
    // Vazio tratado como ausente, pelo mesmo motivo de
    // `ligarPortaDoPerfilDoParticipante`: `Rotas.perfilDe('')` devolveria
    // `/pessoa/`, que e a rota de outra coisa.
    if (apelido == null || apelido.isEmpty) {
      return NomeComSelo(nome: nome, comSelo: comSelo, estilo: estilo);
    }

    return Semantics(
      button: true,
      // **O SELO ENTRA NO ROTULO, e isto e consequencia MEDIDA da uniao.**
      //
      // `excludeSemantics: true` apaga a semantica dos descendentes, e com o
      // selo desenhado aqui dentro ele apagava o anuncio DELE: medido, o leitor
      // de tela recebia so `Abrir o perfil de @ana-do-bairro` e a conta
      // validada deixava de existir para quem nao ve a tela. Nas outras tres
      // superficies (Mural, comentario, perfil) o `NomeComSelo` nao fica dentro
      // de `excludeSemantics` e o selo se anuncia sozinho -- esta era a unica
      // que o engolia.
      //
      // A justificativa original do `excludeSemantics` -- *"o texto de dentro
      // nao diz nada que o rotulo acima nao diga"* -- **deixou de ser verdade**
      // no dia em que passou a haver selo dentro. Tirar o `excludeSemantics`
      // anunciaria o nome DUAS vezes na mesma parada, que e o ruido que ele
      // existe para evitar; entao o selo sobe para o rotulo e a parada continua
      // sendo uma.
      //
      // Esta e a forma que o proprio caso do selo previu, na prosa dele:
      // *"a linha do pedido e um no de semantica unico, entao o leitor de tela
      // anuncia `@ana-do-bairro, Contato confirmado` numa parada so"* -- e e por
      // isso que ele cobra o rotulo com `contains` e nao com igualdade.
      label: comSelo
          ? '${TelaDePedidosDeConexao.rotuloDoPerfilDe(nome)}, '
              '${SeloDeValidado.rotulo}'
          : TelaDePedidosDeConexao.rotuloDoPerfilDe(nome),
      excludeSemantics: true,
      child: InkWell(
        // `push` e nao `go`: o perfil COBRE esta tela, e voltar dele tem de
        // devolver a caixa que a pessoa estava olhando -- `go` trocaria de
        // ramo e a lista voltaria em `Recebidos` do zero.
        onTap: () => context.push(Rotas.perfilDe(apelido)),
        child: Container(
          // 48 e nao 64, pelo mesmo motivo de `MarcaNeutraDoParticipante`: o
          // piso de 64 dp vale para superficie critica (o achador, a marcacao
          // de perdido), e o nome num cartao de pedido nao e uma delas. 48 dp
          // esta acima do piso do M3 e do SC 2.5.8.
          constraints: const BoxConstraints(minHeight: 48),
          alignment: Alignment.centerLeft,
          child: NomeComSelo(nome: nome, comSelo: comSelo, estilo: estilo),
        ),
      ),
    );
  }

  Widget _cartao(BichuCores cores, TextTheme textos, Conexao pedido) {
    final recebido = pedido.state == EstadoDaConexao.pedidoRecebido;
    final ocupado = _emCurso.contains(pedido.ref);
    return Container(
      margin: const EdgeInsets.only(bottom: BichuEspaco.e3),
      padding: const EdgeInsets.all(BichuEspaco.e4),
      decoration: BoxDecoration(
        color: cores.surface,
        borderRadius: BorderRadius.circular(BichuRaio.md),
        border: Border.all(color: cores.outline, width: BichuBorda.hairline),
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: <Widget>[
          _nomeDeQuemPediu(cores, textos, pedido),
          const SizedBox(height: BichuEspaco.e2),
          // `Expanded` nos dois, e nao `MainAxisAlignment.end`: o tema desta
          // casa da aos botoes uma largura minima infinita (botao de largura
          // cheia), e dentro de uma `Row` isso estoura o layout com
          // "BoxConstraints forces an infinite width" -- medido em 18/10/2026.
          Row(
            children: recebido
                ? <Widget>[
                    Expanded(
                      child: TextButton(
                        onPressed: ocupado ? null : () => unawaited(_encerrar(pedido.ref)),
                        child: const Text('Recusar'),
                      ),
                    ),
                    const SizedBox(width: BichuEspaco.e2),
                    Expanded(
                      child: FilledButton(
                        onPressed: ocupado ? null : () => unawaited(_aceitar(pedido.ref)),
                        child: const Text('Aceitar'),
                      ),
                    ),
                  ]
                : <Widget>[
                    Expanded(
                      child: TextButton(
                        onPressed: ocupado ? null : () => unawaited(_encerrar(pedido.ref)),
                        child: const Text('Cancelar'),
                      ),
                    ),
                  ],
          ),
        ],
      ),
    );
  }
}
