/// A FOTO dentro da conversa: a previa antes de mandar, e a imagem na linha.
library;

import 'dart:math' as math;

import 'package:flutter/material.dart';

import '../../api/modelos_conversa.dart';
import '../../dispositivo/camera_e_galeria.dart';
import '../../theme/bichu_colors.dart';
import '../../theme/bichu_tokens.g.dart';
import '../../widgets/faixa_de_aviso.dart';
import '../../widgets/imagem_da_rede.dart';
import '../../widgets/previa_da_foto.dart';
import 'textos_da_foto_na_conversa.dart';

/// Em que ponto esta a foto que a pessoa escolheu.
enum FaseDaFotoEscolhida {
  /// Os bytes estao saindo. A barra mostra o par de numeros.
  subindo,

  /// Os bytes chegaram e ha `upload_id`.
  pronta,

  /// A mensagem foi postada e o servidor recusou porque a **higiene da foto**
  /// nao terminou.
  preparando,

  /// Faltou rede em algum passo do envio dos bytes.
  semSinal,

  /// O servidor ou o armazenamento recusaram.
  recusada,
}

/// A previa da foto escolhida, acima da barra de escrever.
class PreviaDaFotoDaConversa extends StatelessWidget {
  const PreviaDaFotoDaConversa({
    required this.foto,
    required this.fase,
    required this.enviados,
    required this.total,
    required this.faltaLegenda,
    required this.aoDescartar,
    required this.aoTentarDeNovo,
    super.key,
    this.motivoDaRecusa,
    this.alcancaOOutroLado = true,
  });

  /// A foto no aparelho. Esta peca so e construida quando ha uma.
  final FotoLocal foto;

  final FaseDaFotoEscolhida fase;

  /// Bytes do arquivo ja aceitos pelo socket, e o total.
  final int enviados;
  final int total;

  /// A legenda esta vazia. **O contrato exige `body` de 1 a 1000** e o `CHECK`
  /// do banco exige texto nao vazio, entao nao existe mensagem so-foto: a tela
  /// diz isso ANTES de a pessoa tocar num botao que nao responderia.
  final bool faltaLegenda;

  final VoidCallback aoDescartar;

  /// Refaz o envio dos bytes, com a MESMA foto.
  final VoidCallback aoTentarDeNovo;

  /// O texto que o SERVIDOR devolveu na recusa.
  final String? motivoDaRecusa;

  /// Uma foto que esta pessoa mandar vai ser legivel pelo outro lado.
  final bool alcancaOOutroLado;

  /// A altura MAXIMA da previa, em dp.
  static const double altura = 220;

  /// Quanto da altura da tela a previa pode ocupar, no maximo.
  static const double fracaoMaximaDaTela = 0.28;

  /// A altura que esta previa vai usar de verdade.
  static double alturaEm(BuildContext context) => math.min(
    altura,
    MediaQuery.sizeOf(context).height * fracaoMaximaDaTela,
  );

  @override
  Widget build(BuildContext context) {
    final cores = BichuColors.of(context).cores;
    final textos = Theme.of(context).textTheme;

    return DecoratedBox(
      decoration: BoxDecoration(
        color: cores.surfaceAlt,
        border: Border(top: BorderSide(color: cores.outline)),
      ),
      child: Padding(
        padding: const EdgeInsets.all(BichuEspaco.e3),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: <Widget>[
            Stack(
              children: <Widget>[
                PreviaDaFoto(
                  foto: foto,
                  altura: alturaEm(context),
                  descricao: TextosDaFotoNaConversa.previaAindaNaoEnviada,
                ),
                Positioned(
                  top: 0,
                  right: 0,
                  child: _Descarte(aoTocar: aoDescartar),
                ),
              ],
            ),
            const SizedBox(height: BichuEspaco.e2),
            if (!alcancaOOutroLado)
              Padding(
                padding: const EdgeInsets.only(bottom: BichuEspaco.e2),
                child: FaixaDeAviso(
                  texto: TextosDaFotoNaConversa.aFotoNaoChegaDoOutroLado,
                ),
              ),
            ..._estado(context, cores, textos),
          ],
        ),
      ),
    );
  }

  List<Widget> _estado(
    BuildContext context,
    BichuCores cores,
    TextTheme textos,
  ) {
    switch (fase) {
      case FaseDaFotoEscolhida.subindo:
        return <Widget>[_barra(cores, textos)];
      case FaseDaFotoEscolhida.preparando:
        return <Widget>[
          _linhaEmCurso(
            cores,
            textos,
            TextosDaFotoNaConversa.preparandoAFoto,
          ),
        ];
      case FaseDaFotoEscolhida.pronta:
        return <Widget>[
          _linha(
            cores,
            textos,
            faltaLegenda
                ? TextosDaFotoNaConversa.aFotoPrecisaDeLegenda
                : TextosDaFotoNaConversa.fotoProntaParaEnviar,
          ),
          _avisoDeLocalizacao(cores, textos),
        ];
      case FaseDaFotoEscolhida.semSinal:
        return <Widget>[
          FaixaDeAviso(
            texto: TextosDaFotoNaConversa.aFotoNaoSubiu,
            rotuloDaAcao: TextosDaFotoNaConversa.enviarAFotoDeNovo,
            aoTocarNaAcao: aoTentarDeNovo,
          ),
        ];
      case FaseDaFotoEscolhida.recusada:
        return <Widget>[
          FaixaDeAviso(
            texto: motivoDaRecusa ?? TextosDaFotoNaConversa.aFotoFoiRecusada,
            peso: PesoDaFaixa.erro,
            rotuloDaAcao: TextosDaFotoNaConversa.descartar,
            aoTocarNaAcao: aoDescartar,
          ),
        ];
    }
  }

  Widget _barra(BichuCores cores, TextTheme textos) {
    final bool temNumero = total > 0;
    final bool terminou = temNumero && enviados >= total;
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: <Widget>[
        ClipRRect(
          borderRadius: BorderRadius.circular(BichuRaio.sm),
          child: LinearProgressIndicator(
            value: temNumero ? (enviados / total).clamp(0.0, 1.0) : null,
            minHeight: BichuEspaco.e2,
            backgroundColor: cores.surfaceSunken,
            color: cores.primary,
          ),
        ),
        const SizedBox(height: BichuEspaco.e1),
        Text(
          temNumero
              ? '${terminou ? TextosDaFotoNaConversa.terminandoDeEnviar : TextosDaFotoNaConversa.enviandoAFoto} · '
                  '${progressoEmBytes(enviados, total)}'
              : TextosDaFotoNaConversa.enviandoAFoto,
          style: textos.bodySmall?.copyWith(color: cores.textSecondary),
        ),
        _avisoDeLocalizacao(cores, textos),
      ],
    );
  }

  Widget _linhaEmCurso(BichuCores cores, TextTheme textos, String texto) {
    return Row(
      children: <Widget>[
        SizedBox(
          width: BichuEspaco.e4,
          height: BichuEspaco.e4,
          child: CircularProgressIndicator(
            strokeWidth: BichuBorda.medium,
            color: cores.primary,
          ),
        ),
        const SizedBox(width: BichuEspaco.e2),
        Expanded(
          child: Text(
            texto,
            style: textos.bodySmall?.copyWith(color: cores.textSecondary),
          ),
        ),
      ],
    );
  }

  Widget _linha(BichuCores cores, TextTheme textos, String texto) => Text(
    texto,
    style: textos.bodySmall?.copyWith(color: cores.textSecondary),
  );

  Widget _avisoDeLocalizacao(BichuCores cores, TextTheme textos) => Padding(
    padding: const EdgeInsets.only(top: BichuEspaco.e1),
    child: Text(
      TextosDaFotoNaConversa.aLocalizacaoSai,
      style: textos.bodySmall?.copyWith(color: cores.textMuted),
    ),
  );
}

