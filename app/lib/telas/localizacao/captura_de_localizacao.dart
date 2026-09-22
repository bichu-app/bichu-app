import 'package:flutter/material.dart';

import '../../acessibilidade/anunciar.dart';
import '../../api/modelos_localizacao.dart';
import '../../dispositivo/localizacao.dart';
import '../../escopo.dart';
import '../../theme/bichu_tokens.g.dart';
import '../../widgets/bichu_field.dart';
import '../../widgets/botao_primario.dart';
import '../../widgets/faixa_de_aviso.dart';
import 'antessala_de_localizacao.dart';
import 'textos_da_localizacao.dart';

/// A captura da localizacao **no ponto de uso** (BICHUS-23).
///
/// ## O que "ponto de uso" quer dizer, e o que ele exclui
///
/// A localizacao e capturada no instante em que a pessoa age, dentro da tela
/// em que ela esta agindo, e nunca em segundo plano. Nao ha servico, nao ha
/// vigia de posicao, nao ha `getPositionStream`: ha uma medicao, pedida por um
/// toque, com prazo para desistir. "Localizacao em segundo plano" e
/// "geofencing" estao em *Fora desta historia*, e a ausencia delas e o que faz
/// o escopo `Ao usar o app` do iOS ser honesto.
///
/// ## Por que esta peca e um trecho de tela, e nao uma tela
///
/// F3.1 (BICHUS-21) e F3.5 (BICHUS-35) sao as telas, e elas sao de outras
/// historias. O que a BICHUS-23 entrega e a captura que as duas embutem, num
/// lugar so: dois pontos de uso, uma implementacao. Fosse uma tela, cada uma
/// das duas teria de navegar para ela e voltar carregando o resultado, e a
/// segunda copiaria o tratamento dos cinco motivos de falha da primeira --
/// que e como as regras de permissao acabam escritas diferente em cada tela.
///
/// ## O que esta peca NUNCA faz
///
/// Converter coordenada em bairro, ou bairro em coordenada. ADR-0006 proibe as
/// duas, e o que sustenta a proibicao nao e este comentario: e
/// `sem_geocodificacao_test.dart`, e o fato de o pacote que converte nao estar
/// no binario.
///
/// ## Nada e guardado no aparelho
///
/// Localizacao e dado pessoal, e esta peca **nao persiste nada**: o ponto vive
/// no estado deste widget e morre com ele. Por isso nao ha entrada em
/// `limpezasAoSair` -- nao ha o que limpar, e uma entrada que limpa nada
/// passaria a ideia de que ha.
///
/// O rascunho local que sobrevive ao app fechar e o criterio 5 da BICHUS-35, e
/// ele e daquela historia. Quem o construir precisa registrar a limpeza,
/// porque ai vai passar a haver o que limpar. O portao
/// `nada_de_localizacao_no_disco_test.dart` reprova se esta peca comecar a
/// gravar antes disso.
class CapturaDeLocalizacao extends StatefulWidget {
  const CapturaDeLocalizacao({
    required this.pontoDeUso,
    required this.aoMudar,
    super.key,
    this.prazoDaMedicao = const Duration(seconds: 12),
  });

  final PontoDeUsoDaLocalizacao pontoDeUso;

  /// Chamado a cada mudanca do "onde", inclusive com `null`.
  ///
  /// `null` significa "ainda nao da para enviar" -- sem ponto e sem cidade. A
  /// tela de cima usa isso para habilitar o envio, e **nunca** para mostrar
  /// bloqueio: falta de coordenada nao bloqueia nada (criterio 12).
  final ValueChanged<Onde?> aoMudar;

  /// Quanto tempo esperar o aparelho fixar antes de desistir.
  ///
  /// Doze segundos por escolha, nao por medicao: e o tempo em que uma pessoa
  /// parada na rua ainda esta esperando, e nao o tempo em que o GPS costuma
  /// fixar a frio (que e maior). Desistir e barato aqui -- o campo de bairro
  /// esta a um toque, e `Tentar de novo` continua oferecido.
  final Duration prazoDaMedicao;

