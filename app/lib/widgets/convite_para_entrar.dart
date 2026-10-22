import 'dart:async';

import 'package:flutter/material.dart';
import 'package:go_router/go_router.dart';

import '../api/falhas.dart';
import '../api/problem.dart';
import '../escopo.dart';
import '../intencao/leitura_como_intencao.dart';
import '../roteamento/rotas.dart';
import '../sessao/controlador_de_sessao.dart';
import '../theme/bichu_colors.dart';
import '../theme/bichu_tokens.g.dart';
import 'botao_primario.dart';

/// O ESTADO DE DESLOGADO DAS SECOES QUE EXIGEM CONTA, num ponto so.
///
/// ## Por que este arquivo existe
///
/// Pedido do cliente em 19/10/2026, depois de testar no iPhone: *"mas tem que
/// ter uma pagina de deslogado, nao da para mostrar so uma mensagem de erro
/// para atualizar"*.
///
/// **O servidor nao estava fora.** Medido na homologacao no mesmo dia, com e
/// sem conta: `/v1/health` 200, `/v1/directory/entries` e `/v1/conversations`
/// respondendo `401 unauthenticated` com `next_action: sign_in` sem token e
/// `200` com token, e `/v1/auth/refresh` devolvendo token novo. O defeito era
/// do app: diante de um 401 ele desenhava [FaixaDeAviso] de ERRO -- icone de
/// erro, borda de 2 px na tinta de erro -- com um botao de `Atualizar` ou
/// `Tentar de novo` ao lado. Atualizar nao resolve um 401: a proxima tentativa
/// sai igualmente sem conta, e a pessoa fica tocando num botao que nao pode
/// funcionar.
///
/// Pior: desde 18/10 o texto do catalogo para `unauthenticated` e `''` (o
/// cliente mandou remover a frase *"entre na sua conta para continuar"*, que
/// poluia as telas) e **nada ocupou o lugar**. O que sobrava na tela era um
/// icone de erro, nenhuma frase e um botao de atualizar.
///
/// **A tarefa nao e devolver aquela frase.** E dizer o que a secao e, o que a
/// pessoa ganha entrando, e oferecer as duas saidas que existem.
///
/// ## NAO E ERRO, E NAO TEM `Tentar de novo`
///
/// Este widget nao e uma [FaixaDeAviso]: a forma e a do estado vazio do
/// sistema (fundo rebaixado, borda fina), e nao a do erro. Nao ha icone de
/// erro, nao ha borda de 2 px e **nao ha botao de recarregar**, de proposito.
/// Um controle de atualizar aqui prometeria que a lista pode chegar sem conta.
///
/// ## DOIS ESTADOS DE DESLOGADO, E ELES DIZEM COISAS DIFERENTES
///
/// Ver [MotivoSemConta]. Quem nunca entrou ve o que a secao e e as duas
/// portas; quem foi deslogada por renovacao recusada ve que a sessao terminou
/// e **so** `Entrar`. Oferecer `Criar conta` a quem ja tem uma e convidar a
/// abandonar os pets, as conversas e os achados da conta que ela tem.
///
/// O motivo e lido do [ControladorDeSessao] e nao e parametro: uma tela que o
/// escolhesse seria o segundo lugar onde a decisao mora, e e justamente a
/// decisao que nenhuma tela tem informacao para tomar.
///
/// ## SEM CONTA NAO E E-MAIL NAO CONFIRMADO
///
/// Sao dois estados, com saidas diferentes, e confundi-los foi o risco medido
/// nesta entrega. A regua daqui e **sessao**, e nao `podeCriarNaComunidade`
/// (`telas/abas.dart`), que e sessao **e** e-mail confirmado. Quem esta dentro
/// com o e-mail pendente ja tem o caminho dela -- o `AvisoDeCadastroIncompleto`
/// com `Confirme seu e-mail` e `Reenviar`, em `Pets` e em `Perfil` -- e
/// mostrar a esta pessoa um convite para entrar seria negar-lhe uma leitura
/// que o servidor concede: medido, `/v1/me` devolve
/// `pending_profile_fields: ["email_verification","phone","reference_area"]`
/// numa conta nova e as rotas de LEITURA respondem 200 para ela.
///
/// ## DUAS FORMAS, e a segunda entrou em 20/10/2026
///
/// A forma original e a de TELA CHEIA: o corpo inteiro da secao e o conteudo
/// que nao pode ser lido, e o convite ocupa o lugar dele. E assim nas doze
/// telas que o usam como corpo.
///
/// A forma nova e a FOLHA CURTA, por [mostrarConviteParaEntrar], e ela existe
/// por um pedido diferente do cliente, de 20/10/2026: *"quando o usuario
/// estiver deslogado e tentar clicar para ver detalhes de algum conteudo, como
/// por exemplo os eventos, que ele precisa estar logado para ver mais
/// informacoes"*. Aqui a lista **continua publica e visivel**, e o que exige
/// conta e o DETALHE de um item dela. Trocar a agenda inteira por um convite
/// esconderia o conteudo que o servidor entrega sem conta -- medido,
/// `GET /v1/network/events` responde 200 --, e seria o oposto do produto.
///
/// As duas convivem sem ambiguidade, e a regra e de onde esta o muro:
///
/// | o muro esta em | a forma |
/// |---|---|
/// | a LISTA inteira (401 na listagem) | tela cheia, no lugar do corpo |
/// | um ITEM de uma lista publica | folha curta, no toque do item |
///
/// A aba `Comunidade` e o exemplo do primeiro caso e a aba `Eventos` do
/// segundo, e as duas estao na MESMA secao: o diretorio responde 401 e desenha
/// o convite no corpo; a agenda responde 200, mostra os eventos e so o toque
/// abre a folha.
class ConviteParaEntrar extends StatelessWidget {
  const ConviteParaEntrar({
    required this.secao,
    super.key,
    this.rotaDeVolta,
    this.emFolha = false,
  });

