import 'dart:async';

import 'package:flutter/material.dart';
import 'package:go_router/go_router.dart';

import '../../api/conexoes_api.dart';
import '../../api/falhas.dart';
import '../../api/mensagens_de_erro.dart';
import '../../api/modelos_conexao.dart';
import '../../api/modelos_pessoa.dart';
import '../../api/pessoas_api.dart';
import '../../roteamento/rotas.dart';
import '../../theme/bichu_colors.dart';
import '../../theme/bichu_tokens.g.dart';
import '../../widgets/arrastar_para_atualizar.dart';
import '../../widgets/barra_de_listagem.dart';
import '../../widgets/convite_para_entrar.dart';
import '../../widgets/faixa_de_aviso.dart';
import '../../widgets/rodape_da_paginacao.dart';
import '../casca_com_abas.dart';
import 'cartao_de_pessoa_encontrada.dart';

/// O corpo da aba `Usuários` da `Rede`: **encontrar e adicionar pessoas**.
///
/// Pedido do cliente, literal: *"tem que ter uma pagina para o usuário buscar
/// os amigos... Na aba rede, temos que ter uma aba de usuários, e o campo
/// buscar para encontrar e adicionar as pessoas"*.
///
/// ## ESTA ABA REVERTE UMA RECUSA ESCRITA, e a reversão é dele
///
/// Até 20/10/2026 não havia busca de pessoas em lugar nenhum do produto, e a
/// recusa estava registrada em quatro lugares — o plano 4-C.5, a migração
/// `20261018000030`, a porta `convite-de-conexao.ts` e a emenda 2 do ADR-0010.
/// Os freios que vieram junto **são parte da decisão e não enfeite**, e os
/// quatro estão desenhados aqui: piso de três caracteres, campo vazio nunca
/// lista ninguém, teto de consultas por conta, e resposta limitada a nome e
/// duas contagens.
///
/// ## NÃO HÁ FILTRO NESTA ABA, E A AUSÊNCIA FOI DECIDIDA — NÃO ESQUECIDA
///
/// **Isto contraria o padrão desta casa**, e o padrão é dele: *"suba todos os
/// filtros para a barra do título da página e deixe o campo de busca sempre
/// ocupando a área toda"* (17/10/2026), e toda listagem do app tem o gatilho de
/// recorte. Está escrito aqui, e com os motivos, porque a próxima pessoa que
/// abrir este arquivo vai achar que faltou terminar o trabalho.
///
/// O que haveria para filtrar, item por item:
///
/// | Candidato | Por que não |
/// |---|---|
/// | cidade e bairro | a **emenda 2 do ADR-0010** os recusou expressamente para quem não tem relação com a pessoa: o teto geográfico do ADR não é permissão para expor onde alguém mora. Filtrar por eles exigiria recebê-los, e a busca não os recebe |
/// | contagem de pets | transformaria a contagem em **critério de busca**. A emenda 2 abriu o número para ser lido no cartão, não para selecionar gente por ele |
/// | contagem de conexões | premiaria quem tem mais, e isso é outro produto |
/// | ordenar por nome | é **uma** opção, e uma opção não é uma escolha |
///
/// Sobra zero grupo de filtro e uma ordem única. E [BarraDeListagem] já faz a
/// coisa certa com isso: ela **não desenha** o gatilho quando o filtro não tem
/// opção e a ordenação tem uma só. Então a ausência aqui não é um `if` nesta
/// tela — é consequência de passar `filtro: null` e `ordenacao: null`, que é a
/// verdade sobre esta listagem.
///
/// Um gatilho que abrisse uma folha sem nada para mudar seria toque sem
/// desfecho, que é o critério 2 da BICHUS-62. **Se um dia houver o que
/// recortar, o lugar é aqui e os dois parâmetros voltam a ter valor** — nada
/// mais precisa mudar.
///
/// ## A BUSCA DISPARA AO DIGITAR, COM ESPERA — e a espera É o freio
///
/// **Esta seção substitui a que justificava a ausência de *debounce*, e a
/// reversão é do cliente (22/10/2026).** O que havia antes era medido e
/// continua registrado abaixo; o que ele viu foi outra coisa — digitou o nome,
/// nada aconteceu, e concluiu que a busca não funciona. Medido no aparelho no
/// mesmo dia, por contadores de rede com controle positivo e negativo: digitar
/// `souza` não gerava **um byte**; tocar a lupa gerava. O servidor estava certo
/// em tudo (`q=lima` → `total=1`, acento casando nos dois sentidos, a foto
/// saindo, 401 sem token).
///
/// A tela agora busca **por pausa de digitação, nunca por letra**:
/// [BuscaDePessoas.esperaAntesDeBuscar], 400 ms depois da última tecla. **A
/// lupa continua existindo e continua aplicando na hora** — quem não quer
/// esperar toca, e o toque cancela a espera pendente para que um pedido não
/// custe duas consultas.
///
/// **Os três freios de 20/10/2026 não mudaram de lugar**: só dispara acima do
/// piso de [PessoasApi.minimoDaBusca], campo vazio nunca lista ninguém, e a
/// lupa continua não habilitando abaixo do piso — o nome acessível dela diz
/// quantas letras faltam, e desde 22/10 **a tela escreve a mesma contagem**
/// (ver [_explicacaoDoVazio]).
///
/// ### UMA DAS DUAS JUSTIFICATIVAS ANTIGAS MORREU
///
/// A prosa daqui dava duas razões. **A primeira deixou de ser verdade**: ela
/// dizia que *"o servidor instalado responde 400 abaixo de três caracteres"*, e
/// isso foi consertado — hoje a rota responde **200 com lista vazia**
/// (`o-piso-da-busca-nao-recusa-na-borda.test.ts` no lado do servidor; medido
/// de ponta a ponta em 22/10 com `q=a` e `q=ab`). Buscar ao digitar já não
/// mostraria faixa vermelha no meio de alguém escrevendo um nome. **Ela saiu
/// daqui porque passou a mentir.**
///
/// **A segunda é a que decide, e é a única que vale: o teto de 60 consultas
/// por hora por conta.** Está em `people-search-routes.ts`, na entrada
/// `rateLimit` da dimensão `[account, q]` de `searchPeople` — e `q` ali marca
/// **presença** de busca e não o termo digitado, então as 60 contam *toda*
/// consulta e não as repetições de um termo. (A outra entrada, `[account]` com
/// 120/h, é o teto da rota.) Buscar a cada letra queimaria o teto em segundos.
///
/// **A espera é exatamente o que respeita esse teto**: ela faz uma *pausa* — e
/// não uma letra — valer uma consulta.
///
/// ### DE ONDE VEM 400 ms: o que foi medido, e o que não foi
///
/// A espera **não é escolha de gosto nem duração de animação**. Medido na
/// bancada em 22/10/2026 (o arquivo de medição não ficou; os números abaixo são
/// o que ele imprimiu), com `souza` digitado letra por letra:
///
/// | o que | medido |
/// |---|---|
/// | a borda da espera | 399 ms depois da tecla → **0** consultas; 400 ms → **1** |
/// | `souza` a 80, 150, 250, 350 ou 399 ms por tecla | **1** consulta — 60 nomes por hora de teto |
/// | `souza` a 400, 450 ou 600 ms por tecla | **3** consultas — 20 nomes por hora |
/// | `souza` com a espera em `Duration.zero` | **3** consultas (as duas primeiras letras estão abaixo do piso e nunca perguntam) |
///
/// **A medição mostra que a espera é o orçamento de cadência, um para um**: ela
/// absorve exatamente as pausas menores que ela, e um nome digitado mais devagar
/// do que isso volta a custar três consultas — o mesmo que não ter espera
/// nenhuma. Daí o número: 400 ms compra a faixa inteira até 399 ms por tecla;
/// 300 ms compraria só até 299, e deixaria quem digita entre 300 e 399 ms por
/// tecla pagando triplo sem saber por quê. **A escolha de 400 e não de 300 é
/// julgamento e não medição** — ver o parágrafo seguinte.
///
/// **O que NÃO foi medido, e por isso não está afirmado aqui**: a cadência real
/// de digitação de uma pessoa neste produto, e o tempo de ida e volta da rota
/// no aparelho — as duas coisas decidiriam o limite de cima da espera, e
/// nenhuma das duas sai de uma bancada de widget.
///
/// ## O CARTÃO NÃO TEM FOTO, e o contrato não tem o campo
///
/// A **emenda 5 item 2 do ADR-0010** diz que a foto não sai para quem não é
/// conexão aceita, e resultado de busca é **por construção** lista de
/// não-conexões — se quem busca conhecesse a pessoa, não precisaria buscar. O
/// `PersonSearchResult` não tem campo de foto, nem nulo, e o círculo do cartão
/// é a **inicial**, que é o recurso que a emenda 3 já manda usar com quem não é
/// conexão.
///
/// ## O ESTADO DA RELAÇÃO VEM NA BUSCA DESDE 22/10/2026, e este bloco dizia o
/// contrário
///
/// **ESTA SEÇÃO MENTIA, e a mentira custou caro**: em 26/10/2026 ela foi lida
/// como a causa do defeito que o cliente cobrou pela segunda vez, e o diagnóstico
/// saiu errado por causa dela.
///
/// O texto antigo dizia que `PersonSearchResult` **não traz**
/// `connection_state`, *"de propósito"*, citando *"numa lista, vinte estados por
/// requisição são o material de que uma lista de conexões se faz do lado de
/// fora"* — e concluía que o cartão nascia em `nenhum` e aprendia o estado
/// verdadeiro só da resposta da própria ação.
///
/// **Nada disso é verdade desde 22/10/2026.** O cliente autorizou a lista das
/// próprias conexões (`listMyConnections`), e com ela o argumento caiu para o
/// próprio dono: ele já obtém o conjunto das suas conexões por uma rota
/// legítima, então devolvê-lo recortado nos resultados da busca **dele** não
/// entrega nada novo. A seção `connection_state` no RESULTADO DA BUSCA
/// (22/10/2026) da emenda 2 do ADR-0010 registra a decisão, e o contrato
/// declara o campo **obrigatório** em `PersonSearchResult`, com quatro valores
/// (`none`, `pending_sent`, `pending_received`, `connected`).
///
/// **É sempre o par com quem busca — nunca a relação entre duas outras
/// pessoas**, e é essa distinção que separa isto da lista de conexões de
/// terceiro, que continua não existindo.
///
/// Então o cartão **nasce no estado que o servidor mandou**
/// ([PessoaEncontrada.estadoDaConexao]) e segue aprendendo da resposta da
/// própria ação, que continua idempotente. Ver `CartaoDePessoaEncontrada`: há um
/// cartão por estado, e `connected` não oferece pedir.
///
/// **E a identidade do cartão na lista é o apelido** — ver a `key` em
/// [_EstadoDaBuscaDePessoas], e o comentário lá diz por que sem ela o defeito
/// voltava na SEGUNDA busca mesmo com o estado certo chegando do servidor.
class BuscaDePessoas extends StatefulWidget {
  const BuscaDePessoas({
    required this.pessoas,
    required this.conexoes,
    required this.logado,
    super.key,
  });

