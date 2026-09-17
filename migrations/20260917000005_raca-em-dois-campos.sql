-- BICHUS-90 — `ref_breeds` ganha os codigos `outro_*` e a marca de quem aceita
-- texto livre.
--
-- A contradicao que esta migracao fecha: o cruzamento de perdido e achado le
-- `breed_code`, e por isso o codigo precisa vir de lista fechada. Com 29 racas,
-- quem tem um Akita era obrigado a marcar SRD — o que polui o cruzamento mais
-- do que o texto livre poluiria, porque passa a existir um SRD que nao e SRD.
--
-- A saida sao dois campos com duas funcoes (`api/openapi.yaml`, `PetInput`):
-- `breed_code` COMPARA e `breed_free_text` DESCREVE. Para o segundo existir sem
-- contaminar o primeiro, a lista precisa de um codigo que signifique "nao esta
-- aqui" — um por especie, porque o codigo tambem carrega a especie.
--
-- `accepts_free_text` marca esses codigos NO DADO, e nao numa lista repetida em
-- cada lugar que valida. Ele nao entra na resposta de
-- `GET /v1/public/reference-data`: o contrato declara `code`, `label` e
-- `species` nos itens de `breeds`, e campo a mais numa resposta nao quebra
-- cliente nenhum, o que e exatamente por que ele passa despercebido.
--
-- A UNIQUE de `(code, species_code)` existe para a chave estrangeira composta
-- de `pets`: e ela que torna "Siames num cachorro" um estado que o banco
-- recusa, em vez de uma regra que alguem precisa lembrar de aplicar.

-- Up Migration

ALTER TABLE ref_breeds
  ADD COLUMN accepts_free_text boolean NOT NULL DEFAULT false;

COMMENT ON COLUMN ref_breeds.accepts_free_text IS
  'BICHUS-90: unicos codigos com que `breed_free_text` e aceito. Descreve, nunca cruza.';

ALTER TABLE ref_breeds
  ADD CONSTRAINT ref_breeds_code_especie_unico UNIQUE (code, species_code);

-- `sort_order` 99 poe as tres no fim da lista de cada especie, que e onde
-- "outra" pertence: lista que abre com a saida de emergencia ensina a usa-la.
INSERT INTO ref_breeds (code, label, species_code, sort_order, accepts_free_text) VALUES
  ('outro_dog',   'Outra raça (digite qual)', 'dog',   99, true),
  ('outro_cat',   'Outra raça (digite qual)', 'cat',   99, true),
  ('outro_other', 'Outro (digite qual)',      'other', 99, true);

-- A lista mudou, entao a versao muda. Sem isso o cliente com a copia de ontem
-- em cache nunca veria os codigos novos, e continuaria empurrando Akita para
-- SRD — que e o defeito que esta migracao existe para corrigir.
--
-- O UPDATE vem antes do INSERT por causa do indice parcial
-- `ref_data_versions_uma_corrente`: duas correntes e um estado que o banco
-- recusa, e recusa no meio da migracao.
UPDATE ref_data_versions SET is_current = false WHERE is_current;
INSERT INTO ref_data_versions (version, is_current) VALUES ('2026-09-17.2', true);

-- Down Migration

-- Ordem inversa, e pelo mesmo motivo: a versao nova sai antes de a anterior
-- voltar a ser corrente.
DELETE FROM ref_data_versions WHERE version = '2026-09-17.2';
UPDATE ref_data_versions SET is_current = true WHERE version = '2026-09-17.1';

-- Se algum pet ja apontar para um destes codigos, a FK recusa o DELETE e o
-- downgrade para aqui com a mensagem do banco. Isso e o desfecho certo: apagar
-- o codigo reescreveria a raca de um animal cadastrado, e o criterio 5 da
-- historia diz que registro ja gravado nao e reescrito quando a lista muda.
DELETE FROM ref_breeds WHERE code IN ('outro_dog', 'outro_cat', 'outro_other');

ALTER TABLE ref_breeds DROP CONSTRAINT IF EXISTS ref_breeds_code_especie_unico;
ALTER TABLE ref_breeds DROP COLUMN IF EXISTS accepts_free_text;
