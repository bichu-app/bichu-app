import 'package:flutter/material.dart';
import 'package:flutter_localizations/flutter_localizations.dart';
import 'package:go_router/go_router.dart';
import 'package:http/http.dart' as http;

import 'api/api_client.dart';
import 'api/auth_api.dart';
import 'api/casos_api.dart';
import 'api/devices_api.dart';
import 'api/fila_offline.dart';
import 'api/imagem_do_qr.dart';
import 'api/pets_api.dart';
import 'config/app_config.dart';
import 'dispositivo/avisos.dart';
import 'dispositivo/camera_e_galeria.dart';
import 'dispositivo/oportunidades_de_aviso.dart';
import 'sessao/registro_do_aviso_de_cadastro.dart';
import 'dispositivo/vigia_de_aviso.dart';
import 'dispositivo/leitor_de_qr.dart';
import 'dispositivo/localizacao.dart';
import 'escopo.dart';
import 'intencao/cadastro_de_pet_como_intencao.dart';
import 'intencao/caso_de_perdido_como_intencao.dart';
import 'intencao/deposito_de_intencao.dart';
import 'intencao/guarda_de_acao.dart';
import 'intencao/intencao_pendente.dart';
import 'roteamento/rotas.dart';
import 'sessao/controlador_de_sessao.dart';
import 'sessao/deposito_de_sessao.dart';
import 'telas/perfil/meus_pets.dart';
import 'theme/bichu_theme.dart';

/// A raiz do app.
class BichuApp extends StatefulWidget {
  const BichuApp({
    required this.config,
    super.key,
    this.deposito,
    this.clienteHttp,
    this.camera,
    this.leitorDeQr,
    this.avisos,
    this.localizacao,
    this.depositoDeIntencao,
    this.cacheDeMeusPets,
    this.cofreDoQr,
    this.depositoDeOportunidades,
    this.depositoDoAvisoDeCadastro,
    this.agora,
    this.depositoDaFila,
  });

  final AppConfig config;

  /// Injetavel para teste. Em producao e o chaveiro do sistema.
  final DepositoDeSessao? deposito;

  /// Injetavel para teste. Em producao e o cliente HTTP do proprio pacote.
  ///
  /// Existe para que o teste de widget exercite o caminho inteiro: tela,
  /// `AuthApi`, `ApiClient` e a traducao de `Problem`. Um teste que so chama a
  /// funcao de mensagem nao pega o defeito de a tela **parar de usa-la**, e e
  /// esse defeito que volta calado numa refatoracao.
  final http.Client? clienteHttp;

  /// Injetavel para teste. Em producao e [CameraDoAparelho] desde a
  /// BICHUS-161.
  ///
  /// O padrao **era** [CameraNaoEmbarcada], porque nenhum plugin de camera
  /// tinha entrado no `pubspec.yaml`. Entraram o `image_picker` e o
  /// `permission_handler`, e a troca acontece aqui e em lugar nenhum mais:
  /// nenhuma tela do assistente de cadastro mudou de codigo, que era o
  /// criterio 10 daquela historia.
  ///
  /// Os testes continuam passando a camera por parametro (ver
  /// `test/telas/ajuda_de_tela.dart`), entao nenhum caso de widget encosta num
  /// canal de plataforma. Os que montam o app sem passar nada recebem a
  /// implementacao real, que responde `indisponivel` sem canal -- e essa e a
  /// resposta certa num ambiente sem aparelho, nao um remendo.
  final CameraEGaleria? camera;

  /// Injetavel para teste. Em producao e [LeitorDeQrDoAparelho] desde a
  /// BICHUS-54.
  ///
  /// A troca acontece **aqui e em lugar nenhum mais**, igual a da camera na
  /// BICHUS-161. Em teste de widget nao ha canal de plataforma, e a
  /// implementacao real responde `embarcado == false` ali -- que e a resposta
  /// certa, e nao um remendo. Os casos que precisam de uma leitura passam o
  /// duble de `test/telas/ajuda_de_tela.dart`.
  final LeitorDeQr? leitorDeQr;

