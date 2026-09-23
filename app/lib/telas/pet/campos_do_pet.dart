/// Os campos do pet, num lugar so.
///
/// **Duas formas diferentes de editar os mesmos campos e defeito, nao
/// escolha.** O assistente de cadastro (F1.3 e F1.5) e a tela de edicao
/// mexem nos MESMOS atributos do mesmo animal; enquanto os campos moravam
/// dentro do `State` de cada tela, a segunda tela so podia nascer como copia,
/// e copia diverge na primeira manutencao -- o rotulo muda de um lado, a
/// validacao do outro, e quem cadastrou e quem editou passam a ver telas
/// diferentes do mesmo formulario.
///
/// Quem hospeda continua dono do `Scaffold`, da `BarraDeConta`, do
/// `IndicadorDePasso`, da `BarraDeAcaoFixa`, do botao e da navegacao ou da
/// chamada de API. **So os campos moram aqui.**
///
/// A validacao sai por [CamposDeIdentificacaoState.validar] e
/// [CamposDeSinaisState.validar], alcancados por `GlobalKey`: a tela
/// hospedeira chama antes de salvar e so segue com `true`. E o unico jeito de
/// a regra de campo obrigatorio continuar morando junto do campo -- se ela
/// subisse para a tela, voltariamos a ter duas copias dela.
library;

import 'package:flutter/material.dart';

import '../../acessibilidade/anunciar.dart';
import '../../api/falhas.dart';
import '../../api/modelos_pet.dart';
import '../../escopo.dart';
import '../../theme/bichu_colors.dart';
import '../../theme/bichu_tokens.g.dart';
import '../../widgets/bichu_field.dart';
import '../../widgets/faixa_de_aviso.dart';
import '../../widgets/grupo_segmentado.dart';
import '../../widgets/seletor_de_lista.dart';
import 'rascunho_de_pet.dart';
import 'textos_do_cadastro.dart';

/// A leitura de `reference-data`, num lugar so.
///
/// Ela estava DUPLICADA nas duas telas, com corpos diferentes: uma marcava
/// `_listaFalhou` e a outra zerava a referencia. O que as duas de fato
/// compartilham e so isto -- pedir a lista e engolir [FalhaDeChamada] --, e o
/// que cada uma faz com a falha continua sendo decisao dela, porque as saidas
/// sao mesmo diferentes: em F1.3 a raca perdida ganha faixa e botoes de saida,
/// e em F1.5 a cor perdida simplesmente desabilita o seletor.
///
/// Devolve `null` quando a chamada falhou.
Future<DadosDeReferencia?> _buscarReferencia(BuildContext context) async {
  try {
    return await Escopo.of(context).pets.dadosDeReferencia();
  } on FalhaDeChamada {
    return null;
  } on Object catch (erro, pilha) {
    // Falha que nao e de chamada tambem e lista que nao chegou, e quem chama
    // ja sabe tratar nulo. Antes ela escapava daqui e deixava
    // `_carregandoReferencia` ligado para sempre nas duas telas que usam este
    // ajudante (F1.3 e F1.5).
    registrarFalhaInesperada(erro, pilha, onde: 'ao buscar a lista de referencia');
    return null;
  }
}

// ---------------------------------------------------------------------------
// Identificacao: nome, especie, raca, raca livre, porte, sexo
// ---------------------------------------------------------------------------

