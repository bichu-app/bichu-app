import 'package:flutter/material.dart';

import '../../api/cache_de_imagens.dart';
import '../../api/modelos_perdido.dart';
import '../../theme/bichu_colors.dart';
import '../../theme/bichu_tokens.g.dart';
import '../../widgets/imagem_da_rede.dart';
import '../../widgets/moldura.dart';

/// O cartão da **listagem pública de perdidos** — a variante `lista` do
/// parágrafo 11.3 com os dois slots que `CartaoDePet` deliberadamente não
/// desenha.
class CartaoDoPerdido extends StatelessWidget {
  const CartaoDoPerdido({
    required this.perdido,
    required this.agora,
    super.key,
    this.aoTocar,
  });

  final PerdidoPublico perdido;

  /// O instante de referência das frases relativas.
  final DateTime agora;

  final VoidCallback? aoTocar;

  /// O toque QUE VALE: [aoTocar], **menos o do pet que já voltou**.
  VoidCallback? get _toqueQueVale =>
      perdido.encontradoPelaComunidade ? null : aoTocar;

  /// O selo. Uma palavra, e ela entra no rótulo acessível **por texto**: quem
  /// usa leitor de tela não recebe a cor da borda.
  static const String selo = 'Perdido';

  /// O SELO do pet que voltou **pela comunidade** (cliente, 20/10/2026).
  static const String seloDoReencontro = 'Encontrado pela comunidade';

  /// O selo deste item: o do reencontro quando o servidor o marcou, e o de
  /// perdido em todo o resto.
  static String seloDe(PerdidoPublico p) =>
      p.encontradoPelaComunidade ? seloDoReencontro : selo;

  /// O texto do [rotuloDaArea] nulo.
  static const String semRegiao = 'Região não informada';

  /// A linha de atributos, separada por " · " como o 11.3 manda.
  static String atributosDe(PerdidoPublico p) {
    final partes = <String>[
      p.especie.rotulo,
      if (p.racaRotulo != null && p.racaRotulo!.isNotEmpty) p.racaRotulo!,
      p.porte.rotulo,
      if (p.cor != null && p.cor!.isNotEmpty) p.cor!,
    ];
    return partes.join(' · ');
  }

  /// `Visto por último ...`, relativo quando é recente e com data quando não é.
  static String vistoPorUltimo(DateTime quando, DateTime agora) {
    final dias = _diasDeDiferenca(quando.toLocal(), agora.toLocal());
    final frase = switch (dias) {
      <= 0 => 'hoje',
      1 => 'ontem',
      < 7 => 'há $dias dias',
      _ => 'em ${_comoData(quando)}',
    };
    return 'Visto por último $frase';
  }

  /// Dias de calendário entre os dois, no fuso de quem lê.
  static int _diasDeDiferenca(DateTime quando, DateTime agora) {
    final a = DateTime(quando.year, quando.month, quando.day);
    final b = DateTime(agora.year, agora.month, agora.day);
    return b.difference(a).inDays;
  }

  /// `dd/mm/aaaa`, no fuso de quem lê.
  static String _comoData(DateTime quando) {
    final local = quando.toLocal();
    final dia = local.day.toString().padLeft(2, '0');
    final mes = local.month.toString().padLeft(2, '0');
    return '$dia/$mes/${local.year}';
  }

  /// O nome acessível do cartão inteiro, na ordem em que a tela lê.
  static String rotuloAcessivelDe(PerdidoPublico p, DateTime agora) {
    return <String>[
      seloDe(p),
      p.nome,
      atributosDe(p),
      p.rotuloDaArea ?? semRegiao,
      vistoPorUltimo(p.vistoPorUltimoEm, agora),
    ].where((parte) => parte.isNotEmpty).join(', ');
  }

