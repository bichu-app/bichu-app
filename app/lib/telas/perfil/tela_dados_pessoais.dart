import 'dart:async';

import 'package:flutter/material.dart';
import 'package:flutter/services.dart';

import '../../acessibilidade/anunciar.dart';
import '../../api/busca_de_cep.dart';
import '../../api/conexoes_api.dart';
import '../../api/modelos_conexao.dart';
import '../../api/convites_api.dart';
import '../../formato/apelido.dart';
import '../../formato/cep.dart';
import '../../formato/quando.dart';
import '../../api/envio_de_foto.dart';
import '../../api/estados_brasileiros.dart';
import '../../api/falhas.dart';
import '../../api/me_api.dart';
import '../../api/mensagens_de_erro.dart';
import '../../api/problem.dart';
import '../../dispositivo/camera_e_galeria.dart';
import '../../escopo.dart';
import '../../roteamento/saida_da_mensagem.dart';
import '../../sessao/fiacao_do_passkey.dart';
import '../../formato/telefone.dart';
import '../../roteamento/rotas.dart';
import '../../theme/bichu_colors.dart';
import '../../theme/bichu_tokens.g.dart';
import '../../widgets/barra_de_acao_fixa.dart';
import '../../widgets/bichu_field.dart';
import '../../widgets/botao_primario.dart';
import '../../widgets/faixa_de_aviso.dart';
import '../../widgets/imagem_da_rede.dart';
import '../../widgets/moldura.dart';
import '../../widgets/previa_da_foto.dart';
import '../../widgets/qr_do_convite.dart';
import '../../widgets/saida_da_tela.dart';
import '../../widgets/selo_de_validado.dart';
import '../../widgets/seletor_de_lista.dart';

/// `Perfil` › `Meus dados`: os dados pessoais do tutor.
///
/// Pedido do cliente em 18/10/2026, literal: *"crie tambem uma tela do perfil
/// do usuario, para ele editar os dados pessoais, e-mail, telefone e outras
/// informacoes"*.
///
/// ===========================================================================
/// OS CAMPOS SAO OS DO CONTRATO, E SO ELES
/// ===========================================================================
/// `MeUpdate` (corpo de `PATCH /v1/me`) aceita quatro coisas, e a leitura esta
/// escrita em `api/me_api.dart`: `display_name`, `phone_e164` e a
/// `reference_area` com `postal_code`, `neighborhood`, `city` e `state`. Nao ha
/// campo nesta tela que o servidor nao aceite -- um campo a mais seria um
/// controle que recusa com 400 ou, pior, que parece salvar e nao salva.
///
/// **A FOTO EXISTE DESDE 18/10/2026**, e o paragrafo que dizia "nao ha foto"
/// foi substituido por este e nao apagado: ele era certo enquanto o contrato
/// nao tinha o campo. O cliente pediu, literal: *"coloque um campo para o
/// usuario cadastrar sua propria foto e um selo na foto dele, se ele estiver
/// validado"*.
///
/// Tres pecas do contrato, e nenhuma delas e nova aqui:
/// `createMyPhotoUploadIntent` (prefixo `people/`, HEIC aceito),
/// `MeUpdate.photo_upload_id` para amarrar a foto a conta, e `Me.photo` para
/// le-la de volta. **O selo nao e imagem**: ele e
/// `Me.contact_channel_verified`, o mesmo campo e a mesma regua que os OUTROS
/// veem desta conta, desenhado em cima da foto. Gravar o selo dentro do JPEG
/// faria a imagem mentir no dia em que a pessoa trocasse de e-mail.
///
/// **Era `Me.email_verified` ate 21/10/2026** -- ver o cabecalho de
/// `_SeloDeValidado`, no fim deste arquivo, para por que a troca aconteceu e
/// por que `email_verified` continua existindo e sendo lido aqui, na linha de
/// situacao do e-mail.
///
/// **A foto e visivel SO AO DONO.** `Me.photo` e a unica resposta do contrato
/// que a traz, `getMe` exige `bearerAuth` sem alternativa vazia, e a decisao
/// registrada (ADR-0025 item 2, "nem slug, nem avatar") proibe avatar para
/// terceiros. **Nenhuma outra tela deste app a desenha**, e acrescentar uma
/// seria exposicao de pessoa fisica sem decisao do cliente.
///
/// **Esta tela nao TIRA a foto.** `MeUpdate.photo_upload_id` aceita `null` para
/// remover, e o cliente pediu o cadastro. Um botao `Tirar a foto` aqui seria
/// superficie que ninguem pediu sobre uma operacao que ninguem conferiu.
///
/// ===========================================================================
/// O E-MAIL APARECE E NAO SE EDITA, E O MOTIVO E DE CONTRATO
/// ===========================================================================
/// `MeUpdate` **nao aceita `email`** (SEC-003, escrito no proprio contrato), e
/// a rota propria -- `POST /v1/me/email-change` -- exige reautenticacao com
/// senha (`x-reauth-scope: email_change`), que **este app nao tem**: nada em
/// `app/lib/api` chama `POST /auth/reauth` e `api_client.dart` nao manda
/// `X-Reauth-Token`. Um campo editavel aqui, ou um botao `Trocar o e-mail`,
/// seria acao sem destino -- o que o criterio 2 da BICHUS-62 proibe -- e
/// receberia 401 `reauthentication-required` em silencio.
///
/// Entao o endereco e mostrado de LEITURA, com a situacao de confirmacao ao
/// lado e com o caminho humano dito em uma linha. A tela nao promete troca, e
/// nao chama rota que nao esteja ao alcance dela.
///
/// ===========================================================================
/// O QUE A TELA NAO FAZ, E NAO E ESQUECIMENTO
/// ===========================================================================
/// - **Nao abre o formulario quando a leitura falha.** Um formulario em branco
///   sobre uma leitura que nao aconteceu e um `Salvar` que apaga o cadastro: o
///   PATCH mandaria vazio o que a tela nao conseguiu ler. Falha mostra faixa
///   com `Atualizar`, e nada mais.
/// - **Nao enfileira sem conexao.** A fila offline existe para o que nao pode
///   esperar -- o caso de perdido, o achado. Corrigir o telefone pode.
/// - **Nao manda campo que nao mudou.** `MeUpdate` nao tem campo obrigatorio;
///   um corpo com os quatro campos sempre sobrescreveria com vazio o que a
///   pessoa nem abriu.
class TelaDadosPessoais extends StatefulWidget {
  const TelaDadosPessoais({super.key});

  // ======================================================================
  // A SECAO DO CONVITE, VINDA DE `conexoes/convide_tutores.dart` (28/10/2026)
  // ======================================================================
  //
  // Decisao do cliente: a tela `Convide tutores` morre e o QR vai para dentro
  // de `Meus dados`. As constantes viajaram com as suas palavras EXATAS -- o
  // texto nao foi reescrito na mudanca de casa, porque reescrever teria sido
  // redecidir sem ninguem pedindo.
  //
  // **TRES EIXOS fazem o QR nao dominar a pagina, e nenhum deles e so
  // tamanho** (desenho de 28/10, secao 3.5):
  //
  //   1. POSICAO -- ultimo bloco da pagina. Quem veio trocar o telefone nunca
  //      passa por ele. (`Salvar` mora na `BarraDeAcaoFixa`, que e a barra de
  //      baixo e nao rola: na pagina rolante este bloco e o fim.)
  //   2. ESTADO -- **recolhido por padrao**: 48 dp fechado contra os 200 dp do
  //      quadrado. `QrDoConvite.lado` e o mesmo numero de `QrDaPlaquinha` e
  //      **nao encolhe** -- QR que encolhe de uma tela para a outra e QR que a
  //      camera do vizinho pega numa e nao pega na outra.
  //   3. TINTA -- chao `surfaceSunken` com borda `outline`, e nao cartao
  //      `surface` com sombra. Afundado le como gaveta de apoio; elevado leria
  //      como o assunto da tela, que sao os dados pessoais.

  /// O nome da secao, e o rotulo da linha que a abre.
  static const String tituloDoConvite = 'Meu QR de convite';

  /// A linha de apoio da secao recolhida. **Ela diz PARA QUEM e o convite**,
  /// que e o que faz a pessoa saber se precisa abrir.
  static const String apoioDoConvite =
      'Para quem tem pet e ainda não está no Bichu';

  /// **O QR É APP-PARA-APP, e a secao diz isso em voz alta** (decisão de
  /// 21/10/2026, e a frase viajou intacta de `Convide tutores`).
  ///
  /// Sem esta frase a pessoa aponta a câmera comum do celular para o quadrado,
  /// não acontece nada que ela reconheça, e ela conclui que o recurso está
  /// quebrado. E a frase não é consolo: ela é **a instrução** — o que faz o
  /// convite funcionar é a outra pessoa abrir o Bichu e escanear de dentro
  /// dele. O quadrado carrega o **token**, e não uma URL.
  static const String oQrEDeAppParaApp =
      'Peça para o usuário abrir o Bichu e escanear daqui. A câmera comum do '
      'celular não abre este código.';

  /// A ação de emitir, para quem ainda não tem convite nesta sessão.
  ///
  /// **ELA VIAJOU JUNTO, e e ressalva PARADA no cliente desde 26/10.** Ele
  /// disse que o QR da pessoa *deveria* ser criado automaticamente; hoje isso
  /// nao e alcancavel sem mexer no `openapi.yaml` -- nao existe operacao de
  /// LEITURA do proprio convite, o token em claro existe uma vez so (o banco
  /// guarda o SHA-256), e emitir na abertura revogaria o anterior a cada
  /// visita. **Sem este botao, a secao nao teria QR nenhum para mostrar.**
  static const String criarOConvite = 'Criar o meu QR de convite';

  /// O que a secao diz antes de haver QR nesta sessão.
  static const String semConviteAgora =
      'Você não tem QR de convite valendo agora.';

  /// **O QR não é lido de volta, e por isso ele não sobrevive a fechar a
  /// seção.**
  static const String oQrNaoVoltaDepois =
      'O QR aparece aqui enquanto esta seção estiver aberta. Ao voltar, toque '
      'em criar de novo — o anterior deixa de valer.';

  /// O PLACAR, EM UMA LINHA. **Ele viajou junto por decisao do cliente de
  /// 28/10/2026**, e nao por zelo meu.
  ///
  /// `invited_joined_count` era a outra metade da tela que morreu, e o
  /// DESENHO.md levantou que mover so o QR *"o apaga em silencio"*. O cliente
  /// respondeu a pergunta fechada 3 com (a): o placar fica.
  ///
  /// **UMA LINHA, e nao a `TrilhaDeConvites` de tres marcos que havia na tela
  /// morta.** Isso e o que o protovipo desenhou e o que foi aprovado: o placar
  /// *"nao e o assunto de `Meus dados` e nao merece secao propria"*. A trilha
  /// de marcos (`O primeiro vizinho`, `Três olhos a mais`,
  /// `Dez na vizinhança`) **morreu com a tela**, e isso esta reportado -- ela
  /// era reconhecimento simbolico, nao premio, e nenhuma decisao a nomeou.
  static String placarDeQuemEntrou(int quantos) => quantos == 1
      ? '1 tutor entrou no Bichu pelo seu convite.'
      : '$quantos tutores entraram no Bichu pelo seu convite.';

  /// O prazo em palavras. **`QuandoNaLista.diaEMes` e nao uma data crua**: o
  /// convite vale 30 dias, entao dia e mes bastam.
  static String valeAte(DateTime quando) =>
      'Vale até ${QuandoNaLista.diaEMes(quando)}.';

  // ======================================================================
  // O LOGIN POR DIGITAL (BICHUS-301, 28/10/2026)
  // ======================================================================
  //
  // Relato do cliente: *"quando eu fiz o login ele nao pediu pra eu logar com
  // a digital"*. A causa foi MEDIDA e nao suposta:
  // `passkey_credentials` tinha **ZERO linhas** em homologacao, `abas.dart`
  // tinha **ZERO mencoes** a passkey, e as unicas duas telas que falavam dela
  // eram o convite depois do CADASTRO e a tentativa ao abrir a tela de entrar.
  // **Quem ja tinha conta nunca conseguia ativar** -- a unica janela eram os
  // segundos apos criar uma conta nova.
  //
  // **SAO DUAS ENTRADAS PARA UM CAMINHO SO.** Esta secao e a porta de quem
  // quer ligar quando quiser; o convite depois do login
  // (`telas/conta/tela_entrar.dart`) e para quem nao ligou e nao recusou. As
  // duas chamam `FiacaoDoPasskey.oferecerCadastro`, que ja existia e e o que o
  // cadastro usa -- o cliente pediu reaproveitamento, e dois jeitos de
  // registrar credencial seriam dois lugares onde a marca local pode deixar de
  // ser gravada.
  //
  // **A ROTA EXIGE SESSAO, e aqui isso e a favor**:
  // `beginPasskeyRegistration` tira a conta do `sub` do token, e em
  // `Meus dados` a pessoa esta logada por definicao.
  //
  // **DESATIVAR NAO ENTROU, e a rota EXISTE.** `revokePasskey`
  // (`DELETE /v1/auth/passkeys/{passkeyId}`) esta no contrato, com teto
  // folgado, e `PasskeysApi` **nao a expoe** -- a camada tem `listar`, mas nao
  // `revogar`. Expo-la e desenhar o caminho de volta (qual credencial? a deste
  // aparelho, que a lista nao identifica, ou todas?) e trabalho que o cliente
  // nao pediu nesta rodada, e esta reportado como ressalva em vez de
  // adivinhado. A senha continua sendo a outra porta, e revogar nunca trancou
  // ninguem fora.

  /// O nome da secao do login por digital.
  static const String tituloDoPasskey = 'Login por digital';

