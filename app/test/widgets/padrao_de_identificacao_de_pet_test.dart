// **O PORTAO DO PADRAO DE IDENTIFICACAO DE PET.**
//
// Pedido do cliente em 26/10/2026, no mesmo recado em que ele cobrou o padrao de
// pessoa pela quinta vez:
//
// > "nas mensagens tambem. Isso serve tambem para o pets, sempre ter foto, nome
// > do pet"
//
// ## POR QUE ESTE ARQUIVO E SEPARADO DO DE PESSOA
//
// Porque as duas regras **nao sao a mesma**, e um portao so teria de ramificar
// por tipo em cada passo — com o ramo errado passando calado:
//
// | | pessoa | pet |
// |---|---|---|
// | chave do contrato | `display_name` | `pet_display_name` (e `display_name` DENTRO do objeto `pet`) |
// | o que vai junto | foto + nome + **selo** | foto + nome, **sem selo** |
// | o selo | `contact_channel_verified`, de pessoa | **nao existe selo de pet** — ver abaixo |
// | a foto de terceiro | fechada, salvo emenda 3 e 5 do ADR-0010 | **publica por desenho** (emenda 4) |
//
// ## **NAO EXISTE SELO DE PET, E ISSO FOI MEDIDO**
//
// A suposicao de que pet nao tem selo foi conferida e esta certa, **com uma
// ressalva que importa**: nao existe selo de *validacao* de pet, mas existem
// **distintivos de ESTADO**, que sao outra coisa:
//
// - o chip `PERDIDO` de `lib/widgets/cartao_de_pet.dart`;
// - o chip `Perdido` / `Encontrado pela comunidade` de
//   `lib/telas/perdido/cartao_do_perdido.dart` — este ultimo e a propria
//   **emenda 4 do ADR-0010** (20/10/2026, decisao do cliente: *"o pet ganha um
//   selo/filtro na pagina de pets como encontrado por 30 dias"*);
// - as faixas de urgencia da tela do caso publico, da plaquinha e do detalhe.
//
// **Eles nao entram nesta regra**, e a diferenca nao e estilo: o selo de pessoa
// diz *"um canal de contato desta conta foi confirmado"* e vale em toda
// superficie; o chip de pet diz *"este animal esta sendo procurado AGORA"* e
// so faz sentido onde ha caso. Exigir chip de estado em toda listagem de pet
// poria `PERDIDO` ao lado de pet que nao esta perdido.
//
// ## A FOTO DE PET DE TERCEIRO E PUBLICA POR DESENHO — e e decisao dele
//
// A **emenda 4 do ADR-0010** (20/10/2026, *"Status: aceita / Decisao do
// cliente"*) trata foto e nome de pet na superficie alcançavel **sem conta**
// como fato ja vigente, ao estender a janela do reencontro por 30 dias:
//
// > "Entao **foto**, nome de exibicao, bairro, cidade e data do ultimo
// > avistamento **desapareciam** da superficie alcançavel sem conta no segundo
// > em que o tutor dizia que o animal voltou. Esta emenda mantem esses mesmos
// > campos visiveis por mais 30 dias, mais um booleano."
//
// E a lista de dez itens de *"O que a rota publica jamais exibe"* **nao tem foto
// de pet** — ela proibe foto **de pessoa** (emenda 5 item 3) e toda coordenada.
// Entao este portao **nao** trata foto de pet como dado fechado, e nao ha aqui
// nenhum recorte por conexao: quem recorta e o servidor, pelo caso aberto.
//
// ## O QUE ESTE PORTAO **NAO** PEGA — leia antes de confiar nele
//
// 1. **co-presenca num ARQUIVO nao e adjacencia na TELA.** A regra T1 exige que
//    o arquivo que escreve o nome do pet tambem desenhe foto de pet. Um arquivo
//    que desenhasse a foto no topo e o nome 300 linhas abaixo, em outro cartao,
//    passaria. **E este o limite principal deste portao**, e ele e o preco de
//    nao haver um `FichaDoPet` unico como ha `FichaDaPessoa`;
// 2. **nome de pet em `.nome` com receptor de tipo que este portao nao conhece.**
//    A contaminacao e por TIPO (`Pet`, `PerdidoPublico`, `TagResolvida`, …),
//    porque `nome` e generico demais para taxar sozinho — `Usuario.nome`, nome
//    de loja e rascunho de formulario usam o mesmo identificador. Um tipo de pet
//    novo precisa entrar em `tiposDePet`, e e `ISCA DA ISCA: o registro de tipos
//    nao envelhece` que cobra isso;
// 3. **interpolacao**, igual ao portao de pessoa: `Text('${pet.nome}')` passa;
// 4. **ele nao confere pixel**, e nao sabe se a foto esta ao lado ou atras.
//
// ## O CAMINHO DE RESERVA E PRESERVADO, E ISSO TEM CASO PROPRIO
//
// *"Sempre ter foto"* nao pode virar tela quebrada para pet sem foto. Os tres
// cartoes caem para `Moldura` vazia com `Icons.pets_outlined`, e a tela do caso
// publico sobe o nome em `displayLarge` no lugar da foto **de proposito** —
// *"uma ilustracao generica no lugar da foto faz o achador duvidar de que e o
// pet certo"*. `CONTROLE POSITIVO: pet SEM foto nao reprova` mede isso.

