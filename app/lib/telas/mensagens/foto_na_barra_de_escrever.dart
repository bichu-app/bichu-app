/// A FOTO dentro da conversa: a previa antes de mandar, e a imagem na linha.
///
/// ---------------------------------------------------------------------------
/// ## A PREVIA E O ESTADO MAIS IMPORTANTE DESTA HISTORIA
///
/// Foto mandada por engano numa conversa **nao se desfaz**. Nao e como um
/// rascunho que a pessoa apaga antes de salvar: a imagem chega no aparelho da
/// outra pessoa, e ali ela fica. Por isso nada vai para a conversa antes de a
/// pessoa confirmar, e por isso a previa e grande -- um retangulo de 56 dp
/// deixaria alguem confirmar a foto errada da galeria achando que era a certa.
///
/// A ordem de operacoes vem do pedido do cliente de 19/10/2026, literal:
///
/// > "quando o usuario fizer o upload de qualquer foto no app, voce deve fazer
/// > o upload e apresentar como vai ficar de preview, e ao salvar o voce salva
/// > a foto"
///
/// Entao os **bytes sobem na ESCOLHA** (e e por isso que a previa ja aparece
/// com barra de progresso), e o toque em Enviar **posta a mensagem** com a
/// referencia do upload. Sao dois momentos, e nao um: "a foto subiu" e "a foto
/// foi mandada" sao fatos diferentes, e a previa existe no espaco entre os
/// dois.
///
/// ---------------------------------------------------------------------------
/// ## A BARRA MEDE BYTES, E ELA MEDE DE VERDADE
///
/// `ProgressoDeEnvio` (em `api/envio_de_foto.dart`) conta os bytes do arquivo
/// que o socket aceitou, pedaco a pedaco, com a contagem amarrada a
/// contrapressao: com a rede parada a barra PARA. Antes desta historia nao
/// havia numero nenhum para desenhar -- o envio mandava o corpo inteiro num
/// evento so.
///
/// [PreviaDaFotoDaConversa] nao tem caminho de barra sem numero. Quando
/// [PreviaDaFotoDaConversa.total] nao e positivo ela desenha o indicador
/// **indeterminado**, com o texto dizendo o que esta acontecendo -- e nunca uma
/// barra que anda sozinha ate 100%.
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
///
/// Local: e estado do aparelho, e nao lista fechada do contrato.
///
/// Cinco valores e nao tres, porque cinco telas diferentes. Juntar
/// [semSinal] e [recusada] num "falhou" generico apagaria a unica diferenca
/// que a pessoa pode agir sobre: sem sinal, tentar de novo com a MESMA foto
/// funciona; recusada, tentar de novo devolve a mesma recusa e o caminho e
/// escolher outra.
enum FaseDaFotoEscolhida {
  /// Os bytes estao saindo. A barra mostra o par de numeros.
  subindo,

  /// Os bytes chegaram e ha `upload_id`. Falta o toque em Enviar.
  pronta,

  /// A mensagem foi postada e o servidor recusou porque a **higiene da foto**
  /// nao terminou. Nao e defeito e nao e definitivo.
  ///
  /// **E o caso raro.** Os bytes sobem na escolha, entao no toque em Enviar o
  /// processamento em geral ja acabou; a corrida existe e e so ela que este
  /// estado cobre. A tela nao se desenha como se isto fosse o normal.
  preparando,

  /// Faltou rede em algum passo do envio dos bytes.
  semSinal,

  /// O servidor ou o armazenamento recusaram. Insistir nao resolve sozinho.
  recusada,
}

