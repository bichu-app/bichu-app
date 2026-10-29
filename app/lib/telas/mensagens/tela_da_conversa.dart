/// A CONVERSA ABERTA: ler o que o achador escreveu, paginar e responder.
///
/// ---------------------------------------------------------------------------
/// ## O 410, e por que ele NAO e um defeito nesta tela
///
/// `postConversationMessage` recusa com **`410 conversation-closed`** em tres
/// situacoes, e o corpo e o **mesmo** nas tres:
///
///   1. a conversa foi encerrada (ou o caso ligado a ela foi);
///   2. a conversa foi bloqueada por um dos dois lados;
///   3. **a conta do outro lado foi desabilitada** -- travado nos dois
///      sentidos, de propósito.
///
/// A fusao e deliberada e e de seguranca: distinguir contaria a esta pessoa o
/// que aconteceu com a conta da outra. A consequencia de tela e o que este
/// arquivo cumpre -- **o 410 nao aparece como erro**. Ele leva a conversa para
/// modo leitura e **a caixa de texto desaparece**, porque um campo que sempre
/// falha e pior que nenhum campo: a pessoa escreveria duas vezes o mesmo texto
/// antes de entender.
///
/// Os dois caminhos de 410 estao cobertos, e precisam estar:
///
///   - **no carregamento**, por `status` (`closed` ou `blocked`): a tela abre
///     ja em modo leitura e nunca desenha a caixa;
///   - **no envio**, quando a conversa fechou entre o carregamento e o toque:
///     a caixa desaparece na resposta, e o texto da pessoa **nao e perdido** --
///     ele vai para a faixa, porque ela pode querer copia-lo.
///
/// ## A FALHA DE ENVIO NAO PERDE O QUE A PESSOA ESCREVEU
///
/// Nenhum caminho deste arquivo limpa o campo antes de o servidor confirmar.
/// O `controlador.clear()` acontece **uma vez**, depois do `await` que deu
/// `201`. Falha de rede, 429, 400 e 5xx deixam o texto no campo e acendem a
/// faixa com `Tentar de novo`; o reenvio e sempre **um toque da pessoa**, e
/// nunca automatico -- repetir sozinho uma mensagem que talvez tenha chegado e
/// como o tutor recebe a mesma frase duas vezes.
///
/// ---------------------------------------------------------------------------
/// ## A FOTO: OS BYTES SOBEM NA ESCOLHA, A MENSAGEM SAI NO TOQUE
///
/// Sao dois momentos, e nao um. Pedido do cliente de 19/10/2026, literal:
/// *"quando o usuario fizer o upload de qualquer foto no app, voce deve fazer o
/// upload e apresentar como vai ficar de preview, e ao salvar o voce salva a
/// foto"*. Aqui o "salvar" e o toque em Enviar.
///
/// O mecanismo reusado e `EnvioDeFoto` + `EnvioParaConfirmarDepois`
/// (`api/envio_de_foto.dart`), que e o **unico caminho de bytes do app** e ja
/// existia exatamente com esta forma: ele sobe os bytes e GUARDA o `upload_id`
/// em vez de confirmar, e quem confirma e o toque seguinte. Escrever um segundo
/// caminho de envio aqui criaria a copia que diverge na troca de provedor de
/// armazenamento.
///
/// **NADA vai para a conversa antes da confirmacao.** Foto mandada por engano
/// nao se desfaz como rascunho: ela chega no aparelho da outra pessoa. E por
/// isso que a previa e o estado central desta tela, e nao um detalhe.
///
/// **NAO EXISTE MENSAGEM SO-FOTO.** `body` e `minLength: 1` no contrato e o
/// `CHECK` de `mediated_messages.body` exige texto nao vazio: a foto vai com
/// legenda. A tela diz isso na previa, antes de a pessoa tocar num botao que
/// nao responderia.
///
/// **O botao de anexar nao aparece sem `found_report_id`.** Ver
/// `Conversa.foundReportId`: o campo nao esta no contrato hoje, e sem ele nao
/// ha valor valido para pedir a autorizacao de upload. Desenhar o botao de todo
/// jeito seria o toque sem desfecho que o criterio 2 da BICHUS-62 proibe.
///
/// ## Paginacao por CURSOR, e para TRAS
///
/// `getConversation` pagina as mensagens por `cursor`, e nunca por
/// deslocamento. O botao fica no **topo** porque e isso que ele faz: busca o
/// que veio antes. Sem rolagem infinita (design system 11.20).
library;

import 'package:flutter/material.dart';

import '../../api/falhas.dart';
import '../../api/mensagens_de_erro.dart';
import '../../api/conversas_api.dart';
import '../../api/envio_de_foto.dart';
import '../../widgets/recorte_de_imagem.dart';
import '../../api/modelos_conversa.dart';
import '../../dispositivo/camera_e_galeria.dart';
import '../../escopo.dart';
import '../../theme/bichu_colors.dart';
import '../../theme/bichu_tokens.g.dart';
import '../../widgets/convite_para_entrar.dart';
import '../../widgets/faixa_de_aviso.dart';
import '../../widgets/botao_primario.dart';
import '../../widgets/marca_da_pessoa.dart';
import '../../widgets/saida_da_tela.dart';
import 'area_de_mensagens.dart';
import 'foto_na_barra_de_escrever.dart';
import 'textos_da_foto_na_conversa.dart';
import 'titulo_da_conversa.dart';

class TelaDaConversa extends StatefulWidget {
  const TelaDaConversa({
    required this.conversaId,
    super.key,
    this.conversas,
    this.camera,
    this.envioDeFoto,
    this.intencaoDeFoto,
  });

  /// O cliente de conversa. Nulo usa o do [Escopo]. Ver [AreaDeMensagens].
  final ConversasApi? conversas;

  /// A porta da camera e da galeria. Nulo usa a do [Escopo].
  ///
  /// Injetavel pelo mesmo motivo de [conversas]: e o que permite a isca
  /// exercitar escolha, previa, progresso e descarte **sem aparelho**, pelo
  /// caminho de producao -- em vez de um dublê de tela que devolve "escolhida"
  /// por conta propria.
  final CameraEGaleria? camera;

  /// O unico caminho de bytes do app. Nulo usa o do [Escopo].
  final EnvioDeFoto? envioDeFoto;

  /// Quem emite a autorizacao de upload da foto desta conversa. Nulo usa
  /// `Escopo.achados`, que e `AchadosApi`.
  ///
  /// **Interface estreita e nao a classe**, pela mesma razao de
  /// `IntencaoEConfirmacaoDePet`: esta tela nao deve alcancar `registrar` nem
  /// `listarMeus` de achados.
  final IntencaoDeFotoDeAchado? intencaoDeFoto;

  /// O id vem do caminho. **Nao e pintado em lugar nenhum** (ADR-0010).
  final String conversaId;

  @override
  State<TelaDaConversa> createState() => _EstadoDaTelaDaConversa();
}

class _EstadoDaTelaDaConversa extends State<TelaDaConversa> {
  final TextEditingController _controlador = TextEditingController();
  final List<MensagemDaConversa> _mensagens = <MensagemDaConversa>[];

  ConversasApi get _api =>
      widget.conversas ?? ConversasApi(Escopo.of(context).api);

  CameraEGaleria get _camera => widget.camera ?? Escopo.of(context).camera;

  EnvioDeFoto get _envio => widget.envioDeFoto ?? Escopo.of(context).envioDeFoto;

  IntencaoDeFotoDeAchado get _intencaoDeFoto =>
      widget.intencaoDeFoto ?? Escopo.of(context).achados;

  // -------------------------------------------------------------------------
  // A FOTO ESCOLHIDA
  // -------------------------------------------------------------------------

