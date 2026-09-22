# ADR-0002: Identificação interna e contrato de token

**Status:** aceito, com emenda 1
**Data:** 2026-09-17

**Emenda 1, ACEITA em 21/09/2026:** fica decidido **o que morre quando alguém
sai da conta**. Sair de um aparelho revoga a **família de refresh daquele
aparelho** no servidor, e **não** empurra `sessions_invalid_before`, que é
global e derrubaria os outros aparelhos da mesma pessoa. O token de acesso já
emitido sobrevive até o `exp`, no máximo 15 minutos, e isso é janela residual
declarada, não descuido. O remédio de quem perdeu o aparelho é **sair de todos
os aparelhos**, que é outro verbo e usa o mecanismo global. A emenda está no fim
deste documento e **acrescenta** à seção "Decisão" sem alterar nada do que ela
já diz sobre `users.id`, `sub`, RS256, JWKS ou rotação.

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


---

# Emenda 1 (ACEITA) — 21/09/2026: o que morre no logout

**Provocação:** *"o cache tem que ser apagado, o token da sessão"* (cliente,
21/09). A limpeza do cache no aparelho já é critério de aceite escrito na
BICHUS-81 e na BICHUS-164, e não se repete aqui. O que faltava é a metade que é
de arquitetura: **o token morre só no aparelho, ou é revogado no servidor?**

## 1. A decisão

**São dois verbos, com dois mecanismos, e confundi-los é o defeito.**

| Verbo | O que acontece no servidor | Quando o token de acesso para de valer | Alcance |
|---|---|---|---|
| **Sair** (este aparelho) | revoga a **família de refresh** apresentada | no `exp`, **até 15 min** | só este aparelho |
| **Sair de todos os aparelhos** | empurra `users.sessions_invalid_before` | **menos de 1 s** (SEC-006) | todas as sessões da conta |

**Sair deste aparelho é revogação no servidor, sempre — nunca só apagar no
telefone.** Apagar localmente resolve o caso do aparelho compartilhado, que é o
que o cliente descreveu, e não resolve nada do caso que importa depois: um
refresh que já tenha sido copiado continua renovando por até 180 dias. O refresh
é a credencial de longo prazo; ele tem de morrer onde é conferido, que é o banco.

**E sair deste aparelho NÃO empurra `sessions_invalid_before`.** Essa coluna é
de `users`, quer dizer, **por pessoa e não por sessão**: usá-la no logout comum
derrubaria o tablet e o celular do marido junto, e tornaria "Sair" e "Sair de
todos os aparelhos" o mesmo botão com dois nomes. Quem sai no celular da recepção
do pet shop não está pedindo para cair da própria casa.

## 2. A janela de 15 minutos, dita inteira

O token de acesso é um JWT verificado pela assinatura, e não há como cancelá-lo
individualmente hoje: ele não carrega identificador de sessão. Depois de um
logout comum, o token que estava na memória do aparelho **continua sendo aceito
até o `exp`**, no máximo 15 minutos, e não pode ser renovado, porque o refresh
que o renovaria acabou de ser revogado.

**Isso é aceitável, e o motivo é qual ameaça cada verbo atende.** Para explorar
essa janela é preciso ter extraído o token do aparelho — e quem consegue isso
tem o aparelho, e nesse caso o remédio não é o logout que a vítima não pode
apertar, é "sair de todos os aparelhos", que fecha em menos de um segundo. Pagar
uma consulta a mais em **toda requisição autenticada** para fechar 15 minutos
numa ameaça que já tem remédio melhor é o tipo de custo que se paga para sempre
por um ganho que não se usa.

**O que eu faço agora para não pagar caro depois:** o token de acesso passa a
carregar **`sid`**, o identificador da família de refresh que o emitiu. Ele fica
**sem uso** pela barreira nesta rodada. A razão é estreita e vale o custo zero
que tem: acrescentar campo a um token que já está em aparelho publicado é mudança
de contrato com versão antiga em campo por meses, e o dia em que a revogação por
sessão for necessária é o dia em que ela precisa já estar possível. A conta
técnica ajuda: `autenticar()` **já lê o banco em toda requisição** para conferir
`sessions_invalid_before`; passar a conferir a sessão seria uma junção naquela
leitura, não uma arquitetura nova.

## 3. O defeito que encontrei ao conferir, e que muda o que o backend faz

**`POST /v1/auth/logout` não consegue revogar nada, e responde 204 do mesmo
jeito.**

