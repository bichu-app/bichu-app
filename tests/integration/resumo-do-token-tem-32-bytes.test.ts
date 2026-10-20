/**
 * O que as colunas `token_hash` GUARDAM: os 32 bytes do SHA-256, medidos no
 * banco.
 *
 * ===========================================================================
 * POR QUE ESTE ARQUIVO EXISTE
 * ===========================================================================
 * Em 19/10/2026, em homologacao (`hml.bichu.app`, commit `458cd005`):
 *
 *   select octet_length(token_hash) as bytes, count(*) from verification_tokens group by 1;
 *    bytes | count
 *   -------+-------
 *       32 |     1
 *       44 |    14
 *
 * SHA-256 tem 32 bytes; 44 e o tamanho do TEXTO base64 de 32 bytes.
 * `comoTokenHash` devolvia `hashDeToken(valor).toString('base64')` -- uma
 * string -- e o adaptador a entregava a coluna `bytea` com `Buffer.from(hash)`,
 * que sem segundo argumento interpreta a string como utf8. O que a coluna
 * recebia eram os 44 bytes ASCII do base64.
 *
 * ===========================================================================
 * A FORMA DESTE ARQUIVO E A LICAO DO DEFEITO
 * ===========================================================================
 * **Escrita e leitura passavam pelo MESMO caminho errado.** Essa e a frase que
 * decide tudo aqui. O ida-e-volta pela aplicacao funcionava perfeitamente:
 * cadastrar, abrir o link e confirmar respondia 200. Entao nenhum caso que
 * afirme comportamento -- e eram dezenas, da unitaria a integracao -- podia
 * reprovar, e nenhum reprovou. O defeito atravessou a esteira inteira.
 *
 * Por isso cada caso abaixo escreve PELA ROTA e depois mede O BANCO com
 * `octet_length`, em SQL, sem passar pela aplicacao na volta. Um caso que
 * afirmasse so o ida-e-volta reproduziria exatamente o cego que deixou o
 * desvio passar.
 *
 * E o tamanho nao basta sozinho: cada caso tambem compara os bytes gravados com
 * `hashDeToken(<token em claro>)`. Trinta e dois bytes QUAISQUER na coluna
 * passariam por um portao de tamanho -- e seriam um token que nao resolve.
 *
 * ===========================================================================
 * AS TRES TABELAS, E A RESTRICAO
 * ===========================================================================
 * `verification_tokens` e `reauth_tokens` erravam. `refresh_tokens` nao -- o
 * adaptador usava `Buffer.from(hash, 'base64')` ali, no mesmo arquivo, e e essa
 * divergencia interna que fez o defeito parecer um detalhe de estilo. As tres
 * entram, porque o que se afirma e a classe da coluna e nao o caminho de uma.
 *
 * O ultimo caso mede a restricao que a `20261019000050` trouxe. Ela e o que
 * responde pela frase que o cliente escreveu no relatorio -- "qualquer migracao
 * ou ferramenta que toque a coluna erra": o conserto no codigo vale para quem
 * passa por `comoTokenHash`, e o `CHECK` vale para qualquer escrita, inclusive
 * a de um script rodado a mao (que e literalmente como a unica linha de 32
 * bytes em homologacao apareceu).
 *
 * ===========================================================================
 * ISCAS CONFERIDAS
 * ===========================================================================
 * Cada mecanismo foi desligado sozinho, com o arquivo alterado no disco antes
 * de rodar a suite inteira, e religado depois:
 *
 * - **`comoTokenHash` de volta a `.toString('base64')` e `Buffer.from(hash)`
 *   nos tres caminhos do adaptador** (o codigo exato de `458cd005`): os casos
 *   1, 2 e 3 reprovam pelo tamanho (`actual: 44, expected: 32`). O caso 4
 *   (ida-e-volta) CONTINUA PASSANDO -- e e esse contraste que explica por que
 *   este arquivo mede o banco, e nao a rota.
 * - **so o caminho de `verification_tokens` revertido**: reprova o caso 1 e
 *   mais nada, o que prova que os tres casos enderecam tabelas diferentes.
 * - **`DROP CONSTRAINT verification_tokens_token_hash_32_bytes`**: reprova so o
 *   caso 5, nomeando a restricao ausente.
 * - **a conversao da migracao trocada por `DELETE`** (o plano de origem, que
 *   apagava os pendentes): nenhum caso reprova -- banco de integracao migra do
 *   zero e nao tem linha de 44 bytes para converter. Fica escrito porque e o
 *   limite honesto deste arquivo: ele afirma o esquema e a escrita nova, nao a
 *   conversao do dado que ja existe em homologacao. Quem responde por aquela e
 *   `make verificar-migracao-em-banco-com-dado`.
 *
 * Como rodar: `npm run test:integration`, de dentro do worktree.
 */
