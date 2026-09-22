import 'package:flutter/material.dart';
import 'package:go_router/go_router.dart';

import '../../api/falhas.dart';
import '../../api/mensagens_de_erro.dart';
import '../../api/modelos_pet.dart';
import '../../api/problem.dart';
import '../../escopo.dart';
import '../../theme/bichu_tokens.g.dart';
import '../../widgets/barra_de_acao_fixa.dart';
import '../../widgets/botao_primario.dart';
import '../../widgets/faixa_de_aviso.dart';
import '../../widgets/saida_da_tela.dart';
import 'campos_do_pet.dart';
import 'rascunho_de_pet.dart';
import 'textos_do_detalhe.dart';

/// Editar os dados do pet (BICHUS-61), derivada de F1.3 e F1.5.
///
/// ## Os campos sao os MESMOS do cadastro, e isso e a historia
///
/// O criterio 1 pede "um formulario com os mesmos campos e as mesmas regras de
/// F1.3 e F1.5". Nao "parecidos": **os mesmos**. Por isso esta tela monta
/// [CamposDeIdentificacao] e [CamposDeSinais], os dois blocos que o cadastro
/// monta, e nao uma segunda versao deles.
///
/// Duas formas diferentes de editar os mesmos campos e defeito, nao escolha: o
/// rotulo muda de um lado, a validacao do outro, e quem cadastrou e quem
/// editou passam a ver telas diferentes do mesmo formulario. Enquanto os
/// campos moravam dentro do `State` de cada tela de cadastro, esta tela so
/// podia nascer como copia -- e por isso a primeira coisa que esta historia
/// fez foi tirar os campos de la.
///
/// ## O `PATCH` manda o pet inteiro, e o motivo e do servidor
///
/// `PATCH /pets/{petId}` recebe um `PetInput` **completo** e o repositorio
/// grava todas as colunas a partir dele: campo que nao viaja e gravado como
/// nulo. Por isso esta tela **carrega o pet inteiro antes de abrir** e
/// [RascunhoDePet.doPet] copia tudo, inclusive o que nenhum campo desta tela
/// mostra. O que a tela nao souber ler, ela apaga.
///
/// ## O que nao esta aqui
///
/// - **A foto** (criterios 4, 9, 10 e 11). O envio de foto passa pela porta
///   `CameraEGaleria` e pelo `photo-upload-intent`, e e trabalho proprio; o
///   criterio 10 ainda exige que a ausencia apareca como campo vazio a
///   preencher, e nao como pendencia acusada. Nomeado no relatorio, nao
///   esquecido.
/// - **Reautenticacao.** A edicao nao a exige: `updatePet` declara
///   `security: [bearerAuth]` sozinho no contrato.
class TelaEditarPet extends StatefulWidget {
  const TelaEditarPet({required this.pet, super.key});

  /// O pet **ja carregado**, e nao um id.
  ///
  /// Quem abre esta tela e T.1, que acabou de ler o pet inteiro. Recarregar
  /// aqui custaria um `GET` e abriria a janela em que a edicao comeca de um
  /// estado diferente do que a pessoa estava vendo.
  final Pet pet;

  @override
  State<TelaEditarPet> createState() => _TelaEditarPetState();
}

class _TelaEditarPetState extends State<TelaEditarPet> {
  late final RascunhoDePet _rascunho = RascunhoDePet.doPet(widget.pet);

  final GlobalKey<CamposDeIdentificacaoState> _identificacao =
      GlobalKey<CamposDeIdentificacaoState>();
  final GlobalKey<CamposDeSinaisState> _sinais =
      GlobalKey<CamposDeSinaisState>();

  bool _salvando = false;
  MensagemDeErro? _faixa;

  @override
  void dispose() {
    // Aqui o rascunho **e** desta tela: ela o criou em [initState] e ninguem
    // mais o segura. Diferente do assistente, onde ele atravessa tres telas.
    _rascunho.dispose();
    super.dispose();
  }

