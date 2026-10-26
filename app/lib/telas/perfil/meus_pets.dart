import 'package:flutter/material.dart';
import 'package:go_router/go_router.dart';

import '../../api/falhas.dart';
import '../../api/mensagens_de_erro.dart';
import '../../api/modelos_pet.dart';
import '../../escopo.dart';
import '../../roteamento/rotas.dart';
import '../../theme/bichu_colors.dart';
import '../../theme/bichu_tokens.g.dart';
import '../../widgets/arrastar_para_atualizar.dart';
import '../../widgets/botao_primario.dart';
import '../../widgets/cartao_de_pet.dart';
import '../../widgets/convite_para_entrar.dart';
import '../../widgets/faixa_de_aviso.dart';
import '../avisos/aviso_de_cadastro_incompleto.dart';
import '../../widgets/item_de_menu.dart';
import '../../widgets/moldura.dart';
import '../../widgets/saida_da_tela.dart';
import '../casca_com_abas.dart';

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
/// ## O que esta tela PERDEU em 18/10/2026, e para onde foi
///
/// A acao `Marcar como perdido`. Ela entrou na BICHUS-21, quando a tela que
/// ela abre passou a existir, e saiu agora para a **pagina do pet**, junto do
/// QR da plaquinha. Nao e perda de funcao: e a escolha de qual animal
/// deixando de ser uma pergunta. F3.0 existia "para prevenir o deslize de
/// marcar o pet errado quando ha mais de um" (criterio 1), e na pagina de um
/// animal so nao ha deslize possivel -- quem abriu a pagina da Nina ja
/// respondeu "a Nina" ao tocar no cartao dela.
///
/// **O que esta tela passou a sustentar e a porta de entrada daquela.** Os
/// cartoes sao o unico caminho do app ate `Rotas.detalheDoPet` (medido em
/// 18/10: `Rotas.detalheDoPetDe` e empurrada deste arquivo e de mais nenhum
/// lugar de `app/lib`), e com a acao de perdido e o QR morando la, esconder o
/// cartao deixaria as duas sem porta. Por isso a reorganizacao do `Perfil` em
/// menus, do mesmo dia, **nao** transformou esta lista em item de menu: um
/// item levaria a uma tela de lista que nao existe, e os cartoes ja levam ao
/// pet.
///
/// ## O que esta tela nao tem, e nao e esquecimento
///
/// - **O caso aberto dominando a tela.** Ele saiu daqui em 21/09 e virou a
///   BICHUS-177, no topo de `Pets`. Quem tem caso aberto esta em panico e nao
///   navega; atras de um toque numa aba `Perfil` o estado do caso ficaria
///   escondido no unico momento em que esconder custa o animal.
/// - **Feed, estatistica, novidade e painel** (criterio 8). E uma lista de
///   pets.
class MeusPets extends StatefulWidget {
  const MeusPets({
    required this.cache,
    this.teto,
    this.comCabecalho = true,
    super.key,
  });

  /// Injetado, e nao criado aqui dentro: o cache precisa sobreviver a
  /// reconstrucao do widget, e um teste precisa conseguir prepara-lo.
  final CacheDeMeusPets cache;

  /// QUANTOS CARTOES O BLOCO DESENHA, no maximo. Nulo mostra todos.
  ///
  /// Pedido do cliente, 22/10/2026: *"no menu do perfil do usuario, onde lista
  /// os pets, inclua um botao ver todos no canto direito, na frente do meus
  /// pets, quando a quantidade de pets do usuario for maior do que 3. E caso o
  /// usuario clique no ver todos, abre uma pagina, com a listagem de todos os
  /// pets dele"*.
  ///
  /// **A SECAO DO PERFIL PASSA [tetoDoPerfil]; A PAGINA NAO PASSA NADA.** E a
  /// unica diferenca entre as duas, e e de proposito: um parametro de teto faz
  /// das duas o MESMO widget, e duas listas de pet escritas a mao divergiriam
  /// no dia em que alguem corrigisse uma -- exatamente o que [_cartoes] ja
  /// dizia do `Cadastrar meu pet` construido em dois lugares.
  ///
  /// **`null` nao e "zero" e nao e "sem corte por acaso":** e a afirmacao de
  /// que quem montou este bloco quer a lista inteira. O teto do contrato (20
  /// pets por conta) continua sendo o unico outro limite.
  final int? teto;

