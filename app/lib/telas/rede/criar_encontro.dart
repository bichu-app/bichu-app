import 'package:flutter/material.dart';
import 'package:go_router/go_router.dart';

import '../../api/api_client.dart';
import '../../api/falhas.dart';
import '../../api/mensagens_de_erro.dart';
import '../../api/envio_de_foto.dart';
import '../../api/problem.dart';
import '../../api/rede_api.dart';
import '../../dispositivo/camera_e_galeria.dart';
import '../../escopo.dart';
import '../../roteamento/rotas.dart';
import '../../theme/bichu_colors.dart';
import '../../theme/bichu_tokens.g.dart';
import '../../widgets/barra_de_acao_fixa.dart';
import '../../widgets/bichu_field.dart';
import '../../widgets/botao_primario.dart';
import '../../widgets/faixa_de_aviso.dart';
import '../../widgets/previa_da_foto.dart';
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
/// `fenced_off_leash_area`, `amenities`, `bring_items`. Essa ausencia e de
/// escopo e esta no relato da entrega, nao esquecimento: os sete encheriam de
/// controle uma tela que precisa ser curta, e nenhum deles bloqueia criar
/// encontro.
///
/// ## A CAPA ENTROU EM 19/10/2026, e ela e pedido antigo do cliente
///
/// Ele disse, literal: *"a foto que eu estou falando para criar do evento e a
/// da capa do evento"*. Ate aqui esta tela **nao perguntava a capa** -- medido:
/// nenhum arquivo de `app/lib` chamava `createNetworkEventCoverUploadIntent`
/// --, e o cabecalho deste proprio arquivo registrava a razao: a capa passaria
/// pela porta `CameraEGaleria`, que outra frente estava mexendo. As pecas
/// chegaram (`EnvioParaConfirmarDepois`, `tiposDeFotoAceitosSemHeic` e
/// `recusaDeTipoDaFoto`), e o que faltava era de fato **uma chamada** de envio.
///
/// **O padrao e o que o cliente decidiu em 19/10 e que `Meus dados` ja usa**:
/// escolher -> envia na hora -> previa do ARQUIVO LOCAL -> o botao da barra
/// confirma. **Nao ha botao separado de salvar a foto**, e a ausencia e o
/// pedido dele.
///
/// **A confirmacao sai no MESMO `POST`** que cria o encontro, por
/// `cover_image: {upload_id, alt_text}`. Dois caminhos de confirmacao para a
/// mesma foto divergem na primeira edicao -- foi o argumento que fez
/// `FotoDoUsuario` ser removida no mesmo dia.
///
/// **O `alt_text` e OBRIGATORIO**, e e por isso que esta tela ganhou um campo
/// em vez de inventar um texto: `CommunityNetworkEventCoverInput` declara
/// `required: [upload_id, alt_text]`, com `minLength: 2`, e a razao escrita no
/// contrato -- *"a imagem sem texto alternativo e a imagem que nao existe para
/// quem usa leitor de tela"*. Derivar o texto do titulo gravaria o nome do
/// evento como descricao da foto, que e outra coisa. O campo so aparece quando
/// ha capa.
///
/// **A recusa por TIPO e dita antes do envio**, por `recusaDeTipoDaFoto` com
/// `tiposDeFotoAceitosSemHeic`: o enum desta rota e mais estreito que o da foto
/// de pet e **nao aceita `image/heic`**, com a razao do servidor (*"a derivada
/// de catalogo e processada pelo mesmo caminho do painel, que nao o aceita"*).
/// Medido contra a homologacao em 19/10/2026: `image/heic` responde
/// `400 validation-failed` com `field: content_type, code: enum`, e
/// `image/jpeg` responde `201`. Na pratica o app nunca manda HEIC -- o
/// `image_picker` recodifica em JPEG nas duas plataformas, e `CameraDoAparelho`
/// passa `maxWidth`, `maxHeight` e `imageQuality` --, e a recusa existe para o
/// dia em que alguem trocar o seletor.
///
/// **A intencao abandonada vence em 600 s** (medido: `expires_at` veio
/// 2026-10-20T02:08:05Z para um pedido das 01:58:05Z) e o varredor recolhe o
/// objeto. Nao ha rota de cancelamento de intencao no contrato, e sair do
/// formulario por isso **nao chama nada**.
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

  static const String titulo = 'Criar um evento';

  static const String avisoDePublicacao =
      'O evento entra na agenda na hora, visível para todos.';

  static const String rotuloDeMarcar = 'Criar evento';

  static const String semEmailConfirmado =
      'Confirme seu e-mail antes de criar. O evento vai aparecer para toda '
      'a comunidade com o seu nome.';

  static const String rotuloDeConfirmarEmail = 'Confirmar meu e-mail';

  static const String entreParaMarcar = 'Entre para criar um evento.';

  /// O titulo da secao da capa.
  static const String tituloDaCapa = 'Foto do evento';

  /// A unica linha de apoio da secao. **Uma**, e de proposito: o cliente
  /// reprovou texto excessivo em tela, e o cartao da agenda e foto + titulo.
  static const String ajudaDaCapa =
      'A foto que aparece no cartão do evento. Opcional.';

  static const String tirarAFoto = 'Tirar foto';

  static const String escolherDaGaleria = 'Escolher da galeria';

  static const String rotuloDoTextoDaCapa = 'Descrição da foto';

  static const String ajudaDoTextoDaCapa =
      'Para quem usa leitor de tela. Sem telefone, e-mail ou link.';

  static const String aCapaEscolhida = 'A foto que você escolheu';

  static const String capaProntaParaSalvar =
      'Foto enviada. Toque em criar evento para publicar com ela.';

  static const String capaSemSinal =
      'A foto não subiu: sem conexão agora. Escolha a foto de novo quando '
      'tiver internet.';

  static const String capaRecusada =
      'A foto não foi aceita. Escolha outra foto.';

  static const String cameraNosAjustes =
      'A câmera está bloqueada nos ajustes do sistema.';

  static const String abrirAjustes = 'Abrir os ajustes';

  @override
  State<TelaCriarEncontro> createState() => _TelaCriarEncontroState();
}

