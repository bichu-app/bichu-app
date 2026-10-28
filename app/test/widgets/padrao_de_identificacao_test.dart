// **O PORTAO DO PADRAO DE IDENTIFICACAO.**
//
// O cliente pediu um PADRAO, e o pediu cinco vezes. Em 22/10/2026: *"em todos
// os lugares que mostra o titulo/nome do usuario tem que tornar padrao mostrar
// o selo e a foto dele"*. Em 26/10/2026, depois de quatro telas consertadas uma
// a uma:
//
// > "ja pedi pra voce tornar isso padrao, sempre trazer a imagem, o titulo/nome
// > do usuario e o selo juntos, toda vez que aparecer na listagem e voce
// > continua me ignorando"
//
// **O QUE FALHOU NAS QUATRO VEZES ANTERIORES NAO FOI O CONSERTO.** Cada tela
// foi arrumada e a seguinte nasceu errada, porque a regra vivia em prosa de
// cabecalho — e prosa nao reprova nada. Este arquivo e a regra com portao.
//
// ## POR QUE ELE NAO CONFERE UMA LISTA DE TELAS
//
// Uma lista de telas conhecidas envelhece, e o problema e exatamente a tela
// NOVA: ela nao estaria na lista, e passaria. Entao o portao nao e keyed na
// TELA, e keyed no **DADO**: ele parte dos acessores que carregam nome de
// usuario e procura cada um deles sendo desenhado, onde quer que esteja.
//
// **Nenhuma tela nova pode mostrar nome de usuario sem passar por um desses
// acessores** — nao existe outro caminho para o nome de uma pessoa entrar no
// app, porque o nome vem do contrato pela chave `display_name`. E e por isso
// que isto e estrutural e nao uma lista.
//
// **E o proprio registro de acessores tem portao** (`ISCA DA ISCA: o registro
// de acessores nao envelhece`): ele e re-derivado da camada de modelos a cada
// execucao, e reprova se um leitor novo de `display_name` aparecer sem entrar
// no registro. Sem essa metade, o registro seria a lista que envelhece, um
// nivel abaixo.
//
// ## O QUE ESTE PORTAO **NAO** PEGA — leia antes de confiar nele
//
// 1. **nome que chega a um widget PROPRIO do projeto, e nao a um `Text`.** A
//    tela da conversa faz `TituloDaConversa(nome: nomeNoTitulo)`, e a regra P1
//    nao ve isso. A regra **P2** foi escrita para esse caminho e e mais larga —
//    mas ela tem pendencias declaradas (ver `_pendencias`), e enquanto elas
//    existirem ela nao e uma rede fechada;
// 2. **nome que atravessa funcao ou arquivo.** A contaminacao e medida DENTRO de
//    um arquivo e por atribuicao direta (`final x = pessoa.nomeParaLer`). Um
//    nome passado como `String` para um metodo de outra classe sai do alcance;
// 3. **nome montado por interpolacao** (`'Perfil de ${p.nomeParaLer}'`) **nao e
//    reprovado, de proposito**: rotulo acessivel e frase de botao PRECISAM do
//    nome em texto, e reprova-los faria o portao exigir o errado. A consequencia
//    honesta e que quem quiser burlar o portao consegue, escrevendo
//    `Text('${p.nomeParaLer}')`. **Isto nao e descuido, e um limite escolhido**:
//    ver `ISCA: a interpolacao e a porta que fica aberta`, que mede e documenta
//    o buraco em vez de deixa-lo implicito;
// 4. **ele nao confere PIXEL.** Que a foto apareca na tela montada e assunto dos
//    casos de widget deste arquivo, nao da varredura de fonte;
// 5. **ele nao sabe se o contrato TEM o campo.** Onde `urlDaFoto` e nula porque
//    `BlockedPerson` nao traz foto, o portao aprova — e tem de aprovar, senao
//    viraria impedimento para toda conta sem foto. Que a nulidade seja do
//    CONTRATO e nao de preguica da tela e julgamento de quem revisa.
//
// ## PESSOA E PET SAO DOIS PORTOES, E A SEPARACAO E MEDIDA
//
// O cliente estendeu o padrao em 26/10/2026: *"Isso serve tambem para o pets,
// sempre ter foto, nome do pet"*. As duas regras **nao sao a mesma**:
//
// | | pessoa | pet |
// |---|---|---|
// | chave do contrato | `display_name` | `pet_display_name` |
// | o que vai junto | foto + nome + **selo** | foto + nome |
// | selo | `contact_channel_verified` | **nao existe distintivo de pet** |
//
// Sao duas chaves de contrato diferentes, dois conjuntos de acessores e duas
// regras de conteudo. Um portao so teria de ramificar por tipo em cada passo, e
// o ramo errado passaria calado. Ver `padrao_de_identificacao_de_pet_test.dart`.

import 'dart:io' as io;

