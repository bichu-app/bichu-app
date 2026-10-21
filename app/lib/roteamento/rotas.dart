import 'package:flutter/material.dart';
import 'package:go_router/go_router.dart';

import '../api/mural_api.dart';
import '../api/modelos_pet.dart';
import '../intencao/cadastro_de_pet_como_intencao.dart';
import '../intencao/caso_de_perdido_como_intencao.dart';
import '../intencao/leitura_como_intencao.dart';
import '../achado/rascunho_do_achado.dart';
import '../perdido/rascunho_do_caso.dart';
import '../sessao/controlador_de_sessao.dart';
import '../telas/abas.dart';
import '../telas/casca_com_abas.dart';
import '../telas/conta/tela_criar_conta.dart';
import '../telas/conta/tela_entrar.dart';
import '../telas/conta/tela_esqueci_minha_senha.dart';
import '../telas/conta/tela_verifique_seu_email.dart';
import '../telas/escanear/tela_do_pet_da_tag.dart';
import '../telas/escanear/tela_leitor_de_qr.dart';
import '../telas/pet/rascunho_de_pet.dart';
import '../telas/pet/resultado_do_cadastro.dart';
import '../telas/pet/tela_cadastrar_foto.dart';
import '../telas/pet/tela_cadastrar_identificacao.dart';
import '../telas/pet/tela_cadastrar_sinais.dart';
import '../telas/pet/tela_detalhe_do_pet.dart';
import '../telas/pet/tela_editar_pet.dart';
import '../telas/pet/tela_pet_cadastrado.dart';
import '../telas/pet/tela_acompanhar_plaquinha.dart';
import '../telas/pet/tela_solicitar_plaquinha.dart';
import '../api/vitrine_api.dart';
import '../escopo.dart';
import '../telas/conexoes/convide_tutores.dart';
import '../telas/conexoes/tela_pedidos_de_conexao.dart';
import '../telas/seguranca/tela_de_bloqueados.dart';
import '../api/pessoas_api.dart';
import '../api/seguranca_api.dart';
import '../telas/pessoa/tela_perfil_de_pessoa.dart';
import '../telas/mural/publicar_no_mural.dart';
import '../telas/perfil/tela_endereco_de_entrega.dart';
import '../telas/perfil/vitrine_de_fotos.dart';
import '../telas/mensagens/area_de_mensagens.dart';
import '../telas/mensagens/tela_da_conversa.dart';
import '../api/modelos_notificacao.dart';
import '../telas/notificacoes/caixa_de_notificacoes.dart';
import '../telas/notificacoes/comunicado.dart';
import '../telas/perfil/meus_achados.dart';
import '../telas/perfil/meus_eventos.dart';
import '../telas/perfil/tela_dados_pessoais.dart';
import '../telas/perdido/resultado_da_abertura.dart';
import '../telas/perdido/tela_alcance_do_alerta.dart';
import '../telas/perdido/tela_de_quem_e_o_caso.dart';
import '../telas/perdido/tela_de_retomada.dart';
import '../telas/perdido/tela_do_caso_publico.dart';
import '../telas/perdido/tela_onde_e_quando.dart';
import '../telas/achado/resultado_do_achado.dart';
import '../telas/achado/tela_achado_registrado.dart';
import '../telas/achado/tela_do_achado.dart';
import '../telas/achado/tela_registrar_achado.dart';
import '../intencao/achado_como_intencao.dart';
import '../telas/loja/produto_da_loja.dart';
import '../telas/perto/pagina_do_local.dart';
import '../telas/perto/sugerir_profissional.dart';
import '../telas/perto/tela_de_minhas_indicacoes.dart';
import '../telas/rede/criar_encontro.dart';
import '../telas/rede/encontro_da_rede.dart';
import '../telas/tela_de_abertura.dart';

/// Os enderecos do app.
///
/// Estado que merece link tem endereco. As cinco secoes, os sub-destinos e as
/// telas de conta ja nascem enderecaveis para que o deep link (F5) tenha onde
/// chegar quando as historias de App Links e Universal Links entrarem: a rota
/// `/t/<codigo>` da tag entra aqui, e nao numa navegacao imperativa paralela.
abstract final class Rotas {
  static const String abertura = '/';

  /// As CINCO secoes da barra, na ordem em que a barra as mostra (UX 27.2).
  ///
  /// `inicio` e `perdidos` SAIRAM. `Inicio` deixou de ser destino porque cada
  /// secao e a home do proprio conteudo e nao ha tela agregadora; `Perdidos`
  /// deixou de ser destino porque a casa dos perdidos e `Pets`, que reune
  /// perdidos, achados e adocoes. Nao renomeie de volta: a constante `inicio`
  /// era o escape padrao de sete pontos do app e por isso a troca foi feita em
  /// todos eles de uma vez.
  static const String pets = '/pets';
  static const String rede = '/rede';

  /// O nome do parametro de consulta que diz **em qual aba a `Rede` abre**.
  ///
  /// Ele existe por um motivo medido, e nao por generalidade: a aba `Usuarios`
  /// e a terceira, e em 320 dp ela nasce 40% visivel -- a 200% de escala, fora
  /// da tela. O caminho que destrava a conexao nao pode depender de a pessoa
  /// descobrir que a barra de abas rola, e o estado vazio do Mural e o lugar
  /// por onde todo mundo passa no primeiro dia.
  ///
  /// **Parametro de consulta e nao rota propria** (`/rede/usuarios`): a aba e
  /// conteudo da secao, nao destino. Uma rota por aba poria tres enderecos para
  /// a mesma tela e faria o slot da barra de baixo depender de qual deles foi
  /// usado -- e [CascaFixa.slotDaRota] casa pelo PRIMEIRO segmento, que
  /// continua sendo `rede` nas tres.
  ///
  /// Valor desconhecido e **ignorado**, e a `Rede` abre em `Eventos`: um
  /// endereco velho ou digitado errado nao e motivo para tela de erro.
  static const String parametroDaAbaDaRede = 'aba';

  /// O endereco da `Rede` **aberta na aba `Usuarios`**.
  ///
  /// Montado aqui e nao na tela que o usa: quem precisa dele e o estado vazio
  /// do Mural, e endereco composto na tela e o que faz dois lugares escreverem
  /// a mesma URL de formas diferentes.
  static const String redeNaBuscaDePessoas = '$rede?$parametroDaAbaDaRede=usuarios';

  /// O encontro da `Rede`, sob o ramo da secao: a barra de abas continua, e
  /// voltar devolve a agenda.
  ///
  /// **ELA VOLTOU EM 20/10/2026, e a volta e correcao de pedido.** Esta rota
  /// foi apagada em 19/10 junto com a tela, e o cliente corrigiu no dia
  /// seguinte: *"eu nao pedi pra voce remover, eu pedi para remover o clique
  /// para o usuario nnao conseguir acessar a pagina de detalhes"*. O que ele
  /// pediu era o CLIQUE, e o clique agora depende da sessao -- quem decide e
  /// `rede/agenda_da_rede.dart`, e nao esta rota.
  ///
  /// **Ela nao tem guarda de rota, como nenhuma rota deste app tem.** Chegar
  /// aqui por link profundo sem conta e legitimo e abre a pagina: medido em
  /// 20/10/2026, `GET /v1/network/events/{slug}` responde **200 sem conta**, e
  /// so o mapa (`/location`, 401 sem token) fica de fora. O aviso de que falta
  /// entrar e do TOQUE no cartao, que e onde o cliente o pediu.
  ///
  /// **Nao ha mais a razao antiga desta rota**, que era a volta da guarda de
  /// acao de `Pedir para participar` depois do login: o pedido de participacao
  /// saiu com o evento privado, por decisao dele.
  /// **IRMA da casca e SEM barra, por decisao do cliente de 20/10/2026.**
  ///
  /// O caminho e ABSOLUTO desde que ela saiu do `routes:` do ramo da
  /// `Rede`: *"ao clicar nos detalhes do evento, remove a barra"*. Ver o
  /// bloco desta rota em `_rotas`, que registra as duas frentes em conflito
  /// e o veredito.
  static const String encontroDaRede = '/rede/encontros/:slug';

  static const String parametroDoEncontro = 'slug';

  static String encontroDaRedeDe(String slug) =>
      '/rede/encontros/${Uri.encodeComponent(slug)}';

  /// **Marcar um encontro da `Rede`: IRMA da casca, e nao sob o ramo.**
  ///
  /// Mesma razao do assistente de cadastro de pet e do registro de achado:
  /// preencher um formulario e TAREFA, e a barra de abas abaixo dele
  /// ofereceria quatro saidas para o meio do preenchimento. Leitura fica sob o
  /// ramo (`encontroDaRede`); tarefa, irma.
  ///
  /// **Declarada ANTES do ramo da casca**, como `/pets/novo` em relacao a
  /// `/pets`: o `go_router` casa na ordem de registro, e o
  /// [encontroDaRede] do ramo engoliria qualquer segmento -- o formulario
  /// abriria o detalhe de um encontro chamado "novo". A regra voltou a ter o
  /// motivo original em 20/10/2026, com `encontros/:slug` de volta.
  static const String criarEncontroDaRede = '/rede/encontros/novo';

  /// **`Rotas.perto` NAO EXISTE MAIS, e a ausencia e o contrato (19/10/2026).**
  ///
  /// `Perto` deixou de ser secao por decisao do cliente: o conteudo dela virou
  /// a aba `Comunidade` da `Rede`. **Apagar a constante e deliberado e e o que
  /// fecha o defeito de verdade** -- deixa-la apontando para `/perto` criaria
  /// uma rota ORFA: um endereco que o roteador conhece, que nenhum destino da
  /// barra alcanca, e que abriria uma secao que o produto nao tem mais. Link
  /// profundo antigo para `/perto` agora cai no desvio de rota desconhecida,
  /// que e a resposta honesta.
  ///
  /// O que foi das duas rotas que viviam SOB ela: [sugerirProfissional] e
  /// [localDoPerto] mudaram de prefixo para `/rede/...` e seguem nas proprias
  /// linhas. Nenhuma tela ficou sem endereco.
  ///
  /// O portao e o grupo `nao ha rota orfa para a secao que saiu` de
  /// `test/telas/gaveta_oculta_e_barra_nova_test.dart`.

  /// **A SECAO `Mural`: a linha do tempo das publicacoes (19/10/2026).**
  ///
  /// Decisao do cliente, literal: *"a secao de timeline, onde as
  /// publicacoes/notificacoes dos usuarios que ele segue e sao amigos
  /// apareca"*, *"o menu onde o usuario vai fazer os posts, compartilhar suas
  /// fotos em eventos"*.
  ///
  /// **ESTE NOME DE ROTA E COMBINADO COM A FRENTE DO CONTEUDO, e e por isso
  /// que ele e obvio e nao abreviado.** Nesta frente so o LUGAR foi
  /// construido: o slot na barra, o ramo do `IndexedStack` e a tela em estado
  /// inicial honesto. Publicar, a linha do tempo, curtir, comentar e seguir
  /// sao de outra frente, que roda em paralelo e cria `user_publications`, o
  /// contrato e as operacoes. Quem chegar com o conteudo troca o corpo de
  /// `TelaDoMural` e **nao mexe nesta linha, nem no ramo, nem no registro de
  /// secoes**.
  ///
  /// `/mural`, no singular e sem prefixo: a mesma forma de `/rede`, `/loja` e
  /// `/pets`. As rotas filhas dela (a publicacao aberta, por exemplo) nascem
  /// SOB este caminho, como `encontros/:slug` nasceu sob `/rede`.
  static const String mural = '/mural';

