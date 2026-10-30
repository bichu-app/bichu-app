/// A microcopia da captura de localizacao.
library;

abstract final class TextosDaLocalizacao {

  static const String tituloPerdido = 'De onde a gente deve avisar os tutores?';

  static const String corpoPerdido =
      'A gente usa sua localização só para encontrar quem está num raio de '
      '5 km. Seu endereço não aparece para ninguém, nem no alerta, nem no '
      'cartaz.';

  static const String usarMinhaLocalizacao = 'Usar minha localização';

  static const String preferoDigitarOBairro = 'Prefiro digitar o bairro';

  static const String oQueCadaCaminhoPreenche =
      'O botão marca o ponto aproximado e preenche a cidade. Bairro e estado '
      'vêm do CEP, logo abaixo, ou você escreve.';

  static const String tituloAchado = 'Onde você achou esse pet?';

  static const String corpoAchado =
      'Serve para a gente cruzar com os tutores que estão procurando por '
      'perto.';

  /// Quando o aparelho declara o raio.
  static String pontoComPrecisao(int metros) =>
      'Peguei sua localização aproximada, com cerca de $metros m de margem. '
      'Ninguém vê esse ponto: o que aparece é o bairro.';

  /// Quando o aparelho nao declara raio nenhum.
  static const String pontoSemPrecisao =
      'Peguei sua localização aproximada. Ninguém vê esse ponto: o que aparece '
      'é o bairro.';

  /// A saida de quem capturou e quer corrigir.
  static const String trocarPeloBairro = 'Trocar pelo bairro digitado';

  static const String bairroOpcionalComGps =
      'Se quiser, diga o bairro. É ele que aparece para as outras pessoas '
      '— a gente não consegue descobrir o bairro sozinho a partir do ponto.';

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

  static const String rotuloBairro = 'Bairro';
  static const String rotuloCidade = 'Cidade';
  /// **"Estado", e nao "UF"** (cliente, 17/10/2026).
  static const String rotuloEstado = 'Estado';

  static const String escolherOEstado = 'Escolher na lista';

  /// A cidade e o unico campo exigido, e o contrato concorda (`Area.required:
  /// [city]`).
  static const String cidadeObrigatoria = 'Diga ao menos a cidade.';

  /// O que a pessoa le enquanto o aparelho mede.
  static const String capturando = 'Procurando sua localização...';

  static const String rotuloCep = 'CEP';

  static const String ajudaDoCep =
      'Preenche bairro, cidade e estado. Você pode mudar depois.';

  /// Os tres desfechos da busca de CEP.
  static const String buscandoOCep = 'Buscando o endereço…';

  static const String cepNaoEncontrado =
      'CEP não encontrado. Preencha abaixo.';

  static const String buscaDoCepIndisponivel =
      'Não deu para buscar o CEP agora. Preencha abaixo.';
}
