/// Até quatro imagens 16:9 num campo de formulário, **com a primeira como
/// capa**, reordenação e remoção.
///
/// Pedido do cliente de 29/10/2026: *"nas indicações de estabelecimento e
/// eventos só está sendo possível enviar uma imagem no app, devemos deixar
/// enviar até 4 imagens"*.
///
/// ## POR QUE ESTA PEÇA MORA EM `widgets/` E NÃO EM `telas/`
///
/// Ela **não pega foto do aparelho**: `tirarFoto` e `escolherDaGaleria` são
/// chamados pela tela, que é quem também chama `ajustarAFoto`. Esta peça só
/// recebe [VoidCallback]s. A razão é o portão de exaustividade do recorte
/// (`app/test/telas/recorte_em_todo_upload_test.dart`): ele conta ARQUIVOS sob
/// `app/lib/telas` que casam a expressão de aquisição e exige que cada um
/// também chame `ajustarAFoto`. Uma peça compartilhada que chamasse a câmera
/// moveria aquela contagem e, pior, tiraria a aquisição do arquivo que o mapa
/// `pontos` nomeia -- "capa do encontro" e "logotipo da indicação" deixariam de
/// apontar para a tela que o cliente reconhece.
///
/// ## O ORÇAMENTO DE DECODIFICAÇÃO É REQUISITO DESTA PEÇA
///
/// Quatro faixas 16:9 na mesma tela decodificadas no tamanho do ARQUIVO é
/// memória que o aparelho não tem para dar: medido neste produto, vinte faixas
/// 16:9 custaram 65,6 MiB de imagem decodificada, e uma lista chegou a 9,8 MB
/// na primeira pintura. A miniatura por isso desenha com [PreviaDaFoto], que
/// decodifica em `cacheWidth` medido pela largura REAL do bloco vezes o
/// `devicePixelRatio` -- e não pela dimensão do arquivo. Com a miniatura em
/// [larguraDaMiniatura] dp, o custo de quatro imagens cai de dezenas de MiB
/// para a ordem de centenas de KiB, e o número não depende do arquivo que a
/// pessoa escolheu.
///
/// É por isso que a faixa é uma LINHA com miniatura pequena, e não quatro
/// banners de largura inteira: o tamanho desenhado é o tamanho decodificado.
library;

import 'package:flutter/material.dart';

import '../dispositivo/camera_e_galeria.dart';
import '../theme/bichu_colors.dart';
import '../theme/bichu_tokens.g.dart';
import 'botao_primario.dart';
import 'faixa_de_aviso.dart';
import 'previa_da_foto.dart';

/// Os rótulos que mudam entre os dois usos desta peça.
@immutable
class TextosDaFaixaDeImagens {
  const TextosDaFaixaDeImagens({
    required this.titulo,
    required this.ajuda,
    required this.tirarAFoto,
    required this.escolherDaGaleria,
    required this.cameraNosAjustes,
    required this.abrirAjustes,
  });

  final String titulo;
  final String ajuda;
  final String tirarAFoto;
  final String escolherDaGaleria;
  final String cameraNosAjustes;
  final String abrirAjustes;
}

/// Até [maximo] imagens, a primeira sendo a capa.
class FaixaDeImagens extends StatelessWidget {
  const FaixaDeImagens({
    required this.imagens,
    required this.enviando,
    required this.permissao,
    required this.textos,
    required this.aoTirar,
    required this.aoEscolher,
    required this.aoAbrirAjustes,
    required this.aoMover,
    required this.aoRemover,
    super.key,
    this.subindo,
    this.maximo = maximoDoContrato,
    this.mostrarAvisoDeAjustes = true,
  });

  /// As imagens já no armazenamento, **na ordem em que a pessoa as pôs**.
  final List<FotoLocal> imagens;

  /// Os bytes de uma imagem estão subindo (não o formulário).
  final bool enviando;

  /// A imagem cujos bytes estão **subindo AGORA**, desenhada como prévia
  /// provisória no fim da faixa.
  ///
  /// **Ela existe porque "apresentar como vai ficar" foi palavra do cliente**, e
  /// a derivada do servidor não existe nesse instante: sem este lugar a pessoa
  /// toca em escolher, a folha de recorte fecha e a tela não muda em nada até o
  /// envio terminar. Ela **não é reordenável nem removível**: enquanto não há
  /// `upload_id` ela não tem posição no corpo, e oferecer "mover" sobre algo que
  /// ainda não entrou na lista seria oferecer o que não existe.
  final FotoLocal? subindo;