  /// Qual secao esta sendo explicada. Ver [SecaoComConta].
  final SecaoComConta secao;

  /// O endereco para onde a pessoa volta **depois** de entrar.
  ///
  /// Nulo mantem o comportamento historico: depois do login a pessoa cai na
  /// secao de aterrissagem. **Medido em 20/10/2026**, antes desta frente: na
  /// pagina de um pet alcancada por link sem conta, tocar em `Entrar` e
  /// entrar levava a `/pets` -- a pagina pedida saia da pilha, porque
  /// `irParaODestinoDoLogin` navega com `go`.
  ///
  /// Com endereco, o convite guarda uma intencao de LEITURA antes de abrir a
  /// tela de entrar, e a guarda de acao devolve a pessoa exatamente aqui. Ver
  /// `intencao/leitura_como_intencao.dart`.
  final String? rotaDeVolta;

  /// Este convite esta dentro de uma folha, e nao no corpo de uma tela.
  ///
  /// Muda duas coisas, e nenhuma delas e cosmetica:
  ///
  /// 1. **A moldura sai.** A folha ja e uma superficie com borda e cantos; o
  ///    fundo rebaixado por dentro dela desenharia caixa dentro de caixa.
  /// 2. **O toque FECHA a folha antes de navegar.** Sem isto a tela de entrar
  ///    nasceria atras da folha, que continuaria no ar por cima dela -- e sair
  ///    da folha deixaria a pessoa numa tela de login que ela nao ve.
  ///
  /// **Nao e `Navigator.canPop()`**, e a diferenca importa: `canPop` tambem e
  /// verdadeiro quando o convite esta no corpo de uma tela EMPILHADA -- a
  /// pagina de um pet, por exemplo --, e la o `pop` fecharia a pagina em vez
  /// da folha que nao existe.
  final bool emFolha;

