// ISCA. Esta tela PRECISA reprovar no verificador de rotulo acessivel.
//
// Um `IconButton` sem `tooltip` e sem `semanticsLabel`: o leitor de tela
// anuncia "botao" e mais nada. O paragrafo 10.1 e explicito: icone que
// representa acao carrega sempre um rotulo textual visivel ou, quando isso nao
// for possivel, um `semanticsLabel`. Na tela do achador, icone sozinho nunca e
// a unica forma de identificar uma acao.
//
// A acao escolhida para a isca e "compartilhar", que e justamente uma das que
// aparecem so como icone quando ninguem presta atencao.
//
// NAO CORRIJA ESTA TELA.

library;

import 'package:flutter/material.dart';

import '../tokens.dart';

Widget iscaRotuloAusente(TokensBichu t, {required bool escuro}) {
  final tema = escuro ? 'escuro' : 'claro';
  return MaterialApp(
    debugShowCheckedModeBanner: false,
    home: Material(
      color: t.cor('cor.$tema.surface'),
      child: Center(
        child: IconButton(
          onPressed: () {},
          iconSize: t.dimensao('icon.size.default'),
          // Sem tooltip, sem semanticsLabel, sem rotulo visivel ao lado.
          icon: Icon(Icons.share, color: t.cor('cor.$tema.primary')),
        ),
      ),
    ),
  );
}

/// A mesma acao com nome acessivel.
///
/// O rotulo visivel esta contido no nome acessivel (SC 2.5.3), para que
/// "tocar em compartilhar este pet" funcione em comando de voz.
Widget rotuloConforme(TokensBichu t, {required bool escuro}) {
  final tema = escuro ? 'escuro' : 'claro';
  return MaterialApp(
    debugShowCheckedModeBanner: false,
    home: Material(
      color: t.cor('cor.$tema.surface'),
      child: Center(
        child: TextButton.icon(
          onPressed: () {},
          style: TextButton.styleFrom(
            minimumSize: Size(
              t.dimensao('target.min'),
              t.dimensao('target.min'),
            ),
            tapTargetSize: MaterialTapTargetSize.shrinkWrap,
          ),
          icon: Icon(
            Icons.share,
            size: t.dimensao('icon.size.default'),
            color: t.cor('cor.$tema.primary'),
          ),
          label: Text(
            'Compartilhar este pet',
            style: t.tipo('label', cor: t.cor('cor.$tema.primary')),
          ),
        ),
      ),
    ),
  );
}
