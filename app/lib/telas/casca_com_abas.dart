import 'package:flutter/material.dart';
import 'package:go_router/go_router.dart';

import '../escopo.dart';
import '../roteamento/rotas.dart';
import '../sessao/controlador_de_sessao.dart';
import '../widgets/arrastar_para_atualizar.dart';
import '../widgets/aviso_que_chegou.dart';
import '../theme/bichu_colors.dart';
import '../theme/bichu_tokens.g.dart';
import '../widgets/barra_de_listagem.dart';
import '../widgets/marca.dart';

/// O estado de uma secao no registro (UX 27.5).
///
/// `existe` e codigo rodando; `casca` e tela sem conteudo mas com saida real;
/// `planejada` e o que o mapa declara e ninguem construiu.
enum EstadoDaSecao { existe, casca, planejada }

/// O campo semantico do glifo de cada secao (BICHUS-230, criterio 2).
///
/// **Ele existe porque o rotulo encurtou e o significado foi transferido para
/// o icone** (UX 27.3). Duas secoes que desenham do mesmo campo desfazem
/// justamente a transferencia de que a barra de cinco depende, e foi o que o
/// cliente leu no aparelho em 22/09: `storefront` em `Perto` e `shopping_bag`
/// em `Loja` eram duas leituras de comercio, adjacentes na barra.
///
/// Declarar o campo no registro, e nao so trocar o glifo, e o que faz o portao
/// pegar **a proxima** colisao: quem acrescentar uma secao e escolher o icone
/// pela estetica reprova antes de chegar ao aparelho.
/// `conversa` entrou em 19/10 com a secao de mensagens, e ela **nao** divide
/// campo com `comunidade`: `groups` desenha CABECAS e `chat` desenha um BALAO.
/// A distincao importa mais aqui que nas outras quatro, porque o rotulo desta
/// secao e `AuAu` -- palavra de marca, que nao diz a funcao -- e o glifo passou
/// a ser o unico sinal visivel que diz "mensagem". Ver a entrada do registro.
///
/// **`lugar` SAIU em 19/10/2026 com a secao `Perto`.** Ele era o alfinete de
/// `place`, e a secao que o declarava deixou de existir: o conteudo dela virou
/// a aba `Comunidade` da `Rede`, e aba NAO declara campo semantico -- o
/// registro e de SECAO, e o campo existe para impedir colisao entre dois
/// GLIFOS DA BARRA. Deixar o valor no enum sem dono seria um campo que nenhum
/// portao exercita, e quem acrescentasse uma secao o escolheria achando que
/// ainda ha uma secao de lugar.
///
/// **`publicacao` ENTROU no mesmo dia, com o `Mural`.** Ele nao divide campo
/// com `comunidade` (`groups`, que desenha CABECAS) nem com `conversa`
/// (`chat`, que desenha UM BALAO): `dynamic_feed` desenha CARTOES EMPILHADOS,
/// que e a forma de "a pilha do que chegou" e nao de gente nem de fala.
enum CampoSemantico { animal, comunidade, publicacao, compra, conta, conversa }

/// Qual build esta sendo montado (UX 25.7.3).
///
/// O paragrafo manda que secao `planejada` **nao seja renderizada** fora do
/// build que o cliente abre, e que essa selecao venha de **configuracao de
/// compilacao, nunca por acaso**. Este enum e essa configuracao, e ele existe
/// porque sem ele o criterio 3 desta historia seria uma frase sem mecanismo.
enum ConfiguracaoDeBuild {
  /// O build que o cliente abre para decidir escopo. Mostra tudo, inclusive o
  /// que e `planejada`.
  referencia,

  /// O build que vai para a loja. Secao `planejada` nao aparece na barra.
  entrega,
}

/// Um destino da barra inferior.
///
/// Carrega o icone (quem enxerga), o [rotulo] visivel (todo mundo) e o
/// [reforcoAcessivel] (quem usa leitor de tela). O [semanticsLabel] existe
/// porque quem usa leitor de tela recebia **so o rotulo**, e o rotulo encurtou
/// de `Perdidos` para `Pets` e de `Eventos` para `Rede` -- sem ele, a decisao
/// de produto seria uma regressao de acessibilidade (UX 27.7).
///
/// **Eram tres sinais visiveis ate 18/10/2026**, quando o cliente removeu a
/// frase de apoio do corpo das paginas ([reforcoDaPagina], hoje vazia nas
/// cinco). O sinal de acessibilidade NAO saiu com ela.
class DestinoDeNavegacao {
  const DestinoDeNavegacao({
    required this.rotulo,
    required this.reforcoAcessivel,
    required this.reforcoDaPagina,
    required this.icone,
    required this.iconeSelecionado,
    required this.rota,
    required this.estado,
    required this.campoSemantico,
    this.naBarra = true,
    this.ehRamo = true,
    this.destinoProvisorio,
  });

  /// Se este destino e um ramo do `IndexedStack` de `rotas.dart`.
  ///
  /// **A ordem dos ramos e a ordem dos destinos com `ehRamo`**, e e esse
  /// recorte que deixou `rotas.dart` intacto quando a secao de mensagens
  /// entrou: ela nao e ramo, porque a tela dela e de outro agente e nao existe
  /// nesta arvore. Um ramo sem tela estoura no primeiro toque; um ramo com
  /// tela de mentira seria construir a secao de outra pessoa.
  ///
  /// Quem nao e ramo **empurra** a rota no navegador raiz, que e o mesmo que
  /// os atalhos vivos da gaveta fazem, e por isso nunca aparece selecionado na
  /// barra: nao ha ramo para ficar ativo.
  final bool ehRamo;

  /// Onde o slot vai **enquanto** [rota] nao existir no roteador.
  ///
  /// Fiacao parada, e nomeada para ser achada: o slot esta completo -- posicao,
  /// glifo, rotulo medido, nome acessivel -- e so o destino e provisorio.
  /// Apagar este campo da entrada e registrar [rota] em `rotas.dart` e a
  /// ligacao inteira.
  final String? destinoProvisorio;

  /// Para onde o toque leva hoje.
  String get destinoDeHoje => destinoProvisorio ?? rota;

  /// Se este destino ocupa um slot da barra de baixo.
  ///
  /// **Existe por causa de 19/10**, quando o cliente tirou `Perfil` da barra e
  /// pos a secao de mensagens no slot dela: *"inclua um menu de mensagens ... e
  /// retire o menu perfil, acrescente uma foto pequena do usuario na barra
  /// superior de todas as paginas, e ao clicar o usuario abre o menu atual da
  /// tela de perfil"*.
  ///
  /// `Perfil` continua no REGISTRO e continua sendo um ramo do `IndexedStack`:
  /// ele so deixou de ser pintado na barra. As duas coisas sao diferentes, e
  /// confundi-las custaria a secao inteira -- a tela da conta guarda os
  /// cartoes de pet, que sao o unico caminho do app ate `Rotas.detalheDoPet`,
  /// onde moram o QR e `Marcar como perdido`. Tirar o ramo fecharia esse
  /// caminho; tirar o slot so troca a porta, que e o que foi pedido.
  ///
  /// Quem abre a porta agora e [AvatarDaConta], na barra de topo de toda tela
  /// de secao.
  final bool naBarra;

  /// O texto que aparece na barra. Curto por decisao: com cinco destinos o
  /// slot em 320 dp e de 64,0 dp (UX 27.2.1), e rotulo que nao cabe se resolve
  /// trocando a palavra em projeto, nunca com reticencia ou quebra de linha.
  final String rotulo;

  /// A metade de tras do nome acessivel, que **nunca e vazia**.
  ///
  /// **NAO SAIU em 18/10/2026, e nao e o que o cliente mandou remover.** Ele
  /// nomeou as frases que apareciam NA TELA, no corpo das paginas
  /// ([reforcoDaPagina]); esta nao aparece em lugar nenhum da tela -- ela e a
  /// segunda metade do [semanticsLabel] da aba, e e o unico sinal que quem usa
  /// leitor de tela recebe alem do rotulo de quatro letras. O icone e
  /// decorativo e nao e anunciado; sem esta frase, `Pets` e `Rede` viram
  /// rotulos sem assunto, e a remocao de um texto visivel teria virado
  /// regressao de acessibilidade.
  ///
  /// Redacao mais curta que a frase do corpo era (UX 27.7, regra 5), porque o
  /// leitor de tela le o nome inteiro a cada passagem pela barra.
  ///
  /// O portao de `test/telas/casca_de_cinco_secoes_test.dart` reprova se esta
  /// frase sair junto: ele cobra `semanticsLabel` comecando pelo rotulo E mais
  /// longo que ele, e cobra este campo nao-vazio por nome.
  final String reforcoAcessivel;

  /// A primeira linha do corpo da pagina. **Vazia nas cinco secoes.**
  ///
  /// **18/10/2026: o cliente REVERTEU a decisao dele de 21/09.** Literal:
  /// *"remova os textos 'os profissionais e estabelecimentos indicados por
  /// quem já usou. os eventos de quem tem pet aqui perto de você. Os pets
  /// perdidos e os que estão para adoção aqui na sua região. Seus pets, sua
  /// plaquinha e os ajustes da sua conta.'"*. Com a quinta -- a da `Loja` --
  /// na mesma lista, as cinco saem.
  ///
  /// O campo **fica**, e fica vazio: e o que permite o portao de
  /// `test/telas/casca_de_cinco_secoes_test.dart` cobrar a regra de HOJE (nenhuma
  /// secao tem texto de apoio) em vez de simplesmente deixar de olhar. Quem
  /// escrever uma frase aqui de novo reprova aquele caso.
  ///
  /// **Nao confundir com [reforcoAcessivel], que NAO saiu.** Aquele e
  /// invisivel na tela, e a metade de tras do nome que o leitor de tela
  /// anuncia na barra; e o que deixa `Pets` e `Rede` -- rotulos de quatro
  /// letras -- navegaveis por quem nao ve. Os dois campos sempre foram
  /// separados, e e por isso que esta remocao nao encosta naquele.
  ///
  /// Quando havia frase, ela ia no CORPO e nunca na barra de topo (medido em
  /// UX 27.4.1: a `AppBar` dispoe de 240,0 dp em 320 dp e
  /// `Profissionais e estabelecimentos` pede 406,72 ja em escala 1x). As duas
  /// telas que a desenhavam -- `TelaDeAba` e `AgendaDaRede` -- pulam a linha e
  /// o respiro de 24 dp quando ela e vazia.
  final String reforcoDaPagina;

  final IconData icone;
  final IconData iconeSelecionado;

  /// O endereco do ramo. Estado que merece link tem endereco (F5).
  final String rota;

  final EstadoDaSecao estado;

  /// O campo de significado de que o glifo desta secao tira a leitura.
  ///
  /// **Dois destinos nao podem declarar o mesmo**, e o portao de
  /// `test/telas/casca_de_cinco_secoes_test.dart` reprova quando declaram.
  final CampoSemantico campoSemantico;

  /// O nome que o VoiceOver e o TalkBack anunciam.
  ///
  /// **O rotulo visivel vem primeiro, literal.** E o SC 2.5.3 (rotulo no
  /// nome): quem usa comando de voz diz "tocar em Pets" e o casamento acontece
  /// pelo texto visivel contido no nome. Por o reforco antes quebra o comando
  /// em alguns motores; depois, nunca quebra.
  String get semanticsLabel => '$rotulo, $reforcoAcessivel';
}

/// A casca de navegacao: **cinco** destinos, barra sempre visivel, **inclusive
/// deslogado**.
///
/// Deslogado e um estado de navegacao, nao um muro (UX 5.2). Nenhuma aba fica
/// escondida, desabilitada ou com cadeado: a acao aparece normal e o login
/// acontece dentro do caminho dela, e nao no lugar dela.
///
/// **`Escanear` deixou de ser aba, e o leitor nao ficou mais longe.** Ele tem
/// duas portas (UX 27.5.6): a primaria em `Pets`, que e a secao cujo trabalho e
/// esse, e a de conta em `Perfil`, onde o cliente pediu. Um leitor so, e o
/// destino da leitura sai das regras dos tres cenarios de QR, nunca da aba de
/// origem. Quem acha um cachorro na rua nao pensa a palavra `Perfil`, e por
/// isso a porta que nao pode faltar e a de `Pets`. O leitor em si e rota de
/// tela inteira e **nao leva a barra**, pela regra do design system 11.11
/// ("quando a barra nao aparece: ... no leitor de camera").
class CascaComAbas extends StatefulWidget {
  const CascaComAbas({required this.navegacao, super.key});

