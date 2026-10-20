# ADR-0010: Privacidade e LGPD — retenção, dado de terceiro e o que a rota pública jamais exibe

**Status:** aceito, com emendas 1, 2, 3 e 4
**Data:** 2026-09-17

**Emenda 1, 23/09/2026 (ADR-0027 item 13):** o ponto de um encontro publicado
da `Rede` sai em resposta **autenticada** do app. Escopo fechado; os itens 4 e
5 continuam valendo para tudo o mais. Ver o fim do documento.

**Emenda 2, 19/10/2026 (decisão do cliente):** o **item 7** passa a ter uma
exceção de escopo fechado — a **contagem** de pets de uma pessoa sai no perfil
dela em resposta **autenticada** (`getPersonProfile`). Nome, miniatura, slug e
link de pet continuam proibidos, e o item 7 continua inteiro em superfície
alcançável sem conta. Ver o fim do documento.

**Emenda 3, 19/10/2026 (decisão do cliente):** a **foto de perfil** de uma
pessoa passa a sair para **outra** pessoa em uma superfície, e só nela: o
participante da **conversa mediada**, e **apenas quando as duas já aceitaram
conexão**. O apelido viaja junto, pelo mesmo predicado, porque é ele que dá
endereço ao toque. Para quem **não** é conexão aceita — inclusive o estranho
que escaneou a plaquinha — nada disso sai, e é ali que o motivo da regra
anterior continua inteiro. Ver o fim do documento.

**Emenda 4, 20/10/2026 (decisão do cliente):** a **listagem pública de
perdidos** passa a poder devolver, sob pedido explícito, o caso **encerrado com
reencontro pela comunidade**, por uma janela de **30 dias** contada do
encerramento. É exposição nova e não reformatação: hoje encerrar o caso remove o
animal da superfície pública no mesmo instante. A janela é o limite, e ela é
predicado de servidor. Nenhum campo novo além do booleano `found_by_community`;
o nível máximo de precisão geográfica continua **bairro e cidade**. Ver o fim do
documento.

## Contexto

O produto trata três categorias sensíveis ao mesmo tempo: localização de
pessoas, foto que pode identificar lugar, e dado de contato de alguém que **não
é usuário** (o achador que ajudou e foi embora). Some-se o golpe do falso achador,
que é padrão conhecido no Brasil, e a regra deixa de ser de tela e passa a ser
estrutural.

"Não expor endereço" precisa ser propriedade do esquema e do contrato, não
lembrete de quem escreve a interface.

## Decisão

### Bases legais (Lei 13.709/2018, art. 7º)

| Tratamento | Base legal |
|---|---|
| Conta, pet, caso, conversa mediada | execução de contrato (art. 7º, V) |
| Alerta geolocalizado a tutores próximos | legítimo interesse (art. 7º, IX), com oposição por desligar a localização |
| Localização precisa e push | consentimento do titular, revogável nas configurações do sistema |
| Perfil público por `@slug` | consentimento, por opt-in explícito |
| Perfil de profissional criado pela comunidade | legítimo interesse, com direito de oposição e canal de remoção (ver ADR-0011) |
| Trilha de auditoria | cumprimento de obrigação e exercício regular de direito |

### Retenção, por dado

| Dado | Retenção | Observação |
|---|---|---|
| Localização de referência do usuário | **só a última**, quantizada a ~100 m, validade de 30 dias | sem histórico; apagada ao sair da conta e ao excluir a conta |
| Última localização do pet no caso | precisa enquanto o caso estiver aberto | 30 dias após o encerramento, reduzida a rótulo de bairro; apagada em 12 meses |
| Local do achado | igual ao acima | nunca exposta em rota pública |
| Leituras da tag | 90 dias, com **HMAC-SHA-256 do IP com chave secreta rotacionada a cada 90 dias**, e /24 antes do HMAC; nunca IP em claro e nunca hash puro (SEC-010) | serve para detectar clonagem e abuso |
| Dados do achador sem conta (nome e um canal) | vida do caso mais 30 dias | é dado de terceiro coletado com finalidade única |
| Mensagens da conversa mediada | 12 meses após o encerramento | prova em caso de denúncia de extorsão |
| Fotos | ver ADR-0007 | expurgo 30 dias após exclusão |
| Trilha de auditoria | 24 meses | apenas inserção, esquema e papel de banco separados |
| Conta excluída | exclusão lógica imediata, expurgo em 30 dias | casos encerrados e tags revogadas na hora |