  /// Se o bloco desenha o proprio [TituloDeGrupoDeMenu].
  ///
  /// **Falso so na pagina**, e nao por economia: a pagina ja se titula na
  /// barra de topo, e um `Meus pets` logo abaixo de `Meus pets` seria o
  /// segundo cabecalho com a mesma palavra na mesma tela -- o desvio 3 que a
  /// prosa de [build] mediu e corrigiu em 18/10.
  final bool comCabecalho;

  /// O TETO DA SECAO DO PERFIL: tres.
  ///
  /// **Escrito aqui e lido pelo chamador**, e nao repetido em `abas.dart`: o
  /// numero e do pedido do cliente e a fronteira dele e medida em
  /// `meus_pets_test.dart` nas duas pontas (com 3 nao ha botao, com 4 ha).
  /// Dois literais `3` em arquivos diferentes divergiriam no dia em que ele
  /// pedisse quatro.
  static const int tetoDoPerfil = 3;

  /// O rotulo do botao, **palavra por palavra do cliente**.
  ///
  /// `Ver todos` e nao `Ver tudo`, nem `Ver todos os pets`: ele escreveu
  /// *"inclua um botao ver todos"*, e a redacao de tela nao e de quem
  /// implementa.
  static const String rotuloDeVerTodos = 'Ver todos';

  /// O titulo do estado vazio (criterio 11).
  ///
  /// **Nao e** `Nenhum pet cadastrado ainda`. Aquele texto foi renderizado por
  /// meses numa tela que nao sabia listar pet nenhum, e e o que o cliente leu
  /// depois de cadastrar o dele.
  static const String tituloDoVazio = 'Seu primeiro pet entra aqui.';

  static const String explicacaoDoVazio =
      'Cadastre seu pet para gerar a plaquinha com QR.';

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

class _MeusPetsState extends State<MeusPets>
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

