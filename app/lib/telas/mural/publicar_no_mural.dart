import 'package:flutter/material.dart';

import '../../acessibilidade/anunciar.dart';
import '../../api/envio_de_foto.dart';
import '../../api/falhas.dart';
import '../../api/mensagens_de_erro.dart';
import '../../api/mural_api.dart';
import '../../dispositivo/camera_e_galeria.dart';
import '../../theme/bichu_colors.dart';
import '../../theme/bichu_tokens.g.dart';
import '../../widgets/bichu_field.dart';
import '../../widgets/botao_primario.dart';
import '../../widgets/faixa_de_aviso.dart';
import '../../widgets/previa_da_foto.dart';

/// PUBLICAR NO MURAL — **a caixa de texto que o cliente pediu.**
///
/// Pedido dele, de 20/10/2026, literal: *"na secao do mural, nao tem a caixa de
/// texto para o usuario escrever uma mensagem, subir uma foto e publicar o
/// conteudo."* Esta tela e as tres coisas, nessa ordem, numa tela so.
///
/// ## O PADRAO DE FOTO, e ele e decisao dele de 19/10/2026
///
/// *"quando o usuario fizer o upload de qualquer foto no app, voce deve fazer o
/// upload e apresentar como vai ficar de preview, e ao salvar o voce salva a
/// foto"*. Entao:
///
///   escolher -> **envia na hora** -> previa do arquivo LOCAL -> `Publicar`
///   confirma.
///
/// **NAO HA BOTAO SEPARADO DE SALVAR FOTO**, e a ausencia e a parte cuidada:
/// foi exatamente o defeito que ele relatou DUAS vezes. A unica acao de
/// confirmacao desta tela e `Publicar`, e e ela que grava o `upload_id` — o
/// servidor confirma a intencao na MESMA transacao da escrita, e e isso que
/// impede o varredor de recolher a foto dez minutos depois.
///
/// **Sair sem publicar NAO confirma nada.** O objeto fica no balde, a intencao
/// vence em 600 s (medido contra a homologacao em 19/10/2026: `expires_at` veio
/// 599 s a frente do instante do pedido) e o varredor o recolhe. Nao ha rota de
/// cancelamento de intencao no contrato, e inventar uma seria inventar rota.
///
/// ## O texto e LIVRE, e esta tela nao julga nenhuma palavra
///
/// Decisao do cliente: *"deixe o texto livre na timeline"* e *"quem modera vai
/// ser o administrador, deve ir para a pagina de backoffice"*. Entao **nao ha
/// lista de palavra, nao ha recusa por conteudo e nao ha aviso de tom** nesta
/// tela, nem no servidor. O que ela cobra e o que o banco cobra: 1 a 280
/// caracteres.
///
/// O contador de caracteres existe porque 280 e um teto **que a pessoa precisa
/// ver antes de bater nele** — e nao como julgamento do que ela escreveu.
///
/// ## O que esta tela NAO tem, e cada ausencia tem dono
///
/// - **nenhum seletor de visibilidade.** Decisao do cliente: *"se elas forem
///   amigas nao tem problema, o que nao pode e ser publico, sem ter nenhum
///   relacionamento"*. A visibilidade e UMA — conexao aceita — e um seletor com
///   uma opcao nao e uma escolha (`barra_de_listagem.dart`, "os tres casos em
///   que um controle nao nasce");
/// - **nenhuma forma de marcar um pet.** Foto de pet e permitida (cliente,
///   19/10); ligar a publicacao a FICHA de um pet agruparia os pets de um
///   tutor, que o item 7 do ADR-0010 proibe. `PublicationInput` nao tem campo
///   de pet, entao nao ha o que mandar;
/// - **nenhum lugar, nenhuma cidade, nenhum mapa** (ADR-0006: nao ha
///   geocodificacao);
/// - **nenhuma mencao a pessoa.** O contrato nao tem campo, e nao ha busca de
///   pessoas neste produto.
class PublicarNoMural extends StatefulWidget {
  const PublicarNoMural({
    required this.escrita,
    required this.camera,
    required this.envio,
    super.key,
    this.aoPublicar,
  });

  final EscritaDoMural escrita;
  final CameraEGaleria camera;
  final EnvioDeFoto envio;

  /// Chamado depois de publicar, para quem abriu recarregar a linha do tempo.
  /// Nulo em teste de unidade da propria tela.
  final VoidCallback? aoPublicar;

