-- O indice cego de `code_hash`, e a linha que ele torna irresolvivel.
--
-- Fase 1 do ADR-0004, Emenda 1 (secoes 3.1 e 12.1): `code_hash` deixa de ser
-- SHA-256 sem sal e passa a ser HMAC-SHA-256 com `TAG_CODE_INDEX_KEY`, guardada
-- fora do banco. O codigo continua com 26 caracteres nesta fase; o encurtamento
-- para 16 e a Fase 2 e vem em outra entrega. A ORDEM nao e preferencia: a
-- inversa criaria uma janela em que codigos de 75 bits ficariam guardados sob
-- SHA-256 sem sal, e um vazamento dentro dela nao seria reparavel por entrega
-- nenhuma depois, porque os codigos vazados continuariam corretos para sempre.
--
-- NAO HA MIGRACAO DE ESQUEMA, e isso e o desenho e nao economia: `pet_tags`
-- mantem colunas, tipos e indices; `code_hash` continua `bytea` de 32 bytes
-- porque HMAC-SHA-256 tambem tem 32; `code_suffix` continua `char(4)`. O que
-- muda aqui e (1) o nome de uma restricao que passou a mentir e (2) uma
-- operacao de DADOS.
--
-- ## A operacao de dados, e por que ela pertence a esta fase
--
-- Trocar a funcao de resumo torna todo `code_hash` gravado incomparavel com
-- qualquer entrada. Para uma tag ATIVA isso se conserta: decifra
-- `code_ciphertext`, aplica o HMAC, grava. Para uma tag REVOGADA e impossivel,
-- e e impossivel por decisao do proprio ADR-0004: a revogacao APAGA o cifrado, e
-- `pet_tags_revogada_nao_guarda_o_codigo` obriga `code_ciphertext IS NULL` fora
-- de `active`. O codigo de uma tag revogada nao e recuperavel de lugar nenhum.
--
-- Uma linha revogada sobrevivente seria uma linha IRRESOLVIVEL ocupando o indice
-- unico, e -- o que importa muito mais que a linha -- ela passaria a responder
-- 404 em vez do 410 que o produto promete. "Tag revogada responde 410, nunca
-- 404" nao e detalhe: e o unico caminho que carrega
-- `next_action: register_stray_found_report` para quem esta com um animal no
-- colo. O tutor que revogou uma plaquinha perdida continua com aquela plaquinha
-- circulando, e e exatamente ela que precisa do 410.
--
-- Hoje isso nao custa nada: a unica tag revogada da base e um artefato de teste
-- em homologacao, que ninguem tem na mao. A janela e a mesma da primeira
-- plaquinha impressa, e fecha pelo mesmo motivo -- e o argumento mais forte para
-- nao adiar esta fase. Se um dia esta troca precisar ser feita com tags
-- revogadas REAIS, a saida esta escrita na secao 12.2 da emenda
-- (`code_hash_legacy`, so nas linhas revogadas, consultada so depois do HMAC nao
-- achar nada, e usada so para produzir o 410). Ela NAO e antecipada aqui, pela
-- mesma razao que `pet_id` nao e anulavel: coluna que nada preenche e coluna que
-- ninguem remove depois.
--
-- ## O QUE O ADR NAO TINHA NA MESA: a linha revogada e CITADA
--
-- A secao 12.2 manda apagar a linha revogada, e a razao dela e uma so: com o
-- resumo trocado, a linha vira irresolvivel ocupando o indice unico. O que ela
-- nao sabia e que a tag revogada da base tem um `found_reports` com
-- `origin = 'tag_scan'` apontando para ela, e que esse aviso NAO pode sair.
--
-- Medido no banco de desenvolvimento em 28/09, e nao deduzido:
--   DELETE FROM pet_tags WHERE status = 'revoked'
--     => 23514 / new row for relation "found_reports" violates check
--        constraint "found_reports_scan_tem_tag_e_pet"
--        (a FK era `ON DELETE SET NULL` e o CHECK exige a tag quando a origem
--         e o escaneamento; `20260922000015` trocou essa FK para RESTRICT e
--         com ela o mesmo DELETE passa a reprovar com 23503 -- outra cor, a
--         mesma impossibilidade)
--
-- O aviso nao sai, e isso ja estava decidido: `20260922000015` pesou este caso
-- e concluiu que um achado por escaneamento e registro historico -- ele carrega
-- a conversa mediada com o tutor (`finder_token_hash` e a validade dela), que e
-- por onde o achador e o tutor combinam a devolucao. Apagar a tag no presente
-- nao desfaz o escaneamento do passado.
--
-- Entao o DELETE passa a EXCETUAR as tags citadas, e a excecao nao e estetica:
--
--   * Repontar `found_reports.tag_id` nao existe como opcao. A coluna diz QUAL
--     plaquinha foi lida; apontar para outra seria gravar uma procedencia
--     falsa, e nao ha outra para onde apontar.
--   * Apagar o aviso junto esta fora pelo motivo acima.
--   * Afrouxar `found_reports_scan_tem_tag_e_pet` esta fora pelo motivo que
--     `20260922000015` ja escreveu: trocaria uma contradicao que REPROVA por um
--     silencio que ACEITA aviso de escaneamento sem tag nenhuma.
--
-- E o que se perde guardando a linha e MENOS do que parece. Apagar nunca
-- devolveu o 410 aqui: depois da troca, o `code_hash` gravado e um SHA-256 que
-- nenhuma busca por HMAC vai encontrar, entao aquela plaquinha responde 404 com
-- a linha apagada E com a linha de pe. O que a secao 12.2 compra com o DELETE e
-- higiene de indice unico, e so isso -- e higiene de indice nao vale a
-- procedencia de um resgate. Guardar a linha ainda tem uma vantagem que apagar
-- nao tem: `code_hash_legacy` (12.2, quando for a hora) so pode reparar linha
-- que existe.
--
-- A degradacao que sobra e real e fica REGISTRADA, uma linha de `audit.events`
-- por tag guardada, com o id e o reparo na `metadata`. Registrada e nao apenas
-- anunciada porque o `node-pg-migrate` DESCARTA NOTICE e WARNING de migracao --
-- medido, nao suposto; ver o corpo do bloco. E registro e nao EXCEPTION porque
-- essas plaquinhas ja nao resolvem depois da troca por qualquer caminho, e
-- travar a Fase 1 por elas seria adiar justamente o que a emenda argumenta que
-- nao se adia -- codigo de 75 bits guardado sob SHA-256 sem sal.
--
-- DIVERGENCIA REGISTRADA, nao reinterpretada: a secao 12.2 diz "e apagada na
-- Fase 1" sem qualificacao. Este arquivo a estreita, e quem cuida de `adr/`
-- precisa saber -- o dono da ADR-0004 decide se a emenda ganha a ressalva.
--
-- ## A guarda das tags ativas
--
-- Esta migracao nao recalcula tag ativa, e nao pode: recalcular exige a chave do
-- KMS e a chave do indice, que vivem na aplicacao e nao no banco. Entao ela
-- RECUSA rodar se existir alguma. Apagar em silencio seria destruir plaquinha de
-- gente; seguir em silencio deixaria uma tag que o tutor acredita funcionando
-- respondendo 404. A secao 1 da emenda conferiu que nao existe nenhuma, e a
-- guarda existe para o dia em que essa conferencia deixar de valer -- falhar
-- ruidosamente com o numero na mensagem e melhor do que qualquer um dos dois.

