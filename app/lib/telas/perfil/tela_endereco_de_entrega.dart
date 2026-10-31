import 'package:flutter/material.dart';
import 'package:flutter/services.dart';

import '../../api/estados_brasileiros.dart';
import '../../api/falhas.dart';
import '../../api/mensagens_de_erro.dart';
import '../../api/modelos_pet.dart';
import '../../api/problem.dart';
import '../../escopo.dart';
import '../../formato/cep.dart';
import '../../formulario/bloco_de_cep.dart';
import '../../formulario/origem_dos_valores.dart';
import '../../formato/telefone.dart';
import '../../roteamento/saida_da_mensagem.dart';
import '../../theme/bichu_tokens.g.dart';
import '../../widgets/barra_de_acao_fixa.dart';
import '../../widgets/bichu_field.dart';
import '../../widgets/botao_primario.dart';
import '../../widgets/faixa_de_aviso.dart';
import '../../widgets/saida_da_tela.dart';
import '../../widgets/seletor_de_lista.dart';

/// **`Pets` > o pet > `Editar pet` > `Endereço de entrega`**: o lugar — **um só
/// por pet** — onde o endereço de entrega daquele pet é editado.
class TelaEnderecoDeEntrega extends StatefulWidget {
  const TelaEnderecoDeEntrega({required this.petId, super.key});

  /// O pet de quem é este endereço.
  final String petId;

  @override
  State<TelaEnderecoDeEntrega> createState() => _TelaEnderecoDeEntregaState();
}

class _TelaEnderecoDeEntregaState extends State<TelaEnderecoDeEntrega> {
  final TextEditingController _destinatario = TextEditingController();
  final TextEditingController _logradouro = TextEditingController();
  final TextEditingController _numero = TextEditingController();
  final TextEditingController _complemento = TextEditingController();
  final TextEditingController _bairro = TextEditingController();
  final TextEditingController _cidade = TextEditingController();
  final TextEditingController _telefone = TextEditingController();

  String? _uf;

  /// De onde veio o valor de cada campo, para a busca de CEP saber o que pode
  /// substituir e o que não pode.
  final OrigemDosValores _origem = OrigemDosValores();

  /// O BLOCO DE CEP COMPARTILHADO -- `formulario/bloco_de_cep.dart`, o mesmo
  /// das outras cinco telas que têm CEP. **O campo de CEP mora nele.**
  ///
  /// Antes de 30/10/2026 esta tela tinha a própria cópia do bloco, e a cópia
  /// **não conferia a sigla do estado**: ela aceitava qualquer par de letras
  /// que a base de CEP devolvesse. O bloco chama `siglaDeEstadoValida`, e
  /// agora esta tela também.
  late final BlocoDeCep _cepBloco = BlocoDeCep(
    origem: _origem,
    atualizar: setState,
    montado: () => mounted,
    destino: DestinoDoCep(
      logradouro: _logradouro,
      chaveDoLogradouro: _CamposDoEndereco.logradouro,
      bairro: _bairro,
      chaveDoBairro: _CamposDoEndereco.bairro,
      cidade: _cidade,
      chaveDaCidade: _CamposDoEndereco.cidade,
      chaveDoEstado: _CamposDoEndereco.uf,
      estadoEscolhido: () => _uf,
      aoEscolherEstado: (sigla) => _uf = sigla,
      aoPreencher: _erros.remove,
    ),
  );

  /// Os três desfechos da busca, nos textos DESTA tela.
  static const TextosDaBuscaDeCep _textosDaBusca = TextosDaBuscaDeCep(
    indisponivel: _TextosDoEndereco.buscaIndisponivel,
  );

  /// O erro de cada campo, pela mesma chave que o servidor usa em
  /// `errors[].field`.
  final Map<String, String> _erros = <String, String>{};

  bool _carregando = true;
  bool _salvando = false;
  bool _salvou = false;
  MensagemDeErro? _faixa;

  /// Ver o mesmo sinalizador na tela de solicitar a plaquinha: `Escopo` é
  /// `InheritedWidget`, e lê-lo em `initState` é erro de framework.
  bool _iniciou = false;

  @override
  void didChangeDependencies() {
    super.didChangeDependencies();
    if (_iniciou) return;
    _iniciou = true;
    _carregar();
  }

  @override
  void dispose() {
    for (final c in <TextEditingController>[
      _destinatario,
      _logradouro,
      _numero,
      _complemento,
      _bairro,
      _cidade,
      _telefone,
    ]) {
      c.dispose();
    }
    _cepBloco.dispose();
    super.dispose();
  }

