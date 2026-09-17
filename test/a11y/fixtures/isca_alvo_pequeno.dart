// ISCA. Esta tela PRECISA reprovar no verificador de alvo de toque.
//
// "Avisar o tutor" e a acao mais critica do produto e exige 64dp de altura e
// largura total (paragrafo 6.5 do design system e secao 15.1 da pesquisa de
// UX). Aqui ela esta com 40dp de altura, que e o tamanho `sm` do botao, aquele
// que o paragrafo 11.1 proibe expressamente em tela critica.
//
// A isca e de 40dp e nao de 47dp de proposito: 40 tambem reprova no piso
// generico de 48dp do M3 e nos 44 CSS px do WCAG 2.5.5, entao ela acusa
// mesmo que alguem afrouxe o piso critico por engano.
//
// NAO CORRIJA ESTA TELA.

library;

import 'package:flutter/material.dart';

import '../tokens.dart';

const String rotuloDaIsca = 'Avisar o tutor';

/// Altura errada de proposito. Nao sai de tokens.json porque nao e um token:
/// nenhum token do sistema vale 40 para alvo de toque, e inventar um so para a
/// isca seria criar no design system exatamente o valor que ele proibe.
const double alturaErrada = 40;

Widget iscaAlvoPequeno(TokensBichu t, {required bool escuro}) {
  final tema = escuro ? 'escuro' : 'claro';
  return MaterialApp(
    debugShowCheckedModeBanner: false,
    home: Material(
      color: t.cor('cor.$tema.surface'),
      child: Center(
        child: SizedBox(
          width: alturaErrada,
          height: alturaErrada,
          child: FilledButton(
            onPressed: () {},
            style: FilledButton.styleFrom(
              backgroundColor: t.cor('cor.$tema.action-fill'),
              padding: EdgeInsets.zero,
              minimumSize: const Size(alturaErrada, alturaErrada),
              tapTargetSize: MaterialTapTargetSize.shrinkWrap,
            ),
            child: Text(
              rotuloDaIsca,
              style: t.tipo('label', cor: t.cor('cor.$tema.on-action-fill')),
            ),
          ),
        ),
      ),
    ),
  );
}

/// A mesma acao no tamanho que o documento manda: 64dp, largura total.
Widget alvoConforme(TokensBichu t, {required bool escuro}) {
  final tema = escuro ? 'escuro' : 'claro';
  return MaterialApp(
    debugShowCheckedModeBanner: false,
    home: Material(
      color: t.cor('cor.$tema.surface'),
      child: Padding(
        padding: EdgeInsets.all(t.dimensao('space.4')),
        child: FilledButton(
          onPressed: () {},
          style: FilledButton.styleFrom(
            backgroundColor: t.cor('cor.$tema.action-fill'),
            minimumSize: Size(double.infinity, t.dimensao('target.critico')),
            tapTargetSize: MaterialTapTargetSize.shrinkWrap,
          ),
          child: Text(
            rotuloDaIsca,
            style: t.tipo('label-lg', cor: t.cor('cor.$tema.on-action-fill')),
          ),
        ),
      ),
    ),
  );
}