  final EstadoDaPermissao permissao;
  final TextosDaFaixaDeImagens textos;
  final VoidCallback? aoTirar;
  final VoidCallback? aoEscolher;
  final VoidCallback aoAbrirAjustes;

  /// Move a imagem de [de] para [para]. A tela refaz a lista.
  final void Function(int de, int para) aoMover;

  final void Function(int indice) aoRemover;

  /// **Quatro, e é o número do contrato** (`maxItems: 4` em
  /// `DirectorySuggestionInput.photo_upload_ids` e em
  /// `CommunityNetworkEventInput.image_upload_ids`). O painel segue com oito, e
  /// a assimetria é deliberada: alinhar os dois exigiria um pedido.
  static const int maximoDoContrato = 4;

  final int maximo;

  /// Desenha a faixa de "a câmera está bloqueada nos ajustes".
  ///
  /// **Falso quando a tela JÁ tem esse aviso em outro campo**, e isso não é
  /// estética: na tela de indicar, o bloco do logotipo e esta faixa convivem, e
  /// dois avisos iguais dão dois botões `Abrir os ajustes` -- indistinguíveis
  /// para quem usa leitor de tela, e ambíguos para `tap()` no caso de teste
  /// (medido: foi exatamente assim que o caso do logotipo reprovou).
  final bool mostrarAvisoDeAjustes;

  /// A largura da miniatura, em dp. **É ela que define o custo decodificado**:
  /// ver a prosa do topo deste arquivo.
  static const double larguraDaMiniatura = 112;

  /// 16:9 sobre [larguraDaMiniatura], arredondado para alvo de toque inteiro.
  static const double alturaDaMiniatura = larguraDaMiniatura * 9 / 16;

  /// O que o leitor de tela anuncia na primeira imagem.
  static const String rotuloDaCapa = 'Capa';

  static const String moverParaCima = 'Mover para cima';

  static const String moverParaBaixo = 'Mover para baixo';

  static const String remover = 'Remover';

  /// **Diz QUAL é a capa, com a imagem na tela.** Sem esta linha a regra "a
  /// primeira é a capa" só existe no contrato, e a pessoa descobre a ordem
  /// depois de publicar.
  static const String aPrimeiraEACapa =
      'A primeira é a capa. Use as setas para mudar a ordem.';

  /// O que a faixa diz quando o teto foi alcançado.
  static String tetoAlcancado(int maximo) =>
      'Você já escolheu $maximo imagens. Remova uma para trocar.';

  /// A descrição de uma imagem pela POSIÇÃO, para o leitor de tela.
  static String descricaoDaImagem(int indice, int total) => indice == 0
      ? 'Imagem 1 de $total, a capa'
      : 'Imagem ${indice + 1} de $total';

  /// A chave que distingue o MESMO controle em linhas diferentes.
  ///
  /// Quatro linhas na tela dão quatro botões `Remover`, e sem a posição nem o
  /// caso de teste nem o leitor de tela os separa.
  static Key chaveDoControle(String rotulo, int posicao) =>
      ValueKey<String>('faixa-de-imagens-$rotulo-$posicao');

