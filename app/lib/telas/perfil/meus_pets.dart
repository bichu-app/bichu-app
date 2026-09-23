import 'package:flutter/material.dart';
import 'package:go_router/go_router.dart';

import '../../api/falhas.dart';
import '../../api/mensagens_de_erro.dart';
import '../../api/modelos_pet.dart';
import '../../escopo.dart';
import '../../perdido/rascunho_do_caso.dart';
import '../../roteamento/rotas.dart';
import '../../theme/bichu_colors.dart';
import '../../theme/bichu_tokens.g.dart';
import '../../widgets/botao_primario.dart';
import '../../widgets/cartao_de_pet.dart';
import '../../widgets/faixa_de_aviso.dart';
import '../avisos/aviso_de_cadastro_incompleto.dart';
import '../../widgets/moldura.dart';
import '../casca_com_abas.dart';
import '../perdido/tela_de_quem_e_o_caso.dart';

/// O cache de leitura de `GET /pets`, do criterio 7 da BICHUS-62.
///
/// **Vive em memoria e nao toca o disco, de proposito.** Uma das decisoes
/// abertas do cliente em 21/09 e se o cache de leitura e por usuario ou
/// apagado na saida, e ela foi classificada como decisao de **seguranca**:
/// trocar de conta nao pode expor os pets da anterior. Enquanto ela nao sai,
/// cache em disco seria tomar a decisao por ele, do lado errado. Em memoria a
/// pergunta nao se coloca: o cache morre com o processo.
///
/// A trava por dono existe mesmo assim, porque a troca de conta acontece
/// **dentro** do mesmo processo: sair e entrar com outro e-mail nao mata o
/// app. [pets] devolve nulo quando o dono e outro, e limpa o que estava la.
class CacheDeMeusPets {
  String? _idDoDono;
  List<Pet>? _pets;

  /// O que esta guardado para [idDoDono]. Nulo quando nao ha nada, **ou
  /// quando o que ha e de outra conta**.
  List<Pet>? pets(String? idDoDono) {
    if (idDoDono == null) return null;
    if (_idDoDono != idDoDono) {
      limpar();
      return null;
    }
    return _pets;
  }

  void guardar(String? idDoDono, List<Pet> pets) {
    if (idDoDono == null) return;
    _idDoDono = idDoDono;
    _pets = List<Pet>.unmodifiable(pets);
  }

  void limpar() {
    _idDoDono = null;
    _pets = null;
  }
}

/// `Perfil` › `Meus pets` (BICHUS-62, destino fixado pela secao 27.6 do UX).
///
/// Os cartoes da variante `lista` do paragrafo 11.3 contra `listMyPets`.
///
/// ## O que esta tela nao tem, e nao e esquecimento
///
/// - **O caso aberto dominando a tela.** Ver abaixo.
///
/// ## O que esta tela GANHOU na BICHUS-21
///
/// A acao `Marcar como perdido`. Ela faltava por um motivo que deixou de
/// existir: *"a tela que a acao abre e a BICHUS-21 e nao existe"* (criterio 2
/// da BICHUS-62). A tela existe agora, e a acao ganhou destino.
///
/// **Ela nao mora no cartao, e a razao e de acessibilidade e nao de gosto.**
/// Um botao dentro do cartao criaria duas paradas de foco no mesmo objeto --
/// o cartao ja e UMA parada, com `excludeSemantics` e rotulo composto -- e um
/// controle anunciado dentro de outro controle. A acao e da tela: um toque, e
/// a escolha de qual animal acontece em F3.0, que existe para isso.
///
/// **Ela so aparece quando tem destino.** Sem pet elegivel -- conta vazia,
/// lista que nao carregou, ou todos os animais ja com caso aberto (criterio 13
/// da BICHUS-21) -- a acao nao e renderizada, nem desabilitada. E a mesma
/// regra do criterio 2 da BICHUS-62 que segurava esta acao ate hoje, aplicada
/// agora a favor dela.
/// - **O caso aberto dominando a tela.** Ele saiu daqui em 21/09 e virou a
///   BICHUS-177, no topo de `Pets`. Quem tem caso aberto esta em panico e nao
///   navega; atras de um toque numa aba `Perfil` o estado do caso ficaria
///   escondido no unico momento em que esconder custa o animal.
/// - **Feed, estatistica, novidade e painel** (criterio 8). E uma lista de
///   pets.
class MeusPets extends StatefulWidget {
  const MeusPets({required this.cache, super.key});

