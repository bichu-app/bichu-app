// OS QUATRO PEDIDOS DE 20/10/2026 — as iscas.
//
// Literal do cliente, nos quatro:
//
//  1. *"o icone do perfil do usuario ficou muito perto do titulo da barra, de
//     uma margem do nome"*
//  2. *"quando o usuario vai para a mensagem, o menu inferior some, mantenha
//     ele fixo em todas as paginas"* -- e, no MESMO dia, a delimitacao:
//     *"vamos colocar a barra fixa apenas nas paginas de primeiro plano, as
//     paginas internas, pode manter como esta. Exemplo: ao clicar no menu auau,
//     mantem a barra .. ao clicar na mensagem tira a barra. Ao clicar no perfil
//     mantem a barra, ao clicar no cadastro do pet, remove a barra. Na listagem
//     dos eventos, mantem a barra, ao clicar nos detalhes do evento, remove a
//     barra. E assim por diante."*
//  3. *"na pagina pet, remova o icone dos ..., so deixe o de escanear a tag"*
//  4. *"como o menu do perfil esta crescendo, vamos separar os links por
//     topicos/categorias"*
//
// Os grupos, e o que cada um desliga:
//
//  (a) a margem existe E o orcamento do titulo fecha. A margem NAO e de graca:
//      ela sai do orcamento, que caiu de 224,00 para 216,00 dp. O caso mede as
//      duas coisas no mesmo app -- o vao em coordenada e a constricao que o
//      leiaute entrega ao titulo --, porque medir so uma deixaria passar a
//      margem dada roubando o titulo, ou o titulo intacto sem margem nenhuma.
//
//  (b) cada tela empilhada esta do LADO CERTO, **um caso por tela**. Duas
//      ficam com a barra e vinte e sete sem, por decisao do cliente na segunda
//      mensagem de 20/10 (*"a barra fixa apenas nas paginas de primeiro
//      plano"*), e o caso de cada tela cobra o veredito DELA -- presenca nas
//      duas, ausencia nas vinte e sete. Mais dois casos estruturais: a
//      CLASSIFICACAO (rota nova sem veredito reprova) e a CONCORDANCIA (o
//      veredito escrito bate com o que o roteador faz, para que mover uma
//      linha de lista nao "conserte" a suite sem tocar no app).
//
//  (c) `more_horiz` nao existe mais em `Pets`, e o alvo que ficou e o leitor.
//
//  (d) as duas acoes que perderam a folha continuam alcancaveis **pelo
//      Perfil**, uma isca cada. A de `Cadastrar pet` tem um caso POR FASE do
//      bloco de pets: a porta dela so existia em duas das seis.
//
//  (e) os cabecalhos de grupo sao CABECALHO para quem nao ve, e nao sao
//      tocaveis. Com contraprova.
//
//  (f) a barra e UMA, desenhada num ponto so. Este e o portao
//      anti-divergencia da escolha (c) do item 2: duas cascas usam a barra, e
//      um segundo `NavigationBar` em `lib/` reprova.
//
//  (g) ninguem ficou sem saida, e a conta de QUEM depende de QUAL saida esta
//      travada. Sao tres as saidas aceitas -- controle no topo, barra de
//      baixo, foto da conta --, e a reversao de 20/10 devolveu quatro telas a
//      dependerem SO da foto (que vai para a conta, e nao volta). A
//      propriedade `SAIDA e FOTO nunca aparecem na mesma barra` continua
//      valendo e mudou de razao; o caso dela foi reescrito em
//      `gaveta_com_submenus_test.dart`.

import 'dart:io';

import 'package:bichu/roteamento/rotas.dart';
import 'package:bichu/telas/casca_com_abas.dart';
import 'package:bichu/telas/escanear/tela_leitor_de_qr.dart';
import 'package:bichu/theme/bichu_theme.dart';
import 'package:bichu/widgets/acao_de_criar_flutuante.dart';
import 'package:bichu/widgets/item_de_menu.dart';
import 'package:bichu/widgets/saida_da_tela.dart';
import 'package:flutter/material.dart';
import 'package:flutter/rendering.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:go_router/go_router.dart';
import 'package:http/http.dart' as http;

import 'ajuda_de_tela.dart';
import 'casca_de_cinco_secoes_test.dart' show carregarInter;

// ---------------------------------------------------------------------------
// A CLASSIFICACAO DAS 29 -- a segunda fonte da verdade do item 2
// ---------------------------------------------------------------------------

/// Uma tela empilhada, e o veredito dela.
///
/// [padrao] e o endereco como `rotas.dart` o declara (com `:parametro`), e
/// [endereco] e um endereco concreto para o caso navegar. Os dois existem
/// porque o caso de completude compara contra o ROTEADOR, que so conhece o
/// padrao, e os casos de tela precisam de um endereco que resolva.
///
/// [motivo] nao e decoracao: ele e a resposta que vai ao cliente quando ele
/// conferir no aparelho e discordar de uma linha. Uma classificacao sem motivo
/// e uma decisao que ninguem pode revisar.
typedef TelaEmpilhada = ({
  String nome,
  String endereco,
  String padrao,
  String motivo,
});

/// AS TELAS DE PRIMEIRO PLANO: as que a CASCA abre, e que ficam com a barra.
///
/// ## O discriminador, e por que nao e "lista contra detalhe"
///
/// Cliente, 20/10/2026, segunda mensagem do dia: *"vamos colocar a barra fixa
/// apenas nas paginas de primeiro plano, as paginas internas, pode manter como
/// esta. Exemplo: ao clicar no menu auau, mantem a barra .. ao clicar na
/// mensagem tira a barra. Ao clicar no perfil mantem a barra, ao clicar no
/// cadastro do pet, remove a barra. Na listagem dos eventos, mantem a barra, ao
/// clicar nos detalhes do evento, remove a barra. E assim por diante."*
///
/// "Listagem fica, detalhe sai" le os tres exemplos dele corretamente e
/// **DISCORDA de si mesma em oito telas desta arvore**: `Meus achados`,
/// `Meus eventos`, `Pedidos de conexao`, `Pessoas bloqueadas`, `Minhas fotos`,
/// `Minhas indicacoes`, `Adoções` e `Meus dados` sao LISTAS e sao alcancadas
/// de DENTRO do Perfil. As duas metades do principio apontam para lados
/// opostos nelas, e decidir no escuro seria entregar oito palpites.
///
/// O que separa os tres exemplos dele sem ambiguidade e **QUEM ABRE A TELA**:
///
///   - a CASCA abre -> primeiro plano, COM barra. O slot `AuAu` da barra de
///     baixo abre `/mensagens`; o sino da barra de topo abre `/notificacoes`.
///     Os dois sao controles da propria casca, montados em toda tela de secao.
///   - o CONTEUDO abre -> pagina interna, SEM barra. Tocar numa linha da lista
///     de mensagens, num `ItemDeMenu` do corpo do Perfil, num cartao de pet,
///     num botao de formulario.
///
/// E ele le os tres exemplos na ordem: o slot `AuAu` mantem (casca), a mensagem
/// tocada tira (conteudo); o Perfil mantem (a FOTO da casca o abre), o cadastro
/// de pet tira (botao do corpo); a listagem de eventos mantem (e a secao
/// `Rede`, da casca), a ficha do evento tira (cartao do corpo).
///
/// **O ACHADO QUE A PRIMEIRA MENSAGEM DELE ESCONDIA:** a tela que nao devia ter
/// perdido a barra era a AREA DE MENSAGENS -- primeiro plano, destino de um slot
/// da propria barra --, e nao a conversa aberta. Ela esta aqui.
const List<TelaEmpilhada> telasDePrimeiroPlano = <TelaEmpilhada>[
  (
    nome: 'a area de mensagens',
    endereco: '/mensagens',
    padrao: '/mensagens',
    motivo: 'e o destino do slot `AuAu` da BARRA. Era ela que o cliente viu '
        'perdendo a barra, e e o exemplo literal dele: *"ao clicar no menu '
        'auau, mantem a barra"*.',
  ),
  (
    nome: 'a caixa de avisos',
    endereco: '/notificacoes',
    padrao: '/notificacoes',
    motivo: 'e o destino do SINO, que a barra de topo monta nas CINCO secoes. '
        'Controle da casca, como o slot da barra -- e por isso ela nao pertence '
        'a secao nenhuma e nao acende slot nenhum.',
  ),
];

