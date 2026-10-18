/// O item de menu do corpo de uma tela: uma linha que leva a uma acao.
///
/// ## Por que ele nasceu (18/10/2026)
///
/// Pedido do cliente, literal: *"Essa pagina inicial atual, deveria ter apenas
/// os menus para realizar as acoes e nao todos os botoes nessa pagina"*. O
/// `Perfil` logado empilhava tres botoes de contorno de largura total --
/// `Marcar como perdido`, `Escanear uma tag`, `Sair da conta` -- mais um
/// primario, e um `ListTile` mudo com o e-mail. Botao de largura total e a
/// forma da acao PRIMARIA desta tela; quatro deles empilhados nao tem primaria
/// nenhuma.
///
/// ## Por que nao e o item da gaveta
///
/// `ItemDaGaveta`, em `telas/gaveta_de_secoes.dart`, e **uma linha so com o
/// rotulo**, e isso e decisao do cliente de 23/09 com portao que a cobra
/// (`isca B` de `gaveta_com_submenus_test.dart` reprova qualquer `subtitle`
/// naquele arquivo). Aqui a linha de apoio e necessaria: o item `Meus dados`
/// mostra o e-mail e o telefone da conta, que e a informacao que o
/// `ListTile` mudo dava antes e que nao pode desaparecer com ele. Duas pecas
/// com regras opostas sao duas pecas; forcar uma apagaria a regra da outra.
///
/// ## Uma parada de foco, e um botao de verdade
///
/// `Semantics(button: true, ..., excludeSemantics: true)` com rotulo composto:
/// sem isso o leitor de tela pararia tres vezes na mesma linha -- rotulo,
/// apoio e icone -- e nenhuma delas seria o controle. `onTap` vai no
/// `Semantics` **e** no `InkWell`: a noite de 21/09 achou quatro widgets que se
/// anunciavam como botao sem carregar acao de toque, e o portao de
/// acessibilidade reprova exatamente isso (SC 4.1.2).
///
/// O piso de altura e [BichuAlvoDeToque.min]. Ele nao e fixo: com a fonte do
/// sistema em 200% a linha cresce, porque o texto manda e o piso e piso.
library;

import 'package:flutter/material.dart';

import '../theme/bichu_colors.dart';
import '../theme/bichu_tokens.g.dart';

class ItemDeMenu extends StatelessWidget {
  const ItemDeMenu({
    required this.rotulo,
    required this.aoTocar,
    super.key,
    this.apoio,
    this.critico = false,
  });

  final String rotulo;

  /// A linha de apoio, quando ela carrega informacao que a tela perderia sem
  /// ela. **Nao e explicacao do item**: menu que precisa se explicar e menu
  /// com nome errado.
  final String? apoio;

  /// Quando a acao e de saida ou destruicao, e por isso recebe a tinta da
  /// marca em vez do texto comum. **Nao desabilita nada e nao confirma nada**:
  /// quem confirma e a folha que o destino abre.
  final bool critico;

  final VoidCallback aoTocar;

  /// O que o leitor de tela ouve: o rotulo, o apoio quando ha, e nada do
  /// icone -- ele e decorativo e o rotulo ao lado ja diz para onde se vai.
  String get rotuloAcessivel {
    final linha = apoio;
    if (linha == null || linha.isEmpty) return rotulo;
    return '$rotulo. $linha';
  }

  @override
  Widget build(BuildContext context) {
    final cores = BichuColors.of(context).cores;
    final textos = Theme.of(context).textTheme;

    return Semantics(
      button: true,
      container: true,
      excludeSemantics: true,
      label: rotuloAcessivel,
      onTap: aoTocar,
      child: InkWell(
        onTap: aoTocar,
        borderRadius: BorderRadius.circular(BichuRaio.sm),
        child: Container(
          constraints: const BoxConstraints(minHeight: BichuAlvoDeToque.min),
          padding: const EdgeInsets.symmetric(vertical: BichuEspaco.e3),
          decoration: BoxDecoration(
            border: Border(
              bottom: BorderSide(
                color: cores.outline,
                width: BichuBorda.hairline,
              ),
            ),
          ),
          child: Row(
            children: <Widget>[
              Expanded(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: <Widget>[
                    Text(
                      rotulo,
                      style: textos.titleMedium?.copyWith(
                        color: critico ? cores.primary : cores.textPrimary,
                      ),
                    ),
                    if (apoio != null && apoio!.isNotEmpty) ...<Widget>[
                      const SizedBox(height: BichuEspaco.e1),
                      Text(
                        apoio!,
                        style: textos.bodyMedium?.copyWith(
                          color: cores.textSecondary,
                        ),
                        maxLines: 2,
                        overflow: TextOverflow.ellipsis,
                      ),
                    ],
                  ],
                ),
              ),
              const SizedBox(width: BichuEspaco.e2),
              Icon(
                Icons.chevron_right,
                color: cores.textSecondary,
                // Decorativo: o rotulo composto acima ja e o nome do controle,
                // e um icone com nome proprio seria anuncio duplo.
                semanticLabel: '',
              ),
            ],
          ),
        ),
      ),
    );
  }
}

/// O cabecalho de um grupo de itens de menu.
///
/// Existe porque `Conta` e `Meus pets` sao coisas diferentes na mesma tela, e
/// sem a linha que as separa a lista vira uma pilha de sete linhas iguais --
/// que e a mesma falha da pilha de botoes, com outra forma.
///
/// `Semantics(header: true)`: quem usa leitor de tela navega por cabecalho, e
/// um texto em maiusculas sem o papel de cabecalho e so um texto pequeno.
class TituloDeGrupoDeMenu extends StatelessWidget {
  const TituloDeGrupoDeMenu(this.texto, {super.key});

  final String texto;

  @override
  Widget build(BuildContext context) {
    final cores = BichuColors.of(context).cores;
    final textos = Theme.of(context).textTheme;
    return Padding(
      padding: const EdgeInsets.only(bottom: BichuEspaco.e2),
      child: Semantics(
        header: true,
        child: Text(
          texto,
          style: textos.labelMedium?.copyWith(color: cores.textMuted),
        ),
      ),
    );
  }
}
