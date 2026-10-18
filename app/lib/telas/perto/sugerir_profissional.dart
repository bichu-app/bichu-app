import 'package:flutter/material.dart';
import 'package:go_router/go_router.dart';

import '../../api/api_client.dart';
import '../../api/diretorio_api.dart';
import '../../api/falhas.dart';
import '../../api/mensagens_de_erro.dart';
import '../../api/modelos_diretorio.dart';
import '../../api/problem.dart';
import '../../escopo.dart';
import '../../roteamento/rotas.dart';
import '../../theme/bichu_colors.dart';
import '../../theme/bichu_tokens.g.dart';
import '../../widgets/barra_de_acao_fixa.dart';
import '../../widgets/bichu_field.dart';
import '../../widgets/botao_primario.dart';
import '../../widgets/faixa_de_aviso.dart';
import '../../widgets/seletor_de_lista.dart';
import '../../widgets/saida_da_tela.dart';

/// **Indicar um profissional, clínica ou laboratório para o `Perto`**
/// (`suggestDirectoryEntry`).
///
/// ## Por que esta tela NAO publica, e a de criar encontro publica
///
/// A diferenca e de natureza, e e ela que decide o desenho inteiro:
///
/// - **Criar encontro e a pessoa falando DELA MESMA.** Ela escolheu o lugar,
///   marcou a hora e responde pelo que escreveu. Autor e assunto sao a mesma
///   pessoa, e por isso o encontro pode publicar direto.
/// - **Indicar uma clinica e publicar sobre um TERCEIRO** que nao pediu, nao
///   sabe e pode discordar -- do texto, da categoria e de aparecer. Nao existe
///   no produto quem represente esse terceiro.
///
/// Por isso a sugestao **nasce pendente de revisao** e nada aparece no `Perto`
/// antes de alguem olhar. Isso nao e zelo novo: e a emenda 1 do ADR-0011,
/// escrita no `CHECK` de `professionals.source`, que **nao tem** o valor
/// `'community'` -- *"nenhum perfil nasce sem o aceite de quem ele descreve; a
/// comunidade convida e avalia, nunca cria"*. Esta tela nao escreve em
/// `professionals`: ela escreve numa fila que o painel trabalha.
///
/// **O texto de sucesso diz isso com estas palavras.** Um "pronto, indicado!"
/// faria a pessoa acreditar que o nome de uma clinica real esta no ar sem
/// ninguem ter olhado.
///
/// ## O minimo de dado pessoal, e so de entidade
///
/// Nome, atividade, cidade, bairro opcional e **um** contato publico -- o que o
/// estabelecimento ja divulga para ser contratado, e que e o que permite ao
/// painel convida-lo. **Nao pede documento** (CRMV, CNPJ) e **nao pede dado de
/// pessoa fisica**: documento e prova de quem o apresenta, mora em
/// `entity_verifications`, e pedi-lo aqui seria coletar o documento de um
/// terceiro pela mao de um estranho.
///
/// **Sem endereco e sem ponto no mapa** (ADR-0006): nao ha geocodificacao neste
/// caminho. Cidade, estado e bairro sao rotulo de texto. O ponto e trabalho do
/// painel, com mapa de toque.
class TelaSugerirProfissional extends StatefulWidget {
  const TelaSugerirProfissional({super.key});

  /// **Mais curto que o rotulo da porta, de proposito.** `BarraDeConta` tem
  /// 64 dp e uma linha: medido no aparelho, "Indicar quem atende bem" sai
  /// truncado como "Indicar quem atende be...". O rotulo do botao no `Perto`
  /// continua sendo o convite; o titulo da tela e o nome do lugar onde a
  /// pessoa chegou.
  static const String titulo = 'Indicar profissional';

  /// **O aviso que separa esta tela da de criar encontro.** Antes dos campos,
  /// porque e a decisao que a pessoa precisa entender ao comecar a escrever.
  static const String avisoDeRevisao =
      'A gente confere antes de publicar. O estabelecimento é avisado e decide '
      'se quer aparecer.';

