// O convite de conexão: **as duas formas de QR, e que elas não se confundem.**
//
// **O ESCOPO DESTE ARQUIVO ENCOLHEU EM 28/10/2026**, e o registro do que saiu
// está no corpo de `main`, caso por caso: a tela `Convide tutores` morreu por
// decisão do cliente, o QR foi para dentro de `Meus dados`, e cada cobertura
// dela foi para um arquivo nomeado lá.
//
// O que ficou é a isca (c), que nunca dependeu da tela: ela mede as duas
// funções PURAS de reconhecimento, nos dois sentidos, sem app montado.
//
// As iscas deste arquivo, pelo nome do caso:
//
//   (a) **o QR do convite abre o perfil certo** — o leitor reconhece o token,
//       resolve no servidor e empurra `/pessoa/<apelido>` com o token no
//       `extra`, que é a credencial do pedido;
//   (b) **o QR da plaquinha continua funcionando** — e este é o CONTRAPESO.
//       É ele que impede o reuso do leitor de quebrar o caminho do achador, que
//       é a cunha do produto. Sem este caso, (a) poderia ser verdade com o
//       caminho do achador morto;
//   (c) **as duas formas são mutuamente exclusivas por construção** — medido
//       nas duas funções puras, nos dois sentidos, sem app montado;
//   (d) **não há ação de compartilhar o perfil** — a ausência é desenhada, e
//       não um botão desabilitado (critério 2 da BICHUS-62);
//   (e) **a seção conta só quem aceitou E tem pet com foto** — e, como a
//       contagem não tem rota no contrato, a tela NÃO a simula: o estado é
//       "ninguém ainda" mesmo com conexões na conta.
//
// Todo esperado está escrito por extenso, com acento.


import 'package:bichu/telas/escanear/codigo_lido_do_qr.dart';
import 'package:bichu/telas/escanear/convite_lido_do_qr.dart';
import 'package:flutter_test/flutter_test.dart';



/// Um token como `opaqueToken` o produz: 32 bytes em base64url, 43 símbolos.
const String tokenDeConvite = 'AbC1dEf2GhI3jKl4MnO5pQr6StU7vWx8YzA9bCd0eF-';

/// O que a plaquinha de verdade carrega.
const String codigoDaPlaquinha = '7K2MQ1D4B8NV3XZ0';
const String qrDaPlaquinha = 'https://bichu.app/t/$codigoDaPlaquinha';

/// A base que `codigoDaPlaquinhaDoQr` compara. **Ficou depois de o resto do
/// arquivo encolher** (28/10/2026): era `_urlBase`, usada tambem pelas
/// bancadas da tela que morreu, e agora serve so a este grupo.
const String _urlBaseDaApi = 'https://api.exemplo.test';

