/**
 * Cadastro e entrada por credencial digital (passkey). BICHUS-301.
 *
 * ====================================================================
 * A VERIFICAÇÃO NÃO É ESCRITA À MÃO, E A ESCOLHA TEM MOTIVO
 * ====================================================================
 *
 * Quem verifica atestação e asserção é `@simplewebauthn/server`. WebAuthn pede
 * parse de CBOR, decodificação de chave COSE, cadeia de atestação e aritmética
 * de curvas EC — e cada um desses é um lugar onde um erro de implementação
 * **aceita credencial forjada sem reprovar nenhum teste**, porque o caminho
 * feliz passa igual nos dois casos. Um bug aqui não aparece como falha: aparece
 * como entrada concedida.
 *
 * Por que esta biblioteca e não outra: é a implementação de referência do
 * ecossistema Node, é TypeScript puro (sem dependência nativa, o que importa
 * numa imagem que já carrega `sharp`), declara `engines.node >= 20` — o projeto
 * fixa 22 — e acompanha a especificação de perto. As alternativas que existem
 * ou são wrappers dela, ou estão paradas, ou exigem compilar módulo nativo.
 *
 * ====================================================================
 * O QUE ESTE SERVIÇO NÃO FAZ
 * ====================================================================
 *
 * Não toca em senha, em refresh, em reautenticação. A passkey SOMA à senha
 * (decisão 1 do BICHUS-301) e `reauthenticate` por passkey está fora de escopo
 * por decisão — não foi pedido. Quem abre a sessão ao fim da entrada é o mesmo
 * `AuthService` do login, pela mesma porta: para o resto do app, entrar por
 * passkey é entrar.
 */
import {
  generateRegistrationOptions,
  generateAuthenticationOptions,
  verifyRegistrationResponse,
  verifyAuthenticationResponse,
} from '@simplewebauthn/server';
import type {
  AuthenticationResponseJSON,
  RegistrationResponseJSON,
} from '@simplewebauthn/server';
import { createHash } from 'node:crypto';
import type { Clock } from '../../../shared/time/clock.js';
import type { IdGenerator } from '../../../shared/ports/id-generator.js';
import type { AuditLog } from '../../audit/ports/audit-log.js';
import type { Instant, UserId } from '../../../shared/types/brands.js';
import { problemas } from '../../../shared/http/errors.js';
import type { PasskeyRepository, PasskeyDaTela } from '../ports/passkey-repository.js';
import {
  ALGORITMOS_ACEITOS,
  PRAZO_DO_DESAFIO_MS,
  TETO_DE_PASSKEYS_POR_CONTA,
  contadorAceito,
  desafioValido,
  rotuloNormalizado,
} from '../domain/passkey.js';

/**
 * A identidade do Relying Party.
 *
 * `rpId` é o único parâmetro do WebAuthn que **não pode mudar depois**: trocar
 * invalida toda credencial já emitida. Vem da configuração, e lá ele é o
 * **hostname** de `WEB_BASE_URL` — não o domínio registrável. O motivo está em
 * `app-config.ts`: quem busca o `assetlinks.json` é o Android, e ele busca **no
 * host do `rpId`**; fixar o apex faria homologação buscar num host que ainda não
 * é nosso, e o passkey falharia em silêncio justamente onde se testa. Em
 * produção o hostname já É o apex, e a subida recusa subdomínio.
 *
 * `origensAceitas` são as origens do app Android, na forma
 * `android:apk-key-hash:<digital em base64url>`. **Não é lista escrita à mão de
 * domínio:** no Android a origem que chega no `clientDataJSON` é derivada da
 * digital do certificado de assinatura, a mesma que está em
 * `/.well-known/assetlinks.json`. Conferir contra `https://bichu.app` aqui
 * reprovaria toda chamada legítima do app.
 */
export interface IdentidadeDoRelyingParty {
  readonly rpId: string;
  readonly rpName: string;
  readonly origensAceitas: readonly string[];
}

export interface DependenciasDePasskey {
  readonly repositorio: PasskeyRepository;
  readonly clock: Clock;
  readonly ids: IdGenerator;
  readonly trilha: AuditLog;
  readonly rp: IdentidadeDoRelyingParty;
}

/** O `userHandle` é o UUID interno, nunca o e-mail — ver o contrato. */
export interface DonoDaCredencial {
  readonly id: UserId;
  readonly email: string;
  readonly displayName: string | null;
}