/// AS TELAS INTERNAS: as que o CONTEUDO abre, e que ficam SEM a barra.
///
/// *"as paginas internas, pode manter como esta"* -- elas voltaram a ser
/// `GoRoute` irma da casca, que e como estavam antes de hoje.
///
/// **AS NOVE AMBIGUAS ESTAO AQUI, e cada uma diz por que.** Sao as que a regra
/// "lista fica" puxaria para o primeiro plano: todas sao alcancadas por um
/// `ItemDeMenu` do CORPO do Perfil ou por um controle do corpo de uma secao, e
/// nenhuma por um controle da casca. **Se o cliente discordar, e esta lista
/// que ele corrige** -- nove linhas, nao vinte e oito telas.
///
/// **A nona entrou em 22/10/2026**: `/perfil/pets`, a pagina do `Ver todos`.
/// Ela e a primeira das ambiguas aberta por um BOTAO de linha de titulo em vez
/// de um `ItemDeMenu`, e isso nao muda a conta -- o criterio e quem abre
/// (conteudo, nao casca), e nao a forma do controle.
const List<TelaEmpilhada> telasInternas = <TelaEmpilhada>[
  // -- A pagina do comunicado (20/10/2026) -------------------------------
  (
    nome: 'a pagina do comunicado',
    endereco: '/avisos/comunicados/comunic0Ref123456789',
    padrao: '/avisos/comunicados/:comunicadoRef',
    motivo: 'MESMA relacao de `/mensagens` com a conversa: a caixa de avisos e '
        'primeiro plano (destino do sino) e esta pagina e aberta por uma LINHA '
        'dela, que e conteudo. Ela e o unico destino "pagina interna" da '
        'caixa, porque `broadcast` e o unico tipo de aviso sem destino '
        'natural -- os outros levam a uma tela que ja existia.',
  ),
  // -- `AuAu` > `Convide tutores` (21/10/2026) ---------------------------
  (
    nome: 'convide tutores',
    endereco: '/mensagens/convide-tutores',
    padrao: '/mensagens/convide-tutores',
    motivo: 'Aberta por um item do CORPO do AuAu, e nao pela barra -- mesma '
        'conta das oito ambiguas do Perfil. E ela mostra um QR de 200 dp, que '
        'e o conteudo da tela: uma barra fixa por cima disputaria espaco com o '
        'unico elemento que precisa ser fotografado por outro aparelho.',
  ),
  // -- O exemplo literal dele -------------------------------------------
  (
    nome: 'a conversa',
    endereco: '/mensagens/c-1',
    padrao: '/mensagens/:conversaId',
    motivo: 'exemplo literal dele: *"ao clicar na mensagem tira a barra"*. '
        'Aberta por uma LINHA da lista de mensagens, que e conteudo.',
  ),
  // -- As NOVE AMBIGUAS: listas, abertas pelo CORPO do Perfil ------------
  (
    nome: 'meus dados',
    endereco: '/perfil/dados',
    padrao: '/perfil/dados',
    motivo: 'AMBIGUA. Aberta por `ItemDeMenu` no corpo do Perfil. Ele disse '
        '*"ao clicar no perfil mantem a barra"* -- o Perfil mantem, e o que se '
        'clica DENTRO dele nao. E ela e formulario, nao lista.',
  ),
  (
    nome: 'minhas fotos',
    endereco: '/perfil/minhas-fotos',
    padrao: '/perfil/minhas-fotos',
    motivo: 'AMBIGUA. Dois niveis dentro do Perfil: so `Meus dados` a abre. '
        'Se `Meus dados` e interna, ela nao pode ser primeiro plano.',
  ),
  (
    nome: 'endereco de entrega',
    endereco: '/perfil/endereco-de-entrega',
    padrao: '/perfil/endereco-de-entrega',
    motivo: 'AMBIGUA, e irma de `minhas fotos`: dois niveis dentro do Perfil, '
        'e so `Meus dados` a abre, por `ItemDeMenu`. Se `Meus dados` e '
        'interna, ela nao pode ser primeiro plano. E ela e FORMULARIO e nao '
        'lista -- o que a regra "lista fica" nem alcanca.',
  ),
  (
    nome: 'meus achados',
    endereco: '/perfil/achados',
    padrao: '/perfil/achados',
    motivo: 'AMBIGUA. E LISTA -- o que puxa para primeiro plano --, e e aberta '
        'por `ItemDeMenu` no corpo do Perfil, que e o que decide.',
  ),
  (
    nome: 'meus eventos',
    endereco: '/perfil/eventos',
    padrao: '/perfil/eventos',
    motivo: 'AMBIGUA, pela mesma conta de `Meus achados`. E ela e o UNICO '
        'caminho ate `Cancelar` um encontro: se o cliente quiser alguma das '
        'oito no primeiro plano, esta e a candidata mais forte.',
  ),
  (
    nome: 'as pessoas bloqueadas',
    endereco: '/perfil/bloqueados',
    padrao: '/perfil/bloqueados',
    motivo: 'AMBIGUA, mesma conta. E ajuste de conta, e nao destino de '
        'navegacao: ninguem vem "ver os bloqueados", vem desfazer um bloqueio.',
  ),
  (
    nome: 'os pedidos de conexao',
    endereco: '/conexoes/pedidos',
    padrao: '/conexoes/pedidos',
    motivo: 'AMBIGUA, mesma conta.',
  ),
  (
    nome: 'as minhas conexoes',
    endereco: '/conexoes',
    padrao: '/conexoes',
    motivo: 'AMBIGUA, mesma conta -- e ela nasceu em 22/10/2026, por decisao do '
        'cliente: *"o usuario pode abrir a lista de usuarios que e sua '
        'conexao"*. E LISTA, o que puxa para primeiro plano, e e aberta por '
        '`ItemDeMenu` no corpo do Perfil e pela gaveta -- que e o que decide, '
        'como em `Meus achados` e nos pedidos de conexao. Se o cliente quiser '
        'alguma das nove no primeiro plano, esta e candidata ao lado de '
        '`Meus eventos`.',
  ),
  (
    nome: 'minhas indicacoes',
    endereco: '/rede/indicacoes',
    padrao: '/rede/indicacoes',
    motivo: 'AMBIGUA. E lista, e e aberta de dentro do corpo da `Rede` -- a '
        'secao e que e primeiro plano, nao ela.',
  ),
  (
    nome: 'adocoes',
    endereco: '/adocoes',
    padrao: '/adocoes',
    motivo: 'AMBIGUA. E lista, e e aberta de dentro do corpo de `Pets`.',
  ),
  // -- A NONA AMBIGUA (22/10/2026, pedido do cliente) --------------------
  (
    nome: 'todos os meus pets',
    endereco: '/perfil/pets',
    padrao: '/perfil/pets',
    motivo: 'AMBIGUA, e a nona: e LISTA -- o que puxa para primeiro plano --, '
        'e e aberta pelo `Ver todos` da linha de titulo do bloco `Meus pets`, '
        'que e CONTEUDO do corpo do Perfil. Quem abre decide, e nao o que a '
        'tela mostra: ele disse *"ao clicar no perfil mantem a barra"*, e o '
        'que se toca DENTRO dele nao mantem. Irma exata de `Meus achados` e '
        '`Meus eventos`, que entraram por esta mesma conta.',
  ),
  // -- Detalhe de UM item: o lado facil do principio dele ----------------
  (
    nome: 'o perfil de uma pessoa',
    endereco: '/pessoa/marina',
    padrao: '/pessoa/:apelido',
    motivo: 'detalhe de UMA pessoa, aberto da conversa ou do mural.',
  ),
  (
    nome: 'a ficha de um achado',
    endereco: '/achados/a-1',
    padrao: '/achados/:achadoId',
    motivo: 'detalhe de UM achado, aberto de uma linha de `Meus achados`.',
  ),
  (
    nome: 'a pagina do pet',
    endereco: '/pets/p-1',
    padrao: '/pets/:petId',
    motivo: 'detalhe de UM pet, aberto pelo cartao no corpo do Perfil. Mesmo '
        'desenho do exemplo dele com a ficha do evento.',
  ),
  (
    nome: 'a ficha de um encontro',
    endereco: '/rede/encontros/e-1',
    padrao: '/rede/encontros/:slug',
    motivo: 'detalhe de UM encontro, aberto pelo cartao no corpo da `Rede`. '
        'Exemplo literal dele: *"Na listagem dos eventos, mantem a barra, ao '
        'clicar nos detalhes do evento, remove a barra"*. A frente '
        '`feat/aviso-de-login-ao-tocar` a devolveu como SUB-ROTA do ramo da '
        '`Rede`, o que lhe daria a barra por construcao; a mescla do terceiro '
        'lote de 20/10 tirou-a do `routes:` do ramo e declarou-a IRMA da '
        'casca, sem `_comBarraFixa`. Mesmo desenho de `/pets/:petId`.',
  ),
  (
    nome: 'acompanhar plaquinha',
    endereco: '/pets/plaquinha/p-1',
    padrao: '/pets/plaquinha/:petId',
    motivo: 'detalhe de UM pedido de plaquinha, aberto da pagina do pet.',
  ),
  // -- Formulario e assistente: o outro lado facil -----------------------
  (
    nome: 'editar o pet',
    endereco: '/pets/p-1/editar',
    padrao: '/pets/:petId/editar',
    motivo: 'formulario, aberto da pagina do pet.',
  ),
  (
    nome: 'cadastrar pet: identificacao',
    endereco: '/pets/novo',
    padrao: '/pets/novo',
    motivo: 'exemplo literal dele: *"ao clicar no cadastro do pet, remove a '
        'barra"*.',
  ),
  (
    nome: 'cadastrar pet: foto',
    endereco: '/pets/novo/foto',
    padrao: '/pets/novo/foto',
    motivo: 'passo 2 do assistente do exemplo dele.',
  ),
  (
    nome: 'cadastrar pet: sinais',
    endereco: '/pets/novo/sinais',
    padrao: '/pets/novo/sinais',
    motivo: 'passo 3 do assistente do exemplo dele.',
  ),
  (
    nome: 'o pet cadastrado',
    endereco: '/pets/cadastrado',
    padrao: '/pets/cadastrado',
    motivo: 'recibo do assistente do exemplo dele.',
  ),
  (
    nome: 'solicitar plaquinha',
    endereco: '/pets/plaquinha',
    padrao: '/pets/plaquinha',
    motivo: 'formulario, aberto da pagina do pet.',
  ),
  (
    nome: 'de quem e o caso',
    endereco: '/pets/perdido',
    padrao: '/pets/perdido',
    motivo: 'passo 1 do fluxo de marcar perdido, aberto da pagina do pet.',
  ),
  (
    nome: 'onde e quando',
    endereco: '/pets/perdido/onde-e-quando',
    padrao: '/pets/perdido/onde-e-quando',
    motivo: 'passo 2 do fluxo de marcar perdido.',
  ),
  (
    nome: 'o alcance do alerta',
    endereco: '/pets/perdido/alcance',
    padrao: '/pets/perdido/alcance',
    motivo: 'passo 3 do fluxo de marcar perdido.',
  ),
  (
    nome: 'o caso aberto',
    endereco: '/pets/perdido/caso',
    padrao: '/pets/perdido/caso',
    motivo: 'recibo do fluxo de marcar perdido.',
  ),
  (
    nome: 'registrar achado',
    endereco: '/achados/novo',
    padrao: '/achados/novo',
    motivo: 'formulario, aberto do menu do Perfil.',
  ),
  (
    nome: 'o achado registrado',
    endereco: '/achados/registrado',
    padrao: '/achados/registrado',
    motivo: 'recibo do formulario de achado.',
  ),
  (
    nome: 'criar encontro',
    endereco: '/rede/encontros/novo',
    padrao: '/rede/encontros/novo',
    motivo: 'formulario, aberto pela acao flutuante do corpo da `Rede`.',
  ),
  (
    nome: 'publicar no mural',
    endereco: '/mural/publicar',
    padrao: '/mural/publicar',
    motivo: 'formulario, aberto pela acao flutuante do corpo do `Mural`. '
        'ACHADO DA MESCLA do terceiro lote de 20/10: a frente do Mural criou '
        'esta rota irma da casca no mesmo dia em que esta frente criou o '
        'portao de completude, e nenhuma das duas viu a outra. Ela e TAREFA '
        'pela razao que `rotas.dart` ja registra -- *"escrever uma publicacao "'
        'e TAREFA, e a barra de abas abaixo dela ofereceria quatro saidas para '
        'o meio do preenchimento"* --, e por isso entra aqui e nao em '
        '`telasDePrimeiroPlano`. Ela NAO usa `_comBarraFixa`.',
  ),
  (
    nome: 'sugerir profissional',
    endereco: '/rede/indicacoes/nova',
    padrao: '/rede/indicacoes/nova',
    motivo: 'formulario, aberto pela acao flutuante do corpo da `Rede`.',
  ),
];

