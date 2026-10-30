import 'package:flutter/material.dart';
import 'package:go_router/go_router.dart';

import '../achado/rascunho_do_achado.dart';
import '../dispositivo/avisos_recebidos.dart';
import '../escopo.dart';
import '../roteamento/rotas.dart';
import '../telas/mensagens/area_de_mensagens.dart';
import '../theme/bichu_colors.dart';
import '../theme/bichu_tokens.g.dart';

/// A faixa do aviso que acabou de chegar por push.
class AvisoQueChegou extends StatelessWidget {
  const AvisoQueChegou({super.key});

  /// O rotulo da acao do aviso da plaquinha escaneada.
  static const String rotuloDeVerMeusPets = 'Ver meus pets';

  /// O rotulo quando a area de mensagens estiver na arvore.
  static const String rotuloDeVerAMensagem = 'Ver a mensagem';

  /// Para onde o toque no aviso da plaquinha leva.
  static const String rotaDoAvisoDaPlaquinha = RotasDeMensagens.area;

  /// O rotulo do botao desse destino.
  static const String rotuloDoAvisoDaPlaquinha = rotuloDeVerAMensagem;

  /// O rotulo da acao quando ha destino.
  static const String rotuloDeVerAgora = 'Vi este pet';

  /// O rotulo de fechar, lido por leitor de tela.
  static const String rotuloDeFechar = 'Fechar o aviso';

  /// O texto de recuo quando a mensagem veio sem `notification`.
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
    ouvinte.reconhecer();
    switch (OuvinteDeAvisos.destinoDe(aviso)) {
      case DestinoDoAviso.registrarAchado:
        context.push(
          Rotas.registrarAchado,
          extra: RascunhoDoAchado(shareToken: aviso.referencia),
        );
      case DestinoDoAviso.areaDeMensagens:
        context.go(AvisoQueChegou.rotaDoAvisoDaPlaquinha);
      case DestinoDoAviso.mostrarNoApp:
        break;
    }
  }

  @override
  Widget build(BuildContext context) {
    final cores = BichuColors.of(context).cores;
    final textos = Theme.of(context).textTheme;
    final destino = OuvinteDeAvisos.destinoDe(aviso);
    final temDestino = destino != DestinoDoAviso.mostrarNoApp;
    final rotuloDaAcao = switch (destino) {
      DestinoDoAviso.registrarAchado => AvisoQueChegou.rotuloDeVerAgora,
      DestinoDoAviso.areaDeMensagens =>
        AvisoQueChegou.rotuloDoAvisoDaPlaquinha,
      DestinoDoAviso.mostrarNoApp => AvisoQueChegou.rotuloDeVerAgora,
    };
    final urgente = aviso.tipo == TipoDeAvisoRecebido.tagEscaneada;
    final fundo = urgente ? cores.urgency : cores.surfaceAlt;
    final corDoTexto = urgente ? cores.onUrgency : cores.textPrimary;

    return Semantics(
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
