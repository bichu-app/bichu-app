import 'package:flutter/material.dart';

import '../theme/bichu_colors.dart';
import '../theme/bichu_tokens.g.dart';
import 'bichu_field.dart';
import 'botao_primario.dart';

/// O topo de **toda pagina com listagem** do app: busca, filtro e ordenacao.
class BarraDeListagem extends StatefulWidget {
  const BarraDeListagem({
    required this.total,
    super.key,
    this.busca,
    this.filtro,
    this.ordenacao,
    this.substantivo = const SubstantivoDaListagem(),
    this.buscaAcima = false,
    this.aoAplicar,
  });

  /// Quantos itens o recorte atual tem **no servidor**, e nao quantos vieram
  /// nesta pagina.
  final int total;

  final ControleDeBusca? busca;
  final ControleDeFiltro? filtro;
  final ControleDeOrdenacao? ordenacao;

  /// Chamado **uma vez**, no `Aplicar` da folha, com o recorte inteiro: a
  /// escolha de cada grupo de filtro e a ordem.
  final void Function(EscolhaDaFolha escolha)? aoAplicar;

  /// Como chamar o que esta listado.
  final SubstantivoDaListagem substantivo;

  /// O campo de busca foi desenhado pela TELA, acima deste widget, e a barra
  /// nao o desenha de novo.
  final bool buscaAcima;

  /// Ha pelo menos um controle com desfecho.
  bool get _temControle => busca != null || _temFolha;

  /// A folha de filtro e ordem tem o que oferecer, e tem para onde mandar.
  bool get _temFolha =>
      aoAplicar != null &&
      ((filtro?.temOpcao ?? false) || (ordenacao?.temEscolha ?? false));

  @override
  State<BarraDeListagem> createState() => _EstadoDaBarraDeListagem();

  /// A pessoa recortou a lista de alguma forma.
  bool get _recorteAtivo =>
      (filtro?.ativos ?? 0) > 0 ||
      (busca?.termoAplicado?.trim().isNotEmpty ?? false);

  /// Se a barra tem o que desenhar com estes controles.
  static bool desenha({
    required int total,
    ControleDeBusca? busca,
    ControleDeFiltro? filtro,
    ControleDeOrdenacao? ordenacao,
    void Function(EscolhaDaFolha escolha)? aoAplicar,
  }) {
    final barra = BarraDeListagem(
      total: total,
      busca: busca,
      filtro: filtro,
      ordenacao: ordenacao,
      aoAplicar: aoAplicar,
    );
    if (!barra._temControle) return false;
    return total != 0 || barra._recorteAtivo;
  }

  /// `12 resultados · Nome`.
  String get _resumo {
    final contagem = '$total ${total == 1 ? substantivo.singular : substantivo.plural}';
    final ordem = ordenacao;
    if (ordem == null) return contagem;
    return '$contagem · ${ordem.rotuloEfetivo}';
  }

  /// O nome acessivel do unico controle de recorte, agora na `AppBar`.
  String get _rotuloDaFolha {
    final ordena = ordenacao?.temEscolha ?? false;
    final filtra = filtro?.temOpcao ?? false;
    final verbo = filtra && ordena
        ? 'Filtrar e ordenar'
        : ordena
            ? 'Ordenar'
            : 'Filtrar';
    final ativos = filtro?.ativos ?? 0;
    final estado = <String>[
      if (ativos > 0)
        '$ativos ${ativos == 1 ? 'filtro ativo' : 'filtros ativos'}',
      if (ordena) ordenacao!.rotuloEfetivo,
    ];
    return estado.isEmpty ? verbo : '$verbo, ${estado.join(', ')}';
  }

  Future<void> _abrirFolha(BuildContext context) async {
    await showModalBottomSheet<void>(
      context: context,
      showDragHandle: true,
      isScrollControlled: true,
      useSafeArea: true,
      builder: (_) => _FolhaDeFiltros(
        filtro: filtro,
        ordenacao: ordenacao,
        aoAplicar: aoAplicar!,
      ),
    );
  }
}

/// Abre a folha de filtro e ordem **sem a barra**.
Future<void> abrirFolhaDeFiltros(
  BuildContext context, {
  required void Function(EscolhaDaFolha escolha) aoAplicar,
  ControleDeFiltro? filtro,
  ControleDeOrdenacao? ordenacao,
}) {
  return showModalBottomSheet<void>(
    context: context,
    showDragHandle: true,
    isScrollControlled: true,
    useSafeArea: true,
    builder: (_) => _FolhaDeFiltros(
      filtro: filtro,
      ordenacao: ordenacao,
      aoAplicar: aoAplicar,
    ),
  );
}

class _EstadoDaBarraDeListagem extends State<BarraDeListagem> {
  SlotDaBarraDeListagem? _slot;

  @override
  void didChangeDependencies() {
    super.didChangeDependencies();
    final novo = SlotDaBarraDeListagem.maybeOf(context);
    if (identical(novo, _slot)) return;
    _slot?.publicar(null);
    _slot = novo;
  }