  /// Abre com o endereço **deste pet**, se houver.
  Future<void> _carregar() async {
    try {
      final guardado = await Escopo.of(context).pets.lerEnderecoDoPet(widget.petId);
      if (!mounted) return;
      setState(() {
        if (guardado != null) _preencherCom(guardado);
        _carregando = false;
      });
    } on FalhaDeChamada catch (falha) {
      if (!mounted) return;
      setState(() {
        _carregando = false;
        _faixa = MensagensDeErro.de(falha);
      });
    } on Object catch (erro, pilha) {
      registrarFalhaInesperada(erro, pilha, onde: 'ao ler o endereço de entrega guardado');
      if (!mounted) return;
      setState(() {
        _carregando = false;
        _faixa = const MensagemDeErro(texto: MensagensDeErro.servidorFora);
      });
    }
  }

  /// Joga o endereço nos campos.
  void _preencherCom(EnderecoDeEntrega endereco) {
    _destinatario.text = endereco.destinatario;
    _cepBloco.cep.text = mascaraDeCep(endereco.cep);
    _logradouro.text = endereco.logradouro;
    _numero.text = endereco.numero;
    _complemento.text = endereco.complemento ?? '';
    _bairro.text = endereco.bairro;
    _cidade.text = endereco.cidade;
    _telefone.text = telefoneDoE164(endereco.telefone);
    _uf = endereco.uf.isEmpty ? null : endereco.uf;
    for (final (chave, valor) in <(String, String)>[
      (_CamposDoEndereco.destinatario, endereco.destinatario),
      (_CamposDoEndereco.cep, endereco.cep),
      (_CamposDoEndereco.logradouro, endereco.logradouro),
      (_CamposDoEndereco.numero, endereco.numero),
      (_CamposDoEndereco.complemento, endereco.complemento ?? ''),
      (_CamposDoEndereco.bairro, endereco.bairro),
      (_CamposDoEndereco.cidade, endereco.cidade),
      (_CamposDoEndereco.uf, endereco.uf),
      (_CamposDoEndereco.telefone, endereco.telefone),
    ]) {
      _origem.anotarDaConta(chave, temValor: valor.isNotEmpty);
    }
    _cepBloco.naoBuscarDeNovo(endereco.cep);
  }

  /// Valida **campo por campo**, e devolve os erros todos de uma vez.
  Map<String, String> _conferir() {
    final erros = <String, String>{};
    if (_destinatario.text.trim().length < 2) {
      erros[_CamposDoEndereco.destinatario] = _TextosDoEndereco.digiteODestinatario;
    }
    if (cepParaOContrato(_cepBloco.cep.text) == null) {
      erros[_CamposDoEndereco.cep] = _TextosDoEndereco.cepTemOitoDigitos;
    }
    if (_logradouro.text.trim().length < 2) {
      erros[_CamposDoEndereco.logradouro] = _TextosDoEndereco.digiteARua;
    }
    if (_numero.text.trim().isEmpty) {
      erros[_CamposDoEndereco.numero] = _TextosDoEndereco.digiteONumero;
    }
    if (_bairro.text.trim().length < 2) {
      erros[_CamposDoEndereco.bairro] = _TextosDoEndereco.digiteOBairro;
    }
    if (_cidade.text.trim().length < 2) {
      erros[_CamposDoEndereco.cidade] = _TextosDoEndereco.digiteACidade;
    }
    if (_uf == null) {
      erros[_CamposDoEndereco.uf] = _TextosDoEndereco.escolhaOEstado;
    }
    if (telefoneEmE164(_telefone.text) == null) {
      erros[_CamposDoEndereco.telefone] = _TextosDoEndereco.telefoneIncompleto;
    }
    return erros;
  }

  Future<void> _salvar() async {
    final erros = _conferir();
    if (erros.isNotEmpty) {
      setState(() {
        _erros
          ..clear()
          ..addAll(erros);
        _faixa = null;
        _salvou = false;
      });
      return;
    }

    setState(() {
      _erros.clear();
      _faixa = null;
      _salvou = false;
      _salvando = true;
    });

    try {
      final guardado = await Escopo.of(context).pets.salvarEnderecoDoPet(
        widget.petId,
        EnderecoDeEntrega(
          destinatario: _destinatario.text.trim(),
          cep: cepParaOContrato(_cepBloco.cep.text)!,
          logradouro: _logradouro.text.trim(),
          numero: _numero.text.trim(),
          complemento: _complemento.text.trim(),
          bairro: _bairro.text.trim(),
          cidade: _cidade.text.trim(),
          uf: _uf!,
          telefone: telefoneEmE164(_telefone.text)!,
        ),
      );
      if (!mounted) return;
      setState(() {
        _preencherCom(guardado);
        _salvou = true;
      });
    } on FalhaDeChamada catch (falha) {
      if (!mounted) return;
      setState(() => _faixa = _mensagem(falha));
    } on Object catch (erro, pilha) {
      registrarFalhaInesperada(erro, pilha, onde: 'ao guardar o endereço de entrega');
      if (!mounted) return;
      setState(
        () => _faixa = const MensagemDeErro(texto: MensagensDeErro.servidorFora),
      );
    } finally {
      if (mounted) setState(() => _salvando = false);
    }
  }

