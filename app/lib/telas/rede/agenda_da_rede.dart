import 'dart:collection';

import 'package:flutter/material.dart';

import '../../api/falhas.dart';
import '../../api/mensagens_de_erro.dart';
import '../../api/modelos_rede.dart';
import '../../api/rede_api.dart';
import '../../escopo.dart';
import '../../theme/bichu_colors.dart';
import '../../theme/bichu_tokens.g.dart';
import '../../widgets/barra_de_listagem.dart';
import '../../widgets/faixa_de_aviso.dart';
import '../casca_com_abas.dart';
import 'encontro_da_rede.dart';

/// `Rede` — a agenda dos encontros que a comunidade marca em praca e parque.
///
/// A listagem de `GET /v1/network/events` (`listNetworkEvents`), com o topo de
/// listagem do app ([BarraDeListagem]). **Terceira tela a usar o componente**,
/// depois de `Perto` e da `Loja`.
///
/// ## O QUE ESTA TELA NAO TEM, e nenhuma ausencia e esquecimento
///
/// Todas saem do ADR-0025, e cada uma fecha uma inferencia:
///
/// - **Nao ha lista de pessoas presentes.** Ha um NUMERO
///   ([EncontroDaRede.presencas]). Nem nome, nem primeiro nome, nem avatar,
///   nem apelido, nem contagem por bairro. Uma lista de presenca em encontro
///   de bairro publica que dois pets sao do mesmo tutor -- que e a inferencia
///   que o item 7 do ADR-0010 proibe --, e o lugar do encontro e uma praca do
///   bairro da pessoa. Num produto cujo fluxo mais critico e pet perdido, essa
///   e exatamente a informacao que interessa a quem quer levar um animal.
/// - **Nao ha escolha de pet no check-in.** O check-in e da PESSOA, e nao ha
///   seletor de pet em lugar nenhum desta secao: nao ha coluna de pet na
///   tabela, entao nao ha o que escolher.
/// - **Nao ha mapa, em zoom nenhum**, e nao ha endereco, numero nem CEP. O
///   lugar sao quatro rotulos de texto, e a precisao para no bairro.
/// - **Nao ha ordenacao por distancia, e ela nao aparece desabilitada.** Sem
///   coordenada nao ha distancia; oferecer uma ordem que nunca podera ser
///   cumprida seria o caso que `BarraDeListagem.porQueNaoEAPedida` existe para
///   explicar, e explicar uma impossibilidade PERMANENTE e pior que nao
///   oferecer. **Nao ha ordenacao por numero de presencas** pelo mesmo tipo de
///   razao: ela transformaria a contagem numa disputa.
/// - **Nao ha envio de foto nem criacao de evento.** A galeria desta fatia e
///   exibida e nao enviada.
///
/// ## A SITUACAO DO ENCONTRO VEM DO SERVIDOR, e ela e DITA por extenso
///
/// `status` e projetado por `listNetworkEvents` e esta tela **nao o
/// recalcula**: um aparelho com o relogio errado ou com build antiga chamaria
/// de proximo um encontro de tres semanas atras, e a correcao passaria pela
/// loja de aplicativos.
///
/// E **encontro que ja aconteceu diz que ja aconteceu**, na propria lista, em
/// [rotuloEncerrado]. Uma agenda que mistura passado e futuro sem dizer qual e
/// qual e o defeito mais comum de agenda, e o `when` do contrato so resolve
/// metade disso -- a outra metade e o cartao.
///
/// ## A HORA E A DO FUSO DO EVENTO
///
/// Ver [FusoDoEvento]: `starts_at` e instante absoluto e `time_zone` e o nome
/// IANA da zona, e a hora de parede sai dos dois. Nao ha `toLocal()` nesta
/// tela: ele responderia sobre o fuso do APARELHO, e um aparelho em UTC
/// renderizaria um encontro das 9h como 12h sem nada acusar.
class AgendaDaRede extends StatefulWidget {
  const AgendaDaRede({super.key});