  /// Injetavel para teste. Em producao e [AvisosPorFirebase] quando o `main()`
  /// conseguiu inicializar o Firebase, e [AvisosNaoEmbarcados] quando nao.
  ///
  /// O padrao aqui e [AvisosNaoEmbarcados] de proposito: teste de widget nao
  /// tem canal de plataforma ligado, e um `FirebaseMessaging.instance` no
  /// caminho travaria a suite inteira num `Future` que nunca resolve.
  final Avisos? avisos;

  /// Injetavel para teste. Em producao e [LocalizacaoPorGeolocator].
  ///
  /// O padrao e [LocalizacaoNaoEmbarcada] de proposito, e a razao e mais forte
  /// que a dos avisos: `Geolocator.checkPermission()` num ambiente sem canal
  /// de plataforma lanca `MissingPluginException`, e ela cairia no meio de um
  /// `Future` dentro de `setState` -- que e o formato de falha que nao aponta
  /// para a causa. Com o padrao ausente, a suite exercita os cinco motivos de
  /// nao haver ponto sem tocar em canal nenhum.
  final Localizacao? localizacao;

  /// Injetavel para teste. Em producao e um arquivo no diretorio do app.
  ///
  /// O envelope de intencao (UX 8.3) precisa sobreviver ao app ser **encerrado
  /// pelo sistema**, e por isso mora em disco. O teste de widget nao tem disco
  /// de aparelho, e por isso ele entra por aqui -- do mesmo jeito que o
  /// deposito de sessao.
  final DepositoDaIntencao? depositoDeIntencao;

  /// Injetavel para teste. Em producao nasce vazio a cada arranque, porque e
  /// cache de memoria e nao de disco.
  ///
  /// Entra por aqui para que o caso do criterio 7 da BICHUS-62 -- cache quente
  /// e atualizacao que falha -- seja exercitavel sem depender de duas idas ao
  /// servidor em sequencia.
  final CacheDeMeusPets? cacheDeMeusPets;

  /// Injetavel para teste, pelo mesmo motivo do [cacheDeMeusPets]: um caso
  /// precisa conseguir OLHAR dentro dele depois do logout, e o que ele guarda
  /// e uma credencial.
  final CofreDaImagemDoQr? cofreDoQr;

  /// Onde o registro das duas oportunidades mora (BICHUS-24).
  ///
  /// Injetavel pelo mesmo motivo do envelope de intencao: o padrao e um
  /// arquivo no diretorio do app, e `getApplicationDocumentsDirectory()` e um
  /// canal de plataforma que nao existe em teste de widget. Sem esta injecao
  /// qualquer caso que chegue a F1.6 travaria sem mensagem, esperando um
  /// `Future` que nunca resolve.
  ///
  /// **E tambem o unico jeito de um caso provar o limite de duas.** Ele
  /// precisa montar o app com uma oportunidade JA gasta, que e o estado de
  /// quem cadastrou um pet ontem -- e nenhum teste consegue produzir isso
  /// passando pelo fluxo duas vezes, porque cada `pumpWidget` e um app novo.
  final DepositoDeOportunidades? depositoDeOportunidades;

  /// Onde o registro de dispensas do aviso persistente mora (BICHUS-75).
  ///
  /// Entra por aqui pelos mesmos dois motivos do registro de oportunidades: o
  /// padrao e um arquivo, e `getApplicationDocumentsDirectory()` trava o
  /// `pumpAndSettle` para sempre em teste de widget.
  final DepositoDoAvisoDeCadastro? depositoDoAvisoDeCadastro;

