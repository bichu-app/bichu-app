// O motor das duas travas do paragrafo 18.2 de docs/06-design-system.md.
//
// Ele NAO faz `expect`. Ele devolve a lista de violacoes, e quem decide o que
// fazer com ela sao os testes:
//
//   - contraste_texto_test.dart, alvo_de_toque_test.dart,
//     rotulo_acessivel_test.dart e acao_de_controle_test.dart exigem lista
//     VAZIA nas telas conformes;
//   - isca_test.dart exige lista NAO VAZIA nas iscas, com o valor medido.
//
// A separacao existe por um motivo so: um verificador que so sabe reprovar nao
// consegue provar que ainda esta verificando. Prova negativa que vive numa
// frase evapora; guardada como caso no repositorio, ela acusa no dia em que a
// regra parar de funcionar.
//
// Padroes contra os quais isto foi escrito: WCAG 2.1 SC 1.4.3, 1.4.6, 1.4.11,
// 2.4.7, 2.5.3 e 2.5.5, e os pisos proprios do paragrafo 6.5 (7:1 e 64dp em
// superficie critica).

library;

import 'dart:math' as math;
import 'dart:ui' show Tristate;

import 'package:flutter/material.dart';
import 'package:flutter/rendering.dart';
import 'package:flutter_test/flutter_test.dart';

import 'tokens.dart';

/// Prefixo da chave de isencao do paragrafo 18.2.1.
///
/// Isencao so vale marcada, e a lista das encontradas e impressa: isencao que
/// ninguem ve vira isencao permanente.
const String prefixoIsencao = 'a11y-exempt:';

// ---------------------------------------------------------------------------
// Violacao
// ---------------------------------------------------------------------------

enum TipoDeViolacao {
  contraste,
  alvoDeToque,
  rotuloAusente,
  acaoAusente,
  indeterminado,
}

class Violacao {
  Violacao({
    required this.tipo,
    required this.tela,
    required this.tema,
    required this.alvo,
    required this.detalhe,
    this.medido,
    this.piso,
  });

  final TipoDeViolacao tipo;
  final String tela;
  final String tema;
  final String alvo;
  final String detalhe;
  final double? medido;
  final double? piso;

  @override
  String toString() {
    final m = medido == null ? '' : ' medido=${medido!.toStringAsFixed(2)}';
    final p = piso == null ? '' : ' piso=${piso!.toStringAsFixed(2)}';
    return '[${tipo.name}] $tela ($tema) :: $alvo :: $detalhe$m$p';
  }
}

/// Uma linha por violacao. Nao agrega: lista todas (paragrafo 18.2.1).
String relatorio(List<Violacao> v) =>
    v.isEmpty ? '(nenhuma violacao)' : v.map((e) => '  - $e').join('\n');

// ---------------------------------------------------------------------------
// Contraste WCAG 2.1
// ---------------------------------------------------------------------------

double _canalLinear(double c) =>
    c <= 0.04045 ? c / 12.92 : math.pow((c + 0.055) / 1.055, 2.4).toDouble();