  @override
  State<CapturaDeLocalizacao> createState() => _CapturaDeLocalizacaoState();
}

enum _Fase { escolhendo, capturando, comPonto, digitando }

class _CapturaDeLocalizacaoState extends State<CapturaDeLocalizacao> {
  _Fase _fase = _Fase.escolhendo;
  PontoCapturado? _ponto;
  MotivoDeNaoTerPonto? _motivo;

  final TextEditingController _bairro = TextEditingController();
  final TextEditingController _cidade = TextEditingController();
  final TextEditingController _uf = TextEditingController();
  final FocusNode _focoDoBairro = FocusNode();

  @override
  void initState() {
    super.initState();
    for (final c in <TextEditingController>[_bairro, _cidade, _uf]) {
      c.addListener(_publicar);
    }
  }

  @override
  void dispose() {
    for (final c in <TextEditingController>[_bairro, _cidade, _uf]) {
      c
        ..removeListener(_publicar)
        ..dispose();
    }
    _focoDoBairro.dispose();
    super.dispose();
  }

  AreaDigitada? get _area => AreaDigitada.montar(
        cidade: _cidade.text,
        bairro: _bairro.text,
        uf: _uf.text,
      );

  /// A pessoa comecou a descrever a area e deixou a cidade de fora.
  ///
  /// O erro aparece por ESTE sinal, e nao depois de um envio recusado: quem
  /// digitou o bairro ja disse que esta preenchendo a area, e a cidade e o
  /// unico campo que o contrato exige (`Area.required: [city]`). Esperar o
  /// envio para dizer isso manda a pessoa de volta a um campo que ela acabou
  /// de passar.
  ///
  /// Campo vazio antes de qualquer digitacao NAO e erro: a tela nao acusa
  /// quem ainda nao comecou.
  bool get _faltaACidade =>
      _cidade.text.trim().isEmpty &&
      (_bairro.text.trim().isNotEmpty || _uf.text.trim().isNotEmpty);

  void _publicar() {
    widget.aoMudar(montarOnde(ponto: _ponto, area: _area));
  }

  /// O caminho de `Usar minha localizacao`.
  ///
  /// A antessala so aparece quando o dialogo do sistema **ainda abre**. Depois
  /// de respondido, mostra-la seria pedir contexto para uma pergunta que nao
  /// vai ser feita: no iOS `requestPermission` nao reabre nada.
  Future<void> _usarALocalizacao() async {
    final porta = Escopo.of(context).localizacao;
    var permissao = await porta.estado();
    if (!mounted) return;

    if (permissao == PermissaoDeLocalizacao.naoPedida) {
      final resposta = await AntessalaDeLocalizacao.mostrar(
        context,
        pontoDeUso: widget.pontoDeUso,
      );
      if (!mounted) return;
      if (resposta == RespostaDaAntessala.digitarOBairro) {
        _irParaODigitado(null);
        return;
      }
      permissao = await porta.pedir();
      if (!mounted) return;
    }

    setState(() => _fase = _Fase.capturando);
    anunciar(context, TextosDaLocalizacao.capturando);

    final resultado = await porta.pontoAproximado(prazo: widget.prazoDaMedicao);
    if (!mounted) return;

    switch (resultado) {
      case CapturaComPonto(:final ponto):
        setState(() {
          _ponto = ponto;
          _motivo = null;
          _fase = _Fase.comPonto;
        });
        _publicar();
      case CapturaSemPonto(:final motivo):
        _irParaODigitado(motivo);
    }
  }

  /// Vai para o campo de bairro **com o teclado aberto** (criterio 5).
  ///
  /// O foco e pedido depois do quadro em que o campo passa a existir: pedir
  /// foco a um `FocusNode` que ainda nao esta montado nao abre teclado nenhum,
  /// e o defeito e silencioso -- a tela fica certa e o teclado nao sobe.
  void _irParaODigitado(MotivoDeNaoTerPonto? motivo) {
    setState(() {
      _ponto = null;
      _motivo = motivo;
      _fase = _Fase.digitando;
    });
    _publicar();
    WidgetsBinding.instance.addPostFrameCallback((_) {
      if (mounted) _focoDoBairro.requestFocus();
    });
  }

