/// A TARJA SOBRE MIDIA: o lugar onde TEXTO pode ficar em cima de uma FOTO sem
/// que a legibilidade dependa dos pixels dela.
///
/// ## O problema, e ele e de acessibilidade e nao de gosto
///
/// Texto claro direto sobre foto arbitraria nao tem contraste: a foto pode ser
/// um ceu de meio-dia. Medido, com a conta do SC 1.4.3 do WCAG 2.1:
///
/// | desenho                                   | pior caso (foto branca) | razao   |
/// |-------------------------------------------|-------------------------|---------|
/// | `#FAFAF8` direto sobre a foto             | `#FFFFFF`               | 1,02:1  |
/// | `#FAFAF8` sobre `scrim` (claro, 64%)      | `#6E6D6C`               | 4,94:1  |
/// | `#FAFAF8` sobre `scrim` (escuro, 72%)     | `#474747`               | 8,89:1  |
/// | **esta tarja** — `textPrimary`/`surface`  | nao depende da foto     | 16,47:1 |
///
/// O veu translucido PASSA o piso de 4,5 raspando no tema claro, e **reprova o
/// piso de 7,0** do paragrafo 6.5. A tarja opaca mede 16,47:1 no claro e
/// 16,02:1 no escuro, e mede isso **com qualquer foto** — porque nao ha foto
/// atras do texto.
///
/// ## E E A DECISAO QUE O DESIGN SYSTEM JA TINHA TOMADO
///
/// Paragrafo 24.12.6: *"Titulo abaixo da capa, e nao sobre ela. Titulo sobre
/// foto exige veu escuro e mesmo assim falha em foto clara; abaixo da capa o
/// contraste e o do sistema, sempre."* E o paragrafo 24.12.1 ja tinha a receita
/// para quando algo PRECISA ficar sobre a midia — o componente `Botao sobre
/// midia`: fundo `surface`, `sombra/md`, para o contraste nao depender da foto.
///
/// Esta tarja e **o mesmo componente com conteudo de texto em vez de um icone**.
/// Nasceu em 29/10/2026, quando o cliente pediu o nome e a foto do autor *sobre*
/// a imagem no cartao do Mural: o pedido e dele, a receita do contraste e da
/// casa, e as duas coisas caberem juntas e o que este arquivo faz.
///
/// ## O QUE A SOMBRA FAZ, E POR QUE ELA SOME NO ESCURO
///
/// A sombra separa a tarja da foto quando as duas sao claras. No tema escuro
/// `BichuColors.sombra` devolve lista vazia (sombra nao existe no escuro, por
/// decisao do design system), e a separacao passa a ser a `outline` — a mesma
/// troca que `_BotaoVoltarSobreMidia` faz na capa do encontro.
///
/// **A sombra NAO e o recurso de legibilidade.** Quem garante a leitura e o
/// preenchimento OPACO; a sombra e so o limite visivel da tarja. Isso importa
/// porque sombra nao se mede: o verificador de contraste procura o ancestral
/// com preenchimento SOLIDO (`_fundoSolidoMaisProximo`, `alpha >= 1.0`), e e
/// este `DecoratedBox` que ele encontra. Um veu translucido seria pulado por
/// ele, que subiria ate a `surface` do cartao e mediria o par ERRADO — um
/// desenho em que o portao nao consegue medir o que a pessoa de fato ve.
library;

import 'package:flutter/material.dart';

import '../theme/bichu_colors.dart';
import '../theme/bichu_tokens.g.dart';

class TarjaSobreMidia extends StatelessWidget {
  const TarjaSobreMidia({required this.child, super.key});

  final Widget child;

  /// O recuo da tarja em relacao a borda da midia.
  ///
  /// **Recuada e nao colada, de proposito**: com a foto aparecendo em volta, a
  /// tarja le como estando SOBRE a imagem. Colada na borda ela leria como uma
  /// barra de topo, que e exatamente o desenho de que o cliente pediu para
  /// sair.
  static const double recuo = BichuEspaco.e3;

  @override
  Widget build(BuildContext context) {
    final tema = BichuColors.of(context);
    final cores = tema.cores;
    return DecoratedBox(
      decoration: BoxDecoration(
        // OPACO. Ver o cabecalho: e este preenchimento, e nao a sombra, que
        // responde pela leitura do texto.
        color: cores.surface,
        borderRadius: BorderRadius.circular(BichuRaio.lg),
        boxShadow: tema.sombra(BichuSombra.md),
        // No escuro a sombra nao existe, e sem ela a tarja encostaria na foto
        // sem limite visivel.
        border: tema.escuro
            ? Border.all(color: cores.outline, width: BichuBorda.hairline)
            : null,
      ),
      child: Padding(
        padding: const EdgeInsets.symmetric(
          horizontal: BichuEspaco.e2,
          vertical: BichuEspaco.e2,
        ),
        child: child,
      ),
    );
  }
}
