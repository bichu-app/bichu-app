/// A sequencia de tres passos do passkey, num lugar so (BICHUS-301).
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

  final PasskeyNesteAparelho _registro;

  /// O CONVITE DEVE SER OFERECIDO AGORA?
  static const Duration tetoDaDecisao = Duration(seconds: 3);

  Future<bool> deveOferecerCadastro() {
    return _decidirSeOferece().timeout(
      tetoDaDecisao,
      onTimeout: () => false,
    );
  }

  Future<bool> _decidirSeOferece() async {
    try {
      if (await _registro.haCredencial()) return false;
      if (await _registro.recusouFormalmente()) return false;
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
      return await _aparelho.suportaCredencial();
    } on Object {
      return false;
    }
  }

  /// Oferece o cadastro da credencial.
  Future<DesfechoDoCadastroDePasskey> oferecerCadastro({
    String? rotulo,
  }) async {
    try {
      final opcoes = await _passkeys.comecarCadastro();
      final credencial = await _aparelho.cadastrar(opcoes);
      await _passkeys.concluirCadastro(credencial, rotulo: rotulo);
      await _registro.marcar();
      return DesfechoDoCadastroDePasskey.cadastrada;
    } on SemCredencialNoAparelho {
      return DesfechoDoCadastroDePasskey.naoCadastrada;
    } on CredencialIndisponivel catch (erro, pilha) {
      registrarFalhaInesperada(
        erro,
        pilha,
        onde: 'ao cadastrar a passkey depois do cadastro',
      );
      return DesfechoDoCadastroDePasskey.naoCadastrada;
    } on FalhaDeChamada {
      return DesfechoDoCadastroDePasskey.naoCadastrada;
    } on Object catch (erro, pilha) {
      registrarFalhaInesperada(
        erro,
        pilha,
        onde: 'ao cadastrar a passkey depois do cadastro',
      );
      return DesfechoDoCadastroDePasskey.naoCadastrada;
    }
  }

  /// Tenta entrar com uma passkey que **ja exista** no aparelho.
  Future<Sessao?> tentarEntrar() async {
    if (!await _registro.haCredencial()) return null;

    try {
      final opcoes = await _passkeys.comecarEntrada();
      final credencial = await _aparelho.assinar(opcoes);
      final sessao = await _passkeys.concluirEntrada(credencial);
      await _registro.marcar();
      return sessao;
    } on SemCredencialNoAparelho {
      return null;
    } on CredencialIndisponivel catch (erro, pilha) {
      registrarFalhaInesperada(
        erro,
        pilha,
        onde: 'ao tentar entrar com passkey',
      );
      return null;
    } on FalhaDeChamada {
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

  /// Poe a marca deste aparelho em dia com o que a CONTA tem.
  Future<void> reconciliarComAConta() async {
    try {
      final credenciais = await _passkeys.listar();
      if (credenciais.isEmpty) return;
      await _registro.marcar();
    } on Object {
      // Silencio deliberado: ver o doc.
    }
  }

  /// As credenciais ATIVAS da conta, para a pessoa escolher qual revogar.
  Future<List<Passkey>> credenciaisDaConta() async {
    try {
      return await _passkeys.listar();
    } on Object {
      return const <Passkey>[];
    }
  }

  /// Revoga a credencial [passkeyId] e **poe a marca local em dia**.
  Future<bool> revogar(String passkeyId) async {
    try {
      await _passkeys.revogar(passkeyId);
    } on Object {
      return false;
    }
    try {
      final restantes = await _passkeys.listar();
      if (restantes.isEmpty) await _registro.desmarcar();
    } on Object {
      // Ver o doc: a marca fica como estava, e a revogacao continua feita.
    }
    return true;
  }
}
