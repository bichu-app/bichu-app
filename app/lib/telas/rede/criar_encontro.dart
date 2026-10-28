import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:go_router/go_router.dart';

import '../../api/api_client.dart';
import '../../api/busca_de_cep.dart';
import '../../api/estados_brasileiros.dart';
import '../../api/falhas.dart';
import '../../api/mensagens_de_erro.dart';
import '../../api/envio_de_foto.dart';
import '../../api/problem.dart';
import '../../api/rede_api.dart';
import '../../dispositivo/camera_e_galeria.dart';
import '../../escopo.dart';
import '../../formato/cep.dart';
import '../../roteamento/rotas.dart';
import '../../theme/bichu_colors.dart';
import '../../theme/bichu_tokens.g.dart';
import '../../widgets/barra_de_acao_fixa.dart';
import '../../widgets/bichu_field.dart';
import '../../widgets/botao_primario.dart';
import '../../widgets/faixa_de_aviso.dart';
import '../../widgets/previa_da_foto.dart';
import '../../widgets/seletor_de_lista.dart';
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
/// **NAO HA CAMPO DE DESCRICAO DA FOTO, e a ausencia e o pedido do cliente de
/// 26/10/2026**: *"essa porra de campo e obrigatorio na criacao do evento,
/// tire essa merda"*, dentro de *"remova todos os campos de descricao de foto
/// do aplicativo, nao iremos implementar solucoes para quem usa leitor de tela
/// por enquanto"*.
///
/// Ate 27/10/2026 o campo existia porque o contrato o exigia:
/// `CommunityNetworkEventCoverInput` declarava `required: [upload_id,
/// alt_text]`, e mandar a capa sem o texto era `400`. **O contrato foi
/// afrouxado no mesmo dia**, pela condicao que ele mesmo nomeava (*"ela cai no
/// dia em que alguem pedir, e nao antes"*), e so por isso o campo pode sair:
/// `cover_image` agora vai com `upload_id` sozinho. `alt_text` continua
/// EXISTINDO no esquema como opcional, de 2 a 150 -- a tela e que deixou de
/// ter de onde preenche-lo.
///
/// **O custo, que e dele e nao meu:** a capa fica sem nome acessivel escrito
/// pelo autor, e quem usa leitor de tela cai no rotulo generico de
/// `TelaDoEncontro.nomeDaCapaSemTexto`. A imagem NAO sai da arvore de
/// acessibilidade.
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

  /// **A frase mora em `MensagensDeErro`, e esta constante aponta para ela.**
  /// O bloqueio que esta tela sabe de antemao e a recusa do servidor
  /// (`409 contact-channel-unverified`, a rede de seguranca de quem confirmou
  /// o e-mail noutro aparelho) sao a MESMA regra, e diziam a mesma coisa em
  /// duas redacoes -- que e o jeito de elas divergirem na primeira correcao.
  /// O nome publico fica: os testes de widget o usam.
  static const String semEmailConfirmado =
      MensagensDeErro.canalNaoVerificadoParaCriarEncontro;

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

  // `rotuloDoTextoDaCapa` e `ajudaDoTextoDaCapa` SAIRAM em 27/10/2026, com o
  // campo de descricao da foto (pedido do cliente de 26/10/2026). Nao os
  // devolva sem o pedido de volta: o contrato nao cobra mais `alt_text`.

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

  // ---------------------------------------------------------------------------
  // O CEP, que e CAMPO DE BUSCA e nao campo do corpo
  // ---------------------------------------------------------------------------
  //
  // Esta era a unica tela de endereco do app sem ele. `BuscaDeCep` ja serve
  // quatro (`perfil/tela_dados_pessoais`, `pet/tela_solicitar_plaquinha`,
  // `perto/sugerir_profissional` e `localizacao/captura_de_localizacao`), e
  // aqui ele troca TRES teclados por um: bairro, cidade e estado saem da busca
  // de uma vez.
  //
  // **Ele nao viaja no corpo, em nenhum ramo.**
  // `CommunityNetworkEventPlaceInput` declara `additionalProperties: false` e
  // os quatro campos que aceita (`place_name`, `neighborhood`, `city`,
  // `state`); um `postal_code` a mais seria `400` em cima de um formulario
  // inteiro preenchido. O lugar de um encontro e logradouro PUBLICO (ADR-0027
  // item 13) e o endereco por extenso e campo do painel -- guardar o CEP de
  // uma praca aqui seria inventar coluna.

  static const String rotuloDoCep = 'CEP';

  /// **Diz o que o campo faz e que ele NAO vai junto.** Sem esta segunda
  /// metade o campo pareceria endereco do evento, que e exatamente o que o
  /// ADR-0027 item 13 nao quer nesta tela.
  static const String ajudaDoCep =
      'Preenche bairro, cidade e estado. Você pode mudar depois. O CEP não '
      'é publicado.';

  /// Os tres desfechos da busca. **Nenhum e erro de formulario**: nenhum marca
  /// campo, nenhum entra em `_Impedimento` e nenhum impede o envio -- o CEP
  /// nao e campo do corpo, e o pior desfecho quer dizer "digite voce mesmo".
  static const String buscandoOCep = 'Buscando o endereço…';

  static const String cepNaoEncontrado =
      'CEP não encontrado. Preencha abaixo.';

  static const String buscaIndisponivel =
      'A busca de CEP está fora do ar. Preencha abaixo.';

  /// O rotulo do campo de estado, que deixou de ser `UF` digitada.
  static const String rotuloDoEstado = 'Estado';

  /// O que o seletor mostra enquanto nada foi escolhido.
  static const String escolherOEstado = 'Escolher na lista';

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
  // **"Escolha", e nao "digite com duas letras"**: o estado deixou de ser
  // sigla digitada e passou a ser uma escolha na lista de 27, e um motivo que
  // manda digitar manda a pessoa procurar um campo de texto que nao existe.
  semUf('Escolha o estado.'),
  semData('Escolha o dia e a hora.'),
  dataNoPassado('O evento precisa ser no futuro.'),
  fimAntesDoComeco('O fim não pode ser antes do começo.'),
  // `semTextoDaCapa` SAIU em 27/10/2026, com o campo. Ele existia porque
  // `cover_image` sem `alt_text` era `400`; o contrato afrouxou e mandar so o
  // `upload_id` passou a ser corpo valido, entao nao ha mais o que bloquear.
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

  /// **Campo de busca, e nao campo do corpo.** Ver o bloco do CEP em
  /// [TelaCriarEncontro].
  final TextEditingController _cep = TextEditingController();

  final TextEditingController _bairro = TextEditingController();
  final TextEditingController _cidade = TextEditingController();
  final TextEditingController _observacoes = TextEditingController();

  /// A sigla do estado escolhida na lista de 27, ou nulo.
  ///
  /// **Escolha e nao digitacao, e isso conserta DADO e nao so atrito.**
  /// `CommunityNetworkEventPlaceInput.state` e `pattern: '^[A-Z]{2}$'`, e um
  /// campo de dois caracteres aceita `SA`, `XX` e o `SP` com acento que o
  /// teclado de maiusculas oferece -- tudo com dois caracteres, tudo gravavel.
  /// A lista mostra o NOME e guarda a SIGLA, que e a mesma decisao de
  /// `localizacao/captura_de_localizacao.dart`, de `perfil/tela_dados_pessoais`
  /// e de `pet/tela_solicitar_plaquinha` (cliente, 17/10/2026).
  String? _uf;

  /// O que a ultima busca de CEP devolveu. **Nunca desabilita nada**: serve so
  /// para a linha de texto embaixo do campo.
  ResultadoDaBusca? _buscaDoCep;
  bool _buscandoOCep = false;

  /// O CEP que a ultima busca usou, para nao repetir a chamada a cada tecla.
  String _cepJaBuscado = '';

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

  /// A ORDEM DE TELA dos campos que o servidor pode recusar, pelas chaves do
  /// contrato.
  ///
  /// Ela existe escrita porque a recusa chega num mapa, e mapa nao tem ordem:
  /// sem esta lista, "o primeiro campo recusado" seria o primeiro que o
  /// servidor tivesse resolvido mandar.
  //
  // **`cover_image.alt_text` SAIU em 27/10/2026**, com o campo: a tela nunca
  // mais manda `alt_text`, entao o servidor nunca mais recusa esse `field`.
  static const List<String> _ordemDosCampos = <String>[
    'title',
    'summary',
    'place.place_name',
    'place.neighborhood',
    'place.city',
    'place.state',
    'starts_at',
    'ends_at',
    'notes',
  ];

  /// Onde cada campo esta na lista, para rolar ate ele.
  final Map<String, GlobalKey> _ancoras = <String, GlobalKey>{
    for (final String chave in _ordemDosCampos) chave: GlobalKey(),
  };

  /// A rolagem do corpo do formulario.
  ///
  /// Ela existe porque [_levarAoPrimeiroRecusado] tem de alcancar campo que o
  /// `ListView` **nao construiu**: sem o controlador, o unico caminho ate a
  /// lista e a `GlobalKey` do campo -- e ela nao tem `currentContext` justamente
  /// no caso que importa.
  final ScrollController _rolagem = ScrollController();

  /// O foco de cada campo de DIGITACAO.
  ///
  /// `starts_at` e `ends_at` ficam de fora: os dois abrem seletor de data e
  /// nao recebem teclado. (`cover_image.alt_text` saiu da lista em 27/10/2026,
  /// com o campo de descricao da foto.)
  ///
  /// **`place.state` TAMBEM fica de fora, desde 21/10/2026**: ele deixou de ser
  /// campo de texto e virou `SeletorDeLista`, que nao recebe teclado. Ele
  /// continua em [_ordemDosCampos] -- a ancora ainda rola ate o seletor --, mas
  /// um `FocusNode` aqui seria foco pedido a um widget que nao aceita foco.
  final Map<String, FocusNode> _focos = <String, FocusNode>{
    for (final String chave in <String>[
      'title',
      'summary',
      'place.place_name',
      'place.neighborhood',
      'place.city',
      'notes',
    ])
      chave: FocusNode(),
  };

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
    // **So sigla que esta NA LISTA.** `Me.reference_area.state` e
    // `maxLength: 2` sem `pattern`: `SA` e `XX` cabem nele. Ver
    // `siglaDeEstadoValida`, que explica por que `length == 2` nao basta.
    _uf = siglaDeEstadoValida(regiao.uf);
  }

  @override
  void dispose() {
    _titulo.dispose();
    _resumo.dispose();
    _lugar.dispose();
    _cep.dispose();
    _bairro.dispose();
    _cidade.dispose();
    _observacoes.dispose();
    for (final FocusNode foco in _focos.values) {
      foco.dispose();
    }
    _rolagem.dispose();
    super.dispose();
  }

  void _aoDigitar(String _) => setState(() {
        // A recusa anterior deixa de valer quando a pessoa muda o texto: um
        // erro de campo que sobrevive a correcao marca de errado o que ja foi
        // consertado.
        _erro = null;
        _errosDeCampo = const <String, String>{};
      });

  static final RegExp _soDigitos = RegExp(r'[^0-9]');

  /// Busca o endereco do CEP e preenche **so o que estiver VAZIO**.
  ///
  /// As tres regras sao as do pedido do cliente de 17/10/2026, e elas ja estao
  /// construidas em `perto/sugerir_profissional.dart` e em
  /// `localizacao/captura_de_localizacao.dart` -- esta e a mesma forma, e nao
  /// uma quarta redacao dela:
  ///
  /// 1. **so campo vazio recebe.** O que a pessoa escreveu vence o que a base
  ///    devolve -- inclusive o bairro, a cidade e o estado que esta tela ja
  ///    preencheu da regiao de referencia do tutor em
  ///    [didChangeDependencies]. A base erra, e quem esta olhando o lugar e a
  ///    pessoa;
  /// 2. **nada fica bloqueado depois da busca.** Os tres seguem editaveis: CEP
  ///    generico de cidade nao traz bairro;
  /// 3. **nada aqui pode impedir `Criar evento`.** Nenhum caminho desta funcao
  ///    marca erro de campo, mexe em `_impedimento` ou desabilita o botao.
  ///
  /// O `logradouro` que a busca devolve e **descartado**, e aqui a razao e mais
  /// forte que nas outras telas: nao ha campo de rua nesta tela e nao deve
  /// haver. O lugar de um encontro e logradouro PUBLICO e nunca residencia
  /// (ADR-0027 item 13), e `place.place_name` e recusado pelo servidor com
  /// `address_in_place_name` quando traz endereco embutido.
  ///
  /// **Nada aqui e geocodificado** (ADR-0006): o CEP vira TEXTO -- bairro,
  /// cidade e UF --, nunca coordenada.
  Future<void> _buscarOCep() async {
    final cep = _cep.text.replaceAll(_soDigitos, '');
    if (cep.length != 8 || cep == _cepJaBuscado) return;
    _cepJaBuscado = cep;

    setState(() {
      _buscandoOCep = true;
      _buscaDoCep = null;
    });

    final resposta = await Escopo.of(context).buscaDeCep.buscar(cep);
    if (!mounted) return;

    setState(() {
      _buscandoOCep = false;
      _buscaDoCep = resposta.resultado;
      final endereco = resposta.endereco;
      if (endereco == null) return;
      _preencherSeVazio(_bairro, endereco.bairro, 'place.neighborhood');
      _preencherSeVazio(_cidade, endereco.cidade, 'place.city');
      // **Escolha vazia recebe; escolha feita fica** -- a mesma regra dos dois
      // controladores acima. A sigla vem de servico de TERCEIRO, entao ela
      // passa pela lista antes de entrar.
      final uf = siglaDeEstadoValida(endereco.uf);
      if (_uf == null && uf != null) {
        _uf = uf;
        _errosDeCampo = <String, String>{..._errosDeCampo}
          ..remove('place.state');
      }
    });
  }

  /// Campo vazio recebe; campo escrito fica. E o erro do campo que acabou de
  /// ser preenchido sai junto -- deixar "Diga o bairro." embaixo de um bairro
  /// preenchido seria a tela discutindo consigo mesma.
  void _preencherSeVazio(
    TextEditingController campo,
    String valor,
    String chave,
  ) {
    if (valor.isEmpty || campo.text.trim().isNotEmpty) return;
    campo.text = valor;
    _errosDeCampo = <String, String>{..._errosDeCampo}..remove(chave);
  }

  /// A linha que conta o que a busca fez. **Nenhum destes estados e erro.**
  Widget _linhaDaBusca(TextTheme textos) {
    if (_buscandoOCep) {
      return Text(
        TelaCriarEncontro.buscandoOCep,
        style: textos.bodySmall,
      );
    }
    final texto = switch (_buscaDoCep) {
      ResultadoDaBusca.naoEncontrado => TelaCriarEncontro.cepNaoEncontrado,
      ResultadoDaBusca.indisponivel => TelaCriarEncontro.buscaIndisponivel,
      _ => null,
    };
    if (texto == null) return const SizedBox.shrink();
    return Text(texto, style: textos.bodySmall);
  }

  _Impedimento? get _impedimento {
    final usuario = Escopo.of(context).sessao.usuario;
    if (usuario == null) return _Impedimento.semConta;
    if (!usuario.emailVerificado) return _Impedimento.semEmailConfirmado;
    if (_titulo.text.trim().length < 2) return _Impedimento.semTitulo;
    if (_resumo.text.trim().length < 2) return _Impedimento.semResumo;
    if (_lugar.text.trim().length < 2) return _Impedimento.semLugar;
    if (_bairro.text.trim().length < 2) return _Impedimento.semBairro;
    if (_cidade.text.trim().length < 2) return _Impedimento.semCidade;
    if (_uf == null) return _Impedimento.semUf;
    final comeca = _comeca;
    if (comeca == null) return _Impedimento.semData;
    if (!comeca.isAfter(widget.agora())) return _Impedimento.dataNoPassado;
    final termina = _termina;
    if (termina != null && !termina.isAfter(comeca)) {
      return _Impedimento.fimAntesDoComeco;
    }
    // A CAPA, por ultimo, porque ela e opcional: sem foto escolhida esta nao
    // vale, e o botao fica livre. **Era um par ate 27/10/2026** -- a outra
    // metade era `semTextoDaCapa`, que saiu com o campo de descricao da foto.
    if (_enviandoACapa) return _Impedimento.capaSubindo;
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
      // Sem `trim` e sem `toUpperCase`: o valor vem de `estadosBrasileiros`,
      // que guarda a sigla ja em maiuscula e sem espaco. As duas chamadas
      // existiam porque o campo era digitado.
      uf: _uf!,
      comecaEm: _comeca!,
      terminaEm: _termina,
      observacoes: _observacoes.text.trim(),
      // **A CAPA VAI NO MESMO CORPO.** Nao ha segunda chamada de confirmacao:
      // `cover_image` e campo de `CommunityNetworkEventInput`, e e esta
      // gravacao que confirma a intencao no servidor, na mesma transacao. Sem
      // isso o objeto subiria e o varredor o recolheria em dez minutos.
      // **SEM `textoAlternativoDaCapa`**: o campo saiu da tela em 27/10/2026
      // e `alt_text` deixou de ser `required` no contrato no mesmo dia. A capa
      // vai pelo `upload_id` sozinho.
      capaUploadId: _uploadDaCapa,
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
        _erro = MensagensDeErro.de(
          falha,
          acaoEmCurso: AcaoEmCurso.criarEncontro,
        );
        _errosDeCampo = _camposRecusados(falha);
      });
      // Depois do `setState`: a ancora do campo recusado so existe na arvore
      // do quadro que a recusa produz.
      _levarAoPrimeiroRecusado();
    } on FalhaDeChamada catch (falha) {
      if (!mounted) return;
      setState(() {
        _fase = _Fase.preenchendo;
        _erro = MensagensDeErro.de(
          falha,
          acaoEmCurso: AcaoEmCurso.criarEncontro,
        );
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
  /// Rola ate o PRIMEIRO campo recusado e pede o foco dele.
  ///
  /// **O defeito que isto fecha, medido em 20/10/2026.** O servidor recusa um
  /// campo, a tela MARCA o campo -- e nao levava a pessoa ate a marca. Como o
  /// `ListView` so constroi o que cabe na tela, quem preenche os sete campos
  /// termina com a lista embaixo: a recusa de `Nome do lugar`, que e o
  /// terceiro, ficava num widget que nao estava nem construido. A pessoa toca
  /// `Criar evento`, nada visivel acontece, e a leitura dela e que o botao
  /// nao funciona.
  ///
  /// **Por que isto nao aparecia antes.** A mecanica de foco do `EditableText`
  /// mantinha, por acidente da geometria, o trecho de cima da lista visivel
  /// depois do envio -- o campo seguia focado porque tocar fora nao fechava o
  /// teclado. Quando `BichuField` passou a fechar o teclado no toque fora (o
  /// conserto dos becos de teclado, 20/10), o acidente acabou e o defeito
  /// apareceu. Ele e mais velho que o conserto.
  ///
  /// Mesmo mecanismo de `conta/tela_criar_conta.dart` e `conta/tela_entrar.
  /// dart`: `Scrollable.ensureVisible` num `addPostFrameCallback` -- o quadro
  /// da recusa ainda nao foi desenhado quando isto e chamado, e a ancora de um
  /// campo que acabou de virar visivel so tem `currentContext` depois dele --
  /// mais `requestFocus` no campo, que e o que poe o cursor onde a correcao
  /// precisa acontecer.
  /// **E O `ensureVisible` SOZINHO NAO BASTA, medido em 21/10/2026.** Ele parte
  /// da `GlobalKey` do campo, e `currentContext` e **nulo para campo que o
  /// `ListView` nao construiu** -- que e exatamente o caso que esta funcao
  /// existe para resolver. Enquanto o formulario era curto o campo recusado
  /// caia dentro da margem que a lista constroi alem da dobra, e o
  /// `ensureVisible` achava contexto por sorte da geometria. Com o CEP acima do
  /// bairro e o estado em linha propria (21/10) o formulario ficou mais alto, o
  /// campo deixou de ser construido, e a garantia caiu **em silencio**: nada
  /// lancava, a tela so nao rolava.
  ///
  /// Por isso o alcance tem duas pernas: [_rolagem] leva a janela ate perto do
  /// campo, e so ai o `ensureVisible` o centraliza.
  void _levarAoPrimeiroRecusado() {
    final String? primeiro = _ordemDosCampos
        .where(_errosDeCampo.containsKey)
        .firstOrNull;
    if (primeiro == null) return;
    _alcancar(primeiro, 0);
  }

  /// Quantos saltos de rolagem o alcance tenta antes de desistir.
  ///
  /// **NUMERO FIXO, e de proposito nao um laco.** Um laco cuja condicao e "a
  /// ancora construiu" depende do layout, e layout que nao converge nao lanca
  /// excecao: ele **pendura**, e `try`/`catch` nao pega pendura. Oito saltos de
  /// 80% da janela cobrem um formulario de mais de seis telas; o que nao couber
  /// nisso cai na degradacao, que e a marca no campo sem rolagem.
  static const int _saltosDeAlcance = 8;

  /// Leva a janela ate [campo] e o centraliza, em no maximo
  /// [_saltosDeAlcance] saltos.
  ///
  /// Cada salto e um `addPostFrameCallback` e **nunca um `await`**: nao ha
  /// `Future` nenhum aqui que possa ficar pendente para sempre. Se os quadros
  /// pararem, isto simplesmente para de progredir.
  ///
  /// **A degradacao e a marca no campo SEM rolagem, nunca "nao fazer nada".**
  /// Desistir deixa a recusa desenhada no campo e a faixa do erro no topo: a
  /// pessoa ainda ve que algo foi recusado. Rolar para o lugar errado ou perder
  /// a marca seria pior que nao rolar.
  void _alcancar(String campo, int salto) {
    WidgetsBinding.instance.addPostFrameCallback((_) {
      if (!mounted) return;
      final contexto = _ancoras[campo]?.currentContext;
      if (contexto != null) {
        Scrollable.ensureVisible(
          contexto,
          alignment: 0.5,
          duration: const Duration(milliseconds: 250),
          curve: Curves.easeOut,
        );
        // Depois de rolar, e so para campo de digitacao. Pedir foco a um campo
        // fora da tela faria o `EditableText` rolar por conta dele e disputar
        // com o `ensureVisible` acima. `place.state` nao tem foco: virou
        // seletor, e a ancora acima ja o poe na tela.
        _focos[campo]?.requestFocus();
        return;
      }
      if (salto >= _saltosDeAlcance || !_rolagem.hasClients) return;
      final posicao = _rolagem.position;
      final double passo = posicao.viewportDimension * 0.8;
      final double cru = _estaAcimaDaJanela(campo)
          ? posicao.pixels - passo
          : posicao.pixels + passo;
      final double destino =
          cru.clamp(posicao.minScrollExtent, posicao.maxScrollExtent);
      // Bateu no fim da lista sem achar: nao ha mais para onde ir, e insistir
      // seria gastar os saltos restantes no mesmo lugar.
      if (destino == posicao.pixels) return;
      _rolagem.jumpTo(destino);
      _alcancar(campo, salto + 1);
    });
  }

  /// [campo] esta ACIMA da janela?
  ///
  /// **Decidido pelos campos que o `ListView` JA construiu, e nao por
  /// adivinhacao de direcao.** [_ordemDosCampos] e a ordem de tela: se existe
  /// campo construido DEPOIS do alvo, o alvo ficou atras, e o caminho e para
  /// cima.
  ///
  /// Sem nenhuma ancora construida a resposta e "acima", e isso tambem nao e
  /// chute: quem chama e sempre o PRIMEIRO campo recusado, o mais cedo da
  /// ordem, e o topo e o lugar mais perto dele.
  bool _estaAcimaDaJanela(String campo) {
    final int alvo = _ordemDosCampos.indexOf(campo);
    bool achouConstruido = false;
    for (final MapEntry<String, GlobalKey> ancora in _ancoras.entries) {
      if (ancora.value.currentContext == null) continue;
      achouConstruido = true;
      if (_ordemDosCampos.indexOf(ancora.key) > alvo) return true;
    }
    // Ha campo construido e TODOS vem antes do alvo: ele esta abaixo.
    // Nenhum construido: para cima, pelo motivo da prosa acima.
    return !achouConstruido;
  }

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
              controller: _rolagem,
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
                  aoTirar: enviando ? null : _tirarACapa,
                  aoEscolher: enviando ? null : _escolherACapaDaGaleria,
                  aoAbrirAjustes: _abrirOsAjustes,
                ),
                const SizedBox(height: BichuEspaco.e6),
                BichuField(
                  key: _ancoras['title'],
                  foco: _focos['title'],
                  rotulo: 'Nome do evento',
                  controlador: _titulo,
                  aoMudar: _aoDigitar,
                  erro: _errosDeCampo['title'],
                  limite: 120,
                  exemplo: 'Caminhada no parque',
                  capitalizacao: TextCapitalization.sentences,
                  habilitado: !enviando,
                  acaoDeTeclado: TextInputAction.next,
                ),
                const SizedBox(height: BichuEspaco.e4),
                BichuField(
                  key: _ancoras['summary'],
                  foco: _focos['summary'],
                  rotulo: 'O que vai acontecer',
                  controlador: _resumo,
                  aoMudar: _aoDigitar,
                  erro: _errosDeCampo['summary'],
                  limite: 200,
                  linhas: 2,
                  capitalizacao: TextCapitalization.sentences,
                  habilitado: !enviando,
                  // **Sem `acaoDeTeclado`, e e decisao e nao esquecimento.**
                  // `linhas: 2` faz o Flutter usar `TextInputType.multiline`,
                  // e ali a tecla de retorno INSERE LINHA --
                  // `TextInputAction.newline` e o desfecho certo de quem
                  // escreve texto corrido. Declarar `next` aqui tiraria a
                  // quebra de linha de um campo de duas linhas. Quem fecha o
                  // teclado em campo de texto corrido e a faixa `Concluir` de
                  // `widgets/barra_do_teclado.dart`, que e mecanismo de todo o
                  // app e nao desta tela.
                ),
                const SizedBox(height: BichuEspaco.e6),
                Semantics(
                  header: true,
                  child: Text('Onde', style: textos.titleMedium),
                ),
                const SizedBox(height: BichuEspaco.e3),
                BichuField(
                  key: _ancoras['place.place_name'],
                  foco: _focos['place.place_name'],
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
                  acaoDeTeclado: TextInputAction.next,
                ),
                const SizedBox(height: BichuEspaco.e4),
                // **O CEP vem ANTES dos tres campos que ele preenche**, e a
                // ordem e o proprio recurso: quem digita primeiro o CEP nao
                // digita o resto. Ele e **opcional**, nao entra em
                // `_impedimento` e **nao viaja no corpo** -- ver o bloco do
                // CEP em `TelaCriarEncontro`.
                BichuField(
                  rotulo: TelaCriarEncontro.rotuloDoCep,
                  controlador: _cep,
                  opcional: true,
                  // 9 e nao 8: o `maxLength` do campo conta o HIFEN da
                  // mascara, e com 8 o ultimo digito seria cortado em
                  // silencio -- o CEP ficaria errado na tela e a busca sairia
                  // com sete digitos.
                  limite: limiteDoCep,
                  tipoDeTeclado: TextInputType.number,
                  ajuda: TelaCriarEncontro.ajudaDoCep,
                  // **A mascara, e nao `digitsOnly`** (cliente, 18/10:
                  // "coloque mascara no campo cep de todos os formularios").
                  // Ela mostra `01310-100`, aceita digitacao continua sem
                  // hifen, descarta o que nao e digito -- e **nao valida
                  // nada**.
                  formatadores: const <TextInputFormatter>[MascaraDeCep()],
                  correcaoAutomatica: false,
                  habilitado: !enviando,
                  acaoDeTeclado: TextInputAction.next,
                  // **SEM `autofill`, e sem `AutofillGroup` em volta do
                  // formulario -- e esta e a unica tela de CEP do app em que a
                  // ausencia e deliberada.**
                  //
                  // `AutofillHints.postalCode` oferece o CEP de CASA de quem
                  // esta digitando. Aqui o CEP e de uma praca, e o campo
                  // existe para achar o bairro DELA: a sugestao do sistema
                  // preencheria o endereco da pessoa num formulario que
                  // publica o lugar para a comunidade inteira, que e
                  // exatamente o que o ADR-0027 item 13 ("logradouro publico,
                  // nunca residencia") nao quer nesta tela.
                  //
                  // O pedido da plaquinha e o oposto e por isso ele TEM o
                  // grupo: ali o endereco e o de casa de propósito, porque e
                  // onde a plaquinha chega.
                  // No oitavo digito a busca sai sozinha. Sem botao `Buscar`:
                  // um botao a mais e um passo a mais para quem so quer os
                  // campos preenchidos, e nao buscar e desfecho valido.
                  aoMudar: (valor) {
                    _aoDigitar(valor);
                    _buscarOCep();
                  },
                ),
                // O que a busca disse, e **so isso**: nao marca campo e nao
                // desabilita nada.
                if (_buscandoOCep || _buscaDoCep != null) ...<Widget>[
                  const SizedBox(height: BichuEspaco.e2),
                  _linhaDaBusca(textos),
                ],
                const SizedBox(height: BichuEspaco.e4),
                BichuField(
                  key: _ancoras['place.neighborhood'],
                  foco: _focos['place.neighborhood'],
                  rotulo: 'Bairro',
                  controlador: _bairro,
                  aoMudar: _aoDigitar,
                  erro: _errosDeCampo['place.neighborhood'],
                  limite: 60,
                  capitalizacao: TextCapitalization.words,
                  habilitado: !enviando,
                  acaoDeTeclado: TextInputAction.next,
                ),
                const SizedBox(height: BichuEspaco.e4),
                BichuField(
                  key: _ancoras['place.city'],
                  foco: _focos['place.city'],
                  rotulo: 'Cidade',
                  controlador: _cidade,
                  aoMudar: _aoDigitar,
                  erro: _errosDeCampo['place.city'],
                  limite: 60,
                  capitalizacao: TextCapitalization.words,
                  habilitado: !enviando,
                  // **`done` e nao `next`: e o ULTIMO campo de digitacao do
                  // bloco do "Onde".** Depois dele vem o seletor de estado,
                  // que nao recebe teclado, e os dois seletores de data. `next`
                  // aqui empurraria o foco para um botao e deixaria o teclado
                  // na tela sem nada para digitar.
                  acaoDeTeclado: TextInputAction.done,
                ),
                const SizedBox(height: BichuEspaco.e4),
                // **Lista de 27, e nao sigla digitada**, pela mesma decisao de
                // 17/10/2026 que ja vale em `Meus dados`, no pedido da
                // plaquinha e no registro de achado. Ela conserta DADO e nao
                // so atrito -- ver o campo `_uf`.
                //
                // **Fora da `Row` da cidade**, e nao numa `SizedBox` de 96 px
                // ao lado dela: o seletor mostra o NOME do estado
                // ("Rio Grande do Norte"), que nao cabe em 96 px, e o campo
                // que o substituiu cabia porque mostrava duas letras.
                // **A ANCORA FICA, O FOCO NAO.** `place.state` continua em
                // `_ordemDosCampos`, entao a recusa do servidor ainda ROLA
                // ate aqui; o `FocusNode` saiu de `_focos` porque seletor
                // nao recebe teclado -- igual a `starts_at` e `ends_at`.
                // Manter nos dois pediria foco a um widget que nao aceita.
                SeletorDeLista(
                  key: _ancoras['place.state'],
                  rotulo: TelaCriarEncontro.rotuloDoEstado,
                  estadoInicial: TelaCriarEncontro.escolherOEstado,
                  itens: estadosBrasileiros,
                  selecionado: _uf,
                  erro: _errosDeCampo['place.state'],
                  habilitado: !enviando,
                  aoSelecionar: (codigo) => setState(() {
                    _uf = codigo;
                    _erro = null;
                    _errosDeCampo = const <String, String>{};
                  }),
                ),
                const SizedBox(height: BichuEspaco.e6),
                Semantics(
                  header: true,
                  child: Text('Quando', style: textos.titleMedium),
                ),
                const SizedBox(height: BichuEspaco.e3),
                _Quando(
                  key: _ancoras['starts_at'],
                  rotulo: 'Começa',
                  valor: _comeca,
                  aoTocar: enviando ? null : _escolherComeco,
                  erro: _errosDeCampo['starts_at'],
                ),
                const SizedBox(height: BichuEspaco.e3),
                _Quando(
                  key: _ancoras['ends_at'],
                  rotulo: 'Termina',
                  valor: _termina,
                  opcional: true,
                  aoTocar: enviando ? null : _escolherFim,
                  erro: _errosDeCampo['ends_at'],
                ),
                const SizedBox(height: BichuEspaco.e6),
                BichuField(
                  key: _ancoras['notes'],
                  foco: _focos['notes'],
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
                  // **Sem `acaoDeTeclado`**, pelo mesmo motivo de
                  // `O que vai acontecer`: `linhas: 3` e texto corrido, e a
                  // tecla de retorno dele e a quebra de linha. Ele e o ultimo
                  // campo da tela e o desfecho dele e a faixa `Concluir`.
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
    required this.aoTirar,
    required this.aoEscolher,
    required this.aoAbrirAjustes,
  });

  final FotoLocal? escolhida;
  final bool enviando;
  final EstadoDaPermissao permissao;
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
        // **O CAMPO DO `alt_text` SAIU em 27/10/2026**, por pedido do cliente
        // de 26/10/2026, e o contrato deixou de o exigir no mesmo dia. Nao o
        // devolva aqui: `capa_do_evento_test.dart` tem isca sobre isso.
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
    // A ancora de `starts_at` / `ends_at`, para rolar ate a recusa de data.
    super.key,
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
