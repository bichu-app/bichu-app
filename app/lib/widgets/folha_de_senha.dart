import 'package:flutter/material.dart';

import '../api/auth_api.dart';
import '../api/falhas.dart';
import '../api/mensagens_de_erro.dart';
import '../api/problem.dart';
import '../api/reautenticacao.dart';
import '../theme/bichu_colors.dart';
import '../theme/bichu_tokens.g.dart';
import 'alca_de_arraste.dart';
import 'bichu_field.dart';
import 'faixa_de_aviso.dart';

/// Os textos da folha de senha, num lugar so.
///
/// Eles ficam publicos de proposito: as seis operacoes destrutivas do contrato
/// vao passar por esta folha, e um caso de teste que redigisse a frase de novo
/// para conferi-la nao mediria a frase que a tela mostra.
abstract final class TextosDaFolhaDeSenha {
  static const String titulo = 'Confirme sua senha';

  /// O motivo padrao, para quem chamar a folha sem dizer o seu.
  static const String motivoPadrao =
      'Esta ação não pode ser desfeita, então pedimos a sua senha de novo.';

  static const String rotuloDoCampo = 'Senha';

  static const String confirmar = 'Confirmar';

  static const String agoraNao = 'Agora não';

  /// O campo vazio, no toque em [confirmar]: o requisito e dito antes do erro.
  static const String campoVazio = MensagensDeErro.digiteSuaSenha;

  /// `401 invalid-credentials`. **Nao** reaproveita o texto do login: ali ha
  /// dois campos e a frase fala dos dois, e aqui ha um.
  static const String senhaNaoConfere = 'A senha não confere. Tente de novo.';

  /// `429 rate-limited` SEM senha errada nesta folha: o teto de 10 pedidos por
  /// hora da conta.
  static const String pedidosDemais =
      'Você pediu confirmação muitas vezes em pouco tempo. Espere um pouco e '
      'tente de novo.';

  /// `429 rate-limited` DEPOIS de pelo menos uma senha errada nesta folha: o
  /// teto de 5 tentativas invalidas por hora.
  ///
  /// A segunda frase nao e consolo: o teto fecha a janela destrutiva e **nao**
  /// derruba a sessao, e quem nao le isso acha que foi deslogado.
  static const String senhaErradaDemais =
      'A senha errou vezes demais. Por segurança, a confirmação fica fechada '
      'por uma hora. A sua conta continua aberta, e nada do que você já fez '
      'se perdeu.';

  /// `401 reauthentication-required` vindo da PROPRIA chamada de confirmacao.
  ///
  /// Pedir a senha outra vez nao resolve: a janela foi aberta para outra
  /// finalidade, ou ja tinha sido usada. Por isso a frase manda recomeçar em
  /// vez de convidar a tentar.
  static const String confirmacaoNaoVale =
      'Esta confirmação não vale para esta ação. Feche e comece de novo.';
}

/// Abre a folha de senha e devolve a janela destrutiva, ou `null`.
///
/// ## Ela serve as SEIS operacoes, e nao uma
///
/// O contrato tem seis operacoes com `x-reauth-scope`, e desenhou **uma**
/// verificacao de senha para todas: a senha trafega para um endereco so e o
/// teto contra forca bruta existe num lugar so. Esta folha e o lado do app
/// dessa decisao. Ela recebe o [escopo] e devolve o resultado a quem chamou --
/// **nao** executa a operacao destrutiva, e nao sabe qual e.
///
/// `null` e a recusa, e quem chamou nao pode prosseguir com ele: pode ser
/// desistencia (`Agora não`, o arrasto para baixo, o voltar do sistema) ou uma
/// recusa do servidor que a propria folha ja explicou na faixa. A diferenca
/// nao chega a quem chamou porque a saida e a mesma nos dois casos, e a pessoa
/// ja leu o motivo onde ele aconteceu.
///
/// O token NAO e guardado: ele vale cinco minutos, e de uso unico e cai por
/// logout e por troca de senha. Quem precisar de outro abre a folha de novo.
Future<JanelaDeReautenticacao?> mostrarFolhaDeSenha(
  BuildContext context, {
  required AuthApi auth,
  required EscopoDeReautenticacao escopo,
  String motivo = TextosDaFolhaDeSenha.motivoPadrao,
}) {
  final cores = BichuColors.of(context).cores;
  return showModalBottomSheet<JanelaDeReautenticacao>(
    context: context,
    backgroundColor: cores.surface,
    barrierColor: cores.scrim,
    isScrollControlled: true,
    shape: const RoundedRectangleBorder(
      borderRadius: BorderRadius.vertical(top: Radius.circular(BichuRaio.xl)),
    ),
    builder: (contexto) =>
        FolhaDeSenha(auth: auth, escopo: escopo, motivo: motivo),
  );
}

