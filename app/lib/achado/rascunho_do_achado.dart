/// O que a pessoa preencheu em F3.5, entre a tela e o envio.
///
/// **Vive fora de `telas/` de proposito**, pelo mesmo motivo de
/// `perdido/rascunho_do_caso.dart`: o que esta aqui e regra -- o que o
/// formulario exige, o que ele aceita vazio e o que impede o envio --, e regra
/// que so se exercita montando widget e regra que fica sem isca.
///
/// ## O QUE O FORMULARIO EXIGE, e de onde vem cada exigencia
///
/// A lista **nao** foi escolhida por desenho: ela e `StrayFoundReportInput` do
/// contrato, lido campo a campo.
///
/// ```yaml
/// required: [species, size, found_at]
/// anyOf:
///   - required: [location]
///   - required: [area]
/// ```
///
/// Sao quatro coisas, e todas as quatro **quem acha um cao na rua consegue
/// responder olhando para ele**:
///
/// - `species`: cao, gato ou outro. Ve-se;
/// - `size`: P, M, G ou GG. Ve-se;
/// - `found_at`: quando. Quem achou sabe;
/// - `location` **ou** `area`: onde. A captura de localizacao resolve os dois
///   ramos, e o ramo digitado pede so a cidade (`Area.required: [city]`).
///
/// E o resto do contrato e **opcional**, campo a campo: `breed_code`,
/// `breed_free_text`, `ref_data_version`, `primary_color_code`, `sex`,
/// `share_token`, `notes`, `photo_upload_id`. Nada que quem acha um animal na
/// rua nao tenha como saber -- raca, idade, nome -- e exigido, e e isto que o
/// titulo da historia decide: *"com o que da para ver"*.
///
/// **Se o contrato passar a exigir um desses, o lugar do conserto e o
/// contrato.** A isca `porta_da_frente_test.dart` reprova se esta tela comecar
/// a exigir alem dos quatro.
library;

import '../api/modelos_localizacao.dart';
import '../api/modelos_pet.dart';
import '../dispositivo/camera_e_galeria.dart';
import '../dispositivo/localizacao.dart';
import '../perdido/quando_foi_visto.dart';

/// O motivo pelo qual `Registrar` esta desabilitado, ou nulo quando ele nao
/// esta.
///
/// Um tipo, e nao um booleano com um texto ao lado, pela mesma razao de
/// `ImpedimentoDeContinuar`: botao desabilitado sem motivo dito e desenho
/// preguicoso, e enquanto o motivo for um `String?` solto alguem desabilita o
/// botao sem preenche-lo e ninguem ve.
///
/// **A lista tem exatamente os campos que o contrato exige, e mais nenhum.**
/// Acrescentar um item aqui e acrescentar uma exigencia ao formulario.
enum ImpedimentoDeRegistrar {
  semEspecie('Diga se é cachorro, gato ou outro bicho.'),
  semPorte('Diga o tamanho, do jeito que deu para ver.'),
  semOnde('Diga onde você achou: use a localização ou escreva a cidade.'),
  semQuando('Diga quando você achou.'),
  semData('Escolha a data em que você achou.'),
  dataNoFuturo(dataNoFuturoTexto);

  const ImpedimentoDeRegistrar(this.texto);

  final String texto;
}

/// O texto de futuro vem do modulo de regra, e nao e redigitado aqui: a borda
/// do servidor usa a mesma frase, e duas redacoes da mesma recusa fazem quem
/// le a tela achar que sao duas coisas diferentes.
const String dataNoFuturoTexto = dataNoFuturo;

/// O rascunho do achado.
///
/// `ChangeNotifier` porque ele atravessa a tela, a barra de acao fixa e o
/// trecho de captura de localizacao: sem notificacao, o campo que so chama
/// `atualizar` grava o valor **sem redesenhar**, que foi o defeito da
/// BICHUS-156 no cadastro de pet.
class RascunhoDoAchado {
  RascunhoDoAchado({
    this.especie,
    this.porte,
    this.sexo,
    this.racaCodigo,
    this.corCodigo,
    this.versaoDaReferencia,
    this.quando,
    this.dataEscolhida,
    this.onde,
    this.observacao = '',
    this.shareToken,
    this.foto,
  });

  /// `StrayFoundReportInput.species`. **Exigido pelo contrato.**
  Especie? especie;

