import 'package:flutter/material.dart';
import 'package:go_router/go_router.dart';

import '../api/falhas.dart';
import '../api/problem.dart';
import '../escopo.dart';
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
class ConviteParaEntrar extends StatelessWidget {
  const ConviteParaEntrar({required this.secao, super.key});

  /// Qual secao esta sendo explicada. Ver [SecaoComConta].
  final SecaoComConta secao;

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
          const SizedBox(height: BichuEspaco.e6),
          BotaoPrimario(
            rotulo: rotuloDeEntrar,
            aoTocar: () => context.push(Rotas.entrar),
          ),
          // A SEGUNDA PORTA SO PARA QUEM NAO TEM CONTA. Ver a prosa da classe.
          if (!caiu) ...<Widget>[
            const SizedBox(height: BichuEspaco.e4),
            BotaoSecundario(
              rotulo: rotuloDeCriarConta,
              aoTocar: () => context.push(Rotas.criarConta),
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
/// **Toda entrada daqui foi medida contra a homologacao em 19/10/2026**, sem
/// token: as sete respondem `401 unauthenticated` com `next_action: sign_in`.
/// Nenhuma secao publica tem entrada aqui -- `/v1/network/events` (a agenda da
/// `Rede`), `/v1/store/items` (a `Loja`) e a listagem publica de perdidos
/// respondem 200 sem conta, e um convite nelas inventaria um muro.
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
