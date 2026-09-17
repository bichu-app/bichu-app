# ADR-0003: Autenticação própria no MVP, Keycloak como dívida com gatilho

**Status:** aceito
**Data:** 2026-09-17

## Contexto

O padrão da plataforma manda federar identidade com Keycloak e **não**
implementar login próprio. Este ADR diverge desse padrão, e a divergência
precisa estar registrada com o motivo e com a condição de pagamento.

São 13 dias para o produto inteiro. Keycloak auto-hospedado desde já consome de
4 a 6 deles: container, banco do realm, realm como código, client público com
PKCE para o Flutter, client confidencial para o backend, tema em português para
as telas de senha e de e-mail, SMTP, política de senha, mapeamento de papéis. E
a partir do dia em que existe, Keycloak fora do ar é app fora do ar, com alguém
respondendo por backup e atualização do realm.

Provedor gerenciado foi avaliado e descartado por um motivo concreto de saída: o
Auth0, o candidato com melhor SDK para Flutter, **não exporta hashes de senha por
autoatendimento** — a exportação exige chamado de suporte com formulário assinado
por executivo de nível VP ou superior e devolução cifrada em PGP. Entrar é
rápido; sair é semanas de calendário. Para quem tem o Keycloak como destino
contratado, é a pior opção das três.

## Decisão

**Autenticação própria no backend TypeScript no MVP**, com a forma de um
provedor OIDC definida no ADR-0002.

**Senha:** PBKDF2-HMAC-SHA512, **210.000 iterações**, salt de 16 bytes de CSPRNG,
derivação de 64 bytes, no formato PHC, com algoritmo e parâmetros gravados junto
de cada hash e nunca em configuração global:

```
$pbkdf2-sha512$i=210000$<salt_b64>$<hash_b64>
```

A escolha resolve os dois lados de uma vez: 210.000 iterações com SHA-512 é a
recomendação corrente da OWASP para PBKDF2, e é exatamente o padrão do Keycloak
para `pbkdf2-sha512`, que ele importa e valida nativamente pela Admin API, sem
plugin. **Bcrypt está proibido neste projeto**, por mais que seja o padrão das
bibliotecas de Node: o Keycloak não o entende sem provider de terceiro.

Argon2id é criptograficamente superior e é o padrão do Keycloak desde a versão
25, mas a importação exige acertar memória, paralelismo, versão e tipo além das
iterações, e é aí que migração quebra. Entre o melhor no papel e o que atravessa
a fronteira sem cerimônia, com 13 dias escolhe-se o segundo.

**Política de senha:** mínimo de 10 caracteres, sem exigência de composição, sem
expiração periódica, com recusa por lista de senhas vazadas e por semelhança com
o e-mail e o nome — conforme NIST SP 800-63B. Regra de composição empurra o
usuário para `Senha@123`, que é pior que uma frase longa.

**Gatilhos que disparam a entrada do Keycloak** — o que vier primeiro:

1. o primeiro cliente ou parceiro que exija SSO corporativo;
2. a necessidade de MFA;
3. a segunda aplicação que precise compartilhar esta base de usuários.

**MFA fica no roadmap.** Login social também: não entra no MVP, mas o desenho o
prevê e a tabela `user_identities` existe desde o dia um (ADR-0002).

## Alternativas consideradas

| Opção | Prós | Contras | Por que não |
|---|---|---|---|
| Keycloak desde o dia um | zero migração depois | 4 a 6 dos 13 dias, mais operação e um ponto de indisponibilidade novo | não cabe sem cortar fluxo do MVP |
| Auth0 | mais rápido de integrar, SDK Flutter oficial | saída de hashes por chamado com assinatura de executivo; custo recorrente | torna verdadeiro exatamente o receio que o cliente trouxe |
| Logto ou outro gerenciado de código aberto | mesma engine em nuvem e auto-hospedada | troca o destino contratado por outro produto | a decisão de destino é Keycloak |
| Só login social, sem senha | elimina hash, política e recuperação; 1,5 dia | corta quatro itens pedidos e cria dependência do Google na entrada | opção real de corte se o prazo apertar, não a escolha |
| bcrypt | padrão do ecossistema Node | Keycloak não importa nativamente | forçaria redefinição de senha em massa na migração |

## Consequências

Fica mais fácil: entregar identidade em cerca de 3 dias de backend e 1 de app,
sem conta nova para contratar e sem componente novo para operar.

Fica mais difícil: não há SSO, não há MFA, não há console de administração de
usuário (a administração é por endpoint interno), e a rotação da chave de
assinatura existe no desenho mas não será exercitada dentro do prazo.

Fica registrado como **dívida técnica com gatilho**, e não como escolha
permanente. O dia do pagamento custa de 2 a 4 dias: importar os usuários com o
hash preservado e o `id` forçado, acrescentar o novo emissor à lista, e manter os
dois válidos por algumas semanas.

**Premissa a confirmar:** que a Admin API do Keycloak da versão que vier a ser
usada aceita `id` na criação de usuário. Se não aceitar, o mapeamento fica em
`user_identities` e o pior caso é uma linha a mais por usuário, não uma migração
de chave estrangeira.
