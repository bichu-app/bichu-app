// ISCA. Esta tela PRECISA reprovar no verificador de contraste.
//
// Paragrafo 18.2.1 de docs/06-design-system.md: "arquivo-isca, obrigatorio".
// Uma tela com `Text` pintado em `actionFillRawDoNotUseAsText` sobre `surface`.
// isca_test.dart monta esta tela e exige a reprovacao, com a razao medida em
// 1.76:1 mais ou menos 0.02. Se ela passar, o job cai com "o verificador de
// contraste parou de verificar".
//
// A razao ja mudou duas vezes, e o historico esta no comentario de
// isca_test.dart: 1.57 (ambar sobre areia), 1.73 (Manteiga sobre Marfim) e
// 1.76 (Manteiga sobre o neutro #FAFAF8, que e o fundo do app desde
// 17/09/2026). O nome do arquivo ficou como estava para nao espalhar
// renomeacao por imports; a cor de dentro dele e a Manteiga.
//
// NAO CORRIJA ESTA TELA. Ela esta errada de proposito. Se o lint ou uma
// revisao apontarem o contraste aqui, a resposta certa e "sim, e esse o
// ponto", nao trocar a cor. Quem quiser ver o certo, olhe `textoAmbarConforme`
// no fim do arquivo.

library;

import 'package:flutter/material.dart';

import '../tokens.dart';

/// O conteudo do texto errado, para o teste achar o paragrafo na arvore.
const String conteudoDaIsca = 'Avisar o tutor';

/// O nome feio do paragrafo 18.2.1, repetido aqui de proposito.
///
/// No app, este e um dos QUATRO campos da `ThemeExtension` que entregam
/// preenchimento de marca cru: action-fill, action-fill-pressed,
/// community-fill e accent-fill. O nome feio existe para que um
/// `grep -r RawDoNotUseAsText app/lib` liste todos os lugares onde alguem pegou
/// o valor bruto. Se esta fixture deixar de ser a unica ocorrencia fora do
/// tema, ha preenchimento de marca virando texto no produto.
///
/// Os nomes dos quatro estao declarados em $extensions.bichu.nunca-texto de
/// design/tokens.json, e e essa declaracao que contraste_tokens_test.dart le.
Color actionFillRawDoNotUseAsText(TokensBichu t, String tema) =>
    t.cor('cor.$tema.action-fill');

/// A isca: a marca virou texto. 1.76:1 no tema claro.
Widget iscaTextoAmbar(TokensBichu t, {required bool escuro}) {
  final tema = escuro ? 'escuro' : 'claro';
  return MaterialApp(
    debugShowCheckedModeBanner: false,
    home: Material(
      color: t.cor('cor.$tema.surface'),
      child: Center(
        child: Text(
          conteudoDaIsca,
          style: t.tipo(
            'label-lg',
            // O erro. E exatamente este que o portao existe para pegar.
            cor: actionFillRawDoNotUseAsText(t, tema),
          ),
        ),
      ),
    ),
  );
}

/// O mesmo rotulo feito certo: a Manteiga preenche, a tinta escreve. 9.35:1.
///
/// Serve de contraprova. Um portao que reprova a isca mas tambem reprovaria a
/// versao correta nao esta medindo contraste, esta reprovando por reprovar.
Widget textoAmbarConforme(TokensBichu t, {required bool escuro}) {
  final tema = escuro ? 'escuro' : 'claro';
  return MaterialApp(
    debugShowCheckedModeBanner: false,
    home: Material(
      color: t.cor('cor.$tema.surface'),
      child: Center(
        child: ColoredBox(
          color: t.cor('cor.$tema.action-fill'),
          child: Padding(
            padding: EdgeInsets.all(t.dimensao('space.4')),
            child: Text(
              conteudoDaIsca,
              style: t.tipo('label-lg', cor: t.cor('cor.$tema.on-action-fill')),
            ),
          ),
        ),
      ),
    ),
  );
}
