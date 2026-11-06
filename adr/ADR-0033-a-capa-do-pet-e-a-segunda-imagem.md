# ADR-0033: a capa do pet é a segunda imagem, e o retrato não muda
**Status:** aceito
**Data:** 2026-11-06

## Contexto

Em 06/11/2026 o cliente pediu, literalmente:

> "gostei muito da forma como ele apresenta o perfil do pet, com a foto de capa,
> como fazemos na pagina de eventos e profissionais"

e aprovou o desenho do telefone 2 do protótipo `perfil-do-pet-com-capa-06-11.html`
— capa 16:9 de borda a borda com raio 0, `BotaoVoltarSobreMidia` sobre a foto,
barra de cima que volta com a rolagem, nome descendo da barra para a página como
título `headline`, retrato 160 x 176 subindo sobre a capa com anel, e
"Trocar a foto de capa" como ação em texto junto de Editar/Excluir.

O pedido parece ser de tela, e não é só. Ele obriga a decidir **onde uma segunda
imagem por pet mora**, e essa pergunta tem três respostas plausíveis que levam a
sistemas diferentes.

### O que já existia, medido

Duas esteiras de imagem, separadas, cada uma com a sua tabela:

| | foto do pet | imagem de catálogo |
| --- | --- | --- |
| processador | `processar-foto.ts` | `processar-imagem-de-catalogo.ts`, com `purpose` |
| tabela | `pet_photos` | `catalog_images` |
| derivadas | `DERIVADAS_DA_FOTO_DE_PET`: `card` 1024 x 1126 e `thumb` 176 x 194, as duas na proporção **1 : 1,1** | por propósito, em `DERIVADAS_POR_PROPOSITO` |
| piso | `DIMENSAO_MINIMA_DA_FOTO_DE_PET`, par **escrito à mão** (600 x 600) | `LARGURA_MINIMA` por propósito, com a altura **derivada** da proporção |
| quem envia | a conta, por `POST /v1/media/pet-photo-intents` | o painel **e** a conta (a capa do encontro, ADR-0025 emenda 3) |

E um `CHECK`, na migração `20260918000002`, linha 87:

```sql
CONSTRAINT pet_photos_pronta_tem_derivadas
  CHECK (status <> 'ready' OR (thumb_key IS NOT NULL AND card_key IS NOT NULL))
```

### O que a derivada `card` do retrato alimenta

Medido por quem seleciona `pet_photos.card_key` nesta árvore — e são **cinco**
leituras fora da ficha do aplicativo, não três:

- `kysely-leitura-publica-do-caso.ts` — a página pública do caso de perdido;
- `kysely-registro-de-disparos.ts` — o **cartaz IMPRESSO**, `LostCasePoster.photo_url`;
- `kysely-found-report-repository.ts` — a tela de quem achou o pet;
- `kysely-perfil-publico.ts` — o perfil público do pet;
- `kysely-tag-repository.ts` — a página da plaquinha, `t/{code}`.

### A palavra "capa" já estava ocupada

`Pet.fotoDeCapa`, em `app/lib/api/modelos_pet.dart`, devolve a foto `is_primary`
e é pintada numa moldura de **retrato**. A frase de `openapi.yaml` que diz
*"A capa do pet, montada sobre a base de MIDIA. So de `card_key`"* está em
`FoundReportMatchedPet.photo_url`, a tela do achador. **"Capa", no código de
hoje, quer dizer "a foto principal do pet", que é retrato.** Quem lê o pedido do
cliente com esse vocabulário na cabeça conclui que a capa já existe, e conclui
errado.

## Decisão

### 1. São duas imagens com dois papéis, e a capa não substitui o retrato

O **retrato** é a identidade do animal. A **capa** é o ambiente dele. A capa
entra como imagem nova e **nenhuma derivada existente muda**.

A razão não é de gosto: se a capa 16:9 ocupasse o lugar do retrato, as cinco
leituras acima passariam a receber uma faixa deitada, e **o cartaz impresso de
pet perdido sairia em 16:9**. O cartaz é papel colado em poste; a foto nele é o
que faz alguém reconhecer o animal.

