import 'package:flutter/material.dart';

import '../api/mensagens_de_erro.dart';
import '../theme/bichu_colors.dart';
import '../theme/bichu_tokens.g.dart';
import 'faixa_de_aviso.dart';

/// O QR da plaquinha do pet, para alguem escanear (pedido do cliente, 18/10).
///
/// ## O que o QR carrega, e por que nao e escolha deste widget
///
/// Ele carrega **`{base}/t/{codigo}` e nada mais**, porque quem o desenha e o
/// servidor: este widget recebe PNG pronto de
/// `GET /v1/pets/{petId}/tags/{tagId}/qr.png`. A decisao esta em
/// `src/modules/tags/domain/qr-da-tag.ts`, que emite o QR e a linha legivel da
/// mesma funcao -- de proposito, para a imagem e o texto impresso nunca
/// apontarem para lugares diferentes depois da prensa -- e la existe isca que
/// decodifica o PNG e reprova se algum UUID aparecer (ADR-0010, item 6).
///
/// As duas medicoes que fecham a escolha, e que valem repetir aqui porque a
/// proxima pessoa vai querer "simplificar" isto para um gerador local:
///
/// 1. **O leitor do proprio app so aceita a URL.** `codigoDeTagDoQr` exige a
///    forma `{hospedeiro do Bichu}/t/{16 simbolos}` e recusa texto solto, com
///    todas as letras: *"um QR que carregasse `7K2MQ1D4B8NV3XZ0` ... passaria
///    por um teste de alfabeto; ele so nao e do Bichu"*. Um QR com o codigo
///    cru nao seria lido pelo app.
/// 2. **A camera comum do celular abre URL.** `{base}/t/{codigo}` e servida
///    por `web/src/pages/t/[code].astro`, que e a pagina de quem achou o pet
///    (F4), renderizada no servidor e funcionando sem JavaScript.
///
/// Entao **um QR so serve os dois casos**, e nao ha escolha a fazer entre
/// camera e leitor. O perfil publico do pet (`/@{slug}`) NAO serve: ele esta
/// fora da v1 do site, nao ha pagina que o sirva, e `updatePetPublicProfile`
/// -- a unica operacao que define o slug -- nao esta implementada, entao nao
/// existe slug para colocar no QR.
///
/// ## O rotulo acessivel NAO e o codigo, e isso e uma restricao medida
///
/// Em F1.6 a alternativa textual do QR e o codigo por extenso, e esta certo
/// la: aquela e a unica resposta do contrato que o traz. Aqui o app **nao tem
/// o codigo** -- `GET /pets/{petId}/tags` devolve so `code_suffix` --, entao o
/// rotulo diz o que a imagem e e de qual plaquinha ela e, pelos quatro
/// ultimos. Prometer o codigo inteiro num rotulo que nao o tem seria pior que
/// nao ter rotulo: um quadrado sem descricao e inutil para quem nao ve, e uma
/// descricao falsa e inutil para todo mundo.
class QrDaPlaquinha extends StatelessWidget {
  const QrDaPlaquinha({
    required this.estado,
    required this.provedor,
    required this.sufixo,
    required this.nomeDoPet,
    required this.aoTentarDeNovo,
    super.key,
  });

  /// O lado da imagem, o mesmo de F1.6. Um numero so para as duas telas: o QR
  /// que encolhe de uma tela para a outra e o QR que a camera do vizinho nao
  /// pega numa delas.
  static const double lado = 200;

  static const String titulo = 'QR da plaquinha';

  /// A linha que diz para que serve o quadrado. Sem ela o bloco e uma imagem
  /// sem proposito no meio de um cadastro.
  static const String paraQueServe =
      'Quem escanear este QR abre a página de quem encontrou o pet, e consegue '
      'avisar você sem precisar de conta.';

  /// Nenhuma tag ativa. **Nao e falha, e nao ha botao**: o app nao tem tela
  /// que emita codigo para pet ja cadastrado -- a emissao acontece uma vez, na
  /// F1.6, logo depois do cadastro -- e o pedido da plaquinha pressupoe que o
  /// codigo exista. Oferecer uma acao aqui seria acao sem destino, que e o que
  /// o criterio 2 da BICHUS-62 proibe.
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

  /// Os bytes ja guardados no cofre. Nulo fora de
  /// [EstadoDoQrDaPlaquinha.pronto].
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
          // Estado impossivel pela construcao, e mesmo assim ele nao pode
          // virar quadrado vazio: cai no texto que diz a verdade sobre o que a
          // pessoa esta vendo. Foi esse colapso silencioso o defeito da F1.6.
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
                  // `gaplessPlayback` fora, pela mesma razao de F1.6: o quadro
                  // anterior e a credencial de outra tag.
                  gaplessPlayback: false,
                ),
              ),
            ),
            const SizedBox(height: BichuEspaco.e3),
            // O texto repete o que o rotulo acessivel ja diz, e por isso ele
            // sai da arvore semantica: quem usa leitor de tela ouviria a mesma
            // frase duas vezes, uma como alternativa da imagem e outra como
            // paragrafo.
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
          // Informativo, e nao erro: a plaquinha existe e continua resolvendo.
          // Cor de erro aqui diria que algo se perdeu, e nao se perdeu nada.
          peso: PesoDaFaixa.informativo,
          texto: naoCarregou,
          rotuloDaAcao: MensagensDeErro.tentarDeNovo,
          aoTocarNaAcao: aoTentarDeNovo,
        );
    }
  }
}

/// Em qual estado esta a imagem do QR na tela do pet. Quatro, e nao dois.
///
/// O defeito que este enum evita e o que a F1.6 teve: [semTag] e [falhou]
/// desenhando a mesma coisa -- nada --, e quem esta com o celular na mao sem
/// como saber se a plaquinha nao existe ou se o app nao conseguiu buscar a
/// imagem. So o segundo tem conserto do lado de ca.
enum EstadoDoQrDaPlaquinha {
  /// O pet nao tem tag ativa. **Nada falhou**, e nao ha nada a tentar.
  semTag,

  /// A lista de tags ou a imagem esta em curso.
  carregando,

  /// Os bytes chegaram e estao desenhados.
  pronto,

  /// A busca saiu e nao voltou imagem.
  falhou,
}
