import 'dart:async';

import 'package:flutter/material.dart';
import 'package:go_router/go_router.dart';

import '../../api/api_client.dart';
import '../../api/falhas.dart';
import '../../api/fila_offline.dart';
import '../../api/mensagens_de_erro.dart';
import '../../api/modelos_pet.dart';
import '../../api/pets_api.dart';
import '../../escopo.dart';
import '../../roteamento/rotas.dart';
import '../../theme/bichu_colors.dart';
import '../../theme/bichu_tokens.g.dart';
import '../../widgets/bichu_field.dart';
import '../../widgets/botao_primario.dart';
import '../../widgets/faixa_de_aviso.dart';
import '../../widgets/moldura.dart';
import '../../widgets/saida_da_tela.dart';

/// O que a tela do codigo resolvido mostra, e por que ela tem **tres** formas.
enum FormaDaTelaDaTag {
  /// `F2.3`: o tutor apontou a camera para a plaquinha do proprio pet.
  modoDono,

  /// `F2.2`: quem escaneou nao e o dono, e **nao ha caso aberto**.
  achouOPet,

  /// Quem escaneou nao e o dono e **o tutor marcou o pet como perdido**.
  mensagemAoTutor;

  static FormaDaTelaDaTag de(QuemEscaneou quem, {required bool estaPerdido}) {
    return switch (quem) {
      QuemEscaneou.dono => FormaDaTelaDaTag.modoDono,
      QuemEscaneou.outroLogado || QuemEscaneou.anonimo => estaPerdido
          ? FormaDaTelaDaTag.mensagemAoTutor
          : FormaDaTelaDaTag.achouOPet,
    };
  }

  /// Se esta forma e a de quem **nao** e o dono, nas duas variantes.
  bool get eDoAchador => this != FormaDaTelaDaTag.modoDono;
}

/// F2.2 e F2.3: o que a pessoa ve depois de o codigo da tag resolver.
class TelaDoPetDaTag extends StatelessWidget {
  const TelaDoPetDaTag({required this.tag, required this.codigo, super.key});

  final TagResolvida tag;

  /// O codigo da plaquinha, **como veio no caminho da rota**.
  final String codigo;

  /// A faixa do modo dono sem caso aberto (UX F2.3, primeira configuracao).
  static String faixaDeDonoDe(String nome) => 'Esta tag é de $nome.';

  /// A faixa do modo dono **com** caso aberto.
  static String faixaDeDonoComCasoDe(String nome, DateTime? desde) {
    if (desde == null) return 'Há um caso aberto para $nome.';
    return 'Há um caso aberto para $nome desde ${_comoData(desde)}.';
  }

  /// A faixa de urgencia da F4.1, item 7, para quem **nao** e o dono.
  static String faixaDePerdidoDe(String nome, DateTime? desde) {
    if (desde == null) return 'O tutor está procurando $nome.';
    return 'O tutor está procurando $nome desde ${_comoData(desde)}.';
  }

  static String _comoData(DateTime quando) {
    final local = quando.toLocal();
    final dia = local.day.toString().padLeft(2, '0');
    final mes = local.month.toString().padLeft(2, '0');
    return '$dia/$mes';
  }

  /// O titulo da F4.1, item 2.
  static String tituloDoAchadorDe(String nome) => 'Este é o $nome.';

  /// A atribuicao do cartao de manejo (F4.1, item 4).
  static String atribuicaoDosCuidadosDe(String nome) =>
      'O tutor de $nome '
      'escreveu:';

  /// O titulo do cartao de manejo.
  static String tituloDosCuidadosDe(String nome) => 'Cuidados com $nome';

  /// A linha de sinais da F4.1, item 3, com o separador do 11.3.
  static String sinaisDe(TagResolvida tag) {
    final partes = <String>[
      tag.especie.rotulo,
      if (tag.porte != null) 'porte ${tag.porte!.rotulo.toLowerCase()}',
      if (_temTexto(tag.racaRotulo)) tag.racaRotulo!.trim(),
      if (_temTexto(tag.corPrincipal)) tag.corPrincipal!.trim(),
      if (_temTexto(tag.sinaisDistintivos)) tag.sinaisDistintivos!.trim(),
    ];
    return partes.join(' · ');
  }

  static bool _temTexto(String? valor) =>
      valor != null && valor.trim().isNotEmpty;