  static const String rotuloDeIndicar = 'Enviar indicação';

  static const String entreParaIndicar = 'Entre para indicar.';

  static const String recebido =
      'Indicação recebida. Ela vai para conferência: nada aparece no Perto até '
      'alguém olhar.';

  @override
  State<TelaSugerirProfissional> createState() =>
      _TelaSugerirProfissionalState();
}

enum _Fase { preenchendo, enviando, recebida }

/// O primeiro impedimento, ou nulo.
enum _Impedimento {
  semConta(TelaSugerirProfissional.entreParaIndicar),
  semNome('Diga o nome do lugar ou da pessoa.'),
  semAtividade('Escolha o que eles fazem.'),
  semCidade('Diga a cidade.'),
  semUf('Diga o estado, com duas letras.'),
  semTipoDeContato('Escolha como entrar em contato.'),
  semContato('Preencha o contato público.');

  const _Impedimento(this.texto);

  final String texto;
}

class _TelaSugerirProfissionalState extends State<TelaSugerirProfissional> {
  final TextEditingController _nome = TextEditingController();
  final TextEditingController _bairro = TextEditingController();
  final TextEditingController _cidade = TextEditingController();
  final TextEditingController _uf = TextEditingController();
  final TextEditingController _contato = TextEditingController();
  final TextEditingController _recado = TextEditingController();

  AtividadeDoDiretorio? _atividade;
  TipoDeContatoPublico? _tipoDeContato;

  _Fase _fase = _Fase.preenchendo;
  MensagemDeErro? _erro;
  Map<String, String> _errosDeCampo = const <String, String>{};
  String? _chave;

  bool _preencheu = false;

  @override
  void didChangeDependencies() {
    super.didChangeDependencies();
    if (_preencheu) return;
    _preencheu = true;
    // A regiao que o tutor ja cadastrou (BICHUS-92), que e texto e nao
    // coordenada virada em nome. Quem indica quase sempre indica perto de casa.
    final regiao = Escopo.of(context).sessao.usuario?.regiaoDeReferencia;
    if (regiao == null) return;
    _bairro.text = regiao.bairro ?? '';
    _cidade.text = regiao.cidade ?? '';
    _uf.text = regiao.uf ?? '';
  }

  @override
  void dispose() {
    _nome.dispose();
    _bairro.dispose();
    _cidade.dispose();
    _uf.dispose();
    _contato.dispose();
    _recado.dispose();
    super.dispose();
  }

  void _aoDigitar(String _) => setState(() {
        _erro = null;
        _errosDeCampo = const <String, String>{};
      });

  _Impedimento? get _impedimento {
    if (Escopo.of(context).sessao.usuario == null) {
      return _Impedimento.semConta;
    }
    if (_nome.text.trim().length < 2) return _Impedimento.semNome;
    if (_atividade == null) return _Impedimento.semAtividade;
    if (_cidade.text.trim().length < 2) return _Impedimento.semCidade;
    if (_uf.text.trim().length != 2) return _Impedimento.semUf;
    if (_tipoDeContato == null) return _Impedimento.semTipoDeContato;
    if (_contato.text.trim().length < 3) return _Impedimento.semContato;
    return null;
  }

