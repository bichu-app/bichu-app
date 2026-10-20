import '../../widgets/arrastar_para_atualizar.dart';
import 'dart:async';

import 'package:flutter/material.dart';
import 'package:go_router/go_router.dart';

import '../../api/falhas.dart';
import '../../api/modelos.dart';
import '../../api/modelos_perdido.dart';
import '../../api/modelos_pet.dart';
import '../../api/perdidos_api.dart';
import '../../escopo.dart';
import '../../dispositivo/localizacao.dart';
import '../../roteamento/rotas.dart';
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

/// O prazo da resolucao da cidade.
///
/// Generoso de proposito: a tela NAO espera por ele -- a lista ja esta pintada
/// com a reserva quando a resolucao comeca. O prazo existe para a tentativa
/// nao ficar pendurada para sempre no aparelho que nao fixa, e nao para a
/// pessoa esperar.
const Duration prazoDaResolucao = Duration(seconds: 12);

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
    final porta = Escopo.of(context).localizacao;
    final permissao = await porta.estado();
    if (!mounted) return;
    setState(() => _permissao = permissao);
    if (permissao != PermissaoDeLocalizacao.concedida) return;
    await _resolverEAplicar(porta, porToque: false);
  }

  /// O caminho do TOQUE: pede a permissão e, concedida, resolve.
  ///
  /// Este é o único lugar que chama `pedir()`, e ele só roda a partir de
  /// [ListaDePerdidos.rotuloDeUsarLocalizacao] — um ato da pessoa, com o
  /// rótulo dizendo o que vai acontecer. Negada em definitivo, abre os
  /// ajustes, porque pedir de novo não abre diálogo nenhum.
  Future<void> _pedirEResolver() async {
    final porta = Escopo.of(context).localizacao;
    final antes = await porta.estado();
    if (!mounted) return;
    if (antes == PermissaoDeLocalizacao.negadaPermanentemente) {
      await porta.abrirAjustesDoSistema();
      return;
    }
    final depois = await porta.pedir();
    if (!mounted) return;
    setState(() => _permissao = depois);
    if (depois != PermissaoDeLocalizacao.concedida) return;
    await _resolverEAplicar(porta, porToque: true);
  }

  /// [porToque] separa os DOIS donos desta resolução, e a separação é o
  /// conserto de 20/10/2026.
  ///
  /// **O defeito, medido:** a guarda `_pessoaMexeu` abaixo valia para os dois
  /// caminhos, e por isso `Usar minha localização` **não fazia nada** no único
  /// estado em que ele é oferecido. A conta fecha assim: o botão só aparece
  /// quando `_cidadeDoAparelho == null` **ou** `_pessoaMexeu` (ver
  /// [_podeOferecerLocalizacao]); quem já tem cidade do aparelho e tocou em
  /// `Ver todas` cai no segundo caso -- e aí a resolução chegava, encontrava
  /// `_pessoaMexeu` ligado e voltava na primeira linha. Nenhum erro, nenhuma
  /// faixa, nada na tela: o toque era descartado em silêncio.
  ///
  /// A guarda está CERTA para o caminho automático, que é para o que ela foi
  /// escrita: aquele dispara sozinho depois da primeira carga, e trocar a
  /// lista debaixo de quem acabou de filtrar é o pior desfecho possível.
  ///
  /// No caminho do TOQUE ela inverte o sentido: a pessoa leu `Usar minha
  /// localização` e tocou. Esse é o ato dela, e o que ele significa é
  /// **devolver a decisão ao aparelho** -- por isso o toque limpa
  /// `_pessoaMexeu` e `_cidadeDigitada` em vez de respeitá-los. Com eles
  /// limpos, [_cidadeEmUso] volta a `_cidadeDoAparelho` e o botão deixa de ser
  /// oferecido, que é o estado "o caminho já deu certo".
  Future<void> _resolverEAplicar(
    Localizacao porta, {
    required bool porToque,
  }) async {
    final resultado = await porta.cidadeAproximada(prazo: prazoDaResolucao);
    if (!mounted) return;
    switch (resultado) {
      case CidadeNaoResolvida():
        // Os oito motivos terminam aqui, e aqui não faz nada: a lista já está
        // na tela com a reserva. Pintar aviso seria transformar em erro o que
        // o ADR chama de reserva.
        return;
      case CidadeResolvida(cidade: final cidade):
        if (porToque) {
          // **O TOQUE DEVOLVE A DECISÃO AO APARELHO**, e as três linhas são
          // uma coisa só: sem limpar `_pessoaMexeu` a precedência de
          // [_cidadeEmUso] continuaria lendo `_cidadeDigitada`, e sem limpar
          // `_cidadeDigitada` a cidade digitada antes voltaria a valer no
          // quadro seguinte.
          //
          // **E não há `if (cidade == _cidadeDoAparelho) return` aqui**, de
          // propósito: no caso comum ela é IGUAL -- a abertura já resolveu a
          // mesma cidade, e o que mudou foi a pessoa ter pedido `Ver todas` em
          // cima dela. Voltar cedo por igualdade deixaria o toque sem efeito
          // outra vez, pelo outro motivo.
          setState(() {
            _cidadeDoAparelho = cidade;
            _pessoaMexeu = false;
            _cidadeDigitada = null;
          });
          await _carregar();
          return;
        }
        // Quem mexeu no filtro enquanto a resolução corria MANDA: trocar a
        // lista debaixo de quem acabou de escolher é o pior desfecho possível.
        if (_pessoaMexeu) return;
        if (cidade == _cidadeDoAparelho) return;
        // A resolucao GANHA da guardada e da regiao: ela e a unica que diz
        // onde a pessoa esta AGORA.
        if (cidade == _cidadeEmUso) {
          setState(() => _cidadeDoAparelho = cidade);
          return;
        }
        setState(() => _cidadeDoAparelho = cidade);
        await _carregar();
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
        pagina: 1,
      ),
    );
  }

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

  /// `Ver todas`: tira a cidade do recorte, venha ela de onde vier.
  void _verTodas() {
    _pessoaMexeu = true;
    _cidadeDigitada = null;
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
        base.janela != null;
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
            if (_fase != _Fase.carregando) ...<Widget>[
              _LinhaDoRecorte(
                cidade: _cidadeEmUso,
                origem: _origemDaCidade,
                podeOferecerLocalizacao: _podeOferecerLocalizacao,
                aoVerTodas: _verTodas,
                aoUsarLocalizacao: _pedirEResolver,
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
  final VoidCallback aoUsarLocalizacao;

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
