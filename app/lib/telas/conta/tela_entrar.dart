import 'dart:async';

import 'package:flutter/material.dart';
import 'package:go_router/go_router.dart';

import '../../api/falhas.dart';
import '../../api/mensagens_de_erro.dart';
import '../../escopo.dart';
import '../../formato/email.dart';
import '../../intencao/ir_para_o_destino.dart';
import '../../roteamento/rotas.dart';
import '../../theme/bichu_tokens.g.dart';
import '../../widgets/convite_de_passkey.dart';
import '../../widgets/barra_de_acao_fixa.dart';
import '../../widgets/bichu_field.dart';
import '../../widgets/botao_primario.dart';
import '../../widgets/faixa_de_aviso.dart';
import '../../widgets/saida_da_tela.dart';

/// C.2 — Entrar.
class TelaEntrar extends StatefulWidget {
  const TelaEntrar({super.key, this.emailInicial});

  final String? emailInicial;

  @override
  State<TelaEntrar> createState() => _TelaEntrarState();
}

class _TelaEntrarState extends State<TelaEntrar> {
  late final TextEditingController _email = TextEditingController(
    text: widget.emailInicial ?? '',
  );
  final TextEditingController _senha = TextEditingController();

  final FocusNode _focoDoEmail = FocusNode();
  final FocusNode _focoDaSenha = FocusNode();

  final ScrollController _rolagem = ScrollController();

  /// Onde a faixa de recusa nasce, para `_levarAte` ter um alvo.
  final GlobalKey _alvoDaFaixa = GlobalKey();

  bool _senhaVisivel = false;
  bool _enviando = false;
  MensagemDeErro? _faixa;
  String? _erroDoEmail;
  String? _erroDaSenha;

  @override
  void initState() {
    super.initState();
    WidgetsBinding.instance.addPostFrameCallback((_) {
      if (!mounted) return;
      _tentarPasskey();
    });
  }

  /// Tenta entrar com uma passkey que **ja exista** no aparelho.
  Future<void> _tentarPasskey() async {
    final escopo = Escopo.of(context);
    final sessao = await escopo.passkey.tentarEntrar();
    if (sessao == null) return;
    if (!mounted) return;

    await escopo.sessao.abrir(sessao);
    final destino = await escopo.guarda.executarDepoisDoLogin();
    if (!mounted) return;
    irParaODestinoDoLogin(context, destino);
  }

  @override
  void dispose() {
    _email.dispose();
    _senha.dispose();
    _focoDoEmail.dispose();
    _focoDaSenha.dispose();
    _rolagem.dispose();
    super.dispose();
  }

  /// Traz o alvo da recusa para dentro da janela.
  void _levarAte(GlobalKey alvo) {
    WidgetsBinding.instance.addPostFrameCallback((_) {
      final contexto = alvo.currentContext;
      if (contexto == null) return;
      Scrollable.ensureVisible(
        contexto,
        alignment: 0.5,
        duration: const Duration(milliseconds: 250),
        curve: Curves.easeOut,
      );
    });
  }

  /// Validacao local, antes de gastar uma ida a rede.
  bool _camposPreenchidos() {
    final email = _email.text.trim();
    final senha = _senha.text;

    String? erroDoEmail;
    if (email.isEmpty) {
      erroDoEmail = MensagensDeErro.digiteSeuEmail;
    } else if (!emailPlausivel(email)) {
      erroDoEmail = MensagensDeErro.confiraOEmail;
    }
    final erroDaSenha = senha.isEmpty ? MensagensDeErro.digiteSuaSenha : null;

    if (erroDoEmail == null && erroDaSenha == null) return true;

    setState(() {
      _erroDoEmail = erroDoEmail;
      _erroDaSenha = erroDaSenha;
    });
    (erroDoEmail != null ? _focoDoEmail : _focoDaSenha).requestFocus();
    return false;
  }

  /// Conferencia ao sair do campo, com a mensagem curta de
  /// `formato/email.dart`.
  void _conferirOEmailAoSair() {
    final erro = erraAoSairDoCampo(_email.text) ? erroAoSairDoEmail : null;
    if (erro != _erroDoEmail) setState(() => _erroDoEmail = erro);
  }