  Future<void> _indicar() async {
    if (_impedimento != null) return;
    final escopo = Escopo.of(context);
    setState(() {
      _fase = _Fase.enviando;
      _erro = null;
      _errosDeCampo = const <String, String>{};
    });

    final corpo = DiretorioApi.corpoDaSugestao(
      nome: _nome.text.trim(),
      atividade: _atividade!,
      cidade: _cidade.text.trim(),
      uf: _uf.text.trim().toUpperCase(),
      tipoDeContato: _tipoDeContato!,
      contato: _contato.text.trim(),
      bairro: _bairro.text.trim(),
      recado: _recado.text.trim(),
    );
    final chave = _chave ??= ApiClient.novaChaveDeIdempotencia();

    try {
      await escopo.diretorio.sugerir(corpo, idempotencyKey: chave);
      if (!mounted) return;
      // **Fica NESTA tela, com o recibo.** Nao ha tela de "publicado" porque
      // nada foi publicado, e navegar para o `Perto` faria a pessoa procurar
      // na lista o que nao esta lá.
      setState(() => _fase = _Fase.recebida);
    } on FalhaDeConexao {
      if (!mounted) return;
      setState(() {
        _fase = _Fase.preenchendo;
        _erro = const MensagemDeErro(
          texto: 'Sem conexão agora. Toque de novo quando tiver internet.',
          acao: MensagensDeErro.tentarDeNovo,
        );
      });
    } on FalhaDaApi catch (falha) {
      if (!mounted) return;
      if (falha.tipo == ProblemTipo.naoAutenticado ||
          falha.tipo == ProblemTipo.tokenExpirado) {
        setState(() => _fase = _Fase.preenchendo);
        context.push(Rotas.entrar);
        return;
      }
      setState(() {
        _fase = _Fase.preenchendo;
        _erro = MensagensDeErro.de(falha);
        _errosDeCampo = _camposRecusados(falha);
      });
    } on FalhaDeChamada catch (falha) {
      if (!mounted) return;
      setState(() {
        _fase = _Fase.preenchendo;
        _erro = MensagensDeErro.de(falha);
      });
    } on Object catch (erro, pilha) {
      // Sem este ramo a fase `enviando` ficaria de pe para sempre num erro que
      // nao e `FalhaDeChamada` (ver `api/falhas.dart`).
      registrarFalhaInesperada(erro, pilha, onde: 'ao indicar um profissional');
      if (!mounted) return;
      setState(() {
        _fase = _Fase.preenchendo;
        _erro = const MensagemDeErro(
          texto: MensagensDeErro.servidorFora,
          acao: MensagensDeErro.tentarDeNovo,
        );
      });
    }
  }

  /// Os campos que o `400` nomeou, pela frase do servidor.
  static Map<String, String> _camposRecusados(FalhaDaApi falha) {
    final mapa = <String, String>{};
    for (final campo in falha.problem.campos) {
      if (campo.campo.isEmpty) continue;
      mapa[campo.campo] = campo.mensagem ?? 'Confira este campo.';
    }
    return mapa;
  }

