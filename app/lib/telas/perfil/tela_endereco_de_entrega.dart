import 'package:flutter/material.dart';
import 'package:flutter/services.dart';

import '../../api/busca_de_cep.dart';
import '../../api/estados_brasileiros.dart';
import '../../api/falhas.dart';
import '../../api/mensagens_de_erro.dart';
import '../../api/modelos_pet.dart';
import '../../api/problem.dart';
import '../../escopo.dart';
import '../../formato/cep.dart';
import '../../formato/telefone.dart';
import '../../roteamento/saida_da_mensagem.dart';
import '../../theme/bichu_tokens.g.dart';
import '../../widgets/barra_de_acao_fixa.dart';
import '../../widgets/bichu_field.dart';
import '../../widgets/botao_primario.dart';
import '../../widgets/faixa_de_aviso.dart';
import '../../widgets/saida_da_tela.dart';
import '../../widgets/seletor_de_lista.dart';

/// `Perfil` > `Meus dados` > **`Endereço de entrega`**: o lugar — **um só** —
/// onde o endereço guardado na conta é editado.
///
/// ## A decisão, com a data e as palavras dele
///
/// **O cliente decidiu em 21/10/2026**, escolhendo esta opção entre três:
///
///     "Endereço guardado de verdade -- um endereço de entrega salvo na conta,
///      reusado em todo pedido e editável num lugar só."
///
/// O motivo é que a pessoa não redigite nove campos a cada pedido de plaquinha.
/// **Esta tela é o "lugar só"**, e é o único caminho do app que escreve o
/// endereço guardado (`putMyDeliveryAddress`).
///
/// ## O formulário do PEDIDO não escreve aqui, e isso é a decisão dele
///
/// `TelaSolicitarPlaquinha` abre preenchida com este endereço e deixa tudo
/// editável, mas **editar lá não muda o que está guardado**. Palavras do
/// briefing que fecharam isso: *"mudar o guardado sem avisar é a classe de
/// defeito que o cliente mais sente: ele descobre meses depois, quando a
/// plaquinha chega no endereço errado."*
///
/// Das duas saídas que ele autorizou — *"ou pergunta, ou não mexe"* — esta
/// frente ficou com **não mexe**, e a razão é esta tela: com um lugar só para
/// editar, uma segunda porta de escrita dentro do formulário de pedido seria
/// exatamente o "silêncio" que a decisão proíbe.
///
/// ## Por que é TELA, e não um bloco de `Meus dados`
///
/// Medido antes de escrever: `tela_dados_pessoais.dart` tem **1.508 linhas**, e
/// o `Salvar` dela é um ato único sobre UMA rota (`PATCH /v1/me`), com **uma**
/// faixa de erro e **uma** de confirmação. Um endereço guardado é outra rota
/// (`PUT /v1/me/delivery-address`), e um botão que dispara duas chamadas tem
/// quatro desfechos — as duas certas, as duas erradas, e as duas misturas — que
/// aquela tela não tem onde contar.
///
/// Pior: ela já tem `_cep`, `_bairro`, `_cidade`, `_uf`, `_buscaDoCep` e
/// `_cepJaBuscado` para a **região de referência**, e o mapa de erros dela é
/// chaveado por `postal_code`/`city`/`state` — as MESMAS chaves deste
/// formulário. Dois CEPs no mesmo mapa de erro se sobrescrevem em silêncio.
///
/// E há a confusão de domínio, que é a razão mais forte: a região de referência
/// alimenta **cálculo de distância** e o aviso de cadastro incompleto; este é a
/// **residência** da pessoa. Dois blocos "CEP / Bairro / Cidade / Estado" na
/// mesma rolagem é erro de leitura garantido. Mesmo padrão e mesma justificativa
/// de `Minhas fotos`, que também é item de menu e tela própria.
///
/// ## Nenhum componente novo
///
/// [BichuField], [SeletorDeLista], [BotaoPrimario] dentro de
/// [BarraDeAcaoFixa], [FaixaDeAviso]. A máscara de CEP é [MascaraDeCep] e a de
/// telefone é [MascaraDeTelefone] — **esta tela não monta máscara nenhuma**, e a
/// lista dos 27 estados vem de [estadosBrasileiros], que mostra o nome e envia a
/// sigla. Nada aqui escreve a segunda validação de CEP nem a segunda lista de
/// UF.
///
/// ## NÃO HÁ BOTÃO DE APAGAR, e a ausência é deliberada
///
/// Não falta implementar: a decisão do cliente de **17/10/2026** é *"você só
/// deve apagar as informações, caso o usuário remova o pet ou delete a conta"*.
/// O endereço sai com a conta, pelo `ON DELETE CASCADE`; não há prazo, não há
/// expiração e não há varredura. Quem quer trocar de casa usa este formulário.
class TelaEnderecoDeEntrega extends StatefulWidget {
  const TelaEnderecoDeEntrega({super.key});