  /// O vazio **sem nenhum recorte**: a Rede ainda nao tem encontro.
  static const String tituloDoVazio = 'A Rede ainda não tem encontro';

  static const String explicacaoDoVazio =
      'Os encontros da comunidade em praças e parques vão aparecer nesta '
      'agenda. Quando o primeiro for marcado, ele fica aqui.';

  /// O vazio **depois de recortar**. E outro estado: aqui existe agenda, e foi
  /// a busca ou o filtro que a esvaziou.
  static const String tituloDoVazioFiltrado = 'Nada com esse recorte';

  static const String explicacaoDoVazioFiltrado =
      'Tente outra palavra, outra cidade ou outro período para ver mais '
      'encontros.';

  /// O que o cartao escreve num encontro que ja passou.
  ///
  /// **Por extenso, e na propria lista.** Uma data antiga sem esta palavra
  /// obriga quem le a fazer a conta, e quem le faz a conta errado -- sobretudo
  /// numa lista que pode trazer os dois tempos juntos (`when=all`).
  static const String rotuloEncerrado = 'Encerrado';

  static const String rotuloAcontecendo = 'Acontecendo agora';

  static const String rotuloDeAtualizar = 'Atualizar';

  static const String exemploDaBusca = 'passeio, feira, mutirão';

  /// A nota do grupo de cidade, e ela nao e opcional.
  ///
  /// O contrato filtra por `city` **digitada** e nao tem rota que liste as
  /// cidades da base. As opcoes que esta tela oferece sao as que ja apareceram
  /// na agenda, e quem le precisa saber disso: um menu que parece exaustivo e
  /// nao e manda embora quem procurava uma cidade que existe.
  static const String notaDasCidades =
      'As cidades abaixo são as que já apareceram na agenda. O filtro procura '
      'na base inteira.';

  /// A frase da faixa quando a ordem pedida nao foi a que valeu.
  static const String ordemTrocadaPeloServidor =
      'O servidor devolveu a agenda em outra ordem. A lista está na ordem '
      'mostrada acima.';

  /// Quantas pessoas confirmaram presenca, **e nunca quais**.
  ///
  /// Esta funcao e o unico lugar da tela em que a contagem vira texto, e ela
  /// nao tem parametro de nome, de lista nem de avatar. Nao ha caminho aqui
  /// que escreva quem foi, porque nao ha campo com quem foi.
  static String linhaDePresencas(int quantas) {
    if (quantas == 0) return 'Ninguém confirmou presença ainda';
    if (quantas == 1) return '1 pessoa confirmou presença';
    return '$quantas pessoas confirmaram presença';
  }

  @override
  State<AgendaDaRede> createState() => _AgendaDaRedeState();
}

/// Os desfechos de uma carga. Nenhum e "tela em branco", e nenhum e "lista
/// vazia por falha".
enum _Fase { carregando, lista, falha }

class _AgendaDaRedeState extends State<AgendaDaRede> {
  _Fase _fase = _Fase.carregando;
  RecorteDaRede _recorte = const RecorteDaRede();
  PaginaDaRede? _pagina;
  String? _textoDaFalha;

  /// As cidades que o filtro oferece, ACUMULADAS entre cargas.
  ///
  /// Elas nao podem sair so da pagina atual, e o motivo e mecanico: depois de
  /// filtrar por Santos, a resposta seguinte so tem Santos, o menu encolheria
  /// para uma opcao e o unico caminho de volta a outra cidade seria limpar o
  /// filtro. Acumular e o que mantem o controle utilizavel depois de usado.
  final SplayTreeSet<String> _cidadesConhecidas = SplayTreeSet<String>();

  /// O controlador da busca vive no ESTADO, e nao no `build`.
  ///
  /// Um controlador criado a cada `build` perderia o cursor e o texto a cada
  /// tecla, que e o defeito classico de campo de busca em lista que recarrega.
  final TextEditingController _buscaControlador = TextEditingController();

