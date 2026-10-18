/// A CONVERSA ABERTA: ler o que o achador escreveu, paginar e responder.
///
/// ---------------------------------------------------------------------------
/// ## O 410, e por que ele NAO e um defeito nesta tela
///
/// `postConversationMessage` recusa com **`410 conversation-closed`** em tres
/// situacoes, e o corpo e o **mesmo** nas tres:
///
///   1. a conversa foi encerrada (ou o caso ligado a ela foi);
///   2. a conversa foi bloqueada por um dos dois lados;
///   3. **a conta do outro lado foi desabilitada** -- travado nos dois
///      sentidos, de propósito.
///
/// A fusao e deliberada e e de seguranca: distinguir contaria a esta pessoa o
/// que aconteceu com a conta da outra. A consequencia de tela e o que este
/// arquivo cumpre -- **o 410 nao aparece como erro**. Ele leva a conversa para
/// modo leitura e **a caixa de texto desaparece**, porque um campo que sempre
/// falha e pior que nenhum campo: a pessoa escreveria duas vezes o mesmo texto
/// antes de entender.
///
/// Os dois caminhos de 410 estao cobertos, e precisam estar:
///
///   - **no carregamento**, por `status` (`closed` ou `blocked`): a tela abre
///     ja em modo leitura e nunca desenha a caixa;
///   - **no envio**, quando a conversa fechou entre o carregamento e o toque:
///     a caixa desaparece na resposta, e o texto da pessoa **nao e perdido** --
///     ele vai para a faixa, porque ela pode querer copia-lo.
///
/// ## A FALHA DE ENVIO NAO PERDE O QUE A PESSOA ESCREVEU
///
/// Nenhum caminho deste arquivo limpa o campo antes de o servidor confirmar.
/// O `controlador.clear()` acontece **uma vez**, depois do `await` que deu
/// `201`. Falha de rede, 429, 400 e 5xx deixam o texto no campo e acendem a
/// faixa com `Tentar de novo`; o reenvio e sempre **um toque da pessoa**, e
/// nunca automatico -- repetir sozinho uma mensagem que talvez tenha chegado e
/// como o tutor recebe a mesma frase duas vezes.
///
/// ## Paginacao por CURSOR, e para TRAS
///
/// `getConversation` pagina as mensagens por `cursor`, e nunca por
/// deslocamento. O botao fica no **topo** porque e isso que ele faz: busca o
/// que veio antes. Sem rolagem infinita (design system 11.20).
library;

import 'package:flutter/material.dart';

import '../../api/falhas.dart';
import '../../api/mensagens_de_erro.dart';
import '../../api/conversas_api.dart';
import '../../api/modelos_conversa.dart';
import '../../escopo.dart';
import '../../theme/bichu_colors.dart';
import '../../theme/bichu_tokens.g.dart';
import '../../widgets/faixa_de_aviso.dart';
import '../../widgets/botao_primario.dart';
import '../../widgets/saida_da_tela.dart';
import 'area_de_mensagens.dart';

class TelaDaConversa extends StatefulWidget {
  const TelaDaConversa({required this.conversaId, super.key, this.conversas});

  /// O cliente de conversa. Nulo usa o do [Escopo]. Ver [AreaDeMensagens].
  final ConversasApi? conversas;

  /// O id vem do caminho. **Nao e pintado em lugar nenhum** (ADR-0010).
  final String conversaId;

  @override
  State<TelaDaConversa> createState() => _EstadoDaTelaDaConversa();
}

class _EstadoDaTelaDaConversa extends State<TelaDaConversa> {
  final TextEditingController _controlador = TextEditingController();
  final List<MensagemDaConversa> _mensagens = <MensagemDaConversa>[];

  ConversasApi get _api =>
      widget.conversas ?? ConversasApi(Escopo.of(context).api);

  Conversa? _conversa;
  String? _cursor;
  bool _carregando = true;
  bool _carregandoAnteriores = false;
  bool _enviando = false;

  /// Por que a tela nao carregou. Nulo quando carregou.
  String? _falhaDeCarga;

  /// Por que o ENVIO falhou. Nulo quando nao falhou.
  ///
  /// Separado de [_falhaDeCarga] de propósito: sao duas falhas com duas saidas
  /// diferentes, e uma variavel so faria `Tentar de novo` recarregar a tela
  /// quando o que falhou foi a mensagem -- jogando fora o texto digitado pelo
  /// caminho menos exercitado a mao.
  String? _falhaDeEnvio;