  @override
  Widget build(BuildContext context) {
    final cores = BichuColors.of(context).cores;
    final textoDoTema = Theme.of(context).textTheme;
    final provisoria = subindo;
    // **O teto conta a que está subindo.** Sem isso o botão volta a ficar
    // tocável na janela do envio e a tela pede uma quinta assinatura.
    final cheio = imagens.length + (provisoria == null ? 0 : 1) >= maximo;
    final nadaNaTela = imagens.isEmpty && provisoria == null;

    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: <Widget>[
        Semantics(
          header: true,
          child: Text(textos.titulo, style: textoDoTema.titleMedium),
        ),
        const SizedBox(height: BichuEspaco.e1),
        Text(
          textos.ajuda,
          style: textoDoTema.bodySmall?.copyWith(color: cores.textSecondary),
        ),
        if (nadaNaTela) ...<Widget>[
          const SizedBox(height: BichuEspaco.e3),
          _QuadroVazio(cores: cores, enviando: enviando),
        ] else ...<Widget>[
          const SizedBox(height: BichuEspaco.e2),
          Text(
            aPrimeiraEACapa,
            style: textoDoTema.bodySmall?.copyWith(color: cores.textSecondary),
          ),
          const SizedBox(height: BichuEspaco.e3),
          for (var i = 0; i < imagens.length; i += 1)
            Padding(
              padding: const EdgeInsets.only(bottom: BichuEspaco.e2),
              child: _LinhaDaImagem(
                foto: imagens[i],
                indice: i,
                total: imagens.length,
                cores: cores,
                enviando: enviando,
                aoMover: aoMover,
                aoRemover: aoRemover,
              ),
            ),
          if (provisoria != null)
            _LinhaDaImagem(
              foto: provisoria,
              indice: imagens.length,
              total: imagens.length + 1,
              cores: cores,
              enviando: true,
              provisoria: true,
              aoMover: aoMover,
              aoRemover: aoRemover,
            ),
        ],
        const SizedBox(height: BichuEspaco.e3),
        Text(
          cheio ? tetoAlcancado(maximo) : orientacaoDeTamanhoDaImagem,
          style: textoDoTema.bodySmall?.copyWith(color: cores.textSecondary),
        ),
        const SizedBox(height: BichuEspaco.e3),
        if (mostrarAvisoDeAjustes &&
            permissao == EstadoDaPermissao.negadaPermanentemente) ...<Widget>[
          FaixaDeAviso(
            peso: PesoDaFaixa.informativo,
            texto: textos.cameraNosAjustes,
            rotuloDaAcao: textos.abrirAjustes,
            aoTocarNaAcao: aoAbrirAjustes,
          ),
          const SizedBox(height: BichuEspaco.e3),
        ],
        // **Os dois botões continuam na tela com o teto alcançado, e
        // DESABILITADOS.** Esconder o controle quando a ação não cabe faz a
        // pessoa procurar o que desapareceu; a linha de apoio acima diz o
        // motivo.
        if (permissao != EstadoDaPermissao.indisponivel) ...<Widget>[
          BotaoSecundario(
            rotulo: textos.tirarAFoto,
            aoTocar: (enviando || cheio) ? null : aoTirar,
          ),
          const SizedBox(height: BichuEspaco.e2),
        ],
        OutlinedButton(
          onPressed: (enviando || cheio) ? null : aoEscolher,
          style: OutlinedButton.styleFrom(
            minimumSize: const Size.fromHeight(BichuAlvoDeToque.min),
          ),
          child: Text(textos.escolherDaGaleria),
        ),
      ],
    );
  }

  /// O rótulo da linha provisória, enquanto os bytes sobem.
  static const String subindoAgora = 'Enviando…';
}

/// Uma imagem da faixa: a miniatura, a posição e os três controles.
class _LinhaDaImagem extends StatelessWidget {
  const _LinhaDaImagem({
    required this.foto,
    required this.indice,
    required this.total,
    required this.cores,
    required this.enviando,
    required this.aoMover,
    required this.aoRemover,
    this.provisoria = false,
  });

  final FotoLocal foto;
  final int indice;
  final int total;
  final BichuCores cores;
  final bool enviando;
  final void Function(int de, int para) aoMover;
  final void Function(int indice) aoRemover;

  /// Os bytes desta imagem ainda estão subindo: ela não tem `upload_id`, logo
  /// não tem posição no corpo, logo não tem controle de ordem nem de remoção.
  final bool provisoria;