-- Up Migration

DO $$
DECLARE
  ativas bigint;
  revogadas bigint;
  citadas bigint;
  ids_citados text;
BEGIN
  SELECT count(*) INTO ativas FROM pet_tags WHERE status = 'active';
  IF ativas > 0 THEN
    RAISE EXCEPTION
      'Existem % tag(s) ativa(s) e o code_hash delas foi calculado com SHA-256 sem chave. '
      'Esta migracao troca a funcao para HMAC-SHA-256 (ADR-0004, Emenda 1) e NAO consegue '
      'recalcular: o recalculo precisa decifrar code_ciphertext com a chave do KMS e aplicar '
      'TAG_CODE_INDEX_KEY, e as duas vivem na aplicacao. Recalcule pela aplicacao antes de '
      'migrar, ou decida caso a caso -- apagar tag ativa aqui seria destruir plaquinha de '
      'alguem.', ativas;
  END IF;

  -- Revogada nao se recalcula: a revogacao apagou o cifrado. Entao ela sai --
  -- MENOS as que um `found_reports` cita, pelo motivo da secao acima. O
  -- `NOT EXISTS` e o que faz esta migracao significar a mesma coisa em banco
  -- vazio e em banco com dado; sem ele ela aplica no vazio e reprova no outro,
  -- que e exatamente como este defeito chegou a `development`.
  --
  -- `tag_scans` nao entra na conta: aquela FK e CASCADE de proposito (tabela de
  -- insercao apenas, retencao de 90 dias), e a leitura crua vai junto com a tag
  -- sem contradizer restricao nenhuma.
  SELECT count(*), string_agg(t.id::text, ', ' ORDER BY t.id)
    INTO citadas, ids_citados
    FROM pet_tags AS t
   WHERE t.status = 'revoked'
     AND EXISTS (SELECT 1 FROM found_reports AS f WHERE f.tag_id = t.id);

  DELETE FROM pet_tags AS t
   WHERE t.status = 'revoked'
     AND NOT EXISTS (SELECT 1 FROM found_reports AS f WHERE f.tag_id = t.id);
  GET DIAGNOSTICS revogadas = ROW_COUNT;
  RAISE NOTICE 'pet_tags: % linha(s) revogada(s) apagada(s); o codigo delas nao era recuperavel (ADR-0004 12.2).', revogadas;

  -- ===========================================================================
  -- A LINHA GUARDADA VAI PARA A TRILHA, E NAO PARA UM LOG. MEDIDO.
  -- ===========================================================================
  -- O `RAISE NOTICE` acima nunca apareceu em lugar nenhum, e isto foi conferido
  -- e nao suposto: o `node-pg-migrate` nao registra ouvinte de `notice` no
  -- cliente `pg`, entao NOTICE e WARNING levantados por migracao sao
  -- DESCARTADOS. O que ele imprime e o SQL que vai executar -- o texto do
  -- `RAISE` aparece, a mensagem do `RAISE` nao. Conferido em 28/09 rodando a
  -- migracao contra Postgres 16 com massa de aresta: `grep` na saida acha as
  -- linhas do corpo e nenhuma mensagem emitida.
  --
  -- Entao a degradacao nao e ANUNCIADA, ela e REGISTRADA. `audit.events` e o
  -- lugar certo e nao um desvio: `actor_kind = 'system'` existe para isto, a
  -- trilha e imutavel, e ela se CONSULTA -- que e o que 12.2 vai precisar no
  -- dia em que `code_hash_legacy` virar entrega. Uma linha de log que ninguem
  -- ve nao teria nenhuma das tres propriedades.
  --
  -- `gen_random_uuid()` e v4, e o resto do banco usa v7. Aqui isso nao pesa: a
  -- trilha nao ordena por id (`audit_events_occurred_at` e quem ordena) e nao
  -- ha restricao de versao na coluna. Gerar v7 exigiria funcao que este banco
  -- nao tem, e acrescentar uma por causa de duas linhas seria o contrario de
  -- economia.
  INSERT INTO audit.events (id, actor_kind, action, resource_kind, resource_id, metadata)
  SELECT gen_random_uuid(),
         'system',
         'tag_code_hash_nao_migrado_para_hmac',
         'pet_tag',
         t.id::text,
         jsonb_build_object(
           'motivo', 'tag revogada citada por found_reports; apagar destruiria a procedencia do achado',
           'consequencia', 'resolucao publica responde 404 onde o produto promete 410',
           'reparo', 'ADR-0004 Emenda 1 secao 12.2 (code_hash_legacy)',
           'migracao', '20260921000001_indice-cego-do-codigo-da-tag')
    FROM pet_tags AS t
   WHERE t.status = 'revoked'
     AND EXISTS (SELECT 1 FROM found_reports AS f WHERE f.tag_id = t.id);

  -- O WARNING fica, e nao e redundante com a trilha: quem roda a migracao a mao
  -- por `psql` VE a mensagem, e e nessa hora que ela ajuda. Pelo `migracao` do
  -- compose ela se perde, e a trilha e o que sobra.
  IF citadas > 0 THEN
    RAISE WARNING
      'pet_tags: % linha(s) revogada(s) GUARDADA(S) porque um found_reports as cita: %. '
      'O code_hash delas continua SHA-256 e nao casa com o HMAC desta fase, entao essas '
      'plaquinhas respondem 404 onde o produto promete 410 -- o reparo e code_hash_legacy '
      '(ADR-0004, Emenda 1, secao 12.2), que esta fase nao antecipa. Apagar a tag para '
      'limpar o indice destruiria a procedencia do achado, que carrega a conversa mediada '
      'com o tutor (ver migrations/20260922000015).', citadas, ids_citados;
  END IF;
