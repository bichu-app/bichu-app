# Medições do motor de busca — 21/10/2026

Base: `70f4aa34b4e9f9fd2eb436f656bc114e607eaba3` (= `origin/development`).
Postgres 16.4 (`postgis/postgis:16-3.4`), container `bichu-db-1`, limite de memória 640 MB.
`shared_buffers` 200 MB, `work_mem` 8 MB, `maintenance_work_mem` 64 MB, 1 worker paralelo.

Banco descartável `bench_busca`, separado do `bichu` de desenvolvimento. Nenhuma imagem
construída, nenhuma pilha reiniciada. Funções `texto_para_busca` e `padrao_de_busca`
copiadas **verbatim** da migração `20260928000006`. Consulta medida é a de
`kysely-directory-repository.ts:291` com o `status = 'published'` do `construtorDaListagem`
e o `.orderBy('display_name')` da linha 566.

Corpus: `gerar-corpus.py`, semente fixa `20261021`, 82.623 nomes distintos em 100.011
linhas (repetição média 1,21). Mediana de 7 execuções, não a melhor.

## 1. Tempo da consulta, por volume e por perfil de termo

| volume | termo | linhas que casam | sem índice | com índice GIN | ganho |
|---|---|---|---|---|---|
| **14** (realidade de hml) | seletivo | 1 | **0,114 ms** | **0,137 ms** | **−20 %, o índice ATRAPALHA** |
| 14 | `vacin` | 1 | 0,059 ms | 0,085 ms | −44 %, atrapalha |
| 14 | `vet` (amplo) | 4 | 0,060 ms | 0,067 ms | −12 %, atrapalha |
| **10.011** | seletivo | 1 | 17,580 ms | **0,278 ms** | **63×** |
| 10.011 | `vacin` | 1 | 16,442 ms | **0,036 ms** | **457×** |
| 10.011 | `vet` (amplo) | 4.559 | 17,066 ms | 17,227 ms | **empate — o índice não paga** |
| **100.011** | seletivo | 1 | 108,487 ms | **0,828 ms** | **131×** |
| 100.011 | `vacin` | 1 | 110,906 ms | **0,084 ms** | **1.320×** |
| 100.011 | `vet` (amplo) | 45.451 | 114,669 ms | **165,823 ms** | **−45 %, o índice PIORA** |

Tamanho: índice 6.688 kB sobre tabela de 12 MB em 100 mil linhas (56 % da tabela).
Em 10 mil, 792 kB sobre 1.200 kB.

## 2. As três conclusões que os números impõem

**2.1. Em 12 linhas o índice é prejuízo, não enfeite.** A medição em 14 linhas dá o índice
entre 12 % e 44 % MAIS LENTO que a varredura. A causa é banal: ler 32 kB de índice para
depois ler uma tabela de 8 kB é mais trabalho que ler a tabela. Isso não é argumento contra
o índice — é a prova de que **a homologação não consegue medir busca**, e que qualquer
afirmação de desempenho feita sobre as 12 entradas do diretório é vazia nas duas direções.

**2.2. O índice é decisivo para termo seletivo e cresce de valor com o volume.** 63× em
10 mil, 131× em 100 mil para o termo longo; 457× e 1.320× para o termo curto de 5 letras.
O ganho **aumenta** com o volume porque o custo da varredura é linear e o do índice quase
não se move (0,278 → 0,828 ms de 10 mil para 100 mil).

**2.3. O termo AMPLO é o defeito que o índice não cobre, e ele piora com índice.**
`vet` casa 45.451 de 88 mil publicados — metade do catálogo. O plano mostra por quê:

```
Parallel Bitmap Heap Scan   (actual time=10.092..68.522 rows=22726 loops=2)
  Recheck Cond: (texto_para_busca(display_name) ~~ '%vet%'::text)
  Heap Blocks: exact=951
  ->  Bitmap Index Scan on professionals_busca_por_nome
        (actual rows=51533)   Buffers: shared hit=11
```

O `Bitmap Index Scan` é rápido (4,9 ms, 11 páginas). O que custa é o `Recheck` sobre 45 mil
linhas mais o `Sort` para ordenar por nome. Com índice são 165,8 ms; sem índice, 114,7 ms,
porque a varredura sequencial paralela evita o bitmap gigante. **Nenhum índice resolve um
termo que casa metade da base.** Isso só se resolve no desenho: relevância que corte, teto
por conta, e um piso de caracteres.

## 3. O índice É usado, e sobrevive ao plano genérico

Risco clássico conferido: GIN de trigrama que existe e consulta que não casa a forma.
Não é o caso aqui — o predicado é caractere a caractere a expressão indexada.

```
Bitmap Heap Scan on professionals
  Recheck Cond: (texto_para_busca(display_name) ~~ '%clinica veterinaria sao francisco%')
  Filter: (status = 'published'::text)
  ->  Bitmap Index Scan on professionals_busca_por_nome
        Index Cond: (texto_para_busca(display_name) ~~ '%...%')
```

A migração avisa que a partir da 6ª execução o Postgres troca o plano customizado pelo
genérico. **Medido com `PREPARE` e 8 `EXECUTE` na mesma sessão: o plano NÃO muda e o índice
continua sendo usado** (execução 1: 5,128 ms; execução 7: 0,688 ms; execução 8: 0,693 ms —
a queda é cache, não troca de plano). A decisão de não fazer o índice parcial, documentada
na migração, se confirma pelo lado de cá: com o índice total, `status = $1` como parâmetro
não desqualifica nada.

## 4. O que NÃO foi medido, e por que

- **`pets.name`, Loja, Rede, Conversas**: não têm índice nenhum, então não há "com e sem"
  a medir. O número que vale para elas é o da linha "sem índice" desta tabela: ~110 ms por
  consulta em 100 mil linhas, por requisição, com varredura completa.
- **Relevância**: não existe no produto, então não há o que medir. O custo de acrescentá-la
  (`similarity()` no `ORDER BY`) precisa de medição própria depois do desenho aprovado.
- **Busca semântica**: a extensão `vector` **não existe na imagem** (`ls
  /usr/share/postgresql/16/extension/` traz `pg_trgm` e `unaccent`, e nenhum `vector*`).
  Medir exigiria trocar a imagem base, o que esta tarefa não faz.