  Future<void> _entrar() async {
    setState(() {
      _faixa = null;
      _erroDoEmail = null;
      _erroDaSenha = null;
    });

    if (!_camposPreenchidos()) return;

    setState(() => _enviando = true);

    final escopo = Escopo.of(context);
    try {
      final sessao = await escopo.auth.entrar(
        email: _email.text.trim(),
        senha: _senha.text,
      );
      await escopo.sessao.abrir(sessao);
      if (await escopo.passkey.deveOferecerCadastro()) {
        if (!mounted) return;
        setState(() => _enviando = false);
        await mostrarConviteDePasskey(context, permitirRecusaFormal: true);
        if (!mounted) return;
      }
      final destino = await escopo.guarda.executarDepoisDoLogin();
      if (!mounted) return;
      irParaODestinoDoLogin(context, destino);
    } on FalhaDeChamada catch (falha) {
      if (!mounted) return;
      setState(() => _faixa = MensagensDeErro.deEntrar(falha));
      _levarAte(_alvoDaFaixa);
    } on Object catch (erro, pilha) {
      registrarFalhaInesperada(erro, pilha, onde: 'ao entrar na conta');
      if (!mounted) return;
      setState(
        () =>
            _faixa = const MensagemDeErro(texto: MensagensDeErro.servidorFora),
      );
      _levarAte(_alvoDaFaixa);
    } finally {
      if (mounted) setState(() => _enviando = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    final tecladoAberto = MediaQuery.viewInsetsOf(context).bottom > 0;
    final alturaDaTela = MediaQuery.sizeOf(context).height;

    return Scaffold(
      appBar: const BarraDeConta(titulo: 'Entrar', saida: TipoDeSaida.voltar),
      bottomNavigationBar: BarraDeAcaoFixa(
        acoes: <Widget>[
          BotaoPrimario(
            rotulo: 'Entrar',
            carregando: _enviando,
            aoTocar: _entrar,
          ),
        ],
      ),
      body: SafeArea(
        child: SingleChildScrollView(
          controller: _rolagem,
          padding: const EdgeInsets.all(BichuEspaco.e4),
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.stretch,
            children: <Widget>[
              if (!tecladoAberto) ...<Widget>[
                _IlustracaoDaEntrada(alturaDaTela: alturaDaTela),
                const SizedBox(height: BichuEspaco.e6),
              ],
              BichuField(
                rotulo: 'E-mail',
                controlador: _email,
                foco: _focoDoEmail,
                erro: _erroDoEmail,
                tipoDeTeclado: TextInputType.emailAddress,
                autofill: const <String>[AutofillHints.email],
                correcaoAutomatica: false,
                capitalizacao: TextCapitalization.none,
                acaoDeTeclado: TextInputAction.next,
                aoPerderFoco: _conferirOEmailAoSair,
                aoMudar: _erroDoEmail == null
                    ? null
                    : (_) => setState(() => _erroDoEmail = null),
              ),
              const SizedBox(height: BichuEspaco.e6),
              BichuField(
                rotulo: 'Senha',
                controlador: _senha,
                foco: _focoDaSenha,
                erro: _erroDaSenha,
                aoMudar: _erroDaSenha == null
                    ? null
                    : (_) => setState(() => _erroDaSenha = null),
                obscurecer: !_senhaVisivel,
                autofill: const <String>[AutofillHints.password],
                correcaoAutomatica: false,
                acaoDeTeclado: TextInputAction.done,
                aoEnviar: (_) => _entrar(),
                sufixo: BotaoRevelarSenha(
                  visivel: _senhaVisivel,
                  aoAlternar: () =>
                      setState(() => _senhaVisivel = !_senhaVisivel),
                ),
              ),
              const SizedBox(height: BichuEspaco.e4),
              Align(
                alignment: Alignment.centerLeft,
                child: TextButton(
                  onPressed: () => context.push(
                    Rotas.esqueciMinhaSenha,
                    extra: _email.text.trim(),
                  ),
                  child: const Text('Esqueci minha senha'),
                ),
              ),
              if (_faixa != null) ...<Widget>[
                const SizedBox(height: BichuEspaco.e6),
                FaixaDeAviso(
                  key: _alvoDaFaixa,
                  texto: _faixa!.texto,
                  rotuloDaAcao: _faixa!.acao,
                  aoTocarNaAcao: _faixa!.acao == null
                      ? null
                      : () => context.push(
                          Rotas.esqueciMinhaSenha,
                          extra: _email.text.trim(),
                        ),
                ),
              ],
              const SizedBox(height: BichuEspaco.e6),
              Center(
                child: TextButton(
                  onPressed: () => context.pushReplacement(Rotas.criarConta),
                  child: const Text('Criar conta'),
                ),
              ),
            ],
          ),
        ),
      ),
    );
  }
}

/// A ilustracao da identidade visual no alto da tela de entrar.
class _IlustracaoDaEntrada extends StatelessWidget {
  const _IlustracaoDaEntrada({required this.alturaDaTela});

  /// Altura da tela medida acima do `Scaffold`.
  final double alturaDaTela;

  static const String caminho = 'assets/ilustracoes/tres-pessoas-no-parque.webp';

  /// Fracao da altura da tela que a ilustracao pode ocupar.
  static const double _fracaoDaAltura = 0.2;

  /// Piso e teto, em passos do espaco do tema (`BichuEspaco.e16` = 64).
  static const double _piso = BichuEspaco.e16 * 2;
  static const double _teto = BichuEspaco.e16 * 3;

  static double alturaPara(double alturaDaTela) =>
      (alturaDaTela * _fracaoDaAltura).clamp(_piso, _teto);

  @override
  Widget build(BuildContext context) {
    return Image.asset(
      caminho,
      height: alturaPara(alturaDaTela),
      fit: BoxFit.contain,
      excludeFromSemantics: true,
      filterQuality: FilterQuality.medium,
    );
  }
}
