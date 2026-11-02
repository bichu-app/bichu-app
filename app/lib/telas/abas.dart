import 'dart:async';

import 'package:flutter/material.dart';
import 'package:go_router/go_router.dart';

import '../escopo.dart';
import '../roteamento/rotas.dart';
import '../roteamento/saida_da_mensagem.dart';
import '../sessao/controlador_de_sessao.dart';
import '../theme/bichu_tokens.g.dart';
import '../api/falhas.dart';
import '../api/mensagens_de_erro.dart';
import '../api/mural_api.dart';
import '../api/problem.dart';
import '../api/reautenticacao.dart';
import '../widgets/acao_de_criar_flutuante.dart';
import '../widgets/botao_primario.dart';
import '../widgets/carimbo_do_build.dart';
import '../widgets/faixa_de_aviso.dart';
import '../widgets/folha_de_senha.dart';
import '../widgets/item_de_menu.dart';
import '../widgets/marca.dart';
import 'ajuda/tela_de_duvida.dart';
import 'avisos/aviso_de_cadastro_incompleto.dart';
import 'avisos/antessala_de_aviso.dart';
import 'casca_com_abas.dart';
import 'conexoes/tela_minhas_conexoes.dart';
import 'conexoes/tela_pedidos_de_conexao.dart';
import 'mural/tela_do_mural.dart';
import 'perdido/lista_de_perdidos.dart';
import 'perfil/meus_achados.dart';
import 'perfil/meus_eventos.dart';
import 'perfil/meus_pets.dart';
import 'perfil/vitrine_de_fotos.dart';
import 'perto/tela_de_minhas_indicacoes.dart';
import 'rede/secao_da_rede.dart';
import 'loja/vitrine_da_loja.dart';

/// Quem pode ver uma acao de CRIAR da comunidade.
bool podeCriarNaComunidade(ControladorDeSessao sessao) {
  final usuario = sessao.usuario;
  return sessao.logado && usuario != null && usuario.emailVerificado;
}

/// Secao 1 — `Pets`. A casa dos perdidos, dos achados e das adocoes.
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
          raizDeSecao: true,
          titulo: destino.rotulo,
          reforco: destino.reforcoDaPagina,
          acaoDeCriar: AcaoDeCriarFlutuante(
            icone: Icons.qr_code_scanner,
            rotulo: 'Escanear uma tag',
            aoTocar: () => context.push(Rotas.escanear),
          ),
          filhos: <Widget>[
            if (logado && usuario != null)
              AvisoDeCadastroIncompleto(
                key: ValueKey<String>('aviso-inicio-${usuario.id}'),
                usuario: usuario,
              ),
            const ListaDePerdidos(),
          ],
        );
      },
    );
  }
}

/// Secao 2 — `Rede`. **Eventos e quem atende bem.**
class AbaRede extends StatelessWidget {
  const AbaRede({super.key});

  /// Qual aba o endereco pede, ou nulo quando ele nao pede nenhuma.
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

/// Secao 3 — `Mural`. **O LUGAR da linha do tempo.**
class AbaMural extends StatefulWidget {
  const AbaMural({super.key});

  @override
  State<AbaMural> createState() => _AbaMuralState();
}

class _AbaMuralState extends State<AbaMural> {
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
      reforco: null,
      acaoDeCriar: podeCriarNaComunidade(sessao)
          ? AcaoDeCriarFlutuante(
              icone: Icons.post_add,
              rotulo: 'Publicar',
              aoTocar: _abrirPublicar,
            )
          : null,
      filhos: <Widget>[
        () {
          final porta = MuralApi(escopo.api);
          return CorpoDoMural(
            key: ValueKey<int>(_publicacoes),
            leitura: porta,
            interacao: porta,
            // A REGUA AQUI E `canalConfirmado`, e NAO `emailVerificado` de
            // `podeCriarNaComunidade` acima. As duas quase sempre coincidem, e
            // a que decide o estado vazio tem de ser a MESMA que o servidor usa
            // para filtrar a audiencia desde 02/11/2026:
            // `email_verified_at IS NOT NULL OR phone_verified_at IS NOT NULL`.
            canalConfirmado: sessao.usuario?.canalConfirmado ?? false,
          );
        }(),
      ],
    );
  }
}

/// Secao 4 — `Loja`. A vitrine curada que leva a loja do parceiro.
class AbaLoja extends StatelessWidget {
  const AbaLoja({super.key});

  @override
  Widget build(BuildContext context) {
    final destino = CascaComAbas.porRota(Rotas.loja);
    return TelaDeAba(
      raizDeSecao: true,
      titulo: destino.rotulo,
      reforco: null,
      filhos: const <Widget>[VitrineDaLoja()],
    );
  }
}

