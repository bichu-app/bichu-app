# ADR-0020: A saída de quem não consegue concluir o desafio antiabuso

**Status:** aceito
**Data:** 2026-09-17
**Depende de:** seções 4.9, 4.10, 18.1, 18.5 e 18.6 de `docs/04-seguranca.md`
**Fecha:** o item 8 da seção 21.6 de `docs/05-ux-research.md`

## Contexto

O UX registrou, com a consequência escrita: `C.2 Entrar` não tem segundo caminho
quando o desafio antiabuso não carrega. O `CAPTCHA_TRANSPORT` do projeto é
reCAPTCHA Enterprise, e a política o aplica a quatro operações de `auth`, entre
elas cadastro e login. Quem usa bloqueador de rastreador, está numa rede que
bloqueia o domínio do provedor, ou tem um aparelho sem os serviços do Google,
não passa. Hoje não há saída: nem link por e-mail, nem caminho alternativo, nem
mensagem que ofereça outra coisa. O UX escreveu o texto da tela com a saída
`Receber um link por e-mail` e registrou que a operação não existe no contrato.
Não a inventou, e fez certo.

**A pergunta certa não é "qual operação falta".** É esta: *o que o servidor faz
quando chega um pedido sem token de desafio?* Nem o contrato nem a política de
segurança respondem. Quem implementar vai fazer a coisa natural, que é recusar,
e ninguém vai perceber, porque quem é recusado assim não abre chamado: desiste.

E a pergunta importa porque **acrescentar uma quinta operação atrás do mesmo
portão não resolveria nada**. `POST /auth/password-reset` também carrega o
desafio. Se a ausência do token recusa, ela recusa ali também, e a saída
apontaria para a mesma porta fechada. O buraco não é a falta de um caminho: é
que **todos os caminhos de entrada do produto dependem de um único terceiro, e
nenhum deles tem modo degradado**.

Há um segundo fato, já registrado e ainda não aplicado ao login. A seção 18.1
estabelece que, dentro de um app nativo, o reCAPTCHA responde uma pergunta que
nós não temos: o ator que ele foi feito para pegar é o robô que preenche
formulário web, e ele não existe aqui. **O atacante real do login chama a API
direto**, com `curl` ou script, e nunca produz token nenhum. Portanto o portão
rígido cobra o preço inteiro de quem é legítimo e quase nada de quem não é.

E um terceiro, que é requisito escrito sem dono: a seção 18.6 já exige que "em
toda tela com desafio" exista um link `Não consigo continuar` que leve a um
caminho humano, com prazo. Ele nunca foi desenhado.

## A tensão, e por que ela se desfaz aqui

Um caminho de entrada que contorna o desafio antiabuso é, por definição, um
caminho que o abusador também usa. A tensão é real, e ela se desfaz quando se
nomeia **o que o desafio defende no login**: tentativa de adivinhar o segredo em
escala, isto é, *credential stuffing* e *password spraying*. O capital do
atacante é uma lista de pares e-mail/senha.

Contra esse atacante, atender o pedido sem token de desafio não entrega nada de
novo, por três razões:

1. ele **já** chama a API sem token, porque nunca carregou a página que geraria
   um. Recusar por ausência de token não o afeta; afeta a pessoa cujo SDK falhou;
2. o que limita o stuffing são os tetos por e-mail e por IP, que continuam
   valendo integralmente, e o hash de senha, que continua valendo integralmente;
3. o que o desafio de fato protege nas outras três operações é **disparo de
   envio pago**, e esse continua protegido pelos mesmos tetos — com a diferença
   de que o estouro agora recusa com prazo em vez de pedir um desafio que a
   pessoa não tem como responder.

## Decisão

### 1. Ausência de token de desafio não recusa. `challenge` degrada para `deny_429`

Esta é a decisão, e as outras duas decorrem dela.

