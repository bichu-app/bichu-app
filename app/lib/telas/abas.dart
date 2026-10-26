import 'package:flutter/material.dart';
import 'package:go_router/go_router.dart';

import '../escopo.dart';
import '../roteamento/rotas.dart';
import '../sessao/controlador_de_sessao.dart';
import '../theme/bichu_tokens.g.dart';
import '../api/mural_api.dart';
import '../widgets/acao_de_criar_flutuante.dart';
import '../widgets/botao_primario.dart';
import '../widgets/carimbo_do_build.dart';
import '../widgets/faixa_de_aviso.dart';
import '../widgets/item_de_menu.dart';
import '../widgets/marca.dart';
import 'avisos/aviso_de_cadastro_incompleto.dart';
import 'avisos/antessala_de_aviso.dart';
import 'casca_com_abas.dart';
import 'conexoes/tela_minhas_conexoes.dart';
import 'mural/tela_do_mural.dart';
import 'perdido/lista_de_perdidos.dart';
import 'perfil/meus_achados.dart';
import 'perfil/meus_eventos.dart';
import 'perfil/meus_pets.dart';
import 'rede/secao_da_rede.dart';
import 'loja/vitrine_da_loja.dart';

/// Quem pode ver uma acao de CRIAR da comunidade.
///
/// **Regra unica, decidida pelo cliente em 18/10/2026**, nas palavras dele:
/// *"assim como o marcar um encontro (evento), essas acoes so devem ser
/// realizadas por usuarios cadastrados e validados, caso ao contrario o botao
/// nem aparece"*. Sessao **e** e-mail confirmado; qualquer outro estado nao
/// desenha nada -- nem botao, nem icone.
///
/// **Isto SUBSTITUI o comportamento anterior**, em que a porta aparecia sempre
/// e a tela de destino explicava a recusa com a saida que a resolve. As rotas
/// seguem alcancaveis por link profundo, e tela que recusa calada e pior do que
/// tela que recusa dizendo. O que mudou foi quem ve a PORTA.
///
/// **O impedimento de e-mail na tela de destino e CORTESIA, e nao a regra.** Ele
/// evita que a pessoa preencha um formulario que o servidor vai recusar; quem
/// garante a recusa e o servidor, no paragrafo abaixo. Por isso esta descricao
/// NAO afirma quais telas o tem: isso muda por entrega, e comentario que lista
/// o estado de outro arquivo envelhece sem ninguem notar -- foi exatamente
/// assim que o paragrafo seguinte precisou ser corrigido. Procure o enum
/// `_Impedimento` da tela em questao, que e onde a resposta mora.
///
/// **O caminho para validar nao depende desta porta, e isso foi conferido.** O
/// `AvisoDeCadastroIncompleto` desenha "Confirme seu e-mail" com `Reenviar` em
/// DUAS posicoes que nao saem da frente de ninguem: faixa de largura total no
/// topo de `Pets` (posicao 1) e item destacado no topo de `Perfil` (posicao
/// 2). Esconder a acao de criar nao fecha caminho nenhum de confirmacao.
///
/// **A trava E do servidor, e esta linha e so a porta.** As duas rotas da
/// comunidade recusam conta nao validada com `409
/// contact-channel-unverified` e `next_action: verify_email`:
/// `createNetworkEvent` por `bloqueiosParaCriarEncontro`
/// (`network/domain/encontro-da-comunidade.ts`) e `suggestDirectoryEntry` por
/// `temCanalVerificado` (`professionals/application/sugestao-do-diretorio.ts`).
/// Os dois `409` estao declarados no contrato, que escreve a mesma frase: "a
/// trava e do SERVIDOR; o botao escondido nao recusa quem chama a rota direto".
/// Medido em hml em 19/10/2026 no commit `458cd005`, com conta descartavel de
/// `email_verified: false`: **409 nas duas**.
///
/// **O que o servidor cobra e CANAL DE CONTATO verificado, e nao
/// `email_verified`** -- e e por isso que procurar `email_verified` em `src/`
/// nao acha a trava. O predicado e
/// `email_verified_at IS NOT NULL OR phone_verified_at IS NOT NULL`, escrito
/// com a mesma redacao nos dois lugares (`kysely-network-repository.ts` e
/// `kysely-canal-verificado-do-chamador.ts`): a metade do e-mail mora numa
/// coluna com sufixo `_at`, e nenhuma das duas metades aparece com aquele nome.
///
/// **Na pratica a regua do servidor bate com a daqui**, porque o telefone nunca
/// satisfaz o predicado: nao existe operacao de verificacao de telefone no
/// contrato, e a unica escrita de `phone_verified_at` em `src/` e para ZERAR a
/// coluna quando o telefone muda. Entao `usuario.emailVerificado` aqui concorda
/// com o servidor hoje -- **por ausencia de uma rota, e nao por acordo de
/// definicao**. No dia em que verificar telefone existir, uma conta com
/// telefone verificado e e-mail nao verificado passa no servidor e nao ve a
/// porta, e e esta linha que precisa mudar.
bool podeCriarNaComunidade(ControladorDeSessao sessao) {
  final usuario = sessao.usuario;
  return sessao.logado && usuario != null && usuario.emailVerificado;
}

/// Secao 1 — `Pets`. A casa dos perdidos, dos achados e das adocoes.
///
/// **Nao existe aba `Perdidos` nem aba `Encontrar`**, e nao e economia de
/// slot: pet perdido e pet para adocao sao o mesmo objeto do lado de quem usa,
/// com o mesmo cartao do 11.3 e a mesma listagem da secao 14. Duas abas
/// mostrando a mesma lista com filtros diferentes e como um app ensina que
/// navegar nao adianta.
///
/// Esta e tambem a secao de aterrissagem: `Inicio` saiu da barra e **nao virou
/// aba nenhuma**, porque cada secao e a home do proprio conteudo e nao ha tela
/// agregadora (UX 27.2).
class AbaPets extends StatelessWidget {
  const AbaPets({super.key});