  /// A foto que a pessoa escolheu e **ainda nao mandou**. Nula sem previa.
  FotoLocal? _foto;

  FaseDaFotoEscolhida _faseDaFoto = FaseDaFotoEscolhida.subindo;

  /// Bytes do arquivo ja aceitos pelo socket, e o total. Ver
  /// `ProgressoDeEnvio` em `api/envio_de_foto.dart`: o numero mede
  /// contrapressao, e nao tempo decorrido.
  int _bytesEnviados = 0;
  int _bytesTotais = 0;

  /// O texto da recusa, **do servidor quando ele mandou um**.
  String? _motivoDaRecusaDaFoto;

  /// O destino que guarda o `upload_id` depois de os bytes chegarem.
  ///
  /// `uploadId` dele continua nulo quando o envio nao terminou bem, e e esse
  /// nulo que distingue "ha foto para mandar" de "ha foto escolhida".
  EnvioParaConfirmarDepois? _destinoDaFoto;

  /// Quantas vezes a mensagem foi recusada por **higiene da foto em curso**.
  ///
  /// Zerado a cada escolha nova. Ver [_esperasDoPreparo].
  int _tentativasDePreparo = 0;

  /// A espera entre as tentativas quando o servidor diz que a foto nao esta
  /// pronta: **crescente, e com fim**.
  ///
  /// Crescente porque a higiene e assincrona e insistir em rajada so gasta a
  /// rede da pessoa. Com fim porque um laco sem teto deixaria a tela em
  /// "preparando" para sempre numa falha que nao e temporaria -- e ai a saida
  /// honesta e dizer que nao foi, preservando a previa.
  ///
  /// Soma: 6,4 s. E a janela em que a derivada sem metadado de uma foto de
  /// celular fica pronta, e os bytes ja subiram na ESCOLHA -- entao na pratica
  /// a primeira tentativa quase sempre passa, e esta lista cobre a corrida e
  /// nao o caminho comum.
  static const List<Duration> _esperasDoPreparo = <Duration>[
    Duration(milliseconds: 400),
    Duration(milliseconds: 800),
    Duration(milliseconds: 1600),
    Duration(milliseconds: 3600),
  ];

  Conversa? _conversa;
  String? _cursor;
  bool _carregando = true;
  bool _carregandoAnteriores = false;
  bool _enviando = false;

  /// Por que a tela nao carregou. Nulo quando carregou.
  String? _falhaDeCarga;

  /// A falha de carga foi **falta de conta**, e nao defeito. Ver [faltaConta].
  ///
  /// **Esta tela e o destino do toque na notificacao**: quem foi deslogada
  /// chega aqui direto, sem passar pela area de mensagens, e sem isto leria
  /// `Nao conseguimos carregar suas mensagens. Toque em Tentar de novo.` --
  /// um conselho impossivel de seguir sem conta.
  bool _faltaConta = false;

  /// Por que o ENVIO falhou. Nulo quando nao falhou.
  ///
  /// Separado de [_falhaDeCarga] de propósito: sao duas falhas com duas saidas
  /// diferentes, e uma variavel so faria `Tentar de novo` recarregar a tela
  /// quando o que falhou foi a mensagem -- jogando fora o texto digitado pelo
  /// caminho menos exercitado a mao.
  String? _falhaDeEnvio;

  /// A conversa fechou. Vem do `status` no carregamento, **ou do 410 no
  /// envio**.
  bool _emLeitura = false;

  @override
  void initState() {
    super.initState();
    WidgetsBinding.instance.addPostFrameCallback((_) => _carregar());
  }

  @override
  void dispose() {
    _controlador.dispose();
    super.dispose();
  }

  Future<void> _carregar() async {
    setState(() {
      _carregando = true;
      _falhaDeCarga = null;
      _faltaConta = false;
    });
    try {
      final conversa = await _api.buscar(widget.conversaId);
      if (!mounted) return;
      setState(() {
        _conversa = conversa;
        _mensagens
          ..clear()
          ..addAll(conversa.messages);
        _cursor = conversa.nextCursor;
        // MODO LEITURA JA NA ABERTURA quando o estado nao aceita mensagem.
        // `closed` e `blocked` caem aqui pela mesma porta, que e a mesma regra
        // do servidor (`aceitaMensagem`).
        _emLeitura = !conversa.status.aceitaMensagem;
        _carregando = false;
      });
    } on FalhaDaApi catch (falha) {
      if (!mounted) return;
      setState(() {
        _carregando = false;
        // 404 e o desenho, e nao um defeito: conversa de outra pessoa responde
        // 404 e NUNCA 403 (ADR-0021), porque um 403 confirmaria que aquele id
        // existe. A tela diz que nao esta disponivel e manda voltar -- ela nao
        // diz "nao e sua", que seria a confirmacao pelo texto.
        // `next_action: sign_in` do servidor, e **antes** do 404: medido,
        // `/v1/conversations/{id}` sem token responde `401 unauthenticated`,
        // e nao 404 -- o 404 e para conversa que existe e nao e sua.
        _faltaConta = faltaConta(falha);
        _falhaDeCarga = _faltaConta
            ? null
            : falha.problem.status == 404
                ? TextosDasMensagens.conversaIndisponivel
                : TextosDasMensagens.naoConseguimosCarregar;
      });
    } on FalhaDeChamada catch (falha) {
      if (!mounted) return;
      setState(() {
        _carregando = false;
        _faltaConta = faltaConta(falha);
        _falhaDeCarga =
            _faltaConta ? null : TextosDasMensagens.naoConseguimosCarregar;
      });
    } on FormatException {
      if (!mounted) return;
      setState(() {
        _carregando = false;
        _falhaDeCarga = TextosDasMensagens.naoConseguimosCarregar;
      });
    }
  }

  /// As mensagens anteriores, **por cursor**.
  Future<void> _carregarAnteriores() async {
    final cursor = _cursor;
    if (cursor == null || _carregandoAnteriores) return;
    setState(() => _carregandoAnteriores = true);
    try {
      final pagina = await _api.buscar(widget.conversaId, cursor: cursor);
      if (!mounted) return;
      setState(() {
        // As anteriores entram no COMECO: elas vieram antes das que estao na
        // tela. `addAll` as poria no fim e a conversa leria fora de ordem.
        _mensagens.insertAll(0, pagina.messages);
        _cursor = pagina.nextCursor;
        _carregandoAnteriores = false;
      });
    } on FalhaDeChamada {
      if (!mounted) return;
      // A lista ja carregada FICA (11.20): o recorte nao mudou.
      setState(() {
        _carregandoAnteriores = false;
        _falhaDeEnvio = null;
        _falhaDeCarga = null;
      });
    } on FormatException {
      if (!mounted) return;
      setState(() => _carregandoAnteriores = false);
    }
  }

  // -------------------------------------------------------------------------
  // A FOTO: escolher, subir, descartar
  // -------------------------------------------------------------------------

  /// O aviso de achado desta conversa, ou nulo.
  ///
  /// **Nulo esconde o botao de anexar.** Ver `Conversa.foundReportId`: sem ele
  /// nao ha corpo valido para `createFoundReportPhotoUploadIntent`, e um botao
  /// que sempre falha e pior que nenhum botao.
  String? get _avisoDoAchado => _conversa?.foundReportId;

  /// Ha botao de anexar nesta tela.
  bool get _podeAnexarFoto =>
      !_emLeitura && !_faltaConta && _avisoDoAchado != null;

  /// Uma foto que esta pessoa mandar vai ser legivel pelo outro lado.
  ///
  /// Vem do servidor (`photo_reaches_other_side`) e **nunca e calculado aqui**:
  /// quem sabe se a chave do objeto passa pelo guarda do leitor de midia e o
  /// servidor, e um palpite do app sobre isso erraria exatamente nos casos
  /// novos. Ver `Conversa.fotoAlcancaOOutroLado`, inclusive por que o padrao
  /// nao avisa.
  ///
  /// **Nao desabilita nada.** A foto e gravada e vale para quem a mandou; o que
  /// este sinalizador faz e DIZER, antes do envio.
  bool get _fotoAlcancaOOutroLado => _conversa?.fotoAlcancaOOutroLado ?? true;

