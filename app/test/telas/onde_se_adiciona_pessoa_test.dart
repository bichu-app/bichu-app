// ONDE UMA PESSOA PODE SER "ADICIONADA" — e o portao que congela a lista.
//
// ## Por que este arquivo existe, e o motivo e uma reclamacao repetida
//
// O cliente cobrou o mesmo defeito TRES vezes (22/10, 26/10 e 26/10 de novo):
// um controle de pedir conexao aparecendo ao lado de quem **ja e** conexao. As
// duas primeiras vezes o conserto foi numa tela (`cartao_de_pessoa_encontrada`
// e `tela_perfil_de_pessoa`), e as duas vezes a pergunta seguinte foi a mesma:
// *"em QUANTOS outros lugares isso tambem esta errado?"*
//
// **Responder essa pergunta lendo o codigo nao escala, e envelhece no dia
// seguinte.** Este portao a responde por varredura: ele enumera os arquivos de
// `lib/telas` que chamam a porta de pedir conexao e cobra que o conjunto seja
// EXATAMENTE o conhecido. A terceira tela que oferecer "adicionar" reprova
// aqui **antes de alguem precisar do aparelho para descobri-la**.
//
// ## O que ele NAO faz, e a fronteira importa
//
// Ele nao confere o que cada tela desenha em cada estado -- isso e dos testes
// de widget de cada uma (`busca_de_pessoas_test.dart`,
// `perfil_de_pessoa_test.dart`). Ele confere **quantas portas existem**, que e
// a pergunta que nenhum teste de widget responde: um teste de widget mede a
// tela que ele monta, e o defeito de 26/10 era uma tela que ninguem pensou em
// montar.
//
// ## A ENUMERACAO MEDIDA EM 26/10/2026, e o que cada superficie mostra
//
// Varri `lib/telas` e `lib/widgets` por: quem recebe `ConexoesApi` (seis
// arquivos), quem chama `pedir`/`pedirPorApelido` (DOIS), todo rotulo de
// adicionar/conectar, os icones `person_add`/`group_add`, e todo arquivo que
// menciona um tipo de pessoa do contrato.
//
// | Superficie | Oferece adicionar? | Em `connected` mostra | De onde vem o estado |
// |---|---|---|---|
// | aba `Usuarios` (busca) | **SIM** | `Ja e sua conexao`, sem botao | `PersonSearchResult.connection_state` (obrigatorio) |
// | perfil de pessoa | **SIM** | ramo vazio no corpo; `Desfazer conexao` no `⋮` | `PersonProfile.connection_state` + `connection_ref` |
// | `Minhas conexoes` | nao -- a linha inteira e porta do perfil | so a ficha, sem acao | nao precisa: `connected` por construcao |
// | `Pedidos de conexao` | nao -- `Aceitar`/`Recusar`/`Cancelar` | nao aparece na lista | a ARESTA (`Connection.state`), nao a pessoa |
// | `Usuarios bloqueados` | nao -- so desbloquear | nao aparece na lista | nao precisa |
// | Mural (autor) | nao -- `PortaDoPerfilDoAutor` so navega | — | — |
// | comentarios | nao -- `⋮` sem item de pessoa | — | — |
// | leitura de QR | nao -- resolve o convite e ABRE o perfil | o que o perfil mostrar | o perfil, pelo apelido |
// | `Perto` / pagina do local | nao -- "outras" sao AVALIACOES, nao pessoas | — | — |
// | diretorio de profissionais | nao -- `Indicar`, e indicar nao e conectar | — | — |
//
// **Nenhuma superficie precisa de mudanca de CONTRATO.** `ConnectedPerson`,
// `ConnectionPerson` e `BlockedPerson` nao trazem `connection_state`, e
// nenhuma das tres precisa: na lista de conexoes o estado seria a constante
// `connected` em toda linha (e o portao
// `conexao-nao-expoe-lista-nem-identificador.test.ts` **proibe** o campo ali),
// na caixa de pedidos o estado e da aresta, e bloqueado nao tem o que pedir.
//
// ## A EMENDA DE 27/10/2026: `Minhas conexoes` GANHOU botao, e continuam DUAS
//
// O pedido dele de 22/10 era *"uma pagina com a listagem dos usuarios **e um
// botao para adicionar**"*, e a tabela acima registra que o botao nunca saiu.
// Ele saiu em 27/10: `telas/conexoes/tela_minhas_conexoes.dart` agora desenha
// `Buscar usuarios` (`TelaDeMinhasConexoes.buscarUsuarios`).
//
// **E [asDuasPortas] NAO mudou, e a razao e o que este portao mede.** Aquele
// botao **so navega** -- `context.go(Rotas.redeNaBuscaDePessoas)` --, e nao
// chama `pedirPorApelido` nem `pedir`. Ele nao abre aresta, nao tem estado de
// relacao para ramificar e nao pode mostrar controle errado para quem ja e
// conexao, que e o defeito que ele cobrou tres vezes. Quem ramifica pelos
// quatro estados continuam sendo as DUAS da lista.
//
// **A fronteira esta medida num caso proprio** -- *"um botao que so NAVEGA nao
// e porta de pedir conexao"* --, e ele existe porque a alternativa era pior nas
// duas direcoes: sem ele, alguem acrescentaria `tela_minhas_conexoes.dart` a
// [asDuasPortas] "porque ela tem botao de adicionar" e o portao passaria a
// exigir ramos por estado numa tela que nao tem relacao nenhuma para ramificar;
// ou alguem afrouxaria [_chamaAPorta] para pegar navegacao e as doze
// superficies que navegam para a busca entrariam todas.
//
// **O que este portao continua cobrando sem uma linha mudada:** o dia em que
// aquele botao virar um campo de apelido que chama `pedirPorApelido`, o caso da
// igualdade de conjunto reprova nomeando o arquivo -- que e exatamente o que se
// quer, porque ai ele PASSA a precisar dos quatro ramos.
//
// | Superficie | Oferece adicionar? | Abre aresta? | Conta como porta |
// |---|---|---|---|
// | aba `Usuarios` (busca) | SIM | **SIM** (`pedirPorApelido`) | **sim** |
// | perfil de pessoa | SIM | **SIM** (`pedirPorApelido`) | **sim** |
// | `Minhas conexoes` (27/10) | SIM, `Buscar usuarios` | **nao** -- navega | **nao** |
// | vazio do Mural | SIM, `Buscar usuarios` | **nao** -- navega | **nao** |