- O contrato, em `api/openapi.yaml`, declara a operação **sem corpo de
  requisição** (o tipo gerado em `src/shared/types/generated/api.ts` traz
  `requestBody?: never`).
- O manipulador, em `src/modules/identity/adapters/http/routes.ts:437`, lê
  `corpo.refresh_token`.
- `sair()`, em `src/modules/identity/application/auth-service.ts`, só revoga
  **se** o refresh for apresentado: `if (refreshApresentado !== undefined)`.

Quer dizer: um cliente que siga o contrato não manda campo nenhum, a revogação
não acontece, e a resposta é `204` igual. A família continua viva no banco até
vencer por inatividade, e a trilha grava `auth.logout` sem `resourceId`. É a
forma clássica de falha silenciosa: **o sucesso é indistinguível do nada**.

**A correção é de contrato, e ela vem antes do código** (regra de
contract-first): `logout` passa a declarar corpo com `refresh_token`
obrigatório, e a operação passa a responder **400** quando ele falta. Recusar
alto é o ponto: um logout que não revogou precisa ser um erro visível, não um
204.

## 4. O que isto exige do backend, item a item

1. **Contrato primeiro.** `requestBody` com `refresh_token` obrigatório em
   `logout`, `400` declarado, `examples` e `Problem` do 400 como o resto da spec.
   Sem isso, o item 2 não tem como ser exercitado.
2. **`sair()` deixa de aceitar ausência.** Refresh ausente ou que não pertence à
   conta do token vira erro, não caminho silencioso. A conferência de dono que já
   existe (`armazenado.userId === autenticado.conta.id`) fica: ela impede
   derrubar sessão alheia e é a razão de a rota ser autenticada.
3. **Nada de `invalidarTodasAsSessoes` no logout comum.** Ela continua sendo dos
   cinco gatilhos do SEC-006: sair de todos, troca de senha, redefinição, "Não
   fui eu" e exclusão de conta.
4. **Lista de revogação: não existe e não deve nascer.** A pergunta "há lista de
   revogação?" tem resposta arquitetural: a família de refresh no banco **já é**
   a lista, para a credencial que importa, e `sessions_invalid_before` **já é** a
   revogação em massa para o token de acesso. Uma terceira estrutura de token
   negado seria um terceiro lugar para consultar e um terceiro lugar para
   esquecer de consultar.
5. **Tempo de vida: nenhum número muda.** 15 minutos no acesso; 30 dias de
   inatividade no refresh, 180 com "continuar conectado", teto absoluto de 180
   desde a senha. Estão na seção 7.5 do documento de segurança e não são desta
   emenda.
6. **O aparelho de push sai junto**, pelo caminho que a BICHUS-91 já define.
   Notificação da conta anterior chegando a quem está com o aparelho agora é o
   mesmo vazamento do cache, por outro transporte.

## 5. Logout sem rede, que é onde as duas metades se separam

A BICHUS-81 exige que o cache seja apagado **mesmo sem rede**, e ela está certa:
limpeza que depende da resposta do servidor deixa o dado no aparelho exatamente
no caso em que ninguém está olhando.

Isso cria uma assimetria que precisa estar escrita em vez de ser descoberta: **o
apagamento local é incondicional e imediato; a revogação no servidor pode não
acontecer.** O aparelho apaga o refresh do chaveiro antes de conseguir
apresentá-lo, e a família fica viva no banco até vencer por inatividade.

**Não tentar consertar guardando o token até a revogação passar.** Isso inverte
a prioridade: manteria a credencial no aparelho justamente enquanto ele está sem
rede, para proteger de uma cópia que provavelmente não existe. A família órfã é
inalcançável para quem saiu, porque o único exemplar do token foi apagado; ela é
um risco apenas se o token já tinha sido exfiltrado, e esse é, de novo, o caso de
"sair de todos os aparelhos".

**O que o backend deve garantir é que `logout` seja idempotente**: chamado com
uma família já revogada, responde 204 e não erra. Um app que consiga enviar a
revogação atrasada não pode ser punido por isso.

## 6. Um critério de aceite que precisa ser corrigido, e não é meu de corrigir

O **critério 6 da BICHUS-81** diz que, ao sair da conta, *"o refresh token e
revogado no servidor, `sessions_invalid_before` e atualizado"*. A primeira metade
está certa; **a segunda contraria esta emenda**, porque `sessions_invalid_before`
é por pessoa. Implementado ao pé da letra, sair no celular desloga a pessoa em
todos os aparelhos dela, e o comportamento fica indistinguível do "sair de todos"
da BICHUS-125. Registrado na issue.
