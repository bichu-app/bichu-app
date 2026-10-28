
import 'package:flutter/material.dart';
import 'package:go_router/go_router.dart';

import '../../api/envio_de_foto.dart';
import '../../api/falhas.dart';
import '../../api/mensagens_de_erro.dart';
import '../../api/modelos_pet.dart';
import '../../api/problem.dart';
import '../../dispositivo/camera_e_galeria.dart';
import '../../escopo.dart';
import '../../roteamento/rotas.dart';
import '../../roteamento/saida_da_mensagem.dart';
import '../../theme/bichu_colors.dart';
import '../../theme/bichu_tokens.g.dart';
import '../../widgets/barra_de_acao_fixa.dart';
import '../../widgets/botao_primario.dart';
import '../../widgets/faixa_de_aviso.dart';
import '../../widgets/folha_destrutiva.dart';
import '../../widgets/item_de_menu.dart';
import '../../widgets/moldura.dart';
import '../../widgets/previa_da_foto.dart';
import '../../widgets/saida_da_tela.dart';
import 'campos_do_pet.dart';
import 'rascunho_de_pet.dart';
import 'textos_do_detalhe.dart';

/// Editar os dados do pet (BICHUS-61), derivada de F1.3 e F1.5.
///
/// ## Os campos sao os MESMOS do cadastro, e isso e a historia
///
/// O criterio 1 pede "um formulario com os mesmos campos e as mesmas regras de
/// F1.3 e F1.5". Nao "parecidos": **os mesmos**. Por isso esta tela monta
/// [CamposDeIdentificacao] e [CamposDeSinais], os dois blocos que o cadastro
/// monta, e nao uma segunda versao deles.
///
/// Duas formas diferentes de editar os mesmos campos e defeito, nao escolha: o
/// rotulo muda de um lado, a validacao do outro, e quem cadastrou e quem
/// editou passam a ver telas diferentes do mesmo formulario. Enquanto os
/// campos moravam dentro do `State` de cada tela de cadastro, esta tela so
/// podia nascer como copia -- e por isso a primeira coisa que esta historia
/// fez foi tirar os campos de la.
///
/// ## O `PATCH` manda o pet inteiro, e o motivo e do servidor
///
/// `PATCH /pets/{petId}` recebe um `PetInput` **completo** e o repositorio
/// grava todas as colunas a partir dele: campo que nao viaja e gravado como
/// nulo. Por isso esta tela **carrega o pet inteiro antes de abrir** e
/// [RascunhoDePet.doPet] copia tudo, inclusive o que nenhum campo desta tela
/// mostra. O que a tela nao souber ler, ela apaga.
///
/// ## A foto NAO passa pelo `PATCH`, e isso e o desenho (criterios 4, 9, 10, 11)
///
/// `PetInput` nao tem campo de foto nenhum -- nem `photo_url`, nem
/// `photo_upload_id`. A foto do pet e um recurso proprio, com tres rotas
/// proprias (`createPetPhotoUploadIntent`, `confirmPetPhoto`,
/// `deletePetPhoto`), e o `PATCH` desta tela nunca a toca. Duas consequencias,
/// e as duas sao boas:
///
/// 1. **Salvar nao reenvia foto.** Nao ha o que reenviar: o corpo do `PATCH`
///    nao a carrega. Trocar e remover valem no instante do toque, e nao no
///    `Salvar` -- e e por isso que [BarraDeConta.resultado] existe, para quem
///    trocou a foto e voltou sem salvar nao deixar o detalhe pintando a foto
///    antiga.
/// 2. **Salvar nao apaga a foto.** O paragrafo acima avisa que campo que nao
///    viaja e gravado como nulo; isso vale para as colunas de `PetInput`, e a
///    foto nao e uma delas.
///
/// **A ausencia de foto e campo vazio a preencher, e nao pendencia acusada**
/// (criterio 10): o bloco mostra a moldura vazia e o convite `Adicionar foto`,
/// sem faixa de erro e sem contagem de pendencia. A foto e opcional no
/// contrato e por decisao do cliente de 21/09.
///
/// **A foto atual e sempre a DERIVADA** (`card_url`, com `thumb_url` de
/// reserva), nunca o original. O original carrega o EXIF com a coordenada da
/// casa do tutor ate o worker limpa-lo, e tem o peso de um arquivo de camera:
/// baixa-lo para desenhar 160 dp e trafego pago pelo tutor.
///
/// ## O que nao esta aqui
///
/// - **Reautenticacao.** A edicao nao a exige: `updatePet` declara
///   `security: [bearerAuth]` sozinho no contrato.
/// - **A conferencia do 409 no servidor.** `deletePetPhoto` declara 409 para
///   "e a unica foto de um pet com caso aberto", e `excluirFoto` do
///   `media-service` **nao confere caso aberto nenhum**. Esta tela trata o 409
///   de todo jeito (ver [_mensagemDaRemocao]), porque o dia em que o servidor
///   passar a emiti-lo nao pode ser o dia em que o app comeca a engolir a
///   recusa. A falta e do servidor e esta nomeada no relatorio.
class TelaEditarPet extends StatefulWidget {
  const TelaEditarPet({required this.pet, super.key});

  /// O pet **ja carregado**, e nao um id.
  ///
  /// Quem abre esta tela e T.1, que acabou de ler o pet inteiro. Recarregar
  /// aqui custaria um `GET` e abriria a janela em que a edicao comeca de um
  /// estado diferente do que a pessoa estava vendo.
  final Pet pet;

  @override
  State<TelaEditarPet> createState() => _TelaEditarPetState();
}