  /// O apoio da secao: o que ela faz, numa linha.
  static const String apoioDoPasskey =
      'Entre usando a digital, o rosto ou o desbloqueio do aparelho.';

  /// A acao de ligar, para quem nao tem credencial neste aparelho.
  static const String ativarOPasskey = 'Ativar o login por digital';

  /// O ESTADO de quem ja tem credencial aqui. **E estado, e nao acao**: o
  /// cliente pediu *"mostre o estado, nao so o botao"*, e sem ele a pessoa nao
  /// tem como saber se ja ligou.
  static const String passkeyAtivado =
      'O login por digital está ativo neste aparelho.';

  /// O ESTADO DO MEIO, e ele e o que mais erra.
  ///
  /// Credencial na CONTA sem marca neste aparelho e o que acontece com
  /// sincronizacao (Google Password Manager, Chaveiro do iCloud), reinstalacao
  /// e restauracao de backup. **Nao e o mesmo que "nao tem"**, e oferecer
  /// `Ativar` aqui como se nao houvesse nada mentiria sobre o que a conta tem.
  /// Quem resolve e `FiacaoDoPasskey.reconciliarComAConta`, que MARCA o
  /// aparelho em vez de criar uma credencial redundante -- e esta frase e o que
  /// a pessoa le enquanto isso acontece.
  static const String passkeyNaContaNaoNesteAparelho =
      'Você já tem login por digital nesta conta, mas ainda não neste '
      'aparelho. Entre com a senha uma vez e ele passa a valer aqui.';

  /// APARELHO SEM BIOMETRIA. **Estado normal, e nao erro**: o cliente foi
  /// explicito, e a pessoa nao pode ver uma promessa que o sistema vai negar.
  static const String passkeyIndisponivel =
      'Este aparelho não oferece login por digital. É preciso ter bloqueio de '
      'tela configurado.';

  /// A falha de ATIVAR. Uma frase, e ela nao culpa a pessoa.
  static const String falhaAoAtivarOPasskey =
      'Não conseguimos ativar agora. Tente de novo.';

  @override
  State<TelaDadosPessoais> createState() => _TelaDadosPessoaisState();
}

/// Os desfechos de uma abertura. Nenhum deles e formulario em branco por falha.
enum _Fase { carregando, formulario, falhaNaLeitura }

class _TelaDadosPessoaisState extends State<TelaDadosPessoais> {
  final TextEditingController _nome = TextEditingController();
  final TextEditingController _apelido = TextEditingController();
  final TextEditingController _telefone = TextEditingController();
  final TextEditingController _cep = TextEditingController();
  final TextEditingController _bairro = TextEditingController();
  final TextEditingController _cidade = TextEditingController();

  String? _uf;

  /// O que o servidor devolveu na ultima leitura. E a referencia do que MUDOU:
  /// sem ela, nao ha como mandar so o que a pessoa alterou.
  DadosPessoais? _lido;

  _Fase _fase = _Fase.carregando;
  bool _salvando = false;
  String? _textoDaFalha;
  String? _confirmacao;
  MensagemDeErro? _faixa;

  /// O erro de cada campo, pela mesma chave que o servidor usa em
  /// `errors[].field`. Uma estrutura so para a conferencia local e para a do
  /// servidor: duas listas de erro divergiriam na mensagem.
  final Map<String, String> _erros = <String, String>{};

  ResultadoDaBusca? _buscaDoCep;
  bool _buscandoOCep = false;
  String _cepJaBuscado = '';

  /// A foto que a pessoa escolheu no aparelho. **A fonte da PREVIA, e ela vem
  /// do ARQUIVO LOCAL.**
  ///
  /// Nao se espera a URL do servidor para desenhar: a derivada so existe
  /// depois de o worker rodar (`status: processing` nasce com `url: null`), e
  /// uma previa que esperasse por ela ficaria vazia segundos depois de a
  /// pessoa escolher a foto -- parecendo travada. `PreviaDaFoto` desenha o
  /// arquivo com `cacheWidth`, e a diferenca e medida: 48.771.072 bytes
  /// decodificados sem ele contra 2.904.768 com `cacheWidth: 984`, 16,8x.
  ///
  /// Nulo depois de o `Salvar` gravar a foto -- dali em diante quem manda e a
  /// derivada do servidor, em [DadosPessoais.fotoUrl].
  FotoLocal? _fotoEscolhida;

  /// O `upload_id` de uma foto cujos **bytes ja estao no armazenamento** e que
  /// ainda **nao foi confirmada**, ou nulo quando nao ha nenhuma.
  ///
  /// Este campo e a diferenca entre "ha foto escolhida" e "ha foto para
  /// gravar", e e ele que o `Salvar` manda em `MeUpdate.photo_upload_id`.
  /// Ele fica nulo quando o envio falhou: um identificador de bytes que nao
  /// subiram volta `400 upload_not_usable` sem dizer por que.
  String? _uploadDaFoto;

  /// Comeca em `negada` como no registro de achado: `negada` e o estado em que
  /// ainda da para PEDIR, e e o unico seguro de supor antes de perguntar.
  EstadoDaPermissao _permissaoDaCamera = EstadoDaPermissao.negada;

  bool _enviandoAFoto = false;

  bool _carregou = false;

  @override
  void didChangeDependencies() {
    super.didChangeDependencies();
    // Uma vez: `Escopo.of` precisa de `context` com dependencia ligada, e
    // `initState` nao tem. A guarda existe porque mudar o tema do sistema
    // tambem chama este metodo, e sem ela viraria uma chamada de rede.
    if (_carregou) return;
    _carregou = true;
    _carregar();
    _lerAPermissaoDaCamera();
  }

  /// O estado da camera, lido **antes** de a pessoa tocar em nada.
  ///
  /// E o que permite a tela nao desenhar `Tirar foto` em aparelho sem camera:
  /// botao que nao leva a nada e pior que a ausencia dele. Mesmo arranjo do
  /// cadastro de foto do pet e do registro de achado.
  Future<void> _lerAPermissaoDaCamera() async {
    final estado = await Escopo.of(context).camera.estadoDaCamera();
    if (!mounted) return;
    setState(() => _permissaoDaCamera = estado);
  }

  // -------------------------------------------------------------------------
  // A FOTO DA PROPRIA PESSOA
  // -------------------------------------------------------------------------

  /// `Tirar foto`. Pede a permissao quando ainda da para pedir, e desiste
  /// calada quando nao da -- a faixa de ajustes ja esta na tela nesse caso.
  Future<void> _tirarAFoto() async {
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
    if (foto != null) await _escolheu(foto);
  }

  Future<void> _escolherDaGaleria() async {
    final foto = await Escopo.of(context).camera.escolherDaGaleria();
    if (!mounted) return;
    if (foto != null) await _escolheu(foto);
  }

  Future<void> _abrirOsAjustes() =>
      Escopo.of(context).camera.abrirAjustesDoSistema();

  /// A foto escolhida **JA SOBE**, e a previa aparece antes de o servidor
  /// dizer qualquer coisa.
  ///
  /// Cliente, 19/10/2026, literal: *"remova esse botao de salvar foto, quando o
  /// usuario fizer o upload de qualquer foto no app, voce deve fazer o upload e
  /// apresentar como vai ficar de preview, e ao salvar o voce salva a foto"*.
  ///
  /// Os bytes saem aqui; a CONFIRMACAO sai no [_salvar]. Isso casa com o
  /// contrato sem inventar rota: intencao, envio e confirmacao sempre foram
  /// tres passos separados por desenho, e o pedido do cliente e mover o
  /// terceiro para outro toque.
  ///
  /// **A previa e pintada ANTES do envio**, e nao depois: este `setState` corre
  /// antes do primeiro `await`, entao o quadro com a imagem do arquivo local ja
  /// esta na tela enquanto os bytes sobem.
  ///
  /// **Trocar de foto antes de salvar**: o `upload_id` anterior e descartado
  /// aqui, no mesmo `setState`. O objeto do primeiro envio fica no
  /// armazenamento e cai no expurgo de dez minutos do servidor -- nao ha rota
  /// de cancelamento de intencao no contrato, e inventar uma seria inventar
  /// rota.
  Future<void> _escolheu(FotoLocal foto) async {
    // A RECUSA POR TIPO, dita ANTES do envio. Ver `recusaDeTipoDaFoto`: ela
    // existe porque a alternativa e a pessoa esperar um envio inteiro para o
    // worker marcar `rejected` depois.
    final recusa = recusaDeTipoDaFoto(foto.tipoDeConteudo, tiposDeFotoAceitos);
    if (recusa != null) {
      setState(() {
        _fotoEscolhida = null;
        _uploadDaFoto = null;
        _confirmacao = null;
        _faixa = MensagemDeErro(texto: recusa);
      });
      anunciar(context, recusa);
      return;
    }

    setState(() {
      _fotoEscolhida = foto;
      _uploadDaFoto = null;
      _faixa = null;
      _confirmacao = null;
      _enviandoAFoto = true;
    });

    // O escopo e lido ANTES do primeiro `await`, como no resto desta tela.
    final escopo = Escopo.of(context);
    // `EnvioParaConfirmarDepois` com a FUNCAO DA ROTA, e nao com uma etiqueta
    // de proposito: `MyPhotoIntentInput` nao tem campo `purpose`, e e a rota
    // (`POST /v1/media/my-photo-intents`) que fixa o `user_photo`. Era uma
    // troca de funcao de assinatura identica que gravou `network_event` numa
    // foto de pessoa hoje, e passar a rota e o que torna a troca visivel.
    final destino =
        EnvioParaConfirmarDepois(pedir: escopo.me.intencaoDeFotoDoUsuario);
    final desfecho = await escopo.envioDeFoto.enviar(
      foto: foto,
      destino: destino,
    );
    if (!mounted) return;

    setState(() {
      _enviandoAFoto = false;
      switch (desfecho) {
        case DesfechoDoEnvio.enviada:
          _uploadDaFoto = destino.uploadId;
          _confirmacao = _TextosDosDados.fotoProntaParaSalvar;
        case DesfechoDoEnvio.semSinal:
          // **A previa SAI quando o envio falha**, e isso nao e perder o
          // trabalho da pessoa: o `Salvar` nao teria o que gravar, e manter um
          // retrato na tela depois de um envio que nao aconteceu e a tela
          // prometendo uma foto que nao existe. Os dois botoes logo acima sao o
          // caminho de tentar de novo, e a frase diz isso.
          _fotoEscolhida = null;
          _faixa = const MensagemDeErro(texto: _TextosDosDados.fotoSemSinal);
        case DesfechoDoEnvio.recusada:
          _fotoEscolhida = null;
          _faixa = const MensagemDeErro(texto: _TextosDosDados.fotoRecusada);
      }
    });
    if (!mounted) return;
    anunciar(
      context,
      desfecho == DesfechoDoEnvio.enviada
          ? _TextosDosDados.fotoProntaParaSalvar
          : (_faixa?.texto ?? ''),
    );
  }

  @override
  void dispose() {
    for (final c in <TextEditingController>[
      _nome,
      _apelido,
      _telefone,
      _cep,
      _bairro,
      _cidade,
    ]) {
      c.dispose();
    }
    super.dispose();
  }

  Future<void> _carregar() async {
    setState(() {
      _fase = _Fase.carregando;
      _textoDaFalha = null;
      _faixa = null;
    });
    try {
      final dados = await Escopo.of(context).me.meusDados();
      if (!mounted) return;
      setState(() {
        _lido = dados;
        _nome.text = dados.usuario.nome ?? '';
        // O APELIDO ATUAL, para a pessoa poder trocar sem redigitar.
        //
        // Ele vem de `GET /v1/me`, que responde sobre quem esta autenticado:
        // **o apelido sai so para o dono** nesta fatia (plano 4-C). Vazio e um
        // estado valido -- nenhum fluxo obriga a escolher.
        //
        // Nao precisa passar por formatador: o que o servidor devolve ja esta
        // normalizado (`citext` minusculo), e o `FiltroDeApelido` nao
        // acrescenta separador nenhum -- ao contrario do CEP e do telefone,
        // cuja leitura precisa ser mascarada a mao porque `formatEditUpdate`
        // nao roda quando a tela escreve no controlador.
        _apelido.text = dados.apelido ?? '';
        // **Mostra formatado, guarda E.164.** O que esta no campo e a
        // gramatica brasileira que se le; quem produz valor de contrato e
        // `telefoneEmE164`, na hora de enviar.
        // `telefoneDoE164`, e nao `mascaraDeTelefone`: o que vem do servidor
        // e E.164 (`+5511987654321`), e a mascara de DIGITACAO descarta o `+`
        // e le os treze digitos como se fossem locais -- o campo abria com
        // `(55) 11987-6543`, e um `Salvar` gravava `+5555119876543` por cima
        // do telefone certo. Ver a prosa de `telefoneDoE164`.
        _telefone.text = telefoneDoE164(dados.telefone);
        // **Mascarado na LEITURA tambem**, e nao so na digitacao: o
        // formatador do campo roda em `formatEditUpdate`, que nao e chamado
        // quando a tela escreve no controlador. Sem esta linha o CEP salvo
        // apareceria `01310100` e a digitacao produziria `01310-100` -- duas
        // formas do mesmo campo na mesma tela.
        //
        // E ela e o que aguenta o valor TORTO que pode estar gravado:
        // `MeUpdate.reference_area.postal_code` aceita `^\d{5}-?\d{3}$`, com
        // hifen OPCIONAL, entao existe CEP com hifen no banco vindo de cliente
        // antigo. `mascaraDeCep` descarta o que nao e digito e reformata, em
        // vez de mostrar `01310--100`.
        _cep.text = mascaraDeCep(dados.cep ?? '');
        _bairro.text = dados.bairro ?? '';
        _cidade.text = dados.cidade ?? '';
        _uf = (dados.uf != null && dados.uf!.length == 2) ? dados.uf : null;
        _cepJaBuscado = _soDigitos(_cep.text);
        _fase = _Fase.formulario;
      });
    } on FalhaDeChamada catch (falha) {
      if (!mounted) return;
      setState(() {
        _textoDaFalha = MensagensDeErro.de(falha).texto;
        _fase = _Fase.falhaNaLeitura;
      });
    } on Object catch (erro, pilha) {
      // O que nao e `FalhaDeChamada` -- um corpo 200 fora do contrato, por
      // exemplo. Sem este ramo a tela ficaria em `carregando` para sempre.
      registrarFalhaInesperada(erro, pilha, onde: 'ao ler os meus dados');
      if (!mounted) return;
      setState(() {
        _textoDaFalha = MensagensDeErro.servidorFora;
        _fase = _Fase.falhaNaLeitura;
      });
    }
  }

