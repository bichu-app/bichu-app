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
import '../api/modelos_passkey.dart';
import '../api/passkeys_api.dart';
import '../dispositivo/credencial_do_aparelho.dart';
import '../dispositivo/passkey_neste_aparelho.dart';

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
    required PasskeyNesteAparelho registro,
    // ignore: prefer_initializing_formals
  })  : _passkeys = passkeys,
        // ignore: prefer_initializing_formals
        _aparelho = aparelho,
        // ignore: prefer_initializing_formals
        _registro = registro;

  final PasskeysApi _passkeys;
  final CredencialDoAparelho _aparelho;

  /// O sinal LOCAL de que ha credencial neste aparelho.
  ///
  /// **E o portao de [tentarEntrar], e ele existe para a requisicao nao ser
  /// gasta.** Ver `dispositivo/passkey_neste_aparelho.dart`: a plataforma nao
  /// sabe responder "existe credencial do Bichu aqui?" -- medido no pacote
  /// `passkeys` 2.23.1 --, entao quem sabe e o registro do proprio app.
  final PasskeyNesteAparelho _registro;

  /// O CONVITE DEVE SER OFERECIDO AGORA? (28/10/2026)
  ///
  /// Regra de produto do cliente, verbatim: *"na hora do usuario fazer o login,
  /// se ele nao tiver o passkey habilitado e nao tiver rejeitado formalmente,
  /// devemos solicitar ele. Pois pode ser um cenario onde o usuario tenha feito
  /// o cadastro, desinstalado o app e esta voltando"*.
  ///
  /// ## O buraco que isto fecha, e ele foi MEDIDO
  ///
  /// So duas telas falavam de passkey -- o convite depois do CADASTRO e a
  /// tentativa ao abrir a tela de entrar --, e `passkey_credentials` tinha ZERO
  /// linhas em homologacao. **Quem ja tinha conta nunca conseguia ativar**: a
  /// unica janela eram os segundos apos criar uma conta nova. Inalcancavel para
  /// todo usuario existente equivale a nao existir.
  ///
  /// ## A ORDEM DAS PERGUNTAS, e ela foi MEDIDA e nao escolhida por elegancia
  ///
  /// 1. **ha marca neste aparelho?** Leitura de disco. Quem tem credencial aqui
  ///    nao precisa de convite: a tela de entrar ja tenta sozinha.
  /// 2. **recusou formalmente?** Leitura do mesmo arquivo. A recusa cala a
  ///    pergunta -- ver `PasskeyNesteAparelho.registrarRecusa` para por que ela
  ///    mora no APARELHO e nao na conta.
  /// 3. **[reconciliarComAConta]** -- a unica ida a REDE.
  /// 4. **o aparelho suporta?** Canal de plataforma, sem rede.
  ///
  /// **A REDE VEM ANTES DA PERGUNTA DE SUPORTE, e isso contraria "do mais
  /// barato para o mais caro" DE PROPOSITO.** A reconciliacao nao e parte da
  /// decisao do convite: ela e um efeito que a entrada por senha ja tinha
  /// desde o PR #85, e que vale **independentemente** de haver convite --
  /// aparelho que recebeu a credencial por sincronizacao precisa ficar marcado
  /// para a tela de entrar tentar a passkey na abertura seguinte. Por a
  /// pergunta de suporte antes dela faria a reconciliacao **deixar de
  /// acontecer** em quem o canal de plataforma nao responde, e
  /// `passkey_e_dispensavel_test.dart` cobra que a entrada por senha consulta
  /// `listPasskeys` exatamente UMA vez -- com a razao escrita: *"sem isso,
  /// quem trocou de aparelho tem passkey e um app que nunca a tenta"*.
  ///
  /// Quem chama isto do login **nao chama `reconciliarComAConta` tambem**: a
  /// consulta continua sendo uma so.
  ///
  /// ## O PASSO 3 NAO E ZELO, e e o caso que mais erra
  ///
  /// Credencial na conta **sem marca local** e o que acontece com sincronizacao
  /// (Google Password Manager, Chaveiro do iCloud), reinstalacao e restauracao
  /// de backup. Isso **nao e o mesmo que "nao tem"**: oferecer criar ali faria
  /// uma segunda credencial redundante, quando o conserto certo e marcar o
  /// aparelho -- que e o que a reconciliacao faz, e com isso destrava a entrada
  /// por passkey que a pessoa ja tinha. Depois dela, quem tinha credencial na
  /// conta cai no caso 1.
  ///
  /// ## NAO ESTOURA
  ///
  /// Quem chama acabou de entrar com sucesso, ou acabou de abrir `Meus dados`.
  /// Nenhuma leitura daqui pode virar erro de tela: na duvida, **devolve
  /// `false`** -- deixar de oferecer custa uma oferta que volta no proximo
  /// login, e estourar custaria a tela.
  /// O TETO DE ESPERA DA DECISAO.
  ///
  /// **Ela mora no caminho critico de uma entrada que JA DEU CERTO**, e por
  /// isso nao pode esperar para sempre. Tres leituras dela podem pendurar:
  ///
  ///   - o deposito da marca e `DepositoDePasskeyEmArquivo`, e
  ///     `getApplicationDocumentsDirectory` e **canal de plataforma**;
  ///   - `suportaCredencial` tambem e canal de plataforma;
  ///   - `listar()` e rede.
  ///
  /// Canal que nao responde nao estoura: ele simplesmente **nao volta**, e um
  /// `Future` que nao volta nao e pego por `catch` nenhum. **MEDIDO nesta
  /// rodada**: sem este teto, quatro casos de dois arquivos de login
  /// (`entrar_executa_a_intencao_test`, `sessao_persistente_por_padrao_test`)
  /// reprovaram com `pumpAndSettle timed out` -- o `_enviando` do botao
  /// `Entrar` ficava girando e a pessoa nunca saia da tela.
  ///
  /// Em producao o canal responde. O teto existe para o dia em que ele nao
  /// responder: deixar de oferecer custa uma oferta que volta no proximo
  /// login, e pendurar custa a entrada.
  static const Duration tetoDaDecisao = Duration(seconds: 3);

  Future<bool> deveOferecerCadastro() {
    // `Future.timeout` NAO CANCELA o que esta por baixo -- ele so para de
    // esperar, e e exatamente isso que se quer: a leitura pendurada segue o
    // seu destino sem segurar quem acabou de entrar.
    return _decidirSeOferece().timeout(
      tetoDaDecisao,
      onTimeout: () => false,
    );
  }

  Future<bool> _decidirSeOferece() async {
    try {
      if (await _registro.haCredencial()) return false;
      if (await _registro.recusouFormalmente()) return false;
      // A IDA A REDE. **Feita AQUI e nao por [reconciliarComAConta], e o
      // motivo e um desfecho que aquele metodo nao sabe expressar.**
      //
      // Ele devolve `void` e engole toda falha, de proposito -- quem o chama
      // nao espera por ele. Mas aqui ha TRES desfechos e nao dois, e o
      // terceiro muda a resposta:
      //
      //   - a conta TEM credencial -> marca o aparelho, e nao oferece criar
      //     outra (sincronizacao, reinstalacao, restauracao de backup);
      //   - a conta NAO tem -> pode oferecer;
      //   - **nao deu para saber** (401, 429, rede fora, corpo fora do
      //     contrato) -> **nao oferece**.
      //
      // O terceiro e o que importa, e ele e regra desta casa e nao escolha
      // minha: `passkey_e_dispensavel_test.dart` cobra, com estas palavras,
      // que *"a senha conferiu e a pessoa NAO ficou na tela de entrar porque
      // uma leitura AUXILIAR falhou"*. Uma folha que aparece **porque** a
      // leitura falhou e exatamente isso -- a falha mudando o que a pessoa ve
      // depois de uma entrada que deu certo. E ela nem seria uma oferta
      // honesta: sem saber o que a conta tem, oferecer criar pode fabricar
      // uma credencial redundante.
      //
      // O efeito de MARCAR que o PR #85 entregou continua inteiro, e e o
      // mesmo que [reconciliarComAConta] faz -- so marca, nunca desmarca.
      final List<Passkey> naConta;
      try {
        naConta = await _passkeys.listar();
      } on Object {
        return false;
      }
      if (naConta.isNotEmpty) {
        await _registro.marcar();
        return false;
      }
      // `await` e nao `return` pelado: dentro de um `try`, devolver o
      // `Future` sem esperar faria a excecao dele escapar do `catch` -- e o
      // `catch` daqui e o que garante que esta funcao NAO ESTOURA.
      return await _aparelho.suportaCredencial();
    } on Object {
      return false;
    }
  }

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
      // A MARCA, e so DEPOIS do 201. Marcar antes afirmaria credencial que o
      // servidor pode nao ter guardado -- e a marca nao volta atras.
      await _registro.marcar();
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
  /// **E, desde 28/10/2026, tambem sem IDA A REDE nesse caso.** Quem nao tem
  /// sinal de credencial neste aparelho sai na primeira linha, sem gastar
  /// `beginPasskeyAuthentication`. O desafio e um recurso com prazo e uso
  /// unico, e o teto da operacao e por IP: atras de NAT, uma requisicao gasta
  /// por quem nao usa o recurso e uma requisicao tirada de quem usa -- e, pior,
  /// o 429 cai em cima de quem entra por SENHA. Ver
  /// `dispositivo/passkey_neste_aparelho.dart` para o que foi medido sobre o
  /// que a plataforma sabe e o que ela nao sabe responder.
  ///
  /// **O 401 tambem devolve `null`, e de proposito.** O contrato responde o
  /// MESMO 401 para credencial desconhecida, revogada, assinatura errada e
  /// contador repetido. A tela nao pode inventar a distincao que a porta se
  /// recusa a fazer, e a unica saida honesta e a que sempre existiu: a senha.
  Future<Sessao?> tentarEntrar() async {
    // ======================================================================
    // O PORTAO, ANTES DE QUALQUER IDA A REDE.
    // ======================================================================
    //
    // **Sem sinal de credencial neste aparelho, nao se pede desafio.** Quem
    // nao tem passkey -- a esmagadora maioria de quem abre a tela de entrar --
    // sai daqui sem gastar requisicao nenhuma, e por isso sem ocupar o teto
    // por IP que, atras de NAT, e do predio inteiro.
    //
    // **E a primeira linha da funcao de proposito.** Qualquer coisa antes
    // dela que toque a rede ja gastou o que este portao existe para poupar.
    if (!await _registro.haCredencial()) return null;

    try {
      final opcoes = await _passkeys.comecarEntrada();
      final credencial = await _aparelho.assinar(opcoes);
      final sessao = await _passkeys.concluirEntrada(credencial);
      // Entrada aceita e prova de credencial. Idempotente: quem ja estava
      // marcado nao reescreve o arquivo.
      await _registro.marcar();
      return sessao;
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

  /// Poe a marca deste aparelho em dia com o que a CONTA tem. **EXIGE SESSAO.**
  ///
  /// ## Por que ela existe, e o que quebra sem ela
  ///
  /// A marca nasce de um cadastro feito NESTE aparelho. Mas a credencial
  /// WebAuthn **sincroniza**: o Google Password Manager e o Chaveiro do iCloud
  /// a levam para os outros aparelhos da mesma pessoa, e ela tambem sobrevive a
  /// uma reinstalacao ou a uma restauracao de backup -- enquanto o diretorio de
  /// documentos do app, onde a marca mora, **nao** sobrevive a reinstalacao.
  ///
  /// Sem esta chamada, essa pessoa teria uma passkey perfeitamente usavel e um
  /// app que nunca a tentaria: a credencial existiria no sistema, o portao de
  /// [tentarEntrar] estaria fechado, e nao ha botao de `Entrar com passkey`
  /// para contornar. O recurso ficaria quebrado exatamente para quem trocou de
  /// aparelho -- que e o caso que a passkey mais serve.
  ///
  /// ## Chamada DEPOIS da entrada por senha, e e o unico lugar
  ///
  /// E ali que as duas condicoes se encontram: ha sessao (a operacao exige
  /// `Authorization`) e ha duvida sobre a marca (quem entrou por senha pode ter
  /// passkey e nao estar marcado). Depois da entrada por PASSKEY nao faz
  /// sentido: a marca acabou de ser posta pela propria entrada.
  ///
  /// `listPasskeys` nao e oraculo de enumeracao: ela exige `Bearer` e responde
  /// sobre a conta do proprio token.
  ///
  /// **NAO ESTOURA e nao bloqueia nada.** Quem chama nao espera por ela: uma
  /// entrada que deu certo nao pode virar erro porque uma leitura auxiliar
  /// falhou. 429, 401, rede fora e corpo fora do contrato terminam todos no
  /// mesmo lugar -- a marca fica como estava, e a proxima entrada por senha
  /// tenta de novo.
  ///
  /// **So MARCA, nunca desmarca**, pelo motivo escrito em
  /// `dispositivo/passkey_neste_aparelho.dart`: conta sem credencial ativa num
  /// aparelho que tem a credencial de OUTRA conta nao e motivo para fechar o
  /// portao.
  Future<void> reconciliarComAConta() async {
    try {
      final credenciais = await _passkeys.listar();
      if (credenciais.isEmpty) return;
      await _registro.marcar();
    } on Object {
      // Silencio deliberado: ver o doc. Nem registro, porque 401 logo depois
      // de um login e o caso normal de token que acabou de ser trocado, e
      // encher o canal de observabilidade com ele esconderia o resto.
    }
  }
}