  bool _visivel = false;
  bool _cargaAgendada = false;

  @override
  void dispose() {
    _buscaControlador.dispose();
    super.dispose();
  }

  /// Recarrega quando a tela volta a aparecer, pelo mesmo mecanismo de `Perto`
  /// e da `Loja`.
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

  Future<void> _carregar() async {
    if (!mounted) return;
    setState(() {
      _fase = _Fase.carregando;
      _textoDaFalha = null;
    });

    try {
      final pagina = await RedeApi(Escopo.of(context).api).listar(_recorte);
      if (!mounted) return;
      setState(() {
        _pagina = pagina;
        _cidadesConhecidas.addAll(pagina.cidades);
        _fase = _Fase.lista;
      });
    } on FalhaDeChamada catch (falha) {
      if (!mounted) return;
      setState(() {
        _textoDaFalha = MensagensDeErro.de(falha).texto;
        // A pagina anterior sai da tela, pela mesma razao de `Perto` e da
        // `Loja`: deixar os cartoes antigos sob uma faixa de erro faria a lista
        // afirmar um recorte que ela nao conseguiu aplicar.
        _pagina = null;
        _fase = _Fase.falha;
      });
    } on FormatException {
      if (!mounted) return;
      setState(() {
        _textoDaFalha = MensagensDeErro.servidorFora;
        _pagina = null;
        _fase = _Fase.falha;
      });
    }
  }

  void _trocarRecorte(RecorteDaRede novo) {
    setState(() => _recorte = novo);
    _carregar();
  }