  /// A conversa fechou. Vem do `status` no carregamento, **ou do 410 no
  /// envio**.
  bool _emLeitura = false;

  @override
  void initState() {
    super.initState();
    WidgetsBinding.instance.addPostFrameCallback((_) => _carregar());
  }

  @override
  void dispose() {
    _controlador.dispose();
    super.dispose();
  }

  Future<void> _carregar() async {
    setState(() {
      _carregando = true;
      _falhaDeCarga = null;
    });
    try {
      final conversa = await _api.buscar(widget.conversaId);
      if (!mounted) return;
      setState(() {
        _conversa = conversa;
        _mensagens
          ..clear()
          ..addAll(conversa.messages);
        _cursor = conversa.nextCursor;
        // MODO LEITURA JA NA ABERTURA quando o estado nao aceita mensagem.
        // `closed` e `blocked` caem aqui pela mesma porta, que e a mesma regra
        // do servidor (`aceitaMensagem`).
        _emLeitura = !conversa.status.aceitaMensagem;
        _carregando = false;
      });
    } on FalhaDaApi catch (falha) {
      if (!mounted) return;
      setState(() {
        _carregando = false;
        // 404 e o desenho, e nao um defeito: conversa de outra pessoa responde
        // 404 e NUNCA 403 (ADR-0021), porque um 403 confirmaria que aquele id
        // existe. A tela diz que nao esta disponivel e manda voltar -- ela nao
        // diz "nao e sua", que seria a confirmacao pelo texto.
        _falhaDeCarga = falha.problem.status == 404
            ? TextosDasMensagens.conversaIndisponivel
            : TextosDasMensagens.naoConseguimosCarregar;
      });
    } on FalhaDeChamada {
      if (!mounted) return;
      setState(() {
        _carregando = false;
        _falhaDeCarga = TextosDasMensagens.naoConseguimosCarregar;
      });
    } on FormatException {
      if (!mounted) return;
      setState(() {
        _carregando = false;
        _falhaDeCarga = TextosDasMensagens.naoConseguimosCarregar;
      });
    }
  }

  /// As mensagens anteriores, **por cursor**.
  Future<void> _carregarAnteriores() async {
    final cursor = _cursor;
    if (cursor == null || _carregandoAnteriores) return;
    setState(() => _carregandoAnteriores = true);
    try {
      final pagina = await _api.buscar(widget.conversaId, cursor: cursor);
      if (!mounted) return;
      setState(() {
        // As anteriores entram no COMECO: elas vieram antes das que estao na
        // tela. `addAll` as poria no fim e a conversa leria fora de ordem.
        _mensagens.insertAll(0, pagina.messages);
        _cursor = pagina.nextCursor;
        _carregandoAnteriores = false;
      });
    } on FalhaDeChamada {
      if (!mounted) return;
      // A lista ja carregada FICA (11.20): o recorte nao mudou.
      setState(() {
        _carregandoAnteriores = false;
        _falhaDeEnvio = null;
        _falhaDeCarga = null;
      });
    } on FormatException {
      if (!mounted) return;
      setState(() => _carregandoAnteriores = false);
    }
  }

  /// Envia, e **nao limpa o campo antes da confirmacao**.
  Future<void> _enviar() async {
    final texto = _controlador.text.trim();
    if (texto.isEmpty || _enviando || _emLeitura) return;

    setState(() {
      _enviando = true;
      _falhaDeEnvio = null;
    });

    try {
      final mensagem = await _api.enviar(widget.conversaId, texto);
      if (!mounted) return;
      setState(() {
        _mensagens.add(mensagem);
        _enviando = false;
      });
      // O CAMPO E LIMPO AQUI, E SO AQUI: depois do `201`. Qualquer caminho de
      // falha acima saiu por `catch` sem tocar no controlador.
      _controlador.clear();
    } on FalhaDaApi catch (falha) {
      if (!mounted) return;
      setState(() {
        _enviando = false;
        if (conversaNaoAceitaMais(falha.problem)) {
          // A CONVERSA FECHOU ENTRE A ABERTURA E O TOQUE. Nao e defeito: a
          // tela passa a modo leitura, a caixa de texto SAI, e o texto da
          // pessoa vai para a faixa -- ela pode querer copia-lo, e apaga-lo
          // junto com o campo seria perder o que ela escreveu.
          _emLeitura = true;
          _falhaDeEnvio = null;
        } else {
          // O texto FICA no campo. Ver o cabecalho do arquivo.
          _falhaDeEnvio = TextosDasMensagens.naoFoiEnviada;
        }
      });
    } on FalhaDeChamada {
      if (!mounted) return;
      setState(() {
        _enviando = false;
        _falhaDeEnvio = TextosDasMensagens.naoFoiEnviada;
      });
    } on FormatException {
      if (!mounted) return;
      setState(() {
        _enviando = false;
        _falhaDeEnvio = TextosDasMensagens.naoFoiEnviada;
      });
    }
  }

