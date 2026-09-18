import 'package:flutter/material.dart';
import 'package:go_router/go_router.dart';

import '../escopo.dart';
import '../roteamento/rotas.dart';
import '../sessao/controlador_de_sessao.dart';
import '../theme/bichu_colors.dart';
import '../theme/bichu_tokens.g.dart';
import '../widgets/botao_primario.dart';
import '../widgets/faixa_de_aviso.dart';
import 'casca_com_abas.dart';
import 'escanear/tela_leitor_de_qr.dart';

/// Aba Inicio.
///
/// Logado, a hierarquia da tela e fixa e nesta ordem (UX 5.2): aviso de
/// cadastro incompleto, caso aberto, cartoes de pet, convite para colocar o QR
/// na coleira. Deslogado: o que o Bichu e, escanear e criar conta.
///
/// Esta entrega monta o esqueleto e os estados vazios. Os cartoes de pet e o
/// caso aberto chegam com as historias de pet e de perdido.
class AbaInicio extends StatelessWidget {
  const AbaInicio({super.key});

  @override
  Widget build(BuildContext context) {
    final sessao = Escopo.of(context).sessao;
    final cores = BichuColors.of(context).cores;
    final textos = Theme.of(context).textTheme;

    return AnimatedBuilder(
      animation: sessao,
      builder: (context, _) {
        if (!sessao.logado) {
          return TelaDeAba(
            titulo: 'Bichu',
            filhos: <Widget>[
              Text(
                'O Bichu dá uma identidade ao seu pet e aciona a vizinhança '
                'quando ele some.',
                style: textos.bodyLarge,
              ),
              const SizedBox(height: BichuEspaco.e8),
              BotaoPrimario(
                rotulo: 'Cadastrar meu pet',
                // `push` e nao `go` em toda entrada de tela de conta: conta e
                // desvio, e `go` substitui a pilha, deixando a pessoa sem nada
                // para desempilhar. Ver `SaidaDaTela`.
                aoTocar: () => context.push(Rotas.criarConta),
              ),
              const SizedBox(height: BichuEspaco.e4),
              BotaoSecundario(
                rotulo: 'Escanear uma tag',
                aoTocar: () => context.go(Rotas.escanear),
              ),
              const SizedBox(height: BichuEspaco.e4),
              Center(
                child: TextButton(
                  onPressed: () => context.push(Rotas.entrar),
                  child: const Text('Já tenho conta'),
                ),
              ),
            ],
          );
        }

        final usuario = sessao.usuario;
        return TelaDeAba(
          titulo: 'Início',
          filhos: <Widget>[
            if (usuario != null && usuario.cadastroIncompleto) ...<Widget>[
              // O aviso persistente vem primeiro na hierarquia, e ele e
              // justificado pelo pet, nao pelo cadastro. A historia propria
              // dele e a BICHUS de "aviso persistente de cadastro incompleto";
              // aqui fica o lugar e o peso visual.
              FaixaDeAviso(
                peso: PesoDaFaixa.informativo,
                texto: 'Confirme seu e-mail. É por ele que a gente te avisa '
                    'quando alguém encontrar seu pet.',
                rotuloDaAcao: 'Confirmar meu e-mail',
                aoTocarNaAcao: () => context.push(
                  Rotas.verifiqueSeuEmail,
                  extra: usuario.email,
                ),
              ),
              const SizedBox(height: BichuEspaco.e6),
            ],
            EstadoVazio(
              titulo: 'Nenhum pet cadastrado ainda',
              explicacao: 'Cadastre seu pet para gerar a tag com QR e entrar '
                  'na rede de quem procura e de quem encontra.',
              acao: BotaoPrimario(
                rotulo: 'Cadastrar meu pet',
                // F1.3 existe agora. `push` e nao `go`: o assistente cobre a
                // casca de abas e e um desvio, como as telas de conta.
                aoTocar: () => context.push(Rotas.cadastrarPet),
              ),
            ),
            const SizedBox(height: BichuEspaco.e6),
            Text(
              'Entrou como ${usuario?.email ?? ''}.',
              style: textos.bodyMedium?.copyWith(color: cores.textSecondary),
            ),
          ],
        );
      },
    );
  }
}

