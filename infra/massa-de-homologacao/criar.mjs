#!/usr/bin/env node
/* global console, process, fetch, Buffer */
/**
 * Cria a massa de homologacao e ESCREVE O MANIFESTO.
 *
 *   BASE_URL=http://127.0.0.1:3000 DATABASE_URL=... \
 *     node infra/massa-de-homologacao/criar.mjs --manifesto <caminho.json>
 *
 * ===========================================================================
 * A PRIMEIRA TRAVA: ONDE ISTO PODE RODAR
 * ===========================================================================
 * Recusa em producao, e a pergunta nao e feita ao nome do ambiente -- e feita
 * ao BANCO, pelo comentario dele, como `guarda-de-banco-descartavel.mjs` ja faz
 * para a suite de integracao. Aqui a marca aceita e outra
 * (`bichu:homologacao`), porque homologacao NAO e descartavel: ela tem o dado
 * de teste manual do cliente dentro, e esse dado e dele.
 *
 * Uma lista de ambientes PROIBIDOS seria o arranjo errado, pelo mesmo motivo
 * que `seed.ts` da no cabecalho de `conferirAmbiente`: um ambiente novo que
 * ninguem lembrou de listar cairia no caso padrao, que seria escrever.
 *
 * ===========================================================================
 * A SEGUNDA TRAVA: NADA E CRIADO SEM SER REGISTRADO
 * ===========================================================================
 * O manifesto e gravado em disco DEPOIS DE CADA FASE, e nao no fim. Uma queda
 * no meio deixa massa gravada; o que ela nao pode deixar e massa gravada FORA
 * do manifesto, porque e o manifesto que a remocao le.
 *
 * E no fim roda a CONFERENCIA DE COBERTURA: uma consulta por cada marca
 * ESTRUTURAL (dominio `.invalid`, prefixo do apelido, prefixo do slug) procura
 * tudo que tem cara de massa e compara com o manifesto. Se sobrar linha fora,
 * o programa REPROVA dizendo qual -- a enumeracao e do manifesto, mas a
 * completude dela e conferida por uma segunda fonte.
 *
 * ===========================================================================
 * POR QUE AS ROTAS, E ONDE FOI `INSERT`
 * ===========================================================================
 * Rota faz as invariantes valerem; `INSERT` as burla. Entao entram por rota:
 * conta, pet, localizacao, encontro da Rede, plaquinha, aviso de achado,
 * conversa e mensagem.
 *
 * Entram por `INSERT`, e so porque NAO EXISTE rota:
 *   - `professionals` -- a escrita e do backoffice. A unica rota nao
 *     administrativa nessa direcao, `POST /v1/directory/suggestions`, grava na
 *     FILA DE REVISAO e nao cria entrada. Criar conta de administrador esta
 *     proibido. Ver o cabecalho de `profissionais()` em `massa.mjs`.
 *   - `store_items` e `store_partners` -- idem, `POST /v1/admin/store/items`.
 *   - UMA linha em `verification_tokens` por conta. Isto merece explicacao
 *     propria, abaixo.
 *   - UMA linha em `audit.events`, a marca do lote.
 *
 * ===========================================================================
 * COMO O E-MAIL E VERIFICADO SEM POSTMARK, E POR QUE NAO E UM `UPDATE`
 * ===========================================================================
 * Acao de comunidade exige sessao E canal verificado. O predicado do servidor
 * e `users.email_verified_at IS NOT NULL OR users.phone_verified_at IS NOT
 * NULL` (tres copias: `kysely-network-repository.ts`,
 * `kysely-canal-verificado-do-chamador.ts`, `kysely-lost-case-repository.ts`),
 * e nada em `src/` escreve `phone_verified_at`. Entao a pergunta e so sobre
 * `email_verified_at`.
 *
 * O caminho obvio seria `UPDATE users SET email_verified_at = now()`. Ele
 * funciona e esta ERRADO de escolher: ele escreve a CONSEQUENCIA e salta o ato.
 * A verificacao tambem zera o bloqueio de reenvio, consome o token pendente,
 * abre sessao e grava `auth.email_verified` na trilha -- e um `UPDATE` deixa a
 * conta com a coluna preenchida, um token `email_verify` eternamente pendente e
 * nenhuma linha na trilha dizendo que alguem verificou.
 *
 * O que esta massa faz: EMITE o token ela mesma e deixa a ROTA consumi-lo.
 * `hashDeToken` (`src/shared/crypto/digest.ts`) e SHA-256 puro, sem sal e sem
 * chave -- a decisao do ADR-0002/SEC-005, porque sao 256 bits de CSPRNG. Isso
 * nao e uma fraqueza explorada aqui: e o que permite a quem tem acesso de
 * escrita ao banco gravar `token_hash = sha256(T)` para um `T` que ele
 * sorteou, e em seguida chamar `POST /v1/auth/email-verification/confirm` com
 * `T`. A transicao de estado inteira acontece DENTRO do produto.
 *
 * Nenhuma chave do Postmark e tocada, e nenhuma mensagem sai: o endereco e
 * `@exemplo-de-teste.invalid`, que nao resolve.
 *
 * ===========================================================================
 * IMAGENS: ESTA MASSA SOBE ZERO BYTE, E ISSO E UMA ESCOLHA
 * ===========================================================================
 * Toda entrada nasce SEM imagem, e o cliente vai ver os estados de reserva.
 * Tres razoes, em ordem de peso:
 *
 * 1. As quatro imagens de catalogo que apareceriam nas telas desta massa
 *    (`store_item`, `directory_logo`, `directory_photo`) sao de proposito
 *    administrativo: a unica rota que aceita `purpose` e
 *    `POST /v1/admin/media/catalog-image-intents`, atras da sessao do painel.
 *    Criar conta de administrador esta proibido. Entao a Loja e o diretorio
 *    ficariam sem imagem de qualquer forma, e metade da massa com foto e metade
 *    sem seria uma inconsistencia pior que nenhuma.
 * 2. Os bytes vivem FORA do banco, em balde de objeto (ADR-0007), e o
 *    manifesto so alcanca linha de banco. Massa com foto deixaria derivada
 *    orfa no balde publico depois da remocao -- um resto que ninguem veria e
 *    que nenhuma das tres marcas identificaria.
 * 3. O que se perde esta medido e dito: sem foto, o caso de pet perdido NAO
 *    pode ser aberto por rota (`openLostCase` responde 409 enquanto o pet nao
 *    tem foto `ready` -- `kysely-lost-case-repository.ts:119`), entao esta
 *    massa nao cria `lost_cases`. E os tempos medidos sao PISO: a tela com
 *    foto carrega mais.
 */
