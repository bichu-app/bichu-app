-- O TEXTO ALTERNATIVO SAI COM A IMAGEM -- o conserto de uma contradicao minha.
--
-- ## O DEFEITO, e as duas declaracoes que o produziram sao as duas minhas
--
-- A migracao `20261020000002` escreveu, com razao em cada linha:
--
--     image_id uuid REFERENCES catalog_images (id) ON DELETE SET NULL
--     -- "imagem apagada deixa o TEXTO de pe"
--
--     CONSTRAINT user_publications_texto_alternativo_pede_imagem
--       CHECK (image_id IS NOT NULL OR alt_text IS NULL)
--     -- "texto alternativo sem imagem nao descreve nada"
--
-- **Separadas, as duas estao certas. Juntas, elas nao podem valer.** Publicacao
-- com foto E com `alt_text` e estado legitimo -- a propria `...002` o construiu.
-- Apagar a imagem dispara o `SET NULL`, o `alt_text` fica, e o `CHECK` recusa: o
-- `DELETE` da imagem falha com **SQLSTATE 23514**.
--
-- MEDIDO em 20/10/2026, em BEGIN/ROLLBACK, antes de uma linha deste arquivo:
--
--     DELETE FROM catalog_images WHERE id = <a da publicacao>
--     -> 23514  new row for relation "user_publications" violates check
--               constraint "user_publications_texto_alternativo_pede_imagem"
--
-- ## AS TRES CONSEQUENCIAS, e a terceira e a que assusta
--
-- 1. **A imagem fica impossivel de apagar** enquanto a publicacao viver.
-- 2. **A exclusao LOGICA nao libera a imagem.** Ela e um `UPDATE` e nao toca
--    `image_id`; medido, a linha apagada logicamente continuava com
--    `image_id IS NOT NULL` e com o `alt_text`, e o `DELETE` da imagem
--    continuava reprovando -- ou seja, a imagem ficava presa **para sempre**.
-- 3. **Quem faz a coisa certa pelo leitor de tela e quem cria a linha presa.**
--    Publicacao sem `alt_text` nao prende nada; com `alt_text`, prende. Um
--    defeito que pune a acessibilidade e pior do que um defeito simetrico.
--
-- O apagamento de CONTA ainda concluia, mas **nao por desenho**:
-- `user_publications` sai antes pela cascata de `author_user_id`. E sorte de
-- ordem, e nao garantia -- e nao e sobre ela que o expurgo de imagem depende.
--
-- ## O CONSERTO: o texto sai COM a imagem, e nao antes nem depois
--
-- As duas intencoes so se reconciliam de um jeito: `alt_text` deixa de existir
-- no mesmo instante em que a imagem que ele descreve deixa de existir. Isso nao
-- e afrouxar nenhuma das duas -- e dizer que elas sao a MESMA coisa vista de
-- dois lados.
--
-- **O `CHECK` NAO foi afrouxado, e nao podia ser:** sem ele, `alt_text` orfao
-- ficaria descrevendo nada, que e exatamente o defeito que ele existe para
-- impedir. Ele continua na tabela, intacto, e este arquivo nao o toca.
--
-- **O `SET NULL` NAO virou `CASCADE`, e a diferenca e o produto:** `CASCADE`
-- faria apagar uma imagem apagar a **publicacao inteira**, levando o texto que a
-- pessoa escreveu -- o oposto exato da razao escrita na propria linha
-- (*"imagem apagada deixa o TEXTO de pe"*). O corpo da publicacao sobrevive; o
-- que sai e so a descricao da foto que saiu.
--
-- ## GATILHO `BEFORE UPDATE`, e o precedente e desta mesma rodada
--
-- A migracao `20261019000004` resolveu um impasse **identico** com outro nome:
-- `handles.user_id` era `ON DELETE SET NULL` e `handles_pessoa_tem_dono`
-- proibia `pessoa` sem dono, e `DELETE FROM users` de quem tinha apelido
-- reprovava com o MESMO 23514. A solucao foi um gatilho `BEFORE UPDATE OF` que
-- ajusta a linha antes de o `CHECK` rodar.
--
-- A razao e a ordem de avaliacao do Postgres, e ela e o mecanismo inteiro: **a
-- acao referencial e um `UPDATE ... SET image_id = NULL`, e `CHECK` e avaliado
-- DEPOIS dos gatilhos de linha `BEFORE`.** Em `AFTER` o `CHECK` ja teria
-- reprovado, e o gatilho nunca chegaria a rodar.
--
-- ## DUAS escritas disparam, e as duas sao a mesma regra
--
-- `BEFORE UPDATE` sem `OF`, de proposito -- e esta e a unica divergencia da
-- forma do precedente, que usou `OF user_id`. Aqui ha DOIS caminhos pelos quais
-- a imagem deixa de descrever algo, e eles mexem em colunas diferentes:
--
--   (a) `image_id` vira nulo  -- a imagem foi apagada (o `SET NULL`), ou alguem
--       tirou a foto da publicacao por escrita direta;
--   (b) `deleted_at` deixa de ser nulo -- a publicacao foi apagada logicamente,
--       e e isso que LIBERA a imagem para o expurgo. Sem este caminho a
--       consequencia 2 continuaria de pe: a linha apagada ficaria segurando a
--       imagem para sempre.
--
-- `OF image_id, deleted_at` funcionaria, e eu medi os dois; ficou sem a lista
-- porque o `WHEN` abaixo ja e a conferencia exata e uma lista de colunas a mais
-- seria uma segunda definicao do mesmo recorte, que divergiria no dia em que
-- aparecesse um terceiro caminho.
--
-- **Isto NAO cria caminho de escrita novo em `src/`.** Nenhum caso de uso chama
-- nada aqui: `deleteMyPublication` continua sendo um `UPDATE` de `deleted_at`, e
-- quem apaga imagem continua sendo o expurgo. O gatilho e o passo que faltava
-- para os dois concluirem.

