import 'package:flutter/material.dart';
import 'package:go_router/go_router.dart';

import '../../api/modelos_caso.dart';
import '../../api/modelos_pet.dart';
import '../../roteamento/rotas.dart';
import '../../theme/bichu_colors.dart';
import '../../theme/bichu_tokens.g.dart';
import '../../widgets/barra_de_acao_fixa.dart';
import '../../widgets/botao_primario.dart';
import '../../widgets/faixa_de_aviso.dart';
import '../../widgets/saida_da_tela.dart';
import 'cabecalho_do_pet.dart';

/// **O que F3.3 recebe, e a distinção que ela não pode perder.**
class ResultadoDaAbertura {
  const ResultadoDaAbertura._({required this.pet, this.caso});

  /// O caso **aconteceu**: o servidor respondeu e devolveu o recurso.
  const ResultadoDaAbertura.aberto({
    required Pet pet,
    required CasoDePerdido caso,
  }) : this._(pet: pet, caso: caso);

  /// A ação está **enfileirada** no aparelho.
  const ResultadoDaAbertura.naFila({required Pet pet}) : this._(pet: pet);

  final Pet pet;

  /// Nulo **exatamente quando** a ação está na fila.
  final CasoDePerdido? caso;

  bool get estaNaFila => caso == null;
}

/// **F3.3 — O caso, depois do toque.**
class TelaCasoAberto extends StatelessWidget {
  const TelaCasoAberto({required this.resultado, super.key});

  final ResultadoDaAbertura resultado;

  /// O título do caso que **existe**.
  static const String tituloAberto = 'O caso está aberto.';

  /// O título do caso que **não existe ainda**, e a frase é sobre a fila e não
  /// sobre o caso.
  static const String tituloNaFila = 'Guardamos o aviso no seu celular.';

  static const String corpoNaFila =
      'Você está sem conexão agora. Assim que o sinal voltar, o Bichu envia o '
      'aviso sozinho — você não precisa fazer nada nem deixar o app aberto.';

  /// O que a tela da fila **promete**, e o que ela não promete.
  static const String avisoDaFila =
      'Ninguém foi avisado ainda, e o link para compartilhar só existe depois '
      'que o aviso sair.';

  static const String rotuloDeVerMeusPets = 'Ver meus pets';

  /// Critério 9: caso aberto **só com área** não tem alerta, e a tela diz por
  /// quê em vez de deixar a seção de alcance vazia.
  static const String semLocalizacao =
      'Este caso não vai ter alerta para a vizinhança: o alerta precisa de um '
      'ponto no mapa para medir os 5 km, e este caso foi aberto só com o '
      'bairro. O que continua funcionando: a lista pública de pets perdidos e '
      'a plaquinha com QR.';

  @override
  Widget build(BuildContext context) {
    final textos = Theme.of(context).textTheme;
    final cores = BichuColors.of(context).cores;
    final caso = resultado.caso;

    return Scaffold(
      appBar: BarraDeConta(
        titulo: resultado.pet.nome,
        saida: TipoDeSaida.fechar,
        escape: Rotas.pets,
      ),
      body: SafeArea(
        top: false,
        bottom: false,
        child: ListView(
          padding: const EdgeInsets.all(BichuEspaco.e4),
          addSemanticIndexes: false,
          children: <Widget>[
            CabecalhoDoPet(pet: resultado.pet),
            const SizedBox(height: BichuEspaco.e6),
            Semantics(
              header: true,
              liveRegion: true,
              child: Text(
                caso == null ? tituloNaFila : tituloAberto,
                style: textos.headlineSmall,
              ),
            ),
            const SizedBox(height: BichuEspaco.e3),
            if (caso == null) ...<Widget>[
              Text(
                corpoNaFila,
                style: textos.bodyLarge?.copyWith(color: cores.textSecondary),
              ),
              const SizedBox(height: BichuEspaco.e6),
              const FaixaDeAviso(
                peso: PesoDaFaixa.informativo,
                texto: avisoDaFila,
              ),
            ] else ...<Widget>[
              _AlcanceDoCaso(caso: caso, nomeDoPet: resultado.pet.nome),
            ],
          ],
        ),
      ),
      bottomNavigationBar: BarraDeAcaoFixa(
        acoes: <Widget>[
          BotaoPrimario(
            rotulo: rotuloDeVerMeusPets,
            critico: true,
            aoTocar: () => context.go(Rotas.perfil),
          ),
        ],
      ),
    );
  }
}

/// O alcance do caso que **existe**, lido do servidor e de mais lugar nenhum.
class _AlcanceDoCaso extends StatelessWidget {
  const _AlcanceDoCaso({required this.caso, required this.nomeDoPet});

  final CasoDePerdido caso;
  final String nomeDoPet;

  /// O texto de cada estado. `queued` e `desconhecido` caem no mesmo ramo de
  /// `unavailable` de propósito: os três significam "não há número para
  /// mostrar".
  String get _texto {
    final alerta = caso.alerta;
    final km = (alerta.raioEmMetros / 1000).round();
    return switch (alerta.estado) {
      EstadoDoAlcance.calculado when (alerta.destinatarios ?? 0) == 0 =>
        'Ainda não temos tutores cadastrados por perto. O caso continua '
            'valendo: $nomeDoPet está na lista de pets perdidos, e quem '
            'escanear a plaquinha chega direto em você.',
      EstadoDoAlcance.calculado =>
        'Avisamos ${alerta.destinatarios} '
            '${alerta.destinatarios == 1 ? 'tutor' : 'tutores'} num raio de '
            '$km km. Eles receberam a foto de $nomeDoPet e os sinais.',
      EstadoDoAlcance.semLocalizacao => TelaCasoAberto.semLocalizacao,
      _ => 'Não conseguimos calcular quantos tutores estão por perto agora. O '
          'alerta vai sair mesmo assim.',
    };
  }

  @override
  Widget build(BuildContext context) {
    final cores = BichuColors.of(context).cores;
    final textos = Theme.of(context).textTheme;

    final texto =
        caso.temLocalizacao ? _texto : TelaCasoAberto.semLocalizacao;

    return Semantics(
      liveRegion: true,
      container: true,
      label: texto,
      excludeSemantics: true,
      child: Text(
        texto,
        style: textos.bodyLarge?.copyWith(color: cores.textSecondary),
      ),
    );
  }
}
