import '../../widgets/arrastar_para_atualizar.dart';
import 'dart:async';

import 'package:flutter/material.dart';
import 'package:go_router/go_router.dart';

import '../../api/falhas.dart';
import '../../api/modelos.dart';
import '../../api/modelos_perdido.dart';
import '../../api/contadores_api.dart';
import '../../api/modelos_pet.dart';
import '../../api/perdidos_api.dart';
import '../../escopo.dart';
import '../../dispositivo/localizacao.dart';
import '../../roteamento/rotas.dart';
import '../../sessao/localizacao_da_sessao.dart';
import '../../sessao/cidade_escolhida.dart';
import '../../theme/bichu_colors.dart';
import '../../theme/bichu_tokens.g.dart';
import '../../widgets/barra_de_listagem.dart';
import '../../widgets/faixa_de_aviso.dart';
import '../../widgets/moldura.dart';
import '../../widgets/rodape_da_paginacao.dart';
import 'cartao_do_perdido.dart';

/// O corpo da seção `Pets`: **a listagem pública dos pets perdidos da região.**
///
/// Até este arquivo a seção dizia *"A lista de pets perdidos está em
/// construção"*, e a frase era honesta: `listPublicLostPets` estava no contrato
/// e **não tinha rota**, então o app não tinha o que chamar. A rota existe
/// agora (`listagem-publica-de-perdidos-routes.ts`), e a casca honesta sai —
/// pelo mesmo caminho que a da `Rede` saiu: o estado vazio não desaparece, ele
/// **muda de dono**. Quem o mostra agora é a lista, e só quando o servidor
/// responde que não há caso aberto no recorte, que é afirmação medida e não
/// afirmação sobre dado que a tela não carrega.
///
/// ---------------------------------------------------------------------------
/// ## O padrão de listagem, sem uma linha de cópia
///
/// [BarraDeListagem], e esta é a **quarta** tela a usar o componente (depois de
/// `Perto`, da `Loja` e da `Rede`). O campo de busca é desenhado por esta tela,
/// em **largura total**, acima de tudo (`buscaAcima: true`); filtro e ordem vão
/// para o slot único de ação da barra de topo, na mesma folha. É o padrão de
/// 17/10/2026 inteiro, e nada dele foi reinventado aqui.
///
/// A busca é por **nome do pet**, e nunca por código de plaquinha: o contrato
/// explica por que — aceitar código aqui transformaria a listagem pública num
/// oráculo de existência de código, com teto de listagem em vez do teto estrito
/// da rota da tag. Quem digita um código tem o leitor de QR a um toque, logo
/// acima.
///
/// **A ordenação NÃO é desenhada.** A operação aceita uma ordem só (mais
/// recente primeiro), e um controle de ordem com uma opcão é controle sem
/// desfecho — a mesma regra que mantém `ControleDeOrdenacao.temEscolha` exigindo
/// dois.
///
/// ---------------------------------------------------------------------------
/// ## A CIDADE VEM DA LOCALIZAÇÃO, COM TRÊS RESERVAS (cliente, 19/10/2026)
///
/// Decisão dele, nas palavras dele: *"autorizar o gps, e trazer algum valor
/// padrão em caso de fallback"*, depois de pedir duas vezes *"que você pegue a
/// cidade que o usuário esta pela localização dele e monte os pets cadastrados
/// nessa cidade"*. A emenda 1 do ADR-0006 autoriza coordenada → nome de
/// cidade, e só esse sentido.
///
/// **A cadeia, nesta ordem, e nenhum elo trava a tela:**
///
/// 1. **a cidade resolvida pelo aparelho**, quando a permissão está concedida;
/// 2. **`Me.reference_area.city`**, a cidade que a pessoa informou no perfil —
///    rótulo, e por isso legítima aqui (medido: 3 de 47 contas a têm);
/// 3. **nenhuma cidade**: os 20 mais recentes do país inteiro.
///
/// **NÃO HÁ CIDADE FIXA NO CÓDIGO, e a ausência é decisão.** "São Paulo" como
/// padrão faria quem abre o app em Recife ver pets de São Paulo sem entender
/// por quê, e isso é pior que a lista nacional — que ao menos nunca mente
/// sobre onde a pessoa está.
///
/// **A TELA DIZ QUAL RECORTE ESTÁ VALENDO, nos três estados**, e é
/// [_LinhaDoRecorte] quem diz. Cidade derivada em silêncio é pior que cidade
/// nenhuma: quem abre o app numa viagem e vê pets da cidade errada sem
/// explicação conclui que a lista está quebrada. A linha nomeia a cidade **e a
/// origem dela**, e carrega a saída (`Ver todas`, e `Usar minha localização`
/// quando ela ainda não foi usada).
///
/// ## O QUE A PESSOA ESCOLHE GANHA DE TUDO, INCLUSIVE DE "NADA"
///
/// [_pessoaMexeu] existe por um motivo que um `??` não resolve: com a
/// precedência escrita como `digitada ?? doAparelho ?? daRegiao`, **apagar o
/// campo não teria efeito** — nulo é indistinguível de "não mexeu", e a cidade
/// do aparelho voltaria a valer no quadro seguinte. É o mesmo defeito que o
/// sentinela de `RecorteDePerdidos.copiar` resolve um nível abaixo.
///
/// ## A RESOLUÇÃO NÃO É PEDIDA NA ABERTURA, e a tela não espera por ela
///
/// A lista carrega **primeiro**, com a reserva. A resolução acontece depois,
/// sem `await` na frente da primeira pintura, e só quando a permissão **já
/// está concedida** — abrir diálogo do sistema como efeito colateral de abrir
/// a seção é exatamente o que a porta do aparelho proíbe
/// (*"quem pede é a tela, depois da antessala, porque o pedido é um ato da
/// pessoa"*). Quem ainda não concedeu lê um convite em [_LinhaDoRecorte] e
/// toca se quiser.
///
/// ## OS OITO MOTIVOS DE NÃO RESOLVER CAEM TODOS PARA A RESERVA
///
/// Permissão negada, negada em definitivo, serviço desligado, sem fix no
/// prazo, indisponível no build, geocoder ausente, teto de uso estourado e
/// resolução sem resultado. **Nenhum deles vira erro na tela** e nenhum deles
/// é raro: o geocoder do Android pode não existir no aparelho e o teto de uso
/// é real, os dois medidos no pacote. A tela não distingue os oito — ela cai
/// para a reserva e diz qual recorte ficou valendo.
///
/// ## MAS O TOQUE RESPONDE, E ISSO É O CONSERTO DE 20/10/2026
///
/// Cliente: *"o botão de usar minha localização na seção do pets não está
/// funcionando"*. Duas coisas foram medidas em teste de widget, sem aparelho:
///
/// 1. **A causa.** `_resolverEAplicar` era um método só para os dois
///    chamadores, e o guarda `if (_pessoaMexeu) return;` — correto para a
///    resolução de abertura — **descartava o resultado do TOQUE**. Quem
///    digitou uma cidade no filtro, ou tocou `Ver todas`, ficava com
///    `_pessoaMexeu` verdadeiro pelo resto da sessão: o botão continuava
///    oferecido e habilitado, o toque pedia a permissão, gastava uma resolução
///    do teto de uso, recebia a cidade e não trocava um pixel. Ver
///    [_EstadoDaListaDePerdidos._resolverEAplicar].
/// 2. **O defeito de produto por trás do relato.** A reserva foi desenhada
///    para nunca travar a tela, e o preço era que o toque tinha **quatro
///    desfechos mudos**. A tela passa a dizer qual foi, em quatro frases
///    diferentes — [ListaDePerdidos.avisoSemPermissao],
///    [ListaDePerdidos.avisoServicoDesligado],
///    [ListaDePerdidos.avisoCidadeNaoDescoberta] e
///    [ListaDePerdidos.avisoSemPetsNaCidade] —, mais
///    [ListaDePerdidos.avisoProcurando] no meio.
///
/// **A assimetria entre abertura e toque é a regra:** a abertura segue muda nos
/// oito motivos, porque ninguém pediu nada ali.
///
/// ---------------------------------------------------------------------------
/// ## A CIDADE NÃO É OBRIGATÓRIA, E A TELA ABRE MESMO SEM NENHUMA
///
/// Decisão do cliente, 19/10/2026: *"o campo cidade do filtro da página pet não
/// deve ser obrigatório, mas devemos filtrar pelos 20 últimos pets cadastrados
/// e deixar que ele altere os filtros manualmente"*. `city` perdeu o
/// `required: true` em `api/openapi.yaml` no mesmo trabalho que este arquivo.
///
/// **A tela abre SEM cidade**, e isso é o recorte e não um estado de espera: a
/// página 1 são os 20 casos abertos mais recentes, de qualquer cidade, pela
/// ordem que a operação sempre teve (`last_seen_at DESC`). `limit` já tinha
/// `default: 20` e `maximum: 20` no contrato, então "os 20 últimos" não pediu
/// nada de novo.
///
/// ### O que SAIU, e por que sair era o ponto
///
/// Havia uma fase própria, `_Fase.semCidade`, com uma linha ("Escolha uma
/// cidade...") e um botão que abria a folha de filtro — a tela não tinha o que
/// mostrar até alguém digitar uma cidade. **Essa fase não existe mais**, e com
/// ela saíram as três fontes de cidade que a alimentavam: o que a pessoa
/// digitou, `Me.reference_area.city` e a última cidade guardada no aparelho
/// (`CidadeEscolhida`).
///
/// **A precedência não foi substituída por outra: ela foi removida.** Qualquer
/// uma das três, aplicada na abertura, faria a página abrir FILTRADA por uma
/// cidade que ninguém escolheu — que é literalmente a reclamação de 18/10
/// (*"não deve trazer nenhum item do filtro por padrão"*), um nível acima,
/// porque cidade recorta mais que janela. E o campo da folha mostraria um valor
/// que o servidor não aplicou, que é o defeito que o contrato nomeia em
/// `period`: "a tela leria um filtro aplicado numa página que ninguém filtrou".
///
/// `CidadeEscolhida` **continua existindo e não é mais lida por esta tela.**
/// Ela é a última leitora de produção que a classe tinha; a classe tem teste
/// próprio e está ligada no `Escopo` e no `app.dart`, então retirá-la é
/// decisão à parte e não estava no pedido.
///
/// O campo de cidade continua na folha, agora **opcional**, e é ele que atende
/// o *"deixar que ele altere os filtros manualmente"*: quem quer uma cidade
/// digita; quem apaga o campo volta a ver todas. Esvaziá-lo é um recorte
/// válido, e é por isso que `obrigatorio` não é mais passado — com ele, o
/// `Aplicar` nascia desabilitado com o campo vazio.
///
/// ## O ESTADO (UF) NÃO VAI NO PEDIDO, E A FALTA É DO CONTRATO
///
/// **Medido em 18/10/2026 contra `api/openapi.yaml`:** `listPublicLostPets`
/// declara `city`, `neighborhood`, `species`, `size`, `period`, `q`, `page` e
/// `limit` — e **não declara `state`**. `listDirectoryEntries` e
/// `listAdminDirectoryEntries` declaram (`UF, duas letras`), então o padrão
/// existe no contrato; só não existe nesta operação.
///
/// A consequência é real e está nomeada no relatório: "São Paulo" não é único no
/// Brasil, e "Campinas" existe em três estados. Sem `state`, um visitante que
/// digita `Campinas` recebe os casos abertos das três.
///
/// **Por isso não há seletor de estado nesta folha**, e a ausência é a regra da
/// casa e não esquecimento: controle cujo valor não tem para onde ir é controle
/// sem desfecho, e o produto não os desenha. `api/estados_brasileiros.dart`
/// continua existindo e não foi duplicado — ele não foi usado. Acrescentar
/// `state` é **aditivo** (parâmetro opcional novo) e a coluna já existe
/// (`lost_cases.last_seen_state`), mas é mudança de contrato mais trabalho de
/// servidor, e isso é decisão do cliente.
///
/// ---------------------------------------------------------------------------
/// ## Paginação NUMERADA, e a escolha é do contrato
///
/// `page`/`limit` com `total`, porque é o que `PublicLostPetPage` declara e os
/// três campos são `required`. Trocar para cursor seria mudança **quebrante** de
/// contrato, e mudança quebrante não se faz por preferência. O desenho é o do
/// parágrafo 11.20 de qualquer forma — `Carregar mais`, nunca rolagem infinita e
/// nunca números de página na tela —, e quem o desenha é [RodapeDaPaginacao].
///
/// ## Sem texto de apoio
///
/// A seção manda `reforcoDaPagina: ''` desde que o cliente removeu as frases de
/// apoio (18/10/2026), e o estado vazio tem **uma linha**. É por isso que esta
/// tela não usa `EstadoVazio`, que exige título e explicação: duas linhas onde o
/// cliente pediu uma.
class ListaDePerdidos extends StatefulWidget {
  const ListaDePerdidos({super.key});

