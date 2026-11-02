import 'dart:async';

import 'package:flutter/material.dart';

import '../../api/conexoes_api.dart';
import '../../api/falhas.dart';
import '../../api/me_api.dart';
import '../../api/mensagens_de_erro.dart';
import '../../api/modelos.dart';
import '../../api/modelos_conexao.dart';
import '../../api/modelos_pessoa.dart';
import '../../api/pessoas_api.dart';
import '../../theme/bichu_tokens.g.dart';
import '../../widgets/botao_primario.dart';
import '../../widgets/faixa_de_aviso.dart';
import '../../widgets/rodape_da_paginacao.dart';
import '../casca_com_abas.dart';
import 'cartao_de_pessoa_encontrada.dart';

/// **A LISTAGEM DE USUÁRIOS DA MESMA REGIÃO** (cliente, 02/11/2026), que mora no
/// lugar onde a aba `Usuários` antes só dizia *"Procure quem você já conhece"*.
///
/// Ela não é uma aba nova nem uma tela nova, e isso é desenho e não economia: o
/// pedido dele foi uma listagem de usuários **que as pessoas podem adicionar**,
/// e o lugar onde se adiciona usuário já existe. Uma aba própria daria dois
/// lugares para a mesma coisa.
class ListaDaRegiao extends StatefulWidget {
  const ListaDaRegiao({
    required this.pessoas,
    required this.conexoes,
    required this.me,
    required this.usuario,
    required this.aoAtualizarOUsuario,
    required this.aoAbrirOPerfil,
    super.key,
    this.pedidosQueAindaCabem,
  });

  /// As portas entram por PARÂMETRO e não saem do `Escopo` aqui dentro, pelo
  /// mesmo motivo de `BuscaDePessoas`: montar isto num teste de widget não pode
  /// exigir construir as vinte e nove dependências do escopo.
  final PessoasApi pessoas;

  final ConexoesApi conexoes;

  /// `updateMe`, para **ligar** a adesão daqui.
  final MeApi me;

  /// A conta de quem olha, ou nulo quando não há sessão.
  ///
  /// **É daqui que vem o motivo do vazio**, e não do servidor: a resposta é
  /// página vazia para quem não aderiu, e distinguir os casos no servidor seria
  /// o oráculo que diz *"existe gente aí, mas não para você"*.
  final Usuario? usuario;

  /// Repõe a conta na sessão depois de ligar a adesão.
  final Future<void> Function(Usuario) aoAtualizarOUsuario;

  final void Function(String apelido) aoAbrirOPerfil;

  final int? pedidosQueAindaCabem;

  static const String tituloDaSecao = 'Usuários da sua região';

  static const String tituloSemAdesao = 'Você ainda não aparece nesta lista';

  /// **A tela EXPLICA e OFERECE A SAÍDA**, e não mostra um vazio mudo.
  ///
  /// A reciprocidade está dita em voz alta: quem não aparece não vê. É a
  /// recomendação desta frente, e o cliente pode revertê-la.
  static const String explicacaoSemAdesao =
      'Esta lista mostra quem mora na sua cidade e escolheu aparecer nela. '
      'Enquanto você não escolher, você não aparece e não vê quem apareceu.';

  static const String ligarAAdesao = 'Aparecer na lista';

  static const String tituloSemRegiao = 'Falta a sua cidade';

  static const String explicacaoSemRegiao =
      'Preencha o endereço de referência em Meus dados para a gente saber qual '
      'é a sua região. É o mesmo endereço que define o alcance do alerta de pet '
      'perdido.';

  static const String tituloSemNinguem = 'Ninguém por aqui ainda';

  static const String explicacaoSemNinguem =
      'Você já aparece na lista da sua cidade. Ninguém mais da sua cidade '
      'escolheu aparecer até agora.';

  static const String carregando = 'Carregando usuários da sua região';

  static const String ondeDesligar =
      'Para sair da lista, desligue em Meus dados.';

  @override
  State<ListaDaRegiao> createState() => _EstadoDaListaDaRegiao();
}

