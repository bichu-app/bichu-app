import 'package:flutter/material.dart';

import '../../api/modelos_rede.dart';
import '../../theme/bichu_colors.dart';
import '../../theme/bichu_tokens.g.dart';
import 'pecas_da_rede.dart';

/// O cartao de um encontro na agenda: **a foto e o titulo** -- mais UMA
/// palavra, e so quando o encontro foi cancelado.
///
/// ```
/// [ imagem 16:9 (capa ou banner da marca) ]
/// Cancelado                 <- SO em `status: cancelled`
/// Título
/// ```
///
/// ## A palavra `Cancelado`, e por que ela e a excecao
///
/// A entrega de 19/10/2026 deixou o cartao com a foto e o titulo, e nada
/// mais. Medi a consequencia e levei a pergunta fechada ao cliente: um evento
/// cancelado ficava **indistinguivel** na lista, e fica em `Próximos` ate o
/// fim previsto de proposito (o contrato diz que `cancelled` prevalece sobre
/// o estado temporal *"para as pessoas confirmarem o cancelamento"*).
///
/// A resposta dele, no mesmo dia: a palavra entra. O motivo, na frase que
/// veio com a decisao: **um cartao limpo nao vale alguem sair de casa para um
/// evento que nao existe.**
///
/// **Uma palavra, e literalmente isso.** Sem fundo, sem pilula, sem moldura,
/// sem glifo, e sem a data ou o lugar de volta. O que existia antes era
/// `DistintivoDeSituacao`, uma pilula invertida sobre a imagem, e ele NAO
/// voltou -- nem ele nem os outros tres rotulos que ele sabia desenhar
/// (`Acontecendo agora`, `Encerrado`). So `cancelado` ganha palavra, porque
/// so ele e uma informacao que muda o que a pessoa vai FAZER.
///
/// **O cinza da foto nao voltou.** Ele saiu nesta mesma rodada porque, sem
/// palavra nenhuma, uma foto em escala de cinza era sinal exclusivamente por
/// cor (SC 1.4.1). A palavra resolve isso e abriria a porta para o cinza
/// voltar como REFORCO -- a decisao de nao traze-lo esta no relato da
/// entrega, e trazer e acrescentar `ColorFiltered` em
/// [ImagemDoEncontroOuBanner] de novo.
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
/// ## E ELE VOLTOU A SER UM BOTAO EM 20/10/2026 — mas o toque e de quem chama
///
/// A entrega de 19/10 leu o pedido *"sem informações adicionais ou pagina de
/// detalhes do evento"* como tres coisas e apagou a pagina. O cliente
/// corrigiu em 20/10, literal: *"eu nao pedi pra voce remover, eu pedi para
/// remover o clique para o usuario nnao conseguir acessar a pagina de
/// detalhes e pedi pra voce resumir a listagem com foto, titulo do evento"*.
///
/// **O cartao nao mudou de forma nenhuma com a volta do toque**: continua foto
/// e titulo, mais a palavra `Cancelado`. Nada voltou para dentro dele -- nem
/// data, nem lugar, nem distancia, nem selo, nem resumo --, e ha isca que
/// conta os nos de texto.
///
/// **E ele nao conhece a sessao, e nao sabe para onde leva.** [aoTocar] e
/// obrigatorio e vem de quem desenha a lista: na agenda
/// (`rede/agenda_da_rede.dart`), logado ele abre a pagina do encontro e
/// deslogado ele abre a folha com o convite para entrar. Decidir aqui poria a
/// regra de sessao dentro de um cartao, que e o segundo lugar onde ela moraria.
///
/// **[nomeAcessivel] voltou com o toque**, e e por isso que ele existe: um
/// botao precisa de um nome que diga o encontro inteiro numa parada de foco,
/// com a situacao na frente (`Cancelado: ...`). Enquanto o cartao era conteudo,
/// o texto escrito nele bastava.
///
/// ## O publico e o privado desenham IGUAL
///
/// O `switch` de [EncontroDaRede] desapareceu com as linhas que o usavam:
/// [TeaserDoPrivado] nao tem capa (entra o banner da marca) e o publico pode
/// nao ter (entra o mesmo banner). Nenhum dos dois tem mais nada a mostrar.
class CartaoDoEncontro extends StatelessWidget {
  const CartaoDoEncontro({
    required this.encontro,
    required this.aoTocar,
    super.key,
  });

  final EncontroDaRede encontro;

  /// O que o toque faz. **Obrigatorio e nao anulavel**: o criterio 2 da
  /// BICHUS-62 proibe controle sem desfecho, e um `aoTocar` opcional deixaria
  /// o cartao voltar calado ao estado de 19/10 -- tocavel na aparencia e morto
  /// no dedo.
  final VoidCallback aoTocar;

  /// A UNICA palavra de situacao que o cartao desenha.
  ///
  /// `Acontecendo agora` e `Encerrado` **nao tem equivalente aqui**, e a
  /// ausencia e a decisao: a data que o cartao nao mostra mais tambem nao
  /// dizia essas duas, e nenhuma das duas muda o que a pessoa faz. Cancelado
  /// muda.
  static const String rotuloDeCancelado = 'Cancelado';

