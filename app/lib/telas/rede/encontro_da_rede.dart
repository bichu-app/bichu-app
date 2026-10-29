import 'package:flutter/material.dart';
import 'package:go_router/go_router.dart';

import '../../api/falhas.dart';
import '../../api/mensagens_de_erro.dart';
import '../../api/modelos_pet.dart';
import '../../api/modelos_rede.dart';
import '../../api/rede_api.dart';
import '../../dispositivo/saida_do_app.dart';
import '../../escopo.dart';
import '../../roteamento/rotas.dart';
import '../../theme/bichu_colors.dart';
import '../../theme/bichu_tokens.g.dart';
import '../../widgets/botao_primario.dart';
import '../../widgets/casca_da_pagina_interna.dart';
import '../../widgets/faixa_de_aviso.dart';
import '../../widgets/marca.dart';
import '../../widgets/visualizador_de_imagem.dart';
import 'local_do_encontro.dart';
import 'pecas_da_rede.dart';

/// A pagina de um encontro da `Rede` (design system 24.12 a 24.17, textos da
/// UX 28.1, 28.6 e 28.7).
///
/// ## ELA VOLTOU EM 20/10/2026, e a volta e correcao de pedido
///
/// Esta tela foi APAGADA em 19/10/2026 (`be057793`), e o cliente corrigiu o
/// pedido no dia seguinte, literal: *"eu nao pedi pra voce remover, eu pedi
/// para remover o clique para o usuario nnao conseguir acessar a pagina de
/// detalhes e pedi pra voce resumir a listagem com foto, titulo do evento"*.
///
/// O que ele pediu em 19/10 eram DUAS coisas -- tirar o clique e resumir o
/// cartao --, e a entrega leu como uma terceira: apagar a pagina. O arquivo
/// voltou do historico (`be057793^`), e nao foi reescrito.
///
/// **E o clique agora depende da SESSAO**, que e o pedido de 20/10 inteiro:
/// *"quando o usuario estiver deslogado e tentar clicar para ver detalhes de
/// algum conteudo, como por exemplo os eventos, que ele precisa estar logado
/// para ver mais informacoes"*. Quem decide e `agenda_da_rede.dart`, que
/// conhece a sessao; deslogado o toque abre a folha com o convite e **nao**
/// esta pagina.
///
/// ## O EVENTO PRIVADO NAO VOLTOU, e a ausencia e decisao dele
///
/// *"vamos deixar apenas os eventos abertos por enquanto, no futuro
/// analisamos a necessidade"*. Sairam desta pagina, em relacao a versao
/// restaurada: o teaser do privado, `Pedir para participar`, `Desistir do
/// pedido`, a caixa de estado do pedido, a folha de guarda de acao do pedido,
/// o selo `Privado` e a leitura de `getNetworkEventPrivateDetails`. Com eles
/// saiu a intencao `pedir_para_participar` -- que ja nao tinha executor
/// registrado em `app.dart`.
///
/// **`TeaserDoPrivado` continua no modelo**, porque o contrato continua
/// podendo mandar um: se ele chegar, esta pagina desenha so o que o teaser
/// carrega (banner, titulo e o dia) e nenhuma caixa de pedido. Ela nao
/// inventa frase para um estado que o produto nao tem.
///
/// ## Ordem, de cima para baixo (24.15, com as trocas de 24.17)
///
/// Capa 16:9 com `Voltar` flutuante; cabecalho (titulo, a linha de origem --
/// `Cadastrado pela equipe do Bichu` ou `Cadastrado pela comunidade`, e
/// NENHUMA quando o servidor nao disse --, selo de valor); aviso de cancelado; `Quando`; `Local`
/// (com o mapa); `Sobre o evento`; `Links`; `Fotos`; `Para quais cachorros`; `O que
/// levar`; `Cuidados no evento`; `Acessibilidade e estrutura`;
/// `Observações`. **Sem `Quem organiza` e sem `Compartilhar`** (24.17.1 e
/// 24.15 item 4). Sem check-in, sem galeria da comunidade e sem lista de
/// presenca (ADR-0025).
///
/// ## Duas operacoes, e a segunda so quando pode
///
/// - `getNetworkEvent`, sem token, sempre. Medido em 20/10/2026 na
///   homologacao: `GET /v1/network/events/{slug}` responde **200 sem conta**.
/// - `getNetworkEventLocation`, **so com conta** e so quando o encontro nao
///   esta cancelado. Medido no mesmo dia: a rota responde **401
///   unauthenticated** sem token e 200 com token -- e ela e a unica
///   informacao de evento que o servidor de fato guarda atras de conta. Sem
///   conta nao ha pergunta, nao ha ponto e nao ha mapa: o bloco `Local` fica
///   so com o endereco que veio na projecao publica (a isca confere que a
///   chamada nao sai).
///
/// ## A distancia
///
/// Vem do cartao, que a leu de `listNearbyNetworkEvents` (a regiao
/// cadastrada; o GPS nao participa). Nunca em encerrado nem em cancelado.
class TelaDoEncontro extends StatefulWidget {
  const TelaDoEncontro({
    required this.slug,
    super.key,
    this.distanciaEmMetros,
  });

  final String slug;
  final int? distanciaEmMetros;

  static const String tituloDaTela = 'Evento';
  static const String rotuloDeAtualizar = 'Atualizar';
  /// Cadastrado pela EQUIPE (`origin: admin`).
  static const String cadastradoPelaEquipe = 'Cadastrado pela equipe do Bichu';

  /// Cadastrado por uma conta do app (`origin: community`).
  ///
  /// **"pela comunidade", e nunca o nome de quem cadastrou**: o autor nao sai
  /// do servidor (ADR-0025 secao 3, ADR-0027 apendice A.4) e esta tela nao tem
  /// como saber quem e -- nem deve.
  static const String cadastradoPelaComunidade = 'Cadastrado pela comunidade';

  /// O rotulo da origem, ou **nulo quando o servidor nao disse**.
  ///
  /// ## Por que o nulo nao cai na equipe
  ///
  /// Ate 20/10/2026 esta tela escrevia *"Cadastrado pela equipe do Bichu"*
  /// **incondicionalmente**, inclusive em encontro proposto pela comunidade --
  /// porque `NetworkEventPublic` nao trazia a origem e o literal era um so.
  /// Era rotulo afirmando autoria que o dado nao provava, a mesma classe do
  /// "Organizado" que o cliente mandou trocar no mesmo dia, e com o agravante
  /// de a afirmacao estar ERRADA.
  ///
  /// Fazer o nulo cair em "equipe" seria repor o defeito com outra roupa: o
  /// campo e opcional no contrato, e encontro gravado antes dele existir chega
  /// sem origem. Entao o nulo **nao desenha linha nenhuma** -- a tela cala em
  /// vez de afirmar. Uma linha a menos nao engana ninguem; a linha errada sim.
  static String? rotuloDaOrigem(OrigemDoEncontro? origem) {
    return switch (origem) {
      OrigemDoEncontro.equipe => cadastradoPelaEquipe,
      OrigemDoEncontro.comunidade => cadastradoPelaComunidade,
      null => null,
    };
  }

