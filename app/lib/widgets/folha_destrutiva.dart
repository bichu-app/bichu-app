import 'package:flutter/material.dart';

import '../api/falhas.dart';
import '../api/mensagens_de_erro.dart';
import '../theme/bichu_colors.dart';
import '../theme/bichu_tokens.g.dart';
import 'faixa_de_aviso.dart';

/// A folha inferior destrutiva do paragrafo 11.9.1 do design system.
///
/// Usada quando a acao apaga algo que nao volta. Nesta entrega, `Excluir o
/// pet` (BICHUS-60).
///
/// ## Por que folha, e nao dialogo
///
/// O documento e explicito: no celular a folha inferior poe a confirmacao ao
/// alcance do polegar e o dialogo centralizado nao. **O fundo continua
/// `surface`**: uma folha inteira em `urgency` seria a cor de alerta gritando
/// antes de a pessoa ter lido, e ela ja vai gritar no botao.
///
/// ## A inversao das acoes, que e a parte que mais erra
///
/// | Posicao | Acao | Alvo |
/// |---|---|---|
/// | **Primeira, mais alta** | **Cancelar**, `secondary` | **64 dp** |
/// | Abaixo, separada por `space/4` | Confirmar a destruicao, `danger` | 48 dp |
///
/// Em toda folha NAO destrutiva a acao principal e a de 64 dp e fica no topo.
/// Aqui o topo continua sendo o alvo grande, mas quem ocupa esse lugar e
/// **cancelar**: quem fecha a folha no susto, sem ler, acerta o botao que nao
/// destroi. O botao destrutivo nao e o maior nem o mais alto, e isso e
/// proposital -- ele nao deve atrair o polegar. Os 16 dp entre os dois sao o
/// `target.gap-consequencia-alta` do 11.1: alvos de efeito oposto com 8 dp de
/// folga produzem toque errado.
///
/// ## Sem campo de senha, e isso e leitura do contrato
///
/// O 11.9.1 leva um campo de senha **para as destruicoes que exigem
/// reautenticacao**, e diz, com todas as letras, que "para as destruicoes que
/// nao exigem reautenticacao (remover um pet, cancelar uma tag) nao ha campo
/// nenhum: so as duas acoes. Friction inventada onde o contrato nao pede e
/// friction que as pessoas aprendem a atravessar sem ler".
///
/// `DELETE /pets/{petId}` declara `security: [bearerAuth]` sozinho no
/// `api/openapi.yaml`, sem `reauth: []`. Entao aqui nao ha campo.
///
/// ## O gesto de voltar equivale a cancelar, nunca a confirmar
///
/// O `Navigator.pop` sem valor devolve nulo, e [mostrarFolhaDestrutiva]
/// traduz nulo para `false`. Um `?? true` nesta linha transformaria o gesto de
/// voltar do sistema num confirmador de exclusao, e seria invisivel na
/// revisao.
class FolhaDestrutiva extends StatefulWidget {
  const FolhaDestrutiva({
    required this.titulo,
    required this.corpo,
    required this.oQueSome,
    required this.rotuloDeConfirmar,
    required this.rotuloAcessivelDeConfirmar,
    required this.aoConfirmar,
    super.key,
    this.avisoExtra,
    this.rotuloDeCancelar = 'Cancelar',
  });

  /// `title-lg` em `text-primary`, **nunca em `error`**: titulo vermelho sobre
  /// corpo neutro faz o olho pular a explicacao.
  final String titulo;

  /// `body`. O paragrafo que explica a consequencia antes da lista.
  final String corpo;

  /// O que some, em lista de marcadores, com quantidade concreta quando
  /// existir. E o miolo do criterio 3 da BICHUS-60.
  final List<String> oQueSome;

  /// Um aviso a mais, acima das acoes, para o que depende do estado do pet --
  /// hoje, o caso de perdido aberto (criterio 4 da BICHUS-60).
  final String? avisoExtra;

  final String rotuloDeConfirmar;

  /// O nome acessivel do botao destrutivo. O 11.9.1 exige que ele diga **o
  /// que** sera destruido, e nao so "Confirmar": quem navega por leitor de
  /// tela chega no botao sem o contexto que a pessoa vidente tem da folha
  /// inteira na frente dela.
  final String rotuloAcessivelDeConfirmar;

  final String rotuloDeCancelar;

