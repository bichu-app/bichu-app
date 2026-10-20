import 'package:flutter/material.dart';
import 'package:go_router/go_router.dart';

import '../../acessibilidade/anunciar.dart';
import '../../api/falhas.dart';
import '../../api/mensagens_de_erro.dart';
import '../../api/modelos_caso.dart';
import '../../api/modelos_pet.dart';
import '../../api/problem.dart';
import '../../dispositivo/saida_do_app.dart';
import '../../escopo.dart';
import '../../formato/quando.dart';
import '../../perdido/rascunho_do_caso.dart';
import '../../roteamento/rotas.dart';
import '../../theme/bichu_colors.dart';
import '../../theme/bichu_tokens.g.dart';
import '../../widgets/convite_para_entrar.dart';
import '../../widgets/botao_primario.dart';
import '../../widgets/cartao_de_pet.dart';
import '../../widgets/faixa_de_aviso.dart';
import '../../widgets/folha_destrutiva.dart';
import '../../widgets/moldura.dart';
import '../../widgets/qr_da_plaquinha.dart';
import '../../widgets/saida_da_tela.dart';
import '../perdido/tela_de_quem_e_o_caso.dart';
import 'textos_do_detalhe.dart';

/// T.1 — Detalhe do pet (UX, secao 7.6.3).
///
/// ## Por que esta tela existe nesta entrega
///
/// **Ela e pre-requisito medido, e nao ampliacao de escopo por gosto.** O
/// criterio 1 da BICHUS-61 e o criterio 1 da BICHUS-60 comecam com a mesma
/// clausula -- _"Dado o detalhe do pet, quando ele abre logado como dono,
/// entao existe ..."_ -- e a ficha da BICHUS-60 declara a tela do UX como
/// "derivada do detalhe do pet". As duas historias penduram as acoes delas
/// numa tela que a BICHUS-62 listou, com todas as letras, em **Fora desta
/// historia**. Nenhuma outra historia a reivindica.
///
/// O que entra aqui e o **minimo que hospeda as duas acoes**, e nao a T.1
/// inteira. Ficam de fora, nomeados e nao esquecidos:
///
/// - **Documentos** e **Historico** (itens 6 e 7 da 7.6.3): nao ha rota no
///   contrato que os alimente;
/// - **`Transferir`**: virou historia propria, dita no "Fora desta historia"
///   da BICHUS-61;
/// - **A acao principal da barra fixa.** A 7.6.3 manda uma, e ela depende do
///   estado: `Marcar como perdida` (BICHUS-21), `Fazer a tag da coleira` e
///   `Ver o caso` (F3.3). O criterio 2 da BICHUS-62 proibe renderizar acao sem
///   destino, nem habilitada nem desabilitada. Entao esta tela **continua sem
///   barra de acao fixa**, e isso e o criterio sendo cumprido, nao esquecido.
///
///   **O que mudou em 18/10, e o que nao mudou.** O cliente pediu
///   `Marcar como perdido` **dentro da pagina do pet**, e ela entrou -- no
///   CORPO, logo abaixo da linha de identificacao, e nao numa barra. A acao
///   tem destino desde que a BICHUS-21 existe (`Rotas.marcarPerdido`), e o que
///   a trazia para ca era um pedido, nao a falta de destino. `Ver o caso`
///   continua sem destino alcancavel desta tela -- `Rotas.casoAberto` so monta
///   com o `ResultadoDaAbertura` que F3.2 produz --, e por isso o estado de
///   caso aberto aqui e **texto**, e nunca botao.
///
///   **`Fazer a tag da coleira` ganhou destino** (`TelaSolicitarPlaquinha`,
///   alcancada de `Pet cadastrado`). Escolher UMA das tres pelo estado, numa
///   barra, continua sendo desenho e nao conserto, e por isso a barra nao
///   nasceu aqui. O convite de [CartaoDePet.convitePlaquinha] tambem continua
///   sendo so texto.
///
/// ## O QR da plaquinha
///
/// Entrou no mesmo pedido de 18/10, abaixo dos campos. **O conteudo dele nao e
/// escolha desta tela**: a imagem vem desenhada de
/// `GET /pets/{petId}/tags/{tagId}/qr.png` e carrega `{base}/t/{codigo}`. O
/// raciocinio inteiro -- por que um QR so serve a camera comum e o leitor do
/// proprio app, por que o perfil publico `/@{slug}` nao serve, e por que o
/// rotulo acessivel nao pode ser o codigo -- esta em `QrDaPlaquinha`.
/// - **`Desativar a tag`** (criterio 1 da BICHUS-60), pelo mesmo teste e por
///   um motivo a mais: `revokePetTag` declara `reauth: []` com
///   `x-reauth-scope: tag_revocation`, e **o app nao tem reautenticacao**.
///   `POST /auth/reauth` esta no contrato e nao ha nada em `app/lib/api` que o
///   chame. Um botao ali receberia 401 `reauthentication-required` e morreria
///   sem saida. A maquinaria e a BICHUS-48.
///
/// ## `Editar` e `Excluir` ficam em texto, no fim
///
/// A 7.6.3 e explicita, e o motivo e de acessibilidade e nao de estetica: sao
/// acoes destrutivas, ficam **longe da acao principal e a mais de 16 dp de
/// qualquer outro alvo**, porque a proximidade produz deslize. Os 16 dp sao o
/// `target.gap-consequencia-alta` do 11.1, o mesmo numero que separa os dois
/// botoes da folha destrutiva.
class TelaDetalheDoPet extends StatefulWidget {
  const TelaDetalheDoPet({required this.petId, super.key});

  final String petId;

  @override
  State<TelaDetalheDoPet> createState() => _TelaDetalheDoPetState();
}

/// Os desfechos de uma abertura. **`foraDaConta` e um deles**, e nao um erro
/// generico: ele tem texto proprio e saida propria.
/// **`semConta` entrou em 20/10/2026, e e DIFERENTE de `foraDaConta`.**
///
/// `foraDaConta` e o 404 de "este pet nao e desta conta" (ADR-0021): quem esta
/// dentro, com conta, pedindo um pet que nao e dela. `semConta` e o 401 de
/// quem **nao tem sessao nenhuma** e chegou por link.
///
/// Os dois caiam no MESMO lugar errado, e nao no mesmo: o 401 nao e 404, entao
/// `_ehForaDaConta` devolvia falso e o 401 ia para `falha` -- com
/// `_textoDaFalha = ''`, porque o catalogo devolve texto vazio para
/// `unauthenticated` desde 18/10. A tela desenhava o icone de ERRO, nenhuma
/// frase e um `Atualizar`. Atualizar nao resolve um 401.
enum _Fase { carregando, carregado, foraDaConta, semConta, falha }

class _TelaDetalheDoPetState extends State<TelaDetalheDoPet> {
  _Fase _fase = _Fase.carregando;
  Pet? _pet;
  String? _textoDaFalha;

  /// O estado da imagem do QR. Nasce em [EstadoDoQrDaPlaquinha.carregando] e
  /// nao em `semTag`: enquanto a lista de tags nao voltou, a tela nao sabe se
  /// ha plaquinha, e afirmar que nao ha seria afirmar o que ela nao mediu.
  EstadoDoQrDaPlaquinha _estadoDoQr = EstadoDoQrDaPlaquinha.carregando;

  /// O provedor que o cofre devolveu. Ver `CofreDaImagemDoQr`: ele nao morre
  /// com a tela, e quem o limpa e a lista `limpezasAoSair` da sessao.
  ImageProvider? _qr;

  /// `code_suffix` da tag em vigor. E tudo o que o app tem do codigo depois de
  /// F1.6, e e com ele que o rotulo acessivel diz DE QUAL plaquinha e o QR.
  String _sufixoDaTag = '';

  /// Se este pet TEM pedido da plaquinha, e por isso se o link de
  /// acompanhamento tem para onde levar.
  ///
  /// **Nasce `false` e so vira `true` por leitura**, nunca por suposicao: ter
  /// plaquinha ativa nao quer dizer ter pedido, e oferecer o link sem pedido
  /// levaria a pessoa a uma pagina vazia -- acao sem destino e o que o
  /// criterio 2 da BICHUS-62 proibe. Enquanto a leitura nao volta, o link nao
  /// aparece; ele e informacao secundaria e nao vale segurar a tela por ele.
  bool _temPedidoDePlaquinha = false;

  /// Se o encerramento do caso esta em curso. Mantem o rotulo do botao
  /// visivel (paragrafo 11.20) e tira a acao dele.
  bool _encerrandoOCaso = false;

  /// O que deu errado ao encerrar, se deu. **Separado de [_textoDaFalha]**: um
  /// `POST` que falhou nao transforma o detalhe inteiro em tela de erro -- o
  /// pet carregou, e quem o leu continua lendo. Eram dois estados diferentes
  /// no mesmo campo, e o primeiro apagaria a pagina do segundo.
  String? _erroAoEncerrar;

  /// O caso que ESTA TELA acabou de encerrar, enquanto a janela de reabertura
  /// estiver aberta. Nulo e o estado normal.
  ///
  /// ## Por que ele vive na memoria desta tela, e nao numa leitura
  ///
  /// **Nao ha como descobrir, pelo contrato, o caso recem-encerrado de um pet.**
  /// `Pet` declara `open_case_id`, e so: depois do encerramento ele e nulo, e
  /// nenhum campo aponta para o caso que fechou. `GET /lost-cases/{caseId}`
  /// existe e serve, mas precisa do id -- que e exatamente o que a tela
  /// deixaria de ter. A resposta de `closeLostCase` e `LostCase` e traz as duas
  /// coisas que faltam, `id` e `reopen_deadline`, e e dela que este campo sai.
  ///
  /// **Consequencia honesta, e esta escrita de proposito:** quem sai da pagina
  /// e volta perde a oferta de reabrir, embora o servidor continue aceitando a
  /// reabertura pelos 7 dias. O caminho que resolveria isso e um campo novo no
  /// contrato (algo como `Pet.recently_closed_case`) ou uma listagem dos casos
  /// do pet, e nenhum dos dois existe -- inventar rota seria pior que a
  /// limitacao. O desfazer que o defeito medido pedia e o do toque por engano,
  /// e esse acontece com a tela na frente da pessoa.
  CasoDePerdido? _casoEncerradoAgora;