### O que a rota pública jamais exibe

Vale para `/t/<codigo>`, `/@<slug>`, `/cartaz/<token>`, a listagem pública de
perdidos e **qualquer JSON que as sirva**:

1. telefone, e-mail e qualquer endereço de contato, de quem quer que seja;
2. endereço, CEP e número de residência;
3. sobrenome do tutor — só primeiro nome ou apelido;
4. coordenada de qualquer precisão, do pet ou de pessoa, mesmo arredondada,
   mesmo em campo "aproximado", mesmo dentro de metadado de imagem;
5. mapa com pino, em qualquer zoom;
6. `pet_id`, `user_id`, `case_id` ou qualquer UUID do banco — **sem exceção**.
   A versão anterior desta regra abria um parêntese para o `case_id` na listagem
   pública e com isso se contradizia (SEC-002): UUIDv7 é ordenável e carrega o
   instante de criação, então publicar um por caso entrega a base inteira como
   telemetria. A chave estável da listagem é o `share_token` opaco, que o link
   de compartilhamento já carrega;
7. outros pets do mesmo tutor, e qualquer coisa que permita agrupá-los;
8. histórico de casos anteriores do pet;
9. código de outra tag, ou qualquer parte dele;
10. dado de outro achador, inclusive a existência dele.

O nível máximo de precisão geográfica em superfície pública é **bairro e
cidade**. Este item é requisito de aceite e vale como critério de reprovação em
revisão de PR.

**Uma exceção com escopo, e ela é regra e não permissão:** o cartão de manejo
(`pets.care_notes`, até 280 caracteres) aparece na página do achador
(`/t/{code}`), na página pública do caso e no cartaz, e **nunca** no perfil
público por `@slug`. A diferença é o tempo de vida e o público: mostrar a quem
está com o animal na mão que ele toma medicação é o que faz o animal ser bem
cuidado nos próximos minutos; deixar isso numa página indexável e permanente é
outra coisa. Dado de saúde do **animal** não é dado sensível do titular — mas
nome de clínica, nome do tutor e endereço são identificação por outro caminho, e
por isso o campo passa pela mesma redação das mensagens do canal mediado antes
de ser gravado. Ele não tem interruptor de visibilidade de propósito: um campo
cuja única finalidade é aparecer, guardado sem aparecer, é retenção sem
finalidade — a forma de não publicar é não preencher.

### Dado de quem achou e não é usuário

Coleta **opcional** e mínima: um nome de exibição e um canal de contato, e nada
mais. Finalidade única e declarada na própria tela: avisar a resposta do tutor e
o desfecho do caso. Não vira conta, não entra em lista, não recebe comunicação de
produto. O token de acesso à conversa é opaco, tem escopo de uma conversa só, e
não carrega dado pessoal. O apagamento é automático 30 dias após o encerramento
do caso, sem o titular precisar pedir.

### Direitos do titular

`DELETE /v1/me` e `POST /v1/me/data-export` existem desde o MVP. O atendimento
pode ser operacionalmente manual no início, mas o pedido é registrado, datado e
auditado — é isso que torna o prazo verificável.

### Duas consequências que precisam estar ditas

- **Não há recompensa intermediada no produto, em nenhuma forma.** É decisão de
  segurança contra o golpe do falso achador, e por isso a conversa mediada redige
  telefone, e-mail e endereço antes de entregar a mensagem, explicando ao
  remetente o que foi retirado.
- **A trilha de auditoria não pode morar junto do log da aplicação.** Esquema
  próprio, papel de banco sem `UPDATE` nem `DELETE`, e leitura restrita. Trilha
  com o mesmo acesso do log não serve para o que auditoria existe.

## Alternativas consideradas

