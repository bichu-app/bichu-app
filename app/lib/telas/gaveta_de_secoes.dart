import 'package:flutter/material.dart';
import 'package:go_router/go_router.dart';

import '../roteamento/rotas.dart';
import '../theme/bichu_colors.dart';
import '../theme/bichu_tokens.g.dart';

/// A FORMA de um sub-destino, e por que ela decide se ele entra na gaveta.
///
/// A UX 27.5 lista quarenta e oito sub-destinos, e **a maioria deles nunca foi
/// item de menu**. Filtro e folha inferior (11.9); busca e campo na propria
/// tela; o aviso de cadastro incompleto e faixa; "tres estados vazios" e
/// estado. Uma gaveta que listasse as quarenta e oito linhas estaria errada
/// mesmo se as quarenta e oito estivessem construidas: ela ofereceria como
/// endereco coisas que nao tem endereco.
///
/// Declarar a forma no registro e o que permite ao portao provar isso em vez
/// de alguem afirmar. So [FormaDoSubDestino.destino] vira item.
enum FormaDoSubDestino {
  /// Tem endereco proprio e e alcancavel por menu. **Unica forma que vira
  /// item de gaveta.**
  destino,

  /// Tela de detalhe de um item de lista. Tem endereco, e ele carrega um
  /// identificador: so se chega la pelo item, nunca por menu. Um item de
  /// gaveta que abrisse "o detalhe do pet perdido" teria de inventar qual pet.
  detalhe,

  /// Folha inferior (design system 11.9). Filtro e ordenacao moram aqui, por
  /// decisao de 25.6.
  folhaInferior,

  /// Acao ou campo na propria tela: busca, seletor de cidade, `Vou
  /// participar`, `Encerrar caso`, `Sair`.
  acaoNaTela,

  /// O conteudo da secao, ou um bloco dentro de uma tela que ja existe. Nao e
  /// destino: a propria aba ja o mostra.
  conteudoDaSecao,

  /// Faixa persistente no topo, ou estado de tela.
  faixaOuEstado,
}

/// O estado de construcao de um sub-destino, com a mesma regua de 27.5.
enum EstadoDoSubDestino {
  /// Codigo rodando, com tela de verdade do outro lado.
  existe,

  /// O mapa declara e ninguem construiu.
  planejada,
}

/// Uma linha do inventario de 27.5.
///
/// [rota] e nulo enquanto o sub-destino nao tem endereco. **Nao e detalhe de
/// implementacao:** o criterio 2 da BICHUS-62 proibe renderizar acao sem
/// destino, e um item so pode existir quando ha para onde ir. O portao exige
/// que todo `destino` em [EstadoDoSubDestino.existe] tenha rota registrada no
/// roteador de verdade.
class SubDestino {
  const SubDestino({
    required this.rotulo,
    required this.forma,
    required this.estado,
    this.rota,
  });

  /// O nome curto, como a UX 27.5 o escreve.
  final String rotulo;

  final FormaDoSubDestino forma;
  final EstadoDoSubDestino estado;

  /// O endereco, quando existe. Nulo e a afirmacao de que ainda nao ha para
  /// onde ir, e o portao a cobra.
  final String? rota;

  /// Se ele vira item da gaveta.
  ///
  /// As tres condicoes sao independentes de proposito: forma errada
  /// (um filtro), estado errado (nao construido) e endereco ausente (rota
  /// nula) sao tres maneiras diferentes de um item nascer morto, e a gaveta
  /// recusa as tres.
  bool get viraItem =>
      forma == FormaDoSubDestino.destino &&
      estado == EstadoDoSubDestino.existe &&
      rota != null;

  /// Se ele e destino de menu que **ainda nao existe**. Estes sao nomeados em
  /// texto, e nunca renderizados como controle.
  bool get pendente =>
      forma == FormaDoSubDestino.destino &&
      estado == EstadoDoSubDestino.planejada;
}

