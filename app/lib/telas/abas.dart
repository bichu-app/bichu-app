import 'dart:async';

import 'package:flutter/material.dart';
import 'package:go_router/go_router.dart';

import '../escopo.dart';
import '../roteamento/rotas.dart';
import '../sessao/controlador_de_sessao.dart';
import '../theme/bichu_tokens.g.dart';
import '../api/falhas.dart';
import '../api/mural_api.dart';
import '../widgets/acao_de_criar_flutuante.dart';
import '../widgets/botao_primario.dart';
import '../widgets/carimbo_do_build.dart';
import '../widgets/faixa_de_aviso.dart';
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