  /// Uma linha, e só uma, em cada estado em que a lista não tem o que mostrar.
  /// **Sem "na sua região"** desde 19/10/2026: a lista abre sem cidade, então a
  /// frase antiga ("Nenhum pet perdido na sua região agora.") afirmava um
  /// recorte geográfico que o servidor não aplicou.
  static const String vazio = 'Nenhum pet perdido agora.';
  static const String vazioFiltrado = 'Nenhum pet perdido com esse recorte.';

  /// As frases de [_LinhaDoRecorte]. Elas dizem a cidade **e de onde ela
  /// veio**: cidade derivada em silêncio é pior que cidade nenhuma.
  static const String origemDoAparelho = 'da sua localização';
  static const String origemDaRegiao = 'da sua região cadastrada';
  static const String origemDaUltimaBusca = 'da sua última busca';
  static const String semRecorteGeografico = 'Pets perdidos de todo o Brasil';
  static const String rotuloDeVerTodas = 'Ver todas';
  static const String rotuloDeUsarLocalizacao = 'Usar minha localização';

  /// O rótulo do campo de cidade, que é também o nome acessível dele.
  static const String rotuloDaCidade = 'Cidade';
  static const String exemploDaCidade = 'São Paulo';

  /// A única linha que o campo mostra além do rótulo, e só quando o valor não
  /// serve. `minLength: 2` é o do contrato.
  static const String validacaoDaCidade =
      'Escreva o nome da cidade, com dois caracteres ou mais.';

  static const String falha = 'Não foi possível carregar os pets perdidos agora.';
  static const String rotuloDeTentar = 'Tentar de novo';

  // -------------------------------------------------------------------------
  // AS QUATRO FRASES DO TOQUE EM `Usar minha localização`
  // -------------------------------------------------------------------------
  //
  // **Elas nascem do defeito de 20/10/2026**, relatado pelo cliente assim: *"o
  // botão de usar minha localização na seção do pets não está funcionando"*. A
  // cadeia de reserva foi desenhada para nunca travar a tela, e o efeito
  // colateral era que NADA acontecia visivelmente quando ela caía — a pessoa
  // toca e o app parece quebrado.
  //
  // **São QUATRO e não uma.** A genérica ("não foi possível usar sua
  // localização") mandaria quem está com o serviço desligado procurar uma
  // permissão que ela já concedeu, e diria "não deu" a quem a localização
  // funcionou perfeitamente e a cidade simplesmente não tem caso aberto. É a
  // mesma regra dos cinco motivos de `TextosDaLocalizacao`, pelo mesmo motivo.
  //
  // **Nenhuma culpa a pessoa, e nenhuma é erro de fluxo**: a lista está na
  // tela em todas, pela reserva, e todas dizem o caminho de volta. Por isso o
  // peso é [PesoDaFaixa.informativo] e nunca `erro` — a faixa Brasa de 2 px é
  // da urgência, e nada aqui é urgente.

  /// 1. A localização não está liberada para este app.
  ///
  /// Cobre `negada`, `negadaPermanentemente` e a recusa que volta do diálogo
  /// do sistema. **Não diz "você negou"**: quem nega por engano, quem nega e
  /// esquece e quem tem a permissão bloqueada por política do aparelho leem a
  /// mesma frase, e para as três a saída é a mesma.
  static const String avisoSemPermissao =
      'A localização não está liberada para o Bichu. Dá para liberar nos '
      'ajustes do aparelho, ou escolher a cidade no filtro.';

  /// 2. A permissão existe e o serviço do aparelho está desligado.
  ///
  /// **Separada da 1 de propósito**, e a separação é a razão de a porta ter
  /// `servicoLigado()` apartado de `estado()`: mandar quem desligou a
  /// localização nos ajustes procurar uma permissão já concedida é o defeito
  /// que a porta do aparelho existe para não cometer.
  static const String avisoServicoDesligado =
      'A localização do aparelho está desligada. Dá para ligar nos ajustes, '
      'ou escolher a cidade no filtro.';

  /// 3. Veio coordenada e não veio nome de cidade.
  ///
  /// Os cinco motivos que terminam aqui — sem fix no prazo, indisponível no
  /// build, geocoder ausente, teto de uso estourado e resolução sem resultado
  /// — **são todos de fora do app**, e nenhum deles tem ação diferente para
  /// oferecer: tentar de novo, ou escolher a cidade. Distinguir os cinco na
  /// tela daria cinco frases para uma ação única.
  static const String avisoCidadeNaoDescoberta =
      'Não deu para descobrir sua cidade agora. Dá para tentar de novo, ou '
      'escolher a cidade no filtro.';

  /// 5. VEIO O PONTO, NÃO VEIO O NOME — e a reserva já está na tela.
  ///
  /// **Separada da 3 em 20/10/2026, e a separação é desenho de produto.** A 3
  /// diz "não deu" para cinco situações, e em UMA delas nada deixou de dar: a
  /// plataforma respondeu, descreveu o lugar, e simplesmente não trouxe nome
  /// de cidade. A lista nacional dos 20 mais recentes já está embaixo da
  /// faixa, pintada pela reserva — chamar isso de falha ensina a pessoa a
  /// desconfiar de uma tela que está funcionando.
  ///
  /// **Não oferece `Tentar de novo`**, e essa é a diferença que importa: tentar
  /// de novo no mesmo ponto devolve o mesmo nada e gasta o teto de uso. A ação
  /// que resolve é escolher a cidade, e é a única que a frase oferece.
  static const String avisoCidadeSemNome =
      'Achamos onde você está, mas não deu para nomear sua cidade. A lista '
      'abaixo é do Brasil todo — escolha a cidade no filtro para recortar.';

  /// O CÓDIGO DO MOTIVO, colado no fim da faixa.
  ///
  /// **Existe porque o aparelho do cliente é o único instrumento que este
  /// projeto tem, e até 20/10/2026 ele não media nada.** Relato dele, com o
  /// build de `1ff67840`: *"da o erro: Não deu para descobrir sua cidade
  /// agora"* — instantâneo, na capital de SP, com permissão concedida e
  /// localização exata ligada. Quatro caminhos produzem essa frase nessas
  /// condições, a frase é a mesma nos quatro, e nada em lugar nenhum registra
  /// qual foi. Pedir um segundo build sem isto seria pedir a mesma frase de
  /// novo.
  ///
  /// **Discreto e não escondido.** Vai no fim da faixa, com o separador que o
  /// resto da tela usa, em vez de num log que ninguém no aparelho dele lê. Não
  /// é bonito; é o preço de não ter esteira de aparelho. Quando houver
  /// telemetria, isto sai e o `motivo` vai para ela — e o caso de teste que
  /// cobra o código vai reprovar, que é o lembrete certo.
  static String comCodigo(String frase, String codigo, String? detalhe) =>
      detalhe == null || detalhe.isEmpty
          ? '$frase · cód. $codigo'
          : '$frase · cód. $codigo ($detalhe)';

  /// 4. A localização FUNCIONOU, e a cidade não tem pet perdido.
  ///
  /// **É a frase que responde à pergunta do cliente**, e ela é a única das
  /// quatro que afirma sucesso. Sem ela, o desfecho bom com lista vazia é
  /// indistinguível do botão não ter feito nada: a linha do recorte troca para
  /// uma cidade e o corpo continua dizendo que não há pet nenhum.
  static String avisoSemPetsNaCidade(String cidade) =>
      'A localização funcionou: você está em $cidade. Não há nenhum pet '
      'perdido cadastrado aí agora.';

  /// O que a pessoa lê ENQUANTO o aparelho mede.
  ///
  /// Não é uma das quatro: é o que falta entre o toque e a resposta. O prazo
  /// da resolução é de `prazoDaMedicaoDaCidade`, e no aparelho ele é gasto de
  /// verdade — doze segundos sem sinal nenhum na tela são doze segundos em que
  /// o botão "não está funcionando".
  static const String avisoProcurando = 'Procurando sua localização…';

  /// As duas saídas das faixas. **Nomes distintos do `Tentar de novo` da
  /// falha de carga**: as duas faixas podem estar na tela ao mesmo tempo, e
  /// dois rótulos iguais com destinos diferentes são a mesma armadilha que
  /// `BarraDeListagem` resolve com slot único.
  static const String rotuloDeAbrirAjustes = 'Abrir os ajustes';
  static const String rotuloDeTentarALocalizacao = 'Tentar a localização de novo';

  static const String rotuloDaBusca = 'Buscar pet perdido';
  static const String dicaDaBusca = 'Buscar pelo nome do pet';

  /// A frase do fim da lista. Carrega o substantivo e o plural, que é por que
  /// [RodapeDaPaginacao] não a monta sozinho.
  /// **Sem "na região"**, pelo mesmo motivo de [vazio]: a lista abre sem
  /// cidade, e o total conta o que o recorte de fato tem.
  static String fimDaLista(int total) =>
      total == 1 ? 'Um pet perdido.' : '$total pets perdidos.';

