import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:go_router/go_router.dart';

import '../../api/busca_de_cep.dart';
import '../../formato/cep.dart';
import '../../api/estados_brasileiros.dart';
import '../../api/falhas.dart';
import '../../api/mensagens_de_erro.dart';
import '../../api/modelos_pet.dart';
import '../../api/problem.dart';
import '../../escopo.dart';
import '../../formulario/origem_dos_valores.dart';
import '../../formato/telefone.dart';
import '../../roteamento/rotas.dart';
import '../../roteamento/saida_da_mensagem.dart';
import '../../theme/bichu_tokens.g.dart';
import '../../widgets/acompanhamento_do_pedido.dart';
import '../../widgets/barra_de_acao_fixa.dart';
import '../../widgets/bichu_field.dart';
import '../../widgets/botao_primario.dart';
import '../../widgets/faixa_de_aviso.dart';
import '../../widgets/saida_da_tela.dart';
import '../../widgets/seletor_de_lista.dart';

/// O formulario do pedido da plaquinha da coleira.
class TelaSolicitarPlaquinha extends StatefulWidget {
  const TelaSolicitarPlaquinha({super.key, this.petIdInicial});

  /// O pet que vem pre-selecionado, quando a tela e alcancada de dentro do
  /// produto.
  final String? petIdInicial;

  @override
  State<TelaSolicitarPlaquinha> createState() => _TelaSolicitarPlaquinhaState();
}

class _TelaSolicitarPlaquinhaState extends State<TelaSolicitarPlaquinha> {
  final TextEditingController _destinatario = TextEditingController();
  final TextEditingController _cep = TextEditingController();
  final TextEditingController _logradouro = TextEditingController();
  final TextEditingController _numero = TextEditingController();
  final TextEditingController _complemento = TextEditingController();
  final TextEditingController _bairro = TextEditingController();
  final TextEditingController _cidade = TextEditingController();
  final TextEditingController _telefone = TextEditingController();
  final TextEditingController _observacao = TextEditingController();

  /// O que a ultima busca de CEP devolveu.
  ResultadoDaBusca? _buscaDoCep;
  bool _buscandoOCep = false;

  /// O CEP que a ultima busca usou, para nao repetir a chamada a cada tecla.
  String _cepJaBuscado = '';

  List<Pet>? _pets;
  String? _petEscolhido;
  String? _uf;

  /// De onde veio o valor de cada campo, para a busca de CEP saber o que pode
  /// substituir e o que não pode.
  final OrigemDosValores _origem = OrigemDosValores();

  /// Havia endereço guardado **no pet escolhido** quando esta tela o leu?
  bool? _haviaEnderecoGuardado;

  /// De qual pet é o que está em [_haviaEnderecoGuardado] e nos campos.
  String? _petDoEnderecoLido;

  /// O erro de cada campo, pela mesma chave que o servidor usa em
  /// `errors[].field`.
  final Map<String, String> _erros = <String, String>{};
  bool _carregando = true;
  bool _enviando = false;
  bool _enviado = false;

  /// O pedido **como o servidor o devolveu**, e nao um objeto montado aqui.
  PedidoDePlaquinha? _pedido;
  MensagemDeErro? _faixa;

  /// Ver o mesmo sinalizador em F1.4, F1.6 e na edicao do pet: `Escopo` e
  /// `InheritedWidget`, e le-lo em `initState` e erro de framework -- o
  /// `dependOnInheritedWidgetOfExactType` estoura antes de `initState`
  /// terminar, a listagem nunca sai e a tela abre dizendo "servidor fora".
  bool _iniciou = false;

  @override
  void initState() {
    super.initState();
    _petEscolhido = widget.petIdInicial;
  }

  @override
  void didChangeDependencies() {
    super.didChangeDependencies();
    if (_iniciou) return;
    _iniciou = true;
    _carregarPets();
    final inicial = _petEscolhido;
    if (inicial != null) _carregarOEnderecoDoPet(inicial);
  }