void main() {
  group('ISCA (c) -- as duas formas de QR nao se confundem', () {
    final Uri apiDeTeste = Uri.parse(_urlBaseDaApi);

    test('o token de convite e reconhecido como convite', () {
      expect(
        tokenDeConviteDoQr(tokenDeConvite),
        tokenDeConvite,
        reason: 'REPROVA: um token de 43 símbolos base64url não foi '
            'reconhecido como convite.',
      );
      expect(
        tokenDeConvite.length,
        43,
        reason: 'REPROVA: o token do caso deixou de ter o tamanho que '
            '`opaqueToken` produz, e o caso passou a medir outra coisa.',
      );
    });

    test('o token de convite NAO passa por codigo de plaquinha', () {
      // PARA DESLIGAR E VER REPROVAR: em `codigo_lido_do_qr.dart`, aceite
      // texto solto em `codigoDeTagDoQr`.
      expect(
        codigoDeTagDoQr(tokenDeConvite, apiBaseUrl: apiDeTeste),
        isNull,
        reason: 'REPROVA: o token de convite foi lido como código de '
            'plaquinha. O leitor abriria a página de um pet com a credencial '
            'de conexão de alguém.',
      );
    });

    test('o QR da plaquinha NAO passa por convite', () {
      // O alfabeto base64url não tem `.`, `/` nem `:`, então a URL cai fora
      // pela própria forma -- sem nenhum caso especial a manter.
      expect(
        tokenDeConviteDoQr(qrDaPlaquinha),
        isNull,
        reason: 'REPROVA: a URL da plaquinha foi lida como token de convite. '
            'O app pediria a resolução de um convite que não existe, e '
            'gastaria o teto de 20 tentativas inválidas por hora.',
      );
    });

    test('o codigo impresso de 16 simbolos NAO passa por convite', () {
      expect(
        tokenDeConviteDoQr(codigoDaPlaquinha),
        isNull,
        reason: 'REPROVA: o código de 16 símbolos passou pelo piso de 20 do '
            'token de convite.',
      );
      expect(
        temFormaDeCodigoDeTag(codigoDaPlaquinha),
        isTrue,
        reason: 'REPROVA: o código impresso deixou de ter forma de código de '
            'plaquinha, e o contrapeso deste grupo virou vazio.',
      );
    });

    test('o que nao e nenhum dos dois nao e nada', () {
      for (final lixo in <String>[
        '',
        '   ',
        'https://exemplo.test/promocao',
        'curto',
        'tem espaço no meio do texto todo',
        'tem.ponto.e.nao.e.base64url.mas.tem.vinte.caracteres',
      ]) {
        expect(
          tokenDeConviteDoQr(lixo),
          isNull,
          reason: 'REPROVA: "$lixo" foi lido como token de convite.',
        );
      }
    });
  });

  // ======================================================================
  // OS DOIS GRUPOS DA TELA `Convide tutores` SAIRAM EM 28/10/2026, COM ELA
  // ======================================================================
  //
  // A tela MORREU por decisao do cliente: o QR foi para dentro de `Meus
  // dados` (`telas/perfil/tela_dados_pessoais.dart`, `_BlocoDoConvite`,
  // recolhido no pe da pagina) e o placar `invited_joined_count` foi com ele.
  //
  // **PARA ONDE CADA COBERTURA FOI, e nada disto ficou sem dono:**
  //
  //   - a secao existe, nasce RECOLHIDA, o toque abre o QR, a instrucao de
  //     que *"a camera comum do celular nao abre este codigo"* viaja com ele,
  //     e o PLACAR aparece ->
  //     `telas/qr_do_convite_em_meus_dados_test.dart`;
  //   - o QR codifica o TOKEN e nenhum identificador interno ->
  //     `telas/qr_do_pet_na_pagina_test.dart`, que leu a fonte da tela morta
  //     e agora le a do arquivo que hospeda o QR;
  //   - `Trocar o meu QR` e `Apagar o meu QR` nao voltam, e NENHUMA revogacao
  //     sai com o QR na tela -> `telas/sem_acao_de_qr_do_usuario_test.dart`,
  //     que tambem seguiu o QR de casa;
  //   - as duas formas de QR nao se confundem -> o grupo ACIMA, que nao tem
  //     nada a ver com a tela e por isso ficou intacto.
  //
  // **O QUE SE PERDEU DE VERDADE, e esta e a unica perda real desta frente:**
  // a `TrilhaDeConvites` -- o bloco de tres marcos (`O primeiro vizinho`,
  // `Três olhos a mais`, `Dez na vizinhança`), com `MarcoDeConvite` como par
  // `(numero, o que acontece la)` e a prosa que explicava como ela receberia
  // premio sem redesenho -- e os cinco casos que a mediam, mais o estado
  // `Ninguem ainda` do placar em zero.
  //
  // Ela morreu porque o protovipo aprovado em 28/10 poe o placar como **UMA
  // LINHA** dentro do bloco do QR, com a razao escrita: ele *"nao e o assunto
  // de `Meus dados` e nao merece secao propria"*. O cliente decidiu que o
  // PLACAR viaja junto; **ninguem decidiu especificamente sobre a TRILHA**, e
  // o desenho que a substituiu foi aprovado. Isto esta reportado como a
  // ressalva que e, e nao escondido num diff: se ele quiser os marcos de
  // volta, o que volta e esta classe e estes casos.

}
