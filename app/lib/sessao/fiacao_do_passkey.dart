/// A sequencia de tres passos do passkey, num lugar so (BICHUS-301).
///
/// Tanto o cadastro quanto a entrada sao **servidor, aparelho, servidor**:
///
/// 1. o servidor emite um desafio de uso unico e com prazo;
/// 2. o aparelho abre a folha nativa e assina;
/// 3. o servidor verifica a assinatura contra o desafio que ele guardou.
///
/// **Esta classe existe para que os dois chamadores nao repitam isso.** Eram
/// duas telas, e a sequencia tem uma propriedade que nao se ve no diff: o
/// desafio e consumido no passo 3 **de sucesso ou de falha**, entao um
/// chamador que tentasse o passo 2 duas vezes com o mesmo desafio receberia um
/// 401 que parece credencial invalida. Uma copia da sequencia por tela e uma
/// chance por tela de errar isso.
///
/// ## O que NAO esta aqui
///
/// Nenhum texto de tela e nenhuma decisao de navegacao. Os desfechos saem como
/// [DesfechoDoCadastroDePasskey] e como `Sessao?`, e quem traduz isso em
/// interface e a tela -- que e quem sabe se esta no fim do cadastro ou na
/// porta de entrada.
library;

import '../api/falhas.dart';
import '../api/modelos.dart';
import '../api/passkeys_api.dart';
import '../dispositivo/credencial_do_aparelho.dart';

/// Como terminou a oferta de cadastrar passkey.
enum DesfechoDoCadastroDePasskey {
  /// A credencial foi criada e o servidor a guardou.
  cadastrada,

  /// A pessoa fechou a folha do sistema, ou o aparelho ja tinha esta
  /// credencial, ou o aparelho nao faz passkey.
  ///
  /// **Os tres casos sao um so para quem chama, e isso e decisao.** O passo e
  /// DISPENSAVEL: quem recusa a biometria tem de conseguir terminar o
  /// cadastro. Separar "recusou" de "nao pode" daria a tela a chance de
  /// insistir com quem nao pode, e de tratar como erro o que e uma escolha
  /// legitima.
  naoCadastrada,
}

/// A fiacao. Nao guarda estado entre chamadas.
class FiacaoDoPasskey {
  const FiacaoDoPasskey({
    required PasskeysApi passkeys,
    required CredencialDoAparelho aparelho,
    // ignore: prefer_initializing_formals
  })  : _passkeys = passkeys,
        // ignore: prefer_initializing_formals
        _aparelho = aparelho;

  final PasskeysApi _passkeys;
  final CredencialDoAparelho _aparelho;