function base64url(b: Buffer | Uint8Array): string {
  return Buffer.from(b).toString('base64url');
}

/**
 * SHA-256 do desafio em base64url.
 *
 * O desafio é guardado como hash, no molde de `verification_tokens.token_hash`:
 * o repositório não guarda segredo em claro. E o hash é TAMBÉM a chave de busca
 * — ver o cabeçalho da migração.
 */
function hashDoDesafio(desafioBase64url: string): Buffer {
  return createHash('sha256').update(desafioBase64url, 'utf8').digest();
}

export class PasskeyService {
  constructor(private readonly deps: DependenciasDePasskey) {}

  /**
   * Passo 1 do cadastro: emite o desafio.
   *
   * O teto é conferido AQUI, antes de emitir, e não só na conclusão: emitir um
   * desafio que não tem como ser concluído gastaria a biometria da pessoa para
   * depois recusar.
   */
  async comecarCadastro(dono: DonoDaCredencial): Promise<unknown> {
    const { repositorio, clock, ids, rp } = this.deps;

    const ativas = await repositorio.contarAtivas(dono.id);
    if (ativas >= TETO_DE_PASSKEYS_POR_CONTA) {
      throw problemas.tetoDePasskeysDaConta(TETO_DE_PASSKEYS_POR_CONTA);
    }

    const aExcluir = await repositorio.credenciaisAtivasParaExcluir(dono.id);

    const opcoes = await generateRegistrationOptions({
      rpName: rp.rpName,
      rpID: rp.rpId,
      // O `userHandle`. UUID interno, NUNCA o e-mail: ele fica guardado no
      // aparelho e volta na entrada sem autenticação nenhuma.
      userID: Buffer.from(dono.id, 'utf8'),
      userName: dono.email,
      // `displayName` e nulo em conta que ainda nao preencheu o nome, e o
      // seletor do aparelho precisa de alguma coisa para mostrar: cai no
      // e-mail, que e o mesmo que `userName` ja leva.
      userDisplayName: dono.displayName ?? dono.email,
      // `none`: atestação direta entregaria o modelo do aparelho e exigiria
      // validar cadeia de fabricante, e nenhuma regra do produto depende da
      // marca do autenticador.
      attestationType: 'none',
      timeout: PRAZO_DO_DESAFIO_MS,
      supportedAlgorithmIDs: [...ALGORITMOS_ACEITOS],
      excludeCredentials: aExcluir.map((id) => ({ id: base64url(id) })),
      authenticatorSelection: {
        authenticatorAttachment: 'platform',
        // `required` é o que torna a credencial *discoverable*, e é o que
        // permite a entrada não receber e-mail. Sem isso a entrada precisaria
        // de `allowCredentials`, que seria um oráculo de enumeração de conta.
        residentKey: 'required',
        userVerification: 'required',
      },
    });

    const agora = clock.now();
    await repositorio.guardarDesafio({
      id: ids.uuidv7(),
      userId: dono.id,
      purpose: 'registration',
      challengeHash: hashDoDesafio(opcoes.challenge),
      expiraEm: (agora + PRAZO_DO_DESAFIO_MS) as Instant,
    });

    return opcoes;
  }

