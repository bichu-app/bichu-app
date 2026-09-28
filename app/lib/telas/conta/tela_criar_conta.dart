import 'package:flutter/gestures.dart';
import 'package:flutter/material.dart';
import 'package:go_router/go_router.dart';
import 'package:url_launcher/url_launcher.dart';

import '../../acessibilidade/anunciar.dart';
import '../../api/falhas.dart';
import '../../api/mensagens_de_erro.dart';
import '../../api/problem.dart';
import '../../config/app_config.dart';
import '../../escopo.dart';
import '../../roteamento/rotas.dart';
import '../../theme/bichu_colors.dart';
import '../../theme/bichu_tokens.g.dart';
import '../../validacao/politica_de_senha.dart';
import '../../widgets/barra_de_acao_fixa.dart';
import '../../widgets/bichu_field.dart';
import '../../widgets/botao_primario.dart';
import '../../widgets/faixa_de_aviso.dart';
import '../../widgets/requisitos_da_senha.dart';
import '../../widgets/saida_da_tela.dart';

/// A recusa de criar conta sem ter o que registrar como aceite.
///
/// Texto de tela, e nao de log: quem le e a pessoa, e ela nao tem como
/// consertar isto. O que a frase precisa fazer e nao mentir -- nao dizer
/// "tente de novo", porque tentar de novo neste build da no mesmo.
const String _semVersaoDosTermos =
    'Não conseguimos registrar o aceite dos termos nesta versão do app. '
    'Sem esse registro a conta não pode ser criada.';

/// A cobranca do aceite, quando ha o que registrar e a caixa esta desmarcada.
const String _aceiteObrigatorio =
    'Para criar a conta, aceite os termos de uso e a política de privacidade.';

