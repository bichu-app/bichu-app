import 'dart:async';

import 'package:flutter/material.dart';
import 'package:go_router/go_router.dart';

import '../../api/conexoes_api.dart';
import '../../api/falhas.dart';
import '../../api/mensagens_de_erro.dart';
import '../../api/modelos_conexao.dart';
import '../../api/modelos_pessoa.dart';
import '../../api/pessoas_api.dart';
import '../../roteamento/rotas.dart';
import '../../theme/bichu_colors.dart';
import '../../theme/bichu_tokens.g.dart';
import '../../widgets/arrastar_para_atualizar.dart';
import '../../widgets/barra_de_listagem.dart';
import '../../widgets/convite_para_entrar.dart';
import '../../widgets/faixa_de_aviso.dart';
import '../../widgets/rodape_da_paginacao.dart';
import '../casca_com_abas.dart';
import 'cartao_de_pessoa_encontrada.dart';

/// O corpo da aba `Usuários` da `Rede`: **encontrar e adicionar pessoas**.
class BuscaDePessoas extends StatefulWidget {
  const BuscaDePessoas({
    required this.pessoas,
    required this.conexoes,
    required this.logado,
    super.key,
  });

  /// As duas portas entram por PARAMETRO e nao saem do `Escopo` aqui dentro, e
  /// o precedente e `TelaDePerfilDePessoa`: e isto que permite montar esta aba
  /// num teste de widget sem construir as vinte e nove dependencias do escopo
  /// so para exercitar um campo de busca.
  final PessoasApi pessoas;

  final ConexoesApi conexoes;

  /// Há sessão agora. **Entra como DADO, e não como ramo de desenho.**
  final bool logado;

  /// Quanto a tela espera, depois da última tecla, antes de buscar.
  static const Duration esperaAntesDeBuscar = Duration(milliseconds: 400);

  /// O rótulo do campo. Diz **as duas coisas que a busca aceita**, porque uma
  /// pessoa que não sabe que o apelido serve busca pelo nome e desiste.
  static const String rotuloDaBusca = 'Buscar usuários por nome ou apelido';

  static const String tituloAntesDeBuscar = 'Procure quem você já conhece';

  /// A explicação do estado inicial, e ela tem **duas frases curtas** — era uma
  /// até 22/10/2026, e a segunda só existe porque a primeira deixou de poder
  /// dizer as duas coisas (ver abaixo).
  static const String explicacaoAntesDeBuscar =
      'Digite o nome ou o apelido de alguém.';

  static const String tituloNadaEncontrado = 'Nada com esse nome';

  /// **A tela nunca diz "esta pessoa não existe".**
  static const String explicacaoNadaEncontrado =
      'Confira a escrita, ou busque pelo apelido. Quem não tem conta no Bichu '
      'não aparece aqui.';

  static const String carregando = 'Buscando usuários';

  static const SubstantivoDaListagem substantivo = SubstantivoDaListagem(
    singular: 'usuário',
    plural: 'usuários',
  );

  @override
  State<BuscaDePessoas> createState() => _EstadoDaBuscaDePessoas();
}

enum _Fase { antesDeBuscar, carregando, lista, falha }