/// Os campos de identificacao do pet (F1.3, Figma `89:45`).
///
/// **Raca sao dois campos, e a tela e o que torna o erro impossivel.**
/// `breed_code` vem da lista fechada e e a unica coisa que o cruzamento de
/// perdido e achado le; `breed_free_text` e a raca como a pessoa escreveu,
/// guardada e exibida, **nunca cruzada**. O contrato recusa os dois juntos com
/// `validation-failed`, e a restricao que impede isso nao e validacao: e o
/// campo de texto **so existir** quando a opcao `Outra` esta escolhida
/// (Norman). Deixar o campo visivel o tempo todo e convidar ao erro e depois
/// explica-lo.
///
/// **A lista que nao carrega nao trava o cadastro.** Raca e opcional no
/// contrato (`PetInput` exige `name`, `species` e `size`), e perder o pet por
/// causa de um campo que ninguem precisa preencher e o pior desfecho possivel.
///
/// **Sem a lista, a pessoa pode DIGITAR a raca** (criterio 6 de BICHUS-90), e
/// isso nao contradiz o paragrafo acima: o que nao pode acontecer e o texto
/// livre virar o codigo de cruzamento. Aqui ele nao vira -- digitar escolhe
/// `outro_<especie>`, que e um codigo LIMPO da lista fechada, significando
/// "nao esta na lista", e o texto vai para `breed_free_text`, que descreve e
/// nunca cruza. E exatamente o arranjo que o criterio 3 da mesma historia
/// descreve: "o texto e aceito e guardado, E o cruzamento continua funcionando
/// pelos atributos que vieram da lista".
///
/// A primeira versao desta tela nao oferecia esse caminho e o cadastro seguia
/// sem raca nenhuma. Funcionava, e perdia a informacao: `outro_dog` + "Akita"
/// aparece na ficha, no cartaz e no perfil publico; nada nao aparece.
class CamposDeIdentificacao extends StatefulWidget {
  const CamposDeIdentificacao({required this.rascunho, super.key});

  /// O rascunho e de quem hospeda: quem o cria e quem o descarta. Estes campos
  /// so o leem, o escutam e o atualizam.
  final RascunhoDePet rascunho;

  @override
  State<CamposDeIdentificacao> createState() => CamposDeIdentificacaoState();
}

/// O estado publico de [CamposDeIdentificacao], alcancado por
/// `GlobalKey<CamposDeIdentificacaoState>` para a tela hospedeira chamar
/// [validar] antes de salvar.
class CamposDeIdentificacaoState extends State<CamposDeIdentificacao> {
  RascunhoDePet get _rascunho => widget.rascunho;

  late final TextEditingController _nome =
      TextEditingController(text: _rascunho.nome);
  late final TextEditingController _racaLivre =
      TextEditingController(text: _rascunho.breedFreeText);

  final FocusNode _focoDoNome = FocusNode();
  final FocusNode _focoDaRacaLivre = FocusNode();

  DadosDeReferencia? _referencia;
  bool _carregandoReferencia = true;
  bool _listaFalhou = false;

  /// Verdadeiro depois de a pessoa escolher `Continuar sem a raça`: a faixa
  /// some e o seletor fica desabilitado, mas **nao vira** campo de texto.
  bool _seguiuSemRaca = false;

  String? _erroDoNome;
  String? _erroDaEspecie;
  String? _erroDoPorte;
  String? _erroDaRacaLivre;

  /// O arranque roda em `didChangeDependencies`, e nao em `initState`.
  ///
  /// `Escopo` e um `InheritedWidget`, e ler um inherited widget dentro de
  /// `initState` e erro de framework: naquele momento a dependencia ainda nao
  /// pode ser registrada, e o widget nao seria reconstruido se ela mudasse. O
  /// sinalizador impede que o arranque rode de novo a cada mudanca de tema, de
  /// tamanho de fonte ou de rotacao, que e o outro lado dessa troca.
  bool _iniciou = false;

