import 'package:flutter/material.dart';
import 'package:go_router/go_router.dart';

import '../../api/falhas.dart';
import '../../api/mensagens_de_erro.dart';
import '../../api/modelos_pet.dart';
import '../../api/problem.dart';
import '../../escopo.dart';
import '../../roteamento/rotas.dart';
import '../../theme/bichu_tokens.g.dart';
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
/// ## O que NAO tem campo, e a ausencia e deliberada
///
/// **Nao ha endereco de entrega e nao ha pagamento.** A plaquinha e objeto
/// fisico, e as duas perguntas -- se precisa de endereco e se tem custo -- sao
/// decisao de produto do cliente e nao foram tomadas. Um campo de endereco
/// inventado aqui seria dado pessoal coletado para um fluxo que ninguem
/// desenhou, e um fluxo de pagamento esta fora de escopo por decisao dele.
class TelaSolicitarPlaquinha extends StatefulWidget {
  const TelaSolicitarPlaquinha({super.key, this.petIdInicial});

  /// O pet que vem pre-selecionado, quando a tela e alcancada de dentro do
  /// produto. Nulo em link direto, e ai a escolha fica com a pessoa.
  final String? petIdInicial;

  @override
  State<TelaSolicitarPlaquinha> createState() => _TelaSolicitarPlaquinhaState();
}

class _TelaSolicitarPlaquinhaState extends State<TelaSolicitarPlaquinha> {
  final TextEditingController _observacao = TextEditingController();

  List<Pet>? _pets;
  String? _petEscolhido;
  String? _erroDoPet;
  bool _carregando = true;
  bool _enviando = false;
  bool _enviado = false;
  MensagemDeErro? _faixa;

  @override
  void initState() {
    super.initState();
    _petEscolhido = widget.petIdInicial;
    _carregarPets();
  }

  @override
  void dispose() {
    _observacao.dispose();
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

  Future<void> _pedir() async {
    final pet = _petEscolhido;
    if (pet == null) {
      setState(() => _erroDoPet = _TextosDaPlaquinha.escolhaOPet);
      return;
    }

    setState(() {
      _erroDoPet = null;
      _faixa = null;
      _enviando = true;
    });

    try {
      await Escopo.of(context).pets.solicitarPlaquinha(
        petId: pet,
        observacao: _observacao.text.trim(),
      );
      if (!mounted) return;
      // O desfecho fica NESTA tela, e nao numa tela de sucesso: um `go` para
      // um destino de sucesso alcancavel por link direto afirmaria um desfecho
      // que ninguem produziu, que e o defeito que o criterio 2 da BICHUS-31
      // proibe.
      setState(() => _enviado = true);
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
          BotaoPrimario(
            rotulo: _TextosDaPlaquinha.pedir,
            critico: true,
            carregando: _enviando,
            // Desabilitado so quando nao ha o que pedir: sem pet cadastrado, e
            // depois de o pedido ter sido feito. Nunca por estado de rede.
            aoTocar: _enviado || semPets ? null : _pedir,
          ),
          if (_enviado)
            TextButton(
              onPressed: () => context.go(Rotas.perfil),
              child: const Text(_TextosDaPlaquinha.fechar),
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
                    if (_enviado)
                      const FaixaDeAviso(
                        peso: PesoDaFaixa.informativo,
                        texto: _TextosDaPlaquinha.pedidoEnviado,
                      )
                    else if (semPets)
                      Text(_TextosDaPlaquinha.semPets, style: textos.bodyLarge)
                    else ...<Widget>[
                      SeletorDeLista(
                        rotulo: _TextosDaPlaquinha.pet,
                        itens: _itensDosPets,
                        selecionado: _petEscolhido,
                        erro: _erroDoPet,
                        habilitado: !_enviando,
                        aoSelecionar: (escolhido) => setState(() {
                          _petEscolhido = escolhido;
                          _erroDoPet = null;
                        }),
                      ),
                      const SizedBox(height: BichuEspaco.e6),
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
                      FaixaDeAviso(texto: _faixa!.texto),
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
abstract final class _TextosDaPlaquinha {
  static const String titulo = 'Plaquinha da coleira';
  static const String pet = 'Pet';
  static const String observacao = 'Observação';
  static const String exemploDaObservacao = 'nome gravado, cor da plaquinha';

  /// O mesmo 500 do contrato (`CollarTagRequestInput.notes`).
  static const int limiteDaObservacao = 500;

  static const String pedir = 'Pedir a plaquinha';
  static const String fechar = 'Fechar';

  static const String escolhaOPet = 'Escolha o pet.';
  static const String pedidoEnviado = 'Pedido enviado.';
  static const String semPets = 'Cadastre um pet para pedir a plaquinha.';
  static const String petNaoEncontrado = 'Este pet não está na sua conta.';
  static const String tetoAtingido = 'Você já fez três pedidos hoje. Tente amanhã.';
}
