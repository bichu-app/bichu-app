import 'package:flutter/material.dart';
import 'package:url_launcher/url_launcher.dart';

import '../../api/diretorio_api.dart';
import '../../api/falhas.dart';
import '../../api/mensagens_de_erro.dart';
import '../../api/modelos_diretorio.dart';
import '../../escopo.dart';
import '../../theme/bichu_colors.dart';
import '../../theme/bichu_tokens.g.dart';
import '../../widgets/barra_de_listagem.dart';
import '../../widgets/faixa_de_aviso.dart';
import '../../widgets/rodape_da_paginacao.dart';
import '../casca_com_abas.dart';

/// `Perto` — o diretorio de profissionais e estabelecimentos.
///
/// A listagem de `GET /v1/directory/entries` (`listDirectoryEntries`), com o
/// topo de listagem do app ([BarraDeListagem]).
///
/// ## O que esta tela NAO tem, e nenhuma das ausencias e esquecimento
///
/// - **Nao ha tela de detalhe nesta versao.** O cartao nao e tocavel, nao tem
///   seta e nao leva a lugar nenhum. O criterio 2 da BICHUS-62 proibe acao
///   sem destino, e este app ja teve dois botoes apontando para o vazio.
/// - **Nao ha foto, logotipo, horario, endereco de rua, site, e-mail, redes,
///   lista de servicos, preco nem avaliacao.** A tabela nao tem essas
///   colunas. Desenhar espaco para foto ensinaria quem le que a foto vem.
/// - **Nao ha mapa** (decisao de 17/09): o Maps cobra por carregamento e o
///   componente criaria precedente contra o ADR-0010.
/// - **Nao ha campo de busca.** O parametro `q` nao entrou no contrato, e
///   filtrar as 20 entradas da pagina em memoria seria uma busca que funciona
///   com 10 registros e mente com 200. Ver [DiretorioApi].
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

  /// Por que a lista nao saiu por distancia, quando falta a localizacao.
  ///
  /// **Palavra por palavra, num lugar so.** O texto afirma a ordem real antes
  /// de explicar a causa: quem le a primeira frase ja sabe o que esta vendo.
  static const String semLocalizacao =
      'Esta lista está em ordem alfabética, não por proximidade. O Bichu '
      'ainda não tem a sua região de referência, então não dá para calcular '
      'a distância até cada um.';

  static const String rotuloDeAtualizar = 'Atualizar';

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
        // A barra so aparece quando ha pagina: antes dela a tela nao sabe
        // quantos itens existem nem em que ordem eles vieram, e um controle
        // de ordenacao sobre nada ainda medido seria o controle que afirma.
        if (pagina != null)
          BarraDeListagem(
            total: pagina.total,
            filtro: _controleDeFiltro(),
            ordenacao: _controleDeOrdenacao(pagina),
          ),
        ..._corpo(),
      ],
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
      aoEscolher: (chave, codigo) {
        Navigator.of(context).pop();
        if (chave == 'kind') {
          _trocarRecorte(
            _recorte.com(
              atividade: AtividadeDoDiretorio.porCodigo(codigo),
              limparAtividade: codigo == null,
              pagina: 1,
            ),
          );
          return;
        }
        _trocarRecorte(
          _recorte.com(
            nivelMinimo:
                codigo == null ? null : NivelDeVerificacao.porCodigo(codigo),
            limparNivel: codigo == null,
            pagina: 1,
          ),
        );
      },
      aoLimpar: () {
        Navigator.of(context).pop();
        _trocarRecorte(
          _recorte.com(limparAtividade: true, limparNivel: true, pagina: 1),
        );
      },
    );
  }

  /// A ordenacao, montada a partir do que **de fato** aconteceu.
  ///
  /// [PaginaDoDiretorio.ordemEfetiva] sai de `distance_available`, que e a
  /// resposta do servidor sobre a ordem real. O que a tela pediu
  /// (`_recorte.ordem`) so serve para decidir se ha algo a explicar.
  ControleDeOrdenacao _controleDeOrdenacao(PaginaDoDiretorio pagina) {
    final efetiva = pagina.ordemEfetiva;
    final pedida = _recorte.ordem;
    // So ha o que explicar quando a pessoa pediu distancia e nao teve. Quem
    // pediu nome recebeu nome: nao ha divergencia, e uma faixa aqui seria o
    // app se desculpando por atender.
    final divergiu = pedida != efetiva;

    return ControleDeOrdenacao(
      opcoes: <OpcaoDeRecorte>[
        for (final o in OrdemDoDiretorio.values)
          OpcaoDeRecorte(codigo: o.codigo, rotulo: o.rotulo),
      ],
      efetiva: efetiva.codigo,
      porQueNaoEAPedida: divergiu ? ListaDoDiretorio.semLocalizacao : null,
      aoEscolher: (codigo) => _trocarRecorte(
        _recorte.com(ordem: OrdemDoDiretorio.porCodigo(codigo), pagina: 1),
      ),
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
/// **Nao e tocavel, e a ausencia e o desenho.** Nao ha tela de detalhe nesta
/// versao; um `InkWell` aqui seria acao sem destino. Ele tambem nao tem seta
/// de avanco, que e o desenho que promete destino sem ter um.
///
/// **A unica acao possivel e ligar**, e ela so existe quando o telefone
/// existe. Cartao sem `phone_e164` nao ganha botao desabilitado: ganha
/// nenhum botao.
class CartaoDoDiretorio extends StatelessWidget {
  const CartaoDoDiretorio({required this.entrada, super.key});

  final EntradaDoDiretorio entrada;

  static const String rotuloDeLigar = 'Ligar';

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
          // Nome, atividade, lugar e distancia sao UMA parada de foco: quem
          // usa leitor de tela ouve a entrada inteira num deslize, em vez de
          // quatro paradas para o mesmo objeto. O botao de ligar fica FORA do
          // merge, porque ele e um controle e precisa da propria parada.
          MergeSemantics(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: <Widget>[
                Text(entrada.nome, style: textos.titleMedium),
                if (atividade != null) ...<Widget>[
                  const SizedBox(height: BichuEspaco.e1),
                  Text(
                    atividade,
                    style: textos.bodyMedium
                        ?.copyWith(color: cores.textSecondary),
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
          if (telefone != null) ...<Widget>[
            const SizedBox(height: BichuEspaco.e3),
            Align(
              alignment: Alignment.centerLeft,
              child: TextButton.icon(
                onPressed: () => _ligar(telefone),
                icon: const Icon(Icons.call_outlined),
                // O nome acessivel leva PARA QUEM e a ligacao: numa lista de
                // dez entradas, dez controles chamados so `Ligar` sao dez
                // paradas indistinguiveis no leitor de tela.
                label: Text('$rotuloDeLigar para ${entrada.nome}'),
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