/// F1.1 — Criar conta.
///
/// Tres campos, a regra de senha dita **antes** do erro, e **uma** caixa: a do
/// aceite dos termos.
///
/// **Duas mudancas do teste em aparelho de 22/09/2026**, nas palavras do
/// cliente: "o checkbox que eu pedi para sobre o termos de uso na pagina de
/// cadastro voce nao implementou. Retire o checkbox de manter conectado e
/// traga isso como um comportamento padrao, tanto na tela de cadastro, quanto
/// na tela de login."
///
/// A caixa que saiu governava a janela de inatividade do refresh (30 dias
/// desmarcada, 180 marcada, ADR-0019). Como comportamento padrao ela vale
/// sempre marcada -- ver `AuthApi.sessaoPersistentePorPadrao`, onde a
/// implicacao de seguranca esta escrita.
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

  /// Existe por uma razao so: **levar a pessoa ate a recusa**.
  ///
  /// A faixa de "este build nao registra aceite" mora no topo do formulario, e
  /// o botao agora mora na barra fixa do rodape, fora da rolagem. Quem toca
  /// nele pode estar em qualquer ponto do formulario: sem esta rolagem a tela
  /// recusa num lugar que a pessoa nao esta olhando, e o resultado, do lado de
  /// ca, e um botao que nao faz nada.
  final ScrollController _rolagem = ScrollController();

  /// Os tres alvos de recusa, para a tela conseguir levar a pessoa ate eles.
  ///
  /// **Sem isto a barra fixa piora o defeito que ela resolve.** Com o botao
  /// rolando junto do conteudo, quem tocava nele estava no fim do formulario e
  /// via o erro aparecer a poucos dp dali. Ancorado no rodape, o botao fica
  /// alcancavel de qualquer ponto -- inclusive de um ponto em que o campo
  /// recusado esta a 400 dp de distancia, fora da tela. Marcar o campo com
  /// `erro` e nao mostra-lo e escrever a resposta num lugar que ninguem olha,
  /// que e exatamente "toquei no botao e nao aconteceu nada".
  final GlobalKey _alvoDoEmail = GlobalKey();
  final GlobalKey _alvoDaSenha = GlobalKey();
  final GlobalKey _alvoDoAceite = GlobalKey();

  bool _senhaVisivel = false;
  bool _aceitouOsTermos = false;
  bool _enviando = false;
  String? _erroDoEmail;
  String? _erroDaSenha;
  String? _erroDoAceite;
  MensagemDeErro? _faixa;

  /// Traz o alvo da recusa para dentro da dobra.
  ///
  /// `alignment: 0.5` centraliza em vez de encostar na borda: campo colado no
  /// limite do viewport fica meio escondido atras da barra fixa ou do teclado,
  /// e meio escondido e o mesmo que nao mostrado para quem esta procurando o
  /// que deu errado.
  ///
  /// Roda **depois do quadro** porque quem chama acabou de fazer `setState`: a
  /// mensagem de erro muda a altura do campo, e medir antes do relayout leva a
  /// pessoa para o lugar onde o campo estava.
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

  @override
  void dispose() {
    _nome.dispose();
    _email.dispose();
    _senha.dispose();
    _focoDoEmail.dispose();
    _rolagem.dispose();
    super.dispose();
  }

  Future<void> _criarConta() async {
    setState(() {
      _erroDoEmail = null;
      _erroDaSenha = null;
      _erroDoAceite = null;
      _faixa = null;
    });

    // Validacao no cliente e conveniencia; a autoridade fica no servidor.
    // Ela existe aqui so para a pessoa nao gastar uma ida a rede a toa.
    if (!_emailPlausivel(_email.text)) {
      setState(() => _erroDoEmail = 'Digite o e-mail da sua conta.');
      _focoDoEmail.requestFocus();
      _levarAte(_alvoDoEmail);
      return;
    }
    // A politica INTEIRA, e nao so o tamanho. Enquanto isto era
    // `_senha.text.length < 10`, a tela deixava passar a senha igual ao
    // e-mail e a senha de 300 caracteres, e a recusa vinha do servidor depois
    // da ida a rede -- com o texto errado, porque o `_tratar` abaixo
    // respondia "pelo menos 10 caracteres" a qualquer recusa.
    //
    // A lista de `RequisitosDaSenha` ja mostrou isto enquanto a pessoa
    // digitava; aqui a mesma fonte decide, e e por isso que as duas nao tem
    // como divergir.
    final violacoes = PoliticaDeSenha.violacoes(
      senha: _senha.text,
      email: _email.text.trim(),
      nome: _nome.text.trim(),
    );
    if (violacoes.isNotEmpty) {
      setState(() => _erroDaSenha = violacoes.first.mensagemDeErro);
      _levarAte(_alvoDaSenha);
      return;
    }

    // O ACEITE E REGISTRO JURIDICO, E ELE TEM DUAS CONDICOES.
    //
    // A primeira e a pessoa ter marcado. A segunda, que e a que costuma
    // passar batida, e HAVER O QUE REGISTRAR: sem `TERMS_VERSION` a chave
    // `accepted_terms_version` nao vai no corpo, e o backend so grava
    // `accepted_terms_at` quando ela chega
    // (`kysely-identity-repository.ts:119`). Marcar a caixa nesse build
    // gravaria conta criada e NENHUM registro de qual versao foi aceita --
    // que e a pior combinacao das duas, porque a tela afirma um aceite que o
    // banco nao tem.
    //
    // Entao a tela recusa alto em vez de criar a conta sem a prova. A ordem
    // importa: a versao ausente e conferida ANTES do aceite, porque cobrar a
    // marcacao de quem nao teria o aceite registrado de qualquer jeito e
    // pedir um gesto que nao vale nada.
    final String? versaoDosTermos = AppConfig.instancia.versaoDosTermos;
    if (versaoDosTermos == null) {
      // A faixa JA ESTA na tela desde que ela abriu (ver `build`), entao aqui
      // nao ha nada a acrescentar -- so a anunciar. Escrever `_faixa` neste
      // ponto imprimiria a mesma frase duas vezes.
      //
      // O anuncio e urgente porque o gesto acabou de falhar: quem usa leitor
      // de tela tocou no botao e precisa saber agora, e nao ao percorrer a
      // tela de novo procurando o que houve.
      anunciar(context, _semVersaoDosTermos, urgente: true);
      if (_rolagem.hasClients) {
        await _rolagem.animateTo(
          0,
          duration: const Duration(milliseconds: 250),
          curve: Curves.easeOut,
        );
      }
      return;
    }
    if (!_aceitouOsTermos) {
      setState(() => _erroDoAceite = _aceiteObrigatorio);
      _levarAte(_alvoDoAceite);
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
        // tela. Chega aqui **nao-nula por construcao**: a guarda acima ja
        // recusou o caso em que ela falta, e e por isso que esta linha pode
        // deixar de ser um `?` que apaga a chave em silencio.
        versaoDosTermos: versaoDosTermos,
        // `continuarConectado` NAO e mais passado aqui: virou o padrao de
        // `AuthApi`, por decisao do cliente de 22/09/2026. Ver
        // `AuthApi.sessaoPersistentePorPadrao`.
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
    } on Object catch (erro, pilha) {
      // O QUE NAO E FalhaDeChamada -- 201 fora do contrato faz `Sessao.doJson`
      // estourar `TypeError`, e o chaveiro pode estourar `PlatformException`.
      // O `finally` abaixo ja desligava o carregando, entao a tela nao girava
      // para sempre; ela ficava CALADA, que e o outro lado do mesmo defeito.
      // A pessoa ve o formulario do jeito que estava e toca de novo achando
      // que o primeiro toque nao pegou.
      registrarFalhaInesperada(erro, pilha, onde: 'ao criar a conta');
      if (!mounted) return;
      setState(
        () => _faixa = const MensagemDeErro(texto: MensagensDeErro.servidorFora),
      );
    } finally {
      if (mounted) setState(() => _enviando = false);
    }
  }

  void _tratar(FalhaDeChamada falha) {
    // A decisao e por `type`, nunca pelo texto que o servidor mandou.
    if (falha is FalhaDaApi) {
      if (falha.tipo == ProblemTipo.emailJaCadastrado) {
        setState(() => _erroDoEmail = MensagensDeErro.emailJaCadastrado);
        _levarAte(_alvoDoEmail);
        return;
      }
      // A RECUSA DE SENHA E DITA PELO `code`, E NAO POR UM TEXTO FIXO.
      //
      // Aqui estava `_erroDaSenha = MensagensDeErro.senhaCurta` para QUALQUER
      // recusa de senha. A politica emite quatro codigos hoje
      // (`too_short`, `too_long`, `blank`, `similar_to_identity`) e vai emitir
      // mais quando a lista de vazamento sair da porta: dizer "pelo menos 10
      // caracteres" a quem foi recusado por vazamento manda a pessoa
      // acrescentar caracteres e ser recusada de novo.
      //
      // `code` desconhecido cai no texto generico, que e sempre melhor que uma
      // frase errada dita com confianca -- e e o caso que a versao antiga
      // deste app vai viver por semanas depois de o servidor ganhar uma regra.
      final campoDaSenha = falha.problem.campo('password');
      if (campoDaSenha != null) {
        final regra = PoliticaDeSenha.porCodigoDoServidor(campoDaSenha.codigo);
        setState(
          () => _erroDaSenha = regra?.mensagemDeErro ?? senhaRecusadaPeloServidor,
        );
        _levarAte(_alvoDaSenha);
        return;
      }
      if (falha.problem.status == 422) {
        setState(() => _erroDaSenha = senhaRecusadaPeloServidor);
        _levarAte(_alvoDaSenha);
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
    // O BUILD SEM `TERMS_VERSION` NAO PODE CRIAR CONTA, E DIZ ISSO NA ABERTURA.
    //
    // Achado do teste em aparelho de 22/09/2026: o cliente relatou que nao
    // consegue criar conta, e a API de homologacao estava no ar. O comando de
    // build de homologacao publicado no `README.md` da raiz passa **so**
    // `--dart-define=API_BASE_URL`, e sem `TERMS_VERSION` a guarda de
    // `_criarConta` recusa -- corretamente, porque o aceite nao teria o que
    // registrar (ver o bloco de comentario la).
    //
    // O defeito nao e a recusa, e a HORA dela: a pessoa preenchia tres campos,
    // marcava a caixa, tocava no botao e so entao a frase aparecia, numa
    // faixa que a lista de requisitos empurrou para longe da dobra. Recusa que
    // chega depois do esforco inteiro e indistinguivel de botao quebrado, que
    // e literalmente como ela foi relatada.
    //
    // O requisito e dito ANTES do erro (UX secao 13), e este e o unico caso
    // desta tela em que o requisito nao e da pessoa: nao ha nada que ela possa
    // digitar para resolver, entao a frase precisa estar no topo, desde o
    // primeiro segundo.
    final bool semVersaoDosTermos =
        AppConfig.instancia.versaoDosTermos == null;

    return Scaffold(
      appBar: const BarraDeConta(
        titulo: 'Criar conta',
        saida: TipoDeSaida.voltar,
      ),
      // O BOTAO NAO ROLA COM O FORMULARIO, E ISSO FOI MEDIDO E NAO ESCOLHIDO
      // POR GOSTO.
      //
      // Medida em 360 x 640 dp (o gabarito de aparelho pequeno do design
      // system, secao 13) com o teclado aberto: a area rolavel fica com 282 dp
      // e o formulario inteiro tem 862 dp. O botao ficava em 734..782 dp desse
      // conteudo, ou seja **500 dp abaixo da dobra** -- e o `ListView` nao
      // chega a CONSTRUIR o que nao cabe, entao ele nem existia na arvore.
      // Nos outros gabaritos medidos: 534 dp no iPhone SE de 320 x 568, 441 dp
      // no SE de 375 x 667 e 157 dp num Android de 412 x 915. **Em nenhum
      // aparelho, em nenhum estado, o botao estava visivel.**
      //
      // A lista de requisitos ao vivo nao criou o problema: ela o dobrou. Ela
      // ocupa 306 dp onde o texto de ajuda antigo ocupava 72, entao antes
      // desta historia a rolagem necessaria ja era de 266 dp no mesmo
      // gabarito. Encolher a lista tambem nao resolveria: sem ela por inteiro
      // o conteudo ainda tem 628 dp contra 282 dp de dobra.
      //
      // A decisao ja estava tomada no design system (11.8, barra de acao fixa)
      // e ja valia em treze telas do app. Esta era uma das tres telas de conta
      // que ficaram fora do padrao.
      bottomNavigationBar: BarraDeAcaoFixa(
        acoes: <Widget>[
          BotaoPrimario(
            rotulo: 'Criar conta',
            critico: true,
            carregando: _enviando,
            // O botao continua habilitado sem conexao: o detector de offline
            // erra, e deixar a pessoa sem caminho e pior que deixa-la tentar.
            aoTocar: _criarConta,
          ),
        ],
      ),
      // **`SingleChildScrollView` + `Column`, e nao `ListView`**, pelo mesmo
      // motivo medido em `pet/tela_editar_pet.dart`: o `ListView` so constroi
      // o que cabe na tela.
      //
      // Aqui isso vale para um controle OBRIGATORIO. Com a barra fixa, a area
      // rolavel encolheu 97 dp com o teclado fechado, e a caixa de aceite
      // passou a nascer fora do que o `ListView` constroi. Enquanto ela nao
      // existe, ela nao pode ser marcada, e a tela recusa a criacao da conta
      // apontando para um controle que nao esta na arvore -- que e a versao
      // mais silenciosa possivel de "toquei no botao e nao aconteceu nada".
      //
      // O formulario tem uma dezena de filhos e nenhuma lista de tamanho
      // aberto: construir todos custa nada e e o que faz `_levarAte` ter para
      // onde rolar. Preguica de construcao serve a lista de registros, e nao
      // a formulario.
      body: SafeArea(
        child: SingleChildScrollView(
          controller: _rolagem,
          padding: const EdgeInsets.all(BichuEspaco.e4),
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.stretch,
            children: <Widget>[
              if (semVersaoDosTermos) ...<Widget>[
                const FaixaDeAviso(texto: _semVersaoDosTermos),
                const SizedBox(height: BichuEspaco.e6),
              ],
              BichuField(
                rotulo: 'Nome',
                controlador: _nome,
                autofill: const <String>[AutofillHints.name],
                capitalizacao: TextCapitalization.words,
                acaoDeTeclado: TextInputAction.next,
              ),
              const SizedBox(height: BichuEspaco.e6),
              BichuField(
                key: _alvoDoEmail,
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
                key: _alvoDaSenha,
                rotulo: 'Senha',
                controlador: _senha,
                erro: _erroDaSenha,
                // Sem `ajuda`: o requisito nao cabe mais numa frase estatica.
                // Ele saiu daqui para `RequisitosDaSenha`, logo abaixo, que diz
                // os QUATRO e responde a cada tecla. O texto que estava aqui
                // dizia um so ("Pelo menos 10 caracteres. Uma frase curta
                // funciona melhor que uma senha complicada.") e os outros tres
                // so apareciam como erro do servidor, depois do envio.
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
              const SizedBox(height: BichuEspaco.e2),
              // A LISTA AO VIVO, logo abaixo do campo que ela descreve.
              //
              // Ela escuta os tres controladores por conta propria, entao nao ha
              // `onChanged` a encadear aqui e nao ha como esquecer de ligar um
              // campo novo: a regra `similar_to_identity` compara a senha com o
              // e-mail e com o nome, e corrigir o e-mail depois da senha muda o
              // que a lista mostra.
              RequisitosDaSenha(senha: _senha, email: _email, nome: _nome),
              if (_faixa != null) ...<Widget>[
                const SizedBox(height: BichuEspaco.e6),
                FaixaDeAviso(texto: _faixa!.texto),
              ],
              const SizedBox(height: BichuEspaco.e6),
              // O ACEITE, **acima** do botao: uma regra que se aceita ao apertar
              // um botao precisa estar legivel antes do aperto, e nao abaixo da
              // dobra (UX F1.1).
              //
              // Nao ha mais caixa de "continuar conectado" nesta tela: ela virou
              // comportamento padrao em 22/09/2026, por decisao do cliente. A
              // unica caixa da F1.1 e esta, e o que ela marca e o aceite.
              _CaixaDeAceiteDosTermos(
                key: _alvoDoAceite,
                marcada: _aceitouOsTermos,
                erro: _erroDoAceite,
                aoMudar: (v) => setState(() {
                  _aceitouOsTermos = v;
                  if (v) _erroDoAceite = null;
                }),
              ),
              const SizedBox(height: BichuEspaco.e6),
              Center(
                child: TextButton(
                  onPressed: () => context.pushReplacement(Rotas.entrar),
                  child: const Text('Já tenho conta'),
                ),
              ),
            ],
          ),
        ),
      ),
    );
  }
}

/// A frase do aceite, com as duas expressoes como links.
///
/// Antes esta frase era narrativa ("Ao criar a conta, voce aceita...") e
/// ficava solta acima do botao: o aceite acontecia por consequencia de apertar
/// `Criar conta`, e nao por um gesto proprio. O cliente pediu a caixa em
/// 22/09/2026 -- pela segunda vez -- e com ela a frase muda de modo verbal: ela
/// descreve **o que a pessoa esta declarando**, e nao o que o app vai deduzir.
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
class _FraseDeAceite extends StatefulWidget {
  const _FraseDeAceite();

  @override
  State<_FraseDeAceite> createState() => _FraseDeAceiteState();
}

class _FraseDeAceiteState extends State<_FraseDeAceite> {
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

    final base = textos.bodyMedium?.copyWith(color: cores.textPrimary) ??
        const TextStyle();

    return Text.rich(
      TextSpan(
        children: <InlineSpan>[
          TextSpan(text: 'Li e aceito os ', style: base),
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

/// A caixa de aceite dos termos da F1.1.
///
/// **So a caixa alterna, e a frase ao lado nao.** A linha inteira tocavel
/// seria o padrao usual, e aqui ela nao serve: a frase carrega dois links, e
/// um toque em "termos de uso" cairia na disputa entre abrir o documento e
/// marcar a caixa. Quem resolve essa disputa e a arena de gestos do Flutter, e
/// o resultado dela nao e o tipo de coisa que se quer descobrir em producao no
/// gesto que registra um aceite. O `Checkbox` do Material ja garante o alvo de
/// 48 dp sozinho (`materialTapTargetSize`), entao o que se perde e a
/// conveniencia de tocar no texto, e nao a acessibilidade do controle.
class _CaixaDeAceiteDosTermos extends StatelessWidget {
  const _CaixaDeAceiteDosTermos({
    required this.marcada,
    required this.erro,
    required this.aoMudar,
    super.key,
  });

  final bool marcada;
  final String? erro;
  final ValueChanged<bool> aoMudar;

  @override
  Widget build(BuildContext context) {
    final cores = BichuColors.of(context).cores;
    final textos = Theme.of(context).textTheme;

    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: <Widget>[
        Row(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: <Widget>[
            // O rotulo do controle e CURTO, e nao a frase inteira.
            //
            // Pelo `semanticLabel` do proprio `Checkbox`, e nao por um
            // `Semantics` em volta: o `Checkbox` ja e um no de semantica, e
            // envolve-lo cria um segundo no que nao se funde ao dele -- o
            // rotulo ficaria no no de fora e o controle continuaria anunciado
            // como "caixa de selecao" e nada mais.
            //
            // **Curto de proposito.** A primeira versao repetia aqui a frase
            // inteira, e o no passou a ler a declaracao DUAS vezes: uma pelo
            // rotulo do controle, outra pela frase ao lado. Quem enxerga le a
            // frase uma vez; quem usa leitor de tela ouvia tudo duplicado. O
            // controle diz o ato ("Aceitar os termos") e a frase ao lado diz
            // o que esta sendo aceito, com os dois links navegaveis.
            Checkbox(
              value: marcada,
              isError: erro != null,
              semanticLabel: 'Aceitar os termos',
              onChanged: (v) => aoMudar(v ?? false),
            ),
            const SizedBox(width: BichuEspaco.e2),
            // `container: true`: a frase e no PROPRIO, e nao parte do no da
            // caixa. Sem isto os dois se fundem e volta a leitura duplicada
            // que o rotulo curto acabou de resolver.
            Expanded(
              child: Semantics(
                container: true,
                child: const Padding(
                  padding: EdgeInsets.only(top: BichuEspaco.e3),
                  child: _FraseDeAceite(),
                ),
              ),
            ),
          ],
        ),
        if (erro != null)
          Padding(
            padding: const EdgeInsets.only(top: BichuEspaco.e2),
            child: Text(
              erro!,
              style: textos.bodyMedium?.copyWith(color: cores.error),
            ),
          ),
      ],
    );
  }
}
