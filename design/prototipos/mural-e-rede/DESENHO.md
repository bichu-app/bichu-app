# Mural e Rede — o desenho

**Data:** 19/10/2026 · **Protótipo:** `index.html` (abre no navegador, 320/375/412 dp)
**Substitui o Figma** por autorização do cliente de 23/09/2026 (a conta não tem cota).
**Isto não é ADR e não emenda nenhum.** Onde o desenho exigiria emenda, há uma pergunta na
seção 8 e o desenho parou ali.

---

## 0. O que mudou de nome depois do briefing

A correção do cliente chegou durante o trabalho e **inverteu** os nomes. O que vale:

| | Vale | Não vale mais |
|---|---|---|
| Barra de baixo | `Pets · Rede · **Mural** · Loja · AuAu` | Mural em primeiro |
| Seção reunida | **`Rede`** | `Comunidade` |
| Abas dela | **`Eventos`** e **`Comunidade`** | `Eventos` e `Rede` |

O resto do briefing continua: `Perto` deixa de ser seção, `Próximos`/`Encerrados` viram filtro,
`Meus pedidos` e `Minhas indicações` continuam só para quem tem conta.

**A inversão se paga sozinha na medida.** `Comunidade` pede **113,25 dp** num slot de **64,00**
da barra de baixo — reprova em 320, 375 *e* 412 dp. `Rede` pede 45,08 e cabe nos três. A parede
que recusou `Mensagens` (103,67 dp) é a mesma.

---

## 1. O que cada seção é

### `Mural` — a seção de publicações
A linha do tempo da pessoa. Mostra **o que as conexões dela publicaram**, mais recente primeiro.
Nas palavras dele: *"a seção de timeline, onde as publicações/notificações dos usuários que ele
segue e são amigos apareça"* e *"o menu onde o usuário vai fazer os posts, compartilhar suas
fotos em eventos"*.

- Publicação = **texto livre até 280 caracteres** + **uma foto opcional**.
- 280 não é escolha minha: é o teto que `publication_reports.publication_body` **já cobra**
  (`CHECK (char_length(publication_body) <= 280)`), e é o mesmo de `pets.care_notes`.
- **Texto livre, sem filtro de palavra no app** — literal dele: *"deixe o texto livre na
  timeline"*, *"quem modera vai ser o administrador, deve ir para a página de backoffice"*.
  O app oferece **denunciar** no `⋮` do próprio cartão, que é onde o dano está, e nada mais.
- Publicar é **ação de comunidade**: exige sessão **e** e-mail confirmado
  (`podeCriarNaComunidade`, `app/lib/telas/abas.dart:50`).

### `Rede` — eventos e quem atende bem
Absorve a seção `Perto`. Duas abas:

| Aba | O que é | Vem de |
|---|---|---|
| `Eventos` | os encontros da vizinhança | a `Rede` de hoje |
| `Comunidade` | profissionais, estabelecimentos e ONGs | a seção `Perto` de hoje |

---

## 2. As cinco coisas em duas abas mais filtro

Hoje são cinco abas em duas seções:

```
Rede   →  Próximos  |  Meus pedidos  |  Encerrados      (agenda_da_rede.dart:118)
Perto  →  Profissionais  |  Minhas indicações           (corpo_do_perto.dart)
```

O destino de cada uma:

| Hoje | Vai para | Por quê |
|---|---|---|
| `Próximos` | **filtro** `Quando → Próximos` (padrão) | mesma entidade (encontro), mesma rota, janela de tempo diferente |
| `Encerrados` | **filtro** `Quando → Encerrados` | idem |
| `Profissionais` | **aba `Comunidade`** | é o conteúdo da aba |
| `Meus pedidos` | **filtro** `Meu envolvimento → Só onde eu pedi` | ver abaixo |
| `Minhas indicações` | **porta**, não filtro | ver abaixo |

### `Meus pedidos` cabe no filtro, e `Minhas indicações` não cabe

Esta assimetria é o ponto difícil do desenho, e ela não é descuido.

**`Meus pedidos` vira filtro porque a entidade não muda.** A lista continua sendo de
**encontros**; o que o recorte faz é ficar só com os encontros em que você pediu para ir. O
cartão **já sabe** mostrar o estado do pedido — `_ItemDaAgenda` carrega
`pedido: EstadoDoPedido?` (`agenda_da_rede.dart`), e a agenda já pinta a pastilha. Nada precisa
ser inventado.

