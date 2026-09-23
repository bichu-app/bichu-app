import 'package:flutter/widgets.dart';

import 'api/api_client.dart';
import 'api/auth_api.dart';
import 'api/achados_api.dart';
import 'api/casos_api.dart';
import 'api/devices_api.dart';
import 'api/diretorio_api.dart';
import 'api/envio_de_foto.dart';
import 'api/fotos_pendentes.dart';
import 'api/fila_offline.dart';
import 'api/imagem_do_qr.dart';
import 'api/pets_api.dart';
import 'dispositivo/avisos.dart';
import 'dispositivo/camera_e_galeria.dart';
import 'dispositivo/oportunidades_de_aviso.dart';
import 'sessao/registro_do_aviso_de_cadastro.dart';
import 'dispositivo/vigia_de_aviso.dart';
import 'dispositivo/leitor_de_qr.dart';
import 'dispositivo/localizacao.dart';
import 'intencao/guarda_de_acao.dart';
import 'telas/perfil/meus_pets.dart';
import 'sessao/controlador_de_sessao.dart';

/// As dependencias do app, entregues pela arvore de widgets.
///
/// Sem pacote de injecao: o esqueleto tem tres dependencias, e um
/// `InheritedWidget` resolve isso sem trazer um framework de estado que
/// ninguem precisou escolher ainda. Quando o app crescer, isto e um ponto de
/// troca e nao uma reescrita.
class Escopo extends InheritedWidget {
  const Escopo({
    required this.api,
    required this.auth,
    required this.pets,
    required this.casos,
    required this.diretorio,
    required this.achados,
    required this.envioDeFoto,
    required this.retomadaDeFotos,
    required this.fila,
    required this.tags,
    required this.devices,
    required this.camera,
    required this.leitorDeQr,
    required this.avisos,
    required this.oportunidades,
    required this.vigiaDeAviso,
    required this.localizacao,
    required this.sessao,
    required this.guarda,
    required this.cacheDeMeusPets,
    required this.cofreDoQr,
    required this.avisoDeCadastro,
    required super.child,
    super.key,
  });

  final ApiClient api;
  final AuthApi auth;
  final PetsApi pets;

  /// As rotas de caso de perdido (`tags: [lost]` do contrato).
  final CasosApi casos;

  /// O diretorio de `Perto` (`tags: [directory]` do contrato).
  final DiretorioApi diretorio;

  /// As rotas de achado avulso (`tags: [found]` do contrato), ligadas pela
  /// BICHUS-35.
  final AchadosApi achados;

  /// **O unico caminho de bytes do app** (22/09/2026).
  ///
  /// Fica no escopo, e nao dentro da tela, pelo mesmo motivo do [cofreDoQr] e
  /// com uma razao a mais: ele carrega um cliente HTTP proprio, que existe
  /// para os bytes sairem **sem o token da sessao** para o host que o servidor
  /// nomeou. Um envio construido dentro de cada tela seria um cliente por
  /// tela, e a proxima pessoa passaria o cliente da API "para reaproveitar".
  ///
  /// Um so no app inteiro, e dois consumidores: a foto do pet (F1.6) e a foto
  /// do achado avulso, quando F3.5 existir.
  final EnvioDeFoto envioDeFoto;

  /// O envio da foto **mais o registro do que ficou pendente** (BICHUS-87,
  /// criterios 6 e 7).
  ///
  /// Fica no escopo, e nao na tela, com a mesma razao da fila offline e uma a
  /// mais: o registro vive em DISCO, e duas instancias sobre o mesmo arquivo
  /// guardariam listas diferentes em memoria e uma sobrescreveria a outra. A
  /// limpeza dele esta em `limpezasAoSair`, no `app.dart`.
  final RetomadaDeFotos retomadaDeFotos;

  /// A fila de acoes sem conexao (BICHUS-31), **ligada pela BICHUS-21**.
  ///
  /// Ela vive no escopo e nao dentro da tela de F3.2 pela mesma razao do
  /// [cofreDoQr], e com a mesma consequencia: a limpeza dela esta registrada
  /// em `limpezasAoSair` no `app.dart`, e uma fila criada dentro da tela seria
  /// outro objeto -- o `sair()` limparia uma fila vazia enquanto o nome do
  /// pet, o endereco de referencia e o telefone da tutora anterior
  /// continuariam no arquivo do aparelho.
  ///
  /// Duas filas sobre o mesmo arquivo tambem perderiam uma da outra: cada
  /// instancia guarda a lista em memoria depois da primeira leitura, e a
  /// segunda sobrescreveria o que a primeira enfileirou.
  final FilaOffline fila;

  final TagsApi tags;
  final DevicesApi devices;

  /// A fronteira com o aparelho. Injetavel para que o teste de widget
  /// exercite os tres estados de permissao sem aparelho.
  final CameraEGaleria camera;

  /// A leitura de QR ao vivo (BICHUS-54). Injetavel pelo mesmo motivo da
  /// [camera], com uma diferenca que vale dizer: ela nao pergunta permissao.
  /// Quem pergunta e a [camera], porque e a MESMA permissao de sistema, e
  /// duas portas consultando `Permission.camera` dariam duas respostas que
  /// precisam ser iguais e um dia nao seriam.
  final LeitorDeQr leitorDeQr;