  Future<void> _salvar() async {
    // **Os dois blocos validam, e os dois gravam.** A ordem importa: chamar
    // so o primeiro e desistir no `false` dele deixaria os campos de sinais
    // sem gravar, e o `PATCH` sairia com o texto anterior a digitacao.
    final identificacaoOk = _identificacao.currentState?.validar() ?? false;
    final sinaisOk = _sinais.currentState?.validar() ?? false;
    if (!identificacaoOk || !sinaisOk) return;

    setState(() {
      _faixa = null;
      _salvando = true;
    });

    try {
      final atualizado = await Escopo.of(context).pets.atualizarPet(
        petId: widget.pet.id,
        nome: _rascunho.nome,
        especie: _rascunho.especie!,
        porte: _rascunho.porte!,
        breedCode: _rascunho.breedCode,
        breedFreeText: _rascunho.breedFreeTextParaEnvio,
        refDataVersion: _rascunho.refDataVersion,
        corPrincipalCodigo: _rascunho.corPrincipalCodigo,
        segundaCorCodigo: _rascunho.segundaCorCodigo,
        sexo: _rascunho.sexo,
        sinaisParticulares: _rascunho.sinaisParticulares,
        cuidados: _rascunho.cuidados,
      );
      if (!mounted) return;
      // Devolve o pet atualizado para T.1 pintar. `pop` com valor, e nao um
      // `go`: a edicao e uma folha sobre o detalhe, e voltar e voltar.
      context.pop(atualizado);
    } on FalhaDeChamada catch (falha) {
      // **Criterio 5: os campos permanecem preenchidos e nada e perdido.**
      //
      // A tela nao fecha, o rascunho nao e descartado e os blocos de campo
      // nao sao remontados -- a falha vira faixa e a pessoa corrige e tenta de
      // novo com tudo onde estava. Um `pop` aqui, ou um `setState` que
      // recriasse o rascunho, apagaria a edicao inteira no unico momento em
      // que ela e dificil de refazer.
      if (!mounted) return;
      setState(() => _faixa = _mensagem(falha));
    } finally {
      if (mounted) setState(() => _salvando = false);
    }
  }

  /// **Decide por `type`, nunca por status.**
  ///
  /// `validation-failed` nao e generico: o erro e do campo que o servidor
  /// nomeou. Se ele nao nomear campo nenhum, e defeito nosso, e a tela diz
  /// isso sem acusar um campo que ninguem apontou.
  MensagemDeErro _mensagem(FalhaDeChamada falha) {
    if (falha is FalhaDaApi &&
        falha.problem.tipo == ProblemTipo.validacaoFalhou) {
      final primeiro = falha.problem.campos.isEmpty
          ? null
          : falha.problem.campos.first.mensagem;
      return MensagemDeErro(
        texto: primeiro ?? TextosDoDetalhe.naoConseguimosSalvar,
      );
    }
    if (falha is FalhaDaApi &&
        (falha.problem.tipo == ProblemTipo.naoEncontrado ||
            falha.problem.status == 404)) {
      // O pet saiu da conta entre abrir e salvar: excluido noutro aparelho, ou
      // o endereco nunca foi desta conta (ADR-0021, 404 nos dois casos).
      return const MensagemDeErro(texto: TextosDoDetalhe.petForaDaConta);
    }
    return MensagensDeErro.de(falha);
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: const BarraDeConta(
        titulo: TextosDoDetalhe.tituloDaEdicao,
        saida: TipoDeSaida.voltar,
      ),
      bottomNavigationBar: BarraDeAcaoFixa(
        acoes: <Widget>[
          BotaoPrimario(
            rotulo: TextosDoDetalhe.salvar,
            critico: true,
            carregando: _salvando,
            aoTocar: _salvar,
          ),
        ],
      ),
      // **`SingleChildScrollView` + `Column`, e nao `ListView`.**
      //
      // A diferenca nao e de estilo, e ela e um defeito medido. O `ListView`
      // so constroi o que cabe na tela: com os dois blocos de campo empilhados,
      // [CamposDeSinais] nasce **abaixo da dobra** e so existe depois de a
      // pessoa rolar. Enquanto ele nao existe, `_sinais.currentState` e nulo,
      // `validar()` devolve nulo, e [_salvar] desiste em silencio -- toca-se em
      // `Salvar`, nada acontece, e nada explica por que.
      //
      // As telas do assistente usam `ListView` e estao certas: cada uma
      // hospeda UM bloco. Esta hospeda dois, e um formulario precisa de todos
      // os campos vivos para validar e para enviar.
      body: SafeArea(
        child: SingleChildScrollView(
          padding: const EdgeInsets.all(BichuEspaco.e4),
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.stretch,
            children: <Widget>[
              // **Criterio 3: o alerta que ja saiu nao e reescrito.**
              //
              // So aparece quando ha caso aberto, e aparece ANTES dos campos:
              // depois deles seria informacao entregue apos a decisao. O cartaz
              // e o alerta ja disparados carregam os dados do momento em que
              // sairam, e nada nesta tela os alcanca.
              if (widget.pet.idDoCasoAberto != null) ...<Widget>[
                const FaixaDeAviso(
                  peso: PesoDaFaixa.informativo,
                  texto: TextosDoDetalhe.oAlertaJaSaiu,
                ),
                const SizedBox(height: BichuEspaco.e6),
              ],
              CamposDeIdentificacao(key: _identificacao, rascunho: _rascunho),
              const SizedBox(height: BichuEspaco.e6),
              CamposDeSinais(key: _sinais, rascunho: _rascunho),
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