enum _Fase { carregando, lista, falha }

class _EstadoDaListaDaRegiao extends State<ListaDaRegiao> {
  _Fase _fase = _Fase.carregando;

  PaginaDaRegiao? _pagina;
  final List<PessoaDaRegiao> _itens = <PessoaDaRegiao>[];
  bool _carregandoMais = false;
  String? _falhaDeMais;
  String? _textoDaFalha;
  bool _ligando = false;
  bool _pedida = false;

  bool get _aderiu => widget.usuario?.naListaDaRegiao ?? false;

  bool get _temRegiao =>
      widget.usuario?.regiaoDeReferencia?.cidade != null &&
      widget.usuario?.regiaoDeReferencia?.uf != null;

  @override
  void initState() {
    super.initState();
    _pedirSePuder();
  }

  /// **ENTRAR NA CONTA, LIGAR OU DESLIGAR A ADESÃO INVALIDAM A LISTA.** Sem
  /// isto, desligar em `Meus dados` deixaria a lista anterior na tela, o que
  /// faria o produto mentir sobre uma escolha de privacidade.
  @override
  void didUpdateWidget(ListaDaRegiao anterior) {
    super.didUpdateWidget(anterior);
    final mudou =
        anterior.usuario?.naListaDaRegiao != widget.usuario?.naListaDaRegiao ||
        anterior.usuario?.id != widget.usuario?.id;
    if (!mudou) return;
    _pedida = false;
    _itens.clear();
    _pagina = null;
    _textoDaFalha = null;
    _falhaDeMais = null;
    _fase = _Fase.carregando;
    _pedirSePuder();
  }

  /// **A rota não é chamada quando a tela já sabe que a resposta é vazia.** O
  /// teto de 60/h por conta não é gasto para receber uma página vazia que a
  /// conta de quem olha já explicava.
  void _pedirSePuder() {
    if (!_aderiu || !_temRegiao) {
      _fase = _Fase.lista;
      return;
    }
    if (_pedida) return;
    _pedida = true;
    unawaited(_carregar());
  }

  Future<void> _carregar() async {
    setState(() {
      _fase = _Fase.carregando;
      _itens.clear();
      _pagina = null;
      _textoDaFalha = null;
      _falhaDeMais = null;
    });
    try {
      final pagina = await widget.pessoas.daMinhaRegiao();
      if (!mounted) return;
      setState(() {
        _pagina = pagina;
        _itens.addAll(pagina.itens);
        _fase = _Fase.lista;
      });
    } on FalhaDeChamada catch (falha) {
      if (!mounted) return;
      setState(() {
        _fase = _Fase.falha;
        _textoDaFalha = MensagensDeErro.de(falha).texto;
      });
    }
  }