  @override
  void dispose() {
    final slot = _slot;
    if (slot != null) {
      WidgetsBinding.instance.addPostFrameCallback((_) {
        try {
          slot.publicar(null);
        } on FlutterError {
          // A casca foi embora junto: nao ha o que limpar.
        }
      });
    }
    super.dispose();
  }

  /// O que a `AppBar` desenha agora, ou nulo quando nao ha folha a abrir.
  AcaoDeListagem? _acao(BuildContext context) {
    final b = widget;
    return acaoDeRecorte(
      context,
      total: b.total,
      busca: b.busca,
      filtro: b.filtro,
      ordenacao: b.ordenacao,
      aoAplicar: b.aoAplicar,
    );
  }

  @override
  Widget build(BuildContext context) {
    final acao = _acao(context);
    final slot = _slot;
    if (slot != null) {
      WidgetsBinding.instance.addPostFrameCallback((_) {
        if (mounted) slot.publicar(null);
      });
    }

    final b = widget;
    if (!b._temControle) return const SizedBox.shrink();
    if (b.total == 0 && !b._recorteAtivo) return const SizedBox.shrink();

    final cores = BichuColors.of(context).cores;
    final textos = Theme.of(context).textTheme;
    final aviso = b.ordenacao?.porQueNaoEAPedida;
    final comCampo = b.busca != null && !b.buscaAcima;

    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: <Widget>[
        if (comCampo)
          LinhaDeBuscaDaListagem(
            total: b.total,
            busca: b.busca!,
            filtro: b.filtro,
            ordenacao: b.ordenacao,
            aoAplicar: b.aoAplicar,
          ),
        if (!comCampo && !b.buscaAcima && acao != null)
          Align(
            alignment: Alignment.centerLeft,
            child: GatilhoDeRecorteNoCorpo(acao: acao),
          ),
        if (comCampo || (!b.buscaAcima && acao != null))
          const SizedBox(height: BichuEspaco.e3),
        Text(
          b._resumo,
          style: textos.bodySmall?.copyWith(color: cores.textSecondary),
        ),
        if (aviso != null) ...<Widget>[
          const SizedBox(height: BichuEspaco.e3),
          _FaixaDaOrdem(ordenacao: b.ordenacao!),
        ],
        if (comCampo && b.busca?.avisoDeAlcance != null) ...<Widget>[
          const SizedBox(height: BichuEspaco.e2),
          Text(
            b.busca!.avisoDeAlcance!,
            style: textos.bodySmall?.copyWith(color: cores.textSecondary),
          ),
        ],
        const SizedBox(height: BichuEspaco.e4),
      ],
    );
  }
}

/// Como chamar o que a lista mostra, no singular e no plural.
class SubstantivoDaListagem {
  const SubstantivoDaListagem({
    this.singular = 'resultado',
    this.plural = 'resultados',
  });

  final String singular;
  final String plural;
}

/// Ate onde a busca de fato alcanca.
enum AlcanceDaBusca {
  /// A rota aceita o termo e o servidor procura na base inteira.
  servidor,

  /// Nao ha rota: o termo filtra o que ja esta carregado nesta pagina.
  paginaCarregada,
}

/// O campo de busca. Ausente quando a listagem nao tem como buscar.
class ControleDeBusca {
  const ControleDeBusca({
    required this.controlador,
    required this.aoAplicar,
    required this.alcance,
    required this.termoAplicado,
    this.rotulo = 'Buscar',
    this.minimoDeCaracteres = 1,
  });

  final TextEditingController controlador;

  /// Chamado **so** quando a pessoa pede a busca: a lupa dentro do campo ou a
  /// tecla de busca do teclado.
  final ValueChanged<String?> aoAplicar;

  final AlcanceDaBusca alcance;

  /// O termo que **produziu** a lista que esta na tela agora, ou nulo.
  final String? termoAplicado;

  /// O nome do campo. Vai na **dica dentro do campo** e no nome acessivel.
  final String rotulo;

  /// Quantas letras a rota exige antes de aceitar o termo.
  final int minimoDeCaracteres;

  /// Quantas letras faltam para o piso, **na redacao de UM lugar so**.
  String? get faltamLetras {
    final digitado = controlador.text.trim();
    if (digitado.isEmpty) return null;
    final faltam = minimoDeCaracteres - digitado.length;
    if (faltam <= 0) return null;
    return 'faltam $faltam ${faltam == 1 ? 'letra' : 'letras'}';
  }

  /// A frase que o componente escreve sob o campo, ou nulo.
  String? get avisoDeAlcance => switch (alcance) {
        AlcanceDaBusca.servidor => null,
        AlcanceDaBusca.paginaCarregada => textoDoAlcanceLocal,
      };

  /// Palavra por palavra, num lugar so: duas copias divergem no dia em que
  /// alguem mexer numa delas.
  static const String textoDoAlcanceLocal =
      'A busca olha só o que já está carregado nesta página.';
}

/// O que a folha devolve no `Aplicar`: o recorte inteiro, de uma vez.
class EscolhaDaFolha {
  const EscolhaDaFolha({required this.filtros, this.ordem});

  /// A chave de cada grupo DECLARADO para o codigo escolhido, ou `null` para
  /// "qualquer um".
  final Map<String, String?> filtros;