  /// **Publicar no Mural: IRMA da casca, e nao sob o ramo** (20/10/2026).
  ///
  /// Mesma razao de [criarEncontroDaRede] e do assistente de cadastro de pet:
  /// escrever uma publicacao e TAREFA, e a barra de abas abaixo dela ofereceria
  /// quatro saidas para o meio do preenchimento -- com uma foto ja enviada e
  /// nenhum lugar para dizer que ela vai se perder.
  ///
  /// **Declarada ANTES do ramo da casca**, como `/rede/encontros/novo` em
  /// relacao a `/rede`: o `go_router` casa na ordem de registro, e o `/mural`
  /// do ramo engoliria o segmento se a ordem se invertesse.
  static const String publicarNoMural = '/mural/publicar';

  /// **Indicar um profissional: irma da casca**, pela mesma razao de
  /// [criarEncontroDaRede].
  ///
  /// **O PREFIXO MUDOU DE `/perto` PARA `/rede` em 19/10/2026**, com a secao:
  /// era `/perto/indicacoes/nova`. Deixa-la em `/perto` manteria vivo o
  /// primeiro segmento de uma secao que nao existe -- um endereco meio-orfao,
  /// que nenhuma tela do app monta e que reapareceria no dia em que alguem
  /// registrasse `/perto` de novo.
  ///
  /// **Declarada ANTES do ramo da casca** nao e necessario aqui, ao contrario
  /// de [criarEncontroDaRede]: o caminho dela e `/rede/indicacoes/nova`, e
  /// [encontroDaRede] casa em `/rede/encontros/:slug`. Os segundos segmentos
  /// diferem, entao nao ha como um engolir o outro.
  static const String sugerirProfissional = '/rede/indicacoes/nova';

  /// **`Minhas indicacoes`: PORTA PROPRIA, e nao mais aba (19/10/2026).**
  ///
  /// Ela era a segunda aba da secao `Perto` (`AbaDoPerto.indicacoes`). Com as
  /// cinco abas antigas tendo de caber em duas mais filtro, `Meus pedidos`
  /// virou filtro e **esta NAO cabe no filtro** -- e a assimetria e medida, nao
  /// descuido:
  ///
  /// `Meus pedidos` vira filtro porque a ENTIDADE NAO MUDA: a lista continua
  /// sendo de eventos, e o recorte so fica com os eventos em que eu pedi para
  /// ir. O cartao ja sabe pintar o estado do pedido (`_ItemDaAgenda` carrega
  /// `pedido`).
  ///
  /// `Minhas indicacoes` nao vira filtro porque a entidade MUDA: uma indicacao
  /// **em analise** ainda nao e um local do diretorio -- nao tem ficha, nao
  /// esta na lista, e quem a le e outra operacao (`listMyDirectorySuggestions`).
  /// Filtrar a lista de locais por "as que eu indiquei" devolveria **zero**
  /// justamente no caso que interessa: a que ainda espera revisao. Filtro que
  /// mente sobre o alcance e o que `barra_de_listagem.dart` existe para
  /// impedir.
  ///
  /// **Irma da casca, e nao sob o ramo**, ao contrario de [localDoPerto]: a
  /// lista das minhas indicacoes e uma tela de CONTA, da mesma familia de
  /// `Meus achados` e `Meus dados`, e todas aquelas cobrem a casca e tem
  /// `Voltar`. Sob o ramo ela herdaria a barra de baixo e a foto da conta no
  /// slot da esquerda, e a saida dela sumiria.
  ///
  /// A regua e **SESSAO**, e nao `podeCriarNaComunidade`: ler o que eu ja fiz
  /// nao exige e-mail confirmado -- quem indicou e depois trocou de e-mail
  /// continua tendo indicacoes na fila, e esconder a lista esconderia o
  /// trabalho dela mesma. Quem desenha a recusa sem conta e a propria tela,
  /// com `ConviteParaEntrar`.
  static const String minhasIndicacoes = '/rede/indicacoes';

  /// A pagina de um local da aba `Comunidade`, **sob o ramo da `Rede`**.
  ///
  /// O cliente pediu que o cartao do diretorio abrisse uma pagina, com
  /// pontuacao de 1 a 5 e recomendacao em texto visivel aos outros usuarios.
  /// Esta e a porta.
  ///
  /// **Sob o ramo, e nao irma da casca**, pela mesma escolha de
  /// [produtoDaLoja] e [encontroDaRede] e pelo mesmo motivo: a pagina de um
  /// local e LEITURA, nao tarefa. A barra de abas continua, e voltar devolve a
  /// lista com a busca e o filtro de quem estava procurando intactos -- quem
  /// esta comparando tres veterinarios quer continuar comparando, e esconder
  /// as outras quatro secoes para mostrar uma ficha tiraria o app de quem so
  /// foi ver uma nota.
  ///
  /// **O PREFIXO MUDOU DE `/perto` PARA `/rede` em 19/10/2026.** O caminho
  /// relativo nao mudou (`locais/:slug`); o que mudou foi sob qual ramo ele e
  /// registrado, e por isso [localDoPertoDe] teve de andar junto -- ela monta o
  /// caminho ABSOLUTO, e um prefixo velho ali daria uma rota que nao existe,
  /// em silencio, so no toque do cartao.
  static const String localDoPerto = 'locais/:slug';

  static const String parametroDoLocal = 'slug';

  /// O endereco do local [slug].
  ///
  /// `Uri.encodeComponent` porque o `slug` vem da resposta do servidor, e nao
  /// desta tela: montar caminho com interpolacao crua e como um slug com barra
  /// vira uma rota que nao existe. Mesma regra de [produtoDaLojaDe].
  static String localDoPertoDe(String slug) =>
      '/rede/locais/${Uri.encodeComponent(slug)}';
  static const String loja = '/loja';

  /// O produto da `Loja`, sob o ramo da secao: a barra de abas continua, e
  /// voltar devolve a vitrine onde a pessoa estava, com a busca e o filtro
  /// dela intactos.
  ///
  /// **Sob o ramo, e nao irmao da casca**, ao contrario do assistente de
  /// cadastro: o detalhe de um produto e leitura, nao tarefa. Quem esta
  /// comparando produtos quer continuar comparando, e esconder a barra de abas
  /// para mostrar uma ficha de produto tiraria as outras quatro secoes de
  /// quem so foi ver uma foto maior. E a mesma escolha de [localDoPerto] e
  /// [encontroDaRede], pelo mesmo motivo.
  static const String produtoDaLoja = 'produtos/:slug';

  static const String parametroDoProduto = 'slug';

  /// O endereco do produto [slug].
  ///
  /// `Uri.encodeComponent` porque o `slug` vem da resposta do servidor, e nao
  /// desta tela: montar caminho com interpolacao crua e como um slug com barra
  /// vira uma rota que nao existe.
  static String produtoDaLojaDe(String slug) =>
      '/loja/produtos/${Uri.encodeComponent(slug)}';

  /// A tela da conta. **Deixou de ser ramo da casca em 19/10**, quando o
  /// cliente tirou `Perfil` da barra de baixo e pos a porta dela na foto da
  /// barra de topo. Ela e rota IRMA da casca: cobre a barra e tem `Voltar`,
  /// como `Adocoes`, o leitor e o cadastro de pet.
  static const String perfil = '/perfil';

  /// A AREA DE MENSAGENS: o endereco, e **nao** a tela.
  ///
  /// O slot `AuAu` da barra de baixo (19/10) aponta para ca. A tela, a lista e
  /// o envio sao de outro agente e **nao existem nesta arvore** -- por isso
  /// esta constante esta declarada e **nao esta registrada** como `GoRoute`
  /// abaixo. Registrar uma rota sem tela daria erro no primeiro toque;
  /// inventar a tela seria construir a secao de outra pessoa.
  ///
  /// Enquanto ela nao desce, o slot empurra `destinoProvisorio`, que e
  /// [perfil] -- ver a entrada de mensagens em `CascaComAbas.destinos`.
  ///
  /// **LIGADO em 18/10/2026, na uniao das quatorze.** O `GoRoute` desta rota
  /// esta registrado abaixo e aponta para `AreaDeMensagens`; a conversa tem a
  /// rota irma (`RotasDeMensagens.conversa`). `destinoProvisorio` saiu da
  /// entrada do registro em `CascaComAbas.destinos`, e o slot `AuAu` empurra
  /// este endereco.
  ///
  /// O valor e o MESMO de `RotasDeMensagens.area`, e nao ha duas fontes: esta
  /// constante existe para a casca, aquela para a area, e um caso confere que
  /// as duas dizem a mesma coisa.
  static const String mensagens = '/mensagens';

  /// `Convide tutores` — a tela de trazer tutores para o Bichu.
  ///
  /// **SOB `/mensagens`, e nao sob `/perfil`**, por decisao do cliente de
  /// 21/10/2026: a secao e o `AuAu`. [CascaFixa.slotDaRota] casa pelo PRIMEIRO
  /// segmento, entao e o caminho que mantem o slot do AuAu aceso enquanto esta
  /// tela esta na frente -- que e o que o prototipo aprovado desenha.
  ///
  /// **Nao e `/rede/indicacoes/...`, e a distancia e deliberada**: "indicacao"
  /// neste produto e indicar PROFISSIONAL ao diretorio, e aquelas duas rotas sao
  /// dela. Duas funcoes diferentes vizinhas no endereco sao duas funcoes
  /// diferentes vizinhas na gaveta.
  ///
  /// EMPILHADA, e interna: ela e aberta por um item do corpo do AuAu, e nao pela
  /// barra. Classificada em `telasInternas` do portao de barra fixa.
  static const String convidarTutores = '/mensagens/convide-tutores';

  /// A CAIXA DE NOTIFICACOES (18/10/2026): o conteudo do sino.
  ///
  /// Mesmo valor de `RotasDaCaixa.caixa`, pela razao da constante acima.
  ///
  /// **O SINO ESTA MONTADO desde 19/10/2026**, e o que destravou foi a
  /// decisao do cliente sobre quem sai da barra para ele entrar: *"O botao
  /// criar sai da barra"*. A rota ja estava registrada desde 18/10, com o
  /// sino parado, e foi essa antecipacao que fez a ligacao caber numa linha.
  ///
  /// **O sino e a UNICA porta desta rota pelo app.** Ela continua
  /// alcancavel por link direto, e `CaixaDeNotificacoes` desenha a propria
  /// saida por isso.
  static const String notificacoes = '/notificacoes';

  /// `Pedidos de conexao` (18/10/2026): as duas caixas, recebidos e enviados.
  static const String pedidosDeConexao = '/conexoes/pedidos';