/// O inventario de sub-destinos de 27.5, por rota de secao.
///
/// **Transcrito da UX 27.5, e nao inventado aqui.** As quatro colunas do
/// documento viram [SubDestino.rotulo], [SubDestino.forma],
/// [SubDestino.estado] e [SubDestino.rota]. Onde o documento e o codigo
/// divergem, vale o codigo, e a divergencia esta comentada na linha: o
/// documento fechou em 21/09 e o app continuou andando.
abstract final class RegistroDeSubDestinos {
  static const Map<String, List<SubDestino>>
  porSecao = <String, List<SubDestino>>{
    // -- 27.5.1 `Pets` ----------------------------------------------------
    Rotas.pets: <SubDestino>[
      SubDestino(
        rotulo: 'Caso aberto',
        forma: FormaDoSubDestino.conteudoDaSecao,
        estado: EstadoDoSubDestino.planejada,
      ),
      SubDestino(
        rotulo: 'Aviso de cadastro incompleto',
        forma: FormaDoSubDestino.faixaOuEstado,
        // Construido na BICHUS-75: `AvisoDeCadastroIncompleto` ja e pintado
        // nesta secao. Faixa nao e item de menu, e por isso ele nao entra na
        // gaveta mesmo existindo.
        estado: EstadoDoSubDestino.existe,
      ),
      SubDestino(
        rotulo: 'Lista de pets perdidos da região',
        forma: FormaDoSubDestino.conteudoDaSecao,
        estado: EstadoDoSubDestino.planejada,
      ),
      SubDestino(
        rotulo: 'Adoções',
        forma: FormaDoSubDestino.destino,
        estado: EstadoDoSubDestino.existe,
        rota: Rotas.adocoes,
      ),
      SubDestino(
        rotulo: 'Busca',
        forma: FormaDoSubDestino.acaoNaTela,
        estado: EstadoDoSubDestino.planejada,
      ),
      SubDestino(
        rotulo: 'Filtros',
        forma: FormaDoSubDestino.folhaInferior,
        estado: EstadoDoSubDestino.planejada,
      ),
      SubDestino(
        rotulo: 'Ordenação',
        forma: FormaDoSubDestino.folhaInferior,
        estado: EstadoDoSubDestino.planejada,
      ),
      SubDestino(
        rotulo: 'Seletor de cidade',
        forma: FormaDoSubDestino.acaoNaTela,
        estado: EstadoDoSubDestino.planejada,
      ),
      SubDestino(
        rotulo: 'Escanear uma tag',
        forma: FormaDoSubDestino.destino,
        estado: EstadoDoSubDestino.existe,
        rota: Rotas.escanear,
      ),
      SubDestino(
        rotulo: 'Registrar achado avulso',
        forma: FormaDoSubDestino.destino,
        // A UX 27.5.1 escreve `planejada`, e o documento fechou em 21/09. A
        // BICHUS-35 entregou `TelaRegistrarAchado` depois disso, com rota
        // registrada e formulario de verdade. Vale o que o repositorio
        // sustenta.
        estado: EstadoDoSubDestino.existe,
        rota: Rotas.registrarAchado,
      ),
      SubDestino(
        rotulo: 'Possíveis correspondências',
        // "Pendurada no caso aberto": nao ha como chegar la sem um caso, e a
        // gaveta nao sabe qual caso.
        forma: FormaDoSubDestino.acaoNaTela,
        estado: EstadoDoSubDestino.planejada,
      ),
      SubDestino(
        rotulo: 'Conversa mediada',
        forma: FormaDoSubDestino.acaoNaTela,
        estado: EstadoDoSubDestino.planejada,
      ),
      SubDestino(
        rotulo: 'Cartaz',
        forma: FormaDoSubDestino.acaoNaTela,
        estado: EstadoDoSubDestino.planejada,
      ),
      SubDestino(
        rotulo: 'Encerrar caso',
        forma: FormaDoSubDestino.acaoNaTela,
        estado: EstadoDoSubDestino.planejada,
      ),
      SubDestino(
        rotulo: 'Detalhe do pet perdido',
        forma: FormaDoSubDestino.detalhe,
        estado: EstadoDoSubDestino.planejada,
      ),
      SubDestino(
        rotulo: 'Três estados vazios',
        forma: FormaDoSubDestino.faixaOuEstado,
        estado: EstadoDoSubDestino.planejada,
      ),
    ],
    // -- 27.5.2 `Rede` ----------------------------------------------------
    Rotas.rede: <SubDestino>[
      SubDestino(
        rotulo: 'Eventos da região',
        forma: FormaDoSubDestino.conteudoDaSecao,
        estado: EstadoDoSubDestino.planejada,
      ),
      SubDestino(
        rotulo: 'Detalhe do evento',
        forma: FormaDoSubDestino.detalhe,
        estado: EstadoDoSubDestino.planejada,
      ),
      SubDestino(
        rotulo: 'Vou participar',
        forma: FormaDoSubDestino.acaoNaTela,
        estado: EstadoDoSubDestino.planejada,
      ),
      SubDestino(
        rotulo: 'Filtros',
        forma: FormaDoSubDestino.folhaInferior,
        estado: EstadoDoSubDestino.planejada,
      ),
      SubDestino(
        rotulo: 'Feed da comunidade',
        forma: FormaDoSubDestino.conteudoDaSecao,
        estado: EstadoDoSubDestino.planejada,
      ),
      SubDestino(
        rotulo: 'Mensagens',
        forma: FormaDoSubDestino.destino,
        estado: EstadoDoSubDestino.planejada,
      ),
    ],
    // -- 27.5.3 `Perto` ---------------------------------------------------
    Rotas.perto: <SubDestino>[
      SubDestino(
        rotulo: 'Profissionais e estabelecimentos',
        forma: FormaDoSubDestino.conteudoDaSecao,
        // A UX 27.5.3 escreve `planejada`, e o documento fechou em 21/09. A
        // secao `Perto` foi construida depois disso: `PaginaDoDiretorio` lista
        // profissional e estabelecimento com nivel de verificacao, e a lista e
        // o CORPO da secao. Vale o que o repositorio sustenta, como ja valeu
        // para `Registrar achado avulso`.
        //
        // Continua sendo `conteudoDaSecao`, e a forma e que decide: a propria
        // aba ja mostra o diretorio, entao ele nao vira item de gaveta nem
        // depois de existir. Mudou o estado, nao a regra.
        estado: EstadoDoSubDestino.existe,
      ),
      SubDestino(
        rotulo: 'ONGs',
        // Filtro do proprio diretorio (`entity_kind: organization`), e nao
        // destino.
        forma: FormaDoSubDestino.folhaInferior,
        estado: EstadoDoSubDestino.planejada,
      ),
      SubDestino(
        rotulo: 'Pets de ONGs para adoção',
        forma: FormaDoSubDestino.destino,
        estado: EstadoDoSubDestino.existe,
        rota: Rotas.adocoes,
      ),
      SubDestino(
        rotulo: 'Avaliações da comunidade',
        forma: FormaDoSubDestino.conteudoDaSecao,
        estado: EstadoDoSubDestino.planejada,
      ),
      SubDestino(
        rotulo: 'Filtros',
        // **Nao e folha inferior, e nao e mais `planejada`.** A 27.5.3
        // herdou de 25.6 a folha inferior para filtro; a tela que foi
        // construida poe o controle de filtro NO CORPO, logo acima da lista,
        // junto da ordenacao, que e o padrao de listagem deste app. Onde o
        // documento e o codigo divergem, vale o codigo.
        //
        // `acaoNaTela` e a forma certa e ela mantem o item FORA da gaveta
        // pelo mesmo motivo de antes: filtro nao tem endereco. A regra nao
        // afrouxou; o que mudou foi onde o controle mora.
        forma: FormaDoSubDestino.acaoNaTela,
        estado: EstadoDoSubDestino.existe,
      ),
      SubDestino(
        rotulo: 'Detalhe do profissional ou da ONG',
        forma: FormaDoSubDestino.detalhe,
        estado: EstadoDoSubDestino.planejada,
      ),
      SubDestino(
        rotulo: 'Convidar um profissional',
        forma: FormaDoSubDestino.acaoNaTela,
        estado: EstadoDoSubDestino.planejada,
      ),
      SubDestino(
        rotulo: 'Reivindicar este perfil',
        forma: FormaDoSubDestino.acaoNaTela,
        estado: EstadoDoSubDestino.planejada,
      ),
    ],
    // -- 27.5.4 `Loja` ----------------------------------------------------
    Rotas.loja: <SubDestino>[
      SubDestino(
        rotulo: 'Catálogo próprio',
        forma: FormaDoSubDestino.conteudoDaSecao,
        estado: EstadoDoSubDestino.planejada,
      ),
      SubDestino(
        rotulo: 'Filtros de categoria',
        forma: FormaDoSubDestino.folhaInferior,
        estado: EstadoDoSubDestino.planejada,
      ),
      SubDestino(
        rotulo: 'Plaquinha de reposição',
        // "Item do catalogo", e nao destino proprio.
        forma: FormaDoSubDestino.conteudoDaSecao,
        estado: EstadoDoSubDestino.planejada,
      ),
      SubDestino(
        rotulo: 'Doações',
        forma: FormaDoSubDestino.destino,
        estado: EstadoDoSubDestino.planejada,
      ),
      SubDestino(
        rotulo: 'Carrinho e pedido',
        forma: FormaDoSubDestino.destino,
        estado: EstadoDoSubDestino.planejada,
      ),
      SubDestino(
        rotulo: 'Meus pedidos',
        forma: FormaDoSubDestino.destino,
        estado: EstadoDoSubDestino.planejada,
      ),
    ],
    // -- 27.5.5 `Perfil` --------------------------------------------------
    Rotas.perfil: <SubDestino>[
      SubDestino(
        rotulo: 'Crachá de identidade',
        forma: FormaDoSubDestino.conteudoDaSecao,
        estado: EstadoDoSubDestino.planejada,
      ),
      SubDestino(
        rotulo: 'Meus pets',
        // Construido (BICHUS-62) e **sem endereco proprio**: e um bloco
        // dentro da aba `Perfil`. Um item de gaveta precisaria de uma rota
        // que nao existe, e inventa-la aqui seria criar endereco para uma
        // tela que nao ha.
        forma: FormaDoSubDestino.conteudoDaSecao,
        estado: EstadoDoSubDestino.existe,
      ),
      SubDestino(
        rotulo: 'Cadastrar pet',
        forma: FormaDoSubDestino.destino,
        estado: EstadoDoSubDestino.existe,
        rota: Rotas.cadastrarPet,
      ),
      SubDestino(
        rotulo: 'A tag do meu pet',
        // F1.7 esta construida e mora DENTRO de T.1, o detalhe do pet: o QR
        // aparece na tela do animal. Nao ha endereco proprio.
        forma: FormaDoSubDestino.conteudoDaSecao,
        estado: EstadoDoSubDestino.existe,
      ),
      SubDestino(
        rotulo: 'Escanear uma tag',
        forma: FormaDoSubDestino.destino,
        estado: EstadoDoSubDestino.existe,
        rota: Rotas.escanear,
      ),
      SubDestino(
        rotulo: 'Convidar vizinhos',
        forma: FormaDoSubDestino.destino,
        estado: EstadoDoSubDestino.planejada,
      ),
      SubDestino(
        rotulo: 'Editar o perfil',
        forma: FormaDoSubDestino.destino,
        estado: EstadoDoSubDestino.planejada,
      ),
      SubDestino(
        rotulo: 'Notificações',
        forma: FormaDoSubDestino.destino,
        estado: EstadoDoSubDestino.planejada,
      ),
      SubDestino(
        rotulo: 'Transferir um pet',
        forma: FormaDoSubDestino.destino,
        estado: EstadoDoSubDestino.planejada,
      ),
      SubDestino(
        rotulo: 'Termos',
        // A UX 27.5.5 escreve `existe`, e nao existe: o `TextButton` de termos
        // saiu do `Perfil` por decisao do cliente em 22/09 (BICHUS-232) e nao
        // ha tela nem rota de termos no app. Os documentos vivem na F1.1,
        // onde sao o objeto do aceite. Repor um item aqui reprova a isca de
        // `test/telas/termos_so_no_cadastro_test.dart`.
        forma: FormaDoSubDestino.destino,
        estado: EstadoDoSubDestino.planejada,
      ),
      SubDestino(
        rotulo: 'Sair da conta',
        forma: FormaDoSubDestino.acaoNaTela,
        estado: EstadoDoSubDestino.existe,
      ),
      SubDestino(
        rotulo: 'Excluir a conta',
        forma: FormaDoSubDestino.folhaInferior,
        estado: EstadoDoSubDestino.planejada,
      ),
    ],
  };

