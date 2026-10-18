import 'package:flutter/material.dart';
import 'package:flutter/services.dart';

import '../../acessibilidade/anunciar.dart';
import '../../api/busca_de_cep.dart';
import '../../formato/cep.dart';
import '../../api/estados_brasileiros.dart';
import '../../api/falhas.dart';
import '../../api/me_api.dart';
import '../../api/mensagens_de_erro.dart';
import '../../api/problem.dart';
import '../../escopo.dart';
import '../../formato/telefone.dart';
import '../../roteamento/rotas.dart';
import '../../theme/bichu_colors.dart';
import '../../theme/bichu_tokens.g.dart';
import '../../widgets/barra_de_acao_fixa.dart';
import '../../widgets/bichu_field.dart';
import '../../widgets/botao_primario.dart';
import '../../widgets/faixa_de_aviso.dart';
import '../../widgets/saida_da_tela.dart';
import '../../widgets/seletor_de_lista.dart';

/// `Perfil` › `Meus dados`: os dados pessoais do tutor.
///
/// Pedido do cliente em 18/10/2026, literal: *"crie tambem uma tela do perfil
/// do usuario, para ele editar os dados pessoais, e-mail, telefone e outras
/// informacoes"*.
///
/// ===========================================================================
/// OS CAMPOS SAO OS DO CONTRATO, E SO ELES
/// ===========================================================================
/// `MeUpdate` (corpo de `PATCH /v1/me`) aceita quatro coisas, e a leitura esta
/// escrita em `api/me_api.dart`: `display_name`, `phone_e164` e a
/// `reference_area` com `postal_code`, `neighborhood`, `city` e `state`. Nao ha
/// campo nesta tela que o servidor nao aceite -- um campo a mais seria um
/// controle que recusa com 400 ou, pior, que parece salvar e nao salva.
///
/// **Nao ha foto.** `Me` nao tem foto de usuario: nao ha campo no contrato, nao
/// ha rota de intencao de upload para perfil (as que existem sao de pet, de
/// achado e de capa de encontro) e nao ha coluna. `widgets/previa_da_foto.dart`
/// continua onde esta, servindo quem tem foto de verdade.
///
/// ===========================================================================
/// O E-MAIL APARECE E NAO SE EDITA, E O MOTIVO E DE CONTRATO
/// ===========================================================================
/// `MeUpdate` **nao aceita `email`** (SEC-003, escrito no proprio contrato), e
/// a rota propria -- `POST /v1/me/email-change` -- exige reautenticacao com
/// senha (`x-reauth-scope: email_change`), que **este app nao tem**: nada em
/// `app/lib/api` chama `POST /auth/reauth` e `api_client.dart` nao manda
/// `X-Reauth-Token`. Um campo editavel aqui, ou um botao `Trocar o e-mail`,
/// seria acao sem destino -- o que o criterio 2 da BICHUS-62 proibe -- e
/// receberia 401 `reauthentication-required` em silencio.
///
/// Entao o endereco e mostrado de LEITURA, com a situacao de confirmacao ao
/// lado e com o caminho humano dito em uma linha. A tela nao promete troca, e
/// nao chama rota que nao esteja ao alcance dela.
///
/// ===========================================================================
/// O QUE A TELA NAO FAZ, E NAO E ESQUECIMENTO
/// ===========================================================================
/// - **Nao abre o formulario quando a leitura falha.** Um formulario em branco
///   sobre uma leitura que nao aconteceu e um `Salvar` que apaga o cadastro: o
///   PATCH mandaria vazio o que a tela nao conseguiu ler. Falha mostra faixa
///   com `Atualizar`, e nada mais.
/// - **Nao enfileira sem conexao.** A fila offline existe para o que nao pode
///   esperar -- o caso de perdido, o achado. Corrigir o telefone pode.
/// - **Nao manda campo que nao mudou.** `MeUpdate` nao tem campo obrigatorio;
///   um corpo com os quatro campos sempre sobrescreveria com vazio o que a
///   pessoa nem abriu.
class TelaDadosPessoais extends StatefulWidget {
  const TelaDadosPessoais({super.key});