/// A folha de senha das operacoes destrutivas.
class FolhaDeSenha extends StatefulWidget {
  const FolhaDeSenha({
    required this.auth,
    required this.escopo,
    super.key,
    this.motivo = TextosDaFolhaDeSenha.motivoPadrao,
  });

  final AuthApi auth;

  /// A finalidade da janela, que viaja no campo `scope`.
  final EscopoDeReautenticacao escopo;

  /// Por que a senha esta sendo pedida, nas palavras da operacao que chamou.
  final String motivo;

  @override
  State<FolhaDeSenha> createState() => _FolhaDeSenhaState();
}

class _FolhaDeSenhaState extends State<FolhaDeSenha> {
  final TextEditingController _senha = TextEditingController();
  final FocusNode _foco = FocusNode();

  bool _emAndamento = false;
  bool _senhaVisivel = false;
  String? _erroDoCampo;
  String? _erroDaFaixa;

  /// Quantas vezes o servidor recusou a senha NESTA folha.
  ///
  /// ## Por que a contagem e local, e por que ela existe
  ///
  /// Os dois tetos de `/auth/reauth` respondem o MESMO corpo: `type`
  /// `rate-limited`, o mesmo titulo e o mesmo `detail`, montados pelo unico
  /// construtor canonico do 429. O catalogo de tipos do contrato tem um slug
  /// de 429 e nao dois, entao **a resposta nao diz qual dos dois estourou** --
  /// e a regra da casa e decidir pelo `type`, nunca pelo texto.
  ///
  /// O que o app sabe com certeza e o que aconteceu nesta folha: se a senha ja
  /// foi recusada aqui, o 429 que chega em seguida e o teto de tentativas
  /// invalidas, e a frase que serve e outra. Sem esta contagem a unica saida
  /// honesta seria dar a mesma frase aos dois casos, e *tente mais tarde* nao
  /// explica a quem errou a senha por que esperar uma hora.
  ///
  /// O limite da heuristica esta assumido: quem errou a senha numa folha que
  /// fechou e abre outra comeca o contador em zero, e le *tente mais tarde*
  /// onde a causa foi a senha. Isso erra para o lado barato -- uma frase mais
  /// generica -- e nunca para o lado de afirmar culpa que nao houve.
  int _senhasRecusadas = 0;

  @override
  void dispose() {
    _senha.dispose();
    _foco.dispose();
    super.dispose();
  }

  Future<void> _confirmar() async {
    final senha = _senha.text;
    if (senha.isEmpty) {
      setState(() {
        _erroDoCampo = TextosDaFolhaDeSenha.campoVazio;
        _erroDaFaixa = null;
      });
      _foco.requestFocus();
      return;
    }

    setState(() {
      _emAndamento = true;
      _erroDoCampo = null;
      _erroDaFaixa = null;
    });

    try {
      final janela = await widget.auth.reautenticar(
        senha: senha,
        escopo: widget.escopo,
      );
      if (!mounted) return;
      // O campo e limpo ANTES de a folha fechar: a senha nao fica viva no
      // controlador esperando o `dispose`.
      _senha.clear();
      Navigator.of(context).pop(janela);
    } on FalhaDaApi catch (falha) {
      if (!mounted) return;
      _mostrarRecusa(falha);
    } on FalhaDeChamada catch (falha) {
      if (!mounted) return;
      setState(() {
        _emAndamento = false;
        _erroDaFaixa = falha is FalhaDeConexao
            ? MensagensDeErro.semConexaoImpossivel
            : MensagensDeErro.de(falha).texto;
      });
    } on Object catch (erro, pilha) {
      registrarFalhaInesperada(erro, pilha, onde: 'ao confirmar a senha');
      if (!mounted) return;
      setState(() {
        _emAndamento = false;
        _erroDaFaixa = MensagensDeErro.servidorFora;
      });
    }
  }