  /// A ordem pedida, ou nulo quando a listagem nao oferece escolha de ordem.
  final String? ordem;
}

/// Uma opcao de recorte: o codigo que vai para a rota e o rotulo que a pessoa
/// le.
class OpcaoDeRecorte {
  const OpcaoDeRecorte({required this.codigo, required this.rotulo});

  final String codigo;
  final String rotulo;
}

/// Um grupo de filtro: um titulo e opcoes mutuamente exclusivas.
class GrupoDeFiltro {
  const GrupoDeFiltro({
    required this.chave,
    required this.titulo,
    required this.opcoes,
    required this.selecionado,
    this.nota,
    this.dependeDe,
    this.codigoPadrao,
  });

  /// O identificador que volta em [ControleDeFiltro.aoAplicar].
  final String chave;

  final String titulo;
  final List<OpcaoDeRecorte> opcoes;

  /// O codigo **aplicado**, ou nulo para "qualquer um".
  final String? selecionado;

  /// O codigo que E a ausencia de recorte, quando o grupo tem um.
  final String? codigoPadrao;

  /// Se a escolha atual deste grupo e um recorte DE VERDADE.
  bool get recortaDeFato =>
      selecionado != null && selecionado != codigoPadrao;

  /// Uma linha de explicacao sob o titulo.
  final String? nota;

  /// A chave do grupo de quem as opcoes deste dependem, quando ha um.
  final String? dependeDe;
}

/// Um recorte que a pessoa **digita**, e nao escolhe de uma lista.
class CampoDeTextoDoFiltro {
  const CampoDeTextoDoFiltro({
    required this.chave,
    required this.rotulo,
    required this.valor,
    this.obrigatorio = false,
    this.textoDeValidacao,
    this.limite,
    this.minimoDeCaracteres = 2,
    this.exemplo,
  });

  /// O identificador que volta em [EscolhaDaFolha.filtros].
  final String chave;

  /// O rotulo, que e tambem o **nome acessivel** do campo: `BichuField` o
  /// publica com `rotuloVisivel`, e campo com dica e sem rotulo e campo mudo.
  final String rotulo;

  /// O valor **aplicado** na lista agora.
  final String? valor;

  /// A lista nao existe sem este recorte.
  final bool obrigatorio;

  /// A unica linha de texto que este campo mostra alem do rotulo, e so quando o
  /// valor nao serve.
  final String? textoDeValidacao;

  /// O teto de caracteres, que e o do contrato e nao uma escolha da tela.
  final int? limite;

  /// O piso que o valor precisa alcancar para o `Aplicar` habilitar.
  final int minimoDeCaracteres;

  /// A dica DENTRO do campo (`BichuField.exemplo`).
  final String? exemplo;

  /// O valor serve para ir a rota.
  bool serve(String digitado) {
    final limpo = digitado.trim();
    if (limpo.isEmpty) return !obrigatorio;
    return limpo.length >= minimoDeCaracteres;
  }
}

/// Os grupos de filtro da folha.
class ControleDeFiltro {
  const ControleDeFiltro({
    required this.grupos,
    this.campos = const <CampoDeTextoDoFiltro>[],
  });

  final List<GrupoDeFiltro> grupos;

  /// Os recortes que a pessoa DIGITA.
  final List<CampoDeTextoDoFiltro> campos;

  /// **O campo obrigatorio NAO conta como filtro ativo.** Ele e a pergunta que
  /// a rota exige para responder qualquer coisa, e nao um recorte que a pessoa
  /// escolheu: contado, o distintivo da barra nasceria com `1` numa lista que
  /// ninguem filtrou.
  int get ativos =>
      grupos.where((g) => g.recortaDeFato).length +
      campos
          .where((c) =>
              !c.obrigatorio && (c.valor?.trim().isNotEmpty ?? false))
          .length;

  /// Ha pelo menos um grupo com opcao, ou um campo para digitar.
  bool get temOpcao =>
      grupos.any((g) => g.opcoes.isNotEmpty) || campos.isNotEmpty;
}

/// A ordem da lista, e as ordens que a rota aceita.
class ControleDeOrdenacao {
  const ControleDeOrdenacao({
    required this.opcoes,
    required this.efetiva,
    this.porQueNaoEAPedida,
    this.nota,
  });

  final List<OpcaoDeRecorte> opcoes;

  /// Uma linha de explicacao na folha de ordem, sob o titulo.
  final String? nota;

  /// **O codigo da ordem em que a lista esta**, e nao o da que foi pedida.
  final String efetiva;

  /// Por que a ordem pedida nao valeu.
  final String? porQueNaoEAPedida;

  bool get temEscolha => opcoes.length > 1;

  String get rotuloEfetivo {
    for (final o in opcoes) {
      if (o.codigo == efetiva) return o.rotulo;
    }
    throw StateError(
      'A ordem efetiva "$efetiva" nao esta entre as opcoes declaradas '
      '(${opcoes.map((o) => o.codigo).join(', ')}). O componente mostra a '
      'ordem REAL da lista, e nao tem como mostrar uma que nao existe.',
    );
  }
}

