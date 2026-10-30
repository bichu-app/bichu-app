import 'package:flutter/material.dart';

import '../api/mensagens_de_erro.dart';
import '../theme/bichu_colors.dart';
import '../theme/bichu_tokens.g.dart';
import 'faixa_de_aviso.dart';

/// O QR da plaquinha do pet, para alguem escanear (pedido do cliente, 18/10).
class QrDaPlaquinha extends StatelessWidget {
  const QrDaPlaquinha({
    required this.estado,
    required this.provedor,
    required this.sufixo,
    required this.nomeDoPet,
    required this.aoTentarDeNovo,
    super.key,
  });

  /// O lado da imagem, o mesmo de F1.6.
  static const double lado = 200;

  static const String titulo = 'QR da plaquinha';

  /// A linha que diz para que serve o quadrado.
  static const String paraQueServe =
      'Quem escanear este QR abre a página de quem encontrou o pet, e consegue '
      'avisar você sem precisar de conta.';

  /// Nenhuma tag ativa. **Nao e falha, e nao ha botao**: o app nao tem tela que
  /// emita codigo para pet ja cadastrado -- a emissao acontece uma vez, na
  /// F1.6, logo depois do cadastro -- e o pedido da plaquinha pressupoe que o
  /// codigo exista.
  static String semTag(String nome) =>
      'Não há QR para mostrar: $nome não tem plaquinha ativa, e o QR é o '
      'endereço de uma plaquinha. Sem código não existe QR, e o app não '
      'desenha um quadrado que não leva a lugar nenhum.';

  static const String carregando = 'Preparando a imagem do QR';

  static const String naoCarregou =
      'Não consegui carregar a imagem do QR. A plaquinha continua valendo, e '
      'dá para tentar de novo.';

  /// A alternativa textual. Ver o cabecalho: ela **nao** e o codigo.
  static String rotuloDaImagem(String sufixo) {
    final quatro = sufixo.trim();
    if (quatro.isEmpty) return '$titulo. $paraQueServe';
    return 'QR da plaquinha terminada em $quatro. $paraQueServe';
  }

  final EstadoDoQrDaPlaquinha estado;

  /// Os bytes ja guardados no cofre.
  final ImageProvider? provedor;

  /// `code_suffix` da tag em vigor, os quatro ultimos caracteres.
  final String sufixo;

  final String nomeDoPet;

  final VoidCallback aoTentarDeNovo;

  @override
  Widget build(BuildContext context) {
    final cores = BichuColors.of(context).cores;
    final textos = Theme.of(context).textTheme;

    switch (estado) {
      case EstadoDoQrDaPlaquinha.semTag:
        return Text(
          semTag(nomeDoPet),
          style: textos.bodyMedium?.copyWith(color: cores.textSecondary),
        );

      case EstadoDoQrDaPlaquinha.carregando:
        return Center(
          child: Semantics(
            label: carregando,
            liveRegion: true,
            child: const SizedBox(
              width: lado,
              height: lado,
              child: Center(child: CircularProgressIndicator()),
            ),
          ),
        );

      case EstadoDoQrDaPlaquinha.pronto:
        final imagem = provedor;
        if (imagem == null) {
          return Text(
            naoCarregou,
            style: textos.bodyMedium?.copyWith(color: cores.textSecondary),
          );
        }
        return Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: <Widget>[
            Center(
              child: Semantics(
                image: true,
                label: rotuloDaImagem(sufixo),
                child: Image(
                  image: imagem,
                  width: lado,
                  height: lado,
                  gaplessPlayback: false,
                ),
              ),
            ),
            const SizedBox(height: BichuEspaco.e3),
            ExcludeSemantics(
              child: Text(
                paraQueServe,
                style: textos.bodyMedium?.copyWith(color: cores.textSecondary),
              ),
            ),
          ],
        );

      case EstadoDoQrDaPlaquinha.falhou:
        return FaixaDeAviso(
          peso: PesoDaFaixa.informativo,
          texto: naoCarregou,
          rotuloDaAcao: MensagensDeErro.tentarDeNovo,
          aoTocarNaAcao: aoTentarDeNovo,
        );
    }
  }
}

/// Em qual estado esta a imagem do QR na tela do pet.
enum EstadoDoQrDaPlaquinha {
  /// O pet nao tem tag ativa.
  semTag,

  /// A lista de tags ou a imagem esta em curso.
  carregando,

  /// Os bytes chegaram e estao desenhados.
  pronto,

  /// A busca saiu e nao voltou imagem.
  falhou,
}