  /// QUEM ESCREVEU esta mensagem, entre os participantes da conversa.
  ///
  /// **Pedido do cliente, 22/10/2026:** *"inclua o icone do perfil/foto do
  /// usuário nas mensagens"*; e em 26/10, ao ver que não estava no aparelho:
  /// *"você não colocou o icone da imagem a cada mensagem do usuário"*. A
  /// palavra que decide é **"a cada"**: a foto é de cada fala, e não um
  /// retrato no topo da conversa.
  ///
  /// **A foto não vem na mensagem, e é por isso que esta função existe.**
  /// `#/components/schemas/Message` não tem foto de autor nenhuma — tem
  /// `sender_role` e `photo_url`, e `photo_url` é a foto ANEXADA à fala (o
  /// animal achado), não o retrato de quem falou. O retrato mora em
  /// `Conversation.participants[].photo_icon_url`, a derivada `thumb` de 176
  /// px. Então o casamento é pelo PAPEL: `tutor` com `tutor`, `finder` com
  /// `finder`. **Nenhuma rota nova e nenhuma linha de contrato** — o campo já
  /// chegava e a conversa já o lia para o título.
  ///
  /// **Nulo é o estado normal, e não falha.** `photoIconUrl` só vem preenchida
  /// quando o outro lado é **conexão aceita** de quem chama (emenda 3 do
  /// ADR-0010); ela chega nula em seis estados que esta camada de propósito
  /// não distingue — não é conexão aceita, par bloqueado, o outro lado não tem
  /// conta, conta desabilitada, conexão sem foto pronta, ou servidor antigo.
  /// Com nula desenha-se a inicial, e **o recorte continua sendo do
  /// servidor**: a tela nunca monta foto de quem a pessoa não pode ver, ela
  /// pinta o que veio.
  ///
  /// Nulo também para a mensagem do sistema, por construção: `participants`
  /// não traz `system`. Ver [_Bolha], que não desenha marca para ela.
  ParticipanteDaConversa? _autorDe(MensagemDaConversa mensagem) {
    final conversa = _conversa;
    if (conversa == null) return null;
    for (final participante in conversa.participants) {
      if (participante.role == mensagem.senderRole) return participante;
    }
    return null;
  }
  /// O PAPEL DE QUEM ESTA USANDO O APP nesta conversa.
  ///
  /// Vem do servidor (`viewer_role`) e **nunca e deduzido aqui**: medido em
  /// 27/10/2026, sem conexao aceita os dois participantes chegam com `handle` e
  /// `photoIconUrl` nulos, e o corpo e identico para os dois chamadores. Ver
  /// `Conversa.papelDoChamador`, inclusive por que o padrao e `tutor`.
  ///
  /// **Lido num lugar so**: o lado da bolha, o nome do titulo e a marca de
  /// alcance da foto dependem do MESMO fato, e duas leituras poderiam discordar
  /// entre si no mesmo quadro -- a barra diria um nome e as bolhas o outro.
  PapelNaConversa get _papelDoChamador =>
      _conversa?.papelDoChamador ?? PapelNaConversa.tutor;

  /// A legenda esta vazia. Ver [TextosDaFotoNaConversa.aFotoPrecisaDeLegenda].
  bool get _faltaLegenda => _controlador.text.trim().isEmpty;

  /// A foto nao impede o envio da mensagem.
  ///
  /// Sem foto, nao impede nada (o caminho de antes desta historia). Com foto, o
  /// que libera e **haver `upload_id`** -- e nao a fase da tela.
  ///
  /// ## Por que o `upload_id` e nao a fase
  ///
  /// Porque e ele o fato. `EnvioParaConfirmarDepois.uploadId` continua nulo
  /// quando o envio nao terminou bem, e e exatamente essa nulidade que o doc
  /// daquela classe diz existir para distinguir *"ha foto para mandar"* de
  /// *"ha foto escolhida"*.
  ///
  /// Escrito sobre `== pronta`, este getter **travava a propria nova
  /// tentativa**: a recusa por higiene em curso poe a tela em
  /// [FaseDaFotoEscolhida.preparando], e a tentativa seguinte voltava daqui
  /// sem mandar nada -- a tela ficava em "preparando" para sempre com uma
  /// tentativa so no servidor. Medido pela isca do grupo (7), que contou 1
  /// tentativa onde o desenho pede 2.
  bool get _fotoPermiteEnviar =>
      _foto == null || _destinoDaFoto?.uploadId != null;

