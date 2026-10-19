import 'package:flutter/material.dart';

import '../../api/falhas.dart';
import '../../api/mensagens_de_erro.dart';
import '../../api/vitrine_api.dart';
import '../../dispositivo/camera_e_galeria.dart';
import '../../theme/bichu_colors.dart';
import '../../theme/bichu_tokens.g.dart';
import '../../widgets/arrastar_para_atualizar.dart';
import '../../widgets/imagem_da_rede.dart';

/// A VITRINE DE FOTOS DO USUARIO — **visivel so ao dono**.
///
/// ## O que esta tela e, e o que ela nao e
///
/// Uma grade de ate NOVE fotos da propria conta, com a CAPA na posicao 0.
/// **Ela nao aparece em nenhuma outra tela, para ninguem.** O ADR-0025 item 2
/// proibe avatar de pessoa na superficie da `Rede` por nome, e o contrato
/// afirma em dois lugares que `Conversation.participants` nunca traz foto de
/// perfil — entao nao ha rota de vitrine de outra pessoa, e por isso nao ha
/// tela que a desenhe. A ausencia e a defesa.
///
/// **Fora de proposito, e cada ausencia e deliberada:** legenda, curtida,
/// contador e **marcar pessoa**. O ultimo e dado biometrico, e a recomendacao
/// registrada e recusar para sempre. Nao e omissao a ser preenchida depois.
///
/// **Os pets nao entram aqui.** Foto de pet mora em `pet_photos`, com o ciclo
/// de vida do cadastro do animal; esta tela REFERENCIA os pets e abre a pagina
/// deles por [aoAbrirMeusPets]. Copiar a foto do pet para a vitrine criaria
/// duas fotos do mesmo animal que divergem na primeira troca.
///
/// ## O PESO DA TELA, que e o motivo de a derivada de 320 px existir
///
/// A celula da grade tem [ladoDaCelula] = 104 dp. A 3x isso da **312 px
/// reais**, e e por isso que a grade pede `grid_url` (a derivada de 320 px) e
/// **nunca** `open_url` (1024 px) nem o original:
///
/// - a derivada de 176 px da foto unica do perfil seria **ampliada 1,8x**, e
///   ampliar nao acrescenta informacao nenhuma — so borra;
/// - a de 1024 px e dado demais, e a grade desenha ate NOVE de uma vez, entao o
///   desperdicio e multiplicado por nove. Foi assim que a vitrine da Loja
///   chegou a 9,8 MB numa tela.
///
/// E `cacheWidth` fecha a conta no decodificador: sem ele o `ui.Image` em
/// memoria custa a area do ARQUIVO e nao a do quadro, e nove deles engasgam um
/// aparelho modesto mesmo com o download pequeno.
///
/// ## `errorBuilder` em toda foto, e nao um retangulo cinza
///
/// Imagem que nao carrega vira a celula vazia COM RECADO, e nao um retangulo
/// que promete algo que nao vem. Acontece de verdade: a derivada pode ainda nao
/// existir (`status: processing`), e a rede do produto e usada na rua.
class VitrineDeFotosDoUsuario extends StatefulWidget {
  const VitrineDeFotosDoUsuario({
    required this.api,
    super.key,
    this.aoAbrirMeusPets,
  });

  /// A LEITURA, e nao a `VitrineApi` inteira: esta tela desenha, e nao escreve.
  /// Uma tela que alcancasse `substituir` poderia reordenar ou apagar a vitrine
  /// num toque errado.
  final LeituraDaVitrine api;

  /// Abre `Meus pets`. **Referencia, e nao inclusao**: a foto do pet nao entra
  /// na vitrine. Nulo nao desenha o atalho.
  final VoidCallback? aoAbrirMeusPets;

  /// O lado da celula, em dp. 104 dp — tres colunas com folga numa tela de
  /// 360 dp, e o numero de que saem os 312 px reais a 3x.
  static const double ladoDaCelula = 104;

  /// O vao entre celulas. 2 dp: a grade e um mosaico, e nao uma lista de
  /// cartoes — vao largo transformaria nove fotos em nove objetos soltos.
  static const double vaoDaGrade = 2;

  static const String tituloDaTela = 'Minhas fotos';

  /// O vazio. **Pede UMA foto, e nunca as nove**: a vitrine com uma foto e
  /// estado completo, e da terceira em diante o ganho e perto de zero.
  static const String textoDoVazio = 'Adicione uma foto para começar a sua vitrine.';

  static const String recadoDeFotoQueNaoAbriu = 'Não deu para mostrar esta foto.';

  static const String rotuloDaCapa = 'Capa';

  @override
  State<VitrineDeFotosDoUsuario> createState() => _EstadoDaVitrine();
}