  /// Injetado, e nao criado aqui dentro: o cache precisa sobreviver a
  /// reconstrucao do widget, e um teste precisa conseguir prepara-lo.
  final CacheDeMeusPets cache;

  /// O titulo do estado vazio (criterio 11).
  ///
  /// **Nao e** `Nenhum pet cadastrado ainda`. Aquele texto foi renderizado por
  /// meses numa tela que nao sabia listar pet nenhum, e e o que o cliente leu
  /// depois de cadastrar o dele.
  static const String tituloDoVazio = 'Seu primeiro pet entra aqui.';

  static const String explicacaoDoVazio =
      'Cadastre seu pet para gerar a plaquinha com QR e entrar na rede de quem '
      'procura e de quem encontra.';

  /// A faixa do criterio 7, palavra por palavra.
  static const String faixaDeCache =
      'Mostrando o que temos salvo. Não conseguimos atualizar agora.';

  static const String rotuloDeAtualizar = 'Atualizar';

  static const String titulo = 'Meus pets';

  /// A acao da BICHUS-21, palavra por palavra do criterio 11.
  static const String rotuloDeMarcarPerdido = 'Marcar como perdido';

  @override
  State<MeusPets> createState() => _MeusPetsState();
}

/// Os quatro desfechos de uma abertura da tela. Nenhum deles e "tela em
/// branco", e nenhum deles e "lista vazia por falha".
enum _Fase { carregando, lista, falhaComCache, falhaSemCache }

class _MeusPetsState extends State<MeusPets> {
  _Fase _fase = _Fase.carregando;
  List<Pet> _pets = const <Pet>[];
  String? _textoDaFalha;

  /// Se a tela estava visivel na ultima vez que as dependencias mudaram.
  ///
  /// E o que transforma um estado em **borda**: a recarga acontece na
  /// passagem de escondida para visivel, e nao a cada reconstrucao. Sem ele,
  /// trocar o tema do sistema ou girar o aparelho viraria uma chamada de rede.
  bool _visivel = false;

  bool _cargaAgendada = false;

  /// O gatilho de recarga da BICHUS-220.
  ///
  /// **A escolha foi recarregar quando a tela volta a aparecer, e nao
  /// invalidar o cache em cada ponto que escreve.** As duas fecham o defeito
  /// relatado; a diferenca esta no que acontece depois.
  ///
  /// Invalidar ao escrever e uma lista de lugares que alguem precisa lembrar
  /// de manter: hoje so `POST /pets` cria pet, e amanha editar, apagar,
  /// vincular tag e confirmar foto mudam a mesma lista. Cada um desses e uma
  /// chance nova de o sintoma voltar exatamente igual, e o portao que o
  /// pegaria seria uma varredura enumerando as formas que alguem lembrou de
  /// listar. Alem disso, ela so enxerga escrita **deste** aparelho: o pet
  /// cadastrado no site, ou pela outra pessoa da casa, continuaria invisivel.
  ///
  /// Recarregar ao voltar e uma propriedade: a tela pergunta ao servidor toda
  /// vez que volta a ser a tela que a pessoa esta vendo, sem saber quem
  /// escreveu nem por onde. O custo e um `GET /pets` por visita, e a lista
  /// tem teto de 20 itens por conta.
  ///
  /// **O cache por dono nao muda, e isso foi deliberado.** Este gatilho nao
  /// encosta em [CacheDeMeusPets]: nao limpa, nao invalida e nao acrescenta
  /// caminho de escrita nele. A trava de dono continua sendo a unica regra de
  /// leitura, e a decisao de seguranca registrada no cabecalho da classe
  /// continua aberta do mesmo jeito. Um mecanismo de invalidacao teria que
  /// abrir um segundo caminho para dentro do cache, e seria ele a enfraquecer
  /// a trava.
  ///
  /// **A visibilidade e lida de `TickerMode`, e a escolha nao e por economia
  /// de codigo.** Ela e a unica pergunta do framework que responde as DUAS
  /// maneiras diferentes de esta tela sumir da vista, sem que a tela precise
  /// saber qual delas aconteceu:
  ///
  /// - trocar de aba. O `StatefulShellRoute.indexedStack` embrulha cada ramo
  ///   num `TickerMode(enabled: isActive)` (`go_router/src/route.dart`), e
  ///   trocar de aba nao desmonta nada;
  /// - o assistente de cadastro, empurrado no navegador **raiz** por cima da
  ///   casca inteira. O `Overlay` desliga o ticker das entradas cobertas por
  ///   uma rota opaca, e a casca e uma delas. O `ModalRoute` que esta tela
  ///   enxerga NAO serve para isso: e o do navegador do proprio ramo, onde a
  ///   aba esta sempre no topo, com o assistente aberto ou sem ele.
  ///
  /// Escrever as duas causas na tela seria enumerar: a terceira apareceria
  /// como defeito. `TickerMode` e a propriedade -- "este subarvore esta a
  /// vista" --, e as duas causas estao medidas separadamente em
  /// `test/telas/lista_relista_ao_voltar_test.dart`.
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

