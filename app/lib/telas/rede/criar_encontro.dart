import 'package:flutter/material.dart';
import 'package:go_router/go_router.dart';

import '../../api/api_client.dart';
import '../../api/falhas.dart';
import '../../api/mensagens_de_erro.dart';
import '../../api/problem.dart';
import '../../api/rede_api.dart';
import '../../escopo.dart';
import '../../roteamento/rotas.dart';
import '../../theme/bichu_colors.dart';
import '../../theme/bichu_tokens.g.dart';
import '../../widgets/barra_de_acao_fixa.dart';
import '../../widgets/bichu_field.dart';
import '../../widgets/botao_primario.dart';
import '../../widgets/faixa_de_aviso.dart';
import '../../widgets/saida_da_tela.dart';

/// **Criar um encontro da `Rede`** (`createNetworkEvent`, ADR-0025 emenda 3).
///
/// ## O encontro nasce EM PUBLICO, e a tela diz isso antes do botao
///
/// Nao ha fila de revisao (decisao do cliente de 17/10/2026): o encontro nasce
/// `published`, com `origin: community`, e aparece na agenda publica na hora.
/// Quem cria esta publicando, e precisa saber disso **antes** de tocar o botao
/// -- nao depois, na tela de resultado.
///
/// ## Os dois casos de recusa, e por que nenhum deles e um botao morto
///
/// 1. **Sem e-mail confirmado.** E a mesma regua de abrir caso de pet perdido,
///    e e a unica regua de quem pode criar. Na pratica e o e-mail, porque nao
///    existe operacao que verifique telefone. A tela **nao espera o 409**: ela
///    le `Me.email_verified`, que a sessao ja tem, desabilita o botao e escreve
///    o motivo com a saida `Confirmar meu e-mail` -- o mesmo desenho de
///    `tela_alcance_do_alerta.dart`, campo por campo. O 409
///    `contact-channel-unverified` continua tratado, como rede de seguranca
///    para quem confirmou o e-mail noutro aparelho com esta tela em pe.
/// 2. **Teto de 3 encontros ativos.** Este **nao da para antecipar**: nao ha
///    operacao que conte os encontros ativos da propria conta -- a agenda nao
///    tem recorte "meus" e `Me` nao carrega a contagem. Antecipar exigiria
///    contrato novo. Ele chega como `409 community-event-limit-reached` e a
///    faixa de erro diz o que destrava (cancelar ou esperar terminar um),
///    com a saida para a agenda. O numero sai de `limit` na resposta e **nunca
///    esta escrito aqui**.
///
/// ## O que esta tela NAO pergunta, e cada ausencia e o contrato
///
/// `CommunityNetworkEventInput` nao tem `visibility`, `admission`, `slug`,
/// `point`, `street_address`, `ticket_url` nem `instagram_url`: o encontro da
/// comunidade e sempre publico e gratuito, nao ha mapa nem busca de endereco
/// (ADR-0006) e link em texto de terceiro e o vetor que D59 fecha. Desenhar um
/// controle para qualquer um deles seria oferecer um campo que o servidor
/// recusa depois de a pessoa ter preenchido.
///
/// **Tambem nao pergunta o que o contrato aceita mas tem default de servidor**
/// -- `time_zone`, `accepted_sizes`, `dog_age`, `vaccination_required`,
/// `fenced_off_leash_area`, `amenities`, `bring_items` -- nem a **capa**. As
/// duas ausencias sao de escopo e estao no relato da entrega, nao esquecimento:
/// os cinco primeiros encheriam de controle uma tela que precisa ser curta, e a
/// capa passa pela porta `CameraEGaleria`, que outra frente esta mexendo nesta
/// mesma rodada. Nenhum deles bloqueia criar encontro.
///
/// ## O endereco dentro do nome do lugar e recusado pelo SERVIDOR
///
/// `place.place_name` recusa CEP, numero de porta, `s/n`, quilometro e
/// complemento residencial, com `code: address_in_place_name`. A tela nao
/// reimplementa esse detector -- duas redacoes dele divergiriam --, ela
/// **nomeia o campo** quando a recusa chega, com a frase do servidor.
class TelaCriarEncontro extends StatefulWidget {
  const TelaCriarEncontro({super.key, this.agora = DateTime.now});