  @override
  State<ListaDePerdidos> createState() => _EstadoDaListaDePerdidos();
}

/// **`semCidade` SAIU em 19/10/2026.** Ela era a fase em que a tela não tinha o
/// que mostrar porque ninguém havia digitado uma cidade, e a cidade deixou de
/// ser obrigatória: não há mais pergunta a fazer antes de listar.
enum _Fase { carregando, lista, falha }

// **OS DOIS PRAZOS DESTA TELA SAIRAM DAQUI (22/10/2026), e nao foram
// perdidos.** `prazoDaResolucao` e `tetoDaEsperaDaResolucao` tinham gemeos de
// valor identico em `widgets/cidade_por_localizacao.dart`, e o motivo era que
// as DUAS esperas pelo aparelho existiam -- uma por secao. Com uma espera so
// (`sessao/localizacao_da_sessao.dart`), os prazos moram junto dela:
// `prazoDaMedicaoDaCidade` e `tetoDaEsperaDaCidade`.
//
// O teto da PORTA (`LocalizacaoPorGeolocator.prazoDoGeocoder`, 10 s) continua
// existindo e continua menor de proposito -- os dois nao sao redundantes, e a
// diferenca e de ALCANCE: o da porta cobre a etapa do geocoder e NOMEIA o
// motivo; o da sessao cobre a chamada inteira, inclusive um travamento em
// qualquer linha da porta que nao seja o geocoder, e inclusive num duble de
// tela. Quem desiste primeiro e quem sabe dizer em que etapa foi, e ha caso
// cobrando essa ordem (`test/dispositivo/cidade_da_localizacao_test.dart`).

/// De onde veio a cidade que esta valendo. E o que a tela MOSTRA.
enum _OrigemDaCidade {
  /// A pessoa digitou (ou apagou) na folha de filtro.
  escolhida,

  /// Resolvida pelo aparelho, com permissao concedida.
  aparelho,

  /// `Me.reference_area.city`, a cidade que a pessoa informou no perfil.
  regiao,

  /// A ultima cidade que valeu neste aparelho (`CidadeEscolhida`).
  ///
  /// **Ela NAO se anuncia como "da sua localizacao", e a distincao e o ponto.**
  /// Uma cidade guardada na semana passada pode ser de outra cidade inteira:
  /// rotula-la como localizacao atual seria a "cidade errada derivada em
  /// silencio" que esta tela existe para nao fazer. Ela diz o que e -- a ultima
  /// busca -- e quem viajou le isso e corrige.
  ultimaBusca,

  /// Nenhuma: os 20 mais recentes do pais inteiro.
  nenhuma,
}

/// O QUE O TOQUE EM `Usar minha localização` DEIXOU NA TELA.
///
/// **Existe por causa do defeito de 20/10/2026.** Antes dele, o toque tinha um
/// desfecho visível (a lista recortada) e **quatro desfechos mudos**: permissão
/// recusada, serviço desligado, cidade não descoberta e cidade descoberta sem
/// pet nenhum. Os quatro caíam para a reserva sem uma palavra, e o cliente leu
/// isso do único jeito que dava para ler — o botão não funciona.
///
/// **Nulo é o estado normal**, e não um quinto valor: ninguém tocou nada, ou o
/// toque deu certo e a lista trocou. A linha do recorte já diz qual recorte
/// ficou valendo, e repetir "deu certo" numa faixa seria o app comentando o
/// óbvio.
///
/// A resolução de ABERTURA nunca produz nenhum destes valores, e a assimetria é
/// deliberada: lá ninguém pediu nada, e um aviso seria erro inventado em cima
/// de uma reserva que o ADR chama de reserva.
enum _AvisoDaLocalizacao {
  /// O aparelho está medindo. O botão fica desabilitado enquanto isto vale.
  procurando,

  /// A localização não está liberada para este app.
  semPermissao,

  /// A permissão existe e o serviço do aparelho está desligado.
  servicoDesligado,

  /// A resolução falhou, e falhou de um jeito que pode ser tentado de novo.
  cidadeNaoDescoberta,

  /// Veio coordenada e não veio nome de cidade. Ver [ListaDePerdidos.avisoCidadeSemNome].
  cidadeSemNome,

  /// Deu certo, e a cidade não tem caso aberto.
  semPetsNaCidade,
}