  @override
  Widget build(BuildContext context) {
    final destino = CascaComAbas.porRota(Rotas.pets);
    final sessao = Escopo.of(context).sessao;

    return AnimatedBuilder(
      animation: sessao,
      builder: (context, _) {
        final usuario = sessao.usuario;
        final logado = sessao.logado;

        return TelaDeAba(
          // O titulo e o rotulo da aba, LOGADO E DESLOGADO (UX 25.7.2 e
          // 27.4.2). A BICHUS-195/196 trazia esta secao com o titulo `Bichu`
          // em vetor quando deslogada, e nao dava para ficar com os dois: a
          // BICHUS-164 e posterior e decide o contrario com a norma na mao --
          // `Inicio` deixou de existir, e "a mesma palavra nos dois lugares" e
          // o que faz a casca servir para conferir nomenclatura.
          //
          // O MECANISMO da 195/196 fica: `tituloEmMarca` continua em
          // `casca_com_abas.dart` e `MarcaLockup` continua sendo o logotipo em
          // vetor de `tela_de_abertura.dart`. O que nao fica e ligar a chave
          // AQUI. Ver a pergunta aberta na entrega desta integracao.
          raizDeSecao: true,
          titulo: destino.rotulo,
          // **O LEITOR DE QR SAIU DESTA BARRA em 19/10**, e a decisao e
          // dele: *"leve o icone de qr-code de escanear para a pagina do
          // perfil que tem relacao com as acoes do usuario."*
          //
          // Ele morava aqui como `acaoDeCriar`, com `Icons.qr_code_2`, desde
          // 18/10. O destino nao mudou e a porta nao foi duplicada: a tela da
          // conta **ja tinha** `Escanear uma tag`, nos dois estados de sessao
          // -- item de menu logado, botao secundario deslogado. Entao isto e
          // UNIFICACAO e nao acrescimo: **ficou uma porta so**, na pagina que
          // ele chama de "as acoes do usuario", alcancada pela foto da barra
          // de topo.
          //
          // **E ela continua alcancavel SEM CONTA, que era o risco.** A
          // autenticacao da rota do leitor e opcional e quem acha um animal
          // na rua pode nao ter conta; se a tela da conta so existisse
          // logada, esta mudanca teria escondido o leitor de quem mais
          // precisa dele. Medido: o ramo DESLOGADO de `AbaPerfil` desenha
          // `Escanear uma tag`, e a foto da barra de topo aparece deslogada.
          //
          // **O custo esta no relatorio:** o leitor saiu de 1 toque (icone
          // nesta barra) para 2 (foto -> `Escanear uma tag`).
          //
          // `Pets` ficou sem acao de secao NA BARRA, e o slot da barra
          // continua nulo -- nao entrou outro icone no lugar dela.
          //
          // **MAS A SECAO GANHOU A ACAO FLUTUANTE em 19/10/2026**, e o pedido
          // e dele: *"so faltou na pagina de pets o botao para adicionar um
          // novo pet perdido ou escanear a tag, gostei desse padrao"* --
          // *"esse padrao"* e a acao flutuante que ele acabou de ver em `Rede`
          // e no antigo `Perto`. Ver `acaoDeCriar`, abaixo.
          reforco: destino.reforcoDaPagina,
          // **AS TRES ACOES DE `Pets`: UMA direta e DUAS atras dela.**
          //
          // ## A decisao do cliente, em duas rodadas do mesmo dia
          //
          // Primeiro ele pediu a acao flutuante aqui: *"so faltou na pagina de
          // pets o botao para adicionar um novo pet perdido ou escanear a tag,
          // gostei desse padrao"*. Sao TRES as acoes que precisavam de casa --
          // os itens de `destino` VIVOS que a gaveta perdeu quando ela foi
          // ocultada no mesmo dia, `Escanear uma tag`, `Registrar achado
          // avulso` e `Cadastrar pet`.
          //
          // Elas nasceram as tres dentro de uma folha, atras de um alvo de
          // `add`. **Entao eu perguntei qual delas era "adicionar um novo pet
          // perdido", e a resposta foi: *"botao para escanear o pet"*.**
          //
          // Por isso `Escanear uma tag` saiu da folha: ela e o alvo de 56 dp
          // no canto, de **UM TOQUE**, e as outras duas ficaram atras do alvo
          // secundario ao lado. A conta de por que o secundario fica AO LADO e
          // nao acima -- e por que nao e pressao longa nem botao no corpo --
          // esta inteira em `AcoesDeCriarFlutuantes`, com os numeros.
          //
          // **O GLIFO E `qr_code_scanner`, e a distincao e a mesma do item da
          // gaveta que ele substitui:** `qr_code_scanner` e LER uma plaquinha;
          // `qr_code_2` e EXIBIR a propria. Esta porta le, e e por isso que o
          // glifo nao e o outro.
          //
          // **O ROTULO DIZ O VERBO, e nao "adicionar":** `Escanear uma tag` e
          // o que o toque faz, e e o mesmo texto do item de gaveta -- quem
          // usava a gaveta acha a acao pelo nome, e nao descobre que ela mudou
          // de lugar lendo uma palavra nova.
          //
          // **AS TRES NASCEM SEM CONTA, e isso e diferente da `Rede`.** A
          // regua de `podeCriarNaComunidade` (sessao E e-mail confirmado)
          // governa escrever sobre TERCEIRO, e nenhuma das tres e isso:
          //
          //   - `Escanear uma tag` e a excecao conhecida e DELIBERADA: a
          //     autenticacao da rota do leitor e opcional, e quem acha um
          //     animal na rua pode nao ter conta. Esconder o leitor de quem
          //     mais precisa dele seria o pior defeito possivel nesta secao --
          //     e agora ela e a acao PRINCIPAL, o que torna isso mais
          //     importante e nao menos.
          //   - `Registrar achado avulso` tem o mesmo dono: o achador. Ela ja
          //     era alcancavel sem conta pela gaveta de `Pets`.
          //   - `Cadastrar pet` leva a um assistente que pede conta na PROPRIA
          //     tela, com a saida que a resolve -- tela que recusa dizendo e
          //     melhor que porta que nao aparece.
          //
          // Por isso `acaoDeCriar` aqui NAO e condicional a sessao.
          //
          // **E `Marcar como perdido` NAO esta aqui, e a ausencia e medida:**
          // ela precisa saber QUAL pet, e vive no cartao de cada um, em
          // `Rotas.detalheDoPet`. Ela nunca foi item de gaveta e nao ficou sem
          // casa.
          // **O ALVO SECUNDARIO SAIU EM 20/10/2026, e quem decidiu foi ele.**
          //
          // Literal: *"na pagina pet, remova o icone dos ..., so deixe o de
          // escanear a tag"*. O glifo dos tres pontos era
          // `AcoesDeCriarFlutuantes.chaveDoSecundario`, e com ele saiu a folha
          // que ele abria -- `Registrar achado avulso` e `Cadastrar pet`.
          //
          // **AS DUAS ACOES NAO FICARAM SEM CASA, e elas sao o item 4 do mesmo
          // dia** (*"como o menu do perfil esta crescendo, vamos separar os
          // links por topicos/categorias"*):
          //
          //   | acao                      | casa de hoje                      |
          //   |---------------------------|-----------------------------------|
          //   | `Registrar achado avulso` | `Perfil` > grupo `Bichos na rua`  |
          //   | `Cadastrar pet`           | `Perfil` > grupo `Meus pets`      |
          //
          // `Registrar achado avulso` virou `ItemDeMenu` na tela da conta,
          // porque ela nao tinha NENHUMA outra porta em `lib/` -- medido por
          // busca de `Rotas.registrarAchado`, que aparecia so aqui, em
          // `rotas.dart` e na propria tela.
          //
          // **`Cadastrar pet` JA TINHA porta no `Perfil`, e nao ganhou uma
          // segunda:** o `BotaoPrimario` `Cadastrar meu pet`, dentro do bloco
          // `Meus pets`, empurra a MESMA `Rotas.cadastrarPet`. Por um
          // `ItemDeMenu` novo, a tela teria dois controles para a mesma rota a
          // um cabecalho de distancia. O que ela TINHA era um buraco: aquele
          // botao so existia em duas das seis fases do bloco, e nas outras
          // quatro a porta desaparecia. O conserto esta em `meus_pets.dart`,
          // nas fases -- ver a prosa de `_acaoDeCadastrar`.
          //
          // **O RESPIRO DO PE DA LISTA CONTINUA 72,00 dp, e isto foi
          // conferido**: a invasao e a do alvo mais alto da linha (56 dp de
          // desenho) mais os 16 dp de assentamento do `Scaffold`, e tirar o
          // segundo alvo da `Row` tira LARGURA do canto, nao altura. O
          // `_folgaDaAcaoFlutuante` de `TelaDeAba` continua pagando a conta
          // inteira.
          //
          // ## A decisao do cliente que criou esta porta, em duas rodadas
          //
          // Primeiro ele pediu a acao flutuante aqui: *"so faltou na pagina de
          // pets o botao para adicionar um novo pet perdido ou escanear a tag,
          // gostei desse padrao"*. **Entao eu perguntei qual delas era
          // "adicionar um novo pet perdido", e a resposta foi: *"botao para
          // escanear o pet"*.** Ela e a acao de **UM TOQUE** desde entao, e
          // com o alvo secundario fora ela e a UNICA -- que e literalmente o
          // que ele acabou de pedir.
          //
          // **O GLIFO E `qr_code_scanner`, e a distincao e a mesma do item da
          // gaveta que ele substitui:** `qr_code_scanner` e LER uma plaquinha;
          // `qr_code_2` e EXIBIR a propria. Esta porta le.
          //
          // **O ROTULO DIZ O VERBO, e nao "adicionar":** `Escanear uma tag` e
          // o que o toque faz, e e o mesmo texto do item de gaveta -- quem
          // usava a gaveta acha a acao pelo nome.
          //
          // **ELA NASCE SEM CONTA, e e a excecao conhecida e DELIBERADA:** a
          // autenticacao da rota do leitor e opcional, e quem acha um animal
          // na rua pode nao ter conta. Esconder o leitor de quem mais precisa
          // dele seria o pior defeito possivel nesta secao. Por isso
          // `acaoDeCriar` aqui NAO e condicional a sessao.
          //
          // **E `Marcar como perdido` NAO esta aqui, e a ausencia e medida:**
          // ela precisa saber QUAL pet, e vive no cartao de cada um, em
          // `Rotas.detalheDoPet`.
          acaoDeCriar: AcaoDeCriarFlutuante(
            icone: Icons.qr_code_scanner,
            rotulo: 'Escanear uma tag',
            aoTocar: () => context.push(Rotas.escanear),
          ),
          filhos: <Widget>[
            // A POSICAO 1 DO AVISO PERSISTENTE (BICHUS-75, criterio 1): faixa
            // de largura total logo abaixo do cabecalho, acima de tudo.
            //
            // A condicao mudou de `cadastroIncompleto` para
            // `!emailVerificado`, e a troca nao e cosmetica.
            // `cadastroIncompleto` e verdadeiro quando FALTA QUALQUER COISA --
            // telefone, nome, regiao de referencia --, entao quem verificou o
            // e-mail e nao preencheu o telefone continuava lendo "Confirme seu
            // e-mail" sobre um e-mail ja confirmado. O criterio 7 proibe isso
            // com todas as letras: com o e-mail verificado o aviso nao aparece
            // em lugar nenhum.
            if (logado && usuario != null)
              AvisoDeCadastroIncompleto(
                key: ValueKey<String>('aviso-inicio-${usuario.id}'),
                usuario: usuario,
              ),
            // `Cadastrar meu pet` NAO MORA AQUI (BICHUS-232, pedido do
            // cliente em 22/09 depois do primeiro teste em aparelho).
            //
            // Nao e preferencia de quem olhou: a UX 27.5.1 lista os dezesseis
            // sub-destinos de `Pets` e cadastro **nao esta entre eles**, e a
            // 27.5.5 lista `Cadastrar pet` em `Perfil` com todas as letras. O
            // botao entrou na implementacao, e nao na especificacao. `Pets` e
            // a vizinhanca (perdidos, achados, adocoes); cadastrar o **meu**
            // pet e custodia, e custodia e conta.
            //
            // A acao mora em `Perfil` > `Meus pets`, onde ela existe
            // SEMPRE -- com a lista vazia e com a lista cheia. As duas metades
            // sao uma coisa so: tirar daqui sem tornar permanente la apagaria
            // o unico caminho do app para cadastrar o segundo pet.
            //
            // A PORTA PRIMARIA DO LEITOR DE QR (UX 27.5.6) **SUBIU PARA A
            // BARRA DE TOPO** em 18/10/2026, e esta no `acaoDeCriar` acima.
            //
            // Ela continua vivendo nesta secao e nao em `Perfil`, porque quem
            // acha um cachorro na rua nao pensa a palavra "Perfil" (Nielsen
            // 2), e continua a UM toque de distancia: o caminho nao ficou mais
            // longo, mudou de lugar na tela. As DUAS portas do 27.5.6 seguem
            // existindo -- esta, primaria, e a de conta em `Perfil`, que e
            // item de menu. Nenhuma das duas fechou.
            //
            // O que saiu daqui foi a FORMA: um `BotaoSecundario` de largura
            // total, 48 dp de altura mais 24 dp de folga.
            //
            // **AS DUAS PORTAS DE `Adoções` SAIRAM (19/10).**
            //
            // Nao e casca vazia: **nao existe rota de adocao no contrato** --
            // confirmado por duas leituras independentes. As portas prometiam
            // e abriam uma tela que dizia estar em construcao, e o cliente
            // mandou fechar os defeitos listados, com este na lista.
            //
            // **A ROTA E A TELA FICAM**, de proposito: link profundo e
            // endereco e nao depende de haver porta. Quem some e so o
            // controle que promete. Quando a rota do contrato existir, as duas
            // portas voltam aqui e no rodape do `Perto`, e o inventario de
            // `gaveta_de_secoes.dart` volta de `planejada` para `existe`.
            //
            // A isca de que elas nao voltam esta em
            // `test/telas/portas_de_adocoes_test.dart`.
            // O `EstadoVazio` "Nenhum pet cadastrado ainda" era renderizado
            // **sem condicional nenhuma**, numa tela que nao sabia listar pet:
            // o tutor cadastrava e continuava lendo que nao tinha nenhum. E o
            // defeito que a BICHUS-62 fechou, e a saida nao foi condicionar a
            // frase -- foi a tela parar de afirmar coisa sobre dado que ela nao
            // carrega. A lista de pets do tutor mora em `Perfil` > `Meus pets`
            // (UX 27.6).
            //
            // Aqui vale a mesma regra, e por isso este texto **nao** diz
            // "nenhum pet perdido por aqui agora": o app nao chama rota nenhuma
            // de listagem de perdidos, entao ele nao sabe se ha zero ou
            // trezentos. Diz o que vai existir e que ainda nao existe (25.7.3).
            // A LISTA DE PERDIDOS, e a casca honesta SAI.
            //
            // O `EstadoVazio` que estava nesta linha dizia "a lista de pets
            // perdidos esta em construcao", e a frase era verdadeira: o app
            // nao chamava rota nenhuma de listagem, porque `listPublicLostPets`
            // estava no contrato e **nao tinha rota** -- era a ultima linha de
            // `OPERACOES_AINDA_SEM_ROTA`.
            //
            // A rota existe agora, e o estado vazio nao sumiu: ele mudou de
            // dono, como o da `Rede`. Quem o mostra e a propria lista, e so
            // quando o servidor responde que nao ha caso aberto no recorte --
            // afirmacao medida, e nao afirmacao sobre dado que a tela nao
            // carrega. E ele virou UMA LINHA, pelo pedido do cliente de
            // 18/10/2026.
            const ListaDePerdidos(),
            // `Entrou como <e-mail>` e `Ja tenho conta` TAMBEM SAIRAM
            // (BICHUS-232). Os dois eram identidade e acao de conta dentro da
            // secao de conteudo, e os dois eram **duplicata**: o e-mail com o
            // estado de confirmacao ja e um `ListTile` de `Perfil`, e o login
            // ja e `Entrar` e `Criar conta` em `Perfil` deslogado. Nao se
            // perdeu caminho nenhum; parou de haver dois.
          ],
        );
      },
    );
  }
}