  @override
  Widget build(BuildContext context) {
    final pagina = _pagina;

    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: <Widget>[
        if (pagina != null)
          BarraDeListagem(
            total: pagina.total,
            substantivo: const SubstantivoDaListagem(
              singular: 'encontro',
              plural: 'encontros',
            ),
            busca: _controleDeBusca(),
            filtro: _controleDeFiltro(),
            ordenacao: _controleDeOrdenacao(pagina),
          ),
        ..._corpo(),
      ],
    );
  }

  /// A busca. Alcance de SERVIDOR, porque `q` entrou no contrato desta rota.
  ///
  /// Filtrar em memoria os encontros da pagina seria uma busca que funciona com
  /// 10 registros e mente com 200.
  ControleDeBusca _controleDeBusca() {
    return ControleDeBusca(
      controlador: _buscaControlador,
      alcance: AlcanceDaBusca.servidor,
      exemplo: AgendaDaRede.exemploDaBusca,
      rotulo: 'Buscar encontro',
      aoMudar: (texto) {
        final limpo = texto.trim();
        // O termo de dois caracteres e o piso do contrato (`minLength: 2`).
        // Mandar um caractere so produziria um 400 a cada primeira tecla.
        if (limpo.isNotEmpty && limpo.length < 2) {
          // `setState` mesmo sem recarregar: a barra le o texto do controlador
          // para saber se o recorte esta ativo, e sem a reconstrucao ela
          // decidiria com o texto anterior.
          setState(() {});
          return;
        }
        _trocarRecorte(
          _recorte.com(termo: limpo, limparTermo: limpo.isEmpty, pagina: 1),
        );
      },
    );
  }

  /// Os dois filtros que a rota aceita: `when` e `city`.
  ///
  /// ## Por que `Quando` nasce SEM nada selecionado
  ///
  /// O default de `when` e do SERVIDOR, e a tela nao o repete. Marcar
  /// `upcoming` de saida faria a barra contar um filtro ativo desde o primeiro
  /// frame, e ai o vazio de uma Rede que ainda nao tem encontro viraria "nada
  /// com esse recorte" -- que manda embora quem nao filtrou nada. E o proprio
  /// componente declara o caso: com zero itens e nenhum recorte, a barra **nao
  /// e desenhada**.
  ///
  /// ## Por que a cidade e uma lista de pastilhas e nao um campo
  ///
  /// O contrato filtra por `city` digitada e nao tem rota que liste cidades. As
  /// opcoes sao as cidades que ja apareceram na agenda, acumuladas em
  /// [_cidadesConhecidas], e [AgendaDaRede.notaDasCidades] diz isso a quem le,
  /// na nota do proprio grupo. O filtro escolhido vai para o servidor e procura
  /// na base inteira: o que e parcial e o MENU, e nao o filtro.
  ControleDeFiltro _controleDeFiltro() {
    final cidades = SplayTreeSet<String>.from(_cidadesConhecidas);
    final escolhida = _recorte.cidade;
    // A cidade escolhida entra sempre, mesmo que a resposta atual nao a
    // contenha: sem isto, filtrar por uma cidade sem encontros apagaria do menu
    // a pastilha marcada e a pessoa perderia o controle que produziu o vazio.
    if (escolhida != null) cidades.add(escolhida);

    return ControleDeFiltro(
      grupos: <GrupoDeFiltro>[
        GrupoDeFiltro(
          chave: 'when',
          titulo: 'Quando',
          selecionado: _recorte.quando?.codigo,
          opcoes: <OpcaoDeRecorte>[
            for (final q in QuandoDaRede.values)
              OpcaoDeRecorte(codigo: q.codigo, rotulo: q.rotulo),
          ],
        ),
        GrupoDeFiltro(
          chave: 'city',
          titulo: 'Cidade',
          nota: AgendaDaRede.notaDasCidades,
          selecionado: escolhida,
          opcoes: <OpcaoDeRecorte>[
            for (final cidade in cidades)
              OpcaoDeRecorte(codigo: cidade, rotulo: cidade),
          ],
        ),
      ],
      aoEscolher: (chave, codigo) {
        Navigator.of(context).pop();
        if (chave == 'when') {
          _trocarRecorte(
            _recorte.com(
              quando: QuandoDaRede.porCodigo(codigo),
              limparQuando: codigo == null,
              // A ordem volta para o servidor: o default de `sort` depende de
              // `when`, e quem pede `past` esta perguntando "o que houve", que
              // se responde de tras para frente.
              limparOrdem: true,
              pagina: 1,
            ),
          );
          return;
        }
        _trocarRecorte(
          _recorte.com(
            cidade: codigo,
            limparCidade: codigo == null,
            pagina: 1,
          ),
        );
      },
      aoLimpar: () {
        Navigator.of(context).pop();
        _trocarRecorte(
          _recorte.com(
            limparQuando: true,
            limparCidade: true,
            limparOrdem: true,
            pagina: 1,
          ),
        );
      },
    );
  }

  /// A ordenacao, montada a partir do que **de fato** aconteceu.
  ///
  /// [PaginaDaRede.ordemEfetiva] sai de `effective_sort`. Aqui isso nao e
  /// capricho e nao e copia da `Loja`: **o default de `sort` no servidor
  /// depende de `when`**, entao enquanto a pessoa nao escolher uma ordem a tela
  /// nao manda `sort` nenhum e **nao tem como saber** em que ordem a lista
  /// saiu. Ler `_recorte.ordem` aqui mostraria `null`, ou mostraria um palpite.
  ///
  /// **Duas opcoes, e as duas cumpriveis.** Nao ha distancia e nao ha presenca.
  ControleDeOrdenacao _controleDeOrdenacao(PaginaDaRede pagina) {
    final pedida = _recorte.ordem;
    return ControleDeOrdenacao(
      opcoes: <OpcaoDeRecorte>[
        for (final o in OrdemDaRede.values)
          OpcaoDeRecorte(codigo: o.codigo, rotulo: o.rotulo),
      ],
      efetiva: pagina.ordemEfetiva.codigo,
      // Explicacao, e nao acao: a causa mora no servidor. Nula enquanto a
      // pessoa nao pediu ordem nenhuma -- nao ha divergencia entre o que ela
      // pediu e o que valeu quando ela nao pediu nada.
      porQueNaoEAPedida: pedida != null && pedida != pagina.ordemEfetiva
          ? AgendaDaRede.ordemTrocadaPeloServidor
          : null,
      aoEscolher: (codigo) => _trocarRecorte(
        _recorte.com(ordem: OrdemDaRede.porCodigo(codigo), pagina: 1),
      ),
    );
  }

  List<Widget> _corpo() {
    if (_fase == _Fase.carregando) {
      return const <Widget>[
        _EsqueletoDeEncontro(),
        SizedBox(height: BichuEspaco.e3),
        _EsqueletoDeEncontro(),
      ];
    }

    final pagina = _pagina;
    if (_fase == _Fase.falha || pagina == null) {
      return <Widget>[
        FaixaDeAviso(
          texto: _textoDaFalha ?? MensagensDeErro.servidorFora,
          rotuloDaAcao: AgendaDaRede.rotuloDeAtualizar,
          aoTocarNaAcao: _carregar,
        ),
      ];
    }

    if (pagina.itens.isEmpty) {
      // **Dois vazios, e eles dizem coisas diferentes.** Um diz que a Rede
      // ainda nao tem encontro; o outro diz que o recorte da pessoa e que nao
      // tem. Uma frase so mandaria embora quem so precisava apagar a busca.
      return <Widget>[
        if (_recorte.temRecorte)
          const EstadoVazio(
            titulo: AgendaDaRede.tituloDoVazioFiltrado,
            explicacao: AgendaDaRede.explicacaoDoVazioFiltrado,
          )
        else
          const EstadoVazio(
            titulo: AgendaDaRede.tituloDoVazio,
            explicacao: AgendaDaRede.explicacaoDoVazio,
          ),
      ];
    }

    return <Widget>[
      for (var i = 0; i < pagina.itens.length; i++) ...<Widget>[
        if (i > 0) const SizedBox(height: BichuEspaco.e3),
        CartaoDoEncontro(encontro: pagina.itens[i]),
      ],
      const SizedBox(height: BichuEspaco.e4),
      _LinhaDaPagina(pagina: pagina),
    ];
  }
}

