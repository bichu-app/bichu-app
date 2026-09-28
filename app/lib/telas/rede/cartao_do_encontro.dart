import 'package:flutter/material.dart';

import '../../api/modelos_rede.dart';
import '../../theme/bichu_colors.dart';
import '../../theme/bichu_tokens.g.dart';
import 'encontro_da_rede.dart';
import 'pecas_da_rede.dart';

/// O cartao de um encontro na agenda (design system 24.12.3, 24.13.1, 24.16 e
/// 24.17).
///
/// ```
/// [ imagem 16:9 (capa ou banner)                      ]
/// [ SÁB 27 SET ]                        [ situação ]
/// Título
/// (agenda) Sábado, 27 de setembro · Das 9h às 11h
/// (lugar)  Praça Benedito Calixto · Pinheiros
/// A cerca de 1 km da sua região
/// Resumo em duas linhas no máximo
/// [ Gratuito ] [ Privado ]
/// ```
///
/// ## O privado nao aprovado e so titulo e data
///
/// [TeaserDoPrivado] nao tem lugar, capa, horario, resumo nem valor, e o
/// cartao **nao tem de onde tira-los**: o servidor nao manda (P19). A imagem e
/// o banner da marca, a data vem sem hora, e o unico selo e `Privado`, que e o
/// que explica por que o resto sumiu (24.16).
///
/// ## A distancia
///
/// So com [distanciaEmMetros], que so vem de `listNearbyNetworkEvents` (a
/// regiao cadastrada, nunca o GPS). **Nunca em privado** (o teaser nem aceita o
/// parametro), **nunca em encerrado nem em cancelado**.
class CartaoDoEncontro extends StatelessWidget {
  const CartaoDoEncontro({
    required this.encontro,
    super.key,
    this.distanciaEmMetros,
    this.estadoDoPedido,
    this.anoCorrente,
  });

  final EncontroDaRede encontro;

  /// Da regiao cadastrada. Ignorada em privado, encerrado e cancelado.
  final int? distanciaEmMetros;

  /// So em `Meus pedidos`: a pilula `Pedido enviado` / `Pedido aprovado`.
  final EstadoDoPedido? estadoDoPedido;

  /// Para testes; nulo usa o ano do relogio (so formato, nunca situacao).
  final int? anoCorrente;

  /// A distancia que o cartao de fato mostra, ou nula.
  static int? distanciaVisivel(EncontroDaRede encontro, int? metros) {
    if (metros == null) return null;
    if (encontro is! EncontroPublico) return null;
    final s = encontro.situacao;
    if (s == SituacaoDoEncontro.encerrado ||
        s == SituacaoDoEncontro.cancelado) {
      return null;
    }
    return metros;
  }

  /// O nome acessivel: a situacao primeiro, quando houver (`Cancelado:`),
  /// para a lista falada nao anunciar como convite um encontro que nao vai
  /// acontecer (UX 28.6).
  String nomeAcessivel(int ano) {
    final partes = <String>[];
    final situacao = rotuloDaSituacao(encontro.situacao);
    final titulo = situacao == null ? encontro.titulo : '$situacao: ${encontro.titulo}';
    partes.add(titulo);
    final e = encontro;
    switch (e) {
      case EncontroPublico():
        partes.add('${e.dia.dataLonga(anoCorrente: ano)}, ${e.horario.faixa}');
        partes.add(e.lugar.lugarEBairro);
        final d = distanciaVisivel(e, distanciaEmMetros);
        if (d != null) partes.add(DistanciaDaRegiao.falado(d));
        partes.add(e.resumo);
        partes.add(e.entrada.rotuloDoSelo);
      case TeaserDoPrivado():
        partes.add(e.dia.dataLonga(anoCorrente: ano));
        partes.add('Privado');
    }
    final pedido = estadoDoPedido;
    final rotuloDoPedido = pedido?.rotulo;
    if (rotuloDoPedido != null) partes.add(rotuloDoPedido);
    return partes.join('. ');
  }

