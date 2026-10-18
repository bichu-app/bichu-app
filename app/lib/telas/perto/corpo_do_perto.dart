import 'package:flutter/material.dart';

import '../../escopo.dart';
import '../../theme/bichu_tokens.g.dart';
import 'lista_do_diretorio.dart';
import 'minhas_indicacoes.dart';

/// O corpo da seção `Perto`, com as duas abas.
///
/// ## Por que este arquivo existe
///
/// O cliente pediu `Minhas indicações` **como aba** em 18/10/2026, e o padrão
/// da casa para isso é o de `Meus pedidos` na `Rede`: um [TabBar] dentro do
/// corpo da seção, e não um sexto item na barra de baixo. A mecânica aqui é a
/// de [AgendaDaRede], reusada e não reinventada — mesmo `TabController`
/// refeito quando o número de abas muda, mesma troca por `onTap`, mesmas abas
/// FORA da [BarraDeListagem].
///
/// **Ele é um arquivo novo, e isso é deliberado.** A casca de abas poderia ter
/// nascido dentro de `lista_do_diretorio.dart`, como a da `Rede` nasceu dentro
/// de `agenda_da_rede.dart` — mas aquele arquivo está sendo editado por outra
/// frente nesta rodada (a logo do profissional no cartão). Casca própria
/// significa **zero linha** tocada lá: nem a lista, nem o cartão, nem a barra
/// de listagem dela mudaram.
///
/// ## QUAL ABA VEM PRIMEIRO, e por quê
///
/// `Profissionais` é a **primeira e a principal**, e `Minhas indicações` é a
/// segunda. A seção `Perto` existe para achar quem atende bem; a lista do
/// diretório é o conteúdo dela e é o que a pessoa vem ver. Pôr a lista pessoal
/// na frente trocaria o conteúdo da seção pelo histórico de quem já
/// contribuiu — e quem nunca indicou, que é a maioria, abriria `Perto` numa
/// tela vazia.
///
/// É a mesma ordem da `Rede`: `Próximos` (o conteúdo) antes de `Meus pedidos`
/// (o que é meu).
///
/// ## SEM CONTA A ABA NÃO APARECE, e ela não fica desabilitada
///
/// Mesma regra de `Meus pedidos` (*"Sem conta, `Meus pedidos` não aparece (não
/// fica desabilitada): controle sem desfecho"*), e aqui ela é ainda mais
/// literal: sem conta não existe "minhas indicações" — não há o que listar, e
/// a rota responderia `401`. Uma aba que convidasse a entrar seria um controle
/// cujo desfecho é uma recusa.
///
/// **A régua é SESSÃO, e não `podeCriarNaComunidade`** (sessão **e** e-mail
/// confirmado), que é a régua da porta de INDICAR na barra de topo. A diferença
/// é medida e não é descuido:
///
/// - **Indicar é escrever** sobre um terceiro, e cria trabalho humano de
///   revisão: o servidor exige canal verificado e responde `409`
///   (`contact-channel-unverified`). Esconder a porta de quem não validou
///   combina com a recusa que viria.
/// - **Ver as minhas é ler o que eu já fiz.** Quem indicou enquanto estava
///   validado e depois trocou de e-mail continua tendo indicações na fila, e
///   esconder a aba dela esconderia o trabalho dela mesma. A operação de
///   leitura não exige validação, de propósito, e a aba acompanha.
///
/// Entrar ou sair com a seção aberta refaz o [TabController] e devolve a aba
/// `Profissionais`, como na `Rede`.
///
/// ## SEM CONTAGEM NA ABA, e a ausência é decisão
///
/// O rótulo é `Minhas indicações`, sem número de pendentes ao lado. Não é
/// economia de trabalho: o número só existiria honesto se viesse do servidor e
/// passasse pelo predicado de conta desabilitada, e ele responderia *"quanto
/// trabalho está esperando"* — que é a pergunta do PAINEL, não da pessoa.
/// `MyDirectorySuggestionPage` não traz `pending_total` justamente por isso.
///
/// Para quem indicou, o número na aba também seria ruído: com teto de 5
/// indicações por 24 h, a lista é curta e o estado de cada uma está no cartão.
/// Um distintivo que nunca passa de um dígito pede atenção sem dizer nada.
///
/// ## UMA ABA MONTADA POR VEZ, e isto não é detalhe de estilo
///
/// O corpo é trocado por `if`, e **não** há [TabBarView]. As duas listas
/// publicam o ícone de filtrar no mesmo `SlotDaBarraDeListagem` da casca; com
/// as duas montadas, as duas publicariam e o ícone da barra passaria a mostrar
/// o filtro da aba que não está na frente. Mesma escolha da `Rede`, que troca
/// o corpo por `_aba` pelo mesmo motivo.
class CorpoDoPerto extends StatefulWidget {
  const CorpoDoPerto({this.rodapeDaListagem, super.key});