/// Em que pe esta a foto, do ponto de vista desta tela.
///
/// Separado de `_faixa` pelo mesmo motivo que F1.6 separa os seus tres
/// assuntos: a faixa fala do `PATCH` dos campos, e a foto e um segundo assunto
/// que nao pode derrubar o primeiro. Quem perdeu o sinal enviando a foto nao
/// perdeu a edicao do nome.
enum _PassoDaFoto {
  /// Nada em curso. O que a tela mostra e o que o servidor tem.
  parada,

  /// Os bytes estao subindo.
  subindo,

  /// A remocao esta em curso.
  removendo,
}

class _TelaEditarPetState extends State<TelaEditarPet> {
  late final RascunhoDePet _rascunho = RascunhoDePet.doPet(widget.pet);

  final GlobalKey<CamposDeIdentificacaoState> _identificacao =
      GlobalKey<CamposDeIdentificacaoState>();
  final GlobalKey<CamposDeSinaisState> _sinais =
      GlobalKey<CamposDeSinaisState>();

  bool _salvando = false;
  MensagemDeErro? _faixa;

  /// O pet **como o servidor o tem agora**, e nao como ele chegou.
  ///
  /// `widget.pet` e o valor do momento em que a tela abriu, e a foto deixa de
  /// bater com ele no primeiro envio. Os campos do formulario continuam vindo
  /// do rascunho (que nasceu de `widget.pet`, e e o que a pessoa esta
  /// editando); so o bloco da foto le daqui.
  late Pet _pet = widget.pet;

  /// A foto mudou no servidor desde que esta tela abriu?
  ///
  /// E o que decide se voltar sem salvar devolve algo a T.1. Sem ele, toda
  /// saida devolveria um `Pet` e o detalhe se repintaria sem motivo.
  bool _fotoMudou = false;

  _PassoDaFoto _passoDaFoto = _PassoDaFoto.parada;

  /// A foto que a pessoa ACABOU de escolher, enquanto a derivada nao existe.
  ///
  /// **Sem ela nao ha retorno nenhum nesta tela, e foi o defeito relatado pelo
  /// cliente** em 20/10/2026: *"ao selecionar ele pisca, mas nao atualiza o
  /// preview"*. O "pisca" era a moldura trocando a foto antiga pelo esqueleto;
  /// o preview nunca chegava porque o unico caminho de imagem aqui era
  /// `fotoDeCapa`, e `confirmPetPhoto` responde 202 com a foto em `processing`
  /// -- que `fotoDeCapa` nao devolve, por nao ser exibivel. Sem polling no app,
  /// a moldura voltava para a foto ANTIGA e ficava nela. Um envio que funciona
  /// ficava indistinguivel de um que falha, e o cliente concluiu, com razao
  /// pelo que via, que o upload nao tinha acontecido.
  ///
  /// As outras cinco telas de foto ja mostram a escolhida antes do primeiro
  /// `await` (`PreviaDaFoto`), e por isso o girador delas nunca aparece. Esta
  /// fazia o inverso: mostrava o esqueleto e nunca a foto. E a MESMA decisao de
  /// ordem, com o sinal trocado.
  FotoLocal? _fotoEscolhida;

  /// O recado do bloco da foto: informativo quase sempre.
  String? _recadoDaFoto;

  /// O recado e um erro, ou so uma informacao?
  ///
  /// Decide o peso da faixa, e nao o texto. "Sem conexao, a foto sai quando o
  /// sinal voltar" nao e erro: nada se perdeu e ninguem precisa agir.
  bool _recadoEhErro = false;

  EstadoDaPermissao _permissaoDaCamera = EstadoDaPermissao.negada;
  bool _consultandoPermissao = true;

  /// Ver o mesmo sinalizador em F1.4 e F1.6: `Escopo` e `InheritedWidget`, e
  /// le-lo em `initState` e erro de framework.
  bool _iniciou = false;

  @override
  void didChangeDependencies() {
    super.didChangeDependencies();
    if (_iniciou) return;
    _iniciou = true;
    _consultarPermissao();
  }

  Future<void> _consultarPermissao() async {
    final estado = await Escopo.of(context).camera.estadoDaCamera();
    if (!mounted) return;
    setState(() {
      _permissaoDaCamera = estado;
      _consultandoPermissao = false;
    });
  }

  @override
  void dispose() {
    // Aqui o rascunho **e** desta tela: ela o criou em [initState] e ninguem
    // mais o segura. Diferente do assistente, onde ele atravessa tres telas.
    _rascunho.dispose();
    super.dispose();
  }

  // -- A foto ---------------------------------------------------------------

  /// Rele o pet para pegar a lista de fotos que o servidor passou a ter.
  ///
  /// **Um `GET`, e nao um palpite local.** `confirmPetPhoto` responde 202 e a
  /// foto nasce em `processing`, sem `card_url` nenhum; montar aqui uma
  /// `FotoDoPet` de mentira com a URL que eu imagino seria prometer um endereco
  /// que ninguem gravou. O estado `carregando` da moldura existe exatamente
  /// para esta janela.
  ///
  /// **Falha de leitura nao derruba nada.** O envio deu certo e isso ja esta
  /// dito no recado; uma releitura que falhou so deixa a moldura com a foto
  /// antiga por mais um instante, e inventar erro aqui acusaria a pessoa de um
  /// problema que ela nao tem.
  Future<void> _recarregarOPet() async {
    try {
      final fresco = await Escopo.of(context).pets.buscarPet(widget.pet.id);
      if (!mounted) return;
      setState(() {
        _pet = fresco;
        _fotoMudou = true;
      });
    } on Object {
      if (!mounted) return;
      // A foto mudou no servidor mesmo que a releitura nao tenha chegado: T.1
      // precisa recarregar de todo jeito, e por isso o sinalizador sobe aqui.
      setState(() => _fotoMudou = true);
    }
  }

