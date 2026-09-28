-- A quarta ocorrencia da classe de 22/09, e a ultima viva:
-- `found_reports.tag_id` era `ON DELETE SET NULL` sobre uma coluna que
-- `found_reports_scan_tem_tag_e_pet` torna obrigatoria quando
-- `origin = 'tag_scan'`.
--
-- Medido na pilha efemera, nao deduzido:
--   DELETE FROM pet_tags de uma tag com aviso de leitura de QR
--     => 23514 / new row for relation "found_reports" violates check
--        constraint "found_reports_scan_tem_tag_e_pet"
--
-- ===========================================================================
-- A PERGUNTA QUE DECIDE A FORMA, E ELA NAO E DE SQL
-- ===========================================================================
-- Um achado por escaneamento e a prova de que alguem encontrou o animal e leu
-- a plaquinha. Se a plaquinha some depois, o achado deixa de ser verdade?
--
-- Nao. O escaneamento aconteceu num instante, sobre uma plaquinha que existia
-- naquele instante. Apagar a linha da tag depois e um ato do presente, e ato
-- do presente nao desfaz evento do passado. O aviso e registro historico, nao
-- projecao do estado de hoje -- e ele ainda carrega a conversa mediada com o
-- tutor (`finder_token_hash` e a validade dela), que e por onde o achador e o
-- tutor combinam a devolucao. Apagar o aviso junto com a tag seria desligar na
-- cara de quem esta com o animal no colo.
--
-- Isso elimina CASCADE.
--
-- ===========================================================================
-- POR QUE NAO AFROUXAR O CHECK
-- ===========================================================================
-- O caminho barato seria tirar `tag_id IS NOT NULL` do CHECK e deixar o
-- `SET NULL` de pe. O CHECK, porem, guarda DUAS coisas que so parecem uma:
--
--   `pet_id`  e como se alcanca o tutor (`pets.owner_user_id`). Ele e CASCADE,
--             entao nenhuma chave estrangeira jamais o poe nulo: a linha morre
--             junto com o pet. Essa metade nunca esteve em contradicao.
--   `tag_id`  e QUAL plaquinha foi lida. E procedencia, nao alcance.
--
-- Afrouxar resolveria o caso raro (a tag some depois) abrindo um buraco no
-- caso comum (a linha nasce): um servico com defeito passaria a gravar
-- `origin = 'tag_scan'` sem tag nenhuma, e nada acusaria. Trocar uma
-- contradicao que REPROVA por um silencio que ACEITA e piorar o banco com
-- aparencia de conserto. A invariante de nascimento e real; quem precisa mudar
-- e a chave estrangeira, que prometia um nulo que o banco nunca poderia
-- aceitar.
--
-- ===========================================================================
-- RESTRICT, E POR QUE ISSO NAO E ENGESSAR
-- ===========================================================================
-- O `SET NULL` era declaracao morta ao nascer: ele anunciava um caminho
-- ("quando a tag sair, anule o ponteiro") que o proprio banco recusa executar.
-- Quem lia o esquema acreditava num caminho que nao existe.
--
-- `RESTRICT` escreve a verdade: nao se apaga uma tag que um achado cita. Os
-- caminhos que apagam tag de verdade foram medidos, um a um, e nenhum deles
-- passa a travar:
--
--   apagar o PET    => CONCLUI. A cascata de `pets` leva a tag E o aviso.
--   apagar a CONTA  => CONCLUI. Mesmo caminho, um nivel acima.
--   apagar a TAG    => 23503, nomeando `found_reports_tag_id_fkey`.
--
-- Medido tambem com a ordem dos gatilhos de cascata de `pets` invertida (a FK
-- de `pet_tags` recriada para receber OID maior que a de `found_reports`): os
-- dois primeiros continuam concluindo. Isto importa porque ja existe no banco
-- um caminho que so funciona pela ordem de criacao dos gatilhos, e a ultima
-- coisa que esta migracao poderia fazer era acrescentar o quarto.
--
-- O unico caminho que `RESTRICT` trava e o `DELETE` avulso de tag -- limpeza
-- de tag de teste, correcao manual, rotina de retencao. Travar esse e o ponto:
-- ele destruiria em silencio a procedencia de um resgate real. E a tag ja nao
-- se apaga em uso normal, porque a revogacao do produto e por status
-- (`pet_tags.status = 'revoked'`, ADR-0004) e nao por exclusao de linha.
--
-- O ganho liquido: o erro deixa de aparecer na hora errada com o nome errado
-- (23514 acusando um CHECK, no meio de um caminho de exclusao) e passa a
-- aparecer na hora certa com o nome certo (23503 acusando a chave estrangeira,
-- que diz exatamente o que esta no caminho).

-- Up Migration

ALTER TABLE found_reports
  DROP CONSTRAINT found_reports_tag_id_fkey;

ALTER TABLE found_reports
  ADD CONSTRAINT found_reports_tag_id_fkey
  FOREIGN KEY (tag_id) REFERENCES pet_tags (id) ON DELETE RESTRICT;

COMMENT ON COLUMN found_reports.tag_id IS
  'Qual plaquinha foi lida. RESTRICT e nao SET NULL: found_reports_scan_tem_tag_e_pet exige esta coluna quando origin = tag_scan, entao o nulo que o SET NULL mandava por era recusado com 23514. A tag sai junto com o pet, pela cascata; sozinha, nao sai enquanto um achado a citar.';

-- Down Migration

-- Volta ao estado anterior, com a contradicao junto: e o que `down` significa.
-- Depois desta descida, `DELETE FROM pet_tags` de uma tag com aviso de leitura
-- de QR volta a reprovar com 23514.
ALTER TABLE found_reports
  DROP CONSTRAINT found_reports_tag_id_fkey;

ALTER TABLE found_reports
  ADD CONSTRAINT found_reports_tag_id_fkey
  FOREIGN KEY (tag_id) REFERENCES pet_tags (id) ON DELETE SET NULL;

COMMENT ON COLUMN found_reports.tag_id IS NULL;