  /// **O PERFIL DE OUTRA PESSOA** (19/10/2026, fatia G).
  ///
  /// **ESTE E O NOME ESTAVEL que as outras frentes ligam**, e ele existe
  /// justamente para que nenhuma delas monte a cadeia na mao: quem precisa
  /// abrir o perfil de alguem chama [perfilDe], nunca `'/pessoa/$apelido'`
  /// escrito a dedo. A frente de mensagens precisa de um ponto unico para o
  /// toque na foto do interlocutor; e este.
  ///
  /// O endereco e o **apelido**, que e o identificador publico da pessoa por
  /// decisao do cliente de 18/10/2026 (*"slug nao tem relacao com informacoes
  /// pessoais, e um id que o usuario escolhe"*). **Nunca um UUID** (ADR-0010
  /// item 6) e nunca `users.public_ref` -- aquele e o endereco de denunciar e
  /// bloquear, e ele viaja no CORPO das tres rotas de seguranca, nao na URL
  /// desta tela.
  ///
  /// **Sem o `@`**: o `@` e simbolo de leitura e nao faz parte do
  /// identificador. `/pessoa/marina-vet`, e nao `/pessoa/@marina-vet`.
  ///
  /// Ela EMPURRA (cobre a casca) em vez de virar ramo, como `Meus dados` e a
  /// area de mensagens: a barra de baixo continua existindo atras e voltar
  /// devolve a pessoa onde ela estava -- que e o que a frente de mensagens
  /// precisa quando o toque na foto sai de dentro de uma conversa.
  static const String perfilDePessoa = '/pessoa/:$parametroDoApelido';

  /// O nome do parametro de caminho de [perfilDePessoa].
  static const String parametroDoApelido = 'apelido';

  /// O endereco do perfil de `apelido`. **Use esta funcao**, e nao a cadeia.
  ///
  /// Ela recebe o apelido com ou sem `@` e devolve o endereco sem ele: a tela
  /// de mensagens tem o apelido do jeito que o contrato o manda (sem `@`), e um
  /// texto de interface pode te-lo com. Uma funcao so para os dois casos evita
  /// a terceira forma de montar isto.
  static String perfilDe(String apelido) {
    final limpo = apelido.startsWith('@') ? apelido.substring(1) : apelido;
    return '/pessoa/$limpo';
  }

  /// `Meus dados` > `Minhas fotos`: a VITRINE do proprio tutor (18/10/2026).
  ///
  /// Endereco proprio porque `VitrineDeFotosDoUsuario` e TELA (tem `Scaffold`
  /// e barra), e nao um bloco de `Meus dados`. A porta esta la: o autor da
  /// vitrine nao a pos porque o arquivo de `Meus dados` era de outro ramo.
  static const String minhaVitrine = '/perfil/minhas-fotos';

  /// `Perfil` › `Meus dados`: os dados pessoais do tutor (18/10/2026).
  ///
  /// **Endereco proprio, e nao bloco dentro da aba.** `Meus pets` mora dentro
  /// de `Perfil` porque e a lista da secao; um formulario de edicao nao e
  /// conteudo de secao -- ele tem barra de saida, acao fixa embaixo e um
  /// desfecho. Com endereco, ele e tambem o destino do item `Meus dados` da
  /// gaveta, que e a linha que a UX 27.5.5 listava como `Editar o perfil` e
  /// que ate hoje nao tinha para onde ir.
  ///
  /// **Irma da casca, como as telas de conta**, e por isso ela tem saida
  /// propria: ela cobre a barra de baixo, e o `escape` dela e [perfil].
  static const String dadosPessoais = '/perfil/dados';

  /// `Meus dados` > `Endereço de entrega`: o endereço guardado na conta
  /// (21/10/2026).
  ///
  /// **Autorizado pelo cliente nestas palavras:** *"um endereço de entrega
  /// salvo na conta, reusado em todo pedido e editável num lugar só."* Este
  /// endereço é o "lugar só", e `TelaEnderecoDeEntrega` é o único caminho do
  /// app que escreve `putMyDeliveryAddress`.
  ///
  /// **Endereço próprio, e não bloco de `Meus dados`** — a mesma razão de
  /// [minhaVitrine]: é TELA, com `Scaffold`, barra de saída e ação fixa. E há
  /// uma razão a mais, que é de leitura: `Meus dados` já edita a **região de
  /// referência**, que tem CEP, bairro, cidade e UF e alimenta cálculo de
  /// distância. Dois blocos "CEP / Bairro / Cidade / Estado" na mesma rolagem,
  /// um deles sendo a residência da pessoa, é confusão garantida.
  static const String enderecoDeEntrega = '/perfil/endereco-de-entrega';

  /// `Perfil` > `Meus achados`: a lista dos avisos de achado desta conta.
  ///
  /// **Endereco proprio, como `dadosPessoais`, e nao bloco dentro da aba.**
  /// `Meus pets` e conteudo da secao porque e a lista principal dela; esta e
  /// um sub-destino de menu, com barra de saida e volta -- a mesma forma de
  /// `Meus dados`.
  ///
  /// `/perfil/achados` e nao `/achados`: `/achados/:achadoId` ja existe e
  /// casaria `/achados` como id vazio, e `achados` sob `perfil` diz o que a
  /// lista e -- a MINHA, e nao a da vizinhanca.
  static const String meusAchados = '/perfil/achados';

  /// `Perfil` > `Meus eventos`: os encontros que a conta criou (19/10/2026).
  ///
  /// **Endereco proprio, irmao de [meusAchados] e de [dadosPessoais]**, e nao
  /// bloco dentro da aba: a tela cobre a barra de baixo e volta para [perfil].
  ///
  /// `/perfil/eventos` e nao `/eventos`: a secao `Rede` e a agenda PUBLICA, e
  /// `/rede` ja e a aba dela. `eventos` sob `perfil` diz de quem a lista e --
  /// o mesmo criterio que poe `achados` sob `perfil`.
  static const String meusEventos = '/perfil/eventos';

  /// `Perfil` > `Pessoas bloqueadas` (19/10/2026, decisao do cliente).
  ///
  /// **ESTE E O UNICO CAMINHO DE VOLTA DE UM BLOQUEIO.** O bloqueio e simetrico
  /// no servidor, e a simetria fecha o perfil da pessoa bloqueada tambem para
  /// quem a bloqueou (`404`) -- que e onde o `Desbloquear` do `MenuDoPerfil`
  /// mora. Sem este endereco, bloquear era irreversivel pelo aplicativo.
  ///
  /// `/perfil/bloqueados`, irma de `dadosPessoais` e de `meusAchados`: a lista
  /// e das MINHAS decisoes, e o "meu" mora em `Perfil`. Ela EMPURRA e cobre a
  /// casca, com barra de saida e volta.
  static const String pessoasBloqueadas = '/perfil/bloqueados';

  /// `Pets` > `Adoções`: sub-destino com porta propria (UX 27.2.4).
  ///
  /// E a mesma listagem de `Pets` pre-filtrada, e nao uma segunda lista. A
  /// porta das ONGs em `Perto` aponta para ca, e por isso ela nao duplica
  /// listagem nenhuma.
  static const String adocoes = '/adocoes';

  /// O leitor de QR. **Deixou de ser aba e continua sendo endereco.**
  ///
  /// Ele e irmao da casca e nao filho dela, como as telas de conta: o design
  /// system 11.11 manda a barra sumir no leitor de camera, e uma aba que
  /// escondesse a propria barra seria uma aba que nao existe. As duas portas
  /// (`Pets` e `Perfil`) usam `push`, entao ele sempre tem volta.
  static const String escanear = '/escanear';

  /// `/t/<codigo>`: F2.2 e F2.3, o pet que o codigo da tag resolveu.
  ///
  /// **O endereco e o mesmo que vai impresso na plaquinha**, e e por isso que
  /// ele existe antes de os App Links e os Universal Links (BICHUS-38 e
  /// BICHUS-39) entrarem: quando eles entrarem, o link da tag ja tem onde
  /// chegar, e nao vai precisar de uma navegacao imperativa paralela.
  ///
  /// O que **nao** atravessa o endereco e a resolucao, pela mesma razao do
  /// rascunho do assistente: `TagResolvida` vai em `extra`, porque quem chega
  /// por link direto chega sem ela. Esse caminho cai no leitor, que e onde se
  /// resolve um codigo -- e nao numa tela montada com os campos em branco.
  static const String petDaTag = '/t/:codigo';

  /// O nome do parametro de caminho, num lugar so.
  static const String parametroDoCodigoDaTag = 'codigo';

  /// O endereco de F2.2/F2.3 para [codigo].
  static String petDaTagDe(String codigo) =>
      '/t/${Uri.encodeComponent(codigo)}';

  /// `/p/<share_token>`: a PAGINA INTERNA de um pet perdido, na visao de quem
  /// nao e o tutor (cliente, 18/10/2026).
  ///
  /// **`/p/` e nao um caminho novo**: e o mesmo que o `share_url` de todo caso
  /// ja carrega (`PublicLostPet.share_url`, e as paginas publicas da web em
  /// `/p/{shareToken}`). Inventar um segundo endereco para a mesma pagina faria
  /// o link que ja circula no grupo do bairro nao ter onde chegar quando os App
  /// Links e os Universal Links entrarem -- que e a mesma razao de `/t/<codigo>`
  /// existir como endereco antes deles.
  ///
  /// **O token atravessa o endereco, ao contrario da resolucao da tag.** Ele e
  /// opaco, nao e UUID e nao e ordenavel (ADR-0010, item 6), e e tudo o que a
  /// leitura precisa: `GET /public/lost-cases/{shareToken}` monta a tela
  /// inteira. Por isso esta rota **nao** depende de `extra` e funciona por link
  /// direto, que e o caso de quem recebeu o link e nao tem o app aberto.
  static const String casoPublico = '/p/:shareToken';

  /// O nome do parametro de caminho, num lugar so.
  static const String parametroDoShareToken = 'shareToken';

  /// O endereco da pagina publica do caso de [shareToken].
  ///
  /// `Uri.encodeComponent` porque o token vem da resposta do servidor, e nao
  /// desta classe: montar caminho com interpolacao crua e como um token com
  /// barra vira uma rota que nao existe. Mesma regra de [petDaTagDe].
  static String casoPublicoDe(String shareToken) =>
      '/p/${Uri.encodeComponent(shareToken)}';

  static const String entrar = '/entrar';
  static const String criarConta = '/criar-conta';
  static const String verifiqueSeuEmail = '/verifique-seu-email';
  static const String esqueciMinhaSenha = '/esqueci-minha-senha';

  /// Para onde vai quem acabou de abrir o app, ou acabou de entrar.
  ///
  /// **`rede`, decisao do cliente de 18/10/2026**, literal: *"quando o usuário
  /// fizer o login ou abrir o app, traga a pagina da rede como padrão"*. Era
  /// `pets` ate esta data.
  ///
  /// **A MESMA resposta para os dois estados de sessao, e isso e o que ele
  /// pediu.** A frase dele cobre os dois arranques -- "fizer o login" e "abrir
  /// o app" --, e `logado` continua sem uso por isso, nao por esquecimento.
  /// Quem chega deslogado tambem cai na `Rede`, e a secao abre: a casca de
  /// abas e visivel deslogada por decisao de produto (UX 5.2, "deslogado e um
  /// estado de navegacao, nao um muro") e `GET /network/events` e rota publica
  /// -- a agenda lista para visitante, e so as acoes de criar e de pedir
  /// participacao exigem sessao, dentro do caminho delas.
  ///
  /// A pergunta que a BICHUS-164 deixava aberta era "tela de aterrissagem
  /// antes da casca, ou cai direto numa aba". Ele respondeu "cai direto numa
  /// aba" ao nomear a aba; se um dia a aterrissagem voltar, ela nasce como
  /// rota irma da casca e e aqui que este retorno passa a depender de
  /// [logado].
  ///
  /// **LINK PROFUNDO CONTINUA VENCENDO ESTA LINHA.** O `redirect` de
  /// [criarRoteador] so reescreve o destino quando a posicao casada e
  /// [abertura]; qualquer outro endereco passa intacto (`return null`). Quem
  /// abre `/rede/:slug`, `/loja/:slug` ou `/t/:codigo` chega onde o link
  /// manda, e trocar esta constante nao mexe nisso -- o que mudou foi so o
  /// destino de quem nao pediu endereco nenhum.
  static String destinoDoArranque({required bool logado}) => rede;