/// Secao 2 — `Rede`. **Eventos e quem atende bem.**
///
/// ## A SECAO REUNIDA (decisao do cliente, 19/10/2026)
///
/// `Perto` deixou de ser secao e o conteudo dela virou a aba `Comunidade`
/// desta. A secao tem **duas abas**: `Eventos` (a agenda, que era esta secao)
/// e `Comunidade` (profissionais, estabelecimentos e ONGs, que era `Perto`).
///
/// **O nome da secao e `Rede`, e a escolha e de MEDIDA.** `Comunidade` pede
/// 113,25 dp num slot de barra de 64,00 e reprova em 320, 375 e 412 dp -- a
/// mesma parede que recusou `Mensagens` (103,67 dp). `Rede` pede 45,08 e cabe
/// nos tres. Como ABA, `Comunidade` nao disputa slot de 64 dp.
///
/// ## ESTA CLASSE E UMA LINHA, e isso e deliberado
///
/// Quem monta a secao e [SecaoDaRede], em `rede/secao_da_rede.dart`, e nao
/// esta classe. A razao e a acao flutuante: ela **troca com a aba** -- `Criar
/// evento` em `Eventos`, `Indicar` em `Comunidade` --, e
/// `TelaDeAba.acaoDeCriar` e um parametro e nao um slot publicavel. Quem monta
/// a casca tem de saber qual aba esta na frente, entao o estado da aba e a
/// casca moram juntos, e este arquivo nao engorda com eles.
///
/// A conta completa das cinco abas antigas em duas mais filtro, da `TabBar`
/// rolavel e das duas acoes flutuantes que passaram a ser uma esta toda em
/// [SecaoDaRede].
///
/// ## O que esta secao NAO mostra, e continua nao mostrando
///
/// **A secao de comunidade NAO mostra a comunidade, e isso e o ADR-0025.** Nao
/// ha lista de presenca, em lugar nenhum, nao ha mapa e nao ha ordenacao por
/// distancia entre pessoas. Cada uma dessas ausencias fecha a inferencia que o
/// item 7 do ADR-0010 proibe -- que dois pets sao do mesmo tutor --, e o custo
/// delas esta escrito no ADR: um encontro de cachorros em que nao se sabe quem
/// vai e mais pobre do que o cliente descreveu, e essa pobreza e deliberada.
///
/// **Check-in e galeria de fotos sairam desta versao** (BICHUS-251, decisao do
/// cliente de 23/09/2026) e voltam depois pela branch
/// `guarda/rede-checkin-galeria`.
///
/// **Sem mapa**, por decisao de 17/09: o Maps cobra por carregamento de mapa e
/// o componente criaria precedente contra o ADR-0010. E perfil de profissional
/// **nao e criado pela comunidade**, por decisao de 21/09 -- a comunidade
/// convida e avalia (emenda 1 do ADR-0011).
class AbaRede extends StatelessWidget {
  const AbaRede({super.key});

  /// Qual aba o endereco pede, ou nulo quando ele nao pede nenhuma.
  ///
  /// **A leitura mora AQUI, e nao dentro de [SecaoDaRede]**, e a diferenca nao
  /// e estetica: os ramos da casca ficam MONTADOS (o `IndexedStack` deixa o
  /// inativo em `Offstage`), e um `GoRouterState.of` lido de dentro de um ramo
  /// inativo devolve o endereco da tela que esta na FRENTE -- a `Rede` leria o
  /// `?aba=` de quem esta no Mural. Aqui a leitura acontece no rebuild que o
  /// roteador provoca, e o valor desce por parametro.
  ///
  /// Valor desconhecido devolve nulo, e a secao abre em `Eventos`.
  static AbaDaSecaoRede? abaPedidaPor(BuildContext context) {
    final pedida = GoRouterState.of(
      context,
    ).uri.queryParameters[Rotas.parametroDaAbaDaRede];
    if (pedida == null) return null;
    for (final aba in AbaDaSecaoRede.values) {
      if (aba.name == pedida) return aba;
    }
    return null;
  }

  @override
  Widget build(BuildContext context) =>
      SecaoDaRede(abaInicial: abaPedidaPor(context));
}