  /// O relogio, injetavel para o teste de widget.
  final DateTime Function() agora;

  static const String titulo = 'Marcar um encontro';

  static const String avisoDePublicacao =
      'O encontro entra na agenda na hora, visível para todos.';

  static const String rotuloDeMarcar = 'Marcar encontro';

  static const String semEmailConfirmado =
      'Confirme seu e-mail antes de marcar. O encontro vai aparecer para toda '
      'a comunidade com o seu nome.';

  static const String rotuloDeConfirmarEmail = 'Confirmar meu e-mail';

  static const String entreParaMarcar = 'Entre para marcar um encontro.';

  @override
  State<TelaCriarEncontro> createState() => _TelaCriarEncontroState();
}

enum _Fase { preenchendo, enviando }

/// O primeiro impedimento, ou nulo. **A ordem importa**: o que a pessoa nao
/// resolve nesta tela vem antes do que ela resolve digitando.
enum _Impedimento {
  semConta(TelaCriarEncontro.entreParaMarcar),
  semEmailConfirmado(TelaCriarEncontro.semEmailConfirmado),
  semTitulo('Dê um nome ao encontro.'),
  semResumo('Diga em uma linha o que vai acontecer.'),
  semLugar('Diga o nome do lugar.'),
  semBairro('Diga o bairro.'),
  semCidade('Diga a cidade.'),
  semUf('Diga o estado, com duas letras.'),
  semData('Escolha o dia e a hora.'),
  dataNoPassado('O encontro precisa ser no futuro.'),
  fimAntesDoComeco('O fim não pode ser antes do começo.');

  const _Impedimento(this.texto);

  final String texto;
}

class _TelaCriarEncontroState extends State<TelaCriarEncontro> {
  final TextEditingController _titulo = TextEditingController();
  final TextEditingController _resumo = TextEditingController();
  final TextEditingController _lugar = TextEditingController();
  final TextEditingController _bairro = TextEditingController();
  final TextEditingController _cidade = TextEditingController();
  final TextEditingController _uf = TextEditingController();
  final TextEditingController _observacoes = TextEditingController();

  DateTime? _comeca;
  DateTime? _termina;

  _Fase _fase = _Fase.preenchendo;
  MensagemDeErro? _erro;

  /// Nomeados pelo `400` do servidor, para marcar o campo em vez de so mostrar
  /// uma faixa. As chaves sao os `field` do contrato.
  Map<String, String> _errosDeCampo = const <String, String>{};

  /// **Nasce uma vez e sobrevive a retentativa.** Duas tentativas da mesma
  /// pessoa com o mesmo texto nao podem virar dois encontros na agenda.
  String? _chave;

  bool _preencheu = false;

  @override
  void didChangeDependencies() {
    super.didChangeDependencies();
    if (_preencheu) return;
    _preencheu = true;
    // A regiao de referencia que o tutor ja cadastrou (BICHUS-92), que e
    // texto -- bairro, cidade e UF -- e nunca coordenada virada em nome
    // (ADR-0006 proibe geocodificacao). Sem ela os campos abrem vazios.
    final regiao = Escopo.of(context).sessao.usuario?.regiaoDeReferencia;
    if (regiao == null) return;
    _bairro.text = regiao.bairro ?? '';
    _cidade.text = regiao.cidade ?? '';
    _uf.text = regiao.uf ?? '';
  }

  @override
  void dispose() {
    _titulo.dispose();
    _resumo.dispose();
    _lugar.dispose();
    _bairro.dispose();
    _cidade.dispose();
    _uf.dispose();
    _observacoes.dispose();
    super.dispose();
  }