/// `Mostrando 1 a 10 de 10`.
class _LinhaDaPagina extends StatelessWidget {
  const _LinhaDaPagina({required this.pagina});

  final PaginaDaRede pagina;

  @override
  Widget build(BuildContext context) {
    final cores = BichuColors.of(context).cores;
    final textos = Theme.of(context).textTheme;
    final primeiro = (pagina.pagina - 1) * pagina.limite + 1;
    final ultimo = primeiro + pagina.itens.length - 1;

    return Text(
      'Mostrando $primeiro a $ultimo de ${pagina.total}',
      style: textos.bodySmall?.copyWith(color: cores.textSecondary),
    );
  }
}

/// O cartao de um encontro na agenda.
///
/// Mostra titulo, resumo, lugar, data com a hora do fuso do EVENTO, a situacao
/// por extenso e a CONTAGEM de presencas. Capa quando houver.
///
/// **Nao mostra pessoa nenhuma**, e nao ha como: [EncontroDaRede] nao tem campo
/// com pessoas.
class CartaoDoEncontro extends StatelessWidget {
  const CartaoDoEncontro({required this.encontro, super.key});

  final EncontroDaRede encontro;

  /// O rotulo da situacao, ou nulo quando nao ha o que afirmar.
  ///
  /// `upcoming` nao ganha rotulo: a data ja diz que e no futuro, e um
  /// `Em breve` ao lado dela seria a mesma informacao duas vezes. Os outros
  /// dois ganham, porque a data **nao** diz nenhum dos dois.
  static String? rotuloDaSituacao(SituacaoDoEncontro? situacao) {
    return switch (situacao) {
      SituacaoDoEncontro.encerrado => AgendaDaRede.rotuloEncerrado,
      SituacaoDoEncontro.acontecendo => AgendaDaRede.rotuloAcontecendo,
      SituacaoDoEncontro.aVir => null,
      null => null,
    };
  }

