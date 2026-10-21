import 'api_client.dart';
import 'modelos_conexao.dart';
import 'modelos_pessoa.dart';

/// As três operações do **convite do próprio perfil** — o que alimenta o QR.
///
/// ## Três operações sobre UMA linha, e é por isso que nenhuma leva argumento
///
/// `POST`, `DELETE` e a resolução não recebem identificador de convite, e a
/// ausência não é economia: **um convite ativo por conta** é garantia do banco
/// (índice parcial único sobre `revoked_at IS NULL`), então "o convite" é
/// sempre o da conta que chama. Um parâmetro de qual convite implicaria que há
/// vários, e vários tornariam *"quantos links meus estão soltos por aí?"* uma
/// pergunta sem resposta.
///
/// ## Não existe `meuConvite`, e a ausência é do contrato
///
/// **Não há leitura.** O token em claro existe uma vez só, na resposta do
/// `POST`: o banco guarda apenas o SHA-256. Quem fecha a tela e volta não lê o
/// convite de novo — ela **emite outro**, e emitir revoga o anterior. É isso, e
/// não um descuido, que faz a tela do convite ter o botão de criar mesmo para
/// quem já criou um dia.
///
/// ## Todas levam token de sessão
///
/// `bearerAuth` sem alternativa vazia nas três, **inclusive a resolução**. Isso
/// decide o desenho do convite: quem recebe o QR **precisa de conta** para
/// chegar ao perfil de quem o emitiu. Não existe superfície de convite
/// alcançável sem conta, em estado nenhum.
///
/// ## Falha não vira ausência de convite
///
/// Sobe como `FalhaDeChamada`. Quem chama distingue "não há convite" de "não
/// consegui perguntar".
class ConvitesApi {
  const ConvitesApi(this._api);

  final ApiClient _api;

  static const String caminho = '/connection-invites';

  /// `issueConnectionInvite`. **Emitir REVOGA o convite anterior.**
  ///
  /// As duas escritas acontecem na mesma transação do servidor, e isso não é
  /// zelo: o índice parcial único recusa a segunda linha ativa, então um
  /// `INSERT` sem a revogação anterior falha. Fora de uma transação a
  /// revogação poderia valer e o `INSERT` falhar, e a conta ficaria sem
  /// convite nenhum com o link antigo já morto.
  ///
  /// Por isso a tela que chama isto **diz antes o que vai acontecer**: quem
  /// toca em trocar o link mata o que está circulando.
  ///
  /// `x-effects: [irreversible_write]`, e é por isso que não há como desfazer.
  Future<ConviteEmitido> emitir() async {
    return ConviteEmitido.doJson(await _api.post(caminho));
  }

  /// `revokeConnectionInvite`. **Mata o link e o QR que estavam valendo.**
  ///
  /// **204 é idempotente**: sem convite ativo também é 204. Um 404 para "não
  /// havia convite" diria à tela que o estado dela estava velho, o que não é
  /// informação útil num botão cujo efeito desejado — *não existe link meu
  /// valendo* — já foi alcançado.
  ///
  /// **Revogar não desfaz conexão nenhuma.** Quem já pediu por aquele convite
  /// continua na caixa de pedidos, e quem já foi aceito continua conexão:
  /// revogar fecha a porta, não expulsa quem entrou.
  Future<void> revogar() async {
    await _api.delete(caminho);
  }

  /// `resolveConnectionInvite` — **a tela de destino do QR**.
  ///
  /// A resposta é `PersonProfile`, a MESMA projeção de `getPersonProfile`: o
  /// cliente pediu *"a página do perfil do usuário com o botão de adicionar"*,
  /// e uma projeção própria aqui divergiria da outra no primeiro campo que
  /// alguém acrescentasse a uma só. De graça, por reusar: vem o
  /// `connection_state` certo, então a tela sabe se o botão é pedir, se o
  /// pedido já foi enviado ou se já são conexão.
  ///
  /// **O token vai no CORPO e não no caminho da URL.** Token em caminho vai
  /// para o registro de acesso, para o histórico do aparelho, para o cabeçalho
  /// `Referer` da próxima navegação e para qualquer intermediário que registre
  /// a linha de requisição. O convite é um segredo ao portador, e um segredo em
  /// URL é um segredo publicado em cinco lugares que ninguém lembra de limpar.
  ///
  /// **O 404 funde sete motivos**, com o mesmo corpo: inexistente, vencido,
  /// revogado, de dono sem apelido, de quem bloqueou quem chama, de conta
  /// desabilitada, e perfil que quem chama denunciou. Vencido, revogado e
  /// inexistente não se distinguem de propósito: *"este token já existiu"* é a
  /// informação que diz a alguém que vale a pena continuar tentando.
  Future<PerfilDePessoa> resolver(String tokenDoConvite) async {
    final json = await _api.post(
      '$caminho/resolution',
      corpo: <String, dynamic>{'invite_token': tokenDoConvite},
    );
    return PerfilDePessoa.doJson(json);
  }
}
