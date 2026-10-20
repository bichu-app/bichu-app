/// "Eu ia LER isto" como intencao guardada (UX 8.3, estendida em 20/10/2026).
///
/// ## Por que uma LEITURA entra num mecanismo feito para ACOES
///
/// Pedido do cliente de 20/10/2026, literal: *"adicione uma informacao, quando
/// o usuario estiver deslogado e tentar clicar para ver detalhes de algum
/// conteudo ... que ele precisa estar logado para ver mais informacoes"*.
///
/// Dizer isso e meia entrega. **Medido** nesta arvore, antes desta frente: na
/// pagina de um pet alcancada por link sem conta, o convite aparece, a pessoa
/// toca em `Entrar`, entra -- e o app a deixa em `/pets`. A pagina que ela
/// pediu some da pilha, porque `irParaODestinoDoLogin` navega com `go` e o
/// unico destino de quem nao tem envelope guardado e a secao de aterrissagem.
/// Ela tem de achar o link de novo, no WhatsApp, e tocar outra vez.
///
/// `GuardaDeAcao` ja resolve exatamente isso para quem ESCREVE, e a prosa dela
/// nomeia a diferenca entre as duas entregas: *"A meia-entrega leva a pessoa
/// de volta ao formulario preenchido e pede que ela toque no botao de novo"*.
/// A versao de leitura da mesma frase e: leva a pessoa de volta a secao e pede
/// que ela ache o conteudo de novo.
///
/// ## O que esta extensao NAO inventou, e e o motivo de ela ser pequena
///
/// Tres pecas do mecanismo existiam e estavam sem uso:
///
/// 1. [AcaoExecutavel.rotaDeRetorno], cujo proprio comentario dizia: *"Nenhuma
///    acao deste build usa este campo hoje ... O campo FICA: ele e o unico
///    jeito de uma intencao voltar para um endereco que depende do alvo, e a
///    proxima que precisar disso nao deveria ter de reinventa-lo."* Esta e a
///    proxima.
/// 2. [ResultadoDaExecucao.rota], que leva a `DestinoDeResultado` e a um
///    `context.go(rota)` -- que e, letra por letra, "volte para o conteudo".
/// 3. O descarte do envelope ao executar (regra 7), que impede a leitura de
///    acontecer de novo no login seguinte.
///
/// **O `executar` daqui nao chama o servidor, e isso e a unica coisa estranha
/// nesta classe.** Ele nao tem o que executar: a "acao" e abrir uma tela, e a
/// tela e que le. Ele devolve o endereco e deixa a navegacao de `go` fazer o
/// resto -- a tela de destino nasce com a sessao que acabou de abrir e carrega
/// o conteudo sozinha. Nenhum `POST` acontece por causa de um toque em
/// `Entrar`.
library;

import 'guarda_de_acao.dart';
import 'intencao_pendente.dart';

/// O ID de tela de 8.3 desta intencao.
///
/// **Ele nao e uma tela da pesquisa de UX**, e nao podia ser: o conteudo que a
/// pessoa ia ler nao e UMA tela -- e a pagina de um pet, de um achado ou de
/// uma pessoa, e qual delas esta no [IntencaoPendente.alvo] e nao no ID. A
/// traducao em `Rotas.rotaDaTelaDeUx` existe por uma razao so, e e tecnica: a
/// guarda DESCARTA em silencio o envelope cujo ID de tela este build nao
/// conhece, e um envelope de leitura descartado deixaria a pessoa em `/pets`
/// outra vez.
///
/// Fixo: um envelope gravado por esta versao do app e lido por outra, depois
/// da atualizacao.
const String telaDeUxDaLeitura = 'LEITURA';

/// O envelope de "eu ia ver [rota]".
///
/// **Sem rascunho**, e a ausencia e o que distingue esta intencao das seis
/// outras: nao ha nada digitado para preservar. O que atravessa o login e um
/// endereco, e e por isso que este envelope e o mais barato de serializar no
/// aparelho com pouca memoria -- a preocupacao que [IntencaoPendente] inteira
/// existe para tratar.
IntencaoPendente intencaoDeVerConteudo(String rota, {DateTime? criadaEm}) {
  return IntencaoPendente(
    acao: AcaoDeIntencao.verConteudo,
    // O ENDERECO VAI NO `alvo`, e nao no ID de tela. Ver [telaDeUxDaLeitura].
    alvo: rota,
    telaDeRetorno: telaDeUxDaLeitura,
    criadaEm: criadaEm ?? DateTime.now(),
  );
}

/// O executor registrado em `app.dart`.
AcaoExecutavel leituraExecutavel() {
  return AcaoExecutavel(
    executar: (intencao) async {
      final rota = intencao.alvo;
      if (rota == null || rota.isEmpty) {
        // Envelope de leitura sem endereco: so acontece com arquivo corrompido
        // ou gravado por versao que escrevia o alvo noutro campo.
        //
        // **`throw`, e nao `Rotas.pets` calado.** A guarda tem um ramo
        // `on Object` que RELATA o defeito no canal da observabilidade e leva
        // a pessoa para a rota de retorno; devolver a home daqui faria o mesmo
        // para ela e nao deixaria rastro nenhum para nos.
        throw const FormatException('envelope de leitura sem alvo');
      }
      return ResultadoDaExecucao(rota: rota);
    },
    // **Nao ha nada para retomar**: sem rascunho, a tela de retorno nao
    // precisa de `extra` nenhum. Ela carrega o conteudo do servidor, como
    // carregaria em qualquer outra chegada.
    retomar: (_, _) => null,
    // A VOLTA DEPENDE DO ALVO, e e exatamente para isto que este campo foi
    // deixado no mecanismo. Nulo aqui cairia no ID de tela, que nao enderecaa
    // conteudo nenhum.
    rotaDeRetorno: (intencao) => intencao.alvo,
  );
}