/// Secao 5 — `Perfil`. A conta do tutor.
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
              BotaoSecundario(
                rotulo: 'Escanear uma tag',
                aoTocar: () => context.push(Rotas.escanear),
              ),
            ],
          );
        }

        return TelaDeAba(
          raizDeSecao: true,
          titulo: tituloDaTelaDaConta(sessao.usuario?.nome),
          reforco: destino.reforcoDaPagina,
          filhos: <Widget>[
            if (sessao.usuario != null)
              AvisoDeCadastroIncompleto(
                key: ValueKey<String>('aviso-perfil-${sessao.usuario!.id}'),
                usuario: sessao.usuario!,
              ),
            const _AvisoPorPertoDesligado(),
            MeusPets(
              key: ValueKey<String>('meus-pets-${sessao.usuario?.id ?? ''}'),
              cache: Escopo.of(context).cacheDeMeusPets,
              teto: MeusPets.tetoDoPerfil,
            ),
            const SizedBox(height: BichuEspaco.e6),

            const TituloDeGrupoDeMenu('Conta'),
            ItemDeMenu(
              rotulo: 'Meus dados',
              aoTocar: () => context.push(Rotas.dadosPessoais),
            ),
            ItemDeMenu(
              rotulo: VitrineDeFotosDoUsuario.tituloDaTela,
              aoTocar: () => context.push(Rotas.minhaVitrine),
            ),
            const SizedBox(height: BichuEspaco.e6),
            const TituloDeGrupoDeMenu('Pets na rua'),
            ItemDeMenu(
              rotulo: 'Escanear uma tag',
              aoTocar: () => context.push(Rotas.escanear),
            ),
            ItemDeMenu(
              rotulo: MeusAchados.titulo,
              aoTocar: () => context.push(Rotas.meusAchados),
            ),
            const SizedBox(height: BichuEspaco.e6),
            const TituloDeGrupoDeMenu('Comunidade'),
            const _LinhaDeConexoes(),
            ItemDeMenu(
              rotulo: MeusEventos.titulo,
              aoTocar: () => context.push(Rotas.meusEventos),
            ),
            ItemDeMenu(
              rotulo: TelaDeMinhasIndicacoes.titulo,
              aoTocar: () => context.push(Rotas.minhasIndicacoes),
            ),
            const SizedBox(height: BichuEspaco.e6),
            ItemDeMenu(
              rotulo: TelaDeDuvida.titulo,
              aoTocar: () => context.push(Rotas.ajuda),
            ),
            _ItemDeExcluirAConta(sessao: sessao),
            _ItemDeSair(sessao: sessao),
            const CarimboDoBuild(),
          ],
        );
      },
    );
  }
}

/// O logotipo no alto do `Perfil` deslogado.
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
class _LinhaDeConexoes extends StatefulWidget {
  const _LinhaDeConexoes();

  @override
  State<_LinhaDeConexoes> createState() => _EstadoDaLinhaDeConexoes();
}

class _EstadoDaLinhaDeConexoes extends State<_LinhaDeConexoes> {
  int? _recebidos;

  bool _pediu = false;

  @override
  void didChangeDependencies() {
    super.didChangeDependencies();
    if (_pediu) return;
    _pediu = true;
    unawaited(_ler());
  }

  Future<void> _ler() async {
    try {
      final resumo = await Escopo.of(context).conexoes.resumo();
      if (!mounted) return;
      setState(() => _recebidos = resumo.requestsReceivedCount);
    } on Object catch (erro) {
      if (!mounted) return;
      if (erro is! FalhaDeChamada) {
        // **SILENCIO DELIBERADO, e nao esquecimento** -- o mesmo arranjo de `FiacaoDoPasskey.reconciliarComAConta`, e pela mesma razao.
      }
      setState(() => _recebidos = null);
    }
  }

  @override
  Widget build(BuildContext context) {
    final quantos = _recebidos;
    return ItemDeMenu(
      rotulo: TelaDeMinhasConexoes.titulo,
      contador: quantos,
      rotuloDoContador: quantos == null
          ? null
          : TelaDePedidosDeConexao.quantosEsperam(quantos),
      aoTocar: () => context.push(Rotas.minhasConexoes),
    );
  }
}

class _ItemDeSair extends StatelessWidget {
  const _ItemDeSair({required this.sessao});

  final ControladorDeSessao sessao;