  @override
  State<TelaDadosPessoais> createState() => _TelaDadosPessoaisState();
}

/// Os desfechos de uma abertura. Nenhum deles e formulario em branco por falha.
enum _Fase { carregando, formulario, falhaNaLeitura }

class _TelaDadosPessoaisState extends State<TelaDadosPessoais> {
  final TextEditingController _nome = TextEditingController();
  final TextEditingController _telefone = TextEditingController();
  final TextEditingController _cep = TextEditingController();
  final TextEditingController _bairro = TextEditingController();
  final TextEditingController _cidade = TextEditingController();

  String? _uf;

  /// O que o servidor devolveu na ultima leitura. E a referencia do que MUDOU:
  /// sem ela, nao ha como mandar so o que a pessoa alterou.
  DadosPessoais? _lido;

  _Fase _fase = _Fase.carregando;
  bool _salvando = false;
  String? _textoDaFalha;
  String? _confirmacao;
  MensagemDeErro? _faixa;

  /// O erro de cada campo, pela mesma chave que o servidor usa em
  /// `errors[].field`. Uma estrutura so para a conferencia local e para a do
  /// servidor: duas listas de erro divergiriam na mensagem.
  final Map<String, String> _erros = <String, String>{};

  ResultadoDaBusca? _buscaDoCep;
  bool _buscandoOCep = false;
  String _cepJaBuscado = '';

  bool _carregou = false;

  @override
  void didChangeDependencies() {
    super.didChangeDependencies();
    // Uma vez: `Escopo.of` precisa de `context` com dependencia ligada, e
    // `initState` nao tem. A guarda existe porque mudar o tema do sistema
    // tambem chama este metodo, e sem ela viraria uma chamada de rede.
    if (_carregou) return;
    _carregou = true;
    _carregar();
  }

  @override
  void dispose() {
    for (final c in <TextEditingController>[
      _nome,
      _telefone,
      _cep,
      _bairro,
      _cidade,
    ]) {
      c.dispose();
    }
    super.dispose();
  }

  Future<void> _carregar() async {
    setState(() {
      _fase = _Fase.carregando;
      _textoDaFalha = null;
      _faixa = null;
    });
    try {
      final dados = await Escopo.of(context).me.meusDados();
      if (!mounted) return;
      setState(() {
        _lido = dados;
        _nome.text = dados.usuario.nome ?? '';
        // **Mostra formatado, guarda E.164.** O que esta no campo e a
        // gramatica brasileira que se le; quem produz valor de contrato e
        // `telefoneEmE164`, na hora de enviar.
        _telefone.text = mascaraDeTelefone(dados.telefone ?? '');
        // **Mascarado na LEITURA tambem**, e nao so na digitacao: o
        // formatador do campo roda em `formatEditUpdate`, que nao e chamado
        // quando a tela escreve no controlador. Sem esta linha o CEP salvo
        // apareceria `01310100` e a digitacao produziria `01310-100` -- duas
        // formas do mesmo campo na mesma tela.
        //
        // E ela e o que aguenta o valor TORTO que pode estar gravado:
        // `MeUpdate.reference_area.postal_code` aceita `^\d{5}-?\d{3}$`, com
        // hifen OPCIONAL, entao existe CEP com hifen no banco vindo de cliente
        // antigo. `mascaraDeCep` descarta o que nao e digito e reformata, em
        // vez de mostrar `01310--100`.
        _cep.text = mascaraDeCep(dados.cep ?? '');
        _bairro.text = dados.bairro ?? '';
        _cidade.text = dados.cidade ?? '';
        _uf = (dados.uf != null && dados.uf!.length == 2) ? dados.uf : null;
        _cepJaBuscado = _soDigitos(_cep.text);
        _fase = _Fase.formulario;
      });
    } on FalhaDeChamada catch (falha) {
      if (!mounted) return;
      setState(() {
        _textoDaFalha = MensagensDeErro.de(falha).texto;
        _fase = _Fase.falhaNaLeitura;
      });
    } on Object catch (erro, pilha) {
      // O que nao e `FalhaDeChamada` -- um corpo 200 fora do contrato, por
      // exemplo. Sem este ramo a tela ficaria em `carregando` para sempre.
      registrarFalhaInesperada(erro, pilha, onde: 'ao ler os meus dados');
      if (!mounted) return;
      setState(() {
        _textoDaFalha = MensagensDeErro.servidorFora;
        _fase = _Fase.falhaNaLeitura;
      });
    }
  }