  /// Carrega depois do quadro, e nunca duas vezes para o mesmo retorno.
  ///
  /// Depois do quadro porque [_carregar] chama `setState` de forma sincrona, e
  /// [didChangeDependencies] roda dentro da construcao. Uma vez so porque a
  /// visibilidade pode ir e voltar dentro do mesmo quadro: sair do assistente
  /// pelo `Depois` de F1.6 e um `context.go(Rotas.perfil)`, que descobre a
  /// casca e pode trocar o ramo na mesma passagem.
  void _agendarCarga() {
    if (_cargaAgendada) return;
    _cargaAgendada = true;
    WidgetsBinding.instance.addPostFrameCallback((_) {
      _cargaAgendada = false;
      if (mounted) _carregar();
    });
  }

  Future<void> _carregar() async {
    if (!mounted) return;
    final escopo = Escopo.of(context);
    final idDoDono = escopo.sessao.usuario?.id;
    final salvo = widget.cache.pets(idDoDono);

    setState(() {
      _fase = _Fase.carregando;
      _pets = salvo ?? const <Pet>[];
      _textoDaFalha = null;
    });

    try {
      final pets = await escopo.pets.listarMeusPets();
      widget.cache.guardar(idDoDono, pets);
      if (!mounted) return;
      setState(() {
        _pets = pets;
        _fase = _Fase.lista;
      });
    } on FalhaDeChamada catch (falha) {
      if (!mounted) return;
      final cache = widget.cache.pets(idDoDono);
      setState(() {
        _textoDaFalha = MensagensDeErro.de(falha).texto;
        if (cache != null && cache.isNotEmpty) {
          _pets = cache;
          _fase = _Fase.falhaComCache;
        } else {
          // **Sem cache a tela nao finge que a conta esta vazia.** Uma lista
          // vazia aqui seria indistinguivel de "voce nao tem pet", que e o
          // estado vazio que parece sucesso. A falha aparece e tem saida.
          _pets = const <Pet>[];
          _fase = _Fase.falhaSemCache;
        }
      });
    }
  }

