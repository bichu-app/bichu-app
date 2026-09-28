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
import '../api/rede_api.dart';
import '../roteamento/rotas.dart';
import 'guarda_de_acao.dart';
import 'intencao_pendente.dart';

/// O ID de tela de retorno do encontro da `Rede`.
///
/// A tabela de telas da UX (27.5.2) nao numera o detalhe do evento; o ID
/// segue o prefixo da secao. [Rotas.rotaDaTelaDeUx] o traduz para a agenda,
/// que e para onde a pessoa volta se o pedido falhar depois do login: la ela
/// reabre o encontro e toca de novo, com a conta ja aberta.
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

AcaoExecutavel pedidoDeParticipacaoExecutavel(ApiClient api) {
  return AcaoExecutavel(
    executar: (intencao) async {
      final slug = intencao.alvo;
      if (slug == null || slug.isEmpty) {
        throw const FormatException('intencao de pedido sem o encontro');
      }
      // Idempotente no servidor: pedir de novo nunca cria linha nova e nunca
      // revela recusa (ADR-0027 12.11).
      await RedeApi(api).pedir(slug);
      return ResultadoDaExecucao(rota: Rotas.encontroDaRedeDe(slug));
    },
    retomar: (intencao, erro) => null,
  );
}
