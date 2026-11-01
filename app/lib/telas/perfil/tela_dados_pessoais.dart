import 'dart:async';

import 'package:flutter/material.dart';
import 'package:flutter/services.dart';

import '../../acessibilidade/anunciar.dart';
import '../../api/conexoes_api.dart';
import '../../api/modelos_conexao.dart';
import '../../api/modelos_passkey.dart';
import '../../api/convites_api.dart';
import '../../formato/apelido.dart';
import '../../formato/cep.dart';
import '../../formato/quando.dart';
import '../../api/envio_de_foto.dart';
import '../../api/estados_brasileiros.dart';
import '../../api/falhas.dart';
import '../../api/me_api.dart';
import '../../api/mensagens_de_erro.dart';
import '../../api/problem.dart';
import '../../dispositivo/camera_e_galeria.dart';
import '../../escopo.dart';
import '../../formulario/bloco_de_cep.dart';
import '../../roteamento/saida_da_mensagem.dart';
import '../../sessao/fiacao_do_passkey.dart';
import '../../formato/telefone.dart';
import '../../roteamento/rotas.dart';
import '../../theme/bichu_colors.dart';
import '../../theme/bichu_tokens.g.dart';
import '../../widgets/barra_de_acao_fixa.dart';
import '../../widgets/bichu_field.dart';
import '../../widgets/botao_primario.dart';
import '../../widgets/faixa_de_aviso.dart';
import '../../widgets/folha_destrutiva.dart';
import '../../widgets/imagem_da_rede.dart';
import '../../widgets/moldura.dart';
import '../../widgets/previa_da_foto.dart';
import '../../widgets/recorte_de_imagem.dart';
import '../../widgets/qr_do_convite.dart';
import '../../widgets/saida_da_tela.dart';
import '../../widgets/selo_de_validado.dart';
import '../../widgets/seletor_de_lista.dart';
import '../../widgets/trilha_de_convites.dart';

/// `Perfil` › `Meus dados`: os dados pessoais do tutor.
class TelaDadosPessoais extends StatefulWidget {
  const TelaDadosPessoais({super.key});

  /// O nome da secao, e o rotulo da linha que a abre.
  static const String tituloDoConvite = 'Meu QR de convite';

  /// A linha de apoio da secao recolhida.
  static const String apoioDoConvite =
      'Para quem tem pet e ainda não está no Bichu';

  /// **O QR É APP-PARA-APP, e a secao diz isso em voz alta** (decisão de
  /// 21/10/2026, e a frase viajou intacta de `Convide tutores`).
  static const String oQrEDeAppParaApp =
      'Peça para o usuário abrir o Bichu e escanear daqui. A câmera comum do '
      'celular não abre este código.';

  /// A ação de emitir, para quem ainda não tem convite nesta sessão.
  static const String criarOConvite = 'Criar o meu QR de convite';

  /// O que a secao diz antes de haver QR nesta sessão.
  static const String semConviteAgora =
      'Você não tem QR de convite valendo agora.';

  /// **O QR não é lido de volta, e por isso ele não sobrevive a fechar a
  /// seção.**
  static const String oQrNaoVoltaDepois =
      'O QR aparece aqui enquanto esta seção estiver aberta. Ao voltar, toque '
      'em criar de novo — o anterior deixa de valer.';

  /// O PLACAR, EM UMA LINHA. **Ele viajou junto por decisao do cliente de
  /// 28/10/2026**, e nao por zelo meu.
  static String placarDeQuemEntrou(int quantos) => quantos == 1
      ? '1 tutor entrou no Bichu pelo seu convite.'
      : '$quantos tutores entraram no Bichu pelo seu convite.';

  /// O prazo em palavras. **`QuandoNaLista.diaEMes` e nao uma data crua**: o
  /// convite vale 30 dias, entao dia e mes bastam.
  static String valeAte(DateTime quando) =>
      'Vale até ${QuandoNaLista.diaEMes(quando)}.';

  /// O nome da secao do login por digital.
  static const String tituloDoPasskey = 'Login por digital';

  /// O apoio da secao: o que ela faz, numa linha.
  static const String apoioDoPasskey =
      'Entre usando a digital, o rosto ou o desbloqueio do aparelho.';

  /// A acao de ligar, para quem nao tem credencial neste aparelho.
  static const String ativarOPasskey = 'Ativar o login por digital';

  /// O ESTADO de quem ja tem credencial aqui.
  static const String passkeyAtivado =
      'O login por digital está ativo neste aparelho.';

  /// O ESTADO DO MEIO, e ele e o que mais erra.
  static const String passkeyNaContaNaoNesteAparelho =
      'Você já tem login por digital nesta conta, mas ainda não neste '
      'aparelho. Entre com a senha uma vez e ele passa a valer aqui.';

  /// APARELHO SEM BIOMETRIA. **Estado normal, e nao erro**: o cliente foi
  /// explicito, e a pessoa nao pode ver uma promessa que o sistema vai negar.
  static const String passkeyIndisponivel =
      'Este aparelho não oferece login por digital. É preciso ter bloqueio de '
      'tela configurado.';

  /// A falha de ATIVAR. Uma frase, e ela nao culpa a pessoa.
  static const String falhaAoAtivarOPasskey =
      'Não conseguimos ativar agora. Tente de novo.';

  /// O cabecalho da lista de aparelhos.
  static const String aparelhosComPasskey = 'Aparelhos com login por digital';

  /// A acao em CADA linha. Curta porque ela se repete; quem diz sobre QUAL
  /// aparelho ela age e [desativarNesteAparelho], o nome acessivel.
  static const String desativarOPasskey = 'Desativar';

  /// O nome que o LEITOR DE TELA diz no botao da linha.
  static String desativarNesteAparelho(String aparelho) =>
      'Desativar o login por digital de $aparelho';

  /// A credencial que chegou **sem `label`**, dita pela data.
  static String credencialSemRotulo(String data) => 'Cadastrado em $data';

