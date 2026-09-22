import 'package:flutter/material.dart';
import 'package:go_router/go_router.dart';

import '../../api/api_client.dart';
import '../../api/casos_api.dart';
import '../../api/falhas.dart';
import '../../api/fila_offline.dart';
import '../../api/mensagens_de_erro.dart';
import '../../api/modelos_caso.dart';
import '../../api/problem.dart';
import '../../escopo.dart';
import '../../intencao/caso_de_perdido_como_intencao.dart';
import '../../perdido/rascunho_do_caso.dart';
import '../../roteamento/rotas.dart';
import '../../theme/bichu_colors.dart';
import '../../theme/bichu_tokens.g.dart';
import '../../widgets/barra_de_acao_fixa.dart';
import '../../widgets/botao_primario.dart';
import '../../widgets/faixa_de_aviso.dart';
import '../../widgets/saida_da_tela.dart';
import 'cabecalho_do_pet.dart';
import 'resultado_da_abertura.dart';

/// **F3.2 — Confirmar perdido: alcance do alerta.** Onde o envio acontece.
///
/// A pesquisa de UX chama esta de *"a tela mais honesta do produto, e a mais
/// facil de estragar"*, e o jeito de estragar e sempre o mesmo: **escrever um
/// numero que nao e verdade**. Ha tres jeitos de escrever zero errado, e o
/// contrato separa os tres em estados proprios:
///
/// - `computed` com zero: contamos, e nao ha ninguem. **Verdade.**
/// - `unavailable`: havia centro e o calculo nao respondeu. Mostrar zero aqui
///   faz desistir quem tinha cem vizinhos ao redor.
/// - `no_location`: nao ha centro, entao **nao havera alerta**. Nao e "ninguem
///   por perto": e "nao vai haver a pergunta".
///
/// **O numero desta tela e o do servidor, sempre.** Hoje ele responde
/// `unavailable` na maior parte dos casos, porque a contagem depende da tabela
/// de aparelho com push concedido (BICHUS-91) e ela esta sendo construida. A
/// tela mostra a variante D e nao inventa nada -- o alcance dito com honestidade
/// e a BICHUS-20, e esta tela nao antecipa o trabalho dela: ela so se recusa a
/// mentir enquanto ele nao chega.
class TelaAlcanceDoAlerta extends StatefulWidget {
  const TelaAlcanceDoAlerta({required this.rascunho, super.key});

  final RascunhoDoCaso rascunho;

  static const String titulo = 'Avisar a vizinhança';

  /// Variante D (UX 11.1), palavra por palavra. **E a que aparece hoje.**
  static const String tituloIndisponivel =
      'Não conseguimos calcular quantos tutores estão por perto agora.';

  static const String corpoIndisponivel = 'O alerta vai sair mesmo assim.';

  /// Variante F (UX 11.6): sem ponto no mapa nao ha raio, e portanto nao ha
  /// alerta. A frase fala do caso, **nunca da pessoa**: "voce nao permitiu a
  /// localizacao" e repreensao e nao tem lugar aqui.
  static const String tituloSemLocalizacao =
      'Este caso não vai ter alerta para a vizinhança.';

  static const String corpoSemLocalizacao =
      'O alerta precisa de um ponto no mapa para medir os 5 km, e este caso '
      'não tem um.';

  static const String rotuloDeAvisar = 'Avisar agora';

  /// Variante A: com zero contado, o caso continua valendo pela lista publica
  /// e pela tag, e o rotulo diz exatamente o que o toque faz.
  static const String rotuloDeAbrirMesmoAssim = 'Abrir o caso mesmo assim';

  @override
  State<TelaAlcanceDoAlerta> createState() => _TelaAlcanceDoAlertaState();
}

enum _Fase { carregando, pronta, enviando }

class _TelaAlcanceDoAlertaState extends State<TelaAlcanceDoAlerta> {
  _Fase _fase = _Fase.carregando;
  PreviaDoAlcance? _previa;
  MensagemDeErro? _erro;

