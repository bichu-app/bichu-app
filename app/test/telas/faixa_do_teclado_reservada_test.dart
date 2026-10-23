// PORTAO DA CLASSE — toda tela com campo de texto corrido RESERVA a faixa do
// teclado, ou esta na lista declarada aqui, com o motivo medido de cada uma.
//
// ===========================================================================
// A CLASSE DE DEFEITO QUE ESTE ARQUIVO FECHA
// ===========================================================================
// `BichuField` com `linhas` maior que 1 vira `TextInputType.multiline`, e num
// campo de texto corrido NAO HA tecla que feche o teclado. Por isso
// `bichu_field.dart` anexa `BarraDoTeclado` -- uma faixa de 48 dp encostada no
// topo do teclado, desenhada num `Overlay`, ou seja **POR CIMA do
// `Scaffold`**.
//
// Quem desenha acao no fim do corpo e nao reserva esses 48 dp recebe a faixa
// em cima da acao. O cabecalho de `barra_do_teclado.dart` previu isto com
// estas palavras: *"consertar o teclado cobrindo o `Salvar` produziria a faixa
// cobrindo o `Salvar`, que e o mesmo defeito com outro nome"*.
//
// **E aconteceu.** Medido em 22/10/2026 em `publicar_no_mural.dart`, no
// gabarito de 320 x 568 com teclado de 270: `Publicar` ocupava y 234..282 e a
// faixa 250..298 -- 32 dos 48 dp do botao, **incluindo o centro**, sob a
// faixa. Um toque no centro atingia o `Concluir` da faixa e a publicacao nao
// saia. Silencioso.
//
// ===========================================================================
// O QUE ESTE PORTAO MEDE, E O QUE ELE NAO CONSEGUE MEDIR
// ===========================================================================
// Ele mede a FONTE: tela com campo de texto corrido que nao menciona nem
// `BarraDeAcaoFixa` (a unica peca que le `BarraDoTeclado.alturaEmUso`) nem o
// proprio `alturaEmUso`.
//
// **Ele NAO mede a geometria.** Ele nao sabe se a tela de fato poe acao nos
// ultimos 48 dp da janela -- para isso e preciso montar a tela, e cada tela
// tem dependencias proprias. Entao ele tem um falso positivo possivel: uma
// tela com campo de texto corrido e NENHUMA acao embaixo seria cobrada de uma
// reserva que nao lhe faz diferenca. A saida nesse caso e declarar o arquivo
// abaixo com o motivo MEDIDO, e nao afrouxar o padrao de busca.
//
// A medicao de geometria de cada tela vive nas iscas das telas, e a de
// `publicar_no_mural.dart` esta em `test/mural/publicar_no_mural_test.dart`.
//
// DESLIGAMENTO: tire `BarraDeAcaoFixa` de qualquer tela da lista limpa, ou
// acrescente uma tela nova com `linhas: 3` e acao no fim. Este caso reprova
// NOMEANDO o arquivo.
import 'dart:io';

import 'package:flutter_test/flutter_test.dart';

