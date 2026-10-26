
import 'dart:async';
import 'dart:collection';

import 'package:flutter/material.dart';
import 'package:url_launcher/url_launcher.dart';

import '../../api/falhas.dart';
import '../../api/mensagens_de_erro.dart';
import '../../api/modelos_diretorio.dart';
import '../../escopo.dart';
import '../../theme/bichu_colors.dart';
import '../../theme/bichu_tokens.g.dart';
import '../../widgets/arrastar_para_atualizar.dart';
import '../../widgets/barra_de_listagem.dart';
import '../../widgets/cidade_por_localizacao.dart';
import '../../widgets/convite_para_entrar.dart';
import '../../widgets/faixa_de_aviso.dart';
import '../../widgets/icone_do_inscrito.dart';
import '../../widgets/imagem_da_rede.dart';
import '../../widgets/moldura.dart';
import '../../widgets/rodape_da_paginacao.dart';
import '../casca_com_abas.dart';
import 'pagina_do_local.dart';

/// `Perto` — o diretorio de profissionais e estabelecimentos.
///
/// A listagem de `GET /v1/directory/entries` (`listDirectoryEntries`), com o
/// topo de listagem do app ([BarraDeListagem]).
///
/// ## A tela de detalhe EXISTE desde 18/10/2026
///
/// O cartao e tocavel e leva a [PaginaDoLocal] (`Rotas.localDoPerto`). O
/// pedido do cliente de 18/10 foi literal: que os locais do diretorio
/// virassem clicaveis, com pagina propria, pontuacao de 1 a 5 e recomendacao
/// em texto visivel aos outros usuarios. O paragrafo que dizia "nao ha tela de
/// detalhe nesta versao" foi substituido por este, e nao apagado: ele era
/// certo enquanto o destino nao existia.
///
/// ## O que esta tela NAO tem, e nenhuma das ausencias e esquecimento
///
/// - **Nao ha horario, endereco de rua, site, e-mail, redes, lista de
///   servicos nem preco.** A tabela nao tem essas colunas. **`logotipo` saiu
///   desta lista** e **`foto` continua nela**, e a diferenca entre as duas e
///   medida: `DirectoryEntrySummary.logo_url` entrou no contrato em 18/10
///   ("pode liberar as imagens do profissional no app") e o cartao a desenha
///   ao lado do nome, num quadrado de 56 dp; a FOTO do lugar e faixa 16:9 de
///   borda a borda e mora **so** na [PaginaDoLocal]. Vinte faixas numa
///   pagina de listagem custariam **65,6 MiB** de imagem decodificada (20 x
///   3,28 MiB, a 412 dp e 3x) -- 70,4 MiB se alguem esquecer o `cacheWidth`.
///   A vitrine da `Loja` chegou a 9,8 MB de primeira pintura por menos que
///   isso. **`avaliacao` tambem saiu desta lista**:
///   `DirectoryEntrySummary.rating` entrou no contrato em 18/10 e o cartao
///   mostra a media e a quantidade.
/// - **Nao ha mapa** (decisao de 17/09): o Maps cobra por carregamento e o
///   componente criaria precedente contra o ADR-0010.
///
/// ## A ordem, que e o ponto mais caro desta tela
///
/// `distance_available: false` significa que **a lista saiu por nome**. A tela
/// mostra `Nome` como ordem efetiva e diz por que. Ela **nunca** mostra a
/// lista como se fosse "os mais perto".
///
/// **Ela nao oferecia "ligar a localizacao", e passou a oferecer em
/// 20/10/2026 -- mas NAO para a ordem.** A distincao e o ponto, e o paragrafo
/// antigo continua valendo na metade dele:
///
/// - **Para a DISTANCIA, continua verdade que ligar o GPS aqui nao mudaria a
///   resposta.** O que a ordem por distancia usa e a localizacao de REFERENCIA
///   que o servidor guarda (BICHUS-92, `user_reference_locations`, chaveada por
///   `(user_id, session_family_id)`), e nenhuma tela deste app escreve
///   `reference_area` hoje. Um botao que prometesse mudar a ORDEM seria acao
///   sem destino -- o defeito que o criterio 2 da BICHUS-62 proibe, e pior que
///   os outros porque pareceria ter funcionado.
/// - **Para a CIDADE, deixou de ser verdade.** Decisao do cliente: *"nos
///   eventos e na comunidade, voce tambem deve trazer os mais proximos da
///   localizacao, utilizar a mesma inteligencia do pets"*. `city` sempre
///   existiu em `listDirectoryEntries` e o servidor sempre o aplicou
///   (`texto_para_busca(professionals.city)`): o que faltava era o app mandar.
///   A cidade que o aparelho resolve RECORTA a lista de verdade, e o botao tem
///   destino.
///
/// Entao a caixa oferece a localizacao para a **cidade**, e o rotulo da ordem
/// continua dizendo a verdade do servidor por `distance_available`. A cidade
/// recorta quais entradas entram; a distancia ordena as que entraram.
class ListaDoDiretorio extends StatefulWidget {
  const ListaDoDiretorio({super.key});

  /// O que a lista esta mostrando **enquanto nao ha cidade**.
  ///
  /// A aba abre SEM cidade de proposito, e isso e o recorte e nao um estado de
  /// espera. O molde e a decisao do cliente de 19/10/2026 para os pets -- *"o
  /// campo cidade do filtro da pagina pet nao deve ser obrigatorio, mas devemos
  /// filtrar pelos 20 ultimos pets cadastrados e ordenar pela cidade da
  /// localizacao dele"* -- e ele vale aqui pela decisao de 20/10.
  ///
  /// **Dizer isto importa:** uma lista do pais inteiro sem a frase parece uma
  /// lista que nao conseguiu recortar, e e a mesma reclamacao que tirou a
  /// cidade obrigatoria dos pets -- lista vazia com cara de defeito.
  static const String explicacaoSemCidade =
      'Mostrando profissionais de todas as cidades.';

  /// O titulo do vazio sem nenhum filtro: a secao ainda nao tem entrada na
  /// regiao de quem esta olhando.
  static const String tituloDoVazio = 'Ainda não há profissionais por aqui';

  static const String explicacaoDoVazio =
      'O Bichu está convidando veterinários, banhos e tosas e clínicas da sua '
      'região. Quando os primeiros entrarem, eles aparecem nesta lista.';

  /// O vazio **depois de filtrar**. E outro estado: aqui existe lista, e foi
  /// o recorte que a esvaziou.
  static const String tituloDoVazioFiltrado = 'Nada com esses filtros';

  static const String explicacaoDoVazioFiltrado =
      'Tire um filtro para ver mais profissionais da sua região.';

  /// A frase do fim da lista (paragrafo 11.20), no plural e no singular.
  ///
  /// `todos os 1 profissionais` e o que uma frase montada dentro do rodape
  /// produziria, e e por isso que ela e montada aqui.
  static String fimDaLista(int total) => total == 1
      ? 'Você viu o único profissional desta região.'
      : 'Você viu todos os $total profissionais desta região.';

  /// Quando a pagina seguinte nao chega. A lista ja carregada **fica**.
  static const String falhaAoCarregarMais =
      'Não foi possível carregar mais profissionais.';

  static const String rotuloDeAtualizar = 'Atualizar';

  /// O rotulo da porta de indicar.
  ///
  /// **"Indicar" e nao "cadastrar", e a palavra e o contrato.** Quem usa esta
  /// porta nao cria a entrada do diretorio: ele indica alguem para a gente
  /// conferir e convidar (ADR-0011 emenda 1). Um rotulo que dissesse
  /// "cadastrar" prometeria publicacao, e nada e publicado aqui.
  static const String rotuloDeIndicar = 'Indicar quem atende bem';

  @override
  State<ListaDoDiretorio> createState() => _ListaDoDiretorioState();
}

/// Os desfechos de uma carga. Nenhum deles e "tela em branco", e nenhum deles
/// e "lista vazia por falha".
enum _Fase { carregando, lista, falha }

