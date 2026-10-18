import 'package:flutter/material.dart';
import 'package:go_router/go_router.dart';

import '../../api/falhas.dart';
import '../../api/mensagens_de_erro.dart';
import '../../escopo.dart';
import '../../formato/email.dart';
import '../../intencao/ir_para_o_destino.dart';
import '../../roteamento/rotas.dart';
import '../../theme/bichu_tokens.g.dart';
import '../../widgets/barra_de_acao_fixa.dart';
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
/// **Sem caixa de "continuar conectado"**, por decisao do cliente de
/// 22/09/2026: a sessao persistente virou comportamento padrao nesta tela e na
/// F1.1. Ver `AuthApi.sessaoPersistentePorPadrao`.
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
  late final TextEditingController _email = TextEditingController(
    text: widget.emailInicial ?? '',
  );
  final TextEditingController _senha = TextEditingController();

  final FocusNode _focoDoEmail = FocusNode();
  final FocusNode _focoDaSenha = FocusNode();

  final ScrollController _rolagem = ScrollController();

  /// Onde a faixa de recusa nasce, para `_levarAte` ter um alvo.
  final GlobalKey _alvoDaFaixa = GlobalKey();

  bool _senhaVisivel = false;
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
    _rolagem.dispose();
    super.dispose();
  }

  /// Traz o alvo da recusa para dentro da janela.
  ///
  /// Necessario desde que o botao saiu da rolagem: quem toca num botao
  /// alcancavel de qualquer ponto pode estar num ponto em que a recusa fica
  /// fora da tela, e recusar onde ninguem olha e indistinguivel de nao
  /// responder.
  ///
  /// Roda **depois do quadro**, porque quem chama acabou de fazer `setState` e
  /// a faixa ainda nao tem altura: medir antes do relayout leva a pessoa para
  /// onde a faixa nao esta. `alignment: 0.5` centraliza, porque conteudo
  /// colado na borda fica meio escondido atras do teclado.
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
    } else if (!emailPlausivel(email)) {
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

  /// Conferencia ao sair do campo, com a mensagem curta de
  /// `formato/email.dart`. Campo vazio nao erra aqui: quem tocou o campo e
  /// desistiu nao levou erro. Vazio continua sendo erro no envio.
  void _conferirOEmailAoSair() {
    final erro = erraAoSairDoCampo(_email.text) ? erroAoSairDoEmail : null;
    if (erro != _erroDoEmail) setState(() => _erroDoEmail = erro);
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
      // `continuarConectado` NAO e passado: virou o padrao de `AuthApi`, por
      // decisao do cliente de 22/09/2026. Ver
      // `AuthApi.sessaoPersistentePorPadrao`.
      final sessao = await escopo.auth.entrar(
        email: _email.text.trim(),
        senha: _senha.text,
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
      _levarAte(_alvoDaFaixa);
    } on Object catch (erro, pilha) {
      // O QUE NAO E FalhaDeChamada -- 201 fora do contrato faz `Sessao.doJson`
      // estourar `TypeError`, e o chaveiro pode estourar `PlatformException`.
      // O `finally` abaixo ja desligava o carregando, entao a tela nao girava
      // para sempre; ela ficava CALADA, que e o outro lado do mesmo defeito.
      // A pessoa ve o formulario do jeito que estava e toca de novo achando
      // que o primeiro toque nao pegou.
      registrarFalhaInesperada(erro, pilha, onde: 'ao entrar na conta');
      if (!mounted) return;
      setState(
        () =>
            _faixa = const MensagemDeErro(texto: MensagensDeErro.servidorFora),
      );
      _levarAte(_alvoDaFaixa);
    } finally {
      if (mounted) setState(() => _enviando = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    // O TECLADO E MEDIDO AQUI, ACIMA DO `Scaffold`, E NAO LA DENTRO.
    //
    // `Scaffold` com `resizeToAvoidBottomInset` -- que e o padrao -- ja trata o
    // teclado: ele ENCOLHE o corpo e entrega ao corpo um `MediaQuery` com
    // `viewInsets.bottom` **zerado**. Quem perguntar pelo teclado de dentro do
    // corpo recebe "fechado" com o teclado aberto na cara. Este `context` e o
    // do `State`, acima do `Scaffold`, e e o unico ponto desta tela que ve o
    // numero de verdade. Mesmo motivo escrito em `escanear/tela_leitor_de_qr`.
    final tecladoAberto = MediaQuery.viewInsetsOf(context).bottom > 0;
    final alturaDaTela = MediaQuery.sizeOf(context).height;

    return Scaffold(
      appBar: const BarraDeConta(titulo: 'Entrar', saida: TipoDeSaida.voltar),
      // O BOTAO DE ENTRAR NAO ROLA COM O FORMULARIO, E ISSO FOI MEDIDO.
      //
      // Medido em 23/09/2026 nos quatro gabaritos do design system (secao 13),
      // com o teclado de 270 dp aberto e os dois campos preenchidos. O botao
      // ocupava 286..334 dp de um conteudo de 414 dp, e a area rolavel era:
      //
      //   320 x 568  ->  234 dp de janela, faltavam 100 dp de rolagem
      //   360 x 640  ->  306 dp de janela, faltavam  28 dp de rolagem
      //   375 x 667  ->  333 dp de janela, o botao cabia
      //   412 x 915  ->  581 dp de janela, o botao cabia
      //
      // O numero que decide nao e esse. E o da tela DEPOIS do 401, que e o
      // estado de quem digitou a senha errada -- ou seja, exatamente quem ja
      // tem conta e voltou. A faixa de recusa acrescenta 236 dp acima do
      // botao, e ai faltavam 360 dp em 320 x 568, 264 dp em 360 x 640 e 231 dp
      // em 375 x 667, um gabarito em que a tela estava certa antes do erro.
      // A pessoa erra a senha e o caminho para tentar de novo sai da tela.
      //
      // Pior que a rolagem: em 320 x 568 o `ListView` **nao chegava a
      // construir** o botao. Ele nao estava na arvore, entao nao podia ser
      // focado nem lido por leitor de tela, e nenhum portao pegava isso.
      bottomNavigationBar: BarraDeAcaoFixa(
        acoes: <Widget>[
          BotaoPrimario(
            rotulo: 'Entrar',
            carregando: _enviando,
            // Continua habilitado sem conexao, pelo mesmo motivo de F1.1: o
            // detector de offline erra, e deixar a pessoa sem caminho e pior
            // que deixa-la tentar.
            aoTocar: _entrar,
          ),
        ],
      ),
      // **`SingleChildScrollView` + `Column`, e nao `ListView`**, pelo motivo
      // registrado em `pet/tela_editar_pet.dart` e em F1.1: o `ListView` so
      // constroi o que cabe, e o que nao existe na arvore nao e alcancavel por
      // leitor de tela. Sao sete filhos e nenhuma lista de tamanho aberto:
      // construir todos custa nada, e e o que da a `_levarAte` para onde
      // rolar. Preguica de construcao serve a lista de registros, nao a
      // formulario de seis campos.
      body: SafeArea(
        child: SingleChildScrollView(
          controller: _rolagem,
          padding: const EdgeInsets.all(BichuEspaco.e4),
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.stretch,
            children: <Widget>[
              // A ILUSTRACAO DA IDENTIDADE VISUAL, no alto da porta de entrada
              // (pedido do cliente: "a imagem da identidade visual das pessoas
              // com o pet no parque", na TELA DE ENTRAR).
              //
              // **Ela SAI com o teclado aberto**, e essa e a parte que decide
              // se a tela continua usavel -- ver `_IlustracaoDaEntrada`.
              if (!tecladoAberto) ...<Widget>[
                _IlustracaoDaEntrada(alturaDaTela: alturaDaTela),
                const SizedBox(height: BichuEspaco.e6),
              ],
              BichuField(
                rotulo: 'E-mail',
                controlador: _email,
                foco: _focoDoEmail,
                erro: _erroDoEmail,
                tipoDeTeclado: TextInputType.emailAddress,
                autofill: const <String>[AutofillHints.email],
                // Endereco nao tem correcao automatica nem maiuscula
                // automatica: as duas transformam o que a pessoa escreveu.
                correcaoAutomatica: false,
                capitalizacao: TextCapitalization.none,
                acaoDeTeclado: TextInputAction.next,
                aoPerderFoco: _conferirOEmailAoSair,
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
              if (_faixa != null) ...<Widget>[
                const SizedBox(height: BichuEspaco.e6),
                FaixaDeAviso(
                  key: _alvoDaFaixa,
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
              const SizedBox(height: BichuEspaco.e6),
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
      ),
    );
  }
}

/// A ilustracao da identidade visual no alto da tela de entrar.
///
/// **De onde sai a imagem.** `assets/ilustracoes/tres-pessoas-no-parque.webp`,
/// derivada da arte do cliente -- as tres pessoas com os pets, arvores e os
/// predios do bairro atras. A procedencia, o comando que refaz o arquivo e o
/// porque do formato estao escritos em `app/pubspec.yaml`, ao lado da
/// declaracao do asset. **Embarcada**: nada de rede, porque a tela de login
/// pode ser a primeira coisa que o aparelho abre e com sinal ruim ela ficaria
/// feia exatamente quando precisa estar de pe.
///
/// **DECORATIVA, e por isso `excludeFromSemantics`.** Quem usa leitor de tela
/// chega aqui ja ouvindo `Entrar` da barra de topo e encontra logo abaixo os
/// rotulos `E-mail` e `Senha`: a ilustracao nao diz nada que o texto da tela
/// nao diga, e esse e exatamente o criterio de decorativo do WCAG 1.1.1.
/// Descreve-la ("tres pessoas com seus pets") custaria um anuncio inteiro
/// antes do primeiro campo, sem entregar nada que mude o que a pessoa faz
/// aqui. Nenhuma frase nova entrou em tela junto dela.
///
/// **TECLADO ABERTO: ela nao aparece.** Quem chama decide isso (o `if` em
/// `build`), porque so la em cima o `viewInsets` e visivel. Esta tela tem dois
/// campos e o teclado come perto da metade da altura util; dividir o que
/// sobra com uma imagem de 128 a 192 dp empurraria o campo da senha e a faixa
/// de recusa para fora da dobra, que e o erro classico de imagem grande em
/// tela de login. Com o teclado na tela o formulario volta a ser EXATAMENTE o
/// que era antes desta mudanca, inclusive a conta de rolagem medida em
/// 23/09/2026 que esta no comentario do `bottomNavigationBar`. E o corpo
/// continua sendo `SingleChildScrollView`: mesmo com o teclado fechado, numa
/// tela curta a coluna inteira rola -- nada e cortado, nem estoura.
///
/// **Tela pequena e tela grande.** A altura e 20% da altura da tela, presa
/// entre [_piso] e [_teto], que sao multiplos do passo de espaco do tema e nao
/// numero inventado. Nos quatro gabaritos do design system: 320x568 e 360x640
/// batem no piso de 128 dp; 375x667 fica em 133 dp; 412x915 vai a 183 dp. A
/// largura vem esticada da coluna e o `BoxFit.contain` preserva a proporcao
/// 2:1 da arte -- em tela larga sobra transparente dos lados, e nunca corta
/// pessoa nem pet. O maior retangulo que a imagem chega a ocupar e 384x192 dp,
/// que e de onde sai a largura de 1152 px do arquivo (384 x 3).
class _IlustracaoDaEntrada extends StatelessWidget {
  const _IlustracaoDaEntrada({required this.alturaDaTela});

  /// Altura da tela medida acima do `Scaffold`.
  final double alturaDaTela;

  static const String caminho = 'assets/ilustracoes/tres-pessoas-no-parque.webp';

  /// Fracao da altura da tela que a ilustracao pode ocupar.
  static const double _fracaoDaAltura = 0.2;

  /// Piso e teto, em passos do espaco do tema (`BichuEspaco.e16` = 64).
  static const double _piso = BichuEspaco.e16 * 2;
  static const double _teto = BichuEspaco.e16 * 3;

  static double alturaPara(double alturaDaTela) =>
      (alturaDaTela * _fracaoDaAltura).clamp(_piso, _teto);

  @override
  Widget build(BuildContext context) {
    return Image.asset(
      caminho,
      height: alturaPara(alturaDaTela),
      fit: BoxFit.contain,
      // Decorativa: fora da arvore de semantica. Ver a nota da classe.
      excludeFromSemantics: true,
      // O arquivo e dimensionado para a densidade 3x; em aparelho 2x ele
      // encolhe, e `low` (o padrao) serrilha o traco chapado desta arte.
      filterQuality: FilterQuality.medium,
    );
  }
}