  /// O CASO ABERTO deste pet, lido do servidor. Nulo e o estado normal.
  ///
  /// ## Por que ele e uma LEITURA, e por que ela nao existia antes
  ///
  /// A acao de compartilhar precisa de duas coisas que `Pet` nao tem:
  /// `share_url` -- o endereco publico do caso -- e `area_label`, o lugar no
  /// teto de precisao que o ADR-0010 admite. As duas moram em `LostCase`, e
  /// `GET /lost-cases/{caseId}` e a unica porta do contrato que as entrega.
  ///
  /// **Esta leitura era impossivel ate 20/10/2026**, e nao por falta de
  /// vontade: `GET /pets/{petId}` devolvia `open_case_id` SEMPRE nulo (literal
  /// no mapeador do repositorio), entao a tela nunca tinha o `caseId` com que
  /// buscar. Medi isso em homologacao antes de escrever uma linha disto. Com
  /// aquele campo consertado, o `caseId` existe e esta leitura passa a ter
  /// sentido.
  ///
  /// **Nulo cobre TRES coisas diferentes, e as tres levam ao mesmo lugar** --
  /// sem acao de compartilhar:
  ///
  /// 1. o pet nao tem caso aberto (`open_case_id` nulo): a leitura nem sai;
  /// 2. a leitura saiu e falhou (rede, 404 de ADR-0021, corpo fora do
  ///    contrato);
  /// 3. o caso voltou **sem `share_url`** -- o interruptor do servidor, que e
  ///    o unico jeito de a pagina publica ser declarada existente.
  ///
  /// Nao vira fase de erro, pelo mesmo motivo de [_carregarOPedidoDaPlaquinha]:
  /// um pet que carregou nao pode virar "servidor fora" porque uma leitura
  /// secundaria caiu.
  CasoDePerdido? _casoAberto;

  /// O que deu errado ao abrir a FOLHA de compartilhamento, se deu.
  ///
  /// **Campo proprio**, e nao [_erroAoEncerrar]: os dois erros aparecem no
  /// mesmo trecho da tela e um sobreviveria ao outro no mesmo campo -- a faixa
  /// do encerramento ficaria explicando uma folha que nao abriu.
  String? _erroAoCompartilhar;

  /// Se a reabertura esta em curso. Mesmo papel de [_encerrandoOCaso].
  bool _reabrindoOCaso = false;

  /// O que deu errado ao REABRIR, se deu. **Campo proprio, e nao
  /// [_erroAoEncerrar]**: os dois erros aparecem em lugares diferentes da tela
  /// e um deles sobreviveria ao outro no mesmo campo -- a faixa do
  /// encerramento ficaria explicando uma reabertura que falhou.
  String? _erroAoReabrir;

  bool _iniciou = false;

  @override
  void didChangeDependencies() {
    super.didChangeDependencies();
    if (_iniciou) return;
    _iniciou = true;
    _carregar();
  }

  Future<void> _carregar() async {
    if (!mounted) return;
    setState(() {
      _fase = _Fase.carregando;
      _textoDaFalha = null;
    });
    try {
      final pet = await Escopo.of(context).pets.buscarPet(widget.petId);
      if (!mounted) return;
      setState(() {
        _pet = pet;
        _fase = _Fase.carregado;
      });
      // **Depois do pet, e nao junto.** O QR e informacao secundaria desta
      // tela: uma chamada em paralelo que falhasse antes do `GET /pets` faria
      // o bloco do QR aparecer com a decisao tomada sobre um pet que a tela
      // ainda nao tinha. E ela nao e `await`-ada por quem chama: o detalhe nao
      // espera a plaquinha para desenhar o animal.
      await _carregarOQr(pet);
      await _carregarOPedidoDaPlaquinha(pet);
      await _carregarOCasoAberto(pet);
    } on FalhaDeChamada catch (falha) {
      if (!mounted) return;
      setState(() {
        if (faltaConta(falha)) {
          // **ANTES de `_ehForaDaConta`**, e a ordem importa: sem conta o
          // servidor responde 401 e nao 404, e trocar a ordem daria o texto
          // de "este pet nao e seu" a quem nao tem conta nenhuma -- uma
          // afirmacao sobre a conta de alguem que nao tem uma.
          _fase = _Fase.semConta;
        } else if (_ehForaDaConta(falha)) {
          // **404 e a resposta de "nao e seu" tambem** (ADR-0021). A tela nao
          // tenta descobrir qual dos dois foi, e nao deve: a autorizacao mora
          // na clausula `WHERE` do servidor justamente para que as duas
          // respostas sejam indistinguiveis.
          _fase = _Fase.foraDaConta;
        } else {
          _textoDaFalha = MensagensDeErro.de(falha).texto;
          _fase = _Fase.falha;
        }
      });
    } on Object catch (erro, pilha) {
      // O QUE NAO E FalhaDeChamada. Sem este ramo a tela ficava em
      // `_Fase.carregando` para sempre, sem pet e sem saida.
      registrarFalhaInesperada(erro, pilha, onde: 'ao carregar o detalhe do pet');
      if (!mounted) return;
      setState(() {
        _textoDaFalha = MensagensDeErro.servidorFora;
        _fase = _Fase.falha;
      });
    }
  }

  /// Pergunta ao servidor se este pet tem pedido da plaquinha.
  ///
  /// **Serve a UMA decisao: mostrar ou nao o link de acompanhamento.** Por
  /// isso ela e a ultima chamada da tela e nenhuma falha dela muda a fase: um
  /// pet que carregou nao pode virar "servidor fora" porque a leitura
  /// secundaria caiu. Falhou? O link nao aparece, e o resto da pagina do pet
  /// -- o QR e `Marcar como perdido`, que chegaram hoje -- continua inteiro.
  ///
  /// **Nao e `pet.semTag` que decide.** Ter plaquinha ativa e ter PEDIDO sao
  /// coisas diferentes: a tag e emitida em F1.6, no cadastro, e o pedido do
  /// plastico e outro ato. Usar `semTag` aqui ofereceria o link para todo pet
  /// com tag, e a maioria deles nunca pediu nada.
  Future<void> _carregarOPedidoDaPlaquinha(Pet pet) async {
    try {
      final pedidos =
          await Escopo.of(context).pets.listarPedidosDePlaquinha(pet.id);
      if (!mounted) return;
      setState(() => _temPedidoDePlaquinha = pedidos.isNotEmpty);
    } on Object {
      // Silencioso DE PROPOSITO, e este e o unico lugar da tela em que isso
      // vale: o desfecho da falha e "nao ofereca o link", que ja e o estado
      // inicial. Uma faixa de erro aqui faria a pagina do pet reclamar de uma
      // leitura que a pessoa nem sabe que existe.
      if (!mounted) return;
      setState(() => _temPedidoDePlaquinha = false);
    }
  }

  /// Le o caso ABERTO do pet, quando ha um.
  ///
  /// **Nenhuma falha daqui muda a fase da tela**, e nenhuma delas aparece: o
  /// desfecho de toda falha e "nao ofereca compartilhar", que ja e o estado
  /// inicial. Uma faixa de erro aqui faria a pagina do pet reclamar de uma
  /// leitura que a pessoa nem sabe que existe -- a mesma decisao, pelo mesmo
  /// motivo, de [_carregarOPedidoDaPlaquinha].
  ///
  /// **Sem `open_case_id` a chamada nao sai.** Nao e economia: montar
  /// `/lost-cases//` seria 404, e perguntar pelo caso de um pet que nao tem
  /// caso e perguntar o que a resposta anterior ja respondeu.
  Future<void> _carregarOCasoAberto(Pet pet) async {
    final caseId = pet.idDoCasoAberto;
    if (caseId == null || caseId.isEmpty) {
      if (!mounted) return;
      setState(() => _casoAberto = null);
      return;
    }
    try {
      final caso = await Escopo.of(context).casos.buscarCaso(caseId);
      if (!mounted) return;
      setState(() => _casoAberto = caso);
    } on Object {
      // Silencioso DE PROPOSITO. `FalhaDeChamada` e o que nao e ela (corpo 200
      // fora do contrato estoura `TypeError` dentro de `CasoDePerdido.doJson`)
      // chegam aqui, e as duas produzem o mesmo: sem caso, sem acao.
      if (!mounted) return;
      setState(() => _casoAberto = null);
    }
  }

  /// `Compartilhar`: abre a FOLHA DO SISTEMA com o texto do caso.
  ///
  /// ## As duas guardas, e por que elas sao cinto e nao o desenho
  ///
  /// O desenho e [_Conteudo._linkDoCaso]: a acao **nao e desenhada** sem caso
  /// aberto e sem `share_url`. Estas duas linhas existem para o caso de alguem
  /// chamar isto de outro lugar depois -- e porque um `!` aqui diria menos.
  ///
  /// ## O que acontece quando a folha nao abre
  ///
  /// [SaidaDoApp.compartilharTexto] devolve `false` quando nao ha atividade que
  /// responda a `ACTION_SEND` ou o plugin nao esta no binario. A tela **diz**,
  /// numa faixa, em vez de ficar calada ou de deixar vazar uma excecao crua: um
  /// toque que nao faz nada e indistinguivel de um toque que nao chegou, e a
  /// pessoa toca de novo.
  ///
  /// **Nao ha tratamento de "WhatsApp nao instalado"**, e a ausencia e
  /// deliberada: quem decide o que a folha lista e o sistema, e nenhum
  /// aplicativo em particular e nosso para garantir. O cliente pediu a barra,
  /// e a barra mostra o que existe no aparelho.
  Future<void> _compartilharOCaso(Pet pet) async {
    final caso = _casoAberto;
    final url = caso?.urlDeCompartilhar;
    if (caso == null || url == null || url.isEmpty) return;

    final abriu = await SaidaDoApp.atual.compartilharTexto(
      texto: TextosDoDetalhe.mensagemDeCompartilhar(
        nome: pet.nome,
        // VERBATIM do servidor. Ver a prosa de `mensagemDeCompartilhar`: o app
        // nao compoe lugar, e e isso que impede uma rua de entrar no texto.
        rotuloDaArea: caso.rotuloDaArea,
        url: url,
      ),
      assunto: TextosDoDetalhe.assuntoDeCompartilhar(
        nome: pet.nome,
        rotuloDaArea: caso.rotuloDaArea,
      ),
    );
    if (!mounted || abriu) return;
    setState(() => _erroAoCompartilhar = TextosDoDetalhe.folhaNaoAbriu);
  }