-- Up Migration

CREATE FUNCTION publicacao_texto_alternativo_sai_com_a_imagem() RETURNS trigger AS $$
BEGIN
  -- A IMAGEM FOI EMBORA. O rotulo que a descrevia vai com ela.
  --
  -- Nao e perda de dado da pessoa: `body` -- o texto que ela escreveu -- fica
  -- intacto. `alt_text` e a descricao de uma foto que deixou de existir.
  IF NEW.image_id IS NULL THEN
    NEW.alt_text := NULL;
    RETURN NEW;
  END IF;

  -- A PUBLICACAO FOI APAGADA LOGICAMENTE. A imagem e liberada para o expurgo.
  --
  -- Sem este ramo a imagem de uma publicacao apagada ficaria presa para sempre:
  -- a exclusao logica e um `UPDATE`, nao dispara o `ON DELETE` de nada, e a
  -- linha continuaria apontando para `catalog_images`.
  --
  -- A ordem das duas atribuicoes nao importa (sao da MESMA linha, antes de o
  -- `CHECK` rodar), mas as duas sao necessarias: so `image_id := NULL` deixaria
  -- `alt_text` orfao e o `CHECK` reprovaria o proprio apagamento.
  IF NEW.deleted_at IS NOT NULL THEN
    NEW.image_id := NULL;
    NEW.alt_text := NULL;
  END IF;

  RETURN NEW;
END
$$ LANGUAGE plpgsql;

COMMENT ON FUNCTION publicacao_texto_alternativo_sai_com_a_imagem() IS
  'Tira `alt_text` (e, na exclusao logica, tambem `image_id`) de `user_publications` ANTES de o CHECK rodar. Existe porque duas declaracoes da 20261020000002 nao podiam valer juntas: `image_id` e `ON DELETE SET NULL` ("imagem apagada deixa o TEXTO de pe") e `user_publications_texto_alternativo_pede_imagem` proibe `alt_text` sem imagem ("texto alternativo sem imagem nao descreve nada"). Apagar a imagem de uma publicacao COM alt_text reprovava com 23514, a imagem ficava impossivel de apagar, e a exclusao logica NAO a liberava -- medido em BEGIN/ROLLBACK em 20/10/2026. Pior: quem escrevia descricao de acessibilidade era quem criava a linha presa. O CHECK NAO foi afrouxado (alt_text orfao continua proibido) e o SET NULL NAO virou CASCADE (isso apagaria a publicacao inteira e levaria o texto da pessoa, o oposto da razao escrita). BEFORE e nao AFTER: a acao referencial e um UPDATE e o CHECK e avaliado DEPOIS dos gatilhos de linha BEFORE -- em AFTER o CHECK ja teria reprovado. Mesma forma e mesmo motivo de handles_orfao_vira_reservado (20261019000004). Nao cria caminho de escrita novo em src/.';

