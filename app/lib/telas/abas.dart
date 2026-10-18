import 'package:flutter/material.dart';
import 'package:go_router/go_router.dart';

import '../escopo.dart';
import '../roteamento/rotas.dart';
import '../sessao/controlador_de_sessao.dart';
import '../theme/bichu_colors.dart';
import '../theme/bichu_tokens.g.dart';
import '../widgets/acao_de_criar_na_barra.dart';
import '../widgets/botao_primario.dart';
import '../widgets/faixa_de_aviso.dart';
import '../widgets/item_de_menu.dart';
import '../widgets/marca.dart';
import 'avisos/aviso_de_cadastro_incompleto.dart';
import 'avisos/antessala_de_aviso.dart';
import 'casca_com_abas.dart';
import 'perfil/meus_pets.dart';
import 'perto/corpo_do_perto.dart';
import 'perto/lista_do_diretorio.dart';
import 'rede/agenda_da_rede.dart';
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
/// e a tela de destino explicava a recusa com a saida que a resolve. Os dois
/// impedimentos (`semConta` e `semEmailConfirmado`) **continuam em
/// `criar_encontro.dart` e `sugerir_profissional.dart` e nao foram tocados**:
/// as rotas seguem alcancaveis por link profundo, e tela que recusa calada e
/// pior do que tela que recusa dizendo. O que mudou foi quem ve a PORTA.
///
/// **O caminho para validar nao depende desta porta, e isso foi conferido.** O
/// `AvisoDeCadastroIncompleto` desenha "Confirme seu e-mail" com `Reenviar` em
/// DUAS posicoes que nao saem da frente de ninguem: faixa de largura total no
/// topo de `Pets` (posicao 1) e item destacado no topo de `Perfil` (posicao
/// 2). Esconder a acao de criar nao fecha caminho nenhum de confirmacao.
///
/// **E ela NAO e a trava.** A trava de verdade e do servidor, e aqui vai o
/// achado: `rotaDaCriacaoDeEncontro` e a rota da sugestao do diretorio exigem
/// **conta** (teto por `account`, token obrigatorio) e **nao** exigem
/// `email_verified` em lugar nenhum de `src/`. A metade "validado" desta regra
/// existe **so no app**. Esta linha esconde a porta; ela nao recusa o pedido.
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
          // A PORTA PRIMARIA DO LEITOR DE QR, AGORA NA BARRA DE TOPO
          // (pedido do cliente em 18/10/2026: "ate o escanear poderia ser
          // icones na barra superior ... e nao fique esse botao grande na
          // pagina ocupando muito espaco"). O botao de contorno de largura
          // total que morava no corpo saiu: 48 dp dele mais 24 dp de folga,
          // 72 dp devolvidos ao corpo.
          //
          // **O GLIFO E O DE QR CODE, e ele foi escolhido por ele**: "o botao
          // escanear uma tag, pode ser um icone de qr-code igual do
          // whatsapp". `Icons.qr_code_2` e o quadrado com os tres marcadores
          // de canto, da familia fechada do design system 10.1 (Material
          // Symbols, embutida no Flutter) -- nenhum vetor novo, nada baixado,
          // nada gerado. Ele nao colide com glifo nenhum em uso: `qr_code*`
          // nao aparecia em `app/lib` antes desta mudanca.
          //
          // **ELE CONTINUA VISIVEL DESLOGADO, e isso foi MEDIDO e nao
          // suposto.** `tela_leitor_de_qr.dart` diz que a autenticacao da
          // rota do leitor e **opcional**, e o token entra quando ha. Quem
          // acha um cachorro na rua e exatamente quem pode nao ter conta
          // nenhuma: esconder o leitor dessa pessoa e o oposto da cunha do
          // produto. As outras duas acoes desta tarefa -- criar evento e
          // indicar -- exigem sessao e por isso desaparecem deslogadas; esta
          // nao.
          //
          // `push` e nao `go`: o leitor cobre a casca inteira (o design
          // system 11.11 manda a barra sumir no leitor de camera), e tela que
          // cobre a casca precisa ter volta.
          acaoDeCriar: AcaoDeCriarNaBarra(
            icone: Icons.qr_code_2,
            rotulo: 'Escanear uma tag',
            aoTocar: () => context.push(Rotas.escanear),
          ),
          reforco: destino.reforcoDaPagina,
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
            // `Adoções` e sub-destino de `Pets`, com porta propria, e **nao** e
            // item de `Perto` (UX 27.2.4). Em `Perto` fica a porta das ONGs,
            // que leva para ca pre-filtrado e nao duplica listagem.
            const _PortaDeSubDestino(
              icone: Icons.volunteer_activism_outlined,
              titulo: 'Adoções',
              rota: Rotas.adocoes,
            ),
            const SizedBox(height: BichuEspaco.e6),
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
            const EstadoVazio(
              titulo: 'A lista de pets perdidos está em construção',
              explicacao: 'Os perdidos e achados da sua região vão ficar aqui.',
            ),
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

