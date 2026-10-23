import 'dart:async';

import 'package:flutter/material.dart';
import 'package:go_router/go_router.dart';

import '../../api/conexoes_api.dart';
import '../../api/falhas.dart';
import '../../api/modelos_conexao.dart';
import '../../roteamento/rotas.dart';
import '../../theme/bichu_colors.dart';
import '../../theme/bichu_tokens.g.dart';
import '../../widgets/arrastar_para_atualizar.dart';
import '../../widgets/botao_primario.dart';
import '../../widgets/convite_para_entrar.dart';
import '../../widgets/faixa_de_aviso.dart';
import '../../widgets/imagem_da_rede.dart';

/// **AS CONEXÕES DA PRÓPRIA CONTA.** Decisão do cliente de **22/10/2026**,
/// literal:
///
/// > *"o usuário pode abrir a lista de usuários que é sua conexão"*
///
/// ## Isto emenda uma decisão dele mesmo, de 18/10/2026
///
/// Até 22/10/2026 esta tela **não podia existir**, e a proibição estava escrita
/// em quatro lugares vivos do repositório — o contrato, o ADR-0010, o plano 4-B
/// e a prosa de `tela_pedidos_de_conexao.dart`. A emenda é **exata**:
///
/// | | antes | agora |
/// |---|---|---|
/// | a própria lista, para o próprio dono | nunca | **esta tela** |
/// | a lista de **TERCEIRO** | nunca | **continua NUNCA** |
///
/// **Tocar as *"N conexões"* no perfil de outra pessoa continua não levando a
/// lugar nenhum**, e a pergunta sobre isso segue pendente com o cliente desde
/// 19/10/2026. Não há nesta tela, nem na API do app, forma de pedir a lista de
/// alguém: `GET /connections` não tem parâmetro de pessoa.
///
/// ## POR QUE TELA PRÓPRIA, e não um terceiro segmento em `Pedidos de conexão`
///
/// A alternativa era um terceiro `OpcaoSegmentada` ao lado de `Recebidos` e
/// `Enviados`. **Três razões decidiram contra, e a primeira é de desenho:**
///
/// 1. **Aquele controle responde "o que espera decisão?".** `Recebidos` e
///    `Enviados` são as duas caixas de PEDIDOS, e as duas pedem uma ação de
///    quem olha. Conexão aceita não espera nada — é um diretório, não uma fila.
///    Um terceiro segmento poria duas perguntas diferentes no mesmo controle.
/// 2. **A linha é diferente.** Um pedido tem `Aceitar`/`Recusar` dentro do
///    cartão e **não tem foto** (emenda 3 do ADR-0010: a foto sai entre
///    conexões aceitas, e pendente é exatamente quem ainda não aceitou). Uma
///    conexão tem foto e nenhum botão. Um segmento que trocasse a forma da
///    linha não é um filtro: é outra tela compartilhando uma barra.
/// 3. **A isca que guarda a tela de pedidos continua verde, sem uma linha
///    mudada.** `test/telas/pedidos_de_conexao_test.dart` tem a `ISCA (b)`, que
///    cobra que aquela tela **só** chama `/connections/requests` e
///    `/connections/summary` e **não** escreve "Conexões". Ela foi escrita para
///    encerrar uma decisão do cliente; pôr a lista lá dentro a derrubaria nas
///    duas metades, e o conserto teria sido reescrever a isca. Aqui ela
///    continua protegendo o que sempre protegeu.
///
/// **E não há duas portas para o mesmo lugar**: `gaveta_de_secoes.dart` proíbe
/// dois nomes para um destino, e esta tela tem UM nome (`Conexões`) e UMA rota
/// ([Rotas.minhasConexoes]), distinta de [Rotas.pedidosDeConexao].
///
/// ## O NOME É `Conexões`, e foi escolha
///
/// O cliente ofereceu três (`contatos`, `amigos`, `conexões`). **`Conexões`** é
/// o termo do contrato (`connections`, `ConnectedPerson`) e o que todo o resto
/// do app já escreve — a linha de resumo diz *"Você tem N de 150 conexões"*
/// desde 19/10. Escolher outro criaria duas palavras para a mesma coisa dentro
/// do mesmo produto.
///
/// ## O que sai de cada pessoa, e cada ausência tem dono
///
/// Os **cinco** campos de [PessoaConectada] — os mesmos de `PersonSearchResult`.
/// **Ser conexão aceita não abre campo nesta lista**: o que o aceite abre está
/// nas OUTRAS telas (a vitrine, o Mural, o bairro no perfil), cada uma com o
/// próprio predicado.
///
/// | Não aparece | Por quê |
/// |---|---|
/// | o `ref` da aresta | ele é o que deixa **desfazer**, e desfazer mora no perfil. Um botão de desfazer numa lista que se rola com o polegar é a navegação por acidente num controle irreversível |
/// | identificador interno | ADR-0010 item 6: o que endereça a pessoa é o apelido |
/// | busca, filtro e ordenação | o padrão de listagem desta casa os põe no topo do corpo — e aqui **nenhum dos três existe no contrato**. `GET /connections` recebe `page` e `limit`, e nada mais: um campo de busca aqui seria uma SEGUNDA busca de pessoas, sem os freios da primeira |
///
/// ## Não há botão de desfazer, e isso é decisão e não omissão
///
/// Quem quer desfazer abre o perfil da pessoa — a linha toda é a porta —, e lá
/// `getPersonProfile` entrega o `ref` e a tela de perfil já desenha os quatro
/// estados. Pôr `Desfazer` em cada linha faria o gesto de rolagem que erra o
/// alvo apagar uma conexão em silêncio: a operação é `irreversible_write`, e
/// desfazer **não avisa ninguém**.
class TelaDeMinhasConexoes extends StatefulWidget {
  const TelaDeMinhasConexoes({required this.conexoes, super.key});