  @override
  Widget build(BuildContext context) {
    final textos = Theme.of(context).textTheme;
    final ehCapa = indice == 0 && !provisoria;

    return Row(
      children: <Widget>[
        ClipRRect(
          borderRadius: BorderRadius.circular(BichuRaio.md),
          child: SizedBox(
            width: FaixaDeImagens.larguraDaMiniatura,
            height: FaixaDeImagens.alturaDaMiniatura,
            // **`comInvolucroProprio: false` de propósito**: o quadro é este
            // `ClipRRect`, e o involucro de `PreviaDaFoto` fixaria a altura
            // padrão de 300 dp -- o que decodificaria a imagem muito maior do
            // que esta linha desenha.
            child: PreviaDaFoto(
              foto: foto,
              descricao: FaixaDeImagens.descricaoDaImagem(indice, total),
              comInvolucroProprio: false,
            ),
          ),
        ),
        const SizedBox(width: BichuEspaco.e3),
        Expanded(
          child: Text(
            provisoria
                ? FaixaDeImagens.subindoAgora
                : (ehCapa
                    ? FaixaDeImagens.rotuloDaCapa
                    : 'Imagem ${indice + 1}'),
            style: textos.bodyMedium?.copyWith(
              color: ehCapa ? cores.textPrimary : cores.textSecondary,
            ),
          ),
        ),
        if (provisoria)
          const Padding(
            padding: EdgeInsets.symmetric(horizontal: BichuEspaco.e3),
            child: SizedBox(
              height: BichuEspaco.e5,
              width: BichuEspaco.e5,
              child: CircularProgressIndicator(
                strokeWidth: BichuBorda.medium,
              ),
            ),
          )
        else ...<Widget>[
        _BotaoDeOrdem(
          icone: Icons.arrow_upward,
          rotulo: FaixaDeImagens.moverParaCima,
          posicao: indice,
          aoTocar: (enviando || indice == 0)
              ? null
              : () => aoMover(indice, indice - 1),
        ),
        _BotaoDeOrdem(
          icone: Icons.arrow_downward,
          rotulo: FaixaDeImagens.moverParaBaixo,
          posicao: indice,
          aoTocar: (enviando || indice == total - 1)
              ? null
              : () => aoMover(indice, indice + 1),
        ),
        _BotaoDeOrdem(
          icone: Icons.close,
          rotulo: FaixaDeImagens.remover,
          posicao: indice,
          aoTocar: enviando ? null : () => aoRemover(indice),
        ),
        ],
      ],
    );
  }
}

/// Um dos três controles da linha.
///
/// O rótulo semântico leva a POSIÇÃO: três linhas na tela dariam três botões
/// `Remover` indistinguíveis para quem usa leitor de tela, e para quem escreve
/// o caso de teste.
class _BotaoDeOrdem extends StatelessWidget {
  const _BotaoDeOrdem({
    required this.icone,
    required this.rotulo,
    required this.posicao,
    required this.aoTocar,
  });

  final IconData icone;
  final String rotulo;
  final int posicao;
  final VoidCallback? aoTocar;

  @override
  Widget build(BuildContext context) {
    return IconButton(
      key: FaixaDeImagens.chaveDoControle(rotulo, posicao),
      icon: Icon(icone),
      tooltip: rotulo,
      onPressed: aoTocar,
      constraints: const BoxConstraints(
        minWidth: BichuAlvoDeToque.min,
        minHeight: BichuAlvoDeToque.min,
      ),
      iconSize: 20,
      padding: EdgeInsets.zero,
    );
  }
}

/// O lugar das imagens quando não há nenhuma.
class _QuadroVazio extends StatelessWidget {
  const _QuadroVazio({required this.cores, required this.enviando});

  final BichuCores cores;

  /// Os bytes estão subindo. Troca o símbolo por um indicador -- é a diferença
  /// entre "cabem imagens aqui" e "a sua imagem está subindo", dita sem uma
  /// linha de texto nova.
  final bool enviando;

  @override
  Widget build(BuildContext context) {
    return Container(
      height: FaixaDeImagens.alturaDaMiniatura,
      width: FaixaDeImagens.larguraDaMiniatura,
      alignment: Alignment.center,
      decoration: BoxDecoration(
        color: cores.surfaceSunken,
        borderRadius: BorderRadius.circular(BichuRaio.md),
        border: Border.all(color: cores.outline, width: BichuBorda.hairline),
      ),
      child: enviando
          ? const SizedBox(
              height: BichuEspaco.e6,
              width: BichuEspaco.e6,
              child: CircularProgressIndicator(
                strokeWidth: BichuBorda.medium,
              ),
            )
          : Icon(Icons.image_outlined, color: cores.textSecondary, size: 32),
    );
  }
}