class _ListaDoDiretorioState extends State<ListaDoDiretorio>
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
  RecorteDoDiretorio _recorte = const RecorteDoDiretorio();
  PaginaDoDiretorio? _pagina;
  String? _textoDaFalha;

  /// A falha foi **falta de conta**, e nao defeito.
  ///
  /// Guardado em vez de recalculado no `build` porque a resposta mora na
  /// `FalhaDaApi` que chegou, e ela nao sobrevive ao `setState`. Ver
  /// [faltaConta].
  bool _faltaConta = false;

  /// As entradas de **todas** as paginas ja pedidas, na ordem em que chegaram.
  ///
  /// `_pagina.itens` tem so a ultima pagina, e ler dela para desenhar a lista
  /// e o defeito que esta tela tinha: a pagina 2 substituiria a 1 em vez de
  /// continuar. O que a pagina ainda manda e o `total`, o `limit` e a ordem
  /// efetiva.
  final List<EntradaDoDiretorio> _itens = <EntradaDoDiretorio>[];

  /// A pagina seguinte esta em voo.
  bool _carregandoMais = false;

  /// Por que a pagina seguinte nao chegou. Nulo quando chegou, e nulo tambem
  /// enquanto ninguem pediu.
  String? _falhaDeMais;

  bool _visivel = false;
  bool _cargaAgendada = false;

  /// O campo de busca por nome (`q`, desde 30/09).
  final TextEditingController _busca = TextEditingController();

  /// As cidades que esta lista JA VIU, para o grupo `Cidade` da folha.
  ///
  /// Sai das entradas que chegaram, e nao de uma lista fixa: o diretorio nao
  /// tem rota de cidades, e inventar uma lista do Brasil ofereceria recorte que
  /// devolve zero em quase toda opcao. `SplayTreeSet` para a folha abrir em
  /// ordem alfabetica -- o mesmo arranjo de `agenda_da_rede.dart`.
  final SplayTreeSet<String> _cidadesConhecidas = SplayTreeSet<String>();

  /// A CIDADE DO APARELHO, pela mesma peca que `Pets` e `Eventos` usam.
  ///
  /// Decisao do cliente, 20/10/2026: *"nos eventos e na comunidade, voce
  /// tambem deve trazer os mais proximos da localizacao, utilizar a mesma
  /// inteligencia do pets"*.
  ///
  /// **ISTO NAO SUBSTITUI A ORDEM POR DISTANCIA DESTA ABA, e nao e a mesma
  /// coisa que ela.** A ordem por distancia ja existia e continua: ela sai de
  /// `ST_Distance(professionals.geo, <reference_point>)`, contra o ponto que o
  /// SERVIDOR guarda por aparelho, e so atravessa a borda em metros
  /// (`distance_m`). As duas se somam -- **a cidade recorta quais entradas
  /// entram, a distancia ordena as que entraram**.
  ///
  /// **O paragrafo do cabecalho desta classe que dizia que a tela nao oferece
  /// `ligar a localizacao` foi reescrito**, e a razao dele caiu: ele dizia que
  /// *"ligar o GPS aqui nao mudaria a resposta"* porque o que faltava era a
  /// `reference_area` que ninguem escrevia. Isso continua verdade **para a
  /// DISTANCIA** e deixou de ser verdade para a CIDADE: `city` sempre existiu
  /// em `listDirectoryEntries` e o servidor sempre o aplicou, e a cidade que o
  /// aparelho resolve recorta a lista de verdade. O botao tem destino.
  CidadeDoAparelho? _cidadeDoAparelho;

  /// A FOLHA decidiu a cidade, e por isso a derivada nao manda mais.
  ///
  /// **Nao e `a pessoa mexeu em algo`.** Ver `agenda_da_rede.dart`: um sinal
  /// generico de interacao foi a causa do defeito do botao de localizacao dos
  /// pets em 20/10, e `containsKey` na folha e da MESMA familia -- ele diz que
  /// o grupo existe, e nao que alguem mexeu nele. Este sinal e so sobre a
  /// cidade, e so liga quando a escolha da folha DIFERE da derivada.
  bool _folhaDecidiuACidade = false;

  /// Recarrega quando a tela volta a aparecer, pelo mesmo mecanismo de
  /// `Perfil` > `Meus pets`: `TickerMode` responde as duas maneiras de esta
  /// tela sumir da vista (trocar de aba, e ser coberta por uma rota opaca do
  /// navegador raiz) sem a tela precisar saber qual delas aconteceu.
  @override
  void didChangeDependencies() {
    super.didChangeDependencies();
    if (!TickerMode.valuesOf(context).enabled) {
      _visivel = false;
      return;
    }
    if (_visivel) return;
    _visivel = true;
    _criarAResolucaoDaCidade();
    _agendarCarga();
  }

  /// Cria o resolvedor de cidade e **dispara a resolucao de abertura**.
  ///
  /// Uma vez por tela: `didChangeDependencies` corre de novo a cada troca de
  /// dependencia herdada -- e aqui ela corre TAMBEM a cada volta para a aba --,
  /// e recriar o resolvedor gastaria uma medicao de ponto por vez.
  ///
  /// **A lista NAO espera por isto.** `_agendarCarga` corre em seguida e pinta
  /// as entradas; quando a cidade chega, a lista recarrega com o recorte.
  void _criarAResolucaoDaCidade() {
    if (_cidadeDoAparelho != null) return;
    // `doEscopo` e nao `Escopo.of(context).localizacao`: a porta fica atras da
    // peca, e esta tela nao a nomeia. Ver a lista de
    // `localizacao_no_ponto_de_uso_test.dart`.
    final resolvedor = CidadeDoAparelho.doEscopo(context)
      ..addListener(_aResolucaoAndou);
    _cidadeDoAparelho = resolvedor;
    unawaited(
      resolvedor.resolverNaAbertura().then((trocou) {
        if (!mounted || !trocou) return;
        // Quem mexeu na cidade na folha enquanto a resolucao corria MANDA.
        if (_folhaDecidiuACidade) return;
        _carregar();
      }),
    );
  }

  /// A caixa e a frase dela dependem do resolvedor; `setState` vazio basta.
  void _aResolucaoAndou() {
    if (!mounted) return;
    setState(() {});
  }

  /// A CIDADE QUE VALE AGORA, e e ela que vai para `city` na rota.
  ///
  /// **A folha ganha da derivada, inclusive quando a folha diz `nenhuma`** --
  /// e o que faz limpar o filtro significar limpar.
  String? get _cidadeEmUso =>
      _folhaDecidiuACidade ? _recorte.cidade : _cidadeDoAparelho?.cidade;

  /// O recorte como ele vai para a ROTA: com a cidade em uso aplicada.
  ///
  /// **A cidade derivada entra aqui e nao em `_recorte`**, e num lugar so
  /// porque sao DOIS chamadores (a primeira pagina e o `Carregar mais`) -- e um
  /// deles esquecendo faria a pagina 2 vir de outro recorte que a 1, o que
  /// aparece como entrada repetida e entrada faltando no fim da lista.
  ///
  /// Guardar a derivada no recorte teria duas consequencias indesejadas: ela
  /// contaria em `quantidadeDeFiltros` e acenderia o distintivo da barra numa
  /// lista que ninguem recortou, e ela voltaria por cima de quem acabou de
  /// limpar o filtro de cidade.
  RecorteDoDiretorio _paraAChamada(RecorteDoDiretorio base) {
    final cidade = _cidadeEmUso;
    return base.com(cidade: cidade, limparCidade: cidade == null);
  }

  /// O TOQUE em `Usar minha localização`.
  ///
  /// Ele **devolve a palavra a localizacao**: [_folhaDecidiuACidade] desliga,
  /// porque a pessoa acabou de escolher a localizacao e essa e a escolha mais
  /// nova. Sem desligar, a precedencia de [_cidadeEmUso] devolveria a cidade da
  /// folha e a resolucao ficaria sem efeito -- o defeito de 20/10 nos pets.
  Future<void> _usarMinhaLocalizacao() async {
    final resolvedor = _cidadeDoAparelho;
    if (resolvedor == null) return;
    await resolvedor.resolverPorToque();
    if (!mounted) return;
    if (resolvedor.cidade == null) return;
    setState(() {
      _folhaDecidiuACidade = false;
      // A cidade da folha sai do recorte junto: deixa-la gravada faria a folha
      // abrir marcando uma cidade que a lista nao esta usando.
      if (_recorte.cidade != null) {
        _recorte = _recorte.com(limparCidade: true);
      }
    });
    await _carregar();
  }

  void _agendarCarga() {
    if (_cargaAgendada) return;
    _cargaAgendada = true;
    WidgetsBinding.instance.addPostFrameCallback((_) {
      _cargaAgendada = false;
      if (mounted) _carregar();
    });
  }

  /// Carrega a **primeira** pagina do recorte atual, sempre.
  ///
  /// A normalizacao do `page` nao e zelo: este metodo e chamado tambem pelo
  /// retorno a aba (`didChangeDependencies`) e pelo `Atualizar` da faixa de
  /// falha, e nesses dois caminhos `_recorte.pagina` pode estar em 3 por causa
  /// do `Carregar mais`. Sem ela, voltar para a aba pediria a pagina 3 e
  /// mostraria vinte entradas do meio como se fossem a lista inteira -- e com
  /// um recorte pequeno a pagina 3 volta **vazia**, que e o "a lista ficou
  /// vazia sem motivo" que ninguem consegue reproduzir.
  Future<void> _carregar() async {
    if (!mounted) return;
    final escopo = Escopo.of(context);
    final recorte =
        _recorte.pagina == 1 ? _recorte : _recorte.com(pagina: 1);
    setState(() {
      _recorte = recorte;
      _fase = _Fase.carregando;
      _textoDaFalha = null;
      _faltaConta = false;
      _falhaDeMais = null;
      _carregandoMais = false;
      _itens.clear();
    });

    try {
      final pagina = await escopo.diretorio.listar(_paraAChamada(recorte));
      if (!mounted) return;
      setState(() {
        _pagina = pagina;
        _itens
          ..clear()
          ..addAll(pagina.itens);
        _guardarAsCidades(pagina.itens);
        _fase = _Fase.lista;
      });
    } on FalhaDeChamada catch (falha) {
      if (!mounted) return;
      setState(() {
        // O SERVIDOR DIZ SE E FALTA DE CONTA, por `next_action: sign_in`.
        // Antes de 19/10 este 401 caia no catalogo geral, que devolve
        // `texto: ''` desde a remocao de 18/10 -- e a tela desenhava uma
        // faixa de ERRO sem frase nenhuma com um botao `Atualizar` ao lado,
        // que e exatamente o que o cliente relatou do iPhone.
        _faltaConta = faltaConta(falha);
        // O 429 desta rota e por CONTA, e o texto generico nao diz isso.
        _textoDaFalha =
            textoDoTetoDoDiretorio(falha) ?? MensagensDeErro.de(falha).texto;
        // **A pagina anterior sai da tela.** Deixar os cartoes antigos sob
        // uma faixa de erro faria a lista afirmar um recorte que ela nao
        // conseguiu aplicar — a pessoa acabou de trocar o filtro e veria o
        // resultado do filtro anterior como se fosse o novo.
        _pagina = null;
        _fase = _Fase.falha;
      });
    } on FormatException catch (erro) {
      if (!mounted) return;
      setState(() {
        _textoDaFalha = MensagensDeErro.servidorFora;
        _pagina = null;
        _fase = _Fase.falha;
      });
      debugPrint('Resposta do diretorio fora do contrato: $erro');
    }
  }

  @override
  void dispose() {
    _busca.dispose();
    _cidadeDoAparelho?.dispose();
    super.dispose();
  }

  /// Recolhe as cidades das entradas que chegaram, para o grupo `Cidade`.
  void _guardarAsCidades(List<EntradaDoDiretorio> entradas) {
    for (final e in entradas) {
      final c = e.cidade?.trim();
      if (c != null && c.isNotEmpty) _cidadesConhecidas.add(c);
    }
  }

  void _trocarRecorte(RecorteDoDiretorio novo) {
    setState(() => _recorte = novo);
    _carregar();
  }

  /// Pede a pagina seguinte e **acrescenta** o que vier.
  ///
  /// A falha aqui nao apaga a lista, ao contrario da falha da pagina 1. Na
  /// pagina 1 o recorte mudou e os cartoes antigos seriam a resposta errada;
  /// aqui o recorte e o mesmo, e as entradas na tela continuam sendo a
  /// resposta certa para ele.
  Future<void> _carregarMais() async {
    if (!mounted || _carregandoMais) return;
    final atual = _pagina;
    if (atual == null) return;

    final escopo = Escopo.of(context);
    final proximo = _recorte.com(pagina: atual.pagina + 1);
    setState(() {
      _carregandoMais = true;
      _falhaDeMais = null;
    });

    try {
      final pagina = await escopo.diretorio.listar(_paraAChamada(proximo));
      if (!mounted) return;
      setState(() {
        _recorte = proximo;
        _pagina = pagina;
        _itens.addAll(pagina.itens);
        _guardarAsCidades(pagina.itens);
        _carregandoMais = false;
      });
    } on FalhaDeChamada catch (falha) {
      if (!mounted) return;
      setState(() {
        _carregandoMais = false;
        _falhaDeMais =
            textoDoTetoDoDiretorio(falha) ?? ListaDoDiretorio.falhaAoCarregarMais;
      });
    } on FormatException catch (erro) {
      if (!mounted) return;
      setState(() {
        _carregandoMais = false;
        _falhaDeMais = ListaDoDiretorio.falhaAoCarregarMais;
      });
      debugPrint('Resposta do diretorio fora do contrato: $erro');
    }
  }

  @override
  Widget build(BuildContext context) {
    final pagina = _pagina;

    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: <Widget>[
        // **A PORTA DE INDICAR SUBIU PARA A BARRA DE TOPO** em 18/10/2026, e
        // nao esta mais aqui. Pedido literal do cliente: "os itens de criacao,
        // como evento e indicacao, ate o escanear poderia ser icones na barra
        // superior ... e nao fique esse botao grande na pagina ocupando muito
        // espaco".
        //
        // Isto REVERTEU o que estava escrito nesta linha em 17/10 -- "no
        // CORPO e nao na `AppBar`" --, e a reversao e decisao dele.
        //
        // **E em 19/10 ela SAIU DA BARRA e virou acao FLUTUANTE**, para o
        // sino de notificacao entrar no lugar: *"O botao criar sai da
        // barra"*. **Ela nao voltou para esta linha**: o que ele recusou em
        // 18/10 foi o botao de LARGURA TOTAL que ocupava 64 dp de linha aqui,
        // e a acao flutuante nao ocupa linha nenhuma do fluxo.
        //
        // Quem desenha e `AcaoDeCriarFlutuante`; quem a entrega a casca e
        // `SecaoDaRede`, em `rede/secao_da_rede.dart`. **Era `AbaPerto`, em
        // `abas.dart`, ate 19/10**: a secao `Perto` deixou de existir e esta
        // lista virou o corpo da aba `Comunidade` da `Rede`, onde a acao
        // flutuante TROCA com a aba.
        //
        // **E ela deixou de aparecer para quem nao pode usa-la**, que era o
        // segundo defeito que ele relatou no mesmo dia: a porta convidava
        // deslogado e a tela de destino e que dizia "Entre para indicar". Ela
        // agora exige conta E e-mail confirmado, e `podeCriarNaComunidade`,
        // em `abas.dart`, e quem decide. `rotuloDeIndicar` continua aqui
        // porque ele e o rotulo acessivel do icone e esta tela e a dona da
        // palavra.
        //
        // O que saiu daqui foi um `BotaoSecundario` de largura total com 48 dp
        // de altura, dentro de um `Padding` de 16 dp embaixo: 64 dp de altura
        // devolvidos ao corpo da listagem.
        //
        // A barra so aparece quando ha pagina: antes dela a tela nao sabe
        // quantos itens existem nem em que ordem eles vieram, e um controle
        // de ordenacao sobre nada ainda medido seria o controle que afirma.
        // **A CAIXA DA LOCALIZACAO, e ela sai de cena quando a cidade chega**
        // (cliente, 20/10/2026 -- pedido em `Pets` e valendo para as tres
        // secoes). Quem decide aparecer e sair e a propria caixa, pelo criterio
        // `ha cidade em uso`: a regra mora num lugar so, porque tres copias
        // divergem na proxima correcao.
        //
        // **No CORPO da tela e nao na barra**, como busca, filtro e ordem
        // (padrao de listagem do cliente), e ACIMA da barra: ela explica o
        // recorte que a barra resume.
        if (_fase != _Fase.carregando) ...<Widget>[
          CaixaDeLocalizacao(
            cidadeEmUso: _cidadeEmUso,
            explicacao: ListaDoDiretorio.explicacaoSemCidade,
            podeOferecer: _cidadeDoAparelho?.podeOferecer ?? false,
            aviso: _cidadeDoAparelho?.aviso,
            // Desabilitado enquanto procura: dois toques pediriam a permissao
            // duas vezes e gastariam o teto de uso do geocoder duas vezes.
            aoUsarLocalizacao: (_cidadeDoAparelho?.procurando ?? true)
                ? null
                : _usarMinhaLocalizacao,
          ),
          if (_cidadeEmUso == null &&
              (_cidadeDoAparelho?.podeOferecer ?? false))
            const SizedBox(height: BichuEspaco.e4),
        ],
        if (pagina != null)
          BarraDeListagem(
            total: pagina.total,
            busca: _controleDeBusca(),
            filtro: _controleDeFiltro(),
            ordenacao: _controleDeOrdenacao(pagina),
            aoAplicar: _aplicarAFolha,
          ),
        ..._corpo(),
      ],
    );
  }

  /// A busca por NOME, servida pelo servidor (`q`).
  ///
  /// `AlcanceDaBusca.servidor` e uma AFIRMACAO conferida: o portao de
  /// `app/test/telas/perto_com_dados_test.dart` le `api/openapi.yaml` e reprova
  /// se o campo existir sem `q` na rota, ou se a rota aceitar `q` e a tela
  /// declarar `paginaCarregada`.
  ///
  /// O piso de tres caracteres NAO esta aqui: ele mora em
  /// `RecorteDoDiretorio.termoQueVai`, com o motivo do indice de trigrama ao
  /// lado. Aqui o termo entra no recorte sempre, e quem decide se ele vira
  /// parametro e o recorte -- assim apagar o campo volta para a lista inteira
  /// em vez de congelar o ultimo resultado.
  ControleDeBusca _controleDeBusca() {
    return ControleDeBusca(
      controlador: _busca,
      alcance: AlcanceDaBusca.servidor,
      rotulo: 'Buscar profissional',
      termoAplicado: _recorte.termo,
      // Tres letras, e o motivo e o indice de trigrama que `termoQueVai`
      // documenta: com duas a rota nao recebe `q`, a lista volta inteira e o
      // topo da tela diria que ha recorte onde nao ha.
      minimoDeCaracteres: 3,
      aoAplicar: (termo) => _trocarRecorte(
        termo == null
            ? _recorte.com(limparTermo: true, pagina: 1)
            : _recorte.com(termo: termo, pagina: 1),
      ),
    );
  }

  /// O filtro: atividade e nivel de verificacao, que sao os dois recortes que
  /// a rota aceita. Nada mais entra aqui sem entrar antes no contrato.
  ControleDeFiltro _controleDeFiltro() {
    // **A CIDADE DERIVADA APARECE NA FOLHA, marcada e editavel.** E a outra
    // metade do pedido de 20/10/2026: resolvida, a caixa sai e fica *"so a
    // cidade dentro do filtro"*. Ela entra nas OPCOES tambem porque a
    // resolucao pode chegar antes da primeira resposta da rota -- sem esta
    // linha o grupo abriria com um valor selecionado que nao existe na lista.
    final cidades = SplayTreeSet<String>.from(_cidadesConhecidas);
    final emUso = _cidadeEmUso;
    if (emUso != null) cidades.add(emUso);
    return ControleDeFiltro(
      grupos: <GrupoDeFiltro>[
        if (cidades.isNotEmpty)
          GrupoDeFiltro(
            chave: 'city',
            titulo: 'Cidade',
            selecionado: emUso,
            opcoes: <OpcaoDeRecorte>[
              for (final c in cidades) OpcaoDeRecorte(codigo: c, rotulo: c),
            ],
          ),
        GrupoDeFiltro(
          chave: 'kind',
          titulo: 'Atividade',
          selecionado: _recorte.atividade?.codigo,
          opcoes: <OpcaoDeRecorte>[
            for (final a in AtividadeDoDiretorio.values)
              OpcaoDeRecorte(codigo: a.codigo, rotulo: a.rotulo),
          ],
        ),
        GrupoDeFiltro(
          chave: 'verification_level',
          titulo: 'Verificação',
          selecionado: _recorte.nivelMinimo?.codigo,
          // A regra do contrato que ninguem adivinha olhando a lista.
          nota: 'É um piso: quem pede contato verificado recebe também quem '
              'tem documento verificado.',
          opcoes: const <OpcaoDeRecorte>[
            OpcaoDeRecorte(
              codigo: 'contact_verified',
              rotulo: 'Contato verificado',
            ),
            OpcaoDeRecorte(
              codigo: 'document_verified',
              rotulo: 'Documento verificado',
            ),
          ],
        ),
      ],
    );
  }

  /// Os dois grupos **e a ordem** de uma vez, no `Aplicar`: uma chamada a
  /// rota, e a lista sempre de volta a `pagina: 1`.
  ///
  /// Antes eram tres caminhos (cada grupo e a folha de ordem), e trocar
  /// atividade, verificacao e ordem dava tres chamadas e tres voltas a
  /// primeira pagina.
  void _aplicarAFolha(EscolhaDaFolha escolha) {
    final atividade = escolha.filtros['kind'];
    final nivel = escolha.filtros['verification_level'];

    // **QUANDO A FOLHA PASSA A MANDAR NA CIDADE -- e nao e a cada `Aplicar`.**
    //
    // `EscolhaDaFolha.filtros` traz TODAS as chaves que os grupos declararam,
    // com o valor marcado de cada um; `containsKey` diz que o grupo EXISTE, e
    // nao que alguem mexeu nele. **E a mesma familia do `_pessoaMexeu`** que
    // causou o defeito do botao de localizacao dos pets em 20/10: um sinal de
    // "a pessoa interagiu" usado como se fosse "a pessoa decidiu ISTO".
    //
    // Sem a comparacao, qualquer `Aplicar` -- trocar `Atividade`, por exemplo
    // -- gravaria a cidade DERIVADA no recorte: o distintivo da barra subiria
    // em cima de uma cidade que ninguem escolheu, e a derivada pararia de
    // acompanhar o aparelho.
    //
    // Valor igual a derivada significa que a folha so devolveu o que ja estava
    // valendo; valor diferente e uma decisao -- inclusive `nenhuma`, que e
    // alguem limpando o recorte de proposito.
    var cidade = _recorte.cidade;
    var limparCidade = false;
    if (escolha.filtros.containsKey('city')) {
      final escolhida = escolha.filtros['city'];
      if (escolhida == _cidadeDoAparelho?.cidade) {
        // So a derivada, de volta: ela continua entrando por `_paraAChamada`,
        // onde nao conta como filtro.
        cidade = null;
        limparCidade = true;
      } else {
        cidade = escolhida;
        limparCidade = escolhida == null;
        _folhaDecidiuACidade = true;
      }
    }

    _trocarRecorte(
      _recorte.com(
        atividade: AtividadeDoDiretorio.porCodigo(atividade),
        limparAtividade: atividade == null,
        nivelMinimo: nivel == null ? null : NivelDeVerificacao.porCodigo(nivel),
        limparNivel: nivel == null,
        cidade: cidade,
        limparCidade: limparCidade,
        ordem: OrdemDoDiretorio.porCodigo(escolha.ordem),
        pagina: 1,
      ),
    );
  }

  /// A ordenacao, montada a partir do que **de fato** aconteceu.
  ///
  /// [PaginaDoDiretorio.ordemEfetiva] sai de `distance_available`, que e a
  /// resposta do servidor sobre a ordem real, e e ela que o rotulo do controle
  /// mostra: a linha de resumo diz `Nome` quando a lista saiu por nome, mesmo
  /// que o app tenha pedido distancia. **Isso nao mudou.**
  ///
  /// **A FAIXA DE EXPLICACAO SAIU** (18/10/2026, literal do cliente: *"remova
  /// o bloco do texto: essa lista está em ordem alfabética"*). Era
  /// `ListaDoDiretorio.semLocalizacao`, montada aqui quando a ordem pedida
  /// divergia da efetiva e desenhada por `BarraDeListagem` em
  /// `porQueNaoEAPedida`.
  ///
  /// Com a faixa fora, a comparacao entre pedida e efetiva nao tem mais para
  /// quem falar, e o calculo saiu junto -- deixar `divergiu` sem uso seria
  /// codigo morto prometendo uma faixa que nao existe.
  ///
  /// **O campo `porQueNaoEAPedida` do componente FICA**: ele e compartilhado, e
  /// `rede/agenda_da_rede.dart` o usa com outro texto
  /// (`ordemTrocadaPeloServidor`), que o cliente nao mencionou.
  ///
  /// O que a pessoa perde: a frase que dizia POR QUE nao ha distancia. O que
  /// ela mantem: a ordem REAL escrita no controle e na linha de resumo, que e
  /// o que impede a tela de mentir sobre proximidade -- e tem caso proprio.
  ControleDeOrdenacao _controleDeOrdenacao(PaginaDoDiretorio pagina) {
    final efetiva = pagina.ordemEfetiva;

    return ControleDeOrdenacao(
      opcoes: <OpcaoDeRecorte>[
        for (final o in OrdemDoDiretorio.values)
          OpcaoDeRecorte(codigo: o.codigo, rotulo: o.rotulo),
      ],
      efetiva: efetiva.codigo,
    );
  }

  List<Widget> _corpo() {
    if (_fase == _Fase.carregando) {
      return const <Widget>[
        _EsqueletoDeEntrada(),
        SizedBox(height: BichuEspaco.e3),
        _EsqueletoDeEntrada(),
      ];
    }

    final pagina = _pagina;
    // A falha, **e tambem a fase `lista` sem pagina**. O segundo ramo e
    // defensivo e nao decorativo: uma lista que se diz carregada sem pagina
    // seria a tela afirmando ter recebido algo que ela nao tem.
    if (_fase == _Fase.falha || pagina == null) {
      // SEM CONTA NAO E ERRO, e nao tem `Atualizar`: recarregar sairia
      // igualmente sem conta e voltaria o mesmo 401.
      if (_faltaConta) {
        return const <Widget>[
          ConviteParaEntrar(secao: SecaoComConta.diretorio),
        ];
      }
      return <Widget>[
        FaixaDeAviso(
          texto: _textoDaFalha ?? MensagensDeErro.servidorFora,
          rotuloDaAcao: ListaDoDiretorio.rotuloDeAtualizar,
          aoTocarNaAcao: _carregar,
        ),
      ];
    }

    if (_itens.isEmpty) {
      // **Dois vazios, e eles dizem coisas diferentes.** Um diz que a secao
      // ainda nao tem gente; o outro diz que o recorte da pessoa e que nao
      // tem. Uma frase so para os dois mandaria embora quem so precisava
      // tirar um filtro.
      return <Widget>[
        if (_recorte.quantidadeDeFiltros > 0)
          const EstadoVazio(
            titulo: ListaDoDiretorio.tituloDoVazioFiltrado,
            explicacao: ListaDoDiretorio.explicacaoDoVazioFiltrado,
          )
        else
          const EstadoVazio(
            titulo: ListaDoDiretorio.tituloDoVazio,
            explicacao: ListaDoDiretorio.explicacaoDoVazio,
          ),
      ];
    }

    return <Widget>[
      for (var i = 0; i < _itens.length; i++) ...<Widget>[
        if (i > 0) const SizedBox(height: BichuEspaco.e3),
        CartaoDoDiretorio(entrada: _itens[i]),
      ],
      const SizedBox(height: espacoAcimaDoRodape),
      RodapeDaPaginacao(
        carregados: _itens.length,
        total: pagina.total,
        carregando: _carregandoMais,
        textoDaFalha: _falhaDeMais,
        fimDaLista: ListaDoDiretorio.fimDaLista,
        aoPedirMais: _carregarMais,
      ),
    ];
  }
}