class _EstadoDaListaDePerdidos extends State<ListaDePerdidos>
    with PublicaAAtualizacao {
  /// A BUSCA QUE O ARRASTO REFAZ (cliente, 18/10/2026).
  ///
  /// **A mesma funcao do `Tentar de novo`**, e nao uma copia: duas buscas com
  /// dois nomes divergem na primeira correcao de filtro. Quem desenha a roda e
  /// a casca, por `SlotDeAtualizacao` -- ver
  /// `widgets/arrastar_para_atualizar.dart`.
  @override
  Future<void> aoArrastarParaAtualizar() => _carregar();

  _Fase _fase = _Fase.carregando;

  List<PerdidoPublico> _itens = const <PerdidoPublico>[];
  int _total = 0;
  int _pagina = 1;

  RecorteDePerdidos? _recorte;

  /// A PESSOA mexeu no campo de cidade. Ver o cabeçalho: sem este sinal,
  /// apagar o campo não teria efeito.
  bool _pessoaMexeu = false;

  /// A cidade que a pessoa escolheu. **Válida só quando [_pessoaMexeu]**, e
  /// nula ali significa "ela apagou", que é um recorte e não uma ausência.
  String? _cidadeDigitada;

  /// A cidade resolvida pelo aparelho, quando deu.
  String? _cidadeDoAparelho;

  /// A última cidade que ficou valendo **neste aparelho**, lida de
  /// [CidadeEscolhida]. **Terceira reserva**, abaixo da região.
  ///
  /// Ela chega **sem a tela esperar** — o depósito é canal de plataforma, e
  /// esperá-lo antes da primeira carga travaria a seção em que o aplicativo
  /// ABRE (foi o que travou cinco arquivos da suíte quando a leitura era
  /// aguardada). A lista carrega com o que já tem, e esta chega depois.
  String? _cidadeDaUltimaBusca;

  /// A leitura do depósito já foi PEDIDA. Pedida, não concluída.
  bool _pediuODeposito = false;

  /// A resolução já foi PEDIDA nesta montagem. Pedida, não concluída.
  bool _pediuAResolucao = false;

  /// A permissão de localização, como a porta a vê. Nula antes da primeira
  /// leitura — e nula não é "negada": é "ainda não sei".
  PermissaoDeLocalizacao? _permissao;

  /// O que o último TOQUE em `Usar minha localização` deixou na tela.
  ///
  /// Ver [_AvisoDaLocalizacao]: nulo é o estado normal, e a resolução de
  /// abertura nunca o preenche.
  _AvisoDaLocalizacao? _aviso;

  /// A cidade que [_AvisoDaLocalizacao.semPetsNaCidade] nomeia.
  ///
  /// **Guardada à parte de [_cidadeDoAparelho] de propósito**: a frase precisa
  /// continuar verdadeira depois de a pessoa mexer no filtro, e ler a cidade em
  /// uso faria a faixa dizer "você está em Campinas" sobre uma cidade digitada.
  String? _cidadeDoAviso;

  /// O CÓDIGO do motivo do último aviso, e o detalhe que a plataforma deu.
  ///
  /// Ver [ListaDePerdidos.comCodigo]: eles vão para a tela porque o aparelho de
  /// quem relata é o único instrumento de medição que este projeto tem. Nulos
  /// nos avisos que não nascem de motivo (`procurando`, `semPetsNaCidade`).
  String? _codigoDoAviso;
  String? _detalheDoAviso;

  bool _carregandoMais = false;
  bool _falhaAoCarregarMais = false;

  final TextEditingController _buscaControlador = TextEditingController();

  /// Cada carga ganha um número; resposta de carga velha é descartada. É a
  /// mesma guarda da agenda da `Rede`, e ela existe porque trocar o recorte
  /// duas vezes rápido entrega as respostas fora de ordem.
  int _geracao = 0;

  bool _visivel = false;
  bool _cargaAgendada = false;

  /// O instante de referência das frases relativas dos cartões, fixado **por
  /// carga** e não lido a cada pintura: um `DateTime.now()` dentro do `build`
  /// faria dois cartões da mesma lista discordarem sobre o que é "hoje" na
  /// virada da meia-noite.
  DateTime _agora = DateTime.now();

  @override
  void dispose() {
    _buscaControlador.dispose();
    super.dispose();
  }

  @override
  void didChangeDependencies() {
    super.didChangeDependencies();
    if (!TickerMode.valuesOf(context).enabled) {
      _visivel = false;
      return;
    }
    if (_visivel) return;
    _visivel = true;
    _agendarCarga();
  }

  void _agendarCarga() {
    if (_cargaAgendada) return;
    _cargaAgendada = true;
    WidgetsBinding.instance.addPostFrameCallback((_) {
      _cargaAgendada = false;
      if (!mounted) return;
      // A CARGA PRIMEIRO, E SEM `await`. A lista aparece com a reserva; a
      // resolucao da cidade vem depois e, quando der, recarrega. Esperar por
      // ela antes da primeira pintura faria a secao em que o aplicativo ABRE
      // depender de GPS, de rede da Apple ou do Google e de teto de uso.
      _carregar();
      if (!_pediuODeposito) {
        _pediuODeposito = true;
        unawaited(_lerODeposito());
      }
      if (!_pediuAResolucao) {
        _pediuAResolucao = true;
        unawaited(_resolverACidade());
      }
    });
  }

  /// A cidade que vale agora. **A escolha da pessoa ganha de tudo, inclusive
  /// de "nenhuma"** — ver [_pessoaMexeu] no cabeçalho.
  String? get _cidadeEmUso => _pessoaMexeu
      ? _cidadeDigitada
      : (_cidadeDoAparelho ?? _cidadeDaRegiao ?? _cidadeDaUltimaBusca);

  /// De onde a cidade que está valendo veio. É o que [_LinhaDoRecorte] mostra.
  _OrigemDaCidade get _origemDaCidade {
    if (_cidadeEmUso == null) return _OrigemDaCidade.nenhuma;
    if (_pessoaMexeu) return _OrigemDaCidade.escolhida;
    if (_cidadeDoAparelho != null) return _OrigemDaCidade.aparelho;
    if (_cidadeDaRegiao != null) return _OrigemDaCidade.regiao;
    return _OrigemDaCidade.ultimaBusca;
  }

  /// A cidade da região cadastrada: a **segunda** reserva da cadeia.
  String? get _cidadeDaRegiao {
    final c = _regiao?.cidade?.trim();
    return (c == null || c.isEmpty) ? null : c;
  }

  /// Onde a última cidade fica guardada **neste aparelho**.
  ///
  /// **[CidadeEscolhida] voltou a ter dono em 19/10/2026.** Ela ficou sem
  /// leitor de produção quando a precedência saiu, e com a cidade derivada ela
  /// recupera a função: é ela que guarda a cidade que ficou valendo, venha do
  /// aparelho, da região ou do dedo da pessoa, para a abertura seguinte não
  /// depender de resolver de novo — e resolver de novo custa teto de uso.
  ///
  /// **Vem do `Escopo`, e não é construída aqui.** O depósito em arquivo chama
  /// `getApplicationDocumentsDirectory()`, um canal de plataforma que trava o
  /// `pumpAndSettle` para sempre, sem mensagem, em teste de widget.
  CidadeEscolhida get _cidadeGuardada => Escopo.of(context).cidadeEscolhida;

  /// Lê a última cidade guardada neste aparelho, **sem a tela esperar**.
  ///
  /// É o LEITOR de [CidadeEscolhida], e ele existe para a classe não ser
  /// depósito só de escrita: até 19/10/2026 esta tela escrevia nela e ninguém
  /// lia, o que é dívida com aparência de função.
  ///
  /// Ela só vale se nada melhor já estiver valendo quando chegar — o aparelho
  /// pode ter resolvido primeiro, a região pode existir, e a pessoa pode ter
  /// mexido no filtro. Nos três casos a guardada perdeu, e recarregar seria
  /// trocar a lista debaixo de quem está lendo.
  Future<void> _lerODeposito() async {
    // **Nunca lança**: `CidadeEscolhida` engole falha das duas pontas e
    // devolve nulo. É o aparelho com armazenamento bloqueado, o perfil
    // restrito e o build sem o plugin registrado.
    final guardada = await _cidadeGuardada.ler();
    if (!mounted || guardada == null) return;
    if (_pessoaMexeu ||
        _cidadeDoAparelho != null ||
        _cidadeDaRegiao != null) {
      return;
    }
    setState(() => _cidadeDaUltimaBusca = guardada);
    await _carregar();
  }

  /// Resolve a cidade pelo aparelho, **sem a tela esperar**.
  ///
  /// Chamada depois da primeira carga, por `addPostFrameCallback`. Ela nunca
  /// lança: a porta devolve [CidadeNaoResolvida] com um dos oito motivos, e os
  /// oito caem para a reserva. Um `try` aqui seria rede sobre rede.
  ///
  /// **Só resolve com a permissão JÁ concedida.** Pedir aqui abriria o diálogo
  /// do sistema como efeito colateral de abrir a seção.
  Future<void> _resolverACidade() async {
    // **A SESSAO, e nao a porta.** Cliente, 22/10/2026: *"quando o usuario
    // autorizar a localizacao, em qualquer uma das paginas, voce deve utilizar
    // ela para todas as secoes"*. Se outra secao ja resolveu a cidade nesta
    // sessao, `cidade()` a devolve **sem tocar no aparelho** -- e esta tela
    // abre com ela em vez de descobrir de novo e, falhando, oferecer a caixa a
    // quem ja autorizou. Ver `sessao/localizacao_da_sessao.dart`.
    final sessao = Escopo.of(context).localizacaoDaSessao;
    final permissao = await sessao.estado();
    if (!mounted) return;
    setState(() => _permissao = permissao);
    if (permissao != PermissaoDeLocalizacao.concedida) return;
    await _resolverEAplicar(sessao, porToque: false);
  }

  /// O caminho do TOQUE: pede a permissão e, concedida, resolve.
  ///
  /// Este é o único lugar que chama `pedir()`, e ele só roda a partir de
  /// [ListaDePerdidos.rotuloDeUsarLocalizacao] — um ato da pessoa, com o
  /// rótulo dizendo o que vai acontecer. Negada em definitivo, abre os
  /// ajustes, porque pedir de novo não abre diálogo nenhum.
  Future<void> _pedirEResolver() async {
    // Dois toques seguidos pediriam permissão duas vezes e gastariam o teto de
    // uso do geocoder duas vezes. O botão desabilita enquanto `procurando`
    // vale (ver [_LinhaDoRecorte.aoUsarLocalizacao]), e esta guarda cobre o
    // toque que escapa entre o gesto e o quadro.
    if (_aviso == _AvisoDaLocalizacao.procurando) return;
    final sessao = Escopo.of(context).localizacaoDaSessao;
    // **A TELA RESPONDE AO TOQUE ANTES DE TER RESPOSTA.** `cidadeAproximada`
    // pode gastar os doze segundos de `prazoDaMedicaoDaCidade` mais a ida ao serviço
    // de plataforma, e doze segundos sem nada na tela são doze segundos em que
    // o botão "não está funcionando".
    setState(() {
      // Limpa o código do toque ANTERIOR: deixá-lo colaria o motivo de ontem
      // na frase de hoje, e um código errado é pior que código nenhum.
      _codigoDoAviso = null;
      _detalheDoAviso = null;
      _aviso = _AvisoDaLocalizacao.procurando;
    });
    final antes = await sessao.estado();
    if (!mounted) return;
    if (antes == PermissaoDeLocalizacao.negadaPermanentemente) {
      // Abrir os ajustes continua sendo o certo — pedir de novo não abre
      // diálogo nenhum. **O que mudou é a tela DIZER isso:** quem volta dos
      // ajustes sem liberar, e quem não chega a sair do app, lia o nada.
      setState(() {
        _permissao = antes;
        _codigoDoAviso = MotivoDeNaoTerCidade.permissaoNegadaPermanentemente
            .codigo;
        _aviso = _AvisoDaLocalizacao.semPermissao;
      });
      await sessao.abrirAjustesDoSistema();
      return;
    }
    final depois = await sessao.pedir();
    if (!mounted) return;
    setState(() => _permissao = depois);
    switch (depois) {
      case PermissaoDeLocalizacao.negada:
      case PermissaoDeLocalizacao.negadaPermanentemente:
      case PermissaoDeLocalizacao.naoPedida:
        // `naoPedida` depois de `pedir()` é o diálogo que a pessoa dispensou
        // sem responder (o `grantResults` vazio que o plugin registra). Para a
        // tela é o mesmo que recusar: não há permissão.
        setState(() {
          _codigoDoAviso = MotivoDeNaoTerCidade.permissaoNegada.codigo;
          _aviso = _AvisoDaLocalizacao.semPermissao;
        });
        return;
      case PermissaoDeLocalizacao.indisponivel:
        // Não é recusa, é ausência — e ausência não manda ninguém para ajuste
        // nenhum. Cai na terceira frase, que é a que oferece o filtro.
        setState(() {
          // **ESTE caminho não passa pelo `switch` dos nove motivos**, e por
          // isso o código tem de ser posto à mão aqui: ele é um dos quatro que
          // produziam a frase 3 sem deixar rastro no relato de 20/10/2026.
          _codigoDoAviso = MotivoDeNaoTerCidade.indisponivel.codigo;
          _detalheDoAviso = 'permissão indisponível após pedir';
          _aviso = _AvisoDaLocalizacao.cidadeNaoDescoberta;
        });
        return;
      case PermissaoDeLocalizacao.concedida:
        break;
    }
    await _resolverEAplicar(sessao, porToque: true);
  }

  /// Resolve a cidade e aplica, **por um dos DOIS caminhos**.
  ///
  /// ## [porToque] NÃO É UM PARÂMETRO DE CONVENIÊNCIA: ELE É O CONSERTO
  ///
  /// Este método era um só para os dois chamadores, e a confusão deles **era a
  /// causa do defeito de 20/10/2026** (*"o botão de usar minha localização na
  /// seção do pets não está funcionando"*).
  ///
  /// O guarda era `if (_pessoaMexeu) return;`, escrito — corretamente — para a
  /// resolução de ABERTURA: ela corre sozinha depois da primeira pintura, e
  /// trocar a lista debaixo de quem acabou de digitar uma cidade é o pior
  /// desfecho possível. No TOQUE ele invertia o sentido do botão.
  ///
  /// **Medido em teste de widget, sem aparelho:** basta digitar uma cidade no
  /// filtro, ou tocar `Ver todas`, para `_pessoaMexeu` ficar verdadeiro **pelo
  /// resto da sessão**. Dali em diante o botão continuava oferecido e
  /// habilitado, o toque pedia a permissão ao sistema, gastava uma resolução do
  /// teto de uso da plataforma, recebia a cidade — e **jogava fora**, sem
  /// trocar um pixel. Dois dos três caminhos que levam alguém a tocar nesse
  /// botão (ver a lista de outra cidade e querer voltar; ter tocado `Ver todas`
  /// e querer o recorte de volta) passam por `_pessoaMexeu`.
  ///
  /// No toque, **a pessoa acabou de escolher a localização**: ela é a escolha
  /// mais nova e ganha do que foi digitado antes. Por isso [porToque] limpa
  /// [_pessoaMexeu] e [_cidadeDigitada] — sem limpar os dois, a precedência de
  /// [_cidadeEmUso] devolveria a cidade digitada e a resolução continuaria sem
  /// efeito.
  Future<void> _resolverEAplicar(
    LocalizacaoDaSessao sessao, {
    required bool porToque,
  }) async {
    // **O `timeout` NÃO é rede sobre rede.** Ver `tetoDaEsperaDaCidade`: o
    // prazo que a porta recebe cobre a MEDIÇÃO do ponto, e não a resolução do
    // nome da cidade, que não tem prazo em pacote nenhum.
    //
    // **O motivo da desistência deixou de ser `semFixNoPrazo` em 20/10/2026.**
    // Aquele é o aparelho não fixando a posição, e ele tem prazo próprio
    // (`prazoDaMedicaoDaCidade`) dentro da porta. ESTE é o teto de fora, e ele
    // estoura quando o serviço de plataforma não responde — com os dois no
    // mesmo valor, "o GPS não pegou" e "a Apple não respondeu" chegavam
    // indistinguíveis no relato de quem usa o app, e as duas têm conserto
    // diferente. **Sem `const`**: o detalhe interpola o prazo.
    // **O PRAZO E O TETO MUDARAM DE LUGAR, e nao desapareceram**: os dois
    // vivem agora em `LocalizacaoDaSessao.cidade`, junto com a guarda de "ja
    // resolvida" e a de "resolucao em voo". As tres precisam ficar do mesmo
    // lado: um teto nesta tela sobre um `Future` compartilhado desistiria
    // **para esta tela** e deixaria o pendurado valendo para as outras.
    //
    // `forcar: porToque`: a ABERTURA aceita a cidade que outra secao desta
    // sessao ja resolveu -- e o pedido de 22/10 inteiro. O TOQUE pede medicao
    // nova, porque quem toca esta pedindo para tentar de novo.
    final resultado = await sessao.cidade(forcar: porToque);
    if (!mounted) return;
    switch (resultado) {
      case CidadeNaoResolvida(motivo: final motivo, detalhe: final detalhe):
        // **NA ABERTURA, os nove motivos continuam caindo para a reserva sem
        // uma palavra**, e isso é decisão e não omissão: ninguém pediu nada, e
        // faixa ali seria erro inventado em cima de uma reserva.
        if (!porToque) return;
        // **NO TOQUE, alguém pediu.** Não responder é o defeito.
        setState(() {
          // O código vai para a tela junto com a frase. Ver
          // [ListaDePerdidos.comCodigo]: é o aparelho do cliente virando
          // instrumento, porque esteira de aparelho este projeto não tem.
          _codigoDoAviso = motivo.codigo;
          _detalheDoAviso = detalhe;
          _aviso = switch (motivo) {
            MotivoDeNaoTerCidade.permissaoNegada ||
            MotivoDeNaoTerCidade.permissaoNegadaPermanentemente =>
              _AvisoDaLocalizacao.semPermissao,
            MotivoDeNaoTerCidade.servicoDesligado =>
              _AvisoDaLocalizacao.servicoDesligado,
            // **`semResultado` SAIU do grupo dos quatro**, e é a única saída
            // deste `switch` que não é falha: a plataforma respondeu, descreveu
            // o lugar, e nome de cidade não veio. A reserva nacional já está
            // pintada embaixo da faixa — chamar isso de "não deu" ensina a
            // pessoa a desconfiar de uma tela que está funcionando.
            MotivoDeNaoTerCidade.semResultado =>
              _AvisoDaLocalizacao.cidadeSemNome,
            MotivoDeNaoTerCidade.semFixNoPrazo ||
            MotivoDeNaoTerCidade.resolucaoSemResposta ||
            MotivoDeNaoTerCidade.indisponivel ||
            MotivoDeNaoTerCidade.geocoderAusente ||
            MotivoDeNaoTerCidade.falhaDoServico =>
              _AvisoDaLocalizacao.cidadeNaoDescoberta,
          };
        });
        return;
      case CidadeResolvida(cidade: final cidade):
        if (porToque) {
          // A ESCOLHA MAIS NOVA É O TOQUE. Ver o cabeçalho deste método.
          _pessoaMexeu = false;
          _cidadeDigitada = null;
        } else {
          // Quem mexeu no filtro enquanto a resolução de abertura corria
          // MANDA: trocar a lista debaixo de quem acabou de escolher é o pior
          // desfecho possível.
          if (_pessoaMexeu) return;
          if (cidade == _cidadeDoAparelho) return;
          // A resolucao GANHA da guardada e da regiao: ela e a unica que diz
          // onde a pessoa esta AGORA.
          if (cidade == _cidadeEmUso) {
            setState(() => _cidadeDoAparelho = cidade);
            return;
          }
        }
        setState(() {
          _cidadeDoAparelho = cidade;
          _aviso = null;
          _codigoDoAviso = null;
          _detalheDoAviso = null;
        });
        await _carregar();
        if (!mounted || !porToque) return;
        // **A QUARTA FRASE, e ela só é verificável DEPOIS da resposta.** A
        // localização funcionou e a cidade não tem caso aberto: sem dizer isso,
        // o desfecho bom com lista vazia é indistinguível do botão não ter
        // feito nada.
        if (_fase == _Fase.lista && _itens.isEmpty) {
          setState(() {
            _cidadeDoAviso = cidade;
            _aviso = _AvisoDaLocalizacao.semPetsNaCidade;
          });
        }
    }
  }
  /// A região cadastrada do tutor. **Lida só pelo filtro de bairro**: a cidade
  /// dela deixou de recortar a lista em 19/10/2026.
  RegiaoDeReferencia? get _regiao =>
      Escopo.of(context).sessao.usuario?.regiaoDeReferencia;

  String? get _meuBairro {
    final b = _regiao?.bairro?.trim();
    return (b == null || b.isEmpty) ? null : b;
  }

  Future<void> _carregar({bool maisUma = false}) async {
    if (!mounted) return;
    // **NÃO HÁ MAIS PORTA AQUI.** Havia um `if (cidade == null)` que punha a
    // tela em `_Fase.semCidade` e devolvia sem chamar a rota: sem cidade a
    // operação respondia 400, então pedir era desperdiçar uma chamada para
    // receber erro. A cidade deixou de ser obrigatória em 19/10/2026 e a porta
    // virou o contrário do pedido — ela é o que impedia a lista de abrir.
    //
    // O recorte acompanha a cidade que vale AGORA: a resolução pode ter
    // chegado depois da primeira carga, e a região pode trocar com um login.
    final cidade = _cidadeEmUso;
    final atual =
        (_recorte ?? const RecorteDePerdidos()).copiar(cidade: cidade);
    // **Guardada ANTES da chamada, e sem `await`.** Guardar depois perderia a
    // cidade de quem fechou o aplicativo enquanto a lista carregava, e esperar
    // a gravação atrasaria a lista por uma conveniência. Nula não apaga a
    // guardada: quem escolheu "todas" nesta sessão não perdeu a cidade do
    // aparelho da sessão passada.
    if (cidade != null) unawaited(_cidadeGuardada.guardar(cidade));

    final int geracao;
    if (maisUma) {
      if (_carregandoMais) return;
      geracao = _geracao;
      setState(() {
        _carregandoMais = true;
        _falhaAoCarregarMais = false;
      });
    } else {
      geracao = ++_geracao;
      setState(() {
        _fase = _Fase.carregando;
        _agora = DateTime.now();
      });
    }

    final pedido = atual.copiar(pagina: maisUma ? _pagina + 1 : 1);
    final api = PerdidosApi(Escopo.of(context).api);

    try {
      final pagina = await api.listar(pedido);
      if (!mounted || geracao != _geracao) return;
      setState(() {
        _recorte = atual;
        _itens = maisUma
            ? <PerdidoPublico>[..._itens, ...pagina.itens]
            : pagina.itens;
        _total = pagina.total;
        _pagina = pagina.pagina;
        _fase = _Fase.lista;
        _carregandoMais = false;
      });
      // A AREA FOI VISTA -- zera o selo da aba `Pets` (BICHUS-278).
      //
      // **Aqui, e nao no toque na aba:** o momento honesto e quando a lista
      // CHEGOU na tela, e e a mesma escolha que `area_de_mensagens.dart` fez
      // com `aoVerAArea`. Marcar no toque zeraria o numero de quem abriu a aba
      // e levou um erro de rede -- a pessoa nao viu nada e o selo teria sumido.
      //
      // **`!maisUma`:** a pagina 2 nao e uma visita nova, e marcar nela
      // gastaria um pedido por rolagem.
      //
      // **`unawaited`, e a falha e engolida dentro de `marcarSecaoVista`:** a
      // lista acabou de carregar, e uma faixa de erro em cima dela por causa de
      // um contador seria um erro sobre operacao que ninguem pediu.
      if (!maisUma) {
        unawaited(
          Escopo.of(context).contadores.marcarSecaoVista(SecaoComContador.pets),
        );
      }
    } on FalhaDeChamada {
      _falhou(geracao, maisUma: maisUma);
    } on FormatException {
      _falhou(geracao, maisUma: maisUma);
    }
  }

  void _falhou(int geracao, {required bool maisUma}) {
    if (!mounted || geracao != _geracao) return;
    setState(() {
      if (maisUma) {
        // A página seguinte falhou: os cartões que já estão na tela ficam,
        // porque o recorte deles é o mesmo. Apagar tudo porque a terceira
        // página não chegou seria punir quem rolou mais.
        _carregandoMais = false;
        _falhaAoCarregarMais = true;
        return;
      }
      // Os cartões antigos saem: sob uma faixa de erro eles afirmariam um
      // recorte que a tela não conseguiu aplicar.
      _itens = const <PerdidoPublico>[];
      _fase = _Fase.falha;
    });
  }

  void _trocarRecorte(RecorteDePerdidos novo) {
    setState(() => _recorte = novo);
    _carregar();
  }

  ControleDeBusca _controleDeBusca() {
    return ControleDeBusca(
      controlador: _buscaControlador,
      alcance: AlcanceDaBusca.servidor,
      rotulo: ListaDePerdidos.rotuloDaBusca,
      termoAplicado: _recorte?.termoLimpo,
      // `maxLength: 60` no contrato, e `minLength` não existe em `q`: o piso de
      // dois caracteres é do índice trigrama, que não produz trigrama nenhum
      // com menos — e com menos a busca volta a varrer a tabela.
      minimoDeCaracteres: 2,
      aoAplicar: (termo) {
        final base = _recorte;
        if (base == null) return;
        if (termo == base.termoLimpo) return;
        _trocarRecorte(base.copiar(termo: termo, pagina: 1));
      },
    );
  }

  /// O campo de cidade da folha. **Sempre presente, e OPCIONAL desde
  /// 19/10/2026.**
  ///
  /// `obrigatorio` não é mais passado (o padrão de `CampoDeTextoDoFiltro` é
  /// `false`), e a diferença é inteira: com ele, campo vazio desabilitava o
  /// `Aplicar` e o `Limpar` da folha não limpava este campo. Sem ele, apagar a
  /// cidade é um recorte válido — e é assim que quem digitou uma cidade volta a
  /// ver todas sem fechar a folha.
  ///
  /// `valor` é **o que o recorte de fato tem**, e não uma sugestão: campo que
  /// mostra cidade que o servidor não aplicou é o defeito de 18/10 com outro
  /// nome.
  ///
  /// `textoDeValidacao` continua, e continua valendo: `minLength: 2` é do
  /// contrato e vale para quem MANDA o parâmetro. Vazio é omissão e passa;
  /// uma letra só é 400 e a folha o barra antes.
  CampoDeTextoDoFiltro get _campoDaCidade => CampoDeTextoDoFiltro(
        chave: 'city',
        rotulo: ListaDePerdidos.rotuloDaCidade,
        // O que o recorte de fato tem -- e ele carrega a cidade derivada
        // quando ela é a que está valendo, porque é ela que o servidor
        // aplicou. Mostrar o campo vazio com a lista recortada seria o
        // inverso do defeito de 18/10, e igualmente mentiroso.
        valor: _recorte?.cidadeLimpa,
        textoDeValidacao: ListaDePerdidos.validacaoDaCidade,
        // Os dois números são do contrato (`minLength: 2, maxLength: 80`), e
        // não escolhas desta tela.
        limite: 80,
        minimoDeCaracteres: 2,
        exemplo: ListaDePerdidos.exemploDaCidade,
      );

  ControleDeFiltro _controleDeFiltro() {
    final base = _recorte;
    final bairro = _meuBairro;
    if (base == null) {
      // Primeira pintura, antes da primeira resposta: a folha oferece a CIDADE
      // e só ela, porque as pastilhas recortariam uma lista que ainda não
      // chegou. Com a cidade opcional esta janela é curta — a carga não espera
      // mais ninguém digitar nada.
      return ControleDeFiltro(
        grupos: const <GrupoDeFiltro>[],
        campos: <CampoDeTextoDoFiltro>[_campoDaCidade],
      );
    }
    return ControleDeFiltro(
      campos: <CampoDeTextoDoFiltro>[_campoDaCidade],
      grupos: <GrupoDeFiltro>[
        // O CONJUNTO, e ele é o PRIMEIRO grupo da folha (cliente, 20/10/2026:
        // *"o pet ganha um selo/filtro na pagina de pets como encontrado por 30
        // dias e depois ele expira e sai"*).
        //
        // Primeiro porque ele não recorta a mesma lista que os outros quatro:
        // ele diz QUAIS casos a lista traz. Lido depois de `Espécie` e `Porte`,
        // pareceria um filtro a mais sobre os perdidos.
        //
        // **Nasce SEM pastilha marcada**, pelo mesmo motivo de `period`: nulo é
        // a página como ela abre — e desde a segunda decisão do cliente de
        // 20/10/2026 (*"Também na lista padrão"*) isso quer dizer os abertos
        // **mais** os reencontrados na janela, juntos, cada cartão com o seu
        // selo. Marcar `Perdidos` por padrão poria o parâmetro na query e o
        // devolveria em `applied_filters`, e a linha do recorte diria que há um
        // filtro aplicado numa página que ninguém filtrou — além de ESCONDER os
        // reencontrados de quem nunca abriu a folha.
        GrupoDeFiltro(
          chave: 'case_state',
          titulo: 'Estado',
          selecionado: base.estado?.codigo,
          opcoes: <OpcaoDeRecorte>[
            for (final e in EstadoDoCasoNaLista.values)
              OpcaoDeRecorte(codigo: e.codigo, rotulo: e.rotulo),
          ],
          // A nota diz TRÊS coisas, e nenhuma delas é promessa: que a lista
          // já vem com os dois, o que `Encontrados` quer dizer, e os 30 dias.
          //
          // A primeira entrou com a união: sem ela, a pessoa que vê um cartão
          // com selo na lista não entende de onde ele veio, e quem escolhe
          // `Encontrados` e acha pouco não sabe que o resto estava junto. A
          // terceira evita que `Encontrados` pareça "todos os que já voltaram",
          // e a lista curta vire defeito aparente.
          nota: 'A lista já traz os dois. Encontrados mostra só quem voltou com '
              'a ajuda de alguém da comunidade, nos últimos 30 dias.',
        ),
        // O bairro só entra quando há UM para oferecer, e o único que este app
        // conhece é o da própria região cadastrada. Uma lista de bairros da
        // cidade não existe em lugar nenhum deste produto, e inventá-la a
        // partir dos casos que voltaram ofereceria um recorte diferente a cada
        // página.
        if (bairro != null)
          GrupoDeFiltro(
            chave: 'neighborhood',
            titulo: 'Bairro',
            selecionado: base.bairro,
            opcoes: <OpcaoDeRecorte>[
              OpcaoDeRecorte(codigo: bairro, rotulo: bairro),
            ],
            nota: 'O bairro que você cadastrou no perfil.',
          ),
        GrupoDeFiltro(
          chave: 'species',
          titulo: 'Espécie',
          selecionado: base.especie?.valor,
          opcoes: <OpcaoDeRecorte>[
            for (final e in Especie.values)
              OpcaoDeRecorte(codigo: e.valor, rotulo: e.rotulo),
          ],
        ),
        GrupoDeFiltro(
          chave: 'size',
          titulo: 'Porte',
          selecionado: base.porte?.valor,
          opcoes: <OpcaoDeRecorte>[
            for (final p in Porte.values)
              OpcaoDeRecorte(codigo: p.valor, rotulo: p.rotulo),
          ],
        ),
        GrupoDeFiltro(
          chave: 'period',
          titulo: 'Perdido desde',
          // **Nasce SEM pastilha marcada** (cliente, 18/10/2026): nulo e
          // "qualquer janela", e e o estado em que a pagina de pets abre.
          selecionado: base.janela?.codigo,
          opcoes: <OpcaoDeRecorte>[
            for (final j in JanelaDePerdidos.values)
              OpcaoDeRecorte(codigo: j.codigo, rotulo: j.rotulo),
          ],
          nota: 'A janela conta de quando o pet foi visto pela última vez.',
        ),
      ],
    );
  }

  /// O `Aplicar` da folha: **um** recorte, **uma** chamada à rota.
  void _aplicarAFolha(EscolhaDaFolha escolha) {
    // A CIDADE É UM FILTRO COMO OS OUTROS DESDE 19/10/2026, e o tratamento
    // especial dela saiu daqui inteiro. O que havia: a cidade era lida antes de
    // tudo, guardada em `_cidadeDigitada` e **só quando não-vazia** — apagar o
    // campo era indistinguível de não tocar nele, e a cidade anterior
    // continuava valendo. Com o campo opcional, esvaziar é um recorte, e é o
    // caminho de volta para "todas as cidades".
    final base = _recorte ?? const RecorteDePerdidos();
    // **A PARTIR DAQUI A ESCOLHA DELA MANDA, inclusive quando é "nenhuma".**
    // Sem esta linha, apagar o campo não teria efeito: a cidade do aparelho
    // voltaria a valer no quadro seguinte, porque nulo é indistinguível de
    // "não mexeu" numa precedência escrita com `??`.
    _pessoaMexeu = true;
    _cidadeDigitada = escolha.filtros['city'];
    // A faixa falava do TOQUE anterior, e o recorte acabou de trocar: manter a
    // frase a transformaria em afirmação sobre uma lista que ela não descreve.
    _aviso = null;
    _cidadeDoAviso = null;
    _codigoDoAviso = null;
    _detalheDoAviso = null;
    _trocarRecorte(
      base.copiar(
        // `escolha.filtros['city']` nulo ou vazio limpa a cidade: quem apaga o
        // campo volta a ver todas. `cidadeLimpa` no modelo apara o espaço, e é
        // ele que decide se `city` entra na query.
        cidade: escolha.filtros['city'],
        bairro: escolha.filtros['neighborhood'],
        especie: Especie.de(escolha.filtros['species']),
        porte: Porte.de(escolha.filtros['size']),
        // **Limpar a pastilha deixa a janela NULA**, e `period` sai da
        // consulta. Era o contrário até 18/10/2026: a tela repunha `30d`, e a
        // lista voltava recortada sem ninguém ter pedido. Quem decide o que
        // fazer com a ausência é o servidor, pelo `default: 30d` que o
        // contrato declara na rota — o app parou de escolher por ele.
        janela: JanelaDePerdidos.de(escolha.filtros['period']),
        // **Limpar a pastilha deixa o estado NULO**, e `case_state` sai da
        // consulta -- a página volta aos casos abertos sem dizer o nome deles.
        // Mesma mecânica da janela logo acima, e pelo mesmo motivo.
        estado: EstadoDoCasoNaLista.de(escolha.filtros['case_state']),
        pagina: 1,
      ),
    );
  }

  /// ## A CAIXA DO RECORTE APARECE, OU NÃO — decisão do cliente, 20/10/2026
  ///
  /// Nas palavras dele: *"remova essa box de localização depois de aceito e
  /// funcionando, deve apenas aparecer dentro do filtro a cidade
  /// selecionada."*
  ///
  /// **Enquanto não há cidade valendo, a caixa é a única coisa na tela que
  /// explica e que oferece saída** — o botão, e as quatro frases do estado não
  /// resolvido. Depois que a cidade está valendo, ela repete o que o filtro já
  /// mostra: `_campoDaCidade` carrega `_recorte?.cidadeLimpa`, que é a cidade
  /// que o servidor de fato aplicou.
  ///
  /// ## O critério é "há cidade em uso", e NÃO [_pessoaMexeu]
  ///
  /// E isso não é detalhe: `_pessoaMexeu` é exatamente o guarda que produziu o
  /// defeito de 20/10/2026 (ver o cabeçalho deste arquivo). Ele responde "a
  /// pessoa interagiu", e a pergunta aqui é outra — "esta tela tem cidade". Um
  /// desenho pendurado nele esconderia a caixa de quem tocou e mostraria para
  /// quem a resolução de abertura atendeu, que é o avesso do pedido.
  ///
  /// ## CAIXA QUE SOME SEM DEIXAR CAMINHO É PIOR QUE CAIXA QUE FICA
  ///
  /// Por isso "há cidade em uso" sozinho **não** basta, e a razão é medida e não
  /// receio: `CidadeEscolhida` guarda a cidade da última busca, então na SEGUNDA
  /// sessão deste app `_cidadeEmUso` já nasce preenchido por
  /// [_cidadeDaUltimaBusca] — e `Me.reference_area.city` faz o mesmo por
  /// [_cidadeDaRegiao] em toda conta com região cadastrada. Com o critério nu, a
  /// caixa nunca apareceria para essas pessoas, e **`Usar minha localização`
  /// deixaria de existir para elas** — a folha de filtro oferece a cidade (ver
  /// [_campoDaCidade]) e **não** oferece a localização. Seria retirar o recurso
  /// de quem nunca o usou, em silêncio, para atender um pedido sobre quem já o
  /// usou.
  ///
  /// O pedido do cliente é sobre o DESFECHO BOM: *"depois de aceito e
  /// funcionando"*. Então a caixa só sai quando ela não tem mais nada a fazer —
  /// há cidade valendo **e** a localização não tem nada a oferecer nem nada
  /// pendente. [_podeOferecerLocalizacao] já é exatamente "a localização ainda
  /// pode dar em algo", e é falso justamente no caso do cliente (cidade do
  /// aparelho valendo).
  ///
  /// ## O estado NÃO RESOLVIDO mantém a caixa, e é por isso que há um par
  ///
  /// `procurando`, `semPermissao`, `servicoDesligado`, `cidadeNaoDescoberta` e
  /// `cidadeSemNome` são os cinco em que a localização não entregou cidade, e em
  /// todos a caixa fica.
  ///
  /// **[_localizacaoPendente] não é redundante com [_podeOferecerLocalizacao],
  /// e o caso que os separa é real:** quem abre com a cidade guardada da sessão
  /// passada e toca o botão num build sem localização recebe
  /// [PermissaoDeLocalizacao.indisponivel] — e aí `_permissao` passa a
  /// `indisponivel` **no mesmo `setState`** que põe a frase na tela
  /// ([_pedirEResolver]). `_podeOferecerLocalizacao` vira falso nesse instante,
  /// e sem esta segunda condição a caixa sairia levando consigo a explicação que
  /// o toque acabou de produzir. Regra explícita, e não efeito colateral da
  /// regra do botão: foi o acoplamento entre duas regras que produziu o defeito
  /// original.
  ///
  /// `semPetsNaCidade` é o único aviso que NÃO é pendência: nele a localização
  /// funcionou e a cidade está valendo. A caixa sai, e a frase dele continua —
  /// ela é irmã da caixa na coluna, não filha, e sem ela a lista vazia volta a
  /// ser indistinguível de botão que não fez nada.
  ///
  /// DESLIGANDO (os dois lados, e cada caso pega um):
  /// trocar por `=> true` reprova `a caixa SOME quando a localização já deu
  /// cidade`; trocar por `=> false` reprova `a caixa FICA em todo estado não
  /// resolvido`.
  bool get _caixaDoRecorteAparece =>
      _cidadeEmUso == null || _podeOferecerLocalizacao || _localizacaoPendente;

  /// A localização ainda não entregou cidade, e a caixa tem função.
  ///
  /// **Nulo é FALSO**, e não "indefinido": nulo é ninguém ter tocado nada, e
  /// nesse estado quem decide é a existência de cidade, não o aviso.
  bool get _localizacaoPendente => switch (_aviso) {
        null => false,
        _AvisoDaLocalizacao.procurando ||
        _AvisoDaLocalizacao.semPermissao ||
        _AvisoDaLocalizacao.servicoDesligado ||
        _AvisoDaLocalizacao.cidadeNaoDescoberta ||
        _AvisoDaLocalizacao.cidadeSemNome =>
          true,
        // A localização FUNCIONOU. Ver [ListaDePerdidos.avisoSemPetsNaCidade].
        _AvisoDaLocalizacao.semPetsNaCidade => false,
      };

  /// Oferecer `Usar minha localização` só faz sentido quando ela ainda pode
  /// dar em algo.
  ///
  /// **Negada em definitivo CONTINUA oferecendo**, e o toque abre os ajustes
  /// em vez de um diálogo que não abre — é o que a porta do aparelho manda
  /// fazer nesse estado. O que não se oferece é o caminho que já deu certo
  /// (cidade do aparelho valendo) e o que não existe neste build
  /// ([PermissaoDeLocalizacao.indisponivel]).
  bool get _podeOferecerLocalizacao {
    if (_cidadeDoAparelho != null && !_pessoaMexeu) return false;
    return _permissao != PermissaoDeLocalizacao.indisponivel;
  }

  /// A frase da faixa do toque, ou nula quando não há faixa.
  String? get _textoDoAviso => switch (_aviso) {
        null => null,
        _AvisoDaLocalizacao.procurando => ListaDePerdidos.avisoProcurando,
        _AvisoDaLocalizacao.semPermissao => ListaDePerdidos.avisoSemPermissao,
        _AvisoDaLocalizacao.servicoDesligado =>
          ListaDePerdidos.avisoServicoDesligado,
        _AvisoDaLocalizacao.cidadeNaoDescoberta =>
          ListaDePerdidos.avisoCidadeNaoDescoberta,
        _AvisoDaLocalizacao.cidadeSemNome =>
          ListaDePerdidos.avisoCidadeSemNome,
        _AvisoDaLocalizacao.semPetsNaCidade =>
          ListaDePerdidos.avisoSemPetsNaCidade(_cidadeDoAviso ?? ''),
      };

  /// A frase da faixa COM o código do motivo, que é o que a tela mostra.
  ///
  /// Separada de [_textoDoAviso] para os casos de teste poderem medir a frase e
  /// o código em asserções diferentes: um código errado colado numa frase certa
  /// passaria num `contains` da frase inteira.
  String? get _textoDaFaixa {
    final frase = _textoDoAviso;
    final codigo = _codigoDoAviso;
    if (frase == null || codigo == null) return frase;
    return ListaDePerdidos.comCodigo(frase, codigo, _detalheDoAviso);
  }

  /// A saída que a faixa oferece, **e ela não é a mesma nas quatro**.
  ///
  /// `procurando` não oferece nada porque não há o que fazer esperando, e
  /// `semPetsNaCidade` não oferece nada porque **nada deu errado**: a saída
  /// dali é o filtro, que já está na tela logo abaixo.
  String? get _rotuloDaAcaoDoAviso => switch (_aviso) {
        _AvisoDaLocalizacao.semPermissao ||
        _AvisoDaLocalizacao.servicoDesligado =>
          ListaDePerdidos.rotuloDeAbrirAjustes,
        _AvisoDaLocalizacao.cidadeNaoDescoberta =>
          ListaDePerdidos.rotuloDeTentarALocalizacao,
        // **`cidadeSemNome` não oferece `Tentar de novo`, e é deliberado**:
        // tentar no mesmo ponto devolve o mesmo nada e gasta o teto de uso. A
        // saída dali é o filtro, que já está na tela logo acima.
        _AvisoDaLocalizacao.cidadeSemNome ||
        _AvisoDaLocalizacao.procurando ||
        _AvisoDaLocalizacao.semPetsNaCidade ||
        null =>
          null,
      };

  VoidCallback? get _acaoDoAviso => switch (_aviso) {
        _AvisoDaLocalizacao.semPermissao ||
        _AvisoDaLocalizacao.servicoDesligado =>
          () => Escopo.of(context)
              .localizacaoDaSessao
              .abrirAjustesDoSistema(),
        _AvisoDaLocalizacao.cidadeNaoDescoberta => _pedirEResolver,
        _AvisoDaLocalizacao.cidadeSemNome ||
        _AvisoDaLocalizacao.procurando ||
        _AvisoDaLocalizacao.semPetsNaCidade ||
        null =>
          null,
      };

  /// `Ver todas`: tira a cidade do recorte, venha ela de onde vier.
  void _verTodas() {
    _pessoaMexeu = true;
    _cidadeDigitada = null;
    _aviso = null;
    _cidadeDoAviso = null;
    _codigoDoAviso = null;
    _detalheDoAviso = null;
    final base = _recorte ?? const RecorteDePerdidos();
    _trocarRecorte(base.copiar(cidade: null, pagina: 1));
  }

  bool get _temRecorteAtivo {
    final base = _recorte;
    if (base == null) return false;
    // **A CIDADE CONTA AGORA.** Enquanto era obrigatória ela não podia contar:
    // ela estava sempre lá, e `_temRecorteAtivo` seria sempre verdadeiro, o que
    // faria a lista vazia dizer "com esse recorte" mesmo para quem não filtrou
    // nada. Opcional, ela é um recorte de verdade — quem digitou uma cidade e
    // não achou nada precisa ler que foi o recorte, não que não há perdidos.
    return base.cidadeLimpa != null ||
        base.temBusca ||
        base.bairro != null ||
        base.especie != null ||
        base.porte != null ||
        base.janela != null ||
        // O CONJUNTO CONTA como recorte, inclusive `Perdidos` dito em voz alta:
        // quem escolheu `Encontrados` e não achou nada precisa ler que foi o
        // recorte, e não que a comunidade nunca encontrou nenhum animal.
        base.estado != null;
  }

  @override
  Widget build(BuildContext context) {
    final sessao = Escopo.of(context).sessao;
    return AnimatedBuilder(
      animation: sessao,
      builder: (context, _) {
        // **O REAGENDAMENTO POR CIDADE SAIU.** Ele existia porque entrar ou
        // sair trocava a região, a região era fonte de cidade, e a tela tinha
        // de sair ou entrar na fase `semCidade`. Sem aquela fase e sem a
        // região recortando, entrar não muda o recorte desta lista: o que entrar
        // passa a oferecer é a opção de BAIRRO na folha, e a folha é montada a
        // cada pintura. O `AnimatedBuilder` fica — é ele que repinta a folha.
        final busca = _controleDeBusca();
        final filtro = _controleDeFiltro();
        // O campo de busca aparece **exatamente** quando a barra apareceria: a
        // decisão é uma só e mora no componente. Sem isto, a seção sem perdido
        // nenhum desenharia um campo de busca sobre o nada.
        final comControles = _fase == _Fase.lista &&
            BarraDeListagem.desenha(
              total: _total,
              busca: busca,
              filtro: filtro,
              aoAplicar: _aplicarAFolha,
            );

        return Column(
          crossAxisAlignment: CrossAxisAlignment.stretch,
          children: <Widget>[
            // **A LINHA QUE DIZ O RECORTE, e ela aparece nos TRÊS estados.**
            // Ela vem antes da busca e do filtro de propósito: é a resposta à
            // pergunta "por que estes pets?", e quem não a lê primeiro conclui
            // que a lista está errada. Só não aparece enquanto a primeira
            // carga está no ar, porque aí ela afirmaria um recorte que ainda
            // não voltou do servidor.
            //
            // **E ELA SOME DEPOIS QUE A CIDADE ESTÁ VALENDO** (cliente,
            // 20/10/2026). Ver [_caixaDoRecorteAparece]: o vestígio passa a ser
            // a cidade dentro do filtro, e a troca de cidade é lá.
            if (_fase != _Fase.carregando && _caixaDoRecorteAparece) ...<Widget>[
              _LinhaDoRecorte(
                cidade: _cidadeEmUso,
                origem: _origemDaCidade,
                podeOferecerLocalizacao: _podeOferecerLocalizacao,
                aoVerTodas: _verTodas,
                // **Nulo DESABILITA o botão**, e só enquanto o aparelho mede:
                // um segundo toque pediria a permissão de novo e gastaria o
                // teto de uso da plataforma de novo, pela mesma resposta.
                aoUsarLocalizacao: _aviso == _AvisoDaLocalizacao.procurando
                    ? null
                    : _pedirEResolver,
              ),
              const SizedBox(height: BichuEspaco.e4),
            ],
            // **A FAIXA DO TOQUE VIVE FORA DA GUARDA DE `carregando`**, e isso
            // é o ponto: o desfecho bom recarrega a lista, e uma faixa que
            // desaparecesse durante a recarga deixaria a quarta frase sem
            // chance de aparecer. `Procurando sua localização…` também
            // sobrevive à recarga por isto.
            if (_textoDaFaixa != null) ...<Widget>[
              FaixaDeAviso(
                texto: _textoDaFaixa!,
                // **`informativo`, nunca `erro`.** Nenhum dos quatro desfechos
                // é falha do fluxo: a lista está na tela em todos, pela
                // reserva. A tinta Brasa com borda de 2 px é da urgência.
                peso: PesoDaFaixa.informativo,
                rotuloDaAcao: _rotuloDaAcaoDoAviso,
                aoTocarNaAcao: _acaoDoAviso,
              ),
              const SizedBox(height: BichuEspaco.e4),
            ],
            // **O GATILHO DE FILTRO VEM NA FRENTE DA BUSCA, na mesma
            // linha** (cliente, 18/10/2026). Era `CampoDeBuscaDaListagem`
            // sozinho aqui e o gatilho com rotulo logo abaixo, desenhado pela
            // barra; agora a linha e uma so e sobe inteira, e a barra deixa de
            // desenhar o gatilho por causa de `buscaAcima`.
            if (comControles) ...<Widget>[
              LinhaDeBuscaDaListagem(
                total: _total,
                busca: busca,
                filtro: filtro,
                aoAplicar: _aplicarAFolha,
              ),
              const SizedBox(height: BichuEspaco.e4),
            ],
            if (_fase == _Fase.lista)
              BarraDeListagem(
                total: _total,
                substantivo: const SubstantivoDaListagem(
                  singular: 'pet perdido',
                  plural: 'pets perdidos',
                ),
                // O campo já foi desenhado acima; a barra recebe o controle
                // para saber do TERMO APLICADO, e não para desenhar de novo.
                buscaAcima: true,
                busca: busca,
                filtro: filtro,
                aoAplicar: _aplicarAFolha,
              ),
            ..._corpo(),
          ],
        );
      },
    );
  }

  List<Widget> _corpo() {
    switch (_fase) {
      case _Fase.carregando:
        return <Widget>[
          Semantics(
            label: 'Carregando pets perdidos',
            liveRegion: true,
            child: const Column(
              children: <Widget>[
                _EsqueletoDePerdido(),
                SizedBox(height: BichuEspaco.e4),
                _EsqueletoDePerdido(),
              ],
            ),
          ),
        ];
      case _Fase.falha:
        return <Widget>[
          FaixaDeAviso(
            texto: ListaDePerdidos.falha,
            rotuloDaAcao: ListaDePerdidos.rotuloDeTentar,
            aoTocarNaAcao: _carregar,
          ),
        ];
      case _Fase.lista:
        if (_itens.isEmpty) {
          return <Widget>[
            _UmaLinha(
              texto: _temRecorteAtivo
                  ? ListaDePerdidos.vazioFiltrado
                  : ListaDePerdidos.vazio,
            ),
          ];
        }
        return <Widget>[
          for (var i = 0; i < _itens.length; i++) ...<Widget>[
            if (i > 0) const SizedBox(height: BichuEspaco.e4),
            // O TOQUE PASSOU A TER DESTINO (cliente, 18/10/2026: *"quando o
            // pet esta perdido, deve ter uma pagina interna do pet"*).
            //
            // O cabecalho de `CartaoDoPerdido` dizia que `aoTocar` era nulo
            // porque "a tela do caso publico por token nao existe no app", e
            // era verdade: `getPublicLostCase` era consumida so pelo SITE.
            // Agora existe (`TelaDoCasoPublico`), e o destino e o endereco do
            // proprio `share_url` -- **nunca `/pets/:petId`**, que e enderecada
            // por UUID interno (ADR-0010, item 6), e cujo id esta
            // deliberadamente ausente desta projecao.
            CartaoDoPerdido(
              perdido: _itens[i],
              agora: _agora,
              aoTocar: () => context.push(
                Rotas.casoPublicoDe(_itens[i].shareToken),
              ),
            ),
          ],
          const SizedBox(height: espacoAcimaDoRodape),
          RodapeDaPaginacao(
            carregados: _itens.length,
            total: _total,
            carregando: _carregandoMais,
            textoDaFalha: _falhaAoCarregarMais ? ListaDePerdidos.falha : null,
            aoPedirMais: () => _carregar(maisUma: true),
            fimDaLista: ListaDePerdidos.fimDaLista,
          ),
        ];
    }
  }
}