import 'dart:io' as io;

import 'package:flutter_test/flutter_test.dart';

/// Os tipos cujo campo `nome` e **nome de pet**.
///
/// A contaminacao e por tipo e nao pelo identificador `nome`: taxar `.nome`
/// sozinho faria `Usuario.nome`, nome de loja e rascunho de formulario virarem
/// alvo. `ISCA DA ISCA: o registro de tipos nao envelhece` cobra tipo novo.
const List<String> tiposDePet = <String>[
  'Pet',
  'PerdidoPublico',
  'TagResolvida',
  'AvisoDoAchadorCriado',
];

/// Os acessores que carregam nome de pet **sem ambiguidade**, qualquer que seja
/// o receptor.
const List<String> acessoresDeNomeDePet = <String>['petDisplayName', 'nomeDoPet'];

/// O que conta como **foto de pet desenhada** num arquivo.
///
/// `Moldura` e o quadro desta casa (e e ele que desenha o vazio com
/// `Icons.pets_outlined`); `ImagemDaRede` e o carregador com `cacheWidth`;
/// `PreviaDaFoto` e a foto local escolhida no cadastro, que e foto de pet
/// tambem.
///
/// ## `Image.network(` NAO ESTA AQUI, E A AUSENCIA FOI MEDIDA
///
/// Ela estava, na primeira versao deste arquivo, e dava **falso APROVADO**:
/// `lib/telas/pet/tela_pet_cadastrado.dart` nao desenha foto de pet nenhuma, mas
/// tem um `Image.network(` — **o QR da plaquinha**. Com `Image.network` na
/// lista, a tela que mais claramente viola a regra passava, porque o portao
/// contava uma imagem que nao e o pet.
///
/// Os tres cartoes continuam passando sem ela porque todos embrulham a imagem
/// num `Moldura` ou num `ImagemDaRede` — que sao widgets DESTA casa, feitos para
/// retrato de pet, e nao primitivas do Flutter que qualquer imagem satisfaz.
/// `ISCA DA ISCA: o QR nao conta como foto de pet` fixa isso.
const List<String> desenhosDeFotoDePet = <String>[
  'Moldura(',
  'ImagemDaRede(',
  'PreviaDaFoto(',
];

/// **CAMPOS QUE LEEM `pet_display_name` E FICAM FORA DO REGISTRO, com motivo.**
const Map<String, String> _foraDoRegistroDePet = <String, String>{
  'nome': 'E o campo `PerdidoPublico.nome`, e ele JA e coberto — pela '
      'contaminacao por TIPO (`tiposDePet`) e nao pelo identificador, porque '
      '`nome` sozinho pegaria `Usuario.nome`, nome de loja e rascunho de '
      'formulario. Ver a limitacao 2 do cabecalho.',
};