  @override
  void initState() {
    super.initState();
    // **Os campos escutam o rascunho.** `RascunhoDePet` e um `ChangeNotifier` e
    // `atualizar` chama `notifyListeners()`; sem ninguem escutando, a
    // notificacao nao chegava a lugar nenhum e o campo que so chamava
    // `atualizar` gravava o valor **sem redesenhar**. Era o defeito de
    // BICHUS-156: tocar num sexo nao mostrava nada, e a selecao aparecia no
    // toque seguinte, num outro campo -- daí o relato de que o sexo estava
    // "vinculado ao porte".
    //
    // Escutar aqui e o que faz `atualizar` valer por si. A correcao por campo
    // (um `setState` ao lado de cada `atualizar`) ja foi tentada neste
    // repositorio, com o aviso escrito ao lado em
    // `tela_cadastrar_sinais.dart`, e o aviso **nao viajou ate o campo
    // seguinte**: sao 7 chamadas de `atualizar` so neste bloco, cada uma
    // dependendo de alguem lembrar. Campo novo agora redesenha sozinho.
    //
    // O `setState` que sobrou nos outros campos **nao e redundante**: ele
    // carrega estado LOCAL do formulario (as mensagens de erro,
    // `_seguiuSemRaca`), que o rascunho nao conhece e nao notifica.
    _rascunho.addListener(_oRascunhoMudou);
  }

  /// O rascunho mudou por qualquer caminho: redesenha.
  ///
  /// `mounted` porque `atualizar` pode ser chamado por quem tambem segura o
  /// rascunho (ele atravessa os tres passos do assistente) depois de este
  /// bloco sair da arvore.
  void _oRascunhoMudou() {
    if (!mounted) return;
    setState(() {});
  }

  @override
  void didChangeDependencies() {
    super.didChangeDependencies();
    if (_iniciou) return;
    _iniciou = true;
    _carregarReferencia();
  }

  @override
  void dispose() {
    // Solta a escuta e **nao** descarta o rascunho: o dono e quem o criou, e a
    // tela seguinte do assistente ainda o usa.
    _rascunho.removeListener(_oRascunhoMudou);
    _nome.dispose();
    _racaLivre.dispose();
    _focoDoNome.dispose();
    _focoDaRacaLivre.dispose();
    super.dispose();
  }

  Future<void> _carregarReferencia() async {
    setState(() {
      _carregandoReferencia = true;
      _listaFalhou = false;
    });
    final dados = await _buscarReferencia(context);
    if (!mounted) return;
    if (dados == null) {
      setState(() {
        _carregandoReferencia = false;
        _listaFalhou = true;
      });
      return;
    }
    setState(() {
      _referencia = dados;
      _carregandoReferencia = false;
    });
    _rascunho.atualizar(() {
      // A versao que o **cliente tinha em maos**. Sem ela o servidor grava a
      // corrente no momento da escrita, que responde "qual e a lista de
      // hoje" e nao "de qual lista este pet foi escolhido".
      _rascunho.refDataVersion = dados.versao;
    });
  }

  /// A lista mostrada no seletor: as racas da especie escolhida **mais** a
  /// opcao de saida, que e microcopy e nao dado do servidor.
  List<ItemDeLista> get _itensDeRaca {
    final especie = _rascunho.especie;
    final referencia = _referencia;
    if (especie == null || referencia == null) return const <ItemDeLista>[];
    return <ItemDeLista>[
      for (final raca in referencia.racasDe(especie))
        ItemDeLista(codigo: raca.codigo, rotulo: raca.rotulo),
      ItemDeLista(
        codigo: especie.codigoDeOutraRaca,
        rotulo: TextosDoCadastro.opcaoOutraRaca,
      ),
    ];
  }

  String? get _rotuloDaRacaEscolhida {
    final codigo = _rascunho.breedCode;
    if (codigo == null) return null;
    for (final item in _itensDeRaca) {
      if (item.codigo == codigo) return item.rotulo;
    }
    return null;
  }

  void _escolherEspecie(Especie escolha) {
    _rascunho.atualizar(() {
      _rascunho.especie = escolha;
      // A lista de racas e por especie, e o codigo de saida tambem. Trocar a
      // especie sem soltar a raca deixaria `breed_code` apontando para uma
      // lista que nao e mais a desta tela.
      _rascunho.breedCode = null;
      _rascunho.breedFreeText = '';
    });
    _racaLivre.clear();
    setState(() {
      _erroDaEspecie = null;
      _erroDaRacaLivre = null;
    });
  }