  static String _soDigitos(String bruto) => bruto.replaceAll(RegExp(r'\D'), '');

  /// A busca de CEP, com as mesmas tres regras do pedido da plaquinha:
  /// so preenche campo vazio, nada fica bloqueado, e **nada aqui impede o
  /// salvar**. Ver `api/busca_de_cep.dart`: e texto, nunca coordenada.
  Future<void> _buscarOCep() async {
    final cep = _soDigitos(_cep.text);
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
      _preencherSeVazio(_bairro, endereco.bairro, _CamposDosDados.bairro);
      _preencherSeVazio(_cidade, endereco.cidade, _CamposDosDados.cidade);
      if (_uf == null && endereco.uf.length == 2) {
        _uf = endereco.uf;
        _erros.remove(_CamposDosDados.uf);
      }
    });
  }

  void _preencherSeVazio(
    TextEditingController campo,
    String valor,
    String chave,
  ) {
    if (valor.isEmpty || campo.text.trim().isNotEmpty) return;
    campo.text = valor;
    _erros.remove(chave);
  }

  /// Confere campo por campo e devolve os erros TODOS de uma vez.
  ///
  /// De uma vez, e nao o primeiro: recusar um campo por vez faz a pessoa
  /// descobrir o formulario aos tropecos. E cada mensagem diz **o que fazer**,
  /// porque "invalido" nao e instrucao.
  Map<String, String> _conferir() {
    final erros = <String, String>{};
    final lido = _lido;

    // O NOME NAO PODE MAIS FICAR VAZIO, por decisao do cliente de 18/10/2026:
    // *"nao permitir atualizar o cadastro, se nao tiver algum nome
    // cadastrado"*. `MeUpdate.display_name` ganhou `minLength: 1` e o servidor
    // recusa vazio e so-espaco; esta linha e a conveniencia que para antes da
    // ida a rede. Antes daqui apagar o nome era uma escolha OFERECIDA em texto.
    if (_nome.text.trim().isEmpty) {
      erros[_CamposDosDados.nome] = _TextosDosDados.nomePrecisaDeTexto;
    }

    // O APELIDO: so o PREENCHIDO e conferido.
    //
    // Cliente, 18/10/2026: *"o apelido esta livre, vai estar no cadastro do
    // usuario e na pagina de edicao do perfil"*. Vazio e um estado valido e
    // permanente -- nenhum fluxo obriga a escolher (plano 4-C.8).
    //
    // **Apagar nao da por aqui, e nao e falta de caminho: e a regra.** Soltar
    // um apelido de volta ao pool e o furo do plano 4-C.7 -- quem o pegasse
    // herdaria o que a vizinhanca associava a quem o tinha. Entao quem JA TEM
    // apelido e esvazia o campo e avisado em vez de ter o campo ignorado em
    // silencio.
    //
    // **A disponibilidade nao e conferida aqui**, e nao ha consulta: quem
    // decide e o indice do banco, no envio, e a recusa volta com
    // `code: taken` (plano 4-C.5). A troca de 60 dias tambem e do servidor,
    // com `code: too_soon`.
    final apelidoDigitado = _apelido.text.trim();
    final apelidoLido = lido?.apelido ?? '';
    if (apelidoDigitado.isEmpty) {
      if (apelidoLido.isNotEmpty) {
        erros[_CamposDosDados.apelido] = _TextosDosDados.apelidoNaoSeApaga;
      }
    } else {
      final recusa = IdentificadorDoApelido.recusa(apelidoDigitado);
      if (recusa != null) {
        final saidas = IdentificadorDoApelido.sugestoes(apelidoDigitado);
        erros[_CamposDosDados.apelido] =
            saidas.isEmpty ? recusa : '$recusa Tente ${saidas.join(', ')}.';
      }
    }

    final telefoneDigitado = _telefone.text.trim();
    if (telefoneDigitado.isEmpty) {
      // **Apagar o telefone nao da por aqui, e isso e do contrato.**
      // `phone_e164` exige `^\+55\d{10,11}$`: uma string vazia e recusada com
      // 400, e nao ha `null` em `MeUpdate`. Dizer isso e melhor que mandar um
      // corpo que o servidor devolve.
      if (lido?.telefone != null && lido!.telefone!.isNotEmpty) {
        erros[_CamposDosDados.telefone] = _TextosDosDados.telefoneNaoSeApaga;
      }
    } else if (telefoneEmE164(telefoneDigitado) == null) {
      erros[_CamposDosDados.telefone] = _TextosDosDados.telefoneIncompleto;
    }

    final cepDigitado = _soDigitos(_cep.text);
    if (cepDigitado.isEmpty) {
      // Mesma razao do telefone: `postal_code` exige `^\d{5}-?\d{3}$`.
      if (lido?.cep != null && lido!.cep!.isNotEmpty) {
        erros[_CamposDosDados.cep] = _TextosDosDados.cepNaoSeApaga;
      }
    } else if (cepDigitado.length != 8) {
      erros[_CamposDosDados.cep] = _TextosDosDados.cepTemOitoDigitos;
    }

    // `state` tem `minLength: 2`: sem UF escolhida nao ha o que mandar, e
    // apagar a que ja estava la seria 400.
    if (_uf == null && (lido?.uf != null && lido!.uf!.isNotEmpty)) {
      erros[_CamposDosDados.uf] = _TextosDosDados.escolhaOEstado;
    }
    return erros;
  }

  /// O valor a enviar, ou nulo quando **nao mudou**.
  ///
  /// A comparacao e com o que o servidor devolveu, e nao com um campo
  /// "sujo": trocar uma letra e voltar atras deixa o campo tocado e o valor
  /// igual, e mandar igual e escrita sem motivo contra um teto de 60/h.
  String? _seMudou(String agora, String? antes) {
    final anterior = antes ?? '';
    return agora == anterior ? null : agora;
  }

  Future<void> _salvar() async {
    final erros = _conferir();
    if (erros.isNotEmpty) {
      // **Nunca recusa calado.** Cada campo que falta aparece marcado, com o
      // que fazer nele.
      setState(() {
        _erros
          ..clear()
          ..addAll(erros);
        _faixa = null;
        _confirmacao = null;
      });
      return;
    }

    final lido = _lido;
    if (lido == null) return;

    // A FOTO AINDA SUBINDO. Dizer isso e melhor que gravar sem ela em
    // silencio: o `upload_id` so existe depois de os bytes chegarem, e um
    // `Salvar` que passasse por aqui gravaria o resto do cadastro e deixaria a
    // foto de fora sem ninguem saber.
    if (_enviandoAFoto) {
      setState(() {
        _confirmacao = null;
        _faixa = const MensagemDeErro(texto: _TextosDosDados.fotoAindaSubindo);
      });
      anunciar(context, _TextosDosDados.fotoAindaSubindo);
      return;
    }

    final telefoneDigitado = _telefone.text.trim();
    final novoTelefone = telefoneDigitado.isEmpty
        ? null
        : telefoneEmE164(telefoneDigitado);
    final cepDigitado = _soDigitos(_cep.text);

    final nome = _seMudou(_nome.text.trim(), lido.usuario.nome);
    // **Minusculo e aparado**, e nunca `_apelido.text`: `@Maria ` e `@maria`
    // sao o mesmo apelido. Vazio nao vira `null`-que-apaga -- ele e filtrado
    // por `_conferir` quando ha apelido gravado, e por `_seMudou` quando nao
    // ha (vazio contra vazio nao mudou).
    final apelido = _seMudou(
      apelidoParaOContrato(_apelido.text) ?? '',
      lido.apelido,
    );
    // **E.164, nunca o que esta na tela.** A mascara e do olho.
    final telefone = novoTelefone == null
        ? null
        : _seMudou(novoTelefone, lido.telefone);
    final cep = cepDigitado.isEmpty
        ? null
        : _seMudou(cepDigitado, _soDigitos(lido.cep ?? ''));
    final bairro = _seMudou(_bairro.text.trim(), lido.bairro);
    final cidade = _seMudou(_cidade.text.trim(), lido.cidade);
    final uf = _uf == null ? null : _seMudou(_uf!, lido.uf);

    // A FOTO ENVIADA E AINDA NAO CONFIRMADA. **Ela conta como mudanca**, e e
    // esta linha que conserta o defeito que o cliente relatou em 19/10/2026:
    // antes dela, escolher a foto e tocar em `Salvar` respondia "Nada mudou
    // desde a ultima vez" e nao gravava foto nenhuma -- medido.
    final fotoParaGravar = _uploadDaFoto;

    if (nome == null &&
        apelido == null &&
        telefone == null &&
        cep == null &&
        bairro == null &&
        cidade == null &&
        uf == null &&
        fotoParaGravar == null) {
      // Nada mudou. Dizer isso e melhor que um `Salvar` que pisca e nao faz
      // nada -- e melhor que uma escrita vazia contra o teto da conta.
      setState(() {
        _faixa = null;
        _confirmacao = _TextosDosDados.nadaMudou;
      });
      anunciar(context, _TextosDosDados.nadaMudou);
      return;
    }

    setState(() {
      _erros.clear();
      _faixa = null;
      _confirmacao = null;
      _salvando = true;
    });

    try {
      final dados = await Escopo.of(context).me.atualizar(
            nome: nome,
            apelido: apelido,
            telefone: telefone,
            cep: cep,
            bairro: bairro,
            cidade: cidade,
            uf: uf,
            // **O MESMO PATCH do nome.** O servidor recusa o cadastro sem
            // nome, e enquanto a foto vinha num PATCH proprio a recusa do nome
            // e a gravacao da foto eram dois atos em transacoes diferentes. O
            // nome ja foi cobrado por `_conferir`, antes da rede.
            fotoUpload: fotoParaGravar,
          );
      if (!mounted) return;
      // A sessao recebe o usuario novo: o `Perfil` mostra o e-mail e as
      // pendencias a partir dela, e sem isto a tela de tras continuaria
      // dizendo que falta o telefone que acabou de ser preenchido.
      await Escopo.of(context).sessao.atualizarUsuario(dados.usuario);
      if (!mounted) return;
      setState(() {
        _lido = dados;
        _confirmacao = _TextosDosDados.salvo;
        _cepJaBuscado = _soDigitos(dados.cep ?? '');
        if (fotoParaGravar != null) {
          // A previa do arquivo local SAI, e o retrato passa a ser o do
          // servidor: o corpo que o PATCH devolveu ja traz `photo.status`
          // (`processing` no instante da gravacao), e desenhar os dois seria
          // duas respostas para a mesma pergunta.
          _fotoEscolhida = null;
          _uploadDaFoto = null;
        }
      });
      // **So depois de o servidor responder.** Dizer antes seria afirmar que
      // aconteceu o que pode nao ter acontecido.
      anunciar(context, _TextosDosDados.salvo);
    } on FalhaDeConexao {
      if (!mounted) return;
      setState(
        () => _faixa = const MensagemDeErro(
          texto: MensagensDeErro.semConexaoImpossivel,
        ),
      );
    } on FalhaDeChamada catch (falha) {
      if (!mounted) return;
      setState(() => _faixa = _mensagem(falha));
    } on Object catch (erro, pilha) {
      registrarFalhaInesperada(erro, pilha, onde: 'ao salvar os meus dados');
      if (!mounted) return;
      setState(
        () => _faixa = const MensagemDeErro(texto: MensagensDeErro.servidorFora),
      );
    } finally {
      if (mounted) setState(() => _salvando = false);
    }
  }

  /// **Decide por `tipo`, nunca por status**, como as outras telas do produto.
  ///
  /// Quando o servidor nomeia os campos, a tela os marca: sem isto uma recusa
  /// de campo viraria faixa generica e a pessoa teria de adivinhar qual campo
  /// o servidor recusou.
  MensagemDeErro _mensagem(FalhaDeChamada falha) {
    if (falha is FalhaDaApi &&
        falha.problem.tipo == ProblemTipo.validacaoFalhou &&
        falha.problem.campos.isNotEmpty) {
      final doServidor = <String, String>{};
      for (final campo in falha.problem.campos) {
        final chave = _CamposDosDados.doServidor(campo.campo);
        if (chave != null) {
          doServidor[chave] =
              campo.mensagem ?? _TextosDosDados.confiraEsteCampo;
        }
      }
      if (doServidor.isNotEmpty) {
        setState(() => _erros
          ..clear()
          ..addAll(doServidor));
        return const MensagemDeErro(texto: _TextosDosDados.confiraOsCampos);
      }
    }
    if (falha is FalhaDaApi &&
        falha.problem.tipo == ProblemTipo.limiteDeTentativas) {
      // O teto e de conta, 60 por hora, e e o numero do contrato. O texto nao
      // repete o `Retry-After`: "tente em alguns minutos" e o que se pode
      // dizer de uma janela de uma hora sem mentir sobre o minuto.
      return const MensagemDeErro(texto: _TextosDosDados.tetoAtingido);
    }
    return MensagensDeErro.de(falha);
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: const BarraDeConta(
        titulo: _TextosDosDados.titulo,
        saida: TipoDeSaida.voltar,
        escape: Rotas.perfil,
      ),
      bottomNavigationBar: _fase == _Fase.formulario
          ? BarraDeAcaoFixa(
              acoes: <Widget>[
                BotaoPrimario(
                  rotulo: _TextosDosDados.salvar,
                  carregando: _salvando,
                  aoTocar: _salvar,
                ),
              ],
            )
          : null,
      body: SafeArea(
        child: switch (_fase) {
          _Fase.carregando => const Center(child: CircularProgressIndicator()),
          _Fase.falhaNaLeitura => Padding(
              padding: const EdgeInsets.all(BichuEspaco.e4),
              child: FaixaDeAviso(
                texto: _textoDaFalha ?? MensagensDeErro.servidorFora,
                rotuloDaAcao: _TextosDosDados.atualizar,
                aoTocarNaAcao: _carregar,
              ),
            ),
          _Fase.formulario => _formulario(),
        },
      ),
    );
  }

  Widget _formulario() {
    final textos = Theme.of(context).textTheme;
    final cores = BichuColors.of(context).cores;
    final lido = _lido!;

    // O GRUPO DE PREENCHIMENTO AUTOMATICO, e ele nao e decoracao.
    //
    // **Medido no canal em 20/10/2026**: com as dicas e SEM este grupo, o
    // `TextInput.setClient` sai com `autofill.hints` do campo focado e com
    // `fields: null` -- o sistema sabe o que aquele campo e, e nao sabe que os
    // outros existem. Com o grupo, `fields` sai preenchido, que e o que deixa
    // uma sugestao preencher endereco, bairro e cidade de uma vez em vez de um
    // campo por toque.
    return AutofillGroup(
      child: SingleChildScrollView(
      padding: const EdgeInsets.all(BichuEspaco.e4),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: <Widget>[
          _grupo(_TextosDosDados.quemVoceE, textos),
          // A FOTO DA PROPRIA PESSOA, com o selo de validado em cima
          // (cliente, 18/10/2026). Primeira do grupo porque e o retrato: ela
          // vem antes do nome como vem num documento.
          _BlocoDaFoto(
            fotoDoServidor: lido.fotoUrl,
            processando: lido.fotoProcessando,
            recusada: lido.fotoRecusada,
            motivoDaRecusa: lido.motivoDaRecusaDaFoto,
            escolhida: _fotoEscolhida,
            validado: lido.usuario.canalConfirmado,
            permissao: _permissaoDaCamera,
            enviando: _enviandoAFoto,
            aoTirar: _tirarAFoto,
            aoEscolher: _escolherDaGaleria,
            aoAbrirAjustes: _abrirOsAjustes,
          ),
          const SizedBox(height: BichuEspaco.e6),
          _campo(
            chave: _CamposDosDados.nome,
            autofill: const <String>[AutofillHints.name],
            acaoDeTeclado: TextInputAction.next,
            rotulo: _TextosDosDados.nome,
            controlador: _nome,
            limite: 80,
            // Nome de PESSOA: `name` e a variante de teclado de nome do
            // sistema. A sugestao do iOS em si vem de `autofillHints`, que
            // este campo nao declara.
            tipoDeTeclado: TextInputType.name,
            capitalizacao: TextCapitalization.words,
          ),
          // O APELIDO (`@`), nesta tela desde 18/10/2026 (cliente: *"vai estar
          // no cadastro do usuario e na pagina de edicao do perfil"*).
          //
          // **Sem `ajuda`**: a faixa esta na recusa, e as tres sugestoes vem
          // com ela. O cliente mandou remover textos de apoio em 18/10.
          //
          // **Filtro e nao mascara**: o apelido nao tem separador a inserir.
          // Ele passa maiuscula para minuscula e descarta o que nao e aceito
          // enquanto se digita, e nao valida nada.
          _campo(
            chave: _CamposDosDados.apelido,
            acaoDeTeclado: TextInputAction.next,
            rotulo: _TextosDosDados.apelido,
            controlador: _apelido,
            limite: maximoDoApelido,
            exemplo: 'maria-silva',
            formatadores: const <TextInputFormatter>[FiltroDeApelido()],
          ),
          // O E-MAIL, DE LEITURA. Ver o cabecalho desta classe.
          _EmailDeLeitura(
            email: lido.usuario.email,
            verificado: lido.usuario.emailVerificado,
            pendente: lido.usuario.emailPendente,
          ),
          const SizedBox(height: BichuEspaco.e4),
          _campo(
            chave: _CamposDosDados.telefone,
            autofill: const <String>[AutofillHints.telephoneNumber],
            acaoDeTeclado: TextInputAction.next,
            rotulo: _TextosDosDados.telefone,
            controlador: _telefone,
            limite: limiteDoTelefone,
            tipoDeTeclado: TextInputType.phone,
            exemplo: _TextosDosDados.exemploDoTelefone,
            // Mostra formatado; `telefoneEmE164` e quem envia.
            formatadores: const <TextInputFormatter>[MascaraDeTelefone()],
          ),
          if (lido.telefoneVerificado) ...<Widget>[
            Text(
              _TextosDosDados.telefoneConfirmado,
              style: textos.bodySmall?.copyWith(color: cores.textSecondary),
            ),
            const SizedBox(height: BichuEspaco.e4),
          ],
          _grupo(_TextosDosDados.suaRegiao, textos),
          _campo(
            chave: _CamposDosDados.cep,
            autofill: const <String>[AutofillHints.postalCode],
            acaoDeTeclado: TextInputAction.next,
            rotulo: _TextosDosDados.cep,
            controlador: _cep,
            limite: limiteDoCep,
            tipoDeTeclado: TextInputType.number,
            // **A mascara, e nao `digitsOnly`** (cliente, 18/10). `limite` e 9
            // porque o `maxLength` do campo conta o hifen.
            //
            // **O que VAI para a API nao muda**: `_soDigitos(_cep.text)` tira
            // o hifen antes de montar o corpo, e `MeUpdate.reference_area.
            // postal_code` aceita `^\d{5}-?\d{3}$` -- com hifen opcional.
            // Continuamos mandando SEM, para as quatro telas guardarem uma
            // forma canonica so.
            formatadores: const <TextInputFormatter>[
              MascaraDeCep(),
            ],
            // No oitavo digito a busca sai sozinha, sem botao `Buscar`: um
            // botao a mais e um passo a mais, e nao buscar e desfecho valido.
            aoMudarTambem: (_) => _buscarOCep(),
          ),
          if (_buscandoOCep || _buscaDoCep != null) ...<Widget>[
            _linhaDaBusca(textos),
            const SizedBox(height: BichuEspaco.e4),
          ],
          _campo(
            chave: _CamposDosDados.bairro,
            autofill: const <String>[AutofillHints.sublocality],
            acaoDeTeclado: TextInputAction.next,
            rotulo: _TextosDosDados.bairro,
            controlador: _bairro,
            limite: 80,
            capitalizacao: TextCapitalization.words,
          ),
          // CIDADE E O ULTIMO CAMPO DE TEXTO DESTA TELA, e por isso e o unico
          // com `done`. Sao SEIS os campos que abrem teclado -- nome, apelido,
          // telefone, CEP, bairro e cidade --, nesta ordem; o e-mail e
          // [_EmailDeLeitura], que e texto e nao campo, e o estado e
          // [SeletorDeLista], que abre uma lista e nao o teclado. Depois de
          // cidade nao ha nada para onde `next` avancar, e `done` e o "icone
          // de certo" que o cliente pediu: ele fecha o teclado e devolve a
          // tela, com o `Salvar` ja visivel.
          _campo(
            chave: _CamposDosDados.cidade,
            autofill: const <String>[AutofillHints.addressCity],
            acaoDeTeclado: TextInputAction.done,
            rotulo: _TextosDosDados.cidade,
            controlador: _cidade,
            limite: 80,
            capitalizacao: TextCapitalization.words,
          ),
          // Os 27, mostrando o nome e enviando a sigla. A lista vem de
          // `estados_brasileiros.dart`; esta tela nao escreve a segunda.
          SeletorDeLista(
            rotulo: _TextosDosDados.estado,
            itens: estadosBrasileiros,
            selecionado: _uf,
            erro: _erros[_CamposDosDados.uf],
            habilitado: !_salvando,
            aoSelecionar: (escolhido) => setState(() {
              _uf = escolhido;
              _erros.remove(_CamposDosDados.uf);
            }),
          ),
          if (_confirmacao != null) ...<Widget>[
            const SizedBox(height: BichuEspaco.e6),
            // VISIVEL, e nao so anunciada: um `Salvar` que nao muda nada na
            // tela e o botao que parece nao funcionar, e o dedo volta nele.
            FaixaDeAviso(
              peso: PesoDaFaixa.informativo,
              texto: _confirmacao!,
            ),
          ],
          if (_faixa != null) ...<Widget>[
            const SizedBox(height: BichuEspaco.e6),
            FaixaDeAviso(
              texto: _faixa!.texto,
              rotuloDaAcao: _faixa!.acao,
              aoTocarNaAcao: saidaDaMensagem(context, _faixa!),
            ),
          ],
          // A PORTA DA VITRINE DE FOTOS SAIU DAQUI (26/10/2026).
          //
          // Ela nasceu aqui na uniao de 18/10/2026, porque a tela da vitrine
          // tinha sido construida sem porta nenhuma e a prosa de entao dizia
          // que acrescentar linha ao menu de `Perfil` era *"decisao dele, nao
          // fiacao"*. **A decisao chegou.** Cliente, 26/10/2026: *"traga o
          // menu minhas fotos para o menu principal"*; e, perguntado qual
          // menu, *"primeiro nivel do perfil"*.
          //
          // Entao a linha mora agora em `telas/abas.dart`, no grupo `Conta` do
          // menu do `Perfil`, logo depois de `Meus dados`. A razao antiga --
          // as fotos que a pessoa mostra de si sao dado dela -- nao foi
          // derrubada; ela so deixou de decidir o NIVEL, que era o que o
          // cliente ainda nao tinha dito.
          //
          // **E ela nao fica nos dois lugares.** "Trazer para" com a porta
          // velha de pe seriam duas portas para a mesma tela, que e o que a
          // prosa de `Meus pets` em `gaveta_de_secoes.dart` proibe com estas
          // palavras. O endereco (`Rotas.minhaVitrine`) nao mudou, de
          // proposito: quem tem o link continua chegando.
          const SizedBox(height: BichuEspaco.e6),
          // ------------------------------------------------------------------
          // NA UNIAO DE 27/10: o lado do #75 trazia AQUI de volta o
          // `ItemDeMenu` de `Minhas fotos`. Ele NAO entrou.
          // ------------------------------------------------------------------
          //
          // Nao e entrega do #75 -- medido: o diff dele neste arquivo nao toca
          // `minhaVitrine`; o lado dele so e mais velho (nasceu de `90dfaee7`).
          // `Minhas fotos` subiu para o primeiro nivel do menu do `Perfil` por
          // decisao do cliente de 26/10/2026 e JA ESTA la (`telas/abas.dart`).
          // Reintroduzir a linha aqui duplicaria a porta e reverteria aquela
          // decisao com codigo velho em vez de com uma decisao.
          // ------------------------------------------------------------------
          // `Endereco de entrega` SAIU DESTA TELA EM 27/10/2026, e nao foi
          // apagado: ele MUDOU DE LUGAR.
          // ------------------------------------------------------------------
          //
          // O item existia aqui desde 21/10/2026, quando o cliente decidiu *"um
          // endereco de entrega salvo na conta, reusado em todo pedido e
          // editavel num lugar so"*. Em **27/10/2026** ele pediu *"o endereco de
          // entrega da plaquinha tem que estar dentro do cadastro do pet"* e,
          // com aquela frase posta na mesa, nomeada e datada, decidiu
          // **"endereco um por pet"**. A de 21/10 caiu.
          //
          // Entao o item foi para `Editar pet`
          // (`Rotas.enderecoDeEntregaDoPet`), que e literalmente onde ele pediu
          // que o endereco estivesse. A tela e a MESMA
          // (`TelaEnderecoDeEntrega`): ela mudou de alvo, nao de formulario.
          //
          // **Por que o item nao ficou aqui tambem.** Um atalho nesta tela para
          // um endereco que NENHUM pedido le e uma linha que mente: a pessoa
          // trocaria de casa aqui, a plaquinha chegaria na casa antiga, e nada
          // teria dado erro. E um atalho que perguntasse "qual pet?" seria um
          // seletor de pet dentro de `Meus dados`, que e a tela dos dados da
          // PESSOA -- pet nao e dado da pessoa, e o cadastro dele tem tela
          // propria.
          //
          // **Nada foi apagado** (decisao dele de 26/10/2026, *"nao apague
          // nada"*): `MeApi.lerEnderecoGuardado`/`salvarEnderecoGuardado` e as
          // rotas `/v1/me/delivery-address` continuam de pe, com o endereco que
          // as pessoas ja guardaram -- e foi dele que a migracao
          // `20261027000001` copiou para os pets de cada tutor. O que a conta
          // perdeu foi o PAPEL, nao os dados.
          // ------------------------------------------------------------------
          // O CONVITE ENTROU AQUI EM 28/10/2026, e e O ULTIMO BLOCO DA PAGINA.
          // ------------------------------------------------------------------
          //
          // Decisao do cliente: a tela `Convide tutores` morre e o QR vem para
          // dentro de `Meus dados`. O placar `invited_joined_count` veio junto,
          // por decisao dele do mesmo dia.
          //
          // **POR ULTIMO, e isso e o primeiro dos tres eixos do desenho**:
          // quem veio trocar o telefone nunca passa pelo QR. `Salvar` mora na
          // `BarraDeAcaoFixa` (a barra de baixo, que nao rola), entao o fim da
          // pagina rolante e aqui -- que e "depois de `Salvar`" na ordem de
          // leitura da pessoa.
          //
          // **O `grupo` nao embrulha este bloco**, ao contrario dos de cima: o
          // convite nao e um dado da pessoa, e por-lo dentro de
          // `Quem você é` diria que e. A secao traz o proprio nome na linha
          // que a abre.
          // ------------------------------------------------------------------
          // O LOGIN POR DIGITAL (BICHUS-301, 28/10/2026)
          // ------------------------------------------------------------------
          //
          // **ANTES do bloco do convite, e a ordem e escolhida.** Esta secao e
          // um ajuste da PROPRIA CONTA -- como entrar nela --, e o convite e
          // sobre outras pessoas. O grupo `Conta` do menu do `Perfil` faz a
          // mesma separacao, e pela mesma razao.
          //
          // E ela nao e recolhivel, ao contrario do QR: o conteudo dela e uma
          // frase e, no maximo, um botao de 48 dp -- nao ha 200 dp de quadrado
          // para esconder, e uma gaveta fechada esconderia justamente a funcao
          // que a pessoa nao sabia que existia.
          const SizedBox(height: BichuEspaco.e6),
          const _BlocoDoPasskey(),
          const SizedBox(height: BichuEspaco.e6),
          _BlocoDoConvite(
            conexoes: Escopo.of(context).conexoes,
            convites: Escopo.of(context).convites,
          ),
        ],
      ),
      ),
    );
  }

  Widget _grupo(String texto, TextTheme textos) {
    return Padding(
      padding: const EdgeInsets.only(bottom: BichuEspaco.e4),
      child: Semantics(
        header: true,
        child: Text(texto, style: textos.titleMedium),
      ),
    );
  }

  /// Um campo, com o espacamento e o erro no mesmo lugar.
  ///
  /// Existe para os seis campos nao serem seis repeticoes do mesmo bloco:
  /// repeticao e onde um `erro:` fica para tras e um campo passa a recusar
  /// calado.
  ///
  /// **[acaoDeTeclado] e OBRIGATORIO, e e de proposito.** Ele decide a tecla
  /// de desfecho do teclado do sistema -- `next` avanca para o proximo campo,
  /// `done` fecha o teclado --, e e o pedido do cliente de 20/10/2026: *"em
  /// alguns outros aplicativos, vem um icone de certo nativo no proprio
  /// teclado, que permite com que o usuario feche o teclado nativo do
  /// celular"*. Obrigatorio porque o parametro opcional com padrao poe a
  /// decisao em quem **nao** esta olhando: um setimo campo acrescentado depois
  /// de [_CamposDosDados.cidade] herdaria o `next` em silencio e o `done`
  /// ficaria no meio do formulario, com a pessoa sem como avancar. Exigido, o
  /// compilador pergunta.
  Widget _campo({
    required String chave,
    required String rotulo,
    required TextEditingController controlador,
    required int limite,
    required TextInputAction acaoDeTeclado,
    /// As dicas de preenchimento do SISTEMA (iOS e Android).
    ///
    /// **E `autofillHints` que liga a sugestao, e NAO `tipoDeTeclado`.** O
    /// tipo escolhe qual teclado abre; a sugestao de dado salvo vem daqui.
    /// Medido no canal (`TextInput.setClient`): com as dicas, o argumento
    /// `autofill.hints` sai preenchido; sem elas, nao sai.
    ///
    /// Mesmo padrao de `conta/tela_entrar.dart` e `conta/tela_criar_conta.
    /// dart`, que ja declaravam e-mail, senha, nome e data.
    List<String> autofill = const <String>[],
    String? ajuda,
    String? exemplo,
    TextInputType? tipoDeTeclado,
    TextCapitalization capitalizacao = TextCapitalization.none,
    List<TextInputFormatter>? formatadores,
    ValueChanged<String>? aoMudarTambem,
  }) {
    return Padding(
      padding: const EdgeInsets.only(bottom: BichuEspaco.e4),
      child: BichuField(
        rotulo: rotulo,
        controlador: controlador,
        autofill: autofill,
        limite: limite,
        ajuda: ajuda,
        erro: _erros[chave],
        habilitado: !_salvando,
        exemplo: exemplo,
        tipoDeTeclado: tipoDeTeclado,
        capitalizacao: capitalizacao,
        formatadores: formatadores,
        // A tecla de desfecho do teclado do sistema. Com `done`, quem fecha o
        // teclado e o proprio `EditableText`: sem `onEditingComplete` ele
        // chama `focusNode.unfocus()` para `done`, e sem foco o teclado desce.
        // Nao ha codigo nosso no caminho, e por isso nao ha o que esquecer de
        // chamar.
        acaoDeTeclado: acaoDeTeclado,
        // Digitar e a correcao: o erro sai do campo no primeiro toque, e nao
        // so quando a pessoa tenta salvar de novo.
        aoMudar: (valor) {
          if (_erros.containsKey(chave) || _confirmacao != null) {
            setState(() {
              _erros.remove(chave);
              _confirmacao = null;
            });
          }
          aoMudarTambem?.call(valor);
        },
      ),
    );
  }

  /// A linha que conta o que a busca de CEP fez, e **so isso**: ela nao marca
  /// campo, nao desabilita nada e nao impede o salvar.
  Widget _linhaDaBusca(TextTheme textos) {
    if (_buscandoOCep) {
      return Text(_TextosDosDados.buscandoOCep, style: textos.bodySmall);
    }
    final texto = switch (_buscaDoCep) {
      ResultadoDaBusca.naoEncontrado => _TextosDosDados.cepNaoEncontrado,
      ResultadoDaBusca.indisponivel => _TextosDosDados.buscaIndisponivel,
      _ => null,
    };
    if (texto == null) return const SizedBox.shrink();
    return Text(texto, style: textos.bodySmall);
  }
}

