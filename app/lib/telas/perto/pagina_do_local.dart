import 'package:flutter/material.dart';
import 'package:go_router/go_router.dart';
import 'package:url_launcher/url_launcher.dart';

import '../../acessibilidade/anunciar.dart';
import '../../api/falhas.dart';
import '../../api/mensagens_de_erro.dart';
import '../../api/modelos_diretorio.dart';
import '../../api/problem.dart';
import '../../dispositivo/saida_do_app.dart';
import '../../dispositivo/textos_do_app_de_mapas.dart';
import '../../escopo.dart';
import '../../roteamento/rotas.dart';
import '../../roteamento/saida_da_mensagem.dart';
import '../../theme/bichu_colors.dart';
import '../../theme/bichu_tokens.g.dart';
import '../../widgets/bichu_field.dart';
import '../../widgets/botao_primario.dart';
import '../../widgets/casca_da_pagina_interna.dart';
import '../../widgets/convite_para_entrar.dart';
import '../../widgets/faixa_de_aviso.dart';
import '../../widgets/folha_destrutiva.dart';
import '../../widgets/grupo_de_opcoes.dart';
import '../../widgets/icone_do_inscrito.dart';
import '../../widgets/imagem_da_rede.dart';
import '../../widgets/moldura.dart';
import '../../widgets/rodape_da_paginacao.dart';
import '../../widgets/visualizador_de_imagem.dart';
import '../casca_com_abas.dart';
import 'lista_do_diretorio.dart';

/// A pagina de um local do `Perto`: `GET /v1/directory/entries/{slug}`
/// (`getDirectoryEntry`), com as avaliacoes de `listDirectoryEntryReviews`.
class PaginaDoLocal extends StatefulWidget {
  const PaginaDoLocal({required this.slug, super.key});

  final String slug;

  /// Empilha o local no ramo do `Perto`, com a barra de abas: voltar devolve a
  /// lista com a busca e o filtro de quem estava procurando.
  static Future<void> abrir(BuildContext context, String slug) {
    return context.push<void>(Rotas.localDoPertoDe(slug));
  }

  static const String tituloDaTela = 'Local';
  static const String rotuloDeAtualizar = 'Atualizar';
  static const String carregandoOLocal = 'Carregando o local';

  /// O titulo do bloco das atividades.
  static const String tituloDasAtividades = 'Atividades';

  static const String tituloDasInformacoes = 'Informações';
  static const String tituloDasAvaliacoes = 'Avaliações';
  static const String tituloDaMinha = 'A minha avaliação';
  static const String tituloDasOutras = 'O que outras pessoas disseram';

  /// O 404 do contrato, com **uma** frase.
  static const String tituloDoNaoEncontrado = 'Este local saiu da Rede';

  static const String explicacaoDoNaoEncontrado =
      'Ele pode ter sido retirado. Veja quem está atendendo na sua região '
      'agora.';

  /// **O TEXTO MUDOU EM 19/10/2026 com a secao.** Era `Ver o Perto`, e `Perto`
  /// deixou de existir: o diretorio virou a aba `Comunidade` da `Rede`.
  static const String rotuloDeVoltarParaPerto = 'Ver a Rede';

  /// Sem conta nao ha leitura, e a frase diz por que **sem culpar a pessoa**.
  static const String tituloDoVisitante = 'Entre para ver este local';

  /// **A frase nao promete mais o telefone.** Ela dizia *"mostra o telefone
  /// comercial e a distância até você"*, e a primeira metade deixou de ser
  /// verdade em 19/10/2026: o numero saiu da tela por pedido do cliente.
  static const String explicacaoDoVisitante =
      'A página de um profissional mostra a distância até você, e o Bichu só '
      'mostra isso para quem tem conta. Depois de entrar, você lê as '
      'avaliações e pode escrever a sua.';

  static const String rotuloDeEntrar = 'Entrar ou criar conta';

  /// O estado zero da pontuacao: **sem media e sem estrela**.
  static const String tituloSemAvaliacoes = 'Ainda sem avaliações';

  static const String explicacaoSemAvaliacoes =
      'Seja a primeira pessoa a contar como foi o atendimento aqui.';

  /// O rotulo **VISIVEL** do botao de contato: so `Ligar`.
  static const String rotuloDeLigar = 'Ligar';

  /// O que o toque na foto principal FAZ.
  static const String dicaDeAmpliarAFoto = 'Ampliar';

  /// O rotulo da acao. **`Compartilhar`, a mesma palavra do encontro e da ficha
  /// do pet**, e nao `Compartilhar no WhatsApp`: quem decide o que a folha
  /// lista e o sistema.
  static const String rotuloDeCompartilhar = 'Compartilhar';

  /// O nome acessivel: diz DE QUE a acao e, porque o leitor de tela le os
  /// rotulos fora de contexto.
  static String compartilharAcessivel(String nome) =>
      'Compartilhar o local $nome';

  /// Quando a folha do sistema nao abriu.
  static const String falhaDoCompartilhar =
      'Não conseguimos abrir as opções de compartilhamento agora. '
      'Tente de novo.';

  /// A MENSAGEM QUE SAI DO PRODUTO E CHEGA EM ESTRANHOS.
  static String mensagemDeCompartilhar({
    required String nome,
    String? atividade,
    String? lugar,
  }) {
    return '$nome\n'
        '${atividade == null ? '' : '$atividade\n'}'
        '${lugar == null ? '' : '$lugar\n'}'
        'Encontrei no Bichu.';
  }

  /// O assunto, que vira `EXTRA_SUBJECT` no Android e o assunto do e-mail
  /// quando o destino escolhido e um aplicativo de e-mail.
  static String assuntoDeCompartilhar(String nome) => 'Encontrei no Bichu: $nome';

  static const String rotuloDaNota = 'Sua nota';
  static const String ajudaDaNota = 'Toque nas estrelas para dar de 1 a 5.';
  static const String notaObrigatoria = 'Escolha uma nota de 1 a 5.';
  static const String rotuloDoTexto = 'Seu comentário';
  static const String ajudaDoTexto = 'A nota já basta. O texto é opcional.';
  static const String exemploDoTexto = 'Conte como foi o atendimento.';
  static const String rotuloDeEnviar = 'Enviar avaliação';
  static const String rotuloDeSalvarEdicao = 'Salvar alteração';

  /// A publicacao e IMEDIATA, e a tela diz isso **antes** do toque.
  static const String avisoDePublicacaoImediata =
      'A sua avaliação aparece na hora, junto com o seu nome de exibição.';

  /// As duas frases do desfecho, escolhidas por `created` da RESPOSTA.
  static const String avaliacaoPublicada = 'Avaliação publicada.';
  static const String avaliacaoAtualizada = 'Avaliação atualizada.';
  static const String avaliacaoApagada = 'A sua avaliação foi apagada.';

  static const String rotuloDeEditar = 'Editar';
  static const String rotuloDeApagar = 'Apagar';
  static const String rotuloDeCancelarEdicao = 'Cancelar';
  static const String seloDaMinha = 'Sua avaliação';
  static const String marcaDeEditada = 'editada';

  static const String tituloDeApagar = 'Apagar a sua avaliação?';

  static const String corpoDeApagar =
      'Ela sai da página deste local na hora, e a média e a contagem caem '
      'junto. Você pode avaliar de novo depois.';

  static const String confirmarApagar = 'Apagar';

  /// Conta sem e-mail confirmado: a frase, e a porta.
  static const String tituloDoCanalNaoVerificado =
      'Confirme o seu e-mail para avaliar';

  static const String explicacaoDoCanalNaoVerificado =
      'É a mesma regra de marcar um encontro: a confirmação do e-mail é o que '
      'libera escrever para a comunidade. Você continua podendo ler todas as '
      'avaliações.';

  static const String rotuloDeConfirmarEmail = 'Confirmar o meu e-mail';

  /// `can_review: false` sem motivo declarado.
  static const String bloqueioSemMotivo =
      'Não é possível avaliar este local com a sua conta agora.';

  /// Quando a lista de avaliacoes nao chega, mas a pagina chegou.
  static const String falhaDasAvaliacoes =
      'Não foi possível carregar as avaliações agora.';

  static const String falhaDeMaisAvaliacoes =
      'Não foi possível carregar mais avaliações.';

  static const String rotuloDeOrdenar = 'Ordenar as avaliações';

