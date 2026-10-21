import 'package:flutter/material.dart';

import '../../acessibilidade/anunciar.dart';
import '../../api/envio_de_foto.dart';
import '../../api/falhas.dart';
import '../../api/mensagens_de_erro.dart';
import '../../api/vitrine_api.dart';
import '../../dispositivo/camera_e_galeria.dart';
import '../../roteamento/saida_da_mensagem.dart';
import '../../theme/bichu_colors.dart';
import '../../theme/bichu_tokens.g.dart';
import '../../widgets/arrastar_para_atualizar.dart';
import '../../widgets/botao_primario.dart';
import '../../widgets/convite_para_entrar.dart';
import '../../widgets/faixa_de_aviso.dart';
import '../../widgets/imagem_da_rede.dart';
import '../../widgets/previa_da_foto.dart';
import '../../widgets/visualizador_de_imagem.dart';

/// A VITRINE DE FOTOS DO USUARIO — **visivel so ao dono**.
///
/// ## O que esta tela e, e o que ela nao e
///
/// Uma grade de ate NOVE fotos da propria conta, com a CAPA na posicao 0.
/// **Ela nao aparece em nenhuma outra tela, para ninguem.** O ADR-0025 item 2
/// proibe avatar de pessoa na superficie da `Rede` por nome, e o contrato
/// afirma em dois lugares que `Conversation.participants` nunca traz foto de
/// perfil — entao nao ha rota de vitrine de outra pessoa, e por isso nao ha
/// tela que a desenhe. A ausencia e a defesa.
///
/// **Fora de proposito, e cada ausencia e deliberada:** legenda, curtida,
/// contador e **marcar pessoa**. O ultimo e dado biometrico, e a recomendacao
/// registrada e recusar para sempre. Nao e omissao a ser preenchida depois.
///
/// **Os pets nao entram aqui.** Foto de pet mora em `pet_photos`, com o ciclo
/// de vida do cadastro do animal; esta tela REFERENCIA os pets e abre a pagina
/// deles por [aoAbrirMeusPets]. Copiar a foto do pet para a vitrine criaria
/// duas fotos do mesmo animal que divergem na primeira troca.
///
/// ## O PESO DA TELA, que e o motivo de a derivada de 320 px existir
///
/// A celula da grade tem [ladoDaCelula] = 104 dp. A 3x isso da **312 px
/// reais**, e e por isso que a grade pede `grid_url` (a derivada de 320 px) e
/// **nunca** `open_url` (1024 px) nem o original:
///
/// - a derivada de 176 px da foto unica do perfil seria **ampliada 1,8x**, e
///   ampliar nao acrescenta informacao nenhuma — so borra;
/// - a de 1024 px e dado demais, e a grade desenha ate NOVE de uma vez, entao o
///   desperdicio e multiplicado por nove. Foi assim que a vitrine da Loja
///   chegou a 9,8 MB numa tela.
///
/// E `cacheWidth` fecha a conta no decodificador: sem ele o `ui.Image` em
/// memoria custa a area do ARQUIVO e nao a do quadro, e nove deles engasgam um
/// aparelho modesto mesmo com o download pequeno.
///
/// ## `errorBuilder` em toda foto, e nao um retangulo cinza
///
/// Imagem que nao carrega vira a celula vazia COM RECADO, e nao um retangulo
/// que promete algo que nao vem. Acontece de verdade: a derivada pode ainda nao
/// existir (`status: processing`), e a rede do produto e usada na rua.
class VitrineDeFotosDoUsuario extends StatefulWidget {
  const VitrineDeFotosDoUsuario({
    required this.api,
    required this.escrita,
    required this.camera,
    required this.envio,
    super.key,
    this.aoAbrirMeusPets,
  });

  /// A LEITURA, e nao a `VitrineApi` inteira.
  final LeituraDaVitrine api;

  /// A ESCRITA, em interface propria: `intencaoDeFotoDaVitrine` e
  /// `substituir`, e nada mais.
  ///
  /// **Ate 19/10/2026 esta tela era SO DE LEITURA, e isso era o buraco.**
  /// Medido: `FotoDaVitrine` e `VitrineApi.substituir` nao eram construidas
  /// nem chamadas em lugar nenhum de `app/lib` nem de `app/test`, e o estado
  /// vazio da tela dizia *"Adicione uma foto para comecar a sua vitrine"* sem
  /// haver como adicionar. O cliente pediu a vitrine em 18/10 (*"perfil do
  /// usuario com vitrine de fotos, parecido com instagram"*).
  ///
  /// Ela e um parametro proprio, e nao a `VitrineApi` inteira, pela razao que
  /// o cabecalho de `EscritaDaVitrine` explica: a troca entre duas funcoes de
  /// assinatura identica foi o defeito desta semana, e a interface estreita e
  /// o que mantem a troca visivel.
  final EscritaDaVitrine escrita;