  /// A chave de idempotencia **da primeira tentativa**, e nao de cada uma.
  ///
  /// Ela nasce aqui e sobrevive a `Tentar de novo` e a ida para a fila offline.
  /// Uma chave por tentativa faria cada reenvio virar um pedido novo, e os
  /// mesmos vizinhos receberiam o mesmo alerta varias vezes -- que e o defeito
  /// que o criterio 13 da BICHUS-31 nomeia.
  String? _chave;

  @override
  void initState() {
    super.initState();
    WidgetsBinding.instance.addPostFrameCallback((_) {
      if (mounted) _carregarPrevia();
    });
  }

  Future<void> _carregarPrevia() async {
    setState(() {
      _fase = _Fase.carregando;
      _erro = null;
    });
    try {
      final previa =
          await Escopo.of(context).casos.previaDoAlcance(widget.rascunho.pet.id);
      if (!mounted) return;
      setState(() {
        _previa = previa;
        _fase = _Fase.pronta;
      });
    } on FalhaDeChamada catch (falha) {
      if (!mounted) return;
      // **A previa que nao carrega nao impede abrir o caso.** Ela e conselho, e
      // nao portao: o contrato so tem tres bloqueios, e "nao consegui calcular"
      // nao e um deles. Tratar a falha como bloqueio faria o produto recusar o
      // caso no dia em que o calculo esta fora do ar, que e o dia em que ele
      // mais precisa funcionar. A tela cai na variante D, que diz a verdade.
      setState(() {
        _previa = null;
        _fase = _Fase.pronta;
        _erro = MensagensDeErro.de(falha, podeEnfileirar: true);
      });
    }
  }

  /// O estado de alcance que a tela desenha.
  ///
  /// Sem previa, e [EstadoDoAlcance.indisponivel] -- **nunca** `calculado` com
  /// zero. A falha de leitura e a variante D, e a variante D nao mostra numero.
  EstadoDoAlcance get _estado =>
      _previa?.estado ?? EstadoDoAlcance.indisponivel;