  /// Guarda a volta, fecha a folha se houver uma, e abre [rota].
  ///
  /// A ordem e a unica que funciona: guardar depois de navegar correria com a
  /// montagem da tela de entrar, e fechar a folha antes de guardar perderia o
  /// `context` de onde o `Escopo` e lido.
  Future<void> _abrir(BuildContext context, String rota) async {
    final volta = rotaDeVolta;
    final roteador = GoRouter.of(context);
    final navegador = Navigator.of(context);
    if (volta != null) {
      final guarda = Escopo.of(context).guarda;
      // **NAO SOBRESCREVE UM RASCUNHO.** A regra 1 de 8.3 diz que a intencao
      // nova substitui a anterior, e para duas ESCRITAS isso esta certo. Aqui
      // nao: quem tem um `Marcar como perdido` meio preenchido guardado e toca
      // num link de evento perderia o que digitou para ganhar uma volta de
      // leitura. Perder uma volta e barato; perder o rascunho e o defeito que
      // o envelope existe para evitar.
      if (await guarda.pendente() == null) {
        await guarda.guardar(intencaoDeVerConteudo(volta));
      }
    }
    if (emFolha) navegador.pop();
    roteador.push(rota);
  }

  @override
  Widget build(BuildContext context) {
    final cores = BichuColors.of(context).cores;
    final textos = Theme.of(context).textTheme;
    final motivo = Escopo.of(context).sessao.motivoSemConta;
    final caiu = motivo == MotivoSemConta.sessaoCaiu;

    final titulo = caiu ? tituloDaSessaoQueCaiu : secao.titulo;
    final explicacao = caiu ? secao.retomada : secao.ganho;

    return Container(
      width: double.infinity,
      padding: const EdgeInsets.all(BichuEspaco.e6),
      decoration: emFolha
          ? null
          : BoxDecoration(
              color: cores.surfaceSunken,
              borderRadius: BorderRadius.circular(BichuRaio.lg),
              border: Border.all(
                color: cores.outline,
                width: BichuBorda.hairline,
              ),
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
          const SizedBox(height: BichuEspaco.e6),
          BotaoPrimario(
            rotulo: rotuloDeEntrar,
            aoTocar: () => unawaited(_abrir(context, Rotas.entrar)),
          ),
          // A SEGUNDA PORTA SO PARA QUEM NAO TEM CONTA. Ver a prosa da classe.
          if (!caiu) ...<Widget>[
            const SizedBox(height: BichuEspaco.e4),
            BotaoSecundario(
              rotulo: rotuloDeCriarConta,
              // **A VOLTA VALE PELAS DUAS PORTAS.** `tela_criar_conta` termina
              // em `irParaODestinoDoLogin` tanto quanto `tela_entrar`
              // (`intencao/ir_para_o_destino.dart` nomeia os dois pontos),
              // entao quem cria a conta tambem volta para o conteudo.
              aoTocar: () => unawaited(_abrir(context, Rotas.criarConta)),
            ),
          ],
        ],
      ),
    );
  }

  /// O titulo de quem estava dentro e caiu.
  ///
  /// **Nao diz `Crie sua conta` e nao diz `Erro`**: diz o que aconteceu. O
  /// prazo esta medido e nao e escrito na frase -- 900 s de access token e 30
  /// dias de refresh --, porque um numero no binario continua sendo dito por
  /// versao antiga do app depois de o servidor mudar o valor.
  static const String tituloDaSessaoQueCaiu = 'Sua sessão expirou';

  static const String rotuloDeEntrar = 'Entrar';
  static const String rotuloDeCriarConta = 'Criar conta';
}