/// A LINHA QUE DIZ QUAL RECORTE ESTÁ VALENDO, e de onde ele veio.
///
/// Ela existe por uma exigência que veio junto com a decisão de derivar a
/// cidade: **a pessoa tem de ver que a cidade foi preenchida sozinha e poder
/// mudar.** Cidade derivada em silêncio é pior que cidade nenhuma — quem abre
/// o app numa viagem e vê os pets da cidade onde está, sem explicação, conclui
/// que a lista está quebrada; e quem vê os pets da cidade de casa, estando
/// longe, conclui o mesmo pelo motivo oposto.
///
/// Os quatro estados, e os quatro dizem a origem:
///
/// | origem | o que a linha diz | a saída que ela oferece |
/// |---|---|---|
/// | aparelho | `Pets perdidos em São Paulo · da sua localização` | `Ver todas` |
/// | região | `Pets perdidos em São Paulo · da sua região cadastrada` | `Ver todas` + `Usar minha localização` |
/// | escolhida | `Pets perdidos em Campinas` | `Ver todas` |
/// | nenhuma | `Pets perdidos de todo o Brasil` | `Usar minha localização` |
///
/// **`escolhida` não diz a origem**, e a ausência é deliberada: quem digitou a
/// cidade sabe de onde ela veio, e um rótulo "que você escolheu" seria o app
/// explicando à pessoa o que ela acabou de fazer.
///
/// `Ver todas` não aparece quando não há cidade, porque já é o estado atual;
/// `Usar minha localização` não aparece quando a cidade do aparelho já está
/// valendo, nem quando a localização não existe neste build.
///
/// **O que o TOQUE deixa na tela não é desenhado aqui**, e a separação é de
/// propósito: a faixa das quatro frases é irmã desta linha na coluna da seção,
/// e não filha dela. Dentro, ela desapareceria junto com a linha enquanto a
/// recarga do desfecho bom corre — e a quarta frase ("a localização funcionou,
/// e não há pet aí") só existe depois dessa recarga.
class _LinhaDoRecorte extends StatelessWidget {
  const _LinhaDoRecorte({
    required this.cidade,
    required this.origem,
    required this.podeOferecerLocalizacao,
    required this.aoVerTodas,
    required this.aoUsarLocalizacao,
  });