| Opção | Prós | Contras | Por que não |
|---|---|---|---|
| Mostrar ponto aproximado no mapa público | ajuda quem procura | o conjunto de pontos reconstrói a rotina e a casa do tutor | rastreamento de pessoa disfarçado de utilidade |
| Guardar histórico de localização | heurísticas melhores depois | acúmulo sem finalidade declarada | minimização (art. 6º, III) |
| Exigir conta do achador | rastreabilidade | destrói o fluxo mais crítico do produto | a exceção permanente é decisão fechada |
| Guardar IP em claro nas leituras | investigação mais fácil | dado pessoal acumulado sem necessidade | o HMAC com chave atende detecção de abuso |
| SHA-256 do IP, sem chave | simples | 4,3 bilhões de endereços IPv4 são percorridos em minutos: hash reversível não é anonimização | HMAC com chave secreta e rotação |
| Consentimento para tudo | juridicamente simples | consentimento revogado desligaria o alerta que é o núcleo do serviço | legítimo interesse é a base adequada, com oposição |

## Consequências

Fica mais fácil: auditar a superfície pública, porque a lista do que nunca sai é
finita e verificável em teste.

Fica mais difícil: nenhuma tela de mapa público, e o suporte não consegue
reconstruir o trajeto de um caso.

Aberto e dependente do cliente: quem responde pelos pedidos de titular, qual
endereço de contato do encarregado aparece na política de privacidade, e quem
assina os textos de termos e privacidade. Sem isso, a rota pública não pode ir ao
ar com link de política funcionando.


---

# Emenda 1 — 23/09/2026: o ponto do encontro da `Rede`, em resposta autenticada

**Decisão do cliente, 23/09:** o app mostra ao tutor o ponto do encontro da
`Rede` no mapa.

**O que muda, e só isto:** a coordenada de um evento da `Rede` com
`publication_status` em `published` ou `cancelled` sai na operação
`getNetworkEventLocation`, que exige conta (`bearerAuth` sem alternativa
vazia). Os itens 4 e 5 continuam valendo sem exceção para coordenada de pessoa,
de pet, de caso e de achado, em qualquer superfície, e mapa com pino continua
proibido em superfície alcançável sem conta.

**Por que a regra não se aplica a este ponto:** os itens 4 e 5 existem porque
coordenada localiza pessoa ou animal. O ponto de um encontro numa praça
localiza um lugar público. O risco real é o "encontro" marcado numa residência,
e nenhum `CHECK` distingue praça de casa. A garantia é humana e rastreável, e
está no item 13 do ADR-0027: só administrador cria evento na v1; publicar,
mover e cancelar avisa todos os administradores; mover e cancelar exigem
reautenticação; tudo fica na trilha; e evento criado pela comunidade, quando
existir, só é projetado depois de revisão humana.

**Por que numa operação própria:** a listagem da `Rede` é pública e o detalhe
tem autenticação opcional. Pôr o ponto em qualquer das duas faria a resposta
mudar conforme o chamador, que é o que o ADR-0021 proíbe, e o portão de
contrato público trata autenticação opcional como pública.

A trilha de auditoria continua sem coordenada bruta: a mudança do ponto grava
`{"point_changed": true}`, nunca o valor.

---

# Emenda 2 — 19/10/2026: o perfil de outra pessoa, e a contagem de pets

**Decisão do cliente, 19/10/2026.** A pergunta foi o que alguém que **não é
conexão** pode ver no perfil de outra pessoa. A resposta, literal:

> "ele pode ver nome, quantidade de pets, conexões, mas não as fotos publicadas
> e nem a timeline do usuário"

## O que muda no item 7, e só isto

O item 7 proíbe *"outros pets do mesmo tutor, e qualquer coisa que permita
agrupá-los"*, e **a contagem agrupa**: dizer "3 pets" afirma que aquelas três
fichas têm o mesmo tutor, mesmo sem nomear nenhuma. A decisão acima emenda esse
item, e a emenda é de escopo fechado:

- **sai** o número de pets da pessoa (`pets_count`), **só** na operação
  `getPersonProfile`, que exige conta (`bearerAuth` **sem** alternativa vazia);
- **não sai** nome, apelido, miniatura, foto, espécie, raça, link nem qualquer
  outro atributo de pet — nem para quem já é conexão. O que o cliente liberou
  foi a quantidade, e a quantidade é o que está liberado;
- **o item 7 continua inteiro** em `/t/<codigo>`, `/@<slug>`, `/cartaz/<token>`,
  na listagem pública de perdidos e em qualquer JSON que as sirva. Nada aqui
  abre superfície alcançável sem conta.

