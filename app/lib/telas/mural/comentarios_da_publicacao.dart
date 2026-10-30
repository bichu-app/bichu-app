import 'package:flutter/material.dart';

import '../../acessibilidade/anunciar.dart';
import '../../api/falhas.dart';
import '../../api/mensagens_de_erro.dart';
import '../../api/mural_api.dart';
import '../../roteamento/saida_da_mensagem.dart';
import '../../theme/bichu_colors.dart';
import '../../theme/bichu_tokens.g.dart';
import '../../widgets/bichu_field.dart';
import '../../widgets/botao_primario.dart';
import '../../widgets/faixa_de_aviso.dart';
import '../../widgets/marca_da_pessoa.dart';
import 'porta_do_perfil_do_autor.dart';
import '../../widgets/selo_de_validado.dart';
import '../casca_com_abas.dart';

/// OS COMENTARIOS de uma publicacao — decisao do cliente de 19/10/2026,
/// *"curtir e comentar"* na primeira versao.
class ComentariosDaPublicacao extends StatefulWidget {
  const ComentariosDaPublicacao({
    required this.ref,
    required this.interacao,
    required this.minhaPublicacao,
    super.key,
  });

  /// O endereco opaco da publicacao, 22 simbolos.
  final String ref;

  final InteracaoDoMural interacao;

  /// Se quem chama e o DONO da publicacao.
  final bool minhaPublicacao;

  /// O teto do contrato, COPIADO de la — o MESMO da publicacao, que e o de
  /// `publication_reports.publication_body` e o de `pets.care_notes`.
  static const int tetoDoTexto = 280;

  static const String titulo = 'Comentários';
  static const String rotuloDoCampo = 'Seu comentário';
  static const String exemploDoCampo = 'Escreva um comentário';
  static const String enviar = 'Comentar';
  static const String tituloVazio = 'Ninguém comentou ainda';
  static const String explicacaoVazio =
      'Seja a primeira pessoa a comentar nesta publicação.';
  static const String apagado = 'Comentário apagado.';
  static const String enviado = 'Comentário publicado.';

  @override
  State<ComentariosDaPublicacao> createState() =>
      _ComentariosDaPublicacaoState();
}

class _ComentariosDaPublicacaoState extends State<ComentariosDaPublicacao> {
  final TextEditingController _texto = TextEditingController();

  List<ComentarioDaPublicacao>? _itens;
  int _total = 0;
  bool _carregando = true;
  bool _enviando = false;
  MensagemDeErro? _faixa;

  @override
  void initState() {
    super.initState();
    _texto.addListener(_mudou);
    _carregar();
  }

  @override
  void dispose() {
    _texto.removeListener(_mudou);
    _texto.dispose();
    super.dispose();
  }

  void _mudou() => setState(() {});

  int get _usados => _texto.text.characters.length;
  bool get _temTexto => _texto.text.trim().isNotEmpty;
  bool get _cabe => _usados <= ComentariosDaPublicacao.tetoDoTexto;

  Future<void> _carregar() async {
    setState(() {
      _carregando = true;
      _faixa = null;
    });
    try {
      final pagina = await widget.interacao.comentarios(widget.ref);
      if (!mounted) return;
      setState(() {
        _itens = pagina.itens;
        _total = pagina.total;
        _carregando = false;
      });
    } on FalhaDeChamada catch (falha) {
      if (!mounted) return;
      setState(() {
        _carregando = false;
        _faixa = MensagensDeErro.de(falha);
      });
    }
  }

  Future<void> _comentar() async {
    if (!_temTexto || !_cabe || _enviando) return;
    setState(() {
      _enviando = true;
      _faixa = null;
    });
    try {
      final criado = await widget.interacao.comentar(
        widget.ref,
        _texto.text.trim(),
      );
      if (!mounted) return;
      setState(() {
        _enviando = false;
        _itens = <ComentarioDaPublicacao>[...?_itens, criado.comentario];
        _total = criado.total;
      });
      _texto.clear();
      if (!mounted) return;
      anunciar(context, ComentariosDaPublicacao.enviado);
    } on FalhaDeChamada catch (falha) {
      if (!mounted) return;
      final mensagem = MensagensDeErro.de(falha);
      setState(() {
        _enviando = false;
        _faixa = mensagem;
      });
      if (!mounted) return;
      anunciar(context, mensagem.texto, urgente: true);
    }
  }

  Future<void> _apagar(ComentarioDaPublicacao comentario) async {
    try {
      final total = await widget.interacao.apagarComentario(
        widget.ref,
        comentario.ref,
      );
      if (!mounted) return;
      setState(() {
        _itens = (_itens ?? const <ComentarioDaPublicacao>[])
            .where((c) => c.ref != comentario.ref)
            .toList();
        _total = total;
      });
      if (!mounted) return;
      anunciar(context, ComentariosDaPublicacao.apagado);
    } on FalhaDeChamada catch (falha) {
      if (!mounted) return;
      final mensagem = MensagensDeErro.de(falha);
      setState(() => _faixa = mensagem);
      if (!mounted) return;
      anunciar(context, mensagem.texto, urgente: true);
    }
  }