  /// A frase do fim da lista (paragrafo 11.20), no plural e no singular.
  static String fimDasAvaliacoes(int total) => total == 1
      ? 'Esta é a única avaliação deste local.'
      : 'Você viu todas as $total avaliações deste local.';

  /// `Ligar para a Clínica Pata Firme` — o nome **ACESSIVEL**, e nao o visivel.
  static String ligarPara(String nome) => '$rotuloDeLigar para $nome';

  /// O rotulo da faixa do local, para quem nao ve a imagem.
  static String fotoDe(String nome) => 'Foto de $nome';

  /// A minha avaliacao existe, mas nao esta em nenhuma pagina ja carregada.
  static const String minhaForaDaPagina =
      'Você já avaliou este local. A sua avaliação aparece na lista abaixo; '
      'carregue mais avaliações para encontrá-la e editar.';

  @override
  State<PaginaDoLocal> createState() => _PaginaDoLocalState();
}

/// Os desfechos de uma carga.
enum _Fase { carregando, pronto, naoEncontrado, semConta, falha }

class _PaginaDoLocalState extends State<PaginaDoLocal> {
  _Fase _fase = _Fase.carregando;
  String? _textoDaFalha;
  DetalheDoLocal? _detalhe;

  /// A pontuacao **de agora**, que comeca na do detalhe e e trocada pela que
  /// volta no `PUT` e pela recarga depois do `DELETE`.
  PontuacaoDoLocal? _pontuacao;

  /// O `ref` da minha avaliacao, ou nulo.
  String? _refDaMinha;

  /// A minha avaliacao, quando a tela tem o objeto dela: ou porque ela veio
  /// numa pagina carregada, ou porque o `PUT` acabou de devolve-la.
  AvaliacaoDoLocal? _minha;

  /// As avaliacoes de **todas** as paginas pedidas, na ordem em que chegaram.
  final List<AvaliacaoDoLocal> _avaliacoes = <AvaliacaoDoLocal>[];

  PaginaDeAvaliacoes? _paginaDeAvaliacoes;
  OrdemDasAvaliacoes _ordem = OrdemDasAvaliacoes.recentes;
  bool _carregandoAvaliacoes = false;
  /// A falha foi **falta de conta**, e nao defeito.
  bool _faltaConta = false;
  String? _falhaDasAvaliacoes;
  bool _carregandoMais = false;
  String? _falhaDeMais;

  /// O campo esta aberto para escrever.
  bool _editando = false;
  int? _nota;
  final TextEditingController _texto = TextEditingController();
  bool _enviando = false;

  /// A recusa do envio da minha avaliacao, **inteira**.
  MensagemDeErro? _erroDoFormulario;
  String? _erroDaNota;

  bool _cargaAgendada = false;

  bool get _logado => Escopo.of(context).sessao.logado;

  @override
  void initState() {
    super.initState();
    _agendarCarga();
  }

  @override
  void dispose() {
    _texto.dispose();
    super.dispose();
  }

  void _agendarCarga() {
    if (_cargaAgendada) return;
    _cargaAgendada = true;
    WidgetsBinding.instance.addPostFrameCallback((_) {
      _cargaAgendada = false;
      if (mounted) _carregar();
    });
  }

  Future<void> _carregar() async {
    if (!mounted) return;

    if (!_logado) {
      setState(() {
        _fase = _Fase.semConta;
        _detalhe = null;
        _textoDaFalha = null;
      });
      return;
    }

    final escopo = Escopo.of(context);
    setState(() {
      _fase = _Fase.carregando;
      _textoDaFalha = null;
    });

    try {
      final detalhe = await escopo.diretorio.detalhar(widget.slug);
      if (!mounted) return;
      setState(() {
        _detalhe = detalhe;
        _pontuacao = detalhe.pontuacao;
        _refDaMinha = detalhe.minhaAvaliacaoRef;
        _minha = null;
        _editando = false;
        _nota = null;
        _erroDoFormulario = null;
        _erroDaNota = null;
        _texto.clear();
        _fase = _Fase.pronto;
      });
      await _carregarAvaliacoes();
    } on FalhaDaApi catch (falha) {
      if (!mounted) return;
      if (falha.tipo == ProblemTipo.naoEncontrado) {
        setState(() {
          _detalhe = null;
          _fase = _Fase.naoEncontrado;
        });
        return;
      }
      setState(() {
        _faltaConta = faltaConta(falha);
        _textoDaFalha =
            textoDoTetoDoDiretorio(falha) ?? MensagensDeErro.de(falha).texto;
        _detalhe = null;
        _fase = _Fase.falha;
      });
    } on FalhaDeChamada catch (falha) {
      if (!mounted) return;
      setState(() {
        _faltaConta = faltaConta(falha);
        _textoDaFalha = MensagensDeErro.de(falha).texto;
        _detalhe = null;
        _fase = _Fase.falha;
      });
    } on FormatException catch (erro) {
      if (!mounted) return;
      setState(() {
        _textoDaFalha = MensagensDeErro.servidorFora;
        _detalhe = null;
        _fase = _Fase.falha;
      });
      debugPrint('Resposta da pagina do local fora do contrato: $erro');
    }
  }

  /// A **primeira** pagina de avaliacoes da ordem atual, sempre.
  Future<void> _carregarAvaliacoes() async {
    if (!mounted) return;
    final escopo = Escopo.of(context);
    setState(() {
      _carregandoAvaliacoes = true;
      _falhaDasAvaliacoes = null;
      _falhaDeMais = null;
      _carregandoMais = false;
      _avaliacoes.clear();
    });

    try {
      final pagina = await escopo.diretorio.avaliacoes(
        widget.slug,
        ordem: _ordem,
      );
      if (!mounted) return;
      setState(() {
        _paginaDeAvaliacoes = pagina;
        _avaliacoes
          ..clear()
          ..addAll(pagina.itens);
        _carregandoAvaliacoes = false;
        _acharAMinha();
      });
    } on FalhaDeChamada catch (falha) {
      if (!mounted) return;
      setState(() {
        _carregandoAvaliacoes = false;
        _paginaDeAvaliacoes = null;
        _falhaDasAvaliacoes = textoDoTetoDoDiretorio(falha) ??
            PaginaDoLocal.falhaDasAvaliacoes;
      });
    } on FormatException catch (erro) {
      if (!mounted) return;
      setState(() {
        _carregandoAvaliacoes = false;
        _paginaDeAvaliacoes = null;
        _falhaDasAvaliacoes = PaginaDoLocal.falhaDasAvaliacoes;
      });
      debugPrint('Resposta das avaliacoes fora do contrato: $erro');
    }
  }

  /// Pede a pagina seguinte e **acrescenta** o que vier.
  Future<void> _carregarMais() async {
    if (!mounted || _carregandoMais) return;
    final atual = _paginaDeAvaliacoes;
    if (atual == null) return;

    final escopo = Escopo.of(context);
    setState(() {
      _carregandoMais = true;
      _falhaDeMais = null;
    });

    try {
      final pagina = await escopo.diretorio.avaliacoes(
        widget.slug,
        ordem: _ordem,
        pagina: atual.pagina + 1,
      );
      if (!mounted) return;
      setState(() {
        _paginaDeAvaliacoes = pagina;
        _avaliacoes.addAll(pagina.itens);
        _carregandoMais = false;
        _acharAMinha();
      });
    } on FalhaDeChamada catch (falha) {
      if (!mounted) return;
      setState(() {
        _carregandoMais = false;
        _falhaDeMais = textoDoTetoDoDiretorio(falha) ??
            PaginaDoLocal.falhaDeMaisAvaliacoes;
      });
    } on FormatException catch (erro) {
      if (!mounted) return;
      setState(() {
        _carregandoMais = false;
        _falhaDeMais = PaginaDoLocal.falhaDeMaisAvaliacoes;
      });
      debugPrint('Resposta das avaliacoes fora do contrato: $erro');
    }
  }

  /// Tira a minha do fluxo da lista.
  void _acharAMinha() {
    for (final a in _avaliacoes) {
      if (a.minha || (a.ref == _refDaMinha && _refDaMinha != null)) {
        _minha = a;
        _refDaMinha = a.ref;
        return;
      }
    }
  }

  /// As avaliacoes das OUTRAS pessoas: a lista carregada menos a minha.
  List<AvaliacaoDoLocal> get _dasOutras => <AvaliacaoDoLocal>[
        for (final a in _avaliacoes)
          if (!a.minha && a.ref != _refDaMinha) a,
      ];