import assert from 'node:assert/strict';
import { after, before, describe, it } from 'node:test';
import type { AddressInfo } from 'node:net';
import { randomUUID } from 'node:crypto';

import { sql } from 'kysely';

import { loadAppConfig } from '../../src/shared/config/app-config.js';
import { createDb, type Db } from '../../src/shared/db/pool.js';
import { hashDeToken, hmacDeEnderecoIp } from '../../src/shared/crypto/digest.js';
import { criarIdGenerator } from '../../src/shared/id/uuidv7.js';
import { systemClock } from '../../src/shared/time/clock.js';
import { carregarContrato } from '../../src/shared/http/contract.js';
import { criarServidor } from '../../src/shared/http/server.js';
import { tetoDeTeste } from '../../src/shared/http/teto-de-teste.js';
import type { RegistradorDeRotas, VerificadorDeReautenticacao } from '../../src/shared/http/registrar-rota.js';
import type { UserId } from '../../src/shared/types/brands.js';
import { criarTrilhaDeAuditoria } from '../../src/modules/audit/adapters/persistence/kysely-audit-log.js';
import { criarTokenSigner } from '../../src/modules/identity/adapters/external/rs256-token-signer.js';
import { criarIdentityRepository } from '../../src/modules/identity/adapters/persistence/kysely-identity-repository.js';
import { criarLocalizacaoDeReferenciaRepository } from '../../src/modules/identity/adapters/persistence/kysely-localizacao-de-referencia.js';
import {
  criarVerificadorDeReautenticacao,
  registrarRotasDeIdentidade,
  rotaDeConfirmacaoDeEmail,
  rotaDeLogoutTotal,
  rotaDeReautenticacao,
  type DependenciasDasRotas,
} from '../../src/modules/identity/adapters/http/routes.js';
import { criarAuthService } from '../../src/modules/identity/application/auth-service.js';
import { criarAvisoDeReusoAoTitular } from '../../src/modules/identity/application/aviso-de-reuso.js';
import type { Mailer, Mensagem } from '../../src/modules/identity/ports/mailer.js';

const PREFIXO_DA_API = '/v1';

/** `.invalid` e reservado por RFC 2606: nenhum e-mail sai daqui para o mundo. */
const DOMINIO_DE_TESTE = 'exemplo.invalid';

/** Nada em comum com o endereco: a politica recusa senha parecida com o e-mail. */
const SENHA = 'chuva-morna-no-telhado-47';

/** Os caminhos e o escopo saem da DECLARACAO da rota, nunca de uma copia. */
const CONFIRMACAO = rotaDeConfirmacaoDeEmail.path;
const REAUTH = rotaDeReautenticacao.path;
const ESCOPO = rotaDeLogoutTotal.reauthScope;

/**
 * O tamanho do digest, escrito uma vez. SHA-256 tem 256 bits.
 *
 * O numero esta aqui por extenso de proposito: deriva-lo de
 * `hashDeToken('x').length` compararia a implementacao com ela mesma e ficaria
 * verde com qualquer coisa que os dois lados fizessem igual -- que e
 * literalmente o defeito que este arquivo existe para pegar.
 */
const BYTES_DO_DIGEST = 32;

let app: RegistradorDeRotas;
let banco: { db: Db; close: () => Promise<void> };
let base: string;

const contas: UserId[] = [];
const caixaDeEntrada: Mensagem[] = [];

interface Resposta {
  readonly status: number;
  readonly corpo: unknown;
}

interface Sessao {
  readonly access_token: string;
  readonly refresh_token: string;
}

async function chamar(
  caminho: string,
  opcoes: { metodo: 'GET' | 'POST'; corpo?: unknown; token?: string },
): Promise<Resposta> {
  const cabecalhos: Record<string, string> = { accept: 'application/json' };
  if (opcoes.corpo !== undefined) cabecalhos['content-type'] = 'application/json';
  if (opcoes.token !== undefined) cabecalhos['authorization'] = `Bearer ${opcoes.token}`;

  const resposta = await fetch(`${base}${PREFIXO_DA_API}${caminho}`, {
    method: opcoes.metodo,
    headers: cabecalhos,
    ...(opcoes.corpo === undefined ? {} : { body: JSON.stringify(opcoes.corpo) }),
  });
  const texto = await resposta.text();
  return { status: resposta.status, corpo: texto === '' ? undefined : JSON.parse(texto) };
}

