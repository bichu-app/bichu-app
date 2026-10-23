import 'dart:async';

import 'package:flutter/material.dart';

import '../../api/falhas.dart';
import '../../api/modelos_seguranca.dart';
import '../../api/seguranca_api.dart';
import '../../theme/bichu_colors.dart';
import '../../theme/bichu_tokens.g.dart';
import '../../widgets/arrastar_para_atualizar.dart';
import '../../widgets/faixa_de_aviso.dart';

/// **PESSOAS BLOQUEADAS** — a lista de quem esta conta bloqueou, e o único
/// lugar de onde o desbloqueio sai.
///
/// ## Por que esta tela existe, e o defeito que ela conserta
///
/// O bloqueio é **simétrico por desenho** no servidor (`bloqueio_entre`), e a
/// simetria tinha uma consequência que ninguém havia medido: quem bloqueia
/// alguém também passa a receber `404` no perfil dessa pessoa. E o
/// "Desbloquear" morava dentro do menu **daquele perfil** — que nunca mais
/// abre. Ou seja: **bloquear era irreversível pelo aplicativo.**
///
/// Decisão do cliente, 19/10/2026: *uma lista de quem você bloqueou, na gaveta
/// do Perfil, e o desbloqueio acontece ali*. É onde as pessoas procuram, por
/// hábito de outros aplicativos, e **resolve sem mexer na simetria do
/// bloqueio** — que é o que protege quem bloqueia por estar sendo perseguido.
///
/// ## O QUE CADA LINHA MOSTRA, E POR QUE SÓ ISSO
///
/// Esta lista mostra pessoas com quem quem lê **não tem vínculo nenhum**: ela
/// bloqueou justamente para não ter. Então a linha carrega o mínimo que
/// identifica alguém **para a própria pessoa que o bloqueou** — e nada que o
/// descreva:
///
/// - o **nome de exibição**, ou `@apelido` quando não há nome, ou
///   `Usuário sem nome` quando não há os dois;
/// - o **apelido** como segunda linha, quando há nome — ele é o identificador
///   estável, e é o que desempata dois homônimos bloqueados;
/// - **quando você bloqueou**, que é o ato de quem lê e não dado da outra
///   pessoa.
///
/// **NÃO HÁ FOTO**, e isto não é omissão a preencher depois: a emenda 3 do
/// ADR-0010 (19/10/2026) liberou a foto de perfil em UMA superfície — o
/// participante da conversa mediada — e **só entre conexões aceitas**.
/// Bloqueado é o oposto de conexão aceita, e foto, nome e apelido juntos são o
/// perfil de uma conexão. **Não há contagem de pets nem de conexões**: aquilo é
/// sinal de confiança, e a pergunta desta tela é "qual das pessoas que eu
/// bloqueei é esta".
///
/// **E o nome não é toque.** Não há caminho daqui para o perfil de ninguém: o
/// perfil de uma pessoa bloqueada responde `404` enquanto o bloqueio existir, e
/// um toque que levasse a um `404` seria um caminho que promete e não entrega.
/// Depois do desbloqueio a pessoa sai da lista, e o perfil dela volta a abrir
/// pelos caminhos que já existem.
///
/// ## O que esta tela NÃO tem
///
/// **Sem busca, sem filtro e sem seletor de ordem**, ao contrário do padrão de
/// listagem desta casa. Busca de pessoas não existe neste produto — o dano mora
/// na enumeração —, e um campo de busca sobre uma lista de bloqueados seria uma
/// superfície de enumeração sobre pessoas que quem lê não tem relação com.
/// A ordem é fixa: mais recentes primeiro.
///
/// **Nada sobre quem bloqueou quem lê.** Nem lista, nem contagem, nem aviso. A
/// leitura do servidor é assimétrica de propósito, e esta tela não teria como
/// mostrar a outra metade mesmo se quisesse.
class TelaDeBloqueados extends StatefulWidget {
  const TelaDeBloqueados({required this.seguranca, super.key});

  final SegurancaApi seguranca;

