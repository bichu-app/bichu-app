-- A conta nova nao nasce com a sessao ja revogada.
--
-- `users.sessions_invalid_before` nascia com `now()`, de precisao de
-- microssegundo. O `iat` do JWT tem precisao de SEGUNDO, e a regra do SEC-006
-- (`tokenFoiRevogado`) arredonda a revogacao para cima de proposito, para que um
-- token emitido no mesmo segundo de uma revogacao caia do lado revogado -- essa
-- parte esta certa e continua.
--
-- O erro era tratar "conta criada" como se fosse "sessao revogada". Com os dois
-- juntos, a conta nascia com uma barreira que varria o proprio token que o
-- cadastro acabara de emitir:
--
--   conta criada em          1789734320,734 s
--   sessions_invalid_before  1789734320734 ms -> arredondado 1789734321000
--   iat do token emitido     1789734320   s   -> comparado   1789734320000
--   1789734320000 < 1789734321000 -> REVOGADO
--
-- Resultado medido em 18/09, com a pilha de pe: `POST /v1/auth/register`
-- devolvia um `access_token` que respondia 401 em TODA rota autenticada. Nao era
-- intermitente. Era a primeira tela do produto entregando uma sessao morta.
--
-- A aplicacao ja grava o valor truncado (`barreiraDeContaNova`, em
-- `modules/identity/domain/session.ts`) e nunca depende deste DEFAULT. Ele muda
-- aqui assim mesmo, porque padrao que reintroduz o defeito e uma armadilha
-- armada esperando o primeiro caminho de insercao que esquecer a coluna.
--
-- A garantia original nao se perde: nao existe token anterior ao segundo da
-- criacao, porque antes daquele segundo a conta nao existia.

-- Up Migration

ALTER TABLE users
  ALTER COLUMN sessions_invalid_before SET DEFAULT date_trunc('second', now());

COMMENT ON COLUMN users.sessions_invalid_before IS
  'Barreira do SEC-006. Revogacao de verdade guarda precisao cheia; a conta NOVA nasce truncada ao segundo, senao o token do proprio cadastro nasce revogado.';

-- Down Migration

ALTER TABLE users
  ALTER COLUMN sessions_invalid_before SET DEFAULT now();