/// **`AbaPerto` NAO EXISTE MAIS, e a ausencia e o contrato (19/10/2026).**
///
/// A secao `Perto` foi absorvida pela `Rede`: o corpo dela -- a lista do
/// diretorio -- e a aba `Comunidade`, e a porta de `Indicar` e a acao
/// flutuante daquela aba. Nada foi apagado de conteudo; o que saiu foi a
/// SECAO.
///
/// **Apagar a classe e deliberado.** Deixa-la, mesmo sem rota, seria uma tela
/// de secao sem lugar na barra -- e no dia em que alguem registrasse `/perto`
/// de novo ela voltaria a abrir, com o titulo de uma secao que o produto nao
/// tem. O portao e o grupo `nao ha rota orfa para a secao que saiu` de
/// `test/telas/gaveta_oculta_e_barra_nova_test.dart`, que mede as duas coisas:
/// que `Perto` nao esta no registro de secoes, e que `/perto` nao resolve.
///
/// **O que mudou de casa, para quem procurar:** `lista_do_diretorio.dart`,
/// `minhas_indicacoes.dart`, `pagina_do_local.dart` e `sugerir_profissional.dart`
/// **continuam em `lib/telas/perto/`** e nenhuma delas mudou de conteudo. A
/// pasta nao foi renomeada de proposito: ha tres frentes editando arquivos
/// dela nesta mesma rodada, e mover a pasta trocaria uma mudanca de
/// composicao por um conflito textual em cada arquivo. O nome da pasta nao
/// aparece em tela nenhuma.
///
/// `corpo_do_perto.dart` -- a casca das duas abas de `Perto` -- **foi
/// apagado**: as abas dele nao existem mais (uma virou `Comunidade`, a outra
/// virou porta), e deixar a casca seria uma segunda definicao de onde as abas
/// moram.

/// Secao 3 — `Mural`. **O LUGAR da linha do tempo.**
///
/// ## O que esta frente construiu, e o que ela NAO construiu
///
/// Decisao do cliente de 19/10/2026: a secao de publicacoes do usuario.
/// **Esta frente construiu o LUGAR** -- o slot na barra (`Mural` pede 50,90 dp
/// num slot de 64,00, medido), o ramo do `IndexedStack`, a rota
/// `Rotas.mural` e esta tela em estado inicial honesto.
///
/// **Publicar, a linha do tempo, curtir, comentar e seguir sao de OUTRA
/// FRENTE**, que roda em paralelo e cria `user_publications`, o contrato e as
/// operacoes. O nome da rota foi combinado com ela e e estavel: `/mural`.
///
/// ## A ACAO FLUTUANTE `Publicar` EXISTE DESDE 20/10/2026
///
/// A frente de 19/10 **nao** a desenhou, e estava certa: medido naquela arvore,
/// nao existia operacao de publicar -- `user_publications` nao existia e nao
/// havia rota de linha do tempo nem de publicacao no contrato. O criterio 2 da
/// BICHUS-62 proibe renderizar acao sem destino, nem habilitada nem
/// desabilitada, e um `Publicar` ali abriria o que?
///
/// **Agora ela tem destino** (`Rotas.publicarNoMural`, que leva a
/// `POST /me/publications`), e por isso ela nasce -- no mesmo `acaoDeCriar` em
/// que `Rede` tem a sua, com `Icons.post_add`, como o desenho previa.
///
/// **A REGUA E `podeCriarNaComunidade`** (sessao E e-mail confirmado), a mesma
/// de `Marcar` e `Indicar`, e pelo mesmo motivo: publicar e escrever no feed de
/// terceiros, e o servidor recusaria sem canal de contato verificado. Sem
/// sessao a porta **nao nasce** -- nao nasce desabilitada, porque controle sem
/// desfecho nao se desenha.
///
/// ## `casca`, e nao `existe` nem `planejada`
///
/// O estado declarado no registro de secoes e `EstadoDaSecao.casca` -- "tela
/// sem conteudo mas com saida real". `existe` obrigaria a secao a ter
/// conteudo, e ela nao tem; `planejada` a esconderia do build de ENTREGA
/// (`visiveisEm`), e o cliente pediu o LUGAR dela na barra.
class AbaMural extends StatefulWidget {
  const AbaMural({super.key});

  @override
  State<AbaMural> createState() => _AbaMuralState();
}

class _AbaMuralState extends State<AbaMural> {
  /// Quantas vezes a pessoa publicou nesta sessao da tela.
  ///
  /// Ele vira a `Key` de [CorpoDoMural], e e assim que a linha do tempo recarrega
  /// depois de publicar: a tela de publicar e IRMA da casca (ela empurra e
  /// cobre), entao voltar dela nao remonta este ramo -- o `IndexedStack` manteve
  /// tudo montado. Sem isto a pessoa publicaria, voltaria, e nao veria o que
  /// acabou de escrever: o defeito que a propria decisao do cliente sobre o
  /// Mural existe para nao ter.
  ///
  /// Uma `Key` nova, e nao um metodo chamado por `GlobalKey`: a `GlobalKey`
  /// atravessaria a fronteira da tela e deixaria duas donas do mesmo estado.
  int _publicacoes = 0;

  Future<void> _abrirPublicar() async {
    final publicou = await context.push<bool>(Rotas.publicarNoMural);
    if (!mounted) return;
    if (publicou == true) setState(() => _publicacoes += 1);
  }

  @override
  Widget build(BuildContext context) {
    final destino = CascaComAbas.porRota(Rotas.mural);
    final escopo = Escopo.of(context);
    final sessao = escopo.sessao;
    return TelaDeAba(
      raizDeSecao: true,
      titulo: destino.rotulo,
      // **A LINHA DE REFORCO NAO E DESENHADA**, como nas outras quatro: o
      // cliente removeu as cinco frases de apoio do corpo, nominalmente, em
      // 18/10/2026. Uma secao nova nao repoe o que ele acabou de mandar
      // tirar. O texto continua no REGISTRO, porque ele e a outra metade do
      // nome acessivel da aba.
      reforco: null,
      // A PORTA DE PUBLICAR. Ver a prosa desta classe: ela so nasce com sessao
      // E e-mail confirmado, e nunca desabilitada.
      acaoDeCriar: podeCriarNaComunidade(sessao)
          ? AcaoDeCriarFlutuante(
              icone: Icons.post_add,
              rotulo: 'Publicar',
              aoTocar: _abrirPublicar,
            )
          : null,
      filhos: <Widget>[
        () {
          // UMA porta, DUAS interfaces estreitas: a tela que desenha nao
          // alcanca `apagar`, e o cartao que curte nao alcanca `publicar`. E a
          // mesma fiacao de `Rotas.minhaVitrine`.
          final porta = MuralApi(escopo.api);
          return CorpoDoMural(
            key: ValueKey<int>(_publicacoes),
            leitura: porta,
            interacao: porta,
          );
        }(),
      ],
    );
  }
}

/// Secao 4 — `Loja`. A vitrine curada que leva a loja do parceiro.
///
/// **A casca honesta saiu: a secao tem dado.** O `EstadoVazio` "Loja esta em
/// construcao" era o certo enquanto nao havia tabela nem rota;
/// `GET /store/items` existe, e a vitrine e [VitrineDaLoja]. O estado vazio
/// nao sumiu, mudou de dono: quem o mostra agora e a propria lista, e so
/// quando o servidor responde que nao ha produto.
///
/// **A plaquinha NAO entra aqui, e a ausencia e decisao de produto.** A
/// explicacao antiga prometia "a plaquinha de reposicao", e a secao C da
/// BICHUS-185 decidiu o contrario: a Loja do MVP e vitrine de parceiro, e
/// nenhum parceiro vende plaquinha do Bichu. Um item sem destino seria o unico
/// da vitrine que nao abre nada, num componente cuja unica acao e abrir algo.
/// Como um tutor consegue uma plaquinha continua em aberto, e e do cliente.
///
/// **Carrinho, pedido e pagamento continuam fora** (criterio 5), e agora isso
/// e verificavel e nao prometido: nao ha campo no contrato, coluna no banco
/// nem widget na tela.
class AbaLoja extends StatelessWidget {
  const AbaLoja({super.key});

  @override
  Widget build(BuildContext context) {
    final destino = CascaComAbas.porRota(Rotas.loja);
    return TelaDeAba(
      raizDeSecao: true,
      titulo: destino.rotulo,
      // **A LINHA DE REFORCO NAO E MAIS DESENHADA** (pedido do cliente,
      // 17/10/2026: *"remova o produtos escolhidos pelo bichu, que abrem no
      // site do parceiro"*).
      //
      // O texto continua no REGISTRO (`CascaComAbas.destinos`), e nao foi
      // apagado de la de proposito: ele e a outra metade do nome acessivel da
      // aba -- o rotulo encurtou para quatro letras e o significado foi para
      // o reforco (UX 27.7) --, e o portao de
      // `test/telas/casca_de_cinco_secoes_test.dart` cobra que todo destino
      // tenha um. O que saiu foi a linha na TELA.
      reforco: null,
      filhos: const <Widget>[VitrineDaLoja()],
    );
  }
}