  @override
  Widget build(BuildContext context) {
    final escopo = Escopo.of(context);
    final cores = BichuColors.of(context).cores;
    final textos = Theme.of(context).textTheme;

    return AnimatedBuilder(
      animation: escopo.sessao,
      builder: (context, _) {
        if (_fase == _Fase.recebida) return _recibo(context);

        final impedimento = _impedimento;
        final enviando = _fase == _Fase.enviando;
        final tipo = _tipoDeContato;

        return Scaffold(
          appBar: const BarraDeConta(
            titulo: TelaSugerirProfissional.titulo,
            saida: TipoDeSaida.voltar,
          ),
          body: SafeArea(
            top: false,
            bottom: false,
            child: ListView(
              padding: const EdgeInsets.all(BichuEspaco.e4),
              addSemanticIndexes: false,
              children: <Widget>[
                const FaixaDeAviso(
                  peso: PesoDaFaixa.informativo,
                  texto: TelaSugerirProfissional.avisoDeRevisao,
                ),
                if (_erro != null) ...<Widget>[
                  const SizedBox(height: BichuEspaco.e4),
                  FaixaDeAviso(
                    texto: _erro!.texto,
                    rotuloDaAcao: _erro!.acao,
                    aoTocarNaAcao: _saidaDoErro(context, _erro!),
                  ),
                ],
                // Sem conta, o motivo vem com a saida que o resolve, acima dos
                // campos: um botao desabilitado sem explicacao e o defeito que
                // esta faixa existe para impedir.
                if (impedimento == _Impedimento.semConta) ...<Widget>[
                  const SizedBox(height: BichuEspaco.e4),
                  FaixaDeAviso(
                    texto: TelaSugerirProfissional.entreParaIndicar,
                    rotuloDaAcao: 'Entrar',
                    aoTocarNaAcao: () => context.push(Rotas.entrar),
                  ),
                ],
                const SizedBox(height: BichuEspaco.e6),
                BichuField(
                  rotulo: 'Nome do lugar',
                  controlador: _nome,
                  aoMudar: _aoDigitar,
                  erro: _errosDeCampo['display_name'],
                  limite: 120,
                  exemplo: 'Clínica Veterinária Bichinho',
                  capitalizacao: TextCapitalization.words,
                  habilitado: !enviando,
                ),
                const SizedBox(height: BichuEspaco.e4),
                SeletorDeLista(
                  rotulo: 'O que eles fazem',
                  itens: AtividadeDoDiretorio.values
                      .map(
                        (a) => ItemDeLista(codigo: a.codigo, rotulo: a.rotulo),
                      )
                      .toList(),
                  selecionado: _atividade?.codigo,
                  erro: _errosDeCampo['kind'],
                  habilitado: !enviando,
                  aoSelecionar: (codigo) => setState(() {
                    _atividade = AtividadeDoDiretorio.porCodigo(codigo);
                    _erro = null;
                  }),
                ),
                const SizedBox(height: BichuEspaco.e6),
                Semantics(
                  header: true,
                  child: Text('Onde atende', style: textos.titleMedium),
                ),
                const SizedBox(height: BichuEspaco.e3),
                Row(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: <Widget>[
                    Expanded(
                      child: BichuField(
                        rotulo: 'Cidade',
                        controlador: _cidade,
                        aoMudar: _aoDigitar,
                        erro: _errosDeCampo['city'],
                        limite: 80,
                        capitalizacao: TextCapitalization.words,
                        habilitado: !enviando,
                      ),
                    ),
                    const SizedBox(width: BichuEspaco.e3),
                    SizedBox(
                      width: 96,
                      child: BichuField(
                        rotulo: 'UF',
                        controlador: _uf,
                        aoMudar: _aoDigitar,
                        erro: _errosDeCampo['state'],
                        limite: 2,
                        capitalizacao: TextCapitalization.characters,
                        correcaoAutomatica: false,
                        habilitado: !enviando,
                      ),
                    ),
                  ],
                ),
                const SizedBox(height: BichuEspaco.e4),
                BichuField(
                  rotulo: 'Bairro',
                  controlador: _bairro,
                  aoMudar: _aoDigitar,
                  erro: _errosDeCampo['neighborhood'],
                  opcional: true,
                  limite: 80,
                  capitalizacao: TextCapitalization.words,
                  habilitado: !enviando,
                ),
                const SizedBox(height: BichuEspaco.e6),
                Semantics(
                  header: true,
                  child: Text('Contato público', style: textos.titleMedium),
                ),
                const SizedBox(height: BichuEspaco.e3),
                SeletorDeLista(
                  rotulo: 'Como entrar em contato',
                  // **O tipo e declarado, nao adivinhado.** O servidor confere
                  // o formato contra ele; adivinhar por heuristica aceitaria um
                  // telefone no campo de site, e a recusa chegaria sem dizer
                  // qual dos dois estava errado.
                  itens: TipoDeContatoPublico.values
                      .map(
                        (t) => ItemDeLista(codigo: t.codigo, rotulo: t.rotulo),
                      )
                      .toList(),
                  selecionado: tipo?.codigo,
                  erro: _errosDeCampo['public_contact.kind'],
                  habilitado: !enviando,
                  aoSelecionar: (codigo) => setState(() {
                    _tipoDeContato = TipoDeContatoPublico.porCodigo(codigo);
                    _erro = null;
                    _errosDeCampo = const <String, String>{};
                  }),
                ),
                const SizedBox(height: BichuEspaco.e4),
                BichuField(
                  rotulo: tipo?.rotulo ?? 'Contato',
                  controlador: _contato,
                  aoMudar: _aoDigitar,
                  erro: _errosDeCampo['public_contact.value'],
                  limite: 120,
                  // A ajuda muda com o tipo escolhido: o formato que o servidor
                  // vai conferir dito ANTES, e nao descoberto pelo 400.
                  ajuda: tipo?.exemplo ??
                      'Escolha acima como entrar em contato.',
                  tipoDeTeclado: tipo == TipoDeContatoPublico.phone
                      ? TextInputType.phone
                      : TextInputType.text,
                  correcaoAutomatica: false,
                  habilitado: !enviando && tipo != null,
                ),
                const SizedBox(height: BichuEspaco.e6),
                BichuField(
                  rotulo: 'Por que você indica',
                  controlador: _recado,
                  aoMudar: _aoDigitar,
                  erro: _errosDeCampo['note'],
                  opcional: true,
                  linhas: 3,
                  limite: 280,
                  // **Nao e publicado**, nem se a indicacao for aprovada:
                  // avaliacao da comunidade e outro modelo, e ele nao existe
                  // (ADR-0011 secao 5.4). Dito, para ninguem escrever para o
                  // publico.
                  ajuda: 'Só quem confere lê. Não aparece no Perto.',
                  capitalizacao: TextCapitalization.sentences,
                  habilitado: !enviando,
                ),
              ],
            ),
          ),
          bottomNavigationBar: BarraDeAcaoFixa(
            acoes: <Widget>[
              // Nao repete o que a faixa acima ja disse com saida.
              if (impedimento != null && impedimento != _Impedimento.semConta)
                _MotivoDoBloqueio(
                  texto: impedimento.texto,
                  cor: cores.textPrimary,
                ),
              BotaoPrimario(
                rotulo: TelaSugerirProfissional.rotuloDeIndicar,
                critico: true,
                carregando: enviando,
                aoTocar: impedimento == null && !enviando ? _indicar : null,
              ),
            ],
          ),
        );
      },
    );
  }

