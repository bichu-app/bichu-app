import 'dart:async';

import 'package:flutter/material.dart';
import 'package:go_router/go_router.dart';

import '../../api/conexoes_api.dart';
import '../../api/falhas.dart';
import '../../api/mensagens_de_erro.dart';
import '../../api/modelos_conexao.dart';
import '../../roteamento/rotas.dart';
import '../../theme/bichu_colors.dart';
import '../../theme/bichu_tokens.g.dart';
import '../../widgets/arrastar_para_atualizar.dart';
import '../../widgets/botao_primario.dart';
import '../../widgets/convite_para_entrar.dart';
import '../../widgets/faixa_de_aviso.dart';
import '../../widgets/ficha_da_pessoa.dart';

/// **AS CONEXÕES DA PRÓPRIA CONTA.** Decisão do cliente de **22/10/2026**,
/// literal:
class TelaDeMinhasConexoes extends StatefulWidget {
  const TelaDeMinhasConexoes({required this.conexoes, super.key});

  /// Entregue por quem monta a tela — a mesma forma de
  /// `TelaDePedidosDeConexao`.
  final ConexoesApi conexoes;

  /// **O NOME DA TELA.** O termo do contrato, e o que o resto do app escreve.
  static const String titulo = 'Conexões';

  static const String semNome = 'Usuário sem nome';
  static const String vazio = 'Você ainda não tem conexões';
  static const String comoComecar =
      'Busque alguém que você já conhece na aba Usuários da Comunidade, '
      'ou compartilhe o seu convite.';
  static const String falhaAoCarregar =
      'Não conseguimos carregar as suas conexões agora.';
  static const String verMais = 'Ver mais';

  /// **O BOTAO DE ADICIONAR, pedido dele em 22/10/2026**, literal: *"uma pagina
  /// com a listagem dos usuarios **e um botao para adicionar**"*.
  static const String buscarUsuarios = 'Buscar usuários';

  /// O lado do círculo da foto.
  static const double ladoDoCirculo = 56;

  /// O lado de dentro do círculo quando não há letra aproveitável.
  static const String inicialDeQuemNaoTem = '·';

  static String rotuloDePets(int quantos) => quantos == 1 ? '1 pet' : '$quantos pets';

  static String rotuloDeConexoes(int quantas) =>
      quantas == 1 ? '1 conexão' : '$quantas conexões';

  /// O rótulo acessível da PORTA DO PERFIL, no nome da pessoa.
  static String rotuloDoPerfilDe(String quem) => 'Abrir o perfil de $quem';

  /// A linha de números, **do servidor e nunca de constante deste binário**: o
  /// teto é número que se sobe depois, e um build antigo com o número gravado
  /// mostraria um limite que deixou de valer.
  static String linhaDoResumo(int quantas, int teto) =>
      'Você tem $quantas de $teto conexões.';

  @override
  State<TelaDeMinhasConexoes> createState() => _EstadoDasMinhasConexoes();
}

class _EstadoDasMinhasConexoes extends State<TelaDeMinhasConexoes> {
  /// As pessoas já carregadas, de todas as páginas pedidas até agora.
  final List<PessoaConectada> _pessoas = <PessoaConectada>[];
  int _total = 0;
  int _proximaPagina = 1;
  ResumoDeConexoes? _resumo;
  bool _carregando = true;
  bool _carregandoMais = false;
  String? _falha;

  /// A falha foi **falta de conta**, e não defeito.
  bool _faltaConta = false;

  @override
  void initState() {
    super.initState();
    unawaited(_carregar());
  }

  /// Carrega a PRIMEIRA página, do zero.
  Future<void> _carregar() async {
    setState(() {
      _carregando = true;
      _falha = null;
      _faltaConta = false;
    });
    try {
      final lista = widget.conexoes.listarConexoes();
      final resumo = widget.conexoes
          .resumo()
          .then<ResumoDeConexoes?>((ResumoDeConexoes r) => r)
          .onError<FalhaDeChamada>((Object erro, StackTrace pilha) => _resumo);
      final pagina = await lista;
      final numeros = await resumo;
      if (!mounted) return;
      setState(() {
        _pessoas
          ..clear()
          ..addAll(pagina.items);
        _total = pagina.total;
        _proximaPagina = 2;
        _resumo = numeros;
        _carregando = false;
      });
    } on FalhaDeChamada catch (falha) {
      if (!mounted) return;
      setState(() {
        _carregando = false;
        _faltaConta = faltaConta(falha);
        _falha = _faltaConta ? null : TelaDeMinhasConexoes.falhaAoCarregar;
      });
    } on Object catch (erro, pilha) {
      registrarFalhaInesperada(erro, pilha, onde: 'ao listar as minhas conexões');
      if (!mounted) return;
      setState(() {
        _carregando = false;
        _falha = MensagensDeErro.servidorFora;
      });
    }
  }

  /// A página seguinte, **acrescentada** ao que já está na tela.
  Future<void> _carregarMais() async {
    if (_carregandoMais) return;
    setState(() {
      _carregandoMais = true;
      _falha = null;
    });
    try {
      final pagina = await widget.conexoes.listarConexoes(pagina: _proximaPagina);
      if (!mounted) return;
      setState(() {
        _pessoas.addAll(pagina.items);
        _total = pagina.total;
        _proximaPagina += 1;
        _carregandoMais = false;
      });
    } on FalhaDeChamada {
      if (!mounted) return;
      setState(() {
        _carregandoMais = false;
        _falha = TelaDeMinhasConexoes.falhaAoCarregar;
      });
    } on Object catch (erro, pilha) {
      registrarFalhaInesperada(erro, pilha, onde: 'ao listar mais conexões');
      if (!mounted) return;
      setState(() {
        _carregandoMais = false;
        _falha = MensagensDeErro.servidorFora;
      });
    }
  }

