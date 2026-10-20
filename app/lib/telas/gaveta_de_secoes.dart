import 'package:flutter/material.dart';
import 'package:go_router/go_router.dart';

import '../roteamento/rotas.dart';
import 'conexoes/tela_pedidos_de_conexao.dart';
import 'seguranca/tela_de_bloqueados.dart';
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
    this.icone,
  }) : assert(
         // **TODO ITEM QUE A GAVETA PINTA TEM GLIFO.** A condicao e a mesma
         // de `viraItem`, palavra por palavra, e nao uma parecida: um item
         // que nasce vivo sem icone sairia como uma linha de texto no meio de
         // linhas com glifo, que e o desalinho que o pedido de 18/10/2026
         // veio fechar.
         //
         // **E so sobre o que a gaveta pinta.** Os dez `destino` em
         // `planejada` nao recebem glifo aqui: escolher o desenho de uma tela
         // que ninguem desenhou e decidir no codigo o que passa pelo Figma
         // primeiro, e o glifo chega junto com a tela, no dia em que a linha
         // sobe para `existe`. A assercao cobra no mesmo instante em que o
         // item passa a ser renderizado.
         !(forma == FormaDoSubDestino.destino &&
                 estado == EstadoDoSubDestino.existe &&
                 rota != null) ||
             icone != null,
         'Sub-destino VIVO sem icone. Item de gaveta sem glifo volta a ser a '
         'linha de texto que o cliente mandou enfeitar em 18/10/2026: '
         '"nos subitens dos menus voce deve colocar icones tambem". Escolha '
         'o glifo na familia embutida (Material Symbols, design system 10.1) '
         'e confira que nenhum outro item da MESMA secao ja o usa -- a '
         'colisao de dois sentidos num glifo so e a que o cliente leu no '
         'aparelho em 22/09.',
       );

  /// O nome curto, como a UX 27.5 o escreve.
  final String rotulo;

  final FormaDoSubDestino forma;
  final EstadoDoSubDestino estado;

  /// O endereco, quando existe. Nulo e a afirmacao de que ainda nao ha para
  /// onde ir, e o portao a cobra.
  final String? rota;

  /// O GLIFO do item, da familia embutida do Flutter (Material Symbols, a
  /// familia fechada do design system 10.1).
  ///
  /// **Nulo so em linha que a gaveta nao pinta** -- a assercao do construtor
  /// nao deixa um item vivo passar sem ele. Nenhum vetor novo, nada baixado,
  /// nada gerado e nenhuma dependencia: a mesma regra que
  /// `AcaoDeCriarFlutuante` ja segue.
  ///
  /// **Um glifo por sentido, dentro da secao.** Dois itens da mesma secao com
  /// o mesmo desenho e a colisao que o cliente leu no aparelho em 22/09
  /// (`edit_calendar` significando duas coisas na `Rede`), e e ela que o
  /// portao da gaveta cobra item por item.
  final IconData? icone;

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
        // **`existe` -> `planejada` em 19/10, e a LINHA NAO FOI APAGADA.**
        //
        // Nao existe rota de adocao no contrato -- confirmado por duas
        // leituras independentes --, e a tela do outro lado diz estar em
        // construcao. Item de gaveta que abre uma tela em construcao e acao
        // que promete, e o cliente mandou fechar esse defeito.
        //
        // `planejada` e o que o registro tem para dizer isto: por `viraItem`
        // o item sai da gaveta sozinho, e por `pendente` ele continua NOMEADO
        // no inventario de 27.5. A rota sai desta linha porque o portao exige
        // rota nula em item `planejada` -- rota preenchida e como ele volta a
        // aparecer no dia em que alguem mexer na condicao --, e ela continua
        // registrada no roteador para link profundo.
        estado: EstadoDoSubDestino.planejada,
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
        // **`qr_code_scanner`, e NAO `qr_code_2`.** Os dois existem na
        // familia e dizem coisas opostas: `qr_code_2` e o codigo EXIBIDO --
        // e o que a tela do pet pinta na plaquinha, e e o que a linha
        // `A tag do meu pet` deste mesmo inventario significa --, enquanto
        // `qr_code_scanner` traz a moldura de leitura em volta. Ler e mostrar
        // sao viagens opostas, e `qr_code_2` ja esta tomado com o outro
        // sentido no app: usa-lo aqui seria a colisao de 22/09 outra vez.
        icone: Icons.qr_code_scanner,
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
        // **O MEGAFONE: dar o aviso de que achei um bicho.** O que esta acao
        // produz e um AVISO para a vizinhanca, e nao um registro meu.
        //
        // Escolhido por eliminacao dentro da familia fechada do 10.1, como o
        // `more_time` da `Rede` foi:
        //
        //   - `add_location_alt` (alfinete com mais) seria o obvio e esta
        //     PROIBIDO pela vizinhanca: o alfinete e a forma da secao `Perto`
        //     desde a BICHUS-233 (`place`/`place_outlined` na barra de
        //     baixo), e um item de gaveta com a forma de outra secao leria
        //     como "ir para `Perto`" -- justamente o que a regra 4 do portao
        //     da gaveta proibe;
        //   - `pets` esta reservado a secao `Pets` na barra de baixo, pelo
        //     mesmo motivo;
        //   - `where_to_vote` ja significa "entregue" em
        //     `acompanhamento_do_pedido.dart`;
        //   - `add` sozinho nao diz O QUE se acrescenta.
        //
        // Sobra o objeto que a acao de fato produz: o aviso. Nenhum outro
        // item desta secao usa megafone.
        icone: Icons.campaign_outlined,
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
      // -- O QUE ERA 27.5.3 `Perto`, ABSORVIDO AQUI (19/10/2026) ------------
      //
      // A secao `Perto` deixou de existir: o conteudo dela virou a aba
      // `Comunidade` desta secao. **As oito linhas do inventario dela nao
      // foram apagadas, elas mudaram de chave** -- a 27.5 e um INVENTARIO, e
      // apagar linha de inventario porque a secao mudou de nome faz o
      // documento mentir sobre o que o produto tem.
      //
      // **A contagem total de linhas nao muda por esta mudanca** (52), e a de
      // `destino` tambem nao (17). O que muda e a distribuicao: `Rede` passou
      // de 6 para 14 linhas, e `Perto` saiu do mapa.
      //
      // Nenhuma das oito e `destino` VIVO, entao nenhuma delas precisou de
      // glifo -- a assercao do construtor cobra glifo so em item que a gaveta
      // PINTA. `Pets de ONGs para adoção` e `destino`, mas `planejada`.
      SubDestino(
        rotulo: 'Profissionais e estabelecimentos',
        forma: FormaDoSubDestino.conteudoDaSecao,
        // A UX 27.5.3 escreve `planejada`, e o documento fechou em 21/09. O
        // conteudo foi construido depois disso: `ListaDoDiretorio` lista
        // profissional e estabelecimento com nivel de verificacao, e a lista e
        // o CORPO da aba `Comunidade`. Vale o que o repositorio sustenta.
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
        // **`existe` -> `planejada` em 19/10, e a LINHA NAO FOI APAGADA.**
        //
        // Nao existe rota de adocao no contrato -- confirmado por duas
        // leituras independentes --, e a tela do outro lado diz estar em
        // construcao. Item de gaveta que abre uma tela em construcao e acao
        // que promete, e o cliente mandou fechar esse defeito.
        //
        // `planejada` e o que o registro tem para dizer isto: por `viraItem` o
        // item sai da gaveta sozinho, e por `pendente` ele continua NOMEADO no
        // inventario de 27.5. A rota sai desta linha porque o portao exige
        // rota nula em item `planejada`, e ela continua registrada no roteador
        // para link profundo.
        estado: EstadoDoSubDestino.planejada,
      ),
      SubDestino(
        rotulo: 'Avaliações da comunidade',
        forma: FormaDoSubDestino.conteudoDaSecao,
        estado: EstadoDoSubDestino.planejada,
      ),
      SubDestino(
        rotulo: 'Filtros do diretório',
        // **Nao e folha inferior, e nao e mais `planejada`.** A 27.5.3 herdou
        // de 25.6 a folha inferior para filtro; a tela que foi construida poe
        // o gatilho de filtro NO CORPO, na linha da busca -- e a DIREITA dela
        // desde a reversao de 19/10. Onde o documento e o codigo divergem,
        // vale o codigo.
        //
        // `acaoNaTela` e a forma certa e ela mantem o item FORA da gaveta pelo
        // mesmo motivo de antes: filtro nao tem endereco.
        //
        // **O ROTULO GANHOU `do diretório` em 19/10**, e nao e enfeite: com a
        // absorcao, esta secao passou a ter DUAS linhas chamadas `Filtros` --
        // a dos eventos, que ja era daqui, e esta, que vinha do `Perto`. Duas
        // linhas de mesmo nome no inventario de uma secao so e um inventario
        // que nao distingue o que inventaria.
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
    // -- A SECAO `Mural` (19/10/2026) -------------------------------------
    //
    // **UMA LINHA SO, e a contencao e deliberada.** O inventario de 27.5
    // descreve o que o produto TEM ou o que o mapa de UX DECLARA, e o `Mural`
    // nao esta em nenhum dos dois: ele e decisao de 19/10, posterior ao
    // documento, e o conteudo dele e de outra frente.
    //
    // Escrever aqui as linhas que eu IMAGINO que o Mural vai ter -- publicar,
    // a publicacao aberta, curtir, comentar, denunciar -- seria decidir no
    // codigo o desenho de telas que outra pessoa esta desenhando, e o
    // inventario passaria a ter cinco linhas que ninguem prometeu.
    //
    // A unica linha e a honesta: a secao tem um CORPO, ele e a linha do tempo,
    // e ele e `planejada`. Quem construir o conteudo acrescenta as linhas
    // dele com as telas.
    //
    // **Ela NAO e `destino` e portanto nao pede glifo** (a assercao do
    // construtor cobra glifo so em item que a gaveta PINTA): `conteudoDaSecao`
    // e a propria aba, que ja esta na barra com `dynamic_feed`.
    Rotas.mural: <SubDestino>[
      SubDestino(
        rotulo: 'Publicações das conexões',
        forma: FormaDoSubDestino.conteudoDaSecao,
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
    // -- A secao de mensagens (19/10) --------------------------------------
    //
    // **A linha existe e esta vazia de propósito.** Toda secao do registro
    // precisa de linha aqui -- `itensDe` estoura com `ArgumentError` quando
    // falta, e e assim que este registro impede que uma secao nova entre na
    // barra sem ninguem decidir qual e o submenu dela.
    //
    // Os sub-destinos de mensagens (a lista de conversas, a conversa, o
    // envio) sao de OUTRO agente e nao existem nesta arvore. Quando a area
    // dela descer, as linhas entram aqui; enquanto nao descem, a gaveta desta
    // secao mostra os destinos GLOBAIS, como `Rede` e `Loja` mostram.
    Rotas.mensagens: <SubDestino>[
      SubDestino(
        rotulo: 'Lista de conversas',
        forma: FormaDoSubDestino.conteudoDaSecao,
        estado: EstadoDoSubDestino.planejada,
      ),
      SubDestino(
        rotulo: 'Conversa',
        // Detalhe de um item da lista: o endereco carrega o id da conversa, e
        // so se chega la pela lista. Item de gaveta teria de inventar qual.
        forma: FormaDoSubDestino.detalhe,
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
        // **A FICHA NOVA, e nao a patinha.** O que o assistente produz e o
        // cadastro do animal -- nome, sinais, foto, tag --, e `note_add` e o
        // objeto com o sinal de mais embutido no proprio glifo, sem compor
        // dois desenhos (o 10.1 e a UX 27.3.1 proibem composicao, e foi o que
        // tirou `group_add` do lugar de "pessoas + mais" em `Perto`).
        //
        // **`pets` esta reservado**, e a razao esta escrita em
        // `casca_com_abas.dart`: a patinha e a forma da secao `Pets` na barra
        // de baixo. Item de gaveta com a forma de uma secao convida para a
        // secao, e a regra 4 do portao diz que nenhum item da gaveta navega
        // para secao -- este abre o assistente de cadastro.
        //
        // `notes_outlined` (sem o mais) ja e o bloco de "descricao" em tres
        // telas; o sinal de mais e o que separa os dois sentidos.
        icone: Icons.note_add_outlined,
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
        // O MESMO GLIFO DA OUTRA PORTA, de proposito: as duas linhas de
        // `Escanear uma tag` (27.5.1 e 27.5.5) sao a MESMA viagem, e o
        // recorte da gaveta e por ROTA. Glifos diferentes para a mesma rota
        // seriam duas leituras para um destino so.
        icone: Icons.qr_code_scanner,
      ),
      SubDestino(
        rotulo: 'Convidar vizinhos',
        forma: FormaDoSubDestino.destino,
        estado: EstadoDoSubDestino.planejada,
      ),
      // **LINHA NOVA (19/10/2026), e nao mudanca de estado -- a diferenca esta
      // dita aqui de proposito.** O procedimento desta casa e subir o estado do
      // sub-destino que a UX 27.5 ja nomeia; **nao ha linha para este**, porque
      // 27.5.5 fechou em 21/09 e a conexao entre pessoas e decisao de
      // 18/10/2026. Entao a linha nasce aqui, e nasce `existe`: a tela
      // (`TelaDePedidosDeConexao`) e a rota (`/conexoes/pedidos`) foram
      // entregues em 18/10 e ficaram SEM PORTA -- `Rotas.pedidosDeConexao` era
      // citada so em `rotas.dart`, e nenhum item de navegacao levava a ela. E
      // por isso que o cliente nao viu nada.
      //
      // **Em `Perfil` e nao em `Rede`**, e a razao e a mesma de `Meus achados`:
      // a caixa e das MINHAS decisoes -- `listMyConnectionRequests` exige conta
      // e a autorizacao mora no `WHERE` --, e o "meu" mora em `Perfil`. `Rede` e
      // a secao dos ENCONTROS da comunidade, que e outra coisa.
      //
      // **`destino` e nao `conteudoDaSecao`**: a tela tem `Scaffold`, barra de
      // saida e endereco proprio. Ela nao e um bloco da aba.
      SubDestino(
        // ACHADO DA MESCLA DE 19/10/2026, e nao escolha de estilo.
        //
        // A frente `gaveta-icones-e-alinhamento` poe uma ASSERCAO no
        // construtor de `SubDestino`: todo item VIVO (`destino` + `existe` +
        // `rota` nao nula) tem de ter glifo. A frente `bloqueados-e-titulo`
        // acrescentou esta linha VIVA sem `icone`, porque na base dela a
        // assercao ainda nao existia. As duas tocam partes diferentes deste
        // arquivo, entao o git MESCLOU SEM CONFLITO e o resultado quebrava
        // `const_eval_throws_exception` em `flutter analyze` -- defeito que
        // so aparece medindo a UNIAO, e nao em nenhum dos dois ramos.
        //
        // O glifo foi escolhido pelo procedimento que a propria assercao
        // manda: familia embutida (Material Symbols) e nenhum outro item
        // DESTA secao (`Rotas.perfil`) com o mesmo `codePoint` -- os tres que
        // ja moram aqui sao `note_add_outlined` (0xf22e), `qr_code_scanner`
        // (0xe4f7) e `manage_accounts_outlined` (0xf1ac).
        //
        // `person_add_alt_outlined` (0xf276): uma PESSOA sendo acrescentada, que
        // e exatamente o que um pedido de conexao e. Nao colide nesta secao.
        rotulo: TelaDePedidosDeConexao.titulo,
        forma: FormaDoSubDestino.destino,
        estado: EstadoDoSubDestino.existe,
        rota: Rotas.pedidosDeConexao,
        icone: Icons.person_add_alt_outlined,
      ),
      // **SEGUNDA LINHA NOVA (19/10/2026), pela mesma razao da de cima**: a UX
      // 27.5.5 fechou em 21/09 e nao tem linha para esta -- bloquear alguem e
      // decisao de 18/10 e a lista e decisao de 19/10. Ela nasce `existe`: a
      // tela (`TelaDeBloqueados`) e a rota (`/perfil/bloqueados`) entram no
      // mesmo commit desta linha.
      //
      // **ESTA PORTA E O UNICO CAMINHO DE VOLTA DE UM BLOQUEIO, e e por isso
      // que ela nao e conveniencia.** O bloqueio e SIMETRICO no servidor, e a
      // simetria fecha o perfil da pessoa bloqueada tambem para quem a
      // bloqueou (`404`) -- que e exatamente onde o `Desbloquear` do
      // `MenuDoPerfil` mora. Sem esta linha, bloquear era irreversivel pelo
      // aplicativo. Decisao do cliente, 19/10/2026: a lista mora aqui, e o
      // desbloqueio acontece nela.
      //
      // **Em `Perfil` e nao em `Rede`**, pela mesma razao de `Meus achados` e
      // da caixa de pedidos: a lista e das MINHAS decisoes -- `listMyBlocks`
      // exige conta e a autorizacao mora no `WHERE` --, e o "meu" mora em
      // `Perfil`.
      //
      // **Depois de `Pedidos de conexao` e antes de `Meus dados`**: as duas
      // linhas de cima sao sobre OUTRAS PESSOAS e ficam juntas; `Meus dados`
      // abre o grupo do que e sobre a propria conta.
      SubDestino(
        // ACHADO DA MESCLA DE 19/10/2026, e nao escolha de estilo.
        //
        // A frente `gaveta-icones-e-alinhamento` poe uma ASSERCAO no
        // construtor de `SubDestino`: todo item VIVO (`destino` + `existe` +
        // `rota` nao nula) tem de ter glifo. A frente `bloqueados-e-titulo`
        // acrescentou esta linha VIVA sem `icone`, porque na base dela a
        // assercao ainda nao existia. As duas tocam partes diferentes deste
        // arquivo, entao o git MESCLOU SEM CONFLITO e o resultado quebrava
        // `const_eval_throws_exception` em `flutter analyze` -- defeito que
        // so aparece medindo a UNIAO, e nao em nenhum dos dois ramos.
        //
        // O glifo foi escolhido pelo procedimento que a propria assercao
        // manda: familia embutida (Material Symbols) e nenhum outro item
        // DESTA secao (`Rotas.perfil`) com o mesmo `codePoint` -- os tres que
        // ja moram aqui sao `note_add_outlined` (0xf22e), `qr_code_scanner`
        // (0xe4f7) e `manage_accounts_outlined` (0xf1ac).
        //
        // `block_outlined` (0xeed1): o glifo universal de bloqueio. Nao colide
        // nesta secao, e nao divide sentido com nenhum outro item dela.
        rotulo: TelaDeBloqueados.titulo,
        forma: FormaDoSubDestino.destino,
        estado: EstadoDoSubDestino.existe,
        rota: Rotas.pessoasBloqueadas,
        icone: Icons.block_outlined,
      ),
      SubDestino(
        // A UX 27.5.5 chama esta linha de `Editar o perfil`, e o rotulo mudou
        // para o da tela que foi construida: `Meus dados` (18/10/2026, pedido
        // do cliente). **Dois nomes para o mesmo destino e pior que divergir
        // do documento**: o item da gaveta e o item do corpo do `Perfil` sao a
        // mesma viagem, e quem leu um precisa reconhecer o outro. Onde o
        // documento e o codigo divergem, vale o codigo -- a mesma regra que
        // ja valeu para `Registrar achado avulso` e para os filtros de
        // `Perto`.
        rotulo: 'Meus dados',
        forma: FormaDoSubDestino.destino,
        // **PESSOA COM A ENGRENAGEM: os proprios dados, e a acao de
        // mexer neles.** `TelaDadosPessoais` edita nome, telefone e foto.
        //
        // Os dois vizinhos obvios estao tomados com outro sentido, e e por
        // isso que nao e nenhum deles: `account_circle` e a forma da SECAO
        // `Perfil` (a entrada de conta da barra, `casca_com_abas.dart`) e
        // `person_outline` e a marca neutra dentro do avatar da barra de
        // topo. `badge` tambem nao: `Cracha de identidade` e uma linha deste
        // mesmo inventario de 27.5.5, e dar o cracha para `Meus dados`
        // deixaria o cracha sem glifo proprio no dia em que ele existir.
        icone: Icons.manage_accounts_outlined,
        // Saiu de `planejada` porque a tela existe: `TelaDadosPessoais`, com
        // endereco registrado no roteador de verdade. E a subida que o portao
        // de contagem chama de "caminho normal, e so quando a tela do outro
        // lado existir".
        estado: EstadoDoSubDestino.existe,
        rota: Rotas.dadosPessoais,
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

  /// OS DESTINOS GLOBAIS, que toda secao mostra no fim da gaveta.
  ///
  /// **Eles existem por causa de 19/10**, quando o cliente mandou a gaveta ser
  /// fixa em toda tela: *"padronize todas as telas, tornando o menu esquerdo
  /// fixo para manter o padrao, por mais que nao exista um sub-menu ainda, mas
  /// irei evoluir e acrescentar alguns itens"*.
  ///
  /// Isso criou um problema que a regra antiga resolvia escondendo a gaveta:
  /// `Rede` e `Loja` nao tem **nenhum** sub-destino construido, e gaveta aberta
  /// e vazia e pior que gaveta ausente -- uma cortina que escurece a tela para
  /// nao oferecer nada.
  ///
  /// A saida nao foi uma frase dizendo que ainda nao ha submenu: frase em menu
  /// foi exatamente o que ele reprovou em 23/09 (*"parece mais uma pagina do
  /// que menu, com tanto texto, tanta explicacao"*). A saida foi CONTEUDO --
  /// os destinos que valem em qualquer secao. Com eles, **nenhuma gaveta deste
  /// app abre vazia**, e as secoes sem submenu proprio abrem com este grupo e
  /// nada mais.
  ///
  /// **Todos tem rota de verdade**, pela mesma regra de [SubDestino.viraItem]:
  /// item sem endereco nasce morto. Por isso `Sair da conta` **nao** esta
  /// aqui -- ele e folha de confirmacao (`acaoNaTela`), nao tem endereco, e
  /// continua na tela da conta, a um toque de `Minha conta`. E `Meus pets`
  /// tambem nao: e bloco dentro da tela da conta, sem endereco proprio, e
  /// `Minha conta` e a porta dele.
  /// **A secao de mensagens NAO esta aqui, e a ausencia e a regra.**
  ///
  /// Ela e um slot da BARRA, e a gaveta nao repete o que a barra oferece: foi
  /// exatamente isso que o cliente reprovou em 23/09 -- a gaveta "replicava o
  /// menu principal em vez de abrir o submenu dele". A barra troca de secao; a
  /// gaveta entra nos caminhos de dentro. Por o `AuAu` aqui seria desfazer a
  /// divisao entre os dois menus no mesmo dia em que a gaveta virou fixa.
  ///
  /// `Minha conta` pode estar: ela **nao** e slot da barra desde 19/10.
  /// **`Minha conta` NAO esta aqui, e a ausencia tem duas razoes.**
  ///
  /// A primeira e de desenho: a porta da conta e a FOTO, e ela mora na mesma
  /// barra de topo que o hamburguer que abre esta gaveta. Uma linha de gaveta
  /// para o mesmo destino seria a duplicacao que o cliente vem apontando --
  /// dois controles lado a lado para a mesma viagem.
  ///
  /// A segunda e de mecanismo, e foi medida: a tela da conta e um RAMO da
  /// casca, e [ItemDaGaveta] navega com `push`, que e o certo para os
  /// atalhos vivos (todos rotas irmas). Empurrar a rota de um ramo coloca uma
  /// copia da tela por cima da propria casca em vez de trocar de ramo.
  ///
  /// **`Meus dados` SAIU DESTE GRUPO em 18/10/2026, por pedido do cliente:**
  /// *"o menu `Meus dados` dentro da pagina Pets e Perto nao faz sentido
  /// nenhum com o contexto dessa secao"*. Ele estava aqui -- e era daqui, e
  /// nao do inventario de `Pets` nem do de `Perto`, que ele aparecia nas duas
  /// gavetas.
  ///
  /// **A regra que ele corrigiu:** global e o destino que vale em QUALQUER
  /// secao, e os dados da conta nao valem em qualquer secao -- eles sao da
  /// conta, que e uma secao com endereco proprio. `Escanear uma tag` e global
  /// de verdade: ler a plaquinha de um bicho na rua faz sentido estando em
  /// `Pets`, em `Perto`, na `Loja` ou no `Perfil`, e nao exige conta.
  ///
  /// **Nada ficou orfao, e isto foi conferido antes de a linha sair.** A rota
  /// `/perfil/dados` continua com DUAS portas, as duas no `Perfil`, que e
  /// onde ela pertence: a linha `Meus dados` do submenu de 27.5.5 (a gaveta
  /// do `Perfil`, que esta montada em todo estado de sessao) e o `ItemDeMenu`
  /// do corpo da propria tela da conta (`abas.dart`, no ramo logado). A tela
  /// da conta se alcanca pela foto da barra de topo, de qualquer secao.
  ///
  /// **A gaveta de nenhuma secao ficou vazia por isso**, que era a objecao
  /// que criou este grupo: `Rede`, `Perto`, `Loja` e a secao de mensagens
  /// continuam abrindo com `Escanear uma tag`, e `Pets` e `Perfil` abrem com
  /// o submenu proprio.
  static const List<SubDestino> globais = <SubDestino>[
    SubDestino(
      rotulo: 'Escanear uma tag',
      forma: FormaDoSubDestino.destino,
      estado: EstadoDoSubDestino.existe,
      rota: Rotas.escanear,
      // O mesmo glifo das duas portas de 27.5.6, pelo mesmo motivo: e a mesma
      // rota, e o recorte da gaveta e por rota.
      icone: Icons.qr_code_scanner,
    ),
  ];

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
/// ## A gaveta e FIXA, e o caso vazio foi resolvido com conteudo (19/10)
///
/// A regra anterior era o contrario: `Rede` e `Loja` nao montavam gaveta nem
/// desenhavam o gatilho, porque nao tem nenhum sub-destino construido, e
/// gaveta vazia e um controle que abre o nada. **O cliente reverteu isso de
/// propria vontade**, com o argumento na mesa: *"padronize todas as telas,
/// tornando o menu esquerdo fixo para manter o padrao, por mais que nao exista
/// um sub-menu ainda, mas irei evoluir e acrescentar alguns itens"*.
///
/// A objecao continuava valida -- gaveta aberta e vazia e pior que ausente --,
/// e por isso a padronizacao nao veio sozinha: veio com
/// [RegistroDeSubDestinos.globais], o grupo de destinos que vale em qualquer
/// secao. `Rede` e `Loja` abrem com esse grupo e nada mais; as outras abrem
/// com o submenu proprio, um filete e o grupo. **Nenhuma gaveta deste app abre
/// vazia**, e a regra que a antiga protegia continua protegida -- por conteudo,
/// e nao por ausencia.
///
/// **O que NAO foi feito**: uma linha dizendo "esta secao ainda nao tem
/// submenu". Seria texto explicando a navegacao dentro da navegacao, que e o
/// defeito que ele apontou em 23/09.
class GavetaDeSecoes extends StatelessWidget {
  const GavetaDeSecoes({required this.rotaDaSecao, super.key});

  /// A secao cujo submenu esta gaveta mostra. **A atual, e so ela.**
  final String rotaDaSecao;

  @override
  Widget build(BuildContext context) {
    final itens = RegistroDeSubDestinos.itensDe(rotaDaSecao);
    // OS GLOBAIS, MENOS O QUE A SECAO JA OFERECE.
    //
    // Sem este recorte a gaveta de `Pets` mostraria `Escanear uma tag` DUAS
    // vezes: uma pelo submenu da propria secao (a porta de 27.5.1) e outra
    // pelo grupo global. Duas linhas com o mesmo rotulo e o mesmo destino na
    // mesma gaveta e a duplicacao que o cliente vem apontando desde 23/09 --
    // e, no Flutter, sao tambem duas `ValueKey` iguais na mesma lista.
    //
    // O recorte e por ROTA e nao por rotulo: dois rotulos diferentes para o
    // mesmo endereco continuariam sendo a mesma viagem oferecida duas vezes.
    final jaOferecidas = itens.map((i) => i.rota).toSet();
    final globais = RegistroDeSubDestinos.globais
        .where((g) => !jaOferecidas.contains(g.rota))
        .toList(growable: false);
    final cores = BichuColors.of(context).cores;

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
            // O FILETE entre o submenu da secao e os destinos globais.
            //
            // **So aparece quando ha as duas metades.** Em `Rede` e `Loja`,
            // que nao tem submenu proprio, um filete no topo seria uma divisa
            // entre o nada e o grupo global. E ele e um filete, nao um
            // cabecalho escrito: o grupo global nao ganha titulo, porque
            // titulo de grupo em menu de quatro linhas e a "pagina" que o
            // cliente reprovou.
            // **E SO QUANDO HA A SEGUNDA METADE.** `itens.isNotEmpty`
            // sozinho pintava um filete no RODAPE da gaveta do `Perfil`, que
            // ja oferecia as duas rotas globais no submenu proprio e portanto
            // ficava com `globais` vazia -- uma divisa entre o grupo e o
            // nada. Com a saida de `Meus dados` dos globais (18/10/2026) a
            // gaveta de `Pets` caiu no mesmo caso, e e por isso que a guarda
            // esta aqui: ela e consequencia da mudanca, nao limpeza avulsa.
            if (itens.isNotEmpty && globais.isNotEmpty)
              Divider(
                height: BichuEspaco.e6,
                thickness: BichuBorda.hairline,
                color: cores.outline,
              ),
            for (final item in globais)
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
      // O GLIFO DO ITEM (18/10/2026, pedido do cliente: *"nos subitens dos
      // menus voce deve colocar icones tambem, para deixar o aplicativo mais
      // bonito"*).
      //
      // `item.icone!` sem desvio: a assercao de `SubDestino` ja garante que
      // todo item vivo tem glifo, e um `if` calado aqui deixaria a linha sem
      // icone passar sem ninguem saber -- que e o defeito que o pedido veio
      // fechar.
      //
      // `textPrimary` e nao `textSecondary`: o glifo e a identidade do item,
      // do mesmo peso que o rotulo, enquanto a seta a direita e so a
      // affordance -- e e ela que fica apagada.
      leading: Icon(item.icone!, color: cores.textPrimary),
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