/// AS SUB-ROTAS DE RAMO: as que tem a barra POR CONSTRUCAO.
///
/// Elas nao usam [CascaFixa] e nao poderiam: estao DENTRO do ramo, e a barra
/// vem da casca dos ramos. **Por isso mesmo elas precisam de linha aqui** --
/// declarar uma tela sob um ramo decide o veredito dela em silencio.
///
/// As duas de hoje sao LEITURA e foram postas ali de proposito, com a razao
/// escrita em `rotas.dart`: voltar da ficha devolve a aba com a busca e o
/// filtro de quem estava comparando tres veterinarios intactos.
///
/// **E A FICHA DO EVENTO ESTA CHEGANDO AQUI, E ISSO E UM CONFLITO MEDIDO.** A
/// frente `feat/aviso-de-login-ao-tocar` (`65dfcb99`) restaurou
/// `encontros/:slug` **sob o ramo da `Rede`**, com a justificativa escrita de
/// que "a pagina de um evento e LEITURA, e a barra de baixo fica". Pelo exemplo
/// LITERAL do cliente na segunda mensagem de 20/10 -- *"Na listagem dos
/// eventos, mantem a barra, ao clicar nos detalhes do evento, remove a barra"*
/// -- ela **nao pode** ficar com a barra. As duas frentes decidiram o mesmo
/// endereco em sentidos opostos, no mesmo dia, sem se ver.
///
/// **QUEM MESCLAR DECIDE, e o portao obriga a decisao:** a rota nova nao estara
/// nesta lista e o caso `toda rota empilhada esta classificada` reprova
/// nomeando `encontros/:slug`. O conserto que segue o cliente e tira-la do
/// `routes:` do ramo e declara-la IRMA da casca, em [telasInternas].
///
/// **FEITO na mescla do terceiro lote de 20/10/2026, e a linha NAO estava
/// escrita esperando** -- este comentario afirmava que estava, e nao estava:
/// `telasInternas` tinha `/rede/encontros/novo` e mencionava a ficha do
/// evento como analogia de `/pets/:petId`, mas nao tinha a entrada dela. Quem
/// mesclou mediu a ausencia, moveu a rota em `rotas.dart` e escreveu a
/// entrada `a ficha de um encontro` acima.
const Map<String, String> subRotasDeRamo = <String, String>{
  'locais/:slug': 'a ficha de um local, sob o ramo da `Rede`. LEITURA, e '
      'voltar dela devolve a aba `Comunidade` com busca e filtro intactos.',
  'produtos/:slug': 'a ficha de um produto, sob o ramo da `Loja`. Mesma razao.',
};

/// As 32 telas empilhadas, nos dois grupos, para os casos que percorrem todas.
///
/// **Eram 31 ate 22/10/2026**, quando o `Ver todos` do bloco `Meus pets`
/// ganhou pagina (`/perfil/pets`) e ela entrou como a NONA ambigua -- interna
/// pela mesma conta das oito, porque quem a abre e o corpo do Perfil.
///
/// **Eram 29 ate a mescla do terceiro lote de 20/10/2026**, que classificou
/// DUAS rotas novas, as duas como INTERNAS: a ficha do encontro, que a frente
/// `feat/aviso-de-login-ao-tocar` devolveu, e `publicar no mural`, que a
/// frente `feat/mural-publicar` criou. Nenhuma das duas frentes via o portao
/// de completude, que nasceu na frente da barra no mesmo dia.
List<TelaEmpilhada> get telasEmpilhadas => <TelaEmpilhada>[
      ...telasDePrimeiroPlano,
      ...telasInternas,
    ];

/// A QUEM FOR MEXER AQUI DEPOIS: a FICHA DO EVENTO esta voltando.
///
/// Uma frente paralela restaurou `rede/encontro_da_rede.dart` e a rota de
/// detalhe do evento (`feat/aviso-de-login-ao-tocar`) -- o cliente pediu para
/// tirar o CLIQUE do cartao e resumi-lo, nao para apagar a tela.
///
/// **PELO PRINCIPIO DELE, ELA E INTERNA: sem barra.** E o exemplo literal da
/// segunda mensagem -- *"Na listagem dos eventos, mantem a barra, ao clicar nos
/// detalhes do evento, remove a barra"* --, e o cartao que a abre e conteudo do
/// corpo da `Rede`. Entao ela entra em [telasInternas], e nao em
/// [telasDePrimeiroPlano].
///
/// Dois caminhos, e os dois ja estao cobertos:
///   - se ela voltar como SUB-ROTA do ramo da `Rede` (`encontros/:slug` sob
///     `/rede`, como `locais/:slug` e), ela nasce COM a barra por construcao --
///     e isso **contraria** o exemplo dele. O caso `a pagina do local ja tinha
///     a barra` explica por que sub-rota de ramo tem barra; quem restaurar a
///     ficha precisa declara-la IRMA da casca, nao filha do ramo.
///   - se voltar como rota EMPILHADA, o caso `toda rota empilhada esta
///     classificada` reprova nomeando o endereco ate alguem escrever a linha.
const Map<String, String> semBarraPorDecisao = <String, String>{
  '/': 'a abertura e um desvio: ela nao tem conteudo e nunca fica na tela.',
  '/entrar': 'quem nao tem sessao nao esta em secao nenhuma.',
  '/criar-conta': 'quem nao tem sessao nao esta em secao nenhuma.',
  '/verifique-seu-email': 'quem nao tem sessao nao esta em secao nenhuma.',
  '/esqueci-minha-senha': 'quem nao tem sessao nao esta em secao nenhuma.',
  '/escanear':
      'o design system 11.11 PROIBE a barra sobre a camera, e o caso '
          '`o leitor nao leva barra de topo NEM barra de abas` cobra isso.',
  '/t/:codigo': 'porta publica: quem chega de uma plaquinha chega de FORA.',
  '/p/:shareToken': 'porta publica: quem chega de um link chega de FORA.',
};

/// As telas que **nao tem controle de saida na barra de topo**, e saem so pela
/// FOTO da conta.
///
/// As quatro sao as rotas de escape do fluxo de perdido: sem o rascunho no
/// `extra`, `rotas.dart` monta `AbaPerfil()` -- que e raiz de secao e poe a
/// FOTO no `leading`, o que apaga a seta automatica do `AppBar`.
///
/// **E ISTO E UM ACHADO QUE A REVERSAO DE 20/10 DEVOLVEU, e esta no relatorio
/// como pergunta fechada.** Enquanto elas foram de primeiro plano, a barra de
/// baixo era a segunda saida; com elas de volta a internas, a foto voltou a ser
/// a UNICA -- e a foto nao VOLTA, ela vai para a conta. Nao e beco (ha saida),
/// e nao e voltar (o `pop` nao existe ali). O estado e o de antes de hoje, e o
/// cliente disse *"as paginas internas, pode manter como esta"*; mas a conta
/// precisa estar escrita, e esta lista e onde ela esta.
const Set<String> saidaSoPelaFoto = <String>{
  '/pets/perdido',
  '/pets/perdido/onde-e-quando',
  '/pets/perdido/alcance',
  '/pets/perdido/caso',
};

/// As telas que saem por um controle FLUTUANTE SOBRE A MIDIA, e nao pela barra
/// de topo nem pela foto.
///
/// **A terceira forma de saida desta arvore, escrita na mescla do terceiro lote
/// de 20/10/2026.** Ate aqui a contabilidade tinha duas linhas -- saida na
/// barra de topo, ou so pela foto --, e a ficha do encontro nao cabe em
/// nenhuma: no estado pronto ela **nao tem `AppBar`**, porque a capa sangra ate
/// o topo (UX 28.7.2: sem titulo visivel enquanto a capa esta na tela), e a
/// saida e um `IconButton` de 48 dp POR CIMA da foto, com fundo `surface` e
/// sombra propria para o contraste nao depender da imagem (design system
/// 24.12.1 e 24.12.6).
///
/// **Ela e saida de verdade, e melhor que a da foto:** faz `pop` quando ha
/// pilha e vai para `/rede` quando nao ha -- quer dizer, ela VOLTA, enquanto a
/// foto leva para a conta. Por isso esta linha e separada de
/// [saidaSoPelaFoto]: as duas dizem "nao tem seta na barra de topo", e so uma
/// delas e um problema em aberto.
///
/// **Por que ela apareceu agora:** a ficha do encontro era SUB-ROTA do ramo da
/// `Rede` e tinha a barra de baixo como segunda saida. A decisao do cliente de
/// 20/10 (*"ao clicar nos detalhes do evento, remove a barra"*) tirou a barra,
/// e o controle sobre a capa passou a ser a saida unica -- que e o que esta
/// linha registra, para que ninguem o apague sem ver a conta mudar.
const Set<String> saidaFlutuanteSobreMidia = <String>{
  '/rede/encontros/e-1',
};

// ---------------------------------------------------------------------------
// A bancada
// ---------------------------------------------------------------------------

/// Uma rede que responde o minimo e recusa o resto.
///
/// **A recusa e deliberada:** o que se mede neste arquivo e a BARRA, e toda
/// tela da lista tem estado de falha desenhado. Montar respostas de verdade
/// para vinte e nove telas poria o caso a medir o conteudo delas -- que e
/// trabalho dos portoes de cada uma -- e faria este arquivo reprovar quando
/// qualquer contrato mudasse.
Future<http.Response> _redeMinima(http.Request req) async {
  if (req.url.path.endsWith('/reference-data')) {
    return json200(referenciaDeTeste());
  }
  if (req.url.path == '/v1/pets' && req.method == 'GET') {
    return json200(<String, dynamic>{'items': <dynamic>[]});
  }
  if (req.url.path == '/v1/auth/logout' && req.method == 'POST') {
    return http.Response('', 204);
  }
  return problema('not-found', 404);
}