  /// A fronteira com o aparelho. Parametro, e nao `Escopo`, como as outras
  /// portas desta tela: e o que permite medir os quatro estados de permissao
  /// sem aparelho.
  final CameraEGaleria camera;

  /// O unico caminho de bytes do app. Parametro pelo mesmo motivo.
  final EnvioDeFoto envio;

  /// Abre `Meus pets`. **Referencia, e nao inclusao**: a foto do pet nao entra
  /// na vitrine. Nulo nao desenha o atalho.
  final VoidCallback? aoAbrirMeusPets;

  /// O lado da celula, em dp. 104 dp — tres colunas com folga numa tela de
  /// 360 dp, e o numero de que saem os 312 px reais a 3x.
  static const double ladoDaCelula = 104;

  /// O vao entre celulas. 2 dp: a grade e um mosaico, e nao uma lista de
  /// cartoes — vao largo transformaria nove fotos em nove objetos soltos.
  static const double vaoDaGrade = 2;

  static const String tituloDaTela = 'Minhas fotos';

  /// O vazio. **Pede UMA foto, e nunca as nove**: a vitrine com uma foto e
  /// estado completo, e da terceira em diante o ganho e perto de zero.
  static const String textoDoVazio = 'Adicione uma foto para começar a sua vitrine.';

  static const String recadoDeFotoQueNaoAbriu = 'Não deu para mostrar esta foto.';

  /// O que o toque na celula faz. Vai em `hint`, e nao no nome: o leitor de
  /// tela espera a ACAO ali, e o NOME da celula e o texto alternativo da foto.
  static const String dicaDeAmpliar = 'Ampliar';

  static const String rotuloDaCapa = 'Capa';

  // -------------------------------------------------------------------------
  // O CONTROLE DE ADICIONAR (19/10/2026)
  // -------------------------------------------------------------------------

  static const String tirarFoto = 'Tirar foto';

  static const String escolherDaGaleria = 'Escolher da galeria';

  /// O unico botao de salvar desta tela, e ele so existe quando ha o que
  /// salvar. **Nao e um "salvar foto" ao lado de outro salvar**: a tela nao
  /// tem formulario, e este e o `Salvar` dela.
  static const String salvar = 'Salvar';

  static const String aFotoEscolhida = 'A foto que você escolheu';

  static const String fotoProntaParaSalvar =
      'Foto enviada. Toque em Salvar para guardar na sua vitrine.';

  static const String fotoSemSinal =
      'A foto não subiu: sem conexão agora. Escolha a foto de novo quando '
      'tiver internet.';

  static const String fotoRecusada =
      'A foto não foi aceita. Escolha outra foto.';

  static const String fotoSalva = 'Foto salva na sua vitrine.';

  static const String cameraNosAjustes =
      'A câmera está bloqueada nos ajustes do sistema.';

  static const String abrirAjustes = 'Abrir os ajustes';

  /// O texto do teto. **O numero vem do SERVIDOR** (`MyShowcase.max_photos`,
  /// `enum: [9]`, medido contra a homologacao: `{"photos":[],"max_photos":9}`),
  /// e nunca de uma constante aqui -- duas copias do numero divergem na
  /// primeira mudanca, e a tela e a copia que ninguem lembra de atualizar.
  static String vitrineCheia(int teto) =>
      'Sua vitrine está cheia, com $teto fotos. Apague uma para pôr outra.';

  @override
  State<VitrineDeFotosDoUsuario> createState() => _EstadoDaVitrine();
}

class _EstadoDaVitrine extends State<VitrineDeFotosDoUsuario> {
  Vitrine? _vitrine;
  String? _falha;
  bool _carregando = true;

  /// A falha foi **falta de conta**, e nao defeito. Ver [faltaConta].
  bool _faltaConta = false;

  // -------------------------------------------------------------------------
  // ACRESCENTAR UMA FOTO (19/10/2026)
  // -------------------------------------------------------------------------