import 'package:bichu/widgets/ficha_da_pessoa.dart';
import 'package:bichu/widgets/marca_da_pessoa.dart';
import 'package:bichu/theme/bichu_theme.dart';
import 'package:bichu/widgets/selo_de_validado.dart';
import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';

/// **OS ACESSORES QUE CARREGAM NOME DE USUARIO.**
///
/// Nao e uma lista de telas: e a lista dos campos e getters pelos quais o nome
/// de uma pessoa entra na camada de desenho. `ISCA DA ISCA: o registro de
/// acessores nao envelhece` re-deriva isto da camada de modelos e reprova se
/// ficar incompleto.
const List<String> acessoresDeNomeDePessoa = <String>[
  // O getter que cai para `@apelido` — `PerfilDePessoa`, `PessoaEncontrada`,
  // `PessoaConectada`, `PessoaDaConexao`, `PessoaBloqueada`.
  'nomeParaLer',
  // `AutorDaPublicacao` — publicacao e comentario do Mural.
  'nomeExibido',
  // O campo cru, em `ParticipanteDaConversa`, `PessoaBloqueada`,
  // `PessoaDaConexao`, `PessoaConectada`, `PessoaEncontrada`, `PerfilDePessoa`.
  'displayName',
];

/// Os widgets de texto CRU: desenham a cadeia que recebem e nada mais.
const List<String> widgetsDeTextoCru = <String>['Text', 'SelectableText'];

/// **OS SUMIDOUROS APROVADOS**: o padrao, e o componente que ele compoe.
///
/// `NomeComSelo` continua aprovado porque ele JA resolve nome + selo e o Mural o
/// usa dentro de um cartao que desenha a foto por fora. O que o portao recusa e
/// o nome indo para texto cru — nao a composicao.
const List<String> sumidourosAprovados = <String>['FichaDaPessoa', 'NomeComSelo'];

/// **CAMPOS QUE LEEM `display_name` E FICAM FORA DO REGISTRO, com o motivo.**
///
/// A derivacao da `ISCA DA ISCA: o registro de acessores nao envelhece` acha
/// TODO campo alimentado por uma chave `display_name`, e dois deles nao sao
/// nome de pessoa de terceiro numa listagem. Eles ficam de fora **aqui, por
/// escrito**, e nao por um filtro escondido na expressao regular: um filtro
/// calado e o jeito de a derivacao mentir sem ninguem notar.
const Map<String, String> _foraDoRegistroDePessoa = <String, String>{
  // `Usuario.nome` e o nome do DONO da sessao, e nao de um terceiro numa
  // listagem. As superficies do dono (`Meus dados`, a barra de topo) tem selo e
  // foto proprios — o selo do dono pousa SOBRE a foto, com anel de superficie,
  // e e outro desenho. Alem disso `nome` e identificador generico demais para
  // contaminar: taxa-lo faria toda variavel chamada `nome` no app virar alvo,
  // inclusive nome de pet e nome de loja.
  'nome': 'DONO DA SESSAO (`Usuario.nome`), nao terceiro em listagem. Tem selo e '
      'foto proprios em `Meus dados`, com desenho diferente (o selo pousa sobre a '
      'foto). E `nome` e generico demais para contaminar sem falso positivo.',
  // `TagResolvida.nomeDoPet` le `pet['display_name']` — e um PET, nao uma
  // pessoa, e a chave e `display_name` so porque ela esta DENTRO do objeto
  // `pet`. Ele e assunto do portao de pet.
  'nomeDoPet': 'E NOME DE PET (`pet[\'display_name\']` dentro de `TagResolvida`), '
      'e nao de pessoa. A regra de pet e foto + nome SEM selo, e ela tem portao '
      'proprio em `padrao_de_identificacao_de_pet_test.dart`.',
};