/// Monta o app numa superficie alta e vai para `Pets`.
///
/// Alta porque o menu da conta tem quatro grupos e sete itens mais o bloco de
/// pets: na bancada padrao o ultimo item nasce debaixo da barra de baixo, e o
/// toque nao chega nele.
Future<void> _abrirEmPets(WidgetTester tester, {double? escala}) async {
  tester.view.physicalSize = const Size(1125, 3000);
  tester.view.devicePixelRatio = 3;
  addTearDown(tester.view.reset);
  await abrirOApp(
    tester,
    rede: _redeMinima,
    deposito: depositoLogado(),
    escala: escala,
  );
  await tester.tap(find.widgetWithText(NavigationDestination, 'Pets'));
  await tester.pumpAndSettle();
}

/// Abre a tela da conta pela FOTO, que e a porta que o cliente nomeou.
Future<void> _abrirAContaPelaFoto(WidgetTester tester) async {
  await _abrirEmPets(tester);
  await tester.tap(find.byType(AvatarDaConta));
  await tester.pumpAndSettle();
}

/// Varre o roteador MONTADO e devolve o endereco de toda rota empilhada --
/// isto e, todo `GoRoute` do nivel de cima, que e o que cobre a casca dos
/// ramos quando empurrado.
///
/// A casca dos ramos (`StatefulShellRoute`) nao e `GoRoute` e nao entra: as
/// cinco secoes e as duas sub-rotas de ramo (`locais/:slug` e
/// `produtos/:slug`) tem a barra por construcao.
Set<String> _rotasEmpilhadas(WidgetTester tester) {
  final contexto = tester.element(find.byType(NavigationBar));
  final raiz = GoRouter.of(contexto).configuration.routes;
  return <String>{
    for (final rota in raiz)
      if (rota is GoRoute) rota.path,
  };
}

/// As SUB-ROTAS DE RAMO do roteador montado: as rotas declaradas DENTRO de um
/// ramo da casca dos ramos.
///
/// **Elas tem a barra POR CONSTRUCAO**, e e por isso que elas precisam de
/// classificacao tanto quanto as empilhadas: uma sub-rota de ramo e empurrada
/// no `Navigator` do proprio ramo, dentro do `IndexedStack`, dentro da casca --
/// a barra nunca sai. Declarar uma tela ali **decide** o veredito dela sem
/// ninguem escrever uma linha, e e o jeito mais silencioso de contrariar a
/// delimitacao de 20/10.
Set<String> _subRotasDeRamo(WidgetTester tester) {
  final contexto = tester.element(find.byType(NavigationBar));
  final raiz = GoRouter.of(contexto).configuration.routes;
  final achadas = <String>{};
  for (final rota in raiz) {
    if (rota is! StatefulShellRoute) continue;
    for (final ramo in rota.branches) {
      for (final daRaizDoRamo in ramo.routes) {
        for (final filha in daRaizDoRamo.routes) {
          if (filha is GoRoute) achadas.add(filha.path);
        }
      }
    }
  }
  return achadas;
}

