-- A autoria do encontro da `Rede`, gravavel sem o nome da coluna em `src/`
-- (ADR-0025 emenda 3; ADR-0027 item 20.2).
--
-- POR QUE ESTA MIGRACAO EXISTE, E POR QUE ELA E UMA FUNCAO E NAO UMA COLUNA:
--
-- As duas colunas de autoria do encontro (`created_by_user_id`, da 20260928000001,
-- e `created_by_admin_id`, da 20260928000005) levam no `COMMENT ON COLUMN` a
-- marca `NUNCA sai do servidor`, e `src/tools/portao-colunas-que-nao-saem.ts`
-- varre `src/` atras do NOME delas e REPROVA qualquer arquivo que o cite --
-- inclusive um `INSERT`. O portao e uma varredura de nome literal: ele nao sabe
-- distinguir escrever de projetar.
--
-- O resultado medido disso foi um furo: `created_by_admin_id` existe desde
-- 28/09 e NUNCA foi gravada, porque o unico caminho ate ela passaria pelo nome
-- proibido. A autoria vivia so em `audit.events`, e a coluna ficava nula com um
-- `CHECK` guardando uma regra sobre um valor que ninguem escrevia.
--
-- Esta funcao fecha o furo sem dispensar o portao e sem apelido: o nome da
-- coluna fica onde ele ja mora -- na migracao --, `src/` chama a funcao pelo
-- nome dela, e o portao continua reprovando quem citar a coluna em `src/`.
--
-- A funcao e `SECURITY INVOKER` (o padrao) de proposito: quem a chama escreve
-- com o proprio papel, e ela nao vira caminho de escrita privilegiado.
-- `STRICT` nao serve aqui: os dois autores sao opcionais, e um nulo precisa
-- virar "nao mexe nesta coluna", nao "nao faz nada".

-- Up Migration

CREATE FUNCTION network_events_gravar_autoria(
  p_event_id uuid,
  p_autor_da_comunidade uuid,
  p_autor_do_painel uuid
) RETURNS void AS $$
BEGIN
  UPDATE network_events
     SET created_by_user_id  = COALESCE(p_autor_da_comunidade, created_by_user_id),
         created_by_admin_id = COALESCE(p_autor_do_painel, created_by_admin_id)
   WHERE id = p_event_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION
      'encontro % nao existe: a autoria e gravada na mesma transacao do INSERT, e sem a linha nao ha o que carimbar',
      p_event_id
      USING ERRCODE = 'foreign_key_violation';
  END IF;
END;
$$ LANGUAGE plpgsql;

COMMENT ON FUNCTION network_events_gravar_autoria(uuid, uuid, uuid) IS
  'Carimba quem criou o encontro, na mesma transacao do INSERT. Existe porque o nome das duas colunas de autoria e reprovado em src/ pelo portao de colunas que nao saem: aqui o nome fica na migracao, que e onde ele ja mora. Os dois CHECK da 20260928000005 continuam amarrando cada autor a sua origem.';

-- A leitura do teto, pela mesma razao: contar os encontros EM REVISAO de uma
-- conta exige a coluna de autoria na clausula `WHERE`, e o nome dela nao pode
-- aparecer em `src/`. `STABLE` porque ela so le.
--
-- O indice parcial e o conjunto que ela percorre: a fila de revisao e pequena
-- por construcao (o teto e 3 por conta), e sem ele a contagem varreria a
-- tabela inteira a cada proposta.

CREATE INDEX network_events_em_revisao_por_autor
  ON network_events (created_by_user_id)
  WHERE publication_status = 'pending_review';

CREATE FUNCTION network_events_em_revisao_do_autor(p_autor uuid)
RETURNS integer AS $$
  SELECT count(*)::integer
    FROM network_events
   WHERE created_by_user_id = p_autor
     AND publication_status = 'pending_review';
$$ LANGUAGE sql STABLE;

COMMENT ON FUNCTION network_events_em_revisao_do_autor(uuid) IS
  'Quantos encontros desta conta esperam revisao agora (ADR-0025 emenda 3, teto de 3). Existe pelo mesmo motivo de network_events_gravar_autoria: o nome da coluna de autoria e reprovado em src/ pelo portao de colunas que nao saem, e a contagem precisa dela na clausula WHERE.';

-- Down Migration

DROP FUNCTION network_events_em_revisao_do_autor(uuid);

DROP INDEX network_events_em_revisao_por_autor;

DROP FUNCTION network_events_gravar_autoria(uuid, uuid, uuid);