/// **PENDENCIAS DECLARADAS — e esta NAO e a lista de telas conhecidas.**
///
/// A diferenca e o sinal: uma lista de telas conhecidas diz *"estas estao
/// certas, aprove-as"* e abençoa o que ela contem. Esta diz *"estas estao
/// ERRADAS e esperam decisao"*, e por isso:
///
/// - **ela nao aprova tela nova nenhuma.** Uma tela nova nao esta aqui e
///   reprova;
/// - **ela encolhe e nao cresce.** `ISCA DA ISCA: pendencia que deixou de
///   violar REPROVA` reprova quando um arquivo daqui para de violar sem sair
///   daqui, entao ela nao pode virar sedimento;
/// - **cada entrada carrega o motivo e a decisao que falta**, e nenhuma delas e
///   decisao do squad.
const Map<String, String> _pendencias = <String, String>{
  // **MENSAGENS NAO ESTA AQUI, E A AUSENCIA FOI MEDIDA E NAO ESCOLHIDA.**
  //
  // Ela esteve nesta lista na primeira versao deste arquivo, e
  // `ISCA DA ISCA: pendencia que deixou de violar REPROVA` a derrubou: os dois
  // arquivos de mensagens **nao violam nem P1 nem P2**, porque o nome passa por
  // DUAS atribuicoes (`displayName` → `nomeDoOutro` → `nomeNoTitulo`) antes de
  // chegar a `TituloDaConversa(nome: ...)`, e a contaminacao deste portao nao e
  // transitiva. **Entao o portao nao cobre mensagens**, e dizer isso e mais
  // honesto do que declarar uma pendencia que o proprio portao desmente. Esta
  // e a limitacao 2 do cabecalho, e ela esta aberta.
  //
  // A foto JA esta no contrato e JA esta no modelo (`PessoaEncontrada
  // .photoIconUrl`, emenda do cliente de 21/10/2026: *"o resultado tras foto
  // sim, para identificar usuarios com nomes parecidos"*) e a tela NAO a
  // desenha: ela pinta um circulo de inicial escrito a mao. O conserto e de uma
  // chamada, mas outra frente esta neste arquivo agora (botao de conexao na
  // busca) e dois agentes no mesmo arquivo foi o que custou resgate antes.
  'lib/telas/rede/cartao_de_pessoa_encontrada.dart':
      'COORDENACAO: outra frente esta neste arquivo (botao de conexao na '
      'busca). A foto existe no contrato e no modelo desde 21/10/2026 e a tela '
      'nao a desenha. Nao e decisao pendente: e ordem de trabalho.',
};

