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
/// ## A BUSCA NÃO ACONTECE A CADA TECLA, e isso é medido
///
/// [BarraDeListagem] não tem *debounce*: ela aplica na lupa e no
/// `TextInputAction.search`, e **nada dispara ao digitar**. A prosa do contrato
/// supõe o contrário (*"a tela chama a busca a cada tecla"*), e o desenho desta
/// casa ganha, por duas medições:
///
/// 1. **O servidor instalado responde 400 abaixo de três caracteres**, e não
///    lista vazia como a prosa do contrato promete: o vigia de parâmetros copia
///    o `minLength: 3` para o `querystring` da rota. Busca a cada tecla
///    mostraria faixa vermelha no meio de alguém escrevendo um nome. (O app não
///    chega a esse ponto: [PessoasApi.buscar] não pergunta abaixo do piso.)
/// 2. **O teto é de 60 consultas por hora por conta.** Uma tecla por consulta
///    gasta o teto de uma pessoa normal em poucos nomes.
///
/// E a lupa **não habilita** abaixo do piso, o que faz o freio ser visível em
/// vez de silencioso — o nome acessível dela diz quantas letras faltam.
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
/// ## O ESTADO DA RELAÇÃO NÃO VEM NA BUSCA, e isso decide o cartão
///
/// `PersonSearchResult` **não traz `connection_state`**, de propósito: *"numa
/// lista, vinte estados por requisição são o material de que uma lista de
/// conexões se faz do lado de fora"*. Então o cartão nasce em `nenhum` e
/// **aprende o estado verdadeiro da resposta da própria ação** — o pedido é
/// idempotente e devolve a aresta que já existia, com o `state` dela. Quem já
/// era conexão, ou já havia pedido primeiro, descobre no 201 e não num palpite
/// da tela.
class BuscaDePessoas extends StatefulWidget {
  const BuscaDePessoas({
    required this.pessoas,
    required this.conexoes,
    super.key,
  });

  /// As duas portas entram por PARAMETRO e nao saem do `Escopo` aqui dentro,
  /// e o precedente e `TelaDePerfilDePessoa`: e isto que permite montar esta
  /// aba num teste de widget sem construir as vinte e nove dependencias do
  /// escopo so para exercitar um campo de busca.
  final PessoasApi pessoas;

  final ConexoesApi conexoes;

  /// O rótulo do campo. Diz **as duas coisas que a busca aceita**, porque uma
  /// pessoa que não sabe que o apelido serve busca pelo nome e desiste.
  static const String rotuloDaBusca = 'Buscar usuários por nome ou apelido';

  static const String tituloAntesDeBuscar = 'Procure quem você já conhece';

  /// A explicação do estado inicial, e ela tem **uma frase**.
  ///
  /// A versão do protótipo trazia, abaixo do vazio, um bloco `Como funciona`
  /// com três linhas de ensino. Ele não entrou: o cliente removeu os textos de
  /// apoio das telas em 18/10/2026 (*"isso está deixando o app poluído"*), e
  /// três parágrafos explicando o que é conexão são exatamente isso. O que
  /// sobra é o que a pessoa precisa para agir agora.
  static const String explicacaoAntesDeBuscar =
      'Digite o nome ou o apelido de alguém e toque na lupa.';

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

  @override
  Future<void> aoArrastarParaAtualizar() => _recarregar();

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

  void _limparABusca() {
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
        return const <Widget>[
          SizedBox(height: BichuEspaco.e8),
          EstadoVazio(
            titulo: BuscaDePessoas.tituloAntesDeBuscar,
            explicacao: BuscaDePessoas.explicacaoAntesDeBuscar,
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

  String _fimDaLista(int total) {
    if (total == 1) return 'Uma pessoa com esse nome.';
    return 'Você viu todas as $total pessoas com esse nome.';
  }
}