### 2. A capa anda na esteira de CATÁLOGO, com o propósito novo `pet_cover`

Isto vem da decisão do cliente de 03/11/2026:

> "sempre que estivermos falando de upload de imagem, isso deve ser tratado no
> mesmo lugar, e as correções devem ser realizadas em todos os lugares por ser o
> mesmo código"

E a alternativa — acrescentar uma derivada `banner` a `DERIVADAS_DA_FOTO_DE_PET`
— **não cabia**, e isso é medição e não preferência: `pet_photos` só chega a
`ready` com `thumb_key` **e** `card_key`, e as duas são retrato. Uma faixa 16:9
não gera miniatura de retrato. A linha ficaria presa em `processing` para sempre,
ou seria preciso afrouxar o `CHECK` que impede derivada sem original de existir.

O propósito novo entra nas **cinco** tabelas do mesmo arquivo
(`src/modules/media/ports/imagem-de-catalogo.ts`): a união `PropositoDaImagem`,
`CATEGORIA_DO_PROPOSITO`, `TIPOS_POR_PROPOSITO`, `DERIVADAS_POR_PROPOSITO` e
`LARGURA_MINIMA`.

`pet_cover` é **separado** de `network_event` e de `directory_photo` pela mesma
razão que separou `directory_suggestion_photo` de `directory_photo`: um
`upload_id` autorizado para a capa de um pet não casa o propósito que a
confirmação do encontro exige, e vice-versa. Não existe caminho, nem por descuido
nem por `upload_id` adivinhado, que leve a capa de um pet para a agenda da
comunidade.

O autor do envio é `user_id` e **nunca** `admin_account_id`: a capa é do tutor.
**O painel não ganha tela nenhuma**, e o site não é tocado.

### 3. O piso é 1280 x 720, com a altura DERIVADA

`LARGURA_MINIMA.pet_cover = 1280` — a decisão do cliente de 02/11/2026, e a
mesma largura de `directory_photo`, a outra faixa 16:9 do produto. A altura **não
é escrita em lugar nenhum**: `DIMENSAO_MINIMA` a deriva de `proporcaoDaMoldura`,
que sai da maior derivada com altura.

Par escrito à mão foi exatamente como o defeito de 02/11 nasceu — piso quadrado
de 600 x 600 sobre um recorte 16:9 é regra impossível, e travou o cliente
publicando. **Não se repete.**

As derivadas são `DERIVADAS_DA_CAPA_DO_PET`: `banner` 1280 x 720 (a capa que a
ficha desenha) e `card` 1024 x 576. A `card` existe porque
`processar-imagem-de-catalogo.ts` **lança** se o propósito não declarar `card`,
não porque alguma tela a desenhe — e ela é 16:9 como a `banner`, então a capa
nunca sai deitada por acidente. **Sem `thumb`**: nenhuma lista de pets mostra a
capa; o cartão do pet pinta o retrato, que vem de `pet_photos.thumb_key`.

A constante é **separada** de `DERIVADAS_DA_FOTO_DO_LOCAL`, embora os números
sejam hoje iguais. A lição é de 05/11/2026 e está escrita no próprio
`derivadas.ts`: duas superfícies que compartilham a mesma constante não podem
mudar separadamente, e tirar a altura de uma tirou a da outra sem ninguém pedir.

### 4. `pets.cover_image_id`, coluna singular, e o verbo é `PUT` num sub-recurso

Coluna e não tabela: a capa é **uma**, e não há ordem nem posição. Tabela filha
com `position` daria duas formas de dizer qual é a capa.

Sub-recurso (`PUT /v1/pets/{petId}/cover`) e não campo em `PetInput`, pelas três
razões medidas — as duas primeiras são as mesmas que `putPetDeliveryAddress` já
escreveu em `openapi.yaml`:

1. **`PATCH updatePet` recebe `PetInput`, que exige `name`, `species` e `size`.**
   Trocar a capa por ali obrigaria a tela da capa a reenviar o pet inteiro, e pet
   inteiro reenviado a partir de um gesto de escolher foto é como um campo de
   cadastro volta ao valor antigo sem ninguém ter editado nada;
2. **`PUT` é o verbo certo e `PATCH` não é.** Trocar a capa troca a capa inteira;
   não há campo para mesclar;