  static const String titulo = 'Usuários bloqueados';
  static const String vazio = 'Você não bloqueou ninguém';
  static const String explicacaoDoVazio =
      'Quando você bloquear alguém, esse usuário aparece aqui e você pode '
      'desbloqueá-la por este caminho.';
  static const String falhaAoCarregar =
      'Não conseguimos carregar a sua lista agora.';
  static const String falhaAoDesbloquear =
      'Não conseguimos desbloquear agora. Tente de novo.';
  static const String desbloquear = 'Desbloquear';

  /// **A frase que diz o que o desbloqueio NÃO faz.**
  ///
  /// Ela está aqui porque o servidor é explícito a respeito e a tela não pode
  /// prometer o contrário: *"desbloquear não devolve nada do que o bloqueio
  /// desfez"* — quando havia conexão, ela não volta. Sem esta frase, quem
  /// desbloqueia esperaria a conexão de volta e leria a ausência dela como
  /// defeito.
  static const String oQueODesbloqueioNaoFaz =
      'Desbloquear devolve só a visibilidade. Se vocês eram conexão, a conexão '
      'não volta.';

  @override
  State<TelaDeBloqueados> createState() => _EstadoDosBloqueados();
}

class _EstadoDosBloqueados extends State<TelaDeBloqueados> {
  PaginaDeBloqueados? _pagina;
  bool _carregando = true;
  String? _falha;
  final Set<String> _emCurso = <String>{};

  @override
  void initState() {
    super.initState();
    unawaited(_carregar());
  }

  Future<void> _carregar() async {
    setState(() {
      _carregando = true;
      _falha = null;
    });
    try {
      final pagina = await widget.seguranca.bloqueados();
      if (!mounted) return;
      setState(() {
        _pagina = pagina;
        _carregando = false;
      });
    } on FalhaDeChamada {
      if (!mounted) return;
      setState(() {
        _carregando = false;
        _falha = TelaDeBloqueados.falhaAoCarregar;
      });
    }
  }

  /// Desbloqueia e **recarrega**, em vez de tirar a linha da lista na mão.
  ///
  /// A operação é idempotente e devolve `204` vazio: tirar a linha localmente
  /// faria a tela afirmar o estado do servidor sem ter perguntado, e um
  /// desbloqueio que falhasse depois de a linha sair deixaria a pessoa achando
  /// que desbloqueou.
  Future<void> _desbloquear(String publicRef) async {
    if (_emCurso.contains(publicRef)) return;
    setState(() {
      _emCurso.add(publicRef);
      _falha = null;
    });
    try {
      await widget.seguranca.desbloquear(publicRef);
      if (!mounted) return;
      _emCurso.remove(publicRef);
      await _carregar();
    } on FalhaDeChamada {
      if (!mounted) return;
      setState(() {
        _emCurso.remove(publicRef);
        _falha = TelaDeBloqueados.falhaAoDesbloquear;
      });
    }
  }

  @override
  Widget build(BuildContext context) {
    final cores = BichuColors.of(context).cores;
    final textos = Theme.of(context).textTheme;
    final itens = _pagina?.items ?? const <PessoaBloqueada>[];

    return Scaffold(
      appBar: AppBar(title: const Text(TelaDeBloqueados.titulo)),
      // ACHADO DA MESCLA DE 19/10/2026: era `RefreshIndicator` cru.
      //
      // A frente `estado-deslogado-nas-secoes` trouxe o ponto unico do gesto
      // (`widgets/arrastar_para_atualizar.dart`) e o portao
      // `nenhuma tela usa RefreshIndicator cru`, que le `lib/` do disco. Esta
      // tela nasceu noutra frente, com o indicador colado dentro, e as duas
      // nao se cruzam em nenhuma linha -- o git mesclou sem conflito e o
      // portao reprovou sobre a UNIAO. A conversao e a mesma que
      // `tela_pedidos_de_conexao.dart` recebeu em 18/10.
      body: ArrastarParaAtualizar(
        aoAtualizar: _carregar,
        child: ListView(
          padding: const EdgeInsets.all(BichuEspaco.e4),
          children: <Widget>[
            if (_falha != null) ...<Widget>[
              FaixaDeAviso(texto: _falha as String),
              const SizedBox(height: BichuEspaco.e3),
            ],
            if (_carregando)
              const Center(
                child: Padding(
                  padding: EdgeInsets.all(BichuEspaco.e8),
                  child: CircularProgressIndicator(),
                ),
              )
            // Com falha, o vazio NAO e anunciado: "você não bloqueou ninguém" e
            // "não consegui perguntar" são afirmações diferentes, e a primeira
            // seria mentira em cima da segunda.
            else if (itens.isEmpty && _falha == null)
              Padding(
                padding: const EdgeInsets.symmetric(vertical: BichuEspaco.e8),
                child: Column(
                  children: <Widget>[
                    Text(
                      TelaDeBloqueados.vazio,
                      style: textos.titleMedium?.copyWith(
                        color: cores.textPrimary,
                      ),
                      textAlign: TextAlign.center,
                    ),
                    const SizedBox(height: BichuEspaco.e2),
                    Text(
                      TelaDeBloqueados.explicacaoDoVazio,
                      style: textos.bodyMedium?.copyWith(
                        color: cores.textSecondary,
                      ),
                      textAlign: TextAlign.center,
                    ),
                  ],
                ),
              )
            else ...<Widget>[
              Text(
                TelaDeBloqueados.oQueODesbloqueioNaoFaz,
                style: textos.bodySmall?.copyWith(color: cores.textSecondary),
              ),
              const SizedBox(height: BichuEspaco.e4),
              ...itens.map((PessoaBloqueada pessoa) => _cartao(cores, textos, pessoa)),
            ],
          ],
        ),
      ),
    );
  }

