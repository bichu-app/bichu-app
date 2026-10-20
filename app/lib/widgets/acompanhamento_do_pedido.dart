import 'package:flutter/material.dart';
import 'package:flutter/services.dart';

import '../api/modelos_pet.dart';
import '../theme/bichu_colors.dart';
import '../theme/bichu_tokens.g.dart';

/// O acompanhamento de UM pedido da plaquinha: a ilustracao, o numero do
/// pedido e os passos.
///
/// ## O QUE ESTA TELA PODE PROMETER, E O QUE ELA NAO PODE
///
/// **ESTE CABECALHO FOI REESCRITO NA MESCLA DE 18/10/2026, porque a condicao
/// que ele descrevia deixou de valer no mesmo dia.** Ele dizia que o banco
/// guardava apenas `pending`/`fulfilled`/`declined`, que "nao existe em
/// transporte e nao existe chegou", que por isso os passos eram TRES, e que um
/// quarto passo `Chegou` "seria a tela prometendo um rastreio que ninguem
/// alimenta". A frente do painel criou o eixo da entrega na mesma data: a
/// migracao `20261018000004` trouxe `delivery_state`
/// (`requested`/`in_transit`/`arrived`, **nunca nulo**), `tracking_code`,
/// `shipped_at` e `delivered_at`, mais a tela do painel que os escreve.
///
/// Entao agora os passos sao **QUATRO**, e o trilho vem do **EIXO DA ENTREGA**
/// e nao do `status`:
///
/// - `status` responde por UMA coisa, a RECUSA. Pedido recusado nao tem
///   trilho de entrega, porque nada sera enviado.
/// - `delivery_state` desenha o resto. Isto conserta um defeito real da versao
///   anterior: ela pintava `fulfilled` como "Enviada, concluido", e a pessoa
///   lia "Enviada" no instante em que alguem no painel clicou em "atender" --
///   dias antes de a plaquinha sair. **Atender nao e despachar.**
/// - o quarto passo nao fica parado para sempre, que era o medo escrito aqui:
///   quem o move e a tela de entrega do painel, e ela existe.
///
/// `tracking_code` ja nao e sempre nulo: vem preenchido quando ha despacho com
/// rastreio. Nulo continua sendo comum e nao e defeito (entrega em maos,
/// correio simples, pedido que nao saiu), e o bloco simplesmente nao nasce.
///
/// ## ACESSIBILIDADE: o icone NAO diz o estado
///
/// Cada passo tem **texto visivel** dizendo a situacao (`Concluido`, `Agora`,
/// `Ainda nao`), e nao so um icone colorido. Isso resolve dois problemas de
/// uma vez:
///
/// - **leitor de tela**: cada passo e um no de semantica unico, anunciado como
///   `<nome do passo>, <situacao>`. Os icones ficam FORA da arvore
///   (`ExcludeSemantics`), senao o leitor anunciaria o nome do icone antes do
///   rotulo e repetiria a informacao;
/// - **quem nao distingue as cores** (WCAG 1.4.1): a situacao nunca esta so no
///   verde, no carmim ou no cinza -- ela esta escrita.
///
/// O numero do pedido e o codigo de rastreio sao [SelectableText]: sem isso a
/// pessoa nao consegue copiar o valor para pedir ajuda, e um identificador que
/// nao sai da tela nao serve para nada. Cada um tem tambem um botao de copiar.
class AcompanhamentoDoPedido extends StatelessWidget {
  const AcompanhamentoDoPedido({super.key, required this.pedido});

  final PedidoDePlaquinha pedido;

  /// A ilustracao da propria plaquinha, no maximo 144 dp de altura.
  ///
  /// O numero nao e inventado: o arquivo e dimensionado para 432 px = 144 x 3
  /// (ver `pubspec.yaml`), e pintar maior do que isso esticaria a arte.
  static const double alturaDaIlustracao = BichuEspaco.e16 * 2.25;

  static const String caminhoDaIlustracao =
      'assets/ilustracoes/plaquinha-da-coleira.webp';