  Future<void> _enviar() async {
    final escopo = Escopo.of(context);
    final r = widget.rascunho;
    final area = r.area;
    final vistoEm = r.instanteEm(DateTime.now());
    if (area == null || vistoEm == null) {
      // Defesa de programacao: F3.1 nao deixa chegar aqui sem os dois. Voltar
      // e melhor que abrir um caso pela metade.
      context.pop();
      return;
    }

    final chave = _chave ??= ApiClient.novaChaveDeIdempotencia();
    final corpo = CasosApi.corpoDeAbertura(
      vistoEm: vistoEm,
      area: area,
      descricao: r.descricao,
      compartilharNaListaPublica: r.compartilharNaListaPublica,
    );

    setState(() {
      _fase = _Fase.enviando;
      _erro = null;
    });

    try {
      final caso = await escopo.casos.abrirCaso(
        petId: r.pet.id,
        corpo: corpo,
        idempotencyKey: chave,
      );
      if (!mounted) return;

      // =====================================================================
      // A SEGUNDA OPORTUNIDADE DE PEDIR O AVISO (UX 10.4, BICHUS-24).
      //
      // **Esta chamada esta comentada porque a BICHUS-24 nao esta mesclada.**
      // Nem `PedidoDeAviso`, nem `OportunidadeDeAviso`, nem
      // `Escopo.oportunidades`, nem `Escopo.vigiaDeAviso` existem nesta
      // arvore: escrita ativa, ela nao compila. O bloco fica aqui, no ponto
      // exato, para que a integracao seja descomentar e importar -- e nao
      // redescobrir onde a linha ia.
      //
      // O QUE A INTEGRACAO PRECISA FAZER:
      //   1. importar `../avisos/pedido_de_aviso.dart` e
      //      `../../dispositivo/oportunidades_de_aviso.dart`;
      //   2. descomentar o bloco abaixo;
      //   3. ligar o caso que prova que a segunda oportunidade e oferecida
      //      aqui -- sem ele, esta linha volta a ser codigo sem chamador.
      //
      // POR QUE AQUI, e nao na abertura da tela: a oportunidade e gasta
      // quando a folha ABRE, e nao na resposta. Oferecida em `initState`,
      // ela seria gasta por quem abre F3.2, le o alcance e volta -- um
      // caminho que a pessoa atravessa sem caso nenhum ter sido aberto, e
      // que gastaria a ultima das duas chances em nada.
      //
      // POR QUE NAO NO RAMO DA FILA (ver o `on FalhaDeConexao` abaixo):
      // sem conexao o registro do aparelho no servidor nao completa, e o
      // desfecho seria `registroFalhou` -- a unica das duas chances gasta
      // numa antessala que nao consegue registrar nada. Quem esta sem sinal
      // tem a oportunidade preservada para quando o alerta de fato sair.
      //
      // final desfecho = await PedidoDeAviso.oferecer(
      //   context,
      //   oportunidade: OportunidadeDeAviso.primeiroCasoDePerdido,
      //   nomeDoPet: r.pet.nome,
      // );
      // if (!mounted) return;
      // if (desfecho == DesfechoDoPedido.registroFalhou) {
      //   // O caso ESTA aberto: a falha do registro nao pode virar um erro
      //   // que pareca ter impedido a abertura. Ela viaja para F3.3, que e
      //   // quem tem espaco para dizer que o aviso no celular nao ficou
      //   // ligado.
      // }
      // =====================================================================

      context.pushReplacement(
        Rotas.casoAberto,
        extra: ResultadoDaAbertura.aberto(pet: r.pet, caso: caso),
      );
    } on FalhaDeConexao {
      // **A acao vai para a fila, e a tela diz que ela foi para a fila.** O
      // criterio 2 da BICHUS-31 proibe tela de sucesso para o que nao
      // aconteceu: "caso aberto" seria mentira, e a pessoa pararia de procurar
      // caminho por acreditar que o alerta saiu.
      await escopo.fila.enfileirar(
        AcaoEnfileirada(
          id: ApiClient.novaChaveDeIdempotencia(),
          metodo: 'POST',
          caminho: CasosApi.caminhoDeAbertura(r.pet.id),
          corpo: corpo,
          // A MESMA chave. Ver [_chave].
          idempotencyKey: chave,
          criadaEm: DateTime.now(),
        ),
      );
      if (!mounted) return;
      context.pushReplacement(
        Rotas.casoAberto,
        extra: ResultadoDaAbertura.naFila(pet: r.pet),
      );
    } on FalhaDaApi catch (falha) {
      if (!mounted) return;
      if (falha.tipo == ProblemTipo.naoAutenticado ||
          falha.tipo == ProblemTipo.tokenExpirado) {
        // **Criterio 7.** A guarda assume: o envelope guarda o rascunho
        // inteiro, a pessoa entra na conta e o caso e ABERTO -- ela nao volta
        // para o formulario e nao cai na home.
        await escopo.guarda.guardar(
          intencaoDeMarcarPerdido(r, criadaEm: DateTime.now()),
        );
        if (!mounted) return;
        context.push(Rotas.entrar);
        setState(() => _fase = _Fase.pronta);
        return;
      }
      setState(() {
        _fase = _Fase.pronta;
        _erro = MensagensDeErro.de(falha);
      });
    } on FalhaDeChamada catch (falha) {
      if (!mounted) return;
      setState(() {
        _fase = _Fase.pronta;
        _erro = MensagensDeErro.de(falha);
      });
    }
  }