  /// Os tres passos do cadastro de pet (F1.3, F1.4, F1.5) e a confirmacao
  /// (F1.6).
  ///
  /// Sao enderecos, e nao uma navegacao imperativa paralela, pela mesma razao
  /// das telas de conta: estado que merece link tem endereco. O que **nao**
  /// atravessa o endereco e o rascunho: ele vai em `extra`, porque um passo
  /// intermediario de assistente alcancado por link direto nasceria sem os
  /// campos do passo anterior. Quem chega assim cai no primeiro passo.
  static const String cadastrarPet = '/pets/novo';
  static const String cadastrarPetFoto = '/pets/novo/foto';
  static const String cadastrarPetSinais = '/pets/novo/sinais';
  static const String petCadastrado = '/pets/cadastrado';

  /// O pedido da plaquinha da coleira: o destino que o botao `Fazer a tag da
  /// coleira` nunca teve.
  ///
  /// **Declarado aqui, no bloco de `/pets/...` literais, e nao depois de
  /// `/pets/:petId`**: `go_router` casa na ordem de registro e um parametro
  /// casa com qualquer segmento. Abaixo do detalhe, este endereco abriria o
  /// detalhe de um pet chamado "plaquinha".
  ///
  /// O pet **nao** esta no endereco, e isso e deliberado: o formulario escolhe
  /// o pet entre os do tutor, e um pet no caminho brigaria com a escolha. Quem
  /// chega do `Pet cadastrado` manda o `petId` em `extra`, que serve so para
  /// pre-selecionar; alcancada por link direto, a tela abre com a lista e
  /// nenhum pet escolhido, que e um estado valido e nao um erro.
  static const String solicitarPlaquinha = '/pets/plaquinha';

  /// A PAGINA DE ACOMPANHAMENTO do pedido da plaquinha (cliente, 18/10).
  ///
  /// **Literal antes do parametro**, pelo mesmo motivo de
  /// [solicitarPlaquinha]: abaixo de `/pets/:petId`, `go_router` casaria
  /// `plaquinha` como `petId`.
  ///
  /// Aqui o pet **esta** no endereco, e a diferenca com o formulario e real: o
  /// formulario ESCOLHE um pet entre os do tutor, e esta pagina LE o pedido de
  /// um pet ja escolhido -- quem chega vem da pagina daquele pet. Sem o pet no
  /// caminho a pagina nao teria o que ler.
  ///
  /// **O endereco nao autoriza nada.** Quem o alcanca com o pet de outra
  /// pessoa recebe 404 do servidor (ADR-0021), e a tela diz o mesmo que diria
  /// para um pet inexistente.
  static const String acompanharPlaquinha = '/pets/plaquinha/:petId';

  /// O endereco de [acompanharPlaquinha] para um pet.
  static String acompanharPlaquinhaDe(String petId) =>
      '/pets/plaquinha/${Uri.encodeComponent(petId)}';

  /// O fluxo de marcar como perdido: F3.0, F3.1, F3.2 e F3.3.
  ///
  /// Sao enderecos pela mesma razao do assistente de cadastro, e o que **nao**
  /// atravessa o endereco e o mesmo: o rascunho do caso vai em `extra`, porque
  /// um passo intermediario alcancado por link direto nasceria sem o pet e sem
  /// o que a pessoa digitou. Quem chega assim cai na escolha do pet.
  ///
  /// [escolherPetPerdido] e F3.0 e **so aparece com dois ou mais pets**: ver o
  /// cabecalho de `TelaDeQuemEOCaso`.
  static const String escolherPetPerdido = '/pets/perdido';
  static const String marcarPerdido = '/pets/perdido/onde-e-quando';
  static const String marcarPerdidoAlcance = '/pets/perdido/alcance';
  static const String casoAberto = '/pets/perdido/caso';

  /// O achado avulso (F3.5, BICHUS-35).
  ///
  /// **`/achados/novo` nao foi escolhido agora**: e o endereco que
  /// `guarda_de_acao_test.dart` ja traduzia de `F3.5` antes de esta tela
  /// existir. Mudar o caminho aqui deixaria envelopes gravados apontando para
  /// o nada.
  ///
  /// **A ordem importa**, pelo mesmo motivo de `/pets/:petId`: `/achados/novo`
  /// e `/achados/registrado` sao declarados ANTES de `/achados/:achadoId`,
  /// porque um parametro casa com qualquer segmento e engoliria os dois.
  static const String registrarAchado = '/achados/novo';

  /// O desfecho de F3.5, nos dois estados (registrado e na fila).
  static const String achadoRegistrado = '/achados/registrado';

  /// O padrao do achado pelo endereco dele. Use [achadoDe] para montar.
  static const String achado = '/achados/:achadoId';

  /// O nome do parametro de caminho, num lugar so.
  static const String parametroDoAchadoId = 'achadoId';

  /// O endereco do achado [achadoId].
  static String achadoDe(String achadoId) =>
      '/achados/${Uri.encodeComponent(achadoId)}';

  // -- T.1, a edicao e a exclusao (BICHUS-60 e BICHUS-61) -------------------
  //
  // **`/pets/:petId` vem DEPOIS de `/pets/novo` e `/pets/cadastrado` na
  // declaracao, e a ordem e o que impede o engano.** `go_router` casa na
  // ordem em que as rotas sao registradas, e um parametro casa com qualquer
  // segmento: declarado antes, `/pets/:petId` engoliria `/pets/novo` e o
  // cadastro abriria o detalhe de um pet chamado "novo".

  /// O padrao de `T.1`. Use [detalheDoPetDe] para montar o endereco.
  static const String detalheDoPet = '/pets/:petId';

  /// A edicao (BICHUS-61), filha do detalhe.
  static const String editarPet = '/pets/:petId/editar';

  /// O nome do parametro de caminho, num lugar so: quem monta o endereco e
  /// quem o le usam a mesma palavra.
  static const String parametroDoPetId = 'petId';

  /// O endereco de T.1 para [petId].
  ///
  /// `Uri.encodeComponent` porque o id vem da resposta do servidor e nao desta
  /// tela: montar caminho com interpolacao crua e como um id com barra vira
  /// uma rota que nao existe.
  static String detalheDoPetDe(String petId) =>
      '/pets/${Uri.encodeComponent(petId)}';

  static String editarPetDe(String petId) => '${detalheDoPetDe(petId)}/editar';

  /// O endereco da tela de retorno de um envelope de intencao (UX 8.3).
  ///
  /// O envelope guarda `telaDeRetorno` como **ID de tela da pesquisa**
  /// (`F1.5`), e nao como rota: e o documento de UX que nomeia as telas, e um
  /// envelope gravado hoje precisa continuar legivel depois de a rota mudar de
  /// caminho. A traducao mora aqui, num lugar so.
  ///
  /// Devolve nulo para a tela que **este build nao tem**. Nao e caso teorico:
  /// o app se atualiza com um envelope ja gravado no disco, e uma versao pode
  /// ter removido ou renomeado a tela daquele fluxo. A guarda trata o nulo
  /// descartando o envelope em silencio -- a pessoa entra na conta dela, que e
  /// o que ela pediu, em vez de cair num endereco que nao existe.
  static String? rotaDaTelaDeUx(String telaDeUx) {
    return switch (telaDeUx.toUpperCase()) {
      'F1.3' => cadastrarPet,
      'F1.4' => cadastrarPetFoto,
      'F1.5' => cadastrarPetSinais,
      'F1.6' => petCadastrado,
      // O fluxo de perdido. **F3.1 e a tela de retorno de `marcar_perdido`**:
      // e onde o rascunho mora, e e de la que a pessoa segue em frente de novo
      // depois de uma abertura que falhou (UX 8.3, regra 4).
      'F3.0' => escolherPetPerdido,
      'F3.1' => marcarPerdido,
      'F3.2' => marcarPerdidoAlcance,
      'F3.3' => casoAberto,
      // F3.5 e a tela de retorno de `registrar_achado`: e onde o rascunho
      // mora, e e de la que a pessoa segue em frente de novo depois de um
      // registro que falhou (UX 8.3, regra 4).
      'F3.5' => registrarAchado,
      // O encontro da `Rede`: a volta de um pedido que falhou depois do login
      // e a agenda, onde a pessoa reabre o encontro (o `slug` esta no `alvo`
      // do envelope, e nao no ID da tela).
      'REDE.ENCONTRO' => rede,
      // **A LEITURA (20/10/2026) nao e uma tela da pesquisa, e por isso ela
      // aponta para a secao de aterrissagem.**
      //
      // O endereco de verdade do conteudo esta no `alvo` do envelope, e quem o
      // devolve e `AcaoExecutavel.rotaDeRetorno` de `leituraExecutavel()` --
      // que vence este `switch` sempre que o alvo existe. Esta linha e
      // alcancada num caso so: envelope de leitura com `alvo` vazio ou
      // corrompido, que a guarda relata na observabilidade antes de navegar.
      //
      // **Ela nao pode devolver nulo**, e e por isso que existe: nulo faz a
      // guarda DESCARTAR o envelope em silencio, e a pessoa voltaria para
      // `/pets` -- exatamente o defeito que a leitura como intencao conserta.
      telaDeUxDaLeitura => pets,
      _ => null,
    };
  }
}

/// O rascunho que vem no `extra`, venha ele do assistente ou de um envelope.
///
/// As telas do assistente recebem `RascunhoDePet`; a volta de uma intencao que
/// falhou recebe `RetomadaDoCadastro`, que e o rascunho **mais** o erro. Sem
/// esta funcao, o `as RascunhoDePet?` de cada rota estouraria em tempo de
/// execucao justamente no caminho de erro -- o menos exercitado a mao.
RascunhoDePet? _rascunhoDoExtra(Object? extra) {
  return switch (extra) {
    RascunhoDePet rascunho => rascunho,
    RetomadaDoCadastro retomada => retomada.rascunho,
    _ => null,
  };
}

final GlobalKey<NavigatorState> _navegadorRaiz = GlobalKey<NavigatorState>(
  debugLabel: 'raiz',
);