class _EstadoDaVitrine extends State<VitrineDeFotosDoUsuario> {
  Vitrine? _vitrine;
  String? _falha;
  bool _carregando = true;

  @override
  void initState() {
    super.initState();
    _carregar();
  }

  Future<void> _carregar() async {
    setState(() {
      _carregando = true;
      _falha = null;
    });
    try {
      final vitrine = await widget.api.minhaVitrine();
      if (!mounted) return;
      setState(() {
        _vitrine = vitrine;
        _carregando = false;
      });
    } on FalhaDeChamada catch (falha) {
      if (!mounted) return;
      setState(() {
        // Falha NAO vira vitrine vazia: "ainda nao ha foto" e "nao deu para
        // carregar" sao coisas diferentes, e a segunda tem botao de tentar de
        // novo. Mostrar o vazio no lugar do erro faria a pessoa achar que as
        // fotos dela sumiram.
        _falha = MensagensDeErro.de(falha).texto;
        _carregando = false;
      });
    }
  }

  @override
  Widget build(BuildContext context) {
    final cores = BichuColors.of(context).cores;
    final textos = Theme.of(context).textTheme;

    return Scaffold(
      appBar: AppBar(title: const Text(VitrineDeFotosDoUsuario.tituloDaTela)),
      // O ARRASTAR-PARA-ATUALIZAR (cliente, 18/10/2026): *"Crie uma acao no
      // aplicativo de atualizar a pagina conforme o usuario puxa a pagina para
      // baixo"*. Por `ArrastarParaAtualizar`, o ponto unico do app -- nenhum
      // `RefreshIndicator` cru em tela nenhuma. A funcao e a MESMA do
      // `Tentar de novo` da faixa.
      body: SafeArea(
        child: ArrastarParaAtualizar(
          aoAtualizar: _carregar,
          child: ListView(
            padding: const EdgeInsets.all(BichuEspaco.e4),
            children: [
            // A ORIENTACAO DE TAMANHO, uma linha, VISIVEL NA TELA e antes de
            // qualquer envio — o cliente pediu expressamente. Ela vem de
            // `orientacaoDeTamanhoDaImagem`, o ponto unico: o teto de 5 MB
            // tambem vale na politica assinada e no servidor, e um texto
            // proprio aqui seria o segundo numero que divergiria do primeiro.
            Text(
              orientacaoDeTamanhoDaImagem,
              style: textos.bodySmall?.copyWith(color: cores.textSecondary),
            ),
            const SizedBox(height: BichuEspaco.e4),
            if (_carregando)
              const Center(child: Padding(padding: EdgeInsets.all(BichuEspaco.e4), child: CircularProgressIndicator()))
            else if (_falha != null)
              _erro(_falha!, cores, textos)
            else
              _grade(_vitrine, cores, textos),
            if (widget.aoAbrirMeusPets != null) ...[
              const SizedBox(height: BichuEspaco.e4),
              _atalhoDosPets(cores, textos),
            ],
          ],
        ),
        ),
      ),
    );
  }

