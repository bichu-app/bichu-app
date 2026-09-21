# ADR-0004: O código da tag QR e o seu ciclo de vida

**Status:** aceito
**Data:** 2026-09-17
**Revisado em:** 2026-09-17 — duas vezes. (1) Acrescentada a regra operacional de
impressao, apos a decisao de que a URL base e variavel e comeca em `localhost`;
o codigo nao muda, o que precisava ficar escrito e que **o plastico nao e
portatil**. (2) O cliente decidiu a cadeia de fornecimento: **impresso depois**.
A decisao original deste ADR estava certa e fica como esta; o caminho descartado
ficou registrado na secao "A cadeia de fornecimento", com o delta exato, para que
a migracao seja barata se um dia ela vier.

**Emenda 1, ACEITA em 19/09/2026:** o codigo passa a ter **16 caracteres (75
bits mais um simbolo de verificacao)**, e `code_hash` passa de SHA-256 sem sal
para **HMAC-SHA-256 com chave no Secret Manager**. As duas mudancas foram
aprovadas como **uma decisao so e inseparavel**. A emenda esta no fim deste
documento e **substitui**, onde conflitar, o que a secao "Decisao" abaixo diz
sobre tamanho, entropia e armazenamento do resumo; todo o resto da secao
"Decisao" (CSPRNG puro, ausencia de estrutura, alfabeto, ciclo de vida, 410,
tetos) continua valendo sem alteracao.

## Contexto

**Este é o ponto irreversível do produto.** Tudo o mais neste projeto se corrige
com um script de migração; o que está impresso na plaquinha da coleira só se
corrige reimprimindo a coleira de toda a base. O código precisa sobreviver a
troca de e-mail do tutor, troca de tutor, troca de provedor de identidade, troca
de domínio e troca de banco.

Ele também é uma credencial ao portador: quem tem o código vê a página do pet em
modo achado, sem conta. E é lido por um estranho na rua, com uma mão só.

## Decisão

**O código é 128 bits de aleatoriedade criptográfica**, gerado por CSPRNG, sem
nenhuma relação matemática com `pet_id`, `user_id`, data, sequência ou lote.
Não é derivado, não é cifrado a partir de outra coisa, não é adivinhável a
partir de outro código: 2^128 torna a varredura inviável, e é isso que substitui
a autenticação nessa rota.

**Representação impressa:** Crockford Base32, 26 caracteres, agrupados de quatro
em quatro com hífen. Crockford porque ele já exclui I, L, O e U e normaliza os
enganos clássicos de quem digita à mão. A tag leva o QR **e** a URL legível: é o
único caminho de recuperação quando o scan falha ou o sinal cai.

**A URL impressa dispensa o esquema: `bichu.app/t/<código>`.** O TLD `.app` está
na lista de pré-carregamento de HSTS, então o navegador de quem digitar já usa
HTTPS sem que a plaquinha precise dizer. São oito caracteres a menos numa
etiqueta em que cada caractere disputa espaço com o QR, sem nenhuma perda.

**A digitação é um caminho real, não uma degradação.** Sem sinal, com o QR
danificado ou com impressão ruim, a pessoa lê a plaquinha (ou a foto dela) e
digita. Por isso a normalização é parte do contrato e está declarada na operação
de resolução: remover separadores em qualquer posição, passar para maiúsculas,
aplicar as substituições do próprio Crockford (`I` e `L` viram `1`, `O` vira
`0`), exigir 26 caracteres do alfabeto, e só então buscar. A mesma normalização
roda na emissão, então ela é idempotente.

**Nenhuma substituição além das de Crockford**, e este é o ponto que precisa
estar num ADR e não só numa descrição de campo: corrigir `5`/`S` ou `8`/`B`
mapearia dois códigos válidos e distintos um no outro. O resultado não seria
"não encontrado" — seria **abrir a página do pet errado**, a partir de um erro de
digitação. O alfabeto de Crockford existe justamente para excluir os pares
ambíguos, e ampliá-lo desfaz a propriedade pela qual ele foi escolhido.

Texto que não normaliza para 26 caracteres válidos é **400**, erro de digitação;
texto que normaliza para um código bem formado e inexistente é **404**. Os dois
contam para o limite de tentativas inválidas, que é a única recusa do fluxo.

**Armazenamento:** a tabela guarda `code_hash` (SHA-256 do código normalizado,
com índice único, usado na resolução) e `code_ciphertext` (cifrado com chave do
KMS, usado só para reimprimir o QR). Um vazamento do banco não entrega códigos
utilizáveis. SHA-256 sem salt é adequado **porque** a entrada tem 128 bits de
entropia: não há dicionário a percorrer.

**O código pertence ao pet e é imutável.** Não se edita, não se transfere para
outro pet, não se reativa. O que existe é emitir um novo e revogar o antigo.

**Uma tag revogada responde 410, nunca 404.** São duas telas diferentes porque
são dois problemas diferentes, e quem está com um animal no colo não pode chegar
a um beco sem saída: o 410 carrega `next_action: register_stray_found_report`.

### Ciclo de vida completo

| Evento | O que acontece com o código |
|---|---|
| Emissão | `active`. Esta é a única resposta da API que traz o código em claro. |
| Vínculo à coleira | Não há evento: o código já nasce ligado ao pet. "Vincular a tag" é confirmação no app, e serve para o tutor saber qual plaquinha é qual (`label` e `code_suffix`). |
| Tag perdida ou danificada | Tutor revoga com `lost_tag` e emite outra. A antiga responde 410 para sempre. |
| Suspeita de clonagem | Revoga com `suspected_clone`. O histórico de scans fica na trilha: é a evidência de que houve leitura em lugar improvável. |
| Troca de tutor | Aceitar a transferência **revoga todas as tags do pet**, automaticamente, com `pet_transferred`. O tutor novo emite as dele. Uma plaquinha que ficou com o tutor antigo deixa de resolver no mesmo instante. |
| Óbito do animal | Pet vai para `deceased`; as tags são revogadas com `pet_deceased`. A rota pública responde 410 com texto próprio, sem expor o motivo: ninguém precisa descobrir a morte de um animal por uma página web. |
| Exclusão do pet ou da conta | Revogação com `pet_deleted`. **410, nunca 404**, para que o achador receba o caminho alternativo. |
| Teto | Cinco tags ativas por pet, dez emissões por pet por dia. Emissão em massa é o vetor de abuso desta rota. |

### A cadeia de fornecimento: o que foi escolhido, e o caminho que ficou aberto

Decidido pelo cliente em 17/09: **impresso depois**. O código nasce ligado ao pet
no momento do cadastro e a tag é impressa a partir do arquivo que o app gera.
`pet_tags.pet_id` é **NOT NULL**, `status` tem dois valores, e não existe tag sem
pet. O modelo de dados está fechado assim em `docs/03-arquitetura.md`, seção 4.3,
sem coluna anulável que nada preencha.

**Um efeito de prazo some com essa decisão, e é bom que esteja escrito:** não há
lote, então **o domínio não precisa existir antes de nenhuma impressão em
massa**. A data limite do domínio continua **22/09**, pelo deep link, e não anda
para trás. A regra operacional permanece a mesma para a tag individual: nenhuma
plaquinha é prensada com um endereço provisório.

#### O caminho descartado: tag pré-impressa, com código próprio

Registrado porque é o caminho que o mercado usa e é para onde este produto pode
querer ir quando houver escala de fabricação. O delta, exato:

| O que muda | De (hoje) | Para (pré-impressa) |
|---|---|---|
| `pet_tags.pet_id` | `NOT NULL` | **anulável**: a tag existe antes de ter dono |
| `pet_tags.status` | `active`, `revoked` | acrescenta `manufactured` (fabricada, ainda sem vínculo) |
| Vínculo | não existe: o código nasce ligado | operação nova, `POST /v1/tags/{code}/claim`, com `bound_at` e `bound_by_user_id` |
| Lote | não existe | tabela **`tag_batches`** (fornecedor, quantidade, data de impressão, faixa emitida) e `pet_tags.batch_id` |
| `code_ciphertext` | guarda o código para reimprimir | **perde a função**: não se reimprime o que o fornecedor imprimiu. A coluna sai |
| Revogação | autoatendimento: revoga e emite outra | **deixa de ser autoatendimento**: revogar significa comprar outra plaquinha |
| Geração | sob demanda, uma por pet | em lote, antes de existir pet |

