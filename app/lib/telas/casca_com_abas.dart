import 'package:flutter/material.dart';
import 'package:go_router/go_router.dart';

import '../theme/bichu_colors.dart';
import '../theme/bichu_tokens.g.dart';
import '../widgets/marca.dart';

/// A casca de navegacao: quatro destinos, barra sempre visivel, **inclusive
/// deslogado**.
///
/// Deslogado e um estado de navegacao, nao um muro (UX 5.2). Nenhuma aba fica
/// escondida, desabilitada ou com cadeado: a acao aparece normal e o login
/// acontece dentro do caminho dela, e nao no lugar dela.
///
/// "Escanear" e destino de primeiro nivel, e nao botao flutuante, porque e o
/// unico caminho do app para o trabalho mais critico, e esconder o leitor
/// dentro de um menu transforma quem encontrou um animal em alguem que desiste
/// e usa a camera nativa.
class CascaComAbas extends StatelessWidget {
  const CascaComAbas({required this.navegacao, super.key});

  final StatefulNavigationShell navegacao;

  static const List<DestinoDeNavegacao> destinos = <DestinoDeNavegacao>[
    DestinoDeNavegacao('Início', Icons.home_outlined, Icons.home),
    DestinoDeNavegacao('Perdidos', Icons.search_outlined, Icons.search),
    DestinoDeNavegacao(
      'Escanear',
      Icons.qr_code_scanner_outlined,
      Icons.qr_code_scanner,
    ),
    DestinoDeNavegacao('Perfil', Icons.person_outline, Icons.person),
  ];

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      body: navegacao,
      bottomNavigationBar: NavigationBar(
        selectedIndex: navegacao.currentIndex,
        onDestinationSelected: (indice) => navegacao.goBranch(
          indice,
          initialLocation: indice == navegacao.currentIndex,
        ),
        destinations: <Widget>[
          for (final destino in destinos)
            NavigationDestination(
              icon: Icon(destino.icone),
              selectedIcon: Icon(destino.iconeSelecionado),
              label: destino.rotulo,
              tooltip: destino.rotulo,
            ),
        ],
      ),
    );
  }
}

/// Um dos quatro destinos da barra inferior.
class DestinoDeNavegacao {
  const DestinoDeNavegacao(this.rotulo, this.icone, this.iconeSelecionado);

  final String rotulo;
  final IconData icone;
  final IconData iconeSelecionado;
}

/// Casca visual comum das telas de aba: titulo, margem lateral de 16 e area
/// segura.
///
/// Area segura nao e margem: notch, ilha dinamica, barra de gestos e teclado
/// mudam a area utilizavel em tempo de execucao, e conteudo em coordenada fixa
/// e defeito que so aparece no aparelho que ninguem tem em maos.
class TelaDeAba extends StatelessWidget {
  const TelaDeAba({
    required this.titulo,
    required this.filhos,
    super.key,
    this.tituloEmMarca = false,
  });

  final String titulo;
  final List<Widget> filhos;

  /// Quando a barra de topo carrega o LOGOTIPO em vez do titulo escrito.
  ///
  /// Vale so para a tela em que o titulo E a marca. O paragrafo 8.4 do design
  /// system diz que o logotipo e vetor e que nenhuma tela o recompoe digitando;
  /// a barra precisa do lockup SEM descritor, porque o completo tem piso de
  /// 160px de largura e nao cabe numa barra de 56px (paragrafo 21.2).
  ///
  /// [titulo] continua obrigatorio: ele vira o rotulo que o leitor de tela
  /// anuncia. Imagem de marca sem rotulo e barra muda para quem nao ve.
  final bool tituloEmMarca;

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(
        title: tituloEmMarca
            ? MarcaLockup(
                largura: MarcaLockup.pisoDeLargura,
                rotulo: titulo,
              )
            : Text(titulo),
      ),
      body: SafeArea(
        child: ListView(
          padding: const EdgeInsets.all(BichuEspaco.e4),
          children: filhos,
        ),
      ),
    );
  }
}

/// O estado vazio do sistema: o M3 nao define um, e este e composicao.
class EstadoVazio extends StatelessWidget {
  const EstadoVazio({
    required this.titulo,
    required this.explicacao,
    super.key,
    this.acao,
  });

  final String titulo;
  final String explicacao;
  final Widget? acao;

  @override
  Widget build(BuildContext context) {
    final cores = BichuColors.of(context).cores;
    final textos = Theme.of(context).textTheme;

    return Container(
      width: double.infinity,
      padding: const EdgeInsets.all(BichuEspaco.e6),
      decoration: BoxDecoration(
        color: cores.surfaceSunken,
        borderRadius: BorderRadius.circular(BichuRaio.lg),
        border: Border.all(color: cores.outline, width: BichuBorda.hairline),
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: <Widget>[
          Text(titulo, style: textos.titleLarge),
          const SizedBox(height: BichuEspaco.e2),
          Text(
            explicacao,
            style: textos.bodyLarge?.copyWith(color: cores.textSecondary),
          ),
          if (acao != null) ...<Widget>[
            const SizedBox(height: BichuEspaco.e6),
            acao!,
          ],
        ],
      ),
    );
  }
}