  /// O inventario inteiro, numa lista so.
  static List<SubDestino> get todos => <SubDestino>[
    for (final linhas in porSecao.values) ...linhas,
  ];

  /// Os itens vivos de [rotaDaSecao], na ordem do documento.
  static List<SubDestino> itensDe(String rotaDaSecao) {
    final linhas = porSecao[rotaDaSecao];
    if (linhas == null) {
      throw ArgumentError.value(
        rotaDaSecao,
        'rotaDaSecao',
        'nao tem linha no registro de sub-destinos (UX 27.5)',
      );
    }
    return linhas.where((s) => s.viraItem).toList(growable: false);
  }

  /// Os destinos de menu de [rotaDaSecao] que ainda **nao** existem.
  static List<SubDestino> pendentesDe(String rotaDaSecao) {
    final linhas = porSecao[rotaDaSecao];
    if (linhas == null) {
      throw ArgumentError.value(
        rotaDaSecao,
        'rotaDaSecao',
        'nao tem linha no registro de sub-destinos (UX 27.5)',
      );
    }
    return linhas.where((s) => s.pendente).toList(growable: false);
  }
}

/// Os textos da gaveta, num lugar so.
///
/// Sao dois, e o numero e a decisao: o cliente reprovou a gaveta em 23/09 com
/// "parece mais uma pagina do que menu, com tanto texto, tanta explicacao".
/// Sairam o titulo, o paragrafo que explicava a divisao com a barra de baixo e
/// as linhas de `Em construcao` que nomeavam nove telas inexistentes. Menu nao
/// carrega roadmap, e explicacao de navegacao que precisa ser escrita na
/// propria navegacao e navegacao que nao ficou clara.
///
/// O que sobra e o nome acessivel do gatilho, que **nao** e pintado na gaveta.
abstract final class TextosDaGaveta {
  /// O nome acessivel do gatilho (11.23.3).
  ///
  /// Ele diz o que o botao ABRE, e nao so "menu": com uma barra de cinco
  /// secoes logo abaixo, "menu" seria ambiguo entre os dois. E ele diz
  /// **desta secao**, porque e so isso que a gaveta passou a mostrar.
  static const String abrirAGaveta = 'Abrir o submenu desta seção';
}