  /// Abre a folha com as duas origens e envia o que vier.
  ///
  /// **A folha existe para a edicao nao virar uma segunda F1.4.** Ali a foto e
  /// um passo do assistente e ocupa a tela inteira, com os quatro estados de
  /// permissao desenhados em botao e faixa; aqui ela e um bloco entre os
  /// campos, e empilhar os mesmos dois botoes no corpo empurraria
  /// [CamposDeSinais] abaixo da dobra.
  Future<void> _trocarAFoto() async {
    if (_passoDaFoto != _PassoDaFoto.parada) return;

    final origem = await showModalBottomSheet<_Origem>(
      context: context,
      backgroundColor: BichuColors.of(context).cores.surface,
      barrierColor: BichuColors.of(context).cores.scrim,
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
              // A camera so e a acao principal quando ela pode funcionar. Com
              // a permissao negada para sempre, ou sem camera no build, quem
              // resolve e a galeria -- e e ela que sobe. A mesma inversao de
              // F1.4, pela mesma razao.
              if (_cameraPodeFuncionar) ...<Widget>[
                BotaoPrimario(
                  rotulo: TextosDoDetalhe.tirarFoto,
                  critico: true,
                  aoTocar: () =>
                      Navigator.of(contexto).pop(_Origem.camera),
                ),
                const SizedBox(height: BichuEspaco.e2),
                BotaoSecundario(
                  rotulo: TextosDoDetalhe.escolherDaGaleria,
                  aoTocar: () =>
                      Navigator.of(contexto).pop(_Origem.galeria),
                ),
              ] else ...<Widget>[
                BotaoPrimario(
                  rotulo: TextosDoDetalhe.escolherDaGaleria,
                  critico: true,
                  aoTocar: () =>
                      Navigator.of(contexto).pop(_Origem.galeria),
                ),
                // `indisponivel` nao constroi botao de camera nenhum: nao ha
                // permissao a conceder neste build, e um botao que nao leva a
                // nada e pior que a ausencia dele (BICHUS-158).
                if (_permissaoDaCamera != EstadoDaPermissao.indisponivel)
                  ...<Widget>[
                  const SizedBox(height: BichuEspaco.e2),
                  BotaoSecundario(
                    rotulo: TextosDoDetalhe.tirarFoto,
                    aoTocar: () =>
                        Navigator.of(contexto).pop(_Origem.camera),
                  ),
                ],
              ],
            ],
          ),
        ),
      ),
    );

    if (!mounted || origem == null) return;

    final camera = Escopo.of(context).camera;

    if (origem == _Origem.camera) {
      if (_permissaoDaCamera == EstadoDaPermissao.negada) {
        final novo = await camera.pedirCamera();
        if (!mounted) return;
        setState(() => _permissaoDaCamera = novo);
        if (novo != EstadoDaPermissao.concedida) return;
      }
      // Negada para sempre, ou indisponivel: pedir de novo nao abre dialogo. A
      // faixa do bloco ja diz o caminho dos ajustes, e insistir aqui seria um
      // toque que nao faz nada.
      if (_permissaoDaCamera != EstadoDaPermissao.concedida) return;
    }

    final foto = origem == _Origem.camera
        ? await camera.tirarFoto()
        : await camera.escolherDaGaleria();
    // **Cancelar o seletor nao envia nada.** `null` aqui e a pessoa desistindo,
    // e e o que garante que `Salvar` nunca reenvia uma foto que ninguem trocou:
    // o unico caminho de envio desta tela comeca num arquivo escolhido agora.
    if (!mounted || foto == null) return;

    await _enviar(foto);
  }

  Future<void> _enviar(FotoLocal foto) async {
    // O escopo e lido ANTES do primeiro `await`, como no resto desta tela.
    //
    // `RetomadaDeFotos`, e nao `EnvioDeFoto` cru, pelo mesmo motivo de F1.6: e
    // ela que guarda a foto no registro quando falta sinal e a tira de la
    // quando ela sobe. O mecanismo cru faria desta a unica tela que esquece a
    // foto ao fechar o app.
    final retomada = Escopo.of(context).retomadaDeFotos;

    setState(() {
      // A ESCOLHIDA ENTRA NA ARVORE ANTES DO PRIMEIRO `await`, que e o que as
      // outras telas de foto ja faziam. E ela que a pessoa ve enquanto os bytes
      // sobem, no lugar do esqueleto que apagava a foto antiga.
      _fotoEscolhida = foto;
      _passoDaFoto = _PassoDaFoto.subindo;
      _recadoDaFoto = TextosDoDetalhe.fotoSubindo;
      _recadoEhErro = false;
    });

    final desfecho = await retomada.enviarDoPet(petId: widget.pet.id, foto: foto);
    if (!mounted) return;

    setState(() {
      _passoDaFoto = _PassoDaFoto.parada;
      _recadoDaFoto = switch (desfecho) {
        DesfechoDoEnvio.enviada => TextosDoDetalhe.fotoEnviada,
        DesfechoDoEnvio.semSinal => TextosDoDetalhe.fotoSemSinal,
        DesfechoDoEnvio.recusada => TextosDoDetalhe.fotoRecusada,
      };
      // Sem sinal **nao e erro**: a foto esta guardada e sai na proxima
      // abertura com rede. Recusada e, porque tentar de novo com o mesmo
      // arquivo devolve a mesma recusa.
      _recadoEhErro = desfecho == DesfechoDoEnvio.recusada;
      // RECUSADA VOLTA A FOTO ANTERIOR. Deixar na moldura um arquivo que o
      // servidor recusou seria a mentira inversa da que este conserto fecha:
      // a tela mostrando como salva uma foto que nao existe em lugar nenhum.
      // `semSinal` MANTEM a escolhida, e isso nao e descuido -- o arquivo ficou
      // no disco do aparelho e sobe na proxima abertura com rede, entao a
      // moldura esta dizendo a verdade sobre o que vai acontecer.
      if (desfecho == DesfechoDoEnvio.recusada) _fotoEscolhida = null;
    });

    if (desfecho == DesfechoDoEnvio.enviada) await _recarregarOPet();
  }

  /// Remover **sem substituir**, que e o que o servidor permite.
  ///
  /// `excluirFoto` apaga a linha e devolve 204; nao ha "troque antes de
  /// remover". Por isso o botao existe -- se a remocao exigisse substituicao,
  /// ele nao deveria existir.
  ///
  /// Destrutivo, e por isso passa pela folha: o `DELETE` mora dentro do
  /// `aoConfirmar`, que so o botao destrutivo chama. Cancelar, o gesto de
  /// voltar e o arrasto para baixo nao chegam nele.
  Future<void> _removerAFoto() async {
    if (_passoDaFoto != _PassoDaFoto.parada) return;
    final capa = _pet.fotoDeCapa;
    if (capa == null) return;

    final escopo = Escopo.of(context);
    FalhaDeChamada? falha;

    final removeu = await mostrarFolhaDestrutiva(
      context,
      titulo: TextosDoDetalhe.tituloDaRemocaoDaFoto,
      corpo: TextosDoDetalhe.corpoDaRemocaoDaFoto(_pet.nome),
      oQueSome: <String>[TextosDoDetalhe.fotoAtualDe(_pet.nome)],
      // O caso aberto entra como aviso, e nao como impedimento: o servidor de
      // hoje remove de todo jeito, e esconder o botao prometeria uma protecao
      // que nao existe. O que a tela pode fazer e dizer o que esta em jogo.
      avisoExtra: _pet.idDoCasoAberto == null
          ? null
          : TextosDoDetalhe.casoAbertoSeraEncerrado(_pet.nome),
      rotuloDeConfirmar: TextosDoDetalhe.confirmarRemocaoDaFoto,
      rotuloAcessivelDeConfirmar:
          TextosDoDetalhe.confirmarRemocaoDaFotoAcessivel(_pet.nome),
      aoConfirmar: () async {
        try {
          await escopo.pets.excluirFotoDoPet(
            petId: _pet.id,
            photoId: capa.id,
          );
        } on FalhaDeChamada catch (erro) {
          // Guardada e relancada: a folha precisa saber que falhou (para nao
          // fechar como se tivesse dado certo), e a tela precisa do MOTIVO para
          // escolher a frase. Engolir aqui daria a mensagem generica no unico
          // caso em que ha algo concreto a dizer.
          falha = erro;
          rethrow;
        }
      },
    );

    if (!mounted) return;

    if (!removeu) {
      final erro = falha;
      // Nao foi recusa: a pessoa cancelou. Nada a dizer.
      if (erro == null) return;
      setState(() {
        _recadoDaFoto = _mensagemDaRemocao(erro);
        _recadoEhErro = true;
      });
      return;
    }

    setState(() {
      _recadoDaFoto = null;
      _recadoEhErro = false;
      // Remover apaga TAMBEM a escolhida: sem isto, apagar a foto deixaria na
      // moldura a imagem local que a pessoa acabou de mandar remover.
      _fotoEscolhida = null;
    });
    await _recarregarOPet();
  }

  /// O 409 de `deletePetPhoto`, tratado antes de o servidor emiti-lo.
  ///
  /// **Decide por `type` quando ele vem, e por status quando ele nao vem.** O
  /// contrato declara o 409 desta rota apontando para `Problem` generico, sem
  /// nomear o `type`; `pet-photo-missing` e o unico 409 de foto do catalogo e e
  /// o candidato. Ramificar so pelo `type` deixaria a recusa cair no texto
  /// generico se o servidor mandar outro slug, e ramificar so por status
  /// acertaria por sorte.
  String _mensagemDaRemocao(FalhaDeChamada falha) {
    if (falha is FalhaDaApi &&
        (falha.problem.tipo == ProblemTipo.petSemFoto ||
            falha.problem.status == 409)) {
      return TextosDoDetalhe.fotoPresaAoCasoAberto;
    }
    if (falha is FalhaDaApi &&
        (falha.problem.tipo == ProblemTipo.naoEncontrado ||
            falha.problem.status == 404)) {
      // A foto saiu noutro aparelho entre abrir e remover, ou o pet nao e mais
      // desta conta. Nos dois casos ela ja nao esta la.
      return TextosDoDetalhe.naoConseguimosRemoverAFoto;
    }
    return MensagensDeErro.de(falha).texto;
  }

  /// A camera pode funcionar neste aparelho, agora?
  ///
  /// `negada` conta como "pode": pedir ainda abre dialogo. `negadaPermanente`
  /// e `indisponivel` nao.
  bool get _cameraPodeFuncionar =>
      !_consultandoPermissao &&
      (_permissaoDaCamera == EstadoDaPermissao.concedida ||
          _permissaoDaCamera == EstadoDaPermissao.negada);

  Future<void> _salvar() async {
    // **Os dois blocos validam, e os dois gravam.** A ordem importa: chamar
    // so o primeiro e desistir no `false` dele deixaria os campos de sinais
    // sem gravar, e o `PATCH` sairia com o texto anterior a digitacao.
    final identificacaoOk = _identificacao.currentState?.validar() ?? false;
    final sinaisOk = _sinais.currentState?.validar() ?? false;
    if (!identificacaoOk || !sinaisOk) return;

    setState(() {
      _faixa = null;
      _salvando = true;
    });

    try {
      final atualizado = await Escopo.of(context).pets.atualizarPet(
        petId: widget.pet.id,
        nome: _rascunho.nome,
        especie: _rascunho.especie!,
        porte: _rascunho.porte!,
        breedCode: _rascunho.breedCode,
        breedFreeText: _rascunho.breedFreeTextParaEnvio,
        refDataVersion: _rascunho.refDataVersion,
        corPrincipalCodigo: _rascunho.corPrincipalCodigo,
        segundaCorCodigo: _rascunho.segundaCorCodigo,
        sexo: _rascunho.sexo,
        sinaisParticulares: _rascunho.sinaisParticulares,
        cuidados: _rascunho.cuidados,
      );
      if (!mounted) return;
      // Devolve o pet atualizado para T.1 pintar. `pop` com valor, e nao um
      // `go`: a edicao e uma folha sobre o detalhe, e voltar e voltar.
      context.pop(atualizado);
    } on FalhaDeChamada catch (falha) {
      // **Criterio 5: os campos permanecem preenchidos e nada e perdido.**
      //
      // A tela nao fecha, o rascunho nao e descartado e os blocos de campo
      // nao sao remontados -- a falha vira faixa e a pessoa corrige e tenta de
      // novo com tudo onde estava. Um `pop` aqui, ou um `setState` que
      // recriasse o rascunho, apagaria a edicao inteira no unico momento em
      // que ela e dificil de refazer.
      if (!mounted) return;
      setState(() => _faixa = _mensagem(falha));
    } on Object catch (erro, pilha) {
      // O QUE NAO E FalhaDeChamada. O `finally` ja desligava o carregando,
      // entao a tela nao gira para sempre -- ela fica CALADA, que e o outro
      // lado do mesmo defeito: nada aconteceu, nada foi dito, e a pessoa toca
      // de novo achando que o primeiro toque nao pegou.
      registrarFalhaInesperada(erro, pilha, onde: 'ao salvar a edicao do pet');
      if (!mounted) return;
      setState(
        () => _faixa = const MensagemDeErro(texto: MensagensDeErro.servidorFora),
      );
    } finally {
      if (mounted) setState(() => _salvando = false);
    }
  }

  /// **Decide por `type`, nunca por status.**
  ///
  /// `validation-failed` nao e generico: o erro e do campo que o servidor
  /// nomeou. Se ele nao nomear campo nenhum, e defeito nosso, e a tela diz
  /// isso sem acusar um campo que ninguem apontou.
  MensagemDeErro _mensagem(FalhaDeChamada falha) {
    if (falha is FalhaDaApi &&
        falha.problem.tipo == ProblemTipo.validacaoFalhou) {
      final primeiro = falha.problem.campos.isEmpty
          ? null
          : falha.problem.campos.first.mensagem;
      return MensagemDeErro(
        texto: primeiro ?? TextosDoDetalhe.naoConseguimosSalvar,
      );
    }
    if (falha is FalhaDaApi &&
        (falha.problem.tipo == ProblemTipo.naoEncontrado ||
            falha.problem.status == 404)) {
      // O pet saiu da conta entre abrir e salvar: excluido noutro aparelho, ou
      // o endereco nunca foi desta conta (ADR-0021, 404 nos dois casos).
      return const MensagemDeErro(texto: TextosDoDetalhe.petForaDaConta);
    }
    return MensagensDeErro.de(falha);
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: BarraDeConta(
        titulo: TextosDoDetalhe.tituloDaEdicao,
        saida: TipoDeSaida.voltar,
        // **Voltar sem salvar devolve o pet quando a FOTO mudou.** A troca e a
        // remocao valem no servidor no instante do toque; sem isto, quem troca
        // a foto e volta deixa T.1 pintando a antiga. Nulo quando ninguem
        // mexeu na foto, e ai voltar e voltar, como sempre foi.
        resultado: () => _fotoMudou ? _pet : null,
      ),
      bottomNavigationBar: BarraDeAcaoFixa(
        acoes: <Widget>[
          BotaoPrimario(
            rotulo: TextosDoDetalhe.salvar,
            critico: true,
            carregando: _salvando,
            aoTocar: _salvar,
          ),
        ],
      ),
      // **`SingleChildScrollView` + `Column`, e nao `ListView`.**
      //
      // A diferenca nao e de estilo, e ela e um defeito medido. O `ListView`
      // so constroi o que cabe na tela: com os dois blocos de campo empilhados,
      // [CamposDeSinais] nasce **abaixo da dobra** e so existe depois de a
      // pessoa rolar. Enquanto ele nao existe, `_sinais.currentState` e nulo,
      // `validar()` devolve nulo, e [_salvar] desiste em silencio -- toca-se em
      // `Salvar`, nada acontece, e nada explica por que.
      //
      // As telas do assistente usam `ListView` e estao certas: cada uma
      // hospeda UM bloco. Esta hospeda dois, e um formulario precisa de todos
      // os campos vivos para validar e para enviar.
      body: SafeArea(
        child: SingleChildScrollView(
          padding: const EdgeInsets.all(BichuEspaco.e4),
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.stretch,
            children: <Widget>[
              // **Criterio 3: o alerta que ja saiu nao e reescrito.**
              //
              // So aparece quando ha caso aberto, e aparece ANTES dos campos:
              // depois deles seria informacao entregue apos a decisao. O cartaz
              // e o alerta ja disparados carregam os dados do momento em que
              // sairam, e nada nesta tela os alcanca.
              if (widget.pet.idDoCasoAberto != null) ...<Widget>[
                const FaixaDeAviso(
                  peso: PesoDaFaixa.informativo,
                  texto: TextosDoDetalhe.oAlertaJaSaiu,
                ),
                const SizedBox(height: BichuEspaco.e6),
              ],
              CamposDeIdentificacao(key: _identificacao, rascunho: _rascunho),
              const SizedBox(height: BichuEspaco.e6),
              // A FOTO, entre identificacao e sinais. Ela nao e um sinal
              // particular (aquilo e texto que o achador le), e nao e um campo
              // de identificacao do formulario: e um recurso proprio, com
              // escrita propria, e por isso tem bloco proprio.
              _BlocoDaFoto(
                pet: _pet,
                escolhida: _fotoEscolhida,
                passo: _passoDaFoto,
                recado: _recadoDaFoto,
                recadoEhErro: _recadoEhErro,
                permissao: _permissaoDaCamera,
                aoTrocar: _trocarAFoto,
                aoRemover: _removerAFoto,
                aoAbrirOsAjustes: () =>
                    Escopo.of(context).camera.abrirAjustesDoSistema(),
              ),
              const SizedBox(height: BichuEspaco.e6),
              CamposDeSinais(key: _sinais, rascunho: _rascunho),
              const SizedBox(height: BichuEspaco.e6),
              // ----------------------------------------------------------
              // O ENDERECO DE ENTREGA DESTE PET (cliente, 27/10/2026)
              // ----------------------------------------------------------
              //
              // Ele pediu: *"o endereco de entrega da plaquinha tem que estar
              // dentro do cadastro do pet"*. **Esta linha e esse "dentro".**
              //
              // E, com a decisao anterior dele posta na mesa -- 21/10/2026, *"um
              // endereco de entrega salvo na conta, reusado em todo pedido e
              // editavel num lugar so"* --, ele decidiu *"endereco um por pet"*.
              // A de 21/10 caiu, e o item que vivia em `Meus dados` veio para
              // ca. A tela e a MESMA: ela mudou de alvo, nao de formulario.
              //
              // **PORTA, e nao bloco de campos nesta rolagem**, e a razao e a
              // mesma que ja tirou este formulario de `Meus dados`: o `Salvar`
              // desta tela e um ato unico sobre `PATCH /v1/pets/{petId}`, com UMA
              // faixa de erro e UMA de confirmacao, e o endereco e outra rota
              // (`PUT /v1/pets/{petId}/delivery-address`). Um botao que dispara
              // duas chamadas tem quatro desfechos -- as duas certas, as duas
              // erradas e as duas misturas --, e esta tela nao tem onde contar os
              // dois do meio. Nove campos a mais nesta rolagem tambem poriam um
              // CEP e uma busca de CEP no meio do cadastro do animal, que e
              // outra coisa.
              //
              // **Nao e uma etapa do assistente de cadastro.** Pedir nove campos
              // de endereco a quem esta cadastrando o animal cobraria endereco
              // de entrega de quem nunca vai pedir plaquinha. O endereco e
              // opcional no cadastro e obrigatorio no PEDIDO -- e essa segunda
              // metade e a decisao dele de 17/10/2026, que esta frente nao
              // tocou.
              ItemDeMenu(
                rotulo: _TextosDoEnderecoDoPet.rotulo,
                apoio: _TextosDoEnderecoDoPet.apoio,
                aoTocar: () => GoRouter.of(context)
                    .push(Rotas.enderecoDeEntregaDoPet(_pet.id)),
              ),
              if (_faixa != null) ...<Widget>[
                const SizedBox(height: BichuEspaco.e6),
                FaixaDeAviso(
                  texto: _faixa!.texto,
                  rotuloDaAcao: _faixa!.acao,
                  aoTocarNaAcao: saidaDaMensagem(context, _faixa!),
                ),
              ],
            ],
          ),
        ),
      ),
    );
  }
}