  @override
  State<TelaEnderecoDeEntrega> createState() => _TelaEnderecoDeEntregaState();
}

class _TelaEnderecoDeEntregaState extends State<TelaEnderecoDeEntrega> {
  final TextEditingController _destinatario = TextEditingController();
  final TextEditingController _cep = TextEditingController();
  final TextEditingController _logradouro = TextEditingController();
  final TextEditingController _numero = TextEditingController();
  final TextEditingController _complemento = TextEditingController();
  final TextEditingController _bairro = TextEditingController();
  final TextEditingController _cidade = TextEditingController();
  final TextEditingController _telefone = TextEditingController();

  String? _uf;

  /// O que a última busca de CEP devolveu. **Nunca desabilita nada**: serve só
  /// para a tela dizer o que aconteceu.
  ResultadoDaBusca? _buscaDoCep;
  bool _buscandoOCep = false;

  /// O CEP que a última busca usou, para não repetir a chamada a cada tecla.
  String _cepJaBuscado = '';

  /// O erro de cada campo, pela mesma chave que o servidor usa em
  /// `errors[].field`. Uma estrutura só para a validação local e para a do
  /// servidor: duas listas de erro divergiriam na mensagem.
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
      _cep,
      _logradouro,
      _numero,
      _complemento,
      _bairro,
      _cidade,
      _telefone,
    ]) {
      c.dispose();
    }
    super.dispose();
  }

  /// Abre com o endereço guardado, se houver.
  ///
  /// **`null` não é erro e não vira faixa.** É o estado normal de quem nunca
  /// guardou endereço: a tela abre vazia, que é exatamente o que ela deve
  /// mostrar nesse caso.
  Future<void> _carregar() async {
    try {
      final guardado = await Escopo.of(context).me.lerEnderecoGuardado();
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
  ///
  /// O CEP entra **mascarado**: o contrato guarda oito dígitos e quem lê é uma
  /// pessoa, não um validador — `01311000` num campo de CEP parece defeito. A
  /// volta é `cepParaOContrato`, que tira o hífen antes de enviar.
  void _preencherCom(EnderecoDeEntrega endereco) {
    _destinatario.text = endereco.destinatario;
    _cep.text = mascaraDeCep(endereco.cep);
    _logradouro.text = endereco.logradouro;
    _numero.text = endereco.numero;
    _complemento.text = endereco.complemento ?? '';
    _bairro.text = endereco.bairro;
    _cidade.text = endereco.cidade;
    // **`telefoneDoE164` e nao `mascaraDeTelefone`**: o endereco guardado vem
    // em E.164, e `mascaraDeTelefone` trataria os digitos do `+55` como parte
    // do numero -- o campo abriria `(55) 11912-3456`. Mesmo cuidado que
    // `tela_dados_pessoais.dart` registra para o telefone do perfil.
    _telefone.text = telefoneDoE164(endereco.telefone);
    _uf = endereco.uf.isEmpty ? null : endereco.uf;
    // O CEP que já está na tela conta como buscado: abrir a tela não deve
    // disparar uma chamada a serviço de terceiro para confirmar um endereço que
    // a própria pessoa escreveu.
    _cepJaBuscado = endereco.cep;
  }

  /// Busca o endereço do CEP e preenche o que estiver VAZIO.
  ///
  /// As três regras são as mesmas da tela de solicitar a plaquinha, e são as do
  /// pedido do cliente de 17/10: só preenche campo vazio (o que a pessoa já
  /// escreveu vence o que a base devolve), tudo continua editável, e **nada
  /// aqui pode impedir o salvamento** — o pior desfecho é uma linha dizendo que
  /// não deu, com os campos abertos para digitar.
  Future<void> _buscarOCep() async {
    final cep = cepParaOContrato(_cep.text);
    if (cep == null || cep == _cepJaBuscado) return;
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
      _preencherSeVazio(_logradouro, endereco.logradouro, _CamposDoEndereco.logradouro);
      _preencherSeVazio(_bairro, endereco.bairro, _CamposDoEndereco.bairro);
      _preencherSeVazio(_cidade, endereco.cidade, _CamposDoEndereco.cidade);
      if (_uf == null && endereco.uf.length == 2) {
        _uf = endereco.uf;
        _erros.remove(_CamposDoEndereco.uf);
      }
    });
  }

  void _preencherSeVazio(TextEditingController campo, String valor, String chave) {
    if (valor.isEmpty || campo.text.trim().isNotEmpty) return;
    campo.text = valor;
    _erros.remove(chave);
  }

  /// Valida **campo por campo**, e devolve os erros todos de uma vez.
  ///
  /// As travas são as do contrato (`DeliveryAddress`) e as do banco, que são as
  /// mesmas — `user_delivery_addresses` repete, caractere por caractere, os
  /// `CHECK` de `collar_tag_requests`, exatamente para que o endereço guardado
  /// não possa produzir um pedido que o banco recusa.
  Map<String, String> _conferir() {
    final erros = <String, String>{};
    if (_destinatario.text.trim().length < 2) {
      erros[_CamposDoEndereco.destinatario] = _TextosDoEndereco.digiteODestinatario;
    }
    if (cepParaOContrato(_cep.text) == null) {
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
      // **Nunca recusa calado.** Cada campo que falta aparece marcado, com o
      // que falta nele.
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
      final guardado = await Escopo.of(context).me.salvarEnderecoGuardado(
        EnderecoDeEntrega(
          destinatario: _destinatario.text.trim(),
          // Sem máscara: o contrato declara oito dígitos.
          cep: cepParaOContrato(_cep.text)!,
          logradouro: _logradouro.text.trim(),
          numero: _numero.text.trim(),
          complemento: _complemento.text.trim(),
          bairro: _bairro.text.trim(),
          cidade: _cidade.text.trim(),
          uf: _uf!,
          // **E.164**, nunca o que está na tela: a máscara é do olho, e
          // `telefoneEmE164` é a única que produz valor de contrato.
          telefone: telefoneEmE164(_telefone.text)!,
        ),
      );
      if (!mounted) return;
      setState(() {
        // O que a tela mostra é **o que ficou guardado**, e não o que foi
        // digitado: o servidor normaliza (CEP sem máscara, UF em maiúscula,
        // bordas sem espaço), e mostrar o enviado faria a tela discordar do
        // banco na próxima abertura.
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
      // **O servidor nomeou os campos, e a tela os marca.** Sem isto, uma
      // recusa de campo viraria faixa genérica e a pessoa teria de adivinhar
      // qual campo o servidor recusou.
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
  ///
  /// Existe para que os oito campos não sejam oito repetições do mesmo bloco:
  /// repetição é onde um `erro:` fica para trás e um campo passa a recusar
  /// calado. Mesma forma de `_campo` na tela de solicitar a plaquinha.
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
        // Digitar é a correção: o erro sai do campo no primeiro toque, e a
        // confirmação de "guardado" também — ela falaria de um estado que a
        // pessoa acabou de mudar.
        aoMudar: (valor) {
          if (_erros.containsKey(chave) || _salvou) {
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

  /// A linha que conta o que a busca de CEP fez. Texto curto, sem parágrafo.
  ///
  /// **Nenhum destes estados é um erro de formulário.** Não marcam campo, não
  /// desabilitam o botão e não impedem o salvamento.
  Widget _linhaDaBusca(TextTheme textos) {
    if (_buscandoOCep) {
      return Text(_TextosDoEndereco.buscandoOCep, style: textos.bodySmall);
    }
    final texto = switch (_buscaDoCep) {
      ResultadoDaBusca.naoEncontrado => _TextosDoEndereco.cepNaoEncontrado,
      ResultadoDaBusca.indisponivel => _TextosDoEndereco.buscaIndisponivel,
      _ => null,
    };
    if (texto == null) return const SizedBox.shrink();
    return Text(texto, style: textos.bodySmall);
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
            // **Nunca desabilitado por estado de rede nem por campo faltando.**
            // Quem recusa é `_conferir`, dizendo QUAL campo falta — botão que
            // recusa sem explicar é o defeito que o cliente apontou três vezes
            // num dia.
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
                      controlador: _cep,
                      // `limiteDoCep` é 9 e não 8: o `maxLength` do campo conta
                      // o HÍFEN, e com 8 o último dígito seria cortado em
                      // silêncio.
                      limite: limiteDoCep,
                      tipoDeTeclado: TextInputType.number,
                      formatadores: const <TextInputFormatter>[MascaraDeCep()],
                      // No oitavo dígito a busca sai sozinha. Sem botão
                      // `Buscar`: não buscar é um desfecho válido, e o
                      // formulário segue digitável.
                      aoMudarTambem: (_) => _buscarOCep(),
                    ),
                    if (_buscandoOCep || _buscaDoCep != null) ...<Widget>[
                      _linhaDaBusca(textos),
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
                    // Os 27, mostrando o nome e enviando a sigla. A lista vem
                    // de `estados_brasileiros.dart`; esta tela não escreve a
                    // segunda.
                    SeletorDeLista(
                      rotulo: _TextosDoEndereco.estado,
                      itens: estadosBrasileiros,
                      selecionado: _uf,
                      erro: _erros[_CamposDoEndereco.uf],
                      habilitado: !_salvando,
                      aoSelecionar: (escolhido) => setState(() {
                        _uf = escolhido;
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
                      // A SAIDA DA MENSAGEM VEM COM ELA, e passar so `texto:`
                      // desfazia metade de uma decisao do cliente.
                      //
                      // Esta tela nasceu numa frente e o portao
                      // `toda_faixa_de_erro_tem_saida_test.dart` nasceu em
                      // OUTRA, na mesma onda: nenhuma das duas via a outra, e
                      // foi a uniao que mostrou a 13a faixa muda. No
                      // `401 unauthenticated` a faixa sem acao e uma tarja
                      // vermelha com o icone e MAIS NADA -- o cliente mandou
                      // tirar o TEXTO em 18/10/2026 e MANTER o botao `Entrar`.
                      //
                      // `saidaDaMensagem` devolve `null` para rotulo de
                      // OPERACAO, e `FaixaDeAviso` so desenha o botao com
                      // rotulo E callback: rotulo de operacao nao vira botao
                      // morto.
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
///
/// A da esquerda é a do formulário; a da direita é a que o servidor manda em
/// `errors[].field` quando recusa. **São as MESMAS chaves de
/// `_CamposDoPedido`** na tela de solicitar a plaquinha, e isso não é
/// coincidência: é o mesmo `DeliveryAddress` do contrato. Elas não são
/// importadas de lá porque aquela classe é privada do arquivo dela, e tornar
/// pública uma classe de chaves de formulário para economizar nove linhas
/// acoplaria duas telas pela parte menos interessante das duas.
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
  ///
  /// Casa pelo FIM da cadeia porque o Ajv devolve o caminho inteiro
  /// (`/postal_code`, `postal_code`), e o formato exato varia com a versão do
  /// validador. **A interpolação é `\$chave` e não `\$chave`**: `\$` numa
  /// cadeia Dart é um dólar LITERAL, então `'/\$chave'` compara com o texto
  /// `/\$chave` e nunca casa com nada. É o defeito que a versão desta função na
  /// tela da plaquinha carrega hoje (`_CamposDoPedido.doServidor`), e por isso
  /// esta aqui não foi copiada de lá: foi escrita certa.
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

  /// **Diz para que serve, e diz o que NÃO acontece.** A segunda metade é a
  /// que importa: sem ela, a pessoa não tem como saber que mexer no endereço
  /// dentro de um pedido não mexe neste — e descobrir isso pela plaquinha que
  /// chegou no lugar errado é o desfecho que a decisão do cliente evita.
  static const String paraQueServe =
      'Guardado aqui, ele vem preenchido quando você pedir uma plaquinha. '
      'Você pode mudar o endereço na hora do pedido sem alterar este.';

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

  /// Os três desfechos da busca de CEP. **Nenhum é um erro.**
  static const String buscandoOCep = 'Buscando o endereço…';
  static const String cepNaoEncontrado = 'CEP não encontrado. Preencha abaixo.';
  static const String buscaIndisponivel = 'Não deu para buscar. Preencha abaixo.';
  static const String confiraOsCampos = 'Confira os campos marcados.';
  static const String confiraEsteCampo = 'Confira este campo.';
}