  void _trocarOrdem(OrdemDasAvaliacoes nova) {
    if (nova == _ordem) return;
    setState(() => _ordem = nova);
    _carregarAvaliacoes();
  }

  void _voltar() {
    if (context.canPop()) {
      context.pop();
    } else {
      context.go(Rotas.rede);
    }
  }

  /// Abre o endereco no aplicativo de mapas do aparelho.
  Future<void> _ligar(String telefoneE164) async {
    await launchUrl(Uri(scheme: 'tel', path: telefoneE164));
  }

  /// Abre o endereco comercial no aplicativo de mapas do aparelho.
  Future<void> _abrirNoMapa(String endereco) async {
    final abriu =
        await SaidaDoApp.atual.abrirEnderecoNoAppDeMapas(endereco: endereco);
    if (!abriu && mounted) {
      ScaffoldMessenger.maybeOf(context)?.showSnackBar(
        const SnackBar(content: Text(TextosDoAppDeMapas.falhaAoAbrir)),
      );
    }
  }

  /// `Compartilhar`: abre a FOLHA DO SISTEMA com o texto do local.
  Future<void> _compartilharOLocal(DetalheDoLocal detalhe) async {
    final abriu = await SaidaDoApp.atual.compartilharTexto(
      texto: PaginaDoLocal.mensagemDeCompartilhar(
        nome: detalhe.nome,
        atividade: detalhe.atividade?.rotulo,
        lugar: detalhe.linhaDeLugar,
      ),
      assunto: PaginaDoLocal.assuntoDeCompartilhar(detalhe.nome),
    );
    if (!abriu && mounted) {
      ScaffoldMessenger.maybeOf(context)?.showSnackBar(
        const SnackBar(content: Text(PaginaDoLocal.falhaDoCompartilhar)),
      );
    }
  }

  void _abrirEdicao() {
    final minha = _minha;
    setState(() {
      _editando = true;
      _nota = minha?.nota;
      _texto.text = minha?.texto ?? '';
      _erroDoFormulario = null;
      _erroDaNota = null;
    });
  }

  void _fecharEdicao() {
    setState(() {
      _editando = false;
      _nota = null;
      _texto.clear();
      _erroDoFormulario = null;
      _erroDaNota = null;
    });
  }

  Future<void> _enviar() async {
    final nota = _nota;
    if (nota == null) {
      setState(() => _erroDaNota = PaginaDoLocal.notaObrigatoria);
      return;
    }

    final escopo = Escopo.of(context);
    setState(() {
      _enviando = true;
      _erroDoFormulario = null;
      _erroDaNota = null;
    });

    try {
      final gravada = await escopo.diretorio.gravarMinhaAvaliacao(
        widget.slug,
        nota: nota,
        texto: _texto.text,
      );
      if (!mounted) return;
      setState(() {
        _enviando = false;
        _editando = false;
        _minha = gravada.avaliacao;
        _refDaMinha = gravada.avaliacao.ref;
        _pontuacao = gravada.pontuacao;
        for (var i = 0; i < _avaliacoes.length; i++) {
          if (_avaliacoes[i].ref == gravada.avaliacao.ref) {
            _avaliacoes[i] = gravada.avaliacao;
          }
        }
        _texto.clear();
        _nota = null;
      });
      anunciar(
        context,
        gravada.criada
            ? PaginaDoLocal.avaliacaoPublicada
            : PaginaDoLocal.avaliacaoAtualizada,
      );
    } on FalhaDaApi catch (falha) {
      if (!mounted) return;
      setState(() {
        _enviando = false;
        _erroDoFormulario = MensagensDeErro.de(
          falha,
          acaoEmCurso: AcaoEmCurso.avaliarLocal,
        );
      });
    } on FalhaDeChamada catch (falha) {
      if (!mounted) return;
      setState(() {
        _enviando = false;
        _erroDoFormulario = MensagensDeErro.de(
          falha,
          acaoEmCurso: AcaoEmCurso.avaliarLocal,
        );
      });
    } on FormatException catch (erro) {
      if (!mounted) return;
      setState(() {
        _enviando = false;
        _erroDoFormulario = const MensagemDeErro(
          texto: MensagensDeErro.servidorFora,
        );
      });
      debugPrint('Resposta da escrita da avaliacao fora do contrato: $erro');
    }
  }

  Future<void> _apagar() async {
    final escopo = Escopo.of(context);
    final apagou = await mostrarFolhaDestrutiva(
      context,
      titulo: PaginaDoLocal.tituloDeApagar,
      corpo: PaginaDoLocal.corpoDeApagar,
      oQueSome: const <String>[
        'A sua nota, que sai da média e da contagem deste local.',
        'O seu comentário, se você escreveu um.',
      ],
      rotuloDeConfirmar: PaginaDoLocal.confirmarApagar,
      rotuloAcessivelDeConfirmar: 'Apagar a minha avaliação deste local',
      aoConfirmar: () => escopo.diretorio.apagarMinhaAvaliacao(widget.slug),
    );
    if (!mounted || !apagou) return;
    anunciar(context, PaginaDoLocal.avaliacaoApagada);
    await _carregar();
  }

  Future<void> _denunciar(AvaliacaoDoLocal avaliacao) async {
    final escopo = Escopo.of(context);
    final enviou = await showModalBottomSheet<bool>(
      context: context,
      showDragHandle: true,
      useSafeArea: true,
      isScrollControlled: true,
      builder: (contexto) => _FolhaDeDenuncia(
        nomeDeQuemEscreveu: avaliacao.nomeDeQuemLe,
        aoEnviar: (motivo, detalhe) => escopo.diretorio.denunciarAvaliacao(
          widget.slug,
          avaliacao.ref,
          motivo: motivo,
          detalhe: detalhe,
        ),
      ),
    );
    if (!mounted || enviou != true) return;
    anunciar(context, _FolhaDeDenuncia.recebida);
  }

  Future<void> _entrar() async {
    await context.push<void>(Rotas.entrar);
    if (!mounted) return;
    await _carregar();
  }

  @override
  Widget build(BuildContext context) {
    final detalhe = _detalhe;

    if (_fase == _Fase.pronto && detalhe != null) {
      return CascaDaPaginaInterna(
        nome: detalhe.nome,
        prefixoAnunciado: PaginaDoLocal.tituloDaTela,
        aoVoltar: _voltar,
        temCapa: detalhe.fotoUrl != null,
        proporcaoDaCapa: _FaixaDoLocal.proporcao,
        recuo: const EdgeInsets.symmetric(vertical: BichuEspaco.e4),
        filhos: _corpo(detalhe),
      );
    }

    return Scaffold(
      appBar: AppBar(
        toolbarHeight: BichuAlvoDeToque.critico,
        leadingWidth: BichuAlvoDeToque.critico,
        leading: BotaoVoltarNaBarra(aoTocar: _voltar),
        title: const Text(PaginaDoLocal.tituloDaTela),
      ),
      body: SafeArea(
        child: Semantics(
          scopesRoute: true,
          namesRoute: true,
          explicitChildNodes: true,
          label: PaginaDoLocal.tituloDaTela,
          child: ListView(
            padding: const EdgeInsets.symmetric(vertical: BichuEspaco.e4),
            children: _corpo(detalhe),
          ),
        ),
      ),
    );
  }

