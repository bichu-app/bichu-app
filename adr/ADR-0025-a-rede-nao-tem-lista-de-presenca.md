# ADR-0025: A Rede não tem lista de presença, e o check-in é da pessoa e nunca do pet

**Status:** aceito, com emenda 1 — a seção 7 foi reescrita
**Data:** 2026-09-23

## Contexto

O cliente descreveu a seção `Rede` em 23/09/2026, por escrito:

> *"a seção rede seria a parte da comunidade, os eventos que os administradores
> criam, para encontrar os dogs em praças, parques, etc. Essa seção não precisa
> ser alimentada especificamente pelo backoffice, pode ser pela própria
> comunidade. As pessoas podem fazer checkin que estão no evento, tirar foto e
> enviar que fica vinculado ao evento como se fosse uma galeria/posts."*

Até 22/09 a `Rede` não existia em lugar nenhum: sem tabela, sem rota, sem tela.
O que havia era a aba, com uma casca honesta dizendo que a seção estava em
construção (`AbaRede`, em `app/lib/telas/abas.dart`).

### O que o pedido colide, e a colisão é estrutural e não de tela

O **item 7 do ADR-0010** proíbe a superfície pública de deixar inferir que dois
pets são do mesmo tutor. Ele está escrito por superfície, não por chamador, e
é critério de reprovação em revisão.

**Uma lista de presença em evento de bairro faz essa inferência de graça.** Se
a Maria confirma presença com o Thor e com a Nina, qualquer pessoa que abra a
lista sabe que os dois animais moram na mesma casa. E o endereço do evento é uma
praça do bairro dela, o que estreita a casa a algumas quadras. Num produto cujo
fluxo mais crítico é pet perdido, essa é exatamente a informação que interessa a
quem quer levar um animal: dois pets, um endereço aproximado, um nome.

A galeria piora o quadro em vez de repeti-lo. Foto enviada por quem fez check-in
liga rosto, pet e lugar num objeto só, e ela é enviada por uma pessoa que não
está pensando em modelo de ameaça enquanto envia.

Nada disso é resolvido por um `if` na tela. Enquanto o dado sair da API, ele sai
para qualquer cliente, inclusive o que ninguém escreveu.

## Decisão

### 1. O check-in é da PESSOA, e o pet não entra nele

`network_event_checkins` tem `user_id` e **não tem `pet_id`**. Não há coluna de
pet, não há tabela de ligação, e a ausência é a decisão. Não existe caminho no
banco pelo qual um check-in saiba qual animal foi junto, então não existe
projeção, `join`, relatório ou engano de implementação que o publique depois.

O custo é real e precisa estar escrito: **o produto perde "levei o Thor"**. Num
encontro de cachorros, dizer qual cachorro é quase o conteúdo. Em troca, a
inferência que o ADR-0010 item 7 proíbe deixa de ser uma regra que alguém
precisa lembrar e passa a ser um dado que não existe.

### 2. A presença é um NÚMERO, e nunca uma lista de pessoas

A resposta pública de um evento traz `checkin_count`, um inteiro. **Não existe
campo com pessoas**, em forma nenhuma: nem nome, nem primeiro nome, nem apelido,
nem `slug`, nem avatar, nem contagem por bairro.

Foram consideradas e recusadas duas variantes mais brandas:

- **Lista visível só para quem também fez check-in.** Fazer check-in é grátis e
  não é verificado — ninguém confere que a pessoa foi à praça. Quem quiser a
  lista faz check-in e a recebe, então a proteção é um degrau de um passo. Pior:
  ela cria a impressão de que a lista é fechada, e quem confirma presença acha
  que está aparecendo para um grupo menor do que o real.
- **A pessoa escolhe, no check-in, se aparece.** Isso move o modelo de ameaça
  para a vítima, num momento (confirmar presença num encontro de cachorros) em
  que ninguém está pensando em modelo de ameaça. Um interruptor cujo valor
  errado é irreversível para quem o erra não é escolha, é armadilha — e a
  escolha certa depende de saber que o produto também guarda pets perdidos, o
  que quem confirma presença não tem por que ligar.

O que o número perde é a prova social nominal: a pessoa vê *"12 confirmadas"* e
não *quem*. Para um recurso de comunidade isso é caro, e é o custo que esta
decisão paga por inteiro. A forma de recuperá-lo sem reabrir a inferência está
na seção *Fase seguinte*, e ela **não é** ligar a lista.

### 3. A foto da galeria não tem autor na saída

`network_event_photos` guarda `submitted_by_user_id`, porque remoção, auditoria
e resposta a abuso precisam saber de quem veio. **Esse campo nunca é projetado.**
A foto pertence ao **evento**, e a resposta pública da galeria tem legenda e
imagem, e mais nada.