  /// A falha foi **falta de conta**, e nao defeito. Ver [faltaConta].
  bool _faltaConta = false;
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
      _faltaConta = false;
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
      final semConta = faltaConta(falha);
      setState(() {
        _textoDaFalha = MensagensDeErro.de(falha).texto;
        _faltaConta = semConta;
        if (semConta) {
          // **O CACHE NAO SOBREVIVE A UM 401, e isto nao e zelo.** `idDoDono`
          // e lido ANTES do `await`, quando a sessao ainda estava de pe, e o
          // cache responde por aquele id -- entao sem esta guarda a tela
          // desenharia os pets da sessao que acabou de cair sob uma faixa
          // informativa, parecendo logada. Pior no caminho do refresh
          // recusado: `_renovar` apaga o deposito mas NAO roda as limpezas de
          // `sair()`, entao o cache em memoria continua cheio.
          _pets = const <Pet>[];
          _fase = _Fase.falhaSemCache;
        } else if (cache != null && cache.isNotEmpty) {
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
    } on Object catch (erro, pilha) {
      // O QUE NAO E FalhaDeChamada -- `Pet.doJson` sobre um corpo 200 fora do
      // contrato, por exemplo. Sem este ramo a lista ficava em
      // `_Fase.carregando` para sempre.
      registrarFalhaInesperada(erro, pilha, onde: 'ao listar meus pets');
      if (!mounted) return;
      final cache = widget.cache.pets(idDoDono);
      setState(() {
        _textoDaFalha = MensagensDeErro.servidorFora;
        if (cache != null && cache.isNotEmpty) {
          _pets = cache;
          _fase = _Fase.falhaComCache;
        } else {
          _pets = const <Pet>[];
          _fase = _Fase.falhaSemCache;
        }
      });
    }
  }

  /// ## O TITULO DESTA SECAO (corrigido em 18/10/2026)
  ///
  /// Ele era `Text(MeusPets.titulo, style: textos.titleLarge)` com um vao de
  /// `e4`, e era o que estava **fora do padrao do app** -- a reclamacao do
  /// cliente, palavra por palavra: "o layout do menu do perfil ficou estranho,
  /// fora do padrao do app".
  ///
  /// Tres desvios medidos, nao opinados:
  ///
  /// 1. **`titleLarge` nao e peso de titulo de secao neste app.** Os tres
  ///    lugares que titulam secao dentro do corpo de uma tela -- o cartao de
  ///    texto e a secao com icone de `pet/tela_detalhe_do_pet.dart`,
  ///    `rede/encontro_da_rede.dart` e `loja/produto_da_loja.dart` -- usam
  ///    `titleMedium`. `titleLarge` no corpo e peso de **titulo de pagina ou
  ///    de folha**: o `EstadoVazio` da casca, o nome do pet no cabecalho, o
  ///    titulo da folha de `Sair da sua conta?`. Aqui ele punha um titulo de
  ///    pagina dentro de uma pagina que ja tem titulo na barra de topo.
  /// 2. **Sem `Semantics(header: true)`.** Os mesmos tres lugares declaram o
  ///    papel de cabecalho. Esta era a unica secao do app que titulava sem
  ///    ele: quem navega por cabecalho no leitor de tela nao parava aqui.
  /// 3. **Dois cabecalhos com formas diferentes na MESMA tela.** O grupo
  ///    `Conta` e desenhado por [TituloDeGrupoDeMenu] (`labelMedium` em
  ///    `textMuted`, vao de `e2`); este era `titleLarge` com vao de `e4`. Dois
  ///    irmaos na mesma lista com pesos diferentes leem como hierarquia onde
  ///    nao ha nenhuma.
  ///
  /// A correcao e usar [TituloDeGrupoDeMenu], e nao inventar uma quarta forma:
  /// a documentacao dele diz, desde que ele nasceu, que existe porque "`Conta`
  /// e `Meus pets` sao coisas diferentes na mesma tela". Os dois grupos sempre
  /// foram para ser titulados por ele; so um foi ligado. Ele ja carrega
  /// `Semantics(header: true)` e o vao de `e2`, entao o `SizedBox` daqui saiu
  /// -- vao de cabecalho e do cabecalho, e dois donos divergem.
  /// Se o `Ver todos` entra na arvore AGORA.
  ///
  /// ## A FRONTEIRA E `>`, E ELA E LITERAL (cliente, 22/10/2026)
  ///
  /// *"quando a quantidade de pets do usuario for maior do que 3"*. Com TRES
  /// pets nao ha botao -- os tres caberiam na secao e o botao abriria uma
  /// pagina com exatamente a mesma lista, que e um destino que nao leva a
  /// parte nenhuma. Com QUATRO ha. As duas pontas estao medidas em
  /// `meus_pets_test.dart`, e a de 3 e o controle positivo: sem ela, um botao
  /// que nascesse SEMPRE passaria pelo caso de 4.
  ///
  /// **`>` e nao `>=`**, e a diferenca nao e estilo: `>=` poria o botao com
  /// tres pets, que e o erro que o cliente encontraria no primeiro toque --
  /// ele vai testar com os pets que ele tem.
  ///
  /// **E a condicao olha [_pets], e nao a resposta do servidor.** Em
  /// `falhaComCache` o que esta na tela e o cache, e o botao tem de concordar
  /// com o que a pessoa esta vendo: prometer "todos" a partir de um numero que
  /// nao esta na tela seria oferecer uma pagina que mostra outra coisa.
  bool get _temMaisQueOTeto {
    final teto = widget.teto;
    return teto != null && _pets.length > teto;
  }

  @override
  Widget build(BuildContext context) {
    final cores = BichuColors.of(context).cores;

    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: <Widget>[
        if (widget.comCabecalho) _cabecalho(),
        ..._corpo(cores),
      ],
    );
  }