/// A gaveta lateral: **o submenu da secao em que a pessoa esta**, e nada mais.
///
/// ## A decisao que a define, e que mudou em 23/09
///
/// Ela mostrava as cinco secoes com os sub-destinos de todas, um titulo, um
/// paragrafo de explicacao e tres linhas nomeando o que nao existe: 736
/// caracteres em 22 blocos de texto para seis itens que navegam. O cliente
/// leu e reprovou: **a gaveta tinha virado uma pagina, e ela replicava o menu
/// principal em vez de abrir o submenu dele.**
///
/// O que ela e agora: uma linha por sub-destino da secao ATUAL, so o rotulo,
/// nada das outras quatro. A barra de baixo troca de secao; a gaveta entra nos
/// caminhos de dentro da secao em que se esta. A divisao entre os dois menus
/// deixou de ser uma frase na tela e passou a ser a estrutura: nao ha como a
/// gaveta oferecer a mesma viagem que a barra, porque ela nao conhece secao
/// nenhuma alem da propria.
///
/// ## O nome da secao NAO aparece como cabecalho
///
/// A barra de topo desta mesma tela ja pinta `Pets`, `Perto` ou `Perfil` ao
/// lado do proprio gatilho que abriu a gaveta. Repetir a palavra dentro dela
/// seria a terceira vez que ela aparece na mesma tela -- e foi exatamente a
/// duplicacao que o cliente apontou. Quem abre o submenu acabou de tocar no
/// botao daquela secao: ele nao precisa ser informado de onde esta.
///
/// ## Secao sem sub-destino nao tem gaveta
///
/// `Rede` e `Loja` nao tem nenhum sub-destino construido. Uma gaveta vazia e
/// um controle que abre o nada, que e o criterio 2 da BICHUS-62 pelo caminho
/// mais silencioso. Elas nao montam a gaveta e nao desenham o gatilho -- ver
/// `ControleDaGaveta.temSubDestinos`, que e onde isso e decidido.
class GavetaDeSecoes extends StatelessWidget {
  const GavetaDeSecoes({required this.rotaDaSecao, super.key});