/// As superficies que exigem conta, com o texto de cada uma.
///
/// Elas estao aqui, e nao espalhadas em `static const String` de cada tela,
/// porque o estado de deslogado e o MESMO objeto em todas: a forma, as duas
/// portas e a decisao entre os dois motivos sao de [ConviteParaEntrar], e o
/// que varia e so o que a secao e. Cada tela nomeia a sua e nao escreve mais
/// nada.
///
/// **Toda entrada daqui foi medida contra a homologacao**, sem token: as treze
/// respondem `401 unauthenticated` com `next_action: sign_in` -- as dez
/// primeiras em 19/10/2026, e [paginaDoPet], [paginaDoAchado] e
/// [paginaDaPessoa] em 20/10/2026.
///
/// **Nenhuma secao publica tem entrada aqui**, e a lista do que foi deixado em
/// paz vale tanto quanto a do que entrou. Medido em 20/10/2026, sem conta:
/// `GET /v1/public/lost-pets` **200** e `GET /v1/public/lost-cases/{token}`
/// **200** (e por elas que a vizinhanca acha o pet), `GET /v1/network/events`
/// **200** -- com `total` e os **mesmos 23 campos** com e sem conta --,
/// `GET /v1/network/events/{slug}` **200**, `GET /v1/store/items` **200** e
/// `GET /v1/store/items/{slug}` **200**. Um convite em qualquer uma delas
/// inventaria um muro que o servidor nao tem.
enum SecaoComConta {
  /// `GET /v1/directory/entries` — a aba `Profissionais` de `Perto`.
  ///
  /// **E a aba que RESTA.** `corpo_do_perto.dart` esconde `Minhas indicações`
  /// de quem nao tem conta de proposito, para a secao nao parecer que falta
  /// algo inalcancavel; este convite e da lista, e nao uma volta daquela aba.
  diretorio(
    titulo: 'Quem atende bem, perto de você',
    ganho: 'Entre para ver os profissionais e os locais que a comunidade '
        'indicou na sua região, com o que já foi conferido sobre cada um.',
    retomada: 'Entre de novo para ver quem atende perto de você.',
  ),

  /// `GET /v1/people` — a aba `Usuarios` da `Rede`.
  ///
  /// **A rota e `bearerAuth` sem alternativa vazia**, e por isso a aba
  /// inteira precisa deste convite: nao ha busca de pessoas alcancavel sem
  /// conta, em estado nenhum. O ganho nao promete lista de gente -- promete
  /// o que a conexao destrava, que e o Mural.
  buscaDePessoas(
    titulo: 'Encontre quem você já conhece',
    ganho: 'Entre para buscar os seus vizinhos pelo nome ou pelo apelido e '
        'pedir conexão. O Mural mostra o que as suas conexões publicam, e as '
        'suas publicações aparecem para elas.',
    retomada: 'Entre de novo para buscar pessoas.',
  ),