  /// Quando a credencial foi usada por ultimo, ou que nunca foi.
  static String usadaPorUltimo(String? data) =>
      data == null ? 'Nunca usada para entrar' : 'Última entrada em $data';

  /// O TITULO da folha destrutiva.
  static const String tituloDaDesativacao = 'Desativar o login por digital?';

  /// O CORPO da folha. Ele diz a consequencia **e a saida**: a senha continua
  /// valendo, e isso nao e consolo -- e a decisao 1 da BICHUS-301, e sem a
  /// frase a pessoa pode achar que vai perder o acesso a conta.
  static const String corpoDaDesativacao =
      'Você continua entrando com a sua senha, como sempre. Se quiser o login '
      'por digital de volta, basta ativar de novo.';

  /// O QUE SOME, em marcadores.
  static const List<String> oQueSomeNaDesativacao = <String>[
    'A entrada sem senha neste aparelho',
    'A credencial guardada no seu aparelho deixa de valer no Bichu',
  ];

  /// O rotulo do botao destrutivo da folha.
  static const String confirmarADesativacao = 'Desativar o login por digital';

  /// O nome acessivel do botao destrutivo.
  static const String rotuloAcessivelDeDesativar =
      'Confirmar e desativar o login por digital';

  /// A falha de DESATIVAR. Uma frase, e ela nao culpa a pessoa.
  static const String falhaAoDesativar =
      'Não conseguimos desativar agora. Tente de novo.';

  @override
  State<TelaDadosPessoais> createState() => _TelaDadosPessoaisState();
}

enum _Fase { carregando, formulario, falhaNaLeitura }

class _TelaDadosPessoaisState extends State<TelaDadosPessoais> {
  final TextEditingController _nome = TextEditingController();
  final TextEditingController _apelido = TextEditingController();
  final TextEditingController _telefone = TextEditingController();
  final TextEditingController _bairro = TextEditingController();
  final TextEditingController _cidade = TextEditingController();

  String? _uf;

  late final BlocoDeCep _cepBloco = BlocoDeCep(
    atualizar: setState,
    montado: () => mounted,
    destino: DestinoDoCep(
      bairro: _bairro,
      chaveDoBairro: _CamposDosDados.bairro,
      cidade: _cidade,
      chaveDaCidade: _CamposDosDados.cidade,
      chaveDoEstado: _CamposDosDados.uf,
      estadoEscolhido: () => _uf,
      aoEscolherEstado: (sigla) => _uf = sigla,
      aoPreencher: _erros.remove,
    ),
  );

  static const TextosDaBuscaDeCep _textosDaBusca = TextosDaBuscaDeCep(
    indisponivel: _TextosDosDados.buscaIndisponivel,
  );

  DadosPessoais? _lido;

  _Fase _fase = _Fase.carregando;
  bool _salvando = false;
  String? _textoDaFalha;
  String? _confirmacao;
  MensagemDeErro? _faixa;

  final Map<String, String> _erros = <String, String>{};

  FotoLocal? _fotoEscolhida;

  String? _uploadDaFoto;

  EstadoDaPermissao _permissaoDaCamera = EstadoDaPermissao.negada;

  bool _enviandoAFoto = false;

  bool _carregou = false;

  @override
  void didChangeDependencies() {
    super.didChangeDependencies();
    if (_carregou) return;
    _carregou = true;
    _carregar();
    _lerAPermissaoDaCamera();
  }

  Future<void> _lerAPermissaoDaCamera() async {
    final estado = await Escopo.of(context).camera.estadoDaCamera();
    if (!mounted) return;
    setState(() => _permissaoDaCamera = estado);
  }

  Future<void> _tirarAFoto() async {
    final camera = Escopo.of(context).camera;
    var estado = _permissaoDaCamera;
    if (estado == EstadoDaPermissao.negada) {
      estado = await camera.pedirCamera();
      if (!mounted) return;
      setState(() => _permissaoDaCamera = estado);
    }
    if (estado != EstadoDaPermissao.concedida) return;
    final foto = await camera.tirarFoto();
    if (!mounted || foto == null) return;
    final ajustada = await _ajustar(camera, foto);
    if (!mounted || ajustada == null) return;
    await _escolheu(ajustada);
  }

  Future<void> _escolherDaGaleria() async {
    final camera = Escopo.of(context).camera;
    final foto = await camera.escolherDaGaleria();
    if (!mounted || foto == null) return;
    final ajustada = await _ajustar(camera, foto);
    if (!mounted || ajustada == null) return;
    await _escolheu(ajustada);
  }

  Future<FotoLocal?> _ajustar(CameraEGaleria camera, FotoLocal foto) =>
      ajustarAFoto(
        context,
        camera: camera,
        foto: foto,
        formato: FormatoDoRecorte.fotoDeUsuario,
        titulo: 'Ajuste a sua foto',
      );

  Future<void> _abrirOsAjustes() =>
      Escopo.of(context).camera.abrirAjustesDoSistema();

  Future<void> _escolheu(FotoLocal foto) async {
    final recusa = recusaDeTipoDaFoto(foto.tipoDeConteudo, tiposDeFotoAceitos);
    if (recusa != null) {
      setState(() {
        _fotoEscolhida = null;
        _uploadDaFoto = null;
        _confirmacao = null;
        _faixa = MensagemDeErro(texto: recusa);
      });
      anunciar(context, recusa);
      return;
    }

    setState(() {
      _fotoEscolhida = foto;
      _uploadDaFoto = null;
      _faixa = null;
      _confirmacao = null;
      _enviandoAFoto = true;
    });

    final escopo = Escopo.of(context);
    final destino =
        EnvioParaConfirmarDepois(pedir: escopo.me.intencaoDeFotoDoUsuario);
    final desfecho = await escopo.envioDeFoto.enviar(
      foto: foto,
      destino: destino,
    );
    if (!mounted) return;

    setState(() {
      _enviandoAFoto = false;
      switch (desfecho) {
        case DesfechoDoEnvio.enviada:
          _uploadDaFoto = destino.uploadId;
          _confirmacao = _TextosDosDados.fotoProntaParaSalvar;
        case DesfechoDoEnvio.semSinal:
          _fotoEscolhida = null;
          _faixa = const MensagemDeErro(texto: _TextosDosDados.fotoSemSinal);
        case DesfechoDoEnvio.recusada:
          _fotoEscolhida = null;
          _faixa = const MensagemDeErro(texto: _TextosDosDados.fotoRecusada);
      }
    });
    if (!mounted) return;
    anunciar(
      context,
      desfecho == DesfechoDoEnvio.enviada
          ? _TextosDosDados.fotoProntaParaSalvar
          : (_faixa?.texto ?? ''),
    );
  }