  /// Entregue por quem monta a tela — a mesma forma de
  /// `TelaDePedidosDeConexao`.
  final ConexoesApi conexoes;

  /// **O NOME DA TELA.** O termo do contrato, e o que o resto do app escreve.
  static const String titulo = 'Conexões';

  static const String semNome = 'Usuário sem nome';
  static const String vazio = 'Você ainda não tem conexões';
  static const String comoComecar =
      'Busque alguém que você já conhece na aba Usuários da Comunidade, '
      'ou compartilhe o seu convite.';
  static const String falhaAoCarregar =
      'Não conseguimos carregar as suas conexões agora.';
  static const String verMais = 'Ver mais';

  /// O lado do círculo da foto. **O mesmo 56 dp do cartão da busca**, e o mesmo
  /// por uma razão: as duas listas mostram a mesma pessoa com a mesma foto, e
  /// dois tamanhos fariam o rosto mudar de lugar entre uma tela e a outra.
  static const double ladoDoCirculo = 56;

  /// O lado de dentro do círculo quando não há letra aproveitável. **Nunca
  /// vazio**: círculo em branco parece imagem que não carregou.
  static const String inicialDeQuemNaoTem = '·';

  static String rotuloDePets(int quantos) => quantos == 1 ? '1 pet' : '$quantos pets';

  static String rotuloDeConexoes(int quantas) =>
      quantas == 1 ? '1 conexão' : '$quantas conexões';

  /// O rótulo acessível da PORTA DO PERFIL, no nome da pessoa.
  ///
  /// Diz o que o toque **abre**, e não o que o controle é — a mesma frase de
  /// `TelaDePedidosDeConexao.rotuloDoPerfilDe`, repetida de propósito: um texto
  /// compartilhado acoplaria as duas telas por uma string.
  static String rotuloDoPerfilDe(String quem) => 'Abrir o perfil de $quem';

  /// A linha de números, **do servidor e nunca de constante deste binário**: o
  /// teto é número que se sobe depois, e um build antigo com o número gravado
  /// mostraria um limite que deixou de valer.
  static String linhaDoResumo(int quantas, int teto) =>
      'Você tem $quantas de $teto conexões.';