  /// Decide a frase de uma recusa do servidor.
  ///
  /// Decide pelo `type`, e nunca pelo texto que veio no corpo.
  void _mostrarRecusa(FalhaDaApi falha) {
    switch (falha.tipo) {
      case ProblemTipo.credencialInvalida:
        setState(() {
          _emAndamento = false;
          _senhasRecusadas += 1;
          _erroDoCampo = TextosDaFolhaDeSenha.senhaNaoConfere;
          _senha.clear();
        });
        _foco.requestFocus();
      case ProblemTipo.limiteDeTentativas:
        setState(() {
          _emAndamento = false;
          _erroDaFaixa = _senhasRecusadas > 0
              ? TextosDaFolhaDeSenha.senhaErradaDemais
              : TextosDaFolhaDeSenha.pedidosDemais;
          _senha.clear();
        });
      case ProblemTipo.reautenticacaoNecessaria:
        setState(() {
          _emAndamento = false;
          _erroDaFaixa = TextosDaFolhaDeSenha.confirmacaoNaoVale;
          _senha.clear();
        });
      case ProblemTipo.validacaoFalhou:
      case ProblemTipo.emailJaCadastrado:
      case ProblemTipo.naoAutenticado:
      case ProblemTipo.tokenExpirado:
      case ProblemTipo.canalDeContatoNaoVerificado:
      case ProblemTipo.petSemFoto:
      case ProblemTipo.tagRevogada:
      case ProblemTipo.limiteDePetsAtingido:
      case ProblemTipo.limiteDeEncontrosDaComunidade:
      case ProblemTipo.codigoDeTagMalformado:
      case ProblemTipo.codigoDeTagNaoEncontrado:
      case ProblemTipo.naoEncontrado:
      case ProblemTipo.conversaEncerrada:
      case ProblemTipo.casoEncerrado:
      case ProblemTipo.casoReencontrado:
      case ProblemTipo.precondicaoFalhou:
      case ProblemTipo.precondicaoNecessaria:
      case ProblemTipo.desconhecido:
        // O catalogo redige o resto. `naoAutenticado` e `tokenExpirado` caem
        // aqui de proposito: a saida deles e entrar de novo, e e o catalogo
        // que carrega essa frase.
        setState(() {
          _emAndamento = false;
          _erroDaFaixa = MensagensDeErro.de(falha).texto;
          _senha.clear();
        });
    }
  }

  @override
  Widget build(BuildContext context) {
    final cores = BichuColors.of(context).cores;
    final textos = Theme.of(context).textTheme;

    return Semantics(
      scopesRoute: true,
      namesRoute: true,
      explicitChildNodes: true,
      label: TextosDaFolhaDeSenha.titulo,
      child: SingleChildScrollView(
        child: Padding(
          padding: EdgeInsets.only(
            left: BichuEspaco.e4,
            right: BichuEspaco.e4,
            bottom: MediaQuery.of(context).viewInsets.bottom +
                MediaQuery.of(context).viewPadding.bottom +
                BichuEspaco.e4,
          ),
          child: Column(
            mainAxisSize: MainAxisSize.min,
            crossAxisAlignment: CrossAxisAlignment.start,
            children: <Widget>[
              const AlcaDeArraste(),
              ExcludeSemantics(
                child: Icon(
                  Icons.lock_outline,
                  size: BichuEspaco.e8,
                  color: cores.textPrimary,
                ),
              ),
              const SizedBox(height: BichuEspaco.e2),
              Semantics(
                header: true,
                child: Text(
                  TextosDaFolhaDeSenha.titulo,
                  style: textos.titleLarge?.copyWith(color: cores.textPrimary),
                ),
              ),
              const SizedBox(height: BichuEspaco.e3),
              Text(widget.motivo, style: textos.bodyMedium),
              const SizedBox(height: BichuEspaco.e4),
              BichuField(
                rotulo: TextosDaFolhaDeSenha.rotuloDoCampo,
                controlador: _senha,
                foco: _foco,
                erro: _erroDoCampo,
                obscurecer: !_senhaVisivel,
                autofill: const <String>[AutofillHints.password],
                correcaoAutomatica: false,
                capitalizacao: TextCapitalization.none,
                acaoDeTeclado: TextInputAction.done,
                habilitado: !_emAndamento,
                aoEnviar: (_) => _confirmar(),
                aoMudar: _erroDoCampo == null
                    ? null
                    : (_) => setState(() => _erroDoCampo = null),
                sufixo: BotaoRevelarSenha(
                  visivel: _senhaVisivel,
                  aoAlternar: () =>
                      setState(() => _senhaVisivel = !_senhaVisivel),
                ),
              ),
              if (_erroDaFaixa != null) ...<Widget>[
                const SizedBox(height: BichuEspaco.e4),
                FaixaDeAviso(texto: _erroDaFaixa!),
              ],
              const SizedBox(height: BichuEspaco.e6),
              _BotaoDeDesistir(
                aoTocar: _emAndamento
                    ? null
                    : () => Navigator.of(context).pop(),
              ),
              const SizedBox(height: BichuEspaco.e4),
              _BotaoDeConfirmar(
                carregando: _emAndamento,
                aoTocar: _confirmar,
              ),
            ],
          ),
        ),
      ),
    );
  }
}