  static String _soDigitos(String bruto) => bruto.replaceAll(RegExp(r'\D'), '');

  /// A busca de CEP, com as mesmas tres regras do pedido da plaquinha:
  /// so preenche campo vazio, nada fica bloqueado, e **nada aqui impede o
  /// salvar**. Ver `api/busca_de_cep.dart`: e texto, nunca coordenada.
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
      _preencherSeVazio(_bairro, endereco.bairro, _CamposDosDados.bairro);
      _preencherSeVazio(_cidade, endereco.cidade, _CamposDosDados.cidade);
      if (_uf == null && endereco.uf.length == 2) {
        _uf = endereco.uf;
        _erros.remove(_CamposDosDados.uf);
      }
    });
  }

  void _preencherSeVazio(
    TextEditingController campo,
    String valor,
    String chave,
  ) {
    if (valor.isEmpty || campo.text.trim().isNotEmpty) return;
    campo.text = valor;
    _erros.remove(chave);
  }

  /// Confere campo por campo e devolve os erros TODOS de uma vez.
  ///
  /// De uma vez, e nao o primeiro: recusar um campo por vez faz a pessoa
  /// descobrir o formulario aos tropecos. E cada mensagem diz **o que fazer**,
  /// porque "invalido" nao e instrucao.
  Map<String, String> _conferir() {
    final erros = <String, String>{};
    final lido = _lido;

    // O NOME pode ficar vazio no contrato (`display_name` nao tem `minLength`),
    // e por isso apagar nao e erro -- e uma escolha que o servidor aceita. O
    // que a tela recusa e o nome que e **so espaco**: ele passaria o contrato e
    // apareceria como um branco no cartao de quem encontra o pet.
    if (_nome.text.isNotEmpty && _nome.text.trim().isEmpty) {
      erros[_CamposDosDados.nome] = _TextosDosDados.nomeSoComEspaco;
    }

    final telefoneDigitado = _telefone.text.trim();
    if (telefoneDigitado.isEmpty) {
      // **Apagar o telefone nao da por aqui, e isso e do contrato.**
      // `phone_e164` exige `^\+55\d{10,11}$`: uma string vazia e recusada com
      // 400, e nao ha `null` em `MeUpdate`. Dizer isso e melhor que mandar um
      // corpo que o servidor devolve.
      if (lido?.telefone != null && lido!.telefone!.isNotEmpty) {
        erros[_CamposDosDados.telefone] = _TextosDosDados.telefoneNaoSeApaga;
      }
    } else if (telefoneEmE164(telefoneDigitado) == null) {
      erros[_CamposDosDados.telefone] = _TextosDosDados.telefoneIncompleto;
    }

    final cepDigitado = _soDigitos(_cep.text);
    if (cepDigitado.isEmpty) {
      // Mesma razao do telefone: `postal_code` exige `^\d{5}-?\d{3}$`.
      if (lido?.cep != null && lido!.cep!.isNotEmpty) {
        erros[_CamposDosDados.cep] = _TextosDosDados.cepNaoSeApaga;
      }
    } else if (cepDigitado.length != 8) {
      erros[_CamposDosDados.cep] = _TextosDosDados.cepTemOitoDigitos;
    }

    // `state` tem `minLength: 2`: sem UF escolhida nao ha o que mandar, e
    // apagar a que ja estava la seria 400.
    if (_uf == null && (lido?.uf != null && lido!.uf!.isNotEmpty)) {
      erros[_CamposDosDados.uf] = _TextosDosDados.escolhaOEstado;
    }
    return erros;
  }

  /// O valor a enviar, ou nulo quando **nao mudou**.
  ///
  /// A comparacao e com o que o servidor devolveu, e nao com um campo
  /// "sujo": trocar uma letra e voltar atras deixa o campo tocado e o valor
  /// igual, e mandar igual e escrita sem motivo contra um teto de 60/h.
  String? _seMudou(String agora, String? antes) {
    final anterior = antes ?? '';
    return agora == anterior ? null : agora;
  }

  Future<void> _salvar() async {
    final erros = _conferir();
    if (erros.isNotEmpty) {
      // **Nunca recusa calado.** Cada campo que falta aparece marcado, com o
      // que fazer nele.
      setState(() {
        _erros
          ..clear()
          ..addAll(erros);
        _faixa = null;
        _confirmacao = null;
      });
      return;
    }

    final lido = _lido;
    if (lido == null) return;

    final telefoneDigitado = _telefone.text.trim();
    final novoTelefone = telefoneDigitado.isEmpty
        ? null
        : telefoneEmE164(telefoneDigitado);
    final cepDigitado = _soDigitos(_cep.text);

    final nome = _seMudou(_nome.text.trim(), lido.usuario.nome);
    // **E.164, nunca o que esta na tela.** A mascara e do olho.
    final telefone = novoTelefone == null
        ? null
        : _seMudou(novoTelefone, lido.telefone);
    final cep = cepDigitado.isEmpty
        ? null
        : _seMudou(cepDigitado, _soDigitos(lido.cep ?? ''));
    final bairro = _seMudou(_bairro.text.trim(), lido.bairro);
    final cidade = _seMudou(_cidade.text.trim(), lido.cidade);
    final uf = _uf == null ? null : _seMudou(_uf!, lido.uf);

    if (nome == null &&
        telefone == null &&
        cep == null &&
        bairro == null &&
        cidade == null &&
        uf == null) {
      // Nada mudou. Dizer isso e melhor que um `Salvar` que pisca e nao faz
      // nada -- e melhor que uma escrita vazia contra o teto da conta.
      setState(() {
        _faixa = null;
        _confirmacao = _TextosDosDados.nadaMudou;
      });
      anunciar(context, _TextosDosDados.nadaMudou);
      return;
    }

    setState(() {
      _erros.clear();
      _faixa = null;
      _confirmacao = null;
      _salvando = true;
    });

    try {
      final dados = await Escopo.of(context).me.atualizar(
            nome: nome,
            telefone: telefone,
            cep: cep,
            bairro: bairro,
            cidade: cidade,
            uf: uf,
          );
      if (!mounted) return;
      // A sessao recebe o usuario novo: o `Perfil` mostra o e-mail e as
      // pendencias a partir dela, e sem isto a tela de tras continuaria
      // dizendo que falta o telefone que acabou de ser preenchido.
      await Escopo.of(context).sessao.atualizarUsuario(dados.usuario);
      if (!mounted) return;
      setState(() {
        _lido = dados;
        _confirmacao = _TextosDosDados.salvo;
        _cepJaBuscado = _soDigitos(dados.cep ?? '');
      });
      // **So depois de o servidor responder.** Dizer antes seria afirmar que
      // aconteceu o que pode nao ter acontecido.
      anunciar(context, _TextosDosDados.salvo);
    } on FalhaDeConexao {
      if (!mounted) return;
      setState(
        () => _faixa = const MensagemDeErro(
          texto: MensagensDeErro.semConexaoImpossivel,
        ),
      );
    } on FalhaDeChamada catch (falha) {
      if (!mounted) return;
      setState(() => _faixa = _mensagem(falha));
    } on Object catch (erro, pilha) {
      registrarFalhaInesperada(erro, pilha, onde: 'ao salvar os meus dados');
      if (!mounted) return;
      setState(
        () => _faixa = const MensagemDeErro(texto: MensagensDeErro.servidorFora),
      );
    } finally {
      if (mounted) setState(() => _salvando = false);
    }
  }

  /// **Decide por `tipo`, nunca por status**, como as outras telas do produto.
  ///
  /// Quando o servidor nomeia os campos, a tela os marca: sem isto uma recusa
  /// de campo viraria faixa generica e a pessoa teria de adivinhar qual campo
  /// o servidor recusou.
  MensagemDeErro _mensagem(FalhaDeChamada falha) {
    if (falha is FalhaDaApi &&
        falha.problem.tipo == ProblemTipo.validacaoFalhou &&
        falha.problem.campos.isNotEmpty) {
      final doServidor = <String, String>{};
      for (final campo in falha.problem.campos) {
        final chave = _CamposDosDados.doServidor(campo.campo);
        if (chave != null) {
          doServidor[chave] =
              campo.mensagem ?? _TextosDosDados.confiraEsteCampo;
        }
      }
      if (doServidor.isNotEmpty) {
        setState(() => _erros
          ..clear()
          ..addAll(doServidor));
        return const MensagemDeErro(texto: _TextosDosDados.confiraOsCampos);
      }
    }
    if (falha is FalhaDaApi &&
        falha.problem.tipo == ProblemTipo.limiteDeTentativas) {
      // O teto e de conta, 60 por hora, e e o numero do contrato. O texto nao
      // repete o `Retry-After`: "tente em alguns minutos" e o que se pode
      // dizer de uma janela de uma hora sem mentir sobre o minuto.
      return const MensagemDeErro(texto: _TextosDosDados.tetoAtingido);
    }
    return MensagensDeErro.de(falha);
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: const BarraDeConta(
        titulo: _TextosDosDados.titulo,
        saida: TipoDeSaida.voltar,
        escape: Rotas.perfil,
      ),
      bottomNavigationBar: _fase == _Fase.formulario
          ? BarraDeAcaoFixa(
              acoes: <Widget>[
                BotaoPrimario(
                  rotulo: _TextosDosDados.salvar,
                  carregando: _salvando,
                  aoTocar: _salvar,
                ),
              ],
            )
          : null,
      body: SafeArea(
        child: switch (_fase) {
          _Fase.carregando => const Center(child: CircularProgressIndicator()),
          _Fase.falhaNaLeitura => Padding(
              padding: const EdgeInsets.all(BichuEspaco.e4),
              child: FaixaDeAviso(
                texto: _textoDaFalha ?? MensagensDeErro.servidorFora,
                rotuloDaAcao: _TextosDosDados.atualizar,
                aoTocarNaAcao: _carregar,
              ),
            ),
          _Fase.formulario => _formulario(),
        },
      ),
    );
  }

  Widget _formulario() {
    final textos = Theme.of(context).textTheme;
    final cores = BichuColors.of(context).cores;
    final lido = _lido!;

    return SingleChildScrollView(
      padding: const EdgeInsets.all(BichuEspaco.e4),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: <Widget>[
          _grupo(_TextosDosDados.quemVoceE, textos),
          _campo(
            chave: _CamposDosDados.nome,
            rotulo: _TextosDosDados.nome,
            controlador: _nome,
            limite: 80,
            capitalizacao: TextCapitalization.words,
          ),
          // O E-MAIL, DE LEITURA. Ver o cabecalho desta classe.
          _EmailDeLeitura(
            email: lido.usuario.email,
            verificado: lido.usuario.emailVerificado,
            pendente: lido.usuario.emailPendente,
          ),
          const SizedBox(height: BichuEspaco.e4),
          _campo(
            chave: _CamposDosDados.telefone,
            rotulo: _TextosDosDados.telefone,
            controlador: _telefone,
            limite: limiteDoTelefone,
            tipoDeTeclado: TextInputType.phone,
            exemplo: _TextosDosDados.exemploDoTelefone,
            // Mostra formatado; `telefoneEmE164` e quem envia.
            formatadores: const <TextInputFormatter>[MascaraDeTelefone()],
          ),
          if (lido.telefoneVerificado) ...<Widget>[
            Text(
              _TextosDosDados.telefoneConfirmado,
              style: textos.bodySmall?.copyWith(color: cores.textSecondary),
            ),
            const SizedBox(height: BichuEspaco.e4),
          ],
          _grupo(_TextosDosDados.suaRegiao, textos),
          _campo(
            chave: _CamposDosDados.cep,
            rotulo: _TextosDosDados.cep,
            controlador: _cep,
            limite: limiteDoCep,
            tipoDeTeclado: TextInputType.number,
            // **A mascara, e nao `digitsOnly`** (cliente, 18/10). `limite` e 9
            // porque o `maxLength` do campo conta o hifen.
            //
            // **O que VAI para a API nao muda**: `_soDigitos(_cep.text)` tira
            // o hifen antes de montar o corpo, e `MeUpdate.reference_area.
            // postal_code` aceita `^\d{5}-?\d{3}$` -- com hifen opcional.
            // Continuamos mandando SEM, para as quatro telas guardarem uma
            // forma canonica so.
            formatadores: const <TextInputFormatter>[
              MascaraDeCep(),
            ],
            // No oitavo digito a busca sai sozinha, sem botao `Buscar`: um
            // botao a mais e um passo a mais, e nao buscar e desfecho valido.
            aoMudarTambem: (_) => _buscarOCep(),
          ),
          if (_buscandoOCep || _buscaDoCep != null) ...<Widget>[
            _linhaDaBusca(textos),
            const SizedBox(height: BichuEspaco.e4),
          ],
          _campo(
            chave: _CamposDosDados.bairro,
            rotulo: _TextosDosDados.bairro,
            controlador: _bairro,
            limite: 80,
            capitalizacao: TextCapitalization.words,
          ),
          _campo(
            chave: _CamposDosDados.cidade,
            rotulo: _TextosDosDados.cidade,
            controlador: _cidade,
            limite: 80,
            capitalizacao: TextCapitalization.words,
          ),
          // Os 27, mostrando o nome e enviando a sigla. A lista vem de
          // `estados_brasileiros.dart`; esta tela nao escreve a segunda.
          SeletorDeLista(
            rotulo: _TextosDosDados.estado,
            itens: estadosBrasileiros,
            selecionado: _uf,
            erro: _erros[_CamposDosDados.uf],
            habilitado: !_salvando,
            aoSelecionar: (escolhido) => setState(() {
              _uf = escolhido;
              _erros.remove(_CamposDosDados.uf);
            }),
          ),
          if (_confirmacao != null) ...<Widget>[
            const SizedBox(height: BichuEspaco.e6),
            // VISIVEL, e nao so anunciada: um `Salvar` que nao muda nada na
            // tela e o botao que parece nao funcionar, e o dedo volta nele.
            FaixaDeAviso(
              peso: PesoDaFaixa.informativo,
              texto: _confirmacao!,
            ),
          ],
          if (_faixa != null) ...<Widget>[
            const SizedBox(height: BichuEspaco.e6),
            FaixaDeAviso(texto: _faixa!.texto),
          ],
        ],
      ),
    );
  }

  Widget _grupo(String texto, TextTheme textos) {
    return Padding(
      padding: const EdgeInsets.only(bottom: BichuEspaco.e4),
      child: Semantics(
        header: true,
        child: Text(texto, style: textos.titleMedium),
      ),
    );
  }

  /// Um campo, com o espacamento e o erro no mesmo lugar.
  ///
  /// Existe para os seis campos nao serem seis repeticoes do mesmo bloco:
  /// repeticao e onde um `erro:` fica para tras e um campo passa a recusar
  /// calado.
  Widget _campo({
    required String chave,
    required String rotulo,
    required TextEditingController controlador,
    required int limite,
    String? ajuda,
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
        limite: limite,
        ajuda: ajuda,
        erro: _erros[chave],
        habilitado: !_salvando,
        exemplo: exemplo,
        tipoDeTeclado: tipoDeTeclado,
        capitalizacao: capitalizacao,
        formatadores: formatadores,
        // Digitar e a correcao: o erro sai do campo no primeiro toque, e nao
        // so quando a pessoa tenta salvar de novo.
        aoMudar: (valor) {
          if (_erros.containsKey(chave) || _confirmacao != null) {
            setState(() {
              _erros.remove(chave);
              _confirmacao = null;
            });
          }
          aoMudarTambem?.call(valor);
        },
      ),
    );
  }

  /// A linha que conta o que a busca de CEP fez, e **so isso**: ela nao marca
  /// campo, nao desabilita nada e nao impede o salvar.
  Widget _linhaDaBusca(TextTheme textos) {
    if (_buscandoOCep) {
      return Text(_TextosDosDados.buscandoOCep, style: textos.bodySmall);
    }
    final texto = switch (_buscaDoCep) {
      ResultadoDaBusca.naoEncontrado => _TextosDosDados.cepNaoEncontrado,
      ResultadoDaBusca.indisponivel => _TextosDosDados.buscaIndisponivel,
      _ => null,
    };
    if (texto == null) return const SizedBox.shrink();
    return Text(texto, style: textos.bodySmall);
  }
}