/// O cartao de uma entrada do diretorio.
///
/// **E TOCAVEL desde 18/10/2026, e a mudanca e uma decisao do cliente.**
///
/// Ate 18/10 este comentario dizia o contrario, com estas palavras: "nao e
/// tocavel, e a ausencia e o desenho -- nao ha tela de detalhe nesta versao;
/// um `InkWell` aqui seria acao sem destino". Aquilo estava certo: o criterio
/// 2 da BICHUS-62 proibe acao sem destino, e este app ja teve dois botoes
/// apontando para o vazio. **O que mudou nao foi o criterio, foi o mundo** --
/// em 18/10 o cliente pediu que os locais do `Perto` virassem clicaveis, com
/// pagina de detalhes, pontuacao de 1 a 5 e recomendacoes em texto visiveis
/// aos outros usuarios, "como acontece na playstore". AGORA EXISTE DESTINO:
/// [PaginaDoLocal], em `Rotas.localDoPerto`. O `InkWell` abaixo nao contorna o
/// criterio 2 -- ele passou a satisfaze-lo.
///
/// A seta de avanco continua **fora**: o cartao inteiro e o alvo, e uma seta
/// ao lado de um alvo que ja ocupa a largura toda nao acrescenta destino
/// nenhum, acrescenta um segundo ponto de toque para o mesmo lugar.
///
/// **Duas acoes, e as duas condicionais.** O cartao leva a pagina; `Ligar` so
/// existe quando `phone_e164` existe. Cartao sem telefone nao ganha botao
/// desabilitado: ganha nenhum botao. O botao de ligar fica FORA do `InkWell`
/// de proposito: toque nele liga, e nao abre a pagina.
class CartaoDoDiretorio extends StatelessWidget {
  const CartaoDoDiretorio({required this.entrada, super.key});

