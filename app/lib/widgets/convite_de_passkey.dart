import 'package:flutter/material.dart';

import '../escopo.dart';
import '../sessao/fiacao_do_passkey.dart';
import '../theme/bichu_colors.dart';
import '../theme/bichu_tokens.g.dart';

/// O convite para cadastrar a passkey, logo depois do cadastro da conta.
///
/// E o que o cliente pediu: _"vamos implementar apos o usuario realizar o
/// cadastro o passkeys para que ele possa logar com credenciais digitais"_.
///
/// ## ELE E DISPENSAVEL, E ISSO E A PROPRIEDADE QUE MAIS IMPORTA AQUI
///
/// **Quem recusa a biometria tem de conseguir terminar o cadastro.** A conta
/// JA EXISTE quando esta folha abre -- `POST /auth/register` ja respondeu 201
/// com o par de tokens e `ControladorDeSessao.abrir` ja os guardou. Entao esta
/// folha nao pode ter nenhum desfecho que segure a pessoa:
///
/// | o que a pessoa faz | o que acontece |
/// |---|---|
/// | toca em `Ativar` e a folha nativa confirma | credencial cadastrada, segue |
/// | toca em `Ativar` e fecha a folha nativa | **segue** |
/// | toca em `Agora nao` | **segue**, sem ida a rede |
/// | arrasta a folha para baixo | **segue** |
/// | usa o gesto de voltar do sistema | **segue** |
/// | o servidor recusa (409 de teto, 429, rede fora) | **segue** |
///
/// Os seis desfechos levam ao mesmo lugar, e e por isso que [mostrarConviteDePasskey]
/// devolve `void` em vez de um `bool` que alguem pudesse testar para decidir
/// se continua. Nao existe "nao continuar".
///
/// ## Nenhuma faixa de erro, de proposito
///
/// Um 409 de teto de credenciais ou um aparelho sem passkey nao viram texto
/// aqui. A pessoa acabou de criar a conta e esta a um toque de usar o app; uma
/// faixa vermelha no fim de um cadastro que **deu certo** ensina que algo
/// quebrou quando nada quebrou. O desfecho vai para o canal de
/// observabilidade por `FiacaoDoPasskey`, que e quem precisa saber.
///
/// ## Isto NAO passou pelo Figma
///
/// A regra do projeto e tela e componente pelo Figma antes do codigo. Esta
/// folha foi montada **so** com primitivas que o design system ja define
/// (folha inferior do 11.9, `BichuEspaco`, `BichuAlvoDeToque`, os pares de
/// cor de `BichuColors`) e nao introduz forma nova nenhuma -- mas a
/// composicao, o texto e o icone nao foram desenhados. Vale como fiacao
/// funcional, e o desenho de saida continua devendo.
class ConviteDePasskey extends StatefulWidget {
  const ConviteDePasskey({super.key, this.rotuloDoAparelho});

  /// O nome sugerido para o aparelho, ou nulo.
  ///
  /// Nulo e o caso normal nesta entrega: sem ele o servidor guarda nulo e a
  /// tela de aparelhos -- que ainda nao existe -- mostraria a data. Inventar
  /// "Celular do Leandro" aqui exigiria ler o nome do aparelho, que e outra
  /// permissao e outra frente.
  final String? rotuloDoAparelho;

  @override
  State<ConviteDePasskey> createState() => _ConviteDePasskeyState();
}

class _ConviteDePasskeyState extends State<ConviteDePasskey> {
  bool _emAndamento = false;

  Future<void> _ativar() async {
    setState(() => _emAndamento = true);
    final escopo = Escopo.of(context);

    // `oferecerCadastro` NAO ESTOURA -- ela devolve `naoCadastrada` em todo
    // desfecho que nao e sucesso, inclusive 409, 429 e rede fora. E por isso
    // que nao ha `try` aqui: nao ha o que capturar, e um `catch` daria a
    // impressao de que existe um caminho de erro que esta folha trata.
    final desfecho = await escopo.passkey.oferecerCadastro(
      rotulo: widget.rotuloDoAparelho,
    );

    if (!mounted) return;
    // FECHA NOS DOIS DESFECHOS. Nao reabrir, nao insistir, nao explicar: quem
    // fechou a folha nativa ja disse o que queria, e repetir o pedido e
    // transformar uma recusa em obstaculo.
    Navigator.of(context).pop(desfecho);
  }

