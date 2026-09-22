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
    this.avisos,
    this.depositoDeIntencao,
    this.cacheDeMeusPets,
    this.cofreDoQr,
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

  /// Injetavel para teste. Em producao e [AvisosPorFirebase] quando o `main()`
  /// conseguiu inicializar o Firebase, e [AvisosNaoEmbarcados] quando nao.
  ///
  /// O padrao aqui e [AvisosNaoEmbarcados] de proposito: teste de widget nao
  /// tem canal de plataforma ligado, e um `FirebaseMessaging.instance` no
  /// caminho travaria a suite inteira num `Future` que nunca resolve.
  final Avisos? avisos;

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
  late final Avisos _avisos;
  late final ControladorDeSessao _sessao;
  late final GuardaDeAcao _guarda;
  late final GoRouter _roteador;
  late final CacheDeMeusPets _cacheDeMeusPets;
  late final CofreDaImagemDoQr _cofreDoQr;

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
    _avisos = widget.avisos ?? const AvisosNaoEmbarcados();
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
      ],
    );
    _roteador = criarRoteador(_sessao);
    _sessao.iniciar();
  }

  @override
  void dispose() {
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
      avisos: _avisos,
      sessao: _sessao,
      guarda: _guarda,
      cacheDeMeusPets: _cacheDeMeusPets,
      cofreDoQr: _cofreDoQr,
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