  final EntradaDoDiretorio entrada;

  /// O rotulo **VISIVEL**: so `Ligar`, e nunca o nome do local.
  ///
  /// Pedido do cliente em 18/10/2026: *"os botoes de ligar para devem ser
  /// apenas 'Ligar' com o icone, nao devem trazer repetidamente o nome da
  /// clinica"*. Ele esta certo por construcao e nao por gosto: o nome do local
  /// esta a tres linhas de distancia, no titulo do mesmo cartao, e repeti-lo
  /// dentro do botao gastava a largura inteira do cartao para dizer o que o
  /// olho acabou de ler.
  static const String rotuloDeLigar = 'Ligar';

  /// O nome **ACESSIVEL**: `Ligar para a Clinica Santa Barbara`.
  ///
  /// **O rotulo visivel encurtou; este NAO.** Numa lista de dez entradas, dez
  /// controles chamados so `Ligar` sao dez paradas indistinguiveis para quem
  /// navega por leitor de tela e chegou no botao sem ver o cartao inteiro
  /// (WCAG 2.1 SC 4.1.2). O `Semantics` do botao publica esta string, e
  /// `SC 2.5.3` continua satisfeito porque o rotulo visivel (`Ligar`) e
  /// prefixo do nome acessivel -- quem usa comando de voz diz "Ligar" e
  /// acerta.
  static String ligarPara(String nome) => '$rotuloDeLigar para $nome';

