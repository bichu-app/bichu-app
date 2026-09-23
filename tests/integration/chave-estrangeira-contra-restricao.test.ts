/**
 * A ação de deleção de cada chave estrangeira, cruzada com o que as restrições
 * da mesma tabela permitem.
 *
 * ===========================================================================
 * A CLASSE DE DEFEITO QUE ESTE ARQUIVO VIGIA
 * ===========================================================================
 * Uma chave estrangeira `ON DELETE SET NULL` sobre uma coluna que um `CHECK`
 * torna obrigatória é uma contradição entre duas declarações do mesmo banco.
 * Ela não aparece em teste unitário (dublê não tem chave estrangeira), não
 * aparece na criação (a linha nasce válida) e não aparece em uso normal.
 * Aparece quando alguém apaga a linha do outro lado — e o caminho que apaga
 * linha do outro lado é a **exclusão de conta**, que é direito da pessoa e
 * obrigação legal. O Postgres tenta pôr o nulo, o `CHECK` recusa, e a exclusão
 * falha com `23514`.
 *
 * Em 22/09 apareceram três ocorrências em um dia:
 * `found_reports.reporter_user_id`, `match_candidates.decided_by_user_id` e
 * `found_reports.tag_id`. Três não é coincidência: é uma classe, e classe se
 * vigia com portão, não com atenção.
 *
 * A classe é maior que o `SET NULL`. São quatro combinações, e a terceira é a
 * mais perigosa porque não falha:
 *
 * 1. `SET NULL` sobre coluna `NOT NULL` — decidível pelo catálogo, sem opinião.
 * 2. `SET NULL` sobre coluna que um `CHECK` exige — o defeito de 22/09. Não é
 *    decidível mecanicamente (depende do valor das OUTRAS colunas da linha),
 *    então o par é DESCOBERTO mecanicamente e o veredito é ESCRITO à mão.
 * 3. `SET DEFAULT` sem default declarado, ou com default que o `CHECK` recusa.
 * 4. `CASCADE` que apaga mais do que a pessoa esperaria. Este não estoura: ele
 *    apaga em silêncio, e o silêncio é o que o torna pior. Por isso toda
 *    `CASCADE` do banco está declarada aqui com **de quem é a linha que some**.
 *
 * ===========================================================================
 * TRÊS DECISÕES DE FORMA, E O MOTIVO DE CADA UMA
 * ===========================================================================
 * Mesma forma de `conjunto-exato-dos-checks.test.ts`, e pelos mesmos motivos.
 *
 * 1. **A descoberta é no catálogo, nunca nas migrações.** A lição de 22/09 é
 *    literal: uma migração dizia uma coisa e o banco tinha outra, e quem leu o
 *    arquivo concluiu errado. Quem responde qual é a ação de deleção é
 *    `pg_constraint.confdeltype`, porque é ele que o Postgres executa.
 *
 * 2. **O esperado está escrito aqui, por extenso.** Derivar o esperado do
 *    próprio banco compara o banco com ele mesmo e fica verde com qualquer
 *    coisa.
 *
 * 3. **Chave estrangeira ou par que apareça sem entrada aqui REPROVA,
 *    nomeando.** O defeito que se quer impedir é o silêncio: FK nova entra com
 *    a ação errada, ninguém declara, ninguém vê. O passo extra de escrever a
 *    entrada é o único momento em que alguém olha para a ação de deleção em vez
 *    de para a coluna que está acrescentando.
 *
 * ===========================================================================
 * POR QUE O VEREDITO DO PAR É ESCRITO À MÃO
 * ===========================================================================
 * "Este `CHECK` torna o nulo impossível nesta coluna?" não tem resposta
 * mecânica. `CHECK ((origin <> 'tag_scan') OR (tag_id IS NOT NULL AND pet_id IS
 * NOT NULL))` só proíbe o nulo quando `origin = 'tag_scan'`; decidir isso é
 * procurar uma atribuição das outras colunas que falsifique a expressão, que é
 * satisfatibilidade, não consulta.
 *
 * O que É mecânico, e é o que o portão faz: descobrir o PAR (chave estrangeira
 * que põe nulo, restrição que nomeia a coluna que recebe o nulo) e exigir que
 * alguém tenha escrito o veredito. Par sem veredito reprova. É de propósito:
 * quem escreve o veredito precisa abrir o banco e tentar o DELETE, e é isso que
 * transforma "olhei e concordei" em evidência.
 *
 * Os dois vereditos deste banco foram medidos assim, com `DELETE` de verdade na
 * pilha efêmera, e o segundo bloco deste arquivo (`o efeito, e não só a
 * declaração`) reexecuta a medição a cada rodada.
 *
 * Como rodar: `npm run test:integration`, de dentro do worktree. A pilha é
 * efêmera e migra do zero: este arquivo afirma o esquema que as migrações
 * PRODUZEM, e não o que elas dizem produzir. Só o banco pega isto.
 */
import assert from 'node:assert/strict';
import { after, before, describe, it } from 'node:test';
import { Client } from 'pg';

/**
 * Os mesmos esquemas de produto que `esquema.test.ts` inspeciona. `tiger`,
 * `tiger_data` e `topology` são do PostGIS e têm chave estrangeira própria, que
 * não é nossa e não responde às nossas regras.
 */
const ESQUEMAS_DO_PRODUTO = ['public', 'audit'];

type Acao = 'NO ACTION' | 'RESTRICT' | 'CASCADE' | 'SET NULL' | 'SET DEFAULT';

interface ChaveDeclarada {
  /** As colunas da chave, na ordem em que a restrição as declara. */
  readonly colunas: readonly string[];
  /** `esquema.tabela` do lado referenciado. */
  readonly referencia: string;
  /** O que o Postgres faz quando a linha referenciada é apagada. */
  readonly aoApagar: Acao;
  /**
   * De quem é a linha que some, para as `CASCADE`. É a única pergunta que
   * importa na classe silenciosa, e ela não tem resposta no catálogo: o
   * catálogo sabe que a linha some, não sabe de quem ela é.
   */
  readonly levaJunto?: string;
}

/**
 * TODA chave estrangeira dos esquemas do produto, pela chave
 * `esquema.tabela.nome_da_restrição`.
 *
 * Mudar a ação de deleção de qualquer uma exige mudar a linha aqui junto com a
 * migração. É de propósito.
 */
