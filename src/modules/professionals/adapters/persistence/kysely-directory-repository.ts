/**
 * Persistencia do diretorio de `Perto`, em PostGIS.
 *
 * ## `status = 'published'` mora na clausula `WHERE`, e em lugar nenhum alem
 *
 * Mesmo desenho da autorizacao do ADR-0021, e pelo mesmo motivo: a diferenca
 * entre filtrar na consulta e filtrar depois aparece no dia em que alguem
 * esquece o `if`. Um `draft` e um cadastro que ninguem terminou; um `hidden` e
 * alguem que pediu para sair da vitrine; um `removed` e alguem que saiu. Os
 * tres na tela sao o mesmo defeito com tres nomes, e o unico jeito de nao
 * esquece-lo e ele nao ser um passo.
 *
 * `construtorDaListagem` existe para que isso seja **verificavel** em vez de
 * combinado: `publicado-na-clausula-where.test.ts` compila o SQL desta funcao,
 * le o predicado e carrega a isca que precisa reprovar.
 *
 * ## A busca por texto entra pela MESMA consulta, e nao por um caminho proprio
 *
 * `q` e mais um predicado de `construtorDaListagem`, junto de
 * `status = 'published'`. Nao ha consulta separada de busca, e a ausencia e
 * decisao: uma segunda consulta e um segundo lugar para esquecer o filtro de
 * publicacao, e busca e o caminho em que esquecer custa mais caro -- quem
 * digita um nome especifico ja sabe o nome e so quer saber se ele existe.
 *
 * A normalizacao de acento e caixa mora no BANCO (`texto_para_busca`, migracao
 * 20260922000009) porque o indice GIN de trigrama e construido sobre aquela
 * expressao: o predicado precisa ser identico a ela, caractere a caractere, ou
 * o planejador nao casa os dois e o indice deixa de ser usado sem que nada
 * acuse. Uma normalizacao em TypeScript seria a segunda definicao, e ela
 * divergiria ficando so lenta.
 *
 * ## O nivel de verificacao sai das VERIFICACOES, nao da coluna
 *
 * `professionals.verification_level` e cache derivado, e cache diverge. Quem
 * responde o que foi provado e `entity_verifications`, que e a fonte: a
 * consulta agrega as APROVADAS da entidade e o dominio deriva o nivel a partir
 * delas. Ler a coluna seria acreditar num numero que nenhuma rota de escrita
 * mantem hoje -- nao ha painel de moderacao.
 *
 * O filtro por nivel usa a MESMA regra, escrita em SQL como `EXISTS`: filtrar
 * pela coluna e exibir a derivacao faria a lista esconder o que mostra.
 *
 * ## A coordenada entra por SQL e nao sai por lugar nenhum
 *
 * `ST_Distance(p.geo, <ponto de quem chama>)` devolve **metros**, que e um
 * numero e nao uma posicao. `professionals.geo` nao esta em nenhuma das colunas
 * selecionadas, e `user_reference_locations.reference_point` tampouco: o ponto
 * de quem chama entra como subconsulta e o que atravessa a aplicacao e a
 * distancia.
 *
 * A subconsulta traz `expires_at > agora` junto: localizacao vencida e, para
 * todo efeito de produto, localizacao que nao existe (ADR-0006, 30 dias). Sem
 * linha valida, `ST_Distance` devolve nulo em todas as entradas -- e nulo vira
 * `distance_available: false` na borda, nunca zero.
 */
import { sql } from 'kysely';
import type { Db, DbExecutor } from '../../../../shared/db/pool.js';
import { comoData } from '../../../../shared/time/clock.js';
import type {
  EntradaDoDiretorio,
  TipoDeProfissional,
} from '../../domain/entrada-do-diretorio.js';
import type {
  DecisaoDaVerificacao,
  TipoDeEvidencia,
} from '../../domain/nivel-de-verificacao.js';
import type {
  DirectoryRepository,
  PaginaDoDiretorio,
  RecorteDoDiretorio,
} from '../../ports/directory-repository.js';
import type { Instant, UserId } from '../../../../shared/types/brands.js';

