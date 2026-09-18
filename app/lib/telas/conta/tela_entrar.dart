import 'package:flutter/material.dart';
import 'package:go_router/go_router.dart';

import '../../api/falhas.dart';
import '../../api/mensagens_de_erro.dart';
import '../../escopo.dart';
import '../../intencao/ir_para_o_destino.dart';
import '../../roteamento/rotas.dart';
import '../../theme/bichu_colors.dart';
import '../../theme/bichu_tokens.g.dart';
import '../../widgets/bichu_field.dart';
import '../../widgets/botao_primario.dart';
import '../../widgets/faixa_de_aviso.dart';
import '../../widgets/saida_da_tela.dart';

/// C.2 — Entrar.
///
/// O 401 do contrato e identico para e-mail inexistente e senha errada, e a
/// tela respeita isso: uma mensagem so, com a saida para a recuperacao de
/// senha ao lado dela. Distinguir os dois casos entregaria a lista de quem tem
/// conta.
///
/// **Esta tela e um desvio, e nao um destino.** A regra de produto (visao de
/// produto, secao 5 e matriz 8.6) e que o app e navegavel deslogado e que sao
/// as acoes que exigem conta. Quem toca em `Entrar` e desiste precisa voltar a
/// navegar; hoje isso significava fechar o app. Por isso, duas coisas juntas e
/// nao uma:
///
/// 1. Quem abre esta tela usa `push`, e nao `go`. `go` substitui a pilha, e
///    sem nada para desempilhar nao existe volta -- nem a seta automatica, nem
///    o gesto de voltar do sistema.
/// 2. A barra traz uma saida **explicita**, que funciona tambem quando a
///    pilha esta vazia (link direto). Ver `SaidaDaTela`.
class TelaEntrar extends StatefulWidget {
  const TelaEntrar({super.key, this.emailInicial});

  final String? emailInicial;

  @override
  State<TelaEntrar> createState() => _TelaEntrarState();
}

class _TelaEntrarState extends State<TelaEntrar> {
  late final TextEditingController _email =
      TextEditingController(text: widget.emailInicial ?? '');
  final TextEditingController _senha = TextEditingController();

  final FocusNode _focoDoEmail = FocusNode();
  final FocusNode _focoDaSenha = FocusNode();

  bool _senhaVisivel = false;
  bool _continuarConectado = false;
  bool _enviando = false;
  MensagemDeErro? _faixa;
  String? _erroDoEmail;
  String? _erroDaSenha;

  @override
  void dispose() {
    _email.dispose();
    _senha.dispose();
    _focoDoEmail.dispose();
    _focoDaSenha.dispose();
    super.dispose();
  }

  /// Validacao local, antes de gastar uma ida a rede.
  ///
  /// Nao e zelo de formulario: enviar campo vazio devolve o 401 de credencial
  /// recusada, que e **falso** (a credencial nao foi recusada, ela nao foi
  /// escrita) e ainda **queima uma das cinco tentativas por e-mail** antes de o
  /// desafio antiabuso aparecer. A pessoa paga duas vezes por um campo que ela
  /// nem preencheu (UX 8.2.2).
  ///
  /// A autoridade continua no servidor: isto e conveniencia, e o servidor
  /// recusa de novo o que for o caso.
  bool _camposPreenchidos() {
    final email = _email.text.trim();
    final senha = _senha.text;

    String? erroDoEmail;
    if (email.isEmpty) {
      erroDoEmail = MensagensDeErro.digiteSeuEmail;
    } else if (!_emailPlausivel(email)) {
      // Validacao tolerante (UX 13): recusa o obviamente errado, aceita o
      // incomum. Endereco real e mais estranho que a maioria das expressoes.
      erroDoEmail = MensagensDeErro.confiraOEmail;
    }
    final erroDaSenha = senha.isEmpty ? MensagensDeErro.digiteSuaSenha : null;

    if (erroDoEmail == null && erroDaSenha == null) return true;

    setState(() {
      _erroDoEmail = erroDoEmail;
      _erroDaSenha = erroDaSenha;
    });
    // O foco vai para o primeiro campo com erro. Aqui sabemos qual e, ao
    // contrario da credencial recusada, em que nao se sabe e o foco vai para a
    // mensagem.
    (erroDoEmail != null ? _focoDoEmail : _focoDaSenha).requestFocus();
    return false;
  }