Atribuir foto a pessoa reconstruiria a lista de presença por outro caminho: dez
fotos assinadas são dez nomes presentes, com a vantagem, para quem procura, de
virem com imagem do lugar.

### 4. Quem cria evento na fatia mínima: **o administrador**

O cliente disse as duas coisas — *"os administradores criam"* e *"pode ser pela
própria comunidade"* —, e elas convivem no produto final. Elas não convivem
**nesta fatia**, por três fatos medidos no repositório em 23/09:

1. **Não existe moderação.** Não há rota de denúncia de conteúdo, não há fila de
   revisão de conteúdo criado por usuário, não há remoção. O que existe é a fila
   de `entity_verifications` (prova documental de profissional) e a retenção
   para revisão das mensagens da conversa mediada — nenhuma das duas é moderação
   de conteúdo publicado. `kysely-directory-repository.ts` registra a ausência em
   uma linha: *"não há painel de moderação"*.
2. **O cliente já respondeu esta pergunta uma vez, e respondeu não.** A emenda 1
   do ADR-0011, aceita em 21/09, tirou do diretório a criação pela comunidade e
   a trocou por convite com aceite, justamente porque publicar dado de terceiro
   sem consentimento é problema de lei e não de produto. Evento criado pela
   comunidade tem a mesma forma: um texto e um lugar publicados por alguém, sem
   ninguém entre a escrita e a publicação.
3. **A pilha de integração não tinha armazenamento de objeto até 22/09.** Ele
   foi construído em `bichus-245-armazenamento-integracao` (`7490262` e
   `948d65a`) e **ainda não está mesclado** em `feat/tela-de-loja`, que é a base
   desta fatia. Planejar teste de upload de foto de usuário aqui seria planejar
   contra um serviço que esta árvore não tem.

Portanto, nesta fatia: **evento é curado**, entra pela massa e pelo mesmo caminho
que a `Loja` (ADR-0023, escrita em `/v1/admin/...` quando ela existir), e **a
comunidade participa pelo check-in**. Check-in foi escolhido como a participação
que entra primeiro porque ele **não produz conteúdo**: não tem texto, não tem
imagem, não tem nada para moderar. Um inteiro que sobe de um não precisa de fila
de revisão.

A galeria existe nesta fatia **exibida e não enviada**: a tabela está criada e a
massa a preenche, para o cliente ver o desenho do cartão com e sem foto. O envio
pela comunidade é fase seguinte, junto da moderação que ele exige.

### 5. O local do evento, sem geocodificação

O **ADR-0006 proíbe geocodificação no MVP**, e é explícito sobre a origem de
coordenada: só `device_gps` e `map_pin`. Um administrador cadastrando uma praça
não tem nenhuma das duas — ele não está lá, e não há fluxo de toque no mapa fora
do cadastro de tutor.

**Então o evento não tem coordenada.** `network_events` não tem coluna `geo`,
não tem latitude, não tem longitude, e não tem CEP. O lugar é guardado em três
rótulos de texto:

| Coluna | O que é | Exemplo |
|---|---|---|
| `place_name` | o nome do lugar público, como as pessoas o chamam | `Praça Benedito Calixto` |
| `neighborhood` | o bairro | `Pinheiros` |
| `city` / `state` | cidade e UF | `São Paulo` / `SP` |

Isso fica **no teto** que o ADR-0010 declara para superfície pública — *"bairro
e cidade"* — e não o ultrapassa. E o nome de uma praça não é endereço de
residência de ninguém: é o mesmo tipo de rótulo que o produto já publica na
listagem de perdidos.

Três consequências que precisam estar ditas, porque cada uma é uma coisa que a
tela **não** vai ter:

- **Não há mapa, em zoom nenhum.** ADR-0010 item 5.
- **Não há ordenação por distância, e ela não aparece desabilitada.** Sem
  coordenada não há distância; oferecer a ordem e não cumpri-la seria o caso que
  `BarraDeListagem.porQueNaoEAPedida` existe para explicar, e explicar uma
  impossibilidade permanente é pior que não oferecer.
- **O filtro de lugar é por cidade digitada**, como a listagem pública de
  perdidos já faz, e pela mesma razão do ADR-0006: rótulo é filtro, não fonte de
  coordenada.

### 6. A data tem fuso explícito, e o passado é rotulado pelo SERVIDOR

`starts_at` é `timestamptz`, que é instante absoluto, **e ao lado dele mora
`time_zone`**, com o nome IANA da zona (`America/Sao_Paulo`). Os dois, e não um.
`timestamptz` sozinho diz *quando* o evento acontece e não diz *que horas o
cartaz da praça dizia*: um aparelho configurado em UTC renderizaria um encontro
das 9h como 12h, sem nada acusar, e o Brasil tem mais de uma zona.

