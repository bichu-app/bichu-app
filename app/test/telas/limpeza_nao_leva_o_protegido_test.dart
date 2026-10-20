// ISCA DE DESLIGAMENTO da limpeza de textos de apoio (18/10/2026).
//
// O pedido do cliente foi literal: *"remova todos esses textos descritivos das
// paginas, textos de apoio, explicacao, isso esta deixando o app poluido"*. A
// limpeza e grande e o padrao dele e remover -- e e exatamente por isso que
// este arquivo existe.
//
// **Ele NAO prova que a tela esta limpa.** Ele prova o contrario: que a
// limpeza (esta ou a proxima) nao levou junto as seis classes de frase que
// NAO sao decoracao. Cada caso abaixo FALHA se alguem apagar:
//
//   1. mensagem de erro ou de validacao que diz o que FAZER;
//   2. rotulo acessivel (`Semantics`, nome acessivel da barra, hint);
//   3. a orientacao de tamanho de imagem (5 MB), que o cliente pediu com
//      estas palavras: *"devemos sempre trazer essa informacao para o usuario
//      na pagina como orientacao"*;
//   4. aviso de seguranca e de privacidade na tela (o endereco e o telefone
//      que nao aparecem para ninguem);
//   5. recusa explicada -- e-mail nao confirmado, limite atingido, caso ja
//      aberto, pedido ainda nao aprovado;
//   6. estado vazio em BRANCO: encurtar e o pedido, apagar a ultima palavra
//      nao e.
//
// A isca e por CONSTANTE e por PALAVRA, e as duas metades sao de proposito.
// Apagar a constante quebra a compilacao deste arquivo -- que e o sinal mais
// barato que existe. Trocar o conteudo dela por `''`, ou tirar a palavra que
// carrega a promessa (`endereço`, `5 MB`), passa pela compilacao e cai aqui.
//
// **CUIDADO COM A ISCA TAUTOLOGICA.** Nenhum caso abaixo compara a constante
// com ela mesma: cada um afirma uma propriedade escrita a mao -- que a frase
// existe, que ela nao e so "inválido", que ela nomeia o dado que promete
// proteger. E por isso que as palavras aparecem literais aqui, e nao por
// referencia.

import 'package:bichu/dispositivo/camera_e_galeria.dart';
import 'package:bichu/telas/avisos/antessala_de_aviso.dart';
import 'package:bichu/telas/casca_com_abas.dart';
import 'package:bichu/telas/localizacao/textos_da_localizacao.dart';
import 'package:bichu/telas/perdido/tela_onde_e_quando.dart';
import 'package:bichu/telas/perfil/meus_pets.dart';
import 'package:bichu/telas/pet/textos_do_cadastro.dart';
import 'package:bichu/telas/pet/textos_do_detalhe.dart';
import 'package:bichu/telas/rede/agenda_da_rede.dart';
import 'package:bichu/telas/rede/criar_encontro.dart';
import 'package:flutter_test/flutter_test.dart';

/// O que uma mensagem de erro **nao** pode ser: um adjetivo sozinho.
///
/// A regra e do UX secao 13 e o cliente a repetiu de outro jeito ("remova a
/// descricao", mas nunca "remova o erro"): erro e instrucao, e instrucao sem
/// verbo nao instrui ninguem. `inválido` e `erro` sozinhos reprovam.
void dizOQueFazer(String frase, String nomeDaConstante) {
  expect(
    frase.trim(),
    isNotEmpty,
    reason: 'REPROVA: $nomeDaConstante ficou vazia. Mensagem de erro nao e '
        'texto de apoio -- a limpeza de 18/10 nao alcanca esta frase.',
  );
  final seca = frase.toLowerCase().trim().replaceAll('.', '');
  expect(
    seca,
    isNot(anyOf('inválido', 'invalido', 'erro', 'falha')),
    reason: 'REPROVA: $nomeDaConstante virou um adjetivo sozinho. "Invalido" '
        'nao serve: a frase tem de dizer o que fazer.',
  );
  expect(
    frase.trim().split(RegExp(r'\s+')).length,
    greaterThanOrEqualTo(3),
    reason: 'REPROVA: $nomeDaConstante encurtou ate deixar de instruir '
        '($frase). Encurtar texto de apoio e o pedido; encurtar erro nao e.',
  );
}

