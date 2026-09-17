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