/** Uma conta nova por cenario: os casos nao podem se cruzar. */
async function contaNova(rotulo: string): Promise<{ id: UserId; email: string; sessao: Sessao }> {
  const email = `resumo-${rotulo}-${randomUUID().slice(0, 8)}@${DOMINIO_DE_TESTE}`;
  const cadastro = await chamar('/auth/register', {
    metodo: 'POST',
    corpo: { email, password: SENHA, display_name: 'Conta de Teste', birth_date: '1990-01-01' },
  });
  assert.equal(
    cadastro.status,
    201,
    `a conta ${email} nao foi criada (${String(cadastro.status)}): ${JSON.stringify(cadastro.corpo)}`,
  );
  const corpo = cadastro.corpo as { user: { id: string } } & Sessao;
  const id = corpo.user.id as UserId;
  contas.push(id);
  return {
    id,
    email,
    sessao: { access_token: corpo.access_token, refresh_token: corpo.refresh_token },
  };
}

/**
 * O token em claro do link que o cadastro disparou.
 *
 * Ele existe na funcao que emite e no corpo do e-mail, em nenhum outro lugar --
 * nem na trilha, nem no log, nem na resposta. Le-lo da caixa de entrada e a
 * unica forma honesta de comparar o resumo gravado com o valor que foi no link.
 */
function tokenDoLinkPara(endereco: string): string {
  const mensagens = caixaDeEntrada.filter((m) => m.para.toLowerCase() === endereco.toLowerCase());
  const ultima = mensagens[mensagens.length - 1];
  assert.ok(ultima !== undefined, `o cadastro nao mandou verificacao para ${endereco}`);
  const achado = /[?&]token=([^\s&]+)/.exec(ultima.corpo);
  assert.ok(achado, `nenhum link com token no corpo da mensagem:\n${ultima.corpo}`);
  return achado[1] as string;
}

/**
 * O que a coluna GUARDA, lido em SQL cru e sem passar pela aplicacao.
 *
 * `octet_length` vem do banco e nao de `Buffer.length` do lado de ca de
 * proposito: e a pergunta "quantos bytes tem a coluna", feita a quem guarda.
 */
async function resumoGravado(
  tabela: 'verification_tokens' | 'reauth_tokens' | 'refresh_tokens',
  dono: UserId,
): Promise<{ bytes: number; valor: Buffer }> {
  const { rows } = await sql<{ bytes: number; valor: Buffer }>`
    SELECT octet_length(token_hash) AS bytes, token_hash AS valor
      FROM ${sql.table(tabela)}
     WHERE user_id = ${dono}`.execute(banco.db);

  // UMA linha, e a asercao e do caso: a conta e nova, o cenario fez exatamente
  // uma escrita naquela tabela, e `LIMIT 1` sem ordem esconderia uma segunda
  // linha inesperada em vez de acusa-la.
  assert.equal(
    rows.length,
    1,
    `esperava exatamente uma linha de ${tabela} para a conta ${dono}, e vieram ${String(rows.length)}`,
  );
  const linha = rows[0] as { bytes: number; valor: Buffer };
  return { bytes: Number(linha.bytes), valor: linha.valor };
}

/** A mensagem que explica o numero, para quem encontrar a falha sem o contexto. */
function porQue(tabela: string, bytes: number): string {
  return (
    `${tabela}.token_hash tem ${String(bytes)} bytes, e SHA-256 tem ${String(BYTES_DO_DIGEST)}. ` +
    `44 e o tamanho do TEXTO base64 de 32 bytes: e o defeito de 19/10/2026, em que ` +
    `\`comoTokenHash\` devolvia base64 e o adaptador o entregava a coluna \`bytea\` com ` +
    `\`Buffer.from(hash)\` -- sem segundo argumento, portanto utf8.`
  );
}

