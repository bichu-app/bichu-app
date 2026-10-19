
import 'package:flutter/material.dart';
import 'package:url_launcher/url_launcher.dart';

import '../../api/falhas.dart';
import '../../api/mensagens_de_erro.dart';
import '../../api/modelos_diretorio.dart';
import '../../escopo.dart';
import '../../theme/bichu_colors.dart';
import '../../theme/bichu_tokens.g.dart';
import '../../widgets/barra_de_listagem.dart';
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
/// **E ela nao oferece "ligar a localizacao", de proposito.** O que falta e a
/// localizacao de REFERENCIA que o servidor guarda (BICHUS-92), e nao a
/// permissao do aparelho: ligar o GPS aqui nao mudaria a resposta, e nenhuma
/// tela deste app escreve `reference_area` hoje. Um botao com esse rotulo
/// seria acao sem destino, que e o defeito que o criterio 2 da BICHUS-62
/// proibe -- e seria pior que os outros dois que este app ja teve, porque
/// pareceria ter funcionado. Enquanto o caminho nao existir, a tela explica e
/// nao promete. Pergunta fechada na pauta de refinamento de 22/09.
class ListaDoDiretorio extends StatefulWidget {
  const ListaDoDiretorio({super.key});

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

class _ListaDoDiretorioState extends State<ListaDoDiretorio> {
  _Fase _fase = _Fase.carregando;
  RecorteDoDiretorio _recorte = const RecorteDoDiretorio();
  PaginaDoDiretorio? _pagina;
  String? _textoDaFalha;

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
    _agendarCarga();
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
      _falhaDeMais = null;
      _carregandoMais = false;
      _itens.clear();
    });

    try {
      final pagina = await escopo.diretorio.listar(recorte);
      if (!mounted) return;
      setState(() {
        _pagina = pagina;
        _itens
          ..clear()
          ..addAll(pagina.itens);
        _fase = _Fase.lista;
      });
    } on FalhaDeChamada catch (falha) {
      if (!mounted) return;
      setState(() {
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
    super.dispose();
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
      final pagina = await escopo.diretorio.listar(proximo);
      if (!mounted) return;
      setState(() {
        _recorte = proximo;
        _pagina = pagina;
        _itens.addAll(pagina.itens);
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
        // Isto REVERTE o que estava escrito nesta linha em 17/10 -- "no CORPO
        // e nao na `AppBar`" --, e a reversao e decisao dele. Quem desenha e
        // `AcaoDeCriarNaBarra`; quem a entrega a casca e `AbaPerto`, em
        // `abas.dart`.
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
    return ControleDeFiltro(
      grupos: <GrupoDeFiltro>[
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
    _trocarRecorte(
      _recorte.com(
        atividade: AtividadeDoDiretorio.porCodigo(atividade),
        limparAtividade: atividade == null,
        nivelMinimo: nivel == null ? null : NivelDeVerificacao.porCodigo(nivel),
        limparNivel: nivel == null,
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

  /// A media e a quantidade na mesma linha: `4,3 · 128 avaliações`.
  ///
  /// **Nula em dois casos, e nos dois o cartao nao desenha nada**: `rating`
  /// ausente na resposta (o campo e opcional no contrato, de proposito) e
  /// `count == 0`. Em nenhum deles aparece "0,0" nem estrela vazia -- zero se
  /// le como "pessimo", e um local que ninguem avaliou nao e pessimo.
  static String? pontuacaoEmTexto(PontuacaoDoLocal? pontuacao) {
    if (pontuacao == null || !pontuacao.temAvaliacoes) return null;
    final media = pontuacao.mediaEmTexto;
    if (media == null) return null;
    return '$media · ${pontuacao.quantidadeEmTexto}';
  }

  /// A distancia em texto, ou nulo.
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

    final atividade = entrada.atividade?.rotulo;
    final lugar = entrada.linhaDeLugar;
    final distancia = distanciaEmTexto(entrada.distanciaEmMetros);
    final verificacao = entrada.verificacao.oQueFoiVerificado;
    final telefone = entrada.telefoneE164;
    final pontuacao = pontuacaoEmTexto(entrada.pontuacao);
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
                  Row(
                    crossAxisAlignment: CrossAxisAlignment.start,
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
                        child: Text(entrada.nome, style: textos.titleMedium),
                      ),
                    ],
                  ),
                  if (atividade != null) ...<Widget>[
                    const SizedBox(height: BichuEspaco.e1),
                    Text(
                      atividade,
                      style: textos.bodyMedium
                          ?.copyWith(color: cores.textSecondary),
                    ),
                  ],
                  // A media e a quantidade, quando ha. **Cartao sem `rating` e
                  // cartao com zero avaliacao nao desenham linha nenhuma**:
                  // ver `pontuacaoEmTexto`.
                  if (pontuacao != null) ...<Widget>[
                    const SizedBox(height: BichuEspaco.e1),
                    Row(
                      children: <Widget>[
                        ExcludeSemantics(
                          child: Icon(
                            Icons.star,
                            size: BichuEspaco.e4,
                            color: cores.primary,
                          ),
                        ),
                        const SizedBox(width: BichuEspaco.e1),
                        Text(
                          pontuacao,
                          style: textos.bodyMedium
                              ?.copyWith(color: cores.textPrimary),
                        ),
                      ],
                    ),
                  ],
                  if (lugar != null) ...<Widget>[
                    const SizedBox(height: BichuEspaco.e1),
                    Text(
                      lugar,
                      style: textos.bodyMedium
                          ?.copyWith(color: cores.textSecondary),
                    ),
                  ],
                  if (distancia != null) ...<Widget>[
                    const SizedBox(height: BichuEspaco.e1),
                    Text(
                      distancia,
                      style: textos.bodyMedium
                          ?.copyWith(color: cores.textSecondary),
                    ),
                  ],
                  if (entrada.sobre != null && entrada.sobre!.isNotEmpty) ...[
                    const SizedBox(height: BichuEspaco.e2),
                    Text(entrada.sobre!, style: textos.bodyMedium),
                  ],
                  if (verificacao != null) ...<Widget>[
                    const SizedBox(height: BichuEspaco.e2),
                    _Selo(texto: verificacao),
                  ],
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

/// O selo de verificacao. **Diz o que foi verificado, nunca so "verificado".**
///
/// A BICHUS-165 nao passou por selo generico, e este widget so e construido
/// quando ha texto: `VerificacaoDaEntrada.oQueFoiVerificado` devolve nulo em
/// `none` e tambem quando o nivel afirma algo sem listar a prova.
class _Selo extends StatelessWidget {
  const _Selo({required this.texto});

  final String texto;

  @override
  Widget build(BuildContext context) {
    final cores = BichuColors.of(context).cores;
    final textos = Theme.of(context).textTheme;

    return Container(
      padding: const EdgeInsets.symmetric(
        horizontal: BichuEspaco.e3,
        vertical: BichuEspaco.e1,
      ),
      decoration: BoxDecoration(
        color: cores.surfaceSunken,
        borderRadius: BorderRadius.circular(BichuRaio.full),
        border: Border.all(color: cores.outline, width: BichuBorda.hairline),
      ),
      child: Text(
        texto,
        style: textos.labelSmall?.copyWith(color: cores.textPrimary),
      ),
    );
  }
}

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