  final String? cidade;
  final _OrigemDaCidade origem;
  final bool podeOferecerLocalizacao;
  final VoidCallback aoVerTodas;

  /// **Nulo desenha o botão DESABILITADO**, e não o esconde. Esconder o único
  /// controle que a pessoa acabou de tocar faria o toque parecer ter apagado
  /// a saída; desabilitado ela vê que o toque foi recebido.
  final VoidCallback? aoUsarLocalizacao;

  String get _texto {
    final c = cidade;
    if (c == null) return ListaDePerdidos.semRecorteGeografico;
    return switch (origem) {
      _OrigemDaCidade.aparelho =>
        'Pets perdidos em $c \u00b7 ${ListaDePerdidos.origemDoAparelho}',
      _OrigemDaCidade.regiao =>
        'Pets perdidos em $c \u00b7 ${ListaDePerdidos.origemDaRegiao}',
      _OrigemDaCidade.ultimaBusca =>
        'Pets perdidos em $c \u00b7 ${ListaDePerdidos.origemDaUltimaBusca}',
      _OrigemDaCidade.escolhida => 'Pets perdidos em $c',
      _OrigemDaCidade.nenhuma => ListaDePerdidos.semRecorteGeografico,
    };
  }

  @override
  Widget build(BuildContext context) {
    final cores = BichuColors.of(context).cores;
    final textos = Theme.of(context).textTheme;
    return Container(
      width: double.infinity,
      padding: const EdgeInsets.symmetric(
        horizontal: BichuEspaco.e4,
        vertical: BichuEspaco.e3,
      ),
      decoration: BoxDecoration(
        color: cores.surfaceSunken,
        borderRadius: BorderRadius.circular(BichuRaio.md),
        border: Border.all(color: cores.outline, width: BichuBorda.hairline),
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: <Widget>[
          // `liveRegion`: a linha TROCA quando a resolução chega, depois da
          // lista já estar pintada. Sem isto, quem usa leitor de tela veria a
          // lista mudar de recorte sem nada ser anunciado.
          Semantics(
            liveRegion: true,
            child: Text(_texto, style: textos.bodyMedium),
          ),
          if (cidade != null || podeOferecerLocalizacao) ...<Widget>[
            const SizedBox(height: BichuEspaco.e2),
            Wrap(
              spacing: BichuEspaco.e4,
              children: <Widget>[
                if (cidade != null)
                  TextButton(
                    onPressed: aoVerTodas,
                    child: const Text(ListaDePerdidos.rotuloDeVerTodas),
                  ),
                if (podeOferecerLocalizacao)
                  TextButton(
                    onPressed: aoUsarLocalizacao,
                    child:
                        const Text(ListaDePerdidos.rotuloDeUsarLocalizacao),
                  ),
              ],
            ),
          ],
        ],
      ),
    );
  }
}