END $$;

ALTER TABLE pet_tags
  RENAME CONSTRAINT pet_tags_code_hash_sha256 TO pet_tags_code_hash_32_bytes;

-- O nome anterior declarava a FUNCAO e a restricao sempre conferiu o TAMANHO.
-- Enquanto as duas coincidiram, a mentira era invisivel; com HMAC no lugar do
-- SHA-256 ela passaria a apontar para o algoritmo errado em todo `\d pet_tags`.
COMMENT ON CONSTRAINT pet_tags_code_hash_32_bytes ON pet_tags IS
  'Confere TAMANHO, nunca funcao: 32 bytes valem para SHA-256 e para HMAC-SHA-256. O nome antigo dizia sha256 e passou a mentir na Emenda 1 do ADR-0004.';

COMMENT ON COLUMN pet_tags.code_hash IS
  'INDICE CEGO: HMAC-SHA-256 do codigo normalizado com TAG_CODE_INDEX_KEY, que vive FORA do banco. A resolucao publica busca por ele, e so por ele. Sem a chave, um dump nao entrega codigo nenhum (ADR-0004, Emenda 1).';

-- Down Migration

-- O `down` desfaz o que ele pode desfazer: o NOME e o COMENTARIO. Ele nao
-- ressuscita linha apagada, e nao ha como -- o codigo dela ja nao existia antes
-- desta migracao rodar. Voltar para SHA-256 exige reprocessar a base pela
-- aplicacao, que e a mesma operacao descrita para rotacionar a chave.
--
-- Com a excecao das tags citadas, a descida passou a ser reversivel NO CASO QUE
-- IMPORTA: a linha que um achado cita continua no banco depois da subida, entao
-- nao ha o que ressuscitar. Antes havia, e o `down` mentia por omissao.
-- A linha da trilha sai na descida, e esta e a unica excecao ao "trilha
-- imutavel": ela nao documenta ato de ninguem, e sim uma consequencia DESTA
-- migracao. Descer a migracao e desfazer a consequencia; deixar o registro de
-- pe faria a trilha afirmar um 404 que voltou a ser 410.
DELETE FROM audit.events
 WHERE actor_kind = 'system'
   AND action = 'tag_code_hash_nao_migrado_para_hmac'
   AND metadata ->> 'migracao' = '20260921000001_indice-cego-do-codigo-da-tag';

COMMENT ON COLUMN pet_tags.code_hash IS
  'SHA-256 do codigo normalizado. A resolucao publica busca por ele, e so por ele.';

COMMENT ON CONSTRAINT pet_tags_code_hash_32_bytes ON pet_tags IS NULL;

ALTER TABLE pet_tags
  RENAME CONSTRAINT pet_tags_code_hash_32_bytes TO pet_tags_code_hash_sha256;