  /// Busca a tag em vigor e, com o `tagId` dela, a IMAGEM do QR.
  ///
  /// ## Duas chamadas, e a primeira nao e desperdicio
  ///
  /// `GET /pets/{petId}` nao traz tag nenhuma: `Pet` tem `active_tag_count` e
  /// mais nada sobre a plaquinha. O `tagId` -- que e o que falta para montar o
  /// endereco de `qr.png` -- so sai de `GET /pets/{petId}/tags`.
  ///
  /// ## Por que a imagem vem do servidor, e nao de um gerador no aparelho
  ///
  /// Porque **o app nao tem o codigo**. Ele sai uma vez, em `issuePetTag`, na
  /// F1.6, e o contrato manda nao persistir; a lista devolve so os quatro
  /// ultimos. Um gerador de QR aqui nao teria o que codificar -- e o conteudo
  /// correto, `{base}/t/{codigo}`, e desenhado por
  /// `src/modules/tags/domain/qr-da-tag.ts`, que e tambem quem imprime a linha
  /// legivel, das duas de uma funcao so.
  ///
  /// `Image.network` nao serve, e nao e questao de estilo: a rota e
  /// `bearerAuth` e `reveals_credential`, e `Image.network` abre um
  /// `HttpClient` proprio sem por onde passar cabecalho. Quem busca e
  /// `ApiClient.baixarImagem`, que leva o `Bearer` **so** para a mesma origem
  /// de `API_BASE_URL`.
  Future<void> _carregarOQr(Pet pet) async {
    final escopo = Escopo.of(context);
    final api = escopo.api;
    final pets = escopo.pets;
    final cofre = escopo.cofreDoQr;

    // `active_tag_count == 0` dispensa a chamada: nao ha tag para listar, e a
    // area do QR ja sabe o que dizer. Economia de rede que nao muda o que a
    // pessoa le -- a lista voltaria vazia e levaria ao mesmo estado.
    if (pet.semTag) {
      if (!mounted) return;
      setState(() {
        _qr = null;
        _sufixoDaTag = '';
        _estadoDoQr = EstadoDoQrDaPlaquinha.semTag;
      });
      return;
    }

    setState(() {
      _qr = null;
      _estadoDoQr = EstadoDoQrDaPlaquinha.carregando;
    });

    try {
      final tags = await pets.listarTags(pet.id);
      TagDoPet? ativa;
      for (final tag in tags) {
        if (tag.ativa && tag.id.isNotEmpty) {
          ativa = tag;
          break;
        }
      }
      if (ativa == null) {
        // A contagem dizia que havia tag e a lista nao trouxe nenhuma ativa.
        // **Nao e falha**: e a mesma ausencia de `semTag`, descoberta um passo
        // depois, e o texto que vale e o mesmo.
        if (!mounted) return;
        setState(() {
          _sufixoDaTag = '';
          _estadoDoQr = EstadoDoQrDaPlaquinha.semTag;
        });
        return;
      }

      // Copiada para um local FINAL antes do `await`: dentro da closure do
      // `setState` a promocao de tipo de uma variavel mutavel se perde, e a
      // saida seria um `!` que diz menos do que esta linha.
      final TagDoPet tagAtiva = ativa;
      final bytes = await api.baixarImagem(
        pets.enderecoDaImagemDoQr(petId: pet.id, tagId: tagAtiva.id),
      );
      final provedor = await cofre.guardar(bytes);
      if (!mounted) return;
      setState(() {
        _qr = provedor;
        _sufixoDaTag = tagAtiva.sufixo;
        _estadoDoQr = EstadoDoQrDaPlaquinha.pronto;
      });
    } on FalhaDeChamada {
      // Os desfechos de `FalhaDeChamada` levam ao MESMO texto, pela mesma
      // razao de F1.6: para quem esta com o celular na mao, "401", "sem sinal"
      // e "410, tag revogada" produzem a mesma resposta -- tentar de novo. O
      // que a tela nao pode fazer e ficar calada.
      if (!mounted) return;
      setState(() {
        _qr = null;
        _estadoDoQr = EstadoDoQrDaPlaquinha.falhou;
      });
    } on Object catch (erro, pilha) {
      // O que nao e `FalhaDeChamada`: o cofre encosta no cache de imagem do
      // Flutter, e `PlatformException` de decodificacao cai aqui. Sem este
      // ramo o bloco ficaria girando para sempre.
      registrarFalhaInesperada(erro, pilha, onde: 'ao carregar o QR do pet');
      if (!mounted) return;
      setState(() {
        _qr = null;
        _estadoDoQr = EstadoDoQrDaPlaquinha.falhou;
      });
    }
  }

  /// `Marcar como perdido`, **reaproveitando o fluxo que ja existe**.
  ///
  /// ## Nada e reimplementado aqui
  ///
  /// O destino e o mesmo de `Perfil` > `Meus pets`: `Rotas.marcarPerdido`
  /// (F3.1) com um `RascunhoDoCaso` do pet. F3.0, a escolha de quem e o caso,
  /// **nao entra no caminho**, e isso nao e atalho: o cabecalho de
  /// `TelaDeQuemEOCaso` justifica a tela por prevenir "o deslize de marcar o
  /// pet errado quando ha mais de um", e aqui ha exatamente um -- o pet cuja
  /// pagina esta aberta. E o mesmo ramo que `Meus pets` toma com um pet so.
  ///
  /// ## O e-mail confirmado continua sendo exigido, e a recusa e a que existe
  ///
  /// Ela **nao** e duplicada aqui. Abrir caso exige canal de contato
  /// verificado, e quem diz isso e o servidor, em `blockers`: F3.2 desabilita
  /// o envio e mostra `canalDeContatoNaoVerificado` com o texto da secao 9 do
  /// UX e a saida `Confirmar meu e-mail`. Uma segunda recusa neste botao
  /// seria uma segunda fonte da mesma regra -- e a deste lado envelheceria no
  /// bolso de quem nao atualiza o app.
  void _marcarComoPerdido(Pet pet) {
    context.push(Rotas.marcarPerdido, extra: RascunhoDoCaso(pet: pet));
  }

  /// `Encontrei meu pet`: a ACAO INVERSA, pedida pelo cliente em 18/10/2026.
  ///
  /// ## Ela encerra o caso, e nao "desmarca" o pet
  ///
  /// Nao existe no contrato uma operacao que mexa em `pets.status` para tirar o
  /// `lost`. O que existe e `POST /lost-cases/{caseId}/close`
  /// (`closeLostCase`), e e **ela** que e a inversa de abrir: a abertura criou
  /// um caso, e o fim do caso e o que devolve o animal ao estado anterior.
  /// Procurar um `PATCH /pets/{id}` com `status: active` seria inventar rota.
  ///
  /// ## O desfecho e `reunited`, e o botao diz isso em portugues
  ///
  /// `outcome` e obrigatorio e o contrato escreve por que: *"o desfecho e o
  /// instrumento de medicao do produto: sem ele a metrica de reencontro nao
  /// existe"*. Dos tres valores, este botao manda **um** -- `reunited` --
  /// porque e o que o rotulo promete. `not_found` ("desisti de procurar") e
  /// `false_alarm` ("abri por engano") sao outras duas perguntas, e
  /// `false_alarm` o contrato so oferece com o caso tendo menos de 6 h e nenhum
  /// aviso ou candidato -- tres numeros que esta tela nao tem em maos (eles
  /// saem de `GET /lost-cases/{caseId}`). Um menu de tres opcoes nao foi
  /// pedido, e enfiar `reunited` num botao chamado "desmarcar" gravaria
  /// "reencontrado" sobre casos que ninguem resolveu.
  ///
  /// `reunion_channel` nao vai: ver `CasosApi.encerrarCaso`. Esta tela nao sabe
  /// se o animal voltou pela tag, pelo alerta, pelo cartaz ou sozinho, e
  /// inventar o canal poria atribuicao falsa numa metrica de produto.
  ///
  /// ## Depois do 200, a tela LE o pet de novo
  ///
  /// Porque a resposta e `LostCase`, e nao `Pet`: ela nao diz nada sobre
  /// `status` nem sobre `open_case_id`, que sao os dois campos que esta tela le
  /// para decidir o que mostrar. Virar o estado local sem reler seria a tela
  /// afirmando um pet que ela nao mediu -- e se o servidor tivesse encerrado o
  /// caso sem mudar o pet, a proxima abertura da pagina contaria outra
  /// historia.
  ///
  /// **A falha da releitura nao vira falha do encerramento**, e a ordem dos
  /// `setState` e o que garante isso: o caso FOI encerrado, e dizer "nao deu"
  /// sobre o que deu seria a mentira que custa mais neste produto.
  Future<void> _encontreiMeuPet(Pet pet) async {
    final caseId = pet.idDoCasoAberto;
    // **Sem `caseId` nao ha o que encerrar.** O botao so e desenhado com caso
    // aberto, e esta guarda e o cinto: `status: lost` sem `open_case_id` e um
    // servidor inconsistente, e montar `/lost-cases//close` seria 404.
    if (caseId == null || caseId.isEmpty) return;

    // **NADA ACONTECE SEM A FOLHA CONFIRMAR**, e isto e o fecho do defeito
    // medido: `Encontrei meu pet` era UM TOQUE que encerrava o caso, sem
    // confirmacao e sem desfazer. O `POST` mora depois deste `if`; cancelar, o
    // gesto de voltar do sistema e o arrasto para baixo nao chegam nele
    // (`_confirmarEncerramento` traduz nulo para `false`).
    if (!await _confirmarEncerramento(pet)) return;
    if (!mounted) return;

    final escopo = Escopo.of(context);
    setState(() {
      _encerrandoOCaso = true;
      _erroAoEncerrar = null;
    });

    final CasoDePerdido encerrado;
    try {
      // A resposta e GUARDADA, e nao descartada: `LostCase` traz `id` e
      // `reopen_deadline`, que sao as duas unicas coisas que tornam o desfazer
      // possivel -- nenhum campo de `Pet` aponta para o caso que fechou.
      encerrado = await escopo.casos.encerrarCaso(
        caseId: caseId,
        desfecho: DesfechoDoCaso.reencontrado,
      );
    } on FalhaDeChamada catch (falha) {
      if (!mounted) return;
      setState(() {
        _encerrandoOCaso = false;
        _erroAoEncerrar = MensagensDeErro.de(falha).texto;
      });
      return;
    } on Object catch (erro, pilha) {
      // O `catch (FalhaDeChamada)` acima parece exaustivo e nao e: corpo 200
      // fora do contrato estoura `TypeError` dentro de `CasoDePerdido.doJson`.
      // Sem este ramo o botao ficaria girando para sempre com o erro engolido.
      registrarFalhaInesperada(erro, pilha, onde: 'ao encerrar o caso do pet');
      if (!mounted) return;
      setState(() {
        _encerrandoOCaso = false;
        _erroAoEncerrar = MensagensDeErro.servidorFora;
      });
      return;
    }

    // **O pet nao pode sobreviver como `Perdido` no cache de `Meus pets`.**
    // Mesma razao da exclusao: a lista recarrega ao voltar a ficar visivel, mas
    // se esse `GET` falhar ela cai no cache -- e a pessoa veria, de volta na
    // lista, o selo de perdido num animal que ela acabou de dizer que voltou.
    escopo.cacheDeMeusPets.limpar();

    if (!mounted) return;
    anunciar(context, TextosDoDetalhe.casoEncerrado(pet.nome));
    // A oferta de reabrir nasce AQUI, da resposta do encerramento. Ela e
    // condicionada ao prazo na hora de desenhar, e nao aqui: a tela pode ficar
    // aberta mais que a janela.
    setState(() {
      _casoEncerradoAgora = encerrado;
      _erroAoReabrir = null;
      // **O CASO ABERTO DEIXA DE EXISTIR AQUI, e nao na releitura do pet.**
      //
      // Esta linha e o terceiro estado do pedido do cliente: compartilhar um pet
      // REENCONTRADO manda a vizinhanca procurar um animal que esta em casa.
      // Ela nao espera o `GET /pets` abaixo de proposito -- aquela releitura
      // pode falhar, e o `catch` dela deixa a tela com o pet ANTIGO, que ainda
      // tem `open_case_id`. Sem esta linha, a janela entre o 200 do
      // encerramento e uma releitura que falhou seria exatamente o momento em
      // que a tela segura um caso com `share_url` valido e oferece
      // compartilha-lo -- com o caso ja fechado no servidor.
      //
      // `_casoEncerradoAgora` recebe o caso encerrado logo acima e TEM
      // `share_url`. Ele serve a oferta de reabrir, e nunca a de compartilhar:
      // sao dois campos de proposito.
      _casoAberto = null;
      _erroAoCompartilhar = null;
    });

    try {
      final atualizado = await escopo.pets.buscarPet(widget.petId);
      if (!mounted) return;
      setState(() {
        _pet = atualizado;
        _encerrandoOCaso = false;
      });
    } on Object {
      // A releitura falhou DEPOIS de o caso ter sido encerrado. O botao para de
      // girar e o erro **nao** aparece: nao houve erro na acao que a pessoa
      // pediu. O que fica na tela e o pet do jeito que ele estava, e a proxima
      // abertura o le de novo.
      if (!mounted) return;
      setState(() => _encerrandoOCaso = false);
    }
  }