/// O e-mail da conta, de leitura, com a situacao de confirmacao.
///
/// **Nao e um `BichuField` desabilitado**, e a diferenca importa: campo
/// desabilitado se anuncia como campo que algum dia aceita digitacao, e a
/// pessoa fica tocando nele. Aqui e texto, com o papel de leitura dito, e com
/// a frase que diz por onde a troca acontece -- porque nao acontece pelo app.
class _EmailDeLeitura extends StatelessWidget {
  const _EmailDeLeitura({
    required this.email,
    required this.verificado,
    required this.pendente,
  });

  final String email;
  final bool verificado;
  final String? pendente;

  @override
  Widget build(BuildContext context) {
    final cores = BichuColors.of(context).cores;
    final textos = Theme.of(context).textTheme;
    final troca = pendente;

    return Container(
      width: double.infinity,
      padding: const EdgeInsets.all(BichuEspaco.e4),
      decoration: BoxDecoration(
        color: cores.surfaceSunken,
        borderRadius: BorderRadius.circular(BichuRaio.md),
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: <Widget>[
          Text(
            _TextosDosDados.email,
            style: textos.labelLarge?.copyWith(color: cores.textPrimary),
          ),
          const SizedBox(height: BichuEspaco.e1),
          Text(
            email,
            style: textos.bodyLarge?.copyWith(color: cores.textPrimary),
          ),
          const SizedBox(height: BichuEspaco.e2),
          Text(
            verificado
                ? _TextosDosDados.emailConfirmado
                : _TextosDosDados.emailNaoConfirmado,
            style: textos.bodyMedium?.copyWith(
              color: verificado ? cores.success : cores.error,
            ),
          ),
          if (troca != null && troca.isNotEmpty) ...<Widget>[
            const SizedBox(height: BichuEspaco.e1),
            Text(
              _TextosDosDados.trocaEmCurso(troca),
              style: textos.bodyMedium?.copyWith(color: cores.textSecondary),
            ),
          ],
          const SizedBox(height: BichuEspaco.e2),
          Text(
            _TextosDosDados.aTrocaDoEmail,
            style: textos.bodyMedium?.copyWith(color: cores.textSecondary),
          ),
        ],
      ),
    );
  }
}