**O que a tela mostra para evento que já aconteceu** é decidido no servidor, e
vem projetado em `status`:

| `status` | Quando | O que a tela diz |
|---|---|---|
| `upcoming` | `starts_at` no futuro | a data e a hora, com o fuso do evento |
| `happening` | entre `starts_at` e `ends_at` | `Acontecendo agora` |
| `ended` | passou de `ends_at` (ou de `starts_at`, quando não há fim) | `Encerrado`, junto da data |

Ele é calculado no servidor pela mesma razão pela qual o vencimento do preço da
`Loja` é: se a regra morasse no aplicativo, um aparelho com relógio errado ou
com build antigo chamaria de "próximo" um evento de três semanas atrás, e não
haveria como corrigir isso sem passar pela loja de aplicativos.

**E a listagem não mistura os dois sem dizer qual é qual.** O parâmetro `when`
tem default `upcoming`: a lista abre com o que ainda vai acontecer. Quem quiser
o que passou pede `when=past`, e aí a ordem padrão inverte, porque a pergunta
"o que houve" se responde do mais recente para trás. `when=all` existe e **não é
o default**, exatamente porque uma agenda que mistura passado e futuro em ordem
única é o defeito mais comum de agenda.

### 7. Nenhum UUID sai, e não por filtragem

> **Emenda 1, 23/09/2026 — esta seção foi REESCRITA, e a versão original estava
> errada.** Ela dizia que `network_events` e `network_event_photos` tinham
> `slug` como chave primária e que isso era o que garantia a regra. O
> argumento — "um `id uuid` seria uma coluna que nunca pode ser projetada,
> esperando alguém projetá-la por engano" — é bom, e **a conclusão não segue
> dele**. A `Loja` cometeu e corrigiu o mesmo erro no ADR-0024 e no commit
> `69c6a27`, e eu copiei o desenho dela antes de ela o corrigir.
>
> Duas razões, medidas, e a segunda é a que decide:
>
> 1. **O ADR-0010 item 6 proíbe UUID na SAÍDA PÚBLICA, não no esquema.** `pets`
>    e `professionals` têm `id uuid` primária com `slug` único ao lado. O engano
>    que o argumento teme já tem portão próprio —
>    `src/tools/portao-contrato-publico.ts` reprova `format: uuid` em operação
>    alcançável sem conta, e as duas leituras desta seção são alcançáveis sem
>    conta. Medo coberto por mecanismo não justifica torcer o esquema.
> 2. **Chave estrangeira sobre `slug` é proibida pelo critério 2 da BICHUS-19,
>    e por DOIS motivos** — o portão nomeia os dois: `slug` é *valor que o
>    usuário troca* **e** *valor que sai impresso*. O primeiro não sobrevive ao
>    argumento de que ninguém troca o slug de um encontro curado; **o segundo
>    sobrevive**: uma coluna que é ao mesmo tempo endereço público e chave que
>    liga as tabelas **entrega a junção junto com o endereço**.
>
> A isenção foi descartada porque o portão compara por **nome exato**: isentar
> `slug` o tornaria cego ao caso exato para o qual foi escrito.
>
> **O que muda:** `network_events` e `network_event_photos` ganham `id uuid`
> primária com `slug` único ao lado; `network_event_checkins` liga por
> `event_id` e a chave é `(event_id, user_id)`. **O contrato não muda em um
> campo sequer** — `slug` continua sendo a única chave da seção que sai em
> resposta, e o `id` nunca é projetado.
>
> **O que NÃO muda:** tudo o que este ADR decide sobre privacidade. O check-in
> continua sendo da pessoa e sem `pet_id`, a presença continua sendo um número,
> a foto continua sem autor. A identidade interna não afrouxa nenhuma das três
> — e a isca continua procurando **qualquer UUID** no corpo, o que agora vale
> para os `id` novos também.


`network_events` e `network_event_photos` têm **`id uuid` como chave primária e
`slug` único ao lado**, como `pets`, `professionals` e a vitrine da `Loja`. O
`id` é alvo das chaves estrangeiras da seção e **nunca é projetado**; o `slug` é
a única chave da seção que sai em resposta.

*(Este parágrafo dizia o contrário até a emenda 1 acima. O texto antigo afirmava
que `slug` era a chave primária das duas tabelas — e era isso que punha chave
estrangeira sobre `slug`, que é o que o critério 2 da BICHUS-19 proíbe.)*

`network_event_checkins` não tem `slug` próprio: ela é ligada por `event_id`, e a
chave é `(event_id, user_id)`. Ela tem `user_id uuid` e **nunca** é projetada —
existe para contar e para impedir o segundo check-in da mesma pessoa. Nenhuma
operação do contrato a lê linha a linha; a única leitura é `count(*)`.