  /// O recibo. **Diz que foi para conferencia, e nao que foi publicado.**
  Widget _recibo(BuildContext context) {
    final cores = BichuColors.of(context).cores;
    final textos = Theme.of(context).textTheme;

    return Scaffold(
      appBar: const BarraDeConta(
        titulo: TelaSugerirProfissional.titulo,
        saida: TipoDeSaida.fechar,
      ),
      body: SafeArea(
        top: false,
        bottom: false,
        child: ListView(
          padding: const EdgeInsets.all(BichuEspaco.e4),
          addSemanticIndexes: false,
          children: <Widget>[
            Semantics(
              header: true,
              liveRegion: true,
              child: Text(
                'Obrigado pela indicação',
                style: textos.titleLarge?.copyWith(color: cores.textPrimary),
              ),
            ),
            const SizedBox(height: BichuEspaco.e3),
            Text(
              TelaSugerirProfissional.recebido,
              style: textos.bodyLarge?.copyWith(color: cores.textSecondary),
            ),
          ],
        ),
      ),
      bottomNavigationBar: BarraDeAcaoFixa(
        acoes: <Widget>[
          BotaoPrimario(
            rotulo: 'Voltar para o Perto',
            critico: true,
            aoTocar: () => context.go(Rotas.perto),
          ),
        ],
      ),
    );
  }

  VoidCallback? _saidaDoErro(BuildContext context, MensagemDeErro mensagem) {
    if (mensagem.acao == null) return null;
    final rota = mensagem.rotaDaAcao;
    if (rota != null) return () => context.go(rota);
    if (mensagem.proximaAcao == ProximaAcao.entrar) {
      return () => context.push(Rotas.entrar);
    }
    return null;
  }
}

/// O motivo pelo qual o botao esta desabilitado, dito em voz alta.
class _MotivoDoBloqueio extends StatelessWidget {
  const _MotivoDoBloqueio({required this.texto, required this.cor});

  final String texto;
  final Color cor;

  @override
  Widget build(BuildContext context) {
    final textos = Theme.of(context).textTheme;
    return Padding(
      padding: const EdgeInsets.only(bottom: BichuEspaco.e3),
      child: Semantics(
        liveRegion: true,
        child: Text(texto, style: textos.bodyMedium?.copyWith(color: cor)),
      ),
    );
  }
}
