import 'package:flutter/material.dart';
import 'package:go_router/go_router.dart';

import '../escopo.dart';
import '../roteamento/rotas.dart';
import '../sessao/controlador_de_sessao.dart';
import '../theme/bichu_colors.dart';
import '../theme/bichu_tokens.g.dart';
import '../widgets/botao_primario.dart';
import '../widgets/faixa_de_aviso.dart';
import 'avisos/antessala_de_aviso.dart';
import 'casca_com_abas.dart';
import 'perfil/meus_pets.dart';

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
    final cores = BichuColors.of(context).cores;
    final textos = Theme.of(context).textTheme;

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
          titulo: destino.rotulo,
          reforco: destino.reforcoDaPagina,
          filhos: <Widget>[
            if (logado && usuario != null && usuario.cadastroIncompleto) ...[
              // O aviso persistente vem primeiro na hierarquia, e ele e
              // justificado pelo pet, nao pelo cadastro.
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
            if (!logado) ...<Widget>[
              Text(
                'O Bichu dá uma identidade ao seu pet e aciona a vizinhança '
                'quando ele some.',
                style: textos.bodyLarge,
              ),
              const SizedBox(height: BichuEspaco.e6),
            ],
            BotaoPrimario(
              rotulo: 'Cadastrar meu pet',
              // `push` e nao `go`: o assistente cobre a casca de abas e e um
              // desvio, como as telas de conta. Deslogado, a conta e pedida
              // dentro do caminho da acao, e nao no lugar dela (UX 5.2).
              aoTocar: () => context.push(
                logado ? Rotas.cadastrarPet : Rotas.criarConta,
              ),
            ),
            const SizedBox(height: BichuEspaco.e4),
            // A PORTA PRIMARIA DO LEITOR DE QR (UX 27.5.6).
            //
            // Ela vive aqui e nao em `Perfil` porque quem acha um cachorro na
            // rua nao pensa a palavra "Perfil" (Nielsen 2). `Escanear` deixou
            // de ser aba -- o rotulo pede 71,57 dp num slot de 64,0 -- mas o
            // caminho **nao ficou mais longe**: e um toque a partir da secao de
            // aterrissagem, exatamente como era.
            //
            // `push` e nao `go`: o leitor cobre a casca inteira (o design
            // system 11.11 manda a barra sumir no leitor de camera), e tela que
            // cobre a casca precisa ter volta.
            BotaoSecundario(
              rotulo: 'Escanear uma tag',
              aoTocar: () => context.push(Rotas.escanear),
            ),
            const SizedBox(height: BichuEspaco.e6),
            // `Adoções` e sub-destino de `Pets`, com porta propria, e **nao** e
            // item de `Perto` (UX 27.2.4). Em `Perto` fica a porta das ONGs,
            // que leva para ca pre-filtrado e nao duplica listagem.
            const _PortaDeSubDestino(
              icone: Icons.volunteer_activism_outlined,
              titulo: 'Adoções',
              descricao: 'Os pets da vizinhança que estão procurando uma casa.',
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
              explicacao: 'Aqui vão ficar os pets perdidos e achados da sua '
                  'região, com a foto e o bairro onde foram vistos.',
            ),
            if (logado) ...<Widget>[
              const SizedBox(height: BichuEspaco.e6),
              Text(
                'Entrou como ${usuario?.email ?? ''}.',
                style: textos.bodyMedium?.copyWith(color: cores.textSecondary),
              ),
            ],
            if (!logado) ...<Widget>[
              const SizedBox(height: BichuEspaco.e4),
              Center(
                child: TextButton(
                  onPressed: () => context.push(Rotas.entrar),
                  child: const Text('Já tenho conta'),
                ),
              ),
            ],
          ],
        );
      },
    );
  }
}

/// Secao 2 — `Rede`. Eventos e encontros da comunidade.
///
/// **Casca honesta.** A secao nao tem uma linha de especificacao de ninguem
/// (UX 27.5.2): nao ha tela, ordem de leitura, estados nem microcopy. O que
/// esta tela faz e nomear o que vai existir e dizer que ainda nao existe, que
/// e o minimo que 25.7.3 exige de um destino visivel. **Sem acao**, pelo
/// 11.10: sem desfecho possivel, nenhum botao.
class AbaRede extends StatelessWidget {
  const AbaRede({super.key});

  @override
  Widget build(BuildContext context) {
    final destino = CascaComAbas.porRota(Rotas.rede);
    return TelaDeAba(
      titulo: destino.rotulo,
      reforco: destino.reforcoDaPagina,
      filhos: const <Widget>[
        EstadoVazio(
          titulo: 'Rede está em construção',
          explicacao: 'Aqui vão ficar os encontros e eventos marcados por quem '
              'mora perto de você.',
        ),
      ],
    );
  }
}