  /// Abre a folha com as duas origens e sobe o que vier.
  Future<void> _anexarFoto() async {
    // Uma foto por mensagem. Com uma previa na tela, o anexar nao e desenhado;
    // esta guarda cobre o toque que chegou antes da repintura.
    if (_foto != null || !_podeAnexarFoto) return;

    final cores = BichuColors.of(context).cores;
    final origem = await showModalBottomSheet<_OrigemDaFoto>(
      context: context,
      backgroundColor: cores.surface,
      barrierColor: cores.scrim,
      shape: const RoundedRectangleBorder(
        borderRadius: BorderRadius.vertical(top: Radius.circular(BichuRaio.xl)),
      ),
      builder: (contexto) => SafeArea(
        child: Padding(
          padding: const EdgeInsets.all(BichuEspaco.e4),
          child: Column(
            mainAxisSize: MainAxisSize.min,
            crossAxisAlignment: CrossAxisAlignment.stretch,
            children: <Widget>[
              BotaoPrimario(
                rotulo: _TextosDaFolhaDeFoto.tirarFoto,
                aoTocar: () =>
                    Navigator.of(contexto).pop(_OrigemDaFoto.camera),
              ),
              const SizedBox(height: BichuEspaco.e2),
              BotaoSecundario(
                rotulo: _TextosDaFolhaDeFoto.escolherDaGaleria,
                aoTocar: () =>
                    Navigator.of(contexto).pop(_OrigemDaFoto.galeria),
              ),
              const SizedBox(height: BichuEspaco.e3),
              // A LINHA DA LOCALIZACAO APARECE AQUI TAMBEM, e nao so na
              // previa: aqui e antes de a pessoa abrir a galeria, que e o
              // momento em que ela ainda pode escolher outra foto por causa
              // disso.
              Text(
                TextosDaFotoNaConversa.aLocalizacaoSai,
                style: Theme.of(contexto)
                    .textTheme
                    .bodySmall
                    ?.copyWith(color: cores.textSecondary),
              ),
            ],
          ),
        ),
      ),
    );
    if (origem == null || !mounted) return;

    final camera = _camera;
    // NAO e `final`: o recorte SUBSTITUI a foto escolhida, e e a substituida
    // que atravessa as recusas locais e o envio.
    FotoLocal? escolhida;
    if (origem == _OrigemDaFoto.camera) {
      // A permissao e pedida **no toque**, e nao na abertura da conversa: uma
      // conversa que pede camera ao abrir pede acesso para uma coisa que a
      // pessoa nao pediu.
      var estado = await camera.estadoDaCamera();
      if (estado == EstadoDaPermissao.negada) estado = await camera.pedirCamera();
      if (!mounted) return;
      if (estado != EstadoDaPermissao.concedida) return;
      escolhida = await camera.tirarFoto();
    } else {
      escolhida = await camera.escolherDaGaleria();
    }
    if (!mounted || escolhida == null) return;

    // O RECORTE, entre "a pessoa escolheu" e as duas recusas locais abaixo.
    //
    // Cliente, 29/10/2026: *"precisamos implementar em todo sistema que tem
    // upload de imagem ou foto, o recurso pro usuario fazer o crop e ajustar a
    // posicao da imagem"*.
    //
    // **A FORMA AQUI FOI UMA CORRECAO DE ROTA, e ela fica escrita.** A previa
    // da foto na conversa (`PreviaDaFotoDaConversa`) tem altura VARIAVEL --
    // `min(220, fracao da altura da tela)` -- e nenhum aspecto declarado,
    // entao este destino PARECIA de forma livre, e a janela ia ser
    // `FormatoDoRecorte.doProprioArquivo`.
    //
    // Nao e. A foto da conversa sobe por
    // `createFoundReportPhotoUploadIntent`, e o servidor corta aquela imagem
    // em 1024 x 1126 (`DERIVADA_DA_FOTO_DO_ACHADO`, aplicada por
    // `higienizar-foto-do-achado.ts`). Janela livre aqui daria o pior dos dois
    // mundos: a pessoa enquadrando uma coisa e o servidor entregando outra --
    // o defeito de 28/10 de volta por um caminho novo. Medido em 29/10/2026.
    //
    // O ajuste vem ANTES das recusas de propósito: e o arquivo ajustado que
    // sobe, e e o tamanho DELE que o teto do contrato tem de medir.
    final ajustada = await ajustarAFoto(
      context,
      camera: camera,
      foto: escolhida,
      formato: FormatoDoRecorte.fotoNaConversa,
      titulo: 'Ajuste a foto',
    );
    if (!mounted || ajustada == null) return;
    escolhida = ajustada;

    // AS DUAS RECUSAS LOCAIS, antes de qualquer byte sair.
    //
    // Nao e defensividade: a politica assinada carrega o teto, e deixar a
    // pessoa esperar um upload inteiro para o armazenamento recusar e gastar a
    // rede dela para chegar ao mesmo lugar. `tiposDeFotoAceitos` e a lista do
    // contrato (`UploadIntentInput.content_type`), que **inclui HEIC** --
    // recusa-lo aqui tiraria o produto da mao de metade dos aparelhos.
    final recusaDeTipo =
        recusaDeTipoDaFoto(escolhida.tipoDeConteudo, tiposDeFotoAceitos);
    final recusa = recusaDeTipo ??
        (escolhida.tamanhoEmBytes > tetoDeBytesDaFoto
            ? orientacaoDeTamanhoDaImagem
            : null);

    setState(() {
      _foto = escolhida;
      _bytesEnviados = 0;
      _bytesTotais = escolhida!.tamanhoEmBytes;
      _tentativasDePreparo = 0;
      _destinoDaFoto = null;
      _motivoDaRecusaDaFoto = recusa;
      _faseDaFoto = recusa == null
          ? FaseDaFotoEscolhida.subindo
          : FaseDaFotoEscolhida.recusada;
    });
    // **A PREVIA APARECE MESMO NA RECUSA.** A pessoa precisa ver QUAL foto foi
    // recusada para escolher outra; um aviso sem a imagem a manda de volta
    // para a galeria sem saber o que evitar.
    if (recusa != null) return;
    await _subirAFoto();
  }

  /// Sobe os bytes e guarda o `upload_id`. Reusa o unico caminho de bytes do
  /// app, e nao escreve um segundo.
  Future<void> _subirAFoto() async {
    final foto = _foto;
    final aviso = _avisoDoAchado;
    if (foto == null || aviso == null) return;

    setState(() {
      _faseDaFoto = FaseDaFotoEscolhida.subindo;
      _bytesEnviados = 0;
      _bytesTotais = foto.tamanhoEmBytes;
      _motivoDaRecusaDaFoto = null;
      _destinoDaFoto = null;
      _tentativasDePreparo = 0;
    });

    final porta = _intencaoDeFoto;
    final destino = EnvioParaConfirmarDepois(
      pedir: ({required String tipoDeConteudo, required int tamanhoEmBytes}) =>
          porta.intencaoDeFotoDoAchado(
        foundReportId: aviso,
        tipoDeConteudo: tipoDeConteudo,
        tamanhoEmBytes: tamanhoEmBytes,
      ),
    );

    final desfecho = await _envio.enviar(
      foto: foto,
      destino: destino,
      aoProgredir: (int enviados, int total) {
        if (!mounted) return;
        // A foto pode ter sido descartada no meio do envio. Sem esta guarda, o
        // progresso de um envio abandonado reacenderia a previa.
        if (_foto != foto) return;
        setState(() {
          _bytesEnviados = enviados;
          _bytesTotais = total;
        });
      },
    );
    if (!mounted || _foto != foto) return;

    setState(() {
      switch (desfecho) {
        case DesfechoDoEnvio.enviada:
          _destinoDaFoto = destino;
          _faseDaFoto = FaseDaFotoEscolhida.pronta;
        case DesfechoDoEnvio.semSinal:
          _faseDaFoto = FaseDaFotoEscolhida.semSinal;
        case DesfechoDoEnvio.recusada:
          _faseDaFoto = FaseDaFotoEscolhida.recusada;
      }
    });
  }

  /// Descarta a previa. **Nao manda nada e nao fala com a rede.**
  ///
  /// A intencao de upload nao confirmada vence sozinha no servidor e o varredor
  /// a recolhe; nao existe rota de cancelamento no contrato. O texto da pessoa
  /// **fica no campo**: ela pode ter escrito a legenda e querer manda-la sem a
  /// foto.
  void _descartarAFoto() {
    setState(() {
      _foto = null;
      _destinoDaFoto = null;
      _motivoDaRecusaDaFoto = null;
      _bytesEnviados = 0;
      _bytesTotais = 0;
      _tentativasDePreparo = 0;
      _faseDaFoto = FaseDaFotoEscolhida.subindo;
    });
  }