  /// A secao cujo submenu esta gaveta mostra. **A atual, e so ela.**
  final String rotaDaSecao;

  @override
  Widget build(BuildContext context) {
    final itens = RegistroDeSubDestinos.itensDe(rotaDaSecao);

    return Drawer(
      child: SafeArea(
        child: ListView(
          // Pelo mesmo motivo de `TelaDeAba`: o padrao do `ListView` embrulha
          // cada filho num `IndexedSemantics` e colapsa o grupo inteiro num
          // no so, anunciado como botao. Foi o defeito que a BICHUS-62 achou.
          addSemanticIndexes: false,
          padding: const EdgeInsets.symmetric(
            horizontal: BichuEspaco.e4,
            vertical: BichuEspaco.e4,
          ),
          children: <Widget>[
            for (final item in itens)
              ItemDaGaveta(item: item, rotaDaSecao: rotaDaSecao),
          ],
        ),
      ),
    );
  }
}

/// Um caminho vivo: **uma linha, so o rotulo**. A rota nao aceita nulo.
class ItemDaGaveta extends StatelessWidget {
  const ItemDaGaveta({
    required this.item,
    required this.rotaDaSecao,
    super.key,
  });

  final SubDestino item;

  /// A secao a que este item pertence. Entra so na [chaveDe]: `Escanear uma
  /// tag` aparece em `Pets` e em `Perfil` (as duas portas de 27.5.6) e
  /// `Adoções` aparece em `Pets` e em `Perto`, entao o rotulo sozinho nao
  /// identifica o item nem para o teste nem para o `Element` do Flutter.
  final String rotaDaSecao;

