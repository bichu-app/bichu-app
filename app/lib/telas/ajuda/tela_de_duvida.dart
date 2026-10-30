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
///
/// Pedido do cliente de 29/10/2026, literal: *"no menu do usuario, adicione um
/// botao de ajuda, que abrira uma pagina com um formulario de duvida"*.
/// Perguntado onde a duvida para, ele escolheu **grava no banco e vai para o
/// backoffice**, na variante **sem notificacao por e-mail**.
///
/// ## DOIS CAMPOS, E O TUTOR NAO DIGITA QUEM ELE E
///
/// `Assunto` e `Sua duvida`, e so. Nao ha campo de nome, de e-mail nem de
/// telefone, e a ausencia e decisao e nao economia: esta tela so existe logado,
/// entao o servidor ja sabe de quem e a duvida. Um campo de contato aqui seria
/// um dado que a pessoa digita, o servidor grava e ninguem confere -- e, se
/// divergisse do da conta, o atendimento responderia para o lugar errado.
///
/// ## A TELA NAO AFIRMA O QUE ELA NAO PODE PROVAR
///
/// A confirmacao diz *"Recebemos sua duvida"* e nao *"Enviamos"*: o `202` prova
/// que o servidor aceitou e gravou, e nao prova entrega a ninguem. E ela nao
/// promete prazo, pela mesma razao das denuncias -- prazo prometido por uma
/// tela e prazo que ninguem do outro lado assinou.
///
/// **E ELA NAO PROMETE RESPOSTA.** Esta tela ja prometeu: *"A gente responde
/// pelo e-mail da sua conta"*, nos dois textos, e a promessa era falsa. A fila
/// do painel **nao projeta nome nem e-mail** do autor -- a unica leitura de
/// pessoa do backoffice e a de pedidos de encontro (D53 a D57), e o cliente
/// decidiu em 30/10/2026 que a fila serve para ele LER, e nada mais.
///
/// O que a tela pode afirmar, e afirma, e que a duvida foi recebida e vai ser
/// lida. "Vai ser lida" e verdade medida: ha uma fila no painel, com uma tela
/// que a mostra e um estado de ATENDIDA que alguem marca.
///
/// ## O TETO RECUSA, E NUNCA CORTA
///
/// `BichuField` para de aceitar no teto (`maxLength`), entao o tutor VE o
/// contador travar em vez de descobrir depois que o texto foi cortado. Se
/// mesmo assim o servidor recusar por tamanho, a faixa de erro traz a frase
/// DELE -- esta tela nao reescreve recusa de servidor.
class TelaDeDuvida extends StatefulWidget {
  const TelaDeDuvida({super.key});

  /// O rotulo do item no menu do usuario e o titulo desta tela, numa fonte so.
  static const String titulo = 'Ajuda';

  @override
  State<TelaDeDuvida> createState() => _TelaDeDuvidaState();
}

class _TelaDeDuvidaState extends State<TelaDeDuvida> {
  /// Os mesmos tetos de `HelpRequestInput` e dos dois `CHECK` de
  /// `help_requests`. Tres lugares, um numero: mudar um sem os outros faz o
  /// campo aceitar o que o banco recusa.
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
  ///
  /// Necessario porque o botao vive fora da rolagem: a faixa pode nascer acima
  /// da dobra de quem tocou nele, e recusar onde ninguem olha e indistinguivel
  /// de nao responder. Roda depois do quadro, porque a faixa ainda nao tem
  /// altura no instante do `setState`.
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
  ///
  /// Campo de so espacos tem comprimento e passaria por uma conferencia de
  /// `isEmpty`; aparado, ele e nada. O servidor faz a mesma conta e responde
  /// `400` -- esta conferencia so poupa a viagem.
  bool _confereOsCampos() {
    final assunto = _assunto.text.trim();
    final texto = _texto.text.trim();
    final erroDoAssunto = assunto.isEmpty ? 'Escreva um assunto.' : null;
    final erroDoTexto = texto.isEmpty ? 'Escreva a sua dúvida.' : null;
    // OS DOIS DE UMA VEZ, e nao o primeiro que aparecer: a mensagem fica
    // embaixo de cada campo, e mostrar um de cada vez faria a pessoa corrigir,
    // tocar em enviar e so entao descobrir o segundo.
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
      // A FRASE E DO SERVIDOR. Reescrever a recusa aqui faria a tela decidir
      // pelo texto em vez de pelo `type` do problema -- e a frase do servidor e
      // a unica que conhece o teto de chamada que acabou de ser estourado.
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
      // A acao fora da rolagem, como nas outras telas de formulario: em tela
      // baixa o `ListView` nem construia o botao, e o que nao esta na arvore
      // nao e alcancavel por leitor de tela.
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
      // `SingleChildScrollView` + `Column`, e nao `ListView`: o `ListView` so
      // constroi o que cabe, e esta tela tem meia duzia de filhos fixos.
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
                        // `Recebemos` e nao `Enviamos`: o `202` prova que o
                        // servidor aceitou e gravou, e nao prova entrega.
                        Text('Recebemos sua dúvida', style: textos.headlineSmall),
                        const SizedBox(height: BichuEspaco.e3),
                        // **SEM PROMESSA DE RESPOSTA**, e a frase anterior
                        // prometia: *"A gente responde pelo e-mail da sua
                        // conta"*. O produto nao cumpre isso -- a fila do
                        // painel nao projeta nome nem e-mail do autor (a
                        // unica leitura de pessoa do backoffice e outra, D53 a
                        // D57), e o cliente decidiu em 30/10/2026 que a fila
                        // serve para ele LER, e nada mais.
                        //
                        // Tambem sem PRAZO: "em ate X dias" seria a mesma
                        // promessa com numero.
                        Text(
                          'Ela entrou na nossa fila e vai ser lida pela nossa equipe.',
                          style: textos.bodyLarge,
                        ),
                      ],
                    ),
                  ),
                )
              else ...<Widget>[
                // Ver a nota da tela de recebido: nada aqui promete resposta.
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