  List<Widget> _corpo(DetalheDoLocal? detalhe) {
    if (_fase == _Fase.carregando) {
      return const <Widget>[_Margem(child: _EsqueletoDoLocal())];
    }

    if (_fase == _Fase.semConta) {
      return <Widget>[
        _Margem(
          child: EstadoVazio(
            titulo: PaginaDoLocal.tituloDoVisitante,
            explicacao: PaginaDoLocal.explicacaoDoVisitante,
            acao: SizedBox(
              width: double.infinity,
              child: BotaoPrimario(
                rotulo: PaginaDoLocal.rotuloDeEntrar,
                aoTocar: _entrar,
              ),
            ),
          ),
        ),
      ];
    }

    if (_fase == _Fase.naoEncontrado) {
      return <Widget>[
        _Margem(
          child: EstadoVazio(
            titulo: PaginaDoLocal.tituloDoNaoEncontrado,
            explicacao: PaginaDoLocal.explicacaoDoNaoEncontrado,
            acao: SizedBox(
              width: double.infinity,
              height: BichuAlvoDeToque.min,
              child: OutlinedButton(
                onPressed: () => context.go(Rotas.rede),
                child: const Text(PaginaDoLocal.rotuloDeVoltarParaPerto),
              ),
            ),
          ),
        ),
      ];
    }

    if (_fase == _Fase.falha || detalhe == null) {
      if (_faltaConta) {
        return const <Widget>[
          _Margem(child: ConviteParaEntrar(secao: SecaoComConta.paginaDoLocal)),
        ];
      }
      return <Widget>[
        _Margem(
          child: FaixaDeAviso(
            texto: _textoDaFalha ?? MensagensDeErro.servidorFora,
            rotuloDaAcao: PaginaDoLocal.rotuloDeAtualizar,
            aoTocarNaAcao: _carregar,
          ),
        ),
      ];
    }

    final pontuacao = _pontuacao ?? detalhe.pontuacao;

    return <Widget>[
      if (detalhe.fotoUrl case final String foto) ...<Widget>[
        _FaixaDoLocal(url: foto, nome: detalhe.nome),
        const SizedBox(height: BichuEspaco.e4),
      ],
      _Margem(
        child: _Cabecalho(
          detalhe: detalhe,
          aoLigar: _ligar,
          aoAbrirNoMapa: _abrirNoMapa,
        ),
      ),
      const SizedBox(height: BichuEspaco.e4),
      _Margem(
        child: BotaoSecundario(
          rotulo: PaginaDoLocal.rotuloDeCompartilhar,
          nomeAcessivel: PaginaDoLocal.compartilharAcessivel(detalhe.nome),
          aoTocar: () => _compartilharOLocal(detalhe),
        ),
      ),
      if (detalhe.atividades.isNotEmpty) ...<Widget>[
        const _Divisor(),
        _Secao(
          icone: Icons.sell_outlined,
          titulo: PaginaDoLocal.tituloDasAtividades,
          child: _Atividades(atividades: detalhe.atividades),
        ),
      ],
      const _Divisor(),
      _Secao(
        icone: Icons.notes_outlined,
        titulo: PaginaDoLocal.tituloDasInformacoes,
        child: _Informacoes(detalhe: detalhe),
      ),
      const _Divisor(),
      _Secao(
        icone: Icons.star_outline,
        titulo: PaginaDoLocal.tituloDasAvaliacoes,
        child: _BlocoDaPontuacao(pontuacao: pontuacao),
      ),
      const SizedBox(height: BichuEspaco.e6),
      _Secao(
        icone: Icons.rate_review_outlined,
        titulo: PaginaDoLocal.tituloDaMinha,
        child: _blocoDaMinha(detalhe),
      ),
      const _Divisor(),
      _Secao(
        icone: Icons.forum_outlined,
        titulo: PaginaDoLocal.tituloDasOutras,
        child: _blocoDasOutras(),
      ),
      const SizedBox(height: BichuEspaco.e8),
    ];
  }

  /// O bloco `A minha avaliação`, nos quatro estados do protótipo.
  Widget _blocoDaMinha(DetalheDoLocal detalhe) {
    if (_minha case final AvaliacaoDoLocal minha when !_editando) {
      return Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: <Widget>[
          _CartaoDeAvaliacao(
            avaliacao: minha,
            minha: true,
            aoEditar: _abrirEdicao,
            aoApagar: _apagar,
          ),
          const SizedBox(height: BichuEspaco.e2),
          _Nota(texto: PaginaDoLocal.avisoDePublicacaoImediata),
        ],
      );
    }

    if (_refDaMinha != null && !_editando) {
      return Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: <Widget>[
          _Caixa(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: <Widget>[
                const _Corpo(texto: PaginaDoLocal.minhaForaDaPagina),
                const SizedBox(height: BichuEspaco.e3),
                Align(
                  alignment: Alignment.centerLeft,
                  child: TextButton(
                    onPressed: _apagar,
                    child: const Text(PaginaDoLocal.rotuloDeApagar),
                  ),
                ),
              ],
            ),
          ),
        ],
      );
    }

    if (_editando || detalhe.podeAvaliar) {
      return _Formulario(
        nota: _nota,
        erroDaNota: _erroDaNota,
        texto: _texto,
        enviando: _enviando,
        erro: _erroDoFormulario,
        editando: _editando,
        aoEscolherNota: (nota) => setState(() {
          _nota = nota;
          _erroDaNota = null;
        }),
        aoEnviar: _enviar,
        aoCancelar: _editando ? _fecharEdicao : null,
      );
    }

    if (detalhe.motivoDeNaoPoderAvaliar ==
        MotivoDeNaoPoderAvaliar.canalNaoVerificado) {
      return _Caixa(
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: <Widget>[
            _Titulo(texto: PaginaDoLocal.tituloDoCanalNaoVerificado),
            const SizedBox(height: BichuEspaco.e2),
            const _Corpo(texto: PaginaDoLocal.explicacaoDoCanalNaoVerificado),
            const SizedBox(height: BichuEspaco.e4),
            SizedBox(
              width: double.infinity,
              height: BichuAlvoDeToque.min,
              child: OutlinedButton(
                onPressed: () => context.push(Rotas.verifiqueSeuEmail),
                child: const Text(PaginaDoLocal.rotuloDeConfirmarEmail),
              ),
            ),
          ],
        ),
      );
    }

    return const _Caixa(child: _Corpo(texto: PaginaDoLocal.bloqueioSemMotivo));
  }

  Widget _blocoDasOutras() {
    if (_carregandoAvaliacoes) {
      return const _EsqueletoDeAvaliacoes();
    }

    final falha = _falhaDasAvaliacoes;
    if (falha != null) {
      return FaixaDeAviso(
        texto: falha,
        rotuloDaAcao: PaginaDoLocal.rotuloDeAtualizar,
        aoTocarNaAcao: _carregarAvaliacoes,
      );
    }

    final pagina = _paginaDeAvaliacoes;
    if (pagina == null) {
      return FaixaDeAviso(
        texto: PaginaDoLocal.falhaDasAvaliacoes,
        rotuloDaAcao: PaginaDoLocal.rotuloDeAtualizar,
        aoTocarNaAcao: _carregarAvaliacoes,
      );
    }

    final outras = _dasOutras;

    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: <Widget>[
        if (pagina.total > 1) ...<Widget>[
          _ChipsDeOrdem(ordem: _ordem, aoTrocar: _trocarOrdem),
          const SizedBox(height: BichuEspaco.e4),
        ],
        if (outras.isEmpty)
          _Corpo(
            texto: _refDaMinha == null
                ? PaginaDoLocal.explicacaoSemAvaliacoes
                : 'Por enquanto a sua é a única avaliação deste local.',
          )
        else
          for (var i = 0; i < outras.length; i++) ...<Widget>[
            if (i > 0) const SizedBox(height: BichuEspaco.e3),
            _CartaoDeAvaliacao(
              avaliacao: outras[i],
              minha: false,
              aoDenunciar: () => _denunciar(outras[i]),
            ),
          ],
        if (_avaliacoes.isNotEmpty) ...<Widget>[
          const SizedBox(height: espacoAcimaDoRodape),
          RodapeDaPaginacao(
            carregados: _avaliacoes.length,
            total: pagina.total,
            carregando: _carregandoMais,
            textoDaFalha: _falhaDeMais,
            fimDaLista: PaginaDoLocal.fimDasAvaliacoes,
            aoPedirMais: _carregarMais,
          ),
        ],
      ],
    );
  }
}

/// A faixa 16:9 com a foto do lugar, de borda a borda.
class _FaixaDoLocal extends StatelessWidget {
  const _FaixaDoLocal({required this.url, required this.nome});

  final String url;
  final String nome;

  /// 16:9, a proporcao da derivada `banner` do contrato.
  static const double proporcao = 16 / 9;

  @override
  Widget build(BuildContext context) {
    final imagem = ImagemDaRede(
      url: url,
      descricao: PaginaDoLocal.fotoDe(nome),
      proporcao: proporcao,
      raio: BichuRaio.none,
      simboloDeFalha: Icons.storefront_outlined,
    );

    return Semantics(
      button: true,
      label: PaginaDoLocal.fotoDe(nome),
      hint: PaginaDoLocal.dicaDeAmpliarAFoto,
      excludeSemantics: true,
      child: InkWell(
        onTap: () => VisualizadorDeImagem.abrirVarias(
          context,
          urls: <String>[url],
          textoAlternativo: PaginaDoLocal.fotoDe(nome),
        ),
        child: imagem,
      ),
    );
  }
}