**E entra um problema de segurança que só existe nesse cenário, e é o motivo
principal de ele estar escrito aqui em vez de ser descoberto depois.** O código
de uma tag pré-impressa é legível por todo mundo que a manuseia antes do tutor:
fábrica, transporte, prateleira de loja, quem devolveu a compra. Dois ataques
concretos: (1) quem anotou o código vincula a tag ao próprio pet antes do
comprador, e o comprador recebe uma plaquinha que já tem dono; (2) depois de
vinculada, quem anotou abre a página pública daquele pet e dispara avisos falsos,
o que é o começo do golpe do falso achador com uma vantagem de partida.

**Mitigação, e ela precisa vir junto ou o cenário não é viável:** um **segredo de
ativação separado do código público**, impresso sob raspadinha ou dentro da
embalagem lacrada. Vincular exige o segredo, não a posse do código
(`activation_secret_hash` em `pet_tags`, consumido no vínculo). O código sozinho
continua servindo para o que ele existe, que é abrir a página de quem achou o
animal; ele deixa de servir para tomar posse da tag. Sem isso, a posse física da
prateleira vira posse do pet.

Nada disso é implementado agora. Está aqui para que a decisão de outubro seja uma
migração com o desenho pronto, e não uma descoberta com lote já impresso.

**Higiene da rota pública**, porque o código viaja na URL e isso é inevitável
num QR: `X-Robots-Tag: noindex, nofollow`, `Referrer-Policy: no-referrer`,
`Cache-Control: no-store`, e o caminho completo **não entra no log de acesso em
claro** — registra-se o hash. Limite de 60 leituras por IP por hora e 30 por
código por hora.

## Alternativas consideradas

| Opção | Prós | Contras | Por que não |
|---|---|---|---|
| `pet_id` no QR | nada a guardar | expõe o identificador interno, é enumerável, e amarra o plástico à chave do banco | seria o erro irreversível deste projeto |
| Sequencial curto (6 a 8 caracteres) | plaquinha menor, fácil de digitar | varredura trivial: alguém enumera a base inteira de pets e tutores | privacidade e segurança acima da estética da tag |
| **Tag pré-impressa com código próprio** | escala de fabricação, venda em prateleira, tutor compra e vincula | código legível por quem manuseia antes do tutor, o que exige segredo de ativação separado; revogar deixa de ser autoatendimento; lote exige o domínio antes de imprimir | **decisão do cliente em 17/09 foi "impresso depois"**. O delta está escrito acima para que a volta seja barata |
| JWT assinado dentro do QR | autocontido, verificável sem banco | longo demais para o QR, e **irrevogável** sem lista de bloqueio | revogação é requisito, não detalhe |
| Guardar o código em claro no banco | reimpressão trivial | um vazamento entrega acesso à página de todo pet | o cifrado com KMS resolve sem esse custo |
| 64 bits | QR menor | margem estreita demais para algo impresso que dura anos | 128 bits custa 10 caracteres a mais |

## Consequências

Fica mais fácil: revogar, transferir pet e resistir a varredura.

Fica mais difícil: o tutor não consegue "ver" o código dele pela API (só os
quatro últimos caracteres e o PNG); e a reimpressão depende do KMS estar
disponível.

Passa a ser irreversível: o formato impresso. Uma mudança de alfabeto, de
tamanho ou de prefixo de URL depois da primeira tag impressa cria duas gerações
de plaquinha convivendo para sempre.

**O que é persistido é o código, nunca a URL.** A tabela guarda `code_hash` e
`code_ciphertext`; a URL que o QR codifica e que é impressa em texto legível é
montada na leitura, a partir de `PUBLIC_BASE_URL`. Trocar `localhost` pelo
domínio definitivo é variável de ambiente e reinício, e não toca em uma linha do
banco.

**Mas o plástico não é portátil, e é por isso que existe uma regra operacional:
nenhuma tag física é impressa antes de o domínio definitivo existir.** Durante o
desenvolvimento, tag de teste é adesivo ou papel, gerada pelo mesmo endpoint,
apontando para o IP da rede local, e descartada. Uma tag prensada com
`localhost` ou com um endereço provisório é lixo permanente, e a correção seria
reimprimir a base inteira.

---

# Emenda 1 (ACEITA) — 19/09/2026: o tamanho do código

**Status desta emenda:** **aceita pelo cliente em 19/09/2026**, com a análise
desta emenda na mesa.

**O que foi aprovado, e a forma importa:** 16 caracteres **e** o HMAC, como uma
decisão só. A condição da seção 3.1 não é uma recomendação anexa que alguém possa
implementar depois ou descartar por custo. **Nunca existiu aprovação para 75 bits
com SHA-256 sem sal**, nem do cliente nem desta arquitetura: a seção 3 mostra que
essa combinação entrega a base inteira em 38 segundos a partir de um dump, e a
seção 9 registra que, sem o HMAC, a recomendação era manter os 128 bits. Quem
encontrar este documento daqui a um ano e estiver tentado a separar as duas
metades está desfazendo a decisão, não simplificando a entrega.

**Nada foi implementado.** `src/` e `app/` continuam em 128 bits e 26 caracteres.
O corte vira história no backlog, e quando ele entra é do scrum master com a
product owner. A ordem de implantação é a da seção 12, e ela não é negociável
pelo mesmo motivo que a condição não é.

**O que o cliente perguntou, em 19/09:** se 26 caracteres não é dígito demais
para alguém digitar à mão, e se outro padrão de chave não melhoraria a
usabilidade.

**Resposta curta:** é. A pergunta está certa, a janela para responder a ela está
aberta hoje e fecha na primeira plaquinha impressa, e o encurtamento é viável.
Ele **não é grátis**, e o preço não está no número de bits: está no `code_hash`.
Esta emenda propõe 16 caracteres **condicionados** à troca de SHA-256 sem chave
por HMAC-SHA-256 com chave fora do banco. Sem essa troca, a recomendação é
manter 128 bits, e a seção "Se a condição não for aceita" explica por quê com a
conta.

## 1. A janela está aberta. Isto foi conferido, não suposto

Este ADR declara o formato impresso irreversível, então a primeira pergunta não é
"qual número" e sim "ainda dá tempo". Dá, e estes são os fatos conferidos em
19/09:

| O que foi conferido | Onde | Resultado |
|---|---|---|
| Existe lote de plástico pré-impresso? | `migrations/20260917000007`, `pet_tags.pet_id NOT NULL`, sem `batch_id`, sem `manufactured` | **Não existe.** A cadeia é "impresso depois", decidida em 17/09 |
| Quantas tags existem de fato? | `SELECT count(*) FROM pet_tags` no banco de homologação | **1 tag, e ela está `revoked`.** 14 pets, 2 scans |
| Alguma tag física foi prensada? | Regra operacional deste ADR: nenhuma plaquinha antes do domínio definitivo; prazo do domínio 22/09 | **Nenhuma.** Não há plástico no mundo |

**Uma tag, revogada, num banco de desenvolvimento.** O custo de migração de dados
desta mudança é zero hoje. Ele passa a ser "reimprimir a base inteira" no dia em
que a primeira plaquinha real for prensada, o que este ADR já fixou como sendo
depois de 22/09. **A decisão tem prazo, e o prazo é a primeira impressão física.**

### O cliente não foi o primeiro a levantar isto

Duas outras frentes registraram o mesmo problema antes, de forma independente, e
as duas estão em documento que este ADR não controla:

- `docs/05-ux-research.md`, seção 20.10: a pesquisa propôs oito caracteres, o ADR
  venceu com 26, e a tela sem sinal precisou ser reescrita para mandar
  **fotografar a plaquinha** em vez de anotar o código, porque quem transcreve 26
  caracteres sem errar "não existe".
- `docs/08-plano-de-testes.md`, seção 11.1: item **em aberto**. O leiaute de
  impressão foi desenhado com um exemplo de oito caracteres; com o código real a
  linha da URL vai de cerca de 20 para cerca de 39 caracteres **numa tag de 50 mm
  de largura, em texto de 3,5 mm**. O registro diz, com todas as letras, "não sei
  se cabe, e 'não sei se cabe' não é um resultado esperado", e o caso de
  homologação HOM-79 está travado nisso.

A pergunta do cliente e esses dois achados são o mesmo defeito, visto de três
lugares. Isso muda o peso da emenda: ela não atende a uma preferência estética,
ela fecha um item de homologação que hoje está aberto por impossibilidade física.

## 2. A conta

### 2.1 A fórmula do pedido está invertida. Os números estão certos