/// A foto da propria pessoa: o retrato, o selo em cima dele, e as acoes.
///
/// ## O custo em memoria, medido
///
/// O retrato e um quadrado de [BichuMoldura.larguraFotoLg] dp -- 160, o
/// tamanho que a tabela 5.4 do design system publica para foto de perfil. A
/// derivada do contrato e `card` 512 x 512; a 3x a tela pede 480 px, que cabe
/// nos 512 **sem ampliar**, e a imagem decodificada custa `480 x 480 x 4` =
/// **900 KiB**. Sem `cacheWidth` seriam os 512 do arquivo, 1,0 MiB, em
/// qualquer aparelho -- e a 2x o mesmo codigo cobra 400 KiB.
///
/// A previa local custa mais que isso, e por um motivo que nao e defeito: o
/// arquivo da camera nao e quadrado, entao `PreviaDaFoto` decodifica 480 px de
/// largura pela altura que a proporcao da camera impoe -- uns 640 px em 4:3,
/// ou **1,17 MiB**. Os dois nunca sao desenhados juntos (a previa SUBSTITUI o
/// retrato enquanto ela existe), mas os dois podem estar no cache de imagem ao
/// mesmo tempo: **2,07 MiB no pior caso desta tela**, e 900 KiB no caso comum.
///
/// ## Os tres estados de ausencia, e todos sao normais
///
/// - **Sem foto**: o quadrado desenha o simbolo de pessoa sobre o fundo
///   afundado. Nao e erro, nao tem frase e nao tem botao desabilitado -- e o
///   lugar da foto, dizendo que cabe uma foto ali.
/// - **Processando**: `Me.photo.status` e `processing` e `url` e nula. O mesmo
///   quadrado, com OUTRO simbolo -- **nao** um erro, porque aqui HAVERA foto,
///   e dentro de instantes. Simbolo e nao frase: o cliente mandou tirar texto
///   de apoio do app hoje. E simbolo PARADO e nao indicador girando:
///   `CircularProgressIndicator` nunca assenta, e um quadro que nunca assenta
///   estoura `pumpAndSettle` em todo caso de teste desta tela -- medido. Quem
///   nao ve a tela recebe o rotulo.
/// - **Recusada nos bytes** (`status: rejected`): `url` nula tambem, e o
///   quadrado volta ao simbolo de pessoa -- mas **o motivo do servidor aparece
///   embaixo dos botoes**, desde 19/10/2026. Quem recusou foi o worker, sobre
///   os bytes reais, e `Me.photo.rejection_reason` chega pronto e em portugues
///   (medido: *"Nao conseguimos ler essa imagem. Ela pode ter chegado
///   incompleta."*). Ate aqui a tela tratava recusada IGUAL a sem foto, e a
///   pessoa via a previa bonita e depois um quadrado vazio sem uma palavra --
///   o estado que mais parece defeito do app estando o app correto.
///
/// Os QUATRO estados sao esses: nulo, `processing`, `ready` e `rejected`.
/// Nenhum deles e erro de rede, e nenhum deles e tratado como erro.
class _BlocoDaFoto extends StatelessWidget {
  const _BlocoDaFoto({
    required this.fotoDoServidor,
    required this.processando,
    required this.recusada,
    required this.motivoDaRecusa,
    required this.escolhida,
    required this.validado,
    required this.permissao,
    required this.enviando,
    required this.aoTirar,
    required this.aoEscolher,
    required this.aoAbrirAjustes,
  });