  /// `GET /v1/timeline` — a linha do tempo do `Mural`.
  ///
  /// **A ultima superficie murada que ainda mostrava o 401 cru**, e ela ficou
  /// de fora das doze de 19/10 e das tres de 20/10 por omissao, nao por
  /// decisao: `tela_do_mural.dart` mandava toda `FalhaDeChamada` para
  /// `MensagensDeErro.de`, e o catalogo devolve `texto: ''` para
  /// `unauthenticated` desde 18/10. O que a pessoa deslogada via era o icone
  /// de erro e o botao `Entrar`, **sem uma frase** — a *falha calada* de
  /// `faixa_de_aviso.dart`, com a metade da saida ja consertada em 20/10 e a
  /// metade da frase nunca escrita.
  ///
  /// **O muro e do servidor**, e nao do produto: `getMyTimeline` declara
  /// `security: [bearerAuth]` **sem alternativa vazia** em `api/openapi.yaml` e
  /// responde `401` — ao contrario de `GET /v1/network/events` e
  /// `GET /v1/store/items`, que respondem 200 sem conta e por isso nao tem
  /// entrada neste catalogo.
  ///
  /// **O texto nao e a frase que o cliente mandou remover.** O que saiu em
  /// 18/10 foi *"entre na sua conta para continuar. O que você escreveu esta
  /// salvo aqui."*, do catalogo de erro, e ela nao volta aqui nem em lugar
  /// nenhum. Isto e o que esta classe faz nas outras quinze superficies: dizer
  /// o que a secao e e o que a pessoa ganha entrando.
  ///
  /// **O ganho promete o recorte que o contrato entrega, e nada alem.**
  /// `getMyTimeline` e "as publicacoes vivas de quem e CONEXAO ACEITA de quem
  /// chama, mais as de quem chama" — por isso o texto fala de conexao e nunca
  /// de seguir, que `getMyTimeline` nao implementa, e nunca de "a comunidade
  /// inteira", que seria o oposto do recorte.
  ///
  /// **O ganho NAO promete publicar**, e a omissao e a mesma de [meusEventos]:
  /// publicar exige, alem da conta, e-mail confirmado — `podeCriarNaComunidade`
  /// (`telas/abas.dart`) e sessao **e** `emailVerificado`, e sem isso a acao
  /// de publicar nao nasce na barra. Um ganho que dissesse *"entre para
  /// publicar"* seria desfeito no toque seguinte, para quem entrasse com o
  /// e-mail pendente. O que o texto afirma e o que vale para toda conta: o que
  /// ela passa a LER, e quem passa a ver o que ela escrever.
  ///
  /// **A segunda frase e a que ja estava escrita e revista** — ela e a mesma
  /// ideia de [buscaDePessoas], *"o Mural mostra o que as suas conexoes
  /// publicam, e as suas publicacoes aparecem para elas"*, e nao uma redacao
  /// nova inventada aqui. A redacao segue aberta a revisao do cliente.
  mural(
    titulo: 'O Mural é das suas conexões',
    ganho: 'Entre para ver o que as suas conexões publicam. As suas '
        'publicações aparecem para as pessoas com quem você se conectou, e '
        'não para quem não é conexão.',
    retomada: 'Entre de novo para ver o Mural.',
  ),

  /// `GET /v1/conversations` — a area de mensagens.
  mensagens(
    titulo: 'Suas conversas ficam aqui',
    ganho: 'Entre para falar com quem achou o seu pet e com quem você ajudou '
        'a procurar. A conversa acontece dentro do Bichu, sem você precisar '
        'passar o seu telefone.',
    retomada: 'Entre de novo para ver as suas conversas.',
  ),

  /// `GET /v1/me/notifications` — a caixa de avisos.
  notificacoes(
    titulo: 'Seus avisos ficam aqui',
    ganho: 'Entre para saber na hora quando alguém vê o seu pet, responde a '
        'uma mensagem sua ou confirma um encontro da comunidade.',
    retomada: 'Entre de novo para ver os seus avisos.',
  ),

  /// `GET /v1/pets` — `Perfil` › `Meus pets`.
  meusPets(
    titulo: 'Os seus pets ficam aqui',
    ganho: 'Entre para cadastrar o seu pet com as fotos e os sinais dele, e '
        'avisar a vizinhança num toque se ele sumir.',
    retomada: 'Entre de novo para ver os seus pets.',
  ),

  /// `GET /v1/found-reports` — `Perfil` › `Meus achados`.
  meusAchados(
    titulo: 'Os achados que você registrou',
    ganho: 'Entre para acompanhar os animais que você encontrou e falar com '
        'quem está procurando por eles.',
    retomada: 'Entre de novo para ver os seus achados.',
  ),

  /// `GET /v1/me/showcase` — `Perfil` › `Minhas fotos`.
  minhasFotos(
    titulo: 'A sua vitrine de fotos',
    ganho: 'Entre para montar a sua vitrine e mostrar quem você é para a '
        'comunidade.',
    retomada: 'Entre de novo para ver as suas fotos.',
  ),