A fórmula registrada no pedido foi `K/(N·R)`. Ela está invertida: essa expressão
tem dimensão de tempo elevado a menos um e, com os valores dados, produziria
frações de hora em vez de milhões de anos. A fórmula correta é

> **E[t] = N / (K · R)**

com `N = 2^b` o tamanho do espaço, `K` o número de códigos emitidos (os alvos
válidos) e `R` a taxa de tentativas. A chance de um palpite aleatório acertar
**algum** código emitido é `K/N`; o número esperado de tentativas até o primeiro
acerto é o inverso, `N/K`, por ser uma geométrica; e dividir por `R` dá o tempo.

**Os quatro números apresentados estão corretos**, e foram reproduzidos: eles
vieram de `N/(K·R)`, e só a transcrição da fórmula saiu trocada. Com `K = 10^6` e
`R = 10^6/h`:

| Bits | Espaço `N` | E[t] até o primeiro acerto |
|---|---|---|
| 128 | 3,40 × 10^38 | 3,9 × 10^22 anos |
| 115 | 4,15 × 10^34 | 4,7 × 10^18 anos |
| 95 | 3,96 × 10^28 | 4,5 × 10^12 anos |
| 80 | 1,21 × 10^24 | 1,38 × 10^8 anos |
| **75** | **3,78 × 10^22** | **4,3 × 10^6 anos** |
| 70 | 1,18 × 10^21 | 1,3 × 10^5 anos |
| 65 | 3,69 × 10^19 | 4,2 × 10^3 anos |
| 60 | 1,15 × 10^18 | 1,3 × 10^2 anos |

### 2.2 O modelo certo é a probabilidade na janela, e não o tempo esperado

O pedido perguntou qual dos dois modelos vale. **Vale a probabilidade de qualquer
acerto numa janela**, e o tempo esperado é o modelo errado para decidir isto, por
uma razão específica: a distribuição geométrica é fortemente assimétrica, e a
média de 4,3 milhões de anos convive com uma cauda em que o primeiro acerto
acontece na primeira semana. Quem decide um formato irreversível precisa do risco
na cauda, não da média.

A pergunta que decide é: **em dez anos de ataque sustentado, qual a chance de pelo
menos um acerto?** Com `A = R · t` tentativas, `p = 1 − (1 − K/N)^A ≈ A·K/N`:

| Bits | p (10 anos, K=10^6, R=10^6/h) | Lido como |
|---|---|---|
| 128 | 2,6 × 10^-22 | 1 em 3,9 × 10^21 |
| 95 | 2,2 × 10^-12 | 1 em 4,5 × 10^11 |
| 80 | 7,3 × 10^-8 | 1 em 1,4 × 10^7 |
| **75** | **2,3 × 10^-6** | **1 em 431 mil** |
| 70 | 7,4 × 10^-5 | 1 em 13,5 mil |
| 65 | 2,4 × 10^-3 | 1 em 421 |
| 60 | 7,6 × 10^-2 | **1 em 13** |

Aqui o desenho aparece com clareza que a tabela de médias esconde. Entre 75 e 65
bits há um fator de mil, e é nesse intervalo que a resposta deixa de ser
confortável: **65 bits significa uma chance em 421 de que um pet qualquer seja
descoberto por varredura ao longo de dez anos**, e 60 bits é indefensável. 75
bits está do lado certo dessa fronteira por três ordens de grandeza.

### 2.3 O paradoxo do aniversário não se aplica aqui, e é preciso dizer por quê

O limite do aniversário vale quando o atacante vence encontrando **uma colisão
qualquer dentro de um conjunto que ele mesmo gera**, e é por isso que ele produz o
expoente `b/2`. Não é o caso: aqui o conjunto alvo é fixo, é conhecido pelo
sistema e não pelo atacante, e cada palpite precisa cair **sobre** esse conjunto.
Os palpites não podem ser comparados entre si, então não há ganho quadrático. A
probabilidade é linear no número de tentativas, `A·K/N`, e é exatamente o que as
tabelas acima calculam. **Aplicar o limite do aniversário aqui daria 37,5 bits de
segurança efetiva para 75 bits de código, e estaria errado.**

O aniversário **vale** num lugar deste desenho, e é outro: a chance de duas
emissões independentes produzirem o mesmo código, que é `≈ K²/(2N)`. Com 75 bits
e um milhão de pets isso dá 1,3 × 10^-11; com cem milhões de pets, 1,3 × 10^-7.
Negligenciável, e de qualquer modo o índice `pet_tags_code_hash_unico` transforma
a colisão em falha de emissão, e não em dois pets com o mesmo código.

### 2.4 O que os limites da rota realmente permitem

A taxa `R = 10^6/h` não é gratuita, e convém dizer o que ela custa ao atacante. O
limite que morde uma varredura é o de **tentativas inválidas** declarado em
`tag-routes.ts`, porque quase todo palpite é um 404:

> `{ dimension: ['ip'], appliesTo: 'invalid_attempts', limit: 20, window: '1h', onExceed: 'deny_429' }`

Vinte por IP por hora. Para sustentar 10^6 tentativas por hora o atacante precisa
de **cerca de 50 mil endereços IP distintos**, em regime contínuo, por dez anos.
Isso é uma botnet ou um pool de proxies residenciais de porte, e é caro. A conta
de 2.2 já é pessimista, portanto, e ela ainda assim dá 1 em 431 mil.

**Há uma lacuna concreta, e o encurtamento é que a torna relevante.** O freio de
tentativas inválidas existe por IP, mas **não existe por bloco `/24`**, embora o
bloco já seja uma dimensão usada na rota (`ip_24`, 2000/h, com
`log_and_alert`). Um `/24` alugado dá 256 endereços, ou 5.120 tentativas
inválidas por hora, sem nenhuma recusa. Com 128 bits isso é irrelevante; com 75
bits é o caminho mais barato para comprar taxa. Esta emenda recomenda acrescentar
um limite de tentativas inválidas na dimensão `ip_24`, com recusa e não com
alerta.

### 2.5 O que um acerto compra

Faltava isto na conta, e ele muda a régua. Um acerto abre a resposta pública de
`resolveTagCode`, que por decisão do ADR-0021 é a mesma para os três `viewer`:
nome de exibição, espécie, porte, cor, marcas, foto e se o pet está perdido.
**Não há endereço, não há telefone, não há e-mail e não há identificador
interno.** O prêmio por acerto é a ficha pública de um animal, que é o que a
plaquinha existe para mostrar a um estranho na rua.

Isso importa para calibrar: 128 bits é a margem de uma credencial que dá acesso a
dados sensíveis, e essa não é a função deste código. A margem precisa ser
suficiente para impedir a **varredura da base** (o argumento correto e original
deste ADR contra o sequencial curto), não para proteger um segredo de alto valor.
75 bits impede a varredura por três ordens de grandeza acima da fronteira do
desconforto.

## 3. O que a conta acima não cobre, e é aqui que o encurtamento tem preço

Tudo em 2 é ataque **online**, limitado pela rota. Existe um segundo ataque, e a
proposta original não o considerou.

**Cenário: vazamento do banco.** O atacante tem a tabela `pet_tags`, com
`code_hash`. Ele quer os códigos. `code_ciphertext` não ajuda (AES-256-GCM com
chave que não está no banco), mas o `code_hash` é **SHA-256 sem chave e sem sal**,
e a entrada agora teria 75 bits em vez de 128. Enumerar o espaço e comparar é
trivialmente paralelizável, e SHA-256 é a função mais acelerada por hardware
dedicado que existe: a rede Bitcoin é da ordem de **10^21 hashes por segundo**.

| Bits da entrada | Tempo para percorrer o espaço a 10^21 H/s |
|---|---|
| 128 | 1,1 × 10^10 anos |
| 115 | 1,3 × 10^6 anos |
| 110 | 4,1 × 10^4 anos |
| 100 | 40 anos |
| 95 | 1,3 ano |
| 80 | 20 minutos |
| **75** | **38 segundos** |

**Trinta e oito segundos**, e é pior do que a linha sugere por dois motivos. É um
ataque **em lote**: uma única passagem pelo espaço recupera o código de *todas* as
tags do vazamento ao mesmo tempo, então o custo não cresce com o tamanho da base.
E o resultado é **permanente**: os códigos estão prensados em plástico que não se
atualiza, de modo que um vazamento do banco viraria o comprometimento definitivo
de toda a plaquinha em circulação, com a única correção sendo reimprimir a base
inteira. É exatamente o desastre que este ADR existe para não permitir.