  /// A FOLHA DE CONFIRMACAO do encerramento. Devolve **se a pessoa confirmou**.
  ///
  /// ## Por que ela existe
  ///
  /// `Encontrei meu pet` chamava `closeLostCase` no primeiro toque. Encerrar
  /// tira o pet da lista publica, fecha a pagina publica do caso e poe as
  /// conversas abertas em modo leitura -- e nada disso estava escrito em
  /// lugar nenhum antes do toque. O criterio e o 11.9 do design system: acao de
  /// consequencia alta confirma antes, e a folha diz o que vai acontecer.
  ///
  /// ## Por que NAO e a [FolhaDestrutiva]
  ///
  /// Porque isto nao e destruicao. O 24.17.6 e explicito na distincao, e a
  /// `encontro_da_rede.dart` ja a aplica com estas palavras: *"Secundaria e nao
  /// Perigo: desistir nao apaga nada da pessoa e pode ser refeito"*. Encerrar o
  /// caso **nao apaga nada** e e reversivel por 7 dias (`reopenLostCase`, que
  /// agora existe). Um icone de alerta em `error` e um botao `urgency` sobre a
  /// melhor noticia do produto -- o animal voltou -- seria a tinta errada, e
  /// alem de feia e imprecisa: ela diz "cuidado, isto nao volta" sobre algo que
  /// volta.
  ///
  /// A INVERSAO das acoes continua, porem, e por outro motivo: a confirmacao e
  /// a de baixo, e `Ainda nao encontrei` e a de cima com o alvo grande. Quem
  /// fecha a folha no susto, sem ler, acerta o botao que nao encerra.
  ///
  /// ## O TEXTO NAO AFIRMA QUE ALGUEM FOI AVISADO
  ///
  /// Ver `TextosDoDetalhe.oQueAconteceAoEncerrar`: a frase da conversa diz que
  /// ela **para de aceitar mensagem** e que quem ajudou ve isso ao abrir a
  /// conversa. Nao diz "sera notificado", porque nao e verdade -- nenhuma
  /// mensagem de sistema e gravada no encerramento, o estado da conversa e
  /// DERIVADO na leitura, e o push nao sai (bloqueado em producao por permissao
  /// da conta de servico, e inexistente no iPhone do cliente). Esta casa ja
  /// pagou por tres lugares afirmando juntos um aviso que nao acontecia.
  Future<bool> _confirmarEncerramento(Pet pet) async {
    final confirmou = await showModalBottomSheet<bool>(
      context: context,
      showDragHandle: true,
      useSafeArea: true,
      isScrollControlled: true,
      builder: (contexto) => _FolhaDoEncerramento(
        titulo: TextosDoDetalhe.tituloDoEncerramento(pet.nome),
        corpo: TextosDoDetalhe.corpoDoEncerramento(pet.nome),
        oQueAcontece: TextosDoDetalhe.oQueAconteceAoEncerrar(pet.nome),
        rotuloDeConfirmar: TextosDoDetalhe.confirmarEncerramento,
        rotuloAcessivelDeConfirmar:
            TextosDoDetalhe.confirmarEncerramentoAcessivel(pet.nome),
        rotuloDeCancelar: TextosDoDetalhe.naoEncontreiAinda,
      ),
    );
    // Nulo e o gesto de voltar e o arrasto para baixo. Os dois sao cancelar.
    // Um `?? true` nesta linha transformaria o gesto de voltar do sistema num
    // confirmador de encerramento, e seria invisivel na revisao -- e o
    // cabecalho de `FolhaDestrutiva` ja registra exatamente este risco.
    return confirmou ?? false;
  }

  /// `Reabrir o caso`: o desfazer que o contrato prometia e que nao existia.
  ///
  /// ## Depois do 200, a tela RELE o pet -- pela mesma razao do encerramento
  ///
  /// A resposta e `LostCase`, e nao `Pet`: ela nao diz nada sobre `status` nem
  /// sobre `open_case_id`, que sao os dois campos que esta tela le para decidir
  /// o que mostrar. Virar o estado local sem reler seria a tela afirmando um
  /// pet que ela nao mediu. E o cache de `Meus pets` e limpo pelo motivo
  /// inverso do encerramento: a lista guarda o pet como `Ativo`, e a pessoa
  /// veria, de volta nela, um animal sem selo de perdido que acabou de voltar
  /// a ser procurado.
  ///
  /// ## A falha da releitura NAO vira falha da reabertura
  ///
  /// Mesma ordem de `setState` do encerramento, e pelo mesmo motivo: o caso FOI
  /// reaberto, e dizer "nao deu" sobre o que deu e a mentira que custa mais
  /// neste produto.
  ///
  /// ## A oferta de reabrir SAI da tela depois do 200
  ///
  /// `_casoEncerradoAgora` volta a nulo: o caso esta aberto, e o prazo daquele
  /// encerramento nao existe mais (o servidor devolve `reopen_deadline: null`).
  /// Manter o botao ofereceria uma segunda reabertura de um caso aberto.
  Future<void> _reabrirOCaso(CasoDePerdido caso) async {
    final escopo = Escopo.of(context);
    setState(() {
      _reabrindoOCaso = true;
      _erroAoReabrir = null;
    });

    try {
      await escopo.casos.reabrirCaso(caso.id);
    } on FalhaDeChamada catch (falha) {
      if (!mounted) return;
      setState(() {
        _reabrindoOCaso = false;
        _erroAoReabrir = MensagensDeErro.de(falha).texto;
      });
      return;
    } on Object catch (erro, pilha) {
      // Corpo 200 fora do contrato estoura `TypeError` dentro de
      // `CasoDePerdido.doJson`. Sem este ramo o botao giraria para sempre com
      // o erro engolido -- o mesmo ramo que o encerramento tem, e pela mesma
      // razao.
      registrarFalhaInesperada(erro, pilha, onde: 'ao reabrir o caso do pet');
      if (!mounted) return;
      setState(() {
        _reabrindoOCaso = false;
        _erroAoReabrir = MensagensDeErro.servidorFora;
      });
      return;
    }

    escopo.cacheDeMeusPets.limpar();

    if (!mounted) return;
    anunciar(context, TextosDoDetalhe.casoReaberto(_pet?.nome ?? ''));
    setState(() {
      _casoEncerradoAgora = null;
      _erroAoEncerrar = null;
    });

    try {
      final atualizado = await escopo.pets.buscarPet(widget.petId);
      if (!mounted) return;
      setState(() {
        _pet = atualizado;
        _reabrindoOCaso = false;
      });
      // O caso voltou a estar aberto, e a acao de compartilhar volta a fazer
      // sentido -- mas ela so volta se o servidor confirmar, relendo. O caso
      // que a reabertura devolveu nao e aproveitado aqui de proposito: `Pet` e
      // quem diz se ha caso aberto, e e com o `open_case_id` dele que esta
      // leitura casa.
      await _carregarOCasoAberto(atualizado);
    } on Object {
      if (!mounted) return;
      setState(() => _reabrindoOCaso = false);
    }
  }

  bool _ehForaDaConta(FalhaDeChamada falha) =>
      falha is FalhaDaApi &&
      (falha.problem.tipo == ProblemTipo.naoEncontrado ||
          falha.problem.status == 404);

  /// Abre a edicao e **recarrega com o que ela devolveu**.
  ///
  /// A tela de edicao entrega o [Pet] ja atualizado pela resposta do `PATCH`:
  /// pintar esse valor evita um `GET` a mais e, principalmente, evita a
  /// janela em que a tela mostra o dado velho depois de a pessoa ter salvado.
  Future<void> _editar() async {
    final pet = _pet;
    if (pet == null) return;
    final atualizado = await context.push<Pet>(
      Rotas.editarPetDe(pet.id),
      extra: pet,
    );
    if (!mounted || atualizado == null) return;
    setState(() => _pet = atualizado);
  }

