import 'package:flutter/gestures.dart';
import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:go_router/go_router.dart';
import 'package:url_launcher/url_launcher.dart';

import '../../acessibilidade/anunciar.dart';
import '../../api/falhas.dart';
import '../../api/mensagens_de_erro.dart';
import '../../api/problem.dart';
import '../../config/app_config.dart';
import '../../escopo.dart';
import '../../formato/apelido.dart';
import '../../formato/data.dart';
import '../../formato/email.dart';
import '../../roteamento/rotas.dart';
import '../../roteamento/saida_da_mensagem.dart';
import '../../theme/bichu_colors.dart';
import '../../theme/bichu_tokens.g.dart';
import '../../validacao/nome_de_exibicao.dart';
import '../../validacao/politica_de_senha.dart';
import '../../widgets/barra_de_acao_fixa.dart';
import '../../widgets/bichu_field.dart';
import '../../widgets/botao_primario.dart';
import '../../widgets/convite_de_passkey.dart';
import '../../widgets/faixa_de_aviso.dart';
import '../../widgets/requisitos_da_senha.dart';
import '../../widgets/saida_da_tela.dart';

const String _semVersaoDosTermos =
    'Não conseguimos registrar o aceite dos termos nesta versão do app. '
    'Sem esse registro a conta não pode ser criada.';

const String _aceiteObrigatorio =
    'Para criar a conta, aceite os termos de uso e a política de privacidade.';

/// F1.1 — Criar conta.
class TelaCriarConta extends StatefulWidget {
  const TelaCriarConta({super.key, this.emailInicial});

  final String? emailInicial;

  @override
  State<TelaCriarConta> createState() => _TelaCriarContaState();
}

class _TelaCriarContaState extends State<TelaCriarConta> {
  final TextEditingController _nome = TextEditingController();
  late final TextEditingController _email =
      TextEditingController(text: widget.emailInicial ?? '');
  final TextEditingController _apelido = TextEditingController();
  final TextEditingController _nascimento = TextEditingController();
  final TextEditingController _senha = TextEditingController();
  final FocusNode _focoDoEmail = FocusNode();

  final ScrollController _rolagem = ScrollController();

  final GlobalKey _alvoDoNome = GlobalKey();
  final GlobalKey _alvoDoApelido = GlobalKey();
  final GlobalKey _alvoDoNascimento = GlobalKey();
  final GlobalKey _alvoDoEmail = GlobalKey();
  final GlobalKey _alvoDaSenha = GlobalKey();
  final GlobalKey _alvoDoAceite = GlobalKey();

  bool _senhaVisivel = false;
  bool _aceitouOsTermos = false;
  bool _enviando = false;
  String? _erroDoNome;
  String? _erroDoApelido;
  String? _erroDoNascimento;
  String? _erroDoEmail;
  String? _erroDaSenha;
  String? _erroDoAceite;
  MensagemDeErro? _faixa;

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

  @override
  void dispose() {
    _nome.dispose();
    _apelido.dispose();
    _nascimento.dispose();
    _email.dispose();
    _senha.dispose();
    _focoDoEmail.dispose();
    _rolagem.dispose();
    super.dispose();
  }

  String _comSugestoes(String recusa) {
    final List<String> saidas = IdentificadorDoApelido.sugestoes(_apelido.text);
    if (saidas.isEmpty) return recusa;
    return '$recusa Tente ${saidas.join(', ')}.';
  }