  /// `GET /v1/directory/entries/{slug}` — a pagina de um profissional.
  ///
  /// **Alcancavel sem passar pela lista**: a rota existe e vem de link
  /// profundo e de link compartilhado, entao ela precisa do seu proprio
  /// estado de deslogado -- a lista nem foi desenhada.
  paginaDoLocal(
    titulo: 'Esta página é de quem atende perto de você',
    ganho: 'Entre para ver o que a comunidade conferiu sobre este '
        'profissional, as avaliacões de quem já foi e como falar com ele.',
    retomada: 'Entre de novo para ver esta página.',
  ),

  /// `GET /v1/conversations/{id}` — uma conversa.
  ///
  /// **E o destino do toque na notificacao**, e e por isso que ela esta aqui:
  /// quem foi deslogada e toca no aviso cai direto nesta tela, sem passar
  /// pela area.
  ///
  /// O texto nao promete que a conversa existe e nao diz de quem ela e: o
  /// servidor responde 404 para conversa de outra pessoa, nunca 403
  /// (ADR-0021), e um convite que dissesse "veja a sua conversa" confirmaria
  /// pelo texto o que o status se recusa a confirmar.
  umaConversa(
    titulo: 'As conversas ficam na sua conta',
    ganho: 'Entre para ler e responder as mensagens da sua conta. A conversa '
        'acontece dentro do Bichu, sem você precisar passar o seu telefone.',
    retomada: 'Entre de novo para ler as suas mensagens.',
  ),

  /// `GET /v1/connections/requests` — os pedidos de conexao.
  pedidosDeConexao(
    titulo: 'Os seus pedidos de conexão',
    ganho: 'Entre para ver quem quer se conectar com você e responder a cada '
        'pedido.',
    retomada: 'Entre de novo para ver os seus pedidos de conexão.',
  ),

  /// A pagina de um encontro da `Rede` — `/rede/encontros/<slug>`.
  ///
  /// **ESTA ENTRADA E A UNICA DO CATALOGO CUJA ROTA DE SERVIDOR RESPONDE
  /// 200 SEM CONTA**, e e por isso que ela e a unica que aparece em FOLHA e
  /// nunca no corpo de uma tela. Medido em 20/10/2026:
  /// `GET /v1/network/events/{slug}` **200 sem token**, e a listagem
  /// `GET /v1/network/events` devolve `total` igual e os **mesmos 23 campos**
  /// com e sem conta.
  ///
  /// Entao o muro **nao e do servidor, e o texto nao pode dizer que e.** Ele e
  /// do produto, por pedido do cliente de 20/10/2026: *"quando o usuario
  /// estiver deslogado e tentar clicar para ver detalhes de algum conteudo,
  /// como por exemplo os eventos, que ele precisa estar logado para ver mais
  /// informacoes"*.
  ///
  /// **A UNICA coisa do evento que o servidor de fato guarda atras de conta e
  /// o LUGAR EXATO**, e e ela que o `ganho` promete, porque e a unica promessa
  /// verdadeira: `GET /v1/network/events/{slug}/location` responde **401
  /// unauthenticated** sem token e 200 com token, e e dela que saem o ponto do
  /// mapa e o endereco por extenso. O resto da pagina -- `Quando`, `Sobre o
  /// evento`, cuidados, o que levar -- o servidor entrega sem conta, e o texto
  /// nao finge o contrario.
  encontroDaRede(
    titulo: 'Entre para ver este evento',
    ganho: 'Entre para ver o endereço no mapa, o horário, o que levar e os '
        'cuidados combinados para o encontro.',
    retomada: 'Entre de novo para ver este evento.',
  ),