  @override
  Widget build(BuildContext context) {
    final cores = BichuColors.of(context).cores;
    final textos = Theme.of(context).textTheme;
    final situacao = rotuloDaSituacao(encontro.situacao);

    return Material(
      color: cores.surface,
      borderRadius: BorderRadius.circular(BichuRaio.lg),
      child: InkWell(
        onTap: () => TelaDoEncontro.abrir(context, encontro.slug),
        borderRadius: BorderRadius.circular(BichuRaio.lg),
        child: Container(
          width: double.infinity,
          padding: const EdgeInsets.all(BichuEspaco.e4),
          decoration: BoxDecoration(
            borderRadius: BorderRadius.circular(BichuRaio.lg),
            border: Border.all(
              color: cores.outline,
              width: BichuBorda.hairline,
            ),
          ),
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: <Widget>[
              if (encontro.urlDaCapa != null) ...<Widget>[
                ClipRRect(
                  borderRadius: BorderRadius.circular(BichuRaio.md),
                  child: Image.network(
                    encontro.urlDaCapa!,
                    height: 160,
                    width: double.infinity,
                    fit: BoxFit.cover,
                    // Nome acessivel em portugues. A capa nao acrescenta
                    // informacao ao titulo que ja esta logo abaixo.
                    semanticLabel: 'Foto de ${encontro.titulo}',
                    errorBuilder: (_, _, _) => const SizedBox.shrink(),
                  ),
                ),
                const SizedBox(height: BichuEspaco.e3),
              ],
              if (situacao != null) ...<Widget>[
                _Distintivo(texto: situacao),
                const SizedBox(height: BichuEspaco.e2),
              ],
              Text(encontro.titulo, style: textos.titleMedium),
              const SizedBox(height: BichuEspaco.e1),
              Text(
                encontro.resumo,
                style: textos.bodyMedium?.copyWith(color: cores.textSecondary),
              ),
              const SizedBox(height: BichuEspaco.e2),
              // A DATA COM A HORA DO FUSO DO EVENTO, e o fuso dito ao lado.
              Text(
                encontro.comeca.porExtenso,
                style: textos.bodyMedium?.copyWith(color: cores.textPrimary),
              ),
              const SizedBox(height: BichuEspaco.e1),
              Text(
                encontro.lugar.linha,
                style: textos.bodySmall?.copyWith(color: cores.textSecondary),
              ),
              const SizedBox(height: BichuEspaco.e2),
              // A CONTAGEM, e nunca quem. Ver ADR-0025 secao 2.
              Text(
                AgendaDaRede.linhaDePresencas(encontro.presencas),
                style: textos.bodySmall?.copyWith(color: cores.textSecondary),
              ),
            ],
          ),
        ),
      ),
    );
  }
}

/// O distintivo de situacao: `Encerrado` e `Acontecendo agora`.
///
/// Texto, e nao so cor: um encontro encerrado precisa DIZER que encerrou, e
/// quem nao distingue as duas cores continuaria sem saber.
class _Distintivo extends StatelessWidget {
  const _Distintivo({required this.texto});

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
        style: textos.labelMedium?.copyWith(color: cores.textPrimary),
      ),
    );
  }
}

/// O esqueleto de carregamento, na altura de um cartao.
class _EsqueletoDeEncontro extends StatelessWidget {
  const _EsqueletoDeEncontro();

  @override
  Widget build(BuildContext context) {
    final cores = BichuColors.of(context).cores;
    return Container(
      width: double.infinity,
      height: 180,
      decoration: BoxDecoration(
        color: cores.surfaceSunken,
        borderRadius: BorderRadius.circular(BichuRaio.lg),
      ),
    );
  }
}
