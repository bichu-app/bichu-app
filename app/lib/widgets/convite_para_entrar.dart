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
class ConviteParaEntrar extends StatelessWidget {
  const ConviteParaEntrar({
    required this.secao,
    super.key,
    this.rotaDeVolta,
    this.emFolha = false,
  });

  /// Qual secao esta sendo explicada.
  final SecaoComConta secao;

  /// O endereco para onde a pessoa volta **depois** de entrar.
  final String? rotaDeVolta;

  /// Este convite esta dentro de uma folha, e nao no corpo de uma tela.
  final bool emFolha;

  /// Guarda a volta, fecha a folha se houver uma, e abre [rota].
  Future<void> _abrir(BuildContext context, String rota) async {
    final volta = rotaDeVolta;
    final roteador = GoRouter.of(context);
    final navegador = Navigator.of(context);
    if (volta != null) {
      final guarda = Escopo.of(context).guarda;
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
          if (!caiu) ...<Widget>[
            const SizedBox(height: BichuEspaco.e4),
            BotaoSecundario(
              rotulo: rotuloDeCriarConta,
              aoTocar: () => unawaited(_abrir(context, Rotas.criarConta)),
            ),
          ],
        ],
      ),
    );
  }

  /// O titulo de quem estava dentro e caiu.
  static const String tituloDaSessaoQueCaiu = 'Sua sessão expirou';

  static const String rotuloDeEntrar = 'Entrar';
  static const String rotuloDeCriarConta = 'Criar conta';
}

/// As superficies que exigem conta, com o texto de cada uma.
enum SecaoComConta {
  /// `GET /v1/directory/entries` — a aba `Profissionais` de `Perto`.
  diretorio(
    titulo: 'Quem atende bem, perto de você',
    ganho: 'Entre para ver os profissionais e os locais que a comunidade '
        'indicou na sua região, com o que já foi conferido sobre cada um.',
    retomada: 'Entre de novo para ver quem atende perto de você.',
  ),

  /// `GET /v1/people` — a aba `Usuarios` da `Rede`.
  buscaDePessoas(
    titulo: 'Encontre quem você já conhece',
    ganho: 'Entre para buscar os seus vizinhos pelo nome ou pelo apelido e '
        'pedir conexão. O Mural mostra o que as suas conexões publicam, e as '
        'suas publicações aparecem para elas.',
    retomada: 'Entre de novo para buscar usuários.',
  ),

  /// `GET /v1/timeline` — a linha do tempo do `Mural`.
  mural(
    titulo: 'O Mural é das suas conexões',
    ganho: 'Entre para ver o que as suas conexões publicam. As suas '
        'publicações aparecem para os usuários com quem você se conectou, e '
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
  paginaDoLocal(
    titulo: 'Esta página é de quem atende perto de você',
    ganho: 'Entre para ver o que a comunidade conferiu sobre este '
        'profissional, as avaliacões de quem já foi e como falar com ele.',
    retomada: 'Entre de novo para ver esta página.',
  ),

  /// `GET /v1/conversations/{id}` — uma conversa.
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

  /// `GET /v1/connections` — a tela `Conexoes` (cliente, 22/10/2026).
  minhasConexoes(
    titulo: 'As suas conexões ficam aqui',
    ganho: 'Entre para ver quem já é sua conexão, abrir o perfil de cada '
        'usuário e acompanhar o que eles publicam no Mural.',
    retomada: 'Entre de novo para ver as suas conexões.',
  ),

  /// A pagina de um encontro da `Rede` — `/rede/encontros/<slug>`.
  encontroDaRede(
    titulo: 'Entre para ver este evento',
    ganho: 'Entre para ver o endereço no mapa, o horário, o que levar e os '
        'cuidados combinados para o encontro.',
    retomada: 'Entre de novo para ver este evento.',
  ),

  /// `GET /v1/pets/{petId}` — a pagina de um pet (`T.1`).
  paginaDoPet(
    titulo: 'Esta página é de um pet',
    ganho: 'Entre para ver a ficha do pet, com as fotos e os sinais dele, e '
        'cuidar dos seus pets num lugar só.',
    retomada: 'Entre de novo para ver esta página.',
  ),

  /// `GET /v1/found-reports/{id}` — a pagina de um achado (`/achados/:id`).
  paginaDoAchado(
    titulo: 'Esta página é de um achado',
    ganho: 'Entre para acompanhar o animal que você encontrou e falar com '
        'quem está procurando por ele.',
    retomada: 'Entre de novo para ver este achado.',
  ),

  /// `GET /v1/people/{handle}` — o perfil de uma pessoa.
  paginaDaPessoa(
    titulo: 'Esta página é de um usuário da comunidade',
    ganho: 'Entre para ver quem é, os pets dela e as conexões que vocês têm '
        'em comum, e pedir conexão.',
    retomada: 'Entre de novo para ver esta página.',
  ),

  /// `GET /v1/network/my-events` — `Perfil` › `Meus eventos`.
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

  /// O que a pessoa ganha entrando.
  final String ganho;

  /// A frase de quem estava dentro e caiu.
  final String retomada;
}

/// A FALHA E FALTA DE CONTA, e nao defeito?
bool faltaConta(Object falha) {
  if (falha is! FalhaDaApi) return false;
  return falha.problem.proximaAcao == ProximaAcao.entrar;
}

/// O convite NUMA FOLHA CURTA, no momento do toque.
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