## A prova negativa, e ela é uma isca e não uma frase

`tests/integration/rede-nao-liga-dois-pets.test.ts` monta o caso exato do
problema: **um tutor com dois pets**, os dois com `slug` público, o tutor com
check-in feito num evento com galeria. Depois varre **o corpo inteiro** das três
respostas públicas da seção e reprova se qualquer uma delas contiver o
`user_id`, o `pet_id`, o `slug` de qualquer um dos dois pets, o nome do tutor,
ou qualquer UUID.

A varredura é sobre o JSON serializado e não campo a campo, de propósito: um
portão que confere os campos que ele conhece não enxerga o campo que alguém
acrescentar amanhã, e é exatamente por campo a mais que uma resposta se afasta
do documento sem alarme.

A isca é exercida desligando a regra, rodando, vendo reprovar pelo nome do caso,
e religando — não por asserção sobre o código.

## Alternativas consideradas

| Opção | Prós | Contras | Por que não |
|---|---|---|---|
| Check-in por pet, lista pública | é o que o cliente descreveu, e é o que dá liga a um encontro de cachorros | publica o agrupamento que o ADR-0010 item 7 proíbe, no bairro da pessoa, num app de pet perdido | é o defeito, implementado |
| Check-in por pet, lista só com contagem | guarda "quais pets foram" para depois | a coluna existe e a regra vira disciplina de quem projeta; basta um `select *` | dado que não pode sair não deve ser guardado (minimização, art. 6º, III) |
| Lista visível só a quem fez check-in | parece fechada | check-in é grátis e não verificado: a porta tem um degrau | protege menos do que aparenta, e aparentar proteger é pior |
| Interruptor de visibilidade no check-in | devolve a escolha à pessoa | a escolha certa exige saber que o mesmo produto guarda pets perdidos | consentimento informado que não informa |
| Foto com autor | crédito a quem fotografou | dez fotos assinadas são dez nomes presentes, com imagem do lugar junto | reconstrói a lista por outro caminho |
| Coordenada do evento por CEP da praça | ordenação por distância | exige geocodificação, que o ADR-0006 proíbe e que não está contratada | e a distância nem é o que se pergunta de um evento de bairro |
| `starts_at` sem `time_zone` | uma coluna a menos | instante certo, hora de cartaz errada em aparelho fora do fuso, sem nada acusar | a hora do evento é hora de parede, e parede tem lugar |
| `status` calculado no aplicativo | uma coluna a menos na resposta | relógio errado ou build antiga chamam de "próximo" o que passou, e a correção passa pela loja de aplicativos | mesma razão do vencimento de preço da `Loja` |
| Criação pela comunidade já nesta fatia | é metade do que o cliente pediu | não há moderação, denúncia nem remoção em lugar nenhum do repositório, e o cliente já negou o equivalente no ADR-0011 emenda 1 | publicar sem nada entre a escrita e a publicação, sem caminho de retirada |

## Consequências

Fica mais fácil: auditar a seção. A pergunta *"o que um estranho aprende sobre
a Maria abrindo a Rede"* tem uma resposta só, e ela é *nada* — porque a Maria
não aparece. O corpo das três operações não tem ramo por chamador, então o
portão de contrato o confere sem precisar entender prosa.

Fica mais difícil, e é o preço: **a seção de comunidade não mostra a
comunidade.** Um encontro de cachorros em que não se sabe quem vai nem quem
esteve é mais pobre do que o cliente descreveu, e essa pobreza é deliberada.

Passa a ser irreversível na prática: ligar a lista de presença depois exige pedir
consentimento a quem já fez check-in sob a promessa implícita de que não
aparecia. Não é uma coluna a mais, é uma coleta nova.

### Fase seguinte, nomeada

Nada disto está implementado, e nenhum item é consequência automática deste ADR:

1. **Envio de foto pela comunidade**, com moderação antes da publicação, canal
   de denúncia e remoção. Depende do armazenamento de objeto na pilha de
   integração (`bichus-245-armazenamento-integracao`) estar mesclado, e da
   decisão do cliente sobre quem modera.
2. **Criação de evento pela comunidade**, que é o mesmo pacote de moderação, mais
   a decisão sobre o que acontece com um evento denunciado que já tem check-in.
3. **Prova social nominal sem lista**, que é o caminho para recuperar o que a
   decisão 2 custou: presença mútua entre pessoas que **ambas** confirmaram
   presença **e ambas** pediram para se ver, que é um fluxo de consentimento
   recíproco e não um interruptor. Continua sem publicar pet.
4. **Evento recorrente.** A massa tem encontros que na vida real se repetem toda
   semana, e o esquema de hoje os representaria como dez linhas.

---
DÉDALO — Arquiteto de Software