  Future<void> _criarConta() async {
    setState(() {
      _erroDoNome = null;
      _erroDoApelido = null;
      _erroDoNascimento = null;
      _erroDoEmail = null;
      _erroDaSenha = null;
      _erroDoAceite = null;
      _faixa = null;
    });

    final String? recusaDoNome = NomeDeExibicao.recusa(_nome.text);
    if (recusaDoNome != null) {
      setState(() => _erroDoNome = recusaDoNome);
      _levarAte(_alvoDoNome);
      return;
    }

    if (!IdentificadorDoApelido.vazio(_apelido.text)) {
      final String? recusaDoApelido = IdentificadorDoApelido.recusa(_apelido.text);
      if (recusaDoApelido != null) {
        setState(() => _erroDoApelido = _comSugestoes(recusaDoApelido));
        _levarAte(_alvoDoApelido);
        return;
      }
    }

    final String? recusaDoNascimento = IdadeMinima.recusa(
      _nascimento.text,
      agora: DateTime.now(),
    );
    if (recusaDoNascimento != null) {
      setState(() => _erroDoNascimento = recusaDoNascimento);
      _levarAte(_alvoDoNascimento);
      return;
    }

    if (!emailPlausivel(_email.text)) {
      setState(() => _erroDoEmail = 'Digite o e-mail da sua conta.');
      _focoDoEmail.requestFocus();
      _levarAte(_alvoDoEmail);
      return;
    }
    final violacoes = PoliticaDeSenha.violacoes(
      senha: _senha.text,
      email: _email.text.trim(),
      nome: _nome.text.trim(),
    );
    if (violacoes.isNotEmpty) {
      setState(() => _erroDaSenha = violacoes.first.mensagemDeErro);
      _levarAte(_alvoDaSenha);
      return;
    }

    final String? versaoDosTermos = AppConfig.instancia.versaoDosTermos;
    if (versaoDosTermos == null) {
      anunciar(context, _semVersaoDosTermos, urgente: true);
      if (_rolagem.hasClients) {
        await _rolagem.animateTo(
          0,
          duration: const Duration(milliseconds: 250),
          curve: Curves.easeOut,
        );
      }
      return;
    }
    if (!_aceitouOsTermos) {
      setState(() => _erroDoAceite = _aceiteObrigatorio);
      _levarAte(_alvoDoAceite);
      return;
    }

    setState(() => _enviando = true);
    final escopo = Escopo.of(context);
    try {
      final sessao = await escopo.auth.criarConta(
        email: _email.text.trim(),
        senha: _senha.text,
        nascimento: dataParaOContrato(_nascimento.text)!,
        apelido: apelidoParaOContrato(_apelido.text),
        nome: NomeDeExibicao.aparar(_nome.text),
        versaoDosTermos: versaoDosTermos,
      );
      await escopo.sessao.abrir(sessao);
      if (!mounted) return;

      setState(() => _enviando = false);

      await mostrarConviteDePasskey(context);
      if (!mounted) return;

      context.pushReplacement(
        Rotas.verifiqueSeuEmail,
        extra: sessao.usuario.email,
      );
    } on FalhaDeChamada catch (falha) {
      if (!mounted) return;
      _tratar(falha);
    } on Object catch (erro, pilha) {
      registrarFalhaInesperada(erro, pilha, onde: 'ao criar a conta');
      if (!mounted) return;
      setState(
        () => _faixa = const MensagemDeErro(texto: MensagensDeErro.servidorFora),
      );
    } finally {
      if (mounted) setState(() => _enviando = false);
    }
  }

  void _tratar(FalhaDeChamada falha) {
    if (falha is FalhaDaApi) {
      if (falha.tipo == ProblemTipo.emailJaCadastrado) {
        setState(() => _erroDoEmail = MensagensDeErro.emailJaCadastrado);
        _levarAte(_alvoDoEmail);
        return;
      }
      final campoDaSenha = falha.problem.campo('password');
      if (campoDaSenha != null) {
        final regra = PoliticaDeSenha.porCodigoDoServidor(campoDaSenha.codigo);
        setState(
          () => _erroDaSenha = regra?.mensagemDeErro ?? senhaRecusadaPeloServidor,
        );
        _levarAte(_alvoDaSenha);
        return;
      }
      if (falha.problem.status == 422) {
        setState(() => _erroDaSenha = senhaRecusadaPeloServidor);
        _levarAte(_alvoDaSenha);
        return;
      }
    }
    if (falha is FalhaDeConexao) {
      setState(() {
        _faixa = const MensagemDeErro(
          texto: 'Não conseguimos criar sua conta agora. Verifique a conexão '
              'e toque em Criar conta de novo.',
        );
      });
      return;
    }
    setState(() => _faixa = MensagensDeErro.de(falha));
  }