/// As telas que tem campo de texto corrido e **nao** reservam a faixa, com o
/// motivo medido de cada uma.
///
/// **Cada linha carrega o estado MEDIDO, e nao um perdao.** Sao tres estados
/// possiveis, e a prosa de cada uma diz qual: `DEFEITO MEDIDO` (a geometria
/// reprova e o conserto pede decisao de desenho), `MEDIDO LIMPO` (a geometria
/// aprova, e esta aqui so porque este portao le a fonte) e `NAO MEDIDO` (a
/// sonda nao conseguiu colher numero valido -- e a linha diz isso em vez de
/// supor). Uma linha sem um desses tres e uma decisao que ninguem pode
/// revisar.
const Map<String, String> semReservaDeclarada = <String, String>{
  // ---------------------------------------------------------------------
  // DEFEITO MEDIDO, conserto pendente de decisao de desenho
  // ---------------------------------------------------------------------
  'lib/telas/mural/comentarios_da_publicacao.dart':
      'DEFEITO MEDIDO em 22/10/2026 (320 x 568, teclado 270, faixa na tela '
      'confirmada): `Comentar` em y 234..282 com a faixa em 250..298 -- 32 '
      'dos 48 dp cobertos, CENTRO incluido. Os MESMOS numeros de '
      '`publicar_no_mural.dart`. O conserto NAO e o mesmo: aqui o campo e o '
      'botao vivem num rodape FIXO dentro do CORPO, e dentro do corpo '
      '`MediaQuery.viewInsets` e ZERO -- o `Scaffold` o zera para o `body` '
      '(`removeBottomInset`). A condicao de dois lados que `BarraDeAcaoFixa` '
      'usa (`teclado > 0 ? faixa : 0`) nao existe ali, e a saida limpa e '
      'levar o rodape INTEIRO -- campo, contador e botao -- para o slot '
      '`bottomNavigationBar`, o que muda ONDE a pessoa digita. Decisao de '
      'desenho, e nao conserto de uma linha.',

  // ---------------------------------------------------------------------
  // MEDIDO LIMPO: tem campo de texto corrido e nao precisa de reserva
  // ---------------------------------------------------------------------
  'lib/telas/escanear/tela_do_pet_da_tag.dart':
      'MEDIDO LIMPO em 22/10/2026, e nao por sorte. Em 320 x 568 com teclado '
      'de 270 e a rolagem no FIM, `Enviar mensagem ao tutor` ficou em y '
      '26..74, com a faixa em 250..298: zero dp cobertos. Em 360 x 640, '
      'botao em 146..194 com a faixa em 322..370. A razao esta no proprio '
      'arquivo: a acao foi posta ACIMA de `_CartaoDeSinais` e '
      '`_CartaoDeManejo` (*"Antes, o botao era o ULTIMO elemento da rolagem '
      'nas duas formas do achador"*), entao ha conteudo ABAIXO dela e a '
      'rolagem nunca a deixa no chao da janela. Este portao le a FONTE e nao '
      'a geometria, e por isso cobra a reserva aqui: a linha existe para '
      'dizer que a geometria foi medida.',

  // ---------------------------------------------------------------------
  // NAO E TELA: componente de campos, sem `Scaffold` e sem acao
  // ---------------------------------------------------------------------
  'lib/telas/pet/campos_do_pet.dart':
      'NAO E TELA, e por isso nao tem o que reservar: e o componente dos '
      'campos partilhado por `tela_cadastrar_identificacao.dart`, '
      '`tela_editar_pet.dart` e `tela_cadastrar_sinais.dart`. O proprio '
      'cabecalho dele delimita: *"Quem hospeda continua dono do `Scaffold`, '
      'da `BarraDeConta`, do `IndicadorDePasso`, da `BarraDeAcaoFixa`, do '
      'botao e da navegacao [...] So os campos moram aqui."* Nao ha acao '
      'nenhuma neste arquivo para a faixa cobrir, e os TRES hospedeiros '
      'constroem `BarraDeAcaoFixa(` em codigo -- conferido em 22/10/2026, '
      'com os comentarios retirados.\n'
      'Esta linha e a prova de que o ponto cego deste portao e real: ele le '
      'a FONTE, nao a geometria, e cobra reserva de quem nao tem acao. Foi '
      'ele que achou este arquivo, que a varredura a mao tinha deixado '
      'passar -- `grep` contava a mencao em PROSA como se fosse reserva.',

  // ---------------------------------------------------------------------
  // NAO MEDIDO -- e a linha diz isso, em vez de supor
  // ---------------------------------------------------------------------
  'lib/telas/perto/pagina_do_local.dart':
      'NAO MEDIDO em 22/10/2026, e esta linha nao afirma que esta limpo. A '
      'sonda montou a pagina pelo app inteiro, mas o CONTROLE POSITIVO '
      'falhou -- a faixa do teclado nao apareceu na tela --, entao o '
      'retangulo colhido nao mede o estado de teclado aberto e foi '
      'descartado. Sao DOIS campos de texto corrido aqui: o `Seu comentario` '
      'do formulario de avaliacao (`linhas: 5`), que tem o bloco das outras '
      'avaliacoes ABAIXO dele, como em `tela_do_pet_da_tag.dart`; e o `Quer '
      'contar mais?` da folha de denuncia (`linhas: 3`), que e uma '
      '`showModalBottomSheet` e ja recua `viewInsets.bottom` A MAO, sem '
      'somar a faixa -- exatamente a forma que `barra_do_teclado.dart` '
      'chama de *"o mesmo defeito com outro nome"*. Numa folha o '
      '`viewInsets` do contexto E o do teclado (nao ha `Scaffold` zerando '
      'nada), entao ali a condicao de dois lados existe e o conserto cabe em '
      'somar `BarraDoTeclado.alturaEmUso` ao recuo que ja esta escrito. '
      'Falta a MEDICAO que mande fazer isso.',
};