  void _aoDigitar(String _) => setState(() {
        // A recusa anterior deixa de valer quando a pessoa muda o texto: um
        // erro de campo que sobrevive a correcao marca de errado o que ja foi
        // consertado.
        _erro = null;
        _errosDeCampo = const <String, String>{};
      });

  _Impedimento? get _impedimento {
    final usuario = Escopo.of(context).sessao.usuario;
    if (usuario == null) return _Impedimento.semConta;
    if (!usuario.emailVerificado) return _Impedimento.semEmailConfirmado;
    if (_titulo.text.trim().length < 2) return _Impedimento.semTitulo;
    if (_resumo.text.trim().length < 2) return _Impedimento.semResumo;
    if (_lugar.text.trim().length < 2) return _Impedimento.semLugar;
    if (_bairro.text.trim().length < 2) return _Impedimento.semBairro;
    if (_cidade.text.trim().length < 2) return _Impedimento.semCidade;
    if (_uf.text.trim().length != 2) return _Impedimento.semUf;
    final comeca = _comeca;
    if (comeca == null) return _Impedimento.semData;
    if (!comeca.isAfter(widget.agora())) return _Impedimento.dataNoPassado;
    final termina = _termina;
    if (termina != null && !termina.isAfter(comeca)) {
      return _Impedimento.fimAntesDoComeco;
    }
    return null;
  }

  /// Dia e hora, nessa ordem, numa escolha so.
  ///
  /// **Dois seletores do Flutter e nao um componente novo.** O app ja abre
  /// `showDatePicker` em dois lugares; a hora e nova aqui porque nenhuma tela
  /// precisava dela antes -- um encontro sem hora nao e um encontro.
  Future<DateTime?> _escolherQuando(DateTime? atual, String ajuda) async {
    final agora = widget.agora();
    final dia = await showDatePicker(
      context: context,
      initialDate: atual ?? agora,
      firstDate: agora,
      // Um ano a frente: encontro de bairro nao se marca para 2030, e um
      // calendario sem fim e um calendario em que se erra o ano.
      lastDate: agora.add(const Duration(days: 365)),
      helpText: ajuda,
    );
    if (dia == null || !mounted) return null;
    final hora = await showTimePicker(
      context: context,
      initialTime: TimeOfDay.fromDateTime(atual ?? agora),
      helpText: ajuda,
    );
    if (hora == null || !mounted) return null;
    return DateTime(dia.year, dia.month, dia.day, hora.hour, hora.minute);
  }

  Future<void> _escolherComeco() async {
    final escolhido = await _escolherQuando(_comeca, 'Quando começa');
    if (escolhido == null) return;
    setState(() => _comeca = escolhido);
  }

  Future<void> _escolherFim() async {
    final escolhido = await _escolherQuando(_termina ?? _comeca, 'Quando termina');
    if (escolhido == null) return;
    setState(() => _termina = escolhido);
  }