  @override
  Widget build(BuildContext context) {
    final cores = BichuColors.of(context).cores;
    final textos = Theme.of(context).textTheme;

    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: <Widget>[
        Text(MeusPets.titulo, style: textos.titleLarge),
        const SizedBox(height: BichuEspaco.e4),
        ..._corpo(cores),
      ],
    );
  }

  List<Widget> _corpo(BichuCores cores) {
    return switch (_fase) {
      // Esqueleto do paragrafo 11.3: moldura e barras em `surface-sunken`. Um
      // indicador circular no lugar disto nao diria que o que vem e uma lista.
      _Fase.carregando when _pets.isEmpty => const <Widget>[
          _EsqueletoDeCartao(),
          SizedBox(height: BichuEspaco.e3),
          _EsqueletoDeCartao(),
        ],
      _Fase.carregando => _cartoes(),
      _Fase.lista when _pets.isEmpty => <Widget>[
          EstadoVazio(
            titulo: MeusPets.tituloDoVazio,
            explicacao: MeusPets.explicacaoDoVazio,
            // Acao **unica** em destaque (criterio 6 da BICHUS-62, que nao
            // muda): no vazio ela e a acao da caixa, e nao ha um segundo botao
            // competindo com ela. Por isso a acao permanente abaixo dos
            // cartoes **nao** e acrescentada neste ramo.
            acao: _acaoDeCadastrar(),
          ),
        ],
      _Fase.lista => <Widget>[
          ..._cartoes(),
          ..._acaoDeMarcarPerdido(),
          const SizedBox(height: BichuEspaco.e6),
          // A ACAO PERMANENTE (BICHUS-232).
          //
          // **Ela existia so no estado vazio, e esse era o defeito.** Com um
          // pet na lista o ramo era `_cartoes()` e a acao sumia; o unico ponto
          // de entrada sempre visivel era o botao da secao `Pets`, que saiu em
          // 22/09 por misturar contextos. As duas metades sao uma coisa so:
          // sem esta linha, o app nao teria caminho nenhum para cadastrar o
          // segundo pet.
          _acaoDeCadastrar(),
        ],
      _Fase.falhaComCache => <Widget>[
          FaixaDeAviso(
            peso: PesoDaFaixa.informativo,
            texto: MeusPets.faixaDeCache,
            rotuloDaAcao: MeusPets.rotuloDeAtualizar,
            aoTocarNaAcao: _carregar,
          ),
          const SizedBox(height: BichuEspaco.e4),
          ..._cartoes(),
          ..._acaoDeMarcarPerdido(),
        ],
      _Fase.falhaSemCache => <Widget>[
          FaixaDeAviso(
            texto: _textoDaFalha ?? MensagensDeErro.servidorFora,
            rotuloDaAcao: MeusPets.rotuloDeAtualizar,
            aoTocarNaAcao: _carregar,
          ),
        ],
    };
  }

  /// A acao `Marcar como perdido`, quando ela tem destino.
  ///
  /// Devolve lista vazia quando nao ha para onde ir. Ver o cabecalho da
  /// classe: acao sem destino e o que o criterio 2 da BICHUS-62 proibe, e nao
  /// deixa de ser proibido por a acao estar desabilitada -- um controle
  /// desabilitado sem motivo dito e o desenho preguicoso que o criterio 5 da
  /// BICHUS-21 recusa na tela seguinte.
  List<Widget> _acaoDeMarcarPerdido() {
    // Fase de carregamento e falha sem cache nao tem lista: a acao nasceria
    // sobre uma lista que a tela nao sabe se existe.
    if (_fase != _Fase.lista && _fase != _Fase.falhaComCache) {
      return const <Widget>[];
    }
    final elegiveis = TelaDeQuemEOCaso.elegiveis(_pets);
    if (elegiveis.isEmpty) return const <Widget>[];

    return <Widget>[
      const SizedBox(height: BichuEspaco.e4),
      BotaoSecundario(
        rotulo: MeusPets.rotuloDeMarcarPerdido,
        aoTocar: () {
          // **Um pet: F3.0 nao aparece.** O criterio 1 justifica a escolha
          // "para prevenir o deslize de marcar o pet errado quando ha mais de
          // um": com um animal nao ha deslize possivel, e uma tela de
          // confirmacao seria o mesmo atrito que a pesquisa de UX recusa no
          // `Quando?`. F3.1 ja mostra a foto e o nome no topo.
          if (elegiveis.length == 1) {
            context.push(
              Rotas.marcarPerdido,
              extra: RascunhoDoCaso(pet: elegiveis.first),
            );
            return;
          }
          // A lista INTEIRA, e nao so os elegiveis: F3.0 precisa dos que ja
          // tem caso aberto para dize-lo (criterio 13).
          context.push(Rotas.escolherPetPerdido, extra: _pets);
        },
      ),
    ];
  }

  /// `Cadastrar meu pet`, construida num lugar so.
  ///
  /// Os dois ramos que a mostram (o vazio e a lista cheia) precisam do **mesmo
  /// rotulo e do mesmo destino**: duas construcoes a mao divergem no dia em
  /// que alguem mexer numa delas, e o portao que exige a acao nos dois estados
  /// continuaria verde com dois textos diferentes na tela.
  ///
  /// `BotaoPrimario` e nao um botao de contorno: entre duas formas igualmente
  /// corretas, esta e a que poe a tinta da marca numa tela que hoje e cartao e
  /// texto. O cliente disse em 22/09 que o app esta "sem cores" e decidiu nao
  /// agir nisso agora -- isto nao e acabamento visual, e so a escolha da
  /// variante que ja existia.
  BotaoPrimario _acaoDeCadastrar() {
    return BotaoPrimario(
      rotulo: 'Cadastrar meu pet',
      aoTocar: () => context.push(Rotas.cadastrarPet),
    );
  }

  /// Os cartoes, um por pet, na ordem em que o servidor mandou.
  ///
  /// Sem paginacao e sem corte: o contrato fixa o teto em 20 pets por conta e
  /// a `ListView` da `TelaDeAba` ja rola (criterio 14). Um `ListView` aninhado
  /// aqui dentro criaria uma segunda area de rolagem dentro da primeira.
  List<Widget> _cartoes() {
    final saida = <Widget>[];
    for (var i = 0; i < _pets.length; i++) {
      if (i > 0) saida.add(const SizedBox(height: BichuEspaco.e3));
      final pet = _pets[i];
      saida.add(
        CartaoDePet(
          pet: pet,
          // O cartao passou a ter destino: T.1 (BICHUS-60 e BICHUS-61). Ate
          // aqui ele era so um container, porque o criterio 2 proibe acao sem
          // destino -- agora o destino existe e esta registrado em `Rotas`.
          aoTocar: () => context.push(Rotas.detalheDoPetDe(pet.id)),
          // A TERCEIRA POSICAO do aviso persistente (BICHUS-75, criterio 2).
          //
          // A frase e a MESMA da forma encolhida do criterio 4, e isso e
          // deliberado: o refinamento de 17/09 registrou duas vezes que esta
          // posicao nao tem microcopy escrita. Inventar uma terceira frase
          // aqui seria decidir texto de tela, que nao e de quem implementa.
          // Pergunta fechada na pauta de refinamento de 22/09.
          //
          // A condicao e a mesma do criterio 7: quem verificou nao ve nada, em
          // lugar nenhum -- e o cartao e um dos lugares.
          linhaDeAviso: (Escopo.of(context).sessao.usuario?.emailVerificado ??
                  true)
              ? null
              : TextosDoAvisoDeCadastro.naoConfirmado,
        ),
      );
    }
    return saida;
  }
}