import 'dart:io' as io;

import 'package:flutter_test/flutter_test.dart';

import '../dispositivo/literais_de_abrir_mapa.dart';

/// As DUAS portas de pedir conexao, por caminho relativo a `lib/`.
///
/// **Duas, e o numero e o mecanismo**: e a igualdade de conjunto que faz a
/// TERCEIRA ser vista antes de nascer. Acrescentar um caminho aqui tem de ser
/// ato deliberado, com a decisao do cliente no diff -- do mesmo jeito que
/// `_arvoreDasTelas` cobra o seu.
const List<String> asDuasPortas = <String>[
  'telas/pessoa/tela_perfil_de_pessoa.dart',
  'telas/rede/busca_de_pessoas.dart',
];

/// O que conta como chamar a porta de pedir conexao.
///
/// **`pedirPorApelido` e `pedir(` com `tokenDoConvite`** sao os dois metodos de
/// `ConexoesApi` que CRIAM aresta. `aceitar` e `encerrar` nao entram: elas
/// agem sobre aresta que ja existe, e e por isso que a caixa de pedidos nao e
/// uma superficie de "adicionar".
final RegExp _chamaAPorta = RegExp(
  r'\.(pedirPorApelido|pedir)\s*\(\s*(tokenDoConvite|apelido)\s*:',
);

List<io.File> _dartsDeTelasEWidgets() {
  final String raiz = raizDoPacoteDoApp();
  final List<io.File> achados = <io.File>[];
  for (final String pasta in <String>['telas', 'widgets']) {
    final io.Directory d = io.Directory('$raiz/lib/$pasta');
    if (!d.existsSync()) {
      fail('REPROVA: nao achei "${d.path}". A varredura nao confere nada sem ela.');
    }
    achados.addAll(
      d
          .listSync(recursive: true)
          .whereType<io.File>()
          .where((io.File f) => f.path.endsWith('.dart')),
    );
  }
  return achados;
}

String _relativo(io.File arquivo) {
  final String raiz = raizDoPacoteDoApp();
  return arquivo.absolute.path.substring('$raiz/lib/'.length);
}