/// O X que descarta a previa.
class _Descarte extends StatelessWidget {
  const _Descarte({required this.aoTocar});

  final VoidCallback aoTocar;

  @override
  Widget build(BuildContext context) {
    final cores = BichuColors.of(context).cores;
    return Semantics(
      button: true,
      label: TextosDaFotoNaConversa.descartarAFoto,
      child: Material(
        color: cores.scrim,
        shape: const CircleBorder(),
        clipBehavior: Clip.antiAlias,
        child: InkWell(
          onTap: aoTocar,
          child: SizedBox(
            width: BichuAlvoDeToque.min,
            height: BichuAlvoDeToque.min,
            child: Icon(
              Icons.close,
              color: cores.textOnInverse,
              size: BichuEspaco.e5,
            ),
          ),
        ),
      ),
    );
  }
}

/// A foto DENTRO de uma linha da conversa, nos dois sentidos.
class FotoDaMensagem extends StatelessWidget {
  const FotoDaMensagem({
    required this.url,
    required this.papel,
    required this.aoBuscarDeNovo,
    super.key,
    this.alcancouOOutroLado = true,
  });

  /// A URL assinada de `Message.photo_url`.
  final String url;

  /// Quem mandou a mensagem. **Decide a legenda, e so ela.**
  final PapelNaConversa papel;

  /// Busca a conversa outra vez, para vir assinatura nova.
  final VoidCallback aoBuscarDeNovo;

  /// **ESTA** foto e legivel pelo outro lado.
  final bool alcancouOOutroLado;

  /// A proporcao do quadro.
  static const double proporcao = 4 / 3;

  /// A legenda, pelo papel de quem mandou.
  String get legenda => switch (papel) {
    PapelNaConversa.achador => TextosDaFotoNaConversa.fotoDeQuemDizTerEncontrado,
    PapelNaConversa.tutor => TextosDaFotoNaConversa.fotoQueVoceEnviou,
    PapelNaConversa.sistema => TextosDaFotoNaConversa.fotoDestaConversa,
  };

  @override
  Widget build(BuildContext context) {
    final cores = BichuColors.of(context).cores;
    final textos = Theme.of(context).textTheme;
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: <Widget>[
        ImagemDaRede(
          url: url,
          proporcao: proporcao,
          raio: BichuRaio.md,
          descricao: legenda,
          simboloDeFalha: Icons.image_not_supported_outlined,
          aoTocarNaFalha: aoBuscarDeNovo,
          textoDaFalha: TextosDaFotoNaConversa.aFotoNaoCarregou,
        ),
        Padding(
          padding: const EdgeInsets.only(top: BichuEspaco.e1),
          child: ExcludeSemantics(
            child: Text(
              legenda,
              style: textos.bodySmall?.copyWith(color: cores.textSecondary),
            ),
          ),
        ),
        if (!alcancouOOutroLado)
          Padding(
            padding: const EdgeInsets.only(top: BichuEspaco.e1),
            child: Text(
              TextosDaFotoNaConversa.essaPessoaNaoVeFotos,
              style: textos.bodySmall?.copyWith(color: cores.textMuted),
            ),
          ),
      ],
    );
  }
}