/// `Agora não`: `secondary`, largura total, **64 dp**, como na folha
/// destrutiva.
class _BotaoDeDesistir extends StatelessWidget {
  const _BotaoDeDesistir({required this.aoTocar});

  final VoidCallback? aoTocar;

  @override
  Widget build(BuildContext context) {
    return SizedBox(
      width: double.infinity,
      height: BichuAlvoDeToque.critico,
      child: OutlinedButton(
        onPressed: aoTocar,
        child: const Text(TextosDaFolhaDeSenha.agoraNao),
      ),
    );
  }
}

/// `Confirmar`: `primary` e 48 dp.
///
/// **Nao** e o botao destrutivo em `urgency`: aqui nada e destruido. O que
/// destroi e a operacao que vem depois, e a folha dela e que carrega o
/// vermelho.
class _BotaoDeConfirmar extends StatelessWidget {
  const _BotaoDeConfirmar({required this.carregando, required this.aoTocar});

  final bool carregando;
  final VoidCallback aoTocar;

  @override
  Widget build(BuildContext context) {
    final cores = BichuColors.of(context).cores;
    final textos = Theme.of(context).textTheme;

    final VoidCallback? acao = carregando ? null : aoTocar;

    return Semantics(
      button: true,
      enabled: acao != null,
      label: carregando
          ? '${TextosDaFolhaDeSenha.confirmar}, em andamento'
          : TextosDaFolhaDeSenha.confirmar,
      excludeSemantics: true,
      onTap: acao,
      child: SizedBox(
        width: double.infinity,
        height: BichuAlvoDeToque.min,
        child: FilledButton(
          onPressed: acao,
          style: FilledButton.styleFrom(
            backgroundColor: cores.primary,
            foregroundColor: cores.onPrimary,
            disabledBackgroundColor: cores.disabledSurface,
            disabledForegroundColor: cores.onDisabled,
            minimumSize: const Size(double.infinity, BichuAlvoDeToque.min),
            shape: RoundedRectangleBorder(
              borderRadius: BorderRadius.circular(BichuRaio.md),
            ),
          ),
          child: Row(
            mainAxisAlignment: MainAxisAlignment.center,
            mainAxisSize: MainAxisSize.min,
            children: <Widget>[
              if (carregando) ...<Widget>[
                SizedBox(
                  width: BichuEspaco.e4,
                  height: BichuEspaco.e4,
                  child: CircularProgressIndicator(
                    strokeWidth: 2,
                    color: cores.onDisabled,
                  ),
                ),
                const SizedBox(width: BichuEspaco.e2),
              ],
              Flexible(
                child: Text(
                  TextosDaFolhaDeSenha.confirmar,
                  style: textos.labelLarge,
                  overflow: TextOverflow.ellipsis,
                ),
              ),
            ],
          ),
        ),
      ),
    );
  }
}