/// De onde a foto vem. Local da folha, nao trafega e nao espelha lista do
/// contrato.
enum _Origem { camera, galeria }

/// O bloco da foto: a foto atual, as acoes e o recado.
///
/// **A foto que ele pinta e a DERIVADA, e isso nao e otimizacao.** A
/// `FotoDoPet.urlDeCartao` devolve `card_url` com `thumb_url` de reserva --
/// nunca o original. O original carrega o EXIF com a coordenada da casa do
/// tutor ate o worker limpa-lo, e tem o peso de um arquivo de camera; a `card`
/// tem 1024 px e e a derivada que a moldura `foto/lg` (160 dp) desenha sem
/// esticar. A `thumb` sozinha tem 176 px e apareceria serrilhada a 3x, e e por
/// isso que a ordem de preferencia aqui e o inverso da do cartao de lista.
///
/// **Sem foto NAO e um estado de erro.** Moldura vazia e o convite
/// `Adicionar foto`, sem faixa e sem acusacao: a foto e opcional, e o criterio
/// 10 da BICHUS-61 cobra exatamente isto.
class _BlocoDaFoto extends StatelessWidget {
  const _BlocoDaFoto({
    required this.pet,
    required this.escolhida,
    required this.passo,
    required this.recado,
    required this.recadoEhErro,
    required this.permissao,
    required this.aoTrocar,
    required this.aoRemover,
    required this.aoAbrirOsAjustes,
  });