  /// A exclusao (BICHUS-60).
  ///
  /// **Nada acontece sem a folha confirmar.** O `DELETE` mora dentro do
  /// `aoConfirmar`, que so e chamado pelo botao destrutivo: cancelar, o gesto
  /// de voltar e o arrasto para baixo nao chegam nele.
  Future<void> _excluir() async {
    final pet = _pet;
    if (pet == null) return;
    final escopo = Escopo.of(context);

    final excluiu = await mostrarFolhaDestrutiva(
      context,
      titulo: TextosDoDetalhe.tituloDaExclusao(pet.nome),
      corpo: TextosDoDetalhe.corpoDaExclusao(pet.nome),
      oQueSome: TextosDoDetalhe.oQueSome(pet),
      // Criterio 4: so quando ha caso aberto.
      avisoExtra: pet.idDoCasoAberto == null
          ? null
          : TextosDoDetalhe.casoAbertoSeraEncerrado(pet.nome),
      rotuloDeConfirmar: TextosDoDetalhe.confirmarExclusao,
      rotuloAcessivelDeConfirmar:
          TextosDoDetalhe.confirmarExclusaoAcessivel(pet.nome),
      aoConfirmar: () => escopo.pets.excluirPet(pet.id),
    );
    if (!mounted || !excluiu) return;

    // **O pet excluido nao pode sobreviver no cache de `Meus pets`.**
    //
    // `CacheDeMeusPets` guarda a ultima lista lida, e ela ainda contem este
    // pet. A lista recarrega ao voltar a ficar visivel, mas se esse `GET`
    // falhar ela cai no cache -- e a pessoa veria, de volta na lista, o pet
    // que acabou de confirmar a exclusao, sem nada explicando. Limpar e a
    // operacao segura: ela nunca expoe dado de outra conta, e o pior desfecho
    // dela e a tela mostrar a falha com `Atualizar` em vez de um pet apagado.
    //
    // **Nao entra entrada nova em `limpezasAoSair`**: este cache ja esta
    // registrado la (`app.dart`), e esta historia nao cria cache nenhum.
    escopo.cacheDeMeusPets.limpar();

    if (!mounted) return;
    anunciar(context, TextosDoDetalhe.excluido(pet.nome));
    context.go(Rotas.perfil);
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: BarraDeConta(
        titulo: _pet?.nome ?? '',
        saida: TipoDeSaida.voltar,
      ),
      body: SafeArea(child: _corpo()),
    );
  }

  Widget _corpo() {
    return switch (_fase) {
      _Fase.carregando => const Center(child: CircularProgressIndicator()),
      _Fase.foraDaConta => _ForaDaConta(),
      // SEM CONTA NAO E ERRO, e nao tem `Atualizar`.
      _Fase.semConta => const Padding(
          padding: EdgeInsets.all(BichuEspaco.e4),
          child: ConviteParaEntrar(secao: SecaoComConta.paginaDoPet),
        ),
      // `_textoDaFalha` nunca e nulo nesta fase: quem a liga sempre o
      // preenche por `MensagensDeErro.de`, que devolve texto para toda falha.
      _Fase.falha => _Falha(
          texto: _textoDaFalha!,
          aoTentarDeNovo: _carregar,
        ),
      _Fase.carregado => _Conteudo(
          pet: _pet!,
          aoEditar: _editar,
          aoExcluir: _excluir,
          estadoDoQr: _estadoDoQr,
          qr: _qr,
          sufixoDaTag: _sufixoDaTag,
          aoTentarOQr: () => _carregarOQr(_pet!),
          aoMarcarPerdido: () => _marcarComoPerdido(_pet!),
          aoEncontrarOPet: () => _encontreiMeuPet(_pet!),
          encerrandoOCaso: _encerrandoOCaso,
          erroAoEncerrar: _erroAoEncerrar,
          casoEncerradoAgora: _casoEncerradoAgora,
          reabrindoOCaso: _reabrindoOCaso,
          erroAoReabrir: _erroAoReabrir,
          aoReabrirOCaso: () {
            final caso = _casoEncerradoAgora;
            if (caso != null) _reabrirOCaso(caso);
          },
          casoAberto: _casoAberto,
          erroAoCompartilhar: _erroAoCompartilhar,
          aoCompartilhar: () => _compartilharOCaso(_pet!),
          temPedidoDePlaquinha: _temPedidoDePlaquinha,
          aoAcompanharPlaquinha: () =>
              context.push(Rotas.acompanharPlaquinhaDe(_pet!.id)),
        ),
    };
  }
}

/// O pet que a conta nao tem (ADR-0021).
class _ForaDaConta extends StatelessWidget {
  @override
  Widget build(BuildContext context) {
    final cores = BichuColors.of(context).cores;
    final textos = Theme.of(context).textTheme;
    return Padding(
      padding: const EdgeInsets.all(BichuEspaco.e4),
      child: Column(
        mainAxisAlignment: MainAxisAlignment.center,
        children: <Widget>[
          Text(
            TextosDoDetalhe.petForaDaConta,
            style: textos.titleLarge,
            textAlign: TextAlign.center,
          ),
          const SizedBox(height: BichuEspaco.e3),
          Text(
            TextosDoDetalhe.petForaDaContaExplicacao,
            style: textos.bodyMedium?.copyWith(color: cores.textSecondary),
            textAlign: TextAlign.center,
          ),
        ],
      ),
    );
  }
}

class _Falha extends StatelessWidget {
  const _Falha({required this.texto, required this.aoTentarDeNovo});

  final String texto;
  final VoidCallback aoTentarDeNovo;

  @override
  Widget build(BuildContext context) {
    return Padding(
      padding: const EdgeInsets.all(BichuEspaco.e4),
      child: FaixaDeAviso(
        texto: texto,
        rotuloDaAcao: 'Atualizar',
        aoTocarNaAcao: aoTentarDeNovo,
      ),
    );
  }
}

/// O corpo de T.1, na ordem da 7.6.3.
class _Conteudo extends StatelessWidget {
  const _Conteudo({
    required this.pet,
    required this.aoEditar,
    required this.aoExcluir,
    required this.estadoDoQr,
    required this.qr,
    required this.sufixoDaTag,
    required this.aoTentarOQr,
    required this.aoMarcarPerdido,
    required this.aoEncontrarOPet,
    required this.encerrandoOCaso,
    required this.erroAoEncerrar,
    required this.casoEncerradoAgora,
    required this.reabrindoOCaso,
    required this.erroAoReabrir,
    required this.aoReabrirOCaso,
    required this.casoAberto,
    required this.erroAoCompartilhar,
    required this.aoCompartilhar,
    required this.temPedidoDePlaquinha,
    required this.aoAcompanharPlaquinha,
  });

  final Pet pet;
  final VoidCallback aoEditar;
  final VoidCallback aoExcluir;
  final EstadoDoQrDaPlaquinha estadoDoQr;
  final ImageProvider? qr;
  final String sufixoDaTag;
  final VoidCallback aoTentarOQr;
  final VoidCallback aoMarcarPerdido;

  /// `Encontrei meu pet`: a acao inversa (cliente, 18/10/2026).
  final VoidCallback aoEncontrarOPet;

  final bool encerrandoOCaso;

  /// O que deu errado ao encerrar, se deu. Nulo e o estado normal.
  final String? erroAoEncerrar;

  /// O caso que ESTA SESSAO DE TELA encerrou, se encerrou. Ver o campo de mesmo
  /// nome no estado: ele e a unica fonte do `id` e do `reopen_deadline` que a
  /// reabertura precisa, porque `Pet` nao aponta para o caso que fechou.
  final CasoDePerdido? casoEncerradoAgora;

  final bool reabrindoOCaso;

  /// O que deu errado ao REABRIR, se deu. Nulo e o estado normal.
  final String? erroAoReabrir;

  final VoidCallback aoReabrirOCaso;

  /// O caso ABERTO deste pet, quando o servidor o entregou. Ver o campo de
  /// mesmo nome no estado: nulo cobre "nao tem caso", "nao consegui ler" e
  /// "o caso veio sem `share_url`".
  final CasoDePerdido? casoAberto;

  /// O que deu errado ao abrir a folha de compartilhamento. Nulo e o normal.
  final String? erroAoCompartilhar;

  final VoidCallback aoCompartilhar;

  /// Se ha pedido da plaquinha para este pet. Ver o campo de mesmo nome no
  /// estado da tela: `false` tambem e o que a leitura que falhou produz.
  final bool temPedidoDePlaquinha;
  final VoidCallback aoAcompanharPlaquinha;

  /// Se o pet **ja** esta sendo procurado.
  ///
  /// Le os DOIS campos, e nao um: `status` e o que `TelaDeQuemEOCaso.elegiveis`
  /// usa para tirar o animal da escolha, e `open_case_id` e o que a folha de
  /// exclusao usa para avisar que a exclusao encerra o caso. Os dois dizem a
  /// mesma coisa quando o servidor esta consistente; ler um so faria esta tela
  /// oferecer `Marcar como perdido` no dia em que o outro chegasse preenchido
  /// sozinho, e o desfecho seria um 409 `pet-already-lost` depois de duas
  /// telas -- exatamente o que o criterio 13 existe para evitar.
  bool get _jaProcurado =>
      pet.status == StatusDoPet.perdido || pet.idDoCasoAberto != null;

