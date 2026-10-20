import 'package:flutter/material.dart';

import '../../dispositivo/saida_do_app.dart';
import '../../theme/bichu_colors.dart';
import '../../theme/bichu_tokens.g.dart';
import '../../widgets/botao_primario.dart';
import 'textos_da_atualizacao.dart';

/// A TELA DE BLOQUEIO por versao minima. **Nao da para fechar.**
///
/// ====================================================================
/// AS TRES SAIDAS QUE ELA FECHA, UMA POR UMA
/// ====================================================================
///
/// 1. **Nao ha botao de voltar.** Nao ha `AppBar`, entao nao ha a seta que o
///    `Scaffold` desenharia sozinho quando a rota pode ser descartada.
/// 2. **O gesto e o botao de voltar do sistema nao saem.** `PopScope` com
///    `canPop: false`. Sem ele, o Android volta para a tela anterior com um
///    gesto de borda e o bloqueio fica para tras.
/// 3. **Nao ha "continuar assim".** Nao existe acao secundaria nesta tela, e
///    isso nao e falta: bloqueio com saida nao e bloqueio. O contraste com a
///    antessala de localizacao e deliberado -- la as duas acoes tem o MESMO
///    peso porque as duas sao caminhos legitimos; aqui ha um caminho so.
///
/// ====================================================================
/// O BOTAO SO EXISTE QUANDO HA DESTINO
/// ====================================================================
///
/// [loja] nula -- que e o estado de hoje, porque nao ha loja -- faz a tela
/// mostrar [TextosDaAtualizacao.comoAtualizarSemLoja] NO LUGAR do botao.
///
/// Botao que leva a lugar nenhum e pior que nenhum botao: ele parece a saida, a
/// pessoa toca, nada acontece, e ela conclui que o aplicativo esta quebrado em
/// vez de concluir que precisa pedir o arquivo novo. Esta e tambem a resposta
/// para o build de provisionamento gratuito do iOS, instalado por cabo: ali
/// "va para a loja" seria instrucao impossivel, e o que resolve nao e o app
/// adivinhar de onde foi instalado -- e `store_url` ficar vazio naquela
/// plataforma.
///
/// A tela NAO fala com o aparelho: ela abre o link pela porta [SaidaDoApp],
/// como `pagina_do_local` e `lista_do_diretorio`. E o arranjo que
/// `porta_nao_contornada_test.dart` exige.
class TelaDeBloqueioPorVersao extends StatelessWidget {
  const TelaDeBloqueioPorVersao({super.key, this.loja});

  /// Para onde o botao manda. **Nula, nao ha botao.**
  final Uri? loja;

  @override
  Widget build(BuildContext context) {
    final cores = BichuColors.of(context).cores;
    final textos = Theme.of(context).textTheme;
    final destino = loja;

    return PopScope(
      // O gesto de voltar e o botao do sistema nao descartam esta tela. Sem
      // isto o bloqueio e contornavel com um gesto de borda no Android.
      canPop: false,
      child: Scaffold(
        backgroundColor: cores.surface,
        // Sem `AppBar`: a seta de voltar que o Scaffold desenharia sozinho
        // seria a quarta saida, e ela apareceria sem ninguem decidir.
        body: SafeArea(
          child: Center(
            child: SingleChildScrollView(
              // Rola de proposito: com a escala de fonte do sistema em 200%
              // (que o app respeita, SC 1.4.4) este texto nao cabe em tela
              // pequena, e conteudo cortado numa tela sem saida e uma pessoa
              // sem instrucao.
              padding: const EdgeInsets.all(BichuEspaco.e6),
              child: Semantics(
                container: true,
                label: TextosDaAtualizacao.semanticaDoBloqueio,
                child: Column(
                  mainAxisSize: MainAxisSize.min,
                  crossAxisAlignment: CrossAxisAlignment.stretch,
                  children: <Widget>[
                    Icon(
                      Icons.system_update_outlined,
                      size: BichuEspaco.e10,
                      color: cores.primary,
                      // O icone e decoracao: quem lê com leitor de tela recebe
                      // o rotulo do `Semantics` acima, e um icone anunciado
                      // seria uma leitura a mais sem informacao a mais.
                      semanticLabel: null,
                    ),
                    const SizedBox(height: BichuEspaco.e6),
                    Semantics(
                      header: true,
                      child: Text(
                        TextosDaAtualizacao.tituloDoBloqueio,
                        style: textos.headlineSmall?.copyWith(
                          color: cores.primary,
                        ),
                      ),
                    ),
                    const SizedBox(height: BichuEspaco.e4),
                    Text(
                      TextosDaAtualizacao.corpoDoBloqueio,
                      style: textos.bodyLarge,
                    ),
                    const SizedBox(height: BichuEspaco.e6),
                    if (destino == null)
                      // SEM LOJA: a instrucao em palavras, e NENHUM botao.
                      Text(
                        TextosDaAtualizacao.comoAtualizarSemLoja,
                        style: textos.bodyMedium?.copyWith(
                          color: cores.textSecondary,
                        ),
                      )
                    else
                      BotaoPrimario(
                        rotulo: TextosDaAtualizacao.irParaALoja,
                        aoTocar: () => SaidaDoApp.atual.abrirLink(destino),
                      ),
                  ],
                ),
              ),
            ),
          ),
        ),
      ),
    );
  }
}