  @override
  Widget build(BuildContext context) {
    final cores = BichuColors.of(context).cores;
    final textos = Theme.of(context).textTheme;
    final passos = _PassoDoPedido.de(pedido.status, pedido.passoDaEntrega);

    return Column(
      crossAxisAlignment: CrossAxisAlignment.stretch,
      children: <Widget>[
        // DECORATIVA: o texto logo abaixo diz o estado do pedido, e descrever
        // a plaquinha aqui custaria um anuncio inteiro sem mudar nada do que a
        // pessoa faz. Mesmo criterio da ilustracao da tela de entrar.
        Center(
          child: Image.asset(
            caminhoDaIlustracao,
            height: alturaDaIlustracao,
            fit: BoxFit.contain,
            excludeFromSemantics: true,
            filterQuality: FilterQuality.medium,
          ),
        ),
        const SizedBox(height: BichuEspaco.e4),
        Semantics(
          header: true,
          child: Text(
            _TextosDoAcompanhamento.tituloDe(pedido.status, pedido.passoDaEntrega),
            style: textos.titleLarge,
            textAlign: TextAlign.center,
          ),
        ),
        const SizedBox(height: BichuEspaco.e6),

        // O NUMERO DO PEDIDO. So aparece quando o servidor mandou um: o app
        // nunca inventa identificador, e um bloco vazio seria pior que nenhum.
        if (pedido.ref.isNotEmpty)
          _ValorCopiavel(
            rotulo: _TextosDoAcompanhamento.numeroDoPedido,
            valor: pedido.ref,
          ),

        // O CODIGO DE RASTREIO, **so quando existe**. Desde 18/10/2026 ele vem
        // PREENCHIDO quando ha despacho com rastreio: a `20261018000004` criou
        // a coluna e a tela de entrega do painel a escreve. Nulo continua sendo
        // o caso comum (entrega em maos, correio simples, pedido que nao saiu)
        // e este bloco nao nasce -- campo de rastreio vazio faz a pessoa
        // procurar um numero que nao existe.
        if (pedido.codigoDeRastreio != null) ...<Widget>[
          const SizedBox(height: BichuEspaco.e3),
          _ValorCopiavel(
            rotulo: _TextosDoAcompanhamento.codigoDeRastreio,
            valor: pedido.codigoDeRastreio!,
          ),
        ],

        const SizedBox(height: BichuEspaco.e6),
        // `ListView` nao: esta lista tem tres itens e vive dentro de uma
        // coluna que ja rola. Uma rolagem dentro da outra e o defeito classico.
        Column(
          crossAxisAlignment: CrossAxisAlignment.stretch,
          children: <Widget>[
            for (final passo in passos)
              _LinhaDoPasso(
                passo: passo,
                ultimo: passo == passos.last,
                cores: cores,
                textos: textos,
              ),
          ],
        ),
      ],
    );
  }
}

/// A situacao de um passo. **Tres valores e nao um booleano**: "ja passou",
/// "e aqui que o pedido esta" e "ainda nao aconteceu" sao tres coisas, e
/// espremer em dois faria o passo atual parecer concluido ou parecer futuro.
enum SituacaoDoPasso { concluido, agora, aindaNao, recusado }

/// Um passo desenhado na tela.
@immutable
class _PassoDoPedido {
  const _PassoDoPedido({
    required this.rotulo,
    required this.icone,
    required this.situacao,
  });

  final String rotulo;
  final IconData icone;
  final SituacaoDoPasso situacao;