const CHAVES_ESTRANGEIRAS: Readonly<Record<string, ChaveDeclarada>> = {
  // -------------------------------------------------------------------------
  // alertas
  // -------------------------------------------------------------------------
  'public.alert_dispatches.alert_dispatches_case_id_fkey': {
    colunas: ['case_id'],
    referencia: 'public.lost_cases',
    aoApagar: 'CASCADE',
    levaJunto:
      'o disparo do alerta do caso apagado, e com ele os destinatários por ' +
      '`alert_recipients.dispatch_id`. O caso é do tutor.',
  },
  'public.alert_recipients.alert_recipients_dispatch_id_fkey': {
    colunas: ['dispatch_id'],
    referencia: 'public.alert_dispatches',
    aoApagar: 'CASCADE',
    levaJunto:
      'a linha de destinatário do disparo apagado, que sem o disparo não é nada. Mas a linha ' +
      'é sobre OUTRA pessoa, o vizinho que foi avisado, e é por aqui que apagar a conta do ' +
      'tutor apaga o registro de que um terceiro foi notificado. Ver o caso "a cascata ' +
      'atravessa pessoas".',
  },
  'public.alert_recipients.alert_recipients_user_id_fkey': {
    colunas: ['user_id'],
    referencia: 'public.users',
    aoApagar: 'CASCADE',
    levaJunto: 'o registro de que a própria pessoa foi avisada. Da própria pessoa.',
  },

  // -------------------------------------------------------------------------
  // conversa mediada
  // -------------------------------------------------------------------------
  'public.conversation_messages.conversation_messages_conversation_id_fkey': {
    colunas: ['conversation_id'],
    referencia: 'public.conversations',
    aoApagar: 'CASCADE',
    levaJunto:
      'as mensagens da conversa apagada, dos DOIS lados. Conversa que deixou de existir ' +
      'deixou de existir para ambos, e é por aqui que a exclusão de uma conta leva embora o ' +
      'que a outra pessoa escreveu. Ver o caso "a cascata atravessa pessoas".',
  },
  'public.conversation_messages.conversation_messages_sender_user_id_fkey': {
    colunas: ['sender_user_id'],
    referencia: 'public.users',
    // Era `SET NULL`, e era a QUINTA ocorrência de 22/09: a primeira que não
    // cabe dentro de uma tabela só. O `SET NULL` é um UPDATE, e todo UPDATE
    // revalida as OUTRAS chaves da linha. `conversation_id` era revalidada
    // contra uma conversa que a cascata `found_reports -> conversations`
    // acabara de apagar na mesma instrução: 23503, e não 23514.
    //
    // `CASCADE` porque neste caminho a conversa vai embora de qualquer jeito.
    // "A mensagem fica, a identidade sai" foi escrito para o caso em que a
    // conversa SOBREVIVE, e ali a intenção continua valendo; ali esta chave
    // nunca chega a ser exercida. Ver
    // `20260922000005_mensagem-cede-para-a-cascata-do-aviso.sql`.
    aoApagar: 'CASCADE',
    levaJunto: 'a mensagem que a própria pessoa escreveu.',
  },
  'public.conversations.conversations_case_id_fkey': {
    colunas: ['case_id'],
    referencia: 'public.lost_cases',
    aoApagar: 'SET NULL',
  },
  'public.conversations.conversations_finder_user_id_fkey': {
    colunas: ['finder_user_id'],
    referencia: 'public.users',
    aoApagar: 'SET NULL',
  },
  'public.conversations.conversations_found_report_id_fkey': {
    colunas: ['found_report_id'],
    referencia: 'public.found_reports',
    aoApagar: 'CASCADE',
    levaJunto:
      'a conversa mediada do aviso apagado, e com ela as mensagens dos dois lados. O aviso é ' +
      'de quem achou; o outro lado da conversa é o tutor. Ver o caso "a cascata atravessa ' +
      'pessoas".',
  },
  'public.conversations.conversations_pet_id_fkey': {
    colunas: ['pet_id'],
    referencia: 'public.pets',
    aoApagar: 'CASCADE',
    levaJunto:
      'a conversa sobre o pet apagado, e as mensagens dela. O pet é do tutor; o que o achador ' +
      'escreveu vai junto. Ver o caso "a cascata atravessa pessoas".',
  },
  'public.conversations.conversations_tutor_user_id_fkey': {
    colunas: ['tutor_user_id'],
    referencia: 'public.users',
    aoApagar: 'CASCADE',
    levaJunto:
      'a conversa do tutor, e dentro dela as mensagens do ACHADOR. Ver o caso "a cascata ' +
      'atravessa pessoas".',
  },

  // -------------------------------------------------------------------------
  // entity_verifications
  // -------------------------------------------------------------------------
  'public.entity_verifications.entity_verifications_claimant_user_id_fkey': {
    colunas: ['claimant_user_id'],
    referencia: 'public.users',
    aoApagar: 'CASCADE',
    levaJunto:
      'a evidência de verificação que a própria pessoa enviou. Some com a conta dela, e o ' +
      'nível de verificação do profissional (`professionals.verification_level`) NÃO some ' +
      'junto — `entity_verifications.entity_id` é polimórfico e não tem FK. Ver Riscos.',
  },
  'public.entity_verifications.entity_verifications_reviewed_by_user_id_fkey': {
    colunas: ['reviewed_by_user_id'],
    referencia: 'public.users',
    aoApagar: 'SET NULL',
  },

  // -------------------------------------------------------------------------
  // found_reports
  // -------------------------------------------------------------------------
  'public.found_reports.found_reports_case_id_fkey': {
    colunas: ['case_id'],
    referencia: 'public.lost_cases',
    aoApagar: 'SET NULL',
  },
  'public.found_reports.found_reports_pet_id_fkey': {
    colunas: ['pet_id'],
    referencia: 'public.pets',
    aoApagar: 'CASCADE',
    levaJunto: 'o aviso de achado sobre o pet apagado. Pet e aviso são da mesma pessoa.',
  },
  'public.found_reports.found_reports_photo_upload_id_fkey': {
    colunas: ['photo_upload_id'],
    referencia: 'public.upload_intents',
    aoApagar: 'SET NULL',
  },
  'public.found_reports.found_reports_reporter_user_id_fkey': {
    colunas: ['reporter_user_id'],
    referencia: 'public.users',
    aoApagar: 'CASCADE',
    levaJunto:
      'o aviso de achado inteiro, e com ele os `match_candidates` que o citam — que estão ' +
      'nos casos de perdido de OUTRAS pessoas. Ver o caso "a cascata atravessa pessoas".',
  },
  'public.found_reports.found_reports_tag_id_fkey': {
    colunas: ['tag_id'],
    referencia: 'public.pet_tags',
    // Era `SET NULL`, e era a terceira ocorrência de 22/09: o nulo que a ação
    // mandava pôr é exatamente o que `found_reports_scan_tem_tag_e_pet` proíbe
    // enquanto `origin = 'tag_scan'`. Corrigida em
    // `20260922000004_tag-apagada-nao-contradiz-o-achado.sql`.
    //
    // `RESTRICT` e não `CASCADE` porque o achado por escaneamento é registro
    // histórico: a plaquinha sumir depois não desfaz o encontro, e o aviso
    // ainda carrega a conversa mediada com o tutor. `RESTRICT` e não um CHECK
    // mais frouxo porque a invariante é verdadeira no NASCIMENTO da linha —
    // afrouxar fecharia o caso raro (a tag some depois) abrindo o caso comum
    // (um serviço com defeito grava `tag_scan` sem tag, e nada acusa).
    aoApagar: 'RESTRICT',
  },

  // -------------------------------------------------------------------------
  // identidade e sessão
  // -------------------------------------------------------------------------
  'public.local_credentials.local_credentials_identity_id_fkey': {
    colunas: ['identity_id'],
    referencia: 'public.user_identities',
    aoApagar: 'CASCADE',
    levaJunto: 'a senha da identidade apagada. Da própria pessoa.',
  },
  // BICHUS-48. A janela de reautenticação de 5 minutos.
  //
  // A cascata é o comportamento certo, e ela já está provada por medição: o caso
  // "a linha da janela morre junto com a conta" de
  // `reautenticacao-pelo-http.test.ts` abre a janela, apaga a conta e conta as
  // linhas que sobraram. A migração `20260922000005_reautenticacao-com-senha.sql`
  // declara `REFERENCES users (id) ON DELETE CASCADE`.
  //
  // O que faltava era a linha AQUI. O veredito deste registro é escrito à mão —
  // o catálogo sabe que a linha some, não sabe de quem ela é — e sem ela o caso
  // "toda chave estrangeira do banco está declarada aqui" reprovava a suíte.
  'public.reauth_tokens.reauth_tokens_user_id_fkey': {
    colunas: ['user_id'],
    referencia: 'public.users',
    aoApagar: 'CASCADE',
    levaJunto:
      'a janela de reautenticação da própria pessoa. Deixá-la para trás seria guardar, depois ' +
      'da conta apagada, a autorização que ela abriu para apagá-la.',
  },
  'public.refresh_tokens.refresh_tokens_rotated_to_id_fkey': {
    colunas: ['rotated_to_id'],
    referencia: 'public.refresh_tokens',
    aoApagar: 'SET NULL',
  },
  'public.refresh_tokens.refresh_tokens_user_id_fkey': {
    colunas: ['user_id'],
    referencia: 'public.users',
    aoApagar: 'CASCADE',
    levaJunto: 'as sessões da própria pessoa.',
  },
  'public.user_devices.user_devices_user_id_fkey': {
    colunas: ['user_id'],
    referencia: 'public.users',
    aoApagar: 'CASCADE',
    levaJunto:
      'os aparelhos registrados da própria pessoa, e com eles o token de push. Da própria ' +
      'pessoa.',
  },
  'public.user_identities.user_identities_user_id_fkey': {
    colunas: ['user_id'],
    referencia: 'public.users',
    aoApagar: 'CASCADE',
    levaJunto: 'as identidades da própria pessoa.',
  },
  'public.user_reference_locations.user_reference_locations_user_id_fkey': {
    colunas: ['user_id'],
    referencia: 'public.users',
    aoApagar: 'CASCADE',
    levaJunto: 'a localização de referência da própria pessoa.',
  },
  'public.user_roles.user_roles_user_id_fkey': {
    colunas: ['user_id'],
    referencia: 'public.users',
    aoApagar: 'CASCADE',
    levaJunto: 'os papéis da própria pessoa.',
  },
  'public.verification_tokens.verification_tokens_user_id_fkey': {
    colunas: ['user_id'],
    referencia: 'public.users',
    aoApagar: 'CASCADE',
    levaJunto: 'os tokens de verificação da própria pessoa.',
  },

  // -------------------------------------------------------------------------
  // lost_cases e match_candidates
  // -------------------------------------------------------------------------
  'public.lost_cases.lost_cases_owner_user_id_fkey': {
    colunas: ['owner_user_id'],
    referencia: 'public.users',
    aoApagar: 'CASCADE',
    levaJunto: 'o caso de perdido da própria pessoa, e os candidatos dele por `case_id`.',
  },
  'public.lost_cases.lost_cases_pet_id_fkey': {
    colunas: ['pet_id'],
    referencia: 'public.pets',
    aoApagar: 'CASCADE',
    levaJunto: 'o caso do pet apagado. Pet e caso são da mesma pessoa.',
  },
  'public.match_candidates.match_candidates_case_id_fkey': {
    colunas: ['case_id'],
    referencia: 'public.lost_cases',
    aoApagar: 'CASCADE',
    levaJunto: 'a sugestão, que sem o caso não é nada. Do dono do caso.',
  },
  'public.match_candidates.match_candidates_decided_by_user_id_fkey': {
    colunas: ['decided_by_user_id'],
    referencia: 'public.users',
    aoApagar: 'CASCADE',
    levaJunto:
      'a sugestão inteira. A migração justifica com "quem decide é o tutor, e o caso é dele". ' +
      'O BANCO não exige isso: nada impede `decided_by_user_id` de ser diferente do dono do ' +
      'caso, e nesse dia apagar a conta de quem decidiu apaga a linha do caso de outra ' +
      'pessoa. Ver o caso "a cascata atravessa pessoas".',
  },
  'public.match_candidates.match_candidates_found_report_id_fkey': {
    colunas: ['found_report_id'],
    referencia: 'public.found_reports',
    aoApagar: 'CASCADE',
    levaJunto:
      'a sugestão, que sem o aviso não é nada. Mas o caso é de outra pessoa que não a do ' +
      'aviso: é por aqui que a exclusão de conta atravessa.',
  },

  // -------------------------------------------------------------------------
  // pets, fotos e tags
  // -------------------------------------------------------------------------
  'public.pet_photos.pet_photos_pet_id_fkey': {
    colunas: ['pet_id'],
    referencia: 'public.pets',
    aoApagar: 'CASCADE',
    levaJunto: 'as fotos do pet apagado. Da própria pessoa.',
  },
  'public.pet_photos.pet_photos_upload_intent_id_fkey': {
    colunas: ['upload_intent_id'],
    referencia: 'public.upload_intents',
    aoApagar: 'RESTRICT',
  },
  'public.pet_tags.pet_tags_pet_id_fkey': {
    colunas: ['pet_id'],
    referencia: 'public.pets',
    aoApagar: 'CASCADE',
    levaJunto: 'as tags do pet apagado, e com elas os `tag_scans` delas. Da própria pessoa.',
  },
  // -------------------------------------------------------------------------
  // transferência de pet
  //
  // As três chegaram com `20260922000005_transferencia-de-pet.sql` e ficaram
  // sem entrada aqui até o fechamento da segunda integração de 22/09 — que é
  // precisamente o silêncio que este arquivo existe para quebrar. A
  // `to_user_id` é ainda a ponta da QUINTA forma nova deste banco: leia o
  // veredito em `NULOS_CONTRA_CASCATA_DE_TERCEIRO` antes de mexer em qualquer
  // uma das três.
  // -------------------------------------------------------------------------
  'public.pet_transfers.pet_transfers_pet_id_fkey': {
    colunas: ['pet_id'],
    referencia: 'public.pets',
    aoApagar: 'CASCADE',
    levaJunto:
      'a transferência do pet apagado. O pet é do tutor, e a linha também é sobre o ' +
      'DESTINATÁRIO: com ela some o registro de que um convite foi feito a ele, e ele não é ' +
      'avisado por nada. É esta a chave que o UPDATE da quinta forma revalida.',
  },
  'public.pet_transfers.pet_transfers_from_user_id_fkey': {
    colunas: ['from_user_id'],
    referencia: 'public.users',
    aoApagar: 'CASCADE',
    levaJunto:
      'as transferências que a própria pessoa iniciou. É o SEGUNDO caminho até a mesma ' +
      'linha: o primeiro é `users -> pets -> pet_transfers`, e ele só alcança enquanto o pet ' +
      'ainda for dela. Depois da consumação o pet é do outro, e sem esta chave a linha ' +
      'sobreviveria apontando para uma conta que não existe mais.',
  },
  'public.pet_transfers.pet_transfers_to_user_id_fkey': {
    colunas: ['to_user_id'],
    referencia: 'public.users',
    aoApagar: 'SET NULL',
  },

  'public.pets.pets_owner_user_id_fkey': {
    colunas: ['owner_user_id'],
    referencia: 'public.users',
    aoApagar: 'CASCADE',
    levaJunto: 'os pets da própria pessoa, e tudo que pende deles.',
  },
  'public.tag_scans.tag_scans_tag_id_fkey': {
    colunas: ['tag_id'],
    referencia: 'public.pet_tags',
    aoApagar: 'CASCADE',
    levaJunto: 'as leituras da tag apagada. A tag é da pessoa; quem leu foi outra.',
  },

  // -------------------------------------------------------------------------
  // dados de referência: NO ACTION de propósito
  //
  // Apagar uma raça, cor, porte, espécie ou versão de referência com pet
  // apontando para ela precisa FALHAR, e não apagar o pet nem apagar a raça do
  // pet em silêncio. `NO ACTION` é a ação certa aqui, e é a única classe deste
  // banco em que ela é escolha e não descuido.
  // -------------------------------------------------------------------------
  'public.pets.pets_primary_color_code_fkey': {
    colunas: ['primary_color_code'],
    referencia: 'public.ref_colors',
    aoApagar: 'NO ACTION',
  },
  'public.pets.pets_raca_e_da_especie': {
    colunas: ['breed_code', 'species_code'],
    referencia: 'public.ref_breeds',
    aoApagar: 'NO ACTION',
  },
  'public.pets.pets_ref_data_version_fkey': {
    colunas: ['ref_data_version'],
    referencia: 'public.ref_data_versions',
    aoApagar: 'NO ACTION',
  },
  'public.pets.pets_secondary_color_code_fkey': {
    colunas: ['secondary_color_code'],
    referencia: 'public.ref_colors',
    aoApagar: 'NO ACTION',
  },
  'public.pets.pets_size_code_fkey': {
    colunas: ['size_code'],
    referencia: 'public.ref_sizes',
    aoApagar: 'NO ACTION',
  },
  'public.pets.pets_species_code_fkey': {
    colunas: ['species_code'],
    referencia: 'public.ref_species',
    aoApagar: 'NO ACTION',
  },
  'public.ref_breeds.ref_breeds_species_code_fkey': {
    colunas: ['species_code'],
    referencia: 'public.ref_species',
    aoApagar: 'NO ACTION',
  },

  // -------------------------------------------------------------------------
  // professionals
  // -------------------------------------------------------------------------
  'public.professionals.professionals_claimed_by_user_id_fkey': {
    colunas: ['claimed_by_user_id'],
    referencia: 'public.users',
    aoApagar: 'SET NULL',
  },
  'public.professionals.professionals_created_by_user_id_fkey': {
    colunas: ['created_by_user_id'],
    referencia: 'public.users',
    aoApagar: 'SET NULL',
  },

  // -------------------------------------------------------------------------
  // upload_intents
  // -------------------------------------------------------------------------
  'public.upload_intents.upload_intents_found_report_id_fkey': {
    colunas: ['found_report_id'],
    referencia: 'public.found_reports',
    aoApagar: 'CASCADE',
    levaJunto: 'a intenção de upload da foto do aviso apagado. De quem registrou o aviso.',
  },
  'public.upload_intents.upload_intents_pet_id_fkey': {
    colunas: ['pet_id'],
    referencia: 'public.pets',
    aoApagar: 'CASCADE',
    levaJunto: 'a intenção de upload do pet apagado. Da própria pessoa.',
  },
  'public.upload_intents.upload_intents_user_id_fkey': {
    colunas: ['user_id'],
    referencia: 'public.users',
    aoApagar: 'CASCADE',
    levaJunto:
      'as intenções de upload da própria pessoa. Atravessa `pet_photos.upload_intent_id`, ' +
      'que é RESTRICT: a exclusão de conta só não trava porque a cascata de `pets` apaga a ' +
      'foto antes. Ver Riscos.',
  },
};