3. **`PetInput` é também a base de `Pet` (`allOf`).** Um `cover_image` de entrada
   posto nele apareceria na *resposta* de `getPet` e de `listMyPets` ao lado de
   `cover_image_url`, que é a saída — duas formas de dizer a mesma coisa no mesmo
   objeto, e é assim que a divergência nasce.

A resposta é **202 e não 200**: a derivada ainda não existe quando ela sai, então
`cover_image_url` vem nulo. Prometer a URL ali seria prometer arquivo que não
está no balde.

### 5. A faixa 16:9 SEMPRE existe; sem foto ela recebe o banner da marca

`temCapa: true` sempre, na `CascaDaPaginaInterna`. Sem foto, a faixa recebe o
`BannerDaMarca` com a pastilha "Adicionar capa" — que é, de fábrica, o que o
`ImagemDoEncontroOuBanner` já faz quando a `url` é nula, e portanto o que o
encontro da comunidade sem capa já mostra hoje.

**Esta é decisão de produto, não medição**, e a razão é esta: no dia em que isto
subir, **100% dos pets estarão sem capa**, porque a coluna nasce agora. Esse é o
estado dominante, e ele tem de parecer acabado e convidar o envio. A casca do
desenho aprovado não pode desaparecer quando falta a foto — se ela dependesse de
`pet.urlDaCapa != null`, a ficha de quase todo mundo mostraria a barra de cima
colada no topo, e a tela mudaria de forma no dia em que a primeira foto subisse.

### 6. Fica FORA desta rodada, de propósito

- **"Com você desde março de 2021".** `birth_date_approx` existe no contrato
  (`openapi.yaml:16454`) e na tabela `pets`, mas **o aplicativo não o lê nem o
  escreve**: medido com varredura sobre `app/lib` e `app/test`, zero ocorrências,
  com controle positivo na mesma varredura (`microchip_number` dá 22). Era
  desenho, não dado. Nenhum campo de cadastro foi inventado para sustentá-lo.
- **Tutor na tela.** O pet não tem campo de tutor na ficha, e a tela só abre para
  o dono (`_ForaDaConta`, ADR-0021). Mostrar o nome de quem já está logado é
  repetição.
- **Remover a capa.** O cliente aprovou "Trocar a foto de capa", e só isso. A
  ficha sem capa mostra o banner da marca, que é o estado normal e não uma falta.
- **Câmera para a capa.** A capa é o ambiente do animal, e foto de ambiente vem
  da galeria. A câmera continua existindo para o retrato.

## Consequências

**O que fica melhor.** A ficha do pet passa a usar a mesma casca do encontro e da
página do profissional, que é o que o cliente nomeou — e isso é montagem, não
invenção: `CascaDaPaginaInterna`, `BotaoVoltarSobreMidia`,
`ImagemDoEncontroOuBanner`, `BannerDaMarca` e `FormatoDoRecorte.capaDoEncontro`
(1280 x 720) já existiam. Nenhuma peça nova de design system nasceu.

**O que custa.** Onze propósitos em vez de dez; um `CHECK` a mais em dois lugares
(e as duas definições precisam continuar idênticas caractere a caractere, o que
`conjunto-exato-dos-checks.test.ts` cobra); e `pets` passa a ser categoria de
catálogo, o que faz `pets/original/<128 bits>` ser forma válida de chave ao lado
da que já existia, `pets/<petId>/original/<128 bits>`. As duas não colidem: uma
tem três segmentos e a outra quatro, e `comoObjectKey` as separa por isso.
**Essa última foi decisão minha sem precedente**, e é o ponto deste documento que
merece revisão mais atenta.

**O que continua aberto.** Quantos pets têm capa não se mede sem consulta em
produção, e nenhuma foi feita: a afirmação de que 100% nascerão sem capa vem da
coluna não existir hoje, que é dedução de esquema e não contagem de linhas.
Também não foi medido se a derivada 16:9 do pet cabe no teto de 500 KB com a
escada de qualidade — o encontro já faz 1280 x 720 na mesma escada, então o
precedente é bom, mas ninguém pesou os bytes.
