# ADR-0005: Uma página, duas portas — `@slug` e código da tag

**Status:** aceito
**Data:** 2026-09-17

## Contexto

O mesmo pet precisa ser alcançável por dois caminhos com finalidades opostas. O
`@slug` é um endereço escolhido pelo tutor, bonito, divulgável, feito para ser
compartilhado. O código da tag é aleatório, impresso na coleira e feito para ser
encontrado por um estranho com o animal na mão.

A tentação é unificar tudo numa URL só. Ela está errada: os dois têm tempo de
vida, público, nível de exposição e regra de indexação diferentes.

## Decisão

**Duas rotas, uma página, dois modos.**

| | `/@<slug>` | `/t/<codigo>` |
|---|---|---|
| Origem | escolhido pelo tutor | 128 bits aleatórios (ADR-0004) |
| Mutável | sim | não, nunca |
| Existe por padrão | não: **opt-in** do tutor | sim, ao emitir a tag |
| Público | só quando ligado | sempre que o código for válido |
| Indexável por buscador | sim, é o objetivo | **nunca**: `noindex, nofollow` |
| Modo da página | perfil público | "achei este pet" |
| Ação principal | nenhuma | `Avisar o tutor`, um toque, sem conta |
| Cache | curto, revalidado | `no-store` |

**O perfil público nasce desligado.** Ligar é decisão consciente do tutor, e
desligar responde 404 sem apagar o slug: ele continua reservado para aquele pet,
para que ninguém tome o endereço de um pet que ficou privado por um tempo.

**Slug é mutável, e por isso há histórico.** `pet_slug_history` guarda os
anteriores, e a rota responde **301** para o atual. Sem isso, todo link já
compartilhado quebra na primeira troca de nome, que é justamente quando o tutor
mais divulga.

**Um slug liberado não volta ao pool por 12 meses.** Reciclar endereço faz o
link antigo de um pet apontar para outro animal, e num produto de pet perdido
isso é pior do que um 404.

**A mesma página, o mesmo componente, dois dados diferentes.** O modo achado
mostra o botão e a faixa de "está perdido"; o modo perfil mostra a descrição e,
quando o pet está perdido, o cartaz. Nenhum dos dois expõe telefone, e-mail,
endereço, CEP, sobrenome do tutor, ponto exato, id interno ou os outros pets do
mesmo tutor.

**A tag aponta para `/t/`, sempre**, mesmo quando o pet tem slug. Um QR que
apontasse para o slug quebraria no dia em que o tutor trocasse o endereço, e a
plaquinha já estaria impressa.

## Alternativas consideradas

| Opção | Prós | Contras | Por que não |
|---|---|---|---|
| URL única com slug no QR | um caminho só | slug é mutável e o plástico não | quebra a tag na primeira troca |
| Código como caminho secreto do mesmo slug (`/@nina?c=...`) | uma rota | o slug vira obrigatório e público para todo pet | contraria o opt-in |
| Subdomínio por modo | separação clara | mais um certificado e mais uma origem | prefixo de caminho basta |
| Perfil público ligado por padrão | mais alcance | expõe pet de quem não pediu; LGPD | opt-in é a regra |
| Slug imutável | sem histórico nem 301 | tutor erra o nome no cadastro e fica preso | o histórico é barato |

## Consequências

Fica mais fácil: divulgar o pet sem expor a tag, e trocar o slug sem quebrar
link.

Fica mais difícil: existem duas regras de cache, duas de indexação e duas de
limite de chamadas na mesma página. Quem implementar precisa ler os cabeçalhos
como parte do contrato, e não como detalhe de infraestrutura — eles estão
declarados na spec.

O perfil público por slug está **fora do dia 30** como produto; a rota existe
desde já para não quebrar link e para que a decisão de opt-in já esteja no
modelo de dados.