  /// O pet mudou: o endereco pre-preenchido era de OUTRO pet.
  void _trocarDePet(String? escolhido) {
    final soltas = _origem.soltarOQueVeioDoGuardado();
    setState(() {
      _petEscolhido = escolhido;
      _erros.remove(_CamposDoPedido.pet);
      for (final chave in soltas) {
        final campo = _campoDe(chave);
        if (campo != null) {
          campo.clear();
        } else if (chave == _CamposDoPedido.uf) {
          _uf = null;
        }
        _erros.remove(chave);
      }
      _haviaEnderecoGuardado = null;
      _petDoEnderecoLido = null;
      _cepJaBuscado = '';
      _buscaDoCep = null;
    });
    if (escolhido != null) _carregarOEnderecoDoPet(escolhido);
  }

  /// O controlador daquele campo do endereco, ou nulo quando a chave nao e de
  /// um campo de texto (`state`, que e seletor, e `pet`).
  TextEditingController? _campoDe(String chave) {
    return switch (chave) {
      _CamposDoPedido.destinatario => _destinatario,
      _CamposDoPedido.cep => _cep,
      _CamposDoPedido.logradouro => _logradouro,
      _CamposDoPedido.numero => _numero,
      _CamposDoPedido.complemento => _complemento,
      _CamposDoPedido.bairro => _bairro,
      _CamposDoPedido.cidade => _cidade,
      _CamposDoPedido.telefone => _telefone,
      _ => null,
    };
  }

  @override
  void dispose() {
    for (final c in <TextEditingController>[
      _destinatario,
      _cep,
      _logradouro,
      _numero,
      _complemento,
      _bairro,
      _cidade,
      _telefone,
      _observacao,
    ]) {
      c.dispose();
    }
    super.dispose();
  }

  Future<void> _carregarPets() async {
    try {
      final pets = await Escopo.of(context).pets.listarMeusPets();
      if (!mounted) return;
      setState(() {
        _pets = pets;
        if (!pets.any((pet) => pet.id == _petEscolhido)) _petEscolhido = null;
        _carregando = false;
      });
    } on FalhaDeChamada catch (falha) {
      if (!mounted) return;
      setState(() {
        _carregando = false;
        _faixa = _mensagem(falha);
      });
    } on Object catch (erro, pilha) {
      registrarFalhaInesperada(erro, pilha, onde: 'ao listar os pets para a plaquinha');
      if (!mounted) return;
      setState(() {
        _carregando = false;
        _faixa = const MensagemDeErro(texto: MensagensDeErro.servidorFora);
      });
    }
  }

  /// Abre o formulário PREENCHIDO com o endereço guardado **naquele pet**, se
  /// houver.
  Future<void> _carregarOEnderecoDoPet(String petId) async {
    final EnderecoDeEntrega? guardado;
    try {
      guardado = await Escopo.of(context).pets.lerEnderecoDoPet(petId);
    } on FalhaDeChamada {
      return;
    } on Object catch (erro, pilha) {
      registrarFalhaInesperada(erro, pilha, onde: 'ao ler o endereço de entrega do pet para a plaquinha');
      return;
    }
    if (!mounted) return;
    if (_petEscolhido != petId) return;
    _petDoEnderecoLido = petId;

    if (guardado == null) {
      setState(() => _haviaEnderecoGuardado = false);
      return;
    }
    _haviaEnderecoGuardado = true;

    setState(() {
      _preencherDoGuardado(_cep, mascaraDeCep(guardado!.cep), _CamposDoPedido.cep);
      _preencherDoGuardado(
        _destinatario,
        guardado.destinatario,
        _CamposDoPedido.destinatario,
      );
      _preencherDoGuardado(_logradouro, guardado.logradouro, _CamposDoPedido.logradouro);
      _preencherDoGuardado(_numero, guardado.numero, _CamposDoPedido.numero);
      _preencherDoGuardado(
        _complemento,
        guardado.complemento ?? '',
        _CamposDoPedido.complemento,
      );
      _preencherDoGuardado(_bairro, guardado.bairro, _CamposDoPedido.bairro);
      _preencherDoGuardado(_cidade, guardado.cidade, _CamposDoPedido.cidade);
      _preencherDoGuardado(
        _telefone,
        telefoneDoE164(guardado.telefone),
        _CamposDoPedido.telefone,
      );
      if (_uf == null && guardado.uf.length == 2) {
        _uf = guardado.uf;
        _origem.anotarDaConta(_CamposDoPedido.uf, temValor: true);
        _erros.remove(_CamposDoPedido.uf);
      }
      if (_cepJaBuscado.isEmpty) _cepJaBuscado = guardado.cep;
    });
  }

