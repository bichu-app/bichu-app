import 'package:flutter/material.dart';
import 'package:go_router/go_router.dart';

import '../../escopo.dart';
import '../../perdido/quando_foi_visto.dart';
import '../../perdido/rascunho_do_caso.dart';
import '../../roteamento/rotas.dart';
import '../../theme/bichu_colors.dart';
import '../../theme/bichu_tokens.g.dart';
import '../../widgets/barra_de_acao_fixa.dart';
import '../../widgets/bichu_field.dart';
import '../../widgets/botao_primario.dart';
import '../../widgets/faixa_de_aviso.dart';
import '../../widgets/grupo_de_opcoes.dart';
import '../../widgets/saida_da_tela.dart';
import 'cabecalho_do_pet.dart';

/// **F3.1 — Confirmar perdido: onde e quando.** A tela desta historia.
///
/// ## O que ela NAO faz, e cada ausencia e decisao
///
/// - **Nao chama rede, nem uma vez.** O criterio 6 e literal: *"Dado que estou
///   sem conexao, quando uso F3.1, entao a tela inteira funciona: o envio
///   acontece em F3.2."* Uma chamada aqui -- nem que fosse so para adiantar a
///   previa do alcance -- criaria um estado de carregamento numa tela que tem
///   de abrir pronta no elevador.
/// - **Nao pede permissao de localizacao e nao le coordenada.** O app nao tem
///   porta de localizacao hoje, e a antessala de 10.2 e a porta sao trabalho de
///   aparelho que esta historia nao contem. O que ela **nao pode** fazer, e nao
///   faz nem quando a porta existir, e transformar coordenada em bairro: o
///   ADR-0006 proibe geocodificacao no MVP, e rotular o ponto onde o pet sumiu
///   com o bairro de casa do tutor e mentira de aparencia plausivel.
/// - **Nao tem mapa com pino**, que e proibido em todo o produto, e nao tem
///   raio configuravel, fixo em 5 km no MVP ("Fora desta historia").
///
/// ## De onde vem o bairro preenchido, e por que nao e da localizacao
///
/// O criterio 2 pede o bairro *"ja preenchido pela localizacao, se
/// autorizada"*. **Isso nao e implementavel sem geocodificacao**, que o
/// ADR-0006 proibe: coordenada nao vira nome de bairro. A fonte honesta do
/// preenchimento e a **localizacao de referencia do tutor** (`Me.reference_area`,
/// BICHUS-92), que ja e texto -- bairro, cidade e UF -- e que o proprio tutor
/// cadastrou. Ela e tambem, literalmente, *"a ultima regiao usada"* da segunda
/// metade do criterio.
///
/// Sem ela, o campo abre **vazio e com o foco dentro dele**, que e o resto do
/// criterio 2. A divergencia esta registrada na pauta de refinamento.
class TelaOndeEQuando extends StatefulWidget {
  const TelaOndeEQuando({
    required this.rascunho,
    super.key,
    this.agora = DateTime.now,
    this.erroInicial,
  });

  final RascunhoDoCaso rascunho;

  /// A falha da abertura que trouxe a pessoa de volta (UX 8.3, regra 4).
  ///
  /// Nao e estado da tela: e o que ela recebe ao nascer. A faixa some assim
  /// que a pessoa mexe em qualquer campo, porque a partir dai o texto fala de
  /// uma tentativa que nao e mais a que esta na tela.
  final String? erroInicial;

  /// O relogio entra pela porta. Sem isso, "amanha nao e aceito" so seria
  /// exercitavel esperando um dia, e a regra ficaria sem isca -- que e
  /// exatamente o estado em que ela estava no servidor.
  final DateTime Function() agora;

  static const String titulo = 'Marcar como perdido';

  /// A pergunta de F3.1, palavra por palavra.
  static const String perguntaDeOnde = 'Onde ele foi visto pela última vez?';

  static const String perguntaDeQuando = 'Quando?';

  /// O campo opcional do criterio 4, palavra por palavra.
  static const String perguntaDeAjuda =
      'Alguma coisa que ajude quem for procurar?';

  static const String exemploDeAjuda =
      'coleira vermelha, fugiu pelo portão da frente';

  static const String rotuloDeContinuar = 'Continuar';

  /// O criterio 10 dito na tela: o padrao e verdadeiro e a pessoa **ve** que
  /// e, em vez de responder mais uma pergunta no pior momento.
  static const String rotuloDaListaPublica =
      'Entrar na lista pública de pets perdidos';

  static const String explicacaoDaListaPublica =
      'A lista mostra a foto, o bairro e a data. Nunca o seu telefone nem o '
      'seu endereço.';

  @override
  State<TelaOndeEQuando> createState() => _TelaOndeEQuandoState();
}