/// As chaves de campo, iguais dos dois lados.
///
/// A da esquerda e a do formulario; a da direita e a que o servidor manda em
/// `errors[].field` quando recusa (`reference_area/postal_code`, no formato
/// de ponteiro JSON do contrato).
abstract final class _CamposDosDados {
  static const String nome = 'display_name';
  static const String telefone = 'phone_e164';
  static const String cep = 'postal_code';
  static const String bairro = 'neighborhood';
  static const String cidade = 'city';
  static const String uf = 'state';

  static const List<String> todos = <String>[
    nome,
    telefone,
    cep,
    bairro,
    cidade,
    uf,
  ];

  /// A chave do formulario para o que o servidor nomeou, ou nulo quando ele
  /// nomeia um campo que esta tela nao tem.
  ///
  /// Casa pelo ULTIMO segmento: o contrato manda `reference_area/postal_code`
  /// e o formulario chama o campo de `postal_code`.
  static String? doServidor(String campo) {
    final ultimo = campo.split('/').last;
    for (final chave in todos) {
      if (chave == ultimo) return chave;
    }
    return null;
  }
}

/// Os textos da tela, num lugar so.
///
/// **Curtos de proposito**, e sem promessa que ninguem pode cumprir: nao ha
/// prazo de confirmacao de e-mail, nao ha "em breve" e nao ha explicacao de
/// navegacao. Erro diz o que FAZER -- a palavra "invalido" nao aparece em
/// nenhuma linha deste arquivo.
abstract final class _TextosDosDados {
  static const String titulo = 'Meus dados';

