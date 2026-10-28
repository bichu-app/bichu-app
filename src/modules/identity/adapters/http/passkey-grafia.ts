/**
 * A resposta das duas operações de `options` na grafia do CONTRATO. BICHUS-301.
 *
 * =========================================================================
 * O DEFEITO QUE ESTE ARQUIVO EXISTE PARA CONSERTAR
 * =========================================================================
 *
 * As duas rotas de `options` faziam `reply.send()` do retorno CRU de
 * `@simplewebauthn/server`, e o retorno dele é camelCase por natureza — é a
 * forma do WebAuthn, e a biblioteca está certa em produzi-la. Medido contra
 * homologação em 28/10/2026, `POST /v1/auth/passkey/authentication/options`
 * respondia:
 *
 *     {"rpId":"hml.bichu.app","challenge":"...","allowCredentials":[],
 *      "timeout":300000,"userVerification":"required"}
 *
 * e `api/openapi.yaml` declara, os três como OBRIGATÓRIOS, `rp_id`,
 * `user_verification` e `allow_credentials`. O app lê a grafia do contrato,
 * recebia `rp_id` **nulo**, e a fiação engolia: a falha ficava
 * indistinguível de "esta conta não tem passkey". Passkey que falha em
 * silêncio é pior que passkey que não existe, porque ninguém vai procurar.
 *
 * Nenhum portão pegava, e não por descuido: neste projeto **só o corpo da
 * REQUISIÇÃO é validado** contra a especificação (`corpoDe`, em
 * `shared/http/contract.ts`). `responseSchema` existia e ninguém comparava
 * nada contra ele. A isca que fecha esse buraco para estas duas rotas é
 * `passkey-grafia.test.ts`.
 *
 * =========================================================================
 * POR QUE O CONSERTO É AQUI, E NÃO NO CONTRATO
 * =========================================================================
 *
 * `snake_case` é a convenção do contrato INTEIRO. Trocar o contrato para
 * camelCase consertaria a divergência criando uma exceção numa superfície e
 * arrastaria os quatro consumidores gerados (raiz, `admin/`, `web/`, app) para
 * uma grafia que nenhuma outra operação usa. O contrato está certo; quem
 * divergia era o servidor.
 *
 * =========================================================================
 * POR QUE OS TIPOS DE SAÍDA VÊM DE `generated/api.ts`
 * =========================================================================
 *
 * O destino de cada campo não é redigitado aqui: ele é
 * `components['schemas']['PasskeyRegistrationOptions']`, gerado de
 * `api/openapi.yaml`. Escrever a forma à mão criaria a segunda definição que
 * diverge — o mesmo defeito, uma camada acima. Assim, campo que o contrato
 * renomear, ganhar ou perder passa a reprovar no `tsc`, e não em silêncio
 * numa resposta.
 *
 * =========================================================================
 * POR QUE AS NARRAÇÕES ESTREITAS LEVANTAM EM VEZ DE COAGIR
 * =========================================================================
 *
 * O contrato declara `enum` em cinco campos (`attestation: none`,
 * `authenticator_attachment: platform`, `resident_key: required`,
 * `user_verification: required`, `alg: -7 | -257`) e a biblioteca os declara
 * largos (`string`, `number`). Um `as` calado aqui faria exatamente o que
 * este arquivo existe para impedir: emitir corpo que não é o declarado, sem
 * ninguém saber. Então divergência LEVANTA, e levanta com o nome do campo e
 * o valor recebido. É defeito de programação deste arquivo ou mudança de
 * comportamento da biblioteca — nos dois casos, uma exceção de 500 ruidosa é
 * melhor que um `rp_id` nulo que o app engole.
 */
import type {
  PublicKeyCredentialCreationOptionsJSON,
  PublicKeyCredentialRequestOptionsJSON,
} from '@simplewebauthn/server';
import type { components } from '../../../../shared/types/generated/api.js';

export type OpcoesDeCadastroDoContrato = components['schemas']['PasskeyRegistrationOptions'];
export type OpcoesDeEntradaDoContrato = components['schemas']['PasskeyAuthenticationOptions'];
type DescritorDoContrato = components['schemas']['PasskeyDescriptor'];

/**
 * A falha é de MANUTENÇÃO, nunca de quem chama: toda ela nasce de a
 * biblioteca ter devolvido coisa diferente do que este arquivo mapeia. Por
 * isso ela carrega o campo e o valor, e não um texto de usuário.
 */
function divergencia(campo: string, esperado: string, recebido: unknown): Error {
  return new Error(
    `A opção de passkey '${campo}' veio ${JSON.stringify(recebido)} do ` +
      `@simplewebauthn/server, e o contrato declara ${esperado}. O corpo da resposta ` +
      'não pode ser emitido fora da grafia e dos valores que `api/openapi.yaml` ' +
      'declara — foi exatamente assim que o passkey falhou em silêncio antes. ' +
      'Confira a chamada de `generate*Options` em `passkey-service.ts`.',
  );
}

function exigido<T>(campo: string, valor: T | undefined, esperado: string): T {
  // `timeout` e `attestation` são OPCIONAIS na biblioteca e OBRIGATÓRIOS no
  // contrato. O serviço os passa sempre; se um dia parar de passar, o campo
  // sairia ausente do corpo e o app leria nulo — a falha de novo em silêncio.
  if (valor === undefined) throw divergencia(campo, esperado, valor);
  return valor;
}