  /// A destruicao. Estourar aqui e o caminho esperado do erro: a folha
  /// permanece aberta, **nada foi destruido**, e a falha aparece na faixa.
  final Future<void> Function() aoConfirmar;

  @override
  State<FolhaDestrutiva> createState() => _FolhaDestrutivaState();
}

class _FolhaDestrutivaState extends State<FolhaDestrutiva> {
  bool _emAndamento = false;
  String? _erro;

  Future<void> _confirmar() async {
    setState(() {
      _emAndamento = true;
      _erro = null;
    });
    try {
      await widget.aoConfirmar();
      if (!mounted) return;
      Navigator.of(context).pop(true);
    } on FalhaDeChamada catch (falha) {
      // **A folha nao fecha, e o estado nao vira "excluido".** Fechar aqui
      // devolveria a pessoa para uma lista que ainda tem o pet, sem dizer por
      // que, e ela tentaria de novo achando que o primeiro toque nao pegou.
      if (!mounted) return;
      setState(() {
        _emAndamento = false;
        _erro = MensagensDeErro.de(falha).texto;
      });
    }
  }

  @override
  Widget build(BuildContext context) {
    final cores = BichuColors.of(context).cores;
    final textos = Theme.of(context).textTheme;

    return Semantics(
      // O equivalente do `role=alertdialog` do documento: a folha nomeia a
      // propria rota e prende o foco dentro dela.
      scopesRoute: true,
      namesRoute: true,
      explicitChildNodes: true,
      label: widget.titulo,
      // **A folha ROLA, e isso nao e acabamento.**
      //
      // O conteudo dela e variavel por natureza: a lista do que some cresce
      // com o numero de fotos, o aviso do caso aberto entra so as vezes, e a
      // faixa de erro de rede entra por cima de tudo isso sem nada sair. Com a
      // `Column` solta, o primeiro pet com caso aberto ja estourava o
      // `RenderFlex` -- e o que estoura e o **fim** da coluna, que e onde
      // moram as duas acoes. A pessoa ficava com a explicacao na tela e os
      // botoes fora dela.
      //
      // A fonte do sistema em 200% (acessibilidade, criterio 15 da BICHUS-62)
      // produz o mesmo estouro com o conteudo minimo, e num aparelho baixo
      // tambem. `isScrollControlled: true` ja esta ligado em
      // [mostrarFolhaDestrutiva]: o que faltava era o conteudo poder rolar
      // dentro do espaco que ele libera.
      child: SingleChildScrollView(
        child: Padding(
          padding: EdgeInsets.only(
            left: BichuEspaco.e4,
            right: BichuEspaco.e4,
            bottom: MediaQuery.of(context).viewPadding.bottom + BichuEspaco.e4,
          ),
          child: Column(
            mainAxisSize: MainAxisSize.min,
            crossAxisAlignment: CrossAxisAlignment.start,
            children: <Widget>[
              const _AlcaDeArraste(),
              // Icone `warning` de 32 dp em `error`, acima do titulo e alinhado
              // a esquerda com ele. Decorativo para o leitor de tela: o titulo
              // logo abaixo ja diz o que o icone ilustra, e anuncia-lo seria uma
              // parada a mais antes da frase que importa.
              ExcludeSemantics(
                child: Icon(
                  Icons.warning_amber_rounded,
                  size: BichuEspaco.e8,
                  color: cores.error,
                ),
              ),
              const SizedBox(height: BichuEspaco.e2),
              Semantics(
                header: true,
                child: Text(
                  widget.titulo,
                  style: textos.titleLarge?.copyWith(color: cores.textPrimary),
                ),
              ),
              const SizedBox(height: BichuEspaco.e3),
              Text(widget.corpo, style: textos.bodyMedium),
              if (widget.oQueSome.isNotEmpty) ...<Widget>[
                const SizedBox(height: BichuEspaco.e3),
                ...widget.oQueSome.map((item) => _Marcador(texto: item)),
              ],
              if (widget.avisoExtra != null) ...<Widget>[
                const SizedBox(height: BichuEspaco.e4),
                FaixaDeAviso(
                  peso: PesoDaFaixa.informativo,
                  texto: widget.avisoExtra!,
                ),
              ],
              if (_erro != null) ...<Widget>[
                const SizedBox(height: BichuEspaco.e4),
                // Banner de erro **acima das acoes**, e nao por cima do
                // conteudo: o 11.9 pede exatamente isso, para a explicacao
                // continuar legivel enquanto a falha aparece.
                FaixaDeAviso(texto: _erro!),
              ],
              const SizedBox(height: BichuEspaco.e6),

              // ----------------------------------------------------------
              // As acoes, invertidas. Cancelar em cima, e com o alvo grande.
              // ----------------------------------------------------------
              _BotaoDeCancelar(
                rotulo: widget.rotuloDeCancelar,
                // Durante a destruicao as demais acoes ficam desabilitadas
                // (11.9, estado "carregando"). Nao e enfeite: o `DELETE` ja
                // saiu, e deixar cancelar sugeriria que ele nao saiu.
                aoTocar: _emAndamento
                    ? null
                    : () => Navigator.of(context).pop(false),
              ),
              const SizedBox(height: BichuEspaco.e4),
              _BotaoDestrutivo(
                rotulo: widget.rotuloDeConfirmar,
                rotuloAcessivel: widget.rotuloAcessivelDeConfirmar,
                carregando: _emAndamento,
                aoTocar: _confirmar,
              ),
            ],
          ),
        ),
      ),
    );
  }
}

