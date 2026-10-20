import 'package:flutter/material.dart';

import '../../api/modelos_rede.dart';
import '../../theme/bichu_colors.dart';
import '../../theme/bichu_tokens.g.dart';
import 'pecas_da_rede.dart';

/// O cartao de um encontro na agenda: **a foto e o titulo, e nada mais**.
///
/// ```
/// [ imagem 16:9 (capa ou banner da marca) ]
/// Título
/// ```
///
/// ## Por que ele encolheu, e o que saiu
///
/// Pedido do cliente em 19/10/2026: *"você deve mostrar apenas a foto e o
/// titulo do evento, sem informações adicionais ou pagina de detalhes do
/// evento"*. Saiu, nesta ordem de cima para baixo: o bloco de dia sobre a
/// imagem (`SÁB` / `27` / `SET`), o distintivo de situacao (`Acontecendo
/// agora`, `Encerrado`, `Cancelado`), a linha de data e horario, a linha de
/// lugar e bairro, a linha de distancia da regiao cadastrada, o resumo de
/// duas linhas, o selo de valor (`Gratuito`, `R$ 15 por pet`), o selo
/// `Privado` e a pilula de `Meus pedidos`.
///
/// ## E ele deixou de ser um botao
///
/// O mesmo pedido tirou a **pagina de detalhes do evento**. Sem destino, o
/// `InkWell` e o `Semantics(button: true)` sairiam de qualquer forma pelo
/// criterio 2 da BICHUS-62: controle sem desfecho nao fica nem habilitado nem
/// desabilitado -- ele nao existe. O cartao e conteudo, e o titulo e o unico
/// no que o leitor de tela para.
///
/// **Por isso nao ha mais `nomeAcessivel`.** Enquanto o cartao era um botao,
/// ele precisava de um nome que dissesse o encontro inteiro numa parada de
/// foco, com a situacao na frente (`Cancelado: ...`). Conteudo nao tem nome
/// acessivel: tem o texto que esta escrito nele, e o que esta escrito e o
/// titulo.
///
/// ## O publico e o privado desenham IGUAL
///
/// O `switch` de [EncontroDaRede] desapareceu com as linhas que o usavam:
/// [TeaserDoPrivado] nao tem capa (entra o banner da marca) e o publico pode
/// nao ter (entra o mesmo banner). Nenhum dos dois tem mais nada a mostrar.
class CartaoDoEncontro extends StatelessWidget {
  const CartaoDoEncontro({required this.encontro, super.key});

  final EncontroDaRede encontro;

  @override
  Widget build(BuildContext context) {
    final cores = BichuColors.of(context).cores;
    final textos = Theme.of(context).textTheme;
    final escuro = Theme.of(context).brightness == Brightness.dark;
    final e = encontro;

    return Material(
      color: cores.surface,
      borderRadius: BorderRadius.circular(BichuRaio.lg),
      clipBehavior: Clip.antiAlias,
      child: Container(
        decoration: BoxDecoration(
          borderRadius: BorderRadius.circular(BichuRaio.lg),
          border: Border.all(color: cores.outline, width: BichuBorda.hairline),
          boxShadow: escuro ? null : BichuSombra.sm,
        ),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.stretch,
          children: <Widget>[
            ImagemDoEncontroOuBanner(
              // O teaser nao tem capa: o banner entra no lugar.
              url: e is EncontroPublico ? e.urlDaCapa : null,
            ),
            Padding(
              padding: const EdgeInsets.all(BichuEspaco.e4),
              child: Text(e.titulo, style: textos.titleMedium),
            ),
          ],
        ),
      ),
    );
  }
}