  @override
  Widget build(BuildContext context) {
    return ItemDeMenu(
      rotulo: 'Sair da conta',
      critico: true,
      aoTocar: () async {
        final confirmou = await showModalBottomSheet<bool>(
          context: context,
          showDragHandle: true,
          builder: (context) => const _FolhaDeSair(),
        );
        if (confirmou != true) return;
        if (!context.mounted) return;
        Escopo.of(context).cacheDeMeusPets.limpar();
        await sessao.sair();
        if (!context.mounted) return;
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

/// OS TEXTOS DA EXCLUSAO DA CONTA, num lugar so.
///
/// Eles sao as palavras do CONTRATO e nao as minhas: `DELETE /v1/me`
/// (`deleteMyAccount`) declara *"Exclusao logica imediata, expurgo definitivo
/// em 30 dias. Casos abertos sao encerrados e as tags, revogadas."*. Nenhum
/// prazo, nenhum efeito e nenhuma ressalva daqui foi inventada: o que o
/// contrato nao declara, a folha nao promete -- e por isso NENHUMA frase
/// daqui oferece desfazer, recuperar ou falar com alguem para voltar atras.
/// O contrato nao tem rota de arrependimento, e prometer uma na tinta seria
/// a pior forma de mentir que este fluxo tem.
///
/// ## O CRITERIO QUE MANDA NAS QUATRO REDACOES DE DESFECHO
///
/// Nenhuma frase pode deixar quem leu em duvida sobre se a conta foi excluida
/// ou nao. Isso NAO e estilo: a conta e o unico objeto do produto que nao da
/// para conferir depois -- quem ficou em duvida nao tem onde olhar, porque o
/// lugar onde ela olharia e exatamente o que pode ter deixado de existir.
///
/// A duvida e DECIDIVEL em quase todos os desfechos, e a regra e do contrato:
///
///   - [FalhaDaApi] e resposta de erro no formato do contrato, e resposta de
///     erro NAO e `202`. Entao o pedido nao foi aceito, e [contaIntacta] e
///     verdade com certeza -- vale para o teto, para o 5xx, para o 401 e para
///     o que o catalogo redigir.
///   - [FalhaDeConexao] e [FalhaDeEnderecoRecusado] sao falhas em que a
///     requisicao NAO SAIU. Mesma certeza.
///   - [FalhaDeTempo] e a UNICA em que a requisicao saiu e a resposta nao
///     voltou. Aqui afirmar seria inventar, e por isso [semResposta] nao
///     afirma: ela diz como a pessoa DESCOBRE, em vez de deixa-la sem saber
///     onde olhar. Ver a prosa de [semResposta].
abstract final class TextosDaExclusaoDaConta {
  /// O rotulo do item de menu, e e o MESMO do inventario de sub-destinos
  /// (`RegistroDeSubDestinos`, UX 27.5.5) -- a gaveta nomeava `Excluir a
  /// conta` desde o inicio e nunca teve tela do outro lado.
  static const String rotulo = 'Excluir a conta';

  static const String titulo = 'Excluir a sua conta?';

  /// `irreversible_write` em `x-effects` virado em frase.
  static const String semVolta = 'Não dá para desfazer.';

  static const String prazo =
      'A sua conta sai do ar na hora. O apagamento definitivo dos seus '
      'dados acontece 30 dias depois.';

  static const String casos =
      'Os casos de pet perdido que estiverem em aberto são encerrados.';

  static const String plaquinhas =
      'As plaquinhas dos seus pets são revogadas: o QR delas para de abrir a '
      'página do pet.';

  static const String agoraNao = 'Agora não';

  /// O `motivo` que a FOLHA DE SENHA mostra, nas palavras desta operacao.
  ///
  /// A folha tem um motivo padrao generico (`Esta ação não pode ser desfeita,
  /// então pedimos a sua senha de novo`), e ele nao serve aqui: a senha vai
  /// ser pedida para seis operacoes destrutivas diferentes, e quem le precisa
  /// saber QUAL delas esta sendo confirmada antes de digitar. Senha digitada
  /// para a acao errada e o unico erro deste fluxo que a pessoa comete sem
  /// ter como perceber.
  static const String motivoDaSenha =
      'Confirme a sua senha para excluir a sua conta. Isso não dá para '
      'desfazer.';

  // -------------------------------------------------------------------------
  // O DESFECHO DE SUCESSO (o `202`)
  // -------------------------------------------------------------------------

  /// O titulo depois do `202`. **Esta no passado e no indicativo** de
  /// proposito: `Pronto!` ou `Recebemos o seu pedido` deixariam a pessoa sem
  /// saber se a conta saiu ou se ela entrou numa fila.
  static const String tituloConcluido = 'A sua conta foi excluída.';

  /// O que ela precisa saber depois do `202`, e por que ela precisa saber.
  ///
  /// O `202` NAO e um recibo de nada: o contrato declara exclusao logica
  /// IMEDIATA e expurgo em 30 dias, e os dois fatos tem consequencia para
  /// quem leu. O primeiro explica por que o app vai se comportar como se a
  /// conta nao existisse a partir de agora; o segundo e o unico prazo que o
  /// contrato declara, e esconde-lo faria a pessoa achar que tudo ja virou po.
  ///
  /// `você não precisa fazer mais nada` nao e enfeite: o resto (encerrar os
  /// casos, revogar as plaquinhas, agendar o expurgo) e trabalho do servidor,
  /// e quem sai sem essa frase fica procurando um passo que nao existe.
  static const String concluido =
      'Ela já saiu do ar. O apagamento definitivo dos seus dados acontece 30 '
      'dias depois deste pedido, e você não precisa fazer mais nada.';

  /// O aviso da saida, dito ANTES de ela acontecer.
  ///
  /// A sessao deste aparelho morre junto com a conta, e ser mandado para a
  /// tela de entrada sem uma palavra parece defeito, nao desfecho.
  static const String desconexao =
      'Ao fechar esta mensagem, este aparelho vai ser desconectado.';

  static const String entendi = 'Entendi';

  // -------------------------------------------------------------------------
  // AS RECUSAS
  // -------------------------------------------------------------------------

  /// A frase que RESOLVE a duvida, e a unica coisa que toda recusa decidivel
  /// tem obrigatoriamente.
  ///
  /// Ela aparece colada em cada redacao abaixo em vez de ser concatenada em
  /// tempo de execucao, porque faixa de erro se le inteira ou nao se le: uma
  /// frase montada de dois pedacos chega com a emenda no meio justamente no
  /// desfecho em que a pessoa esta mais apressada. A repeticao do texto e o
  /// preco, e e barato.
  static const String contaIntacta =
      'A sua conta não foi excluída e continua no ar.';

  /// O TETO DE 3 PEDIDOS POR 24 H (`deny_429`), e ele e recusa de verdade.
  ///
  /// Quem chega aqui pediu a exclusao tres vezes num dia, e o quarto pedido
  /// NAO foi aceito. A frase diz o numero porque o teto sem numero parece
  /// arbitrario, e diz quando volta a valer porque *tente mais tarde* nao
  /// responde a unica pergunta que importa.
  static const String pedidosDemais =
      'Você já pediu a exclusão desta conta 3 vezes nas últimas 24 horas, que '
      'é o limite. Este pedido não foi aceito: a sua conta não foi excluída e '
      'continua no ar. Tente de novo amanhã.';

  /// OFFLINE. `O pedido não saiu daqui` e a parte que decide a duvida: numa
  /// [FalhaDeConexao] a requisicao nao chegou a existir no fio.
  static const String semConexao =
      'O pedido não saiu daqui: você está sem conexão. A sua conta não foi '
      'excluída e continua no ar. Tente de novo quando tiver sinal.';

  /// SERVIDOR FORA (5xx, e tambem o endereco recusado).
  ///
  /// Aproveita a abertura do catalogo (`MensagensDeErro.servidorFora`) para
  /// nao inventar uma segunda voz para a mesma situacao, e acrescenta o que o
  /// catalogo nao tem como saber: que nada foi excluido.
  static const String servidorFora =
      'O Bichu está fora do ar por alguns minutos, e o pedido não foi aceito: '
      'a sua conta não foi excluída e continua no ar. Tente de novo em '
      'seguida.';

  /// O TEMPO ESGOTADO, e e o UNICO desfecho em que a resposta honesta nao e
  /// uma afirmacao.
  ///
  /// A requisicao saiu e a resposta nao voltou: o servidor pode ter aceito o
  /// pedido e pode nao ter. Dizer *nada foi excluido* seria chutar para o
  /// lado confortavel, e dizer *nao sabemos* deixaria a pessoa exatamente na
  /// duvida que este fluxo nao tolera.
  ///
  /// A saida e dar a ela o TESTE: a sessao deste aparelho morre junto com a
  /// conta, entao reabrir o app responde a pergunta sozinho. E o unico lugar
  /// deste fluxo em que a frase ensina a medir em vez de afirmar.
  static const String semResposta =
      'O pedido saiu, mas a resposta não voltou no tempo esperado. Feche e '
      'abra o Bichu para saber: se a exclusão foi aceita, você vai cair na '
      'tela de entrada; se continuar dentro da sua conta, ela não foi '
      'excluída e dá para pedir de novo.';

  /// `401 reauthentication-required` VINDO DO PROPRIO `DELETE`.
  ///
  /// ## Por que esta recusa NAO usa a saida do catalogo
  ///
  /// O catalogo redige esta recusa com a acao `Confirmar`, que
  /// `saidaDaMensagem` liga na folha de senha pelo `escopoDeSenha`. Aqui essa
  /// saida seria uma armadilha, e o comentario de
  /// `roteamento/saida_da_mensagem.dart` ja diz por que, com estas palavras:
  /// a folha devolve a janela e aquela funcao *a descarta*, porque uma
  /// `VoidCallback` nao tem para quem devolver -- a saida serve para a pessoa
  /// REABRIR a janela vencida, **nao** para refazer a operacao destrutiva
  /// sozinha. Quem tocasse `Confirmar` ali digitaria a senha, veria a folha
  /// fechar, e a conta continuaria no ar sem uma palavra de explicacao.
  ///
  /// Entao esta folha trata o caso ela mesma: a saida e [tentarDeNovo], que
  /// recomeca o fluxo DELA -- pede a senha e, com a janela na mao, chama o
  /// `DELETE` de novo. E por isso tambem que ela NAO passa `escopoDeSenha`
  /// para o catalogo: rotulo que leva a um lugar que nao conclui a acao e
  /// pior que rotulo nenhum.
  static const String confirmacaoVencida =
      'A confirmação da senha não valeu para este pedido: ela vale por poucos '
      'minutos e serve uma vez só. A sua conta não foi excluída e continua no '
      'ar. Peça de novo e confirme a senha na hora.';

  static const String tentarDeNovo = 'Tentar de novo';
}

/// `Excluir a conta` — a folha inferior destrutiva do `Perfil`.
///
/// **O QUE ACONTECE DEPOIS DO `202`, e por que a ordem e esta.** O contrato
/// declara exclusao logica IMEDIATA: no instante em que o servidor responde,
/// a sessao que este aparelho tem na mao vale para uma conta que nao esta
/// mais no ar. O vizinho `_ItemDeSair` ja carrega a limpeza certa -- limpar
/// `cacheDeMeusPets`, `sessao.sair()`, `context.go(Rotas.entrar)` --, e ela e
/// seguida aqui tal e qual.
///
/// O QUE FOI ACRESCENTADO AO VIZINHO, e nao e enfeite: entre o `202` e a tela
/// de entrada entra uma PALAVRA. `_ItemDeSair` pode mandar a pessoa embora em
/// silencio porque sair da conta e reversivel e ela sabe o que fez; excluir
/// nao e nenhuma das duas coisas. Quem acaba de apagar a propria conta merece
/// ler que funcionou e que existe um prazo de 30 dias antes do apagamento
/// definitivo -- e esse prazo e informacao que ela nao tem como obter depois,
/// porque depois ela nao tem mais conta de onde ler nada.
///
/// **A ORDEM, que e o lugar onde isto da errado em silencio:** limpar o cache
/// e derrubar a sessao acontecem DEPOIS de o servidor confirmar, nunca antes.
/// Se a chamada falha e a sessao ja foi derrubada, a pessoa e deslogada sem
/// ter excluido nada -- e, pior, cai na tela de entrada acreditando que
/// excluiu. O `202` e a unica autorizacao para mexer no estado local, e e por
/// isso que [_FolhaDeExcluirAConta] nao limpa nem desloga nada: ela sinaliza
/// que o servidor confirmou, e a limpeza mora aqui, depois da folha.
///
/// **O SINALIZADOR NAO E O VALOR DO `pop`, e a escolha e medida**: a folha
/// pode sumir de quatro maneiras depois do `202` -- o `Entendi`, o arrasto
/// para baixo, o toque fora e o voltar do sistema --, e o arrasto chama
/// `Navigator.pop` sem valor nenhum. Amarrar a limpeza ao valor devolvido
/// deixaria a sessao de uma conta MORTA viva no aparelho, dependendo de como
/// a folha foi fechada. O sinalizador e escrito quando o SERVIDOR confirma e
/// lido depois que a folha some, de qualquer maneira que ela tenha sumido.
///
/// **NAO ESTA NA GAVETA, e a escolha e medida**: a gaveta de secoes esta
/// OCULTA por decisao do cliente de 19/10/2026 (*"vamos ocultar o menu por
/// enquanto"*), entao pendurar a exclusao nela seria declara-la alcancavel
/// sem que ela fosse. O `Perfil` e alcancavel de TODA raiz de secao pelo
/// `AvatarDaConta` do `leading` da barra de topo
/// (`casca_com_abas.dart`), e e por isso que o item mora aqui, ao lado de
/// `Sair da conta`.
///
/// **ELA VEM ACIMA DE `Sair da conta`, e nao abaixo**: o cliente foi literal em
/// 18/10/2026 -- *"o sair da conta deve ser sempre a ultima opcao do menu"* --,
/// e ha portao de COORDENADA cobrando isso (`exigirSairPorUltimo`, em
/// `perfil_ordem_dos_itens_test.dart`). Por baixo do `Sair` nao entra bloco
/// nenhum, nem este.
class _ItemDeExcluirAConta extends StatelessWidget {
  const _ItemDeExcluirAConta({required this.sessao});

  final ControladorDeSessao sessao;

  @override
  Widget build(BuildContext context) {
    return ItemDeMenu(
      rotulo: TextosDaExclusaoDaConta.rotulo,
      critico: true,
      aoTocar: () async {
        bool servidorConfirmou = false;
        await showModalBottomSheet<void>(
          context: context,
          showDragHandle: true,
          isScrollControlled: true,
          builder: (context) => _FolhaDeExcluirAConta(
            aoServidorConfirmar: () => servidorConfirmou = true,
          ),
        );
        if (!servidorConfirmou) return;
        if (!context.mounted) return;
        Escopo.of(context).cacheDeMeusPets.limpar();
        await sessao.sair();
        if (!context.mounted) return;
        context.go(Rotas.entrar);
      },
    );
  }
}

/// A folha que diz as consequencias, pede a senha e pede a exclusao.
///
/// Ela e `StatefulWidget` porque tem TRES estados que a pessoa ve, e nao um:
/// o aviso, a recusa com a frase dela, e o desfecho do `202`. A versao
/// anterior era `StatelessWidget` e nao tinha onde guardar recusa nenhuma --
/// era o que deixava o `deny_429` do contrato sem lugar na tela.
class _FolhaDeExcluirAConta extends StatefulWidget {
  const _FolhaDeExcluirAConta({required this.aoServidorConfirmar});

  /// Avisa quem abriu a folha de que o servidor respondeu `202`.
  ///
  /// E o unico canal do desfecho, e ele e um AVISO e nao um pedido: a limpeza
  /// do estado local mora em [_ItemDeExcluirAConta], depois de a folha sumir.
  /// A prosa daquela classe diz por que nao e o valor do `pop`.
  final VoidCallback aoServidorConfirmar;

  @override
  State<_FolhaDeExcluirAConta> createState() =>
      _EstadoDaFolhaDeExcluirAConta();
}

class _EstadoDaFolhaDeExcluirAConta extends State<_FolhaDeExcluirAConta> {
  /// A folha esta no meio de um pedido, e os dois botoes dela estao mudos.
  ///
  /// Cobre as DUAS etapas: a folha de senha aberta por cima e a chamada ao
  /// servidor. Toque repetido na primeira abriria uma segunda folha de senha;
  /// na segunda, gastaria dois dos tres pedidos do dia.
  bool _ocupada = false;

  /// O giro do botao, e so a etapa da CHAMADA.
  ///
  /// **Ele nao cobre a folha de senha aberta por cima, de proposito**: um giro
  /// atras de uma folha modal nao e visto por ninguem, e um indicador
  /// indeterminado agenda quadro para sempre -- o que deixa `pumpAndSettle`
  /// estourar e, no aparelho, mantem a arvore animando sem motivo.
  bool _chamandoOServidor = false;

  bool _concluida = false;

  /// A recusa que esta na tela, no idioma da casa.
  MensagemDeErro? _faixa;

  /// A saida da faixa, quando ela NAO e a do catalogo.
  ///
  /// Duas recusas desta folha tem saida propria, e as duas pelo mesmo motivo:
  /// a acao que resolve e recomecar o fluxo DESTA folha, e `saidaDaMensagem`
  /// nao tem como saber disso -- ela devolve navegacao e reabertura de janela,
  /// nunca a operacao destrutiva. Quando este campo e nulo, a saida e a do
  /// catalogo, como em toda outra tela.
  VoidCallback? _saidaPropria;

  Future<void> _pedirAExclusao() async {
    final escopo = Escopo.of(context);

    setState(() {
      _ocupada = true;
      _faixa = null;
      _saidaPropria = null;
    });

    final janela = await mostrarFolhaDeSenha(
      context,
      auth: escopo.auth,
      escopo: EscopoDeReautenticacao.exclusaoDaConta,
      motivo: TextosDaExclusaoDaConta.motivoDaSenha,
    );
    if (!mounted) return;

    // **A RECUSA DA SENHA NAO EXCLUI NADA, e e aqui que isso e decidido.**
    // `null` e a recusa, e a doc de `mostrarFolhaDeSenha` e literal: quem
    // chamou NAO pode prosseguir com ele. Desistencia e senha errada chegam
    // pelo mesmo `null` de proposito, e a diferenca nao e necessaria aqui --
    // a senha errada JA foi explicada no campo da propria folha de senha
    // (`A senha não confere. Tente de novo.`), e repetir a recusa numa faixa
    // atras dela diria duas vezes a mesma coisa em dois lugares.
    if (janela == null) {
      setState(() => _ocupada = false);
      return;
    }

    setState(() => _chamandoOServidor = true);

    try {
      await escopo.me.excluirMinhaConta(
        tokenDeReautenticacao: janela.token,
      );
      // O AVISO SAI ANTES DO `mounted`, de proposito: o servidor ja excluiu, e
      // esse fato nao deixa de ser verdade porque esta folha saiu da arvore.
      widget.aoServidorConfirmar();
      if (!mounted) return;
      setState(() {
        _ocupada = false;
        _chamandoOServidor = false;
        _concluida = true;
      });
    } on FalhaDeChamada catch (falha) {
      if (!mounted) return;
      _recusar(falha);
    } on Object catch (erro, pilha) {
      registrarFalhaInesperada(erro, pilha, onde: 'ao excluir a conta');
      if (!mounted) return;
      // Nao e `FalhaDeChamada`, entao nao veio de resposta do servidor: o
      // `202` de corpo vazio ja e lido como sucesso por `_lerResposta`, e por
      // isso nada que caia aqui pode ser uma exclusao que deu certo.
      setState(() {
        _ocupada = false;
        _chamandoOServidor = false;
        _faixa = const MensagemDeErro(
          texto: TextosDaExclusaoDaConta.servidorFora,
          acao: TextosDaExclusaoDaConta.tentarDeNovo,
        );
        _saidaPropria = _pedirAExclusao;
      });
    }
  }

  /// Decide a frase de uma recusa, pelo TIPO da falha e nunca pelo texto dela.
  void _recusar(FalhaDeChamada falha) {
    final (MensagemDeErro faixa, VoidCallback? propria) = switch (falha) {
      // A requisicao nao saiu: a certeza de que nada foi excluido e do tipo
      // da falha, nao de otimismo.
      FalhaDeConexao() => (
          const MensagemDeErro(texto: TextosDaExclusaoDaConta.semConexao),
          null,
        ),
      FalhaDeEnderecoRecusado() => (
          const MensagemDeErro(
            texto: TextosDaExclusaoDaConta.servidorFora,
            acao: TextosDaExclusaoDaConta.tentarDeNovo,
          ),
          _pedirAExclusao,
        ),
      // O unico desfecho indecidivel do fluxo. A frase NAO oferece `Tentar de
      // novo`: um reenvio as cegas pode gastar um dos tres pedidos do dia por
      // uma exclusao que o servidor talvez ja tenha aceito.
      FalhaDeTempo() => (
          const MensagemDeErro(texto: TextosDaExclusaoDaConta.semResposta),
          null,
        ),
      FalhaDaApi(:final Problem problem) => _daResposta(problem),
    };

    setState(() {
      _ocupada = false;
      _chamandoOServidor = false;
      _faixa = faixa;
      _saidaPropria = propria;
    });
  }

  /// A recusa que veio como resposta de erro do contrato.
  ///
  /// Resposta de erro no formato do contrato NAO e `202`, entao em todos os
  /// ramos daqui a conta continua no ar -- inclusive no que o catalogo
  /// redige, e e por isso que ele recebe [TextosDaExclusaoDaConta.contaIntacta]
  /// emendado no fim.
  (MensagemDeErro, VoidCallback?) _daResposta(Problem problem) {
    if (problem.tipo == ProblemTipo.limiteDeTentativas ||
        problem.status == 429) {
      return (
        const MensagemDeErro(texto: TextosDaExclusaoDaConta.pedidosDemais),
        null,
      );
    }

    if (problem.tipo == ProblemTipo.reautenticacaoNecessaria) {
      return (
        const MensagemDeErro(
          texto: TextosDaExclusaoDaConta.confirmacaoVencida,
          acao: TextosDaExclusaoDaConta.tentarDeNovo,
        ),
        _pedirAExclusao,
      );
    }

    if (problem.status >= 500) {
      return (
        const MensagemDeErro(
          texto: TextosDaExclusaoDaConta.servidorFora,
          acao: TextosDaExclusaoDaConta.tentarDeNovo,
        ),
        _pedirAExclusao,
      );
    }

    // O CATALOGO REDIGE O RESTO, e a saida dele vale: sessao expirada leva a
    // `Entrar`, e isso e a saida certa. `escopoDeSenha` NAO e passado de
    // proposito -- a prosa de `confirmacaoVencida` diz por que.
    final doCatalogo = MensagensDeErro.de(FalhaDaApi(problem));
    final texto = doCatalogo.texto.isEmpty
        ? TextosDaExclusaoDaConta.contaIntacta
        : '${doCatalogo.texto} ${TextosDaExclusaoDaConta.contaIntacta}';
    return (
      MensagemDeErro(
        texto: texto,
        acao: doCatalogo.acao,
        proximaAcao: doCatalogo.proximaAcao,
        rotaDaAcao: doCatalogo.rotaDaAcao,
      ),
      null,
    );
  }

  @override
  Widget build(BuildContext context) {
    final textos = Theme.of(context).textTheme;
    // DEPOIS DO `202` NAO HA MAIS VOLTAR: o voltar do sistema e o toque fora
    // deixariam a folha sem ter dito o prazo de 30 dias, que e a unica
    // informacao deste fluxo que nao da para consultar depois. O `Entendi` e
    // a saida, e ele e uma so.
    return PopScope(
      canPop: !_concluida,
      child: SafeArea(
        child: SingleChildScrollView(
          child: Padding(
            padding: const EdgeInsets.all(BichuEspaco.e6),
            child: _concluida ? _desfecho(textos) : _aviso(textos),
          ),
        ),
      ),
    );
  }

  Widget _aviso(TextTheme textos) {
    return Column(
      mainAxisSize: MainAxisSize.min,
      crossAxisAlignment: CrossAxisAlignment.start,
      children: <Widget>[
        Text(
          TextosDaExclusaoDaConta.titulo,
          style: textos.titleLarge,
        ),
        const SizedBox(height: BichuEspaco.e2),
        Text(
          TextosDaExclusaoDaConta.prazo,
          style: textos.bodyLarge,
        ),
        const SizedBox(height: BichuEspaco.e3),
        Text(
          TextosDaExclusaoDaConta.casos,
          style: textos.bodyLarge,
        ),
        const SizedBox(height: BichuEspaco.e2),
        Text(
          TextosDaExclusaoDaConta.plaquinhas,
          style: textos.bodyLarge,
        ),
        const SizedBox(height: BichuEspaco.e3),
        Text(
          TextosDaExclusaoDaConta.semVolta,
          style: textos.bodyLarge,
        ),
        if (_faixa != null) ...<Widget>[
          const SizedBox(height: BichuEspaco.e6),
          FaixaDeAviso(
            texto: _faixa!.texto,
            rotuloDaAcao: _faixa!.acao,
            aoTocarNaAcao: _ocupada
                ? null
                : _saidaPropria ?? saidaDaMensagem(context, _faixa!),
          ),
        ],
        const SizedBox(height: BichuEspaco.e6),
        BotaoPrimario(
          rotulo: TextosDaExclusaoDaConta.rotulo,
          critico: true,
          carregando: _chamandoOServidor,
          aoTocar: _ocupada ? null : _pedirAExclusao,
        ),
        const SizedBox(height: BichuEspaco.e3),
        BotaoSecundario(
          rotulo: TextosDaExclusaoDaConta.agoraNao,
          aoTocar: _ocupada ? null : () => Navigator.of(context).pop(),
        ),
      ],
    );
  }

  Widget _desfecho(TextTheme textos) {
    return Column(
      mainAxisSize: MainAxisSize.min,
      crossAxisAlignment: CrossAxisAlignment.start,
      children: <Widget>[
        Text(
          TextosDaExclusaoDaConta.tituloConcluido,
          style: textos.titleLarge,
        ),
        const SizedBox(height: BichuEspaco.e2),
        Text(
          TextosDaExclusaoDaConta.concluido,
          style: textos.bodyLarge,
        ),
        const SizedBox(height: BichuEspaco.e3),
        Text(
          TextosDaExclusaoDaConta.desconexao,
          style: textos.bodyLarge,
        ),
        const SizedBox(height: BichuEspaco.e6),
        BotaoPrimario(
          rotulo: TextosDaExclusaoDaConta.entendi,
          aoTocar: () => Navigator.of(context).pop(),
        ),
      ],
    );
  }
}