  /// O teto do contrato, COPIADO de la (`PublicationInput.body.maxLength`).
  ///
  /// 280 **nao e escolha desta tela**: e o teto que
  /// `publication_reports.publication_body` ja cobrava antes de a tabela de
  /// publicacoes existir, e e o mesmo de `pets.care_notes`.
  static const int tetoDoTexto = 280;

  static const String tituloDaTela = 'Publicar';
  static const String rotuloDoCampo = 'Sua mensagem';
  static const String exemploDoCampo = 'O que está acontecendo?';
  static const String tirarFoto = 'Tirar uma foto';
  static const String escolherDaGaleria = 'Escolher da galeria';
  static const String rotuloDoAlternativo = 'Descrição da foto';
  static const String ajudaDoAlternativo =
      'Para quem usa leitor de tela. Opcional.';
  static const String publicar = 'Publicar';
  static const String textoObrigatorio = 'Escreva uma mensagem para publicar.';
  static const String fotoPronta = 'Foto enviada. Toque em Publicar para concluir.';
  static const String fotoSemSinal =
      'A foto não subiu: sem conexão. Escolha a foto de novo.';
  static const String fotoRecusada =
      'Essa foto não foi aceita. Tente outra, de até 5 MB.';
  static const String publicada = 'Publicado.';

  /// A explicacao de quem ve o que, dita NA TELA e antes de publicar.
  ///
  /// Ela existe porque a visibilidade nao e escolhivel: sem um seletor, a unica
  /// forma honesta de a pessoa saber o alcance do que ela escreve e **dizer**. E
  /// e o alcance literal do recorte do servidor, nao uma aproximacao.
  static const String quemVe =
      'Quem é sua conexão no Bichu vê esta publicação. Quem não é, não vê.';

  @override
  State<PublicarNoMural> createState() => _PublicarNoMuralState();
}

class _PublicarNoMuralState extends State<PublicarNoMural> {
  final TextEditingController _texto = TextEditingController();
  final TextEditingController _alternativo = TextEditingController();

  FotoLocal? _escolhida;

  /// O `upload_id` que o `Publicar` vai mandar. **Nulo enquanto os bytes nao
  /// chegaram** — e e por isso que ele e separado de [_escolhida]: a previa
  /// aparece na escolha, e o identificador so depois do envio.
  String? _uploadPendente;

  bool _enviando = false;
  bool _publicando = false;
  MensagemDeErro? _faixa;
  String? _confirmacao;
  String? _erroDoTexto;

  @override
  void initState() {
    super.initState();
    // O contador de caracteres e o estado do `Publicar` dependem do texto.
    _texto.addListener(_textoMudou);
  }

  @override
  void dispose() {
    _texto.removeListener(_textoMudou);
    _texto.dispose();
    _alternativo.dispose();
    super.dispose();
  }

  void _textoMudou() {
    setState(() {
      // O erro sai ao primeiro caractere: deixar a mensagem de "escreva algo"
      // na tela enquanto a pessoa escreve e a tela discutindo com ela.
      if (_erroDoTexto != null && _texto.text.trim().isNotEmpty) {
        _erroDoTexto = null;
      }
    });
  }

  /// Quantos caracteres faltam. Conta **pontos de codigo** e nao unidades
  /// UTF-16: um emoji fora do BMP vale 2 em `String.length`, e o
  /// `char_length` do Postgres conta 1. Um contador que divergisse do servidor
  /// diria "faltam 40" e o servidor responderia `400`.
  int get _usados => _texto.text.characters.length;

  bool get _temTexto => _texto.text.trim().isNotEmpty;
  bool get _cabe => _usados <= PublicarNoMural.tetoDoTexto;
  bool get _ocupado => _enviando || _publicando;

  /// `Tirar uma foto`. Pede a permissao quando ainda da para pedir, e desiste
  /// **calada** quando nao da.
  ///
  /// O silencio nao e omissao: a porta de `Escolher da galeria` continua ao
  /// lado e nao depende da camera, entao a pessoa tem como seguir. A faixa de
  /// "abra os ajustes" e da tela da vitrine, que desenha a grade inteira; aqui
  /// ela roubaria a linha de cima da caixa de texto, que e o que o cliente
  /// pediu que existisse.
  Future<void> _tirarFoto() async {
    var estado = await widget.camera.estadoDaCamera();
    if (!mounted) return;
    if (estado == EstadoDaPermissao.negada) {
      estado = await widget.camera.pedirCamera();
      if (!mounted) return;
    }
    if (estado != EstadoDaPermissao.concedida) return;
    final foto = await widget.camera.tirarFoto();
    if (!mounted) return;
    if (foto != null) await _escolheu(foto);
  }

