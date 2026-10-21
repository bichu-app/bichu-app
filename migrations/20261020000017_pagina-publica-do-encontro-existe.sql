-- A TERCEIRA PAGINA PUBLICA DO SITE ENTRA NO INTERRUPTOR: a do ENCONTRO.
--
-- ====================================================================
-- O QUE O CLIENTE DECIDIU, E EM QUE DIA
-- ====================================================================
--
-- Em 21/10/2026, escolhendo entre as opcoes que estavam na mesa, literal:
--
--   "Criar a pagina do encontro -- mesma forma do pet perdido: pagina publica
--    no site + campo de link no contrato + um interruptor que ACENDE o link sem
--    precisar de APK novo."
--
-- As tres partes da frase sao tres arquivos diferentes, e **esta migracao e a
-- terceira**: a pagina mora em `web/src/pages/encontro/[slug].astro`, o campo e
-- `NetworkEventPublic.share_url` em `api/openapi.yaml`, e o interruptor e a
-- linha `network_event` que nasce aqui.
--
-- ====================================================================
-- POR QUE ISTO E `ALTER` E NAO `CREATE` -- e por que nao e tabela nova
-- ====================================================================
--
-- `site_page_availability` ja existe (migracao `20261020000010`) e ja resolve
-- exatamente este problema para o pet perdido. O que ela nao tem e a terceira
-- chave: a coluna `page` nasceu com o dominio FECHADO em
-- `('lost_case', 'poster')`, de proposito -- o cabecalho daquela migracao diz
-- que o `CHECK` existe porque "a mao humana escreve aqui", e que `'lost-case'`,
-- `'p'` e `'LOST_CASE'` precisam ser recusados no `UPDATE`.
--
-- Entao a unica coisa que falta e **ampliar aquele dominio**. Isto e alterar
-- restricao, e nao acrescentar tabela: o ADR-0011 secao 5.5 nao barra, e uma
-- segunda tabela de interruptor seria a segunda definicao do mesmo conceito --
-- e a segunda definicao e a que diverge, como este repositorio ja escreveu em
-- `projecao-publica-do-caso.ts`.
--
-- ====================================================================
-- ELA RODA SOBRE DADO PREEXISTENTE, E E O PRIMEIRO INTERRUPTOR QUE RODA ASSIM
-- ====================================================================
--
-- A `20261020000010` pode afirmar, no fim do cabecalho dela, que "so CRIA" e
-- que "nao ha dado preexistente sobre o que provar `BEGIN`/`ROLLBACK`". **Aqui
-- essa frase nao vale**, e e a diferenca que mais importa nesta migracao:
--
--   1. as DUAS linhas de `20261020000010` ja estao no banco de homologacao e no
--      de producao, e uma delas pode ja estar com `is_published = true` no dia
--      em que isto rodar (a pagina do caso pode subir antes desta);
--   2. a restricao que sai e a MESMA que valida aquelas duas linhas.
--
-- Por isso a ordem abaixo e deliberada, e inverter qualquer um dos dois passos
-- reprova em banco com dado:
--
--   SUBIDA: amplia o `CHECK` **antes** de inserir. Inserir primeiro estouraria
--           na restricao antiga, que e exatamente o que ela existe para fazer.
--   DESCIDA: apaga a linha **antes** de estreitar o `CHECK`. Estreitar primeiro
--           estouraria, porque a linha `network_event` seria dado que a
--           restricao nova proibe -- e `ALTER TABLE ... ADD CONSTRAINT` valida
--           as linhas que ja estao la, nao so as proximas.
--
-- `DROP CONSTRAINT IF EXISTS` nas duas pontas, pelo motivo que a
-- `20260922000013` registra: idempotencia pelo ESTADO, e nao por tratamento de
-- erro. Um terceiro estado plausivel -- alguem ja ampliou a mao, de madrugada,
-- para acender a pagina -- nao pode transformar a migracao em reprovacao, que e
-- o que vira `--force` na vez seguinte.
--
-- ====================================================================
-- A LINHA NASCE DESLIGADA, E A ASSIMETRIA DA TABELA IRMA VALE INTEIRA
-- ====================================================================
--
-- `is_published = false` por `DEFAULT`, porque hoje **e** falso: medido em
-- 21/10/2026, de fora, com controle positivo (`/comunidade` responde 200 nos
-- dois ambientes):
--
--   GET https://bichu.app/encontro/<slug>      -> 404
--   GET https://hml.bichu.app/encontro/<slug>  -> 404
--
-- E a assimetria de `site_page_availability` continua: **linha ausente,
-- `is_published` falso ou tabela inalcancavel ESCONDEM** (ver o cabecalho da
-- `20261020000010` e a porta `ports/disponibilidade-da-pagina.ts`). Aqui o erro
-- caro e o mesmo do caso: `share_url` sai no detalhe do encontro, o aplicativo
-- o costura na mensagem de compartilhar, e aquela mensagem **sai do nosso
-- dominio no instante do envio** -- nenhum `UPDATE` a apaga do celular de
-- quarenta vizinhos de um grupo de bairro.
--
-- COMO SE ACENDE, no dia em que a pagina do encontro for ao ar (API de pe, sem
-- reinicio, sem APK):
--
--   UPDATE site_page_availability
--      SET is_published = true, updated_by = 'quem publicou'
--    WHERE page = 'network_event';
--
-- COMO SE APAGA DE VOLTA, se a pagina sair do ar ou voltar quebrada:
--
--   UPDATE site_page_availability SET is_published = false WHERE page = 'network_event';
--
-- ====================================================================
-- UMA LINHA, E NAO DUAS
-- ====================================================================
--
-- O caso do pet precisou de duas (`lost_case` e `poster`) porque sao duas
-- paginas do site, e `poster_url` termina em papel colado em poste. O encontro
-- tem **uma** pagina: nao ha cartaz de encontro, nao ha nada impresso, e o
-- unico endereco que o contrato passa a emitir e `share_url`. Uma segunda linha
-- aqui seria um interruptor sem nada atras dele.
--
-- ====================================================================
-- O QUE ESTA MIGRACAO NAO FAZ
-- ====================================================================
--
-- **Nao cria coluna de token.** O endereco publico do encontro e o `slug`, que
-- o contrato ja declara como "o endereco publico do encontro. UUID nao sai
-- nesta secao" em `getNetworkEvent`, operacao que ja e alcancavel sem conta. Um
-- token novo seria um SEGUNDO endereco publico para o mesmo recurso, com ganho
-- nenhum de privacidade -- a rota por `slug` ja esta aberta -- e com uma coluna
-- a mais para manter.
--
-- **Nao toca `network_events`.** Nenhuma coluna de encontro entra, sai ou muda
-- de tipo. Em particular **nao mexe em `street_address`**, que continua saindo
-- so em `getNetworkEventLocation`, com conta (ADR-0027 item 21.2).

