/**
 * O conjunto EXATO de valores que cada lista fechada do banco aceita.
 *
 * ===========================================================================
 * POR QUE ESTE ARQUIVO EXISTE
 * ===========================================================================
 * Em 22/09 "sair de todos os aparelhos" ficou quebrado em produção por vinte
 * horas. O banco recusava com `23514` porque `logout_all` não estava na
 * restrição CHECK de `refresh_tokens.revoked_reason`: uma migração aplicou
 * subida e descida juntas, a restrição voltou à forma antiga, e a migração
 * ficou registrada como aplicada com sucesso. O `COMMENT ON COLUMN` da coluna
 * continuou de pé, prometendo o valor que o banco recusava.
 *
 * Esse detalhe decide a forma deste arquivo. Um portão genérico que exigisse
 * apenas "o esquema mudou depois da migração" NÃO teria pego o caso: o
 * `COMMENT` sobreviveu, o esquema mudou, e a migração passaria. O mecanismo que
 * pega é afirmar o CONJUNTO, inteiro e exato.
 *
 * Exato quer dizer nos dois sentidos, e o segundo é o que ninguém olha:
 *
 * - valor que SAI da restrição reprova — foi o defeito de 22/09;
 * - valor que ENTRA sem ninguém declarar reprova também. Um CHECK que aceita
 *   mais do que deveria é tão defeito quanto um que aceita menos. Ele não
 *   quebra nada hoje, e é exatamente por isso que atravessa revisão: a
 *   implementação se afasta do domínio declarado sem nenhum alarme.
 *
 * ===========================================================================
 * TRÊS DECISÕES DE FORMA, E O MOTIVO DE CADA UMA
 * ===========================================================================
 * 1. **A descoberta é no BANCO, nunca nas migrações.** A lição de 22/09 é
 *    literalmente essa: o arquivo dizia uma coisa e o banco tinha outra. Ler o
 *    arquivo para descobrir o que conferir reproduz o defeito que este arquivo
 *    veio impedir. Quem responde o que existe é `pg_constraint`.
 *
 * 2. **O esperado está escrito aqui, por extenso.** Derivar o esperado do
 *    próprio banco compara o banco com ele mesmo e fica verde com qualquer
 *    coisa. Um registro que se gera sozinho não é registro, é eco.
 *
 * 3. **Restrição que aparece sem entrada aqui REPROVA, nomeando.** O defeito
 *    que se quer impedir é o silêncio: CHECK novo entra, ninguém declara,
 *    ninguém vê. Por isso a classificação é mecânica e cobre as duas formas —
 *    a lista fechada simples e todo o resto que mencione literal de texto.
 *    Uma lista fechada escrita à mão como `col = 'a' OR col = 'b'` não vira
 *    `ANY (ARRAY[...])` no catálogo e escaparia de um portão que só procurasse
 *    a forma simples; ela cai no segundo registro, onde a definição inteira
 *    está fixada e alguém precisa escrevê-la para o arquivo ficar verde.
 *
 * Como rodar: `npm run test:integration`, de dentro do worktree. A pilha é
 * efêmera e migra do zero, que é o que faz este arquivo significar alguma
 * coisa: ele afirma o esquema que as migrações PRODUZEM, e não o que elas
 * dizem produzir.
 */
import assert from 'node:assert/strict';
import { after, before, describe, it } from 'node:test';
import { Client } from 'pg';

/** Os mesmos esquemas de produto que `esquema.test.ts` inspeciona. */
const ESQUEMAS_DO_PRODUTO = ['public', 'audit'];

interface ListaFechada {
  /** A coluna que a restrição fecha. Confirmada contra o catálogo. */
  readonly coluna: string;
  /**
   * O conjunto INTEIRO de valores aceitos, escrito à mão. A ordem não importa
   * (a comparação é de conjunto); a completude importa nos dois sentidos.
   */
  readonly valores: readonly string[];
}

/**
 * Toda restrição CHECK de lista fechada do banco, pela chave
 * `esquema.tabela.nome_da_restrição`.
 *
 * Acrescentar valor a um domínio é mudar esta tabela junto com a migração. É
 * de propósito: o passo extra é o único momento em que alguém olha para o
 * conjunto inteiro em vez de para o valor que está acrescentando.
 */