  /// `GET /v1/pets/{petId}` — a pagina de um pet (`T.1`).
  ///
  /// **Alcancavel SEM passar pela lista**, que e o que a traz para este
  /// catalogo: a rota existe por endereco e vem de link compartilhado e de
  /// link profundo. Medido na homologacao em 20/10/2026, sem token:
  /// `401 unauthenticated` com `next_action: sign_in`.
  ///
  /// **O que a tela mostrava no lugar deste convite era o defeito de 19/10 em
  /// pessoa, e ele nao tinha sido corrigido aqui:** o catalogo devolve
  /// `texto: ''` para `unauthenticated`, e `_ehForaDaConta` so reconhece 404 --
  /// entao o 401 caia no ramo de falha e desenhava uma [FaixaDeAviso] de ERRO
  /// com NENHUMA frase e um `Atualizar` ao lado. Atualizar nao resolve um 401.
  ///
  /// **O texto nao promete o pet de ninguem**, e a razao e a mesma da
  /// [umaConversa]: pet de outra conta responde 404 e nunca 403 (ADR-0021), e
  /// um convite que dissesse "veja o seu pet" afirmaria pelo texto o que o
  /// status se recusa a confirmar.
  paginaDoPet(
    titulo: 'Esta página é de um pet',
    ganho: 'Entre para ver a ficha do pet, com as fotos e os sinais dele, e '
        'cuidar dos seus pets num lugar só.',
    retomada: 'Entre de novo para ver esta página.',
  ),

  /// `GET /v1/found-reports/{id}` — a pagina de um achado (`/achados/:id`).
  ///
  /// Mesma razao de [paginaDoPet]: endereco proprio, alcancavel por link, e o
  /// 401 caia no ramo de erro com frase vazia e `Tentar de novo`. Medido em
  /// 20/10/2026: `401 unauthenticated`, `next_action: sign_in`.
  ///
  /// **O ganho fala de ACOMPANHAR e nao de registrar**, e a distincao e de
  /// produto: registrar um achado **nao** exige conta (`createFoundReport`
  /// declara `security: [bearerAuth, {}]`), e prometer conta para isso
  /// afastaria exatamente quem esta com o animal no colo. O que exige conta e
  /// voltar depois para ver o que deu no registro.
  paginaDoAchado(
    titulo: 'Esta página é de um achado',
    ganho: 'Entre para acompanhar o animal que você encontrou e falar com '
        'quem está procurando por ele.',
    retomada: 'Entre de novo para ver este achado.',
  ),

  /// `GET /v1/people/{handle}` — o perfil de uma pessoa.
  ///
  /// **Alcancavel por link compartilhado**, e dentro do app so a partir da
  /// foto de um participante da conversa -- que ja exige conta. Medido em
  /// 20/10/2026, sem token: `401 unauthenticated`, `next_action: sign_in`.
  ///
  /// **O texto nao diz o nome nem o apelido de quem a pagina e**, e a ausencia
  /// e deliberada: perfil oculto, bloqueado, denunciado ou inexistente
  /// responde o MESMO 404 de proposito (`TelaDePerfilDePessoa.naoEncontramos`),
  /// e um convite que repetisse o apelido confirmaria a existencia da pessoa a
  /// quem ainda nao tem permissao para saber disso.
  paginaDaPessoa(
    titulo: 'Esta página é de uma pessoa da comunidade',
    ganho: 'Entre para ver quem é, os pets dela e as conexões que vocês têm '
        'em comum, e pedir conexão.',
    retomada: 'Entre de novo para ver esta página.',
  ),

  /// `GET /v1/network/my-events` — `Perfil` › `Meus eventos`.
  ///
  /// **O texto nao promete nada sobre a agenda**, que e navegavel sem conta: o
  /// que exige conta e o "meu". Criar encontro exige, alem da conta, e-mail
  /// confirmado (`409 contact-channel-unverified`), e por isso o ganho fala de
  /// marcar e cuidar, e nao garante que a pessoa podera criar no toque
  /// seguinte -- promessa que a faixa de cadastro incompleto do `Perfil` e que
  /// desfaz, com o `Reenviar` ao lado.
  meusEventos(
    titulo: 'Os encontros que você marcou',
    ganho: 'Entre para ver os encontros que você marcou com a comunidade e '
        'cuidar de cada um.',
    retomada: 'Entre de novo para ver os seus encontros.',
  );

  const SecaoComConta({
    required this.titulo,
    required this.ganho,
    required this.retomada,
  });