  Future<void> _escolherDaGaleria() async {
    final foto = await widget.camera.escolherDaGaleria();
    if (!mounted) return;
    if (foto != null) await _escolheu(foto);
  }

  /// A foto escolhida **JA SOBE**, e a previa aparece antes de o servidor dizer
  /// qualquer coisa. Ver o cabecalho da classe.
  ///
  /// **HEIC ENTRA**, e por isso a lista e `tiposDeFotoAceitos` e nao
  /// `tiposDeFotoAceitosSemHeic`: `PublicationPhotoIntentInput.content_type`
  /// declara `[image/jpeg, image/png, image/heic, image/webp]`, com a razao
  /// escrita no contrato — a foto sai de um CELULAR, e foto de iPhone e HEIC.
  ///
  /// **Trocar de foto antes de publicar**: o `upload_id` anterior e descartado
  /// aqui, e o objeto do primeiro envio cai no expurgo de dez minutos.
  Future<void> _escolheu(FotoLocal foto) async {
    final recusa = recusaDeTipoDaFoto(foto.tipoDeConteudo, tiposDeFotoAceitos);
    if (recusa != null) {
      setState(() {
        _escolhida = null;
        _uploadPendente = null;
        _confirmacao = null;
        _faixa = MensagemDeErro(texto: recusa);
      });
      anunciar(context, recusa);
      return;
    }

    setState(() {
      _escolhida = foto;
      _uploadPendente = null;
      _confirmacao = null;
      _faixa = null;
      _enviando = true;
    });

    // `EnvioParaConfirmarDepois` com a FUNCAO DA ROTA, e nao com uma etiqueta
    // de proposito: `PublicationPhotoIntentInput` nao tem campo `purpose`, e e
    // a rota (`POST /v1/me/publications/photo-intents`) que fixa o
    // `user_publication`. Passar a funcao, e nao uma etiqueta, e o que impede a
    // troca que este repositorio ja pagou — a vitrine chamando o registrador de
    // capa de encontro e gravando `network_event` numa foto de pessoa, com as
    // duas assinaturas identicas e a troca COMPILANDO.
    final destino = EnvioParaConfirmarDepois(
      pedir: widget.escrita.intencaoDeFotoDaPublicacao,
    );
    final desfecho = await widget.envio.enviar(foto: foto, destino: destino);
    if (!mounted) return;

    setState(() {
      _enviando = false;
      switch (desfecho) {
        case DesfechoDoEnvio.enviada:
          _uploadPendente = destino.uploadId;
          _confirmacao = PublicarNoMural.fotoPronta;
        case DesfechoDoEnvio.semSinal:
          // **A previa SAI quando o envio falha**: o `Publicar` nao teria o que
          // gravar, e manter um retrato na tela depois de um envio que nao
          // aconteceu e a tela prometendo uma foto que nao existe.
          _escolhida = null;
          _faixa = const MensagemDeErro(texto: PublicarNoMural.fotoSemSinal);
        case DesfechoDoEnvio.recusada:
          _escolhida = null;
          _faixa = const MensagemDeErro(texto: PublicarNoMural.fotoRecusada);
      }
    });
    if (!mounted) return;
    anunciar(
      context,
      desfecho == DesfechoDoEnvio.enviada
          ? PublicarNoMural.fotoPronta
          : (_faixa?.texto ?? ''),
    );
  }

  /// O rotulo acessivel a mandar, ou **nulo**.
  ///
  /// Nulo em dois casos, e os dois importam: sem foto (o servidor responde
  /// `400` com `field: alt_text`, e mandar o par invalido seria a tela
  /// produzindo um erro que ela sabia evitar) e com o campo vazio (o rotulo e
  /// opcional, e `''` bateria no piso de 2 caracteres do `CHECK`).
  String? _rotuloDaFoto() {
    if (_uploadPendente == null) return null;
    final rotulo = _alternativo.text.trim();
    return rotulo.isEmpty ? null : rotulo;
  }