const LISTAS_FECHADAS: Readonly<Record<string, ListaFechada>> = {
  'public.alert_dispatches.alert_dispatches_estado': {
    coluna: 'reach_status',
    // `EstadoDoDisparo` em `src/modules/lostfound/domain/disparo-do-alerta.ts`,
    // espelhado em `src/shared/db/schema.ts`. Os quatro são estados distintos e
    // nenhum é substituível por outro: `computed` traz número, `unavailable` é
    // "não conseguimos contar", `queued` é "ainda não contamos" e
    // `no_location` é "não existe raio, o caso não tem coordenada".
    valores: ['computed', 'unavailable', 'queued', 'no_location'],
  },
  'audit.events.events_actor_kind_check': {
    coluna: 'actor_kind',
    valores: ['user', 'anonymous', 'system'],
  },
  'public.conversation_messages.conversation_messages_sender_role_conhecido': {
    coluna: 'sender_role',
    // `Papel` em `src/modules/messaging/domain/conversa-mediada.ts`, e
    // `PapelNaConversa` em `src/shared/db/schema.ts`. `system` está aqui e
    // **não** em `conversations.blocked_by_role`: mensagem o sistema escreve,
    // bloqueio ele não exerce.
    valores: ['tutor', 'finder', 'system'],
  },
  'public.entity_verifications.entity_verifications_decision_check': {
    coluna: 'decision',
    valores: ['pending', 'approved', 'rejected'],
  },
  'public.entity_verifications.entity_verifications_entity_kind_check': {
    coluna: 'entity_kind',
    // Polimórfica por desenho (ADR-0011 emenda 1): a ONG da parceria de adoção
    // é a primeira entidade não-profissional, e foi para ela que 'organization'
    // entrou. Ver o caso de `entity_id` sem FK em `esquema.test.ts`.
    valores: ['professional', 'organization'],
  },
  'public.entity_verifications.entity_verifications_evidence_kind_check': {
    coluna: 'evidence_kind',
    valores: ['crmv', 'cnpj', 'phone_callback', 'document'],
  },
  // BICHUS-66. As duas listas fechadas da transferencia de pet. Escritas POR
  // EXTENSO e a mao: derivar do proprio banco compararia o banco com ele mesmo.
  'public.pet_transfers.pet_transfers_status_conhecido': {
    coluna: 'status',
    // `StatusDaTransferencia` em
    // `src/modules/transfers/domain/janela-da-transferencia.ts`, espelhado em
    // `src/shared/db/schema.ts`. Os cinco sao distintos: `accepted` e o UNICO
    // que carrega prazo -- dele para `effective` passam 24 h em que nada foi
    // revogado --, e `expired` e "ninguem aceitou em 72 h", que nao e a mesma
    // coisa que `cancelled`, "alguem desfez".
    valores: ['pending_acceptance', 'accepted', 'effective', 'cancelled', 'expired'],
  },
  'public.found_reports.found_reports_origin_check': {
    coluna: 'origin',
    valores: ['tag_scan', 'stray_report'],
  },
  'public.found_reports.found_reports_status': {
    coluna: 'status',
    // O `status` do `FoundReport` no contrato, e o mesmo tipo em
    // `src/modules/found/domain/registro-de-achado.ts` e em `schema.ts`. Hoje o
    // código só ESCREVE `open` (`kysely-found-report-repository.ts`, literal no
    // `INSERT`): `matched` e `closed` são escritos pela decisão do candidato,
    // que ainda não tem rota. Estão declarados porque o domínio é o do
    // contrato, e não o do que já foi construído — tirá-los daqui obrigaria a
    // uma migração no dia em que a rota entrar.
    valores: ['open', 'matched', 'closed'],
  },
  'public.jobs.jobs_status_check': {
    coluna: 'status',
    valores: ['pending', 'running', 'done', 'failed'],
  },
  'public.lost_cases.lost_cases_closure_channel_check': {
    coluna: 'closure_channel',
    valores: ['tag_scan', 'bichu_alert', 'poster_or_link', 'on_my_own', 'other'],
  },
  'public.lost_cases.lost_cases_closure_outcome_check': {
    coluna: 'closure_outcome',
    valores: ['reunited', 'not_found', 'false_alarm'],
  },
  'public.lost_cases.lost_cases_status_check': {
    coluna: 'status',
    valores: ['open', 'closed_reunited', 'closed_not_found', 'closed_false_alarm'],
  },
  'public.match_candidates.match_candidates_origem_do_vinculo': {
    coluna: 'link_origin',
    // `Sugestao.linkOrigin` em `src/modules/found/domain/cruzamento.ts`. Os dois
    // valores são os dois caminhos da seção 4.10: o cruzamento por atributos e
    // o vizinho que chegou pelo push e disse "vi este pet" (score 1,0, sem
    // cruzamento — e ainda assim sujeito à confirmação humana).
    valores: ['attribute_match', 'share_token'],
  },
  'public.match_candidates.match_candidates_status': {
    coluna: 'status',
    // `suggested` é o único que o código escreve, e é literal no `INSERT` de
    // `kysely-found-report-repository.ts` de propósito: `Sugestao` não tem campo
    // de status, então o cruzamento não consegue nomear outro valor. `confirmed`
    // e `rejected` são da decisão do tutor, que `match_candidates_decisao_tem_
    // autor` obriga a trazer pessoa e instante.
    valores: ['suggested', 'confirmed', 'rejected'],
  },
  'public.notification_deliveries.notification_deliveries_record_type_check': {
    coluna: 'record_type',
    // Vocabulário do Postmark, e por isso em CamelCase: são os valores que
    // chegam no webhook, não uma convenção nossa. Espelhado em
    // `src/modules/notifications/domain/evento-de-entrega.ts` e no `RecordType`
    // da especificação OpenAPI.
    valores: ['Delivery', 'Bounce', 'SpamComplaint', 'Open', 'SubscriptionChange'],
  },
  'public.pet_photos.pet_photos_status_check': {
    coluna: 'status',
    valores: ['processing', 'ready', 'rejected'],
  },
  'public.pet_tags.pet_tags_revocation_reason_check': {
    coluna: 'revocation_reason',
    valores: [
      'lost_tag',
      'suspected_clone',
      'owner_request',
      'pet_transferred',
      'pet_deceased',
      'pet_deleted',
    ],
  },
  'public.pet_tags.pet_tags_status_check': {
    coluna: 'status',
    // ADR-0004: dois valores, e só dois. Não há tag suspensa nem tag fabricada.
    valores: ['active', 'revoked'],
  },
  'public.pets.pets_sex_check': {
    coluna: 'sex',
    valores: ['male', 'female', 'unknown'],
  },
  'public.pets.pets_status_check': {
    coluna: 'status',
    valores: ['active', 'lost', 'deceased', 'archived'],
  },
  'public.professionals.professionals_claim_status_check': {
    coluna: 'claim_status',
    valores: ['unclaimed', 'claim_pending', 'claimed', 'disputed'],
  },
  'public.professionals.professionals_kind_check': {
    coluna: 'kind',
    valores: ['vet', 'groomer', 'walker', 'sitter', 'trainer', 'clinic'],
  },
  // BICHUS-185 / BICHUS-189. A categoria do produto da vitrine. Espelha
  // `CategoriaDaVitrine` em `src/modules/store/domain/item-da-vitrine.ts` e o
  // `enum` `StoreCategory` do contrato -- os tres arquivos que o ADR-0023
  // secao 3 exige no mesmo commit.
  'public.store_items.store_items_categoria': {
    coluna: 'category',
    valores: ['food', 'toy', 'hygiene', 'accessory', 'health', 'bed'],
  },
  // A `Rede` (ADR-0027 12.3 e apendice A.4). Tres arquivos no mesmo commit,
  // como o ADR-0023 secao 3 exige: a migracao, esta entrada e o `enum` do
  // contrato -- que, para estas duas colunas, e o de `AdminNetworkEvent` em
  // `/admin/network/*` (ADR-0027), e nao o da leitura publica, que nao as
  // projeta. `pending_review` nao esta no `enum` administrativo de proposito:
  // o encontro da comunidade nao existe na v1, e o `CHECK`
  // `network_events_revisao_so_da_comunidade` impede o administrador de cair
  // nele.
  'public.network_events.network_events_origem_conhecida': {
    coluna: 'origin',
    valores: ['admin', 'community'],
  },
  'public.network_events.network_events_publicacao_conhecida': {
    coluna: 'publication_status',
    valores: ['pending_review', 'published', 'cancelled', 'removed'],
  },
  'public.professionals.professionals_source_check': {
    coluna: 'source',
    // 'community' foi NEGADO pelo cliente em 21/09. Reintroduzir aqui seria
    // desfazer a decisão dele, e não corrigir um esquecimento. O caso de
    // `esquema.test.ts` cobra a ausência; aqui ela vale pelo conjunto.
    valores: ['self', 'invited', 'import'],
  },
  'public.professionals.professionals_status_check': {
    coluna: 'status',
    valores: ['draft', 'published', 'hidden', 'removed'],
  },
  'public.professionals.professionals_verification_level_check': {
    coluna: 'verification_level',
    valores: ['none', 'contact_verified', 'document_verified'],
  },
  'public.ref_sizes.ref_sizes_code_check': {
    coluna: 'code',
    valores: ['P', 'M', 'G', 'GG'],
  },
  'public.ref_species.ref_species_code_check': {
    coluna: 'code',
    valores: ['dog', 'cat', 'other'],
  },
  'public.reauth_tokens.reauth_tokens_escopo': {
    coluna: 'scope',
    // As seis finalidades de `X-Reauth-Token` (BICHUS-48). Espelha `ReauthScope`
    // em `src/shared/http/route-definition.ts`, o enum de `scope` em
    // `POST /auth/reauth` no contrato e o tipo da coluna em
    // `src/shared/db/schema.ts`. Os quatro precisam andar juntos.
    //
    // `email_change` e `session_revocation` sao os dois que entraram. O
    // primeiro porque `POST /me/email-change` ja exigia o cabecalho e o enum do
    // contrato nao tinha o valor: a operacao era inalcancavel. O segundo porque
    // `POST /auth/logout-all` passou a exigir a janela.
    //
    // `password_change` NAO esta aqui, e a ausencia e a divergencia registrada
    // na BICHUS-48 contra a secao 7.5 de `docs/04-seguranca.md`. Acrescenta-lo
    // sem a decisao do cliente faria `PUT /auth/password` pedir a mesma senha
    // duas vezes na mesma requisicao.
    valores: [
      'account_deletion',
      'email_change',
      'data_export',
      'pet_transfer',
      'tag_revocation',
      'session_revocation',
    ],
  },
  'public.refresh_tokens.refresh_tokens_revoked_reason_check': {
    coluna: 'revoked_reason',
    // O DEFEITO DE 22/09 MORA AQUI. `logout_all` é o valor que a rota de "sair
    // de todos os aparelhos" grava; ele sumiu desta restrição por uma migração
    // que aplicou subida e descida juntas, e a rota passou a receber 23514 do
    // banco enquanto o `COMMENT ON COLUMN` continuava prometendo o valor.
    //
    // Espelha `MotivoDeRevogacao` em
    // `src/modules/identity/ports/identity-repository.ts` e o tipo da coluna em
    // `src/shared/db/schema.ts`. Os três precisam andar juntos.
    valores: [
      'rotation',
      'reuse_detected',
      'logout',
      'logout_all',
      'password_changed',
      'account_deleted',
      // BICHUS-215. O QUINTO gatilho do SEC-006, que o documento lista desde
      // sempre e que a restrição não tinha: "sair de todos, troca de senha,
      // redefinição, 'Não fui eu' e exclusão de conta".
      //
      // Não é `logout_all` reaproveitado, e o motivo é o mesmo que separou
      // `logout` de `logout_all` (emenda 1 do ADR-0002): `logout_all` é o
      // titular arrumando a casa, `not_me` é alguém declarando que a conta está
      // com outra pessoa. Também não é `reuse_detected`, que é a detecção
      // automática de UMA família; este é a resposta HUMANA a ela, e derruba a
      // conta inteira.
      'not_me',
    ],
  },
  'public.upload_intents.upload_intents_kind_check': {
    coluna: 'kind',
    valores: ['pet_photo', 'found_report_photo', 'finder_photo'],
  },
  'public.user_devices.user_devices_permissao': {
    coluna: 'push_permission',
    // Três valores, e `not_asked` é DISTINTO de `denied` (critério 2 da
    // BICHUS-91): a linha de "permissão negada" só aparece para quem
    // respondeu não. Juntar os dois apagaria a diferença entre quem recusou e
    // quem ainda não foi perguntado, que é a métrica de alcance honesta do
    // ADR-0008. Espelha `push_permission` em `src/shared/db/schema.ts`.
    valores: ['granted', 'denied', 'not_asked'],
  },
  'public.user_devices.user_devices_plataforma': {
    coluna: 'platform',
    // `Device.platform` do contrato. Não há `web`: o produto é aplicativo, e
    // um terceiro valor aqui entraria com a tela que o produzisse.
    valores: ['android', 'ios'],
  },
  'public.user_identities.user_identities_provider_check': {
    coluna: 'provider',
    valores: ['local', 'google', 'apple', 'keycloak'],
  },
  'public.user_reference_locations.user_reference_locations_origem': {
    coluna: 'source',
    valores: ['device_gps', 'map_pin'],
  },
  'public.user_roles.user_roles_role_check': {
    coluna: 'role',
    // Capacidade é conjunto, não ordem: esta lista não declara hierarquia, e
    // nenhuma rota deve resolver permissão comparando posições dela.
    valores: ['tutor', 'moderator', 'admin'],
  },
  'public.users.users_account_kind_check': {
    coluna: 'account_kind',
    valores: ['person', 'organization'],
  },
  'public.users.users_status_check': {
    coluna: 'status',
    valores: ['active', 'suspended', 'deletion_requested'],
  },
  'public.verification_tokens.verification_tokens_purpose_check': {
    coluna: 'purpose',
    // `session_disavow` é o link do "Não fui eu" (BICHUS-215), e é o único
    // propósito que NÃO leva a pessoa a digitar nada: ele derruba as sessões e
    // acaba. Reusar a tabela em vez de criar outra foi decisão — ela já é uso
    // único com prazo, hash no lugar do valor e HMAC do IP de emissão, e uma
    // segunda implementação disso seria a segunda chance de errar o consumo
    // atômico. Espelha `PropositoDoToken` em
    // `src/modules/identity/ports/identity-repository.ts` e o tipo da coluna em
    // `src/shared/db/schema.ts`. Os três precisam andar juntos.
    valores: ['email_verify', 'password_reset', 'email_change', 'session_disavow'],
  },
};

