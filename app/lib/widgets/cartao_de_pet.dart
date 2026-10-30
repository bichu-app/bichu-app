import 'package:flutter/material.dart';

import '../api/modelos_pet.dart';
import '../theme/bichu_colors.dart';
import '../theme/bichu_tokens.g.dart';
import 'moldura.dart';

/// O cartao de pet do paragrafo 11.3, variante `lista`.
class CartaoDePet extends StatelessWidget {
  const CartaoDePet({
    required this.pet,
    super.key,
    this.aoTocar,
    this.linhaDeAviso,
  });

  final Pet pet;

  /// O toque que leva a T.1, o detalhe do pet.
  final VoidCallback? aoTocar;

  /// O convite de plaquinha do criterio 4 da BICHUS-62.
  static const String convitePlaquinha = 'Ainda sem plaquinha com QR.';

  /// A TERCEIRA POSICAO do aviso persistente de cadastro (BICHUS-75, criterio
  /// 2): "no cartao de cada pet ele aparece como uma linha discreta".
  final String? linhaDeAviso;

  /// A linha de atributos, do jeito que o 11.3 manda: separados por " · ".
  static String atributosDe(Pet pet) {
    final partes = <String>[
      pet.especie.rotulo,
      if (pet.racaRotulo != null && pet.racaRotulo!.isNotEmpty) pet.racaRotulo!,
      if (pet.porte != null) pet.porte!.rotulo,
    ];
    return partes.join(' · ');
  }

  /// Se o selo de perdido se aplica, pelos DOIS campos da ficha.
  static bool procuradoDe(Pet pet) =>
      pet.status == StatusDoPet.perdido || pet.idDoCasoAberto != null;

  /// O nome acessivel do cartao inteiro, na ordem em que a tela le.
  static String rotuloAcessivelDe(Pet pet, {String? linhaDeAviso}) {
    final partes = <String>[
      if (procuradoDe(pet)) 'Perdido',
      pet.nome,
      atributosDe(pet),
      if (pet.semTag) convitePlaquinha,
      if (linhaDeAviso != null && linhaDeAviso.isNotEmpty) linhaDeAviso,
    ];
    return partes.where((p) => p.isNotEmpty).join(', ');
  }

  @override
  Widget build(BuildContext context) {
    final cores = BichuColors.of(context).cores;
    final textos = Theme.of(context).textTheme;
    final perdido = procuradoDe(pet);

    return Semantics(
      container: true,
      button: aoTocar != null,
      onTap: aoTocar,
      label: rotuloAcessivelDe(pet, linhaDeAviso: linhaDeAviso),
      excludeSemantics: true,
      child: ClipRRect(
        borderRadius: BorderRadius.circular(BichuRaio.lg),
        child: DecoratedBox(
          decoration: BoxDecoration(
            color: cores.surface,
            border: Border.all(
              color: cores.outline,
              width: BichuBorda.hairline,
            ),
          ),
          child: Stack(
            children: <Widget>[
              InkWell(
                onTap: aoTocar,
                child: Padding(
                  padding: const EdgeInsets.all(BichuEspaco.e4),
                  child: Row(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: <Widget>[
                      _MolduraDoPet(pet: pet),
                      const SizedBox(width: BichuEspaco.e4),
                      Expanded(
                        child: Column(
                          crossAxisAlignment: CrossAxisAlignment.start,
                          children: <Widget>[
                            if (perdido) ...<Widget>[
                              const _SeloPerdido(),
                              const SizedBox(height: BichuEspaco.e2),
                            ],
                            Text(pet.nome, style: textos.titleMedium),
                            const SizedBox(height: BichuEspaco.e1),
                            Text(
                              atributosDe(pet),
                              style: textos.bodyMedium?.copyWith(
                                color: cores.textSecondary,
                              ),
                            ),
                            if (pet.semTag) ...<Widget>[
                              const SizedBox(height: BichuEspaco.e1),
                              Text(
                                convitePlaquinha,
                                style: textos.bodySmall?.copyWith(
                                  color: cores.textMuted,
                                ),
                              ),
                            ],
                            if (linhaDeAviso != null &&
                                linhaDeAviso!.isNotEmpty) ...<Widget>[
                              const SizedBox(height: BichuEspaco.e1),
                              Text(
                                linhaDeAviso!,
                                style: textos.bodySmall?.copyWith(
                                  color: cores.textMuted,
                                ),
                              ),
                            ],
                          ],
                        ),
                      ),
                    ],
                  ),
                ),
              ),
              if (perdido)
                Positioned(
                  left: 0,
                  top: 0,
                  bottom: 0,
                  width: BichuBorda.thick,
                  child: ColoredBox(color: cores.urgency),
                ),
            ],
          ),
        ),
      ),
    );
  }
}

/// A moldura do cartao, nos tres estados que a lista de fato produz.
class _MolduraDoPet extends StatelessWidget {
  const _MolduraDoPet({required this.pet});

  final Pet pet;

  @override
  Widget build(BuildContext context) {
    final capa = pet.fotoDeCapa;
    if (capa != null) {
      return Moldura(
        largura: BichuMoldura.larguraFotoSm,
        estado: EstadoDaMoldura.repouso,
        filho: Image.network(
          capa.urlDeMiniatura!,
          fit: BoxFit.cover,
          alignment: const Alignment(0, -1 / 3),
          errorBuilder: (context, erro, pilha) =>
              const Moldura(largura: BichuMoldura.larguraFotoSm),
        ),
      );
    }
    return Moldura(
      largura: BichuMoldura.larguraFotoSm,
      estado: pet.temFotoEmProcessamento
          ? EstadoDaMoldura.carregando
          : EstadoDaMoldura.vazio,
    );
  }
}

/// O selo `PERDIDO` do paragrafo 11.5: fundo `urgency`, texto `on-urgency`,
/// `overline` em caixa alta, padding 4 x 8, raio `radius/sm`, icone 16.
class _SeloPerdido extends StatelessWidget {
  const _SeloPerdido();

  @override
  Widget build(BuildContext context) {
    final cores = BichuColors.of(context).cores;
    final textos = Theme.of(context).textTheme;
    return Container(
      padding: const EdgeInsets.symmetric(
        vertical: BichuEspaco.e1,
        horizontal: BichuEspaco.e2,
      ),
      decoration: BoxDecoration(
        color: cores.urgency,
        borderRadius: BorderRadius.circular(BichuRaio.sm),
      ),
      child: Row(
        mainAxisSize: MainAxisSize.min,
        children: <Widget>[
          Icon(Icons.search, size: 16, color: cores.onUrgency),
          const SizedBox(width: BichuEspaco.e1),
          Text(
            'PERDIDO',
            style: textos.labelSmall?.copyWith(color: cores.onUrgency),
          ),
        ],
      ),
    );
  }
}
