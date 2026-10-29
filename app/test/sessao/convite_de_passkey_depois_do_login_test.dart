// ISCA DA BICHUS-301 (28/10/2026): A REGRA DOS TRES ESTADOS DO CONVITE.
//
// Pedido do cliente, verbatim: *"na hora do usuario fazer o login, se ele nao
// tiver o passkey habilitado e nao tiver rejeitado formalmente, devemos
// solicitar ele. Pois pode ser um cenario onde o usuario tenha feito o
// cadastro, desinstalado o app e esta voltando"*.
//
// ## O BURACO QUE ISTO FECHA, e ele foi MEDIDO
//
// `passkey_credentials` tem ZERO linhas em homologacao, e so duas telas do app
// falavam de passkey: o convite **depois do cadastro** e a tentativa ao abrir a
// tela de entrar. **Quem ja tem conta nunca conseguia ativar** -- a unica
// janela eram os segundos apos criar uma conta nova. A funcionalidade estava
// inalcancavel para todo usuario existente, o que equivale a nao existir.
//
// ## OS ESTADOS, depois de um login por SENHA bem-sucedido
//
// | estado | o que acontece |
// |---|---|
// | ha credencial utilizavel NESTE aparelho | nao oferece nada |
// | ha na CONTA mas nao neste aparelho | reconcilia, e nao oferece criar |
// | nao ha, e a pessoa NAO recusou formalmente | **oferece** |
// | a pessoa recusou formalmente | nao pergunta de novo |
// | o aparelho nao suporta | nao oferece |
//
// ## O CASO MAIS FACIL DE ERRAR, E O MAIS CARO
//
// **Fechar a folha arrastando, ou o sistema cancelar o dialogo, NAO E RECUSA
// FORMAL** -- e *"agora nao"*. So o toque deliberado no `Não quero` grava a
// recusa. Tratar cancelamento como recusa faria a pessoa perder a passkey
// **para sempre por um gesto acidental**, e isso e pior que o defeito de hoje.
//
// ## ONDE A RECUSA MORA, E A RAZAO E A REGRA DO CLIENTE
//
// **No APARELHO**, junto da marca que ja existe -- nao na conta. A razao nao e
// economia: recusa na conta **sobreviveria a reinstalacao** e silenciaria
// exatamente o usuario que ele quer alcancar. Recusa local apaga com a
// reinstalacao, e aí perguntar de novo e o comportamento CERTO -- e o cenario
// que ele nomeou, literalmente.
library;

import 'dart:convert';

import 'package:bichu/api/api_client.dart';
import 'package:bichu/api/modelos_passkey.dart';
import 'package:bichu/api/passkeys_api.dart';
import 'package:bichu/config/app_config.dart';
import 'package:bichu/dispositivo/credencial_do_aparelho.dart';
import 'package:bichu/dispositivo/passkey_neste_aparelho.dart';
import 'package:bichu/sessao/fiacao_do_passkey.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:http/http.dart' as http;
import 'package:http/testing.dart';

const String _urlBase = 'https://api.exemplo.test';

/// Um aparelho de teste: diz se suporta, e conta quantas vezes foi chamado.
class _AparelhoDeTeste implements CredencialDoAparelho {
  _AparelhoDeTeste({this.suporta = true, this.aoCadastrar});

  bool suporta;

  /// O que o sistema faz quando pedem a credencial. Nulo = sucesso.
  Object? aoCadastrar;

  int cadastros = 0;
  int consultasDeSuporte = 0;

  @override
  Future<bool> suportaCredencial() async {
    consultasDeSuporte += 1;
    return suporta;
  }

  @override
  Future<CredencialCadastrada> cadastrar(
    OpcoesDeCadastroDePasskey opcoes,
  ) async {
    cadastros += 1;
    final falha = aoCadastrar;
    if (falha != null) throw falha;
    return const CredencialCadastrada(
      id: 'cred-1',
      rawId: 'cred-1',
      clientDataJson: 'cdj',
      attestationObject: 'ao',
      transportes: <String>['internal'],
    );
  }

