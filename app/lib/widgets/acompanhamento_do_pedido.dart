import 'package:flutter/material.dart';
import 'package:flutter/services.dart';

import '../api/modelos_pet.dart';
import '../theme/bichu_colors.dart';
import '../theme/bichu_tokens.g.dart';

/// O acompanhamento de UM pedido da plaquinha: a ilustracao, o numero do pedido
/// e os passos.
class AcompanhamentoDoPedido extends StatelessWidget {
  const AcompanhamentoDoPedido({super.key, required this.pedido});

  final PedidoDePlaquinha pedido;

  /// A ilustracao da propria plaquinha, no maximo 144 dp de altura.
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

        if (pedido.ref.isNotEmpty)
          _ValorCopiavel(
            rotulo: _TextosDoAcompanhamento.numeroDoPedido,
            valor: pedido.ref,
          ),

        if (pedido.codigoDeRastreio != null) ...<Widget>[
          const SizedBox(height: BichuEspaco.e3),
          _ValorCopiavel(
            rotulo: _TextosDoAcompanhamento.codigoDeRastreio,
            valor: pedido.codigoDeRastreio!,
          ),
        ],

        const SizedBox(height: BichuEspaco.e6),
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

/// A situacao de um passo. **Tres valores e nao um booleano**: "ja passou", "e
/// aqui que o pedido esta" e "ainda nao aconteceu" sao tres coisas, e espremer
/// em dois faria o passo atual parecer concluido ou parecer futuro.
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
  static List<_PassoDoPedido> de(String status, String passoDaEntrega) {
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
                    fontFamily: 'monospace',
                  ),
                ),
              ],
            ),
          ),
          IconButton(
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
abstract final class _TextosDoAcompanhamento {
  static const String pedidoFeito = 'Pedido feito';
  static const String emPreparacao = 'Em preparação';
  static const String enviada = 'Enviada';
  /// O QUARTO PASSO, que entrou em 18/10/2026 com o eixo da entrega.
  static const String chegou = 'Chegou';
  static const String recusado = 'Pedido recusado';

  static const String numeroDoPedido = 'Número do pedido';
  static const String codigoDeRastreio = 'Código de rastreio';

  static String copiar(String o) => 'Copiar $o';
  static String copiado(String o) => '$o copiado.';

  /// O titulo. A RECUSA vem do `status`; o resto vem do EIXO DA ENTREGA.
  static String tituloDe(String status, String passoDaEntrega) {
    if (status == 'declined') return recusado;
    return switch (passoDaEntrega) {
      'arrived' => 'Plaquinha entregue',
      'in_transit' => 'Plaquinha enviada',
      _ => pedidoFeito,
    };
  }

  /// A situacao **escrita**, que e o que torna o passo legivel sem a cor e sem
  /// o icone.
  static String situacaoDe(SituacaoDoPasso situacao) => switch (situacao) {
        SituacaoDoPasso.concluido => 'Concluído',
        SituacaoDoPasso.agora => 'Agora',
        SituacaoDoPasso.aindaNao => 'Ainda não',
        SituacaoDoPasso.recusado => 'Nada será enviado',
      };
}
