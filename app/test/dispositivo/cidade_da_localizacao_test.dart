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
//      chamava `Geocoding()` direto -- canal de plataforma. Em teste ele nao
//      respondia, e qualquer tentativa caia no `on Object` e virava
//      `falhaDoServico`: nao dava para distinguir os dois aqui.
//
//      **ESTA LACUNA ABRIU EM 20/10/2026, e e preciso dizer que ela abriu sem
//      ser usada.** O prazo proprio da porta exigiu um seam
//      (`ServicoDeGeocodificacao`, em `lib/dispositivo/localizacao.dart`),
//      porque `Geocoding` monta o canal no proprio construtor e sem o seam nao
//      havia como pendurar a chamada de proposito. Com ele, `_resolver` passou
//      a ser alcancavel sem aparelho -- e o grupo do prazo, no fim deste
//      arquivo, e a primeira coisa a usar isso.
//
//      **O QUE CONTINUA SEM COBERTURA, e agora por ESCOLHA e nao por
//      impossibilidade:** `geocoderAusente` (servico respondendo `false`) e
//      `falhaDoServico` (servico lancando) passaram a ser dois casos curtos com
//      os dubles que este arquivo ja tem, e NAO foram escritos nesta rodada --
//      ela fechava a frente de localizacao e nada alem do pedido entrou. Fica
//      registrado por nome para quem voltar: a barreira era o canal, a barreira
//      saiu, e o que falta e escrever.
//
//      O que continua exigindo APARELHO e outra coisa, e menor: a FORMA do erro
//      de cada plataforma -- o `PigeonError` unico do iOS, o `IO_ERROR` do
//      Android. Nenhum duble pode produzir isso com fidelidade, e e por isso
//      que o detalhe da faixa existe e vai no build do cliente.
//
//      **ESTA LACUNA ENCOLHEU EM 20/10/2026, e encolheu de proposito.** A
//      escolha de QUAL CAMPO do `Placemark` e a cidade estava do lado de la
//      dessa fronteira, dentro do laco de `_resolver`, e por isso nunca foi
//      medida -- o codigo lia `locality` e mais nada, e no iOS isso falha em
//      lugar que o Android acerta. Ela virou `cidadeDoLugar`, funcao PURA, e
//      tem grupo proprio no fim deste arquivo. O que continua do outro lado e
//      a CHAMADA, nao a decisao.
//   2. A MEMORIA DA GRADE DE ~100 m: ela so e consultada depois de uma
//      resolucao ter dado certo, e antes do seam nenhuma dava certo sem
//      plataforma. **Pelo mesmo seam, isto tambem passou a ser escrevivel** --
//      `_GeocodificacaoQueResponde` mais `resolucoesPedidas` bastam --, e
//      tambem nao foi escrito nesta rodada, pelo mesmo motivo. Quem mede "uma
//      resolucao por abertura" hoje e a isca da TELA, pelo contador do duble.
//
// Nao ha caso aqui que finja cobrir nenhuma das duas. Caso que passa com o
// mecanismo desligado e pior que a lacuna, porque ele a esconde -- e nesta
// rodada dez portoes cegos foram achados exatamente assim.

import 'dart:async';

import 'package:bichu/dispositivo/localizacao.dart';
// A TELA entra aqui por UM caso so: o que cobra que o prazo da porta estoure
// ANTES do teto da tela. Os dois numeros tem de ser comparados em algum lugar,
// e compara-los exige ver os dois -- um comentario dizendo "este e menor"
// seria a mesma prosa nao medida que esta frente inteira veio consertar.
import 'package:bichu/telas/perdido/lista_de_perdidos.dart'
    show tetoDaEsperaDaResolucao;
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
  _PortaComPontoTrocado(this.captura, {super.geocodificacao});

  final ResultadoDaCaptura captura;

  @override
  Future<ResultadoDaCaptura> pontoAproximado({required Duration prazo}) async =>
      captura;
}