**`Minhas indicações` não vira filtro porque a entidade muda.** Uma indicação **em análise**
ainda não é um local do diretório: ela não tem ficha, não está na lista, e a operação que a lê é
outra (`MyDirectorySuggestionPage`). Filtrar a lista de locais por "as que eu indiquei" devolveria
**zero** justamente no caso que interessa — a que ainda está esperando revisão. Então ela vira
**porta**, no pé da aba `Comunidade`, e some sem sessão.

Fingir que as duas cabem no mesmo mecanismo seria um filtro que mente sobre o alcance, que é
exatamente o que `barra_de_listagem.dart` existe para impedir.

### A régua de cada uma, e ela é diferente de propósito

Já está decidido na árvore e o desenho **não** muda:

- **`Só onde eu pedi`** e **`Minhas indicações`**: régua é **sessão**. Ler o que eu já fiz não
  exige e-mail confirmado — quem indicou e depois trocou de e-mail continua tendo indicações na
  fila, e esconder a lista esconderia o trabalho dela mesma.
- **Os dois botões flutuantes** (`Marcar` e `Indicar`): régua é `podeCriarNaComunidade`
  (sessão **e** e-mail confirmado), porque escrever sobre terceiro cria trabalho humano de
  revisão e o servidor recusaria com `409 contact-channel-unverified`.

Sem sessão, nenhum dos dois **nasce desabilitado — não nasce.** Controle sem desfecho não se
desenha (`barra_de_listagem.dart`, "os três casos em que um controle não nasce").

---

## 3. O padrão de listagem, reaproveitado — inclusive onde ele manda não desenhar

Na `Rede` o padrão entra inteiro, como foi construído em
`feat/navegacao-mensagens-e-avatar` (`barra_de_listagem.dart`): gatilho de filtro **só ícone**,
48 dp, **antes** da busca, na mesma linha; a busca recebe 232,00 dp num corpo de 288 e 324,00
num de 380. `Aplicar` nasce desabilitado. A ordem mora na mesma folha. A ordem mostrada é a
**real**, não a pedida.

**No `Mural` a barra NÃO é desenhada**, e isso é o padrão sendo obedecido, não ignorado. As três
regras do componente, aplicadas:

1. **Busca** — não existe rota de busca de publicação. `busca: null` → o campo não é desenhado.
   Campo de busca que mente sobre o alcance é pior que campo ausente.
2. **Ordem** — uma linha do tempo tem uma ordem só (mais recente primeiro). Uma opção não é uma
   escolha → o controle não é desenhado.
3. **Filtro** — não há grupo com opção que o servidor aceite. Folha vazia é um toque que termina
   em nada.

Com os três ausentes, o componente devolve `SizedBox.shrink()` sozinho. **No dia em que o servidor
oferecer um recorte de linha do tempo, a barra aparece no lugar padrão, sem desenho novo.**

---

## 4. O botão flutuante, e o que ele comprou

Decisão dele de 19/10: criar sai da barra de cima e vira botão flutuante no corpo, canto direito,
invadindo os últimos 72 dp da lista.

| Tela | Botão | Glifo |
|---|---|---|
| Mural | `Publicar` | `Icons.post_add` |
| Rede · Eventos | `Marcar` | `Icons.more_time` (já escolhido e aprovado) |
| Rede · Comunidade | `Indicar` | `Icons.group_add` (já escolhido e aprovado) |

**Esta decisão é o que torna o resto possível, e vale dizer por quê.** Com `criar` na barra de
cima o arranjo era hamburguer 64 + criar 64 + sino 48 + foto 48 = 224 de 320, e o título recebia
**96,00 dp** — `Rede` (138,32 dp a 200 %) saía com reticência. Com `criar` fora, o orçamento vai
a **160,00 dp** e `Rede` cabe inteiro, com 21,68 dp de folga. *Medido, não calculado.*

Há um segundo motivo, independente: com duas abas na `Rede` existem **duas** ações de criar
diferentes. Um slot só na barra de cima não comporta duas — o botão flutuante troca com a aba.

---

## 5. Privacidade: o que o desenho aplica, e a citação de cada regra

### 5.1 O Mural só mostra conexão aceita — e é isso que libera a foto

A **Emenda 3 do ADR-0010 (19/10/2026)** abriu a foto de perfil numa superfície só, a conversa
mediada, *"e apenas quando as duas já aceitaram conexão"*. O briefing perguntou por que no Mural
seria diferente da conversa.