  /// O relogio do ciclo de 7 dias do criterio 4 da BICHUS-75.
  ///
  /// **Entra pela porta, e a razao esta escrita no refinamento de 17/09:** "o
  /// ciclo de 7 dias nao e observavel em treze dias sem relogio injetavel". Um
  /// `DateTime.now()` dentro do registro tornaria o criterio 4 uma frase --
  /// verdadeira ou falsa, ninguem saberia antes do oitavo dia de producao.
  final DateTime Function()? agora;
  /// Injetavel para teste. Em producao e um arquivo no diretorio do app.
  ///
  /// Entra por aqui pela mesma razao do [depositoDeIntencao], e com o mesmo
  /// sintoma quando falta: `DepositoEmArquivo` chama
  /// `getApplicationDocumentsDirectory()`, um canal de plataforma que nao
  /// existe em teste de widget. Sem esta injecao, qualquer caso que faca a
  /// tela ENFILEIRAR trava para sempre e sem mensagem -- o `pumpAndSettle`
  /// espera um `Future` que nunca resolve.
  final DepositoDaFila? depositoDaFila;

  @override
  State<BichuApp> createState() => _BichuAppState();
}

class _BichuAppState extends State<BichuApp> {
  late final ApiClient _api;
  late final AuthApi _auth;
  late final PetsApi _pets;
  late final CasosApi _casos;
  late final FilaOffline _fila;
  late final TagsApi _tags;
  late final DevicesApi _devices;
  late final CameraEGaleria _camera;
  late final LeitorDeQr _leitorDeQr;
  late final Avisos _avisos;
  late final Localizacao _localizacao;
  late final ControladorDeSessao _sessao;
  late final GuardaDeAcao _guarda;
  late final GoRouter _roteador;
  late final CacheDeMeusPets _cacheDeMeusPets;
  late final CofreDaImagemDoQr _cofreDoQr;
  late final OportunidadesDeAviso _oportunidades;
  late final AvisoDeCadastro _avisoDeCadastro;
  late final VigiaDeAviso _vigiaDeAviso;