  final Pet pet;

  /// A foto recem-escolhida, enquanto a derivada do servidor nao existe.
  final FotoLocal? escolhida;
  final _PassoDaFoto passo;
  final String? recado;
  final bool recadoEhErro;
  final EstadoDaPermissao permissao;
  final VoidCallback aoTrocar;
  final VoidCallback aoRemover;
  final VoidCallback aoAbrirOsAjustes;

  @override
  Widget build(BuildContext context) {
    final cores = BichuColors.of(context).cores;
    final textos = Theme.of(context).textTheme;
    final capa = pet.fotoDeCapa;
    final ocupado = passo != _PassoDaFoto.parada;

    return Column(
      crossAxisAlignment: CrossAxisAlignment.stretch,
      children: <Widget>[
        Text(TextosDoDetalhe.tituloDaFoto, style: textos.titleMedium),
        const SizedBox(height: BichuEspaco.e4),
        // A moldura **centralizada**, e nao esticada: `foto/lg` tem largura
        // fixa de 160 dp no design system 5.4, e deixa-la ocupar a largura da
        // tela mudaria a proporcao que o token fixa.
        Align(
          alignment: Alignment.centerLeft,
          child: _MolduraDaEdicao(
            pet: pet,
            capa: capa,
            escolhida: escolhida,
            subindo: passo == _PassoDaFoto.subindo,
          ),
        ),
        const SizedBox(height: BichuEspaco.e4),
        BotaoSecundario(
          rotulo: capa == null
              ? TextosDoDetalhe.adicionarFoto
              : TextosDoDetalhe.trocarAFoto,
          carregando: passo == _PassoDaFoto.subindo,
          aoTocar: ocupado ? null : aoTrocar,
        ),
        // **O botao de remover so existe quando ha foto para remover.** Sem
        // foto ele nao teria `photoId` para citar, e o toque viraria uma
        // chamada para `/photos/` sem id -- o formato de falha que nao aponta
        // para a causa.
        if (capa != null) ...<Widget>[
          const SizedBox(height: BichuEspaco.e2),
          BotaoSecundario(
            rotulo: TextosDoDetalhe.removerAFoto,
            carregando: passo == _PassoDaFoto.removendo,
            aoTocar: ocupado ? null : aoRemover,
          ),
        ],
        // `escolhida == null` entra na condicao: com a foto recem-escolhida na
        // moldura, convidar a pessoa a adicionar uma foto seria negar o que
        // ela esta vendo.
        if (capa == null && escolhida == null && !pet.temFotoEmProcessamento) ...<Widget>[
          const SizedBox(height: BichuEspaco.e2),
          // Convite, em `bodySmall` e `textSecondary`: e orientacao, e nao
          // erro. Faixa aqui transformaria "ainda nao tem foto" em pendencia
          // acusada, que e o que o criterio 10 proibe.
          Text(
            TextosDoDetalhe.semFotoAinda,
            style: textos.bodySmall?.copyWith(color: cores.textSecondary),
          ),
        ],
        if (pet.temFotoEmProcessamento && recado == null) ...<Widget>[
          const SizedBox(height: BichuEspaco.e2),
          Text(
            TextosDoDetalhe.fotoEmProcessamento,
            style: textos.bodySmall?.copyWith(color: cores.textSecondary),
          ),
        ],
        // O motivo da recusa do servidor, quando nao ha foto exibivel. Ele vem
        // pronto em `rejection_reason` e nao se traduz nem se ramifica por ele.
        if (pet.motivoDaFotoRecusada case final motivo?) ...<Widget>[
          const SizedBox(height: BichuEspaco.e4),
          FaixaDeAviso(peso: PesoDaFaixa.informativo, texto: motivo),
        ],
        if (recado case final texto?) ...<Widget>[
          const SizedBox(height: BichuEspaco.e4),
          FaixaDeAviso(
            peso: recadoEhErro ? PesoDaFaixa.erro : PesoDaFaixa.informativo,
            texto: texto,
          ),
        ],
        // Os dois estados do aparelho que mudam o que a folha pode oferecer.
        // Informativos nos dois casos: nada deu errado e ninguem errou. A
        // diferenca e a SAIDA, e e por isso que sao dois -- `negada
        // permanentemente` tem os ajustes, `indisponivel` nao tem nada, e uma
        // acao ali mandaria a pessoa procurar permissao que nao existe.
        if (permissao == EstadoDaPermissao.negadaPermanentemente) ...<Widget>[
          const SizedBox(height: BichuEspaco.e4),
          FaixaDeAviso(
            peso: PesoDaFaixa.informativo,
            texto: TextosDoDetalhe.cameraNegada,
            rotuloDaAcao: TextosDoDetalhe.abrirOsAjustes,
            aoTocarNaAcao: aoAbrirOsAjustes,
          ),
        ] else if (permissao == EstadoDaPermissao.indisponivel) ...<Widget>[
          const SizedBox(height: BichuEspaco.e4),
          const FaixaDeAviso(
            peso: PesoDaFaixa.informativo,
            texto: TextosDoDetalhe.cameraNaoEmbarcada,
          ),
        ],
      ],
    );
  }
}