  /// Os passos, desenhados a partir do **EIXO DA ENTREGA** (`delivery_state`).
  ///
  /// Esta funcao e a unica tradutora de situacao em tela, e e de proposito:
  /// espalhar o `switch` por varios widgets e como dois deles passam a
  /// discordar sobre o mesmo pedido.
  ///
  /// **COSTURA DA MESCLA DE 18/10/2026, e e o ponto todo desta funcao.** Ela
  /// desenhava o trilho a partir de `status` -- `pending`/`fulfilled`/
  /// `declined` --, porque quando foi escrita nao havia eixo de entrega e o
  /// cabecalho deste arquivo dizia que um quarto passo "seria a tela
  /// prometendo um rastreio que ninguem alimenta". A frente do painel criou o
  /// eixo (`delivery_state`, com `requested`/`in_transit`/`arrived`), a coluna
  /// `tracking_code` e a tela que a preenche. Entao:
  ///
  /// - `status` continua respondendo por UMA coisa: se o pedido foi RECUSADO.
  ///   Essa e a decisao do painel, e ela nao tem passo de entrega.
  /// - todo o resto do trilho vem de `delivery_state`. Desenhar `fulfilled`
  ///   como "Enviada, concluido" era o defeito: atender nao e despachar, e a
  ///   pessoa via "Enviada" no instante em que alguem clicou em "atender",
  ///   dias antes de a plaquinha sair.
  ///
  /// Os eixos nao sao independentes, e o banco e quem garante: o `CHECK`
  /// `collar_tag_requests_entrega_exige_atendimento` proibe sair de
  /// `requested` sem o pedido estar `fulfilled`. Por isso recusado-que-chegou
  /// nao existe, e o ramo de `declined` pode vir primeiro sem perder caso.
  ///
  /// **O desconhecido tem ramo proprio.** Se o painel ganhar um passo novo e
  /// esta versao do app nao o conhecer, ela mostra o pedido EM ANDAMENTO em vez
  /// de quebrar ou de afirmar que ele acabou. Chutar `concluido` faria um app
  /// velho dizer que a plaquinha chegou quando ela nao chegou.
  static List<_PassoDoPedido> de(String status, String passoDaEntrega) {
    // A RECUSA vem primeiro e nao olha a entrega: nada sera enviado, e um
    // trilho de entrega sob um pedido recusado prometeria uma encomenda.
    if (status == 'declined') {
      return const <_PassoDoPedido>[
        _PassoDoPedido(
          rotulo: _TextosDoAcompanhamento.pedidoFeito,
          icone: Icons.check_circle,
          situacao: SituacaoDoPasso.concluido,
        ),
        _PassoDoPedido(
          rotulo: _TextosDoAcompanhamento.recusado,
          icone: Icons.do_not_disturb_on,
          situacao: SituacaoDoPasso.recusado,
        ),
      ];
    }

    switch (passoDaEntrega) {
      case 'arrived':
        return const <_PassoDoPedido>[
          _PassoDoPedido(
            rotulo: _TextosDoAcompanhamento.pedidoFeito,
            icone: Icons.check_circle,
            situacao: SituacaoDoPasso.concluido,
          ),
          _PassoDoPedido(
            rotulo: _TextosDoAcompanhamento.emPreparacao,
            icone: Icons.inventory_2,
            situacao: SituacaoDoPasso.concluido,
          ),
          _PassoDoPedido(
            rotulo: _TextosDoAcompanhamento.enviada,
            icone: Icons.local_shipping,
            situacao: SituacaoDoPasso.concluido,
          ),
          _PassoDoPedido(
            rotulo: _TextosDoAcompanhamento.chegou,
            icone: Icons.where_to_vote,
            situacao: SituacaoDoPasso.concluido,
          ),
        ];
      case 'in_transit':
        return const <_PassoDoPedido>[
          _PassoDoPedido(
            rotulo: _TextosDoAcompanhamento.pedidoFeito,
            icone: Icons.check_circle,
            situacao: SituacaoDoPasso.concluido,
          ),
          _PassoDoPedido(
            rotulo: _TextosDoAcompanhamento.emPreparacao,
            icone: Icons.inventory_2,
            situacao: SituacaoDoPasso.concluido,
          ),
          _PassoDoPedido(
            rotulo: _TextosDoAcompanhamento.enviada,
            icone: Icons.local_shipping,
            situacao: SituacaoDoPasso.agora,
          ),
          _PassoDoPedido(
            rotulo: _TextosDoAcompanhamento.chegou,
            icone: Icons.where_to_vote,
            situacao: SituacaoDoPasso.aindaNao,
          ),
        ];
      case 'requested':
      default:
        return const <_PassoDoPedido>[
          _PassoDoPedido(
            rotulo: _TextosDoAcompanhamento.pedidoFeito,
            icone: Icons.check_circle,
            situacao: SituacaoDoPasso.concluido,
          ),
          _PassoDoPedido(
            rotulo: _TextosDoAcompanhamento.emPreparacao,
            icone: Icons.inventory_2,
            situacao: SituacaoDoPasso.agora,
          ),
          _PassoDoPedido(
            rotulo: _TextosDoAcompanhamento.enviada,
            icone: Icons.local_shipping,
            situacao: SituacaoDoPasso.aindaNao,
          ),
          _PassoDoPedido(
            rotulo: _TextosDoAcompanhamento.chegou,
            icone: Icons.where_to_vote,
            situacao: SituacaoDoPasso.aindaNao,
          ),
        ];
    }
  }
}