  @override
  Widget build(BuildContext context) {
    final cores = BichuColors.of(context).cores;
    final textos = Theme.of(context).textTheme;
    final escuro = Theme.of(context).brightness == Brightness.dark;
    final ano = anoCorrente ?? DateTime.now().year;
    final e = encontro;
    final cancelado = e.situacao == SituacaoDoEncontro.cancelado;
    final situacao = e.situacao;
    final distancia = distanciaVisivel(e, distanciaEmMetros);

    final corpo = <Widget>[
      Text(e.titulo, style: textos.titleMedium),
      const SizedBox(height: BichuEspaco.e1),
      _LinhaComIcone(
        icone: Icons.event_outlined,
        texto: switch (e) {
          EncontroPublico() =>
            '${e.dia.dataLonga(anoCorrente: ano)} · ${e.horario.faixa}',
          TeaserDoPrivado() => e.dia.dataLonga(anoCorrente: ano),
        },
      ),
      if (e is EncontroPublico) ...<Widget>[
        const SizedBox(height: BichuEspaco.e1),
        _LinhaComIcone(icone: Icons.place_outlined, texto: e.lugar.lugarEBairro),
        if (distancia != null) ...<Widget>[
          const SizedBox(height: BichuEspaco.e1),
          Text(
            DistanciaDaRegiao.texto(distancia),
            style: textos.bodySmall?.copyWith(color: cores.textSecondary),
          ),
        ],
        const SizedBox(height: BichuEspaco.e1),
        Text(
          e.resumo,
          maxLines: 2,
          overflow: TextOverflow.ellipsis,
          style: textos.bodySmall?.copyWith(color: cores.textSecondary),
        ),
      ],
      const SizedBox(height: BichuEspaco.e2),
      Wrap(
        spacing: BichuEspaco.e2,
        runSpacing: BichuEspaco.e2,
        children: <Widget>[
          if (e is EncontroPublico) seloDeValor(e.entrada),
          if (e is TeaserDoPrivado) seloPrivado,
          if (estadoDoPedido?.rotulo case final String rotulo)
            _PilulaDoPedido(rotulo: rotulo),
        ],
      ),
    ];

    return Semantics(
      button: true,
      label: nomeAcessivel(ano),
      onTap: () => _abrir(context),
      excludeSemantics: true,
      child: Material(
        color: cores.surface,
        borderRadius: BorderRadius.circular(BichuRaio.lg),
        clipBehavior: Clip.antiAlias,
        child: InkWell(
          onTap: () => _abrir(context),
          child: Container(
            decoration: BoxDecoration(
              borderRadius: BorderRadius.circular(BichuRaio.lg),
              border: Border.all(color: cores.outline, width: BichuBorda.hairline),
              boxShadow: escuro ? null : BichuSombra.sm,
            ),
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.stretch,
              children: <Widget>[
                Stack(
                  children: <Widget>[
                    ImagemDoEncontroOuBanner(
                      // O teaser nao tem capa: o banner entra no lugar.
                      url: e is EncontroPublico ? e.urlDaCapa : null,
                      cancelado: cancelado,
                    ),
                    Positioned(
                      left: BichuEspaco.e3,
                      top: BichuEspaco.e3,
                      child: BlocoDoDia(dia: e.dia),
                    ),
                    if (situacao != null && rotuloDaSituacao(situacao) != null)
                      Positioned(
                        right: BichuEspaco.e3,
                        top: BichuEspaco.e3,
                        child: DistintivoDeSituacao(situacao: situacao),
                      ),
                  ],
                ),
                Padding(
                  padding: const EdgeInsets.all(BichuEspaco.e4),
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: corpo,
                  ),
                ),
              ],
            ),
          ),
        ),
      ),
    );
  }

  void _abrir(BuildContext context) {
    TelaDoEncontro.abrir(
      context,
      encontro.slug,
      distanciaEmMetros: distanciaVisivel(encontro, distanciaEmMetros),
    );
  }
}

class _LinhaComIcone extends StatelessWidget {
  const _LinhaComIcone({required this.icone, required this.texto});

  final IconData icone;
  final String texto;

  @override
  Widget build(BuildContext context) {
    final cores = BichuColors.of(context).cores;
    final textos = Theme.of(context).textTheme;
    return Row(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: <Widget>[
        Icon(icone, size: BichuEspaco.e5, color: cores.textSecondary),
        const SizedBox(width: BichuEspaco.e2),
        Expanded(
          child: Text(
            texto,
            style: textos.bodySmall?.copyWith(color: cores.textPrimary),
          ),
        ),
      ],
    );
  }
}

/// A pilula de `Meus pedidos`: `Pedido enviado` ou `Pedido aprovado`.
///
/// **Nao existe pilula de recusa**: o servidor manda `requested` para o
/// recusado, e esta pilula diz `Pedido enviado` nos dois casos (UX 28.7.3).
class _PilulaDoPedido extends StatelessWidget {
  const _PilulaDoPedido({required this.rotulo});

  final String rotulo;

  @override
  Widget build(BuildContext context) {
    final cores = BichuColors.of(context).cores;
    final textos = Theme.of(context).textTheme;
    return Container(
      padding: const EdgeInsets.symmetric(
        horizontal: BichuEspaco.e3,
        vertical: BichuEspaco.e1,
      ),
      decoration: BoxDecoration(
        color: cores.primaryContainer,
        borderRadius: BorderRadius.circular(BichuRaio.full),
      ),
      child: Text(
        rotulo,
        style: textos.labelMedium?.copyWith(color: cores.onPrimaryContainer),
      ),
    );
  }
}
