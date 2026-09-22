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
///
/// Há dois desfechos para o mesmo toque em `Avisar agora`, e eles se parecem
/// na tela e são opostos no mundo:
///
/// - **[aberto]**: o servidor respondeu, o caso existe, tem id, tem link de
///   compartilhar e o alerta ou saiu ou tem um motivo dito para não ter saído.
/// - **[naFila]**: não havia sinal. A ação está gravada no aparelho esperando
///   rede. **Não há caso.** Não há id, não há link, não há cartaz e não há
///   ninguém avisado.
///
/// **O critério 2 da BICHUS-31 proíbe tela de sucesso para o que não
/// aconteceu**, e é por isso que este tipo existe em vez de um `CasoDePerdido?`
/// nulável. Com um nulável, cada `if` da tela seria uma chance nova de alguém
/// escrever "Caso aberto" no título e deixar o resto condicional — a pessoa
/// leria que o alerta saiu, pararia de procurar caminho, e o aparelho ainda
/// estaria no elevador. É a mesma disciplina que fez o leitor de QR parar de
/// fingir câmera.
class ResultadoDaAbertura {
  const ResultadoDaAbertura._({required this.pet, this.caso});

  /// O caso **aconteceu**: o servidor respondeu e devolveu o recurso.
  const ResultadoDaAbertura.aberto({
    required Pet pet,
    required CasoDePerdido caso,
  }) : this._(pet: pet, caso: caso);

  /// A ação está **enfileirada** no aparelho. Não há caso.
  const ResultadoDaAbertura.naFila({required Pet pet}) : this._(pet: pet);

  final Pet pet;

  /// Nulo **exatamente quando** a ação está na fila. Ver o cabeçalho: é o nulo
  /// que carrega a diferença, e nenhuma tela pode trocá-lo por um caso vazio.
  final CasoDePerdido? caso;

  bool get estaNaFila => caso == null;
}

/// **F3.3 — O caso, depois do toque.**
///
/// Ela tem dois títulos porque tem dois assuntos, e o de cima é o que a pessoa
/// lê antes de decidir se pode parar de mexer no telefone.
class TelaCasoAberto extends StatelessWidget {
  const TelaCasoAberto({required this.resultado, super.key});

  final ResultadoDaAbertura resultado;

  /// O título do caso que **existe**.
  static const String tituloAberto = 'O caso está aberto.';

  /// O título do caso que **não existe ainda**, e a frase é sobre a fila e não
  /// sobre o caso. Nenhuma das duas palavras de [tituloAberto] aparece aqui:
  /// "aberto" é justamente o que ainda não é verdade.
  static const String tituloNaFila = 'Guardamos o aviso no seu celular.';

  static const String corpoNaFila =
      'Você está sem conexão agora. Assim que o sinal voltar, o Bichu envia o '
      'aviso sozinho — você não precisa fazer nada nem deixar o app aberto.';

  /// O que a tela da fila **promete**, e o que ela não promete.
  ///
  /// Ela não diz "os vizinhos já foram avisados", não mostra número de tutores
  /// e não oferece link de compartilhar: link de um caso que não existe abre
  /// em 404, e é a pessoa em pânico quem tocaria nele.
  static const String avisoDaFila =
      'Ninguém foi avisado ainda, e o link para compartilhar só existe depois '
      'que o aviso sair.';

  static const String rotuloDeVerMeusPets = 'Ver meus pets';

  /// Critério 9: caso aberto **só com área** não tem alerta, e a tela diz por
  /// quê em vez de deixar a seção de alcance vazia. Seção vazia num caso
  /// aberto parece defeito, e faz a pessoa tocar de novo.
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
        // **`fechar`, e não `voltar`.** F3.2 foi substituída de propósito
        // (`pushReplacement`): voltar para a tela de `Avisar agora` depois de
        // o caso existir ofereceria um segundo toque no mesmo botão.
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
              // Informativo e não erro: não houve falha nenhuma. A fila fez o
              // que ela existe para fazer.
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
            // `go` e não `push`: o fluxo terminou, e a pilha de F3.1/F3.2 não
            // tem mais para que existir.
            aoTocar: () => context.go(Rotas.perfil),
          ),
        ],
      ),
    );
  }
}

/// O alcance do caso que **existe**, lido do servidor e de mais lugar nenhum.
///
/// **A tela não inventa número, e não troca `unavailable` por zero.** O
/// alcance dito com honestidade é a BICHUS-20 e está sendo feito por outra
/// pessoa agora; esta tela não antecipa o trabalho dela e não finge tê-lo.
/// Enquanto a contagem depender da tabela de aparelho com push concedido
/// (BICHUS-91), o servidor responde `unavailable` na maior parte dos casos, e
/// é isso que a pessoa lê.
class _AlcanceDoCaso extends StatelessWidget {
  const _AlcanceDoCaso({required this.caso, required this.nomeDoPet});

  final CasoDePerdido caso;
  final String nomeDoPet;

  /// O texto de cada estado. `queued` e `desconhecido` caem no mesmo ramo de
  /// `unavailable` de propósito: os três significam "não há número para
  /// mostrar". Um `switch` que estourasse em `desconhecido` derrubaria a tela
  /// do caso recém-aberto no dia em que o servidor ganhasse um estado novo,
  /// com a versão antiga do app ainda instalada em milhares de aparelhos.
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

    // **`has_location` manda** (critério 9), e ele manda ANTES do estado de
    // alcance: um caso nascido só com área não tem raio para medir, e
    // `unavailable` ali diria "não consegui contar" quando a verdade é "não
    // há o que contar".
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