interface LinhaDaEntrada {
  slug: string;
  kind: TipoDeProfissional;
  display_name: string;
  about: string | null;
  city: string | null;
  state: string | null;
  neighborhood: string | null;
  phone_e164: string | null;
  evidencias: TipoDeEvidencia[] | null;
  distancia_em_metros: number | null;
}

/**
 * O ponto de referencia de quem chama, valido, como subconsulta.
 *
 * Subconsulta e nao junção porque o resultado e no maximo uma linha (a tabela
 * tem `user_id` como chave primaria) e porque assim a ausencia produz nulo em
 * vez de descartar a pagina inteira -- que e o que um `INNER JOIN` faria com
 * quem nunca informou onde mora.
 */
function pontoDeReferencia(chamador: UserId, agora: Instant) {
  return sql`(
    select reference_point
      from user_reference_locations
     where user_id = ${chamador}
       and expires_at > ${comoData(agora)}
  )`;
}

/**
 * As provas APROVADAS da entidade, como subconsulta agregada.
 *
 * `entity_kind = 'professional'` vai junto de `entity_id`: a tabela e
 * polimorfica de proposito e nao tem chave estrangeira, entao o tipo faz parte
 * da chave. Sem ele, uma verificacao de organizacao com o mesmo UUID passaria a
 * valer como prova de um profissional.
 */
const EVIDENCIAS_APROVADAS = sql<TipoDeEvidencia[] | null>`(
  select array_agg(v.evidence_kind)
    from entity_verifications v
   where v.entity_id = professionals.id
     and v.entity_kind = 'professional'
     and v.decision = 'approved'
)`;

/** `EXISTS` de prova aprovada de documento. E a mesma regra de `nivelDerivado`. */
const TEM_DOCUMENTO = sql<boolean>`EXISTS (
  select 1 from entity_verifications v
   where v.entity_id = professionals.id
     and v.entity_kind = 'professional'
     and v.decision = 'approved'
     and v.evidence_kind IN ('crmv', 'cnpj', 'document')
)`;

/** `EXISTS` de qualquer prova aprovada. Piso de `contact_verified`. */
const TEM_ALGUMA_PROVA = sql<boolean>`EXISTS (
  select 1 from entity_verifications v
   where v.entity_id = professionals.id
     and v.entity_kind = 'professional'
     and v.decision = 'approved'
)`;

function comoEntrada(l: LinhaDaEntrada): EntradaDoDiretorio {
  const aprovadas: DecisaoDaVerificacao = 'approved';
  return {
    slug: l.slug,
    kind: l.kind,
    displayName: l.display_name,
    about: l.about,
    city: l.city,
    state: l.state,
    neighborhood: l.neighborhood,
    phoneE164: l.phone_e164,
    // Toda evidencia que chega aqui ja passou pelo `decision = 'approved'` da
    // subconsulta. O campo e repetido porque o dominio nao acredita na consulta:
    // `nivelDerivado` filtra de novo, e e isso que faz a regra valer tambem em
    // memoria, onde o painel de moderacao vai chama-la.
    verificacoes: (l.evidencias ?? []).map((tipo) => ({
      evidenceKind: tipo,
      decision: aprovadas,
    })),
    distanciaEmMetros: l.distancia_em_metros,
  };
}