  /// Ainda há página? **Pelo `total` do servidor**, e não por a última página
  /// ter vindo cheia: uma página cheia que é a última faria o botão aparecer e
  /// trazer vazio.
  bool get _temMais => _pessoas.length < _total;

  @override
  Widget build(BuildContext context) {
    final cores = BichuColors.of(context).cores;
    final textos = Theme.of(context).textTheme;

    if (_faltaConta) {
      return const Padding(
        padding: EdgeInsets.all(BichuEspaco.e4),
        child: ConviteParaEntrar(secao: SecaoComConta.minhasConexoes),
      );
    }

    return ArrastarParaAtualizar(
        aoAtualizar: _carregar,
        child: ListView(
          padding: const EdgeInsets.all(BichuEspaco.e4),
          children: <Widget>[
            if (_resumo != null) _linhaDoResumo(cores, textos, _resumo as ResumoDeConexoes),
            if (_falha != null) ...<Widget>[
              const SizedBox(height: BichuEspaco.e3),
              FaixaDeAviso(texto: _falha as String),
            ],
            const SizedBox(height: BichuEspaco.e4),
            if (_pessoas.isEmpty && !_carregando && _falha == null)
              _estadoVazio(cores, textos)
            else ...<Widget>[
              _acaoDeBuscar(),
              const SizedBox(height: BichuEspaco.e4),
              if (_carregando)
                const Center(
                  child: Padding(
                    padding: EdgeInsets.all(BichuEspaco.e8),
                    child: CircularProgressIndicator(),
                  ),
                )
              else ...<Widget>[
                ..._pessoas.map((PessoaConectada pessoa) => _linha(cores, textos, pessoa)),
                if (_temMais) _botaoDeVerMais(),
              ],
            ],
          ],
      ),
    );
  }

  /// **Só números**, e eles ficam ao lado da lista e não no lugar dela.
  Widget _linhaDoResumo(BichuCores cores, TextTheme textos, ResumoDeConexoes resumo) {
    return Semantics(
      container: true,
      child: Text(
        TelaDeMinhasConexoes.linhaDoResumo(resumo.connectedCount, resumo.connectionLimit),
        style: textos.bodySmall?.copyWith(color: cores.textSecondary),
      ),
    );
  }

  /// O vazio **diz o que fazer**, e o caminho que ele aponta existe: a busca de
  /// pessoas é a aba `Usuários` da `Comunidade`, e o convite é do próprio
  /// perfil.
  Widget _estadoVazio(BichuCores cores, TextTheme textos) {
    return Padding(
      padding: const EdgeInsets.symmetric(vertical: BichuEspaco.e8),
      child: Column(
        children: <Widget>[
          Text(
            TelaDeMinhasConexoes.vazio,
            style: textos.titleMedium?.copyWith(color: cores.textPrimary),
            textAlign: TextAlign.center,
          ),
          const SizedBox(height: BichuEspaco.e2),
          Text(
            TelaDeMinhasConexoes.comoComecar,
            style: textos.bodyMedium?.copyWith(color: cores.textSecondary),
            textAlign: TextAlign.center,
          ),
          const SizedBox(height: BichuEspaco.e4),
          _acaoDeBuscar(),
        ],
      ),
    );
  }

  /// `Buscar usuários` -- **a porta de adicionar desta tela**, construida num
  /// lugar so.
  BotaoPrimario _acaoDeBuscar() {
    return BotaoPrimario(
      rotulo: TelaDeMinhasConexoes.buscarUsuarios,
      icone: Icons.person_search_outlined,
      aoTocar: () => context.go(Rotas.redeNaBuscaDePessoas),
    );
  }

  Widget _botaoDeVerMais() {
    return Padding(
      padding: const EdgeInsets.only(top: BichuEspaco.e4),
      child: BotaoSecundario(
        rotulo: TelaDeMinhasConexoes.verMais,
        carregando: _carregandoMais,
        aoTocar: () => unawaited(_carregarMais()),
      ),
    );
  }

  /// UMA pessoa. **A linha inteira é a porta do perfil**, e aqui isso é seguro
  /// — ao contrário do cartão de pedido, que tem `Aceitar`/`Recusar` dentro e
  /// por isso só deixa o NOME ser tocável.
  Widget _linha(BichuCores cores, TextTheme textos, PessoaConectada pessoa) {
    final nome = pessoa.nomeParaLer;
    return Semantics(
      button: true,
      label: TelaDeMinhasConexoes.rotuloDoPerfilDe(nome),
      excludeSemantics: true,
      child: InkWell(
        onTap: () => context.push(Rotas.perfilDe(pessoa.handle)),
        child: Container(
          constraints: const BoxConstraints(minHeight: 64),
          padding: const EdgeInsets.symmetric(vertical: BichuEspaco.e2),
          child: Row(
            children: <Widget>[
              Expanded(
                child: FichaDaPessoa(
                  nome: nome,
                  urlDaFoto: pessoa.photoIconUrl,
                  comSelo: false,
                  lado: TelaDeMinhasConexoes.ladoDoCirculo,
                  estiloDoNome: textos.titleMedium?.copyWith(color: cores.textPrimary),
                  abaixoDoNome: Text(
                    '${TelaDeMinhasConexoes.rotuloDePets(pessoa.petsCount)} · '
                    '${TelaDeMinhasConexoes.rotuloDeConexoes(pessoa.connectionsCount)}',
                    style: textos.bodySmall?.copyWith(color: cores.textSecondary),
                  ),
                ),
              ),
              Icon(Icons.chevron_right, color: cores.textSecondary),
            ],
          ),
        ),
      ),
    );
  }

}
