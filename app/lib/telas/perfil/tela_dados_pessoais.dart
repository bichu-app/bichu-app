import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:go_router/go_router.dart';

import '../../acessibilidade/anunciar.dart';
import '../../api/busca_de_cep.dart';
import '../../formato/apelido.dart';
import '../../formato/cep.dart';
import '../../api/envio_de_foto.dart';
import '../../api/estados_brasileiros.dart';
import '../../api/falhas.dart';
import '../../api/me_api.dart';
import '../../api/mensagens_de_erro.dart';
import '../../api/problem.dart';
import '../../dispositivo/camera_e_galeria.dart';
import '../../escopo.dart';
import '../../widgets/item_de_menu.dart';
import 'vitrine_de_fotos.dart';
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
import '../../widgets/saida_da_tela.dart';
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
/// le-la de volta. **O selo nao e imagem**: ele e `Me.email_verified`, o mesmo
/// conceito que o resto do produto usa, desenhado em cima da foto. Gravar o
/// selo dentro do JPEG faria a imagem mentir no dia em que a pessoa trocasse
/// de e-mail.
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

  /// A foto que a pessoa acabou de escolher no aparelho, **antes de subir**.
  ///
  /// Existe para a PREVIA: escolher e enviar sao dois momentos, e sem este
  /// campo a tela subiria o arquivo antes de a pessoa ver qual arquivo pegou.
  /// Nulo depois de um envio bem-sucedido -- dali em diante quem manda e a
  /// derivada do servidor, em [DadosPessoais.fotoUrl].
  FotoLocal? _fotoEscolhida;

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
    if (foto != null) _escolheu(foto);
  }

  Future<void> _escolherDaGaleria() async {
    final foto = await Escopo.of(context).camera.escolherDaGaleria();
    if (!mounted) return;
    if (foto != null) _escolheu(foto);
  }

  Future<void> _abrirOsAjustes() =>
      Escopo.of(context).camera.abrirAjustesDoSistema();

  /// A foto escolhida entra na PREVIA, e **nao sobe ainda**.
  ///
  /// Subir no toque do seletor tiraria da pessoa a chance de ver qual arquivo
  /// ela pegou -- que e o defeito que `PreviaDaFoto` nasceu para consertar, em
  /// outra tela, quando ela imprimia o caminho do arquivo.
  void _escolheu(FotoLocal foto) {
    setState(() {
      _fotoEscolhida = foto;
      _faixa = null;
      _confirmacao = null;
    });
  }

  /// Os tres passos: intencao, bytes, e o `PATCH /v1/me` que amarra a foto a
  /// conta.
  ///
  /// **A tela nao afirma envio que nao aconteceu.** `DesfechoDoEnvio` tem tres
  /// valores e cada um tem a sua frase: sem sinal diz para tentar de novo (nao
  /// ha fila offline para esta foto -- a `RetomadaDeFotos` e do pet, e dizer
  /// "ela sai sozinha" aqui seria mentira); recusada diz para tentar outra
  /// foto; enviada diz que ela aparece quando o processamento terminar.
  ///
  /// A foto escolhida **fica** quando o envio falha: limpar a previa faria a
  /// pessoa escolher o arquivo de novo para tentar de novo.
  Future<void> _enviarAFoto() async {
    final foto = _fotoEscolhida;
    if (foto == null || _enviandoAFoto) return;

    // O NOME ANTES DA FOTO, e a conferencia e local de proposito.
    //
    // O terceiro passo do envio e `PATCH /v1/me` com `photo_upload_id`, e o
    // servidor recusa esse PATCH quando a conta nao tem nome (decisao do
    // cliente de 18/10/2026). Essa recusa chega aqui como
    // `DesfechoDoEnvio.recusada`, que vira "tente outra foto" -- e nenhuma
    // outra foto resolve. Medido em 18/10/2026: a conta sem nome recebia
    // `400 {"field":"display_name","code":"required"}` depois de os bytes
    // subirem.
    //
    // Conferir aqui poupa o envio inteiro e, acima disso, DIZ O QUE PREENCHER:
    // a mensagem cai no campo do nome, como a do `Salvar`.
    if (_nome.text.trim().isEmpty) {
      setState(() {
        _erros[_CamposDosDados.nome] = _TextosDosDados.nomePrecisaDeTexto;
        _confirmacao = null;
        _faixa = const MensagemDeErro(texto: _TextosDosDados.fotoPrecisaDoNome);
      });
      anunciar(context, _TextosDosDados.fotoPrecisaDoNome);
      return;
    }

    setState(() {
      _enviandoAFoto = true;
      _faixa = null;
      _confirmacao = null;
    });

    final escopo = Escopo.of(context);
    final destino = FotoDoUsuario(api: escopo.me);
    final desfecho =
        await escopo.envioDeFoto.enviar(foto: foto, destino: destino);
    if (!mounted) return;

    setState(() {
      _enviandoAFoto = false;
      switch (desfecho) {
        case DesfechoDoEnvio.enviada:
          _fotoEscolhida = null;
          _confirmacao = _TextosDosDados.fotoEnviada;
          // O PATCH de confirmacao JA devolveu o `/me` novo: ler o corpo que
          // ele trouxe e o que evita um `GET /v1/me` a mais logo depois do
          // envio. Nulo nao acontece num desfecho `enviada`, mas o `case`
          // existe porque um dia pode acontecer e `!` apagaria a tela.
          if (destino.corpoDoMe case final Map<String, dynamic> corpo) {
            _lido = DadosPessoais.doJson(corpo);
          }
        case DesfechoDoEnvio.semSinal:
          _faixa = const MensagemDeErro(texto: _TextosDosDados.fotoSemSinal);
        case DesfechoDoEnvio.recusada:
          _faixa = const MensagemDeErro(texto: _TextosDosDados.fotoRecusada);
      }
    });
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

    if (nome == null &&
        apelido == null &&
        telefone == null &&
        cep == null &&
        bairro == null &&
        cidade == null &&
        uf == null) {
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

    return SingleChildScrollView(
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
            escolhida: _fotoEscolhida,
            validado: lido.usuario.emailVerificado,
            permissao: _permissaoDaCamera,
            enviando: _enviandoAFoto,
            aoTirar: _tirarAFoto,
            aoEscolher: _escolherDaGaleria,
            aoEnviar: _enviarAFoto,
            aoAbrirAjustes: _abrirOsAjustes,
          ),
          const SizedBox(height: BichuEspaco.e6),
          _campo(
            chave: _CamposDosDados.nome,
            rotulo: _TextosDosDados.nome,
            controlador: _nome,
            limite: 80,
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
            rotulo: _TextosDosDados.bairro,
            controlador: _bairro,
            limite: 80,
            capitalizacao: TextCapitalization.words,
          ),
          _campo(
            chave: _CamposDosDados.cidade,
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
            FaixaDeAviso(texto: _faixa!.texto),
          ],
          // A PORTA DA VITRINE DE FOTOS (uniao de 18/10/2026).
          //
          // Ela nao estava em lugar nenhum: o autor da vitrine construiu a
          // tela inteira e **nao pos a porta**, porque este arquivo era de
          // outro ramo e mexer nele colidiria. Sem esta porta a tela existe,
          // responde e nao e alcancavel por nenhum toque.
          //
          // AQUI e nao em `Perfil`: a lista de itens de `Perfil` e a ordem que
          // o cliente determinou (`Meus dados`, `Escanear uma tag`, `Sair da
          // conta`), e acrescentar uma quarta linha la e decisao dele, nao
          // fiacao. `Meus dados` e a tela dos dados da PESSOA, e as fotos que
          // ela mostra de si sao dado dela.
          const SizedBox(height: BichuEspaco.e6),
          ItemDeMenu(
            rotulo: VitrineDeFotosDoUsuario.tituloDaTela,
            apoio: _TextosDosDados.apoioDaVitrine,
            aoTocar: () => GoRouter.of(context).push(Rotas.minhaVitrine),
          ),
        ],
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
  Widget _campo({
    required String chave,
    required String rotulo,
    required TextEditingController controlador,
    required int limite,
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
        limite: limite,
        ajuda: ajuda,
        erro: _erros[chave],
        habilitado: !_salvando,
        exemplo: exemplo,
        tipoDeTeclado: tipoDeTeclado,
        capitalizacao: capitalizacao,
        formatadores: formatadores,
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
/// - **Recusada nos bytes**: `url` nula tambem, e a tela trata igual a sem
///   foto. Quem recusou foi o worker, sobre os bytes reais, e o motivo vive em
///   `Me.photo.rejection_reason` -- que esta tela **nao** desenha, pelo mesmo
///   motivo do texto de apoio. Tentar outra foto e o caminho, e os dois botoes
///   logo abaixo ja o oferecem.
class _BlocoDaFoto extends StatelessWidget {
  const _BlocoDaFoto({
    required this.fotoDoServidor,
    required this.processando,
    required this.escolhida,
    required this.validado,
    required this.permissao,
    required this.enviando,
    required this.aoTirar,
    required this.aoEscolher,
    required this.aoEnviar,
    required this.aoAbrirAjustes,
  });

  final String? fotoDoServidor;
  final bool processando;
  final FotoLocal? escolhida;

  /// `Me.email_verified`. **O selo e isto, e nada mais**: nao vem da imagem,
  /// nao e escolhido pelo app e nao e gravado no JPEG.
  final bool validado;

  final EstadoDaPermissao permissao;
  final bool enviando;
  final VoidCallback aoTirar;
  final VoidCallback aoEscolher;
  final VoidCallback aoEnviar;
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
        // `Salvar a foto` **so existe quando ha foto escolhida**: sem arquivo
        // nao ha o que enviar, e um botao desabilitado aqui seria um controle
        // pedindo um toque que nao faz nada.
        if (local != null) ...<Widget>[
          const SizedBox(height: BichuEspaco.e2),
          BotaoPrimario(
            rotulo: _TextosDosDados.salvarAFoto,
            carregando: enviando,
            aoTocar: aoEnviar,
          ),
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

/// O selo de validado, **sobre** a foto.
///
/// `Me.email_verified` e a unica fonte. O anel de cor de superficie existe
/// porque o selo pousa em cima de uma imagem de conteudo desconhecido: sem ele
/// um escudo verde sobre um fundo verde desaparece.
///
/// **Com rotulo**, e nao decorativo: a validacao e informacao que nao esta
/// escrita em nenhum outro lugar desta tela, e um icone sem rotulo e um dado
/// que quem usa leitor de tela nao recebe.
class _SeloDeValidado extends StatelessWidget {
  @override
  Widget build(BuildContext context) {
    final cores = BichuColors.of(context).cores;
    return Semantics(
      label: _TextosDosDados.contaValidada,
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
  static const String apoioDaVitrine = 'As fotos que só você vê';

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
  static const String salvarAFoto = 'Salvar a foto';

  /// O rotulo do retrato que ja esta na conta, para quem nao ve a imagem.
  static const String aSuaFoto = 'A sua foto';

  /// O rotulo da previa do arquivo que acabou de ser escolhido. Diferente do
  /// de cima de proposito: a pessoa precisa saber qual das duas esta vendo.
  static const String aFotoEscolhida = 'A foto que você escolheu';

  /// O rotulo do selo. O icone nao fala.
  static const String contaValidada = 'Conta validada';

  /// O rotulo do simbolo de processamento no lugar da foto. O icone tambem
  /// nao fala.
  static const String processandoAFoto = 'Processando a foto';

  static const String cameraNosAjustes =
      'A câmera está bloqueada para o Bichu. Dá para liberar nos ajustes do '
      'sistema.';
  static const String abrirAjustes = 'Abrir os ajustes';

  static const String fotoEnviada =
      'Foto enviada. Ela aparece aqui quando o processamento terminar.';

  /// **Sem promessa de fila.** A `RetomadaDeFotos` e do pet; esta foto nao
  /// entra em fila nenhuma, e dizer "ela sai sozinha quando o sinal voltar"
  /// seria afirmar um envio que ninguem vai tentar.
  static const String fotoSemSinal =
      'Sem conexão para enviar a foto. Tente de novo quando o sinal voltar.';

  static const String fotoRecusada = 'O envio foi recusado. Tente outra foto.';

  /// A FOTO TAMBEM E CADASTRO, e a conta sem nome nao atualiza cadastro.
  ///
  /// Cliente, 18/10/2026: *"nao permitir atualizar o cadastro, se nao tiver
  /// algum nome cadastrado"*. O terceiro passo do envio e `PATCH /v1/me` com
  /// `photo_upload_id`, entao a trava do servidor vale para ele -- e sem esta
  /// frase a pessoa recebia `fotoRecusada` ("tente outra foto") para um
  /// problema que nenhuma outra foto resolve. O que falta e o NOME, e a
  /// mensagem diz isso e o campo fica marcado.
  static const String fotoPrecisaDoNome =
      'Preencha o nome e salve antes de enviar a foto.';

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