  @override
  Widget build(BuildContext context) {
    final cores = BichuColors.of(context).cores;
    final textos = Theme.of(context).textTheme;

    return Semantics(
      scopesRoute: true,
      namesRoute: true,
      explicitChildNodes: true,
      label: _titulo,
      // ROLA, pelo mesmo motivo da folha destrutiva: a fonte do sistema em
      // 200% estoura o `RenderFlex` com o conteudo minimo, e o que estoura e o
      // FIM da coluna -- onde ficam as duas acoes.
      child: SingleChildScrollView(
        child: Padding(
          padding: EdgeInsets.only(
            left: BichuEspaco.e4,
            right: BichuEspaco.e4,
            bottom: MediaQuery.of(context).viewPadding.bottom + BichuEspaco.e4,
          ),
          child: Column(
            mainAxisSize: MainAxisSize.min,
            crossAxisAlignment: CrossAxisAlignment.start,
            children: <Widget>[
              const _AlcaDoConvite(),
              // Decorativo: o titulo logo abaixo ja diz o que o icone ilustra.
              ExcludeSemantics(
                child: Icon(
                  Icons.fingerprint,
                  size: BichuEspaco.e8,
                  color: cores.primary,
                ),
              ),
              const SizedBox(height: BichuEspaco.e2),
              Semantics(
                header: true,
                child: Text(
                  _titulo,
                  style: textos.titleLarge?.copyWith(color: cores.textPrimary),
                ),
              ),
              const SizedBox(height: BichuEspaco.e3),
              Text(_corpo, style: textos.bodyMedium),
              const SizedBox(height: BichuEspaco.e3),
              // A FRASE QUE NAO PODE SAIR. A passkey SOMA a senha, e dizer
              // isso na tela nao e zelo: quem entende que a biometria
              // SUBSTITUI a senha para de lembrar da senha, e passkey e presa
              // ao aparelho -- trocar de celular trancaria a pessoa fora da
              // conta.
              Text(_aSenhaContinua, style: textos.bodyMedium),
              const SizedBox(height: BichuEspaco.e6),

              // Folha NAO destrutiva: a acao principal fica em cima e leva o
              // alvo grande. A inversao do 11.9.1 vale so para destruicao.
              _BotaoDeAtivar(carregando: _emAndamento, aoTocar: _ativar),
              const SizedBox(height: BichuEspaco.e4),
              _BotaoDeAgoraNao(
                // Desabilitado enquanto a folha nativa esta aberta: o pedido
                // ja saiu, e deixar `Agora nao` ativo sugeriria que ele nao
                // saiu. Quem desistir fecha a folha do sistema, que e onde o
                // gesto agora mora.
                aoTocar: _emAndamento
                    ? null
                    : () => Navigator.of(context)
                        .pop(DesfechoDoCadastroDePasskey.naoCadastrada),
              ),
            ],
          ),
        ),
      ),
    );
  }

  static const String _titulo = 'Entrar sem digitar a senha?';

  static const String _corpo =
      'Seu celular pode guardar uma credencial digital protegida pela sua '
      'digital, seu rosto ou o bloqueio de tela. Na proxima vez, voce entra '
      'com um toque.';

  static const String _aSenhaContinua =
      'Sua senha continua valendo. Voce pode usar as duas.';
}