  Future<void> _marcar() async {
    if (_impedimento != null) return;
    final escopo = Escopo.of(context);
    setState(() {
      _fase = _Fase.enviando;
      _erro = null;
      _errosDeCampo = const <String, String>{};
    });

    final corpo = RedeApi.corpoDeCriacao(
      titulo: _titulo.text.trim(),
      resumo: _resumo.text.trim(),
      nomeDoLugar: _lugar.text.trim(),
      bairro: _bairro.text.trim(),
      cidade: _cidade.text.trim(),
      uf: _uf.text.trim().toUpperCase(),
      comecaEm: _comeca!,
      terminaEm: _termina,
      observacoes: _observacoes.text.trim(),
    );
    final chave = _chave ??= ApiClient.novaChaveDeIdempotencia();

    try {
      final encontro = await RedeApi(escopo.api).criar(
        corpo,
        idempotencyKey: chave,
      );
      if (!mounted) return;
      // **Vai para o proprio encontro, que ja esta em publico.** Mostrar uma
      // tela de "pronto" seria esconder o resultado que a pessoa precisa ver:
      // o encontro como a comunidade o ve.
      context.pushReplacement(Rotas.encontroDaRedeDe(encontro.slug));
    } on FalhaDeConexao {
      if (!mounted) return;
      // **NAO vai para a fila offline.** Criar encontro publica na hora; uma
      // acao enfileirada publicaria horas depois, sem ninguem na tela, num
      // horario que pode ja ter passado. A pessoa tenta de novo quando tiver
      // rede, e a chave de idempotencia continua a mesma.
      setState(() {
        _fase = _Fase.preenchendo;
        _erro = const MensagemDeErro(
          texto: 'Sem conexão agora. O encontro entra na agenda assim que você '
              'tocar em marcar com internet.',
          acao: MensagensDeErro.tentarDeNovo,
        );
      });
    } on FalhaDaApi catch (falha) {
      if (!mounted) return;
      if (falha.tipo == ProblemTipo.naoAutenticado ||
          falha.tipo == ProblemTipo.tokenExpirado) {
        setState(() => _fase = _Fase.preenchendo);
        context.push(Rotas.entrar);
        return;
      }
      setState(() {
        _fase = _Fase.preenchendo;
        _erro = MensagensDeErro.de(falha);
        _errosDeCampo = _camposRecusados(falha);
      });
    } on FalhaDeChamada catch (falha) {
      if (!mounted) return;
      setState(() {
        _fase = _Fase.preenchendo;
        _erro = MensagensDeErro.de(falha);
      });
    } on Object catch (erro, pilha) {
      // Sem este ramo a fase `enviando` ficaria de pe para sempre num erro que
      // nao e `FalhaDeChamada` (ver `api/falhas.dart`).
      registrarFalhaInesperada(erro, pilha, onde: 'ao marcar um encontro');
      if (!mounted) return;
      setState(() {
        _fase = _Fase.preenchendo;
        _erro = const MensagemDeErro(
          texto: MensagensDeErro.servidorFora,
          acao: MensagensDeErro.tentarDeNovo,
        );
      });
    }
  }

  /// Os campos que o `400` nomeou, pela frase do servidor.
  ///
  /// `place.place_name` com `address_in_place_name` e `title`/`summary`/`notes`
  /// com `contact_or_payment_detected` chegam assim. **A tela nao reescreve a
  /// frase**: o servidor e quem sabe o que recusou e por que.
  static Map<String, String> _camposRecusados(FalhaDaApi falha) {
    final mapa = <String, String>{};
    for (final campo in falha.problem.campos) {
      if (campo.campo.isEmpty) continue;
      // Sem `message` o campo fica marcado em vermelho pelo `code`, que e o
      // que o contrato garante existir. Uma frase inventada aqui divergiria da
      // do servidor na primeira vez que ele a melhorasse.
      mapa[campo.campo] = campo.mensagem ?? 'Confira este campo.';
    }
    return mapa;
  }