  /// O nome acessivel da capa quando o contrato nao traz `alt_text`.
  ///
  /// A capa tocavel precisa de nome: alvo de toque anunciado so como "botao"
  /// reprova em SC 4.1.2. Quando ha `alt_text`, ele VENCE este texto -- quem
  /// cadastrou o evento descreveu a foto melhor do que uma reserva generica.
  static const String nomeDaCapaSemTexto = 'Foto do evento';

  /// O que o toque na capa faz. Vai em `hint`, e nao no nome.
  static const String dicaDeAmpliarACapa = 'Ampliar';

  /// O nome acessivel de UMA miniatura da faixa `Fotos`.
  ///
  /// **Diz a POSICAO, e nao so "foto"**: a faixa rola na horizontal e as oito
  /// miniaturas seriam oito nos com o mesmo nome para quem navega por
  /// varredura. O `alt_text` do organizador vem antes quando ha um -- ele
  /// descreve a foto melhor do que um numero --, e o numero entra de reserva.
  static String nomeDaFoto({required int posicao, required int total}) =>
      'Foto $posicao de $total';

  /// O que o toque na miniatura faz. **A mesma palavra da capa**, de propósito:
  /// o gesto e o mesmo e abre a mesma tela.
  static const String dicaDeAmpliarAFoto = dicaDeAmpliarACapa;
  static const String avisoDeCancelado =
      'A equipe do Bichu cancelou este evento. Ele não vai acontecer.';
  static const String rotuloDoCalendario = 'Adicionar ao calendário';
  static const String falhaDoCalendario =
      'Não conseguimos abrir o calendário.';

  // -- Compartilhar o encontro (cliente, 21/10/2026) ------------------------
  //
  // O cliente pediu, literal: *"vamos implementar o recurso de compartilhar o
  // evento tambem, inserir um botao na pagina de detalhes do evento para
  // convidar outros usuarios no whatsapp e outras ferramentas"*.
  //
  // **O MESMO caminho do pet perdido, e nao um segundo.** A acao sai por
  // `SaidaDoApp.compartilharTexto`, que e a folha do sistema (`ACTION_SEND`),
  // a mesma porta que `telas/pet/tela_detalhe_do_pet.dart` usa desde
  // 20/10/2026. Nenhum pacote novo entrou e `share_plus` continua em
  // `^12.0.2` -- a versao 13 quebra o Android, e o motivo esta medido no
  // comentario de `app/pubspec.yaml`.

  /// O rotulo da acao. **`Compartilhar`, a mesma palavra da ficha do pet**, e
  /// nao `Convidar no WhatsApp`: quem decide o que a folha lista e o sistema,
  /// e duas palavras para o mesmo gesto fariam o app parecer ter dois
  /// recursos.
  static const String rotuloDeCompartilhar = 'Compartilhar';

  /// O nome acessivel: diz DE QUE evento e a acao, porque numa lista de acoes
  /// o leitor de tela le os rotulos fora de contexto.
  static String compartilharAcessivel(String titulo) =>
      'Compartilhar o evento $titulo';

  /// Quando a folha do sistema nao abriu. **Nao diz "WhatsApp"** e nao manda
  /// instalar nada: a unica coisa que o app sabe aqui e que ela nao abriu.
  static const String falhaDoCompartilhar =
      'Não conseguimos abrir as opções de compartilhamento agora. '
      'Tente de novo.';

  /// A MENSAGEM QUE SAI DO PRODUTO E CHEGA EM ESTRANHOS.
  ///
  /// ## O LINK ENTROU EM 21/10/2026, e ele vem do SERVIDOR
  ///
  /// Quando esta funcao nasceu, no mesmo dia, nao havia link: medido de fora
  /// nos dois ambientes, com controle positivo (`/comunidade` -> 200),
  /// `bichu.app/encontro/<slug>` respondia 404, e `NetworkEventPublic` nao
  /// tinha `share_url`. O comentario daquela versao previu o caminho e e
  /// exatamente este o que foi feito: *"o endereco entra como entrou no caso do
  /// pet: campo do servidor, aceso por `site_page_availability`, e nao literal
  /// montado no aparelho -- assim ele acende sem APK novo. Esta funcao ganha um
  /// parametro e mais uma linha."*
  ///
  /// Entao [link] e `share_url`, lido de `EncontroPublico.linkDaPagina`, e
  /// **nulo e o estado normal**:
  ///
  /// - nulo enquanto `site_page_availability` disser que a pagina do encontro
  ///   nao esta publicada (migracao `20261020000017`);
  /// - nulo no encontro cancelado e no encerrado;
  /// - nulo no privado, que nao tem pagina publica.
  ///
  /// Com nulo, a mensagem sai **identica a de antes** -- e e por isso que
  /// acender a pagina nao exige APK novo. **O app nao monta o endereco**: nao
  /// existe `'/encontro/' + slug` em lugar nenhum dele, porque um literal aqui
  /// viraria link morto no dia em que o site mudasse, e o binario instalado nao
  /// se corrige.
  ///
  /// ## O QUE ESTA AUSENTE DE PROPOSITO
  ///
  /// **O endereco por extenso (`street_address`) NAO entra.** Ele sai so de
  /// `getNetworkEventLocation`, com `bearerAuth` (emenda 1 do ADR-0010), e o
  /// ADR-0027 item 21.2 diz que ele **nunca** sai na agenda, no detalhe
  /// publico, no teaser nem nos detalhes do privado. Esta mensagem e lida
  /// FORA do app, por quem nao tem conta: por o endereco nela seria publicar o
  /// que o contrato guarda atras de conta. [lugar] e `LugarDoEncontro`
  /// inteiro -- nome do lugar, bairro, cidade e UF --, que e publico no
  /// contrato (`NetworkEventPlace`, quatro rotulos e nenhuma coordenada), e e
  /// a MESMA linha que ja vai para o calendario do aparelho.
  ///
  /// Tambem nao entram: coordenada (nao existe em `NetworkEventPlace`),
  /// qualquer identificador interno, e o nome de quem cadastrou (ele nao sai
  /// do servidor, ADR-0025 secao 3).
  ///
  /// A isca `o texto compartilhado nao carrega endereco de rua` cobra isto
  /// contra o texto REAL montado, e nao contra um literal de tela, e a isca
  /// `o link do texto e o do servidor` cobra que o endereco nao seja montado
  /// aqui.
  static String mensagemDeCompartilhar({
    required String titulo,
    required String dia,
    required String horario,
    required String lugar,
    Uri? link,
  }) {
    return '$titulo\n'
        '$dia · $horario\n'
        '$lugar\n'
        'Encontrei no Bichu. Vamos juntos?'
        // A UMA LINHA que o autor da versao sem link previu. Vem por ultimo
        // porque e o que a pre-visualizacao do WhatsApp usa para montar o
        // cartao, e porque quem le no celular ve o convite antes do endereco.
        '${link == null ? '' : '\n$link'}';
  }

  /// O assunto, que vira `EXTRA_SUBJECT` no Android e o assunto do e-mail
  /// quando o destino escolhido na folha e um aplicativo de e-mail. Nos
  /// destinos que nao tem assunto -- WhatsApp, Telegram, copiar -- o sistema o
  /// ignora, e ele nao aparece duplicado no corpo.
  static String assuntoDeCompartilhar(String titulo) => 'Vamos juntos? $titulo';