  /**
   * Passo 2 do cadastro: verifica a atestação e guarda a chave pública.
   *
   * O desafio é CONSUMIDO de sucesso ou de falha. A ordem importa: consumir
   * ANTES de verificar é o que impede que uma atestação inválida seja
   * reapresentada à vontade contra o mesmo desafio.
   */
  async concluirCadastro(
    dono: DonoDaCredencial,
    resposta: { readonly credential: unknown; readonly label?: string },
  ): Promise<PasskeyDaTela> {
    const { repositorio, clock, ids, trilha, rp } = this.deps;

    const credencialBruta = resposta.credential as {
      id?: unknown;
      response?: { client_data_json?: unknown };
    };
    const desafioRecebido = this.desafioDoClientData(credencialBruta.response?.client_data_json);
    const desafio = await repositorio.acharDesafioPorHash(hashDoDesafio(desafioRecebido));

    const agora = clock.now();
    if (desafio === undefined || !desafioValido(desafio, agora)) {
      throw problemas.desafioDePasskeyVencido();
    }
    // Desafio de cadastro é de UMA conta. Apresentar o desafio de outra pessoa
    // não é erro de formulário: é tentativa de pendurar credencial em conta
    // alheia, e por isso a recusa é a mesma do desafio inexistente.
    if (desafio.purpose !== 'registration' || desafio.userId !== dono.id) {
      throw problemas.desafioDePasskeyVencido();
    }
    if (!(await repositorio.consumirDesafio(desafio.id, agora))) {
      // Alguém chegou primeiro. O uso único é decidido pelo banco.
      throw problemas.desafioDePasskeyVencido();
    }

    let verificacao;
    try {
      verificacao = await verifyRegistrationResponse({
        response: this.comoRespostaDeCadastro(resposta.credential),
        // Comparação por HASH: o desafio em claro não está guardado.
        expectedChallenge: (recebido) =>
          hashDoDesafio(recebido).equals(hashDoDesafio(desafioRecebido)),
        expectedOrigin: [...rp.origensAceitas],
        expectedRPID: rp.rpId,
        requireUserVerification: true,
        supportedAlgorithmIDs: [...ALGORITMOS_ACEITOS],
      });
    } catch {
      // A biblioteca lança com a razão técnica. Ela NÃO vai para a resposta: o
      // cliente recebe o mesmo 400 em qualquer falha de verificação.
      throw problemas.atestacaoDePasskeyRecusada();
    }

    if (!verificacao.verified || verificacao.registrationInfo === undefined) {
      throw problemas.atestacaoDePasskeyRecusada();
    }

    const info = verificacao.registrationInfo;
    const credentialId = Buffer.from(info.credential.id, 'base64url');

    // `credential_id` que já existe — ativo OU revogado — não é recadastrado: o
    // índice único é total de propósito, para que o aparelho revogado por
    // contador repetido não volte sozinho.
    const jaExiste = await repositorio.acharPorCredentialId(credentialId);
    if (jaExiste !== undefined) throw problemas.passkeyJaCadastrada();

    if ((await repositorio.contarAtivas(dono.id)) >= TETO_DE_PASSKEYS_POR_CONTA) {
      throw problemas.tetoDePasskeysDaConta(TETO_DE_PASSKEYS_POR_CONTA);
    }

    const gravada = await repositorio.gravar(
      {
        id: ids.uuidv7(),
        userId: dono.id,
        credentialId,
        publicKey: Buffer.from(info.credential.publicKey),
        signCount: BigInt(info.credential.counter),
        label: rotuloNormalizado(resposta.label),
        transports: info.credential.transports ?? null,
      },
      agora,
    );

    await trilha.record({
      actorKind: 'user',
      actorUserId: dono.id,
      action: 'auth.passkey_registered',
      resourceKind: 'passkey',
      resourceId: gravada.id,
      // `credential_backed_up` diz se a credencial e sincronizada entre
      // aparelhos. Nao e decisao de seguranca aqui -- esta na trilha porque e a
      // unica fonte que responderia, depois, "quantas passkeys do produto
      // morrem com o aparelho".
      metadata: { credential_backed_up: info.credentialBackedUp },
    });

    return gravada;
  }

  /**
   * Passo 1 da entrada: emite o desafio.
   *
   * **Sem e-mail, e `allowCredentials` sempre vazia.** A credencial é
   * *discoverable*; o aparelho acha a conta sozinho. Receber e-mail obrigaria a
   * devolver `allowCredentials` daquela conta, e a lista cheia ou vazia
   * responderia "esta conta tem passkey?" numa porta sem autenticação.
   */
  async comecarEntrada(): Promise<unknown> {
    const { repositorio, clock, ids, rp } = this.deps;

    const opcoes = await generateAuthenticationOptions({
      rpID: rp.rpId,
      timeout: PRAZO_DO_DESAFIO_MS,
      userVerification: 'required',
      allowCredentials: [],
    });

    const agora = clock.now();
    await repositorio.guardarDesafio({
      id: ids.uuidv7(),
      // NULO: não há sessão, e inventar um dono antes de a assinatura conferir
      // seria aceitar como identificação o campo que quem chama escolhe.
      userId: null,
      purpose: 'authentication',
      challengeHash: hashDoDesafio(opcoes.challenge),
      expiraEm: (agora + PRAZO_DO_DESAFIO_MS) as Instant,
    });

    return opcoes;
  }