  Widget _cartao(BichuCores cores, TextTheme textos, PessoaBloqueada pessoa) {
    final ocupado = _emCurso.contains(pessoa.publicRef);
    final nome = pessoa.nomeParaLer;
    final apelido = pessoa.handle;
    // O apelido só é segunda linha quando NÃO é ele que está na primeira:
    // `@marina` duas vezes não desempata nada.
    final mostraOApelido = apelido != null && apelido.isNotEmpty && nome != '@$apelido';
    return Container(
      margin: const EdgeInsets.only(bottom: BichuEspaco.e3),
      padding: const EdgeInsets.all(BichuEspaco.e4),
      decoration: BoxDecoration(
        color: cores.surface,
        borderRadius: BorderRadius.circular(BichuRaio.md),
        border: Border.all(color: cores.outline, width: BichuBorda.hairline),
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: <Widget>[
          Text(
            nome,
            style: textos.titleMedium?.copyWith(color: cores.textPrimary),
          ),
          if (mostraOApelido) ...<Widget>[
            const SizedBox(height: BichuEspaco.e1),
            Text(
              '@$apelido',
              style: textos.bodySmall?.copyWith(color: cores.textSecondary),
            ),
          ],
          const SizedBox(height: BichuEspaco.e1),
          Text(
            'Bloqueada em ${_data(pessoa.bloqueadoEm)}',
            style: textos.bodySmall?.copyWith(color: cores.textSecondary),
          ),
          const SizedBox(height: BichuEspaco.e2),
          // `Expanded` e nao `MainAxisAlignment.end`: o tema desta casa da aos
          // botoes largura minima infinita, e dentro de uma `Row` isso estoura
          // o layout com "BoxConstraints forces an infinite width".
          Row(
            children: <Widget>[
              Expanded(
                child: FilledButton(
                  onPressed: ocupado ? null : () => unawaited(_desbloquear(pessoa.publicRef)),
                  // O nome acessivel DIZ DE QUEM E o botao: cinco botoes
                  // chamados "Desbloquear" numa lista nao dizem nada a quem usa
                  // leitor de tela.
                  child: Semantics(
                    label: '${TelaDeBloqueados.desbloquear} $nome',
                    excludeSemantics: true,
                    child: const Text(TelaDeBloqueados.desbloquear),
                  ),
                ),
              ),
            ],
          ),
        ],
      ),
    );
  }

  /// `dd/mm/aaaa`, montado aqui.
  ///
  /// Sem `intl`: o pacote não está no `pubspec.yaml` desta frente, e trazê-lo
  /// por uma data é peso que a entrega não precisa. A ordem é a brasileira.
  static String _data(DateTime quando) {
    final local = quando.toLocal();
    final dia = local.day.toString().padLeft(2, '0');
    final mes = local.month.toString().padLeft(2, '0');
    return '$dia/$mes/${local.year}';
  }
}
