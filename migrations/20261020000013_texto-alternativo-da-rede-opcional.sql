-- O TEXTO ALTERNATIVO DA REDE FICA OPCIONAL -- E ISTO REVERTE UMA DECISAO DE
-- 17/10/2026, POR DECISAO DO CLIENTE DE 21/10/2026.
--
-- ## A REVERSAO, dita primeiro, porque e o que esta migracao principalmente e
--
-- A migracao `20261017000002` afrouxou `store_item_images.alt_text` e DEIXOU
-- `network_event_images.alt_text` como `NOT NULL`, de proposito e com a razao
-- escrita nela, verbatim:
--
--     "So a `Loja`. `network_event_images.alt_text` continua `NOT NULL`: o
--      pedido do cliente foi sobre a foto do produto, e afrouxar a `Rede` de
--      carona deixaria a capa do encontro sem nome acessivel sem ninguem ter
--      pedido."
--
-- **Agora alguem pediu.** O cliente decidiu em 21/10/2026, e disse duas vezes,
-- verbatim nas duas:
--
--     "pode remover a descricao da imagem"
--     "pode remover a descricao da imagem"
--
-- ## O QUE ELE SABIA QUANDO DECIDIU, e foi dito a ele DUAS VEZES
--
-- Decisao revertida precisa de rastro, e rastro inclui o custo. O cliente foi
-- informado duas vezes de que:
--
-- 1. **O campo alimenta o leitor de tela.** Ele e o unico texto que uma pessoa
--    cega recebe no lugar da foto.
-- 2. **A CAPA DO ENCONTRO PERDE O NOME ACESSIVEL.** E este o custo concreto, e
--    ele e maior na `Rede` do que era na `Loja`: na capa do encontro a imagem E
--    o conteudo, e nao ha texto ao lado para anunciar. Era exatamente a frase
--    com que a `20261017000002` justificou NAO afrouxar aqui.
--
-- Ele reafirmou depois de ouvir isso. A decisao e dele, o registro e meu, e
-- este cabecalho existe para que ninguem precise descobrir em seis meses por
-- que a `...017000002` diz uma coisa e o esquema diz outra.
--
-- ## O QUE ESTA MIGRACAO FAZ: uma linha de esquema, e so
--
-- Sai o `NOT NULL` de `network_event_images.alt_text`.
--
-- **O `CHECK` DE TAMANHO FICA COMO ESTA, e isso e deliberado e nao esquecimento:**
-- em Postgres um `CHECK` cujo resultado e NULL conta como SATISFEITO, entao
-- `char_length(btrim(alt_text)) BETWEEN 2 AND 150` continua recusando `"a"` e
-- passa a aceitar a ausencia, sem uma linha de reescrita. Esta e a MESMA leitura
-- que a `20261017000002` usou para a `Loja`, e e o precedente que estou seguindo
-- de proposito, e nao por economia.
--
-- Reescrever o `CHECK` custaria de graca: ele mudaria a definicao que
-- `tests/integration/conjunto-exato-dos-checks.test.ts` poderia fixar, e nao ha
-- nada a ganhar em troca.
--
-- ## O QUE ELA NAO FAZ, E CADA AUSENCIA E DELIBERADA
--
-- - **Nao apaga a coluna.** `alt_text` continua existindo, gravavel e projetado.
--   O que mudou e QUANDO ele e cobrado -- nunca mais. Quem quiser escrever
--   descricao continua podendo, e o app continua lendo.
-- - **Nao mexe em `store_item_images`**, ja opcional desde 17/10.
-- - **Nao mexe em `user_publications.alt_text`**, que ja era opcional e tem o
--   gatilho `user_publications_texto_sai_com_a_imagem` (`20261020000007`)
--   cuidando dele. Nada aqui o toca: `network_event_images` nao tem `CHECK` que
--   case `alt_text` com outra coluna, entao nao ha o impasse de ordem de
--   avaliacao que aquela migracao resolveu.
-- - **Nao toca `position` nem a unicidade da ordem.** A capa continua sendo
--   `position = 0`.
--
-- ## SOBRE DADO QUE JA EXISTE
--
-- Afrouxar `NOT NULL` nao pode falhar por dado: toda linha que existe hoje tem
-- `alt_text` preenchido, justamente porque a coluna era `NOT NULL`. Nenhuma
-- linha muda, nenhuma descricao ja escrita e apagada.
--
-- ## SOBRE O `down`
--
-- Devolve o `NOT NULL`. As imagens que a escrita nova gravar sem texto nao
-- cabem no esquema antigo, e por isso o `down` as PREENCHE em vez de apagar a
-- linha -- perder a FOTO do encontro por causa da ausencia de um rotulo seria
-- pior que a ausencia do rotulo. A reserva e o TITULO DO ENCONTRO, que e a mesma
-- reserva que a `20261017000002` usou na `Loja` (lá, o titulo do item) e a mesma
-- que o app usa quando o texto nao vem.
--
-- O titulo pode ser mais curto que 2 ou mais longo que 150, e o `CHECK` de
-- tamanho continua valendo no `down`: por isso ele e CORTADO em 150 e, no caso
-- em que o aparo deixaria menos de 2 caracteres, cai para um rotulo generico.
-- Sem esses dois cuidados o `down` reprovaria com 23514 em vez de concluir.

-- Up Migration

ALTER TABLE network_event_images
  ALTER COLUMN alt_text DROP NOT NULL;

COMMENT ON COLUMN network_event_images.alt_text IS
  'Texto alternativo da imagem do encontro, OPCIONAL desde 21/10/2026 (decisao do cliente, dita duas vezes: "pode remover a descricao da imagem"). Era NOT NULL em TODA posicao desde a 20260928000004, e a 20261017000002 o manteve assim DE PROPOSITO ao afrouxar a Loja, com a razao escrita: "afrouxar a Rede de carona deixaria a capa do encontro sem nome acessivel sem ninguem ter pedido". Em 21/10/2026 o cliente pediu, ciente -- informado duas vezes -- de que o campo alimenta o leitor de tela e de que A CAPA DO ENCONTRO PERDE O NOME ACESSIVEL. O CHECK de tamanho (network_event_images_texto_alternativo_tem_tamanho, de 2 a 150) NAO foi tocado e continua valendo quando o texto vem: em Postgres um CHECK que resulta NULL conta como satisfeito, entao ele recusa "a" e aceita a ausencia sem reescrita -- a mesma leitura que a 20261017000002 usou na Loja. Nulo faz o app cair no titulo do encontro.';

-- Down Migration

-- O titulo do encontro e a reserva, cortado em 150 porque o `CHECK` de tamanho
-- continua valendo aqui. Ver o cabecalho.
UPDATE network_event_images ni
   SET alt_text = left(btrim(e.title), 150)
  FROM network_events e
 WHERE e.id = ni.event_id
   AND ni.alt_text IS NULL
   AND char_length(btrim(e.title)) >= 2;

-- Titulo que nao chega a 2 caracteres aparados nao cabe no `CHECK`. Rotulo
-- generico em vez de linha apagada: a foto do encontro vale mais que o rotulo.
UPDATE network_event_images
   SET alt_text = 'Imagem do encontro'
 WHERE alt_text IS NULL;

ALTER TABLE network_event_images
  ALTER COLUMN alt_text SET NOT NULL;

COMMENT ON COLUMN network_event_images.alt_text IS
  'Texto alternativo, obrigatorio em TODA posicao: a obrigacao acompanha a imagem que vira capa numa reordenacao.';