/// O campo de busca da listagem, com a lupa que APLICA o termo.
class CampoDeBuscaDaListagem extends StatelessWidget {
  const CampoDeBuscaDaListagem({required this.busca, super.key});

  final ControleDeBusca busca;

  /// O termo digitado agora, sem espaco nas pontas.
  String get _digitado => busca.controlador.text.trim();

  /// O que a lupa manda: nulo quando o campo ficou vazio.
  String? get _aAplicar => _digitado.isEmpty ? null : _digitado;

  /// Ha termo digitado diferente do aplicado, e ele pode ir.
  bool get _podeAplicar {
    if (_aAplicar == busca.termoAplicado) return false;
    if (_aAplicar == null) return true;
    return _digitado.length >= busca.minimoDeCaracteres;
  }

  @override
  Widget build(BuildContext context) {
    return ValueListenableBuilder<TextEditingValue>(
      valueListenable: busca.controlador,
      builder: (context, _, _) {
        return BichuField(
          rotulo: busca.rotulo,
          rotuloVisivel: false,
          controlador: busca.controlador,
          exemplo: busca.rotulo,
          aoMudar: null,
          aoEnviar: (_) {
            if (_podeAplicar) busca.aoAplicar(_aAplicar);
          },
          acaoDeTeclado: TextInputAction.search,
          correcaoAutomatica: false,
          sufixo: _LupaQueAplica(
            habilitada: _podeAplicar,
            rotulo: _rotuloDaLupa,
            aoTocar: () => busca.aoAplicar(_aAplicar),
          ),
        );
      },
    );
  }

  /// O nome acessivel da lupa, que carrega o ESTADO e nao so o verbo.
  String get _rotuloDaLupa {
    if (_podeAplicar) return 'Buscar';
    if (_aAplicar == null) return 'Buscar, nada digitado';
    if (_aAplicar == busca.termoAplicado) return 'Buscar, a busca já é esta';
    final faltam = busca.faltamLetras;
    if (faltam != null) return 'Buscar, $faltam';
    return 'Buscar';
  }
}

/// A lupa dentro do campo. Desabilitada quando nao ha o que aplicar.
class _LupaQueAplica extends StatelessWidget {
  const _LupaQueAplica({
    required this.habilitada,
    required this.rotulo,
    required this.aoTocar,
  });

  final bool habilitada;
  final String rotulo;
  final VoidCallback aoTocar;

  @override
  Widget build(BuildContext context) {
    final cores = BichuColors.of(context).cores;
    return SizedBox(
      width: BichuAlvoDeToque.min,
      height: BichuAlvoDeToque.min,
      child: IconButton(
        onPressed: habilitada ? aoTocar : null,
        tooltip: rotulo,
        icon: Icon(
          Icons.search,
          color: habilitada ? cores.textPrimary : cores.textMuted,
        ),
      ),
    );
  }
}

/// O controle que a listagem publica no slot unico da `AppBar`.
@immutable
class AcaoDeListagem {
  const AcaoDeListagem({
    required this.rotulo,
    required this.aoTocar,
    this.distintivo,
  });

  /// O nome acessivel, com o ESTADO dentro: quem usa leitor de tela nao ve o
  /// distintivo com o numero.
  final String rotulo;

  final VoidCallback aoTocar;

  /// O numero de filtros ativos, ou nulo quando nao ha nenhum.
  final String? distintivo;

  @override
  bool operator ==(Object other) =>
      other is AcaoDeListagem &&
      other.rotulo == rotulo &&
      other.distintivo == distintivo;

  @override
  int get hashCode => Object.hash(rotulo, distintivo);
}

/// O canal entre a listagem (que tem o estado) e a casca (que tem a `AppBar`).
class SlotDaBarraDeListagem extends InheritedWidget {
  const SlotDaBarraDeListagem({
    required this.acao,
    required super.child,
    super.key,
  });

  final ValueNotifier<AcaoDeListagem?> acao;

  static SlotDaBarraDeListagem? maybeOf(BuildContext context) =>
      context.dependOnInheritedWidgetOfExactType<SlotDaBarraDeListagem>();

  /// Publica (ou apaga) o controle, **sem reconstruir por valor igual**.
  void publicar(AcaoDeListagem? nova) {
    if (acao.value == nova) return;
    acao.value = nova;
  }

  @override
  bool updateShouldNotify(SlotDaBarraDeListagem antigo) =>
      antigo.acao != acao;
}

/// Um icone de 64 x 64 que abre a folha, com nome acessivel obrigatorio.
class GatilhoDeRecorteNoCorpo extends StatelessWidget {
  const GatilhoDeRecorteNoCorpo({required this.acao, super.key});

  final AcaoDeListagem acao;