/**
 * O descritor na grafia do contrato.
 *
 * `type` vem da biblioteca como `string` largo e o contrato só aceita
 * `public-key`. Hoje a biblioteca escreve o literal, e é por isso que isto
 * confere em vez de confiar.
 */
function descritor(indice: number, bruto: { readonly id: string; readonly type?: string }): DescritorDoContrato {
  if (bruto.type !== undefined && bruto.type !== 'public-key') {
    throw divergencia(`exclude_credentials[${String(indice)}].type`, "'public-key'", bruto.type);
  }
  return { type: 'public-key', id: bruto.id };
}

export function grafiaDasOpcoesDeCadastro(
  opcoes: PublicKeyCredentialCreationOptionsJSON,
): OpcoesDeCadastroDoContrato {
  const attestation = exigido('attestation', opcoes.attestation, "'none'");
  if (attestation !== 'none') throw divergencia('attestation', "'none'", attestation);

  const selecao = exigido(
    'authenticator_selection',
    opcoes.authenticatorSelection,
    'um objeto com attachment, resident key e user verification',
  );
  const { authenticatorAttachment, residentKey, userVerification } = selecao;
  if (authenticatorAttachment !== 'platform') {
    throw divergencia('authenticator_selection.authenticator_attachment', "'platform'", authenticatorAttachment);
  }
  // `resident_key: required` é o que torna a credencial *discoverable*, e é o
  // que permite `beginPasskeyAuthentication` não receber e-mail. Degradar para
  // `preferred` não é detalhe de grafia: é a entrada virando oráculo de
  // enumeração de conta.
  if (residentKey !== 'required') {
    throw divergencia('authenticator_selection.resident_key', "'required'", residentKey);
  }
  if (userVerification !== 'required') {
    throw divergencia('authenticator_selection.user_verification', "'required'", userVerification);
  }

  const rpId = opcoes.rp.id;
  if (typeof rpId !== 'string' || rpId === '') {
    throw divergencia('rp.id', 'o hostname do Relying Party', rpId);
  }

  return {
    challenge: opcoes.challenge,
    rp: { id: rpId, name: opcoes.rp.name },
    user: {
      id: opcoes.user.id,
      name: opcoes.user.name,
      // A única renúncia de grafia DENTRO de um objeto aninhado, e a mais
      // fácil de perder de vista numa revisão: a biblioteca escreve
      // `displayName`, o contrato declara `display_name`.
      display_name: opcoes.user.displayName,
    },
    pub_key_cred_params: opcoes.pubKeyCredParams.map((parametro, indice) => {
      if (parametro.type !== 'public-key') {
        throw divergencia(`pub_key_cred_params[${String(indice)}].type`, "'public-key'", parametro.type);
      }
      // A lista de algoritmos é FECHADA no contrato e no serviço. Um algoritmo
      // a mais aqui seria corpo fora do `enum` declarado.
      if (parametro.alg !== -7 && parametro.alg !== -257) {
        throw divergencia(`pub_key_cred_params[${String(indice)}].alg`, '-7 (ES256) ou -257 (RS256)', parametro.alg);
      }
      return { type: 'public-key', alg: parametro.alg };
    }),
    timeout: exigido('timeout', opcoes.timeout, 'o prazo do desafio em milissegundos'),
    attestation,
    authenticator_selection: {
      authenticator_attachment: 'platform',
      resident_key: 'required',
      user_verification: 'required',
    },
    exclude_credentials: exigido(
      'exclude_credentials',
      opcoes.excludeCredentials,
      'a lista das credenciais ativas da conta, vazia quando não há nenhuma',
    ).map((bruto, indice) => descritor(indice, bruto)),
  };
}

export function grafiaDasOpcoesDeEntrada(
  opcoes: PublicKeyCredentialRequestOptionsJSON,
): OpcoesDeEntradaDoContrato {
  const userVerification = exigido('user_verification', opcoes.userVerification, "'required'");
  if (userVerification !== 'required') {
    throw divergencia('user_verification', "'required'", userVerification);
  }

  const rpId = exigido('rp_id', opcoes.rpId, 'o hostname do Relying Party');
  if (rpId === '') throw divergencia('rp_id', 'o hostname do Relying Party', rpId);

  // `allow_credentials` é SEMPRE vazia, em toda chamada, e o contrato cobra
  // isso com `maxItems: 0`. Não é campo a preencher depois: é a forma de a
  // operação não responder "esta conta tem passkey?". Preenchê-la um dia
  // precisa reprovar aqui, e não vazar.
  const permitidas = exigido('allow_credentials', opcoes.allowCredentials, 'a lista VAZIA');
  if (permitidas.length > 0) {
    throw divergencia(
      'allow_credentials',
      'a lista VAZIA (o contrato declara `maxItems: 0`; preenchê-la faria a ' +
        'entrada enumerar conta)',
      permitidas,
    );
  }

  return {
    challenge: opcoes.challenge,
    timeout: exigido('timeout', opcoes.timeout, 'o prazo do desafio em milissegundos'),
    rp_id: rpId,
    user_verification: userVerification,
    allow_credentials: [],
  };
}