void main() {
  setUpAll(carregarInter);

  // =========================================================================
  group('(a) a foto tem margem do titulo, e o orcamento fecha nas quatro', () {
    // =======================================================================
    // O PEDIDO 1, MEDIDO NAS DUAS PONTAS
    // =======================================================================
    //
    // Literal: *"o icone do perfil do usuario ficou muito perto do titulo da
    // barra, de uma margem do nome"*. O vao era **0,00 dp**: o circulo de 32
    // dp terminava em 48, o alvo terminava em 48, e `titleSpacing: 0` fazia o
    // titulo comecar em 48.
    //
    // **A MARGEM SAI DO ORCAMENTO DO TITULO, e nao havia como nao sair.** A
    // margem interna de 16 dp da esquerda ja consumiu a folga que o alvo tinha
    // sobre o desenho; do lado direito nao sobra nada. Medido em 320 dp a 200%
    // de escala:
    //
    //   antes:  foto 48 | titulo | sino 48  -> 224,00 dp
    //   agora:  foto 56 | titulo | sino 48  -> **216,00 dp**
    //
    //   `Pets`, `Rede`, `Loja`: 138,32 dp -> cabem (77,68 de folga)
    //   `Mural`:                172,90 dp -> CABE  (43,10 de folga)
    //
    // DESLIGAMENTO: em `casca_com_abas.dart`, devolva `leadingWidth` a
    // `AvatarDaConta.alvo`. O vao vai a 0,00 e o primeiro `expect` reprova
    // nomeando a secao; o orcamento volta a 224,00 e o segundo reprova
    // tambem.
    for (final destino in CascaComAbas.visiveisEm(CascaComAbas.configuracao)
        .where((d) => d.ehRamo)) {
      testWidgets(
        'em "${destino.rotulo}": o vao existe E o titulo cabe em 216,00 dp',
        (tester) async {
          tester.view.physicalSize = const Size(960, 2000);
          tester.view.devicePixelRatio = 3;
          addTearDown(tester.view.reset);

          // **LOGADO, e nao deslogado.** Deslogado a barra esconde o sino e o
          // titulo tem folga de sobra: o portao mediria o arranjo mais vazio e
          // aprovaria o errado.
          await abrirOApp(
            tester,
            rede: _redeMinima,
            deposito: depositoLogado(),
            escala: 2,
          );
          await tester.tap(
            find.widgetWithText(NavigationDestination, destino.rotulo),
          );
          await tester.pumpAndSettle();

          // (1) O ALVO DE TOQUE **NAO INFLOU**. As duas formas baratas de dar
          // a margem engordam o alvo: `padding: right` no `IconButton` o leva
          // a 56, e `Padding` por fora o tira do `leadingWidth`. A forma
          // escolhida poe o respiro FORA do alvo, com um `Align`.
          final alvo = tester.getRect(
            find.byKey(AvatarDaConta.chaveDoAlvo),
          );
          expect(
            alvo.width,
            closeTo(AvatarDaConta.alvo, 0.01),
            reason: 'REPROVA: o alvo da foto mede ${alvo.width} dp de largura '
                'e nao ${AvatarDaConta.alvo}. A margem do titulo virou ALVO: '
                'o dedo passou a acertar a conta no vao que existe para '
                'separar a foto do texto.',
          );

          // (2) O VAO, EM COORDENADA. **E este o pedido dele**, e e a unica
          // medida que ve o que ele viu: a distancia entre a borda direita do
          // CIRCULO desenhado e a borda esquerda do titulo.
          final circulo = tester.getRect(
            find.byKey(AvatarDaConta.chaveDoCirculo),
          );
          final titulo = find.descendant(
            of: find.byType(AppBar),
            matching: find.text(destino.rotulo),
          );
          expect(
            titulo,
            findsOneWidget,
            reason: 'REPROVA: a barra de topo de "${destino.rotulo}" nao '
                'pinta o titulo. Sem ele nao ha vao para medir.',
          );
          final paragrafo = tester.renderObject<RenderParagraph>(
            find.descendant(of: titulo, matching: find.byType(RichText)),
          );
          final vao = tester.getRect(
                find.descendant(of: titulo, matching: find.byType(RichText)),
              ).left -
              circulo.right;
          expect(
            vao,
            closeTo(AvatarDaConta.respiroDoTitulo, 0.01),
            reason: 'REPROVA: ha ${vao.toStringAsFixed(2)} dp entre o circulo '
                'da foto e o titulo de "${destino.rotulo}", e o decidido e '
                '${AvatarDaConta.respiroDoTitulo.toStringAsFixed(2)}. Zero e '
                'o estado que o cliente leu no aparelho em 20/10: *"o icone '
                'do perfil do usuario ficou muito perto do titulo da barra"*.',
          );

          // (3) O ORCAMENTO NOVO. Ele e a OUTRA metade: margem dada sem pagar
          // significaria que ela veio de um controle que saiu da barra.
          expect(
            paragrafo.constraints.maxWidth,
            216.0,
            reason: 'REPROVA: o titulo de "${destino.rotulo}" recebeu '
                '${paragrafo.constraints.maxWidth.toStringAsFixed(2)} dp de '
                'orcamento em 320 dp a 200%, e o arranjo de 20/10 mede '
                '216,00 -- foto 48 + respiro 8 a esquerda, sino 48 a direita, '
                '`titleSpacing: 0`. Menos que isso significa que um controle '
                'voltou para a barra; mais, que um saiu dela, ou que a margem '
                'do pedido 1 desapareceu.',
          );

          // (4) E ELE AINDA CABE. Esta e a linha que para a frente em vez de
          // afrouxar o portao: se um titulo passar a cortar, a decisao e de
          // produto -- rotulo mais curto, ou um controle fora da barra.
          final pedida = paragrafo.getMaxIntrinsicWidth(double.infinity);
          expect(
            pedida,
            lessThanOrEqualTo(paragrafo.constraints.maxWidth),
            reason: 'REPROVA: "${destino.rotulo}" pede '
                '${pedida.toStringAsFixed(2)} dp num orcamento de '
                '${paragrafo.constraints.maxWidth.toStringAsFixed(2)} dp, em '
                '320 dp a 200% de escala. A margem do pedido 1 custou 8,00 dp '
                'do titulo, e com ela os quatro titulos ainda cabiam -- '
                '`Mural`, o pior, pedia 172,90 com 43,10 de folga. Um titulo '
                'que passe a cortar e decisao do cliente, e nao uma '
                'reticencia a aceitar em silencio.',
          );
        },
      );
    }
  });

  // =========================================================================
  group('(b) a barra de baixo esta em TODA tela empilhada', () {
    // =======================================================================
    // O PEDIDO 2, UM CASO POR TELA, E AGORA COM VEREDITO
    // =======================================================================
    //
    // **Primeira mensagem:** *"quando o usuario vai para a mensagem, o menu
    // inferior some, mantenha ele fixo em todas as paginas"*.
    // **Segunda, que delimitou:** *"a barra fixa apenas nas paginas de primeiro
    // plano, as paginas internas, pode manter como esta"*.
    //
    // **O CASO POR TELA FICOU, E PASSOU A TER DOIS LADOS.** Ele era "a barra
    // esta aqui" em 29 telas; agora e "a barra esta aqui" em 2 e **"a barra NAO
    // esta aqui" em 27**. Nenhum caso saiu -- 27 trocaram de veredito --, e a
    // troca e o que vale: um portao que so cobrasse presenca ficaria verde com
    // a barra de volta nas 27, que e exatamente a reversao que o cliente pediu.
    //
    // **UM CASO POR TELA e nao um representando todas**, e a razao e
    // diagnostica: as 29 rotas tem builders diferentes, quatro caem em telas de
    // escape quando falta o `extra`, e cinco carregam parametro. Um caso so
    // diria "alguma tela esta do lado errado"; estes dizem QUAL.
    for (final tela in telasDePrimeiroPlano) {
      testWidgets(
        'PRIMEIRO PLANO: ${tela.nome} (${tela.endereco}) MANTEM a barra',
        (tester) async {
          // DESLIGAMENTO: em `rotas.dart`, troque o `_comBarraFixa` desta rota
          // por `GoRoute`. Este caso reprova nomeando a tela, e o do grupo (g)
          // tambem se ela depender da barra para ter saida.
          await _abrirEmPets(tester);
          await irPara(tester, tela.endereco);

          // (1) A CASCA FIXA ESTA NA ARVORE. Sem esta linha o caso poderia
          // ficar verde com a navegacao falhando: se o `push` nao resolvesse, a
          // tela continuaria sendo `Pets` -- que TEM barra, pela casca dos
          // ramos.
          expect(
            find.byType(CascaFixa),
            findsOneWidget,
            reason: 'REPROVA: ${tela.endereco} nao abriu dentro de '
                '`CascaFixa`. Ou a rota voltou a ser `GoRoute` crua -- e a '
                'barra desapareceu com ela --, ou o `push` nao resolveu e o '
                'caso esta medindo `Pets`. MOTIVO desta tela ser primeiro '
                'plano: ${tela.motivo}',
          );

          // (2) O ENDERECO, pela mesma razao do grupo das internas: `CascaFixa`
          // na arvore sem a rota ter resolvido seria a casca de OUTRA tela.
          expect(
            GoRouterState.of(
              tester.element(find.byType(Scaffold).first),
            ).uri.path,
            tela.endereco,
            reason: 'REPROVA: o roteador nao esta em "${tela.endereco}".',
          );

          // (3) A BARRA, com os cinco slots.
          expect(
            find.byType(NavigationBar),
            findsOneWidget,
            reason: 'REPROVA: ${tela.nome} nao tem barra de baixo, e ela e de '
                'PRIMEIRO PLANO: ${tela.motivo}',
          );
          expect(
            find.byType(NavigationDestination),
            findsNWidgets(
              CascaComAbas.visiveisEm(CascaComAbas.configuracao).length,
            ),
            reason: 'REPROVA: a barra de ${tela.nome} nao tem os mesmos slots '
                'da barra das secoes. Barra pela metade e pior que barra '
                'nenhuma: ela some com destinos sem dizer.',
          );
        },
      );
    }

    for (final tela in telasInternas) {
      testWidgets(
        'INTERNA: ${tela.nome} (${tela.endereco}) NAO tem a barra',
        (tester) async {
          // DESLIGAMENTO: em `rotas.dart`, troque o `GoRoute` desta rota por
          // `_comBarraFixa`. Este caso reprova nomeando a tela e citando o
          // motivo da classificacao.
          await _abrirEmPets(tester);
          await irPara(tester, tela.endereco);

          // (1) A TELA ABRIU, MEDIDA PELO ENDERECO DO ROTEADOR. Sem isto o
          // `findsNothing` abaixo passaria por vacuidade do jeito mais facil:
          // uma rota que nao resolve tambem nao desenha barra, e o caso ficaria
          // verde provando nada. **O endereco e a medida certa aqui** -- medir
          // o tipo da tela exigiria importar 27 telas, e medir "ha um Scaffold
          // novo" nao distingue a tela certa da tela de escape.
          final onde = GoRouterState.of(
            tester.element(find.byType(Scaffold).first),
          ).uri.path;
          expect(
            onde,
            tela.endereco,
            reason: 'REPROVA: o roteador esta em "$onde" e nao em '
                '"${tela.endereco}". A rota nao resolveu, e o veredito abaixo '
                'nao mede a tela que o caso existe para medir.',
          );

          // (2) NENHUMA barra. **E `findsNothing` e nao "uma so"**: a casca dos
          // ramos fica EMBAIXO da rota empilhada e sai da arvore de finders
          // (rota opaca), entao a tela interna correta nao tem barra nenhuma.
          expect(
            find.byType(NavigationBar),
            findsNothing,
            reason: 'REPROVA: ${tela.nome} (${tela.endereco}) TEM barra de '
                'baixo, e ela e PAGINA INTERNA. O cliente delimitou em 20/10: '
                '*"a barra fixa apenas nas paginas de primeiro plano, as '
                'paginas internas, pode manter como esta"*. MOTIVO desta tela '
                'ser interna: ${tela.motivo}',
          );
          expect(
            find.byType(CascaFixa),
            findsNothing,
            reason: 'REPROVA: ${tela.nome} vestiu `CascaFixa`, que e a casca '
                'das telas de PRIMEIRO PLANO. Ela e interna: ${tela.motivo}',
          );
        },
      );
    }

    // =======================================================================
    // AS DUAS QUE JA TINHAM A BARRA -- a conta que o briefing pediu
    // =======================================================================
    //
    // **`pagina do local` ERA SUSPEITA E NAO ERA CULPADA**, e isto e medicao e
    // nao leitura de codigo: ela e SUB-ROTA do ramo da `Rede`
    // (`locais/:slug` sob `/rede`), e sub-rota de ramo e empurrada no
    // `Navigator` do PROPRIO ramo -- dentro do `IndexedStack`, dentro da casca.
    // A barra nunca saiu dela. `produto da loja` e o mesmo arranjo sob `Loja`.
    //
    // As duas provam que a saida (a) FUNCIONA onde ela se aplica, e e por isso
    // que elas tem caso: sem este par, a escolha da saida (c) para as outras 29
    // pareceria a unica possivel, e nao e -- ela e a unica que serve as telas
    // que **nao pertencem a secao nenhuma**.
    //
    // DESLIGAMENTO: em `rotas.dart`, mova `locais/:slug` de dentro do `routes:`
    // do ramo da `Rede` para o nivel de cima. O caso reprova por `CascaFixa`
    // ausente **e** por barra ausente, nesta ordem.
    for (final tela in <({String nome, String endereco, String aba})>[
      (nome: 'a pagina do local', endereco: '/rede/locais/vet-x', aba: 'Rede'),
      (nome: 'o produto da loja', endereco: '/loja/produtos/p-x', aba: 'Loja'),
    ]) {
      testWidgets(
        '${tela.nome} ja tinha a barra, por ser SUB-ROTA do ramo',
        (tester) async {
          await _abrirEmPets(tester);
          await irPara(tester, tela.endereco);

          expect(
            find.byType(NavigationBar),
            findsOneWidget,
            reason: 'REPROVA: ${tela.nome} (${tela.endereco}) nao tem barra de '
                'baixo. Ela e sub-rota do ramo de `${tela.aba}` e a barra vem '
                'da casca dos ramos: se faltou, a rota saiu de dentro do ramo.',
          );
          expect(
            find.byType(CascaFixa),
            findsNothing,
            reason: 'REPROVA: ${tela.nome} passou a vestir `CascaFixa`. Ela '
                'NAO precisa: sub-rota de ramo e empurrada dentro do '
                '`IndexedStack` e a barra ja esta la. Vesti-la seria uma '
                'segunda barra por cima da primeira.',
          );
        },
      );
    }

    // =======================================================================
    // A COMPLETUDE -- o que impede o verde por lista curta
    // =======================================================================
    testWidgets('toda rota empilhada esta CLASSIFICADA', (tester) async {
      // **A PROPRIEDADE MUDOU DE FORMA COM A REVERSAO DE 20/10, e esta e a
      // parte que vale mais do que as 29 linhas acima.**
      //
      // Ela era "toda rota empilhada esta na lista das que tem barra". Com a
      // delimitacao do cliente, isso deixou de ser verdade -- 27 das 29 NAO tem
      // barra --, e um portao dessa forma reprovaria a propria decisao dele.
      //
      // A propriedade agora e: **toda rota empilhada tem um VEREDITO escrito**
      // -- primeiro plano, interna, ou dispensada com motivo. Rota nova sem
      // classificacao reprova, e e isso que faz a proxima tela nascer com a
      // decisao tomada em vez de herdar o silencio.
      //
      // DESLIGAMENTO: declare um `GoRoute` novo no nivel de cima de
      // `rotas.dart`. Este caso reprova nomeando o endereco.
      await _abrirEmPets(tester);
      final noRoteador = _rotasEmpilhadas(tester);
      final primeiroPlano = telasDePrimeiroPlano.map((t) => t.padrao).toSet();
      final internas = telasInternas.map((t) => t.padrao).toSet();
      final declaradas = <String>{
        ...primeiroPlano,
        ...internas,
        ...semBarraPorDecisao.keys,
      };

      final semVeredito = noRoteador.difference(declaradas);
      expect(
        semVeredito,
        isEmpty,
        reason: 'REPROVA: $semVeredito sao rotas empilhadas SEM veredito. O '
            'cliente decidiu em 20/10 que a barra fica *"apenas nas paginas de '
            'primeiro plano"*, e uma rota nova nasce de um dos dois lados -- '
            'nunca do silencio. Escolha: `telasDePrimeiroPlano` (e troque '
            '`GoRoute` por `_comBarraFixa` em `rotas.dart`), `telasInternas` '
            '(e deixe `GoRoute`), ou `semBarraPorDecisao` com o motivo. '
            'Qualquer das tres ganha um caso de tela e um de saida de graca.',
      );

      // E A GUARDA DO OUTRO LADO: linha orfa mantem a decisao de uma rota que
      // nao existe mais, e a proxima rota com o mesmo endereco herdaria em
      // silencio o que ninguem decidiu para ela.
      final orfas = declaradas.difference(noRoteador);
      expect(
        orfas,
        isEmpty,
        reason: 'REPROVA: $orfas estao classificadas e nao sao rotas '
            'empilhadas do roteador. Linha orfa e decisao esperando por uma '
            'rota futura que ninguem vai tomar.',
      );

      // ===================================================================
      // E AS SUB-ROTAS DE RAMO, que decidem o veredito em SILENCIO
      // ===================================================================
      //
      // **Esta metade existe por um conflito medido**, nao por simetria.
      // Declarar uma tela dentro do `routes:` de um ramo da a ela a barra POR
      // CONSTRUCAO -- sem `_comBarraFixa`, sem linha em lista nenhuma, sem
      // ninguem decidindo. A frente `feat/aviso-de-login-ao-tocar` restaurou a
      // ficha do evento exatamente assim, e o exemplo literal do cliente diz o
      // contrario (*"ao clicar nos detalhes do evento, remove a barra"*). Sem
      // esta metade, a mescla entregaria a barra na ficha do evento e nenhum
      // caso acusaria.
      //
      // DESLIGAMENTO: declare um `GoRoute` dentro do `routes:` de qualquer ramo
      // em `rotas.dart`. Este caso reprova nomeando o caminho relativo.
      final subRotas = _subRotasDeRamo(tester);
      final subSemVeredito = subRotas.difference(subRotasDeRamo.keys.toSet());
      expect(
        subSemVeredito,
        isEmpty,
        reason: 'REPROVA: $subSemVeredito sao SUB-ROTAS DE RAMO sem veredito, e '
            'sub-rota de ramo **ja tem a barra** -- ela e empurrada dentro do '
            '`IndexedStack`, dentro da casca. Declarar uma tela ali decide que '
            'ela e primeiro plano sem ninguem escrever isso, e e o jeito mais '
            'silencioso de contrariar a delimitacao de 20/10. Se a tela e '
            'LEITURA de um item de uma secao e a barra deve ficar, escreva a '
            'linha em `subRotasDeRamo` com o motivo. Se o cliente disse que '
            'ela nao deve ter barra -- como disse da ficha do evento --, '
            'tire-a do `routes:` do ramo e declare-a IRMA da casca, em '
            '`telasInternas`.',
      );
      final subOrfas = subRotasDeRamo.keys.toSet().difference(subRotas);
      expect(
        subOrfas,
        isEmpty,
        reason: 'REPROVA: $subOrfas estao em `subRotasDeRamo` e nao sao mais '
            'sub-rotas de ramo do roteador.',
      );

      // E NENHUMA ROTA EM DOIS GRUPOS: veredito duplo e veredito nenhum.
      expect(
        primeiroPlano.intersection(internas),
        isEmpty,
        reason: 'REPROVA: ha rota em `telasDePrimeiroPlano` E em '
            '`telasInternas`. Com dois vereditos, os dois casos dela rodam e um '
            'deles reprova sempre -- ou, pior, alguem conserta o caso errado.',
      );
      expect(
        declaradas.length,
        primeiroPlano.length + internas.length + semBarraPorDecisao.length,
        reason: 'REPROVA: ha endereco repetido entre os tres grupos de '
            'classificacao.',
      );
    });

    testWidgets('e o VEREDITO declarado bate com o que o roteador faz',
        (tester) async {
      // **O par do caso acima, e o que impede o verde por declaracao.** Aquele
      // cobra que exista um veredito; este cobra que o veredito seja VERDADE.
      // Sem ele, mover uma tela de grupo na lista "consertaria" a suite sem
      // tocar no app -- e e exatamente o que alguem com pressa faria.
      //
      // A medida e `_comBarraFixa`, pelo unico sinal que ele deixa na arvore
      // de ROTAS e nao na de widgets: a rota de primeiro plano constroi
      // [CascaFixa] e a interna nao.
      //
      // DESLIGAMENTO: mova `/mensagens` de `telasDePrimeiroPlano` para
      // `telasInternas` sem tocar em `rotas.dart`. Este caso reprova dizendo
      // que a declaracao e a arvore discordam.
      // **`go` E NAO `push`, e a diferenca importa aqui.** `push` empilharia 29
      // paginas uma sobre a outra e `CascaFixa` passaria a ser achada pela
      // pagina errada; e voltar a `Pets` entre as medidas nao da, porque
      // `pumpWidget` do mesmo app reaproveita o `State` e a barra nao esta mais
      // na tela para ser tocada (medido: `tap()` em `Pets` estoura com `Found
      // 0 widgets`). `go` TROCA a pilha, e cada volta do laco mede uma rota
      // isolada -- que e exatamente o que este caso quer: se a rota constroi
      // [CascaFixa] ou nao.
      await _abrirEmPets(tester);
      final divergentes = <String>[];
      for (final tela in telasEmpilhadas) {
        GoRouter.of(
          tester.element(find.byType(Scaffold).first),
        ).go(tela.endereco);
        await tester.pumpAndSettle();

        final onde = GoRouterState.of(
          tester.element(find.byType(Scaffold).first),
        ).uri.path;
        final temCasca = find.byType(CascaFixa).evaluate().isNotEmpty;
        final deviaTer = telasDePrimeiroPlano.any(
          (t) => t.padrao == tela.padrao,
        );
        if (onde != tela.endereco) {
          divergentes.add(
            '${tela.endereco}: o roteador foi para "$onde" e a medida nao vale',
          );
        } else if (temCasca != deviaTer) {
          divergentes.add(
            '${tela.endereco}: declarada '
            '${deviaTer ? "primeiro plano" : "interna"}, e a arvore diz '
            '${temCasca ? "primeiro plano" : "interna"}',
          );
        }
      }
      expect(
        divergentes,
        isEmpty,
        reason: 'REPROVA: a classificacao escrita e o roteador discordam:\n'
            '  ${divergentes.join('\n  ')}\n'
            'Mover uma linha de lista NAO move a tela: quem muda o veredito '
            'troca tambem `GoRoute` por `_comBarraFixa` (ou o contrario) em '
            '`rotas.dart`.',
      );
    });

    testWidgets('e a barra da tela empilhada NAO acende slot errado',
        (tester) async {
      // O slot aceso e uma afirmacao sobre onde a pessoa esta, e numa tela
      // empilhada ela e facil de errar. `/mensagens/c-1` esta DENTRO do
      // `AuAu`; `/perfil/dados` nao esta em secao nenhuma da barra -- a conta
      // saiu dela em 19/10.
      //
      // DESLIGAMENTO: em `CascaFixa.slotDaRota`, troque a comparacao por
      // segmento por `startsWith`, ou devolva `0` em vez de `-1`. A segunda
      // metade deste caso reprova.
      expect(
        CascaFixa.slotDaRota('/mensagens/c-1'),
        CascaComAbas.visiveisEm(CascaComAbas.configuracao)
            .indexWhere((d) => d.rota == Rotas.mensagens),
        reason: 'REPROVA: a conversa nao acende o slot do `AuAu`. Ela esta '
            'dentro da secao de mensagens, e a barra tem de dizer isso.',
      );
      expect(
        CascaFixa.slotDaRota('/perfil/dados'),
        -1,
        reason: 'REPROVA: `Meus dados` acende um slot da barra. A secao da '
            'conta SAIU da barra em 19/10 e nao tem slot: acender outro seria '
            'a barra afirmando uma secao em que a pessoa nao esta.',
      );
      expect(
        CascaFixa.slotDaRota('/petshop'),
        -1,
        reason: 'REPROVA: um endereco que apenas COMECA pelas letras de '
            '`/pets` acendeu `Pets`. A comparacao e por SEGMENTO de caminho, '
            'e nao por prefixo de texto.',
      );
    });
  });

  // =========================================================================
  group('(c) `Pets` nao tem mais o alvo dos tres pontos', () {
    // Literal: *"na pagina pet, remova o icone dos ..., so deixe o de escanear
    // a tag"*.
    //
    // DESLIGAMENTO: em `abas.dart`, devolva `AcoesDeCriarFlutuantes` com o
    // `principal` e as `outras`. Os dois casos reprovam.
    testWidgets('o glifo `more_horiz` nao existe na secao', (tester) async {
      await _abrirEmPets(tester);
      expect(
        find.byIcon(Icons.more_horiz),
        findsNothing,
        reason: 'REPROVA: `Pets` ainda desenha `more_horiz`. O cliente foi '
            'literal: *"remova o icone dos ..., so deixe o de escanear a '
            'tag"*.',
      );
    });

    testWidgets('sobrou UM alvo flutuante, e ele e o leitor de UM TOQUE',
        (tester) async {
      await _abrirEmPets(tester);
      final alvos = find.byType(FloatingActionButton);
      expect(
        alvos,
        findsOneWidget,
        reason: 'REPROVA: `Pets` tem '
            '${alvos.evaluate().length} alvos flutuantes, e o cliente pediu '
            'UM. Dois alvos sao o arranjo que ele mandou desfazer.',
      );
      expect(
        find.byType(AcaoDeCriarFlutuante),
        findsOneWidget,
        reason: 'REPROVA: o alvo que ficou nao e `AcaoDeCriarFlutuante`. O '
            'componente de DOIS alvos nao serve mais aqui: a assercao dele '
            'exige duas acoes secundarias, e nao ha nenhuma.',
      );
      // `qr_code_scanner` e nao `qr_code_2`: um LE a plaquinha, o outro
      // EXIBE a propria.
      expect(
        find.descendant(of: alvos, matching: find.byIcon(Icons.qr_code_scanner)),
        findsOneWidget,
        reason: 'REPROVA: o alvo de `Pets` nao desenha `qr_code_scanner`.',
      );
      await tester.tap(alvos);
      await tester.pumpAndSettle();
      expect(
        find.byType(TelaLeitorDeQr),
        findsOneWidget,
        reason: 'REPROVA: o alvo que ficou nao abre o leitor. Ele pinta o '
            'glifo do leitor e nao leva a lugar nenhum.',
      );
    });

    testWidgets('e o respiro do pe da lista continua 72,00 dp', (tester) async {
      // A invasao e a do alvo mais alto mais os 16 dp de assentamento do
      // `Scaffold`. **Tirar o segundo alvo tirou LARGURA do canto e nao
      // altura**, entao o respiro rolavel que ja existia continua pagando a
      // conta inteira -- o pedido do briefing era confirmar isso, nao supor.
      await _abrirEmPets(tester);
      final alvo = tester.getRect(find.byType(FloatingActionButton));
      final lista = find
          .descendant(
            of: find.byType(Scaffold),
            matching: find.byType(ListView),
          )
          .first;
      final corpo = tester.getRect(lista);
      final respiro = (tester.widget<ListView>(lista).padding as EdgeInsets)
          .bottom;
      final invasao = corpo.bottom - alvo.top;
      expect(
        invasao,
        closeTo(72.0, 0.01),
        reason: 'REPROVA: o alvo flutuante invade '
            '${invasao.toStringAsFixed(2)} dp do pe do corpo, e o medido '
            'continua sendo 72,00 (56 de desenho + 16 de assentamento).',
      );
      expect(
        respiro,
        greaterThanOrEqualTo(invasao),
        reason: 'REPROVA: o pe da lista reserva '
            '${respiro.toStringAsFixed(2)} dp e o alvo cobre '
            '${invasao.toStringAsFixed(2)} dp. O ultimo cartao de pet perdido '
            'termina embaixo dele, em toda rolagem.',
      );
    });
  });

  // =========================================================================
  group('(d) as duas acoes orfas tem casa no Perfil', () {
    // =======================================================================
    // O ITEM 3 E O ITEM 4 SAO O MESMO PROBLEMA
    // =======================================================================
    //
    // Tirar o alvo secundario de `Pets` tirou a folha, e com ela as duas
    // unicas portas de `Registrar achado avulso` e uma das duas de `Cadastrar
    // pet`. **Medido antes de mover:** `Rotas.registrarAchado` aparecia em
    // `lib/` so em tres lugares -- a folha, a declaracao da rota e a propria
    // tela. Sem casa nova, uma tela construida ficaria inalcancavel em
    // silencio: a rota existe, a tela monta, e o que desaparece e o unico
    // caminho humano.

    testWidgets('`Registrar achado avulso` e alcancavel pela FOTO', (
      tester,
    ) async {
      // DESLIGAMENTO: em `abas.dart`, apague o `ItemDeMenu` de `Registrar
      // achado avulso`. Este caso reprova, e nenhum outro da suite acusa.
      await _abrirAContaPelaFoto(tester);

      final item = find.widgetWithText(ItemDeMenu, 'Registrar achado avulso');
      await tester.scrollUntilVisible(item, 200);
      expect(
        item,
        findsOneWidget,
        reason: 'REPROVA: a tela da conta nao oferece `Registrar achado '
            'avulso`. Ela morava atras do alvo de tres pontos de `Pets`, que '
            'o cliente mandou remover em 20/10, e **nao tinha nenhuma outra '
            'porta em `lib/`**.',
      );
      await tester.tap(item);
      await tester.pumpAndSettle();
      // **O ENDERECO, e nao `CascaFixa`.** Ela era o sinal de "empilhou" at'e
      // 20/10; com a delimitacao, `/achados/novo` e PAGINA INTERNA e nao veste
      // casca nenhuma -- um caso que a procurasse reprovaria por ter dado
      // certo.
      expect(
        GoRouterState.of(
          tester.element(find.byType(Scaffold).first),
        ).uri.path,
        Rotas.registrarAchado,
        reason: 'REPROVA: tocar no item nao levou a ${Rotas.registrarAchado}.',
      );
      expect(
        find.text('Registrar achado avulso'),
        findsNothing,
        reason: 'REPROVA: o toque nao saiu do menu -- a tela de destino nao '
            'abriu e o item continua na tela. Item que pinta o nome e nao '
            'navega e funcao perdida com um rotulo em cima.',
      );
    });

    // =======================================================================
    // `Cadastrar pet`: UM CASO POR FASE do bloco de pets
    // =======================================================================
    //
    // **A porta dela JA EXISTIA no Perfil** -- o `BotaoPrimario` `Cadastrar
    // meu pet` -- e por isso ela nao ganhou um `ItemDeMenu`: dois controles
    // para a mesma rota na mesma tela, a um cabecalho de distancia, e o
    // defeito e nao o conserto.
    //
    // **O que ela tinha era um buraco de FASE**, medido: o botao existia em
    // duas das seis fases do bloco. Com o alvo de `Pets` fora, as outras
    // quatro ficaram sem porta nenhuma no app inteiro -- quem abrisse a conta
    // com o servidor fora nao tinha como cadastrar um pet.
    //
    // DESLIGAMENTO: em `meus_pets.dart`, tire `_acaoDeCadastrar()` de uma das
    // fases. **O caso daquela fase reprova, e so o dela.**
    for (final fase in <({String nome, Future<http.Response> Function(http.Request) rede})>[
      (
        nome: 'a lista VAZIA',
        rede: _redeMinima,
      ),
      (
        nome: 'a lista COM pets',
        rede: _redeComUmPet,
      ),
      (
        nome: 'a FALHA sem cache',
        rede: _redeQueFalhaNosPets,
      ),
    ]) {
      testWidgets(
        '`Cadastrar pet` tem porta no Perfil com ${fase.nome}',
        (tester) async {
          tester.view.physicalSize = const Size(1125, 3000);
          tester.view.devicePixelRatio = 3;
          addTearDown(tester.view.reset);
          await abrirOApp(
            tester,
            rede: fase.rede,
            deposito: depositoLogado(),
          );
          await tester.tap(find.widgetWithText(NavigationDestination, 'Pets'));
          await tester.pumpAndSettle();
          await tester.tap(find.byType(AvatarDaConta));
          await tester.pumpAndSettle();

          final porta = find.widgetWithText(FilledButton, 'Cadastrar meu pet');
          await tester.scrollUntilVisible(porta, 200);
          expect(
            porta,
            findsOneWidget,
            reason: 'REPROVA: com ${fase.nome}, a tela da conta nao oferece '
                '`Cadastrar meu pet`. Desde 20/10 ela e a UNICA porta de '
                '`Rotas.cadastrarPet` no app -- o alvo de tres pontos de '
                '`Pets`, que tinha a outra, saiu por pedido do cliente.',
          );
          await tester.tap(porta);
          await tester.pumpAndSettle();
          // O ENDERECO, pela razao da nota do caso acima: o assistente de
          // cadastro e PAGINA INTERNA desde 20/10 e nao veste `CascaFixa`.
          expect(
            GoRouterState.of(
              tester.element(find.byType(Scaffold).first),
            ).uri.path,
            Rotas.cadastrarPet,
            reason: 'REPROVA: com ${fase.nome}, o toque em `Cadastrar meu '
                'pet` nao levou a ${Rotas.cadastrarPet}.',
          );
        },
      );
    }
  });

  // =========================================================================
  group('(e) os cabecalhos de grupo sao cabecalho, e nao controle', () {
    // =======================================================================
    // O ITEM 4, na parte que nao se ve
    // =======================================================================
    //
    // Literal: *"como o menu do perfil esta crescendo, vamos separar os links
    // por topicos/categorias"*.
    //
    // **Quem navega por cabecalho no VoiceOver e no TalkBack pula de grupo em
    // grupo**, e um texto em `labelMedium` e `textMuted` sem o papel de
    // cabecalho e so um texto pequeno: para essa pessoa os topicos nao
    // existiriam, e a lista continuaria sendo a pilha de linhas iguais que o
    // cliente mandou organizar.
    //
    // **E cabecalho tocavel e pior que nenhum:** ele promete um destino que
    // nao existe.
    //
    // DESLIGAMENTO: em `item_de_menu.dart`, tire o `header: true` do
    // `Semantics` de `TituloDeGrupoDeMenu`. O primeiro caso reprova nomeando
    // o grupo.
    testWidgets('os quatro grupos existem, e sao anunciados como cabecalho',
        (tester) async {
      final semantica = tester.ensureSemantics();
      await _abrirAContaPelaFoto(tester);

      final grupos = find.byType(TituloDeGrupoDeMenu);
      expect(
        grupos.evaluate().length,
        greaterThanOrEqualTo(4),
        reason: 'REPROVA: a tela da conta tem '
            '${grupos.evaluate().length} cabecalho(s) de grupo, e o item 4 '
            'de 20/10 pede quatro: `Meus pets`, `Conta`, `Comunidade` e '
            '`Bichos na rua`. Encolher a lista e a forma mais facil de fazer '
            'um caso de agrupamento passar sem agrupar nada.',
      );

      for (final elemento in grupos.evaluate()) {
        final texto = (elemento.widget as TituloDeGrupoDeMenu).texto;
        final dados = tester
            .getSemantics(
              find.descendant(
                of: find.byWidget(elemento.widget),
                matching: find.text(texto),
              ),
            )
            .getSemanticsData();
        expect(
          dados.flagsCollection.isHeader,
          isTrue,
          reason: 'REPROVA: o grupo "$texto" NAO e anunciado como cabecalho. '
              'Quem navega por cabecalho nao para nele, e para essa pessoa os '
              'topicos do pedido 4 nao existem.',
        );
        expect(
          dados.hasAction(SemanticsAction.tap),
          isFalse,
          reason: 'REPROVA: o grupo "$texto" e TOCAVEL. Cabecalho com acao de '
              'toque promete um destino que nao existe, e quem usa leitor de '
              'tela o ouve anunciado como controle.',
        );
      }
      semantica.dispose();
    });

    testWidgets('CONTRAPROVA: a varredura ENXERGA um cabecalho tocavel',
        (tester) async {
      // Sem esta contraprova, o caso acima poderia estar verde por nao estar
      // olhando: `hasAction` num no que nao existe nao reprova nada. Aqui o
      // MESMO par de conferencias e aplicado a um cabecalho plantado com
      // `onTap`, e ele PRECISA falhar.
      final semantica = tester.ensureSemantics();
      await tester.pumpWidget(
        MaterialApp(
          theme: BichuTheme.claro,
          home: Scaffold(
            body: InkWell(
              onTap: () {},
              child: const TituloDeGrupoDeMenu('Plantado'),
            ),
          ),
        ),
      );
      await tester.pumpAndSettle();
      final plantado =
          tester.getSemantics(find.text('Plantado')).getSemanticsData();
      final doInkWell =
          tester.getSemantics(find.byType(InkWell)).getSemanticsData();
      expect(
        plantado.hasAction(SemanticsAction.tap) ||
            doInkWell.hasAction(SemanticsAction.tap),
        isTrue,
        reason: 'REPROVA: a conferencia de "cabecalho nao e tocavel" NAO ve um '
            'cabecalho tocavel plantado. Ela esta verde por nao olhar, e o '
            'caso acima nao prova nada.',
      );
      semantica.dispose();
    });
  });

  // =========================================================================
  group('(f) a barra e UMA, desenhada num ponto so', () {
    // =======================================================================
    // O PORTAO ANTI-DIVERGENCIA DA ESCOLHA (c)
    // =======================================================================
    //
    // A saida escolhida para o item 2 poe a barra em DUAS cascas --
    // `CascaComAbas`, com os ramos, e `CascaFixa`, com as telas empilhadas. O
    // risco nomeado no briefing e exatamente este: *"duplica o componente e o
    // risco e as duas divergirem"*. Este caso e o que impede.
    //
    // DESLIGAMENTO: escreva um segundo `NavigationBar` em qualquer arquivo de
    // `lib/`. Este caso reprova nomeando o arquivo.
    test('`NavigationBar(` aparece em UM arquivo de lib/, e e o da casca', () {
      final achados = <String>[];
      for (final arquivo in Directory('lib').listSync(recursive: true)) {
        if (arquivo is! File || !arquivo.path.endsWith('.dart')) continue;
        final fonte = arquivo.readAsStringSync();
        // Sem os comentarios: a prosa desta arvore cita o nome do componente
        // em varios lugares, e um portao que lesse a PALAVRA reprovaria por
        // documentacao. Foi um dos portoes cegos achados nesta rodada.
        final codigo = fonte
            .split('\n')
            .where((l) => !l.trimLeft().startsWith('//'))
            .join('\n');
        if (codigo.contains('NavigationBar(')) achados.add(arquivo.path);
      }
      expect(
        achados,
        <String>['lib/telas/casca_com_abas.dart'],
        reason: 'REPROVA: a barra de baixo e construida em $achados. Duas '
            'barras divergem, e no dia em que divergirem ninguem sabe qual '
            'das duas e a certa -- o risco que a saida (c) do item 2 assumiu '
            'e que `BarraDeBaixo` existe para fechar. As duas cascas usam o '
            'MESMO componente; o que muda entre elas e o motor do toque.',
      );
    });

    testWidgets('as duas cascas desenham a MESMA barra', (tester) async {
      // O caso de fonte acima nao veria duas barras construidas pelo mesmo
      // arquivo. Este compara o que chega a tela: os rotulos pintados na
      // casca dos ramos e na casca fixa.
      // **A TELA MEDIDA E `/mensagens`, de PRIMEIRO PLANO.** Era a conversa, e
      // com a delimitacao de 20/10 ela deixou de ter barra -- medir ali
      // compararia a barra da casca com NADA e o caso reprovaria pelo motivo
      // errado. A area de mensagens e uma das duas que vestem [CascaFixa], e e
      // ela que da o que comparar.
      await _abrirEmPets(tester);
      List<String> rotulos() => find
          .byType(NavigationDestination)
          .evaluate()
          .map((e) => (e.widget as NavigationDestination).label)
          .toList();
      final naSecao = rotulos();
      await irPara(tester, '/mensagens');
      final naCascaFixa = rotulos();
      expect(
        find.byType(CascaFixa),
        findsOneWidget,
        reason: 'REPROVA: `/mensagens` nao abriu dentro de `CascaFixa`, e sem '
            'ela nao ha segunda barra para comparar.',
      );
      expect(
        naCascaFixa,
        naSecao,
        reason: 'REPROVA: a barra da area de mensagens pinta $naCascaFixa e a '
            'da secao pinta $naSecao. As duas cascas tem de desenhar a MESMA '
            'barra.',
      );
    });
  });

  // =========================================================================
  group('(g) ninguem ficou sem saida', () {
    // =======================================================================
    // A PROPRIEDADE QUE MUDOU DE RAZAO, E A CONTA QUE A REVERSAO DEVOLVEU
    // =======================================================================
    //
    // `SAIDA e FOTO nunca aparecem na mesma barra`, em
    // `gaveta_com_submenus_test.dart`, provava que a composicao `Saida +
    // titulo + foto` nao existe -- e a razao escrita era *"perder a SAIDA custa
    // a tela: ela vira um beco"*. **Com a barra de baixo, essa razao mudou**: a
    // tela com barra passou a ter DUAS saidas. O caso la foi reescrito com a
    // razao nova; o que mora aqui e a conta de QUEM depende de QUAL saida.
    //
    // **E a reversao de 20/10 devolveu a conta antiga em quatro telas.** As
    // rotas de escape do fluxo de perdido montam `AbaPerfil()` quando falta o
    // rascunho, e `AbaPerfil` e raiz de secao -- a FOTO no `leading` apaga a
    // seta automatica do `AppBar`. Enquanto elas foram de primeiro plano, a
    // barra era a segunda saida; de volta a internas, **a foto voltou a ser a
    // unica** -- e a foto nao VOLTA, ela vai para a conta. Ver
    // [saidaSoPelaFoto]: nao e beco, e nao e voltar, e esta no relatorio como
    // pergunta fechada.
    //
    // Entao as saidas aceitas sao TRES, e o caso diz qual cada tela tem:
    // `SaidaDaTela` ou `BackButton` no topo, a barra de baixo, ou a foto.
    //
    // DESLIGAMENTO: em `casca_com_abas.dart`, tire a condicao `raizDeSecao` do
    // `leading` de `TelaDeAba` e mande a foto para toda tela. A conta travada
    // abaixo muda em bloco e o caso reprova nomeando as telas.
    for (final tela in telasEmpilhadas) {
      testWidgets('${tela.nome} tem saida', (tester) async {
        await _abrirEmPets(tester);
        await irPara(tester, tela.endereco);

        // **A SAIDA E DETECTADA PELO CONTROLE e nao pelo `tooltip`.** Este app
        // tem TRES formas de saida no slot da esquerda -- `SaidaDaTela` de
        // voltar (`Voltar`), de fechar (`Fechar`) e o `BackButton` automatico
        // do `AppBar`, cujo texto vem das localizacoes do Material e **nao e
        // portugues na bancada**. Um caso que casasse `find.byTooltip('Voltar')`
        // acusaria beco em dez telas que tem saida, e foi o que a primeira
        // medicao deste arquivo fez.
        final dentroDaBarra = find.byType(AppBar);
        final temSaidaNoTopo = find
                .descendant(of: dentroDaBarra, matching: find.byType(SaidaDaTela))
                .evaluate()
                .isNotEmpty ||
            find
                .descendant(of: dentroDaBarra, matching: find.byType(BackButton))
                .evaluate()
                .isNotEmpty;
        // **A SAIDA FLUTUANTE SOBRE A MIDIA, acrescentada na mescla do
        // terceiro lote de 20/10/2026.** As tres formas acima presumem que a
        // tela tem `AppBar`, e a ficha do encontro NAO tem no estado pronto:
        // a capa sangra ate o topo (UX 28.7.2, sem titulo visivel enquanto a
        // capa esta na tela) e a saida e um `IconButton` de 48 dp sobre a
        // foto, com fundo `surface` e sombra propria (design system 24.12.1 e
        // 24.12.6). Ela e saida de verdade -- `canPop` e `pop`, com escape
        // para `/rede` --, e o caso a acusava de BECO so porque olhava
        // dentro do `AppBar`.
        //
        // **Isto ACRESCENTA um sinal e nao afrouxa nenhum**: as tres
        // conferencias acima continuam exatamente como estavam, e tela sem
        // NENHUM controle de saida continua reprovando. O `tooltip` serve
        // aqui, onde nao servia como conferencia UNICA: o alerta do
        // comentario acima e contra depender dele para o `BackButton`
        // automatico do Material, cujo texto nao e portugues na bancada --
        // uma saida FEITA NESTA CASA sempre escreve `Voltar` ou `Fechar`.
        final temSaidaFlutuante =
            find.byTooltip('Voltar').evaluate().isNotEmpty ||
                find.byTooltip('Fechar').evaluate().isNotEmpty;
        final temBarra = find.byType(NavigationBar).evaluate().isNotEmpty;
        final temFoto = find
            .descendant(of: dentroDaBarra, matching: find.byType(AvatarDaConta))
            .evaluate()
            .isNotEmpty;

        expect(
          temSaidaNoTopo || temBarra || temFoto || temSaidaFlutuante,
          isTrue,
          reason: 'REPROVA: ${tela.nome} (${tela.endereco}) e um BECO: nao tem '
              'saida no topo, nem barra de baixo, nem a foto da conta. A '
              'pessoa so sai pelo gesto do sistema.',
        );

        // E A CONTA DE QUEM DEPENDE DE QUAL SAIDA, travada em DUAS linhas:
        // tela que perde o `Voltar` em silencio passa a depender da foto, e a
        // conta muda sem ninguem decidir.
        expect(
          temSaidaNoTopo,
          !saidaSoPelaFoto.contains(tela.endereco) &&
              !saidaFlutuanteSobreMidia.contains(tela.endereco),
          reason: 'REPROVA: ${tela.endereco} '
              '${temSaidaNoTopo ? "GANHOU" : "PERDEU"} a saida da barra de '
              'topo. `saidaSoPelaFoto` diz quais telas saem SO pela foto -- e '
              'a foto vai para a conta, nao volta --, e a conta acabou de '
              'mudar sem decisao: ou o slot da esquerda trocou de conteudo, ou '
              'uma rota de escape deixou de montar `AbaPerfil`.',
        );
        expect(
          temBarra,
          telasDePrimeiroPlano.any((t) => t.padrao == tela.padrao),
          reason: 'REPROVA: a barra de baixo de ${tela.endereco} nao bate com '
              'a classificacao dela. Este caso mede SAIDA e a barra e uma das '
              'tres: se ela apareceu numa interna, o grupo (b) tambem reprova.',
        );
      });
    }

    test('as quatro que saem SO pela foto sao internas, e isso e deliberado',
        () {
      // **A GUARDA CONTRA O VERDE POR VAZIO.** Se alguem mover as quatro para
      // `telasDePrimeiroPlano`, elas ganham a barra, `temSaidaNoTopo` continua
      // falso e a lista acima continua certa -- mas a razao de a lista existir
      // (*"a foto e a unica saida"*) deixa de ser verdade, e ninguem notaria.
      final internas = telasInternas.map((t) => t.padrao).toSet();
      expect(
        saidaSoPelaFoto.difference(internas),
        isEmpty,
        reason: 'REPROVA: ${saidaSoPelaFoto.difference(internas)} saem so pela '
            'foto e NAO estao classificadas como internas. Se elas voltaram ao '
            'primeiro plano, a barra passou a ser a segunda saida delas e esta '
            'lista precisa dizer isso -- ou deixar de existir.',
      );
    });
  });
}

/// Uma rede com UM pet na lista: a fase `lista` com conteudo.
Future<http.Response> _redeComUmPet(http.Request req) async {
  if (req.url.path == '/v1/pets' && req.method == 'GET') {
    return json200(<String, dynamic>{
      'items': <Map<String, dynamic>>[
        <String, dynamic>{
          'id': 'p-1',
          'name': 'Nina',
          'species': 'dog',
          'status': 'safe',
        },
      ],
    });
  }
  return _redeMinima(req);
}

/// Uma rede que recusa a lista de pets: a fase `falhaSemCache`.
Future<http.Response> _redeQueFalhaNosPets(http.Request req) async {
  if (req.url.path == '/v1/pets' && req.method == 'GET') {
    return problema('server-error', 500);
  }
  return _redeMinima(req);
}