O item 6 **não** é emendado: o perfil é endereçado pelo **apelido**
(`users.handle`, tabela `handles`), e o único outro identificador que sai é
`users.public_ref` — opaco, sorteado, 22 símbolos, que denunciar e bloquear já
usam. Nenhum UUID.

## As conexões: a CONTAGEM, e esta é uma interpretação a confirmar

O cliente escreveu "conexões" numa lista de coisas que se vê. **Foi lido como a
contagem, e não como a lista de quem são**, e a leitura está declarada aqui
porque ela não é óbvia:

- a lista de conexões **não aparece a ninguém, nem ao dono** (plano 4-B:
  *"Lista de conexões | nunca | nunca"*), não existe no contrato, não existe
  `GET /connections`, e o portão `sem-lista-de-conexoes.test.ts` reprova
  operação nova que devolva pessoas conectadas;
- contagem não diz **quem**, e é exatamente essa diferença que a torna mostrável
  onde a lista não é. Ela é o "sinal de confiança" do plano 4-B;
- a lista, mostrada a um estranho, entregaria a rede social de alguém a quem não
  tem relação com ela — e isso ele não pediu.

**Pendência de confirmação com o cliente**, nestes termos: *"conexões" no perfil
de outra pessoa é o número (`12 conexões`), e não a lista de quem são. Confirma?*

## O que NÃO sai, e cada ausência tem dono

| Não sai | Por quê |
|---|---|
| fotos da vitrine, para quem **não** é conexão | literal do cliente ("não as fotos publicadas"), e o portão `vitrine-nao-sai-para-terceiro.test.ts` continua reprovando |
| timeline, publicação, curtida, contador | ele recusou a timeline nesta frase, e ela **não existe** no produto: a migração `20261018000030` registra *"uma timeline de quem você segue É a lista de presença com hora... Encerrado, não se reabre"* |
| cidade, bairro, qualquer recorte geográfico | **ele não mencionou nenhum dos dois**, e o item 4 e o teto de "bairro e cidade" desta seção não são permissão para expor onde a pessoa mora a quem não tem relação com ela |
| telefone, e-mail, data de nascimento, sobrenome | itens 1 e 3 desta seção, e `users.birth_date` não sai em resposta nenhuma |
| nome, miniatura, slug ou link de pet | o item 7, que esta emenda abre **só** para a contagem |

## A vitrine para quem JÁ É conexão aceita

Ela **sai**, e só nesse estado. A frase do cliente nega as fotos a quem não é
conexão, e negá-las também a quem é esvaziaria a distinção que ele acabou de
fazer. O que a sustenta tecnicamente é onde a autorização mora (ADR-0021): o
predicado de conexão aceita está na cláusula `WHERE` da própria consulta das
fotos, e não num `if` de camada acima — a consulta que devolveria a vitrine de
quem não é conexão não existe.

O que sai de cada foto é **menos** do que o dono vê: `grid_url`, `open_url` e
`alt_text`. Ficam de fora `status`, `rejection_reason` e `upload_id`, que são
estado de moderação e de edição da **própria** vitrine — motivo de recusa de uma
foto é assunto entre o dono e quem modera.

## O que esta emenda NÃO decide, e portanto continua proibido

- **pets nomeados para quem é conexão.** O plano 4-B previa isso na coluna de
  conectado; o cliente, em 19/10, falou de quantidade. Enquanto ele não decidir,
  vale o item 7;
- **bairro para quem é conexão**, pelo mesmo motivo;
- **como se alcança o perfil de alguém.** Não existe busca de pessoas, não
  existe rota de disponibilidade de apelido (plano 4-C.5) e a descoberta por
  link está morta (plano 4-B.1). Esta emenda diz **o que** o perfil mostra; ela
  não cria caminho de descoberta, e a operação responde o mesmo **404** de
  inexistente para apelido que não é de pessoa, conta desabilitada e par
  bloqueado (ADR-0021, nunca 403).


---

# Emenda 3 — 19/10/2026: a foto na conversa, e só entre conexões aceitas

**Decisão do cliente, 19/10/2026.** A pergunta foi um conflito, e não um
pedido: ele havia pedido, em 18/10, *"a foto do usuário como ícone das
conversas, e a imagem clicada levando ao perfil"*. A frente de mensagens
**recusou a foto, e estava certa.** Três registros independentes a proibiam:

1. **o contrato, por extenso e em DOIS pontos** — `Conversation.participants` e
   `FinderConversation.participants` declaravam `display_name` como *"Primeiro
   nome ou apelido. **Nunca** sobrenome completo, telefone, e-mail nem foto de
   perfil"*;
2. **o ADR-0025, decisão 2** — *"não existe campo com pessoas, em forma
   nenhuma: nem nome, nem primeiro nome, nem apelido, nem `slug`, nem avatar"*;
3. **o plano da comunidade, recusando esta superfície por nome** — *"o avatar
   **não** entra na conversa mediada, e eu recomendo que **não entre nunca**"*,
   por três razões: o achador pode não ter conta (canal assimétrico), a conversa
   vive sob a sombra do **golpe do falso achador** (rosto é insumo de engenharia
   social), e ela é o canal que **atravessa o bloqueio**.

O conflito foi levado ao cliente com as três citações na mesa. A decisão dele,
literal:

> "a foto aparece SÓ quando as duas pessoas já aceitaram conexão"

E o complemento, também dele: em conversa de achado, e em qualquer conversa com
quem não é conexão aceita, **não aparece** — fica a inicial ou o glifo genérico
que já estava lá.

## Por que isto é emenda e não revogação

**O motivo da regra continua protegido, porque a exceção é exatamente o seu
complemento.** O golpe do falso achador é praticado por um **estranho**: alguém
que diz ter achado o pet e quer extorquir o tutor. Esse estranho não é conexão
aceita de ninguém — se fosse, o tutor já o conheceria — e para ele a foto
continua não saindo. A emenda abre o rosto onde as duas pessoas já se
reconheceram, e o mantém fechado onde elas não se reconheceram.

As três razões do plano da comunidade sobrevivem inteiras, e cada uma é atendida
por um predicado e não por uma convenção:

| Razão | Como a emenda a atende |
|---|---|
| o achador pode **não ter conta** | o caminho dele é `FinderConversation`, **schema próprio sem os dois campos**. Quem não tem conta não tem conexão, e não há chamador de quem medir a aresta |
| **golpe do falso achador** | o estranho não é `accepted`, e o predicado está no `WHERE` da consulta: a consulta que traria a foto dele **não existe** |
| a conversa **atravessa o bloqueio** | `NOT bloqueio_entre`, simétrico, **dentro** do mesmo predicado. Bloquear desfaz a conexão, mas são duas escritas, e este predicado cobre a corrida entre elas |

## O que exatamente passa a sair, e onde

**Dois campos, em `Conversation.participants[]`, e em mais nenhuma resposta
deste contrato:**

- **`photo_icon_url`** — a derivada **`thumb` de 176 × 176** da foto única da
  pessoa (`users.photo_image_id`, `catalog_images.purpose = 'user_photo'`).
  **Não é a `card` de 512** que o dono recebe em `getMe`: o ícone da conversa
  pinta 40 dp, 120 px reais a 3x, e a de 512 seria 4,27× mais dado do que a
  célula pinta — dez vezes por página de lista;
- **`handle`** — o apelido, **anulável**. Ele sai porque o toque precisa de um
  endereço: o perfil de outra pessoa é `getPersonProfile`, endereçado pelo
  apelido (decisão do cliente de 18/10). **O item 6 não é emendado**: não sai
  `users.id`, não sai `users.public_ref` e não sai nenhum UUID.

**Sem estado nenhum.** `MyPhoto`, que o dono recebe, tem `status` e
`rejection_reason`; nenhum dos dois é assunto de terceiro — motivo de recusa de
uma foto é entre o dono e quem modera. Foto que não está `ready` simplesmente
não sai, e por isso não há estado a desenhar. É a mesma redução que a emenda 2
fez em `PersonShowcasePhoto`.

## Os cinco estados em que ela NÃO sai, e eles foram medidos

Medidos no **corpo real da resposta**, contra Postgres, em
`tests/integration/foto-na-conversa-entre-conexoes.test.ts` — porque nenhum
portão deste repositório confere o corpo da resposta:

| Estado | `handle` | `photo_icon_url` |
|---|---|---|
| conversa de achado com **não-conexão** (com conta, com nome, com foto pronta) | `null` | `null` |
| **pedido pendente** ou recusado | `null` | `null` |
| **achador sem conta** | o schema não tem o campo | o schema não tem o campo |
| **par bloqueado**, com a aresta `accepted` de pé | `null` | `null` |
| **conta desabilitada** do outro lado | `null` | `null` |

E o estado em que ela sai, nos **dois sentidos** do par: conexão aceita,
`https://<mídia>/thumb/<chave>-176.jpg`.

**O próprio lado de quem chama recebe os dois nulos**, e isso é decisão: a foto
do dono já sai em `getMe`, e repeti-la aqui seria uma terceira superfície dela
sem nenhum consumidor — cada superfície nova de foto de pessoa é uma a mais para
alguém esquecer de proteger.

## Onde a autorização mora, e por que isto não é um `if`

ADR-0021. O predicado de conexão aceita está na **cláusula `WHERE` das
subconsultas** que produzem os dois campos
(`messaging/adapters/persistence/kysely-conversation-repository.ts`), e não num
`if` do serviço nem da borda: chamar a leitura de um caminho novo devolve `NULL`
em vez de foto. É esta metade que sobrevive a alguém mexer no caso de uso.

**Nenhuma leitura nova de conexão em TypeScript.** `LeitorDeConexao` não é
chamado daqui, e isso é decisão: a lista carrega dez conversas por página, e
perguntar a aresta por conversa seriam dez idas ao banco por rolada — além de
mover o recorte para a memória, que é o que o ADR-0021 proíbe. O predicado tem a
**mesma forma** do que `construtorDaVitrineDeConexao` usa para a vitrine da
emenda 2, e cada um é lido por uma isca de SQL própria.

## Uma contradição literal na decisão, e como ela foi resolvida

A frase do cliente tem duas metades, e **medida contra o produto elas se
tocam**: *"a foto aparece SÓ quando as duas pessoas já aceitaram conexão"* e
*"em conversa de achado... não aparece"*.

**Toda conversa deste produto é conversa de achado.**
`conversations.found_report_id` é `NOT NULL` e `UNIQUE`, não existe
`POST /conversations` e não existe mensagem direta entre desconhecidos: a
conversa mediada nasce sempre de um aviso de plaquinha ou de um achado avulso.
Lida ao pé da letra, a segunda metade esvaziaria a primeira — a foto não
apareceria em lugar nenhum, e a decisão não teria efeito.

**A leitura aplicada, e ela está declarada aqui porque não é óbvia:** a regra
que governa é a primeira, que é a que o cliente destacou — **conexão aceita**. A
segunda metade é o complemento dela no caso comum: a conversa de achado é, quase
sempre, com um estranho, e ali a foto não aparece. As duas pessoas que são
conexões e que, por acaso, estão numa conversa de achado (um amigo achou o pet)
recebem a foto.

**Pendência de confirmação com o cliente**, nestes termos: *"toda conversa do
Bichu nasce de um aviso de achado — não existe mensagem direta. Entendi que a
foto aparece quando as duas pessoas são conexões aceitas, inclusive se a
conversa for de um achado; e não aparece com quem não é conexão. Confirma?"*

## O que esta emenda NÃO decide, e portanto continua proibido

- **o ADR-0025 decisão 2 não foi tocado.** O escopo dele é a superfície da
  `Rede`, e a `Rede` continua sem avatar, sem nome e sem apelido de quem fez
  check-in. Nada aqui o alcança;
- **nenhuma outra superfície ganha foto de pessoa.** `getMe` continua sendo a
  única resposta que a traz inteira, com estado; esta é a única que a mostra a
  outra pessoa, e numa derivada menor e sem estado;
- **a vitrine não entra na conversa.** Ela sai só em `getPersonProfile`, pela
  emenda 2, e `Conversation` não a alcança por `$ref` nenhum — o portão
  `vitrine-nao-sai-para-terceiro.test.ts` cobra isso e não foi afrouxado;
- **o apelido não abre caminho de descoberta.** Ele sai de uma conversa que quem
  chama já tem, de uma pessoa que já o aceitou. Não existe busca de pessoas, não
  existe rota de disponibilidade de apelido e a descoberta por link está morta;