/// Secao 2 — `Rede`. Eventos da comunidade.
///
/// **A casca honesta saiu: a secao tem dado.** O `EstadoVazio` "Rede esta em
/// construcao" era o certo enquanto nao havia tabela nem rota;
/// `GET /network/events` existe, e a agenda e [AgendaDaRede]. O estado vazio
/// nao sumiu, mudou de dono: quem o mostra agora e a propria lista, e so
/// quando o servidor responde que nao ha evento -- que e afirmacao medida, e
/// nao afirmacao sobre dado que a tela nao carrega. E ele virou **dois**, como
/// na `Loja`: "a Rede ainda nao tem evento" e "nada com esse recorte" dizem
/// coisas opostas.
///
/// **O slot unico de acao da barra de topo continua LIVRE.** Os tres controles
/// de listagem -- busca, filtro e ordenacao -- moram no corpo, no topo da
/// lista (ver `BarraDeListagem`), como em `Perto` e na `Loja`. Esta e a
/// TERCEIRA tela a usar o componente, e ela nao mudou uma linha dele.
///
/// **A secao de comunidade NAO mostra a comunidade, e isso e o ADR-0025.**
/// Nao ha lista de presenca, em lugar nenhum, nao ha mapa e nao ha
/// ordenacao por distancia. Cada uma dessas ausencias fecha a inferencia que o
/// item 7 do ADR-0010 proibe -- que dois pets sao do mesmo tutor --, e o custo
/// delas esta escrito no ADR: um encontro de cachorros em que nao se sabe quem
/// vai e mais pobre do que o cliente descreveu, e essa pobreza e deliberada.
///
/// **Check-in e galeria de fotos sairam desta versao** (BICHUS-251, decisao
/// do cliente de 23/09/2026) e voltam depois pela branch
/// `guarda/rede-checkin-galeria`.
///
/// **Criar evento e enviar foto continuam fora**, e isso e verificavel e
/// nao prometido: nao ha operacao no contrato, nao ha metodo em `RedeApi` e nao
/// ha widget na tela. A criacao pela comunidade depende do pacote de moderacao,
/// que nao existe em lugar nenhum deste repositorio.
class AbaRede extends StatelessWidget {
  const AbaRede({super.key});