  /// A saída do critério 6: sem a lista, a pessoa digita a raça.
  ///
  /// Reusa `_escolherRaca` com o código `outro_<espécie>` em vez de abrir um
  /// caminho paralelo. Isso importa mais do que parece: `_escolherRaca` já
  /// anuncia o aparecimento do campo para o leitor de tela e já cuida de não
  /// roubar o foco. Um caminho novo precisaria repetir as duas coisas, e a
  /// repetição é onde a acessibilidade se perde primeiro.
  void _digitarARaca() {
    final especie = _rascunho.especie;
    if (especie == null) return;
    setState(() => _seguiuSemRaca = true);
    _escolherRaca(especie.codigoDeOutraRaca);
  }

  void _escolherRaca(String? codigo) {
    final eraOutra = _rascunho.escolheuOutraRaca;
    _rascunho.atualizar(() => _rascunho.breedCode = codigo);
    setState(() => _erroDaRacaLivre = null);

    final agoraEOutra = _rascunho.escolheuOutraRaca;
    if (agoraEOutra && !eraOutra) {
      // **O aparecimento e anunciado e o foco NAO pula para o campo.** Mudar o
      // foco sozinho depois de uma escolha e deslize garantido em leitor de
      // tela; o campo fica imediatamente depois do seletor na ordem de foco e
      // e alcancado pelo avanco normal (UX F1.3, acessibilidade).
      anunciar(
        context,
        '${TextosDoCadastro.rotuloDaRacaLivre} (opcional)',
      );
    }
    if (!agoraEOutra && eraOutra) {
      _racaLivre.clear();
      _rascunho.atualizar(() => _rascunho.breedFreeText = '');
    }
  }

  bool _camposObrigatoriosPreenchidos() {
    final rascunho = _rascunho;
    final erroDoNome =
        _nome.text.trim().isEmpty ? TextosDoCadastro.digiteONome : null;
    final erroDaEspecie =
        rascunho.especie == null ? TextosDoCadastro.escolhaAEspecie : null;
    final erroDoPorte =
        rascunho.porte == null ? TextosDoCadastro.escolhaOPorte : null;

    if (erroDoNome == null && erroDaEspecie == null && erroDoPorte == null) {
      return true;
    }
    setState(() {
      _erroDoNome = erroDoNome;
      _erroDaEspecie = erroDaEspecie;
      _erroDoPorte = erroDoPorte;
    });
    if (erroDoNome != null) _focoDoNome.requestFocus();
    return false;
  }

  /// Confere os campos, pinta os erros e **grava o que foi digitado** no
  /// rascunho. Devolve `false` quando a tela hospedeira nao deve seguir.
  ///
  /// A navegacao (ou a chamada de API) NAO esta aqui de proposito: quem
  /// hospeda decide para onde vai depois do `true`. O que nao pode variar de
  /// tela para tela e a regra, e a regra mora junto do campo.
  bool validar() {
    setState(() {
      _erroDoNome = null;
      _erroDaEspecie = null;
      _erroDoPorte = null;
      _erroDaRacaLivre = null;
    });

    final livre = _racaLivre.text.trim();
    if (livre.length > TextosDoCadastro.limiteDaRacaLivre) {
      setState(() => _erroDaRacaLivre = TextosDoCadastro.racaLivreLonga);
      _focoDaRacaLivre.requestFocus();
      return false;
    }

    // A tela **nao corrige** a combinacao proibida por conta propria: ela a
    // torna impossivel. Se por algum caminho o texto livre existir com uma
    // raca da lista, o erro e do campo livre e nao do seletor, e a mensagem
    // nomeia a raca escolhida.
    if (livre.isNotEmpty && !_rascunho.escolheuOutraRaca) {
      final raca = _rotuloDaRacaEscolhida;
      setState(() {
        _erroDaRacaLivre = raca == null
            ? TextosDoCadastro.racaLivreLonga
            : TextosDoCadastro.racaLivreComRacaDaLista(raca);
      });
      return false;
    }

    _rascunho.atualizar(() {
      _rascunho.nome = _nome.text.trim();
      _rascunho.breedFreeText = livre;
    });

    if (!_camposObrigatoriosPreenchidos()) return false;

    return true;
  }