/// Nome, atividade, lugar, distancia, **o que foi verificado** e `Ligar`.
class _Cabecalho extends StatelessWidget {
  const _Cabecalho({
    required this.detalhe,
    required this.aoLigar,
    required this.aoAbrirNoMapa,
  });

  final DetalheDoLocal detalhe;
  final Future<void> Function(String telefoneE164) aoLigar;

  /// Recebe o TEXTO da busca, ja montado, e repassa a
  /// `SaidaDoApp.abrirEnderecoNoAppDeMapas` -- a mesma porta do encontro.
  final Future<void> Function(String endereco) aoAbrirNoMapa;

  @override
  Widget build(BuildContext context) {
    final textos = Theme.of(context).textTheme;

    final lugar = detalhe.linhaDeLugar;
    final endereco = detalhe.endereco.porExtenso;
    final busca = detalhe.endereco.textoParaBuscaNoMapa(
      bairro: detalhe.bairro,
      cidade: detalhe.cidade,
      estado: detalhe.estado,
    );
    final distancia =
        CartaoDoDiretorio.distanciaEmTexto(detalhe.distanciaEmMetros);
    final verificacao = detalhe.verificacao.oQueFoiVerificado;
    final telefone = detalhe.telefoneE164;

    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: <Widget>[
        MergeSemantics(
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: <Widget>[
              if (detalhe.fotoUrl == null)
                Row(
                  crossAxisAlignment: CrossAxisAlignment.center,
                  children: <Widget>[
                    IconeDoInscrito(
                      atividade: detalhe.atividade,
                      tipoDeEntidade: detalhe.tipoDeEntidade,
                      largura: BichuMoldura.larguraFotoSm,
                      raio: BichuRaio.sm,
                    ),
                    const SizedBox(width: BichuEspaco.e3),
                    Expanded(
                      child: Semantics(
                        header: true,
                        child:
                            Text(detalhe.nome, style: textos.headlineSmall),
                      ),
                    ),
                  ],
                )
              else
                Semantics(
                  header: true,
                  child: Text(detalhe.nome, style: textos.headlineSmall),
                ),
              if (endereco != null && busca != null) ...<Widget>[
                const SizedBox(height: BichuEspaco.e3),
                Semantics(
                  button: true,
                  label: '${TextosDoAppDeMapas.rotuloDoEndereco}: $endereco',
                  onTap: () => aoAbrirNoMapa(busca),
                  excludeSemantics: true,
                  child: InkWell(
                    onTap: () => aoAbrirNoMapa(busca),
                    child: ConstrainedBox(
                      constraints: const BoxConstraints(
                        minHeight: BichuAlvoDeToque.critico,
                      ),
                      child: _LinhaComIcone(
                        icone: Icons.map_outlined,
                        texto: endereco,
                      ),
                    ),
                  ),
                ),
              ] else if (lugar != null) ...<Widget>[
                const SizedBox(height: BichuEspaco.e3),
                _LinhaComIcone(
                  icone: Icons.place_outlined,
                  texto: lugar,
                  aoTocar: () => aoAbrirNoMapa(lugar),
                  rotuloAcessivel:
                      '${TextosDoAppDeMapas.rotuloDoEndereco}: $lugar',
                ),
              ],
              if (distancia != null) ...<Widget>[
                const SizedBox(height: BichuEspaco.e2),
                _LinhaComIcone(
                  icone: Icons.schedule_outlined,
                  texto: distancia,
                ),
              ],
            ],
          ),
        ),
        if (verificacao != null) ...<Widget>[
          const SizedBox(height: BichuEspaco.e4),
          _Selo(texto: verificacao),
        ],
        if (telefone != null) ...<Widget>[
          const SizedBox(height: BichuEspaco.e5),
          SizedBox(
            width: double.infinity,
            child: BotaoPrimario(
              rotulo: PaginaDoLocal.rotuloDeLigar,
              nomeAcessivel: PaginaDoLocal.ligarPara(detalhe.nome),
              icone: Icons.call_outlined,
              aoTocar: () => aoLigar(telefone),
            ),
          ),
        ],
      ],
    );
  }
}

/// `Informações`: o `about` e o lugar.
class _Informacoes extends StatelessWidget {
  const _Informacoes({required this.detalhe});

  final DetalheDoLocal detalhe;

  static const String semSobre =
      'Este local ainda não escreveu uma apresentação.';

  @override
  Widget build(BuildContext context) {
    final sobre = detalhe.sobre;

    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: <Widget>[
        if (sobre != null && sobre.isNotEmpty)
          _Corpo(texto: sobre)
        else
          const _Corpo(texto: semSobre),
      ],
    );
  }
}

/// A media, a contagem e o histograma — **ou o estado zero**.
class _BlocoDaPontuacao extends StatelessWidget {
  const _BlocoDaPontuacao({required this.pontuacao});

  final PontuacaoDoLocal pontuacao;

  @override
  Widget build(BuildContext context) {
    final cores = BichuColors.of(context).cores;
    final textos = Theme.of(context).textTheme;
    final media = pontuacao.mediaEmTexto;

    if (!pontuacao.temAvaliacoes || media == null) {
      return _Caixa(
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: const <Widget>[
            _Titulo(texto: PaginaDoLocal.tituloSemAvaliacoes),
            SizedBox(height: BichuEspaco.e2),
            _Corpo(texto: PaginaDoLocal.explicacaoSemAvaliacoes),
          ],
        ),
      );
    }

    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: <Widget>[
        Row(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: <Widget>[
            MergeSemantics(
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: <Widget>[
                  Text(media, style: textos.displaySmall),
                  const SizedBox(height: BichuEspaco.e1),
                  _Estrelas(
                    fracao: (pontuacao.media ?? 0) / 5,
                    rotulo: 'Média $media de 5 estrelas',
                  ),
                  const SizedBox(height: BichuEspaco.e1),
                  Text(
                    'de 5',
                    style: textos.bodySmall
                        ?.copyWith(color: cores.textSecondary),
                  ),
                ],
              ),
            ),
            const SizedBox(width: BichuEspaco.e5),
            Expanded(child: _Histograma(pontuacao: pontuacao)),
          ],
        ),
        const SizedBox(height: BichuEspaco.e3),
        Text(
          pontuacao.quantidadeEmTexto,
          style: textos.bodyMedium?.copyWith(color: cores.textSecondary),
        ),
      ],
    );
  }
}

/// As cinco barras, de 5 para 1.
class _Histograma extends StatelessWidget {
  const _Histograma({required this.pontuacao});

  final PontuacaoDoLocal pontuacao;

  @override
  Widget build(BuildContext context) {
    final cores = BichuColors.of(context).cores;
    final textos = Theme.of(context).textTheme;

    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: <Widget>[
        for (final nota in PontuacaoDoLocal.notasDeCimaParaBaixo)
          Padding(
            padding: const EdgeInsets.only(bottom: BichuEspaco.e1),
            child: Semantics(
              label: pontuacao.rotuloDaBarra(nota),
              child: ExcludeSemantics(
                child: Row(
                  children: <Widget>[
                    SizedBox(
                      width: BichuEspaco.e4,
                      child: Text('$nota', style: textos.labelMedium),
                    ),
                    const SizedBox(width: BichuEspaco.e2),
                    Expanded(
                      child: ClipRRect(
                        borderRadius: BorderRadius.circular(BichuRaio.sm),
                        child: LinearProgressIndicator(
                          value: pontuacao.fracaoDaNota(nota),
                          minHeight: BichuEspaco.e2,
                          backgroundColor: cores.surfaceSunken,
                          color: cores.primary,
                        ),
                      ),
                    ),
                  ],
                ),
              ),
            ),
          ),
      ],
    );
  }
}

/// Cinco estrelas preenchidas por [fracao], de 0 a 1.
class _Estrelas extends StatelessWidget {
  const _Estrelas({required this.fracao, required this.rotulo});

  final double fracao;
  final String rotulo;

  /// 16 dp: a medida em que cinco estrelas cabem ao lado da data sem empurrar a
  /// linha para baixo com a fonte do sistema em 200%.
  static const double _medida = BichuEspaco.e4;