  @override
  Widget build(BuildContext context) {
    final destino = CascaComAbas.porRota(Rotas.rede);
    final sessao = Escopo.of(context).sessao;

    // `AnimatedBuilder` porque a visibilidade da porta de criar passou a
    // depender da SESSAO: sem ele, quem entra ou confirma o e-mail com a
    // `Rede` aberta continuaria sem o icone ate trocar de aba.
    return AnimatedBuilder(
      animation: sessao,
      builder: (context, _) => TelaDeAba(
        raizDeSecao: true,
        titulo: destino.rotulo,
        // A PORTA DE CRIAR EVENTO, na barra de topo (pedido do cliente em
        // 18/10/2026). Ela saiu do corpo da agenda, onde era um
        // `BotaoSecundario` de largura total: 48 dp de altura mais 16 dp de
        // folga, 64 dp devolvidos ao corpo.
        //
        // **"Criar evento", e nao "Marcar um encontro".** O vocabulario do app
        // trocou "encontro" por "evento" em 18/10 e os rotulos novos dizem
        // `Criar evento`. **A pendencia que este ramo deixou escrita esta
        // FECHADA na mescla do lote de 18/10:** o literal saiu daqui e o
        // rotulo vem de `AgendaDaRede.rotuloDeMarcar`, que o ramo do
        // vocabulario passou a valer `Criar evento`. Era uma string aqui mais
        // uma constante definida e sem uso la; agora e uma coisa so, e quem
        // mudar a redacao muda num lugar.
        //
        // **O GLIFO: `Icons.more_time` -- o relogio com o sinal de mais.** Ele
        // nao foi escolhido por gosto, e sim por eliminacao dentro da familia
        // fechada do 10.1 (Material Symbols, a embutida no Flutter 3.47.4):
        //
        //   - calendario COM O SINAL DE MAIS, que seria o obvio, **nao existe**
        //     nesta familia nesta versao (`calendar_add_on` nao esta la);
        //   - `edit_calendar` (calendario com lapis) **ja esta em uso dentro da
        //     propria `Rede`**, em `encontro_da_rede.dart`, significando
        //     "adicionar ao meu calendario" -- dois sentidos no mesmo glifo na
        //     mesma secao e a colisao que o cliente leu no aparelho em 22/09;
        //   - `event_available` (calendario com visto) leria "vou participar",
        //     que e outra acao que esta secao tem;
        //   - `event` sozinho e o glifo decorativo de "quando" em quatro telas,
        //     e diz "um evento", nunca "criar um".
        //
        // Sobra o sinal de mais sobre o objeto que a acao de fato produz: uma
        // data e hora marcadas. Nenhum vetor novo, nada baixado, nada gerado.
        //
        // **So aparece com sessao E e-mail confirmado** (ver
        // `podeCriarNaComunidade`). Deslogado, a barra da `Rede` fica com o
        // titulo e o `Filtros` -- nao fica vazia --, e o caminho para entrar e
        // a aba `Perfil`, que oferece `Entrar` e `Criar conta` e continua na
        // barra de baixo em todo estado.
        acaoDeCriar: podeCriarNaComunidade(sessao)
            ? AcaoDeCriarNaBarra(
                icone: Icons.more_time,
                rotulo: AgendaDaRede.rotuloDeMarcar,
                aoTocar: () => context.push(Rotas.criarEncontroDaRede),
              )
            : null,
      // **O reforco desce para a agenda, e nao sai da tela.**
      //
      // `TelaDeAba` o desenha como PRIMEIRA linha do corpo, acima dos filhos,
      // e o cliente pediu em 17/10/2026 que o campo de busca fique acima dele
      // e das abas. A casca nao tem como por o campo acima do proprio reforco:
      // o campo pertence ao estado de `AgendaDaRede`. Entao o texto vai para
      // quem sabe a ordem -- ele continua no corpo, em `body-lg` e
      // `text-secondary`, exatamente como aqui, so com a busca acima.
        reforco: null,
        filhos: <Widget>[AgendaDaRede(reforcoDaSecao: destino.reforcoDaPagina)],
      ),
    );
  }
}

/// Secao 3 — `Perto`. Profissionais e estabelecimentos indicados.
///
/// **A casca honesta saiu: a secao tem dado.** O `EstadoVazio` "Perto esta em
/// construcao" era o certo enquanto nao havia rota; `GET /directory/entries`
/// existe, e a listagem e `ListaDoDiretorio`. O estado vazio nao sumiu, mudou
/// de dono: quem o mostra agora e a propria lista, e so quando o servidor
/// responde que nao ha entrada -- que e afirmacao medida, e nao afirmacao
/// sobre dado que a tela nao carrega.
///
/// **A porta das ONGs continua** (criterio 6): ela leva a `Pets` pre-filtrado
/// em adocao e nao duplica listagem nenhuma. Ela fica **abaixo** da lista
/// porque o conteudo da secao passou a existir, e porta para outra secao acima
/// do conteudo proprio inverteria a ordem de leitura.
///
/// **A barra de topo passou a ter DUAS acoes na direita**, e nao mais uma: a
/// porta de INDICAR subiu para a barra em 18/10/2026 (pedido do cliente) e
/// fica a esquerda do `Filtros`. Busca, filtro e ordenacao **nao mudaram de
/// lugar nesta rodada**: a busca continua no corpo, em largura total, e o
/// acesso a folha de filtro e ordem continua no slot que ganhou em 17/10.
///
/// **Sem mapa**, por decisao de 17/09: o Maps cobra por carregamento de mapa e
/// o componente criaria precedente contra o ADR-0010. E perfil de profissional
/// **nao e criado pela comunidade**, por decisao de 21/09.
class AbaPerto extends StatelessWidget {
  const AbaPerto({super.key});

