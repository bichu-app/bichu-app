# ADR-0011: Perfil de profissional criado pela comunidade, com reivindicação posterior

**Status:** proposto (premissa pendente de confirmação do cliente)
**Data:** 2026-09-17
**Revisado em:** 2026-09-17 — a avaliacao de uma ideia de area de adocao para ONGs
mostrou que **verificacao nao e propriedade de profissional, e sim de entidade**.
`professional_claims` foi generalizada para `entity_verifications` antes de
existir qualquer linha. A decisao sobre reivindicacao e sobre avaliacao nao muda.

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