  final String? fotoDoServidor;
  final bool processando;

  /// `Me.photo.status == 'rejected'`. Ver o quarto item da prosa desta classe.
  final bool recusada;

  /// `Me.photo.rejection_reason`, **o texto do servidor**.
  final String? motivoDaRecusa;

  final FotoLocal? escolhida;

  /// `Me.contact_channel_verified`. **O selo e isto, e nada mais**: nao vem da
  /// imagem, nao e escolhido pelo app e nao e gravado no JPEG.
  ///
  /// **Era `Me.email_verified` ate 21/10/2026**, e a troca e a decisao do
  /// cliente daquele dia: *"Unificar agora, nas duas -- a mesma regua (e-mail
  /// OU telefone) nos dois lugares, antes de telefone existir."* Com
  /// `email_verified` aqui o dono via uma regua (so e-mail) e os outros viam
  /// outra (e-mail OU telefone) -- iguais hoje so porque nada grava
  /// `phone_verified_at`.
  final bool validado;

  final EstadoDaPermissao permissao;

  /// Os bytes da foto escolhida estao subindo **agora**, no toque do seletor.
  final bool enviando;

  final VoidCallback aoTirar;
  final VoidCallback aoEscolher;
  final VoidCallback aoAbrirAjustes;

  /// O lado do quadrado. Ver a prosa desta classe.
  static const double lado = BichuMoldura.larguraFotoLg;

  @override
  Widget build(BuildContext context) {
    final cores = BichuColors.of(context).cores;
    final textos = Theme.of(context).textTheme;
    final local = escolhida;
    final remota = fotoDoServidor;
    // O selo so existe **sobre uma foto**: ele e o selo DA foto, e um escudo
    // flutuando sobre um quadrado vazio nao se apoia em nada.
    final temImagem = local != null || remota != null;

    return Column(
      crossAxisAlignment: CrossAxisAlignment.stretch,
      children: <Widget>[
        Align(
          alignment: Alignment.centerLeft,
          child: SizedBox(
            width: lado,
            height: lado,
            child: Stack(
              children: <Widget>[
                Positioned.fill(child: _retrato(local, remota, cores)),
                if (validado && temImagem)
                  Positioned(
                    right: BichuEspaco.e1,
                    bottom: BichuEspaco.e1,
                    child: _SeloDeValidado(),
                  ),
              ],
            ),
          ),
        ),
        const SizedBox(height: BichuEspaco.e3),
        // A ORIENTACAO DE 5 MB, uma linha. O cliente pediu expressamente que
        // esta informacao aparecesse (17/10/2026), e o numero vem de
        // `orientacaoDeTamanhoDaImagem` -- o mesmo ponto unico das outras duas
        // telas de foto. Ele vale no SERVIDOR, dentro da politica assinada; a
        // tela diz o numero e nao e a regra.
        Text(
          orientacaoDeTamanhoDaImagem,
          style: textos.bodySmall?.copyWith(color: cores.textSecondary),
        ),
        const SizedBox(height: BichuEspaco.e3),
        if (permissao == EstadoDaPermissao.negadaPermanentemente) ...<Widget>[
          FaixaDeAviso(
            peso: PesoDaFaixa.informativo,
            texto: _TextosDosDados.cameraNosAjustes,
            rotuloDaAcao: _TextosDosDados.abrirAjustes,
            aoTocarNaAcao: aoAbrirAjustes,
          ),
          const SizedBox(height: BichuEspaco.e3),
        ],
        // **Sem camera o botao SOME**, e o oposto do caso acima e deliberado:
        // ali ha o que liberar e o botao ensina isso; aqui nao ha, e um botao
        // que nao leva a nada e pior que a ausencia dele. A galeria continua,
        // e ela nao tem estado de permissao proprio (ver `CameraDoAparelho`).
        if (permissao != EstadoDaPermissao.indisponivel) ...<Widget>[
          BotaoSecundario(
            rotulo: _TextosDosDados.tirarFoto,
            aoTocar: enviando ? null : aoTirar,
          ),
          const SizedBox(height: BichuEspaco.e2),
        ],
        OutlinedButton(
          onPressed: enviando ? null : aoEscolher,
          style: OutlinedButton.styleFrom(
            minimumSize: const Size.fromHeight(BichuAlvoDeToque.min),
          ),
          child: const Text(_TextosDosDados.escolherDaGaleria),
        ),
        // **NAO HA `Salvar a foto` AQUI, E A AUSENCIA E O PEDIDO DO CLIENTE**
        // (19/10/2026). Ele existia e era o segundo botao de salvar desta
        // tela: a pessoa escolhia a foto, tocava no `Salvar` da barra -- o que
        // ela chama de salvar o perfil -- e a tela respondia "Nada mudou desde
        // a ultima vez" sem subir byte nenhum. Medido antes da mudanca: zero
        // intencoes, zero requisicoes ao armazenamento, zero `PATCH /v1/me`.
        //
        // Agora o envio sai na ESCOLHA e a confirmacao sai no `Salvar` da
        // barra, que e o unico botao de salvar da tela.
        if (recusada && (motivoDaRecusa ?? '').isNotEmpty) ...<Widget>[
          const SizedBox(height: BichuEspaco.e3),
          // **O MOTIVO DO SERVIDOR, e nao um texto nosso.**
          // `Me.photo.rejection_reason` chega em portugues e explicado --
          // medido contra a homologacao: "Nao conseguimos ler essa imagem. Ela
          // pode ter chegado incompleta.". Um generico aqui jogaria fora a
          // unica frase que diz a pessoa o que aconteceu com o arquivo dela.
          FaixaDeAviso(texto: motivoDaRecusa!),
        ],
      ],
    );
  }

