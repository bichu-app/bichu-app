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
///
/// ## O destino que o botao nunca teve
///
/// `Fazer a tag da coleira`, em [TelaPetCadastrado], nasceu com `aoTocar:
/// null`. **Ele nao estava quebrado: ele nao tinha para onde ir.** Nao havia
/// rota no contrato, nao havia tabela e nao havia estado para "o tutor pediu a
/// plaquinha", e o criterio 2 da BICHUS-62 proibe renderizar acao sem destino
/// -- nem habilitada nem desabilitada. Esta tela e o destino.
///
/// ## Solicitar nao e emitir
///
/// `issuePetTag` cria o CODIGO, irreversivel (ADR-0004). Quem chega aqui **ja
/// tem o codigo**: [TelaPetCadastrado] emite a tag antes de oferecer o botao.
/// O que esta tela pede e o PLASTICO, e por isso ela nao mostra, nao copia e
/// nao emite codigo nenhum.
///
/// ## Nenhum componente novo
///
/// Tres componentes que ja existiam: [SeletorDeLista] para o pet,
/// [BichuField] para a observacao e [BotaoPrimario] dentro de
/// [BarraDeAcaoFixa]. Nada aqui inventa widget, e e por isso que esta tela
/// pode nascer em codigo em vez de esperar o desenho.
///
/// ## O endereco de entrega
///
/// O cliente decidiu em 17/10 que **o endereco entra e e obrigatorio**: sem
/// ele a administracao nao cumpre o pedido.
///
/// - **O CEP preenche rua, bairro, cidade e estado** (decisao do cliente,
///   17/10), pelo ViaCEP com BrasilAPI de reserva. **Isso nao e
///   geocodificacao**: vem TEXTO, nunca coordenada, e a ADR-0006 proibe a
///   coordenada e nao o texto -- o raciocinio inteiro esta em
///   `api/busca_de_cep.dart`, do lado da chamada.
/// - **Tudo continua editavel, e a busca nunca trava o pedido.** Base de CEP
///   erra, CEP de rua longa nao traz numero, e servico de terceiro cai: em
///   qualquer um desses a pessoa preenche a mao e o pedido vai. O botao nunca
///   e desabilitado por causa da busca.
/// - **Sai so o CEP.** Nem nome, nem conta, nem pet, nem token.
/// - **A lista dos 27 estados vem de [estadosBrasileiros]**, que mostra o nome
///   e envia a sigla. Esta tela nao escreve a segunda lista.
/// - **`Complemento` e o unico opcional.** Os demais sao exigidos, e a recusa
///   diz **qual** campo falta, no proprio campo -- botao que recusa sem
///   explicar e o defeito que o cliente apontou tres vezes num dia.
/// - **Nao ha pagamento.** Cobranca segue fora de escopo por decisao dele.
class TelaSolicitarPlaquinha extends StatefulWidget {
  const TelaSolicitarPlaquinha({super.key, this.petIdInicial});

  /// O pet que vem pre-selecionado, quando a tela e alcancada de dentro do
  /// produto. Nulo em link direto, e ai a escolha fica com a pessoa.
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

  /// O que a ultima busca de CEP devolveu. **Nunca desabilita nada**: serve
  /// so para a tela dizer o que aconteceu.
  ResultadoDaBusca? _buscaDoCep;
  bool _buscandoOCep = false;

  /// O CEP que a ultima busca usou, para nao repetir a chamada a cada tecla.
  String _cepJaBuscado = '';

  List<Pet>? _pets;
  String? _petEscolhido;
  String? _uf;

  /// O erro de cada campo, pela mesma chave que o servidor usa em
  /// `errors[].field`. Uma so estrutura para a validacao local e para a do
  /// servidor: duas listas de erro divergiriam na mensagem.
  final Map<String, String> _erros = <String, String>{};
  bool _carregando = true;
  bool _enviando = false;
  bool _enviado = false;

  /// O pedido **como o servidor o devolveu**, e nao um objeto montado aqui.
  ///
  /// E dele que sai o numero que a tela mostra: um identificador gerado no app
  /// nao serviria para nada, porque ninguem do outro lado saberia procura-lo.
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
        // Pre-selecao que nao confere nada seria uma escolha falsa: se o
        // `extra` apontar para pet que nao esta mais na lista, a tela abre sem
        // pet escolhido em vez de mostrar um pet que o tutor nao tem.
        if (!pets.any((pet) => pet.id == _petEscolhido)) _petEscolhido = null;
        // O nome da conta nao pre-preenche o destinatario: quem pede pode
        // estar mandando para a casa de outra pessoa, e um campo pre-enchido
        // com o nome errado e pior que um campo vazio.
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