  @override
  Widget build(BuildContext context) {
    return Column(
      crossAxisAlignment: CrossAxisAlignment.stretch,
      children: <Widget>[
        ..._conteudoDaFase(),
      ],
    );
  }

  List<Widget> _conteudoDaFase() {
    switch (_fase) {
      case _Fase.escolhendo:
        return <Widget>[
          BotaoPrimario(
            rotulo: TextosDaLocalizacao.usarMinhaLocalizacao,
            aoTocar: _usarALocalizacao,
          ),
          const SizedBox(height: BichuAlvoDeToque.gapConsequenciaAlta),
          OutlinedButton(
            onPressed: () => _irParaODigitado(null),
            style: OutlinedButton.styleFrom(
              minimumSize: const Size.fromHeight(BichuAlvoDeToque.min),
            ),
            child: const Text(TextosDaLocalizacao.preferoDigitarOBairro),
          ),
        ];

      case _Fase.capturando:
        return <Widget>[
          Semantics(
            liveRegion: true,
            child: Row(
              children: <Widget>[
                const SizedBox(
                  height: 20,
                  width: 20,
                  child: CircularProgressIndicator(strokeWidth: 2),
                ),
                const SizedBox(width: BichuEspaco.e4),
                Expanded(child: Text(TextosDaLocalizacao.capturando)),
              ],
            ),
          ),
        ];

      case _Fase.comPonto:
        final precisao = _ponto?.precisaoEmMetros;
        return <Widget>[
          FaixaDeAviso(
            peso: PesoDaFaixa.informativo,
            texto: precisao == null
                ? TextosDaLocalizacao.pontoSemPrecisao
                : TextosDaLocalizacao.pontoComPrecisao(
                    _arredondarPrecisao(precisao),
                  ),
          ),
          const SizedBox(height: BichuEspaco.e4),
          // O bairro opcional JUNTO com o GPS: o caminho conservador da
          // pergunta que foi para a pauta de refinamento. Sem ele, quem
          // concede a localizacao aparece na lista publica sem rotulo de area,
          // porque derivar o bairro da coordenada e o que o ADR-0006 proibe.
          Text(TextosDaLocalizacao.bairroOpcionalComGps),
          const SizedBox(height: BichuEspaco.e4),
          // Os TRES campos, e nao so o bairro.
          //
          // Custou um caso reprovando para ficar claro, e o defeito era
          // silencioso: com so o bairro na tela, quem digitasse "Vila
          // Madalena" nao produzia area nenhuma -- `Area.required: [city]` no
          // contrato, entao sem cidade nao ha area, e o rotulo que a pessoa
          // acabou de escrever era descartado sem aviso. Ela veria o bairro no
          // campo e ele nao chegaria a lista publica.
          //
          // Opcionais os tres: quem so quer o alerta de 5 km nao precisa
          // digitar nada, e o ponto ja basta para o caso existir.
          ..._camposDeArea(comFoco: false),
          const SizedBox(height: BichuAlvoDeToque.gapConsequenciaAlta),
          OutlinedButton(
            onPressed: () => _irParaODigitado(null),
            style: OutlinedButton.styleFrom(
              minimumSize: const Size.fromHeight(BichuAlvoDeToque.min),
            ),
            child: const Text(TextosDaLocalizacao.trocarPeloBairro),
          ),
        ];

      case _Fase.digitando:
        return <Widget>[
          if (_motivo != null) ...<Widget>[
            FaixaDeAviso(
              peso: PesoDaFaixa.informativo,
              texto: _fraseDoMotivo(_motivo!),
              rotuloDaAcao: _rotuloDaAcaoDoMotivo(_motivo!),
              aoTocarNaAcao: _acaoDoMotivo(_motivo!),
            ),
            const SizedBox(height: BichuEspaco.e4),
          ],
          ..._camposDeArea(comFoco: true),
        ];
    }
  }