  @override
  Widget build(BuildContext context) {
    final rascunho = _rascunho;

    return Column(
      mainAxisSize: MainAxisSize.min,
      crossAxisAlignment: CrossAxisAlignment.stretch,
      children: <Widget>[
        BichuField(
          rotulo: TextosDoCadastro.rotuloDoNome,
          controlador: _nome,
          foco: _focoDoNome,
          erro: _erroDoNome,
          capitalizacao: TextCapitalization.words,
          acaoDeTeclado: TextInputAction.next,
          aoMudar: _erroDoNome == null
              ? null
              : (_) => setState(() => _erroDoNome = null),
        ),
        const SizedBox(height: BichuEspaco.e6),
        GrupoSegmentado<Especie>(
          rotulo: TextosDoCadastro.rotuloDaEspecie,
          erro: _erroDaEspecie,
          selecionado: rascunho.especie,
          aoSelecionar: _escolherEspecie,
          opcoes: <OpcaoSegmentada<Especie>>[
            for (final especie in Especie.values)
              OpcaoSegmentada<Especie>(
                valor: especie,
                rotulo: especie.rotulo,
              ),
          ],
        ),
        const SizedBox(height: BichuEspaco.e6),
        if (_listaFalhou && !_seguiuSemRaca) ...<Widget>[
          FaixaDeAviso(
            peso: PesoDaFaixa.informativo,
            texto: TextosDoCadastro.listaDeRacasNaoCarregou(_nome.text),
            rotuloDaAcao: 'Tentar de novo',
            aoTocarNaAcao: _carregarReferencia,
          ),
          const SizedBox(height: BichuEspaco.e2),
          Align(
            alignment: Alignment.centerLeft,
            child: Wrap(
              spacing: BichuEspaco.e4,
              children: <Widget>[
                // Primeiro a saida que PRESERVA a informacao. "Continuar
                // sem a raca" continua existindo e vem depois, porque
                // perder o campo e a segunda melhor opcao, nao a primeira.
                if (_rascunho.especie != null)
                  TextButton(
                    onPressed: _digitarARaca,
                    child: const Text(TextosDoCadastro.digitarARaca),
                  ),
                TextButton(
                  onPressed: () => setState(() => _seguiuSemRaca = true),
                  child: const Text(TextosDoCadastro.continuarSemARaca),
                ),
              ],
            ),
          ),
          const SizedBox(height: BichuEspaco.e6),
        ],
        SeletorDeLista(
          rotulo: TextosDoCadastro.rotuloDaRaca,
          ajuda: TextosDoCadastro.ajudaDaRaca,
          estadoInicial: TextosDoCadastro.escolherNaLista,
          itens: _itensDeRaca,
          selecionado: rascunho.breedCode,
          aoSelecionar: _escolherRaca,
          // Desabilitado enquanto nao ha especie escolhida (a lista e por
          // especie), enquanto a lista carrega, e quando ela falhou. Em
          // nenhum desses casos ele vira campo de texto livre.
          habilitado: rascunho.especie != null &&
              !_carregandoReferencia &&
              !_listaFalhou,
        ),
        if (rascunho.escolheuOutraRaca) ...<Widget>[
          const SizedBox(height: BichuEspaco.e6),
          BichuField(
            rotulo: TextosDoCadastro.rotuloDaRacaLivre,
            opcional: true,
            controlador: _racaLivre,
            foco: _focoDaRacaLivre,
            erro: _erroDaRacaLivre,
            ajuda: TextosDoCadastro.ajudaDaRacaLivre(_nome.text),
            capitalizacao: TextCapitalization.words,
            acaoDeTeclado: TextInputAction.next,
            limite: TextosDoCadastro.limiteDaRacaLivre,
            aoMudar: (valor) {
              _rascunho.breedFreeText = valor;
              if (_erroDaRacaLivre != null) {
                setState(() => _erroDaRacaLivre = null);
              } else {
                setState(() {});
              }
            },
          ),
        ],
        const SizedBox(height: BichuEspaco.e6),
        GrupoSegmentado<Porte>(
          rotulo: TextosDoCadastro.rotuloDoPorte,
          erro: _erroDoPorte,
          selecionado: rascunho.porte,
          aoSelecionar: (escolha) {
            _rascunho.atualizar(() => _rascunho.porte = escolha);
            setState(() => _erroDoPorte = null);
          },
          // Tres botoes, e nao os quatro valores de `PetSize`. O desenho de
          // F1.3 tem tres, e o paragrafo 11.17 do design system limita o
          // grupo segmentado a tres segmentos de uma palavra: com quatro, o
          // rotulo mais longo quebra em duas linhas a 200% de escala de
          // fonte. `GG` existe no contrato e e lido na ficha; ele so nao e
          // oferecido aqui.
          opcoes: const <OpcaoSegmentada<Porte>>[
            OpcaoSegmentada<Porte>(
              valor: Porte.pequeno,
              rotulo: 'Pequeno',
            ),
            OpcaoSegmentada<Porte>(valor: Porte.medio, rotulo: 'Médio'),
            OpcaoSegmentada<Porte>(valor: Porte.grande, rotulo: 'Grande'),
          ],
        ),
        const SizedBox(height: BichuEspaco.e6),
        GrupoSegmentado<Sexo>(
          rotulo: TextosDoCadastro.rotuloDoSexo,
          selecionado: rascunho.sexo,
          aoSelecionar: (escolha) =>
              _rascunho.atualizar(() => _rascunho.sexo = escolha),
          opcoes: <OpcaoSegmentada<Sexo>>[
            for (final sexo in Sexo.values)
              OpcaoSegmentada<Sexo>(valor: sexo, rotulo: sexo.rotulo),
          ],
        ),
      ],
    );
  }
}