**Não é diferente. É o mesmo predicado, satisfeito por construção.**

A conversa precisou de um predicado porque ela **pode** ter do outro lado alguém que não é
conexão: o achador sem conta, o estranho que escaneou a plaquinha. A emenda explica por quê:

> *"O golpe do falso achador é praticado por um **estranho**... Esse estranho não é conexão
> aceita de ninguém — se fosse, o tutor já o conheceria — e para ele a foto continua não saindo."*

O Mural **não tem esse outro lado**. Por definição ele contém só publicações de conexões aceitas.
Todo autor que aparece já está dentro do conjunto que a Emenda 3 autoriza. A foto do autor é a
mesma derivada que a emenda nomeia: **`thumb` 176 × 176**, não a `card` de 512.

**A consequência operacional, e ela é uma regra e não uma observação:** no dia em que o Mural
mostrar qualquer cartão de autor que **não** seja conexão aceita — uma sugestão, uma descoberta,
um "talvez você conheça" —, esse cartão **não pode trazer foto nem apelido**. Não há cartão assim
neste desenho, de propósito.

### 5.2 Nada de pet no cartão, e nada de timeline para estranho

**Emenda 2 do ADR-0010 (19/10/2026)**, a tabela "o que NÃO sai":

> | timeline, publicação, curtida, contador | ele recusou a timeline nesta frase |
> | nome, miniatura, slug ou link de pet | o item 7, que esta emenda abre **só** para a contagem |

E o item 7 original: *"outros pets do mesmo tutor, e qualquer coisa que permita agrupá-los"*.

O desenho aplica:

- **Nenhum cartão do Mural marca, nomeia ou liga um pet.** Texto livre e foto, e nada mais. Uma
  publicação que *ligasse* a ficha de um pet agruparia pets por tutor, que é o que o item 7
  proíbe. Uma foto que a pessoa escolheu publicar não é ficha de pet — mas a diferença é fina o
  bastante para virar pergunta (seção 8, pergunta 3).
- **O perfil de quem não é conexão continua com nome + contagem de pets + contagem de conexões,
  e nada da linha do tempo.** O desenho não cria caminho para a timeline de ninguém a partir do
  perfil.
- **Nenhum UUID em lugar nenhum.** O endereço da publicação é o `publication_ref` opaco de 22
  símbolos que `publication_reports` já cobra (`CHECK (publication_ref ~ '^[A-Za-z0-9_-]{22}$')`),
  na mesma forma de `users.public_ref`. Item 6 do ADR-0010, sem exceção.

### 5.3 Nada de "publicações perto de você"

**ADR-0006: não há geocodificação.** O Mural não tem recorte geográfico nenhum — não por
esquecimento, mas porque qualquer um deles seria coordenada disfarçada. Onde a `Rede` precisa de
lugar, ela usa **cidade informada**, que é como o produto inteiro trabalha.

### 5.4 A aba `Eventos` não contraria a ADR-0025

A **ADR-0025 está suspensa e não revogada**, e a emenda 2 dela diz que, quando check-in e galeria
voltarem, *"as decisões 1, 2 e 3 voltam valendo como estão escritas"* — entre elas a decisão 2,
**a presença é um número e nunca uma lista de pessoas**.

O desenho da aba `Eventos` **não desenha presença nenhuma**: nem lista, nem número, nem galeria,
nem autor de foto. O cartão mostra título, quando, onde e — só para quem tem conta — o estado do
**próprio** pedido. Não há nada ali que a decisão 2 precise governar, e nada que a contrarie
quando ela voltar.

O ponto no mapa continua como a **Emenda 1 do ADR-0010** o deixou: sai em operação própria e
autenticada, e a agenda alcançável sem conta não o carrega.

---

## 6. As imagens, e a derivada de cada uma

Peso de imagem é medido neste projeto. `cacheWidth` é obrigatório e a geometria da derivada é
**por propósito** (`src/modules/media/domain/derivadas.ts`).

