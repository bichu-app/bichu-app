import 'package:flutter/material.dart';

import '../../dispositivo/saida_do_app.dart';
import '../abertura/recado_na_abertura.dart';
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
/// **E AS TRES CONTINUAM FECHADAS DEPOIS DE 26/10/2026**, quando o corpo desta
/// tela desceu para [RecadoNaAbertura] para ser compartilhado com o recado de
/// abertura sem internet. Quem garante e o `aoFechar` nulo: sem ele,
/// [RecadoNaAbertura] nao desenha acao secundaria e passa `canPop: false`.
/// Esta classe continua existindo como TIPO porque e por tipo que os portoes
/// de `portao_de_versao_test.dart` a procuram na arvore.
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
    final destino = loja;

    return RecadoNaAbertura(
      icone: Icons.system_update_outlined,
      titulo: TextosDaAtualizacao.tituloDoBloqueio,
      corpo: TextosDaAtualizacao.corpoDoBloqueio,
      semantica: TextosDaAtualizacao.semanticaDoBloqueio,
      // SEM LOJA: a instrucao em palavras, e NENHUM botao.
      semAcao: destino == null
          ? TextosDaAtualizacao.comoAtualizarSemLoja
          : null,
      rotuloDaAcao: destino == null ? null : TextosDaAtualizacao.irParaALoja,
      aoTocarNaAcao: destino == null
          ? null
          : () => SaidaDoApp.atual.abrirLink(destino),
      // **Nenhuma saida, de proposito.** Ver o cabecalho.
    );
  }
}
