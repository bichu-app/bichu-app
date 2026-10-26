import 'package:flutter/material.dart';
import 'package:go_router/go_router.dart';

import '../../api/falhas.dart';
import '../../api/mensagens_de_erro.dart';
import '../../api/modelos_perdido.dart';
import '../../api/perdidos_api.dart';
import '../../api/problem.dart';
import '../../escopo.dart';
import '../../roteamento/rotas.dart';
import '../../theme/bichu_colors.dart';
import '../../theme/bichu_tokens.g.dart';
import '../../widgets/botao_primario.dart';
import '../../widgets/faixa_de_aviso.dart';
import '../../widgets/imagem_da_rede.dart';
import '../../widgets/moldura.dart';
import '../../widgets/saida_da_tela.dart';
import '../escanear/tela_do_pet_da_tag.dart';
import 'cartao_do_perdido.dart';

/// A PAGINA INTERNA DE UM PET PERDIDO, na visao de quem **nao** e o tutor.
///
/// Pedida pelo cliente em 18/10/2026: *"na secao dos pets, quando o pet esta
/// perdido, deve ter uma pagina interna do pet e um botao caso a pessoa
/// encontrou o animal."*
///
/// ---------------------------------------------------------------------------
/// ## ELA SEGUE A DINAMICA QUE JA EXISTE, E NAO UMA SEGUNDA
/// ---------------------------------------------------------------------------
///
/// O cliente definiu a dinamica do achado com estas palavras: *"se eu escanear
/// o qr-code abre a pagina do pet; se o tutor marcou como perdido, abre a
/// pagina para o usuario enviar mensagem ao tutor."* Essa dinamica esta
/// construida em [TelaDoPetDaTag], na forma [FormaDaTelaDaTag.mensagemAoTutor]:
/// faixa de urgencia, foto, nome, **acao primeiro**, sinais e manejo depois.
///
/// **Esta tela e a mesma peca por outra porta**, e a ordem dos elementos e
/// copiada de la de proposito -- quem esta com o animal no colo confirma pela
/// cara do bicho e age; ler sinais e o que vem depois.
///
/// ---------------------------------------------------------------------------
/// ## POR QUE A ACAO NAO E A MESMA CHAMADA DA TELA DA TAG
/// ---------------------------------------------------------------------------
///
/// Porque **quem chega por aqui nao tem o codigo da plaquinha**.
/// `POST /tags/{code}/found-reports` e enderecada pelo codigo, e o codigo **e**
/// a credencial: ele nao sai em superficie publica nenhuma, e muito menos na
/// listagem de perdidos. O que a listagem tem e o `share_token`.
///
/// O contrato ja decidiu qual e a porta deste caso, e esta escrito no campo
/// `can_report_sighting` de `PublicLostCase`: *"O toque leva a
/// `POST /found-reports` (`createStrayFoundReport`) com o `share_token` do
/// caso, que vincula o achado direto a ele."*
///
/// E **esse fluxo ja existe inteiro no app**. O que mudou em 26/10/2026 foi
/// QUAL tela recebe o toque: ele vai para `Rotas.encontreiEstePet`, que
/// pergunta so onde, quando, o recado e a foto, e NAO para
/// `Rotas.registrarAchado`, que pergunta tambem especie, porte, raca e cor --
/// os quatro que o cadastro deste pet ja respondeu. O defeito era esse, e o
/// cliente o relatou com todas as letras: *"se ele encontrou o pet, ele nao
/// tem que cadastrar as informacoes novamente"*. A faixa de aviso de push
/// (`widgets/aviso_que_chegou.dart`) continua empurrando `registrarAchado`
/// com o `shareToken`, e isso **nao e o mesmo caminho**: ela nao tem o caso
/// lido na mao, so o token.
///
/// Nada aqui reimplementa registro de achado, e nada aqui monta corpo de
/// pedido: esta tela e uma porta, e a porta leva ao formulario que o produto
/// ja tem.
///
/// ---------------------------------------------------------------------------
/// ## A REGRA DE QUEM VE A ACAO E DO SERVIDOR, E NAO DESTA TELA
/// ---------------------------------------------------------------------------
///
/// `can_report_sighting` e falso **so** para o proprio tutor, e verdadeiro para
/// qualquer outra conta **e para quem chega sem conta**. O contrato escreve a
/// razao: *"a conta e pedida no toque, nao na leitura. Esconder o botao de quem
/// nao entrou esconderia justamente de quem chegou pelo cartaz."*
///
/// **`podeCriarNaComunidade` NAO vale aqui, e isso nao e excecao inventada.**
/// Aquela regra (`telas/abas.dart`) guarda as ESCRITAS da comunidade -- marcar
/// encontro, indicar profissional --, e a politica dela e sessao mais e-mail
/// verificado. O achado avulso nunca esteve atras dela: `createStrayFoundReport`
/// declara `security: [bearerAuth]` e nada mais, e a guarda de conta mora
/// **dentro** do fluxo de registro, em `intencao/achado_como_intencao.dart`, que
/// leva a pessoa a entrada e volta com o rascunho inteiro. Essa e a politica
/// medida do caminho de achado que ja estava no app, e e a que fica.
///
/// ---------------------------------------------------------------------------
/// ## O 410 E ESTADO, E NAO ERRO
/// ---------------------------------------------------------------------------
///
/// `lost-case-closed` cobre cinco situacoes com **um corpo so**: caso
/// encerrado, pet excluido, falecido, arquivado, e token desconhecido. A fusao e
/// de privacidade e esta tela nao pode desfaze-la -- distinguir contaria a um
/// estranho o que aconteceu com o animal de outra pessoa.
///
/// E por isso **nao ha `Tentar de novo` aqui**: repetir a pergunta nao muda a
/// resposta, e o botao ensinaria a pessoa a insistir (mesma escolha de
/// `TelaDoAchado` para o 404). O que ha e a saida que o proprio contrato nomeia
/// em `next_action`: `register_stray_found_report` -- quem chegou por um cartaz
/// antigo e esta vendo um animal parecido registra o achado avulso, **sem
/// token**, e o cruzamento por atributos faz o resto.
///
/// ---------------------------------------------------------------------------
/// ## NENHUM IDENTIFICADOR INTERNO ENTRA NESTA TELA
/// ---------------------------------------------------------------------------
///
/// O endereco e `/p/<share_token>`, o mesmo que o `share_url` do caso carrega,
/// e o token e **opaco, nao e UUID e nao e ordenavel**. `PublicLostCase` nao
/// traz `pet_id`, `case_id` nem `user_id` -- o contrato diz que esta projecao
/// "nunca deve possuir" nenhum dos tres (ADR-0010, item 6) --, e por isso esta
/// tela nao tem como levar a `/pets/:petId` nem se alguem quisesse. Ela tambem
/// nao le `extra`: a leitura e sempre do servidor, pela mesma razao de
/// `TelaDoAchado` -- aparelho compartilhado nao pode herdar a tela de quem
/// estava antes.
class TelaDoCasoPublico extends StatefulWidget {
  const TelaDoCasoPublico({required this.shareToken, super.key});