  /// Põe o valor do endereço guardado num campo **vazio**, e anota que aquele
  /// campo ainda não foi tocado pela pessoa.
  Future<void> _guardarSeNaoHavia(String petId, EnderecoDeEntrega endereco) async {
    if (_haviaEnderecoGuardado != false) return;
    if (_petDoEnderecoLido != petId) return;
    try {
      await Escopo.of(context).pets.salvarEnderecoDoPet(petId, endereco);
      _haviaEnderecoGuardado = true;
    } on FalhaDeChamada {
      // Silencioso de proposito: ver "falhar aqui nao desfaz nem denuncia o pedido", acima.
    } on Object catch (erro, pilha) {
      registrarFalhaInesperada(
        erro,
        pilha,
        onde: 'ao guardar no pet o endereco do primeiro pedido de plaquinha',
      );
    }
  }

  void _preencherDoGuardado(TextEditingController campo, String valor, String chave) {
    if (_origem.doGuardado(campo, valor, chave)) _erros.remove(chave);
  }

  /// Busca o endereco do CEP e preenche o que estiver VAZIO.
  Future<void> _buscarOCep() async {
    final cep = _soDigitos(_cep.text);
    if (cep.length != 8 || cep == _cepJaBuscado) return;
    _cepJaBuscado = cep;

    setState(() {
      _buscandoOCep = true;
      _buscaDoCep = null;
    });

    final resposta = await Escopo.of(context).buscaDeCep.buscar(cep);
    if (!mounted) return;

    setState(() {
      _buscandoOCep = false;
      _buscaDoCep = resposta.resultado;
      final endereco = resposta.endereco;
      if (endereco == null) return;

      _preencherSeVazio(_logradouro, endereco.logradouro, _CamposDoPedido.logradouro);
      _preencherSeVazio(_bairro, endereco.bairro, _CamposDoPedido.bairro);
      _preencherSeVazio(_cidade, endereco.cidade, _CamposDoPedido.cidade);
      if (_origem.podeVirDaBusca(_CamposDoPedido.uf, vazio: _uf == null) &&
          endereco.uf.length == 2) {
        _uf = endereco.uf;
        _origem.soltar(_CamposDoPedido.uf);
        _erros.remove(_CamposDoPedido.uf);
      }
    });
  }

  /// Preenche o campo quando ele está vazio **ou quando ainda carrega o valor
  /// que veio do endereço guardado**, sem a pessoa ter tocado nele.
  void _preencherSeVazio(TextEditingController campo, String valor, String chave) {
    if (_origem.daBusca(campo, valor, chave)) _erros.remove(chave);
  }

  /// Valida **campo por campo**, e devolve os erros todos de uma vez.
  Map<String, String> _conferir() {
    final erros = <String, String>{};
    if (_petEscolhido == null) {
      erros[_CamposDoPedido.pet] = _TextosDaPlaquinha.escolhaOPet;
    }
    if (_destinatario.text.trim().length < 2) {
      erros[_CamposDoPedido.destinatario] = _TextosDaPlaquinha.digiteODestinatario;
    }
    if (_soDigitos(_cep.text).length != 8) {
      erros[_CamposDoPedido.cep] = _TextosDaPlaquinha.cepTemOitoDigitos;
    }
    if (_logradouro.text.trim().length < 2) {
      erros[_CamposDoPedido.logradouro] = _TextosDaPlaquinha.digiteORua;
    }
    if (_numero.text.trim().isEmpty) {
      erros[_CamposDoPedido.numero] = _TextosDaPlaquinha.digiteONumero;
    }
    if (_bairro.text.trim().length < 2) {
      erros[_CamposDoPedido.bairro] = _TextosDaPlaquinha.digiteOBairro;
    }
    if (_cidade.text.trim().length < 2) {
      erros[_CamposDoPedido.cidade] = _TextosDaPlaquinha.digiteACidade;
    }
    if (_uf == null) {
      erros[_CamposDoPedido.uf] = _TextosDaPlaquinha.escolhaOEstado;
    }
    if (telefoneEmE164(_telefone.text) == null) {
      erros[_CamposDoPedido.telefone] = _TextosDaPlaquinha.telefoneIncompleto;
    }
    return erros;
  }