/// Secao 5 — `Perfil`. A conta do tutor. Navegavel deslogado.
///
/// **Sem linha de termos e privacidade, e isso e decisao do cliente** (teste
/// em aparelho de 22/09/2026, nas palavras dele: "a pagina do perfil nao deve
/// ter esse termos de uso e privacidade, apenas na pagina de cadastro").
///
/// O que havia aqui era um `TextButton` com `onPressed: null` nos dois
/// estados da aba, logado e deslogado: um controle que se anunciava tocavel e
/// nao levava a lugar nenhum. O lugar dos dois documentos e a F1.1, onde eles
/// sao o objeto do aceite e tem link que abre. Repor a linha aqui reprova a
/// isca de `app/test/telas/termos_so_no_cadastro_test.dart`.
class AbaPerfil extends StatelessWidget {
  const AbaPerfil({super.key});

  @override
  Widget build(BuildContext context) {
    final destino = CascaComAbas.porRota(Rotas.perfil);
    final sessao = Escopo.of(context).sessao;

    return AnimatedBuilder(
      animation: sessao,
      builder: (context, _) {
        if (sessao.estado != EstadoDaSessao.logado) {
          return TelaDeAba(
            raizDeSecao: true,
            titulo: destino.rotulo,
            reforco: destino.reforcoDaPagina,
            filhos: <Widget>[
              // A MARCA NO ALTO DA PORTA DE ENTRADA (pedido do cliente,
              // 17/10/2026: "coloque a imagem da identidade visual na pagina
              // do perfil para entrar").
              //
              // E o `MarcaLockup` que `widgets/marca.dart` ja desenha a partir
              // de `design/marca/vetor/lockup-sem-descritor.svg`: a identidade
              // que o repositorio ja tem, resolvida contra os papeis de cor do
              // tema. Nao e asset novo -- nao pesa um byte no APK e acompanha
              // claro e escuro sozinho, porque a tinta sai de `BichuCores` e
              // nao de um PNG assado numa cor so.
              //
              // **Nao e a linguagem do site.** As pecas expressivas da pasta
              // da marca (a ilustracao de tres pessoas, o cartao de frase
              // manuscrita) sao do institucional; o que entra aqui e o
              // logotipo, que e vocabulario do app e esta no §8.4.
              const _MarcaDoPerfilDeslogado(),
              BotaoPrimario(
                rotulo: 'Entrar',
                aoTocar: () => context.push(Rotas.entrar),
              ),
              const SizedBox(height: BichuEspaco.e4),
              BotaoSecundario(
                rotulo: 'Criar conta',
                aoTocar: () => context.push(Rotas.criarConta),
              ),
              const SizedBox(height: BichuEspaco.e4),
              // A porta de conta do leitor existe deslogado tambem: escanear
              // uma tag nao exige sessao, e esconder o leitor de quem nao tem
              // conta e o oposto do que a cunha do produto precisa.
              BotaoSecundario(
                rotulo: 'Escanear uma tag',
                aoTocar: () => context.push(Rotas.escanear),
              ),
            ],
          );
        }

        return TelaDeAba(
          raizDeSecao: true,
          // O TITULO E O NOME DA PESSOA (19/10), e nao a palavra `Perfil`.
          //
          // Pedido do cliente: *"a tela do usuario, deve ter como titulo da
          // pagina na barra principal o slug do usuario"*. Slug de usuario nao
          // existe e esta PROIBIDO de existir por ora (ADR-0025, item 2:
          // nao expor slug de pessoa); o que existe e e dela e o nome de
          // exibicao. `tituloDaTelaDaConta` e o PONTO DE TROCA unico: quando a
          // fatia do apelido descer, ela passa a devolver o apelido e nenhuma
          // tela muda.
          titulo: tituloDaTelaDaConta(sessao.usuario?.nome),
          reforco: destino.reforcoDaPagina,
          filhos: <Widget>[
            // -----------------------------------------------------------------
            // A ORDEM DOS BLOCOS (18/10/2026, pedido do cliente)
            //
            // Literal: *"Coloque a secao meus pets como o primeiro item dessa
            // pagina e depois traga os dados de conta. O sair da conta deve
            // ser sempre a ultima opcao do menu"*.
            //
            // A ordem desta lista E a ordem na tela: `TelaDeAba` entrega
            // `filhos` a um `ListView` vertical sem reordenacao nenhuma. Por
            // isso ela esta escrita aqui de cima para baixo, e nao espalhada:
            // 1) as faixas, 2) `Meus pets`, 3) o grupo `Conta`,
            // 4) `Sair da conta` -- ultimo, sempre.
            //
            // **AS FAIXAS FICAM ACIMA DE `Meus pets`, e e escolha medida.**
            // Elas nao sao itens: sao condicionais, e saem da arvore de quem
            // confirmou o e-mail e nao negou o aviso -- para essa pessoa, que
            // e o estado comum, `Meus pets` E o primeiro elemento da tela.
            // Empurra-las para depois de uma lista de ate 20 cartoes as
            // levaria para baixo da dobra, e a faixa de cadastro incompleto e
            // justamente o caminho de quem ainda nao validou os dados: com as
            // acoes de criar escondidas de quem nao validou, ela e o que sobra
            // para a pessoa descobrir o que fazer. A POSICAO 2 da BICHUS-75
            // (criterio 2) diz "item destacado no TOPO da lista", e um
            // destaque abaixo do bloco que ele comenta seria nota de rodape.
            // -----------------------------------------------------------------
            if (sessao.usuario != null)
              AvisoDeCadastroIncompleto(
                key: ValueKey<String>('aviso-perfil-${sessao.usuario!.id}'),
                usuario: sessao.usuario!,
              ),
            // A saida de quem negou o aviso (UX 10.1, BICHUS-24). As duas
            // faixas ficam juntas, no alto: faixa nao e botao, e o cliente
            // nao reclamou delas -- ele reclamou da pilha de botoes.
            const _AvisoPorPertoDesligado(),
            // `Perfil` > `Meus pets`: o destino que a secao 27.6 do UX fixou
            // para os cartoes da BICHUS-62, agora o PRIMEIRO bloco da pagina.
            // A chave e por conta para que a troca de usuario reconstrua o
            // estado em vez de reaproveitar o que estava carregado para a
            // anterior.
            //
            // **Continua CONTEUDO, e nao item de menu.** A lista de pets e o
            // corpo da secao: um item `Meus pets` levaria a uma tela que nao
            // existe, e inventar o endereco dela seria criar destino para uma
            // tela que nao ha (e o que o registro de sub-destinos ja diz,
            // palavra por palavra, sobre esta linha). E os cartoes sao o UNICO
            // caminho do app ate `Rotas.detalheDoPet`, onde moram o QR da
            // plaquinha e `Marcar como perdido`: troca-los por um item fecharia
            // o caminho mais critico do produto. Subir o bloco para o topo
            // ABRE esse caminho em vez de fecha-lo -- ele era o ultimo da
            // pagina, abaixo de tres linhas de menu.
            // **O TETO DE TRES E O `Ver todos`** (22/10/2026, pedido do
            // cliente): *"onde lista os pets, inclua um botao ver todos no
            // canto direito, na frente do meus pets, quando a quantidade de
            // pets do usuario for maior do que 3"*.
            //
            // O numero mora em `MeusPets.tetoDoPerfil` e nao escrito aqui: um
            // literal `3` neste arquivo e outro no teste divergiriam no dia em
            // que ele pedisse quatro. O botao aparece com MAIS de tres, abre
            // `Rotas.meusPets` e la o MESMO widget desenha a lista inteira --
            // nao ha segunda lista de pet.
            //
            // **O teto nao encurtou a leitura**: `GET /pets` continua vindo
            // inteiro, e e o que faz a secao saber que ha mais e o cache
            // servir as duas telas.
            MeusPets(
              key: ValueKey<String>('meus-pets-${sessao.usuario?.id ?? ''}'),
              cache: Escopo.of(context).cacheDeMeusPets,
              teto: MeusPets.tetoDoPerfil,
            ),
            // O VAO ENTRE BLOCOS, `e6`, que e o que a casca usa entre a linha
            // de reforco e o corpo e o que `Meus pets` usa entre os cartoes e
            // a acao permanente. Sem ele o hairline do primeiro `ItemDeMenu`
            // encostava no bloco de cima e os dois grupos leem como um.
            const SizedBox(height: BichuEspaco.e6),
            // -----------------------------------------------------------------
            // O MENU DA CONTA (18/10/2026, pedido do cliente)
            //
            // Literal: *"Essa pagina inicial atual, deveria ter apenas os
            // menus para realizar as acoes e nao todos os botoes nessa
            // pagina"*. O que havia aqui eram tres botoes de contorno de
            // largura total -- `Escanear uma tag`, `Sair da conta` e, dentro
            // de `Meus pets`, `Marcar como perdido` -- mais um `ListTile`
            // MUDO com o e-mail, que se parecia com um item de menu e nao
            // levava a lugar nenhum.
            //
            // **Nenhuma acao foi apagada.** Cada botao virou item, com o mesmo
            // rotulo e o mesmo destino; o `ListTile` mudo ganhou destino e
            // virou `Meus dados`, que e a tela nova. `Cadastrar meu pet`
            // continua BOTAO PRIMARIO, e isso nao e descuido: ela e a acao
            // primaria desta tela e o portao de
            // `cadastro_nao_mora_em_pets_test.dart` cobra `FilledButton` com
            // esse rotulo nos dois estados da lista -- com a acao fora de
            // `Pets`, este e o unico caminho do app para cadastrar o proximo
            // pet.
            // -----------------------------------------------------------------
            // =================================================================
            // O MENU POR TOPICOS (20/10/2026, pedido do cliente)
            // =================================================================
            //
            // Literal: *"como o menu do perfil esta crescendo, vamos separar os
            // links por topicos/categorias"*.
            //
            // **A PERGUNTA QUE O AGRUPAMENTO RESPONDE E "o que eu vim fazer
            // aqui", e nao "o que o programa tem".** Era uma pilha de seis
            // linhas iguais entre o bloco de pets e o `Sair da conta`, e com o
            // item novo do mesmo dia seriam sete -- `Meus dados`, `Escanear uma
            // tag`, `Meus achados`, `Pedidos de conexao`, `Pessoas bloqueadas`,
            // `Meus eventos` e `Registrar achado avulso`. Agrupar por objeto
            // ("telas de pessoa", "telas de lista") daria tres grupos que
            // descrevem o CODIGO; os quatro abaixo descrevem intencoes.
            //
            //   | grupo           | a intencao, em uma frase                 |
            //   |-----------------|------------------------------------------|
            //   | `Meus pets`     | cuidar dos MEUS bichos                   |
            //   | `Conta`         | mexer em mim: meus dados e quem eu nao   |
            //   |                 | quero ver                                |
            //   | `Bichos na rua` | o bicho que NAO e meu                    |
            //   | `Comunidade`    | a minha gente e os encontros             |
            //
            // **A ORDEM DOS GRUPOS E POR URGENCIA, e nao alfabetica nem por
            // tamanho.** Depois do que e meu (`Meus pets`) e de quem eu sou
            // (`Conta`), vem o bicho que precisa de ajuda AGORA -- ler a
            // plaquinha de um cachorro na rua e a coisa mais urgente que este
            // produto faz -- e so depois as pessoas e os encontros, que
            // esperam.
            //
            // **E a ordem tambem e CONTRATO com dois portoes.** `Conta` tem
            // de vir antes de `Meus dados`, `Meus dados` antes de `Escanear
            // uma tag` (`ordemDecididaDoPerfil`, em
            // `perfil_ordem_dos_itens_test.dart`) e `Meus eventos` depois de
            // `Meus achados` (`meus_eventos_e_cancelar_test.dart`). Os tres
            // sao decisoes do cliente de dias anteriores, e o agrupamento foi
            // desenhado para caber nelas em vez de reescreve-las.
            //
            // **`Meus pets` ja era grupo**, e e ele que `MeusPets` desenha
            // acima com o proprio `TituloDeGrupoDeMenu`: os cartoes e
            // `Cadastrar meu pet`. Ele nao mudou de nome nem de conteudo, e
            // continua sendo a casa declarada de `Cadastrar pet`.
            //
            // **NENHUM GRUPO TEM UM ITEM SO**, e isso foi conferido antes de
            // escolher os nomes: grupo de um item e um cabecalho que nao
            // agrupa nada -- custa uma linha de leitura e nao responde
            // pergunta nenhuma. Sao 2, 2 e 3 itens, mais o bloco de pets.
            // **O orfao que quase houve era `Meus dados`**: com `Pessoas
            // bloqueadas` em `Comunidade`, `Conta` ficaria sozinho. Ele nao
            // ficou, e a razao esta no grupo.
            //
            // **`Sair da conta` fica FORA de grupo e por ultimo** (pedido
            // literal dele, de 18/10: *"o sair da conta deve ser sempre a
            // ultima opcao do menu"*). Por-lo dentro de `Conta` o enterraria no
            // meio da pagina.
            //
            // **O CABECALHO E CABECALHO PARA QUEM NAO VE, e nao texto
            // pequeno:** `TituloDeGrupoDeMenu` embrulha o texto em
            // `Semantics(header: true)` e **nao tem `onTap` nenhum** -- quem
            // navega por cabecalho no VoiceOver e no TalkBack pula de grupo em
            // grupo, e um cabecalho tocavel seria um controle que nao faz nada.
            // O portao e `test/telas/barra_fixa_em_toda_tela_test.dart`, grupo
            // `(e)`, com contraprova.
            //
            // ## Historia dos itens, que o agrupamento nao apaga
            //
            // O menu nasceu em 18/10 do pedido *"Essa pagina inicial atual,
            // deveria ter apenas os menus para realizar as acoes e nao todos os
            // botoes nessa pagina"*: tres botoes de contorno de largura total e
            // um `ListTile` MUDO com o e-mail viraram itens. Nenhuma acao foi
            // apagada entao, e nenhuma e apagada agora -- os sete itens trocam
            // de GRUPO e nao de rotulo nem de destino, porque quem achava a
            // acao pelo texto continua achando.

            // -----------------------------------------------------------------
            // GRUPO `Conta`: mexer em mim
            // -----------------------------------------------------------------
            //
            // **Os dois itens respondem a mesma intencao, e nao e obvio ate
            // dizer:** `Meus dados` e quem eu sou para o app, e `Pessoas
            // bloqueadas` e quem eu **recusei** -- as duas coisas que so a
            // propria pessoa mexe, e nenhuma delas e sobre comunidade. Bloqueio
            // nao e um ato de comunidade: e uma configuracao da conta, e **e o
            // UNICO lugar de onde o desbloqueio sai** (ver a prosa do item).
            const TituloDeGrupoDeMenu('Conta'),
            // **SO O TITULO** (18/10/2026, literal do cliente: *"na pagina do
            // perfil, não traga o e-mail no menu, deixe apenas o titulo meus
            // dados"*).
            //
            // O item tinha linha de apoio com o e-mail e a situacao de
            // confirmacao, e ela era HERANCA do `ListTile` mudo que o item
            // substituiu. O cliente nomeou a linha e ela saiu, com a funcao
            // `_apoioDosDados` junto, para a linha nao ter de onde voltar.
            //
            // **A FAIXA DE CADASTRO INCOMPLETO NAO E ESTA LINHA E NAO SAIU.**
            // `AvisoDeCadastroIncompleto`, com o `Reenviar`, continua no TOPO
            // desta mesma pagina (POSICAO 2 da BICHUS-75). Ela e outra coisa: a
            // linha de apoio era ESTADO ESCRITO, e a faixa e CAMINHO.
            //
            // O rotulo `Meus dados` NAO mudou: ele esta em tres portoes e na
            // tela `/perfil/dados` que este toque abre. **E ele e a porta de
            // `Minhas fotos`**, que nao e item deste menu e nunca foi -- medido
            // nesta arvore: `Rotas.minhaVitrine` sai de `tela_dados_pessoais`
            // e de mais nenhuma tela.
            ItemDeMenu(
              rotulo: 'Meus dados',
              aoTocar: () => context.push(Rotas.dadosPessoais),
            ),
            // `Pessoas bloqueadas` -- e ela tinha a GAVETA COMO UNICA PORTA
            // ate 19/10 (medido: `Rotas.pessoasBloqueadas` aparecia so em
            // `gaveta_de_secoes.dart`, em `rotas.dart` e dentro da propria
            // tela).
            //
            // **E ela e a mais critica deste menu caso se perdesse.** O
            // bloqueio e simetrico no servidor: quem bloqueia alguem passa a
            // receber `404` no perfil dessa pessoa, e o `Desbloquear` morava
            // dentro do menu daquele perfil -- que nunca mais abre. Esta lista
            // E o unico lugar de onde o desbloqueio sai. Sem porta para ela,
            // **bloquear voltaria a ser irreversivel pelo aplicativo**.
            //
            // **POR QUE EM `Conta` E NAO EM `Comunidade`:** ninguem vem aqui
            // "ver os bloqueados"; vem DESFAZER um bloqueio. Isso e ajuste da
            // propria conta, do mesmo tipo de `Meus dados`.
            ItemDeMenu(
              rotulo: 'Usuários bloqueados',
              aoTocar: () => context.push(Rotas.pessoasBloqueadas),
            ),
            const SizedBox(height: BichuEspaco.e6),
            // -----------------------------------------------------------------
            // GRUPO `Bichos na rua`: o bicho que NAO e meu
            // -----------------------------------------------------------------
            //
            // **As tres acoes sao a MESMA historia, na ordem em que ela
            // acontece:** achei um bicho, li a plaquinha dele, registrei o
            // achado, e depois volto para ver os que registrei. Elas estavam
            // espalhadas entre `Conta` e a acao flutuante de `Pets`, e nenhuma
            // das tres e sobre a minha conta nem sobre o meu pet.
            //
            // **O nome nao e `Achados`**, que seria o nome do OBJETO e deixaria
            // `Escanear uma tag` de fora do sentido: ler a plaquinha de um
            // cachorro na rua ainda nao e um achado registrado.
            const TituloDeGrupoDeMenu('Pets na rua'),
            // A SEGUNDA PORTA DO LEITOR: a porta de conta (UX 27.5.6), onde o
            // cliente pediu. Um leitor so; o destino da leitura sai das regras
            // dos tres cenarios de QR e **nunca** da aba de origem.
            //
            // **Mesmo rotulo, mesma rota, mesmo `push`** -- so o grupo mudou. A
            // porta PRIMARIA, em `Pets`, e a acao flutuante, e desde 20/10 ela
            // e a UNICA acao flutuante daquela secao (*"na pagina pet, remova o
            // icone dos ..., so deixe o de escanear a tag"*).
            ItemDeMenu(
              rotulo: 'Escanear uma tag',
              aoTocar: () => context.push(Rotas.escanear),
            ),
            // ================================================================
            // `Registrar achado avulso`: A ACAO QUE PERDEU A CASA EM 20/10
            // ================================================================
            //
            // Ela morava atras do alvo secundario da acao flutuante de `Pets`,
            // e o cliente mandou o alvo sair no mesmo dia em que pediu os
            // topicos: *"na pagina pet, remova o icone dos ..., so deixe o de
            // escanear a tag"*.
            //
            // **MEDIDO ANTES DE MOVER: ela nao tinha NENHUMA outra porta.**
            // `Rotas.registrarAchado` aparecia em `lib/` so em tres lugares --
            // a folha do alvo secundario em `abas.dart`, a declaracao em
            // `rotas.dart` e a propria tela. Tirar o alvo sem esta linha
            // deixaria uma tela construida inalcancavel **em silencio**: a rota
            // existe, a tela monta, e o que desapareceria e o unico caminho
            // humano ate ela. Foi o mesmo achado de `Pedidos de conexao` e
            // `Pessoas bloqueadas` em 19/10.
            //
            // **O ROTULO E O MESMO que a folha pintava**, e e de proposito:
            // quem usava a folha acha a acao pelo texto, e nao descobre que ela
            // mudou de lugar lendo um nome novo.
            //
            // **E ELA NAO EXIGE CONTA**, como nao exigia na folha: o dono da
            // acao e o ACHADOR, e quem acha um animal na rua pode nao ter
            // conta. A tela de destino pede o que precisar, com a saida que
            // resolve -- tela que recusa dizendo e melhor que porta que nao
            // aparece. **Este menu so existe logado**, e a porta sem conta
            // continua sendo a de `Pets`... que saiu com o alvo secundario.
            //
            // **ESTA E A PERDA REAL DO ITEM 3, E O CLIENTE JA RESPONDEU SOBRE
            // ELA -- NAO REABRA.** Eu a medi e a levei a ele como pergunta
            // fechada; resposta literal, de 20/10/2026: *"O fluxo ja existe
            // dentro do botao escanear, digitar codigo manualmente e sinalizar
            // o pet perdido ou no perfil do usuario, podemos deixar como
            // esta"*. Ou seja: quem acha um bicho na rua SEM conta entra pelo
            // leitor de plaquinha -- que e a acao flutuante de `Pets`, nao
            // exige conta, e aceita codigo digitado a mao --, e dali sinaliza.
            // A perda e conhecida e aceita; devolver uma porta sem conta aqui
            // seria desfazer uma decisao dele.
            ItemDeMenu(
              rotulo: 'Registrar achado avulso',
              aoTocar: () => context.push(Rotas.registrarAchado),
            ),
            // `Meus achados`: a lista dos avisos de achado desta conta.
            //
            // **Aqui e nao na aba `Pets`**, e a razao esta por extenso no
            // cabecalho de `MeusAchados`: `Pets` e a vizinhanca e e alcancavel
            // SEM CONTA (`listPublicLostPets` declara `security: []`), e
            // `listMyFoundReports` exige conta com a autorizacao no `WHERE` do
            // servidor. O "meu" mora em `Perfil`, como `Meus pets`.
            ItemDeMenu(
              rotulo: MeusAchados.titulo,
              aoTocar: () => context.push(Rotas.meusAchados),
            ),
            const SizedBox(height: BichuEspaco.e6),
            // -----------------------------------------------------------------
            // GRUPO `Comunidade`: a minha gente e os encontros
            // -----------------------------------------------------------------
            //
            // **O nome e o da secao `Rede`?** Nao: `Rede` e a secao da barra,
            // que e o que ACONTECE -- os eventos e quem atende bem. Este grupo
            // e o que e MEU dentro daquilo: os pedidos que me chegaram e os
            // encontros em que entrei. Nomear o grupo `Rede` faria o menu
            // parecer um atalho para a secao, e ele nao e.
            const TituloDeGrupoDeMenu('Comunidade'),
            // `Pedidos de conexao` -- o outro dos dois que tinham a gaveta
            // como UNICA porta em `lib/` ate 19/10, pela mesma medicao.
            ItemDeMenu(
              rotulo: 'Pedidos de conexão',
              aoTocar: () => context.push(Rotas.pedidosDeConexao),
            ),
            // `Conexoes` (22/10/2026), por decisao do cliente: *"o usuario pode
            // abrir a lista de usuarios que e sua conexao"*.
            //
            // **Logo DEPOIS dos pedidos, e a ordem e deliberada**: o pedido e o
            // que espera decisao e a conexao e o que ja decidiu, entao a ordem
            // do menu segue a do tempo. E as DUAS linhas existem porque sao
            // DOIS destinos -- `gaveta_de_secoes.dart` proibe dois nomes para o
            // mesmo lugar, e aqui ha um nome por lugar.
            ItemDeMenu(
              rotulo: TelaDeMinhasConexoes.titulo,
              aoTocar: () => context.push(Rotas.minhasConexoes),
            ),
            // `Meus eventos`: os encontros que esta conta criou (19/10/2026).
            //
            // **ESTA LINHA E O UNICO CAMINHO DO APP ATE `Cancelar`.** Nada na
            // resposta da agenda diz de quem e o encontro --
            // `NetworkEventPublic` nao tem campo de autoria e nao pode ter
            // (item 7 do ADR-0010) --, entao quem criou um encontro nao tinha
            // como voltar a ele. O cliente escolheu este lugar, literal: *"uma
            // tela com os eventos que voce criou, e o cancelar mora la. Nao
            // suja o cartao da agenda, que voce acabou de mandar limpar, e e
            // onde as pessoas procuram"*.
            ItemDeMenu(
              rotulo: MeusEventos.titulo,
              aoTocar: () => context.push(Rotas.meusEventos),
            ),
            const SizedBox(height: BichuEspaco.e6),
            // SEMPRE O ULTIMO (pedido do cliente, literal: "o sair da conta
            // deve ser sempre a ultima opcao do menu"), e **fora de grupo**:
            // encerrar a sessao nao e um item de `Conta` entre outros, e por-lo
            // dentro daquele grupo o enterraria no meio da pagina.
            _ItemDeSair(sessao: sessao),
            // O CARIMBO DE BUILD, no PE da pagina (26/10/2026).
            //
            // **Ele vem depois de `Sair da conta` e isso NAO contradiz o
            // pedido do cliente** (*"o sair da conta deve ser sempre a ultima
            // opcao do menu"*): carimbo nao e opcao de menu. Ele nao e
            // `ItemDeMenu`, nao tem `onTap`, nao navega para lugar nenhum e
            // nao tem alvo de toque -- e um rodape de texto, da mesma familia
            // do "versao x.y" que vive no pe de tela de ajuste de qualquer
            // aplicativo. `exigirSairPorUltimo`
            // (`perfil_ordem_dos_itens_test.dart`) varre `ItemDeMenu`,
            // `TituloDeGrupoDeMenu`, `CartaoDePet` e `FilledButton`: a cauda
            // de OPCOES continua terminando em `Sair da conta`, e e isso que
            // o pedido protege.
            //
            // **POR QUE AQUI, e nao numa tela de `Sobre`.** Nao existe tela de
            // `Sobre` neste aplicativo -- medido: nenhum arquivo de
            // `app/lib/telas` tem `sobre` no nome, e `Termos` esta `planejada`
            // no registro de sub-destinos. Criar uma tela nova para uma linha
            // de texto poria o carimbo atras de um toque e de uma rota, e o
            // ponto dele e o cliente conseguir LER o valor sem esforco e me
            // dizer qual e. `Perfil` e a aba que ele ja abre; o pe dela e o
            // lugar mais raso que existe.
            const CarimboDoBuild(),
          ],
        );
      },
    );
  }
}