**O argumento do ADR original está certo e é a razão de a emenda ter uma
condição.** Este documento diz, na seção "Armazenamento", que SHA-256 sem sal é
adequado **porque** a entrada tem 128 bits. Esse "porque" é literal, não
retórico: ele é a premissa inteira, e encurtar o código a destrói. Nem 75 bits
nem 95 sobrevivem a ela; só acima de uns 110 bits, e aí não há encurtamento que
valha a pena.

### 3.1 A correção: HMAC com chave fora do banco, não um sal

Sal por linha não serve aqui, e é importante dizer por quê antes que alguém o
proponha: com um sal diferente por linha, encontrar a tag exigiria varrer a tabela
inteira aplicando cada sal, e a resolução perderia o índice único que sustenta a
rota mais pública do produto.

A construção certa é o **índice cego**: `code_hash` passa a ser
**HMAC-SHA-256(chave, código)** com **uma chave global**, guardada fora do banco.
A busca continua sendo uma igualdade sobre `pet_tags_code_hash_unico`, o valor
continua com 32 bytes, e a tabela não muda de forma. O que muda é que um dump do
banco, sozinho, deixa de ter valor: sem a chave não há espaço a enumerar.

**Este projeto já tomou exatamente esta decisão, pelo mesmo motivo, e ela está
escrita em `src/shared/crypto/digest.ts`:**

> "Endereço IP é HMAC com chave secreta, nunca hash puro (SEC-010). O espaço IPv4
> inteiro tem 2^32 endereços e a tabela de correspondência de um SHA-256 sem
> chave se monta em minutos. Hash sem chave de um IP é o IP em claro com um passo
> a mais."

O raciocínio é o mesmo, com 75 no lugar de 32. A infraestrutura também já existe:
`hmacDeEnderecoIp` é o precedente de código, `TAG_CODE_KEY` é o precedente de
chave de 32 bytes em configuração, e o ADR-0022 já leva os segredos de runtime
para o Secret Manager. A chave nova, `TAG_CODE_INDEX_KEY`, entra pelo mesmo
caminho.

**Custo de rotação, dito antes que alguém descubra depois:** a chave do índice
cego **não é rotacionável sem reprocessar a tabela**, porque o valor buscado
depende dela. Rotacionar exige recalcular `code_hash` de toda a base a partir de
`code_ciphertext`, o que é possível (é para isso que o cifrado existe) mas é uma
operação de manutenção, e não um giro de chave. Isso precisa estar no
procedimento antes de a chave existir.

## 4. A decisão proposta

**O código passa a ter 16 caracteres: 15 símbolos de aleatoriedade (75 bits
exatos) e 1 símbolo de verificação**, impressos `XXXX-XXXX-XXXX-XXXX`.

**Condição, e ela não é separável:** `code_hash` passa de SHA-256 para
HMAC-SHA-256 com chave em Secret Manager. As duas mudanças entram juntas ou
nenhuma entra. Aceitar o encurtamento sem a condição troca um problema de
usabilidade por um problema de segurança pior do que ele.

O que se ganha, conferido e não alegado:

| | Hoje (26) | Proposto (16) |
|---|---|---|
| Caracteres a digitar | 26 | 16 |
| Forma impressa | `7K2F-9QJB-3XR0-5TWD-8MNC-VH`, 32 caracteres, 6 grupos de 4 e 1 de 2 | `7K2F-9QJB-3XR0-5TWD`, 19 caracteres, 4 grupos de 4 |
| Linha da URL na plaquinha | `bichu.app/t/` + 26 = **38 caracteres** | `bichu.app/t/` + 16 = **28 caracteres** |
| Bits desperdiçados na codificação | 2 (o primeiro símbolo só assume `0`–`7`) | **0** (15 × 5 = 75 exatos) |
| Detecção de erro de digitação | **nenhuma**: um caractere errado vira 404 | todo erro de 1 símbolo e toda transposição, antes de tocar o banco |
| QR, em modo byte | 38 bytes: versão 3 com correção M; correção Q exigiria versão 4 | 28 bytes: **versão 3 já comporta correção Q** |

As duas últimas linhas não estavam na proposta original e são as que mais pesam.

**O artefato do primeiro caractere desaparece.** Hoje 26 símbolos carregam 130
bits para guardar 128, e os dois bits mais altos são sempre zero: o primeiro
caractere só assume 8 dos 32 valores. Conferido, e está comentado em
`codificarEmCrockford`. Não tira entropia de lugar nenhum, mas é uma
irregularidade estatística visível em qualquer amostra de códigos impressos, e
some com 15 × 5 = 75.

**A ausência de símbolo de verificação é a falha mais séria do desenho atual, e
ela é de usabilidade e não de segurança.** Confirmado: o Crockford prevê um e
esta implementação não usa. Hoje, quem erra um caractere recebe **404, "esse
código não é de nenhuma tag do Bichu"** (`mensagens_de_erro.dart`), que é a
mensagem errada: ela diz que a plaquinha não é do produto quando o que houve foi
um dedo no lugar errado. Com o símbolo de verificação o mesmo erro vira **400,
"confira o código"**, sem tocar no banco. Para quem está na rua com um animal no
colo, essa é a diferença entre tentar de novo e desistir.

### 4.1 O esquema exato do símbolo de verificação

**Rejeitado: o símbolo de verificação do Crockford (mod 37).** Três problemas,
em ordem de gravidade:

1. Ele usa cinco símbolos extras, `*~$=U`, e **reintroduz o `U`** que este
   projeto excluiu de propósito. Valeria só na última posição, e `normalizarCodigoDaTag`
   hoje rejeita `U` em qualquer lugar. Exceção posicional num normalizador é o
   tipo de regra que alguém remove depois por parecer inconsistente.
2. `*`, `~`, `$` e `=` **não são alfanuméricos**, e o passo 1 do contrato de
   normalização remove todo não alfanumérico em qualquer posição. O normalizador
   comeria o próprio dígito de verificação. Consertar isso exige tornar o passo 1
   sensível à posição, o que desfaz a propriedade que ele tem hoje.
3. Esses quatro símbolos ficam na camada de símbolos do teclado do celular, e
   `$` e `=` têm significado em URL, enquanto o código viaja no caminho. Um
   dígito de verificação que custa dois toques a mais destrói o ganho de
   usabilidade que motivou a mudança.

**Rejeitado também: checksum mod 32 ingênuo, nas duas formas.** Foram medidos, e
não descartados por opinião:

- **Soma simples mod 32:** pega todo erro de um símbolo, mas **não pega nenhuma
  transposição** (a soma não enxerga ordem). Medido: 6.753 de 6.753
  transposições adjacentes passaram, 100%. Transposição é o segundo erro humano
  de transcrição mais comum.
- **Soma ponderada mod 32:** pega transposições, mas **deixa escapar 3,7% dos
  erros de um único símbolo**. Medido sobre 930 mil casos. A causa é que 32 não é
  primo: `Z/32` tem divisores de zero, e um peso par com uma diferença de 16 soma
  zero. **É por isso que o Crockford usa 37, que é primo**, e não por escolha
  arbitrária de alfabeto. Um dígito de verificação que falha em 3,7% dos erros
  que ele existe para pegar é pior que nenhum, porque cria confiança falsa.

**Adotado: um símbolo de paridade sobre GF(2^5)**, isto é, um código de
Reed-Solomon [16,15,2] encurtado. GF(32) é um **corpo**: todo elemento não nulo é
invertível, o que devolve exatamente as garantias que o mod 37 dá, **sem sair dos
32 símbolos do alfabeto**.

Definição, para que a implementação não precise inventar nada:

- Polinômio primitivo `x^5 + x^2 + 1` (`0x25`). Conferido: `α = 2` tem ordem 31 em
  `GF(32)*`, logo é primitivo.
- Pesos `α^1 … α^15`, que são `2, 4, 8, 16, 5, 10, 20, 13, 26, 17, 7, 14, 28, 29, 31`.
  Conferido: quinze valores distintos e nenhum nulo.
- Símbolo de verificação `c = ⊕ᵢ (α^i ⊗ vᵢ)`, com `⊗` a multiplicação em GF(32) e
  `vᵢ` o valor do i-ésimo símbolo no alfabeto. `c` é um índice de 0 a 31, e vira o
  décimo sexto caractere pelo mesmo alfabeto.

**O que ele pega, verificado por exaustão e não afirmado:**