  /**
   * Passo 2 da entrada: verifica a asserção e devolve de QUEM ela é.
   *
   * Devolve só o `UserId`. Quem abre a sessão é o `AuthService`, pela mesma
   * porta do login — este serviço não emite token, e não conhece `JanelasDeSessao`.
   *
   * O 401 é IDÊNTICO para credencial desconhecida, revogada, assinatura errada
   * e contador repetido. A porta não diz qual dos quatro foi, pelo mesmo motivo
   * que `login` não diz se o e-mail existe.
   */
  async concluirEntrada(resposta: { readonly credential: unknown }): Promise<UserId> {
    const { repositorio, clock, trilha, rp } = this.deps;

    const credencialBruta = resposta.credential as {
      id?: unknown;
      response?: { client_data_json?: unknown; user_handle?: unknown };
    };
    const desafioRecebido = this.desafioDoClientData(credencialBruta.response?.client_data_json);
    const desafio = await repositorio.acharDesafioPorHash(hashDoDesafio(desafioRecebido));

    const agora = clock.now();
    if (desafio === undefined || !desafioValido(desafio, agora)) {
      throw problemas.desafioDePasskeyVencido();
    }
    if (desafio.purpose !== 'authentication') throw problemas.desafioDePasskeyVencido();
    if (!(await repositorio.consumirDesafio(desafio.id, agora))) {
      throw problemas.desafioDePasskeyVencido();
    }

    if (typeof credencialBruta.id !== 'string' || credencialBruta.id === '') {
      throw problemas.credencialRecusada();
    }
    const credentialId = Buffer.from(credencialBruta.id, 'base64url');
    const credencial = await repositorio.acharPorCredentialId(credentialId);

    // Desconhecida e revogada respondem IGUAL.
    if (credencial === undefined || credencial.revogadaEm !== null) {
      throw problemas.credencialRecusada();
    }

    // O `userHandle` é CONFERIDO, nunca aceito como identificação: o dono é o
    // da credencial achada pelo `credential_id`. Divergência recusa.
    const handle = credencialBruta.response?.user_handle;
    if (typeof handle === 'string' && handle !== '') {
      if (Buffer.from(handle, 'base64url').toString('utf8') !== credencial.userId) {
        throw problemas.credencialRecusada();
      }
    }

    let verificacao;
    try {
      verificacao = await verifyAuthenticationResponse({
        response: this.comoRespostaDeEntrada(resposta.credential),
        expectedChallenge: (recebido) =>
          hashDoDesafio(recebido).equals(hashDoDesafio(desafioRecebido)),
        expectedOrigin: [...rp.origensAceitas],
        expectedRPID: rp.rpId,
        requireUserVerification: true,
        credential: {
          id: base64url(credencial.credentialId),
          publicKey: new Uint8Array(credencial.publicKey),
          counter: Number(credencial.signCount),
        },
      });
    } catch {
      throw problemas.credencialRecusada();
    }

    if (!verificacao.verified) throw problemas.credencialRecusada();

    const recebido = BigInt(verificacao.authenticationInfo.newCounter);
    if (!contadorAceito(credencial.signCount, recebido)) {
      // CONTADOR REPETIDO: repetição de uma asserção capturada, ou autenticador
      // clonado. O servidor REVOGA a credencial e registra — e responde o mesmo
      // 401, sem contar o motivo.
      await repositorio.revogarPorCredentialId(credentialId, 'counter_regression', agora);
      await trilha.record({
        actorKind: 'user',
        actorUserId: credencial.userId,
        action: 'auth.passkey_counter_regression',
        resourceKind: 'passkey',
        resourceId: credencial.id,
        // Os dois contadores em texto: `bigint` nao sobrevive a
        // `JSON.stringify`, e o numero exato e o que permite decidir depois se
        // foi clone ou repeticao.
        metadata: { guardado: credencial.signCount.toString(), recebido: recebido.toString() },
      });
      throw problemas.credencialRecusada();
    }

    // Condicionado ao contador guardado: duas asserções com o mesmo contador
    // chegando juntas, só uma vale. A decisão é do `WHERE`, não de um `if`.
    if (!(await repositorio.avancarContador(credencial.id, credencial.signCount, recebido, agora))) {
      throw problemas.credencialRecusada();
    }

    return credencial.userId;
  }

  /** As credenciais ativas da conta. Sem chave pública e sem `credential_id`. */
  listar(userId: UserId): Promise<readonly PasskeyDaTela[]> {
    return this.deps.repositorio.ativasDaConta(userId);
  }

