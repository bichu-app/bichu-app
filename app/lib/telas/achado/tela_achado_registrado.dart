import 'package:flutter/material.dart';
import 'package:go_router/go_router.dart';

import '../../roteamento/rotas.dart';
import '../../theme/bichu_colors.dart';
import '../../theme/bichu_tokens.g.dart';
import '../../widgets/barra_de_acao_fixa.dart';
import '../../widgets/botao_primario.dart';
import '../../widgets/faixa_de_aviso.dart';
import '../../widgets/saida_da_tela.dart';
import 'resultado_do_achado.dart';
import 'textos_do_achado.dart';

/// O desfecho de F3.5, nos **dois** estados que ele tem.
///
/// ## A tela nao diz "registrado" para o que esta na fila
///
/// E o criterio 2 da BICHUS-31, e ele nao e sobre delicadeza: quem acredita
/// que o aviso saiu para de procurar caminho. O titulo, o corpo e a promessa
/// mudam inteiros entre os dois estados, e quem decide e
/// [ResultadoDoAchado.foiRegistrado] -- um campo que so e verdadeiro quando o
/// servidor respondeu.
///
/// ## A foto mostrada aqui e a do aparelho
///
/// `FoundReport.photo_url` volta **nulo** por criterio: a foto do achador e
/// vista pelo tutor dentro da conversa mediada, e so. Esta tela nao a rele do
/// servidor, e o estado dela e dito em texto -- o criterio 4 pede o estado
/// visivel, e *"achado sem foto vale menos, mas vale"*.
class TelaAchadoRegistrado extends StatelessWidget {
  const TelaAchadoRegistrado({required this.resultado, super.key});

  final ResultadoDoAchado resultado;

  @override
  Widget build(BuildContext context) {
    final cores = BichuColors.of(context).cores;
    final textos = Theme.of(context).textTheme;
    final registrado = resultado.foiRegistrado;
    final achado = resultado.achado;

    return Scaffold(
      appBar: const BarraDeConta(
        titulo: TextosDoAchado.tituloDaBarraDoDesfecho,
        // **Fechar e nao voltar**: voltar devolveria o formulario preenchido
        // de um achado que ja saiu, e o toque seguinte seria um segundo
        // registro do mesmo animal.
        saida: TipoDeSaida.fechar,
      ),
      body: SafeArea(
        top: false,
        bottom: false,
        child: ListView(
          padding: const EdgeInsets.all(BichuEspaco.e4),
          addSemanticIndexes: false,
          children: <Widget>[
            Semantics(
              // Anunciado quando a tela abre: e a resposta a acao que a pessoa
              // acabou de tomar, e ela precisa chegar a quem usa leitor de
              // tela sem uma varredura manual.
              liveRegion: true,
              container: true,
              label: registrado
                  ? '${TextosDoAchado.tituloDoRegistrado}. '
                      '${TextosDoAchado.registradoCorpo}'
                  : '${TextosDoAchado.tituloDaFila}. '
                      '${TextosDoAchado.filaCorpo}',
              excludeSemantics: true,
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: <Widget>[
                  Text(
                    registrado
                        ? TextosDoAchado.tituloDoRegistrado
                        : TextosDoAchado.tituloDaFila,
                    style: textos.headlineSmall,
                  ),
                  const SizedBox(height: BichuEspaco.e3),
                  Text(
                    registrado
                        ? TextosDoAchado.registradoCorpo
                        : TextosDoAchado.filaCorpo,
                    style: textos.bodyLarge
                        ?.copyWith(color: cores.textSecondary),
                  ),
                ],
              ),
            ),
            const SizedBox(height: BichuEspaco.e6),
            FaixaDeAviso(
              peso: PesoDaFaixa.informativo,
              texto: resultado.foto == null
                  ? TextosDoAchado.semFoto
                  : TextosDoAchado.fotoAindaNaoSubiu,
            ),
            // O rotulo de area **so aparece quando o servidor mandou um**.
            // Escrever aqui o bairro digitado como se fosse o que o tutor vai
            // ler seria repetir do lado da tela o que o servidor nao montou.
            if (achado?.rotuloDaArea != null) ...<Widget>[
              const SizedBox(height: BichuEspaco.e6),
              Text(
                'Região: ${achado!.rotuloDaArea}',
                style: textos.bodyLarge,
              ),
            ],
          ],
        ),
      ),
      bottomNavigationBar: BarraDeAcaoFixa(
        acoes: <Widget>[
          BotaoPrimario(
            rotulo: TextosDoAchado.voltarParaOsPets,
            aoTocar: () => context.go(Rotas.pets),
          ),
        ],
      ),
    );
  }
}