/// Abre o convite.
///
/// **Devolve `void`, e isso e deliberado.** Nenhum chamador pode condicionar o
/// que vem depois ao desfecho: o cadastro da conta esta completo antes desta
/// folha abrir, e nao existe desfecho que o desfaca. Um `Future<bool>` aqui
/// seria um convite a escrever `if (cadastrou)` em cima do fim do cadastro.
///
/// A folha e **dispensavel pelos tres gestos**: `Agora nao`, arrastar para
/// baixo e o gesto de voltar do sistema. `isDismissible` e `enableDrag` ficam
/// no padrao (verdadeiros) justamente por isso.
Future<void> mostrarConviteDePasskey(
  BuildContext context, {
  String? rotuloDoAparelho,
}) async {
  final cores = BichuColors.of(context).cores;
  await showModalBottomSheet<DesfechoDoCadastroDePasskey>(
    context: context,
    backgroundColor: cores.surface,
    barrierColor: cores.scrim,
    isScrollControlled: true,
    shape: const RoundedRectangleBorder(
      borderRadius: BorderRadius.vertical(top: Radius.circular(BichuRaio.xl)),
    ),
    builder: (contexto) => ConviteDePasskey(rotuloDoAparelho: rotuloDoAparelho),
  );
  // O retorno e DESCARTADO de proposito. Ver a documentacao acima.
}

/// A alca de 36 x 4, decorativa. Mesma do 11.9.
class _AlcaDoConvite extends StatelessWidget {
  const _AlcaDoConvite();

  @override
  Widget build(BuildContext context) {
    final cores = BichuColors.of(context).cores;
    return ExcludeSemantics(
      child: Center(
        child: Container(
          width: 36,
          height: 4,
          margin: const EdgeInsets.symmetric(vertical: BichuEspaco.e3),
          decoration: BoxDecoration(
            color: cores.outline,
            borderRadius: BorderRadius.circular(BichuRaio.full),
          ),
        ),
      ),
    );
  }
}

/// A acao principal: `primary` preenchido, largura total, 64 dp.
class _BotaoDeAtivar extends StatelessWidget {
  const _BotaoDeAtivar({required this.carregando, required this.aoTocar});

  final bool carregando;
  final VoidCallback aoTocar;

  @override
  Widget build(BuildContext context) {
    final textos = Theme.of(context).textTheme;
    final cores = BichuColors.of(context).cores;

    // A acao numa variavel so, usada pelos tres lugares que precisam
    // concordar: `onPressed`, o `onTap` da semantica e o `enabled` anunciado.
    // Mesma disciplina do `BotaoPrimario` -- enquanto os tres divergiram, o
    // botao carregando se anunciava habilitado sem ter acao nenhuma.
    final VoidCallback? acao = carregando ? null : aoTocar;

    return Semantics(
      button: true,
      enabled: acao != null,
      label: carregando ? '$_rotulo, em andamento' : _rotulo,
      excludeSemantics: true,
      // Sem esta linha o no sai da arvore com `btn=true tap=false` e
      // `test/a11y/acao_de_controle_test.dart` reprova -- corretamente: quem
      // usa leitor de tela ouviria que o botao existe e nao poderia aciona-lo.
      onTap: acao,
      child: SizedBox(
        width: double.infinity,
        height: BichuAlvoDeToque.critico,
        child: FilledButton(
          onPressed: acao,
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
              // O rotulo continua visivel no estado carregando, pelo mesmo
              // motivo do `BotaoPrimario`.
              Flexible(
                child: Text(
                  _rotulo,
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

  static const String _rotulo = 'Ativar';
}

/// A saida: `secondary`, largura total, 48 dp.
///
/// **O rotulo e `Agora nao`, e nao `Cancelar`.** O cliente pediu esta palavra,
/// e ela e mais honesta: a oferta volta a existir -- a conta continua sem
/// passkey e nada aqui e definitivo.
class _BotaoDeAgoraNao extends StatelessWidget {
  const _BotaoDeAgoraNao({required this.aoTocar});

  final VoidCallback? aoTocar;

  @override
  Widget build(BuildContext context) {
    return SizedBox(
      width: double.infinity,
      height: BichuAlvoDeToque.min,
      child: OutlinedButton(onPressed: aoTocar, child: const Text('Agora não')),
    );
  }
}
