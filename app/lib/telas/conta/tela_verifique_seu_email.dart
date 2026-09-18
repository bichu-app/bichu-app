import 'dart:async';

import 'package:flutter/material.dart';
import 'package:go_router/go_router.dart';

import '../../acessibilidade/anunciar.dart';
import '../../api/falhas.dart';
import '../../api/mensagens_de_erro.dart';
import '../../escopo.dart';
import '../../intencao/ir_para_o_destino.dart';
import '../../roteamento/rotas.dart';
import '../../theme/bichu_colors.dart';
import '../../theme/bichu_tokens.g.dart';
import '../../widgets/botao_primario.dart';
import '../../widgets/faixa_de_aviso.dart';
import '../../widgets/saida_da_tela.dart';

/// F1.2 — Verifique seu e-mail.
///
/// A regra que governa esta tela: **a verificacao nunca bloqueia o cadastro do
/// pet.** `Continuar` funciona sempre, inclusive sem conexao e inclusive se o
/// reenvio falhar. Exigir verificacao antes do cadastro derruba a conversao do
/// unico cadastro que importa.
///
/// **Esta e a unica tela de conta que e destino, e nao desvio, e por isso a
/// saida dela e `Fechar` e nao `Voltar`.** O argumento e de verdade, e nao de
/// estilo:
///
/// 1. Quando se chega aqui pelo cadastro, **a conta ja existe**. Uma seta de
///    voltar prometeria o formulario da F1.1, e o formulario nao tem mais o
///    que fazer: reenviar o mesmo e-mail responde 409. Por isso a F1.1 chega
///    aqui com `pushReplacement` e nao com `push` -- o passo anterior sai da
///    pilha porque ele deixou de existir de fato, e nao porque incomoda.
/// 2. Ha uma segunda porta: o aviso persistente de cadastro incompleto, no
///    Inicio (UX secao 9.2). Quem entra por ali esta so conferindo, ja
///    logado, e precisa sair sem "continuar" coisa nenhuma.
///
/// `Continuar` continua sendo a acao principal da F1.2 e nao vira botao de
/// saida: as duas coisas tem significados diferentes, e juntar as duas
/// obrigaria a pessoa a avancar o cadastro para conseguir sair da tela.
class TelaVerifiqueSeuEmail extends StatefulWidget {
  const TelaVerifiqueSeuEmail({required this.email, super.key});

  final String email;

  @override
  State<TelaVerifiqueSeuEmail> createState() => _TelaVerifiqueSeuEmailState();
}

class _TelaVerifiqueSeuEmailState extends State<TelaVerifiqueSeuEmail> {
  static const int _segundosDeEspera = 60;

  Timer? _contagem;
  int _restante = 0;
  bool _reenviando = false;
  MensagemDeErro? _faixa;

  @override
  void dispose() {
    _contagem?.cancel();
    super.dispose();
  }

  /// A contagem e anunciada **duas vezes**, no inicio e no fim, e nao a cada
  /// segundo: um cronometro falante a cada segundo torna a tela inutilizavel
  /// com leitor de tela.
  void _iniciarContagem() {
    _contagem?.cancel();
    setState(() => _restante = _segundosDeEspera);
    anunciar(context, 'Você pode reenviar em $_segundosDeEspera segundos.');
    _contagem = Timer.periodic(const Duration(seconds: 1), (timer) {
      if (!mounted) {
        timer.cancel();
        return;
      }
      setState(() => _restante -= 1);
      if (_restante <= 0) {
        timer.cancel();
        anunciar(context, 'Você já pode reenviar o e-mail.');
      }
    });
  }

  Future<void> _reenviar() async {
    setState(() {
      _faixa = null;
      _reenviando = true;
    });
    try {
      await Escopo.of(context).auth.reenviarVerificacaoDeEmail();
      if (!mounted) return;
      _iniciarContagem();
    } on FalhaDeConexao {
      if (!mounted) return;
      setState(() {
        _faixa = const MensagemDeErro(
          texto: MensagensDeErro.semConexaoImpossivel,
        );
      });
    } on FalhaDeChamada {
      if (!mounted) return;
      setState(() {
        _faixa = const MensagemDeErro(
          texto: 'Não conseguimos reenviar agora. Tente em um minuto.',
        );
      });
    } finally {
      if (mounted) setState(() => _reenviando = false);
    }
  }

  /// `Continuar`: o fim do caminho de quem acabou de criar a conta.
  ///
  /// **E aqui que o exemplo de aceite de 8.3 acontece.** Camila preencheu o
  /// achado deslogada, criou a conta, "verifica nada" e toca em `Continuar`: o
  /// app registra o achado e abre a tela do achado registrado. Ela nao ve a
  /// home em nenhum momento. Enquanto esta tela mandava para o Inicio, a
  /// intencao guardada morria de velha sem nunca executar -- e o rascunho
  /// dela, junto.
  ///
  /// Continua valendo que `Continuar` **nao depende de rede**: sem intencao
  /// pendente, o destino e o Inicio, sem ida ao servidor. Quando ha intencao,
  /// a acao e tentada, e a falha leva a tela de retorno com o rascunho e o
  /// erro -- nunca a um beco.
  Future<void> _continuar() async {
    final destino = await Escopo.of(context).guarda.executarDepoisDoLogin();
    if (!mounted) return;
    irParaODestinoDoLogin(context, destino);
  }

  @override
  Widget build(BuildContext context) {
    final cores = BichuColors.of(context).cores;
    final textos = Theme.of(context).textTheme;
    final podeReenviar = _restante <= 0 && !_reenviando;

    return Scaffold(
      appBar: const BarraDeConta(
        titulo: 'Verifique seu e-mail',
        saida: TipoDeSaida.fechar,
      ),
      body: SafeArea(
        child: ListView(
          padding: const EdgeInsets.all(BichuEspaco.e4),
          children: <Widget>[
            Text(
              'Enviamos um link para ${widget.email}. Confirme quando puder.',
              style: textos.bodyLarge,
            ),
            if (_faixa != null) ...<Widget>[
              const SizedBox(height: BichuEspaco.e6),
              FaixaDeAviso(texto: _faixa!.texto),
            ],
            const SizedBox(height: BichuEspaco.e8),
            BotaoPrimario(
              rotulo: 'Continuar',
              // Sem `carregando` e sem condicao: `Continuar` nao depende de
              // rede nem do resultado do reenvio.
              aoTocar: _continuar,
            ),
            const SizedBox(height: BichuEspaco.e4),
            BotaoSecundario(
              rotulo: podeReenviar
                  ? 'Reenviar e-mail'
                  : 'Reenviar em 0:${_restante.toString().padLeft(2, '0')}',
              aoTocar: podeReenviar ? _reenviar : null,
            ),
            const SizedBox(height: BichuEspaco.e4),
            Center(
              child: TextButton(
                // `pushReplacement`: e uma correcao do mesmo passo, e nao um
                // passo adiante. A aba de origem continua embaixo, entao o
                // formulario nasce la com a sua propria saida de voltar.
                onPressed: () => context.pushReplacement(
                  Rotas.criarConta,
                  extra: widget.email,
                ),
                child: const Text('Digitei o e-mail errado'),
              ),
            ),
            const SizedBox(height: BichuEspaco.e6),
            Text(
              'Você pode cadastrar seu pet agora. A confirmação do e-mail não '
              'impede isso.',
              style: textos.bodyMedium?.copyWith(color: cores.textSecondary),
            ),
          ],
        ),
      ),
    );
  }
}