- **nenhum identificador interno.** O item 6 continua inteiro: nem `users.id`,
  nem `users.public_ref`, nem UUID de espécie nenhuma em `participants`.


# Emenda 4 — 20/10/2026: o pet reencontrado, por 30 dias, na listagem pública

**Status:** aceita
**Decisão do cliente**, nas palavras dele: *"o pet ganha um selo/filtro na
pagina de pets como encontrado por 30 dias e depois ele expira e sai"*, e, sobre
quem conta como comunidade: *"se o usuário remover que o cachorro estiver
perdido, depois de um usuário ter escaneado a tag do usuário ou ter entrado em
contato"*.

## O que esta emenda abre, e por que ela é emenda e não reformatação

**Medido em 20/10/2026**, contra Postgres de verdade e com o mesmo artefato que
a homologação roda: encerrar o caso remove o animal da listagem pública **no
mesmo instante**.

    antes:  GET /v1/public/lost-pets           -> total 1   ["Medidor"]
    POST /v1/lost-cases/{caseId}/close {"outcome":"reunited"} -> 200
    depois: GET /v1/public/lost-pets           -> total 0   []

A consulta carrega `lost_cases.status = 'open'` desde que existe. Então foto,
nome de exibição, bairro, cidade e data do último avistamento **desapareciam** da
superfície alcançável sem conta no segundo em que o tutor dizia que o animal
voltou. Esta emenda mantém esses mesmos campos visíveis por mais 30 dias, mais um
booleano. **Isso é dado novo em superfície pública**, e é por isso que precisa
estar escrito aqui com data e com dono, e não só no contrato.

## O que exatamente passa a sair, e sob qual pedido

| | |
|---|---|
| **Onde** | `GET /v1/public/lost-pets` (`listPublicLostPets`), e **somente** com `case_state=reunited` no pedido |
| **O que** | os MESMOS campos de `PublicLostPet` que o caso aberto já devolvia, mais `found_by_community: true` |
| **Por quanto tempo** | 30 dias contados de `lost_cases.closed_at`. No 31º dia o caso sai, e sai também deste conjunto |
| **Para quem** | qualquer um, inclusive sem conta — é a mesma superfície da lista de perdidos |
| **Quem decide o prazo** | o **servidor**, por predicado na consulta, com o relógio da aplicação |

**Nenhum campo de precisão geográfica muda.** `area_label` continua sendo bairro
e cidade, montado pela mesma `rotuloDaArea` da lista de abertos. O item 4 (nada
de coordenada) e o item 5 (nada de mapa com pino) ficam inteiros.

## O booleano, e por que não uma data

`found_by_community` é `boolean`. A alternativa natural era `reunited_at`, e ela
foi recusada: a data diria **quando** o animal voltou, e isso é um fato novo
sobre o pet e sobre o lugar numa superfície sem conta — junto de `area_label` e
de `lost_since` ela fecha uma linha do tempo que ninguém pediu. O selo precisa
dizer apenas que voltou. A janela de 30 dias é aplicada pelo servidor e não
precisa ser contável pelo cliente.

Ele sai na resposta, e não é inferido do pedido, por um motivo de implementação
que também é de privacidade: o cartão do pet é componente compartilhado, e cartão
que descobre o estado do animal relendo a URL que o trouxe é cartão que mente na
próxima tela que o reaproveitar.

## O item 6 continua inteiro, e o 7 e o 8 também

- **item 6 (nenhum UUID):** a chave deste conjunto continua sendo o
  `share_token` opaco. Não entra `case_id`, não entra `pet_id`, e o
  `portao-contrato-publico.ts` continua cobrando isso por nome;
- **item 7 (não agrupar os pets de um tutor):** nada nesta emenda liga dois
  itens da lista à mesma conta. Dois reencontros do mesmo tutor na mesma página
  são indistinguíveis de dois reencontros de tutores diferentes, exatamente como
  já acontece com dois casos abertos;
- **item 8 (sem histórico de casos anteriores do pet):** a janela devolve **o**
  caso encerrado que satisfaz os predicados, e não uma lista. Um pet com três
  casos encerrados não produz três itens: o índice único parcial
  `lost_cases_um_aberto_por_pet` só vale para abertos, mas o conjunto é recortado
  pela janela de 30 dias e pelo sinal de comunidade, e nada aqui expõe a
  sequência. O que esta emenda **não** autoriza é uma lista de reencontros por
  pet, por tutor ou por bairro.