/// Luminancia relativa da WCAG 2.1, com linearizacao sRGB.
double luminanciaRelativa(Color c) {
  final r = _canalLinear(c.r);
  final g = _canalLinear(c.g);
  final b = _canalLinear(c.b);
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

/// `(L1 + 0.05) / (L2 + 0.05)`, com L1 sendo a maior das duas luminancias.
double razaoWcag(Color a, Color b) {
  final la = luminanciaRelativa(a);
  final lb = luminanciaRelativa(b);
  final maior = la > lb ? la : lb;
  final menor = la > lb ? lb : la;
  return (maior + 0.05) / (menor + 0.05);
}

/// Texto grande do SC 1.4.3: >= 24px, ou >= 18.66px com peso >= 700.
bool textoGrande(double? tamanho, FontWeight? peso) {
  if (tamanho == null) return false;
  if (tamanho >= 24) return true;
  return tamanho >= 18.66 && (peso?.value ?? 400) >= 700;
}

/// O piso que vale para um texto, dado o piso da tela.
///
/// 7.0 na tela critica cai para 4.5 em texto grande; 4.5 no resto cai para 3.0.
double pisoEfetivo(double pisoDaTela, double? tamanho, FontWeight? peso) {
  if (!textoGrande(tamanho, peso)) return pisoDaTela;
  return pisoDaTela >= 7.0 ? 4.5 : 3.0;
}

// ---------------------------------------------------------------------------
// Trava A: contraste de texto renderizado
// ---------------------------------------------------------------------------

/// Percorre a arvore de renderizacao, coleta cada `RenderParagraph`, resolve a
/// cor efetiva do texto, acha o ancestral mais proximo com preenchimento
/// solido e calcula a razao.
///
/// Texto sem cor resolvivel ou sem fundo solido identificavel vira violacao do
/// tipo `indeterminado`, NUNCA aprovacao silenciosa.
/// [isentarInativo] dispensa o texto que esta DENTRO de um controle inativo,
/// que e a unica isencao de contraste que o SC 1.4.3 concede e a unica que o
/// sistema preve (paragrafo 18.2.1, item 3).
///
/// **ELA NAO E PRESUMIDA POR COR, e essa e a diferenca que importa.** Dispensar
/// o par "`on-disabled` sobre `disabled-surface`" por reconhecer os dois
/// valores faria o verificador dar o perdao a qualquer texto que por acaso
/// tivesse aquelas cores, inclusive num controle bem ativo. O que esta medido
/// aqui e o ESTADO: o texto esta sob um `ButtonStyleButton` cujo `enabled` e
/// falso, ou sob um `Semantics` que anuncia `enabled: false`. Inativo e o que a
/// arvore diz, nao o que a paleta sugere.
///
/// Ela nasceu desligada de proposito: as telas conformes de `telas.dart`
/// declaram a isencao por CHAVE e continuam medindo do jeito que sempre
/// mediram. Quem liga isto e quem monta widget de verdade, onde o controle
/// desabilitado chega pelo proprio estado do componente e nao ha onde pendurar
/// chave.
List<Violacao> verificarContrasteDeTexto(
  WidgetTester tester, {
  required String tela,
  required String tema,
  required double piso,
  bool isentarInativo = false,
}) {
  final violacoes = <Violacao>[];
  final vistos = <RenderParagraph>{};

  for (final elemento in tester.allElements) {
    final ro = elemento.renderObject;
    if (ro is! RenderParagraph) continue;
    if (!vistos.add(ro)) continue; // Text e o RichText de dentro dele.

    final texto = ro.text.toPlainText().trim();
    if (texto.isEmpty) continue; // glifo de icone, espacador.

    final isencao = _isencaoDe(elemento);
    if (isencao != null) continue;

    if (isentarInativo && _dentroDeControleInativo(elemento)) continue;

    final estilo = ro.text.style;
    final frente = estilo?.color;
    if (frente == null) {
      violacoes.add(
        Violacao(
          tipo: TipoDeViolacao.indeterminado,
          tela: tela,
          tema: tema,
          alvo: _resumo(texto),
          detalhe:
              'o texto nao tem cor resolvida no estilo; o verificador nao '
              'consegue medir e por isso reprova',
        ),
      );
      continue;
    }

    final fundo = _fundoSolidoMaisProximo(elemento);
    if (fundo == null) {
      violacoes.add(
        Violacao(
          tipo: TipoDeViolacao.indeterminado,
          tela: tela,
          tema: tema,
          alvo: _resumo(texto),
          detalhe:
              'nenhum ancestral com preenchimento solido: sem fundo nao ha '
              'razao a medir. Pinte a superficie com um token em vez de deixar o '
              'padrao do Material decidir',
        ),
      );
      continue;
    }

    final pisoDoTexto = pisoEfetivo(piso, estilo?.fontSize, estilo?.fontWeight);
    final razao = razaoWcag(frente, fundo);
    if (razao + 0.005 < pisoDoTexto) {
      violacoes.add(
        Violacao(
          tipo: TipoDeViolacao.contraste,
          tela: tela,
          tema: tema,
          alvo: _resumo(texto),
          detalhe:
              'frente ${hexDaCor(frente)} sobre fundo ${hexDaCor(fundo)} '
              '(tamanho ${estilo?.fontSize}, peso ${estilo?.fontWeight?.value})',
          medido: razao,
          piso: pisoDoTexto,
        ),
      );
    }
  }

  return violacoes;
}

/// A razao medida de um texto, pelo seu conteudo. Usada pelas iscas, que
/// precisam afirmar o numero e nao so a reprovacao.
double razaoMedidaDoTexto(WidgetTester tester, String conteudo) {
  final vistos = <RenderParagraph>{};
  for (final elemento in tester.allElements) {
    final ro = elemento.renderObject;
    if (ro is! RenderParagraph) continue;
    if (!vistos.add(ro)) continue;
    if (ro.text.toPlainText().trim() != conteudo) continue;
    final frente = ro.text.style?.color;
    final fundo = _fundoSolidoMaisProximo(elemento);
    if (frente == null || fundo == null) {
      throw StateError(
        'REPROVA: nao consegui medir o texto "$conteudo" '
        '(frente=$frente fundo=$fundo).',
      );
    }
    return razaoWcag(frente, fundo);
  }
  throw StateError('REPROVA: nao achei o texto "$conteudo" na arvore.');
}

Color? _fundoSolidoMaisProximo(Element elemento) {
  Color? achado;
  elemento.visitAncestorElements((ancestral) {
    final cor = _corDeFundoDe(ancestral.widget);
    if (cor != null && cor.a >= 1.0) {
      achado = cor;
      return false;
    }
    return true;
  });
  return achado;
}

Color? _corDeFundoDe(Widget w) {
  if (w is ColoredBox) return w.color;
  if (w is Material) return w.color;
  if (w is Card) return w.color;
  if (w is DecoratedBox) {
    final d = w.decoration;
    if (d is BoxDecoration && d.image == null && d.gradient == null) {
      return d.color;
    }
  }
  return null;
}

/// A isencao do elemento ou de qualquer ancestral, se houver.
String? _isencaoDe(Element elemento) {
  String? deChave(Key? k) {
    if (k is ValueKey<String> && k.value.startsWith(prefixoIsencao)) {
      return k.value.substring(prefixoIsencao.length);
    }
    return null;
  }

  var achado = deChave(elemento.widget.key);
  if (achado != null) return achado;
  elemento.visitAncestorElements((a) {
    final m = deChave(a.widget.key);
    if (m != null) {
      achado = m;
      return false;
    }
    return true;
  });
  return achado;
}

/// Toda isencao encontrada na arvore. O job publica esta lista no resumo da
/// execucao (paragrafo 18.2.1, item 3).
List<String> isencoesEncontradas(WidgetTester tester) {
  final motivos = <String>{};
  for (final elemento in tester.allElements) {
    final k = elemento.widget.key;
    if (k is ValueKey<String> && k.value.startsWith(prefixoIsencao)) {
      motivos.add(k.value.substring(prefixoIsencao.length));
    }
  }
  final lista = motivos.toList()..sort();
  return lista;
}

/// O alvo, como ele aparece no relatorio.
///
/// GLIFO DE ICONE NAO E TEXTO LEGIVEL, e isso tinha consequencia pratica: o
/// `Icon` do Flutter renderiza por `RichText`, entao ele CAI no verificador de
/// texto (e bem: foi assim que o coracao do Mural, a 1.62:1, foi pego). Mas o
/// caractere dele vive na area de uso privado da fonte, e `_resumo` o
/// devolvia cru -- a reprovacao saia com o alvo em branco (`::  ::`), sem
/// dizer QUAL icone da tela estava ilegivel. Reprovacao que nao nomeia o alvo
/// obriga quem le a adivinhar, e numa tela com sete icones isso e quase o
/// mesmo que nao reprovar.
///
/// O ponto de codigo identifica o glifo sem depender de tabela de nomes:
/// `Icons.favorite` e U+E25B em toda versao do pacote de icones.
String _resumo(String t) {
  if (t.runes.length == 1) {
    final ponto = t.runes.first;
    // Area de uso privado do Unicode: E000-F8FF (BMP) e os dois planos
    // suplementares, que e onde todo glifo de fonte de icone mora.
    final usoPrivado = (ponto >= 0xE000 && ponto <= 0xF8FF) ||
        (ponto >= 0xF0000 && ponto <= 0x10FFFD);
    if (usoPrivado) {
      final hex = ponto.toRadixString(16).toUpperCase().padLeft(4, '0');
      return 'icone U+$hex';
    }
  }
  return t.length <= 48 ? t : '${t.substring(0, 45)}...';
}

// ---------------------------------------------------------------------------
// Alvo de toque e rotulo acessivel, pela arvore de semantica
// ---------------------------------------------------------------------------

class _NoMedido {
  _NoMedido(this.dados, this.retanguloDp);
  final SemanticsData dados;
  final Rect retanguloDp;
}

List<_NoMedido> _nosTocaveis(WidgetTester tester) {
  // `pipelineOwner` esta depreciado em favor de `rootPipelineOwner`, e a troca
  // NAO foi feita de proposito: conferido nesta versao do Flutter (3.47.4),
  // `rootPipelineOwner.semanticsOwner.rootSemanticsNode` vem nulo, e um
  // verificador que le a raiz nula devolve lista vazia, que e exatamente o
  // modo de falha silenciosa que este arquivo existe para impedir. Quando a
  // substituicao passar a entregar a raiz, troque e confira que as iscas de
  // alvo e de rotulo continuam reprovando.
  // ignore: deprecated_member_use
  final owner = tester.binding.pipelineOwner.semanticsOwner;
  if (owner == null || owner.rootSemanticsNode == null) {
    throw StateError(
      'REPROVA: a arvore de semantica nao existe. Chame '
      'tester.ensureSemantics() antes de verificar alvo de toque ou rotulo: '
      'sem ela o verificador nao ve nada e aprovaria por engano.',
    );
  }

  // As coordenadas da semantica vem em pixel fisico; os pisos do documento
  // sao em dp. Dividir pelo devicePixelRatio e o que torna os dois
  // comparaveis, e esquecer isso faz 40dp parecer 120 e o portao aprovar tudo.
  final dpr = tester.view.devicePixelRatio;
  final saida = <_NoMedido>[];

  void andar(SemanticsNode no, Matrix4 acumulado) {
    final t = acumulado.clone();
    if (no.transform != null) t.multiply(no.transform!);
    final r = MatrixUtils.transformRect(t, no.rect);
    final dados = no.getSemanticsData();
    if (dados.hasAction(SemanticsAction.tap) ||
        dados.flagsCollection.isButton) {
      saida.add(
        _NoMedido(
          dados,
          Rect.fromLTRB(
            r.left / dpr,
            r.top / dpr,
            r.right / dpr,
            r.bottom / dpr,
          ),
        ),
      );
    }
    no.visitChildren((filho) {
      andar(filho, t);
      return true;
    });
  }

  andar(owner.rootSemanticsNode!, Matrix4.identity());
  return saida;
}

/// Reprova quando o verificador enxergou menos nos tocaveis do que a tela
/// declara ter.
///
/// Esta e a defesa que importa, e ela substituiu uma que nao funcionava. A
/// primeira versao checava se a arvore de semantica existia; no binding de
/// teste ela existe sempre, entao o cheque passava e, quando a arvore vinha
/// vazia por qualquer outro motivo, o verificador devolvia lista vazia, que e
/// indistinguivel de "esta tudo certo". Contar e comparar com o que a tela
/// declara e o que transforma cegueira em reprovacao ruidosa.
Violacao? _conferirCobertura(
  int encontrados,
  int esperados,
  String tela,
  String tema,
) {
  if (encontrados >= esperados) return null;
  return Violacao(
    tipo: TipoDeViolacao.indeterminado,
    tela: tela,
    tema: tema,
    alvo: '(cobertura)',
    detalhe:
        'a tela declara $esperados no(s) tocavel(is) e o verificador '
        'achou $encontrados. Ou a arvore de semantica nao esta ligada '
        '(tester.ensureSemantics()), ou a tela mudou e a contagem ficou para '
        'tras. Nos dois casos o resultado anterior era verde por nao estar '
        'olhando para nada',
    medido: encontrados.toDouble(),
    piso: esperados.toDouble(),
  );
}

/// Alvo de toque: 48dp no app, 64dp nas acoes criticas (paragrafo 6.5 e
/// pesquisa de UX 15.1). Mede altura E largura, porque o documento manda
/// "64 dp de altura e largura total".
///
/// [tocaveisEsperados] e quantos elementos interativos a tela tem. Nao e
/// burocracia: e o que impede o caso em que o verificador nao ve nada e
/// devolve "nenhuma violacao".
List<Violacao> verificarAlvoDeToque(
  WidgetTester tester, {
  required String tela,
  required String tema,
  required double piso,
  required int tocaveisEsperados,
}) {
  final violacoes = <Violacao>[];
  final nos = _nosTocaveis(tester);
  final falta = _conferirCobertura(nos.length, tocaveisEsperados, tela, tema);
  if (falta != null) violacoes.add(falta);
  for (final no in nos) {
    if (no.dados.flagsCollection.isHidden) continue;
    final rotulo = _rotuloDe(no.dados);
    final menor = no.retanguloDp.height < no.retanguloDp.width
        ? no.retanguloDp.height
        : no.retanguloDp.width;
    if (menor + 0.01 < piso) {
      violacoes.add(
        Violacao(
          tipo: TipoDeViolacao.alvoDeToque,
          tela: tela,
          tema: tema,
          alvo: rotulo.isEmpty ? '(sem rotulo)' : _resumo(rotulo),
          detalhe:
              'alvo de ${no.retanguloDp.width.toStringAsFixed(1)} x '
              '${no.retanguloDp.height.toStringAsFixed(1)} dp',
          medido: menor,
          piso: piso,
        ),
      );
    }
  }
  return violacoes;
}

/// Todo elemento tocavel precisa de nome acessivel (SC 4.1.2), e o rotulo
/// visivel precisa estar contido nele (SC 2.5.3, comando de voz).
List<Violacao> verificarRotulos(
  WidgetTester tester, {
  required String tela,
  required String tema,
  required int tocaveisEsperados,
}) {
  final violacoes = <Violacao>[];
  final nos = _nosTocaveis(tester);
  final falta = _conferirCobertura(nos.length, tocaveisEsperados, tela, tema);
  if (falta != null) violacoes.add(falta);
  for (final no in nos) {
    if (no.dados.flagsCollection.isHidden) continue;
    final rotulo = _rotuloDe(no.dados);
    if (rotulo.trim().isEmpty) {
      violacoes.add(
        Violacao(
          tipo: TipoDeViolacao.rotuloAusente,
          tela: tela,
          tema: tema,
          alvo: 'no tocavel em ${no.retanguloDp.topLeft}',
          detalhe:
              'sem rotulo, dica nem valor: o leitor de tela anuncia so '
              '"botao". Icone que representa acao carrega rotulo textual visivel '
              'ou semanticsLabel (paragrafo 10.1)',
        ),
      );
    }
  }
  return violacoes;
}

/// Todo no anunciado como BOTAO e nao desabilitado precisa carregar a acao de
/// toque (WCAG 2.1 SC 4.1.2: nome, **funcao** e valor; e SC 2.1.1, operavel
/// por outro meio que nao o ponteiro).
///
/// POR QUE ESTE PORTAO EXISTE, e por que ele varre em vez de apontar um widget:
///
/// O produto acumulou dois defeitos da mesma familia em menos de um dia, e os
/// dois passaram pela suite inteira verdes:
///
///  1. o `ListView` das abas embrulhava cada secao num `IndexedSemantics` e a
///     secao virava UM no anunciado como botao, com o nome sendo a
///     concatenacao de toda a tela (corrigido na BICHUS-62);
///  2. o inverso: o no existe, e anunciado como botao, e **perdeu a acao** --
///     `Semantics(button: true, excludeSemantics: true)` sem redeclarar
///     `onTap` apaga a arvore do filho e leva a acao junto.
///
/// Os dois passaram porque a verificacao de acessibilidade do projeto olhava
/// **rotulo e contraste, e nao olhava acao**. Consertar os widgets nao fecha a
/// classe: o proximo `excludeSemantics` reabre. Isto fecha.
///
/// Tres decisoes que valem ser lidas antes de mexer:
///
/// - **Desabilitado nao e violacao.** Botao com `enabled: false` corretamente
///   nao tem acao, e exigir acao dele faria o portao cobrar o contrario do
///   certo. `Tristate.none` (sem estado declarado) CONTA como habilitado: e o
///   caso do `InkWell` embrulhado, que e justamente onde o defeito mora.
/// - **A medida e a arvore de semantica em execucao, nunca o texto do
///   arquivo.** Uma varredura de fonte casaria com a mencao ao mecanismo
///   dentro de um comentario -- foi o que aconteceu com uma isca da BICHUS-164,
///   que nascia furada porque apagar o codigo de verdade a deixava verde. Este
///   portao nao tem como olhar para um comentario: ele le o que o aparelho
///   entrega ao leitor de tela.
/// - **`tap`, e nao qualquer acao.** Botao que so responde a `longPress` nao e
///   alcancavel pelo gesto de ativacao padrao de TalkBack e VoiceOver.
///
/// [botoesEsperados] e a mesma defesa de cobertura das outras travas: portao
/// que nao enxerga nada devolve lista vazia, e lista vazia e indistinguivel de
/// "esta tudo certo".
///
/// **Nulo NAO desliga a defesa**, e essa e a unica coisa que importa nesta
/// assinatura. Ele troca a contagem exata pelo piso de **pelo menos um** botao:
/// telas empilhadas sobre a casca de abas nao tem contagem estavel -- ela muda
/// com o que a casca deixa na arvore por baixo --, e um numero chutado ali
/// viraria manutencao a cada mexida em outra tela. O que continua impossivel e
/// o portao ficar verde sem ter olhado para nada.
List<Violacao> verificarAcaoDosControles(
  WidgetTester tester, {
  required String tela,
  required String tema,
  int? botoesEsperados,
}) {
  final violacoes = <Violacao>[];
  final nos = _nosTocaveis(tester);
  // NAO filtra `isHidden`, e a diferenca importa. As outras travas pulam o
  // no escondido porque medir tamanho ou cor de algo fora da tela nao diz
  // nada. Acao e outra coisa: o segmento que esta abaixo da dobra volta a
  // aparecer assim que a pessoa rola, e ele precisa carregar a acao ja. Pular
  // escondido aqui deixaria de fora justamente os controles do fim de
  // formulario longo, que sao os que ninguem testa a mao.
  final botoes = nos.where((n) => n.dados.flagsCollection.isButton).toList();

  if (botoesEsperados != null) {
    final falta =
        _conferirCobertura(botoes.length, botoesEsperados, tela, tema);
    if (falta != null) {
      violacoes.add(
        Violacao(
          tipo: TipoDeViolacao.indeterminado,
          tela: falta.tela,
          tema: falta.tema,
          alvo: '(cobertura de botoes)',
          detalhe:
              'a tela declara $botoesEsperados no(s) anunciado(s) como botao e '
              'o portao achou ${botoes.length}. Ou a arvore de semantica nao '
              'esta ligada (tester.ensureSemantics()), ou a tela mudou e a '
              'contagem ficou para tras. Nos dois casos um verde aqui seria '
              'verde por nao estar olhando para nada',
          medido: botoes.length.toDouble(),
          piso: botoesEsperados.toDouble(),
        ),
      );
    }
  } else if (botoes.isEmpty) {
    // O piso sem contagem: zero botao e o unico desfecho em que esta varredura
    // nao conferiu nada, e ele reprova alto em vez de passar calado.
    violacoes.add(
      Violacao(
        tipo: TipoDeViolacao.indeterminado,
        tela: tela,
        tema: tema,
        alvo: '(cobertura de botoes)',
        detalhe:
            'o portao nao achou nenhum no anunciado como botao. Ou a arvore '
            'de semantica nao esta ligada (tester.ensureSemantics()), ou a '
            'tela nao chegou a montar. Verde aqui seria verde por vazio',
        medido: 0,
        piso: 1,
      ),
    );
  }

  for (final no in botoes) {
    final d = no.dados;
    // Desabilitado por declaracao: ausencia de acao e o comportamento certo.
    if (d.flagsCollection.isEnabled == Tristate.isFalse) continue;
    if (d.hasAction(SemanticsAction.tap)) continue;

    final rotulo = _rotuloDe(d);
    violacoes.add(
      Violacao(
        tipo: TipoDeViolacao.acaoAusente,
        tela: tela,
        tema: tema,
        alvo: rotulo.isEmpty
            ? '(sem rotulo) em ${no.retanguloDp.topLeft}'
            : _resumo(rotulo),
        detalhe:
            'anunciado como botao, habilitado, e SEM a acao de toque. Quem '
            'navega por TalkBack ou VoiceOver ouve que existe um botao e nao '
            'recebe a acao: o controle e inalcancavel pelo leitor de tela '
            '(WCAG 2.1 SC 4.1.2). A causa quase sempre e um '
            '`Semantics(button: true, excludeSemantics: true)` que nao '
            'redeclarou `onTap` -- o `excludeSemantics` apaga a arvore do '
            'filho e leva a acao do `InkWell` ou do `*Button` junto. '
            'enabled=${d.flagsCollection.isEnabled.name} acoes=${d.actions}',
      ),
    );
  }
  return violacoes;
}

String _rotuloDe(SemanticsData d) {
  if (d.label.trim().isNotEmpty) return d.label;
  if (d.tooltip.trim().isNotEmpty) return d.tooltip;
  if (d.value.trim().isNotEmpty) return d.value;
  return '';
}

// ---------------------------------------------------------------------------
// Trava B, item 3: contraste recalculado sobre o JSON
// ---------------------------------------------------------------------------

class ResultadoDoPar {
  ResultadoDoPar({
    required this.id,
    required this.uso,
    required this.calculado,
    required this.publicado,
    required this.piso,
    required this.veredito,
    required this.aprovado,
    required this.motivo,
  });

  final String id;
  final String uso;
  final double calculado;
  final double publicado;
  final double piso;
  final String veredito;
  final bool aprovado;
  final String motivo;

  @override
  String toString() =>
      '[$veredito] $id ($uso) calculado='
      '${calculado.toStringAsFixed(2)} publicado='
      '${publicado.toStringAsFixed(2)} piso=${piso.toStringAsFixed(2)}'
      '${aprovado ? '' : ' :: $motivo'}';
}

/// Recalcula cada par de `design/contrast-pairs.json` sobre
/// `design/tokens.json`.
///
/// Reprova em duas situacoes, e a segunda e a que pega o caso real:
///  1. par com veredito `passa` abaixo do piso;
///  2. par cuja razao calculada diverge da publicada no paragrafo 7. Alguem
///     mexeu num token e nao regerou a tabela; passar no piso nao basta.
List<ResultadoDoPar> verificarPares(
  TokensBichu tokens,
  Map<String, dynamic> lista,
) {
  final pares = lista['pares'];
  if (pares is! List || pares.isEmpty) {
    throw StateError(
      'REPROVA: a lista de pares esta vazia ou fora do formato. Um verificador '
      'de contraste sem pares fica verde sem olhar para nada.',
    );
  }

  final saida = <ResultadoDoPar>[];
  for (final p in pares.cast<Map<String, dynamic>>()) {
    final id = p['id'] as String;
    final piso = (p['piso'] as num).toDouble();
    final publicado = (p['razao_esperada'] as num).toDouble();
    final veredito = p['veredito'] as String;

    final frente = tokens.cor(_semChaves(p['frente'] as String));
    final fundo = tokens.cor(_semChaves(p['fundo'] as String));
    final calculado = razaoWcag(frente, fundo);
    final arredondado = (calculado * 100).round() / 100;

    var aprovado = true;
    var motivo = '';

    if ((arredondado - publicado).abs() > 0.005) {
      aprovado = false;
      motivo =
          'a razao calculada nao bate com a publicada no paragrafo 7. '
          'Algum token mudou sem a tabela ser regerada.';
    } else if (veredito == 'passa' && arredondado + 0.005 < piso) {
      aprovado = false;
      motivo = 'abaixo do piso. Par que reprova nao entra no sistema.';
    } else if (veredito == 'isento' && p['isencao'] == null) {
      aprovado = false;
      motivo =
          'isencao sem motivo nomeado. Isencao implicita e isencao '
          'permanente.';
    }

    saida.add(
      ResultadoDoPar(
        id: id,
        uso: p['uso'] as String,
        calculado: arredondado,
        publicado: publicado,
        piso: piso,
        veredito: veredito,
        aprovado: aprovado,
        motivo: motivo,
      ),
    );
  }
  return saida;
}

String _semChaves(String ref) => ref.startsWith('{') && ref.endsWith('}')
    ? ref.substring(1, ref.length - 1)
    : ref;

// ---------------------------------------------------------------------------
// Trava A2: contraste de OBJETO GRAFICO nao textual (SC 1.4.11)
// ---------------------------------------------------------------------------

/// Prefixo da chave de isencao de objeto GRAFICO.
///
/// **Ele e separado de [prefixoIsencao] de proposito, e a separacao e a parte
/// util.** Isencao e por CRITERIO, nao por widget: um `a11y-exempt:componente
/// desabilitado, SC 1.4.3` declarado para o ROTULO de um botao dispensa o
/// contraste do TEXTO, e nada mais. Se o mesmo prefixo valesse aqui, pendurar
/// aquela chave num ancestral silenciaria tambem o indicador de carga de
/// dentro do botao -- que e exatamente o defeito medido em 03/11/2026, um
/// `CircularProgressIndicator` a 1.02:1 no tema escuro. Uma chave que dispensa
/// um criterio nao pode dispensar o outro sem alguem escrever que quis isso.
const String prefixoIsencaoDeGrafico = 'a11y-exempt-grafico:';

/// Contraste dos INDICADORES contra o fundo solido atras deles, piso de 3:1
/// (SC 1.4.11, objeto grafico).
///
/// POR QUE ELE EXISTE, e por que [verificarContrasteDeTexto] nao bastava:
/// aquele le `RenderParagraph`, e indicador de carga nao tem paragrafo nenhum.
/// Um botao que fica legivel e com o giro INVISIVEL passava nas duas travas
/// com folga, porque nenhuma das duas olhava para ele. Foi assim que
/// `widgets/botao_primario.dart` pintou o giro com a tinta de um
/// preenchimento (`on-action-fill`) enquanto o botao, por estar desabilitado
/// durante a carga, pintava o fundo com `disabled-surface`: 1.02:1 no escuro,
/// um giro que nao existe para quem olha.
///
/// Devolve violacao `indeterminado`, e NUNCA aprovacao silenciosa, quando o
/// indicador nao tem cor resolvida ou quando nao ha fundo solido atras dele.
List<Violacao> verificarContrasteDeIndicador(
  WidgetTester tester, {
  required String tela,
  required String tema,
  double piso = 3.0,
}) {
  final violacoes = <Violacao>[];

  for (final elemento in tester.allElements) {
    final w = elemento.widget;
    if (w is! ProgressIndicator) continue;
    if (_isencaoDeGrafico(elemento) != null) continue;

    final frente = w.color;
    if (frente == null) {
      violacoes.add(
        Violacao(
          tipo: TipoDeViolacao.indeterminado,
          tela: tela,
          tema: tema,
          alvo: '${w.runtimeType}',
          detalhe:
              'o indicador nao declara `color`, entao quem decide a tinta e o '
              'tema do Material e nao o design system. O verificador nao tem o '
              'que medir e por isso reprova: pinte com um token',
        ),
      );
      continue;
    }

    final fundo = _fundoSolidoMaisProximo(elemento);
    if (fundo == null) {
      violacoes.add(
        Violacao(
          tipo: TipoDeViolacao.indeterminado,
          tela: tela,
          tema: tema,
          alvo: '${w.runtimeType}',
          detalhe:
              'nenhum ancestral com preenchimento solido atras do indicador: '
              'sem fundo nao ha razao a medir',
        ),
      );
      continue;
    }

    final razao = razaoWcag(frente, fundo);
    if (razao + 0.005 < piso) {
      violacoes.add(
        Violacao(
          tipo: TipoDeViolacao.contraste,
          tela: tela,
          tema: tema,
          alvo: '${w.runtimeType}',
          detalhe:
              'frente ${hexDaCor(frente)} sobre fundo ${hexDaCor(fundo)} '
              '(objeto grafico, SC 1.4.11)',
          medido: razao,
          piso: piso,
        ),
      );
    }
  }

  return violacoes;
}

/// Quantos indicadores a arvore tem. Serve de CONTROLE POSITIVO: zero
/// indicador com lista de violacoes vazia e cegueira, nao conformidade.
int indicadoresNaArvore(WidgetTester tester) {
  var n = 0;
  for (final elemento in tester.allElements) {
    if (elemento.widget is ProgressIndicator) n++;
  }
  return n;
}

/// A razao medida de UM indicador. Usada pela isca, que precisa afirmar o
/// numero e nao so a reprovacao.
double razaoMedidaDoIndicador(WidgetTester tester) {
  for (final elemento in tester.allElements) {
    final w = elemento.widget;
    if (w is! ProgressIndicator) continue;
    final frente = w.color;
    final fundo = _fundoSolidoMaisProximo(elemento);
    if (frente == null || fundo == null) {
      throw StateError(
        'REPROVA: nao consegui medir o indicador '
        '(frente=$frente fundo=$fundo).',
      );
    }
    return razaoWcag(frente, fundo);
  }
  throw StateError('REPROVA: nao achei indicador nenhum na arvore.');
}

String? _isencaoDeGrafico(Element elemento) {
  String? deChave(Key? k) {
    if (k is ValueKey<String> && k.value.startsWith(prefixoIsencaoDeGrafico)) {
      return k.value.substring(prefixoIsencaoDeGrafico.length);
    }
    return null;
  }

  var achado = deChave(elemento.widget.key);
  if (achado != null) return achado;
  elemento.visitAncestorElements((a) {
    final m = deChave(a.widget.key);
    if (m != null) {
      achado = m;
      return false;
    }
    return true;
  });
  return achado;
}

/// Quantos paragrafos de texto NAO VAZIO a arvore tem.
///
/// Serve de CONTROLE POSITIVO para quem monta widget de verdade: a lista de
/// violacoes vazia tem dois significados indistinguiveis -- "esta tudo acima
/// do piso" e "nao havia texto nenhum para medir". Em replica escrita a mao a
/// segunda hipotese nao existe; num widget que depende de toque, de folha
/// inferior ou de estado, ela e o modo de falha mais provavel. Contar separa
/// as duas.
int paragrafosMedidos(WidgetTester tester) {
  final vistos = <RenderParagraph>{};
  var n = 0;
  for (final elemento in tester.allElements) {
    final ro = elemento.renderObject;
    if (ro is! RenderParagraph) continue;
    if (!vistos.add(ro)) continue;
    if (ro.text.toPlainText().trim().isEmpty) continue;
    n++;
  }
  return n;
}

/// Verdadeiro quando [elemento] esta dentro de um controle que a arvore declara
/// INATIVO.
///
/// Mede o estado, e nao a cor: `ButtonStyleButton.enabled` falso (que e
/// `onPressed == null` em `FilledButton`, `TextButton`, `OutlinedButton` e
/// `ElevatedButton`), `IconButton` sem `onPressed`, ou um `Semantics` que
/// anuncia `enabled: false`.
bool _dentroDeControleInativo(Element elemento) {
  bool inativo(Widget w) {
    if (w is ButtonStyleButton) return !w.enabled;
    if (w is IconButton) return w.onPressed == null;
    if (w is Semantics) return w.properties.enabled == false;
    return false;
  }

  if (inativo(elemento.widget)) return true;
  var achado = false;
  elemento.visitAncestorElements((a) {
    if (inativo(a.widget)) {
      achado = true;
      return false;
    }
    return true;
  });
  return achado;
}

/// O texto que [verificarContrasteDeTexto] dispensaria por estar em controle
/// inativo, para o resumo da execucao do job.
///
/// Isencao que ninguem ve vira isencao permanente -- vale para esta tanto
/// quanto para as declaradas por chave.
List<String> inativosIsentados(WidgetTester tester) {
  final vistos = <RenderParagraph>{};
  final saida = <String>{};
  for (final elemento in tester.allElements) {
    final ro = elemento.renderObject;
    if (ro is! RenderParagraph) continue;
    if (!vistos.add(ro)) continue;
    final texto = ro.text.toPlainText().trim();
    if (texto.isEmpty) continue;
    if (!_dentroDeControleInativo(elemento)) continue;
    saida.add(_resumo(texto));
  }
  final lista = saida.toList()..sort();
  return lista;
}

/// Os fundos solidos que o verificador DE FATO achou atras de texto, em hex.
///
/// POR QUE ISTO EXISTE, e e uma cegueira que eu tinha no proprio portao novo:
/// procurar o ROTULO de uma pastilha na arvore prova que ela esta la, e nao
/// prova em qual RAMO do ternario ela foi pintada -- o rotulo e o mesmo nos
/// dois. Se o `selecionado` do fixture deixasse de chegar, todas as pastilhas
/// cairiam no ramo nao-marcado, o par trocado sairia da medicao e o caso
/// continuaria verde com a mesma mensagem de sucesso. O que prova o ramo e o
/// FUNDO: `primary` so aparece atras de texto quando a pastilha esta marcada.
Set<String> fundosMedidosAtrasDeTexto(WidgetTester tester) {
  final vistos = <RenderParagraph>{};
  final fundos = <String>{};
  for (final elemento in tester.allElements) {
    final ro = elemento.renderObject;
    if (ro is! RenderParagraph) continue;
    if (!vistos.add(ro)) continue;
    if (ro.text.toPlainText().trim().isEmpty) continue;
    final fundo = _fundoSolidoMaisProximo(elemento);
    if (fundo != null) fundos.add(hexDaCor(fundo));
  }
  return fundos;
}

/// QUANTOS paragrafos cairam sobre o fundo [hex].
///
/// O conjunto de [fundosMedidosAtrasDeTexto] diz se um fundo apareceu; ele nao
/// diz quantas vezes, e a diferenca foi medida e nao suposta. O CONTROLE
/// NEGATIVO que forcou esta funcao: com a opcao de filtro DESMARCADA no
/// fixture, o conjunto continuava contendo `primary` e o caso continuava verde
/// -- porque a folha tem DOIS grupos de pastilha, e a de ORDENACAO nasce
/// marcada pela ordem efetiva. O "contains" estava provando o ramo de outro
/// grupo, e a prosa dizia que provava o do filtro. Contar separa os dois.
int paragrafosSobreFundo(WidgetTester tester, String hex) {
  final vistos = <RenderParagraph>{};
  var n = 0;
  for (final elemento in tester.allElements) {
    final ro = elemento.renderObject;
    if (ro is! RenderParagraph) continue;
    if (!vistos.add(ro)) continue;
    if (ro.text.toPlainText().trim().isEmpty) continue;
    final fundo = _fundoSolidoMaisProximo(elemento);
    if (fundo != null && hexDaCor(fundo) == hex) n++;
  }
  return n;
}