class _TelaOndeEQuandoState extends State<TelaOndeEQuando> {
  late final TextEditingController _bairro;
  late final TextEditingController _cidade;
  late final TextEditingController _uf;
  late final TextEditingController _ajuda;

  /// O foco do bairro. O criterio 5 manda o foco para ELE quando o motivo do
  /// botao desabilitado e a falta de bairro, e o criterio 2 manda o teclado
  /// abrir nele quando a tela nasce sem regiao nenhuma.
  final FocusNode _focoDoBairro = FocusNode();

  bool _preencheuDaReferencia = false;

  /// A faixa da falha anterior, enquanto ela ainda descreve o que esta na
  /// tela.
  String? _erro;

  @override
  void initState() {
    super.initState();
    final r = widget.rascunho;
    _bairro = TextEditingController(text: r.bairro);
    _cidade = TextEditingController(text: r.cidade);
    _uf = TextEditingController(text: r.uf);
    _ajuda = TextEditingController(text: r.descricao);
    _erro = widget.erroInicial;
  }

  @override
  void didChangeDependencies() {
    super.didChangeDependencies();
    if (_preencheuDaReferencia) return;
    _preencheuDaReferencia = true;

    // A regiao de referencia do tutor, quando ela existe e o rascunho ainda
    // esta em branco. **Nao sobrescreve o que a pessoa digitou**: o rascunho
    // pode chegar preenchido pela volta de um envelope de intencao, e
    // sobrescrever ali apagaria o que ela escreveu antes do login.
    final regiao = Escopo.of(context).sessao.usuario?.regiaoDeReferencia;
    if (regiao != null && widget.rascunho.area == null) {
      setState(() {
        if (_bairro.text.isEmpty) _bairro.text = regiao.bairro ?? '';
        if (_cidade.text.isEmpty) _cidade.text = regiao.cidade ?? '';
        if (_uf.text.isEmpty) _uf.text = regiao.uf ?? '';
        _sincronizar();
      });
    }

    // Criterio 2, segunda metade: *"sem autorizacao, o campo fica vazio com o
    // teclado aberto"*. O foco vai depois do quadro porque pedir foco durante
    // a construcao nao chega ao teclado.
    if (widget.rascunho.area == null) {
      WidgetsBinding.instance.addPostFrameCallback((_) {
        if (mounted) _focoDoBairro.requestFocus();
      });
    }
  }

  @override
  void dispose() {
    _bairro.dispose();
    _cidade.dispose();
    _uf.dispose();
    _ajuda.dispose();
    _focoDoBairro.dispose();
    super.dispose();
  }

  void _sincronizar() {
    widget.rascunho
      ..bairro = _bairro.text
      ..cidade = _cidade.text
      ..uf = _uf.text
      ..descricao = _ajuda.text;
  }

  void _aoDigitar(String _) => setState(() {
        _sincronizar();
        // A falha anterior deixa de valer quando a pessoa muda o rascunho.
        _erro = null;
      });

  Future<void> _escolherData() async {
    final agora = widget.agora();
    final escolhida = await showDatePicker(
      context: context,
      initialDate: widget.rascunho.dataEscolhida ?? agora,
      firstDate: agora.subtract(const Duration(days: 365)),
      // **O calendario nao oferece o futuro.** Ele e a primeira das tres
      // defesas contra "visto pela ultima vez amanha"; as outras duas sao o
      // impedimento do rascunho, que e o que segura relogio de aparelho
      // adiantado, e a borda do servidor, que e a autoridade.
      lastDate: agora,
      helpText: 'Quando ele foi visto pela última vez',
    );
    if (escolhida == null || !mounted) return;
    setState(() => widget.rascunho.dataEscolhida = escolhida);
  }

  void _continuar() {
    final agora = widget.agora();
    final impedimento = widget.rascunho.impedimentoEm(agora);
    if (impedimento == ImpedimentoDeContinuar.semBairro) {
      // O criterio 5 manda o foco para o campo. Ele so chega aqui se alguem
      // acionar o botao desabilitado por outro caminho (teclado fisico,
      // automacao), e mesmo assim a tela responde a coisa certa.
      _focoDoBairro.requestFocus();
      return;
    }
    if (impedimento != null) return;
    context.push(Rotas.marcarPerdidoAlcance, extra: widget.rascunho);
  }

