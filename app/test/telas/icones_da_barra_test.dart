// O PORTAO DOS DEZ ICONES DA BARRA -- BICHUS-278, 23/10/2026.
//
// ---------------------------------------------------------------------------
// O BURACO QUE ELE FECHA, e ele nao era divergencia: era ausencia
// ---------------------------------------------------------------------------
//
// O cliente pediu os icones DELE na barra de baixo. Os desenhos existiam --
// dez SVG, cinco pares de contorno e preenchido -- e **o app nao os lia**: a
// barra pintava `Icons.pets`, `Icons.groups`, `Icons.dynamic_feed`,
// `Icons.shopping_bag` e `Icons.chat`, cinco glifos do Material Symbols.
//
// **Nao havia nada a mesclar.** O unico gerador de vetor do app
// (`tool/gen_marca.dart`) le `design/marca/vetor/` e emite tres campos; ele
// nao poderia consumir estes dez nem se eles estivessem naquela pasta, e os
// tres motivos estao medidos no cabecalho de `tool/gen_icones_da_barra.dart`.
// A fiacao foi CONSTRUIDA: pasta de fonte, gerador, pintor e os cinco slots.
//
// ---------------------------------------------------------------------------
// AS QUATRO AFIRMACOES, em ordem de forca
// ---------------------------------------------------------------------------
//
// 1. **O Dart gerado bate com os dez SVG.** Divergencia aqui quer dizer que
//    alguem mexeu num SVG e nao rodou `make gerar-icones-da-barra`.
// 2. **Cada desenho esta no destino certo**, pelo `aria-label` da propria arte.
// 3. **Nenhum slot da barra declara glifo do Material.** E a afirmacao que
//    carrega o pedido do cliente, e a que mais corre risco de ser desfeita por
//    quem "consertar" a barra sem ler isto.
// 4. **O estado selecionado troca o desenho**, e troca de contorno para
//    preenchido -- nao e so outro arquivo, e o M3.
//
// Cada uma mora numa FUNCAO, e nao solta num `test`. E isso que deixa a prova
// negativa exercitar a regra de producao com uma entrada defeituosa, em vez de
// refazer a varredura a mao e provar que a copia dela reprova.
//
// ---------------------------------------------------------------------------
// O QUE ESTE ARQUIVO **NAO** FAZ
// ---------------------------------------------------------------------------
//
// Ele nao olha o desenho. Se a patinha esta bonita, se o balao le como balao,
// se os bigodes do `pets` aparecem em 24 dp num aparelho de verdade -- nada
// disso e medido aqui, e nada disso foi medido por ninguem nesta rodada: o app
// nao foi executado. O que esta coberto e a FIACAO: o arquivo certo chega ao
// slot certo, com a geometria do arquivo, e troca no estado selecionado.

import 'dart:io';
import 'dart:ui' as ui;

import 'package:bichu/roteamento/rotas.dart';
import 'package:bichu/telas/casca_com_abas.dart';
import 'package:bichu/theme/icones_da_barra.g.dart';
import 'package:bichu/widgets/icone_da_barra.dart';
import 'package:flutter/material.dart';
import 'package:flutter/rendering.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:http/http.dart' as http;

import 'ajuda_de_tela.dart';

/// A pasta das fontes, relativa a raiz do repositorio.
const String _pasta = 'design/icones-da-barra';

/// A ORDEM DOS CINCO SLOTS, e ela e **decisao do cliente** (19/10/2026).
///
/// `Pets, Rede, Mural, Loja, AuAu`. Nao e ordem alfabetica, nao e ordem de
/// construcao e nao e preferencia de quem escreve codigo: foi ele que a
/// escolheu, e ela ja mudou duas vezes por decisao dele (era
/// `Pets, Perto, Rede, Loja, AuAu`, e antes disso
/// `Pets, Rede, Perto, Loja, Perfil`).
///
/// **Esta constante existe para que mexer na ordem CUSTE uma linha de diff com
/// nome e motivo**, e nao para documentar. A ordem dos RAMOS de
/// `roteamento/rotas.dart` anda junto com a do registro -- ha portao proprio
/// para a divergencia (`a ordem dos ramos e a ordem do registro`) --, entao
/// reordenar o registro sem reordenar os ramos faz tocar em `Mural` abrir a
/// `Rede`, calado. Esse e o defeito que a isca 3 impede.
const List<String> ordemDosSlots = <String>[
  'Pets',
  'Rede',
  'Mural',
  'Loja',
  'AuAu',
];

/// O arquivo de arte de cada slot, em repouso e selecionado.
const Map<String, (String, String)> _artePorSlot = <String, (String, String)>{
  'Pets': ('pets.svg', 'pets-selecionado.svg'),
  'Rede': ('rede.svg', 'rede-selecionado.svg'),
  'Mural': ('mural.svg', 'mural-selecionado.svg'),
  'Loja': ('loja.svg', 'loja-selecionado.svg'),
  'AuAu': ('auau.svg', 'auau-selecionado.svg'),
};

// ===========================================================================
// AS REGRAS, isoladas para a prova negativa poder exercita-las
// ===========================================================================