void main() {
  group('O PADRAO DE IDENTIFICACAO DE PESSOA', () {
    test('CONTROLE POSITIVO: a varredura ENXERGA os arquivos do app', () {
      // Sem esta metade todo o resto deste arquivo poderia estar varrendo zero
      // arquivos e saindo verde. Oito de doze portoes deste projeto ja sairam
      // com zero bytes; este caso existe para que este nao seja o nono.
      final List<String> arquivos = _dartsDaPasta('lib');
      expect(
        arquivos.length,
        greaterThan(150),
        reason:
            'REPROVA: a varredura achou ${arquivos.length} arquivos .dart em lib/, e a '
            'base tinha 222. Portao que varre pouco e portao que aprova no vazio.',
      );
      // E ela enxerga, pelo nome, os arquivos que importam.
      for (final String esperado in <String>[
        'lib/widgets/ficha_da_pessoa.dart',
        'lib/telas/seguranca/tela_de_bloqueados.dart',
        'lib/telas/mural/tela_do_mural.dart',
      ]) {
        expect(
          arquivos,
          contains(esperado),
          reason: 'REPROVA: a varredura nao enxergou "$esperado".',
        );
      }
    });

    test('CONTROLE POSITIVO: a varredura ACHA nome de usuario onde ele existe', () {
      // A asserção negativa de P1 passa no vazio se o detector nao detectar
      // nada. Aqui ele e apontado para codigo que TEM nome de usuario e tem de
      // achar.
      final String fonte = _semProsa(_ler('lib/telas/mural/tela_do_mural.dart'));
      expect(
        _contaminados(fonte).isNotEmpty || fonte.contains('.nomeExibido'),
        isTrue,
        reason:
            'REPROVA: o detector nao achou acessor de nome em tela_do_mural.dart, '
            'que desenha o nome do autor de toda publicacao. O detector esta cego, '
            'e um detector cego faz P1 aprovar o app inteiro.',
      );
    });

    test('P1 — ISCA: nome de usuario NUNCA vai para widget de texto cru', () {
      final List<String> violacoes = <String>[];
      for (final String relativo in _dartsDaPasta('lib')) {
        // O proprio padrao e o unico lugar onde o nome PODE ir para um `Text`:
        // e ele que desenha o nome.
        if (relativo == 'lib/widgets/ficha_da_pessoa.dart') continue;
        if (relativo == 'lib/widgets/selo_de_validado.dart') continue;
        violacoes.addAll(_violacoesDeTextoCru(relativo));
      }
      final List<String> naoDeclaradas = violacoes
          .where((String v) => !_pendencias.keys.any(v.startsWith))
          .toList();
      expect(
        naoDeclaradas,
        isEmpty,
        reason:
            'REPROVA — nome de usuario desenhado FORA do padrao:\n'
            '${naoDeclaradas.join('\n')}\n\n'
            'O cliente pediu, cinco vezes, que foto + nome + selo apareçam JUNTOS '
            'toda vez que um nome de usuario aparece numa listagem. Use '
            '`FichaDaPessoa`, que exige os tres como parametros obrigatorios. Se a '
            'foto nao puder sair nesta superficie, passe `urlDaFoto: null` — o '
            'widget desenha a inicial, que e o recurso que a emenda 3 do ADR-0010 '
            'nomeia, e o lugar da foto continua existindo.',
      );
    });

    test('P2 — ISCA: nome de usuario em widget proprio tambem passa pelo padrao', () {
      // P1 so ve `Text(`. Este ve o nome indo como ARGUMENTO NOMEADO para
      // qualquer construtor que nao seja um sumidouro aprovado — que e o caminho
      // de `TituloDaConversa(nome: ...)`.
      final List<String> violacoes = <String>[];
      for (final String relativo in _dartsDaPasta('lib')) {
        if (relativo == 'lib/widgets/ficha_da_pessoa.dart') continue;
        violacoes.addAll(_violacoesDeArgumentoNomeado(relativo));
      }
      final List<String> naoDeclaradas = violacoes
          .where((String v) => !_pendencias.keys.any(v.startsWith))
          .toList();
      expect(
        naoDeclaradas,
        isEmpty,
        reason:
            'REPROVA — nome de usuario entregue a um widget que nao e o padrao:\n'
            '${naoDeclaradas.join('\n')}\n\n'
            'Um widget proprio que recebe o nome desenha o nome, e desenhar o nome '
            'sem a foto e sem o selo e exatamente o que o cliente cobrou cinco '
            'vezes. Passe pelo `FichaDaPessoa` ou declare a pendencia com o motivo '
            'e a decisao que falta.',
      );
    });

    test('P3 — ISCA: os tres parametros do padrao continuam OBRIGATORIOS', () {
      // **E o compilador que garante "os tres juntos", e nao uma varredura.**
      // Se um dia `comSelo` ganhar `= false` ou `urlDaFoto` ganhar `= null`, o
      // selo e a foto voltam a cair fora por OMISSAO — que e como cairam nas
      // quatro vezes anteriores — e nenhuma chamada existente quebra, entao
      // ninguem descobre.
      final String fonte = _semProsa(_ler('lib/widgets/ficha_da_pessoa.dart'));
      for (final String campo in <String>['nome', 'urlDaFoto', 'comSelo']) {
        expect(
          fonte.contains(RegExp('required this\\.$campo,')),
          isTrue,
          reason:
              'REPROVA: `FichaDaPessoa.$campo` deixou de ser `required`. E o '
              '`required` que faz o COMPILADOR exigir que toda superficie nova '
              'responda sobre foto, nome e selo. Com valor padrao, o parametro '
              'volta a poder ser omitido em silencio.',
        );
      }
      // E nenhum dos tres pode ter valor padrao.
      for (final String proibido in <String>[
        'this.comSelo = ',
        'this.urlDaFoto = ',
        'this.nome = ',
      ]) {
        expect(
          fonte.contains(proibido),
          isFalse,
          reason: 'REPROVA: `FichaDaPessoa` ganhou valor padrao em `$proibido`.',
        );
      }
    });

    test('ISCA DA ISCA: o registro de acessores nao envelhece', () {
      // **Esta e a metade que impede o portao de virar lista.** O registro e
      // re-derivado da camada de modelos: todo campo alimentado pela chave
      // `display_name` do contrato tem de estar em `acessoresDeNomeDePessoa`.
      // Um modelo novo com nome de pessoa reprova aqui ANTES de alguem desenhar
      // a tela dele.
      final List<String> fora = <String>[];
      var lidos = 0;
      for (final String relativo in _dartsDaPasta('lib/api')) {
        final String fonte = _semProsa(_ler(relativo));
        for (final RegExpMatch m in RegExp(
          // `campo: json['display_name']` e `campo: bruto['display_name']`.
          r'([A-Za-z_]\w*)\s*:\s*\w+\[.(?:display_name).\]',
        ).allMatches(fonte)) {
          lidos++;
          final String campo = m.group(1)!;
          if (acessoresDeNomeDePessoa.contains(campo)) continue;
          // A excecao tem de estar DECLARADA COM MOTIVO neste arquivo.
          if (_foraDoRegistroDePessoa.containsKey(campo)) continue;
          fora.add('$relativo → `$campo`');
        }
      }
      // CONTROLE POSITIVO da propria derivacao: se ela achar zero leitores, ela
      // esta quebrada e o `fora` vazio nao significa nada.
      expect(
        lidos,
        greaterThanOrEqualTo(6),
        reason:
            'REPROVA: a derivacao achou $lidos leitores de `display_name` na camada de '
            'modelos, e a base tinha 7. A derivacao esta quebrada, e com ela quebrada '
            'este caso aprova qualquer registro.',
      );
      expect(
        fora,
        isEmpty,
        reason:
            'REPROVA — campo novo alimentado por `display_name` fora do registro:\n'
            '${fora.join('\n')}\n\n'
            'Acrescente-o a `acessoresDeNomeDePessoa` neste arquivo. Sem isso o '
            'portao fica cego para o nome que entra por esse campo, e a proxima tela '
            'que o use nasce errada — que e o defeito que este arquivo existe para '
            'impedir.',
      );
    });

    test('ISCA DA ISCA: pendencia que deixou de violar REPROVA', () {
      // Sem este caso, `_pendencias` viraria sedimento: um arquivo consertado
      // continuaria declarado, e a declaracao passaria a abençoar silenciosamente
      // qualquer violacao FUTURA naquele arquivo.
      for (final String relativo in _pendencias.keys) {
        final bool aindaViola =
            _violacoesDeTextoCru(relativo).isNotEmpty ||
            _violacoesDeArgumentoNomeado(relativo).isNotEmpty;
        expect(
          aindaViola,
          isTrue,
          reason:
              'REPROVA: "$relativo" esta declarado como pendencia e NAO viola mais nada. '
              'Tire-o de `_pendencias`. Uma pendencia que nao viola e uma dispensa em '
              'branco para a proxima violacao naquele arquivo.',
        );
      }
    });

    test('ISCA DA ISCA: toda excecao do registro carrega MOTIVO', () {
      // Uma excecao sem motivo escrito e um filtro escondido com outro nome.
      for (final MapEntry<String, String> e in _foraDoRegistroDePessoa.entries) {
        expect(
          e.value.length,
          greaterThan(40),
          reason:
              'REPROVA: a excecao de `${e.key}` nao explica por que aquele campo nao e '
              'nome de pessoa em listagem. Sem motivo, a derivacao mente sem ninguem '
              'notar — que e o defeito que ela existe para nao ter.',
        );
      }
    });

    test('ISCA DA ISCA: toda pendencia carrega MOTIVO', () {
      for (final MapEntry<String, String> e in _pendencias.entries) {
        expect(
          e.value.length,
          greaterThan(40),
          reason:
              'REPROVA: a pendencia de "${e.key}" nao explica por que ela existe nem que '
              'decisao falta. Pendencia sem motivo e a lista de telas conhecidas com '
              'outro nome.',
        );
      }
    });

    test('ISCA DA ISCA: a varredura REPROVA uma superficie nova inventada', () {
      // **A ISCA QUE MAIS IMPORTA, na forma de unidade.** Ela mede o detector
      // contra uma tela que nao existe no disco, e por isso nao depende de
      // nenhum arquivo continuar errado. A metade de disco esta na isca
      // homonima, que cria o arquivo de verdade.
      const String telaNova = '''
import 'package:flutter/material.dart';
class TelaNovaQualquer extends StatelessWidget {
  const TelaNovaQualquer({required this.pessoa, super.key});
  final PessoaQualquer pessoa;
  @override
  Widget build(BuildContext context) {
    final nome = pessoa.nomeParaLer;
    return Column(children: <Widget>[
      Text(nome),
      Text(pessoa.nomeExibido),
    ]);
  }
}
''';
      final List<String> achadas = _violacoesEm('lib/telas/inventada.dart', telaNova);
      expect(
        achadas.length,
        greaterThanOrEqualTo(2),
        reason:
            'REPROVA: o detector achou ${achadas.length} violacoes numa tela que desenha '
            'DOIS nomes de usuario em `Text` cru. Ele esta cego, e cego ele aprova a '
            'proxima tela.',
      );
      expect(achadas.first, startsWith('lib/telas/inventada.dart'));
    });

    test('ISCA DA ISCA: P2 REPROVA nome entregue a widget proprio', () {
      // **Sem este caso, P2 seria um GUARDA e nao um portao**: ele acha zero
      // violacoes no app de hoje, e mecanismo que nenhuma isca derruba nao
      // provou que mede. Aqui ele e apontado para o caminho que ele existe para
      // pegar — o nome indo para um construtor proprio em vez de `Text`.
      const String comWidgetProprio = '''
import 'package:flutter/material.dart';
class X extends StatelessWidget {
  const X({required this.pessoa, super.key});
  final PessoaQualquer pessoa;
  @override
  Widget build(BuildContext context) => TituloInventado(nome: pessoa.nomeParaLer);
}
''';
      final List<String> achadas = _violacoesDeArgumentoNomeadoEm(
        'lib/telas/proprio.dart',
        comWidgetProprio,
      );
      expect(
        achadas,
        isNotEmpty,
        reason:
            'REPROVA: P2 nao achou `TituloInventado(nome: pessoa.nomeParaLer)`. Ele e o '
            'unico mecanismo deste arquivo que olha o caminho de widget proprio, e cego '
            'ele nao mede nada.',
      );
      expect(achadas.first, startsWith('lib/telas/proprio.dart'));
    });

    test('CONTRAPESO de P2: o SUMIDOURO APROVADO nao e reprovado', () {
      // A outra metade: P2 reprovando `FichaDaPessoa(nome: ...)` tornaria o
      // padrao impossivel de usar, e o portao viraria impedimento.
      const String comOPadrao = '''
import 'package:flutter/material.dart';
class X extends StatelessWidget {
  const X({required this.pessoa, super.key});
  final PessoaQualquer pessoa;
  @override
  Widget build(BuildContext context) => FichaDaPessoa(
        nome: pessoa.nomeParaLer,
        urlDaFoto: null,
        comSelo: false,
      );
}
''';
      expect(
        _violacoesDeArgumentoNomeadoEm('lib/telas/ok.dart', comOPadrao),
        isEmpty,
        reason:
            'REPROVA: P2 reprovou o PROPRIO padrao. Com isso nao haveria forma de '
            'atender a regra, e o portao seria impedimento em vez de portao.',
      );
    });

    test('ISCA: a interpolacao e a porta que fica aberta', () {
      // **Este caso documenta um BURACO, e nao uma garantia.** Ele existe para
      // que o buraco seja medido e nao descoberto: `Text('${p.nomeParaLer}')`
      // atravessa o portao. Deixar isso implicito seria vender uma rede fechada
      // que nao existe.
      const String comInterpolacao = r'''
import 'package:flutter/material.dart';
Widget x(p) => Text('${p.nomeParaLer}');
''';
      expect(
        _violacoesEm('lib/telas/interpolada.dart', comInterpolacao),
        isEmpty,
        reason:
            'Se este caso passar a REPROVAR, o portao ficou mais forte do que o '
            'cabecalho afirma — e o cabecalho precisa ser corrigido junto, porque ele '
            'lista a interpolacao como limite conhecido.',
      );
    });

    test('ISCA DA ISCA: `_semProsa` apaga comentario e PRESERVA codigo', () {
      // Sem este caso, um apagador quebrado faria toda varredura deste arquivo
      // passar no vazio.
      const String amostra = '''
final nome = pessoa.nomeParaLer;
// este comentario cita pessoa.nomeParaLer e Text(nome)
/// e este tambem: displayName
final String url = 'http://exemplo/nao-e-comentario';
''';
      final String limpo = _semProsa(amostra);
      expect(limpo, contains('final nome = pessoa.nomeParaLer;'));
      expect('\n$limpo'.contains('\n// este comentario'), isFalse);
      expect(limpo.contains('displayName'), isFalse);
      expect(limpo, contains("'http://exemplo/nao-e-comentario'"));
    });
  });

  group('O PADRAO DESENHADO: foto, nome e selo juntos', () {
    testWidgets('CONTROLE POSITIVO: com foto, com nome e com selo, os tres aparecem', (
      tester,
    ) async {
      await _montar(
        tester,
        const FichaDaPessoa(
          nome: 'Marina Souza',
          urlDaFoto: 'https://exemplo/thumb/marina.jpg',
          comSelo: true,
        ),
      );
      expect(find.byType(MarcaDaPessoa), findsOneWidget);
      expect(find.text('Marina Souza'), findsOneWidget);
      expect(find.byType(SeloDeValidado), findsOneWidget);
    });

    testWidgets('CONTROLE POSITIVO: SEM foto cai na INICIAL e NAO reprova', (tester) async {
      // **A metade que impede o portao de virar impedimento para conta sem
      // foto.** O que o cliente pediu e que o LUGAR da foto exista sempre, e nao
      // que exista foto onde ela nao pode existir. Com `urlDaFoto: null` tem de
      // haver avatar — a inicial — e nao um vao nem um erro.
      await _montar(
        tester,
        const FichaDaPessoa(nome: 'Marina Souza', urlDaFoto: null, comSelo: true),
      );
      // O avatar EXISTE, ancorado no widget e nao na ausencia de texto: asserção
      // negativa passa no vazio.
      expect(find.byType(MarcaDaPessoa), findsOneWidget);
      // E ele desenha a INICIAL de quem nao tem foto.
      expect(find.text('M'), findsOneWidget);
      expect(find.text('Marina Souza'), findsOneWidget);
      expect(find.byType(SeloDeValidado), findsOneWidget);
      // E nao houve nenhuma imagem de rede: a inicial nao e uma foto quebrada.
      expect(find.byType(Image), findsNothing);
    });

    testWidgets('ISCA: sem canal confirmado o selo NAO nasce — e nao nasce apagado', (
      tester,
    ) async {
      await _montar(
        tester,
        const FichaDaPessoa(nome: 'Marina Souza', urlDaFoto: null, comSelo: false),
      );
      expect(find.byType(MarcaDaPessoa), findsOneWidget);
      expect(find.text('Marina Souza'), findsOneWidget);
      expect(find.byType(SeloDeValidado), findsNothing);
    });

    testWidgets('ISCA: numa LISTA, cada foto e a DAQUELA pessoa', (tester) async {
      // O defeito que este caso mede e concreto e comum: o item da lista
      // desenhar sempre a mesma foto (a do primeiro, a do ultimo, ou a de um
      // campo lido fora do laco). Um caso que montasse UMA ficha nunca pegaria
      // isso.
      await _montar(
        tester,
        const Column(
          mainAxisSize: MainAxisSize.min,
          children: <Widget>[
            FichaDaPessoa(
              nome: 'Ana',
              urlDaFoto: 'https://exemplo/thumb/ana.jpg',
              comSelo: true,
            ),
            FichaDaPessoa(
              nome: 'Bruno',
              urlDaFoto: 'https://exemplo/thumb/bruno.jpg',
              comSelo: false,
            ),
            FichaDaPessoa(nome: 'Carla', urlDaFoto: null, comSelo: true),
          ],
        ),
      );
      final List<MarcaDaPessoa> marcas = tester
          .widgetList<MarcaDaPessoa>(find.byType(MarcaDaPessoa))
          .toList();
      expect(marcas.length, 3);
      // As TRES urls sao distintas, e a terceira e nula — e cada uma esta na
      // linha da sua pessoa.
      expect(marcas[0].urlDoIcone, 'https://exemplo/thumb/ana.jpg');
      expect(marcas[1].urlDoIcone, 'https://exemplo/thumb/bruno.jpg');
      expect(marcas[2].urlDoIcone, isNull);
      // E a inicial acompanha o nome da LINHA, e nao um nome lido de fora.
      expect(marcas[0].inicial, 'A');
      expect(marcas[1].inicial, 'B');
      expect(marcas[2].inicial, 'C');
      // O selo segue o booleano de CADA UMA: duas com, uma sem.
      expect(find.byType(SeloDeValidado), findsNWidgets(2));
    });
  });
}

