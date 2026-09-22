# ADR-0011: Perfil de profissional criado pela comunidade, com reivindicação posterior

> O título registra a decisão de 17/09. **A emenda 1 de 21/09 a reverteu:** o
> perfil não nasce da comunidade, nasce de convite com aceite. O nome do arquivo
> fica como está porque ADR é registro histórico e há referência a ele em issue,
> comentário e código.

**Status:** aceito, com emenda 1 — **a premissa foi NEGADA**
**Data:** 2026-09-17
**Revisado em:** 2026-09-17 — a avaliacao de uma ideia de area de adocao para ONGs
mostrou que **verificacao nao e propriedade de profissional, e sim de entidade**.
`professional_claims` foi generalizada para `entity_verifications` antes de
existir qualquer linha. A decisao sobre reivindicacao e sobre avaliacao nao muda.

**Emenda 1, ACEITA em 21/09/2026:** a premissa central deste ADR foi respondida
pelo cliente, e a resposta é **não**. O perfil **não** pode ser criado pela
comunidade. O mecanismo passa a ser **convite com aceite, mais semente por
parceria**, e as tabelas ficam autorizadas a existir (*"então crie as tabelas,
isso não é algo que eu tenha que decidir"*, cliente, 21/09). A emenda está no
fim deste documento e **substitui** a seção "Decisão" onde ela diz que o perfil
nasce da comunidade, mais a seção "Se o cliente disser não", que deixa de ser
hipótese e vira o caminho real. O que **não** muda: a verificação ser de
entidade e não de profissional, as três provas aceitas, `verification_level`
explícito em vez de selo genérico, e as três regras sobre avaliação.

## Contexto

O diretório de profissionais é metade do wedge do produto e a base do modelo B2B,
mas **não tem fluxo no MVP**. Ainda assim o esquema precisa nascer agora: criar
essas tabelas na semana seguinte significa migrar banco com produto no ar, e o
modelo de reivindicação muda a forma das tabelas, não só o conteúdo.

A pergunta que o cliente ainda não respondeu: o perfil pode ser criado pela
comunidade, e depois reivindicado pelo profissional mediante prova?

Sem criação pela comunidade, o diretório sofre de partida a frio: ninguém procura
um diretório vazio e nenhum profissional se cadastra num diretório sem público.
Com criação pela comunidade, resolve-se a partida a frio e cria-se um problema
diferente: dado pessoal de terceiro publicado sem consentimento, e reputação
construída sobre alguém que não estava lá.

## Decisão

**Premissa adotada, recomendada por quem define o produto e pendente de
confirmação:** sim, o perfil pode nascer da comunidade e ser reivindicado depois.
O esquema é modelado assim desde já.

```
professionals
  id uuidv7, kind, display_name, about,
  city, state, neighborhood, geo,
  source            -- 'community' | 'self' | 'import'
  created_by_user_id
  claim_status      -- 'unclaimed' | 'claim_pending' | 'claimed' | 'disputed'
  claimed_by_user_id, claimed_at, claim_snapshot_at
  verification_level -- 'none' | 'contact_verified' | 'document_verified'
  crmv_number, crmv_uf, cnpj, phone_e164
  status            -- 'draft' | 'published' | 'hidden' | 'removed'

entity_verifications              -- NAO e tabela de profissional
  id, entity_kind, entity_id       -- 'professional' | 'organization'
  claimant_user_id,
  evidence_kind     -- 'crmv' | 'cnpj' | 'phone_callback' | 'document'
  evidence_ref, submitted_at,
  decision          -- 'pending' | 'approved' | 'rejected'
  reviewed_by_user_id, reviewed_at, rejection_reason

professional_reviews
  id, professional_id, author_user_id, rating 1..5, body,
  service_kind, created_at, edited_at,
  status            -- 'published' | 'hidden' | 'removed'
  moderation_reason,
  UNIQUE (professional_id, author_user_id)

professional_review_replies
  id, review_id, author_user_id, body, created_at
  UNIQUE (review_id)
```

**Prova aceita para reivindicar**, em ordem decrescente de força:

1. **CRMV** com número e UF, para veterinário. É a única prova verificável de
   verdade, e mesmo assim a verificação é manual no início.
2. **CNPJ** do estabelecimento, conferido contra a razão social.
3. **Telefone do estabelecimento**, com retorno de ligação ou código. É a única
   prova disponível para dog walker, sitter, tosador e adestrador, porque para
   essas atividades **não existe conselho nem registro obrigatório**.

**A verificação é de entidade, não de profissional.** Profissional e organização
dividem exatamente uma coisa: provar quem são, e o CNPJ verifica as duas do mesmo
jeito. Tudo o mais difere — profissional é pessoa que presta serviço, recebe
avaliação e pode ter perfil criado pela comunidade; organização possui animais e
transfere titularidade. Se a verificação nascesse presa a `professionals`, a
primeira entidade que não fosse profissional obrigaria a refazê-la, e **refazer
verificação com registro já aprovado é migração com consequência jurídica**, não
apenas de dados. Generalizar agora, antes de existir uma linha, custa o nome da
tabela.

A prova define `verification_level`, derivado da verificação aprovada mais forte
da entidade, e é ele que aparece na interface. Nunca
exibir "verificado" sem dizer o que foi verificado: um selo genérico transfere
para o Bichu uma responsabilidade que ele não tem como sustentar.

### O que acontece com as avaliações quando o profissional assume o perfil

Esta é a parte que o esquema precisa suportar e que costuma ser decidida tarde
demais. Três regras:

1. **As avaliações permanecem.** Elas pertencem a quem as escreveu e ao registro,
   não ao dono do perfil. Apagar por reivindicação transformaria a reivindicação
   em ferramenta de limpeza de reputação, e é o primeiro uso que alguém daria.
2. **Elas são congeladas em um marco** (`claim_snapshot_at`) e a página passa a
   distinguir "antes da reivindicação" de "depois". O profissional não herda
   reputação que não construiu, nem é punido indefinidamente por um perfil que
   não controlava, e quem lê enxerga a diferença.
3. **O profissional ganha direito de resposta pública, uma por avaliação, e
   nunca o direito de apagar.** Contestar é possível, por denúncia, e a remoção é
   decisão de moderação nossa, registrada na trilha com o motivo. Nada some por
   vontade do avaliado.

Uma avaliação por autor por profissional, editável pelo autor, com o histórico
guardado. Avaliação de perfil não reivindicado é permitida e fica visível: é o
que dá valor ao diretório antes de os profissionais chegarem.

### Se o cliente disser não

Se a criação pela comunidade for recusada, muda pouco no esquema e muito no
produto:

- `source` fica sempre `'self'`, `claim_status` nasce `'claimed'`, e as tabelas
  `professional_claims` e `professional_review_replies` ficam sem uso por
  enquanto. **Nenhuma migração destrutiva**, e é por isso que modelar agora pelo
  caso mais rico é a escolha barata.
- O diretório passa a depender de captação ativa de profissionais antes de ter
  público, o que empurra o valor do wedge para bem depois de outubro.
- A métrica de 25% dos tutores abrindo perfil de profissional perde sentido no
  primeiro trimestre, porque não haverá perfis para abrir.

## Alternativas consideradas

| Opção | Prós | Contras | Por que não |
|---|---|---|---|
| Só perfil autocriado | zero dado de terceiro sem consentimento | partida a frio: diretório vazio | mata o wedge no primeiro trimestre |
| Comunidade cria e o titular pode apagar tudo ao assumir | simpático ao profissional | vira lavagem de reputação | destrói a confiança do diretório |
| Comunidade cria e nada muda ao assumir | simples | o profissional herda avaliações de um período em que não respondia pelo perfil | injusto nos dois sentidos |
| Importar base pública de estabelecimentos | volume imediato | dado de origem incerta, qualidade ruim, e um problema de LGPD em escala | não no MVP; `source: 'import'` fica previsto |
| Sem avaliação, só cadastro | sem moderação | diretório sem reputação é lista telefônica | a reputação é o produto |

## Consequências

Fica mais fácil: ligar o diretório em outubro sem tocar no esquema, e ter o que
mostrar antes de ter profissionais cadastrados.

Fica mais difícil: **moderação é obrigatória a partir do dia em que o diretório
for ligado**, e ela é trabalho humano recorrente. Perfil criado pela comunidade
sobre uma pessoa física (dog walker autônomo) é tratamento de dado pessoal de
terceiro: exige canal de oposição, remoção atendida em prazo, e alguém que
responda. Nada disso é código.

Risco registrado, de severidade alta para a fase 2: responsabilidade do Bichu
sobre o que o selo comunica. O caminho de mitigação é o `verification_level`
explícito, nunca um selo genérico de "profissional verificado".

**Esta decisão precisa de confirmação do cliente antes da primeira migração que
crie estas tabelas.** A premissa está adotada; se ela cair, o parágrafo "se o
cliente disser não" descreve o ajuste, e ele não é destrutivo.


---

# Emenda 1 (ACEITA) — 21/09/2026: a premissa caiu, e as tabelas nascem

## 1. Rastreabilidade: quando e como a premissa foi confirmada

A **BICHUS-102** (*"BLOQ-6 Confirmar a premissa do perfil de profissional criado
pela comunidade (ADR-0011)"*) foi fechada em 21/09/2026. Ela dizia, na própria
definição de pronto: *"Ha sim ou nao registrado, e o ADR-0011 sai de 'proposto'
para 'aceito' ou 'rejeitado'."* O `sim ou não` existe; a segunda metade não foi
feita, e é o que esta emenda faz.

O registro é o comentário de 21/09 às 17:56 na BICHUS-102, com as palavras do
cliente:

> "Não, o perfil do usuário não pode ser criado pela comunidade."

**A confirmação cobre o que este ADR pedia? Cobre, mas não ao pé da letra, e a
diferença precisa ficar escrita em vez de ser carimbada.** A pergunta era sobre
o perfil do **profissional**; o cliente respondeu sobre o perfil do **usuário**.
São palavras diferentes para o mesmo mecanismo — publicar perfil de terceiro sem
o consentimento dele —, e eu trato a resposta como valendo para os dois por três
razões, nesta ordem:

1. **O mecanismo é idêntico e o risco é o mesmo.** O que este ADR chamava de
   "dado pessoal de terceiro publicado sem consentimento, e reputação construída
   sobre alguém que não estava lá" não muda de natureza porque a pessoa é
   veterinária. O dog walker autônomo é pessoa física, e este ADR já dizia isso
   na seção "Consequências".
2. **As outras decisões do cliente no mesmo dia apontam para o mesmo lado.** Em
   21/09 ele fechou a página pública do tutor em três campos, com consentimento
   explícito e nascendo desligada (BICHUS-174). Ler "não" como um "não" estreito,
   que valeria só para tutor, seria construir a leitura mais permissiva sobre uma
   inferência, no mesmo dia em que a leitura restritiva foi tomada duas vezes.
3. **Errar para o lado restritivo é reversível e o contrário não é.** Se o
   cliente quiser depois liberar criação pela comunidade para um recorte
   específico, isso se faz sem apagar nada. Perfil publicado sem consentimento e
   depois retirado já foi publicado.

**A uma linha que fica pendente, e que não bloqueia nada:** confirmar com o
cliente que o "não" vale também para profissional. Qualquer uma das duas
respostas mantém o esquema abaixo intacto, e é por isso que ela não segura a
migração.

## 2. A regra que substitui a premissa, e que precisa sobreviver a um mês

A pergunta "o perfil do usuário não pode ser criado pela comunidade, mas o do
profissional pode?" vai ser reaberta, então ela fica respondida aqui com a
distinção que de fato existe.

**Não existe diferença entre "usuário" e "profissional" que sustente a
permissão.** O rótulo não é o critério. O que varia de caso para caso são três
coisas, e nenhuma delas isoladamente libera criar perfil:

| O que varia | Exemplo que parece liberar | Por que não libera |
|---|---|---|
| O dado é comercial e publicado pela própria entidade | endereço e telefone de clínica no site dela | republicar dado comercial é uma **listagem**; vira **perfil** no momento em que algo se acumula sobre ele |
| A entidade é pessoa jurídica, não física | clínica com CNPJ | o CNPJ tem dono, e a reputação que se acumula alcança pessoas |
| A entidade tem ou não reputação atrelada | um diretório sem avaliação | mas a reputação **é o produto** (seção "Alternativas"), então esse caso não existe aqui |

A regra única, que cobre tutor, profissional e organização com uma frase só:

> **Nenhum perfil nasce sem o aceite de quem ele descreve.** O que a comunidade
> pode fazer é **convidar** e **avaliar o que já existe** — nunca criar.

Isso preserva integralmente a parte da ideia original que tinha valor: a
comunidade gera **demanda**, e não conteúdo sobre terceiros.

## 3. O mecanismo que entra no lugar

Registrado na BICHUS-102 por quem define o produto, e adotado aqui:

1. **Convite pelo tutor, com aceite do profissional.** O tutor indica; o sistema
   convida; **o perfil só nasce quando a pessoa aceita**. Antes do aceite não
   existe linha em `professionals`.
2. **Semente por parceria.** ONG ou clínica que aceite entrar de saída. A mesma
   porta da parceria de adoção, e as duas já dividem `entity_verifications`
   neste modelo.

**O que isso muda no esquema, e é pouco:** `source` perde `'community'` e ganha
`'invited'`; `claim_status` nasce sempre `'claimed'`, porque quem aceitou é o
titular. Os campos continuam os mesmos. Era exatamente o que a seção "Se o
cliente disser não" previa, e ela estava certa: **nenhuma migração destrutiva**.

**O que isso muda nas avaliações, e não é pouco:** `claim_snapshot_at` e a
distinção "antes da reivindicação / depois" existiam porque havia um período em
que o perfil rodava sem dono. Com convite e aceite, **esse período deixa de
existir**, e o marco perde a razão de ser no caminho normal. A coluna fica, sem
uso, por um motivo estreito e real: `source = 'import'` continua previsto no
ADR, e um dia em que ele for usado o marco volta a significar algo. Coluna nula
custa nada; recriá-la com avaliação já gravada custa migração com consequência.

**Risco que o convite NÃO resolve, e que não é meu de decidir:** convidar um
profissional exige que o tutor entregue o e-mail ou o telefone dele. Isso
continua sendo dado pessoal de terceiro — não publicado, mas tratado. Precisa de
base legal, texto de convite que diga quem indicou, e recusa que impeça novo
convite. Registrado aqui porque o esquema vai carregá-lo; a decisão é de produto
e de quem responde por privacidade.

## 4. O que `professionals` pode espelhar, depois da página do tutor de 21/09

A BICHUS-174 fechou a página pública do **tutor** em três campos, com handle
opaco e proibição explícita de localização em qualquer precisão. **Isso não se
aplica a `professionals`, e a diferença é legítima:** a página do tutor é uma
pessoa que não pediu para ser achada; o perfil do profissional é uma entidade que
**aceitou** aparecer para ser contratada, e cidade, bairro e telefone comercial
são o conteúdo útil dela. Um diretório de serviços sem onde a pessoa atende não é
diretório.

Duas coisas, porém, atravessam de lá para cá e viram regra aqui:

1. **`created_by_user_id` nunca sai do servidor.** Com criação pela comunidade,
   ela era "quem cadastrou". Com convite, ela vira **"quem convidou"**, que é um
   **vínculo entre duas pessoas** — exatamente o que a BICHUS-174 proíbe expor em
   superfície pública, inclusive na forma de contagem e inclusive na forma da
   existência. A coluna fica, porque a trilha precisa dela; ela não entra em
   nenhuma resposta pública, e isso é critério de reprovação em revisão.
2. **Nenhuma superfície de profissional referencia pet nem tutor.** O vetor de
   agrupamento que a BICHUS-174 descreve (o observador junta, a resposta não
   junta) vale igual aqui: um profissional que listasse os pets que atende
   entregaria o agrupamento pela terceira porta.

## 5. A migração: o recorte para quem for implementar

**Escopo autorizado pelo cliente: duas tabelas, `professionals` e
`entity_verifications`.** Isto é especificação de fronteira, não a migração —
quem implementa escreve o SQL.

### 5.1 O que "nenhuma migração destrutiva" quer dizer, em obrigações

Este ADR usa a expressão três vezes e ela precisa virar regra verificável:

- **Só `CREATE`.** Nenhum `DROP`, nenhum `ALTER ... DROP COLUMN`, nenhum
  `ALTER ... TYPE` em tabela existente. Esta migração não toca em nada que já
  existe, `users` inclusive.
- **Nenhuma FK nova apontando para fora destas duas tabelas além de
  `users.id`.** ADR-0002: `users.id` UUIDv7 é a única chave que o resto do
  sistema referencia; e-mail, telefone, `sub` externo e qualquer valor impresso
  em QR **nunca** são chave estrangeira.
- **Toda coluna nova de domínio fechado nasce com `CHECK`**, não com `enum`
  nativo do Postgres: acrescentar valor a um `enum` nativo é DDL, e o ponto
  inteiro desta migração é não precisar de DDL com produto no ar. `source` vai
  ganhar `'invited'` hoje e provavelmente outro valor depois.
- **Reversível para trás:** como só cria, o `down` é `DROP TABLE` das duas, e ele
  só é seguro enquanto não houver linha. Depois da primeira linha, o `down` deixa
  de ser reversão e vira perda; dizer isso no comentário da migração.
- A tabela nasce **vazia e sem fluxo**. Nenhuma rota do contrato passa a
  escrever nela nesta rodada.

### 5.2 `professionals` — colunas, como o ADR já as descreve

Mantidas do bloco da seção "Decisão", com as três correções da emenda marcadas:

```
id                  uuidv7, PK
kind                CHECK (lista fechada de atividade)
display_name        obrigatório
about               opcional
city, state, neighborhood, geo      -- permitidos aqui; ver seção 4
source              CHECK ('self' | 'invited' | 'import')   -- ALTERADO: sai 'community', entra 'invited'
created_by_user_id  FK users.id, NULL    -- "quem convidou". NUNCA sai do servidor (seção 4)
claim_status        CHECK ('unclaimed' | 'claim_pending' | 'claimed' | 'disputed')
                    -- nasce 'claimed' no caminho normal; os outros três ficam
                    -- para 'import' e para disputa
claimed_by_user_id  FK users.id, NULL
claimed_at          NULL
claim_snapshot_at   NULL    -- sem uso no caminho normal (seção 3), mantida
verification_level  CHECK ('none' | 'contact_verified' | 'document_verified')
                    -- DERIVADO da verificação aprovada mais forte. Nunca
                    -- escrito à mão por rota de escrita de perfil
crmv_number, crmv_uf, cnpj, phone_e164
status              CHECK ('draft' | 'published' | 'hidden' | 'removed')
created_at, updated_at
```

Índices que a primeira consulta real vai exigir e que custam nada agora: um
geoespacial sobre `geo` (o produto já usa PostGIS, ADR-0006), e um parcial sobre
`status = 'published'`, porque toda leitura pública filtra por ele.

### 5.3 `entity_verifications` — e o que a torna diferente

```
id                  uuidv7, PK
entity_kind         CHECK ('professional' | 'organization')
entity_id           uuid       -- SEM FK: ver abaixo
claimant_user_id    FK users.id
evidence_kind       CHECK ('crmv' | 'cnpj' | 'phone_callback' | 'document')
evidence_ref        -- referência ao documento, NUNCA o documento
submitted_at
decision            CHECK ('pending' | 'approved' | 'rejected')
reviewed_by_user_id FK users.id, NULL
reviewed_at, rejection_reason
created_at
```

**`entity_id` não tem chave estrangeira, e isso é decisão e não esquecimento.**
A tabela é polimórfica por desenho — é o item que a revisão de 17/09 deste ADR
generalizou justamente para que a primeira entidade não-profissional não
obrigasse a refazê-la. Postgres não expressa FK condicional ao valor de outra
coluna, e as saídas usuais custam mais do que compram: uma FK por tipo com
`CHECK` cruzado engessa o acréscimo do terceiro tipo, e a tabela de super-tipo é
uma indireção a mais para um diretório que ainda não tem uma linha. **A
integridade fica na aplicação, e isso precisa estar escrito na migração**, senão
a próxima pessoa "conserta" acrescentando a FK e desfaz a generalização.

**`evidence_ref` guarda referência, nunca conteúdo.** CRMV, CNPJ e documento são
dado sensível de terceiro; o objeto vive no armazenamento privado com URL
assinada (ADR-0007), e esta tabela guarda o ponteiro. Documento em coluna de
texto é o caminho curto que vira incidente.

### 5.4 O que NÃO entra nesta migração

- **`professional_reviews` e `professional_review_replies`.** Não foram
  autorizadas e não são urgentes pelo mesmo argumento: o modelo de avaliação
  **mudou** com a queda da premissa (seção 3), e criar agora uma tabela cuja
  regra acabou de mudar é o oposto de evitar migração futura. Elas entram quando
  o fluxo de convite estiver desenhado.
- **`professional_invitations`.** Ela **vai** ser necessária, porque convite com
  aceite exige guardar o convite. Não a incluo por conta própria: o fluxo não
  está desenhado (quem convida, o que o convite carrega, validade, o que uma
  recusa impede), e tabela criada antes do fluxo nasce com as colunas erradas.
  **Registro a recomendação e o motivo:** pelo argumento deste ADR, criá-la junto
  seria mais barato que criá-la depois; a decisão é do cliente, e enquanto ela
  não vier, esta é uma migração futura **conhecida**, não uma surpresa.

### 5.5 A fronteira de quem implementa

Pode: escrever o SQL das duas tabelas, os `CHECK`, os índices, os comentários de
coluna, e o teste que prova que a migração sobe e desce numa base limpa.

Não pode, sem voltar aqui: acrescentar tabela, acrescentar FK em `entity_id`,
usar `enum` nativo, trocar `CHECK` por tabela de domínio, tocar em `users`, ou
expor qualquer uma das duas tabelas no contrato. **Nenhuma operação de
`api/openapi.yaml` muda nesta rodada.**
