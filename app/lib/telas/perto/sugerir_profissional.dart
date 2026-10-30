import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:go_router/go_router.dart';

import '../../api/api_client.dart';
import '../../api/busca_de_cep.dart';
import '../../api/envio_de_foto.dart';
import '../../dispositivo/camera_e_galeria.dart';
import '../../api/estados_brasileiros.dart';
import '../../formato/cep.dart';
import '../../formato/telefone.dart';
import '../../api/diretorio_api.dart';
import '../../api/falhas.dart';
import '../../api/mensagens_de_erro.dart';
import '../../api/modelos_diretorio.dart';
import '../../api/problem.dart';
import '../../escopo.dart';
import '../../roteamento/rotas.dart';
import '../../theme/bichu_colors.dart';
import '../../theme/bichu_tokens.g.dart';
import '../../widgets/barra_de_acao_fixa.dart';
import '../../widgets/bichu_field.dart';
import '../../widgets/botao_primario.dart';
import '../../widgets/faixa_de_aviso.dart';
import '../../widgets/faixa_de_imagens.dart';
import '../../widgets/previa_da_foto.dart';
import '../../widgets/recorte_de_imagem.dart';
import '../../widgets/seletor_de_lista.dart';
import '../../widgets/saida_da_tela.dart';

/// **Indicar um profissional, clínica ou laboratório para o `Perto`**
/// (`suggestDirectoryEntry`).
class TelaSugerirProfissional extends StatefulWidget {
  const TelaSugerirProfissional({super.key});

  /// **Mais curto que o rotulo da porta, de proposito.** `BarraDeConta` tem 64
  /// dp e uma linha: medido no aparelho, "Indicar quem atende bem" sai truncado
  /// como "Indicar quem atende be...".
  static const String titulo = 'Indicar profissional';

  /// **O aviso que separa esta tela da de criar encontro.** Antes dos campos,
  /// porque e a decisao que a pessoa precisa entender ao comecar a escrever.
  static const String avisoDeRevisao =
      'A gente confere antes de publicar. O estabelecimento é avisado e decide '
      'se quer aparecer.';

  static const String rotuloDeIndicar = 'Enviar indicação';

  static const String entreParaIndicar = 'Entre para indicar.';

  /// **O bloqueio que esta tela passou a saber ANTES do formulario.**
  static const String semEmailConfirmado =
      MensagensDeErro.canalNaoVerificadoParaIndicar;

  static const String rotuloDeConfirmarEmail = 'Confirmar meu e-mail';

  static const String recebido =
      'Indicação recebida. Ela vai para conferência: nada aparece na Rede até '
      'alguém olhar.';

  /// O rotulo do campo de TIPO DE ENTIDADE (pedido do cliente, 29/10/2026).
  static const String rotuloDoTipoDeEntidade = 'O que é esse lugar';

  /// **A ajuda EXISTE porque os dois eixos se confundem**, e e a mesma frase
  /// que o painel ja diz em `e-tipo-entidade-ajuda`.
  static const String ajudaDoTipoDeEntidade =
      'Uma ONG também escolhe abaixo o que ela faz: aqui você diz o que o '
      'lugar é.';

  /// O rotulo do campo de ATIVIDADE, que era literal na arvore do `build`.
  static const String rotuloDaAtividade = 'O que eles fazem';

  static const String tituloDoLogotipo = 'Logotipo';

  /// **Uma linha de apoio, e o "Opcional" esta nela.** O cliente reprovou texto
  /// excessivo em tela, e o campo precisa dizer que a ausencia e aceitavel: a
  /// maioria de quem indica a clinica do bairro nao tem o arquivo da logo dela.
  static const String ajudaDoLogotipo =
      'A marca do lugar, se você tiver. Opcional.';

  static const String tirarAFoto = 'Tirar foto';

  static const String escolherDaGaleria = 'Escolher da galeria';

  static const String oLogotipoEscolhido = 'O logotipo que você escolheu';

  static const String logotipoSemSinal =
      'O logotipo não subiu: sem conexão agora. Escolha a imagem de novo '
      'quando tiver internet.';

  static const String logotipoRecusado =
      'O logotipo não foi aceito. Escolha outra imagem.';

  /// ## AS FOTOS DO ESTABELECIMENTO -- O SEGUNDO CAMPO, E NAO O MESMO
  ///
  /// Pedido do cliente de 30/10/2026: *"na pagina de indicacao de
  /// profissional/estabelecimento, so tem o campo para subir a foto do
  /// logotipo da empresa, mas nao as fotos do estabelecimento que fica no topo
  /// da pagina"*; e de 29/10/2026: *"devemos deixar enviar ate 4 imagens"*.
  ///
  /// **O logotipo NAO conta entre as quatro**, e isso e do contrato: quem
  /// indica a clinica do bairro pode mandar a logo dela E quatro fotos do
  /// lugar. Obrigar a logo a ocupar uma das quatro faria quem tem logo poder
  /// mandar so tres fotos.
  static const String tituloDasFotos = 'Fotos do estabelecimento';

  /// **Uma linha, com o "Opcional" dentro dela.** O cliente reprovou texto
  /// excessivo em tela; a ordem ("a primeira e a capa") e dita pela propria
  /// faixa, com as imagens na tela.
  static const String ajudaDasFotos =
      'Até 4 fotos do lugar, como ele é por dentro. Opcional.';