  @override
  State<TelaDeMinhasConexoes> createState() => _EstadoDasMinhasConexoes();
}

class _EstadoDasMinhasConexoes extends State<TelaDeMinhasConexoes> {
  /// As pessoas já carregadas, de todas as páginas pedidas até agora.
  final List<PessoaConectada> _pessoas = <PessoaConectada>[];
  int _total = 0;
  int _proximaPagina = 1;
  ResumoDeConexoes? _resumo;
  bool _carregando = true;
  bool _carregandoMais = false;
  String? _falha;

  /// A falha foi **falta de conta**, e não defeito.
  bool _faltaConta = false;

  @override
  void initState() {
    super.initState();
    unawaited(_carregar());
  }

  /// Carrega a PRIMEIRA página, do zero. É o que o arrastar-para-atualizar faz.
  Future<void> _carregar() async {
    setState(() {
      _carregando = true;
      _falha = null;
      _faltaConta = false;
    });
    try {
      // As duas perguntas em paralelo: o resumo não atrasa nem derruba a lista,
      // e a lista não atrasa o número.
      //
      // **A falha do resumo é tratada NO MOMENTO em que a chamada parte**, com
      // `onError`, e não num `try` em volta do `await` — a razão está medida em
      // `tela_pedidos_de_conexao.dart`: quando a LISTA falha primeiro, o
      // `await` do resumo nunca acontece e a falha dele sobe como erro
      // assíncrono sem dono.
      final lista = widget.conexoes.listarConexoes();
      final resumo = widget.conexoes
          .resumo()
          .then<ResumoDeConexoes?>((ResumoDeConexoes r) => r)
          .onError<FalhaDeChamada>((Object erro, StackTrace pilha) => _resumo);
      final pagina = await lista;
      final numeros = await resumo;
      if (!mounted) return;
      setState(() {
        _pessoas
          ..clear()
          ..addAll(pagina.items);
        _total = pagina.total;
        _proximaPagina = 2;
        _resumo = numeros;
        _carregando = false;
      });
    } on FalhaDeChamada catch (falha) {
      if (!mounted) return;
      setState(() {
        _carregando = false;
        // `next_action: sign_in` do servidor: `GET /v1/connections` declara
        // `bearerAuth` sem alternativa vazia e responde `401 unauthenticated`.
        _faltaConta = faltaConta(falha);
        _falha = _faltaConta ? null : TelaDeMinhasConexoes.falhaAoCarregar;
      });
    }
  }

  /// A página seguinte, **acrescentada** ao que já está na tela.
  ///
  /// O teto é 20 por página e o de conexões é 150, então são até oito páginas.
  /// **Botão e não rolagem infinita**: a rolagem infinita pede página sozinha
  /// enquanto a pessoa passa o dedo, e numa lista curta e finita isso gasta
  /// requisição sem ninguém ter pedido.
  Future<void> _carregarMais() async {
    if (_carregandoMais) return;
    setState(() {
      _carregandoMais = true;
      _falha = null;
    });
    try {
      final pagina = await widget.conexoes.listarConexoes(pagina: _proximaPagina);
      if (!mounted) return;
      setState(() {
        _pessoas.addAll(pagina.items);
        _total = pagina.total;
        _proximaPagina += 1;
        _carregandoMais = false;
      });
    } on FalhaDeChamada {
      if (!mounted) return;
      setState(() {
        _carregandoMais = false;
        // **O que já está na tela FICA.** Falhar a página seguinte não é
        // motivo para apagar as vinte que a pessoa está lendo.
        _falha = TelaDeMinhasConexoes.falhaAoCarregar;
      });
    }
  }

  /// Ainda há página? **Pelo `total` do servidor**, e não por a última página
  /// ter vindo cheia: uma página cheia que é a última faria o botão aparecer e
  /// trazer vazio.
  bool get _temMais => _pessoas.length < _total;

