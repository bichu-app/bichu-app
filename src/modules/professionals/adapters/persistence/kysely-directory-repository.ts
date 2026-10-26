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
import { canalDeContatoConfirmadoNoSql } from '../../../../shared/db/canal-de-contato-confirmado.js';
import { comoData } from '../../../../shared/time/clock.js';
import type {
  EnderecoComercial,
  EntradaDoDiretorio,
  TipoDeEntidade,
  TipoDeProfissional,
} from '../../domain/entrada-do-diretorio.js';
import type {
  DecisaoDaVerificacao,
  TipoDeEvidencia,
} from '../../domain/nivel-de-verificacao.js';
import type {
  AvaliacaoGravada,
  DirectoryRepository,
  LocalDoDiretorio,
  PaginaDeAvaliacoes,
  PaginaDoDiretorio,
  RecorteDasAvaliacoes,
  RecorteDoDiretorio,
} from '../../ports/directory-repository.js';
import type {
  AvaliacaoDoLocal,
  EntradaDaAvaliacao,
  MotivoDaDenuncia,
  PontuacaoDoLocal,
} from '../../domain/avaliacao-do-local.js';
import { PONTUACAO_VAZIA } from '../../domain/avaliacao-do-local.js';
import type { IdGenerator } from '../../../../shared/ports/id-generator.js';
import type { FamiliaDeSessao } from '../../../identity/ports/localizacao-de-referencia-repository.js';
import type { Instant, UserId } from '../../../../shared/types/brands.js';

interface LinhaDaEntrada {
  slug: string;
  kinds: TipoDeProfissional[];
  entity_kind: TipoDeEntidade;
  display_name: string;
  about: string | null;
  city: string | null;
  state: string | null;
  neighborhood: string | null;
  phone_e164: string | null;
  site_url: string | null;
  evidencias: TipoDeEvidencia[] | null;
  distancia_em_metros: number | null;
  logo_public_key: string | null;
}

/**
 * As quatro colunas de endereco, **so na linha do DETALHE**.
 *
 * Elas nao entram em `LinhaDaEntrada` de proposito: aquele tipo e o da
 * listagem, e `construtorDaListagem` nao as seleciona. Linha separada e o que
 * faz "a lista nao traz endereco" ser verificavel na consulta, e nao so uma
 * frase.
 */
interface LinhaDoEnderecoComercial {
  postal_code: string | null;
  street: string | null;
  street_number: string | null;
  complement: string | null;
}

function comoEnderecoComercial(l: LinhaDoEnderecoComercial): EnderecoComercial {
  return {
    postalCode: l.postal_code,
    street: l.street,
    streetNumber: l.street_number,
    complement: l.complement,
  };
}

/**
 * O ponto de referencia DESTE APARELHO de quem chama, valido, como subconsulta.
 *
 * Subconsulta e nao junção porque assim a ausencia produz nulo em vez de
 * descartar a pagina inteira -- que e o que um `INNER JOIN` faria com quem
 * nunca informou onde mora.
 *
 * ## A FAMILIA DE SESSAO NAO E DETALHE DE AUTORIZACAO AQUI: E O QUE MANTEM A SUBCONSULTA ESCALAR
 *
 * Esta funcao filtrava apenas por `user_id`, e isso era verdade quando `user_id`
 * era a chave primaria inteira da tabela. Desde a
 * `20260928000008_localizacao-de-referencia-por-aparelho` a chave e o PAR
 * `(user_id, session_family_id)` -- uma linha por aparelho --, e uma
 * subconsulta escalar que devolve duas linhas nao sai lenta nem imprecisa: o
 * Postgres levanta `more than one row returned by a subquery used as an
 * expression`, que sobe como 500. Como a pagina e a contagem chamam a mesma
 * funcao, a aba inteira caia para qualquer pessoa que tivesse entrado na conta
 * em dois aparelhos e informado onde estava. Medido em homologacao, 19/10/2026.
 *
 * O par e a chave primaria, entao com a familia no `WHERE` o resultado volta a
 * ser no maximo uma linha POR CONSTRUCAO -- e nao por um `LIMIT 1` que escolhe
 * um dos dois lugares sem ninguem ter decidido qual.
 *
 * ## E a MESMA regra do `GET` da propria localizacao, pela mesma razao
 *
 * `construtorDaLeitura` (`identity`) filtra por esta coluna de proposito: sem
 * ela, um aparelho leria o lugar que OUTRO aparelho da mesma conta informou.
 * Ordenar `Perto` a partir daquele lugar publicaria em metros exatamente o que
 * aquele `GET` se recusa a contar -- e foi medido tambem: conta recem-logada,
 * `GET /v1/me/location` devolvendo `null`, e o diretorio ainda assim medindo
 * distancia. Se algum dia o produto decidir que a lista deve usar qualquer
 * localizacao da conta, isso e decisao do cliente contra a SEC-021 e precisa de
 * `order by captured_at desc limit 1` escrito aqui -- nao e o que este
 * adaptador pode escolher sozinho.
 */
