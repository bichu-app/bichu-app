import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:go_router/go_router.dart';

import '../../api/api_client.dart';
import '../../api/busca_de_cep.dart';
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
/// **Sem endereco por extenso e sem ponto no mapa** (ADR-0006): nao ha
/// geocodificacao neste caminho. Cidade, estado e bairro sao rotulo de texto. O
/// ponto e trabalho do painel, com mapa de toque.
///
/// ## O CEP: campo de BUSCA, e nao campo do corpo
///
/// O cliente pediu em 18/10/2026 ("no formulario de indicacao do profissional,
/// o campo cep nao entrou tambem"), pela decisao dele de 17/10 -- ViaCEP em
/// todo cadastro com CEP, preenchendo o endereco e **deixando a pessoa
/// editar**.
///
/// **E ele NAO viaja no corpo**, e a ausencia e medida e nao esquecimento:
/// `DirectorySuggestionInput` e `additionalProperties: false` e os campos de
/// endereco que ele aceita sao exatamente `city`, `state` e `neighborhood` --
/// os tres que o CEP preenche. O CEP serve para a pessoa nao digitar os tres,
/// e depois disso nao sobra nada dele para mandar: a entrada do diretorio, o
/// endereco publico e o ponto do mapa sao trabalho do painel (ADR-0011), e
/// guardar um codigo postal que ninguem le seria dado sem finalidade.
///
/// **Se o cliente quiser o CEP GRAVADO para quem revisa, aí sim muda o
/// contrato** -- `postal_code` opcional no corpo, coluna nova e escrita no
/// servidor. Isso e decisao dele e nao foi tomada aqui.
///
/// E **isto nao e geocodificacao**: ver `api/busca_de_cep.dart`, que troca CEP
/// por texto e ignora de proposito a coordenada que a BrasilAPI devolve.
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

  static const String rotuloDoCep = 'CEP';

  static const String ajudaDoCep =
      'Preenche bairro, cidade e estado. Você pode mudar depois.';

  /// Os tres desfechos da busca. **Nenhum e erro de formulario**: nenhum marca
  /// campo, nenhum desabilita o botao e nenhum impede o envio -- o CEP nao e
  /// campo do corpo, e o pior desfecho quer dizer "digite você mesmo".
  static const String buscandoOCep = 'Buscando o endereço…';

  static const String cepNaoEncontrado =
      'CEP não encontrado. Preencha abaixo.';

  static const String buscaIndisponivel =
      'Não deu para buscar o CEP agora. Preencha abaixo.';

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
  final TextEditingController _cep = TextEditingController();
  final TextEditingController _bairro = TextEditingController();
  final TextEditingController _cidade = TextEditingController();
  final TextEditingController _uf = TextEditingController();
  final TextEditingController _contato = TextEditingController();
  final TextEditingController _recado = TextEditingController();

  AtividadeDoDiretorio? _atividade;
  TipoDeContatoPublico? _tipoDeContato;

  /// O que a ultima busca de CEP devolveu. **Nunca desabilita nada**: serve
  /// so para a linha de texto embaixo do campo.
  ResultadoDaBusca? _buscaDoCep;
  bool _buscandoOCep = false;

  /// O CEP que a ultima busca usou, para nao repetir a chamada a cada tecla.
  String _cepJaBuscado = '';

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
    _cep.dispose();
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

  static final RegExp _soDigitos = RegExp(r'[^0-9]');

  /// Busca o endereco do CEP e preenche **so o que estiver VAZIO**.
  ///
  /// Tres regras, e as tres sao do pedido do cliente de 17/10/2026:
  ///
  /// 1. **so campo vazio recebe.** O que a pessoa escreveu vence o que a base
  ///    devolve -- inclusive o bairro, a cidade e a UF que esta tela ja
  ///    preencheu da regiao de referencia do tutor em [didChangeDependencies].
  ///    A base erra, e quem esta olhando o endereco e a pessoa;
  /// 2. **nada fica bloqueado depois da busca.** Os tres campos continuam
  ///    editaveis: CEP generico de cidade nao traz bairro;
  /// 3. **nada aqui pode impedir a indicacao.** Nenhum caminho desta funcao
  ///    marca erro de campo, mexe em `_impedimento` ou desabilita o botao. O
  ///    CEP nem viaja no corpo -- ver o cabecalho da tela.
  ///
  /// O `logradouro` que a busca devolve e **descartado**: nao ha campo de rua
  /// nesta tela e nao ha coluna para ele (ADR-0011: endereco publico e ponto
  /// do mapa sao do painel). Descartar e o certo; criar o campo seria decidir
  /// por conta propria que a sugestao passa a carregar endereco de terceiro.
  Future<void> _buscarOCep() async {
    final cep = _cep.text.replaceAll(_soDigitos, '');
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
      _preencherSeVazio(_bairro, endereco.bairro, 'neighborhood');
      _preencherSeVazio(_cidade, endereco.cidade, 'city');
      if (endereco.uf.length == 2) {
        _preencherSeVazio(_uf, endereco.uf, 'state');
      }
    });
  }

  /// Campo vazio recebe; campo escrito fica. E o erro do campo que acabou de
  /// ser preenchido sai junto -- deixar "Diga a cidade." embaixo de uma cidade
  /// preenchida seria a tela discutindo consigo mesma.
  void _preencherSeVazio(
    TextEditingController campo,
    String valor,
    String chave,
  ) {
    if (valor.isEmpty || campo.text.trim().isNotEmpty) return;
    campo.text = valor;
    _errosDeCampo = <String, String>{..._errosDeCampo}..remove(chave);
  }

  /// A linha que conta o que a busca fez. **Nenhum destes estados e erro.**
  Widget _linhaDaBusca(TextTheme textos) {
    if (_buscandoOCep) {
      return Text(
        TelaSugerirProfissional.buscandoOCep,
        style: textos.bodySmall,
      );
    }
    final texto = switch (_buscaDoCep) {
      ResultadoDaBusca.naoEncontrado =>
        TelaSugerirProfissional.cepNaoEncontrado,
      ResultadoDaBusca.indisponivel =>
        TelaSugerirProfissional.buscaIndisponivel,
      _ => null,
    };
    if (texto == null) return const SizedBox.shrink();
    return Text(texto, style: textos.bodySmall);
  }

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
                // **O CEP vem ANTES dos tres campos que ele preenche**, e a
                // ordem e o proprio recurso: quem digita primeiro o CEP nao
                // digita o resto. Ele e **opcional** e nao entra em
                // `_impedimento` -- quem nao sabe o CEP da clinica preenche
                // cidade e UF a mao, como antes.
                BichuField(
                  rotulo: TelaSugerirProfissional.rotuloDoCep,
                  controlador: _cep,
                  opcional: true,
                  limite: 8,
                  tipoDeTeclado: TextInputType.number,
                  ajuda: TelaSugerirProfissional.ajudaDoCep,
                  formatadores: <TextInputFormatter>[
                    FilteringTextInputFormatter.digitsOnly,
                  ],
                  correcaoAutomatica: false,
                  habilitado: !enviando,
                  // No oitavo digito a busca sai sozinha. Sem botao `Buscar`:
                  // um botao a mais e um passo a mais para quem so quer os
                  // campos preenchidos, e nao buscar e desfecho valido.
                  aoMudar: (valor) {
                    _aoDigitar(valor);
                    _buscarOCep();
                  },
                ),
                // O que a busca disse, e **so isso**: nao marca campo e nao
                // desabilita nada.
                if (_buscandoOCep || _buscaDoCep != null) ...<Widget>[
                  const SizedBox(height: BichuEspaco.e2),
                  _linhaDaBusca(textos),
                ],
                const SizedBox(height: BichuEspaco.e4),
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
