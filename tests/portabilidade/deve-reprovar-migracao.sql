-- ISCA. Este arquivo EXISTE PARA SER REPROVADO pela regra de migracao do portao
-- de portabilidade. Nao corrija este arquivo. Nao o use como exemplo.
-- Ver docs/07-devops.md 3.9.
--
-- O banco guarda codigo e chave, nunca URL. URL persistida transforma a troca
-- de dominio em migracao de dados sobre plastico ja impresso, e esse e o ponto
-- irreversivel que esta regra protege.
--
-- A regra ganhou isca porque foi ESTREITADA em 20/10/2026: antes ela era
-- `"http://" in linha`, acusava comentario e literal de regex, e por isso nao
-- precisava de prova nenhuma -- acusava tudo. Agora exige HOST depois do
-- esquema, e regra estreitada sem isca e regra que ninguem viu reprovar.
--
-- Uma linha por forma que a regra existe para ver, cada uma declarando a regra
-- que acorda com `isca:` seguido do motivo. O autoteste cobra o par nos dois
-- sentidos, como nas iscas `.ts`, e mede na linha SEM COMENTARIO: se o defeito
-- destas linhas virasse prosa, a regra continuaria "provada" sem que a
-- varredura a exercitasse mais.
--
-- Este arquivo nao e uma migracao: mora fora de `migrations/`, nao tem carimbo
-- e nunca e aplicado. O autoteste o le por caminho proprio e cobra dele a regra
-- de migracao de proposito.

-- URL persistida como dado, que e o caso que a regra nasceu para pegar.
INSERT INTO app_config (chave, valor)
  VALUES ('cdn_de_fotos', 'https://img.bichu.app'); -- isca: URL absoluta em migracao

-- Host dentro de literal de regex, com o ponto escapado. Ancorar o esquema num
-- host amarra o ESQUEMA a ele, e a forma escapada e a que escaparia de uma
-- regra escrita as pressas.
ALTER TABLE pet
  ADD CONSTRAINT pet_foto_na_cdn
  CHECK (foto_url ~ '^https://img\.bichu\.app/'); -- isca: URL absoluta em migracao
