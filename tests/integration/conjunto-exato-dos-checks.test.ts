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
  'public.pet_transfers.pet_transfers_motivo_conhecido': {
    coluna: 'cancellation_reason',
    // `MotivoDoCancelamento`, mesmo arquivo. `lost_case_opened` e a resposta da
    // BICHUS-66 ao caso que nem ela nem a BICHUS-21 previram: o pet marcado
    // como perdido no meio da janela. `recipient_gone` e o `ON DELETE SET NULL`
    // de `to_user_id` chegando ao dominio.
    valores: ['current_owner', 'cancel_token', 'lost_case_opened', 'recipient_gone'],
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
    valores: ['email_verify', 'password_reset', 'email_change'],
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
  'public.professionals.professionals_telefone_formato':
    "CHECK (((phone_e164 IS NULL) OR (phone_e164 ~ '^\\+[1-9][0-9]{7,14}$'::text)))",
  'public.professionals.professionals_titularidade_tem_marco':
    "CHECK ((((claim_status = 'unclaimed'::text) AND (claimed_at IS NULL) AND (claimed_by_user_id IS NULL)) OR ((claim_status <> 'unclaimed'::text) AND (claimed_at IS NOT NULL))))",
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