  final StatefulNavigationShell navegacao;

  /// O registro de secoes, na ordem da barra (UX 27.2).
  ///
  /// **Publico e constante de proposito:** os portoes desta historia e o da
  /// BICHUS-172 iteram esta lista em vez de repetir os rotulos a mao. Portao
  /// que guarda uma copia da lista fica verde no dia em que a lista muda.
  ///
  /// ## A ordem mudou DE NOVO em 19/10/2026, e `Perto` saiu do registro
  ///
  /// Hoje: **`Pets, Rede, Mural, Loja, AuAu`** na barra, mais `Perfil` fora
  /// dela. Era `Pets, Perto, Rede, Loja, AuAu`.
  ///
  /// `Perto` **deixou de ser secao** por decisao do cliente, e o conteudo dela
  /// nao foi apagado: ele virou a aba `Comunidade` da `Rede` (profissionais,
  /// estabelecimentos e ONGs). O nome da secao reunida e `Rede`, e a escolha
  /// e de MEDIDA e nao de gosto -- `Comunidade` pede **113,25 dp** num slot de
  /// 64,00 e reprova em 320, 375 e 412 dp; `Rede` pede 45,08 e cabe nos tres.
  /// A parede e a mesma que recusou `Mensagens` (103,67 dp).
  ///
  /// `Mural` entrou no slot 3, entre `Rede` e `Loja`.
  ///
  /// **A ordem ANTERIOR, de 18/10, fica registrada**: era
  /// `Pets, Rede, Perto, Loja, Perfil` e ele pediu *"inverta a ordem no app do
  /// item rede e perto"*, o que pos `Perto` na posicao 2. Essa inversao foi
  /// absorvida: com `Perto` fora da barra nao ha mais par para inverter.
  ///
  /// **A ordem dos RAMOS em `roteamento/rotas.dart` andou junto.** A casca
  /// traduz a posicao tocada na barra para o indice do ramo por esta lista;
  /// trocar so aqui faria tocar em `Mural` abrir a `Rede`, calado. Ha portao
  /// que reprova a divergencia (`a ordem dos ramos e a ordem do registro`).
  ///
  /// **A aba de ARRANQUE nao e a primeira desta lista, e nao precisa ser.** No
  /// mesmo dia o cliente fez da `Rede` a aba padrao de quem abre o app ou
  /// acaba de entrar (`Rotas.destinoDoArranque`), e com a reordenacao de 19/10
  /// ela ficou na posicao 2. As duas decisoes sao independentes: a ordem e
  /// onde o dedo encontra a secao, o arranque e onde o app comeca. Quem mudar
  /// uma nao herda a outra. **O arranque continua apontando para `Rede`**, e
  /// nao foi movido para o `Mural`: a secao de arranque tem de ter conteudo, e
  /// a do `Mural` e de outra frente.
  static const List<DestinoDeNavegacao> destinos = <DestinoDeNavegacao>[
    DestinoDeNavegacao(
      rotulo: 'Pets',
      reforcoAcessivel: 'pets perdidos e para adoção perto de você',
      reforcoDaPagina: '',
      // A PATINHA AQUI E LEGITIMA, e isto esta escrito para nao ser reaberto.
      //
      // `Icons.pets` e o glifo `pets` do Material Symbols, que e a familia
      // fechada do design system 10.1. Ele **nao** e a patinha aposentada da
      // marca: o node `184:61` do Figma chama-se "icone 24dp - pets
      // (contorno)" e desenha o glifo da familia, cujas cinco formas sao os
      // quatro dedos e o coxim -- construcao do proprio glifo, e nao o simbolo
      // desenhado a mao.
      //
      // A regra 4 de `design/marca/README.md` enumera quatro usos proibidos:
      // simbolo, favicon, icone do app e marcador de posicao de foto. Icone de
      // secao de navegacao nao e nenhum dos quatro. O criterio 6 da BICHUS-144
      // proibe a patinha como icone de **especie**, e ali a razao e outra: o
      // contrato tem um enum fechado de especies e uma pata diria "animal" onde
      // e preciso dizer "cao" ou "gato". Nesta barra "animal" e exatamente o
      // que a secao e. A UX ja corrigiu esta premissa por escrito em 27.3.
      //
      // O glifo que a UX preferiria -- uma pata dentro de um alfinete de
      // localizacao -- nao existe no Material Symbols, e compor dois glifos
      // sai da familia unica do 10.1 (UX 27.3.1). **E ele deixou de ser
      // possivel por outro motivo em 22/09**: o alfinete foi para `Perto`
      // (BICHUS-233), e duas secoes vizinhas nao dividem a mesma forma. O
      // desejo morre aqui, e isto esta escrito para nao ser reaberto.
      icone: Icons.pets_outlined,
      iconeSelecionado: Icons.pets,
      rota: Rotas.pets,
      // O leitor de QR responde ao toque e leva a tela de verdade: a secao
      // satisfaz o criterio (a) de 25.7.3.
      //
      // **O cadastro de pet sustentava este `existe` junto com o leitor, e
      // saiu daqui em 22/09** (BICHUS-232): cadastrar o **meu** pet e custodia
      // e mora em `Perfil` > `Meus pets`, como a UX 27.5.1 e a 27.5.5 ja
      // diziam. Sobra o leitor, e ele **continua bastando** pela letra do
      // 25.7.3 -- por isso o estado declarado nao muda. O que nao podia ficar
      // e esta justificativa citando uma acao que nao esta mais na tela.
      estado: EstadoDaSecao.existe,
      campoSemantico: CampoSemantico.animal,
    ),
    DestinoDeNavegacao(
      rotulo: 'Rede',
      // **A METADE DE TRAS DO NOME ACESSIVEL MUDOU em 19/10**, porque a secao
      // mudou de tamanho: ela era so os eventos e passou a ser tambem o
      // diretorio que morava em `Perto` (`profissionais e estabelecimentos
      // indicados`). Deixar `eventos da comunidade` faria o leitor de tela
      // anunciar METADE da secao -- e quem navega por audicao nao teria como
      // descobrir que os profissionais mudaram de casa.
      //
      // Redacao curta de proposito (UX 27.7, regra 5): o leitor le o nome
      // inteiro a cada passagem pela barra. As duas abas em cinco palavras.
      reforcoAcessivel: 'eventos e quem atende bem',
      reforcoDaPagina: '',
      // **`groups` FICA, e agora ele e mais certo e nao menos.** O glifo de
      // CABECAS era o campo `comunidade` quando a secao era so eventos; com o
      // diretorio dentro, a secao passou a ser literalmente a comunidade --
      // gente que se encontra e gente que atende bem.
      //
      // **O alfinete de `place` SAIU com a secao `Perto`**, e nao foi
      // reaproveitado aqui: dois glifos numa secao so e o que o registro
      // existe para impedir, e a aba nao desenha glifo nenhum -- as duas abas
      // da `Rede` sao TEXTO (`Eventos` e `Comunidade`), porque aba de texto
      // nao precisa transferir significado para forma como o slot de 64 dp
      // precisa.
      icone: Icons.groups_outlined,
      iconeSelecionado: Icons.groups,
      rota: Rotas.rede,
      // `GET /network/events` (ADR-0025). A casca honesta saiu da TELA e
      // precisava sair tambem do REGISTRO: enquanto esta linha dissesse
      // `planejada`, o portao do 25.7.3 continuaria procurando a frase "Rede
      // esta em construcao" que a secao nao diz mais.
      //
      // E ha a segunda razao, que e a cara: `visiveisEm` ESCONDE o que e
      // `planejada` no build de ENTREGA. Com esta linha errada, a secao com
      // conteudo simplesmente nao apareceria na barra do build que vai para a
      // loja de aplicativos -- e o defeito so apareceria no aparelho de quem
      // instalasse. E o mesmo passo que `Perto` e `Loja` ja deram.
      estado: EstadoDaSecao.existe,
      campoSemantico: CampoSemantico.comunidade,
    ),
    // -- A SECAO `Mural`, no slot 3 (decisao do cliente, 19/10/2026) --------
    //
    // **O ROTULO E `Mural`, E ELE FOI MEDIDO.** O slot de cinco destinos e de
    // 64,00 dp na tela de 320 dp (UX 27.2.1) e o `NavigationBar` limita a
    // escala de texto em 1,3x. Medido com a `Inter` real, na bancada que
    // reproduz a tabela versionada de `casca_de_cinco_secoes_test.dart`:
    //
    //   `Pets`  39,20 dp -> cabe
    //   `Rede`  45,08 dp -> cabe
    //   `Mural` 50,90 dp -> cabe, com 13,10 dp de folga
    //   `Loja`  37,15 dp -> cabe
    //   `AuAu`  49,33 dp -> cabe
    //
    // Os cinco passam em 320, 375 e 412 dp. **`Comunidade` (113,25 dp)
    // REPROVARIA** nesta barra, e e por isso que ela e ABA da `Rede` e nao
    // nome de secao -- a mesma parede que recusou `Mensagens` (103,67 dp).
    //
    // **O GLIFO: `dynamic_feed` -- os cartoes empilhados.** Escolhido por
    // ELIMINACAO dentro da familia fechada do 10.1, e cada recusa tem dono
    // nesta arvore:
    //
    //   - `photo_library` e a galeria do encontro;
    //   - `forum` e "outras avaliacoes" na pagina do local, e ainda le como
    //     quadro de discussao, vizinho do campo `comunidade` da `Rede`;
    //   - `notes` e `article` sao "observacoes" em tres telas;
    //   - `chat` e o `AuAu`, no MESMO rodape -- dois baloes na mesma barra e
    //     a colisao que o cliente leu no aparelho em 22/09;
    //   - `campaign` e o comunicado da administracao;
    //   - `grid_view` e controle de visualizacao, e nao lugar.
    //
    // Sobram os cartoes empilhados, que e a forma de "a pilha do que
    // chegou". Nenhum vetor novo, nada baixado, nada gerado.
    //
    // **`casca`, e nao `existe` nem `planejada`, e o estado e a parte honesta
    // desta entrada.** O conteudo do Mural -- publicar, a linha do tempo,
    // curtir, comentar, seguir -- e de OUTRA FRENTE, que roda em paralelo e
    // cria `user_publications`, o contrato e as operacoes. Medido nesta
    // arvore: a tabela `user_publications` **nao existe** (ela aparece so em
    // comentario, em `src/shared/db/schema.ts` e em duas linhas da migracao
    // `20261018000032`), e nao ha operacao de linha do tempo no contrato.
    //
    //   - `existe` obrigaria a secao a ter conteudo, e ela nao tem;
    //   - `planejada` a esconderia do build de ENTREGA (`visiveisEm`), e o
    //     cliente pediu o LUGAR dela na barra -- esconde-la desfaria o
    //     pedido;
    //   - `casca` e exatamente "tela sem conteudo mas com saida real"
    //     (ver [EstadoDaSecao]), que e o que esta tela e: ela diz o que vai
    //     aparecer ali e oferece a saida de quem nao tem conta.
    DestinoDeNavegacao(
      rotulo: 'Mural',
      // A metade de tras do nome acessivel. **Nunca vazia**, e aqui ela carrega
      // o assunto inteiro: `Mural` e palavra de LUGAR e nao diz o que ha
      // dentro, do mesmo jeito que `AuAu` nao diz "mensagem".
      //
      // **Ela diz `conexoes`, e nao `amigos` nem `quem voce segue`.** O
      // produto tem UMA relacao, `user_connections`, simetrica e com aceite;
      // "seguir" assimetrico nao existe nesta arvore e prometer a palavra
      // seria prometer o objeto. Ele usou as duas palavras no mesmo dia
      // (*"os usuarios que ele segue e sao amigos"*) e a pergunta esta na
      // secao 8 do desenho, aberta.
      reforcoAcessivel: 'publicações das suas conexões',
      // **VAZIO**, como nas outras: o cliente removeu as frases de apoio do
      // corpo das paginas, nominalmente, em 18/10/2026. Uma secao nova nao
      // repoe o que ele acabou de mandar tirar.
      reforcoDaPagina: '',
      icone: Icons.dynamic_feed_outlined,
      iconeSelecionado: Icons.dynamic_feed,
      rota: Rotas.mural,
      estado: EstadoDaSecao.casca,
      campoSemantico: CampoSemantico.publicacao,
    ),
    DestinoDeNavegacao(
      rotulo: 'Loja',
      reforcoAcessivel: 'produtos escolhidos pelo Bichu',
      // **A plaquinha saiu desta linha**, e a saida e decisao de produto e nao
      // corte de texto. A secao C da BICHUS-185 decidiu que a plaquinha fica
      // FORA da Loja no MVP: a vitrine e de parceiro, e nenhum parceiro vende
      // plaquinha do Bichu. Prometer aqui um item que a lista nunca vai ter e
      // a mesma classe de defeito do estado vazio que mente.
      reforcoDaPagina: '',
      icone: Icons.shopping_bag_outlined,
      iconeSelecionado: Icons.shopping_bag,
      rota: Rotas.loja,
      // **`existe`, e nao `planejada`, desde a vitrine.**
      //
      // Mesma troca de `Perto` e pelas mesmas duas consequencias medidas. A
      // primeira: `planejada` obriga a secao a dizer "Loja esta em construcao"
      // (UX 25.7.3), e a frase passou a ser falsa -- ha vitrine, vinda de
      // `GET /store/items`. A segunda: `visiveisEm` esconde o que e
      // `planejada` no build de ENTREGA, entao enquanto esta linha dissesse
      // `planejada` a secao com conteudo nao apareceria na barra do build que
      // vai para a loja de aplicativos.
      estado: EstadoDaSecao.existe,
      campoSemantico: CampoSemantico.compra,
    ),
    // -- A SECAO DE MENSAGENS, no slot que era do `Perfil` (19/10) ---------
    //
    // O ROTULO E `AuAu`, E ELE FOI MEDIDO. O cliente ofereceu tres palavras:
    // *"coloca um icone de balao de mensagem e coloque uma palavra que
    // exemplique, como mensagem, conversa, AuAu"*. O slot e de 64,0 dp em tela
    // de 320 dp (UX 27.2.1) e o `NavigationBar` limita a escala de texto em
    // 1,3x; medido com a `Inter` real, nessa escala:
    //
    //   `Mensagens` 86,66 dp -> excede 22,66    (2 linhas, 5,00 dp fora)
    //   `Mensagem`  82,73 dp -> excede 18,73    (2 linhas, 5,00 dp fora)
    //   `Conversa`  71,13 dp -> excede  7,13    (2 linhas, 5,00 dp fora)
    //   `AuAu`      40,89 dp -> CABE, com 23,11 dp de folga
    //
    // As tres primeiras reprovam nas CINCO larguras suportadas, nao so em 320.
    // `AuAu` passa nas cinco. Das palavras que ele deu, e a unica viavel -- e
    // o jeito de nao perder a palavra clara e o que o registro ja separava:
    // `rotulo` e o texto PINTADO, `reforcoAcessivel` e a metade de tras do
    // nome que o leitor de tela anuncia. Quem ve le `AuAu` com o balao ao
    // lado; quem usa VoiceOver ou TalkBack ouve `AuAu, mensagens`.
    //
    // **O GLIFO NAO E DECORACAO NESTA LINHA, e isto e a ressalva.** Nas outras
    // quatro secoes o rotulo diz a funcao e o icone reforca. Aqui o rotulo e
    // palavra de MARCA: `AuAu` nao diz "mensagem" para quem abre o app pela
    // primeira vez, e quem descobre descobre pelo balao ou tocando. O balao
    // passou a carregar o sentido, e por isso `conversa` e campo semantico
    // proprio no registro -- se alguem puser um segundo balao na barra, o
    // portao reprova antes do aparelho.
    //
    // `chat`, e **nao** `chat_bubble` nem `forum`. `chat_bubble` e o balao
    // vazio de comentario solto; `forum` sao dois baloes sobrepostos, que em
    // 24 dp se fundem num borrao -- e justamente aqui o glifo nao pode ficar
    // ambiguo, porque e ele que carrega o significado. `forum` ainda le como
    // quadro de discussao, vizinho do campo `comunidade` da `Rede`. `chat` e
    // um balao so, com as linhas de texto dentro: um balao de MENSAGEM.
    DestinoDeNavegacao(
      rotulo: 'AuAu',
      reforcoAcessivel: 'mensagens',
      // VAZIO, e nao por esquecimento: o ramo da barra nasceu antes de o
      // cliente remover as CINCO frases de apoio do corpo, nominalmente, em
      // 18/10/2026. `AuAu` chegou com a sexta. Deixa-la entraria repondo, por
      // uma secao nova, exatamente o que ele acabou de mandar tirar -- e o
      // portao `cada destino declara um semanticsLabel que comeca pelo rotulo`
      // acusa isso destino por destino. O `reforcoAcessivel` acima FICA: ele
      // nunca apareceu em tela e e a segunda metade do nome que o leitor de
      // tela anuncia na barra.
      reforcoDaPagina: '',
      icone: Icons.chat_outlined,
      iconeSelecionado: Icons.chat,
      // **A AREA DE MENSAGENS E DE OUTRO AGENTE, e ela nao existe nesta
      // arvore.** O cliente de conversa, a lista e o envio estao sendo
      // construidos como destino independente, com rota propria. Nao ha tela
      // de mensagens aqui, e inventar uma seria construir a secao de outra
      // pessoa.
      //
      // **LIGADO em 18/10/2026, na uniao das quatorze.** A area de mensagens
      // desceu junto, `rotas.dart` registra `RotasDeMensagens.area` apontando
      // para `AreaDeMensagens`, e `destinoProvisorio` SAIU: o slot empurra o
      // endereco de verdade. O desvio para `Rotas.perfil` existia so enquanto
      // a tela do outro agente nao estava nesta arvore.
      rota: Rotas.mensagens,
      estado: EstadoDaSecao.existe,
      campoSemantico: CampoSemantico.conversa,
      // **NAO E RAMO, e e por isso que `rotas.dart` nao mudou uma linha.**
      //
      // Um ramo do `IndexedStack` precisa de uma tela, e a tela de mensagens
      // nao existe nesta arvore. Um ramo com tela de mentira seria construir a
      // secao de outro agente; um ramo sem tela estoura no primeiro toque. O
      // slot entao EMPURRA uma rota em vez de trocar de ramo -- que e o mesmo
      // que os seis atalhos vivos da gaveta ja fazem -- e a lista de ramos de
      // `rotas.dart` continua sendo exatamente a de antes: `Pets`, `Rede`,
      // `Perto`, `Loja`, `Perfil`.
      ehRamo: false,
    ),
    // -- `Perfil`: FORA DA BARRA desde 19/10, e ainda no registro -----------
    //
    // Ele perdeu o slot e **nao** perdeu nada mais: continua ramo do
    // `IndexedStack`, continua com rota, continua com o submenu dele na gaveta
    // e continua sendo a tela que os cartoes de pet moram. A porta mudou de
    // lugar -- virou a foto na barra de topo ([AvatarDaConta]) --, e o
    // conteudo nao mudou uma linha.
    DestinoDeNavegacao(
      rotulo: 'Perfil',
      reforcoAcessivel: 'seus pets e sua conta',
      reforcoDaPagina: '',
      icone: Icons.account_circle_outlined,
      iconeSelecionado: Icons.account_circle,
      rota: Rotas.perfil,
      estado: EstadoDaSecao.existe,
      campoSemantico: CampoSemantico.conta,
      naBarra: false,
      // **CONTINUA RAMO, e isto foi MEDIDO em vez de suposto.**
      //
      // A primeira tentativa tirou a tela da conta do `IndexedStack` e a fez
      // rota irma da casca -- ela cobria a barra e ganhava `Voltar`. Parecia
      // mais simples e custou 107 casos da suite: `Entrar` e `Criar conta`
      // sao alcancadas DAQUI, e a saida delas devolve a ABA de onde a pessoa
      // veio. Com a conta empilhada, voltar de `Entrar` caia numa tela que
      // cobre a casca e **nao havia barra de baixo nenhuma** na arvore. O
      // fluxo de entrada inteiro, deslogado, ficava sem a barra.
      //
      // Como ramo, a barra fica visivel dentro da tela da conta -- que e
      // tambem o arranjo do Instagram, a referencia que o cliente deu.
      //
      // O preco e `selectedIndex`, que e `int` e nao `int?`: o componente nao
      // sabe dizer "nenhum aceso". Quem resolve isso e
      // `_BarraSemSelecao`, logo abaixo, apagando o indicador quando a
      // pessoa esta na tela da conta -- e nao um fallback que acenderia
      // `Pets`, a barra afirmando uma secao em que ela nao esta.
      ehRamo: true,
    ),
  ];