  /// Envia, e **nao limpa o campo antes da confirmacao**.
  Future<void> _enviar() async {
    final texto = _controlador.text.trim();
    if (texto.isEmpty || _enviando || _emLeitura) return;
    // **A FOTO QUE AINDA ESTA SUBINDO NAO DEIXA A MENSAGEM SAIR.** Sem isto, o
    // toque em Enviar durante o envio postaria a mensagem sem
    // `photo_upload_id` -- a legenda chegaria sozinha e a foto ficaria orfa no
    // armazenamento ate o varredor recolhe-la.
    if (!_fotoPermiteEnviar) return;

    // O identificador lido ANTES do `await`: a previa pode ser descartada
    // enquanto a chamada esta na rua, e `_destinoDaFoto` seria nulo na volta.
    final fotoUploadId = _destinoDaFoto?.uploadId;

    setState(() {
      _enviando = true;
      _falhaDeEnvio = null;
    });

    try {
      final mensagem = await _api.enviar(
        widget.conversaId,
        texto,
        fotoUploadId: fotoUploadId,
      );
      if (!mounted) return;
      setState(() {
        _mensagens.add(mensagem);
        _enviando = false;
        // A PREVIA SAI AQUI, e so aqui: a foto deixou de ser "escolhida" e
        // passou a ser mensagem na linha. Qualquer caminho de falha abaixo a
        // mantem, porque refazer a escolha na galeria e o custo que a pessoa
        // nao deveria pagar por um 429.
        _foto = null;
        _destinoDaFoto = null;
        _bytesEnviados = 0;
        _bytesTotais = 0;
        _tentativasDePreparo = 0;
        _faseDaFoto = FaseDaFotoEscolhida.subindo;
      });
      // O CAMPO E LIMPO AQUI, E SO AQUI: depois do `201`. Qualquer caminho de
      // falha acima saiu por `catch` sem tocar no controlador.
      _controlador.clear();
    } on FalhaDaApi catch (falha) {
      if (!mounted) return;
      // A HIGIENE DA FOTO NAO TERMINOU. Nao e defeito e nao e definitivo: o
      // servidor reescreve a imagem sem metadado de forma assincrona, e esta
      // mensagem chegou no meio. A tela diz "preparando a foto" e tenta de
      // novo com espera crescente, SEM travar e SEM perder a previa.
      if (fotoUploadId != null &&
          _foto != null &&
          fotoAindaNaoEstaPronta(falha.problem) &&
          _tentativasDePreparo < _esperasDoPreparo.length) {
        final espera = _esperasDoPreparo[_tentativasDePreparo];
        setState(() {
          _enviando = false;
          _tentativasDePreparo += 1;
          _faseDaFoto = FaseDaFotoEscolhida.preparando;
          _falhaDeEnvio = null;
        });
        await Future<void>.delayed(espera);
        if (!mounted || _foto == null) return;
        await _enviar();
        return;
      }
      // A HIGIENE RECUSOU A FOTO, e isso NAO melhora com o tempo: os bytes nao
      // sao imagem que o produto abra, ou a imagem e animada, ou e grande
      // demais. A previa fica (a pessoa precisa ver QUAL foto foi recusada) e
      // o texto e **o do servidor** -- ver `fotoFoiRecusadaPeloServidor`.
      if (_foto != null && fotoFoiRecusadaPeloServidor(falha.problem)) {
        setState(() {
          _enviando = false;
          _tentativasDePreparo = 0;
          _faseDaFoto = FaseDaFotoEscolhida.recusada;
          _motivoDaRecusaDaFoto = falha.problem.detalhe;
          // **SEM faixa de falha de envio.** A previa ja carrega a recusa com
          // o `Descartar`; uma segunda faixa dizendo "a mensagem nao foi
          // enviada" poria dois erros na tela para um unico problema, e o
          // `Tentar de novo` dela devolveria a mesma recusa.
          _falhaDeEnvio = null;
        });
        return;
      }
      setState(() {
        _enviando = false;
        // A ESPERA ACABOU E A FOTO CONTINUA NAO PRONTA: volta para `pronta`
        // (o `upload_id` segue valido) e acende a faixa de falha de envio, que
        // tem `Tentar de novo`. A previa fica.
        if (_faseDaFoto == FaseDaFotoEscolhida.preparando) {
          _faseDaFoto = FaseDaFotoEscolhida.pronta;
        }
        if (conversaNaoAceitaMais(falha.problem)) {
          // A CONVERSA FECHOU ENTRE A ABERTURA E O TOQUE. Nao e defeito: a
          // tela passa a modo leitura, a caixa de texto SAI, e o texto da
          // pessoa vai para a faixa -- ela pode querer copia-lo, e apaga-lo
          // junto com o campo seria perder o que ela escreveu.
          _emLeitura = true;
          _falhaDeEnvio = null;
        } else {
          // O texto FICA no campo. Ver o cabecalho do arquivo.
          _falhaDeEnvio = TextosDasMensagens.naoFoiEnviada;
        }
      });
    } on FalhaDeChamada {
      if (!mounted) return;
      setState(() {
        _enviando = false;
        if (_faseDaFoto == FaseDaFotoEscolhida.preparando) {
          _faseDaFoto = FaseDaFotoEscolhida.pronta;
        }
        _falhaDeEnvio = TextosDasMensagens.naoFoiEnviada;
      });
    } on FormatException {
      if (!mounted) return;
      setState(() {
        _enviando = false;
        if (_faseDaFoto == FaseDaFotoEscolhida.preparando) {
          _faseDaFoto = FaseDaFotoEscolhida.pronta;
        }
        _falhaDeEnvio = TextosDasMensagens.naoFoiEnviada;
      });
    }
  }

  @override
  Widget build(BuildContext context) {
    final conversa = _conversa;
    // O OUTRO LADO visto por QUEM ESTA CHAMANDO, e nao pelo tutor.
    //
    // Antes de 27/10/2026 esta linha passava `PapelNaConversa.tutor` fixo: para
    // o achador COM conta -- que o servidor atende -- o "outro lado" era ele
    // mesmo, e a barra mostrava o PROPRIO nome. Ver `Conversa.papelDoChamador`.
    final outro = conversa?.outroLadoVistoPor(_papelDoChamador);
    // O TITULO E NOME + PET, e nunca o id. **Em DUAS linhas desde 20/10/2026**:
    // a composicao de uma linha so (`'$nome · $pet'`, em `headlineSmall`) pedia
    // **442,16 dp** contra **287,00 dp** de vao real em 375 dp -- cortava por
    // 155,16 dp, **hoje e sem nenhum selo na barra**, e cortava tambem em 320 e
    // em 412. Quem cede e o pet, e o motivo esta no cabecalho de
    // `titulo_da_conversa.dart`; os numeros, no de
    // `app/test/mensagens/titulo_da_conversa_test.dart`, que os mede.
    final nomeDoOutro = conversa == null ? null : outro?.displayName.trim();
    final nomeNoTitulo = nomeDoOutro == null || nomeDoOutro.isEmpty
        ? TextosDasMensagens.titulo
        : nomeDoOutro;
    // O pet so vai para o titulo quando ha conversa carregada: antes dela a
    // barra mostra o rotulo da secao, e um pet sem pessoa nao e contexto.
    final petNoTitulo = conversa?.petDisplayName;

    return Scaffold(
      appBar: AppBar(
        // A ALTURA SAI DA MEDICAO do texto real, e nao de um numero fixo: com
        // `toolbarHeight` de padrao a segunda linha transborda a 200% de escala.
        toolbarHeight: TituloDaConversa.alturaDaBarra(
          context,
          nome: nomeNoTitulo,
          pet: petNoTitulo,
        ),
        leading: const SaidaDaTela(
          tipo: TipoDeSaida.voltar,
          escape: RotasDeMensagens.area,
        ),
        title: TituloDaConversa(nome: nomeNoTitulo, pet: petNoTitulo),
      ),
      body: SafeArea(
        child: Column(
          children: <Widget>[
            Expanded(child: _corpo()),
            // A CAIXA DE TEXTO SO EXISTE EM CONVERSA ABERTA. Em modo leitura
            // ela nao e desabilitada -- ela **nao e construida**. Um campo
            // cinza convida ao toque e nao explica nada.
            // A CAIXA TAMBEM NAO EXISTE SEM CONTA: ela e um controle sem
            // desfecho, e o envio responderia o mesmo 401.
            if (!_carregando && _falhaDeCarga == null && !_faltaConta)
              if (_emLeitura)
                const _AvisoDeConversaEncerrada()
              else ...<Widget>[
                // A PREVIA FICA ENTRE A CONVERSA E A BARRA DE ESCREVER, e e
                // assim que ela e lida como "o que vai sair no proximo toque"
                // e nao como "uma mensagem que ja saiu".
                if (_foto case final FotoLocal escolhida)
                  PreviaDaFotoDaConversa(
                    foto: escolhida,
                    fase: _faseDaFoto,
                    enviados: _bytesEnviados,
                    total: _bytesTotais,
                    faltaLegenda: _faltaLegenda,
                    motivoDaRecusa: _motivoDaRecusaDaFoto,
                    aoDescartar: _descartarAFoto,
                    aoTentarDeNovo: _subirAFoto,
                    alcancaOOutroLado: _fotoAlcancaOOutroLado,
                  ),
                _caixa(),
              ],
          ],
        ),
      ),
    );
  }

