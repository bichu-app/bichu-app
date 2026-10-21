# Conjunto de referência rodado contra o motor que existe hoje

Base `70f4aa34`. Corpus de 100.011 linhas, índice GIN de trigrama no lugar.
Consulta: `kysely-directory-repository.ts:291` + `status='published'` + `ORDER BY display_name`.

```
+--------+-----------------------------------------------+------------------------------------+-------------+-------------+--------------+---------------------+
|   id   |                   categoria                   |              consulta              | encontrados | pos_do_alvo | pos_esperada |      veredito       |
+--------+-----------------------------------------------+------------------------------------+-------------+-------------+--------------+---------------------+
| ACE-01 | acento ausente                                | clinica veterinaria sao francisco  |           1 |           1 |            1 | PASSA               |
| ACE-02 | acento sobrando / acento errado               | clínicá veterinariá sao francísco  |           1 |           1 |            1 | PASSA               |
| ACE-03 | caixa trocada                                 | CLÍNICA VETERINÁRIA SÃO FRANCISCO  |           1 |           1 |            1 | PASSA               |
| ACE-04 | caixa alternada                               | cLíNiCa VeTeRiNáRiA sÃo FrAnCiScO  |           1 |           1 |            1 | PASSA               |
| CMP-01 | termo composto em campos diferentes           | vet vila mariana                   |           0 |             |            5 | REPROVA (nao achou) |
| CMP-02 | termo composto nome + cidade                  | zoonoses sao paulo                 |           0 |             |            5 | REPROVA (nao achou) |
| CMP-03 | termo composto fora de ordem                  | francisco clinica                  |           0 |             |            5 | REPROVA (nao achou) |
| ERR-01 | erro de digitacao: uma letra transposta       | clinica veterinaria sao francsico  |           0 |             |            1 | REPROVA (nao achou) |
| ERR-02 | erro de digitacao: letra faltando             | clinica vetrinaria sao francisco   |           0 |             |            1 | REPROVA (nao achou) |
| ERR-03 | erro de digitacao: uma letra trocada          | clinica veterinaria sao franscisco |           0 |             |            1 | REPROVA (nao achou) |
| ERR-04 | erro de digitacao: duas letras                | clinica vetirinaria sao franscisco |           0 |             |            5 | REPROVA (nao achou) |
| ERR-05 | erro de digitacao em termo curto              | vacinacsao                         |           0 |             |            1 | REPROVA (nao achou) |
| NEG-01 | controle negativo: nao existe                 | xilofone quantico                  |           0 |             |              | PASSA               |
| NEG-02 | controle negativo: cadeia improvavel          | zzqwxkj                            |           0 |             |              | PASSA               |
| NEG-03 | controle negativo: curinga de LIKE            | %%%                                |           0 |             |              | PASSA               |
| NEG-04 | controle negativo: curinga de uma posicao     | ___                                |           0 |             |              | PASSA               |
| NEG-05 | controle negativo: nao publicado nao aparece  | rascunho oculto                    |           0 |             |              | PASSA               |
| NEG-06 | controle negativo: barra invertida            | \\\\                               |           0 |             |              | PASSA               |
| PAR-01 | termo parcial                                 | vacin                              |           1 |           1 |            1 | PASSA               |
| PAR-02 | termo parcial de tres letras                  | vet                                |       45451 |             |              | PASSA               |
| PAR-03 | termo parcial abaixo do piso                  | ve                                 |       46032 |             |              | N/A (piso)          |
| PLU-01 | plural digitado, singular guardado            | cães                               |           1 |             |            5 | REPROVA (nao achou) |
| PLU-02 | singular digitado, plural guardado            | pata                               |        6323 |           1 |           20 | PASSA               |
| PON-01 | hifen omitido                                 | bem estar animal                   |           0 |             |            1 | REPROVA (nao achou) |
| PON-02 | hifen digitado                                | bem-estar animal                   |           1 |           1 |            1 | PASSA               |
| PON-03 | apostrofo omitido                             | dangelo                            |           0 |             |            1 | REPROVA (nao achou) |
| PON-04 | apostrofo virou espaco                        | d angelo                           |           0 |             |            1 | REPROVA (nao achou) |
| PON-05 | apostrofo digitado                            | d'angelo                           |           1 |           1 |            1 | PASSA               |
| PON-06 | travessao no nome                             | casa do cao banho e tosa           |           0 |             |            1 | REPROVA (nao achou) |
| REL-01 | relevancia: nome exato contra nome que contem | zoonoses vet                       |           2 |           2 |            1 | REPROVA (posicao)   |
| REL-02 | relevancia: prefixo ganha de meio da palavra  | vacinacao                          |           1 |           1 |            1 | PASSA               |
+--------+-----------------------------------------------+------------------------------------+-------------+-------------+--------------+---------------------+
(31 rows)

```