/// Uma linha do trilho: marcador, trilho e texto.
class _LinhaDoPasso extends StatelessWidget {
  const _LinhaDoPasso({
    required this.passo,
    required this.ultimo,
    required this.cores,
    required this.textos,
  });

  final _PassoDoPedido passo;
  final bool ultimo;
  final BichuCores cores;
  final TextTheme textos;

  /// O diametro do marcador. Multiplo do passo de espaco do tema.
  static const double _marcador = BichuEspaco.e10;

  Color get _tinta => switch (passo.situacao) {
        SituacaoDoPasso.concluido => cores.success,
        SituacaoDoPasso.agora => cores.primary,
        SituacaoDoPasso.recusado => cores.primary,
        SituacaoDoPasso.aindaNao => cores.onDisabled,
      };

  @override
  Widget build(BuildContext context) {
    final concluido = passo.situacao == SituacaoDoPasso.concluido;
    final situacao = _TextosDoAcompanhamento.situacaoDe(passo.situacao);

    return Semantics(
      // UM no por passo, com nome E situacao. O icone nao diz o estado, e a
      // cor tambem nao: quem ouve a tela precisa da frase inteira.
      label: '${passo.rotulo}, $situacao',
      child: ExcludeSemantics(
        child: IntrinsicHeight(
          child: Row(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: <Widget>[
              Column(
                children: <Widget>[
                  Container(
                    width: _marcador,
                    height: _marcador,
                    decoration: BoxDecoration(
                      shape: BoxShape.circle,
                      color: concluido ? cores.success : cores.surface,
                      border: Border.all(
                        color: passo.situacao == SituacaoDoPasso.aindaNao
                            ? cores.outline
                            : _tinta,
                        width: 2,
                      ),
                    ),
                    child: Icon(
                      passo.icone,
                      size: BichuEspaco.e5,
                      color: concluido ? cores.onPrimary : _tinta,
                    ),
                  ),
                  // O trilho ate o proximo marcador. Verde quando o passo ja
                  // aconteceu: e o caminho que o pedido percorreu.
                  if (!ultimo)
                    Expanded(
                      child: Container(
                        width: 2,
                        margin: const EdgeInsets.symmetric(
                          vertical: BichuEspaco.e1,
                        ),
                        color: concluido ? cores.success : cores.outline,
                      ),
                    ),
                ],
              ),
              const SizedBox(width: BichuEspaco.e3),
              Expanded(
                child: Padding(
                  padding: const EdgeInsets.only(bottom: BichuEspaco.e6),
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: <Widget>[
                      Text(
                        passo.rotulo,
                        style: textos.bodyLarge?.copyWith(
                          fontWeight: passo.situacao == SituacaoDoPasso.aindaNao
                              ? FontWeight.w500
                              : FontWeight.w600,
                          color: passo.situacao == SituacaoDoPasso.aindaNao
                              ? cores.onDisabled
                              : cores.textPrimary,
                        ),
                      ),
                      Text(
                        situacao,
                        style: textos.bodySmall?.copyWith(color: _tinta),
                      ),
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

/// Um valor que a pessoa precisa conseguir LEVAR daqui.
///
/// [SelectableText] e nao [Text]: um identificador que nao se copia nao serve
/// para pedir ajuda sobre o pedido. O botao de copiar existe porque selecionar
/// texto em celular e trabalhoso, e nao para substituir a selecao.
class _ValorCopiavel extends StatelessWidget {
  const _ValorCopiavel({required this.rotulo, required this.valor});

  final String rotulo;
  final String valor;

  @override
  Widget build(BuildContext context) {
    final cores = BichuColors.of(context).cores;
    final textos = Theme.of(context).textTheme;

    return Container(
      padding: const EdgeInsets.all(BichuEspaco.e3),
      decoration: BoxDecoration(
        color: cores.surfaceSunken,
        borderRadius: BorderRadius.circular(BichuRaio.md),
        border: Border.all(color: cores.outline),
      ),
      child: Row(
        children: <Widget>[
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: <Widget>[
                Text(
                  rotulo,
                  style: textos.bodySmall?.copyWith(color: cores.textSecondary),
                ),
                SelectableText(
                  valor,
                  style: textos.bodyLarge?.copyWith(
                    fontWeight: FontWeight.w600,
                    // O identificador e opaco: digitos e letras que so se
                    // distinguem com largura fixa. `l`, `I` e `1` numa fonte
                    // proporcional viram o mesmo risco.
                    fontFamily: 'monospace',
                  ),
                ),
              ],
            ),
          ),
          IconButton(
            // O rotulo diz O QUE copia, e nao so "copiar": quem ouve a tela
            // encontra dois botoes iguais quando ha rastreio.
            tooltip: _TextosDoAcompanhamento.copiar(rotulo),
            onPressed: () => _copiar(context),
            icon: const Icon(Icons.copy),
          ),
        ],
      ),
    );
  }

  void _copiar(BuildContext context) {
    Clipboard.setData(ClipboardData(text: valor));
    final mensageiro = ScaffoldMessenger.maybeOf(context);
    mensageiro?.showSnackBar(
      SnackBar(content: Text(_TextosDoAcompanhamento.copiado(rotulo))),
    );
  }
}

/// Os textos do acompanhamento.
///
/// **Curtos de proposito.** Nao ha paragrafo explicativo, nao ha promessa de
/// prazo e nao ha aviso sobre entrega: prazo e entrega dependem de decisao que
/// nao foi tomada, e prometer aqui o que ninguem decidiu e pior que calar.
abstract final class _TextosDoAcompanhamento {
  static const String pedidoFeito = 'Pedido feito';
  static const String emPreparacao = 'Em preparação';
  static const String enviada = 'Enviada';
  /// O QUARTO PASSO, que entrou em 18/10/2026 com o eixo da entrega. Ate
  /// entao o trilho parava em `Enviada` porque nada alimentava "chegou".
  static const String chegou = 'Chegou';
  static const String recusado = 'Pedido recusado';

  static const String numeroDoPedido = 'Número do pedido';
  static const String codigoDeRastreio = 'Código de rastreio';

  static String copiar(String o) => 'Copiar $o';
  static String copiado(String o) => '$o copiado.';

  /// O titulo. A RECUSA vem do `status`; o resto vem do EIXO DA ENTREGA.
  ///
  /// COSTURA DA MESCLA 18/10: dizia "Plaquinha enviada" para `fulfilled`, o
  /// que era falso enquanto a encomenda nao saia -- atender nao e despachar.
  static String tituloDe(String status, String passoDaEntrega) {
    if (status == 'declined') return recusado;
    return switch (passoDaEntrega) {
      'arrived' => 'Plaquinha entregue',
      'in_transit' => 'Plaquinha enviada',
      _ => pedidoFeito,
    };
  }

  /// A situacao **escrita**, que e o que torna o passo legivel sem a cor e
  /// sem o icone.
  static String situacaoDe(SituacaoDoPasso situacao) => switch (situacao) {
        SituacaoDoPasso.concluido => 'Concluído',
        SituacaoDoPasso.agora => 'Agora',
        SituacaoDoPasso.aindaNao => 'Ainda não',
        SituacaoDoPasso.recusado => 'Nada será enviado',
      };
}