  /// A LINHA DO CABECALHO: `Meus pets` a esquerda, `Ver todos` a direita.
  ///
  /// *"um botao ver todos no canto direito, na frente do meus pets"* -- `na
  /// frente de` aqui e **na mesma linha**, encostado na borda oposta, e nao
  /// "antes de": o `canto direito` da propria frase fixa o lado.
  ///
  /// **O `TituloDeGrupoDeMenu` continua sendo quem titula**, e nao um `Text`
  /// novo ao lado de um botao: ele carrega o `Semantics(header: true)` e o vao
  /// de `e2` que a prosa de [build] mediu em 18/10, e remonta-los a mao aqui
  /// seria a quarta forma de cabecalho que aquela correcao veio tirar da tela.
  /// Ele entra num [Expanded] para que o titulo ceda espaco ao botao em 320 dp
  /// em vez de transbordar.
  ///
  /// **O botao e `TextButton` e nao `BotaoPrimario`:** a acao primaria desta
  /// secao e `Cadastrar meu pet`, que e o `FilledButton` que um portao cobra
  /// nos dois estados da lista. Duas tintas de marca na mesma secao fariam o
  /// `Ver todos` -- que e navegacao, nao criacao -- disputar a atencao com
  /// ela.
  ///
  /// **O PISO DE 48 dp VEM HERDADO, e eu MEDI de onde.** A primeira versao
  /// deste botao escrevia `minimumSize: Size(48, 48)` no estilo, com a prosa
  /// afirmando que sem ele o `TextButton` ficaria nos 36 dp do Material. **A
  /// afirmacao era falsa:** tirar o `minimumSize` nao derrubou caso nenhum --
  /// o alvo continuou em 48 dp. Quem o da e o
  /// `MaterialTapTargetSize.padded`, que e o padrao do botao. Trocar esse
  /// padrao por `shrinkWrap` derruba o alvo a **33,7 dp** e reprova o caso `o
  /// botao e ALCANCAVEL`, entao a medida do caso vale -- o que nao valia era o
  /// codigo que eu tinha escrito para ela. O `minimumSize` saiu por ser
  /// redundante, e o caso ficou como **guarda do padrao herdado**.
  ///
  /// `pisoMinimo` e nao `pisoCritico` pela mesma conta que o caso de
  /// acessibilidade desta tela ja escreve: `Perfil` > `Meus pets` nao e
  /// nenhuma das quatro superficies criticas do 6.5.
  Widget _cabecalho() {
    return Row(
      crossAxisAlignment: CrossAxisAlignment.center,
      children: <Widget>[
        const Expanded(child: TituloDeGrupoDeMenu(MeusPets.titulo)),
        if (_temMaisQueOTeto)
          Padding(
            // O `TituloDeGrupoDeMenu` carrega `e2` embaixo; sem o mesmo vao
            // aqui o botao desce meio passo em relacao ao titulo.
            padding: const EdgeInsets.only(bottom: BichuEspaco.e2),
            child: TextButton(
              onPressed: () => context.push(Rotas.meusPets),
              child: const Text(MeusPets.rotuloDeVerTodos),
            ),
          ),
      ],
    );
  }

