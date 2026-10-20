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
//   1. `geocoderAusente` e `falhaDoServico` nascem DENTRO de `_resolver`, que
//      chama `Geocoding()` -- canal de plataforma. Em teste ele nao responde, e
//      qualquer tentativa cai no `on Object` e vira `falhaDoServico`: nao da
//      para distinguir os dois aqui. Cobri-los exige aparelho, que este
//      projeto nao tem na esteira.
//
//      **ESTA LACUNA ENCOLHEU EM 20/10/2026, e encolheu de proposito.** A
//      escolha de QUAL CAMPO do `Placemark` e a cidade estava do lado de la
//      dessa fronteira, dentro do laco de `_resolver`, e por isso nunca foi
//      medida -- o codigo lia `locality` e mais nada, e no iOS isso falha em
//      lugar que o Android acerta. Ela virou `cidadeDoLugar`, funcao PURA, e
//      tem grupo proprio no fim deste arquivo. O que continua do outro lado e
//      a CHAMADA, nao a decisao.
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
// `Placemark` vem do pacote, e importa-lo AQUI e deliberado: a porta nao o
// reexporta, e passar a reexportar poria `locationFromAddress` ao alcance de
// todo arquivo que importa a porta -- o oposto do que a camada 1 de
// `sem_geocodificacao_test.dart` existe para garantir. O portao varre
// `app/lib` e nao `app/test`, e montar uma ficha de lugar nao e conversao
// nenhuma: nada sai deste processo.
import 'package:geocoding/geocoding.dart' show Placemark;
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

    test('os nove motivos de cidade existem, e os quatro da resolucao tambem', () {
      // Os cinco de ponto mais os QUATRO que nascem na resolucao. Se alguem
      // apagar `geocoderAusente` "porque nunca acontece", este caso reprova --
      // e ele acontece no Android: `isPresent()` existe no pacote por causa
      // dele. (No iOS ele e impossivel, e isso esta medido na prosa do enum.)
      //
      // `resolucaoSemResposta` entrou em 20/10/2026, separado de
      // `semFixNoPrazo`: os dois eram o mesmo valor, e "o aparelho nao fixou"
      // nao e "o servico de plataforma nao respondeu".
      expect(MotivoDeNaoTerCidade.values, hasLength(9));
      expect(
        MotivoDeNaoTerCidade.values,
        containsAll(<MotivoDeNaoTerCidade>[
          MotivoDeNaoTerCidade.geocoderAusente,
          MotivoDeNaoTerCidade.falhaDoServico,
          MotivoDeNaoTerCidade.semResultado,
          MotivoDeNaoTerCidade.resolucaoSemResposta,
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

  // =====================================================================
  // A ESCOLHA DO CAMPO, que era do lado de la do canal e nao era medida
  // =====================================================================
  //
  // **A causa que o iOS expoe e o Android esconde.** Ate 20/10/2026 a porta
  // lia `locality` e mais nada. No Android o `android.location.Geocoder`
  // preenche `locality` em praticamente todo lugar habitado; no iOS o
  // `CLGeocoder` deixa `locality` NULO em distrito, zona rural e cidade
  // pequena, e poe o municipio em `subAdministrativeArea`. Mesmo codigo, duas
  // plataformas, um lugar que funciona e outro que cai em `semResultado`.
  //
  // Os dois casos abaixo sao as DUAS DIRECOES, e nenhum deles e assercao
  // comum: um reprova se o degrau de reserva for apagado, o outro reprova se
  // alguem acrescentar um degrau que nao pode existir.
  group('`cidadeDoLugar` tem DOIS degraus, e os dois foram decididos', () {
    test('degrau 1: `locality` manda quando vem preenchida', () {
      expect(
        cidadeDoLugar(const Placemark(
          locality: 'Sao Paulo',
          subAdministrativeArea: 'Sao Paulo',
          administrativeArea: 'SP',
        )),
        'Sao Paulo',
      );
    });

    // DESLIGANDO: tire `lugar.subAdministrativeArea` da lista de
    // `cidadeDoLugar`, em `lib/dispositivo/localizacao.dart`. Este caso reprova
    // pelo nome, e e o defeito de verdade: no iOS o municipio chega aqui.
    test(
        'degrau 2: `locality` NULA cai em `subAdministrativeArea`, que e onde '
        'a Apple poe o municipio', () {
      expect(
        cidadeDoLugar(const Placemark(
          subAdministrativeArea: 'Mogi das Cruzes',
          administrativeArea: 'SP',
        )),
        'Mogi das Cruzes',
        reason: 'REPROVA: a Apple respondeu com o municipio em '
            '`subAdministrativeArea` e a porta devolveu ausencia. E o caminho '
            'que mandava distrito e cidade pequena para `semResultado` no '
            'iPhone enquanto o Android acertava.',
      );
    });

    // O CONTRAPESO, e ele e a metade que importa mais.
    //
    // DESLIGANDO: acrescente `lugar.administrativeArea` como terceiro degrau de
    // `cidadeDoLugar`. Este caso reprova pelo nome -- e sem ele o acrescimo
    // passaria, poria `SP` no filtro de CIDADE, e a tela diria "voce esta em
    // SP" sem ninguem reprovar nada.
    test('NAO ha degrau 3: `administrativeArea` e o ESTADO, e devolve nulo',
        () {
      expect(
        cidadeDoLugar(const Placemark(administrativeArea: 'SP')),
        isNull,
        reason: 'REPROVA: `administrativeArea` entrou na cadeia. O pacote o '
            'documenta como "the name of the state or province", e no Brasil '
            'ele vale `SP`. Cidade nenhuma se chama SP, e o recorte sairia '
            'errado com cara de acerto.',
      );
    });

    // O SEGUNDO CONTRAPESO: o bairro e PROIBIDO, nao apenas indesejado.
    //
    // DESLIGANDO: acrescente `lugar.subLocality` a cadeia. Este caso reprova
    // pelo nome. A emenda 1 do ADR-0006 autorizou coordenada -> CIDADE; o
    // nivel maximo publico e bairro+cidade (ADR-0010), e DERIVAR o bairro da
    // coordenada e mais fino que o que a pessoa escolheu entregar.
    test('NAO ha degrau de bairro: `subLocality` devolve nulo', () {
      expect(
        cidadeDoLugar(const Placemark(subLocality: 'Pinheiros')),
        isNull,
        reason: 'REPROVA: `subLocality` (o BAIRRO) entrou na cadeia de cidade. '
            'A emenda 1 do ADR-0006 autorizou coordenada -> cidade e so.',
      );
    });

    test('CONTRAPESO: `name` nao e cidade, e tambem devolve nulo', () {
      // No iOS `name` e o nome do PONTO: estabelecimento, ponto de interesse,
      // as vezes o numero da rua. Nada disso pertence a um filtro de cidade.
      expect(cidadeDoLugar(const Placemark(name: 'Parque Ibirapuera')), isNull);
    });

    test('campo so com espaco e a MESMA ausencia que campo nulo', () {
      // `''` e `'   '` sao a mesma coisa para quem le, e so um deles seria
      // pego por `isNotEmpty`. O que passou disso cairia como cidade vazia na
      // consulta.
      expect(
        cidadeDoLugar(const Placemark(locality: '   ', subAdministrativeArea: 'Santos')),
        'Santos',
      );
      expect(cidadeDoLugar(const Placemark(locality: '  ')), isNull);
    });
  });

  group('todo motivo tem um codigo, e e ele que vai para a tela', () {
    // O codigo e o que o cliente LE e nos repassa. Dois motivos com o mesmo
    // codigo fariam dois caminhos diferentes chegarem como o mesmo relato, que
    // e exatamente o defeito que esta frente consertou.
    test('os nove codigos existem e sao DISTINTOS', () {
      final codigos =
          MotivoDeNaoTerCidade.values.map((m) => m.codigo).toList();
      expect(codigos.where((c) => c.trim().isEmpty), isEmpty,
          reason: 'REPROVA: motivo com codigo vazio nao diz nada na tela.');
      expect(
        codigos.toSet(),
        hasLength(MotivoDeNaoTerCidade.values.length),
        reason: 'REPROVA: dois motivos compartilham codigo. O relato do '
            'cliente volta ambiguo, e foi para acabar com a ambiguidade que o '
            'codigo existe.',
      );
    });
  });
}