/// Abre a folha e devolve **se a destruicao aconteceu**.
///
/// `false` cobre os tres jeitos de nao destruir: tocar em cancelar, fechar
/// pelo gesto de voltar do sistema, e arrastar a folha para baixo. Nenhum
/// deles chega a chamar `aoConfirmar`.
Future<bool> mostrarFolhaDestrutiva(
  BuildContext context, {
  required String titulo,
  required String corpo,
  required List<String> oQueSome,
  required String rotuloDeConfirmar,
  required String rotuloAcessivelDeConfirmar,
  required Future<void> Function() aoConfirmar,
  String? avisoExtra,
  String rotuloDeCancelar = 'Cancelar',
}) async {
  final cores = BichuColors.of(context).cores;
  final confirmou = await showModalBottomSheet<bool>(
    context: context,
    // **`surface`, e nao `urgency`.** Ver o cabecalho da classe.
    backgroundColor: cores.surface,
    barrierColor: cores.scrim,
    isScrollControlled: true,
    shape: const RoundedRectangleBorder(
      borderRadius: BorderRadius.vertical(top: Radius.circular(BichuRaio.xl)),
    ),
    builder: (contexto) => FolhaDestrutiva(
      titulo: titulo,
      corpo: corpo,
      oQueSome: oQueSome,
      avisoExtra: avisoExtra,
      rotuloDeConfirmar: rotuloDeConfirmar,
      rotuloAcessivelDeConfirmar: rotuloAcessivelDeConfirmar,
      rotuloDeCancelar: rotuloDeCancelar,
      aoConfirmar: aoConfirmar,
    ),
  );
  // Nulo e o gesto de voltar e o arrasto para baixo. Os dois sao cancelar.
  return confirmou ?? false;
}

/// A alca de 36 x 4, centralizada, com 12 de margem acima e abaixo.
///
/// **Decorativa**: fechar sempre tem tambem um botao, e o 11.9 diz que a alca
/// nao e o caminho. Fora da arvore de semantica para nao virar uma parada de
/// leitor de tela sem funcao.
class _AlcaDeArraste extends StatelessWidget {
  const _AlcaDeArraste();

  @override
  Widget build(BuildContext context) {
    final cores = BichuColors.of(context).cores;
    return ExcludeSemantics(
      child: Center(
        child: Container(
          width: 36,
          height: 4,
          margin: const EdgeInsets.symmetric(vertical: BichuEspaco.e3),
          decoration: BoxDecoration(
            color: cores.outline,
            borderRadius: BorderRadius.circular(BichuRaio.full),
          ),
        ),
      ),
    );
  }
}

/// Um item da lista do que some.
class _Marcador extends StatelessWidget {
  const _Marcador({required this.texto});

  final String texto;

  @override
  Widget build(BuildContext context) {
    final textos = Theme.of(context).textTheme;
    return Padding(
      padding: const EdgeInsets.only(bottom: BichuEspaco.e2),
      child: Row(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: <Widget>[
          // O marcador entra como texto dentro do mesmo no do item: um
          // `Text('•')` proprio viraria uma parada de leitor de tela que
          // anuncia "bala" e nada mais.
          ExcludeSemantics(
            child: Padding(
              padding: const EdgeInsets.only(right: BichuEspaco.e2),
              child: Text('•', style: textos.bodyMedium),
            ),
          ),
          Expanded(child: Text(texto, style: textos.bodyMedium)),
        ],
      ),
    );
  }
}

