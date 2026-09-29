/// `Pedir para participar` de um encontro privado como intencao (UX 8.3).
///
/// Quem toca em `Pedir para participar` sem conta recebe a guarda de acao
/// (design system 24.17.1, item 5): `Entre na sua conta para pedir. Depois de
/// entrar, a gente envia o pedido.` Esta e a metade que cumpre a segunda
/// frase: depois do login, [pedidoDeParticipacaoExecutavel] manda o pedido e a
/// pessoa volta ao encontro, com a caixa em `Pedido enviado`.
///
/// ## O envelope nao guarda nada da pessoa
///
/// So o `slug` do encontro, no `alvo`. O pedido e sem corpo no contrato
/// (`requestToJoinNetworkEvent`): nao ha texto livre nem pet, e por isso o
/// rascunho fica vazio.
library;

import '../api/api_client.dart';
import '../api/falhas.dart';
import '../api/mensagens_de_erro.dart';
import '../api/rede_api.dart';
import '../roteamento/rotas.dart';
import 'guarda_de_acao.dart';
import 'intencao_pendente.dart';

/// O ID de tela de retorno do encontro da `Rede`.
///
/// A tabela de telas da UX (27.5.2) nao numera o detalhe do evento; o ID
/// segue o prefixo da secao. [Rotas.rotaDaTelaDeUx] o traduz para a agenda
/// so para a guarda saber que a tela existe neste build; a volta de verdade e
/// o proprio encontro, pela `rotaDeRetorno` do executavel, porque o `slug`
/// esta no `alvo`.
const String telaDeRetornoDoEncontro = 'REDE.ENCONTRO';

IntencaoPendente intencaoDePedirParaParticipar(
  String slug, {
  required DateTime criadaEm,
}) {
  return IntencaoPendente(
    acao: AcaoDeIntencao.pedirParaParticipar,
    telaDeRetorno: telaDeRetornoDoEncontro,
    criadaEm: criadaEm,
    alvo: slug,
  );
}

/// O que o encontro recebe no `extra` quando o pedido feito depois do login
/// nao saiu: a mensagem, para a caixa do privado dize-la.
class RetomadaDoPedido {
  const RetomadaDoPedido(this.erro);
  final MensagemDeErro erro;
}

/// Recusa que pedir de novo nao conserta: o encontro terminou (`400`,
/// `event_ended`), deixou de existir ou deixou de ser privado (`404`). O
/// envelope morre, para o pedido nao ser refeito no proximo login.
bool _falhaDefinitiva(FalhaDeChamada falha) =>
    falha is FalhaDaApi &&
    (falha.problem.status == 400 || falha.problem.status == 404);

AcaoExecutavel pedidoDeParticipacaoExecutavel(ApiClient api) {
  return AcaoExecutavel(
    executar: (intencao) async {
      final slug = intencao.alvo;
      if (slug == null || slug.isEmpty) {
        throw const FormatException('intencao de pedido sem o encontro');
      }
      try {
        // Idempotente no servidor: pedir de novo nunca cria linha nova e
        // nunca revela recusa (ADR-0027 12.11).
        await RedeApi(api).pedir(slug);
      } on FalhaDeChamada catch (falha) {
        // Falha definitiva: volta ao encontro como RESULTADO, e a guarda
        // descarta o envelope. A transitoria (rede, 5xx) sobe: o envelope
        // fica e a pessoa volta ao encontro pela [rotaDeRetorno].
        if (!_falhaDefinitiva(falha)) rethrow;
        return ResultadoDaExecucao(
          rota: Rotas.encontroDaRedeDe(slug),
          extra: RetomadaDoPedido(MensagensDeErro.de(falha)),
        );
      }
      return ResultadoDaExecucao(rota: Rotas.encontroDaRedeDe(slug));
    },
    retomar: (intencao, erro) => erro == null ? null : RetomadaDoPedido(erro),
    rotaDeRetorno: (intencao) {
      final slug = intencao.alvo;
      return slug == null || slug.isEmpty ? null : Rotas.encontroDaRedeDe(slug);
    },
  );
}