/// A previa da foto escolhida, acima da barra de escrever.
///
/// Recebe tudo por parametro e **nao guarda estado**: quem guarda e
/// `TelaDaConversa`, porque e ela que fala com o envio e com a API. Uma previa
/// com estado proprio teria de ser avisada do desfecho do envio por outro
/// caminho, e os dois divergiriam.
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

  /// Refaz o envio dos bytes, com a MESMA foto. Nunca automatico: repetir
  /// sozinho um envio que talvez tenha acontecido e como a outra pessoa receber
  /// a mesma foto duas vezes.
  final VoidCallback aoTentarDeNovo;

  /// O texto que o SERVIDOR devolveu na recusa.
  ///
  /// **Quando ele existe, e ele que aparece.** As quatro frases de recusa de
  /// foto (arquivo que nao abre, grande demais, incompleta, animacao) sao
  /// escritas pelo servidor; reescreve-las no app seria a segunda copia, e e a
  /// que nao foi atualizada que continua na tela.
  final String? motivoDaRecusa;

  /// Uma foto que esta pessoa mandar vai ser legivel pelo outro lado.
  ///
  /// Falso desenha o aviso **junto da previa, antes do envio** -- e nao
  /// desabilita nada. Ver `Conversa.fotoAlcancaOOutroLado`: a assimetria foi
  /// aceita, e o que falta e dizer.
  ///
  /// O padrao e `true` pelo mesmo motivo do modelo: nao avisar sobre o que nao
  /// se sabe.
  final bool alcancaOOutroLado;

  /// A altura MAXIMA da previa, em dp.
  ///
  /// **220 e um numero com motivo.** Ela precisa ser grande o bastante para a
  /// pessoa reconhecer QUAL foto da galeria escolheu -- e essa e a unica defesa
  /// contra o envio por engano, que nao tem desfazer.
  static const double altura = 220;

  /// Quanto da altura da tela a previa pode ocupar, no maximo.
  ///
  /// ## Por que 220 dp fixo NAO servia, e isso foi medido
  ///
  /// A previa nao esta numa area rolavel: ela mora entre o `Expanded` da
  /// conversa e a barra de escrever, e e altura FIXA naquela coluna. Com o
  /// aviso de alcance dentro dela, o conjunto passou da altura disponivel e o
  /// `RenderFlex` estourou por 6 px -- medido pela isca do grupo (8) numa
  /// janela de 544 dp de altura util, que e menos que um aparelho de 640 dp com
  /// o teclado aberto.
  ///
  /// E ESTOURO NAO E COSMETICO AQUI: o que sai da tela por baixo e o campo de
  /// legenda, que e obrigatorio para a foto poder ser enviada. A pessoa ficaria
  /// com uma previa bonita e nenhum jeito de cumprir a legenda.
  ///
  /// `0.28` e o numero: numa tela de 800 dp da 224 e o teto de 220 vale; numa
  /// de 544 da 152 e a previa encolhe em vez de empurrar o campo. Encolher
  /// preserva o que a previa existe para fazer -- reconhecer a foto --, e
  /// empurrar destroi o que vem depois dela.
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
                  // **O rotulo diz que nada foi enviado.** E o fato que
                  // distingue este estado de uma foto ja na conversa, e quem
                  // nao ve a tela nao tem outro jeito de saber.
                  descricao: TextosDaFotoNaConversa.previaAindaNaoEnviada,
                ),
                // O DESCARTE, sobre a imagem e no canto.
                //
                // Sobre a imagem porque e dela que ele fala, e um X numa linha
                // de botoes abaixo ficaria a uma distancia em que ninguem o
                // associa a foto. O alvo e o minimo do grupo `target` dos
                // tokens, e nao o tamanho do icone.
                Positioned(
                  top: 0,
                  right: 0,
                  child: _Descarte(aoTocar: aoDescartar),
                ),
              ],
            ),
            const SizedBox(height: BichuEspaco.e2),
            // O AVISO DE ALCANCE VEM PRIMEIRO, e antes do estado do envio.
            //
            // Ele nao depende da fase: vale desde a escolha, enquanto a foto
            // sobe e quando ela esta pronta -- e o fato que ele conta e sobre
            // o CANAL, nao sobre esta tentativa. Preso a uma fase so, ele
            // apareceria e desapareceria enquanto a pessoa decide.
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
          // A PREVIA FICA, e e por isso que a faixa vem ABAIXO dela e nao no
          // lugar dela: a pessoa escolheu uma foto, e perder a escolha junto
          // com a falha de rede a obrigaria a achar o arquivo na galeria outra
          // vez.
          FaixaDeAviso(
            texto: TextosDaFotoNaConversa.aFotoNaoSubiu,
            rotuloDaAcao: TextosDaFotoNaConversa.enviarAFotoDeNovo,
            aoTocarNaAcao: aoTentarDeNovo,
          ),
        ];
      case FaseDaFotoEscolhida.recusada:
        return <Widget>[
          FaixaDeAviso(
            // O TEXTO DO SERVIDOR quando ele veio. Ver [motivoDaRecusa].
            texto: motivoDaRecusa ?? TextosDaFotoNaConversa.aFotoFoiRecusada,
            peso: PesoDaFaixa.erro,
            // **Recusa nao oferece "tentar de novo", e oferece "descartar".**
            // Tipo nao aceito, tamanho acima do teto e arquivo incompleto
            // devolvem a mesma recusa na segunda tentativa; um botao de
            // insistir seria o toque sem desfecho.
            rotuloDaAcao: TextosDaFotoNaConversa.descartar,
            aoTocarNaAcao: aoDescartar,
          ),
        ];
    }
  }

  /// A barra de bytes.
  ///
  /// `value` nulo so quando nao ha total, e ai o texto diz o que esta
  /// acontecendo em vez de um numero inventado. Nunca ha barra determinada sem
  /// medicao atras dela.
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
              // **100% nao e "pronto".** Os ultimos pedacos ainda estao no
              // caminho e o servidor nao respondeu; dizer "pronto" aqui faria a
              // pessoa tocar em Enviar antes de haver `upload_id`.
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

  /// A linha da localizacao.
  ///
  /// Ela aparece **onde a foto esta**, e nao numa tela de ajuda: e aqui que a
  /// pessoa esta decidindo mandar uma foto tirada na casa dela.
  Widget _avisoDeLocalizacao(BichuCores cores, TextTheme textos) => Padding(
    padding: const EdgeInsets.only(top: BichuEspaco.e1),
    child: Text(
      TextosDaFotoNaConversa.aLocalizacaoSai,
      style: textos.bodySmall?.copyWith(color: cores.textMuted),
    ),
  );
}