  /// As quatro frases de `Cuidados no evento` (UX 28.7.1). A segunda varia
  /// por `fenced_off_leash_area`.
  static List<String> cuidados({required bool areaCercada}) => <String>[
        'Recolha o cocô e descarte em local adequado.',
        areaCercada
            ? 'Na área cercada, o cachorro pode ficar solto. Fora dela, na guia.'
            : 'Mantenha o cachorro na guia o tempo todo.',
        'Se o seu cachorro parecer desconfortável, afaste-se do grupo com ele por '
            'um tempo.',
        'Fêmea no cio fica em casa.',
      ];

  /// Empilha o encontro no ramo da `Rede`, com a barra de abas.
  static Future<void> abrir(
    BuildContext context,
    String slug, {
    int? distanciaEmMetros,
  }) {
    return context.push<void>(
      Rotas.encontroDaRedeDe(slug),
      extra: distanciaEmMetros,
    );
  }

  @override
  State<TelaDoEncontro> createState() => _TelaDoEncontroState();
}

enum _Fase { carregando, pronto, falha }

class _TelaDoEncontroState extends State<TelaDoEncontro> {
  _Fase _fase = _Fase.carregando;
  String? _textoDaFalha;
  EncontroDaRede? _encontro;

  PontoNoBloco _ponto = const SoEndereco();

  /// `street_address`, que vem da mesma chamada do ponto e exige conta. Nulo
  /// sem conta, no cancelado e no encontro que nao tem endereco escrito.
  String? _endereco;

  bool _cargaAgendada = false;