  @override
  Widget build(BuildContext context) {
    final cores = BichuColors.of(context).cores;
    final textos = Theme.of(context).textTheme;
    final distintivo = acao.distintivo;

    return Tooltip(
      message: acao.rotulo,
      child: OutlinedButton(
        onPressed: acao.aoTocar,
        style: OutlinedButton.styleFrom(
          minimumSize: const Size.square(BichuAlvoDeToque.min),
          fixedSize: const Size.square(BichuAlvoDeToque.min),
          padding: EdgeInsets.zero,
        ),
        child: Stack(
          clipBehavior: Clip.none,
          children: <Widget>[
            const Icon(Icons.tune),
            if (distintivo != null)
              Positioned(
                right: -BichuEspaco.e2,
                top: -BichuEspaco.e2,
                child: Container(
                  padding: const EdgeInsets.symmetric(
                    horizontal: BichuEspaco.e1,
                  ),
                  constraints: const BoxConstraints(minWidth: BichuEspaco.e4),
                  decoration: BoxDecoration(
                    color: cores.primary,
                    borderRadius: BorderRadius.circular(BichuRaio.full),
                  ),
                  child: Text(
                    distintivo,
                    textAlign: TextAlign.center,
                    semanticsLabel: '',
                    style: textos.labelSmall?.copyWith(
                      color: cores.onActionFill,
                    ),
                  ),
                ),
              ),
          ],
        ),
      ),
    );
  }
}

/// A LINHA DE BUSCA DA LISTAGEM: o gatilho de recorte **na frente** do campo.
class LinhaDeBuscaDaListagem extends StatelessWidget {
  const LinhaDeBuscaDaListagem({
    required this.total,
    required this.busca,
    super.key,
    this.filtro,
    this.ordenacao,
    this.aoAplicar,
  });

  final int total;
  final ControleDeBusca busca;
  final ControleDeFiltro? filtro;
  final ControleDeOrdenacao? ordenacao;
  final void Function(EscolhaDaFolha escolha)? aoAplicar;

  @override
  Widget build(BuildContext context) {
    final acao = acaoDeRecorte(
      context,
      total: total,
      busca: busca,
      filtro: filtro,
      ordenacao: ordenacao,
      aoAplicar: aoAplicar,
    );

    return Row(
      crossAxisAlignment: CrossAxisAlignment.center,
      children: <Widget>[
        Expanded(child: CampoDeBuscaDaListagem(busca: busca)),
        if (acao != null) ...<Widget>[
          const SizedBox(width: BichuEspaco.e2),
          GatilhoDeRecorteNoCorpo(acao: acao),
        ],
      ],
    );
  }
}

/// O QUE UMA SECAO COM TOPO FIXO POE NA LINHA DE BUSCA DELE.
@immutable
class BuscaFixaDaSecao {
  const BuscaFixaDaSecao({
    required this.total,
    required this.busca,
    this.filtro,
    this.ordenacao,
    this.aoAplicar,
  });

  final int total;
  final ControleDeBusca busca;
  final ControleDeFiltro? filtro;
  final ControleDeOrdenacao? ordenacao;
  final void Function(EscolhaDaFolha escolha)? aoAplicar;
}

/// O CANAL entre o corpo da aba (que tem o estado da busca) e o TOPO FIXO da
/// secao (que a desenha).
class SlotDaBuscaFixa extends InheritedWidget {
  const SlotDaBuscaFixa({
    required this.busca,
    required super.child,
    super.key,
  });

  final ValueNotifier<BuscaFixaDaSecao?> busca;

  static SlotDaBuscaFixa? maybeOf(BuildContext context) =>
      context.dependOnInheritedWidgetOfExactType<SlotDaBuscaFixa>();

  void publicar(BuscaFixaDaSecao nova) => busca.value = nova;

  /// Apaga **so se o que estiver la for o meu**.
  void limparSeFor(BuscaFixaDaSecao? minha) {
    if (minha == null || !identical(busca.value, minha)) return;
    busca.value = null;
  }

  @override
  bool updateShouldNotify(SlotDaBuscaFixa antigo) => antigo.busca != busca;
}

/// PUBLICA a linha de busca no topo fixo da secao, e nao desenha nada no lugar.
class BuscaNoTopoFixo extends StatefulWidget {
  const BuscaNoTopoFixo({
    required this.total,
    required this.busca,
    super.key,
    this.filtro,
    this.ordenacao,
    this.aoAplicar,
  });

  final int total;
  final ControleDeBusca busca;
  final ControleDeFiltro? filtro;
  final ControleDeOrdenacao? ordenacao;
  final void Function(EscolhaDaFolha escolha)? aoAplicar;

  @override
  State<BuscaNoTopoFixo> createState() => _EstadoDaBuscaNoTopoFixo();
}

class _EstadoDaBuscaNoTopoFixo extends State<BuscaNoTopoFixo> {
  SlotDaBuscaFixa? _slot;

  /// O ultimo valor que ESTE estado publicou, ou nulo.
  BuscaFixaDaSecao? _publicada;

  @override
  void didChangeDependencies() {
    super.didChangeDependencies();
    final novo = SlotDaBuscaFixa.maybeOf(context);
    if (identical(novo, _slot)) return;
    _slot?.limparSeFor(_publicada);
    _slot = novo;
    _publicada = null;
  }