  /// Tira a foto escolhida **sem publicar nada**.
  ///
  /// O `upload_id` e descartado junto: ele nao vai no corpo, e a intencao
  /// abandonada vence em dez minutos. Nao ha chamada de rede aqui, e nao
  /// deveria haver — nao existe rota de cancelamento de intencao no contrato.
  void _tirarAFoto() {
    setState(() {
      _escolhida = null;
      _uploadPendente = null;
      _alternativo.clear();
      _confirmacao = null;
    });
  }

  /// O `Publicar`: **a unica confirmacao desta tela.**
  Future<void> _publicar() async {
    if (!_temTexto) {
      setState(() => _erroDoTexto = PublicarNoMural.textoObrigatorio);
      anunciar(context, PublicarNoMural.textoObrigatorio, urgente: true);
      return;
    }

    setState(() {
      _publicando = true;
      _faixa = null;
      _confirmacao = null;
    });

    try {
      await widget.escrita.publicar(
        texto: _texto.text.trim(),
        uploadId: _uploadPendente,
        // O rotulo **so vale com foto**: sem `upload_id` o servidor responde
        // `400` com `field: alt_text`, e mandar o par invalido seria a tela
        // produzindo um erro que ela sabia evitar.
        textoAlternativo: _rotuloDaFoto(),
      );
      if (!mounted) return;
      // **`_publicando` volta a `false` ANTES de fechar**, e nao e detalhe: a
      // tela pode nao fechar -- `maybePop` nao faz nada quando nao ha rota
      // abaixo (e o caso de um link profundo direto para `/mural/publicar`) --
      // e ai ela ficaria presa com o `Publicar` girando para sempre. Medido:
      // sem esta linha o `CircularProgressIndicator` do botao nunca para e
      // `pumpAndSettle` estoura por tempo, que foi como este defeito apareceu.
      setState(() {
        _publicando = false;
        _escolhida = null;
        _uploadPendente = null;
      });
      _texto.clear();
      _alternativo.clear();
      widget.aoPublicar?.call();
      anunciar(context, PublicarNoMural.publicada);
      if (!mounted) return;
      Navigator.of(context).maybePop(true);
    } on FalhaDeChamada catch (falha) {
      if (!mounted) return;
      // **A previa e o `upload_id` FICAM**: o envio aconteceu, e tentar de novo
      // e so a escrita. Limpar aqui faria a pessoa escolher e subir a foto
      // outra vez por uma falha que nao foi dela.
      final mensagem = MensagensDeErro.de(falha);
      setState(() {
        _publicando = false;
        _faixa = mensagem;
      });
      if (!mounted) return;
      anunciar(context, mensagem.texto, urgente: true);
    }
  }