/// A moldura `foto/lg` desta tela, nos quatro estados.
///
/// Mesma decisao do `_MolduraDoPet` do cartao de lista, e de proposito:
/// `processing` **nao** vira "sem foto", porque quem acabou de enviar uma foto
/// desconfiaria de que o envio falhou. O esqueleto diz a verdade, que e "esta
/// vindo".
class _MolduraDaEdicao extends StatelessWidget {
  const _MolduraDaEdicao({
    required this.pet,
    required this.capa,
    required this.escolhida,
    required this.subindo,
  });

  final Pet pet;
  final FotoDoPet? capa;

  /// A foto recem-escolhida. Tem precedencia sobre [capa], e e o conserto.
  final FotoLocal? escolhida;
  final bool subindo;

  /// O ponto focal das DUAS imagens desta moldura.
  ///
  /// **O mesmo nos dois ramos, e e por isso que ele existe.** O terco superior
  /// e onde fica a cabeca do animal na foto tipica de tutor (design system
  /// 5.4). Ponto focal que DIFERISSE entre a escolhida e a derivada causaria
  /// exatamente o salto que ele existe para evitar: a foto se reposicionaria no
  /// instante em que a derivada chegasse.
  static const Alignment _pontoFocal = Alignment(0, -1 / 3);

  @override
  Widget build(BuildContext context) {
    // A MOLDURA FICA AQUI FORA, ENVOLVENDO OS TRES RAMOS -- e isso e requisito
    // medido, nao arrumacao.
    //
    // Antes da onda 4 cada ramo montava a propria `Moldura`. Enquanto as tres
    // eram iguais, isso funcionava por coincidencia; no dia em que um ramo
    // ganhasse outro quadro, **a foto trocaria de moldura no instante em que a
    // derivada chegasse** -- o mesmo salto que `_pontoFocal` existe para
    // evitar, um nivel acima. `foto_na_edicao_do_pet_test.dart` tem isca que
    // reprova se os tres ramos deixarem de compartilhar esta moldura.
    //
    // E e ela que torna o conserto do `dart:io` possivel: `PreviaDaFoto` entra
    // com `comInvolucroProprio: false` e desenha so a imagem, sem segunda
    // borda e sem segundo raio por dentro desta.
    return Moldura(
      largura: BichuMoldura.larguraFotoLg,
      estado: _estado,
      filho: _imagem(),
    );
  }