  @override
  void initState() {
    super.initState();
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

  bool get _logado => Escopo.of(context).sessao.logado;

  RedeApi get _rede => RedeApi(Escopo.of(context).api);

  Future<void> _carregar() async {
    if (!mounted) return;
    setState(() {
      _fase = _Fase.carregando;
      _textoDaFalha = null;
    });
    try {
      final encontro = await _rede.detalhar(widget.slug);
      if (!mounted) return;
      setState(() {
        _encontro = encontro;
        _fase = _Fase.pronto;
      });
      _carregarPonto();
    } on FalhaDeChamada catch (falha) {
      if (!mounted) return;
      setState(() {
        _textoDaFalha = MensagensDeErro.de(falha).texto;
        _encontro = null;
        _fase = _Fase.falha;
      });
    } on FormatException {
      if (!mounted) return;
      setState(() {
        _textoDaFalha = MensagensDeErro.servidorFora;
        _encontro = null;
        _fase = _Fase.falha;
      });
    }
  }

  /// O ponto so e perguntado com conta, com lugar na tela e sem cancelamento.
  bool get _deveBuscarPonto {
    final e = _encontro;
    if (!_logado || e == null) return false;
    if (e.situacao == SituacaoDoEncontro.cancelado) return false;
    // **`EncontroPublico` e o unico caso que pergunta.** `TeaserDoPrivado`
    // nao tem lugar na tela para o ponto cair, e o produto nao tem evento
    // privado desde 19/10/2026.
    return e is EncontroPublico;
  }

  Future<void> _carregarPonto() async {
    if (!_deveBuscarPonto) {
      setState(() {
        _ponto = const SoEndereco();
        _endereco = null;
      });
      return;
    }
    setState(() => _ponto = const PontoCarregando());
    try {
      final local = await _rede.localizacao(widget.slug);
      if (!mounted) return;
      final ponto = local.ponto;
      setState(() {
        _ponto = ponto == null ? const SoEndereco() : PontoConhecido(ponto);
        _endereco = local.endereco;
      });
    } on FalhaDaApi catch (falha) {
      if (!mounted) return;
      // 404 aqui e "sem ponto para esta conta", com o mesmo corpo de "nao
      // existe": o bloco fica so com o endereco, sem acusar nada.
      setState(() {
        _ponto = falha.problem.status == 404
            ? const SoEndereco()
            : const PontoComFalha();
        _endereco = null;
      });
    } on FalhaDeChamada {
      if (!mounted) return;
      setState(() {
        _ponto = const PontoComFalha();
        _endereco = null;
      });
    } on FormatException {
      if (!mounted) return;
      setState(() {
        _ponto = const PontoComFalha();
        _endereco = null;
      });
    }
  }

  void _avisar(String texto) {
    ScaffoldMessenger.maybeOf(context)?.showSnackBar(
      SnackBar(content: Text(texto)),
    );
  }

  Future<void> _adicionarAoCalendario(ConteudoDoEncontro c) async {
    final abriu = await SaidaDoApp.atual.adicionarAoCalendario(
      EventoDeCalendario(
        titulo: c.titulo,
        inicio: c.horario.inicio,
        fim: c.horario.fim,
        local: c.lugar.linhaCompleta,
        descricao: c.resumo,
      ),
    );
    if (!abriu && mounted) _avisar(TelaDoEncontro.falhaDoCalendario);
  }

  /// `Compartilhar`: abre a FOLHA DO SISTEMA com o texto do encontro.
  ///
  /// ## A guarda, e por que ela e cinto e nao o desenho
  ///
  /// O desenho e o `if` que monta o bloco em [_corpo]: a acao **nao e
  /// desenhada** sem `ConteudoDoEncontro` (o teaser do privado nao tem lugar
  /// nem horario para o texto) e nem no cancelado ou encerrado (convidar
  /// alguem para um encontro que nao vai acontecer manda gente a um lugar
  /// vazio). Esta linha existe para o caso de alguem chamar isto de outro
  /// lugar depois.
  ///
  /// ## O que acontece quando a folha nao abre
  ///
  /// [SaidaDoApp.compartilharTexto] devolve `false` quando nao ha atividade
  /// que responda a `ACTION_SEND` ou o plugin nao esta no binario. A tela
  /// **diz**, em vez de ficar calada: um toque que nao faz nada e
  /// indistinguivel de um toque que nao chegou, e a pessoa toca de novo.
  ///
  /// **Em aviso de rodape, e nao em faixa**, que e onde esta tela diverge da
  /// ficha do pet -- de proposito. A acao vizinha desta pagina
  /// ([_adicionarAoCalendario]) ja recusa assim, e as duas sao a mesma coisa
  /// para quem olha: uma saida do aparelho que nao abriu. Dois desenhos de
  /// recusa na mesma tela fariam a pessoa procurar a diferenca que nao existe.
  ///
  /// **Nao ha tratamento de "WhatsApp nao instalado"**, e a ausencia e
  /// deliberada: quem decide o que a folha lista e o sistema, e perguntar o
  /// que esta instalado exigiria `QUERY_ALL_PACKAGES` no Android 11+.
  Future<void> _compartilharOEncontro(
    EncontroDaRede encontro,
    ConteudoDoEncontro c,
  ) async {
    final abriu = await SaidaDoApp.atual.compartilharTexto(
      texto: TelaDoEncontro.mensagemDeCompartilhar(
        titulo: encontro.titulo,
        dia: encontro.dia.dataLonga(anoCorrente: DateTime.now().year),
        horario: c.horario.faixa,
        // `linhaCompleta` e `LugarDoEncontro`: nome do lugar, bairro, cidade e
        // UF, os quatro rotulos publicos de `NetworkEventPlace`. **Nao e
        // `_endereco`**, que e o `street_address` de `getNetworkEventLocation`
        // e so existe com conta.
        lugar: c.lugar.linhaCompleta,
        // `share_url`, do servidor. Nulo com o interruptor apagado, no
        // cancelado, no encerrado e no privado -- e com nulo o texto sai como
        // saia antes desta linha existir.
        link: c.linkDaPagina,
      ),
      assunto: TelaDoEncontro.assuntoDeCompartilhar(encontro.titulo),
    );
    if (!abriu && mounted) _avisar(TelaDoEncontro.falhaDoCompartilhar);
  }

  void _voltar() {
    if (context.canPop()) {
      context.pop();
    } else {
      context.go(Rotas.rede);
    }
  }

  // -------------------------------------------------------------------------
  // A pagina
  // -------------------------------------------------------------------------

  @override
  Widget build(BuildContext context) {
    final encontro = _encontro;
    if (_fase != _Fase.pronto || encontro == null) {
      return Scaffold(
        appBar: AppBar(
          toolbarHeight: BichuAlvoDeToque.critico,
          leadingWidth: BichuAlvoDeToque.critico,
          leading: BotaoVoltarNaBarra(aoTocar: _voltar),
          title: const Text(TelaDoEncontro.tituloDaTela),
        ),
        body: SafeArea(
          child: ListView(
            padding: const EdgeInsets.all(BichuEspaco.e4),
            children: <Widget>[
              if (_fase == _Fase.carregando)
                const _EsqueletoDoEncontro()
              else
                FaixaDeAviso(
                  texto: _textoDaFalha ?? MensagensDeErro.servidorFora,
                  rotuloDaAcao: TelaDoEncontro.rotuloDeAtualizar,
                  aoTocarNaAcao: _carregar,
                ),
            ],
          ),
        ),
      );
    }

    // A CASCA SAIU DESTE ARQUIVO EM 28/10/2026, e e a MESMA da ficha do local.
    //
    // Era este `build` que desenhava a capa com `Voltar` flutuante, a barra que
    // entra na rolagem e o `Semantics` de rota -- e a ficha do local desenhava
    // um `AppBar` com o nome no titulo. O cliente mandou as duas terem o mesmo
    // padrao (*"manter o padrao do botao voltar igual da pagina de eventos"*),
    // e copiar isto para la faria DUAS copias da mesma regra. Entao a casca
    // virou `widgets/casca_da_pagina_interna.dart` e as duas a consomem.
    //
    // **Nada mudou no que esta tela desenha**: a capa, o limiar da barra (a
    // altura da capa menos 48 dp) e o anuncio `Evento: {título}` sao os mesmos,
    // agora num lugar so. `temCapa` e verdadeiro porque `_pagina` sempre abre
    // com a capa 16:9 -- quando o evento nao tem banner, `pecas_da_rede`
    // desenha a reserva na mesma proporcao.
    return CascaDaPaginaInterna(
      nome: encontro.titulo,
      prefixoAnunciado: TelaDoEncontro.tituloDaTela,
      aoVoltar: _voltar,
      proporcaoDaCapa: proporcaoDaCapa,
      recuo: const EdgeInsets.only(bottom: BichuEspaco.e8),
      filhos: _pagina(encontro),
    );
  }

  List<Widget> _pagina(EncontroDaRede encontro) {
    final cores = BichuColors.of(context).cores;
    final textos = Theme.of(context).textTheme;
    final situacao = encontro.situacao;
    final cancelado = situacao == SituacaoDoEncontro.cancelado;
    final encerrado = situacao == SituacaoDoEncontro.encerrado;
    final vivo = !cancelado && !encerrado;
    final ano = DateTime.now().year;

    // O conteudo desenhavel. **`TeaserDoPrivado` da nulo**, e nao o detalhe
    // oculto: o evento privado saiu do produto em 19/10/2026 por decisao do
    // cliente, e com ele a leitura de `getNetworkEventPrivateDetails`. Um
    // teaser que chegasse desenha so o que ele carrega -- banner, titulo e o
    // dia --, sem caixa de pedido e sem frase inventada para um estado que o
    // produto nao tem.
    final ConteudoDoEncontro? conteudo = switch (encontro) {
      EncontroPublico() => encontro,
      TeaserDoPrivado() => null,
    };

    // A distancia: nunca fora de "a vir" / "acontecendo".
    final distancia = vivo ? widget.distanciaEmMetros : null;

    // A CAPA. **Verbatim de `be057793^`, menos UMA coisa: o cinza.**
    //
    // O distintivo sobre a imagem FICA -- `Cancelado` grande no centro,
    // `Acontecendo agora` / `Encerrado` no canto --, e ele e informacao e nao
    // enfeite nesta tela: quem abre a pagina de um encontro precisa saber, na
    // primeira dobra, que ele nao vai acontecer ou que ja aconteceu.
    // `DistintivoDeSituacao` nao foi reescrito; ele ja estava de volta em
    // `pecas_da_rede.dart`, trazido por `feat/meus-eventos-e-cancelar`.
    //
    // **O que NAO voltou e o `cancelado: true` da imagem**, que pintava a capa
    // em escala de cinza. Ele saiu em 19/10 porque cor sozinha nao e sinal
    // (SC 1.4.1) e nao voltou no cartao; repo-lo aqui so nesta tela faria a
    // mesma informacao ter dois desenhos no mesmo app. A palavra basta, e ela
    // esta em dois lugares: este distintivo e o [_AvisoDeCancelado] em texto,
    // logo abaixo do cabecalho.
    //
    // `cover_banner_url` PRIMEIRO: esta capa e de borda a borda, 360 a 430 dp
    // (1080 a 1290 px a 3x), e borrava de leve com a derivada de 1024 px que o
    // cartao da agenda usa. Com a capa como reserva, o encontro gravado antes
    // desta derivada existir continua desenhando.
    // A URL da capa, num lugar so: ela decide o que DESENHA e tambem se existe
    // alvo de toque. Duas expressoes separadas e o jeito de a ficha oferecer
    // toque numa capa que nao tem foto.
    final urlDaCapa = conteudo?.urlDoBannerDaCapa ?? conteudo?.urlDaCapa;
    final textoAlternativoDaCapa =
        conteudo?.urlDaCapa == null ? null : conteudo?.textoAlternativoDaCapa;

    // AS URLS DO VISUALIZADOR, lidas UMA vez e usadas em DOIS lugares: a capa
    // e a faixa `Fotos`. Duas expressoes separadas divergiriam no dia em que
    // alguem mexesse numa delas, e a divergencia apareceria como indice errado
    // -- tocar na terceira miniatura e abrir a segunda foto.
    final urlsParaAmpliar =
        conteudo?.urlsParaAmpliar ?? const <String>[];

    final capa = Stack(
      children: <Widget>[
        // **A FOTO PRINCIPAL AMPLIA AO TOQUE** (pedido do cliente de
        // 20/10/2026: *"na pagina de detalhes do evento, a foto principal deve
        // ser clicada e ampliada"*). O visualizador e
        // `widgets/visualizador_de_imagem.dart`, compartilhado, porque esta e
        // a primeira das sete superficies de foto a pedir o gesto e nao sera a
        // ultima.
        //
        // **SEM FOTO NAO HA ALVO DE TOQUE**, e e por isso que o `if` esta aqui
        // e nao dentro do `onTap`. `ImagemDoEncontroOuBanner` desenha o banner
        // da marca quando `url` e nulo; envolve-lo num `InkWell` sempre faria a
        // ficha sem foto pintar respingo e se anunciar como botao para o leitor
        // de tela, prometendo uma tela que nao abre. `VisualizadorDeImagem.abrir`
        // tambem recusa URL nula -- aquilo e o cinto; este `if` e o freio.
        if (urlDaCapa == null)
          ImagemDoEncontroOuBanner(
            url: urlDaCapa,
            textoAlternativo: textoAlternativoDaCapa,
          )
        else
          // **UM no semantico, e nao dois.** `ImagemDoEncontroOuBanner` ja poe
          // o `alt_text` na imagem; um `Semantics` em volta dela SEM
          // `excludeSemantics` faria o leitor de tela anunciar o nome da foto e
          // depois o botao, como se fossem duas coisas. Aqui o no e um: o nome
          // e o `alt_text` quando o organizador escreveu um, a funcao e
          // `button`, e o que o toque faz vai em `hint` -- que e onde o leitor
          // de tela espera a ACAO, e nao no nome.
          Semantics(
            button: true,
            label: textoAlternativoDaCapa ?? TelaDoEncontro.nomeDaCapaSemTexto,
            hint: TelaDoEncontro.dicaDeAmpliarACapa,
            excludeSemantics: true,
            child: InkWell(
              // **`abrirVarias` COM A GALERIA INTEIRA, e nao `abrir` com a
              // capa** (cliente, 26/10/2026: *"as fotos dos eventos, quando
              // tem mais do que uma nao esta trocando, nao tem a seta que eu
              // pedi para avancar e retroceder"*).
              //
              // **A reclamacao era de ABERTURA, e nao de carrossel.** As setas
              // e o contador existem no visualizador desde 22/10 e funcionam;
              // ele os esconde quando recebe UMA imagem, e era UMA que esta
              // linha entregava -- `abrir` monta `<String>[url]`. Entao um
              // encontro com oito fotos abria sem seta nenhuma, e o defeito
              // ficava com cara de carrossel quebrado.
              //
              // **`urlsParaAmpliar` e a fonte unica**, a mesma que a faixa
              // `Fotos` usa: a capa e a posicao 0 dela, e por isso `inicial`
              // fica no padrao. Lista vazia nao empilha rota (guarda de
              // `abrirVarias`), e e o que chega de um encontro sem foto -- que
              // este ramo nem alcanca, porque o `if` acima ja o desviou.
              onTap: () => VisualizadorDeImagem.abrirVarias(
                context,
                urls: urlsParaAmpliar,
                textoAlternativo: textoAlternativoDaCapa,
              ),
              child: ImagemDoEncontroOuBanner(
                url: urlDaCapa,
                textoAlternativo: textoAlternativoDaCapa,
              ),
            ),
          ),
        if (cancelado)
          const Positioned.fill(
            child: Center(
              child: DistintivoDeSituacao(
                situacao: SituacaoDoEncontro.cancelado,
                grande: true,
              ),
            ),
          )
        else if (situacao != null && rotuloDaSituacao(situacao) != null)
          Positioned(
            right: BichuEspaco.e3,
            bottom: BichuEspaco.e3,
            child: DistintivoDeSituacao(situacao: situacao),
          ),
      ],
    );

    final rotuloDaOrigem = TelaDoEncontro.rotuloDaOrigem(conteudo?.origem);

    final cabecalho = Padding(
      padding: const EdgeInsets.fromLTRB(
        BichuEspaco.e4,
        BichuEspaco.e4,
        BichuEspaco.e4,
        0,
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: <Widget>[
          Semantics(
            header: true,
            child: Text(encontro.titulo, style: textos.headlineSmall),
          ),
          // A LINHA DA ORIGEM, e ela SOME quando o servidor nao disse qual e.
          // Ver [TelaDoEncontro.rotuloDaOrigem]: calar e melhor que afirmar a
          // origem errada, que e o que esta tela fazia ate 20/10/2026.
          if (rotuloDaOrigem != null) ...<Widget>[
            const SizedBox(height: BichuEspaco.e2),
            Row(
              children: <Widget>[
                const ExcludeSemantics(child: MarcaSimbolo(altura: BichuEspaco.e6)),
                const SizedBox(width: BichuEspaco.e2),
                Expanded(
                  child: Text(
                    rotuloDaOrigem,
                    style: textos.bodySmall?.copyWith(color: cores.textSecondary),
                  ),
                ),
              ],
            ),
          ],
          const SizedBox(height: BichuEspaco.e3),
          Wrap(
            spacing: BichuEspaco.e2,
            runSpacing: BichuEspaco.e2,
            children: <Widget>[
              // O SELO DE VALOR FICA. Ele saiu do CARTAO por pedido do
              // cliente (*"apenas a foto e o titulo"*), e `Gratuito` ou
              // `R$ 15 por cão` e justamente o tipo de coisa que a pessoa vem
              // procurar na pagina -- e que o cartao resumido nao diz mais.
              if (conteudo != null) seloDeValor(conteudo.entrada),
            ],
          ),
        ],
      ),
    );

    // `COMPARTILHAR`, logo abaixo do cabecalho (cliente, 21/10/2026:
    // *"inserir um botao na pagina de detalhes do evento para convidar outros
    // usuarios no whatsapp e outras ferramentas"*).
    //
    // ## AS DUAS TRAVAS DO DESENHO
    //
    // 1. **`conteudo != null`**: o teaser do privado nao carrega lugar nem
    //    horario, e um convite com titulo e mais nada nao convida ninguem.
    // 2. **`vivo`**: no cancelado e no encerrado a acao **nao existe**. E a
    //    mesma trava que ja esconde o calendario, pelo motivo mais forte:
    //    convidar para um encontro cancelado manda gente a um lugar vazio, e a
    //    mensagem ja saiu do nosso dominio quando isso aparecer.
    //
    // ## POR QUE AQUI, E NAO NA BARRA DE TOPO
    //
    // A barra desta pagina so aparece depois que a capa rola (24.17.1, item
    // 7), e uma acao que some quando a pessoa esta no topo e uma acao que ela
    // nao acha. Aqui ela fica na PRIMEIRA DOBRA, logo depois do titulo -- que e
    // o momento em que a pessoa decide se chama alguem --, e nenhuma secao
    // mudou de lugar para ela caber.
    //
    // `BotaoSecundario` e nao primario: a pagina e de leitura, nao ha acao
    // principal competindo, e um botao cheio aqui pesaria mais que o titulo.
    final convidar = conteudo != null && vivo
        ? _Margem(
            child: Padding(
              padding: const EdgeInsets.only(top: BichuEspaco.e4),
              child: BotaoSecundario(
                rotulo: TelaDoEncontro.rotuloDeCompartilhar,
                nomeAcessivel: TelaDoEncontro.compartilharAcessivel(
                  encontro.titulo,
                ),
                aoTocar: () => _compartilharOEncontro(encontro, conteudo),
              ),
            ),
          )
        : null;

    final secoes = <Widget>[];
    void secao(IconData icone, String titulo, Widget filho) {
      secoes
        ..add(const SizedBox(height: BichuEspaco.e6))
        ..add(_Secao(icone: icone, titulo: titulo, child: filho));
    }

    if (cancelado) {
      secoes
        ..add(const SizedBox(height: BichuEspaco.e4))
        ..add(const _Margem(child: _AvisoDeCancelado()));
    }

    // QUANDO: o dia sempre; horario e calendario so com conteudo.
    secao(
      Icons.event_outlined,
      'Quando',
      _CaixaQuando(
        dia: encontro.dia,
        ano: ano,
        horario: conteudo?.horario,
        acao: conteudo != null && vivo
            ? OutlinedButton.icon(
                onPressed: () => _adicionarAoCalendario(conteudo),
                style: OutlinedButton.styleFrom(
                  minimumSize: const Size.fromHeight(BichuAlvoDeToque.critico),
                ),
                icon: const Icon(Icons.edit_calendar_outlined),
                label: const Text(TelaDoEncontro.rotuloDoCalendario),
              )
            : null,
      ),
    );

    if (conteudo != null) {
      secao(
        Icons.place_outlined,
        'Local',
        LocalDoEncontro(
          lugar: conteudo.lugar,
          ponto: cancelado ? const SoEndereco() : _ponto,
          enderecoPorExtenso: cancelado ? null : _endereco,
          distanciaEmMetros: distancia,
          aoTentarDeNovo: _carregarPonto,
        ),
      );
      secao(
        Icons.notes_outlined,
        'Sobre o evento',
        Text(conteudo.resumo, style: textos.bodyLarge),
      );
      // Links publicos: nao dependem de conta, e so aparecem os que vieram.
      // Sem nenhum dos dois, a secao inteira nao existe -- nada de moldura
      // vazia (pedido do cliente de 01/10).
      if (!cancelado &&
          (conteudo.urlDoConvite != null || conteudo.urlDoInstagram != null)) {
        secao(
          Icons.link_outlined,
          'Links',
          _Links(
            convite: conteudo.urlDoConvite,
            instagram: conteudo.urlDoInstagram,
            // `admission.kind` do contrato, lido pela sessao normal do
            // encontro: e ele que escolhe entre `Retirar` e `Comprar`.
            gratuito: conteudo.entrada.tipo == TipoDeEntrada.gratuito,
          ),
        );
      }
      if (!cancelado && conteudo.imagens.length > 1) {
        secao(
          Icons.photo_library_outlined,
          'Fotos',
          _Fotos(imagens: conteudo.imagens, urlsParaAmpliar: urlsParaAmpliar),
        );
      }
      if (vivo) {
        secao(Icons.pets_outlined, 'Para quais cachorros', _ParaQuaisCaes(c: conteudo));
        if (conteudo.oQueLevar.isNotEmpty) {
          secao(
            Icons.backpack_outlined,
            'O que levar',
            _OQueLevar(itens: conteudo.oQueLevar),
          );
        }
        secao(
          Icons.health_and_safety_outlined,
          'Cuidados no evento',
          _Cuidados(
            frases: TelaDoEncontro.cuidados(
              areaCercada: conteudo.areaCercadaParaSoltar,
            ),
          ),
        );
        final estrutura = <String>[
          if (conteudo.areaCercadaParaSoltar) 'Área cercada para cachorros soltos',
          for (final e in conteudo.estrutura) e.rotulo,
        ];
        if (estrutura.isNotEmpty) {
          secao(
            Icons.accessible_outlined,
            'Acessibilidade e estrutura',
            _ListaComVisto(itens: estrutura),
          );
        }
        final notas = conteudo.observacoes;
        if (notas != null) {
          secao(
            Icons.info_outline,
            'Observações',
            // Texto puro: nada vira link (contrato, `NetworkEventNotes`).
            Text(notas, style: textos.bodySmall),
          );
        }
      }
    }

    return <Widget>[
      capa,
      cabecalho,
      ?convidar,
      ...secoes,
    ];
  }

}

// ---------------------------------------------------------------------------
// As pecas da pagina
// ---------------------------------------------------------------------------

class _Margem extends StatelessWidget {
  const _Margem({required this.child});
  final Widget child;

