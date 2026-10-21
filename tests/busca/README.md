# O conjunto de referência da busca

**Qualidade de busca se mede, não se afirma.** Este diretório é o contrato de
qualidade do motor de busca: um conjunto de consultas reais com o resultado
esperado, e as medições que dizem quanto custa atendê-las.

Sem ele, toda mudança no motor é palpite e toda regressão é invisível.

## O que tem aqui

| arquivo | o que é |
|---|---|
| `conjunto-de-referencia.json` | **O entregável.** 31 casos: o que a pessoa digita, qual registro tem de aparecer, em que posição, e por que o caso existe. |
| `gerar-corpus.py` | Gera o corpus sintético. Semente fixa — a medição é repetível. |
| `esquema-de-medicao.sql` | Tabela e funções (`texto_para_busca`, `padrao_de_busca` copiadas **verbatim** da migração `20260928000006`). |
| `rodar-conjunto-motor-atual.sql` | Roda o conjunto contra o motor que existe hoje e dá o veredito por caso. |
| `medir.sql` | Função de cronometragem: mediana de 7 execuções, não a melhor. |
| `RESULTADO-DO-CONJUNTO.md` | O placar de hoje: **16 passam, 14 reprovam**, 1 não julgado. |
| `MEDICOES.md` | Tempos com e sem índice em 14, 10 mil e 100 mil linhas, com plano de execução. |

## Como rodar

Precisa de um Postgres 16 com `unaccent` e `pg_trgm`. Um banco descartável,
nunca o de desenvolvimento:

```sh
psql -d postgres -c 'CREATE DATABASE bench_busca'
psql -d bench_busca -f esquema-de-medicao.sql
python3 gerar-corpus.py 100000 /tmp/corpus.tsv
psql -d bench_busca -c "\copy professionals (display_name,kind,city,state,neighborhood,status) FROM '/tmp/corpus.tsv'"
psql -d bench_busca -c "CREATE INDEX professionals_busca_por_nome ON professionals USING gin (texto_para_busca(display_name) gin_trgm_ops)"
psql -d bench_busca -f rodar-conjunto-motor-atual.sql
```

## As quatro regras que o conjunto protege

1. **O controle negativo não é opcional.** Sem `NEG-01` a `NEG-06`, um motor que
   devolve tudo "acerta" sempre, e o recuo de limiar vira varredura do catálogo.
2. **A posição faz parte do resultado.** Achar em 40º lugar não é achar. `REL-01`
   existe só para isso: duas linhas casam com o mesmo direito, e a ordenação
   alfabética de hoje devolve a errada.
3. **O alvo é único por construção.** Os nomes dos alvos usam tokens reservados,
   fora dos sorteios do gerador, para que a resposta esperada seja UMA linha
   identificável pela string exata — e não "o que o gerador tiver produzido".
4. **A mediana, não a melhor.** `medir.sql` roda 7 vezes e devolve a mediana.
   A melhor de sete é cache, não desempenho.

## O caso que decide trigrama contra busca de texto completo

`PLU-01` (`cães` → `Casa do Cão`) é o **único** caso do conjunto em que
radicalização ganha de trigrama: `caes` e `cao` não compartilham trigrama útil.
Ele existe para que a decisão não seja unânime por falta de contraexemplo.
Os outros 30 casos ou empatam ou favorecem trigrama.