/// O logotipo no alto do `Perfil` deslogado.
///
/// **Decorativo, e por isso `ExcludeSemantics`.** Quem usa leitor de tela
/// chega nesta tela ja ouvindo `Perfil` da barra de topo e a linha de reforco
/// logo abaixo; um "Bichu" anunciado entre as duas e antes de `Entrar` so
/// adiaria o unico conteudo que a tela tem, que sao os tres controles. A
/// imagem aqui nao carrega informacao: ela nao diz nada que o texto ja nao
/// diga, e esse e exatamente o criterio de decorativo do WCAG 1.1.1.
///
/// **Sem frase junto.** A tela nao ganhou nenhuma linha de texto nova; o
/// cliente reprovou texto a mais em tela e o logotipo nao precisa de legenda.
///
/// A largura e 180 dp: uma vez e meia o piso medido de
/// [MarcaLockup.pisoDeLargura] (§3.10), e cabe com folga nos 328 dp uteis de
/// uma tela de 360 dp, que e a mais estreita que o produto mira.
class _MarcaDoPerfilDeslogado extends StatelessWidget {
  const _MarcaDoPerfilDeslogado();

  @override
  Widget build(BuildContext context) {
    return const ExcludeSemantics(
      child: Padding(
        padding: EdgeInsets.only(bottom: BichuEspaco.e8),
        child: Center(child: MarcaLockup(largura: 180)),
      ),
    );
  }
}