  @override
  void dispose() {
    final slot = _slot;
    final publicada = _publicada;
    if (slot != null && publicada != null) {
      WidgetsBinding.instance.addPostFrameCallback((_) {
        try {
          slot.limparSeFor(publicada);
        } on FlutterError {
          // A secao inteira foi embora junto: nao ha topo a limpar.
        }
      });
    }
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    final b = widget;
    final slot = _slot;
    if (slot == null) {
      return LinhaDeBuscaDaListagem(
        total: b.total,
        busca: b.busca,
        filtro: b.filtro,
        ordenacao: b.ordenacao,
        aoAplicar: b.aoAplicar,
      );
    }

    final nova = BuscaFixaDaSecao(
      total: b.total,
      busca: b.busca,
      filtro: b.filtro,
      ordenacao: b.ordenacao,
      aoAplicar: b.aoAplicar,
    );
    WidgetsBinding.instance.addPostFrameCallback((_) {
      if (!mounted) return;
      _publicada = nova;
      slot.publicar(nova);
    });
    return const SizedBox.shrink();
  }
}

/// DESENHA o que o corpo da aba publicou no topo fixo.
class LinhaDeBuscaFixaDaSecao extends StatelessWidget {
  const LinhaDeBuscaFixaDaSecao({required this.busca, super.key});

  final ValueNotifier<BuscaFixaDaSecao?> busca;

  @override
  Widget build(BuildContext context) {
    return ValueListenableBuilder<BuscaFixaDaSecao?>(
      valueListenable: busca,
      builder: (context, fixa, _) => fixa == null
          ? const SizedBox.shrink()
          : LinhaDeBuscaDaListagem(
              total: fixa.total,
              busca: fixa.busca,
              filtro: fixa.filtro,
              ordenacao: fixa.ordenacao,
              aoAplicar: fixa.aoAplicar,
            ),
    );
  }
}

/// O que o gatilho de recorte desenha agora, ou nulo quando nao ha folha.
AcaoDeListagem? acaoDeRecorte(
  BuildContext context, {
  required int total,
  ControleDeBusca? busca,
  ControleDeFiltro? filtro,
  ControleDeOrdenacao? ordenacao,
  void Function(EscolhaDaFolha escolha)? aoAplicar,
}) {
  final b = BarraDeListagem(
    total: total,
    busca: busca,
    filtro: filtro,
    ordenacao: ordenacao,
    aoAplicar: aoAplicar,
  );
  if (!b._temFolha) return null;
  if (total == 0 && !b._recorteAtivo) return null;
  final ativos = filtro?.ativos ?? 0;
  return AcaoDeListagem(
    rotulo: b._rotuloDaFolha,
    distintivo: ativos == 0 ? null : '$ativos',
    aoTocar: () => b._abrirFolha(context),
  );
}

class BotaoDeAcaoDaListagem extends StatelessWidget {
  const BotaoDeAcaoDaListagem({required this.acao, super.key});

  final AcaoDeListagem acao;

  @override
  Widget build(BuildContext context) {
    final cores = BichuColors.of(context).cores;
    final textos = Theme.of(context).textTheme;
    final icone = Icons.tune;
    final rotulo = acao.rotulo;
    final distintivo = acao.distintivo;
    final aoTocar = acao.aoTocar;

    return SizedBox(
      width: BichuAlvoDeToque.critico,
      height: BichuAlvoDeToque.critico,
      child: IconButton(
        onPressed: aoTocar,
        tooltip: rotulo,
        icon: Stack(
          clipBehavior: Clip.none,
          children: <Widget>[
            Icon(icone, color: cores.textPrimary),
            if (distintivo != null)
              Positioned(
                right: -BichuEspaco.e2,
                top: -BichuEspaco.e2,
                child: Container(
                  padding: const EdgeInsets.symmetric(
                    horizontal: BichuEspaco.e1,
                  ),
                  constraints: const BoxConstraints(minWidth: BichuEspaco.e4),
                  decoration: BoxDecoration(
                    color: cores.primary,
                    borderRadius: BorderRadius.circular(BichuRaio.full),
                  ),
                  child: Text(
                    distintivo,
                    textAlign: TextAlign.center,
                    semanticsLabel: '',
                    style: textos.labelSmall?.copyWith(
                      color: cores.onActionFill,
                    ),
                  ),
                ),
              ),
          ],
        ),
      ),
    );
  }
}

/// A faixa que explica por que a ordem pedida nao valeu.
class _FaixaDaOrdem extends StatelessWidget {
  const _FaixaDaOrdem({required this.ordenacao});

  final ControleDeOrdenacao ordenacao;

  @override
  Widget build(BuildContext context) {
    final cores = BichuColors.of(context).cores;
    final textos = Theme.of(context).textTheme;

    return Semantics(
      liveRegion: true,
      container: true,
      child: Container(
        width: double.infinity,
        padding: const EdgeInsets.all(BichuEspaco.e4),
        decoration: BoxDecoration(
          color: cores.surfaceSunken,
          borderRadius: BorderRadius.circular(BichuRaio.md),
          border: Border.all(color: cores.outline, width: BichuBorda.hairline),
        ),
        child: Text(
          ordenacao.porQueNaoEAPedida!,
          style: textos.bodyMedium?.copyWith(color: cores.textPrimary),
        ),
      ),
    );
  }
}