enum _Fase { preenchendo, enviando }

/// O primeiro impedimento, ou nulo. **A ordem importa**: o que a pessoa nao
/// resolve nesta tela vem antes do que ela resolve digitando.
enum _Impedimento {
  semConta(TelaCriarEncontro.entreParaMarcar),
  semEmailConfirmado(TelaCriarEncontro.semEmailConfirmado),
  semTitulo('Dê um nome ao evento.'),
  semResumo('Diga em uma linha o que vai acontecer.'),
  semLugar('Diga o nome do lugar.'),
  semBairro('Diga o bairro.'),
  semCidade('Diga a cidade.'),
  semUf('Diga o estado, com duas letras.'),
  semData('Escolha o dia e a hora.'),
  dataNoPassado('O evento precisa ser no futuro.'),
  fimAntesDoComeco('O fim não pode ser antes do começo.'),
  // **So vale quando HA capa enviada**, e e por isso que ele vem depois de
  // tudo: a capa e opcional, e um evento sem foto e estado normal
  // (`cover_image_url` nulo, e a agenda desenha o banner da marca). O que nao
  // e normal e mandar `cover_image` sem `alt_text`: o esquema declara os dois
  // como obrigatorios, e o servidor responde `400` depois de a pessoa ter
  // esperado o envio inteiro.
  semTextoDaCapa('Escreva uma descrição para a foto.'),
  // A foto esta subindo. Criar agora mandaria o `upload_id` que ainda nao
  // existe -- ou, pior, nenhum -- e publicaria o evento sem a capa que a
  // pessoa escolheu, sem dizer nada.
  capaSubindo('Espere a foto terminar de subir.');

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

  /// O `alt_text` da capa. **Nao e legenda** e nao e desenhado sobre a foto:
  /// `CommunityNetworkEventCoverInput.alt_text` e rotulo para leitor de tela.
  final TextEditingController _textoDaCapa = TextEditingController();

  DateTime? _comeca;
  DateTime? _termina;

  /// A capa que a pessoa escolheu no aparelho. **A fonte da PREVIA, e ela vem
  /// do ARQUIVO LOCAL.**
  ///
  /// Nao se espera a derivada do servidor: ela so existe depois de o worker
  /// rodar, e o encontro ainda nem existe neste momento. Medido contra a
  /// homologacao: `POST /v1/network/events` devolveu `201` com
  /// `cover_image_url: null`, e a derivada
  /// (`https://img-hml.bichu.app/events/card/...jpeg`) apareceu depois.
  FotoLocal? _capaEscolhida;

  /// O `upload_id` de uma capa cujos **bytes ja estao no armazenamento** e que
  /// ainda **nao foi confirmada**, ou nulo quando nao ha nenhuma.
  ///
  /// E ele que vai em `cover_image.upload_id` no `POST`. Fica nulo quando o
  /// envio falhou: um identificador de bytes que nao subiram volta
  /// `400 upload_not_usable` sem dizer por que.
  String? _uploadDaCapa;