  @override
  Widget build(BuildContext context) {
    final forma = FormaDaTelaDaTag.de(
      tag.quemEscaneou,
      estaPerdido: tag.estaPerdido,
    );
    final cores = BichuColors.of(context).cores;

    return Scaffold(
      backgroundColor: cores.surface,
      appBar: AppBar(
        leading: const SaidaDaTela(tipo: TipoDeSaida.voltar),
      ),
      body: SafeArea(
        top: false,
        child: SingleChildScrollView(
          padding: const EdgeInsets.fromLTRB(
            BichuEspaco.e4,
            BichuEspaco.e2,
            BichuEspaco.e4,
            BichuEspaco.e8,
          ),
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.stretch,
            children: <Widget>[
              ..._faixa(context, forma),
              ..._foto(tag),
              Text(
                switch (forma) {
                  FormaDaTelaDaTag.modoDono => tag.nomeDoPet,
                  FormaDaTelaDaTag.achouOPet ||
                  FormaDaTelaDaTag.mensagemAoTutor => tituloDoAchadorDe(
                    tag.nomeDoPet,
                  ),
                },
                style: Theme.of(context).textTheme.displayLarge
                    ?.copyWith(color: cores.textPrimary),
              ),
              if (forma == FormaDaTelaDaTag.mensagemAoTutor) ...<Widget>[
                const SizedBox(height: BichuEspaco.e6),
                _AvisoAoTutor(tag: tag, codigo: codigo, comRecado: true),
              ],
              const SizedBox(height: BichuEspaco.e4),
              _CartaoDeSinais(tag: tag),
              if (_temTexto(tag.notasDeCuidado)) ...<Widget>[
                const SizedBox(height: BichuEspaco.e4),
                _CartaoDeManejo(tag: tag),
              ],
              if (forma == FormaDaTelaDaTag.achouOPet) ...<Widget>[
                const SizedBox(height: BichuEspaco.e6),
                _AvisoAoTutor(tag: tag, codigo: codigo),
              ],
              if (forma == FormaDaTelaDaTag.modoDono) ...<Widget>[
                const SizedBox(height: BichuEspaco.e6),
                _PaginaDoPetDoDono(codigo: codigo, nome: tag.nomeDoPet),
              ],
            ],
          ),
        ),
      ),
    );
  }

  List<Widget> _foto(TagResolvida tag) {
    final url = tag.fotoUrl;
    if (url == null || url.trim().isEmpty) return const <Widget>[];
    return <Widget>[
      _FotoDoPetDaTag(url: url, nome: tag.nomeDoPet),
      const SizedBox(height: BichuEspaco.e4),
    ];
  }

  List<Widget> _faixa(BuildContext context, FormaDaTelaDaTag forma) {
    final texto = switch (forma) {
      FormaDaTelaDaTag.modoDono =>
        tag.estaPerdido
            ? faixaDeDonoComCasoDe(tag.nomeDoPet, tag.perdidoDesde)
            : faixaDeDonoDe(tag.nomeDoPet),
      FormaDaTelaDaTag.mensagemAoTutor => faixaDePerdidoDe(
        tag.nomeDoPet,
        tag.perdidoDesde,
      ),
      FormaDaTelaDaTag.achouOPet => null,
    };
    if (texto == null) return const <Widget>[];
    return <Widget>[
      _FaixaDaTag(texto: texto, urgente: tag.estaPerdido),
      const SizedBox(height: BichuEspaco.e6),
    ];
  }
}

/// A foto do pet no topo da tela da tag.
class _FotoDoPetDaTag extends StatelessWidget {
  const _FotoDoPetDaTag({required this.url, required this.nome});

  final String url;
  final String nome;

  @override
  Widget build(BuildContext context) {
    return Semantics(
      image: true,
      label: 'Foto de $nome',
      child: Center(
        child: Moldura(
          largura: BichuMoldura.larguraFotoLg,
          estado: EstadoDaMoldura.repouso,
          filho: Image.network(
            url,
            fit: BoxFit.cover,
            alignment: const Alignment(0, -1 / 3),
            errorBuilder: (context, erro, pilha) => const SizedBox.shrink(),
          ),
        ),
      ),
    );
  }
}

