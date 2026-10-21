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
import '../../widgets/marca_da_pessoa.dart';
import '../../widgets/selo_de_validado.dart';
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
/// **A DENUNCIA DE COMENTARIO NAO EXISTE, E FICAR SEM ELA FOI DECISAO DO
/// CLIENTE EM 20/10/2026.** Medido: os cinco motivos de
/// `PublicationReportInput` servem a um comentario sem mudanca nenhuma — o que
/// falta nao e motivo, e ALVO (`comment_reports`, a sexta perna da fila do
/// painel, o valor `comment` em `ModerationOrigin` e uma operacao em `safety`,
/// que iria de seis para sete). O custo foi levado a ele e ele escolheu deixar
/// para depois: **nao e esquecimento**, e a data esta aqui para quem ler depois
/// saber que alguem olhou e decidiu.
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
    required this.minhaPublicacao,
    super.key,
  });

  /// O endereco opaco da publicacao, 22 simbolos. **Nunca o `id`.**
  final String ref;

  final InteracaoDoMural interacao;

  /// Se quem chama e o DONO da publicacao.
  ///
  /// **Vem do `mine` da linha do tempo, que vem do SERVIDOR** -- nao de uma
  /// comparacao de apelido nesta camada. E ele que decide se o `Apagar` nasce
  /// num comentario de TERCEIRO (decisao do cliente de 20/10/2026): o dono
  /// limpa a propria casa.
  ///
  /// **A trava de verdade e do servidor**, nao desta linha: os dois caminhos de
  /// autorizacao estao na clausula `WHERE` do `UPDATE` (ADR-0021), e um
  /// `Apagar` desenhado por engano levaria `404`. Isto decide quem VE a porta.
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
                                // O `Apagar` nasce em DOIS casos: o comentario
                                // e meu, OU a publicacao e minha.
                                podeApagar: comentario.meu ||
                                    widget.minhaPublicacao,
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
/// ## O `⋮` nasce em DOIS casos, e so com `Apagar`
///
/// 1. o comentario e **meu** -- tirar do ar o que eu escrevi;
/// 2. a **publicacao** e minha -- decisao do cliente de 20/10/2026: o dono
///    limpa a propria casa.
///
/// **O segundo nao e moderacao**: nao passa por fila, nao tem administrador e
/// nao tem revisao. E a mesma natureza de bloquear alguem, que o produto trata
/// como ferramenta pessoal.
///
/// **Nao ha `Denunciar`**: a denuncia de comentario nao existe no contrato, e
/// ficar sem ela foi decisao do cliente no mesmo dia. Um controle que abrisse
/// uma folha de motivos para terminar num `404` seria pior do que a ausencia —
/// ver o cabecalho de [ComentariosDaPublicacao].
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
  /// lista, e nao o cabecalho de um cartao. A derivada continua a `thumb` 176,
  /// e `cacheWidth` acompanha a largura PINTADA.
  static const double ladoDoIcone = 32;

  @override
  Widget build(BuildContext context) {
    final textos = Theme.of(context).textTheme;

    return Row(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: <Widget>[
        // **A TERCEIRA SUPERICIE DO CIRCULO DE PESSOA, e e ela que motivou a
        // extracao (21/10/2026).** O cabecalho de `_FotoDoAutor`, no Mural, dizia
        // *"No dia em que aparecer a terceira superficie, este widget e o irmao
        // dele viram um so, em `lib/widgets/`"*. Era aqui: este circulo era a
        // terceira copia das mesmas linhas, escrita inline.
        //
        // O que continua desta tela e o LADO: 32 dp, menor que os 40 do cartao,
        // e a `bodyMedium` da inicial que acompanha o lado.
        MarcaDaPessoa(
          urlDoIcone: comentario.autor.urlDoIcone,
          inicial: MarcaDaPessoa.letraDe(comentario.autor.nomeExibido),
          lado: ladoDoIcone,
          estiloDaInicial: textos.bodyMedium,
        ),
        const SizedBox(width: BichuEspaco.e3),
        Expanded(
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: <Widget>[
              // O NOME, COM O SELO DE VALIDADO AO LADO — emenda do ADR-0010 de
              // 21/10/2026, decisao do cliente: *"os usuarios que validados deve
              // ter um simbolo em frente de seu nome nos posts, comentarios"*.
              //
              // **AQUI O SELO CABE EM TODAS AS LARGURAS MEDIDAS**, e e o unico
              // dos quatro lugares em que isso e verdade: a linha do comentario
              // nao divide largura com um `⋮` fixo nem com um titulo de barra, e
              // o nome usa `labelLarge`, que e menor que o `titleMedium` do
              // cartao. A medicao esta em
              // `app/test/widgets/selo_de_validado_test.dart`, com os numeros.
              NomeComSelo(
                nome: comentario.autor.nomeExibido,
                comSelo: comentario.autor.canalConfirmado,
                estilo: textos.labelLarge,
              ),
              const SizedBox(height: BichuEspaco.e1),
              // O texto como a pessoa escreveu. Sem recorte e sem tratamento de
              // conteudo: ele cabe em 280 caracteres e o cliente mandou
              // deixa-lo livre.
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