/// Cancelar: `secondary`, largura total, **64 dp**.
class _BotaoDeCancelar extends StatelessWidget {
  const _BotaoDeCancelar({required this.rotulo, required this.aoTocar});

  final String rotulo;
  final VoidCallback? aoTocar;

  @override
  Widget build(BuildContext context) {
    return SizedBox(
      width: double.infinity,
      height: BichuAlvoDeToque.critico,
      child: OutlinedButton(onPressed: aoTocar, child: Text(rotulo)),
    );
  }
}

/// A confirmacao da destruicao: `danger` (`urgency` preenchido), largura
/// total, 48 dp.
///
/// `urgency` / `onUrgency` e um par conferido em `design/contrast-pairs.json`
/// ("Banner PERDIDO"), nos dois temas. Nao invente a cor do texto aqui: o
/// portao de contraste mede o par renderizado, e um `Colors.white` a mao
/// reprova no tema escuro.
class _BotaoDestrutivo extends StatelessWidget {
  const _BotaoDestrutivo({
    required this.rotulo,
    required this.rotuloAcessivel,
    required this.carregando,
    required this.aoTocar,
  });

  final String rotulo;
  final String rotuloAcessivel;
  final bool carregando;
  final VoidCallback aoTocar;

  @override
  Widget build(BuildContext context) {
    final cores = BichuColors.of(context).cores;
    final textos = Theme.of(context).textTheme;

    // A acao efetiva numa variavel so, usada pelos tres lugares que precisam
    // concordar: o `onPressed`, o `onTap` da semantica e o `enabled`
    // anunciado. E a mesma disciplina do `BotaoPrimario`, e pelo mesmo motivo:
    // enquanto os tres divergiram, o botao carregando se anunciava habilitado
    // sem ter acao nenhuma.
    final VoidCallback? acao = carregando ? null : aoTocar;

    return Semantics(
      button: true,
      enabled: acao != null,
      // O 11.9.1 exige que este rotulo diga O QUE sera destruido.
      label: carregando ? '$rotuloAcessivel, em andamento' : rotuloAcessivel,
      excludeSemantics: true,
      // `excludeSemantics: true` apaga a arvore do filho e leva junto a acao
      // que o `FilledButton` publica. Sem esta linha o no sai da arvore com
      // `btn=true tap=false`, e `test/a11y/acao_de_controle_test.dart` reprova
      // -- corretamente: quem usa leitor de tela ouviria que existe um botao
      // de excluir e nao teria como aciona-lo.
      onTap: acao,
      child: SizedBox(
        width: double.infinity,
        height: BichuAlvoDeToque.min,
        child: FilledButton(
          onPressed: acao,
          style: FilledButton.styleFrom(
            backgroundColor: cores.urgency,
            foregroundColor: cores.onUrgency,
            disabledBackgroundColor: cores.disabledSurface,
            disabledForegroundColor: cores.onDisabled,
            minimumSize: const Size(double.infinity, BichuAlvoDeToque.min),
            shape: RoundedRectangleBorder(
              borderRadius: BorderRadius.circular(BichuRaio.md),
            ),
          ),
          // **O rotulo continua visivel no estado carregando** (11.9.1), pelo
          // mesmo motivo do `BotaoPrimario`: trocar o rotulo por um indicador
          // tira da tela a unica pista do que esta acontecendo justamente no
          // momento em que a pessoa mais precisa dela.
          child: Row(
            mainAxisAlignment: MainAxisAlignment.center,
            mainAxisSize: MainAxisSize.min,
            children: <Widget>[
              if (carregando) ...<Widget>[
                SizedBox(
                  width: BichuEspaco.e4,
                  height: BichuEspaco.e4,
                  child: CircularProgressIndicator(
                    strokeWidth: 2,
                    color: cores.onDisabled,
                  ),
                ),
                const SizedBox(width: BichuEspaco.e2),
              ],
              Flexible(
                child: Text(
                  rotulo,
                  style: textos.labelLarge,
                  overflow: TextOverflow.ellipsis,
                ),
              ),
            ],
          ),
        ),
      ),
    );
  }
}