  @override
  Widget build(BuildContext context) {
    final cores = BichuColors.of(context).cores;
    final textos = Theme.of(context).textTheme;
    final url = perdido.urlDaFoto;

    final conteudo = Container(
      padding: const EdgeInsets.all(BichuEspaco.e4),
      decoration: BoxDecoration(
        color: cores.surface,
        borderRadius: BorderRadius.circular(BichuRaio.lg),
        border: Border.all(color: cores.outline, width: BichuBorda.hairline),
      ),
      child: Row(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: <Widget>[
          if (url == null || url.isEmpty)
            const Moldura(largura: BichuMoldura.larguraFotoSm)
          else
            Moldura(
              largura: BichuMoldura.larguraFotoSm,
              estado: EstadoDaMoldura.repouso,
              filho: ImagemDaRede(
                url: url,
                descricao: null,
                largura: BichuMoldura.larguraFotoSm,
                proporcao: 1 / BichuMoldura.proporcao,
                raio: BichuRaio.none,
                cache: ChaveDeImagem.publica(url),
                simboloDeFalha: Icons.pets_outlined,
              ),
            ),
          const SizedBox(width: BichuEspaco.e4),
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: <Widget>[
                _Selo(
                  texto: seloDe(perdido),
                  doReencontro: perdido.encontradoPelaComunidade,
                ),
                const SizedBox(height: BichuEspaco.e2),
                Text(perdido.nome, style: textos.titleMedium),
                const SizedBox(height: BichuEspaco.e1),
                Text(
                  atributosDe(perdido),
                  style: textos.bodySmall?.copyWith(color: cores.textSecondary),
                ),
                const SizedBox(height: BichuEspaco.e2),
                _Linha(
                  icone: Icons.place_outlined,
                  texto: perdido.rotuloDaArea ?? semRegiao,
                ),
                const SizedBox(height: BichuEspaco.e1),
                _Linha(
                  icone: Icons.schedule_outlined,
                  texto: vistoPorUltimo(perdido.vistoPorUltimoEm, agora),
                ),
              ],
            ),
          ),
        ],
      ),
    );

    final toque = _toqueQueVale;
    return Semantics(
      container: true,
      excludeSemantics: true,
      label: rotuloAcessivelDe(perdido, agora),
      button: toque != null,
      child: toque == null
          ? conteudo
          : InkWell(
              onTap: toque,
              borderRadius: BorderRadius.circular(BichuRaio.lg),
              child: conteudo,
            ),
    );
  }
}

class _Selo extends StatelessWidget {
  const _Selo({required this.texto, this.doReencontro = false});

  final String texto;

  /// Qual das duas tintas. O chip e o MESMO componente nos dois estados: dois
  /// widgets para o mesmo papel divergem no dia em que alguem mexe num so.
  final bool doReencontro;

  @override
  Widget build(BuildContext context) {
    final cores = BichuColors.of(context).cores;
    final fundo = doReencontro ? cores.successContainer : cores.primaryContainer;
    final tinta = doReencontro ? cores.textPrimary : cores.onPrimaryContainer;
    return Container(
      padding: const EdgeInsets.symmetric(
        horizontal: BichuEspaco.e2,
        vertical: BichuEspaco.e1,
      ),
      decoration: BoxDecoration(
        color: fundo,
        borderRadius: BorderRadius.circular(BichuRaio.full),
      ),
      child: Text(
        texto,
        style: Theme.of(context).textTheme.labelSmall?.copyWith(color: tinta),
      ),
    );
  }
}

class _Linha extends StatelessWidget {
  const _Linha({required this.icone, required this.texto});

  final IconData icone;
  final String texto;

  @override
  Widget build(BuildContext context) {
    final cores = BichuColors.of(context).cores;
    return Row(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: <Widget>[
        Icon(icone, size: BichuEspaco.e4, color: cores.textSecondary),
        const SizedBox(width: BichuEspaco.e1),
        Expanded(
          child: Text(
            texto,
            style: Theme.of(context)
                .textTheme
                .bodySmall
                ?.copyWith(color: cores.textSecondary),
          ),
        ),
      ],
    );
  }
}
