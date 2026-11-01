import 'dart:async';

import 'package:flutter/material.dart';
import 'package:go_router/go_router.dart';

import '../../acessibilidade/anunciar.dart';
import '../../api/falhas.dart';
import '../../api/mensagens_de_erro.dart';
import '../../escopo.dart';
import '../../intencao/ir_para_o_destino.dart';
import '../../roteamento/rotas.dart';
import '../../theme/bichu_tokens.g.dart';
import '../../widgets/botao_primario.dart';
import '../../widgets/faixa_de_aviso.dart';
import '../../widgets/saida_da_tela.dart';

/// F1.2 — Verifique seu e-mail.
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

  Future<void> _continuar() async {
    final destino = await Escopo.of(context).guarda.executarDepoisDoLogin();
    if (!mounted) return;
    irParaODestinoDoLogin(context, destino);
  }

  @override
  Widget build(BuildContext context) {
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
              'Falta confirmar ${widget.email}. Se o link não chegar, reenvie.',
              style: textos.bodyLarge,
            ),
            if (_faixa != null) ...<Widget>[
              const SizedBox(height: BichuEspaco.e6),
              FaixaDeAviso(texto: _faixa!.texto),
            ],
            const SizedBox(height: BichuEspaco.e8),
            BotaoPrimario(
              rotulo: 'Continuar',
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
                onPressed: () => context.pushReplacement(
                  Rotas.criarConta,
                  extra: widget.email,
                ),
                child: const Text('Digitei o e-mail errado'),
              ),
            ),
          ],
        ),
      ),
    );
  }
}
