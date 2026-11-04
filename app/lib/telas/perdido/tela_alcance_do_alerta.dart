import 'package:flutter/material.dart';
import 'package:go_router/go_router.dart';

import '../../api/api_client.dart';
import '../../api/casos_api.dart';
import '../../api/falhas.dart';
import '../../api/fila_offline.dart';
import '../../api/mensagens_de_erro.dart';
import '../../api/modelos_caso.dart';
import '../../api/modelos_pet.dart';
import '../../api/problem.dart';
import '../../dispositivo/oportunidades_de_aviso.dart';
import '../../escopo.dart';
import '../../intencao/caso_de_perdido_como_intencao.dart';
import '../../perdido/rascunho_do_caso.dart';
import '../../roteamento/rotas.dart';
import '../../theme/bichu_colors.dart';
import '../../theme/bichu_tokens.g.dart';
import '../avisos/pedido_de_aviso.dart';
import '../../widgets/barra_de_acao_fixa.dart';
import '../../widgets/botao_primario.dart';
import '../../widgets/faixa_de_aviso.dart';
import '../../widgets/saida_da_tela.dart';
import 'cabecalho_do_pet.dart';
import 'resultado_da_abertura.dart';

/// **F3.2 — Confirmar perdido: alcance do alerta.** Onde o envio acontece.
class TelaAlcanceDoAlerta extends StatefulWidget {
  const TelaAlcanceDoAlerta({required this.rascunho, super.key});

  final RascunhoDoCaso rascunho;

  static const String titulo = 'Avisar a vizinhança';

  /// Variante D (UX 11.1), palavra por palavra.
  static const String tituloIndisponivel =
      'Não conseguimos calcular quantos tutores estão por perto agora.';

  static const String corpoIndisponivel = 'O alerta vai sair mesmo assim.';

  /// Variante F (UX 11.6): sem ponto no mapa nao ha raio, e portanto nao ha
  /// alerta.
  static const String tituloSemLocalizacao =
      'Este caso não vai ter alerta para a vizinhança.';

  static const String corpoSemLocalizacao =
      'O alerta precisa de um ponto no mapa para medir os 5 km, e este caso '
      'não tem um.';

  static const String rotuloDeAvisar = 'Avisar agora';

  /// O pet **nunca teve** foto pronta. A faixa e INFORMATIVA: o alerta sai.
  static String semFotoDe(String nomeDoPet) =>
      '$nomeDoPet ainda não tem foto no cadastro. O alerta vai sair assim '
      'mesmo, com a descrição e os sinais — mas é a foto que faz um vizinho '
      'reconhecer um animal na rua.';

  /// Ha foto enviada, ainda em `processing`. Caso DIFERENTE do de cima: aqui
  /// nao falta nada ao tutor, falta tempo ao servidor.
  static String fotoEmProcessamentoDe(String nomeDoPet) =>
      'A foto de $nomeDoPet ainda está sendo preparada. O alerta vai sair '
      'assim mesmo, com a descrição e os sinais, e a foto entra no cartaz e '
      'na lista assim que ficar pronta.';

  /// Variante A: com zero contado, o caso continua valendo pela lista publica e
  /// pela tag, e o rotulo diz exatamente o que o toque faz.
  static const String rotuloDeAbrirMesmoAssim = 'Abrir o caso mesmo assim';

  @override
  State<TelaAlcanceDoAlerta> createState() => _TelaAlcanceDoAlertaState();
}

enum _Fase { carregando, pronta, enviando }