  /// **Decide por `tipo`, nunca por status**, como as outras telas, e cai em
  /// `MensagensDeErro.de` no resto.
  MensagemDeErro _mensagem(FalhaDeChamada falha) {
    if (falha is FalhaDaApi &&
        falha.problem.tipo == ProblemTipo.validacaoFalhou &&
        falha.problem.campos.isNotEmpty) {
      final doServidor = <String, String>{};
      for (final campo in falha.problem.campos) {
        final chave = _CamposDoEndereco.doServidor(campo.campo);
        if (chave != null) {
          doServidor[chave] = campo.mensagem ?? _TextosDoEndereco.confiraEsteCampo;
        }
      }
      if (doServidor.isNotEmpty) {
        setState(() => _erros
          ..clear()
          ..addAll(doServidor));
        return const MensagemDeErro(texto: _TextosDoEndereco.confiraOsCampos);
      }
    }
    return MensagensDeErro.de(falha);
  }

  /// Um campo do endereço, com o espaçamento e o erro no mesmo lugar.
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
  }) {
    return Padding(
      padding: const EdgeInsets.only(bottom: BichuEspaco.e4),
      child: BichuField(
        rotulo: rotulo,
        controlador: controlador,
        opcional: opcional,
        limite: limite,
        erro: _erros[chave],
        habilitado: !_salvando,
        exemplo: exemplo,
        tipoDeTeclado: tipoDeTeclado,
        capitalizacao: capitalizacao,
        formatadores: formatadores,
        aoMudar: (valor) {
          final soltou = _origem.soltar(chave);
          if (_erros.containsKey(chave) || _salvou || soltou) {
            setState(() {
              _erros.remove(chave);
              _salvou = false;
            });
          }
          aoMudarTambem?.call(valor);
        },
      ),
    );
  }

  @override
  Widget build(BuildContext context) {
    final textos = Theme.of(context).textTheme;

    return Scaffold(
      appBar: const BarraDeConta(
        titulo: _TextosDoEndereco.titulo,
        saida: TipoDeSaida.voltar,
      ),
      bottomNavigationBar: BarraDeAcaoFixa(
        acoes: <Widget>[
          BotaoPrimario(
            rotulo: _TextosDoEndereco.guardar,
            carregando: _salvando,
            aoTocar: _carregando ? null : _salvar,
          ),
        ],
      ),
      body: SafeArea(
        child: _carregando
            ? const Center(child: CircularProgressIndicator())
            : SingleChildScrollView(
                padding: const EdgeInsets.all(BichuEspaco.e4),
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.stretch,
                  children: <Widget>[
                    Text(_TextosDoEndereco.paraQueServe, style: textos.bodyMedium),
                    const SizedBox(height: BichuEspaco.e4),
                    _campo(
                      chave: _CamposDoEndereco.destinatario,
                      rotulo: _TextosDoEndereco.destinatario,
                      controlador: _destinatario,
                      limite: 120,
                      capitalizacao: TextCapitalization.words,
                    ),
                    _campo(
                      chave: _CamposDoEndereco.cep,
                      rotulo: _TextosDoEndereco.cep,
                      controlador: _cepBloco.cep,
                      limite: limiteDoCep,
                      tipoDeTeclado: TextInputType.number,
                      formatadores: formatadoresDeCep,
                      aoMudarTambem: (_) =>
                          _cepBloco.buscar(Escopo.of(context).buscaDeCep),
                    ),
                    if (_cepBloco.temDesfecho) ...<Widget>[
                      LinhaDaBuscaDeCep(
                        bloco: _cepBloco,
                        textos: _textosDaBusca,
                        estilo: textos.bodySmall,
                      ),
                      const SizedBox(height: BichuEspaco.e4),
                    ],
                    _campo(
                      chave: _CamposDoEndereco.logradouro,
                      rotulo: _TextosDoEndereco.logradouro,
                      controlador: _logradouro,
                      limite: 120,
                      capitalizacao: TextCapitalization.words,
                    ),
                    _campo(
                      chave: _CamposDoEndereco.numero,
                      rotulo: _TextosDoEndereco.numero,
                      controlador: _numero,
                      limite: 20,
                      exemplo: _TextosDoEndereco.exemploDoNumero,
                    ),
                    _campo(
                      chave: _CamposDoEndereco.complemento,
                      rotulo: _TextosDoEndereco.complemento,
                      controlador: _complemento,
                      limite: 80,
                      opcional: true,
                    ),
                    _campo(
                      chave: _CamposDoEndereco.bairro,
                      rotulo: _TextosDoEndereco.bairro,
                      controlador: _bairro,
                      limite: 80,
                      capitalizacao: TextCapitalization.words,
                    ),
                    _campo(
                      chave: _CamposDoEndereco.cidade,
                      rotulo: _TextosDoEndereco.cidade,
                      controlador: _cidade,
                      limite: 80,
                      capitalizacao: TextCapitalization.words,
                    ),
                    SeletorDeLista(
                      rotulo: _TextosDoEndereco.estado,
                      itens: estadosBrasileiros,
                      selecionado: _uf,
                      erro: _erros[_CamposDoEndereco.uf],
                      habilitado: !_salvando,
                      aoSelecionar: (escolhido) => setState(() {
                        _uf = escolhido;
                        _origem.soltar(_CamposDoEndereco.uf);
                        _erros.remove(_CamposDoEndereco.uf);
                        _salvou = false;
                      }),
                    ),
                    const SizedBox(height: BichuEspaco.e4),
                    _campo(
                      chave: _CamposDoEndereco.telefone,
                      rotulo: _TextosDoEndereco.telefone,
                      controlador: _telefone,
                      limite: limiteDoTelefone,
                      tipoDeTeclado: TextInputType.phone,
                      exemplo: _TextosDoEndereco.exemploDoTelefone,
                      formatadores: const <TextInputFormatter>[MascaraDeTelefone()],
                    ),
                    if (_salvou) ...<Widget>[
                      const SizedBox(height: BichuEspaco.e4),
                      Text(_TextosDoEndereco.guardado, style: textos.bodyMedium),
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
    );
  }
}

/// As chaves de campo, iguais dos dois lados.
abstract final class _CamposDoEndereco {
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

  /// O campo do formulário que corresponde ao que o servidor nomeou, ou nulo.
  static String? doServidor(String campo) {
    for (final chave in todos) {
      if (campo == chave || campo.endsWith('/$chave') || campo.endsWith('.$chave')) {
        return chave;
      }
    }
    return null;
  }
}

/// Os textos da tela. **Curtos de propósito**: não há promessa de prazo e não
/// há aviso sobre entrega — prazo e entrega dependem de decisão de produto que
/// não foi tomada, e prometer aqui o que ninguém decidiu é pior que calar.
abstract final class _TextosDoEndereco {
  static const String titulo = 'Endereço de entrega';

  /// **Diz para que serve, diz que é DESTE pet, e diz o que NÃO acontece.**
  static const String paraQueServe =
      'É o endereço deste pet. Guardado aqui, ele vem preenchido quando você '
      'pedir a plaquinha dele — e salvar aqui não mexe no endereço dos seus '
      'outros pets. Você pode mudar o endereço na hora do pedido sem alterar '
      'este.';

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

  static const String guardar = 'Guardar endereço';
  static const String guardado = 'Endereço guardado.';

  static const String digiteODestinatario = 'Diga quem recebe.';
  static const String cepTemOitoDigitos = 'O CEP tem 8 dígitos.';
  static const String digiteARua = 'Digite a rua.';
  static const String digiteONumero = 'Digite o número.';
  static const String digiteOBairro = 'Digite o bairro.';
  static const String digiteACidade = 'Digite a cidade.';
  static const String escolhaOEstado = 'Escolha o estado.';
  static const String telefoneIncompleto = 'Digite DDD e número.';

  /// O terceiro desfecho da busca de CEP; os outros dois são iguais nas seis
  /// telas e vivem em `TextosDaBuscaDeCep`, no bloco compartilhado.
  static const String buscaIndisponivel = 'Não deu para buscar. Preencha abaixo.';
  static const String confiraOsCampos = 'Confira os campos marcados.';
  static const String confiraEsteCampo = 'Confira este campo.';
}