  @override
  Widget build(BuildContext context) {
    final cores = BichuColors.of(context).cores;
    final textos = Theme.of(context).textTheme;

    // SEM CONTA o corpo inteiro vira o convite, e nao a lista com faixa de
    // erro: nao ha o que atualizar, e `ArrastarParaAtualizar` repetiria o 401.
    if (_faltaConta) {
      return Scaffold(
        appBar: AppBar(title: const Text(TelaDeMinhasConexoes.titulo)),
        body: const SafeArea(
          child: Padding(
            padding: EdgeInsets.all(BichuEspaco.e4),
            child: ConviteParaEntrar(secao: SecaoComConta.minhasConexoes),
          ),
        ),
      );
    }

    return Scaffold(
      appBar: AppBar(title: const Text(TelaDeMinhasConexoes.titulo)),
      body: ArrastarParaAtualizar(
        aoAtualizar: _carregar,
        child: ListView(
          padding: const EdgeInsets.all(BichuEspaco.e4),
          children: <Widget>[
            // O RESUMO NO TOPO DO CORPO. **Nao ha busca, filtro nem ordenacao**
            // porque o contrato nao os tem: `GET /connections` recebe `page` e
            // `limit` e nada mais.
            if (_resumo != null) _linhaDoResumo(cores, textos, _resumo as ResumoDeConexoes),
            if (_falha != null) ...<Widget>[
              const SizedBox(height: BichuEspaco.e3),
              FaixaDeAviso(texto: _falha as String),
            ],
            const SizedBox(height: BichuEspaco.e4),
            if (_carregando)
              const Center(
                child: Padding(
                  padding: EdgeInsets.all(BichuEspaco.e8),
                  child: CircularProgressIndicator(),
                ),
              )
            // Com falha o vazio NAO e anunciado: "ainda nao tem conexoes" e
            // "nao consegui perguntar" sao afirmacoes diferentes, e a primeira
            // seria mentira em cima da segunda.
            else if (_pessoas.isEmpty && _falha == null)
              _estadoVazio(cores, textos)
            else ...<Widget>[
              ..._pessoas.map((PessoaConectada pessoa) => _linha(cores, textos, pessoa)),
              if (_temMais) _botaoDeVerMais(),
            ],
          ],
        ),
      ),
    );
  }

  /// **Só números**, e eles ficam ao lado da lista e não no lugar dela.
  ///
  /// A frase é a mesma ideia da linha de `Pedidos de conexão`, sem a parte dos
  /// pedidos de hoje: aquele número é sobre **pedir**, e esta tela não pede.
  Widget _linhaDoResumo(BichuCores cores, TextTheme textos, ResumoDeConexoes resumo) {
    return Semantics(
      container: true,
      child: Text(
        TelaDeMinhasConexoes.linhaDoResumo(resumo.connectedCount, resumo.connectionLimit),
        style: textos.bodySmall?.copyWith(color: cores.textSecondary),
      ),
    );
  }

  /// O vazio **diz o que fazer**, e o caminho que ele aponta existe: a busca de
  /// pessoas é a aba `Usuários` da `Comunidade`, e o convite é do próprio
  /// perfil. Um vazio que só dissesse "nada aqui" deixaria a pessoa sem o passo
  /// seguinte na única tela em que ele é óbvio.
  Widget _estadoVazio(BichuCores cores, TextTheme textos) {
    return Padding(
      padding: const EdgeInsets.symmetric(vertical: BichuEspaco.e8),
      child: Column(
        children: <Widget>[
          Text(
            TelaDeMinhasConexoes.vazio,
            style: textos.titleMedium?.copyWith(color: cores.textPrimary),
            textAlign: TextAlign.center,
          ),
          const SizedBox(height: BichuEspaco.e2),
          Text(
            TelaDeMinhasConexoes.comoComecar,
            style: textos.bodyMedium?.copyWith(color: cores.textSecondary),
            textAlign: TextAlign.center,
          ),
        ],
      ),
    );
  }

  Widget _botaoDeVerMais() {
    return Padding(
      padding: const EdgeInsets.only(top: BichuEspaco.e4),
      child: BotaoSecundario(
        rotulo: TelaDeMinhasConexoes.verMais,
        carregando: _carregandoMais,
        aoTocar: () => unawaited(_carregarMais()),
      ),
    );
  }

