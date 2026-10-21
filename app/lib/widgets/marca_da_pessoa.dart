import 'package:flutter/material.dart';

import '../theme/bichu_colors.dart';
import 'imagem_da_rede.dart';

/// **O CIRCULO QUE REPRESENTA UMA PESSOA**: a foto dela quando existe, a
/// inicial do nome quando nao.
///
/// ## POR QUE ESTE ARQUIVO EXISTE, E QUEM O PEDIU
///
/// O cabecalho de `_FotoDoAutor`, em `telas/mural/tela_do_mural.dart`, deixou a
/// condicao escrita: *"No dia em que aparecer a terceira superficie, este widget
/// e o irmao dele viram um so, em `lib/widgets/` — e ai o lugar certo e aquele,
/// nao aqui"*. A terceira superficie e o **comentario**, que ja desenhava o
/// mesmo circulo inline dentro de `comentarios_da_publicacao.dart`. Entao os
/// tres passam a pintar por aqui.
///
/// ## O QUE SE UNIFICOU, E O QUE NAO
///
/// **Unificou-se o DESENHO**: o circulo, a queda para a inicial, a decoracao, o
/// `cacheWidth` pela largura pintada (dentro de [ImagemDaRede]), o
/// `simboloDeFalha` de retrato e a decisao de a imagem ser **decorativa** para o
/// leitor de tela — o nome da pessoa esta sempre ao lado, na mesma linha, e
/// rotular o circulo faria anunciar a mesma pessoa duas vezes na mesma parada de
/// foco.
///
/// **NAO se unificou o COMPORTAMENTO**, e e isso que torna a extracao segura:
///
/// - **o TOQUE nao mora aqui.** Na conversa o circulo abre o perfil, porque la
///   ele e o unico endereco do outro lado; no Mural o cartao inteiro ja e
///   conteudo e o apelido pode ser nulo, e um circulo que se anuncia como botao
///   sem levar a lugar nenhum e o toque sem desfecho que o criterio 2 da
///   BICHUS-62 proibe. Quem precisa de destino embrulha este widget —
///   `MarcaNeutraDoParticipante` continua fazendo exatamente isso;
/// - **o ROTULO ACESSIVEL nao mora aqui.** A conversa anuncia
///   `rotuloDaPortaDoPerfil` ou `rotuloDaMarcaNeutra` por fora; o Mural e o
///   comentario nao anunciam nada, porque o nome ja esta na linha.
///
/// ## O SELO DE VALIDADO NAO ENTRA NESTE WIDGET, E A AUSENCIA E DELIBERADA
///
/// Nao ha parametro de selo aqui, e nao deve haver. Este widget e o unico
/// desenho de pessoa compartilhado entre o Mural e **a area de mensagens**, e
/// mensagens **nao tem selo** (ver `SeloDeValidado` e o caso de contrapeso em
/// `app/test/widgets/selo_de_validado_test.dart`). Um parametro `comSelo` aqui
/// seria um booleano a um caractere de distancia de acender o selo no canal do
/// golpe do falso achador — quem "completasse a cobertura" nao precisaria nem de
/// um importe novo.
///
/// Com o selo em `NomeComSelo`, um widget separado, por em mensagens exige
/// importar `widgets/selo_de_validado.dart` naquele arquivo — que e uma mudanca
/// visivel em revisao e que o caso de contrapeso reprova.
class MarcaDaPessoa extends StatelessWidget {
  const MarcaDaPessoa({
    required this.urlDoIcone,
    required this.inicial,
    super.key,
    this.lado = 40,
    this.desligada = false,
    this.estiloDaInicial,
  });

  /// A derivada `thumb` de 176 px da foto da pessoa, ou **nula**.
  ///
  /// **Nula nao e erro**, e a tela nao distingue os motivos: a pessoa nao tem
  /// foto; a foto nao esta `ready` (em `processing` ela carrega o EXIF do
  /// celular, ADR-0010 item 4); a conta esta desabilitada; ou esta superficie
  /// nao recebe foto de pessoa (conversa com estranho, achador sem conta, par
  /// bloqueado). Com nula desenha-se a inicial.
  final String? urlDoIcone;

  /// A letra ja escolhida por quem monta, **e nao o nome inteiro**.
  ///
  /// A escolha e de quem chama de proposito, porque ela ja diverge: a area de
  /// mensagens monta a marca a partir do nome do participante numa regra propria
  /// daquela tela, e o Mural usa [letraDe]. Receber o nome e escolher aqui
  /// trocaria uma das duas regras em silencio.
  ///
  /// Vazia desenha `·`, que e o que as tres superficies ja faziam: um circulo
  /// vazio pareceria falha de carregamento.
  final String inicial;

  /// O lado do circulo, em dp. 40 no cartao do Mural e na linha de conversa, 32
  /// no comentario — *"o comentario e uma linha dentro de uma lista, e nao o
  /// cabecalho de um cartao"*.
  ///
  /// E ele que vira `cacheWidth` dentro de [ImagemDaRede], pela largura
  /// **pintada**: a `thumb` de 176 cobre 40 dp a 3x (120 px reais) sem ampliar.
  final double lado;

  /// A conversa encerrada pinta a marca em cinza. **So a inicial muda de cor** —
  /// a foto nao e esmaecida, que e exatamente o que a area de mensagens ja
  /// fazia.
  final bool desligada;

  /// O estilo base da inicial. Nulo cai para `titleMedium`.
  ///
  /// **A COR E IGNORADA**: ela sai do token aqui dentro (`primary`, ou
  /// `onDisabled` com [desligada]). Quem chama escolhe o TAMANHO da letra —
  /// `bodyMedium` no comentario de 32 dp, `titleMedium` nos circulos de 40 —, e
  /// nao a paleta.
  final TextStyle? estiloDaInicial;

  /// A letra que representa um nome: a **primeira**, em maiuscula.
  ///
  /// `characters.first` e nao `nome[0]`: `[0]` devolve meia unidade UTF-16, e um
  /// nome que comece fora do BMP viraria um losango de substituicao.
  static String letraDe(String nome) {
    final limpo = nome.trim();
    if (limpo.isEmpty) return '';
    return limpo.characters.first.toUpperCase();
  }

  @override
  Widget build(BuildContext context) {
    final cores = BichuColors.of(context).cores;
    final url = urlDoIcone;

    if (url == null || url.isEmpty) {
      final base = estiloDaInicial ?? Theme.of(context).textTheme.titleMedium;
      return Container(
        width: lado,
        height: lado,
        alignment: Alignment.center,
        decoration: BoxDecoration(
          color: desligada ? cores.disabledSurface : cores.primaryContainer,
          shape: BoxShape.circle,
        ),
        // DECORATIVA para o leitor de tela: ver o cabecalho.
        child: ExcludeSemantics(
          child: Text(
            inicial.isEmpty ? '·' : inicial,
            style: base?.copyWith(
              color: desligada ? cores.onDisabled : cores.primary,
            ),
          ),
        ),
      );
    }

    return ImagemDaRede(
      url: url,
      // DECORATIVA, pelo mesmo motivo da inicial.
      descricao: null,
      // E este numero que vira `cacheWidth` dentro de `ImagemDaRede`.
      largura: lado,
      proporcao: 1,
      // Circulo: metade do lado.
      raio: lado / 2,
      // O retrato de uma pessoa falhando pede outro desenho que uma fachada
      // falhando.
      simboloDeFalha: Icons.person_outline,
    );
  }
}