before(async () => {
  const config = loadAppConfig();
  const contrato = carregarContrato(config.openapiSpecPath);

  banco = createDb(config.databaseUrl);
  const db = banco.db;
  const ids = criarIdGenerator(() => systemClock.now());
  const assinador = criarTokenSigner(config.token);

  let verificarReautenticacao: VerificadorDeReautenticacao = () => {
    throw new Error('verificador chamado antes de a fiacao terminar');
  };

  app = criarServidor({
    problemBaseUrl: config.problemBaseUrl,
    isProduction: config.isProduction,
    teto: tetoDeTeste(),
    reautenticacao: (request, escopo) => verificarReautenticacao(request, escopo),
  });

  const trilha = criarTrilhaDeAuditoria({
    db,
    ids,
    clock: systemClock,
    ipHmacKey: config.ipHmacKey,
    onFailure: (erro) => {
      console.error('trilha de auditoria nao gravou:', erro);
    },
  });

  const repositorio = criarIdentityRepository(db, ids);
  const mailer: Mailer = {
    enviar: (mensagem: Mensagem) => {
      caixaDeEntrada.push(mensagem);
      return Promise.resolve();
    },
  };

  const auth = criarAuthService({
    // Nenhum caso deste arquivo derruba sessao nem le `user_devices`.
    removerPushDaConta: () => Promise.resolve(0),
    apagarLocalizacaoDaSessao: (dono, familia) =>
      criarLocalizacaoDeReferenciaRepository(db).apagar(dono, familia),
    repositorio,
    assinador,
    trilha,
    ids,
    clock: systemClock,
    janelas: config.session,
    hmacDeIp: (ip) => hmacDeEnderecoIp(ip, config.ipHmacKey),
    mailer,
    registrarOcorrencia: () => {
      // O que este arquivo afirma sai do BANCO, nunca do log.
    },
    baseDaWeb: config.publicBaseUrl,
    avisarTitular: criarAvisoDeReusoAoTitular({
      repositorio,
      mailer,
      ids,
      baseDaWeb: config.publicBaseUrl,
      registrarOcorrencia: () => {
        // idem
      },
    }),
  });

  const deps: DependenciasDasRotas = {
    auth,
    assinador,
    contrato,
    issuer: config.token.issuer,
    apiBaseUrl: config.apiBaseUrl,
    urlDeMidia: (chave: string) => `https://midia.invalido/${chave}`,
  };
  verificarReautenticacao = criarVerificadorDeReautenticacao(deps);

  await app.register(
    (escopo, _opcoes, pronto) => {
      registrarRotasDeIdentidade(escopo, deps);
      pronto();
    },
    { prefix: PREFIXO_DA_API },
  );

  await app.listen({ port: 0, host: '127.0.0.1' });
  const endereco = app.server.address() as AddressInfo;
  base = `http://127.0.0.1:${String(endereco.port)}`;
});

after(async () => {
  if (app !== undefined) await app.close();
  if (banco !== undefined) {
    for (const id of contas) {
      await banco.db.deleteFrom('users').where('id', '=', id).execute();
    }
    await banco.close();
  }
});