  /// O destino da conta: o que a foto da barra de topo abre.
  ///
  /// **Um ponto so, e nao `destinos.last`.** A posicao dele na lista e contrato
  /// com a ordem dos ramos de `rotas.dart`, e quem acrescentar uma secao depois
  /// dele faria `last` apontar para outra coisa em silencio.
  static DestinoDeNavegacao get daConta =>
      destinos.firstWhere((d) => !d.naBarra);

  /// A configuracao deste build, vinda de `--dart-define`.
  ///
  /// O padrao e [ConfiguracaoDeBuild.referencia] porque e **este** o build que
  /// existe hoje: o cliente pediu para ver o escopo inteiro, com todos os
  /// botoes visiveis mesmo sem conteudo, e 25.7.3 permite exatamente isso. O
  /// build de loja se pede por escrito:
  ///
  /// ```
  /// flutter build apk --dart-define=BICHU_BUILD=entrega
  /// ```
  static ConfiguracaoDeBuild get configuracao {
    const String escolhido = String.fromEnvironment(
      'BICHU_BUILD',
      defaultValue: 'referencia',
    );
    return escolhido == 'entrega'
        ? ConfiguracaoDeBuild.entrega
        : ConfiguracaoDeBuild.referencia;
  }

  /// O destino de uma rota de aba.
  ///
  /// As telas de aba pegam o titulo e a linha de reforco **daqui**, e nao de
  /// uma constante propria: o registro e a barra passam a ter uma fonte so, e
  /// a regra de 25.7.2 ("titulo igual ao rotulo do registro, a mesma palavra
  /// nos dois lugares") deixa de depender de alguem lembrar.
  static DestinoDeNavegacao porRota(String rota) {
    return destinos.firstWhere(
      (d) => d.rota == rota,
      orElse: () => throw ArgumentError.value(
        rota,
        'rota',
        'nao esta no registro de secoes de CascaComAbas.destinos',
      ),
    );
  }

  /// Os destinos que a barra mostra em [qual].
  ///
  /// No build de entrega, secao `planejada` **nao e renderizada** (UX 25.7.3).
  /// A rota dela continua existindo, porque link profundo e endereco e nao
  /// depende de a barra mostrar o destino.
  /// [entre] existe para a REGRA poder ser exercida, e nao por flexibilidade.
  ///
  /// Desde que a `Rede` ganhou conteudo (ADR-0025) **nao ha mais nenhuma secao
  /// `planejada` no registro**, e com isso o portao do 25.7.3 passou a nao ter
  /// o que filtrar: ele ficava verde por vazio, que e exatamente o que o caso
  /// dele existia para impedir. A alternativa era o teste reescrever o
  /// predicado, e regra duplicada nos dois lados diverge -- no dia em que
  /// divergir, ninguem sabe qual das duas esta certa.
  ///
  /// Com o parametro, o caso passa a sua PROPRIA lista, com uma secao
  /// `planejada` de mentira, e prova que este filtro a remove. A producao
  /// continua chamando sem argumento.
  static List<DestinoDeNavegacao> visiveisEm(
    ConfiguracaoDeBuild qual, {
    List<DestinoDeNavegacao>? entre,
  }) {
    // `naBarra` entra ANTES do filtro de build: `Perfil` saiu da barra por
    // decisao de produto (19/10), e nao por configuracao de compilacao. Ele
    // nao volta no build de referencia.
    final lista = (entre ?? destinos).where((d) => d.naBarra);
    if (qual == ConfiguracaoDeBuild.referencia) {
      return lista.toList(growable: false);
    }
    return lista
        .where((d) => d.estado != EstadoDaSecao.planejada)
        .toList(growable: false);
  }