  static String _soDigitos(String bruto) => bruto.replaceAll(RegExp(r'\D'), '');

  Future<void> _pedir() async {
    final erros = _conferir();
    if (erros.isNotEmpty) {
      setState(() {
        _erros
          ..clear()
          ..addAll(erros);
        _faixa = null;
      });
      return;
    }

    final pet = _petEscolhido!;
    setState(() {
      _erros.clear();
      _faixa = null;
      _enviando = true;
    });

    final enderecoDoPedido = EnderecoDeEntrega(
      destinatario: _destinatario.text.trim(),
      cep: _soDigitos(_cep.text),
      logradouro: _logradouro.text.trim(),
      numero: _numero.text.trim(),
      complemento: _complemento.text.trim(),
      bairro: _bairro.text.trim(),
      cidade: _cidade.text.trim(),
      uf: _uf!,
      telefone: telefoneEmE164(_telefone.text)!,
    );

    try {
      final pedido = await Escopo.of(context).pets.solicitarPlaquinha(
        petId: pet,
        endereco: enderecoDoPedido,
        observacao: _observacao.text.trim(),
      );
      if (!mounted) return;
      await _guardarSeNaoHavia(pet, enderecoDoPedido);
      if (!mounted) return;
      setState(() {
        _enviado = true;
        _pedido = pedido;
      });
    } on FalhaDeChamada catch (falha) {
      if (!mounted) return;
      setState(() => _faixa = _mensagem(falha));
    } on Object catch (erro, pilha) {
      registrarFalhaInesperada(erro, pilha, onde: 'ao solicitar a plaquinha');
      if (!mounted) return;
      setState(
        () => _faixa = const MensagemDeErro(texto: MensagensDeErro.servidorFora),
      );
    } finally {
      if (mounted) setState(() => _enviando = false);
    }
  }

  /// **Decide por `tipo`, nunca por status**, como as outras telas deste
  /// modulo, e cai em `MensagensDeErro.de` no resto -- a traducao comum de
  /// falha de rede e de 5xx mora la, e uma segunda redacao divergiria dela.
  MensagemDeErro _mensagem(FalhaDeChamada falha) {
    if (falha is FalhaDaApi &&
        falha.problem.tipo == ProblemTipo.validacaoFalhou &&
        falha.problem.campos.isNotEmpty) {
      final doServidor = <String, String>{};
      for (final campo in falha.problem.campos) {
        final chave = _CamposDoPedido.doServidor(campo.campo);
        if (chave != null) {
          doServidor[chave] = campo.mensagem ?? _TextosDaPlaquinha.confiraEsteCampo;
        }
      }
      if (doServidor.isNotEmpty) {
        setState(() => _erros
          ..clear()
          ..addAll(doServidor));
        return const MensagemDeErro(texto: _TextosDaPlaquinha.confiraOsCampos);
      }
    }
    if (falha is FalhaDaApi &&
        (falha.problem.tipo == ProblemTipo.naoEncontrado ||
            falha.problem.status == 404)) {
      return const MensagemDeErro(texto: _TextosDaPlaquinha.petNaoEncontrado);
    }
    if (falha is FalhaDaApi &&
        falha.problem.tipo == ProblemTipo.limiteDeTentativas) {
      return const MensagemDeErro(texto: _TextosDaPlaquinha.tetoAtingido);
    }
    return MensagensDeErro.de(falha);
  }