void main() {
  test(
    'toda tela com campo de texto corrido reserva a faixa do teclado',
    () {
      final comCampoCorrido = <String>[];
      final semReserva = <String>[];

      for (final arquivo in Directory('lib/telas').listSync(recursive: true)) {
        if (arquivo is! File || !arquivo.path.endsWith('.dart')) continue;
        // **SEM OS COMENTARIOS.** A prosa desta arvore cita `linhas: 3` e
        // `BarraDeAcaoFixa` em varios lugares, e um portao que lesse a
        // PALAVRA aprovaria por documentacao e reprovaria por documentacao.
        // Foi um dos portoes cegos achados neste repositorio.
        final codigo = arquivo
            .readAsStringSync()
            .split('\n')
            .where((l) => !l.trimLeft().startsWith('//'))
            .join('\n');

        // `linhas: N,` com N maior que 1 e exatamente o que faz `BichuField`
        // anexar a faixa: `textoCorrido: linhas > 1 && !obscurecer`.
        //
        // O `[2-9]|[1-9][0-9]+` evita casar `linhas: 1,` e tambem
        // `linhas: <String>[...]`, que e outro parametro, de outro widget.
        final temCampoCorrido = RegExp(
          r'linhas:\s*(?:[2-9]|[1-9][0-9]+)\s*,',
        ).hasMatch(codigo);
        if (!temCampoCorrido) continue;

        comCampoCorrido.add(arquivo.path);
        final reserva = codigo.contains('BarraDeAcaoFixa') ||
            codigo.contains('BarraDoTeclado.alturaEmUso');
        if (!reserva) semReserva.add(arquivo.path);
      }

      // ---- CONTROLE POSITIVO -------------------------------------------
      // **Ele vem antes da comparacao.** Zero arquivo achado significaria que
      // o padrao de busca parou de casar -- `linhas:` renomeado, a arvore
      // movida de lugar --, e nao que o app ficou limpo. Portao que nao acha
      // o que procura precisa reprovar, e nao aprovar por vazio.
      expect(
        comCampoCorrido.length,
        greaterThanOrEqualTo(8),
        reason:
            'REPROVA ANTES DA MEDICAO: a varredura achou '
            '${comCampoCorrido.length} tela(s) com campo de texto corrido, e '
            'em 22/10/2026 havia 9. O padrao de busca parou de casar (o '
            'parametro `linhas` mudou de nome, ou `lib/telas` mudou de '
            'lugar), entao a comparacao abaixo nao prova nada: ela ficaria '
            'VERDE com o app inteiro defeituoso.',
      );

      expect(
        semReserva.toSet(),
        semReservaDeclarada.keys.toSet(),
        reason:
            'REPROVA: a lista de telas com campo de texto corrido que NAO '
            'reservam a faixa do teclado deixou de bater com a lista '
            'declarada no topo deste arquivo.\n'
            '  sem reserva agora: $semReserva\n'
            '  declaradas:        ${semReservaDeclarada.keys.toList()}\n'
            'Se ENTROU uma tela: ela tem campo de texto corrido e nao reserva '
            'os 48 dp da faixa. Com o teclado aberto a faixa se desenha num '
            '`Overlay`, POR CIMA do `Scaffold`, e cobre o que estiver nos '
            'ultimos 48 dp da janela -- se houver acao ali, o toque no centro '
            'dela atinge o `Concluir` da faixa e a acao NAO ACONTECE, sem '
            'excecao nenhuma. A saida preferida e por `BarraDeAcaoFixa` no '
            'slot `bottomNavigationBar`, que ja le '
            '`BarraDoTeclado.alturaEmUso` e serve 22 telas desta arvore.\n'
            'Se SAIU uma tela: o conserto chegou -- apague a linha dela da '
            '`semReservaDeclarada`.',
      );
    },
  );
}