  @override
  Widget build(BuildContext context) {
    final r = widget.rascunho;
    final previa = _previa;
    final bloqueio =
        (previa != null && previa.bloqueado) ? previa.bloqueios.first : null;

    return Scaffold(
      appBar: const BarraDeConta(
        titulo: TelaAlcanceDoAlerta.titulo,
        saida: TipoDeSaida.voltar,
      ),
      body: SafeArea(
        top: false,
        bottom: false,
        child: ListView(
          padding: const EdgeInsets.all(BichuEspaco.e4),
          addSemanticIndexes: false,
          children: <Widget>[
            CabecalhoDoPet(pet: r.pet),
            const SizedBox(height: BichuEspaco.e6),
            if (_fase == _Fase.carregando)
              const _Calculando()
            else
              _Alcance(
                estado: _estado,
                tutores: previa?.tutoresAlcancaveis,
                raioEmMetros: previa?.raioEmMetros ?? 5000,
                rotuloDaArea: previa?.rotuloDaArea ?? r.area?.bairro,
                nomeDoPet: r.pet.nome,
              ),
            if (bloqueio != null) ...<Widget>[
              const SizedBox(height: BichuEspaco.e6),
              _Bloqueio(bloqueio: bloqueio),
            ],
            if (_erro != null) ...<Widget>[
              const SizedBox(height: BichuEspaco.e6),
              FaixaDeAviso(texto: _erro!.texto),
            ],
          ],
        ),
      ),
      bottomNavigationBar: BarraDeAcaoFixa(
        acoes: <Widget>[
          BotaoPrimario(
            rotulo: _estado == EstadoDoAlcance.calculado &&
                    (previa?.tutoresAlcancaveis ?? 0) == 0
                ? TelaAlcanceDoAlerta.rotuloDeAbrirMesmoAssim
                : TelaAlcanceDoAlerta.rotuloDeAvisar,
            critico: true,
            carregando: _fase == _Fase.enviando,
            // **Bloqueio do contrato desabilita; falha de calculo nao.** Sao
            // coisas diferentes: os tres `blockers` sao recusas que o servidor
            // vai repetir, e oferecer o botao seria oferecer uma viagem de rede
            // que termina em 409. Nao saber o numero nao recusa nada.
            aoTocar:
                (bloqueio != null || _fase == _Fase.enviando) ? null : _enviar,
          ),
        ],
      ),
    );
  }
}

/// O estado de carregamento **com texto**, e nunca um esqueleto mudo.
///
/// A acessibilidade de F3.2 pede isto por nome: *"Durante o calculo,
/// 'Calculando quantos tutores estao por perto' em vez de um esqueleto mudo."*
class _Calculando extends StatelessWidget {
  const _Calculando();

  static const String texto = 'Calculando quantos tutores estão por perto.';

  @override
  Widget build(BuildContext context) {
    final textos = Theme.of(context).textTheme;
    return Semantics(
      liveRegion: true,
      child: Row(
        children: <Widget>[
          const SizedBox(
            width: 18,
            height: 18,
            child: CircularProgressIndicator(strokeWidth: 2.5),
          ),
          const SizedBox(width: BichuEspaco.e3),
          Expanded(child: Text(texto, style: textos.bodyLarge)),
        ],
      ),
    );
  }
}

/// As quatro variantes de 11.1 e 11.6, cada uma com o texto dela.
class _Alcance extends StatelessWidget {
  const _Alcance({
    required this.estado,
    required this.tutores,
    required this.raioEmMetros,
    required this.rotuloDaArea,
    required this.nomeDoPet,
  });

  final EstadoDoAlcance estado;
  final int? tutores;
  final int raioEmMetros;
  final String? rotuloDaArea;
  final String nomeDoPet;

  /// "num raio de 5 km da Vila Madalena", ou so "num raio de 5 km".
  ///
  /// O rotulo de area **so entra quando o servidor mandou um**. Escrever o
  /// bairro digitado aqui como se fosse o centro do raio seria dizer que o
  /// raio foi medido a partir dele, e ele nao foi: sem coordenada nao ha raio.
  String get _raio {
    final km = (raioEmMetros / 1000).round();
    final area = rotuloDaArea;
    if (area == null || area.isEmpty) return 'num raio de $km km';
    return 'num raio de $km km de $area';
  }