Future<void> _montar(WidgetTester tester, Widget alvo) async {
  await tester.pumpWidget(
    MaterialApp(
      // `BichuTheme.claro` e obrigatorio: `BichuColors.of` falha com a mensagem
      // *"BichuColors nao esta no ThemeData"* sem ele, e e dele que saem as cores
      // do circulo da inicial.
      theme: BichuTheme.claro,
      home: Scaffold(
        // `Align` no topo e `mainAxisSize.min` na coluna de dentro: sem os dois
        // a `Row` do `FichaDaPessoa` recebe altura sem limite e o teste reprova
        // por transbordo de layout em vez de pelo que ele mede.
        body: Align(
          alignment: Alignment.topLeft,
          child: SizedBox(width: 375, child: alvo),
        ),
      ),
    ),
  );
  await tester.pump();
}

/// Os nomes das variaveis locais que receberam um acessor de nome de usuario.
Set<String> _contaminados(String fonte) {
  final Set<String> sujas = <String>{};
  for (final String linha in fonte.split('\n')) {
    for (final String a in acessoresDeNomeDePessoa) {
      final RegExpMatch? m = RegExp(
        '(?:final|var|const)\\s+(?:[A-Za-z_][\\w<>?,\\s]*\\s+)?([A-Za-z_]\\w*)\\s*=.*\\.$a\\b',
      ).firstMatch(linha);
      if (m != null) sujas.add(m.group(1)!);
    }
  }
  return sujas;
}