/** O recorte, com `status = 'published'` dentro da consulta. */
export function construtorDaListagem(db: DbExecutor, recorte: RecorteDoDiretorio) {
  let consulta = db.selectFrom('professionals').where('status', '=', 'published');

  // A BUSCA POR TEXTO CASA SOBRE O MESMO `where`, e isso e o ponto.
  //
  // Ela nao e um segundo caminho de leitura: e mais um predicado na consulta
  // que ja carrega `status = 'published'`. Quem busca por um nome especifico
  // esta testando se ele existe, entao um rascunho que aparecesse numa busca
  // responderia uma pergunta que ninguem tem direito de fazer -- e essa e a
  // forma mais provavel de vazamento desta rota, porque o resultado tem UMA
  // linha e o nome ja estava na cabeca de quem perguntou.
  //
  // `texto_para_busca` e `padrao_de_busca` sao do banco (migracao
  // 20260922000009) e nao ha equivalente em TypeScript de proposito: o lado
  // esquerdo desta comparacao precisa ser a MESMA expressao do indice GIN,
  // caractere a caractere, ou o planejador nao casa os dois. `padrao_de_busca`
  // tambem neutraliza `%`, `_` e `\` do termo, sem o que `q=%` devolve a
  // tabela inteira numa varredura completa.
  const busca = recorte.q?.trim();
  if (busca !== undefined && busca !== '') {
    consulta = consulta.where(
      sql<boolean>`texto_para_busca(professionals.display_name) LIKE padrao_de_busca(${busca})`,
    );
  }

  const cidade = recorte.city?.trim();
  if (cidade !== undefined && cidade !== '') {
    consulta = consulta.where(sql<boolean>`lower(city) = lower(${cidade})`);
  }
  const uf = recorte.state?.trim();
  if (uf !== undefined && uf !== '') {
    consulta = consulta.where(sql<boolean>`upper(state) = upper(${uf})`);
  }
  const bairro = recorte.neighborhood?.trim();
  if (bairro !== undefined && bairro !== '') {
    consulta = consulta.where(sql<boolean>`lower(neighborhood) = lower(${bairro})`);
  }
  if (recorte.kind !== undefined) {
    consulta = consulta.where('kind', '=', recorte.kind);
  }
  // O PISO, e nao a igualdade. Pedir `contact_verified` e pedir "pelo menos
  // contato", entao quem tem documento entra tambem: igualdade esconderia o
  // registro mais forte de quem pediu o mais fraco, que e o oposto do que a
  // pessoa quis dizer. `none` nao filtra nada, porque `none` ja e o piso.
  if (recorte.verificationLevel === 'document_verified') {
    consulta = consulta.where(TEM_DOCUMENTO);
  } else if (recorte.verificationLevel === 'contact_verified') {
    consulta = consulta.where(TEM_ALGUMA_PROVA);
  }
  return consulta;
}

export function criarDirectoryRepository(db: Db): DirectoryRepository {
  return {
    async listarPublicados(recorte: RecorteDoDiretorio): Promise<PaginaDoDiretorio> {
      const localizacao = await db
        .selectFrom('user_reference_locations')
        .select('user_id')
        .where('user_id', '=', recorte.chamador)
        .where('expires_at', '>', comoData(recorte.agora))
        .executeTakeFirst();

      const distanciaDisponivel = localizacao !== undefined && recorte.sort === 'distance';

      const ponto = pontoDeReferencia(recorte.chamador, recorte.agora);
      let pagina = construtorDaListagem(db, recorte).select([
        'slug',
        'kind',
        'display_name',
        'about',
        'city',
        'state',
        'neighborhood',
        'phone_e164',
        EVIDENCIAS_APROVADAS.as('evidencias'),
        sql<number | null>`ST_Distance(professionals.geo, ${ponto})`.as('distancia_em_metros'),
      ]);

      // Entrada sem coordenada vai para o fim com `NULLS LAST`, e nao some.
      // Excluir esconderia uma entrada publicada por causa de um campo que hoje
      // ninguem consegue preencher: nao ha painel de cadastro, e a ADR-0006
      // proibe derivar o ponto do bairro.
      pagina = distanciaDisponivel
        ? pagina.orderBy(sql`ST_Distance(professionals.geo, ${ponto}) asc nulls last`)
        : pagina;

      const itens = await pagina
        .orderBy('display_name')
        .limit(recorte.limit)
        .offset((recorte.page - 1) * recorte.limit)
        .execute();

      const contagem = await construtorDaListagem(db, recorte)
        .select(sql<string>`count(*)`.as('total'))
        .executeTakeFirstOrThrow();

      return {
        itens: (itens as unknown as LinhaDaEntrada[]).map(comoEntrada),
        total: Number(contagem.total),
        distanciaDisponivel,
      };
    },
  };
}