## O sinal de comunidade é a CONVERSA, e isso foi medido

O cliente nomeou dois sinais: plaquinha escaneada e contato. O predicado é
**existir conversa ligada ao caso** (`conversations.case_id`), e ele cobre os
dois, porque a conversa nasce de exatamente dois caminhos — os dois únicos
chamadores de `ConversationService.abrirPorAviso`, em `src/bin/api.ts`:

1. `scan_notice` — a plaquinha foi lida e o achador registrou o aviso ao tutor;
2. `found_notice` — o achado avulso foi **confirmado** pelo tutor.

E o `INSERT` da conversa exige `pets.owner_user_id IS DISTINCT FROM` quem avisa.
**Tutor que lê a própria plaquinha não produz selo**, e isso é privacidade e não
só correção: o selo é uma afirmação pública sobre o animal, e uma afirmação
pública que o próprio dono pode fabricar sozinho vale como prova de nada.

**`tag_scans` foi recusada como sinal.** Ela grava a leitura da página, sem
conta, sem identidade e sem mensagem: conta o próprio tutor, o robô que
pré-visualiza o link e quem abriu por curiosidade. A tabela já separa as duas
coisas, em `resulted_in_found_report`.

**`resolution.reunion_channel` não participa.** O enum existe em
`LostCaseClosure` (`tag_scan`, `bichu_alert`, `poster_or_link`, `on_my_own`,
`other`) e **nenhuma tela o preenche** — medido em 20/10/2026, nulo em todo o
dado. Decidir uma exposição pública por um campo vazio seria decidir por
acidente. O cliente escolheu não perguntar na folha de encerramento, e esta
emenda não reabre isso.

## A janela é predicado, e não estado gravado

`closed_at >= agora - 30 dias`, com `agora` vindo do relógio da **aplicação** e
nunca do `now()` do banco (dois relógios na mesma decisão é o defeito que faz
carga falhar sozinha em múltiplo comum, e aqui ele decidiria se um animal aparece
numa página pública).

A alternativa era uma coluna de expiração virada por varredura, e ela foi
recusada por privacidade antes de performance: varredura precisa de agendador, e
agendador falha calado. No dia em que a varredura não roda, o selo **continua na
rua** — e um prazo de retenção que depende de um job é um prazo que não existe.
Predicado não tem dia em que não roda.

## O que esta emenda NÃO decide, e portanto continua proibido

- **a lista de casos abertos não muda.** Sem `case_state`, ou com
  `case_state=open`, a resposta é a de sempre — o SQL compilado é idêntico,
  caractere por caractere, e há isca comparando os dois textos. Reencontrado
  **não** ocupa vaga da página 1 dos abertos: a lista pela qual a vizinhança acha
  o animal que sumiu não foi tocada;
- **encerramento `not_found` e `false_alarm` nunca aparecem**, em nenhuma
  janela. `not_found` é a busca que não acabou bem e `false_alarm` é o caso que
  nunca existiu; publicar qualquer um dos dois seria contar uma história que o
  tutor não autorizou;
- **nenhuma outra superfície pública ganha o reencontro.** A leitura por token
  (`/p/{shareToken}`) continua respondendo `410 lost-case-closed` para caso
  encerrado, e `found_by_community` sai `false` nela de propósito — o campo chega
  lá pelo `allOf` do contrato, não por decisão de produto;
- **nada de contagem, agregado ou vitrine de reencontros.** "Quantos animais
  voltaram neste bairro" é número novo sobre pessoas e lugares, e não está
  decidido;
- **nada de indexação.** A rota continua respondendo `X-Robots-Tag: noindex,
  nofollow` e `Referrer-Policy: no-referrer`, e o selo não muda isso: o animal
  que voltou não pode ficar numa página de busca por mais 30 dias;
- **o tutor continua decidindo.** `share_to_public_list` é predicado dos dois
  conjuntos. Quem nunca deixou o caso aparecer na lista não ganha selo nenhum, e
  isso não precisou de código novo — o predicado já estava lá.