  Future<void> _carregarMais() async {
    final atual = _pagina;
    if (atual == null || _carregandoMais) return;
    setState(() {
      _carregandoMais = true;
      _falhaDeMais = null;
    });
    try {
      final proxima = await widget.pessoas.daMinhaRegiao(
        pagina: atual.pagina + 1,
      );
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

  /// Liga a adesão daqui. **Desligar não está nesta tela de propósito**: o
  /// interruptor mora em `Meus dados`, e duas portas de desligar seriam dois
  /// lugares onde uma pode faltar.
  Future<void> _ligar() async {
    if (_ligando) return;
    setState(() {
      _ligando = true;
      _textoDaFalha = null;
    });
    try {
      final dados = await widget.me.atualizar(naListaDaRegiao: true);
      await widget.aoAtualizarOUsuario(dados.usuario);
      if (!mounted) return;
      setState(() => _ligando = false);
      // A lista entra agora: `didUpdateWidget` só é chamado quando o pai
      // reconstrói, e `aoAtualizarOUsuario` pode não ter chegado até aqui ainda.
      _pedida = false;
      _pedirSePuder();
    } on FalhaDeChamada catch (falha) {
      if (!mounted) return;
      setState(() {
        _ligando = false;
        _textoDaFalha = MensagensDeErro.de(falha).texto;
      });
    }
  }

  Future<Conexao?> _pedir(PessoaDaRegiao pessoa) async {
    return widget.conexoes.pedirPorApelido(
      apelido: pessoa.handle,
      idempotencyKey: 'conexao-apelido-${pessoa.handle}',
    );
  }

  @override
  Widget build(BuildContext context) {
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: _corpo(),
    );
  }

  List<Widget> _corpo() {
    if (widget.usuario == null) return const <Widget>[];

    if (!_temRegiao) {
      return <Widget>[
        const SizedBox(height: BichuEspaco.e8),
        const EstadoVazio(
          titulo: ListaDaRegiao.tituloSemRegiao,
          explicacao: ListaDaRegiao.explicacaoSemRegiao,
        ),
      ];
    }

    if (!_aderiu) {
      return <Widget>[
        const SizedBox(height: BichuEspaco.e8),
        EstadoVazio(
          titulo: ListaDaRegiao.tituloSemAdesao,
          explicacao: ListaDaRegiao.explicacaoSemAdesao,
          acao: BotaoPrimario(
            rotulo: ListaDaRegiao.ligarAAdesao,
            carregando: _ligando,
            aoTocar: () => unawaited(_ligar()),
          ),
        ),
        ..._avisoDaFalha(),
      ];
    }

    switch (_fase) {
      case _Fase.carregando:
        return <Widget>[
          const SizedBox(height: BichuEspaco.e8),
          Center(
            child: Semantics(
              label: ListaDaRegiao.carregando,
              child: const CircularProgressIndicator(),
            ),
          ),
        ];

      case _Fase.falha:
        return <Widget>[
          const SizedBox(height: BichuEspaco.e6),
          FaixaDeAviso(
            texto: _textoDaFalha ?? _falhaSemTexto,
            rotuloDaAcao: 'Tentar de novo',
            aoTocarNaAcao: () => unawaited(_carregar()),
          ),
        ];

      case _Fase.lista:
        if (_itens.isEmpty) {
          return const <Widget>[
            SizedBox(height: BichuEspaco.e8),
            EstadoVazio(
              titulo: ListaDaRegiao.tituloSemNinguem,
              explicacao: ListaDaRegiao.explicacaoSemNinguem,
            ),
          ];
        }
        final total = _pagina?.total ?? _itens.length;
        return <Widget>[
          const SizedBox(height: BichuEspaco.e6),
          Text(
            ListaDaRegiao.tituloDaSecao,
            style: Theme.of(context).textTheme.titleMedium,
          ),
          const SizedBox(height: BichuEspaco.e4),
          for (final pessoa in _itens) ...<Widget>[
            CartaoDePessoaEncontrada(
              key: ValueKey<String>('regiao-${pessoa.handle}'),
              // **O MESMO CARTÃO DA BUSCA, e nenhuma ação nova**: `Pedir
              // conexão` já mora nele, e tocar nele abre o perfil — o caminho
              // que o Mural já usa. A foto é nula na conversão, de propósito.
              pessoa: pessoa.comoPessoaEncontrada(),
              pedidosQueAindaCabem: widget.pedidosQueAindaCabem,
              aoPedir: () => _pedir(pessoa),
              aoEncerrar: (ref) => widget.conexoes.encerrar(ref),
              aoAceitar: (ref) => widget.conexoes.aceitar(ref),
              aoAbrirOPerfil: () => widget.aoAbrirOPerfil(pessoa.handle),
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

  List<Widget> _avisoDaFalha() {
    final texto = _textoDaFalha;
    if (texto == null) return const <Widget>[];
    return <Widget>[
      const SizedBox(height: BichuEspaco.e4),
      FaixaDeAviso(texto: texto),
    ];
  }

  static const String _falhaSemTexto =
      'Não foi possível carregar a sua região agora.';

  String _fimDaLista(int total) {
    if (total == 1) return 'Um usuário da sua região aparece nesta lista.';
    return 'Você viu todos os $total usuários da sua região que aparecem '
        'nesta lista.';
  }
}