  /// O corpo do bloco, por fase.
  ///
  /// ## A PORTA DE `Cadastrar pet` EXISTE EM TODA FASE COM SESSAO (20/10/2026)
  ///
  /// **Isto virou obrigacao hoje, e o motivo veio de outra tela.** O cliente
  /// mandou tirar o alvo secundario da acao flutuante de `Pets` (*"na pagina
  /// pet, remova o icone dos ..., so deixe o de escanear a tag"*), e com a
  /// folha dele saiu uma das duas portas de `Rotas.cadastrarPet`. A outra e o
  /// `Cadastrar meu pet` daqui -- **e ela so existia em DUAS das seis fases
  /// deste bloco**, medido:
  ///
  ///   | fase                            | tinha a porta? |
  ///   |---------------------------------|----------------|
  ///   | `carregando` sem cache          | NAO            |
  ///   | `carregando` com cache          | NAO            |
  ///   | `lista` vazia                   | sim            |
  ///   | `lista` com pets                | sim            |
  ///   | `falhaComCache`                 | NAO            |
  ///   | `falhaSemCache`                 | NAO            |
  ///
  /// Quatro fases sem porta nenhuma: quem abrisse a tela da conta com o
  /// servidor fora -- ou so enquanto a lista carrega -- **nao tinha como
  /// cadastrar um pet em lugar nenhum do app**. Antes de hoje a folha de
  /// `Pets` cobria o buraco; agora nada cobre.
  ///
  /// Entao a acao desceu para as quatro fases que nao a tinham. **Ela nao
  /// desceu numa quinta**, e a ausencia e a unica correta: `falhaSemCache`
  /// quando `_faltaConta` mostra [ConviteParaEntrar], e cadastrar pet exige
  /// conta -- oferecer a porta ali seria mandar a pessoa a um assistente que
  /// vai recusa-la, por cima do convite que resolve o problema dela.
  ///
  /// **E a porta continua sendo UMA**, construida por [_acaoDeCadastrar]: o
  /// `ItemDeMenu` que o briefing sugeriu poria um SEGUNDO controle para a
  /// mesma rota na mesma tela, a um cabecalho de distancia do botao -- `Meus
  /// pets > Cadastrar meu pet` e `Meus pets > Cadastrar pet` lado a lado.
  List<Widget> _corpo(BichuCores cores) {
    return switch (_fase) {
      // Esqueleto do paragrafo 11.3: moldura e barras em `surface-sunken`. Um
      // indicador circular no lugar disto nao diria que o que vem e uma lista.
      //
      // **A porta de cadastrar entra aqui tambem**, e nao e enfeite: a fase
      // dura o tempo da chamada, e com o servidor lento ela e a tela que a
      // pessoa ve. Ver a prosa deste metodo.
      _Fase.carregando when _pets.isEmpty => <Widget>[
          const _EsqueletoDeCartao(),
          const SizedBox(height: BichuEspaco.e3),
          const _EsqueletoDeCartao(),
          const SizedBox(height: BichuEspaco.e6),
          _acaoDeCadastrar(),
        ],
      _Fase.carregando => <Widget>[
          ..._cartoes(),
          const SizedBox(height: BichuEspaco.e6),
          _acaoDeCadastrar(),
        ],
      _Fase.lista when _pets.isEmpty => <Widget>[
          EstadoVazio(
            titulo: MeusPets.tituloDoVazio,
            explicacao: MeusPets.explicacaoDoVazio,
            acao: _acaoDeCadastrar(),
          ),
        ],
      _Fase.lista => <Widget>[
          ..._cartoes(),
          const SizedBox(height: BichuEspaco.e6),
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
          const SizedBox(height: BichuEspaco.e6),
          _acaoDeCadastrar(),
        ],
      // **SEM a porta, e e a unica fase em que a ausencia e certa:** nao ha
      // sessao, e cadastrar pet exige uma. Ver a prosa deste metodo.
      _Fase.falhaSemCache when _faltaConta => const <Widget>[
          ConviteParaEntrar(secao: SecaoComConta.meusPets),
        ],
      _Fase.falhaSemCache => <Widget>[
          FaixaDeAviso(
            texto: _textoDaFalha ?? MensagensDeErro.servidorFora,
            rotuloDaAcao: MeusPets.rotuloDeAtualizar,
            aoTocarNaAcao: _carregar,
          ),
          const SizedBox(height: BichuEspaco.e6),
          _acaoDeCadastrar(),
        ],
    };
  }

