// A FAIXA DO `409` NO FORMULARIO DE AVALIACAO TEM SAIDA.
//
// `409 contact-channel-unverified` e a recusa do servidor para quem nao
// confirmou o e-mail, e a escrita da avaliacao
// (`PUT /v1/directory/entries/{slug}/reviews/me`) e uma das quatro rotas que a
// devolvem. A mensagem chega com rotulo de saida -- `Confirmar meu e-mail` --
// e com `next_action: verify_email`, e o estado desta tela guardava so o
// `.texto` dela: os dois eram jogados fora antes de a faixa existir.
//
// ## O SINTOMA NAO ERA BOTAO MORTO
//
// `FaixaDeAviso` so monta o `TextButton` com rotulo **e** callback
// (`lib/widgets/faixa_de_aviso.dart`), entao o rotulo descartado nao aparecia
// como saida sem destino: nao aparecia de jeito nenhum. A pessoa lia que
// precisa confirmar o e-mail antes de avaliar e **nao tinha onde tocar** -- a
// ausencia de botao que a BICHUS-62 descreve.
//
// ## ONDE ESTE `409` AINDA ACONTECE
//
// A tela ja esconde o formulario de quem o detalhe diz que nao pode avaliar
// (`can_review: false` com `review_blocked_reason`), e nesse caminho ela mostra
// um bloco proprio com `Confirmar meu e-mail`. O que sobra para o servidor
// recusar e quem tinha a tela EM PE quando o estado do e-mail mudou noutro
// aparelho -- e e por isso que a sessao deste caso abre com o e-mail
// confirmado (`depositoLogado`) e o detalhe vem com `can_review: true`: sem as
// duas coisas o caso nao chegaria ao envio.
//
// ## A isca
//
// O caso rola ate a FRASE do `409` e nao ate o botao. A frase e desenhada com
// ou sem a saida, entao quem reprova e o `expect` escrito, com o motivo --
// procurando o botao direto, a ausencia estouraria dentro do ajudante de
// rolagem como `Bad state`, sem dizer o que faltou.
//
// **O trecho procurado e `Confirme seu e-mail`**, que e a abertura comum as
// duas redacoes desta frase: a generica e a por rota, que a PR #49 esta
// escrevendo agora. Casar o resto da frase faria este caso reprovar numa
// mudanca de microcopy que nao tem nada a ver com a saida.

import 'package:bichu/telas/conta/tela_verifique_seu_email.dart';
import 'package:bichu/telas/perto/pagina_do_local.dart';
import 'package:bichu/widgets/botao_primario.dart';
import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:http/http.dart' as http;

import 'ajuda_de_tela.dart';
import 'telefone_fora_da_tela_test.dart'
    show abrirOLocal, detalheComTudo, redeDoLocal;

/// O `409` das quatro rotas de conta nao validada, com o `next_action` que o
/// contrato manda.
http.Response canalNaoVerificado() => problema(
      'contact-channel-unverified',
      409,
      extra: <String, dynamic>{'next_action': 'verify_email'},
    );

/// Abre a pagina do local com o `PUT` da minha avaliacao recusado por [resposta].
Future<void> abrirComEnvioRecusado(
  WidgetTester tester, {
  required http.Response Function() resposta,
}) async {
  final base = redeDoLocal(detalhe: detalheComTudo());
  await abrirOLocal(
    tester,
    // A pagina inteira montada em 400 x 4000 dp: o formulario fica embaixo das
    // avaliacoes, e a faixa aparece dentro dele.
    alta: true,
    rede: (req) async {
      if (req.url.path.endsWith('/reviews/me') && req.method == 'PUT') {
        return resposta();
      }
      return base(req);
    },
  );

  // A NOTA E OBRIGATORIA. Sem ela `_enviar` para antes de tocar a rede, e o
  // caso mediria a frase de nota faltando em vez da recusa do servidor.
  await tocar(tester, find.bySemanticsLabel('5 estrelas de 5'));
  await tocar(
    tester,
    find.widgetWithText(BotaoPrimario, PaginaDoLocal.rotuloDeEnviar),
  );
}