  /// Um campo do endereco, com o espacamento e o erro no mesmo lugar.
  Widget _campo({
    required String chave,
    required String rotulo,
    required TextEditingController controlador,
    required int limite,
    bool opcional = false,
    String? exemplo,
    TextInputType? tipoDeTeclado,
    TextCapitalization capitalizacao = TextCapitalization.none,
    List<TextInputFormatter>? formatadores,
    ValueChanged<String>? aoMudarTambem,
    /// As dicas de preenchimento do SISTEMA (iOS e Android).
    List<String> autofill = const <String>[],
  }) {
    return Padding(
      padding: const EdgeInsets.only(bottom: BichuEspaco.e4),
      child: BichuField(
        rotulo: rotulo,
        controlador: controlador,
        autofill: autofill,
        opcional: opcional,
        limite: limite,
        erro: _erros[chave],
        habilitado: !_enviando,
        exemplo: exemplo,
        tipoDeTeclado: tipoDeTeclado,
        capitalizacao: capitalizacao,
        formatadores: formatadores,
        aoMudar: (valor) {
          final soltou = _origem.soltar(chave);
          if (_erros.containsKey(chave) || soltou) {
            setState(() => _erros.remove(chave));
          }
          aoMudarTambem?.call(valor);
        },
      ),
    );
  }

  /// A linha que conta o que a busca de CEP fez.
  Widget _linhaDaBusca(TextTheme textos) {
    if (_buscandoOCep) {
      return Text(
        _TextosDaPlaquinha.buscandoOCep,
        style: textos.bodySmall,
      );
    }
    final texto = switch (_buscaDoCep) {
      ResultadoDaBusca.naoEncontrado => _TextosDaPlaquinha.cepNaoEncontrado,
      ResultadoDaBusca.indisponivel => _TextosDaPlaquinha.buscaIndisponivel,
      _ => null,
    };
    if (texto == null) return const SizedBox.shrink();
    return Text(texto, style: textos.bodySmall);
  }

  List<ItemDeLista> get _itensDosPets => (_pets ?? <Pet>[])
      .map((pet) => ItemDeLista(codigo: pet.id, rotulo: pet.nome))
      .toList(growable: false);