  @override
  Future<CredencialAssinada> assinar(OpcoesDeEntradaPorPasskey opcoes) =>
      throw const SemCredencialNoAparelho();
}

/// `GET /auth/passkeys` devolve [credenciaisNaConta] itens; o resto e 404.
///
/// O cadastro responde o par de opcoes e um 201, para o caminho de ATIVAR
/// poder ser exercitado de ponta a ponta.
http.Client _servidor({int credenciaisNaConta = 0}) {
  return MockClient((http.Request req) async {
    final caminho = req.url.path;
    if (caminho == '/v1/auth/passkeys' && req.method == 'GET') {
      return http.Response(
        jsonEncode(<String, dynamic>{
          'items': <Map<String, dynamic>>[
            for (var i = 0; i < credenciaisNaConta; i++)
              <String, dynamic>{
                'id': 'pk-$i',
                'label': 'Aparelho $i',
                'created_at': '2026-10-01T10:00:00Z',
                'last_used_at': null,
              },
          ],
        }),
        200,
        headers: <String, String>{'content-type': 'application/json'},
      );
    }
    if (caminho == '/v1/auth/passkey/registration/options' &&
        req.method == 'POST') {
      return http.Response(
        jsonEncode(<String, dynamic>{
          'challenge': 'desafio',
          'rp': <String, dynamic>{'id': 'bichu.app', 'name': 'Bichu'},
          'user': <String, dynamic>{
            'id': 'uid',
            'name': 'marina@exemplo.com.br',
            'display_name': 'Marina',
          },
          'pub_key_cred_params': <Map<String, dynamic>>[
            <String, dynamic>{'type': 'public-key', 'alg': -7},
          ],
          'timeout': 60000,
          'attestation': 'none',
          'authenticator_selection': <String, dynamic>{
            'authenticator_attachment': 'platform',
            'resident_key': 'required',
            'user_verification': 'required',
          },
          'exclude_credentials': <Map<String, dynamic>>[],
        }),
        200,
        headers: <String, String>{'content-type': 'application/json'},
      );
    }
    if (caminho == '/v1/auth/passkey/registration' && req.method == 'POST') {
      return http.Response(
        jsonEncode(<String, dynamic>{
          'id': 'pk-nova',
          'label': null,
          'created_at': '2026-10-28T10:00:00Z',
          'last_used_at': null,
        }),
        201,
        headers: <String, String>{'content-type': 'application/json'},
      );
    }
    return http.Response(
      jsonEncode(<String, dynamic>{'type': 'not-found', 'title': 'nao'}),
      404,
      headers: <String, String>{'content-type': 'application/problem+json'},
    );
  });
}

PasskeysApi _api({int credenciaisNaConta = 0}) => PasskeysApi(
      ApiClient(
        config: AppConfig.carregar(apiBaseUrlDeTeste: _urlBase),
        cliente: _servidor(credenciaisNaConta: credenciaisNaConta),
        tokenDeAcesso: () async => 'token-de-teste',
      ),
    );

