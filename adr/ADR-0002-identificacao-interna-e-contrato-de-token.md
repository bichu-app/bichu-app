# ADR-0002: Identificação interna e contrato de token

**Status:** aceito
**Data:** 2026-09-17

## Contexto

O cliente levantou o receio central do projeto: começar com autenticação simples
e descobrir depois que migrar para identidade federada é caro demais. A análise
mostrou que quase tudo numa migração de identidade é trabalho, e que existe
**um** ponto irreversível: o identificador que o resto do banco referencia.

No Bichu isso é mais grave que na média, porque há um identificador impresso em
plástico na coleira. Papel e plástico não se reemitem.

## Decisão

**`users.id` é UUIDv7 gerado pelo nosso banco**, imutável, e é a única chave que
o resto do sistema referencia. UUIDv7 e não v4 por localidade de índice: a
ordenação temporal evita a fragmentação que o v4 produz em índice B-tree.

**Nunca são chave estrangeira, em nenhuma tabela:** e-mail, telefone, login,
`sub` de provedor externo, id de usuário do Keycloak ou de provedor gerenciado, e
qualquer valor impresso em QR.

**Vinculação com provedor externo em tabela própria desde o dia um**, mesmo sem
login social no MVP:

```sql
user_identities (
  id, user_id, provider, provider_subject,
  email_at_provider, email_verified_at_provider,
  linked_at, last_login_at,
  UNIQUE (provider, provider_subject)
)
```

`provider = 'local'` é a senha. O segredo mora em tabela separada
(`local_credentials`), com acesso próprio, para que a tabela de vínculo possa ser
lida sem expor hash.

**Token de acesso:** JWT **RS256** (nunca HS256, porque chave simétrica não se
substitui por um emissor externo), 15 minutos, com `iss`, `sub`, `aud`, `exp`,
`iat`, `jti` e `kid` no cabeçalho.

**`sub` é o UUID interno do usuário.** Este é o detalhe que compra a liberdade:
no dia em que um Keycloak entrar, os usuários são criados nele com o `id`
forçado igual ao nosso UUID, e o `sub` continua sendo o mesmo valor de sempre.

**JWKS público** em `/.well-known/jwks.json` com **duas chaves desde o início**,
uma ativa e uma de rotação, e documento de descoberta em
`/.well-known/openid-configuration`. O app nunca embute chave.

**Refresh token opaco**, 256 bits, guardado no banco apenas como hash SHA-256,
rotativo a cada uso, com detecção de reuso por família: apresentar um token já
consumido revoga a família inteira. No aparelho, vive em Keychain/Keystore. 7
dias por padrão, 90 dias quando o usuário marca "continuar conectado", que nasce
desmarcado.

**O backend valida contra uma lista de emissores confiáveis**, não contra um
emissor fixo. Uma lista com um item hoje é uma linha de configuração amanhã, e é
o que permite dois emissores coexistirem durante uma virada.

**Autorização e auditoria são nossas**, no nosso banco, chaveadas pelo UUID
interno. Token de provedor prova quem é a pessoa, e nada mais. Modelar permissão
dentro do provedor amarra também a autorização, e aí a migração vira
reengenharia.

## Alternativas consideradas

| Opção | Prós | Contras | Por que não |
|---|---|---|---|
| `id` serial/bigint | índice menor, legível | enumerável: expõe volume e permite varrer a base | id vaza em URL e em log |
| UUIDv4 | simples | fragmenta o índice, sem ordenação | v7 custa o mesmo e ordena |
| `sub` do provedor como PK | uma chave a menos | é exatamente o ponto irreversível que criou o receio do cliente | é o erro que este ADR existe para impedir |
| JWT HS256 | mais simples | chave compartilhada, insubstituível por emissor externo, e quem valida também pode emitir | fecha a porta do Keycloak |
| Sessão por cookie opaco | revogação trivial | o app publicado aprende um mecanismo que o Keycloak não fala | exigiria nova versão do app na migração |
| Refresh como JWT | sem consulta ao banco | não há revogação real nem detecção de reuso | roubo de token ficaria sem resposta |

## Consequências

Fica mais fácil: trocar o emissor sem tocar em nenhuma chave estrangeira,
adicionar login social sem alterar tabela, revogar sessão de verdade, e conviver
com dois emissores durante uma migração.

Fica mais difícil: cada renovação de token consulta o banco (aceitável: são 15
minutos de intervalo por sessão), e a rotação da chave de assinatura passa a ser
uma operação que precisa existir e ser exercitada.

**Não dá para evitar retrabalho em um ponto:** refresh token não migra entre
emissores. No dia da virada, ou todo mundo reautentica uma vez, ou o emissor
antigo continua aceitando renovação por algumas semanas enquanto a base escoa.
Não existe terceira opção.
