// A RESOLUCAO DE CIDADE NA PORTA DO APARELHO
// (ADR-0006, emenda 1 de 19/10/2026: *"autorizar o gps, e trazer algum valor
// padrao em caso de fallback"*).
//
// POR QUE ESTE ARQUIVO EXISTE, e e uma lacuna MEDIDA e nao suposta.
//
// As cinco iscas de reserva da pagina de pets
// (`test/telas/perdidos_e_meus_achados_test.dart`, grupo 1-C) injetam o motivo
// pronto no duble da porta. Elas provam que **a TELA cai para a reserva** em
// cada motivo, e provam bem. O que elas **nao** provam e que a porta de
// verdade PRODUZ o motivo certo em cada condicao: com o motivo injetado, um
// `cidadeAproximada` que devolvesse sempre o mesmo valor passaria nas cinco.
//
// Este arquivo fecha a metade que da para fechar sem aparelho: a TRADUCAO dos
// cinco motivos de ponto nos cinco motivos de cidade, e a normalizacao do
// nome. A traducao e um `switch` exaustivo, e `switch` exaustivo e justamente
// onde um mapeamento TROCADO passa despercebido -- o compilador exige que
// todos os ramos existam, nao que cada um aponte para o lugar certo.
//
// ====================================================================
// O QUE CONTINUA SEM COBERTURA, DITO EM VOZ ALTA
// ====================================================================
//
//   1. `geocoderAusente`, `tetoDeUsoEstourado` e `semResultado` nascem DENTRO
//      de `_resolver`, que chama `Geocoding()` -- canal de plataforma. Em
//      teste de widget ele nao responde, e qualquer tentativa cai no
//      `on Object` e vira `tetoDeUsoEstourado`: nao da para distinguir os tres
//      aqui. Cobri-los exige aparelho, que este projeto nao tem na esteira.
//   2. A MEMORIA DA GRADE DE ~100 m, pelo mesmo motivo: ela so e consultada
//      depois de uma resolucao ter dado certo, e nenhuma da certo sem
//      plataforma. O contador `resolucoesPedidas` existe na porta para quando
//      houver onde medir; quem mede "uma resolucao por abertura" hoje e a isca
//      da TELA, pelo contador do duble.
//
// Nao ha caso aqui que finja cobrir nenhuma das duas. Caso que passa com o
// mecanismo desligado e pior que a lacuna, porque ele a esconde -- e nesta
// rodada dez portoes cegos foram achados exatamente assim.

import 'package:bichu/dispositivo/localizacao.dart';
import 'package:flutter_test/flutter_test.dart';

/// Uma porta de PRODUCAO com o ponto trocado, e o resto intacto.
///
/// E `LocalizacaoPorGeolocator` de verdade: a traducao medida abaixo e a dela,
/// e nao uma copia escrita no teste. O que muda e so de onde o ponto vem.
class _PortaComPontoTrocado extends LocalizacaoPorGeolocator {
  _PortaComPontoTrocado(this.captura);

  final ResultadoDaCaptura captura;

  @override
  Future<ResultadoDaCaptura> pontoAproximado({required Duration prazo}) async =>
      captura;
}