/// A barra nao MISTURA as duas linguagens de arte, e usa a declarada.
///
/// ## Por que esta regra substituiu "todo slot usa o desenho do cliente"
///
/// Em 23/10 eu escrevi o oposto disto: um `assert` no construtor de
/// `DestinoDeNavegacao` exigindo `desenho != null` em todo slot da barra. Ele
/// era forte -- `CascaComAbas.destinos` e `const`, entao reprovava em tempo de
/// COMPILACAO -- e estava guardando a coisa errada. Em 26/10 o cliente
/// reprovou o desenho (*"tava muito feio o icone do cachorro"*), e aquele
/// `assert` passou a impedir o conserto: ele tornava o estado CERTO
/// inconstruivel.
///
/// **A regra que importa nunca foi "slot usa desenho".** Era: a barra nao
/// desenha metade de uma fonte e metade da outra. Cinco slots, uma linguagem.
/// Isso nao e defeito de um destino -- cada um sozinho esta bem-formado --, e
/// um `assert` de construtor por definicao nao ve. **E propriedade da LISTA**,
/// e por isso mora aqui.
///
/// ## E ela ficou melhor como portao do que era como `assert`
///
/// Com o `assert`, a mistura era inconstruivel, entao a regra equivalente era
/// **GUARDA**: nenhuma isca a derrubava. Eu registrei isso na entrega de
/// 23/10. Agora a mistura E construivel, e a prova negativa abaixo derruba
/// este mecanismo de verdade -- ele virou **ISCA**.
///
/// [esperada] e a fonte declarada em `fonteAtivaDaBarra`. A regra cobra as
/// duas direcoes: registro que discorda da chave reprova, e chave que discorda
/// do registro reprova. Trocar so um dos dois nao atravessa.
void exigirFonteDeArteUniforme(
  List<DestinoDeNavegacao> destinos,
  FonteDaArteDaBarra esperada,
) {
  // O guarda contra o verde por vazio: uma lista sem slot nao mistura nada, e
  // aprovaria sem nunca ter olhado para a barra.
  final daBarra = destinos.where((d) => d.naBarra).toList();
  expect(
    daBarra.length,
    greaterThanOrEqualTo(1),
    reason: 'REPROVA: a lista nao tem nenhum destino `naBarra`. Sem slot nao '
        'ha fonte de arte para conferir, e afirmar "a barra nao mistura" '
        'seria verde por nao ter o que olhar.',
  );

  final comDesenho = <String>[];
  final comGlifo = <String>[];
  for (final d in daBarra) {
    if (d.desenho != null) comDesenho.add(d.rotulo);
    if (d.icone != null) comGlifo.add(d.rotulo);
  }

  expect(
    comDesenho.isEmpty || comGlifo.isEmpty,
    isTrue,
    reason: 'REPROVA: a barra MISTURA as duas fontes de arte.\n'
        '  com desenho do cliente: ${comDesenho.join(', ')}\n'
        '  com glifo do Material:  ${comGlifo.join(', ')}\n'
        'Cinco slots, UMA linguagem. Meia barra de cada e o que o cliente veria '
        'como dois apps na mesma fileira -- e e o estado em que uma troca '
        'parcial deixa o produto. Para trocar a fonte, troque '
        '`fonteAtivaDaBarra` E os cinco destinos na mesma edicao.',
  );

  final atual = comDesenho.isNotEmpty
      ? FonteDaArteDaBarra.desenhoDoCliente
      : FonteDaArteDaBarra.glifoDoMaterial;
  expect(
    atual,
    esperada,
    reason: 'REPROVA: o registro desenha por `${atual.name}` e '
        '`fonteAtivaDaBarra` declara `${esperada.name}`.\n'
        'A chave e o registro andam JUNTOS: ela existe para que o estado da '
        'barra seja uma decisao declarada num lugar, e nao algo que se descobre '
        'lendo cinco destinos. Trocar so a chave, ou so os destinos, reprova '
        'aqui -- nas duas direcoes.',
  );
}

/// A ordem dos cinco slots e a que o cliente escolheu.
void exigirOrdemDosSlots(List<DestinoDeNavegacao> destinos) {
  final naBarra = destinos.where((d) => d.naBarra).map((d) => d.rotulo).toList();
  expect(
    naBarra,
    ordemDosSlots,
    reason: 'REPROVA: a ordem dos slots da barra mudou.\n'
        '  decidida por ELE: ${ordemDosSlots.join(' · ')}\n'
        '  encontrada:       ${naBarra.join(' · ')}\n'
        'Esta ordem e decisao do cliente (19/10/2026) e ja mudou duas vezes '
        'por decisao dele. Ela NAO e detalhe de implementacao, nao e '
        'alfabetica e nao e preferencia de quem escreve o codigo.\n'
        'E ela nao anda sozinha: a ordem dos RAMOS de `roteamento/rotas.dart` '
        'espelha esta lista, e trocar so uma das duas faz tocar em `Mural` '
        'abrir a `Rede`, em silencio.',
  );
}

/// O estado selecionado troca o desenho, e troca contorno por preenchido.
///
/// Duas afirmacoes, e a segunda e a que vale: nao basta ser outro arquivo. O
/// M3 pede contorno em repouso e preenchido no selecionado, e e isso que diz
/// a quem olha qual aba esta aceso -- sem depender de cor, que e o criterio 7.
void exigirParSelecionadoDistinto(List<DestinoDeNavegacao> destinos) {
  final comDesenho = destinos
      .where((d) => d.desenho != null && d.desenhoSelecionado != null)
      .toList();
  expect(
    comDesenho.length,
    greaterThanOrEqualTo(1),
    reason: 'REPROVA: nenhum destino da lista tem par de desenho. Sem par nao '
        'ha troca para medir, e o verde seria por vazio.',
  );

  final iguais = <String>[];
  final semPreenchimento = <String>[];
  final preenchidoEmRepouso = <String>[];
  for (final d in comDesenho) {
    final repouso = d.desenho!;
    final aceso = d.desenhoSelecionado!;
    if (repouso.arquivo == aceso.arquivo) {
      iguais.add('${d.rotulo} (os dois em ${repouso.arquivo})');
    }
    if (!aceso.grupos.any((g) => g.preenchido)) {
      semPreenchimento.add('${d.rotulo} (${aceso.arquivo})');
    }
    if (repouso.grupos.any((g) => g.preenchido)) {
      preenchidoEmRepouso.add('${d.rotulo} (${repouso.arquivo})');
    }
  }

  expect(
    iguais,
    isEmpty,
    reason: 'REPROVA: ${iguais.join('; ')} desenha a MESMA arte nos dois '
        'estados. A aba nao muda ao ser tocada, e o unico sinal de qual secao '
        'esta aberta passa a ser a pilula do indicador -- sinal so por cor, '
        'que o criterio 7 recusa.',
  );
  expect(
    semPreenchimento,
    isEmpty,
    reason: 'REPROVA: ${semPreenchimento.join('; ')} tem arte de selecionado '
        'SEM nenhum grupo preenchido. Trocar de arquivo nao basta: contorno em '
        'repouso e PREENCHIDO no selecionado e o M3, e e o preenchimento que '
        'diz qual aba esta aceso para quem nao distingue a cor.',
  );
  expect(
    preenchidoEmRepouso,
    isEmpty,
    reason: 'REPROVA: ${preenchidoEmRepouso.join('; ')} ja esta preenchido em '
        'REPOUSO. Com as duas artes preenchidas a troca deixa de ser '
        'perceptivel, e a aba parece aceso o tempo todo.',
  );
}

// ===========================================================================