/// O X que descarta a previa.
///
/// **Ele nao envia nada, e nao fala com a rede.** Descartar e local: a intencao
/// de upload nao confirmada vence sozinha no servidor (medido em 19/10/2026:
/// `expires_at` 599 s a frente do pedido) e o varredor a recolhe. Nao existe
/// rota de cancelamento de intencao no contrato, e inventar uma seria inventar
/// rota.
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
            // O ALVO E O MINIMO DO GRUPO `target`, e nao o tamanho do icone: um
            // X de 18 dp sobre uma foto e um alvo que a pessoa erra, e errar
            // aqui significa tocar na imagem em vez de descartar.
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
///
/// ---------------------------------------------------------------------------
/// ## A LEGENDA DIZ QUEM DISSE, E NAO O QUE E VERDADE
///
/// A foto que vem de quem diz ter encontrado o animal **nao e apresentada como
/// prova de posse**, e isso e decisao de produto com motivo material: a foto do
/// pet perdido e PUBLICA na listagem (`PublicLostPet.photo_url`), e quem nao
/// tem o animal pode baixa-la e devolve-la aqui. Uma legenda que dissesse
/// "comprovacao" emprestaria a essa imagem a credibilidade em que o golpe do
/// falso achador opera.
///
/// Ver `TextosDaFotoNaConversa` para as frases, e a isca
/// `test/mensagens/foto_dentro_da_conversa_test.dart`, que varre a tela
/// procurando as palavras proibidas.
///
/// ## A URL E ASSINADA E DE VALIDADE CURTA
///
/// Reabrir a conversa depois de um tempo cai no estado de falha de verdade. O
/// conserto nao e insistir na mesma URL -- e **pedir a conversa outra vez** e
/// receber uma assinatura nova, que e o que [aoBuscarDeNovo] faz. Sem isso a
/// tela mostraria um quadro quebrado sem saida.
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
  ///
  /// E por foto, e nao por conversa, e a diferenca e o que mantem a frase
  /// verdadeira: a foto que o achador mandou alcancou o tutor **por
  /// definicao** -- ela esta na tela dele agora. Quem decide e `_Bolha`, que e
  /// quem sabe de quem e a mensagem; esta peca so desenha o que recebeu.
  ///
  /// Marcar a imagem de outra pessoa com "esta pessoa nao ve fotos" seria dizer
  /// a coisa errada sobre a imagem errada -- e por isso a decisao NAO e
  /// repetida aqui dentro: uma segunda condicao seria a que diverge.
  final bool alcancouOOutroLado;

  /// A proporcao do quadro.
  ///
  /// 4:3 porque e a proporcao em que a maioria das fotos de celular sai, e
  /// porque `BoxFit.cover` recorta: um quadro quadrado cortaria a cabeca do
  /// animal numa foto em retrato, que e justamente o que a pessoa quer ver.
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
          // **A descricao e a LEGENDA**, e nao uma descricao do conteudo: o app
          // nao sabe o que ha na foto, e inventar ("foto de um cachorro") seria
          // afirmar algo que ele nao mediu. Quem ouve a tela recebe a mesma
          // ressalva que quem le.
          descricao: legenda,
          simboloDeFalha: Icons.image_not_supported_outlined,
          aoTocarNaFalha: aoBuscarDeNovo,
          textoDaFalha: TextosDaFotoNaConversa.aFotoNaoCarregou,
        ),
        Padding(
          padding: const EdgeInsets.only(top: BichuEspaco.e1),
          child: ExcludeSemantics(
            // A imagem acima ja se anuncia com esta frase. Sem isto o leitor de
            // tela a diria duas vezes seguidas.
            child: Text(
              legenda,
              style: textos.bodySmall?.copyWith(color: cores.textSecondary),
            ),
          ),
        ),
        // A MARCA NA MENSAGEM JA ENVIADA, so na do proprio tutor.
        //
        // **Sem `ExcludeSemantics`**, ao contrario da legenda: este fato nao
        // esta no nome acessivel da imagem, e quem ouve a tela precisa dele
        // tanto quanto quem a le -- e justamente ele que impede ficar
        // esperando reacao de quem nao viu nada.
        //
        // `textMuted` e nao `error`: nao e erro, e como o canal funciona. A
        // foto subiu, foi gravada e esta na conversa.
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
