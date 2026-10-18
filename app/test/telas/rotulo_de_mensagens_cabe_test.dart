// A MEDIDA do rotulo da secao de mensagens contra o slot de 64,0 dp.
//
// ## Por que este arquivo existe
//
// Em 19/10/2026 o cliente decidiu que `Mensagens` **vira secao da barra** e
// que o `Perfil` sai dela (vira uma foto pequena na barra de topo). Continuam
// cinco secoes, entao o portao de `casca_de_cinco_secoes_test.dart` continua
// satisfeito **em numero** -- mas o rotulo e novo, e rotulo novo se MEDE.
//
// A tabela `abasQueSairam` daquele arquivo registra dois rotulos que **ja
// reprovaram** neste mesmo slot: `Eventos` (7 letras, 71,57 dp) e `Escanear`
// (8 letras, 71,57 dp). `Mensagens` tem 9. Afirmar que cabe sem medir seria
// repetir exatamente o erro que aquele arquivo existe para impedir -- e a UX
// ja perdeu uma passada inteira medindo contra a fonte sintetica.
//
// ## O RESULTADO, medido em 18/10/2026
//
// `Mensagens` **NAO CABE**: quebra em duas linhas e transborda 5,0 dp nas
// CINCO larguras suportadas (320, 360, 375, 390 e 412 dp). Nao e so no
// aparelho estreito -- e em todos, porque o slot e `largura / 5` e o texto
// escala no mesmo passo.
//
// Medido junto, para a decisao ter alternativa em vez de so um "nao":
//
// | Rotulo      | Letras | 320 dp  |
// |-------------|--------|---------|
// | `Mensagens` | 9      | NAO cabe (2 linhas, 5,0 dp fora) |
// | `Conversas` | 9      | NAO cabe (2 linhas, 5,0 dp fora) |
// | `Recados`   | 7      | NAO cabe (2 linhas, 5,0 dp fora) |
// | `Recado`    | 6      | NAO cabe (2 linhas, 5,0 dp fora) |
// | `Avisos`    | 6      | **cabe** |
// | `Caixa`     | 5      | **cabe** |
// | `Chat`      | 4      | **cabe** |
//
// **Contar letra nao serve, e a linha de `Recado` prova**: ele tem as mesmas 6
// letras de `Avisos` e NAO cabe, porque `R`, `e`, `c`, `a`, `d`, `o` sao
// glifos largos e `A`, `v`, `i`, `s`, `o`, `s` nao. E por isso que a decisao
// sai desta bancada e nao de uma regra de contagem.
//
// **A escolha do rotulo nao e deste arquivo nem deste agente**: a barra e de
// quem a esta reestruturando, e `Avisos` colide com o aviso por push, que o
// app ja chama assim (`dispositivo/avisos.dart`). O que este arquivo entrega e
// o numero.
//
// A bancada e IMPORTADA de `casca_de_cinco_secoes_test.dart`, e nao copiada:
// se nao fosse a mesma, as duas medidas poderiam divergir e cada arquivo
// provaria outra coisa.
import 'package:flutter_test/flutter_test.dart';

import 'casca_de_cinco_secoes_test.dart'
    show carregarInter, larguras, medir, montarBarra;

/// A composicao que o cliente pediu em 19/10: `Perfil` SAI da barra e
/// `Mensagens` entra.
const List<String> composicaoPedida = <String>[
  'Pets',
  'Rede',
  'Perto',
  'Loja',
  'Mensagens',
];

/// A mesma composicao com o rotulo curto que a medida aprovou.
const List<String> composicaoComAvisos = <String>[
  'Pets',
  'Rede',
  'Perto',
  'Loja',
  'Avisos',
];

void main() {
  setUpAll(carregarInter);

  group('GUARDA: a bancada mede a Inter REAL', () {
    // Sem esta guarda a fonte sintetica (largura uniforme) mediria tudo igual
    // e NUNCA quebraria linha: os dois grupos abaixo ficariam verdes por estar
    // medindo outra coisa, e o numero deste arquivo viraria ficcao.
    testWidgets('"Mensagens" e mais largo que "iiiiiiiii"', (tester) async {
      const List<String> largo = <String>[
        'Pets',
        'Rede',
        'Perto',
        'Loja',
        'Mensagens',
      ];
      const List<String> estreito = <String>[
        'Pets',
        'Rede',
        'Perto',
        'Loja',
        'iiiiiiiii',
      ];
      await montarBarra(tester, rotulos: estreito, largura: 320);
      final transbordoEstreito = medir(tester, estreito, 320);
      expect(
        transbordoEstreito,
        isEmpty,
        reason: 'REPROVA: "iiiiiiiii" (nove `i`) NAO caberia no slot. Isso e '
            'assinatura de fonte de largura uniforme -- a `Inter` de '
            'assets/fonts/ nao carregou, e as medidas deste arquivo nao valem '
            'nada.',
      );
      await montarBarra(tester, rotulos: largo, largura: 320);
      expect(medir(tester, largo, 320), isNotEmpty);
    });
  });

  group('`Mensagens` NAO cabe no slot de 64,0 dp', () {
    for (final largura in larguras) {
      testWidgets('em ${largura.toInt()} dp ele quebra em duas linhas', (
        tester,
      ) async {
        await montarBarra(
          tester,
          rotulos: composicaoPedida,
          largura: largura,
        );
        final transbordos = medir(tester, composicaoPedida, largura);
        expect(
          transbordos.map((t) => t.rotulo).toList(),
          <String>['Mensagens'],
          reason: 'MEDIDA MUDOU em ${largura.toInt()} dp. Este caso nao e uma '
              'regra de estilo: ele e o registro de uma medicao de 18/10/2026 '
              'que diz que `Mensagens` transborda 5,0 dp e `Pets`, `Rede`, '
              '`Perto` e `Loja` nao.\n'
              'Se o conjunto mudou, a FONTE ou o tamanho do tema mudou, e a '
              'decisao sobre o rotulo da secao precisa ser remedida -- nao '
              'ajuste este numero sem reler o relatorio que o produziu.\n'
              'Encontrado: $transbordos',
        );
        expect(transbordos.single.linhas, 2);
      });
    }
  });

  group('CONTRAPESO: `Avisos` cabe nas cinco larguras', () {
    // Sem este grupo, uma bancada que reprovasse QUALQUER rotulo deixaria o
    // grupo de cima verde pelo motivo errado -- e a conclusao "nao cabe" seria
    // da bancada, e nao do rotulo.
    for (final largura in larguras) {
      testWidgets('em ${largura.toInt()} dp nenhum rotulo quebra', (
        tester,
      ) async {
        await montarBarra(
          tester,
          rotulos: composicaoComAvisos,
          largura: largura,
        );
        expect(
          medir(tester, composicaoComAvisos, largura),
          isEmpty,
          reason: 'REPROVA: `Avisos` deixou de caber em ${largura.toInt()} dp. '
              'Sem este contrapeso nao haria como saber se "Mensagens nao '
              'cabe" e sobre o rotulo ou sobre a bancada.',
        );
      });
    }
  });
}