  /**
   * Revoga. MARCA revogada, nunca apaga.
   *
   * Idempotente: revogar a já revogada também sai 204, porque o estado desejado
   * já é o corrente e 404 ali faria a tela dizer "não encontramos" sobre uma
   * credencial que a pessoa está vendo na lista.
   *
   * Credencial de outra conta responde 404, não 403, como o resto do contrato.
   */
  async revogar(userId: UserId, passkeyId: string): Promise<void> {
    const { repositorio, clock, trilha } = this.deps;
    const agora = clock.now();
    const resultado = await repositorio.revogar(passkeyId, userId, 'user', agora);
    if (resultado === 'nao-encontrada') throw problemas.naoEncontrado();
    await trilha.record({
      actorKind: 'user',
      actorUserId: userId,
      action: 'auth.passkey_revoked',
      resourceKind: 'passkey',
      resourceId: passkeyId,
    });
  }

  /**
   * O `challenge` que o aparelho diz ter assinado, lido do `clientDataJSON`.
   *
   * É o valor que acha a linha do desafio. Ele é tratado como ENTRADA NÃO
   * CONFIÁVEL: serve só para a busca, e quem decide se ele confere é a
   * biblioteca de verificação, contra o mesmo campo, conferindo a assinatura
   * por cima. Ler aqui não autentica nada.
   */
  private desafioDoClientData(clientDataJson: unknown): string {
    if (typeof clientDataJson !== 'string' || clientDataJson === '') {
      throw problemas.desafioDePasskeyVencido();
    }
    let lido: unknown;
    try {
      lido = JSON.parse(Buffer.from(clientDataJson, 'base64url').toString('utf8'));
    } catch {
      throw problemas.desafioDePasskeyVencido();
    }
    const desafio = (lido as { challenge?: unknown } | null)?.challenge;
    if (typeof desafio !== 'string' || desafio === '') {
      throw problemas.desafioDePasskeyVencido();
    }
    return desafio;
  }

  /**
   * Converte o corpo do contrato (`snake_case`) para o que a biblioteca espera
   * (`camelCase`).
   *
   * A tradução é explícita de propósito. O contrato é `snake_case` em todo o
   * produto e a biblioteca segue o nome do campo do WebAuthn; mapear num lugar
   * só é o que evita que metade do app aprenda `clientDataJSON` e a outra
   * metade `client_data_json`.
   */
  private comoRespostaDeCadastro(credencial: unknown): RegistrationResponseJSON {
    const c = credencial as {
      id: string;
      raw_id: string;
      // `'public-key'` e nao `string`: o contrato declara `enum: [public-key]`
      // e o Ajv do Fastify ja recusou qualquer outro valor no corpo, entao o
      // unico habitante do tipo e esse. Declarar `string` aqui obrigaria um
      // `as` na saida, e e justamente o `as` que escondia este mapeamento.
      type: 'public-key';
      response: {
        client_data_json: string;
        attestation_object: string;
        transports?: string[];
      };
    };
    return {
      id: c.id,
      rawId: c.raw_id,
      type: c.type,
      clientExtensionResults: {},
      response: {
        clientDataJSON: c.response.client_data_json,
        attestationObject: c.response.attestation_object,
        ...(c.response.transports === undefined ? {} : { transports: c.response.transports }),
      },
    };
  }

  private comoRespostaDeEntrada(credencial: unknown): AuthenticationResponseJSON {
    const c = credencial as {
      id: string;
      raw_id: string;
      // `'public-key'` e nao `string`: o contrato declara `enum: [public-key]`
      // e o Ajv do Fastify ja recusou qualquer outro valor no corpo, entao o
      // unico habitante do tipo e esse. Declarar `string` aqui obrigaria um
      // `as` na saida, e e justamente o `as` que escondia este mapeamento.
      type: 'public-key';
      response: {
        client_data_json: string;
        authenticator_data: string;
        signature: string;
        user_handle?: string | null;
      };
    };
    return {
      id: c.id,
      rawId: c.raw_id,
      type: c.type,
      clientExtensionResults: {},
      response: {
        clientDataJSON: c.response.client_data_json,
        authenticatorData: c.response.authenticator_data,
        signature: c.response.signature,
        ...(c.response.user_handle === undefined || c.response.user_handle === null
          ? {}
          : { userHandle: c.response.user_handle }),
      },
    };
  }
}