/**
 * O segundo registro: todo CHECK que menciona literal de texto e NÃO é uma
 * lista fechada simples.
 *
 * Ele existe para fechar o silêncio, e não para documentar regra de negócio. A
 * definição está fixada inteira porque é isso que obriga quem acrescentar uma
 * restrição a escrevê-la aqui — inclusive a lista fechada disfarçada de
 * `col = 'a' OR col = 'b'`, que o catálogo não normaliza para `ANY (ARRAY[…])`
 * e que passaria batido num portão que só procurasse a forma simples.
 *
 * O texto é o que `pg_get_constraintdef` devolve, não o que a migração
 * escreveu. Diferença entre os dois é o defeito de 22/09 em outra coluna.
 */
const CHECKS_QUE_NAO_SAO_LISTA_FECHADA: Readonly<Record<string, string>> = {
  // ------------------------------------------------------------------
  // A secao `Rede` (ADR-0025, migracao 20260923000001, emendada pela secao
  // 12 do ADR-0027).
  //
  // Os abaixo sao os CHECKs da `Rede` que MENCIONAM literal de texto e nao
  // sao lista fechada simples. Os de faixa numerica e comparacao entre colunas
  // (`..._titulo_tem_tamanho`, `..._resumo_tem_tamanho`,
  // `..._lugar_tem_tamanho`, `..._bairro_tem_tamanho`,
  // `..._cidade_tem_tamanho`, `..._nota_de_cancelamento_tem_tamanho`,
  // `..._versao_positiva`, `..._ponto_anda_com_origem` e
  // `network_events_fim_depois_do_comeco`) nao tem literal de texto, a
  // classificacao do cabecalho nao os colhe, e declara-los aqui faria o caso
  // "restricao declarada que o banco nao tem mais" reprovar.
  //
  // As duas listas fechadas da secao (`origin` e `publication_status`) estao
  // em LISTAS_FECHADAS. `status` (`upcoming` / `happening` / `ended` /
  // `cancelled`) continua **nao sendo coluna**: e calculado na projecao, no
  // servidor, porque um rotulo gravado envelhece sozinho.
  // ------------------------------------------------------------------
  //
  // Formato do endereco publico, COPIADO de `pets.slug` e identico ao de
  // `store_items`. `slug` e unico ao lado de `id uuid` primaria (ADR-0024).
  'public.network_events.network_events_slug_formato':
    "CHECK ((slug ~ '^[a-z0-9][a-z0-9-]{1,28}[a-z0-9]$'::text))",
  // Duas maiusculas, e so. Nao e lista fechada das 27 UFs de proposito:
  // enumera-las poria o domicilio politico do Brasil numa restricao de banco,
  // que muda por lei e nao por migracao. O formato e o que o cartao precisa
  // para caber.
  'public.network_events.network_events_uf_tem_duas_letras':
    "CHECK ((state ~ '^[A-Z]{2}$'::text))",
  // A FORMA do nome IANA, e so a forma. Que a zona EXISTA e conferido pelo
  // gatilho `network_events_fuso_existe`, e a divisao de trabalho e deliberada:
  // consultar `pg_timezone_names` nao e imutavel, e o Postgres recusa funcao
  // volatil em restricao -- um CHECK com ela nem chega a ser criado.
  //
  // Os dois juntos sao o que separa `America/Sao_Paulo` de `America/Sao_Pualo`,
  // que passa na forma e renderiza a hora errada para sempre sem nada acusar.
  'public.network_events.network_events_fuso_tem_forma_iana':
    "CHECK ((time_zone ~ '^[A-Za-z]+/[A-Za-z_]+$'::text))",
  // https e nao http, pela mesma razao da vitrine: imagem em claro numa tela
  // nossa e uma recomendacao nossa de abrir canal aberto. A capa e opcional, e
  // a ausencia e estado normal e nao lacuna -- o cartao sabe se desenhar sem
  // ela, e a massa tem os dois casos de proposito.
  'public.network_events.network_events_capa_e_https':
    "CHECK (((cover_image_url IS NULL) OR (cover_image_url ~ '^https://'::text)))",
  // A origem do ponto: so `map_pin`, a que o ADR-0006 admite e a unica que um
  // operador produz tocando o mapa. Nao ha geocodificacao. Uma lista de um
  // valor so escrita como igualdade, e nao como `IN`, por isso mora aqui.
  'public.network_events.network_events_origem_do_ponto':
    "CHECK (((geo_source IS NULL) OR (geo_source = 'map_pin'::text)))",
  // Cancelado tem o instante do cancelamento.
  'public.network_events.network_events_cancelado_tem_instante':
    "CHECK (((publication_status <> 'cancelled'::text) OR (cancelled_at IS NOT NULL)))",
  // O que e visivel foi publicado algum dia: `published_at` e a primeira
  // publicacao, e o cancelado tambem a tem.
  'public.network_events.network_events_visivel_foi_publicado':
    "CHECK (((publication_status <> ALL (ARRAY['published'::text, 'cancelled'::text])) OR (published_at IS NOT NULL)))",
  // So o encontro da comunidade espera revisao (ADR-0027 13.5): e esta linha
  // que torna "o ponto de evento da comunidade so aparece depois de revisao
  // humana" um estado do banco, porque `pending_review` nunca e visivel.
  'public.network_events.network_events_revisao_so_da_comunidade':
    "CHECK (((origin = 'community'::text) OR (publication_status <> 'pending_review'::text)))",

  // ------------------------------------------------------------------
  // A vitrine da `Loja` (BICHUS-185 / BICHUS-189, migracao 20260922000009).
  // Nenhum destes e lista fechada: sao formato, faixa e coerencia entre
  // colunas. O unico conjunto fechado da vitrine e `store_items_categoria`,
  // que esta em LISTAS_FECHADAS.
  // ------------------------------------------------------------------
  //
  // CINCO CHECKS DA VITRINE **NAO** ESTAO AQUI, E A AUSENCIA E DELIBERADA.
  //
  // `store_items_preco_anda_completo`, `store_items_preco_e_positivo`,
  // `store_items_resumo_tem_tamanho`, `store_items_titulo_tem_tamanho` e
  // `store_partners_nome_tem_tamanho` foram declarados aqui e **reprovaram**:
  // nenhum deles menciona literal de texto, entao `MENCIONA_LITERAL` nao casa,
  // o classificador nunca os poe em `naoSimples`, e eles ficavam como entrada
  // fantasma -- declarada aqui e inexistente para o portao.
  //
  // O estrago nao era so a reprovacao. `cada CHECK nao-lista tem exatamente a
  // definicao declarada` faz `naoSimples.get(chave)` e, achando `undefined`,
  // segue adiante com `continue`. A entrada PARECIA fixar a definicao e nao
  // fixava nada: o portao cobrava a coisa errada, em silencio, que e
  // exatamente a classe que este arquivo existe para fechar.
  //
  // Os dois registros deste arquivo cobrem CHECK com literal de texto: o
  // primeiro a lista fechada simples, o segundo todo o resto que mencione
  // literal. Faixa numerica e coerencia entre colunas nao sao dominio de
  // valores e nao pertencem a nenhum dos dois. Quem responde por elas e a
  // propria migracao, e o caso de banco que tenta violar cada uma.
  //
  // **Nao reponha estas cinco aqui.** Repor devolve a reprovacao e, pior,
  // devolve o silencio do `continue`.
  //
  // `BRL` no MVP. Nao e lista fechada de verdade -- e um valor unico com a
  // forma de uma --, e por isso mora aqui: declara-lo como conjunto faria o
  // registro prometer uma lista que nao existe.
  'public.store_items.store_items_moeda':
    "CHECK (((price_currency IS NULL) OR (price_currency = 'BRL'::text)))",
  // Formato do endereco publico, COPIADO de `pets.slug`. Nao ha UUID nestas
  // duas tabelas: `slug` e a chave primaria, porque elas so existem para sair
  // em resposta publica (ADR-0010 item 6).
  'public.store_items.store_items_slug_formato':
    "CHECK ((slug ~ '^[a-z0-9][a-z0-9-]{1,28}[a-z0-9]$'::text))",
  'public.store_partners.store_partners_slug_formato':
    "CHECK ((slug ~ '^[a-z0-9][a-z0-9-]{1,28}[a-z0-9]$'::text))",
  // https e nao http: o destino e uma pagina de comercio, e um link em claro
  // numa vitrine nossa e uma recomendacao nossa de digitar dado em canal
  // aberto.
  'public.store_items.store_items_destino_e_https':
    "CHECK ((target_url ~ '^https://'::text))",
  'public.store_items.store_items_imagem_e_https':
    "CHECK (((image_url IS NULL) OR (image_url ~ '^https://'::text)))",
  // So o HOST, sem esquema, caminho nem consulta. Guardar a URL inteira
  // convidaria um parametro a viajar junto, e parametro em link de saida e
  // onde dado pessoal vaza (consequencia 3 da BICHUS-185).
  'public.store_partners.store_partners_host_e_so_host':
    "CHECK ((host ~ '^[a-z0-9]([a-z0-9-]*[a-z0-9])?(\\.[a-z0-9]([a-z0-9-]*[a-z0-9])?)+$'::text))",
  'audit.events.audit_events_ator_coerente':
    "CHECK (((actor_kind = 'user'::text) = (actor_user_id IS NOT NULL)))",
  // O par mentiroso do alcance: estado não calculado com número, ou `computed`
  // sem número. `kysely-registro-de-disparos.ts` grava `null` em
  // `recipients_total` para `unavailable`, e é este CHECK que impede o inverso.
  'public.alert_dispatches.alert_dispatches_total_so_quando_calculado':
    "CHECK (((reach_status = 'computed'::text) = (recipients_total IS NOT NULL)))",
  'public.conversation_messages.conversation_messages_redactions_array':
    "CHECK ((jsonb_typeof(redactions) = 'array'::text))",
  // Mensagem de sistema não tem remetente humano: um `sender_user_id` numa
  // linha `system` faria o aviso de golpe parecer escrito pelo tutor.
  // `gravarMensagemDeSistema` força `senderUserId: null`, e aqui o banco cobra.
  'public.conversation_messages.conversation_messages_sistema_sem_remetente':
    "CHECK (((sender_role <> 'system'::text) OR (sender_user_id IS NULL)))",
  // Papel, e não id: o achador pode não ter conta. `system` NÃO entra — o
  // sistema escreve mensagem, não bloqueia ninguém.
  'public.conversations.conversations_blocked_by_role_conhecido':
    "CHECK (((blocked_by_role IS NULL) OR (blocked_by_role = ANY (ARRAY['tutor'::text, 'finder'::text]))))",
  // `MotivoDeEncerramento` em
  // `src/modules/messaging/ports/conversation-repository.ts`.
  'public.conversations.conversations_closure_reason_conhecida':
    "CHECK (((closure_reason IS NULL) OR (closure_reason = ANY (ARRAY['case_closed'::text, 'pet_returned'::text, 'retention'::text]))))",
  // `MotivoDeRetencao` em
  // `src/modules/messaging/domain/retencao-para-revisao.ts`, que é a única
  // função que produz estes dois valores.
  'public.conversations.conversations_held_reason_conhecido':
    "CHECK (((held_reason IS NULL) OR (held_reason = ANY (ARRAY['message_volume'::text, 'serial_finder'::text]))))",
  'public.entity_verifications.entity_verifications_decidida_tem_quando':
    "CHECK ((((decision = 'pending'::text) AND (reviewed_at IS NULL)) OR ((decision <> 'pending'::text) AND (reviewed_at IS NOT NULL))))",
  'public.entity_verifications.entity_verifications_motivo_so_com_recusa':
    "CHECK (((rejection_reason IS NULL) OR (decision = 'rejected'::text)))",
  // Os cinco `found_reports_avulso_*` e o `found_reports_scan_*` são a mesma
  // regra escrita dos dois lados: cada linha carrega exatamente a autorização e
  // os dados do caminho por onde ela entrou. O avulso exige conta, atributos,
  // lugar e prazo; o scan exige token, tag e pet. Nenhum dos dois exige o do
  // outro, e é por isso que `found_reports` pode ser uma tabela só.
  //
  // `required: [species, size, found_at]` do `StrayFoundReportInput`; `found_at`
  // já é `NOT NULL` desde 17/09.
  'public.found_reports.found_reports_avulso_tem_atributos':
    "CHECK (((origin <> 'stray_report'::text) OR ((species IS NOT NULL) AND (size IS NOT NULL))))",
  // `createStrayFoundReport` exige `bearerAuth`, e quem autoriza é
  // `reporter_user_id`. Sem conta não há a quem responder nem de quem cobrar o
  // teto.
  'public.found_reports.found_reports_avulso_tem_conta':
    "CHECK (((origin <> 'stray_report'::text) OR (reporter_user_id IS NOT NULL)))",
  // O `anyOf: [location, area]` do contrato. Achado sem ponto E sem cidade não
  // passa por filtro nenhum da seção 4.10: ficaria guardado 30 dias sem poder
  // virar candidato de nada.
  'public.found_reports.found_reports_avulso_tem_onde':
    "CHECK (((origin <> 'stray_report'::text) OR (found_point IS NOT NULL) OR (found_city IS NOT NULL)))",
  // Achado avulso sem prazo de guarda é a linha que o expurgo nunca acha.
  'public.found_reports.found_reports_avulso_tem_prazo':
    "CHECK (((origin <> 'stray_report'::text) OR (retention_until IS NOT NULL)))",
  // Os três atributos de cruzamento repetem o domínio de `ref_species`,
  // `ref_sizes` e `pets.sex`, e são anuláveis porque quem acha um animal na rua
  // não sabe quase nada dele. Não são lista fechada de coluna por causa do
  // `IS NULL` na frente, e a definição inteira é o que vale.
  'public.found_reports.found_reports_especie':
    "CHECK (((species IS NULL) OR (species = ANY (ARRAY['dog'::text, 'cat'::text, 'other'::text]))))",
  'public.found_reports.found_reports_porte':
    "CHECK (((size IS NULL) OR (size = ANY (ARRAY['P'::text, 'M'::text, 'G'::text, 'GG'::text]))))",
  'public.found_reports.found_reports_scan_tem_tag_e_pet':
    "CHECK (((origin <> 'tag_scan'::text) OR ((tag_id IS NOT NULL) AND (pet_id IS NOT NULL))))",
  // O aviso vindo do QR continua endereçado pelo token: sem ele o achador perde
  // a conversa e o tutor perde o único canal de volta. As duas colunas deixaram
  // de ser `NOT NULL` em 22/09, e este CHECK é o que impede que isso afrouxe o
  // caminho da tag.
  'public.found_reports.found_reports_scan_tem_token':
    "CHECK (((origin <> 'tag_scan'::text) OR ((finder_token_hash IS NOT NULL) AND (finder_token_expires_at IS NOT NULL))))",
  'public.found_reports.found_reports_sexo':
    "CHECK (((sex IS NULL) OR (sex = ANY (ARRAY['male'::text, 'female'::text, 'unknown'::text]))))",
  'public.local_credentials.local_credentials_phc_pbkdf2_sha512':
    "CHECK ((password_phc ~~ '$pbkdf2-sha512$%'::text))",
  'public.lost_cases.lost_cases_canal_so_com_reencontro':
    "CHECK (((closure_channel IS NULL) OR (closure_outcome = 'reunited'::text)))",
  'public.lost_cases.lost_cases_encerrado_tem_desfecho':
    "CHECK ((((status = 'open'::text) AND (closure_outcome IS NULL) AND (closed_at IS NULL)) OR ((status <> 'open'::text) AND (closure_outcome IS NOT NULL) AND (closed_at IS NOT NULL))))",
  // A CONFIRMAÇÃO HUMANA ESCRITA EM DDL (critério 7 da BICHUS-35). Sair de
  // `suggested` exige uma pessoa e um instante, e o cruzamento não tem nenhum
  // dos dois: `Sugestao` não tem campo de status e o `INSERT` escreve
  // `'suggested'` como literal. A segunda metade importa tanto quanto a
  // primeira — sem ela, uma linha decidida poderia voltar a `suggested`
  // mantendo o autor da decisão anterior, e a trilha passaria a mentir.
  'public.match_candidates.match_candidates_decisao_tem_autor':
    "CHECK ((((status = 'suggested'::text) AND (decided_by_user_id IS NULL) AND (decided_at IS NULL)) OR ((status = ANY (ARRAY['confirmed'::text, 'rejected'::text])) AND (decided_by_user_id IS NOT NULL) AND (decided_at IS NOT NULL))))",
  'public.pet_photos.pet_photos_pronta_tem_derivadas':
    "CHECK (((status <> 'ready'::text) OR ((thumb_key IS NOT NULL) AND (card_key IS NOT NULL))))",
  'public.pet_photos.pet_photos_recusada_tem_motivo':
    "CHECK (((status <> 'rejected'::text) OR (rejection_reason IS NOT NULL)))",
  'public.pet_tags.pet_tags_code_suffix_alfabeto':
    "CHECK ((code_suffix ~ '^[0-9A-HJKMNP-TV-Z]{4}$'::text))",
  'public.pet_tags.pet_tags_revogacao_e_completa':
    "CHECK ((((status = 'revoked'::text) AND (revoked_at IS NOT NULL) AND (revocation_reason IS NOT NULL)) OR ((status = 'active'::text) AND (revoked_at IS NULL) AND (revocation_reason IS NULL))))",
  'public.pet_tags.pet_tags_revogada_nao_guarda_o_codigo':
    "CHECK (((status = 'active'::text) OR (code_ciphertext IS NULL)))",
  'public.pets.pets_care_notes_redactions_array':
    "CHECK ((jsonb_typeof(care_notes_redactions) = 'array'::text))",
  'public.pets.pets_slug_formato':
    "CHECK (((slug IS NULL) OR (slug ~ '^[a-z0-9][a-z0-9-]{1,28}[a-z0-9]$'::text)))",
  // Lista fechada DENTRO de uma condicional: `breed_code` só admite os três
  // códigos "outro" quando há texto livre. Não é domínio de coluna, e por isso
  // não entra no primeiro registro — a definição inteira é que vale.
  'public.pets.pets_texto_livre_so_com_codigo_outro':
    "CHECK (((breed_free_text IS NULL) OR ((breed_code IS NOT NULL) AND (breed_code = ANY (ARRAY['outro_dog'::text, 'outro_cat'::text, 'outro_other'::text])))))",
  'public.professionals.professionals_aceite_antes_do_perfil':
    "CHECK (((source = 'import'::text) OR (claim_status <> 'unclaimed'::text)))",
  'public.professionals.professionals_cnpj_tamanho':
    "CHECK (((cnpj IS NULL) OR (cnpj ~ '^[0-9]{14}$'::text)))",
  // O endereco publico da entrada do diretorio. Formato COPIADO de
  // `pets_slug_formato`: os dois sao endereco publico do mesmo produto, e dois
  // formatos diferentes para a mesma coisa e o defeito que a duplicacao produz.
  'public.professionals.professionals_slug_formato':
    "CHECK (((slug IS NULL) OR (slug ~ '^[a-z0-9][a-z0-9-]{1,28}[a-z0-9]$'::text)))",
  'public.professionals.professionals_telefone_formato':
    "CHECK (((phone_e164 IS NULL) OR (phone_e164 ~ '^\\+[1-9][0-9]{7,14}$'::text)))",
  'public.professionals.professionals_titularidade_tem_marco':
    "CHECK ((((claim_status = 'unclaimed'::text) AND (claimed_at IS NULL) AND (claimed_by_user_id IS NULL)) OR ((claim_status <> 'unclaimed'::text) AND (claimed_at IS NOT NULL))))",
  // BICHUS-66. `cancellation_reason` e lista fechada, mas NAO e da forma
  // simples: a coluna e anulavel, entao a restricao e `IS NULL OR ... IN (...)`
  // e o catalogo a escreve como uma disjuncao. Ela cai aqui, onde a definicao
  // inteira fica fixada -- que e o registro mais estrito dos dois, e nao o mais
  // frouxo. Mesma forma de `conversations_closure_reason_conhecida`.
  //
  // `lost_case_opened` e a resposta da BICHUS-66 ao caso que nem ela nem a
  // BICHUS-21 previram: o pet marcado como perdido no meio da janela.
  // `recipient_gone` e o `ON DELETE SET NULL` de `to_user_id` chegando ao
  // dominio. `MotivoDoCancelamento` em
  // `src/modules/transfers/domain/janela-da-transferencia.ts`.
  'public.pet_transfers.pet_transfers_motivo_conhecido':
    "CHECK (((cancellation_reason IS NULL) OR (cancellation_reason = ANY (ARRAY['current_owner'::text, 'cancel_token'::text, 'lost_case_opened'::text, 'recipient_gone'::text]))))",
  // BICHUS-66. A regra nas DUAS direcoes: cancelada tem motivo, e nao-cancelada
  // NAO tem. A segunda metade e a que ninguem olha -- um CHECK que so cobrasse
  // a presenca deixaria passar uma linha `effective` carregando
  // `lost_case_opened`, que e o tipo de lixo em cima do qual alguem constroi um
  // relatorio meses depois.
  'public.pet_transfers.pet_transfers_motivo_acompanha_o_cancelamento':
    "CHECK (((status = 'cancelled'::text) = (cancellation_reason IS NOT NULL)))",
  'public.ref_breeds.ref_breeds_code_check': "CHECK ((code ~ '^[a-z][a-z0-9_]{1,39}$'::text))",
  'public.ref_colors.ref_colors_code_check': "CHECK ((code ~ '^[a-z][a-z0-9_]{1,29}$'::text))",
  // `upload_intents.kind` previa `found_report_photo` desde 18/09 e não havia
  // coluna dizendo DE QUAL aviso. Sem ela o teto de três fotos por aviso
  // (SEC-009) não teria como ser contado, e a foto confirmada não teria como
  // ser ligada. O CHECK é o que impede a intenção de foto de achado sem achado.
  'public.upload_intents.upload_intents_foto_de_achado_tem_aviso':
    "CHECK (((kind <> 'found_report_photo'::text) OR (found_report_id IS NOT NULL)))",
  'public.users.users_phone_e164_formato':
    "CHECK (((phone_e164 IS NULL) OR (phone_e164 ~ '^\\+55[0-9]{10,11}$'::text)))",
};