  Widget _erro(String mensagem, BichuCores cores, TextTheme textos) {
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Text(mensagem, style: textos.bodyMedium?.copyWith(color: cores.textPrimary)),
        const SizedBox(height: BichuEspaco.e2),
        TextButton(onPressed: _carregar, child: const Text('Tentar de novo')),
      ],
    );
  }

  Widget _grade(Vitrine? vitrine, BichuCores cores, TextTheme textos) {
    final fotos = vitrine?.fotos ?? const <FotoDaVitrineLida>[];
    if (fotos.isEmpty) {
      return Semantics(
        label: VitrineDeFotosDoUsuario.textoDoVazio,
        child: Container(
          width: double.infinity,
          padding: const EdgeInsets.all(BichuEspaco.e4),
          decoration: BoxDecoration(
            color: cores.surfaceSunken,
            borderRadius: BorderRadius.circular(BichuRaio.lg),
            border: Border.all(color: cores.outline, width: BichuBorda.hairline),
          ),
          child: Text(
            VitrineDeFotosDoUsuario.textoDoVazio,
            textAlign: TextAlign.center,
            style: textos.bodyMedium?.copyWith(color: cores.textSecondary),
          ),
        ),
      );
    }

    // `shrinkWrap` porque a grade mora dentro de um `ListView`: ate nove
    // celulas nao justificam uma area de rolagem propria, e duas areas de
    // rolagem encaixadas e o que faz o gesto da pessoa ir para a errada.
    return GridView.builder(
      shrinkWrap: true,
      physics: const NeverScrollableScrollPhysics(),
      padding: EdgeInsets.zero,
      itemCount: fotos.length,
      gridDelegate: const SliverGridDelegateWithMaxCrossAxisExtent(
        maxCrossAxisExtent: VitrineDeFotosDoUsuario.ladoDaCelula,
        mainAxisSpacing: VitrineDeFotosDoUsuario.vaoDaGrade,
        crossAxisSpacing: VitrineDeFotosDoUsuario.vaoDaGrade,
        // 1:1. A derivada da grade e quadrada e cortada na origem, entao a
        // celula tem a mesma proporcao e nao sobra faixa vazia.
        childAspectRatio: 1,
      ),
      itemBuilder: (context, indice) => _celula(fotos[indice], cores, textos),
    );
  }

  Widget _celula(FotoDaVitrineLida foto, BichuCores cores, TextTheme textos) {
    final moldura = BoxDecoration(
      color: cores.surfaceSunken,
      borderRadius: BorderRadius.circular(BichuRaio.sm),
    );

    return ClipRRect(
      borderRadius: BorderRadius.circular(BichuRaio.sm),
      child: Stack(
        fit: StackFit.expand,
        children: [
          DecoratedBox(
            decoration: moldura,
            child: _imagemDaCelula(foto, cores, textos),
          ),
          // A CAPA, marcada. `position: 0` e a capa, e reordenar troca a capa:
          // o rotulo sai da ORDEM e nao de um campo proprio, que divergiria
          // dela na primeira reordenacao.
          if (foto.ehCapa)
            Positioned(
              left: BichuEspaco.e1,
              bottom: BichuEspaco.e1,
              child: Container(
                padding: const EdgeInsets.symmetric(
                  horizontal: BichuEspaco.e1,
                  vertical: 2,
                ),
                decoration: BoxDecoration(
                  color: cores.surface,
                  borderRadius: BorderRadius.circular(BichuRaio.sm),
                ),
                child: Text(
                  VitrineDeFotosDoUsuario.rotuloDaCapa,
                  style: textos.labelSmall?.copyWith(color: cores.textPrimary),
                ),
              ),
            ),
        ],
      ),
    );
  }

  Widget _imagemDaCelula(FotoDaVitrineLida foto, BichuCores cores, TextTheme textos) {
    final endereco = foto.urlDaGrade;

    // Sem derivada ainda (`processing`) ou recusada: a celula diz o estado em
    // vez de prometer uma imagem que nao vem. O motivo da recusa SAI na tela --
    // sem ele a pessoa le "recusada" e nao tem como consertar.
    if (endereco == null || endereco.isEmpty) {
      final recado = foto.estado == EstadoDaFoto.recusada
          ? (foto.motivoDaRecusa ?? VitrineDeFotosDoUsuario.recadoDeFotoQueNaoAbriu)
          : 'Preparando…';
      return Center(
        child: Padding(
          padding: const EdgeInsets.all(BichuEspaco.e1),
          child: Text(
            recado,
            textAlign: TextAlign.center,
            style: textos.labelSmall?.copyWith(color: cores.textSecondary),
          ),
        ),
      );
    }

    // `ImagemDaRede`, e NAO um `Image.network` proprio. Ela ja faz as duas
    // coisas que decidem o peso desta tela -- `cacheWidth` pela largura que a
    // celula REALMENTE pinta, e `errorBuilder` sempre -- e mora fora de
    // `lib/telas`, onde `dart:io` e proibido. Reescrever aqui seria a segunda
    // definicao de "como o app desenha imagem de servidor", e a segunda e a
    // que esquece o `cacheWidth` na primeira edicao.
    //
    // `proporcao: 1` porque a derivada da grade e QUADRADA e cortada na origem
    // (320 x 320): a celula tem a mesma proporcao e nao sobra faixa vazia.
    return ImagemDaRede(
      url: endereco,
      descricao: foto.textoAlternativo,
      raio: BichuRaio.sm,
      // O retrato de uma pessoa falhando pede outro desenho que uma fachada
      // falhando, e e por isso que este simbolo e parametro.
      simboloDeFalha: Icons.photo_outlined,
    );
  }

  Widget _atalhoDosPets(BichuCores cores, TextTheme textos) {
    // REFERENCIA, e nao inclusao. A foto do pet mora em `pet_photos` e tem o
    // ciclo de vida do cadastro do animal; a vitrine aponta para a pagina dele.
    return InkWell(
      onTap: widget.aoAbrirMeusPets,
      child: Padding(
        padding: const EdgeInsets.symmetric(vertical: BichuEspaco.e2),
        child: Row(
          children: [
            Expanded(
              child: Text(
                'As fotos dos seus pets ficam na página de cada um.',
                style: textos.bodySmall?.copyWith(color: cores.textSecondary),
              ),
            ),
            const Icon(Icons.chevron_right),
          ],
        ),
      ),
    );
  }
}