  @override
  Widget build(BuildContext context) => Padding(
        padding: const EdgeInsets.symmetric(horizontal: BichuEspaco.e4),
        child: child,
      );
}

class _Secao extends StatelessWidget {
  const _Secao({required this.icone, required this.titulo, required this.child});

  final IconData icone;
  final String titulo;
  final Widget child;

  @override
  Widget build(BuildContext context) {
    final cores = BichuColors.of(context).cores;
    final textos = Theme.of(context).textTheme;
    return _Margem(
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: <Widget>[
          Row(
            children: <Widget>[
              ExcludeSemantics(child: Icon(icone, color: cores.primary)),
              const SizedBox(width: BichuEspaco.e2),
              Expanded(
                child: Semantics(
                  header: true,
                  child: Text(titulo, style: textos.titleMedium),
                ),
              ),
            ],
          ),
          const SizedBox(height: BichuEspaco.e3),
          child,
        ],
      ),
    );
  }
}

class _AvisoDeCancelado extends StatelessWidget {
  const _AvisoDeCancelado();

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
      child: Text(
        TelaDoEncontro.avisoDeCancelado,
        style: textos.bodyLarge?.copyWith(color: cores.textPrimary),
      ),
    );
  }
}

class _CaixaQuando extends StatelessWidget {
  const _CaixaQuando({
    required this.dia,
    required this.ano,
    required this.horario,
    required this.acao,
  });