  /// O que desenhar no quadrado, na ordem de precedencia que a pessoa espera.
  ///
  /// A escolhida ganha da remota: quem acabou de pegar um arquivo quer ver o
  /// arquivo que pegou, e nao a foto antiga.
  Widget _retrato(FotoLocal? local, String? remota, BichuCores cores) {
    if (local != null) {
      // `PreviaDaFoto` porque desenhar arquivo do aparelho pede `dart:io`, que
      // o portao de diretivas proibe dentro de `lib/telas` -- com razao: foi
      // assim que uma tela imprimiu o caminho do arquivo em vez da imagem.
      return PreviaDaFoto(
        foto: local,
        descricao: _TextosDosDados.aFotoEscolhida,
        altura: lado,
      );
    }
    if (remota != null) {
      return ImagemDaRede(
        url: remota,
        descricao: _TextosDosDados.aSuaFoto,
        largura: lado,
        raio: BichuRaio.lg,
        simboloDeFalha: Icons.person_outline,
      );
    }
    return _QuadradoSemFoto(cores: cores, processando: processando);
  }
}

/// O lugar da foto quando nao ha foto -- **nos tres casos de ausencia**.
///
/// Fundo afundado, borda de cabelo e o simbolo de pessoa: o mesmo desenho que
/// a foto ocuparia, dizendo que cabe uma foto ali. **Sem frase**: o cliente
/// mandou tirar texto de apoio do app, e os dois botoes logo abaixo ja dizem o
/// que fazer.
class _QuadradoSemFoto extends StatelessWidget {
  const _QuadradoSemFoto({required this.cores, required this.processando});

  final BichuCores cores;

  /// `Me.photo.status == 'processing'`: a foto JA subiu e a derivada ainda nao
  /// existe. Troca o simbolo -- e a diferenca entre "cabe uma foto aqui" e "a
  /// sua foto esta chegando", dita sem uma linha de texto nova.
  final bool processando;

  @override
  Widget build(BuildContext context) {
    return Container(
      alignment: Alignment.center,
      decoration: BoxDecoration(
        color: cores.surfaceSunken,
        borderRadius: BorderRadius.circular(BichuRaio.lg),
        border: Border.all(color: cores.outline, width: BichuBorda.hairline),
      ),
      // **Simbolo PARADO, e nao um indicador girando**, e a razao e medida:
      // `CircularProgressIndicator` nunca para de animar, e um quadro que
      // nunca assenta faz `pumpAndSettle` estourar por tempo em todo caso de
      // teste desta tela -- medido nesta rodada. Um simbolo diferente ja
      // separa "cabe uma foto aqui" de "a sua foto esta chegando", e custa
      // zero quadro.
      child: Semantics(
        label: processando ? _TextosDosDados.processandoAFoto : null,
        child: Icon(
          processando ? Icons.hourglass_top : Icons.person_outline,
          size: BichuEspaco.e10,
          color: cores.textMuted,
        ),
      ),
    );
  }
}

/// O selo de validado do DONO, **sobre** a foto.
///
/// `Me.contact_channel_verified` e a unica fonte. O anel de cor de superficie
/// existe porque o selo pousa em cima de uma imagem de conteudo desconhecido:
/// sem ele um escudo verde sobre um fundo verde desaparece.
///
/// **Com rotulo**, e nao decorativo: a validacao e informacao que nao esta
/// escrita em nenhum outro lugar desta tela, e um icone sem rotulo e um dado
/// que quem usa leitor de tela nao recebe.
///
/// ## O ROTULO E O DE [SeloDeValidado], E NAO UM PROPRIO
///
/// Ele dizia **"Conta validada"** ate 21/10/2026, e prometia mais do que o dado
/// entrega -- pelo mesmo motivo que travou o rotulo do selo que os OUTROS veem:
/// *"nao estamos validando documentos de faco, apenas e-mail por enquanto"*
/// (cliente, 21/10/2026). "Validada" nao diz O QUE foi validado, e quem usa
/// leitor de tela recebe SO o rotulo.
///
/// Agora ele e `SeloDeValidado.rotulo`, a MESMA constante do selo de terceiro.
/// Nao e economia de linha: e a mesma regua com o mesmo nome, e o rotulo
/// proprio desta tela era o segundo lugar onde a redacao podia divergir. A
/// varredura de palavras proibidas de `app/test/widgets/selo_de_validado_test`
/// cobra esta constante, e desde hoje cobra o rotulo DESTA tela pelo mesmo
/// caminho -- ver `app/test/widgets/palavras_proibidas_no_rotulo.dart`.
///
/// **A frase e "Contato confirmado", e ela NAO NOMEIA O MEIO.** Decisao do
/// cliente no mesmo 21/10/2026, e **posterior** a aprovacao de "E-mail
/// confirmado" daquele dia: *"tem que dizer que o usuario esta confirmado,
/// independente do meio"*. A ordem das duas esta escrita no cabecalho de
/// [SeloDeValidado], porque sem ela alguem reverte achando que conserta.
///
/// **E e por isso que o rotulo do selo nao colide com a linha do e-mail desta
/// tela.** [_EmailDeLeitura] diz "E-mail confirmado" e tem de continuar
/// dizendo: ela fala do e-mail, e nomear o canal ali e o conteudo dela. Com o
/// selo dizendo a mesma frase -- e ele disse, por algumas horas --, o leitor de
/// tela anunciava duas vezes e nenhum `find` por rotulo distinguia as duas. O
/// caso `ISCA: o rotulo do selo NAO e a frase da linha do e-mail` prende isso.
///
/// **O desenho continua diferente de [SeloDeValidado]** (anel, 24 dp, sobre a
/// foto), e a diferenca esta escrita no cabecalho daquela classe: aqui o selo
/// pousa sobre uma imagem, la ao lado de um nome.
class _SeloDeValidado extends StatelessWidget {
  @override
  Widget build(BuildContext context) {
    final cores = BichuColors.of(context).cores;
    return Semantics(
      label: SeloDeValidado.rotulo,
      child: Container(
        padding: const EdgeInsets.all(BichuEspaco.e1),
        decoration: BoxDecoration(
          color: cores.surface,
          shape: BoxShape.circle,
        ),
        child: Icon(
          Icons.verified,
          size: BichuEspaco.e6,
          color: cores.success,
        ),
      ),
    );
  }
}

/// O e-mail da conta, de leitura, com a situacao de confirmacao.
///
/// **Nao e um `BichuField` desabilitado**, e a diferenca importa: campo
/// desabilitado se anuncia como campo que algum dia aceita digitacao, e a
/// pessoa fica tocando nele. Aqui e texto, com o papel de leitura dito, e com
/// a frase que diz por onde a troca acontece -- porque nao acontece pelo app.
class _EmailDeLeitura extends StatelessWidget {
  const _EmailDeLeitura({
    required this.email,
    required this.verificado,
    required this.pendente,
  });

  final String email;
  final bool verificado;
  final String? pendente;

  @override
  Widget build(BuildContext context) {
    final cores = BichuColors.of(context).cores;
    final textos = Theme.of(context).textTheme;
    final troca = pendente;

    return Container(
      width: double.infinity,
      padding: const EdgeInsets.all(BichuEspaco.e4),
      decoration: BoxDecoration(
        color: cores.surfaceSunken,
        borderRadius: BorderRadius.circular(BichuRaio.md),
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: <Widget>[
          Text(
            _TextosDosDados.email,
            style: textos.labelLarge?.copyWith(color: cores.textPrimary),
          ),
          const SizedBox(height: BichuEspaco.e1),
          Text(
            email,
            style: textos.bodyLarge?.copyWith(color: cores.textPrimary),
          ),
          const SizedBox(height: BichuEspaco.e2),
          Text(
            verificado
                ? _TextosDosDados.emailConfirmado
                : _TextosDosDados.emailNaoConfirmado,
            style: textos.bodyMedium?.copyWith(
              color: verificado ? cores.success : cores.error,
            ),
          ),
          if (troca != null && troca.isNotEmpty) ...<Widget>[
            const SizedBox(height: BichuEspaco.e1),
            Text(
              _TextosDosDados.trocaEmCurso(troca),
              style: textos.bodyMedium?.copyWith(color: cores.textSecondary),
            ),
          ],
          const SizedBox(height: BichuEspaco.e2),
          Text(
            _TextosDosDados.aTrocaDoEmail,
            style: textos.bodyMedium?.copyWith(color: cores.textSecondary),
          ),
        ],
      ),
    );
  }
}

/// As chaves de campo, iguais dos dois lados.
///
/// A da esquerda e a do formulario; a da direita e a que o servidor manda em
/// `errors[].field` quando recusa (`reference_area/postal_code`, no formato
/// de ponteiro JSON do contrato).
abstract final class _CamposDosDados {
  static const String nome = 'display_name';
  static const String apelido = 'handle';
  static const String telefone = 'phone_e164';
  static const String cep = 'postal_code';
  static const String bairro = 'neighborhood';
  static const String cidade = 'city';
  static const String uf = 'state';

  static const List<String> todos = <String>[
    nome,
    apelido,
    telefone,
    cep,
    bairro,
    cidade,
    uf,
  ];

  /// A chave do formulario para o que o servidor nomeou, ou nulo quando ele
  /// nomeia um campo que esta tela nao tem.
  ///
  /// Casa pelo ULTIMO segmento: o contrato manda `reference_area/postal_code`
  /// e o formulario chama o campo de `postal_code`.
  static String? doServidor(String campo) {
    final ultimo = campo.split('/').last;
    for (final chave in todos) {
      if (chave == ultimo) return chave;
    }
    return null;
  }
}

/// Os textos da tela, num lugar so.
///
/// **Curtos de proposito**, e sem promessa que ninguem pode cumprir: nao ha
/// prazo de confirmacao de e-mail, nao ha "em breve" e nao ha explicacao de
/// navegacao. Erro diz o que FAZER -- a palavra "invalido" nao aparece em
/// nenhuma linha deste arquivo.
abstract final class _TextosDosDados {
  /// O apoio da porta da vitrine. Diz o que ha do outro lado e para QUEM ela
  /// e visivel -- "so voce" e a unica coisa que a pessoa precisa saber antes
  /// de tocar, e e verdade medida: nao existe rota de vitrine de terceiro.
  // `enderecoDeEntrega` e `apoioDoEndereco` SAIRAM daqui em 27/10/2026, com o
  // item que eles rotulavam -- ver o comentario no lugar onde ele estava. Texto
  // de interface sem tela que o mostre e divida que o proximo nao entende: ele
  // procura a tela, nao acha, e conclui que falta implementar algo.
  //
  // Os rotulos equivalentes do endereco do pet vivem em
  // `telas/pet/tela_editar_pet.dart`, que e de onde a tela e alcancada agora.

  static const String apelido = 'Apelido';

  /// A recusa de quem JA TEM apelido e esvaziou o campo.
  ///
  /// **Nao e falta de caminho: e a regra.** Soltar um apelido de volta ao pool
  /// e o furo do plano 4-C.7 -- quem o pegasse herdaria o que a vizinhanca
  /// associava a quem o tinha. Dizer isso e melhor que ignorar o campo vazio em
  /// silencio, que faria a pessoa achar que apagou.
  static const String apelidoNaoSeApaga =
      'O apelido não pode ser apagado. Você pode trocá-lo por outro.';

  static const String titulo = 'Meus dados';

  static const String quemVoceE = 'Quem é você';
  static const String suaRegiao = 'Sua região de referência';

  static const String nome = 'Nome';
  static const String nomePrecisaDeTexto = 'Digite o nome que você quer usar no Bichu.';

  // -------------------------------------------------------------------------
  // A FOTO DA PROPRIA PESSOA
  //
  // **Nenhum texto de apoio aqui**: sao rotulos de controle, rotulos de leitor
  // de tela e desfechos de acao. A unica linha informativa do bloco e a
  // orientacao de 5 MB, que vem de `orientacaoDeTamanhoDaImagem` (ponto unico,
  // em `dispositivo/camera_e_galeria.dart`) porque o cliente pediu
  // expressamente que o numero aparecesse.
  // -------------------------------------------------------------------------

  static const String tirarFoto = 'Tirar foto';
  static const String escolherDaGaleria = 'Escolher da galeria';

  /// O rotulo do retrato que ja esta na conta, para quem nao ve a imagem.
  static const String aSuaFoto = 'A sua foto';