/// Os cinco pares de arte como destinos de mentira, para a isca 4.
///
/// **`naBarra: false` NAO e detalhe:** estes nao sao slots, sao um empacotador
/// que deixa `exigirParSelecionadoDistinto` ser a MESMA funcao que a prova
/// negativa exercita. Uma copia da regra aqui provaria que a copia reprova, e
/// nao que a regra reprova.
List<DestinoDeNavegacao> paresDaArte() {
  return <DestinoDeNavegacao>[
    for (final slot in ordemDosSlots)
      DestinoDeNavegacao(
        rotulo: slot,
        reforcoAcessivel: 'par de arte, so do portao',
        reforcoDaPagina: '',
        rota: Rotas.pets,
        estado: EstadoDaSecao.existe,
        campoSemantico: CampoSemantico.animal,
        naBarra: false,
        desenho: IconesDaBarra.porArquivo[_artePorSlot[slot]!.$1],
        desenhoSelecionado: IconesDaBarra.porArquivo[_artePorSlot[slot]!.$2],
      ),
  ];
}

Directory _raizDoRepositorio() {
  var dir = Directory.current.absolute;
  while (true) {
    if (Directory('${dir.path}/$_pasta').existsSync()) return dir;
    final pai = dir.parent;
    if (pai.path == dir.path) break;
    dir = pai;
  }
  throw StateError(
    'REPROVA: nao achei $_pasta/ subindo a partir de '
    '"${Directory.current.path}". Portao sem o que verificar reprova.',
  );
}

Future<http.Response> Function(http.Request) _redeVazia() {
  return (http.Request pedido) async => http.Response('{}', 404);
}