  /// O token opaco do caso, **como veio no caminho da rota**.
  final String shareToken;

  /// O rotulo da acao, literal do cliente: *"um botao caso a pessoa encontrou o
  /// animal"*.
  ///
  /// **`Encontrei este animal` e nao `Vi este pet`.** O contrato chama o campo
  /// `can_report_sighting` e o site diz "vi este pet", mas o que o cliente
  /// pediu foi o caso de quem **esta com o bicho**, e as duas frases nao pedem a
  /// mesma coisa de quem le: "vi" convida a passar adiante, "encontrei" convida
  /// a ficar perto. O destino dos dois e o mesmo formulario.
  static const String rotuloDeEncontrei = 'Encontrei este animal';

  /// O que a tela diz quando o link nao leva mais a caso aberto.
  ///
  /// **Nao diz qual dos cinco motivos foi**, porque o contrato funde os cinco
  /// num corpo so de proposito. Ver o cabecalho da classe.
  static const String casoEncerrado =
      'Este link não leva mais a um caso aberto.';

  /// A saida do 410, que e a do `next_action` do contrato.
  static const String rotuloDeRegistrarAchado = 'Registrar um achado';

  /// O titulo da barra. **Nao carrega o nome do pet**: ele chega depois da
  /// leitura, e uma barra que troca de titulo no meio do carregamento e o que
  /// o 11.23.4 evita.
  static const String titulo = 'Pet perdido';

  @override
  State<TelaDoCasoPublico> createState() => _TelaDoCasoPublicoState();
}

/// Os desfechos de uma abertura. **`encerrado` e um deles**, e nao um erro
/// generico: ele tem texto proprio e saida propria.
enum _Fase { carregando, carregado, encerrado, falha }

