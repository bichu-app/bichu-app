import 'package:flutter/material.dart';

import '../theme/bichu_colors.dart';
import '../theme/bichu_tokens.g.dart';
import 'botao_primario.dart';
import 'faixa_de_aviso.dart';

/// O pe de **toda listagem paginada** do app: pedir a pagina seguinte, dizer
/// que a lista acabou, e dizer que o pedido falhou.
///
/// Ele e o par de `BarraDeListagem`, e a divisao entre os dois e proposital:
/// a barra recorta a lista (busca, filtro, ordem) e **nao sabe nada de
/// pagina**; este rodape avanca a lista e nao sabe nada de recorte. Meter
/// paginacao dentro da barra faria o componente do topo depender de quantos
/// itens vieram, que e exatamente o acoplamento que ele nao tem hoje.
///
/// ---------------------------------------------------------------------------
/// ## O desenho e o paragrafo 11.20 do design system, por extenso
///
/// **Nao ha paginacao numerada, e nao ha rolagem infinita.** O 11.20 decide
/// as duas coisas, e a segunda com motivo escrito: rolagem infinita impede
/// chegar ao rodape e gasta dados de quem esta com plano pequeno. O
/// backoffice ja pagina assim (`useListaPaginada`, tambem citando o 11.20), e
/// duas formas de paginar no mesmo produto e pior que nenhuma.
///
/// Ha uma razao a mais no app, e ela e de estrutura: o corpo rolavel e um
/// `ListView` da casca (`TelaDeAba`), compartilhado pelas cinco secoes. A tela
/// nao possui o controlador de rolagem e nao tem como observar o fim da lista
/// sem que a casca lhe entregue o controlador -- e a casca entregaria o mesmo
/// controlador para cinco secoes ao mesmo tempo.
///
/// Os quatro estados do 11.20, e o que cada um desenha aqui:
///
/// | Estado | O que aparece |
/// |---|---|
/// | Repouso, com mais para ver | [BotaoSecundario] de largura total, `Carregar mais` |
/// | Carregando | o mesmo botao, rotulo mantido e indicador a esquerda |
/// | Fim da lista | o botao **sai** e entra a frase de [fimDaLista] |
/// | Erro | [FaixaDeAviso] com `Tentar de novo`, e a lista ja carregada FICA |
///
/// **No erro a lista nao e apagada, e aqui isso divergo da primeira pagina.**
/// Quando a pagina 1 falha, as telas limpam os cartoes de proposito: a pessoa
/// acabou de trocar o recorte e veria o resultado do recorte anterior como se
/// fosse o novo. Pedir a pagina 3 e outra coisa: o recorte nao mudou, e as
/// vinte entradas na tela continuam sendo a resposta correta para ele. Apagar
/// tudo porque a quarta pagina nao chegou seria punir quem rolou mais.
///
/// ---------------------------------------------------------------------------
/// ## O que ele nao sabe
///
/// **Nada do dominio de quem o usa.** Nao ha uma palavra de profissional, de
/// produto ou de evento neste arquivo. A frase do fim da lista vem de quem
/// chama, em [fimDaLista], porque ela carrega o substantivo e o plural da
/// tela -- e porque `todos os 1 profissionais` e o defeito que uma frase
/// montada aqui produziria.
class RodapeDaPaginacao extends StatelessWidget {
  const RodapeDaPaginacao({
    required this.carregados,
    required this.total,
    required this.aoPedirMais,
    required this.fimDaLista,
    super.key,
    this.carregando = false,
    this.textoDaFalha,
  });

  /// Quantos itens **estao na tela agora**, somando todas as paginas pedidas.
  ///
  /// E este numero, e nao o tamanho da ultima pagina, que decide se ha mais:
  /// comparar `itens.length` da pagina com o `limit` erra na ultima pagina
  /// cheia, que e o caso em que `total` e multiplo exato do limite.
  final int carregados;

  /// Quantos itens o recorte atual tem **no servidor**.
  final int total;

  /// Pede a pagina seguinte. Serve tambem ao `Tentar de novo` do erro: e o
  /// mesmo pedido, e um segundo callback so daria a duas coisas iguais a
  /// chance de divergir.
  final VoidCallback aoPedirMais;

  /// A frase do fim da lista, montada com o [total].
  final String Function(int total) fimDaLista;

  final bool carregando;

  /// Por que o pedido da pagina seguinte falhou. Nulo quando nao falhou.
  final String? textoDaFalha;

  static const String rotuloDeCarregarMais = 'Carregar mais';

  static const String rotuloDeTentarDeNovo = 'Tentar de novo';

  /// Ha pagina seguinte para pedir.
  ///
  /// `carregados < total`, e nao `itens.length == limite`: o segundo pinta um
  /// botao que nao traz nada quando o total e multiplo do limite, e botao que
  /// nao traz nada e acao sem desfecho.
  bool get temMais => carregados < total;

  @override
  Widget build(BuildContext context) {
    final cores = BichuColors.of(context).cores;
    final textos = Theme.of(context).textTheme;

    if (textoDaFalha != null) {
      return FaixaDeAviso(
        texto: textoDaFalha!,
        rotuloDaAcao: rotuloDeTentarDeNovo,
        aoTocarNaAcao: aoPedirMais,
      );
    }

    if (!temMais) {
      return Text(
        fimDaLista(total),
        style: textos.bodySmall?.copyWith(color: cores.textSecondary),
      );
    }

    return BotaoSecundario(
      rotulo: rotuloDeCarregarMais,
      aoTocar: aoPedirMais,
      carregando: carregando,
    );
  }
}

/// Espaco entre o ultimo cartao e o rodape. Num lugar so porque as duas telas
/// que o usam precisam concordar, e concordar por copia dura uma edicao.
const double espacoAcimaDoRodape = BichuEspaco.e4;