  static const String quemVoceE = 'Quem é você';
  static const String suaRegiao = 'Sua região de referência';

  static const String nome = 'Nome';
  static const String nomeSoComEspaco =
      'Escreva o seu nome, ou deixe o campo vazio para tirá-lo.';

  static const String email = 'E-mail';
  static const String emailConfirmado = 'E-mail confirmado';
  static const String emailNaoConfirmado = 'E-mail ainda não confirmado';
  static String trocaEmCurso(String novo) =>
      'Falta confirmar $novo. É para lá que a gente vai avisar.';

  /// A frase que diz por onde a troca acontece, porque ela **nao** acontece
  /// pelo app. Ver o cabecalho de [TelaDadosPessoais].
  static const String aTrocaDoEmail =
      'A troca do e-mail ainda não acontece pelo app. Para trocar, escreva '
      'para oi@bichu.app.';

  static const String telefone = 'Telefone';
  static const String exemploDoTelefone = '(11) 98765-4321';
  static const String telefoneIncompleto =
      'Faltam dígitos. Confira o DDD e o número, como em (11) 98765-4321.';
  static const String telefoneNaoSeApaga =
      'O telefone não pode ser apagado por aqui. Para tirá-lo, escreva para '
      'oi@bichu.app.';
  static const String telefoneConfirmado = 'Telefone confirmado.';

  static const String cep = 'CEP';
  static const String cepTemOitoDigitos = 'O CEP tem 8 dígitos.';
  static const String cepNaoSeApaga =
      'O CEP não pode ser apagado por aqui. Para tirá-lo, escreva para '
      'oi@bichu.app.';
  static const String cepNaoEncontrado =
      'CEP não encontrado. Preencha abaixo.';
  static const String buscandoOCep = 'Buscando o endereço…';
  static const String buscaIndisponivel =
      'Não conseguimos buscar o CEP agora. Preencha abaixo.';

  static const String bairro = 'Bairro';
  static const String cidade = 'Cidade';
  static const String estado = 'Estado';
  static const String escolhaOEstado = 'Escolha o estado.';

  static const String salvar = 'Salvar';
  static const String salvo = 'Dados salvos.';
  static const String nadaMudou = 'Nada mudou desde a última vez.';
  static const String atualizar = 'Atualizar';
  static const String confiraEsteCampo = 'Confira este campo.';
  static const String confiraOsCampos = 'Confira os campos marcados.';
  static const String tetoAtingido =
      'Você salvou muitas vezes seguidas. Tente em alguns minutos.';
}
