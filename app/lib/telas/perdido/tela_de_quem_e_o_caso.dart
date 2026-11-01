import 'package:flutter/material.dart';
import 'package:go_router/go_router.dart';

import '../../api/modelos_pet.dart';
import '../../perdido/rascunho_do_caso.dart';
import '../../roteamento/rotas.dart';
import '../../theme/bichu_colors.dart';
import '../../theme/bichu_tokens.g.dart';
import '../../widgets/barra_de_acao_fixa.dart';
import '../../widgets/botao_primario.dart';
import '../../widgets/faixa_de_aviso.dart';
import '../../widgets/grupo_de_opcoes.dart';
import '../../widgets/saida_da_tela.dart';

/// **F3.0 — De quem é o caso.** O passo que só existe quando há escolha.
class TelaDeQuemEOCaso extends StatefulWidget {
  const TelaDeQuemEOCaso({required this.pets, super.key});

  /// Os pets da conta, como `GET /pets` os devolveu.
  final List<Pet> pets;

  static const String titulo = 'Marcar como perdido';

  static const String pergunta = 'De quem é o caso?';

  static const String rotuloDeContinuar = 'Continuar';

  /// O motivo visível do botão desabilitado, na mesma disciplina do critério 5
  /// de F3.1: desabilitar sem dizer por quê é desenho preguiçoso.
  static const String semEscolha = 'Escolha de quem é o caso.';

  /// Critério 13, dito em texto.
  static const String jaProcurado =
      'Já está sendo procurado. Você abriu esse caso antes, e ele continua '
      'aberto.';

  /// Se este pet **já está sendo procurado**, pelos DOIS campos da ficha.
  static bool jaProcuradoPeloPar(Pet p) =>
      p.status == StatusDoPet.perdido || p.idDoCasoAberto != null;

  /// Os pets que **podem** receber um caso novo.
  static List<Pet> elegiveis(List<Pet> pets) =>
      pets.where((p) => !jaProcuradoPeloPar(p)).toList(growable: false);

  /// Os que já têm caso aberto.
  static List<Pet> jaPerdidos(List<Pet> pets) =>
      pets.where(jaProcuradoPeloPar).toList(growable: false);

  @override
  State<TelaDeQuemEOCaso> createState() => _TelaDeQuemEOCasoState();
}

class _TelaDeQuemEOCasoState extends State<TelaDeQuemEOCaso> {
  String? _escolhido;

  void _continuar(List<Pet> elegiveis) {
    final id = _escolhido;
    if (id == null) return;
    for (final pet in elegiveis) {
      if (pet.id == id) {
        context.push(
          Rotas.marcarPerdido,
          extra: RascunhoDoCaso(pet: pet),
        );
        return;
      }
    }
  }

  @override
  Widget build(BuildContext context) {
    final cores = BichuColors.of(context).cores;
    final textos = Theme.of(context).textTheme;
    final elegiveis = TelaDeQuemEOCaso.elegiveis(widget.pets);
    final jaPerdidos = TelaDeQuemEOCaso.jaPerdidos(widget.pets);
    final semEscolha = _escolhido == null;

    return Scaffold(
      appBar: const BarraDeConta(
        titulo: TelaDeQuemEOCaso.titulo,
        saida: TipoDeSaida.voltar,
      ),
      body: SafeArea(
        top: false,
        bottom: false,
        child: ListView(
          padding: const EdgeInsets.all(BichuEspaco.e4),
          addSemanticIndexes: false,
          children: <Widget>[
            GrupoDeOpcoes<String>(
              rotulo: TelaDeQuemEOCaso.pergunta,
              selecionado: _escolhido,
              opcoes: <OpcaoDeLinha<String>>[
                for (final pet in elegiveis)
                  OpcaoDeLinha<String>(
                    valor: pet.id,
                    rotulo: pet.nome,
                    detalhe: _atributosDe(pet),
                  ),
              ],
              aoSelecionar: (id) => setState(() => _escolhido = id),
            ),
            for (final pet in jaPerdidos) ...<Widget>[
              const SizedBox(height: BichuEspaco.e4),
              FaixaDeAviso(
                peso: PesoDaFaixa.informativo,
                texto: '${pet.nome}: ${TelaDeQuemEOCaso.jaProcurado}',
              ),
            ],
          ],
        ),
      ),
      bottomNavigationBar: BarraDeAcaoFixa(
        acoes: <Widget>[
          if (semEscolha)
            Padding(
              padding: const EdgeInsets.only(bottom: BichuEspaco.e3),
              child: Semantics(
                liveRegion: true,
                child: Text(
                  TelaDeQuemEOCaso.semEscolha,
                  style: textos.bodyMedium?.copyWith(color: cores.textPrimary),
                ),
              ),
            ),
          BotaoPrimario(
            rotulo: TelaDeQuemEOCaso.rotuloDeContinuar,
            critico: true,
            aoTocar: semEscolha ? null : () => _continuar(elegiveis),
          ),
        ],
      ),
    );
  }
}

String _atributosDe(Pet pet) {
  final partes = <String>[
    pet.especie.rotulo,
    if (pet.racaRotulo != null && pet.racaRotulo!.isNotEmpty) pet.racaRotulo!,
    if (pet.porte != null) pet.porte!.rotulo,
  ];
  return partes.join(' · ');
}
