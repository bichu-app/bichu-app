# ADR-0021: Resposta pública não tem ramo privilegiado

**Status:** aceito
**Data:** 2026-09-17

## Contexto

`GET /v1/tags/{code}` é a operação mais exposta do produto: ela responde quando
um estranho escaneia a plaquinha de um cachorro na rua. Por desenho do ADR-0005,
ela tem autenticação **opcional** (`bearerAuth` mais `{}`), porque o mesmo
endereço serve duas pessoas: o achador sem conta e o tutor que escaneia a própria
tag e precisa cair no modo dono.

O contrato resolvia isso com um ramo dentro do corpo único da resposta:

```yaml
owner_view:
  type: object
  nullable: true
  description: Presente apenas quando `viewer` e `owner`.
  properties:
    pet_id: { type: string, format: uuid }
    tag_id: { type: string, format: uuid }
```

O portão de contrato reprovou os dois campos como SEC-001. Ele está certo, e por
dois motivos independentes:

1. **A regra do ADR-0010, item 6, não abre exceção por chamador.** Ela é escrita
   por superfície: a rota `/t/<codigo>` e "qualquer JSON que a sirva" jamais
   exibem `pet_id`, `user_id`, `case_id` ou qualquer UUID do banco. O próprio
   contrato repete isso no cabeçalho, com escopo ainda mais direto: nenhum UUID
   interno sai em resposta a quem chega pelo código da tag. O tutor que escaneia
   a própria plaquinha chega pelo código da tag como qualquer outro.
2. **"Presente apenas quando `viewer` é `owner`" é uma frase, não uma restrição.**
   Nenhum validador, cliente gerado, simulador ou portão cumpre uma descrição em
   prosa. Todos leem o campo como parte do corpo declarado. Uma condição de
   segurança que só existe em texto vale pela disciplina de quem implementa, e no
   dia em que alguém preencher o ramo por engano nada acusa.

Os identificadores estavam ali por necessidade real: o modo dono chama
`/pets/{petId}/...` e `/pets/{petId}/tags/{tagId}/...`, que são endereçadas por
UUID. E o app não tem como descobri-los sozinho a partir do código escaneado:
`GET /pets/{petId}/tags` devolve **apenas os quatro últimos caracteres** do
código, de propósito, e `POST /pets/{petId}/tags` é a única resposta que traz o
código em claro, valor que o cliente não persiste. Comparar quatro caracteres
colide.

## Decisão

**Uma operação com caminho anônimo declara um corpo só, e esse corpo é o público.**
Onde um chamador autenticado precisar de mais, a diferença vira **outra operação**,
com `security` próprio.

Aplicado aqui, em três partes:

1. `TagResolution` perde `owner_view`. O corpo passa a ser idêntico nos três
   valores de `viewer`.
2. `viewer` continua, e é só sinal de navegação: `owner` manda o app abrir o modo
   dono. Ele não destranca campo nenhum, e não vaza nada, porque é derivado do
   token de quem já está chamando.
3. Nasce `GET /v1/tags/{code}/owner-context` (`getTagOwnerContext`), com
   `security: [bearerAuth]` e **sem alternativa vazia**, devolvendo
   `TagOwnerContext { pet_id, tag_id }`. Responde 200 só ao tutor do pet daquela
   tag, e **404 para os três casos restantes** (código inexistente, revogado, ou
   de outro tutor). Distinguir confirmaria a existência de tag alheia a qualquer
   pessoa com conta, que é o item 9 da lista do ADR-0010, e faria da rota um
   oráculo de enumeração de código com um cadastro grátis na frente.

`GET /v1/tags/{code}` passa a declarar `x-credential: tag_code_in_path`, o
marcador que faltava. A regra do SEC-001 é escrita no contrato com escopo
legível por máquina ("resposta a quem chega por `x-credential: tag_code_in_path`
ou por `finderToken`"), e a operação canônica do código da tag era justamente a
que não carregava o marcador. É por esse buraco que a revisão passou.

## Alternativas consideradas

| Opção | Prós | Contras | Por que não |
|---|---|---|---|
| Manter `owner_view` e confiar na descrição | zero mudança, uma ida de rede a menos | a condição não é verificável por nada; o corpo declarado de uma rota sem conta contém UUID do banco | é exatamente o defeito, escrito de novo |
| Trocar os UUIDs por token opaco dentro de `owner_view`, como o `upload_ref` | segue um padrão que o produto já tem | o padrão do token opaco existe para dar endereço a **quem não tem conta**: é o que a descrição do `upload_ref` diz. Aqui o destinatário é o tutor, que já recebe `Pet.id` e `PetTag.id` em rota autenticada. Criaria um segundo espaço de identificadores para quem já tem o primeiro, e o campo continuaria no corpo público, agora invisível ao portão | troca um vazamento que se vê por um que não se vê, e ainda exige a operação de troca que este ADR cria de qualquer jeito |
| `oneOf` com duas variantes de resposta | expressa a bifurcação no schema | as duas variantes continuam alcançáveis a partir de uma operação sem conta; o portão reprova igual, e com razão | OpenAPI não varia resposta por credencial |
| App descobre o pet pelo código, comparando com o que já tem em cache | nenhuma rota nova | `listPetTags` devolve quatro caracteres, e o cliente não guarda o código em claro | os quatro caracteres colidem; a regra de não persistir o código é do ADR-0004 |
| Devolver o modo dono em `POST` de sessão, e não no escaneamento | nenhuma rota nova | o tutor escaneia a tag meses depois de entrar na conta | não resolve o momento em que a informação é pedida |

## Consequências

Fica mais fácil: auditar a rota mais pública do produto. O corpo dela não tem
ramo condicional, então a pergunta "o que um estranho recebe" tem uma resposta
só, e o portão a confere sem precisar entender prosa.

Fica mais difícil: o modo dono custa **uma ida de rede a mais**. É aceitável
porque o caminho do dono é o raro (quem escaneia a plaquinha na rua é um
estranho) e porque a alternativa é pagar a economia com um UUID em resposta
pública.

Passa a ser regra geral, e não caso isolado: **nenhuma operação com alternativa
vazia em `security` declara campo que só um chamador autenticado deveria ver.**
O portão de contrato já impõe isso para UUID e para campo privado, e a prova
negativa existe: afrouxar o `security` de `getTagOwnerContext` para
`bearerAuth` mais `{}` faz o portão reprovar `pet_id` e `tag_id` nominalmente.
Os identificadores são seguros ali porque o `security` diz que são, e o portão
verifica exatamente isso.

Fica aberto: o backend precisa implementar `getTagOwnerContext` com a busca
vinculada (`WHERE tag.code_hash = :code AND pet.owner_id = :caller`) na camada de
repositório, e não com duas consultas e uma comparação no manipulador. É a mesma
correção que o SEC-001 pediu para o par id-no-caminho mais token.

---
DÉDALO — Arquiteto de Software