  // A ACAO `Marcar como perdido` SAIU DESTA TELA (18/10/2026).
  //
  // Ela mora agora na PAGINA DO PET (`telas/pet/tela_detalhe_do_pet.dart`),
  // junto do QR da plaquinha, e a razao e de produto e nao de arrumacao: a
  // escolha de qual animal deixou de ser uma pergunta. Quem abre a pagina da
  // Nina ja respondeu "a Nina" ao tocar no cartao dela, e a tela de escolha
  // (F3.0) existia para prevenir o deslize de marcar o pet errado -- deslize
  // que nao ha quando a acao esta na pagina de um animal so.
  //
  // O que ficou AQUI e o que sustenta aquela porta: **os cartoes**, que sao o
  // caminho da tela inicial do `Perfil` ate a pagina de cada pet. Medido em
  // 18/10: `Rotas.detalheDoPetDe` e empurrada daqui e de mais nenhum lugar de
  // `app/lib`, entao esconder o cartao deixaria a pagina do pet -- e com ela o
  // QR e a acao de perdido -- sem porta de entrada. E por isso que a lista
  // continua CONTEUDO desta tela e nao virou item de menu: um item levaria a
  // uma tela de lista que nao existe, e os cartoes ja levam ao pet.
  //
  // `MeusPets.rotuloDeMarcarPerdido` continua publicado logo acima, e nao e
  // esquecimento: a redacao da acao e UMA no produto inteiro (decisao do
  // cliente de 21/09), e enquanto a pagina do pet nao publicar a dela este e o
  // unico lugar que a guarda. Esta tela **nao a renderiza mais**.

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
  /// Sem paginacao: o contrato fixa o teto em 20 pets por conta e a `ListView`
  /// da `TelaDeAba` ja rola (criterio 14). Um `ListView` aninhado aqui dentro
  /// criaria uma segunda area de rolagem dentro da primeira.
  ///
  /// ## O CORTE DE [MeusPets.teto] (22/10/2026, pedido do cliente)
  ///
  /// **E corte de DESENHO e nao de BUSCA.** `_carregar` continua pedindo
  /// `GET /pets` inteiro e `_pets` continua guardando a conta inteira: e o que
  /// permite a [_temMaisQueOTeto] saber que ha mais, e o que faz o cache
  /// servir as duas telas. Buscar menos para mostrar menos exigiria uma
  /// segunda chamada quando a pagina abrisse, e a pagina veria um numero
  /// diferente do da secao enquanto ela nao voltasse.
  ///
  /// **O criterio 14 nao foi revogado, mudou de tela.** "Os 20 do teto
  /// aparecem, e a tela rola" e hoje propriedade da pagina
  /// ([TelaDeTodosOsPets], onde [MeusPets.teto] e nulo), e e la que o caso que
  /// o media passou a medi-lo. Na secao do `Perfil` a propriedade e a nova: no
  /// maximo tres, e o `Ver todos` quando ha mais.
  List<Widget> _cartoes() {
    final saida = <Widget>[];
    final teto = widget.teto;
    final quantos = teto == null
        ? _pets.length
        : (_pets.length < teto ? _pets.length : teto);
    for (var i = 0; i < quantos; i++) {
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

/// `Perfil` › `Meus pets` › **a lista inteira** (22/10/2026, pedido do
/// cliente).
///
/// Literal: *"caso o usuario clique no ver todos, abre uma pagina, com a
/// listagem de todos os pets dele"*.
///
/// ## ELA NAO TEM LISTA PROPRIA, E ISSO E O PONTO
///
/// O corpo desta pagina e **[MeusPets] sem teto**: o mesmo widget que a secao
/// do `Perfil` desenha, com `teto: null` em vez de
/// [MeusPets.tetoDoPerfil]. Nao ha um segundo `for` sobre `_pets`, um segundo
/// `CartaoDePet`, um segundo tratamento de falha nem um segundo cache.
///
/// **A alternativa medida era copiar [MeusPets] e tirar o corte**, e ela
/// quebra no dia seguinte: as seis fases do bloco (carregando com e sem cache,
/// lista vazia, lista cheia, falha com cache, falha sem cache), a porta de
/// `Cadastrar meu pet` em cinco delas, a trava de dono do cache e o convite
/// para entrar sao todos comportamento que teria de existir duas vezes. Este
/// produto reduziu 48 copias a 15 em 21/10 e o cliente ja reclamou de codigo
/// duplicado por recurso; uma lista de pet so pode ter um dono.
///
/// **O que esta pagina acrescenta e so o que ela e dona:** a moldura
/// (`Scaffold`, barra de topo com saida, rolagem propria) e o gesto de
/// atualizar. Nada de conteudo.
///
/// ## O TITULO E `Meus pets`, E ELE PODE SER REVISTO PELO CLIENTE
///
/// Ele nao escreveu titulo para esta pagina -- pediu o botao e disse que ele
/// "abre uma pagina, com a listagem de todos os pets dele". [MeusPets.titulo]
/// e o **minimo**: e a palavra que ele ja usou para a secao (*"na frente do
/// meus pets"*), e e a mesma que o `ConviteParaEntrar` e a gaveta ja dizem
/// para esta lista. Inventar `Todos os meus pets` seria escrever redacao de
/// tela, que nao e de quem implementa, e poria **dois nomes para a mesma
/// lista** a um toque de distancia. **Pergunta aberta para ele.**
///
/// ## A BARRA DE BAIXO NAO FICA, e a classificacao esta escrita
///
/// Pagina INTERNA pela regra de 20/10: quem a abre e o `Ver todos` do CORPO do
/// `Perfil`, e nao um controle da casca -- a mesma conta das oito ambiguas de
/// `barra_fixa_em_toda_tela_test.dart`, onde ela entrou como a nona. O
/// `escape` e [Rotas.perfil], como em `Meus dados`: quem cai aqui sem pilha
/// volta para a tela que tem o botao.
class TelaDeTodosOsPets extends StatefulWidget {
  const TelaDeTodosOsPets({super.key});

  @override
  State<TelaDeTodosOsPets> createState() => _TelaDeTodosOsPetsState();
}

class _TelaDeTodosOsPetsState extends State<TelaDeTodosOsPets> {
  /// O SLOT que [MeusPets] ja sabe preencher.
  ///
  /// **O gesto de arrastar vem pelo caminho que ja existe, e nao por um
  /// segundo.** [MeusPets] usa o mixin `PublicaAAtualizacao`, que publica a
  /// busca em `SlotDeAtualizacao.maybeOf(context)`; na casca das abas quem
  /// provê o slot e `TelaDeAba`. Aqui quem provê e esta pagina, e
  /// `ArrastarParaAtualizar.doSlot` le a busca no momento do arrasto.
  ///
  /// **Um `ArrastarParaAtualizar(aoAtualizar: ...)` nao serviria:** a busca e
  /// `_carregar`, que e privado do `State` de [MeusPets]. Expo-lo para esta
  /// tela seria um segundo caminho para dentro daquele estado -- e o slot e
  /// exatamente o arranjo que o app ja usa para "estado que e da lista,
  /// desenhado por quem e dono do espaco".
  final RecargaDaSecao _recarga = RecargaDaSecao();

  @override
  void dispose() {
    _recarga.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: const BarraDeConta(
        titulo: MeusPets.titulo,
        saida: TipoDeSaida.voltar,
        escape: Rotas.perfil,
      ),
      body: SafeArea(
        top: false,
        bottom: false,
        child: SlotDeAtualizacao(
          recarga: _recarga,
          child: ArrastarParaAtualizar.doSlot(
            recarga: _recarga,
            child: ListView(
              padding: const EdgeInsets.all(BichuEspaco.e4),
              addSemanticIndexes: false,
              children: <Widget>[
                // **`teto` nulo: a lista INTEIRA.** E `comCabecalho: false`
                // porque a barra de topo acima ja diz `Meus pets` -- dois
                // cabecalhos com a mesma palavra na mesma tela e o desvio que
                // a correcao de 18/10 veio tirar daqui.
                MeusPets(
                  cache: Escopo.of(context).cacheDeMeusPets,
                  comCabecalho: false,
                ),
              ],
            ),
          ),
        ),
      ),
    );
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
