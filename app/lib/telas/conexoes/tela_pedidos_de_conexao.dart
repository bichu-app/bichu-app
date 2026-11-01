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
class TelaDePedidosDeConexao extends StatefulWidget {
  const TelaDePedidosDeConexao({
    required this.conexoes,
    super.key,
    this.aoMudarOsPedidos,
  });

  /// AVISA A CASCA DE QUE A CONTAGEM MUDOU NO SERVIDOR.
  final VoidCallback? aoMudarOsPedidos;

  /// Entregue por quem monta a tela.
  final ConexoesApi conexoes;

  static const String titulo = 'Pedidos de conexão';

  /// O QUE A PASTILHA DO CONTADOR QUER DIZER, em palavras.
  static String quantosEsperam(int quantos) => quantos == 1
      ? '1 pedido esperando você'
      : '$quantos pedidos esperando você';

  /// Os rotulos das duas caixas, como CHIPS no topo do corpo.
  static String rotuloDaCaixa(CaixaDePedidos caixa) =>
      caixa == CaixaDePedidos.recebidos ? 'Recebidos' : 'Enviados';
  static const String semNome = 'Usuário sem nome';
  static const String vazioRecebidos = 'Nenhum pedido esperando você';
  static const String vazioEnviados = 'Você não tem pedidos esperando resposta';
  static const String falhaAoCarregar = 'Não conseguimos carregar seus pedidos agora.';
  static const String falhaAoAgir = 'Não conseguimos registrar isso agora.';

  /// O rótulo acessível da PORTA DO PERFIL, no nome de quem pediu.
  static String rotuloDoPerfilDe(String quem) => 'Abrir o perfil de $quem';

  @override
  State<TelaDePedidosDeConexao> createState() => _EstadoDosPedidos();
}

class _EstadoDosPedidos extends State<TelaDePedidosDeConexao> {
  CaixaDePedidos _caixa = CaixaDePedidos.recebidos;

  final Map<CaixaDePedidos, PaginaDePedidosDeConexao> _paginas =
      <CaixaDePedidos, PaginaDePedidosDeConexao>{};

  ResumoDeConexoes? _resumo;
  bool _carregando = true;
  String? _falha;

  bool _faltaConta = false;
  final Set<String> _emCurso = <String>{};

  @override
  void initState() {
    super.initState();
    unawaited(_carregar());
  }

  Future<void> _carregar() async {
    final CaixaDePedidos caixa = _caixa;
    setState(() {
      _carregando = true;
      _falha = null;
      _faltaConta = false;
    });
    try {
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
        if (caixa == _caixa) _carregando = false;
      });
    } on FalhaDeChamada catch (falha) {
      if (!mounted) return;
      if (caixa != _caixa) return;
      setState(() {
        _carregando = false;
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
      _paginas.clear();
      widget.aoMudarOsPedidos?.call();
      await _carregar();
    } on FalhaDeChamada {
      if (!mounted) return;
      setState(() {
        _emCurso.remove(ref);
        _falha = TelaDePedidosDeConexao.falhaAoAgir;
      });
    }
  }

  void _trocarCaixa(CaixaDePedidos escolhida) {
    if (escolhida == _caixa) return;
    final bool jaVista = _paginas.containsKey(escolhida);
    setState(() {
      _caixa = escolhida;
      _falha = null;
    });
    if (!jaVista) unawaited(_carregar());
  }

  @override
  Widget build(BuildContext context) {
    final cores = BichuColors.of(context).cores;
    final textos = Theme.of(context).textTheme;
    final itens = _paginas[_caixa]?.items ?? const <Conexao>[];

    if (_faltaConta) {
      return const Padding(
        padding: EdgeInsets.all(BichuEspaco.e4),
        child: ConviteParaEntrar(secao: SecaoComConta.pedidosDeConexao),
      );
    }

    return
      ArrastarParaAtualizar(
        aoAtualizar: _carregar,
        child: ListView(
          padding: const EdgeInsets.all(BichuEspaco.e4),
          children: <Widget>[
            Semantics(
              container: true,
              label: 'Caixa',
              child: Wrap(
                spacing: BichuEspaco.e2,
                children: <Widget>[
                  for (final caixa in CaixaDePedidos.values)
                    ChoiceChip(
                      selected: _caixa == caixa,
                      onSelected: (_) => _trocarCaixa(caixa),
                      padding: const EdgeInsets.symmetric(
                        horizontal: BichuEspaco.e3,
                        vertical: BichuEspaco.e3,
                      ),
                      label: Text(
                        TelaDePedidosDeConexao.rotuloDaCaixa(caixa),
                      ),
                    ),
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
    );
  }

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

  Widget _nomeDeQuemPediu(
    BichuCores cores,
    TextTheme textos,
    Conexao pedido,
  ) {
    final nome = pedido.person.nomeParaLer ?? TelaDePedidosDeConexao.semNome;
    final estilo = textos.titleMedium?.copyWith(color: cores.textPrimary);
    final comSelo = pedido.person.canalConfirmado;
    final apelido = pedido.person.handle;
    if (apelido == null || apelido.isEmpty) {
      return NomeComSelo(nome: nome, comSelo: comSelo, estilo: estilo);
    }

    return Semantics(
      button: true,
      label: comSelo
          ? '${TelaDePedidosDeConexao.rotuloDoPerfilDe(nome)}, '
              '${SeloDeValidado.rotulo}'
          : TelaDePedidosDeConexao.rotuloDoPerfilDe(nome),
      excludeSemantics: true,
      child: InkWell(
        onTap: () => context.push(Rotas.perfilDe(apelido)),
        child: Container(
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