void main() {
  group('a porta traduz os cinco motivos de PONTO em motivos de CIDADE', () {
    // O par esperado, escrito por extenso. Um `switch` que mandasse
    // `servicoDesligado` para `permissaoNegada` COMPILA, e a tela mandaria
    // quem tem o GPS desligado para a tela de permissao que ela ja concedeu --
    // que e o defeito que o cabecalho da propria porta registra.
    const esperado = <MotivoDeNaoTerPonto, MotivoDeNaoTerCidade>{
      MotivoDeNaoTerPonto.permissaoNegada: MotivoDeNaoTerCidade.permissaoNegada,
      MotivoDeNaoTerPonto.permissaoNegadaPermanentemente:
          MotivoDeNaoTerCidade.permissaoNegadaPermanentemente,
      MotivoDeNaoTerPonto.servicoDesligado:
          MotivoDeNaoTerCidade.servicoDesligado,
      MotivoDeNaoTerPonto.semFixNoPrazo: MotivoDeNaoTerCidade.semFixNoPrazo,
      MotivoDeNaoTerPonto.indisponivel: MotivoDeNaoTerCidade.indisponivel,
    };

    test('os cinco motivos de ponto estao TODOS no mapa esperado', () {
      // Sem isto, acrescentar um sexto motivo de ponto deixaria os casos
      // abaixo medindo cinco de seis, e o novo passaria sem traducao
      // conferida. Filtro que nao filtra termina verde.
      expect(
        esperado.keys.toSet(),
        MotivoDeNaoTerPonto.values.toSet(),
        reason: 'REPROVA: `MotivoDeNaoTerPonto` mudou e este mapa nao. Motivo '
            'sem traducao conferida e caminho que ninguem mediu.',
      );
    });

    for (final par in esperado.entries) {
      test('`${par.key.name}` vira `${par.value.name}`', () async {
        final porta = _PortaComPontoTrocado(CapturaSemPonto(par.key));
        final resultado =
            await porta.cidadeAproximada(prazo: const Duration(seconds: 1));
        expect(
          resultado,
          isA<CidadeNaoResolvida>()
              .having((r) => r.motivo, 'motivo', par.value),
          reason: 'REPROVA: o ponto falhou por `${par.key.name}` e a cidade '
              'reportou outro motivo. A tela trata os oito igual, mas o motivo '
              'errado apaga o registro do que de fato aconteceu.',
        );
      });
    }

    test('os oito motivos de cidade existem, e os tres da resolucao tambem', () {
      // Os cinco de ponto mais os tres que nascem na resolucao. Se alguem
      // apagar `geocoderAusente` "porque nunca acontece", este caso reprova --
      // e ele acontece: `isPresent()` existe no pacote por causa dele.
      expect(MotivoDeNaoTerCidade.values, hasLength(8));
      expect(
        MotivoDeNaoTerCidade.values,
        containsAll(<MotivoDeNaoTerCidade>[
          MotivoDeNaoTerCidade.geocoderAusente,
          MotivoDeNaoTerCidade.tetoDeUsoEstourado,
          MotivoDeNaoTerCidade.semResultado,
        ]),
      );
    });
  });

  group('`CidadeResolvida` normaliza o espaco, porque o banco nao normaliza', () {
    // MEDIDO em 19/10/2026 contra `texto_para_busca`, que e a funcao dos DOIS
    // lados da comparacao de cidade no servidor: ela absorve acento e caixa, e
    // NAO absorve espaco. `'São  Paulo'` normaliza para `'sao  paulo'` e nao
    // casa com `'sao paulo'`; `' São Paulo '` tambem nao. Como o nome vem da
    // plataforma, que decide a forma dele, o espaco tem de morrer aqui.
    //
    // DESLIGANDO: tire o `.replaceAll(RegExp(r'\s+'), ' ')` do construtor de
    // `CidadeResolvida` em `lib/dispositivo/localizacao.dart`. Os dois casos
    // de espaco duplo reprovam pelo nome.
    test('apara a borda e colapsa o meio', () {
      expect(CidadeResolvida('  São Paulo  ').cidade, 'São Paulo');
      expect(CidadeResolvida('São  Paulo').cidade, 'São Paulo');
      expect(CidadeResolvida('São \t Paulo').cidade, 'São Paulo');
    });

    test('CONTRAPESO: o acento e a caixa NAO sao tocados aqui', () {
      // Quem normaliza acento e caixa e o banco, dos dois lados. Fazer isso
      // aqui tambem mandaria `sao paulo` para a TELA, que mostra a cidade a
      // pessoa -- e ela mora em `São Paulo`, com acento e com maiuscula.
      expect(CidadeResolvida('São Paulo').cidade, 'São Paulo');
      expect(CidadeResolvida('SÃO PAULO').cidade, 'SÃO PAULO');
    });
  });
}