class _TelaAlcanceDoAlertaState extends State<TelaAlcanceDoAlerta> {
  _Fase _fase = _Fase.carregando;
  PreviaDoAlcance? _previa;
  MensagemDeErro? _erro;

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
      setState(() {
        _previa = null;
        _fase = _Fase.pronta;
        _erro = MensagensDeErro.de(falha, podeEnfileirar: true);
      });
    }
  }

  EstadoDoAlcance get _estado =>
      _previa?.estado ?? EstadoDoAlcance.indisponivel;

  Future<void> _enviar() async {
    final escopo = Escopo.of(context);
    final r = widget.rascunho;
    final area = r.area;
    final vistoEm = r.instanteEm(DateTime.now());
    if (area == null || vistoEm == null) {
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

      final desfecho = await PedidoDeAviso.oferecer(
        context,
        oportunidade: OportunidadeDeAviso.primeiroCasoDePerdido,
        nomeDoPet: r.pet.nome,
      );
      if (!mounted) return;
      if (desfecho == DesfechoDoPedido.registroFalhou) {
        // O caso ESTA aberto: a falha do registro nao pode virar um erro que pareca ter impedido a abertura.
      }

      context.pushReplacement(
        Rotas.casoAberto,
        extra: ResultadoDaAbertura.aberto(pet: r.pet, caso: caso),
      );
    } on FalhaDeConexao {
      await escopo.fila.enfileirar(
        AcaoEnfileirada(
          id: ApiClient.novaChaveDeIdempotencia(),
          metodo: 'POST',
          caminho: CasosApi.caminhoDeAbertura(r.pet.id),
          corpo: corpo,
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
        _erro = MensagensDeErro.de(
          falha,
          acaoEmCurso: AcaoEmCurso.avisarPetPerdido,
        );
      });
    } on FalhaDeChamada catch (falha) {
      if (!mounted) return;
      setState(() {
        _fase = _Fase.pronta;
        _erro = MensagensDeErro.de(
          falha,
          acaoEmCurso: AcaoEmCurso.avisarPetPerdido,
        );
      });
    } on Object catch (erro, pilha) {
      registrarFalhaInesperada(erro, pilha, onde: 'ao abrir o caso de perdido');
      if (!mounted) return;
      setState(() {
        _fase = _Fase.pronta;
        _erro = const MensagemDeErro(
          texto: MensagensDeErro.servidorFora,
          acao: MensagensDeErro.tentarDeNovo,
        );
      });
    }
  }

  @override
  Widget build(BuildContext context) {
    final r = widget.rascunho;
    final previa = _previa;
    // **BLOQUEIO e AVISO decidem coisas DIFERENTES.** O bloqueio desabilita o
    // envio; o aviso nunca. Trocar um pelo outro aqui foi o defeito de
    // 03/11/2026, quando falta de foto vivia em `blockers` e travava o botao.
    final bloqueio =
        (previa != null && previa.bloqueado) ? previa.bloqueios.first : null;
    final mostrarAvisoDeFoto = previa?.semFotoPronta ?? false;

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
                // `Eles vao receber a FOTO` virou mentira no dia em que caso
                // sem foto passou a existir.
                comFoto: !mostrarAvisoDeFoto,
              ),
            if (bloqueio != null) ...<Widget>[
              const SizedBox(height: BichuEspaco.e6),
              _Bloqueio(bloqueio: bloqueio),
            ],
            if (mostrarAvisoDeFoto) ...<Widget>[
              const SizedBox(height: BichuEspaco.e6),
              _AvisoDeFoto(pet: r.pet),
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
            // Os DOIS bloqueios que sobraram continuam travando. Falta de
            // foto nao esta entre eles desde 03/11/2026, e por isso ela nao
            // chega aqui: ela vive em `previa.avisos`.
            aoTocar:
                (bloqueio != null || _fase == _Fase.enviando) ? null : _enviar,
          ),
        ],
      ),
    );
  }
}

/// O estado de carregamento **com texto**, e nunca um esqueleto mudo.
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
    required this.comFoto,
  });

  final EstadoDoAlcance estado;
  final int? tutores;
  final int raioEmMetros;
  final String? rotuloDaArea;
  final String nomeDoPet;

  /// Ha foto pronta para o alerta carregar?
  final bool comFoto;

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
          'Eles vão receber ${comFoto ? 'a foto' : 'a descrição'} de '
              '$nomeDoPet e os sinais. Ninguém vê seu telefone nem seu '
              'endereço.',
        ),
      EstadoDoAlcance.semLocalizacao => (
          TelaAlcanceDoAlerta.tituloSemLocalizacao,
          '${TelaAlcanceDoAlerta.corpoSemLocalizacao} O que continua '
              'funcionando: $nomeDoPet entra agora na lista de pets perdidos, '
              'e o cartaz e o link para compartilhar ficam prontos junto com o '
              'caso.',
        ),
      _ => (
          TelaAlcanceDoAlerta.tituloIndisponivel,
          TelaAlcanceDoAlerta.corpoIndisponivel,
        ),
    };

    return Semantics(
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
      BloqueioDoCaso.canalDeContatoNaoVerificado => FaixaDeAviso(
          texto: MensagensDeErro.canalNaoVerificadoParaAvisar,
          rotuloDaAcao: MensagensDeErro.confirmarMeuEmail,
          aoTocarNaAcao: () =>
              context.push(Rotas.verifiqueSeuEmail, extra: email),
        ),
      BloqueioDoCaso.petJaPerdido => const FaixaDeAviso(
          peso: PesoDaFaixa.informativo,
          texto: 'Este pet já está sendo procurado. Você abriu esse caso antes, '
              'e ele continua aberto.',
        ),
      BloqueioDoCaso.desconhecido => const SizedBox.shrink(),
    };
  }
}

/// O aviso de que falta foto. **Informativo, e sem acao**: o alerta vai sair, e
/// o que o tutor precisa saber e que ele sai valendo menos.
///
/// Os DOIS casos tem texto proprio, porque a saida de cada um e diferente: num
/// nao existe foto, no outro ela existe e esta a caminho. O texto antigo
/// ("ainda nao tem foto pronta") cobria os dois e nao ajudava em nenhum.
class _AvisoDeFoto extends StatelessWidget {
  const _AvisoDeFoto({required this.pet});

  final Pet pet;

  @override
  Widget build(BuildContext context) {
    return FaixaDeAviso(
      peso: PesoDaFaixa.informativo,
      texto: pet.temFotoEmProcessamento
          ? TelaAlcanceDoAlerta.fotoEmProcessamentoDe(pet.nome)
          : TelaAlcanceDoAlerta.semFotoDe(pet.nome),
    );
  }
}