import { createHash, randomBytes, randomUUID } from 'node:crypto';
import { writeFileSync } from 'node:fs';

import { Client } from 'pg';

import {
  CONTA_VITRINE,
  LOTE,
  PARCEIRO,
  PETS_DA_VITRINE,
  PLAQUINHAS_POR_PET,
  PREFIXO_ESTRUTURAL,
  DOMINIO_INVALIDO,
  contas,
  coordenadaDe,
  corpoDaMensagem,
  encontros,
  itensDaLoja,
  ordemDaUltimaMensagem,
  origemDaCoordenada,
  pets,
  profissionais,
  temCoordenada,
} from './massa.mjs';

/** A marca que o banco de homologacao precisa declarar. Ver a primeira trava. */
export const MARCA_DE_HOMOLOGACAO = 'bichu:homologacao';

const BASE = process.env['BASE_URL'] ?? 'http://127.0.0.1:3000';

/** A senha das contas da massa. NUNCA fica em arquivo: vem do ambiente. */
function senhaDaMassa() {
  const senha = process.env['MASSA_SENHA'];
  if (senha === undefined || senha.length < 10) {
    throw new Error(
      'MASSA_SENHA ausente ou com menos de 10 caracteres. Ela NAO mora neste '
      + 'arquivo nem no manifesto: credencial vive no Secret Manager (ADR-0022) '
      + 'e entra por ambiente. A politica de senha exige 10 a 256 caracteres e '
      + 'recusa senha parecida com o e-mail ou com o nome de exibicao.',
    );
  }
  return senha;
}

