import 'package:flutter/gestures.dart';
import 'package:flutter/material.dart';
import 'package:go_router/go_router.dart';
import 'package:url_launcher/url_launcher.dart';

import '../../api/falhas.dart';
import '../../api/mensagens_de_erro.dart';
import '../../api/problem.dart';
import '../../config/app_config.dart';
import '../../escopo.dart';
import '../../roteamento/rotas.dart';
import '../../theme/bichu_colors.dart';
import '../../theme/bichu_tokens.g.dart';
import '../../widgets/bichu_field.dart';
import '../../widgets/botao_primario.dart';
import '../../widgets/faixa_de_aviso.dart';
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

  bool _senhaVisivel = false;
  bool _aceitouOsTermos = false;
  bool _enviando = false;
  String? _erroDoEmail;
  String? _erroDaSenha;
  String? _erroDoAceite;
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
      _erroDoAceite = null;
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
      setState(() => _faixa = const MensagemDeErro(texto: _semVersaoDosTermos));
      return;
    }
    if (!_aceitouOsTermos) {
      setState(() => _erroDoAceite = _aceiteObrigatorio);
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
              marcada: _aceitouOsTermos,
              erro: _erroDoAceite,
              aoMudar: (v) => setState(() {
                _aceitouOsTermos = v;
                if (v) _erroDoAceite = null;
              }),
            ),
            const SizedBox(height: BichuEspaco.e6),
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
          ],
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