  /// A distancia em texto, ou nulo.
  ///
  /// **NAO e mais desenhada por este cartao** (cliente, 22/10/2026), e continua
  /// aqui porque `_Cabecalho` da pagina do local a le -- ver a prosa de `build`.
  /// Mover a funcao para la junto com a linha teria trocado uma definicao por
  /// duas no dia em que a listagem a quisesse de volta.
  ///
  /// O servidor arredonda a 100 m, que e a grade em que o produto quantiza a
  /// localizacao (ADR-0006): precisao maior nao existe na origem, e escrever
  /// `2,73 km` inventaria dois digitos.
  static String? distanciaEmTexto(int? metros) {
    if (metros == null) return null;
    if (metros < 1000) return 'a $metros m';
    final km = (metros / 100).round() / 10;
    final texto = km.toStringAsFixed(1).replaceAll('.', ',');
    return 'a $texto km';
  }

  @override
  Widget build(BuildContext context) {
    final cores = BichuColors.of(context).cores;
    final textos = Theme.of(context).textTheme;

    // CINCO COISAS, E SO ELAS (cliente, 22/10/2026): *"a listagem dos
    // profissionais deve ser apenas o logo, nome, segmento, endereco e botao
    // de ligar, remova as informacoes adicionais, deixe apenas na pagina
    // interna"*.
    //
    // **O que saiu, e onde cada um ja estava na pagina interna** -- conferido
    // ANTES de remover, porque *"deixe apenas na pagina interna"* pressupoe
    // que la ja tem, e remover o que nao estivesse la seria apagar o dado do
    // produto:
    //
    // | saiu do cartao            | ja estava em `pagina_do_local.dart`      |
    // |---------------------------|------------------------------------------|
    // | media e contagem          | `_BlocoDaPontuacao`, secao `Avaliacoes`  |
    // | distancia (`a 1,2 km`)    | `_Cabecalho`, linha `schedule_outlined`  |
    // | `about` (a apresentacao)  | `_Informacoes`, `_Corpo`                 |
    // | selo do que foi verificado| `_Cabecalho`, `_Selo`                    |
    //
    // Os quatro continuam chegando na resposta e continuam lidos por
    // `EntradaDoDiretorio`: **o contrato nao mudou, a PINTURA mudou.** Pedir
    // ao servidor que pare de manda-los seria mudar o contrato por causa de um
    // desenho, e a pagina do local usa os mesmos campos.
    //
    // O `endereco` dos cinco e **SO O BAIRRO** (cliente, 22/10/2026, quando
    // perguntado o que ele queria por endereco na listagem): *"na listagem
    // exibe so o bairro e na pagina interna o endereco completo com o clique
    // para abrir o mapa"*.
    //
    // Antes desta linha o cartao escrevia `Pinheiros · São Paulo · SP`, os
    // tres rotulos de `DirectoryEntrySummary`. **A cidade e a UF nao foram
    // apagadas do produto**: elas continuam na pagina interna, na linha de
    // lugar do `_Cabecalho` (e no texto de compartilhar), e o caso
    // `cidade e UF saem da listagem e CONTINUAM na pagina interna` mede as
    // duas metades.
    //
    // **`linhaDeLugarDe` com UM argumento, e nao `entrada.bairro` cru**, e a
    // escolha e de robustez e nao de estilo: ela filtra string vazia (`''` e
    // `'   '` viram nulo) e devolve nulo quando nao sobra nada. O servidor
    // promete nulo e nao promete nunca mandar vazio -- e `Text('')` desenharia
    // uma linha em branco de altura cheia entre o segmento e o `Ligar`, que e
    // o defeito que ninguem olha duas vezes. A regra continua tendo UMA
    // definicao, lida pelas duas telas.
    //
    // **SEM BAIRRO NAO HA LINHA, e nao ha recuo para cidade.** Medido no
    // contrato: `neighborhood`, `city` e `state` sao os TRES `nullable: true`
    // em `DirectoryEntrySummary`, e nenhum esta em `required` -- entao bairro
    // nulo e estado possivel e nao erro. Cair para cidade seria inventar um
    // recuo que ele nao pediu, e dizer `São Paulo` onde ele pediu bairro faria
    // a listagem parecer ter a informacao que nao tem. **E e a regra desta
    // casa, aplicada sem excecao**: distancia nula nao escreve linha,
    // `rating` ausente nao desenha linha, local sem foto nao tem faixa vazia.
    // O cartao de uma entrada sem bairro tem quatro itens em vez de cinco, e o
    // caso `ISCA — o cartao minimo` mede que ele continua de pe.
    final atividade = entrada.atividade?.rotulo;
    final bairro = linhaDeLugarDe(bairro: entrada.bairro);
    final telefone = entrada.telefoneE164;
    final logo = entrada.logoUrl;

    return Container(
      width: double.infinity,
      padding: const EdgeInsets.all(BichuEspaco.e4),
      decoration: BoxDecoration(
        color: cores.surface,
        borderRadius: BorderRadius.circular(BichuRaio.lg),
        border: Border.all(color: cores.outline, width: BichuBorda.hairline),
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: <Widget>[
          // Nome, atividade, lugar, distancia e pontuacao sao UMA parada de
          // foco: quem usa leitor de tela ouve a entrada inteira num deslize,
          // em vez de cinco paradas para o mesmo objeto. O botao de ligar fica
          // FORA do merge E fora do `InkWell`, porque ele e um controle com
          // destino PROPRIO -- toque nele liga, e nao abre a pagina.
          //
          // O `InkWell` embrulha o merge, e nao o cartao inteiro, justamente
          // para o botao de ligar nao ficar dentro de uma area tocavel que
          // leva a outro lugar.
          InkWell(
            onTap: () => PaginaDoLocal.abrir(context, entrada.slug),
            borderRadius: BorderRadius.circular(BichuRaio.md),
            child: MergeSemantics(
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: <Widget>[
                  // A LOGO AO LADO DO NOME, quando ha (cliente, 18/10/2026).
                  //
                  // **Fora da semantica, de proposito.** A logo esta ao lado
                  // do nome e o nome ja e o rotulo desta entrada: rotula-la
                  // faria o leitor de tela dizer "Clinica Santa Barbara,
                  // imagem, Clinica Santa Barbara" numa parada de foco so. Ela
                  // e decorativa AQUI por causa de onde esta -- e por isso a
                  // decisao e do cartao, e nao de `ImagemDaRede`.
                  //
                  // **Sem logo o quadrado NAO fica vazio, e tambem nao
                  // desaparece: ele recebe o glifo do TIPO.** Ate 18/10/2026
                  // este bloco tinha um `else` que desenhava o nome na largura
                  // inteira, e a prosa aqui dizia que era o certo. O cliente
                  // pediu o contrario no mesmo dia: *"tem que colocar o icone
                  // de clinica, estabelecimento, profissional, caso a
                  // foto/logo da empresa nao tenha sido cadastrada"*.
                  //
                  // **A troca nao e cosmetica, e nao e um retangulo cinza.**
                  // `logoUrl` e nulo em tres casos normais (sem logo, ainda
                  // processando, recusada nos bytes) e os tres sao a MAIORIA
                  // das entradas hoje; o glifo diz o que a entrada e, o que
                  // nenhum espaco em branco dizia, e `glifoDoInscrito` nunca
                  // devolve nulo -- nem para um valor de `enum` que esta versao
                  // do app nao conheca.
                  //
                  // O `simboloDeFalha` da imagem continua `storefront`, e de
                  // proposito: ele e o estado "a logo existe e NAO carregou",
                  // que nao e o mesmo estado que "nao ha logo". Dois estados
                  // diferentes, dois simbolos diferentes.
                  // ===================================================
                  // O ARRANJO DE 26/10/2026: O TEXTO AO LADO DA LOGO
                  // ===================================================
                  //
                  // Pedido do cliente, nas palavras dele: *"melhore a pagina
                  // da listagem da comunidade, depois que tiramos a descricao
                  // ficou feia e vazia. Coloque o segmento abaixo do
                  // titulo/nome, coloque o bairro com o pin do mapa"*.
                  //
                  // **O segmento JA estava abaixo do nome em ordem de
                  // leitura** -- e e justamente por isso que o pedido nao era
                  // sobre a ordem. Ate 26/10 a `Row` da logo tinha SO o nome,
                  // e o segmento e o bairro vinham como irmaos da `Row`,
                  // dentro da `Column` do cartao: eles comecavam na borda
                  // ESQUERDA do cartao, debaixo da logo, e nao debaixo do
                  // nome. O desenho era este:
                  //
                  //     [logo] Clinica Santa Barbara
                  //     Clinica
                  //     Pinheiros
                  //
                  // Duas linhas soltas sob um quadrado de 56 dp, com o nome
                  // pendurado sozinho no alto a 68 dp da esquerda. **E esse
                  // vazio que ele viu**, e ele apareceu em 22/10, quando a
                  // media, a distancia, a apresentacao e o selo sairam: com
                  // sete linhas o bloco se sustentava, com tres ele nao.
                  //
                  // Agora o segmento e o bairro entram na MESMA `Column` do
                  // nome, dentro do `Expanded`:
                  //
                  //     [logo] Clinica Santa Barbara
                  //            Clinica
                  //            (pin) Pinheiros
                  //
                  // **Nada entrou e nada saiu**: sao os mesmos cinco itens de
                  // 22/10 (logo, nome, segmento, bairro, `Ligar`). O que
                  // mudou e o recuo -- e o recuo e o que transforma tres
                  // linhas soltas num bloco. Trazer de volta qualquer um dos
                  // quatro que sairam seria desfazer o pedido anterior dele
                  // para consertar a aparencia, e o grupo `ITEM 1 — ISCA` de
                  // `listagem_e_pagina_do_profissional_test.dart` reprova se
                  // alguem tentar.
                  //
                  // **`CrossAxisAlignment.center`, e aqui esta a juncao com o
                  // pedido de 22/10**: *"Alinhe o titulo do estabelecimento e
                  // a imagem na vertical"*. Aquele pedido foi atendido no
                  // `_Cabecalho` de `pagina_do_local.dart` e NAO aqui -- esta
                  // `Row` continuou em `CrossAxisAlignment.start` ate hoje, e
                  // com `start` a logo encosta no topo de um bloco de texto
                  // mais alto que ela. Com o segmento e o bairro agora dentro
                  // do `Expanded`, o bloco tem 3 linhas contra os 61,6 dp da
                  // logo, e a diferenca entre `start` e `center` deixou de ser
                  // sutil. **Atender os dois pedidos separados teria exigido
                  // mexer nesta mesma `Row` duas vezes**, e por isso eles
                  // viraram um trabalho so.
                  //
                  // O que o eixo NAO e: nao e `stretch` (esticaria a logo ate
                  // a altura do texto, e a proporcao de `foto/sm` e token) nem
                  // `baseline` (alinharia a base do nome com a base de um
                  // quadrado que nao tem base de texto).
                  Row(
                    crossAxisAlignment: CrossAxisAlignment.center,
                    children: <Widget>[
                      if (logo != null)
                        ImagemDaRede(
                          url: logo,
                          descricao: null,
                          largura: BichuMoldura.larguraFotoSm,
                          raio: BichuRaio.sm,
                          simboloDeFalha: Icons.storefront_outlined,
                        )
                      else
                        IconeDoInscrito(
                          atividade: entrada.atividade,
                          tipoDeEntidade: entrada.tipoDeEntidade,
                          largura: BichuMoldura.larguraFotoSm,
                          raio: BichuRaio.sm,
                        ),
                      const SizedBox(width: BichuEspaco.e3),
                      Expanded(
                        child: Column(
                          crossAxisAlignment: CrossAxisAlignment.start,
                          children: <Widget>[
                            Text(entrada.nome, style: textos.titleMedium),
                            // SEGMENTO E BAIRRO NA MESMA LINHA, COM QUEDA.
                            //
                            // Pedido do cliente de 26/10/2026, depois de ver
                            // a imagem da versao de duas linhas: *"como o
                            // texto e curto, nao faz sentido ficar o segmento
                            // do lado esquerdo e o bairro do lado direito ou
                            // corre muito o risco do texto ser grande e
                            // quebrar a linha?"*
                            //
                            // **O risco e todo do lado do bairro, e isso foi
                            // medido e nao suposto.** O segmento e lista
                            // FECHADA de seis (`AtividadeDoDiretorio`) e nao
                            // cresce -- o cartao o le por `porCodigo`, nao por
                            // texto do servidor. As seis larguras, medidas a
                            // 390 dp com as fontes do produto:
                            //
                            //     Hospedagem    88,37   <- o mais LARGO
                            //     Banho e tosa  86,09
                            //     Adestrador    73,73
                            //     Veterinário   71,84
                            //     Passeador     69,98
                            //     Clínica       44,67
                            //
                            // **Letra nao prediz largura, e esta tabela e a
                            // prova**: `Hospedagem` tem 10 caracteres e e mais
                            // larga que `Banho e tosa`, que tem 12. Quem
                            // escolher "o pior segmento" contando caractere
                            // escolhe errado -- eu escolhi, e um segundo
                            // controle pegou.
                            //
                            // O bairro e texto LIVRE, vem do CEP, e nao tem
                            // teto. `Conjunto Habitacional Teotônio Vilela`
                            // existe em São Paulo e tem 37 caracteres, 236 dp.
                            //
                            // **A FRONTEIRA E MEDIDA, e nao calculada.** A
                            // coluna de texto tem 258 dp a 390 dp de tela. No
                            // pior segmento (`Hospedagem`), `Parque
                            // Anhanguera` (131,3 dp) divide a linha e `Vila
                            // Nova Conceição` (137,3 dp) desce: a fronteira
                            // esta ENTRE os dois. Uma conta de
                            // `258 - segmento - vaos` daria 137,6 e estaria
                            // errada do lado perigoso -- `spacing` e minimo e
                            // nao exato, e o `Wrap` arredonda. Por isso nenhum
                            // caso de teste trava um numero: eles travam o
                            // COMPORTAMENTO nas duas direcoes.
                            //
                            // **`Wrap` e nao `Row`, e e aqui que esta a
                            // decisao.** Com `Row` a linha so tem duas
                            // saidas quando o bairro nao cabe: cortar com
                            // reticencias ou estourar. Cortar perde
                            // informacao que decide se vale ligar -- quem
                            // mora na Vila Nova Conceicao nao reconhece
                            // `Vila Nova Conc…`, e os bairros longos do
                            // Brasil se parecem JUSTAMENTE no comeco
                            // (`Jardim ...`, `Vila ...`, `Conjunto
                            // Habitacional ...`). Com `Wrap` a linha e UMA
                            // enquanto couber, que e o pedido dele, e vira
                            // DUAS quando nao couber, que e o desenho de
                            // ontem -- nenhum caractere some em caso nenhum.
                            //
                            // `spaceBetween` poe o segmento na esquerda e o
                            // bairro na direita quando os dois dividem a
                            // linha; quando o bairro desce, ele fica sozinho
                            // na corrida de baixo e `spaceBetween` o encosta
                            // na esquerda, alinhado com o segmento.
                            //
                            // `spacing` e o vao MINIMO entre os dois, e nao
                            // o vao: `spaceBetween` distribui a sobra. Sem
                            // ele, segmento e bairro poderiam encostar no
                            // exato ponto em que a linha enche.
                            //
                            // **O `Flexible` de dentro nao e redundante.**
                            // `Wrap` da aos filhos `maxWidth` igual a largura
                            // dele, entao o item do bairro sozinho nunca
                            // estoura -- mas sem o `Flexible` o `Text` ficaria
                            // com largura intrinseca e o `Row` de
                            // `mainAxisSize: min` passaria do limite. Com
                            // ele, um bairro maior que a coluna INTEIRA
                            // quebra dentro do proprio texto, com o pin
                            // ancorado na primeira linha.
                            if (atividade != null || bairro != null) ...<Widget>[
                              const SizedBox(height: BichuEspaco.e1),
                              // **`width: double.infinity` NAO e ruido, e
                              // sem ele o `spaceBetween` nao faz nada.** A
                              // `Column` do `Expanded` tem
                              // `crossAxisAlignment: start`, entao ela passa
                              // largura FROUXA aos filhos, e um `Wrap` com
                              // largura frouxa encolhe ate o conteudo: sem
                              // sobra na corrida, `spaceBetween` nao tem o
                              // que distribuir e o bairro fica grudado no
                              // segmento, no meio da linha, em vez de
                              // encostado na direita.
                              //
                              // Isto nao foi deduzido. O caso `segmento e
                              // bairro dividem a MESMA linha quando cabem`
                              // reprovou dizendo `sobram 59,0 dp entre o fim
                              // do bairro e a borda do cartao`, e o painel
                              // da imagem mostrava o mesmo defeito.
                              SizedBox(
                                width: double.infinity,
                                child: Wrap(
                                  alignment: WrapAlignment.spaceBetween,
                                  crossAxisAlignment: WrapCrossAlignment.center,
                                  spacing: BichuEspaco.e3,
                                  runSpacing: BichuEspaco.e1,
                                  children: <Widget>[
                                    if (atividade != null)
                                      Text(
                                        atividade,
                                        style: textos.bodyMedium?.copyWith(
                                          color: cores.textSecondary,
                                        ),
                                      ),
                                    // O ENDERECO que a listagem tem: **so o
                                    // bairro**, e desde 26/10 **com o pin do
                                    // mapa**. A media, a distancia, a
                                    // apresentacao e o selo sairam em
                                    // 22/10/2026, e a cidade e a UF sairam no
                                    // mesmo dia; a prosa de `build` diz onde
                                    // cada um ficou.
                                    //
                                    // **`Icons.place_outlined`, por precedente
                                    // e nao por gosto**: e o pin de lugar DESTE
                                    // app, 6 ocorrencias no proprio `lib/`
                                    // antes desta linha, entre elas a linha de
                                    // bairro do `_Cabecalho` de
                                    // `pagina_do_local.dart` -- a PAGINA
                                    // INTERNA deste mesmo cartao -- e a linha
                                    // de area de `cartao_do_perdido.dart`.
                                    // Eliminados: `location_on` e `place` (as
                                    // versoes cheias; o cartao nao tem outro
                                    // icone cheio); `map_outlined`, que
                                    // `pagina_do_local.dart` reserva para o
                                    // endereco CLICAVEL -- o bairro daqui nao
                                    // abre mapa; `near_me` e `my_location`, que
                                    // significam a posicao de QUEM OLHA.
                                    //
                                    // **O PIN NAO EXISTE SEM BAIRRO**: ele esta
                                    // dentro do `if (bairro != null)`, e nao ao
                                    // lado. A aba `comunidade` tambem desenha
                                    // `place_outlined` na barra, entao quem
                                    // medir a ausencia TEM de recortar pelo
                                    // cartao.
                                    //
                                    // Tamanho e cor em token (`BichuEspaco.e4`,
                                    // `cores.textSecondary`), os mesmos de
                                    // `_Linha` de `cartao_do_perdido.dart`.
                                    if (bairro != null)
                                      Row(
                                        mainAxisSize: MainAxisSize.min,
                                        crossAxisAlignment:
                                            CrossAxisAlignment.start,
                                        children: <Widget>[
                                          Icon(
                                            Icons.place_outlined,
                                            size: BichuEspaco.e4,
                                            color: cores.textSecondary,
                                          ),
                                          const SizedBox(
                                            width: BichuEspaco.e1,
                                          ),
                                          Flexible(
                                            child: Text(
                                              bairro,
                                              style:
                                                  textos.bodyMedium?.copyWith(
                                                color: cores.textSecondary,
                                              ),
                                            ),
                                          ),
                                        ],
                                      ),
                                  ],
                                ),
                              ),
                            ],
                          ],
                        ),
                      ),
                    ],
                  ),
                ],
              ),
            ),
          ),
          if (telefone != null) ...<Widget>[
            const SizedBox(height: BichuEspaco.e3),
            Align(
              alignment: Alignment.centerLeft,
              // O ROTULO VISIVEL ENCURTOU, O NOME ACESSIVEL NAO.
              //
              // Ver `rotuloDeLigar` e `ligarPara`: a tela mostra `Ligar` com o
              // icone de telefone, e o leitor de tela continua dizendo para
              // QUEM a ligacao vai.
              //
              // **`onTap` redeclarado nao e redundancia.**
              // `excludeSemantics: true` apaga a arvore do filho INTEIRA e
              // leva junto a acao que o `TextButton` publicava: o que sobraria
              // e um no com `button: true` e ZERO acoes, e o leitor de tela
              // anunciaria um botao que nao responde. E o defeito 2 de
              // `test/a11y/acao_de_controle_test.dart`, que o `BotaoPrimario`
              // ja pagou uma vez.
              child: Semantics(
                button: true,
                label: ligarPara(entrada.nome),
                excludeSemantics: true,
                onTap: () => _ligar(telefone),
                child: TextButton.icon(
                  onPressed: () => _ligar(telefone),
                  icon: const Icon(Icons.call_outlined),
                  label: const Text(rotuloDeLigar),
                ),
              ),
            ),
          ],
        ],
      ),
    );
  }

  Future<void> _ligar(String telefoneE164) async {
    // `tel:` vai para o discador do sistema, que **mostra o numero e espera a
    // pessoa confirmar**: o app nao disca sozinho. Mesmo caminho dos termos em
    // F1.1, e por isso `url_launcher` ja esta no `pubspec`.
    await launchUrl(Uri(scheme: 'tel', path: telefoneE164));
  }
}