/// A faixa do topo, nas duas intensidades que a tela de fato produz.
class _FaixaDaTag extends StatelessWidget {
  const _FaixaDaTag({required this.texto, required this.urgente});

  final String texto;
  final bool urgente;

  @override
  Widget build(BuildContext context) {
    final cores = BichuColors.of(context).cores;
    final textos = Theme.of(context).textTheme;
    return Semantics(
      liveRegion: true,
      container: true,
      child: Container(
        width: double.infinity,
        padding: const EdgeInsets.all(BichuEspaco.e4),
        decoration: BoxDecoration(
          color: urgente ? cores.urgency : cores.surfaceAlt,
          borderRadius: BorderRadius.circular(BichuRaio.lg),
        ),
        child: Text(
          texto,
          style: textos.titleLarge?.copyWith(
            color: urgente ? cores.onUrgency : cores.textPrimary,
          ),
        ),
      ),
    );
  }
}

/// O cartao de sinais: o item 3 da F4.1, e o que o 5.4 manda subir no lugar da
/// foto que nao veio.
class _CartaoDeSinais extends StatelessWidget {
  const _CartaoDeSinais({required this.tag});

  final TagResolvida tag;

  @override
  Widget build(BuildContext context) {
    final cores = BichuColors.of(context).cores;
    final textos = Theme.of(context).textTheme;
    return Container(
      width: double.infinity,
      padding: const EdgeInsets.all(BichuEspaco.e4),
      decoration: BoxDecoration(
        color: cores.surfaceAlt,
        borderRadius: BorderRadius.circular(BichuRaio.lg),
      ),
      child: Text(
        TelaDoPetDaTag.sinaisDe(tag),
        style: textos.bodyLarge?.copyWith(color: cores.textPrimary),
      ),
    );
  }
}

/// O cartao de manejo (`care_notes`), com a atribuicao em cima.
class _CartaoDeManejo extends StatelessWidget {
  const _CartaoDeManejo({required this.tag});

  final TagResolvida tag;

  @override
  Widget build(BuildContext context) {
    final cores = BichuColors.of(context).cores;
    final textos = Theme.of(context).textTheme;
    return Container(
      width: double.infinity,
      padding: const EdgeInsets.all(BichuEspaco.e4),
      decoration: BoxDecoration(
        color: cores.surface,
        borderRadius: BorderRadius.circular(BichuRaio.lg),
        border: Border.all(color: cores.outline),
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: <Widget>[
          Text(
            TelaDoPetDaTag.tituloDosCuidadosDe(tag.nomeDoPet),
            style: textos.titleMedium?.copyWith(color: cores.textPrimary),
          ),
          const SizedBox(height: BichuEspaco.e2),
          Text(
            TelaDoPetDaTag.atribuicaoDosCuidadosDe(tag.nomeDoPet),
            style: textos.bodyMedium?.copyWith(color: cores.textSecondary),
          ),
          const SizedBox(height: BichuEspaco.e1),
          Text(
            tag.notasDeCuidado!.trim(),
            style: textos.bodyLarge?.copyWith(color: cores.textPrimary),
          ),
        ],
      ),
    );
  }
}

enum _EstadoDoAviso { pronto, enviando, avisado, naFila, falhou }

/// O botao `Avisar o tutor` e os quatro desfechos dele.
class _AvisoAoTutor extends StatefulWidget {
  const _AvisoAoTutor({
    required this.tag,
    required this.codigo,
    this.comRecado = false,
  });

  final TagResolvida tag;
  final String codigo;

  /// Se o campo de RECADO entra, e com ele o rotulo de "enviar mensagem".
  final bool comRecado;

  /// O rotulo do botao, que muda quando este aparelho **ja avisou** nas ultimas
  /// 24 h (`already_notified`).
  static String rotuloDe(TagResolvida tag, {bool comRecado = false}) {
    if (comRecado) {
      return tag.jaAvisouDesteAparelho
          ? 'Enviar outra mensagem ao tutor'
          : 'Enviar mensagem ao tutor';
    }
    return tag.jaAvisouDesteAparelho ? 'Avisar o tutor de novo' : 'Avisar o tutor';
  }

  /// O titulo do bloco de mensagem, na forma de pet perdido.
  static const String tituloDaMensagem = 'Fale com o tutor';

  /// O rotulo do campo de recado.
  static const String rotuloDoRecado = 'Sua mensagem';

