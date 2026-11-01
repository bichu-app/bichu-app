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

/// F1.5 — Cadastrar pet: sinais.
class TelaCadastrarSinais extends StatefulWidget {
  const TelaCadastrarSinais({
    required this.rascunho,
    super.key,
    this.erroInicial,
  });

  final RascunhoDePet rascunho;

  /// A faixa que a tela ja abre mostrando.
  final MensagemDeErro? erroInicial;

  @override
  State<TelaCadastrarSinais> createState() => _TelaCadastrarSinaisState();
}

class _TelaCadastrarSinaisState extends State<TelaCadastrarSinais> {
  final GlobalKey<CamposDeSinaisState> _campos =
      GlobalKey<CamposDeSinaisState>();

  final String _chaveDeIdempotencia = ApiClient.novaChaveDeIdempotencia();

  bool _enviando = false;
  late MensagemDeErro? _faixa = widget.erroInicial;

  Future<void> _cadastrar() async {
    final rascunho = widget.rascunho;

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
      context.pushReplacement(
        Rotas.petCadastrado,
        extra: ResultadoDoCadastro(pet: pet, fotoPendente: rascunho.foto),
      );
    } on FalhaDeChamada catch (falha) {
      if (!mounted) return;

      if (falha is FalhaDaApi && _sessaoAcabou(falha)) {
        await Escopo.of(context).guarda.guardar(
              intencaoDeCadastrarPet(
                rascunho,
                criadaEm: DateTime.now(),
                passo: 3,
              ),
            );
        if (!mounted) return;
        context.push(Rotas.entrar);
        return;
      }

      setState(() => _faixa = _mensagem(falha));
    } on Object catch (erro, pilha) {
      registrarFalhaInesperada(erro, pilha, onde: 'ao cadastrar o pet');
      if (!mounted) return;
      setState(
        () => _faixa = const MensagemDeErro(texto: MensagensDeErro.servidorFora),
      );
    } finally {
      if (mounted) setState(() => _enviando = false);
    }
  }

  bool _sessaoAcabou(FalhaDaApi falha) =>
      falha.problem.tipo == ProblemTipo.naoAutenticado ||
      falha.problem.tipo == ProblemTipo.tokenExpirado;

  MensagemDeErro _mensagem(FalhaDeChamada falha) {
    if (falha is FalhaDeConexao) {
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
                aoTocarNaAcao: _acaoDaFaixa(),
              ),
            ],
          ],
        ),
      ),
    );
  }
}