  /// Busca o endereco do CEP e preenche o que estiver VAZIO.
  ///
  /// Tres decisoes, e as tres sao do pedido do cliente:
  ///
  /// 1. **so preenche campo vazio.** O que a pessoa ja escreveu vence o que a
  ///    base devolve -- ela esta olhando o endereco dela, e a base erra;
  /// 2. **tudo continua editavel.** Nao ha campo bloqueado depois da busca:
  ///    CEP de rua longa nao traz numero, e CEP generico de cidade nao traz
  ///    rua;
  /// 3. **nada aqui pode impedir o pedido.** Nenhum caminho desta funcao
  ///    desabilita o botao, marca erro de campo ou lanca. O pior desfecho e
  ///    uma linha dizendo que nao deu, com os campos abertos para digitar.
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

      // Campo vazio recebe; campo escrito fica. E os erros dos campos que
      // acabaram de ser preenchidos saem junto -- deixar "Digite a rua."
      // embaixo de uma rua preenchida seria a tela discutindo consigo mesma.
      _preencherSeVazio(_logradouro, endereco.logradouro, _CamposDoPedido.logradouro);
      _preencherSeVazio(_bairro, endereco.bairro, _CamposDoPedido.bairro);
      _preencherSeVazio(_cidade, endereco.cidade, _CamposDoPedido.cidade);
      if (_uf == null && endereco.uf.length == 2) {
        _uf = endereco.uf;
        _erros.remove(_CamposDoPedido.uf);
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
  /// De uma vez, e nao o primeiro: recusar um campo por vez faz a pessoa
  /// descobrir o formulario aos tropecos. O mapa e o mesmo que o servidor
  /// preenche quando responde `validation-failed`.
  Map<String, String> _conferir() {
    final erros = <String, String>{};
    if (_petEscolhido == null) {
      erros[_CamposDoPedido.pet] = _TextosDaPlaquinha.escolhaOPet;
    }
    if (_destinatario.text.trim().length < 2) {
      erros[_CamposDoPedido.destinatario] = _TextosDaPlaquinha.digiteODestinatario;
    }
    // Oito digitos, o mesmo `^[0-9]{8}$` do contrato. O campo so aceita
    // digito, entao o unico jeito de errar aqui e a quantidade.
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
    // OBRIGATORIO: transportadora costuma exigir telefone para entregar, e foi
    // por isso que ele entrou. `telefoneEmE164` e quem decide, e ela recusa
    // devolvendo nulo em vez de adivinhar.
    if (telefoneEmE164(_telefone.text) == null) {
      erros[_CamposDoPedido.telefone] = _TextosDaPlaquinha.telefoneIncompleto;
    }
    return erros;
  }

  static String _soDigitos(String bruto) => bruto.replaceAll(RegExp(r'\D'), '');

  Future<void> _pedir() async {
    final erros = _conferir();
    if (erros.isNotEmpty) {
      // **Nunca recusa calado.** Cada campo que falta aparece marcado, com o
      // que falta nele, e a tela rola ate o primeiro.
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

    try {
      final pedido = await Escopo.of(context).pets.solicitarPlaquinha(
        petId: pet,
        endereco: EnderecoDeEntrega(
          destinatario: _destinatario.text.trim(),
          // Sem mascara: o contrato declara oito digitos.
          cep: _soDigitos(_cep.text),
          logradouro: _logradouro.text.trim(),
          numero: _numero.text.trim(),
          complemento: _complemento.text.trim(),
          bairro: _bairro.text.trim(),
          cidade: _cidade.text.trim(),
          uf: _uf!,
          // **E.164**, nunca o que esta na tela: a mascara e do olho, e
          // `telefoneEmE164` e a unica que produz valor de contrato.
          telefone: telefoneEmE164(_telefone.text)!,
        ),
        observacao: _observacao.text.trim(),
      );
      if (!mounted) return;
      // O desfecho fica NESTA tela, e nao numa tela de sucesso: um `go` para
      // um destino de sucesso alcancavel por link direto afirmaria um desfecho
      // que ninguem produziu, que e o defeito que o criterio 2 da BICHUS-31
      // proibe.
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
  ///
  /// `naoEncontrado` aqui nao e "pet inexistente": e a autorizacao na clausula
  /// `WHERE` do servidor respondendo que o pet nao e desta conta (ADR-0021). A
  /// tela diz a mesma coisa nos dois casos, porque para quem pede os dois sao
  /// a mesma coisa.
  MensagemDeErro _mensagem(FalhaDeChamada falha) {
    if (falha is FalhaDaApi &&
        falha.problem.tipo == ProblemTipo.validacaoFalhou &&
        falha.problem.campos.isNotEmpty) {
      // **O servidor nomeou os campos, e a tela os marca.** Sem isto, uma
      // recusa de campo viraria faixa generica e a pessoa teria de adivinhar
      // qual campo o servidor recusou -- o mesmo defeito do botao mudo, um
      // passo adiante.
      final doServidor = <String, String>{};
      for (final campo in falha.problem.campos) {
        final chave = _CamposDoPedido.doServidor(campo.campo);
        // `message` e opcional no contrato. Sem ela, o campo ainda e MARCADO,
        // com o texto proprio da tela: marcar sem dizer nada ainda diz qual
        // campo olhar, e nao marcar nao diz nada.
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
      // O teto e de tres por dia, e ele e o numero do contrato. O texto nao
      // repete o `Retry-After`: a janela e de 24 h e "tente amanha" e o que
      // dela se pode dizer sem mentir sobre o minuto.
      return const MensagemDeErro(texto: _TextosDaPlaquinha.tetoAtingido);
    }
    return MensagensDeErro.de(falha);
  }

  /// Um campo do endereco, com o espacamento e o erro no mesmo lugar.
  ///
  /// Existe para que os sete campos nao sejam sete repeticoes do mesmo bloco:
  /// repeticao e onde um `erro:` fica para tras e um campo passa a recusar
  /// calado.
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
        habilitado: !_enviando,
        exemplo: exemplo,
        tipoDeTeclado: tipoDeTeclado,
        capitalizacao: capitalizacao,
        formatadores: formatadores,
        // Digitar e a correcao: o erro sai do campo no primeiro toque, e nao
        // so quando a pessoa tenta enviar de novo.
        aoMudar: (valor) {
          if (_erros.containsKey(chave)) {
            setState(() => _erros.remove(chave));
          }
          aoMudarTambem?.call(valor);
        },
      ),
    );
  }

  /// A linha que conta o que a busca de CEP fez. Texto curto, sem paragrafo.
  ///
  /// **Nenhum destes estados e um erro de formulario.** Nao marcam campo, nao
  /// desabilitam o botao e nao impedem o envio: o pior deles quer dizer
  /// "digite voce mesmo", e os campos estao abertos para isso.
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
      // **DEPOIS DE ENVIADO, `Pedir a plaquinha` NAO EXISTE MAIS NA TELA**
      // (cliente, 18/10: "tem um botao em baixo que nao faz sentido 'pedir
      // plaquinha', ja foi pedido").
      //
      // Ele ficava ali DESABILITADO, e desabilitado nao bastava: o criterio 2
      // da BICHUS-62 proibe renderizar acao sem destino **nem habilitada nem
      // desabilitada**, e depois do pedido feito esta acao nao tem destino
      // nenhum. Some, e sobra uma saida so.
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
              // Desabilitado so quando nao ha o que pedir: sem pet cadastrado.
              // Nunca por estado de rede.
              aoTocar: semPets ? null : _pedir,
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
                    // O DESFECHO: o acompanhamento do pedido, e nao uma
                    // faixa dizendo "pedido enviado".
                    //
                    // **Continua NESTA tela, e nao num destino proprio**: um
                    // `go` para uma tela de sucesso alcancavel por link direto
                    // afirmaria um desfecho que ninguem produziu (criterio 2
                    // da BICHUS-31). O MESMO widget desenha a pagina de
                    // acompanhamento alcancavel pela pagina do pet, que ai sim
                    // tem rota propria porque LE o pedido do servidor.
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
                        aoSelecionar: (escolhido) => setState(() {
                          _petEscolhido = escolhido;
                          _erros.remove(_CamposDoPedido.pet);
                        }),
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
                        capitalizacao: TextCapitalization.words,
                      ),
                      _campo(
                        chave: _CamposDoPedido.cep,
                        rotulo: _TextosDaPlaquinha.cep,
                        controlador: _cep,
                        limite: limiteDoCep,
                        tipoDeTeclado: TextInputType.number,
                        // **A mascara, e nao `digitsOnly`** (cliente, 18/10:
                        // "coloque mascara no campo cep de todos os
                        // formularios"). Ela ja descarta o que nao e digito,
                        // entao `digitsOnly` ao lado seria a segunda regra
                        // sobre a mesma tecla. `limite` e 9 e nao 8: o
                        // `maxLength` do campo conta o HIFEN, e com 8 o
                        // ultimo digito do CEP seria cortado em silencio.
                        formatadores: const <TextInputFormatter>[
                          MascaraDeCep(),
                        ],
                        // No oitavo digito a busca sai sozinha. Sem botao
                        // `Buscar`: um botao a mais e um passo a mais para
                        // quem so quer o endereco preenchido, e nao buscar e
                        // um desfecho valido -- o formulario segue digitavel.
                        aoMudarTambem: (_) => _buscarOCep(),
                      ),
                      // O que a busca disse, e **so isso**: ela nao marca
                      // erro de campo e nao desabilita nada.
                      if (_buscandoOCep || _buscaDoCep != null) ...<Widget>[
                        _linhaDaBusca(textos),
                        const SizedBox(height: BichuEspaco.e4),
                      ],
                      _campo(
                        chave: _CamposDoPedido.logradouro,
                        rotulo: _TextosDaPlaquinha.logradouro,
                        controlador: _logradouro,
                        limite: 120,
                        capitalizacao: TextCapitalization.words,
                      ),
                      _campo(
                        chave: _CamposDoPedido.numero,
                        rotulo: _TextosDaPlaquinha.numero,
                        controlador: _numero,
                        limite: 20,
                        exemplo: _TextosDaPlaquinha.exemploDoNumero,
                      ),
                      _campo(
                        chave: _CamposDoPedido.complemento,
                        rotulo: _TextosDaPlaquinha.complemento,
                        controlador: _complemento,
                        limite: 80,
                        opcional: true,
                      ),
                      _campo(
                        chave: _CamposDoPedido.bairro,
                        rotulo: _TextosDaPlaquinha.bairro,
                        controlador: _bairro,
                        limite: 80,
                        capitalizacao: TextCapitalization.words,
                      ),
                      _campo(
                        chave: _CamposDoPedido.cidade,
                        rotulo: _TextosDaPlaquinha.cidade,
                        controlador: _cidade,
                        limite: 80,
                        capitalizacao: TextCapitalization.words,
                      ),
                      // Os 27, mostrando o nome e enviando a sigla. A lista
                      // vem de `estados_brasileiros.dart`; esta tela nao
                      // escreve a segunda.
                      SeletorDeLista(
                        rotulo: _TextosDaPlaquinha.estado,
                        itens: estadosBrasileiros,
                        selecionado: _uf,
                        erro: _erros[_CamposDoPedido.uf],
                        habilitado: !_enviando,
                        aoSelecionar: (escolhido) => setState(() {
                          _uf = escolhido;
                          _erros.remove(_CamposDoPedido.uf);
                        }),
                      ),
                      const SizedBox(height: BichuEspaco.e4),
                      _campo(
                        chave: _CamposDoPedido.telefone,
                        rotulo: _TextosDaPlaquinha.telefone,
                        controlador: _telefone,
                        limite: limiteDoTelefone,
                        tipoDeTeclado: TextInputType.phone,
                        exemplo: _TextosDaPlaquinha.exemploDoTelefone,
                        // Mostra formatado; `telefoneEmE164` e quem envia.
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
    );
  }
}