/**
 * O resumo do token NA FORMA EM QUE A COLUNA O GUARDA, que nao e a obvia.
 *
 * MEDIDO, e nao lido do codigo: `octet_length(token_hash)` em homologacao
 * devolve **44** para as 14 linhas que a producao escreveu, e nao 32. SHA-256
 * tem 32 bytes; 44 e o tamanho do texto BASE64 desses 32 bytes.
 *
 * A causa esta em duas linhas que se encontram:
 *   - `comoTokenHash()` (`auth-service.ts:160`) devolve
 *     `hashDeToken(valor).toString('base64')` -- uma STRING;
 *   - `consumirTokenDeVerificacao()`
 *     (`kysely-identity-repository.ts:891`) grava e busca por
 *     `Buffer.from(hash)`, e `Buffer.from` SEM segundo argumento interpreta a
 *     string como utf8.
 * Entao a coluna guarda os bytes ASCII do base64, nao o resumo. Nada acusa,
 * porque a escrita e a leitura passam pelo mesmo caminho.
 *
 * Esta funcao reproduz o que a coluna espera. Gravar os 32 bytes "certos" faz
 * a rota responder 410 -- foi o que aconteceu na primeira tentativa, e e por
 * isso que este comentario existe em vez de um `digest()` solto.
 */
function resumoComoAColunaGuarda(texto) {
  return Buffer.from(createHash('sha256').update(texto, 'utf8').digest().toString('base64'), 'utf8');
}

async function chamar(metodo, caminho, { token, corpo, idempotencia } = {}) {
  const cabecalhos = { accept: 'application/json' };
  if (corpo !== undefined) cabecalhos['content-type'] = 'application/json';
  if (token !== undefined) cabecalhos['authorization'] = `Bearer ${token}`;
  if (idempotencia !== undefined) cabecalhos['idempotency-key'] = idempotencia;
  const resposta = await fetch(`${BASE}/v1${caminho}`, {
    method: metodo,
    headers: cabecalhos,
    ...(corpo === undefined ? {} : { body: JSON.stringify(corpo) }),
  });
  const texto = await resposta.text();
  let json;
  try {
    json = texto === '' ? undefined : JSON.parse(texto);
  } catch {
    json = undefined;
  }
  if (!resposta.ok) {
    throw new Error(
      `${metodo} ${caminho} respondeu ${String(resposta.status)}: ${texto.slice(0, 600)}`,
    );
  }
  return json;
}

/**
 * A trava de ambiente, pela marca do BANCO e nao pelo nome do ambiente.
 *
 * Exportada e sem banco por argumento proprio para poder ser exercida em
 * teste: trava sem teste e trava por confianca.
 */
export function conferirMarca(marca) {
  if (marca !== MARCA_DE_HOMOLOGACAO) {
    throw new Error(
      'RECUSADO: este banco nao se declara como homologacao.\n'
      + `  marca lida:  ${marca === null || marca === undefined ? '(nenhuma)' : String(marca)}\n`
      + `  esperada:    ${MARCA_DE_HOMOLOGACAO}\n\n`
      + 'Esta ferramenta ESCREVE 30 contas, 30 pets, 30 encontros, 30 entradas de\n'
      + 'diretorio, 30 itens de loja e 30 conversas. Ela so roda em banco que\n'
      + 'alguem declarou de homologacao com:\n'
      + `    COMMENT ON DATABASE "<banco>" IS '${MARCA_DE_HOMOLOGACAO}'\n\n'`
      + 'PRODUCAO NAO RECEBE MASSA DE TESTE. Se voce queria homologacao e caiu\n'
      + 'aqui, confira DATABASE_URL antes de marcar banco nenhum.',
    );
  }
}

async function marcaDoBanco(cliente) {
  const { rows } = await cliente.query(
    `select current_database() as banco,
            shobj_description(d.oid, 'pg_database') as marca
       from pg_database d where d.datname = current_database()`,
  );
  return rows[0];
}

