import 'package:flutter/material.dart';
import 'package:go_router/go_router.dart';

import '../../api/api_client.dart';
import '../../api/falhas.dart';
import '../../api/mensagens_de_erro.dart';
import '../../api/problem.dart';
import '../../escopo.dart';
import '../../intencao/cadastro_de_pet_como_intencao.dart';
import '../../roteamento/rotas.dart';
import '../../theme/bichu_tokens.g.dart';
import '../../widgets/barra_de_acao_fixa.dart';
import '../../widgets/botao_primario.dart';
import '../../widgets/faixa_de_aviso.dart';
import '../../widgets/saida_da_tela.dart';
import 'campos_do_pet.dart';
import 'rascunho_de_pet.dart';
import 'resultado_do_cadastro.dart';
import 'textos_do_cadastro.dart';

/// F1.5 — Cadastrar pet: sinais. Figma `91:51`.
///
/// **A tela nao guarda mais os campos: ela os hospeda.** Os campos vivem em
/// [CamposDeSinais] (`campos_do_pet.dart`), pelo mesmo motivo de F1.3: a tela
/// de EDICAO da BICHUS-61 mexe nos mesmos atributos do mesmo animal, e duas
/// formas diferentes de editar os mesmos campos e defeito, nao escolha.
///
/// O que continua sendo desta tela e o que so ela sabe: o passo do assistente,
/// a chave de idempotencia, a criacao do pet e a captura da intencao quando a
/// sessao cai no meio.
///
/// A regra dos campos -- a cor como lista fechada de duas posicoes, o aviso de
/// `care_notes` lido antes da digitacao -- esta escrita junto dos campos, e
/// nao aqui. Se ela estivesse aqui, a tela de edicao precisaria de uma copia,
/// e e a copia que diverge.
class TelaCadastrarSinais extends StatefulWidget {
  const TelaCadastrarSinais({
    required this.rascunho,
    super.key,
    this.erroInicial,
  });

  final RascunhoDePet rascunho;

  /// A faixa que a tela ja abre mostrando.
  ///
  /// Existe por causa da regra 4 de UX 8.3: quando a acao guardada e executada
  /// depois do login e o servidor recusa, a pessoa volta para **esta** tela
  /// com o rascunho carregado **e o erro explicado**. E estado de chegada, e
  /// nao resposta a um toque -- por isso ele ja esta na tela antes do primeiro
  /// toque, como a faixa de sessao expirada de C.2.
  final MensagemDeErro? erroInicial;

  @override
  State<TelaCadastrarSinais> createState() => _TelaCadastrarSinaisState();
}

class _TelaCadastrarSinaisState extends State<TelaCadastrarSinais> {
  /// A porta para [CamposDeSinaisState.validar]: a tela grava os campos
  /// **pelo metodo deles** antes de cadastrar, e nao por uma segunda copia dos
  /// controladores escrita aqui.
  final GlobalKey<CamposDeSinaisState> _campos =
      GlobalKey<CamposDeSinaisState>();

  /// **A chave nasce com a tela, e nao com o toque.** Um reenvio depois de
  /// `FalhaDeTempo` precisa levar a chave da PRIMEIRA tentativa: gerar uma
  /// nova a cada toque derruba a garantia inteira e o tutor termina com dois
  /// cadastros do mesmo animal.
  final String _chaveDeIdempotencia = ApiClient.novaChaveDeIdempotencia();

  bool _enviando = false;
  late MensagemDeErro? _faixa = widget.erroInicial;

  Future<void> _cadastrar() async {
    final rascunho = widget.rascunho;

    // **Grava os campos ANTES de qualquer outra coisa, e desiste se eles
    // recusarem.** Os controladores moram em [CamposDeSinais]; sem esta
    // chamada o cadastro sairia com o que o rascunho tinha antes da digitacao.
    if (_campos.currentState?.validar() != true) return;

    setState(() {
      _faixa = null;
      _enviando = true;
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

      // **A SESSÃO CAIU NO MEIO DA AÇÃO** (critério 6 de BICHUS-15).
      //
      // É o caso da tutora que não abre o app há quatro meses: o refresh dela
      // venceu, e ela descobre isso só agora, com o cadastro inteiro
      // preenchido. Sem isto ela veria "entre de novo", perderia os três
      // passos, e refaria tudo — ou desistiria, que é o desfecho mais provável
      // de quem já estava com pressa.
      //
      // O envelope guarda o rascunho INTEIRO (campos, foto por caminho de
      // arquivo, passo e rolagem) e a guarda executa o cadastro assim que o
      // login terminar. Ela cai em F1.6 com o pet criado, e não no formulário
      // de novo — a diferença que a seção 8.3 do UX chama de meia-entrega.
      if (falha is FalhaDaApi && _sessaoAcabou(falha)) {
        await Escopo.of(context).guarda.guardar(
              intencaoDeCadastrarPet(
                rascunho,
                // A hora real, e não uma injetada: a validade de 24 h do
                // envelope é sobre o relógio do aparelho, que é o único que
                // existe quando o app está sem sessão.
                criadaEm: DateTime.now(),
                passo: 3,
              ),
            );
        if (!mounted) return;
        context.push(Rotas.entrar);
        return;
      }

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
  /// A sessão acabou, e por isso a ação não pôde acontecer.
  ///
  /// **Decide por `type`, nunca por status.** O contrato declara quatro tipos
  /// com status 401, e dois deles não são "a sessão acabou": `invalid-credentials`
  /// é senha errada e `reauthentication-required` é sessão válida pedindo
  /// confirmação. Capturar a intenção nesses dois mandaria a pessoa para o
  /// login sem motivo, com um rascunho guardado que ela não pediu.
  bool _sessaoAcabou(FalhaDaApi falha) =>
      falha.problem.tipo == ProblemTipo.naoAutenticado ||
      falha.problem.tipo == ProblemTipo.tokenExpirado;

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

  /// O que o toque na saida da faixa faz.
  ///
  /// Tres casos, nesta ordem: a mensagem aponta um endereco e o toque navega;
  /// a mensagem tem rotulo e nenhum endereco, e o toque repete a operacao
  /// desta tela; nao ha rotulo, e nao ha toque.
  VoidCallback? _acaoDaFaixa() {
    final faixa = _faixa;
    if (faixa == null || faixa.acao == null) return null;
    final rota = faixa.rotaDaAcao;
    if (rota != null) return () => context.go(rota);
    return _cadastrar;
  }

  @override
  Widget build(BuildContext context) {
    final rascunho = widget.rascunho;

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
              titulo: TextosDoCadastro.tituloDosSinais(rascunho.nome),
            ),
            const SizedBox(height: BichuEspaco.e6),
            CamposDeSinais(key: _campos, rascunho: rascunho),
            if (_faixa != null) ...<Widget>[
              const SizedBox(height: BichuEspaco.e6),
              FaixaDeAviso(
                texto: _faixa!.texto,
                rotuloDaAcao: _faixa!.acao,
                // **A saida da mensagem decide, e nao a tela.** Ate a
                // BICHUS-62 este callback era sempre `_cadastrar`, e por isso
                // o 409 de limite de pets mostrava `Ver meus pets` e, ao
                // toque, **reenviava o cadastro** -- que devolvia o mesmo 409.
                // O rotulo prometia uma coisa e o botao fazia outra, em laco.
                aoTocarNaAcao: _acaoDaFaixa(),
              ),
            ],
          ],
        ),
      ),
    );
  }
}