/// Monta o roteador.
///
/// O unico redirecionamento e o da abertura: enquanto o chaveiro esta sendo
/// lido, a pessoa fica na splash; depois disso ela vai para Inicio, logada ou
/// nao. **Nao ha guarda de rota por autenticacao**, e isso e desenho: o app e
/// navegavel deslogado, e o login acontece dentro do caminho da acao, e nao no
/// lugar dela.
///
/// **As telas de conta sao irmas da casca de abas, e nao filhas.** Isso e
/// deliberado: elas cobrem a tela inteira, inclusive a barra de abas, porque
/// sao um desvio do caminho e nao um quinto destino. O preco disso e que a
/// barra some enquanto elas estao abertas, e o preco so se paga quando elas
/// tem saida propria -- sem ela, a pessoa fica sem barra **e** sem volta, que
/// e exatamente o defeito que o cliente encontrou no simulador. Quem abre
/// tela de conta usa `push` ou `pushReplacement`; `go` fica para troca de aba
/// e para o fim de um fluxo. Ver `SaidaDaTela`.
/// **LIGA O TOQUE NA FOTO DA CONVERSA AO PERFIL DAQUELA PESSOA.**
///
/// A frente de mensagens deixou o ponto unico (`PortaDoPerfilDoParticipante`) e
/// nasceu com ele devolvendo `null`, porque a tela de perfil de TERCEIRO era de
/// outro ramo. A frente de perfil entregou a tela e [Rotas.perfilDe]. Esta
/// funcao e a costura, e ela mora **aqui** por uma razao: `rotas.dart` e o
/// unico arquivo que conhece as duas pontas. `area_de_mensagens.dart` nao
/// importa `Rotas` -- se importasse, a area de mensagens deixaria de ser
/// plugavel onde quem monta a barra quiser.
///
/// **NAO e a linha de uma expressao so que o plano previa.** O plano escrevia
/// `(outro) => Rotas.perfilDe(outro.handle)`, e isso nao compila: o apelido e
/// **anulavel** no contrato, e `Rotas.perfilDe` recebe `String`. O nulo nao e
/// borda rara -- ele e o estado NORMAL (nao-conexao, par bloqueado, achador sem
/// conta, conexao que nao escolheu apelido), e com ele o icone tem de ficar
/// decorativo em vez de abrir `/pessoa/null`.
///
/// Funcao nomeada e nao uma atribuicao solta dentro de [criarRoteador]: e ela
/// que a isca da fiacao chama, e um efeito escondido no meio de uma fabrica de
/// 400 linhas nao se exercita sem montar o roteador inteiro.
void ligarPortaDoPerfilDoParticipante() {
  PortaDoPerfilDoParticipante.destino = (outro) {
    final apelido = outro.handle;
    // Vazio tratado como ausente, como no modelo: `Rotas.perfilDe('')`
    // devolveria `/pessoa/`, que e a rota de outra coisa.
    if (apelido == null || apelido.isEmpty) return null;
    return Rotas.perfilDe(apelido);
  };
}

/// Uma rota de PRIMEIRO PLANO: empilhada, e com a barra de baixo por baixo.
///
/// **Primeiro plano e o que a CASCA abre; pagina interna e o que o CONTEUDO
/// abre** (decisao do cliente, 20/10/2026, segunda mensagem). Hoje sao DUAS as
/// rotas assim -- a area de mensagens, que o slot `AuAu` da barra abre, e a
/// caixa de avisos, que o sino da barra de topo abre. A conta inteira esta no
/// bloco de rotas que usa esta funcao.
///
/// **O embrulho e no `builder` e nao num `ShellRoute`, e isso foi medido.**
/// `ShellRoute` cria um `Navigator` proprio e apaga a seta automatica do
/// `AppBar` da primeira tela empilhada -- sete telas desta arvore dependiam
/// dela e ficavam sem saida no topo, `/mensagens` entre elas. Aqui a pagina
/// continua no `Navigator` raiz e nada de navegacao muda.
///
/// Ela e **o unico lugar** que poe [CascaFixa] em producao: uma rota nova de
/// primeiro plano troca `GoRoute` por esta funcao e entra em
/// `telasDePrimeiroPlano`; uma interna fica `GoRoute` e entra em
/// `telasInternas`. As duas listas vivem no portao
/// `test/telas/barra_fixa_em_toda_tela_test.dart`, que reprova rota sem
/// classificacao.
GoRoute _comBarraFixa({
  required String path,
  required Widget Function(BuildContext, GoRouterState) builder,
}) {
  return GoRoute(
    path: path,
    builder: (context, estado) => CascaFixa(child: builder(context, estado)),
  );
}

/// A COSTURA DO DESTINO DE UMA NOTIFICACAO (cliente, 20/10/2026).
///
/// O servidor diz O QUE e a notificacao aponta (`destination`) e COM QUAL
/// CHAVE (`destination_ref`); esta funcao traduz o par em endereco. Ela mora
/// **aqui** pela mesma razao de [ligarPortaDoPerfilDoParticipante]:
/// `rotas.dart` e o unico arquivo que conhece as duas pontas, e
/// `caixa_de_notificacoes.dart` nao importa `Rotas` -- se importasse, a caixa
/// deixaria de ser plugavel onde quem monta a barra quiser.
///
/// **Nao ha mapa de TIPO para tela aqui, e isso e o desenho.** O mapa e do
/// servidor (`notificacao_destino`, migracao `20261020000011`), e um segundo
/// mapa no app divergiria do primeiro na primeira tela nova. Aqui so se
/// traduz destino em caminho.
///
/// **Devolve nulo para o destino que ESTE build nao sabe abrir**, e nao e caso
/// teorico: o app se atualiza devagar e o servidor pode ganhar um destino
/// antes desta versao. `DestinoDoAviso.porCodigo` ja devolve nulo para valor
/// desconhecido, e a linha entao aparece sem toque -- a mesma escolha de
/// [Rotas.rotaDaTelaDeUx], que trata a tela ausente com nulo em vez de abrir
/// um endereco inventado.
void ligarPortaDoDestinoDoAviso() {
  PortaDoDestinoDoAviso.destino = (aviso) {
    final destino = aviso.destino;
    final ref = aviso.destinoRef;
    // Os DOIS, e nao um deles: o contrato promete que andam juntos, e esta
    // guarda e o que impede `/pets/null` se a promessa for quebrada. Vazio
    // tratado como ausente, como em `ligarPortaDoPerfilDoParticipante`:
    // `Rotas.detalheDoPetDe('')` devolveria `/pets/`, que e a rota de outra
    // coisa.
    if (destino == null || ref == null || ref.isEmpty) return null;
    return switch (destino) {
      DestinoDoAviso.pet => Rotas.detalheDoPetDe(ref),
      DestinoDoAviso.achado => Rotas.achadoDe(ref),
      DestinoDoAviso.casoPublico => Rotas.casoPublicoDe(ref),
      DestinoDoAviso.encontro => Rotas.encontroDaRedeDe(ref),
      // A INDICACAO nao tem rota por item: `minhasIndicacoes` e a LISTA, e e
      // ela que mostra o motivo da recusa. Levar a lista e levar ao lugar
      // certo -- a decisao esta la, e o `ref` nao tem para onde ir melhor.
      DestinoDoAviso.indicacao => Rotas.minhasIndicacoes,
      // A PLAQUINHA: a chave e o PET, porque a tela de acompanhamento e
      // enderecada por pet e nao por pedido.
      DestinoDoAviso.pedidoDaPlaquinha => Rotas.acompanharPlaquinhaDe(ref),
      DestinoDoAviso.comunicado => RotasDoComunicado.de(ref),
    };
  };
}