  /// Os destinos que sao ramo do `IndexedStack`, na ordem dos ramos.
  ///
  /// **E esta lista que `rotas.dart` tem de espelhar**, e nao [destinos]: a
  /// secao de mensagens esta no registro e nao e ramo. O portao `a ordem dos
  /// ramos e a ordem do registro` compara contra ela.
  static List<DestinoDeNavegacao> get ramosDoRegistro =>
      destinos.where((d) => d.ehRamo).toList(growable: false);

  @override
  State<CascaComAbas> createState() => _CascaComAbasState();
}

class _CascaComAbasState extends State<CascaComAbas> {
  /// A chave do `Scaffold` da casca.
  ///
  /// Ela existe para o gatilho da barra de topo alcancar ESTA gaveta, e nao a
  /// do `Scaffold` de dentro. De instancia, e nao estatica: chave global
  /// estatica reaproveitada entre duas arvores vivas estoura, e a suite monta
  /// o app dezenas de vezes.
  final GlobalKey<ScaffoldState> _casca = GlobalKey<ScaffoldState>(
    debugLabel: 'casca-com-abas',
  );

  @override
  Widget build(BuildContext context) {
    final navegacao = widget.navegacao;
    final cores = BichuColors.of(context).cores;
    final visiveis = CascaComAbas.visiveisEm(CascaComAbas.configuracao);
    // O indice do RAMO de cada slot da barra, ou -1 para o slot que nao e
    // ramo (a secao de mensagens, que empurra uma rota).
    //
    // A traducao e contra a lista de RAMOS, e nao contra `destinos`: duas
    // entradas do registro deixaram de ser ramo (mensagens e a conta), e no
    // build de entrega a barra ainda esconde o que e `planejada`. Sem ela,
    // tocar num slot abriria a secao de outro.
    final ramosDoRegistro = CascaComAbas.ramosDoRegistro;
    final ramos = <int>[
      for (final destino in visiveis)
        destino.ehRamo ? ramosDoRegistro.indexOf(destino) : -1,
    ];
    // **NENHUM slot fica aceso quando a pessoa esta na tela da conta.**
    //
    // `Perfil` saiu da barra e continua sendo ramo: `currentIndex` aponta para
    // ele e nao ha slot que o represente. `ramos.indexOf` devolve -1, e o
    // fallback antigo (`selecionado < 0 ? 0 : selecionado`) acenderia `Pets` --
    // a barra afirmando uma secao em que a pessoa nao esta, que e pior que
    // nenhuma acesa. Quem mostra onde ela esta e o avatar da barra de topo.
    final selecionado = ramos.indexOf(navegacao.currentIndex);
    return Scaffold(
      key: _casca,
      // **A GAVETA FOI OCULTADA EM 19/10/2026, e quem decidiu foi ele.**
      //
      // Literal: *"vamos ocultar o menu por enquanto, pois nao esta sendo
      // utilizado para nada. colocar o icone do usuario no lugar do menu"*.
      //
      // **Isto REVERTE o pedido dele de 17/10**, que era o oposto exato
      // (*"padronize todas as telas, tornando o menu esquerdo fixo para
      // manter o padrao, por mais que nao exista um sub-menu ainda, mas irei
      // evoluir e acrescentar alguns itens"*) e foi o que fez `temSubDestinos`
      // valer `true` incondicionalmente. Reversao DELE, do dia seguinte, e
      // nao descuido de quem apagou estas linhas.
      //
      // **NAO HA `drawer:` NESTE `Scaffold`, e e por isso que nao ha gaveta em
      // tela nenhuma.** `Scaffold` sem `drawer` nao tem `openDrawer`, nao
      // responde a arrasto de borda e nao desenha hamburguer automatico: a
      // ausencia e estrutural e nao depende de ninguem lembrar de esconder um
      // botao. Com ela, `drawerEnableOpenDragGesture` tambem deixou de ter o
      // que desligar.
      //
      // **A GAVETA FOI OCULTADA E NAO APAGADA**, e a distincao e dele (*"por
      // enquanto"*): `GavetaDeSecoes`, `BotaoDaGaveta`, `ControleDaGaveta` e o
      // inventario de 27.5 (`RegistroDeSubDestinos`) continuam no repositorio,
      // intactos. Reinstalar e devolver o `drawer:` aqui e o `leading` em
      // `TelaDeAba` -- duas linhas, e nenhum conteudo a reescrever.
      //
      // **OS SETE ITENS VIVOS DELA NAO FICARAM SEM CASA.** A tabela de para
      // onde cada um foi, e o achado de que DOIS deles tinham a gaveta como
      // unica porta, estao em `TelaDeAba`, no `leading` da barra de topo. O
      // portao e `test/telas/gaveta_oculta_e_barra_nova_test.dart`, um caso
      // por item.
      body: Column(
        // O AVISO QUE CHEGOU, ACIMA DO CONTEUDO.
        //
        // **Ele mora aqui e nao numa tela**, e a razao e a mesma que a gaveta
        // tinha: o push chega em qualquer momento, e a pessoa pode estar em
        // qualquer uma das cinco secoes. Um aviso preso a uma tela cobre a
        // tela, e o problema nao e da tela.
        //
        // **Com o app ABERTO o sistema operacional nao desenha nada**, mesmo
        // com bloco `notification` na mensagem. Sem esta faixa, quem esta com
        // o app na mao e a unica pessoa que nao ve o alerta -- o oposto do
        // esperado, e o motivo de testar so com o app aberto enganar.
        children: <Widget>[
          const AvisoQueChegou(),
          Expanded(child: navegacao),
        ],
      ),
      bottomNavigationBar: DecoratedBox(
        // O filete de 1px em `outline` e obrigatorio, nao decorativo (design
        // system 22.1): a barra usa `surface`, que esta a 1,04:1 do corpo da
        // pagina, e sem o filete ela **nao existe visualmente**.
        decoration: BoxDecoration(
          border: Border(
            top: BorderSide(color: cores.outline, width: BichuBorda.hairline),
          ),
        ),
        child: _BarraSemSelecao(
          apagar: selecionado < 0,
          // A tinta do PROPRIO fundo da barra, e nao `Colors.transparent`:
          // cor escrita a mao reprova no portao de tokens, e `surface` e o
          // papel do sistema que a barra ja usa. Indicador na cor do fundo e
          // indicador invisivel, pelo papel e nao por um literal.
          corDoFundo: cores.surface,
          child: NavigationBar(
          // `selectedIndex` e `int` e nao `int?`: o componente nao sabe
          // dizer "nenhum aceso". Na tela da conta nao HA slot
          // correspondente, e acender `Pets` seria a barra afirmando uma
          // secao em que a pessoa nao esta -- pior que nenhuma acesa.
          //
          // Entao o indice vai 0 e quem apaga o indicador e
          // `_BarraSemSelecao`, acima: visualmente nenhum slot fica aceso.
          selectedIndex: selecionado < 0 ? 0 : selecionado,
          onDestinationSelected: (indice) {
            final ramo = ramos[indice];
            // O slot que NAO e ramo empurra a rota, como a gaveta faz com os
            // atalhos vivos: a tela cobre a casca e tem volta.
            if (ramo < 0) {
              GoRouter.of(context).push(visiveis[indice].destinoDeHoje);
              return;
            }
            navegacao.goBranch(
              ramo,
              initialLocation: ramo == navegacao.currentIndex,
            );
          },
          destinations: <Widget>[
            for (final destino in visiveis)
              // O nome acessivel entra num `Semantics` que embrulha o destino,
              // e nao no `label`: o `label` e o texto **pintado**, e ele
              // precisa continuar sendo a palavra curta que cabe em 64,0 dp.
              //
              // `excludeSemantics: true` nao serve aqui: ele levaria junto o
              // `selected` e a acao de toque que o proprio componente emite, e
              // o criterio 7 pede que a aba ativa seja identificavel sem
              // depender de cor.
              Semantics(
                label: destino.semanticsLabel,
                child: NavigationDestination(
                  // O icone e **decorativo** e nao entra na arvore: icone com
                  // nome proprio ao lado de um rotulo que diz a mesma coisa e
                  // anuncio duplo, que e ruido no VoiceOver e no TalkBack
                  // (UX 27.7, regra 2). `Icon` sem `semanticLabel` ja nao
                  // entra.
                  icon: Icon(destino.icone),
                  selectedIcon: Icon(destino.iconeSelecionado),
                  label: destino.rotulo,
                  // O tooltip continua sendo **so o rotulo visivel**: ele e
                  // dica visual de quem pressiona e segura, e um paragrafo ali
                  // e defeito (UX 27.7, regra 3).
                  tooltip: destino.rotulo,
                ),
              ),
            ],
          ),
        ),
      ),
    );
  }
}

/// Apaga a SELECAO da barra quando nenhum slot corresponde a tela aberta.
///
/// **Existe porque `NavigationBar.selectedIndex` e `int`, e nao `int?`.** O
/// componente sempre acende um slot, e na tela da conta -- que saiu da barra
/// em 19/10 e continua sendo ramo -- nao ha slot que a represente. Acender
/// `Pets` ali seria a barra afirmando uma secao em que a pessoa nao esta, que
/// e pior que nenhuma acesa: ela mente para quem ve e, pelo `selected` da
/// semantica, tambem para quem usa leitor de tela.
///
/// O que ele faz e tirar os tres sinais de selecao de uma vez -- o indicador,
/// a tinta do icone e a do rotulo -- deixando os papeis de "nao selecionado"
/// nos dois estados. Nenhuma cor e escrita a mao: todas saem do proprio
/// `navigationBarTheme` do tema, e por isso claro e escuro continuam vindo de
/// `BichuCores`.
///
/// Quem mostra onde a pessoa esta, nesse caso, e a foto da barra de topo.
class _BarraSemSelecao extends StatelessWidget {
  const _BarraSemSelecao({
    required this.apagar,
    required this.corDoFundo,
    required this.child,
  });

  final bool apagar;

  /// A tinta do fundo da barra. O indicador assume ela para desaparecer sem
  /// nenhuma cor escrita a mao.
  final Color corDoFundo;

  final Widget child;

  @override
  Widget build(BuildContext context) {
    if (!apagar) return child;

    final tema = Theme.of(context);
    final barra = tema.navigationBarTheme;
    // O par de estados que o componente resolve por `WidgetStateProperty`: o
    // valor de "selecionado" passa a ser o de "nao selecionado".
    final iconeNaoSelecionado = barra.iconTheme?.resolve(
      const <WidgetState>{},
    );
    final rotuloNaoSelecionado = barra.labelTextStyle?.resolve(
      const <WidgetState>{},
    );

    return NavigationBarTheme(
      data: barra.copyWith(
        // O indicador e o sinal principal, e ele sai inteiro -- assumindo a
        // tinta do fundo da barra, que e o papel `surface` do sistema.
        indicatorColor: corDoFundo,
        iconTheme: iconeNaoSelecionado == null
            ? null
            : WidgetStateProperty.all(iconeNaoSelecionado),
        labelTextStyle: rotuloNaoSelecionado == null
            ? null
            : WidgetStateProperty.all(rotuloNaoSelecionado),
      ),
      child: child,
    );
  }
}

/// Casca visual comum das telas de aba: titulo, linha de reforco, margem
/// lateral de 16 e area segura.
///
/// Area segura nao e margem: notch, ilha dinamica, barra de gestos e teclado
/// mudam a area utilizavel em tempo de execucao, e conteudo em coordenada fixa
/// e defeito que so aparece no aparelho que ninguem tem em maos.
class TelaDeAba extends StatefulWidget {
  const TelaDeAba({
    required this.titulo,
    required this.filhos,
    super.key,
    this.reforco,
    this.tituloEmMarca = false,
    this.raizDeSecao = false,
    this.acaoDeCriar,
  });

