// As telas conformes que os testes montam nos dois temas.
//
// Sao as telas da lista critica reduzidas ao que o portao precisa ver: cada
// par de cor, cada tamanho de tipo e cada alvo de toque que o documento fixa,
// e nada de comportamento. Nao sao o app: o app ainda nao tem tema. Sao o
// caso POSITIVO do portao, e servem para uma coisa que a isca sozinha nao
// prova, que e que o verificador tambem sabe aprovar. Portao que reprova tudo
// e tao inutil quanto portao que aprova tudo, e some do CI do mesmo jeito.
//
// Todo valor vem de design/tokens.json. Se alguem escrever um hex aqui, o
// teste passa a testar a copia e nao o design system.

library;

import 'package:flutter/material.dart';

import 'tokens.dart';

/// Envolve a tela no minimo necessario para renderizar, sem trazer nada que
/// pinte por conta propria: o fundo tem que ser um token, nunca o padrao do
/// Material, senao o verificador mede uma cor que o design system nao escolheu.
Widget molduraDeTeste({required Color superficie, required Widget filho}) {
  return MaterialApp(
    debugShowCheckedModeBanner: false,
    home: Material(
      color: superficie,
      child: SafeArea(child: filho),
    ),
  );
}

/// F4.1 / F2.2, a tela do achador. Superficie critica: piso de 7:1 e alvo de
/// 64dp (paragrafo 6.5 e paragrafo 13).
///
/// Conteudo segundo o paragrafo 13.1 e a pesquisa de UX: foto, nome, uma linha
/// de sinais, a acao primaria, e nada mais competindo com ela.
Widget telaDoAchador(TokensBichu t, {required bool escuro}) {
  final tema = escuro ? 'escuro' : 'claro';
  final superficie = t.cor('cor.$tema.surface');
  final urgencia = t.cor('cor.$tema.urgency');
  final sobreUrgencia = t.cor('cor.$tema.on-urgency');
  final acao = t.cor('cor.$tema.action-fill');
  final sobreAcao = t.cor('cor.$tema.on-action-fill');
  final tinta = t.cor('cor.$tema.primary');
  final espaco = t.dimensao('space.4');
  final alvoCritico = t.dimensao('target.critico');

  return molduraDeTeste(
    superficie: superficie,
    filho: Padding(
      padding: EdgeInsets.all(espaco),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          // Banner PERDIDO: urgency so como preenchimento solido (paragrafo 6.4).
          ColoredBox(
            color: urgencia,
            child: Padding(
              padding: EdgeInsets.all(t.dimensao('space.3')),
              child: Text(
                'PERDIDO',
                style: t.tipo('overline', cor: sobreUrgencia),
              ),
            ),
          ),
          SizedBox(height: t.dimensao('space.6')),
          Text(
            'Nina',
            style: t.tipo('display-lg', cor: t.cor('cor.$tema.text-primary')),
          ),
          SizedBox(height: t.dimensao('space.2')),
          Text(
            'Vira-lata caramelo, coleira vermelha, assustada com barulho',
            style: t.tipo('body-lg', cor: t.cor('cor.$tema.text-secondary')),
          ),
          SizedBox(height: t.dimensao('space.8')),
          // Acao primaria: preenchida, largura total, 64dp. Contorno de 1px
          // desaparece sob sol, por isso ela nunca e de contorno (paragrafo 6.5).
          FilledButton(
            onPressed: () {},
            style: FilledButton.styleFrom(
              backgroundColor: acao,
              minimumSize: Size(double.infinity, alvoCritico),
              tapTargetSize: MaterialTapTargetSize.shrinkWrap,
              shape: RoundedRectangleBorder(
                borderRadius: BorderRadius.circular(t.dimensao('radius.md')),
              ),
            ),
            child: Text(
              'Avisar o tutor',
              style: t.tipo('label-lg', cor: sobreAcao),
            ),
          ),
          SizedBox(height: t.dimensao('space.4')),
          // Secundaria: contorno de 2px na tinta, nunca no ambar (paragrafo 15.6).
          OutlinedButton(
            onPressed: () {},
            style: OutlinedButton.styleFrom(
              minimumSize: Size(double.infinity, alvoCritico),
              tapTargetSize: MaterialTapTargetSize.shrinkWrap,
              side: BorderSide(
                color: tinta,
                width: t.dimensao('border.medium'),
              ),
            ),
            child: Text(
              'Ver como ajudar',
              style: t.tipo('label-lg', cor: tinta),
            ),
          ),
        ],
      ),
    ),
  );
}

/// Uma tela comum do app: piso de 4.5:1 e alvo de 48dp.
///
/// Ela existe para cobrir o que a tela critica nao cobre: o texto apagado, que
/// e legal aqui e proibido la, e o rotulo desabilitado, que e a unica isencao
/// de contraste prevista no sistema (SC 1.4.3).
Widget telaComumDoApp(TokensBichu t, {required bool escuro}) {
  final tema = escuro ? 'escuro' : 'claro';
  final superficie = t.cor('cor.$tema.surface');
  final espaco = t.dimensao('space.4');
  final alvo = t.dimensao('target.min');

  return molduraDeTeste(
    superficie: superficie,
    filho: Padding(
      padding: EdgeInsets.all(espaco),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          Text(
            'Meus pets',
            style: t.tipo('headline', cor: t.cor('cor.$tema.text-primary')),
          ),
          SizedBox(height: espaco),
          Text(
            'Atualizado ha 3 minutos',
            style: t.tipo('caption', cor: t.cor('cor.$tema.text-muted')),
          ),
          SizedBox(height: espaco),
          // Cartao em superficie afundada, com borda de controle: no escuro a
          // diferenca entre surface e surface-alt e de 1.14:1 e nao delimita
          // nada; a borda delimita (paragrafo 6.6).
          Container(
            decoration: BoxDecoration(
              color: t.cor('cor.$tema.surface-sunken'),
              borderRadius: BorderRadius.circular(t.dimensao('radius.lg')),
              border: Border.all(
                color: t.cor('cor.$tema.outline-control'),
                width: t.dimensao('border.hairline'),
              ),
            ),
            padding: EdgeInsets.all(espaco),
            child: Text(
              'Thor, 4 anos, tag ativa',
              style: t.tipo('body', cor: t.cor('cor.$tema.text-primary')),
            ),
          ),
          SizedBox(height: espaco),
          TextButton(
            onPressed: () {},
            style: TextButton.styleFrom(
              minimumSize: Size(double.infinity, alvo),
              tapTargetSize: MaterialTapTargetSize.shrinkWrap,
            ),
            child: Text(
              'Adicionar um pet',
              style: t.tipo('label', cor: t.cor('cor.$tema.primary')),
            ),
          ),
          SizedBox(height: espaco),
          // Desabilitado: 3.27:1 no claro e 3.82:1 no escuro, abaixo de 4.5 e
          // isento pelo SC 1.4.3. A isencao e declarada na chave, nunca
          // presumida pelo verificador.
          ColoredBox(
            key: const ValueKey<String>(
              'a11y-exempt:componente desabilitado, SC 1.4.3',
            ),
            color: t.cor('cor.$tema.disabled-surface'),
            child: Padding(
              padding: EdgeInsets.all(espaco),
              child: Text(
                'Transferir pet (indisponivel)',
                style: t.tipo('label', cor: t.cor('cor.$tema.on-disabled')),
              ),
            ),
          ),
        ],
      ),
    ),
  );
}