GoRouter criarRoteador(ControladorDeSessao sessao) {
  // A COSTURA DO TOQUE NA FOTO, uma vez, antes de qualquer rota existir. Ela
  // nao depende da sessao nem do roteador -- e so um destino --, e por isso nao
  // ha o que desfazer quando o roteador e recriado.
  ligarPortaDoPerfilDoParticipante();
  // A COSTURA DO DESTINO DA NOTIFICACAO, pelo mesmo motivo e no mesmo lugar:
  // e so um destino, nao depende da sessao, e nao ha o que desfazer quando o
  // roteador e recriado.
  ligarPortaDoDestinoDoAviso();
  return GoRouter(
    navigatorKey: _navegadorRaiz,
    initialLocation: Rotas.abertura,
    refreshListenable: sessao,
    redirect: (context, estado) {
      final carregando = sessao.estado == EstadoDaSessao.carregando;
      final naAbertura = estado.matchedLocation == Rotas.abertura;
      if (carregando) return naAbertura ? null : Rotas.abertura;
      if (naAbertura) {
        return Rotas.destinoDoArranque(
          logado: sessao.estado == EstadoDaSessao.logado,
        );
      }
      return null;
    },
    routes: <RouteBase>[
      GoRoute(
        path: Rotas.abertura,
        builder: (context, estado) => const TelaDeAbertura(),
      ),
      GoRoute(
        path: Rotas.entrar,
        builder: (context, estado) =>
            TelaEntrar(emailInicial: estado.extra as String?),
      ),
      GoRoute(
        path: Rotas.criarConta,
        builder: (context, estado) =>
            TelaCriarConta(emailInicial: estado.extra as String?),
      ),
      GoRoute(
        path: Rotas.verifiqueSeuEmail,
        builder: (context, estado) =>
            TelaVerifiqueSeuEmail(email: estado.extra as String? ?? ''),
      ),
      GoRoute(
        path: Rotas.esqueciMinhaSenha,
        builder: (context, estado) =>
            TelaEsqueciMinhaSenha(emailInicial: estado.extra as String?),
      ),
      // O leitor de QR (F2.1). **Irmao da casca, e nao filho dela.**
      //
      // Ele deixou de ser aba nesta historia, e o motivo nao e o rotulo: o
      // design system 11.11 diz que a barra nao aparece no leitor de camera, e
      // um destino de primeiro nivel que esconde a propria barra e um destino
      // que nao existe. As duas portas (UX 27.5.6) chegam aqui por `push`, e
      // por isso a tela sempre tem volta.
      GoRoute(
        path: Rotas.escanear,
        builder: (context, estado) => const TelaLeitorDeQr(),
      ),
      GoRoute(
        path: Rotas.petDaTag,
        // Sem `extra` nao ha resolucao, e a tela nao a inventa: quem chegou
        // por link direto vai para o leitor, que sabe resolver um codigo.
        // Uma tela montada com nome vazio e sinais em branco seria uma
        // afirmacao falsa sobre um animal.
        builder: (context, estado) {
          final tag = estado.extra;
          if (tag is! TagResolvida) return const TelaLeitorDeQr();
          // **O codigo sai do CAMINHO, e nao da resolucao.** A resposta
          // publica de `GET /tags/{code}` nao devolve o codigo de proposito:
          // ele E a credencial. Sem ele o botao `Avisar o tutor` nao tem para
          // qual plaquinha avisar, e e por isso que esta rota existe como
          // endereco desde o comeco.
          final codigo =
              estado.pathParameters[Rotas.parametroDoCodigoDaTag] ?? '';
          if (codigo.isEmpty) return const TelaLeitorDeQr();
          return TelaDoPetDaTag(tag: tag, codigo: codigo);
        },
      ),
      // A PAGINA INTERNA DO PET PERDIDO (cliente, 18/10/2026).
      //
      // **Irma da casca, e nao filha dela**: ela e alcancada por link externo
      // -- o `share_url` que circula fora do app -- e quem chega por um cartaz
      // nao chega "dentro da aba Pets". Uma barra de abas abaixo dela
      // ofereceria quatro saidas a quem esta com um animal no colo. `Voltar`
      // devolve a listagem para quem chegou por ela.
      //
      // **Sem `extra`, e isso e o ponto**: a leitura e sempre do servidor, com
      // o token do caminho. Uma tela que aceitasse o caso pronto em `extra`
      // desenharia `can_report_sighting` sem perguntar a ninguem -- e no
      // aparelho compartilhado a segunda pessoa a entrar herdaria a leitura da
      // primeira. Ver o cabecalho de `TelaDoCasoPublico`.
      GoRoute(
        path: Rotas.casoPublico,
        builder: (context, estado) {
          final token =
              estado.pathParameters[Rotas.parametroDoShareToken] ?? '';
          // Token vazio nao e caso nenhum. **Volta para a listagem**, e nao
          // para uma tela que afirma um pet que ninguem leu: tela de conteudo
          // sem conteudo e o defeito que o criterio 2 da BICHUS-31 proibe.
          if (token.isEmpty) return const AbaPets();
          return TelaDoCasoPublico(shareToken: token);
        },
      ),
      // =====================================================================
      // PRIMEIRO PLANO E PAGINA INTERNA (20/10/2026, as DUAS mensagens dele)
      // =====================================================================
      //
      // **PRIMEIRA mensagem, que pedia a barra em tudo:** *"quando o usuario
      // vai para a mensagem, o menu inferior some, mantenha ele fixo em todas
      // as paginas"*. As 29 rotas empilhadas desta arvore passaram a vestir
      // [CascaFixa].
      //
      // **SEGUNDA mensagem, do mesmo dia, que DELIMITOU:** *"vamos colocar a
      // barra fixa apenas nas paginas de primeiro plano, as paginas internas,
      // pode manter como esta. Exemplo: ao clicar no menu auau, mantem a barra
      // .. ao clicar na mensagem tira a barra. Ao clicar no perfil mantem a
      // barra, ao clicar no cadastro do pet, remove a barra. Na listagem dos
      // eventos, mantem a barra, ao clicar nos detalhes do evento, remove a
      // barra. E assim por diante."*
      //
      // **O DISCRIMINADOR SAI DOS TRES EXEMPLOS DELE, e nao de "lista contra
      // detalhe".** As duas leituras concordam nos tres exemplos e DISCORDAM
      // em oito telas desta arvore -- `Meus achados` e `Pedidos de conexao`
      // sao LISTAS e sao alcancadas de DENTRO do Perfil. O que separa os tres
      // exemplos dele sem ambiguidade e **QUEM ABRE A TELA**:
      //
      //   - a CASCA abre -> primeiro plano, com barra. O slot `AuAu` da barra
      //     de baixo abre `/mensagens`; o sino da barra de topo abre
      //     `/notificacoes`. Os dois sao controles da propria casca, presentes
      //     em toda tela de secao.
      //   - o CONTEUDO abre -> pagina interna, sem barra. Tocar numa linha da
      //     lista de mensagens, num `ItemDeMenu` do corpo do Perfil, num
      //     cartao de pet, num botao de formulario.
      //
      // E isso le os tres exemplos dele na ordem: o slot `AuAu` mantem (casca),
      // a mensagem tocada tira (conteudo); o Perfil mantem (a FOTO da casca o
      // abre), o cadastro de pet tira (botao do corpo); a listagem de eventos
      // mantem (e a secao `Rede`, da casca), a ficha do evento tira (cartao do
      // corpo).
      //
      // **SAO DUAS AS ROTAS DE PRIMEIRO PLANO**, e so elas usam
      // `_comBarraFixa`: `RotasDeMensagens.area` e `RotasDaCaixa.caixa`. As
      // outras 27 voltaram a ser `GoRoute` -- *"as paginas internas, pode
      // manter como esta"*. A classificacao das 29, uma a uma, com o motivo de
      // cada, esta em `test/telas/barra_fixa_em_toda_tela_test.dart`
      // (`telasDePrimeiroPlano` e `telasInternas`), e o portao de completude
      // reprova rota nova que nasca sem classificacao.
      //
      // **AS OITO QUE JA ESTAVAM DE FORA CONTINUAM DE FORA**, e ele respondeu
      // sobre elas na mesma mensagem (*"as paginas internas, pode manter como
      // esta"*): `/` (a abertura e um desvio, nao tem conteudo), `/entrar`,
      // `/criar-conta`, `/verifique-seu-email` e `/esqueci-minha-senha` (quem
      // nao tem sessao nao esta em secao nenhuma), `/escanear` (**o design
      // system 11.11 PROIBE a barra sobre a camera**, independente disto), e
      // `/t/:codigo` e `/p/:shareToken` (as duas portas publicas: quem chega
      // de uma plaquinha ou de um link compartilhado chega de FORA do app).

      // `Pets` > `Adoções`. Sub-destino com pagina propria, alcancado tambem
      // pela porta das ONGs em `Perto`.
      GoRoute(
        path: Rotas.adocoes,
        builder: (context, estado) => const TelaDeAdocoes(),
      ),
      // O assistente de cadastro de pet. As quatro telas cobrem a casca de
      // abas, como as de conta, e por isso cada uma tem saida propria.
      GoRoute(
        path: Rotas.cadastrarPet,
        builder: (context, estado) => TelaCadastrarIdentificacao(
          // Nulo faz a tela criar um rascunho novo: e o que faz o link direto
          // para `/pets/novo` abrir uma tela util em vez de estourar.
          rascunhoExistente: _rascunhoDoExtra(estado.extra),
        ),
      ),
      GoRoute(
        path: Rotas.cadastrarPetFoto,
        builder: (context, estado) {
          final rascunho = _rascunhoDoExtra(estado.extra);
          // Passo intermediario alcancado sem o passo anterior: volta ao
          // comeco em vez de abrir um formulario que nao sabe de qual pet
          // fala.
          if (rascunho == null) return const TelaCadastrarIdentificacao();
          return TelaCadastrarFoto(rascunho: rascunho);
        },
      ),
      GoRoute(
        path: Rotas.cadastrarPetSinais,
        builder: (context, estado) {
          final extra = estado.extra;
          final rascunho = _rascunhoDoExtra(extra);
          if (rascunho == null) return const TelaCadastrarIdentificacao();
          return TelaCadastrarSinais(
            rascunho: rascunho,
            // A volta de uma intencao que falhou (UX 8.3, regra 4) traz o
            // erro **junto** com o rascunho: a pessoa entrou na conta, a acao
            // dela nao aconteceu, e uma tela que reabre preenchida e calada
            // deixaria a falha invisivel -- ela tocaria em `Cadastrar` de novo
            // sem saber o que houve da primeira vez.
            erroInicial: extra is RetomadaDoCadastro ? extra.erro : null,
          );
        },
      ),
      // ---------------------------------------------------------------
      // O fluxo de marcar como perdido (BICHUS-21).
      //
      // As quatro telas cobrem a casca de abas, como o assistente de
      // cadastro, e por isso cada uma tem saida propria. Todas recusam
      // `extra` ausente caindo no comeco do fluxo em vez de estourar: link
      // direto para um passo do meio e caso real (F5, App Links), e uma tela
      // que nasce sem o pet nao sabe de qual animal fala.
      // ---------------------------------------------------------------
      GoRoute(
        path: Rotas.escolherPetPerdido,
        builder: (context, estado) {
          final pets = estado.extra;
          // Sem a lista nao ha o que escolher. **Nao chama rede aqui**: o
          // criterio 6 manda o fluxo funcionar sem conexao, e quem tem a lista
          // e `Perfil` > `Meus pets`, que ja a carregou.
          if (pets is! List<Pet> || pets.isEmpty) return const AbaPerfil();
          return TelaDeQuemEOCaso(pets: pets);
        },
      ),
      GoRoute(
        path: Rotas.marcarPerdido,
        builder: (context, estado) {
          final extra = estado.extra;
          // A volta de uma intencao que falhou (UX 8.3, regra 4) chega aqui
          // com o **id** do pet, e nao com o pet: o envelope nao guarda o
          // animal. Quem busca o resto e a tela de retomada.
          if (extra is RetomadaDoCaso) {
            return TelaDeRetomadaDoCaso(retomada: extra);
          }
          if (extra is! RascunhoDoCaso) return const AbaPerfil();
          return TelaOndeEQuando(rascunho: extra);
        },
      ),
      GoRoute(
        path: Rotas.marcarPerdidoAlcance,
        builder: (context, estado) {
          final rascunho = estado.extra;
          if (rascunho is! RascunhoDoCaso) return const AbaPerfil();
          return TelaAlcanceDoAlerta(rascunho: rascunho);
        },
      ),
      // ---------------------------------------------------------------
      // O achado avulso (F3.5, BICHUS-35)
      // ---------------------------------------------------------------
      //
      // As tres sao irmas da casca, e nao filhas dela: quem esta na rua com um
      // animal no colo esta numa tarefa, e a barra de abas abaixo do
      // formulario ofereceria quatro saidas para o meio do preenchimento.
      //
      // **`/achados/novo` e `/achados/registrado` vem ANTES de
      // `/achados/:achadoId`.** `go_router` casa na ordem em que as rotas sao
      // registradas, e um parametro casa com qualquer segmento: declarado
      // antes, `/achados/:achadoId` engoliria os dois e o formulario abriria o
      // detalhe de um achado chamado "novo".
      // As duas ESCRITAS da comunidade, irmas da casca porque sao tarefa.
      // Declaradas antes do ramo da casca: `encontros/:slug` engoliria
      // `encontros/novo` e o formulario abriria um detalhe inexistente.
      GoRoute(
        path: Rotas.publicarNoMural,
        builder: (context, estado) {
          final escopo = Escopo.of(context);
          // A porta e construida AQUI a partir do `ApiClient` do `Escopo`, como
          // a da vitrine, a dos bloqueados e as do perfil de pessoa.
          // Acrescentar campo obrigatorio ao `Escopo` quebraria toda tela de
          // teste que o constroi, e o `Escopo` esta sendo mexido por outras
          // frentes nesta mesma rodada.
          //
          // **A camera e o envio saem do `Escopo`**: o envio carrega um cliente
          // HTTP proprio, sem o token da sessao, e um construido aqui seria o
          // segundo.
          return PublicarNoMural(
            escrita: MuralApi(escopo.api),
            camera: escopo.camera,
            envio: escopo.envioDeFoto,
          );
        },
      ),
      GoRoute(
        path: Rotas.criarEncontroDaRede,
        builder: (context, estado) => const TelaCriarEncontro(),
      ),
      GoRoute(
        path: Rotas.sugerirProfissional,
        builder: (context, estado) => const TelaSugerirProfissional(),
      ),
      // `Minhas indicacoes`: PORTA PROPRIA desde 19/10/2026, e nao mais a
      // segunda aba da secao. A razao de ela nao caber no filtro esta inteira
      // em [Rotas.minhasIndicacoes]: a entidade muda, e filtrar devolveria
      // zero no unico caso que importa.
      //
      // IRMA da casca, como `Meus achados` e `Meus dados`: ela cobre a casca e
      // ganha `Voltar`. A porta que a abre e o pe da aba `Comunidade`.
      GoRoute(
        path: Rotas.minhasIndicacoes,
        builder: (context, estado) => const TelaDeMinhasIndicacoes(),
      ),
      GoRoute(
        path: Rotas.registrarAchado,
        builder: (context, estado) {
          final extra = estado.extra;
          // A volta de uma intencao que falhou (UX 8.3, regra 4) chega com o
          // rascunho inteiro e o erro. Sem isto, a pessoa que autenticou e viu
          // o registro falhar cairia num formulario em branco -- que e perder
          // o rascunho pelo outro caminho.
          if (extra is RetomadaDoAchado) {
            return TelaRegistrarAchado(
              rascunho: extra.rascunho,
              erroInicial: extra.erro?.texto,
            );
          }
          return TelaRegistrarAchado(
            rascunho: extra is RascunhoDoAchado ? extra : null,
          );
        },
      ),
      GoRoute(
        path: Rotas.achadoRegistrado,
        builder: (context, estado) {
          final resultado = estado.extra;
          // Alcancada por link direto, sem desfecho nenhum para mostrar, ela
          // devolve o formulario em vez de afirmar que alguma coisa foi
          // registrada. Tela de sucesso sem sucesso e o defeito que o criterio
          // 2 da BICHUS-31 proibe, e link direto e um caminho para ele.
          if (resultado is! ResultadoDoAchado) {
            return const TelaRegistrarAchado();
          }
          return TelaAchadoRegistrado(resultado: resultado);
        },
      ),
      GoRoute(
        path: Rotas.achado,
        builder: (context, estado) {
          final id = estado.pathParameters[Rotas.parametroDoAchadoId] ?? '';
          return TelaDoAchado(achadoId: id);
        },
      ),
      GoRoute(
        path: Rotas.casoAberto,
        builder: (context, estado) {
          final resultado = estado.extra;
          // **Sem `extra` nao ha tela de resultado**, e inventar uma seria
          // exatamente o que o criterio 2 da BICHUS-31 proibe: uma tela que
          // afirma um desfecho que ninguem produziu.
          if (resultado is! ResultadoDaAbertura) return const AbaPerfil();
          return TelaCasoAberto(resultado: resultado);
        },
      ),
      GoRoute(
        path: Rotas.petCadastrado,
        builder: (context, estado) {
          final resultado = estado.extra as ResultadoDoCadastro?;
          if (resultado == null) return const TelaCadastrarIdentificacao();
          return TelaPetCadastrado(resultado: resultado);
        },
      ),
      // O pedido da plaquinha. **Antes de `/pets/:petId`**, como as outras
      // rotas literais de `/pets/...`: abaixo do detalhe, `go_router` casaria
      // `plaquinha` como `petId`.
      //
      // Sem `extra` a tela NAO cai em outro destino, e aqui a diferenca com o
      // assistente e real: ela nao depende de um passo anterior, ela carrega os
      // pets do tutor sozinha. O `extra` so pre-seleciona, e um link direto
      // abre o formulario com a lista inteira -- estado valido, e nao erro.
      GoRoute(
        path: Rotas.solicitarPlaquinha,
        builder: (context, estado) {
          final petId = estado.extra;
          return TelaSolicitarPlaquinha(
            petIdInicial: petId is String ? petId : null,
          );
        },
      ),
      // O ACOMPANHAMENTO do pedido. Depois de `/pets/plaquinha` e antes de
      // `/pets/:petId`: o literal mais especifico primeiro, o parametro
      // depois. Trocar a ordem faria `/pets/plaquinha/<id>` abrir o detalhe.
      //
      // O pet vem do CAMINHO e nao de `extra`: esta pagina le o pedido do
      // servidor, e um link direto para ela e legitimo -- ela pergunta antes
      // de afirmar qualquer coisa.
      GoRoute(
        path: Rotas.acompanharPlaquinha,
        builder: (context, estado) => TelaAcompanharPlaquinha(
          petId: estado.pathParameters['petId'] ?? '',
        ),
      ),
      // T.1, a edicao e a exclusao (BICHUS-60 e BICHUS-61).
      //
      // **Declaradas DEPOIS de `/pets/novo` e `/pets/cadastrado`, e a ordem e
      // o que impede o engano**: `go_router` casa na ordem de registro e um
      // parametro casa com qualquer segmento. Acima delas, `/pets/:petId`
      // engoliria `/pets/novo` e o cadastro abriria o detalhe de um pet
      // chamado "novo".
      //
      // Cobrem a casca de abas, como o assistente, e por isso cada uma tem
      // saida propria: `Perfil` > `Meus pets` continua vivo no ramo de baixo,
      // e voltar devolve a pessoa onde ela estava.
      GoRoute(
        path: Rotas.detalheDoPet,
        builder: (context, estado) => TelaDetalheDoPet(
          petId: estado.pathParameters[Rotas.parametroDoPetId]!,
        ),
      ),
      GoRoute(
        path: Rotas.editarPet,
        builder: (context, estado) {
          // A edicao recebe o pet JA CARREGADO em `extra`, porque quem a abre
          // e T.1, que acabou de le-lo. Alcancada por link direto ela nasceria
          // sem ele: cai no detalhe, que sabe carregar, em vez de abrir um
          // formulario que nao sabe de qual pet fala. E a mesma regra dos
          // passos intermediarios do assistente.
          final pet = estado.extra;
          if (pet is! Pet) {
            return TelaDetalheDoPet(
              petId: estado.pathParameters[Rotas.parametroDoPetId]!,
            );
          }
          return TelaEditarPet(pet: pet);
        },
      ),
      // `Perfil` > `Meus dados` (18/10/2026). Declarada ANTES da casca, como
      // as outras telas que a cobrem: o caminho e `/perfil/dados` e a aba e
      // `/perfil`, dois enderecos distintos, e `go_router` casa o mais
      // especifico por ser exato. Cobre a casca de abas, e por isso tem saida
      // propria -- o `Perfil` continua vivo no ramo de baixo e voltar devolve
      // a pessoa onde ela estava.
      GoRoute(
        path: Rotas.dadosPessoais,
        builder: (context, estado) => const TelaDadosPessoais(),
      ),
      // `Meus dados` > `Endereco de entrega` (21/10/2026). Irma da de cima e
      // pelo mesmo motivo: cobre a barra de baixo e volta.
      //
      // **Sem parametro no construtor**: a tela tira a `MeApi` e a
      // `BuscaDeCep` do `Escopo`, como as vizinhas. Ela e alcancada por
      // `ItemDeMenu` dentro de `Meus dados`, do mesmo jeito que
      // `Minhas fotos`.
      GoRoute(
        path: Rotas.enderecoDeEntrega,
        builder: (context, estado) => const TelaEnderecoDeEntrega(),
      ),
      // `Perfil` > `Meus achados`. Irma da de cima e pelo mesmo motivo: ela
      // cobre a barra de baixo e volta para `Perfil`.
      GoRoute(
        path: Rotas.meusAchados,
        builder: (context, estado) => const MeusAchados(),
      ),
      // `Perfil` > `Meus eventos` (19/10/2026). Irma das duas de cima, e o
      // UNICO caminho do app ate `cancelNetworkEvent`: nada na agenda diz de
      // quem e o encontro, entao sem esta rota o cancelamento do proprio
      // encontro nao tem porta.
      //
      // **Sem parametro no construtor**: a tela tira a `RedeApi` do `Escopo`,
      // como `MeusAchados` faz com a `AchadosApi`. Acrescentar campo
      // obrigatorio ao `Escopo` quebraria toda tela de teste que o constroi.
      GoRoute(
        path: Rotas.meusEventos,
        builder: (context, estado) => const MeusEventos(),
      ),
      // -- AS QUATRO ROTAS DA UNIAO DE 18/10/2026 ---------------------------
      //
      // As quatro telas chegaram prontas, de frentes diferentes, e nenhuma
      // estava registrada: cada ramo construiu a tela e deixou a fiacao para
      // quem unisse, porque `rotas.dart` e arquivo de todos e colidiria em
      // todos. Elas EMPURRAM (cobrem a casca) em vez de virar ramo, como
      // `Meus dados` e `Meus achados` acima -- a barra de baixo continua
      // existindo atras e voltar devolve a pessoa onde ela estava.
      //
      // `AuAu` > `Convide tutores` (21/10/2026). Declarada ANTES da area de
      // mensagens e antes da rota com `:conversaId`: o `go_router` casa na
      // ordem de registro, e `/mensagens/convide-tutores` casaria
      // `/mensagens/:conversaId` com `conversaId = 'convide-tutores'` se
      // viesse depois -- a tela da conversa abriria pedindo uma conversa que
      // nao existe.
      //
      // **Irma da casca e nao sub-rota do ramo**: ela cobre a barra de baixo e
      // voltar devolve a pessoa ao AuAu. E `ConvitesApi` vem do `Escopo`, como
      // as outras camadas de API -- a mesma instancia que o leitor de QR usa
      // para resolver um convite lido.
      GoRoute(
        path: Rotas.convidarTutores,
        builder: (context, estado) => TelaDeConvidarTutores(
          convites: Escopo.of(context).convites,
          conexoes: Escopo.of(context).conexoes,
        ),
      ),
      // A AREA DE MENSAGENS: o destino do slot `AuAu`.
      _comBarraFixa(
        path: RotasDeMensagens.area,
        builder: (context, estado) {
        // AS DUAS COSTURAS DO CONTADOR DA ABA `AuAu` (20/10/2026).
        //
        // Elas sao ligadas AQUI, e nao dentro da tela, porque o contador mora
        // no `Escopo` e a tela nao conhece a barra -- que e exatamente a razao
        // pela qual `AreaDeMensagens` publica por callback em vez de ler um
        // estado global.
        //
        // `aoContarNaoLidas` nao custa requisicao nenhuma: o numero vem na
        // resposta que a lista ja pediu.
        final contadores = Escopo.of(context).contadores;
        return AreaDeMensagens(
          aoContarNaoLidas: contadores.definir,
          aoVerAArea: contadores.marcarMensagensVistas,
        );
      },
      ),
      // A CONVERSA, pelo id. **E este o destino do toque na notificacao do
      // aviso ao tutor**, e por isso ela nao pode faltar: sem esta rota o
      // toque no aviso cai numa rota que nao existe.
      GoRoute(
        path: RotasDeMensagens.conversa,
        builder: (context, estado) => TelaDaConversa(
          conversaId:
              estado.pathParameters[RotasDeMensagens.parametroDaConversa]!,
        ),
      ),
      // A CAIXA DE NOTIFICACOES. Rota IRMA da casca: ela cobre a barra de
      // baixo, de proposito, e o sino chega nela por `push` -- ver a razao em
      // `SinoDeNotificacoes`.
      _comBarraFixa(
        path: RotasDaCaixa.caixa,
        builder: (context, estado) => const CaixaDeNotificacoes(),
      ),
      // A PAGINA DO COMUNICADO: o unico destino "pagina interna" da caixa,
      // porque e o unico tipo de aviso sem destino natural -- ele e texto.
      //
      // Rota IRMA da caixa e nao filha: a caixa a empilha com `push`, e voltar
      // devolve a pessoa a lista com a linha ja dizendo `Lido`. O `ref` do
      // caminho e o do COMUNICADO, e nao o da notificacao.
      // `GoRoute` CRU, e nao `_comBarraFixa`: esta e uma pagina INTERNA, e a
      // decisao do cliente de 20/10 e que a barra de baixo fica "apenas nas
      // paginas de primeiro plano". A caixa de avisos e primeiro plano (ela e
      // o destino do sino); o comunicado e aberto por uma LINHA dela, que e
      // conteudo -- a mesma relacao de `/mensagens` com `/mensagens/:id`.
      GoRoute(
        path: RotasDoComunicado.comunicado,
        builder: (context, estado) => PaginaDoComunicado(
          ref: estado.pathParameters[RotasDoComunicado.parametroDoRef]!,
        ),
      ),
      // OS PEDIDOS DE CONEXAO. `ConexoesApi` sai do `Escopo`, onde esta
      // fiacao a registrou -- a tela pedia a porta por parametro justamente
      // porque o `Escopo` estava sendo mexido por outra sessao.
      // A VITRINE DO PROPRIO TUTOR. A tela recebe DUAS interfaces estreitas
      // da mesma porta -- `LeituraDaVitrine` e `EscritaDaVitrine` --, e nao a
      // `VitrineApi` inteira: a classe tem tres operacoes, e a tela precisa de
      // duas. A escrita entrou em 19/10/2026, quando a tela ganhou o controle
      // de adicionar foto que ela nao tinha.
      //
      // **A camera e o envio saem do `Escopo`**, que e onde o app os guarda: o
      // envio carrega um cliente HTTP proprio, sem o token da sessao, e um
      // construido aqui seria o segundo.
      GoRoute(
        path: Rotas.minhaVitrine,
        builder: (context, estado) {
          final escopo = Escopo.of(context);
          final porta = VitrineApi(escopo.api);
          return VitrineDeFotosDoUsuario(
            api: porta,
            escrita: porta,
            camera: escopo.camera,
            envio: escopo.envioDeFoto,
            aoAbrirMeusPets: () => GoRouter.of(context).go(Rotas.perfil),
          );
        },
      ),
      GoRoute(
        path: Rotas.pedidosDeConexao,
        builder: (context, estado) =>
            TelaDePedidosDeConexao(conexoes: Escopo.of(context).conexoes),
      ),
      // PESSOAS BLOQUEADAS (19/10/2026). A porta e construida AQUI a partir do
      // `ApiClient` do `Escopo`, como a da vitrine e as do perfil de pessoa:
      // acrescentar campo obrigatorio ao `Escopo` quebraria toda tela de teste
      // que o constroi.
      GoRoute(
        path: Rotas.pessoasBloqueadas,
        builder: (context, estado) =>
            TelaDeBloqueados(seguranca: SegurancaApi(Escopo.of(context).api)),
      ),
      // O PERFIL DE OUTRA PESSOA (19/10/2026, fatia G). Irma das de cima: ela
      // EMPURRA e cobre a casca, e voltar devolve a pessoa onde ela estava.
      //
      // **As tres portas sao construidas AQUI, a partir do `ApiClient` do
      // `Escopo`**, e nao recebidas por campo do `Escopo`: e a mesma fiacao de
      // `Rotas.minhaVitrine` logo acima. Acrescentar campo obrigatorio ao
      // `Escopo` quebraria toda tela de teste que o constroi, e o `Escopo` esta
      // sendo mexido por outras frentes nesta mesma rodada.
      //
      // `conexoes` vem do `Escopo` porque ela JA mora la.
      //
      // **`podeAgirNaComunidade` e a MESMA porta de `podeCriarNaComunidade`**
      // (`lib/telas/abas.dart`): sessao e e-mail verificado. Pedir conexao e
      // acao de comunidade, e politica nova nao foi inventada aqui.
      //
      // **O token de convite vem do `extra`**, e nulo nao desenha a porta de
      // pedir. Quem emitir convite (caso devolvido, encontro em comum, codigo
      // presencial) passa `extra: <o token>` neste `push` -- e e o unico lugar
      // que precisa mudar.
      GoRoute(
        path: Rotas.perfilDePessoa,
        builder: (context, estado) {
          final escopo = Escopo.of(context);
          final convite = estado.extra;
          return TelaDePerfilDePessoa(
            apelido: estado.pathParameters[Rotas.parametroDoApelido] ?? '',
            pessoas: PessoasApi(escopo.api),
            conexoes: escopo.conexoes,
            seguranca: SegurancaApi(escopo.api),
            podeAgirNaComunidade: podeCriarNaComunidade(escopo.sessao),
            tokenDoConvite: convite is String && convite.isNotEmpty ? convite : null,
          );
        },
      ),
      StatefulShellRoute.indexedStack(
        builder: (context, estado, navegacao) =>
            CascaComAbas(navegacao: navegacao),
        // **A ordem dos ramos e a ordem de `CascaComAbas.destinos`, e isso e
        // contrato.** A casca traduz a posicao tocada na barra para o indice
        // do ramo pelo registro; se as duas listas sairem de ordem, tocar em
        // `Perfil` abre `Rede`. O portao `a ordem dos ramos e a ordem do
        // registro` reprova quando isso acontece.
        //
        // **19/10/2026: `Perto` SAIU e `Mural` ENTROU.** A ordem dos ramos
        // era `Pets, Perto, Rede, Loja, Perfil` e passou a ser
        // **`Pets, Rede, Mural, Loja, Perfil`**. Os ramos tiveram de andar
        // JUNTO com o registro, e nao e detalhe: trocar so a barra faria tocar
        // em `Mural` abrir a `Rede`, calado, porque a casca resolve o indice.
        //
        // **O RAMO DE `Perto` NAO FOI RENOMEADO, ELE FOI ABSORVIDO.** As duas
        // rotas que viviam sob ele mudaram de casa: `locais/:slug` desceu para
        // SOB O RAMO DA `Rede` (a aba `Comunidade` e quem lista os locais, e
        // voltar da ficha tem de devolver a aba com a busca e o filtro
        // intactos) e `/perto/indicacoes/nova` virou `/rede/indicacoes/nova`,
        // irma da casca como era.
        //
        // **O RAMO DO `Mural` nasce com a tela de verdade, e nao com desvio.**
        // `TelaDoMural` existe nesta arvore e diz honestamente o que ainda nao
        // ha: ramo com tela de mentira seria construir a secao de outra
        // frente, e ramo sem tela estoura no primeiro toque.
        branches: <StatefulShellBranch>[
          StatefulShellBranch(
            routes: <RouteBase>[
              GoRoute(
                path: Rotas.pets,
                builder: (context, estado) => const AbaPets(),
              ),
            ],
          ),
          StatefulShellBranch(
            routes: <RouteBase>[
              GoRoute(
                path: Rotas.rede,
                builder: (context, estado) => const AbaRede(),
                routes: <RouteBase>[
                  // A FICHA DE UM LOCAL DA ABA `Comunidade`, que ANTES
                  // morava sob o ramo de `Perto` (19/10/2026).
                  //
                  // Ela continua sendo LEITURA e nao tarefa, e por isso
                  // continua SOB o ramo: a barra de baixo fica, e voltar
                  // devolve a aba `Comunidade` com a busca e o filtro de quem
                  // estava comparando tres veterinarios intactos.
                  GoRoute(
                    path: Rotas.localDoPerto,
                    builder: (context, estado) => PaginaDoLocal(
                      slug: estado.pathParameters[Rotas.parametroDoLocal] ?? '',
                    ),
                  ),
                ],
              ),
            ],
          ),
          // O RAMO DO `Mural`, na posicao 3 (19/10/2026).
          //
          // **Ele E ramo, e nao um slot que empurra rota.** A secao de
          // mensagens nao e ramo porque a tela dela e de outro agente e nao
          // existe nesta arvore; a do `Mural` existe -- `TelaDoMural` --, e
          // ramo e o que da a ela o estado proprio do `IndexedStack`: quem rola
          // o mural, vai ao `Perfil` e volta encontra o mural onde deixou.
          StatefulShellBranch(
            routes: <RouteBase>[
              GoRoute(
                path: Rotas.mural,
                builder: (context, estado) => const AbaMural(),
              ),
            ],
          ),
          StatefulShellBranch(
            routes: <RouteBase>[
              GoRoute(
                path: Rotas.loja,
                builder: (context, estado) => const AbaLoja(),
                routes: <RouteBase>[
                  GoRoute(
                    path: Rotas.produtoDaLoja,
                    builder: (context, estado) => TelaDoProduto(
                      slug:
                          estado.pathParameters[Rotas.parametroDoProduto] ?? '',
                    ),
                  ),
                ],
              ),
            ],
          ),
          // O RAMO DA TELA DA CONTA. **Ele fica, e isso foi medido.**
          //
          // `Perfil` saiu da BARRA em 19/10 -- a porta dele virou a foto da
          // barra de topo --, e a primeira tentativa tirou tambem o ramo,
          // fazendo a tela uma rota irma da casca. Custou 107 casos: `Entrar`
          // e `Criar conta` sao alcancadas desta tela e a saida delas devolve
          // a ABA de onde a pessoa veio; com a conta empilhada, voltar de
          // `Entrar` caia numa tela que cobre a casca e nao havia barra de
          // baixo nenhuma na arvore.
          //
          // Como ramo, a barra continua visivel dentro da tela da conta, que
          // e tambem o arranjo do Instagram -- a referencia que o cliente
          // deu. Ele e o ULTIMO ramo, e a ordem e contrato com
          // `CascaComAbas.ramosDoRegistro`.
          StatefulShellBranch(
            routes: <RouteBase>[
              GoRoute(
                path: Rotas.perfil,
                builder: (context, estado) => const AbaPerfil(),
              ),
            ],
          ),
        ],
      ),
      // A FICHA DE UM ENCONTRO: IRMA DA CASCA, E SEM BARRA (20/10/2026).
      //
      // **Duas frentes decidiram este endereco em sentidos opostos, no mesmo
      // dia, sem se ver, e quem mesclou decidiu pelo cliente.**
      //
      // `feat/aviso-de-login-ao-tocar` devolveu a tela e a declarou SOB o ramo
      // da `Rede`, com a justificativa de que *"a pagina de um evento e
      // LEITURA, e a barra de baixo fica"* -- a mesma razao que mantem
      // `locais/:slug` sob o ramo. `feat/barra-fixa-e-perfil-por-topicos`
      // trouxe o portao que varre sub-rota de ramo e REPROVA nomeando este
      // endereco.
      //
      // **O cliente decidiu o contrario da primeira, com este exemplo
      // literal:** *"vamos colocar a barra fixa apenas nas paginas de primeiro
      // plano, as paginas internas, pode manter como esta... Na listagem dos
      // eventos, mantem a barra, ao clicar nos detalhes do evento, remove a
      // barra."*
      //
      // Entao a ficha do evento e INTERNA: ela sai do `routes:` do ramo e vem
      // para ca, IRMA da casca, como `/pets/:petId` -- que e o mesmo desenho
      // (detalhe de UM item, aberto por um cartao do CORPO da secao). O
      // discriminador que o portao mede e **quem abre a tela**: a casca abre a
      // listagem, o conteudo abre a ficha.
      //
      // **Ela NAO usa `_comBarraFixa`**, e e isso que tira a barra: as duas
      // unicas rotas de primeiro plano continuam sendo a area de mensagens e a
      // caixa de avisos.
      //
      // **A ORDEM CONTINUA SEGURA.** `/rede/encontros/novo` esta declarada bem
      // antes desta, la onde as rotas irmas de formulario vivem, e o
      // `go_router` casa na ordem de registro: o formulario nao cai nesta
      // ficha. E o ramo `/rede` da casca, que vem acima, nao casa
      // `/rede/encontros/<slug>` nenhuma, porque a sub-rota saiu dele.
      GoRoute(
        path: Rotas.encontroDaRede,
        builder: (context, estado) => TelaDoEncontro(
          slug: estado.pathParameters[Rotas.parametroDoEncontro]!,
          // A distancia vem do cartao, que a leu de
          // `listNearbyNetworkEvents`. Por link direto ela nao vem, e a linha
          // some sem aviso.
          distanciaEmMetros: estado.extra is int ? estado.extra! as int : null,
        ),
      ),
    ],
  );
}