| Classe de erro | Resultado medido |
|---|---|
| Erro de **um símbolo**, em qualquer posição, para qualquer outro valor | **992.000 casos, 0 escaparam.** Todos detectados |
| **Transposição** de dois símbolos, adjacentes ou não | **203.396 casos, 0 escaparam.** Todas detectadas |
| Erro em dois ou mais símbolos, aleatório | Escapa com 1/32. Medido: 3,09% sobre 200 mil amostras, contra 3,125% teóricos |

**O que ele não pega, e precisa estar escrito:** erros em dois ou mais símbolos
passam com probabilidade 1/32. Um símbolo de verificação dá distância de Hamming
2, o que **detecta** um erro e não corrige nenhum.

**Ele não corrige, e isso é decisão e não limitação.** Corrigir exigiria dois
símbolos e, mais importante, corrigir é o mesmo erro que este ADR já recusou ao
proibir a substituição de `5`/`S` e `8`/`B`: um código "corrigido" é um código
válido e **diferente**, e o resultado não seria "não encontrado", seria abrir a
página do pet errado. A regra é a mesma de sempre. Detectar e pedir para digitar
de novo; nunca adivinhar.

**Onde ele é verificado:** dentro de `normalizarCodigoDaTag`, depois das
substituições de Crockford e antes de qualquer acesso ao banco. Símbolo de
verificação que não bate faz a normalização devolver `undefined`, o que já é
**400** pelo contrato vigente. O passo 4 do contrato de normalização ganha um
passo 5, e a busca por SHA-256 vira o passo 6.

**Um ganho de segurança que esta emenda não reivindica:** 31 de cada 32 palpites
aleatórios falham no dígito localmente e nunca chegam ao banco. Isso reduz carga,
mas **não é margem de segurança** e não entra em nenhuma conta desta emenda: um
atacante que conhece o esquema gera apenas candidatos com dígito válido, ao custo
de nada. Registrado para que ninguém o some depois.

## 5. Os códigos já emitidos

**São um, ele está `revoked`, e ele vive no banco de desenvolvimento.** Com esse
número, a pergunta "o que fazer com os códigos existentes" tem uma resposta que
não teria com mil.

**Corte seco. Não há convivência de dois tamanhos.** `normalizarCodigoDaTag`
passa a exigir exatamente 16 caracteres e um símbolo de verificação válido; 26
caracteres passam a ser **400**, como qualquer outro tamanho errado. A linha
existente é apagada junto com a mudança, porque um `code_hash` calculado com
SHA-256 sem chave deixa de ser comparável assim que o índice vira HMAC, de modo
que ela seria uma linha irresolvível ocupando o índice único.

**Por que não aceitar os dois tamanhos**, que é o caminho que parece gentil e é o
errado aqui:

- Este ADR nomeia "duas gerações de plaquinha convivendo para sempre" como o risco
  central do documento. Aceitar dois tamanhos é **criar** esse risco
  deliberadamente, para proteger uma tag de teste revogada.
- O código de 26 caracteres **não tem símbolo de verificação e não pode ganhar
  um**. Um normalizador com dois ramos teria um caminho que detecta erro de
  digitação e outro que não, e a mensagem de erro do produto dependeria de qual
  geração de plaquinha a pessoa tem na mão, o que ninguém consegue explicar numa
  tela.
- O ramo de 26 caracteres nunca sairia. Não há data que o remova, porque a
  justificativa para mantê-lo é "pode existir uma tag antiga", e essa frase não
  expira sozinha.

**Isto vale hoje e só hoje.** Impressa a primeira plaquinha real, o corte seco
deixa de ser possível e a resposta passa a ser a convivência de duas gerações,
com todo o custo que este ADR descreve. É o que torna a decisão urgente em vez de
apenas correta.

## 6. O que NÃO muda, e esta seção é a mais importante da emenda

**O encurtamento é sobre quantidade de bits. Ele não introduz estrutura.** Quem
ler só o número novo vai concluir que "o código ficou menor, então dá para
derivar de alguma coisa", e essa é a única leitura que transformaria esta emenda
num desastre. Estrutura é o que torna o espaço enumerável, e um espaço enumerável
não tem 75 bits de segurança: tem a entropia do que o gerou, que costuma ser vinte
e poucos.

Continua valendo, sem alteração de uma vírgula:

1. **CSPRNG puro.** Os 75 bits vêm de aleatoriedade criptográfica, e de mais nada.
2. **Nenhuma relação com `pet_id`, `user_id`, data, sequência ou lote.** Não
   derivado, não cifrado a partir de outra coisa, não adivinhável a partir de
   outro código. É a decisão original deste ADR e ela não está em discussão.
3. **Alfabeto de Crockford sem `I`, `L`, `O` e `U`**, e as substituições `I`/`L`
   → `1`, `O` → `0`, e **nenhuma além dessas**. `5`/`S`, `8`/`B` e `2`/`Z`
   continuam sem correção, pelo motivo de sempre: mapear dois códigos válidos um
   no outro abre a página do pet errado.
4. **A busca é pelo resumo do código**, nunca pelo código em claro, com índice
   único. O que muda é a função (SHA-256 para HMAC-SHA-256), não o desenho.
5. **Normalização tolerante na entrada:** separador em qualquer posição,
   qualquer caixa, mesma ordem de passos. Foi o que a pesquisa de UX pediu em
   troca na seção 20.10 e continua concedido.
6. **O código pertence ao pet, é imutável, não se transfere e não se reativa.**
   Todo o ciclo de vida, os motivos de revogação, o 410 e os tetos continuam
   idênticos.

**O dígito de verificação não é aleatório e não conta como entropia.** São 75
bits em 16 caracteres, não 80. Quem somar 16 × 5 vai encontrar 80 e estará
errado por 5 bits.

## 7. O efeito em `code_ciphertext`, no resumo e nos limites da rota

**`code_ciphertext`: nada muda.** AES-256-GCM é modo de fluxo, e o texto cifrado
tem o tamanho do texto claro, mais 12 bytes de IV e 16 de etiqueta. A coluna é
`bytea` sem restrição de tamanho, o formato gravado é `iv || tag || cifrado`, e a
única diferença é que o registro fica 10 bytes menor. O comentário de
`aes-gcm-secret-cipher.ts` sobre não haver campo de versão continua válido e
continua correto.

**`code_hash`: muda, e é a condição da emenda.** Tratado em 3.1. A coluna continua
`bytea` de 32 bytes, e a restrição `pet_tags_code_hash_sha256` continua
verdadeira em tamanho, embora o nome passe a mentir sobre a função e deva ser
corrigido junto.

**`code_suffix`: não muda de forma, muda de conteúdo.** Continuam sendo os quatro
últimos caracteres, continua satisfazendo `char(4)` e a restrição de alfabeto. O
que muda é que o quarto agora é o dígito de verificação, então o sufixo carrega 15
bits de variação e não 20. Ele serve para o tutor distinguir no máximo cinco
plaquinhas do mesmo pet, e 32.768 valores bastam com folga. A regra de que ele
**nunca endereça nada** continua sendo a que importa.

**Limites da rota: uma adição, pelo motivo de 2.4.** Os cinco limites declarados
em `resolveTagCode` foram dimensionados para um espaço em que adivinhar era
impossível, e passam a operar num espaço em que adivinhar é apenas muito caro.
Acrescentar:

> `{ dimension: ['ip_24'], appliesTo: 'invalid_attempts', limit: 200, window: '1h', onExceed: 'deny_429' }`

Isso fecha o caminho de 5.120 tentativas inválidas por hora a partir de um único
`/24`, e multiplica por 25 o número de blocos que uma varredura precisa alugar.
Os outros cinco limites ficam como estão.

**Divergência encontrada, que é anterior a esta emenda e independe dela:** a seção
"Higiene da rota pública" deste ADR diz "60 leituras por IP por hora e 30 por
código por hora". O código declara 300/h por IP, 30/h por `ip+code`, 2000/h por
`ip_24` e 100/24h por `code`. **O texto do ADR está desatualizado em relação ao
que a rota impõe**, e o número de 60 não existe em lugar nenhum de `src/`. Isso
precisa ser reconciliado com quem responde por segurança, decidido, e escrito num
lugar só. Registrado aqui porque foi encontrado ao conferir esta emenda, e não
corrigido porque escolher entre 60 e 300 não é decisão deste documento.

## 8. O custo, arquivo por arquivo

Levantado por inspeção, não por estimativa. Nenhum destes arquivos foi alterado.

