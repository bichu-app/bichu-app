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
  /// le e o TUTOR, e o que ele quer e chegar a quem avisou.
  static const String rotuloDeVerMeusPets = 'Ver meus pets';

  /// O rotulo quando a area de mensagens estiver na arvore. Ver
  /// [rotaDoAvisoDaPlaquinha].
  static const String rotuloDeVerAMensagem = 'Ver a mensagem';

  // ---------------------------------------------------------------------
  // O PONTO UNICO DO DESTINO DO AVISO DA PLAQUINHA.
  //
  // Sao DUAS LINHAS, e sao as unicas que mudam quando
  // `feat/area-de-mensagens-no-app` for mesclada. Nada mais deste arquivo,
  // nada de `avisos_recebidos.dart`, e nada dos testes -- a isca de widget
  // compara contra estas constantes de proposito, e nao contra um literal.
  //
  // NA MESCLA, trocar exatamente estas duas linhas por:
  //
  //   static const String rotaDoAvisoDaPlaquinha = RotasDeMensagens.raiz;
  //   static const String rotuloDoAvisoDaPlaquinha = rotuloDeVerAMensagem;
  //
  // (`RotasDeMensagens` vive em `telas/mensagens/area_de_mensagens.dart`, da
  // branch dele; `raiz` e `/mensagens`. Acrescentar o `import` junto.)
  //
  // **E a LISTA, e nao `RotasDeMensagens.conversaDe(id)`**: nao existe
  // identificador publico de conversa, e o push nao pode carregar o UUID
  // interno (ADR-0010 item 6). A medicao inteira esta em
  // `DestinoDoAviso.areaDeMensagens`.
  //
  // Enquanto a branch nao chega, o destino e a secao `Pets` -- que existe
  // nesta arvore, nao exige `extra`, nao exige identificador e e a casa dos
  // perdidos e dos achados. Nao e o lugar certo; e um lugar de verdade, e e o
  // que impede este caminho de voltar ao `break`.
  // ---------------------------------------------------------------------

  /// Para onde o toque no aviso da plaquinha leva, **nesta arvore**.
  static const String rotaDoAvisoDaPlaquinha = Rotas.pets;

  /// O rotulo do botao desse destino, **nesta arvore**.
  static const String rotuloDoAvisoDaPlaquinha = rotuloDeVerMeusPets;

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
      case DestinoDoAviso.areaDeMensagens:
        // `go` e nao `push`: o destino e uma raiz de secao, e empilha-la sobre
        // a tela corrente deixaria duas barras de aba na pilha.
        //
        // **Sem `extra` e sem identificador**, e e isso que faz este destino
        // servir tambem ao pet sem caso aberto, cujo push sai sem `ref`. Ver
        // `AvisoQueChegou.rotaDoAvisoDaPlaquinha`.
        context.go(AvisoQueChegou.rotaDoAvisoDaPlaquinha);
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
      DestinoDoAviso.areaDeMensagens =>
        AvisoQueChegou.rotuloDoAvisoDaPlaquinha,
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