/** O manifesto, em ordem de remocao segura. A ordem e documentada em remover.mjs. */
function manifestoVazio(agora) {
  return {
    lote: LOTE,
    criado_em: agora,
    base_url: BASE,
    marcas: {
      visivel: '[teste] (prefixo em todo texto de tela)',
      estrutural_email: `@${DOMINIO_INVALIDO}`,
      estrutural_apelido: `${PREFIXO_ESTRUTURAL}NN`,
      estrutural_slug: `${PREFIXO_ESTRUTURAL}-`,
      audit_event_id: null,
    },
    // A ORDEM DAS CHAVES E A ORDEM DE REMOCAO. Nao reordene sem ler remover.mjs.
    conversation_messages_por_conversa: [],
    conversations: [],
    found_reports: [],
    tag_scans_por_tag: [],
    pet_tags: [],
    pets: [],
    network_events: [],
    store_items: [],
    store_partners: [],
    professionals: [],
    user_reference_locations_por_usuario: [],
    users: [],
    handles: [],
  };
}

async function principal() {
  const caminhoDoManifesto = (() => {
    const i = process.argv.indexOf('--manifesto');
    if (i === -1 || process.argv[i + 1] === undefined) {
      throw new Error('passe --manifesto <caminho.json>');
    }
    return process.argv[i + 1];
  })();

  const senha = senhaDaMassa();
  const url = process.env['DATABASE_URL'];
  if (url === undefined || url === '') throw new Error('DATABASE_URL ausente.');
  const cliente = new Client({ connectionString: url });
  await cliente.connect();

  const manifesto = manifestoVazio(new Date().toISOString());
  const gravar = () => {
    writeFileSync(caminhoDoManifesto, `${JSON.stringify(manifesto, null, 2)}\n`);
  };

  try {
    const linha = await marcaDoBanco(cliente);
    conferirMarca(linha?.marca);
    console.error(`banco de homologacao confirmado: ${String(linha.banco)}`);

    // ---------------------------------------------------------------- contas
    const sessoes = new Map();
    for (const conta of contas()) {
      const criada = await chamar('POST', '/auth/register', {
        corpo: {
          email: conta.email,
          password: senha,
          display_name: conta.displayName,
          birth_date: conta.birthDate,
          accepted_terms_version: conta.acceptedTermsVersion,
          handle: conta.handle,
        },
      });
      manifesto.users.push({ indice: conta.indice, id: criada.user.id, email: conta.email });
      manifesto.handles.push(conta.handle);
      gravar();

      // O token de verificacao, emitido aqui e consumido PELA ROTA. Ver o
      // cabecalho. 24 h de validade, o mesmo prazo que a rota emite.
      const bruto = randomBytes(32).toString('base64url');
      await cliente.query(
        `insert into verification_tokens (id, user_id, purpose, token_hash, sent_to, expires_at)
         values ($1, $2, 'email_verify', $3, $4, now() + interval '24 hours')`,
        [randomUUID(), criada.user.id, resumoComoAColunaGuarda(bruto), conta.email],
      );
      const confirmada = await chamar('POST', '/auth/email-verification/confirm', {
        corpo: { token: bruto },
      });
      if (confirmada.user.email_verified !== true) {
        throw new Error(`a conta ${conta.handle} nao ficou com e-mail verificado.`);
      }
      sessoes.set(conta.indice, confirmada.access_token);
      console.error(`conta ${conta.handle} criada e verificada`);
    }

    // ---------------------------------------------------------- localizacao
    // `PUT /v1/me/location`, que quantiza na grade de ~100 m do ADR-0006.
    let comPonto = 0;
    for (const conta of contas()) {
      if (!temCoordenada(conta.indice)) continue;
      const { lat, lon } = coordenadaDe(conta.indice);
      const origem = origemDaCoordenada(conta.indice);
      const gravada = await chamar('PUT', '/me/location', {
        token: sessoes.get(conta.indice),
        corpo: { lat, lon, source: origem },
      });
      if (gravada.lat !== lat || gravada.lon !== lon) {
        throw new Error(
          `a rota devolveu (${String(gravada.lat)}, ${String(gravada.lon)}) para `
          + `(${String(lat)}, ${String(lon)}): a massa nao estava na grade.`,
        );
      }
      manifesto.user_reference_locations_por_usuario.push(
        manifesto.users.find((u) => u.indice === conta.indice).id,
      );
      comPonto += 1;
    }
    gravar();
    console.error(`localizacao gravada em ${String(comPonto)} contas de ${String(contas().length)}`);

    // ------------------------------------------------------------------ pets
    const petsCriados = [];
    for (const pet of pets()) {
      const criado = await chamar('POST', '/pets', {
        token: sessoes.get(pet.contaIndice),
        corpo: {
          name: pet.name,
          species: pet.species,
          size: pet.size,
          sex: pet.sex,
          neutered: pet.neutered,
          distinctive_marks: pet.distinctive_marks,
        },
      });
      petsCriados.push({ ...pet, id: criado.id });
      manifesto.pets.push({ indice: pet.indice, id: criado.id, conta: pet.contaIndice });
      gravar();
    }
    console.error(`pets criados: ${String(petsCriados.length)}`);

    // ----------------------------------------------------- encontros da Rede
    for (const encontro of encontros(Date.now())) {
      const criado = await chamar('POST', '/network/events', {
        token: sessoes.get(encontro.contaIndice),
        corpo: {
          title: encontro.title,
          summary: encontro.summary,
          place: encontro.place,
          starts_at: encontro.starts_at,
          ends_at: encontro.ends_at,
          dog_age: encontro.dog_age,
          vaccination_required: encontro.vaccination_required,
          fenced_off_leash_area: encontro.fenced_off_leash_area,
          accepted_sizes: encontro.accepted_sizes,
          amenities: encontro.amenities,
          bring_items: encontro.bring_items,
          notes: encontro.notes,
        },
      });
      manifesto.network_events.push({ indice: encontro.indice, slug: criado.slug });
      gravar();
    }
    console.error(`encontros criados: ${String(manifesto.network_events.length)}`);

    // -------------------------------------------------- conversas e mensagens
    //
    // A CADEIA, e por que ela e esta:
    //   `conversations.found_report_id` e NOT NULL e UNIQUE, e nao existe
    //   `POST /conversations` -- o proprio servico diz que a abertura por aviso
    //   "e o unico caminho de criacao de conversa no sistema". Entao 30
    //   conversas exigem 30 avisos de achado distintos.
    //
    //   Dos dois caminhos de aviso, o de plaquinha e o unico que abre a
    //   conversa NA HORA. O avulso (`POST /v1/found-reports`) nasce com
    //   `conversation_id: null` e so vira conversa quando o tutor confirma uma
    //   correspondencia -- e ele e recusado com 429 a partir de 10 por conta em
    //   24 h, o que impediria 30 avisos de um mesmo achador.
    //
    //   `issuePetTag` tem teto POR PET (10 em 24 h) e teto de dominio de 5
    //   plaquinhas ativas por pet. Entao 6 pets da conta vitrine x 5
    //   plaquinhas = 30 plaquinhas, 30 avisos e 30 conversas, todas com
    //   `tutor_user_id` da MESMA conta -- que e o que torna a paginacao da
    //   lista de conversas testavel. Nenhum outro arranjo cabe nos tetos.
    //
    //   O aviso sai SEM `Authorization`: o `INSERT` da conversa exige
    //   `pets.owner_user_id IS DISTINCT FROM <achador>`, e um tutor que
    //   escaneia a plaquinha do proprio pet nao abre conversa nenhuma (zero
    //   linhas, em silencio).
    const petsDaVitrine = petsCriados.filter((p) => p.contaIndice === CONTA_VITRINE);
    if (petsDaVitrine.length !== PETS_DA_VITRINE) {
      throw new Error(`a conta vitrine ficou com ${String(petsDaVitrine.length)} pets.`);
    }
    const conversas = [];
    for (const pet of petsDaVitrine) {
      for (let k = 0; k < PLAQUINHAS_POR_PET; k += 1) {
        const plaquinha = await chamar('POST', `/pets/${pet.id}/tags`, {
          token: sessoes.get(CONTA_VITRINE),
          corpo: {},
        });
        manifesto.pet_tags.push({ id: plaquinha.id, pet: pet.id });
        manifesto.tag_scans_por_tag.push(plaquinha.id);
        gravar();

        const aviso = await chamar('POST', `/tags/${plaquinha.code}/found-reports`, {
          corpo: {},
          idempotencia: randomUUID(),
        });
        conversas.push({ indice: conversas.length + 1, finderToken: aviso.finder_token });
      }
    }

    // Os identificadores da conversa e do aviso saem da lista do tutor e do
    // banco: a resposta publica do aviso NAO devolve id de aviso nem de
    // conversa, de proposito (ela e lida por quem nao tem conta).
    const { rows: avisos } = await cliente.query(
      `select f.id as found_report_id, c.id as conversation_id
         from found_reports f
         join conversations c on c.found_report_id = f.id
         join pets p on p.id = f.pet_id
        where p.owner_user_id = $1 and f.origin = 'tag_scan'
        order by f.created_at`,
      [manifesto.users.find((u) => u.indice === CONTA_VITRINE).id],
    );
    for (const linhaDoAviso of avisos) {
      manifesto.found_reports.push(linhaDoAviso.found_report_id);
      manifesto.conversations.push(linhaDoAviso.conversation_id);
      manifesto.conversation_messages_por_conversa.push(linhaDoAviso.conversation_id);
    }
    gravar();
    if (manifesto.conversations.length !== conversas.length) {
      throw new Error(
        `abri ${String(conversas.length)} avisos e achei `
        + `${String(manifesto.conversations.length)} conversas.`,
      );
    }
    console.error(`conversas abertas: ${String(manifesto.conversations.length)}`);

    // A mensagem do TUTOR primeiro, em todas, e depois a do ACHADOR numa ordem
    // EMBARALHADA. Ver `ordemDaUltimaMensagem` em massa.mjs: e o que faz a
    // ordem da lista divergir da ordem de abertura, e sem divergencia a
    // ordenacao por ultima mensagem nao e testavel.
    for (let k = 0; k < manifesto.conversations.length; k += 1) {
      await chamar('POST', `/conversations/${manifesto.conversations[k]}/messages`, {
        token: sessoes.get(CONTA_VITRINE),
        corpo: { body: corpoDaMensagem(k + 1, 'tutor') },
      });
    }
    for (const indice of ordemDaUltimaMensagem(conversas.length)) {
      await chamar('POST', '/finder/conversation/messages', {
        token: conversas[indice - 1].finderToken,
        corpo: { body: corpoDaMensagem(indice, 'finder') },
      });
    }
    console.error('mensagens enviadas nas duas pontas');

    // ------------------------------------------------------ diretorio (INSERT)
    const agora = new Date().toISOString();
    for (const entrada of profissionais()) {
      const id = randomUUID();
      await cliente.query(
        `insert into professionals (
           id, kinds, entity_kind, display_name, about, city, state, neighborhood,
           geo, source, claim_status, claimed_by_user_id, claimed_at,
           verification_level, phone_e164, slug, status, published_at,
           created_at, updated_at
         ) values (
           $1, ARRAY[$2], $3, $4, $5, $6, $7, $8,
           case when $9::float8 is null then null
                else ST_SetSRID(ST_MakePoint($9::float8, $10::float8), 4326)::geography end,
           'import', 'unclaimed', null, null,
           'none', $11, $12, 'published', $13, $13, $13
         )`,
        [
          id, entrada.kind, entrada.entity_kind, entrada.display_name, entrada.about,
          entrada.city, entrada.state, entrada.neighborhood,
          // ST_MakePoint recebe X antes de Y: LONGITUDE primeiro. Trocar os dois
          // nao falha -- grava o Brasil no meio da Somalia.
          entrada.coordenada === null ? null : entrada.coordenada.lon,
          entrada.coordenada === null ? null : entrada.coordenada.lat,
          entrada.phone_e164, entrada.slug, agora,
        ],
      );
      manifesto.professionals.push({ indice: entrada.indice, id, slug: entrada.slug });
    }
    gravar();
    console.error(`entradas de diretorio criadas: ${String(manifesto.professionals.length)}`);

    // ----------------------------------------------------------- loja (INSERT)
    const idDoParceiro = randomUUID();
    await cliente.query(
      `insert into store_partners (id, slug, name, host, active, sort_order)
       values ($1, $2, $3, $4, true, 500)`,
      [idDoParceiro, PARCEIRO.slug, PARCEIRO.name, PARCEIRO.host],
    );
    manifesto.store_partners.push({ id: idDoParceiro, slug: PARCEIRO.slug });
    gravar();

    // Os pares categoria/subcategoria sao LIDOS do banco: a chave estrangeira
    // composta `store_items_subcategoria_e_da_categoria` cobra que o par
    // EXISTA, e par escrito a mao aqui reprovaria com 23503 no dia em que uma
    // subcategoria mudasse de categoria.
    const { rows: pares } = await cliente.query(
      `select s.category_code, s.code
         from store_subcategories s
         join store_categories c on c.code = s.category_code
        where s.active and c.active
        order by c.sort_order, s.sort_order
        limit 30`,
    );
    if (pares.length < 1) throw new Error('a semente da Loja nao trouxe subcategoria nenhuma.');
    for (const item of itensDaLoja()) {
      const par = pares[(item.indice - 1) % pares.length];
      const id = randomUUID();
      await cliente.query(
        `insert into store_items (
           id, slug, partner_id, title, summary, category, subcategory,
           target_path, price_amount, price_currency, price_checked_at,
           active, sort_order, published_at, created_at, updated_at
         ) values (
           $1, $2, $3, $4, $5, $6, $7, $8,
           $9, case when $9::int is null then null else 'BRL' end,
           case when $9::int is null then null else current_date end,
           true, $10, $11, $11, $11
         )`,
        [
          id, item.slug, idDoParceiro, item.title, item.summary,
          par.category_code, par.code, item.target_path,
          item.price_amount, item.sort_order, agora,
        ],
      );
      manifesto.store_items.push({ indice: item.indice, id, slug: item.slug });
    }
    gravar();
    console.error(`itens da Loja criados: ${String(manifesto.store_items.length)}`);

    // -------------------------------------------- a marca do lote na trilha
    //
    // `audit.events.actor_user_id` NAO tem chave estrangeira para `users`, e
    // isso e de proposito (migracao 20260917000004): esta linha SOBREVIVE ao
    // expurgo das contas da massa, e continua respondendo o que foi este lote
    // depois de a massa sair. `actor_kind = 'system'` porque nao foi pessoa
    // nenhuma -- e o CHECK `audit_events_ator_coerente` exige que
    // `actor_user_id` seja nulo nesse caso.
    const idDaTrilha = randomUUID();
    const contagem = {
      users: manifesto.users.length,
      pets: manifesto.pets.length,
      network_events: manifesto.network_events.length,
      professionals: manifesto.professionals.length,
      store_items: manifesto.store_items.length,
      store_partners: manifesto.store_partners.length,
      conversations: manifesto.conversations.length,
      found_reports: manifesto.found_reports.length,
      pet_tags: manifesto.pet_tags.length,
      handles: manifesto.handles.length,
      user_reference_locations: manifesto.user_reference_locations_por_usuario.length,
    };
    await cliente.query(
      `insert into audit.events (
         id, actor_kind, action, resource_kind, resource_id, after, metadata
       ) values ($1, 'system', 'massa_de_teste.lote_criado', 'lote_de_massa', $2, $3, $4)`,
      [
        idDaTrilha, LOTE, JSON.stringify(contagem),
        JSON.stringify({
          marca_visivel: '[teste]',
          dominio_dos_emails: DOMINIO_INVALIDO,
          prefixo_do_apelido: PREFIXO_ESTRUTURAL,
          manifesto: `infra/massa-de-homologacao/MANIFESTO-${LOTE}.json`,
          remocao: 'infra/massa-de-homologacao/remover.mjs',
          sem_imagem: true,
          sem_bloqueio_conexao_ou_denuncia: true,
        }),
      ],
    );
    manifesto.marcas.audit_event_id = idDaTrilha;
    gravar();

    // --------------------------------------------- conferencia de cobertura
    await conferirCobertura(cliente, manifesto);
    console.error('\ncobertura conferida: nada com marca de massa ficou fora do manifesto.');
    console.error(JSON.stringify(contagem, null, 2));
  } finally {
    await cliente.end();
  }
}