  /// As duas portas entram por PARAMETRO e nao saem do `Escopo` aqui dentro,
  /// e o precedente e `TelaDePerfilDePessoa`: e isto que permite montar esta
  /// aba num teste de widget sem construir as vinte e nove dependencias do
  /// escopo so para exercitar um campo de busca.
  final PessoasApi pessoas;

  final ConexoesApi conexoes;

  /// Há sessão agora. **Entra como DADO, e não como ramo de desenho.**
  ///
  /// Esta aba desenha o mesmo corpo logada e deslogada, e quem decide o que
  /// aparece continua sendo a resposta do servidor — `secao_da_rede.dart` diz,
  /// e continua valendo, que ramificar o corpo por `logado` criaria a segunda
  /// regra de "quem pode buscar". Não é isso que este campo faz: ele não
  /// escolhe widget nenhum. Ele existe porque **a mudança de sessão invalida o
  /// estado da busca**, e o estado da busca mora aqui dentro — ver
  /// [_EstadoDaBuscaDePessoas.didUpdateWidget] para o defeito que isso
  /// conserta.
  final bool logado;

  /// Quanto a tela espera, depois da última tecla, antes de buscar.
  ///
  /// **400 ms, e o número está justificado na seção "A BUSCA DISPARA AO
  /// DIGITAR, COM ESPERA" do cabeçalho desta classe.** Não é gosto, e não é
  /// animação: é o que transforma uma *pausa* em uma consulta, que é como o
  /// teto de 60/h continua sendo respeitado depois de a busca passar a
  /// disparar ao digitar.
  static const Duration esperaAntesDeBuscar = Duration(milliseconds: 400);

