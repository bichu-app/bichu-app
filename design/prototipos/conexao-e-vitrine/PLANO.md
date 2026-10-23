# Perfil da pessoa, conexão de vizinhança e vitrine de fotos — desenho e plano

**Isto é desenho. Não há código de produção nesta branch.**
Sem contrato, sem migração, sem rota, sem tela. O que existe aqui é o protótipo HTML
e este plano, para aprovação **fatia por fatia**.

- **Protótipo:** `workspace/artefatos-site/app-conexao-e-vitrine/index.html`
  (caminho durável; cópia rastreada ao lado deste arquivo)
- **Branch de integração da frente:** `feat/comunidade-perfil-e-conexao`
- **Partiu de:** `origin/development` em `e636f69c`, depois de `git fetch`
- **Lente do desenho** (palavras do cliente, 18/10): *"é uma plataforma de pet, vizinhança,
  comunidade, por isso essa pagina do perfil e de conexão é importante"* — perfil e conexão
  são **infraestrutura de confiança**, não rede social genérica.

---

## 0. Uma correção de premissa, medida

O briefing dizia que `users.photo_image_id` **já existe** na árvore. **Em `origin/development`
ele não existe.** Conferido na mão, não só por agente:

- `grep -rn photo_image_id` no worktree inteiro: **zero ocorrências**
- `users` tem 20 colunas e nenhuma de imagem (`migrations/20260917000001_identidade-e-sessao.sql:44`)
- `upload_intents.kind` aceita só `pet_photo`, `found_report_photo`, `finder_photo`
- o schema `Me` do contrato não tem campo de foto

**Onde ele existe:** no commit `1d2ccac1` da branch
**`feat/imagem-do-profissional-e-foto-do-usuario`**, que **não está mesclada** em
`development` (`git merge-base --is-ancestor` → falso). Ela entrega, para a pessoa:

| Coisa | Valor medido |
|---|---|
| Coluna | `users.photo_image_id uuid REFERENCES catalog_images ON DELETE SET NULL`, índice único parcial `users_foto_unica` |
| Propósito na esteira | `user_photo`, terceiro valor novo em `catalog_upload_intents.purpose` |
| Derivadas | `DERIVADAS_DA_FOTO_DE_USUARIO` = `card` 512×512, `thumb` 176×176 |
| Selo | **não é imagem**: é `users.email_verified_at`, lido como `Me.email_verified`, desenhado pelo cliente sobre a moldura |
| Visibilidade | **só o dono**, em `GET /v1/me` |
| Esteira nova | **nenhuma** — reusa `catalog_upload_intents`/`catalog_images` |