class _TelaDoCasoPublicoState extends State<TelaDoCasoPublico> {
  _Fase _fase = _Fase.carregando;
  CasoPerdidoPublico? _caso;
  String? _textoDaFalha;
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
      final api = PerdidosApi(Escopo.of(context).api);
      final caso = await api.buscarCaso(widget.shareToken);
      if (!mounted) return;
      setState(() {
        _caso = caso;
        _fase = _Fase.carregado;
      });
    } on FalhaDeChamada catch (falha) {
      if (!mounted) return;
      setState(() {
        if (_ehCasoEncerrado(falha)) {
          _fase = _Fase.encerrado;
        } else {
          _textoDaFalha = MensagensDeErro.de(falha).texto;
          _fase = _Fase.falha;
        }
      });
    } on Object catch (erro, pilha) {
      // O QUE NAO E `FalhaDeChamada`: corpo 200 fora do contrato estoura
      // `TypeError` dentro de `CasoPerdidoPublico.doJson`. Sem este ramo a tela
      // ficaria em `_Fase.carregando` para sempre, que e o estado que este app
      // nao pode ter.
      registrarFalhaInesperada(erro, pilha, onde: 'ao abrir o caso publico');
      if (!mounted) return;
      setState(() {
        _textoDaFalha = MensagensDeErro.servidorFora;
        _fase = _Fase.falha;
      });
    }
  }

  /// **Decide pelo `type`, e o status e so o cinto.**
  ///
  /// `lost-case-closed` e o que o contrato manda ler; o `410` entra como
  /// segunda condicao para o dia em que um intermediario reescrever o corpo e
  /// deixar o status. Decidir SO pelo status pegaria um 410 de outra operacao
  /// que viesse a passar por aqui.
  bool _ehCasoEncerrado(FalhaDeChamada falha) =>
      falha is FalhaDaApi &&
      (falha.problem.tipo == ProblemTipo.casoEncerrado ||
          falha.problem.status == 410);

  /// A porta do achado, **com o caso inteiro**.
  ///
  /// =========================================================================
  /// O DESTINO MUDOU EM 26/10/2026, E A MUDANCA E DEFEITO RELATADO PELO
  /// CLIENTE -- palavra dele:
  ///
  ///   *"nao subiu o fluxo de quando clicar no pet, nao levar ele para a
  ///   pagina de registrar um achado, porque SE ELE ENCONTROU O PET, ELE NAO
  ///   TEM QUE CADASTRAR AS INFORMACOES NOVAMENTE"*
  /// =========================================================================
  ///
  /// Antes isto levava a `Rotas.registrarAchado` (F3.5) com um
  /// `RascunhoDoAchado` que carregava **so o `shareToken`** -- e F3.5 pergunta
  /// especie, porte, raca e cor. Quem achou um pet IDENTIFICADO, com cadastro
  /// e caso aberto, era obrigado a redigitar o que o sistema ja sabia.
  ///
  /// O destino agora e [Rotas.encontreiEstePet], e o `extra` e o
  /// [CasoPerdidoPublico.perdido] que esta tela ACABOU de ler: dele saem
  /// `species`, `size` e o `share_token` do corpo, sem ninguem digitar nada.
  /// O contrato garante os tres -- `PublicLostPet` declara `share_token`,
  /// `species` e `size` como `required`.
  ///
  /// **O caso tem de estar carregado para o botao existir**, e ele esta: este
  /// metodo so e alcancavel de `_Fase.carregado`, onde `_caso` nao e nulo. O
  /// `!` abaixo e dessa invariante, e nao de otimismo.
  void _encontrei() {
    context.push(Rotas.encontreiEstePet, extra: _caso!.perdido);
  }

  /// A porta do achado **sem** token, no caminho do 410.
  ///
  /// Sem token de proposito: o caso daquele token nao esta mais aberto, e
  /// mandar um token morto no corpo seria 400 depois de a pessoa ter
  /// preenchido o formulario inteiro. O cruzamento por atributos e o que
  /// sobra, e e exatamente o que o `next_action` do contrato nomeia.
  void _registrarAchadoAvulso() => context.push(Rotas.registrarAchado);

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(
        title: const Text(TelaDoCasoPublico.titulo),
        leading: const SaidaDaTela(tipo: TipoDeSaida.voltar),
      ),
      body: SafeArea(child: _corpo()),
    );
  }

  Widget _corpo() {
    return switch (_fase) {
      _Fase.carregando => const Center(child: CircularProgressIndicator()),
      _Fase.encerrado => Padding(
          padding: const EdgeInsets.all(BichuEspaco.e4),
          child: FaixaDeAviso(
            peso: PesoDaFaixa.informativo,
            texto: TelaDoCasoPublico.casoEncerrado,
            rotuloDaAcao: TelaDoCasoPublico.rotuloDeRegistrarAchado,
            aoTocarNaAcao: _registrarAchadoAvulso,
          ),
        ),
      // `_textoDaFalha` nunca e nulo nesta fase: quem a liga sempre o preenche
      // por `MensagensDeErro.de`, que devolve texto para toda falha.
      _Fase.falha => Padding(
          padding: const EdgeInsets.all(BichuEspaco.e4),
          child: FaixaDeAviso(
            texto: _textoDaFalha!,
            rotuloDaAcao: MensagensDeErro.tentarDeNovo,
            aoTocarNaAcao: _carregar,
          ),
        ),
      _Fase.carregado => _Conteudo(
          caso: _caso!,
          aoEncontrar: _encontrei,
        ),
    };
  }
}