  @override
  Widget build(BuildContext context) {
    final destino = CascaComAbas.porRota(Rotas.perto);
    final sessao = Escopo.of(context).sessao;

    // Mesma razao de `AbaRede`: a visibilidade da porta de indicar depende da
    // sessao, e sem escutar o controlador ela so apareceria na troca de aba.
    return AnimatedBuilder(
      animation: sessao,
      builder: (context, _) => TelaDeAba(
        raizDeSecao: true,
        titulo: destino.rotulo,
        // A PORTA DE INDICAR, na barra de topo (pedido do cliente em
        // 18/10/2026). Ela saiu do corpo da lista do diretorio, onde era um
        // `BotaoSecundario` de largura total: 48 dp de altura mais 16 dp de
        // folga, 64 dp devolvidos ao corpo.
        //
        // **O GLIFO E O DE PESSOAS JUNTAS, e ele foi escolhido por ele**: "o
        // icone de recomendar um profissional, pode ser igual do instagram, as
        // 3 pessoas juntos, para adicionar uma nova recomendacao".
        // `Icons.group_add` e esse desenho na familia fechada do 10.1 --
        // nenhum vetor novo, nada baixado, nada gerado.
        //
        // **O SINAL DE ADICIONAR NAO E ENFEITE, e e ele que resolve a
        // ambiguidade.** Pessoas juntas SEM o sinal leria "ver a lista de
        // profissionais" -- que e justamente o que esta tela ja mostra, e um
        // icone que repete o conteudo da tela nao oferece acao nenhuma.
        // `group_add` ja traz o sinal embutido no proprio glifo, entao a
        // leitura "adicionar" vem sem compor dois glifos (o 10.1 e o UX 27.3.1
        // proibem composicao).
        //
        // **Ha uma vizinhanca para vigiar, e ela esta escrita aqui para nao
        // ser descoberta no aparelho:** a aba `Rede` usa `groups` na barra de
        // BAIXO, e as duas saem do mesmo campo de "pessoas juntas". Elas vivem
        // em barras diferentes e em secoes diferentes, e o cliente pediu este
        // glifo com estas palavras. Se ele ler as duas como a mesma coisa no
        // aparelho, quem muda e esta linha, nao a aba.
        //
        // **So aparece com sessao E e-mail confirmado.** O defeito que ele
        // relatou era exatamente este: *"o botao indicar quem atende bem, nem
        // deveria aparecer para o usuario se ele nao estiver logado"* -- a
        // porta convidava, e a tela de destino e que dizia "Entre para
        // indicar". Deslogado a barra fica com o hamburguer, o titulo e o
        // `Filtros`, e o caminho para entrar e a aba `Perfil`.
        acaoDeCriar: podeCriarNaComunidade(sessao)
            ? AcaoDeCriarNaBarra(
                icone: Icons.group_add,
                // A MESMA palavra da tela, e de uma fonte so: "Indicar", nunca
                // "Cadastrar". A emenda 1 do ADR-0011 diz que a comunidade
                // convida e avalia, nunca cria, e `Cadastrar` prometeria
                // publicacao -- nada e publicado por esta porta.
                rotulo: ListaDoDiretorio.rotuloDeIndicar,
                aoTocar: () => context.push(Rotas.sugerirProfissional),
              )
            : null,
        reforco: destino.reforcoDaPagina,
        // **AS DUAS ABAS DA SECAO** (cliente, 18/10/2026): `Profissionais` e
        // `Minhas indicacoes`. Quem as desenha e `CorpoDoPerto`, com a
        // mecanica de `agenda_da_rede.dart` reusada -- e nao esta classe: a
        // casca entrega o corpo da secao, e as abas sao conteudo dele.
        //
        // **A porta de adocao entra como rodape da aba da LISTA**, e nao como
        // filho da secao: pendurada fora das abas, ela apareceria embaixo de
        // `Minhas indicacoes` tambem, oferecendo adocao a quem foi ver o
        // estado de uma indicacao.
        filhos: const <Widget>[
          CorpoDoPerto(
            rodapeDaListagem: _PortaDeSubDestino(
              icone: Icons.favorite_outline,
              titulo: 'Pets de ONGs para adoção',
              rota: Rotas.adocoes,
            ),
          ),
        ],
      ),
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
          titulo: destino.rotulo,
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
            MeusPets(
              key: ValueKey<String>('meus-pets-${sessao.usuario?.id ?? ''}'),
              cache: Escopo.of(context).cacheDeMeusPets,
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
            const TituloDeGrupoDeMenu('Conta'),
            // O `ListTile` mudo virou porta. O e-mail e a situacao de
            // confirmacao continuam escritos -- eram a unica informacao que
            // aquela linha dava, e sumir com ela seria perder conteudo em nome
            // de arrumar a forma.
            //
            // E a `Dados da conta` do pedido: o cliente nomeou o conteudo, nao
            // o rotulo, e o rotulo `Meus dados` esta em tres portoes e na tela
            // `/perfil/dados` que ele abre. Renomear seria mudar texto de tela
            // sem ele pedir.
            ItemDeMenu(
              rotulo: 'Meus dados',
              apoio: _apoioDosDados(sessao),
              aoTocar: () => context.push(Rotas.dadosPessoais),
            ),
            // A SEGUNDA PORTA DO LEITOR: a porta de conta (UX 27.5.6), onde o
            // cliente pediu. Um leitor so; o destino da leitura sai das regras
            // dos tres cenarios de QR e **nunca** da aba de origem.
            //
            // Virou item de menu e **continua sendo a mesma porta**: mesmo
            // rotulo, mesma rota, mesmo `push` -- o leitor cobre a casca e
            // precisa ter volta. A porta PRIMARIA, em `Pets`, nao mudou de
            // forma: la ela e a acao da secao de aterrissagem, e quem achou um
            // cachorro na rua nao vai procurar menu.
            //
            // E o "resto dos itens no meio" do pedido: entre `Meus dados` e
            // `Sair da conta`. Item novo neste menu entra AQUI, nunca depois
            // do ultimo.
            ItemDeMenu(
              rotulo: 'Escanear uma tag',
              aoTocar: () => context.push(Rotas.escanear),
            ),
            // SEMPRE O ULTIMO (pedido do cliente, literal: "o sair da conta
            // deve ser sempre a ultima opcao do menu"). Nenhuma linha depois
            // desta: era `Meus pets` que vinha depois dela, e era isso que
            // fazia a pagina parecer quebrada no meio.
            _ItemDeSair(sessao: sessao),
          ],
        );
      },
    );
  }
}