  @override
  Widget build(BuildContext context) {
    final conversa = _conversa;
    final outro = conversa?.outroLadoVistoPor(PapelNaConversa.tutor);
    // O TITULO E NOME + PET, e nunca o id.
    final titulo = conversa == null
        ? TextosDasMensagens.titulo
        : '${outro?.displayName ?? ''} · ${conversa.petDisplayName}';

    return Scaffold(
      appBar: AppBar(
        leading: const SaidaDaTela(
          tipo: TipoDeSaida.voltar,
          escape: RotasDeMensagens.area,
        ),
        title: Text(titulo),
      ),
      body: SafeArea(
        child: Column(
          children: <Widget>[
            Expanded(child: _corpo()),
            // A CAIXA DE TEXTO SO EXISTE EM CONVERSA ABERTA. Em modo leitura
            // ela nao e desabilitada -- ela **nao e construida**. Um campo
            // cinza convida ao toque e nao explica nada.
            if (!_carregando && _falhaDeCarga == null)
              if (_emLeitura) const _AvisoDeConversaEncerrada() else _caixa(),
          ],
        ),
      ),
    );
  }

  Widget _corpo() {
    if (_carregando) {
      return const Center(child: CircularProgressIndicator());
    }

    final falha = _falhaDeCarga;
    if (falha != null) {
      return ListView(
        padding: const EdgeInsets.all(BichuEspaco.e4),
        children: <Widget>[
          FaixaDeAviso(
            texto: falha,
            rotuloDaAcao: MensagensDeErro.tentarDeNovo,
            aoTocarNaAcao: _carregar,
          ),
        ],
      );
    }

    final falhaDeEnvio = _falhaDeEnvio;

    return ListView(
      padding: const EdgeInsets.all(BichuEspaco.e4),
      children: <Widget>[
        if (_cursor != null)
          Padding(
            padding: const EdgeInsets.only(bottom: BichuEspaco.e4),
            child: BotaoSecundario(
              rotulo: TextosDasMensagens.carregarAnteriores,
              aoTocar: _carregarAnteriores,
              carregando: _carregandoAnteriores,
            ),
          ),
        for (final mensagem in _mensagens)
          Padding(
            key: ValueKey<String>('mensagem-${mensagem.id}'),
            padding: const EdgeInsets.only(bottom: BichuEspaco.e3),
            child: _Bolha(mensagem: mensagem),
          ),
        if (falhaDeEnvio != null)
          FaixaDeAviso(
            texto: falhaDeEnvio,
            rotuloDaAcao: MensagensDeErro.tentarDeNovo,
            aoTocarNaAcao: _enviar,
          ),
      ],
    );
  }

  Widget _caixa() {
    final cores = BichuColors.of(context).cores;
    return DecoratedBox(
      decoration: BoxDecoration(
        border: Border(top: BorderSide(color: cores.outline)),
      ),
      child: Padding(
        padding: const EdgeInsets.all(BichuEspaco.e3),
        child: Row(
          crossAxisAlignment: CrossAxisAlignment.end,
          children: <Widget>[
            Expanded(
              child: TextField(
                controller: _controlador,
                minLines: 1,
                maxLines: 4,
                // O teto do contrato (`body`, `maxLength: 1000`). O campo nao
                // conta caractere na tela: quem escreve recado nao esta
                // contando, e o servidor recusa com `validation-failed` se
                // passar. O limite aqui impede a recusa.
                maxLength: 1000,
                textCapitalization: TextCapitalization.sentences,
                keyboardType: TextInputType.multiline,
                decoration: const InputDecoration(
                  labelText: TextosDasMensagens.campoDeMensagem,
                  counterText: '',
                ),
              ),
            ),
            const SizedBox(width: BichuEspaco.e2),
            IconButton.filled(
              onPressed: _enviando ? null : _enviar,
              // Rotulo acessivel em tudo: um botao de icone sem ele e um
              // controle mudo para quem usa leitor de tela.
              tooltip: TextosDasMensagens.enviar,
              icon: _enviando
                  ? const SizedBox(
                      width: 18,
                      height: 18,
                      child: CircularProgressIndicator(strokeWidth: 2),
                    )
                  : const Icon(Icons.arrow_upward),
            ),
          ],
        ),
      ),
    );
  }
}