### Domínio e criptografia

| Arquivo | O que muda |
|---|---|
| `src/modules/tags/domain/tag-code.ts` | O centro da mudança. `TAMANHO_DO_CODIGO` 26 → 16; `BITS_DE_ENTROPIA` 128 → 75; `VALIDO` de `{26}` para `{16}`; `codificarEmCrockford` passa a produzir 15 símbolos e anexar o de verificação; duas funções novas (calcular e conferir o símbolo); `normalizarCodigoDaTag` ganha o passo de conferência. `formaImpressaDoCodigo` e `sufixoDoCodigo` **não mudam uma linha** (16/4 = 4 grupos exatos, e o sufixo continua sendo o `slice(-4)`) |
| idem, ponto de atenção | `BYTES_DO_CODIGO = BITS_DE_ENTROPIA / 8` **deixa de ser inteiro**: 75 bits são 9,375 bytes. A porta `IdGenerator` passa a entregar **10 bytes** e a codificação **descarta 5 bits**. A regra exata está em 13.2, e ela não é a que eu escrevi na primeira versão desta emenda. A guarda que hoje recusa entrada curta precisa continuar existindo e dizer os dois números (10 bytes recebidos, 75 bits usados), porque este é o ponto em que um defeito é permanente |
| `src/shared/crypto/digest.ts` | `hashDoCodigoDaTag` deixa de ser `createHash('sha256')` e passa a `createHmac('sha256', chave)`, ganhando o parâmetro de chave. O comentário que justifica "sem sal porque 128 bits" é substituído pelo raciocínio de 3.1, que é o mesmo já escrito ali para `hmacDeEnderecoIp` |

### Aplicação, borda e configuração

| Arquivo | O que muda |
|---|---|
| `src/modules/tags/application/tag-service.ts` | Passa a pedir 10 bytes ao `IdGenerator` e a injetar a chave do índice em `hashDoCodigoDaTag`. Os três usos (`gerarCodigoDaTag`, `normalizarCodigoDaTag`, `sufixoDoCodigo`) continuam com a mesma assinatura |
| `src/modules/tags/adapters/http/tag-routes.ts` | Injeta a chave; acrescenta o limite de `ip_24` sobre `invalid_attempts` da seção 7 |
| Configuração | `TAG_CODE_INDEX_KEY`, 32 bytes, pelo mesmo caminho de `TAG_CODE_KEY`, com a recusa de subida por tamanho errado que o projeto já pratica. Em ambiente hospedado vem do Secret Manager (ADR-0022) |
| `src/shared/http/errors.ts` | `tagCodeMalformado`: o `detail` diz "O código tem 26 caracteres" e passa a dizer 16, e a mensagem pode passar a distinguir erro de dígito de verificação de erro de tamanho |
| `src/shared/types/brands.ts` | Comentário de `TagCodeCanonical`, linha 45 |

### Contrato

| Arquivo | O que muda |
|---|---|
| `api/openapi.yaml` | **Dois pontos, e só dois.** O parâmetro `TagCode` (descrição, o passo 4 da normalização, o `pattern` `^[0-9A-Za-z][0-9A-Za-z-]{25,39}$` que passa a `{15,23}`, e o `example`); e a descrição do 400 em `resolveTagCode`, que menciona "26 depois da normalizacao". O passo 5 do símbolo de verificação entra na descrição |
| `src/shared/types/generated/api.ts` | **Nenhuma edição à mão.** As oito ocorrências de "26 caracteres" são geradas: `npm run generate:types` as refaz a partir do `openapi.yaml`, e `npm run verify:types` já é o portão que reprova se alguém editar o gerado. O custo aqui é rodar um comando, e não oito correções |

### Testes

| Arquivo | O que muda |
|---|---|
| `src/modules/tags/domain/tag-code.test.ts` | Três casos ajustam o número (`produz 26 caracteres`, `recusa tamanho diferente de 26`, `recusa entrada com menos de 128 bits`). **Casos novos, e eles são a entrega e não o acessório:** que um erro de um caractere seja recusado, que uma transposição seja recusada, e que o descarte dos 5 bits não enviese o primeiro símbolo. Vale a regra do projeto: a prova negativa mora no repositório e a esteira exige a reprovação, senão o dígito de verificação passa a valer por confiança |
| `src/modules/tags/application/tag-service.test.ts` | Fixtures de código e a contagem de bytes do gerador |
| `cypress/e2e/ciclo-completo.cy.ts` | `expect(codigoDaTag).to.have.length(26)` e o comentário |
| `cypress/e2e/tag-revogada.cy.ts` | O código de 26 caracteres bem formado e inexistente da linha 16 precisa ser refeito **com dígito de verificação válido**, senão o cenário passa a dar 400 em vez do 404 que ele existe para exercitar. É o caso mais fácil de quebrar em silêncio de toda a lista |

### Aplicativo

| Arquivo | O que muda |
|---|---|
| `app/lib/api/mensagens_de_erro.dart` | `ajudaDoCampoDeCodigo` e o comentário que fala em "transcrição exata de 26 caracteres". A mensagem de `codigoNaoEncontrado` deixa de ser o destino de um erro de digitação, que era o seu defeito |
| `app/lib/api/problem.dart` | Comentário do 400, linha 57 |
| `app/lib/telas/escanear/tela_leitor_de_qr.dart` | Textos do caminho de digitação |
| Máscara de entrada | **Não existe hoje.** Não há `TextInputFormatter` nem `inputFormatters` no aplicativo; o único `maxLength` é o parâmetro genérico de `bichu_field.dart`. Então não há máscara a alterar, e sim uma a escrever, de `XXXX-XXXX-XXXX-XXXX`, que fica muito mais simples em 4 grupos iguais do que seria em 6 grupos mais um de 2. **Este item é oportunidade, não custo** |

### Documentos que esta emenda não pode alterar

`docs/05-ux-research.md` (seções 11.5, 20.10 e a linha 20.10 da matriz),
`docs/06-design-system.md` (1682, que declara o alfabeto e o agrupamento
conferidos contra este ADR), `docs/08-plano-de-testes.md` (11.1, HOM-79, `TAG-PDF`
e `TAG-PNG`) e `docs/03-arquitetura.md` seção 4.3. O item 11.1 do plano de testes
**fecha** com esta mudança em vez de exigir trabalho: a pergunta "cabe em 50 mm?"
deixa de ser aberta.

### O que não muda

Nenhuma migração de esquema. `pet_tags` continua com as mesmas colunas, os mesmos
tipos e os mesmos índices; `code_hash` continua `bytea` de 32 bytes e
`code_suffix` continua `char(4)`. A única operação de dados é apagar a linha de
teste, e a restrição `pet_tags_code_hash_sha256` deve ser renomeada para não
mentir sobre a função.

## 9. O ramo que não foi seguido: o corte sem o HMAC

**Este ramo não ocorreu.** O cliente aceitou a condição em 19/09, e a seção fica
como o registro de que **75 bits sem HMAC foi analisado e reprovado**, para que
ninguém o reintroduza depois como economia de escopo.

Se o cliente quisesse o código curto **sem** a troca do resumo, a recomendação era
**manter 128 bits e 26 caracteres**, e esta emenda passa a ser o registro de por
quê.

A razão é a tabela de 3: com SHA-256 sem chave, um vazamento do banco entrega
todos os códigos em 38 segundos de hardware que existe e está ligado hoje, e o
dano é permanente porque o código está em plástico. Trocar uma dificuldade de
digitação por isso é um mau negócio em qualquer leitura. **Não existe um tamanho
intermediário que escape dessa escolha**: 95 bits (20 caracteres, 6 a menos que
hoje) cai em 1,3 ano, e só acima de uns 110 bits o argumento original do ADR
sobrevive, ponto em que restam 2 caracteres de economia e a mudança não se paga.

O caminho de mais valor por menos risco, se a condição for recusada, é atacar a
usabilidade sem tocar no formato: a tela sem sinal já manda fotografar a
plaquinha, e o caminho de digitação pode ganhar leitura de texto por câmera. Isso
não fecha o item 11.1 do plano de testes, que é físico, mas reduz quem precisa
digitar.

## 10. Recomendação (a que foi levada ao cliente, e aceita)

**Aceitar**, com a condição da seção 3.1 como parte indivisível da decisão:
16 caracteres, 75 bits, símbolo de verificação sobre GF(2^5), `code_hash` em
HMAC-SHA-256 com chave em Secret Manager, corte seco sem convivência de
gerações.