  @override
  void initState() {
    super.initState();
    // O cliente pergunta o token ao controlador a cada chamada, em vez de
    // receber uma copia: assim a renovacao chega a requisicao seguinte sem
    // ninguem precisar reconstruir o cliente.
    _cacheDeMeusPets = widget.cacheDeMeusPets ?? CacheDeMeusPets();
    _cofreDoQr = widget.cofreDoQr ?? CofreDaImagemDoQr();
    _api = ApiClient(
      config: widget.config,
      cliente: widget.clienteHttp,
      tokenDeAcesso: () => _sessao.tokenValido(),
    );
    _auth = AuthApi(_api);
    _pets = PetsApi(_api);
    _casos = CasosApi(_api);
    // A FILA, LIGADA (BICHUS-21). Ela existia em `lib/` desde a BICHUS-31 e
    // nada no app a construia: o criterio 6 desta historia -- "sem conexao a
    // tela inteira funciona: o envio acontece em F3.2" -- so e verdade com
    // ela em pe. UMA instancia no app inteiro: duas sobre o mesmo arquivo
    // guardariam listas diferentes em memoria e uma sobrescreveria a outra.
    _fila = FilaOffline(
      deposito: widget.depositoDaFila ?? DepositoEmArquivo(),
    );
    _tags = TagsApi(_api);
    _devices = DevicesApi(_api);
    _camera = widget.camera ?? const CameraDoAparelho();
    _leitorDeQr = widget.leitorDeQr ?? const LeitorDeQrDoAparelho();
    _avisos = widget.avisos ?? const AvisosNaoEmbarcados();
    _oportunidades = OportunidadesDeAviso(
      deposito: widget.depositoDeOportunidades ??
          DepositoDeOportunidadesEmArquivo(),
    );
    _avisoDeCadastro = AvisoDeCadastro(
      deposito: widget.depositoDoAvisoDeCadastro ?? DepositoDoAvisoEmArquivo(),
      agora: widget.agora ?? DateTime.now,
    );
    _vigiaDeAviso = VigiaDeAviso(avisos: _avisos, devices: _devices)..ligar();
    _localizacao = widget.localizacao ?? const LocalizacaoNaoEmbarcada();
    _guarda = GuardaDeAcao(
      deposito: widget.depositoDeIntencao ?? DepositoDeIntencaoEmArquivo(),
      rotaDaTela: Rotas.rotaDaTelaDeUx,
      // O registro das acoes executaveis. Hoje ha uma: `cadastrar_pet` e a
      // unica das seis de 8.3 cujo fluxo inteiro existe neste build. As outras
      // entram aqui junto com as telas delas -- e, ate entrarem, uma intencao
      // guardada para elas volta para a tela de retorno em vez de sumir.
      acoes: <AcaoDeIntencao, AcaoExecutavel>{
        AcaoDeIntencao.cadastrarPet: cadastroDePetExecutavel(_pets),
        // `marcar_perdido` e a SEGUNDA acao executavel deste build. O criterio
        // 7 da BICHUS-21 e o que ela cumpre: depois de autenticar, o caso e
        // CRIADO e a pessoa cai em F3.3 -- nunca no formulario de novo e nunca
        // na home.
        AcaoDeIntencao.marcarPerdido: casoDePerdidoExecutavel(_pets, _casos),
      },
    );
    _sessao = ControladorDeSessao(
      auth: _auth,
      deposito: widget.deposito ?? DepositoNoChaveiro(),
      // Sair da conta apaga o envelope (regra 7 de 8.3).
      guardaDeAcao: _guarda,
      // O cache de `Perfil` > `Meus pets` morre junto com a sessao, nos QUATRO
      // desfechos de `sair()` -- inclusive o que nao passa por botao nenhum: a
      // sessao derrubada por refresh recusado (401 em `_renovar`). Enquanto a
      // limpeza morava no `onPressed` de `abas.dart`, esse caminho deixava os
      // pets da conta anterior em memoria para quem entrasse depois no mesmo
      // aparelho. E a isca `SEG` da BICHUS-62 chegando pela porta de tras.
      //
      // Esta e a fiacao que a BICHUS-164 nao tinha como fazer: `LimpezaAoSair`
      // nasceu na BICHUS-81 (`a84a286`) e nao existia na base daquele branch.
      //
      // O `limpar` e sincrono e `LimpezaAoSair` devolve `Future<void>`, entao
      // o tear-off direto nao tipa (`void` nao e subtipo de `Future<void>`).
      // O fecho `async` e o que a lista pede, e nao um adiamento.
      // A imagem do QR entra na MESMA lista, e pelo mesmo motivo (BICHUS-229).
      // Ela carrega o codigo da tag dentro dos pixels e cai no cache global de
      // imagem do Flutter, que nao tem nocao de sessao: descartar a tela tira a
      // referencia viva e DEIXA a entrada no cache. Limpar no `dispose` da tela
      // repetiria o defeito do `cacheDeMeusPets` -- a sessao derrubada por
      // refresh recusado nao passa por tela nenhuma.
      //
      // O QUE **NAO** ENTRA NESTA LISTA, e por que (BICHUS-24): o registro das
      // duas oportunidades de aviso (`OportunidadesDeAviso`). Esta lista e do
      // que e da CONTA -- dado e credencial de uma pessoa, que nao podem vazar
      // para a proxima que entrar neste aparelho. O registro das oportunidades
      // e do APARELHO: o dialogo de notificacao do iOS e gasto uma vez por
      // instalacao, nao por login. Limpa-lo aqui daria ao tutor seguinte duas
      // antessalas novas cujo `Sim` abriria um dialogo que o sistema nao mostra
      // mais, e ele ficaria olhando para um botao que nao faz nada. A isca que
      // segura esta decisao esta em
      // `test/dispositivo/oportunidades_de_aviso_test.dart`.
      // A FILA OFFLINE ENTRA NA MESMA LISTA, e e a entrada mais cara de
      // esquecer das tres. O cache de pets e o cofre do QR vivem em MEMORIA:
      // eles morrem com o processo, e o pior caso e a proxima pessoa que
      // entrar na mesma sessao do app. A fila vive em DISCO, e o corpo de cada
      // acao carrega o que a tutora digitou -- nome do pet, endereco de
      // referencia, telefone de contato. Sobrevivendo ao logout, esses dados
      // esperam no aparelho a proxima pessoa que entrar nele, e o aparelho
      // compartilhado e caso real no publico deste produto.
      //
      // `limpar` e assincrono e devolve `Future<void>`, entao o tear-off
      // direto tipa: nao ha fecho aqui porque nao ha nada a adiar.
      limpezasAoSair: <LimpezaAoSair>[
        () async => _cacheDeMeusPets.limpar(),
        _cofreDoQr.limpar,
        _fila.limpar,
        // O REGISTRO DE DISPENSAS DO AVISO PERSISTENTE ENTRA AQUI (BICHUS-75),
        // e a diferenca em relacao ao registro de oportunidades logo acima e a
        // razao de as duas decisoes serem opostas. Aquele e do APARELHO: o
        // dialogo de notificacao do iOS e gasto uma vez por instalacao. Este e
        // da CONTA: ele guarda que a Marina pediu silencio sobre o e-mail DELA.
        //
        // Sem esta linha, o tutor seguinte neste aparelho herdaria o silencio
        // de sete dias comprado pela anterior -- e com tres dispensas herdadas
        // veria de cara "O e-mail <o dele> esta certo?" sobre um endereco que
        // esta certo. A isca esta em
        // `test/sessao/registro_do_aviso_de_cadastro_test.dart`.
        _avisoDeCadastro.limpar,
      ],
    );
    _roteador = criarRoteador(_sessao);
    _sessao.iniciar();
  }