  /// A chave de um item, para o portao apontar para UM item e nao para dois.
  static Key chaveDe(String rotaDaSecao, String rotulo) =>
      ValueKey<String>('gaveta$rotaDaSecao/$rotulo');

  @override
  Widget build(BuildContext context) {
    final cores = BichuColors.of(context).cores;
    final rota = item.rota!;

    return ListTile(
      key: chaveDe(rotaDaSecao, item.rotulo),
      contentPadding: EdgeInsets.zero,
      // O piso de alvo de toque do 6.5. `ListTile` nasce com 56 e o piso
      // critico de navegacao e 64.
      minTileHeight: BichuAlvoDeToque.critico,
      // **`title` e mais nada.** Nao ha `subtitle` aqui, e a ausencia e a
      // decisao: as seis linhas de apoio ("Leia o QR da coleira de um pet.")
      // eram metade do texto da gaveta e nenhuma delas dizia algo que o
      // rotulo nao dissesse. O campo `descricao` saiu do `SubDestino` junto,
      // para que a linha de apoio nao tenha de onde voltar.
      title: Text(item.rotulo),
      trailing: Icon(Icons.chevron_right, color: cores.textSecondary),
      onTap: () {
        // O roteador e lido ANTES de fechar a gaveta: depois do `pop` este
        // `context` ainda vive, mas depender disso e depender de detalhe de
        // implementacao do `Drawer`.
        final roteador = GoRouter.of(context);
        // A gaveta fecha primeiro. Uma gaveta que ficasse aberta por cima da
        // tela de destino deixaria a pessoa achando que o toque nao pegou.
        //
        // `closeDrawer()`, e **nao** `Navigator.pop`. O `pop` e o idioma que
        // a amostra do `Drawer` usa e ele age no NAVEGADOR: aqui ele
        // desempilharia a rota da casca em vez de fechar a gaveta, e o
        // `push` seguinte chegava numa pilha que nao era mais a mesma --
        // medido, o toque em `Adoções` terminava em `/pets`.
        Scaffold.of(context).closeDrawer();
        // `push`, e nao `go`: os seis atalhos vivos sao rotas IRMAS da casca
        // (o leitor, o assistente de cadastro, o achado avulso, as adocoes),
        // e todas cobrem a barra. Tela que cobre a casca precisa ter volta.
        roteador.push(rota);
      },
    );
  }
}