  /// O **nome curto** da secao, igual ao rotulo da aba (UX 25.7.2 e 27.4.2).
  final String titulo;

  /// A frase que explica a secao. Vai na **primeira linha do corpo**, em
  /// `body-lg`, e nunca na barra de topo: ali ela quebra em quantas linhas
  /// precisar, rola junto com a pagina, escala ate 200% sem cortar nada e e
  /// lida pelo leitor de tela na ordem certa (UX 27.4.2).
  final String? reforco;

  final List<Widget> filhos;

  /// Quando a barra de topo carrega o LOGOTIPO em vez do titulo escrito.
  ///
  /// Vale so para a tela em que o titulo E a marca. O paragrafo 8.4 do design
  /// system diz que o logotipo e vetor e que nenhuma tela o recompoe digitando;
  /// a barra precisa do lockup SEM descritor, porque o completo tem piso de
  /// 160px de largura e nao cabe numa barra de 56px (paragrafo 21.2).
  ///
  /// [titulo] continua obrigatorio: ele vira o rotulo que o leitor de tela
  /// anuncia. Imagem de marca sem rotulo e barra muda para quem nao ve.
  final bool tituloEmMarca;

  /// Se esta tela e uma das CINCO raizes de secao.
  ///
  /// So a raiz de secao ganha a gaveta e o hamburguer, e a condicao nao e
  /// estetica: a raiz de aba e a unica tela do app cuja variante e
  /// `Saida=Nenhuma` (design system 23.4), e por isso o slot da ESQUERDA
  /// esta livre nela. Numa tela empilhada -- `Adoções`, por exemplo -- o
  /// mesmo slot e o `Voltar`, e por o hamburguer ali apagaria a saida.
  ///
  /// **A composicao `Saida + titulo + hamburguer` nao existe neste app**, e e
  /// esta linha que garante isso por construcao, e nao por disciplina.
  final bool raizDeSecao;

  /// A PORTA DE CRIAR DA SECAO, **flutuante no corpo** da tela.
  ///
  /// **ELA SAIU DA BARRA DE TOPO EM 19/10/2026, e quem decidiu foi ele.** Eu
  /// lhe mostrei a conta -- com o sino na barra, quatro controles, e o titulo
  /// de `Perto` saindo com reticencia -- e perguntei qual sairia. Palavras
  /// dele: **"O botao criar sai da barra"**. Entao `criar` desce para o corpo
  /// como acao flutuante e o sino entra no lugar dela.
  ///
  /// **Isto nao desfaz o pedido de 18/10.** O que ele recusou naquele dia foi
  /// o `BotaoSecundario` de LARGURA TOTAL dentro do corpo, que empurrava a
  /// lista 64 dp para baixo em `Rede` e em `Perto`. A acao flutuante nao ocupa
  /// linha nenhuma do fluxo: ela fica por cima, no canto, e o conteudo
  /// continua comecando na primeira linha. Quem desenha e
  /// `AcaoDeCriarFlutuante`; quem diz QUAL e cada secao.
  ///
  /// **Ela nao cobre a barra de baixo**, e isso e por construcao e nao por
  /// margem escolhida a mao: este `Scaffold` e filho do `body` do `Scaffold`
  /// da casca, e a barra de baixo e irma desse `body`. O canto inferior deste
  /// `Scaffold` termina onde a barra comeca.
  ///
  /// **O que ela cobre e o FIM DO CORPO**, e isso foi medido e pago: a lista
  /// recebe [_folgaDaAcaoFlutuante] de respiro extra no pe quando esta acao
  /// existe. Ver a conta ali.
  final Widget? acaoDeCriar;

  @override
  State<TelaDeAba> createState() => _EstadoDaTelaDeAba();
}

class _EstadoDaTelaDeAba extends State<TelaDeAba> {
  /// O SLOT UNICO DE ACAO da barra de topo (11.23.1), que a listagem preenche.
  ///
  /// Ele volta a ser do `Filtros` por decisao do cliente de 17/10/2026 ("suba
  /// todos os filtros para a barra do titulo da pagina"), que **reverte** a
  /// regra de 22/09 que o havia mandado para o corpo. Quem publica e
  /// `BarraDeListagem`; quem desenha e esta casca. A tela que nao lista nada
  /// nunca publica, e o slot continua vazio nela -- `Pets` e `Perfil` sao os
  /// dois casos, e o portao da gaveta cobra isso.
  final ValueNotifier<AcaoDeListagem?> _acaoDaListagem =
      ValueNotifier<AcaoDeListagem?>(null);

  /// A BUSCA QUE O ARRASTO REFAZ, publicada pelo corpo da secao.
  ///
  /// Pedido do cliente, 18/10/2026: *"Crie uma acao no aplicativo de atualizar
  /// a pagina conforme o usuario puxa a pagina para baixo"*.
  ///
  /// **Mora na casca porque a ROLAGEM e da casca.** O `ListView` das cinco
  /// secoes e montado aqui embaixo, e `RefreshIndicator` precisa de rolavel
  /// descendente: posto dentro de `ListaDePerdidos` ou de `VitrineDaLoja` ele
  /// nao veria rolagem nenhuma e o gesto nao dispararia. Quem conhece a busca
  /// e o corpo, e ele a publica por [SlotDeAtualizacao] -- o mesmo arranjo de
  /// [_acaoDaListagem], e pela mesma razao.
  ///
  /// **Nulo nao aceita o gesto**, e nao e detalhe: `Perfil` deslogado nao tem
  /// rota a chamar, e uma roda que gira sem buscar nada e pior que gesto
  /// nenhum.
  final RecargaDaSecao _recargaDaSecao = RecargaDaSecao();

  /// O RESPIRO EXTRA NO PE DA LISTA quando ha acao flutuante.
  ///
  /// **Medido, e nao arredondado por gosto.** O `FloatingActionButton` padrao
  /// mede 56 dp e o `Scaffold` o assenta a 16 dp da borda inferior do proprio
  /// corpo: ele ocupa os ultimos **72 dp** do corpo, no canto da direita. Sem
  /// este respiro, o ultimo item da lista fica embaixo dele -- e o ultimo item
  /// de `Perto` e um cartao de profissional com o controle de telefone no
  /// canto direito, que e exatamente onde a acao flutuante pousa.
  ///
  /// O `padding` do `ListView` ja da 16 dp no pe (`EdgeInsets.all(e4)`), entao
  /// o que falta sao os 56 dp do desenho: `e16 + e2 - e4 = 56`. Escrito como
  /// `e12 + e2` (48 + 8), que sao dois degraus da escala -- numero solto aqui
  /// seria medida escolhida a mao, e o portao de tokens cobra isso.
  ///
  /// **Nao e `Padding` por fora do `ListView`.** O respiro precisa ser
  /// ROLAVEL: por fora, ele viraria uma faixa morta permanente no pe da tela,
  /// e a acao flutuante continuaria pousada sobre o ultimo item sempre que a
  /// lista fosse mais longa que a tela.
  static const double _folgaDaAcaoFlutuante = BichuEspaco.e12 + BichuEspaco.e2;