| Onde | Pinta | Derivada | Por quê |
|---|---|---|---|
| Foto de quem publicou, no cartão | 40 dp (120 px a 3×) | **`thumb` 176 × 176** de `user_photo` | **Nenhuma derivada nova.** É literalmente a que a Emenda 3 nomeia para `photo_icon_url`, pelo mesmo motivo: a `card` de 512 seria 4,27× mais dado do que a célula pinta, dez vezes por tela |
| Foto da publicação, no cartão | largura do corpo: 288 a 380 dp (864 a 1140 px a 3×) | **`card` 1024 × 1024** | reusa a geometria de `DERIVADAS_DA_VITRINE_DO_USUARIO`. Em 412 dp fica a 0,90× do ideal — a mesma folga que o projeto **já aceitou** para o `card` 1024 do encontro ("~984 px... é o tamanho de hoje, e ele está certo para ESTE uso") |
| Foto da publicação, aberta | tela cheia | **`card` 1024 × 1024** | a mesma. É "a única que a pessoa olha grande" |
| Capa do encontro, no cartão | 16:9 na largura do corpo | **`card` 1024 × 576** | já existe, não muda |
| Miniatura do local | 56 dp | **`thumb` 176** | já existe, não muda |

**O que falta no servidor:** um `purpose` novo (`user_publication`) reaproveitando
`DERIVADAS_DA_VITRINE_DO_USUARIO`. **Nenhuma largura nova** — e isso é de propósito: acrescentar
tamanho é o que aquele arquivo existe para tornar possível, mas aqui não foi preciso.

**Não proponho `thumb` 320 para publicação.** Ela só serviria a uma grade, e não há grade no
Mural. Derivada guardada sem superfície que a pinte é peso sem finalidade.

---

## 7. O que o Mural precisa do servidor e não existe

Levantado na árvore de `f8c74714` (a união das quatorze frentes). Sem migração e sem contrato
escritos — é lista, não implementação.

### 7.1 A tabela não existe

`user_publications` **não existe**. Ela aparece só em comentário, em três lugares, e os três
dizem a mesma coisa:

- `src/shared/db/schema.ts:2146` — *"SEM chave estrangeira: `user_publications` e de outra fatia
  e nao existe"*
- `migrations/20261018000032_...:90` — *"A tabela de publicacoes (`user_publications`) e de outra
  fatia e NAO EXISTE nesta base -- medido na lista de tabelas"*
- `migrations/20261018000032_...:643` — *"a timeline nao foi construida e a branch longa de
  comunidade nao foi mesclada (decisao do cliente)"*

### 7.2 A linha órfã é possível hoje, e está declarada

`publication_reports.publication_id` entrou **sem chave estrangeira**. O `ALTER` que a liga está
escrito, comentado, no fim da própria migração:

```sql
ALTER TABLE publication_reports
  ADD CONSTRAINT publication_reports_publicacao
  FOREIGN KEY (publication_id) REFERENCES user_publications (id) ON DELETE SET NULL;
```

E a consequência está dita em voz alta no arquivo: *"até a fatia da publicação pousar,
`publication_reports.publication_id` pode apontar para uma publicação que não existe — linha órfã
é possível, e nada no banco a impede."*

A denúncia **sobrevive** a isso porque o texto denunciado vive congelado em `publication_body`,
na própria denúncia. Quem construir a fatia roda o `ALTER` de uma linha.

### 7.3 A lista, por ordem de quem destrava quem

| # | Falta | Observação |
|---|---|---|
| 1 | **A tabela `user_publications`** | `id`, `author_user_id`, `public_ref` (22 símbolos, forma que `publication_reports` já cobra), `body` (≤ 280), `image_id` anulável, `created_at`, exclusão lógica. Destrava tudo abaixo |
| 2 | **O `ALTER` da chave estrangeira** | uma linha, já escrita, já comentada, já justificada |
| 3 | **Operação de linha do tempo** | não existe nenhuma no contrato. Autenticada, paginada, só publicação de conexão **aceita**, com o predicado no `WHERE` da consulta e não num `if` de camada acima (ADR-0021) |
| 4 | **Operação de publicar** | exige conta. O app esconde a porta sem e-mail confirmado, mas **a trava de verdade tem de ser do servidor** — hoje nem `criar encontro` nem `indicar` exigem `email_verified` em `src/`, e essa metade da regra existe só no app |
| 5 | **Operação de apagar a própria publicação** | sem ela, a pessoa publica e não desfaz |
| 6 | **`purpose = 'user_publication'`** no catálogo de imagens | reusando `DERIVADAS_DA_VITRINE_DO_USUARIO`; teto de 5 MiB, que já é o da aplicação inteira |
| 7 | **`ModerationOrigin` ganha `publication`** | já previsto no recado da migração, item (C) |
| 8 | **A visão `fila_de_moderacao` com a perna `publication`** | a migração **já tem o SQL dela escrito**, comentado, com `target_body = d.publication_body` |
| 9 | **A contagem de conexões** | o Mural vazio e o "sem conexão" distinguem um do outro por ela. A Emenda 2 a trata como mostrável; confirmar que sai também para o próprio dono |