  @override
  Widget build(BuildContext context) {
    final textos = Theme.of(context).textTheme;
    final semPets = !_carregando && (_pets?.isEmpty ?? false);

    return Scaffold(
      appBar: const BarraDeConta(
        titulo: _TextosDaPlaquinha.titulo,
        saida: TipoDeSaida.voltar,
      ),
      bottomNavigationBar: BarraDeAcaoFixa(
        acoes: <Widget>[
          if (_enviado)
            BotaoPrimario(
              rotulo: _TextosDaPlaquinha.fechar,
              aoTocar: () => context.go(Rotas.perfil),
            )
          else
            BotaoPrimario(
              rotulo: _TextosDaPlaquinha.pedir,
              critico: true,
              carregando: _enviando,
              aoTocar: semPets ? null : _pedir,
            ),
        ],
      ),
      body: SafeArea(
        child: AutofillGroup(
          child: _carregando
            ? const Center(child: CircularProgressIndicator())
            : SingleChildScrollView(
                padding: const EdgeInsets.all(BichuEspaco.e4),
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.stretch,
                  children: <Widget>[
                    if (_enviado && _pedido != null)
                      AcompanhamentoDoPedido(pedido: _pedido!)
                    else if (semPets)
                      Text(_TextosDaPlaquinha.semPets, style: textos.bodyLarge)
                    else ...<Widget>[
                      SeletorDeLista(
                        rotulo: _TextosDaPlaquinha.pet,
                        itens: _itensDosPets,
                        selecionado: _petEscolhido,
                        erro: _erros[_CamposDoPedido.pet],
                        habilitado: !_enviando,
                        aoSelecionar: _trocarDePet,
                      ),
                      const SizedBox(height: BichuEspaco.e6),
                      Semantics(
                        header: true,
                        child: Text(
                          _TextosDaPlaquinha.ondeEntregar,
                          style: textos.titleMedium,
                        ),
                      ),
                      const SizedBox(height: BichuEspaco.e4),
                      _campo(
                        chave: _CamposDoPedido.destinatario,
                        rotulo: _TextosDaPlaquinha.destinatario,
                        controlador: _destinatario,
                        limite: 120,
                        autofill: const <String>[AutofillHints.name],
                        tipoDeTeclado: TextInputType.name,
                        capitalizacao: TextCapitalization.words,
                      ),
                      _campo(
                        chave: _CamposDoPedido.cep,
                        autofill: const <String>[AutofillHints.postalCode],
                        rotulo: _TextosDaPlaquinha.cep,
                        controlador: _cep,
                        limite: limiteDoCep,
                        tipoDeTeclado: TextInputType.number,
                        formatadores: const <TextInputFormatter>[
                          MascaraDeCep(),
                        ],
                        aoMudarTambem: (_) => _buscarOCep(),
                      ),
                      if (_buscandoOCep || _buscaDoCep != null) ...<Widget>[
                        _linhaDaBusca(textos),
                        const SizedBox(height: BichuEspaco.e4),
                      ],
                      _campo(
                        chave: _CamposDoPedido.logradouro,
                        autofill: const <String>[
                          AutofillHints.streetAddressLine1,
                        ],
                        rotulo: _TextosDaPlaquinha.logradouro,
                        controlador: _logradouro,
                        limite: 120,
                        tipoDeTeclado: TextInputType.streetAddress,
                        capitalizacao: TextCapitalization.words,
                      ),
                      _campo(
                        chave: _CamposDoPedido.numero,
                        rotulo: _TextosDaPlaquinha.numero,
                        controlador: _numero,
                        limite: 20,
                        tipoDeTeclado: TextInputType.number,
                        exemplo: _TextosDaPlaquinha.exemploDoNumero,
                      ),
                      _campo(
                        chave: _CamposDoPedido.complemento,
                        autofill: const <String>[
                          AutofillHints.streetAddressLine2,
                        ],
                        rotulo: _TextosDaPlaquinha.complemento,
                        controlador: _complemento,
                        limite: 80,
                        opcional: true,
                      ),
                      _campo(
                        chave: _CamposDoPedido.bairro,
                        autofill: const <String>[AutofillHints.sublocality],
                        rotulo: _TextosDaPlaquinha.bairro,
                        controlador: _bairro,
                        limite: 80,
                        capitalizacao: TextCapitalization.words,
                      ),
                      _campo(
                        chave: _CamposDoPedido.cidade,
                        autofill: const <String>[AutofillHints.addressCity],
                        rotulo: _TextosDaPlaquinha.cidade,
                        controlador: _cidade,
                        limite: 80,
                        capitalizacao: TextCapitalization.words,
                      ),
                      SeletorDeLista(
                        rotulo: _TextosDaPlaquinha.estado,
                        itens: estadosBrasileiros,
                        selecionado: _uf,
                        erro: _erros[_CamposDoPedido.uf],
                        habilitado: !_enviando,
                        aoSelecionar: (escolhido) => setState(() {
                          _uf = escolhido;
                          _origem.soltar(_CamposDoPedido.uf);
                          _erros.remove(_CamposDoPedido.uf);
                        }),
                      ),
                      const SizedBox(height: BichuEspaco.e4),
                      _campo(
                        chave: _CamposDoPedido.telefone,
                        autofill: const <String>[
                          AutofillHints.telephoneNumber,
                        ],
                        rotulo: _TextosDaPlaquinha.telefone,
                        controlador: _telefone,
                        limite: limiteDoTelefone,
                        tipoDeTeclado: TextInputType.phone,
                        exemplo: _TextosDaPlaquinha.exemploDoTelefone,
                        formatadores: const <TextInputFormatter>[
                          MascaraDeTelefone(),
                        ],
                      ),
                      const SizedBox(height: BichuEspaco.e2),
                      BichuField(
                        rotulo: _TextosDaPlaquinha.observacao,
                        controlador: _observacao,
                        opcional: true,
                        linhas: 3,
                        limite: _TextosDaPlaquinha.limiteDaObservacao,
                        habilitado: !_enviando,
                        exemplo: _TextosDaPlaquinha.exemploDaObservacao,
                      ),
                    ],
                    if (_faixa != null) ...<Widget>[
                      const SizedBox(height: BichuEspaco.e6),
                      FaixaDeAviso(
                        texto: _faixa!.texto,
                        rotuloDaAcao: _faixa!.acao,
                        aoTocarNaAcao: saidaDaMensagem(context, _faixa!),
                      ),
                    ],
                  ],
                ),
              ),
        ),
      ),
    );
  }
}