  @override
  void dispose() {
    _acaoDaListagem.dispose();
    _recargaDaSecao.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    final cores = BichuColors.of(context).cores;
    final textos = Theme.of(context).textTheme;
    final titulo = widget.titulo;
    final reforco = widget.reforco;
    final filhos = widget.filhos;
    final tituloEmMarca = widget.tituloEmMarca;
    final raizDeSecao = widget.raizDeSecao;
    // **`comGaveta` SAIU em 19/10/2026 junto com o hamburguer.**
    //
    // Ele existia para o gatilho da gaveta nao nascer onde nao havia gaveta
    // para abrir -- `raizDeSecao` sozinho nao bastava, porque `rotas.dart` usa
    // `AbaPerfil()` como tela de escape de quatro rotas IRMAS da casca
    // (`casoAberto`, `marcarPerdido`, `marcarPerdidoAlcance`,
    // `escolherPetPerdido`), e ali a raiz de secao existe sem barra de baixo e
    // sem gaveta. Com a gaveta oculta nao ha gatilho, e a conta deixou de ter
    // objeto.
    //
    // **E a foto NAO precisa da mesma conta, e isso foi conferido.** O
    // `leading` novo e um `IconButton` que faz `go(Rotas.perfil)`: a rota
    // existe no roteador raiz e o `go` funciona das telas irmas da casca
    // tambem -- a foto ja era desenhada nelas, por `actions`, com o mesmo
    // toque. Ela mudou de lado e nao de condicao, e nenhum caso de
    // `marcar_como_perdido_test.dart` depende disso.

    // O CONTADOR DO SINO, lido do escopo e OUVIDO logo abaixo.
    //
    // Lido aqui, e nao dentro de `SinoDeNotificacoes`, porque e esta tela que
    // monta a barra: o sino recebe um numero e nao vai buscar nenhum (ver a
    // linha dele no `actions`).
    final contadorDeAvisos = Escopo.of(context).contadorDeAvisos;

    // O corpo fica FORA do `ValueListenableBuilder`, pelo `child`: sem isto
    // trocar o distintivo de filtros reconstruiria a lista inteira.
    final corpo = SafeArea(
      // `addSemanticIndexes: false` **nao e** microotimizacao. O padrao do
      // `ListView` e embrulhar cada filho direto num `IndexedSemantics`, e
      // com ele o filho vira **um** no de semantica: tudo o que estiver
      // dentro colapsa num rotulo so. Isso e o certo para uma lista de
      // itens, onde "item 3 de 10" significa alguma coisa -- e esta lista
      // nao e uma lista de itens, e o corpo rolavel de uma pagina.
      //
      // O que o padrao causava, medido na arvore de semantica do `Perfil`:
      // a secao inteira de `Meus pets` virava um unico no **anunciado como
      // botao**, de nome `Meus pets Seu primeiro pet entra aqui. Cadastre
      // seu pet ... Cadastrar meu pet`. O titulo da secao entrava no nome
      // acessivel do botao, e o botao deixava de existir como controle
      // separado: quem usa TalkBack ou VoiceOver nao tinha como parar nele.
      // E SC 4.1.2 (nome, papel, valor) falhando numa acao primaria -- nas
      // quatro abas de entao, e agora seriam cinco.
      //
      // Cada secao volta a compor os proprios nos, que e o que o leitor de
      // tela precisa para deslizar entre titulo, texto e acao.
      //
      // NAO REMOVA. `test/telas/casca_de_cinco_secoes_test.dart` reprova por
      // dois caminhos independentes: a varredura do fonte deste arquivo, e a
      // arvore de semantica com a acao primaria colapsada.
      // **O ARRASTAR-PARA-ATUALIZAR EMBRULHA ESTE `ListView`**, e nao o
      // `Scaffold`: o `RefreshIndicator` precisa do rolavel como descendente.
      // Ele fica DENTRO do `SafeArea` para a roda nao nascer debaixo da barra
      // de status.
      //
      // **E PERMANENTE, e nao condicional** -- `.doSlot` le a busca no momento
      // do arrasto. Desenha-lo so quando ha busca publicada remontava a secao
      // inteira a cada publicacao, e com ela uma carga de rede nova: 22 casos
      // da suite reprovaram assim. A medicao esta no construtor, em
      // `widgets/arrastar_para_atualizar.dart`.
      child: ArrastarParaAtualizar.doSlot(
        recarga: _recargaDaSecao,
        child: ListView(
        addSemanticIndexes: false,
        // A MARGEM DA PAGINA, mais o respiro do que flutua por cima dela.
        // Ver `_folgaDaAcaoFlutuante`: sem isto o ultimo item da lista nasce
        // embaixo da acao de criar.
        padding: EdgeInsets.fromLTRB(
          BichuEspaco.e4,
          BichuEspaco.e4,
          BichuEspaco.e4,
          widget.acaoDeCriar == null
              ? BichuEspaco.e4
              : BichuEspaco.e4 + _folgaDaAcaoFlutuante,
        ),
        children: <Widget>[
          // **Vazio tambem nao desenha** (18/10/2026). As cinco secoes passaram
          // a mandar `reforcoDaPagina: ''` por pedido do cliente, e sem o
          // `isNotEmpty` a pagina abriria com um `Text` vazio e 24 dp de
          // respiro para nada -- um buraco acima do primeiro bloco, em todas
          // as cinco. O `!= null` fica para quem nao manda reforco nenhum,
          // como a `Rede`, que passa o texto para dentro da propria agenda.
          if (reforco != null && reforco.isNotEmpty) ...<Widget>[
            Text(
              reforco,
              style: textos.bodyLarge?.copyWith(color: cores.textSecondary),
            ),
            const SizedBox(height: BichuEspaco.e6),
          ],
          ...filhos,
        ],
        ),
      ),
    );

    return SlotDeAtualizacao(
      recarga: _recargaDaSecao,
      child: SlotDaBarraDeListagem(
      acao: _acaoDaListagem,
      // O CONTADOR E OUVIDO AQUI, e nao dentro do sino, e o motivo e o mesmo
      // que mantem a busca fora dele: `SinoDeNotificacoes` recebe um numero
      // pronto. Ouvir dentro do sino colocaria uma assinatura por secao
      // montada no mesmo objeto.
      //
      // **O corpo nao reconstroi quando o numero muda.** `corpo` e montado
      // uma vez em `build` e entra no `child:` do `ValueListenableBuilder`
      // logo abaixo; este construtor so refaz a barra. Sem esse cuidado, um
      // aviso que chegasse reconstruiria a lista inteira da secao -- que e
      // exatamente o que o `child:` do distintivo de filtros ja evitava.
      child: ListenableBuilder(
        listenable: contadorDeAvisos,
        builder: (context, _) => ValueListenableBuilder<AcaoDeListagem?>(
          valueListenable: _acaoDaListagem,
          child: corpo,
          builder: (context, acao, corpo) => Scaffold(
            appBar: AppBar(
              // A MARCA no lugar do texto quando `tituloEmMarca`
              // (BICHUS-195/196). O `rotulo` continua indo para o leitor de
              // tela: vetor sem nome e vetor mudo.
              title: tituloEmMarca
                  ? MarcaLockup(
                      largura: MarcaLockup.pisoDeLargura,
                      rotulo: titulo,
                    )
                  // **A ABREVIACAO E DELIBERADA E MEDIDA, e nao acidente de
                  // leiaute** (19/10/2026).
                  //
                  // A 200% de escala de texto, em 320 dp, com o arranjo que as
                  // secoes de comunidade tem (hamburguer 64 + porta de criar +
                  // foto 48), `Perto` **nao cabe**. Medido, logado, com a
                  // `Inter`
                  // de verdade:
                  //
                  //   orcamento pela reserva do portao: 160,00 dp
                  //   `Pets`, `Rede` e `Loja`:          138,32 dp -> cabem
                  //   `Perto`:                          172,90 dp -> NAO cabe
                  //
                  // **O hamburguer FICA.** O cliente pediu em 17/10 *"padronize
                  // todas as telas, tornando o menu esquerdo fixo"*, e tira-lo
                  // para ganhar 64 dp contrariaria aquilo em TODAS as telas
                  // para resolver uma largura em UMA. O rotulo tambem nao
                  // encurta: ja
                  // e so `Perto`, o nome curto que ele escolheu, e nao ha o que
                  // abreviar no texto.
                  //
                  // Entao a 200% o titulo corta -- e as tres linhas abaixo
                  // sao o
                  // que faz esse corte ser uma DECISAO:
                  //
                  // - `maxLines: 1` e `softWrap: false` garantem que o titulo
                  //   **nunca quebre o arranjo nem empurre controle**: sem
                  //   eles,
                  //   um titulo mais longo ganharia uma segunda linha dentro de
                  //   uma barra de 64 dp de altura;
                  // - `overflow: ellipsis` e a reticencia EXPLICITA. Ela e o
                  //   padrao do `AppBar` hoje, e por isso mesmo esta escrita
                  //   aqui: padrao de componente muda de versao, e o dia em que
                  //   mudasse o titulo passaria a ser cortado em seco sem
                  //   ninguem ver;
                  // - `semanticsLabel: titulo` e o que separa o PINTADO do
                  //   ANUNCIADO. **Abreviar o pintado nao pode abreviar o
                  //   anunciado**: quem usa leitor de tela continua ouvindo
                  //   `Perto` inteiro, e nao `Pert...`. O portao de orcamento
                  //   cobra as duas coisas.
                  : Text(
                      titulo,
                      maxLines: 1,
                      softWrap: false,
                      overflow: TextOverflow.ellipsis,
                      semanticsLabel: titulo,
                    ),
              // 64 dp, e nao os 56 do padrao do M3 (design system 23.2).
              toolbarHeight: BichuAlvoDeToque.critico,
              // **OS 16 dp QUE A FOTO CUSTOU, DEVOLVIDOS AO TITULO.**
              //
              // A foto entrou no lado direito em 19/10 e levou 48 dp. Medido em
              // 320 dp a 200% de escala, com o arranjo cheio (hamburguer 64 +
              // criar/`Filtros` 64 + foto 48): sobravam **128,00 dp** de titulo
              // e `Pets` e `Loja` pedem **138,32 dp** -- faltavam 10,32 dp, e o
              // titulo saia com reticencia. `Rede` e `Perto` saiam cortados
              // tambem.
              //
              // `titleSpacing: 0` devolve exatamente os 16 dp do vao padrao
              // entre o `leading` e o titulo, e o orcamento vai a **144,00 dp**
              // -- 5,68 dp de folga sobre o pior titulo. O vao nao era
              // necessario: o hamburguer e um alvo de 64 dp com o glifo de 24
              // centrado, entao ha 20 dp de ar dentro do proprio alvo e o texto
              // nao encosta nele.
              //
              // **E O `titleSpacing: 0` FICA, e com o arranjo de 19/10 ele e
              // mais necessario, nao menos.**
              //
              // Com `criar` fora da barra e o sino dentro dela, o lado direito
              // e sino 48 + foto 48 = 96 e o titulo comeca em 64 (depois do
              // hamburguer). Orcamento MEDIDO em 320 dp a 200%, logado:
              // **160,00 dp**.
              //
              //   `Pets`, `Rede`, `Loja`: 138,32 dp -> cabem (21,68 de folga)
              //   `Perto`:                172,90 dp -> **AINDA NAO CABE**
              //
              // **O deficit do `Perto` caiu de 28,90 para 12,90 dp e nao chegou
              // a zero**, e isso esta no relatorio como pergunta fechada para o
              // cliente. Tirar o `criar` devolveu 64 dp e o sino levou 48:
              // saldo de +16,00. Nao ha de onde tirar os 12,90 que faltam sem
              // mexer em algo que nao e meu -- o hamburguer tem piso de 64 dp
              // (11.23.1), o sino e a foto estao no piso de 48 (SC 2.5.8),
              // `titleSpacing` ja esta em zero e a margem interna da foto custa
              // 0,00 dp. Sobra tirar outro controle da barra ou encurtar o
              // rotulo, e as duas coisas sao decisao dele.
              //
              // O caso de orcamento de `gaveta_com_submenus_test.dart` prende
              // os 160,00 e o deficit: ele reprova se um controle voltar para a
              // barra e reprova se `Perto` passar a pedir mais.
              titleSpacing: 0,
              // **A FOTO DA PESSOA VAI NO SLOT DA ESQUERDA, no lugar do
              // hamburguer (decisao do cliente, 19/10/2026).**
              //
              // Literal dele: *"vamos ocultar o menu por enquanto, pois nao
              // esta sendo utilizado para nada. colocar o icone do usuario no
              // lugar do menu, do lado esquerdo da pagina e o icone de
              // notificacao vai ficar na barra principal do lado direito de
              // todas as paginas"*.
              //
              // **Isto REVERTE o pedido dele de 17/10** (*"padronize todas as
              // telas, tornando o menu esquerdo fixo para manter o padrao, por
              // mais que nao exista um sub-menu ainda, mas irei evoluir e
              // acrescentar alguns itens"*), que foi o que instalou o
              // hamburguer em TODA raiz de secao. E reversao DELE, do dia
              // seguinte, e nao descuido de quem mexe nesta linha. A gaveta foi
              // **OCULTADA e nao apagada**: `GavetaDeSecoes` e o inventario de
              // 27.5 continuam no repositorio, e o que saiu foi o `drawer:` da
              // casca e este gatilho.
              //
              // **OS SETE ITENS VIVOS DA GAVETA NAO FICARAM SEM CASA**, e isso
              // foi MEDIDO item por item antes de ocultar o menu -- a medicao e
              // o grupo `os sete itens vivos continuam alcancaveis` de
              // `test/telas/gaveta_oculta_e_barra_nova_test.dart`, um caso por
              // item, com o caminho nomeado:
              //
              //   | item                     | caminho de hoje                |
              //   |--------------------------|--------------------------------|
              //   | `Escanear uma tag`       | acao flutuante em `Pets`       |
              //   | `Registrar achado avulso`| acao flutuante em `Pets`       |
              //   | `Cadastrar pet`          | acao flutuante em `Pets`       |
              //   | `Meus dados`             | foto -> `Perfil` (item)        |
              //   | `Sair da conta`          | foto -> `Perfil` (item)        |
              //   | `Pedidos de conexao`     | foto -> `Perfil` (item NOVO)   |
              //   | `Pessoas bloqueadas`     | foto -> `Perfil` (item NOVO)   |
              //
              // **Os dois ultimos tiveram de ser CONSTRUIDOS, e o achado e
              // este:** `Pedidos de conexao` e `Pessoas bloqueadas` tinham a
              // gaveta como UNICA porta em `lib/` -- medido por busca das duas
              // rotas, que aparecem so em `gaveta_de_secoes.dart`, em
              // `rotas.dart` e nas proprias telas. Ocultar o menu por cima
              // delas teria deixado duas telas construidas inalcancaveis, em
              // silencio. Elas entraram no menu da conta de `AbaPerfil`.
              //
              // **O ORCAMENTO DO TITULO MELHOROU, e esta medido no portao.** O
              // hamburguer tinha piso de 64 dp (11.23.1) e a foto tem 48 (o
              // piso do SC 2.5.8, com a excecao explicada em [AvatarDaConta]);
              // com a foto saindo de `actions` e entrando aqui, o lado direito
              // perdeu 48 dp. Em 320 dp a 200%, logado:
              //
              //   antes:  hamburguer 64 | titulo | sino 48 + foto 48  -> 160,00
              //   agora:  foto 48       | titulo | sino 48            -> 224,00
              //
              // **E com 224,00 a excecao de corte de cinco letras ACABOU.** Ela
              // era de `Perto` (172,90 dp pedidos contra 160,00), e `Perto`
              // deixou de ser secao no mesmo dia; `Mural`, que e o novo rotulo
              // de cinco letras, pede os mesmos 172,90 e agora CABE, com 51,10
              // dp de folga. Nenhum dos cinco titulos corta mais. Os numeros
              // sao medidos em `gaveta_oculta_e_barra_nova_test.dart`, pela
              // constricao que o leiaute entrega ao titulo -- e nao por esta
              // conta.
              //
              // **So na RAIZ DE SECAO.** Numa tela empilhada o slot da esquerda
              // e o `Voltar` (design system 23.4), e por a foto ali apagaria a
              // saida -- exatamente a razao pela qual o hamburguer tambem nao
              // ficava nelas. A composicao `Saida + titulo + foto a esquerda`
              // **nao existe neste app**, e e esta linha que garante isso por
              // construcao.
              leading: raizDeSecao
                  ? AvatarDaConta(
                      inicial: _inicialDaSessao(context),
                      // `go`, e nao `push`: a tela da conta continua sendo RAMO
                      // da casca -- ela so perdeu o slot da barra de baixo.
                      // Trocar de ramo e o que mantem a barra de baixo visivel
                      // dentro dela (o arranjo do Instagram, que o cliente deu
                      // como referencia) e o que mantem `Entrar` e `Criar
                      // conta` devolvendo a ABA de onde a pessoa veio.
                      //
                      // Medido: com `push` numa rota irma, voltar de `Entrar`
                      // caia numa tela que cobre a casca e a barra de baixo nao
                      // existia na arvore -- 107 casos da suite reprovaram.
                      aoTocar: () => GoRouter.of(context).go(Rotas.perfil),
                    )
                  : null,
              leadingWidth: raizDeSecao ? AvatarDaConta.alvo : null,
              // **O LADO DIREITO: O SINO, E SO O SINO (19/10/2026).**
              //
              // A foto saiu daqui e foi para o slot da ESQUERDA, no lugar do
              // hamburguer, por pedido dele -- a conta inteira esta em
              // `leading`, acima. O sino fica, e no lado em que ele pediu:
              // *"o icone de notificacao vai ficar na barra principal do lado
              // direito de todas as paginas"*.
              //
              // **UM controle, e so um.** `actions` deixou de ter dois itens, e
              // isso e o que devolveu 48,00 dp ao titulo. O portao de orcamento
              // mede a constricao que o leiaute entrega ao titulo, e nao a
              // quantidade de `IconButton`: foi assim que um portao cego antigo
              // aprovou 160,00 enquanto o titulo cortava de verdade.
              //
              // **O `criar` NAO ESTA AQUI, e nao volta** (19/10: *"O botao
              // criar sai da barra"*). A porta de criar e o
              // `floatingActionButton`
              // deste mesmo `Scaffold`, logo abaixo.
              //
              // **O `Filtros` tambem nao esta aqui** (19/10: *"qualquer coisa,
              // pense em outro lugar para colocar o filtro da pagina"*): ele
              // voltou para o topo do CORPO, e quem o desenha e
              // `GatilhoDeRecorteNoCorpo` -- a DIREITA do campo de busca
              // desde a reversao do mesmo dia. `BarraDeListagem` continua
              // publicando no slot -- publicando NULO --, porque e essa
              // publicacao que limpa a
              // barra quando a lista sai da tela.
              //
              // **O SINO E INCONDICIONAL na barra, e CONDICIONAL na tela.** Ele
              // e montado em toda tela de secao; quem decide se aparece e ele
              // proprio, pela sessao (`SizedBox.shrink` sem conta). A diferenca
              // importa para o portao: `actions` tem sempre UM item, e o que
              // varia e o que ele pinta.
              //
              // **`naoLidas` VEM DO CONTADOR DO ESCOPO** (19/10/2026). Ate
              // hoje ia nulo por falta de fonte: a rota
              // (`GET /v1/me/notifications/count`) e a camada
              // (`NotificacoesApi.contar()`) existiam e **nenhuma linha de
              // `lib/` as chamava**. Agora chamam -- `ContadorDeAvisos`, um no
              // app inteiro, com a politica de atualizacao escrita nele.
              //
              // **O numero NAO e buscado aqui, e nao pode ser.** Os ramos
              // visitados da casca ficam montados (`IndexedStack`), entao uma
              // busca nesta linha sairia uma vez por secao visitada: um pedido
              // por secao para desenhar um numero, com as respostas chegando
              // fora de ordem para o mesmo circulo. Esta linha so LE.
              //
              // **O `const` SAIU da lista, e nao por descuido:** `naoLidas` e
              // um valor de execucao agora, e `const` nao sobrevive a isso. A
              // lista continua tendo UM item, que e o que o portao mede.
              //
              // **Nulo continua chegando aqui, e continua significando a mesma
              // coisa**: antes da primeira resposta, e depois de uma busca que
              // falhou sem valor anterior, o contador publica nulo -- e o sino
              // nao pinta distintivo. Zero chega apenas quando o SERVIDOR disse
              // zero (ou confirmou `seen`), nunca por falha de rede. Ver
              // `ContadorDeAvisos` e `SinoDeNotificacoes.naoLidas`.
              actions: <Widget>[
                SinoDeNotificacoes(naoLidas: contadorDeAvisos.naoLidas),
              ],
            ),
            body: corpo,
            // A PORTA DE CRIAR DA SECAO, no corpo e flutuante (19/10: *"O botao
            // criar sai da barra"*).
            //
            // **`endFloat`, que e o default, e e ele que resolve as duas
            // colisoes.** No canto inferior DIREITO a acao nao briga com o
            // puxar-para-atualizar que outra frente esta acrescentando --
            // aquele gesto comeca no topo da lista e desenha o indicador no
            // alto -- e nao fica sobre a primeira coluna de texto de nenhum
            // cartao. `centerDocked` levaria a acao para cima da barra de baixo
            // e `startFloat` a poria sobre o comeco da linha dos cartoes.
            //
            // `null` nas secoes que nao criam nada (`Pets`, `Loja`, `Perfil`) e
            // em toda tela empilhada: `Scaffold` com `floatingActionButton:
            // null` nao reserva espaco nenhum, e o respiro do pe da lista
            // tambem desaparece junto.
            floatingActionButton: widget.acaoDeCriar,
          ),
        ),
      ),
      ),
    );
  }
}