  /// A foto que a pessoa escolheu no aparelho. **A fonte da PREVIA, e ela vem
  /// do ARQUIVO LOCAL.**
  ///
  /// Nao se espera a derivada do servidor: a foto nasce `processing` com
  /// `grid_url: null` -- medido contra a homologacao, o `PUT /v1/me/showcase`
  /// respondeu `200` com `status: processing` e as duas URLs nulas, e so o
  /// `GET` seguinte trouxe `status: ready`. Uma previa que esperasse por elas
  /// ficaria vazia segundos depois da escolha, parecendo travada.
  FotoLocal? _escolhida;

  /// O `upload_id` de uma foto cujos **bytes ja estao no armazenamento** e que
  /// ainda **nao esta na vitrine**, ou nulo quando nao ha nenhuma.
  ///
  /// E este campo que o [salvar] manda em `ShowcasePhotoInput.upload_id`, e e
  /// ele a diferenca entre "ha foto escolhida" e "ha foto para gravar".
  String? _uploadPendente;

  bool _enviando = false;
  bool _salvando = false;

  /// A faixa de recado -- recusa de tipo, envio que nao saiu, falha ao gravar.
  MensagemDeErro? _faixa;

  /// O recado de sucesso, que sai no mesmo lugar e e outra coisa.
  String? _confirmacao;

  /// Comeca em `negada` como nas outras telas de foto: `negada` e o estado em
  /// que ainda da para PEDIR, e e o unico seguro de supor antes de perguntar.
  EstadoDaPermissao _permissaoDaCamera = EstadoDaPermissao.negada;

  @override
  void initState() {
    super.initState();
    _carregar();
    _lerAPermissaoDaCamera();
  }

  Future<void> _lerAPermissaoDaCamera() async {
    final estado = await widget.camera.estadoDaCamera();
    if (!mounted) return;
    setState(() => _permissaoDaCamera = estado);
  }