  Widget _corpo() {
    if (_carregando) {
      return const Center(child: CircularProgressIndicator());
    }

    // SEM CONTA NAO E ERRO, e nao tem `Tentar de novo`. Ver
    // `widgets/convite_para_entrar.dart`.
    if (_faltaConta) {
      return ListView(
        padding: const EdgeInsets.all(BichuEspaco.e4),
        children: const <Widget>[
          ConviteParaEntrar(secao: SecaoComConta.umaConversa),
        ],
      );
    }

    final falha = _falhaDeCarga;
    if (falha != null) {
      return ListView(
        padding: const EdgeInsets.all(BichuEspaco.e4),
        children: <Widget>[
          FaixaDeAviso(
            texto: falha,
            rotuloDaAcao: MensagensDeErro.tentarDeNovo,
            aoTocarNaAcao: _carregar,
          ),
        ],
      );
    }

    final falhaDeEnvio = _falhaDeEnvio;

    return ListView(
      padding: const EdgeInsets.all(BichuEspaco.e4),
      children: <Widget>[
        if (_cursor != null)
          Padding(
            padding: const EdgeInsets.only(bottom: BichuEspaco.e4),
            child: BotaoSecundario(
              rotulo: TextosDasMensagens.carregarAnteriores,
              aoTocar: _carregarAnteriores,
              carregando: _carregandoAnteriores,
            ),
          ),
        for (final mensagem in _mensagens)
          Padding(
            key: ValueKey<String>('mensagem-${mensagem.id}'),
            padding: const EdgeInsets.only(bottom: BichuEspaco.e3),
            child: _Bolha(
              mensagem: mensagem,
              autor: _autorDe(mensagem),
              aoBuscarDeNovo: _carregar,
              fotoAlcancaOOutroLado: _fotoAlcancaOOutroLado,
              papelDoChamador: _papelDoChamador,
            ),
          ),
        if (falhaDeEnvio != null)
          FaixaDeAviso(
            texto: falhaDeEnvio,
            rotuloDaAcao: MensagensDeErro.tentarDeNovo,
            aoTocarNaAcao: _enviar,
          ),
      ],
    );
  }

  Widget _caixa() {
    final cores = BichuColors.of(context).cores;
    final textos = Theme.of(context).textTheme;
    return DecoratedBox(
      decoration: BoxDecoration(
        border: Border(top: BorderSide(color: cores.outline)),
      ),
      child: Padding(
        padding: const EdgeInsets.all(BichuEspaco.e3),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: <Widget>[
            // A LINHA DA LOCALIZACAO, PERTO DO ANEXAR.
            //
            // Ela fica na barra e nao numa tela de ajuda porque e aqui que a
            // decisao acontece. Ela so existe quando o anexar existe: uma
            // promessa sobre foto numa conversa sem foto e ruido.
            // O AVISO DE ALCANCE, PERTO DO ANEXAR E ANTES DA ESCOLHA.
            //
            // Ele vem antes da linha da localizacao porque e o que muda a
            // DECISAO: localizacao e uma coisa boa que acontece com a foto;
            // isto e o motivo possivel para nao mandar foto nenhuma e escrever
            // em vez disso. E ele aparece aqui mesmo sem foto escolhida --
            // esperar a escolha faria a pessoa abrir a galeria e procurar a
            // foto certa para so entao descobrir.
            if (_podeAnexarFoto && !_fotoAlcancaOOutroLado)
              Padding(
                padding: const EdgeInsets.only(bottom: BichuEspaco.e2),
                child: Text(
                  TextosDaFotoNaConversa.aFotoNaoChegaDoOutroLado,
                  style: textos.bodySmall?.copyWith(color: cores.textSecondary),
                ),
              ),
            if (_podeAnexarFoto)
              Padding(
                padding: const EdgeInsets.only(bottom: BichuEspaco.e2),
                child: Text(
                  TextosDaFotoNaConversa.aLocalizacaoSai,
                  style: textos.bodySmall?.copyWith(color: cores.textMuted),
                ),
              ),
            Row(
          crossAxisAlignment: CrossAxisAlignment.end,
          children: <Widget>[
            // O ANEXAR, AO LADO DO CAMPO.
            //
            // Ele sai quando ja ha previa (uma foto por mensagem) e quando a
            // conversa nao tem `found_report_id` -- ver [_podeAnexarFoto].
            if (_podeAnexarFoto && _foto == null) ...<Widget>[
              IconButton(
                onPressed: _anexarFoto,
                tooltip: TextosDaFotoNaConversa.anexarFoto,
                // O ALVO E O MINIMO DO GRUPO `target` dos tokens, declarado e
                // nao herdado: o padrao do `IconButton` do Material e 48 dp,
                // e um tema que o aperte levaria este botao com ele.
                constraints: const BoxConstraints(
                  minWidth: BichuAlvoDeToque.min,
                  minHeight: BichuAlvoDeToque.min,
                ),
                icon: const Icon(Icons.add_a_photo_outlined),
              ),
              const SizedBox(width: BichuEspaco.e1),
            ],
            Expanded(
              child: TextField(
                controller: _controlador,
                minLines: 1,
                maxLines: 4,
                // O CAMPO SE RENOMEIA COM A FOTO NA TELA: ele deixou de ser
                // opcional. Ver `TextosDaFotoNaConversa.campoDeLegenda`.
                onChanged: (_) {
                  // Repinta so quando a resposta da tela muda de verdade: a
                  // previa diz "falta legenda", e o estado disso virou na
                  // primeira letra e na ultima apagada.
                  if (_foto != null) setState(() {});
                },
                // O teto do contrato (`body`, `maxLength: 1000`). O campo nao
                // conta caractere na tela: quem escreve recado nao esta
                // contando, e o servidor recusa com `validation-failed` se
                // passar. O limite aqui impede a recusa.
                maxLength: 1000,
                textCapitalization: TextCapitalization.sentences,
                keyboardType: TextInputType.multiline,
                // TOCAR FORA FECHA O TECLADO. Este campo e `TextField` cru, e
                // nao `BichuField`, entao ele nao herda o `onTapOutside` que
                // vale para os outros campos do app -- ver a prosa em
                // `widgets/bichu_field.dart`. Com `maxLines: 4` a tecla de
                // retorno insere linha e nao conclui: sem esta linha, uma vez
                // aberto o teclado so desce pelo botao voltar do Android, e o
                // iOS nao tem equivalente.
                //
                // **E ELE NAO LEVA A FAIXA DE `Concluir`, POR DECISAO MEDIDA
                // (20/10/2026), e nao por falta de tempo.** A faixa de
                // `widgets/barra_do_teclado.dart` se posiciona em
                // `bottom: viewInsets.bottom`, encostada no topo do teclado --
                // que e exatamente onde ESTE compositor fica, ancorado no
                // rodape. Poria a faixa sobre o proprio campo que a pessoa
                // esta usando, trocando "o botao esta escondido" por "o campo
                // esta escondido", que e pior.
                //
                // A saida daqui existe sem faixa, e sao duas: o toque fora
                // (esta linha) e o proprio botao de enviar, que fica AO LADO
                // do campo e nunca esteve atras do teclado. **Nao "complete" a
                // cobertura com a faixa aqui** -- a excecao e geometrica, e
                // vale tambem para `seguranca/folha_de_denuncia.dart`.
                onTapOutside: (PointerDownEvent _) =>
                    FocusManager.instance.primaryFocus?.unfocus(),
                // `InputDecoration` deixou de ser `const` porque o rotulo
                // depende de `_foto`: uniao das duas frentes.
                decoration: InputDecoration(
                  labelText: _foto == null
                      ? TextosDasMensagens.campoDeMensagem
                      : TextosDaFotoNaConversa.campoDeLegenda,
                  counterText: '',
                ),
              ),
            ),
            const SizedBox(width: BichuEspaco.e2),
            IconButton.filled(
              // **O ENVIO E DESABILITADO ENQUANTO A FOTO SOBE.** Nao e
              // decoracao: com ele vivo, o toque postaria a legenda sem a foto.
              onPressed: (_enviando || !_fotoPermiteEnviar) ? null : _enviar,
              // Rotulo acessivel em tudo: um botao de icone sem ele e um
              // controle mudo para quem usa leitor de tela.
              tooltip: TextosDasMensagens.enviar,
              icon: _enviando
                  ? const SizedBox(
                      width: 18,
                      height: 18,
                      child: CircularProgressIndicator(strokeWidth: 2),
                    )
                  : const Icon(Icons.arrow_upward),
            ),
              ],
            ),
          ],
        ),
      ),
    );
  }
}

