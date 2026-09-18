import 'package:flutter/gestures.dart';
import 'package:flutter/material.dart';
import 'package:go_router/go_router.dart';
import 'package:url_launcher/url_launcher.dart';

import '../../api/falhas.dart';
import '../../api/mensagens_de_erro.dart';
import '../../api/problem.dart';
import '../../config/app_config.dart';
import '../../escopo.dart';
import '../../roteamento/rotas.dart';
import '../../theme/bichu_colors.dart';
import '../../theme/bichu_tokens.g.dart';
import '../../widgets/bichu_field.dart';
import '../../widgets/botao_primario.dart';
import '../../widgets/faixa_de_aviso.dart';
import '../../widgets/saida_da_tela.dart';

/// F1.1 — Criar conta.
///
/// Tres campos, a regra de senha dita **antes** do erro, e a caixa de
/// "continuar conectado" desmarcada por padrao, com o efeito em texto.
///
/// **Desvio, como a C.2.** Quem abre esta tela empilha (`push`) e ela traz uma
/// saida explicita de voltar: criar conta e uma acao, e a regra de produto
/// (visao de produto, secao 5) e que o app continua navegavel para quem
/// desiste dela.
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
  final TextEditingController _senha = TextEditingController();
  final FocusNode _focoDoEmail = FocusNode();

  bool _senhaVisivel = false;
  bool _continuarConectado = false;
  bool _enviando = false;
  String? _erroDoEmail;
  String? _erroDaSenha;
  MensagemDeErro? _faixa;

  @override
  void dispose() {
    _nome.dispose();
    _email.dispose();
    _senha.dispose();
    _focoDoEmail.dispose();
    super.dispose();
  }

  Future<void> _criarConta() async {
    setState(() {
      _erroDoEmail = null;
      _erroDaSenha = null;
      _faixa = null;
    });

    // Validacao no cliente e conveniencia; a autoridade fica no servidor.
    // Ela existe aqui so para a pessoa nao gastar uma ida a rede a toa.
    if (!_emailPlausivel(_email.text)) {
      setState(() => _erroDoEmail = 'Digite o e-mail da sua conta.');
      _focoDoEmail.requestFocus();
      return;
    }
    if (_senha.text.length < 10) {
      setState(() => _erroDaSenha = MensagensDeErro.senhaCurta);
      return;
    }

    setState(() => _enviando = true);
    final escopo = Escopo.of(context);
    try {
      final sessao = await escopo.auth.criarConta(
        email: _email.text.trim(),
        senha: _senha.text,
        nome: _nome.text.trim().isEmpty ? null : _nome.text.trim(),
        // A versao dos termos aceitos, que e prova juridica e nao dado de
        // tela: sem ela o backend nao grava `accepted_terms_at` e nao ha como
        // demonstrar o que a pessoa aceitou (docs/04-seguranca.md secao 6.6).
        // Vem do build por `--dart-define=TERMS_VERSION`; enquanto o documento
        // versionado nao existir, chega nulo, e essa ausencia agora esta
        // escrita aqui em vez de acontecer sozinha.
        versaoDosTermos: AppConfig.instancia.versaoDosTermos,
        // A escolha da caixa agora chega ao servidor. Ate 17/09/2026
        // `RegisterRequest` nao tinha o campo e esta linha era uma lacuna
        // registrada em comentario; ADR-0019 a fechou.
        continuarConectado: _continuarConectado,
      );
      await escopo.sessao.abrir(sessao);
      if (!mounted) return;
      // `pushReplacement`, e este e o ponto de virada do fluxo: a conta **ja
      // existe** a partir daqui. Este formulario sai da pilha porque voltar a
      // ele seria uma promessa falsa -- reenviar daria 409
      // (`email-already-registered`). O que fica embaixo e a aba de onde a
      // pessoa veio, que continua sendo o lugar certo para sair.
      context.pushReplacement(
        Rotas.verifiqueSeuEmail,
        extra: sessao.usuario.email,
      );
    } on FalhaDeChamada catch (falha) {
      if (!mounted) return;
      _tratar(falha);
    } finally {
      if (mounted) setState(() => _enviando = false);
    }
  }

  void _tratar(FalhaDeChamada falha) {
    // A decisao e por `type`, nunca pelo texto que o servidor mandou.
    if (falha is FalhaDaApi) {
      if (falha.tipo == ProblemTipo.emailJaCadastrado) {
        setState(() => _erroDoEmail = MensagensDeErro.emailJaCadastrado);
        return;
      }
      final campoDaSenha = falha.problem.campo('password');
      if (campoDaSenha != null || falha.problem.status == 422) {
        setState(() => _erroDaSenha = MensagensDeErro.senhaCurta);
        return;
      }
    }
    if (falha is FalhaDeConexao) {
      // Texto proprio da F1.1: a falha de rede aqui nao e enfileiravel, e a
      // tela diz o que fazer com os campos que continuam preenchidos.
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

  static bool _emailPlausivel(String valor) {
    final v = valor.trim();
    final arroba = v.indexOf('@');
    // Validacao tolerante (UX 13): recusa o obviamente errado, aceita o
    // incomum. Endereco real e mais estranho que a maioria das expressoes.
    return arroba > 0 && v.indexOf('.', arroba) > arroba + 1;
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: const BarraDeConta(
        titulo: 'Criar conta',
        saida: TipoDeSaida.voltar,
      ),
      body: SafeArea(
        child: ListView(
          padding: const EdgeInsets.all(BichuEspaco.e4),
          children: <Widget>[
            BichuField(
              rotulo: 'Nome',
              controlador: _nome,
              autofill: const <String>[AutofillHints.name],
              capitalizacao: TextCapitalization.words,
              acaoDeTeclado: TextInputAction.next,
            ),
            const SizedBox(height: BichuEspaco.e6),
            BichuField(
              rotulo: 'E-mail',
              controlador: _email,
              foco: _focoDoEmail,
              erro: _erroDoEmail,
              tipoDeTeclado: TextInputType.emailAddress,
              autofill: const <String>[AutofillHints.email],
              correcaoAutomatica: false,
              acaoDeTeclado: TextInputAction.next,
            ),
            if (_erroDoEmail == MensagensDeErro.emailJaCadastrado)
              Align(
                alignment: Alignment.centerLeft,
                child: TextButton(
                  // Troca lateral: mesmo passo, outra tela. `pushReplacement`
                  // para que a volta leve a aba de origem, e nao a este
                  // formulario que a pessoa acabou de abandonar.
                  onPressed: () => context.pushReplacement(
                    Rotas.entrar,
                    extra: _email.text.trim(),
                  ),
                  child: const Text('Entrar com este e-mail'),
                ),
              ),
            const SizedBox(height: BichuEspaco.e6),
            BichuField(
              rotulo: 'Senha',
              controlador: _senha,
              erro: _erroDaSenha,
              ajuda: 'Pelo menos 10 caracteres. Uma frase curta funciona '
                  'melhor que uma senha complicada.',
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
            const SizedBox(height: BichuEspaco.e6),
            // LACUNA FECHADA em 17/09/2026 por ADR-0019: `RegisterRequest`
            // passou a ter `stay_signed_in`, com a mesma forma e o mesmo
            // padrao do `LoginRequest`, e a escolha desta caixa chega ao
            // servidor. Ela governa a janela de inatividade do refresh: 30
            // dias desmarcada, 180 marcada. Desmarcada por padrao, com o
            // efeito dito em texto.
            _CaixaDeContinuarConectado(
              marcada: _continuarConectado,
              aoMudar: (v) => setState(() => _continuarConectado = v),
            ),
            if (_faixa != null) ...<Widget>[
              const SizedBox(height: BichuEspaco.e6),
              FaixaDeAviso(texto: _faixa!.texto),
            ],
            const SizedBox(height: BichuEspaco.e6),
            // A linha de termos fica **acima** do botao, e nao no fim da tela:
            // uma regra que se aceita ao apertar um botao precisa estar legivel
            // antes do aperto, e nao abaixo da dobra (UX F1.1). Ela estava
            // depois do botao e depois de "Ja tenho conta".
            const _LinhaDeTermos(),
            const SizedBox(height: BichuEspaco.e6),
            BotaoPrimario(
              rotulo: 'Criar conta',
              carregando: _enviando,
              // O botao continua habilitado sem conexao: o detector de offline
              // erra, e deixar a pessoa sem caminho e pior que deixa-la tentar.
              aoTocar: _criarConta,
            ),
            const SizedBox(height: BichuEspaco.e4),
            Center(
              child: TextButton(
                onPressed: () => context.pushReplacement(Rotas.entrar),
                child: const Text('Já tenho conta'),
              ),
            ),
          ],
        ),
      ),
    );
  }
}

/// A linha de termos da F1.1, com as duas expressoes como links.
///
/// Antes esta frase era texto corrido: a pessoa aceitava dois documentos que
/// nao tinha como abrir. Nao e acabamento, e a diferenca entre um aceite e uma
/// afirmacao de que houve aceite.
///
/// **Divergencia que eu declaro.** O UX pede alvo de toque de 48 dp para os
/// dois links. Link dentro de frase nao tem como ter 48 dp de altura sem
/// espacar as linhas do paragrafo a ponto de ele deixar de parecer uma frase, e
/// a alternativa (dois botoes soltos abaixo do texto) perde a ligacao entre a
/// expressao e o documento, que e justamente o que faz o aceite valer. Fiquei
/// com o link em linha e compensei onde da: nome acessivel proprio em cada um
/// ("Termos de uso", "Politica de privacidade", nunca "aqui"), sublinhado
/// alem da cor (SC 1.4.1: cor nao pode ser o unico indicador), e a frase
/// inteira acima do botao.
///
/// **Quando a URL nao esta configurada a expressao nao vira link.** Link que
/// nao abre nada e pior que texto: parece que funcionou. As duas URLs entram
/// por `--dart-define` (`TERMS_URL`, `PRIVACY_URL`) e as paginas sao superficie
/// web, de outro time.
class _LinhaDeTermos extends StatefulWidget {
  const _LinhaDeTermos();

  @override
  State<_LinhaDeTermos> createState() => _LinhaDeTermosState();
}

class _LinhaDeTermosState extends State<_LinhaDeTermos> {
  final List<TapGestureRecognizer> _gestos = <TapGestureRecognizer>[];

  @override
  void dispose() {
    for (final gesto in _gestos) {
      gesto.dispose();
    }
    super.dispose();
  }

  Future<void> _abrir(Uri destino) async {
    // Navegador do sistema, e nao WebView: documento juridico se le, se guarda
    // e se imprime fora do app.
    await launchUrl(destino, mode: LaunchMode.externalApplication);
  }

  TextSpan _link(String texto, Uri? destino, TextStyle estilo, Color cor) {
    if (destino == null) return TextSpan(text: texto, style: estilo);

    final gesto = TapGestureRecognizer()..onTap = () => _abrir(destino);
    _gestos.add(gesto);
    return TextSpan(
      text: texto,
      // O nome acessivel e a propria expressao, e nunca "aqui" nem "leia
      // mais": quem navega por lista de links do leitor de tela ouve so o
      // nome, fora da frase.
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

    final base = textos.bodyMedium?.copyWith(color: cores.textSecondary) ??
        const TextStyle();

    return Text.rich(
      TextSpan(
        children: <InlineSpan>[
          TextSpan(text: 'Ao criar a conta, você aceita os ', style: base),
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

class _CaixaDeContinuarConectado extends StatelessWidget {
  const _CaixaDeContinuarConectado({
    required this.marcada,
    required this.aoMudar,
  });

  final bool marcada;
  final ValueChanged<bool> aoMudar;

  @override
  Widget build(BuildContext context) {
    final cores = BichuColors.of(context).cores;
    final textos = Theme.of(context).textTheme;

    return InkWell(
      onTap: () => aoMudar(!marcada),
      borderRadius: BorderRadius.circular(BichuRaio.sm),
      child: Padding(
        padding: const EdgeInsets.symmetric(vertical: BichuEspaco.e1),
        child: Row(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: <Widget>[
            Checkbox(
              value: marcada,
              onChanged: (v) => aoMudar(v ?? false),
            ),
            const SizedBox(width: BichuEspaco.e2),
            Expanded(
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: <Widget>[
                  const SizedBox(height: BichuEspaco.e3),
                  Text('Continuar conectado neste aparelho',
                      style: textos.bodyLarge),
                  Text(
                    'Você não precisa entrar de novo neste celular.',
                    style: textos.bodyMedium
                        ?.copyWith(color: cores.textSecondary),
                  ),
                ],
              ),
            ),
          ],
        ),
      ),
    );
  }
}