  /// O ENDERECO PUBLICO do caso, ou `null` quando nao ha o que compartilhar.
  ///
  /// ## Este getter E o interruptor, e ele tem tres travas em serie
  ///
  /// 1. **Caso aberto.** Sem [casoAberto] nao ha endereco: pet que nao esta
  ///    perdido nao tem o que compartilhar. E `casoAberto` e nulo tambem
  ///    enquanto a leitura nao voltou, o que mantem a acao escondida durante o
  ///    carregamento em vez de piscar.
  /// 2. **Caso ABERTO de verdade**, e nao qualquer caso: `status == 'open'`. O
  ///    pet reencontrado e o terceiro estado do pedido, e ele e o mais caro dos
  ///    tres -- compartilhar depois de o animal voltar manda a vizinhanca
  ///    procurar quem esta em casa. A tela ja limpa `_casoAberto` ao encerrar;
  ///    esta linha e a segunda trava, para o caso de o servidor devolver um
  ///    caso fechado por aqui.
  /// 3. **`share_url` PRESENTE.** E o interruptor do servidor, e ele e a razao
  ///    de este getter devolver um endereco em vez de um booleano.
  ///
  /// ## Por que a AUSENCIA do endereco e o interruptor, e nao uma bandeira
  ///
  /// **MEDIDO em 20/10/2026**, de fora, nos dois ambientes: `GET /p/<token>`
  /// responde **404** em `hml.bichu.app` e em `bichu.app`, e `web/src/pages/`
  /// nao tem a pasta `p/`. O cartao de pre-visualizacao que aquele 404 serve
  /// diz, com estas letras, `og:title: Pagina nao encontrada · Bichu` -- ou
  /// seja, o link compartilhado afirmaria num grupo de bairro que a pagina do
  /// pet nao existe. O cliente decidiu construir o app antes do site, e a
  /// condicao foi que a acao nascesse DESLIGADA e acendesse sem APK novo.
  ///
  /// Quem acende e `site_page_availability` (migracao `20261020000010`): um
  /// `UPDATE ... SET is_published = true`, com a API de pe, e `share_url` passa
  /// a sair. Enquanto ele disser `false`, o campo **nao vem**, e sem campo nao
  /// ha acao.
  ///
  /// Uma bandeira booleana ao lado do endereco poderia DISCORDAR do endereco, e
  /// alguem teria de decidir qual dos dois manda. O endereco nao discorda de si
  /// mesmo. E o app **nao tem como remonta-lo**: `LostCase` nao carrega
  /// `share_token`, so `id`, que e UUID e que o ADR-0010 item 6 proibe em saida
  /// publica. Nao existe atalho, nem por descuido de quem escrever a tela
  /// depois.
  String? get _linkDoCaso {
    final caso = casoAberto;
    if (caso == null) return null;
    if (caso.status != 'open') return null;
    final url = caso.urlDeCompartilhar;
    if (url == null || url.isEmpty) return null;
    return url;
  }

  /// A ACAO DE ESTADO DO ANIMAL, nas DUAS direcoes e com **aparencia
  /// diferente em cada uma** (cliente, 18/10/2026).
  ///
  /// O cliente pediu as tres coisas de uma vez: *"nao tem uma opcao de
  /// desmarcar como perdido ou que foi encontrado"* e *"esse botao deve ter um
  /// padrao visual diferente quando estiver perdido e quando nao estiver"*.
  ///
  /// ## O QUE MUDOU, E O QUE NAO MUDOU
  ///
  /// O paragrafo que estava aqui justificava a AUSENCIA de botao com caso
  /// aberto, e a justificativa continua valendo **para a acao que ela falava
  /// de**: `Marcar como perdido` nao vira botao desabilitado com caso aberto --
  /// o teto e de um caso por pet (criterio 8 da BICHUS-21) e o criterio 13
  /// manda a tela refletir o teto em vez de deixar a pessoa bater nele, que
  /// seria um 409 `pet-already-lost` depois de duas telas.
  ///
  /// O que entrou nao e aquela acao habilitada de novo: e **outra acao**, com
  /// outro destino (`closeLostCase`), que so existe com caso aberto. O estado
  /// que antes nao tinha controle nenhum passou a ter o controle dele.
  ///
  /// **`Ver o caso` continua sem existir**, e continua nao sendo esquecimento:
  /// `Rotas.casoAberto` so monta `TelaCasoAberto` com um `ResultadoDaAbertura`
  /// em `extra` -- o desfecho que F3.2 acabou de produzir -- e sem ele a rota
  /// cai no Perfil. Acao sem destino e o que o criterio 2 da BICHUS-62 proibe.
  ///
  /// ## OS DOIS PADROES VISUAIS, E POR QUE SAO ESSES
  ///
  /// | Estado | Faixa | Botao | Alvo |
  /// |---|---|---|---|
  /// | Nao perdido | nenhuma | [BotaoSecundario], contorno de 2 px | 48 dp |
  /// | Perdido | urgencia, preenchimento solido | [BotaoPrimario] | 64 dp |
  ///
  /// **A diferenca nao e troca de cor por gosto, e os dois lados saem do
  /// sistema.** Secundario e a variante do unico ponto de entrada que
  /// `Marcar como perdido` ja tinha (`Perfil` > `Meus pets`), e duas aparencias
  /// para a MESMA acao em duas telas e como elas divergem sem ninguem decidir.
  /// Primario com `critico: true` e o alvo de 64 dp do paragrafo 6.5, escrito
  /// para exatamente esta situacao: *pessoa em pe, com um animal em um dos
  /// bracos, usando o polegar da outra mao*. Quem toca em `Encontrei meu pet`
  /// esta, com alguma sorte, segurando o bicho.
  ///
  /// **Dois sinais, nunca so a cor** (WCAG 2.1 SC 1.4.1): os rotulos sao
  /// diferentes (`Marcar como perdido` / `Encontrei meu pet`) e a faixa diz o
  /// estado em texto, entao quem nao distingue a cor recebe a mesma informacao.
  ///
  /// **A faixa de estado ficou, e trocou de peso.** O texto e o mesmo
  /// `TelaDeQuemEOCaso.jaProcurado` com o mesmo prefixo de nome que F3.0 usa --
  /// uma segunda redacao faria duas telas dizerem coisas diferentes sobre o
  /// mesmo animal --, mas o peso passou a ser o de urgencia, que e o que o 6.4
  /// manda: um pet marcado como perdido e o momento mais importante do produto,
  /// e ele nao chega com a tinta de um aviso qualquer.
  List<Widget> _acaoDeEstadoDoPet(BuildContext context) {
    final cores = BichuColors.of(context).cores;
    final textos = Theme.of(context).textTheme;

    if (_jaProcurado) {
      return <Widget>[
        // A faixa de urgencia, com `liveRegion` para o leitor de tela anuncia-la
        // assim que ela aparece -- inclusive depois de o caso ser aberto noutra
        // tela e a pessoa voltar para ca.
        Semantics(
          liveRegion: true,
          container: true,
          child: Container(
            width: double.infinity,
            padding: const EdgeInsets.all(BichuEspaco.e4),
            decoration: BoxDecoration(
              color: cores.urgency,
              borderRadius: BorderRadius.circular(BichuRaio.lg),
            ),
            child: Text(
              '${pet.nome}: ${TelaDeQuemEOCaso.jaProcurado}',
              style: textos.titleMedium?.copyWith(color: cores.onUrgency),
            ),
          ),
        ),
        const SizedBox(height: BichuEspaco.e4),
        // `COMPARTILHAR`, **so com caso aberto e so com endereco publico**
        // (cliente, 20/10/2026). Ver `_linkDoCaso`: as tres travas em serie e
        // por que a ausencia do endereco e o interruptor.
        //
        // ## Por que ela vem ANTES de `Encontrei meu pet`
        //
        // Duas razoes, e a segunda e de seguranca de toque. A primeira: com o
        // animal na rua, compartilhar e a acao que o tutor REPETE -- num grupo,
        // depois noutro --, e `Encontrei meu pet` e terminal. A segunda: as
        // duas sao vizinhas de efeito muito diferente, e entre elas fica o
        // `space/6` do sistema e nao o `space/2`, o mesmo cuidado de 11.1 que
        // separa `Reabrir o caso` de `Marcar como perdido`. Quem erra o alvo
        // acerta a acao que nao encerra nada.
        //
        // `BotaoSecundario` e nao primario: a acao principal deste estado
        // continua sendo a do estado do animal, e duas acoes com o mesmo peso
        // na mesma dobra fazem a pessoa escolher pela posicao.
        if (_linkDoCaso != null) ...<Widget>[
          if (erroAoCompartilhar != null) ...<Widget>[
            Semantics(
              liveRegion: true,
              container: true,
              child: FaixaDeAviso(texto: erroAoCompartilhar!),
            ),
            const SizedBox(height: BichuEspaco.e4),
          ],
          BotaoSecundario(
            rotulo: TextosDoDetalhe.compartilhar,
            nomeAcessivel: TextosDoDetalhe.compartilharAcessivel(pet.nome),
            aoTocar: aoCompartilhar,
          ),
          const SizedBox(height: BichuEspaco.e6),
        ],
        // O ERRO DO ENCERRAMENTO, **acima** do botao que o produziu e so quando
        // ha um. Em faixa de `erro` e nao `informativo`: ha acao a tomar, que e
        // tentar de novo, e o botao logo abaixo e onde se toma.
        if (erroAoEncerrar != null) ...<Widget>[
          FaixaDeAviso(texto: erroAoEncerrar!),
          const SizedBox(height: BichuEspaco.e4),
        ],
        BotaoPrimario(
          rotulo: TextosDoDetalhe.encontreiMeuPet,
          critico: true,
          carregando: encerrandoOCaso,
          aoTocar: aoEncontrarOPet,
        ),
        const SizedBox(height: BichuEspaco.e6),
      ];
    }
    return <Widget>[
      // A OFERTA DE DESFAZER, **acima** do `Marcar como perdido` e so enquanto
      // a janela de 7 dias estiver aberta.
      //
      // Ela vem antes porque e a acao que quem acabou de tocar por engano
      // procura, e porque as duas sao vizinhas perigosas: `Marcar como perdido`
      // abriria um caso NOVO -- perdendo os candidatos, as conversas e o
      // historico do caso encerrado --, e reabrir devolve o que existia. Entre
      // as duas ha o `space/6` do sistema, e nao o `space/2`: alvos de efeito
      // diferente com pouca folga produzem toque errado (11.1).
      ...?_ofertaDeReabrir(context),
      BotaoSecundario(
        rotulo: TextosDoDetalhe.marcarComoPerdido,
        aoTocar: aoMarcarPerdido,
      ),
      const SizedBox(height: BichuEspaco.e6),
    ];
  }