  /// `StrayFoundReportInput.size`. **Exigido pelo contrato.**
  Porte? porte;

  /// `sex`. Opcional: um animal assustado no colo nao se examina.
  Sexo? sexo;

  /// `breed_code`. Opcional, e **so da lista fechada**.
  ///
  /// Nao ha `breed_free_text` nesta tela, e a ausencia e decisao. O contrato
  /// so aceita o texto livre junto de `breed_code` em `outro_<especie>`, e o
  /// par certo depende de a pessoa escolher a saida da lista primeiro -- um
  /// erro que o cadastro de pet evita com um campo que aparece e some. Aqui
  /// quem digita a raca e quem acha um animal na rua e nao sabe a raca: o
  /// campo seria uma pergunta que produz falso negativo no cruzamento
  /// (criterio 8) e nenhum ganho. O que ela quiser dizer cabe em `notes`.
  String? racaCodigo;

  /// `primary_color_code`. Opcional, lista fechada de `reference-data`.
  ///
  /// **Rotulada em texto, nunca amostra de cor sem nome** (criterio 2). Quem
  /// escolhe e `SeletorDeLista`, que so conhece rotulo.
  String? corCodigo;

  /// `ref_data_version`: a versao da lista **que o cliente tinha em maos**.
  String? versaoDaReferencia;

  /// O `Quando?`, na mesma forma de F3.1. **Exigido pelo contrato**
  /// (`found_at`).
  QuandoFoiVisto? quando;

  /// So usada com [QuandoFoiVisto.outraData].
  DateTime? dataEscolhida;

  /// O `onde`, como a captura de localizacao o publica. **Exigido pelo
  /// contrato**, num dos dois ramos do `anyOf`.
  Onde? onde;

  /// `notes`. Opcional.
  String observacao = '';

  /// `share_token`: so existe para quem chegou pelo push de um caso
  /// especifico (criterio 10). Nao ha campo na tela, e nao deve haver: ele
  /// vem do link, e nao dos dedos de ninguem.
  String? shareToken;

  /// A foto, **no aparelho**.
  ///
  /// Nao vai em [campos] e nao vai no corpo do registro. O contrato declara
  /// `photo_upload_id`, mas nao existe valor que se possa honrar antes do
  /// registro: `createFoundReportPhotoUploadIntent` exige `found_report_id` no
  /// corpo, ou seja, exige que o achado ja exista. A foto e o passo seguinte,
  /// sempre -- que e exatamente o que o criterio 4 descreve.
  FotoLocal? foto;

  /// O teto de `StrayFoundReportInput.notes` no contrato.
  static const int limiteDaObservacao = 1000;

  DateTime? instanteEm(DateTime agora) => instanteDoAvistamento(
        quando,
        agora: agora,
        dataEscolhida: dataEscolhida,
      );

  /// O que impede `Registrar`, na ordem em que a tela resolve.
  ///
  /// A ordem e a ordem da tela, de cima para baixo: quem le o motivo procura
  /// o campo, e mandar a pessoa para o fim do formulario quando o primeiro
  /// campo e que falta e mandar ela procurar.
  ImpedimentoDeRegistrar? impedimentoEm(DateTime agora) {
    if (especie == null) return ImpedimentoDeRegistrar.semEspecie;
    if (porte == null) return ImpedimentoDeRegistrar.semPorte;
    if (onde == null) return ImpedimentoDeRegistrar.semOnde;
    if (quando == null) return ImpedimentoDeRegistrar.semQuando;
    final instante = instanteEm(agora);
    if (instante == null) return ImpedimentoDeRegistrar.semData;
    if (estaNoFuturo(instante, agora: agora)) {
      return ImpedimentoDeRegistrar.dataNoFuturo;
    }
    return null;
  }

  bool podeRegistrarEm(DateTime agora) => impedimentoEm(agora) == null;

  /// Tem ponto, e portanto o cruzamento tem o criterio de distancia.
  ///
  /// Sem ponto, o cruzamento **nao deixa de existir**: ele passa a valer
  /// dentro da mesma cidade (criterio 6). A tela usa isto para dizer a
  /// verdade, e **nunca** para bloquear o envio.
  bool get temCoordenada => onde?.temCoordenada ?? false;

