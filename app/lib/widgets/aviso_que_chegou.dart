import 'package:flutter/material.dart';
import 'package:go_router/go_router.dart';

import '../achado/rascunho_do_achado.dart';
import '../dispositivo/avisos_recebidos.dart';
import '../escopo.dart';
import '../roteamento/rotas.dart';
import '../theme/bichu_colors.dart';
import '../theme/bichu_tokens.g.dart';

/// A faixa do aviso que acabou de chegar por push.
///
/// ## Por que ela existe, e por que no topo da casca
///
/// Com o app em **primeiro plano** o SDK do Firebase nao desenha notificacao
/// nenhuma no Android, mesmo quando a mensagem traz bloco `notification`. Sem
/// esta faixa, o alerta chega no aparelho, o servidor registra `aceito`, e a
/// unica pessoa que nao ve nada e justamente a que esta com o app na mao.
///
/// Ela tambem e o desfecho dos avisos cuja tela **nao existe neste build**:
/// `tagEscaneada`, `possivelCorrespondencia` e `lembreteDeDesfecho` caem em
/// [DestinoDoAviso.mostrarNoApp], e o que "mostrar" quer dizer e esta faixa.
/// Sem ela, aquele ramo do `switch` seria um buraco silencioso.
///
/// ## O texto vem do servidor, e nao e remontado aqui
///
/// `titulo` e `corpo` chegam prontos no payload. A redacao e decisao de produto
/// e tem uma fonte so (`conteudo-do-push.ts`, derivado de UX 12.2 e 12.3);
/// reescrever aqui produziria duas frases diferentes para o mesmo aviso -- uma
/// na bandeja do sistema e outra dentro do app -- e a divergencia apareceria
/// como bug de conteudo, nao de codigo.
///
/// ## Ela nao se fecha sozinha
///
/// Nao ha temporizador. O aviso mais importante deste produto e "alguem esta
/// com o seu pet", e uma faixa que sumisse em quatro segundos poderia sumir
/// exatamente enquanto a pessoa olha para o outro lado. Quem fecha e ela, pelo
/// `X`, ou o toque que leva ao destino.
class AvisoQueChegou extends StatelessWidget {
  const AvisoQueChegou({super.key});

  /// O rotulo da acao quando ha destino.
  static const String rotuloDeVerAgora = 'Vi este pet';

  /// O rotulo de fechar, lido por leitor de tela.
  static const String rotuloDeFechar = 'Fechar o aviso';

  /// O texto de recuo quando a mensagem veio sem `notification`.
  ///
  /// Nao deveria acontecer -- o servidor sempre manda o bloco --, mas uma faixa
  /// em branco e pior que uma frase generica: ela parece defeito de renderizacao
  /// e a pessoa nao sabe que recebeu alguma coisa.
  static const String tituloDeRecuo = 'Você recebeu um aviso do Bichu';

  @override
  Widget build(BuildContext context) {
    final ouvinte = Escopo.of(context).avisosRecebidos;
    return ListenableBuilder(
      listenable: ouvinte,
      builder: (context, _) {
        final aviso = ouvinte.ultimoAviso;
        if (aviso == null) return const SizedBox.shrink();
        return _Faixa(aviso: aviso, ouvinte: ouvinte);
      },
    );
  }
}

class _Faixa extends StatelessWidget {
  const _Faixa({required this.aviso, required this.ouvinte});

  final AvisoRecebido aviso;
  final OuvinteDeAvisos ouvinte;

  void _ir(BuildContext context) {
    // Reconhece ANTES de navegar, e nao depois: navegar descarta esta faixa da
    // arvore, e um `reconhecer()` depois do `go` rodaria sobre um widget que
    // nao esta mais montado.
    ouvinte.reconhecer();
    switch (OuvinteDeAvisos.destinoDe(aviso)) {
      case DestinoDoAviso.registrarAchado:
        // O `share_token` entra no rascunho, e e o que vincula o achado AO
        // CASO em vez de deixar o cruzamento por atributos descobrir. Ver o
        // comentario do campo em `RascunhoDoAchado`.
        context.push(
          Rotas.registrarAchado,
          extra: RascunhoDoAchado(shareToken: aviso.referencia),
        );
      case DestinoDoAviso.mostrarNoApp:
        // Nao ha para onde ir neste build, e a faixa acabou de ser fechada:
        // quem tocou ja leu. Ver a lacuna declarada em
        // `OuvinteDeAvisos.destinoDe`.
        break;
    }
  }

  @override
  Widget build(BuildContext context) {
    final cores = BichuColors.of(context).cores;
    final textos = Theme.of(context).textTheme;
    final temDestino =
        OuvinteDeAvisos.destinoDe(aviso) != DestinoDoAviso.mostrarNoApp;
    // `tagEscaneada` e o aviso mais urgente do produto: alguem esta com o
    // animal na mao. Ele chega em preenchimento solido, como a faixa da F2.2,
    // e nao com a mesma tinta de um lembrete.
    final urgente = aviso.tipo == TipoDeAvisoRecebido.tagEscaneada;
    final fundo = urgente ? cores.urgency : cores.surfaceAlt;
    final corDoTexto = urgente ? cores.onUrgency : cores.textPrimary;

    return Semantics(
      // `liveRegion` porque a faixa aparece sem ninguem ter tocado em nada:
      // quem usa leitor de tela nao vai varrer a tela de novo por conta
      // propria, e este e o aviso que menos pode passar batido.
      liveRegion: true,
      container: true,
      child: Material(
        color: fundo,
        child: SafeArea(
          bottom: false,
          child: Padding(
            padding: const EdgeInsets.fromLTRB(
              BichuEspaco.e4,
              BichuEspaco.e3,
              BichuEspaco.e2,
              BichuEspaco.e3,
            ),
            child: Row(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: <Widget>[
                Expanded(
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: <Widget>[
                      Text(
                        aviso.titulo ?? AvisoQueChegou.tituloDeRecuo,
                        style: textos.titleMedium?.copyWith(color: corDoTexto),
                      ),
                      if (aviso.corpo != null) ...<Widget>[
                        const SizedBox(height: BichuEspaco.e1),
                        Text(
                          aviso.corpo!,
                          style: textos.bodyMedium?.copyWith(color: corDoTexto),
                        ),
                      ],
                      if (temDestino) ...<Widget>[
                        const SizedBox(height: BichuEspaco.e2),
                        TextButton(
                          onPressed: () => _ir(context),
                          child: Text(
                            AvisoQueChegou.rotuloDeVerAgora,
                            style: textos.labelLarge?.copyWith(
                              color: corDoTexto,
                              decoration: TextDecoration.underline,
                              decorationColor: corDoTexto,
                            ),
                          ),
                        ),
                      ],
                    ],
                  ),
                ),
                // 48x48 dp de alvo de toque, que e o minimo do Android. O
                // `IconButton` do Material ja entrega isso; o `tooltip` e o
                // que o TalkBack e o VoiceOver leem, porque o glifo nao tem
                // texto.
                IconButton(
                  tooltip: AvisoQueChegou.rotuloDeFechar,
                  onPressed: ouvinte.reconhecer,
                  icon: Icon(Icons.close, color: corDoTexto),
                ),
              ],
            ),
          ),
        ),
      ),
    );
  }
}