  @override
  Widget build(BuildContext context) {
    final cores = BichuColors.of(context).cores;
    const medida = _medida;

    return Semantics(
      label: rotulo,
      image: true,
      child: ExcludeSemantics(
        child: SizedBox(
          width: medida * 5,
          height: medida,
          child: Stack(
            children: <Widget>[
              Row(
                children: <Widget>[
                  for (var i = 0; i < 5; i++)
                    Icon(
                      Icons.star,
                      size: medida,
                      color: cores.surfaceSunken,
                    ),
                ],
              ),
              ClipRect(
                clipper: _RecorteDaFracao(fracao.clamp(0.0, 1.0)),
                child: Row(
                  children: <Widget>[
                    for (var i = 0; i < 5; i++)
                      Icon(Icons.star, size: medida, color: cores.primary),
                  ],
                ),
              ),
            ],
          ),
        ),
      ),
    );
  }
}

class _RecorteDaFracao extends CustomClipper<Rect> {
  const _RecorteDaFracao(this.fracao);

  final double fracao;

  @override
  Rect getClip(Size size) =>
      Rect.fromLTWH(0, 0, size.width * fracao, size.height);

  @override
  bool shouldReclip(_RecorteDaFracao antigo) => antigo.fracao != fracao;
}

/// A nota (obrigatoria) e o texto (opcional, com limite e contador).
class _Formulario extends StatelessWidget {
  const _Formulario({
    required this.nota,
    required this.texto,
    required this.enviando,
    required this.editando,
    required this.aoEscolherNota,
    required this.aoEnviar,
    this.erroDaNota,
    this.erro,
    this.aoCancelar,
  });

  final int? nota;
  final String? erroDaNota;
  final TextEditingController texto;
  final bool enviando;

  /// A recusa do envio, **inteira**: a faixa precisa de `acao` e de
  /// `proximaAcao` para ter saida, e nao so da frase.
  final MensagemDeErro? erro;
  final bool editando;
  final ValueChanged<int> aoEscolherNota;
  final VoidCallback aoEnviar;
  final VoidCallback? aoCancelar;

  @override
  Widget build(BuildContext context) {
    return _Caixa(
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: <Widget>[
          _SeletorDeNota(
            nota: nota,
            erro: erroDaNota,
            aoEscolher: aoEscolherNota,
          ),
          const SizedBox(height: BichuEspaco.e5),
          BichuField(
            rotulo: PaginaDoLocal.rotuloDoTexto,
            controlador: texto,
            opcional: true,
            ajuda: PaginaDoLocal.ajudaDoTexto,
            exemplo: PaginaDoLocal.exemploDoTexto,
            limite: limiteDoTextoDaAvaliacao,
            linhas: 5,
            capitalizacao: TextCapitalization.sentences,
          ),
          if (erro != null) ...<Widget>[
            const SizedBox(height: BichuEspaco.e4),
            FaixaDeAviso(
              texto: erro!.texto,
              rotuloDaAcao: erro!.acao,
              aoTocarNaAcao: saidaDaMensagem(context, erro!),
            ),
          ],
          const SizedBox(height: BichuEspaco.e4),
          SizedBox(
            width: double.infinity,
            child: BotaoPrimario(
              rotulo: editando
                  ? PaginaDoLocal.rotuloDeSalvarEdicao
                  : PaginaDoLocal.rotuloDeEnviar,
              aoTocar: aoEnviar,
              carregando: enviando,
            ),
          ),
          if (aoCancelar != null) ...<Widget>[
            const SizedBox(height: BichuEspaco.e2),
            SizedBox(
              width: double.infinity,
              child: BotaoSecundario(
                rotulo: PaginaDoLocal.rotuloDeCancelarEdicao,
                aoTocar: aoCancelar!,
              ),
            ),
          ],
          const SizedBox(height: BichuEspaco.e3),
          _Nota(texto: PaginaDoLocal.avisoDePublicacaoImediata),
        ],
      ),
    );
  }
}

/// As cinco estrelas de toque.
class _SeletorDeNota extends StatelessWidget {
  const _SeletorDeNota({
    required this.nota,
    required this.aoEscolher,
    this.erro,
  });

  final int? nota;
  final String? erro;
  final ValueChanged<int> aoEscolher;

  static String rotuloDaEstrela(int valor) =>
      valor == 1 ? '1 estrela de 5' : '$valor estrelas de 5';

  @override
  Widget build(BuildContext context) {
    final cores = BichuColors.of(context).cores;
    final textos = Theme.of(context).textTheme;
    final escolhida = nota;

    return Semantics(
      container: true,
      label: PaginaDoLocal.rotuloDaNota,
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: <Widget>[
          Text(
            PaginaDoLocal.rotuloDaNota,
            style: textos.labelLarge?.copyWith(color: cores.textPrimary),
          ),
          const SizedBox(height: BichuEspaco.e1),
          Text(
            PaginaDoLocal.ajudaDaNota,
            style: textos.bodySmall?.copyWith(color: cores.textSecondary),
          ),
          const SizedBox(height: BichuEspaco.e2),
          Row(
            children: <Widget>[
              for (var valor = 1; valor <= 5; valor++)
                Semantics(
                  inMutuallyExclusiveGroup: true,
                  checked: escolhida == valor,
                  label: rotuloDaEstrela(valor),
                  child: IconButton(
                    onPressed: () => aoEscolher(valor),
                    constraints: const BoxConstraints(
                      minWidth: BichuAlvoDeToque.min,
                      minHeight: BichuAlvoDeToque.min,
                    ),
                    icon: ExcludeSemantics(
                      child: Icon(
                        escolhida != null && valor <= escolhida
                            ? Icons.star
                            : Icons.star_outline,
                        color: escolhida != null && valor <= escolhida
                            ? cores.primary
                            : cores.outlineControl,
                      ),
                    ),
                  ),
                ),
            ],
          ),
          if (erro != null) ...<Widget>[
            const SizedBox(height: BichuEspaco.e1),
            Semantics(
              liveRegion: true,
              child: Text(
                erro!,
                style: textos.bodyMedium?.copyWith(color: cores.error),
              ),
            ),
          ],
        ],
      ),
    );
  }
}

/// O cartao de uma avaliacao: quem escreveu, a nota, a data, o texto.
class _CartaoDeAvaliacao extends StatelessWidget {
  const _CartaoDeAvaliacao({
    required this.avaliacao,
    required this.minha,
    this.aoDenunciar,
    this.aoEditar,
    this.aoApagar,
  });

  final AvaliacaoDoLocal avaliacao;
  final bool minha;
  final VoidCallback? aoDenunciar;
  final VoidCallback? aoEditar;
  final VoidCallback? aoApagar;

  /// O nome acessivel do controle de denuncia.
  static String denunciarDe(String nome) => 'Denunciar a avaliação de $nome';

  @override
  Widget build(BuildContext context) {
    final cores = BichuColors.of(context).cores;
    final textos = Theme.of(context).textTheme;
    final texto = avaliacao.texto;

    return Container(
      width: double.infinity,
      padding: const EdgeInsets.all(BichuEspaco.e4),
      decoration: BoxDecoration(
        color: minha ? cores.surfaceSunken : cores.surface,
        borderRadius: BorderRadius.circular(BichuRaio.lg),
        border: Border.all(
          color: minha ? cores.primary : cores.outline,
          width: minha ? BichuBorda.medium : BichuBorda.hairline,
        ),
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: <Widget>[
          MergeSemantics(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: <Widget>[
                if (minha) ...<Widget>[
                  _Selo(texto: PaginaDoLocal.seloDaMinha),
                  const SizedBox(height: BichuEspaco.e3),
                ],
                Text(avaliacao.nomeDeQuemLe, style: textos.titleSmall),
                const SizedBox(height: BichuEspaco.e2),
                Row(
                  children: <Widget>[
                    _Estrelas(
                      fracao: avaliacao.nota / 5,
                      rotulo: avaliacao.notaEmTexto,
                    ),
                    const SizedBox(width: BichuEspaco.e2),
                    Text(
                      avaliacao.foiEditada
                          ? '${avaliacao.dataEmTexto} · '
                              '${PaginaDoLocal.marcaDeEditada}'
                          : avaliacao.dataEmTexto,
                      style: textos.bodySmall
                          ?.copyWith(color: cores.textSecondary),
                    ),
                  ],
                ),
                if (texto != null) ...<Widget>[
                  const SizedBox(height: BichuEspaco.e3),
                  Text(
                    texto,
                    style:
                        textos.bodyMedium?.copyWith(color: cores.textPrimary),
                  ),
                ],
              ],
            ),
          ),
          if (aoEditar != null || aoApagar != null) ...<Widget>[
            const SizedBox(height: BichuEspaco.e2),
            Row(
              children: <Widget>[
                if (aoEditar != null)
                  TextButton(
                    onPressed: aoEditar,
                    child: const Text(PaginaDoLocal.rotuloDeEditar),
                  ),
                if (aoApagar != null)
                  TextButton(
                    onPressed: aoApagar,
                    style: TextButton.styleFrom(foregroundColor: cores.error),
                    child: const Text(PaginaDoLocal.rotuloDeApagar),
                  ),
              ],
            ),
          ],
          if (aoDenunciar != null) ...<Widget>[
            const SizedBox(height: BichuEspaco.e2),
            Align(
              alignment: Alignment.centerLeft,
              child: TextButton.icon(
                onPressed: aoDenunciar,
                icon: const Icon(Icons.flag_outlined),
                style: TextButton.styleFrom(
                  foregroundColor: cores.textSecondary,
                ),
                label: Text(denunciarDe(avaliacao.nomeDeQuemLe)),
              ),
            ),
          ],
        ],
      ),
    );
  }
}