/// Secao 3 — `Perto`. Profissionais e estabelecimentos indicados.
///
/// Casca honesta, **com a porta das ONGs** (criterio 6): ela leva a `Pets`
/// pre-filtrado em adocao e nao duplica listagem nenhuma. A porta fica fora do
/// `EstadoVazio` de proposito: o 11.10 manda o estado vazio nascer sem acao, e
/// a porta nao e acao do vazio, e um caminho da secao.
///
/// **Sem mapa**, por decisao de 17/09: o Maps cobra por carregamento de mapa e
/// o componente criaria precedente contra o ADR-0010. E perfil de profissional
/// **nao e criado pela comunidade**, por decisao de 21/09.
class AbaPerto extends StatelessWidget {
  const AbaPerto({super.key});

  @override
  Widget build(BuildContext context) {
    final destino = CascaComAbas.porRota(Rotas.perto);
    return TelaDeAba(
      titulo: destino.rotulo,
      reforco: destino.reforcoDaPagina,
      filhos: const <Widget>[
        EstadoVazio(
          titulo: 'Perto está em construção',
          explicacao: 'Aqui vão ficar os veterinários, banhos e tosas e pet '
              'shops recomendados pela comunidade.',
        ),
        SizedBox(height: BichuEspaco.e6),
        _PortaDeSubDestino(
          icone: Icons.favorite_outline,
          titulo: 'Pets de ONGs para adoção',
          descricao: 'Abre a lista de Pets já filtrada em adoção.',
          rota: Rotas.adocoes,
        ),
      ],
    );
  }
}

/// Secao 4 — `Loja`. A loja do Bichu.
///
/// Casca honesta. O carrinho e o pedido nao tem especificacao de ninguem, e a
/// decisao de provedor de pagamento nao existe (UX 27.5.4) -- desenhar aqui
/// seria inventar produto no codigo, que e o inverso da regra do projeto.
class AbaLoja extends StatelessWidget {
  const AbaLoja({super.key});

  @override
  Widget build(BuildContext context) {
    final destino = CascaComAbas.porRota(Rotas.loja);
    return TelaDeAba(
      titulo: destino.rotulo,
      reforco: destino.reforcoDaPagina,
      filhos: const <Widget>[
        EstadoVazio(
          titulo: 'Loja está em construção',
          explicacao: 'Aqui vai ficar a plaquinha de reposição e os produtos '
              'escolhidos pelo Bichu.',
        ),
      ],
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
            titulo: destino.rotulo,
            reforco: destino.reforcoDaPagina,
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
          titulo: destino.rotulo,
          reforco: destino.reforcoDaPagina,
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
            // `Perfil` > `Meus pets`: o destino que a secao 27.6 do UX fixou
            // para os cartoes da BICHUS-62. A chave e por conta para que a
            // troca de usuario reconstrua o estado em vez de reaproveitar o
            // que estava carregado para a anterior.
            MeusPets(
              key: ValueKey<String>('meus-pets-${sessao.usuario?.id ?? ''}'),
              cache: Escopo.of(context).cacheDeMeusPets,
            ),
            const SizedBox(height: BichuEspaco.e6),
            // A saida de quem negou o aviso (UX 10.1, BICHUS-24).
            const _AvisoPorPertoDesligado(),
            // A SEGUNDA PORTA DO LEITOR: a porta de conta (UX 27.5.6), onde o
            // cliente pediu. Um leitor so; o destino da leitura sai das regras
            // dos tres cenarios de QR e **nunca** da aba de origem.
            BotaoSecundario(
              rotulo: 'Escanear uma tag',
              aoTocar: () => context.push(Rotas.escanear),
            ),
            const SizedBox(height: BichuEspaco.e8),
            _BotaoSair(sessao: sessao),
          ],
        );
      },
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
      reforco: 'Os pets da sua região que estão procurando uma casa, '
          'incluindo os das ONGs parceiras.',
      filhos: <Widget>[
        EstadoVazio(
          titulo: 'A lista de adoções está em construção',
          explicacao: 'Aqui vão ficar os pets para adoção da sua região, no '
              'mesmo cartão e na mesma lista dos perdidos.',
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
    required this.descricao,
    required this.rota,
  });

  final IconData icone;
  final String titulo;
  final String descricao;
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
              Expanded(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: <Widget>[
                    Text(titulo, style: textos.titleMedium),
                    const SizedBox(height: BichuEspaco.e1),
                    Text(
                      descricao,
                      style: textos.bodyMedium?.copyWith(
                        color: cores.textSecondary,
                      ),
                    ),
                  ],
                ),
              ),
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