-- `BEFORE UPDATE` sem lista de colunas: o `WHEN` abaixo e a conferencia exata, e
-- uma lista de colunas seria uma segunda definicao do mesmo recorte. Ver o
-- cabecalho.
--
-- O `WHEN` fecha os dois caminhos e NADA MAIS -- editar `body`, mudar de uma
-- imagem para outra, ou reescrever `alt_text` com a imagem de pe nao disparam o
-- gatilho. A conferencia e por TRANSICAO (`OLD` -> `NEW`), e nao por estado:
-- linha que ja estava apagada e sofre outro `UPDATE` tambem nao dispara.
CREATE TRIGGER user_publications_texto_sai_com_a_imagem
  BEFORE UPDATE ON user_publications
  FOR EACH ROW
  WHEN (
    (OLD.image_id IS NOT NULL AND NEW.image_id IS NULL)
    OR (OLD.deleted_at IS NULL AND NEW.deleted_at IS NOT NULL)
  )
  EXECUTE FUNCTION publicacao_texto_alternativo_sai_com_a_imagem();

COMMENT ON COLUMN user_publications.alt_text IS
  'Rotulo para leitor de tela, OPCIONAL -- e a faixa 2-150 e a mesma de network_event_images.alt_text, onde ele e obrigatorio. A diferenca e a superficie: na capa do encontro a imagem E o conteudo e nao ha texto ao lado; aqui body e NOT NULL e ha sempre o que anunciar. Nulo faz o app anunciar um rotulo generico, e nao esconder a imagem do leitor. ELE SAI COM A IMAGEM: o gatilho user_publications_texto_sai_com_a_imagem (20261020000007) o anula ANTES do CHECK quando image_id vira nulo ou quando a publicacao e apagada logicamente -- sem isso, apagar a imagem de uma publicacao com alt_text reprovava com 23514 e a imagem ficava presa para sempre.';

COMMENT ON COLUMN user_publications.image_id IS
  'A foto, opcional e UNICA. purpose = user_publication, conferido pelo caso de uso (CHECK nao alcanca outra tabela), como a vitrine faz. UNIQUE: sem ela o mesmo envio confirmado viraria duas publicacoes. SET NULL: imagem apagada deixa o TEXTO (body) de pe -- o inverso apagaria a mensagem da pessoa por causa de um objeto no balde, e e por isso que ela NAO e CASCADE. A EXCLUSAO LOGICA DA PUBLICACAO ANULA ESTA COLUNA, pelo gatilho user_publications_texto_sai_com_a_imagem (20261020000007): sem isso a imagem de uma publicacao apagada ficava presa para sempre, porque a exclusao logica e um UPDATE e nao dispara ON DELETE de nada.';

-- Down Migration

COMMENT ON COLUMN user_publications.image_id IS
  'A foto, opcional e UNICA. purpose = user_publication, conferido pelo caso de uso (CHECK nao alcanca outra tabela), como a vitrine faz. UNIQUE: sem ela o mesmo envio confirmado viraria duas publicacoes. SET NULL: imagem apagada deixa o texto de pe -- o inverso apagaria a mensagem da pessoa por causa de um objeto no balde.';

COMMENT ON COLUMN user_publications.alt_text IS
  'Rotulo para leitor de tela, OPCIONAL -- e a faixa 2-150 e a mesma de network_event_images.alt_text, onde ele e obrigatorio. A diferenca e a superficie: na capa do encontro a imagem E o conteudo e nao ha texto ao lado; aqui body e NOT NULL e ha sempre o que anunciar. Nulo faz o app anunciar um rotulo generico, e nao esconder a imagem do leitor.';

DROP TRIGGER user_publications_texto_sai_com_a_imagem ON user_publications;
DROP FUNCTION publicacao_texto_alternativo_sai_com_a_imagem();
