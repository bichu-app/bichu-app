// O motor das duas travas do paragrafo 18.2 de docs/06-design-system.md.
//
// Ele NAO faz `expect`. Ele devolve a lista de violacoes, e quem decide o que
// fazer com ela sao os testes:
//
//   - contraste_texto_test.dart, alvo_de_toque_test.dart e
//     rotulo_acessivel_test.dart exigem lista VAZIA nas telas conformes;
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

enum TipoDeViolacao { contraste, alvoDeToque, rotuloAusente, indeterminado }

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
List<Violacao> verificarContrasteDeTexto(
  WidgetTester tester, {
  required String tela,
  required String tema,
  required double piso,
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

String _resumo(String t) => t.length <= 48 ? t : '${t.substring(0, 45)}...';

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