void main() {
  group('a recusa do envio da avaliacao', () {
    // DESLIGAR PARA VER REPROVAR: em `lib/telas/perto/pagina_do_local.dart`,
    // troque o estado `MensagemDeErro? _erroDoFormulario` de volta por
    // `String?` -- ou, mais curto, devolva o `.texto` ao `on FalhaDaApi` e
    // passe `texto: erro!` para a faixa. O primeiro caso reprova no
    // `findsOneWidget` do botao, com o motivo escrito.
    testWidgets('o 409 de canal não verificado SAI para a confirmação de '
        'e-mail', (tester) async {
      await abrirComEnvioRecusado(tester, resposta: canalNaoVerificado);

      await rolarAte(tester, find.textContaining('Confirme seu e-mail'));
      expect(
        find.textContaining('Confirme seu e-mail'),
        findsOneWidget,
        reason: 'REPROVA: a recusa do servidor não chegou à faixa do '
            'formulário. Sem a frase na árvore, o `expect` do botão abaixo '
            'mediria a ausência de uma faixa que nem apareceu.',
      );

      final saida = find.widgetWithText(TextButton, 'Confirmar meu e-mail');
      expect(
        saida,
        findsOneWidget,
        reason: 'REPROVA: a faixa do 409 saiu SEM SAÍDA NENHUMA. A mensagem '
            'chega com o rótulo `Confirmar meu e-mail` e com '
            '`next_action: verify_email`, e guardar só o `.texto` dela joga os '
            'dois fora: a pessoa lê que precisa confirmar o e-mail antes de '
            'avaliar e não tem onde tocar. `FaixaDeAviso` só monta o botão '
            'com rótulo E callback, então isto é ausência de botão, e não '
            'botão morto.',
      );

      await tocar(tester, saida);

      final destino = find.byType(TelaVerifiqueSeuEmail);
      expect(
        destino,
        findsOneWidget,
        reason: 'REPROVA: tocar na saída da faixa não abriu a confirmação de '
            'e-mail. É o mesmo destino que `rede/criar_encontro.dart` e '
            '`perto/sugerir_profissional.dart` dão ao mesmo 409, e duas telas '
            'da mesma regra que divergem no destino fazem a pessoa aprender a '
            'tela, não o app.',
      );
      expect(
        tester.widget<TelaVerifiqueSeuEmail>(destino).email,
        'marina@exemplo.com.br',
        reason: 'REPROVA: a confirmação abriu sem o e-mail da sessão. Sem ele '
            'a tela não diz PARA ONDE o link foi, e a pessoa não sabe em qual '
            'caixa procurar. O endereço é o que `depositoLogado` grava na '
            'sessão deste caso.',
      );
    });

    // O OUTRO LADO DA MESMA MUDANCA, e ele e que impede o conserto de virar
    // botao que nao leva a lugar nenhum: `Tentar de novo` e rotulo de
    // OPERACAO, nao de navegacao, e `saidaDaMensagem` devolve `null` para ele.
    // A faixa entao nao desenha botao -- que e o que ela fazia antes, e o que
    // ela deve continuar fazendo.
    testWidgets('o 500 mostra a frase e NÃO inventa um botão para ela',
        (tester) async {
      await abrirComEnvioRecusado(
        tester,
        resposta: () => problema('internal-error', 500),
      );

      await rolarAte(tester, find.textContaining('fora do ar'));
      expect(
        find.textContaining('fora do ar'),
        findsOneWidget,
        reason: 'REPROVA: o 500 do envio da avaliação não chegou à faixa.',
      );
      expect(
        find.widgetWithText(TextButton, 'Tentar de novo'),
        findsNothing,
        reason: 'REPROVA: apareceu um botão `Tentar de novo` na faixa. O '
            'rótulo vem do catálogo, mas ele é uma OPERAÇÃO desta tela (o '
            'reenvio) e não um endereço: desenhá-lo sem ninguém por trás é '
            'exatamente o botão sem destino que a BICHUS-62 veio fechar.',
      );
    });
  });
}
