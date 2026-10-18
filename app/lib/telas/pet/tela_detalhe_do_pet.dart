import 'package:flutter/material.dart';
import 'package:go_router/go_router.dart';

import '../../acessibilidade/anunciar.dart';
import '../../api/falhas.dart';
import '../../api/mensagens_de_erro.dart';
import '../../api/modelos_pet.dart';
import '../../api/problem.dart';
import '../../escopo.dart';
import '../../perdido/rascunho_do_caso.dart';
import '../../roteamento/rotas.dart';
import '../../theme/bichu_colors.dart';
import '../../theme/bichu_tokens.g.dart';
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
enum _Fase { carregando, carregado, foraDaConta, falha }

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
    } on FalhaDeChamada catch (falha) {
      if (!mounted) return;
      setState(() {
        if (_ehForaDaConta(falha)) {
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

  /// A acao `Marcar como perdido`, ou o que a tela diz quando ela nao cabe.
  ///
  /// **Caso aberto NAO vira botao desabilitado.** O teto e de um caso aberto por
  /// pet (criterio 8 da BICHUS-21) e o criterio 13 manda a tela refletir o teto
  /// em vez de deixar a pessoa bater nele. `TelaDeQuemEOCaso` resolve isso do
  /// jeito que esta tela copia: o animal **aparece**, dito em texto e fora de
  /// qualquer controle, com a frase `TelaDeQuemEOCaso.jaProcurado`. Deixar um
  /// botao ali -- mesmo desabilitado -- levaria a um 409 `pet-already-lost`
  /// depois de duas telas, e um controle desabilitado sem motivo dito e o
  /// desenho preguicoso que o criterio 5 recusa.
  ///
  /// **A frase e a que ja existe**, com o mesmo prefixo de nome que F3.0 usa.
  /// Uma segunda redacao para o mesmo estado e como duas telas passam a dizer
  /// coisas diferentes sobre o mesmo animal.
  ///
  /// **Nao ha `Ver o caso`.** Nao e esquecimento: `Rotas.casoAberto` so monta
  /// `TelaCasoAberto` com um `ResultadoDaAbertura` em `extra` -- o desfecho que
  /// F3.2 acabou de produzir -- e sem ele a rota cai no Perfil. Acao sem destino
  /// e o que o criterio 2 da BICHUS-62 proibe, e continua proibido aqui.
  List<Widget> _acaoDeMarcarPerdido() {
    if (_jaProcurado) {
      return <Widget>[
        FaixaDeAviso(
          peso: PesoDaFaixa.informativo,
          texto: '${pet.nome}: ${TelaDeQuemEOCaso.jaProcurado}',
        ),
        const SizedBox(height: BichuEspaco.e6),
      ];
    }
    return <Widget>[
      BotaoSecundario(
        rotulo: TextosDoDetalhe.marcarComoPerdido,
        aoTocar: aoMarcarPerdido,
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

        // 3b. A ACAO PRINCIPAL DA 7.6.3, pedida pelo cliente em 18/10:
        // `Marcar como perdido` **dentro da pagina do pet**.
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
        // `BotaoSecundario` e nao primario: e a MESMA variante do unico ponto
        // de entrada que esta acao ja tinha. Duas aparencias para a mesma acao
        // em duas telas e como elas divergem sem ninguem decidir.
        ..._acaoDeMarcarPerdido(),

        // 4. Sinais, nunca truncado.
        _CartaoDeTexto(
          titulo: 'Sinais',
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