/// A linha de apoio do item `Meus dados`: o e-mail e a situacao dele.
///
/// E o conteudo que o `ListTile` mudo do topo mostrava antes desta mudanca, e
/// por isso ele nao desapareceu com aquela linha -- so passou a ficar embaixo
/// de um rotulo que diz para onde o toque leva.
///
/// Deslogado nao chega aqui: este trecho so e construido no ramo logado.
String _apoioDosDados(ControladorDeSessao sessao) {
  final usuario = sessao.usuario;
  if (usuario == null) return '';
  final situacao = usuario.emailVerificado
      ? 'E-mail confirmado'
      : 'E-mail ainda não confirmado';
  return '${usuario.email} · $situacao';
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

/// A porta de um sub-destino: um caminho da secao, com nome e explicacao.
///
/// Existe como componente para que **nenhuma porta nasca muda**: o criterio 2
/// da historia e que nenhum toque termine sem resposta, e a forma mais comum
/// de quebrar isso e um `ListTile` com `onTap: null` que continua parecendo
/// tocavel. Aqui a rota e obrigatoria e nao aceita nulo.
class _PortaDeSubDestino extends StatelessWidget {
  const _PortaDeSubDestino({
    required this.icone,
    required this.titulo,
    required this.rota,
  });

  final IconData icone;
  final String titulo;
  final String rota;

  @override
  Widget build(BuildContext context) {
    final cores = BichuColors.of(context).cores;
    final textos = Theme.of(context).textTheme;

    return Material(
      color: cores.surfaceSunken,
      borderRadius: BorderRadius.circular(BichuRaio.lg),
      child: InkWell(
        borderRadius: BorderRadius.circular(BichuRaio.lg),
        onTap: () => context.push(rota),
        child: Padding(
          padding: const EdgeInsets.all(BichuEspaco.e4),
          child: Row(
            children: <Widget>[
              // Decorativo: o titulo ao lado ja diz o que e, e icone com nome
              // proprio seria anuncio duplo no leitor de tela.
              Icon(icone, color: cores.textSecondary),
              const SizedBox(width: BichuEspaco.e4),
              Expanded(child: Text(titulo, style: textos.titleMedium)),
              const SizedBox(width: BichuEspaco.e2),
              Icon(Icons.chevron_right, color: cores.textSecondary),
            ],
          ),
        ),
      ),
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