  @override
  Widget build(BuildContext context) {
    final cores = BichuColors.of(context).cores;
    final textos = Theme.of(context).textTheme;

    final (String titulo, String corpo) = switch (estado) {
      EstadoDoAlcance.calculado when (tutores ?? 0) == 0 => (
          rotuloDaArea == null
              ? 'Ainda não temos tutores cadastrados por perto.'
              : 'Ainda não temos tutores cadastrados perto de $rotuloDaArea.',
          'O alerta do Bichu não vai tocar em ninguém agora. O caso continua '
              'valendo: $nomeDoPet entra na lista de pets perdidos, e quem '
              'escanear a plaquinha chega direto em você.',
        ),
      EstadoDoAlcance.calculado => (
          'Vamos avisar ${tutores!} ${tutores == 1 ? 'tutor' : 'tutores'} '
              '$_raio.',
          'Eles vão receber a foto de $nomeDoPet e os sinais. Ninguém vê seu '
              'telefone nem seu endereço.',
        ),
      EstadoDoAlcance.semLocalizacao => (
          TelaAlcanceDoAlerta.tituloSemLocalizacao,
          '${TelaAlcanceDoAlerta.corpoSemLocalizacao} O que continua '
              'funcionando: $nomeDoPet entra agora na lista de pets perdidos, '
              'e o cartaz e o link para compartilhar ficam prontos junto com o '
              'caso.',
        ),
      // `queued` e `desconhecido` caem aqui de proposito. Os dois significam
      // "nao ha numero para mostrar", e a variante D e o texto que diz isso
      // sem inventar nada. Um `switch` que estourasse em `desconhecido`
      // derrubaria a tela no dia em que o servidor ganhasse um estado novo --
      // com a versao antiga do app ainda instalada em milhares de aparelhos.
      _ => (
          TelaAlcanceDoAlerta.tituloIndisponivel,
          TelaAlcanceDoAlerta.corpoIndisponivel,
        ),
    };

    return Semantics(
      // O numero e anunciado quando carrega (acessibilidade de F3.2).
      liveRegion: true,
      container: true,
      label: '$titulo $corpo',
      excludeSemantics: true,
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: <Widget>[
          Text(titulo, style: textos.headlineSmall),
          const SizedBox(height: BichuEspaco.e3),
          Text(
            corpo,
            style: textos.bodyLarge?.copyWith(color: cores.textSecondary),
          ),
        ],
      ),
    );
  }
}

/// Um dos tres `blockers` do contrato, com a saida que ele tem.
class _Bloqueio extends StatelessWidget {
  const _Bloqueio({required this.bloqueio});

  final BloqueioDoCaso bloqueio;

  @override
  Widget build(BuildContext context) {
    final email = Escopo.of(context).sessao.usuario?.email ?? '';

    return switch (bloqueio) {
      // Texto da secao 9 do UX, ja em uso em `MensagensDeErro`.
      BloqueioDoCaso.canalDeContatoNaoVerificado => FaixaDeAviso(
          texto: 'Confirme seu e-mail antes de avisar. Os tutores por perto '
              'vão receber a foto. Se alguém encontrar, é pelo seu e-mail que '
              'a gente avisa.',
          rotuloDaAcao: 'Confirmar meu e-mail',
          aoTocarNaAcao: () =>
              context.push(Rotas.verifiqueSeuEmail, extra: email),
        ),
      // **Sem acao, e a ausencia e a regra do criterio 2 da BICHUS-62.** Nao ha
      // rota de envio de foto para um pet ja cadastrado: a foto so sobe dentro
      // do assistente (F1.4). Um `Enviar a foto` aqui abriria para nada.
      BloqueioDoCaso.petSemFoto => const FaixaDeAviso(
          texto: 'Este pet ainda não tem foto pronta. O alerta sem foto pede '
              'que o vizinho reconheça um animal pela descrição, e é a foto '
              'que faz alguém reconhecer na rua.',
        ),
      // O criterio 13 resolve este caso ANTES, na escolha do pet: pet com caso
      // aberto nao e selecionavel la. Esta faixa e a rede de seguranca para a
      // corrida -- o caso aberto no outro aparelho enquanto esta tela estava em
      // pe.
      BloqueioDoCaso.petJaPerdido => const FaixaDeAviso(
          peso: PesoDaFaixa.informativo,
          texto: 'Este pet já está sendo procurado. Você abriu esse caso antes, '
              'e ele continua aberto.',
        ),
      BloqueioDoCaso.desconhecido => const SizedBox.shrink(),
    };
  }
}