/// Os textos da tela.
///
/// **Curtos de proposito.** Nao ha paragrafo explicativo, nao ha promessa de
/// prazo e nao ha aviso sobre entrega: prazo e entrega dependem de decisao de
/// produto que nao foi tomada, e prometer aqui o que ninguem decidiu e pior
/// que calar.
/// As chaves de campo, iguais dos dois lados.
///
/// A da esquerda e a do formulario; a da direita e a que o servidor manda em
/// `errors[].field` quando recusa (`delivery_address/postal_code`, no formato
/// de ponteiro do Ajv). Uma funcao de traducao, e nao dois mapas: dois mapas
/// divergem no dia em que alguem acrescenta campo so num deles.
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
  ///
  /// Casa pelo FIM da cadeia porque o Ajv devolve o caminho inteiro
  /// (`delivery_address/postal_code`, `/delivery_address/state`), e o formato
  /// exato varia com a versao do validador.
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
  /// entao oferecer a cor como exemplo de observacao convidava a pessoa a
  /// pedir uma coisa que nao existe -- e quem atendesse o pedido teria de
  /// recusar depois. Nao havia CAMPO de cor em lugar nenhum desta tela: a cor
  /// so aparecia nesta linha de exemplo, e e so ela que sai.
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

  /// Os tres desfechos da busca de CEP. **Nenhum e um erro**: os tres querem
  /// dizer a mesma coisa para quem preenche -- os campos estao abertos.
  static const String buscandoOCep = 'Buscando o endereço…';
  static const String cepNaoEncontrado = 'CEP não encontrado. Preencha abaixo.';
  static const String buscaIndisponivel = 'Não deu para buscar. Preencha abaixo.';
  static const String confiraOsCampos = 'Confira os campos marcados.';
  static const String confiraEsteCampo = 'Confira este campo.';
  static const String semPets = 'Cadastre um pet para pedir a plaquinha.';
  static const String petNaoEncontrado = 'Este pet não está na sua conta.';
  static const String tetoAtingido = 'Você já fez três pedidos hoje. Tente amanhã.';
}