/// `Pets` > `Adoções`. Sub-destino com porta propria e pagina propria.
///
/// Mesma anatomia de 27.4.3: nome curto na barra de topo, linha de reforco no
/// corpo, `EstadoVazio` sem acao. `Adoções` como **titulo** cabe (112,63 dp em
/// 1x e 151,55 em 2x, contra 240,0 disponiveis); o que nao cabia era a frase
/// inteira, e ela esta no corpo.
class TelaDeAdocoes extends StatelessWidget {
  const TelaDeAdocoes({super.key});

  @override
  Widget build(BuildContext context) {
    return const TelaDeAba(
      titulo: 'Adoções',
      filhos: <Widget>[
        EstadoVazio(
          titulo: 'A lista de adoções está em construção',
          explicacao: 'Os pets para adoção da sua região vão ficar aqui.',
        ),
      ],
    );
  }
}

/// A linha fixa de quem negou a permissao de aviso (UX 10.1, BICHUS-24).
///
/// ## Por que ela existe
///
/// Negar a permissao de notificacao no iOS e irreversivel pelo app: o dialogo
/// do sistema nao e mostrado uma segunda vez, e o desenho da BICHUS-24 leva
/// isso a serio -- nenhuma terceira antessala, nenhum dialogo repetido. Sem
/// esta linha, esse rigor vira beco sem saida: o app para de perguntar, nao
/// oferece nada no lugar, e a pessoa que mudou de ideia nao tem por onde
/// voltar. Rigor sem saida e so abandono com outro nome.
///
/// UX 10.1 e literal: "O caminho para reverter e `Ligar nos ajustes`, que abre
/// os ajustes do sistema, e existe tambem em Perfil."
///
/// ## O que ela diz, e o que ela nao pode dizer
///
/// Diz **o que se perde** -- o alerta de pet perdido por perto -- e diz junto
/// que o caso proprio continua coberto por e-mail (ADR-0008: "um canal que
/// depende de permissao do sistema operacional nao pode ser o unico"). Sem a
/// segunda frase a primeira soaria como se negar tivesse desligado o produto,
/// e ela seria falsa: "Continua usando o app inteiro. Nada fica escondido".
///
/// ## Por que so `negada`, e nao `naoPedida`
///
/// Quem tocou em `Agora nao` nunca viu o dialogo do sistema. Dizer a essa
/// pessoa que ela "nao recebe aviso por perto" seria o app se desculpando por
/// uma escolha que ele mesmo ainda nao ofereceu -- e queimaria o argumento da
/// segunda antessala, em F3.2, antes de ela acontecer.
///
/// ## Por que ela some sozinha
///
/// Ela escuta o [VigiaDeAviso]. No instante em que a pessoa volta dos ajustes
/// com a chave ligada, o vigia reconcilia e esta linha desaparece. Uma linha
/// que continuasse aqui depois disso diria a ela que nao funcionou, e o
/// proximo passo dela seria desinstalar o app.
class _AvisoPorPertoDesligado extends StatelessWidget {
  const _AvisoPorPertoDesligado();