  /// A oferta de REABRIR, ou `null` quando ela nao se aplica.
  ///
  /// **Tres condicoes, e as tres sao medidas e nao supostas:**
  ///
  /// 1. esta tela encerrou um caso agora ([casoEncerradoAgora] nao e nulo);
  /// 2. o servidor mandou um `reopen_deadline` e ele esta **no futuro**
  ///    (`janelaDeReaberturaAberta`). A conta e contra a data da RESPOSTA, e
  ///    nunca uma janela de 7 dias refeita aqui sobre `closed_at`;
  /// 3. o pet voltou a nao estar procurado -- este ramo e o do `else` de
  ///    `_jaProcurado`, entao a condicao e estrutural.
  ///
  /// Ausencia de prazo **nao** vira oferta: ver a prosa de
  /// `CasoDePerdido.prazoDeReabertura`. Um `?? ` generoso aqui desenharia um
  /// botao que o servidor recusa com 410, e a pessoa ouviria "nao da mais" de
  /// um botao que o app acabou de oferecer.
  List<Widget>? _ofertaDeReabrir(BuildContext context) {
    final caso = casoEncerradoAgora;
    if (caso == null) return null;
    // O relogio entra na comparacao aqui, e no instante em que a tela e
    // desenhada: a pagina pode ficar aberta mais tempo que a janela.
    if (!caso.janelaDeReaberturaAberta(DateTime.now())) return null;
    final prazo = caso.prazoDeReabertura;
    if (prazo == null) return null;

    return <Widget>[
      // A faixa explica a oferta ANTES do botao, com o prazo que saiu da
      // resposta. Informativa e nao de erro: encerrar sem querer nao e falha
      // de ninguem, e a faixa de erro aqui acusaria a pessoa.
      Semantics(
        liveRegion: true,
        container: true,
        child: FaixaDeAviso(
          peso: PesoDaFaixa.informativo,
          texto: TextosDoDetalhe.podeReabrirAte(QuandoNaLista.diaEMes(prazo)),
        ),
      ),
      const SizedBox(height: BichuEspaco.e4),
      if (erroAoReabrir != null) ...<Widget>[
        FaixaDeAviso(texto: erroAoReabrir!),
        const SizedBox(height: BichuEspaco.e4),
      ],
      BotaoSecundario(
        rotulo: TextosDoDetalhe.reabrirOCaso,
        carregando: reabrindoOCaso,
        aoTocar: aoReabrirOCaso,
      ),
      const SizedBox(height: BichuEspaco.e6),
    ];
  }

  @override
  Widget build(BuildContext context) {
    final cores = BichuColors.of(context).cores;
    final textos = Theme.of(context).textTheme;

    return ListView(
      padding: const EdgeInsets.all(BichuEspaco.e4),
      children: <Widget>[
        // 1. Faixa de estado, quando existir.
        if (pet.semTag) ...<Widget>[
          FaixaDeAviso(
            peso: PesoDaFaixa.informativo,
            texto: TextosDoDetalhe.semTag(pet.nome),
          ),
          const SizedBox(height: BichuEspaco.e4),
        ],

        // 2. Foto grande e nome.
        // **A foto ganhou descricao porque o nome saiu de baixo dela.**
        // `Moldura` envolve o conteudo num `ExcludeSemantics`, entao a imagem
        // nunca teve rotulo proprio: quem anunciava o animal aqui era o nome
        // logo abaixo. Tirar o texto sem isto deixaria o bloco mudo para o
        // leitor de tela.
        Center(
          child: Semantics(
            image: true,
            label: TextosDoDetalhe.fotoDe(pet.nome),
            child: _FotoGrande(pet: pet),
          ),
        ),

        // O MOTIVO DA RECUSA, quando nao sobrou foto para mostrar.
        //
        // Antes disto a moldura ficava vazia e a tela nao dizia nada: a foto
        // tinha sido recusada, o motivo estava gravado no banco desde a
        // BICHUS-87 e nao saia no contrato. A pessoa via um espaco vazio e nao
        // tinha como saber se o problema era o formato, o tamanho, a dimensao
        // minima ou um arquivo que chegou pela metade.
        //
        // `informativo` e nao `erro`: a foto e opcional (decisao do cliente de
        // 21/09), entao nao ha acao obrigatoria -- ha uma informacao que
        // permite enviar outra que funcione.
        if (pet.motivoDaFotoRecusada != null) ...<Widget>[
          const SizedBox(height: BichuEspaco.e4),
          FaixaDeAviso(
            texto: pet.motivoDaFotoRecusada!,
            peso: PesoDaFaixa.informativo,
          ),
        ],
        const SizedBox(height: BichuEspaco.e4),
        // **O NOME SAIU DAQUI** (cliente, 17/10/2026): ele ja esta na barra de
        // cima, e a tela o dizia duas vezes. Quem usa leitor de tela ouvia o
        // mesmo nome na barra e de novo como cabecalho do corpo.
        //
        // A linha de identificacao abaixo (especie, raca, porte) fica: ela e
        // outra informacao, e nao a repeticao de nada.

        // 3. Linha de identificacao. O mesmo `atributosDe` do cartao: duas
        // formas de compor a mesma linha divergiriam na primeira manutencao.
        Text(
          CartaoDePet.atributosDe(pet),
          style: textos.bodyLarge?.copyWith(color: cores.textSecondary),
        ),
        const SizedBox(height: BichuEspaco.e6),

        // 3b. A ACAO DE ESTADO DO ANIMAL, pedida pelo cliente em 18/10:
        // `Marcar como perdido` **dentro da pagina do pet**, e -- no mesmo
        // pedido -- a INVERSA dela, `Encontrei meu pet`, para quando ha caso
        // aberto. Qual das duas aparece, e com que aparencia, esta decidido e
        // justificado em `_acaoDeEstadoDoPet`.
        //
        // O cabecalho desta classe dizia que a tela nao tem barra de acao fixa
        // porque a 7.6.3 pede UMA acao escolhida pelo estado e duas das tres
        // candidatas nao tinham destino. Isso nao mudou, e esta acao **nao e**
        // a barra fixa: ela e um controle no corpo, no lugar em que o estado do
        // animal acabou de ser lido. A tela continua sem barra, e as outras
        // duas candidatas continuam sem destino.
        //
        // AQUI, e nao no fim: quem abre a pagina do pet porque o animal sumiu
        // esta com pressa, e as acoes do fim sao as destrutivas -- `Editar` e
        // `Excluir` --, deliberadamente longe de qualquer outro alvo. Pendurar
        // a acao de perdido junto delas colocaria o caminho do resgate a 16 dp
        // do botao de apagar o cadastro.
        //
        // `Marcar como perdido` sai em `BotaoSecundario` e nao em primario: e
        // a MESMA variante do unico ponto de entrada que esta acao ja tinha
        // (`Perfil` > `Meus pets`). Duas aparencias para a MESMA acao em duas
        // telas e como elas divergem sem ninguem decidir -- e e por isso que o
        // padrao visual diferente que o cliente pediu distingue os dois
        // ESTADOS, e nunca a mesma acao em dois lugares.
        ..._acaoDeEstadoDoPet(context),

        // 4. Sinais, nunca truncado.
        //
        // **O ROTULO VIROU `Sinais particulares`** (cliente, 18/10/2026): ele
        // leu `Sinais` aqui e perguntou o que era. Ver
        // `TextosDoDetalhe.rotuloDosSinais` -- a constante e a do formulario
        // que preenche o campo, e nao uma segunda redacao.
        _CartaoDeTexto(
          titulo: TextosDoDetalhe.rotuloDosSinais,
          texto: pet.sinaisParticulares,
          vazio: TextosDoDetalhe.semSinais,
        ),

        if (pet.cuidados != null && pet.cuidados!.isNotEmpty) ...<Widget>[
          const SizedBox(height: BichuEspaco.e4),
          _CartaoDeTexto(titulo: 'Cuidados', texto: pet.cuidados),
        ],

        // 5. O QR DA PLAQUINHA (cliente, 18/10): "traga tambem o qr-code
        // para o usuario conseguir escanear".
        //
        // Abaixo dos campos e acima das destrutivas: ele e informacao do pet,
        // e nao acao sobre ele. O conteudo do QR, o motivo de ele vir desenhado
        // do servidor e o motivo de o rotulo acessivel nao ser o codigo estao
        // em `QrDaPlaquinha`, porque e la que a proxima pessoa vai mexer.
        const SizedBox(height: BichuEspaco.e6),
        Semantics(
          header: true,
          child: Text(QrDaPlaquinha.titulo, style: textos.titleMedium),
        ),
        const SizedBox(height: BichuEspaco.e3),
        QrDaPlaquinha(
          estado: estadoDoQr,
          provedor: qr,
          sufixo: sufixoDaTag,
          nomeDoPet: pet.nome,
          aoTentarDeNovo: aoTentarOQr,
        ),

        // O LINK DO ACOMPANHAMENTO (cliente, 18/10: "adicione o link para
        // abrir a pagina de rastreio da tag dentro da pagina do pet").
        //
        // **So quando ha pedido.** Pet sem plaquinha e pet com plaquinha mas
        // sem pedido nao veem link nenhum: ele levaria a uma pagina vazia, e
        // acao sem destino e o que o criterio 2 da BICHUS-62 proibe. Quem
        // mede isso e `_carregarOPedidoDaPlaquinha`, por leitura, e nao
        // `pet.semTag` -- ter tag e ter pedido sao coisas diferentes.
        //
        // AQUI, junto do QR: os dois falam da mesma plaquinha. E longe das
        // destrutivas do fim, que seguem separadas por mais de 16 dp de
        // qualquer outro alvo.
        if (temPedidoDePlaquinha) ...<Widget>[
          const SizedBox(height: BichuEspaco.e4),
          _AcaoEmTexto(
            rotulo: TextosDoDetalhe.acompanharPlaquinha,
            aoTocar: aoAcompanharPlaquinha,
          ),
        ],

        // As acoes destrutivas, em texto, no fim, e separadas por mais de
        // 16 dp de qualquer outro alvo (7.6.3, acessibilidade).
        const SizedBox(height: BichuEspaco.e8),
        _AcaoEmTexto(rotulo: TextosDoDetalhe.editar, aoTocar: aoEditar),
        const SizedBox(height: BichuEspaco.e4),
        _AcaoEmTexto(
          rotulo: TextosDoDetalhe.excluir,
          aoTocar: aoExcluir,
          destrutiva: true,
        ),
      ],
    );
  }
}

class _FotoGrande extends StatelessWidget {
  const _FotoGrande({required this.pet});

  final Pet pet;