/// As tres ordens do contrato, no corpo da tela.
class _ChipsDeOrdem extends StatelessWidget {
  const _ChipsDeOrdem({required this.ordem, required this.aoTrocar});

  final OrdemDasAvaliacoes ordem;
  final ValueChanged<OrdemDasAvaliacoes> aoTrocar;

  @override
  Widget build(BuildContext context) {
    final cores = BichuColors.of(context).cores;
    final textos = Theme.of(context).textTheme;

    return Semantics(
      container: true,
      label: PaginaDoLocal.rotuloDeOrdenar,
      child: Wrap(
        spacing: BichuAlvoDeToque.gapMin,
        runSpacing: BichuAlvoDeToque.gapMin,
        children: <Widget>[
          for (final o in OrdemDasAvaliacoes.values)
            Semantics(
              inMutuallyExclusiveGroup: true,
              selected: o == ordem,
              button: true,
              label: o.rotulo,
              child: ExcludeSemantics(
                child: InkWell(
                  onTap: () => aoTrocar(o),
                  borderRadius: BorderRadius.circular(BichuRaio.full),
                  child: Container(
                    constraints: const BoxConstraints(
                      minHeight: BichuAlvoDeToque.min,
                    ),
                    alignment: Alignment.center,
                    padding: const EdgeInsets.symmetric(
                      horizontal: BichuEspaco.e4,
                    ),
                    decoration: BoxDecoration(
                      color:
                          o == ordem ? cores.primaryContainer : cores.surface,
                      borderRadius: BorderRadius.circular(BichuRaio.full),
                      border: Border.all(
                        color: o == ordem ? cores.primary : cores.outline,
                        width: o == ordem
                            ? BichuBorda.medium
                            : BichuBorda.hairline,
                      ),
                    ),
                    child: Text(
                      o.rotulo,
                      style: textos.labelLarge?.copyWith(
                        color: o == ordem
                            ? cores.onPrimaryContainer
                            : cores.textPrimary,
                      ),
                    ),
                  ),
                ),
              ),
            ),
        ],
      ),
    );
  }
}

/// A denuncia de uma avaliacao: motivo de **lista fechada** e detalhe opcional.
class _FolhaDeDenuncia extends StatefulWidget {
  const _FolhaDeDenuncia({
    required this.nomeDeQuemEscreveu,
    required this.aoEnviar,
  });

  final String nomeDeQuemEscreveu;

  final Future<void> Function(MotivoDaDenuncia motivo, String? detalhe)
      aoEnviar;

  static const String titulo = 'Denunciar esta avaliação';

  static const String explicacao =
      'A denúncia vai para a moderação do Bichu. A avaliação continua na '
      'página enquanto a equipe não decidir — esconder na denúncia tornaria a '
      'denúncia o jeito mais fácil de apagar a avaliação de um concorrente.';

  static const String rotuloDoMotivo = 'Motivo';
  static const String rotuloDoDetalhe = 'Quer contar mais?';
  static const String escolhaUmMotivo = 'Escolha um motivo.';
  static const String rotuloDeEnviar = 'Enviar denúncia';
  static const String rotuloDeCancelar = 'Cancelar';

  static const String recebida =
      'Denúncia recebida. A moderação do Bichu vai olhar.';

  @override
  State<_FolhaDeDenuncia> createState() => _FolhaDeDenunciaState();
}

class _FolhaDeDenunciaState extends State<_FolhaDeDenuncia> {
  MotivoDaDenuncia? _motivo;
  final TextEditingController _detalhe = TextEditingController();
  bool _enviando = false;
  String? _erro;
  String? _erroDoMotivo;

  @override
  void dispose() {
    _detalhe.dispose();
    super.dispose();
  }

  Future<void> _enviar() async {
    final motivo = _motivo;
    if (motivo == null) {
      setState(() => _erroDoMotivo = _FolhaDeDenuncia.escolhaUmMotivo);
      return;
    }
    setState(() {
      _enviando = true;
      _erro = null;
    });
    try {
      await widget.aoEnviar(motivo, _detalhe.text);
      if (!mounted) return;
      Navigator.of(context).pop(true);
    } on FalhaDeChamada catch (falha) {
      if (!mounted) return;
      setState(() {
        _enviando = false;
        _erro = MensagensDeErro.de(falha).texto;
      });
    } on FormatException {
      if (!mounted) return;
      setState(() {
        _enviando = false;
        _erro = MensagensDeErro.servidorFora;
      });
    }
  }

  @override
  Widget build(BuildContext context) {
    final cores = BichuColors.of(context).cores;
    final textos = Theme.of(context).textTheme;

    return Padding(
      padding: EdgeInsets.only(
        left: BichuEspaco.e4,
        right: BichuEspaco.e4,
        bottom: BichuEspaco.e4 + MediaQuery.viewInsetsOf(context).bottom,
      ),
      child: SingleChildScrollView(
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: <Widget>[
            Semantics(
              header: true,
              child: Text(
                _FolhaDeDenuncia.titulo,
                style: textos.titleLarge,
              ),
            ),
            const SizedBox(height: BichuEspaco.e2),
            Text(
              _FolhaDeDenuncia.explicacao,
              style: textos.bodyMedium?.copyWith(color: cores.textSecondary),
            ),
            const SizedBox(height: BichuEspaco.e4),
            GrupoDeOpcoes<MotivoDaDenuncia>(
              rotulo: _FolhaDeDenuncia.rotuloDoMotivo,
              selecionado: _motivo,
              erro: _erroDoMotivo,
              opcoes: <OpcaoDeLinha<MotivoDaDenuncia>>[
                for (final m in MotivoDaDenuncia.values)
                  OpcaoDeLinha<MotivoDaDenuncia>(
                    valor: m,
                    rotulo: m.rotulo,
                  ),
              ],
              aoSelecionar: (m) => setState(() {
                _motivo = m;
                _erroDoMotivo = null;
              }),
            ),
            const SizedBox(height: BichuEspaco.e4),
            BichuField(
              rotulo: _FolhaDeDenuncia.rotuloDoDetalhe,
              controlador: _detalhe,
              opcional: true,
              limite: limiteDoDetalheDaDenuncia,
              linhas: 3,
              capitalizacao: TextCapitalization.sentences,
            ),
            if (_erro != null) ...<Widget>[
              const SizedBox(height: BichuEspaco.e4),
              FaixaDeAviso(texto: _erro!),
            ],
            const SizedBox(height: BichuEspaco.e4),
            SizedBox(
              width: double.infinity,
              child: BotaoPrimario(
                rotulo: _FolhaDeDenuncia.rotuloDeEnviar,
                aoTocar: _enviar,
                carregando: _enviando,
              ),
            ),
            const SizedBox(height: BichuEspaco.e2),
            SizedBox(
              width: double.infinity,
              child: BotaoSecundario(
                rotulo: _FolhaDeDenuncia.rotuloDeCancelar,
                aoTocar: () => Navigator.of(context).pop(false),
              ),
            ),
          ],
        ),
      ),
    );
  }
}

/// A margem lateral da pagina: a mesma de `loja/produto_da_loja.dart` e de
/// `rede/encontro_da_rede.dart`.
class _Margem extends StatelessWidget {
  const _Margem({required this.child});
  final Widget child;

  @override
  Widget build(BuildContext context) => Padding(
        padding: const EdgeInsets.symmetric(horizontal: BichuEspaco.e4),
        child: child,
      );
}