  @override
  void dispose() {
    _vigiaDeAviso.dispose();
    _sessao.dispose();
    _api.fechar();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    return Escopo(
      api: _api,
      auth: _auth,
      pets: _pets,
      casos: _casos,
      fila: _fila,
      tags: _tags,
      devices: _devices,
      camera: _camera,
      leitorDeQr: _leitorDeQr,
      avisos: _avisos,
      oportunidades: _oportunidades,
      vigiaDeAviso: _vigiaDeAviso,
      localizacao: _localizacao,
      sessao: _sessao,
      guarda: _guarda,
      cacheDeMeusPets: _cacheDeMeusPets,
      cofreDoQr: _cofreDoQr,
      avisoDeCadastro: _avisoDeCadastro,
      child: MaterialApp.router(
        title: 'Bichu',
        debugShowCheckedModeBanner: false,
        theme: BichuTheme.claro,
        darkTheme: BichuTheme.escuro,
        // A preferencia de tema e do sistema. A tela do achador e a pagina do
        // QR respeitam essa preferencia, com o ajuste de borda da secao 6.6.
        themeMode: ThemeMode.system,
        // O app e escrito em portugues do Brasil e nao oferece troca de
        // idioma. Sem estes dois campos o Flutter cai no ingles para o que ELE
        // desenha: o tooltip de voltar, o menu de colar do campo de texto e os
        // rotulos que o VoiceOver e o TalkBack leem em Scaffold e Dialog. A
        // tela ficava bilingue e so quem usa leitor de tela percebia.
        localizationsDelegates: GlobalMaterialLocalizations.delegates,
        supportedLocales: const <Locale>[Locale('pt', 'BR')],
        routerConfig: _roteador,
        builder: (context, filho) {
          // Escala de fonte do sistema respeitada ate 200% (SC 1.4.4). O teto
          // existe porque acima disso nenhum layout de celular sobrevive; ele
          // nao e uma trava de estilo, e o limite que a norma pede.
          final escala = MediaQuery.textScalerOf(context).clamp(
            minScaleFactor: 1,
            maxScaleFactor: 2,
          );
          return MediaQuery(
            data: MediaQuery.of(context).copyWith(textScaler: escala),
            child: filho ?? const SizedBox.shrink(),
          );
        },
      ),
    );
  }
}
