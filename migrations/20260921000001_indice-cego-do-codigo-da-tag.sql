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

  -- Revogada nao se recalcula: a revogacao apagou o cifrado. Apagar e a unica
  -- saida, e ela e barata HOJE porque a unica linha e um artefato de teste.
  DELETE FROM pet_tags WHERE status = 'revoked';
  GET DIAGNOSTICS revogadas = ROW_COUNT;
  RAISE NOTICE 'pet_tags: % linha(s) revogada(s) apagada(s); o codigo delas nao era recuperavel (ADR-0004 12.2).', revogadas;
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
-- ressuscita a linha apagada, e nao ha como -- o codigo dela ja nao existia
-- antes desta migracao rodar. Voltar para SHA-256 exige reprocessar a base pela
-- aplicacao, que e a mesma operacao descrita para rotacionar a chave.
COMMENT ON COLUMN pet_tags.code_hash IS
  'SHA-256 do codigo normalizado. A resolucao publica busca por ele, e so por ele.';

COMMENT ON CONSTRAINT pet_tags_code_hash_32_bytes ON pet_tags IS NULL;

ALTER TABLE pet_tags
  RENAME CONSTRAINT pet_tags_code_hash_32_bytes TO pet_tags_code_hash_sha256;