O que sustenta: 75 bits deixam a varredura em 1 em 431 mil ao longo de dez anos
de um ataque que exige 50 mil endereços IP, três ordens de grandeza acima da
fronteira do desconforto, para proteger uma ficha pública de animal que é o que a
plaquinha existe para mostrar. O que custa: uma chave nova que não rotaciona sem
reprocessar a base. O que fecha: dez caracteres a menos, o primeiro símbolo de
verificação do produto, correção de erro Q no QR na mesma versão, e um item de
homologação que hoje está aberto por não caber na plaquinha.

**A decisão tem prazo.** Ela é barata enquanto existir uma tag revogada num banco
de desenvolvimento, e cara a partir da primeira plaquinha prensada.


---

## 11. O freio por faixa `/24`: adiado, e o adiamento é seguro

O cliente adiou os dois achados laterais da seção 7 (a divergência 60/h contra
300/h, e a ausência de freio de tentativas inválidas por `/24`). Como esta emenda
escreveu que a lacuna do `/24` é "irrelevante a 128 bits, relevante a 75", e os
75 bits foram aprovados, a pergunta certa foi feita: **o freio virou
pré-requisito do corte?**

**Não virou. 75 bits se sustentam sem ele, e este é o número.**

Primeiro, um ponto que evita confusão: **o HMAC não altera nada do ataque
online.** Quem adivinha códigos nunca vê um resumo; ele manda um código e recebe
200 ou 404. O HMAC fecha exclusivamente o caminho do vazamento de banco. As duas
decisões são ortogonais, e adiar o freio mexe só no caminho online.

**O que o atacante consegue hoje, sem o freio.** O limite que morde é o de
tentativas inválidas por IP, 20/h. Um `/24` tem 256 endereços, logo 5.120
tentativas inválidas por hora. Mas o limite `ip_24` de 2.000/h já existe com
`log_and_alert`: ele **não recusa, e alerta**. Um atacante que queira passar
despercebido precisa ficar abaixo dele, o que o prende a cerca de **2.000/h por
faixa**. A lacuna é de recusa, não de detecção, e isso muda o tamanho dela.

| | Sem freio, ignorando o alerta | Sem freio, furtivo | Com o freio proposto (200/h) |
|---|---|---|---|
| Taxa por `/24` | 5.120/h | 2.000/h | 200/h |
| Faixas `/24` para sustentar 10^6/h | 196 | 500 | 5.000 |

**O efeito na probabilidade, que é o que decide.** Em dez anos, 75 bits:

| Cenário | K | R | p (10 anos) |
|---|---|---|---|
| Base de 1 milhão, **sem** freio `/24` | 10^6 | 10^6/h | 1 em 431 mil |
| Base de 1 milhão, **com** freio `/24` | 10^6 | 4 × 10^4/h | 1 em 10,8 milhões |
| Dez vezes a base, sem freio | 10^7 | 10^6/h | 1 em 43 mil |
| Dez vezes a base e botnet dez vezes maior, sem freio | 10^7 | 10^7/h | 1 em 4,3 mil |
| Cem vezes a base e botnet dez vezes maior, sem freio | 10^8 | 10^7/h | 1 em 431 |

**O freio vale 25 vezes.** É uma melhoria real e deve continuar no backlog, mas
não é o que separa seguro de inseguro: sem ele, o cenário realista fica em 1 em
431 mil, que é a mesma ordem da conta que sustentou a aprovação, e continua três
ordens de grandeza acima da fronteira do desconforto identificada em 2.2.

**Onde eu não assinaria**, para que o critério fique escrito em vez de depender
de mim: a última linha da tabela, 1 em 431, exige **cem milhões de pets e uma
botnet de meio milhão de endereços**. Nenhum dos dois está no horizonte deste
produto, e os dois seriam visíveis com muita antecedência. **O gatilho para tirar
o freio do backlog e implementá-lo é a base passar de 10 milhões de pets, ou o
alerta de `ip_24` disparar de forma sustentada**, o que vier primeiro. Antes
disso, o adiamento é seguro e fica registrado como tal.

**A divergência 60/h contra 300/h continua sendo um defeito de documentação**, e
adiá-la não tem efeito de segurança: os dois números descrevem leituras válidas,
não tentativas inválidas, e o que protege contra varredura é o limite de
inválidas, que está implementado. O risco de deixá-la é alguém "corrigir" o
código para 60/h lendo este ADR e estrangular a rota legítima.

## 12. A ordem de implantação

Existe uma ordem segura e uma ordem que produz, no meio do caminho, exatamente o
estado que a seção 3 reprova. **A ordem não é preferência.**

### 12.1 HMAC primeiro. Encurtamento depois

**Fase 1 — `code_hash` passa a HMAC-SHA-256, com o código ainda em 26
caracteres.** Entra `TAG_CODE_INDEX_KEY` pelo Secret Manager, `hashDoCodigoDaTag`
ganha a chave, e nada mais muda. O produto continua em 128 bits e 26 caracteres o
tempo inteiro.

**Fase 2 — o código passa a 16 caracteres**, com 75 bits e o símbolo de
verificação. O caminho do vazamento já está fechado quando isto entra.

**Por que esta ordem e não a inversa.** A Fase 1 é inofensiva sozinha: HMAC sobre
uma entrada de 128 bits é estritamente mais forte que SHA-256 sobre a mesma
entrada, e o único efeito é que o argumento original deste ADR deixa de ser
load-bearing. Já a ordem inversa cria uma janela em que **códigos de 75 bits
ficam guardados sob SHA-256 sem sal**, que é o estado de 38 segundos. Essa janela
duraria o que durasse a segunda entrega, e um vazamento dentro dela não seria
reparável por nenhuma entrega posterior, porque os códigos vazados estariam
corretos para sempre.

**A propriedade a preservar, escrita como regra:** em nenhum instante entre as
duas fases o sistema fica pior do que está hoje. Uma entrega que quebre essa
propriedade está errada mesmo que o resultado final seja o mesmo.

**Podem entrar juntas, numa única entrega.** O que não pode é a Fase 2 sozinha, e
o que não pode é a Fase 2 antes da Fase 1.

### 12.2 A tag de teste, e um achado que só apareceu ao escrever a ordem

A linha existente em homologação (uma tag, `revoked`) é **apagada na Fase 1**, e
não na Fase 2. A razão é específica: trocar a função de resumo torna o
`code_hash` dela incomparável com qualquer entrada, então ela vira uma linha
irresolvível ocupando o índice único.

**Por que ela não pode ser recalculada, e por que isso importa muito mais do que
uma tag de teste.** Para uma tag **ativa**, a Fase 1 recalcularia o resumo sem
perda: decifra `code_ciphertext`, aplica o HMAC, grava. Para uma tag
**revogada**, isso é impossível, e é impossível por decisão deste próprio ADR: a
revogação **apaga** o cifrado, e a restrição `pet_tags_revogada_nao_guarda_o_codigo`
obriga `code_ciphertext IS NULL` fora de `active`. **O código de uma tag revogada
não é recuperável de lugar nenhum.**

A consequência é séria e não é sobre a tag de teste:

> **Uma migração para HMAC feita quando existirem tags revogadas no mundo real
> faria cada uma delas parar de resolver, e elas passariam a responder 404 em vez
> de 410.**

Isso quebraria uma garantia que este ADR trata como requisito de produto, e não
como detalhe: "uma tag revogada responde 410, nunca 404", porque quem está com um
animal no colo não pode chegar a um beco sem saída sem o
`next_action: register_stray_found_report`. O tutor que revogou uma plaquinha
perdida continua com aquela plaquinha circulando, e é exatamente ela que precisa
do 410.

**Hoje isso não custa nada**, porque a única tag revogada é um artefato de teste
que ninguém tem na mão. A janela é a mesma da impressão, e fecha pelo mesmo
motivo. É o argumento mais forte desta emenda para não adiar a Fase 1.

**Se um dia a Fase 1 precisar ser feita com tags revogadas reais**, para que
quem ler não fique sem saída: a solução é acrescentar `code_hash_legacy`,
preenchida apenas nas linhas revogadas, consultada apenas depois de o HMAC não
encontrar nada, e usada apenas para produzir o 410. Ela não reabre o caminho do
vazamento de forma relevante, porque o que ela protege são códigos que já não
resolvem para nada. **Não é necessária agora, e não deve ser antecipada**, pela
mesma razão que `pet_id` não é anulável: coluna que nada preenche é coluna que
ninguém remove depois.