void describe('as colunas `token_hash` guardam os 32 bytes do SHA-256', () => {
  void it('1. verification_tokens: o cadastro grava 32 bytes, e sao o resumo do token do link', async () => {
    const conta = await contaNova('verificacao');

    const gravado = await resumoGravado('verification_tokens', conta.id);
    assert.equal(gravado.bytes, BYTES_DO_DIGEST, porQue('verification_tokens', gravado.bytes));
    assert.deepEqual(
      gravado.valor,
      hashDeToken(tokenDoLinkPara(conta.email)),
      'a coluna tem 32 bytes, e nao sao o resumo do token que foi no link. ' +
        'Tamanho certo com valor errado e um link que nunca verifica.',
    );
  });

  void it('2. refresh_tokens: o cadastro grava 32 bytes, e sao o resumo do refresh devolvido', async () => {
    const conta = await contaNova('refresh');

    const gravado = await resumoGravado('refresh_tokens', conta.id);
    assert.equal(gravado.bytes, BYTES_DO_DIGEST, porQue('refresh_tokens', gravado.bytes));
    assert.deepEqual(
      gravado.valor,
      hashDeToken(conta.sessao.refresh_token),
      'a coluna tem 32 bytes, e nao sao o resumo do refresh que a resposta devolveu',
    );
  });

  void it('3. reauth_tokens: a janela grava 32 bytes, e sao o resumo do reauth_token devolvido', async () => {
    const conta = await contaNova('janela');

    const abertura = await chamar(REAUTH, {
      metodo: 'POST',
      token: conta.sessao.access_token,
      corpo: { password: SENHA, scope: ESCOPO },
    });
    assert.equal(abertura.status, 200, JSON.stringify(abertura.corpo));
    const { reauth_token: reauth } = abertura.corpo as { reauth_token: string };

    const gravado = await resumoGravado('reauth_tokens', conta.id);
    assert.equal(gravado.bytes, BYTES_DO_DIGEST, porQue('reauth_tokens', gravado.bytes));
    assert.deepEqual(
      gravado.valor,
      hashDeToken(reauth),
      'a coluna tem 32 bytes, e nao sao o resumo da janela que a resposta devolveu',
    );
  });

  /**
   * O ida-e-volta, que PASSAVA com o defeito de pe.
   *
   * Ele nao esta aqui como portao -- esta como registro do que nao basta. Com
   * `458cd005` no disco este caso fica verde e os tres acima reprovam; e por
   * isso que os tres acima medem o banco.
   */
  void it('4. (registro) o ida-e-volta pela rota funciona, e funcionava com o defeito tambem', async () => {
    const conta = await contaNova('idaevolta');

    const confirmacao = await chamar(CONFIRMACAO, {
      metodo: 'POST',
      corpo: { token: tokenDoLinkPara(conta.email) },
    });
    assert.equal(
      confirmacao.status,
      200,
      `a confirmacao do link recusou o token que o cadastro mandou: ${JSON.stringify(confirmacao.corpo)}`,
    );
  });

  /**
   * A restricao, e nao o comportamento.
   *
   * Os quatro casos acima afirmam o que o CODIGO escreve. Este afirma o que o
   * BANCO aceita, que e outra pergunta: enquanto a coluna aceitar 44 bytes,
   * qualquer script de correcao, ferramenta ou migracao futura pode reintroduzir
   * exatamente o valor de homologacao sem nada reclamar.
   */
  void it('5. o banco RECUSA um token_hash fora dos 32 bytes, nas tres tabelas', async () => {
    const conta = await contaNova('restricao');

    // Os 44 bytes do defeito, byte a byte: o texto base64 de um digest de
    // verdade, entregue a coluna como utf8. E a forma exata do que
    // `Buffer.from(hash)` produzia.
    const comoEra = Buffer.from(hashDeToken('qualquer-token').toString('base64'), 'utf8');
    assert.equal(comoEra.length, 44, 'a isca deste caso precisa ter os 44 bytes do defeito');

    await assert.rejects(
      banco.db
        .insertInto('verification_tokens')
        .values({
          id: randomUUID(),
          user_id: conta.id,
          purpose: 'email_verify',
          token_hash: comoEra,
          sent_to: conta.email,
          expires_at: new Date(Date.now() + 86_400_000),
          created_ip_hmac: null,
        })
        .execute(),
      /verification_tokens_token_hash_32_bytes/,
      'o banco aceitou os 44 bytes do texto base64 em `verification_tokens.token_hash`. ' +
        'A restricao `verification_tokens_token_hash_32_bytes` sumiu, e a coluna voltou a ' +
        'aceitar o valor que estava em homologacao em 19/10/2026.',
    );

    await assert.rejects(
      banco.db
        .insertInto('reauth_tokens')
        .values({
          id: randomUUID(),
          user_id: conta.id,
          access_jti: randomUUID(),
          scope: ESCOPO,
          token_hash: comoEra,
          issued_at: new Date(),
          expires_at: new Date(Date.now() + 300_000),
          created_ip_hmac: null,
        })
        .execute(),
      /reauth_tokens_token_hash_32_bytes/,
      'o banco aceitou os 44 bytes do texto base64 em `reauth_tokens.token_hash`',
    );

    await assert.rejects(
      banco.db
        .insertInto('refresh_tokens')
        .values({
          id: randomUUID(),
          user_id: conta.id,
          family_id: randomUUID(),
          token_hash: comoEra,
          issued_at: new Date(),
          expires_at: new Date(Date.now() + 86_400_000),
          absolute_expires_at: new Date(Date.now() + 180 * 86_400_000),
          stay_signed_in: false,
          user_agent: null,
          ip_hmac: null,
          rotated_to_id: null,
          revoked_at: null,
          revoked_reason: null,
          device_id: null,
        })
        .execute(),
      /refresh_tokens_token_hash_32_bytes/,
      'o banco aceitou os 44 bytes do texto base64 em `refresh_tokens.token_hash`',
    );
  });
});