/// A folha de filtro E ordem, que guarda a escolha PENDENTE e so aplica no
/// botao.
class _FolhaDeFiltros extends StatefulWidget {
  const _FolhaDeFiltros({
    required this.aoAplicar,
    this.filtro,
    this.ordenacao,
  });

  final ControleDeFiltro? filtro;
  final ControleDeOrdenacao? ordenacao;
  final void Function(EscolhaDaFolha escolha) aoAplicar;

  static const String rotuloDeAplicar = 'Aplicar';
  static const String rotuloDeLimpar = 'Limpar';
  static const String tituloDaOrdem = 'Ordenar por';

  List<GrupoDeFiltro> get grupos =>
      filtro?.grupos ?? const <GrupoDeFiltro>[];

  /// Os recortes digitados. Vazio nas telas que so tem lista fechada.
  List<CampoDeTextoDoFiltro> get campos =>
      filtro?.campos ?? const <CampoDeTextoDoFiltro>[];

  /// A folha ordena quando ha mais de uma ordem para escolher.
  bool get ordena => ordenacao?.temEscolha ?? false;

  @override
  State<_FolhaDeFiltros> createState() => _EstadoDaFolhaDeFiltros();
}

class _EstadoDaFolhaDeFiltros extends State<_FolhaDeFiltros> {
  /// A escolha de cada grupo declarado, como ela esta **nesta folha**.
  late final Map<String, String?> _pendente = <String, String?>{
    for (final g in widget.grupos) g.chave: g.selecionado,
  };

  /// A ordem escolhida nesta folha.
  late String? _ordemPendente = widget.ordenacao?.efetiva;

  /// Um controlador por campo digitado, criado com o valor APLICADO.
  late final Map<String, TextEditingController> _digitado =
      <String, TextEditingController>{
    for (final c in widget.campos)
      c.chave: TextEditingController(text: c.valor ?? ''),
  };

  @override
  void dispose() {
    for (final c in _digitado.values) {
      c.dispose();
    }
    super.dispose();
  }

  /// O texto de cada campo, aparado.
  Map<String, String?> get _textosPendentes => <String, String?>{
        for (final c in widget.campos)
          c.chave: _digitado[c.chave]?.text.trim().isEmpty ?? true
              ? null
              : _digitado[c.chave]!.text.trim(),
      };

  /// Todos os campos digitados servem para ir a rota.
  bool get _camposServem => widget.campos
      .every((c) => c.serve(_digitado[c.chave]?.text ?? ''));

  /// O que esta aplicado na lista agora -- pastilhas e campos digitados.
  Map<String, String?> get _aplicado => <String, String?>{
        for (final g in widget.grupos) g.chave: g.selecionado,
        for (final c in widget.campos)
          c.chave: (c.valor?.trim().isEmpty ?? true) ? null : c.valor!.trim(),
      };

  /// Ha diferenca entre o que a folha mostra e o que a lista tem.
  bool get _mudou {
    if (!_camposServem) return false;
    final aplicado = _aplicado;
    final textos = _textosPendentes;
    if (textos.keys.any((c) => textos[c] != aplicado[c])) return true;
    if (_pendente.keys.any((c) => _pendente[c] != aplicado[c])) return true;
    return _ordemPendente != widget.ordenacao?.efetiva;
  }

  /// Ha algum FILTRO pendente para o `Limpar` tirar.
  bool get _temEscolha =>
      _pendente.values.any((v) => v != null) ||
      widget.campos.any((c) =>
          !c.obrigatorio && (_digitado[c.chave]?.text.trim().isNotEmpty ?? false));

  /// Os grupos desenhados: com opcao, e com o pai ainda no valor aplicado.
  List<GrupoDeFiltro> get _visiveis {
    final aplicado = _aplicado;
    return widget.grupos.where((g) {
      if (g.opcoes.isEmpty) return false;
      final pai = g.dependeDe;
      if (pai != null && _pendente[pai] != aplicado[pai]) return false;
      return true;
    }).toList(growable: false);
  }

  void _escolher(GrupoDeFiltro grupo, String? codigo) {
    setState(() {
      _pendente[grupo.chave] = codigo;
      for (final g in widget.grupos) {
        if (g.dependeDe == grupo.chave) _pendente[g.chave] = null;
      }
    });
  }

  void _aplicar() {
    final escolha = EscolhaDaFolha(
      filtros: Map<String, String?>.unmodifiable(<String, String?>{
        ..._pendente,
        ..._textosPendentes,
      }),
      ordem: widget.ordena ? _ordemPendente : null,
    );
    Navigator.of(context).pop();
    widget.aoAplicar(escolha);
  }