List<String> _alvos(String fonte) {
  return <String>[
    ...acessoresDeNomeDePessoa.map((String a) => '\\.$a\\b'),
    ..._contaminados(fonte).map((String v) => '(?<![\\w.\'"])$v\\b'),
  ];
}

List<String> _violacoesDeTextoCru(String relativo) =>
    _violacoesEm(relativo, _ler(relativo));

/// A varredura de P1 sobre uma fonte qualquer — e e isto que as iscas de
/// detector exercitam sem tocar no disco.
List<String> _violacoesEm(String relativo, String bruto) {
  final String fonte = _semProsa(bruto);
  final List<String> linhas = fonte.split('\n');
  final String alvos = _alvos(fonte).join('|');
  if (alvos.isEmpty) return <String>[];
  final RegExp deAlvo = RegExp(alvos);
  final List<String> achadas = <String>[];
  for (int i = 0; i < linhas.length; i++) {
    for (final String s in widgetsDeTextoCru) {
      // O PRIMEIRO ARGUMENTO, inteiro: `Text(pessoa.nomeExibido)` tem o acessor
      // depois de `pessoa.`, e nao logo depois do parentese. Uma regra ancorada
      // no parentese pegaria `Text(nome)` e deixaria passar `Text(p.nomeParaLer)`
      // — que foi exatamente o que ela fez na primeira versao deste arquivo.
      final RegExpMatch? m = RegExp(
        '(?<![\\w.])$s\\s*\\(\\s*([^,)\\n]*)',
      ).firstMatch(linhas[i]);
      if (m != null) {
        final String primeiro = m.group(1)!.trim();
        // Cadeia literal nao e reprovada: ver `ISCA: a interpolacao e a porta
        // que fica aberta`, que mede este limite de proposito.
        final bool ehLiteral = primeiro.startsWith("'") || primeiro.startsWith('"');
        if (!ehLiteral && deAlvo.hasMatch(primeiro)) {
          achadas.add('$relativo:${i + 1}: ${linhas[i].trim()}');
          continue;
        }
      }
      // O construtor abre e o argumento vem na linha seguinte — que e como o
      // formatador desta casa quebra a chamada quando ela tem `style:`.
      if (RegExp('(?<![\\w.])$s\\s*\\(\\s*\$').hasMatch(linhas[i]) && i + 1 < linhas.length) {
        final String prox = linhas[i + 1].trim();
        final bool ehLiteral = prox.startsWith("'") || prox.startsWith('"');
        if (!ehLiteral && RegExp('^[^,)]*\$').hasMatch(prox.replaceAll(',', '')) &&
            deAlvo.hasMatch(prox)) {
          achadas.add('$relativo:${i + 2}: $prox');
        }
      }
    }
  }
  return achadas;
}