// ---------------------------------------------------------------------------
// Sinais: cor principal, segunda cor, sinais particulares, cuidados
// ---------------------------------------------------------------------------

/// Os campos de sinais do pet (F1.5, Figma `91:51`).
///
/// **A cor e lista fechada de duas posicoes desde 2026-09-17.** O contrato tem
/// `primary_color_code` e `secondary_color_code`, dois codigos da mesma lista
/// de `reference-data`, e **nao tem campo de cor em texto livre**. Sao duas
/// cores no maximo, e nao a multipla escolha do paragrafo 11.18 do design
/// system, que e anterior a essa mudanca. O que a pessoa quiser dizer alem
/// disso cabe em Sinais particulares, que continua sendo texto livre -- e a
/// ajuda dos dois campos **aponta para la**, porque a lista de duas posicoes
/// frustra exatamente quem tem o pet mais facil de reconhecer.
///
/// **`care_notes` e o unico campo do cadastro que vai direto para uma pagina
/// publica sem interruptor de visibilidade.** Nao ha como marca-lo como
/// privado depois. Por isso o aviso na hora de escrever nao e acabamento: e a
/// unica protecao que a pessoa tem, e ele precisa ser lido **antes** de ela
/// digitar.
class CamposDeSinais extends StatefulWidget {
  const CamposDeSinais({required this.rascunho, super.key});

  /// O rascunho e de quem hospeda: quem o cria e quem o descarta.
  final RascunhoDePet rascunho;

  @override
  State<CamposDeSinais> createState() => CamposDeSinaisState();
}

/// O estado publico de [CamposDeSinais], alcancado por
/// `GlobalKey<CamposDeSinaisState>` para a tela hospedeira chamar [validar]
/// antes de salvar.
class CamposDeSinaisState extends State<CamposDeSinais> {
  late final TextEditingController _sinais =
      TextEditingController(text: widget.rascunho.sinaisParticulares);
  late final TextEditingController _cuidados =
      TextEditingController(text: widget.rascunho.cuidados);