/// De onde a foto vem. Local: e escolha de aparelho, e nao campo de contrato.
enum _OrigemDaFoto { camera, galeria }

/// Os dois rotulos da folha de origem.
///
/// Repetem, de proposito, os textos que `TextosDoDetalhe` ja usa no pet: sao os
/// MESMOS dois rotulos em todo o app, e e a pessoa que precisa ler a mesma
/// coisa em toda tela com foto. Eles ficam aqui e nao sao importados dali
/// porque aquele arquivo e de uma frente que esta sendo mexida nesta data; a
/// uniao dos dois e um movimento de texto.
abstract final class _TextosDaFolhaDeFoto {
  static const String tirarFoto = 'Tirar foto';
  static const String escolherDaGaleria = 'Escolher da galeria';
}

/// O rodape do modo leitura. **No lugar da caixa de texto, e nunca junto.**
///
/// A frase e a MESMA para conversa encerrada, conversa bloqueada e conta
/// desabilitada do outro lado, porque o servidor manda um erro so de propósito.
/// Ver o cabecalho deste arquivo.
class _AvisoDeConversaEncerrada extends StatelessWidget {
  const _AvisoDeConversaEncerrada();

  @override
  Widget build(BuildContext context) {
    final cores = BichuColors.of(context).cores;
    final textos = Theme.of(context).textTheme;
    return Container(
      width: double.infinity,
      decoration: BoxDecoration(
        color: cores.surfaceAlt,
        border: Border(top: BorderSide(color: cores.outline)),
      ),
      padding: const EdgeInsets.all(BichuEspaco.e4),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: <Widget>[
          Text(
            TextosDasMensagens.conversaEncerrada,
            style: textos.titleSmall?.copyWith(color: cores.textPrimary),
          ),
          const SizedBox(height: BichuEspaco.e1),
          Text(
            TextosDasMensagens.aindaDaParaLer,
            style: textos.bodySmall?.copyWith(color: cores.textSecondary),
          ),
        ],
      ),
    );
  }
}

/// Uma mensagem.
///
/// Tres formas: a do sistema (o Bichu falando -- a abertura do aviso e o alerta
/// de dado retirado), a do achador e a do tutor. A do sistema **nao e bolha de
/// ninguem**: ela atravessa a largura, porque atribui-la a um lado faria
/// parecer que uma das duas pessoas escreveu aquilo.
class _Bolha extends StatelessWidget {
  const _Bolha({
    required this.mensagem,
    required this.autor,
    required this.aoBuscarDeNovo,
    required this.fotoAlcancaOOutroLado,
    required this.papelDoChamador,
  });

  final MensagemDaConversa mensagem;

  /// QUEM ESCREVEU, para a marca ao lado da fala. Ver
  /// `_EstadoDaTelaDaConversa._autorDe`.
  ///
  /// **Nulo não esconde a marca**: ele a faz cair na inicial, que é o que
  /// `MarcaDaPessoa` já faz em toda outra superfície. Esconder a marca quando
  /// não há foto devolveria o defeito que o cliente apontou — ele veria falas
  /// com retrato e falas sem, e a conversa com um estranho (o caso mais comum
  /// desta tela) é justamente a que não tem foto.
  final ParticipanteDaConversa? autor;
  /// O PAPEL DE QUEM ESTA LENDO esta conversa (`Conversation.viewer_role`).
  ///
  /// **Obrigatorio, e sem padrao de proposito.** Um padrao `tutor` aqui seria o
  /// defeito de 26/10/2026 de volta no dia em que alguem construir a bolha num
  /// caminho novo e esquecer de passar o papel -- e ele reaparece calado,
  /// porque uma bolha no lado errado nao lanca nada.
  final PapelNaConversa papelDoChamador;

  /// Rele a conversa, para as URLs assinadas virem com assinatura nova.
  ///
  /// `Message.photo_url` tem **validade curta**: reabrir a conversa depois de
  /// um tempo cai no estado de falha de verdade, e insistir na mesma URL nao
  /// resolve -- o que resolve e pedir a conversa outra vez. Ver
  /// [FotoDaMensagem].
  final VoidCallback aoBuscarDeNovo;

  /// O fato do CANAL: uma foto que ESTE chamador mandar alcanca o outro lado.
  ///
  /// Vira fato DA FOTO em [_alcancouOOutroLado], e e ali que a decisao mora --
  /// num lugar so. Ver `FotoDaMensagem.alcancouOOutroLado`.
  final bool fotoAlcancaOOutroLado;

  /// ESTA foto alcancou o outro lado.
  ///
  /// A do achador alcancou **por definicao**: ela esta na tela do tutor agora.
  /// A do sistema nao e de ninguem, e marca de alcance e sobre a foto de uma
  /// pessoa. Entao o fato do canal vale so para a do tutor.
  bool get _alcancouOOutroLado =>
      mensagem.senderRole != papelDoChamador || fotoAlcancaOOutroLado;

  /// O LADO DO CÍRCULO da marca de quem falou, em dp.
  ///
  /// **32 e não 40**, pelo mesmo critério já escrito em `MarcaDaPessoa.lado`:
  /// 40 é o círculo do *cabeçalho de um cartão* (a publicação do Mural) e da
  /// *linha de lista* (a área de mensagens); 32 é o da linha dentro de uma
  /// lista — *"o comentário é uma linha dentro de uma lista, e não o cabeçalho
  /// de um cartão"*. Uma fala é a linha, não o cartão, e é o mesmo número do
  /// comentário do Mural pela mesma razão.
  ///
  /// **Ela NÃO é alvo de toque, e isso é a decisão.** O círculo da área de
  /// mensagens abre o perfil porque lá ele é o único endereço do outro lado;
  /// aqui a conversa JÁ tem essa porta, uma vez, no título
  /// (`PortaDoPerfilDoParticipante`, via `titulo_da_conversa.dart`). Repetir o
  /// destino em cada fala poria N alvos idênticos numa lista rolável — e nas
  /// falas do estranho, que é o caso comum desta tela, `handle` é nulo e **não
  /// há destino**: seriam círculos que se anunciam como botão sem levar a
  /// lugar nenhum, o toque sem desfecho que o critério 2 da BICHUS-62 proíbe
  /// por escrito.
  static const double ladoDaMarca = 32;

  /// O vão entre a marca e a bolha, em dp. Ele sai do ORÇAMENTO da bolha (ver
  /// [_larguraMaximaDaBolha]) e não da margem da página.
  static const double respiroDaMarca = BichuEspaco.e2;

  /// A fração da largura da tela que a fala podia ocupar ANTES da marca.
  static const double fracaoDaLargura = 0.78;

  /// O que sobra para a bolha depois de a marca e o respiro serem pagos.
  ///
  /// **A marca não é de graça, e o número de antes não podia ficar.** A bolha
  /// tinha `maxWidth: largura * 0.78` dentro de um `Align`; num `Row` com um
  /// círculo de 32 e um vão de 8 ao lado, aquele mesmo teto soma
  /// `0,78 · L + 40` e **transborda** — a listra amarela do `RenderFlex` em
  /// toda fala longa. Os 40 dp saem do teto da bolha, e o conjunto
  /// marca + vão + bolha continua em 0,78 da tela.
  ///
  /// O piso de zero é para a tela estreita absurda: `ConstrainedBox` com
  /// `maxWidth` negativo lança.
  static double _larguraMaximaDaBolha(double larguraDaTela) {
    final teto =
        larguraDaTela * fracaoDaLargura - (ladoDaMarca + respiroDaMarca);
    return teto < 0 ? 0 : teto;
  }