/// O gatilho da gaveta, na barra de topo.
///
/// ## Por que ele fica na ESQUERDA, e o que isso resolve
///
/// A UX 25.6 e a 27.5 recusaram a gaveta a direita, e o motivo delas continua
/// de pe depois de o cliente decidir pela gaveta: o 11.23.1 da UM slot de acao
/// a direita, e em `Pets` e em `Perto` ele e do `Filtros`. A esquerda esta
/// livre justamente nas cinco raizes de aba, porque a variante delas e
/// `Saida=Nenhuma` (23.4): quem chega numa aba chegou pela barra de baixo e
/// nao ha o que desempilhar.
///
/// **Saida e hamburguer nunca coexistem**, e isso e garantido pela
/// construcao, nao pela disciplina: `TelaDeAba` so monta este botao quando a
/// tela e raiz de secao, e raiz de secao nao tem saida. A composicao
/// `Saida + titulo + hamburguer` nao existe em tela nenhuma deste app.
///
/// ## O arrasto de borda
///
/// `Scaffold.drawerEnableOpenDragGesture` e **falso** onde esta gaveta e
/// montada. O padrao do Flutter e verdadeiro, e com ele a borda esquerda
/// passaria a abrir a gaveta -- a mesma borda que no iOS e o voltar do sistema
/// e que no Android e o voltar por gesto em qualquer uma das duas bordas. A
/// gaveta abre **so por este botao**.
class BotaoDaGaveta extends StatelessWidget {
  const BotaoDaGaveta({super.key});