/// O corpo, na ORDEM de [FormaDaTelaDaTag.mensagemAoTutor].
///
/// A ordem nao e escolha deste arquivo: ela esta decidida e justificada em
/// `tela_do_pet_da_tag.dart`, e repeti-la com outra sequencia faria duas telas
/// do mesmo momento do produto discordarem sobre o que vem primeiro.
class _Conteudo extends StatelessWidget {
  const _Conteudo({required this.caso, required this.aoEncontrar});

  final CasoPerdidoPublico caso;
  final VoidCallback aoEncontrar;

  @override
  Widget build(BuildContext context) {
    final cores = BichuColors.of(context).cores;
    final textos = Theme.of(context).textTheme;
    final pet = caso.perdido;

    return ListView(
      padding: const EdgeInsets.all(BichuEspaco.e4),
      children: <Widget>[
        // 1. A FAIXA DE URGENCIA, primeiro elemento.
        //
        // **Preenchimento solido** (design system 6.4): um pet marcado como
        // perdido aberto por quem nao e o dono e o momento mais importante do
        // produto, e ele nao chega com a tinta de um aviso qualquer. Dois
        // sinais e nunca so a cor (WCAG 2.1 SC 1.4.1): o texto diz que o tutor
        // esta procurando, entao quem nao distingue a cor recebe a mesma
        // informacao. `liveRegion` para o leitor de tela anunciar na hora.
        //
        // O TEXTO E O DA TELA DA TAG, e nao uma segunda redacao: a frase de
        // `TelaDoPetDaTag.faixaDePerdidoDe` ja resolve a concordancia sem o
        // sexo do animal, que nenhuma das duas projecoes publicas traz.
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
              TelaDoPetDaTag.faixaDePerdidoDe(pet.nome, pet.vistoPorUltimoEm),
              style: textos.titleLarge?.copyWith(color: cores.onUrgency),
            ),
          ),
        ),
        const SizedBox(height: BichuEspaco.e6),

        // 2. A FOTO, quando ha uma.
        //
        // **Sem foto nao entra moldura nenhuma**, nem simbolo nem ilustracao: o
        // paragrafo 5.4 decide isso e o motivo e de conversao, nao de estetica
        // -- *"uma ilustracao generica no lugar da foto faz o achador duvidar
        // de que e o pet certo"*. No lugar dela sobe o nome, que e o elemento
        // seguinte.
        //
        // `ImagemDaRede` e nao `Image.network` cru: e quem ja resolve
        // `cacheWidth`, raio e o quadro de falha nesta base, e e de la que sai
        // a conta de bytes do cartao da listagem.
        if (pet.urlDaFoto != null && pet.urlDaFoto!.trim().isNotEmpty) ...[
          Center(
            child: ImagemDaRede(
              url: pet.urlDaFoto!,
              descricao: 'Foto de ${pet.nome}',
              largura: BichuMoldura.larguraFotoLg,
            ),
          ),
          const SizedBox(height: BichuEspaco.e4),
        ],

        // 3. O NOME, na voz do achador.
        Text(
          TelaDoPetDaTag.tituloDoAchadorDe(pet.nome),
          style: textos.displayLarge?.copyWith(color: cores.textPrimary),
        ),

