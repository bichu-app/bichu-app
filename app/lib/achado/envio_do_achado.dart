/// O ENVIO do achado, uma vez só, para as duas telas que o fazem.
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
typedef AvisoDeEnvio = void Function();

/// Envia o achado, decide o desfecho e navega.
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
    return false;
  }

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
    await escopo.fila.enfileirar(
      AcaoEnfileirada(
        id: ApiClient.novaChaveDeIdempotencia(),
        metodo: 'POST',
        caminho: AchadosApi.caminhoDeRegistro,
        corpo: corpo,
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
