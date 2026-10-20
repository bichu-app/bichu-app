import 'package:flutter/material.dart';
import 'package:go_router/go_router.dart';

import '../../roteamento/rotas.dart';
import '../../theme/bichu_colors.dart';
import '../../theme/bichu_tokens.g.dart';
import '../../widgets/barra_de_acao_fixa.dart';
import '../../widgets/bloco_de_informacao.dart';
import '../../widgets/botao_primario.dart';
import '../../widgets/faixa_de_aviso.dart';
import '../../widgets/previa_da_foto.dart';
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
/// ## A FOTO E DESENHADA, e ela vem do APARELHO
///
/// Pedido do cliente, 18/10/2026: *"Na pagina 'achado registrado' nao mostra
/// muita informacao, nao tem foto do pet ou alguma informacao util"*.
///
/// **A imagem e `PreviaDaFoto`, e nao `ImagemDaRede`, e a escolha nao e
/// preferencia.** `FoundReport.photo_url` volta **nulo** por criterio do
/// contrato (`api/openapi.yaml`, `components/schemas/FoundReport`): a foto do
/// achador e vista pelo tutor dentro da conversa mediada, e so. Nao existe
/// derivada a pedir ao servidor, e `ImagemDaRede` -- que recebe uma `url` nao
/// anulavel de proposito -- nao tem o que desenhar aqui. A foto que existe e o
/// arquivo que a pessoa acabou de escolher, que viaja em
/// [ResultadoDoAchado.foto] como `FotoLocal`.
///
/// `PreviaDaFoto` e a IRMA de `ImagemDaRede` e carrega a mesma disciplina de
/// memoria: `cacheWidth` pela largura que a tela PINTA (e nao pela do arquivo)
/// e `errorBuilder` obrigatorio -- foto de celular tem dezenas de megapixels, e
/// o `ui.Image` em memoria custa `largura x altura x 4` bytes da imagem
/// DECODIFICADA. Ela tambem mora fora de `lib/telas`, e por isso esta tela nao
/// precisa de `dart:io`: o portao de diretivas
/// (`test/dispositivo/porta_nao_contornada_test.dart`) proibe e continua
/// proibindo.
///
/// Sem foto, o estado continua dito em TEXTO -- o criterio 4 pede o estado
/// visivel, e *"achado sem foto vale menos, mas vale"*.
///
/// ## A TELA NAO DIZ QUE O TUTOR FOI AVISADO, e o bloco existe para isso
///
/// Houve um defeito em que tres lugares mentiam juntos: o servidor devolvia
/// `owner_notified: true`, a tela do achador afirmava em texto fixo que o
/// tutor foi avisado, e o desserializador do app ainda tinha `?? true`. Os
/// tres foram consertados, e **o envio de aviso no celular nao funciona** --
/// nem em producao (falta permissao da conta de servico na VM) nem no iPhone
/// deste build. O bloco `Quem foi avisado` responde `Ninguém foi avisado
/// ainda` e manda a pessoa conferir pelo app, porque quem acredita que alguem
/// foi chamado solta o animal na rua.
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
                    style: textos.bodyLarge?.copyWith(
                      color: cores.textSecondary,
                    ),
                  ),
                ],
              ),
            ),
            const SizedBox(height: BichuEspaco.e6),
            // ================================================================
            // A FOTO DO PET, que e a primeira coisa que faltava.
            //
            // `PreviaDaFoto` e nao `ImagemDaRede`: ver a prosa da classe. A
            // altura e 220 e nao os 300 do padrao -- este nao e o passo de
            // escolher a foto, onde o quadro grande e o assunto da tela; aqui
            // ela e uma entre quatro informacoes, e 300 dp empurrariam os
            // blocos de texto para fora da primeira dobra num aparelho de
            // 640 dp de altura util.
            //
            // **Sem foto o quadro NAO e desenhado**, e o estado vai na faixa
            // abaixo em texto. Um retangulo cinza com um icone no lugar diria
            // "faltou carregar" sobre um achado que nasceu sem foto por
            // escolha de quem o registrou.
            // ================================================================
            if (resultado.foto != null) ...<Widget>[
              PreviaDaFoto(
                foto: resultado.foto,
                descricao: TextosDoAchado.fotoEscolhidaDoAchado,
                altura: 220,
              ),
              const SizedBox(height: BichuEspaco.e2),
              // A QUEM A FOTO E MOSTRADA, na linha ja aprovada do formulario.
              // Ela e aviso de uso de dado, e repeti-la aqui e deliberado: a
              // pessoa escolheu a foto numa tela e a ve desenhada em outra.
              Text(
                TextosDoAchado.fotoSoNaConversa,
                style: textos.bodySmall?.copyWith(color: cores.textSecondary),
              ),
              const SizedBox(height: BichuEspaco.e4),
            ],
            FaixaDeAviso(
              peso: PesoDaFaixa.informativo,
              texto: resultado.foto == null
                  ? TextosDoAchado.semFoto
                  : TextosDoAchado.fotoAindaNaoSubiu,
            ),
            // ================================================================
            // O QUE A GENTE GUARDOU -- **so no estado registrado**.
            //
            // Na fila nao ha `AchadoRegistrado`: nao ha status, nao ha
            // `found_at` e nao ha rotulo de area montado pelo servidor.
            // Desenhar aqui o que a pessoa digitou, como se fosse o registro,
            // seria a tela afirmando sobre um registro que o servidor nao viu.
            // ================================================================
            if (achado != null) ...<Widget>[
              const SizedBox(height: BichuEspaco.e6),
              BlocoDeInformacao(
                titulo: TextosDoAchado.tituloDoQueGuardamos,
                linhas: <String>[
                  // O estado em PALAVRA, a mesma de `Meus achados`.
                  TextosDoAchado.estadoEmAnalise,
                  // O rotulo de area **so vem do servidor**; o nulo vira a
                  // linha neutra, e nao o bairro digitado. Escrever aqui o que
                  // a pessoa escreveu, como se fosse o que o tutor vai ler,
                  // repetiria do lado da tela o que o servidor nao montou.
                  achado.rotuloDaArea == null
                      ? TextosDoAchado.regiaoNaoInformada
                      : 'Região: ${achado.rotuloDaArea}',
                  // `found_at` e anulavel no contrato: o nulo nao vira data
                  // inventada, e a linha simplesmente nao sai.
                  if (achado.achadoEm != null)
                    TextosDoAchado.achadoEmTexto(achado.achadoEm!),
                ],
              ),
              if (achado.observacao != null &&
                  achado.observacao!.isNotEmpty) ...<Widget>[
                const SizedBox(height: BichuEspaco.e3),
                Text(
                  TextosDoAchado.rotuloDosSinais,
                  style: textos.labelLarge?.copyWith(
                    color: cores.textSecondary,
                  ),
                ),
                const SizedBox(height: BichuEspaco.e1),
                Text(achado.observacao!, style: textos.bodyLarge),
              ],
            ],
            // ================================================================
            // QUEM FOI AVISADO: **ninguem**, e a tela nao suaviza.
            //
            // Ver a prosa da classe. Este bloco e o que impede a tela de
            // voltar a afirmar entrega de aviso, e ele vale nos DOIS estados --
            // quem esta na fila entao e que nao avisou ninguem.
            // ================================================================
            const SizedBox(height: BichuEspaco.e6),
            BlocoDeInformacao(
              titulo: TextosDoAchado.tituloDeQuemFoiAvisado,
              linhas: <String>[
                TextosDoAchado.ninguemFoiAvisado,
                // So no estado registrado: na fila nao ha achado para um tutor
                // cruzar com nada.
                if (registrado) TextosDoAchado.oQueOTutorRecebe,
                TextosDoAchado.avisoNoCelularNaoFunciona,
              ],
            ),
            // ================================================================
            // O QUE FAZER AGORA: tres passos, e o primeiro nao depende de nos.
            // ================================================================
            const SizedBox(height: BichuEspaco.e6),
            BlocoDeInformacao(
              titulo: TextosDoAchado.tituloDoQueFazerAgora,
              linhas: const <String>[
                TextosDoAchado.passoDaPlaquinha,
                TextosDoAchado.passoDaListaDePerdidos,
                TextosDoAchado.passoDeCuidar,
              ],
            ),
            const SizedBox(height: BichuEspaco.e3),
            // A UNICA acao nova do corpo, e ela e o passo 1: escanear a
            // plaquinha e o unico caminho que alcanca o tutor **hoje**, sem
            // depender do aviso no celular que nao funciona. `push` e nao
            // `go`: quem escaneia e nao encontra nada volta para este
            // desfecho, que continua sendo o endereco do que ela registrou.
            BotaoSecundario(
              rotulo: TextosDoAchado.escanearAPlaquinha,
              aoTocar: () => context.push(Rotas.escanear),
            ),
          ],
        ),
      ),
      bottomNavigationBar: BarraDeAcaoFixa(
        // **O desfecho tinha UMA acao e ela levava a um beco.** `Voltar`
        // mandava para `Rotas.pets`, e `Rotas.pets` nao lista achado nenhum --
        // ela pinta o `EstadoVazio` "A lista de pets perdidos esta em
        // construcao" (`telas/abas.dart`). Nenhuma outra tela do app mostrava
        // o registro: `GET /v1/found-reports` nao tinha chamador em `app/lib`
        // e `Rotas.achadoDe` nao era chamada de lugar nenhum, o que deixava
        // [TelaDoAchado] construida, roteada e inalcancavel. O registro ia
        // para o banco certo, com `status = 'open'` e `reporter_user_id`
        // preenchido, e nao tinha UM caminho de leitura no aparelho.
        //
        // **A acao principal passa a ser ver o achado, e `Voltar` desce para
        // secundaria em texto** -- o mesmo arranjo de
        // `tela_pet_cadastrado.dart`, pela mesma razao escrita la: quem acabou
        // de registrar quer ver o que registrou.
        //
        // **So no estado REGISTRADO**, e a condicao e a regra: o achado que
        // foi para a fila offline nao tem id (`ResultadoDoAchado.naFila` nasce
        // com `achado: null`), e um botao que chamasse `Rotas.achadoDe` ali
        // montaria `/achados/null`. No estado de fila a tela continua com a
        // unica saida que ela sempre teve, que e a honesta: nao ha o que abrir.
        acoes: achado == null
            ? <Widget>[
                BotaoPrimario(
                  rotulo: TextosDoAchado.voltarParaOsPets,
                  aoTocar: () => context.go(Rotas.pets),
                ),
              ]
            : <Widget>[
                BotaoPrimario(
                  rotulo: TextosDoAchado.verOAchado,
                  // `go` e nao `push`: a tela de desfecho nao e lugar para
                  // voltar. Voltar para ca com o formulario ja enviado e o
                  // caminho do segundo registro do mesmo animal -- a mesma
                  // razao que fez a saida desta barra ser `fechar`.
                  aoTocar: () => context.go(Rotas.achadoDe(achado.id)),
                ),
                TextButton(
                  onPressed: () => context.go(Rotas.pets),
                  child: const Text(TextosDoAchado.voltarParaOsPets),
                ),
              ],
      ),
    );
  }
}
