import 'package:flutter/material.dart';
import 'package:go_router/go_router.dart';

import '../../api/modelos_achado.dart';
import '../../roteamento/rotas.dart';
import '../../theme/bichu_colors.dart';
import '../../theme/bichu_tokens.g.dart';
import '../../widgets/barra_de_acao_fixa.dart';
import '../../widgets/bloco_de_informacao.dart';
import '../../widgets/botao_primario.dart';
import '../../widgets/faixa_de_aviso.dart';
import '../../widgets/imagem_da_rede.dart';
import '../../widgets/previa_da_foto.dart';
import '../../widgets/saida_da_tela.dart';
import 'resultado_do_achado.dart';
import 'textos_do_achado.dart';

/// O desfecho de F3.5, nos **dois** estados que ele tem.
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
            if (achado?.petCorrespondente != null) ...<Widget>[
              _CartaoDoPetCorrespondente(pet: achado!.petCorrespondente!),
              const SizedBox(height: BichuEspaco.e6),
            ],
            if (resultado.foto != null) ...<Widget>[
              PreviaDaFoto(
                foto: resultado.foto,
                descricao: TextosDoAchado.fotoEscolhidaDoAchado,
                altura: 220,
              ),
              const SizedBox(height: BichuEspaco.e2),
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
            if (achado != null) ...<Widget>[
              const SizedBox(height: BichuEspaco.e6),
              BlocoDeInformacao(
                titulo: TextosDoAchado.tituloDoQueGuardamos,
                linhas: <String>[
                  TextosDoAchado.estadoEmAnalise,
                  achado.rotuloDaArea == null
                      ? TextosDoAchado.regiaoNaoInformada
                      : 'Região: ${achado.rotuloDaArea}',
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
            const SizedBox(height: BichuEspaco.e6),
            BlocoDeInformacao(
              titulo: TextosDoAchado.tituloDeQuemFoiAvisado,
              linhas: <String>[
                TextosDoAchado.ninguemFoiAvisado,
                if (registrado) TextosDoAchado.oQueOTutorRecebe,
                TextosDoAchado.avisoNoCelularNaoFunciona,
              ],
            ),
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
            BotaoSecundario(
              rotulo: TextosDoAchado.escanearAPlaquinha,
              aoTocar: () => context.push(Rotas.escanear),
            ),
          ],
        ),
      ),
      bottomNavigationBar: BarraDeAcaoFixa(
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

/// O cartao de LEITURA do pet ja identificado: a capa e o nome.
class _CartaoDoPetCorrespondente extends StatelessWidget {
  const _CartaoDoPetCorrespondente({required this.pet});

  final PetCorrespondenteDoAchado pet;

  @override
  Widget build(BuildContext context) {
    final cores = BichuColors.of(context).cores;
    final textos = Theme.of(context).textTheme;
    final url = pet.urlDaFoto;

    return Container(
      padding: const EdgeInsets.all(BichuEspaco.e4),
      decoration: BoxDecoration(
        color: cores.surfaceAlt,
        borderRadius: BorderRadius.circular(BichuRaio.md),
      ),
      child: Row(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: <Widget>[
          if (url != null) ...<Widget>[
            ImagemDaRede(
              url: url,
              descricao: TextosDoAchado.fotoDoPetDoCaso(pet.nome),
              largura: 72,
              simboloDeFalha: Icons.pets_outlined,
            ),
            const SizedBox(width: BichuEspaco.e4),
          ],
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: <Widget>[
                Text(
                  TextosDoAchado.rotuloDeQuemE,
                  style: textos.labelMedium?.copyWith(
                    color: cores.textSecondary,
                  ),
                ),
                const SizedBox(height: BichuEspaco.e1),
                Text(pet.nome, style: textos.titleMedium),
              ],
            ),
          ),
        ],
      ),
    );
  }
}