  void _conferirOEmailAoSair() {
    final erro = erraAoSairDoCampo(_email.text) ? erroAoSairDoEmail : null;
    if (erro == _erroDoEmail) return;
    if (erro == null && _erroDoEmail == MensagensDeErro.emailJaCadastrado) {
      return;
    }
    setState(() => _erroDoEmail = erro);
  }

  @override
  Widget build(BuildContext context) {
    final bool semVersaoDosTermos =
        AppConfig.instancia.versaoDosTermos == null;

    return Scaffold(
      appBar: const BarraDeConta(
        titulo: 'Criar conta',
        saida: TipoDeSaida.voltar,
      ),
      bottomNavigationBar: BarraDeAcaoFixa(
        acoes: <Widget>[
          BotaoPrimario(
            rotulo: 'Criar conta',
            critico: true,
            carregando: _enviando,
            aoTocar: NomeDeExibicao.completo(_nome.text) &&
                    IdadeMinima.completo(_nascimento.text)
                ? _criarConta
                : null,
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
              if (semVersaoDosTermos) ...<Widget>[
                const FaixaDeAviso(texto: _semVersaoDosTermos),
                const SizedBox(height: BichuEspaco.e6),
              ],
              BichuField(
                key: _alvoDoNome,
                rotulo: 'Nome',
                tipoDeTeclado: TextInputType.name,
                controlador: _nome,
                erro: _erroDoNome,
                limite: NomeDeExibicao.limite,
                autofill: const <String>[AutofillHints.name],
                capitalizacao: TextCapitalization.words,
                acaoDeTeclado: TextInputAction.next,
                aoMudar: (_) => setState(() {
                  if (_erroDoNome != null) _erroDoNome = null;
                }),
              ),
              const SizedBox(height: BichuEspaco.e6),
              BichuField(
                key: _alvoDoApelido,
                rotulo: 'Apelido',
                controlador: _apelido,
                opcional: true,
                erro: _erroDoApelido,
                limite: maximoDoApelido,
                exemplo: 'maria-silva',
                formatadores: const <TextInputFormatter>[FiltroDeApelido()],
                correcaoAutomatica: false,
                capitalizacao: TextCapitalization.none,
                acaoDeTeclado: TextInputAction.next,
                aoMudar: (_) => setState(() {
                  if (_erroDoApelido != null) _erroDoApelido = null;
                }),
              ),
              const SizedBox(height: BichuEspaco.e6),
              BichuField(
                key: _alvoDoNascimento,
                rotulo: 'Data de nascimento',
                controlador: _nascimento,
                erro: _erroDoNascimento,
                limite: limiteDaData,
                tipoDeTeclado: TextInputType.number,
                exemplo: '31/12/1990',
                formatadores: const <TextInputFormatter>[MascaraDeData()],
                correcaoAutomatica: false,
                autofill: const <String>[AutofillHints.birthday],
                acaoDeTeclado: TextInputAction.next,
                aoMudar: (_) => setState(() {
                  if (_erroDoNascimento != null) _erroDoNascimento = null;
                }),
              ),
              const SizedBox(height: BichuEspaco.e6),
              BichuField(
                key: _alvoDoEmail,
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
              ),
              if (_erroDoEmail == MensagensDeErro.emailJaCadastrado)
                Align(
                  alignment: Alignment.centerLeft,
                  child: TextButton(
                    onPressed: () => context.pushReplacement(
                      Rotas.entrar,
                      extra: _email.text.trim(),
                    ),
                    child: const Text('Entrar com este e-mail'),
                  ),
                ),
              const SizedBox(height: BichuEspaco.e6),
              BichuField(
                key: _alvoDaSenha,
                rotulo: 'Senha',
                controlador: _senha,
                erro: _erroDaSenha,
                obscurecer: !_senhaVisivel,
                autofill: const <String>[AutofillHints.newPassword],
                correcaoAutomatica: false,
                acaoDeTeclado: TextInputAction.done,
                aoEnviar: (_) => _criarConta(),
                sufixo: BotaoRevelarSenha(
                  visivel: _senhaVisivel,
                  aoAlternar: () =>
                      setState(() => _senhaVisivel = !_senhaVisivel),
                ),
              ),
              const SizedBox(height: BichuEspaco.e2),
              RequisitosDaSenha(senha: _senha, email: _email, nome: _nome),
              if (_faixa != null) ...<Widget>[
                const SizedBox(height: BichuEspaco.e6),
                FaixaDeAviso(
                  texto: _faixa!.texto,
                  rotuloDaAcao: _faixa!.acao,
                  aoTocarNaAcao: saidaDaMensagem(context, _faixa!),
                ),
              ],
              const SizedBox(height: BichuEspaco.e6),
              _CaixaDeAceiteDosTermos(
                key: _alvoDoAceite,
                marcada: _aceitouOsTermos,
                erro: _erroDoAceite,
                aoMudar: (v) => setState(() {
                  _aceitouOsTermos = v;
                  if (v) _erroDoAceite = null;
                }),
              ),
              const SizedBox(height: BichuEspaco.e6),
              Center(
                child: TextButton(
                  onPressed: () => context.pushReplacement(Rotas.entrar),
                  child: const Text('Já tenho conta'),
                ),
              ),
            ],
          ),
        ),
      ),
    );
  }
}

