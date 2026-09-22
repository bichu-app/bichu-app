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
///
/// ## Por que ela não aparece para quem tem um pet só
///
/// O critério 1 justifica o cabeçalho do pet *"para prevenir o deslize de
/// marcar o pet errado **quando há mais de um**"*. Com um animal cadastrado
/// não há deslize possível, e uma tela de confirmação seria o mesmo atrito que
/// a pesquisa de UX recusa no `Quando?`: *"um seletor de data para 96% dos
/// casos ser 'agora' é atrito puro"*. Quem tem um pet vai direto para F3.1,
/// que já mostra a foto e o nome no topo.
///
/// Quem tem dois ou mais passa por aqui, e a escolha é explícita. **Não há
/// pré-seleção**: um rádio já marcado no primeiro da lista transforma o
/// deslize que o critério 1 quer prevenir num deslize de um toque só.
///
/// ## O que ela NÃO oferece, e por quê
///
/// - **Pet que já está sendo procurado** (critério 13). O teto é de um caso
///   aberto por pet (critério 8), e a tela reflete o teto em vez de deixar a
///   pessoa bater nele: o animal aparece, dito em texto, e **fora do grupo de
///   opções**. Deixá-lo selecionável levaria a um 409 depois de duas telas.
/// - **Pet que não é meu** (critério 12). Esta tela não recebe id nenhum: ela
///   recebe a lista que `GET /pets` devolveu para a sessão em pé, e a trava de
///   dono de `CacheDeMeusPets` é quem garante que essa lista é da conta certa.
///   Não há caminho por onde um id de outra pessoa entre aqui — e é por isso
///   que a tela não tem uma verificação de dono própria: ela seria uma segunda
///   fonte da verdade sobre uma pergunta que o servidor já respondeu.
///
/// ## Rede
///
/// **Nenhuma.** A lista chega pronta de quem abriu a tela, pelo mesmo motivo
/// que F3.1 não chama rede: o critério 6 manda o fluxo inteiro funcionar sem
/// conexão até o envio, e uma chamada aqui criaria um estado de carregamento
/// na porta de entrada do fluxo de quem está no elevador.
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

  /// Os pets que **podem** receber um caso novo.
  static List<Pet> elegiveis(List<Pet> pets) =>
      pets.where((p) => p.status != StatusDoPet.perdido).toList(growable: false);

  /// Os que já têm caso aberto.
  static List<Pet> jaPerdidos(List<Pet> pets) =>
      pets.where((p) => p.status == StatusDoPet.perdido).toList(growable: false);

  @override
  State<TelaDeQuemEOCaso> createState() => _TelaDeQuemEOCasoState();
}

class _TelaDeQuemEOCasoState extends State<TelaDeQuemEOCaso> {
  /// **Nasce nulo, e continua nulo até alguém tocar.** Ver o cabeçalho.
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
            // Os que já têm caso aberto ficam **fora do grupo**: dentro dele
            // seriam opções, e o leitor de tela os anunciaria como escolháveis.
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
          // O MOTIVO ACIMA DO BOTÃO, pela mesma razão de F3.1: a ordem de
          // leitura precisa entregar o motivo antes do controle.
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

/// A linha de atributos do 11.3, com o mesmo separador.
String _atributosDe(Pet pet) {
  final partes = <String>[
    pet.especie.rotulo,
    if (pet.racaRotulo != null && pet.racaRotulo!.isNotEmpty) pet.racaRotulo!,
    if (pet.porte != null) pet.porte!.rotulo,
  ];
  return partes.join(' · ');
}