List<String> _quemChamaAPorta() {
  final List<String> achados = <String>[];
  for (final io.File arquivo in _dartsDeTelasEWidgets()) {
    if (_chamaAPorta.hasMatch(arquivo.readAsStringSync())) {
      achados.add(_relativo(arquivo));
    }
  }
  achados.sort();
  return achados;
}

void main() {
  group('o portao de ONDE se adiciona uma pessoa', () {
    /// **O CONTROLE POSITIVO DA VARREDURA, e ele vem PRIMEIRO de proposito.**
    ///
    /// Uma varredura que lesse zero arquivo deixaria todos os casos abaixo
    /// verdes por vazio -- e e assim que um portao estrutural fica inutil sem
    /// ninguem notar. Este caso mede o que ela de fato leu.
    test('CONTROLE POSITIVO: a varredura LE os arquivos de `lib/telas` e `lib/widgets`', () {
      final List<io.File> arquivos = _dartsDeTelasEWidgets();
      expect(
        arquivos.length,
        greaterThan(80),
        reason: 'REPROVA: a varredura achou ${arquivos.length} arquivos `.dart`. '
            'Em 26/10/2026 eram mais de 80 entre `lib/telas` e `lib/widgets`; '
            'um numero baixo significa que ela parou de ler, e nao que o app '
            'encolheu.',
      );
      // E ela le o CONTEUDO, nao so o nome: um literal que se sabe estar la.
      final int comConexoesApi = arquivos
          .where((io.File f) => f.readAsStringSync().contains('ConexoesApi'))
          .length;
      expect(
        comConexoesApi,
        greaterThanOrEqualTo(2),
        reason: 'REPROVA: a varredura nao achou `ConexoesApi` em arquivo '
            'nenhum. Ela esta lendo nome de arquivo e nao conteudo.',
      );
    });

    /// **O CASO QUE RESPONDE A PERGUNTA DELE.**
    ///
    /// Igualdade de conjunto, e nao `contains`: `contains` deixaria a terceira
    /// porta entrar em silencio, que e exatamente o modo de falha das tres
    /// reclamacoes de 22 e 26/10.
    test('SAO DUAS as telas que pedem conexao, e sao estas', () {
      expect(
        _quemChamaAPorta(),
        asDuasPortas,
        reason: 'REPROVA: o conjunto de telas que chamam a porta de PEDIR '
            'conexao mudou.\n'
            '  esperado: $asDuasPortas\n'
            '  achado:   ${_quemChamaAPorta()}\n'
            'Se uma tela NOVA passou a oferecer "adicionar", ela precisa de um '
            'ramo por estado da relacao -- `connected`, `pending_sent`, '
            '`pending_received` e `none` -- e dos dois casos de widget que o '
            'cobrem (a ausencia para quem JA e conexao, e o CONTROLE POSITIVO '
            'de que quem NAO e conexao continua vendo o controle). O cliente '
            'cobrou este mesmo defeito tres vezes; a quarta tela a errar nao '
            'deve ser descoberta no aparelho.\n'
            'Se a tela SAIU, tire o caminho de `asDuasPortas` no mesmo diff.',
      );
    });

    /// **A ISCA DO CASO DE CIMA.** Sem ela, aquele caso passaria por o app ter
    /// a forma certa hoje -- e nao por a varredura saber reconhecer a forma
    /// errada.
    test('ISCA: a varredura REPROVA uma TERCEIRA porta injetada', () {
      final List<String> comVazamento = <String>[
        ..._quemChamaAPorta(),
        'telas/conexoes/tela_minhas_conexoes.dart',
      ]..sort();
      expect(
        comVazamento,
        isNot(asDuasPortas),
        reason: 'a isca passou: a igualdade de conjunto nao enxerga uma '
            'terceira tela oferecendo adicionar.',
      );
      // E a expressao reconhece a CHAMADA, e nao so o nome do metodo: este e o
      // texto que uma tela nova escreveria.
      expect(
        _chamaAPorta.hasMatch('await conexoes.pedirPorApelido(apelido: p.handle)'),
        isTrue,
        reason: 'a isca passou: a expressao nao casa uma chamada de verdade, '
            'entao o caso de cima nao mede nada.',
      );
      expect(
        _chamaAPorta.hasMatch('await conexoes.pedir(tokenDoConvite: t)'),
        isTrue,
        reason: 'a isca passou: a expressao nao casa a porta do CONVITE.',
      );
    });

    /// **UM BOTAO QUE SO NAVEGA NAO E PORTA DE PEDIR CONEXAO**, e este caso e a
    /// fronteira que a emenda de 27/10/2026 criou.
    ///
    /// Sem ele, o caso de cima continuaria verde e ninguem saberia **por que**:
    /// `Minhas conexoes` tem botao de adicionar desde 27/10 e nao esta em
    /// [asDuasPortas], e isso parece contradicao em vez de decisao. Este caso
    /// afirma as duas metades -- o botao EXISTE, e ele nao abre aresta.
    test('um botao que so NAVEGA nao e porta de pedir conexao', () {
      final String raiz = raizDoPacoteDoApp();
      final io.File lista = io.File(
        '$raiz/lib/telas/conexoes/tela_minhas_conexoes.dart',
      );
      if (!lista.existsSync()) {
        fail(
          'REPROVA: nao achei "${lista.path}". Este caso mede aquela tela, e '
          'sem o arquivo ele nao mede nada.',
        );
      }
      final String fonte = lista.readAsStringSync();

      // CONTROLE POSITIVO, e ele vem primeiro: o botao de adicionar EXISTE
      // naquela tela. Sem esta metade o caso ficaria verde no dia em que o
      // botao fosse removido -- e ai estaria medindo a ausencia que o cliente
      // cobrou em 22/10, e chamando isso de aprovacao.
      expect(
        fonte.contains('redeNaBuscaDePessoas'),
        isTrue,
        reason: 'REPROVA: `tela_minhas_conexoes.dart` nao leva mais a busca de '
            'pessoas. O pedido dele de 22/10/2026 era *"uma pagina com a '
            'listagem dos usuarios E um botao para adicionar"*, e o botao e '
            'essa porta -- ele saiu em 27/10. Se ele mudou de destino, mude '
            'este caso no mesmo diff e diga para onde.',
      );

      // E ela continua FORA da contagem, porque navegar nao e abrir aresta.
      expect(
        _quemChamaAPorta().contains('telas/conexoes/tela_minhas_conexoes.dart'),
        isFalse,
        reason: 'REPROVA: `Minhas conexoes` passou a CHAMAR a porta de pedir '
            'conexao. Ela e uma lista de quem JA e conexao: um pedido partindo '
            'dali seria o controle errado exatamente para quem o cliente '
            'cobrou tres vezes. Se isso e deliberado, ela precisa dos quatro '
            'ramos por estado e entra em `asDuasPortas` no mesmo diff.',
      );
    });

    /// **`aceitar` e `encerrar` NAO sao "adicionar", e este caso guarda a
    /// fronteira.** Sem ele, alguem "consertaria" a expressao para pegar as
    /// quatro operacoes, a caixa de pedidos entraria na lista, e o portao
    /// passaria a reprovar telas que estao certas.
    test('a expressao NAO confunde aceitar e desfazer com adicionar', () {
      expect(_chamaAPorta.hasMatch('conexoes.aceitar(ref)'), isFalse);
      expect(_chamaAPorta.hasMatch('conexoes.encerrar(ref)'), isFalse);
      // CONTROLE POSITIVO: os dois arquivos que de fato chamam `aceitar`
      // continuam fora da lista das duas portas -- e eles existem.
      final List<String> aceitam = <String>[];
      for (final io.File arquivo in _dartsDeTelasEWidgets()) {
        if (arquivo.readAsStringSync().contains('.aceitar(')) {
          aceitam.add(_relativo(arquivo));
        }
      }
      expect(
        aceitam,
        isNotEmpty,
        reason: 'REPROVA: nenhum arquivo chama `aceitar`. O caso acima nao '
            'prova que a expressao distingue as operacoes -- prova que nao ha '
            'o que distinguir.',
      );
      for (final String caminho in aceitam) {
        if (asDuasPortas.contains(caminho)) continue;
        expect(
          _quemChamaAPorta().contains(caminho),
          isFalse,
          reason: 'REPROVA: `$caminho` aceita conexao e foi contado como porta '
              'de PEDIR. A caixa de pedidos age sobre aresta que ja existe.',
        );
      }
    });
  });
}