  @override
  Widget build(BuildContext context) {
    final vigia = Escopo.of(context).vigiaDeAviso;

    return AnimatedBuilder(
      animation: vigia,
      builder: (context, _) {
        if (!vigia.negouOAviso) return const SizedBox.shrink();
        return Padding(
          padding: const EdgeInsets.only(bottom: BichuEspaco.e6),
          child: FaixaDeAviso(
            // Informativo, e nao erro: **nada deu errado**. A pessoa escolheu,
            // e a escolha dela nao e um defeito a ser corrigido com cor de
            // alarme.
            peso: PesoDaFaixa.informativo,
            texto: '${TextosDaAntessala.semAvisoPorPerto} '
                '${TextosDaAntessala.oEmailCobreOCasoProprio}',
            rotuloDaAcao: TextosDaAntessala.ligarNosAjustes,
            aoTocarNaAcao: () =>
                Escopo.of(context).avisos.abrirAjustesDoSistema(),
          ),
        );
      },
    );
  }
}

/// `Sair da conta`, agora como item de menu.
///
/// **A folha de confirmacao nao mudou uma linha**, e e ela que carrega a
/// decisao desta acao: avisar o que muda antes de sair, e so entao sair. O que
/// mudou foi a forma do gatilho -- de botao de contorno de largura total para
/// linha de menu --, pelo pedido do cliente de 18/10/2026. `critico` poe a
/// tinta da marca no rotulo: e a unica linha deste menu que encerra algo.
class _ItemDeSair extends StatelessWidget {
  const _ItemDeSair({required this.sessao});

  final ControladorDeSessao sessao;

  @override
  Widget build(BuildContext context) {
    return ItemDeMenu(
      rotulo: 'Sair da conta',
      critico: true,
      aoTocar: () async {
        // Ao sair, avisar o que muda: a pessoa precisa saber que para de
        // receber os alertas de pets perdidos por perto.
        final confirmou = await showModalBottomSheet<bool>(
          context: context,
          showDragHandle: true,
          builder: (context) => const _FolhaDeSair(),
        );
        if (confirmou != true) return;
        if (!context.mounted) return;
        // O cache de `Meus pets` sai junto com a sessao.
        //
        // O lugar que CONTA agora e a lista `limpezasAoSair` do
        // `ControladorDeSessao`, fiada em `app.dart` no merge do Grupo 1: ela
        // roda nos quatro desfechos de `sair()` (revogacao confirmada, sem
        // sessao para revogar, sem rede, servidor recusou) e tambem no
        // caminho que nao passa por botao nenhum, a sessao derrubada por
        // refresh recusado (401 em `_renovar`). Enquanto a limpeza morava so
        // aqui, esse caminho deixava os pets da conta anterior em memoria.
        //
        // Esta chamada fica como segunda camada: `limpar()` e idempotente e
        // custa duas atribuicoes. Ela nao e mais a unica defesa.
        Escopo.of(context).cacheDeMeusPets.limpar();
        await sessao.sair();
        if (!context.mounted) return;
        // **Quem sai da conta vai para a pagina de login.** Decisao do cliente
        // em 21/09, literal: "ele vai para a pagina de login". Nao e `Pets` e
        // nao e a antiga `Inicio`.
        //
        // `go` e nao `push`: a conta acabou de sair, e deixar a casca de abas
        // logada na pilha atras do login e deixar a tela da conta anterior
        // desempilhavel. A tela de login tem saida propria, e sem pilha ela
        // cai em `Rotas.pets` -- deslogado continua sendo estado de
        // navegacao, e nao muro (UX 5.2).
        context.go(Rotas.entrar);
      },
    );
  }
}

class _FolhaDeSair extends StatelessWidget {
  const _FolhaDeSair();

  @override
  Widget build(BuildContext context) {
    final textos = Theme.of(context).textTheme;
    return SafeArea(
      child: Padding(
        padding: const EdgeInsets.all(BichuEspaco.e6),
        child: Column(
          mainAxisSize: MainAxisSize.min,
          crossAxisAlignment: CrossAxisAlignment.start,
          children: <Widget>[
            Text('Sair da sua conta?', style: textos.titleLarge),
            const SizedBox(height: BichuEspaco.e2),
            Text(
              'Você vai parar de receber alertas de pets perdidos por perto.',
              style: textos.bodyLarge,
            ),
            const SizedBox(height: BichuEspaco.e6),
            BotaoPrimario(
              rotulo: 'Sair',
              aoTocar: () => Navigator.of(context).pop(true),
            ),
            const SizedBox(height: BichuEspaco.e3),
            BotaoSecundario(
              rotulo: 'Agora não',
              aoTocar: () => Navigator.of(context).pop(false),
            ),
          ],
        ),
      ),
    );
  }
}