  bool _enviandoACapa = false;

  /// Comeca em `negada` como nas outras telas de foto: `negada` e o estado em
  /// que ainda da para PEDIR, e e o unico seguro de supor antes de perguntar.
  EstadoDaPermissao _permissaoDaCamera = EstadoDaPermissao.negada;

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
    _lerAPermissaoDaCamera();
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
    _textoDaCapa.dispose();
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
    // A CAPA, por ultimo, porque ela e opcional: sem foto escolhida nenhuma
    // destas duas vale, e o botao fica livre.
    if (_enviandoACapa) return _Impedimento.capaSubindo;
    if (_uploadDaCapa != null && _textoDaCapa.text.trim().length < 2) {
      return _Impedimento.semTextoDaCapa;
    }
    return null;
  }

  // -------------------------------------------------------------------------
  // A CAPA DO EVENTO (19/10/2026)
  // -------------------------------------------------------------------------

  /// O estado da camera, lido **antes** de a pessoa tocar em nada.
  ///
  /// E o que permite a tela nao desenhar `Tirar foto` em aparelho sem camera:
  /// botao que nao leva a nada e pior que a ausencia dele. Mesmo arranjo de
  /// `Meus dados`, do cadastro de foto do pet e do registro de achado.
  Future<void> _lerAPermissaoDaCamera() async {
    final estado = await Escopo.of(context).camera.estadoDaCamera();
    if (!mounted) return;
    setState(() => _permissaoDaCamera = estado);
  }

  /// `Tirar foto`. Pede a permissao quando ainda da para pedir, e desiste
  /// calada quando nao da -- a faixa de ajustes ja esta na tela nesse caso.
  Future<void> _tirarACapa() async {
    final camera = Escopo.of(context).camera;
    var estado = _permissaoDaCamera;
    if (estado == EstadoDaPermissao.negada) {
      estado = await camera.pedirCamera();
      if (!mounted) return;
      setState(() => _permissaoDaCamera = estado);
    }
    if (estado != EstadoDaPermissao.concedida) return;
    final foto = await camera.tirarFoto();
    if (!mounted) return;
    if (foto != null) await _escolheuACapa(foto);
  }

  Future<void> _escolherACapaDaGaleria() async {
    final foto = await Escopo.of(context).camera.escolherDaGaleria();
    if (!mounted) return;
    if (foto != null) await _escolheuACapa(foto);
  }

  Future<void> _abrirOsAjustes() =>
      Escopo.of(context).camera.abrirAjustesDoSistema();

  /// A capa escolhida **JA SOBE**, e a previa aparece antes de o servidor
  /// dizer qualquer coisa.
  ///
  /// Padrao decidido pelo cliente em 19/10/2026 e ja construido em `Meus
  /// dados`: *"quando o usuario fizer o upload de qualquer foto no app, voce
  /// deve fazer o upload e apresentar como vai ficar de preview, e ao salvar o
  /// voce salva a foto"*. **Nao ha botao separado de salvar a foto.**
  ///
  /// **A previa e pintada ANTES do envio**: este `setState` corre antes do
  /// primeiro `await`, entao o quadro com a imagem do arquivo local ja esta na
  /// tela enquanto os bytes sobem.
  ///
  /// **Trocar de foto antes de criar**: o `upload_id` anterior e descartado
  /// aqui, no mesmo `setState`. O objeto do primeiro envio fica no
  /// armazenamento e cai no expurgo de dez minutos do servidor -- nao ha rota
  /// de cancelamento de intencao no contrato, e inventar uma seria inventar
  /// rota.
  Future<void> _escolheuACapa(FotoLocal foto) async {
    // A RECUSA POR TIPO, dita ANTES do envio, e com a lista SEM HEIC: o enum
    // de `NetworkEventCoverIntentInput` e `[image/jpeg, image/png,
    // image/webp]`, mais estreito que o da foto de pet. Medido contra a
    // homologacao: `image/heic` -> `400 validation-failed`
    // (`field: content_type`, `code: enum`); `image/jpeg` -> `201`.
    final recusa =
        recusaDeTipoDaFoto(foto.tipoDeConteudo, tiposDeFotoAceitosSemHeic);
    if (recusa != null) {
      setState(() {
        _capaEscolhida = null;
        _uploadDaCapa = null;
        _erro = MensagemDeErro(texto: recusa);
      });
      return;
    }

    setState(() {
      _capaEscolhida = foto;
      _uploadDaCapa = null;
      _erro = null;
      _enviandoACapa = true;
    });

    // O escopo e lido ANTES do primeiro `await`, como no resto desta tela.
    final escopo = Escopo.of(context);
    // `EnvioParaConfirmarDepois` com a FUNCAO DA ROTA, e nao com uma etiqueta
    // de proposito: `NetworkEventCoverIntentInput` nao tem campo `purpose`, e
    // e a rota (`POST /v1/media/network-event-cover-intents`) que fixa o
    // `network_event`. Era uma troca de funcao de assinatura identica que
    // gravou `network_event` numa foto de PESSOA nesta mesma rodada, e passar
    // a rota e o que torna a troca visivel.
    final destino = EnvioParaConfirmarDepois(
      pedir: RedeApi(escopo.api).intencaoDeCapaDoEncontro,
    );
    final desfecho = await escopo.envioDeFoto.enviar(
      foto: foto,
      destino: destino,
    );
    if (!mounted) return;

    setState(() {
      _enviandoACapa = false;
      switch (desfecho) {
        case DesfechoDoEnvio.enviada:
          _uploadDaCapa = destino.uploadId;
        case DesfechoDoEnvio.semSinal:
          // **A previa SAI quando o envio falha**, e isso nao e perder o
          // trabalho da pessoa: o `POST` nao teria o que confirmar, e manter
          // um retrato na tela depois de um envio que nao aconteceu e a tela
          // prometendo uma foto que nao existe.
          _capaEscolhida = null;
          _erro = const MensagemDeErro(
            texto: TelaCriarEncontro.capaSemSinal,
          );
        case DesfechoDoEnvio.recusada:
          _capaEscolhida = null;
          _erro = const MensagemDeErro(
            texto: TelaCriarEncontro.capaRecusada,
          );
      }
    });
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
      // **A CAPA VAI NO MESMO CORPO.** Nao ha segunda chamada de confirmacao:
      // `cover_image` e campo de `CommunityNetworkEventInput`, e e esta
      // gravacao que confirma a intencao no servidor, na mesma transacao. Sem
      // isso o objeto subiria e o varredor o recolheria em dez minutos.
      capaUploadId: _uploadDaCapa,
      textoAlternativoDaCapa: _textoDaCapa.text.trim(),
    );
    final chave = _chave ??= ApiClient.novaChaveDeIdempotencia();

    try {
      await RedeApi(escopo.api).criar(corpo, idempotencyKey: chave);
      if (!mounted) return;
      // **VAI PARA A AGENDA, e nao mais para o proprio encontro.**
      //
      // Ate 19/10/2026 esta linha era
      // `context.pushReplacement(Rotas.encontroDaRedeDe(encontro.slug))`, com
      // a razao escrita: *"mostrar uma tela de pronto seria esconder o
      // resultado que a pessoa precisa ver: o encontro como a comunidade o
      // ve"*. A RAZAO CONTINUA VALENDO e e ela que escolhe este destino -- o
      // que mudou foi onde a comunidade ve o evento. A pagina de detalhe saiu
      // por decisao do cliente, e o lugar onde o evento aparece para todo
      // mundo passou a ser o cartao da agenda.
      //
      // `go` e nao `pushReplacement`, como em `perto/sugerir_profissional.dart`:
      // `/rede` e um ramo da casca de abas, e empilha-lo poria a casca
      // dentro de uma tela irma da casca. `go` troca de ramo e fecha a tarefa.
      //
      // `encontro.slug` deixou de ser lido aqui; `criar` continua devolvendo o
      // encontro inteiro, e o campo segue no contrato.
      context.go(Rotas.rede);
    } on FalhaDeConexao {
      if (!mounted) return;
      // **NAO vai para a fila offline.** Criar encontro publica na hora; uma
      // acao enfileirada publicaria horas depois, sem ninguem na tela, num
      // horario que pode ja ter passado. A pessoa tenta de novo quando tiver
      // rede, e a chave de idempotencia continua a mesma.
      setState(() {
        _fase = _Fase.preenchendo;
        _erro = const MensagemDeErro(
          texto: 'Sem conexão agora. O evento entra na agenda assim que você '
              'tocar em criar com internet.',
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
                _BlocoDaCapa(
                  escolhida: _capaEscolhida,
                  enviando: _enviandoACapa,
                  permissao: _permissaoDaCamera,
                  textoAlternativo: _textoDaCapa,
                  erroDoTexto: _errosDeCampo['cover_image.alt_text'],
                  aoDigitarOTexto: _aoDigitar,
                  aoTirar: enviando ? null : _tirarACapa,
                  aoEscolher: enviando ? null : _escolherACapaDaGaleria,
                  aoAbrirAjustes: _abrirOsAjustes,
                ),
                const SizedBox(height: BichuEspaco.e6),
                BichuField(
                  rotulo: 'Nome do evento',
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
                  ajuda: 'Um lugar público. Sem endereço.',
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
              // `semTextoDaCapa` e `capaSubindo` CAEM AQUI de proposito: os
              // dois sao resolvidos no corpo da tela, e o motivo acima do
              // botao e a unica coisa que explica por que ele esta apagado.
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

/// A CAPA DO EVENTO: o quadro, os dois botoes e o texto alternativo.
///
/// ## O que este bloco NAO tem, e a ausencia e o pedido do cliente
///
/// **Nenhum botao de salvar a foto.** O envio sai na ESCOLHA e a confirmacao
/// sai no `Criar evento` da barra, que e o unico botao primario desta tela.
/// Era o segundo botao que fazia a pessoa tocar no botao da barra e receber
/// "Nada mudou desde a ultima vez" com a previa desenhada acima -- o defeito
/// que ele relatou em 19/10 e que fez `Salvar a foto` sair de `Meus dados`.
///
/// **Nenhum botao de remover a capa.** Escolher outra substitui, e e o unico
/// caminho que o contrato tem: `cover_image: null` existe em
/// `CommunityNetworkEventPatch` (a EDICAO) e nao em
/// `CommunityNetworkEventInput`. Um `Remover` aqui prometeria uma operacao que
/// a criacao nao declara.
///
/// ## A proporcao e 16:9 porque e a do CARTAO
///
/// O cartao da agenda desenha a capa em 16:9 (`ImagemDoEncontroOuBanner`), e a
/// derivada de banner do servidor e 1280 x 720. Uma previa quadrada mostraria
/// um enquadramento que a agenda nao vai usar -- e "apresentar como vai ficar"
/// foi a palavra do cliente.
class _BlocoDaCapa extends StatelessWidget {
  const _BlocoDaCapa({
    required this.escolhida,
    required this.enviando,
    required this.permissao,
    required this.textoAlternativo,
    required this.erroDoTexto,
    required this.aoDigitarOTexto,
    required this.aoTirar,
    required this.aoEscolher,
    required this.aoAbrirAjustes,
  });

  final FotoLocal? escolhida;
  final bool enviando;
  final EstadoDaPermissao permissao;
  final TextEditingController textoAlternativo;
  final String? erroDoTexto;
  final ValueChanged<String> aoDigitarOTexto;
  final VoidCallback? aoTirar;
  final VoidCallback? aoEscolher;
  final VoidCallback aoAbrirAjustes;

  /// A altura do quadro. 180 dp dao 16:9 numa tela de 360 dp com as margens de
  /// 16 dp dos dois lados -- 328 / 16 * 9 = 184,5, e 180 cabe sem estourar em
  /// tela mais estreita.
  static const double alturaDoQuadro = 180;

  @override
  Widget build(BuildContext context) {
    final cores = BichuColors.of(context).cores;
    final textos = Theme.of(context).textTheme;
    final local = escolhida;

    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: <Widget>[
        Semantics(
          header: true,
          child: Text(TelaCriarEncontro.tituloDaCapa, style: textos.titleMedium),
        ),
        const SizedBox(height: BichuEspaco.e1),
        Text(
          TelaCriarEncontro.ajudaDaCapa,
          style: textos.bodySmall?.copyWith(color: cores.textSecondary),
        ),
        const SizedBox(height: BichuEspaco.e3),
        ClipRRect(
          borderRadius: BorderRadius.circular(BichuRaio.lg),
          child: SizedBox(
            height: alturaDoQuadro,
            width: double.infinity,
            child: local != null
                // `PreviaDaFoto` porque desenhar arquivo do aparelho pede
                // `dart:io`, que o portao de diretivas proibe dentro de
                // `lib/telas` -- com razao: foi assim que uma tela imprimiu o
                // caminho do arquivo em vez da imagem. E ela ja pede
                // `cacheWidth` ao decodificador.
                ? PreviaDaFoto(
                    foto: local,
                    descricao: TelaCriarEncontro.aCapaEscolhida,
                    altura: alturaDoQuadro,
                  )
                : _QuadradoSemCapa(cores: cores, enviando: enviando),
          ),
        ),
        const SizedBox(height: BichuEspaco.e3),
        // A ORIENTACAO DE 5 MB, uma linha, do ponto unico
        // `orientacaoDeTamanhoDaImagem`: o teto vale na politica assinada e no
        // servidor (`byte_size.maximum: 5242880`), e um texto proprio aqui
        // seria o segundo numero que divergiria do primeiro.
        Text(
          orientacaoDeTamanhoDaImagem,
          style: textos.bodySmall?.copyWith(color: cores.textSecondary),
        ),
        const SizedBox(height: BichuEspaco.e3),
        if (permissao == EstadoDaPermissao.negadaPermanentemente) ...<Widget>[
          FaixaDeAviso(
            peso: PesoDaFaixa.informativo,
            texto: TelaCriarEncontro.cameraNosAjustes,
            rotuloDaAcao: TelaCriarEncontro.abrirAjustes,
            aoTocarNaAcao: aoAbrirAjustes,
          ),
          const SizedBox(height: BichuEspaco.e3),
        ],
        // **Sem camera o botao SOME.** O oposto do caso acima e deliberado:
        // ali ha o que liberar e o botao ensina isso; aqui nao ha, e um botao
        // que nao leva a nada e pior que a ausencia dele. A galeria continua, e
        // ela nao tem estado de permissao proprio (ver `CameraDoAparelho`).
        if (permissao != EstadoDaPermissao.indisponivel) ...<Widget>[
          BotaoSecundario(
            rotulo: TelaCriarEncontro.tirarAFoto,
            aoTocar: enviando ? null : aoTirar,
          ),
          const SizedBox(height: BichuEspaco.e2),
        ],
        OutlinedButton(
          onPressed: enviando ? null : aoEscolher,
          style: OutlinedButton.styleFrom(
            minimumSize: const Size.fromHeight(BichuAlvoDeToque.min),
          ),
          child: const Text(TelaCriarEncontro.escolherDaGaleria),
        ),
        // O CAMPO DO `alt_text`, **so quando ha foto**: ele e obrigatorio
        // quando a capa vai no corpo (`required: [upload_id, alt_text]`) e nao
        // tem o que descrever quando nao ha capa. Pedi-lo antes seria cobrar
        // texto sobre uma foto que a pessoa talvez nem escolha.
        if (local != null) ...<Widget>[
          const SizedBox(height: BichuEspaco.e4),
          BichuField(
            rotulo: TelaCriarEncontro.rotuloDoTextoDaCapa,
            controlador: textoAlternativo,
            aoMudar: aoDigitarOTexto,
            erro: erroDoTexto,
            // `maxLength: 150` do contrato, e nao um numero escolhido aqui.
            limite: 150,
            exemplo: 'Cães correndo na grama do parque',
            // D59: o servidor recusa telefone, e-mail, link e chave PIX em
            // `cover_image.alt_text` tambem. Dito antes, e nao descoberto pelo
            // 400.
            ajuda: TelaCriarEncontro.ajudaDoTextoDaCapa,
            capitalizacao: TextCapitalization.sentences,
            habilitado: !enviando,
          ),
        ],
      ],
    );
  }
}

/// O lugar da capa quando nao ha capa.
///
/// Fundo afundado, borda de cabelo e o simbolo: o mesmo desenho que a foto
/// ocuparia, dizendo que cabe uma foto ali. **Sem frase**: o cliente mandou
/// tirar texto de apoio do app, e os dois botoes logo abaixo ja dizem o que
/// fazer.
class _QuadradoSemCapa extends StatelessWidget {
  const _QuadradoSemCapa({required this.cores, required this.enviando});

  final BichuCores cores;

  /// Os bytes estao subindo. Troca o simbolo por um indicador -- e a diferenca
  /// entre "cabe uma foto aqui" e "a sua foto esta subindo", dita sem uma
  /// linha de texto nova.
  final bool enviando;

  @override
  Widget build(BuildContext context) {
    return Container(
      alignment: Alignment.center,
      decoration: BoxDecoration(
        color: cores.surfaceSunken,
        borderRadius: BorderRadius.circular(BichuRaio.lg),
        border: Border.all(color: cores.outline, width: BichuBorda.hairline),
      ),
      child: enviando
          ? const CircularProgressIndicator()
          : Icon(
              Icons.photo_camera_outlined,
              color: cores.textSecondary,
              size: 32,
            ),
    );
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