/**
 * A forma simples, como `pg_get_constraintdef` a escreve. `x IN ('a','b')` é
 * normalizado pelo Postgres para `x = ANY (ARRAY['a'::text, 'b'::text])`, então
 * é esta a forma que chega aqui, independentemente de como a migração escreveu.
 */
const FORMA_SIMPLES = /^CHECK \(\(([a-z_][a-z0-9_]*) = ANY \(ARRAY\[(.*)\]\)\)\)$/;

/** Um elemento da lista, e nada além dele: `'valor'::text`. */
const LITERAL_DE_TEXTO = /^'((?:[^']|'')*)'::text$/;

/** Qualquer literal de texto em qualquer posição da definição. */
const MENCIONA_LITERAL = /'(?:[^']|'')*'::text/;

interface Restricao {
  readonly chave: string;
  readonly definicao: string;
}

/**
 * Quebra a lista de uma forma simples nos valores que ela aceita.
 *
 * Devolve `undefined` quando QUALQUER elemento não for um literal de texto
 * puro. É de propósito: a restrição deixa de ser uma lista fechada simples e
 * cai no outro registro, onde a definição inteira precisa estar fixada. Um
 * elemento que não seja literal (uma chamada de função, uma coluna) alarga o
 * domínio sem acrescentar literal nenhum, e passaria por uma comparação que só
 * colhesse os literais que encontrasse.
 */