  final DiaDoEncontro dia;
  final int ano;

  /// Nulo no privado nao aprovado: so a data, sem hora (24.16).
  final HorarioDoEncontro? horario;
  final Widget? acao;

  @override
  Widget build(BuildContext context) {
    final cores = BichuColors.of(context).cores;
    final textos = Theme.of(context).textTheme;
    final h = horario;
    return Container(
      width: double.infinity,
      padding: const EdgeInsets.all(BichuEspaco.e4),
      decoration: BoxDecoration(
        color: cores.surfaceAlt,
        borderRadius: BorderRadius.circular(BichuRaio.lg),
        border: Border.all(color: cores.outline, width: BichuBorda.hairline),
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: <Widget>[
          Row(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: <Widget>[
              BlocoDoDia(dia: dia, comFundo: false),
              const SizedBox(width: BichuEspaco.e4),
              Expanded(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: <Widget>[
                    Text(
                      dia.dataLonga(anoCorrente: ano),
                      style: textos.labelLarge?.copyWith(
                        color: cores.textPrimary,
                      ),
                    ),
                    if (h != null) ...<Widget>[
                      const SizedBox(height: BichuEspaco.e1),
                      Text(h.faixaComDuracao, style: textos.bodySmall),
                      const SizedBox(height: BichuEspaco.e1),
                      Text(
                        h.fuso.rotulo,
                        style: textos.labelSmall?.copyWith(
                          color: cores.textSecondary,
                        ),
                      ),
                    ],
                  ],
                ),
              ),
            ],
          ),
          if (acao != null) ...<Widget>[
            const SizedBox(height: BichuEspaco.e4),
            acao!,
          ],
        ],
      ),
    );
  }
}