/// O SINO DA BARRA DE TOPO: os avisos de evento, ao lado da foto.
///
/// Pedido do cliente (19/10): *"na barra principal crie um icone de
/// notificacao para alertar o usuario sobre os posts dos seus amigos e sobre
/// informacoes sistemicas e comunicados de eventos, etc."*
///
/// ## Sino e `AuAu` nao sao a mesma coisa, e a distincao e dele
///
/// Palavras dele: *"nao sao a mesma coisa, mensagens e conversa, notificacao
/// sao eventos que estao acontecendo"*. Por isso os dois ficam: o balao da
/// barra de baixo e conversa, o sino daqui e evento acontecendo. **Para quem
/// nao ve, a diferenca vem dos nomes acessiveis**, que dizem a funcao por
/// extenso -- `AuAu, mensagens` contra `Notificacoes` --, porque os dois
/// glifos sozinhos nao carregam essa distincao.
///
/// ## Ele NAO aparece sem sessao
///
/// Notificacao e sobre o que aconteceu com a SUA rede, e sem conta nao ha
/// rede nem o que contar. E a mesma regua que as acoes de criar seguem. O
/// leitor de QR e a excecao conhecida, e por outro motivo: ler uma plaquinha
/// nao exige conta.
///
/// ## O contador vem de FORA, e desde 19/10 ele vem
///
/// **Este widget nao busca numero nenhum, e isso e a regra e nao um estado
/// transitorio.** Quem busca e `ContadorDeAvisos`, um objeto no `Escopo`, e
/// quem o LE e `TelaDeAba` -- que passa o resultado por [naoLidas].
///
/// O motivo de a busca nao morar aqui e o arranjo da casca: os ramos
/// visitados ficam MONTADOS (`IndexedStack`), entao um sino que chamasse
/// `NotificacoesApi.contar()` por conta propria dispararia uma chamada por
/// secao visitada -- um pedido por secao para desenhar um numero, com as
/// respostas chegando fora de ordem para o mesmo circulo. E um objeto so e o
/// que permite a CAIXA de avisos derrubar o numero quando abre: com uma
/// contagem por sino, ela nao teria a quem falar.
///
/// **A politica de atualizacao esta escrita em `ContadorDeAvisos`**, e nao
/// aqui: os quatro momentos em que o numero e buscado, o que acontece depois
/// de `markNotificationsListSeen`, e por que falha de rede mantem o valor
/// anterior em vez de virar zero. Esta barra so le.
///
/// **Nulo continua existindo, e continua significando "ninguem contou
/// ainda"**: e o que chega antes da primeira resposta, depois de uma busca que
/// falhou sem valor anterior, e depois do logout. Zero chega so quando o
/// servidor disse zero. Nenhum dos dois e inventado no aparelho -- somar
/// `read` aqui divergiria entre dois aparelhos da mesma pessoa, que e o que
/// `notificacoes_api.dart` proibe por escrito.
///
/// **O numero vai INTEIRO para quem usa leitor de tela.** `9+` e apresentacao:
/// o distintivo pintado encurta porque nao cabe, o nome acessivel nunca.
class SinoDeNotificacoes extends StatelessWidget {
  const SinoDeNotificacoes({super.key, this.naoLidas});

  /// Quantas nao lidas, ou nulo enquanto ninguem contou.
  ///
  /// **Nulo nao e zero.** Nulo e "o app ainda nao sabe" e nao pinta distintivo
  /// nenhum; zero e "o servidor disse que nao ha nada". Vem de
  /// `ContadorDeAvisos.naoLidas`, pelo `Escopo` -- ver a doc desta classe.
  final int? naoLidas;

  static const String rotuloBase = 'Notificações';
  static const double alvo = 48;

  /// O nome acessivel, com a contagem CRUA quando ela existe.
  static String rotuloCom(int? naoLidas) {
    if (naoLidas == null || naoLidas <= 0) return rotuloBase;
    final plural = naoLidas == 1 ? 'nova' : 'novas';
    return '$rotuloBase, $naoLidas $plural';
  }

  /// O que o distintivo PINTA. Encurta, porque o circulo nao cresce.
  static String? distintivoDe(int? naoLidas) {
    if (naoLidas == null || naoLidas <= 0) return null;
    return naoLidas > 9 ? '9+' : '$naoLidas';
  }

  @override
  Widget build(BuildContext context) {
    final sessao = Escopo.of(context).sessao;
    // Sem sessao o sino nao existe -- e `SizedBox.shrink`, e nao um sino
    // desabilitado: controle visivel e morto e acao sem destino.
    if (sessao.estado != EstadoDaSessao.logado) {
      return const SizedBox.shrink();
    }

    final cores = BichuColors.of(context).cores;
    final textos = Theme.of(context).textTheme;
    final distintivo = distintivoDe(naoLidas);

    return IconButton(
      tooltip: rotuloCom(naoLidas),
      constraints: const BoxConstraints(minWidth: alvo, minHeight: alvo),
      // O DESTINO: a caixa de avisos, registrada em `rotas.dart` como rota
      // IRMA da casca (ela cobre a barra de baixo, de proposito).
      //
      // **`push`, e nao `go`, e a diferenca e medida em para onde a pessoa
      // volta.** A caixa sai por `SaidaDaTela`, que desempilha quando ha o
      // que desempilhar e so cai no `escape` quando nao ha. Com `go` nao
      // haveria pilha: fechar a caixa jogaria quem veio de `Perto` no escape
      // da tela, e a pessoa perderia a secao em que estava. Com `push` ela
      // volta exatamente para a secao de onde tocou o sino.
      //
      // Isto NAO contradiz o `go` da foto, logo acima: a tela da conta e RAMO
      // da casca -- trocar de ramo e o que mantem a barra de baixo visivel
      // dentro dela --, e a caixa nao e ramo nenhum.
      onPressed: () => GoRouter.of(context).push(Rotas.notificacoes),
      // O glifo SIMPLES, e nao o `notifications_active` nem um sino com
      // badge embutido: o distintivo e desenhado aqui por cima, entao o
      // estado vazio e o cheio usam o MESMO glifo e nao ha dois desenhos
      // divergindo.
      icon: Stack(
        clipBehavior: Clip.none,
        children: <Widget>[
          Icon(Icons.notifications_outlined, color: cores.textPrimary),
          if (distintivo != null)
            Positioned(
              right: -BichuEspaco.e1,
              top: -BichuEspaco.e1,
              child: Container(
                padding: const EdgeInsets.symmetric(
                  horizontal: BichuEspaco.e1,
                ),
                constraints: const BoxConstraints(minWidth: BichuEspaco.e4),
                // Os MESMOS papeis que o distintivo de filtros ja usava
                // (`primary` sobre `onActionFill`), e nao uma cor de alerta
                // propria: duas tintas diferentes para a mesma ideia de
                // "ha algo novo aqui" seriam duas linguagens no mesmo app.
                decoration: BoxDecoration(
                  color: cores.primary,
                  borderRadius: BorderRadius.circular(BichuRaio.full),
                ),
                child: Text(
                  distintivo,
                  textAlign: TextAlign.center,
                  // O distintivo repete o que o `tooltip` ja diz por extenso,
                  // e com o numero INTEIRO. Dois anuncios do mesmo estado no
                  // mesmo controle e ruido -- e aqui seria pior: o pintado
                  // diz `9+` e o anunciado diz `12`.
                  semanticsLabel: '',
                  style: textos.labelSmall?.copyWith(
                    color: cores.onActionFill,
                  ),
                ),
              ),
            ),
        ],
      ),
    );
  }
}