function valoresDaFormaSimples(lista: string): string[] | undefined {
  const valores: string[] = [];
  for (const elemento of lista.split(', ')) {
    const casado = LITERAL_DE_TEXTO.exec(elemento);
    if (casado === null) return undefined;
    valores.push((casado[1] as string).replace(/''/g, "'"));
  }
  return valores;
}

const CONEXAO = process.env['DATABASE_URL'] ?? process.env['TEST_DATABASE_URL'];

let cliente: Client;
let todosOsChecks: Restricao[] = [];
let simples = new Map<string, { coluna: string; valores: string[]; definicao: string }>();
let naoSimples = new Map<string, string>();

before(async () => {
  if (CONEXAO === undefined || CONEXAO === '') {
    throw new Error(
      'DATABASE_URL não está definida. Este arquivo afirma o conjunto exato das listas ' +
        'fechadas do banco, e sem banco ele não confere nada. Passar verde sem conferir é o ' +
        'desfecho que ele existe para impedir. Rode `npm run test:integration`.',
    );
  }

  cliente = new Client({ connectionString: CONEXAO });
  try {
    await cliente.connect();
  } catch (erro) {
    throw new Error(
      `Não consegui conectar em ${CONEXAO.replace(/:[^:@/]*@/, ':***@')}: ` +
        `${erro instanceof Error ? erro.message : String(erro)}`,
    );
  }

  // A DESCOBERTA É AQUI, e é no catálogo. Nenhuma migração é lida: em 22/09 o
  // arquivo dizia uma coisa e o banco tinha outra, e quem tem a resposta é
  // quem recusa o INSERT.
  const r = await cliente.query<{ chave: string; definicao: string }>(
    `select ns.nspname || '.' || rel.relname || '.' || con.conname as chave,
            pg_get_constraintdef(con.oid)                          as definicao
       from pg_constraint con
       join pg_class rel    on rel.oid = con.conrelid
       join pg_namespace ns on ns.oid = rel.relnamespace
      where con.contype = 'c'
        and ns.nspname = any($1::text[])
      order by 1`,
    [ESQUEMAS_DO_PRODUTO],
  );
  todosOsChecks = r.rows;

  if (todosOsChecks.length === 0) {
    throw new Error(
      'Nenhuma restrição CHECK encontrada nos esquemas do produto. Filtro que não filtra ' +
        'termina verde e ninguém desconfia: banco sem as migrações aplicadas reprova aqui, e ' +
        'nunca passa por não ter achado nada.',
    );
  }

  simples = new Map();
  naoSimples = new Map();
  for (const { chave, definicao } of todosOsChecks) {
    const casado = FORMA_SIMPLES.exec(definicao);
    const valores = casado === null ? undefined : valoresDaFormaSimples(casado[2] as string);
    if (casado !== null && valores !== undefined) {
      simples.set(chave, { coluna: casado[1] as string, valores, definicao });
    } else if (MENCIONA_LITERAL.test(definicao)) {
      naoSimples.set(chave, definicao);
    }
  }
});

