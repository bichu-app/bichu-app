> **Status:** aprovado
> **Atualizado:** 2026-09-22

# Registro de remoções irreversíveis em homologação

Este arquivo existe porque `pet_tags` não tem volta. O código da plaquinha é
guardado cifrado para reimpressão e o `DELETE` leva o cifrado junto: apagada a
linha, o código não é recuperável de lugar nenhum. Um registro que diga **o que**
foi apagado e **quando** é a única coisa que sobra depois.

**Nenhum código de plaquinha entra aqui.** Nem o código, nem `code_hash`, nem
`code_ciphertext`, nem `code_suffix`. O código é credencial: quem o tem abre a
página do pet. As colunas abaixo são identificadores internos e carimbos de
tempo, que não abrem nada.

Este registro vale para `homolog` (`bichu-hml`). Produção não aparece aqui e
não deve aparecer: remoção em produção não é operação de roteiro.

---

## 2026-09-22 — as duas tags de teste da massa inicial

**Autorização:** explícita do cliente, para **duas linhas de teste**, nesta data.

**O que foi medido antes de apagar**, e foi o que sustentou a decisão de seguir:

| Medida | Valor |
|---|---|
| Linhas em `pet_tags` | 2, ambas `active`; nenhuma `revoked` |
| Pets distintos | 2 (o banco inteiro tinha 2 pets e 1 usuário) |
| Conta dona | a mesma para as duas, e única conta do banco |
| Idade na hora da remoção | menos de 12 h; criadas com 11 min de diferença |
| `scan_count` / `last_scanned_at` | 0 e nulo nas duas |
| Linhas em `tag_scans` | 0 |
| `label` | vazio nas duas |

Duas tags criadas no mesmo dia, para dois pets de mesmo nome, da conta única de
um banco com um usuário, nunca lidas por ninguém. É massa de teste, e bate com
o que foi autorizado. Se qualquer uma dessas medidas tivesse vindo diferente —
uma terceira linha, uma leitura registrada, uma segunda conta — a remoção não
teria acontecido.

**O que foi apagado**, em uma transação, pelos ids, com `status = 'active'` no
`WHERE` (`DELETE 2`, `COMMIT`):

| `pet_tags.id` | `pet_id` | `status` | `created_at` (UTC) | apagada em (UTC) |
|---|---|---|---|---|
| `01a0c914-e762-7dff-9d46-ce7352643756` | `01a0c914-e71f-7414-ac65-da9232876aca` | `active` | 2026-09-22 12:26:25.511101+00 | 2026-09-23 00:24:27.010406+00 |
| `01a0c91f-77ec-7ec2-851c-c9a338598e56` | `01a0c91f-77ad-7706-9d4c-2f794ff4dc81` | `active` | 2026-09-22 12:37:57.868448+00 | 2026-09-23 00:24:27.010406+00 |

Os pets e a conta **não** foram tocados: a remoção foi só das plaquinhas.

**Por que foi preciso apagar.** `20260921000001_indice-cego-do-codigo-da-tag.sql`
troca o `code_hash` de SHA-256 sem sal por HMAC-SHA-256 com
`TAG_CODE_INDEX_KEY`, e recalcular o hash de uma tag exige decifrar
`code_ciphertext` com a `TAG_CODE_KEY` **daquele ambiente**. A migração tem
`RAISE EXCEPTION` quando encontra linha `active`, e está certa em ter: aplicar
sem recalcular deixaria toda tag existente apontando para um hash que ninguém
mais procura, e o sintoma seria 404 na página do achador, sem erro em lugar
nenhum. Em homologação, apagar a massa de teste é mais barato que recalcular.

**Estado depois:** `select count(*) from pet_tags` devolve 0, e a migração
`20260921000001` deixa de ter o que barrar.
