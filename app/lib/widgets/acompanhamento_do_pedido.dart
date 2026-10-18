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
/// O banco guarda **tres** situacoes para o pedido (`collar_tag_requests.
/// status`): `pending`, `fulfilled` e `declined`. **Nao existe "em
/// transporte" e nao existe "chegou"** -- nao ha coluna para eles, nao ha
/// quem os escreva e nao ha codigo de rastreio gravado em lugar nenhum.
///
/// Por isso os passos sao TRES e o ultimo e `Enviada`, que e exatamente o que
/// `fulfilled` quer dizer ("a plaquinha saiu"). **Um quarto passo `Chegou`
/// seria a tela prometendo um rastreio que ninguem alimenta**, e o pedido
/// ficaria parado nele para sempre -- o defeito e pior do que nao ter o
/// passo, porque a pessoa fica esperando uma mudanca que nao vem.
///
/// Quando a fila do painel ganhar os estados de entrega e o codigo de
/// rastreio, [_PassoDoPedido.de] e o unico lugar a mudar, e
/// [PedidoDePlaquinha.codigoDeRastreio] ja chega desenhado.
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
    final passos = _PassoDoPedido.de(pedido.status);

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
            _TextosDoAcompanhamento.tituloDe(pedido.status),
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

        // O CODIGO DE RASTREIO, **so quando existe**. Hoje o servidor sempre o
        // manda nulo (nao ha coluna nem escrita), entao este bloco nao nasce --
        // e e isso que se quer: campo de rastreio vazio faz a pessoa procurar
        // um numero que nao existe.
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

  /// Os passos que correspondem ao `status` **que o servidor informou**.
  ///
  /// Esta funcao e a unica tradutora de situacao em tela, e e de proposito:
  /// espalhar o `switch` por varios widgets e como dois deles passam a
  /// discordar sobre o mesmo pedido.
  ///
  /// **O desconhecido tem ramo proprio.** Se a fila do painel ganhar um estado
  /// novo (entrega, por exemplo) e esta versao do app nao o conhecer, ela
  /// mostra o pedido em andamento em vez de quebrar ou de afirmar que ele
  /// acabou. Chutar `concluido` faria um app velho dizer que a plaquinha
  /// chegou quando ela nao chegou.
  static List<_PassoDoPedido> de(String status) {
    switch (status) {
      case 'declined':
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
      case 'fulfilled':
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
        ];
      case 'pending':
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
  static const String recusado = 'Pedido recusado';

  static const String numeroDoPedido = 'Número do pedido';
  static const String codigoDeRastreio = 'Código de rastreio';

  static String copiar(String o) => 'Copiar $o';
  static String copiado(String o) => '$o copiado.';

  /// O titulo, pelo `status` que o servidor informou.
  static String tituloDe(String status) => switch (status) {
        'fulfilled' => 'Plaquinha enviada',
        'declined' => recusado,
        _ => pedidoFeito,
      };

  /// A situacao **escrita**, que e o que torna o passo legivel sem a cor e
  /// sem o icone.
  static String situacaoDe(SituacaoDoPasso situacao) => switch (situacao) {
        SituacaoDoPasso.concluido => 'Concluído',
        SituacaoDoPasso.agora => 'Agora',
        SituacaoDoPasso.aindaNao => 'Ainda não',
        SituacaoDoPasso.recusado => 'Nada será enviado',
      };
}