/// A varredura de P2: o nome entregue como argumento nomeado a um construtor
/// que nao e sumidouro aprovado.
List<String> _violacoesDeArgumentoNomeado(String relativo) =>
    _violacoesDeArgumentoNomeadoEm(relativo, _ler(relativo));

List<String> _violacoesDeArgumentoNomeadoEm(String relativo, String bruto) {
  final String fonte = _semProsa(bruto);
  final List<String> linhas = fonte.split('\n');
  final List<String> achadas = <String>[];
  final String alvos = _alvos(fonte).join('|');
  if (alvos.isEmpty) return <String>[];
  final RegExp deAlvo = RegExp(alvos);
  for (int i = 0; i < linhas.length; i++) {
    // **CAPTURA O VALOR E TESTA O VALOR**, em vez de ancorar o alvo logo depois
    // dos dois-pontos: `nome: pessoa.nomeParaLer` tem o acessor depois de
    // `pessoa.`, e a versao ancorada nao o achava. Foi o MESMO defeito que P1
    // teve, e foi `ISCA DA ISCA: P2 REPROVA nome entregue a widget proprio` que
    // o pegou — sem ela, P2 teria ficado verde para sempre sem medir nada.
    final RegExpMatch? m = RegExp(
      r'([A-Z]\w*)\s*\(',
    ).firstMatch(linhas[i]);
    if (m == null) continue;
    if (sumidourosAprovados.contains(m.group(1))) continue;
    final RegExpMatch? arg = RegExp(
      // **`label:` e `rotulo:` NAO estao aqui, e a ausencia foi medida.** Com
      // eles, P2 reprovava tres linhas que estao CERTAS:
      // `Semantics(label: rotuloDoPerfilDe(nome))` e as duas irmas em
      // mensagens. Rotulo acessivel PRECISA do nome — e justamente ele que diz
      // a quem usa leitor de tela de quem e a linha —, e reprova-lo faria o
      // portao exigir uma tela pior. Ficam so as chaves que significam
      // *"desenhe isto como o nome visivel"*.
      r'(?:nome|titulo|texto)\s*:\s*([^,)\n]*)',
    ).firstMatch(linhas[i]);
    if (arg == null) continue;
    final String valor = arg.group(1)!.trim();
    if (valor.startsWith("'") || valor.startsWith('"')) continue;
    if (!deAlvo.hasMatch(valor)) continue;
    achadas.add('$relativo:${i + 1}: ${linhas[i].trim()}');
  }
  return achadas;
}