  /// O rotulo da previa do arquivo que acabou de ser escolhido. Diferente do
  /// de cima de proposito: a pessoa precisa saber qual das duas esta vendo.
  static const String aFotoEscolhida = 'A foto que você escolheu';

  // **NAO HA CONSTANTE DE ROTULO DO SELO AQUI, e a ausencia e a regra.**
  // Ela existia ("Conta validada") e prometia mais do que o dado entrega. O
  // rotulo do selo e `SeloDeValidado.rotulo`, um lugar so para as duas telas
  // -- ver o cabecalho de `_SeloDeValidado`.

  /// O rotulo do simbolo de processamento no lugar da foto. O icone tambem
  /// nao fala.
  static const String processandoAFoto = 'Processando a foto';

  static const String cameraNosAjustes =
      'A câmera está bloqueada para o Bichu. Dá para liberar nos ajustes do '
      'sistema.';
  static const String abrirAjustes = 'Abrir os ajustes';

  /// O desfecho da escolha: os bytes JA subiram, e falta o `Salvar`.
  ///
  /// **Diz o passo que falta**, e nao "foto enviada" seco: o envio dos bytes e
  /// invisivel para quem esta usando o app, e uma frase que anunciasse o fim
  /// faria a pessoa sair da tela achando que gravou -- a intencao nao
  /// confirmada vence em dez minutos.
  static const String fotoProntaParaSalvar =
      'Foto enviada. Toque em Salvar para guardá-la no seu cadastro.';

  /// O `Salvar` chegou antes de os bytes terminarem.
  ///
  /// **Nao grava sem a foto em silencio**: o `upload_id` so existe depois de o
  /// envio terminar, e um PATCH que saisse agora gravaria o resto do cadastro
  /// e deixaria a foto de fora sem ninguem saber.
  static const String fotoAindaSubindo =
      'A foto ainda está subindo. Toque em Salvar de novo em instantes.';

  /// **Sem promessa de fila.** A `RetomadaDeFotos` e do pet; esta foto nao
  /// entra em fila nenhuma, e dizer "ela sai sozinha quando o sinal voltar"
  /// seria afirmar um envio que ninguem vai tentar.
  static const String fotoSemSinal =
      'Sem conexão para enviar a foto. Escolha a foto de novo quando o sinal '
      'voltar.';

  static const String fotoRecusada =
      'O envio da foto foi recusado. Escolha outra foto.';

  // A FOTO TAMBEM E CADASTRO, e a conta sem nome nao atualiza cadastro.
  //
  // Cliente, 18/10/2026: *"nao permitir atualizar o cadastro, se nao tiver
  // algum nome cadastrado"*. `fotoPrecisaDoNome` morava aqui e dizia
  // "Preencha o nome e salve antes de enviar a foto" -- ela existia porque o
  // envio tinha um botao proprio, que confirmava a foto num `PATCH /v1/me`
  // separado e levava a recusa do nome como "tente outra foto".
  //
  // Com a confirmacao dentro do PATCH do formulario (19/10/2026) a frase deixou
  // de ter chamador, e a trava do nome volta a ser a de `_conferir` --
  // `nomePrecisaDeTexto`, no campo do nome, antes de a rede ser usada. Um
  // segundo texto para a mesma regra e o que divergiria na primeira edicao.

  static const String email = 'E-mail';
  static const String emailConfirmado = 'E-mail confirmado';
  static const String emailNaoConfirmado = 'E-mail ainda não confirmado';
  static String trocaEmCurso(String novo) =>
      'Falta confirmar $novo. É para lá que a gente vai avisar.';

  /// A frase que diz por onde a troca acontece, porque ela **nao** acontece
  /// pelo app. Ver o cabecalho de [TelaDadosPessoais].
  static const String aTrocaDoEmail =
      'A troca do e-mail ainda não acontece pelo app. Para trocar, escreva '
      'para oi@bichu.app.';

  static const String telefone = 'Telefone';
  static const String exemploDoTelefone = '(11) 98765-4321';
  static const String telefoneIncompleto =
      'Faltam dígitos. Confira o DDD e o número, como em (11) 98765-4321.';
  static const String telefoneNaoSeApaga =
      'O telefone não pode ser apagado por aqui. Para tirá-lo, escreva para '
      'oi@bichu.app.';
  static const String telefoneConfirmado = 'Telefone confirmado.';

  static const String cep = 'CEP';
  static const String cepTemOitoDigitos = 'O CEP tem 8 dígitos.';
  static const String cepNaoSeApaga =
      'O CEP não pode ser apagado por aqui. Para tirá-lo, escreva para '
      'oi@bichu.app.';
  static const String cepNaoEncontrado =
      'CEP não encontrado. Preencha abaixo.';
  static const String buscandoOCep = 'Buscando o endereço…';
  static const String buscaIndisponivel =
      'Não conseguimos buscar o CEP agora. Preencha abaixo.';

  static const String bairro = 'Bairro';
  static const String cidade = 'Cidade';
  static const String estado = 'Estado';
  static const String escolhaOEstado = 'Escolha o estado.';

  static const String salvar = 'Salvar';
  static const String salvo = 'Dados salvos.';
  static const String nadaMudou = 'Nada mudou desde a última vez.';
  static const String atualizar = 'Atualizar';
  static const String confiraEsteCampo = 'Confira este campo.';
  static const String confiraOsCampos = 'Confira os campos marcados.';
  static const String tetoAtingido =
      'Você salvou muitas vezes seguidas. Tente em alguns minutos.';
}

/// A SECAO DO CONVITE dentro de `Meus dados` -- o QR e o placar, recolhidos.
///
/// Vinda de `conexoes/convide_tutores.dart`, que morreu em 28/10/2026 por
/// decisao do cliente. Ver as constantes em [TelaDadosPessoais] para os tres
/// eixos que fazem o QR nao dominar a pagina.
///
/// ## Por que um `StatefulWidget` proprio, e nao estado da tela
///
/// O formulario de `Meus dados` guarda sete controladores de texto, a fase da
/// leitura e o mapa de erros por campo. Por o convite la dentro misturaria
/// duas historias que nao se tocam: nada no convite entra no `Salvar`, e nada
/// do `Salvar` muda o convite. Separado, a secao tambem **nao reconstroi o
/// formulario** quando abre, fecha ou emite.
///
/// ## RECOLHIDA ao nascer, e o estado NAO e lembrado
///
/// Toda abertura da pagina comeca fechada. Lembrar seria guardar preferencia
/// de gaveta de apoio, e a pessoa que abriu o QR uma vez nao pediu para ele
/// estar aberto na vez em que ela veio trocar o telefone.
class _BlocoDoConvite extends StatefulWidget {
  const _BlocoDoConvite({required this.conexoes, required this.convites});

  final ConexoesApi conexoes;
  final ConvitesApi convites;

  @override
  State<_BlocoDoConvite> createState() => _EstadoDoBlocoDoConvite();
}

class _EstadoDoBlocoDoConvite extends State<_BlocoDoConvite> {
  bool _aberta = false;
  ConviteEmitido? _convite;
  bool _emitindo = false;
  String? _falha;

  /// Quantas pessoas a conta trouxe, ou **nulo quando ninguem contou**.
  ///
  /// Nulo e zero sao coisas diferentes, e a linha depende disso: zero e a
  /// afirmacao do servidor de que ninguem entrou ainda; nulo e a ausencia de
  /// afirmacao, e nesse caso a linha **nao aparece**. Dizer que ninguem entrou
  /// e uma afirmacao, e o servidor nao a fez.
  int? _placar;

  /// **O PLACAR SO E LIDO QUANDO A SECAO ABRE**, e isso e deliberado.
  ///
  /// Na tela morta ele era lido no `initState`, porque a tela inteira era o
  /// convite. Aqui a secao nasce recolhida no pe de uma pagina de dados
  /// pessoais: ler o resumo na abertura de `Meus dados` gastaria uma chamada
  /// de rede em toda visita de quem veio trocar o telefone e nunca vai abrir o
  /// convite.
  Future<void> _lerOPlacar() async {
    try {
      final resumo = await widget.conexoes.resumo();
      if (!mounted) return;
      setState(() => _placar = resumo.invitedJoinedCount);
    } on Object catch (erro) {
      // **`on Object` E NAO `on FalhaDeChamada`, E ISSO FOI MEDIDO** (28/10).
      //
      // A primeira versao desta linha capturava so `FalhaDeChamada`, e
      // `ResumoDeConexoes.doJson` estoura **`TypeError`** quando o corpo nao
      // tem os seis inteiros do contrato -- um 200 fora do contrato, ou o
      // corpo de problema de um 404. O erro subia como erro assincrono sem
      // dono e **derrubava a tela inteira**: quatorze casos de SEIS arquivos
      // que nada tem a ver com conexoes reprovaram por isto
      // (`aviso_de_cadastro`, `quem_negou_tem_saida`,
      // `perdidos_e_meus_achados`, `meus_eventos_e_cancelar`,
      // `permissao_muda_com_o_app_aberto`, `perfil_controles_acima_da_barra`).
      //
      // **Um contador auxiliar nao pode derrubar a pagina que o hospeda.** E o
      // mesmo arranjo que `FiacaoDoPasskey.oferecerCadastro` descreve, e pelo
      // mesmo motivo: o desfecho para a pessoa e identico -- sem pastilha --, e
      // sem o registro ninguem saberia que o contrato quebrou.
      if (!mounted) return;
      if (erro is! FalhaDeChamada) {
        // **SILENCIO DELIBERADO, e nao esquecimento** -- o mesmo arranjo de
        // `FiacaoDoPasskey.reconciliarComAConta`, e pela mesma razao.
        //
        // `registrarFalhaInesperada` chama `FlutterError.reportError`, e a
        // prosa dele diz para que serve: *"erro que nao e `FalhaDeChamada` no
        // meio de uma ACAO DE TELA"* -- uma acao que a pessoa tomou, com um
        // botao girando esperando desfecho. Esta leitura nao e isso: ela
        // acontece sozinha, sem ninguem pedir, e o desfecho dela e a ausencia
        // de uma pastilha. Reportar poria no canal de observabilidade um erro
        // por abertura de tela de quem nunca vai notar nada.
        //
        // MEDIDO, e e o que me fez tirar o registro daqui: com
        // `registrarFalhaInesperada` nesta linha, DEZENOVE casos de SETE
        // arquivos sem relacao nenhuma com conexoes reprovaram -- o
        // `reportError` e falha de teste de widget por definicao, e o servidor
        // falso daqueles casos responde 404 a `/connections/summary`.
      }
      // **SEM FAIXA DE ERRO**: o placar e reconhecimento, e nao o que a
      // pessoa veio buscar aqui -- ela veio pegar o QR. Uma faixa vermelha
      // culparia a secao por uma leitura auxiliar, e o bloco do QR continua
      // inteiro sem ela.
      setState(() => _placar = null);
    }
  }

  void _alternar() {
    final vaiAbrir = !_aberta;
    setState(() => _aberta = vaiAbrir);
    if (vaiAbrir && _placar == null) unawaited(_lerOPlacar());
  }

  Future<void> _emitir() async {
    if (_emitindo) return;
    setState(() {
      _emitindo = true;
      _falha = null;
    });
    try {
      final convite = await widget.convites.emitir();
      if (!mounted) return;
      setState(() {
        _convite = convite;
        _emitindo = false;
      });
    } on FalhaDeChamada catch (falha) {
      if (!mounted) return;
      setState(() {
        _emitindo = false;
        _falha = MensagensDeErro.de(falha).texto;
      });
    }
  }