/// O rodape do modo leitura. **No lugar da caixa de texto, e nunca junto.**
///
/// A frase e a MESMA para conversa encerrada, conversa bloqueada e conta
/// desabilitada do outro lado, porque o servidor manda um erro so de propósito.
/// Ver o cabecalho deste arquivo.
class _AvisoDeConversaEncerrada extends StatelessWidget {
  const _AvisoDeConversaEncerrada();

  @override
  Widget build(BuildContext context) {
    final cores = BichuColors.of(context).cores;
    final textos = Theme.of(context).textTheme;
    return Container(
      width: double.infinity,
      decoration: BoxDecoration(
        color: cores.surfaceAlt,
        border: Border(top: BorderSide(color: cores.outline)),
      ),
      padding: const EdgeInsets.all(BichuEspaco.e4),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: <Widget>[
          Text(
            TextosDasMensagens.conversaEncerrada,
            style: textos.titleSmall?.copyWith(color: cores.textPrimary),
          ),
          const SizedBox(height: BichuEspaco.e1),
          Text(
            TextosDasMensagens.aindaDaParaLer,
            style: textos.bodySmall?.copyWith(color: cores.textSecondary),
          ),
        ],
      ),
    );
  }
}

/// Uma mensagem.
///
/// Tres formas: a do sistema (o Bichu falando -- a abertura do aviso e o alerta
/// de dado retirado), a do achador e a do tutor. A do sistema **nao e bolha de
/// ninguem**: ela atravessa a largura, porque atribui-la a um lado faria
/// parecer que uma das duas pessoas escreveu aquilo.
class _Bolha extends StatelessWidget {
  const _Bolha({required this.mensagem});

  final MensagemDaConversa mensagem;

  @override
  Widget build(BuildContext context) {
    final cores = BichuColors.of(context).cores;
    final textos = Theme.of(context).textTheme;

    if (mensagem.doSistema) {
      return Container(
        width: double.infinity,
        decoration: BoxDecoration(
          color: cores.infoContainer,
          borderRadius: BorderRadius.circular(BichuRaio.md),
        ),
        padding: const EdgeInsets.all(BichuEspaco.e3),
        child: Text(
          mensagem.body,
          style: textos.bodySmall?.copyWith(color: cores.textPrimary),
        ),
      );
    }

    // O TUTOR e quem usa o app com conta no caminho da plaquinha: a mensagem
    // dele vai a direita, a de quem achou a esquerda.
    final minha = mensagem.senderRole == PapelNaConversa.tutor;

    return Align(
      alignment: minha ? Alignment.centerRight : Alignment.centerLeft,
      child: ConstrainedBox(
        constraints: BoxConstraints(
          maxWidth: MediaQuery.sizeOf(context).width * 0.78,
        ),
        child: Column(
          crossAxisAlignment: minha
              ? CrossAxisAlignment.end
              : CrossAxisAlignment.start,
          children: <Widget>[
            Container(
              decoration: BoxDecoration(
                color: minha ? cores.primaryContainer : cores.surfaceSunken,
                borderRadius: BorderRadius.circular(BichuRaio.md),
              ),
              padding: const EdgeInsets.all(BichuEspaco.e3),
              child: Text(
                mensagem.body,
                style: textos.bodyMedium?.copyWith(color: cores.textPrimary),
              ),
            ),
            // O QUE FOI RETIRADO, explicado.
            //
            // Sem isto o remetente ve o proprio texto sem o telefone e acha
            // que foi censurado sem motivo -- ou pior, que a mensagem chegou
            // inteira. O contrato manda `redactions` exatamente para a
            // interface explicar.
            if (mensagem.redactions.isNotEmpty)
              Padding(
                padding: const EdgeInsets.only(top: BichuEspaco.e1),
                child: Text(
                  TextosDasMensagens.dadoRetirado,
                  style: textos.bodySmall?.copyWith(color: cores.textSecondary),
                ),
              ),
          ],
        ),
      ),
    );
  }
}