  @override
  Widget build(BuildContext context) {
    return IconButton(
      // O `tooltip` vira o nome acessivel (11.23.3).
      tooltip: TextosDaGaveta.abrirAGaveta,
      // O desenho do glifo continua em 24 dp, que e o padrao do `IconButton`
      // e o que o 11.23.1 pede. O que muda e o ALVO, abaixo.
      icon: const Icon(Icons.menu),
      // 64 x 64 dp, o alvo do 11.23.1 (`target.critico`). O `IconButton`
      // nasce com 40 x 40 -- abaixo do piso de 48 do M3 e muito abaixo do
      // piso critico de 64 que esta barra usa.
      constraints: const BoxConstraints(
        minWidth: BichuAlvoDeToque.critico,
        minHeight: BichuAlvoDeToque.critico,
      ),
      // **A gaveta que ele abre e a da CASCA, e nao a do `Scaffold` desta
      // tela.** `Scaffold.of(context)` devolveria o `Scaffold` da propria
      // `TelaDeAba`, que fica DENTRO do corpo da casca -- e uma gaveta
      // montada ali nao consegue bloquear a semantica da barra de baixo, que
      // e irma dela no `Scaffold` de cima. Medido: com a gaveta no
      // `Scaffold` interno, os cinco destinos da barra continuavam tocaveis
      // com a gaveta aberta, que e a armadilha de leitor de tela lendo o
      // fundo. Ver `test/telas/gaveta_com_submenus_test.dart`, grupo 6.
      onPressed: ControleDaGaveta.of(context).abrir,
    );
  }
}

/// O caminho do gatilho ate a gaveta da casca.
///
/// Existe porque os dois nao sao vizinhos: o gatilho mora na barra de topo de
/// `TelaDeAba`, que e um `Scaffold` DENTRO do corpo de `CascaComAbas`, e a
/// gaveta mora no `Scaffold` de fora -- o mesmo que carrega a barra de baixo.
/// Sem essa vizinhanca, a cortina modal da gaveta nao cobre a barra e o leitor
/// de tela continua alcancando o fundo.
///
/// Um `GlobalKey` estatico resolveria e traria outro problema: chave global
/// reaproveitada entre duas arvores vivas estoura, e a suite monta o app
/// dezenas de vezes.
class ControleDaGaveta extends InheritedWidget {
  const ControleDaGaveta({
    required this.abrir,
    required this.temSubDestinos,
    required super.child,
    super.key,
  });

  final VoidCallback abrir;

  /// Se a secao ATUAL tem algum sub-destino construido.
  ///
  /// **E daqui que sai a decisao de desenhar o gatilho**, e nao de
  /// `raizDeSecao` sozinho. `Rede` e `Loja` nao tem nenhum: um hamburguer ali
  /// abriria uma gaveta vazia, que e acao sem destino (criterio 2 da
  /// BICHUS-62) na forma mais silenciosa que existe -- o controle responde ao
  /// toque, a cortina escurece a tela e nao ha nada para tocar.
  ///
  /// A casca tambem nao MONTA a gaveta nessas secoes, e as duas coisas andam
  /// juntas de proposito: gaveta montada sem gatilho ainda seria alcancavel
  /// por `openDrawer` de qualquer codigo futuro.
  final bool temSubDestinos;

  /// O controle, ou nulo quando nao ha casca acima.
  ///
  /// Nao e caso teorico: `rotas.dart` usa `AbaPerfil()` como tela de escape de
  /// rotas alcancadas sem o `extra` que esperavam, e essas rotas sao IRMAS da
  /// casca. Uma raiz de secao montada ali existe sem barra de baixo e sem
  /// gaveta, e o gatilho nao pode ser desenhado la: nao ha o que ele abra.
  static ControleDaGaveta? maybeOf(BuildContext context) {
    return context.dependOnInheritedWidgetOfExactType<ControleDaGaveta>();
  }

  static ControleDaGaveta of(BuildContext context) {
    final controle = maybeOf(context);
    if (controle == null) {
      // Falha ruidosa com o motivo, e nunca um gatilho mudo: um botao que
      // nao acha a gaveta e um controle sem acao, que e o defeito que o
      // criterio 2 proibe.
      throw FlutterError(
        'BotaoDaGaveta montado fora de CascaComAbas. O gatilho so existe na '
        'raiz de secao, e a raiz de secao vive dentro da casca -- que e quem '
        'carrega a gaveta e a barra de baixo no mesmo Scaffold.',
      );
    }
    return controle;
  }

  @override
  bool updateShouldNotify(ControleDaGaveta anterior) =>
      abrir != anterior.abrir || temSubDestinos != anterior.temSubDestinos;
}