  @override
  Widget build(BuildContext context) {
    final escopo = Escopo.of(context);
    final cores = BichuColors.of(context).cores;
    final textos = Theme.of(context).textTheme;

    return AnimatedBuilder(
      animation: escopo.sessao,
      builder: (context, _) {
        final impedimento = _impedimento;
        final enviando = _fase == _Fase.enviando;

        return Scaffold(
          appBar: const BarraDeConta(
            titulo: TelaCriarEncontro.titulo,
            saida: TipoDeSaida.voltar,
          ),
          body: SafeArea(
            top: false,
            bottom: false,
            child: ListView(
              padding: const EdgeInsets.all(BichuEspaco.e4),
              // Corpo rolavel de uma pagina, e nao lista de itens: sem isto
              // cada bloco viraria um no de semantica com tudo dentro.
              addSemanticIndexes: false,
              children: <Widget>[
                // **O aviso de que isto publica vem ANTES dos campos.** Depois
                // deles seria nota de rodape de uma decisao que a pessoa toma
                // ao comecar a escrever.
                FaixaDeAviso(
                  peso: PesoDaFaixa.informativo,
                  texto: TelaCriarEncontro.avisoDePublicacao,
                ),
                // A recusa que veio do servidor, quando veio.
                if (_erro != null) ...<Widget>[
                  const SizedBox(height: BichuEspaco.e4),
                  FaixaDeAviso(
                    texto: _erro!.texto,
                    rotuloDaAcao: _erro!.acao,
                    aoTocarNaAcao: _saidaDoErro(context, _erro!),
                  ),
                ],
                // **Os dois bloqueios que a tela sabe de antemao, cada um com
                // a saida que o resolve.** Nunca um botao desabilitado sem
                // explicacao: o motivo e a saida ficam acima dos campos,
                // porque os dois tornam o formulario inutil enquanto valem.
                if (impedimento == _Impedimento.semConta) ...<Widget>[
                  const SizedBox(height: BichuEspaco.e4),
                  FaixaDeAviso(
                    texto: TelaCriarEncontro.entreParaMarcar,
                    rotuloDaAcao: 'Entrar',
                    aoTocarNaAcao: () => context.push(Rotas.entrar),
                  ),
                ],
                if (impedimento == _Impedimento.semEmailConfirmado) ...<Widget>[
                  const SizedBox(height: BichuEspaco.e4),
                  FaixaDeAviso(
                    texto: TelaCriarEncontro.semEmailConfirmado,
                    rotuloDaAcao: TelaCriarEncontro.rotuloDeConfirmarEmail,
                    aoTocarNaAcao: () => context.push(
                      Rotas.verifiqueSeuEmail,
                      extra: escopo.sessao.usuario?.email ?? '',
                    ),
                  ),
                ],
                const SizedBox(height: BichuEspaco.e6),
                BichuField(
                  rotulo: 'Nome do encontro',
                  controlador: _titulo,
                  aoMudar: _aoDigitar,
                  erro: _errosDeCampo['title'],
                  limite: 120,
                  exemplo: 'Caminhada no parque',
                  capitalizacao: TextCapitalization.sentences,
                  habilitado: !enviando,
                ),
                const SizedBox(height: BichuEspaco.e4),
                BichuField(
                  rotulo: 'O que vai acontecer',
                  controlador: _resumo,
                  aoMudar: _aoDigitar,
                  erro: _errosDeCampo['summary'],
                  limite: 200,
                  linhas: 2,
                  capitalizacao: TextCapitalization.sentences,
                  habilitado: !enviando,
                ),
                const SizedBox(height: BichuEspaco.e6),
                Semantics(
                  header: true,
                  child: Text('Onde', style: textos.titleMedium),
                ),
                const SizedBox(height: BichuEspaco.e3),
                BichuField(
                  rotulo: 'Nome do lugar',
                  controlador: _lugar,
                  aoMudar: _aoDigitar,
                  erro: _errosDeCampo['place.place_name'],
                  limite: 80,
                  // **Logradouro publico, nunca residencia** (ADR-0027 item
                  // 13). A ajuda diz isso antes de a pessoa escrever o
                  // endereco de casa e levar um 400.
                  ajuda: 'Um lugar público, com o nome que as pessoas usam. '
                      'Sem endereço.',
                  exemplo: 'Praça da Harmonia',
                  capitalizacao: TextCapitalization.words,
                  habilitado: !enviando,
                ),
                const SizedBox(height: BichuEspaco.e4),
                BichuField(
                  rotulo: 'Bairro',
                  controlador: _bairro,
                  aoMudar: _aoDigitar,
                  erro: _errosDeCampo['place.neighborhood'],
                  limite: 60,
                  capitalizacao: TextCapitalization.words,
                  habilitado: !enviando,
                ),
                const SizedBox(height: BichuEspaco.e4),
                Row(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: <Widget>[
                    Expanded(
                      child: BichuField(
                        rotulo: 'Cidade',
                        controlador: _cidade,
                        aoMudar: _aoDigitar,
                        erro: _errosDeCampo['place.city'],
                        limite: 60,
                        capitalizacao: TextCapitalization.words,
                        habilitado: !enviando,
                      ),
                    ),
                    const SizedBox(width: BichuEspaco.e3),
                    SizedBox(
                      width: 96,
                      child: BichuField(
                        rotulo: 'UF',
                        controlador: _uf,
                        aoMudar: _aoDigitar,
                        erro: _errosDeCampo['place.state'],
                        limite: 2,
                        capitalizacao: TextCapitalization.characters,
                        correcaoAutomatica: false,
                        habilitado: !enviando,
                      ),
                    ),
                  ],
                ),
                const SizedBox(height: BichuEspaco.e6),
                Semantics(
                  header: true,
                  child: Text('Quando', style: textos.titleMedium),
                ),
                const SizedBox(height: BichuEspaco.e3),
                _Quando(
                  rotulo: 'Começa',
                  valor: _comeca,
                  aoTocar: enviando ? null : _escolherComeco,
                  erro: _errosDeCampo['starts_at'],
                ),
                const SizedBox(height: BichuEspaco.e3),
                _Quando(
                  rotulo: 'Termina',
                  valor: _termina,
                  opcional: true,
                  aoTocar: enviando ? null : _escolherFim,
                  erro: _errosDeCampo['ends_at'],
                ),
                const SizedBox(height: BichuEspaco.e6),
                BichuField(
                  rotulo: 'Observações',
                  controlador: _observacoes,
                  aoMudar: _aoDigitar,
                  erro: _errosDeCampo['notes'],
                  opcional: true,
                  linhas: 3,
                  limite: 500,
                  // D59: o servidor recusa telefone, e-mail, link e chave PIX
                  // em qualquer texto que a pessoa escreve. Dito antes, e nao
                  // descoberto pelo 400.
                  ajuda: 'Sem telefone, e-mail ou link.',
                  capitalizacao: TextCapitalization.sentences,
                  habilitado: !enviando,
                ),
              ],
            ),
          ),
          bottomNavigationBar: BarraDeAcaoFixa(
            acoes: <Widget>[
              // **O MOTIVO ACIMA DO BOTAO.** A ordem de leitura precisa
              // entregar o motivo antes do controle: quem usa leitor de tela
              // chegaria ao botao desabilitado sem ter ouvido por que.
              // O motivo so se repete na barra quando ele NAO ja esta dito
              // acima, com saida: duas copias da mesma frase na mesma tela
              // fazem o leitor de tela anunciar o bloqueio duas vezes.
              if (impedimento != null &&
                  impedimento != _Impedimento.semEmailConfirmado &&
                  impedimento != _Impedimento.semConta)
                _MotivoDoBloqueio(
                  texto: impedimento.texto,
                  cor: cores.textPrimary,
                ),
              BotaoPrimario(
                rotulo: TelaCriarEncontro.rotuloDeMarcar,
                critico: true,
                carregando: enviando,
                aoTocar: impedimento == null && !enviando ? _marcar : null,
              ),
            ],
          ),
        );
      },
    );
  }

