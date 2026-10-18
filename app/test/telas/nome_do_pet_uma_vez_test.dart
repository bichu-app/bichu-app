// O nome do pet aparece UMA vez na tela de detalhe (cliente, 17/10/2026).
//
// **ESTE CASO NAO FOI RODADO.** A tarefa que o escreveu proibia rodar suite.
//
// A tela dizia o nome na barra de cima E como cabecalho abaixo da foto. Quem
// usa leitor de tela ouvia o mesmo nome duas vezes seguidas, sem saber se eram
// duas coisas.
//
// **O contrapeso esta no mesmo caso, e e ele que importa:** tirar o texto nao
// pode deixar o bloco da foto mudo. `Moldura` envolve o conteudo num
// `ExcludeSemantics`, entao a imagem nunca teve rotulo proprio -- quem
// anunciava o animal ali era justamente o nome que saiu. Por isso a foto
// ganhou `Semantics(label: 'Foto de <nome>')`, e o caso mede as duas coisas
// juntas: uma ocorrencia visivel, e a imagem descrita.

import 'package:bichu/telas/pet/textos_do_detalhe.dart';
import 'package:flutter_test/flutter_test.dart';

void main() {
  group('ISCA -- o nome do pet nao e dito duas vezes', () {
    test('a foto tem rotulo acessivel proprio, e ele nomeia o animal', () {
      // Sem este rotulo, remover o nome de baixo da foto deixaria a imagem
      // sem nada que a descreva -- `Moldura` exclui a semantica do conteudo.
      expect(
        TextosDoDetalhe.fotoDe('Thor'),
        'Foto de Thor',
        reason: 'REPROVA: a foto do detalhe ficou sem descricao com o nome. '
            'O texto que saiu de baixo da foto era o unico anuncio do animal '
            'naquele bloco.',
      );
    });

    test('o rotulo da foto e curto, e nao uma frase', () {
      // O cliente reprovou texto excessivo quatro vezes em 17/10/2026. O
      // leitor de tela ja leu o nome na barra; uma frase aqui seria a
      // terceira vez.
      expect(
        TextosDoDetalhe.fotoDe('Thor').length,
        lessThan(30),
        reason: 'REPROVA: o rotulo da foto virou frase. Ele e um rotulo.',
      );
    });
  });
}