  @override
  Widget build(BuildContext context) {
    final cores = BichuColors.of(context).cores;
    final textos = Theme.of(context).textTheme;
    final local = _escolhida;
    final faixa = _faixa;
    final confirmacao = _confirmacao;

    return Scaffold(
      appBar: AppBar(title: const Text(PublicarNoMural.tituloDaTela)),
      body: SafeArea(
        child: ListView(
          padding: const EdgeInsets.all(BichuEspaco.e4),
          children: <Widget>[
            if (faixa != null) ...<Widget>[
              FaixaDeAviso(texto: faixa.texto),
              const SizedBox(height: BichuEspaco.e4),
            ],

            // A CAIXA DE TEXTO, primeira coisa da tela: e ela que o cliente
            // disse que faltava, e e por ela que a pessoa comeca.
            BichuField(
              rotulo: PublicarNoMural.rotuloDoCampo,
              controlador: _texto,
              exemplo: PublicarNoMural.exemploDoCampo,
              erro: _erroDoTexto,
              habilitado: !_ocupado,
              // Cinco linhas visiveis e o campo crescendo: 280 caracteres em
              // uma linha so esconderiam o comeco do que a pessoa escreveu.
              linhas: 5,
              capitalizacao: TextCapitalization.sentences,
              // **SEM `limite`**, e a ausencia e deliberada: `maxLength` do
              // Material TRUNCA no teclado, e truncar em silencio apaga o que a
              // pessoa escreveu. O contador abaixo diz quanto falta, e o
              // `Publicar` e quem recusa — com o motivo visivel.
            ),
            const SizedBox(height: BichuEspaco.e2),
            _contador(textos, cores),

            const SizedBox(height: BichuEspaco.e4),
            // QUEM VE, dito na tela. Ver `PublicarNoMural.quemVe`.
            Text(
              PublicarNoMural.quemVe,
              style: textos.bodyMedium?.copyWith(color: cores.textSecondary),
            ),

            const SizedBox(height: BichuEspaco.e6),

            // A FOTO. Previa do arquivo LOCAL, por `PreviaDaFoto` — nunca
            // `Image.file` cru, que nao trata `cacheWidth` nem `errorBuilder`.
            if (local != null || _enviando) ...<Widget>[
              _enviando && local == null
                  ? const Center(child: CircularProgressIndicator())
                  : PreviaDaFoto(
                      foto: local,
                      descricao: _alternativo.text.trim().isEmpty
                          ? 'Foto escolhida'
                          : _alternativo.text.trim(),
                    ),
              const SizedBox(height: BichuEspaco.e2),
              if (_uploadPendente != null)
                TextButton(
                  onPressed: _ocupado ? null : _tirarAFoto,
                  child: const Text('Remover a foto'),
                ),
              const SizedBox(height: BichuEspaco.e4),
              // O rotulo acessivel da foto, **opcional**. Ver a decisao no
              // comentario da coluna `user_publications.alt_text`: aqui a
              // mensagem e obrigatoria e o leitor de tela sempre tem o que
              // anunciar, ao contrario da capa do encontro.
              if (_uploadPendente != null)
                BichuField(
                  rotulo: PublicarNoMural.rotuloDoAlternativo,
                  controlador: _alternativo,
                  ajuda: PublicarNoMural.ajudaDoAlternativo,
                  opcional: true,
                  habilitado: !_ocupado,
                  linhas: 2,
                  capitalizacao: TextCapitalization.sentences,
                ),
              const SizedBox(height: BichuEspaco.e4),
            ],

            if (confirmacao != null) ...<Widget>[
              FaixaDeAviso(texto: confirmacao, peso: PesoDaFaixa.informativo),
              const SizedBox(height: BichuEspaco.e4),
            ],

            // AS DUAS PORTAS DA FOTO. Elas nao publicam nada: escolher envia, e
            // `Publicar` confirma.
            if (local == null && !_enviando) ...<Widget>[
              BotaoPrimario(
                rotulo: PublicarNoMural.tirarFoto,
                icone: Icons.photo_camera_outlined,
                aoTocar: _ocupado ? null : _tirarFoto,
              ),
              const SizedBox(height: BichuEspaco.e2),
              OutlinedButton.icon(
                onPressed: _ocupado ? null : _escolherDaGaleria,
                icon: const Icon(Icons.photo_library_outlined),
                label: const Text(PublicarNoMural.escolherDaGaleria),
              ),
              const SizedBox(height: BichuEspaco.e6),
            ],

            // **A UNICA ACAO DE CONFIRMACAO DA TELA.** Ver o cabecalho: nao ha
            // botao separado de salvar foto, e foi esse o defeito relatado duas
            // vezes.
            BotaoPrimario(
              rotulo: PublicarNoMural.publicar,
              carregando: _publicando,
              // **Desabilitado so por FORMA, nunca por sessao**: quem chega
              // aqui passou por `podeCriarNaComunidade` na porta da secao, e um
              // controle que recusa calado e pior que um que recusa dizendo.
              aoTocar: _ocupado || !_temTexto || !_cabe ? null : _publicar,
            ),
          ],
        ),
      ),
    );
  }

  /// O contador. Ele avisa, e nao julga: o texto e livre.
  Widget _contador(TextTheme textos, BichuCores cores) {
    final restantes = PublicarNoMural.tetoDoTexto - _usados;
    final passou = restantes < 0;
    return Align(
      alignment: Alignment.centerRight,
      // O leitor de tela nao precisa ouvir o numero a cada letra: isso
      // atropelaria o que a pessoa esta digitando. O campo ja anuncia o erro
      // quando o `Publicar` recusa.
      child: ExcludeSemantics(
        child: Text(
          passou
              ? '${(-restantes).toString()} caracteres a mais'
              : '$restantes',
          style: textos.bodySmall?.copyWith(
            color: passou ? cores.error : cores.textSecondary,
          ),
        ),
      ),
    );
  }
}
