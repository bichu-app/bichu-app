import 'dart:math' as math;

import 'package:flutter/material.dart';

import '../api/modelos_diretorio.dart';
import '../theme/bichu_colors.dart';
import '../theme/bichu_tokens.g.dart';

/// O glifo que ocupa o lugar da imagem de um inscrito do diretorio **quando nao
/// ha imagem cadastrada**.
IconData glifoDoInscrito({
  AtividadeDoDiretorio? atividade,
  TipoDeEntidade? tipoDeEntidade,
}) {
  if (tipoDeEntidade == TipoDeEntidade.organizacao) {
    return Icons.volunteer_activism_outlined;
  }
  return switch (atividade) {
    AtividadeDoDiretorio.clinic => Icons.local_hospital_outlined,
    AtividadeDoDiretorio.hospital => Icons.emergency_outlined,
    AtividadeDoDiretorio.store => Icons.shopping_basket_outlined,
    AtividadeDoDiretorio.vet => Icons.medical_services_outlined,
    AtividadeDoDiretorio.groomer => Icons.shower_outlined,
    AtividadeDoDiretorio.walker => Icons.directions_walk_outlined,
    AtividadeDoDiretorio.sitter => Icons.supervisor_account_outlined,
    AtividadeDoDiretorio.boarding => Icons.hotel_outlined,
    AtividadeDoDiretorio.daycare => Icons.toys_outlined,
    AtividadeDoDiretorio.trainer => Icons.school_outlined,
    null => glifoDeReservaDoInscrito,
  };
}

/// O glifo de quando o app **nao sabe** o tipo.
const IconData glifoDeReservaDoInscrito = Icons.domain_outlined;

/// O lugar da imagem de um inscrito **sem imagem cadastrada**: o mesmo
/// retangulo que `ImagemDaRede` ocuparia, com o glifo do tipo no meio.
class IconeDoInscrito extends StatelessWidget {
  const IconeDoInscrito({
    required this.atividade,
    required this.tipoDeEntidade,
    super.key,
    this.largura,
    this.proporcao = 1,
    this.raio = BichuRaio.md,
  });

  final AtividadeDoDiretorio? atividade;
  final TipoDeEntidade? tipoDeEntidade;

  /// A largura pintada, em dp.
  final double? largura;

  /// Largura dividida pela altura.
  final double proporcao;

  final double raio;

  @override
  Widget build(BuildContext context) {
    final cores = BichuColors.of(context).cores;

    return LayoutBuilder(
      builder: (context, limites) {
        final double? larguraPintada =
            largura ?? (limites.maxWidth.isFinite ? limites.maxWidth : null);
        if (larguraPintada == null || larguraPintada <= 0) {
          return const SizedBox.shrink();
        }
        final alturaPintada = larguraPintada / proporcao;

        final tamanho = (math.min(larguraPintada, alturaPintada) * 0.4)
            .clamp(BichuEspaco.e5, BichuEspaco.e16)
            .toDouble();

        return ExcludeSemantics(
          child: Container(
            width: larguraPintada,
            height: alturaPintada,
            decoration: BoxDecoration(
              color: cores.surfaceSunken,
              borderRadius: BorderRadius.circular(raio),
            ),
            child: Center(
              child: Icon(
                glifoDoInscrito(
                  atividade: atividade,
                  tipoDeEntidade: tipoDeEntidade,
                ),
                size: tamanho,
                color: cores.textMuted,
              ),
            ),
          ),
        );
      },
    );
  }
}