  static const String ajudaDoRecado =
      'Conte onde o animal esta e como o tutor pode te encontrar. O endereco '
      'exato nao e necessario.';

  /// O teto do campo, que e o do contrato (`client_note`, maxLength 500).
  static const int limiteDoRecado = 500;

  /// O texto do desfecho bom **quando a entrega saiu** (`owner_notified:
  /// true`).
  static const String textoDeAvisado =
      'O tutor foi avisado. Ele recebeu o aviso no celular agora.';

  /// O texto do desfecho bom **quando a entrega NAO saiu** (`owner_notified:
  /// false`).
  static const String textoDeRegistrado =
      'Seu recado esta registrado no caso do animal, e o tutor o ve ao abrir '
      'o Bichu. Se puder, fique por perto.';

  /// O texto de quando o aviso foi para a fila.
  static const String textoDaFila =
      'Você está sem sinal. O aviso ficou guardado e sai sozinho quando o '
      'sinal voltar. Se puder, fique por perto do animal.';

  @override
  State<_AvisoAoTutor> createState() => _AvisoAoTutorState();
}

class _AvisoAoTutorState extends State<_AvisoAoTutor> {
  final String _chave = ApiClient.novaChaveDeIdempotencia();

  final TextEditingController _recado = TextEditingController();

  _EstadoDoAviso _estado = _EstadoDoAviso.pronto;
  String? _erro;

  bool? _entregaSaiu;

  @override
  void dispose() {
    _recado.dispose();
    super.dispose();
  }

  Future<void> _avisar() async {
    final escopo = Escopo.of(context);
    setState(() {
      _estado = _EstadoDoAviso.enviando;
      _erro = null;
    });

    try {
      final criado = await escopo.tags.avisarOTutor(
        widget.codigo,
        idempotencyKey: _chave,
        recadoDoAchador: widget.comRecado ? _recado.text : null,
      );
      if (!mounted) return;
      setState(() {
        _estado = _EstadoDoAviso.avisado;
        _entregaSaiu = criado.tutorAvisado;
      });
    } on FalhaDeConexao {
      await escopo.fila.enfileirar(
        AcaoEnfileirada(
          id: ApiClient.novaChaveDeIdempotencia(),
          metodo: 'POST',
          caminho: TagsApi.caminhoDoAviso(widget.codigo),
          corpo: TagsApi.corpoDoAviso(
            recadoDoAchador: widget.comRecado ? _recado.text : null,
          ),
          idempotencyKey: _chave,
          criadaEm: DateTime.now(),
        ),
      );
      if (!mounted) return;
      setState(() => _estado = _EstadoDoAviso.naFila);
    } on FalhaDeChamada catch (falha) {
      if (!mounted) return;
      setState(() {
        _estado = _EstadoDoAviso.falhou;
        _erro = MensagensDeErro.de(falha).texto;
      });
    } on Object catch (erro, pilha) {
      registrarFalhaInesperada(erro, pilha, onde: 'aviso ao tutor pela tag');
      if (!mounted) return;
      setState(() {
        _estado = _EstadoDoAviso.falhou;
        _erro = MensagensDeErro.servidorFora;
      });
    }
  }

  @override
  Widget build(BuildContext context) {
    return switch (_estado) {
      _EstadoDoAviso.avisado => _DesfechoDoAviso(
          texto: _entregaSaiu == true
              ? _AvisoAoTutor.textoDeAvisado
              : _AvisoAoTutor.textoDeRegistrado,
          peso: PesoDaFaixa.informativo,
        ),
      _EstadoDoAviso.naFila => const _DesfechoDoAviso(
          texto: _AvisoAoTutor.textoDaFila,
          peso: PesoDaFaixa.informativo,
        ),
      _EstadoDoAviso.pronto ||
      _EstadoDoAviso.enviando ||
      _EstadoDoAviso.falhou => Column(
          crossAxisAlignment: CrossAxisAlignment.stretch,
          children: <Widget>[
            if (_erro != null) ...<Widget>[
              FaixaDeAviso(texto: _erro!),
              const SizedBox(height: BichuEspaco.e4),
            ],
            if (widget.comRecado) ...<Widget>[
              Text(
                _AvisoAoTutor.tituloDaMensagem,
                style: Theme.of(context).textTheme.titleMedium?.copyWith(
                      color: BichuColors.of(context).cores.textPrimary,
                    ),
              ),
              const SizedBox(height: BichuEspaco.e3),
              BichuField(
                rotulo: _AvisoAoTutor.rotuloDoRecado,
                controlador: _recado,
                ajuda: _AvisoAoTutor.ajudaDoRecado,
                opcional: true,
                limite: _AvisoAoTutor.limiteDoRecado,
                linhas: 4,
                capitalizacao: TextCapitalization.sentences,
                habilitado: _estado != _EstadoDoAviso.enviando,
              ),
              const SizedBox(height: BichuEspaco.e4),
            ],
            BotaoPrimario(
              rotulo: _AvisoAoTutor.rotuloDe(
                widget.tag,
                comRecado: widget.comRecado,
              ),
              carregando: _estado == _EstadoDoAviso.enviando,
              aoTocar: _estado == _EstadoDoAviso.enviando ? null : _avisar,
            ),
          ],
        ),
    };
  }
}