after(async () => {
  if (cliente !== undefined) await cliente.end();
});

void describe('o registro cobre o banco: restrição nova sem entrada reprova, nomeando', () => {
  void it('toda lista fechada do banco está declarada aqui, e toda declarada existe no banco', () => {
    const noBanco = [...simples.keys()].sort();
    const declaradas = Object.keys(LISTAS_FECHADAS).sort();

    const semDeclaracao = noBanco.filter((c) => !declaradas.includes(c));
    assert.deepEqual(
      semDeclaracao,
      [],
      'lista fechada no banco sem entrada em LISTAS_FECHADAS. Declare o conjunto INTEIRO de ' +
        'valores dela lá: CHECK que entra sem ninguém declarar é o silêncio que este arquivo ' +
        'existe para quebrar.',
    );

    const sumiram = declaradas.filter((c) => !noBanco.includes(c));
    assert.deepEqual(
      sumiram,
      [],
      'restrição declarada em LISTAS_FECHADAS que o banco não tem mais. Ou a migração a ' +
        'derrubou, ou ela mudou de forma e deixou de ser uma lista fechada simples — nos dois ' +
        'casos alguém precisa olhar, e não é para isto ficar verde.',
    );
  });

  void it('todo CHECK com literal de texto que não é lista fechada está declarado, inteiro', () => {
    // Esta é a metade que fecha o furo da lista fechada escrita à mão: o
    // catálogo não normaliza `col = 'a' OR col = 'b'` para `ANY (ARRAY[…])`, e
    // um portão que só procurasse a forma simples deixaria essa passar.
    const noBanco = [...naoSimples.keys()].sort();
    const declarados = Object.keys(CHECKS_QUE_NAO_SAO_LISTA_FECHADA).sort();

    assert.deepEqual(
      noBanco.filter((c) => !declarados.includes(c)),
      [],
      'CHECK com literal de texto sem entrada em CHECKS_QUE_NAO_SAO_LISTA_FECHADA. Escreva a ' +
        'definição inteira lá. Se for uma lista fechada disfarçada, reescreva a migração com ' +
        '`IN (…)` e declare o conjunto no primeiro registro.',
    );
    assert.deepEqual(
      declarados.filter((c) => !noBanco.includes(c)),
      [],
      'restrição declarada em CHECKS_QUE_NAO_SAO_LISTA_FECHADA que o banco não tem mais',
    );
  });

  void it('cada CHECK não-lista tem exatamente a definição declarada', () => {
    for (const [chave, esperada] of Object.entries(CHECKS_QUE_NAO_SAO_LISTA_FECHADA)) {
      const atual = naoSimples.get(chave);
      if (atual === undefined) continue; // o caso acima já reprovou, com nome.
      assert.equal(
        atual,
        esperada,
        `${chave} mudou de definição. Isto não é formatação: pg_get_constraintdef devolve a ` +
          'expressão que o banco APLICA, e mudança aqui é mudança de regra.',
      );
    }
  });

  void it('a inspeção tem o que inspecionar: as duas classes estão povoadas', () => {
    // Verificação que não consegue verificar precisa reprovar. Se a
    // classificação parar de casar (mudança de formato do catálogo, por
    // exemplo), os dois mapas esvaziam e todos os casos acima passariam por
    // percorrer lista vazia.
    assert.ok(
      simples.size >= Object.keys(LISTAS_FECHADAS).length,
      `só ${String(simples.size)} listas fechadas reconhecidas de ${String(todosOsChecks.length)} ` +
        'CHECKs lidos: a classificação deixou de casar, e os casos deste arquivo passariam ' +
        'percorrendo lista vazia',
    );
    assert.ok(
      naoSimples.size >= Object.keys(CHECKS_QUE_NAO_SAO_LISTA_FECHADA).length,
      `só ${String(naoSimples.size)} CHECKs não-lista reconhecidos: a classificação deixou de casar`,
    );
  });
});

