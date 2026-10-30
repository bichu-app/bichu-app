import 'package:flutter/material.dart';

import '../../api/ajuda_api.dart';
import '../../api/falhas.dart';
import '../../api/mensagens_de_erro.dart';
import '../../escopo.dart';
import '../../roteamento/saida_da_mensagem.dart';
import '../../theme/bichu_tokens.g.dart';
import '../../widgets/barra_de_acao_fixa.dart';
import '../../widgets/bichu_field.dart';
import '../../widgets/botao_primario.dart';
import '../../widgets/faixa_de_aviso.dart';
import '../../widgets/saida_da_tela.dart';

/// `Ajuda` — o formulario de duvida, aberto pelo menu do usuario.
class TelaDeDuvida extends StatefulWidget {
  const TelaDeDuvida({super.key});

  /// O rotulo do item no menu do usuario e o titulo desta tela, numa fonte so.
  static const String titulo = 'Ajuda';

  @override
  State<TelaDeDuvida> createState() => _TelaDeDuvidaState();
}

class _TelaDeDuvidaState extends State<TelaDeDuvida> {
  /// Os mesmos tetos de `HelpRequestInput` e dos dois `CHECK` de
  /// `help_requests`.
  static const int _tetoDoAssunto = 120;
  static const int _tetoDoTexto = 4000;

  final TextEditingController _assunto = TextEditingController();
  final TextEditingController _texto = TextEditingController();
  final ScrollController _rolagem = ScrollController();
  final FocusNode _focoDaConfirmacao = FocusNode();

  /// Onde a faixa de recusa nasce, para `_levarAte` ter um alvo.
  final GlobalKey _alvoDaFaixa = GlobalKey();

  bool _enviando = false;
  bool _enviada = false;
  String? _erroDoAssunto;
  String? _erroDoTexto;
  MensagemDeErro? _faixa;

  @override
  void dispose() {
    _assunto.dispose();
    _texto.dispose();
    _rolagem.dispose();
    _focoDaConfirmacao.dispose();
    super.dispose();
  }

  /// Traz a recusa para dentro da janela.
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

  /// Confere **sobre o aparado**, que e o que o servidor vai gravar.
  bool _confereOsCampos() {
    final assunto = _assunto.text.trim();
    final texto = _texto.text.trim();
    final erroDoAssunto = assunto.isEmpty ? 'Escreva um assunto.' : null;
    final erroDoTexto = texto.isEmpty ? 'Escreva a sua dúvida.' : null;
    if (erroDoAssunto != _erroDoAssunto || erroDoTexto != _erroDoTexto) {
      setState(() {
        _erroDoAssunto = erroDoAssunto;
        _erroDoTexto = erroDoTexto;
      });
    }
    return erroDoAssunto == null && erroDoTexto == null;
  }

  Future<void> _enviar() async {
    if (_enviando) return;
    setState(() => _faixa = null);
    if (!_confereOsCampos()) return;

    setState(() => _enviando = true);
    try {
      await AjudaApi(Escopo.of(context).api).mandarDuvida(_assunto.text, _texto.text);
      if (!mounted) return;
      setState(() => _enviada = true);
      _focoDaConfirmacao.requestFocus();
    } on FalhaDeConexao {
      if (!mounted) return;
      setState(() {
        _faixa = const MensagemDeErro(
          texto: 'Não conseguimos enviar agora. Verifique a conexão e toque de novo.',
        );
      });
      _levarAte(_alvoDaFaixa);
    } on FalhaDeChamada catch (falha) {
      if (!mounted) return;
      setState(() => _faixa = MensagensDeErro.de(falha));
      _levarAte(_alvoDaFaixa);
    } finally {
      if (mounted) setState(() => _enviando = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    final textos = Theme.of(context).textTheme;

    return Scaffold(
      appBar: const BarraDeConta(
        titulo: TelaDeDuvida.titulo,
        saida: TipoDeSaida.voltar,
      ),
      bottomNavigationBar: _enviada
          ? null
          : BarraDeAcaoFixa(
              acoes: <Widget>[
                BotaoPrimario(
                  rotulo: 'Enviar dúvida',
                  carregando: _enviando,
                  aoTocar: _enviar,
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
              if (_enviada)
                Focus(
                  focusNode: _focoDaConfirmacao,
                  child: Semantics(
                    liveRegion: true,
                    container: true,
                    child: Column(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: <Widget>[
                        Text('Recebemos sua dúvida', style: textos.headlineSmall),
                        const SizedBox(height: BichuEspaco.e3),
                        Text(
                          'Ela entrou na nossa fila e vai ser lida pela nossa equipe.',
                          style: textos.bodyLarge,
                        ),
                      ],
                    ),
                  ),
                )
              else ...<Widget>[
                Text(
                  'Conte o que aconteceu. A gente lê todas as mensagens.',
                  style: textos.bodyLarge,
                ),
                const SizedBox(height: BichuEspaco.e6),
                BichuField(
                  rotulo: 'Assunto',
                  controlador: _assunto,
                  erro: _erroDoAssunto,
                  limite: _tetoDoAssunto,
                  exemplo: 'Em poucas palavras',
                  capitalizacao: TextCapitalization.sentences,
                  acaoDeTeclado: TextInputAction.next,
                  habilitado: !_enviando,
                ),
                const SizedBox(height: BichuEspaco.e5),
                BichuField(
                  rotulo: 'Sua dúvida',
                  controlador: _texto,
                  erro: _erroDoTexto,
                  ajuda: 'Quanto mais detalhe, melhor a gente entende.',
                  limite: _tetoDoTexto,
                  linhas: 6,
                  capitalizacao: TextCapitalization.sentences,
                  habilitado: !_enviando,
                ),
                if (_faixa != null) ...<Widget>[
                  const SizedBox(height: BichuEspaco.e6),
                  FaixaDeAviso(
                    key: _alvoDaFaixa,
                    texto: _faixa!.texto,
                    rotuloDaAcao: _faixa!.acao,
                    aoTocarNaAcao: saidaDaMensagem(context, _faixa!),
                  ),
                ],
              ],
            ],
          ),
        ),
      ),
    );
  }
}
