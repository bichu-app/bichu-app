import 'package:flutter/widgets.dart';

import 'api/busca_de_cep.dart';
import 'api/api_client.dart';
import 'api/auth_api.dart';
import 'api/achados_api.dart';
import 'api/casos_api.dart';
import 'api/conexoes_api.dart';
import 'api/devices_api.dart';
import 'api/diretorio_api.dart';
import 'api/loja_api.dart';
import 'api/me_api.dart';
import 'api/envio_de_foto.dart';
import 'api/fotos_pendentes.dart';
import 'api/fila_offline.dart';
import 'api/imagem_do_qr.dart';
import 'api/pets_api.dart';
import 'dispositivo/avisos.dart';
import 'dispositivo/avisos_recebidos.dart';
import 'dispositivo/camera_e_galeria.dart';
import 'dispositivo/oportunidades_de_aviso.dart';
import 'sessao/cidade_escolhida.dart';
import 'sessao/registro_do_aviso_de_cadastro.dart';
import 'dispositivo/vigia_de_aviso.dart';
import 'dispositivo/leitor_de_qr.dart';
import 'dispositivo/localizacao.dart';
import 'intencao/guarda_de_acao.dart';
import 'telas/perfil/meus_pets.dart';
import 'sessao/contador_de_avisos.dart';
import 'sessao/contadores_de_nao_lido.dart';
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
    required this.conexoes,
    required this.me,
    required this.diretorio,
    required this.loja,
    required this.achados,
    required this.envioDeFoto,
    this.buscaDeCep = const BuscaDeCep(),
    required this.retomadaDeFotos,
    required this.fila,
    required this.tags,
    required this.devices,
    required this.camera,
    required this.leitorDeQr,
    required this.avisos,
    required this.avisosRecebidos,
    required this.oportunidades,
    required this.vigiaDeAviso,
    required this.localizacao,
    required this.sessao,
    required this.guarda,
    required this.cacheDeMeusPets,
    required this.cidadeEscolhida,
    required this.cofreDoQr,
    required this.avisoDeCadastro,
    required this.contadorDeAvisos,
    required this.contadores,
    required super.child,
    super.key,
  });

  final ApiClient api;
  final AuthApi auth;
  final PetsApi pets;

  /// As rotas de caso de perdido (`tags: [lost]` do contrato).
  final CasosApi casos;

  /// A porta das CONEXOES entre pessoas (18/10/2026).
  ///
  /// Ela entrou aqui na uniao das quatorze: `TelaDePedidosDeConexao` pedia a
  /// porta por parametro de construtor porque, quando foi escrita, este
  /// arquivo estava sendo mexido por outra sessao e ligar aqui colidiria. Com
  /// os ramos unidos, ela mora onde as outras moram -- uma porta por rota, e
  /// nao uma por tela.
  final ConexoesApi conexoes;

  /// As rotas `tags: [me]` do contrato: os dados pessoais do tutor.
  ///
  /// Fica no escopo, como as outras camadas de API, e nao e construida dentro
  /// da tela: um `MeApi` por tela seria uma segunda porta para a mesma rota, e
  /// o teste de widget perderia o ponto de injecao que todas as outras telas
  /// usam.
  final MeApi me;

  /// O diretorio de `Perto` (`tags: [directory]` do contrato).
  final DiretorioApi diretorio;

  /// A vitrine de `Loja` (`tags: [store]` do contrato).
  ///
  /// **A unica rota do escopo que nao exige conta.** A vitrine e navegavel
  /// deslogado (criterio 24 da BICHUS-185), e nada na resposta dela e privado
  /// de ninguem: tudo ja esta publicado no site do parceiro.
  final LojaApi loja;

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
  /// Um so no app inteiro, e tres consumidores: a foto do pet (F1.6), a foto
  /// do achado avulso e a foto do PROPRIO usuario em `Meus dados` (cliente,
  /// 18/10/2026).
  final EnvioDeFoto envioDeFoto;

  /// A busca de endereco por CEP, para poupar digitacao no pedido da
  /// plaquinha. **Nao e geocodificacao**: devolve texto, nunca coordenada
  /// (ver `api/busca_de_cep.dart`). Servico de terceiro fora do ar nao
  /// impede nenhum pedido.
  final BuscaDeCep buscaDeCep;

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

  /// O ouvinte dos avisos que CHEGAM (os tres estados do push).
  ///
  /// Fica no escopo, e nao na tela, pela mesma razao da fila offline: e UM
  /// objeto no app inteiro. Um ouvinte por tela registraria N assinaturas na
  /// mesma stream e a pessoa veria o mesmo aviso N vezes; e, pior, o estado
  /// `fechado` (`getInitialMessage`) entrega a mensagem UMA vez -- a segunda
  /// instancia a perderia.
  final OuvinteDeAvisos avisosRecebidos;

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

  /// A ultima cidade escolhida na listagem publica de perdidos, **neste
  /// aparelho**.
  ///
  /// Fica no escopo, e nao dentro da tela, pelo mesmo motivo do
  /// [cacheDeMeusPets] e por um a mais que e de TESTE: o deposito em arquivo
  /// chama `getApplicationDocumentsDirectory()`, um canal de plataforma que
  /// **trava o `pumpAndSettle` para sempre, sem mensagem**, em teste de widget.
  /// E a mesma armadilha que `DepositoDeIntencaoEmArquivo` tem, e a saida e a
  /// mesma: o objeto entra pela raiz, e o teste injeta um que responde.
  ///
  /// Uma tela que o construisse por conta travaria a suite inteira na secao em
  /// que o aplicativo ABRE, e o sintoma -- `pumpAndSettle timed out` -- nao
  /// aponta para a causa. Custou uma execucao travada para descobrir.
  final CidadeEscolhida cidadeEscolhida;

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

  // **OS DOIS CONTADORES SAO COISAS DIFERENTES, e a distincao e do cliente**
  // (19/10/2026): *"nao sao a mesma coisa, mensagens e conversa, notificacao
  // sao eventos que estao acontecendo"*.
  //
  // [contadorDeAvisos] e o SINO da barra de topo, de
  // `GET /v1/me/notifications/count`. [contadores] e o distintivo da aba
  // `AuAu` na barra de BAIXO, das conversas. Os nomes sao parecidos e as
  // arquiteturas sao iguais -- as duas entraram no escopo, em `limpezasAoSair`
  // e em `aoEntrar` --, e e exatamente por isso que esta nota esta aqui: quem
  // for mexer em um nao pode achar que mexeu nos dois.

  /// O NUMERO DO SINO da barra de topo (19/10/2026).
  ///
  /// Fica no escopo, e nao dentro do sino, e o motivo e o arranjo da casca: os
  /// ramos visitados ficam MONTADOS (`IndexedStack`), entao um sino que
  /// buscasse por conta propria dispararia uma chamada por secao visitada --
  /// cinco pedidos para desenhar um numero, com cinco respostas chegando fora
  /// de ordem para o mesmo circulo.
  ///
  /// Um objeto so e tambem o que deixa a CAIXA de avisos derrubar o numero ao
  /// abrir: com uma contagem por sino, ela nao teria a quem falar.
  ///
  /// A limpeza dele esta em `limpezasAoSair` e a busca em `aoEntrar`, as duas
  /// no `app.dart`, pelo motivo de [avisoDeCadastro]: o que ele guarda e da
  /// CONTA. A politica de atualizacao inteira esta escrita em
  /// [ContadorDeAvisos].
  final ContadorDeAvisos contadorDeAvisos;

  /// O CONTADOR DE NAO LIDO que a barra de baixo pinta (20/10/2026).
  ///
  /// Fica no escopo, e nao dentro da casca, por tres razoes que sao a mesma:
  /// o numero e da CONTA e nao da tela; quem o atualiza na abertura e na
  /// retomada e o `app.dart`, que e outro lugar; e quem o derruba e a area de
  /// mensagens, que e um ramo diferente da aba que o pinta. Duas instancias
  /// perderiam uma da outra, e a aba continuaria acesa depois de a pessoa ler.
  ///
  /// A limpeza dele esta em `limpezasAoSair` no `app.dart`: o que ele guarda e
  /// da conta, e nao do aparelho.
  final ContadoresDeNaoLido contadores;


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
      me != anterior.me ||
      achados != anterior.achados ||
      envioDeFoto != anterior.envioDeFoto ||
      buscaDeCep != anterior.buscaDeCep ||
      retomadaDeFotos != anterior.retomadaDeFotos ||
      fila != anterior.fila ||
      tags != anterior.tags ||
      devices != anterior.devices ||
      camera != anterior.camera ||
      leitorDeQr != anterior.leitorDeQr ||
      avisos != anterior.avisos ||
      avisosRecebidos != anterior.avisosRecebidos ||
      oportunidades != anterior.oportunidades ||
      vigiaDeAviso != anterior.vigiaDeAviso ||
      localizacao != anterior.localizacao ||
      sessao != anterior.sessao ||
      guarda != anterior.guarda ||
      cacheDeMeusPets != anterior.cacheDeMeusPets ||
      cidadeEscolhida != anterior.cidadeEscolhida ||
      cofreDoQr != anterior.cofreDoQr ||
      avisoDeCadastro != anterior.avisoDeCadastro ||
      contadorDeAvisos != anterior.contadorDeAvisos ||
      contadores != anterior.contadores;
}