/// O DONO ESCANEOU A PROPRIA PLAQUINHA: carrega a pagina do pet.
class _PaginaDoPetDoDono extends StatefulWidget {
  const _PaginaDoPetDoDono({required this.codigo, required this.nome});

  final String codigo;
  final String nome;

  /// O que a tela diz enquanto a ida acontece.
  static String carregandoDe(String nome) => 'Abrindo a pagina de $nome...';

  static const String rotuloDeAtualizar = 'Atualizar';

  @override
  State<_PaginaDoPetDoDono> createState() => _PaginaDoPetDoDonoState();
}

class _PaginaDoPetDoDonoState extends State<_PaginaDoPetDoDono> {
  bool _carregando = true;
  String? _erro;

  @override
  void initState() {
    super.initState();
    WidgetsBinding.instance.addPostFrameCallback((_) {
      if (mounted) unawaited(_abrir());
    });
  }

  Future<void> _abrir() async {
    final escopo = Escopo.of(context);
    final navegador = GoRouter.of(context);
    setState(() {
      _carregando = true;
      _erro = null;
    });

    try {
      final contexto = await escopo.tags.contextoDoDono(widget.codigo);
      if (!mounted) return;
      if (contexto.petId.isEmpty) {
        setState(() {
          _carregando = false;
          _erro = MensagensDeErro.servidorFora;
        });
        return;
      }
      navegador.pushReplacement(Rotas.detalheDoPetDe(contexto.petId));
    } on FalhaDeChamada catch (falha) {
      if (!mounted) return;
      setState(() {
        _carregando = false;
        _erro = MensagensDeErro.de(falha).texto;
      });
    } on Object catch (erro, pilha) {
      registrarFalhaInesperada(erro, pilha, onde: 'pagina do pet pela tag');
      if (!mounted) return;
      setState(() {
        _carregando = false;
        _erro = MensagensDeErro.servidorFora;
      });
    }
  }

  @override
  Widget build(BuildContext context) {
    final erro = _erro;
    if (erro != null) {
      return FaixaDeAviso(
        texto: erro,
        rotuloDaAcao: _PaginaDoPetDoDono.rotuloDeAtualizar,
        aoTocarNaAcao: () => unawaited(_abrir()),
      );
    }
    if (!_carregando) return const SizedBox.shrink();
    return Row(
      children: <Widget>[
        const SizedBox(
          width: 16,
          height: 16,
          child: CircularProgressIndicator(strokeWidth: 2),
        ),
        const SizedBox(width: BichuEspaco.e3),
        Expanded(
          child: Text(
            _PaginaDoPetDoDono.carregandoDe(widget.nome),
            style: Theme.of(context).textTheme.bodyMedium?.copyWith(
                  color: BichuColors.of(context).cores.textSecondary,
                ),
          ),
        ),
      ],
    );
  }
}

/// O desfecho do aviso, no lugar do botao.
class _DesfechoDoAviso extends StatelessWidget {
  const _DesfechoDoAviso({required this.texto, required this.peso});

  final String texto;
  final PesoDaFaixa peso;

  @override
  Widget build(BuildContext context) {
    return Semantics(
      liveRegion: true,
      container: true,
      child: FaixaDeAviso(texto: texto, peso: peso),
    );
  }
}