  /// A fronteira com o servico de notificacao. Injetavel pelo mesmo motivo da
  /// camera: notificacao nao se verifica em simulador, e o que o teste precisa
  /// exercitar e a reacao da tela aos quatro estados.
  final Avisos avisos;

  /// Quais das DUAS oportunidades de UX 10.1 ja foram gastas neste aparelho
  /// (BICHUS-24).
  ///
  /// Fica no escopo, e nao dentro da tela, porque as duas oportunidades moram
  /// em telas diferentes -- F1.6 e F3.2 -- e precisam contar a MESMA coisa.
  /// Duas instancias sobre o mesmo arquivo perderiam uma da outra, e o limite
  /// de duas viraria dois limites de uma.
  final OportunidadesDeAviso oportunidades;

  /// Quem reconcilia a permissao de aviso quando ela muda com o app aberto.
  ///
  /// Fica no escopo porque quem precisa dela e o Perfil, para saber se mostra
  /// `Ligar nos ajustes`, e o fluxo da antessala, para lhe contar o que
  /// descobriu. Ver [VigiaDeAviso].
  final VigiaDeAviso vigiaDeAviso;
  /// A fronteira com a localizacao do aparelho (BICHUS-23). Injetavel pelo
  /// mesmo motivo das outras duas, com um agravante: dos cinco motivos de nao
  /// haver ponto, **quatro** so acontecem em aparelho (permissao recusada,
  /// recusada em definitivo, servico desligado, GPS que nao fixa). Sem a porta
  /// nao haveria como exercitar nenhum deles, e o criterio 5 -- "o fluxo
  /// inteiro funciona" -- ficaria sustentado por uma frase.
  final Localizacao localizacao;

  final ControladorDeSessao sessao;

  /// A guarda de acao (UX 8.3): o envelope de intencao pendente e a execucao
  /// dele depois do login. Fica no escopo porque quem precisa dela e a tela de
  /// entrar, que nao pode monta-la: o envelope e um so no app inteiro, e duas
  /// instancias sobre o mesmo arquivo perderiam uma da outra.
  final GuardaDeAcao guarda;

  /// O cache de leitura de `Perfil` › `Meus pets` (criterio 7 da BICHUS-62).
  ///
  /// Fica no escopo, e nao dentro da tela, porque ele precisa sobreviver a
  /// tela ser descartada -- que e o caso comum: trocar de aba e voltar. Em
  /// memoria e por dono; ver [CacheDeMeusPets].
  final CacheDeMeusPets cacheDeMeusPets;

  /// Onde a imagem do QR da tag fica depois de baixada (BICHUS-229).
  ///
  /// Fica no escopo pelo mesmo motivo do [cacheDeMeusPets], com um agravante:
  /// a limpeza dele precisa estar registrada em `limpezasAoSair`, e quem monta
  /// essa lista e o `app.dart`. Um cofre criado dentro da tela seria outro
  /// objeto, e o `sair()` limparia um cofre vazio enquanto o QR do tutor
  /// anterior continuaria no cache global de imagem.
  final CofreDaImagemDoQr cofreDoQr;

  /// O registro de dispensas do aviso persistente de cadastro (BICHUS-75).
  ///
  /// Fica no escopo porque o aviso aparece em TRES lugares -- a faixa de
  /// `Inicio`, o item do topo de `Perfil` e a linha do cartao de cada pet -- e
  /// os tres precisam contar a MESMA dispensa. Duas instancias sobre o mesmo
  /// arquivo perderiam uma da outra, e "dispensei uma vez" viraria "dispensei
  /// em cada tela, separadamente": a faixa de `Inicio` encolheria e a de
  /// `Perfil` continuaria cheia.
  ///
  /// A limpeza dele esta em `limpezasAoSair` no `app.dart`, pelo motivo escrito
  /// em [AvisoDeCadastro]: o que ele guarda e da CONTA.
  final AvisoDeCadastro avisoDeCadastro;

  static Escopo of(BuildContext context) {
    final escopo = context.dependOnInheritedWidgetOfExactType<Escopo>();
    if (escopo == null) {
      throw FlutterError(
        'Escopo nao encontrado. Toda tela do Bichu precisa estar sob o '
        'Escopo montado em main().',
      );
    }
    return escopo;
  }

  @override
  bool updateShouldNotify(Escopo anterior) =>
      api != anterior.api ||
      auth != anterior.auth ||
      pets != anterior.pets ||
      casos != anterior.casos ||
      achados != anterior.achados ||
      envioDeFoto != anterior.envioDeFoto ||
      retomadaDeFotos != anterior.retomadaDeFotos ||
      fila != anterior.fila ||
      tags != anterior.tags ||
      devices != anterior.devices ||
      camera != anterior.camera ||
      leitorDeQr != anterior.leitorDeQr ||
      avisos != anterior.avisos ||
      oportunidades != anterior.oportunidades ||
      vigiaDeAviso != anterior.vigiaDeAviso ||
      localizacao != anterior.localizacao ||
      sessao != anterior.sessao ||
      guarda != anterior.guarda ||
      cacheDeMeusPets != anterior.cacheDeMeusPets ||
      cofreDoQr != anterior.cofreDoQr ||
      avisoDeCadastro != anterior.avisoDeCadastro;
}