  @override
  Widget build(BuildContext context) {
    final cores = BichuColors.of(context).cores;
    final textos = Theme.of(context).textTheme;
    final itens = _itens;
    final faixa = _faixa;

    return Scaffold(
      appBar: AppBar(title: const Text(ComentariosDaPublicacao.titulo)),
      body: PopScope(
        canPop: false,
        onPopInvokedWithResult: (didPop, _) {
          if (!didPop) Navigator.of(context).pop(_total);
        },
        child: SafeArea(
          child: Column(
            children: <Widget>[
              Expanded(
                child: _carregando || itens == null
                    ? const Center(child: CircularProgressIndicator())
                    : ListView(
                        padding: const EdgeInsets.all(BichuEspaco.e4),
                        children: <Widget>[
                          if (faixa != null) ...<Widget>[
                            FaixaDeAviso(
                              texto: faixa.texto,
                              rotuloDaAcao: faixa.acao,
                              aoTocarNaAcao: saidaDaMensagem(context, faixa),
                            ),
                            const SizedBox(height: BichuEspaco.e4),
                          ],
                          if (itens.isEmpty)
                            const EstadoVazio(
                              titulo: ComentariosDaPublicacao.tituloVazio,
                              explicacao:
                                  ComentariosDaPublicacao.explicacaoVazio,
                              acao: null,
                            )
                          else
                            for (final comentario in itens) ...<Widget>[
                              _Comentario(
                                comentario: comentario,
                                podeApagar: comentario.meu ||
                                    widget.minhaPublicacao,
                                aoApagar: () => _apagar(comentario),
                              ),
                              const SizedBox(height: BichuEspaco.e4),
                            ],
                        ],
                      ),
              ),
              Container(
                padding: const EdgeInsets.all(BichuEspaco.e4),
                decoration: BoxDecoration(
                  color: cores.surface,
                  border: Border(
                    top: BorderSide(
                      color: cores.outline,
                      width: BichuBorda.hairline,
                    ),
                  ),
                ),
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.stretch,
                  children: <Widget>[
                    BichuField(
                      rotulo: ComentariosDaPublicacao.rotuloDoCampo,
                      controlador: _texto,
                      exemplo: ComentariosDaPublicacao.exemploDoCampo,
                      habilitado: !_enviando,
                      linhas: 2,
                      capitalizacao: TextCapitalization.sentences,
                    ),
                    const SizedBox(height: BichuEspaco.e1),
                    Align(
                      alignment: Alignment.centerRight,
                      child: ExcludeSemantics(
                        child: Text(
                          '${ComentariosDaPublicacao.tetoDoTexto - _usados}',
                          style: textos.bodySmall?.copyWith(
                            color: _cabe ? cores.textSecondary : cores.error,
                          ),
                        ),
                      ),
                    ),
                    const SizedBox(height: BichuEspaco.e2),
                    BotaoPrimario(
                      rotulo: ComentariosDaPublicacao.enviar,
                      carregando: _enviando,
                      aoTocar: _temTexto && _cabe && !_enviando
                          ? _comentar
                          : null,
                    ),
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

/// Um comentario na lista.
class _Comentario extends StatelessWidget {
  const _Comentario({
    required this.comentario,
    required this.podeApagar,
    required this.aoApagar,
  });

  final ComentarioDaPublicacao comentario;

  /// Se o `Apagar` nasce. **Decidido por quem monta**, com `comentario.meu` ou
  /// `minhaPublicacao` -- os dois vindos do servidor.
  final bool podeApagar;

  final VoidCallback aoApagar;

  /// 32 dp, menor que os 40 do cartao: o comentario e uma linha dentro de uma
  /// lista, e nao o cabecalho de um cartao.
  static const double ladoDoIcone = 32;

  @override
  Widget build(BuildContext context) {
    final textos = Theme.of(context).textTheme;

    return Row(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: <Widget>[
        PortaDoPerfilDoAutor(
          autor: comentario.autor,
          rotulo: PortaDoPerfilDoAutor.rotuloDaPorta(
            comentario.autor.nomeExibido,
          ),
          child: MarcaDaPessoa(
            urlDoIcone: comentario.autor.urlDoIcone,
            inicial: MarcaDaPessoa.letraDe(comentario.autor.nomeExibido),
            lado: ladoDoIcone,
            estiloDaInicial: textos.bodyMedium,
            apelido: comentario.autor.apelido,
          ),
        ),
        const SizedBox(width: BichuEspaco.e3),
        Expanded(
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: <Widget>[
              PortaDoPerfilDoAutor(
                autor: comentario.autor,
                child: NomeComSelo(
                  nome: comentario.autor.nomeExibido,
                  comSelo: comentario.autor.canalConfirmado,
                  estilo: textos.labelLarge,
                ),
              ),
              const SizedBox(height: BichuEspaco.e1),
              Text(comentario.texto, style: textos.bodyLarge),
            ],
          ),
        ),
        if (podeApagar)
          PopupMenuButton<String>(
            tooltip: 'Opções do comentário',
            itemBuilder: (_) => const <PopupMenuEntry<String>>[
              PopupMenuItem<String>(value: 'apagar', child: Text('Apagar')),
            ],
            onSelected: (_) => aoApagar(),
          ),
      ],
    );
  }
}