  /// A saida da faixa de erro, quando a mensagem tem uma.
  ///
  /// `rotaDaAcao` e navegacao simples (a agenda, no teto de encontros);
  /// `proximaAcao: verificarEmail` e a confirmacao de e-mail. Sem nenhuma das
  /// duas, a faixa sai sem botao -- rotulo de acao sem destino e o defeito que
  /// a BICHUS-62 nomeou.
  VoidCallback? _saidaDoErro(BuildContext context, MensagemDeErro mensagem) {
    if (mensagem.acao == null) return null;
    final rota = mensagem.rotaDaAcao;
    if (rota != null) return () => context.go(rota);
    if (mensagem.proximaAcao == ProximaAcao.verificarEmail) {
      final email = Escopo.of(context).sessao.usuario?.email ?? '';
      return () => context.push(Rotas.verifiqueSeuEmail, extra: email);
    }
    if (mensagem.proximaAcao == ProximaAcao.entrar) {
      return () => context.push(Rotas.entrar);
    }
    return null;
  }
}

/// Uma data e hora escolhida, ou o convite para escolher.
///
/// **O valor escolhido e MOSTRADO, e nao so guardado.** Sem esta linha quem
/// fechou o seletor por engano nao tem como descobrir o que ficou gravado.
class _Quando extends StatelessWidget {
  const _Quando({
    required this.rotulo,
    required this.valor,
    required this.aoTocar,
    this.opcional = false,
    this.erro,
  });