  @override
  void dispose() {
    for (final c in <TextEditingController>[
      _nome,
      _apelido,
      _telefone,
      _bairro,
      _cidade,
    ]) {
      c.dispose();
    }
    _cepBloco.dispose();
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
        _apelido.text = dados.apelido ?? '';
        _telefone.text = telefoneDoE164(dados.telefone);
        _cepBloco.cep.text = mascaraDeCep(dados.cep ?? '');
        _bairro.text = dados.bairro ?? '';
        _cidade.text = dados.cidade ?? '';
        _uf = (dados.uf != null && dados.uf!.length == 2) ? dados.uf : null;
        _cepBloco.naoBuscarDeNovo(dados.cep ?? '');
        _fase = _Fase.formulario;
      });
    } on FalhaDeChamada catch (falha) {
      if (!mounted) return;
      setState(() {
        _textoDaFalha = MensagensDeErro.de(falha).texto;
        _fase = _Fase.falhaNaLeitura;
      });
    } on Object catch (erro, pilha) {
      registrarFalhaInesperada(erro, pilha, onde: 'ao ler os meus dados');
      if (!mounted) return;
      setState(() {
        _textoDaFalha = MensagensDeErro.servidorFora;
        _fase = _Fase.falhaNaLeitura;
      });
    }
  }

  static String _soDigitos(String bruto) => bruto.replaceAll(RegExp(r'\D'), '');

  Map<String, String> _conferir() {
    final erros = <String, String>{};
    final lido = _lido;

    if (_nome.text.trim().isEmpty) {
      erros[_CamposDosDados.nome] = _TextosDosDados.nomePrecisaDeTexto;
    }

    final apelidoDigitado = _apelido.text.trim();
    final apelidoLido = lido?.apelido ?? '';
    if (apelidoDigitado.isEmpty) {
      if (apelidoLido.isNotEmpty) {
        erros[_CamposDosDados.apelido] = _TextosDosDados.apelidoNaoSeApaga;
      }
    } else {
      final recusa = IdentificadorDoApelido.recusa(apelidoDigitado);
      if (recusa != null) {
        final saidas = IdentificadorDoApelido.sugestoes(apelidoDigitado);
        erros[_CamposDosDados.apelido] =
            saidas.isEmpty ? recusa : '$recusa Tente ${saidas.join(', ')}.';
      }
    }

    final telefoneDigitado = _telefone.text.trim();
    if (telefoneDigitado.isEmpty) {
      if (lido?.telefone != null && lido!.telefone!.isNotEmpty) {
        erros[_CamposDosDados.telefone] = _TextosDosDados.telefoneNaoSeApaga;
      }
    } else if (telefoneEmE164(telefoneDigitado) == null) {
      erros[_CamposDosDados.telefone] = _TextosDosDados.telefoneIncompleto;
    }

    final cepDigitado = _soDigitos(_cepBloco.cep.text);
    if (cepDigitado.isEmpty) {
      if (lido?.cep != null && lido!.cep!.isNotEmpty) {
        erros[_CamposDosDados.cep] = _TextosDosDados.cepNaoSeApaga;
      }
    } else if (cepDigitado.length != 8) {
      erros[_CamposDosDados.cep] = _TextosDosDados.cepTemOitoDigitos;
    }

    if (_uf == null && (lido?.uf != null && lido!.uf!.isNotEmpty)) {
      erros[_CamposDosDados.uf] = _TextosDosDados.escolhaOEstado;
    }
    return erros;
  }

  String? _seMudou(String agora, String? antes) {
    final anterior = antes ?? '';
    return agora == anterior ? null : agora;
  }

  Future<void> _salvar() async {
    final erros = _conferir();
    if (erros.isNotEmpty) {
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

    if (_enviandoAFoto) {
      setState(() {
        _confirmacao = null;
        _faixa = const MensagemDeErro(texto: _TextosDosDados.fotoAindaSubindo);
      });
      anunciar(context, _TextosDosDados.fotoAindaSubindo);
      return;
    }

    final telefoneDigitado = _telefone.text.trim();
    final novoTelefone = telefoneDigitado.isEmpty
        ? null
        : telefoneEmE164(telefoneDigitado);
    final cepDigitado = _soDigitos(_cepBloco.cep.text);

    final nome = _seMudou(_nome.text.trim(), lido.usuario.nome);
    final apelido = _seMudou(
      apelidoParaOContrato(_apelido.text) ?? '',
      lido.apelido,
    );
    final telefone = novoTelefone == null
        ? null
        : _seMudou(novoTelefone, lido.telefone);
    final cep = cepDigitado.isEmpty
        ? null
        : _seMudou(cepDigitado, _soDigitos(lido.cep ?? ''));
    final bairro = _seMudou(_bairro.text.trim(), lido.bairro);
    final cidade = _seMudou(_cidade.text.trim(), lido.cidade);
    final uf = _uf == null ? null : _seMudou(_uf!, lido.uf);

    final fotoParaGravar = _uploadDaFoto;

    if (nome == null &&
        apelido == null &&
        telefone == null &&
        cep == null &&
        bairro == null &&
        cidade == null &&
        uf == null &&
        fotoParaGravar == null) {
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
            apelido: apelido,
            telefone: telefone,
            cep: cep,
            bairro: bairro,
            cidade: cidade,
            uf: uf,
            fotoUpload: fotoParaGravar,
          );
      if (!mounted) return;
      await Escopo.of(context).sessao.atualizarUsuario(dados.usuario);
      if (!mounted) return;
      setState(() {
        _lido = dados;
        _confirmacao = _TextosDosDados.salvo;
        _cepBloco.naoBuscarDeNovo(dados.cep ?? '');
        if (fotoParaGravar != null) {
          _fotoEscolhida = null;
          _uploadDaFoto = null;
        }
      });
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

    return AutofillGroup(
      child: SingleChildScrollView(
      padding: const EdgeInsets.all(BichuEspaco.e4),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: <Widget>[
          _grupo(_TextosDosDados.quemVoceE, textos),
          _BlocoDaFoto(
            fotoDoServidor: lido.fotoUrl,
            processando: lido.fotoProcessando,
            recusada: lido.fotoRecusada,
            motivoDaRecusa: lido.motivoDaRecusaDaFoto,
            escolhida: _fotoEscolhida,
            validado: lido.usuario.canalConfirmado,
            permissao: _permissaoDaCamera,
            enviando: _enviandoAFoto,
            aoTirar: _tirarAFoto,
            aoEscolher: _escolherDaGaleria,
            aoAbrirAjustes: _abrirOsAjustes,
          ),
          const SizedBox(height: BichuEspaco.e6),
          _campo(
            chave: _CamposDosDados.nome,
            autofill: const <String>[AutofillHints.name],
            acaoDeTeclado: TextInputAction.next,
            rotulo: _TextosDosDados.nome,
            controlador: _nome,
            limite: 80,
            tipoDeTeclado: TextInputType.name,
            capitalizacao: TextCapitalization.words,
          ),
          _campo(
            chave: _CamposDosDados.apelido,
            acaoDeTeclado: TextInputAction.next,
            rotulo: _TextosDosDados.apelido,
            controlador: _apelido,
            limite: maximoDoApelido,
            exemplo: 'maria-silva',
            formatadores: const <TextInputFormatter>[FiltroDeApelido()],
          ),
          _EmailDeLeitura(
            email: lido.usuario.email,
            verificado: lido.usuario.emailVerificado,
            pendente: lido.usuario.emailPendente,
          ),
          const SizedBox(height: BichuEspaco.e4),
          _campo(
            chave: _CamposDosDados.telefone,
            autofill: const <String>[AutofillHints.telephoneNumber],
            acaoDeTeclado: TextInputAction.next,
            rotulo: _TextosDosDados.telefone,
            controlador: _telefone,
            limite: limiteDoTelefone,
            tipoDeTeclado: TextInputType.phone,
            exemplo: _TextosDosDados.exemploDoTelefone,
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
            autofill: const <String>[AutofillHints.postalCode],
            acaoDeTeclado: TextInputAction.next,
            rotulo: _TextosDosDados.cep,
            controlador: _cepBloco.cep,
            limite: limiteDoCep,
            tipoDeTeclado: TextInputType.number,
            formatadores: formatadoresDeCep,
            aoMudarTambem: (_) =>
                _cepBloco.buscar(Escopo.of(context).buscaDeCep),
          ),
          if (_cepBloco.temDesfecho) ...<Widget>[
            LinhaDaBuscaDeCep(
              bloco: _cepBloco,
              textos: _textosDaBusca,
              estilo: textos.bodySmall,
            ),
            const SizedBox(height: BichuEspaco.e4),
          ],
          _campo(
            chave: _CamposDosDados.bairro,
            autofill: const <String>[AutofillHints.sublocality],
            acaoDeTeclado: TextInputAction.next,
            rotulo: _TextosDosDados.bairro,
            controlador: _bairro,
            limite: 80,
            capitalizacao: TextCapitalization.words,
          ),
          _campo(
            chave: _CamposDosDados.cidade,
            autofill: const <String>[AutofillHints.addressCity],
            acaoDeTeclado: TextInputAction.done,
            rotulo: _TextosDosDados.cidade,
            controlador: _cidade,
            limite: 80,
            capitalizacao: TextCapitalization.words,
          ),
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
            FaixaDeAviso(
              peso: PesoDaFaixa.informativo,
              texto: _confirmacao!,
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
          const SizedBox(height: BichuEspaco.e6),
          const SizedBox(height: BichuEspaco.e6),
          const _BlocoDoPasskey(),
          const SizedBox(height: BichuEspaco.e6),
          _BlocoDoConvite(
            conexoes: Escopo.of(context).conexoes,
            convites: Escopo.of(context).convites,
          ),
        ],
      ),
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

  Widget _campo({
    required String chave,
    required String rotulo,
    required TextEditingController controlador,
    required int limite,
    required TextInputAction acaoDeTeclado,
    /// As dicas de preenchimento do SISTEMA (iOS e Android).
    List<String> autofill = const <String>[],
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
        autofill: autofill,
        limite: limite,
        ajuda: ajuda,
        erro: _erros[chave],
        habilitado: !_salvando,
        exemplo: exemplo,
        tipoDeTeclado: tipoDeTeclado,
        capitalizacao: capitalizacao,
        formatadores: formatadores,
        acaoDeTeclado: acaoDeTeclado,
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

}

/// A foto da propria pessoa: o retrato, o selo em cima dele, e as acoes.
class _BlocoDaFoto extends StatelessWidget {
  const _BlocoDaFoto({
    required this.fotoDoServidor,
    required this.processando,
    required this.recusada,
    required this.motivoDaRecusa,
    required this.escolhida,
    required this.validado,
    required this.permissao,
    required this.enviando,
    required this.aoTirar,
    required this.aoEscolher,
    required this.aoAbrirAjustes,
  });

  final String? fotoDoServidor;
  final bool processando;

  /// `Me.photo.status == 'rejected'`.
  final bool recusada;

  /// `Me.photo.rejection_reason`, **o texto do servidor**.
  final String? motivoDaRecusa;

  final FotoLocal? escolhida;

  /// `Me.contact_channel_verified`.
  final bool validado;

  final EstadoDaPermissao permissao;

  /// Os bytes da foto escolhida estao subindo **agora**, no toque do seletor.
  final bool enviando;

  final VoidCallback aoTirar;
  final VoidCallback aoEscolher;
  final VoidCallback aoAbrirAjustes;

  /// O lado do quadrado. Ver a prosa desta classe.
  static const double lado = BichuMoldura.larguraFotoLg;

  @override
  Widget build(BuildContext context) {
    final cores = BichuColors.of(context).cores;
    final textos = Theme.of(context).textTheme;
    final local = escolhida;
    final remota = fotoDoServidor;
    final temImagem = local != null || remota != null;

    return Column(
      crossAxisAlignment: CrossAxisAlignment.stretch,
      children: <Widget>[
        Align(
          alignment: Alignment.centerLeft,
          child: SizedBox(
            width: lado,
            height: lado,
            child: Stack(
              children: <Widget>[
                Positioned.fill(child: _retrato(local, remota, cores)),
                if (validado && temImagem)
                  Positioned(
                    right: BichuEspaco.e1,
                    bottom: BichuEspaco.e1,
                    child: _SeloDeValidado(),
                  ),
              ],
            ),
          ),
        ),
        const SizedBox(height: BichuEspaco.e3),
        Text(
          orientacaoDeTamanhoDaImagem,
          style: textos.bodySmall?.copyWith(color: cores.textSecondary),
        ),
        const SizedBox(height: BichuEspaco.e3),
        if (permissao == EstadoDaPermissao.negadaPermanentemente) ...<Widget>[
          FaixaDeAviso(
            peso: PesoDaFaixa.informativo,
            texto: _TextosDosDados.cameraNosAjustes,
            rotuloDaAcao: _TextosDosDados.abrirAjustes,
            aoTocarNaAcao: aoAbrirAjustes,
          ),
          const SizedBox(height: BichuEspaco.e3),
        ],
        if (permissao != EstadoDaPermissao.indisponivel) ...<Widget>[
          BotaoSecundario(
            rotulo: _TextosDosDados.tirarFoto,
            aoTocar: enviando ? null : aoTirar,
          ),
          const SizedBox(height: BichuEspaco.e2),
        ],
        OutlinedButton(
          onPressed: enviando ? null : aoEscolher,
          style: OutlinedButton.styleFrom(
            minimumSize: const Size.fromHeight(BichuAlvoDeToque.min),
          ),
          child: const Text(_TextosDosDados.escolherDaGaleria),
        ),
        if (recusada && (motivoDaRecusa ?? '').isNotEmpty) ...<Widget>[
          const SizedBox(height: BichuEspaco.e3),
          FaixaDeAviso(texto: motivoDaRecusa!),
        ],
      ],
    );
  }

  Widget _retrato(FotoLocal? local, String? remota, BichuCores cores) {
    if (local != null) {
      return PreviaDaFoto(
        foto: local,
        descricao: _TextosDosDados.aFotoEscolhida,
        altura: lado,
      );
    }
    if (remota != null) {
      return ImagemDaRede(
        url: remota,
        descricao: _TextosDosDados.aSuaFoto,
        largura: lado,
        raio: BichuRaio.lg,
        simboloDeFalha: Icons.person_outline,
      );
    }
    return _QuadradoSemFoto(cores: cores, processando: processando);
  }
}

/// O lugar da foto quando nao ha foto -- **nos tres casos de ausencia**.
class _QuadradoSemFoto extends StatelessWidget {
  const _QuadradoSemFoto({required this.cores, required this.processando});

  final BichuCores cores;

  /// `Me.photo.status == 'processing'`: a foto JA subiu e a derivada ainda nao
  /// existe.
  final bool processando;

  @override
  Widget build(BuildContext context) {
    return Container(
      alignment: Alignment.center,
      decoration: BoxDecoration(
        color: cores.surfaceSunken,
        borderRadius: BorderRadius.circular(BichuRaio.lg),
        border: Border.all(color: cores.outline, width: BichuBorda.hairline),
      ),
      child: Semantics(
        label: processando ? _TextosDosDados.processandoAFoto : null,
        child: Icon(
          processando ? Icons.hourglass_top : Icons.person_outline,
          size: BichuEspaco.e10,
          color: cores.textMuted,
        ),
      ),
    );
  }
}

/// O selo de validado do DONO, **sobre** a foto.
class _SeloDeValidado extends StatelessWidget {
  @override
  Widget build(BuildContext context) {
    final cores = BichuColors.of(context).cores;
    return Semantics(
      label: SeloDeValidado.rotulo,
      child: Container(
        padding: const EdgeInsets.all(BichuEspaco.e1),
        decoration: BoxDecoration(
          color: cores.surface,
          shape: BoxShape.circle,
        ),
        child: Icon(
          Icons.verified,
          size: BichuEspaco.e6,
          color: cores.success,
        ),
      ),
    );
  }
}

/// O e-mail da conta, de leitura, com a situacao de confirmacao.
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

abstract final class _CamposDosDados {
  static const String nome = 'display_name';
  static const String apelido = 'handle';
  static const String telefone = 'phone_e164';
  static const String cep = 'postal_code';
  static const String bairro = 'neighborhood';
  static const String cidade = 'city';
  static const String uf = 'state';

  static const List<String> todos = <String>[
    nome,
    apelido,
    telefone,
    cep,
    bairro,
    cidade,
    uf,
  ];

  /// A chave do formulario para o que o servidor nomeou, ou nulo quando ele
  /// nomeia um campo que esta tela nao tem.
  static String? doServidor(String campo) {
    final ultimo = campo.split('/').last;
    for (final chave in todos) {
      if (chave == ultimo) return chave;
    }
    return null;
  }
}

abstract final class _TextosDosDados {

  static const String apelido = 'Apelido';

  /// A recusa de quem JA TEM apelido e esvaziou o campo.
  static const String apelidoNaoSeApaga =
      'O apelido não pode ser apagado. Você pode trocá-lo por outro.';

  static const String titulo = 'Meus dados';

  static const String quemVoceE = 'Quem é você';
  static const String suaRegiao = 'Sua região de referência';

  static const String nome = 'Nome';
  static const String nomePrecisaDeTexto = 'Digite o nome que você quer usar no Bichu.';

  static const String tirarFoto = 'Tirar foto';
  static const String escolherDaGaleria = 'Escolher da galeria';

  /// O rotulo do retrato que ja esta na conta, para quem nao ve a imagem.
  static const String aSuaFoto = 'A sua foto';

  /// O rotulo da previa do arquivo que acabou de ser escolhido.
  static const String aFotoEscolhida = 'A foto que você escolheu';

  /// O rotulo do simbolo de processamento no lugar da foto.
  static const String processandoAFoto = 'Processando a foto';

  static const String cameraNosAjustes =
      'A câmera está bloqueada para o Bichu. Dá para liberar nos ajustes do '
      'sistema.';
  static const String abrirAjustes = 'Abrir os ajustes';

  /// O desfecho da escolha: os bytes JA subiram, e falta o `Salvar`.
  static const String fotoProntaParaSalvar =
      'Foto enviada. Toque em Salvar para guardá-la no seu cadastro.';

  /// O `Salvar` chegou antes de os bytes terminarem.
  static const String fotoAindaSubindo =
      'A foto ainda está subindo. Toque em Salvar de novo em instantes.';

  /// **Sem promessa de fila.** A `RetomadaDeFotos` e do pet; esta foto nao
  /// entra em fila nenhuma, e dizer "ela sai sozinha quando o sinal voltar"
  /// seria afirmar um envio que ninguem vai tentar.
  static const String fotoSemSinal =
      'Sem conexão para enviar a foto. Escolha a foto de novo quando o sinal '
      'voltar.';

  static const String fotoRecusada =
      'O envio da foto foi recusado. Escolha outra foto.';

  static const String email = 'E-mail';
  static const String emailConfirmado = 'E-mail confirmado';
  static const String emailNaoConfirmado = 'E-mail ainda não confirmado';
  static String trocaEmCurso(String novo) =>
      'Falta confirmar $novo. É para lá que a gente vai avisar.';

  /// A frase que diz por onde a troca acontece, porque ela **nao** acontece
  /// pelo app.
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
  /// O terceiro desfecho da busca de CEP; os outros dois vivem em
  /// `TextosDaBuscaDeCep`, no bloco compartilhado.
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

/// A SECAO DO CONVITE dentro de `Meus dados` -- o QR e o placar, recolhidos.
class _BlocoDoConvite extends StatefulWidget {
  const _BlocoDoConvite({required this.conexoes, required this.convites});

  final ConexoesApi conexoes;
  final ConvitesApi convites;

  @override
  State<_BlocoDoConvite> createState() => _EstadoDoBlocoDoConvite();
}

class _EstadoDoBlocoDoConvite extends State<_BlocoDoConvite> {
  bool _aberta = false;
  ConviteEmitido? _convite;
  bool _emitindo = false;
  String? _falha;

  int? _placar;

  Future<void> _lerOPlacar() async {
    try {
      final resumo = await widget.conexoes.resumo();
      if (!mounted) return;
      setState(() => _placar = resumo.invitedJoinedCount);
    } on Object catch (erro) {
      if (!mounted) return;
      if (erro is! FalhaDeChamada) {
        // **SILENCIO DELIBERADO, e nao esquecimento** -- o mesmo arranjo de `FiacaoDoPasskey.reconciliarComAConta`, e pela mesma razao.
      }
      setState(() => _placar = null);
    }
  }

  void _alternar() {
    final vaiAbrir = !_aberta;
    setState(() => _aberta = vaiAbrir);
    if (vaiAbrir && _placar == null) unawaited(_lerOPlacar());
  }

  Future<void> _emitir() async {
    if (_emitindo) return;
    setState(() {
      _emitindo = true;
      _falha = null;
    });
    try {
      final convite = await widget.convites.emitir();
      if (!mounted) return;
      setState(() {
        _convite = convite;
        _emitindo = false;
      });
    } on FalhaDeChamada catch (falha) {
      if (!mounted) return;
      setState(() {
        _emitindo = false;
        _falha = MensagensDeErro.de(falha).texto;
      });
    }
  }

  @override
  Widget build(BuildContext context) {
    final cores = BichuColors.of(context).cores;

    return Container(
      decoration: BoxDecoration(
        color: cores.surfaceSunken,
        borderRadius: BorderRadius.circular(BichuRaio.md),
        border: Border.all(color: cores.outline, width: BichuBorda.hairline),
      ),
      padding: const EdgeInsets.all(BichuEspaco.e4),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: <Widget>[
          _cabecalho(cores),
          if (_aberta) ..._conteudo(cores),
        ],
      ),
    );
  }

  Widget _cabecalho(BichuCores cores) {
    final textos = Theme.of(context).textTheme;
    return Semantics(
      button: true,
      expanded: _aberta,
      excludeSemantics: true,
      label: '${TelaDadosPessoais.tituloDoConvite}. '
          '${TelaDadosPessoais.apoioDoConvite}',
      onTap: _alternar,
      child: InkWell(
        onTap: _alternar,
        borderRadius: BorderRadius.circular(BichuRaio.sm),
        child: Container(
          constraints: const BoxConstraints(minHeight: BichuAlvoDeToque.min),
          child: Row(
            children: <Widget>[
              Expanded(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  mainAxisAlignment: MainAxisAlignment.center,
                  children: <Widget>[
                    Text(
                      TelaDadosPessoais.tituloDoConvite,
                      style: textos.titleMedium?.copyWith(
                        color: cores.textPrimary,
                      ),
                    ),
                    const SizedBox(height: BichuEspaco.e1),
                    Text(
                      TelaDadosPessoais.apoioDoConvite,
                      style: textos.bodyMedium?.copyWith(
                        color: cores.textSecondary,
                      ),
                    ),
                  ],
                ),
              ),
              const SizedBox(width: BichuEspaco.e2),
              Icon(
                _aberta ? Icons.expand_less : Icons.expand_more,
                color: cores.textSecondary,
                semanticLabel: '',
              ),
            ],
          ),
        ),
      ),
    );
  }

  List<Widget> _conteudo(BichuCores cores) {
    final textos = Theme.of(context).textTheme;
    final convite = _convite;
    final falha = _falha;
    final quantos = _placar;

    return <Widget>[
      const SizedBox(height: BichuEspaco.e4),
      if (falha != null) ...<Widget>[
        FaixaDeAviso(texto: falha),
        const SizedBox(height: BichuEspaco.e4),
      ],
      if (convite != null) ...<Widget>[
        Center(child: QrDoConvite(token: convite.inviteToken)),
        const SizedBox(height: BichuEspaco.e4),
        Text(
          TelaDadosPessoais.oQrEDeAppParaApp,
          style: textos.bodyMedium?.copyWith(color: cores.textPrimary),
        ),
        const SizedBox(height: BichuEspaco.e3),
        Text(
          TelaDadosPessoais.valeAte(convite.expiresAt),
          style: textos.bodyMedium?.copyWith(color: cores.textSecondary),
        ),
      ] else
        Text(
          TelaDadosPessoais.semConviteAgora,
          style: textos.bodyMedium?.copyWith(color: cores.textSecondary),
        ),
      if (quantos != null) ...<Widget>[
        const SizedBox(height: BichuEspaco.e4),
        Row(
          children: <Widget>[
            Icon(
              Icons.volunteer_activism_outlined,
              size: 20,
              color: cores.textSecondary,
              semanticLabel: '',
            ),
            const SizedBox(width: BichuEspaco.e2),
            Expanded(
              child: Text(
                TelaDadosPessoais.placarDeQuemEntrou(quantos),
                style: textos.bodyMedium?.copyWith(color: cores.textPrimary),
              ),
            ),
          ],
        ),
        if (quantos > 0) ...<Widget>[
          const SizedBox(height: BichuEspaco.e4),
          TrilhaDeConvites(quantos: quantos, comAFrase: false),
        ],
      ],
      const SizedBox(height: BichuEspaco.e3),
      Text(
        TelaDadosPessoais.oQrNaoVoltaDepois,
        style: textos.bodySmall?.copyWith(color: cores.textMuted),
      ),
      const SizedBox(height: BichuEspaco.e3),
      BotaoSecundario(
        rotulo: TelaDadosPessoais.criarOConvite,
        carregando: _emitindo,
        aoTocar: () => unawaited(_emitir()),
      ),
    ];
  }
}

/// A SECAO DO LOGIN POR DIGITAL dentro de `Meus dados` (BICHUS-301,
/// 28/10/2026).
class _BlocoDoPasskey extends StatefulWidget {
  const _BlocoDoPasskey();

  @override
  State<_BlocoDoPasskey> createState() => _EstadoDoBlocoDoPasskey();
}

enum _EstadoDoPasskey {
  /// Ainda lendo. **Nada e afirmado**: sem isto a secao piscaria `Ativar` por
  /// um quadro para quem ja tem o login ligado.
  lendo,

  /// O sistema deste aparelho nao faz passkey.
  indisponivel,

  /// Ha credencial neste aparelho.
  ativo,

  /// Ha credencial na conta, mas nao neste aparelho.
  naContaNaoAqui,

  /// Nao ha credencial em lugar nenhum.
  inativo,
}

class _EstadoDoBlocoDoPasskey extends State<_BlocoDoPasskey> {
  _EstadoDoPasskey _estado = _EstadoDoPasskey.lendo;
  bool _ativando = false;
  String? _falha;
  bool _pediu = false;

  List<Passkey> _credenciais = const <Passkey>[];

  String? _revogando;

  @override
  void didChangeDependencies() {
    super.didChangeDependencies();
    if (_pediu) return;
    _pediu = true;
    unawaited(_ler());
  }

  Future<void> _ler() => _lerOEstado().timeout(
        FiacaoDoPasskey.tetoDaDecisao,
        onTimeout: () {
          if (!mounted) return;
          setState(() => _estado = _EstadoDoPasskey.indisponivel);
        },
      );

  Future<void> _lerOEstado() async {
    final escopo = Escopo.of(context);
    try {
      if (await escopo.passkeyNesteAparelho.haCredencial()) {
        final credenciais = await escopo.passkey.credenciaisDaConta();
        if (!mounted) return;
        setState(() {
          _estado = _EstadoDoPasskey.ativo;
          _credenciais = credenciais;
        });
        return;
      }
      if (!await escopo.credencialDoAparelho.suportaCredencial()) {
        if (!mounted) return;
        setState(() => _estado = _EstadoDoPasskey.indisponivel);
        return;
      }
      await escopo.passkey.reconciliarComAConta();
      if (!mounted) return;
      final agoraTem = await escopo.passkeyNesteAparelho.haCredencial();
      if (!mounted) return;
      final List<Passkey> credenciais;
      if (agoraTem) {
        credenciais = await escopo.passkey.credenciaisDaConta();
      } else {
        credenciais = const <Passkey>[];
      }
      if (!mounted) return;
      setState(() {
        _estado = agoraTem
            ? _EstadoDoPasskey.naContaNaoAqui
            : _EstadoDoPasskey.inativo;
        _credenciais = credenciais;
      });
    } on Object {
      if (!mounted) return;
      setState(() => _estado = _EstadoDoPasskey.indisponivel);
    }
  }

  Future<void> _ativar() async {
    if (_ativando) return;
    setState(() {
      _ativando = true;
      _falha = null;
    });
    final desfecho = await Escopo.of(context).passkey.oferecerCadastro();
    if (!mounted) return;
    setState(() {
      _ativando = false;
      if (desfecho == DesfechoDoCadastroDePasskey.cadastrada) {
        _estado = _EstadoDoPasskey.ativo;
      } else {
        _falha = TelaDadosPessoais.falhaAoAtivarOPasskey;
      }
    });
  }

  Future<void> _desativar(Passkey credencial) async {
    if (_revogando != null) return;
    final fiacao = Escopo.of(context).passkey;
    final confirmou = await mostrarFolhaDestrutiva(
      context,
      titulo: TelaDadosPessoais.tituloDaDesativacao,
      corpo: TelaDadosPessoais.corpoDaDesativacao,
      oQueSome: TelaDadosPessoais.oQueSomeNaDesativacao,
      rotuloDeConfirmar: TelaDadosPessoais.confirmarADesativacao,
      rotuloAcessivelDeConfirmar:
          TelaDadosPessoais.rotuloAcessivelDeDesativar,
      aoConfirmar: () async {
        if (!mounted) return;
        setState(() {
          _revogando = credencial.id;
          _falha = null;
        });
        final deu = await fiacao.revogar(credencial.id);
        if (!mounted) return;
        setState(() {
          _revogando = null;
          if (!deu) _falha = TelaDadosPessoais.falhaAoDesativar;
        });
      },
    );
    if (!confirmou || !mounted) return;
    await _ler();
  }

  @override
  Widget build(BuildContext context) {
    final cores = BichuColors.of(context).cores;
    final textos = Theme.of(context).textTheme;

    return Container(
      decoration: BoxDecoration(
        color: cores.surfaceSunken,
        borderRadius: BorderRadius.circular(BichuRaio.md),
        border: Border.all(color: cores.outline, width: BichuBorda.hairline),
      ),
      padding: const EdgeInsets.all(BichuEspaco.e4),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: <Widget>[
          Text(
            TelaDadosPessoais.tituloDoPasskey,
            style: textos.titleMedium?.copyWith(color: cores.textPrimary),
          ),
          const SizedBox(height: BichuEspaco.e1),
          Text(
            TelaDadosPessoais.apoioDoPasskey,
            style: textos.bodyMedium?.copyWith(color: cores.textSecondary),
          ),
          const SizedBox(height: BichuEspaco.e3),
          ..._conteudo(cores, textos),
        ],
      ),
    );
  }

  List<Widget> _conteudo(BichuCores cores, TextTheme textos) {
    final falha = _falha;
    return <Widget>[
      if (falha != null) ...<Widget>[
        FaixaDeAviso(texto: falha),
        const SizedBox(height: BichuEspaco.e3),
      ],
      switch (_estado) {
        _EstadoDoPasskey.lendo => const Center(
            child: Padding(
              padding: EdgeInsets.all(BichuEspaco.e3),
              child: CircularProgressIndicator(),
            ),
          ),
        _EstadoDoPasskey.indisponivel => Text(
            TelaDadosPessoais.passkeyIndisponivel,
            style: textos.bodyMedium?.copyWith(color: cores.textSecondary),
          ),
        _EstadoDoPasskey.ativo => Column(
            crossAxisAlignment: CrossAxisAlignment.stretch,
            children: <Widget>[
              Row(
                children: <Widget>[
                  Icon(
                    Icons.check_circle_outline,
                    size: 20,
                    color: cores.success,
                    semanticLabel: '',
                  ),
                  const SizedBox(width: BichuEspaco.e2),
                  Expanded(
                    child: Text(
                      TelaDadosPessoais.passkeyAtivado,
                      style: textos.bodyMedium?.copyWith(
                        color: cores.textPrimary,
                      ),
                    ),
                  ),
                ],
              ),
              ..._aparelhos(cores, textos),
            ],
          ),
        _EstadoDoPasskey.naContaNaoAqui => Column(
            crossAxisAlignment: CrossAxisAlignment.stretch,
            children: <Widget>[
              Text(
                TelaDadosPessoais.passkeyNaContaNaoNesteAparelho,
                style: textos.bodyMedium?.copyWith(color: cores.textPrimary),
              ),
              ..._aparelhos(cores, textos),
            ],
          ),
        _EstadoDoPasskey.inativo => BotaoSecundario(
            rotulo: TelaDadosPessoais.ativarOPasskey,
            carregando: _ativando,
            aoTocar: () => unawaited(_ativar()),
          ),
      },
    ];
  }

  List<Widget> _aparelhos(BichuCores cores, TextTheme textos) {
    if (_credenciais.isEmpty) return const <Widget>[];
    return <Widget>[
      const SizedBox(height: BichuEspaco.e4),
      Text(
        TelaDadosPessoais.aparelhosComPasskey,
        style: textos.titleSmall?.copyWith(color: cores.textSecondary),
      ),
      for (final credencial in _credenciais) ...<Widget>[
        const SizedBox(height: BichuEspaco.e3),
        _linhaDoAparelho(credencial, cores, textos),
      ],
    ];
  }

  Widget _linhaDoAparelho(
    Passkey credencial,
    BichuCores cores,
    TextTheme textos,
  ) {
    final nome = credencial.rotulo ??
        TelaDadosPessoais.credencialSemRotulo(
          QuandoNaLista.diaEMes(credencial.criadaEm),
        );
    final usada = credencial.usadaEm;
    return Column(
      crossAxisAlignment: CrossAxisAlignment.stretch,
      children: <Widget>[
        Text(
          nome,
          style: textos.bodyMedium?.copyWith(color: cores.textPrimary),
        ),
        const SizedBox(height: BichuEspaco.e1),
        Text(
          TelaDadosPessoais.usadaPorUltimo(
            usada == null ? null : QuandoNaLista.diaEMes(usada),
          ),
          style: textos.bodySmall?.copyWith(color: cores.textMuted),
        ),
        const SizedBox(height: BichuEspaco.e2),
        BotaoSecundario(
          rotulo: TelaDadosPessoais.desativarOPasskey,
          nomeAcessivel: TelaDadosPessoais.desativarNesteAparelho(nome),
          carregando: _revogando == credencial.id,
          aoTocar: () => unawaited(_desativar(credencial)),
        ),
      ],
    );
  }
}