List<String> _dartsDaPasta(String relativo) {
  final io.Directory raiz = io.Directory('${_raizDoPacote()}/$relativo');
  if (!raiz.existsSync()) {
    fail('REPROVA: nao achei a pasta "$relativo". A varredura nao confere nada sem ela.');
  }
  final int corte = _raizDoPacote().length + 1;
  return raiz
      .listSync(recursive: true)
      .whereType<io.File>()
      .map((io.File f) => f.path.substring(corte))
      .where((String p) => p.endsWith('.dart'))
      .toList()
    ..sort();
}

String _semProsa(String fonte) {
  return fonte
      .replaceAll(RegExp(r'/\*[\s\S]*?\*/'), ' ')
      .split('\n')
      .map((String linha) {
        final int marca = linha.indexOf('//');
        if (marca < 0) return linha;
        final String antes = linha.substring(0, marca);
        final int aspas = "'".allMatches(antes).length + '"'.allMatches(antes).length;
        if (aspas.isOdd) return linha;
        return antes;
      })
      .join('\n');
}

String _ler(String relativo) {
  final io.File arquivo = io.File('${_raizDoPacote()}/$relativo');
  if (!arquivo.existsSync()) {
    fail(
      'REPROVA: nao achei "$relativo" a partir de "${io.Directory.current.path}". '
      'As varreduras deste arquivo nao conferem nada sem ele, e ficar verde sem '
      'conferir e exatamente o que elas existem para impedir.',
    );
  }
  return arquivo.readAsStringSync();
}

String _raizDoPacote() {
  io.Directory dir = io.Directory.current.absolute;
  while (true) {
    if (io.File('${dir.path}/pubspec.yaml').existsSync() &&
        io.Directory('${dir.path}/lib/telas').existsSync()) {
      return dir.path;
    }
    final io.Directory pai = dir.parent;
    if (pai.path == dir.path) {
      fail('REPROVA: nao achei a raiz do pacote subindo de "${io.Directory.current.path}".');
    }
    dir = pai;
  }
}