  /// `Tirar foto`. Pede a permissao quando ainda da para pedir, e desiste
  /// calada quando nao da -- a faixa de ajustes ja esta na tela nesse caso.
  Future<void> _tirarFoto() async {
    var estado = _permissaoDaCamera;
    if (estado == EstadoDaPermissao.negada) {
      estado = await widget.camera.pedirCamera();
      if (!mounted) return;
      setState(() => _permissaoDaCamera = estado);
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

  Future<void> _abrirOsAjustes() => widget.camera.abrirAjustesDoSistema();

  /// A foto escolhida **JA SOBE**, e a previa aparece antes de o servidor
  /// dizer qualquer coisa.
  ///
  /// Padrao decidido pelo cliente em 19/10/2026: *"quando o usuario fizer o
  /// upload de qualquer foto no app, voce deve fazer o upload e apresentar
  /// como vai ficar de preview, e ao salvar o voce salva a foto"*.
  ///
  /// **HEIC ENTRA AQUI**, e esta e a diferenca em relacao a capa do evento:
  /// `ShowcasePhotoIntentInput.content_type` declara
  /// `[image/jpeg, image/png, image/heic, image/webp]`, com a razao escrita no
  /// contrato -- *"a vitrine sai de um CELULAR, e foto de iPhone e HEIC;
  /// recusa-lo na entrada tiraria a vitrine da mao de metade dos aparelhos"*.
  /// Por isso a lista usada e `tiposDeFotoAceitos`, e nao
  /// `tiposDeFotoAceitosSemHeic`.
  ///
  /// **Trocar de foto antes de salvar**: o `upload_id` anterior e descartado
  /// aqui. O objeto do primeiro envio cai no expurgo de dez minutos do
  /// servidor -- nao ha rota de cancelamento de intencao no contrato.
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
    // de proposito: `ShowcasePhotoIntentInput` nao tem campo `purpose`, e e a
    // rota (`POST /v1/me/showcase/photo-intents`) que fixa o `user_showcase`.
    //
    // **E A FUNCAO E A DA VITRINE, conferida aqui por escrito.** O defeito
    // consertado em 19/10 era exatamente este: a vitrine chamando o
    // registrador de capa de encontro e gravando `network_event` numa foto de
    // pessoa. As duas funcoes tem assinatura identica e a troca COMPILA.
    // Medido contra a homologacao em 19/10/2026: a intencao desta rota nasce
    // em `people/original/jhA9w3MKgA3cK5NpPp72ag` e a derivada da grade sai em
    // `https://img-hml.bichu.app/people/thumb/...` -- o prefixo `people/` e a
    // cara do `user_showcase`, e o da capa e `events/`.
    //
    // **`FotoDaVitrine` NAO e usada aqui, e a ausencia e deliberada.** Ela
    // tambem nao confirma nada (`confirmar` vazio), mas ela nao GUARDA o
    // `upload_id` -- e sem ele a tela nao tem o que mandar no `PUT`.
    final destino = EnvioParaConfirmarDepois(
      pedir: widget.escrita.intencaoDeFotoDaVitrine,
    );
    final desfecho = await widget.envio.enviar(foto: foto, destino: destino);
    if (!mounted) return;

    setState(() {
      _enviando = false;
      switch (desfecho) {
        case DesfechoDoEnvio.enviada:
          _uploadPendente = destino.uploadId;
          _confirmacao = VitrineDeFotosDoUsuario.fotoProntaParaSalvar;
        case DesfechoDoEnvio.semSinal:
          // **A previa SAI quando o envio falha**: o `Salvar` nao teria o que
          // gravar, e manter um retrato na tela depois de um envio que nao
          // aconteceu e a tela prometendo uma foto que nao existe.
          _escolhida = null;
          _faixa = const MensagemDeErro(
            texto: VitrineDeFotosDoUsuario.fotoSemSinal,
          );
        case DesfechoDoEnvio.recusada:
          _escolhida = null;
          _faixa = const MensagemDeErro(
            texto: VitrineDeFotosDoUsuario.fotoRecusada,
          );
      }
    });
    if (!mounted) return;
    anunciar(
      context,
      desfecho == DesfechoDoEnvio.enviada
          ? VitrineDeFotosDoUsuario.fotoProntaParaSalvar
          : (_faixa?.texto ?? ''),
    );
  }

  /// O `Salvar`: a foto pendente **entra na vitrine**.
  ///
  /// ## A escrita e DECLARATIVA, e e por isso que as fotos que ja estao vao
  /// junto
  ///
  /// `PUT /me/showcase` manda a vitrine INTEIRA, na ordem: `photos: []` tira
  /// todas. Mandar so a foto nova apagaria as outras oito -- e o teste que
  /// medisse "a foto nova esta na resposta" ficaria verde nisso.
  ///
  /// **A foto nova vai no FIM**, e nao no comeco: a posicao 0 e a capa, e
  /// acrescentar nao e trocar a capa. Quem quiser trocar reordena, que e a
  /// outra funcao do mesmo `PUT` e nao e desta entrega.
  ///
  /// **A foto sem `upload_id` e descartada da lista**, e isso e o contrato e
  /// nao descuido: `ShowcasePhotoLida.uploadId` fica nulo depois que o
  /// varredor apagou a intencao, e `ShowcasePhotoInput.upload_id` e
  /// obrigatorio. Mandar nulo e um `400` que apagaria a vitrine inteira pela
  /// metade.
  ///
  /// **E a CONFIRMACAO da intencao e esta gravacao**, na mesma transacao do
  /// servidor -- nao ha operacao de confirmacao separada no contrato. Sem ela
  /// a varredura de vencidos apagaria a foto dez minutos depois, que foi o que
  /// aconteceu com a foto do achado.
  Future<void> _salvar() async {
    final pendente = _uploadPendente;
    if (pendente == null) return;

    setState(() {
      _salvando = true;
      _faixa = null;
      _confirmacao = null;
    });

    final jaEstao = (_vitrine?.fotos ?? const <FotoDaVitrineLida>[])
        .where((f) => f.uploadId != null)
        .map(
          (f) => FotoPedida(
            uploadId: f.uploadId!,
            textoAlternativo: f.textoAlternativo,
          ),
        )
        .toList();

    try {
      final vitrine = await widget.escrita.substituir(<FotoPedida>[
        ...jaEstao,
        FotoPedida(uploadId: pendente),
      ]);
      if (!mounted) return;
      setState(() {
        _vitrine = vitrine;
        _escolhida = null;
        _uploadPendente = null;
        _salvando = false;
        _confirmacao = VitrineDeFotosDoUsuario.fotoSalva;
      });
      if (!mounted) return;
      anunciar(context, VitrineDeFotosDoUsuario.fotoSalva);
    } on FalhaDeChamada catch (falha) {
      if (!mounted) return;
      // **A previa e o `upload_id` FICAM**: o envio aconteceu, e tentar de
      // novo e so o `PUT`. Limpar aqui faria a pessoa escolher e subir a foto
      // outra vez por uma falha que nao foi dela.
      final mensagem = MensagensDeErro.de(falha);
      setState(() {
        _salvando = false;
        _faixa = mensagem;
      });
      if (!mounted) return;
      anunciar(context, mensagem.texto);
    }
  }

  Future<void> _carregar() async {
    setState(() {
      _carregando = true;
      _falha = null;
      _faltaConta = false;
    });
    try {
      final vitrine = await widget.api.minhaVitrine();
      if (!mounted) return;
      setState(() {
        _vitrine = vitrine;
        _carregando = false;
      });
    } on FalhaDeChamada catch (falha) {
      if (!mounted) return;
      setState(() {
        // Falha NAO vira vitrine vazia: "ainda nao ha foto" e "nao deu para
        // carregar" sao coisas diferentes, e a segunda tem botao de tentar de
        // novo. Mostrar o vazio no lugar do erro faria a pessoa achar que as
        // fotos dela sumiram.
        // **O 401 DEIXAVA ESTA TELA SEM FRASE NENHUMA.** O catalogo devolve
        // `texto: ''` para `unauthenticated` desde 18/10, e `_erro` desenhava
        // esse vazio seguido de um `Tentar de novo` -- um botao solto embaixo
        // de nada. Medido: `/v1/me/showcase` responde `401 unauthenticated`
        // com `next_action: sign_in`.
        _faltaConta = faltaConta(falha);
        _falha = MensagensDeErro.de(falha).texto;
        _carregando = false;
      });
    }
  }

  @override
  Widget build(BuildContext context) {
    final cores = BichuColors.of(context).cores;
    final textos = Theme.of(context).textTheme;

    return Scaffold(
      appBar: AppBar(title: const Text(VitrineDeFotosDoUsuario.tituloDaTela)),
      // O ARRASTAR-PARA-ATUALIZAR (cliente, 18/10/2026): *"Crie uma acao no
      // aplicativo de atualizar a pagina conforme o usuario puxa a pagina para
      // baixo"*. Por `ArrastarParaAtualizar`, o ponto unico do app -- nenhum
      // `RefreshIndicator` cru em tela nenhuma. A funcao e a MESMA do
      // `Tentar de novo` da faixa.
      body: SafeArea(
        child: ArrastarParaAtualizar(
          aoAtualizar: _carregar,
          child: ListView(
            padding: const EdgeInsets.all(BichuEspaco.e4),
            children: [
            // A ORIENTACAO DE TAMANHO, uma linha, VISIVEL NA TELA e antes de
            // qualquer envio — o cliente pediu expressamente. Ela vem de
            // `orientacaoDeTamanhoDaImagem`, o ponto unico: o teto de 5 MB
            // tambem vale na politica assinada e no servidor, e um texto
            // proprio aqui seria o segundo numero que divergiria do primeiro.
            Text(
              orientacaoDeTamanhoDaImagem,
              style: textos.bodySmall?.copyWith(color: cores.textSecondary),
            ),
            const SizedBox(height: BichuEspaco.e4),
            if (_carregando)
              const Center(child: Padding(padding: EdgeInsets.all(BichuEspaco.e4), child: CircularProgressIndicator()))
            // SEM CONTA NAO E ERRO. Ver `widgets/convite_para_entrar.dart`.
            else if (_faltaConta)
              const ConviteParaEntrar(secao: SecaoComConta.minhasFotos)
            else if (_falha != null)
              _erro(_falha!, cores, textos)
            else ...<Widget>[
              _grade(_vitrine, cores, textos),
              const SizedBox(height: BichuEspaco.e4),
              // O CONTROLE DE ADICIONAR, que a tela NAO TINHA ate 19/10/2026.
              // Ele fica depois da grade porque e o que se faz com a grade na
              // tela: a ordem de leitura entrega o que ja existe antes do que
              // acrescenta.
              _bloco(cores, textos),
            ],
            if (widget.aoAbrirMeusPets != null) ...[
              const SizedBox(height: BichuEspaco.e4),
              _atalhoDosPets(cores, textos),
            ],
          ],
        ),
        ),
      ),
    );
  }

  /// O bloco de acrescentar: previa, recado, os dois botoes e o `Salvar`.
  ///
  /// **Com a vitrine CHEIA nao ha botao nenhum**, e isso e o contrato e nao
  /// zelo: com nove fotos `createShowcasePhotoUploadIntent` responde `400` em
  /// vez de assinar, com a razao escrita -- *"assinar a decima seria entregar
  /// autorizacao de escrita que a vitrine nunca vai aceitar, e o objeto
  /// ficaria no balde ate o varredor passar"*. Um botao que leva a `400` e um
  /// botao que promete.
  Widget _bloco(BichuCores cores, TextTheme textos) {
    final vitrine = _vitrine;
    final cheia = vitrine != null && vitrine.estaCheia && _uploadPendente == null;
    final local = _escolhida;

    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: <Widget>[
        if (_faixa != null) ...<Widget>[
          FaixaDeAviso(
            texto: _faixa!.texto,
            rotuloDaAcao: _faixa!.acao,
            aoTocarNaAcao: saidaDaMensagem(context, _faixa!),
          ),
          const SizedBox(height: BichuEspaco.e3),
        ],
        if (_confirmacao != null) ...<Widget>[
          FaixaDeAviso(
            peso: PesoDaFaixa.informativo,
            texto: _confirmacao!,
          ),
          const SizedBox(height: BichuEspaco.e3),
        ],
        if (cheia)
          FaixaDeAviso(
            peso: PesoDaFaixa.informativo,
            // O numero sai da RESPOSTA, e nao de uma constante da tela.
            texto: VitrineDeFotosDoUsuario.vitrineCheia(vitrine.teto),
          )
        else ...<Widget>[
          if (local != null || _enviando) ...<Widget>[
            ClipRRect(
              borderRadius: BorderRadius.circular(BichuRaio.lg),
              child: SizedBox(
                height: _alturaDaPrevia,
                width: double.infinity,
                child: local != null
                    // `PreviaDaFoto` porque desenhar arquivo do aparelho pede
                    // `dart:io`, proibido dentro de `lib/telas` pelo portao de
                    // diretivas -- e ela ja pede `cacheWidth` ao
                    // decodificador. **Nunca `Image.file` cru.**
                    ? PreviaDaFoto(
                        foto: local,
                        descricao: VitrineDeFotosDoUsuario.aFotoEscolhida,
                        altura: _alturaDaPrevia,
                      )
                    : const Center(child: CircularProgressIndicator()),
              ),
            ),
            const SizedBox(height: BichuEspaco.e3),
          ],
          if (_permissaoDaCamera ==
              EstadoDaPermissao.negadaPermanentemente) ...<Widget>[
            FaixaDeAviso(
              peso: PesoDaFaixa.informativo,
              texto: VitrineDeFotosDoUsuario.cameraNosAjustes,
              rotuloDaAcao: VitrineDeFotosDoUsuario.abrirAjustes,
              aoTocarNaAcao: _abrirOsAjustes,
            ),
            const SizedBox(height: BichuEspaco.e3),
          ],
          // **Sem camera o botao SOME**: um botao que nao leva a nada e pior
          // que a ausencia dele. A galeria continua, e ela nao tem estado de
          // permissao proprio (ver `CameraDoAparelho`).
          if (_permissaoDaCamera != EstadoDaPermissao.indisponivel) ...<Widget>[
            BotaoSecundario(
              rotulo: VitrineDeFotosDoUsuario.tirarFoto,
              aoTocar: _enviando || _salvando ? null : _tirarFoto,
            ),
            const SizedBox(height: BichuEspaco.e2),
          ],
          OutlinedButton(
            onPressed: _enviando || _salvando ? null : _escolherDaGaleria,
            style: OutlinedButton.styleFrom(
              minimumSize: const Size.fromHeight(BichuAlvoDeToque.min),
            ),
            child: const Text(VitrineDeFotosDoUsuario.escolherDaGaleria),
          ),
          // **O `Salvar` so existe quando ha o que salvar**, e ele e o UNICO
          // botao primario desta tela. Nao e um "salvar foto" ao lado de um
          // outro salvar: a tela nao tem formulario, e este e o salvar dela.
          if (_uploadPendente != null) ...<Widget>[
            const SizedBox(height: BichuEspaco.e3),
            BotaoPrimario(
              rotulo: VitrineDeFotosDoUsuario.salvar,
              carregando: _salvando,
              aoTocar: _salvando ? null : _salvar,
            ),
          ],
        ],
      ],
    );
  }