function pontoDeReferencia(chamador: UserId, familia: FamiliaDeSessao, agora: Instant) {
  return sql`(
    select reference_point
      from user_reference_locations
     where user_id = ${chamador}
       and session_family_id = ${familia}
       and expires_at > ${comoData(agora)}
  )`;
}

/**
 * O ponto de quem chama SEM aparelho conhecido: nenhum.
 *
 * Token anterior a emenda 1 do ADR-0002 nao carrega `sid`, e sem `sid` nao ha
 * de onde deduzir o aparelho. `null::geography` faz `ST_Distance` devolver nulo
 * em todas as entradas, que e o mesmo caminho de quem nunca informou onde mora
 * -- e nulo vira `distance_available: false` na borda, nunca zero. A conversao
 * explicita existe porque `null` cru deixaria `ST_Distance` ambiguo para o
 * Postgres.
 */
const SEM_PONTO = sql`null::geography`;

/** O ponto que vale para esta chamada: o do aparelho, ou nenhum. */
function pontoDoAparelho(chamador: UserId, familia: FamiliaDeSessao | undefined, agora: Instant) {
  return familia === undefined ? SEM_PONTO : pontoDeReferencia(chamador, familia, agora);
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

/**
 * A CHAVE DA DERIVADA de uma imagem da entrada, **so quando ela esta PRONTA**
 * (18/10/2026, com a liberacao das imagens do profissional no aplicativo).
 *
 * `status = 'ready'` dentro da subconsulta, e nao um `if` na projecao: o que o
 * aplicativo nao pode receber e uma chave que ainda nao existe no balde
 * publico, e a forma de garantir isso e nao selecionar a linha. Com `if` na
 * borda, qualquer leitura nova precisaria lembrar da regra.
 *
 * **`public_key`, nunca `original_key`.** A tabela `catalog_images` nao guarda
 * chave de original -- ela vive em `catalog_upload_intents.object_key`, que esta
 * consulta nao alcanca. Entao o original nao tem caminho ate aqui nem por
 * descuido, e `urlDaDerivada` confere a FORMA da chave do outro lado.
 */
function CHAVE_DA_DERIVADA(coluna: 'logo_image_id' | 'photo_image_id') {
  return sql<string | null>`(
  select c.public_key
    from catalog_images c
   where c.id = professionals.${sql.raw(coluna)}
     and c.status = 'ready'
)`;
}

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
    kinds: l.kinds,
    entityKind: l.entity_kind,
    displayName: l.display_name,
    about: l.about,
    city: l.city,
    state: l.state,
    neighborhood: l.neighborhood,
    phoneE164: l.phone_e164,
    siteUrl: l.site_url,
    // Toda evidencia que chega aqui ja passou pelo `decision = 'approved'` da
    // subconsulta. O campo e repetido porque o dominio nao acredita na consulta:
    // `nivelDerivado` filtra de novo, e e isso que faz a regra valer tambem em
    // memoria, onde o painel de moderacao vai chama-la.
    verificacoes: (l.evidencias ?? []).map((tipo) => ({
      evidenceKind: tipo,
      decision: aprovadas,
    })),
    distanciaEmMetros: l.distancia_em_metros,
    logoPublicKey: l.logo_public_key,
  };
}