/// A FAIXA `Fotos` DO DETALHE, e **cada miniatura abre o visualizador**.
///
/// ## O que mudou em 27/10/2026, e por que e aqui
///
/// A faixa existia e desenhava as oito fotos; **nenhuma delas tinha alvo de
/// toque**. Era `Image.network` solta, sem `InkWell` e sem `Semantics`: tocar
/// numa foto do evento nao fazia nada. Junto com a capa, que abria o
/// visualizador com UMA imagem, isso e a reclamacao do cliente de 26/10 por
/// inteiro -- *"quando tem mais do que uma nao esta trocando, nao tem a seta
/// que eu pedi para avancar e retroceder"*. **A seta existia; o que nao havia
/// era como chegar a ela.**
///
/// ## O INDICE E O ACORDO, e ele e de uma fonte so
///
/// [urlsParaAmpliar] tem **um elemento por item de [imagens], na mesma ordem**
/// (ver `ConteudoDoEncontro.urlsParaAmpliar`). E o que faz `inicial: i` abrir a
/// foto que a pessoa tocou, e nao a vizinha. As duas listas chegam da mesma
/// chamada em `_pagina`, e nao de duas expressoes.
///
/// ## Nao e carrossel NESTA faixa, e a diferenca e de produto
///
/// A `Loja` desenha um `PageView` com contador na propria pagina
/// (`produto_da_loja.dart`), porque la a foto E o produto. Aqui a foto e apoio:
/// a primeira dobra e a capa, a data e o lugar. Um `PageView` no meio da ficha
/// roubaria o arrasto vertical da pagina numa secao que tem seis vizinhas, e o
/// cliente pediu as setas **no ampliado** -- que e onde elas estao.
class _Fotos extends StatelessWidget {
  const _Fotos({required this.imagens, required this.urlsParaAmpliar});

  final List<ImagemDoEncontro> imagens;

  /// As derivadas GRANDES, na ordem de [imagens]. Ver a prosa desta classe.
  final List<String> urlsParaAmpliar;

  /// A miniatura: 144 dp de largura (pedido P-M6), 4:3.
  static const double _largura = 144;

  @override
  Widget build(BuildContext context) {
    final cores = BichuColors.of(context).cores;
    return SizedBox(
      height: _largura / proporcaoDaFoto,
      child: ListView.separated(
        scrollDirection: Axis.horizontal,
        itemCount: imagens.length,
        separatorBuilder: (_, _) => const SizedBox(width: BichuEspaco.e3),
        itemBuilder: (context, i) => _Miniatura(
          imagem: imagens[i],
          posicao: i + 1,
          total: imagens.length,
          largura: _largura,
          cores: cores,
          // **A GUARDA MORA AQUI, e nao dentro do `onTap`.** Miniatura sem
          // lugar no ampliado nao nasce botao: um `InkWell` que nao faz nada
          // ainda pinta respingo e ainda se anuncia como botao ao leitor de
          // tela. Mesma forma da capa, que tem o `if (urlDaCapa == null)`.
          aoTocar: i >= urlsParaAmpliar.length
              ? null
              : () => VisualizadorDeImagem.abrirVarias(
                    context,
                    urls: urlsParaAmpliar,
                    inicial: i,
                    textoAlternativo: imagens[i].textoAlternativo,
                  ),
        ),
      ),
    );
  }
}

/// UMA miniatura da faixa `Fotos`.
///
/// **UM no semantico, e nao dois.** `Image.network` ja publica
/// `semanticLabel`; um `Semantics` em volta dela sem `excludeSemantics` faria o
/// leitor de tela anunciar o nome da foto e depois o botao, como se fossem duas
/// coisas. A mesma forma da capa e da foto do local em `pagina_do_local.dart`:
/// o nome e o da foto, a funcao e `button`, e o que o toque FAZ vai em `hint`.
class _Miniatura extends StatelessWidget {
  const _Miniatura({
    required this.imagem,
    required this.posicao,
    required this.total,
    required this.largura,
    required this.cores,
    required this.aoTocar,
  });

  final ImagemDoEncontro imagem;
  final int posicao;
  final int total;
  final double largura;
  final BichuCores cores;

  /// **Nulo nao e botao.** Ver a guarda em `_Fotos`.
  final VoidCallback? aoTocar;

  @override
  Widget build(BuildContext context) {
    final foto = ClipRRect(
      borderRadius: BorderRadius.circular(BichuRaio.md),
      child: SizedBox(
        width: largura,
        child: Image.network(
          // A MINIATURA, e nao a capa de 1024 px. Esta galeria desenha
          // 144 dp em 4:3 (432 px a 3x) e baixava 1024 px -- cinco vezes o
          // dado que ela pinta, oito vezes numa galeria cheia. **O ampliado
          // pede a grande**, e e por isso que ele recebe lista propria.
          imagem.urlParaGaleria,
          fit: BoxFit.cover,
          semanticLabel: imagem.textoAlternativo,
          errorBuilder: (_, _, _) => ColoredBox(color: cores.surfaceSunken),
        ),
      ),
    );
    if (aoTocar == null) return foto;
    return Semantics(
      button: true,
      label: imagem.textoAlternativo.isEmpty
          ? TelaDoEncontro.nomeDaFoto(posicao: posicao, total: total)
          : imagem.textoAlternativo,
      hint: TelaDoEncontro.dicaDeAmpliarAFoto,
      excludeSemantics: true,
      child: InkWell(
        onTap: aoTocar,
        borderRadius: BorderRadius.circular(BichuRaio.md),
        child: foto,
      ),
    );
  }
}

class _Pilula extends StatelessWidget {
  const _Pilula({required this.texto, this.icone});

  final String texto;
  final IconData? icone;

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
      child: Row(
        mainAxisSize: MainAxisSize.min,
        children: <Widget>[
          if (icone != null) ...<Widget>[
            ExcludeSemantics(
              child: Icon(icone, size: BichuEspaco.e5, color: cores.primary),
            ),
            const SizedBox(width: BichuEspaco.e1),
          ],
          Flexible(
            child: Text(
              texto,
              style: textos.labelMedium?.copyWith(color: cores.textPrimary),
            ),
          ),
        ],
      ),
    );
  }
}

/// `Para quais cachorros`: portes, idade e `Vacinação em dia` (so quando exigida).
/// **Sem pilula de guia** (UX 28.7.2): a frase inteira esta em `Cuidados`.
class _ParaQuaisCaes extends StatelessWidget {
  const _ParaQuaisCaes({required this.c});

  final ConteudoDoEncontro c;

  @override
  Widget build(BuildContext context) {
    final todos = c.portesAceitos.length == Porte.values.length;
    final idade = c.idadeDosCaes;
    return Wrap(
      spacing: BichuEspaco.e2,
      runSpacing: BichuEspaco.e2,
      children: <Widget>[
        if (todos)
          const _Pilula(texto: 'Todos os portes')
        else
          for (final p in Porte.values)
            if (c.portesAceitos.contains(p)) _Pilula(texto: p.rotulo),
        if (idade != null) _Pilula(texto: idade.rotulo),
        if (c.vacinacaoExigida)
          const _Pilula(
            texto: 'Vacinação em dia',
            icone: Icons.check_circle_outline,
          ),
      ],
    );
  }
}

/// `O que levar`, em duas colunas, com o icone fixo de cada item (24.13.3).
class _OQueLevar extends StatelessWidget {
  const _OQueLevar({required this.itens});

  final List<ItemParaLevar> itens;

  static IconData icone(ItemParaLevar item) => switch (item) {
        ItemParaLevar.agua => Icons.water_drop_outlined,
        ItemParaLevar.poteDeAgua => Icons.water_drop_outlined,
        ItemParaLevar.saquinho => Icons.shopping_bag_outlined,
        ItemParaLevar.guia => Icons.link,
        ItemParaLevar.petisco => Icons.star_outline,
        ItemParaLevar.brinquedo => Icons.sports_baseball_outlined,
        ItemParaLevar.toalha => Icons.check_circle_outline,
        ItemParaLevar.carteiraDeVacinacao => Icons.check_circle_outline,
      };