  @override
  Widget build(BuildContext context) {
    final cores = BichuColors.of(context).cores;
    final textos = Theme.of(context).textTheme;

    if (mensagem.doSistema) {
      return Container(
        width: double.infinity,
        decoration: BoxDecoration(
          color: cores.infoContainer,
          borderRadius: BorderRadius.circular(BichuRaio.md),
        ),
        padding: const EdgeInsets.all(BichuEspaco.e3),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: <Widget>[
            Text(
              mensagem.body,
              style: textos.bodySmall?.copyWith(color: cores.textPrimary),
            ),
            // A foto numa mensagem do sistema nao e de nenhum dos dois lados, e
            // a legenda dela e neutra. Desenha-la quando ela vem e melhor que
            // esconde-la: o contrato declara `photo_url` em `Message` sem
            // restringir o `sender_role`, e omitir aqui seria a tela decidindo
            // nao mostrar o que o servidor mandou.
            if (mensagem.photoUrl case final String url when url.isNotEmpty)
              Padding(
                padding: const EdgeInsets.only(top: BichuEspaco.e2),
                child: FotoDaMensagem(
                  url: url,
                  papel: PapelNaConversa.sistema,
                  aoBuscarDeNovo: aoBuscarDeNovo,
                  alcancouOOutroLado: _alcancouOOutroLado,
                ),
              ),
          ],
        ),
      );
    }

    // A MINHA MENSAGEM VAI A DIREITA, e "minha" e o papel de QUEM CHAMA.
    //
    // Antes de 27/10/2026 era `== PapelNaConversa.tutor` fixo. O alinhamento
    // ficava funcao pura de `sender_role` -- nao invertia quando o chamador
    // invertia --, e para o achador COM conta a bolha do OUTRO lado ia para a
    // direita, que e o lado que a pessoa le como o dela.
    final minha = mensagem.senderRole == papelDoChamador;

    // A MARCA DE QUEM FALOU, uma por fala.
    //
    // **`MarcaDaPessoa` e não um círculo novo.** Ela é o desenho de pessoa já
    // compartilhado pelo cartão do Mural, pelo comentário e pela área de
    // mensagens (`widgets/marca_da_pessoa.dart`), e com ela vêm de graça a
    // queda para a inicial, o `cacheWidth` pela largura pintada, o
    // `simboloDeFalha` de retrato e a decisão de a imagem ser decorativa.
    // Desenhar o segundo círculo aqui era o caminho que aquele arquivo nasceu
    // para fechar.
    //
    // **A inicial sai de `autor.marcaNeutra`, e não de `MarcaDaPessoa.letraDe`
    // sobre o nome.** As duas regras existem e divergem de propósito: a desta
    // tela é a do contrato (a PRIMEIRA letra, nunca iniciais de sobrenome,
    // porque o servidor promete que sobrenome não sai), e é a mesma que a
    // linha da área de mensagens já usa para esta mesma pessoa. Trocá-la por
    // `letraDe` faria a letra do título e a letra da fala discordarem.
    //
    // **E O SELO NÃO ENTRA AQUI.** O cliente pediu em 21/10 que *"nome, foto e
    // selo"* andassem juntos em toda superfície, e a emenda do ADR-0010 do
    // mesmo dia abriu a exceção da conversa com três medidas — esta é a única
    // superfície onde o outro lado pode ser um ESTRANHO, é o canal do golpe do
    // falso achador (que ele mediu em 20/10 ao recusar a recompensa), e a
    // linha do título já corta sem selo. `MarcaDaPessoa` **não tem parâmetro
    // de selo**, e a ausência é a defesa: acendê-lo aqui exigiria importar
    // `widgets/selo_de_validado.dart` neste arquivo, mudança visível em
    // revisão que o contrapeso de `app/test/widgets/selo_de_validado_test.dart`
    // reprova. **Então o que entrou foi a FOTO, e só ela** — e o selo nas
    // mensagens continua sendo decisão do cliente, não minha.
    final marca = MarcaDaPessoa(
      urlDoIcone: autor?.photoIconUrl,
      inicial: autor?.marcaNeutra ?? '',
      lado: ladoDaMarca,
      estiloDaInicial: textos.bodyMedium,
    );

    // O `Align` virou `Row`, e o alinhamento passou a ser dele: a fala do
    // tutor encosta à direita com a marca DEPOIS da bolha, a de quem achou à
    // esquerda com a marca ANTES. **A marca fica do lado de fora**, nunca
    // dentro da bolha: dentro, ela entraria no fluxo da legenda da foto.
    //
    // `CrossAxisAlignment.start` alinha a marca ao TOPO da fala. Numa bolha de
    // várias linhas — ou com foto — o centro poria o círculo no meio de um
    // parágrafo, longe do início da fala que ele atribui.
    return Row(
      mainAxisAlignment: minha ? MainAxisAlignment.end : MainAxisAlignment.start,
      crossAxisAlignment: CrossAxisAlignment.start,
      children: <Widget>[
        if (!minha) ...<Widget>[
          marca,
          const SizedBox(width: respiroDaMarca),
        ],
        ConstrainedBox(
        constraints: BoxConstraints(
          maxWidth: _larguraMaximaDaBolha(MediaQuery.sizeOf(context).width),
        ),
        child: Column(
          crossAxisAlignment: minha
              ? CrossAxisAlignment.end
              : CrossAxisAlignment.start,
          children: <Widget>[
            Container(
              decoration: BoxDecoration(
                color: minha ? cores.primaryContainer : cores.surfaceSunken,
                borderRadius: BorderRadius.circular(BichuRaio.md),
              ),
              padding: const EdgeInsets.all(BichuEspaco.e3),
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: <Widget>[
                  // A FOTO VEM ANTES DO TEXTO, e o texto e a legenda dela.
                  //
                  // `body` e obrigatorio no contrato e nao existe mensagem
                  // so-foto, entao o par imagem + texto e sempre completo. A
                  // imagem em cima e o que faz o texto ser lido COMO legenda.
                  if (mensagem.photoUrl case final String url
                      when url.isNotEmpty)
                    Padding(
                      padding: const EdgeInsets.only(bottom: BichuEspaco.e2),
                      child: FotoDaMensagem(
                        url: url,
                        papel: mensagem.senderRole,
                        aoBuscarDeNovo: aoBuscarDeNovo,
                        alcancouOOutroLado: _alcancouOOutroLado,
                      ),
                    ),
                  Text(
                    mensagem.body,
                    style: textos.bodyMedium?.copyWith(
                      color: cores.textPrimary,
                    ),
                  ),
                ],
              ),
            ),
            // O QUE FOI RETIRADO, explicado.
            //
            // Sem isto o remetente ve o proprio texto sem o telefone e acha
            // que foi censurado sem motivo -- ou pior, que a mensagem chegou
            // inteira. O contrato manda `redactions` exatamente para a
            // interface explicar.
            if (mensagem.redactions.isNotEmpty)
              Padding(
                padding: const EdgeInsets.only(top: BichuEspaco.e1),
                child: Text(
                  TextosDasMensagens.dadoRetirado,
                  style: textos.bodySmall?.copyWith(color: cores.textSecondary),
                ),
              ),
          ],
        ),
        ),
        if (minha) ...<Widget>[
          const SizedBox(width: respiroDaMarca),
          marca,
        ],
      ],
    );
  }
}