  DadosDeReferencia? _referencia;

  /// O arranque roda em `didChangeDependencies`, e nao em `initState`.
  ///
  /// `Escopo` e um `InheritedWidget`, e ler um inherited widget dentro de
  /// `initState` e erro de framework: naquele momento a dependencia ainda nao
  /// pode ser registrada, e o widget nao seria reconstruido se ela mudasse. O
  /// sinalizador impede que o arranque rode de novo a cada mudanca de tema, de
  /// tamanho de fonte ou de rotacao, que e o outro lado dessa troca.
  bool _iniciou = false;

  @override
  void didChangeDependencies() {
    super.didChangeDependencies();
    if (_iniciou) return;
    _iniciou = true;
    _carregarReferencia();
  }

  @override
  void dispose() {
    _sinais.dispose();
    _cuidados.dispose();
    super.dispose();
  }

  Future<void> _carregarReferencia() async {
    final dados = await _buscarReferencia(context);
    if (!mounted) return;
    // Mesma saida de F1.3: cor e opcional no contrato, e cadastrar sem ela e
    // escolher depois em `Editar` e melhor que travar o cadastro. O que nao
    // acontece e o campo virar texto livre como plano B.
    setState(() => _referencia = dados);
  }

  List<ItemDeLista> get _cores {
    final referencia = _referencia;
    if (referencia == null) return const <ItemDeLista>[];
    return <ItemDeLista>[
      for (final cor in referencia.cores)
        ItemDeLista(codigo: cor.codigo, rotulo: cor.rotulo),
    ];
  }

  /// Grava o que foi digitado no rascunho. Devolve `false` quando a tela
  /// hospedeira nao deve seguir.
  ///
  /// Aqui nao ha campo obrigatorio nem combinacao proibida -- os dois campos
  /// sao texto livre opcional --, entao ela sempre devolve `true`. O metodo
  /// existe mesmo assim porque **os controladores moram aqui**: sem ele a tela
  /// hospedeira teria que alcancar o texto por fora, que e como a copia volta.
  bool validar() {
    final rascunho = widget.rascunho;
    rascunho.atualizar(() {
      rascunho.sinaisParticulares = _sinais.text.trim();
      rascunho.cuidados = _cuidados.text.trim();
    });
    return true;
  }