  @override
  Widget build(BuildContext context) {
    final textos = Theme.of(context).textTheme;
    final cores = BichuColors.of(context).cores;
    final visiveis = _visiveis;
    final ordenacao = widget.ordenacao;

    return SafeArea(
      child: Padding(
        padding: const EdgeInsets.all(BichuEspaco.e6),
        child: Column(
          mainAxisSize: MainAxisSize.min,
          crossAxisAlignment: CrossAxisAlignment.start,
          children: <Widget>[
            Text('Filtros', style: textos.titleLarge),
            const SizedBox(height: BichuEspaco.e4),
            Flexible(
              child: SingleChildScrollView(
                child: Column(
                  mainAxisSize: MainAxisSize.min,
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: <Widget>[
                    for (final campo in widget.campos) ...<Widget>[
                      BichuField(
                        rotulo: campo.rotulo,
                        controlador: _digitado[campo.chave]!,
                        exemplo: campo.exemplo,
                        limite: campo.limite,
                        opcional: !campo.obrigatorio,
                        capitalizacao: TextCapitalization.words,
                        correcaoAutomatica: false,
                        erro: campo.serve(_digitado[campo.chave]!.text)
                            ? null
                            : campo.textoDeValidacao,
                        aoMudar: (_) => setState(() {}),
                        acaoDeTeclado: TextInputAction.done,
                      ),
                      const SizedBox(height: BichuEspaco.e6),
                    ],
                    for (final grupo in visiveis) ...<Widget>[
                      Text(grupo.titulo, style: textos.titleMedium),
                      if (grupo.nota != null) ...<Widget>[
                        const SizedBox(height: BichuEspaco.e1),
                        Text(
                          grupo.nota!,
                          style: textos.bodySmall
                              ?.copyWith(color: cores.textSecondary),
                        ),
                      ],
                      const SizedBox(height: BichuEspaco.e2),
                      Wrap(
                        spacing: BichuEspaco.e2,
                        runSpacing: BichuEspaco.e2,
                        children: <Widget>[
                          for (final opcao in grupo.opcoes)
                            _Pastilha(
                              rotulo: opcao.rotulo,
                              marcada: _pendente[grupo.chave] == opcao.codigo,
                              aoTocar: () => _escolher(
                                grupo,
                                _pendente[grupo.chave] == opcao.codigo
                                    ? null
                                    : opcao.codigo,
                              ),
                            ),
                        ],
                      ),
                      const SizedBox(height: BichuEspaco.e6),
                    ],
                    if (widget.ordena && ordenacao != null) ...<Widget>[
                      Text(
                        _FolhaDeFiltros.tituloDaOrdem,
                        style: textos.titleMedium,
                      ),
                      if (ordenacao.nota != null) ...<Widget>[
                        const SizedBox(height: BichuEspaco.e1),
                        Text(
                          ordenacao.nota!,
                          style: textos.bodySmall
                              ?.copyWith(color: cores.textSecondary),
                        ),
                      ],
                      const SizedBox(height: BichuEspaco.e2),
                      Wrap(
                        spacing: BichuEspaco.e2,
                        runSpacing: BichuEspaco.e2,
                        children: <Widget>[
                          for (final opcao in ordenacao.opcoes)
                            _Pastilha(
                              rotulo: opcao.rotulo,
                              marcada: _ordemPendente == opcao.codigo,
                              aoTocar: () => setState(
                                () => _ordemPendente = opcao.codigo,
                              ),
                            ),
                        ],
                      ),
                      const SizedBox(height: BichuEspaco.e6),
                    ],
                  ],
                ),
              ),
            ),
            if (_temEscolha)
              TextButton(
                onPressed: () => setState(() {
                  _pendente.updateAll((_, _) => null);
                  for (final c in widget.campos) {
                    if (!c.obrigatorio) _digitado[c.chave]?.clear();
                  }
                }),
                child: const Text(_FolhaDeFiltros.rotuloDeLimpar),
              ),
            const SizedBox(height: BichuEspaco.e2),
            BotaoPrimario(
              rotulo: _FolhaDeFiltros.rotuloDeAplicar,
              aoTocar: _mudou ? _aplicar : null,
            ),
          ],
        ),
      ),
    );
  }
}

class _Pastilha extends StatelessWidget {
  const _Pastilha({
    required this.rotulo,
    required this.marcada,
    required this.aoTocar,
  });

  final String rotulo;
  final bool marcada;
  final VoidCallback aoTocar;

  @override
  Widget build(BuildContext context) {
    final cores = BichuColors.of(context).cores;
    final textos = Theme.of(context).textTheme;

    return Semantics(
      button: true,
      selected: marcada,
      label: rotulo,
      onTap: aoTocar,
      excludeSemantics: true,
      child: Material(
        color: marcada ? cores.primary : cores.surfaceSunken,
        borderRadius: BorderRadius.circular(BichuRaio.full),
        child: InkWell(
          onTap: aoTocar,
          borderRadius: BorderRadius.circular(BichuRaio.full),
          child: ConstrainedBox(
            constraints: const BoxConstraints(minHeight: BichuAlvoDeToque.min),
            child: Padding(
              padding: const EdgeInsets.symmetric(
                horizontal: BichuEspaco.e4,
                vertical: BichuEspaco.e3,
              ),
              child: Text(
                rotulo,
                style: textos.labelLarge?.copyWith(
                  color: marcada ? cores.onActionFill : cores.textPrimary,
                ),
              ),
            ),
          ),
        ),
      ),
    );
  }
}