void describe('o conjunto exato de cada lista fechada', () => {
  for (const [chave, esperada] of Object.entries(LISTAS_FECHADAS)) {
    void it(`${chave} aceita exatamente ${String(esperada.valores.length)} valores, e só eles`, () => {
      const atual = simples.get(chave);
      assert.ok(
        atual,
        `${chave} não existe no banco como lista fechada simples. Migração que a derrubou, ` +
          'renomeou ou transformou em outra forma reprova aqui de propósito.',
      );

      assert.equal(
        atual.coluna,
        esperada.coluna,
        `${chave} fecha a coluna ${atual.coluna}, e aqui está declarada sobre ` +
          `${esperada.coluna}. Restrição que mudou de coluna não é a mesma restrição.`,
      );

      // A ASSERÇÃO CENTRAL, e ela é de CONJUNTO, nos dois sentidos.
      //
      // O esperado está escrito à mão em LISTAS_FECHADAS, e o atual vem do
      // catálogo. `deepEqual` sobre os dois ordenados nomeia a diferença: valor
      // que saiu aparece de um lado, valor que entrou sem declaração aparece do
      // outro. Comparar tamanho, ou perguntar se contém um valor, deixaria
      // passar metade dos casos — e a metade permissiva é a que ninguém olha.
      const doBanco = [...atual.valores].sort();
      const declarados = [...esperada.valores].sort();
      assert.deepEqual(
        doBanco,
        declarados,
        `${chave}: o conjunto que o banco aceita não é o conjunto declarado.\n` +
          `  faltando no banco (valor que SAIU): ${declarados.filter((v) => !doBanco.includes(v)).join(', ') || 'nenhum'}\n` +
          `  sobrando no banco (valor que ENTROU sem ninguém declarar): ${doBanco.filter((v) => !declarados.includes(v)).join(', ') || 'nenhum'}`,
      );

      // A forma, além do conjunto. Sem isto, `col = ANY (ARRAY[…]) OR col <>
      // 'x'` manteria os mesmos literais e alargaria o domínio para tudo: a
      // comparação de conjunto acima passaria, porque nenhum literal novo
      // apareceu. Reconstruir a definição canônica e exigir igualdade fecha
      // esse caminho.
      const canonica = `CHECK ((${esperada.coluna} = ANY (ARRAY[${atual.valores
        .map((v) => `'${v.replace(/'/g, "''")}'::text`)
        .join(', ')}])))`;
      assert.equal(
        atual.definicao,
        canonica,
        `${chave} deixou de ser uma lista fechada pura: a definição carrega algo além da ` +
          'lista, e uma cláusula a mais alarga o domínio sem acrescentar nenhum valor novo.',
      );
    });
  }
});