  @override
  Widget build(BuildContext context) {
    final cores = BichuColors.of(context).cores;

    return Container(
      // TINTA: chao afundado com borda, e nao cartao elevado -- ver as
      // constantes de [TelaDadosPessoais].
      decoration: BoxDecoration(
        color: cores.surfaceSunken,
        borderRadius: BorderRadius.circular(BichuRaio.md),
        border: Border.all(color: cores.outline, width: BichuBorda.hairline),
      ),
      padding: const EdgeInsets.all(BichuEspaco.e4),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: <Widget>[
          _cabecalho(cores),
          if (_aberta) ..._conteudo(cores),
        ],
      ),
    );
  }

  /// A LINHA QUE ABRE E FECHA. Uma parada de foco so, anunciada como botao com
  /// o estado -- `expanded` e o que diz a quem usa leitor de tela se o
  /// conteudo esta na tela ou nao.
  Widget _cabecalho(BichuCores cores) {
    final textos = Theme.of(context).textTheme;
    return Semantics(
      button: true,
      expanded: _aberta,
      excludeSemantics: true,
      label: '${TelaDadosPessoais.tituloDoConvite}. '
          '${TelaDadosPessoais.apoioDoConvite}',
      onTap: _alternar,
      child: InkWell(
        onTap: _alternar,
        borderRadius: BorderRadius.circular(BichuRaio.sm),
        child: Container(
          // O piso de 48 dp e o da linha de menu: fechada, a secao e uma
          // linha, e ela tem de ser tao tocavel quanto as outras.
          constraints: const BoxConstraints(minHeight: BichuAlvoDeToque.min),
          child: Row(
            children: <Widget>[
              Expanded(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  mainAxisAlignment: MainAxisAlignment.center,
                  children: <Widget>[
                    Text(
                      TelaDadosPessoais.tituloDoConvite,
                      style: textos.titleMedium?.copyWith(
                        color: cores.textPrimary,
                      ),
                    ),
                    const SizedBox(height: BichuEspaco.e1),
                    Text(
                      TelaDadosPessoais.apoioDoConvite,
                      style: textos.bodyMedium?.copyWith(
                        color: cores.textSecondary,
                      ),
                    ),
                  ],
                ),
              ),
              const SizedBox(width: BichuEspaco.e2),
              Icon(
                _aberta ? Icons.expand_less : Icons.expand_more,
                color: cores.textSecondary,
                // Decorativo: o rotulo composto acima ja e o nome do controle,
                // e `expanded` ja carrega o estado.
                semanticLabel: '',
              ),
            ],
          ),
        ),
      ),
    );
  }

  List<Widget> _conteudo(BichuCores cores) {
    final textos = Theme.of(context).textTheme;
    final convite = _convite;
    final falha = _falha;
    final quantos = _placar;

    return <Widget>[
      const SizedBox(height: BichuEspaco.e4),
      if (falha != null) ...<Widget>[
        FaixaDeAviso(texto: falha),
        const SizedBox(height: BichuEspaco.e4),
      ],
      if (convite != null) ...<Widget>[
        Center(child: QrDoConvite(token: convite.inviteToken)),
        const SizedBox(height: BichuEspaco.e4),
        // **A INSTRUCAO VEM ANTES DO PRAZO**, e a ordem e escolhida: o prazo e
        // sobre o convite, e esta frase e sobre o que a pessoa precisa fazer
        // AGORA para ele funcionar.
        Text(
          TelaDadosPessoais.oQrEDeAppParaApp,
          style: textos.bodyMedium?.copyWith(color: cores.textPrimary),
        ),
        const SizedBox(height: BichuEspaco.e3),
        Text(
          TelaDadosPessoais.valeAte(convite.expiresAt),
          style: textos.bodyMedium?.copyWith(color: cores.textSecondary),
        ),
      ] else
        Text(
          TelaDadosPessoais.semConviteAgora,
          style: textos.bodyMedium?.copyWith(color: cores.textSecondary),
        ),
      // O PLACAR, EM UMA LINHA, DEPOIS DO QUADRADO.
      //
      // **Depois e nao antes**: o que a pessoa veio buscar e o QR, e o placar e
      // reconhecimento. Na tela morta ele vinha primeiro porque era a primeira
      // secao de uma tela dedicada; aqui, numa gaveta de apoio dentro de
      // `Meus dados`, por o numero antes do quadrado poria o reconhecimento na
      // frente da funcao.
      //
      // **Nulo nao vira "ninguem ainda"** -- a linha sai. Ver [_placar].
      if (quantos != null) ...<Widget>[
        const SizedBox(height: BichuEspaco.e4),
        Row(
          children: <Widget>[
            Icon(
              Icons.volunteer_activism_outlined,
              size: 20,
              color: cores.textSecondary,
              semanticLabel: '',
            ),
            const SizedBox(width: BichuEspaco.e2),
            Expanded(
              child: Text(
                TelaDadosPessoais.placarDeQuemEntrou(quantos),
                style: textos.bodyMedium?.copyWith(color: cores.textPrimary),
              ),
            ),
          ],
        ),
      ],
      const SizedBox(height: BichuEspaco.e3),
      Text(
        TelaDadosPessoais.oQrNaoVoltaDepois,
        style: textos.bodySmall?.copyWith(color: cores.textMuted),
      ),
      const SizedBox(height: BichuEspaco.e3),
      BotaoSecundario(
        rotulo: TelaDadosPessoais.criarOConvite,
        carregando: _emitindo,
        aoTocar: () => unawaited(_emitir()),
      ),
      // **NADA DEPOIS DO BOTAO, e a ausencia e o desenho.** `Trocar o meu QR`
      // e `Apagar o meu QR` sairam por pedido do cliente de 22/10/2026
      // (*"nao deve ter a acao de trocar o qr-code dele ou de apagar"*), e
      // `app/test/telas/sem_acao_de_qr_do_usuario_test.dart` e a isca que
      // impede as duas de voltarem. Saiu a PORTA e nao a capacidade:
      // `ConvitesApi.revogar` e `revokeConnectionInvite` continuam intocados.
    ];
  }
}

/// A SECAO DO LOGIN POR DIGITAL dentro de `Meus dados` (BICHUS-301,
/// 28/10/2026).
///
/// Ver as constantes em [TelaDadosPessoais] para o buraco que ela fecha e por
/// que ela existe. **Ela nao inventa fluxo de ativacao nenhum**: chama
/// `FiacaoDoPasskey.oferecerCadastro`, o mesmo do cadastro e o mesmo do convite
/// depois do login.
///
/// ## QUATRO ESTADOS, e o cliente pediu o ESTADO e nao so o botao
///
/// | estado | o que a secao mostra |
/// |---|---|
/// | o aparelho nao suporta | so a frase, e nenhuma acao |
/// | ha credencial NESTE aparelho | `está ativo neste aparelho` |
/// | ha na CONTA, nao aqui | a frase do meio, e nenhuma acao de criar |
/// | nao ha em lugar nenhum | a acao `Ativar` |
///
/// ## A leitura e feita UMA vez, em `didChangeDependencies`
///
/// `Escopo.of` precisa de `context` com a dependencia ligada e **nao funciona
/// no `initState`** -- medido nesta mesma rodada, na linha `Conexões` do menu
/// do `Perfil`: lá o numero ficava nulo e a pastilha nao aparecia, sem erro
/// nenhum na tela.
class _BlocoDoPasskey extends StatefulWidget {
  const _BlocoDoPasskey();

  @override
  State<_BlocoDoPasskey> createState() => _EstadoDoBlocoDoPasskey();
}

/// O que a secao sabe sobre esta conta e este aparelho.
enum _EstadoDoPasskey {
  /// Ainda lendo. **Nada e afirmado**: sem isto a secao piscaria `Ativar` por
  /// um quadro para quem ja tem o login ligado.
  lendo,

  /// O sistema deste aparelho nao faz passkey.
  indisponivel,

  /// Ha credencial neste aparelho.
  ativo,

  /// Ha credencial na conta, mas nao neste aparelho.
  naContaNaoAqui,

  /// Nao ha credencial em lugar nenhum.
  inativo,
}

class _EstadoDoBlocoDoPasskey extends State<_BlocoDoPasskey> {
  _EstadoDoPasskey _estado = _EstadoDoPasskey.lendo;
  bool _ativando = false;
  String? _falha;
  bool _pediu = false;

  @override
  void didChangeDependencies() {
    super.didChangeDependencies();
    if (_pediu) return;
    _pediu = true;
    unawaited(_ler());
  }

  /// Decide qual dos quatro estados vale, na ordem do mais barato ao mais caro.
  ///
  /// **A ordem e a mesma de `FiacaoDoPasskey.deveOferecerCadastro`**, e nao por
  /// acaso: as duas respondem a mesma pergunta com as mesmas quatro leituras. A
  /// diferenca e o que elas devolvem -- aquela um `bool` para decidir se abre a
  /// folha, esta o estado para a secao escrever na tela.
  Future<void> _ler() => _lerOEstado().timeout(
        // O MESMO TETO DA DECISAO DO LOGIN, e pela mesma razao: as leituras
        // daqui passam por CANAL DE PLATAFORMA (o deposito da marca e a
        // pergunta de suporte), e canal que nao responde nao estoura -- ele
        // nao volta. Sem o teto, esta secao ficaria com a roda girando para
        // sempre, que e o estado que mais parece defeito e menos informa.
        FiacaoDoPasskey.tetoDaDecisao,
        onTimeout: () {
          if (!mounted) return;
          // `indisponivel` e nao `inativo`: oferecer `Ativar` depois de um
          // canal que nao respondeu seria prometer sobre um aparelho que nao
          // disse nada.
          setState(() => _estado = _EstadoDoPasskey.indisponivel);
        },
      );

  Future<void> _lerOEstado() async {
    final escopo = Escopo.of(context);
    try {
      if (await escopo.passkeyNesteAparelho.haCredencial()) {
        if (!mounted) return;
        setState(() => _estado = _EstadoDoPasskey.ativo);
        return;
      }
      if (!await escopo.credencialDoAparelho.suportaCredencial()) {
        if (!mounted) return;
        setState(() => _estado = _EstadoDoPasskey.indisponivel);
        return;
      }
      // Pode MARCAR: depois dela, quem tinha credencial na conta passa a ter
      // marca local -- e e isso que destrava a entrada por passkey que a
      // pessoa ja tinha, sem criar uma segunda credencial.
      await escopo.passkey.reconciliarComAConta();
      if (!mounted) return;
      final agoraTem = await escopo.passkeyNesteAparelho.haCredencial();
      if (!mounted) return;
      setState(
        () => _estado = agoraTem
            // A reconciliacao achou credencial na conta e marcou o aparelho.
            // **A frase do MEIO, e nao `está ativo`**: a credencial existe na
            // conta e a marca acabou de ser posta, mas a chave privada ainda
            // nao esta neste aparelho -- quem sincroniza e o sistema, e isso
            // acontece na proxima entrada. Dizer `ativo` aqui prometeria um
            // login que a folha do sistema ainda nao sabe fazer.
            ? _EstadoDoPasskey.naContaNaoAqui
            : _EstadoDoPasskey.inativo,
      );
    } on Object {
      // **SEM FAIXA DE ERRO, e o estado cai no mais conservador.** A secao e
      // ajuste de conta e nao o que a pessoa veio fazer em `Meus dados`; uma
      // faixa vermelha culparia a pagina inteira por uma leitura auxiliar.
      // `indisponivel` e nao `inativo`: oferecer `Ativar` depois de uma falha
      // de leitura seria prometer sobre um aparelho que nao respondeu.
      if (!mounted) return;
      setState(() => _estado = _EstadoDoPasskey.indisponivel);
    }
  }

  /// ATIVA, pelo MESMO caminho do cadastro e do convite do login.
  Future<void> _ativar() async {
    if (_ativando) return;
    setState(() {
      _ativando = true;
      _falha = null;
    });
    // `oferecerCadastro` NAO ESTOURA -- devolve `naoCadastrada` em todo
    // desfecho que nao e sucesso, 409 e 429 inclusive. E por isso que nao ha
    // `try` aqui: um `catch` daria a impressao de que existe um caminho de
    // erro que esta secao trata.
    final desfecho = await Escopo.of(context).passkey.oferecerCadastro();
    if (!mounted) return;
    setState(() {
      _ativando = false;
      if (desfecho == DesfechoDoCadastroDePasskey.cadastrada) {
        _estado = _EstadoDoPasskey.ativo;
      } else {
        // **NAO REGISTRA RECUSA**, e esta e a fronteira que mais custa: quem
        // fechou a folha do sistema disse *"agora nao"*, e so o toque
        // deliberado no `Não quero` do convite do login grava recusa formal.
        // Tratar isto como recusa faria a pessoa perder a funcao por um gesto
        // acidental. Aqui a secao simplesmente continua oferecendo.
        _falha = TelaDadosPessoais.falhaAoAtivarOPasskey;
      }
    });
  }

  @override
  Widget build(BuildContext context) {
    final cores = BichuColors.of(context).cores;
    final textos = Theme.of(context).textTheme;

    return Container(
      // Mesma tinta do bloco do convite, e pelo mesmo motivo: gaveta de apoio
      // afundada, e nao cartao elevado -- o assunto da tela sao os dados.
      decoration: BoxDecoration(
        color: cores.surfaceSunken,
        borderRadius: BorderRadius.circular(BichuRaio.md),
        border: Border.all(color: cores.outline, width: BichuBorda.hairline),
      ),
      padding: const EdgeInsets.all(BichuEspaco.e4),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: <Widget>[
          Text(
            TelaDadosPessoais.tituloDoPasskey,
            style: textos.titleMedium?.copyWith(color: cores.textPrimary),
          ),
          const SizedBox(height: BichuEspaco.e1),
          Text(
            TelaDadosPessoais.apoioDoPasskey,
            style: textos.bodyMedium?.copyWith(color: cores.textSecondary),
          ),
          const SizedBox(height: BichuEspaco.e3),
          ..._conteudo(cores, textos),
        ],
      ),
    );
  }

  List<Widget> _conteudo(BichuCores cores, TextTheme textos) {
    final falha = _falha;
    return <Widget>[
      if (falha != null) ...<Widget>[
        FaixaDeAviso(texto: falha),
        const SizedBox(height: BichuEspaco.e3),
      ],
      switch (_estado) {
        // **A ROSCA, e nao um estado afirmado.** Ver [_EstadoDoPasskey.lendo].
        _EstadoDoPasskey.lendo => const Center(
            child: Padding(
              padding: EdgeInsets.all(BichuEspaco.e3),
              child: CircularProgressIndicator(),
            ),
          ),
        _EstadoDoPasskey.indisponivel => Text(
            TelaDadosPessoais.passkeyIndisponivel,
            style: textos.bodyMedium?.copyWith(color: cores.textSecondary),
          ),
        _EstadoDoPasskey.ativo => Row(
            children: <Widget>[
              Icon(
                Icons.check_circle_outline,
                size: 20,
                color: cores.success,
                // Decorativo: a frase ao lado ja diz o estado, e um glifo com
                // nome proprio seria anuncio duplo.
                semanticLabel: '',
              ),
              const SizedBox(width: BichuEspaco.e2),
              Expanded(
                child: Text(
                  TelaDadosPessoais.passkeyAtivado,
                  style: textos.bodyMedium?.copyWith(color: cores.textPrimary),
                ),
              ),
            ],
          ),
        _EstadoDoPasskey.naContaNaoAqui => Text(
            TelaDadosPessoais.passkeyNaContaNaoNesteAparelho,
            style: textos.bodyMedium?.copyWith(color: cores.textPrimary),
          ),
        _EstadoDoPasskey.inativo => BotaoSecundario(
            rotulo: TelaDadosPessoais.ativarOPasskey,
            carregando: _ativando,
            aoTocar: () => unawaited(_ativar()),
          ),
      },
    ];
  }
}