type VereditoDoPar = 'compativel' | 'contradiz';

interface ParDeclarado {
  /** A coluna que recebe o nulo (ou o default) quando o pai é apagado. */
  readonly coluna: string;
  readonly veredito: VereditoDoPar;
  /**
   * Como o veredito foi MEDIDO. Não é comentário decorativo: é o que separa
   * "olhei a expressão e concordei" de evidência. O segundo bloco deste arquivo
   * reexecuta a medição contra o banco a cada rodada.
   */
  readonly medicao: string;
}

/**
 * Todo par (chave estrangeira que põe nulo ou default, restrição CHECK que
 * nomeia a coluna que recebe o nulo) do banco.
 *
 * Par que aparecer sem entrada aqui REPROVA, nomeando os dois lados. É o único
 * momento em que alguém é obrigado a abrir o banco e perguntar se o nulo cabe.
 */
const PARES_DE_NULO_CONTRA_RESTRICAO: Readonly<Record<string, ParDeclarado>> = {
  // =========================================================================
  // A TERCEIRA OCORRÊNCIA DE 22/09 SAIU DAQUI, E O LUGAR VAZIO É A PROVA.
  // =========================================================================
  // `found_reports.found_reports_tag_id_fkey + found_reports_scan_tem_tag_e_pet`
  // era a entrada `contradiz` deste objeto. Ela não foi apagada por
  // conveniência: ela deixou de EXISTIR no banco.
  //
  // A descoberta só enxerga par cuja chave estrangeira põe nulo ou default.
  // `20260922000004_tag-apagada-nao-contradiz-o-achado.sql` trocou a ação por
  // `RESTRICT`, então a chave parou de pôr nulo, o par sumiu da consulta, e o
  // caso "par declarado que o banco não tem mais" passaria a reprovar se a
  // entrada continuasse escrita aqui. Manter a linha seria afirmar uma
  // contradição que o banco não tem.
  //
  // O que sobrou no lugar dela é a medição, e ela está viva em
  // "apagar a tag agora reprova pela chave estrangeira": o que era 23514 num
  // CHECK virou 23503 na chave, e apagar pet e conta continua concluindo.

  // =========================================================================
  // O lado permissivo, e ele é permissivo de verdade.
  // =========================================================================
  // O ramo não-`unclaimed` do CHECK exige `claimed_at IS NOT NULL`, e NÃO exige
  // `claimed_by_user_id IS NOT NULL`. O nulo cabe: a linha sobrevive como
  // `claimed` com o marco temporal e sem o reivindicante.
  //
  // Portão que reprovasse isto é portão desligado na primeira semana. A
  // frouxidão (profissional `claimed` sem titular) é assunto de modelo de
  // dados, não de contradição declarativa, e está em Riscos.
  'public.professionals.professionals_claimed_by_user_id_fkey + professionals_titularidade_tem_marco':
    {
      coluna: 'claimed_by_user_id',
      veredito: 'compativel',
      medicao:
        'DELETE FROM users de quem reivindicou conclui; a linha fica ' +
        "claim_status = 'claimed', claimed_by_user_id = NULL, claimed_at preenchido.",
    },

  // =========================================================================
  // O lado permissivo da conversa mediada, medido e não lido.
  // =========================================================================
  // `conversations_dois_lados_distintos` é
  // `finder_user_id IS NULL OR finder_user_id <> tutor_user_id`. O nulo
  // satisfaz o PRIMEIRO ramo, então ele cabe: a restrição existe para impedir
  // que os dois lados sejam a mesma pessoa, e uma conversa sem achador
  // identificado não viola isso.
  //
  // A entrada que ESTAVA prevista para
  // `conversation_messages_sender_user_id_fkey + conversation_messages_sistema_sem_remetente`
  // não está aqui, e a ausência é a mesma prova que a de `found_reports.tag_id`
  // acima: a chave deixou de pôr nulo. `20260922000005` a passou para
  // `CASCADE`, o par sumiu da consulta de descoberta, e escrever a linha faria
  // o caso "par declarado que o banco não tem mais" reprovar. O veredito dela
  // foi medido antes de a migração existir, e sobrevive na isca da quinta
  // forma: o nulo CABIA no CHECK (`sender_role <> 'system' OR sender_user_id
  // IS NULL`), e mesmo assim a exclusão falhava — por um motivo que nenhum
  // CHECK desta tabela poderia explicar.
  'public.conversations.conversations_finder_user_id_fkey + conversations_dois_lados_distintos': {
    coluna: 'finder_user_id',
    veredito: 'compativel',
    medicao:
      'DELETE FROM users de quem achou, com o aviso registrado por um TERCEIRO (para isolar ' +
      'o par da cascata de `found_reports.reporter_user_id`): conclui, e a conversa sobrevive ' +
      'com finder_user_id = NULL e tutor_user_id preenchido.',
  },
};

// ===========================================================================
// A QUINTA FORMA, E POR QUE ELA NÃO CABIA NAS QUATRO
// ===========================================================================
// As quatro combinações do cabeçalho vivem DENTRO de uma tabela: a ação de
// deleção de uma chave contra as restrições da própria tabela. A quinta
// atravessa TRÊS, e por isso o bloco de pares acima é cego para ela por
// construção — ele só olha `CHECK` da mesma tabela.
//
// Ela apareceu em 22/09, na integração, e não podia ter aparecido antes:
// `conversa-mediada` e `dominio-de-achado-avulso` chegaram por branches
// diferentes, e as três tabelas só se encontraram quando as duas foram
// mescladas. Medido:
//
//   users         --CASCADE--> found_reports.reporter_user_id
//   found_reports --CASCADE--> conversations.found_report_id
//   users         --SET NULL-> conversation_messages.sender_user_id
//
//   DELETE FROM users da achadora
//     => 23503 / conversation_messages_conversation_id_fkey
//        Key (conversation_id)=(...) is not present in table "conversations"
//
// O MECANISMO, que é o que torna isto invisível: `SET NULL` não apaga, ele
// ATUALIZA. E todo `UPDATE` revalida TODAS as chaves estrangeiras da linha
// atualizada, inclusive as que nada têm a ver com a coluna que mudou. Quando o
// gatilho do `SET NULL` roda depois da cascata que já levou o avô, ele
// revalida contra um pai que não existe mais.
//
// Nenhuma das três declarações está errada lida sozinha. O defeito só existe
// na interseção — e é exatamente por isso que ele precisa de portão, e não de
// atenção de quem revisa uma migração.
//
// A DESCOBERTA É MECÂNICA E O VEREDITO É ESCRITO, pelo mesmo motivo dos pares:
// se a linha do meio sobrevive ao `DELETE` depende da ORDEM em que o Postgres
// dispara os gatilhos de ação referencial, e ordem de gatilho não se lê no
// catálogo. Então a consulta abaixo DESCOBRE o formato de risco (um nulo que
// corre junto com uma cascata que alcança o outro pai da mesma linha) e exige
// que alguém abra o banco, apague, e escreva o que aconteceu.
//
// A consulta reporta A MAIS de propósito: formato de risco que na prática
// conclui entra aqui como `compativel` medido, e não some da lista. Portão que
// só mostra o que já quebrou não avisa antes da próxima vez.

interface NuloContraCascataDeclarado {
  readonly veredito: VereditoDoPar;
  /** Como foi MEDIDO. Mesma exigência do registro de pares: evidência, não leitura. */
  readonly medicao: string;
}

/**
 * Todo par (chave que põe nulo, chave vizinha da MESMA linha cujo pai a mesma
 * instrução de `DELETE` apaga por cascata).
 *
 * Formato novo sem entrada aqui REPROVA, nomeando as três tabelas e o caminho
 * da cascata. "Há um risco no esquema" não conserta nada; `A -> B -> C` sim.
 */
const NULOS_CONTRA_CASCATA_DE_TERCEIRO: Readonly<Record<string, NuloContraCascataDeclarado>> = {
  'public.conversations.conversations_finder_user_id_fkey + conversations_found_report_id_fkey': {
    veredito: 'compativel',
    medicao:
      'DELETE FROM users de quem achou, sendo ela também quem registrou o aviso: conclui, ' +
      'sem linha sobrando. A conversa é apagada pela cascata `found_reports -> conversations` ' +
      'ANTES de o SET NULL precisar dela, e o nulo sobre uma linha que já saiu é operação ' +
      'sobre zero linhas, não erro. Difere do caso da mensagem porque aqui a linha do nulo e ' +
      'a linha apagada são A MESMA: não há neto para revalidar nada.',
  },
  // =========================================================================
  // A TERCEIRA OCORRÊNCIA DA QUINTA FORMA, E A PRIMEIRA QUE CONCLUI POR ORDEM
  // DE GATILHO. LEIA ISTO ANTES DE MEXER EM `pet_transfers`.
  // =========================================================================
  // `conclui` aqui NÃO quer dizer que o desenho garante que conclua, e a
  // diferença é a coisa mais importante escrita neste objeto.
  //
  // Medido com gatilho de trilha (`after insert or update or delete ... for
  // each row`) nas duas tabelas, apagando a conta de quem RECEBEU o pet e
  // depois da consumação passou a ser dono dele. A ordem dos eventos dentro da
  // MESMA instrução `DELETE FROM users`:
  //
  //   1. DELETE em pets            (cascata `users -> pets`)
  //   2. UPDATE em pet_transfers   (o SET NULL de `to_user_id`) -- a linha
  //                                AINDA EXISTE, e o pet dela já não existe
  //   3. DELETE em pet_transfers   (cascata `pets -> pet_transfers`)
  //
  // O passo 2 é exatamente a situação que produz `23503` em
  // `conversation_messages`: um UPDATE que revalida uma chave estrangeira
  // contra um pai que a mesma instrução já apagou. Aqui ele não estoura porque
  // o passo 3 chega ANTES de a verificação diferida de
  // `pet_transfers_pet_id_fkey` rodar, e verificação de linha que deixou de
  // existir não roda. **É ordem de gatilho, e ordem de gatilho não é desenho.**
  //
  // O que sustenta a ordem é `pet_id` ser `CASCADE`: é ela que garante que a
  // linha atualizada some na mesma instrução. Trocar `pet_transfers.pet_id`
  // para `RESTRICT` ou `NO ACTION` — que é a correção natural do dia em que
  // alguém decidir que apagar um pet não deve apagar o histórico de
  // transferência dele — deixa a linha de pé depois do passo 2, e este veredito
  // vira `contradiz` sem que ninguém tenha tocado em `to_user_id`. Registrado
  // em Riscos.
  'public.pet_transfers.pet_transfers_to_user_id_fkey + pet_transfers_pet_id_fkey': {
    veredito: 'compativel',
    medicao:
      'DELETE FROM users de quem RECEBEU o pet e virou dono dele: conclui, sem linha ' +
      'sobrando em `pet_transfers`. Medido também o caso em que o pet é de OUTRA pessoa ' +
      '(convite aceito e ainda não consumado): conclui, e a linha sobrevive com ' +
      '`to_user_id = NULL`, que é o nulo que `cancellation_reason = recipient_gone` lê. ' +
      'O que faz o primeiro concluir é ORDEM DE GATILHO: a cascata `pets -> pet_transfers` ' +
      'apaga a linha atualizada antes de a revalidação de `pet_transfers_pet_id_fkey` rodar. ' +
      'Não é garantia de desenho — ver o comentário acima.',
  },
  'public.conversations.conversations_finder_user_id_fkey + conversations_pet_id_fkey': {
    veredito: 'compativel',
    medicao:
      'DELETE FROM users do TUTOR (dono do pet): conclui. A cascata `pets -> conversations` ' +
      'apaga a mesma linha que o SET NULL de `finder_user_id` tocaria, e pela mesma razão do ' +
      'par acima não há revalidação de neto.',
  },
};

