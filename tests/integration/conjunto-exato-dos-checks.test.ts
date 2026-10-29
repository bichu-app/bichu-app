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
  // BICHUS-259 (ADR-0027, apendice A.1, forma de 28/09). Os seis motivos de
  // revogacao da sessao administrativa. `role_removed` saiu: o papel mora em
  // `admin_accounts.role`, que so aceita `admin`, e a conta que perde o painel
  // e desativada (`account_disabled`). Espelha `MotivoDeRevogacaoAdministrativa`
  // em `src/modules/admin-access/ports/sessao-administrativa-repository.ts` e o
  // tipo da coluna em `src/shared/db/schema.ts`. Os tres andam juntos.
  'public.admin_sessions.admin_sessions_revoked_reason_check': {
    coluna: 'revoked_reason',
    valores: [
      'logout',
      'rotated',
      'account_disabled',
      'account_invalidated',
      'disavowed',
      'password_reset',
    ],
  },
  // BICHUS-259 (D40, ADR-0027 item 5). Os CINCO escopos de
  // `X-Admin-Reauth-Token`; `network_event_access_change` entrou em 28/09 pela
  // 000006, e nao por uma migracao da `Rede`. Espelha `AdminReauthScope` do
  // contrato, `EscopoDeReautenticacaoAdministrativa` em
  // `src/shared/http/route-definition.ts` e o tipo da coluna em
  // `src/shared/db/schema.ts`.
  'public.admin_reauth_tokens.admin_reauth_tokens_escopo': {
    coluna: 'scope',
    valores: [
      'store_item_retirement',
      'network_event_relocation',
      'network_event_cancellation',
      'network_event_removal',
      'network_event_access_change',
    ],
  },
  // ADR-0027 item 20.1. O papel da conta do painel. Um valor so na v1, e
  // escrito como `= ANY (ARRAY['admin'])` na migracao para o catalogo guardar
  // lista, e nao igualdade. `AdminRole` do contrato e `PapelAdministrativo` em
  // `src/shared/http/route-definition.ts`.
  'public.admin_accounts.admin_accounts_role_check': {
    coluna: 'role',
    valores: ['admin'],
  },
  'public.admin_accounts.admin_accounts_status_check': {
    coluna: 'status',
    valores: ['active', 'disabled'],
  },
  // `failed_logins` (D44, dez falhas em 24 h) e `disavowed` (D62). Os dois so
  // caem com `conta-admin redefinir-senha`.
  'public.admin_accounts.admin_accounts_blocked_reason_check': {
    coluna: 'blocked_reason',
    valores: ['failed_logins', 'disavowed'],
  },
  'public.alert_dispatches.alert_dispatches_estado': {
    coluna: 'reach_status',
    // `EstadoDoDisparo` em `src/modules/lostfound/domain/disparo-do-alerta.ts`,
    // espelhado em `src/shared/db/schema.ts`. Os quatro são estados distintos e
    // nenhum é substituível por outro: `computed` traz número, `unavailable` é
    // "não conseguimos contar", `queued` é "ainda não contamos" e
    // `no_location` é "não existe raio, o caso não tem coordenada".
    valores: ['computed', 'unavailable', 'queued', 'no_location'],
  },
  // `admin` entrou em 28/09 (ADR-0027 apendice A.5): o ator do painel tem
  // coluna propria, `actor_admin_id`, e nunca vai em `actor_user_id`. As linhas
  // anteriores nao foram reescritas. `ActorKind` em
  // `src/modules/audit/ports/audit-log.ts` e o tipo da coluna em `schema.ts`.
  'audit.events.events_actor_kind_check': {
    coluna: 'actor_kind',
    valores: ['user', 'anonymous', 'system', 'admin'],
  },
  'public.conversation_messages.conversation_messages_sender_role_conhecido': {
    coluna: 'sender_role',
    // `Papel` em `src/modules/messaging/domain/conversa-mediada.ts`, e
    // `PapelNaConversa` em `src/shared/db/schema.ts`. `system` está aqui e
    // **não** em `conversations.blocked_by_role`: mensagem o sistema escreve,
    // bloqueio ele não exerce.
    valores: ['tutor', 'finder', 'system'],
  },
  // BICHUS-41. A fila de denúncia nomeia os lados pelo papel, como
  // `conversations.blocked_by_role`: o achador pode não ter conta. `system` não
  // entra, porque o sistema não denuncia ninguém.
  'public.conversation_reports.conversation_reports_reporter_role_conhecido': {
    coluna: 'reporter_role',
    valores: ['tutor', 'finder'],
  },
  // BICHUS-41. O `enum` de `reason` de `reportFinderConversation`, e
  // `MotivoDaDenuncia` em `src/modules/messaging/ports/conversation-repository.ts`.
  'public.conversation_reports.conversation_reports_reason_conhecido': {
    coluna: 'reason',
    valores: ['extortion', 'harassment', 'spam', 'impersonation', 'other'],
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
  // ADR-0027 A.3 (BICHUS-267). A imagem de catalogo, na forma de `pet_photos`:
  // os mesmos tres estados, e o proposito gravado no envio. Os dois conjuntos
  // sao os `enum` de `AdminCatalogImage.status` e de
  // `AdminCatalogImageIntentInput.purpose` no contrato.
  'public.catalog_images.catalog_images_estado': {
    coluna: 'status',
    valores: ['processing', 'ready', 'rejected'],
  },
  // AS DUAS LISTAS DE `purpose` SAO A MESMA LISTA, E ISSO E MEDIDO E NAO LIDO.
  // `catalog_upload_intents.purpose` (o proposito declarado no envio) e
  // `catalog_images.purpose` (o gravado na confirmacao) precisam aceitar o MESMO
  // conjunto: a escrita que confirma exige o mesmo valor que a intencao trouxe
  // (T9), e um proposito que um lado aceitasse e o outro nao viraria envio que
  // some entre as duas tabelas. Conferido no banco em 19/10: as duas definicoes
  // sao caractere a caractere iguais, nos mesmos seis valores e na mesma ordem.
  // Quem mudar um lado muda o outro, e as duas migracoes de 18/10 fizeram isso.
  'public.catalog_images.catalog_images_proposito': {
    coluna: 'purpose',
    valores: [
      'store_item',
      'network_event',
      // Os TRES de 18/10/2026, `20261018000008`, por dois pedidos do cliente do
      // dia: logo e foto do profissional recomendado, e a foto do proprio
      // usuario. Entraram na esteira que JA existia, de proposito: uma segunda
      // tabela de imagem daria duas versoes de derivada, de higiene de EXIF, de
      // teto de bytes e de varredura de vencidos.
      'directory_logo',
      'directory_photo',
      'user_photo',
      // O sexto, `20261018000040` (18/10): a vitrine de fotos do usuario, ate
      // nove, visivel so ao dono.
      'user_showcase',
      // O SETIMO, `20261020000002` (20/10/2026): a foto de UMA publicacao do
      // Mural, pelo pedido do cliente do dia (*"subir uma foto e publicar o
      // conteudo"*). Entrou na MESMA esteira pela razao de sempre (ADR-0007, e
      // a nota dos tres de 18/10 acima): uma segunda tabela de imagem daria
      // duas versoes de derivada, de higiene de EXIF, de teto de bytes e de
      // varredura de vencidos.
      //
      // A migracao REESCREVE o `CHECK` em vez de acrescentar um segundo: a
      // primeira versao de uma migracao de vitrine deste projeto APAGOU tres
      // valores ao reescrever, e e por isso que estes sete estao declarados
      // aqui, um a um, nas DUAS tabelas -- `catalog_upload_intents` e
      // `catalog_images`.
      'user_publication',
    ],
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
  // A ATIVIDADE SAIU DESTE REGISTRO EM 21/10/2026, E NAO FOI AFROUXADA.
  //
  // Havia aqui `public.professionals.professionals_kind_check`, com os seis
  // valores e `coluna: 'kind'`. A `20261020000015` (decisao do cliente: uma
  // clinica que tambem faz banho e tosa nao precisa escolher) trocou
  // `kind text` por `kinds text[]`, e com a coluna foi o `CHECK`.
  //
  // A lista fechada **continua existindo, com os mesmos seis valores**, agora
  // como `professionals_atividades_conhecidas` -- e ela mudou de REGISTRO, nao
  // de conteudo: `LISTAS_FECHADAS` so aceita a forma `col = ANY (ARRAY[...])`
  // (`FORMA_SIMPLES`), e `kinds <@ ARRAY[...]` nao e essa forma. Ela esta
  // declarada no registro de CHECK com literal, com a definicao inteira fixada.
  //
  // `professionals_atividades_tamanho` (de 1 a 6) **nao esta em registro
  // nenhum**, e isso e deliberado: e faixa numerica pura, sem literal de texto,
  // entao `MENCIONA_LITERAL` nao casa e declara-lo aqui ou lá viraria entrada
  // fantasma -- o mesmo erro que as cinco da vitrine documentam logo abaixo.
  //
  // O TIPO DE ENTIDADE (`20261018000012`), eixo SEPARADO da atividade.
  // ONG nao entrou em `kind` por duas razoes: acrescentar valor a `enum` de
  // RESPOSTA quebra o contrato (`oasdiff`, response-property-enum-value-added,
  // 12 erros medidos em 18/10) e, sobretudo, porque afirmaria que organizacao
  // e um tipo de profissional. Os dois valores sao os MESMOS de
  // `entity_verifications_entity_kind_check`, logo abaixo: uma segunda
  // convencao para o mesmo conceito e a convencao que diverge.
  'public.professionals.professionals_entity_kind_check': {
    coluna: 'entity_kind',
    valores: ['professional', 'organization'],
  },
  // BICHUS-185 / BICHUS-189. A categoria do produto da vitrine. Espelha
  // ------------------------------------------------------------------
  // A CATEGORIA DA LOJA **SAIU** DESTE REGISTRO EM 17/10/2026, E A SAIDA E A
  // DECISAO
  // ------------------------------------------------------------------
  //
  // Havia aqui `public.store_items.store_items_categoria`, com os seis valores
  // (`food`, `toy`, `hygiene`, `accessory`, `health`, `bed`), e ele era um dos
  // tres arquivos que o ADR-0023 secao 3 exige no mesmo commit.
  //
  // A `20261017000003` **apagou esse CHECK** e poe no lugar uma chave
  // estrangeira para `store_categories (code)`: o cliente decidiu dois niveis
  // com subcategorias como a petlove, e 14 categorias com 83 subcategorias nao
  // cabem num conjunto de literais -- nem a relacao entre os dois niveis, nem
  // a variacao por especie.
  //
  // **A trava nao desapareceu, ela mudou de forma**, e e honesto dizer onde
  // ela esta agora: a chave estrangeira `store_items_categoria_existe` e a
  // composta `store_items_subcategoria_e_da_categoria`, que
  // `chave-estrangeira-contra-restricao.test.ts` confere. O que este arquivo
  // perdeu e a afirmacao do CONJUNTO EXATO de valores; quem a faz agora e
  // `semente-da-taxonomia-da-loja.test.ts`, contra as linhas semeadas.
  //
  // Nao e perda de garantia de graca: era preciso escolher entre fechar a
  // lista num CHECK (e pagar mudanca de contrato das quatro aplicacoes a cada
  // ajuste de vocabulario) e fecha-la numa tabela. O cliente escolheu tabela,
  // por extenso.
  // A `Rede` (ADR-0027 12.3 e apendice A.4). Tres arquivos no mesmo commit,
  // como o ADR-0023 secao 3 exige: a migracao, esta entrada e o `enum` do
  // contrato -- que, para estas duas colunas, e o de `AdminNetworkEvent` em
  // `/admin/network/*` (ADR-0027), e nao o da leitura publica, que nao as
  // projeta.
  //
  // **`pending_review` NAO EXISTE MAIS, e a saida e a decisao do cliente de
  // 17/10/2026** (ADR-0025 emenda 3, migracao `20261001000005`): "o usuario
  // validado pode criar eventos sem aprovacao". Sem fila de moderacao o estado
  // nao tem o que representar, e o `CHECK`
  // `network_events_revisao_so_da_comunidade`, que existia so para amarra-lo a
  // origem `community`, saiu na mesma migracao -- por isso ele tambem nao esta
  // mais em CHECKS_QUE_NAO_SAO_LISTA_FECHADA. Sao TRES valores, e nao quatro.
  'public.network_events.network_events_origem_conhecida': {
    coluna: 'origin',
    valores: ['admin', 'community'],
  },
  'public.network_events.network_events_publicacao_conhecida': {
    coluna: 'publication_status',
    valores: ['published', 'cancelled', 'removed'],
  },
  // Os campos do encontro e o pedido para participar (ADR-0027 item 17, A.4.1
  // e A.6). O `enum` do contrato de cada um: `NetworkEventVisibility`,
  // `NetworkEventAdmission.kind`, `NetworkEventDogAge`, `NetworkEventBringItem`,
  // `NetworkEventAmenity`. A decisao do pedido nao tem `enum` no app de
  // proposito: o app ve `JoinRequestAppState`, sem `declined`; o `enum` dela e
  // o `AdminJoinRequestStatus` do painel (ADR-0027).
  'public.network_events.network_events_visibilidade_conhecida': {
    coluna: 'visibility',
    valores: ['public', 'private'],
  },
  'public.network_events.network_events_entrada_conhecida': {
    coluna: 'admission_kind',
    valores: ['free', 'paid'],
  },
  'public.network_events.network_events_idade_conhecida': {
    coluna: 'dog_age',
    valores: ['any', 'from_4_months', 'from_1_year', 'up_to_1_year'],
  },
  'public.network_event_bring_items.network_event_bring_items_item_conhecido': {
    coluna: 'item',
    valores: ['water', 'water_bowl', 'leash', 'poop_bags', 'treats', 'towel', 'vaccination_card', 'toy'],
  },
  'public.network_event_amenities.network_event_amenities_estrutura_conhecida': {
    coluna: 'amenity',
    valores: [
      'level_ground_or_ramp',
      'accessible_restroom',
      'public_restroom_nearby',
      'shade',
      'benches',
      'dog_water_fountain',
      'parking_nearby',
    ],
  },
  'public.network_event_join_requests.network_event_join_requests_decisao_conhecida': {
    coluna: 'status',
    valores: ['pending', 'approved', 'declined'],
  },
  // BICHUS: o pedido do OBJETO FISICO da plaquinha. `fulfilled` quer dizer que
  // a plaquinha saiu, e nao que o codigo foi emitido -- emitir e `pet_tags`, e
  // e irreversivel (ADR-0004).
  'public.collar_tag_requests.collar_tag_requests_decisao_conhecida': {
    coluna: 'status',
    valores: ['pending', 'fulfilled', 'declined'],
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
  // ------------------------------------------------------------------
  // A INDICACAO DO DIRETORIO (`20261017000004`) E A FILA DELA
  // (`20261017000016`). Tres conjuntos, e os tres nasceram em 17/10.
  // ------------------------------------------------------------------
  // A MESMA lista de `professionals_atividades_conhecidas`, e nao ha valor
  // para ONG aqui pelo mesmo motivo de la: ONG e tipo de ENTIDADE
  // (`professionals.entity_kind`, `20261018000012`) e nao atividade.
  //
  // OITO VALORES desde 28/10/2026, e ela cresceu JUNTO com a de
  // `professionals` por obrigacao e nao por zelo (`20261028000001`): o
  // contrato tem UM `ProfessionalKind`, usado tambem no `kind` de
  // `POST /v1/directory/suggestions`. Alargar so `professionals` deixaria o
  // contrato prometendo `store` numa rota cujo `CHECK` o recusa -- e a recusa
  // viria do banco, `500`, em vez do `400` de campo invalido.
  //
  // O FLUXO da fila nao mudou: indicacao continua nascendo pendente e passando
  // por aprovacao. O que mudou e so o vocabulario que ela aceita.
  'public.directory_suggestions.directory_suggestions_atividade_conhecida': {
    coluna: 'kind',
    valores: ['vet', 'groomer', 'walker', 'sitter', 'trainer', 'clinic', 'store', 'hospital'],
  },
  // O tipo do contato e DECLARADO, nunca adivinhado: um palpite aceitaria um
  // telefone no campo de site. Nao ha `email` aqui, e nao e esquecimento --
  // `professionals` nao guarda e-mail de contato publico.
  'public.directory_suggestions.directory_suggestions_contato_conhecido': {
    coluna: 'contact_kind',
    valores: ['phone', 'website', 'instagram'],
  },
  // A fila de 17/10 (BICHUS, queixa "no backoffice nao tem um menu para
  // aprovar os profissionais que as pessoas estao indicando"). `approved` NAO
  // quer dizer que a entrada esta no ar -- quer dizer que a revisao aceitou
  // seguir com o convite do ADR-0011. Nasce `pending` pelo DEFAULT.
  'public.directory_suggestions.directory_suggestions_revisao_conhecida': {
    coluna: 'review_status',
    valores: ['pending', 'approved', 'declined'],
  },
  // ------------------------------------------------------------------
  // A AVALIACAO DO LOCAL E A DENUNCIA DELA (`20261017000017`).
  // ------------------------------------------------------------------
  // `published` e o DEFAULT, e isso e a decisao do cliente de 18/10: a
  // avaliacao aparece na hora, como na Play Store, e **nao existe valor
  // `pending`** porque nao ha fila de aprovacao de avaliacao. A INDICACAO de
  // local novo continua revisada, e e outra coisa. `hidden` e `removed` tiram
  // a linha da lista, da media e da contagem, e a linha FICA: o ADR-0011 manda
  // a remocao ser registrada na trilha com o motivo.
  'public.professional_reviews.professional_reviews_status_conhecido': {
    coluna: 'status',
    valores: ['published', 'hidden', 'removed'],
  },
  // Os valores do contrato, e campo livre nao tria fila. `other` existe para a
  // denuncia que nao cabe nos quatro, e vem com `detail`.
  'public.professional_review_reports.professional_review_reports_reason_conhecido': {
    coluna: 'reason',
    valores: ['spam', 'offensive', 'false_information', 'not_about_this_place', 'other'],
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
    // A imagem de catalogo do painel NAO mora aqui desde 28/09 (ADR-0027 item
    // 20.2): ela tem tabela propria, `catalog_upload_intents`. Esta tabela e do
    // app e volta a lista da `development`.
    valores: ['pet_photo', 'found_report_photo', 'finder_photo'],
  },
  // BICHUS-245, migracao 20261001000006. O estado da higiene da foto do achado.
  // `ausente` e o objeto que nunca chegou (intencao assinada, envio desistido,
  // nenhum byte) e e desfecho FINAL, e nao falha: sem ele a varredura
  // reenfileiraria para sempre a mesma intencao vazia. A coerencia entre este
  // estado e os campos que ele governa esta em
  // `upload_intents_higiene_coerente`, no outro registro.
  'public.upload_intents.upload_intents_status_da_higiene': {
    coluna: 'sanitize_status',
    valores: ['pendente', 'pronta', 'recusada', 'ausente'],
  },
  // ADR-0027 A.3 (item 20.2). O proposito da intencao de envio. **Nao e mais so
  // "do painel"**: a `20261001000005` (ADR-0025 emenda 3) deu a esta tabela um
  // segundo autor, `user_id`, e `user_photo`/`user_showcase` chegam por ele. O
  // conjunto e o MESMO de `catalog_images_proposito` -- ver a nota la.
  'public.catalog_upload_intents.catalog_upload_intents_proposito': {
    coluna: 'purpose',
    valores: [
      'store_item',
      'network_event',
      // Os TRES de 18/10/2026, `20261018000008`, por dois pedidos do cliente do
      // dia: logo e foto do profissional recomendado, e a foto do proprio
      // usuario. Entraram na esteira que JA existia, de proposito: uma segunda
      // tabela de imagem daria duas versoes de derivada, de higiene de EXIF, de
      // teto de bytes e de varredura de vencidos.
      'directory_logo',
      'directory_photo',
      'user_photo',
      // O sexto, `20261018000040` (18/10): a vitrine de fotos do usuario, ate
      // nove, visivel so ao dono.
      'user_showcase',
      // O SETIMO, `20261020000002` (20/10/2026): a foto de UMA publicacao do
      // Mural, pelo pedido do cliente do dia (*"subir uma foto e publicar o
      // conteudo"*). Entrou na MESMA esteira pela razao de sempre (ADR-0007, e
      // a nota dos tres de 18/10 acima): uma segunda tabela de imagem daria
      // duas versoes de derivada, de higiene de EXIF, de teto de bytes e de
      // varredura de vencidos.
      //
      // A migracao REESCREVE o `CHECK` em vez de acrescentar um segundo: a
      // primeira versao de uma migracao de vitrine deste projeto APAGOU tres
      // valores ao reescrever, e e por isso que estes sete estao declarados
      // aqui, um a um, nas DUAS tabelas -- `catalog_upload_intents` e
      // `catalog_images`.
      'user_publication',
    ],
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
    //
    // Só `tutor` desde 28/09 (ADR-0027 item 20.2, D42): o painel tem cadastro
    // próprio, e papel de painel em conta do app deixou de ser representável.
    // A 000006 aborta, nomeando a linha, se encontrar outro valor aqui.
    valores: ['tutor'],
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

  // =========================================================================
  // O LOTE DE 18/10/2026: TRINTA E DUAS RESTRICOES QUE ENTRARAM COM A SUITE DE
  // INTEGRACAO CEGA, E QUE SO APARECERAM QUANDO A VISAO VOLTOU
  // =========================================================================
  // Nove listas fechadas (aqui) e vinte e tres CHECKs do outro registro
  // chegaram entre 18/10 e 19/10 -- `Loja`/plaquinha, leitura de conversa,
  // caixa de notificacoes, conexao simetrica, apelido e as tres filas de
  // denuncia. Elas nao passaram por este registro porque o `tsc` da suite de
  // integracao estourava de memoria e NENHUM caso rodava: o portao que existe
  // para quebrar o silencio estava, ele proprio, calado. O escopo de compilacao
  // da branch base devolveu a execucao, e e por isso que elas aparecem todas
  // no mesmo dia -- nao foi um lote descuidado, foi o alarme religado.

  // 20261018000004, a entrega da plaquinha da coleira. Os TRES estados do
  // transporte. `requested` e o estado de quem ainda nao despachou nada; os
  // instantes que acompanham cada um estao nos CHECKs de coerencia do outro
  // registro.
  'public.collar_tag_requests.collar_tag_requests_entrega_conhecida': {
    coluna: 'delivery_state',
    valores: ['requested', 'in_transit', 'arrived'],
  },

  // 20261018000014, a leitura da conversa por participante. Os DOIS lados da
  // conversa mediada, e so eles: `system` NAO entra, porque o sistema nao le --
  // ele escreve. O terceiro papel vive em
  // `conversation_messages_sender_role_conhecido`, que tem tres.
  'public.conversation_reads.conversation_reads_role_conhecido': {
    coluna: 'role',
    valores: ['tutor', 'finder'],
  },

  // 20261018000021, o espaco de nomes do `@`. As TRES especies que dividem o
  // mesmo espaco: pessoa, pet e as reservadas. `reservado` mora aqui, e nao
  // numa lista em `src/`, porque lista no codigo nao impede `INSERT` por psql.
  'public.handles.handles_kind_check': {
    coluna: 'kind',
    valores: ['pessoa', 'pet', 'reservado'],
  },

  // 20261018000020, a caixa de notificacoes, AMPLIADA pela 20261020000018. Os
  // ONZE tipos de item. `broadcast` e o comunicado do painel e e o unico que
  // nao nasce de um fato do tutor; `connection_requested` entrou em 22/10/2026
  // (cliente: "quando o usuario me adicionou, nao apareceu na notificacao que
  // eu tinha uma solicitacao de amizade"). Espelha o `enum` de
  // `NotificationItem.item_kind` no contrato.
  'public.notification_items.notification_items_tipo_conhecido': {
    coluna: 'item_kind',
    valores: [
      'tag_scanned',
      'found_reported',
      'match_suggested',
      'neighborhood_alert',
      'event_join_requested',
      'event_join_decided',
      'event_cancelled',
      'suggestion_decided',
      'tag_request_updated',
      'broadcast',
      'connection_requested',
    ],
  },

  // 20261018000030, a conexao simetrica com aceite. Os TRES estados do convite.
  // Nao ha `cancelled`: desistir apaga a linha, porque convite retirado nao e
  // fato que alguem precise reler. `rest_until` so existe em `declined`, e quem
  // impoe isso e `user_connections_descanso_so_na_recusa`, no outro registro.
  'public.user_connections.user_connections_estado_conhecido': {
    coluna: 'state',
    valores: ['pending', 'accepted', 'declined'],
  },

  // As CINCO origens por onde um pedido de conexao pode nascer, e a lista
  // continua fechada de proposito: sem ela, `origin` aceitaria texto livre e a
  // procedencia deixaria de ser auditavel.
  //
  // **Eram TRES ate 20/10/2026** (`20261018000030`), e aquela migracao escrevia
  // ao lado da coluna: *"Nao existe quarto valor, e nao existe caminho por
  // apelido, por busca nem por link"*. O cliente pediu **os tres**, e a
  // `20261020000012` acrescentou dois valores:
  //
  //   * `invite_link`   -- o convite emitido pelo dono, resolvido por
  //                        `invite_token`. Cobre o QR **e** o link do WhatsApp,
  //                        porque os dois carregam o MESMO token;
  //   * `people_search` -- a busca por nome ou apelido, resolvida por `handle`.
  //
  // `presence_code` NAO foi reaproveitado para o QR: ele e a fatia H'' (token
  // ROTATIVO de 5 min, cara a cara) e o QR do perfil dura 30 dias -- declarar um
  // link duravel como codigo rotativo faria quem consulta `origin` para medir
  // risco ler o contrario do que aconteceu.
  //
  // A lista fechada fez exatamente o trabalho dela: obrigou a decisao a passar
  // por uma migracao, e e por isso que este portao reprovou antes de alguem
  // acrescentar os valores aqui.
  'public.user_connections.user_connections_origem_fechada': {
    coluna: 'origin',
    valores: [
      'anchored_case',
      'anchored_event',
      'presence_code',
      'invite_link',
      'people_search',
    ],
  },

  // ---------------------------------------------------------------------
  // 20261018000032, as TRES filas de denuncia (perfil, foto, publicacao).
  // Os motivos sao LISTAS DIFERENTES de proposito: o que se denuncia num
  // perfil nao e o que se denuncia numa foto. Juntar as tres numa lista so
  // daria a cada fila motivos que nao se aplicam a ela, e e a fila que a
  // moderacao minima le (decisao do cliente: moderacao fica na indicacao e na
  // avaliacao, e estender exige evidencia DESTA fila).
  // ---------------------------------------------------------------------
  'public.photo_reports.photo_reports_reason_conhecido': {
    coluna: 'reason',
    valores: [
      'nudity_or_sexual',
      'child_at_risk',
      'animal_violence',
      // `i_am_in_it` e a denuncia de quem aparece na foto, e nao a de quem se
      // ofendeu com ela: e o unico motivo desta fila cujo denunciante e o
      // retratado.
      'i_am_in_it',
      'impersonation',
      'other',
    ],
  },
  'public.profile_reports.profile_reports_reason_conhecido': {
    coluna: 'reason',
    valores: [
      'impersonation',
      'harassment',
      'pet_ransom_scam',
      'minor_suspected',
      'other',
    ],
  },
  'public.publication_reports.publication_reports_reason_conhecido': {
    coluna: 'reason',
    valores: [
      'offensive_or_discriminatory',
      'scam_or_animal_sale',
      'false_lost_pet_info',
      'spam_or_repetition',
      'other',
    ],
  },

  // ---------------------------------------------------------------------
  // 20261019000007, a politica de versao minima do aplicativo. A plataforma e
  // a CHAVE PRIMARIA da tabela, e e lista fechada de verdade: a migracao a
  // escreve como `platform IN ('android', 'ios')` e o catalogo a normaliza
  // para `= ANY (ARRAY[...])`, entao ela cai aqui e o conjunto INTEIRO precisa
  // estar declarado.
  //
  // Os dois valores, e so eles. `ios` esta na lista com o aplicativo iOS
  // DORMENTE (a conta Apple nao andou; decisao do cliente de 23/09): a linha
  // existe com o mecanismo desligado, e tirar `ios` da restricao agora
  // obrigaria outra migracao no dia em que a conta sair. Nao ha `web`: o site
  // nao e aplicativo instalado e nao tem versao a bloquear.
  //
  // Os outros CHECKs desta tabela nao sao lista fechada (expressao regular e
  // comprimento) e estao em CHECKS_QUE_NAO_SAO_LISTA_FECHADA -- menos
  // `app_version_policy_updated_by_check`, que e so `length(updated_by) <=
  // 120`, nao menciona literal de texto nenhum, a classificacao do cabecalho
  // nao o colhe, e declara-lo em qualquer um dos dois registros faria o caso
  // "restricao declarada que o banco nao tem mais" reprovar. Mesma regra que
  // as restricoes de faixa da `Rede`, anotada no outro registro.
  // ---------------------------------------------------------------------
  'public.app_version_policy.app_version_policy_platform_check': {
    coluna: 'platform',
    valores: ['android', 'ios'],
  },
  // ------------------------------------------------------------------
  // O MARCADOR DE "JA VI ESTA SECAO" (migracao `20261020000001`, 20/10/2026),
  // que alimenta os contadores das abas.
  //
  // **TRES valores, e o `Mural` NAO esta entre eles de proposito.** A migracao
  // escreve a razao: a contagem do Mural e de outra frente (o compositor), e
  // "um valor aceito sem leitor seria casca". Quem a construir troca o `CHECK`
  // pelo nome dele -- e este registro reprova no dia em que o banco ganhar o
  // quarto valor sem ninguem declarar.
  //
  // E o MESMO conjunto de `#/components/schemas/SectionSeenInput/properties/
  // section` no contrato, e o mesmo de `SecaoComContador` em
  // `app/lib/api/contadores_api.dart` -- as tres superficies com a mesma lista
  // e a mesma ausencia anotada.
  //
  // DECLARADO NA ONDA 2 DO TERCEIRO LOTE, e a demora e um achado meu: a
  // migracao entrou na onda 1 e eu relatei as duas reprovas da integracao
  // daquela onda como "o par pre-existente do `app_version_policy`", batendo
  // pelo NOME do caso em vez de abrir a lista que o caso imprime. O numero de
  // casos nao mudou (duas reprovas na base, duas na onda 1), mas o CONTEUDO de
  // uma delas mudou: ela passou a cobrir tambem esta lista. Medir o nome do
  // caso nao e medir o caso.
  // ------------------------------------------------------------------
  'public.section_list_views.section_list_views_secao_conhecida': {
    coluna: 'section',
    valores: ['pets', 'network_events', 'network_directory'],
  },
  // ------------------------------------------------------------------
  // As DUAS paginas publicas do site cuja existencia o app consulta antes de
  // oferecer o compartilhamento. Entrou com a migracao `20261020000010`, da
  // frente `feat/compartilhar-o-caso`, e a tabela e irma de
  // `app_version_policy`: linha escrita a mao no `psql`, sem conta a que se
  // vincular.
  //
  // **A ASSIMETRIA DESTA TABELA E INVERTIDA EM RELACAO A DA IRMA, e isto fica
  // escrito aqui porque e onde alguem vai ler antes de mexer:** em
  // `app_version_policy` toda ausencia LIBERA (sem politica, nenhuma versao e
  // bloqueada); aqui toda ausencia ESCONDE (sem linha `true`, o botao de
  // compartilhar nao aparece). Quem mexer num default tem de conferir em qual
  // dos dois sentidos esta mexendo. Esta entrada NAO mexe em default nenhum:
  // ela so declara o dominio fechado do `CHECK`.
  //
  // DECLARADO NA ONDA 3 DO TERCEIRO LOTE, e a falta era da branch e nao da
  // uniao: medido que nem `ac8407d9` (a frente), nem `070bfee6` (a base), nem
  // a minha arvore mesclada declaravam a entrada -- a frente criou o `CHECK` e
  // nunca o registrou, e so a suite de INTEGRACAO acusa isso. Reprovou 1 de
  // 710 por este caso, e nao por carga: a carga da `did not complete` e
  // `timeout` de pool, nao uma lista com nome e sobrenome.
  // ------------------------------------------------------------------
  //
  // ONDA 4, 21/10/2026: `network_event` ENTROU, e a isca pegou -- que e
  // exatamente para isso que ela existe. A migracao
  // `20261020000017_pagina-publica-do-encontro-existe.sql` derruba e recria o
  // `CHECK` com os TRES valores, e insere a linha `network_event` DESLIGADA
  // (`is_published = false`). Ampliar o dominio do banco e nao declarar aqui e
  // como a lista fechada deixa de medir: o valor novo entra em silencio e, a
  // partir dai, qualquer OUTRO valor tambem passaria sem alarme.
  //
  // **Acrescentado pelo NOME e com o motivo, e a isca NAO foi desligada.**
  // A assimetria da tabela continua: linha ausente, `false` ou tabela
  // inalcancavel ESCONDEM o endereco publico.
  'public.site_page_availability.site_page_availability_page_check': {
    coluna: 'page',
    valores: ['lost_case', 'network_event', 'poster'],
  },
  // BICHUS-301, migracao 20261027000020. O proposito do desafio WebAuthn. Os
  // dois valores sao os passos que existem, e a `CHECK`
  // `passkey_challenges_dono_conforme_proposito` amarra cada um ao dono:
  // `registration` exige `user_id` (ha sessao, e a credencial tem de nascer na
  // conta certa) e `authentication` exige `user_id` NULO (nao ha sessao, e
  // inventar dono antes de a assinatura conferir seria aceitar como
  // identificacao o campo que quem chama escolhe). Espelha `PropositoDoDesafio`
  // em `src/modules/identity/domain/passkey.ts` e o tipo da coluna em
  // `src/shared/db/schema.ts`. Os tres andam juntos.
  'public.passkey_challenges.passkey_challenges_proposito_conhecido': {
    coluna: 'purpose',
    valores: ['registration', 'authentication'],
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
  // A secao `Rede` (ADR-0025, migracao 20260928000001, emendada pela secao
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
  // Os links do encontro (ADR-0027 item 22, migracao 20261001000003). O banco
  // confere so o esquema `https://` com host sem `@`, espaco nem barra, e o
  // teto de 500; sem usuario e senha, sem IP literal e sem host local e do
  // caso de uso, que analisa a URL.
  'public.network_events.network_events_link_de_ingresso_https':
    "CHECK (((ticket_url IS NULL) OR ((char_length(ticket_url) <= 500) AND (ticket_url ~ '^https:[/]{2}[^/?#@[:space:]]+'::text))))",
  // O handle do Instagram como o servidor o guarda: sem `@`, minusculo, 1 a 30.
  'public.network_events.network_events_instagram_forma':
    "CHECK (((instagram_handle IS NULL) OR (instagram_handle ~ '^[a-z0-9._]{1,30}$'::text)))",
  // A FORMA do nome IANA, e so a forma. Que a zona EXISTA e conferido pelo
  // gatilho `network_events_fuso_existe`, e a divisao de trabalho e deliberada:
  // consultar `pg_timezone_names` nao e imutavel, e o Postgres recusa funcao
  // volatil em restricao -- um CHECK com ela nem chega a ser criado.
  //
  // Os dois juntos sao o que separa `America/Sao_Paulo` de `America/Sao_Pualo`,
  // que passa na forma e renderiza a hora errada para sempre sem nada acusar.
  'public.network_events.network_events_fuso_tem_forma_iana':
    "CHECK ((time_zone ~ '^[A-Za-z]+/[A-Za-z_]+$'::text))",
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
  // A moeda: so BRL, e so quando ha valor.
  'public.network_events.network_events_moeda_conhecida':
    "CHECK (((admission_currency IS NULL) OR (admission_currency = 'BRL'::text)))",
  // A unidade do valor, lista fechada escrita com `IS NULL OR`, por isso aqui.
  'public.network_events.network_events_unidade_do_valor_conhecida':
    "CHECK (((admission_unit IS NULL) OR (admission_unit = ANY (ARRAY['per_dog'::text, 'per_pet'::text, 'per_person'::text, 'per_pair'::text, 'per_two_people'::text]))))",
  // Gratuito nao tem valor; pago tem.
  'public.network_events.network_events_valor_so_quando_pago':
    "CHECK (((admission_kind = 'free'::text) = (admission_amount IS NULL)))",
  // O identificador opaco do pedido, base64url.
  'public.network_event_join_requests.network_event_join_requests_ref_formato':
    "CHECK ((ref ~ '^[A-Za-z0-9_-]{20,32}$'::text))",
  // Decidido tem instante.
  'public.network_event_join_requests.network_event_join_requests_decidido_tem_instante':
    "CHECK (((status = ANY (ARRAY['approved'::text, 'declined'::text])) = (decided_at IS NOT NULL)))",
  // So o recusado guarda desistencia (D54, 12.11).
  'public.network_event_join_requests.network_event_join_requests_desistencia_so_do_recusado':
    "CHECK (((withdrawn_at IS NULL) OR (status = 'declined'::text)))",
  // O identificador opaco do pedido da plaquinha, base64url. Mesma forma do
  // `ref` do pedido de encontro, porque e a mesma necessidade.
  'public.collar_tag_requests.collar_tag_requests_ref_formato':
    "CHECK ((ref ~ '^[A-Za-z0-9_-]{20,32}$'::text))",
  // Decidido tem instante, nos dois sentidos.
  'public.collar_tag_requests.collar_tag_requests_decidido_tem_instante':
    "CHECK (((status = ANY (ARRAY['fulfilled'::text, 'declined'::text])) = (decided_at IS NOT NULL)))",
  // O CEP, oito digitos sem mascara. **Formato, nunca existencia**: nada
  // resolve CEP neste produto (ADR-0006), e o banco nao tem como saber se ele
  // confere com bairro e cidade.
  'public.collar_tag_requests.collar_tag_requests_cep_formato':
    "CHECK ((postal_code ~ '^[0-9]{8}$'::text))",
  // O telefone de quem recebe, E.164 do Brasil. A MESMA forma do contrato e
  // do `phone_e164` do perfil -- uma segunda redacao divergiria da primeira.
  'public.collar_tag_requests.collar_tag_requests_telefone_formato':
    "CHECK ((recipient_phone ~ '^\\+55[0-9]{10,11}$'::text))",
  // ------------------------------------------------------------------
  // O ENDERECO DE ENTREGA GUARDADO NA CONTA (`20261020000016`), autorizado
  // pelo cliente em 21/10/2026: *"um endereco de entrega salvo na conta,
  // reusado em todo pedido e editavel num lugar so"*.
  // ------------------------------------------------------------------
  //
  // As definicoes sao, caractere por caractere, as de `collar_tag_requests`
  // acima -- e a identidade e deliberada, nao copia por preguica: o endereco
  // guardado tem de poder PREENCHER o pedido sem o banco recusar. Se esta
  // tabela aceitasse um CEP de outra forma, o endereco guardado nasceria capaz
  // de produzir um pedido que o `CHECK` da outra tabela rejeita, e a pessoa
  // descobriria isso no botao de pedir.
  //
  // **SO DOIS dos nove `CHECK` desta tabela entram aqui**, e a razao e a regra
  // deste registro (`MENCIONA_LITERAL`): os outros sete sao
  // `char_length(col) BETWEEN a AND b` (e `char_length(state) = 2`), que o
  // catalogo escreve sem nenhum `'...'::text`. A descoberta nao os traz, e
  // declara-los faria o caso "restricao declarada que o banco nao tem mais"
  // reprovar -- foi exatamente o que aconteceu com os de `professionals` em
  // 18/10, e o comentario deles, acima, registra o episodio.
  'public.user_delivery_addresses.user_delivery_addresses_cep_formato':
    "CHECK ((postal_code ~ '^[0-9]{8}$'::text))",
  'public.user_delivery_addresses.user_delivery_addresses_telefone_formato':
    "CHECK ((recipient_phone ~ '^\\+55[0-9]{10,11}$'::text))",
  // ------------------------------------------------------------------
  // O ENDERECO DE ENTREGA DO PET (`20261027000001`)
  // ------------------------------------------------------------------
  // **Decisao do cliente de 27/10/2026** (*"endereco um por pet"*), que SUPERA
  // a de 21/10/2026 logo acima -- e a tabela da conta nao foi apagada (decisao
  // dele de 26/10/2026, *"nao apague nada"*), por isso as duas estao aqui.
  //
  // **AS DUAS EXPRESSOES SAO IDENTICAS, CARACTERE POR CARACTERE, AS DE CIMA**, e
  // isso nao e copia por preguica: e a condicao para o endereco do pet poder
  // PREENCHER o pedido da plaquinha. Se esta tabela aceitasse um CEP que
  // `collar_tag_requests` recusa, o endereco do pet nasceria capaz de produzir
  // um pedido que o banco rejeita, e a pessoa descobriria isso no botao de
  // pedir. **Divergir aqui e o defeito; ser igual e o requisito.**
  //
  // **SO DOIS dos nove `CHECK` desta tabela entram aqui**, pela mesma regra de
  // `MENCIONA_LITERAL` que a nota de cima explica: os outros sete sao
  // `char_length(col) BETWEEN a AND b` (e `char_length(state) = 2`), que o
  // catalogo escreve sem nenhum `'...'::text`, e declara-los faria o caso
  // "restricao declarada que o banco nao tem mais" reprovar.
  'public.pet_delivery_addresses.pet_delivery_addresses_cep_formato':
    "CHECK ((postal_code ~ '^[0-9]{8}$'::text))",
  'public.pet_delivery_addresses.pet_delivery_addresses_telefone_formato':
    "CHECK ((recipient_phone ~ '^\\+55[0-9]{10,11}$'::text))",
  // ------------------------------------------------------------------
  // A INDICACAO DO DIRETORIO (`20261017000004`), O CEP DELA
  // (`20261017000015`) E A FILA (`20261017000016`).
  // ------------------------------------------------------------------
  // O `ref` opaco da indicacao: 128 bits em base64url. A MESMA forma do `ref`
  // do pedido da plaquinha, e nao uma segunda redacao.
  'public.directory_suggestions.directory_suggestions_ref_formato':
    "CHECK ((ref ~ '^[A-Za-z0-9_-]{20,32}$'::text))",
  // O CEP da indicacao, oito digitos sem mascara, e ANULAVEL -- ao contrario
  // do da plaquinha, que e obrigatorio: quem indica de outro bairro costuma
  // nao saber o CEP. Formato, nunca existencia (ADR-0006).
  'public.directory_suggestions.directory_suggestions_cep_formato':
    "CHECK (((postal_code IS NULL) OR (postal_code ~ '^[0-9]{8}$'::text)))",
  // Os tres da fila, e a forma de cada um e deliberada (cabecalho da
  // `20261017000016`): o PRIMEIRO e bicondicional, porque "decidida" e
  // "decidida quando" precisam andar juntas nos dois sentidos; os outros dois
  // sao implicacao simples, para nao cobrar motivo de quem aprovou nem entrada
  // de quem recusou.
  'public.directory_suggestions.directory_suggestions_decisao_tem_instante':
    "CHECK (((review_status = 'pending'::text) = (decided_at IS NULL)))",
  'public.directory_suggestions.directory_suggestions_motivo_so_na_recusa':
    "CHECK (((decline_reason IS NULL) OR (review_status = 'declined'::text)))",
  // E o CHECK que garante que a ligacao com a entrada do diretorio NAO EXISTE
  // fora de `approved`. `SET NULL` na chave estrangeira o violaria, e e por
  // isso que `directory_suggestions_approved_entry_id_fkey` e NO ACTION.
  'public.directory_suggestions.directory_suggestions_entrada_so_na_aprovacao':
    "CHECK (((approved_entry_id IS NULL) OR (review_status = 'approved'::text)))",
  // ------------------------------------------------------------------
  // A AVALIACAO DO LOCAL E A DENUNCIA DELA (`20261017000017`).
  // ------------------------------------------------------------------
  // O `ref` da avaliacao: 22 caracteres, a forma de 128 bits em base64url SEM
  // enchimento. A da indicacao aceita 20..32 porque e mais velha; esta fixa o
  // tamanho exato.
  'public.professional_reviews.professional_reviews_ref_formato':
    "CHECK ((ref ~ '^[A-Za-z0-9_-]{22}$'::text))",
  // O corpo e OPCIONAL -- nota sem texto e avaliacao valida --, e quando vem
  // nao pode ser espaco em branco nem carregar `<` ou `>`. O segundo nao e
  // sanitizacao: e a recusa que sobra quando alguem escrever na tabela por
  // outro caminho que nao a borda.
  'public.professional_reviews.professional_reviews_body_nao_vazio':
    "CHECK (((body IS NULL) OR (btrim(body) <> ''::text)))",
  'public.professional_reviews.professional_reviews_body_sem_html':
    "CHECK (((body IS NULL) OR (body !~ '[<>]'::text)))",
  // Esconder ou remover EXIGE motivo e instante, e publicar exige a ausencia
  // dos dois -- nos dois sentidos. E o que torna "a remocao fica registrada
  // com o motivo" (ADR-0011) invariante de banco e nao disciplina de quem
  // modera.
  'public.professional_reviews.professional_reviews_moderacao_tem_motivo':
    "CHECK ((((status = 'published'::text) AND (moderation_reason IS NULL) AND (moderated_at IS NULL)) OR ((status <> 'published'::text) AND (moderation_reason IS NOT NULL) AND (moderated_at IS NOT NULL))))",
  // O detalhe da denuncia, pelo mesmo motivo do corpo da avaliacao.
  'public.professional_review_reports.professional_review_reports_detail_sem_html':
    "CHECK (((detail IS NULL) OR (detail !~ '[<>]'::text)))",
  // `network_events_revisao_so_da_comunidade` ESTAVA AQUI, e a ausencia e a
  // decisao. Ele amarrava `pending_review` a origem `community`, e a
  // `20261001000005` derrubou os dois: o cliente desfez a fila de moderacao em
  // 17/10/2026 (ADR-0025 emenda 3). Mantida a entrada, o caso "restricao
  // declarada que o banco nao tem mais" reprovaria -- que e o portao certo,
  // pedindo que alguem olhasse. Alguem olhou, e a resposta esta aqui.
  // ADR-0027 A.4 (item 20.2, 20260928000005). Cada autor so na sua origem: o
  // de `users` so em encontro `community`, o de `admin_accounts` so em `admin`.
  'public.network_events.network_events_autor_da_comunidade':
    "CHECK (((created_by_user_id IS NULL) OR (origin = 'community'::text)))",
  'public.network_events.network_events_autor_do_painel':
    "CHECK (((created_by_admin_id IS NULL) OR (origin = 'admin'::text)))",

  // ------------------------------------------------------------------
  // A vitrine da `Loja` (BICHUS-185 / BICHUS-189, migracao 20260922000009).
  // Nenhum destes e lista fechada: sao formato, faixa e coerencia entre
  // colunas. **A vitrine nao tem mais nenhum conjunto fechado aqui**: era
  // `store_items_categoria`, com os seis valores, e a `20261017000003` o
  // trocou por chave estrangeira -- ver a nota em LISTAS_FECHADAS.
  //
  // `store_items_subcategoria_exige_categoria` (`subcategory IS NULL OR
  // category IS NOT NULL`, da mesma migracao) tambem **nao esta em registro
  // nenhum**, e pela razao dos cinco abaixo: e coerencia entre colunas, sem
  // literal de texto. Declara-lo seria entrada fantasma.
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
  // ADR-0027 A.2.1 (BICHUS-267). O vocabulario de tags usa o MESMO formato de
  // endereco publico do item e do parceiro: o `slug` da tag e o parametro de
  // filtro do app e o de caminho do painel.
  'public.store_tags.store_tags_slug_formato':
    "CHECK ((slug ~ '^[a-z0-9][a-z0-9-]{1,28}[a-z0-9]$'::text))",
  // Caminho, e nao URL: o banco nao guarda endereco (docs/07-devops.md secao
  // 3.6), e o absoluto e composto na leitura com o host do parceiro. O
  // esquema `https` deixou de ser assunto do banco porque deixou de ser
  // dado -- ele e constante da composicao.
  //
  // As duas formas abaixo DEIXARAM DE SER IGUAIS em 17/10/2026, e a diferenca
  // e deliberada. `target_path` aceita `?` e `#` desde a `20261017000001`; o
  // caminho da imagem, logo depois dela, continua sem os dois.
  //
  // A proibicao que estava aqui citava a consequencia 3 da BICHUS-185
  // (parametro em link de saida e onde dado pessoal vaza) e acertava o risco,
  // errava o INSTRUMENTO: proibir `?` na coluna nao impede dado pessoal de
  // viajar, impede QUALQUER parametro -- e loja de verdade identifica o SKU
  // exatamente assim (`/p?idsku=1197673`, no catalogo da Cobasi, foi o link
  // legitimo que ficou bloqueado). A consequencia 3 continua valendo e
  // continua tendo dono: ela e sobre o que o APLICATIVO acrescenta na saida, e
  // isso e garantido na tela (`app/test/telas/loja_abre_no_navegador_test.dart`
  // reprova se algum parametro aparecer), nao nesta coluna. O cabecalho da
  // `20261017000001` tem o raciocinio por extenso.
  //
  // O que sobrou no `CHECK` nao e sobre privacidade: comeca em `/` e nao tem
  // espaco em branco (`[[:space:]]` cobre espaco, tabulacao e quebra de
  // linha), porque a coluna guarda um caminho e nao uma frase.
  'public.store_items.store_items_destino_e_caminho':
    "CHECK ((target_path ~ '^/[^[:space:]]*$'::text))",
  // `image_path` CONTINUA sem `?` e sem `#`, e por isso ganhou comentario
  // proprio: a `20261017000001` abriu o caminho do DESTINO, e so ele. Caminho
  // de imagem de catalogo nao carrega identificador de produto, entao aqui a
  // proibicao larga nao bloqueia nada legitimo e a consequencia 3 da
  // BICHUS-185 segue sendo a razao dela.
  'public.store_items.store_items_imagem_e_caminho':
    "CHECK (((image_path IS NULL) OR (image_path ~ '^/[^[:space:]?#]*$'::text)))",
  // O host do destino quando ele e um SUBDOMINIO do parceiro
  // (`20261017000001`): `www.cobasi.com.br` para o parceiro `cobasi.com.br`.
  // NULO no caso comum, que e o host ser o do proprio parceiro. A forma e a
  // MESMA de `store_partners.host`, logo abaixo, porque e o mesmo dado.
  //
  // O `CHECK` confere so a FORMA. O vinculo "e subdominio do parceiro" e da
  // aplicacao (`errosDoDestino`), porque depende de OUTRA tabela e um `CHECK`
  // nao enxerga `store_partners` -- e a comparacao de la e por sufixo COM
  // FRONTEIRA DE ROTULO, senao `malcobasi.com.br` passaria por subdominio de
  // `cobasi.com.br`.
  'public.store_items.store_items_destino_e_so_host':
    "CHECK (((target_host IS NULL) OR (target_host ~ '^[a-z0-9]([a-z0-9-]*[a-z0-9])?(\\.[a-z0-9]([a-z0-9-]*[a-z0-9])?)+$'::text)))",
  // ------------------------------------------------------------------
  // A TAXONOMIA DOS DOIS NIVEIS DA LOJA (migracao `20261017000003`)
  // ------------------------------------------------------------------
  //
  // Formato de codigo de dado de referencia, COPIADO de `ref_breeds.code` e
  // `ref_colors.code`: a taxonomia da Loja segue a forma que o produto ja usa
  // para raca e cor, e nao uma segunda convencao para o mesmo problema.
  //
  // **Nenhum destes tres e lista fechada**, e a diferenca importa: eles dizem
  // a FORMA do codigo, e o conjunto de codigos aceitos mora nas LINHAS de
  // `store_categories` e `store_subcategories`. Foi essa troca -- conjunto no
  // CHECK por conjunto na tabela -- que a decisao do cliente de 17/10 ("dois
  // niveis, com subcategorias como a petlove") obrigou.
  //
  // Os dois CHECKs de tamanho de rotulo
  // (`store_categories_rotulo_tem_tamanho` e o irmao de
  // `store_subcategories`) **nao estao aqui, de proposito**, pela mesma razao
  // dos cinco da vitrine registrada acima: nenhum deles menciona literal de
  // texto, `MENCIONA_LITERAL` nao casa, e eles ficariam como entrada fantasma.
  'public.store_categories.store_categories_codigo_formato':
    "CHECK ((code ~ '^[a-z][a-z0-9_]{1,29}$'::text))",
  'public.store_subcategories.store_subcategories_codigo_formato':
    "CHECK ((code ~ '^[a-z][a-z0-9_]{1,39}$'::text))",
  // A subcategoria do item e OPCIONAL, e o `IS NULL OR` e a opcionalidade
  // escrita: produto sem segundo nivel continua valido, e exigi-lo
  // invalidaria todo cadastro anterior de uma vez.
  'public.store_items.store_items_subcategoria_formato':
    "CHECK (((subcategory IS NULL) OR (subcategory ~ '^[a-z][a-z0-9_]{1,39}$'::text)))",
  // So o HOST, sem esquema, caminho nem consulta. Guardar a URL inteira
  // convidaria um parametro a viajar junto, e parametro em link de saida e
  // onde dado pessoal vaza (consequencia 3 da BICHUS-185).
  'public.store_partners.store_partners_host_e_so_host':
    "CHECK ((host ~ '^[a-z0-9]([a-z0-9-]*[a-z0-9])?(\\.[a-z0-9]([a-z0-9-]*[a-z0-9])?)+$'::text))",
  'audit.events.audit_events_ator_coerente':
    "CHECK (((actor_kind = 'user'::text) = (actor_user_id IS NOT NULL)))",
  // O gêmeo do de cima para o ator do painel (ADR-0027 apêndice A.5). As linhas
  // históricas têm `actor_admin_id` nulo e `actor_kind` diferente de `admin`, e
  // por isso cabem nele sem reescrita.
  'audit.events.audit_events_ator_admin_coerente':
    "CHECK (((actor_kind = 'admin'::text) = (actor_admin_id IS NOT NULL)))",
  // ADR-0027 item 20.1. Desativada tem instante, ativa não tem.
  'public.admin_accounts.admin_accounts_desativada_tem_quando':
    "CHECK (((status = 'disabled'::text) = (disabled_at IS NOT NULL)))",
  // O mesmo formato de `local_credentials_phc_pbkdf2_sha512`: o hash do painel
  // sai das mesmas funções que o do app.
  'public.admin_accounts.admin_accounts_phc_pbkdf2_sha512':
    "CHECK ((password_phc ~~ '$pbkdf2-sha512$%'::text))",
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
  // ADR-0027 A.3 (BICHUS-267). A mesma forma de `pet_photos`: pronta tem a
  // chave da derivada publica, recusada tem motivo. E a primeira que impede
  // servir a imagem antes de pronta pelo caminho do banco.
  'public.catalog_images.catalog_images_pronta_tem_chave':
    "CHECK (((status <> 'ready'::text) OR (public_key IS NOT NULL)))",
  'public.catalog_images.catalog_images_recusada_tem_motivo':
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
  // AS ATIVIDADES (`20261020000015`, decisao do cliente de 21/10/2026). Os
  // MESMOS seis valores que `professionals_kind_check` fixava em
  // `LISTAS_FECHADAS` -- a lista nao foi alargada, a COLUNA virou lista.
  //
  // Esta entrada esta AQUI e nao em `LISTAS_FECHADAS` por causa da FORMA:
  // `FORMA_SIMPLES` so reconhece `col = ANY (ARRAY[...])`, e a pergunta aqui e
  // sobre a lista INTEIRA (`kinds <@ ARRAY[...]`, "contida em"). Como a
  // definicao menciona literal de texto, `MENCIONA_LITERAL` casa e ela cai neste
  // registro, onde o que fica fixado e a definicao inteira.
  //
  // `<@` e nao `= ANY`: lista vazia satisfaz `<@`, e quem proibe a vazia e
  // `professionals_atividades_tamanho` -- que nao entra em registro nenhum por
  // ser faixa numerica sem literal.
  //
  // OITO VALORES desde 28/10/2026 (`20261028000001`, decisao do cliente):
  // `store` e `hospital` entraram. `store` NAO e a secao `Loja` do produto --
  // e um estabelecimento que vende aparecendo em `Perto`. ONG continua fora,
  // porque continua nao sendo atividade.
  'public.professionals.professionals_atividades_conhecidas':
    "CHECK ((kinds <@ ARRAY['vet'::text, 'groomer'::text, 'walker'::text, 'sitter'::text, 'trainer'::text, 'clinic'::text, 'store'::text, 'hospital'::text]))",
  // O ENDERECO DE RUA da entrada do diretorio (migracao `20261018000001`,
  // decisao 9.2 respondida pelo cliente em 18/10/2026). Os quatro `CHECK` sao
  // `IS NULL OR ...` porque as quatro colunas sao OPCIONAIS: profissional
  // autonomo nao tem endereco comercial, e exigir o dele significaria exigir a
  // casa dele. Nenhum dos quatro entra em `missing_to_publish`.
  'public.professionals.professionals_cep_oito_digitos':
    "CHECK (((postal_code IS NULL) OR (postal_code ~ '^[0-9]{8}$'::text)))",
  'public.professionals.professionals_cnpj_tamanho':
    "CHECK (((cnpj IS NULL) OR (cnpj ~ '^[0-9]{14}$'::text)))",
  //
  // `professionals_logradouro_tamanho`, `professionals_numero_tamanho` e
  // `professionals_complemento_tamanho` -- os outros tres da `20261018000001`
  // -- **NAO estao aqui, e nao e esquecimento.** Este registro e dos CHECK que
  // MENCIONAM literal de texto (`MENCIONA_LITERAL`, logo abaixo), e os tres sao
  // so `char_length(col) BETWEEN a AND b`: o catalogo os escreve sem nenhum
  // `'...'::text`, entao a descoberta nao os traz e declarar aqui faz o caso
  // "cada CHECK nao-lista tem exatamente a definicao declarada" reprovar. Foi o
  // que aconteceu: os tres entraram em 18/10 junto com a migracao, sem a suite
  // rodar, e as tres linhas reprovavam. `collar_tag_requests_logradouro_tamanho`
  // e os pares dele estao ausentes pela mesma razao, desde 17/10.
  // So `professionals_cep_oito_digitos` tem literal (a regex do CEP), e por
  // isso ele e o unico dos quatro que fica.
  // O endereco publico da entrada do diretorio. Formato COPIADO de
  // `pets_slug_formato`: os dois sao endereco publico do mesmo produto, e dois
  // formatos diferentes para a mesma coisa e o defeito que a duplicacao produz.
  'public.professionals.professionals_slug_formato':
    "CHECK (((slug IS NULL) OR (slug ~ '^[a-z0-9][a-z0-9-]{1,28}[a-z0-9]$'::text)))",
  'public.professionals.professionals_telefone_formato':
    "CHECK (((phone_e164 IS NULL) OR (phone_e164 ~ '^\\+[1-9][0-9]{7,14}$'::text)))",
  'public.professionals.professionals_titularidade_tem_marco':
    "CHECK ((((claim_status = 'unclaimed'::text) AND (claimed_at IS NULL) AND (claimed_by_user_id IS NULL)) OR ((claim_status <> 'unclaimed'::text) AND (claimed_at IS NOT NULL))))",
  // ------------------------------------------------------------------
  // A fila de revisao de `Perto` (migracao 20261017000004), e a versao da
  // entrada do diretorio (20261017000011).
  // ------------------------------------------------------------------
  //
  // **A `professionals_versao_positiva` da `20261017000011` nao entra em
  // registro nenhum**, e a ausencia e a decisao -- a mesma que mantem fora o
  // `network_events_versao_positiva` de onde a migracao a copiou: faixa
  // numerica (`CHECK ((version > 0))`) nao menciona literal de texto, a
  // classificacao do cabecalho nao a colhe, e declara-la aqui faria o caso
  // "restricao declarada que o banco nao tem mais" reprovar.
  //
  // Os seis CHECKs de `char_length` da `20261017000004`
  // (`..._nome_tamanho`, `..._cidade_tamanho`, `..._uf_tamanho`,
  // `..._bairro_tamanho`, `..._contato_tamanho` e `..._recado_tamanho`) ficam
  // fora pela mesma regra. As tres listas fechadas da tabela estao em
  // LISTAS_FECHADAS; os DOIS que mencionam literal (`..._ref_formato` e
  // `..._decisao_tem_instante`) estao mais acima neste mesmo registro, no
  // bloco da INDICACAO DO DIRETORIO, junto com os outros tres da fila.
  //
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
  // BICHUS-41. O achador sem conta envia foto, e não tem `users.id`. Só
  // `finder_photo` nasce sem dono; as outras duas espécies continuam exigindo.
  'public.upload_intents.upload_intents_dono_salvo_achador_sem_conta':
    "CHECK (((user_id IS NOT NULL) OR (kind = 'finder_photo'::text)))",
  // BICHUS-41. A foto do achador sem conta sempre pertence a um aviso (o teto de
  // três por aviso precisa do que contar) e sempre tem a referência opaca que
  // ele devolve em `PATCH /v1/finder/found-report`.
  'public.upload_intents.upload_intents_foto_do_achador_tem_aviso_e_ref':
    "CHECK (((kind <> 'finder_photo'::text) OR ((found_report_id IS NOT NULL) AND (upload_ref IS NOT NULL))))",
  // BICHUS-245, migracao 20261001000006. A coerencia entre o estado da higiene
  // da foto e os dois campos que ele governa, nos DOIS sentidos: `pronta` tem
  // chave da derivada e nao tem motivo; `recusada` tem motivo e nao tem chave;
  // `pendente` e `ausente` nao tem nenhum dos dois. Sem os dois sentidos o
  // banco aceitaria uma linha com os campos do outro estado, que e uma linha
  // que nenhum codigo sabe ler. O CONJUNTO de `sanitize_status` nao esta aqui:
  // ele e a lista fechada `upload_intents_status_da_higiene`, em LISTAS_FECHADAS.
  'public.upload_intents.upload_intents_higiene_coerente':
    "CHECK ((((sanitize_status = 'pronta'::text) AND (sanitized_key IS NOT NULL) AND (sanitize_rejection_reason IS NULL)) OR ((sanitize_status = 'recusada'::text) AND (sanitized_key IS NULL) AND (sanitize_rejection_reason IS NOT NULL)) OR ((sanitize_status = ANY (ARRAY['pendente'::text, 'ausente'::text])) AND (sanitized_key IS NULL) AND (sanitize_rejection_reason IS NULL))))",
  // BICHUS-41. `FinderUploadIntent.upload_ref`: 128 bits em base64url, 22
  // caracteres, o mesmo padrão que o contrato declara.
  'public.upload_intents.upload_intents_upload_ref_formato':
    "CHECK (((upload_ref IS NULL) OR (upload_ref ~ '^[A-Za-z0-9_-]{22}$'::text)))",
  'public.users.users_phone_e164_formato':
    "CHECK (((phone_e164 IS NULL) OR (phone_e164 ~ '^\\+55[0-9]{10,11}$'::text)))",

  // =========================================================================
  // O LOTE DE 18/10/2026 (segunda metade). Ver a nota em LISTAS_FECHADAS: estas
  // vinte e tres entraram enquanto a suite de integracao nao rodava um caso, e
  // aparecem juntas porque o alarme voltou junto.
  // =========================================================================
  // ---------------------------------------------------------------------
  // 20261018000004, a entrega da plaquinha. Quatro CHECKs de COERENCIA entre o
  // estado do transporte e os campos que ele governa. Nenhum e lista fechada:
  // a lista (`requested`/`in_transit`/`arrived`) esta no primeiro registro, e
  // estes quatro dizem o que cada estado OBRIGA.
  // ---------------------------------------------------------------------
  // Igualdade dos dois lados (`=` entre booleanos), e nao implicacao: `arrived`
  // exige o instante E o instante exige `arrived`. Com implicacao so num
  // sentido, uma linha `in_transit` com `delivered_at` preenchido passaria.
  'public.collar_tag_requests.collar_tag_requests_chegada_tem_instante':
    "CHECK (((delivery_state = 'arrived'::text) = (delivered_at IS NOT NULL)))",
  'public.collar_tag_requests.collar_tag_requests_despacho_tem_instante':
    "CHECK (((delivery_state = ANY (ARRAY['in_transit'::text, 'arrived'::text])) = (shipped_at IS NOT NULL)))",
  // O transporte so sai do estado inicial depois de o pedido ter sido
  // ATENDIDO: nao se despacha o que ninguem produziu.
  'public.collar_tag_requests.collar_tag_requests_entrega_exige_atendimento':
    "CHECK (((delivery_state = 'requested'::text) OR (status = 'fulfilled'::text)))",
  // Codigo de rastreio antes de despachar e codigo que nao rastreia nada.
  'public.collar_tag_requests.collar_tag_requests_rastreio_so_apos_sair':
    "CHECK (((tracking_code IS NULL) OR (delivery_state <> 'requested'::text)))",
  // ---------------------------------------------------------------------
  // 20261018000014. `system_kind` so existe em mensagem do sistema, e o
  // conjunto dos tipos de mensagem do sistema. O segundo e LISTA FECHADA
  // DISFARCADA por estar sob um `IS NULL OR`: o catalogo nao a normaliza para a
  // forma simples, entao ela cai aqui, com a definicao inteira fixada -- que e
  // exatamente o caso que o cabecalho deste registro descreve.
  // ---------------------------------------------------------------------
  'public.conversation_messages.conversation_messages_especie_so_do_sistema':
    "CHECK (((system_kind IS NULL) OR (sender_role = 'system'::text)))",
  'public.conversation_messages.conversation_messages_system_kind_conhecido':
    "CHECK (((system_kind IS NULL) OR (system_kind = ANY (ARRAY['scan_notice'::text, 'found_notice'::text, 'redaction_warning'::text]))))",
  // ---------------------------------------------------------------------
  // A RESOLUCAO DA FILA DE MODERACAO, nas quatro filas que existem
  // (`conversation_reports` e `professional_review_reports` da
  // `20261018000009`; `photo_reports`, `profile_reports` e
  // `publication_reports` da `20261018000032`). As CINCO tem a MESMA dupla --
  // `content_removed` / `dismissed` -- e as cinco estao sob `IS NULL OR`,
  // porque denuncia aberta ainda nao tem resolucao. Fixadas uma a uma de
  // proposito: e isso que faz a sexta fila, no dia em que existir, ter de
  // escrever a linha dela aqui em vez de herdar o conjunto em silencio.
  // ---------------------------------------------------------------------
  'public.conversation_reports.conversation_reports_resolution_conhecida':
    "CHECK (((resolution IS NULL) OR (resolution = ANY (ARRAY['content_removed'::text, 'dismissed'::text]))))",
  // ---------------------------------------------------------------------
  // 20261018000021. Apelido de pessoa TEM dono -- sem isto, `kind = 'pessoa'`
  // sem `user_id` seria indistinguivel de uma reservada sem estar na lista.
  //
  // **ESTE CHECK CONTRADIZIA O `ON DELETE SET NULL` da propria coluna**, e a
  // contradicao foi medida em 19/10 (23514 em `DELETE FROM users` de quem tem
  // apelido). A `20261019000004` conserta pelo lado que preserva as DUAS
  // decisoes escritas: um gatilho transforma o apelido orfao em `reservado`
  // antes de o CHECK ser avaliado, entao o apelido nao volta ao pool e nao
  // sobra linha `pessoa` sem dono. O veredito medido do par esta em
  // `PARES_DE_NULO_CONTRA_RESTRICAO`, em
  // `chave-estrangeira-contra-restricao.test.ts`.
  // ---------------------------------------------------------------------
  'public.handles.handles_pessoa_tem_dono':
    "CHECK (((kind <> 'pessoa'::text) OR (user_id IS NOT NULL)))",
  // ---------------------------------------------------------------------
  // 20261018000020. O endereco publico opaco do item e do comunicado da caixa
  // de notificacoes: 20 a 32 simbolos de base64url. A FAIXA e maior que a de 22
  // dos outros `ref` deste banco, e a diferenca e deliberada -- estes dois
  // nascem de origens de comprimento diferente.
  // ---------------------------------------------------------------------
  'public.notification_broadcasts.notification_broadcasts_ref_formato':
    "CHECK ((ref ~ '^[A-Za-z0-9_-]{20,32}$'::text))",
  'public.notification_items.notification_items_ref_formato':
    "CHECK ((ref ~ '^[A-Za-z0-9_-]{20,32}$'::text))",
  // ---------------------------------------------------------------------
  // O TEXTO LIVRE DAS TRES FILAS DE DENUNCIA (20261018000032) nao aceita `<`
  // nem `>`. E recusa no BANCO e nao escape na saida: o detalhe da denuncia e
  // lido no painel, e um painel que recebesse marcacao dependeria de todo
  // caminho de leitura escapar sempre. Anulavel porque detalhe e opcional.
  // ---------------------------------------------------------------------
  'public.photo_reports.photo_reports_detail_sem_html':
    "CHECK (((detail IS NULL) OR (detail !~ '[<>]'::text)))",
  'public.photo_reports.photo_reports_resolution_conhecida':
    "CHECK (((resolution IS NULL) OR (resolution = ANY (ARRAY['content_removed'::text, 'dismissed'::text]))))",
  'public.professional_review_reports.professional_review_reports_resolution_conhecida':
    "CHECK (((resolution IS NULL) OR (resolution = ANY (ARRAY['content_removed'::text, 'dismissed'::text]))))",
  'public.profile_reports.profile_reports_detail_sem_html':
    "CHECK (((detail IS NULL) OR (detail !~ '[<>]'::text)))",
  'public.profile_reports.profile_reports_resolution_conhecida':
    "CHECK (((resolution IS NULL) OR (resolution = ANY (ARRAY['content_removed'::text, 'dismissed'::text]))))",
  // O ALVO da denuncia de perfil e o `users.public_ref` (22 simbolos de
  // base64url), e NAO o `users.id`: ADR-0010 item 6 proibe UUID interno em
  // saida publica, e a denuncia atravessa a superficie publica. Copia em valor
  // e nao chave estrangeira, de proposito (ADR-0024): a fila continua
  // agrupando pelo mesmo alvo depois do expurgo.
  'public.profile_reports.profile_reports_subject_ref_forma':
    "CHECK ((subject_ref ~ '^[A-Za-z0-9_-]{22}$'::text))",
  'public.publication_reports.publication_reports_detail_sem_html':
    "CHECK (((detail IS NULL) OR (detail !~ '[<>]'::text)))",
  // O mesmo desenho para a publicacao denunciada: endereco opaco de 22
  // simbolos, copiado em valor.
  'public.publication_reports.publication_reports_ref_forma':
    "CHECK ((publication_ref ~ '^[A-Za-z0-9_-]{22}$'::text))",
  'public.publication_reports.publication_reports_resolution_conhecida':
    "CHECK (((resolution IS NULL) OR (resolution = ANY (ARRAY['content_removed'::text, 'dismissed'::text]))))",
  // ---------------------------------------------------------------------
  // 20261018000030, a conexao simetrica. Dois CHECKs de coerencia por
  // IGUALDADE entre booleanos, e mais o formato do `ref`.
  // ---------------------------------------------------------------------
  // O descanso (a janela em que nao se pede de novo) existe EXATAMENTE em
  // `declined`, nos dois sentidos: recusa sem descanso deixaria reenviar na
  // hora, e descanso sem recusa seria castigo sem causa.
  'public.user_connections.user_connections_descanso_so_na_recusa':
    "CHECK (((state = 'declined'::text) = (rest_until IS NOT NULL)))",
  // O endereco publico do convite, no mesmo molde de 22 simbolos.
  'public.user_connections.user_connections_ref_opaca':
    "CHECK ((ref ~ '^[A-Za-z0-9_-]{22}$'::text))",
  // `pending` e exatamente "sem instante de resposta", nos dois sentidos: a
  // alternativa seria um convite respondido que continua aparecendo como
  // pendente, ou um pendente com data de resposta.
  'public.user_connections.user_connections_resposta_coerente':
    "CHECK (((state = 'pending'::text) = (responded_at IS NULL)))",
  // ---------------------------------------------------------------------
  // 20261018000031. O formato do ENDERECO PUBLICO DA PESSOA: 22 simbolos de
  // base64url, 128 bits sorteados por linha. `NOT NULL` e SEM valor padrao de
  // proposito -- quem cria a conta preenche, e um padrao no banco apagaria o
  // freio que faz um caminho de criacao novo nao compilar sem preencher. E o
  // que o ADR-0024 separa: `id` uuid primaria para dentro, endereco opaco ao
  // lado para fora (ADR-0010 item 6).
  // ---------------------------------------------------------------------
  'public.users.users_public_ref_forma':
    "CHECK ((public_ref ~ '^[A-Za-z0-9_-]{22}$'::text))",

  // ------------------------------------------------------------------
  // O MURAL (migracoes 20261020000002 e 20261020000006, 20/10/2026).
  //
  // O endereco publico opaco das duas tabelas, 22 caracteres base64url. NAO e
  // o `slug` legivel de `network_events` nem de `pets`: publicacao e
  // comentario nao tem titulo para derivar endereco, e o opaco e o que impede
  // adivinhar o vizinho contando. A forma e a MESMA nas duas, de proposito.
  //
  // Os outros CHECKs do Mural nao entram aqui, e a ausencia e a regra do
  // cabecalho e nao esquecimento: `user_publications_corpo_tamanho`,
  // `user_publications_texto_alternativo_tamanho` e
  // `user_publications_texto_alternativo_pede_imagem` sao faixa numerica e
  // comparacao entre colunas, sem literal de texto, e declara-los faria o caso
  // "restricao declarada que o banco nao tem mais" reprovar.
  // ------------------------------------------------------------------
  'public.user_publications.user_publications_ref_forma':
    "CHECK ((public_ref ~ '^[A-Za-z0-9_-]{22}$'::text))",
  'public.publication_comments.publication_comments_ref_forma':
    "CHECK ((public_ref ~ '^[A-Za-z0-9_-]{22}$'::text))",
  // ---------------------------------------------------------------------
  // 20261019000007, a politica de versao minima do aplicativo -- o
  // interruptor capaz de trancar a base inteira fora do produto. Os tres
  // abaixo mencionam literal de texto e NAO sao lista fechada: dois sao
  // expressao regular de formato e o terceiro e formato mais comprimento.
  //
  // A lista fechada da tabela (`platform`) esta em LISTAS_FECHADAS. O quinto
  // CHECK, `app_version_policy_updated_by_check`, e `length(updated_by) <=
  // 120`: sem literal de texto, a classificacao nao o colhe, e declara-lo
  // aqui faria o caso "restricao declarada que o banco nao tem mais"
  // reprovar -- a mesma regra das restricoes de faixa da `Rede`, anotada no
  // topo deste registro.
  //
  // Estes CHECKs sao o que torna a tabela preferivel a `.env` para este
  // valor: quem escreve `'1.10'` as pressas e recusado NO `UPDATE`, com a
  // politica anterior intacta e a API de pe, em vez de descobrir o erro de
  // digitacao no boot seguinte ou nunca.
  // ---------------------------------------------------------------------
  //
  // O MESMO formato que `AppVersion` do contrato cobra na requisicao, e ele
  // esta no banco porque e aqui que a mao humana escreve. `'1.10'`,
  // `'v1.10.0'`, `'1.10.0-rc1'` e `' 1.10.0'` sao recusados. Nulo passa (a
  // ausencia e que libera: nula = ninguem bloqueado).
  'public.app_version_policy.app_version_policy_minimum_version_check':
    "CHECK ((minimum_version ~ '^(0|[1-9][0-9]{0,3})\\.(0|[1-9][0-9]{0,3})\\.(0|[1-9][0-9]{0,3})$'::text))",
  // Identico ao de cima, caractere a caractere, e nas DUAS colunas de
  // proposito: os dois estados sao coisas diferentes (um fecha o produto, o
  // outro e um bilhete dispensavel) mas o FORMATO do numero e o mesmo, e
  // divergir aqui aceitaria na faixa branda um numero que a faixa dura
  // recusa.
  'public.app_version_policy.app_version_policy_recommended_version_check':
    "CHECK ((recommended_version ~ '^(0|[1-9][0-9]{0,3})\\.(0|[1-9][0-9]{0,3})\\.(0|[1-9][0-9]{0,3})$'::text))",
  // O destino do botao da tela de bloqueio: `https://` e nenhum espaco, mais
  // o teto de 300. As DUAS metades estao na mesma restricao e por isso a
  // definicao vem com `AND` -- um endereco digitado as pressas com `http://`
  // ou com espaco no fim abriria o navegador em lugar nenhum, e quem esta
  // bloqueado ficaria sem saida.
  'public.app_version_policy.app_version_policy_store_url_check':
    "CHECK (((store_url ~ '^https://[^[:space:]]+$'::text) AND (length(store_url) <= 300)))",
  // ------------------------------------------------------------------
  // CREDENCIAL DIGITAL / PASSKEY (BICHUS-301, migracao 20261027000020)
  // ------------------------------------------------------------------
  //
  // Os dois abaixo mencionam literal de texto e NAO sao lista fechada simples.
  //
  // `passkey_credentials_razao_conhecida` E uma lista fechada por tras, mas o
  // `IS NULL OR` na frente tira a forma simples: a coluna e nula enquanto a
  // credencial nao foi revogada, e o envelope faz `FORMA_SIMPLES` nao casar.
  // Cai aqui por isso, com a definicao inteira fixada -- e nao por descuido.
  //
  // Os OUTROS TRES CHECK destas tabelas NAO estao em registro nenhum, e isso e
  // deliberado: `passkey_credentials_contador_nao_negativo` (`sign_count >= 0`),
  // `passkey_credentials_revogacao_completa` (compara duas colunas entre si) e
  // `passkey_credentials_rotulo_com_teto` (`char_length` entre 1 e 60) nao tem
  // nenhum `'...'::text`, entao `MENCIONA_LITERAL` nao os colhe e declara-los
  // viraria entrada fantasma -- o mesmo erro que os de `professionals`
  // documentam acima.
  'public.passkey_challenges.passkey_challenges_dono_conforme_proposito':
    "CHECK ((((purpose = 'registration'::text) AND (user_id IS NOT NULL)) OR ((purpose = 'authentication'::text) AND (user_id IS NULL))))",
  'public.passkey_credentials.passkey_credentials_razao_conhecida':
    "CHECK (((revoked_reason IS NULL) OR (revoked_reason = ANY (ARRAY['user'::text, 'counter_regression'::text, 'account_deleted'::text]))))",
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
      // Assertiva, e não `continue`. Com `continue`, uma entrada que o
      // classificador nunca pôs aqui (porque a restrição caiu no OUTRO registro,
      // ou porque não menciona literal) passava por este caso sem conferir nada,
      // e só o caso de cobertura acima acusava. Um caso que pode terminar verde
      // sem ter comparado é o silêncio que este arquivo existe para quebrar.
      assert.ok(
        atual !== undefined,
        `${chave} está declarada em CHECKS_QUE_NAO_SAO_LISTA_FECHADA e o banco não a tem ` +
          'nesse registro: ou sumiu, ou virou lista fechada simples, ou deixou de mencionar literal.',
      );
      assert.equal(
        atual,
        esperada,
        `${chave} mudou de definição. Isto não é formatação: pg_get_constraintdef devolve a ` +
          'expressão que o banco APLICA, e mudança aqui é mudança de regra.',
      );
    }
  });

  void it('toda lista declarada caiu no registro de lista fechada, e nenhuma no de CHECK comum', () => {
    // Uma lista fechada pode mudar de forma no catálogo sem ninguém ver: `IN`
    // de um valor só vira `col = 'v'::text`, e uma cláusula a mais vira
    // disjunção. Nos dois casos ela sai de `simples` e entra em `naoSimples`,
    // e o conjunto deixa de ser conferido como conjunto. Este caso nomeia a
    // restrição que escorregou, em vez de deixar o `get()` devolver `undefined`.
    const escorregaram = Object.keys(LISTAS_FECHADAS).filter((c) => !simples.has(c) || naoSimples.has(c));
    assert.deepEqual(
      escorregaram,
      [],
      'lista declarada em LISTAS_FECHADAS que o banco não guarda como lista fechada simples. ' +
        'Escreva a restrição como `col IN (...)`, ou `col = ANY (ARRAY[...])` quando houver um valor só.',
    );
    // A que motivou este caso, pelo nome: o ator da trilha (ADR-0027 A.5).
    assert.deepEqual(
      [...(simples.get('audit.events.events_actor_kind_check')?.valores ?? [])].sort(),
      ['admin', 'anonymous', 'system', 'user'],
      'audit.events.events_actor_kind_check não está no registro de lista fechada com os quatro atores',
    );
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

void describe('as duas pontas da esteira de imagem aceitam o MESMO purpose', () => {
  // POR QUE UM CASO SO PARA ISTO. `catalog_upload_intents.purpose` e o
  // proposito DECLARADO no envio; `catalog_images.purpose` e o GRAVADO na
  // confirmacao, e a escrita que confirma exige o mesmo valor (T9). Os dois
  // conjuntos estao declarados em LISTAS_FECHADAS, cada um na sua entrada, e
  // nada obrigava os dois a serem iguais: quem acrescentasse um proposito a
  // UMA das migracoes passaria pelos dois casos de conjunto exato, porque cada
  // um olha a sua lista. O envio entao nasceria aceito e a confirmacao
  // recusaria com 23514 -- imagem que some entre as duas tabelas.
  //
  // Medido em 19/10: as duas definicoes sao iguais caractere a caractere, nos
  // mesmos seis valores. Este caso existe para que continuem.
  void it('os dois CHECK de purpose tem a MESMA definicao, caractere a caractere', () => {
    const intencao = simples.get('public.catalog_upload_intents.catalog_upload_intents_proposito');
    const imagem = simples.get('public.catalog_images.catalog_images_proposito');
    assert.ok(intencao, 'catalog_upload_intents_proposito nao existe no banco como lista fechada');
    assert.ok(imagem, 'catalog_images_proposito nao existe no banco como lista fechada');
    assert.deepEqual(
      [...imagem.valores].sort(),
      [...intencao.valores].sort(),
      'a intencao de envio e a imagem de catalogo deixaram de aceitar o mesmo `purpose`: ' +
        'um proposito aceito num lado e recusado no outro e envio que some entre as duas ' +
        'tabelas, com 23514 na confirmacao.',
    );
    // A metade que impede este caso de passar por lista vazia nos dois lados.
    assert.ok(
      intencao.valores.length >= 2,
      'menos de dois propositos: o caso nao teve o que comparar',
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