-- Up Migration

-- 1. O dominio ampliado. A restricao antiga sai por nome, e a nova entra com o
--    mesmo nome: quem for ler `\d site_page_availability` amanha encontra uma
--    restricao, e nao duas com nomes parecidos.
ALTER TABLE site_page_availability
  DROP CONSTRAINT IF EXISTS site_page_availability_page_check;

ALTER TABLE site_page_availability
  ADD CONSTRAINT site_page_availability_page_check
  CHECK (page IN ('lost_case', 'poster', 'network_event'));

-- 2. A linha, DESLIGADA. Sem `ON CONFLICT DO NOTHING`, pelo mesmo motivo da
--    `20261020000010`: conflito aqui seria sinal de que esta migracao rodou
--    duas vezes, e isso precisa estourar, nao ser engolido.
INSERT INTO site_page_availability (page, updated_by)
VALUES ('network_event', 'migracao 20261020000017');

COMMENT ON TABLE site_page_availability IS
  'Quais paginas publicas do site existem de verdade. ACENDER a pagina do encontro: UPDATE site_page_availability SET is_published = true WHERE page = ''network_event''; (e ''lost_case'' para a do caso). Linha ausente, false ou tabela inalcancavel ESCONDEM o endereco -- o contrario de app_version_policy, e de proposito: link morto num grupo de bairro nao se desfaz.';

-- Down Migration

-- A ordem e inversa a da subida, e a inversao e o ponto: a linha sai ANTES de a
-- restricao estreitar, senao `ADD CONSTRAINT` reprova sobre a propria linha que
-- esta migracao inseriu.
DELETE FROM site_page_availability WHERE page = 'network_event';

ALTER TABLE site_page_availability
  DROP CONSTRAINT IF EXISTS site_page_availability_page_check;

ALTER TABLE site_page_availability
  ADD CONSTRAINT site_page_availability_page_check
  CHECK (page IN ('lost_case', 'poster'));

COMMENT ON TABLE site_page_availability IS
  'Quais paginas publicas do site existem de verdade. ACENDER a acao de compartilhar: UPDATE site_page_availability SET is_published = true WHERE page = ''lost_case''; Linha ausente, false ou tabela inalcancavel ESCONDEM a acao -- o contrario de app_version_policy, e de proposito: link morto num grupo de bairro nao se desfaz.';