/// Aba Perdidos. Visivel deslogado, por regra de produto.
///
/// A lista mostra foto, especie, raca, porte, cor, data e **bairro**. Sem
/// ponto exato e sem mapa com pino, em nenhuma circunstancia e em nenhum zoom.
class AbaPerdidos extends StatelessWidget {
  const AbaPerdidos({super.key});

  @override
  Widget build(BuildContext context) {
    return const TelaDeAba(
      titulo: 'Perdidos',
      filhos: <Widget>[
        EstadoVazio(
          titulo: 'Nenhum pet perdido por aqui agora',
          explicacao: 'Quando alguém da sua região marcar um pet como perdido, '
              'ele aparece nesta lista com o bairro onde foi visto.',
        ),
      ],
    );
  }
}

/// Aba Escanear. Visivel e funcional deslogado.
///
/// A tela e `TelaLeitorDeQr` (F2.1), e ela **nao usa `TelaDeAba`**: a casca
/// visual comum traz uma `AppBar`, e F2.1 e a unica aba sem barra de topo. O
/// visor ocupa a tela inteira e a navegacao dela e a barra inferior da casca.
class AbaEscanear extends StatelessWidget {
  const AbaEscanear({super.key});

  @override
  Widget build(BuildContext context) => const TelaLeitorDeQr();
}

/// Aba Perfil. Navegavel deslogado.
class AbaPerfil extends StatelessWidget {
  const AbaPerfil({super.key});

  @override
  Widget build(BuildContext context) {
    final sessao = Escopo.of(context).sessao;

    return AnimatedBuilder(
      animation: sessao,
      builder: (context, _) {
        if (sessao.estado != EstadoDaSessao.logado) {
          return TelaDeAba(
            titulo: 'Perfil',
            filhos: <Widget>[
              BotaoPrimario(
                rotulo: 'Entrar',
                aoTocar: () => context.push(Rotas.entrar),
              ),
              const SizedBox(height: BichuEspaco.e4),
              BotaoSecundario(
                rotulo: 'Criar conta',
                aoTocar: () => context.push(Rotas.criarConta),
              ),
              const SizedBox(height: BichuEspaco.e6),
              const _LinhaDeTermos(),
            ],
          );
        }

        return TelaDeAba(
          titulo: 'Perfil',
          filhos: <Widget>[
            ListTile(
              contentPadding: EdgeInsets.zero,
              title: Text(sessao.usuario?.email ?? ''),
              subtitle: Text(
                sessao.usuario?.emailVerificado ?? false
                    ? 'E-mail confirmado'
                    : 'E-mail ainda não confirmado',
              ),
            ),
            const Divider(),
            const _LinhaDeTermos(),
            const SizedBox(height: BichuEspaco.e8),
            _BotaoSair(sessao: sessao),
          ],
        );
      },
    );
  }
}

class _LinhaDeTermos extends StatelessWidget {
  const _LinhaDeTermos();

  @override
  Widget build(BuildContext context) {
    return Align(
      alignment: Alignment.centerLeft,
      child: TextButton(
        // A tela de termos e privacidade e de outra historia, e ela precisa
        // ser acessivel sem conta.
        onPressed: null,
        child: const Text('Termos de uso e privacidade'),
      ),
    );
  }
}

class _BotaoSair extends StatelessWidget {
  const _BotaoSair({required this.sessao});

  final ControladorDeSessao sessao;

  @override
  Widget build(BuildContext context) {
    return BotaoSecundario(
      rotulo: 'Sair da conta',
      aoTocar: () async {
        // Ao sair, avisar o que muda: a pessoa precisa saber que para de
        // receber os alertas de pets perdidos por perto.
        final confirmou = await showModalBottomSheet<bool>(
          context: context,
          showDragHandle: true,
          builder: (context) => const _FolhaDeSair(),
        );
        if (confirmou != true) return;
        await sessao.sair();
        if (!context.mounted) return;
        context.go(Rotas.inicio);
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