/// **PENDENCIAS DECLARADAS** — superficies que mostram nome de pet sem nenhuma
/// foto de pet no arquivo, e que esperam decisao ou coordenacao.
///
/// Igual ao portao de pessoa: ela **nao aprova tela nova nenhuma**, e
/// `ISCA DA ISCA: pendencia que deixou de violar REPROVA` a faz encolher.
const Map<String, String> _pendencias = <String, String>{
  'lib/telas/pet/tela_pet_cadastrado.dart':
      'COORDENACAO: esta tela (F1.6, o desfecho do cadastro) mostra o nome do pet '
      'em `titleLarge` e NAO desenha foto nenhuma do pet — a unica imagem e o QR '
      'da plaquinha. O "sem foto" dela e TEXTO sobre o estado do envio '
      '(fotoAindaSubindo / fotoNaoSubiuSemSinal / fotoNaoSubiuRecusada). Atender '
      '*"sempre ter foto, nome do pet"* aqui e mudanca de produto nesta tela, e '
      'outra frente esta nas acoes do QR agora.',
};

void main() {
  group('O PADRAO DE IDENTIFICACAO DE PET', () {
    test('CONTROLE POSITIVO: a varredura ENXERGA os arquivos do app', () {
      final List<String> arquivos = _dartsDaPasta('lib');
      expect(
        arquivos.length,
        greaterThan(150),
        reason:
            'REPROVA: a varredura achou ${arquivos.length} arquivos .dart em lib/, e a '
            'base tinha 222. Portao que varre pouco e portao que aprova no vazio.',
      );
    });

    test('CONTROLE POSITIVO: o detector ACHA nome de pet onde ele existe', () {
      // Sem esta metade, T1 passaria no vazio com o detector cego.
      for (final String caminho in <String>[
        'lib/widgets/cartao_de_pet.dart',
        'lib/telas/perdido/cartao_do_perdido.dart',
        'lib/telas/perdido/cabecalho_do_pet.dart',
        // **Este quarto cobre a forma de GETTER** (`Pet get _pet => ...`), que e
        // como esta tela declara o pet dela. Sem ele no controle positivo, o
        // detector ficou cego para essa forma e ninguem soube.
        'lib/telas/pet/tela_pet_cadastrado.dart',
      ]) {
        expect(
          _nomesDePetDesenhadosEm(caminho, _ler(caminho)),
          isNotEmpty,
          reason:
              'REPROVA: o detector nao achou nome de pet em "$caminho", que escreve o '
              'nome do pet ao lado da foto dele. Detector cego aprova o app inteiro.',
        );
      }
    });

    test('T1 — ISCA: nome de pet so aparece onde a FOTO do pet aparece', () {
      final List<String> violacoes = <String>[];
      for (final String relativo in _dartsDaPasta('lib')) {
        final String bruto = _ler(relativo);
        final List<String> nomes = _nomesDePetDesenhadosEm(relativo, bruto);
        if (nomes.isEmpty) continue;
        if (_desenhaFotoDePet(bruto)) continue;
        violacoes.addAll(nomes);
      }
      final List<String> naoDeclaradas = violacoes
          .where((String v) => !_pendencias.keys.any(v.startsWith))
          .toList();
      expect(
        naoDeclaradas,
        isEmpty,
        reason:
            'REPROVA — nome de pet desenhado sem NENHUMA foto de pet no arquivo:\n'
            '${naoDeclaradas.join('\n')}\n\n'
            'O cliente pediu, em 26/10/2026: *"Isso serve tambem para o pets, sempre '
            'ter foto, nome do pet"*. Desenhe a foto ao lado do nome — `Moldura` com '
            '`ImagemDaRede`, como `CartaoDePet` e `CartaoDoPerdido` fazem. **E '
            'preserve o caminho de reserva**: pet sem foto cai em `Moldura` vazia com '
            '`Icons.pets_outlined`, e nao em tela quebrada.',
      );
    });

    test('T2 — ISCA: os tres cartoes de pet mantem foto E nome juntos', () {
      // Sem este caso, alguem poderia tirar a foto do cartao do pet e T1
      // continuaria verde — porque T1 so olha arquivos que AINDA escrevem o
      // nome, e um cartao sem foto e sem nome nao viola nada.
      for (final String caminho in <String>[
        'lib/widgets/cartao_de_pet.dart',
        'lib/telas/perdido/cartao_do_perdido.dart',
        'lib/telas/perdido/cabecalho_do_pet.dart',
      ]) {
        final String bruto = _ler(caminho);
        expect(
          _nomesDePetDesenhadosEm(caminho, bruto),
          isNotEmpty,
          reason: 'REPROVA: "$caminho" deixou de escrever o nome do pet.',
        );
        expect(
          _desenhaFotoDePet(bruto),
          isTrue,
          reason:
              'REPROVA: "$caminho" deixou de desenhar foto de pet. Ele e um dos tres '
              'lugares onde foto e nome de pet andam juntos, e o cliente pediu os dois '
              'juntos em 26/10/2026.',
        );
      }
    });

    test('ISCA DA ISCA: o registro de tipos nao envelhece', () {
      // Todo campo alimentado por `pet_display_name` tem de estar coberto: ou
      // pelos acessores, ou pela contaminacao por tipo declarada em
      // `_foraDoRegistroDePet` com motivo.
      final List<String> fora = <String>[];
      var lidos = 0;
      for (final String relativo in _dartsDaPasta('lib/api')) {
        final String fonte = _semProsa(_ler(relativo));
        // DUAS formas, porque a camada usa as duas: `campo: json[...]` nos
        // construtores e `final x = bruto[...]` nos leitores que validam antes.
        // Com so a primeira a derivacao achava 2 de 3 e eu baixaria o piso para
        // acomodar o proprio defeito.
        for (final RegExpMatch m in RegExp(
          r'(?:([A-Za-z_]\w*)\s*:|(?:final|var|const)\s+(?:[A-Za-z_][\w<>?,\s]*\s+)?([A-Za-z_]\w*)\s*=)'
          r'\s*\w+\[.pet_display_name.\]',
        ).allMatches(fonte)) {
          lidos++;
          final String campo = m.group(1) ?? m.group(2)!;
          if (acessoresDeNomeDePet.contains(campo)) continue;
          if (_foraDoRegistroDePet.containsKey(campo)) continue;
          fora.add('$relativo → `$campo`');
        }
      }
      expect(
        lidos,
        greaterThanOrEqualTo(3),
        reason:
            'REPROVA: a derivacao achou $lidos leitores de `pet_display_name`, e a base '
            'tinha 4. A derivacao esta quebrada, e quebrada ela aprova qualquer registro.',
      );
      expect(
        fora,
        isEmpty,
        reason:
            'REPROVA — campo novo alimentado por `pet_display_name` fora do registro:\n'
            '${fora.join('\n')}\n\n'
            'Acrescente-o a `acessoresDeNomeDePet`, ou declare em '
            '`_foraDoRegistroDePet` por que ele ja esta coberto.',
      );
    });

    test('ISCA DA ISCA: o detector REPROVA uma superficie nova inventada', () {
      // **A ISCA QUE MAIS IMPORTA, metade de unidade.** Uma tela nova que mostra
      // pet so com nome tem de ser achada, pelo arquivo.
      const String telaNova = '''
import 'package:flutter/material.dart';
class TelaNovaDePet extends StatelessWidget {
  const TelaNovaDePet({required this.pet, super.key});
  final Pet pet;
  @override
  Widget build(BuildContext context) {
    return Column(children: <Widget>[Text(pet.nome)]);
  }
}
''';
      final List<String> achadas = _nomesDePetDesenhadosEm('lib/telas/pet/inventada.dart', telaNova);
      expect(
        achadas,
        isNotEmpty,
        reason:
            'REPROVA: o detector nao achou o nome do pet numa tela que desenha '
            '`Text(pet.nome)` com `pet` declarado como `Pet`. Cego, ele aprova a '
            'proxima tela de pet.',
      );
      expect(achadas.first, startsWith('lib/telas/pet/inventada.dart'));
      // E ela NAO desenha foto: e por isso que T1 a reprovaria.
      expect(_desenhaFotoDePet(telaNova), isFalse);
    });

    test('CONTROLE POSITIVO: pet SEM foto nao reprova — a reserva e preservada', () {
      // **A metade que impede "sempre ter foto" de virar impedimento.** Um
      // arquivo que desenha o nome do pet e trata a ausencia de foto com
      // `Moldura` vazia esta CERTO, e tem de passar.
      const String comReserva = '''
import 'package:flutter/material.dart';
class CartaoHipotetico extends StatelessWidget {
  const CartaoHipotetico({required this.pet, super.key});
  final Pet pet;
  @override
  Widget build(BuildContext context) {
    final capa = pet.fotoDeCapa;
    return Row(children: <Widget>[
      if (capa == null) const Moldura(largura: 80) else Moldura(largura: 80, filho: ImagemDaRede(url: capa.urlDeMiniatura!)),
      Text(pet.nome),
    ]);
  }
}
''';
      expect(_nomesDePetDesenhadosEm('lib/x.dart', comReserva), isNotEmpty);
      expect(
        _desenhaFotoDePet(comReserva),
        isTrue,
        reason:
            'REPROVA: um arquivo que cai para `Moldura` vazia quando nao ha foto nao '
            'conta como desenhando foto de pet. Com isso o portao reprovaria toda tela '
            'que trata pet sem foto corretamente — o defeito oposto, e igualmente caro.',
      );
    });

    test('ISCA: a interpolacao e a porta que fica aberta, aqui tambem', () {
      const String interpolado = r'''
import 'package:flutter/material.dart';
class X extends StatelessWidget {
  const X({required this.pet, super.key});
  final Pet pet;
  @override
  Widget build(BuildContext context) => Text('${pet.nome}');
}
''';
      expect(
        _nomesDePetDesenhadosEm('lib/y.dart', interpolado),
        isEmpty,
        reason:
            'Se este caso passar a REPROVAR, o portao ficou mais forte do que o '
            'cabecalho afirma, e a limitacao 3 do cabecalho precisa ser corrigida junto.',
      );
    });

    test('ISCA DA ISCA: pendencia que deixou de violar REPROVA', () {
      for (final String relativo in _pendencias.keys) {
        final String bruto = _ler(relativo);
        final bool aindaViola =
            _nomesDePetDesenhadosEm(relativo, bruto).isNotEmpty && !_desenhaFotoDePet(bruto);
        expect(
          aindaViola,
          isTrue,
          reason:
              'REPROVA: "$relativo" esta declarado como pendencia e NAO viola mais. '
              'Tire-o de `_pendencias`: pendencia que nao viola e dispensa em branco '
              'para a proxima violacao naquele arquivo.',
        );
      }
    });

    test('ISCA DA ISCA: toda pendencia e toda excecao carregam MOTIVO', () {
      for (final MapEntry<String, String> e in <MapEntry<String, String>>[
        ..._pendencias.entries,
        ..._foraDoRegistroDePet.entries,
      ]) {
        expect(
          e.value.length,
          greaterThan(40),
          reason: 'REPROVA: a entrada de "${e.key}" nao explica por que ela existe.',
        );
      }
    });

    test('ISCA DA ISCA: NAO existe selo de VALIDACAO de pet', () {
      // A suposicao foi conferida e e esta a conferencia. `SeloDeValidado` e de
      // PESSOA — o rotulo dele e "Contato confirmado", sobre
      // `contact_channel_verified` de uma conta. Se um dia ele aparecer num
      // arquivo de pet, este caso reprova e manda ler o cabecalho: um pet nao
      // tem canal de contato para confirmar.
      for (final String caminho in <String>[
        'lib/widgets/cartao_de_pet.dart',
        'lib/telas/perdido/cartao_do_perdido.dart',
        'lib/telas/perdido/cabecalho_do_pet.dart',
      ]) {
        final String fonte = _semProsa(_ler(caminho));
        expect(
          fonte.contains('SeloDeValidado'),
          isFalse,
          reason:
              'REPROVA: "$caminho" passou a usar `SeloDeValidado`, que e o selo de '
              'PESSOA ("Contato confirmado", sobre `contact_channel_verified`). Pet nao '
              'tem canal de contato. Os distintivos de pet sao de ESTADO (`PERDIDO`, '
              '`Encontrado pela comunidade`) e sao outra coisa — ver o cabecalho.',
        );
      }
    });

    test('ISCA DA ISCA: o QR nao conta como foto de pet', () {
      // **Este caso existe porque o portao JA errou aqui.** Com `Image.network(`
      // na lista de desenhos aprovados, `tela_pet_cadastrado.dart` passava — o
      // `Image.network` dela e o QR da plaquinha, e nao o pet. Um portao que
      // conta qualquer imagem nao mede "tem foto do pet": mede "tem imagem".
      const String soOQr = '''
import 'package:flutter/material.dart';
class X extends StatelessWidget {
  const X({required this.pet, super.key});
  final Pet pet;
  @override
  Widget build(BuildContext context) => Column(children: <Widget>[
    Image.network('https://exemplo/qr.png'),
    Text(pet.nome),
  ]);
}
''';
      expect(_nomesDePetDesenhadosEm('lib/z.dart', soOQr), isNotEmpty);
      expect(
        _desenhaFotoDePet(soOQr),
        isFalse,
        reason:
            'REPROVA: um `Image.network` solto passou a contar como foto de pet. Era '
            'assim que o QR da plaquinha aprovava a tela que nao mostra o pet.',
      );
    });

    test('ISCA DA ISCA: `_semProsa` apaga comentario e PRESERVA codigo', () {
      const String amostra = '''
final x = pet.nome;
// este comentario cita Text(pet.nome) e Moldura(
final String url = 'http://exemplo/nao-e-comentario';
''';
      final String limpo = _semProsa(amostra);
      expect(limpo, contains('final x = pet.nome;'));
      expect('\n$limpo'.contains('\n// este comentario'), isFalse);
      expect(limpo.contains('Moldura('), isFalse);
      expect(limpo, contains("'http://exemplo/nao-e-comentario'"));
    });
  });
}