void main() {
  late DepositoDePasskeyEmMemoria deposito;
  late PasskeyNesteAparelho registro;

  setUp(() {
    deposito = DepositoDePasskeyEmMemoria();
    registro = PasskeyNesteAparelho(deposito: deposito);
  });

  group('a RECUSA FORMAL mora no aparelho', () {
    test('quem nao foi perguntada nao recusou', () async {
      expect(
        await registro.recusouFormalmente(),
        isFalse,
        reason: 'REPROVA: aparelho sem registro nenhum ja conta como recusa. '
            'Ausencia de resposta nao e resposta negativa -- e o estado de '
            'quem acabou de instalar o app, que e justamente quem o cliente '
            'quer alcancar.',
      );
    });

    test('a recusa registrada SOBREVIVE a releitura', () async {
      await registro.registrarRecusa();

      // Um registro novo sobre o MESMO deposito: e o que a proxima abertura do
      // app faz. Sem persistencia, a pessoa recusaria em cada login.
      final outro = PasskeyNesteAparelho(deposito: deposito);
      expect(
        await outro.recusouFormalmente(),
        isTrue,
        reason: 'REPROVA: a recusa nao sobreviveu a releitura do deposito. '
            'Quem disse `Não quero` tem de nao ser perguntada de novo, e a '
            'proxima pergunta acontece em outra abertura do app.',
      );
    });

    test('a recusa NAO apaga a marca de credencial', () async {
      await registro.marcar();
      await registro.registrarRecusa();

      expect(
        await registro.haCredencial(),
        isTrue,
        reason: 'REPROVA: registrar a recusa apagou a marca de credencial. '
            'Sao dois fatos independentes no mesmo arquivo: `ha_credencial` e '
            'o portao da entrada por passkey, e apaga-lo trancaria o login '
            'automatico de quem TEM credencial.',
      );
      expect(await registro.recusouFormalmente(), isTrue);
    });

    test('marcar a credencial NAO apaga a recusa', () async {
      await registro.registrarRecusa();
      await registro.marcar();

      expect(
        await registro.recusouFormalmente(),
        isTrue,
        reason: 'REPROVA: marcar a credencial apagou a recusa. As duas chaves '
            'moram no mesmo JSON, e uma escrita que reescreve o arquivo sem '
            'ler o que havia apaga a outra -- que e o defeito mais facil de '
            'cometer aqui.',
      );
    });
  });

  group('OS ESTADOS de `deveOferecerCadastro`', () {
    test('ESTADO 1: com credencial neste aparelho, NAO oferece', () async {
      await registro.marcar();
      final fiacao = FiacaoDoPasskey(
        passkeys: _api(),
        aparelho: _AparelhoDeTeste(),
        registro: registro,
      );

      expect(
        await fiacao.deveOferecerCadastro(),
        isFalse,
        reason: 'REPROVA: ofereceu ativar a quem JA tem credencial neste '
            'aparelho. A tela de entrar ja tenta a passkey sozinha nesse caso '
            '(o portao local do PR #85), e oferecer criaria uma segunda '
            'credencial por nada.',
      );
    });

    test('ESTADO 2: sem credencial e sem recusa, OFERECE', () async {
      final fiacao = FiacaoDoPasskey(
        passkeys: _api(),
        aparelho: _AparelhoDeTeste(),
        registro: registro,
      );

      expect(
        await fiacao.deveOferecerCadastro(),
        isTrue,
        reason: 'REPROVA: NAO ofereceu a quem nao tem credencial e nunca '
            'recusou. **Este e o cenario que o cliente nomeou**: cadastrou, '
            'desinstalou o app e esta voltando. Sem esta oferta a passkey '
            'continua inalcancavel para quem ja tem conta.',
      );
    });

    test(
      'ESTADO 2b: credencial na CONTA mas nao neste aparelho -- reconcilia, '
      'e NAO oferece criar',
      () async {
        final fiacao = FiacaoDoPasskey(
          passkeys: _api(credenciaisNaConta: 1),
          aparelho: _AparelhoDeTeste(),
          registro: registro,
        );

        expect(
          await fiacao.deveOferecerCadastro(),
          isFalse,
          reason: 'REPROVA: ofereceu CRIAR credencial a quem ja tem uma na '
              'conta -- o caso de sincronizacao (Google Password Manager, '
              'Chaveiro do iCloud), reinstalacao ou restauracao de backup. '
              'Credencial na conta sem marca local nao e o mesmo que "nao '
              'tem": o conserto e `reconciliarComAConta`, que MARCA, e nao '
              'uma credencial redundante.',
        );
        expect(
          await registro.haCredencial(),
          isTrue,
          reason: 'REPROVA: a reconciliacao nao gravou a marca local. Sem ela '
              'o portao do PR #85 continua fechado e a tela de entrar nunca '
              'tenta a passkey que a pessoa JA TEM -- o mesmo defeito com '
              'outra roupa.',
        );
      },
    );

    test('ESTADO 3: quem recusou formalmente NAO e perguntada de novo',
        () async {
      await registro.registrarRecusa();
      final aparelho = _AparelhoDeTeste();
      final fiacao = FiacaoDoPasskey(
        passkeys: _api(),
        aparelho: aparelho,
        registro: registro,
      );

      expect(
        await fiacao.deveOferecerCadastro(),
        isFalse,
        reason: 'REPROVA: perguntou de novo a quem recusou formalmente. O '
            'cliente foi explicito: *"se ele ... nao tiver rejeitado '
            'formalmente, devemos solicitar"* -- a recusa e a condicao que '
            'cala a pergunta.',
      );
    });

    test('ESTADO 4: aparelho SEM biometria nao ve a promessa', () async {
      final fiacao = FiacaoDoPasskey(
        passkeys: _api(),
        aparelho: _AparelhoDeTeste(suporta: false),
        registro: registro,
      );

      expect(
        await fiacao.deveOferecerCadastro(),
        isFalse,
        reason: 'REPROVA: ofereceu ativar num aparelho que o sistema vai '
            'recusar. Indisponibilidade e estado NORMAL, e nao erro: a pessoa '
            'nao pode ver uma promessa que a folha do sistema vai negar.',
      );
    });
  });

  group('CANCELAMENTO NAO E RECUSA -- a fronteira mais cara', () {
    test(
      'a pessoa fecha a folha do sistema: NAO fica recusada, e a oferta volta',
      () async {
        final aparelho = _AparelhoDeTeste(
          // Exatamente o que o canal manda quando a folha e fechada.
          aoCadastrar: const SemCredencialNoAparelho(),
        );
        final fiacao = FiacaoDoPasskey(
          passkeys: _api(),
          aparelho: aparelho,
          registro: registro,
        );

        final desfecho = await fiacao.oferecerCadastro();
        expect(desfecho, DesfechoDoCadastroDePasskey.naoCadastrada);

        expect(
          await registro.recusouFormalmente(),
          isFalse,
          reason: 'REPROVA: fechar a folha do sistema gravou RECUSA FORMAL. '
              'Isso faria a pessoa perder a passkey **para sempre por um '
              'gesto acidental** -- e pior que o defeito de hoje. Fechar '
              'arrastando e "agora nao"; so o toque deliberado no `Não '
              'quero` recusa.',
        );
        expect(
          await fiacao.deveOferecerCadastro(),
          isTrue,
          reason: 'REPROVA: depois de um cancelamento a oferta nao volta no '
              'proximo login. O cancelamento nao e resposta definitiva.',
        );
      },
    );

    test(
      'o sistema recusa por indisponibilidade: NAO fica recusada pela pessoa',
      () async {
        final fiacao = FiacaoDoPasskey(
          passkeys: _api(),
          aparelho: _AparelhoDeTeste(
            aoCadastrar: const CredencialIndisponivel(
              MotivoDaIndisponibilidade.aparelhoNaoSuporta,
            ),
          ),
          registro: registro,
        );

        await fiacao.oferecerCadastro();

        expect(
          await registro.recusouFormalmente(),
          isFalse,
          reason: 'REPROVA: uma falha do SISTEMA foi gravada como recusa DA '
              'PESSOA. Sao coisas diferentes: a pessoa nao disse nada, e no '
              'dia em que o aparelho dela passar a suportar ela teria perdido '
              'a oferta por um defeito que nao era dela.',
        );
      },
    );

    test('ATIVAR grava a marca local, e nao so a credencial no servidor',
        () async {
      final fiacao = FiacaoDoPasskey(
        passkeys: _api(),
        aparelho: _AparelhoDeTeste(),
        registro: registro,
      );

      final desfecho = await fiacao.oferecerCadastro();

      expect(desfecho, DesfechoDoCadastroDePasskey.cadastrada);
      expect(
        await registro.haCredencial(),
        isTrue,
        reason: 'REPROVA: ativar nao gravou a marca NESTE aparelho. Sem ela o '
            'portao do PR #85 continua fechado: a pessoa ativa, e o login '
            'segue nao oferecendo a passkey -- o mesmo defeito com outra '
            'roupa.',
      );
      expect(
        await fiacao.deveOferecerCadastro(),
        isFalse,
        reason: 'REPROVA: depois de ativar, o convite ainda seria oferecido.',
      );
    });
  });
}
