import 'dart:async';

import 'package:flutter/material.dart';

import '../../acessibilidade/anunciar.dart';
import '../../api/falhas.dart';
import '../../api/mensagens_de_erro.dart';
import '../../escopo.dart';
import '../../theme/bichu_colors.dart';
import '../../theme/bichu_tokens.g.dart';
import '../../widgets/bichu_field.dart';
import '../../widgets/botao_primario.dart';
import '../../widgets/faixa_de_aviso.dart';
import '../../widgets/saida_da_tela.dart';

/// C.4 — Esqueci minha senha.
///
/// **A confirmacao e identica para e-mail existente e inexistente.** "Se essa
/// conta existir" soa burocratico de proposito: qualquer redacao mais calorosa
/// ("Pronto, enviamos") afirma que a conta existe, e isso entrega uma lista de
/// quem tem conta no Bichu.
///
/// O pedido **nao** entra em fila offline. Um pedido de redefinicao disparado
/// sozinho meia hora depois, sem a pessoa presente, gasta o token no vazio.
///
/// **Desvio, e o mais fundo dos tres.** Ela e alcancada por `push` a partir da
/// C.2, e voltar devolve a C.2 com o e-mail ainda digitado. A saida continua
/// valendo depois do pedido enviado: a confirmacao e o fim do que esta tela
/// faz, e nao ha passo seguinte dentro do app -- o proximo passo esta na caixa
/// de entrada da pessoa (C.5 e uma pagina web). Sem a saida, a unica coisa a
/// fazer depois de ler a confirmacao era fechar o app.
class TelaEsqueciMinhaSenha extends StatefulWidget {
  const TelaEsqueciMinhaSenha({super.key, this.emailInicial});

  final String? emailInicial;

  @override
  State<TelaEsqueciMinhaSenha> createState() => _TelaEsqueciMinhaSenhaState();
}

class _TelaEsqueciMinhaSenhaState extends State<TelaEsqueciMinhaSenha> {
  static const int _segundosDeEspera = 60;

  late final TextEditingController _email =
      TextEditingController(text: widget.emailInicial ?? '');
  final FocusNode _focoDaConfirmacao = FocusNode();

  bool _enviando = false;
  bool _pedido = false;
  int _restante = 0;
  Timer? _contagem;
  String? _erroDoCampo;
  MensagemDeErro? _faixa;

  @override
  void dispose() {
    _contagem?.cancel();
    _email.dispose();
    _focoDaConfirmacao.dispose();
    super.dispose();
  }

  Future<void> _enviarOLink() async {
    setState(() {
      _erroDoCampo = null;
      _faixa = null;
    });

    final email = _email.text.trim();
    final arroba = email.indexOf('@');
    if (arroba <= 0 || email.indexOf('.', arroba) <= arroba + 1) {
      setState(() => _erroDoCampo = 'Digite o e-mail da sua conta.');
      return;
    }

    setState(() => _enviando = true);
    try {
      await Escopo.of(context).auth.pedirRedefinicaoDeSenha(email);
      if (!mounted) return;
      setState(() => _pedido = true);
      _iniciarContagem();
      _focoDaConfirmacao.requestFocus();
    } on FalhaDeConexao {
      if (!mounted) return;
      setState(() {
        _faixa = const MensagemDeErro(
          texto: 'Não conseguimos enviar agora. Verifique a conexão e toque '
              'de novo.',
        );
      });
    } on FalhaDeChamada catch (falha) {
      if (!mounted) return;
      setState(() => _faixa = MensagensDeErro.de(falha));
    } on Object catch (erro, pilha) {
      // O QUE NAO E FalhaDeChamada. O `finally` ja desligava o carregando,
      // entao a tela nao gira para sempre -- ela fica CALADA, que e o outro
      // lado do mesmo defeito: nada aconteceu, nada foi dito, e a pessoa toca
      // de novo achando que o primeiro toque nao pegou.
      registrarFalhaInesperada(erro, pilha, onde: 'ao pedir a redefinicao de senha');
      if (!mounted) return;
      setState(
        () => _faixa = const MensagemDeErro(texto: MensagensDeErro.servidorFora),
      );
    } finally {
      if (mounted) setState(() => _enviando = false);
    }
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
        anunciar(context, 'Você já pode reenviar o link.');
      }
    });
  }

  @override
  Widget build(BuildContext context) {
    final cores = BichuColors.of(context).cores;
    final textos = Theme.of(context).textTheme;

    return Scaffold(
      appBar: const BarraDeConta(
        titulo: 'Esqueci minha senha',
        saida: TipoDeSaida.voltar,
      ),
      body: SafeArea(
        child: ListView(
          padding: const EdgeInsets.all(BichuEspaco.e4),
          children: <Widget>[
            if (!_pedido) ...<Widget>[
              Text(
                'Digite o e-mail da sua conta. A gente manda um link para você '
                'criar uma senha nova.',
                style: textos.bodyLarge,
              ),
              const SizedBox(height: BichuEspaco.e6),
              BichuField(
                rotulo: 'E-mail',
                controlador: _email,
                erro: _erroDoCampo,
                tipoDeTeclado: TextInputType.emailAddress,
                autofill: const <String>[AutofillHints.email],
                correcaoAutomatica: false,
                acaoDeTeclado: TextInputAction.done,
                aoEnviar: (_) => _enviarOLink(),
              ),
              if (_faixa != null) ...<Widget>[
                const SizedBox(height: BichuEspaco.e6),
                FaixaDeAviso(texto: _faixa!.texto),
              ],
              const SizedBox(height: BichuEspaco.e8),
              BotaoPrimario(
                rotulo: 'Enviar o link',
                carregando: _enviando,
                aoTocar: _enviarOLink,
              ),
            ] else ...<Widget>[
              Focus(
                focusNode: _focoDaConfirmacao,
                child: Semantics(
                  liveRegion: true,
                  container: true,
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: <Widget>[
                      Text(
                        'Se essa conta existir, o link já está a caminho.',
                        style: textos.headlineSmall,
                      ),
                      const SizedBox(height: BichuEspaco.e4),
                      Text(
                        'Procure por um e-mail do Bichu em '
                        '${_email.text.trim()}. Ele vale por 30 minutos.',
                        style: textos.bodyLarge,
                      ),
                      const SizedBox(height: BichuEspaco.e2),
                      Text(
                        'Confira também a caixa de spam.',
                        style: textos.bodyLarge
                            ?.copyWith(color: cores.textSecondary),
                      ),
                    ],
                  ),
                ),
              ),
              if (_faixa != null) ...<Widget>[
                const SizedBox(height: BichuEspaco.e6),
                FaixaDeAviso(texto: _faixa!.texto),
              ],
              const SizedBox(height: BichuEspaco.e8),
              BotaoSecundario(
                rotulo: _restante > 0
                    ? 'Reenviar em 0:${_restante.toString().padLeft(2, '0')}'
                    : 'Reenviar o link',
                aoTocar:
                    _restante > 0 || _enviando ? null : _enviarOLink,
              ),
            ],
          ],
        ),
      ),
    );
  }
}