/** O recorte, com `status = 'published'` dentro da consulta. */
export function construtorDaListagem(db: DbExecutor, recorte: RecorteDoDiretorio) {
  let consulta = db
    .selectFrom('professionals')
    .where('status', '=', 'published')
    // O TITULAR DESABILITADO SAI DO DIRETORIO.
    //
    // Decisao do cliente de 17/10: conta desabilitada "nao e mais encontrada em
    // nenhuma pagina ou funcionalidade". A entrada do diretorio E a pessoa --
    // `display_name`, `about`, `phone_e164` e o bairro dela saem nesta mesma
    // projecao --, entao e a superficie mais direta de todas.
    //
    // AQUI, e nao em `listarPublicados`: esta funcao e o unico caminho de
    // leitura do diretorio, e a contagem e a pagina a chamam as duas. Um
    // predicado posto so na pagina daria `total` maior que a lista, que e o
    // mesmo defeito do aviso do painel da Rede.
    //
    // `claimed_by_user_id` e o TITULAR, e e a coluna certa. A outra coluna de
    // usuario desta tabela e "quem CONVIDOU" (emenda 1 do ADR-0011): vinculo
    // entre duas pessoas, marcada "NUNCA sai do servidor", e filtrar por ela
    // esconderia o profissional legitimo porque QUEM O CONVIDOU saiu da
    // plataforma -- punindo o convidado pelo convite. `conta_habilitada`
    // (migracao `20261017000013`) devolve verdadeiro para nulo, entao a entrada
    // de `source = 'import'`, que o CHECK `professionals_aceite_antes_do_perfil`
    // deixa nascer sem titular, continua publicada.
    .where(sql<boolean>`conta_habilitada(professionals.claimed_by_user_id)`);

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

  // A CIDADE COMPARA POR `texto_para_busca`, E ISSO E UMA CORRECAO DE 19/10.
  //
  // Era `lower(city) = lower($1)`, que baixa a caixa e **nao tira o acento**.
  // Medido na homologacao com conta valida, antes da correcao:
  //
  //   GET /v1/directory/entries                  -> itens com "city":"São Paulo"
  //   GET /v1/directory/entries?city=Sao%20Paulo -> {"items":[],"total":0}
  //
  // Quem digita `Sao Paulo` sem til nao acha nada, e a tela mostra o estado
  // vazio -- "a secao ainda nao tem gente na sua regiao" --, que e a resposta
  // errada dita com confianca.
  //
  // A normalizacao e a MESMA da listagem publica de perdidos
  // (`texto_para_busca(lost_cases.last_seen_city) = texto_para_busca($1)`), e
  // nao uma segunda: a funcao e do banco (migracao `20260928000006`), e
  // IMMUTABLE, e por isso indexavel. Duas regras de comparacao de cidade no
  // mesmo produto divergem em silencio -- o perdido acharia e o diretorio
  // nao, na mesma cidade digitada do mesmo jeito.
  //
  // **A NORMALIZACAO E DA COMPARACAO, E NUNCA DA SAIDA.** A coluna `city`
  // continua sendo selecionada crua na projecao, e a resposta continua
  // devolvendo `"São Paulo"` com til: normalizar a saida devolveria
  // `sao paulo` minusculo e sem acento para a tela mostrar.
  const cidade = recorte.city?.trim();
  if (cidade !== undefined && cidade !== '') {
    consulta = consulta.where(
      sql<boolean>`texto_para_busca(professionals.city) = texto_para_busca(${cidade})`,
    );
  }
  const uf = recorte.state?.trim();
  if (uf !== undefined && uf !== '') {
    consulta = consulta.where(sql<boolean>`upper(state) = upper(${uf})`);
  }
  // O BAIRRO COMPARA POR `texto_para_busca`, PELO MESMO MOTIVO DA CIDADE.
  //
  // Era `lower(neighborhood) = lower($1)`, que baixa a caixa e **nao tira o
  // acento** -- o defeito identico ao da cidade logo acima, deixado de pe
  // quando ela foi corrigida porque o pedido daquele dia era so a cidade.
  //
  //   GET /v1/directory/entries                               -> "neighborhood":"Jardim América"
  //   GET /v1/directory/entries?neighborhood=Jardim%20America -> {"items":[],"total":0}
  //
  // Quem digita `Jardim America` sem acento nao acha `Jardim América`, e a
  // tela nao diz que o filtro falhou: ela desenha o estado vazio do recorte,
  // que AFIRMA que nao ha profissional naquele bairro.
  //
  // E A MESMA NORMALIZACAO DA LISTAGEM PUBLICA DE PERDIDOS, que ja comparava
  // bairro por `texto_para_busca(lost_cases.last_seen_neighborhood) =
  // texto_para_busca($1)` (`kysely-listagem-publica-de-perdidos.ts`). Ate
  // aqui o produto tinha DUAS regras de comparacao de bairro: o mesmo texto
  // digitado do mesmo jeito achava o pet perdido no bairro e nao achava o
  // veterinario dele.
  //
  // O indice e `professionals_bairro_normalizado` (migracao
  // 20261019000011), B-tree sobre `texto_para_busca(neighborhood)`. A
  // expressao aqui e a do indice, caractere a caractere; divergir deixa o
  // filtro CORRETO e LENTO, sem erro nenhum.
  // `professionals_publicados_por_lugar_texto`, em `(state, city,
  // neighborhood)` cru, nunca atendeu este predicado -- nenhum B-tree sobre a
  // coluna crua responde uma funcao sobre ela, e medido em 19/10 o plano de
  // `lower(neighborhood)` era Seq Scan.
  //
  // **A NORMALIZACAO E DA COMPARACAO, E NUNCA DA SAIDA.** A coluna
  // `neighborhood` continua selecionada crua na projecao, e a resposta
  // continua devolvendo `"Jardim América"` com acento: normalizar a saida
  // devolveria `jardim america` minusculo e sem acento para a tela mostrar.
  const bairro = recorte.neighborhood?.trim();
  if (bairro !== undefined && bairro !== '') {
    consulta = consulta.where(
      sql<boolean>`texto_para_busca(professionals.neighborhood) = texto_para_busca(${bairro})`,
    );
  }
  // ========================================================================
  // O FILTRO POR ATIVIDADE: PERTINENCIA, E NUNCA DESDOBRAMENTO
  // ========================================================================
  // `kinds` e uma lista desde a `20261020000015`, e o filtro deixou de ser
  // igualdade. A forma importa, e a forma errada nao reprova nada:
  //
  //   ERRADO: `unnest(professionals.kinds)` em `FROM`/`JOIN` com `SELECT`
  //           direto -- a linha se MULTIPLICA por quantas atividades ela tem. A
  //           clinica que tambem faz banho e tosa sairia DUAS vezes na mesma
  //           pagina, e `total` (que usa este mesmo construtor) contaria duas. A
  //           tela mostraria a duplicata e ninguem seria avisado.
  //
  //   CERTO:  `kinds @> ARRAY[...]` -- a linha e TESTADA, nao desdobrada, e sai
  //           UMA VEZ por mais atividades que tenha. O estabelecimento com tres
  //           atividades aparece nos tres chips, uma vez em cada.
  //
  // **`@>` E NAO `= ANY`, E A DIFERENCA E O INDICE.** As duas expressoes dao o
  // MESMO resultado, e foi por isso que a primeira versao disto usou `= ANY`:
  // ele se le melhor. Mas a classe de operadores `array_ops` de um GIN sobre
  // `text[]` indexa `@>`, `<@`, `&&` e `=`, e **nao indexa `= ANY`** -- o
  // planejador nao reescreve um no outro. Com `= ANY` a consulta ficava correta
  // e varria a tabela, com o indice
  // `professionals_publicados_por_atividade` (GIN parcial) ali do lado sem ser
  // usado. Defeito que nao reprova nada: so aparece no `EXPLAIN`.
  //
  // `kinds @> ARRAY['vet']` le-se "as atividades CONTEM veterinario", que e
  // exatamente a pergunta do chip.
  //
  // COMPARA ITEM INTEIRO, e e por isso que a coluna e lista e nao texto grudado
  // com separador: `'vet'` nunca casa dentro de `'vet_especialista'`.
  if (recorte.kind !== undefined) {
    consulta = consulta.where(sql<boolean>`professionals.kinds @> ARRAY[${recorte.kind}]::text[]`);
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


// ---------------------------------------------------------------------------
// A AVALIACAO DO LOCAL (18/10/2026)
// ---------------------------------------------------------------------------

/**
 * O recorte das avaliacoes que SAEM, num lugar so.
 *
 * **Os dois predicados andam juntos e e por isso que eles moram numa constante
 * e nao em cada consulta.** Tres consultas leem avaliacao -- a lista, a
 * pontuacao e a contagem -- e se o recorte for escrito tres vezes, duas delas
 * vao divergir: a tela mostraria "128 avaliacoes" sobre uma lista de 126, que e
 * o defeito classico desta classe.
 *
 * - `status = 'published'`: na clausula `WHERE` e nao num `if`, mesmo desenho
 *   do `status` da entrada (ADR-0021).
 * - `conta_habilitada(author_user_id)`: decisao do cliente de 17/10 -- conta
 *   desabilitada "nao e mais encontrada em nenhuma pagina ou funcionalidade".
 *   A funcao e da migracao `20261017000013` e e o **ponto unico** da definicao;
 *   um `innerJoin('users')` aqui seria a segunda definicao, e ela diverge no
 *   dia em que a regra mudar.
 *
 * A pontuacao usa `pontuacao_do_local(uuid)`, que carrega este MESMO par dentro
 * dela -- escrito na migracao, ao lado do indice que o atende.
 */
const AVALIACAO_VISIVEL = sql<boolean>`(
  professional_reviews.status = 'published'
  AND conta_habilitada(professional_reviews.author_user_id)
)`;

/**
 * O estado da conta para AVALIAR, pela mesma regua de criar encontro.
 *
 * **A regua vem da FONTE UNICA** (`canalDeContatoConfirmadoNoSql`, em
 * `shared/db/canal-de-contato-confirmado.ts`), e nao mais copiada de
 * `estadoParaCriarEncontro`: e-mail OU telefone verificado. Preenchido e nao
 * verificado nao conta. O cliente definiu a regra para criar evento ("so
 * usuarios com os dados validados conseguem criar eventos") e mandou aplicar a
 * mesma aqui -- entao ela e a mesma expressao, e nao uma segunda interpretacao
 * dela.
 *
 * **Na pratica isso e e-mail**, porque nada em `src/` grava
 * `phone_verified_at`: a coluna existe e so e zerada.
 */
const TEM_CANAL_VERIFICADO = (chamador: UserId) => sql<boolean>`EXISTS (
  SELECT 1 FROM users u
   WHERE u.id = ${chamador}::uuid
     AND ${canalDeContatoConfirmadoNoSql('u')}
)`;

interface LinhaDaPontuacao {
  media: string | null;
  quantidade: string;
  n1: string;
  n2: string;
  n3: string;
  n4: string;
  n5: string;
}

/**
 * `pontuacao_do_local` devolve `numeric` e `bigint`, que o driver entrega como
 * STRING. Converter aqui e nao no SQL e deliberado: `::float` no banco
 * reintroduziria ponto flutuante numa media que foi arredondada de proposito.
 *
 * **Media nula continua nula.** `Number(null)` e zero, e e justamente esse
 * acidente que esta funcao existe para nao deixar acontecer: zero se le como
 * "pessimo" e um local sem avaliacao nao e pessimo.
 */
function comoPontuacao(l: LinhaDaPontuacao | undefined): PontuacaoDoLocal {
  if (l === undefined) return PONTUACAO_VAZIA;
  const quantidade = Number(l.quantidade);
  return {
    media: l.media === null ? null : Number(l.media),
    quantidade,
    histograma: {
      1: Number(l.n1),
      2: Number(l.n2),
      3: Number(l.n3),
      4: Number(l.n4),
      5: Number(l.n5),
    },
  };
}

interface LinhaDaAvaliacao {
  ref: string;
  rating: number;
  body: string | null;
  author_display_name: string | null;
  created_at: Date;
  edited_at: Date | null;
  minha: boolean;
}

function comoAvaliacao(l: LinhaDaAvaliacao): AvaliacaoDoLocal {
  return {
    ref: l.ref,
    nota: l.rating,
    texto: l.body,
    nomeDeExibicaoDoAutor: l.author_display_name,
    criadaEm: l.created_at,
    editadaEm: l.edited_at,
    minha: l.minha,
  };
}

/** O `id` interno da entrada PUBLICADA com este slug, ou `undefined`. */
async function idDoLocalPublicado(db: DbExecutor, slug: string): Promise<string | undefined> {
  // `status = 'published'` na clausula `WHERE`, e nao um `if` depois de ler: um
  // rascunho ou um oculto alcancado por esta funcao viraria pagina no ar, e a
  // avaliacao de um perfil nao publicado seria a porta para avaliar o que
  // ninguem pode ver.
  const linha = await db
    .selectFrom('professionals')
    .select('id')
    .where('slug', '=', slug)
    .where('status', '=', 'published')
    .executeTakeFirst();
  return linha?.id;
}

function pontuacaoDe(db: DbExecutor, idDoLocal: string) {
  return sql<LinhaDaPontuacao>`SELECT * FROM pontuacao_do_local(${idDoLocal}::uuid)`.execute(db);
}

export function criarDirectoryRepository(db: Db, ids: IdGenerator): DirectoryRepository {
  /**
   * O `ref` publico da avaliacao: 128 bits de CSPRNG em base64url, 22
   * caracteres, exatamente o `CHECK` da migracao.
   *
   * Mesma forma de `upload_intents.upload_ref` e do pedido de plaquinha, e nao
   * um formato novo. **Sorteado e nunca derivado do autor nem do local**: um ref
   * derivado permitiria cruzar as avaliacoes de uma pessoa entre locais, que e
   * o vinculo entre duas pessoas que a BICHUS-174 proibe.
   */
  const novoRef = (): string => Buffer.from(ids.random128()).toString('base64url');

  return {
    async listarPublicados(recorte: RecorteDoDiretorio): Promise<PaginaDoDiretorio> {
      // A presenca pergunta pelo MESMO par que a subconsulta mede: perguntar
      // so por `user_id` diria "tem localizacao" por causa do outro aparelho, e
      // a resposta prometeria uma ordem por distancia que o ponto deste
      // aparelho nao tem como produzir.
      const localizacao =
        recorte.familia === undefined
          ? undefined
          : await db
              .selectFrom('user_reference_locations')
              .select('user_id')
              .where('user_id', '=', recorte.chamador)
              .where('session_family_id', '=', recorte.familia)
              .where('expires_at', '>', comoData(recorte.agora))
              .executeTakeFirst();

      const distanciaDisponivel = localizacao !== undefined && recorte.sort === 'distance';

      const ponto = pontoDoAparelho(recorte.chamador, recorte.familia, recorte.agora);
      let pagina = construtorDaListagem(db, recorte).select([
        'slug',
        'kinds',
        'entity_kind',
        'display_name',
        'about',
        'city',
        'state',
        'neighborhood',
        'phone_e164',
        'site_url',
        EVIDENCIAS_APROVADAS.as('evidencias'),
        sql<number | null>`ST_Distance(professionals.geo, ${ponto})`.as('distancia_em_metros'),
        // A LOGO, e SO a logo. `photo_image_id` nao e selecionado aqui de
        // proposito: a faixa de 1280 x 720 em vinte cartoes multiplicaria o peso
        // da primeira pintura da lista. A coluna nem chega a esta projecao.
        CHAVE_DA_DERIVADA('logo_image_id').as('logo_public_key'),
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

    async lerLocalPublicado(
      slug: string,
      chamador: UserId,
      familia: FamiliaDeSessao | undefined,
      agora: Instant,
    ): Promise<LocalDoDiretorio | undefined> {
      const ponto = pontoDoAparelho(chamador, familia, agora);
      // `status = 'published'` no `WHERE`: rascunho, oculto e removido caem no
      // mesmo `undefined`, que a borda traduz em 404. Distinguir confirmaria a
      // existencia do endereco a quem nao tem direito de saber (ADR-0021).
      const linha = await db
        .selectFrom('professionals')
        .select([
          'id',
          'slug',
          'kinds',
          'entity_kind',
          'display_name',
          'about',
          'city',
          'state',
          'neighborhood',
          'phone_e164',
          'site_url',
          EVIDENCIAS_APROVADAS.as('evidencias'),
          sql<number | null>`ST_Distance(professionals.geo, ${ponto})`.as('distancia_em_metros'),
          // AS DUAS no detalhe: a logo entra pela projecao comum da entrada, a
          // foto em faixa sai em campo proprio de `LocalDoDiretorio`.
          CHAVE_DA_DERIVADA('logo_image_id').as('logo_public_key'),
          CHAVE_DA_DERIVADA('photo_image_id').as('photo_public_key'),
          // O ENDERECO COMERCIAL, **so aqui** (cliente, 21/10/2026). As quatro
          // colunas existem desde `20261018000001` e nenhuma consulta as lia.
          // `construtorDaListagem` continua sem elas: a lista responde "onde
          // fica" com bairro, cidade e UF, e e o detalhe que responde "e ali".
          'postal_code',
          'street',
          'street_number',
          'complement',
        ])
        .where('slug', '=', slug)
        .where('status', '=', 'published')
        .executeTakeFirst();

      if (linha === undefined) return undefined;

      const { rows } = await pontuacaoDe(db, linha.id);

      // A MINHA avaliacao e o CANAL VERIFICADO na mesma consulta, e nao em duas:
      // as duas respostas decidem a mesma tela, e a pessoa esta esperando nela.
      //
      // A minha aparece AINDA QUE a minha conta estivesse desabilitada -- o
      // predicado aqui e so `status`. Esconder de alguem a propria avaliacao
      // faria o botao oferecer "avaliar" sobre uma linha que existe, e o `PUT`
      // atualizaria em vez de criar, contra o que a tela prometeu.
      const minha = await db
        .selectFrom('professional_reviews')
        .select('ref')
        .where('professional_id', '=', linha.id)
        .where('author_user_id', '=', chamador)
        .where('status', '=', 'published')
        .executeTakeFirst();

      const canal = await sql<{ tem_canal: boolean }>`
        SELECT ${TEM_CANAL_VERIFICADO(chamador)} AS tem_canal
      `.execute(db);

      return {
        entrada: comoEntrada(linha as unknown as LinhaDaEntrada),
        pontuacao: comoPontuacao(rows[0]),
        refDaMinhaAvaliacao: minha?.ref ?? null,
        podeAvaliar: canal.rows[0]?.tem_canal ?? false,
        fotoPublicKey: linha.photo_public_key,
        // Sem `as`: a linha do detalhe JA tem as quatro colunas no tipo que o
        // Kysely deduz do `select`. O `as unknown as` de `comoEntrada`, logo
        // acima, existe por outro motivo (`kinds` e `evidencias` chegam como
        // agregados), e copia-lo aqui esconderia um erro de nome de coluna.
        enderecoComercial: comoEnderecoComercial(linha),
      };
    },

    async listarAvaliacoes(r: RecorteDasAvaliacoes): Promise<PaginaDeAvaliacoes | undefined> {
      const idDoLocal = await idDoLocalPublicado(db, r.slug);
      if (idDoLocal === undefined) return undefined;

      // `leftJoin` em `users` para o NOME DE EXIBICAO, e so para ele. Nenhuma
      // outra coluna de `users` e selecionada, e nenhum identificador de conta
      // atravessa esta consulta: a BICHUS-174 proibe expor vinculo entre duas
      // pessoas, e o nome sem endereco navegavel nao e vinculo.
      //
      // `left` e nao `inner`: conta sem nome e estado normal e a avaliacao nao
      // pode desaparecer por isso. Quem FILTRA conta desabilitada e
      // `AVALIACAO_VISIVEL`, que usa `conta_habilitada` -- nao esta juncao.
      let consulta = db
        .selectFrom('professional_reviews')
        .leftJoin('users', 'users.id', 'professional_reviews.author_user_id')
        .select([
          'professional_reviews.ref as ref',
          'professional_reviews.rating as rating',
          'professional_reviews.body as body',
          'users.display_name as author_display_name',
          'professional_reviews.created_at as created_at',
          'professional_reviews.edited_at as edited_at',
          sql<boolean>`professional_reviews.author_user_id = ${r.chamador}::uuid`.as('minha'),
        ])
        .where('professional_reviews.professional_id', '=', idDoLocal)
        .where(AVALIACAO_VISIVEL);

      // `created_at desc` e o desempate de TODAS as ordens, inclusive das de
      // nota: sem ele, duas avaliacoes de nota 5 saem em ordem indefinida, e a
      // pagina 2 pode repetir ou perder uma linha que a pagina 1 ja mostrou --
      // o defeito de paginacao sem ordem total.
      consulta =
        r.sort === 'rating_desc'
          ? consulta.orderBy('professional_reviews.rating', 'desc').orderBy('professional_reviews.created_at', 'desc')
          : r.sort === 'rating_asc'
            ? consulta.orderBy('professional_reviews.rating', 'asc').orderBy('professional_reviews.created_at', 'desc')
            : consulta.orderBy('professional_reviews.created_at', 'desc');

      const itens = await consulta
        .limit(r.limit)
        .offset((r.page - 1) * r.limit)
        .execute();

      // A contagem usa o MESMO `AVALIACAO_VISIVEL`, e e por isso que ela
      // concorda com `pontuacao_do_local`: o recorte e um so, em uma constante.
      const contagem = await db
        .selectFrom('professional_reviews')
        .select(sql<string>`count(*)`.as('total'))
        .where('professional_reviews.professional_id', '=', idDoLocal)
        .where(AVALIACAO_VISIVEL)
        .executeTakeFirstOrThrow();

      return {
        itens: (itens as unknown as LinhaDaAvaliacao[]).map(comoAvaliacao),
        total: Number(contagem.total),
      };
    },

    async temCanalVerificadoParaAvaliar(chamador: UserId): Promise<boolean> {
      // O MESMO fragmento de `gravarMinhaAvaliacao`, e nao um segundo
      // predicado escrito a mao: duas definicoes de "canal verificado"
      // divergiriam na primeira vez que a regra mudasse.
      const canal = await sql<{ tem_canal: boolean }>`
        SELECT ${TEM_CANAL_VERIFICADO(chamador)} AS tem_canal
      `.execute(db);
      return canal.rows[0]?.tem_canal === true;
    },

    async gravarMinhaAvaliacao(
      slug: string,
      chamador: UserId,
      entrada: EntradaDaAvaliacao,
      agora: Instant,
    ): Promise<AvaliacaoGravada | 'local-ausente' | 'sem-canal-verificado'> {
      const idDoLocal = await idDoLocalPublicado(db, slug);
      if (idDoLocal === undefined) return 'local-ausente';

      const canal = await sql<{ tem_canal: boolean }>`
        SELECT ${TEM_CANAL_VERIFICADO(chamador)} AS tem_canal
      `.execute(db);
      if (canal.rows[0]?.tem_canal !== true) return 'sem-canal-verificado';

      const quando = comoData(agora);

      // UM `INSERT ... ON CONFLICT DO UPDATE`, e nao "le, decide, escreve".
      //
      // **A regra "uma por pessoa por local" e do INDICE e nao deste codigo.**
      // Com `SELECT` antes de `INSERT`, dois toques simultaneos no botao passam
      // os dois pelo `SELECT` vazio e o segundo `INSERT` quebra com violacao de
      // unicidade na cara de quem usa. O `ON CONFLICT` faz o banco decidir, e
      // ele e o unico que ve as duas transacoes.
      //
      // O conflito e sobre `(professional_id, author_user_id)`, o indice
      // INCONDICIONAL: assim um `removed` pela moderacao tambem e atualizado em
      // vez de permitir uma segunda linha -- remocao nao pode ser o caminho
      // para reescrever do zero.
      //
      // `ref` e `created_at` NAO sao tocados na atualizacao: o endereco publico
      // da avaliacao nao muda quando o texto muda (links e denuncias
      // existentes continuariam valendo), e `created_at` e a data em que ela
      // apareceu -- sobrescreve-la poria uma avaliacao antiga reeditada no topo
      // de "mais recentes" como se fosse nova.
      //
      // `edited_at` recebe a hora SO quando a linha ja existia, e o
      // `xmax <> 0` e como se sabe disso num `ON CONFLICT`: na insercao `xmax`
      // e zero.
      const gravada = await sql<{ ref: string; created_at: Date; edited_at: Date | null; criada: boolean }>`
        INSERT INTO professional_reviews
          (id, ref, professional_id, author_user_id, rating, body, created_at, status)
        VALUES
          (${ids.uuidv7()}::uuid, ${novoRef()}, ${idDoLocal}::uuid, ${chamador}::uuid,
           ${entrada.nota}, ${entrada.texto}, ${quando}::timestamptz, 'published')
        ON CONFLICT (professional_id, author_user_id) DO UPDATE SET
          rating            = EXCLUDED.rating,
          body              = EXCLUDED.body,
          edited_at         = ${quando}::timestamptz,
          -- A EDICAO PRESERVA O ESTADO DE MODERACAO, e nao devolve a linha ao
          -- ar. Reeditar nao desfaz uma remocao: se desfizesse, remover seria
          -- inutil, porque bastaria ao autor editar para voltar a aparecer.
          status            = professional_reviews.status,
          moderation_reason = professional_reviews.moderation_reason,
          moderated_at      = professional_reviews.moderated_at
        RETURNING ref, created_at, edited_at, (xmax = 0) AS criada
      `.execute(db);

      const linha = gravada.rows[0];
      if (linha === undefined) throw new Error('avaliacao nao foi gravada');

      const { rows } = await pontuacaoDe(db, idDoLocal);

      // O nome de exibicao de quem acabou de escrever, para a resposta montar a
      // avaliacao inteira sem uma segunda leitura da lista.
      const autor = await db
        .selectFrom('users')
        .select('display_name')
        .where('id', '=', chamador)
        .executeTakeFirst();

      return {
        avaliacao: {
          ref: linha.ref,
          nota: entrada.nota,
          texto: entrada.texto,
          nomeDeExibicaoDoAutor: autor?.display_name ?? null,
          criadaEm: linha.created_at,
          editadaEm: linha.edited_at,
          minha: true,
        },
        criada: linha.criada,
        pontuacao: comoPontuacao(rows[0]),
      };
    },

    async apagarMinhaAvaliacao(slug: string, chamador: UserId): Promise<boolean> {
      const idDoLocal = await idDoLocalPublicado(db, slug);
      if (idDoLocal === undefined) return false;

      // AUTORIZACAO NA CLAUSULA `WHERE` (ADR-0021), e nao num ramo de
      // permissao: `author_user_id = chamador`. Nao existe caminho em que esta
      // consulta alcance a avaliacao de outra pessoa -- e a rota nem aceita
      // identificador de avaliacao, entao nao ha o que passar.
      //
      // IDEMPOTENTE: zero linhas apagadas tambem e `true`. O estado pedido ("eu
      // nao tenho avaliacao aqui") e o estado final, e um erro faria a tela
      // tratar como falha um toque duplo no botao.
      await db
        .deleteFrom('professional_reviews')
        .where('professional_id', '=', idDoLocal)
        .where('author_user_id', '=', chamador)
        .execute();
      return true;
    },

    async denunciarAvaliacao(
      slug: string,
      ref: string,
      chamador: UserId,
      denuncia: { motivo: MotivoDaDenuncia; detalhe: string | null },
      agora: Instant,
    ): Promise<'enfileirada' | 'ausente' | 'propria'> {
      const idDoLocal = await idDoLocalPublicado(db, slug);
      if (idDoLocal === undefined) return 'ausente';

      // O `ref` E conferido contra o LOCAL do caminho, e nao usado solto: sem
      // isso, `/directory/entries/<qualquer-um>/reviews/<ref>/reports`
      // denunciaria a avaliacao de outro local, e um 404 por local errado
      // deixaria de ser verdade.
      //
      // `AVALIACAO_VISIVEL` tambem entra: denunciar o que nao esta no ar nao
      // tem alvo, e responder outra coisa que 404 revelaria que aquele ref
      // existiu e foi removido.
      const alvo = await db
        .selectFrom('professional_reviews')
        .select(['id', 'author_user_id'])
        .where('ref', '=', ref)
        .where('professional_id', '=', idDoLocal)
        .where(AVALIACAO_VISIVEL)
        .executeTakeFirst();

      if (alvo === undefined) return 'ausente';
      // Quem quer tirar a sua do ar usa o `DELETE`, que e a porta certa e
      // imediata. Enfileirar a propria para moderacao humana gastaria atencao
      // que e recurso escasso.
      if (alvo.author_user_id === chamador) return 'propria';

      const quando = comoData(agora);

      // DENUNCIAR DE NOVO NAO DUPLICA A FILA e nao e erro: incrementa. Erro
      // ensinaria a quem denuncia que ele ja denunciou, o que nao e informacao
      // dele e nao muda nada. Mesmo desenho de `conversation_reports`.
      //
      // `reason` e `detail` SAO atualizados: a segunda denuncia costuma ser a
      // mais informada, e guardar a primeira descartaria o que a pessoa
      // aprendeu. `created_at` nao muda -- a fila e lida pela ordem de chegada.
      await sql`
        INSERT INTO professional_review_reports
          (id, review_id, reporter_user_id, reason, detail, created_at, last_reported_at)
        VALUES
          (${ids.uuidv7()}::uuid, ${alvo.id}::uuid, ${chamador}::uuid,
           ${denuncia.motivo}, ${denuncia.detalhe},
           ${quando}::timestamptz, ${quando}::timestamptz)
        ON CONFLICT (review_id, reporter_user_id) DO UPDATE SET
          reason           = EXCLUDED.reason,
          detail           = EXCLUDED.detail,
          repeat_count     = professional_review_reports.repeat_count + 1,
          last_reported_at = EXCLUDED.last_reported_at
      `.execute(db);

      return 'enfileirada';
    },
  };
}