/// A inicial do nome de quem esta logado, ou nulo.
///
/// Nulo cobre dois estados diferentes de proposito -- deslogado e logado sem
/// nome --, porque o desenho do avatar e o mesmo nos dois: o glifo de pessoa.
/// Deslogado o avatar continua existindo e continua levando a tela da conta,
/// que e onde moram `Entrar` e `Criar conta`: deslogado e estado de navegacao,
/// nao muro (UX 5.2).
String? _inicialDaSessao(BuildContext context) {
  final sessao = Escopo.of(context).sessao;
  if (sessao.estado != EstadoDaSessao.logado) return null;
  final nome = sessao.usuario?.nome?.trim();
  if (nome == null || nome.isEmpty) return null;
  return nome.characters.first.toUpperCase();
}

/// A FOTO DA PESSOA NA BARRA DE TOPO, e a porta da tela da conta.
///
/// Pedido do cliente, literal (19/10): *"acrescente uma foto pequena do
/// usuario na barra superior de todas as paginas, e ao clicar o usuario abre o
/// menu atual da tela de perfil"*. Ela e a porta que substituiu o slot de
/// `Perfil` na barra de baixo.
///
/// ## A foto ainda nao existe, e o espaco ja existe
///
/// `users.photo_image_id` **nao esta nesta arvore**: ela vive na branch
/// `feat/imagem-do-profissional-e-foto-do-usuario`, ainda nao mesclada. O que
/// esta construido aqui e o ESPACO, o alvo de toque, o nome acessivel e a
/// marca neutra -- a inicial do nome, ou o glifo de pessoa quando nao ha nome.
///
/// **O QUE FALTA LIGAR, numa linha:** quando aquela branch descer, trocar o
/// conteudo de [_MarcaNeutra] por um `CircleAvatar` com a imagem de
/// `photo_image_id` e manter a inicial como fallback de carregamento e de
/// conta sem foto. A fiacao -- sessao, usuario, toque, rotulo -- nao muda.
/// Mostrar a PROPRIA foto para si mesmo e o caso permitido: a imagem e visivel
/// so ao dono, e o dono e exatamente quem esta olhando esta barra.
///
/// ## Ela MUDOU DE LADO em 19/10/2026, e esta no slot do hamburguer
///
/// Pedido dele, no mesmo dia em que a pos na barra: *"colocar o icone do
/// usuario no lugar do menu, do lado esquerdo da pagina"*. Ela era a ULTIMA de
/// `actions` e passou a ser o `leading` de toda raiz de secao. O toque, o nome
/// acessivel e o desenho nao mudaram; mudaram o lado e o lado da margem.
///
/// ## O alvo e 48 dp, e nao os 64 dos outros controles da barra
///
/// O 11.23.1 pede 64 x 64 nos controles de canto, e a excecao foi fixada pelo
/// briefing que trouxe esta foto: 48 dp, que continua acima do piso do M3 e do
/// SC 2.5.8. **No slot do `leading` ela paga melhor do que o hamburguer
/// pagava**, e isso esta medido no portao: o hamburguer tinha piso de 64 dp
/// (11.23.1 o trata como controle de canto de barra), entao trocar um pelo
/// outro devolveu 16,00 dp ao titulo -- e tirar a foto de `actions` devolveu
/// outros 48,00. O orcamento foi de 160,00 para **224,00 dp** em 320 dp a
/// 200%, e com ele nenhum dos cinco titulos corta mais.
class AvatarDaConta extends StatelessWidget {
  const AvatarDaConta({required this.aoTocar, super.key, this.inicial});

  /// O que o toque faz. Quem decide e a casca; este widget so desenha.
  final VoidCallback aoTocar;

  /// A primeira letra do nome de exibicao, quando ha nome.
  final String? inicial;

  /// O nome acessivel.
  ///
  /// **Avatar sem rotulo e um circulo mudo para quem nao ve.** O texto diz o
  /// que o controle ABRE, e nao o que ele mostra: a imagem nao e a informacao,
  /// o destino e.
  static const String rotuloAcessivel = 'Sua conta';

  /// O alvo de toque, em dp.
  static const double alvo = 48;

  /// A chave do CIRCULO desenhado, dentro do alvo.
  ///
  /// Existe para o portao poder medir as duas coisas separadamente: o ALVO de
  /// toque (que e o widget inteiro, 48 dp, e encosta na borda da tela) e o
  /// DESENHO (o circulo de 32 dp, que fica a `layout.margem-celular` da
  /// borda). Sem esta separacao, um caso que medisse so o widget diria que a
  /// margem e zero: o caso que ja media a foto (`navegacao_mensagens_e_avatar`)
  /// confere o TAMANHO do alvo, e alvo de 48 dp encostado na borda passa por
  /// ele -- foi assim que os 8,00 dp do desenho ficaram sem portao.
  static const Key chaveDoCirculo = ValueKey<String>('conta/avatar/circulo');

  @override
  Widget build(BuildContext context) {
    return IconButton(
      // `tooltip` vira o nome acessivel (11.23.3), como no gatilho da gaveta.
      tooltip: rotuloAcessivel,
      constraints: const BoxConstraints(minWidth: alvo, minHeight: alvo),
      // A MARGEM DA ESQUERDA, DENTRO DO PROPRIO ALVO. **Zero dp de custo para
      // o titulo**, e e por isso que ela e assimetrica em vez de um `Padding`
      // por fora.
      //
      // **ELA TROCOU DE LADO EM 19/10/2026, com a foto.** Ela nasceu `right:`
      // porque a foto fechava o lado DIREITO da barra; o cliente a mandou para
      // o slot da esquerda, no lugar do hamburguer, e a margem foi com ela. A
      // regra nao mudou -- o circulo fica a `layout.margem-celular` (16 dp) da
      // borda da TELA, que e a mesma margem do corpo (`EdgeInsets.all(e4)`) --,
      // mudou qual borda e essa. Uma `margemCelular` do lado direito aqui
      // poria 16 dp de ar ENTRE a foto e o titulo e deixaria o circulo
      // encostado na borda esquerda: o desalinho que o cliente leu, espelhado.
      //
      // **O `Padding` por fora foi medido e recusado** quando ela era do lado
      // direito, e a recusa vale igual deste lado: `Padding` por fora engorda
      // o `leading`, e `leadingWidth` nao o acompanha -- ou o alvo passa a
      // custar 64 dp de orcamento de titulo, ou o circulo sai do alvo. Pagar a
      // margem com o titulo e desfazer o `titleSpacing: 0` pelo outro lado.
      //
      // Medido em 320 dp a 200%, logado, no arranjo de hoje: o alvo vai de
      // 0..48 -- 48 x 48, que e o piso do M3 e do SC 2.5.8 e o que o briefing
      // desta foto fixou (o 11.23.1 pede 64 em controle de canto, e a excecao
      // esta explicada no cabecalho desta classe) -- e o circulo de 32 dp fica
      // em 16..48: **16,00 dp de margem visual**, orcamento de titulo intacto.
      // O alvo deixa de ser concentrico com o glifo, e os 16 dp a mais ficam
      // ENTRE a borda da tela e o circulo, onde nao ha outro controle para
      // roubar o toque.
      padding: const EdgeInsets.only(
        left: BichuLayout.margemCelular,
        top: BichuEspaco.e2,
        bottom: BichuEspaco.e2,
      ),
      onPressed: aoTocar,
      icon: _MarcaNeutra(inicial: inicial),
    );
  }
}

/// A marca neutra do avatar: a inicial, ou o glifo de pessoa.
///
/// **Decorativa, e por isso `ExcludeSemantics`.** O nome acessivel do controle
/// ja esta no `tooltip` do [AvatarDaConta]; uma letra anunciada ao lado dele
/// seria ruido. E pelo mesmo motivo a inicial nao e "conteudo": ela nao diz
/// nada que `Sua conta` nao diga.
class _MarcaNeutra extends StatelessWidget {
  const _MarcaNeutra({this.inicial});

  final String? inicial;

  @override
  Widget build(BuildContext context) {
    final cores = BichuColors.of(context).cores;
    final textos = Theme.of(context).textTheme;
    final letra = inicial;

    return ExcludeSemantics(
      child: Container(
        key: AvatarDaConta.chaveDoCirculo,
        width: 32,
        height: 32,
        decoration: BoxDecoration(
          color: cores.surfaceSunken,
          shape: BoxShape.circle,
          // O filete pelo mesmo motivo da barra de baixo: `surfaceSunken`
          // esta perto do fundo da barra e sem a borda o circulo nao existe
          // visualmente.
          border: Border.all(color: cores.outline, width: BichuBorda.hairline),
        ),
        alignment: Alignment.center,
        child: letra == null
            ? Icon(Icons.person_outline, size: 20, color: cores.textSecondary)
            : Text(
                letra,
                style: textos.labelLarge?.copyWith(color: cores.textSecondary),
              ),
      ),
    );
  }
}

/// O TITULO DA TELA DA CONTA, num ponto so.
///
/// Pedido do cliente (19/10): *"a tela do usuario, deve ter como titulo da
/// pagina na barra principal o slug do usuario"*.
///
/// **Slug de usuario nao existe, e nao e esquecimento.** A unica operacao que
/// define slug e de PET (`updatePetPublicProfile`), e nao esta implementada; e
/// a ADR-0025, item 2, **proibe expor slug de pessoa**. Apelido de usuario e
/// fatia propria: coluna, unicidade, palavras reservadas, regra de troca e o
/// problema de imitar outra pessoa. Ela esta sendo desenhada em paralelo.
///
/// O que existe e e dela: o **nome de exibicao** (`display_name`). E o titulo
/// de hoje.
///
/// **ESTE E O PONTO DE TROCA, e ele e um so.** Quando a fatia do apelido
/// descer, esta funcao passa a devolver o apelido e nenhuma tela muda. Nao ha
/// segunda copia: `AbaPerfil` chama daqui.
String tituloDaTelaDaConta(String? nomeDeExibicao) {
  final nome = nomeDeExibicao?.trim();
  if (nome == null || nome.isEmpty) {
    // **Conta sem nome existe hoje**: medido, 2 das 7 contas de hml nao tem
    // `display_name`. O estado tende a desaparecer -- o nome esta virando
    // obrigatorio no cadastro e nao apagavel depois --, mas ele existe agora e
    // um titulo vazio deixaria a barra sem nome nenhum.
    //
    // **`Minha conta`, e nao `Tutor`.** `Tutor` e rotulo da conversa de
    // achado, onde ele distingue dois papeis numa conversa; como titulo da
    // propria tela ele soaria como um papel atribuido a pessoa, e nao como o
    // lugar em que ela esta.
    return 'Minha conta';
  }
  return nome;
}

/// O estado vazio do sistema: o M3 nao define um, e este e composicao.
class EstadoVazio extends StatelessWidget {
  const EstadoVazio({
    required this.titulo,
    required this.explicacao,
    super.key,
    this.acao,
  });

  final String titulo;
  final String explicacao;
  final Widget? acao;

  @override
  Widget build(BuildContext context) {
    final cores = BichuColors.of(context).cores;
    final textos = Theme.of(context).textTheme;

    return Container(
      width: double.infinity,
      padding: const EdgeInsets.all(BichuEspaco.e6),
      decoration: BoxDecoration(
        color: cores.surfaceSunken,
        borderRadius: BorderRadius.circular(BichuRaio.lg),
        border: Border.all(color: cores.outline, width: BichuBorda.hairline),
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: <Widget>[
          Text(titulo, style: textos.titleLarge),
          const SizedBox(height: BichuEspaco.e2),
          Text(
            explicacao,
            style: textos.bodyLarge?.copyWith(color: cores.textSecondary),
          ),
          if (acao != null) ...<Widget>[
            const SizedBox(height: BichuEspaco.e6),
            acao!,
          ],
        ],
      ),
    );
  }
}