  /// O estado da moldura, decidido num lugar so.
  EstadoDaMoldura get _estado {
    // A ESCOLHIDA VEM PRIMEIRO, E INCLUSIVE DURANTE O ENVIO.
    //
    // Ela e a coisa mais recente que a pessoa decidiu, e e a unica imagem que
    // existe entre a escolha e a derivada ficar pronta -- janela que, sem
    // polling no app, nao fecha enquanto esta tela estiver aberta. Mostrar o
    // esqueleto aqui era apagar a foto antiga sem pintar a nova, que e o
    // "pisca" relatado; e cair de volta em `capa` depois do envio era exibir a
    // foto ANTIGA como se o envio nao tivesse acontecido.
    if (escolhida != null) return EstadoDaMoldura.repouso;
    if (capa != null && !subindo) return EstadoDaMoldura.repouso;
    return subindo || pet.temFotoEmProcessamento
        ? EstadoDaMoldura.carregando
        : EstadoDaMoldura.vazio;
  }

  /// A imagem que a moldura recebe, ou nulo nos estados sem imagem.
  Widget? _imagem() {
    final local = escolhida;
    if (local != null) {
      // **`PreviaDaFoto`, e nao `Image.file` aqui.** Abrir arquivo e trabalho
      // de `lib/widgets/`, fora de `lib/telas`: o portao de diretivas proibe
      // `dart:io` nesta arvore, e com razao -- tela que abre arquivo e tela que
      // fala com o aparelho por fora da porta. Esta tela era a NONA com foto
      // escolhida e a unica que tinha furado o portao.
      return Semantics(
        image: true,
        label: TextosDoDetalhe.fotoAtualDe(pet.nome),
        child: PreviaDaFoto(
          foto: local,
          descricao: TextosDoDetalhe.fotoAtualDe(pet.nome),
          pontoFocal: _pontoFocal,
          comInvolucroProprio: false,
          // A reserva certa DENTRO de uma moldura de estados e o estado dela, e
          // nao um paragrafo de texto que nao cabe em 160 dp.
          aoNaoAbrir: (context) => Moldura(
            largura: BichuMoldura.larguraFotoLg,
            estado: subindo
                ? EstadoDaMoldura.carregando
                : EstadoDaMoldura.vazio,
          ),
        ),
      );
    }

    final atual = capa;
    if (atual != null && !subindo) {
      return Semantics(
        image: true,
        label: TextosDoDetalhe.fotoAtualDe(pet.nome),
        child: Image.network(
          // `urlDeCartao`, a DERIVADA. Nao existe campo de original no
          // contrato de `PetPhoto`, e e assim que tem de ser.
          atual.urlDeCartao!,
          fit: BoxFit.cover,
          // O MESMO ponto focal da escolhida. Ver `_pontoFocal`.
          alignment: _pontoFocal,
          // Falha de rede cai na moldura vazia, e nao em caixa vermelha de
          // excecao no meio de um formulario (11.4).
          errorBuilder: (context, erro, pilha) =>
              const Moldura(largura: BichuMoldura.larguraFotoLg),
        ),
      );
    }

    // CASO 3: sem imagem. A moldura de fora desenha o esqueleto ou o vazio,
    // pelo `_estado`.
    return null;
  }
}

/// Os textos da porta do endereco de entrega deste pet.
///
/// **Separados numa classe propria, e nao soltos no `build`:** e o padrao desta
/// casa para texto de interface, e e o que permite um teste de tela cobrar o
/// rotulo pelo nome em vez de por uma cadeia repetida.
///
/// Os equivalentes viviam em `telas/perfil/tela_dados_pessoais.dart` e sairam de
/// la em 27/10/2026 com o item que rotulavam.
abstract final class _TextosDoEnderecoDoPet {
  static const String rotulo = 'Endereco de entrega';

  /// **Diz para que serve, diz que e DESTE pet, e nao promete prazo.**
  ///
  /// "Deste pet" e a parte nova, e e a decisao dele de 27/10/2026: quem tem dois
  /// animais precisa saber, antes de tocar, que o endereco daqui nao e o do
  /// outro. Prometer entrega ou prazo aqui seria afirmar decisao de produto que
  /// ninguem tomou.
  static const String apoio = 'Para onde mandar a plaquinha deste pet';
}
