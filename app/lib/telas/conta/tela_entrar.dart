import 'package:flutter/material.dart';
import 'package:go_router/go_router.dart';

import '../../api/falhas.dart';
import '../../api/mensagens_de_erro.dart';
import '../../escopo.dart';
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

  bool _senhaVisivel = false;
  bool _continuarConectado = false;
  bool _enviando = false;
  MensagemDeErro? _faixa;

  @override
  void dispose() {
    _email.dispose();
    _senha.dispose();
    super.dispose();
  }

  Future<void> _entrar() async {
    setState(() => _faixa = null);
    setState(() => _enviando = true);

    final escopo = Escopo.of(context);
    try {
      final sessao = await escopo.auth.entrar(
        email: _email.text.trim(),
        senha: _senha.text,
        continuarConectado: _continuarConectado,
      );
      await escopo.sessao.abrir(sessao);
      if (!mounted) return;
      // O destino depois do login bem-sucedido **nao** muda aqui. A secao 8.3
      // da pesquisa de UX ("nunca a home") o resolve pelo envelope de intencao
      // pendente: a acao que a pessoa tentou e executada e ela chega na tela de
      // resultado. Esse envelope ainda nao existe, e substituir `go` por um
      // `pop` agora seria escolher meio caminho sem a especificacao inteira.
      // `go` tambem limpa o desvio da pilha, entao nenhuma tela de conta fica
      // pendurada atras do Inicio.
      context.go(Rotas.inicio);
    } on FalhaDaApi catch (falha) {
      if (!mounted) return;
      setState(() {
        _faixa = falha.problem.status == 401
            ? const MensagemDeErro(
                texto: MensagensDeErro.credencialNaoConfere,
                acao: 'Esqueci minha senha',
              )
            : MensagensDeErro.de(falha);
      });
    } on FalhaDeChamada catch (falha) {
      if (!mounted) return;
      setState(() => _faixa = MensagensDeErro.de(falha));
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
              tipoDeTeclado: TextInputType.emailAddress,
              autofill: const <String>[AutofillHints.email],
              correcaoAutomatica: false,
              acaoDeTeclado: TextInputAction.next,
            ),
            const SizedBox(height: BichuEspaco.e6),
            BichuField(
              rotulo: 'Senha',
              controlador: _senha,
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