// O SELO SAIU DAQUI EM 22/10/2026, e com ele o widget `_Selo` deste arquivo.
//
// Ele dizia O QUE foi verificado (`Verificado: CNPJ, CRMV`) e nunca so
// "verificado" -- a BICHUS-165 nao passou por selo generico. **Essa regra nao
// foi revogada: ela mudou de tela.** O cliente tirou as informacoes adicionais
// do cartao e o selo e uma delas; quem o desenha agora e `_Selo` de
// `pagina_do_local.dart`, no `_Cabecalho`, com o mesmo texto e a mesma regra.
//
// Apagado em vez de deixado sem uso: widget privado que ninguem constroi
// reprova em `unused_element` e, pior, convida a proxima pessoa a reacender a
// linha sem saber que foi decisao tira-la.

/// O esqueleto de uma entrada: tres barras dentro da mesma moldura do cartao.
///
/// Um indicador circular no lugar disto nao diria que o que vem e uma lista.
class _EsqueletoDeEntrada extends StatelessWidget {
  const _EsqueletoDeEntrada();

  @override
  Widget build(BuildContext context) {
    final cores = BichuColors.of(context).cores;

    return ExcludeSemantics(
      child: Container(
        width: double.infinity,
        padding: const EdgeInsets.all(BichuEspaco.e4),
        decoration: BoxDecoration(
          color: cores.surface,
          borderRadius: BorderRadius.circular(BichuRaio.lg),
          border: Border.all(color: cores.outline, width: BichuBorda.hairline),
        ),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: <Widget>[
            _Barra(cor: cores.surfaceSunken, fracao: 0.6),
            const SizedBox(height: BichuEspaco.e2),
            _Barra(cor: cores.surfaceSunken, fracao: 0.4),
            const SizedBox(height: BichuEspaco.e2),
            _Barra(cor: cores.surfaceSunken, fracao: 0.8),
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
        // A altura acompanha a escala de fonte do sistema: esqueleto de altura
        // fixa fica menor que o texto que ele representa em 200% e a lista
        // pula quando carrega.
        height: MediaQuery.textScalerOf(context).scale(BichuEspaco.e3),
        decoration: BoxDecoration(
          color: cor,
          borderRadius: BorderRadius.circular(BichuRaio.sm),
        ),
      ),
    );
  }
}
