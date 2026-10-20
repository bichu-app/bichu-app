import '../../widgets/arrastar_para_atualizar.dart';
import 'dart:async';

import 'package:flutter/material.dart';

import '../../api/conexoes_api.dart';
import '../../api/falhas.dart';
import '../../api/modelos_conexao.dart';
import '../../theme/bichu_colors.dart';
import '../../theme/bichu_tokens.g.dart';
import '../../widgets/convite_para_entrar.dart';
import '../../widgets/faixa_de_aviso.dart';
import '../../widgets/grupo_segmentado.dart';

/// **Os pedidos de conexão.** A única tela desta fatia, e a lista que ela
/// mostra é de **pedidos** — nunca de conexões.
///
/// ## Por que não existe uma tela de "minhas conexões"
///
/// Porque a lista de conexões **não aparece a ninguém, nem a quem é
/// conectado** (plano 4-B, decisão do cliente de 18/10/2026). Não é que ela
/// ficou para depois: ela não existe no contrato, não existe no repositório e
/// não existe aqui. O que o dono vê sobre as próprias conexões é o **número**,
/// na linha de resumo do topo — e número não diz **quem**, que é exatamente a
/// diferença que o torna mostrável onde a lista não é.
///
/// ## Por que não existe campo de busca
///
/// Busca de pessoas não existe neste produto: **o dano mora na enumeração**, não
/// no perfil. O padrão de listagem desta casa põe busca, filtro e ordenação no
/// topo do corpo da tela — e aqui o que cabe no topo é o **filtro** (qual caixa)
/// e o resumo. Sem busca, e sem seletor de ordem: a ordem é fixa, mais recentes
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
/// ## Duas caixas, e a recusa é silenciosa nas duas
///
/// | Caixa | O que traz | O que a pessoa faz |
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
  static const String semNome = 'Pessoa sem nome';
  static const String vazioRecebidos = 'Nenhum pedido esperando você';
  static const String vazioEnviados = 'Você não tem pedidos esperando resposta';
  static const String falhaAoCarregar = 'Não conseguimos carregar seus pedidos agora.';
  static const String falhaAoAgir = 'Não conseguimos registrar isso agora.';

  @override
  State<TelaDePedidosDeConexao> createState() => _EstadoDosPedidos();
}

class _EstadoDosPedidos extends State<TelaDePedidosDeConexao> {
  CaixaDePedidos _caixa = CaixaDePedidos.recebidos;
  PaginaDePedidosDeConexao? _pagina;
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

  Future<void> _carregar() async {
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
      final pedidos = widget.conexoes.pedidos(caixa: _caixa);
      final resumo = widget.conexoes
          .resumo()
          .then<ResumoDeConexoes?>((ResumoDeConexoes r) => r)
          .onError<FalhaDeChamada>((Object erro, StackTrace pilha) => _resumo);
      final pagina = await pedidos;
      final numeros = await resumo;
      if (!mounted) return;
      setState(() {
        _pagina = pagina;
        _resumo = numeros;
        _carregando = false;
      });
    } on FalhaDeChamada catch (falha) {
      if (!mounted) return;
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
      await _carregar();
    } on FalhaDeChamada {
      if (!mounted) return;
      setState(() {
        _emCurso.remove(ref);
        _falha = TelaDePedidosDeConexao.falhaAoAgir;
      });
    }
  }

  @override
  Widget build(BuildContext context) {
    final cores = BichuColors.of(context).cores;
    final textos = Theme.of(context).textTheme;
    final itens = _pagina?.items ?? const <Conexao>[];

    // SEM CONTA A TELA INTEIRA E O CONVITE, e o filtro de caixa **nao**
    // aparece: dois segmentos que nao podem mudar nada sao um controle sem
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
            // O FILTRO NO TOPO DO CORPO, e não na barra: é o padrão de listagem
            // desta casa. Dois segmentos, porque não há uma terceira caixa.
            GrupoSegmentado<CaixaDePedidos>(
              rotulo: 'Caixa',
              selecionado: _caixa,
              opcoes: const <OpcaoSegmentada<CaixaDePedidos>>[
                OpcaoSegmentada<CaixaDePedidos>(
                  valor: CaixaDePedidos.recebidos,
                  rotulo: 'Recebidos',
                ),
                OpcaoSegmentada<CaixaDePedidos>(
                  valor: CaixaDePedidos.enviados,
                  rotulo: 'Enviados',
                ),
              ],
              aoSelecionar: (CaixaDePedidos escolhida) {
                setState(() => _caixa = escolhida);
                unawaited(_carregar());
              },
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
          Text(
            pedido.person.nomeParaLer ?? TelaDePedidosDeConexao.semNome,
            style: textos.titleMedium?.copyWith(color: cores.textPrimary),
          ),
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
