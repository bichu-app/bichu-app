import 'package:flutter/material.dart';
import 'package:go_router/go_router.dart';

import '../../api/api_client.dart';
import '../../api/falhas.dart';
import '../../api/mensagens_de_erro.dart';
import '../../api/modelos_pet.dart';
import '../../api/problem.dart';
import '../../escopo.dart';
import '../../roteamento/rotas.dart';
import '../../theme/bichu_colors.dart';
import '../../theme/bichu_tokens.g.dart';
import '../../widgets/barra_de_acao_fixa.dart';
import '../../widgets/bichu_field.dart';
import '../../widgets/botao_primario.dart';
import '../../widgets/faixa_de_aviso.dart';
import '../../widgets/saida_da_tela.dart';
import '../../widgets/seletor_de_lista.dart';
import 'rascunho_de_pet.dart';
import 'resultado_do_cadastro.dart';
import 'textos_do_cadastro.dart';

/// F1.5 — Cadastrar pet: sinais. Figma `91:51`.
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
class TelaCadastrarSinais extends StatefulWidget {
  const TelaCadastrarSinais({required this.rascunho, super.key});

  final RascunhoDePet rascunho;

  @override
  State<TelaCadastrarSinais> createState() => _TelaCadastrarSinaisState();
}

class _TelaCadastrarSinaisState extends State<TelaCadastrarSinais> {
  late final TextEditingController _sinais =
      TextEditingController(text: widget.rascunho.sinaisParticulares);
  late final TextEditingController _cuidados =
      TextEditingController(text: widget.rascunho.cuidados);

  /// **A chave nasce com a tela, e nao com o toque.** Um reenvio depois de
  /// `FalhaDeTempo` precisa levar a chave da PRIMEIRA tentativa: gerar uma
  /// nova a cada toque derruba a garantia inteira e o tutor termina com dois
  /// cadastros do mesmo animal.
  final String _chaveDeIdempotencia = ApiClient.novaChaveDeIdempotencia();

  DadosDeReferencia? _referencia;
  bool _enviando = false;
  MensagemDeErro? _faixa;

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
    try {
      final dados = await Escopo.of(context).pets.dadosDeReferencia();
      if (!mounted) return;
      setState(() => _referencia = dados);
    } on FalhaDeChamada {
      // Mesma saida de F1.3: cor e opcional no contrato, e cadastrar sem ela e
      // escolher depois em `Editar` e melhor que travar o cadastro. O que nao
      // acontece e o campo virar texto livre como plano B.
      if (mounted) setState(() => _referencia = null);
    }
  }

  List<ItemDeLista> get _cores {
    final referencia = _referencia;
    if (referencia == null) return const <ItemDeLista>[];
    return <ItemDeLista>[
      for (final cor in referencia.cores)
        ItemDeLista(codigo: cor.codigo, rotulo: cor.rotulo),
    ];
  }

  Future<void> _cadastrar() async {
    final rascunho = widget.rascunho;
    setState(() {
      _faixa = null;
      _enviando = true;
    });

    rascunho.atualizar(() {
      rascunho.sinaisParticulares = _sinais.text.trim();
      rascunho.cuidados = _cuidados.text.trim();
    });

    try {
      final pet = await Escopo.of(context).pets.cadastrarPet(
            nome: rascunho.nome,
            especie: rascunho.especie!,
            porte: rascunho.porte!,
            idempotencyKey: _chaveDeIdempotencia,
            breedCode: rascunho.breedCode,
            breedFreeText: rascunho.breedFreeTextParaEnvio,
            refDataVersion: rascunho.refDataVersion,
            corPrincipalCodigo: rascunho.corPrincipalCodigo,
            segundaCorCodigo: rascunho.segundaCorCodigo,
            sexo: rascunho.sexo,
            sinaisParticulares: rascunho.sinaisParticulares,
            cuidados: rascunho.cuidados,
          );
      if (!mounted) return;
      // O pet existe. A emissao da tag e da tela seguinte, e o cadastro **nao**
      // e revertido se ela falhar: F1.6 diz isso na primeira frase.
      context.pushReplacement(
        Rotas.petCadastrado,
        extra: ResultadoDoCadastro(pet: pet, fotoPendente: rascunho.foto),
      );
    } on FalhaDeChamada catch (falha) {
      if (!mounted) return;
      setState(() => _faixa = _mensagem(falha));
    } finally {
      if (mounted) setState(() => _enviando = false);
    }
  }

  /// **A decisao e por `type`, nunca por status.**
  ///
  /// `validation-failed` nao e generico nunca: o erro e do campo que o
  /// servidor nomeou, com a mensagem daquele campo. Se o servidor nao nomear
  /// campo nenhum, e defeito nosso, e a tela diz isso sem acusar um campo que
  /// ninguem apontou.
  MensagemDeErro _mensagem(FalhaDeChamada falha) {
    if (falha is FalhaDeConexao) {
      // O cadastro e acao que o produto consegue guardar: a fila local e de
      // outra historia, mas a promessa da tela ja e a certa.
      return const MensagemDeErro(
        texto: MensagensDeErro.semConexaoEnfileirada,
      );
    }
    if (falha is FalhaDaApi &&
        falha.problem.tipo == ProblemTipo.validacaoFalhou) {
      final primeiro = falha.problem.campos.isEmpty
          ? null
          : falha.problem.campos.first.mensagem;
      return MensagemDeErro(
        texto: primeiro ?? MensagensDeErro.naoConseguimosSalvar,
      );
    }
    return MensagensDeErro.de(falha, podeEnfileirar: true);
  }

  @override
  Widget build(BuildContext context) {
    final rascunho = widget.rascunho;
    final nome = rascunho.nome;
    final listaCarregou = _referencia != null;

    return Scaffold(
      appBar: const BarraDeConta(
        titulo: 'Cadastrar pet',
        saida: TipoDeSaida.voltar,
      ),
      bottomNavigationBar: BarraDeAcaoFixa(
        acoes: <Widget>[
          BotaoPrimario(
            rotulo: TextosDoCadastro.cadastrar,
            critico: true,
            carregando: _enviando,
            aoTocar: _cadastrar,
          ),
        ],
      ),
      body: SafeArea(
        child: ListView(
          padding: const EdgeInsets.all(BichuEspaco.e4),
          children: <Widget>[
            IndicadorDePasso(
              passo: 3,
              total: 3,
              titulo: TextosDoCadastro.tituloDosSinais(nome),
            ),
            const SizedBox(height: BichuEspaco.e6),
            SeletorDeLista(
              rotulo: TextosDoCadastro.rotuloDaCorPrincipal,
              estadoInicial: TextosDoCadastro.escolherNaLista,
              itens: _cores,
              habilitado: listaCarregou,
              selecionado: rascunho.corPrincipalCodigo,
              // `setState` junto do `atualizar`: o rascunho notifica quem o
              // escuta, e esta tela **nao** o escuta -- ela le o valor direto.
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
            if (_faixa != null) ...<Widget>[
              const SizedBox(height: BichuEspaco.e6),
              FaixaDeAviso(
                texto: _faixa!.texto,
                rotuloDaAcao: _faixa!.acao,
                aoTocarNaAcao: _faixa!.acao == null ? null : _cadastrar,
              ),
            ],
          ],
        ),
      ),
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