- O token do reCAPTCHA passa a ser **declarado no contrato**, como o cabeçalho
  `X-Captcha-Token`, `required: false`, aplicado às quatro operações que a seção
  18.5 nomeia: cadastro, login, pedido de redefinição de senha e reenvio de
  verificação. Até agora a política exigia o token e o contrato não dizia como
  ele chegava, o que é meio requisito.
- O cliente manda o cabeçalho em toda chamada a essas quatro operações, e o
  **omite somente** quando não conseguiu obter um token.
- O servidor, ao receber o pedido sem o cabeçalho: **atende**, avalia pelo
  mérito (a senha confere ou não confere), e grava a ausência na trilha como
  sinal de moderação na faixa mais baixa. É a mesma regra da seção 18.6, que
  já determina que nenhuma faixa de pontuação termine em recusa seca.
- E **`challenge` deixa de ser uma escalada disponível para aquele pedido**:
  estouro de teto num pedido sem token resolve como `deny_429` com
  `Retry-After`. A regra 1 da seção 4.10 já dizia isso — `challenge` só vale
  onde o desafio é respondível, e onde não é, ele é "uma recusa disfarçada, e
  pior que `deny_429` porque não diz quando tentar de novo". A regra existia; o
  login nunca tinha sido auditado contra ela.

O efeito na tela `C.2` é o que interessa: a pessoa que não consegue carregar o
desafio **entra normalmente**, porque sabe a senha e porque o desafio nunca foi
pré-condição. Se errar a senha até estourar o teto, recebe um 429 com prazo — e
esse 429 já tem texto escrito, com `Esqueci minha senha` dentro dele.

### 2. A segunda saída é `POST /auth/password-reset`, que já existe

O botão `Receber um link por e-mail` do texto do UX aponta para a operação de
redefinição de senha, e **nenhuma operação nova entra no contrato**.

Ela só cumpre esse papel por causa da decisão 1: sem a degradação, a operação de
redefinição está atrás do mesmo portão e não é alcançável por essa pessoa. Com a
decisão 1, é.

**O que isso custa, escrito porque é real:** a pessoa define uma senha nova
quando não esqueceu a antiga, e a confirmação revoga as sessões ativas da conta.
Para quem tem um aparelho só, é um incômodo; para quem tem dois, derruba o
outro. **A tela precisa dizer o que vai acontecer**, e "Receber um link por
e-mail" sozinho não diz. O texto precisa nomear o efeito, na linha de "Entrar
definindo uma senha nova", e essa é a única mudança que esta decisão pede à
tela.

### 3. O caminho humano da 18.6 é fora de banda, e isso é decisão

Resta quem não entra nem pela decisão 1 nem pela 2: quem não lembra a senha
**e** não recebe o e-mail. Para essa pessoa não existe caminho automático
possível — qualquer um seria, aí sim, um contorno que o abusador usa, porque
seria entrada sem nenhuma prova de posse.

O link `Não consigo continuar` da seção 18.6 leva a um **endereço de contato na
própria tela**, não a uma operação da API. Recusar criar uma operação aqui é
deliberado: uma API de abertura de chamado é superfície que este produto não
tem, atendida por uma triagem que este time não tem, e uma fila de recuperação
de conta atendida mal é o vetor de tomada de conta mais barato que existe. Um
endereço de e-mail atendido por uma pessoa é honesto sobre o prazo e não finge
automação que não existe.

**O que fica em aberto e não é meu:** qual endereço, quem atende, com que prazo,
e com que prova de identidade. Sem isso definido, o link leva a lugar nenhum e a
decisão 3 vale no papel apenas.

### 4. O que eu não decidi mudar

O desafio continua nas quatro operações, com o limiar 0,5 e as faixas da seção
18.6. Ele é barato, pega automação boba, e a decisão 1 já tira dele o poder de
trancar alguém. Tirá-lo do login por causa da seção 18.1 seria defensável, mas é
política de segurança e não é minha para reverter sozinho: registro como
divergência a ser revista quando a atestação (App Check) sair do modo de
observação, que é quando o controle certo para a superfície do app passa a
existir de fato.