  /// O rótulo do campo. Diz **as duas coisas que a busca aceita**, porque uma
  /// pessoa que não sabe que o apelido serve busca pelo nome e desiste.
  static const String rotuloDaBusca = 'Buscar usuários por nome ou apelido';

  static const String tituloAntesDeBuscar = 'Procure quem você já conhece';

  /// A explicação do estado inicial, e ela tem **duas frases curtas** — era
  /// uma até 22/10/2026, e a segunda só existe porque a primeira deixou de
  /// poder dizer as duas coisas (ver abaixo).
  ///
  /// A versão do protótipo trazia, abaixo do vazio, um bloco `Como funciona`
  /// com três linhas de ensino. Ele não entrou: o cliente removeu os textos de
  /// apoio das telas em 18/10/2026 (*"isso está deixando o app poluído"*), e
  /// três parágrafos explicando o que é conexão são exatamente isso. O que
  /// sobra é o que a pessoa precisa para agir agora.
  ///
  /// **ELA MENTIA DESDE 22/10/2026, e a redacao desta linha e MINHA** -- o
  /// cliente nao a escreveu, e ela pode ser revista por ele. O texto antigo
  /// era *"Digite o nome ou o apelido de alguem e toque na lupa."*, e ele
  /// exigia o toque: a busca passou a disparar **ao digitar**, por pausa de
  /// 400 ms ([esperaAntesDeBuscar]), e a frase continuou mandando tocar na
  /// lupa. Quem obedecesse ao texto tocaria uma lupa que a espera ja ia
  /// resolver sozinha.
  ///
  /// **E ELE MANDOU TIRAR A SEGUNDA FRASE EM 23/10/2026**, palavras dele:
  /// *"Tire a parte a busca acontece sozinha ou toque na lupa."*
  ///
  /// O paragrafo que estava aqui defendia a mencao a lupa -- *"a lupa continua
  /// na frase porque ela continua funcionando"* -- e essa defesa era MINHA, nao
  /// dele. Ele leu a frase na tela e cortou. **Nenhuma decisao dele esta sendo
  /// desfeita**: a redacao desta linha nunca foi pedido seu, e a unica coisa
  /// que ele havia decidido sobre ela era que a busca dispara ao digitar, que e
  /// justamente o que a frase curta nao contradiz.
  ///
  /// **A LUPA NAO SAIU DA TELA, so da frase.** O controle continua montado e
  /// continua aplicando na hora (ver a secao `A BUSCA DISPARA AO DIGITAR` no
  /// cabecalho), e e por isso que o caso que vigiava isto passou a medir o
  /// WIDGET em vez do texto: afirmar no texto que a lupa existe deixou de ser
  /// possivel, e trocar a afirmacao por um `findsNothing` sobre a palavra seria
  /// uma afirmacao que passa no vazio.
  static const String explicacaoAntesDeBuscar =
      'Digite o nome ou o apelido de alguém.';