/// O estado vazio desta seção: **uma linha**, e nada mais.
///
/// `EstadoVazio` exige `titulo` e `explicacao`, e explicação é a segunda linha
/// que o cliente mandou remover em 18/10/2026. A moldura é a mesma — fundo
/// afundado, raio `lg`, borda `hairline` —, para o vazio continuar parecendo o
/// vazio do resto do app.
class _UmaLinha extends StatelessWidget {
  const _UmaLinha({required this.texto});

  final String texto;

  @override
  Widget build(BuildContext context) {
    final cores = BichuColors.of(context).cores;
    return Container(
      width: double.infinity,
      padding: const EdgeInsets.all(BichuEspaco.e6),
      decoration: BoxDecoration(
        color: cores.surfaceSunken,
        borderRadius: BorderRadius.circular(BichuRaio.lg),
        border: Border.all(color: cores.outline, width: BichuBorda.hairline),
      ),
      child: Text(texto, style: Theme.of(context).textTheme.titleMedium),
    );
  }
}

/// O esqueleto do cartão, com a mesma geometria do cartão de verdade: sem isso
/// a lista dá um salto de layout quando os dados chegam.
class _EsqueletoDePerdido extends StatelessWidget {
  const _EsqueletoDePerdido();

  @override
  Widget build(BuildContext context) {
    final cores = BichuColors.of(context).cores;
    return Container(
      padding: const EdgeInsets.all(BichuEspaco.e4),
      decoration: BoxDecoration(
        color: cores.surface,
        borderRadius: BorderRadius.circular(BichuRaio.lg),
        border: Border.all(color: cores.outline, width: BichuBorda.hairline),
      ),
      child: Row(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: <Widget>[
          const Moldura(
            largura: BichuMoldura.larguraFotoSm,
            estado: EstadoDaMoldura.carregando,
          ),
          const SizedBox(width: BichuEspaco.e4),
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: <Widget>[
                _Barrinha(cor: cores.surfaceSunken, fracao: 0.4),
                const SizedBox(height: BichuEspaco.e2),
                _Barrinha(cor: cores.surfaceSunken, fracao: 0.8),
                const SizedBox(height: BichuEspaco.e2),
                _Barrinha(cor: cores.surfaceSunken, fracao: 0.6),
              ],
            ),
          ),
        ],
      ),
    );
  }
}

class _Barrinha extends StatelessWidget {
  const _Barrinha({required this.cor, required this.fracao});

  final Color cor;
  final double fracao;

  @override
  Widget build(BuildContext context) {
    return FractionallySizedBox(
      alignment: Alignment.centerLeft,
      widthFactor: fracao,
      child: Container(
        height: BichuEspaco.e3,
        decoration: BoxDecoration(
          color: cor,
          borderRadius: BorderRadius.circular(BichuRaio.sm),
        ),
      ),
    );
  }
}
