// **UM `type`, QUATRO ROTAS, QUATRO FRASES.**
//
// `409 contact-channel-unverified` e devolvido por quatro operacoes do
// servidor, e isso e desenho e nao descuido -- `src/shared/http/errors.ts`
// escreve o motivo tres vezes: *"a regua de conta validada e uma so no
// produto, e um segundo `type` para a mesma pergunta faria o app decidir por
// dois onde ha um conceito"*. As quatro fabricas de la sao
// `canalDeContatoNaoVerificado`, `...ParaEncontro`, `...ParaSugestao` e
// `...ParaAvaliar`, e cada uma manda `title` e `detail` proprios.
//
// O app traduzia o `type` num ponto unico (`MensagensDeErro`) e por isso
// devolvia **a mesma frase nas quatro**, a de pet perdido:
//
//   > Confirme seu e-mail antes de avisar. Os tutores por perto vão receber a
//   > foto. Se alguém encontrar, é pelo seu e-mail que a gente avisa.
//
// Em tres das quatro ela prometia o que nao ia acontecer. Um evento nao tem
// achador e nao manda foto. Uma indicacao nao avisa ninguem e vai para fila de
// conferencia humana -- a propria tela promete isso acima dos campos. Uma
// avaliacao de veterinario nao alerta vizinho nenhum.
//
// ## Por que estes quatro casos moram no MESMO arquivo
//
// O defeito nao esta em nenhuma das quatro telas: esta na relacao entre elas.
// Ler as quatro frases lado a lado e o que mede que elas sao quatro, e o
// caso de pet perdido -- o unico em que a frase antiga estava CERTA -- e o que
// mede que a correcao nao foi apagar o texto bom e pintar todo mundo de
// generico. Separados em quatro arquivos, nenhum deles reprova a saida
// generica.
//
// ## A isca
//
// Cada caso procura a frase da SUA rota **e reprova a frase de pet perdido**
// nas outras tres. Sem o segundo `expect`, colapsar as quatro de volta num
// texto so passaria em tres dos quatro casos.
//
// **Nenhum `expect` compara texto renderizado com a constante que o produz.**
// As frases estao escritas por extenso aqui: uma assercao contra
// `MensagensDeErro.canalNaoVerificadoParaCriarEncontro` aprovaria qualquer
// redacao que aquela constante passasse a ter, inclusive a errada.

import 'package:bichu/api/modelos.dart' show RegiaoDeReferencia;
import 'package:bichu/telas/pet/textos_do_detalhe.dart';
import 'package:bichu/telas/perdido/tela_alcance_do_alerta.dart';
import 'package:bichu/telas/perdido/tela_onde_e_quando.dart';
import 'package:bichu/telas/perto/pagina_do_local.dart';
import 'package:bichu/widgets/botao_primario.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:http/http.dart' as http;

import 'ajuda_de_tela.dart';
import 'criar_encontro_test.dart' as encontro;
import 'marcar_como_perdido_test.dart' as perdido;
import 'sugerir_profissional_test.dart' as indicacao;
import 'telefone_fora_da_tela_test.dart' as local;

/// A frase de pet perdido, **por extenso**: e ela que as outras tres rotas nao
/// podem mostrar, e e o `findsNothing` de cada um dos tres casos.
const String trechoDePetPerdido = 'Os tutores por perto';

/// O corpo do `409`, igual nas quatro rotas: mesmo `type`, mesmo `next_action`.
http.Response canalNaoVerificado() => problema(
      'contact-channel-unverified',
      409,
      extra: <String, dynamic>{'next_action': 'verify_email'},
    );