  /// O nome que o leitor de tela diz: o titulo, com `Cancelado: ` na frente
  /// quando for o caso.
  ///
  /// **A situacao vem PRIMEIRO**, e isso e a regra de UX 28.6 que o cartao
  /// antigo ja seguia: a lista falada nao pode anunciar como convite um
  /// encontro que nao vai acontecer. Quem navega por foco ouve o impedimento
  /// antes do nome, e nao depois de ter decidido ir.
  ///
  /// **Por que esta string e MONTADA, e nao deixada para o `MergeSemantics`.**
  /// Medido nesta entrega, e o resultado foi um defeito: com
  /// `MergeSemantics` em volta da coluna `Cancelado` + titulo, a arvore
  /// publicava `label=Cancelado` e **o titulo desaparecia** -- o leitor de
  /// tela anunciaria "Cancelado" e a pessoa nao saberia de QUAL evento. Era
  /// pior que antes da palavra existir. O no e montado a mao por isso, e o
  /// caso `ISCA -- cancelado tem a palavra, e o leitor de tela diz as DUAS
  /// coisas` cobra as duas metades do rotulo.
  String get nomeAcessivel => encontro.situacao == SituacaoDoEncontro.cancelado
      ? '$rotuloDeCancelado: ${encontro.titulo}'
      : encontro.titulo;

  @override
  Widget build(BuildContext context) {
    final cores = BichuColors.of(context).cores;
    final textos = Theme.of(context).textTheme;
    final escuro = Theme.of(context).brightness == Brightness.dark;
    final e = encontro;
    final cancelado = e.situacao == SituacaoDoEncontro.cancelado;

    return Material(
      color: cores.surface,
      borderRadius: BorderRadius.circular(BichuRaio.lg),
      clipBehavior: Clip.antiAlias,
      // **`InkWell` DENTRO do `Material`, e ACIMA do `Semantics`.** A primeira
      // metade e de pintura: o respingo de tinta nasce no `Material` mais
      // proximo, e sem ele o efeito ficaria atras da superficie opaca do
      // cartao -- toque sem resposta visivel, que e o defeito que faz a pessoa
      // tocar de novo. A segunda metade e de acessibilidade, e esta explicada
      // no `Semantics` abaixo.
      child: InkWell(
        onTap: aoTocar,
        borderRadius: BorderRadius.circular(BichuRaio.lg),
        child: Container(
          decoration: BoxDecoration(
            borderRadius: BorderRadius.circular(BichuRaio.lg),
            border: Border.all(
              color: cores.outline,
              width: BichuBorda.hairline,
            ),
            boxShadow: escuro ? null : BichuSombra.sm,
          ),
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.stretch,
            children: <Widget>[
              ImagemDoEncontroOuBanner(
                // O teaser nao tem capa: o banner entra no lugar.
                url: e is EncontroPublico ? e.urlDaCapa : null,
              ),
              // **UMA PARADA DE FOCO, com o rotulo montado por
              // [nomeAcessivel].**
              //
              // `Semantics` com `excludeSemantics` e nao `MergeSemantics`: a
              // prosa de [nomeAcessivel] explica a medicao que decidiu isso --
              // o merge comia o titulo e deixava so a palavra.
              //
              // **`excludeSemantics` aqui NAO engole o toque, e isto foi o
              // ponto delicado da volta de 20/10.** O `InkWell` esta ACIMA
              // deste no, envolvendo o cartao inteiro: ele publica a acao de
              // toque no no do cartao, e o `excludeSemantics` daqui apaga
              // apenas os DESCENDENTES -- os dois `Text`. Com o `InkWell`
              // embaixo, o toque sumiria da arvore de acessibilidade e o
              // cartao viraria texto inerte para quem usa leitor de tela. Foi
              // exatamente esse o defeito que o `BotaoPrimario` pagou uma vez
              // (`test/a11y/acao_de_controle_test.dart`), e e por isso que a
              // ordem esta escrita aqui em vez de ficar implicita.
              //
              // A ordem vale pelos dois canais: `Cancelado` esta ACIMA do
              // titulo na tela, e na frente dele no rotulo falado.
              Semantics(
                label: nomeAcessivel,
                // **`button: true` voltou com o toque.** Sem ele o leitor de
                // tela anuncia o cartao como texto, e quem navega por audicao
                // nao descobre que ha para onde ir.
                button: true,
                excludeSemantics: true,
                child: Padding(
                  padding: const EdgeInsets.all(BichuEspaco.e4),
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: <Widget>[
                      if (cancelado) ...<Widget>[
                        // Neutro de proposito: a PALAVRA e a informacao, e
                        // nenhuma cor diz nada (design system 24.13.1). Sem
                        // `errorContainer`, sem vermelho e sem urgencia -- o
                        // evento nao deu erro, ele foi cancelado.
                        Text(
                          rotuloDeCancelado,
                          style: textos.labelMedium
                              ?.copyWith(color: cores.textPrimary),
                        ),
                        const SizedBox(height: BichuEspaco.e1),
                      ],
                      Text(e.titulo, style: textos.titleMedium),
                    ],
                  ),
                ),
              ),
            ],
          ),
        ),
      ),
    );
  }
}