/// Os identificadores que, NESTE arquivo, tem tipo de pet.
Set<String> _identificadoresDePet(String fonte) {
  final Set<String> ids = <String>{};
  for (final String tipo in tiposDePet) {
    // **DUAS formas, e a segunda custou um falso APROVADO.** `Pet pet` e
    // `final Pet pet` sao a primeira; `Pet get _pet => ...` e a segunda, e e
    // assim que `tela_pet_cadastrado.dart` declara o pet dela. Sem a segunda,
    // `_pet` nunca era taxado, a tela que mostra nome de pet sem foto nenhuma
    // nao violava nada, e o portao ficava verde sobre a violacao mais clara que
    // existe no app.
    for (final RegExpMatch m in RegExp(
      '\\b$tipo\\b[?]?\\s+(?:get\\s+)?(_?[a-z]\\w*)',
    ).allMatches(fonte)) {
      final String id = m.group(1)!;
      if (id == 'get' || id == 'set') continue;
      ids.add(id);
    }
  }
  return ids;
}

/// As linhas em que um nome de pet vai para um widget de texto cru.
List<String> _nomesDePetDesenhadosEm(String relativo, String bruto) {
  final String fonte = _semProsa(bruto);
  final Set<String> ids = _identificadoresDePet(fonte);
  final List<String> alvos = <String>[
    ...acessoresDeNomeDePet.map((String a) => '\\.$a\\b'),
    ...ids.map((String i) => '(?<![\\w.])$i(?:[!?])?\\.nome\\b'),
  ];
  if (alvos.isEmpty) return <String>[];
  final RegExp deAlvo = RegExp(alvos.join('|'));
  final List<String> linhas = fonte.split('\n');
  final List<String> achadas = <String>[];
  for (int i = 0; i < linhas.length; i++) {
    final RegExpMatch? m = RegExp(
      r'(?<![\w.])(?:Text|SelectableText)\s*\(\s*([^,)\n]*)',
    ).firstMatch(linhas[i]);
    if (m == null) continue;
    final String primeiro = m.group(1)!.trim();
    if (primeiro.startsWith("'") || primeiro.startsWith('"')) continue;
    if (deAlvo.hasMatch(primeiro)) {
      achadas.add('$relativo:${i + 1}: ${linhas[i].trim()}');
    }
  }
  return achadas;
}

bool _desenhaFotoDePet(String bruto) {
  final String fonte = _semProsa(bruto);
  return desenhosDeFotoDePet.any(fonte.contains);
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
      'As varreduras deste arquivo nao conferem nada sem ele.',
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
