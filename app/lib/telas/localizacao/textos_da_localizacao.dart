/// A microcopia da captura de localizacao.
///
/// ## PROCEDENCIA: estes textos sao INVENCAO DESTA HISTORIA
///
/// Diferente de `avisos/antessala_de_aviso.dart`, que copiou `docs/05-ux-research.md`
/// secao 10.1 palavra por palavra, **o UX nao escreve a microcopia da
/// antessala de localizacao**. O que existe sao os criterios 3 e 4 da
/// BICHUS-23, e eles ditam a frase: o criterio 3 da o titulo e o corpo de F3.1
/// entre crases, e o criterio 4 da os de F3.5.
///
/// As frases que os criterios ditam estao marcadas `-- DO CRITERIO --` e nao
/// podem ser reescritas sem mudar a issue. Todo o resto deste arquivo esta
/// marcado `-- DEDUZIDO --`: sao as frases dos estados que os criterios nao
/// cobrem (o servico desligado, o GPS que nao fixa, a recusa definitiva, a
/// precisao), e **o cliente pode mexer nelas**. Elas nao sao decisao de
/// produto tomada em lugar nenhum: sao o default sensato de quem precisou
/// escrever alguma coisa para a tela nao ficar muda.
library;

abstract final class TextosDaLocalizacao {
  // -- DO CRITERIO 3 (F3.1, marcar perdido) --------------------------------
  //
  // "entao ela diz `De onde a gente deve avisar os tutores?` com `A gente usa
  // sua localizacao so para encontrar quem esta num raio de 5 km. Seu endereco
  // nao aparece para ninguem, nem no alerta, nem no cartaz.`, e oferece `Usar
  // minha localizacao` e `Prefiro digitar o bairro`."

  static const String tituloPerdido = 'De onde a gente deve avisar os tutores?';

  static const String corpoPerdido =
      'A gente usa sua localização só para encontrar quem está num raio de '
      '5 km. Seu endereço não aparece para ninguém, nem no alerta, nem no '
      'cartaz.';

  static const String usarMinhaLocalizacao = 'Usar minha localização';

  static const String preferoDigitarOBairro = 'Prefiro digitar o bairro';

  // -- DO CRITERIO 4 (F3.5, registrar achado avulso) ------------------------
  //
  // "entao ela diz `Onde voce achou esse pet?` com `Serve para a gente cruzar
  // com os tutores que estao procurando por perto.`"
  //
  // O criterio 4 NAO enumera os dois botoes, e eles sao os mesmos do criterio
  // 3 de proposito: a antessala e a mesma peca nos dois pontos de uso, e duas
  // duplas de rotulos diferentes para a mesma escolha seria a pessoa
  // reaprendendo o fluxo na segunda tela.

  static const String tituloAchado = 'Onde você achou esse pet?';

  static const String corpoAchado =
      'Serve para a gente cruzar com os tutores que estão procurando por '
      'perto.';

  // -- DEDUZIDO: a precisao ------------------------------------------------
  //
  // A BICHUS-23 pede que o app diga o que capturou sem prometer exatidao que
  // nao tem. "Localizacao capturada" sozinho promete um ponto; o aparelho
  // entregou um circulo, e ele sabe o raio.
  //
  // O numero aparece ARREDONDADO PARA CIMA em centenas de metros, e nao cru:
  // "cerca de 380 m" sugere uma medicao que a propria medicao nao sustenta.

  /// Quando o aparelho declara o raio.
  static String pontoComPrecisao(int metros) =>
      'Peguei sua localização aproximada, com cerca de $metros m de margem. '
      'Ninguém vê esse ponto: o que aparece é o bairro.';

  /// Quando o aparelho nao declara raio nenhum.
  static const String pontoSemPrecisao =
      'Peguei sua localização aproximada. Ninguém vê esse ponto: o que aparece '
      'é o bairro.';

  /// A saida de quem capturou e quer corrigir.
  ///
  /// E a unica correcao que esta historia oferece, porque `map_pin` exige
  /// mapa e mapa esta em *Fora desta historia*.
  static const String trocarPeloBairro = 'Trocar pelo bairro digitado';

  // -- DEDUZIDO: o bairro junto com o GPS ----------------------------------
  //
  // O caminho conservador da pergunta que foi para a pauta de refinamento. Ver
  // `OndeComPontoEArea`: sem isto, quem concede o GPS aparece na lista publica
  // sem rotulo de area, porque converter a coordenada em bairro e o que o
  // ADR-0006 proibe.

  static const String bairroOpcionalComGps =
      'Se quiser, diga o bairro. É ele que aparece para as outras pessoas '
      '— a gente não consegue descobrir o bairro sozinho a partir do ponto.';

  // -- DEDUZIDO: os cinco motivos de nao ter ponto -------------------------
  //
  // Cinco frases e nao uma, porque as cinco situacoes levam a acoes
  // diferentes. A generica ("nao foi possivel obter a localizacao") mandaria
  // quem esta com o servico desligado procurar uma permissao que ela ja deu.
  //
  // Nenhuma delas e apresentada como erro do fluxo: em todas, o campo de
  // bairro aparece e o envio continua possivel. E o criterio 5.

  static const String negouDestaVez =
      'Tudo bem. Diga o bairro e a cidade, e o resto funciona igual.';

  static const String negouEmDefinitivo =
      'A localização está bloqueada para o Bichu nos ajustes do aparelho. Você '
      'pode liberar lá, ou digitar o bairro aqui mesmo — os dois funcionam.';

  static const String abrirAjustes = 'Abrir os ajustes';

  static const String servicoDesligado =
      'A localização do aparelho está desligada. Você pode ligar nos ajustes, '
      'ou digitar o bairro aqui mesmo.';

  static const String semFixNoPrazo =
      'O aparelho não achou a localização a tempo. Acontece dentro de prédio e '
      'em garagem. Dá para tentar de novo ou digitar o bairro.';

  static const String tentarDeNovo = 'Tentar de novo';

  static const String indisponivel =
      'Este aparelho não tem localização disponível. Digite o bairro e a '
      'cidade.';

  // -- DEDUZIDO: os campos -------------------------------------------------

  static const String rotuloBairro = 'Bairro';
  static const String rotuloCidade = 'Cidade';
  static const String rotuloUf = 'UF';

  /// A cidade e o unico campo exigido, e o contrato concorda
  /// (`Area.required: [city]`).
  static const String cidadeObrigatoria = 'Diga ao menos a cidade.';

  /// O que a pessoa le enquanto o aparelho mede.
  static const String capturando = 'Procurando sua localização...';
}