  @override
  Widget build(BuildContext context) {
    final capa = pet.fotoDeCapa;
    // A DERIVADA `card`, e nao a `thumb`.
    //
    // Esta moldura desenha 160 x 176 dp, que a 3x sao 480 x 528 px; a `thumb`
    // tem 176 px de largura. Ela e a derivada certa para o cartao de 56 dp da
    // lista e seria esticada quase tres vezes aqui.
    //
    // E, antes desta linha, **nenhuma imagem era montada nesta tela**: a
    // moldura ficava no estado de repouso com nada dentro, e a derivada `card`
    // de 1024 px era gerada, paga e nunca desenhada pelo app -- so o cartaz
    // impresso e a pagina publica do caso a usavam.
    final endereco = capa?.urlDeCartao;
    // A moldura larga do detalhe. O estado vazio nao e defeito nem pendencia:
    // a foto e **opcional** por decisao do cliente de 21/09, e a edicao e o
    // caminho de volta de quem cadastrou sem ela (criterio 10 da BICHUS-61).
    return Moldura(
      // `foto/lg` do 5.4: o tamanho que a tabela publica para "Perfil do pet",
      // que e esta tela. O numero mora em `BichuMoldura`, e nao aqui: um 200
      // escrito a mao seria medida inventada no widget, que e o que o criterio
      // 13 da BICHUS-62 proibe.
      largura: BichuMoldura.larguraFotoLg,
      estado: endereco == null
          ? (pet.temFotoEmProcessamento
              ? EstadoDaMoldura.carregando
              : EstadoDaMoldura.vazio)
          : EstadoDaMoldura.repouso,
      filho: endereco == null
          ? null
          : Image.network(
              endereco,
              fit: BoxFit.cover,
              // O mesmo ponto focal do cartao da lista (paragrafo 5.4): o terco
              // superior e onde esta a cabeca do animal na foto tipica de
              // tutor. A derivada ja chega cortada em 1 : 1,1 pelo servidor, e
              // este alinhamento cobre o residuo.
              alignment: const Alignment(0, -1 / 3),
              // Falha de rede cai na moldura vazia, e nao numa caixa de
              // excecao: e o que o 11.4 manda.
              errorBuilder: (context, erro, pilha) =>
                  const Moldura(largura: BichuMoldura.larguraFotoLg),
            ),
    );
  }
}

/// Um cartao de texto corrido. **Nunca truncado** (7.6.3, item 4).
class _CartaoDeTexto extends StatelessWidget {
  const _CartaoDeTexto({
    required this.titulo,
    required this.texto,
    this.vazio,
  });

  final String titulo;
  final String? texto;
  final String? vazio;

  @override
  Widget build(BuildContext context) {
    final cores = BichuColors.of(context).cores;
    final textos = Theme.of(context).textTheme;
    final conteudo = texto == null || texto!.isEmpty ? vazio : texto;
    if (conteudo == null) return const SizedBox.shrink();

    return Container(
      width: double.infinity,
      padding: const EdgeInsets.all(BichuEspaco.e4),
      decoration: BoxDecoration(
        color: cores.surfaceSunken,
        borderRadius: BorderRadius.circular(BichuRaio.lg),
        border: Border.all(color: cores.outline, width: BichuBorda.hairline),
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: <Widget>[
          Semantics(
            header: true,
            child: Text(titulo, style: textos.titleMedium),
          ),
          const SizedBox(height: BichuEspaco.e2),
          Text(conteudo, style: textos.bodyMedium),
        ],
      ),
    );
  }
}

/// Acao em texto, com alvo de toque de 48 dp.
///
/// O `Semantics` declara `button: true` **e** `onTap`, os dois. Declarar so o
/// primeiro com `excludeSemantics` apaga a arvore do filho e leva junto a acao
/// que o `InkWell` publicava: o no sai com `btn=true tap=false` e
/// `test/a11y/acao_de_controle_test.dart` reprova, corretamente -- quem usa
/// leitor de tela ouviria que existe um botao de excluir e nao teria como
/// aciona-lo.
class _AcaoEmTexto extends StatelessWidget {
  const _AcaoEmTexto({
    required this.rotulo,
    required this.aoTocar,
    this.destrutiva = false,
  });

  final String rotulo;
  final VoidCallback aoTocar;
  final bool destrutiva;

  @override
  Widget build(BuildContext context) {
    final cores = BichuColors.of(context).cores;
    final textos = Theme.of(context).textTheme;

    return Semantics(
      button: true,
      label: rotulo,
      excludeSemantics: true,
      onTap: aoTocar,
      child: InkWell(
        onTap: aoTocar,
        borderRadius: BorderRadius.circular(BichuRaio.md),
        child: SizedBox(
          height: BichuAlvoDeToque.min,
          width: double.infinity,
          child: Align(
            alignment: Alignment.centerLeft,
            child: Text(
              rotulo,
              style: textos.labelLarge?.copyWith(
                color: destrutiva ? cores.error : cores.primary,
              ),
            ),
          ),
        ),
      ),
    );
  }
}


/// A FOLHA DE CONFIRMACAO do encerramento do caso (11.9, sem o 11.9.1).
///
/// ## Ela NAO e a [FolhaDestrutiva], e a diferenca e de contrato
///
/// O 11.9.1 -- icone de alerta em `error`, botao `urgency`, titulo de
/// destruicao -- e para o que **nao volta**. Encerrar o caso nao apaga nada e
/// e reversivel por 7 dias (`reopenLostCase`). O 24.17.6 separa os dois, e a
/// `encontro_da_rede.dart` ja escreve a regra: *"Secundaria e nao Perigo:
/// desistir nao apaga nada da pessoa e pode ser refeito"*.
///
/// ## O que ela MANTEM do 11.9.1: a inversao das acoes
///
/// | Posicao | Acao | Alvo |
/// |---|---|---|
/// | **Primeira, mais alta** | **Ainda nao encontrei**, contorno | **64 dp** |
/// | Abaixo, separada por `space/4` | Encerrar o caso, primario | 48 dp |
///
/// Quem fecha a folha no susto, sem ler, acerta o botao que nao encerra. O
/// botao que age nao e o maior nem o mais alto, e isso e proposital.
///
/// ## O gesto de voltar equivale a cancelar, nunca a confirmar
///
/// `Navigator.pop` sem valor devolve nulo, e `_confirmarEncerramento` traduz
/// nulo para `false`. Um `?? true` la transformaria o gesto de voltar do
/// sistema num confirmador de encerramento.
///
/// ## Sem estado de carregando aqui, e a ausencia e decisao
///
/// A folha FECHA ao confirmar, e o `POST` roda na pagina -- com o rotulo do
/// botao girando la e a faixa de erro acima dele. Um segundo lugar com
/// `carregando` e `erro` daria duas respostas para "o encerramento falhou", e
/// a da folha seria a que ninguem revisita: ela some.
class _FolhaDoEncerramento extends StatelessWidget {
  const _FolhaDoEncerramento({
    required this.titulo,
    required this.corpo,
    required this.oQueAcontece,
    required this.rotuloDeConfirmar,
    required this.rotuloAcessivelDeConfirmar,
    required this.rotuloDeCancelar,
  });

  final String titulo;
  final String corpo;

  /// O que vai acontecer, em lista. **Cada linha e uma consequencia medida**;
  /// ver `TextosDoDetalhe.oQueAconteceAoEncerrar`, inclusive por que nenhuma
  /// delas diz que alguem sera avisado.
  final List<String> oQueAcontece;

  final String rotuloDeConfirmar;

  /// O nome acessivel do botao que age. Ele tem de dizer **sobre o que** e:
  /// quem navega por leitor de tela chega no botao sem o contexto que a pessoa
  /// vidente tem da folha inteira na frente dela.
  final String rotuloAcessivelDeConfirmar;

  final String rotuloDeCancelar;

  @override
  Widget build(BuildContext context) {
    final cores = BichuColors.of(context).cores;
    final textos = Theme.of(context).textTheme;

    return Semantics(
      // O equivalente do `role=alertdialog`: a folha nomeia a propria rota e
      // prende o foco dentro dela.
      scopesRoute: true,
      namesRoute: true,
      explicitChildNodes: true,
      label: titulo,
      // **A folha ROLA**, pelo mesmo motivo da destrutiva: a lista cresce, a
      // fonte do sistema em 200% estoura o conteudo minimo, e o que estoura e
      // o FIM da coluna -- que e onde moram as duas acoes.
      child: SingleChildScrollView(
        child: Padding(
          padding: EdgeInsets.only(
            left: BichuEspaco.e4,
            right: BichuEspaco.e4,
            bottom: MediaQuery.of(context).viewPadding.bottom + BichuEspaco.e4,
          ),
          child: Column(
            mainAxisSize: MainAxisSize.min,
            crossAxisAlignment: CrossAxisAlignment.start,
            children: <Widget>[
              Semantics(
                header: true,
                child: Text(
                  titulo,
                  style: textos.titleLarge?.copyWith(color: cores.textPrimary),
                ),
              ),
              const SizedBox(height: BichuEspaco.e3),
              Text(corpo, style: textos.bodyMedium),
              const SizedBox(height: BichuEspaco.e3),
              ...oQueAcontece.map(
                (item) => Padding(
                  padding: const EdgeInsets.only(bottom: BichuEspaco.e2),
                  child: Row(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: <Widget>[
                      // O marcador entra como no decorativo: um `Text('•')`
                      // proprio viraria uma parada de leitor de tela que
                      // anuncia "bala" e nada mais.
                      ExcludeSemantics(
                        child: Padding(
                          padding: const EdgeInsets.only(right: BichuEspaco.e2),
                          child: Text('•', style: textos.bodyMedium),
                        ),
                      ),
                      Expanded(child: Text(item, style: textos.bodyMedium)),
                    ],
                  ),
                ),
              ),
              const SizedBox(height: BichuEspaco.e6),

              // ----------------------------------------------------------
              // As acoes, INVERTIDAS. Cancelar em cima, e com o alvo grande.
              // ----------------------------------------------------------
              SizedBox(
                width: double.infinity,
                height: BichuAlvoDeToque.critico,
                child: OutlinedButton(
                  onPressed: () => Navigator.of(context).pop(false),
                  child: Text(rotuloDeCancelar),
                ),
              ),
              const SizedBox(height: BichuEspaco.e4),
              Semantics(
                button: true,
                label: rotuloAcessivelDeConfirmar,
                excludeSemantics: true,
                // `excludeSemantics: true` apaga a arvore do filho e leva junto
                // a acao que o `FilledButton` publica. Sem este `onTap` o no
                // sai com `btn=true tap=false`, e
                // `test/a11y/acao_de_controle_test.dart` reprova -- com razao:
                // quem usa leitor de tela ouviria que existe um botao e nao
                // teria como aciona-lo.
                onTap: () => Navigator.of(context).pop(true),
                child: SizedBox(
                  width: double.infinity,
                  height: BichuAlvoDeToque.min,
                  child: FilledButton(
                    onPressed: () => Navigator.of(context).pop(true),
                    child: Text(rotuloDeConfirmar, style: textos.labelLarge),
                  ),
                ),
              ),
            ],
          ),
        ),
      ),
    );
  }
}
