import 'package:flutter/material.dart';

import '../../acessibilidade/anunciar.dart';
import '../../api/falhas.dart';
import '../../api/mensagens_de_erro.dart';
import '../../api/mural_api.dart';
import '../../theme/bichu_colors.dart';
import '../../theme/bichu_tokens.g.dart';
import '../../widgets/bichu_field.dart';
import '../../widgets/botao_primario.dart';
import '../../widgets/faixa_de_aviso.dart';
import '../../widgets/imagem_da_rede.dart';
import '../casca_com_abas.dart';

/// OS COMENTARIOS de uma publicacao — decisao do cliente de 19/10/2026,
/// *"curtir e comentar"* na primeira versao.
///
/// ## Quem ve os comentarios e quem ve a publicacao
///
/// O recorte e o MESMO, na clausula `WHERE` do servidor (ADR-0021). Publicacao
/// que quem chama nao ve responde `404` — **e nao lista vazia**, que afirmaria
/// que a publicacao existe e nao tem comentario. Esta tela nao tem um `if` que
/// esconda comentario nenhum: ela desenha o que `GET .../comments` devolveu.
///
/// ## A ordem e o INVERSO da linha do tempo
///
/// Mais ANTIGO primeiro, porque comentario se le na ordem em que a conversa
/// aconteceu. A ordem e do servidor, e esta tela nao reordena.
///
/// ## O TEXTO E LIVRE, e esta tela nao julga nenhuma palavra
///
/// Decisao do cliente de 18/10: *"deixe o texto livre na timeline"* e *"quem
/// modera vai ser o administrador, deve ir para a pagina de backoffice"*. Nao ha
/// lista de palavra e nao ha aviso de tom.
///
/// ## O QUE FALTA, E ESTA DITO AQUI PORQUE E AQUI QUE O DANO MORA
///
/// **A DENUNCIA DE COMENTARIO NAO EXISTE.** Medido: os cinco motivos de
/// `PublicationReportInput` servem a um comentario sem mudanca nenhuma — o que
/// falta nao e motivo, e ALVO (`comment_reports`, a sexta perna da fila do
/// painel, o valor `comment` em `ModerationOrigin` e uma operacao em `safety`).
///
/// Por isso **nao ha `Denunciar` no `⋮` de um comentario alheio**: um controle
/// que abrisse uma folha de motivos e terminasse num `404` seria pior do que a
/// ausencia. O que existe hoje e BLOQUEAR o autor, que some com os comentarios
/// dele — `bloqueio_entre` esta no `WHERE` da leitura —, e isso se faz no perfil
/// dele, nao aqui.
///
/// **E risco conhecido e declarado**, nao surpresa: o administrador ainda nao
/// alcanca comentario.
class ComentariosDaPublicacao extends StatefulWidget {
  const ComentariosDaPublicacao({
    required this.ref,
    required this.interacao,
    super.key,
  });

  /// O endereco opaco da publicacao, 22 simbolos. **Nunca o `id`.**
  final String ref;