/// O SERVICO QUE ACEITA A CHAMADA E **NUNCA** RESPONDE.
///
/// **Um `Completer` sem `complete`, e nao um atraso.** A diferenca e o caso
/// inteiro: um dublê que DEMORA passa com o defeito de volta, porque o `await`
/// cru acaba resolvendo e o caso fica verde sem nenhum prazo existir. Um
/// `Future` que nunca completa nao lanca, e `try/catch` nao pega travamento --
/// por isso a unica coisa que pode salvar a porta e um `.timeout`, e por isso
/// este dublê mede o `.timeout` e nada mais.
///
/// [pendurarOPresente] escolhe QUAL das duas chamadas pendura: as duas
/// atravessam o mesmo canal, e as duas precisavam de prazo.
class _GeocodificacaoQueNuncaResponde implements ServicoDeGeocodificacao {
  _GeocodificacaoQueNuncaResponde({this.pendurarOPresente = false});

  final bool pendurarOPresente;

  /// Os `Completer` ficam guardados de proposito: um `Completer` local seria
  /// coletado, e o caso perderia a razao de estar penduado.
  final Completer<bool> _presente = Completer<bool>();
  final Completer<List<Placemark>> _lugares = Completer<List<Placemark>>();

  @override
  Future<bool> geocoderPresente() =>
      pendurarOPresente ? _presente.future : Future<bool>.value(true);

  @override
  Future<List<Placemark>> lugaresDoPonto(double lat, double lon) =>
      _lugares.future;
}

/// O CONTRAPESO: o servico que responde na hora, e com cidade.
///
/// Sem ele, os casos do prazo seriam satisfeitos por uma porta que desiste
/// SEMPRE -- e "desiste sempre" nao e prazo, e a resolucao de cidade deixaria
/// de existir em silencio.
class _GeocodificacaoQueResponde implements ServicoDeGeocodificacao {
  @override
  Future<bool> geocoderPresente() async => true;

  @override
  Future<List<Placemark>> lugaresDoPonto(double lat, double lon) async =>
      <Placemark>[const Placemark(locality: 'Campinas')];
}