  static const String tituloNadaEncontrado = 'Nada com esse nome';

  /// **A tela nunca diz "esta pessoa não existe".**
  ///
  /// Conta desabilitada, apelido de pet, apelido reservado e quem bloqueou quem
  /// busca somem do resultado pelo mesmo caminho — os cinco estão na cláusula
  /// `WHERE`. Distinguir "não casou ninguém" de "casou alguém que você não pode
  /// ver" seria dizer *"existe alguém assim, mas não para você"*, que é o
  /// oráculo que a busca não pode ser, e a informação que gera retaliação.
  static const String explicacaoNadaEncontrado =
      'Confira a escrita, ou busque pelo apelido. Quem não tem conta no Bichu '
      'não aparece aqui.';

  static const String carregando = 'Buscando usuários';

  static const SubstantivoDaListagem substantivo = SubstantivoDaListagem(
    singular: 'usuário',
    plural: 'usuários',
  );

  @override
  State<BuscaDePessoas> createState() => _EstadoDaBuscaDePessoas();
}

enum _Fase { antesDeBuscar, carregando, lista, falha }

class _EstadoDaBuscaDePessoas extends State<BuscaDePessoas>
    with PublicaAAtualizacao {
  final TextEditingController _campo = TextEditingController();

  _Fase _fase = _Fase.antesDeBuscar;

  /// O termo que **produziu** a lista na tela, e nunca o que está digitado.
  ///
  /// O texto do controlador é intenção, e intenção não recorta lista. É este
  /// campo que [BarraDeListagem] lê para saber se a lupa tem o que aplicar.
  String? _termoAplicado;

  PaginaDeBuscaDePessoas? _pagina;
  final List<PessoaEncontrada> _itens = <PessoaEncontrada>[];
  bool _carregandoMais = false;
  String? _falhaDeMais;
  String? _textoDaFalha;
  bool _faltaConta = false;

  /// Quantos pedidos ainda cabem na janela corrida de 24 h, **vindo do
  /// servidor**.
  ///
  /// Nulo é "não sei", e não zero: zero é a afirmação de que o teto fechou, e
  /// uma tela que tratasse "não consegui perguntar" como teto fechado esconderia
  /// a ação de quem ainda podia pedir. Com nulo o cartão oferece a ação e deixa
  /// o servidor recusar — que é a ordem certa de errar.
  int? _pedidosQueAindaCabem;

  bool _visivel = false;
  bool _cargaAgendada = false;

  /// A espera em curso entre a última tecla e a busca, ou nulo.
  ///
  /// **Cancelada em `dispose`**, e isso não é zelo: um `Timer` pendente quando
  /// a árvore cai reprova a bancada inteira com *"a Timer is still pending"*,
  /// e no aparelho ele buscaria para uma tela que já saiu.
  Timer? _espera;

  /// O texto da última notificação que MEXEU no texto.
  ///
  /// [TextEditingController] avisa também quando só a seleção ou o cursor
  /// muda — tocar no campo, mover o caret, perder o foco. Sem esta comparação
  /// cada um desses avisos reiniciaria a espera, e a busca de quem parou de
  /// digitar e tocou no próprio texto nunca sairia.
  String _ultimoTexto = '';

  @override
  void initState() {
    super.initState();
    _campo.addListener(_aoDigitar);
  }

  @override
  Future<void> aoArrastarParaAtualizar() => _recarregar();

  /// **ENTRAR NA CONTA INVALIDA O ESTADO DA BUSCA.** Conserta um defeito medido.
  ///
  /// Reproduzido em 22/10/2026: deslogado, buscar `lima` responde 401, o corpo
  /// troca para [ConviteParaEntrar], a pessoa entra pela porta `Entrar` e volta
  /// à aba — e a aba **continuava desenhando o convite, já logada**, com a lupa
  /// morta. Tocar nela não gerava byte nenhum.
  ///
  /// A causa não era o convite: era `_podeAplicar` de
  /// [CampoDeBuscaDaListagem]. [_termoAplicado] tinha ficado com `'lima'` do
  /// 401, o texto digitado continuava `'lima'`, e "o digitado é igual ao
  /// aplicado" é precisamente a condição em que a lupa **não** habilita. O
  /// único jeito de sair era mudar o texto.
  ///
  /// **O conserto é na causa**: [_termoAplicado] é o termo que PRODUZIU a lista
  /// que está na tela, e uma lista produzida sem conta não é a lista desta
  /// conta. Quando a sessão muda, aquele termo deixou de ter produzido coisa
  /// alguma, e [_limparABusca] é o que diz isso. O texto digitado fica — a
  /// pessoa escreveu e não apagou —, e com o aplicado em nulo a lupa volta a
  /// habilitar sem ninguém mexer numa letra.
  ///
  /// **Vale nos dois sentidos**, e sair é o mesmo argumento: a lista da conta
  /// que saiu não é lista de quem ficou no aparelho.
  ///
  /// **A tela não busca sozinha aqui.** Entrar na conta não é pedir uma busca,
  /// e gastar uma das 60 consultas da hora por um login seria a tela decidindo
  /// pela pessoa. O que ela recupera é a capacidade de pedir.
  @override
  void didUpdateWidget(BuscaDePessoas anterior) {
    super.didUpdateWidget(anterior);
    if (anterior.logado == widget.logado) return;
    _espera?.cancel();
    _limparABusca();
    // O teto de pedidos da conta nova não é o da anterior, e deslogado ele
    // nem pôde ser lido.
    _agendarLeituraDoTeto();
  }

  @override
  void didChangeDependencies() {
    super.didChangeDependencies();
    // A ABA INATIVA FICA `Offstage`, e `TickerMode` é como ela sabe disso.
    // Sem esta guarda a aba leria o resumo das conexões ao ser montada atrás
    // de `Eventos`, gastando teto por uma tela que ninguém abriu.
    if (!TickerMode.valuesOf(context).enabled) {
      _visivel = false;
      return;
    }
    if (_visivel) return;
    _visivel = true;
    _agendarLeituraDoTeto();
  }

  void _agendarLeituraDoTeto() {
    if (_cargaAgendada) return;
    _cargaAgendada = true;
    WidgetsBinding.instance.addPostFrameCallback((_) {
      _cargaAgendada = false;
      if (mounted) unawaited(_lerOTeto());
    });
  }

  @override
  void dispose() {
    _espera?.cancel();
    _campo.removeListener(_aoDigitar);
    _campo.dispose();
    super.dispose();
  }

  ConexoesApi get _conexoes => widget.conexoes;

  PessoasApi get _pessoas => widget.pessoas;

  /// Lê `getMyConnectionSummary` **antes de qualquer pedido**.
  ///
  /// O teto é cobrado na tela porque descobrir um limite de 24 horas por um 400
  /// depois de apertar o botão é descobrir depois de apertar — e o 400 continua
  /// tratado, porque entre a leitura e o toque alguém pode ter pedido de outro
  /// aparelho.
  ///
  /// **A falha é engolida de propósito.** Isto não é dado que a pessoa pediu:
  /// se o resumo não vem, [_pedidosQueAindaCabem] fica nulo e a ação continua
  /// oferecida. Uma faixa de erro aqui culparia a busca por uma leitura
  /// auxiliar.
  Future<void> _lerOTeto() async {
    try {
      final resumo = await _conexoes.resumo();
      if (!mounted) return;
      setState(() => _pedidosQueAindaCabem = resumo.remainingRequestsToday);
    } on FalhaDeChamada {
      if (!mounted) return;
      setState(() => _pedidosQueAindaCabem = null);
    }
  }

  Future<void> _recarregar() async {
    final termo = _termoAplicado;
    if (termo == null) {
      await _lerOTeto();
      return;
    }
    await _buscar(termo);
  }

  Future<void> _buscar(String termo) async {
    setState(() {
      _fase = _Fase.carregando;
      _termoAplicado = termo;
      _itens.clear();
      _pagina = null;
      _textoDaFalha = null;
      _falhaDeMais = null;
      _faltaConta = false;
    });
    try {
      final pagina = await _pessoas.buscar(termo);
      if (!mounted) return;
      setState(() {
        _pagina = pagina;
        _itens.addAll(pagina.itens);
        _fase = _Fase.lista;
      });
      // O teto é relido junto: quem volta à busca depois de pedir a alguém
      // precisa ver o teto de agora, e não o da primeira abertura da aba.
      await _lerOTeto();
    } on FalhaDeChamada catch (falha) {
      if (!mounted) return;
      setState(() {
        _fase = _Fase.falha;
        _faltaConta = faltaConta(falha);
        _textoDaFalha = MensagensDeErro.de(falha).texto;
      });
    }
  }

  /// A reação à tecla: **agenda**, e nunca busca na hora.
  ///
  /// Os três freios de 20/10/2026 continuam aqui, e nenhum deles mudou de
  /// lugar: acima do piso de [PessoasApi.minimoDaBusca] e **só** acima dele;
  /// campo vazio não agenda nada; e uma consulta por **pausa**, não por letra.
  ///
  /// O ramo abaixo do piso faz a segunda coisa que o cliente pediu em
  /// 22/10/2026: **o resultado velho sai da tela**. Medido antes do conserto:
  /// com `li` no campo a aba seguia mostrando *"1 pessoa — Ana Souza"* da busca
  /// anterior, com a lupa apagada e sem dizer por quê — *"digita um nome novo,
  /// toca, e aparece a pessoa errada"*. [_limparABusca] é o que tira a lista, e
  /// o que ocupa o lugar dela diz quantas letras faltam (ver
  /// [_explicacaoDoVazio]).
  void _aoDigitar() {
    final texto = _campo.text;
    if (texto == _ultimoTexto) return;
    _ultimoTexto = texto;
    _espera?.cancel();

    final digitado = texto.trim();
    if (digitado.length < PessoasApi.minimoDaBusca) {
      // Nada é agendado, e o que estava na tela sai. `setState` no ramo de
      // baixo porque a contagem de letras que falta é desenhada no corpo e
      // muda a cada tecla, mesmo quando não havia lista para limpar.
      if (_termoAplicado != null || _fase != _Fase.antesDeBuscar) {
        _limparABusca();
      } else {
        setState(() {});
      }
      return;
    }

    // Já é esta a lista na tela: a espera não existe para repetir a consulta
    // que acabou de sair.
    if (digitado == _termoAplicado) {
      setState(() {});
      return;
    }

    _espera = Timer(BuscaDePessoas.esperaAntesDeBuscar, () {
      if (!mounted) return;
      // **Relê o campo no fim da espera, e não usa o termo de quando ela
      // começou.** As duas divergem sempre que a última tecla chega durante a
      // espera, que é o caso comum de digitar um nome.
      final termo = _campo.text.trim();
      if (termo.length < PessoasApi.minimoDaBusca) return;
      if (termo == _termoAplicado) return;
      unawaited(_buscar(termo));
    });
    setState(() {});
  }

  /// A explicação do vazio: a contagem de letras **quando ela existe**.
  ///
  /// **A frase não é escrita aqui.** Ela vem de [ControleDeBusca.faltamLetras],
  /// que é a mesma que o nome acessível da lupa já dizia — uma redação só, e
  /// esta tela só a põe de pé. Nulo acima do piso e com campo vazio, e aí o
  /// vazio volta a ser o de abertura.
  String? _explicacaoDoVazio() {
    final faltam = _controleDaBusca().faltamLetras;
    if (faltam == null) return null;
    return '${faltam[0].toUpperCase()}${faltam.substring(1)}.';
  }

  void _limparABusca() {
    _espera?.cancel();
    setState(() {
      _fase = _Fase.antesDeBuscar;
      _termoAplicado = null;
      _itens.clear();
      _pagina = null;
      _textoDaFalha = null;
      _falhaDeMais = null;
      _faltaConta = false;
    });
  }

  Future<void> _carregarMais() async {
    final atual = _pagina;
    final termo = _termoAplicado;
    if (atual == null || termo == null || _carregandoMais) return;
    setState(() {
      _carregandoMais = true;
      _falhaDeMais = null;
    });
    try {
      final proxima = await _pessoas.buscar(termo, pagina: atual.pagina + 1);
      if (!mounted) return;
      setState(() {
        _pagina = proxima;
        _itens.addAll(proxima.itens);
        _carregandoMais = false;
      });
    } on FalhaDeChamada catch (falha) {
      if (!mounted) return;
      setState(() {
        _carregandoMais = false;
        _falhaDeMais = MensagensDeErro.de(falha).texto;
      });
    }
  }

  /// O pedido de conexão **a partir do cartão**, e o estado que ele devolve.
  ///
  /// Devolve a aresta quando o servidor criou (ou devolveu) uma, e **nulo**
  /// quando a recusa é de teto ou de pessoa que não existe para quem pede — nos
  /// dois casos quem desenha a recusa é o cartão, com a frase do motivo.
  Future<Conexao?> _pedir(PessoaEncontrada pessoa) async {
    final conexao = await _conexoes.pedirPorApelido(
      apelido: pessoa.handle,
      idempotencyKey: 'conexao-apelido-${pessoa.handle}',
    );
    // **O teto desce um, e a tela não o calcula.** Ela relê: entre dois
    // pedidos a janela corrida pode ter liberado um, e subtrair um na mão
    // afirmaria um número que o servidor não disse.
    unawaited(_lerOTeto());
    return conexao;
  }

  ControleDeBusca _controleDaBusca() {
    return ControleDeBusca(
      controlador: _campo,
      alcance: AlcanceDaBusca.servidor,
      rotulo: BuscaDePessoas.rotuloDaBusca,
      termoAplicado: _termoAplicado,
      minimoDeCaracteres: PessoasApi.minimoDaBusca,
      aoAplicar: (termo) {
        // **A LUPA CONTINUA APLICANDO NA HORA**, e cancela a espera: quem não
        // quer esperar os 400 ms toca, e a espera pendente buscaria o mesmo
        // termo de novo logo depois — duas consultas do mesmo teto para um
        // pedido só.
        _espera?.cancel();
        if (termo == null) {
          _limparABusca();
          return;
        }
        unawaited(_buscar(termo));
      },
    );
  }

  @override
  Widget build(BuildContext context) {
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: <Widget>[
        // **ESTA ABA DESENHA `LinhaDeBuscaDaListagem` E NÃO `BarraDeListagem`,
        // e é a única do app que faz isso por este motivo.**
        //
        // `BarraDeListagem` não se desenha com `total == 0` e sem recorte
        // aplicado, e a regra está certa onde ela nasceu: *"buscar o nada é um
        // controle sem desfecho"*. Numa listagem cujo conteúdo existe sozinho —
        // o diretório, a loja, a agenda — campo de busca sobre lista vazia é
        // toque que não leva a nada.
        //
        // **Aqui é o contrário: o campo É o conteúdo.** Esta é a única
        // listagem do produto em que `total == 0` sem recorte é o estado
        // NORMAL de abertura, porque não existe "listar todos" — a reversão de
        // 20/10/2026 trouxe a busca e recusou a listagem. Esconder o campo
        // aqui deixaria a aba sem nenhum controle, e a pessoa sem como fazer a
        // única coisa que a aba existe para fazer.
        //
        // O que se perde, e é de propósito: a linha de contagem que a
        // `BarraDeListagem` escreve. Ela é desenhada abaixo, **só com termo
        // aplicado** — "0 pessoas" antes de alguém buscar seria a tela
        // afirmando um resultado que ninguém pediu.
        //
        // `filtro` e `ordenacao` vão NULOS, e é essa a linha que decide que o
        // gatilho de recorte não nasce. Ver a tabela no cabeçalho desta classe
        // antes de preencher um dos dois.
        LinhaDeBuscaDaListagem(
          total: _pagina?.total ?? 0,
          busca: _controleDaBusca(),
        ),
        ..._contagem(),
        ..._corpo(),
      ],
    );
  }

  /// A contagem do resultado, **só com termo aplicado**.
  ///
  /// Mesma redação que `BarraDeListagem` escreve nas outras listagens, e pela
  /// mesma razão de estar aqui: a linha vem do substantivo da listagem, e não
  /// de uma frase montada na tela.
  List<Widget> _contagem() {
    final pagina = _pagina;
    if (pagina == null || _termoAplicado == null) return const <Widget>[];
    final substantivo = pagina.total == 1
        ? BuscaDePessoas.substantivo.singular
        : BuscaDePessoas.substantivo.plural;
    return <Widget>[
      const SizedBox(height: BichuEspaco.e3),
      Text(
        '${pagina.total} $substantivo',
        style: Theme.of(context).textTheme.bodySmall?.copyWith(
          color: BichuColors.of(context).cores.textSecondary,
        ),
      ),
    ];
  }

  List<Widget> _corpo() {
    switch (_fase) {
      case _Fase.antesDeBuscar:
        // **CAMPO VAZIO NÃO LISTA NINGUÉM.** Não há chamada, não há lista e não
        // há "sugestões de quem seguir": um estado inicial povoado seria a
        // listagem de pessoas que a reversão não autorizou.
        //
        // **E É AQUI QUE O RESULTADO VELHO NÃO ESTÁ.** Abaixo do piso a tela
        // cai nesta fase (ver [_aoDigitar]), então a lista anterior saiu — e a
        // explicação troca para a contagem de letras que falta, em vez de
        // repetir a frase da lupa sobre uma lupa que não pode habilitar.
        return <Widget>[
          const SizedBox(height: BichuEspaco.e8),
          EstadoVazio(
            titulo: BuscaDePessoas.tituloAntesDeBuscar,
            explicacao:
                _explicacaoDoVazio() ?? BuscaDePessoas.explicacaoAntesDeBuscar,
          ),
        ];

      case _Fase.carregando:
        return <Widget>[
          const SizedBox(height: BichuEspaco.e8),
          Center(
            // O giro sozinho nao se anuncia: quem usa leitor de tela ouviria
            // silencio entre a lupa e a lista.
            child: Semantics(
              label: BuscaDePessoas.carregando,
              child: const CircularProgressIndicator(),
            ),
          ),
        ];

      case _Fase.falha:
        if (_faltaConta) {
          // A rota é `bearerAuth` sem alternativa vazia: não há busca de
          // pessoas sem conta, em estado nenhum.
          return <Widget>[
            const SizedBox(height: BichuEspaco.e6),
            const ConviteParaEntrar(secao: SecaoComConta.buscaDePessoas),
          ];
        }
        return <Widget>[
          const SizedBox(height: BichuEspaco.e6),
          FaixaDeAviso(
            texto: _textoDaFalha ?? _falhaSemTexto,
            rotuloDaAcao: 'Tentar de novo',
            aoTocarNaAcao: () => unawaited(_recarregar()),
          ),
        ];

      case _Fase.lista:
        if (_itens.isEmpty) {
          return const <Widget>[
            SizedBox(height: BichuEspaco.e8),
            EstadoVazio(
              titulo: BuscaDePessoas.tituloNadaEncontrado,
              explicacao: BuscaDePessoas.explicacaoNadaEncontrado,
            ),
          ];
        }
        final total = _pagina?.total ?? _itens.length;
        return <Widget>[
          const SizedBox(height: BichuEspaco.e4),
          for (final pessoa in _itens) ...<Widget>[
            CartaoDePessoaEncontrada(
              // **A CHAVE É O APELIDO, e ela é o conserto do defeito que o
              // cliente cobrou de novo em 26/10/2026** — *"você não resolveu o
              // botão de pedir conexão, quando o usuário já é uma conexão"*.
              //
              // O conserto de 22/10 (`6b124f62`) está inteiro e continua certo:
              // `connection_state` vem do servidor, o modelo o lê e
              // `CartaoDePessoaEncontrada` desenha um cartão por estado. **O que
              // sobrou era de IDENTIDADE DE ELEMENTO, e não de estado.**
              //
              // `_estado` daquele cartão é semeado UMA vez
              // (`late ... = widget.pessoa.estadoDaConexao`) e não há
              // `didUpdateWidget` que o semeie de novo. Sem chave, o Flutter
              // casa os filhos desta lista **por posição**: a segunda busca
              // reaproveita o `State` do cartão que estava naquele índice e
              // mantém o `_estado` da pessoa ANTERIOR. Quem buscou um estranho
              // e depois buscou uma conexão aceita via, na segunda lista,
              // `Pedir conexão` ao lado de quem já era conexão — o relato
              // literal dele, sobrevivendo ao conserto do estado.
              //
              // Com a chave, pessoa diferente no mesmo índice ganha `State`
              // NOVO (semeado do estado certo) e a MESMA pessoa conserva o seu
              // — que é o que preserva o estado aprendido da resposta da ação
              // quando a lista cresce por paginação. **Um `didUpdateWidget` que
              // re-semeasse do `widget.pessoa` faria o contrário**: apagaria o
              // estado aprendido no 201 e o botão voltaria depois do toque.
              key: ValueKey<String>(pessoa.handle),
              pessoa: pessoa,
              pedidosQueAindaCabem: _pedidosQueAindaCabem,
              aoPedir: () => _pedir(pessoa),
              aoEncerrar: (ref) => _conexoes.encerrar(ref),
              aoAceitar: (ref) => _conexoes.aceitar(ref),
              aoAbrirOPerfil: () =>
                  context.push(Rotas.perfilDe(pessoa.handle)),
            ),
            const SizedBox(height: BichuEspaco.e3),
          ],
          RodapeDaPaginacao(
            carregados: _itens.length,
            total: total,
            carregando: _carregandoMais,
            textoDaFalha: _falhaDeMais,
            aoPedirMais: () => unawaited(_carregarMais()),
            fimDaLista: _fimDaLista,
          ),
        ];
    }
  }

  /// O texto quando a falha chegou sem mensagem legivel.
  ///
  /// Nunca acontece por `FalhaDeChamada` -- `MensagensDeErro.de` sempre devolve
  /// texto --, e existe porque [_textoDaFalha] e anulavel por construcao. Uma
  /// faixa vazia seria pior que esta frase: ela se anuncia e nao diz nada.
  static const String _falhaSemTexto = 'Não foi possível buscar agora.';

  /// O fim da lista, **nos dois ramos, e eles mudam JUNTOS**.
  ///
  /// **O singular e redacao do cliente (22/10/2026), literal**: *"Troque o
  /// texto Uma pessoa com esse nome para Um usuario encontrado em sua busca."*
  ///
  /// **O plural e DERIVADO dele, e nao da troca generica de vocabulario** --
  /// esta linha pode ser revista por ele. A troca mecanica
  /// `pessoa(s)`->`usuario(s)` daria *"Voce viu todas as N usuarios com esse
  /// nome."*, que contraria o que ele escreveu em duas coisas de uma vez: o
  /// fim da frase (`com esse nome` em vez de `encontrado em sua busca`) e a
  /// concordancia (`todas as` com `usuarios`). Os dois ramos sao o mesmo
  /// fim-de-lista visto de dois lados, e uma frente anterior deixou os DOIS
  /// intocados de proposito para nao desencontrar o par -- a excecao deles em
  /// `excecoesDoVocabulario` existia exatamente por isso, e saiu com esta
  /// edicao.
  String _fimDaLista(int total) {
    if (total == 1) return 'Um usuário encontrado em sua busca.';
    return 'Você viu todos os $total usuários encontrados em sua busca.';
  }
}