void main() {
  group('1. erro e validacao continuam dizendo o que fazer', () {
    test('o cadastro de pet mantem as mensagens dos campos', () {
      dizOQueFazer(TextosDoCadastro.digiteONome, 'digiteONome');
      dizOQueFazer(TextosDoCadastro.escolhaAEspecie, 'escolhaAEspecie');
      dizOQueFazer(TextosDoCadastro.escolhaOPorte, 'escolhaOPorte');
      dizOQueFazer(TextosDoCadastro.racaLivreLonga, 'racaLivreLonga');
      dizOQueFazer(
        TextosDoCadastro.racaLivreComRacaDaLista('Beagle'),
        'racaLivreComRacaDaLista',
      );
      dizOQueFazer(
        TextosDoCadastro.listaDeRacasNaoCarregou('Nina'),
        'listaDeRacasNaoCarregou',
      );
    });

    test('a mensagem da raca duplicada nomeia a saida, e nao so o problema',
        () {
      // O que faz esta frase funcionar e a INSTRUCAO no fim dela. Uma limpeza
      // que corte a segunda metade ("troque a lista para Outra") deixa a
      // pessoa sabendo que errou e sem saber onde consertar.
      final frase = TextosDoCadastro.racaLivreComRacaDaLista('Beagle');
      expect(frase, contains('Beagle'));
      expect(
        frase.toLowerCase(),
        contains('outra'),
        reason: 'REPROVA: a mensagem parou de dizer PARA ONDE ir. Ela nomeia '
            'a opcao `Outra` da lista, e sem ela e so uma recusa.',
      );
    });

    test('o detalhe do pet mantem as recusas de salvar e de remover foto', () {
      dizOQueFazer(
        TextosDoDetalhe.naoConseguimosSalvar,
        'naoConseguimosSalvar',
      );
      dizOQueFazer(TextosDoDetalhe.fotoRecusada, 'fotoRecusada');
    });
  });

  group('2. rotulo acessivel: invisivel na tela, e o que faz o app usavel '
      'sem ver', () {
    test('cada secao da barra tem reforco acessivel, e ele nao e o rotulo',
        () {
      for (final destino in CascaComAbas.destinos) {
        expect(
          destino.reforcoAcessivel.trim(),
          isNotEmpty,
          reason: 'REPROVA: "${destino.rotulo}" perdeu o reforco ACESSIVEL. '
              'Ele nao e pintado em tela nenhuma -- a limpeza de texto visivel '
              'nao tem o que remover aqui. Sem ele, quem usa leitor de tela '
              'recebe quatro letras onde quem enxerga recebe icone, rotulo e '
              'linha de pagina.',
        );
        expect(
          destino.semanticsLabel,
          contains(destino.rotulo),
          reason: 'REPROVA: o nome acessivel de "${destino.rotulo}" nao contem '
              'mais o rotulo visivel (SC 2.5.3): "tocar em ${destino.rotulo}" '
              'para de casar no comando de voz.',
        );
        expect(
          destino.semanticsLabel.length,
          greaterThan(destino.rotulo.length),
          reason: 'REPROVA: o nome acessivel de "${destino.rotulo}" encolheu '
              'ate virar o proprio rotulo.',
        );
      }
    });

    test('o interruptor da lista publica anuncia rotulo E consequencia', () {
      // O `Semantics.label` de `_ListaPublica` e a concatenacao dos dois. Se a
      // limpeza levar a explicacao, quem usa leitor de tela liga um
      // interruptor sem saber o que ele publica.
      expect(TelaOndeEQuando.rotuloDaListaPublica.trim(), isNotEmpty);
      expect(
        TelaOndeEQuando.explicacaoDaListaPublica.trim(),
        isNotEmpty,
        reason: 'REPROVA: a explicacao da lista publica saiu. Ela entra no '
            'nome acessivel do interruptor E diz o que nao e publicado.',
      );
    });

    test('a previa da foto do pet continua com rotulo para o leitor de tela',
        () {
      expect(TextosDoCadastro.fotoEscolhidaDoPet.trim(), isNotEmpty);
    });
  });

  group('3. a orientacao de 5 MB fica (pedido literal do cliente)', () {
    test('a frase existe e traz o numero', () {
      expect(
        orientacaoDeTamanhoDaImagem,
        contains('5 MB'),
        reason: 'REPROVA: a orientacao de tamanho perdeu o numero. O cliente '
            'pediu com estas palavras: "devemos sempre trazer essa informacao '
            'para o usuario na pagina como orientacao". Encurtar e permitido; '
            'apagar o teto nao e.',
      );
    });

    test('o cadastro de pet continua apontando para ela, e nao para uma copia',
        () {
      expect(
        TextosDoCadastro.orientacaoDaFoto,
        same(orientacaoDeTamanhoDaImagem),
        reason: 'REPROVA: a tela passou a escrever o proprio teto. Duas '
            'redacoes do mesmo numero divergem na primeira correcao.',
      );
    });
  });

  group('4. aviso de privacidade na tela: nomeia o dado que promete '
      'proteger', () {
    test('a tela do pet cadastrado diz que o endereco nao aparece', () {
      final frase = TextosDoCadastro.corpoPetCadastrado;
      expect(frase.toLowerCase(), contains('endereço'));
      expect(
        frase.toLowerCase(),
        contains('não aparecem'),
        reason: 'REPROVA: a promessa de privacidade de F1.6 saiu junto com a '
            'limpeza. Ela diz o que NAO e exposto a quem escaneia a tag.',
      );
    });

    test('o bloco de cuidados continua dizendo que o telefone nao e preciso',
        () {
      final frase = TextosDoCadastro.cuidadosSemTelefone('Nina');
      expect(frase.toLowerCase(), contains('telefone'));
      expect(
        frase.toLowerCase(),
        contains('sem mostrar seus dados'),
        reason: 'REPROVA: a prevencao de exposicao de dado pessoal saiu. Ela '
            'e o que impede a pessoa de digitar o proprio telefone num campo '
            'PUBLICO.',
      );
    });

    test('o texto de cuidados continua avisando que ele e publico', () {
      expect(
        TextosDoCadastro.cuidadosSaoPublicos('Nina').toLowerCase(),
        contains('aparece para quem encontrar'),
        reason: 'REPROVA: o campo de cuidados deixou de avisar que o que for '
            'escrito ali e publico. Sem o aviso, o consentimento desaparece.',
      );
    });

    test('a lista publica de perdidos continua dizendo o que ela NAO mostra',
        () {
      final frase = TelaOndeEQuando.explicacaoDaListaPublica.toLowerCase();
      expect(frase, contains('nunca'));
      expect(frase, contains('endereço'));
      expect(frase, contains('telefone'));
    });

    test('a localizacao continua dizendo que o ponto nao e mostrado', () {
      expect(
        TextosDaLocalizacao.corpoPerdido.toLowerCase(),
        contains('endereço não aparece'),
        reason: 'REPROVA: a antessala de localizacao parou de dizer para que '
            'serve o ponto e quem o ve. Isso e base de consentimento, nao '
            'texto de apoio.',
      );
      expect(
        TextosDaLocalizacao.pontoSemPrecisao.toLowerCase(),
        contains('ninguém vê'),
      );
    });

    // **O caso do pedido para participar SAIU** (19/10/2026). Ele cobrava
    // `TelaDoEncontro.avisoDeTransparencia`, e a tela de detalhe do evento
    // saiu do app por decisao do cliente: nao ha mais pedido de participacao,
    // nao ha mais aviso de transparencia e nao ha mais o que o caso proteja.
    // **Nao foi enfraquecido: foi removido junto com o que ele media.** Caso
    // sobre constante que nao existe nao compila; caso sobre constante
    // orfa passaria verde para sempre, medindo uma string que ninguem desenha.
  });

  group('5. recusa explicada: por que a acao nao vai, e o que fazer', () {
    test('marcar evento sem e-mail confirmado explica o porque', () {
      dizOQueFazer(
        TelaCriarEncontro.semEmailConfirmado,
        'semEmailConfirmado',
      );
      expect(
        TelaCriarEncontro.semEmailConfirmado.toLowerCase(),
        contains('confirme seu e-mail'),
      );
      dizOQueFazer(TelaCriarEncontro.entreParaMarcar, 'entreParaMarcar');
    });

    // **DOIS casos sairam daqui em 19/10/2026**, pela mesma razao do grupo
    // acima: eles cobravam `TelaDoEncontro.textoDoPrivado` (por que o local
    // do privado nao esta na tela) e `TelaDoEncontro.avisoDeCancelado` (o
    // evento nao vai acontecer). A tela que dizia as duas frases saiu, e com
    // ela as frases. O cartao da agenda nao tem onde diz-las: ele mostra a
    // foto e o titulo.

    test('quem negou o aviso continua sabendo o que perdeu e o que cobre', () {
      dizOQueFazer(TextosDaAntessala.semAvisoPorPerto, 'semAvisoPorPerto');
      expect(
        TextosDaAntessala.oEmailCobreOCasoProprio.toLowerCase(),
        contains('e-mail'),
        reason: 'REPROVA: a rede de seguranca saiu. Sem ela, a linha de cima '
            'soa como se negar a permissao tivesse desligado o produto.',
      );
    });

    test('o caso ja aberto continua explicando que ele continua valendo', () {
      dizOQueFazer(TextosDoCadastro.tagNaoSaiu('Nina'), 'tagNaoSaiu');
      dizOQueFazer(
        TextosDoCadastro.salvoNesteCelular('Nina'),
        'salvoNesteCelular',
      );
    });

    test('a camera negada e a camera ausente continuam com saida', () {
      dizOQueFazer(TextosDoCadastro.cameraNegada, 'cameraNegada');
      dizOQueFazer(
        TextosDoCadastro.cameraNaoEmbarcada,
        'cameraNaoEmbarcada',
      );
    });
  });

  group('6. estado vazio encurtado, nunca em branco', () {
    test('cada estado vazio ainda tem uma linha', () {
      final vazios = <String, String>{
        'MeusPets.explicacaoDoVazio': MeusPets.explicacaoDoVazio,
        'AgendaDaRede.explicacaoDoVazio': AgendaDaRede.explicacaoDoVazio,
        'AgendaDaRede.explicacaoDoVazioDePedidos':
            AgendaDaRede.explicacaoDoVazioDePedidos,
        'AgendaDaRede.explicacaoDoVazioDeEncerrados':
            AgendaDaRede.explicacaoDoVazioDeEncerrados,
        'AgendaDaRede.explicacaoDoVazioFiltrado':
            AgendaDaRede.explicacaoDoVazioFiltrado,
        'TextosDoDetalhe.semSinais': TextosDoDetalhe.semSinais,
        'TextosDoDetalhe.semFotoAinda': TextosDoDetalhe.semFotoAinda,
      };
      vazios.forEach((nome, frase) {
        expect(
          frase.trim(),
          isNotEmpty,
          reason: 'REPROVA: $nome ficou em branco. O pedido do cliente foi '
              'ENCURTAR o texto de apoio; vazio sem palavra nenhuma e pior '
              'que vazio explicado -- a pessoa nao sabe se a lista esta vazia '
              'ou se a tela quebrou.',
        );
      });
    });

    test('o vazio filtrado continua oferecendo o caminho de volta', () {
      expect(
        AgendaDaRede.explicacaoDoVazioFiltrado.toLowerCase(),
        contains('filtro'),
        reason: 'REPROVA: o vazio COM recorte parou de dizer que o recorte e '
            'a causa. Ele e a unica saida de quem filtrou demais.',
      );
    });
  });
}