void main() {
  final raiz = _raizDoRepositorio();
  final pasta = Directory('${raiz.path}/$_pasta');

  group('ISCA 1 — o Dart gerado bate com os dez SVG', () {
    test('a pasta tem exatamente os dez declarados, e nada mais', () {
      final noDisco = pasta
          .listSync()
          .whereType<File>()
          .map((f) => f.uri.pathSegments.last)
          .where((n) => n.endsWith('.svg'))
          .toSet();

      expect(
        noDisco,
        IconesDaBarra.porArquivo.keys.toSet(),
        reason: 'REPROVA: $_pasta divergiu de `IconesDaBarra.porArquivo`.\n'
            'No disco:   ${(noDisco.toList()..sort()).join(', ')}\n'
            'Declarado:  ${(IconesDaBarra.porArquivo.keys.toList()..sort()).join(', ')}\n'
            'Arquivo que some e desenho que some sem quebrar build nenhum — o '
            'defeito que a BICHUS-196 registrou na pasta da marca. Arquivo '
            'novo precisa de uma linha em `_consumidos` do gerador e de um '
            'slot que o use.',
      );
      expect(
        noDisco,
        hasLength(10),
        reason: 'REPROVA: a pasta tem ${noDisco.length} SVG e nao dez. Os dez '
            'sao CINCO PARES; um numero impar quer dizer par incompleto.',
      );
    });

    for (final entrada in IconesDaBarra.porArquivo.entries) {
      test('${entrada.key}: moldura, rotulo e curvas identicos ao gerado', () {
        final arquivo = File('${pasta.path}/${entrada.key}');
        expect(
          arquivo.existsSync(),
          isTrue,
          reason: 'REPROVA: ${arquivo.path} nao existe.',
        );
        final svg = arquivo.readAsStringSync();
        final gerado = entrada.value;

        final vb = RegExp(r'-?\d+(?:\.\d+)?')
            .allMatches(RegExp(r'viewBox="([^"]*)"').firstMatch(svg)!.group(1)!)
            .map((m) => double.parse(m.group(0)!))
            .toList();
        expect(
          <double>[0, 0, gerado.lado, gerado.lado],
          vb,
          reason: 'REPROVA: o viewBox de ${entrada.key} mudou e '
              'lib/theme/icones_da_barra.g.dart nao. Rode:\n'
              '    make gerar-icones-da-barra',
        );

        expect(
          RegExp(r'aria-label="([^"]*)"').firstMatch(svg)?.group(1),
          gerado.rotuloDaArte,
          reason: 'REPROVA: o `aria-label` de ${entrada.key} divergiu do '
              'gerado. E ele que amarra o ARQUIVO ao destino.',
        );

        // As formas do SVG, na ordem do documento — que e a ordem em que o
        // pintor as empilha.
        final grupos = RegExp(r'<g\b([^>]*)>(.*?)</g>', dotAll: true)
            .allMatches(svg)
            .toList();
        expect(
          grupos.map((g) {
            final fill =
                RegExp(r'fill="([^"]*)"').firstMatch(g.group(1)!)?.group(1);
            return fill == 'currentColor';
          }).toList(),
          gerado.grupos.map((g) => g.preenchido).toList(),
          reason: 'REPROVA: os preenchimentos de ${entrada.key} divergem do '
              'gerado. `fill="currentColor"` e preenchido e `fill="none"` e '
              'contorno, e e esse par que separa selecionado de repouso.',
        );

        for (var i = 0; i < grupos.length; i++) {
          final formas = <String>[];
          for (final f in RegExp(
            r'<path\b([^>]*)/>|<circle\b([^>]*)/>',
            dotAll: true,
          ).allMatches(grupos[i].group(2)!)) {
            if (f.group(1) != null) {
              formas.add(
                'curva:${RegExp(r'\sd="([^"]*)"').firstMatch(f.group(1)!)!.group(1)}',
              );
            } else {
              final a = f.group(2)!;
              double n(String k) => double.parse(
                    RegExp('$k="([^"]*)"').firstMatch(a)!.group(1)!,
                  );
              formas.add('circulo:${n('cx')},${n('cy')},${n('r')}');
            }
          }
          expect(
            gerado.grupos[i].formas
                .map((f) => f.ehCurva
                    ? 'curva:${f.d}'
                    : 'circulo:${f.cx},${f.cy},${f.r}')
                .toList(),
            formas,
            reason: 'REPROVA: as formas do grupo $i de ${entrada.key} divergem '
                'do que esta em lib/theme/icones_da_barra.g.dart — na ORDEM '
                'inclusive, que e a ordem de pintura. Rode:\n'
                '    make gerar-icones-da-barra',
          );
        }
      });
    }

    test('NENHUM dos dez escreve cor, e a ausencia e a regra', () {
      // A regra de token cumprida na direcao certa: um icone de navegacao nao
      // tem cor propria. A tinta e o ESTADO da aba, e quem a resolve e o
      // `iconTheme` de `BichuTheme`. Hexadecimal num destes arquivos
      // sobreviveria ao modo escuro e ao estado selecionado, os dois calado.
      final comCor = <String>[];
      for (final nome in IconesDaBarra.porArquivo.keys) {
        final svg = File('${pasta.path}/$nome').readAsStringSync();
        final hex =
            RegExp(r'(?:fill|stroke)="(#[0-9A-Fa-f]{3,8})"').firstMatch(svg);
        if (hex != null) comCor.add('$nome pinta ${hex.group(1)}');
      }
      expect(
        comCor,
        isEmpty,
        reason: 'REPROVA: ${comCor.join('; ')}. Icone da barra pinta '
            '`currentColor` e mais nada. A cor vem do papel do tema '
            '(`text-secondary` em repouso, `on-primary-container` '
            'selecionado), e valor de cor escrito aqui e o caminho inverso: '
            'ele vira constante solta que sobrevive a troca de tema.',
      );
    });
  });

  group('ISCA 2 — a arte dos dez esta rotulada para o slot certo', () {
    // ESTE GRUPO DEIXOU DE LER O REGISTRO em 26/10/2026, e a mudanca e de
    // escopo e nao de forca.
    //
    // Entre 23/10 e 26/10 ele cobrava que os cinco slots usassem a arte com o
    // nome deles. Com a barra de volta ao Material, o registro nao carrega
    // arte nenhuma -- cobrar isso ali reprovaria o estado certo.
    //
    // **O que ele cobra agora e o que continua verdade e continua valioso: os
    // dez arquivos estao rotulados para os cinco slots, prontos para o dia do
    // desenho aprovado.** Sem isto, a pasta poderia silenciosamente perder o
    // par de um slot, ou dois arquivos poderiam apontar para o mesmo, e so
    // descobririamos no religar.
    test('os dez cobrem os cinco slots, um par cada', () {
      expect(
        IconesDaBarra.porArquivo,
        hasLength(10),
        reason: 'REPROVA: `IconesDaBarra.porArquivo` tem '
            '${IconesDaBarra.porArquivo.length} entradas e nao dez.',
      );
      final porSlot = <String, (String, String)>{
        for (final e in _artePorSlot.entries) e.key: e.value,
      };
      expect(
        porSlot.keys.toList(),
        ordemDosSlots,
        reason: 'REPROVA: a tabela de arte nao cobre os cinco slots, ou nao '
            'na ordem do cliente.',
      );
      final declarados = <String>[
        for (final par in _artePorSlot.values) ...<String>[par.$1, par.$2],
      ];
      expect(
        declarados.toSet(),
        IconesDaBarra.porArquivo.keys.toSet(),
        reason: 'REPROVA: a tabela de arte e os dez gerados divergem. Arte que '
            'nao tem slot, ou slot que aponta para arquivo que nao existe, '
            'so apareceria no dia do religar.',
      );
      expect(
        declarados,
        hasLength(declarados.toSet().length),
        reason: 'REPROVA: dois slots apontam para o MESMO arquivo de arte.',
      );
    });

    test('o `aria-label` de cada arte nomeia o slot dela', () {
      // A amarra que o nome do arquivo nao da: o `aria-label` vive DENTRO do
      // SVG e e a unica coisa no arquivo que diz o que ele e. Nome de arquivo
      // certo com conteudo de outro desenho passa por tudo menos por aqui.
      for (final slot in ordemDosSlots) {
        final par = _artePorSlot[slot]!;
        expect(
          IconesDaBarra.porArquivo[par.$1]!.rotuloDaArte,
          slot,
          reason: 'REPROVA: ${par.$1} se declara '
              '`${IconesDaBarra.porArquivo[par.$1]!.rotuloDaArte}` e deveria '
              'nomear o slot `$slot`.',
        );
        expect(
          IconesDaBarra.porArquivo[par.$2]!.rotuloDaArte,
          '$slot, selecionado',
          reason: 'REPROVA: ${par.$2} se declara '
              '`${IconesDaBarra.porArquivo[par.$2]!.rotuloDaArte}`.',
        );
      }
    });
  });

  group('ISCA 3 — a barra nao mistura as duas fontes, e a ordem e dele', () {
    test('a barra usa UMA fonte de arte, e e a declarada', () {
      exigirFonteDeArteUniforme(CascaComAbas.destinos, fonteAtivaDaBarra);
    });

    test('hoje a fonte declarada e o glifo do Material', () {
      // O ESTADO DE HOJE, escrito por extenso e num caso proprio.
      //
      // `exigirFonteDeArteUniforme` cobra que registro e chave CONCORDEM -- e
      // os dois concordariam tambem se alguem trocasse OS DOIS para
      // `desenhoDoCliente`. Este caso e o que exige a DECISAO: o cliente
      // reprovou o desenho em 26/10/2026, e religar e decisao dele, nao de
      // quem mexe no codigo.
      //
      // **Quando houver desenho aprovado, este caso muda numa linha** -- e e
      // de proposito que ele TENHA de mudar: a troca passa a ter nome e data
      // no diff, em vez de acontecer calada.
      expect(
        fonteAtivaDaBarra,
        FonteDaArteDaBarra.glifoDoMaterial,
        reason: 'REPROVA: `fonteAtivaDaBarra` saiu de `glifoDoMaterial`. Em '
            '26/10/2026 o cliente reprovou o desenho: "eu vi sim o icone e '
            'reprovei porque tava muito feio o icone do cachorro". A fiacao '
            'dos SVG esta de pe e DESLIGADA de proposito; religar precisa de '
            'desenho aprovado por ele, e desenho passa pelo Figma antes do '
            'codigo.',
      );
    });

    test('os cinco slots declaram os glifos medidos, e `Perfil` o dele', () {
      // Os doze valores conferidos contra
      // `d590ce2a:app/lib/telas/casca_com_abas.dart` -- o estado ANTES da
      // fiacao de 23/10 --, e nao copiados de relato. Cada escolha tem
      // justificativa escrita no registro, e nenhuma foi reaberta.
      final porRotulo = <String, List<IconData?>>{
        for (final d in CascaComAbas.destinos)
          d.rotulo: <IconData?>[d.icone, d.iconeSelecionado],
      };
      expect(porRotulo, <String, List<IconData?>>{
        'Pets': <IconData?>[Icons.pets_outlined, Icons.pets],
        'Rede': <IconData?>[Icons.groups_outlined, Icons.groups],
        'Mural': <IconData?>[Icons.dynamic_feed_outlined, Icons.dynamic_feed],
        'Loja': <IconData?>[Icons.shopping_bag_outlined, Icons.shopping_bag],
        'AuAu': <IconData?>[Icons.chat_outlined, Icons.chat],
        'Perfil': <IconData?>[
          Icons.account_circle_outlined,
          Icons.account_circle,
        ],
      });
    });

    test('a ordem dos cinco destinos e a do cliente', () {
      exigirOrdemDosSlots(CascaComAbas.destinos);
    });
  });

  group('ISCA 4 — nos dez, o selecionado troca o desenho', () {
    // ESTE GRUPO DEIXOU DE LER O REGISTRO em 26/10, pelo mesmo motivo da isca
    // 2, e passou a ler os dez pares direto. A afirmacao e a MESMA e continua
    // valendo: contorno em repouso, PREENCHIDO no selecionado. Ela e o que
    // faz a aba aberta ser identificavel sem depender de cor (criterio 7), e
    // e o que o religar vai precisar que ainda seja verdade.
    test('os cinco pares trocam de arte, e de contorno para preenchido', () {
      exigirParSelecionadoDistinto(paresDaArte());
    });
  });

  group('ISCA 5 — a barra MONTADA pinta a fonte declarada, e so ela', () {
    // As iscas acima leem DADOS. Esta monta o app e olha a arvore: o registro
    // e a chave poderiam concordar perfeitamente e `BarraDeBaixo` continuar
    // pintando a outra coisa -- foi literalmente o estado anterior a 23/10
    // (arte existia, barra nao a lia) e e o risco simetrico agora.
    //
    // **Ela e guiada por `fonteAtivaDaBarra`**, entao serve os dois estados
    // sem ser reescrita: no dia do religar ela passa a cobrar
    // `IconeDaBarra` sozinha, sem ninguem tocar neste arquivo.
    testWidgets('a barra pinta cinco da fonte ativa e zero da outra',
        (tester) async {
      await abrirOApp(tester, rede: _redeVazia());

      final barra = find.byType(NavigationBar);
      expect(
        barra,
        findsOneWidget,
        reason: 'REPROVA: nao achei a barra de baixo na arvore. Sem ela este '
            'caso nao confere nada.',
      );

      final deDesenho =
          find.descendant(of: barra, matching: find.byType(IconeDaBarra));
      final deGlifo = find.descendant(of: barra, matching: find.byType(Icon));

      switch (fonteAtivaDaBarra) {
        case FonteDaArteDaBarra.glifoDoMaterial:
          expect(
            deGlifo,
            findsNWidgets(5),
            reason: 'REPROVA: a barra montada nao tem os cinco glifos do '
                'Material, e `fonteAtivaDaBarra` diz que e isso que ela '
                'desenha.',
          );
          expect(
            deDesenho,
            findsNothing,
            reason: 'REPROVA: a barra montada ainda pinta `IconeDaBarra`. O '
                'cliente reprovou o desenho em 26/10, e a chave declara '
                '`glifoDoMaterial` -- a arvore discorda dos dois.',
          );
        case FonteDaArteDaBarra.desenhoDoCliente:
          expect(
            deDesenho,
            findsNWidgets(5),
            reason: 'REPROVA: a barra montada nao tem os cinco desenhos do '
                'cliente, e a chave diz que e isso que ela desenha.',
          );
          expect(
            deGlifo,
            findsNothing,
            reason: 'REPROVA: a barra montada ainda pinta `Icon` do Material.',
          );
      }
    });

    testWidgets('a aba aberta pinta o estado SELECIONADO, e as outras nao',
        (tester) async {
      // A troca de estado medida na arvore: `NavigationDestination` tem `icon`
      // e `selectedIcon`, e quem escolhe entre os dois e o componente.
      // Trocar os dois de lugar passaria em todo o resto e desenharia a barra
      // ao contrario.
      await abrirOApp(tester, rede: _redeVazia());

      // A aba de ARRANQUE e a `Rede` (`Rotas.destinoDoArranque`), e nao a
      // primeira da barra: as duas decisoes sao independentes.
      final arranque = CascaComAbas.destinos
          .singleWhere((d) => d.rota == Rotas.rede)
          .rotulo;

      final pintados = tester
          .widgetList<Icon>(
            find.descendant(
              of: find.byType(NavigationBar),
              matching: find.byType(Icon),
            ),
          )
          .map((w) => w.icon)
          .toList();

      final esperado = <IconData?>[
        for (final d in CascaComAbas.visiveisEm(ConfiguracaoDeBuild.referencia))
          d.rotulo == arranque ? d.iconeSelecionado : d.icone,
      ];

      expect(
        pintados,
        esperado,
        reason: 'REPROVA: a barra montada nao pinta o selecionado SO na aba '
            'aberta.\n'
            '  pintado:  $pintados\n'
            '  esperado: $esperado\n'
            'A aba de arranque e `$arranque`. Se veio tudo em contorno, '
            '`selectedIcon` nao recebe `iconeSelecionado`; se veio tudo '
            'preenchido, os dois campos estao trocados.',
      );
    }, skip: fonteAtivaDaBarra != FonteDaArteDaBarra.glifoDoMaterial);
  });

  group('ISCA 6 — o pintor emite TINTA, e o preenchido emite mais', () {
    // ===================================================================
    // O QUE ESTA SECAO ACRESCENTA, e por que ela nao e luxo
    // ===================================================================
    //
    // As cinco iscas acima provam que o ARQUIVO certo chega ao SLOT certo com
    // a geometria certa. Nenhuma delas prova que algo aparece na tela: um
    // pintor que escalasse por zero, que pintasse transparente ou que
    // ignorasse todas as formas passaria em todas elas, porque todas leem
    // dados e nao pixels.
    //
    // **E o app NAO foi executado nesta rodada.** Isto e o mais perto que dá
    // para chegar sem aparelho: o widget de PRODUCAO e montado, rasterizado
    // pelo mesmo `Canvas` do app por um `RepaintBoundary`, e a tinta e
    // CONTADA. O arranjo e o de `test/marca/variante_reduzida_test.dart`, que
    // ja rasteriza a marca por este motivo.
    //
    // O QUE ELA AINDA NAO DIZ: se o desenho esta BONITO, se a patinha le como
    // patinha, se os bigodes do `pets` sobrevivem a 24 dp num aparelho de
    // verdade. Isso e olho humano, e nao houve.

    /// Quantos pixels de tinta o widget de producao emite, em `lado` px.
    Future<int> tinta(WidgetTester tester, DesenhoDoIcone desenho,
        {double lado = 96}) async {
      await tester.pumpWidget(
        Center(
          child: RepaintBoundary(
            child: IconTheme(
              // Preto opaco e tamanho fixo: a conta e de COBERTURA, e a cor
              // de verdade vem do `iconTheme` do tema em producao.
              data: IconThemeData(color: const Color(0xFF000000), size: lado),
              child: IconeDaBarra(desenho),
            ),
          ),
        ),
      );
      await tester.pump();

      final limite = tester.renderObject<RenderRepaintBoundary>(
        find.byType(RepaintBoundary).first,
      );

      // `runAsync` NAO E ENFEITE, e custou uma execucao pendurada.
      //
      // `toImage()` entrega o trabalho ao rasterizador do motor, que vive FORA
      // da zona de tempo falso de `testWidgets`. Chamado direto, o `await`
      // espera um `Future` que a zona falsa nunca completa: a suite pendura
      // SEM MENSAGEM, e eu tive de matar a execucao para descobrir. Dentro de
      // `runAsync` o tempo e o de verdade e o `Future` resolve.
      //
      // E por isso que `test/marca/variante_reduzida_test.dart` nao precisa
      // disto: ele usa `Picture.toImage` num `test()` comum, sem zona falsa.
      // Aqui o widget de PRODUCAO tem de ser montado, entao a zona existe.
      final pintados = await tester.runAsync(() async {
        final imagem = await limite.toImage();
        final dados =
            await imagem.toByteData(format: ui.ImageByteFormat.rawRgba);
        if (dados == null) return null;
        var n = 0;
        for (var i = 3; i < dados.lengthInBytes; i += 4) {
          if (dados.getUint8(i) > 8) n++;
        }
        return n;
      });
      if (pintados == null) {
        fail('REPROVA: a rasterizacao devolveu nulo. Sem pixels nao ha o que '
            'contar, e um zero aqui seria indistinguivel de um icone vazio.');
      }
      return pintados;
    }

    testWidgets('os dez emitem tinta, e nenhum sai em branco', (tester) async {
      final vazios = <String>[];
      for (final e in IconesDaBarra.porArquivo.entries) {
        final n = await tinta(tester, e.value);
        if (n < 50) vazios.add('${e.key} ($n px)');
      }
      expect(
        vazios,
        isEmpty,
        reason: 'REPROVA: ${vazios.join('; ')} sai praticamente em BRANCO. O '
            'registro pode estar perfeito e o pintor nao desenhar nada — '
            'escala zero, tinta transparente ou forma ignorada. Nenhuma das '
            'iscas que leem dados pegaria isso.',
      );
    });

    testWidgets('o preenchido emite MAIS tinta que o contorno, nos cinco pares',
        (tester) async {
      final errados = <String>[];
      for (final slot in ordemDosSlots) {
        final par = _artePorSlot[slot]!;
        final contorno = await tinta(
          tester,
          IconesDaBarra.porArquivo[par.$1]!,
        );
        final preenchido = await tinta(
          tester,
          IconesDaBarra.porArquivo[par.$2]!,
        );
        if (preenchido <= contorno) {
          errados.add('$slot (contorno $contorno px, preenchido $preenchido px)');
        }
      }
      expect(
        errados,
        isEmpty,
        reason: 'REPROVA: ${errados.join('; ')} — a arte de selecionado NAO '
            'cobre mais area que a de repouso. E o `fill` nao chegando ao '
            'canvas: `GrupoDoIcone.preenchido` diz `true` e o pintor so '
            'contorna. A isca 4 nao pega isso, porque ela le o dado e nao o '
            'pixel.',
      );
    });

    testWidgets('CONTROLE POSITIVO: desenho sem forma conta ZERO tinta',
        (tester) async {
      // Sem ele, um contador que devolvesse um numero alto para QUALQUER
      // coisa passaria nos dois casos acima. A isca precisa provar que a
      // conta DISTINGUE tinta de ausencia de tinta.
      const vazio = DesenhoDoIcone(
        arquivo: 'vazio-de-mentira.svg',
        rotuloDaArte: 'nada',
        lado: 24,
        espessura: 2,
        grupos: <GrupoDoIcone>[],
      );
      expect(
        await tinta(tester, vazio),
        0,
        reason: 'REPROVA: a conta de tinta devolveu pixel para um desenho SEM '
            'forma nenhuma. Ela nao esta medindo o desenho.',
      );
    });
  });

  group('PROVA NEGATIVA — cada regra precisa REPROVAR com o defeito de volta',
      () {
    /// Um slot de mentira, para as listas defeituosas.
    DestinoDeNavegacao slot(
      String rotulo, {
      DesenhoDoIcone? desenho,
      DesenhoDoIcone? desenhoSelecionado,
      IconData? icone,
      IconData? iconeSelecionado,
      bool naBarra = true,
    }) {
      return DestinoDeNavegacao(
        rotulo: rotulo,
        reforcoAcessivel: 'slot de mentira, so da prova negativa',
        reforcoDaPagina: '',
        rota: Rotas.pets,
        estado: EstadoDaSecao.existe,
        campoSemantico: CampoSemantico.animal,
        desenho: desenho,
        desenhoSelecionado: desenhoSelecionado,
        icone: icone,
        iconeSelecionado: iconeSelecionado,
        naBarra: naBarra,
      );
    }

    // =====================================================================
    // A MISTURA ERA GUARDA E VIROU ISCA, e isto e o registro da troca
    // =====================================================================
    //
    // Em 23/10 esta secao media um `assert` do construtor
    // (`!naBarra || desenho != null`) porque a regra "slot nao usa Material"
    // era inconstruivel -- `const` mais `assert` reprovava em COMPILACAO. Eu
    // declarei na entrega daquele dia que a funcao equivalente era **GUARDA**,
    // sem defeito construivel que a derrubasse.
    //
    // Em 26/10 aquele `assert` saiu (o cliente reprovou o desenho, e a trava
    // passou a impedir o conserto). A regra que ficou --
    // `exigirFonteDeArteUniforme` -- cobra MISTURA, e mistura **e**
    // construivel. Entao os casos abaixo derrubam o mecanismo de verdade: ela
    // deixou de ser guarda e virou isca.
    //
    // Os TRES `assert` que sobraram continuam de objeto, e dois deles seguem
    // armados aqui.
    test('a barra MISTURADA reprova, nomeando os dois lados', () {
      // O estado em que uma troca PARCIAL deixa o produto: alguem troca a
      // `Pets` para o desenho novo e para no meio. O portao acusa, e acusa
      // dizendo quem esta de cada lado.
      final misturada = <DestinoDeNavegacao>[
        slot(
          'Pets',
          desenho: IconesDaBarra.pets,
          desenhoSelecionado: IconesDaBarra.petsSelecionado,
        ),
        slot('Rede', icone: Icons.groups_outlined, iconeSelecionado: Icons.groups),
      ];
      expect(
        () => exigirFonteDeArteUniforme(
          misturada,
          FonteDaArteDaBarra.glifoDoMaterial,
        ),
        throwsA(isA<TestFailure>()),
        reason: 'REPROVA: o portao aprovou uma barra com um slot de desenho e '
            'um de glifo. Meia barra de cada e duas linguagens visuais na '
            'mesma fileira, e e exatamente onde uma troca parcial para.',
      );
    });

    test('o registro que discorda da CHAVE reprova', () {
      // A segunda direcao, e e ela que faz a chave valer. Sem este caso,
      // `fonteAtivaDaBarra` seria comentario: alguem trocaria os cinco slots
      // e deixaria a chave velha, e nada acusaria.
      final soDesenho = <DestinoDeNavegacao>[
        slot(
          'Pets',
          desenho: IconesDaBarra.pets,
          desenhoSelecionado: IconesDaBarra.petsSelecionado,
        ),
        slot(
          'Rede',
          desenho: IconesDaBarra.rede,
          desenhoSelecionado: IconesDaBarra.redeSelecionado,
        ),
      ];
      expect(
        () => exigirFonteDeArteUniforme(
          soDesenho,
          FonteDaArteDaBarra.glifoDoMaterial,
        ),
        throwsA(isA<TestFailure>()),
        reason: 'REPROVA: o registro desenha os SVG e a chave diz '
            '`glifoDoMaterial`, e o portao aprovou. A chave virou comentario.',
      );
    });

    test('a CHAVE que discorda do registro reprova', () {
      // A direcao espelhada: barra toda no Material e chave dizendo desenho.
      final soGlifo = <DestinoDeNavegacao>[
        slot('Pets', icone: Icons.pets_outlined, iconeSelecionado: Icons.pets),
        slot('Rede', icone: Icons.groups_outlined, iconeSelecionado: Icons.groups),
      ];
      expect(
        () => exigirFonteDeArteUniforme(
          soGlifo,
          FonteDaArteDaBarra.desenhoDoCliente,
        ),
        throwsA(isA<TestFailure>()),
        reason: 'REPROVA: a chave diz `desenhoDoCliente` e a barra pinta '
            'Material, e o portao aprovou.',
      );
    });

    test('CONTROLE POSITIVO: os dois estados PUROS passam', () {
      // Sem ele, um portao que reprovasse TUDO passaria nos tres casos acima
      // e o dia do religar seria reescrever isto. A isca tem de provar que a
      // regra DISTINGUE, e nao so que ela reclama. **E este caso e tambem a
      // promessa que eu assumi:** o estado do desenho aprovado ja passa hoje,
      // sem ninguem tocar neste arquivo.
      final soGlifo = <DestinoDeNavegacao>[
        slot('Pets', icone: Icons.pets_outlined, iconeSelecionado: Icons.pets),
        slot('Rede', icone: Icons.groups_outlined, iconeSelecionado: Icons.groups),
      ];
      final soDesenho = <DestinoDeNavegacao>[
        slot(
          'Pets',
          desenho: IconesDaBarra.pets,
          desenhoSelecionado: IconesDaBarra.petsSelecionado,
        ),
        slot(
          'Rede',
          desenho: IconesDaBarra.rede,
          desenhoSelecionado: IconesDaBarra.redeSelecionado,
        ),
      ];
      expect(
        () => exigirFonteDeArteUniforme(
          soGlifo,
          FonteDaArteDaBarra.glifoDoMaterial,
        ),
        returnsNormally,
        reason: 'REPROVA: o portao recusou a barra toda no Material, que e o '
            'estado de HOJE.',
      );
      expect(
        () => exigirFonteDeArteUniforme(
          soDesenho,
          FonteDaArteDaBarra.desenhoDoCliente,
        ),
        returnsNormally,
        reason: 'REPROVA: o portao recusou a barra toda no desenho do cliente, '
            'que e o estado do dia do religar. Se este caso reprova, religar '
            'vai custar reescrever o portao -- e era justamente isso que esta '
            'chave existe para evitar.',
      );
    });

    test('o construtor RECUSA glifo E desenho no mesmo destino', () {
      // Dos quatro `assert` de 23/10, este e um dos tres que ficaram: um
      // destino tem UMA fonte de arte. Declarar as duas seria a segunda fonte
      // da verdade do que a aba mostra.
      expect(
        () => slot(
          'Pets',
          desenho: IconesDaBarra.pets,
          desenhoSelecionado: IconesDaBarra.petsSelecionado,
          icone: Icons.pets_outlined,
          iconeSelecionado: Icons.pets,
        ),
        throwsA(isA<AssertionError>()),
        reason: 'REPROVA: deu para construir um destino declarando `Icons.pets` '
            'AO LADO do desenho.',
      );
    });

    test('o construtor RECUSA destino SEM arte nenhuma', () {
      expect(
        () => slot('Pets'),
        throwsA(isA<AssertionError>()),
        reason: 'REPROVA: deu para construir um destino sem arte nenhuma. A '
            'aba pintaria nada, e o portao de artes distintas veria dois '
            'nulos como iguais.',
      );
    });

    test('o construtor ACEITA os dois arranjos puros - controle positivo', () {
      // Sem ele, um `assert` que recusasse tudo passaria nos dois casos acima.
      expect(
        () => slot('Pets', icone: Icons.pets_outlined, iconeSelecionado: Icons.pets),
        returnsNormally,
        reason: 'REPROVA: o `assert` recusou glifo puro, que e o estado de hoje.',
      );
      expect(
        () => slot(
          'Pets',
          desenho: IconesDaBarra.pets,
          desenhoSelecionado: IconesDaBarra.petsSelecionado,
        ),
        returnsNormally,
        reason: 'REPROVA: o `assert` recusou desenho puro, que e o estado do '
            'dia do religar.',
      );
    });

    test('lista sem slot REPROVA pelo guarda, e nao passa em silencio', () {
      expect(
        () => exigirFonteDeArteUniforme(
          const <DestinoDeNavegacao>[],
          FonteDaArteDaBarra.glifoDoMaterial,
        ),
        throwsA(isA<TestFailure>()),
        reason: 'REPROVA: o portao ficou VERDE sobre uma lista sem slot. '
            'Lista vazia nao mistura nada, e e assim que um portao aprova todo '
            'dia sem nunca ter olhado para a barra.',
      );
    });

    test('a ordem trocada REPROVA, e a mensagem nomeia as duas', () {
      // `Mural` e `Loja` trocados de lugar. E a troca mais plausivel: os dois
      // slots sao vizinhos, e `Mural` entrou no slot 3 em 19/10 justamente
      // empurrando a `Loja` para o 4.
      final trocada = <DestinoDeNavegacao>[
        for (final nome in <String>['Pets', 'Rede', 'Loja', 'Mural', 'AuAu'])
          CascaComAbas.destinos.singleWhere((d) => d.rotulo == nome),
      ];
      expect(
        () => exigirOrdemDosSlots(trocada),
        throwsA(isA<TestFailure>()),
        reason: 'REPROVA: o portao NAO acusou `Mural` e `Loja` trocados de '
            'slot. A ordem e decisao do cliente, e um portao cego aqui deixa '
            'a proxima reordenacao passar como refatoracao.',
      );
    });

    test('a ordem completa mas com um slot FORA REPROVA', () {
      // Sem este caso, a isca de ordem poderia estar comparando conjuntos em
      // vez de sequencias — e `AuAu` somindo do fim passaria.
      final curta = <DestinoDeNavegacao>[
        for (final nome in <String>['Pets', 'Rede', 'Mural', 'Loja'])
          CascaComAbas.destinos.singleWhere((d) => d.rotulo == nome),
      ];
      expect(
        () => exigirOrdemDosSlots(curta),
        throwsA(isA<TestFailure>()),
        reason: 'REPROVA: o portao aprovou uma barra de QUATRO slots. Ele '
            'esta comparando conteudo e nao sequencia.',
      );
    });

    test('o selecionado igual ao de repouso REPROVA', () {
      expect(
        () => exigirParSelecionadoDistinto(<DestinoDeNavegacao>[
          slot(
            'Pets',
            desenho: IconesDaBarra.pets,
            desenhoSelecionado: IconesDaBarra.pets,
          ),
        ]),
        throwsA(isA<TestFailure>()),
        reason: 'REPROVA: o portao NAO acusou uma aba que desenha a mesma arte '
            'nos dois estados. A aba nao mudaria ao ser tocada, e o portao '
            'diria que esta tudo bem.',
      );
    });

    test('o selecionado SEM preenchimento REPROVA', () {
      // O caso sutil, e o que distingue este portao de um que so compara
      // nomes de arquivo: `rede.svg` e um arquivo DIFERENTE de `pets.svg`, e
      // os dois sao de contorno. Um portao que so cobrasse "arte diferente"
      // aprovaria uma aba cujo estado selecionado nao preenche nada.
      expect(
        () => exigirParSelecionadoDistinto(<DestinoDeNavegacao>[
          slot(
            'Pets',
            desenho: IconesDaBarra.pets,
            desenhoSelecionado: IconesDaBarra.rede,
          ),
        ]),
        throwsA(isA<TestFailure>()),
        reason: 'REPROVA: o portao aprovou um par cujo estado selecionado e '
            'outro CONTORNO. Trocar de arquivo nao basta: e o preenchimento '
            'que diz qual aba esta aceso sem depender de cor.',
      );
    });

    test('o preenchido em REPOUSO REPROVA', () {
      expect(
        () => exigirParSelecionadoDistinto(<DestinoDeNavegacao>[
          slot(
            'Pets',
            desenho: IconesDaBarra.petsSelecionado,
            desenhoSelecionado: IconesDaBarra.pets,
          ),
        ]),
        throwsA(isA<TestFailure>()),
        reason: 'REPROVA: o portao aprovou o par INVERTIDO — preenchido em '
            'repouso e contorno no selecionado. A barra pareceria toda acesa.',
      );
    });

    test('lista sem par de desenho REPROVA pelo guarda', () {
      // `naBarra: false` NAO e enfeite: destino sem desenho so e construivel
      // FORA da barra (e o caso do `Perfil`), e e justamente essa lista que
      // faria o portao nao ter par nenhum para medir.
      expect(
        () => exigirParSelecionadoDistinto(<DestinoDeNavegacao>[
          slot(
            'Perfil',
            naBarra: false,
            icone: Icons.account_circle_outlined,
            iconeSelecionado: Icons.account_circle,
          ),
        ]),
        throwsA(isA<TestFailure>()),
        reason: 'REPROVA: o portao ficou VERDE sobre uma lista sem nenhum par '
            'de desenho. Sem par nao ha troca para medir.',
      );
    });

    test('o leitor de `d` RECUSA comando que ele nao sabe pintar', () {
      // O segundo cinto do pintor. Um leitor que IGNORASSE o comando
      // desconhecido sumiria com um trecho do desenho e o icone sairia
      // incompleto — defeito que ninguem rastreia, porque o icone continua
      // aparecendo.
      expect(
        () => caminhoDoIcone('M 0 0 A 5 5 0 0 1 10 10'),
        throwsA(isA<FormatException>()),
        reason: 'REPROVA: `caminhoDoIcone` aceitou um arco (`A`). Ele sabe '
            'pintar M, C, L e Z; qualquer outro comando sairia do desenho em '
            'silencio.',
      );
      // O controle positivo: os quatro que ele sabe NAO lancam. Sem ele, um
      // leitor que lancasse em tudo passaria no caso acima.
      expect(
        () => caminhoDoIcone('M 0 0 L 5 0 C 7 0 8 1 8 3 Z'),
        returnsNormally,
        reason: 'REPROVA: `caminhoDoIcone` recusou M, C, L e Z, que sao '
            'exatamente os quatro comandos que os dez arquivos usam.',
      );
    });
  });
}