        // 4. A ACAO, **acima** dos sinais e do manejo.
        //
        // A posicao e a decisao do cliente de 18/10 para a tela da tag, e vale
        // igual aqui: a pagina de um pet perdido e a pagina de falar com o
        // tutor. Acima dela ficam foto e nome, que e o que a pessoa com o
        // animal no colo usa para confirmar que e o mesmo bicho; abaixo ficam
        // os sinais e o manejo, que ela le depois de ter avisado.
        //
        // **`critico: true`**: alvo de 64 dp em vez de 48 (design system 6.5,
        // pessoa em pe, com um animal em um dos bracos, usando o polegar da
        // outra mao).
        //
        // **Some quando `can_report_sighting` e falso**, e quem recebe falso e
        // so o proprio tutor. Ele nao pode registrar achado do proprio pet: o
        // candidato nasceria apontando para o caso dele mesmo, e o produto
        // pediria a ele confirmacao humana de um encontro consigo.
        if (caso.podeAvisarQueViu) ...[
          const SizedBox(height: BichuEspaco.e6),
          BotaoPrimario(
            rotulo: TelaDoCasoPublico.rotuloDeEncontrei,
            critico: true,
            aoTocar: aoEncontrar,
          ),
        ],

        // 5. OS SINAIS, com o separador do 11.3.
        //
        // A mesma linha do cartao da listagem (`CartaoDoPerdido.atributosDe`):
        // duas formas de compor a mesma linha divergiriam na primeira
        // manutencao, e a pessoa veria o pet descrito de dois jeitos entre o
        // cartao e a pagina que ele abre.
        const SizedBox(height: BichuEspaco.e6),
        _Cartao(
          titulo: 'Sinais particulares',
          texto: CartaoDoPerdido.atributosDe(pet),
        ),

        // 6. O TEXTO DO TUTOR (`description`), quando ha.
        if (_temTexto(caso.descricao)) ...[
          const SizedBox(height: BichuEspaco.e4),
          _Cartao(titulo: 'O que o tutor contou', texto: caso.descricao!.trim()),
        ],

        // 7. O CARTAO DE MANEJO (`care_notes`), quando ha.
        //
        // **Ele muda o que o achador faz nos proximos trinta segundos** ("e
        // medroso, nao corra atras" evita a perseguicao que faz o animal fugir
        // de novo), e e por isso que ele esta nesta tela e nao e detalhe. A
        // atribuicao em cima e o que o torna util: diz que aquilo e a voz de
        // quem conhece o animal, e nao instrucao do Bichu.
        //
        // Nunca um cartao vazio (F4.1, item 4).
        if (_temTexto(caso.notasDeCuidado)) ...[
          const SizedBox(height: BichuEspaco.e4),
          _Cartao(
            titulo: TelaDoPetDaTag.tituloDosCuidadosDe(pet.nome),
            atribuicao: TelaDoPetDaTag.atribuicaoDosCuidadosDe(pet.nome),
            texto: caso.notasDeCuidado!.trim(),
          ),
        ],

        // 8. A REGIAO, em texto. **Bairro e cidade, nunca ponto** (ADR-0006: nao
        // ha geocodificacao, e a coordenada do caso nunca sai).
        const SizedBox(height: BichuEspaco.e4),
        Text(
          pet.rotuloDaArea ?? CartaoDoPerdido.semRegiao,
          style: textos.bodyLarge?.copyWith(color: cores.textSecondary),
        ),
      ],
    );
  }

  static bool _temTexto(String? valor) =>
      valor != null && valor.trim().isNotEmpty;
}

/// Um cartao de texto, com titulo e atribuicao opcional.
class _Cartao extends StatelessWidget {
  const _Cartao({
    required this.titulo,
    required this.texto,
    this.atribuicao,
  });

  final String titulo;
  final String texto;
  final String? atribuicao;

  @override
  Widget build(BuildContext context) {
    final cores = BichuColors.of(context).cores;
    final textos = Theme.of(context).textTheme;
    return Container(
      width: double.infinity,
      padding: const EdgeInsets.all(BichuEspaco.e4),
      decoration: BoxDecoration(
        color: cores.surfaceAlt,
        borderRadius: BorderRadius.circular(BichuRaio.lg),
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: <Widget>[
          Semantics(
            header: true,
            child: Text(
              titulo,
              style: textos.titleMedium?.copyWith(color: cores.textPrimary),
            ),
          ),
          if (atribuicao != null) ...[
            const SizedBox(height: BichuEspaco.e2),
            Text(
              atribuicao!,
              style: textos.bodyMedium?.copyWith(color: cores.textSecondary),
            ),
          ],
          const SizedBox(height: BichuEspaco.e2),
          // **Nunca truncado**: a linha de sinais e o que confirma que o animal
          // no colo e o da tela, e um `...` no meio dela apaga exatamente a
          // palavra que decide.
          Text(texto, style: textos.bodyLarge?.copyWith(color: cores.textPrimary)),
        ],
      ),
    );
  }
}