  /// **Rotulos PROPRIOS, e nao os mesmos do logotipo.** Os dois campos convivem
  /// no mesmo formulario: dois botoes `Tirar foto` na mesma tela sao
  /// indistinguiveis para quem usa leitor de tela -- e para quem escreve o caso
  /// de teste.
  static const String tirarAFotoDoLugar = 'Tirar foto do lugar';

  static const String escolherAFotoDoLugar = 'Escolher foto do lugar';

  static const String fotoSemSinal =
      'A foto não subiu: sem conexão agora. Escolha a imagem de novo quando '
      'tiver internet.';

  static const String fotoRecusada =
      'A foto não foi aceita. Escolha outra imagem.';

  /// O motivo do bloqueio enquanto os bytes de uma foto estao no ar.
  static const String esperarAFoto = 'Espere a foto terminar de subir.';

  static const String cameraNosAjustes =
      'A câmera está bloqueada nos ajustes do sistema.';

  static const String abrirAjustes = 'Abrir os ajustes';

  /// O motivo do bloqueio enquanto os bytes do logotipo estao no ar.
  static const String esperarOLogotipo =
      'Espere o logotipo terminar de subir.';

  static const String rotuloDoCep = 'CEP';

  /// O rotulo do campo de estado, que deixou de ser `UF` digitada.
  static const String rotuloDoEstado = 'Estado';

  /// O que o seletor mostra enquanto nada foi escolhido.
  static const String escolherOEstado = 'Escolher na lista';

  /// **Diz que o CEP e guardado, e para quem.** A pessoa esta informando o
  /// endereco de um terceiro: esconder que o valor fica salvo seria o tipo de
  /// omissao que a faixa de revisao desta tela existe para nao fazer.
  static const String ajudaDoCep =
      'Preenche bairro, cidade e estado. Você pode mudar depois. Fica salvo '
      'só para quem confere, e não aparece na Rede.';

  /// Os tres desfechos da busca.
  static const String buscandoOCep = 'Buscando o endereço…';

  static const String cepNaoEncontrado =
      'CEP não encontrado. Preencha abaixo.';

  static const String buscaIndisponivel =
      'Não deu para buscar o CEP agora. Preencha abaixo.';

  @override
  State<TelaSugerirProfissional> createState() =>
      _TelaSugerirProfissionalState();
}

enum _Fase { preenchendo, enviando, recebida }

/// O primeiro impedimento, ou nulo.
enum _Impedimento {
  semConta(TelaSugerirProfissional.entreParaIndicar),
  semEmailConfirmado(TelaSugerirProfissional.semEmailConfirmado),
  semNome('Diga o nome do lugar ou da pessoa.'),
  semAtividade('Escolha o que eles fazem.'),
  semCidade('Diga a cidade.'),
  semUf('Escolha o estado.'),
  semTipoDeContato('Escolha como entrar em contato.'),
  semContato('Preencha o contato público.'),
  telefoneIncompleto('Digite DDD e número.'),
  logotipoSubindo(TelaSugerirProfissional.esperarOLogotipo),
  fotoDoLugarSubindo(TelaSugerirProfissional.esperarAFoto);

  const _Impedimento(this.texto);

  final String texto;
}

class _TelaSugerirProfissionalState extends State<TelaSugerirProfissional> {
  final TextEditingController _nome = TextEditingController();
  final TextEditingController _cep = TextEditingController();
  final TextEditingController _bairro = TextEditingController();
  final TextEditingController _cidade = TextEditingController();
  final TextEditingController _contato = TextEditingController();
  final TextEditingController _recado = TextEditingController();

  /// A sigla do estado escolhida na lista de 27, ou nulo.
  String? _uf;

  AtividadeDoDiretorio? _atividade;

  /// O TIPO DE ENTIDADE escolhido.
  TipoDeEntidade _tipoDeEntidade = TipoDeEntidade.profissional;

  TipoDeContatoPublico? _tipoDeContato;

  /// O que a ultima busca de CEP devolveu.
  ResultadoDaBusca? _buscaDoCep;
  bool _buscandoOCep = false;

  /// O CEP que a ultima busca usou, para nao repetir a chamada a cada tecla.
  String _cepJaBuscado = '';

  /// A imagem que a pessoa escolheu no aparelho.
  FotoLocal? _logotipoEscolhido;

  /// O `upload_id` de um logotipo cujos **bytes ja estao no armazenamento** e
  /// que ainda nao foi confirmado, ou nulo.
  String? _uploadDoLogotipo;

  bool _enviandoOLogotipo = false;

  /// As FOTOS DO ESTABELECIMENTO que já subiram, **na ordem em que a pessoa as
  /// pôs**. A primeira é a capa, e não há campo de capa separado: duas formas
  /// de dizer qual é a capa é o defeito, e não o recurso.
  ///
  /// **Só entra aqui o que já tem `upload_id`.** Uma lista de "escolhidas" e
  /// outra de "enviadas" divergiriam na primeira falha de rede, e a tela
  /// mostraria prévia de imagem que o corpo não vai confirmar.
  final List<_FotoDoLugar> _fotosDoLugar = <_FotoDoLugar>[];

  bool _enviandoFotoDoLugar = false;

  /// A foto cujos bytes estão **subindo agora**, para a prévia provisória.
  ///
  /// "Apresentar como vai ficar" foi palavra do cliente, e a derivada do
  /// servidor não existe nesse instante: sem ela, a pessoa escolhe a foto, a
  /// folha de recorte fecha e a tela não muda em nada.
  FotoLocal? _fotoDoLugarSubindo;

