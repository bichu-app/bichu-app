/// Os campos do pet, num lugar so.
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

Future<DadosDeReferencia?> _buscarReferencia(BuildContext context) async {
  try {
    return await Escopo.of(context).pets.dadosDeReferencia();
  } on FalhaDeChamada {
    return null;
  } on Object catch (erro, pilha) {
    registrarFalhaInesperada(erro, pilha, onde: 'ao buscar a lista de referencia');
    return null;
  }
}

/// Os campos de identificacao do pet (F1.3, Figma `89:45`).
class CamposDeIdentificacao extends StatefulWidget {
  const CamposDeIdentificacao({required this.rascunho, super.key});

  /// O rascunho e de quem hospeda: quem o cria e quem o descarta.
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

  bool _seguiuSemRaca = false;

  String? _erroDoNome;
  String? _erroDaEspecie;
  String? _erroDoPorte;
  String? _erroDaRacaLivre;

  bool _iniciou = false;

  @override
  void initState() {
    super.initState();
    _rascunho.addListener(_oRascunhoMudou);
  }

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
      _rascunho.refDataVersion = dados.versao;
    });
  }

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
      _rascunho.breedCode = null;
      _rascunho.breedFreeText = '';
    });
    _racaLivre.clear();
    setState(() {
      _erroDaEspecie = null;
      _erroDaRacaLivre = null;
    });
  }

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
  /// rascunho.
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
          estadoInicial: TextosDoCadastro.escolherNaLista,
          itens: _itensDeRaca,
          selecionado: rascunho.breedCode,
          aoSelecionar: _escolherRaca,
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

/// Os campos de sinais do pet (F1.5, Figma `91:51`).
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

  /// Grava o que foi digitado no rascunho.
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
          aoSelecionar: (codigo) => setState(
            () => rascunho.corPrincipalCodigo = codigo,
          ),
        ),
        const SizedBox(height: BichuEspaco.e4),
        SeletorDeLista(
          rotulo: TextosDoCadastro.rotuloDaSegundaCor,
          estadoInicial: TextosDoCadastro.escolherNaLista,
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
      ],
    );
  }
}

/// O bloco de `care_notes`, com o aviso lido **antes** da digitacao.
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
