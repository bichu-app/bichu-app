# ADR-0024: Identidade interna separada da identidade pública

**Status:** aceito
**Data:** 2026-09-23

## Contexto

A migração `20260922000009_vitrine-da-loja.sql` deu a `store_partners` e a
`store_items` uma chave primária em `slug`, e fez `store_items.partner_slug`
apontar para `store_partners.slug`. O argumento estava escrito na própria
migração e é bom: o ADR-0010 item 6 proíbe UUID interno em saída pública, a
tabela só existe para sair em saída pública, e um `id uuid` ali seria uma coluna
que nunca pode ser projetada esperando alguém projetá-la por engano.

O portão do critério 2 da BICHUS-19 (`COLUNAS_PROIBIDAS_EM_FK`, em
`tests/integration/esquema.test.ts`) reprova essa chave estrangeira. As duas
coisas estavam certas e não cabiam juntas.

### Por que o portão existe, medido no código dele

O portão não tem um motivo, tem dois, e o comentário dele nomeia os dois. A
lista é "e-mail, telefone, login, `sub` de provedor externo e valor impresso em
QR", e a mensagem de reprovação diz: *chave estrangeira sobre valor que o
usuário troca ou que sai impresso*.

**O primeiro motivo é mutabilidade.** O ADR-0005 decidiu, por extenso, que slug
é mutável, e é por isso que existe histórico e resposta 301. Chave estrangeira
sobre valor que muda ou quebra em silêncio ou obriga cascata de atualização.

**O segundo motivo é exposição, e é ele que decide este caso.** Um valor que sai
público e é ao mesmo tempo a chave que liga as tabelas entrega a junção junto com
o endereço: quem tem o endereço público tem a chave do grafo relacional. É a
mesma família do ADR-0004, que fez o código da tag ser 128 bits aleatórios para
não ser enumerável, e do ADR-0005, que registrou que "slug é mutável e o plástico
não". Valor impresso não se troca depois que o plástico saiu da gráfica; chave
estrangeira sobre ele congela o esquema no papel.

O segundo motivo sobrevive ao argumento de que ninguém troca o slug de um
parceiro curado. O primeiro, não. Por isso a hipótese de que o portão existe só
por causa de mutabilidade está **incompleta**, e decidir por ela levaria à saída
errada.

## Decisão

**Toda tabela com endereço público tem duas chaves, e elas têm funções
diferentes:** uma identidade interna (`id uuid`), que é a chave primária e o
alvo de toda chave estrangeira, e um endereço público (`slug`), único, que é o
que sai na resposta. Nenhuma chave estrangeira aponta para o endereço público.

`store_partners` e `store_items` passam a seguir esse desenho. `partner_slug`
vira `partner_id uuid REFERENCES store_partners (id)`.

**Nada muda na resposta.** `StorePartnerRef` continua `{slug, name, host}` e
`StoreItemSummary` continua com `slug` como única chave do item. O ADR-0010 item
6 proíbe UUID na **saída pública**, e ele continua cumprido — agora por ausência
de campo, e não por ausência de coluna.

## Alternativas consideradas

| Opção | Prós | Contras | Por que não |
|---|---|---|---|
| (a) Renomear a chave pública para `code`, alinhando com `ref_species` | a chave estrangeira passa a ser legítima pela regra que já existe | é renomear para fugir do portão; e a Loja passaria a falar `code` enquanto `Perto` fala `slug` | o portão compara por nome exato, então trocar o nome o torna cego ao caso exato para o qual foi escrito. E `DirectoryEntrySummary.slug` já está mesclado na `development` (`38371aa`), `required`, usando o componente `Slug` — o mesmo conceito de produto sairia com dois nomes na mesma API |
| (b) Declarar exceção para `store_partners.slug` no portão | não mexe no banco nem no contrato | é um portão de segurança, e o valor da lista dele é não ter exceção | a exceção seria falsa: `store_partners.slug` **é** endereço público, e chamá-lo de "dado de referência" responde ao primeiro motivo do portão e ignora o segundo. A primeira exceção também vira o precedente que a próxima cita |
| (c) Identidade interna separada da pública | precedente unânime da casa; nada muda na resposta; a troca de endereço público vira `UPDATE` de uma coluna | acrescenta uma coluna que nunca pode ser projetada | **é a escolha** |
| Manter como está e afrouxar o caso do portão só para esta migração | zero trabalho | o defeito continua, sem alarme | é (b) com outro nome |

### O que decidiu, e é precedente medido

`pets` (`20260917000006`) e `professionals` (`20260922000008`) já são
`id uuid` primária mais `slug` único. A `20260922000008` existe **exatamente**
para isso: acrescentou `slug` a `professionals` porque a listagem precisava de
uma chave pública que não fosse o UUID. `store_partners` e `store_items` eram as
únicas tabelas do produto fora desse desenho, e `store_items.partner_slug` era a
**única** chave estrangeira sobre `slug` no esquema inteiro.

### O medo da coluna projetada por engano já tem mecanismo

O argumento contra (c) era que um `id uuid` fica esperando alguém projetá-lo. Ele
não espera: `src/tools/portao-contrato-publico.ts` reprova qualquer campo
`format: uuid` em operação alcançável sem conta (SEC-001), e tem isca própria
provando que continua enxergando. Medo já coberto por portão não justifica torcer
o esquema.

## Consequências

Fica mais fácil: trocar o endereço público de um parceiro passa a ser `UPDATE`
de uma coluna, e não cascata por todos os itens dele. E o portão da BICHUS-19
volta a valer sem exceção, o que o mantém capaz de pegar o próximo caso.

Fica mais difícil: `store_partners` e `store_items` passam a ter uma coluna que
nunca aparece em resposta, e quem escrever consulta nova precisa lembrar de
projetar `slug` e não `id`. É o mesmo custo que `pets` e `professionals` já
pagam, e é o portão de contrato público que o cobra.

Passa a ser irreversível na prática: a partir do momento em que houver dado em
produção, voltar a chave primária para `slug` exigiria reescrever chave
estrangeira com a base no ar. Esta decisão é barata hoje porque a migração ainda
não chegou à `development`.

**Regra que esta decisão deixa escrita para as próximas tabelas:** se a tabela
tem endereço público, ela tem `id` interno e o endereço ao lado, e a chave
estrangeira aponta para o `id`. Não é preciso reabrir a discussão por tabela.
