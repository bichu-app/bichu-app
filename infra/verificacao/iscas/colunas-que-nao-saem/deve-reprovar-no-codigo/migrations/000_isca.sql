-- Isca. Nao e migracao do produto: este arquivo nunca roda em banco nenhum.
CREATE TABLE isca (quem_convidou uuid);
COMMENT ON COLUMN isca.quem_convidou IS
  'Vinculo entre duas pessoas: NUNCA sai do servidor.';
