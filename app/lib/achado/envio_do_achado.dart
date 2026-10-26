/// O ENVIO do achado, uma vez só, para as duas telas que o fazem.
///
/// Existem dois caminhos de registro de achado, e eles não são duas regras:
///
/// - **F3.5**, `TelaRegistrarAchado`: o achado avulso, de quem encontrou um
///   animal **sem identificação** e descreve o que dá para ver;
/// - **`TelaEncontreiEstePet`**: quem achou um pet que está **na lista de
///   perdidos**, e por isso não redigita espécie, cor nem porte.
///
/// As duas montam `StrayFoundReportInput` pela MESMA
/// [AchadosApi.corpoDeRegistro] e têm os MESMOS cinco desfechos: a conta que
/// falta, a rede que caiu, a sessão que venceu no meio, a falha de api e o
/// registro. Escrever o envio nas duas telas daria duas cópias de cinco ramos
/// — e a segunda envelheceria calada, porque nenhum teste de uma tela lê a
/// outra. A primeira divergência apareceria exatamente onde ela custa mais:
/// na rua, com o animal no colo.
///
/// **A navegação fica aqui de propósito.** Ela não é enfeite do envio: qual é
/// a próxima tela É o desfecho. Devolver um resultado para cada tela decidir
/// para onde ir reabriria a porta de uma delas mandar a pessoa para a home
/// depois de um achado que foi para a fila — que é o defeito que o critério 2
/// da BICHUS-31 proíbe com todas as letras.
library;

import 'package:flutter/widgets.dart';
import 'package:go_router/go_router.dart';

import '../api/achados_api.dart';
import '../api/api_client.dart';
import '../api/falhas.dart';
import '../api/fila_offline.dart';
import '../api/mensagens_de_erro.dart';
import '../api/problem.dart';
import '../escopo.dart';
import '../intencao/achado_como_intencao.dart';
import '../roteamento/rotas.dart';
import '../telas/achado/resultado_do_achado.dart';
import 'rascunho_do_achado.dart';

/// O que o envio pede da tela que o chamou, e nada além disso.
///
/// Três avisos, e não um estado compartilhado: a tela continua dona do que ela
/// desenha. [aoComecar] acende o botão carregando, [aoFalhar] acende a faixa
/// de erro e apaga o carregando, [aoVoltarDoLogin] apaga o carregando sem
/// erro — a pessoa foi para a entrada e o envelope guardou tudo.
typedef AvisoDeEnvio = void Function();

/// Envia o achado, decide o desfecho e navega.
///
/// [rascunho] precisa estar completo: espécie, porte, `onde` e o instante de
/// `quando`. A conferência é da tela (o botão só habilita com os quatro), e
/// aqui ela é **repetida** porque uma tela nova pode chamar esta função antes
/// de ter a trava — e montar meio corpo é pior que não enviar.
///
/// Devolve `false` quando não enviou por rascunho incompleto, para o chamador
/// não acender carregando sobre coisa nenhuma.
Future<bool> enviarAchado({
  required BuildContext context,
  required RascunhoDoAchado rascunho,
  required DateTime agora,
  required String chave,
  required AvisoDeEnvio aoComecar,
  required void Function(MensagemDeErro erro) aoFalhar,
  required AvisoDeEnvio aoVoltarDoLogin,
}) async {
  final escopo = Escopo.of(context);
  final especie = rascunho.especie;
  final porte = rascunho.porte;
  final onde = rascunho.onde;
  final achadoEm = rascunho.instanteEm(agora);
  if (especie == null || porte == null || onde == null || achadoEm == null) {
    // Defesa de programacao: o botao so habilita com os quatro. Chegar aqui
    // sem eles e caminho de automacao ou de teclado fisico, e o envio responde
    // a coisa certa em vez de montar um corpo pela metade.
    return false;
  }

  // **Deslogada: a guarda assume ANTES da viagem de rede** (criterio 3).
  //
  // Nao e otimizacao: um POST sem token volta 401, e tratar o 401 seria
  // esperar o servidor dizer o que o app ja sabe -- na rua, com o sinal que
  // ha. O envelope guarda tudo, inclusive o caminho da foto E o
  // `share_token`, e depois de autenticar o achado e REGISTRADO e a pessoa
  // cai na tela do achado. Ela nao ve a home e nao digita nada duas vezes.
  if (!escopo.sessao.logado) {
    await escopo.guarda.guardar(
      intencaoDeRegistrarAchado(rascunho, criadaEm: agora),
    );
    if (!context.mounted) return true;
    context.push(Rotas.entrar);
    return true;
  }

  final corpo = AchadosApi.corpoDeRegistro(
    especie: especie,
    porte: porte,
    achadoEm: achadoEm,
    onde: onde,
    sexo: rascunho.sexo,
    racaCodigo: rascunho.racaCodigo,
    corCodigo: rascunho.corCodigo,
    versaoDaReferencia: rascunho.versaoDaReferencia,
    observacao: rascunho.observacao,
    shareToken: rascunho.shareToken,
  );

  aoComecar();

  try {
    final achado = await escopo.achados.registrar(
      corpo: corpo,
      idempotencyKey: chave,
    );
    if (!context.mounted) return true;
    context.pushReplacement(
      Rotas.achadoRegistrado,
      extra: ResultadoDoAchado.registrado(
        achado: achado,
        foto: rascunho.foto,
      ),
    );
  } on FalhaDeConexao {
    // **A acao vai para a fila, e a tela diz que ela foi para a fila.**
    // O criterio 2 da BICHUS-31 proibe tela de sucesso para o que nao
    // aconteceu: "achado registrado" seria mentira, e a pessoa pararia de
    // procurar caminho por acreditar que o aviso saiu.
    //
    // **A foto nao vai junto**, e a tela diz isso tambem: o corpo
    // enfileirado e o corpo do contrato, e o upload da foto exige um achado
    // que ainda nao existe. Achado sem foto vale menos, mas vale.
    await escopo.fila.enfileirar(
      AcaoEnfileirada(
        id: ApiClient.novaChaveDeIdempotencia(),
        metodo: 'POST',
        caminho: AchadosApi.caminhoDeRegistro,
        corpo: corpo,
        // A MESMA chave que a primeira tentativa usou.
        idempotencyKey: chave,
        criadaEm: agora,
      ),
    );
    if (!context.mounted) return true;
    context.pushReplacement(
      Rotas.achadoRegistrado,
      extra: ResultadoDoAchado.naFila(foto: rascunho.foto),
    );
  } on FalhaDaApi catch (falha) {
    if (!context.mounted) return true;
    if (falha.tipo == ProblemTipo.naoAutenticado ||
        falha.tipo == ProblemTipo.tokenExpirado) {
      // A sessao caiu entre abrir a tela e tocar no botao. Mesmo caminho do
      // deslogado: o envelope guarda, e o achado e registrado depois.
      await escopo.guarda.guardar(
        intencaoDeRegistrarAchado(rascunho, criadaEm: agora),
      );
      if (!context.mounted) return true;
      context.push(Rotas.entrar);
      aoVoltarDoLogin();
      return true;
    }
    aoFalhar(MensagensDeErro.de(falha));
  } on FalhaDeChamada catch (falha) {
    if (!context.mounted) return true;
    aoFalhar(MensagensDeErro.de(falha));
  }
  return true;
}