  /// A altura da previa. Mais alta que a celula da grade de proposito: a
  /// previa existe para a pessoa ver a foto que escolheu, e 104 dp nao mostram
  /// uma foto -- mostram uma miniatura dela.
  static const double _alturaDaPrevia = 220;

  Widget _erro(String mensagem, BichuCores cores, TextTheme textos) {
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Text(mensagem, style: textos.bodyMedium?.copyWith(color: cores.textPrimary)),
        const SizedBox(height: BichuEspaco.e2),
        TextButton(onPressed: _carregar, child: const Text('Tentar de novo')),
      ],
    );
  }

  Widget _grade(Vitrine? vitrine, BichuCores cores, TextTheme textos) {
    final fotos = vitrine?.fotos ?? const <FotoDaVitrineLida>[];
    if (fotos.isEmpty) {
      return Semantics(
        label: VitrineDeFotosDoUsuario.textoDoVazio,
        child: Container(
          width: double.infinity,
          padding: const EdgeInsets.all(BichuEspaco.e4),
          decoration: BoxDecoration(
            color: cores.surfaceSunken,
            borderRadius: BorderRadius.circular(BichuRaio.lg),
            border: Border.all(color: cores.outline, width: BichuBorda.hairline),
          ),
          child: Text(
            VitrineDeFotosDoUsuario.textoDoVazio,
            textAlign: TextAlign.center,
            style: textos.bodyMedium?.copyWith(color: cores.textSecondary),
          ),
        ),
      );
    }

    // `shrinkWrap` porque a grade mora dentro de um `ListView`: ate nove
    // celulas nao justificam uma area de rolagem propria, e duas areas de
    // rolagem encaixadas e o que faz o gesto da pessoa ir para a errada.
    return GridView.builder(
      shrinkWrap: true,
      physics: const NeverScrollableScrollPhysics(),
      padding: EdgeInsets.zero,
      itemCount: fotos.length,
      gridDelegate: const SliverGridDelegateWithMaxCrossAxisExtent(
        maxCrossAxisExtent: VitrineDeFotosDoUsuario.ladoDaCelula,
        mainAxisSpacing: VitrineDeFotosDoUsuario.vaoDaGrade,
        crossAxisSpacing: VitrineDeFotosDoUsuario.vaoDaGrade,
        // 1:1. A derivada da grade e quadrada e cortada na origem, entao a
        // celula tem a mesma proporcao e nao sobra faixa vazia.
        childAspectRatio: 1,
      ),
      itemBuilder: (context, indice) => _celula(fotos[indice], cores, textos),
    );
  }

  /// Uma celula da grade, **tocavel quando ha a foto ABERTA**.
  ///
  /// ## A derivada da foto aberta existia desde antes da tela que a abre
  ///
  /// `DERIVADAS_DA_VITRINE_DO_USUARIO` declara `card` 1024 x 1024 e a
  /// descreve, por escrito, como *"a foto ABERTA, que e a unica que a pessoa
  /// olha grande, e portanto a unica que mira a faixa de 300-500 KB"*. O
  /// contrato a entrega em `open_url`, e `FotoDaVitrineLida.urlAberta` a
  /// decodifica desde que o modelo existe.
  ///
  /// **E nenhuma celula tinha `onTap`.** O app baixava 320 px para a grade,
  /// guardava 1024 px no balde, e nao havia gesto que os mostrasse. Medido em
  /// 20/10/2026, ao procurar visualizador para reusar no evento: nao havia
  /// visualizador NENHUM no app -- nem `InteractiveViewer`, nem `photo_view`,
  /// nem `Hero`, nem um `onDoubleTap`.
  ///
  /// Agora ha um, em `widgets/visualizador_de_imagem.dart`, e foi posto em
  /// `widgets/` exactamente para esta segunda superficie nao o duplicar.
  ///
  /// ## Celula SEM foto nao oferece toque
  ///
  /// `processing` e `rejected` nao tem `open_url`, e a celula desenha o
  /// ESTADO em texto. Envolve-la num `InkWell` faria um quadrado que pinta
  /// respingo, se anuncia como botao e abre uma tela preta. A guarda e a
  /// ausencia da URL, e nao o enum: `ready` sem derivada e estado possivel.
  Widget _celula(FotoDaVitrineLida foto, BichuCores cores, TextTheme textos) {
    final moldura = BoxDecoration(
      color: cores.surfaceSunken,
      borderRadius: BorderRadius.circular(BichuRaio.sm),
    );

    final conteudo = ClipRRect(
      borderRadius: BorderRadius.circular(BichuRaio.sm),
      child: Stack(
        fit: StackFit.expand,
        children: [
          DecoratedBox(
            decoration: moldura,
            child: _imagemDaCelula(foto, cores, textos),
          ),
          // A CAPA, marcada. `position: 0` e a capa, e reordenar troca a capa:
          // o rotulo sai da ORDEM e nao de um campo proprio, que divergiria
          // dela na primeira reordenacao.
          if (foto.ehCapa)
            Positioned(
              left: BichuEspaco.e1,
              bottom: BichuEspaco.e1,
              child: Container(
                padding: const EdgeInsets.symmetric(
                  horizontal: BichuEspaco.e1,
                  vertical: 2,
                ),
                decoration: BoxDecoration(
                  color: cores.surface,
                  borderRadius: BorderRadius.circular(BichuRaio.sm),
                ),
                child: Text(
                  VitrineDeFotosDoUsuario.rotuloDaCapa,
                  style: textos.labelSmall?.copyWith(color: cores.textPrimary),
                ),
              ),
            ),
        ],
      ),
    );

    final aberta = foto.urlAberta;
    if (aberta == null || aberta.isEmpty) return conteudo;

    // **SEM `excludeSemantics`, ao contrario da capa do evento**, e a
    // diferenca e de conteudo e nao de gosto: ali dentro ha DOIS nos que
    // valem -- o texto alternativo da foto e o rotulo `Capa` --, e excluir
    // calaria o segundo. O `Semantics` daqui so acrescenta a FUNCAO (botao) e
    // a ACAO (`hint`); o NOME continua vindo de dentro.
    return Semantics(
      button: true,
      hint: VitrineDeFotosDoUsuario.dicaDeAmpliar,
      child: InkWell(
        borderRadius: BorderRadius.circular(BichuRaio.sm),
        onTap: () => VisualizadorDeImagem.abrir(
          context,
          url: aberta,
          textoAlternativo: foto.textoAlternativo,
        ),
        child: conteudo,
      ),
    );
  }

  Widget _imagemDaCelula(FotoDaVitrineLida foto, BichuCores cores, TextTheme textos) {
    final endereco = foto.urlDaGrade;

    // Sem derivada ainda (`processing`) ou recusada: a celula diz o estado em
    // vez de prometer uma imagem que nao vem. O motivo da recusa SAI na tela --
    // sem ele a pessoa le "recusada" e nao tem como consertar.
    if (endereco == null || endereco.isEmpty) {
      final recado = foto.estado == EstadoDaFoto.recusada
          ? (foto.motivoDaRecusa ?? VitrineDeFotosDoUsuario.recadoDeFotoQueNaoAbriu)
          : 'Preparando…';
      return Center(
        child: Padding(
          padding: const EdgeInsets.all(BichuEspaco.e1),
          child: Text(
            recado,
            textAlign: TextAlign.center,
            style: textos.labelSmall?.copyWith(color: cores.textSecondary),
          ),
        ),
      );
    }

    // `ImagemDaRede`, e NAO um `Image.network` proprio. Ela ja faz as duas
    // coisas que decidem o peso desta tela -- `cacheWidth` pela largura que a
    // celula REALMENTE pinta, e `errorBuilder` sempre -- e mora fora de
    // `lib/telas`, onde `dart:io` e proibido. Reescrever aqui seria a segunda
    // definicao de "como o app desenha imagem de servidor", e a segunda e a
    // que esquece o `cacheWidth` na primeira edicao.
    //
    // `proporcao: 1` porque a derivada da grade e QUADRADA e cortada na origem
    // (320 x 320): a celula tem a mesma proporcao e nao sobra faixa vazia.
    return ImagemDaRede(
      url: endereco,
      descricao: foto.textoAlternativo,
      raio: BichuRaio.sm,
      // O retrato de uma pessoa falhando pede outro desenho que uma fachada
      // falhando, e e por isso que este simbolo e parametro.
      simboloDeFalha: Icons.photo_outlined,
    );
  }

  Widget _atalhoDosPets(BichuCores cores, TextTheme textos) {
    // REFERENCIA, e nao inclusao. A foto do pet mora em `pet_photos` e tem o
    // ciclo de vida do cadastro do animal; a vitrine aponta para a pagina dele.
    return InkWell(
      onTap: widget.aoAbrirMeusPets,
      child: Padding(
        padding: const EdgeInsets.symmetric(vertical: BichuEspaco.e2),
        child: Row(
          children: [
            Expanded(
              child: Text(
                'As fotos dos seus pets ficam na página de cada um.',
                style: textos.bodySmall?.copyWith(color: cores.textSecondary),
              ),
            ),
            const Icon(Icons.chevron_right),
          ],
        ),
      ),
    );
  }
}