## Alternativas consideradas

| Opção | Prós | Contras | Por que não |
|---|---|---|---|
| **Degradar o desafio e reusar a redefinição de senha** (escolhida) | fecha o buraco para todo mundo, inclusive nas outras três operações; zero operação nova; o 429 com prazo já tem texto de tela | obriga a pessoa a trocar a senha que ela não esqueceu, e derruba as outras sessões | é o menor mecanismo que resolve o problema inteiro, e não o sintoma de uma tela |
| Criar `POST /auth/sign-in-link`, entrada sem senha por link | exatamente o que o texto do UX pede; não destrói a senha nem as outras sessões | duas operações novas e uma classe nova de credencial (um token na caixa de entrada que abre sessão), com revogação, prazo e teto próprios; e continuaria atrás do mesmo portão sem a decisão 1 | não acrescenta risco novo (a redefinição já significa "quem controla a caixa controla a conta"), mas acrescenta superfície para atender uma população pequena que a decisão 1 já atende. **Volta se**: os chamados de "não consigo entrar" passarem de 1% dos logins em 60 dias, ou quando a atestação virar o controle primário do app |
| Tirar o desafio de `POST /auth/login` | acaba com o problema na origem, e a seção 18.1 sustenta o argumento | é política de segurança, registrada e revisada, e não é minha para reverter sozinho | divergência registrada no item 4, com o gatilho de revisão |
| Deixar como está: não há saída, é o preço | zero trabalho | o preço não é pago por quem escolhe pagá-lo. É pago por quem usa aparelho antigo, rede bloqueada ou extensão de privacidade, e é cobrado no dia em que o pet sumiu | o produto existe para o dia do sumiço. Uma porta que falha justamente ali não é um custo aceito, é o produto não funcionando |

## Consequências

**Fica mais fácil:** o modo degradado passa a existir e a ser verificável. A
pergunta "o que acontece sem o token?" tem resposta escrita no contrato, e o
teste que a prova é direto: chamar as quatro operações sem `X-Captcha-Token` e
exigir que nenhuma recuse por isso.

**Fica mais difícil:** o backend passa a ter dois caminhos de avaliação por
operação, com e sem token, e o de menos uso é o que precisa funcionar no pior
dia. É o candidato natural a apodrecer sem ninguém notar, e por isso o teste
negativo acima é requisito e não sugestão.

**Fica pior, e eu escrevo em vez de deixar implícito:** o argumento do SEC-003
que sustenta o 409 do cadastro perde uma de suas três pernas. Ele dizia que "o
desafio é verificado antes da consulta de unicidade, de modo que o 409 só existe
para quem passou", e agora existe também para quem omitiu o cabeçalho. Duas
razões pelas quais eu aceito: o enumerador **já** chamava a operação sem token,
porque nunca carregou a página que geraria um, então essa perna só barrava gente
legítima; e as outras duas pernas, que são as que enxergam volume (30 por /24
por hora, e-mails distintos por origem com alerta em 50 e bloqueio em 200),
continuam inteiras — e o pedido sem token perde o acesso a `challenge`, o que
torna o estouro mais duro, não menos. Sobra risco residual de enumeração de
baixo volume abaixo dos tetos, e o remédio já está escrito no próprio contrato:
o gatilho que leva o cadastro a 202 sempre. **Isto é consequência de política de
segurança e está registrado para quem responde por ela decidir se quer apertar
antes do gatilho.**

**Passa a ser irreversível:** nada. Tudo aqui é configuração e regra de
servidor.

**Dívida aceita, com gatilho:** a entrada por link sem senha, com os dois
gatilhos escritos na tabela.

**O que fica em aberto e não é meu:** o endereço e a operação humana da decisão
3; o texto de `C.2` que precisa dizer que o link por e-mail define uma senha
nova; e o envio do cabeçalho `X-Captcha-Token` pelo app e pela página web, que
hoje nenhum dos dois faz.