/// Um ponto qualquer: o que se mede aqui e a etapa DEPOIS do ponto.
const _pontoBom = CapturaComPonto(
  PontoCapturado(
    lat: -22.9099,
    lon: -47.0626,
    precisaoEmMetros: 700,
    origem: OrigemDoPonto.deviceGps,
  ),
);

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

  /// ====================================================================
  /// O PRAZO E DA PORTA, E NAO SO DO CHAMADOR -- 20/10/2026
  /// ====================================================================
  ///
  /// `placemarkFromCoordinates` era um `await` cru dentro de um `try`, e o
  /// unico teto que existia vivia no CHAMADOR (`tetoDaEsperaDaResolucao`, na
  /// tela dos Pets). A tela estava coberta; a PORTA nao -- qualquer outro
  /// chamador futuro penduraria sem limite, e quem escreve a segunda tela nao
  /// tem como saber que precisa lembrar de um `.timeout`.
  ///
  /// **MESMA FAMILIA DE UM DEFEITO FECHADO HOJE EM OUTRA FRENTE**, e a licao e
  /// a mesma: `try/catch` nao pega travamento, e `Future` que nunca completa
  /// nao lanca. A isca TEM de usar dublê que nunca completa; com um que demora
  /// ela passa com o defeito de volta.
  group('a porta tem prazo proprio para o geocoder', () {
    const prazo = LocalizacaoPorGeolocator.prazoDoGeocoder;

    /// O CASO CENTRAL.
    ///
    /// DESLIGANDO: apague o `.timeout(prazoDoGeocoder)` da chamada a
    /// `lugaresDoPonto`. Este caso **nao reprova: ele PENDURA**, e o `timeout`
    /// da suite o mata -- que e o sintoma certo, porque e exatamente o que o
    /// aparelho da pessoa faria.
    test('geocoder que nunca responde vira `resolucaoSemResposta`', () async {
      final porta = _PortaComPontoTrocado(
        _pontoBom,
        geocodificacao: _GeocodificacaoQueNuncaResponde(),
      );

      final resultado = await porta.cidadeAproximada(prazo: prazo * 3);

      expect(
        resultado,
        isA<CidadeNaoResolvida>().having((r) => r.motivo, 'motivo',
            MotivoDeNaoTerCidade.resolucaoSemResposta),
        reason: 'REPROVA: o servico de plataforma aceitou a chamada e nunca '
            'respondeu, e a porta nao desistiu por conta propria. O teto da '
            'TELA ainda cobriria a tela dos Pets, e nenhum outro chamador '
            'estaria coberto -- e e a porta que concentra o que as telas nao '
            'devem lembrar.',
      );
      expect(
        (resultado as CidadeNaoResolvida).detalhe,
        contains('geocoder sem resposta'),
        reason: 'REPROVA: o detalhe nao diz que foi o GEOCODER que pendurou. '
            'Com o motivo so, "a tela desistiu" e "a porta desistiu na etapa '
            'do nome" chegam iguais no relato do cliente. Detalhe recebido: '
            '${resultado.detalhe}',
      );
    });

    /// `isPresent` ATRAVESSA O MESMO CANAL, e tambem pendura.
    ///
    /// DESLIGANDO: apague o `.timeout` de `geocoderPresente()`. Este caso
    /// pendura, pelo mesmo motivo do caso acima.
    test('`isPresent` que nunca responde tambem vira `resolucaoSemResposta`',
        () async {
      final porta = _PortaComPontoTrocado(
        _pontoBom,
        geocodificacao:
            _GeocodificacaoQueNuncaResponde(pendurarOPresente: true),
      );

      final resultado = await porta.cidadeAproximada(prazo: prazo * 3);

      expect(
        resultado,
        isA<CidadeNaoResolvida>().having((r) => r.motivo, 'motivo',
            MotivoDeNaoTerCidade.resolucaoSemResposta),
        reason: 'REPROVA: `isPresent` pendurou e a porta nao desistiu, ou '
            'desistiu chamando isso de `geocoderAusente`. PENDURAR NAO E "NAO '
            'TER": o aparelho que responde "nao tenho" e `geocoderAusente`; o '
            'que nao responde nada e o servico sem resposta.',
      );
    });

    /// CONTRAPESO, E ELE E OBRIGATORIO.
    ///
    /// Sem este caso, uma porta que devolvesse `resolucaoSemResposta` SEMPRE
    /// satisfaria os dois acima -- e a resolucao de cidade teria deixado de
    /// existir em silencio, que e o defeito mais caro desta frente.
    test('CONTRAPESO: servico que responde na hora resolve a cidade', () async {
      final porta = _PortaComPontoTrocado(
        _pontoBom,
        geocodificacao: _GeocodificacaoQueResponde(),
      );

      final resultado = await porta.cidadeAproximada(prazo: prazo);

      expect(
        resultado,
        isA<CidadeResolvida>().having((r) => r.cidade, 'cidade', 'Campinas'),
        reason: 'REPROVA: o servico respondeu com cidade e a porta nao a '
            'resolveu. Um prazo que desiste de tentativa boa e pior que prazo '
            'nenhum.',
      );
    });

    /// O PRAZO DA PORTA ESTOURA ANTES DO DA TELA, e isso e deliberado: quem
    /// desiste primeiro e quem sabe dizer em que ETAPA foi.
    test('o prazo da porta e menor que o teto da tela dos Pets', () {
      expect(
        prazo,
        lessThan(tetoDaEsperaDaResolucao),
        reason: 'REPROVA: o prazo da porta (${prazo.inSeconds}s) nao e menor '
            'que o teto da tela (${tetoDaEsperaDaResolucao.inSeconds}s). Com '
            'ele maior, quem desiste primeiro e a tela, e o motivo especifico '
            'da etapa do geocoder nunca chega ao relato -- o prazo da porta '
            'passaria a ser codigo morto.',
      );
    });
  });
}