  @override
  Widget build(BuildContext context) {
    final cores = BichuColors.of(context).cores;
    final textos = Theme.of(context).textTheme;
    final r = widget.rascunho;
    final agora = widget.agora();
    final impedimento = r.impedimentoEm(agora);

    return Scaffold(
      appBar: const BarraDeConta(
        titulo: TelaOndeEQuando.titulo,
        saida: TipoDeSaida.voltar,
      ),
      body: SafeArea(
        top: false,
        bottom: false,
        child: ListView(
          padding: const EdgeInsets.all(BichuEspaco.e4),
          // Pelo mesmo motivo da BICHUS-62: o padrao do `ListView` embrulha
          // cada filho direto num `IndexedSemantics`, e com ele cada bloco
          // desta tela viraria UM no de semantica com tudo colapsado dentro --
          // o cabecalho do pet, os campos e o grupo de opcoes. Este e o corpo
          // rolavel de uma pagina, e nao uma lista de itens.
          addSemanticIndexes: false,
          children: <Widget>[
            CabecalhoDoPet(pet: r.pet),
            if (_erro != null) ...<Widget>[
              const SizedBox(height: BichuEspaco.e6),
              FaixaDeAviso(texto: _erro!),
            ],
            const SizedBox(height: BichuEspaco.e6),
            Semantics(
              header: true,
              child: Text(
                TelaOndeEQuando.perguntaDeOnde,
                style: textos.titleMedium,
              ),
            ),
            const SizedBox(height: BichuEspaco.e4),
            BichuField(
              rotulo: 'Bairro',
              controlador: _bairro,
              foco: _focoDoBairro,
              aoMudar: _aoDigitar,
              limite: 80,
              capitalizacao: TextCapitalization.words,
              acaoDeTeclado: TextInputAction.next,
            ),
            const SizedBox(height: BichuEspaco.e4),
            BichuField(
              rotulo: 'Cidade',
              controlador: _cidade,
              aoMudar: _aoDigitar,
              limite: 80,
              capitalizacao: TextCapitalization.words,
              acaoDeTeclado: TextInputAction.next,
              // O requisito dito ANTES da tentativa (UX secao 13): a cidade e
              // o unico campo que o contrato exige, e descobrir isso pelo
              // botao desabilitado seria descobrir tarde.
              ajuda: 'A cidade é o que a gente precisa para achar quem está '
                  'por perto.',
            ),
            const SizedBox(height: BichuEspaco.e4),
            BichuField(
              rotulo: 'UF',
              controlador: _uf,
              aoMudar: _aoDigitar,
              opcional: true,
              limite: 2,
              capitalizacao: TextCapitalization.characters,
              acaoDeTeclado: TextInputAction.done,
            ),
            const SizedBox(height: BichuEspaco.e6),
            GrupoDeOpcoes<QuandoFoiVisto>(
              rotulo: TelaOndeEQuando.perguntaDeQuando,
              selecionado: r.quando,
              opcoes: <OpcaoDeLinha<QuandoFoiVisto>>[
                for (final q in QuandoFoiVisto.values)
                  OpcaoDeLinha<QuandoFoiVisto>(valor: q, rotulo: q.rotulo),
              ],
              aoSelecionar: (escolha) {
                setState(() {
                  r.quando = escolha;
                  // Trocar de `Outra data` para outra opcao **apaga** a data
                  // escolhida: deixa-la guardada faria o caso ser gravado com
                  // a data de um calendario que a pessoa ja abandonou se ela
                  // voltasse a tocar em `Outra data` e fechasse sem escolher.
                  if (!escolha.pedeCalendario) r.dataEscolhida = null;
                });
                // **O calendario so aparece em `Outra data`** (criterio 3).
                if (escolha.pedeCalendario) _escolherData();
              },
            ),
            if (r.quando != null && r.quando!.pedeCalendario) ...<Widget>[
              const SizedBox(height: BichuEspaco.e3),
              _DataEscolhida(
                data: r.dataEscolhida,
                aoTrocar: _escolherData,
              ),
            ],
            const SizedBox(height: BichuEspaco.e6),
            BichuField(
              rotulo: TelaOndeEQuando.perguntaDeAjuda,
              controlador: _ajuda,
              aoMudar: _aoDigitar,
              // Criterio 4: marcado como opcional **em texto**, e nao por
              // asterisco. `BichuField` escreve "(opcional)" no rotulo.
              opcional: true,
              linhas: 3,
              limite: RascunhoDoCaso.limiteDaDescricao,
              exemplo: TelaOndeEQuando.exemploDeAjuda,
              capitalizacao: TextCapitalization.sentences,
            ),
            const SizedBox(height: BichuEspaco.e6),
            _ListaPublica(
              ligado: r.compartilharNaListaPublica,
              aoTrocar: (valor) => setState(
                () => r.compartilharNaListaPublica = valor,
              ),
            ),
          ],
        ),
      ),
      // A barra de acao fixa do 11.8, no `bottomNavigationBar` para que o
      // `Scaffold` a levante junto com o teclado -- que nesta tela abre sozinho
      // no campo de bairro.
      bottomNavigationBar: BarraDeAcaoFixa(
        acoes: <Widget>[
          // **O MOTIVO, VISIVEL, AO LADO DO BOTAO** (criterio 5). Ele fica
          // ACIMA do botao e nao abaixo porque a ordem de leitura precisa
          // entregar o motivo antes do controle: quem usa leitor de tela
          // chegaria no botao desabilitado sem ter ouvido por que.
          if (impedimento != null)
            _MotivoDoBloqueio(texto: impedimento.texto, cor: cores.textPrimary),
          BotaoPrimario(
            rotulo: TelaOndeEQuando.rotuloDeContinuar,
            // O piso critico de 64 dp: o 6.5 estaciona os 64 dp na barra de
            // acao fixa desta historia, e esta e a acao primaria dela.
            critico: true,
            // Nulo desabilita. Desabilitado **com o motivo dito** e o unico
            // jeito de desabilitar que o produto aceita.
            aoTocar: impedimento == null ? _continuar : null,
          ),
        ],
      ),
    );
  }
}