  static bool _emailPlausivel(String valor) {
    final v = valor.trim();
    final arroba = v.indexOf('@');
    return arroba > 0 && v.indexOf('.', arroba) > arroba + 1;
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
        continuarConectado: _continuarConectado,
      );
      await escopo.sessao.abrir(sessao);
      // O destino depois do login e a intencao pendente (UX 8.3), e nao a
      // home. **A acao guardada e executada aqui**, antes de qualquer
      // navegacao: a regra 3 diz "executar, nao apenas navegar", e devolver a
      // pessoa ao formulario preenchido para que ela toque no botao de novo e
      // a meia-entrega que a propria secao nomeia. Quem tocou em `Registrar
      // achado` antes do login nao toca de novo depois dele.
      //
      // O Inicio continua sendo um destino possivel, e so um caso chega la:
      // nao havia intencao, ou ela passou das 24 horas e foi descartada em
      // silencio (regra 2). Falha de execucao **nao** vai para a home: vai
      // para a tela de retorno, com o rascunho e o erro (regra 4).
      final destino = await escopo.guarda.executarDepoisDoLogin();
      if (!mounted) return;
      irParaODestinoDoLogin(context, destino);
    } on FalhaDeChamada catch (falha) {
      if (!mounted) return;
      // **A decisao e por `type`, nunca pelo status.** O contrato declara
      // QUATRO tipos com status 401 (`invalid-credentials`, `unauthenticated`,
      // `token-expired`, `reauthentication-required`). Um `if (status == 401)`
      // acerta hoje por sorte, porque so o primeiro chega a esta tela, e erra
      // calado no dia em que outro chegar: a tela diria a pessoa que a senha
      // esta errada e ela trocaria uma senha que estava certa. O mapa dos
      // quatro esta em `MensagensDeErro.deEntrar`, e ha teste que cobra cada um.
      //
      // Nada e apagado: nem o e-mail, nem a senha. O caso dominante e um
      // caractere trocado, e quem digita de novo do zero erra de novo.
      setState(() => _faixa = MensagensDeErro.deEntrar(falha));
    } finally {
      if (mounted) setState(() => _enviando = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    final cores = BichuColors.of(context).cores;
    final textos = Theme.of(context).textTheme;

    return Scaffold(
      appBar: const BarraDeConta(
        titulo: 'Entrar',
        saida: TipoDeSaida.voltar,
      ),
      body: SafeArea(
        child: ListView(
          padding: const EdgeInsets.all(BichuEspaco.e4),
          children: <Widget>[
            BichuField(
              rotulo: 'E-mail',
              controlador: _email,
              foco: _focoDoEmail,
              erro: _erroDoEmail,
              tipoDeTeclado: TextInputType.emailAddress,
              autofill: const <String>[AutofillHints.email],
              correcaoAutomatica: false,
              acaoDeTeclado: TextInputAction.next,
              // Depois que o campo errou uma vez, revalidar enquanto digita,
              // para o erro sumir assim que for corrigido (UX 13).
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
                // `push`: recuperar a senha e um passo **adiante** no mesmo
                // desvio. Voltar de la devolve esta tela com o e-mail ainda
                // digitado, que e o que `go` destruia.
                onPressed: () => context.push(
                  Rotas.esqueciMinhaSenha,
                  extra: _email.text.trim(),
                ),
                child: const Text('Esqueci minha senha'),
              ),
            ),
            const SizedBox(height: BichuEspaco.e2),
            Row(
              children: <Widget>[
                Checkbox(
                  value: _continuarConectado,
                  onChanged: (v) =>
                      setState(() => _continuarConectado = v ?? false),
                ),
                const SizedBox(width: BichuEspaco.e2),
                Expanded(
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: <Widget>[
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
            if (_faixa != null) ...<Widget>[
              const SizedBox(height: BichuEspaco.e6),
              FaixaDeAviso(
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
            const SizedBox(height: BichuEspaco.e8),
            BotaoPrimario(
              rotulo: 'Entrar',
              carregando: _enviando,
              aoTocar: _entrar,
            ),
            const SizedBox(height: BichuEspaco.e4),
            Center(
              child: TextButton(
                // `pushReplacement`, e nao `push`: `Entrar` e `Criar conta`
                // sao o mesmo passo do mesmo desvio, e nao dois passos. Quem
                // alterna entre as duas e volta quer sair do desvio, nao
                // percorrer de tras para a frente cada troca que fez.
                onPressed: () => context.pushReplacement(Rotas.criarConta),
                child: const Text('Criar conta'),
              ),
            ),
          ],
        ),
      ),
    );
  }
}