/**
 * As chaves estrangeiras por onde a exclusão de uma conta alcança linha que
 * pertence à experiência de OUTRA pessoa.
 *
 * Esta lista existe porque a cascata não falha: ela apaga e fica quieta. Um
 * caminho novo entrando aqui sem ninguém declarar é a coisa mais cara que este
 * arquivo pode deixar passar, então o caso abaixo exige que a lista e o banco
 * concordem, e o segundo bloco exercita o caminho com `DELETE` de verdade.
 */
const CASCATAS_QUE_ATRAVESSAM_PESSOAS: readonly string[] = [
  'public.alert_recipients.alert_recipients_dispatch_id_fkey',
  'public.conversation_messages.conversation_messages_conversation_id_fkey',
  'public.conversations.conversations_found_report_id_fkey',
  'public.conversations.conversations_pet_id_fkey',
  'public.conversations.conversations_tutor_user_id_fkey',
  'public.found_reports.found_reports_reporter_user_id_fkey',
  'public.match_candidates.match_candidates_decided_by_user_id_fkey',
  'public.match_candidates.match_candidates_found_report_id_fkey',
];

const ACAO_POR_CODIGO: Readonly<Record<string, Acao>> = {
  a: 'NO ACTION',
  r: 'RESTRICT',
  c: 'CASCADE',
  n: 'SET NULL',
  d: 'SET DEFAULT',
};

interface ChaveDoBanco {
  readonly chave: string;
  readonly tabela: string;
  readonly nome: string;
  readonly colunas: string[];
  readonly referencia: string;
  readonly aoApagar: Acao;
  /**
   * As colunas que RECEBEM o nulo ou o default. Não é sempre o conjunto
   * inteiro: desde o Postgres 15 existe `ON DELETE SET NULL (coluna)`, e usar
   * `conkey` no lugar de `confdelsetcols` faria o portão inspecionar coluna que
   * a ação nem toca.
   */
  readonly colunasAfetadas: { nome: string; naoNula: boolean; padrao: string | null }[];
}

interface ParDoBanco {
  readonly chave: string;
  readonly fk: string;
  readonly restricao: string;
  readonly coluna: string;
  readonly definicao: string;
}

interface NuloContraCascataDoBanco {
  /** `tabela.fk_que_poe_nulo + fk_revalidada`. */
  readonly chave: string;
  readonly tabela: string;
  readonly fkQuePoeNulo: string;
  readonly tabelaApagada: string;
  readonly fkRevalidada: string;
  readonly paiQueSome: string;
  /** `A -> B -> C`, e todos eles separados por ` | `: por onde a cascata chega ao pai que some. */
  readonly caminho: string;
}

/**
 * A descoberta da quinta forma. É uma FUNÇÃO, e não um trecho dentro do
 * `before`, por um motivo só: a isca precisa reexecutá-la depois de devolver o
 * `SET NULL` de 22/09 ao banco. Descoberta que só roda uma vez não pode ser
 * provada, e verificação não provada vale pela confiança do dia em que foi
 * escrita.
 */
async function descobrirNulosContraCascata(
  conexao: Client,
): Promise<NuloContraCascataDoBanco[]> {
  const r = await conexao.query<{
    tabela: string;
    fk_que_poe_nulo: string;
    tabela_apagada: string;
    fk_revalidada: string;
    pai_que_some: string;
    caminho: string;
  }>(
    `with recursive fks as (
        select con.oid,
               ns.nspname  || '.' || rel.relname  as tabela,
               con.conname                        as nome,
               fns.nspname || '.' || frel.relname as referencia,
               con.confdeltype                    as acao
          from pg_constraint con
          join pg_class rel     on rel.oid  = con.conrelid
          join pg_namespace ns  on ns.oid   = rel.relnamespace
          join pg_class frel    on frel.oid = con.confrelid
          join pg_namespace fns on fns.oid  = frel.relnamespace
         where con.contype = 'f' and ns.nspname = any($1::text[])),
      -- Aresta de cascata: apagar uma linha de \`pai\` apaga linhas de \`filho\`.
      cascata as (select referencia as pai, tabela as filho from fks where acao = 'c'),
      -- Fecho transitivo, com o caminho junto. O \`position\` corta ciclo: sem
      -- ele uma cascata circular faria a recursão não terminar, e portão que
      -- trava é portão que alguém desliga.
      alcance as (
        select pai as origem, filho as alvo, filho::text as caminho from cascata
        union all
        select a.origem, c.filho, a.caminho || ' -> ' || c.filho
          from alcance a join cascata c on c.pai = a.alvo
         where position(c.filho in a.caminho) = 0)
     select nulo.tabela            as tabela,
            nulo.nome              as fk_que_poe_nulo,
            nulo.referencia        as tabela_apagada,
            vizinha.nome           as fk_revalidada,
            vizinha.referencia     as pai_que_some,
            -- TODOS os caminhos, e nao o mais curto. Duas cascatas diferentes
            -- podem alcancar o mesmo pai, e quem for consertar precisa ver as
            -- duas: fechar so a que a mensagem citou deixa a outra de pe.
            string_agg(distinct a.origem || ' -> ' || a.caminho, ' | '
                       order by a.origem || ' -> ' || a.caminho) as caminho
       from fks nulo
       join fks vizinha on vizinha.tabela = nulo.tabela and vizinha.oid <> nulo.oid
       join alcance a   on a.origem = nulo.referencia and a.alvo = vizinha.referencia
      -- \`nulo\` é quem ATUALIZA (e portanto revalida a linha inteira).
      -- \`vizinha\` só entra se o sumiço do pai dela puder reprovar essa
      -- revalidação: se ela também pusesse nulo, o nulo satisfaria a si mesmo.
      where nulo.acao in ('n', 'd') and vizinha.acao in ('c', 'r', 'a')
      group by 1, 2, 3, 4, 5
      order by 1, 2, 4`,
    [ESQUEMAS_DO_PRODUTO],
  );

  return r.rows.map((l) => ({
    chave: `${l.tabela}.${l.fk_que_poe_nulo} + ${l.fk_revalidada}`,
    tabela: l.tabela,
    fkQuePoeNulo: l.fk_que_poe_nulo,
    tabelaApagada: l.tabela_apagada,
    fkRevalidada: l.fk_revalidada,
    paiQueSome: l.pai_que_some,
    caminho: l.caminho,
  }));
}

/** Uma linha da descoberta, escrita do jeito que conserta: três tabelas e o caminho. */
function descrever(n: NuloContraCascataDoBanco): string {
  return (
    `\n  ${n.tabela}.${n.fkQuePoeNulo} põe nulo quando ${n.tabelaApagada} sai;` +
    `\n    na MESMA instrução ${n.paiQueSome} some por ${n.caminho},` +
    `\n    e o UPDATE do nulo revalida ${n.tabela}.${n.fkRevalidada} contra ele.`
  );
}

const CONEXAO = process.env['DATABASE_URL'] ?? process.env['TEST_DATABASE_URL'];

let cliente: Client;
let chaves: ChaveDoBanco[] = [];
let pares: ParDoBanco[] = [];
let nulosContraCascata: NuloContraCascataDoBanco[] = [];