  /// Bairro, cidade e UF, na mesma ordem nas duas fases.
  ///
  /// Uma lista so, e nao duas copias: as duas fases mostram os mesmos tres
  /// campos e mudam apenas o que vem ANTES deles (a explicacao da captura, ou
  /// a faixa do motivo) e se o teclado abre. Duas copias divergiriam na
  /// primeira mudanca, e a que divergiria e a menos exercitada.
  ///
  /// [comFoco] so vale para a fase em que a pessoa CAI no campo sem ter
  /// pedido: criterio 5, "com o teclado aberto". Na fase com ponto o teclado
  /// nao sobe sozinho -- ela ja tem o que precisava e pode nao querer digitar
  /// nada.
  List<Widget> _camposDeArea({required bool comFoco}) => <Widget>[
        BichuField(
          rotulo: TextosDaLocalizacao.rotuloBairro,
          controlador: _bairro,
          foco: comFoco ? _focoDoBairro : null,
          opcional: true,
          capitalizacao: TextCapitalization.words,
        ),
        const SizedBox(height: BichuEspaco.e4),
        BichuField(
          rotulo: TextosDaLocalizacao.rotuloCidade,
          controlador: _cidade,
          opcional: true,
          capitalizacao: TextCapitalization.words,
          erro: _faltaACidade ? TextosDaLocalizacao.cidadeObrigatoria : null,
        ),
        const SizedBox(height: BichuEspaco.e4),
        BichuField(
          rotulo: TextosDaLocalizacao.rotuloUf,
          controlador: _uf,
          opcional: true,
          limite: 2,
          capitalizacao: TextCapitalization.characters,
        ),
      ];

  /// Arredonda para cima, em centenas de metros.
  ///
  /// "cerca de 380 m" sugere uma medicao que a propria medicao nao sustenta; o
  /// numero que o aparelho devolve e ele mesmo uma estimativa. Para cima, e
  /// nao para o mais proximo, porque errar para o lado de prometer menos
  /// precisao e o lado seguro.
  static int _arredondarPrecisao(double metros) {
    if (metros <= 0) return 100;
    return (metros / 100).ceil() * 100;
  }

  String _fraseDoMotivo(MotivoDeNaoTerPonto motivo) => switch (motivo) {
        MotivoDeNaoTerPonto.permissaoNegada =>
          TextosDaLocalizacao.negouDestaVez,
        MotivoDeNaoTerPonto.permissaoNegadaPermanentemente =>
          TextosDaLocalizacao.negouEmDefinitivo,
        MotivoDeNaoTerPonto.servicoDesligado =>
          TextosDaLocalizacao.servicoDesligado,
        MotivoDeNaoTerPonto.semFixNoPrazo => TextosDaLocalizacao.semFixNoPrazo,
        MotivoDeNaoTerPonto.indisponivel => TextosDaLocalizacao.indisponivel,
      };

  /// So dois dos cinco motivos tem acao, e os outros tres nao ganham uma de
  /// enfeite: um botao que nao muda nada e pior que nenhum botao.
  String? _rotuloDaAcaoDoMotivo(MotivoDeNaoTerPonto motivo) =>
      switch (motivo) {
        MotivoDeNaoTerPonto.permissaoNegadaPermanentemente ||
        MotivoDeNaoTerPonto.servicoDesligado =>
          TextosDaLocalizacao.abrirAjustes,
        MotivoDeNaoTerPonto.semFixNoPrazo => TextosDaLocalizacao.tentarDeNovo,
        MotivoDeNaoTerPonto.permissaoNegada ||
        MotivoDeNaoTerPonto.indisponivel =>
          null,
      };

  VoidCallback? _acaoDoMotivo(MotivoDeNaoTerPonto motivo) => switch (motivo) {
        MotivoDeNaoTerPonto.permissaoNegadaPermanentemente ||
        MotivoDeNaoTerPonto.servicoDesligado =>
          () => Escopo.of(context).localizacao.abrirAjustesDoSistema(),
        MotivoDeNaoTerPonto.semFixNoPrazo => _usarALocalizacao,
        MotivoDeNaoTerPonto.permissaoNegada ||
        MotivoDeNaoTerPonto.indisponivel =>
          null,
      };
}
