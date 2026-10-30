import 'package:flutter/material.dart';

import '../theme/bichu_colors.dart';
import '../theme/bichu_tokens.g.dart';

/// Uma acao que [AcoesDeCriarFlutuantes] oferece: a principal, ou uma das
/// secundarias da folha.
class OpcaoDeCriar {
  const OpcaoDeCriar({
    required this.icone,
    required this.rotulo,
    required this.aoTocar,
  }) : assert(
         rotulo != '',
         'OpcaoDeCriar sem rotulo e uma linha muda: o rotulo e o texto '
         'PINTADO na folha (ou o `tooltip` do alvo principal) e tambem o nome '
         'acessivel. Sem ele o leitor de tela anuncia so "botao".',
       );

  /// O glifo, da familia fechada do design system 10.1 (Material Symbols), que
  /// e a mesma de onde sai todo `Icons.*` deste app.
  final IconData icone;

  /// O que o toque FAZ, por extenso e em portugues.
  final String rotulo;

  /// **Nunca nulo.** Quem explica bloqueio de conta ou de e-mail e a tela de
  /// DESTINO, que tem onde escrever o motivo e a saida; uma linha apagada aqui
  /// seria uma acao morta sem lugar nenhum onde dizer por que.
  final VoidCallback aoTocar;
}

/// A porta de criar de uma secao que tem uma acao PRINCIPAL e outras atras
/// dela: dois alvos flutuantes na MESMA LINHA, o principal direto e o
/// secundario abrindo a folha.
class AcoesDeCriarFlutuantes extends StatelessWidget {
  const AcoesDeCriarFlutuantes({
    required this.principal,
    required this.rotuloDasOutras,
    required this.tituloDaFolha,
    required this.outras,
    super.key,
  }) : assert(
         rotuloDasOutras != '',
         'O alvo secundario sem rotulo e um icone mudo: o nome acessivel sai '
         'do tooltip, e sem ele o leitor de tela anuncia so "botao".',
       ),
       assert(
         outras.length > 1,
         'AcoesDeCriarFlutuantes com UMA acao secundaria e uma folha que '
         'existe para oferecer uma coisa: um toque a mais entre a pessoa e a '
         'acao, sem escolha nenhuma no meio. Com uma secundaria so, use dois '
         'AcaoDeCriarFlutuante -- ou leve a segunda direto ao destino.',
       );

  /// A acao de UM TOQUE: o alvo de 56 dp no canto, sem folha no caminho.
  final OpcaoDeCriar principal;

  /// O nome acessivel do alvo SECUNDARIO.
  final String rotuloDasOutras;

  /// O titulo da folha. **Ele e o rotulo do GRUPO para quem usa leitor de
  /// tela**, e a primeira coisa que a folha anuncia ao abrir.
  final String tituloDaFolha;

  /// As acoes secundarias, na ordem em que sao pintadas.
  final List<OpcaoDeCriar> outras;

  /// A chave da folha, para o portao achar a folha aberta sem casar texto.
  static const Key chaveDaFolha = ValueKey<String>('criar/folha');

  /// A chave do alvo PRINCIPAL, para o portao distinguir os dois sem casar
  /// glifo nem posicao.
  static const Key chaveDoPrincipal = ValueKey<String>('criar/principal');

  /// A chave do alvo SECUNDARIO.
  static const Key chaveDoSecundario = ValueKey<String>('criar/secundario');

  @override
  Widget build(BuildContext context) {
    return Row(
      mainAxisSize: MainAxisSize.min,
      children: <Widget>[
        FloatingActionButton(
          key: chaveDoSecundario,
          heroTag: null,
          tooltip: rotuloDasOutras,
          onPressed: () => _abrir(context),
          child: const Icon(Icons.more_horiz),
        ),
        const SizedBox(width: BichuEspaco.e4),
        FloatingActionButton(
          key: chaveDoPrincipal,
          heroTag: null,
          tooltip: principal.rotulo,
          onPressed: principal.aoTocar,
          child: Icon(principal.icone),
        ),
      ],
    );
  }

  Future<void> _abrir(BuildContext context) async {
    await showModalBottomSheet<void>(
      context: context,
      useSafeArea: true,
      builder: (contextoDaFolha) => SafeArea(
        key: chaveDaFolha,
        child: SingleChildScrollView(
          child: Padding(
            padding: const EdgeInsets.symmetric(vertical: BichuEspaco.e4),
            child: Column(
              mainAxisSize: MainAxisSize.min,
              crossAxisAlignment: CrossAxisAlignment.stretch,
              children: <Widget>[
                Padding(
                  padding: const EdgeInsets.symmetric(
                    horizontal: BichuEspaco.e4,
                    vertical: BichuEspaco.e2,
                  ),
                  child: Text(
                    tituloDaFolha,
                    style: Theme.of(contextoDaFolha).textTheme.titleMedium,
                  ),
                ),
                for (final opcao in outras)
                  _LinhaDaOpcao(
                    opcao: opcao,
                    aoTocar: () {
                      Navigator.of(contextoDaFolha).pop();
                      opcao.aoTocar();
                    },
                  ),
              ],
            ),
          ),
        ),
      ),
    );
  }
}

/// Uma linha da folha: o glifo, o nome escrito, e o alvo de 48 dp inteiro.
class _LinhaDaOpcao extends StatelessWidget {
  const _LinhaDaOpcao({required this.opcao, required this.aoTocar});

  final OpcaoDeCriar opcao;
  final VoidCallback aoTocar;

  @override
  Widget build(BuildContext context) {
    final cores = BichuColors.of(context).cores;

    return InkWell(
      onTap: aoTocar,
      child: Padding(
        padding: const EdgeInsets.symmetric(
          horizontal: BichuEspaco.e4,
          vertical: BichuEspaco.e3,
        ),
        child: ConstrainedBox(
          constraints: const BoxConstraints(minHeight: BichuAlvoDeToque.min),
          child: Row(
            children: <Widget>[
              Icon(opcao.icone, color: cores.textPrimary),
              const SizedBox(width: BichuEspaco.e4),
              Expanded(
                child: Text(
                  opcao.rotulo,
                  style: Theme.of(context).textTheme.bodyLarge,
                ),
              ),
            ],
          ),
        ),
      ),
    );
  }
}