/**
 * A segunda fonte. Procura tudo que tem MARCA ESTRUTURAL e cobra do manifesto.
 *
 * Isto nao e redundancia: o manifesto e escrito por quem cria, e um caminho de
 * criacao que esquecesse de registrar deixaria linha invisivel para a remocao.
 * A consulta aqui nao sabe o que foi criado -- ela pergunta ao banco o que tem
 * cara de massa, e REPROVA se o manifesto nao cobrir.
 *
 * Os padroes de texto vivem AQUI e em lugar nenhum mais. Eles conferem; eles
 * nao apagam. `remover.mjs` nao tem nenhum `LIKE`.
 */
export async function conferirCobertura(cliente, manifesto) {
  const faltas = [];
  const conferir = async (rotulo, sql, parametros, idsDoManifesto) => {
    const { rows } = await cliente.query(sql, parametros);
    const conhecidos = new Set(idsDoManifesto.map(String));
    const sobrando = rows.map((r) => String(r.id)).filter((id) => !conhecidos.has(id));
    if (sobrando.length > 0) faltas.push(`${rotulo}: ${sobrando.join(', ')}`);
  };

  // O RECORTE E O PREFIXO, E NAO O DOMINIO. Medido em 19/10: homologacao JA
  // tinha 5 contas em `@exemplo-de-teste.invalid`, criadas por `medir-rotas.sh`
  // de outra sessao. O dominio `.invalid` diz "nao e endereco de pessoa"; ele
  // NAO diz "e deste lote". Conferir por dominio faria esta funcao reprovar
  // acusando massa alheia, e -- pior -- daria a impressao de que o dominio
  // sozinho delimita o lote na hora de apagar.
  await conferir(
    'users', 'select id from users where email like $1',
    [`${PREFIXO_ESTRUTURAL}%@${DOMINIO_INVALIDO}`],
    manifesto.users.map((u) => u.id),
  );
  await conferir(
    'handles', 'select handle as id from handles where handle like $1',
    [`${PREFIXO_ESTRUTURAL}%`], manifesto.handles,
  );
  await conferir(
    'professionals', 'select id from professionals where slug like $1',
    [`${PREFIXO_ESTRUTURAL}-%`], manifesto.professionals.map((p) => p.id),
  );
  await conferir(
    'store_items', 'select id from store_items where slug like $1',
    [`${PREFIXO_ESTRUTURAL}-%`], manifesto.store_items.map((i) => i.id),
  );
  await conferir(
    'store_partners', 'select id from store_partners where slug like $1',
    [`${PREFIXO_ESTRUTURAL}-%`], manifesto.store_partners.map((p) => p.id),
  );
  await conferir(
    'pets', 'select id from pets where owner_user_id = any($1::uuid[])',
    [manifesto.users.map((u) => u.id)], manifesto.pets.map((p) => p.id),
  );
  await conferir(
    'network_events', 'select slug as id from network_events where created_by_user_id = any($1::uuid[])',
    [manifesto.users.map((u) => u.id)], manifesto.network_events.map((e) => e.slug),
  );

  if (faltas.length > 0) {
    throw new Error(
      'REPROVA: ha linha com marca de massa FORA do manifesto. A remocao e feita\n'
      + 'pelo manifesto, entao o que esta fora dele nao sairia:\n  '
      + faltas.join('\n  '),
    );
  }
}

if (process.argv[1]?.endsWith('criar.mjs')) {
  principal().catch((erro) => {
    console.error(erro instanceof Error ? erro.message : String(erro));
    process.exit(1);
  });
}