  @override
  Widget build(BuildContext context) {
    final cores = BichuColors.of(context).cores;
    final textos = Theme.of(context).textTheme;
    return LayoutBuilder(
      builder: (context, limites) {
        final coluna = (limites.maxWidth - BichuEspaco.e3) / 2;
        return Wrap(
          spacing: BichuEspaco.e3,
          runSpacing: BichuEspaco.e2,
          children: <Widget>[
            for (final item in itens)
              SizedBox(
                width: coluna,
                child: Row(
                  children: <Widget>[
                    ExcludeSemantics(
                      child: Icon(
                        icone(item),
                        size: BichuEspaco.e5,
                        color: cores.primary,
                      ),
                    ),
                    const SizedBox(width: BichuEspaco.e2),
                    Expanded(child: Text(item.rotulo, style: textos.bodySmall)),
                  ],
                ),
              ),
          ],
        );
      },
    );
  }
}

/// `Cuidados no evento`, com marcador NEUTRO: um ponto de 8 dp em
/// `textSecondary`, sem o visto, que se lia como "feito" (24.17.1, item 1).
class _Cuidados extends StatelessWidget {
  const _Cuidados({required this.frases});

  final List<String> frases;

  @override
  Widget build(BuildContext context) {
    final cores = BichuColors.of(context).cores;
    final textos = Theme.of(context).textTheme;
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: <Widget>[
        for (final f in frases)
          Padding(
            padding: const EdgeInsets.only(bottom: BichuEspaco.e2),
            child: Row(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: <Widget>[
                Padding(
                  padding: const EdgeInsets.only(top: BichuEspaco.e2),
                  child: Container(
                    width: BichuEspaco.e2,
                    height: BichuEspaco.e2,
                    decoration: BoxDecoration(
                      color: cores.textSecondary,
                      shape: BoxShape.circle,
                    ),
                  ),
                ),
                const SizedBox(width: BichuEspaco.e3),
                Expanded(child: Text(f, style: textos.bodyMedium)),
              ],
            ),
          ),
      ],
    );
  }
}

class _ListaComVisto extends StatelessWidget {
  const _ListaComVisto({required this.itens});

  final List<String> itens;

  @override
  Widget build(BuildContext context) {
    final cores = BichuColors.of(context).cores;
    final textos = Theme.of(context).textTheme;
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: <Widget>[
        for (final i in itens)
          Padding(
            padding: const EdgeInsets.only(bottom: BichuEspaco.e2),
            child: Row(
              children: <Widget>[
                ExcludeSemantics(
                  child: Icon(
                    Icons.check_circle_outline,
                    size: BichuEspaco.e5,
                    color: cores.primary,
                  ),
                ),
                const SizedBox(width: BichuEspaco.e2),
                Expanded(child: Text(i, style: textos.bodyMedium)),
              ],
            ),
          ),
      ],
    );
  }
}

class _EsqueletoDoEncontro extends StatelessWidget {
  const _EsqueletoDoEncontro();

  @override
  Widget build(BuildContext context) {
    final cores = BichuColors.of(context).cores;
    return Semantics(
      label: 'Carregando o evento',
      child: AspectRatio(
        aspectRatio: proporcaoDaCapa,
        child: DecoratedBox(
          decoration: BoxDecoration(
            color: cores.surfaceSunken,
            borderRadius: BorderRadius.circular(BichuRaio.lg),
          ),
        ),
      ),
    );
  }
}

/// Os links publicos do encontro: uma linha por link, e so os que vieram.
///
/// **Sem moldura vazia**: a secao nao e montada quando os dois sao nulos, e
/// aqui cada linha depende do seu link. Abrem no navegador do aparelho.
class _Links extends StatelessWidget {
  const _Links({
    required this.convite,
    required this.instagram,
    required this.gratuito,
  });

  final Uri? convite;
  final Uri? instagram;

  /// Se a entrada deste encontro e `free`. Decide entre os dois rotulos de
  /// [rotuloDoConvite].
  final bool gratuito;

  /// O rotulo do link do ingresso, **nos dois estados** (cliente, 22/10/2026):
  /// *"O botao de comprar convite, deve ser alterado para Comprar Ingresso,
  /// porem caso o evento seja gratuito, temos que alterar para Retirar
  /// Ingresso."*
  ///
  /// **O CONDICIONAL NAO ESTA BLOQUEADO, e isto foi MEDIDO e nao suposto.** O
  /// contrato ja sabe se o encontro e gratuito: `NetworkEventAdmission.kind` e
  /// um enum fechado `[free, paid]` com `price` anulavel ao lado, o app o le em
  /// `EntradaDoEncontro.doJson` (`api/modelos_rede.dart`) e o expoe como
  /// `TipoDeEntrada.gratuito`/`.pago`. **Nenhum campo novo de servidor foi
  /// preciso**, e nenhuma linha de `openapi.yaml` mudou nesta edicao.
  ///
  /// `Convite` virou `Ingresso` nos DOIS ramos: o substantivo e dele, e deixar
  /// `Comprar convite` no ramo pago faria a mesma linha mudar de palavra com o
  /// preco.
  static String rotuloDoConvite({required bool gratuito}) =>
      gratuito ? 'Retirar Ingresso' : 'Comprar Ingresso';
  static const String rotuloDoInstagram = 'Instagram';
  static const String falhaAoAbrir = 'Não conseguimos abrir o link.';

  static Future<void> _abrir(BuildContext context, Uri link) async {
    final mensageiro = ScaffoldMessenger.maybeOf(context);
    final abriu = await SaidaDoApp.atual.abrirLink(link);
    if (!abriu) {
      mensageiro?.showSnackBar(const SnackBar(content: Text(falhaAoAbrir)));
    }
  }

  @override
  Widget build(BuildContext context) {
    final c = convite;
    final i = instagram;
    return Column(
      crossAxisAlignment: CrossAxisAlignment.stretch,
      children: <Widget>[
        if (c != null)
          _LinhaDeLink(
            rotulo: rotuloDoConvite(gratuito: gratuito),
            link: c,
          ),
        if (c != null && i != null) const SizedBox(height: BichuEspaco.e2),
        if (i != null) _LinhaDeLink(rotulo: rotuloDoInstagram, link: i),
      ],
    );
  }
}

class _LinhaDeLink extends StatelessWidget {
  const _LinhaDeLink({required this.rotulo, required this.link});

  final String rotulo;
  final Uri link;

  @override
  Widget build(BuildContext context) {
    return Semantics(
      button: true,
      label: rotulo,
      onTap: () => _Links._abrir(context, link),
      excludeSemantics: true,
      child: OutlinedButton(
        onPressed: () => _Links._abrir(context, link),
        style: OutlinedButton.styleFrom(
          minimumSize: const Size.fromHeight(BichuAlvoDeToque.critico),
        ),
        child: Row(
          mainAxisAlignment: MainAxisAlignment.center,
          children: <Widget>[
            Flexible(child: Text(rotulo)),
            const SizedBox(width: BichuEspaco.e2),
            const Icon(Icons.open_in_new, size: BichuEspaco.e5),
          ],
        ),
      ),
    );
  }
}