before(async () => {
  if (CONEXAO === undefined || CONEXAO === '') {
    throw new Error(
      'DATABASE_URL não está definida. Este arquivo cruza a ação de deleção de cada chave ' +
        'estrangeira com as restrições da tabela, e sem banco ele não confere nada. Passar ' +
        'verde sem conferir é o desfecho que ele existe para impedir. Rode ' +
        '`npm run test:integration`.',
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

  // A DESCOBERTA É AQUI, e é no catálogo. Nenhuma migração é lida.
  const r = await cliente.query<{
    tabela: string;
    nome: string;
    colunas: string[];
    referencia: string;
    codigo: string;
    afetadas: { nome: string; naoNula: boolean; padrao: string | null }[];
  }>(
    `select ns.nspname || '.' || rel.relname as tabela,
            con.conname                      as nome,
            (select array_agg(a.attname::text order by k.ord)
               from unnest(con.conkey) with ordinality k(attnum, ord)
               join pg_attribute a on a.attrelid = con.conrelid and a.attnum = k.attnum)
                                             as colunas,
            fns.nspname || '.' || frel.relname as referencia,
            con.confdeltype::text            as codigo,
            (select coalesce(
                      json_agg(json_build_object(
                        'nome', a.attname,
                        'naoNula', a.attnotnull,
                        'padrao', pg_get_expr(ad.adbin, ad.adrelid)
                      ) order by k.ord), '[]'::json)
               from unnest(coalesce(con.confdelsetcols, con.conkey)) with ordinality k(attnum, ord)
               join pg_attribute a on a.attrelid = con.conrelid and a.attnum = k.attnum
               left join pg_attrdef ad on ad.adrelid = a.attrelid and ad.adnum = a.attnum)
                                             as afetadas
       from pg_constraint con
       join pg_class rel     on rel.oid  = con.conrelid
       join pg_namespace ns  on ns.oid   = rel.relnamespace
       join pg_class frel    on frel.oid = con.confrelid
       join pg_namespace fns on fns.oid  = frel.relnamespace
      where con.contype = 'f'
        and ns.nspname = any($1::text[])
      order by 1, 2`,
    [ESQUEMAS_DO_PRODUTO],
  );

  chaves = r.rows.map((linha) => {
    const acao = ACAO_POR_CODIGO[linha.codigo];
    if (acao === undefined) {
      throw new Error(
        `confdeltype '${linha.codigo}' desconhecido em ${linha.tabela}.${linha.nome}. O ` +
          'catálogo passou a devolver um código que este arquivo não sabe ler, e classificar ' +
          'errado é pior que não classificar.',
      );
    }
    // O `pg` só devolve array de verdade para tipo que ele sabe analisar:
    // `attname` é do tipo `name`, e `array_agg` sem `::text` chega aqui como a
    // string crua `{col}`. Sem esta guarda, o caso que compara colunas quebra
    // com TypeError em vez de reprovar pela regra — falha com a cor errada.
    if (!Array.isArray(linha.colunas) || !Array.isArray(linha.afetadas)) {
      throw new Error(
        `${linha.tabela}.${linha.nome}: o catálogo devolveu coluna fora de array. A consulta ` +
          'de descoberta deixou de ser analisável, e comparar contra isto daria falha de tipo ' +
          'no lugar de veredito.',
      );
    }
    return {
      chave: `${linha.tabela}.${linha.nome}`,
      tabela: linha.tabela,
      nome: linha.nome,
      colunas: linha.colunas,
      referencia: linha.referencia,
      aoApagar: acao,
      colunasAfetadas: linha.afetadas,
    };
  });

  if (chaves.length === 0) {
    throw new Error(
      'Nenhuma chave estrangeira encontrada nos esquemas do produto. Verificação que não ' +
        'consegue verificar precisa reprovar: banco sem as migrações aplicadas reprova aqui, ' +
        'e nunca passa por não ter achado nada.',
    );
  }

  // Os PARES, também do catálogo: FK que põe nulo ou default, cruzada com toda
  // restrição CHECK da mesma tabela que NOMEIA a coluna que recebe o nulo.
  const p = await cliente.query<{
    tabela: string;
    fk: string;
    restricao: string;
    coluna: string;
    definicao: string;
  }>(
    `with fk as (
        select con.oid, con.conrelid,
               ns.nspname || '.' || rel.relname                as tabela,
               con.conname                                     as fk,
               coalesce(con.confdelsetcols, con.conkey)        as afetadas
          from pg_constraint con
          join pg_class rel    on rel.oid = con.conrelid
          join pg_namespace ns on ns.oid  = rel.relnamespace
         where con.contype = 'f'
           and ns.nspname = any($1::text[])
           and con.confdeltype in ('n', 'd'))
     select fk.tabela, fk.fk, ck.conname as restricao, a.attname as coluna,
            pg_get_constraintdef(ck.oid) as definicao
       from fk
       join unnest(fk.afetadas) k(attnum) on true
       join pg_attribute a  on a.attrelid  = fk.conrelid and a.attnum = k.attnum
       join pg_constraint ck on ck.conrelid = fk.conrelid
                            and ck.contype  = 'c'
                            and a.attnum    = any(ck.conkey)
      order by 1, 2, 4, 3`,
    [ESQUEMAS_DO_PRODUTO],
  );

  pares = p.rows.map((linha) => ({
    chave: `${linha.tabela}.${linha.fk} + ${linha.restricao}`,
    fk: `${linha.tabela}.${linha.fk}`,
    restricao: linha.restricao,
    coluna: linha.coluna,
    definicao: linha.definicao,
  }));

  // A quinta forma, que atravessa três tabelas e por isso não cabe na consulta
  // de pares acima.
  nulosContraCascata = await descobrirNulosContraCascata(cliente);
});

after(async () => {
  if (cliente !== undefined) await cliente.end();
});

void describe('o registro cobre o banco: chave nova sem entrada reprova, nomeando', () => {
  void it('toda chave estrangeira do banco está declarada aqui, e toda declarada existe', () => {
    const noBanco = chaves.map((c) => c.chave).sort();
    const declaradas = Object.keys(CHAVES_ESTRANGEIRAS).sort();

    assert.deepEqual(
      noBanco.filter((c) => !declaradas.includes(c)),
      [],
      'chave estrangeira no banco sem entrada em CHAVES_ESTRANGEIRAS. Declare a ação de ' +
        'deleção dela lá, e pergunte ao banco se ela cabe: FK que entra sem ninguém olhar ' +
        'para o ON DELETE é exatamente como as três de 22/09 entraram.',
    );
    assert.deepEqual(
      declaradas.filter((c) => !noBanco.includes(c)),
      [],
      'chave declarada em CHAVES_ESTRANGEIRAS que o banco não tem mais. Ou a migração a ' +
        'derrubou, ou ela mudou de nome — nos dois casos alguém precisa olhar.',
    );
  });

  void it('cada chave tem exatamente a ação de deleção declarada', () => {
    for (const c of chaves) {
      const esperada = CHAVES_ESTRANGEIRAS[c.chave];
      if (esperada === undefined) continue; // o caso acima já reprovou, com nome.
      assert.equal(
        c.aoApagar,
        esperada.aoApagar,
        `${c.chave}: o banco executa ON DELETE ${c.aoApagar} e aqui está declarado ` +
          `${esperada.aoApagar}. Ação de deleção é o que decide se apagar uma conta funciona, ` +
          'falha com 23514 ou apaga em silêncio o que ninguém pediu.',
      );
    }
  });

  void it('cada chave aponta para a tabela e as colunas declaradas', () => {
    for (const c of chaves) {
      const esperada = CHAVES_ESTRANGEIRAS[c.chave];
      if (esperada === undefined) continue;
      assert.deepEqual(
        c.colunas,
        [...esperada.colunas],
        `${c.chave} é sobre as colunas ${c.colunas.join(', ')}, e aqui está declarada sobre ` +
          `${esperada.colunas.join(', ')}.`,
      );
      assert.equal(
        c.referencia,
        esperada.referencia,
        `${c.chave} referencia ${c.referencia}, e aqui está declarada contra ` +
          `${esperada.referencia}.`,
      );
    }
  });

  void it('a inspeção tem o que inspecionar', () => {
    // Verificação que não consegue verificar precisa reprovar. Se a consulta
    // parar de casar, os casos acima passariam percorrendo lista vazia.
    assert.ok(
      chaves.length >= Object.keys(CHAVES_ESTRANGEIRAS).length,
      `só ${String(chaves.length)} chaves estrangeiras lidas do catálogo, contra ` +
        `${String(Object.keys(CHAVES_ESTRANGEIRAS).length)} declaradas: a consulta de ` +
        'descoberta deixou de casar e os casos deste arquivo passariam percorrendo lista vazia',
    );
    assert.ok(
      chaves.some((c) => c.aoApagar === 'SET NULL'),
      'nenhuma FK SET NULL reconhecida. A classificação por confdeltype deixou de casar, e ' +
        'o defeito que este arquivo vigia é justamente o SET NULL: sem reconhecer nenhum, ' +
        'todo o bloco de contradição fica verde por não ter olhado para nada.',
    );
    assert.ok(
      chaves.some((c) => c.aoApagar === 'CASCADE'),
      'nenhuma FK CASCADE reconhecida: a classificação por confdeltype deixou de casar',
    );
  });
});

void describe('a contradição entre a ação de deleção e a restrição da tabela', () => {
  void it('nenhum SET NULL ou SET DEFAULT recai sobre coluna NOT NULL', () => {
    // Esta metade é decidível sem opinião: o catálogo sabe que a coluna é NOT
    // NULL e sabe que a ação põe nulo nela. Não existe leitura em que isso
    // funcione.
    const acusadas = chaves
      .filter((c) => c.aoApagar === 'SET NULL')
      .flatMap((c) => c.colunasAfetadas.filter((a) => a.naoNula).map((a) => `${c.chave} -> ${a.nome}`))
      .sort();

    assert.deepEqual(
      acusadas,
      [],
      'ON DELETE SET NULL sobre coluna NOT NULL. A exclusão da linha referenciada vai falhar ' +
        'com 23502 no momento em que o Postgres tentar pôr o nulo, e o caminho que apaga ' +
        'linha referenciada é a exclusão de conta.',
    );
  });

  void it('nenhum SET DEFAULT recai sobre coluna sem DEFAULT declarado', () => {
    // `SET DEFAULT` sem default é `SET NULL` disfarçado, com a agravante de
    // que quem lê a migração acredita que há um valor de reposição.
    const acusadas = chaves
      .filter((c) => c.aoApagar === 'SET DEFAULT')
      .flatMap((c) =>
        c.colunasAfetadas.filter((a) => a.padrao === null).map((a) => `${c.chave} -> ${a.nome}`),
      )
      .sort();

    assert.deepEqual(
      acusadas,
      [],
      'ON DELETE SET DEFAULT sobre coluna sem DEFAULT declarado. O Postgres põe NULL, que é ' +
        'o oposto do que a declaração promete a quem lê. Declare o default, ou use SET NULL ' +
        'e assuma o nulo.',
    );
  });

  void it('todo par (chave que põe nulo, restrição sobre a coluna) tem veredito escrito', () => {
    // O defeito que se quer impedir é o silêncio. Par novo entrando sem
    // veredito reprova nomeando os DOIS lados, porque é preciso abrir o banco e
    // perguntar se o nulo cabe — e ninguém pergunta o que não sabe que existe.
    const noBanco = pares.map((p) => p.chave).sort();
    const declarados = Object.keys(PARES_DE_NULO_CONTRA_RESTRICAO).sort();

    assert.deepEqual(
      noBanco.filter((c) => !declarados.includes(c)),
      [],
      'par (chave estrangeira que põe nulo, restrição CHECK que nomeia a coluna que recebe o ' +
        'nulo) sem entrada em PARES_DE_NULO_CONTRA_RESTRICAO. Abra o banco, apague a linha ' +
        'referenciada e escreva o que aconteceu: se der 23514, o veredito é `contradiz`.',
    );
    assert.deepEqual(
      declarados.filter((c) => !noBanco.includes(c)),
      [],
      'par declarado em PARES_DE_NULO_CONTRA_RESTRICAO que o banco não tem mais. Ou a ação ' +
        'de deleção mudou, ou a restrição saiu — nos dois casos alguém precisa olhar, e não ' +
        'é para isto ficar verde.',
    );
  });

  void it('nenhum par em contradição sobreviveu no banco', () => {
    // A ASSERÇÃO CENTRAL. Ela nomeia: quem revisar precisa saber QUAL chave e
    // QUAL restrição se contradizem, porque "há uma contradição no esquema" não
    // conserta nada.
    const contradizem = pares
      .filter((p) => PARES_DE_NULO_CONTRA_RESTRICAO[p.chave]?.veredito === 'contradiz')
      .map((p) => {
        const declarado = PARES_DE_NULO_CONTRA_RESTRICAO[p.chave];
        return (
          `\n  ${p.fk} põe NULL em ${p.coluna}, e ${p.restricao} o proíbe.` +
          `\n    ${p.definicao}` +
          `\n    medido: ${declarado?.medicao ?? '(sem medição declarada)'}`
        );
      });

    assert.deepEqual(
      contradizem,
      [],
      'chave estrangeira e restrição se contradizem: a exclusão da linha referenciada falha ' +
        'com 23514 no momento em que o Postgres tenta pôr o nulo. Em caminho de exclusão de ' +
        'conta isto é dado pessoal que não se consegue apagar.' +
        `${contradizem.join('')}`,
    );
  });
});

void describe('a quinta forma: o nulo que corre junto com a cascata de um terceiro', () => {
  void it('todo formato de risco do banco tem veredito escrito, e todo escrito existe', () => {
    const semVeredito = nulosContraCascata
      .filter((n) => NULOS_CONTRA_CASCATA_DE_TERCEIRO[n.chave] === undefined)
      .map(descrever);

    assert.deepEqual(
      semVeredito,
      [],
      'formato de risco da quinta forma sem entrada em NULOS_CONTRA_CASCATA_DE_TERCEIRO. ' +
        'Abra o banco, apague a linha referenciada e escreva o que aconteceu: se der 23503 ' +
        'numa chave que a linha do nulo NÃO estava mudando, o veredito é `contradiz`.' +
        `${semVeredito.join('')}`,
    );

    // O outro sentido. Entrada que sobrevive à chave que a justificava afirma
    // um risco que o banco não tem, e foi exatamente assim que a entrada de
    // `found_reports.tag_id` precisou sair do registro de pares.
    const noBanco = new Set(nulosContraCascata.map((n) => n.chave));
    assert.deepEqual(
      Object.keys(NULOS_CONTRA_CASCATA_DE_TERCEIRO)
        .filter((c) => !noBanco.has(c))
        .sort(),
      [],
      'veredito declarado para um formato que o banco não tem mais. Se a ação de deleção ' +
        'mudou, apague a linha: registro que não corresponde ao banco é pior que registro ' +
        'nenhum, porque ele é lido como se correspondesse.',
    );
  });

  void it('nenhum nulo em contradição com cascata de terceiro sobreviveu no banco', () => {
    const contradizem = nulosContraCascata
      .filter((n) => NULOS_CONTRA_CASCATA_DE_TERCEIRO[n.chave]?.veredito === 'contradiz')
      .map(
        (n) =>
          `${descrever(n)}` +
          `\n    medido: ${NULOS_CONTRA_CASCATA_DE_TERCEIRO[n.chave]?.medicao ?? '(sem medição)'}`,
      );

    assert.deepEqual(
      contradizem,
      [],
      'o UPDATE do SET NULL revalida uma chave contra um pai que a cascata já apagou na mesma ' +
        'instrução: 23503, e em caminho de exclusão de conta isto é dado pessoal que não se ' +
        'consegue apagar.' +
        `${contradizem.join('')}`,
    );
  });
});

void describe('a cascata, que não falha: ela apaga em silêncio', () => {
  void it('toda CASCADE declara de quem é a linha que some', () => {
    const semNota = chaves
      .filter((c) => c.aoApagar === 'CASCADE')
      .filter((c) => {
        const declarada = CHAVES_ESTRANGEIRAS[c.chave];
        return declarada !== undefined && (declarada.levaJunto ?? '').trim() === '';
      })
      .map((c) => c.chave)
      .sort();

    assert.deepEqual(
      semNota,
      [],
      'CASCADE sem `levaJunto`. A cascata não estoura: ela apaga e fica quieta, e a única ' +
        'pergunta que importa — de quem é a linha que some — não tem resposta no catálogo. ' +
        'Escreva a resposta.',
    );
  });

  void it('a lista de cascatas que atravessam pessoas e o banco concordam', () => {
    const declaradas = [...CASCATAS_QUE_ATRAVESSAM_PESSOAS].sort();
    const noBanco = chaves.map((c) => c.chave);

    assert.deepEqual(
      declaradas.filter((c) => !noBanco.includes(c)),
      [],
      'caminho de cascata entre pessoas declarado que o banco não tem mais. Se ele sumiu, ' +
        'apague a linha da lista — lista que não corresponde ao banco é pior que lista nenhuma.',
    );

    for (const chave of declaradas) {
      const atual = chaves.find((c) => c.chave === chave);
      assert.ok(atual, `${chave} não existe no banco`);
      assert.equal(
        atual.aoApagar,
        'CASCADE',
        `${chave} está na lista de cascatas entre pessoas mas hoje é ${atual.aoApagar}. Se ` +
          'alguém corrigiu o caminho, tire-o da lista junto.',
      );
    }
  });
});

// ===========================================================================
// O EFEITO, E NÃO SÓ A DECLARAÇÃO
// ===========================================================================
// Os casos acima perguntam se as declarações combinam. Estes perguntam se a
// exclusão FUNCIONA, que é a pergunta que a pessoa faz quando pede a conta de
// volta. É a prova mais forte disponível, e é a que mede o veredito de cada par
// em vez de aceitá-lo escrito.
//
// Tudo dentro de uma transação que termina em ROLLBACK: nada sobrevive à
// execução, e a ordem dos arquivos da suíte não muda o resultado.

const CONTA = '9e1f0000-0000-4000-8000-000000000001';
const CONTA_DONA = '9e1f0000-0000-4000-8000-000000000002';
const CONTA_TERCEIRA = '9e1f0000-0000-4000-8000-000000000003';
const PET = '9e1f0000-0000-4000-8000-00000000000a';
const PET_DA_DONA = '9e1f0000-0000-4000-8000-00000000000b';
const TAG = '9e1f0000-0000-4000-8000-00000000001a';
const AVISO_DE_SCAN = '9e1f0000-0000-4000-8000-00000000002a';
const AVISO_AVULSO = '9e1f0000-0000-4000-8000-00000000002b';
const CASO = '9e1f0000-0000-4000-8000-00000000003a';
const CANDIDATO = '9e1f0000-0000-4000-8000-00000000004a';
const PROFISSIONAL = '9e1f0000-0000-4000-8000-00000000005a';
const INTENCAO = '9e1f0000-0000-4000-8000-00000000006a';
const FOTO = '9e1f0000-0000-4000-8000-00000000007a';

/** Erro do `pg` com o `code` do Postgres, que é o que interessa aqui. */
function codigoDoErro(erro: unknown): string {
  return typeof erro === 'object' && erro !== null && 'code' in erro
    ? String(erro.code)
    : `(sem code) ${erro instanceof Error ? erro.message : String(erro)}`;
}

void describe('o efeito, e não só a declaração: apagar uma conta de verdade', () => {
  /** Monta a massa dentro de um SAVEPOINT e devolve o controle ao caso. */
  async function comMassa(corpo: () => Promise<void>): Promise<void> {
    await cliente.query('BEGIN');
    try {
      await cliente.query(
        `insert into users (id, email) values
           ($1, 'achadora@efeito.test'),
           ($2, 'dona@efeito.test'),
           ($3, 'terceira@efeito.test')`,
        [CONTA, CONTA_DONA, CONTA_TERCEIRA],
      );
      await cliente.query(
        `insert into pets (id, owner_user_id, name, species_code, size_code) values
           ($1, $2, 'Rex', 'dog', 'M'),
           ($3, $4, 'Mel', 'dog', 'M')`,
        [PET, CONTA, PET_DA_DONA, CONTA_DONA],
      );
      await cliente.query(
        `insert into pet_tags (id, pet_id, code_hash, code_suffix)
         values ($1, $2, sha256('efeito'::bytea), 'EFE7')`,
        [TAG, PET],
      );
      // Aviso nascido de leitura de QR: é ele que carrega `origin = tag_scan`,
      // e portanto o `CHECK` que proíbe o nulo em `tag_id`.
      await cliente.query(
        `insert into found_reports
           (id, origin, tag_id, pet_id, found_at, finder_token_hash, finder_token_expires_at)
         values ($1, 'tag_scan', $2, $3, now(), sha256('achador'::bytea), now() + interval '7 days')`,
        [AVISO_DE_SCAN, TAG, PET],
      );
      // Caso de perdido da DONA, com candidato apontando para um aviso avulso
      // registrado pela ACHADORA: o par que faz a cascata atravessar pessoas.
      await cliente.query(
        `insert into lost_cases (id, pet_id, owner_user_id, last_seen_at, last_seen_city, share_token)
         values ($1, $2, $3, now(), 'Sao Paulo', 'tok-do-caso-do-efeito')`,
        [CASO, PET_DA_DONA, CONTA_DONA],
      );
      await cliente.query(
        `insert into found_reports
           (id, origin, reporter_user_id, found_at, species, size, found_city, retention_until)
         values ($1, 'stray_report', $2, now(), 'dog', 'M', 'Sao Paulo', now() + interval '90 days')`,
        [AVISO_AVULSO, CONTA],
      );
      await cliente.query(
        `insert into match_candidates
           (id, case_id, found_report_id, score, link_origin, strategy_version)
         values ($1, $2, $3, 0.800, 'attribute_match', 'v1')`,
        [CANDIDATO, CASO, AVISO_AVULSO],
      );
      await cliente.query(
        `insert into professionals
           (id, kind, display_name, source, claim_status, claimed_by_user_id, claimed_at)
         values ($1, 'vet', 'Clinica do Efeito', 'self', 'claimed', $2, now())`,
        [PROFISSIONAL, CONTA_TERCEIRA],
      );
      // O par que torna a exclusão de conta dependente de ORDEM:
      // `upload_intents.user_id` é CASCADE e `pet_photos.upload_intent_id` é
      // RESTRICT. A conta só sai porque a cascata de `pets` apaga a foto antes
      // de a cascata de `upload_intents` chegar na intenção. Sem estas duas
      // linhas na massa, o caso de exclusão passaria sem nunca tocar o RESTRICT.
      await cliente.query(
        `insert into upload_intents
           (id, user_id, pet_id, kind, object_key, declared_type, max_bytes, expires_at)
         values ($1, $2, $3, 'pet_photo', 'efeito/1', 'image/jpeg', 1000000,
                 now() + interval '1 hour')`,
        [INTENCAO, CONTA, PET],
      );
      await cliente.query(
        `insert into pet_photos
           (id, pet_id, upload_intent_id, status, original_key, is_primary, created_at)
         values ($1, $2, $3, 'processing', 'efeito/1', false, now())`,
        [FOTO, PET, INTENCAO],
      );
      await corpo();
    } finally {
      await cliente.query('ROLLBACK');
    }
  }

  void it('a exclusão de conta CONCLUI, e leva embora o que é da própria pessoa', async () => {
    await comMassa(async () => {
      // A pergunta que nenhuma comparação de declaração responde: funciona?
      try {
        await cliente.query('delete from users where id = $1', [CONTA]);
      } catch (erro) {
        assert.fail(
          `a exclusão de conta FALHOU com ${codigoDoErro(erro)}. Este é o desfecho que a ` +
            'classe inteira produz: 23514 quando um CHECK proíbe o nulo que a FK manda pôr, ' +
            '23502 quando a coluna é NOT NULL, 23503 quando um RESTRICT no meio do caminho ' +
            `trava. Mensagem: ${erro instanceof Error ? erro.message : String(erro)}`,
        );
      }

      const { rows } = await cliente.query<{
        pets: string;
        tags: string;
        avisos_de_scan: string;
        avisos_avulsos: string;
        intencoes: string;
        fotos: string;
      }>(
        `select (select count(*) from pets           where id = $1) as pets,
                (select count(*) from pet_tags       where id = $2) as tags,
                (select count(*) from found_reports  where id = $3) as avisos_de_scan,
                (select count(*) from found_reports  where id = $4) as avisos_avulsos,
                (select count(*) from upload_intents where id = $5) as intencoes,
                (select count(*) from pet_photos     where id = $6) as fotos`,
        [PET, TAG, AVISO_DE_SCAN, AVISO_AVULSO, INTENCAO, FOTO],
      );
      assert.deepEqual(
        rows[0],
        {
          pets: '0',
          tags: '0',
          avisos_de_scan: '0',
          avisos_avulsos: '0',
          intencoes: '0',
          fotos: '0',
        },
        'a exclusão concluiu mas deixou linha da própria pessoa para trás. Exclusão de conta ' +
          'que conclui sem apagar não é exclusão: é a promessa quebrada em silêncio.',
      );
    });
  });

  void it('a cascata atravessa pessoas: o caso da dona perde o candidato, e nada acusa', async () => {
    await comMassa(async () => {
      await cliente.query('delete from users where id = $1', [CONTA]);

      const { rows } = await cliente.query<{ candidatos: string; caso: string }>(
        `select (select count(*) from match_candidates where id = $1) as candidatos,
                (select count(*) from lost_cases       where id = $2) as caso`,
        [CANDIDATO, CASO],
      );

      // Este caso AFIRMA o comportamento de hoje em vez de exigir outro: ele
      // existe para que a mudança apareça. Se algum dia o candidato passar a
      // sobreviver — porque alguém trocou a cascata por anonimização —, este
      // caso reprova e a pessoa que fez a troca lê aqui por quê.
      assert.equal(
        rows[0]?.caso,
        '1',
        'o caso de perdido da DONA sumiu quando a ACHADORA apagou a conta dela. Isto seria ' +
          'exclusão de conta apagando o caso de outra pessoa, e é incidente, não defeito.',
      );
      assert.equal(
        rows[0]?.candidatos,
        '0',
        'o candidato sobreviveu ao aviso que ele cita. `match_candidates.found_report_id` é ' +
          'NOT NULL com ON DELETE CASCADE: se a linha ficou, a cascata mudou e o registro ' +
          'deste arquivo está desatualizado.',
      );
    });
  });

  void it('o par compatível é compatível de verdade: o nulo cabe e a linha sobrevive', async () => {
    // O LADO PERMISSIVO, medido. Portão que reprova quem está certo é desligado
    // na primeira semana, e o jeito de não reprovar quem está certo é provar
    // que o certo passa — não afirmar que passa.
    await comMassa(async () => {
      await cliente.query('delete from users where id = $1', [CONTA_TERCEIRA]);

      const { rows } = await cliente.query<{
        claim_status: string;
        claimed_by_user_id: string | null;
        tem_marco: boolean;
      }>(
        `select claim_status, claimed_by_user_id, claimed_at is not null as tem_marco
           from professionals where id = $1`,
        [PROFISSIONAL],
      );
      assert.deepEqual(
        rows[0],
        { claim_status: 'claimed', claimed_by_user_id: null, tem_marco: true },
        'professionals.claimed_by_user_id está declarado como par COMPATÍVEL, e a medição ' +
          'discorda. Ou o CHECK apertou, ou a ação mudou: o veredito escrito em ' +
          'PARES_DE_NULO_CONTRA_RESTRICAO deixou de valer.',
      );
    });
  });

  void it('apagar a tag reprova pela chave estrangeira, e o achado de escaneamento sobrevive', async () => {
    // ESTE CASO AFIRMAVA A FALHA. Até 22/09 ele exigia `23514` em
    // `found_reports_scan_tem_tag_e_pet`, e foi escrito assim de propósito:
    // para reprovar no dia em que a migração chegasse, com o arquivo inteiro na
    // mão de quem consertasse.
    //
    // `20260922000004_tag-apagada-nao-contradiz-o-achado.sql` chegou. O que
    // mudou não é "a tag passou a poder ser apagada": ela continua não podendo,
    // e isso é a decisão. O que mudou é QUEM recusa e QUANDO.
    //
    //   antes  23514 / found_reports_scan_tem_tag_e_pet
    //          O CHECK recusa a linha que o `SET NULL` acabou de fabricar. O
    //          erro aponta para uma restrição da tabela errada, num `UPDATE`
    //          que ninguém escreveu, e não diz o que está no caminho.
    //   agora  23503 / found_reports_tag_id_fkey
    //          A chave recusa a exclusão antes de fabricar linha nenhuma, e
    //          nomeia a tabela que segura a tag.
    //
    // Mesma recusa, contada pelo lado que explica. A comparação dos dois
    // códigos é o caso: se voltar a ser 23514, o `SET NULL` voltou.
    await comMassa(async () => {
      await cliente.query('SAVEPOINT tentativa');
      let codigo = '(não falhou)';
      let restricao = '(nenhuma)';
      try {
        await cliente.query('delete from pet_tags where id = $1', [TAG]);
      } catch (erro) {
        codigo = codigoDoErro(erro);
        restricao =
          typeof erro === 'object' && erro !== null && 'constraint' in erro
            ? String(erro.constraint)
            : '(sem constraint)';
      }
      await cliente.query('ROLLBACK TO SAVEPOINT tentativa');

      assert.equal(
        codigo,
        '23503',
        'apagar uma tag citada por um aviso de leitura de QR devia reprovar com 23503, que é ' +
          'a chave estrangeira segurando. 23514 significa que `found_reports.tag_id` voltou a ' +
          'ser ON DELETE SET NULL e a contradição de 22/09 ressuscitou. "(não falhou)" é pior: ' +
          'a tag passou a ser apagável e a procedência do achado some em silêncio.',
      );
      assert.equal(
        restricao,
        'found_reports_tag_id_fkey',
        'a exclusão da tag falhou por outra restrição que não a chave estrangeira. Sintoma ' +
          'que reaparece com outro nome é cadeia, não recaída: olhe a mensagem crua antes de ' +
          'mexer no registro.',
      );

      // A METADE DE PRODUTO DA DECISÃO, e ela não sai do código de erro: o
      // aviso é a prova de que alguém achou o animal e leu a plaquinha, e ele
      // continua de pé — com a tag, com o pet e com o token da conversa
      // mediada, que é por onde tutor e achador combinam a devolução.
      //
      // `CASCADE` teria passado nas duas asserções acima por outro caminho (a
      // exclusão simplesmente concluiria) e apagado exatamente isto. É esta
      // conferência que separa as duas formas.
      const { rows } = await cliente.query<{
        avisos: string;
        com_tag: string;
        com_token: string;
        tags: string;
      }>(
        `select (select count(*) from found_reports where id = $1) as avisos,
                (select count(*) from found_reports
                  where id = $1 and tag_id = $2 and pet_id = $3) as com_tag,
                (select count(*) from found_reports
                  where id = $1 and finder_token_hash is not null) as com_token,
                (select count(*) from pet_tags where id = $2) as tags`,
        [AVISO_DE_SCAN, TAG, PET],
      );
      assert.deepEqual(
        rows[0],
        { avisos: '1', com_tag: '1', com_token: '1', tags: '1' },
        'o aviso de leitura de QR não sobreviveu inteiro à tentativa de apagar a tag. Se ele ' +
          'sumiu, a ação virou CASCADE e o produto passou a apagar a prova de um resgate ' +
          'porque a plaquinha foi descartada. Se `tag_id` ficou nulo, o SET NULL voltou.',
      );
    });
  });
});

// ===========================================================================
// A ISCA DA QUINTA FORMA
// ===========================================================================
// Verificação que nunca reprovou não é verificação, e a única prova disponível
// aqui é o defeito de 22/09 em si. Este bloco DEVOLVE o `SET NULL` ao banco,
// dentro de uma transação que termina em `ROLLBACK`, e exige duas coisas do
// portão: que ele acuse, e que a acusação diga ONDE.
//
// "O portão acusa" sozinho não bastaria. Uma mensagem como "há um risco no
// esquema" reprova igual e não conserta nada: quem ler daqui a um mês precisa
// das três tabelas e do caminho da cascata para saber o que abrir. Por isso a
// asserção abaixo confere o TEXTO, e não só a quantidade.
//
// A DDL dentro da transação é de propósito, e é segura: o Postgres tem DDL
// transacional, então o `ROLLBACK` devolve a chave ao `CASCADE` mesmo se uma
// asserção estourar no meio. A alternativa — medir num banco à parte — mediria
// outro esquema, que é precisamente o erro que este arquivo existe para não
// cometer.

const ACHADORA = '9e1f0000-0000-4000-8000-0000000000c1';
const TUTORA = '9e1f0000-0000-4000-8000-0000000000c2';
const PET_DA_TUTORA = '9e1f0000-0000-4000-8000-0000000000cb';
const AVISO_DA_ACHADORA = '9e1f0000-0000-4000-8000-0000000000cc';
const CONVERSA = '9e1f0000-0000-4000-8000-0000000000cd';
const MENSAGEM = '9e1f0000-0000-4000-8000-0000000000ce';

const DE = '9e1f0000-0000-4000-8000-0000000000e1';
const PARA = '9e1f0000-0000-4000-8000-0000000000e2';
const PET_TRANSFERIDO = '9e1f0000-0000-4000-8000-0000000000eb';
const TRANSFERENCIA = '9e1f0000-0000-4000-8000-0000000000ec';

/**
 * A MEDIÇÃO do veredito de `pet_transfers`, reexecutada a cada rodada.
 *
 * O veredito escrito em `NULOS_CONTRA_CASCATA_DE_TERCEIRO` é `compativel`, e
 * ele conclui por ORDEM DE GATILHO e não por garantia de desenho. Veredito que
 * depende de ordem e vive só num comentário é veredito que envelhece calado: no
 * dia em que `pet_transfers.pet_id` deixar de ser `CASCADE`, o comentário
 * continua dizendo `compativel` e o banco passa a responder `23503`.
 *
 * Por isso os dois lados são medidos aqui, com `DELETE` de verdade:
 * o caminho que a ordem salva, e o caminho em que o nulo é o desfecho normal.
 */
void describe('a quinta forma de `pet_transfers`, medida e não lida', () => {
  async function comTransferencia(
    dono: string,
    corpo: () => Promise<void>,
  ): Promise<void> {
    await cliente.query('BEGIN');
    try {
      await cliente.query(
        `insert into users (id, email) values ($1, 'de@transfere.test'), ($2, 'para@transfere.test')`,
        [DE, PARA],
      );
      await cliente.query(
        `insert into pets (id, owner_user_id, name, species_code, size_code)
         values ($1, $2, 'Rex', 'dog', 'M')`,
        [PET_TRANSFERIDO, dono],
      );
      await cliente.query(
        `insert into pet_transfers
           (id, pet_id, from_user_id, recipient_email, to_user_id, invite_token_hash,
            status, invite_expires_at, accepted_at, effective_at)
         values ($1, $2, $3, 'para@transfere.test', $4, sha256('transfere'::bytea),
                 $5, now() + interval '72 hours', now(), now() + interval '24 hours')`,
        [TRANSFERENCIA, PET_TRANSFERIDO, DE, PARA, dono === PARA ? 'effective' : 'accepted'],
      );
      await corpo();
    } finally {
      await cliente.query('ROLLBACK');
    }
  }

  void it('apagar a conta de quem RECEBEU e virou dono do pet CONCLUI', async () => {
    // O caminho que a descoberta acusou. `dono === PARA` é o que faz a cascata
    // `users -> pets` alcançar a MESMA linha que o `SET NULL` de `to_user_id`
    // está atualizando, que é a condição inteira do defeito.
    await comTransferencia(PARA, async () => {
      try {
        await cliente.query('delete from users where id = $1', [PARA]);
      } catch (erro) {
        assert.fail(
          `a exclusão da conta do destinatário FALHOU com ${codigoDoErro(erro)}. O veredito ` +
            '`compativel` de `pet_transfers_to_user_id_fkey + pet_transfers_pet_id_fkey` ' +
            'deixou de valer, e isto é defeito VIVO na exclusão de conta: o UPDATE do SET ' +
            'NULL revalidou `pet_id` contra um pet que a cascata já apagou. A causa mais ' +
            'provável é `pet_transfers.pet_id` ter deixado de ser CASCADE — era ela que ' +
            'apagava a linha antes de a revalidação rodar. ' +
            `Mensagem: ${erro instanceof Error ? erro.message : String(erro)}`,
        );
      }

      const { rows } = await cliente.query<{ n: string }>(
        'select count(*)::text as n from pet_transfers where id = $1',
        [TRANSFERENCIA],
      );
      assert.equal(
        rows[0]?.n,
        '0',
        'a conta saiu e a transferência ficou. A linha aponta para um pet que não existe ' +
          'mais: ou a cascata de `pet_id` mudou, ou alguém a desligou.',
      );
    });
  });

  void it('apagar a conta de quem RECEBEU sem ser dono deixa o nulo, e a linha sobrevive', async () => {
    // O lado permissivo, e ele é permissivo de verdade: o convite aceito e
    // ainda não consumado. Aqui o `SET NULL` é o desfecho NORMAL, e é este nulo
    // que `cancellation_reason = 'recipient_gone'` lê. Sem este caso, o anterior
    // continuaria passando num banco que apagasse a linha por engano.
    await comTransferencia(DE, async () => {
      await cliente.query('delete from users where id = $1', [PARA]);

      const { rows } = await cliente.query<{
        to_user_id: string | null;
        status: string;
      }>('select to_user_id, status from pet_transfers where id = $1', [TRANSFERENCIA]);
      assert.deepEqual(
        rows[0],
        { to_user_id: null, status: 'accepted' },
        'o destinatário saiu e a transferência não ficou com `to_user_id` nulo. É por esse ' +
          'nulo que a consumação sabe que não há para quem entregar o pet.',
      );
    });
  });

  void it('apagar a conta de quem ENVIOU leva a transferência junto', async () => {
    // A outra CASCADE declarada, medida. `from_user_id` é o segundo caminho até
    // a linha, e ele existe para o caso em que o pet já não é de quem enviou.
    await comTransferencia(PARA, async () => {
      await cliente.query('delete from users where id = $1', [DE]);

      const { rows } = await cliente.query<{ n: string }>(
        'select count(*)::text as n from pet_transfers where id = $1',
        [TRANSFERENCIA],
      );
      assert.equal(
        rows[0]?.n,
        '0',
        'a conta de quem enviou saiu e a transferência ficou, apontando para uma conta que ' +
          'não existe mais.',
      );
    });
  });
});

void describe('a isca da quinta forma: com o SET NULL de volta, o portão precisa acusar', () => {
  /**
   * A massa mínima do defeito: a achadora registra o aviso, a conversa nasce
   * desse aviso, e a achadora escreve UMA mensagem. Sem a mensagem não há neto
   * para revalidar nada, e o caminho conclui — foi assim que o defeito passou
   * despercebido nas duas branches de origem.
   */
  /**
   * Quantas vezes a montagem é tentada antes de desistir.
   *
   * Limitado de propósito: `40P01` que não passa em cinco tentativas não é mais
   * contenção, é contenção permanente, e aí o caso precisa reprovar dizendo
   * isso. Repetição sem teto transformaria impedimento em teste pendurado.
   */
  const TENTATIVAS = 5;

  async function comConversa(corpo: () => Promise<void>): Promise<void> {
    // ========================================================================
    // POR QUE ISTO TEM CADEADO EXPLÍCITO **E** REPETIÇÃO
    // ========================================================================
    // A isca reprovava com `deadlock detected` (40P01) em 4 de 31 execuções da
    // suíte inteira, sem defeito nenhum atrás. Medido, e não deduzido:
    //
    //   Process 119 waits for AccessExclusiveLock on relation 19812 (users);
    //     blocked by process 133.
    //   Process 133 waits for RowExclusiveLock on relation 20495
    //     (conversation_messages); blocked by process 119.
    //
    // O pedaço que não é óbvio: `alter table conversation_messages drop
    // constraint ..._sender_user_id_fkey` toma `AccessExclusiveLock` nas DUAS
    // tabelas, e não só na que ela nomeia — a chave estrangeira tem gatilho dos
    // dois lados, e derrubá-la mexe em `users` também. Conferido em `pg_locks`
    // nesta pilha:
    //
    //   conversation_messages | AccessExclusiveLock
    //   users                 | AccessExclusiveLock
    //
    // `node --test` roda os quinze arquivos de integração em paralelo contra o
    // MESMO banco, então essa DDL disputa com o que os outros estão escrevendo.
    //
    // **E não existe ordem de cadeado que resolva isto sozinha.** Essa era a
    // saída óbvia, e ela está errada; as duas ordens já convivem na suíte, e as
    // duas foram medidas em `pg_locks` com uma sessão segurando a outra tabela:
    //
    //   insert into conversation_messages ...
    //     -> SEGURA conversation_messages (RowExclusive), ESPERA users (RowShare)
    //   delete from users ...          (o `after` dos outros arquivos)
    //     -> SEGURA users (RowExclusive), ESPERA conversation_messages (RowExclusive)
    //
    // Filha→pai numa, pai→filha na outra. Qualquer ordem que esta função
    // escolhesse fecharia ciclo com uma das duas. Pedir as duas num `lock table`
    // só também não é atômico: ele adquire em sequência e pode ficar segurando a
    // primeira enquanto espera a segunda.
    //
    // Então são duas medidas, e cada uma faz uma coisa:
    //
    // 1. `lock table` como PRIMEIRA instrução encolhe a janela: em vez de
    //    disputar durante o segundo inteiro que a montagem mais a DDL levam, a
    //    disputa fica restrita à aquisição dos dois cadeados.
    // 2. A repetição cobre o resto. Impasse é transitório por definição — o
    //    Postgres mata um dos participantes e **garante que o outro conclui** —
    //    e repetir a transação vítima é o remédio que a própria documentação do
    //    Postgres indica. Como tudo aqui termina em `ROLLBACK`, repetir parte do
    //    mesmo estado.
    //
    // A repetição NÃO afrouxa a isca: só `40P01` é repetido. Falha de asserção
    // sobe na primeira vez, e `23503`, `23514` ou qualquer outro código do
    // Postgres também — que é o que a isca existe para ver.
    for (let tentativa = 1; ; tentativa += 1) {
      try {
        await montarERodar(corpo);
        return;
      } catch (erro) {
        if (codigoDoErro(erro) !== '40P01' || tentativa >= TENTATIVAS) throw erro;
      }
    }
  }

  async function montarERodar(corpo: () => Promise<void>): Promise<void> {
    await cliente.query('BEGIN');
    try {
      await cliente.query('lock table conversation_messages, users in access exclusive mode');
      await cliente.query(
        `insert into users (id, email) values
           ($1, 'achadora@isca.test'), ($2, 'tutora@isca.test')`,
        [ACHADORA, TUTORA],
      );
      await cliente.query(
        `insert into pets (id, owner_user_id, name, species_code, size_code)
         values ($1, $2, 'Mel', 'dog', 'M')`,
        [PET_DA_TUTORA, TUTORA],
      );
      await cliente.query(
        `insert into found_reports
           (id, origin, reporter_user_id, found_at, species, size, found_city, retention_until)
         values ($1, 'stray_report', $2, now(), 'dog', 'M', 'Sao Paulo',
                 now() + interval '90 days')`,
        [AVISO_DA_ACHADORA, ACHADORA],
      );
      await cliente.query(
        `insert into conversations (id, found_report_id, pet_id, tutor_user_id, finder_user_id)
         values ($1, $2, $3, $4, $5)`,
        [CONVERSA, AVISO_DA_ACHADORA, PET_DA_TUTORA, TUTORA, ACHADORA],
      );
      await cliente.query(
        `insert into conversation_messages
           (id, conversation_id, sender_role, sender_user_id, body)
         values ($1, $2, 'finder', $3, 'achei seu cachorro')`,
        [MENSAGEM, CONVERSA, ACHADORA],
      );
      await corpo();
    } finally {
      await cliente.query('ROLLBACK');
    }
  }

  /** Devolve `conversation_messages.sender_user_id` ao `SET NULL` de antes de 22/09. */
  async function reporOSetNull(): Promise<void> {
    await cliente.query(
      `alter table conversation_messages
         drop constraint conversation_messages_sender_user_id_fkey`,
    );
    await cliente.query(
      `alter table conversation_messages
         add constraint conversation_messages_sender_user_id_fkey
         foreign key (sender_user_id) references users (id) on delete set null`,
    );
  }

  void it('com o SET NULL de volta, a descoberta acusa nomeando as três tabelas e o caminho', async () => {
    await comConversa(async () => {
      await reporOSetNull();

      const achados = await descobrirNulosContraCascata(cliente);
      const chave =
        'public.conversation_messages.conversation_messages_sender_user_id_fkey + ' +
        'conversation_messages_conversation_id_fkey';
      const achado = achados.find((n) => n.chave === chave);

      assert.ok(
        achado,
        'o SET NULL de 22/09 está de volta no banco e a descoberta da quinta forma NÃO o ' +
          'encontrou. O portão parou de enxergar a classe inteira, e o defeito que custou ' +
          'uma exclusão de conta passaria de novo.\nachou: ' +
          `${achados.map((n) => n.chave).join(', ') || '(nada)'}`,
      );

      // A acusação precisa CONSERTAR, e para isso ela nomeia as três tabelas e
      // o caminho. Medir só a quantidade deixaria a mensagem apodrecer.
      const texto = descrever(achado);
      for (const exigido of [
        'public.conversation_messages',
        'conversation_messages_sender_user_id_fkey',
        'public.users',
        'conversation_messages_conversation_id_fkey',
        'public.conversations',
        // Os DOIS caminhos, porque os dois existem: apagar o tutor leva a
        // conversa direto, e apagar quem registrou o aviso a leva pelo aviso.
        // Exigir só um deixaria a agregação apodrecer sem ninguém ver.
        'public.users -> public.conversations',
        'public.users -> public.found_reports -> public.conversations',
      ]) {
        assert.ok(
          texto.includes(exigido),
          `a acusação da quinta forma não diz "${exigido}". Quem ler daqui a um mês precisa ` +
            'das três tabelas e do caminho da cascata para saber o que abrir; sem isso a ' +
            `reprovação é ruído.\nacusação:${texto}`,
        );
      }

      // E ela precisa cair no lado que reprova, não só aparecer na lista.
      assert.equal(
        NULOS_CONTRA_CASCATA_DE_TERCEIRO[chave],
        undefined,
        'o formato que a migração 20260922000005 eliminou voltou a estar declarado no ' +
          'registro. Ele não deve ter entrada: com o CASCADE de pé ele não existe no banco.',
      );
    });
  });

  void it('com o SET NULL de volta, apagar a conta de quem achou FALHA com 23503', async () => {
    await comConversa(async () => {
      await reporOSetNull();
      await cliente.query('SAVEPOINT tentativa');

      try {
        await cliente.query('delete from users where id = $1', [ACHADORA]);
        assert.fail(
          'com o SET NULL de 22/09 de volta, apagar a conta de quem achou o animal CONCLUIU. ' +
            'Ou a ordem dos gatilhos de cascata mudou, ou o esquema mudou: o defeito que a ' +
            'migração 20260922000005 corrige deixou de ser reproduzível, e o portão passou a ' +
            'vigiar uma classe que ninguém consegue mais provar que existe.',
        );
      } catch (erro) {
        if (erro instanceof assert.AssertionError) throw erro;
        assert.equal(
          codigoDoErro(erro),
          '23503',
          'esperava 23503 na revalidação da chave do neto. Outro código significa que a ' +
            'falha mudou de natureza, e a medição escrita na migração deixou de valer.',
        );
      } finally {
        await cliente.query('ROLLBACK TO tentativa');
      }
    });
  });

  void it('com o CASCADE de hoje, a mesma exclusão CONCLUI e não sobra linha órfã', async () => {
    // A outra metade da isca. Portão que reprova o caminho certo junto com o
    // errado é portão desligado na primeira semana, e o jeito de não reprovar
    // quem está certo é provar que o certo passa.
    await comConversa(async () => {
      await cliente.query('delete from users where id = $1', [ACHADORA]);

      const { rows } = await cliente.query<{
        conversas: string;
        mensagens: string;
        avisos: string;
        tutora: string;
      }>(
        `select (select count(*) from conversations where id = $1)          as conversas,
                (select count(*) from conversation_messages where id = $2) as mensagens,
                (select count(*) from found_reports where id = $3)         as avisos,
                (select count(*) from users where id = $4)                 as tutora`,
        [CONVERSA, MENSAGEM, AVISO_DA_ACHADORA, TUTORA],
      );
      assert.deepEqual(
        rows[0],
        { conversas: '0', mensagens: '0', avisos: '0', tutora: '1' },
        'a exclusão concluiu mas o que sobrou não é o esperado. A conversa e a mensagem saem ' +
          'junto com o aviso, pela cascata; a conta da TUTORA não é tocada. Se a tutora sumiu, ' +
          'alguma cascata passou a atravessar para o lado errado.',
      );
    });
  });
});