**Consequência para o plano, e ela é grande:** a fatia 1 ("a pessoa subir e ver a própria
foto") **não é tela sobre servidor pronto na `development`** — é tela sobre servidor que
ainda precisa chegar lá. **A primeira dependência desta frente é mesclar
`feat/imagem-do-profissional-e-foto-do-usuario` em `development`.** Enquanto isso não
acontecer, qualquer fatia desta frente constrói sobre coluna que a base não tem.

O comentário que essa migração deixou em `users.photo_image_id` já antecipa exatamente a
decisão que ele está tomando agora, e vale citar porque é a prova de que a fronteira foi
desenhada de propósito:

> *"Visivel SO PARA O DONO: ela sai em GET /v1/me e em nenhuma outra resposta. Nao ha coluna
> de visibilidade para terceiros, e a ausencia e a decisao: o ADR-0025 item 2 proibe avatar na
> Rede por nome e o contrato proibe foto de perfil em Conversation.participants, entao mostrar
> a outros e decisao do cliente e nao de implementacao."*

---

## 1. MAPA DE PRIVACIDADE — decisão por decisão

**Princípio que reduz o tamanho do mapa:** nesta frente **nenhuma superfície de pessoa é
alcançável sem conta**. Não há perfil público de pessoa, em nenhum estado. Isso mantém os
dez itens do ADR-0010 intactos para a superfície pública e reduz as emendas necessárias de
muitas para **três**.

### 1.1 ADR-0025 item 2 — `adr/ADR-0025-a-rede-nao-tem-lista-de-presenca.md`

**O que ela diz, literal:** a presença num encontro é um número, e
*"não existe campo com pessoas, em forma nenhuma: nem nome, nem primeiro nome, nem apelido,
nem `slug`, nem avatar, nem contagem por bairro."*

**Mecanismo que a sustenta:** `src/modules/network/domain/encontro-da-rede.test.ts:337`
reprova se `user_id`, `display_name`, `avatar` ou `pet_` aparecer na projeção da Rede.
O ADR está **suspenso e não revogado** (emenda 2, 23/09) porque o check-in e a galeria
saíram da versão; o desenho das decisões 1, 2 e 3 volta valendo quando eles voltarem.

**Esta frente contraria?** **Não, como eu a desenhei.** O avatar **não** entra na Rede,
e a projeção do encontro não muda em campo nenhum. O conflito só nasce se ele quiser
"quem eu conheço também vai" na tela do encontro.

**O que ela custa ao desenho:** o sinal de confiança *"estiveram nos mesmos 2 encontros"*
(tela 5 do protótipo) é calculado **no servidor, entre duas contas que já se conectaram**,
e sai como **número** no perfil, nunca como nome na Rede. É a leitura mais estreita que
entrega o valor sem tocar a projeção do encontro.

**Texto proposto, para quando ele quiser presença nomeada na Rede** (emenda 3; **não
escrevi no ADR, por decisão dele**):

> **Emenda 3 — presença nomeada entre conexões, e só entre elas.** A decisão 2 continua
> valendo para toda leitura do encontro: `checkin_count` segue sendo um inteiro e a projeção
> pública do encontro não ganha campo de pessoa. **Abre-se uma leitura nova, própria e
> autenticada** — `GET /v1/network/events/{eventSlug}/connections` — que devolve **somente**
> as pessoas que satisfazem as três condições ao mesmo tempo: (a) fizeram check-in neste
> encontro, (b) estão **conectadas por aceite mútuo** a quem chama, e (c) nenhuma das duas
> bloqueou a outra. A projeção é a de pessoa (item 1.3 abaixo) e nada além dela.
> Isto é o item 3 da *Fase seguinte* deste ADR implementado como ele foi escrito —
> consentimento recíproco, não interruptor — e **não** é a lista de presença que a decisão 2
> recusou: quem não é conexão continua vendo só o número. O custo que permanece pago: duas
> pessoas conectadas que confirmam presença com dois pets cada uma **ainda não** podem
> agrupar pet e evento, porque `network_event_checkins` continua **sem `pet_id`** e a
> decisão 1 não é tocada. A isca `rede-nao-liga-dois-pets` volta com o check-in e passa a
> cobrir também esta leitura nova.

### 1.2 ADR-0010 item 7 — `adr/ADR-0010-privacidade-e-lgpd.md`

**O que ela diz, literal:** a rota pública jamais exibe
*"outros pets do mesmo tutor, e qualquer coisa que permita agrupá-los"*, e o item é
*"requisito de aceite e vale como critério de reprovação em revisão de PR"*. O ADR-0025
registra que ele *"está escrito por superfície, não por chamador"*.

**Esta frente contraria?** **Sim, e é o conflito central.** Um perfil de pessoa que lista
os pets dela **é** o agrupamento, e o perfil é uma superfície.

**Como o desenho reduz o conflito ao mínimo**, em vez de pedir uma exceção larga:
quem **não** é conexão vê *"2 cães"* — contagem e espécie, sem nome, sem `slug`, sem foto,
sem link. Isso sustenta a confiança ("é tutora de verdade") sem entregar dois animais
identificáveis ligados a um nome e a um bairro. Só quem **passou por um aceite** vê os nomes.

**Texto proposto da emenda:**

> **Emenda 2 ao ADR-0010 — o agrupamento de pets no perfil autenticado da pessoa.**
> O item 7 continua valendo **sem exceção** para toda superfície alcançável sem conta:
> `/t/<codigo>`, `/@<slug>`, `/cartaz/<token>`, a listagem pública de perdidos e qualquer
> JSON que as sirva. **Abre-se uma exceção de escopo fechado**, e ela é regra e não
> permissão: na leitura autenticada do perfil de uma pessoa, os pets dela aparecem
> **nomeados, com miniatura e com link para a própria página do pet, apenas a quem está
> conectado a ela por aceite mútuo**. A quem está autenticado e **não** conectado, os pets
> aparecem **somente** como contagem por espécie (`{"cao": 2}`), sem nome, sem `slug`, sem
> imagem e sem identificador de qualquer tipo.
>
> **Por que a regra não se aplica a esta leitura:** o item 7 existe porque o agrupamento
> entregue a um desconhecido, numa superfície permanente e indexável, é o insumo de quem
> quer levar um animal. Aqui o agrupamento é entregue a **uma pessoa específica que a
> titular aceitou**, numa superfície que exige conta, não é indexável e **não existe para
> quem não tem conta**. O consentimento é o mecanismo, e ele é verificável: a aresta de
> conexão é a prova, e desfazê-la retira o acesso na leitura seguinte.
>
> **O que continua proibido, e vale como reprovação em revisão:** nenhuma leitura de perfil
> de pessoa é alcançável sem conta; nenhuma delas devolve `user_id`, `pet_id`, `case_id` nem
> qualquer UUID (item 6 permanece sem exceção); nenhuma devolve telefone, e-mail, CEP,
> endereço, número de residência ou coordenada de qualquer precisão (itens 1, 2 e 4);
> nenhuma devolve o sobrenome (item 3); e a contagem por espécie **não** é quebrada por raça,
> porte, idade ou qualquer atributo que estreite o conjunto até identificar o animal.
>
> **Cláusula acrescentada em 18/10, e ela APERTA o teto do ADR-0010 em vez de afrouxá-lo:**
> o teto geográfico do item "bairro e cidade" continua valendo como **máximo absoluto**, e
> dentro dele a leitura de perfil de pessoa é mais estreita — **a quem não está conectado sai
> só a cidade**, e o bairro sai apenas a quem está conectado por aceite mútuo. Bairro é o que
> estreita a residência a algumas quadras, que é o argumento registrado no próprio ADR-0025.
>
> **Prova negativa exigida:** uma isca que monte um tutor com dois pets públicos e varra o
> **corpo inteiro** da leitura do perfil nos quatro estados, reprovando se o estado
> *não conectado* contiver `slug` de pet, nome de pet ou qualquer UUID. Varredura sobre o
> JSON serializado e não campo a campo, pela mesma razão do ADR-0025: portão que confere os
> campos que conhece não vê o campo que alguém acrescentar amanhã.

### 1.3 O contrato da conversa mediada — `api/openapi.yaml`, dois pontos

**O que ele diz, literal, nos schemas `FinderConversation` e `Conversation`, com texto
idêntico nos dois:**

> *"Primeiro nome ou apelido. **Nunca** sobrenome completo, telefone, e-mail nem foto de
> perfil."*

`participants[]` tem exatamente dois campos — `role` (`tutor|finder|system`) e
`display_name` — com `required` nos dois. A despersonalização mora no **domínio**
(`src/modules/messaging/domain/conversa-mediada.ts:152`), que é o único ponto por onde as
duas vistas passam, e não na tela.

**Esta frente contraria?** **Não.** O avatar **não** entra na conversa mediada, e eu
recomendo que **não entre nunca**. Três razões: (a) o achador pode não ter conta, então o
canal é assimétrico por natureza e pôr rosto de um lado só desequilibra; (b) a conversa
existe sob a sombra do golpe do falso achador, e rosto é insumo de engenharia social;
(c) é o canal que **atravessa o bloqueio** (item 2.1), e um canal que atravessa bloqueio é
o último em que se deve pôr identificação.

**Nenhuma emenda é pedida aqui.** Se ele quiser abrir, é pedido separado, e a emenda teria
de reescrever os dois pontos do contrato **e** o domínio, não só um deles.

### 1.4 A projeção de pessoa que já existe — D53, e ela é o alicerce

Medido em `api/openapi.yaml`, schema `AdminJoinRequest.requester`, e registrado em
`adr/ADR-0027-backoffice-construido-pelo-squad.md:1062` como **D53**: a única leitura de
pessoa do produto hoje tem **três campos e `additionalProperties: false`**:

| Campo | Regra medida |
|---|---|
| `display_name` | nulável; *"o servidor **nunca** preenche o nulo com o e-mail nem parte dele"* |
| `member_since` | `^[0-9]{4}-[0-9]{2}$` — ano e mês, *"e nada mais fino"* |
| `email_verified` | *"só o booleano, nunca o endereço nem a data"* |

**O desenho cresce sobre isto, e é a melhor notícia do mapa:** a projeção de pessoa desta
frente é **D53 + `photo` + os quatro sinais de confiança + bairro/cidade**, e nada mais.
Ela continua `additionalProperties: false`. O que o cliente está aprovando, em termos de
campo, é **um campo de imagem e quatro inteiros** sobre uma forma que ele já aprovou.

### 1.5 Retenção — ADR-0010 e ADR-0007

**ADR-0007 já cobre a imagem** e não precisa de emenda: original enquanto a entidade
existir, expurgo definitivo 30 dias depois da exclusão, job nosso e não regra do provedor,
chave da derivada pública com 128 bits aleatórios, trocar a foto gera chave nova e apaga a
antiga. A vitrine herda isso inteiro.

**O que falta na tabela de retenção do ADR-0010 são três linhas.** Texto proposto:

> | Dado | Retenção | Observação |
> |---|---|---|
> | Conexão aceita | enquanto as duas contas existirem | desfazer apaga a aresta na hora; a trilha de auditoria guarda que houve aresta, não quem |
> | Pedido de conexão pendente ou recusado | **30 dias** | o pendente expira; o recusado é guardado **apenas** como contador para o descanso de 90 dias e nunca é projetado a ninguém |
> | **Bloqueio** | **enquanto quem bloqueou quiser** — não expira | é o único registro desta frente que **sobrevive à exclusão da conta do bloqueado**, por 24 meses, para que uma conta nova com o mesmo e-mail não reabra o canal; é a mesma família da trilha de auditoria |
> | Fotos da vitrine | ver ADR-0007 | expurgo 30 dias após a remoção ou a exclusão da conta |
> | Denúncia de pessoa ou de foto | **24 meses** após resolvida | prova de que houve resposta, pela mesma razão das mensagens da conversa |

E uma linha nova na tabela de **bases legais**:

> | Perfil autenticado, conexão entre pessoas e vitrine de fotos | **consentimento** (art. 7º, I), por opt-in explícito a cada aceite de conexão e a cada envio de foto, revogável desfazendo a conexão ou removendo a foto |

**Lacuna separada que encontrei e que não é desta frente:** o ADR-0010 afirma que
`DELETE /v1/me` e `POST /v1/me/data-export` *"existem desde o MVP"*. O `DELETE` existe e tem
prova (`tests/integration/expurgo-de-conta-conclui.test.ts`). **Não encontrei rota de
portabilidade de dado do titular.** Relato e não conserto.

### 1.6 ADR-0011 e ADR-0023 — precedentes a favor, não conflitos

- **ADR-0011 emenda 1** (aceita em 21/09): a criação de perfil pela comunidade foi
  **negada** e trocada por **convite com aceite**, porque *"publicar dado pessoal de
  terceiro sem consentimento é problema de lei e não de produto"*. É o precedente direto do
  modelo simétrico, e dá a ele o **canal de remoção por oposição** que os termos desta
  frente precisam (item 2.3).
- **ADR-0023 §3** dá o padrão de **lista fechada** para valor novo em enum — é como os
  motivos de denúncia devem entrar.
- **ADR-0024** dá o desenho de chave: **`id uuid` primária, endereço público `slug` ao
  lado, nenhuma FK sobre o endereço público.** Toda tabela nova desta frente segue isso sem
  discussão.

---

## 2. OS SEIS ITENS OBRIGATÓRIOS

### 2.1 Bloquear

Unilateral, silencioso, aplicado na **leitura do servidor** — nunca num `if` de tela, pelo
argumento que o ADR-0025 já escreveu: *"enquanto o dado sair da API, ele sai para qualquer
cliente, inclusive o que ninguém escreveu."* O bloqueado recebe **404 idêntico** ao de
perfil inexistente: mesmo corpo, mesmo código. Um 404 diferente é um oráculo, e descobrir
que foi bloqueado é o que gera retaliação.

Bloquear **desfaz a conexão e apaga os pedidos pendentes nas duas direções**, em silêncio.
Desbloquear **não** devolve a conexão.

**A exceção que ele precisa decidir, e eu recomendo aceitar:** o bloqueio **não** fecha a
conversa mediada de um caso de pet **aberto**. A alternativa é um cachorro que não volta
porque duas pessoas se desentenderam. A conversa mediada já redige telefone, e-mail e
endereço, já rotula os participantes como `Tutor`/`Quem achou` e já proíbe foto por extenso
em dois pontos do contrato — é o canal mais blindado do produto, e é por isso que é o único
que deve atravessar.

### 2.2 Denunciar pessoa e denunciar foto, com remoção pelo administrador

**O acesso, decidido pelo cliente em 18/10 — *"coloque uma opção no perfil do usuário de
forma sutil para o outro denunciar perfil"*. Sutil não é escondido:** quem precisa denunciar
está desconfortável e não vai caçar o botão. O lugar é o **"⋮" da barra de topo do perfil**,
visível sem rolar, no mesmo lugar em **todos** os estados, inclusive no de bloqueado.
**1 toque para achar, 2 para chegar aos motivos, 4 para concluir.**

- **Não é botão no topo do perfil.** Um "Denunciar" ao lado do nome lê como acusação oferecida
  a todo mundo: barateia o ato, deixa o perfil hostil e disputa atenção com a ação principal.
- **Não é três toques de profundidade.** Ajustes → Privacidade → Denunciar é o padrão em que
  a pessoa desiste.
- **O quarto toque é um "Enviar" explícito**, de propósito: denúncia que dispara no toque do
  motivo não tem desfazer, e o erro custa a quem foi denunciado.

**Perfil e foto são duas denúncias, em dois lugares.** Perfil no "⋮" do perfil, sobre *quem a
pessoa é*. Foto **na foto** — toque e segure na grade, ou "⋮" com a foto aberta — porque o
dano está ali e o administrador precisa saber *qual* imagem.

**Motivos em lista curta e fechada, sem texto livre** (campo livre vira desabafo e não se tria):

| Perfil (5) | Foto (6) |
|---|---|
| Não é quem diz ser | Nudez ou conteúdo sexual |
| Está incomodando ou ameaçando | Criança em situação de risco *(topo da fila)* |
| Golpe ou cobrança para devolver um pet | Violência ou maus-tratos a animal |
| Parece ser menor de 16 anos *(topo da fila)* | Apareço nesta foto e não autorizei |
| Outro motivo | Não é quem diz ser |
| | Outro motivo |

*"Golpe ou cobrança para devolver um pet"* é específico deste produto: o golpe do falso
achador está nomeado no ADR-0010.

**O que a pessoa denunciada vê: NADA.** Nenhum aviso, nenhum selo, nenhuma mudança no perfil
dela e nenhuma mudança no que ela consegue fazer. Denúncia que avisa o denunciado é
retaliação, e o silêncio é mecanismo, não omissão.

**O que o denunciante vê:** confirmação na hora, a frase de que a outra pessoa não é avisada —
que é o que faz denunciar parecer seguro —, e depois o "⋮" passa a mostrar *Denúncia enviada*
desabilitado, que é o que impede a mesma pessoa de denunciar cinco vezes. **Nenhum prazo é
prometido, porque não temos um.** Logo abaixo, **Bloquear também**, em um toque: o bloqueio é
o que dá alívio imediato, já que a denúncia sozinha não muda nada que a pessoa veja.

**Tetos, assimétricos de propósito:**

- **1 denúncia aberta por par** — denunciar de novo soma em `repeat_count` e não cria linha,
  que é o que `professional_review_reports` já faz com índice único parcial;
- **5 denúncias de perfil por dia** e **20 no total por dia**, por conta;
- **nenhum teto de quantas pessoas distintas denunciam o mesmo alvo** — esse número é o sinal,
  não o abuso. A defesa contra denúncia coordenada não é teto, é **peso**: denúncia de conta
  sem e-mail confirmado ou com poucos dias de vida **não ordena a fila**.

**Duas consequências separadas, e a separação é o mecanismo:**
1. **Ocultação imediata para quem denunciou** — acontece na hora, sem depender de ninguém.
   É o que faz a denúncia valer **sem SLA**.
2. **Remoção para todos** — exige administrador.

O precedente de remoção existe e deve ser copiado, não reinventado:
`DELETE /v1/admin/directory/reviews/{reviewRef}` — exclusão lógica com `moderation_reason`
obrigatório, `x-audit`, `x-admin-roles: [admin]`, **sem rota de restaurar**.

**O custo que não dá para esconder — e que o cliente acabou de pagar.** Até 18/10 **não existia
fila de moderação** no repositório:
`conversation_reports` grava a denúncia e **nenhuma rota de painel escreve `resolved_at`**;
a tabela `human_work`, citada numa migração, **nunca foi criada**; `jobs` é fila técnica.
A única remoção que funciona ponta a ponta é a da avaliação do Perto. **Esta frente constrói
a primeira fila de moderação de verdade do produto.** Fila sem alguém que a trabalhe é
promessa falsa: **quem modera e em quanto tempo é decisão dele, respondida antes de a
vitrine ser visível a qualquer terceiro.** `user_roles` já tem o papel `moderator`, e
`AdminRole` do contrato já diz que ele *"entra aqui quando a moderação entrar, como valor
novo, pelo caminho de lista fechada do ADR-0023"* — o lugar está reservado.

**Achado lateral, de graça:** o cabeçalho de `src/shared/texto/moderacao.ts` afirma cobrir
*"a indicação e a recomendação com nota e texto"*, mas `errosDeModeracao` **não é chamada**
no caminho de escrita da avaliação (`avaliacao-do-local.ts` não importa nada). A avaliação
publica na hora, sem filtro de palavra. Não é desta frente; relato porque é prosa que
divergiu do código.


### 2.2.1 A fatia E na fila do backoffice — o encaixe

**Decisão do cliente, 18/10:** *"quem modera vai ser o administrador, deve ir para a página de
backoffice."* **Era o bloqueio número um desta frente, e ele caiu.** A fila foi despachada com
origens em denúncia de avaliação e de conversa, ações de remover (exclusão lógica, motivo
obrigatório) e descartar, as duas com trilha, e **nenhuma ação sobre a conta da pessoa**.

**Confirmo que E encaixa.** O que ela acrescenta:

| O que E traz | Observação |
|---|---|
| **Três alvos novos**: `perfil`, `foto`, `publicacao` | A fila passa a ter cinco, com `avaliacao` e `conversa` que já tem |
| **As três listas de motivos** (5 perfil, 6 foto, 5 publicação) | Lista fechada, pelo padrão do ADR-0023 §3 |
| **Ocultação imediata para quem denunciou** | **Não é da fila.** É filtro de leitura, do lado do denunciante, e é o que faz a denúncia valer **sem prazo prometido** |
| **O peso de ordenação** | Denúncia de conta sem e-mail confirmado ou com poucos dias **não ordena a fila** — é a defesa contra denúncia coordenada |
| **Os tetos** | 1 aberta por par (índice único parcial, como `professional_review_reports`), 5 de perfil/dia, 20 no total/dia |
| **`user_blocks`** | **Não entra na fila, e isso é de propósito.** Bloquear é ferramenta pessoal, não moderação: não tem administrador, não tem revisão, e tem efeito imediato |

**Um ponto que a fila deixa em aberto e que é meu de responder:** se "nenhuma ação sobre a conta"
e **denúncia de perfil** não tem conteúdo para apagar, o que o administrador faz? **Resposta: a
denúncia de perfil resolve-se removendo o ARTEFATO ofensivo** — o apelido, o nome de exibição ou
a capa, um de cada vez, com motivo obrigatório —, nunca a conta. Isso cabe inteiro em "remover
conteúdo" e respeita "nenhuma ação sobre a conta". O apelido removido volta ao estado nulo, que
o desenho já tolera (4-C.8), e **a pessoa é avisada de que perdeu conteúdo e por quê** (4-D.1) —
que é diferente de avisar que foi denunciada, e essa diferença é o desenho.

**Dependência, medida agora:** a fila **ainda não está em `origin/development`** (conferido:
`admin/moderation`, `moderation-queue` e `admin/reports` não aparecem no contrato de lá, e o
conserto da moderação da avaliação também não desceu). É a mesma forma da dependência da fatia
A — **E constrói sobre uma branch que ainda precisa pousar.**

### 2.3 Consentimento de quem aparece na foto

**O que o produto assume:** quem envia declara ter o consentimento de todas as pessoas
identificáveis na foto. A declaração fica **na folha de envio** (tela 2), não escondida nos
termos — aviso que ninguém lê não é consentimento informado.

**O que os termos precisam passar a dizer** (texto para o jurídico; eu não escrevo
`web/src/conteudo/juridico/`):

1. que quem envia é **responsável** pelo consentimento de quem aparece, e que o Bichu não
   verifica;
2. que **quem aparece numa foto pode pedir a remoção dela mesmo sem ter conta**, por um
   canal nomeado — é o mesmo direito de oposição que o ADR-0011 deu ao profissional
   cadastrado por terceiro, e pela mesma razão;
3. que a plataforma **não faz reconhecimento facial, não marca pessoas e não agrupa por
   rosto**, em nenhuma hipótese. **Recomendo que esta recusa seja escrita e permanente:**
   marcação de rosto é tratamento de **dado biométrico**, que é dado sensível pelo art. 11
   da LGPD, e muda a base legal da plataforma inteira;
4. que foto removida sai das derivadas na hora e do armazenamento em 30 dias (ADR-0007), com
   **chave trocada e não reaproveitada**.

### 2.4 Idade — DECIDIDA em 16 anos, e esta fatia saiu da frente

**Decisão do cliente, 18/10:** *"coloque maiores de 16 anos."* Data de nascimento obrigatória
no cadastro, guardada como data e não como um "sim, sou maior" — a caixa de seleção não deixa
nada para auditar, e data permite mudar o piso depois sem pedir o dado outra vez.

O que eu havia medido e que motivou a pergunta: `users` sem nenhuma coluna de idade; nenhuma
declaração de maioridade na tela de criar conta; `termos.md:17` prometendo 18 anos; e
`privacidade.md:291` **confessando por escrito** que *"hoje o cadastro não confere a idade"*.

**Esta fatia saiu desta frente** e está sendo construída em separado, direto na
`development` — exatamente como eu propus no grupo 1. **Não é mais bloqueio desta frente.**
Ela só precisa estar no ar antes de qualquer foto de pessoa ficar visível a terceiro.

**Duas consequências que ficam:** (a) **os termos passam a divergir** enquanto disserem 18, e
precisam ser atualizados junto; (b) com piso de 16, **adolescentes de 16 e 17 passam a existir
no produto**, o que torna o motivo de denúncia *"parece ser menor de 16 anos"* um caminho
necessário e não decorativo, e mantém o art. 14 da LGPD na mesa.

### 2.5 Conta desabilitada dentro das conexões

**A conexão desaparece da lista e a contagem desaparece com ela. Sem fantasma, sem
placeholder.** É o que `conta_habilitada(uuid)`
(`migrations/20261017000013_conta-desabilitada-nao-apaga-aparelho.sql:209`) já faz em toda
leitura, e o comentário da função registra a decisão do cliente de 17/10: conta desabilitada
*"não é mais encontrada em nenhuma página ou funcionalidade"*.

Um placeholder "conta indisponível" contaria a terceiro que aquela pessoa existiu e saiu,
que é informação sobre ela. E contagem que não bate com a lista é pior que as duas.
**A linha não é apagada**, então reabilitar devolve a conexão intacta.

Exceção que segue regra existente: na **conversa mediada** a linha fica e o nome vira rótulo
neutro, porque conversa que perde um lado no meio é pior que conversa com um lado anônimo.
Esse comportamento **não muda**.

### 2.6 A foto some de onde — vitrine e avatar são duas decisões

| | **A vitrine** | **O avatar espalhado** |
|---|---|---|
| O que é | Até 9 fotos, numa tela, atrás de um aceite | A capa redonda ao lado de um nome, em qualquer lista |
| Superfícies | **1** | Tantas quantas alguém puser |
| Risco | Contido: uma tela, um estado, um portão | Multiplica: cada tela nova é uma decisão de privacidade que ninguém revisita |
| Decisões que toca | ADR-0010 item 7 | ADR-0025 item 2, contrato da conversa (2 pontos), ADR-0010 itens 1–10 |

**Onde o avatar aparece na v1 — três lugares, lista fechada:** o próprio perfil; o perfil de
outra pessoa; a lista de conexões e de pedidos.

**Onde não aparece, e cada "não" tem dono:** Rede (ADR-0025 item 2 + o teste
`encontro-da-rede.test.ts:337` que reprova `avatar`); conversa mediada (contrato em dois
pontos + domínio); avaliação do Perto (a avaliação fala de um negócio e é lida por quem não
conhece o autor; rosto ali identifica quem avaliou a um público que ele não escolheu);
**qualquer superfície alcançável sem conta**, sem exceção.

---

## 3. A VITRINE — limites, ordem e peso

| Regra | Valor | De onde vem |
|---|---|---|
| Entrada | **5 MB**, com a orientação visível na tela | `TETO_DE_BYTES_DO_ENVIO`, e `ORIENTACAO_DE_TAMANHO_DA_IMAGEM` já diz *"Envie uma imagem de até 5 MB."* |
| Tipos | JPEG, PNG, WebP, **HEIC**; **SVG nunca** | `TIPOS_ACEITOS`, validado por números mágicos e não pelo `Content-Type` |
| Saída | **JPEG** | `FORMATO_DAS_DERIVADAS` |
| Alvo de derivada | **300–500 KB** | `PISO_DE_BYTES_DA_DERIVADA_GRANDE` / `TETO_DE_BYTES_DA_DERIVADA` |
| Mínimo de entrada | **600 × 600**, recusa final com motivo | mesmo mínimo da capa do encontro |
| Quantas fotos | **9** | grade 3×3, uma tela, sem paginação |
| Capa | a foto de `position = 0` **é o avatar** | molde de `store_item_images` / `network_event_images` |
| Ordem | explícita, `position 0..8` | mesmo molde, com `UNIQUE` **diferida** |
| EXIF | removido, inclusive GPS | worker reescreve os pixels |
| Armazenamento | Google Storage, atrás da porta `ObjectStorage` | ADR-0007 |

**Reaproveitamento, e não há segunda esteira.** O molde de galeria já existe **idêntico
duas vezes** no repositório — `store_item_images` e `network_event_images`:
`(<dono>_id, image_id UNIQUE, position smallint CHECK 0..N, alt_text, PRIMARY KEY (<dono>_id, image_id), UNIQUE (<dono>_id, position) DEFERRABLE INITIALLY DEFERRED)`.
A vitrine é a **terceira aplicação do mesmo molde**, com `user_id` e `CHECK 0..8`.
A `UNIQUE` diferida é o que permite reordenar dentro de uma transação sem colisão
intermediária, e é por isso que ela precisa ser copiada e não simplificada.

### 3.1 Peso — o orçamento, com a conta

Grade de 3 colunas em moldura de 360 dp: célula de **104 dp**; a 3× de densidade,
**312 px reais**.

| Tela | Pior caso | Conta |
|---|---|---|
| Meu perfil / perfil conectado | **≈ 377 KB** | 9 × 35 KB + 22 KB (capa) + 2 × 20 KB (pets) |
| Perfil **sem** conexão | **22 KB** | só a capa; a cortina é CSS e o servidor manda a contagem, não as chaves |
| Foto aberta ao toque | **≤ 450 KB** | 1 × `card` 1024 px, uma por vez |
| Lista de conexões / pedidos | **≤ 440 KB** | 20 × 22 KB por página, sob demanda |
| **Se usasse `card` na grade** | **4,05 MB** | 9 × 450 KB — é o defeito da Loja outra vez |

**Teto proposto como portão, em teste e não em prosa:** perfil **≤ 400 KB**, página de lista
**≤ 500 KB**. É o número que faltou na Loja, onde a primeira pintura chegou a
**9,8 MB** (`app/lib/telas/loja/vitrine_da_loja.dart:570`). A lição registrada lá é a frase
que decide esta tela: *"o que pesa é BAIXAR as oito, não recebê-las na lista."*
`PageView.builder` e `allowImplicitScrolling: false` são obrigatórios, pelo mesmo motivo
documentado em `app/lib/widgets/carrossel_de_fotos.dart:35`.

**O achado que isto produz.** As derivadas existentes **não servem a grade**: a foto de
usuário da branch não mesclada gera `card` 512×512 e `thumb` 176×176. A 312 px de célula
real, `thumb` é ampliada 1,8× (fica mole) e `card` é 1,6× maior do que precisa.
**A vitrine pede uma terceira geometria, ~320 px, alvo ~35 KB.** É um **parâmetro novo** em
`src/modules/media/domain/derivadas.ts`, que já centraliza as cinco esteiras — **não** é uma
segunda esteira.

### 3.2 Os pets, sem duplicar nada

O pet já tem página própria, foto própria em `pet_photos` (com capa imposta pelo banco,
`pet_photos_uma_principal`) e caso de perdido. **A vitrine da pessoa não recebe foto de pet,
e a página do pet não recebe foto da pessoa.** O perfil da pessoa **referencia** o pet:
miniatura vinda de `pet_photos` e um toque que abre a página do pet. Uma foto, um lugar,
duas telas que a mostram.

A gradação por estado (contagem para quem não é conexão, nome e página para quem é) é o que
resolve a colisão com o item 7 do ADR-0010 — item 1.2 acima.

### 3.3 O que a vitrine acrescenta de confiança, e o que não acrescenta

**Acrescenta:** reconhecimento presencial. Numa praça, o que faz o vizinho confiar é ter
visto a cara antes. Capa com selo de e-mail confirmado converte um handle em alguém que se
reconhece no portão. Três fotos mostram **contexto** — a pessoa com o cachorro, no bairro,
ao longo do tempo — e contexto distingue conta de três dias de vizinha de dois anos.

**Não acrescenta:** da terceira foto em diante o ganho de confiança é praticamente zero e o
que cresce é volume. **O teto de 9 é generoso de propósito, mas o valor está nas 3
primeiras.** O produto deve pedir **uma**, aceitar até nove, e **nunca cobrar as nove**.
Sem contador de "perfil 60% completo", que transforma foto em dever de casa.

**Fora de propósito:** legenda livre por foto (texto publicado pede a moderação que não
existe), curtida, comentário, contador de visualizações, e **marcar pessoa na foto**
(item 2.3, ponto 3).

### 3.4 Os sinais de confiança — o que são e o que não são

**Não são nota nem estrela.** Reputação numérica de pessoa cria o incentivo de farmar o
número, e "4,2 de 5" sobre um vizinho não é informação, é rótulo.

**São contagens de ato verificado pelo servidor:** encontro em que fez check-in; indicação
que foi **aceita** pelo profissional; caso em que foi o achador e **o tutor** encerrou como
devolvido. Nenhum é autodeclarado.

**Devolução é o mais forte e o mais delicado.** Zero devoluções é o normal e não pode
parecer defeito — por isso o número aparece sem cor e sem medalha.

**Dependências honestas:** o contador de encontros depende do check-in, que está
**suspenso** e guardado em `guarda/rede-checkin-galeria`. Enquanto ele não voltar, esse
sinal é **zero para todos** e eu recomendo **não desenhá-lo vazio**: ele entra quando o
check-in entrar.

---

## 4. O MODELO DE CONEXÃO — simétrica

**Recomendação: simétrica, com pedido e aceite.**

Ele disse "parecido com Instagram". A semelhança que vale copiar é a **forma da tela** —
cabeçalho de perfil, grade de fotos, capa. O **grafo** do Instagram é outra coisa, e é o que
não serve aqui.

1. **Confiança só existe recíproca.** Seguidor não carrega informação: qualquer um segue
   qualquer um, de graça. Uma conexão aceita é afirmação **das duas partes** — "nos
   conhecemos" — e é esse o sinal que a pessoa do outro lado do portão precisa quando decide
   entregar um cachorro. Contagem de seguidores é vaidade; conexão mútua é referência de
   bairro. Sob a lente de **infraestrutura de confiança**, assimétrico não produz o insumo.
2. **Já está registrado como o mecanismo preferido deste produto, duas vezes.** ADR-0025,
   *Fase seguinte* item 3: recuperar a prova social por *"presença mútua entre pessoas que
   ambas confirmaram presença e ambas pediram para se ver, que é um fluxo de consentimento
   recíproco e não um interruptor"*. E ADR-0011 emenda 1 trocou criação pela comunidade por
   **convite com aceite**. Simétrica é a terceira aplicação do mesmo princípio.
3. **Assimétrico inverte o risco no fluxo mais crítico.** Seguir sem aceite deixa um
   estranho montar uma lista de tutoras do bairro, com rosto, sem que nenhuma delas tenha
   feito nada. Num produto cujo caso mais sério é animal levado, a lista de seguidos **é** a
   lista de alvos.
4. **Escala de bairro não precisa de aresta de mão única.** Assimétrico existe para milhões
   de arestas em direção a poucos. Aqui o grafo é pequeno e real: as pessoas se encontram na
   praça.
5. **Recusar fica barato.** A recusa é silenciosa e o pedido expira para quem pediu. Nenhum
   "ela recusou você", que é o que faz as pessoas aceitarem estranhos para não criar atrito.

**O custo, sem maquiar:** cresce mais devagar, não tem laço de descoberta, não existe
"perfil popular", e um perfil sem conexões fica mudo. As três primeiras conexões de cada
pessoa são o momento mais frágil do desenho, e a resposta é **evento e achado**, onde as
pessoas já se cruzam — **não** um motor de sugestão.

### 4.1 Estados

| Estado | Quem vê | Como sai dele |
|---|---|---|
| `nenhum` | os dois, igual | pedido |
| `pendente` | quem pediu vê "enviado"; quem recebeu vê na caixa | aceite, recusa, cancelamento, ou **expira em 30 dias** |
| `conectado` | os dois | desfazer (qualquer um), ou bloqueio |
| `recusado` | **ninguém** — só contador para o descanso de 90 dias | decai sozinho |
| `bloqueado` | só quem bloqueou; o outro recebe 404 | desbloquear (não devolve a conexão) |

**Bloquear com pedido pendente:** apaga pedido pendente nas **duas** direções e desfaz a
conexão, em silêncio. Bloqueio que deixasse pedido vivo seria canal aberto por descuido.

**Perfil privado existe?** **Sim, e é o único modo em v1.** A vitrine é sempre só para
conexões. Não há interruptor "perfil público": é exatamente o caso que o ADR-0025 recusou
por extenso — escolha cujo valor errado é irreversível para quem errar, tomada por quem não
está pensando em modelo de ameaça. Perfil aberto depois é decisão própria, com texto próprio.

**Tetos:** **150** conexões (é bairro, não plateia; número que se sobe depois e não se
desce), **20** pedidos pendentes enviados, **10** pedidos novos por dia, **9** fotos.
Os tetos de requisição por hora seguem o padrão já em uso nas intenções de mídia (20/h).

**Descoberta: ver o item 4-B.1.** A descoberta por link **morreu** com a decisão de
18/10. A primeira conexão passa a ser **ancorada no contexto** (caso devolvido, encontro
em comum, com revelação só no aceite dos dois) ou por **código presencial** com token
rotativo. **Continua sem busca de pessoas e sem motor de sugestão.**

---

## 4-A. TIMELINE — o grafo reaberto, o que se publica, e o peso

Pedido do cliente, 18/10: *"vamos criar a seção de timeline, onde as publicações/notificações
dos usuários que ele segue e são amigos apareça."* Ele falou de **seguir** e de **amigos** —
dois grafos. Reabro a recomendação com a timeline na mesa.

### 4-A.1 Um grafo ou dois — **ENCERRADO em 18/10, a favor de um só**

**Decisão do cliente:** *"se elas forem amigas não tem problema, o que não pode é ser público,
sem ter nenhum relacionamento."* **Um grafo só: amizade simétrica, com aceite.** Conteúdo com
lugar e data circula entre quem se aceitou; o que está vetado é **superfície pública sem
nenhuma relação**. A recomendação abaixo está **aceita**, e este bloqueio **não se reabre**.
O texto que segue fica como o registro do porquê.

| Cenário | Custo de privacidade, em uma linha |
|---|---|
| **Só amizade** (simétrica, com aceite) | Nenhum além do já mapeado: a timeline é leitura entre pessoas que se aceitaram, e o mapa não muda em um item |
| **Os dois** (seguir + amizade) | Um estranho passa a receber um fluxo **datado** dos atos de outra pessoa sem que ela aceite nada |

**Recomendo UM grafo: só amizade simétrica.** O argumento decisivo não é preferência — é que
a timeline **transforma** o grafo assimétrico em algo pior do que ele era no perfil.

1. **Uma timeline seguida é a lista de presença com hora.** A decisão 2 do ADR-0025 recusou a
   lista de presença porque ela diz *quem* esteve. Uma linha do tempo que diz "a Maria
   confirmou presença no Encontro da Praça Benedito Calixto" diz **onde a Maria vai estar, e
   quando** — e entrega isso a quem só apertou "seguir". É estritamente pior do que o que já
   foi recusado por escrito.
2. **O que "seguir" serviria aqui já está resolvido, e melhor.** O alcance que importa neste
   produto é o do pet perdido, e ele já existe como **alerta geolocalizado a tutores
   próximos** (ADR-0010, legítimo interesse, com oposição). Proximidade é mais precisa que
   "quem me segue" para um cachorro que sumiu a três quadras.
3. **Dois grafos são duas camadas de visibilidade para sempre.** Cada publicação nova passaria
   a precisar da pergunta "isto vaza para seguidor?", que é a disciplina de quem projeta que o
   ADR-0025 chamou de defeito esperando acontecer.

**Se ele quiser os dois mesmo assim, a guarda é uma só e precisa ser dura:** seguir **nunca**
carrega publicação com lugar ou data de encontro — só "foto nova" e "pet cadastrado". Evento,
check-in e caso de perdido ficam restritos à amizade. E fica dito que são duas camadas a
manter para sempre.

**O custo de só-amizade, que a timeline agrava:** a timeline de quem tem zero conexões é uma
tela vazia, e eu já havia escrito que as três primeiras conexões são o ponto frágil.
**A resposta não é afrouxar o grafo:** é a **publicação de pet perdido entrar por
proximidade**, não por conexão — fixada no topo para quem está no bairro, conectado ou não,
pelo mesmo critério do alerta que já existe. A timeline nasce com conteúdo no dia um, sem
nenhum grafo assimétrico.

### 4-A.2 O que pode ser publicado, e o veredito sobre texto livre

**A publicação é gerada pelo SERVIDOR a partir de um fato que o produto já conhece.** A pessoa
não escreve a publicação; ela faz a coisa, e a coisa vira linha.

| Fato | Publica? | Por quê |
|---|---|---|
| Pet perdido, caso aberto | **sim** | Fluxo crítico. Entra **por proximidade** e fica fixado 48 h |
| Caso encerrado como devolvido | **sim** | É a boa notícia, e é o que faz as pessoas voltarem |
| Pet cadastrado | **sim** | Ato fundador, e não diz onde ninguém está |
| Foto nova na vitrine | **sim** | Já existe na fatia D; custo novo zero |
| Indicação de profissional **aceita** | **sim** | Recomendação de vizinho é o núcleo da confiança. Só depois do aceite (ADR-0011 emenda 1) |
| **Check-in em encontro** | **não** | **ADR-0025 decisão 2.** Seria a lista de presença como linha do tempo, com hora |
| **Nova conexão** ("X e Y agora são amigos") | **não** | É a lista de conexões por outro caminho, e ela nunca aparece a ninguém |
| Avaliação do Perto | **não na v1** | Identifica quem avaliou a um público que ele não escolheu |

**Texto livre: LIBERADO pelo cliente em 18/10** — *"deixe o texto livre na timeline"*.
**Eu havia recomendado que não, e a razão era uma só: a moderação não tinha dono.** Ele decidiu
que *"quem modera vai ser o administrador"*, com fila no backoffice. **A razão caiu, então a
recomendação cai junto** — não há mérito em defender uma recusa cujo fundamento deixou de existir.

**O que NÃO cai é o limite declarado do filtro.** A lista de 32 palavras **não cobre injúria
racial** — o próprio arquivo diz isso por extenso, porque as palavras colidem com vocabulário de
animal, de cor e de gentílico — e **não pega frase ofensiva sem palavra proibida**. O cliente
aceitou por escrito: *"vamos começar com um modelo de moderação mais simples e conforme for
aumentamos."* **Então o produto não promete mais do que a lista entrega:** nada de "seu texto foi
verificado", nenhum selo de conteúdo revisado. A proteção real é **denúncia mais remoção pelo
administrador**; o filtro é o primeiro degrau, não a garantia.

**Onde o texto passa pelo filtro — e o lugar é o ponto.** Medido hoje: a moderação **não estava
ligada** no caminho de escrita da avaliação do Perto, **embora o cabeçalho do módulo afirmasse
que estava**. Já consertado por outro agente, e o buraco não se repete aqui:

- **A chamada mora no DOMÍNIO**, na função que cria a publicação — não na rota, não na tela.
  Mesmo argumento da conversa mediada, que despersonaliza no domínio porque é o único ponto por
  onde as duas vistas passam.
- **O teste é do caminho de escrita, não da lista.** O que faltou na avaliação não era um teste
  da lista: era um que **publica** com palavra proibida e **espera recusa**.
- **Proponho um portão — e ele cobra COERÊNCIA, não cobertura.** A distinção é a correção de
  uma proposta minha anterior, e ela importa: ver 4-A.2.1.

**Como fica a publicação com texto:**

- **A fatia K deixa de existir** e é absorvida pela J — separá-las era artificial: mesma tabela,
  mesmo filtro, mesma denúncia. **J passa de 5–7 para 7–9 dias.**
- **Duas formas, e recomendo as duas juntas:** (a) **texto no fato**, uma linha acrescentada à
  publicação que o servidor gerou; e (b) **publicação de texto puro**, sem fato por baixo. A (b)
  é a que o bairro mais usa — *"alguém viu um gato preto na Rua Aurora, coleira vermelha?"* — e
  separá-la custaria uma fatia inteira para a mesma mecânica.
- **280 caracteres**, e não os 140 que eu propus. **280 é o teto que o produto já usa** em
  `pets.care_notes`, e dois tetos de texto livre com números diferentes é o que ninguém explica
  depois. 140 também não cabe o caso de uso acima.
- **Sem formatação, sem link clicável, sem menção.** Link clicável em texto de terceiro é o vetor
  de golpe mais barato que existe; menção traria o apelido para uma superfície nova sem passar
  pela tabela 4-B.

**Denunciar publicação: mesma mecânica, terceira lista.** Mesma folha e mesmo comportamento —
ocultação imediata para quem denunciou, remoção para todos só pelo administrador, denunciado não
avisado, sem prazo prometido. **Ponto de acesso no próprio cartão**, pelo princípio da foto:
denuncia-se onde o dano está. Motivos (5): *ofensa ou discriminação*; *golpe, cobrança ou venda de
animal*; *informação falsa sobre um pet perdido*; *propaganda ou repetição*; *outro motivo*.
Terceira lista porque "nudez" e "maus-tratos" são de imagem e "não é quem diz ser" é de perfil.
*"Informação falsa sobre um pet perdido"* é específico daqui: um avistamento inventado manda a
pessoa para o bairro errado e custa horas de busca.


#### 4-A.2.1 O portão do texto livre — cobra coerência, não cobertura

**Minha proposta anterior estava errada, e a decisão do cliente a corrige.** Eu havia proposto um
portão que **reprovasse todo campo de texto livre sem filtro**. Isso **reprovaria uma decisão que
ele acabou de tomar**: *"vamos deixar desligado e ir acompanhando, caso identifiquemos muitos
problemas, adicionamos a moderação."* Ele recusou ligar o filtro na **descrição do caso de
perdido**, no **nome de exibição** e nos **campos de evento**. Hoje o filtro fica **só na
indicação e na avaliação**, e **a maioria dos campos de texto livre do produto está
deliberadamente descoberta**.

Portão que reprova decisão do cliente não é portão, é obstáculo. **O que o portão deve cobrar é
que cada campo tenha uma decisão — qualquer uma — escrita.**

**Duas listas, e todo campo de texto livre de usuário está em exatamente uma:**

| Lista | O que significa | O que o portão confere |
|---|---|---|
| `COBERTO_PELO_FILTRO` | o caminho de escrita chama `errosDeModeracao` | **que a chamada existe de verdade** |
| `DESCOBERTO_POR_DECISAO` | fica sem filtro, de propósito | que há **motivo, responsável e data** |

**Três comportamentos, e o segundo é o que pega o defeito real:**

1. **Campo em nenhuma das duas listas → REPROVA**, nomeando o campo e pedindo que alguém decida.
   É isto que impede o próximo campo de nascer descoberto **por esquecimento** em vez de por
   decisão — que é a única coisa que eu queria do portão original.
2. **Campo na lista de cobertos cujo caminho de escrita NÃO chama o filtro → REPROVA**, dizendo
   que a prosa diverge do código. **É exatamente o defeito da avaliação do Perto**, onde o
   cabeçalho do módulo afirmava cobrir a recomendação e `errosDeModeracao` não era chamada em
   lugar nenhum daquele caminho. Sem este caso o portão não teria pego o único buraco que já
   aconteceu.
3. **Campo na lista de descobertos → PASSA**, e o portão **imprime a entrada** com motivo, dono e
   data.

**A lista de descobertos documenta a decisão dele em vez de contrariá-la** — e vira o instrumento
de acompanhamento que ele pediu: quando aparecerem "muitos problemas", a lista já diz **onde
olhar**, com desde quando cada campo está assim e quem decidiu.

**A forma já existe nesta casa, e proponho copiá-la em vez de inventar:**

- **`.github/quality-gates.yml`** guarda as dispensas de portão com **motivo, responsável e
  data**, e `make verificar-dispensas` **reprova dispensa vencida**. É a mesma forma, e o
  comentário do arquivo já diz o princípio: *"visível, datada, e EXPIRA SOZINHA"*.
- **A diferença:** descoberto **não expira e não reprova** por prazo, porque ele decidiu
  acompanhar e não corrigir em data marcada. Em vez disso carrega uma **data de reler**, e
  passada a data o portão **imprime nota sem reprovar** — comportamento que
  `verificar-numero-de-adr` já tem, quando anuncia o buraco do 0026 sem derrubar nada.

**Para esta frente, o efeito concreto:** o texto livre da publicação **entra como `COBERTO`** (é
campo novo, e a chamada mora no domínio), e os campos vizinhos seguem **`DESCOBERTO_POR_DECISAO`,
com a data de 18/10 e o motivo nas palavras dele**. O produto **não insinua que o conteúdo é
revisado** em superfície nenhuma — nem no texto da publicação, nem num selo, nem numa mensagem
de sucesso. **A proteção real continua sendo denúncia e remoção, agora com dono.**

**Não implementei nada disto.** É proposta escrita, para despacho.

### 4-A.3 Notificação não entra na timeline — e o buraco que isso revela

**São duas coisas, e viram duas abas.** Aviso é *seu*, urgente e acionável. Publicação é de
terceiro e informativa. Um fluxo único faz o aviso importante se perder entre fotos de
cachorro.

**Medido nesta árvore, conferido na mão:** a fila `jobs` conhece **só tipos de imagem**
(`pet_photo`, `found_report_photo`, `finder_photo`, `catalog_image`); o aviso do achador
calcula e grava `ownerNotified` mas **não enfileira trabalho de notificação nenhum**; e a
entrega por push está ligada em `src/bin/worker.ts` **só** para o alerta geolocalizado de
perdido. `owner_notified` registra intenção, não entrega.

**A timeline NÃO deve ser o lugar onde esse aviso aparece**, e a razão é de prioridade: a
timeline depende de E, F e G. Amarrar o aviso mais crítico do produto à fatia mais tardia
atrasa o conserto do buraco central por semanas. **O aviso ao tutor precisa de caminho próprio
e mais curto** — push, e-mail e um sino na barra — e **não depende de nada desta frente**.
Vira a **fatia N**, no grupo 1.

### 4-A.4 Ordem, volume e peso

**Ordem: tempo decrescente.** Relevância exige sinal que não temos (não há curtida, comentário
nem tempo de leitura, e não vai haver); relevância esconderia o **pet perdido de ontem** atrás
da foto bonita de hoje, e perdido é o item cujo valor *decai* com o tempo; e ordem por tempo é
auditável, relevância não é.

**Uma exceção, regra nomeada e não "relevância":** caso de perdido aberto no bairro de quem lê
fica **fixado no topo por 48 h**.

**Página de 20, por cursor de tempo** — nunca `offset`, que duplica e pula item quando entra
publicação nova durante a rolagem.

| Medida | Bytes | Conta |
|---|---|---|
| **Primeira pintura** (≈3 cartões visíveis, com texto) | **120 KB** | 3 × (30 KB miniatura + 10 KB avatar) |
| **Página inteira rolada** (20 cartões) | **800 KB** + ~6 KB | 20 × 40 KB de imagem, mais 20 × 280 bytes de texto |
| **Se o cartão fosse foto de largura inteira** | **9 MB** | 20 × 450 KB (`card` 1024 px) |

**A miniatura de 96 dp é a decisão de peso e também a decisão de produto.** Um fluxo de fotos
sangradas *é* o Instagram, e nós decidimos copiar a forma do perfil, não construir um feed de
fotos. O cartão compacto mantém a timeline falando de **fatos**, que é o que a lente de
confiança pede. Carregamento sob demanda é obrigatório, pelo motivo registrado em
`app/lib/widgets/carrossel_de_fotos.dart`.

**O texto deixou a primeira pintura MAIS LEVE, e isso não é óbvio:** o cartão com até 280
caracteres fica mais alto, então cabem **3** na primeira tela em vez de 4, e cada cartão que não
entra é uma imagem que não baixa. O texto em si é desprezível — 20 publicações cheias somam
**~6 KB** de JSON. **Texto é barato; imagem não é.**

**Teto proposto como portão:** primeira pintura **≤ 250 KB**, página inteira **≤ 1 MB**.


---

## 4-B. OS TRÊS NÍVEIS DE VISIBILIDADE

A régua é a frase dele: **relação contra público** — e não "logado contra deslogado".

| | Sem conta | Com conta, **sem** conexão | Conectado | Bloqueado |
|---|---|---|---|---|
| **Como se chega a esta tela** | **não se chega** | pedido recebido · contexto em comum · QR lido presencialmente | as três, mais o aceite | 404 |
| Nome de exibição | — | sim | sim | 404 |
| **Apelido (`@`)** | — | sim | sim | 404 |
| **Capa (a foto)** | — | **sim** | sim | 404 |
| Selo de validado | — | sim | sim | 404 |
| Mês de entrada | — | sim | sim | 404 |
| **Lugar** | — | **só a cidade** | bairro e cidade | 404 |
| Sinais de confiança (contagens) | — | sim | sim | 404 |
| Pets | — | contagem por espécie | nome, miniatura, página | 404 |
| Vitrine | — | só a contagem | as até 9 fotos | 404 |
| Timeline / publicações | — | **não** | sim | 404 |
| Encontros em comum | — | não | só o número | 404 |
| Lista de conexões **de terceiro** | — | **nunca** | **nunca** | 404 |
| Lista das **próprias** conexões | — | **o dono, e só ele** | idem | — |
| E-mail, telefone, CEP, coordenada | nunca | nunca | nunca | nunca |
| Qualquer UUID | nunca | nunca | nunca | nunca |

> **EMENDA DE 22/10/2026 — A LINHA `Lista de conexões` FOI PARTIDA EM DUAS, POR DECISÃO DO
> CLIENTE.** Até essa data ela era uma linha só, com **nunca** nas duas colunas, e dizia a
> decisão dele de 18/10/2026. Ele emendou a própria decisão, literal:
>
> > *"o usuário pode abrir a lista de usuários que é sua conexão"*
>
> A emenda é **exata**, e é por isso que a linha virou duas em vez de mudar de valor:
>
> | | antes | agora |
> |---|---|---|
> | a própria lista, para o próprio dono | nunca | **PODE** — `listMyConnections` (`GET /connections`) |
> | a lista de **TERCEIRO** | nunca | **continua NUNCA** |
>
> **Tocar as *"12 conexões"* no perfil de outra pessoa continua não levando a lugar nenhum**,
> e a pergunta sobre isso segue pendente com ele desde 19/10/2026. O motivo da proibição nunca
> foi o dono: *"a lista, mostrada a um estranho, entregaria a rede social de alguém a quem não
> tem relação com ela"*.
>
> **O recorte de cada pessoa na lista do dono é o MESMO do resultado da busca** — nome,
> apelido, contagem de pets, contagem de conexões e a foto (esta pela emenda dele de
> 21/10/2026). Ser conexão aceita não abre campo ali: o que o aceite abre são as outras linhas
> desta tabela. O portão `conexao-nao-expoe-lista-nem-identificador.test.ts` compara os dois
> conjuntos por nome, e reprova uma lista de terceiro em quatro casos nomeados.

**A coluna "sem conta" é vazia inteira, e isso é arquitetura e não escolha de tela:** não
existe rota de perfil de pessoa alcançável sem conta, em estado nenhum. É o que mantém os dez
itens do ADR-0010 intactos para a superfície pública.

**A coluna do meio não é "qualquer um com conta", e esta é a leitura mais importante da
tabela.** Com a descoberta por link morta (4-B.1), **não existe caminho pelo qual uma conta
arbitrária alcance um perfil arbitrário**. Chega-se à coluna do meio por três caminhos, e os
**três já são uma relação**: a pessoa mandou um pedido, vocês participaram do mesmo contexto
no produto, ou vocês estavam fisicamente juntos e um leu o código do outro. É assim que o
nível do meio deixa de ser *"público sem relacionamento"* e passa a ser *"relação ainda sem
aceite"*.

**Duas linhas apertaram** em relação ao desenho anterior: *Lugar* virou **só a cidade** sem
conexão, e *timeline* é de conectados sem meio-termo.

### 4-B.1 A fatia H não sobrevive — e o que entra no lugar

**A regra dele mata a descoberta por link, e eu concordo.** Um link que abre para qualquer
pessoa é exatamente *"público, sem nenhum relacionamento"*. E exigir conta não salva: um
endereço **estável e compartilhável** vira endereço público no primeiro grupo em que alguém o
cola. **H sai.**

Entram dois caminhos, e **os dois já carregam a relação que ele exige**:

1. **Conexão ancorada no contexto** — caso de pet encerrado como devolvido, e encontro em que
   os dois estiveram. O convite nasce *ali*, e o contexto é o próprio sinal de confiança:
   "quem achou a Nina" é uma relação melhor do que qualquer link. **E não desanonimiza ninguém
   antes da hora:** os dois lados são perguntados em separado e a identidade só aparece **se os
   dois disserem sim**. É o mecanismo da *Fase seguinte* item 3 do ADR-0025 — consentimento
   recíproco, não interruptor — aplicado ao achado em vez do encontro. **A conversa mediada
   continua despersonalizada do começo ao fim**, e o achador sem conta simplesmente não se
   conecta.
2. **Código presencial** — "Mostrar meu código" e "Ler um código", cara a cara. Exige
   **co-presença física**, que é a relação mais difícil de falsificar, e é o padrão que o
   produto já usa na plaquinha. O código carrega **token curto e rotativo (5 min)**, não um
   identificador estável, então captura de tela não vira link permanente. Não é enumerável,
   pela razão que fez o código da plaquinha ter 128 bits aleatórios (ADR-0004). Depende do
   leitor de QR, que é a **BICHUS-54 e nunca foi construída** — é custo a contar.

**Continua sem busca de pessoas e sem motor de sugestão.**

**O que se perde, e é real:** convidar quem não está perto de você e com quem você não tem
história no produto — a irmã em outra cidade, o amigo que ainda vai baixar o app. Era a única
coisa que o link comprava, e o custo é **crescimento mais lento**. Num produto de vizinhança a
perda é pequena e está na mensagem; recuperá-la depois é decisão própria, com texto próprio.


---

## 4-C. O APELIDO (`@`) — identificador escolhido, único

Pedido de 18/10: *"a tela do usuário deve ter como título da página na barra principal o slug
do usuário."* **Medido: slug de pessoa não existe** — `users` não tem a coluna, e a única
operação que define slug é `updatePetPublicProfile`, que é **de pet** e cujo próprio código
registra que *"também não está implementada"*.

**Decidido por ele, e não se reabre:** *"slug não tem relação com informações pessoais, é um id
que o usuário escolhe e você deve verificar para garantir que não tem dois iguais."* O apelido
é **identificador escolhido**, não deriva de nome, e-mail nem telefone, e **não é tratado como
dado pessoal**. A *visibilidade* continua obedecendo à tabela 4-B e à régua dele — nada público
sem relacionamento.

### 4-C.1 A faixa: 5 a 20

*"esse id deve ser curto, no máximo 20 caracteres"* + *"deve ter uma quantidade mínima de 5"*.

`^[a-z0-9][a-z0-9-]{3,18}[a-z0-9]$` — **5 a 20**, minúsculas latinas, dígitos, **um separador
só: o hífen**. A classe de caracteres é a de `pets.slug`; **o comprimento diverge de propósito**
(pet é 3–30), e a divergência fica dita.

**O piso de 5 resolve dois problemas de uma vez:** mata os apelidos de 1 e 2 caracteres, que são
recurso escasso e alvo de acúmulo; e **reduz muito a confusão visual**, porque quanto mais curto,
menos letras é preciso trocar para imitar — `@leo`/`@1eo` diferem em 1 de 3.

**O teto de 20 é do apelido NORMALIZADO, e por construção ele é idêntico ao digitado.** Como o
conjunto já é ASCII restrito, normalizar é só minúsculo e aparo, e maiúscula→minúscula é **um
para um**. **Digitado e normalizado nunca divergem em comprimento** — ganho direto de ter
recusado acento, que faria o comprimento depender da forma Unicode.

**O esqueleto não tem regra de comprimento.** Ele perde o hífen e fica mais curto; existe só
para comparar colisão.

**Banco, contrato e tela cobram a MESMA faixa:** `CHECK` na coluna, `minLength: 5` /
`maxLength: 20` + `pattern` no contrato, mesmo regex no campo. Hoje esta casa pagou por essa
divergência — o recado do achado aceitava **1000** no contrato e a coluna recusava acima de
**500**, e a pessoa recebia erro de servidor em vez de recusa explicada.

**A mensagem da tela diz a faixa, e só** (sem parágrafo de apoio): *"De 5 a 20 caracteres:
letras minúsculas, números e hífen."* / *"Mínimo de 5 caracteres."* O **nome curto legítimo**
(Ana, Léo, Zé) é resolvido pelas **três sugestões** que o servidor já devolve, derivadas do que
a pessoa digitou — orientação por exemplo, não por explicação.

### 4-C.2 Cabe na barra? Medido: não, no caso médio

Em **320 dp**, a barra gasta 16 + 24 + 12 + 24 + 16 → **sobram 216 dp** para o título, que é
`title-lg` (Inter semibold **22 px**).

| Caso | `@` + 20 caracteres | Cabe em 216 dp? |
|---|---|---|
| Médio (~0,52 em) | ≈ **240 dp** | **não** |
| Largo (~0,78 em) | ≈ 357 dp | não |
| Estreito (~0,26 em) | ≈ 120 dp | sim |

**Dois passos, e nunca quebra de linha:** (1) **reduz um degrau**, de `title-lg` 22 px para
`title` 18 px — a 18 px o caso médio dá ≈ **197 dp** e **cabe**; (2) só então **corta com
reticência no fim**. Quebrar em duas linhas está fora: mudaria a altura da barra, que é
compartilhada por todas as telas. **E cortar não custa informação**, porque o apelido aparece
inteiro logo abaixo, no cabeçalho do perfil, em tamanho de corpo.

### 4-C.3 Unicidade é do banco, insensível a caixa

**`@Leandro` e `@leandro` não coexistem**, e quem garante é o **índice**.

- Guardado **já normalizado** em `citext`, com **índice único global** — global e não só entre
  contas vivas, copiando `pets_slug_unico`.
- **Segundo índice, sobre o esqueleto** (4-C.4). São dois, e o segundo é o que trabalha.
- **Em corrida, o banco recusa e a tela trata.** As duas escritas vão ao banco, uma viola o
  índice, o servidor traduz em erro de campo. **Não existe "conferir antes e confiar"**: a
  janela entre a conferência e a escrita é onde a corrida mora.
- **Espaço de nomes compartilhado com `pets.slug`.** O site publica o pet em `/@{slug}`
  (ADR-0028) e o `@` é **um símbolo só** para quem lê. Desenho: tabela `handles` (apelido
  normalizado como chave, esqueleto ao lado, `kind` ∈ `pessoa|pet|reservado`), referenciada por
  `users` e `pets`, e que também hospeda as reservadas.

### 4-C.4 Confusão visual — restringir **e** recusar normalizado

Unicidade não cobre `@leandro` / `@1eandro` / `@leandrо` (о cirílico). **Recomendo os dois
freios juntos**, não "aceitar e deixar para a denúncia":

1. **Conjunto mínimo** (4-C.1). Sendo **ASCII puro**, o cirílico é impossível de digitar, e com
   ele somem os homóglifos de Unicode inteiros. **Recuso ponto e sublinhado**: mínimo quer dizer
   *menos* separadores, não três — com os três, `@maria.silva`, `@maria_silva` e `@maria-silva`
   conviveriam.
2. **Recusa por esqueleto:** tira hífen e mapeia `0→o`, `1→l`, `5→s`, `3→e`; recusa se colidir
   com um existente. `@maria-silva`, `@mariasilva` e `@mar1a-silva` **não coexistem**.

**O que isto não resolve:** nada impede `@clinica-vet-pinheiros` sem ser a clínica. O caso
*humano* só tem a denúncia de perfil com o motivo *"Não é quem diz ser"* mais a remoção.
**Dependência registrada: o apelido não pode aparecer para outra pessoa antes da fatia E.**

### 4-C.5 Disponibilidade é enumeração — a rota não existe

Uma rota "esse apelido existe?" deixa varrer a base, que é o dano que este plano evitou matando
a descoberta por link. **A resposta é não ter a rota:** a disponibilidade é decidida **no envio**,
pelo índice, e não há superfície separada para abusar.

- **Teto: 10 tentativas por hora e 30 por dia, por conta** — mesma família dos tetos das
  intenções de mídia. Enumerar passa a custar uma conta, e conta custa um e-mail confirmado.
- **O custo de experiência é real e a troca é dele:** sem conferência a cada tecla, a pessoa só
  descobre no "Salvar". **Mitigação que não custa nada:** três sugestões livres derivadas do que
  ela digitou.
- O que vaza é **que um apelido está tomado**, não **quem** o tem — e como o apelido não deriva
  de identidade, `@maria` existir não diz que a Maria Silva tem conta.

### 4-C.6 Reservadas, refeitas para o piso de 5

**O piso matou 18 palavras** (`t`, `v1`, `me`, `api`, `app`, `web`, `img`, `pet`, `tag`, `sair`,
`pets`, `rede`, `loja`, `blog`, `time`, `root`, `oi`, `selo`, `vip`, `pix`, `null`, `true`,
`test`, `user`). Reservar o que o piso já proíbe é regra morta.

| Grupo | O que sobrou |
|---|---|
| Caminho | `public`, `media`, `static`, `assets`, `health`, `cartaz`, `login`, `entrar`, `conta`, `perfil`, `perto`, `achado`, `perdido`, `plaquinha`, `evento`, `eventos`, `diretorio`, `busca`, `termos`, `privacidade`, `sobre` |
| Plataforma | `bichu` **e qualquer apelido que CONTENHA `bichu`**, `oficial`, `equipe`, `suporte`, `atendimento`, `ajuda`, `moderacao`, `moderador`, `seguranca`, `admin`, `administrador`, `sistema`, `contato`, `noreply`, `no-reply` |
| Golpe | `verificado`, `validado`, `premium`, `premio`, `recompensa`, `sorteio`, `ganhador`, `pagamento`, `cobranca` |
| Técnicas | `false`, `teste`, `usuario`, `anonimo`, `deleted`, `excluido`, `undefined` |

**Para `bichu` a regra é CONTÉM**, não começa-com: o prefixo deixaria passar `@suporte-bichu` e
`@oi-bichu`, que é a forma real do golpe. Custo: recusar um `@bichuchi` legítimo, raro e com
saída por administrador. **A reservada é conferida sobre o ESQUELETO**, senão `@b1chu-suporte`
passa pela lista inteira. **Acrescentar palavra depois não revoga apelido já dado.**

### 4-C.7 Trocar de apelido

**1 vez a cada 60 dias, e o anterior NÃO volta ao pool na hora** — fica **reservado para a mesma
conta por 180 dias**. Soltar na hora é o furo: troco de `@maria` para `@mariab`, um estranho pega
`@maria` e **herda tudo que a vizinhança associava a mim**, que é imitação servida pelo produto.
Depois dos 180 dias volta ao pool; o risco residual fica dito, e queimar para sempre encolheria o
espaço de nomes sem ninguém para administrá-lo. **Conta excluída: reservado 30 dias**, o prazo de
expurgo do ADR-0010.

### 4-C.8 Contas que já existem — ENCERRADO

*"as contas que não tem ainda são de teste, você não precisa se preocupar."* **Não há estratégia
de migração**: sem geração automática, sem pedir no próximo acesso, sem estado intermediário.
**A oferta de apagar foi recusada**, então elas continuam no banco.

**O que isso exige do desenho:** a coluna nasce **anulável**, e **nada no caminho crítico exige
apelido**. A tela da conta cai para o **nome de exibição** com apelido nulo — que é o que ela já
faz —, e o apelido substitui o título quando existir. **Esse recuo ficou mais seguro hoje:** o
nome virou **obrigatório no cadastro** e desceu em `origin/development`, então o recuo não cai
mais num campo que pode estar vazio. **Nenhum fluxo obriga a escolher apelido
para seguir usando o app**, e **nenhuma leitura pode estourar com nulo**. Gerar automático está
descartado de todo jeito: derivar do e-mail **vaza o e-mail**, e a parte local costuma ser o nome
completo e o login.

### 4-C.9 Texto proposto da emenda — o que se emenda é a EXPOSIÇÃO

> **Emenda ao ADR-0025 decisão 2 e ao ADR-0010 — o apelido da pessoa.**
>
> **A natureza do campo não é o que esta emenda trata.** O cliente decidiu em 18/10 que o
> apelido é um **identificador escolhido pela pessoa**, único, que não deriva do nome, do
> e-mail, do telefone nem de qualquer atributo dela. O que esta emenda trata é a
> **exposição** — que é o que a decisão registrada proíbe.
>
> **O que continua valendo sem exceção:** a decisão 2 do ADR-0025 proíbe, por nome, que `slug`
> e avatar de pessoa apareçam na leitura de um encontro da Rede. **A projeção do encontro não
> ganha apelido, nem avatar, nem nome, nem contagem por bairro**, e a isca que varre o corpo
> inteiro continua reprovando qualquer um deles. O ADR-0010 item 6 (nenhum UUID em saída
> pública) e os itens 1 a 5 seguem intocados.
>
> **O que se abre, fora da Rede e com escopo fechado:** o apelido aparece (a) **sempre à
> própria pessoa**, inclusive como título da tela da própria conta, e (b) na **leitura
> autenticada do perfil de outra pessoa**, a quem chegou por um caminho que já exige relação —
> pedido recebido, contexto em comum no produto, ou código lido presencialmente. **Nunca em
> superfície alcançável sem conta**, em estado nenhum.
>
> **O apelido não é endereço.** Não existe `/@{apelido}` de pessoa em superfície nenhuma. É por
> isso que o ADR-0005 (slug mutável com histórico e 301) e o ADR-0024 (endereço público
> separado da chave interna) ficam **fora do escopo**: sem endereço público não há endereço a
> preservar nem chave estrangeira a desviar. **Se um dia existir página pública de pessoa por
> apelido, esta emenda não a autoriza**, e a decisão é outra.
>
> **Unicidade:** global, insensível a caixa, sobre a forma normalizada **e** sobre a forma
> reduzida, e **compartilhada com `pets.slug`**, porque o `@` é um símbolo só para quem lê.


---

## 4-D. TRÊS CAIXAS DE ENTRADA, E A FRONTEIRA ENTRE ELAS

Pedido de 18/10: *"na barra principal crie um ícone de notificação para alertar o usuário sobre
os posts dos seus amigos e sobre informações sistêmicas e comunicados de eventos, etc."*

| Superfície | Semântica | Indicador |
|---|---|---|
| **Mensagens** (barra inferior) | conversa com uma pessoa | contador de não lidas |
| **Sino** (barra superior) | **dirigido a você**, pessoal e acionável | contador de não lidos |
| **Petline** | **de terceiro**, informativo | **ponto, sem número** |

**Três afordâncias de propósito.** Número pede ação e cria dívida; ponto diz "tem coisa nova" e
não cobra. Número na Petline faria o produto cobrar que a pessoa leia o que os vizinhos
postaram — o laço que transforma comunidade em obrigação.

### 4-D.1 A tabela, aviso por aviso

| O que aconteceu | Vai para | Por quê |
|---|---|---|
| **Plaquinha do seu pet foi lida** | **Sino** + push | O aviso que não pode ser perdido |
| **Achado registrado sobre o seu pet** | **Sino** + push, e abre **Mensagens** | O aviso é no sino; a conversa é a outra caixa. Dois objetos, não duplicação. **A área de mensagens agora existe** (`/mensagens`, `/mensagens/:conversaId`), então o destino é real e não hipotético |
| Possível correspondência | Sino | Exige decisão sua |
| **Pet perdido perto de você** | **Sino + Petline** | **A única duplicação deliberada** |
| Seu caso encerrado como devolvido | Sino | É sobre o seu pet |
| *De um amigo:* caso devolvido | Petline | Mesmo fato, sujeito diferente |
| Mensagem nova na conversa mediada | **Mensagens** + push | Conversa tem caixa própria |
| Pedido de conexão recebido | Sino | Dirigido e acionável |
| Seu pedido aceito | Sino | **A recusa não gera aviso**, por desenho |
| Pedido de participação em evento, e a resposta | Sino | Dirigido a você |
| Evento que você confirmou mudou ou foi cancelado | Sino | Muda o seu sábado |
| Evento *novo* no seu bairro | Petline | Não é dirigido: é oferta |
| Sua indicação aprovada ou recusada | Sino | Dirigido a você |
| *De um amigo:* indicação aceita | Petline | Notícia de terceiro |
| Pedido de plaquinha mudou de estado | Sino | É o seu pedido |
| **Foto nova de amigo** | **Petline** | Ver 4-D.2 |
| **Pet novo de amigo** | **Petline** | idem |
| Comunicado do Bichu | Sino | É à pessoa que ele fala |
| Mudança de termos ou privacidade | Sino | idem, com consequência jurídica |
| *Acrescentados por mim:* | | |
| E-mail não confirmado ou devolvido | Sino | `email_deliverable` já existe e hoje só vira faixa |
| Sua foto ou perfil removido pela moderação | Sino | A pessoa precisa saber que perdeu conteúdo, e por quê |
| **Denúncia que você fez** | **nenhuma** | Decidido antes: sem resultado, sem prazo |
| **Denúncia contra você** | **nenhuma** | Decidido antes: avisar é retaliação |
| Sessão nova em outro aparelho | Sino | Sinal de segurança; o produto já revoga sessão |

**A única duplicação deliberada é o pet perdido perto de você**, porque é o único item cujo
custo de ser perdido é **irreversível**. Em tudo o mais redundância é ruído; aqui é a
funcionalidade. No sino é linha acionável; na Petline é o cartão fixado por 48 h.

### 4-D.2 Veredito: "post de amigo" é da Petline

**Recomendo que não entre no sino**, e o argumento é de volume.

- **A conta.** Teto de **150 conexões**; a uma publicação por semana cada, são **≈ 21 avisos por
  dia**. O aviso de que leram a plaquinha do Thor chegaria **na 22ª posição**. Não é que o sino
  fique feio — é que o único aviso que não pode ser perdido passa a ser perdido.
- **O próprio Instagram faz essa separação.** O sino de lá mostra o que é *dirigido a você*;
  **post de amigo vai para o feed**. A semelhança que ele quer já é essa.
- **Afordância errada.** Número que só zera quando você lê o que os vizinhos postaram
  transforma comunidade em lição de casa.

**E o sino não fica vazio — a razão é estrutural, não otimista.** O **alerta de vizinhança não
depende de amigo nenhum**: é geográfico, já existe (ADR-0010, legítimo interesse) e chega a uma
conta com **zero** conexões. Somando o pessoal e não-social — plaquinha lida, achado,
correspondência, pedido de plaquinha, evento que mudou, indicação respondida, e-mail devolvido,
comunicado —, **o sino de uma conta sem nenhuma conexão continua tendo conteúdo real**. O que
ele não tem é conteúdo *inventado*, e é isso que mantém o aviso do pet confiável.

### 4-D.3 O contador, e o que é "lido"

- **O número conta avisos não lidos do sino, e nada mais.** Nunca soma mensagem nem Petline.
- **"Lido" é o item aberto**, não a lista vista.
- **Abrir a lista e não abrir o item:** o **número some**, e os itens **continuam não lidos**
  (fundo e pino). São duas perguntas: o número responde *"tem coisa nova desde que olhei?"*, e
  olhar responde isso; o pino responde *"já tratei disto?"*, e só tratar responde.
- **Exceção nomeada:** **plaquinha lida** e **achado** não saem do contador ao abrir a lista —
  contam até serem abertos. Mesmo princípio do cartão fixado.
- **"Marcar todas como lidas" existe**, explícito: um gesto deliberado limpa o que o automático
  não limpa.
- **Exibe até `9+`.** Não é estética: a barra tem **216 dp** de título em 320 dp (medido em
  4-C.2), e uma pílula de três dígitos come o espaço do apelido.

### 4-D.4 Agrupamento e teto

- **Agrupa por (tipo, autor quando houver, janela de 24 h)**, no máximo **uma linha por
  combinação por dia**.
- **Na Petline, dez fotos de um amigo são UM cartão** — máximo um por autor, por tipo, por dia.
  Também é o que impede uma pessoa sozinha de ocupar a página de 20.
- **Nunca se agrupa plaquinha lida nem achado.** Cada um é um animal e uma ação distintos, e
  "2 avisos de plaquinha" esconde qual pet.
- **Página de 30**, por cursor de tempo. **Retenção de 90 dias**, alinhada à das leituras de tag.
- **Peso: 0 KB de imagem por página.** A linha é texto e ícone desenhado. É decisão e não acaso:
  pôr avatar aqui traria o avatar para uma **quarta superfície**, que é a conta que a separação
  entre vitrine e avatar espalhado já recusou.

### 4-D.5 Aviso sistêmico: medido, não existe caminho nenhum

- `notification_deliveries` é **telemetria de entrega do provedor de e-mail**, e o comentário da
  tabela diz isso por extenso. **Não é caixa de entrada.**
- **Não existe rota de listar notificações** para o app.
- **Não existe nada de comunicado**: nenhuma rota, tabela ou tela de painel. `broadcast`,
  `comunicado`, `announcement` e `anuncio` não aparecem no contrato.

**O sino não tem onde buscar o que mostrar.** A caixa é trabalho novo, e o comunicado é trabalho
novo em **três lugares**: a caixa, a **escrita pelo backoffice** e o disparo. O comunicado é o
**único item do sino sem autor e com alcance total**, e por isso precisa das travas que a Rede
já dá ao administrador: papel fechado, trilha, e reautenticação para o que alcança todo mundo.
**Megafone sem trilha é o que vira incidente.**


---

## 5. FATIAS, COM TAMANHO E COM GRUPO

Ordenadas por **valor sobre risco**. Tamanho em dias de agente.

### Grupo 1 — vai direto para `development`, sozinho, sem esperar a frente

Critério: **não muda exposição de ninguém a ninguém**, logo não precisa de emenda de decisão
registrada. Quanto mais coisa aqui, menos apodrecimento na branch longa.

| # | Fatia | Tam. | Entrega sozinha | **Não** entrega |
|---|---|---|---|---|
| **A** | **Mesclar `feat/imagem-do-profissional-e-foto-do-usuario`** em `development` | — | A coluna, o propósito `user_photo`, as derivadas e `Me.photo`. **Pré-requisito de tudo.** | Nenhuma tela |
| **B** | ~~Data de nascimento~~ — **SAIU DESTA FRENTE** | — | Decidida em **16 anos** e já em construção por outro agente | — |
| **N** | ~~Aviso ao tutor~~ — **SAIU DESTA FRENTE** | — | Despachada em separado, como recomendei, antes de C e D | — |
| **C** | **A pessoa sobe e vê a própria foto** (tela sobre a fatia A) | **P, 1–2 d** | Foto no app com o selo de validado; troca e remove | Ninguém mais vê |
| **L** | **Ter apelido, único, visível só ao dono** — faixa 5–20, reservadas, esqueleto, dois índices, título da barra | **P, 2–3 d** | **É o pedido imediato dele.** Não expõe nada a terceiro | O apelido não aparece para mais ninguém |
| **M** | **Caixa de notificações** — a tabela, a rota de leitura, a tela do sino, lido/não lido, agrupamento | **M, 3–4 d** | O sino com conteúdo de verdade: plaquinha, achado, vizinhança, evento, indicação, plaquinha pedida. **Funciona com zero conexões** | Sem post de amigo. Sem comunicado (fatia O) |
| **O** | **Comunicado do Bichu** — escrita pelo backoffice, com papel fechado, trilha e reautenticação | **M, 3–4 d** | O aviso sistêmico e a mudança de termos | Nada de social |
| **D** | **A vitrine, só do dono**: 1 → 9 fotos, grade, capa, ordem, derivada de 320 px | **M, 3–5 d** | A vitrine inteira, **visível só ao dono** | Ninguém mais vê. Nada a denunciar, porque nada foi publicado |

**N saiu da frente, e foi despachada.** A timeline reabriu a pergunta "onde o tutor é
avisado", a medição respondeu que **ele não é avisado em lugar nenhum**, e o conserto não
depende de conexão, moderação nem timeline. Registro aqui que saiu, como registrei a idade —
**duas das fatias que eu havia posto no grupo 1 já deixaram a branch longa, que era
exatamente o objetivo do grupo.**

**Por que D também vai no grupo 1:** enquanto a vitrine é visível só ao dono, ela não expõe
ninguém a ninguém e não contraria decisão nenhuma. E ela toca `derivadas.ts`,
`api/openapi.yaml` e os três gerados — exatamente os arquivos de colisão. **Tirar D da branch
longa remove o pior nó de mescla da frente.**

**Sobre C:** construa C **já como a grade degenerada de D** (uma célula). Feita assim, D é
mudança de capacidade e não reescrita.

### Grupo 2 — fica na branch longa `feat/comunidade-perfil-e-conexao`

Critério: **muda exposição** e precisa de emenda de decisão registrada.

| # | Fatia | Tam. | Entrega sozinha | **Não** entrega |
|---|---|---|---|---|
| **E** | **Bloquear e denunciar** (perfil e foto), ocultação imediata, remoção pelo administrador, fila no painel | **M, 3–4 d** | **Nada que o usuário veja.** É o piso de segurança | Sem conexão, sem visibilidade |
| **F** | **Conexão simétrica**: pedido, aceite, recusa, desfazer, tetos, interação com bloqueio | **M–G, 5–7 d** | Duas pessoas que já têm o link uma da outra se conectam | Sem descoberta, sem avatar espalhado, sem timeline |
| **G** | **O perfil visto por quem ainda não é conexão** — os quatro estados, os sinais de confiança, o recorte da coluna do meio **e o apelido aparecendo a terceiros (+1 d)** | **M, 5–6 d** | O perfil que o cliente pediu, inteiro | Sem busca de pessoas, sem link |
| **J** | **Timeline**: publicação gerada de fato **mais texto livre de 280**, duas abas, perdido fixado por proximidade, página de 20 por cursor, denúncia no cartão | **G, 7–9 d** | A seção que ele pediu, com conteúdo no dia um mesmo sem conexões | Sem seguir. Sem check-in. Sem curtida, comentário, link clicável nem menção |
| ~~**H**~~ | ~~Descoberta por link~~ — **SAIU**, contraria a regra dele (item 4-B.1) | — | — | — |
| **H′** | **Conexão ancorada** (caso devolvido, encontro em comum) com revelação só no aceite dos dois | **M, 3–4 d** | O caminho de primeira conexão, e o de maior confiança do produto | Não desanonimiza a conversa mediada |
| **H″** | **Código presencial** (mostrar e ler, token rotativo de 5 min) | **M, 3–4 d** | Conectar quem está fisicamente junto | Depende do leitor de QR, **BICHUS-54, nunca construída** |
| **I** | **Prova social na Rede** (ADR-0025 emenda 3) | **M, 3–4 d** | "Quem eu conheço também vai" | Nada antes de o check-in voltar de `guarda/rede-checkin-galeria` |

**G mudou de nome, porque o antigo enganava.** Era "o perfil visível a terceiros", e
"terceiros" sugeria público. Com a decisão dele, "terceiro" quer dizer **gente com conta e sem
conexão** — e, com H morta, gente que só chegou ali por um caminho que já exige relação.
O nome passa a ser **"o perfil visto por quem ainda não é conexão"**, e o escopo da fatia é a
**coluna do meio** da tabela 4-B.

**Onde a timeline entra: fatia J, depois de E, F e G.** Ela não pode vir antes: precisa do
grafo (F), do perfil do autor para onde tocar (G) e — sobretudo — da moderação (E), porque a
timeline é **conteúdo de terceiro chegando na sua tela sem você pedir**, que é exatamente o
que o ADR-0025 recusou enquanto não houvesse denúncia e remoção.

**Por que E vem antes de F, G e J, contra a ordem intuitiva.** O ADR-0025 recusou o envio de
foto pela comunidade por este motivo exato, escrito: *"não há moderação, denúncia nem remoção
em lugar nenhum do repositório."* Entregar visibilidade antes do piso repete o que a
arquitetura já recusou uma vez por escrito. O custo de E vir antes é ser trabalho invisível —
e é por isso que precisa estar dito aqui, e não descoberto depois.

**Ordem final:** A → **L** → **M** → C → D → **O** (grupo 1, na `development`) → E → F → G → **J** → **H′** → **H″** → I.

*(K foi absorvida pela J: texto livre foi liberado e separá-los era artificial.)*

*(B e N saíram da frente e já estão em construção em separado.)*

**O ponto de parada recomendado não mudou — e a timeline o reforça.** Com A, N, C e D no ar, o
tutor finalmente é avisado quando alguém acha o pet dele, e a pessoa tem perfil com foto de
verdade: o produto ganha o conserto que mais importa e uma identidade, **sem uma única emenda
de ADR e sem um minuto de moderação**. A timeline é o argumento mais claro de por que E tem de
vir antes de tudo o que é visível, porque ela é a primeira tela em que conteúdo de estranho
chega sem ser pedido.

## 6. COMO A BRANCH LONGA SOBREVIVE

Risco maior que o desenho, e ele mediu o porquê: a `development` andou **várias vezes num
único dia** (15 ramos num lote, 5 em outro).

### 6.1 A regra que torna isto gerenciável

**O grupo 1 não entra na branch longa.** Quatro das nove fatias — incluindo a que mais mexe
em `derivadas.ts`, `api/openapi.yaml` e nos três gerados — descem direto na `development`.
A branch longa fica com **cinco** fatias, e a janela de apodrecimento encurta na mesma
proporção. **É a única alavanca que age na causa; o resto age no sintoma.**

### 6.2 Os pontos de colisão, e o que fazer em cada um

| Ponto | Regra |
|---|---|
| `api/openapi.yaml` | Mescla sempre. Conflito aqui é **de bloco YAML**: resolver pelo bloco inteiro, nunca por linha, e reler o bloco vizinho depois |
| Os três gerados (`src/shared/types/generated/api.ts`, `admin/src/api/generated/api.ts`, `web/src/api/generated/api.ts`) | **Nunca resolver à mão.** Em conflito: aceitar a versão da `development`, mesclar o `openapi.yaml`, **rodar o gerador**, comitar o resultado. Gerado costurado à mão volta a divergir no commit seguinte |
| `_arvoreDasTelas` em `app/test/dispositivo/porta_nao_contornada_test.dart` | Já mudou quatro vezes hoje. É **lista**: resolver tomando **os dois lados** e reordenando, nunca escolhendo um. Esta frente acrescenta de 2 a 4 entradas |
| `tests/integration/conjunto-exato-dos-checks.test.ts` | Também lista de conjunto exato: **os dois lados**, e rodar a suíte para que ela diga o que falta |
| **Carimbo de migração** | O caso pior, porque o portão **lê as refs e não vê arquivo não comitado em outro worktree** — três colisões hoje. Item 6.4 |

### 6.3 Regras que não mudam

- **`git merge` sempre.** Nunca `rebase`, nunca `--force`, nunca `git stash` (a pilha é
  compartilhada entre os ~67 worktrees).
- **A `development` entra na branch da feature. Nunca o contrário**, até a frente fechar.
- **Gerado vem do gerador**, toda vez que o contrato mexer.
- Nenhum `git reset --soft origin/development`: o ref avança pelas outras sessões e o commit
  sai apagando o trabalho delas.

### 6.4 Carimbos de migração — **não tomar agora**

Carimbo tomado cedo e segurado por dias **colide com certeza**. Não reservei nenhum.

**Quantos a frente vai precisar: 9.** Era 5. Saíram as de idade e do aviso ao tutor, com as
fatias que deixaram a frente; entraram as do apelido, da caixa de notificações, do comunicado,
da timeline e do convite ancorado. **Nenhum tomado.**

| # | Para que | Fatia |
|---|---|---|
| 1 | `users.nickname` **anulável** + tabela `handles` (normalizado, esqueleto, `kind`) + os dois índices únicos | L (grupo 1) |
| 2 | `user_notifications` (tipo, alvo, instante, `read_at`, chave de agrupamento) | M (grupo 1) |
| 3 | `user_showcase_photos` (molde `store_item_images`, `CHECK 0..8`, `UNIQUE` diferida) | D (grupo 1) |
| 4 | `user_blocks` | E (grupo 2) |
| 5 | `content_reports` + papel `moderator` na lista fechada | E (grupo 2) |
| 6 | `user_connections` + estados + índices de teto | F (grupo 2) |
| 7 | `user_publications` (fato, autor, alvo, instante; **sem corpo de texto**) + índice por tempo | J (grupo 2) |
| 8 | convite ancorado (origem do contexto, aceite dos dois lados) | H′ (grupo 2) |
| 9 | `broadcasts` + autoria e trilha do comunicado | O (grupo 1) |

**Regra de tomada:** carimbo se escolhe **na hora de comitar a migração**, varrendo
**refs e disco** nos worktrees (o portão só vê refs; o arquivo não comitado do vizinho é
invisível para ele). Se ele preferir distribuir os números — que é o que passou a fazer
depois das colisões de hoje — **são estes 5, e eu peço na hora de cada um**, não agora.

### 6.5 Frequência de integração

**A `development` entra na branch da feature uma vez por dia, no começo do dia, e sempre
antes de abrir PR.** Não "a cada N commits": o gatilho é **tempo**, porque o que apodrece é
a distância em dias e não em commits. Com 15 ramos num lote, um dia é o intervalo que ainda
cabe num conflito que se lê.

**O que roda a cada integração, nesta ordem** (a primeira que reprovar interrompe):

1. `git fetch` e `git merge origin/development` — resolver pelas regras de 6.2
2. **Regenerar os três gerados** se `api/openapi.yaml` mexeu, e conferir que o `git diff`
   dos gerados só tem o que o contrato pediu
3. Suíte do backend — **~2800 casos**
4. Suíte do app — **~1475 casos**
5. Portão de portabilidade — **está em 0 achados e precisa continuar em 0**
6. Portão de contrato público e portão de colunas que não saem
7. `git log --oneline origin/development -5`, para conferir que ninguém andou **durante** a
   integração — foi assim que o PR #15 nasceu obsoleto

**Antes de abrir PR**, reconferir `origin/development` na hora: outra sessão pode ter
consertado antes.

**Cuidados desta frente em particular:** não rodar migração esperando que `make migrar`
reconstrua a imagem — ele aplica as migrações **da imagem**, e sem build você vê o erro
antigo e acha que a correção falhou. E `timeout` **não existe nesta máquina**: prefixar
suíte com ele dá 127 e **parece verde**.

---

## 7. O QUE ELE PRECISA DECIDIR ANTES DE QUALQUER CÓDIGO

Ordenado por quanto bloqueia.

1. **Mesclar `feat/imagem-do-profissional-e-foto-do-usuario` em `development`.** Bloqueia
   tudo. Sem ela a frente constrói sobre coluna que a base não tem.
2. ~~Idade no cadastro~~ — **RESOLVIDO.** Decidido em **16 anos**, fatia fora desta frente e
   já em construção. Resta atualizar os termos, que ainda dizem 18.
3. ~~Quem modera, e em quanto tempo~~ — **RESOLVIDO.** *"quem modera vai ser o administrador,
   deve ir para a página de backoffice."* Era o bloqueio número um. A fila foi despachada; o
   encaixe de E está no item 2.2.1. **O produto continua sem prometer prazo**, e isso é
   deliberado.
4. **A emenda 2 do ADR-0010** (pets nomeados no perfil autenticado, só para conexões) — o
   texto está no item 1.2. **Eu não escrevo ADR; ele decide e alguém escreve.**
5. **O bloqueio atravessa a conversa mediada de caso aberto?** Recomendo que sim, com o
   argumento do item 2.1.
6. **As quatro cláusulas de termos** do item 2.3, em especial a recusa permanente de
   reconhecimento facial e de marcação de pessoa.
7. **Confirmar os tetos**: 9 fotos, 150 conexões, 20 pendentes, 10 pedidos/dia.
8. **Confirmar que não haverá busca de pessoas na v1** (item 4.1, *Descoberta*).
9. ~~Um grafo ou dois~~ — **RESOLVIDO.** Um só, amizade simétrica. Não se reabre.
10. ~~Texto livre na timeline~~ — **RESOLVIDO: liberado.** Minha recusa tinha um fundamento só
    (moderação sem dono) e ele deixou de existir. Fica o limite declarado do filtro, que é
    decisão já aceita por escrito pelo cliente.
11. **Aceitar que a descoberta por link morreu**, e que a primeira conexão passa a ser
    ancorada no contexto ou por código presencial (item 4-B.1). Custa crescimento mais lento,
    e é a consequência direta da regra que ele acabou de dar.
12. **A emenda do apelido** (item 4-C.9) — texto pronto, e o que ela emenda é a **exposição**,
    não a natureza do campo. A natureza já está decidida por ele.
13. **Fora da minha mão, e do jurídico:** os termos ainda dizem **18 anos** e ele decidiu
    **16**.

14. **Quem pode disparar comunicado, e com que trava** (item 4-D.5). Hoje não existe caminho
    nenhum, e é o único aviso do produto com alcance total.

15. **Dívida declarada, e é de texto e não de código:** o **item 16 dos próprios termos promete
    pedir novo aceite "quando for o caso"**, e o cliente decidiu em 18/10 **não implementar o
    reaceite por enquanto**. Registro como **dívida declarada, não como tarefa**. Ela soma com a
    outra divergência já aberta — os termos dizem **18 anos** e ele decidiu **16**. São **dois
    pontos** em que o texto jurídico promete o que o produto não faz, e quem resolve é o cliente
    com o jurídico.

16. **Permissão de envio de push na conta de serviço de homologação** — hoje **403**. Sem ela o
    aviso ao tutor **enfileira e não chega**, o que torna a fatia N verde no código e muda no
    aparelho. Não é desenho e não é meu de resolver; fica na lista para não se perder.

**Encerrados nesta rodada e que não se reabrem:** idade (16) · um grafo ou dois (um só) ·
natureza do apelido (identificador escolhido, não é dado pessoal) · faixa do apelido (5 a 20) ·
contas que já existem (são de teste; coluna anulável e nada estoura com nulo) · **quem modera
(o administrador, pelo backoffice)** · **texto livre na timeline (liberado)** · **reaceite de
termos (não se implementa por enquanto)** · reivindicar pet (fora) · formulário de plaquinha (já
existe no perfil do pet).

**Fora de decisão por enquanto, porque não bloqueia nada:** a emenda 3 do ADR-0025 (item
1.1), que só importa quando o check-in voltar.

---

## 8. TESTES

**Nada a rodar**, porque não há código novo. Rodei os portões offline que cabiam só para
confirmar que a árvore não foi suja — resultado no relatório da sessão. **Nenhum esboço de
teste foi escrito.** As duas provas negativas que as fatias vão precisar estão **descritas**
e não implementadas: a isca do item 1.2 (varredura do corpo do perfil nos quatro estados) e
o portão de peso de tela do item 3.1 (≤ 400 KB no perfil, ≤ 500 KB na lista).
