# ADR-0019: "Continuar conectado" vale no cadastro, e o prazo da primeira sessão é escolha da pessoa

**Status:** aceito
**Data:** 2026-09-17
**Depende de:** ADR-0003 (autenticação própria no MVP), seção 7.5 de
`docs/04-seguranca.md` (os quatro números da sessão)

## Contexto

A tela `F1.1 Criar conta` mostra uma caixa desmarcada, "Continuar conectado neste
aparelho", com o efeito escrito abaixo: "Você não precisa entrar de novo neste
celular." A caixa está especificada pelo UX, está implementada e está visível no
app.

`RegisterRequest` não tem campo para ela. Só `LoginRequest` tem
`stay_signed_in`. A pessoa marca a caixa, cria a conta, e a escolha morre no
aparelho. A frente mobile registrou isso em comentário no código e não inventou
campo fora da especificação, que era o comportamento certo.

Três fatos que decidem o caso, e nenhum deles é sobre a caixa:

1. **`POST /auth/register` já emite sessão.** Responde 201 com o par de tokens,
   e responde assim de propósito, porque a intenção pendente precisa executar
   logo depois do cadastro. Quer dizer: **não existe a opção de não decidir**.
   Alguma janela de inatividade se aplica à primeira sessão. Hoje aplica-se a
   padrão, em silêncio, e a escolha explícita da pessoa é descartada.
2. **Este é um app de uso raro e urgência máxima**, e a seção 7.5 já tratou
   disso: sete dias de inatividade deslogariam o tutor típico exatamente no dia
   da emergência, e por isso a padrão foi para 30 dias. **A conta recém-criada é
   justamente a que passa mais tempo sem ser aberta**: a pessoa cadastra o pet,
   prende a plaquinha na coleira, e não tem motivo nenhum para abrir o app de
   novo até o dia em que o animal some.
3. **Tirar a caixa não move a escolha para o login, elimina a escolha.** Para
   chegar a `C.2 Entrar` e marcar lá, a pessoa precisaria sair da conta que
   acabou de criar e entrar de novo. Ninguém faz isso, e escrever isso numa
   tela seria constrangedor.

## Decisão

**`stay_signed_in` entra em `RegisterRequest`**, com exatamente a mesma forma, o
mesmo padrão e a mesma semântica que tem em `LoginRequest`. Os dois passam a
apontar para um schema único, `StaySignedIn`, porque duas cópias do mesmo campo
divergem: já divergiram uma vez neste contrato, e o texto que descrevia 7 e 90
dias sobreviveu à seção 7.5 que os substituiu por 30 e 180.

**O que o campo governa, e só isso:**

| `stay_signed_in` | Janela de inatividade | Teto absoluto desde a autenticação com senha |
|---|---|---|
| `false` (padrão) | 30 dias | 180 dias |
| `true` | 180 dias | 180 dias |

**O que ele não faz, e é o que torna aceitável alongá-lo.** Não mexe no token de
acesso, que continua com 15 minutos. Não move o teto absoluto, que vale igual
nos dois casos e existe para que a rotação a cada uso não transforme um refresh
roubado em acesso permanente. E não dispensa a reautenticação com senha das seis
ações sensíveis: trocar senha, trocar e-mail, excluir a conta, exportar dados,
transferir pet e revogar tag. A conveniência fica na navegação; o custo fica no
ato destrutivo. É a mesma troca que a seção 7.5 fez e justificou, e este ADR só
a estende para a primeira sessão, que era a única de fora.

**A resposta diz o prazo.** `SessionResponse.refresh_expires_in` passa a
declarar qual dos dois valores está valendo (2592000 ou 15552000 segundos), e
declara também que é janela de inatividade, não teto. O exemplo estava em 604800
(sete dias), que é um número que a seção 7.5 aposentou.

### A objeção que eu considerei e que não me convence

**"No cadastro o e-mail ainda não foi verificado; não dê 180 dias a uma conta
não verificada."** A objeção parece prudente e é, na verdade, ao contrário.

O produto já não amarra capacidade a prazo de sessão: ele amarra a verificação,
por `pending_profile_fields` e `can_open_lost_case`. Encurtar a sessão não
impede nada que a verificação já não impeça. E o caminho de recuperação de quem
tem o e-mail não verificado é o link mandado para esse mesmo endereço não
verificado, que é o endereço que pode estar errado. Para essa pessoa, a sessão
longa é a única coisa que a mantém dentro do app e capaz de corrigir o
endereço. Encurtá-la não protege: tranca mais rápido, e tranca quem já estava
mais frágil.

## Alternativas consideradas

| Opção | Prós | Contras | Por que não |
|---|---|---|---|
| **Campo entra no `RegisterRequest`** (escolhida) | honra a escolha que a tela já pede; cobre a sessão que mais precisa; custo já pago pelo teto absoluto e pela reautenticação | mais um campo, e o backend precisa lê-lo nos dois caminhos | é a única que resolve, e resolve com o mecanismo que já existe |
| Tirar a caixa de `F1.1` e deixar a escolha só no login | contrato fica como está; zero trabalho | elimina a escolha para a primeira sessão, que é a mais longa e a mais provável de ser a única; obriga sair e entrar de novo para exercê-la | conserta o sintoma (a caixa sem destino) destruindo o que a caixa servia |
| Manter a caixa e guardar a escolha só no aparelho | nenhum trabalho de servidor | o prazo do refresh é do servidor; o cliente não tem como alongar o que o servidor emitiu. A caixa continuaria decorativa, agora com a decoração documentada | é o estado de hoje, com um documento por cima dizendo que está certo |
| Cadastro não emite sessão, e a pessoa entra em seguida por `C.2` | a escolha passa a caber no login sem inventar campo | quebra a intenção pendente, que é a razão de o 201 já vir com tokens; acrescenta uma tela entre criar a conta e cadastrar o pet, no funil que o produto menos pode perder | troca um campo de contrato por uma queda de conversão no único cadastro que importa |
| Sempre 180 dias, sem caixa | mais simples; ninguém fica deslogado na emergência | tira da pessoa uma decisão sobre o próprio aparelho, que pode ser compartilhado; a seção 7.5 fixou os 180 dias **como escolha explícita**, e não como padrão | contraria decisão registrada a montante, e por um motivo bom |

## Consequências

**Fica mais fácil:** a caixa de `F1.1` passa a ter destino, e o app pode enviá-la
sem inventar nada. O prazo da sessão passa a ter uma fonte única no contrato
(`StaySignedIn`), em vez de duas descrições que já divergiram.

**Fica mais difícil:** o backend precisa aplicar a mesma regra de prazo em dois
caminhos de emissão de sessão, e o teste que prova o prazo precisa existir para
os dois. Um dos dois passar despercebido é a falha provável aqui.

**Passa a ser irreversível:** nada. Prazo de sessão é configuração, e encurtar
não quebra cliente instalado — a sessão só dura menos.

**O que este ADR não cobre, e não é do contrato:** o app não envia
`accepted_terms_version`, que o `RegisterRequest` já aceita desde o começo. O
aceite dos termos acontece na tela e não fica gravado com a versão do documento
aceito, que é exatamente o que serviria para alguma coisa depois. O campo existe
e está documentado; o que falta é preenchê-lo.
