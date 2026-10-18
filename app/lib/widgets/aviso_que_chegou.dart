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

  /// O rotulo da acao do aviso da plaquinha escaneada.
  ///
  /// Diferente de [rotuloDeVerAgora] de proposito: "Vi este pet" e a fala de
  /// quem ACHOU um animal de outra pessoa (o alerta de vizinhanca). Aqui quem
  /// le e o TUTOR, e o que ele quer e chegar ao proprio pet.
  static const String rotuloDeVerMeusPets = 'Ver meus pets';

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
      case DestinoDoAviso.secaoDePets:
        // `go` e nao `push`: a secao `Pets` e um ramo da casca com abas, e
        // empilha-la sobre a tela corrente deixaria duas barras de aba na
        // pilha. O tutor chega na casa dos perdidos e dos achados, com os pets
        // dele na tela e o nome do pet do aviso fresco na cabeca -- o push que
        // ele acabou de ler o nomeia.
        //
        // Nao ha `extra`: este destino nao e enderecado por chave, e e por
        // isso que ele serve tambem ao pet sem caso aberto, cujo push sai sem
        // `ref`. Ver as quatro razoes em `DestinoDoAviso.secaoDePets`.
        context.go(Rotas.pets);
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
    final destino = OuvinteDeAvisos.destinoDe(aviso);
    final temDestino = destino != DestinoDoAviso.mostrarNoApp;
    // O rotulo e do DESTINO, e nao do tipo: dois tipos que caiam no mesmo
    // lugar amanha dizem a mesma coisa sem ninguem ter de lembrar.
    final rotuloDaAcao = switch (destino) {
      DestinoDoAviso.registrarAchado => AvisoQueChegou.rotuloDeVerAgora,
      DestinoDoAviso.secaoDePets => AvisoQueChegou.rotuloDeVerMeusPets,
      // Nao e renderizado: `temDestino` esconde o botao. O ramo existe porque
      // o `switch` e exaustivo, e exaustivo e o que faz um destino novo
      // aparecer aqui como erro de compilacao em vez de rotulo errado.
      DestinoDoAviso.mostrarNoApp => AvisoQueChegou.rotuloDeVerAgora,
    };
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
                            rotuloDaAcao,
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