/// O esqueleto de um cartao: moldura mais tres barras (paragrafo 11.3).
class _EsqueletoDeCartao extends StatelessWidget {
  const _EsqueletoDeCartao();

  @override
  Widget build(BuildContext context) {
    final cores = BichuColors.of(context).cores;
    return ExcludeSemantics(
      child: Container(
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
                  _Barra(cor: cores.surfaceSunken, fracao: 0.6),
                  const SizedBox(height: BichuEspaco.e2),
                  _Barra(cor: cores.surfaceSunken, fracao: 0.9),
                  const SizedBox(height: BichuEspaco.e2),
                  _Barra(cor: cores.surfaceSunken, fracao: 0.4),
                ],
              ),
            ),
          ],
        ),
      ),
    );
  }
}

class _Barra extends StatelessWidget {
  const _Barra({required this.cor, required this.fracao});

  final Color cor;
  final double fracao;

  @override
  Widget build(BuildContext context) {
    return FractionallySizedBox(
      alignment: Alignment.centerLeft,
      widthFactor: fracao,
      child: Container(
        // A altura acompanha a linha de `body-sm` em vez de ser fixa: com a
        // fonte do sistema em 200% um esqueleto de altura fixa fica menor que
        // o texto que ele representa e a lista pula quando carrega.
        height: MediaQuery.textScalerOf(context).scale(BichuEspaco.e3),
        decoration: BoxDecoration(
          color: cor,
          borderRadius: BorderRadius.circular(BichuRaio.sm),
        ),
      ),
    );
  }
}
