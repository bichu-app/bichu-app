import 'package:flutter/material.dart';
import 'package:go_router/go_router.dart';

import '../../api/falhas.dart';
import '../../api/mensagens_de_erro.dart';
import '../../api/problem.dart';
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
    final cores = BichuColors.of(context).cores;
    final textos = Theme.of(context).textTheme;

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
            // LACUNA REGISTRADA: a F1.1 do UX pede esta caixa, e o
            // `RegisterRequest` do contrato nao tem campo para ela — so o
            // `LoginRequest` tem `stay_signed_in`. Enquanto o contrato nao
            // fecha, a escolha nao chega ao servidor no cadastro. Nao invento
            // campo fora da especificacao.
            _CaixaDeContinuarConectado(
              marcada: _continuarConectado,
              aoMudar: (v) => setState(() => _continuarConectado = v),
            ),
            if (_faixa != null) ...<Widget>[
              const SizedBox(height: BichuEspaco.e6),
              FaixaDeAviso(texto: _faixa!.texto),
            ],
            const SizedBox(height: BichuEspaco.e8),
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
            const SizedBox(height: BichuEspaco.e4),
            Text(
              'Ao criar a conta você aceita os termos de uso e a política de '
              'privacidade.',
              style: textos.bodyMedium?.copyWith(color: cores.textSecondary),
            ),
          ],
        ),
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
