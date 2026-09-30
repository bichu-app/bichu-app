-- SEC-019, segunda camada: o aparelho sai do cadastro de push no instante da
-- exclusao LOGICA da conta, e nao 30 dias depois no expurgo.
--
-- A PRIMEIRA camada e de aplicacao e esta em `derrubarTodasAsSessoes`, por onde
-- `excluirMinhaConta` ja passa. Esta migracao nao a substitui: ela existe pelo
-- precedente que este repositorio ja escolheu para o mesmo problema, em
-- `20260922000006_localizacao-nao-sobrevive-a-exclusao-logica.sql`, e pela mesma
-- razao. `users.deleted_at` deixa de ser nulo por mais de um caminho, e um
-- caminho novo que marque a conta sem passar pela aplicacao deixaria trinta dias
-- de alerta de pet perdido chegando no aparelho de uma conta que a pessoa ja
-- mandou apagar.
--
-- O QUE ESTA MIGRACAO NAO FAZ: ela nao cobre "sair de todos os aparelhos", nem a
-- troca de senha, nem o "nao fui eu". Nenhum dos tres marca `deleted_at`, e
-- nenhum deles deve marcar. Quem cobre esses tres e a aplicacao, e quem prova
-- sao os casos de `sair-de-todos-os-aparelhos.test.ts` e de
-- `tests/integration/sair-de-todos-pelo-http.test.ts`. Ler este gatilho como a
-- correcao do SEC-019 seria ler a camada errada.
--
-- `UPDATE OF deleted_at` porque uma coluna so muda se for atribuida, entao a
-- lista de colunas nao perde nenhum caso e poupa o gatilho de ser considerado em
-- todo `UPDATE` de `users` (login, perfil). A clausula `WHEN` fecha os dois
-- restantes: `deleted_at` atribuido com o mesmo valor que ja tinha, e a reversao
-- (`NOT NULL` -> `NULL`), que nao deve ressuscitar endereco de entrega nenhum.
--
-- Nao ha trilha aqui, e a ausencia e deliberada: `device.revoked` nasce na
-- aplicacao, onde ha ator e correlacao de requisicao, e um gatilho que gravasse
-- o mesmo fato daria duas contagens do mesmo ato para quem le a trilha depois.
-- O evento do gesto e `privacy.account_deletion_requested`, que a aplicacao ja
-- grava.

-- Up Migration

CREATE FUNCTION apagar_aparelhos_na_exclusao_logica() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
  DELETE FROM user_devices WHERE user_id = NEW.id;
  RETURN NULL;  -- AFTER ... FOR EACH ROW ignora o retorno.
END;
$$;

COMMENT ON FUNCTION apagar_aparelhos_na_exclusao_logica() IS
  'SEC-019: apaga o cadastro de aparelho e token de push no instante da exclusao LOGICA da conta. Sem isto a linha sobrevive ate o expurgo de 30 dias com push_token e push_permission = granted intactos, e o aparelho continua sendo destinatario valido de alerta de pet perdido -- com nome do animal e regiao -- numa conta que a pessoa ja mandou apagar. Segunda camada: a primeira e derrubarTodasAsSessoes, na aplicacao.';

CREATE TRIGGER users_exclusao_logica_apaga_aparelhos
  AFTER UPDATE OF deleted_at ON users
  FOR EACH ROW
  WHEN (OLD.deleted_at IS NULL AND NEW.deleted_at IS NOT NULL)
  EXECUTE FUNCTION apagar_aparelhos_na_exclusao_logica();

-- Down Migration

DROP TRIGGER IF EXISTS users_exclusao_logica_apaga_aparelhos ON users;
DROP FUNCTION IF EXISTS apagar_aparelhos_na_exclusao_logica();