/// O motivo do botao desabilitado, anunciado quando aparece e quando muda.
class _MotivoDoBloqueio extends StatelessWidget {
  const _MotivoDoBloqueio({required this.texto, required this.cor});

  final String texto;
  final Color cor;

  @override
  Widget build(BuildContext context) {
    final textos = Theme.of(context).textTheme;
    return Padding(
      padding: const EdgeInsets.only(bottom: BichuEspaco.e3),
      child: Semantics(
        liveRegion: true,
        child: Text(texto, style: textos.bodyMedium?.copyWith(color: cor)),
      ),
    );
  }
}

/// A data que o calendario devolveu, escrita por extenso.
///
/// **Ela e mostrada, e nao so guardada.** Sem esta linha, `Outra data` fica
/// selecionada sem a tela dizer qual data -- e quem fechou o calendario por
/// engano nao tem como descobrir o que ficou gravado.
class _DataEscolhida extends StatelessWidget {
  const _DataEscolhida({required this.data, required this.aoTrocar});

  final DateTime? data;
  final VoidCallback aoTrocar;

  /// `dd/mm/aaaa`, sem depender de `intl`: o app nao traz o pacote, e uma
  /// dependencia nova por uma linha de texto e custo que a historia nao pede.
  static String comoTexto(DateTime data) {
    final dia = data.day.toString().padLeft(2, '0');
    final mes = data.month.toString().padLeft(2, '0');
    return '$dia/$mes/${data.year}';
  }

  @override
  Widget build(BuildContext context) {
    final escolhida = data;
    final rotulo = escolhida == null
        ? 'Escolher a data'
        : 'Visto em ${comoTexto(escolhida)}. Trocar a data';
    return Semantics(
      button: true,
      label: rotulo,
      excludeSemantics: true,
      onTap: aoTrocar,
      child: OutlinedButton.icon(
        onPressed: aoTrocar,
        icon: const Icon(Icons.event_outlined, size: 24),
        label: Text(
          escolhida == null
              ? 'Escolher a data'
              : 'Visto em ${comoTexto(escolhida)}',
        ),
      ),
    );
  }
}

/// O interruptor da lista publica (criterio 10).
class _ListaPublica extends StatelessWidget {
  const _ListaPublica({required this.ligado, required this.aoTrocar});

  final bool ligado;
  final ValueChanged<bool> aoTrocar;

  @override
  Widget build(BuildContext context) {
    final cores = BichuColors.of(context).cores;
    final textos = Theme.of(context).textTheme;

    return Semantics(
      toggled: ligado,
      label: '${TelaOndeEQuando.rotuloDaListaPublica}. '
          '${TelaOndeEQuando.explicacaoDaListaPublica}',
      excludeSemantics: true,
      onTap: () => aoTrocar(!ligado),
      child: InkWell(
        onTap: () => aoTrocar(!ligado),
        borderRadius: BorderRadius.circular(BichuRaio.md),
        child: Padding(
          padding: const EdgeInsets.symmetric(vertical: BichuEspaco.e2),
          child: Row(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: <Widget>[
              Expanded(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: <Widget>[
                    Text(
                      TelaOndeEQuando.rotuloDaListaPublica,
                      style: textos.labelLarge,
                    ),
                    const SizedBox(height: BichuEspaco.e1),
                    Text(
                      TelaOndeEQuando.explicacaoDaListaPublica,
                      style: textos.bodySmall?.copyWith(
                        color: cores.textSecondary,
                      ),
                    ),
                  ],
                ),
              ),
              const SizedBox(width: BichuEspaco.e3),
              // Dentro do `Semantics` com `excludeSemantics`: o interruptor do
              // M3 publicaria uma segunda parada de leitor de tela com o mesmo
              // significado da linha inteira.
              Switch(value: ligado, onChanged: aoTrocar),
            ],
          ),
        ),
      ),
    );
  }
}