### 7.4 Aviso de publicação nova: não prometer

Se o desenho tiver notificação de publicação nova, **ela depende de coisa que não funciona
hoje**: o envio de push está bloqueado em produção por falta de permissão da conta de serviço, e
não chega nenhum no iPhone dele. O sino está na barra, mas a caixa de notificações vive em
`feat/caixa-de-notificacoes-e-comunicado`, **não mesclada**, e a rota de contagem **nem está no
contrato**. O protótipo mostra o sino com o pontinho; **o desenho não promete aviso em lugar
nenhum do texto**, e o estado vazio diz "quando alguma publicar, aparece aqui" — nunca "a gente
te avisa".

---

## 8. As perguntas que sobraram para o cliente

Cada uma parou um pedaço do desenho. Nenhuma foi resolvida por conta própria.

**1. "Seguir" ou "conexão"? — e esta é a que mais pesa.**
Ele usou as duas palavras na mesma conversa: *"os usuários que ele **segue** e são **amigos**"*.
O produto tem **uma** coisa só: `user_connections`, **simétrica com aceite**, 5 operações no
contrato. O Mural deste desenho é inteiramente sobre conexão.
Se ele quiser **seguir assimétrico** (eu vejo você, você não me vê), isso é **objeto novo**:
tabela nova, operações novas, e uma análise de privacidade inteira — porque "quem me segue" é
exatamente a lista que o plano 4-B mandou nunca existir e que o portão
`sem-lista-de-conexoes.test.ts` reprova.
*Pergunta:* **o Mural mostra só quem é conexão aceita (simétrica), ou você quer também "seguir"
sem aceite?**

**2. A timeline foi dada por encerrada por escrito. Isto reabre?**
A migração `20261018000030` registra: *"uma timeline de quem você segue É a lista de presença com
hora... **Encerrado, não se reabre**"*. A Emenda 2 do ADR-0010, de 19/10, repete que a timeline
*"não existe no produto"*. A decisão do Mural, do mesmo dia, cria a timeline.
Não é contradição que eu possa resolver — é dele, e é posterior.
*Pergunta:* **confirma que o Mural reabre o que aquela migração encerrou?** Se sim, o ADR-0025 e
a Emenda 2 precisam de uma nota, e **eu não escrevo ADR** — quem leva é você.
O que o desenho faz para não repetir o problema que aquele texto temia: **não há check-in, não há
lista de presença, não há autor de foto em galeria de evento, e a publicação não liga pet a
tutor.**

**3. Foto de pet na publicação: pode?**
A Emenda 2 diz que não sai *"nome, miniatura, slug ou link de pet"* — e diz **nem para quem já é
conexão**. Mas ele descreveu o Mural como *"compartilhar suas fotos em eventos"* e disse que uma
conexão *"vê as fotos que ela subiu do seu pet"*.
A leitura do desenho: **a Emenda 2 fala da superfície do perfil (`getPersonProfile`)**, e uma foto
solta que a pessoa escolheu publicar não é ficha de pet. Por isso o desenho **permite foto livre**
e **proíbe marcar/ligar um pet**.
*Pergunta:* **confirma que a publicação pode ter foto do pet, desde que não marque nem ligue a
ficha dele?**

**4. Curtir e comentar existem?**
Não inventei nenhum dos dois — o cartão do protótipo não tem. A Emenda 2 cita *"curtida,
contador"* na lista do que não sai para estranho, o que sugere que ele pensou neles, mas ninguém
decidiu que existem.
*Pergunta:* **o Mural tem curtir e comentar na v1, ou só publicar, ver e denunciar?** Cada um
deles é tabela, operação, moderação e mais uma pergunta de privacidade.