## 13. Especificação para a história de implementação

Esta seção existe para que quem pegar a história não precise redescobrir nada, e
para que duas implementações não divirjam em silêncio.

### 13.1 O símbolo de verificação, completo

- Alfabeto: `0123456789ABCDEFGHJKMNPQRSTVWXYZ`, índice 0 a 31. Inalterado.
- Corpo: `GF(2^5)` com polinômio primitivo `x^5 + x^2 + 1`, isto é `0x25`.
- Multiplicação: produto de polinômios sobre `GF(2)`, reduzido por `0x25` sempre
  que o bit 5 aparecer.
- Gerador: `α = 2`. Verificado: a ordem de 2 em `GF(32)*` é 31, logo primitivo.
- Pesos, que são `α^1` a `α^15`, na ordem dos símbolos do primeiro ao décimo
  quinto: **2, 4, 8, 16, 5, 10, 20, 13, 26, 17, 7, 14, 28, 29, 31**. Quinze
  valores distintos, nenhum nulo.
- Símbolo de verificação: `c = XOR_i ( peso_i ⊗ valor_i )`, `i` de 1 a 15. O
  resultado é um índice de 0 a 31, e vira o décimo sexto caractere.
- Conferência: recalcular sobre os quinze primeiros e comparar com o décimo
  sexto. **Diferente significa recusar, nunca corrigir.**

**Onde ele roda:** dentro de `normalizarCodigoDaTag`, depois das substituições de
Crockford e antes de qualquer acesso ao banco. Falha na conferência devolve
`undefined`, que o contrato já traduz para **400**.

### 13.2 Os 75 bits a partir de 10 bytes, e uma correção minha

A porta `IdGenerator` entrega **10 bytes** (80 bits) e a codificação usa 75. A
primeira versão desta emenda disse "mascarar, nunca calcular módulo", e **isso
estava impreciso**. A regra correta, por contagem exata de pré-imagens sobre a
faixa de `2^80`:

| Redução | Pré-imagens por saída | Viés |
|---|---|---|
| `E (2^75 − 1)`, isto é a máscara | 32 para todas | **0%** |
| `mod 2^75` | 32 para todas | **0%** |
| `mod (2^75 − 1)` | 32 ou 33 | **3,12%** |
| `mod` qualquer não potência de dois | desigual | não nulo |

Máscara e `mod 2^75` são a mesma operação e as duas são uniformes, porque `2^75`
divide `2^80` exatamente. **O viés não vem de usar módulo; vem de reduzir por
algo que não é potência de dois.** A regra a escrever no código é essa, e a
máscara é apenas a forma de dizê-la que não dá margem a erro.

Os 5 bits descartados são os **mais significativos**. O efeito conferido: o
primeiro caractere passa a assumir **os 32 valores**, contra os 8 de hoje.

### 13.3 Vetores de conferência

Entrada em hexadecimal para a porta `IdGenerator`, saída canônica e impressa.
Qualquer implementação que discorde de um destes está errada.

| Entrada (10 bytes) | Canônico (16) | Impresso |
|---|---|---|
| `00010203040506070809` | `00G40R40M30E209X` | `00G4-0R40-M30E-209X` |
| `7c2f9a03b15e88d4c061` | `GQSM0XHBT4D9G31S` | `GQSM-0XHB-T4D9-G31S` |
| `ffffffffffffffffffff` | `ZZZZZZZZZZZZZZZN` | `ZZZZ-ZZZZ-ZZZZ-ZZZN` |
| `00000000000000000000` | `0000000000000000` | `0000-0000-0000-0000` |

**O último vetor não serve sozinho como teste**, e está aqui só para fechar a
tabela: o símbolo de verificação de quinze zeros é zero para qualquer conjunto de
pesos, então ele passaria mesmo com os pesos errados. Os dois primeiros são os
que discriminam.

### 13.4 Os casos que a esteira precisa reprovar

Vale a regra do projeto: prova negativa que vive numa frase evapora. Cada um
destes precisa existir como teste e precisa ser visto reprovando.

1. Um caractere trocado em qualquer posição é recusado (400), e **não** vira 404.
2. Duas posições trocadas entre si são recusadas.
3. O primeiro caractere cobre os 32 valores do alfabeto numa amostra grande. É o
   teste que pega o artefato voltando, e o que pega uma redução enviesada.
4. Os vetores de 13.3 produzem exatamente aquelas saídas.
5. `gerarCodigoDaTag` recusa entrada com menos de 10 bytes.
6. Um código de **26** caracteres, bem formado pelas regras antigas, é recusado
   com 400. É o caso que prova que não há duas gerações.
7. O código emitido normaliza para ele mesmo, com e sem hífen, em minúsculas.

**Atenção a um caso existente que quebra em silêncio:** `cypress/e2e/tag-revogada.cy.ts`
usa um código bem formado e inexistente para exercitar o 410. Refeito sem símbolo
de verificação válido, o cenário passa a receber 400 e deixa de testar o que
existe para testar, **continuando verde**.

### 13.5 Ordem de entrega

Fase 1 (HMAC, ainda em 26 caracteres) antes da Fase 2 (16 caracteres), ou as duas
juntas. Nunca a Fase 2 sozinha. O motivo está em 12.1, e a exclusão da linha de
teste pertence à Fase 1, pelo motivo de 12.2.

---

## 14. Correção de 21/09/2026: o freio que eu citei não está em vigor

Descoberto na entrega da BICHUS-147 e confirmado por mim: **nenhuma rota aplica
`x-rate-limit`.** A porta `RateLimitStore` existe, as três implementações
existem, todas as rotas declaram os tetos, e **nada chama `hit()`**. O portão da
esteira lê `api/openapi.yaml` e prova que o teto está **declarado**; ele nunca
abre `src/`. Detalhe e decisão em ADR-0016, Emenda 1.

**Duas afirmações desta emenda estavam apoiadas nesse freio, e ficam corrigidas.**

**2.4 dizia** que `R = 10^6/h` "já é pessimista" porque o teto de 20 tentativas
inválidas por IP/hora exigiria 50 mil endereços. Enquanto o teto não for
aplicado, **essa frase é falsa**: 10^6/h não exige 50 mil endereços, exige banda.

**A conclusão dos 16 caracteres não muda, e a razão é que ela nunca dependeu
disso.** O `R = 10^6/h` de 2.2 foi **estipulado** como capacidade do atacante, e
só depois 2.4 observou o custo em endereços. Retirando 2.4 inteira, os números de
2.2 continuam de pé. E existe um teto que não depende de configuração nenhuma: o
atacante não consegue emitir mais requisições do que a origem consegue atender.

| Cenário, 75 bits, K = 10^6, 10 anos | R | p |
|---|---|---|
| O que a emenda assumiu em 2.2 | 10^6/h | 1 em 431 mil |
| Origem pequena saturada (~1.000 req/s) | 3,6 × 10^6/h | 1 em 120 mil |
| Origem grande saturada (~3.000 req/s) | 1,1 × 10^7/h | 1 em 40 mil |

Sustentar a linha do meio por dez anos significa **saturar a origem de produção
continuamente por uma década**, o que é negação de serviço permanente e visível,
não varredura furtiva. **Os 16 caracteres seguem aprovados com margem**, e o que
a ausência do freio ameaça é disponibilidade, não o tamanho do código.

**O gatilho da seção 11 estava quebrado, e este é o erro mais sério desta
correção.** Eu escrevi que o freio por `/24` podia esperar até "a base passar de
10 milhões de pets, **ou o alerta de `ip_24` disparar de forma sustentada**". O
alerta é `log_and_alert` sobre um contador que **ninguém incrementa**: esse braço
do gatilho **nunca dispararia**. Era uma condição que se parecia com vigilância e
não observava nada.

**Gatilho corrigido:** a aplicação dos tetos (ADR-0016, Emenda 1) é
**pré-requisito**, e ela subsume a questão do `/24` — não se adia o refinamento
de um mecanismo que não existe. Implantada a aplicação, o freio por `/24` volta a
ser adiável, e aí sim com os dois braços: 10 milhões de pets, ou o alerta de
`ip_24` disparando de forma sustentada, que passa a ser um braço capaz de
disparar.

**O que continua verdadeiro sem nenhuma dependência:** a seção 3 (o ataque
offline e a exigência do HMAC) não toca em limite de chamada. A condição
inseparável da aprovação continua exatamente como está.