  final String rotulo;
  final DateTime? valor;
  final VoidCallback? aoTocar;
  final bool opcional;
  final String? erro;

  /// `dd/mm/aaaa às HHhMM`, sem `intl`: o app nao traz o pacote, e uma
  /// dependencia nova por uma linha de texto e custo que a historia nao pede.
  static String comoTexto(DateTime quando) {
    String d(int n) => n.toString().padLeft(2, '0');
    return '${d(quando.day)}/${d(quando.month)}/${quando.year} '
        'às ${d(quando.hour)}h${d(quando.minute)}';
  }

  @override
  Widget build(BuildContext context) {
    final cores = BichuColors.of(context).cores;
    final textos = Theme.of(context).textTheme;
    final escolhido = valor;
    final nome = opcional ? '$rotulo (opcional)' : rotulo;

    return Semantics(
      button: true,
      label: escolhido == null
          ? '$nome, nada escolhido'
          : '$nome, ${comoTexto(escolhido)}',
      child: InkWell(
        onTap: aoTocar,
        borderRadius: BorderRadius.circular(BichuRaio.lg),
        child: Container(
          constraints: const BoxConstraints(minHeight: BichuAlvoDeToque.min),
          padding: const EdgeInsets.all(BichuEspaco.e4),
          decoration: BoxDecoration(
            color: cores.surface,
            borderRadius: BorderRadius.circular(BichuRaio.lg),
            border: Border.all(
              color: erro == null ? cores.outlineControl : cores.error,
              width: BichuBorda.hairline,
            ),
          ),
          child: Row(
            children: <Widget>[
              Expanded(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: <Widget>[
                    ExcludeSemantics(
                      child: Text(
                        nome,
                        style: textos.labelLarge
                            ?.copyWith(color: cores.textSecondary),
                      ),
                    ),
                    const SizedBox(height: BichuEspaco.e1),
                    ExcludeSemantics(
                      child: Text(
                        escolhido == null ? 'Escolher' : comoTexto(escolhido),
                        style: textos.bodyLarge
                            ?.copyWith(color: cores.textPrimary),
                      ),
                    ),
                    if (erro != null) ...<Widget>[
                      const SizedBox(height: BichuEspaco.e1),
                      Text(
                        erro!,
                        style:
                            textos.bodySmall?.copyWith(color: cores.error),
                      ),
                    ],
                  ],
                ),
              ),
              Icon(Icons.event_outlined, color: cores.textSecondary),
            ],
          ),
        ),
      ),
    );
  }
}

/// O motivo pelo qual o botao esta desabilitado, dito em voz alta.
class _MotivoDoBloqueio extends StatelessWidget {
  const _MotivoDoBloqueio({required this.texto, required this.cor});

  final String texto;
  final Color cor;

  @override
  Widget build(BuildContext context) {
    final textos = Theme.of(context).textTheme;
    return Padding(
      padding: const EdgeInsets.only(bottom: BichuEspaco.e3),
      child: Semantics(
        liveRegion: true,
        child: Text(texto, style: textos.bodyMedium?.copyWith(color: cor)),
      ),
    );
  }
}