  /// O que vem depois da lista do diretório, na aba `Profissionais`.
  ///
  /// Entra por parâmetro porque quem o desenha é `AbaPerto` (a porta de
  /// `Pets de ONGs para adoção`, que é um sub-destino da seção e não desta
  /// casca). **Ele é da aba da LISTA, e não da seção:** pendurado fora das
  /// abas, apareceria embaixo de `Minhas indicações` também, oferecendo adoção
  /// a quem foi ver o estado de uma indicação.
  /// O rodape da aba da LISTA. **Opcional desde a uniao de 18/10/2026**:
  /// a porta de `Adoções` saiu da casca (nao existe rota de adocao no
  /// contrato e a tela estava em construcao), e sem ela a aba nao tem
  /// rodape nenhum. Nulo nao desenha espaco: o `SizedBox` acima tambem
  /// sai, senao a lista termina com um vao sem nada embaixo.
  final Widget? rodapeDaListagem;

  @override
  State<CorpoDoPerto> createState() => _CorpoDoPertoState();
}

/// As abas da seção `Perto`.
///
/// `profissionais` primeiro porque é o conteúdo da seção. Ver a prosa de
/// [CorpoDoPerto].
enum AbaDoPerto {
  profissionais('Profissionais'),
  indicacoes('Minhas indicações');

  const AbaDoPerto(this.rotulo);

  final String rotulo;
}

class _CorpoDoPertoState extends State<CorpoDoPerto>
    with TickerProviderStateMixin {
  AbaDoPerto _aba = AbaDoPerto.profissionais;
  TabController? _abas;

  @override
  void dispose() {
    _abas?.dispose();
    super.dispose();
  }

  List<AbaDoPerto> _abasVisiveis(bool logado) => <AbaDoPerto>[
    AbaDoPerto.profissionais,
    if (logado) AbaDoPerto.indicacoes,
  ];

  /// O `TabController` acompanha quantas abas existem (uma sem conta, duas
  /// com), e é refeito quando isso muda. Mesma função de nome igual em
  /// `agenda_da_rede.dart`, e pelo mesmo motivo: trocar o número de abas sem
  /// refazer o controlador estoura em tempo de execução.
  TabController _controladorDasAbas(List<AbaDoPerto> abas) {
    final atual = _abas;
    final indice = abas.indexOf(_aba).clamp(0, abas.length - 1);
    if (atual != null && atual.length == abas.length) {
      if (atual.index != indice) atual.index = indice;
      return atual;
    }
    atual?.dispose();
    final novo = TabController(
      length: abas.length,
      vsync: this,
      initialIndex: indice,
    );
    _abas = novo;
    return novo;
  }

  void _trocarAba(AbaDoPerto aba) {
    if (aba == _aba) return;
    setState(() => _aba = aba);
  }

  @override
  Widget build(BuildContext context) {
    final sessao = Escopo.of(context).sessao;

    // Escuta o controlador de sessão: sem isto a aba só apareceria (ou só
    // sumiria) na próxima troca de seção. Mesma razão de `AbaPerto`, que
    // escuta para decidir a porta de indicar.
    return AnimatedBuilder(
      animation: sessao,
      builder: (context, _) {
        final logado = sessao.logado;
        final abas = _abasVisiveis(logado);
        // Saiu da conta com `Minhas indicações` aberta: volta para a lista, e
        // não fica numa aba que não existe mais.
        if (!abas.contains(_aba)) _aba = AbaDoPerto.profissionais;
        final controlador = _controladorDasAbas(abas);

        return Column(
          crossAxisAlignment: CrossAxisAlignment.stretch,
          children: <Widget>[
            // **UMA ABA SÓ NÃO É ABA.** Sem conta existe apenas
            // `Profissionais`, e desenhar um `TabBar` de um item seria um
            // controle que não leva a nenhum outro lugar -- e faria a seção
            // parecer, para quem está deslogado, que falta algo que ele não
            // pode alcançar.
            if (abas.length > 1) ...<Widget>[
              TabBar(
                controller: controlador,
                onTap: (i) => _trocarAba(abas[i]),
                tabs: <Widget>[
                  for (final a in abas)
                    Tab(height: BichuAlvoDeToque.min, text: a.rotulo),
                ],
              ),
              const SizedBox(height: BichuEspaco.e4),
            ],
            // O corpo da aba da frente, e só dele. Ver a prosa: duas listas
            // montadas disputariam o ícone de filtrar da barra de topo.
            ..._corpoDaAba(),
          ],
        );
      },
    );
  }

  List<Widget> _corpoDaAba() {
    switch (_aba) {
      case AbaDoPerto.profissionais:
        final Widget? rodape = widget.rodapeDaListagem;
        return <Widget>[
          const ListaDoDiretorio(),
          if (rodape != null) const SizedBox(height: BichuEspaco.e6),
          ?rodape,
        ];
      case AbaDoPerto.indicacoes:
        return const <Widget>[MinhasIndicacoes()];
    }
  }
}