  /// O que a secao e, para quem nunca entrou.
  final String titulo;

  /// O que a pessoa ganha entrando. **Nao e uma recusa**: nenhuma frase daqui
  /// diz o que ela nao pode fazer.
  final String ganho;

  /// A frase de quem estava dentro e caiu. Diz o que ela volta a ver, e nao
  /// o que ela ganharia -- ela ja tinha.
  final String retomada;
}

/// A FALHA E FALTA DE CONTA, e nao defeito? **Quem responde e o servidor.**
///
/// A decisao sai de `next_action` do corpo `application/problem+json`
/// (RFC 9457), e nao de um `switch` no status nem no `type`. Os dois 401 que
/// chegam a uma tela de leitura -- `unauthenticated` e `token-expired` --
/// trazem `next_action: sign_in`, medido na homologacao em 19/10/2026, e e
/// esse campo que o contrato declara como *"o caminho alternativo que o
/// servidor oferece"*. Adivinhar pelo status repetiria o defeito que
/// `problem.dart` descreve: acerta hoje por sorte e erra calado amanha.
///
/// Devolve falso para falha de conexao e para 5xx: sem rede, a pessoa pode
/// estar perfeitamente logada, e trocar a tela dela por um convite para entrar
/// diria que a conta dela nao existe porque o elevador nao tem sinal.
bool faltaConta(Object falha) {
  if (falha is! FalhaDaApi) return false;
  return falha.problem.proximaAcao == ProximaAcao.entrar;
}


/// O convite NUMA FOLHA CURTA, no momento do toque.
///
/// ## Por que folha, e nao texto no cartao nem tela cheia
///
/// Pedido do cliente de 20/10/2026, e as tres formas foram medidas contra ele:
///
/// - **Texto no proprio cartao**: reprovado por ele mesmo. O cartao da agenda
///   e `foto + titulo` por decisao dele de 19/10 (*"apenas a foto e o titulo
///   do evento"*), e uma linha de "entre para ver mais" em cada cartao e
///   informacao nova em VINTE cartoes -- exatamente o que ele acabou de mandar
///   tirar. Ha isca contando os `Text` do cartao.
/// - **Convite de tela cheia**: esconderia a agenda. A listagem responde 200
///   sem conta (medido), e trocar o conteudo publico por um muro seria o
///   contrario do produto. Esta forma fica para a aba `Comunidade`, onde o
///   muro e da LISTA.
/// - **Folha curta**: a agenda fica atras, visivel, e a informacao aparece no
///   lugar do toque. E esta.
///
/// ## O que ela NAO faz
///
/// **Nao decide o texto.** Quem decide e [ConviteParaEntrar], a partir do
/// [MotivoSemConta] lido do controlador: quem nunca entrou ve as duas portas,
/// quem caiu ve `Sua sessão expirou` e so `Entrar`. Nenhuma frase nova foi
/// escrita para a folha -- ela mostra o MESMO convite das outras doze telas.
///
/// **Nao e `isScrollControlled` por capricho**: com escala de texto em 200% o
/// convite passa da metade da tela, e sem isso a folha corta o botao
/// `Criar conta` -- que e a unica saida de quem nao tem conta.
Future<void> mostrarConviteParaEntrar(
  BuildContext context, {
  required SecaoComConta secao,
  String? rotaDeVolta,
}) {
  return showModalBottomSheet<void>(
    context: context,
    showDragHandle: true,
    useSafeArea: true,
    isScrollControlled: true,
    builder: (contexto) => SingleChildScrollView(
      child: Padding(
        padding: const EdgeInsets.fromLTRB(
          BichuEspaco.e4,
          0,
          BichuEspaco.e4,
          BichuEspaco.e4,
        ),
        child: ConviteParaEntrar(
          secao: secao,
          rotaDeVolta: rotaDeVolta,
          emFolha: true,
        ),
      ),
    ),
  );
}