  /// Tem rotulo de area para aparecer com bairro e cidade.
  ///
  /// **Esta e a pergunta que a coordenada nao responde.** `area_label` e
  /// montado no servidor a partir dos campos DIGITADOS (`rotuloDaArea` le
  /// `city` e `neighborhood`, e nada mais), e derivar bairro de coordenada e
  /// o que o ADR-0006 proibe. Entao um achado so com GPS chega sem rotulo
  /// nenhum -- e a tela precisa dizer isso em vez de deixar a pessoa
  /// descobrir depois.
  bool get temRotuloDeArea => switch (onde) {
        OndePorArea() || OndeComPontoEArea() => true,
        OndePorPonto() || null => false,
      };

  /// Os campos do rascunho como o envelope de intencao os guarda (UX 8.3).
  ///
  /// So texto, numero e booleano: `RascunhoDaIntencao` recusa o resto, e a
  /// recusa e o que impede alguem de enfiar os bytes de uma foto aqui.
  ///
  /// **A coordenada vai como numero e a area como texto, separadas**, e as
  /// duas nunca se convertem uma na outra. E o mesmo invariante de
  /// `modelos_localizacao.dart`, atravessando o disco.
  Map<String, Object?> campos() {
    final ponto = switch (onde) {
      OndePorPonto(:final ponto) => ponto,
      OndeComPontoEArea(:final ponto) => ponto,
      OndePorArea() || null => null,
    };
    final area = switch (onde) {
      OndePorArea(:final area) => area,
      OndeComPontoEArea(:final area) => area,
      OndePorPonto() || null => null,
    };
    return <String, Object?>{
      'especie': especie?.valor,
      'porte': porte?.valor,
      'sexo': sexo?.valor,
      'raca': racaCodigo,
      'cor': corCodigo,
      'versao_da_referencia': versaoDaReferencia,
      'quando': quando?.name,
      'data_escolhida': dataEscolhida?.toIso8601String(),
      'lat': ponto?.lat,
      'lon': ponto?.lon,
      'precisao': ponto?.precisaoEmMetros,
      'cidade': area?.cidade,
      'bairro': area?.bairro,
      'uf': area?.uf,
      'observacao': observacao,
      'share_token': shareToken,
    };
  }

  /// Reconstroi o rascunho a partir dos campos do envelope.
  ///
  /// **A foto nao volta por aqui**: o que o envelope guarda dela e o caminho
  /// do arquivo, e quem o guarda e `IntencaoPendente.foto`. Ver
  /// `achado_como_intencao.dart`.
  static RascunhoDoAchado dosCampos(Map<String, Object?> campos) {
    final bruto = campos['data_escolhida'] as String?;
    final lat = (campos['lat'] as num?)?.toDouble();
    final lon = (campos['lon'] as num?)?.toDouble();
    return RascunhoDoAchado(
      especie: Especie.de(campos['especie'] as String?),
      porte: Porte.de(campos['porte'] as String?),
      sexo: Sexo.de(campos['sexo'] as String?),
      racaCodigo: campos['raca'] as String?,
      corCodigo: campos['cor'] as String?,
      versaoDaReferencia: campos['versao_da_referencia'] as String?,
      quando: _quandoPorNome(campos['quando'] as String?),
      dataEscolhida: bruto == null ? null : DateTime.tryParse(bruto),
      onde: montarOnde(
        ponto: (lat == null || lon == null)
            ? null
            : PontoCapturado(
                lat: lat,
                lon: lon,
                precisaoEmMetros: (campos['precisao'] as num?)?.toDouble(),
                // O envelope nao guarda a origem, e ela nao e reconstruivel:
                // `deviceGps` e o unico caminho que este app tem para uma
                // coordenada (nao ha pino no mapa em todo o produto), entao
                // ele e o valor certo e nao um palpite.
                origem: OrigemDoPonto.deviceGps,
              ),
        area: AreaDigitada.montar(
          cidade: campos['cidade'] as String? ?? '',
          bairro: campos['bairro'] as String?,
          uf: campos['uf'] as String?,
        ),
      ),
      observacao: campos['observacao'] as String? ?? '',
      shareToken: campos['share_token'] as String?,
    );
  }

  static QuandoFoiVisto? _quandoPorNome(String? nome) {
    for (final q in QuandoFoiVisto.values) {
      if (q.name == nome) return q;
    }
    return null;
  }
}