/// Os textos da tela.
abstract final class _CamposDoPedido {
  static const String pet = 'pet';
  static const String destinatario = 'recipient_name';
  static const String cep = 'postal_code';
  static const String logradouro = 'street';
  static const String numero = 'street_number';
  static const String complemento = 'complement';
  static const String bairro = 'neighborhood';
  static const String cidade = 'city';
  static const String uf = 'state';
  static const String telefone = 'recipient_phone';

  static const List<String> todos = <String>[
    destinatario,
    cep,
    logradouro,
    numero,
    complemento,
    bairro,
    cidade,
    uf,
    telefone,
  ];

  /// O campo do formulario que corresponde ao que o servidor nomeou, ou nulo.
  static String? doServidor(String campo) {
    for (final chave in todos) {
      if (campo == chave || campo.endsWith('/\$chave') || campo.endsWith('.\$chave')) {
        return chave;
      }
    }
    return null;
  }
}

abstract final class _TextosDaPlaquinha {
  static const String titulo = 'Plaquinha da coleira';
  static const String pet = 'Pet';
  static const String ondeEntregar = 'Onde entregar';
  static const String destinatario = 'Quem recebe';
  static const String cep = 'CEP';
  static const String logradouro = 'Rua';
  static const String numero = 'Número';
  static const String exemploDoNumero = '120, 120A, s/n';
  static const String complemento = 'Complemento';
  static const String bairro = 'Bairro';
  static const String cidade = 'Cidade';
  static const String estado = 'Estado';
  static const String telefone = 'Telefone de quem recebe';
  static const String exemploDoTelefone = '(11) 98765-4321';
  static const String observacao = 'Observação';
  /// **A COR SAIU DAQUI** (cliente, 18/10): a plaquinha tera **cor unica**,
  /// entao oferecer a cor como exemplo de observacao convidava a pessoa a pedir
  /// uma coisa que nao existe -- e quem atendesse o pedido teria de recusar
  /// depois.
  static const String exemploDaObservacao = 'nome gravado';

  /// O mesmo 500 do contrato (`CollarTagRequestInput.notes`).
  static const int limiteDaObservacao = 500;

  static const String pedir = 'Pedir a plaquinha';
  static const String fechar = 'Fechar';

  static const String escolhaOPet = 'Escolha o pet.';
  static const String digiteODestinatario = 'Diga quem recebe.';
  static const String cepTemOitoDigitos = 'O CEP tem 8 dígitos.';
  static const String digiteORua = 'Digite a rua.';
  static const String digiteONumero = 'Digite o número.';
  static const String digiteOBairro = 'Digite o bairro.';
  static const String digiteACidade = 'Digite a cidade.';
  static const String escolhaOEstado = 'Escolha o estado.';
  static const String telefoneIncompleto = 'Digite DDD e número.';

  /// Os tres desfechos da busca de CEP.
  static const String buscandoOCep = 'Buscando o endereço…';
  static const String cepNaoEncontrado = 'CEP não encontrado. Preencha abaixo.';
  static const String buscaIndisponivel = 'Não deu para buscar. Preencha abaixo.';
  static const String confiraOsCampos = 'Confira os campos marcados.';
  static const String confiraEsteCampo = 'Confira este campo.';
  static const String semPets = 'Cadastre um pet para pedir a plaquinha.';
  static const String petNaoEncontrado = 'Este pet não está na sua conta.';
  static const String tetoAtingido = 'Você já fez três pedidos hoje. Tente amanhã.';
}