  /// Comeca em `negada` como nas outras telas de foto: `negada` e o estado em
  /// que ainda da para PEDIR, e e o unico seguro de supor antes de perguntar.
  EstadoDaPermissao _permissaoDaCamera = EstadoDaPermissao.negada;

  _Fase _fase = _Fase.preenchendo;
  MensagemDeErro? _erro;
  Map<String, String> _errosDeCampo = const <String, String>{};
  String? _chave;

  @override
  void didChangeDependencies() {
    super.didChangeDependencies();
    _lerAPermissaoDaCamera();
  }

  @override
  void dispose() {
    _nome.dispose();
    _cep.dispose();
    _bairro.dispose();
    _cidade.dispose();
    _contato.dispose();
    _recado.dispose();
    super.dispose();
  }

  void _aoDigitar(String _) => setState(() {
        _erro = null;
        _errosDeCampo = const <String, String>{};
      });

  static final RegExp _soDigitos = RegExp(r'[^0-9]');

  /// Busca o endereco do CEP e preenche **so o que estiver VAZIO**.
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
      _preencherSeVazio(_bairro, endereco.bairro, 'neighborhood');
      _preencherSeVazio(_cidade, endereco.cidade, 'city');
      final uf = siglaDeEstadoValida(endereco.uf);
      if (_uf == null && uf != null) {
        _uf = uf;
        _errosDeCampo = <String, String>{..._errosDeCampo}..remove('state');
      }
    });
  }

  /// Campo vazio recebe; campo escrito fica.
  void _preencherSeVazio(
    TextEditingController campo,
    String valor,
    String chave,
  ) {
    if (valor.isEmpty || campo.text.trim().isNotEmpty) return;
    campo.text = valor;
    _errosDeCampo = <String, String>{..._errosDeCampo}..remove(chave);
  }

  /// A linha que conta o que a busca fez.
  Widget _linhaDaBusca(TextTheme textos) {
    if (_buscandoOCep) {
      return Text(
        TelaSugerirProfissional.buscandoOCep,
        style: textos.bodySmall,
      );
    }
    final texto = switch (_buscaDoCep) {
      ResultadoDaBusca.naoEncontrado =>
        TelaSugerirProfissional.cepNaoEncontrado,
      ResultadoDaBusca.indisponivel =>
        TelaSugerirProfissional.buscaIndisponivel,
      _ => null,
    };
    if (texto == null) return const SizedBox.shrink();
    return Text(texto, style: textos.bodySmall);
  }

  /// O estado da camera, lido **antes** de a pessoa tocar em nada.
  Future<void> _lerAPermissaoDaCamera() async {
    final estado = await Escopo.of(context).camera.estadoDaCamera();
    if (!mounted) return;
    setState(() => _permissaoDaCamera = estado);
  }

  /// `Tirar foto`. Pede a permissao quando ainda da para pedir, e desiste
  /// calada quando nao da -- a faixa de ajustes ja esta na tela nesse caso.
  Future<void> _tirarOLogotipo() async {
    final camera = Escopo.of(context).camera;
    var estado = _permissaoDaCamera;
    if (estado == EstadoDaPermissao.negada) {
      estado = await camera.pedirCamera();
      if (!mounted) return;
      setState(() => _permissaoDaCamera = estado);
    }
    if (estado != EstadoDaPermissao.concedida) return;
    final foto = await camera.tirarFoto();
    if (!mounted || foto == null) return;
    final ajustado = await _ajustarOLogotipo(camera, foto);
    if (!mounted || ajustado == null) return;
    await _escolheuOLogotipo(ajustado);
  }

  Future<void> _escolherOLogotipoDaGaleria() async {
    final camera = Escopo.of(context).camera;
    final foto = await camera.escolherDaGaleria();
    if (!mounted || foto == null) return;
    final ajustado = await _ajustarOLogotipo(camera, foto);
    if (!mounted || ajustado == null) return;
    await _escolheuOLogotipo(ajustado);
  }

  /// O RECORTE, entre "a pessoa escolheu" e o envio.
  Future<FotoLocal?> _ajustarOLogotipo(
    CameraEGaleria camera,
    FotoLocal foto,
  ) =>
      ajustarAFoto(
        context,
        camera: camera,
        foto: foto,
        formato: FormatoDoRecorte.logoDaIndicacao,
        titulo: 'Ajuste o logotipo',
      );

  Future<void> _abrirOsAjustes() =>
      Escopo.of(context).camera.abrirAjustesDoSistema();

  /// O logotipo escolhido **JA SOBE**, e a previa aparece antes de o servidor
  /// dizer qualquer coisa.
  Future<void> _escolheuOLogotipo(FotoLocal foto) async {
    final recusa =
        recusaDeTipoDaFoto(foto.tipoDeConteudo, tiposDeFotoAceitosSemHeic);
    if (recusa != null) {
      setState(() {
        _logotipoEscolhido = null;
        _uploadDoLogotipo = null;
        _erro = MensagemDeErro(texto: recusa);
      });
      return;
    }

    setState(() {
      _logotipoEscolhido = foto;
      _uploadDoLogotipo = null;
      _erro = null;
      _enviandoOLogotipo = true;
    });

    final escopo = Escopo.of(context);
    final destino = EnvioParaConfirmarDepois(
      pedir: DiretorioApi(escopo.api).intencaoDeLogotipoDaIndicacao,
    );
    final desfecho = await escopo.envioDeFoto.enviar(
      foto: foto,
      destino: destino,
    );
    if (!mounted) return;

    setState(() {
      _enviandoOLogotipo = false;
      switch (desfecho) {
        case DesfechoDoEnvio.enviada:
          _uploadDoLogotipo = destino.uploadId;
        case DesfechoDoEnvio.semSinal:
          _logotipoEscolhido = null;
          _erro = const MensagemDeErro(
            texto: TelaSugerirProfissional.logotipoSemSinal,
          );
        case DesfechoDoEnvio.recusada:
          _logotipoEscolhido = null;
          _erro = const MensagemDeErro(
            texto: TelaSugerirProfissional.logotipoRecusado,
          );
      }
    });
  }

  // =========================================================================
  // AS FOTOS DO ESTABELECIMENTO
  //
  // **A AQUISICAO MORA NESTE ARQUIVO, e isso e decisao e nao acidente.** O
  // portao de exaustividade do recorte
  // (`app/test/telas/recorte_em_todo_upload_test.dart`) conta ARQUIVOS sob
  // `app/lib/telas` que chamam `tirarFoto`/`escolherDaGaleria` e exige que cada
  // um chame `ajustarAFoto`; o mapa `pontos` dele nomeia ESTE arquivo como
  // "logotipo da indicacao". Mover a aquisicao para uma peca compartilhada
  // tiraria o ponto de upload do arquivo que o cliente reconhece. A peca
  // compartilhada (`widgets/faixa_de_imagens.dart`) por isso so DESENHA.
  // =========================================================================

  /// `Tirar foto` da faixa. Mesma negociacao de permissao do logotipo.
  Future<void> _tirarAFotoDoLugar() async {
    final camera = Escopo.of(context).camera;
    var estado = _permissaoDaCamera;
    if (estado == EstadoDaPermissao.negada) {
      estado = await camera.pedirCamera();
      if (!mounted) return;
      setState(() => _permissaoDaCamera = estado);
    }
    if (estado != EstadoDaPermissao.concedida) return;
    final foto = await camera.tirarFoto();
    if (!mounted || foto == null) return;
    final ajustada = await _ajustarAFotoDoLugar(camera, foto);
    if (!mounted || ajustada == null) return;
    await _escolheuAFotoDoLugar(ajustada);
  }

  Future<void> _escolherAFotoDoLugarDaGaleria() async {
    final camera = Escopo.of(context).camera;
    final foto = await camera.escolherDaGaleria();
    if (!mounted || foto == null) return;
    final ajustada = await _ajustarAFotoDoLugar(camera, foto);
    if (!mounted || ajustada == null) return;
    await _escolheuAFotoDoLugar(ajustada);
  }

  /// O RECORTE, entre "a pessoa escolheu" e o envio.
  ///
  /// **`fotoDaIndicacao` e nao `logoDaIndicacao`**: esta e a faixa 16:9 do topo
  /// da ficha (`DERIVADAS_DA_FOTO_DO_LOCAL`, variante `banner`), e nao o
  /// quadrado da marca. Enquadrar no quadrado da logo cortaria exatamente o que
  /// a faixa existe para mostrar.
  Future<FotoLocal?> _ajustarAFotoDoLugar(
    CameraEGaleria camera,
    FotoLocal foto,
  ) =>
      ajustarAFoto(
        context,
        camera: camera,
        foto: foto,
        formato: FormatoDoRecorte.fotoDaIndicacao,
        titulo: 'Ajuste a foto do lugar',
      );

  /// A foto escolhida **JA SOBE**, como o logotipo ja faz, e so entra na faixa
  /// quando os bytes chegaram.
  Future<void> _escolheuAFotoDoLugar(FotoLocal foto) async {
    final recusa =
        recusaDeTipoDaFoto(foto.tipoDeConteudo, tiposDeFotoAceitosSemHeic);
    if (recusa != null) {
      setState(() => _erro = MensagemDeErro(texto: recusa));
      return;
    }
    // **O teto e conferido AQUI tambem, e nao so no botao desabilitado.** Um
    // toque que escapasse pela janela entre o envio e o `setState` pediria uma
    // quinta assinatura, e cada assinatura e uma autorizacao de escrita que
    // nao se desfaz.
    if (_fotosDoLugar.length >= FaixaDeImagens.maximoDoContrato) return;

    setState(() {
      _erro = null;
      _enviandoFotoDoLugar = true;
      _fotoDoLugarSubindo = foto;
    });

    final escopo = Escopo.of(context);
    final destino = EnvioParaConfirmarDepois(
      pedir: DiretorioApi(escopo.api).intencaoDeFotoDoEstabelecimento,
    );
    final desfecho = await escopo.envioDeFoto.enviar(
      foto: foto,
      destino: destino,
    );
    if (!mounted) return;

    setState(() {
      _enviandoFotoDoLugar = false;
      // **A previa provisoria SAI em todos os desfechos.** No caminho que deu
      // certo ela e substituida pela linha definitiva; nos dois que falharam
      // ela tem de desaparecer, senao a tela promete uma foto que o corpo nao
      // vai confirmar -- e prometer e nao cumprir e pior que nao oferecer.
      _fotoDoLugarSubindo = null;
      switch (desfecho) {
        case DesfechoDoEnvio.enviada:
          final id = destino.uploadId;
          // `uploadId` nulo com desfecho `enviada` nao acontece pelo contrato
          // de `EnvioParaConfirmarDepois`; a guarda existe para que, se
          // acontecesse, a faixa NAO ganhasse uma previa sem identificador --
          // seria prometer uma imagem que o corpo nao confirma.
          if (id != null && id.isNotEmpty) {
            _fotosDoLugar.add(_FotoDoLugar(foto: foto, uploadId: id));
          } else {
            _erro = const MensagemDeErro(
              texto: TelaSugerirProfissional.fotoRecusada,
            );
          }
        case DesfechoDoEnvio.semSinal:
          _erro = const MensagemDeErro(
            texto: TelaSugerirProfissional.fotoSemSinal,
          );
        case DesfechoDoEnvio.recusada:
          _erro = const MensagemDeErro(
            texto: TelaSugerirProfissional.fotoRecusada,
          );
      }
    });
  }

  /// Troca a ordem de duas fotos. **A primeira e a capa**, entao mover para o
  /// topo e o jeito de escolher a capa.
  void _moverAFotoDoLugar(int de, int para) {
    if (de < 0 || de >= _fotosDoLugar.length) return;
    if (para < 0 || para >= _fotosDoLugar.length) return;
    setState(() {
      final movida = _fotosDoLugar.removeAt(de);
      _fotosDoLugar.insert(para, movida);
    });
  }

  /// Tira a foto da faixa. **Nao cancela o envio**: nao ha rota de cancelamento
  /// de intencao no contrato, e o varredor recolhe o objeto em dez minutos.
  void _removerAFotoDoLugar(int indice) {
    if (indice < 0 || indice >= _fotosDoLugar.length) return;
    setState(() => _fotosDoLugar.removeAt(indice));
  }

  _Impedimento? get _impedimento {
    final usuario = Escopo.of(context).sessao.usuario;
    if (usuario == null) {
      return _Impedimento.semConta;
    }
    if (!usuario.emailVerificado) return _Impedimento.semEmailConfirmado;
    if (_nome.text.trim().length < 2) return _Impedimento.semNome;
    if (_atividade == null) return _Impedimento.semAtividade;
    if (_cidade.text.trim().length < 2) return _Impedimento.semCidade;
    if (_uf == null) return _Impedimento.semUf;
    if (_tipoDeContato == null) return _Impedimento.semTipoDeContato;
    if (_contato.text.trim().length < 3) return _Impedimento.semContato;
    if (_tipoDeContato == TipoDeContatoPublico.phone &&
        telefoneEmE164(_contato.text) == null) {
      return _Impedimento.telefoneIncompleto;
    }
    if (_enviandoOLogotipo) return _Impedimento.logotipoSubindo;
    if (_enviandoFotoDoLugar) return _Impedimento.fotoDoLugarSubindo;
    return null;
  }

  Future<void> _indicar() async {
    if (_impedimento != null) return;
    final escopo = Escopo.of(context);
    setState(() {
      _fase = _Fase.enviando;
      _erro = null;
      _errosDeCampo = const <String, String>{};
    });

    final corpo = DiretorioApi.corpoDaSugestao(
      nome: _nome.text.trim(),
      atividade: _atividade!,
      tipoDeEntidade: _tipoDeEntidade,
      cidade: _cidade.text.trim(),
      uf: _uf!,
      tipoDeContato: _tipoDeContato!,
      contato: _tipoDeContato == TipoDeContatoPublico.phone
          ? telefoneEmE164(_contato.text)!
          : _contato.text.trim(),
      bairro: _bairro.text.trim(),
      cep: _cep.text.trim(),
      recado: _recado.text.trim(),
      logoUploadId: _uploadDoLogotipo,
      fotosDoEstabelecimento:
          _fotosDoLugar.map((f) => f.uploadId).toList(growable: false),
    );
    final chave = _chave ??= ApiClient.novaChaveDeIdempotencia();

    try {
      await escopo.diretorio.sugerir(corpo, idempotencyKey: chave);
      if (!mounted) return;
      setState(() => _fase = _Fase.recebida);
    } on FalhaDeConexao {
      if (!mounted) return;
      setState(() {
        _fase = _Fase.preenchendo;
        _erro = const MensagemDeErro(
          texto: 'Sem conexão agora. Toque de novo quando tiver internet.',
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
          acaoEmCurso: AcaoEmCurso.indicarProfissional,
        );
        _errosDeCampo = _camposRecusados(falha);
      });
    } on FalhaDeChamada catch (falha) {
      if (!mounted) return;
      setState(() {
        _fase = _Fase.preenchendo;
        _erro = MensagensDeErro.de(
          falha,
          acaoEmCurso: AcaoEmCurso.indicarProfissional,
        );
      });
    } on Object catch (erro, pilha) {
      registrarFalhaInesperada(erro, pilha, onde: 'ao indicar um profissional');
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
  static Map<String, String> _camposRecusados(FalhaDaApi falha) {
    final mapa = <String, String>{};
    for (final campo in falha.problem.campos) {
      if (campo.campo.isEmpty) continue;
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
        if (_fase == _Fase.recebida) return _recibo(context);

        final impedimento = _impedimento;
        final enviando = _fase == _Fase.enviando;
        final tipo = _tipoDeContato;

        return Scaffold(
          appBar: const BarraDeConta(
            titulo: TelaSugerirProfissional.titulo,
            saida: TipoDeSaida.voltar,
          ),
          body: SafeArea(
            top: false,
            bottom: false,
            child: ListView(
              padding: const EdgeInsets.all(BichuEspaco.e4),
              addSemanticIndexes: false,
              children: <Widget>[
                const FaixaDeAviso(
                  peso: PesoDaFaixa.informativo,
                  texto: TelaSugerirProfissional.avisoDeRevisao,
                ),
                if (_erro != null) ...<Widget>[
                  const SizedBox(height: BichuEspaco.e4),
                  FaixaDeAviso(
                    texto: _erro!.texto,
                    rotuloDaAcao: _erro!.acao,
                    aoTocarNaAcao: _saidaDoErro(context, _erro!),
                  ),
                ],
                if (impedimento == _Impedimento.semConta) ...<Widget>[
                  const SizedBox(height: BichuEspaco.e4),
                  FaixaDeAviso(
                    texto: TelaSugerirProfissional.entreParaIndicar,
                    rotuloDaAcao: 'Entrar',
                    aoTocarNaAcao: () => context.push(Rotas.entrar),
                  ),
                ],
                if (impedimento == _Impedimento.semEmailConfirmado) ...<Widget>[
                  const SizedBox(height: BichuEspaco.e4),
                  FaixaDeAviso(
                    texto: TelaSugerirProfissional.semEmailConfirmado,
                    rotuloDaAcao:
                        TelaSugerirProfissional.rotuloDeConfirmarEmail,
                    aoTocarNaAcao: () => context.push(
                      Rotas.verifiqueSeuEmail,
                      extra: escopo.sessao.usuario?.email ?? '',
                    ),
                  ),
                ],
                const SizedBox(height: BichuEspaco.e6),
                BichuField(
                  rotulo: 'Nome do lugar',
                  controlador: _nome,
                  aoMudar: _aoDigitar,
                  erro: _errosDeCampo['display_name'],
                  limite: 120,
                  exemplo: 'Clínica Veterinária Bichinho',
                  capitalizacao: TextCapitalization.words,
                  habilitado: !enviando,
                  acaoDeTeclado: TextInputAction.next,
                ),
                const SizedBox(height: BichuEspaco.e4),
                SeletorDeLista(
                  rotulo: TelaSugerirProfissional.rotuloDoTipoDeEntidade,
                  ajuda: TelaSugerirProfissional.ajudaDoTipoDeEntidade,
                  itens: TipoDeEntidade.values
                      .map(
                        (t) => ItemDeLista(codigo: t.codigo, rotulo: t.rotulo),
                      )
                      .toList(),
                  selecionado: _tipoDeEntidade.codigo,
                  habilitado: !enviando,
                  aoSelecionar: (codigo) => setState(() {
                    _tipoDeEntidade =
                        TipoDeEntidade.porCodigo(codigo) ?? _tipoDeEntidade;
                    _erro = null;
                  }),
                ),
                const SizedBox(height: BichuEspaco.e4),
                SeletorDeLista(
                  rotulo: TelaSugerirProfissional.rotuloDaAtividade,
                  itens: AtividadeDoDiretorio.values
                      .map(
                        (a) => ItemDeLista(codigo: a.codigo, rotulo: a.rotulo),
                      )
                      .toList(),
                  selecionado: _atividade?.codigo,
                  erro: _errosDeCampo['kind'],
                  habilitado: !enviando,
                  aoSelecionar: (codigo) => setState(() {
                    _atividade = AtividadeDoDiretorio.porCodigo(codigo);
                    _erro = null;
                  }),
                ),
                const SizedBox(height: BichuEspaco.e6),
                _BlocoDoLogotipo(
                  escolhido: _logotipoEscolhido,
                  enviando: _enviandoOLogotipo,
                  permissao: _permissaoDaCamera,
                  aoTirar: enviando ? null : _tirarOLogotipo,
                  aoEscolher: enviando ? null : _escolherOLogotipoDaGaleria,
                  aoAbrirAjustes: _abrirOsAjustes,
                ),
                const SizedBox(height: BichuEspaco.e6),
                // **DEPOIS do logotipo, e campo SEPARADO dele.** O cliente
                // nomeou as duas ausencias em duas mensagens, como duas
                // coisas: a marca e a faixa do topo da ficha.
                FaixaDeImagens(
                  imagens: _fotosDoLugar
                      .map((f) => f.foto)
                      .toList(growable: false),
                  subindo: _fotoDoLugarSubindo,
                  enviando: _enviandoFotoDoLugar,
                  permissao: _permissaoDaCamera,
                  // **O aviso dos ajustes JA ESTA na tela**, no bloco do
                  // logotipo acima. Dois avisos iguais dao dois botoes
                  // `Abrir os ajustes`, indistinguiveis para quem usa leitor
                  // de tela -- e foi assim que o caso do logotipo reprovou.
                  mostrarAvisoDeAjustes: false,
                  textos: const TextosDaFaixaDeImagens(
                    titulo: TelaSugerirProfissional.tituloDasFotos,
                    ajuda: TelaSugerirProfissional.ajudaDasFotos,
                    tirarAFoto: TelaSugerirProfissional.tirarAFotoDoLugar,
                    escolherDaGaleria:
                        TelaSugerirProfissional.escolherAFotoDoLugar,
                    cameraNosAjustes:
                        TelaSugerirProfissional.cameraNosAjustes,
                    abrirAjustes: TelaSugerirProfissional.abrirAjustes,
                  ),
                  aoTirar: enviando ? null : _tirarAFotoDoLugar,
                  aoEscolher: enviando ? null : _escolherAFotoDoLugarDaGaleria,
                  aoAbrirAjustes: _abrirOsAjustes,
                  aoMover: _moverAFotoDoLugar,
                  aoRemover: _removerAFotoDoLugar,
                ),
                const SizedBox(height: BichuEspaco.e6),
                Semantics(
                  header: true,
                  child: Text('Onde atende', style: textos.titleMedium),
                ),
                const SizedBox(height: BichuEspaco.e3),
                BichuField(
                  rotulo: TelaSugerirProfissional.rotuloDoCep,
                  controlador: _cep,
                  opcional: true,
                  limite: limiteDoCep,
                  tipoDeTeclado: TextInputType.number,
                  ajuda: TelaSugerirProfissional.ajudaDoCep,
                  formatadores: const <TextInputFormatter>[
                    MascaraDeCep(),
                  ],
                  correcaoAutomatica: false,
                  habilitado: !enviando,
                  acaoDeTeclado: TextInputAction.next,
                  aoMudar: (valor) {
                    _aoDigitar(valor);
                    _buscarOCep();
                  },
                ),
                if (_buscandoOCep || _buscaDoCep != null) ...<Widget>[
                  const SizedBox(height: BichuEspaco.e2),
                  _linhaDaBusca(textos),
                ],
                const SizedBox(height: BichuEspaco.e4),
                BichuField(
                  rotulo: 'Cidade',
                  controlador: _cidade,
                  aoMudar: _aoDigitar,
                  erro: _errosDeCampo['city'],
                  limite: 80,
                  capitalizacao: TextCapitalization.words,
                  habilitado: !enviando,
                  acaoDeTeclado: TextInputAction.next,
                ),
                const SizedBox(height: BichuEspaco.e4),
                SeletorDeLista(
                  rotulo: TelaSugerirProfissional.rotuloDoEstado,
                  estadoInicial: TelaSugerirProfissional.escolherOEstado,
                  itens: estadosBrasileiros,
                  selecionado: _uf,
                  erro: _errosDeCampo['state'],
                  habilitado: !enviando,
                  aoSelecionar: (codigo) => setState(() {
                    _uf = codigo;
                    _erro = null;
                    _errosDeCampo = const <String, String>{};
                  }),
                ),
                const SizedBox(height: BichuEspaco.e4),
                BichuField(
                  rotulo: 'Bairro',
                  controlador: _bairro,
                  aoMudar: _aoDigitar,
                  erro: _errosDeCampo['neighborhood'],
                  opcional: true,
                  limite: 80,
                  capitalizacao: TextCapitalization.words,
                  habilitado: !enviando,
                  acaoDeTeclado: TextInputAction.next,
                ),
                const SizedBox(height: BichuEspaco.e6),
                Semantics(
                  header: true,
                  child: Text('Contato público', style: textos.titleMedium),
                ),
                const SizedBox(height: BichuEspaco.e3),
                SeletorDeLista(
                  rotulo: 'Como entrar em contato',
                  itens: TipoDeContatoPublico.values
                      .map(
                        (t) => ItemDeLista(codigo: t.codigo, rotulo: t.rotulo),
                      )
                      .toList(),
                  selecionado: tipo?.codigo,
                  erro: _errosDeCampo['public_contact.kind'],
                  habilitado: !enviando,
                  aoSelecionar: (codigo) => setState(() {
                    final novo = TipoDeContatoPublico.porCodigo(codigo);
                    if (novo != _tipoDeContato) _contato.clear();
                    _tipoDeContato = novo;
                    _erro = null;
                    _errosDeCampo = const <String, String>{};
                  }),
                ),
                const SizedBox(height: BichuEspaco.e4),
                BichuField(
                  rotulo: tipo?.rotulo ?? 'Contato',
                  controlador: _contato,
                  aoMudar: _aoDigitar,
                  erro: _errosDeCampo['public_contact.value'],
                  limite: tipo == TipoDeContatoPublico.phone
                      ? limiteDoTelefone
                      : 120,
                  ajuda: tipo?.exemplo ??
                      'Escolha acima como entrar em contato.',
                  tipoDeTeclado: tipo == TipoDeContatoPublico.phone
                      ? TextInputType.phone
                      : TextInputType.text,
                  formatadores: tipo == TipoDeContatoPublico.phone
                      ? const <TextInputFormatter>[MascaraDeTelefone()]
                      : null,
                  correcaoAutomatica: false,
                  habilitado: !enviando && tipo != null,
                  acaoDeTeclado: TextInputAction.done,
                ),
                const SizedBox(height: BichuEspaco.e6),
                BichuField(
                  rotulo: 'Por que você indica',
                  controlador: _recado,
                  aoMudar: _aoDigitar,
                  erro: _errosDeCampo['note'],
                  opcional: true,
                  linhas: 3,
                  limite: 280,
                  ajuda: 'Só quem confere lê. Não aparece na Rede.',
                  capitalizacao: TextCapitalization.sentences,
                  habilitado: !enviando,
                ),
              ],
            ),
          ),
          bottomNavigationBar: BarraDeAcaoFixa(
            acoes: <Widget>[
              if (impedimento != null &&
                  impedimento != _Impedimento.semEmailConfirmado &&
                  impedimento != _Impedimento.semConta)
                _MotivoDoBloqueio(
                  texto: impedimento.texto,
                  cor: cores.textPrimary,
                ),
              BotaoPrimario(
                rotulo: TelaSugerirProfissional.rotuloDeIndicar,
                critico: true,
                carregando: enviando,
                aoTocar: impedimento == null && !enviando ? _indicar : null,
              ),
            ],
          ),
        );
      },
    );
  }

  /// O recibo. **Diz que foi para conferencia, e nao que foi publicado.**
  Widget _recibo(BuildContext context) {
    final cores = BichuColors.of(context).cores;
    final textos = Theme.of(context).textTheme;

    return Scaffold(
      appBar: const BarraDeConta(
        titulo: TelaSugerirProfissional.titulo,
        saida: TipoDeSaida.fechar,
      ),
      body: SafeArea(
        top: false,
        bottom: false,
        child: ListView(
          padding: const EdgeInsets.all(BichuEspaco.e4),
          addSemanticIndexes: false,
          children: <Widget>[
            Semantics(
              header: true,
              liveRegion: true,
              child: Text(
                'Obrigado pela indicação',
                style: textos.titleLarge?.copyWith(color: cores.textPrimary),
              ),
            ),
            const SizedBox(height: BichuEspaco.e3),
            Text(
              TelaSugerirProfissional.recebido,
              style: textos.bodyLarge?.copyWith(color: cores.textSecondary),
            ),
          ],
        ),
      ),
      bottomNavigationBar: BarraDeAcaoFixa(
        acoes: <Widget>[
          BotaoPrimario(
            rotulo: 'Voltar para a Rede',
            critico: true,
            aoTocar: () => context.go(Rotas.rede),
          ),
        ],
      ),
    );
  }

  /// A SAIDA DA FAIXA DE ERRO: o rotulo que o servidor manda tem de levar a
  /// algum lugar.
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

/// Uma FOTO DO ESTABELECIMENTO que **ja esta no armazenamento**.
///
/// A previa e o `upload_id` andam juntos de proposito: uma lista de previas e
/// outra de identificadores divergiriam na primeira remocao, e a tela mostraria
/// uma imagem cujo identificador foi para outro lugar do corpo.
@immutable
class _FotoDoLugar {
  const _FotoDoLugar({required this.foto, required this.uploadId});

  /// O arquivo no aparelho, para a miniatura.
  final FotoLocal foto;

  /// O que `suggestDirectoryEntry` vai confirmar.
  final String uploadId;
}

/// O motivo pelo qual o botao esta desabilitado, dito em voz alta.
class _BlocoDoLogotipo extends StatelessWidget {
  const _BlocoDoLogotipo({
    required this.escolhido,
    required this.enviando,
    required this.permissao,
    required this.aoTirar,
    required this.aoEscolher,
    required this.aoAbrirAjustes,
  });

  final FotoLocal? escolhido;

  /// Os bytes do LOGOTIPO estao subindo (nao a indicacao).
  final bool enviando;

  final EstadoDaPermissao permissao;
  final VoidCallback? aoTirar;
  final VoidCallback? aoEscolher;
  final VoidCallback aoAbrirAjustes;

  /// O lado do quadro, em dp.
  static const double ladoDoQuadro = 120;

  @override
  Widget build(BuildContext context) {
    final cores = BichuColors.of(context).cores;
    final textos = Theme.of(context).textTheme;
    final local = escolhido;

    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: <Widget>[
        Semantics(
          header: true,
          child: Text(
            TelaSugerirProfissional.tituloDoLogotipo,
            style: textos.titleMedium,
          ),
        ),
        const SizedBox(height: BichuEspaco.e1),
        Text(
          TelaSugerirProfissional.ajudaDoLogotipo,
          style: textos.bodySmall?.copyWith(color: cores.textSecondary),
        ),
        const SizedBox(height: BichuEspaco.e3),
        ClipRRect(
          borderRadius: BorderRadius.circular(BichuRaio.lg),
          child: SizedBox(
            height: ladoDoQuadro,
            width: ladoDoQuadro,
            child: local != null
                ? PreviaDaFoto(
                    foto: local,
                    descricao: TelaSugerirProfissional.oLogotipoEscolhido,
                    altura: ladoDoQuadro,
                  )
                : _QuadradoSemLogotipo(cores: cores, enviando: enviando),
          ),
        ),
        const SizedBox(height: BichuEspaco.e3),
        Text(
          orientacaoDeTamanhoDaImagem,
          style: textos.bodySmall?.copyWith(color: cores.textSecondary),
        ),
        const SizedBox(height: BichuEspaco.e3),
        if (permissao == EstadoDaPermissao.negadaPermanentemente) ...<Widget>[
          FaixaDeAviso(
            peso: PesoDaFaixa.informativo,
            texto: TelaSugerirProfissional.cameraNosAjustes,
            rotuloDaAcao: TelaSugerirProfissional.abrirAjustes,
            aoTocarNaAcao: aoAbrirAjustes,
          ),
          const SizedBox(height: BichuEspaco.e3),
        ],
        if (permissao != EstadoDaPermissao.indisponivel) ...<Widget>[
          BotaoSecundario(
            rotulo: TelaSugerirProfissional.tirarAFoto,
            aoTocar: enviando ? null : aoTirar,
          ),
          const SizedBox(height: BichuEspaco.e2),
        ],
        OutlinedButton(
          onPressed: enviando ? null : aoEscolher,
          style: OutlinedButton.styleFrom(
            minimumSize: const Size.fromHeight(BichuAlvoDeToque.min),
          ),
          child: const Text(TelaSugerirProfissional.escolherDaGaleria),
        ),
      ],
    );
  }
}

/// O lugar do logotipo quando nao ha logotipo.
class _QuadradoSemLogotipo extends StatelessWidget {
  const _QuadradoSemLogotipo({required this.cores, required this.enviando});

  final BichuCores cores;

  /// Os bytes estao subindo. Troca o simbolo por um indicador -- e a diferenca
  /// entre "cabe uma imagem aqui" e "a sua imagem esta subindo", dita sem uma
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
              Icons.image_outlined,
              color: cores.textSecondary,
              size: 32,
            ),
    );
  }
}

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