  /// Oferece o cadastro da credencial. **EXIGE SESSAO ABERTA.**
  ///
  /// Chamada ao fim do cadastro, depois de `ControladorDeSessao.abrir`: o
  /// primeiro passo manda `Authorization`, e a conta sai do `sub` do token.
  ///
  /// **NAO ESTOURA.** Todo desfecho que nao e sucesso vira
  /// [DesfechoDoCadastroDePasskey.naoCadastrada], e e isto que garante o que o
  /// cliente pediu: quem recusa a biometria termina o cadastro do mesmo jeito.
  /// Uma excecao que vazasse daqui subiria pela tela de cadastro e poria uma
  /// faixa de erro no fim de um cadastro que **deu certo** -- a conta ja
  /// existe neste ponto.
  ///
  /// O [rotulo] e o nome do aparelho, opcional.
  Future<DesfechoDoCadastroDePasskey> oferecerCadastro({
    String? rotulo,
  }) async {
    try {
      final opcoes = await _passkeys.comecarCadastro();
      final credencial = await _aparelho.cadastrar(opcoes);
      await _passkeys.concluirCadastro(credencial, rotulo: rotulo);
      return DesfechoDoCadastroDePasskey.cadastrada;
    } on SemCredencialNoAparelho {
      // A pessoa fechou a folha. Nao e erro e nao se registra: e a escolha que
      // o `Agora nao` tambem expressa, so feita na folha do sistema em vez de
      // no botao.
      return DesfechoDoCadastroDePasskey.naoCadastrada;
    } on CredencialIndisponivel catch (erro, pilha) {
      // REGISTRA, MAS NAO ATRAPALHA. `dominioNaoAssociado` chega por aqui, e
      // ele e erro de fiacao NOSSO -- `RP ID` contra o host do arquivo de
      // associacao. Para a pessoa o desfecho e o mesmo (segue sem passkey);
      // para quem mantem o app, este e o unico sinal de que o passkey esta
      // quebrado para todo mundo em vez de recusado por uma pessoa.
      registrarFalhaInesperada(
        erro,
        pilha,
        onde: 'ao cadastrar a passkey depois do cadastro',
      );
      return DesfechoDoCadastroDePasskey.naoCadastrada;
    } on FalhaDeChamada {
      // O SERVIDOR RECUSOU, e o cadastro da conta continua valido. 409 de teto
      // de credenciais, 429 de limite, rede fora: nenhum deles e motivo para
      // segurar quem acabou de criar a conta.
      return DesfechoDoCadastroDePasskey.naoCadastrada;
    } on Object catch (erro, pilha) {
      // O QUE NAO E NENHUM DOS ANTERIORES -- corpo fora do contrato faz
      // `OpcoesDeCadastroDePasskey.doJson` estourar `TypeError`, e o canal
      // nativo pode estourar `PlatformException` crua. Nada disto pode subir:
      // a conta ja existe.
      registrarFalhaInesperada(
        erro,
        pilha,
        onde: 'ao cadastrar a passkey depois do cadastro',
      );
      return DesfechoDoCadastroDePasskey.naoCadastrada;
    }
  }

  /// Tenta entrar com uma passkey que **ja exista** no aparelho.
  ///
  /// Devolve a [Sessao] quando deu certo e **`null` em todo o resto**.
  ///
  /// **NAO ESTOURA, e esta e a propriedade que a tela de entrar depende.** A
  /// chamada acontece ao ABRIR a tela, antes de a pessoa tocar em qualquer
  /// coisa, e a esmagadora maioria de quem a abre nao tem passkey nenhuma.
  /// Nesse caso o desfecho tem de ser indistinguivel de nao ter chamado nada:
  /// nenhuma faixa, nenhum texto, nenhum campo mexido. `null` e exatamente
  /// isso.
  ///
  /// **O 401 tambem devolve `null`, e de proposito.** O contrato responde o
  /// MESMO 401 para credencial desconhecida, revogada, assinatura errada e
  /// contador repetido. A tela nao pode inventar a distincao que a porta se
  /// recusa a fazer, e a unica saida honesta e a que sempre existiu: a senha.
  Future<Sessao?> tentarEntrar() async {
    try {
      final opcoes = await _passkeys.comecarEntrada();
      final credencial = await _aparelho.assinar(opcoes);
      return await _passkeys.concluirEntrada(credencial);
    } on SemCredencialNoAparelho {
      // O CAMINHO NORMAL. Nao ha passkey neste aparelho, ou a pessoa fechou a
      // folha. Nao se registra: isto nao e um defeito, e o estado de quem
      // ainda nao cadastrou -- registrar encheria o canal de observabilidade
      // com o caso dominante.
      return null;
    } on CredencialIndisponivel catch (erro, pilha) {
      registrarFalhaInesperada(
        erro,
        pilha,
        onde: 'ao tentar entrar com passkey',
      );
      return null;
    } on FalhaDeChamada {
      // Rede fora ou 401/429 do servidor. Sem registro: rede fora na abertura
      // da tela de entrar e comum, e quem esta sem rede vai descobrir isso ao
      // tocar em `Entrar` -- com a mensagem que essa tela ja sabe dar.
      return null;
    } on Object catch (erro, pilha) {
      registrarFalhaInesperada(
        erro,
        pilha,
        onde: 'ao tentar entrar com passkey',
      );
      return null;
    }
  }
}