class _EstadoDaBuscaDePessoas extends State<BuscaDePessoas>
    with PublicaAAtualizacao {
  final TextEditingController _campo = TextEditingController();

  _Fase _fase = _Fase.antesDeBuscar;

  /// O termo que **produziu** a lista na tela, e nunca o que está digitado.
  String? _termoAplicado;

  PaginaDeBuscaDePessoas? _pagina;
  final List<PessoaEncontrada> _itens = <PessoaEncontrada>[];
  bool _carregandoMais = false;
  String? _falhaDeMais;
  String? _textoDaFalha;
  bool _faltaConta = false;

  /// Quantos pedidos ainda cabem na janela corrida de 24 h, **vindo do
  /// servidor**.
  int? _pedidosQueAindaCabem;

  bool _visivel = false;
  bool _cargaAgendada = false;

  /// A espera em curso entre a última tecla e a busca, ou nulo.
  Timer? _espera;

  /// O texto da última notificação que MEXEU no texto.
  String _ultimoTexto = '';

  @override
  void initState() {
    super.initState();
    _campo.addListener(_aoDigitar);
  }

  @override
  Future<void> aoArrastarParaAtualizar() => _recarregar();

  /// **ENTRAR NA CONTA INVALIDA O ESTADO DA BUSCA.** Conserta um defeito
  /// medido.
  @override
  void didUpdateWidget(BuscaDePessoas anterior) {
    super.didUpdateWidget(anterior);
    if (anterior.logado == widget.logado) return;
    _espera?.cancel();
    _limparABusca();
    _agendarLeituraDoTeto();
  }

  @override
  void didChangeDependencies() {
    super.didChangeDependencies();
    if (!TickerMode.valuesOf(context).enabled) {
      _visivel = false;
      return;
    }
    if (_visivel) return;
    _visivel = true;
    _agendarLeituraDoTeto();
  }

  void _agendarLeituraDoTeto() {
    if (_cargaAgendada) return;
    _cargaAgendada = true;
    WidgetsBinding.instance.addPostFrameCallback((_) {
      _cargaAgendada = false;
      if (mounted) unawaited(_lerOTeto());
    });
  }

  @override
  void dispose() {
    _espera?.cancel();
    _campo.removeListener(_aoDigitar);
    _campo.dispose();
    super.dispose();
  }

  ConexoesApi get _conexoes => widget.conexoes;

  PessoasApi get _pessoas => widget.pessoas;

  /// Lê `getMyConnectionSummary` **antes de qualquer pedido**.
  Future<void> _lerOTeto() async {
    try {
      final resumo = await _conexoes.resumo();
      if (!mounted) return;
      setState(() => _pedidosQueAindaCabem = resumo.remainingRequestsToday);
    } on FalhaDeChamada {
      if (!mounted) return;
      setState(() => _pedidosQueAindaCabem = null);
    }
  }

  Future<void> _recarregar() async {
    final termo = _termoAplicado;
    if (termo == null) {
      await _lerOTeto();
      return;
    }
    await _buscar(termo);
  }

  Future<void> _buscar(String termo) async {
    setState(() {
      _fase = _Fase.carregando;
      _termoAplicado = termo;
      _itens.clear();
      _pagina = null;
      _textoDaFalha = null;
      _falhaDeMais = null;
      _faltaConta = false;
    });
    try {
      final pagina = await _pessoas.buscar(termo);
      if (!mounted) return;
      setState(() {
        _pagina = pagina;
        _itens.addAll(pagina.itens);
        _fase = _Fase.lista;
      });
      await _lerOTeto();
    } on FalhaDeChamada catch (falha) {
      if (!mounted) return;
      setState(() {
        _fase = _Fase.falha;
        _faltaConta = faltaConta(falha);
        _textoDaFalha = MensagensDeErro.de(falha).texto;
      });
    }
  }

  /// A reação à tecla: **agenda**, e nunca busca na hora.
  void _aoDigitar() {
    final texto = _campo.text;
    if (texto == _ultimoTexto) return;
    _ultimoTexto = texto;
    _espera?.cancel();

    final digitado = texto.trim();
    if (digitado.length < PessoasApi.minimoDaBusca) {
      if (_termoAplicado != null || _fase != _Fase.antesDeBuscar) {
        _limparABusca();
      } else {
        setState(() {});
      }
      return;
    }

    if (digitado == _termoAplicado) {
      setState(() {});
      return;
    }

    _espera = Timer(BuscaDePessoas.esperaAntesDeBuscar, () {
      if (!mounted) return;
      final termo = _campo.text.trim();
      if (termo.length < PessoasApi.minimoDaBusca) return;
      if (termo == _termoAplicado) return;
      unawaited(_buscar(termo));
    });
    setState(() {});
  }

  /// A explicação do vazio: a contagem de letras **quando ela existe**.
  String? _explicacaoDoVazio() {
    final faltam = _controleDaBusca().faltamLetras;
    if (faltam == null) return null;
    return '${faltam[0].toUpperCase()}${faltam.substring(1)}.';
  }

  void _limparABusca() {
    _espera?.cancel();
    setState(() {
      _fase = _Fase.antesDeBuscar;
      _termoAplicado = null;
      _itens.clear();
      _pagina = null;
      _textoDaFalha = null;
      _falhaDeMais = null;
      _faltaConta = false;
    });
  }

  Future<void> _carregarMais() async {
    final atual = _pagina;
    final termo = _termoAplicado;
    if (atual == null || termo == null || _carregandoMais) return;
    setState(() {
      _carregandoMais = true;
      _falhaDeMais = null;
    });
    try {
      final proxima = await _pessoas.buscar(termo, pagina: atual.pagina + 1);
      if (!mounted) return;
      setState(() {
        _pagina = proxima;
        _itens.addAll(proxima.itens);
        _carregandoMais = false;
      });
    } on FalhaDeChamada catch (falha) {
      if (!mounted) return;
      setState(() {
        _carregandoMais = false;
        _falhaDeMais = MensagensDeErro.de(falha).texto;
      });
    }
  }

  /// O pedido de conexão **a partir do cartão**, e o estado que ele devolve.
  Future<Conexao?> _pedir(PessoaEncontrada pessoa) async {
    final conexao = await _conexoes.pedirPorApelido(
      apelido: pessoa.handle,
      idempotencyKey: 'conexao-apelido-${pessoa.handle}',
    );
    unawaited(_lerOTeto());
    return conexao;
  }

  ControleDeBusca _controleDaBusca() {
    return ControleDeBusca(
      controlador: _campo,
      alcance: AlcanceDaBusca.servidor,
      rotulo: BuscaDePessoas.rotuloDaBusca,
      termoAplicado: _termoAplicado,
      minimoDeCaracteres: PessoasApi.minimoDaBusca,
      aoAplicar: (termo) {
        _espera?.cancel();
        if (termo == null) {
          _limparABusca();
          return;
        }
        unawaited(_buscar(termo));
      },
    );
  }

  @override
  Widget build(BuildContext context) {
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: <Widget>[
        BuscaNoTopoFixo(
          total: _pagina?.total ?? 0,
          busca: _controleDaBusca(),
        ),
        ..._contagem(),
        ..._corpo(),
      ],
    );
  }

  /// A contagem do resultado, **só com termo aplicado**.
  List<Widget> _contagem() {
    final pagina = _pagina;
    if (pagina == null || _termoAplicado == null) return const <Widget>[];
    final substantivo = pagina.total == 1
        ? BuscaDePessoas.substantivo.singular
        : BuscaDePessoas.substantivo.plural;
    return <Widget>[
      const SizedBox(height: BichuEspaco.e3),
      Text(
        '${pagina.total} $substantivo',
        style: Theme.of(context).textTheme.bodySmall?.copyWith(
          color: BichuColors.of(context).cores.textSecondary,
        ),
      ),
    ];
  }

  List<Widget> _corpo() {
    switch (_fase) {
      case _Fase.antesDeBuscar:
        return <Widget>[
          const SizedBox(height: BichuEspaco.e8),
          EstadoVazio(
            titulo: BuscaDePessoas.tituloAntesDeBuscar,
            explicacao:
                _explicacaoDoVazio() ?? BuscaDePessoas.explicacaoAntesDeBuscar,
          ),
        ];

      case _Fase.carregando:
        return <Widget>[
          const SizedBox(height: BichuEspaco.e8),
          Center(
            child: Semantics(
              label: BuscaDePessoas.carregando,
              child: const CircularProgressIndicator(),
            ),
          ),
        ];

      case _Fase.falha:
        if (_faltaConta) {
          return <Widget>[
            const SizedBox(height: BichuEspaco.e6),
            const ConviteParaEntrar(secao: SecaoComConta.buscaDePessoas),
          ];
        }
        return <Widget>[
          const SizedBox(height: BichuEspaco.e6),
          FaixaDeAviso(
            texto: _textoDaFalha ?? _falhaSemTexto,
            rotuloDaAcao: 'Tentar de novo',
            aoTocarNaAcao: () => unawaited(_recarregar()),
          ),
        ];

      case _Fase.lista:
        if (_itens.isEmpty) {
          return const <Widget>[
            SizedBox(height: BichuEspaco.e8),
            EstadoVazio(
              titulo: BuscaDePessoas.tituloNadaEncontrado,
              explicacao: BuscaDePessoas.explicacaoNadaEncontrado,
            ),
          ];
        }
        final total = _pagina?.total ?? _itens.length;
        return <Widget>[
          const SizedBox(height: BichuEspaco.e4),
          for (final pessoa in _itens) ...<Widget>[
            CartaoDePessoaEncontrada(
              key: ValueKey<String>(pessoa.handle),
              pessoa: pessoa,
              pedidosQueAindaCabem: _pedidosQueAindaCabem,
              aoPedir: () => _pedir(pessoa),
              aoEncerrar: (ref) => _conexoes.encerrar(ref),
              aoAceitar: (ref) => _conexoes.aceitar(ref),
              aoAbrirOPerfil: () =>
                  context.push(Rotas.perfilDe(pessoa.handle)),
            ),
            const SizedBox(height: BichuEspaco.e3),
          ],
          RodapeDaPaginacao(
            carregados: _itens.length,
            total: total,
            carregando: _carregandoMais,
            textoDaFalha: _falhaDeMais,
            aoPedirMais: () => unawaited(_carregarMais()),
            fimDaLista: _fimDaLista,
          ),
        ];
    }
  }

  /// O texto quando a falha chegou sem mensagem legivel.
  static const String _falhaSemTexto = 'Não foi possível buscar agora.';

  /// O fim da lista, **nos dois ramos, e eles mudam JUNTOS**.
  String _fimDaLista(int total) {
    if (total == 1) return 'Um usuário encontrado em sua busca.';
    return 'Você viu todos os $total usuários encontrados em sua busca.';
  }
}