/// Um bloco com icone e titulo, no mesmo desenho do detalhe do produto.
class _Secao extends StatelessWidget {
  const _Secao({
    required this.icone,
    required this.titulo,
    required this.child,
  });

  final IconData icone;
  final String titulo;
  final Widget child;

  @override
  Widget build(BuildContext context) {
    final cores = BichuColors.of(context).cores;
    final textos = Theme.of(context).textTheme;
    return _Margem(
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: <Widget>[
          Row(
            children: <Widget>[
              ExcludeSemantics(child: Icon(icone, color: cores.primary)),
              const SizedBox(width: BichuEspaco.e2),
              Expanded(
                child: Semantics(
                  header: true,
                  child: Text(titulo, style: textos.titleMedium),
                ),
              ),
            ],
          ),
          const SizedBox(height: BichuEspaco.e3),
          child,
        ],
      ),
    );
  }
}

/// O divisor entre secoes, com a margem da pagina.
class _Divisor extends StatelessWidget {
  const _Divisor();

  @override
  Widget build(BuildContext context) {
    final cores = BichuColors.of(context).cores;
    return Padding(
      padding: const EdgeInsets.symmetric(vertical: BichuEspaco.e6),
      child: Divider(
        height: BichuBorda.hairline,
        thickness: BichuBorda.hairline,
        color: cores.outline,
        indent: BichuEspaco.e4,
        endIndent: BichuEspaco.e4,
      ),
    );
  }
}

/// O bloco `Atividades`: uma tag por atividade escolhida (cliente, 28/10/2026).
class _Atividades extends StatelessWidget {
  const _Atividades({required this.atividades});

  /// Na ORDEM DO SERVIDOR. Ver `DetalheDoLocal.atividades`: ordenar aqui
  /// mostraria as tags numa ordem que ninguem escolheu.
  final List<AtividadeDoDiretorio> atividades;

  @override
  Widget build(BuildContext context) {
    return Wrap(
      spacing: BichuEspaco.e2,
      runSpacing: BichuEspaco.e2,
      children: <Widget>[
        for (final atividade in atividades) _Selo(texto: atividade.rotulo),
      ],
    );
  }
}

/// A caixa neutra que embrulha um bloco de conteudo: mesmo desenho do cartao.
class _Caixa extends StatelessWidget {
  const _Caixa({required this.child});

  final Widget child;

  @override
  Widget build(BuildContext context) {
    final cores = BichuColors.of(context).cores;
    return Container(
      width: double.infinity,
      padding: const EdgeInsets.all(BichuEspaco.e4),
      decoration: BoxDecoration(
        color: cores.surface,
        borderRadius: BorderRadius.circular(BichuRaio.lg),
        border: Border.all(color: cores.outline, width: BichuBorda.hairline),
      ),
      child: child,
    );
  }
}

class _Titulo extends StatelessWidget {
  const _Titulo({required this.texto});

  final String texto;

  @override
  Widget build(BuildContext context) {
    return Semantics(
      header: true,
      child: Text(texto, style: Theme.of(context).textTheme.titleMedium),
    );
  }
}

class _Corpo extends StatelessWidget {
  const _Corpo({required this.texto});

  final String texto;

  @override
  Widget build(BuildContext context) {
    final cores = BichuColors.of(context).cores;
    return Text(
      texto,
      style: Theme.of(context)
          .textTheme
          .bodyMedium
          ?.copyWith(color: cores.textPrimary),
    );
  }
}

/// Uma observacao discreta, em `body-sm` e `text-secondary`.
class _Nota extends StatelessWidget {
  const _Nota({required this.texto});

  final String texto;

  @override
  Widget build(BuildContext context) {
    final cores = BichuColors.of(context).cores;
    return Text(
      texto,
      style: Theme.of(context)
          .textTheme
          .bodySmall
          ?.copyWith(color: cores.textSecondary),
    );
  }
}

/// A pilula neutra: a palavra e a informacao, e nenhuma cor diz nada.
class _Selo extends StatelessWidget {
  const _Selo({required this.texto});

  final String texto;

  @override
  Widget build(BuildContext context) {
    final cores = BichuColors.of(context).cores;
    final textos = Theme.of(context).textTheme;

    return Container(
      padding: const EdgeInsets.symmetric(
        horizontal: BichuEspaco.e3,
        vertical: BichuEspaco.e1,
      ),
      decoration: BoxDecoration(
        color: cores.surfaceSunken,
        borderRadius: BorderRadius.circular(BichuRaio.full),
        border: Border.all(color: cores.outline, width: BichuBorda.hairline),
      ),
      child: Text(
        texto,
        style: textos.labelSmall?.copyWith(color: cores.textPrimary),
      ),
    );
  }
}

/// Uma linha de meta: icone e texto.
class _LinhaComIcone extends StatelessWidget {
  const _LinhaComIcone({
    required this.icone,
    required this.texto,
    this.aoTocar,
    this.rotuloAcessivel,
  }) : assert(
          aoTocar == null || rotuloAcessivel != null,
          'Linha tocavel sem nome acessivel: o leitor de tela anunciaria o '
          'endereco e nao diria que ele leva a algum lugar.',
        );

  final IconData icone;
  final String texto;

  /// Nulo: a linha e texto, como sempre foi.
  final VoidCallback? aoTocar;

  /// O que o leitor de tela anuncia no lugar do texto visivel.
  final String? rotuloAcessivel;

  @override
  Widget build(BuildContext context) {
    final cores = BichuColors.of(context).cores;
    final textos = Theme.of(context).textTheme;

    final linha = Row(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: <Widget>[
        ExcludeSemantics(
          child: Icon(icone, size: BichuEspaco.e5, color: cores.textSecondary),
        ),
        const SizedBox(width: BichuEspaco.e2),
        Expanded(
          child: Text(
            texto,
            style: textos.bodyMedium?.copyWith(color: cores.textSecondary),
          ),
        ),
      ],
    );

    final toque = aoTocar;
    if (toque == null) return linha;

    return Semantics(
      button: true,
      label: rotuloAcessivel,
      excludeSemantics: true,
      child: InkWell(
        onTap: toque,
        child: ConstrainedBox(
          constraints: const BoxConstraints(minHeight: BichuAlvoDeToque.min),
          child: Align(alignment: Alignment.centerLeft, child: linha),
        ),
      ),
    );
  }
}

/// O esqueleto da pagina: nome, duas linhas de meta e o bloco da pontuacao.
class _EsqueletoDoLocal extends StatelessWidget {
  const _EsqueletoDoLocal();

  @override
  Widget build(BuildContext context) {
    return Semantics(
      label: PaginaDoLocal.carregandoOLocal,
      child: const Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: <Widget>[
          _Barra(fracao: 0.7),
          SizedBox(height: BichuEspaco.e3),
          _Barra(fracao: 0.4),
          SizedBox(height: BichuEspaco.e3),
          _Barra(fracao: 0.5),
          SizedBox(height: BichuEspaco.e6),
          _Barra(fracao: 0.9),
          SizedBox(height: BichuEspaco.e3),
          _Barra(fracao: 0.8),
        ],
      ),
    );
  }
}

/// O esqueleto da lista de avaliacoes: duas linhas por item.
class _EsqueletoDeAvaliacoes extends StatelessWidget {
  const _EsqueletoDeAvaliacoes();

  @override
  Widget build(BuildContext context) {
    return const ExcludeSemantics(
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: <Widget>[
          _Barra(fracao: 0.35),
          SizedBox(height: BichuEspaco.e2),
          _Barra(fracao: 0.9),
          SizedBox(height: BichuEspaco.e5),
          _Barra(fracao: 0.3),
          SizedBox(height: BichuEspaco.e2),
          _Barra(fracao: 0.75),
        ],
      ),
    );
  }
}

class _Barra extends StatelessWidget {
  const _Barra({required this.fracao});

  final double fracao;

  @override
  Widget build(BuildContext context) {
    final cores = BichuColors.of(context).cores;
    return FractionallySizedBox(
      alignment: Alignment.centerLeft,
      widthFactor: fracao,
      child: Container(
        height: MediaQuery.textScalerOf(context).scale(BichuEspaco.e3),
        decoration: BoxDecoration(
          color: cores.surfaceSunken,
          borderRadius: BorderRadius.circular(BichuRaio.sm),
        ),
      ),
    );
  }
}