  final InteracaoDoMural interacao;

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
        // **O comentario novo vai no FIM**, e nao no comeco: a ordem e
        // crescente, e e onde o servidor o devolveria na proxima leitura.
        _itens = <ComentarioDaPublicacao>[...?_itens, criado.comentario];
        _total = criado.total;
      });
      _texto.clear();
      if (!mounted) return;
      anunciar(context, ComentariosDaPublicacao.enviado);
    } on FalhaDeChamada catch (falha) {
      if (!mounted) return;
      // **O TEXTO FICA no campo**: tentar de novo e so a escrita, e limpar aqui
      // faria a pessoa reescrever por uma falha que nao foi dela.
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
      // **O TOTAL VOLTA PARA O CARTAO, e e por isso que `canPop` e `false`.**
      //
      // Sem isto o numero no Mural ficaria o velho ate a proxima recarga da
      // linha do tempo -- a pessoa comentaria, voltaria, e veria o contador
      // antigo. `canPop: false` intercepta o gesto de voltar e o botao da barra,
      // e o `pop` daqui leva o total; sem ele o Flutter fecharia a tela com
      // `null` e `_AcoesDaPublicacao` nao teria o que atualizar.
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
                            FaixaDeAviso(texto: faixa.texto),
                            const SizedBox(height: BichuEspaco.e4),
                          ],
                          if (itens.isEmpty)
                            const EstadoVazio(
                              titulo: ComentariosDaPublicacao.tituloVazio,
                              explicacao:
                                  ComentariosDaPublicacao.explicacaoVazio,
                              // SEM ACAO: o campo de escrever esta logo abaixo,
                              // sempre visivel. Uma acao aqui seria a mesma
                              // porta em dois lugares.
                              acao: null,
                            )
                          else
                            for (final comentario in itens) ...<Widget>[
                              _Comentario(
                                comentario: comentario,
                                aoApagar: () => _apagar(comentario),
                              ),
                              const SizedBox(height: BichuEspaco.e4),
                            ],
                        ],
                      ),
              ),
              // O CAMPO, fixo no pe: comentar e a acao desta tela, e ela nao
              // deve exigir rolagem ate o fim de uma lista longa.
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
                      // **SEM `limite`**: `maxLength` TRUNCA no teclado, e
                      // truncar em silencio apaga o que a pessoa escreveu.
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
///
/// **O `⋮` so nasce no PROPRIO comentario**, e so com `Apagar`. Nao ha
/// `Denunciar`: a denuncia de comentario nao existe no contrato, e um controle
/// que abrisse uma folha de motivos para terminar num `404` seria pior do que a
/// ausencia — ver o cabecalho de [ComentariosDaPublicacao].
class _Comentario extends StatelessWidget {
  const _Comentario({required this.comentario, required this.aoApagar});

  final ComentarioDaPublicacao comentario;
  final VoidCallback aoApagar;

  /// 32 dp, menor que os 40 do cartao: o comentario e uma linha dentro de uma
  /// lista, e nao o cabecalho de um cartao. A derivada continua a `thumb` 176,
  /// e `cacheWidth` acompanha a largura PINTADA.
  static const double ladoDoIcone = 32;

  @override
  Widget build(BuildContext context) {
    final cores = BichuColors.of(context).cores;
    final textos = Theme.of(context).textTheme;
    final url = comentario.autor.urlDoIcone;
    final inicial = comentario.autor.nomeExibido.trim();

    return Row(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: <Widget>[
        if (url == null || url.isEmpty)
          Container(
            width: ladoDoIcone,
            height: ladoDoIcone,
            alignment: Alignment.center,
            decoration: BoxDecoration(
              color: cores.primaryContainer,
              shape: BoxShape.circle,
            ),
            child: ExcludeSemantics(
              child: Text(
                inicial.isEmpty ? '·' : inicial.characters.first.toUpperCase(),
                style: textos.bodyMedium?.copyWith(color: cores.primary),
              ),
            ),
          )
        else
          ImagemDaRede(
            url: url,
            // DECORATIVA: o nome esta ao lado, e rotular a imagem faria o leitor
            // de tela anunciar a pessoa duas vezes na mesma parada de foco.
            descricao: null,
            largura: ladoDoIcone,
            proporcao: 1,
            raio: ladoDoIcone / 2,
            simboloDeFalha: Icons.person_outline,
          ),
        const SizedBox(width: BichuEspaco.e3),
        Expanded(
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: <Widget>[
              Text(
                comentario.autor.nomeExibido,
                style: textos.labelLarge,
                maxLines: 1,
                overflow: TextOverflow.ellipsis,
              ),
              const SizedBox(height: BichuEspaco.e1),
              // O texto como a pessoa escreveu. Sem recorte e sem tratamento de
              // conteudo: ele cabe em 280 caracteres e o cliente mandou
              // deixa-lo livre.
              Text(comentario.texto, style: textos.bodyLarge),
            ],
          ),
        ),
        if (comentario.meu)
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