**5. As duas abas a 200 % de texto.**
`Eventos` + `Comunidade` cabem em 320 dp até 130 % de escala. A **200 %**, `Comunidade` pede
221,24 dp num slot de 144,00 e **corta**. Para comparação: as **três** abas de hoje já cortam
**duas** em 320 dp a **100 %** — ou seja, o arranjo novo é melhor do que o que está no ar em toda
escala.
*Pergunta:* **aceita o corte a 200 % (com o nome inteiro indo para o leitor de tela), ou prefere
a `TabBar` rolável**, em que cada aba fica com a largura do próprio texto e elas deixam de ocupar
a tela toda? É uma linha de código, e muda o desenho.

**6. `Mural` como título corta em 320 dp.**
Na barra de baixo `Mural` cabe com folga (50,90 de 64,00). Como **título da página** ele pede
**172,90 dp** num orçamento de **160,00** e corta por **12,90 dp** em 320 dp a 200 % — exatamente
o que acontecia com `Perto`, e pelo mesmo motivo: cinco letras. Em 375 e 412 dp sai inteiro.
A reticência **não resolve**: `Mura…` mede os mesmos 172,90 dp. O corte real entrega `Mur…`.
*Pergunta:* **aceita `Mur…` em 320 dp a 200 %** (com `Mural` inteiro no leitor de tela), como já
foi aceito para `Perto`?

**7. Contagem de conexões para o próprio dono.**
O estado "sem conexão nenhuma" é diferente do estado "ninguém publicou", e o app precisa da
contagem para saber qual desenhar. A Emenda 2 libera a **contagem** no perfil de outra pessoa;
ela não diz explicitamente que o dono recebe a dele.
*Pergunta:* **o dono vê a própria contagem de conexões?** (A Emenda 2 já tem uma pendência irmã
anotada: *"'conexões' no perfil de outra pessoa é o número, e não a lista. Confirma?"*)

---

## 9. Duas coisas que achei e não são desenho

**9.1 As emendas 2 e 3 do ADR-0010 não estão em `development`.**
Elas existem em `feat/perfil-de-terceiro-e-conexao` (`108b6832`) e
`feat/foto-na-conversa-entre-conexoes`, **não mescladas**. Quem abrir
`adr/ADR-0010-privacidade-e-lgpd.md` na `development` hoje lê um arquivo com **emenda 1 só** e
conclui que a contagem de pets e a foto na conversa continuam proibidas.

**9.2 Dois números de largura em circulação, e um deles não reproduz.**
O comentário de `casca_com_abas.dart` registra `Mensagens` = 86,66 dp e `AuAu` = 40,89 dp. Na
bancada do próprio projeto — a que reproduz a tabela versionada `larguraMedidaPelaUx` **casa por
casa** (`Pets` 39,20 · `Rede` 45,08 · `Perto` 47,95 · `Loja` 37,15 · `Perfil` 47,47) — os mesmos
rótulos dão **103,67** e **49,33**. A razão entre os pares é constante (~1,2), então são duas
bancadas diferentes, não um erro de digitação.
**O veredicto não muda em nenhuma das duas** (`Mensagens` reprova, `AuAu` passa), então nada que
foi decidido está errado. Mas só uma delas deve ser citada daqui para frente, e a que reproduz a
tabela versionada é a bancada de `casca_de_cinco_secoes_test.dart`.

---

## 10. A bancada, para quem quiser refazer

Nenhum número deste documento saiu do HTML. Todos saíram de um teste de widget descartável,
rodado em `app/` com `flutter test`, e apagado depois:

- `FontLoader('Inter')` com os quatro arquivos reais de `assets/fonts/` — sem isso o ambiente de
  teste usa fonte sintética de largura uniforme e **todo número sai errado**;
- `tester.view.physicalSize = Size(largura * 3, …)`, `devicePixelRatio = 3`;
- `MediaQuery(textScaler: TextScaler.linear(2))` para os 200 %;
- barra de baixo: `NavigationBar` de cinco destinos com `BichuTheme.claro`;
- barra de cima: `AppBar` com `toolbarHeight: 64`, `leadingWidth: 64`, **`titleSpacing: 0`** e as
  ações reais (sino 48 + foto 48) — sem o `titleSpacing: 0` o orçamento cai de 160,00 para 128,00
  e todo veredicto muda;
- abas: `TabBar` não rolável dentro de um corpo com margem de 16 dp, como em
  `agenda_da_rede.dart:483`;
- largura pedida por `RenderParagraph.getMaxIntrinsicWidth`, linhas contadas por
  `getBoxesForSelection` agrupando por `top` — que é como o portão do projeto já conta.