/// A frase do aceite, com as duas expressoes como links.
class _FraseDeAceite extends StatefulWidget {
  const _FraseDeAceite();

  @override
  State<_FraseDeAceite> createState() => _FraseDeAceiteState();
}

class _FraseDeAceiteState extends State<_FraseDeAceite> {
  final List<TapGestureRecognizer> _gestos = <TapGestureRecognizer>[];

  @override
  void dispose() {
    for (final gesto in _gestos) {
      gesto.dispose();
    }
    super.dispose();
  }

  Future<void> _abrir(Uri destino) async {
    await launchUrl(destino, mode: LaunchMode.externalApplication);
  }

  TextSpan _link(String texto, Uri? destino, TextStyle estilo, Color cor) {
    if (destino == null) return TextSpan(text: texto, style: estilo);

    final gesto = TapGestureRecognizer()..onTap = () => _abrir(destino);
    _gestos.add(gesto);
    return TextSpan(
      text: texto,
      semanticsLabel: texto,
      recognizer: gesto,
      style: estilo.copyWith(
        color: cor,
        decoration: TextDecoration.underline,
        decorationColor: cor,
      ),
    );
  }

  @override
  Widget build(BuildContext context) {
    final cores = BichuColors.of(context).cores;
    final textos = Theme.of(context).textTheme;
    final config = AppConfig.instancia;

    final base = textos.bodyMedium?.copyWith(color: cores.textPrimary) ??
        const TextStyle();

    return Text.rich(
      TextSpan(
        children: <InlineSpan>[
          TextSpan(text: 'Li e aceito os ', style: base),
          _link('termos de uso', config.urlDosTermos, base, cores.primary),
          TextSpan(text: ' e a ', style: base),
          _link(
            'política de privacidade',
            config.urlDaPrivacidade,
            base,
            cores.primary,
          ),
          TextSpan(text: '.', style: base),
        ],
      ),
    );
  }
}

/// A caixa de aceite dos termos da F1.1.
class _CaixaDeAceiteDosTermos extends StatelessWidget {
  const _CaixaDeAceiteDosTermos({
    required this.marcada,
    required this.erro,
    required this.aoMudar,
    super.key,
  });

  final bool marcada;
  final String? erro;
  final ValueChanged<bool> aoMudar;

  @override
  Widget build(BuildContext context) {
    final cores = BichuColors.of(context).cores;
    final textos = Theme.of(context).textTheme;

    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: <Widget>[
        Row(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: <Widget>[
            Checkbox(
              value: marcada,
              isError: erro != null,
              semanticLabel: 'Aceitar os termos',
              onChanged: (v) => aoMudar(v ?? false),
            ),
            const SizedBox(width: BichuEspaco.e2),
            Expanded(
              child: Semantics(
                container: true,
                child: const Padding(
                  padding: EdgeInsets.only(top: BichuEspaco.e3),
                  child: _FraseDeAceite(),
                ),
              ),
            ),
          ],
        ),
        if (erro != null)
          Padding(
            padding: const EdgeInsets.only(top: BichuEspaco.e2),
            child: Text(
              erro!,
              style: textos.bodyMedium?.copyWith(color: cores.error),
            ),
          ),
      ],
    );
  }
}