  @override
  Widget build(BuildContext context) {
    final rascunho = widget.rascunho;
    final nome = rascunho.nome;
    final listaCarregou = _referencia != null;

    return Column(
      mainAxisSize: MainAxisSize.min,
      crossAxisAlignment: CrossAxisAlignment.stretch,
      children: <Widget>[
        SeletorDeLista(
          rotulo: TextosDoCadastro.rotuloDaCorPrincipal,
          estadoInicial: TextosDoCadastro.escolherNaLista,
          itens: _cores,
          habilitado: listaCarregou,
          selecionado: rascunho.corPrincipalCodigo,
          // `setState` junto do `atualizar`: o rascunho notifica quem o
          // escuta, e este bloco **nao** o escuta -- ele le o valor direto.
          // Sem o `setState`, a escolha ia para o rascunho e a caixa
          // continuava dizendo "Escolher na lista", que e o defeito que
          // parece "o toque nao funcionou".
          aoSelecionar: (codigo) => setState(
            () => rascunho.corPrincipalCodigo = codigo,
          ),
        ),
        const SizedBox(height: BichuEspaco.e4),
        SeletorDeLista(
          rotulo: TextosDoCadastro.rotuloDaSegundaCor,
          // "(opcional)" em texto no rotulo, e nao por asterisco:
          // asterisco falha para leitor de tela e para quem nao conhece a
          // convencao (UX secao 13).
          estadoInicial: TextosDoCadastro.escolherNaLista,
          ajuda: TextosDoCadastro.ajudaDasCores(nome),
          itens: _cores,
          habilitado: listaCarregou,
          selecionado: rascunho.segundaCorCodigo,
          aoSelecionar: (codigo) => setState(
            () => rascunho.segundaCorCodigo = codigo,
          ),
        ),
        const SizedBox(height: BichuEspaco.e6),
        BichuField(
          rotulo: TextosDoCadastro.rotuloDosSinais,
          controlador: _sinais,
          exemplo: TextosDoCadastro.exemploDosSinais,
          linhas: 3,
          capitalizacao: TextCapitalization.sentences,
        ),
        const SizedBox(height: BichuEspaco.e6),
        _BlocoDeCuidados(nome: nome, controlador: _cuidados),
        // NAO ESTAO AQUI, e a ausencia e decisao: `castrado`, `chip`,
        // `RG Animal (opcional)` e `regiao de referencia`. Os quatro estao
        // na especificacao de F1.5 e os dois primeiros textos do RG Animal
        // ate foram escritos pelo UX em 2026-09-17 -- mas o quadro `91:51`
        // do Figma desenha **so** Sinais particulares e Cuidados. A regra
        // desta rodada e que tela sem desenho nao entra em
        // desenvolvimento, e campo sem desenho segue a mesma regra: eu
        // inventaria a ordem, o agrupamento e o peso visual de quatro
        // controles numa tela que ja tem um bloco de ajuda de quatro
        // paragrafos. Os textos estao guardados em `TextosDoCadastro`
        // (`rotuloDoRgAnimal`, `ajudaDoRgAnimal`) para o dia em que o
        // desenho chegar.
      ],
    );
  }
}

/// O bloco de `care_notes`, com o aviso lido **antes** da digitacao.
///
/// A ordem nao e estetica. A ultima linha ("nao precisa colocar seu telefone")
/// e prevencao de erro (Nielsen 5), e ela vale mais que qualquer mensagem
/// depois: o motivo numero um para alguem escrever um telefone ali e achar que
/// precisa de um jeito de ser contatada. Dizer que isso ja esta resolvido
/// remove a vontade antes de ela virar um dado exposto.
class _BlocoDeCuidados extends StatelessWidget {
  const _BlocoDeCuidados({required this.nome, required this.controlador});

  final String nome;
  final TextEditingController controlador;

  @override
  Widget build(BuildContext context) {
    final cores = BichuColors.of(context).cores;
    final textos = Theme.of(context).textTheme;

    return Container(
      padding: const EdgeInsets.all(BichuEspaco.e4),
      decoration: BoxDecoration(
        color: cores.surfaceSunken,
        borderRadius: BorderRadius.circular(BichuRaio.lg),
        border: Border.all(color: cores.outline, width: BichuBorda.hairline),
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: <Widget>[
          Text(
            '${TextosDoCadastro.rotuloDosCuidados(nome)} (opcional)',
            style: textos.titleMedium,
          ),
          const SizedBox(height: BichuEspaco.e2),
          Text(
            TextosDoCadastro.cuidadosSaoPublicos(nome),
            style: textos.bodyMedium,
          ),
          const SizedBox(height: BichuEspaco.e2),
          Text(
            TextosDoCadastro.cuidadosOQueEscrever(nome),
            style: textos.bodyMedium?.copyWith(color: cores.textSecondary),
          ),
          const SizedBox(height: BichuEspaco.e2),
          Text(
            TextosDoCadastro.cuidadosSemTelefone(nome),
            style: textos.bodyMedium,
          ),
          const SizedBox(height: BichuEspaco.e4),
          BichuField(
            rotulo: TextosDoCadastro.rotuloDosCuidados(nome),
            controlador: controlador,
            exemplo: TextosDoCadastro.exemploDosCuidados,
            linhas: 3,
            limite: TextosDoCadastro.limiteDosCuidados,
            capitalizacao: TextCapitalization.sentences,
          ),
        ],
      ),
    );
  }
}