void main() {
  group('a frase do 409 de canal nao verificado fala da rota que recusou', () {
    // -----------------------------------------------------------------------
    // 1. PET PERDIDO -- o caso em que a frase antiga estava CERTA.
    // -----------------------------------------------------------------------
    testWidgets('avisar pet perdido CONTINUA dizendo que o aviso chega pelo '
        'e-mail', (tester) async {
      // A previa sem bloqueio deixa o botao de avisar em pe; a recusa chega no
      // envio, que e a rede de seguranca de quem confirmou o e-mail noutro
      // aparelho com esta tela aberta.
      final base = perdido.servidorCom(
        <Map<String, dynamic>>[perdido.pet(id: 'p-1', nome: 'Rex')],
        previa: <String, dynamic>{
          'reach_status': 'unavailable',
          'radius_m': 5000,
          'blockers': <dynamic>[],
        },
      );
      await perdido.abrirAPaginaDoPet(
        tester,
        rede: (req) async {
          if (req.url.path.endsWith('/lost-cases') && req.method == 'POST') {
            return canalNaoVerificado();
          }
          return base(req);
        },
        regiao: const RegiaoDeReferencia(cidade: 'São Paulo'),
      );

      await tocar(tester, find.text(TextosDoDetalhe.marcarComoPerdido));
      await perdido.tocarNaOpcao(tester, 'Agora');
      await tocar(
        tester,
        find.widgetWithText(BotaoPrimario, TelaOndeEQuando.rotuloDeContinuar),
      );
      await tocar(
        tester,
        find.widgetWithText(BotaoPrimario, TelaAlcanceDoAlerta.rotuloDeAvisar),
      );

      await rolarAte(tester, find.textContaining(trechoDePetPerdido));
      expect(
        find.textContaining(trechoDePetPerdido),
        findsOneWidget,
        reason: 'REPROVA: a frase de pet perdido foi trocada por um texto '
            'generico. ESTE e o unico dos quatro casos em que o e-mail E o '
            'canal pelo qual a pessoa sera avisada, e dizer isso e o que '
            'torna o pedido de confirmar razoavel para quem esta em panico. '
            'A correcao era dar frase propria as outras tres, nao apagar a '
            'que estava certa.',
      );
      expect(
        find.textContaining('alguém encontrar'),
        findsOneWidget,
        reason: 'REPROVA: a frase perdeu a parte que explica POR QUE o e-mail '
            'importa aqui -- que e por ele que a gente avisa.',
      );
    });

    // -----------------------------------------------------------------------
    // 2. CRIAR ENCONTRO -- nao ha achador e nao ha foto.
    // -----------------------------------------------------------------------
    testWidgets('criar encontro fala de PUBLICACAO, e nao de foto nem de quem '
        'encontra', (tester) async {
      await encontro.abrirAgenda(
        tester,
        rede: encontro.redeDaCriacao(
          enviados: <Map<String, dynamic>>[],
          respostaDaCriacao: canalNaoVerificado,
        ),
      );
      await encontro.abrirAPorta(tester);
      await encontro.preencherOMinimo(tester);
      await tocar(tester, find.widgetWithText(BotaoPrimario, 'Criar evento'));

      // A faixa e o topo do `ListView` e o formulario preenchido ficou rolado
      // para baixo: `find` nao enxerga o que o `ListView` nao construiu.
      await rolarAte(
        tester,
        find.textContaining('antes de criar'),
        passo: -120,
      );
      expect(
        find.textContaining('antes de criar'),
        findsOneWidget,
        reason: 'REPROVA: o 409 de criar evento nao diz o que esta tela faz.',
      );
      expect(
        find.textContaining('toda a comunidade com o seu nome'),
        findsOneWidget,
        reason: 'REPROVA: a frase nao diz o motivo desta rota -- o evento '
            'entra na agenda na hora, com o nome de quem marcou.',
      );
      expect(
        find.textContaining(trechoDePetPerdido),
        findsNothing,
        reason: 'REPROVA: a tela de criar evento prometeu que os tutores por '
            'perto vao receber a foto. Um evento nao tem achador e nao manda '
            'foto: a frase descreve coisa que nao vai acontecer.',
      );
    });

    // -----------------------------------------------------------------------
    // 3. INDICAR PROFISSIONAL -- nada publica, e o que pesa e o terceiro.
    // -----------------------------------------------------------------------
    testWidgets('indicar profissional fala do TERCEIRO e de quem confere',
        (tester) async {
      await indicacao.abrirPerto(
        tester,
        rede: indicacao.redeDaIndicacao(
          enviados: <Map<String, dynamic>>[],
          respostaDaIndicacao: canalNaoVerificado,
        ),
      );
      await indicacao.abrirAPorta(tester);
      await indicacao.preencherOMinimo(tester);
      await tocar(
        tester,
        find.widgetWithText(BotaoPrimario, 'Enviar indicação'),
      );

      await rolarAte(
        tester,
        find.textContaining('antes de indicar'),
        passo: -120,
      );
      expect(
        find.textContaining('antes de indicar'),
        findsOneWidget,
        reason: 'REPROVA: o 409 de indicar nao diz o que esta tela faz.',
      );
      // `quem confere` sozinho acha DOIS: a ajuda do campo de CEP desta mesma
      // tela tambem diz *"fica salvo so para quem confere"*. O trecho vai
      // inteiro, senao o caso reprova por um motivo que nao e o dele.
      expect(
        find.textContaining('quem confere precisa saber'),
        findsOneWidget,
        reason: 'REPROVA: a frase nao diz o motivo desta rota -- a indicacao '
            'fala de um estabelecimento de verdade, e quem confere precisa '
            'saber de quem ela veio.',
      );
      expect(
        find.textContaining(trechoDePetPerdido),
        findsNothing,
        reason: 'REPROVA: a tela de indicar prometeu foto para os tutores por '
            'perto. A indicacao nao avisa ninguem, nao manda foto e vai para '
            'fila de conferencia -- a propria tela promete isso tres '
            'paragrafos acima dos campos.',
      );
    });

    // -----------------------------------------------------------------------
    // 4. AVALIAR LOCAL -- o quarto desfecho, que o achado nao tinha.
    // -----------------------------------------------------------------------
    testWidgets('avaliar um local fala da AVALIACAO com o seu nome',
        (tester) async {
      final base = local.redeDoLocal(detalhe: local.detalheComTudo());
      await local.abrirOLocal(
        tester,
        alta: true,
        rede: (req) async {
          if (req.url.path.endsWith('/reviews/me') && req.method == 'PUT') {
            return canalNaoVerificado();
          }
          return base(req);
        },
      );

      // A nota e obrigatoria: sem ela o envio para antes de tocar a rede, e o
      // caso mediria a frase de nota faltando em vez da recusa do servidor.
      await tocar(
        tester,
        find.bySemanticsLabel('5 estrelas de 5'),
      );
      await tocar(
        tester,
        find.widgetWithText(BotaoPrimario, PaginaDoLocal.rotuloDeEnviar),
      );

      expect(
        find.textContaining('antes de avaliar'),
        findsOneWidget,
        reason: 'REPROVA: o 409 da escrita da avaliacao nao diz o que esta '
            'tela faz. Esta e a QUARTA rota deste `type`, e ela nao estava no '
            'achado: ela sai de `directory-routes.ts`.',
      );
      expect(
        find.textContaining('negócio real'),
        findsOneWidget,
        reason: 'REPROVA: a frase nao diz o motivo desta rota -- a avaliacao '
            'aparece com o nome de quem escreveu, na pagina de um negocio '
            'real.',
      );
      expect(
        find.textContaining(trechoDePetPerdido),
        findsNothing,
        reason: 'REPROVA: a tela de avaliar um veterinario prometeu que os '
            'tutores por perto vao receber a foto.',
      );
    });
  });
}