  /// UMA pessoa. **A linha inteira é a porta do perfil**, e aqui isso é seguro
  /// — ao contrário do cartão de pedido, que tem `Aceitar`/`Recusar` dentro e
  /// por isso só deixa o NOME ser tocável. Esta linha não tem controle nenhum
  /// dentro, então não há gesto que possa errar o alvo e virar navegação.
  ///
  /// `handle` **não é anulável** em `ConnectedPerson`: a consulta exige apelido,
  /// porque cada linha é uma porta e uma linha sem apelido seria uma porta que
  /// não abre. Então não há aqui o ramo "texto puro" que a tela de pedidos tem.
  Widget _linha(BichuCores cores, TextTheme textos, PessoaConectada pessoa) {
    final nome = pessoa.nomeParaLer;
    return Semantics(
      button: true,
      label: TelaDeMinhasConexoes.rotuloDoPerfilDe(nome),
      excludeSemantics: true,
      child: InkWell(
        // `push` e nao `go`: o perfil COBRE esta tela, e voltar dele tem de
        // devolver a lista onde a pessoa estava -- `go` trocaria de ramo e a
        // lista voltaria da primeira pagina.
        onTap: () => context.push(Rotas.perfilDe(pessoa.handle)),
        child: Container(
          constraints: const BoxConstraints(minHeight: 64),
          padding: const EdgeInsets.symmetric(vertical: BichuEspaco.e2),
          child: Row(
            children: <Widget>[
              _avatar(cores, textos, pessoa),
              const SizedBox(width: BichuEspaco.e3),
              Expanded(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: <Widget>[
                    Text(
                      nome,
                      style: textos.titleMedium?.copyWith(color: cores.textPrimary),
                      maxLines: 1,
                      overflow: TextOverflow.ellipsis,
                    ),
                    Text(
                      '${TelaDeMinhasConexoes.rotuloDePets(pessoa.petsCount)} · '
                      '${TelaDeMinhasConexoes.rotuloDeConexoes(pessoa.connectionsCount)}',
                      style: textos.bodySmall?.copyWith(color: cores.textSecondary),
                    ),
                  ],
                ),
              ),
              Icon(Icons.chevron_right, color: cores.textSecondary),
            ],
          ),
        ),
      ),
    );
  }

  /// O avatar: **a foto quando há uma, a inicial quando não há.**
  ///
  /// **Decorativo nos dois casos**, como no cartão da busca: o nome é lido ao
  /// lado, e um leitor de tela que anunciasse os dois leria "M, Marina".
  Widget _avatar(BichuCores cores, TextTheme textos, PessoaConectada pessoa) {
    final url = pessoa.photoIconUrl;
    if (url == null || url.isEmpty) return _circuloDaInicial(cores, textos, pessoa);
    return ExcludeSemantics(
      child: ClipOval(
        child: ImagemDaRede(
          url: url,
          descricao: null,
          largura: TelaDeMinhasConexoes.ladoDoCirculo,
          simboloDeFalha: Icons.person_outline,
        ),
      ),
    );
  }

  /// O círculo com a inicial — **a queda de quem não tem foto pronta**. Foto em
  /// `processing` ou `rejected` não sai do servidor, e o recurso é o que a
  /// emenda 3 do ADR-0010 manda usar.
  Widget _circuloDaInicial(BichuCores cores, TextTheme textos, PessoaConectada pessoa) {
    final inicial =
        pessoa.inicial.isEmpty ? TelaDeMinhasConexoes.inicialDeQuemNaoTem : pessoa.inicial;
    return ExcludeSemantics(
      child: Container(
        width: TelaDeMinhasConexoes.ladoDoCirculo,
        height: TelaDeMinhasConexoes.ladoDoCirculo,
        alignment: Alignment.center,
        decoration: BoxDecoration(color: cores.primaryContainer, shape: BoxShape.circle),
        child: Text(
          inicial,
          style: textos.titleLarge?.copyWith(color: cores.onPrimaryContainer),
        ),
      ),
    );
  }
}
