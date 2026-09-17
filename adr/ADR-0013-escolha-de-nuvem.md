# ADR-0013: Escolha de nuvem — AWS, GCP ou Azure

**Status:** **aceito** — decidido pelo cliente em 17/09/2026: **GCP**
**Data:** 2026-09-17
**Revisado em:** 2026-09-17 — **o cliente corrigiu o critério e ele tem razão.** A
primeira versão recomendava AWS pela compatibilidade com a API S3; um dia de
trabalho de adaptação não pode decidir uma conta que ele paga todo mês. A
compatibilidade foi rebaixada a item de custo de migração, quantificado em dias,
e o critério passou a ser **o menor custo para manter um servidor ligado 24
horas**. As seções de PostGIS, portabilidade, custo de saída, crédito e HSTS
continuam valendo e não foram mexidas.

## Contexto

O domínio saiu (`bichu.app`, registrado em 17/09) e o cliente quer decidir onde
criar a conta de nuvem. A escolha foi adiada em 17/09 pelo ADR-0012, e o
adiamento foi usado para construir portabilidade em vez de para procrastinar: o
contrato de portabilidade da seção 11 de `docs/03-arquitetura.md` é normativo, o
sistema inteiro roda em `compose.yaml`, e a última dependência de recurso de
provedor no caminho crítico (notificação de bucket) foi **removida**, não
substituída.

Este ADR é a comparação com o meu nome embaixo, em vez de uma escolha por
hábito. Ele é decisão de negócio tanto quanto de arquitetura, e quem paga a
conta é o cliente: por isso a tabela está montada para que outro critério leve a
outra conclusão, e a minha recomendação vem depois dela, não antes.

**Primeiro, a resposta que a pergunta dele embute.**

> **A escolha de nuvem NÃO precisa ser tomada para destravar o mínimo hospedado
> até 22/09.** São decisões independentes, e mantê-las independentes é o desenho,
> não um contorno.

O mínimo hospedado é um host com Docker rodando **a mesma imagem** do
`compose.yaml`, com TLS automático, servindo `bichu.app`, `api.bichu.app` e
`img.bichu.app`. Ele não usa serviço gerenciado nenhum. Pode ser uma máquina
virtual em qualquer lugar, inclusive num dos três — e **inclusive num provedor
que não seja o escolhido no fim**, porque não há nada nele para migrar além de
apontar o DNS. Se o cliente quiser resolver as duas coisas no mesmo provedor por
conveniência, **não cria acoplamento**, com uma condição: o mínimo hospedado
continua sem serviço gerenciado. No dia em que ele ganhar um banco gerenciado,
uma fila gerenciada ou um balanceador proprietário, ele deixou de ser ponte e
virou a escolha de nuvem por omissão — que é exatamente o que o ADR-0012 evitou.

O que trava o 22/09 é DNS, certificado e os arquivos de associação. Nenhum dos
três pede conta de nuvem.

## Os requisitos, que já estavam fechados

Não são requisitos escritos para esta comparação: são os que os ADRs anteriores
já impuseram.

| # | Requisito | Origem |
|---|---|---|
| R1 | PostgreSQL 15+ com **PostGIS 3.3+**, e um papel que consiga `CREATE EXTENSION` na migração inicial | ADR-0006 |
| R2 | Armazenamento de objeto **compatível com a API S3** | ADR-0007 |
| R3 | Runtime de container rodando **a mesma imagem** do `compose.yaml`, sem serviço proprietário no caminho | ADR-0001, ADR-0012 |
| R4 | Agendamento do job de consumação da transferência e do processamento de imagem | ADR-0007, contrato |
| R5 | Custo de saída baixo e desenho que não fica preso | ADR-0012 |

## A comparação

### R1 — PostGIS, e quem pode criar a extensão

É o item que ninguém olha antes de contratar e que muda a esteira, não o código.

| | AWS RDS for PostgreSQL | GCP Cloud SQL for PostgreSQL | Azure Database for PostgreSQL Flexible Server |
|---|---|---|---|
| PostGIS disponível | sim | sim | sim |
| Quem executa `CREATE EXTENSION postgis` | PostGIS é extensão **não confiável**: exige `rds_superuser`, ou o papel delegado `rds_extension`, que existe justamente para não dar superusuário a quem só precisa instalar extensão | apenas membros de **`cloudsqlsuperuser`**; o usuário `postgres` padrão já é membro | exige **duas etapas**: incluir `postgis` no parâmetro de servidor **`azure.extensions`** e, por ser não confiável, ser membro de **`azure_pg_admin`** |
| Efeito na esteira | a migração inicial roda com papel diferente do papel da aplicação. Uma linha de configuração, documentada | idem, e a mais simples das três | **uma mudança de parâmetro de servidor antes de qualquer migração rodar**, que é passo de infraestrutura e não de banco |
| Veredito | ok | ok, o mais simples | ok, com um passo a mais que precisa estar no provisionamento e não na migração |

Nenhum dos três reprova. A diferença é operacional e cabe em um parágrafo de
`docs/07-devops.md` — mas é a diferença entre saber disso antes e descobrir no
dia em que a primeira migração falha.

### R2 — Armazenamento de objeto: um item de custo de migração, e nada além disso

**Correção de entendimento, registrada para não reabrirem a discussão pelo motivo
errado.** O cliente descreveu armazenamento de objeto como o lugar dos assets
estáticos — CSS, JavaScript, imagem de build — fora do servidor de aplicação.
Isso está certo, é caso genérico e é **igual nos três**: qualquer um serve
estático atrás de CDN, e a escolha entre eles não muda nada aqui.

O peso que eu tinha dado vinha de outro lugar, mais estreito: o **upload direto
com autorização assinada**, em que o app Flutter envia a foto **sem passar pelo
backend** e é o cliente que consome o formato daquela autorização. É por isso
que a forma da API importou na minha leitura e não na dele. Mesmo assim, o custo
disso é um dia, e um dia não decide uma conta mensal.

**O fato fica registrado, mas deixa de mandar:**

| | AWS | GCP | Azure |
|---|---|---|---|
| Assets estáticos atrás de CDN | sim | sim | sim |
| Fala a API S3 | é a implementação de referência | sim, pelo modo de interoperabilidade da API XML | **não** |
| Custo de adaptação para o upload direto | zero | trocar `method` para `PUT`, que o contrato já prevê: **algumas horas** | **um segundo adaptador atrás da porta `ObjectStorage`: cerca de um dia, com teste** |

Um dia de trabalho, uma vez, contra uma diferença mensal que se repete doze
vezes por ano. **Este critério entra na conta como custo de migração e sai da
decisão.**

| | AWS | GCP | Azure |
|---|---|---|---|
| Fala a API S3 | **é a implementação de referência** | sim, pelo **modo de interoperabilidade** da API XML, com chaves HMAC | **não** |
| POST assinado com política (o caminho padrão do nosso contrato) | funciona como escrito | compatibilidade da política de POST **a confirmar**; o contrato já carrega `method: PUT` como saída prevista | não se aplica |
| Custo de adotar | zero | zero a baixo: trocar `method` para `PUT` é configuração, e o campo existe no contrato desde a rodada de portabilidade | **um segundo adaptador atrás da porta `ObjectStorage`: cerca de um dia, mais teste** |

**Escolher Azure custa um dia de trabalho que os outros dois não custam, e esse é
o item que mais diferencia os três para este produto.** Não é impeditivo — a
porta existe justamente para que isso seja um dia e não um projeto — mas é um
dia que precisa ser decidido de olhos abertos, num prazo de treze dias, e que
volta toda vez que a interface de armazenamento crescer.

Vale registrar a consequência que quase ninguém antecipa: **o MinIO que já roda
no `compose.yaml` é uma implementação de S3.** Em AWS ou GCP, o ambiente local e
o remoto falam literalmente o mesmo protocolo, e a portabilidade deixa de ser
afirmação e passa a ser executada duas vezes por dia. Em Azure, o caminho local
e o remoto passam a ser adaptadores diferentes — e adaptador que só roda em
produção é o que quebra em produção.

### R3 — Runtime de container

| | AWS | GCP | Azure |
|---|---|---|---|
| Serviço | ECS Fargate ou App Runner | Cloud Run | Container Apps |
| Roda a nossa imagem sem alteração | sim | sim | sim |
| Ressalva | nenhuma relevante | escala a zero, e **partida a frio no `GET /t/{code}` conflita com a meta de 60 s do scan ao aviso**; resolve-se fixando instância mínima em 1, o que apaga a vantagem de custo | nenhuma relevante |

Os três atendem. Este critério **não deve decidir a escolha**, e digo isso porque
é o critério que costuma decidir por ser o mais visível.

### R4 — Fila e agendador

**Também não deve decidir**, e a razão é de desenho: a fila de trabalho do
domínio é uma tabela do Postgres consumida com `FOR UPDATE SKIP LOCKED`, e o
agendamento da consumação da transferência é uma linha com `run_at`. Não há
dependência de fila gerenciada em nenhum dos três, de propósito. Quem comparar
os provedores por qualidade de fila estará comparando um recurso que este
produto não usa.

### R5 — Custo de sair, que é o critério que decidiu a rodada de identidade

Este foi o critério que eliminou o Auth0 no ADR-0003 — entrar era rápido e sair
exigia chamado de suporte com assinatura de executivo. Aplicado aqui, ele
**converge**, e isso é notícia recente que muda a conta:

- **Os três eliminaram a taxa de egresso para quem está saindo** (Google em
  janeiro de 2024, AWS em março de 2024, Azure em seguida), sob pressão do Data
  Act europeu, que a partir de janeiro de 2027 proíbe qualquer taxa de troca
  para clientes na União Europeia.
- **As condições são parecidas e importam:** é preciso migrar tudo, pedir o
  crédito e encerrar a conta ou a assinatura. É isenção de saída, não desconto
  de uso.
- **O que essas isenções NÃO cobrem é justamente o que este produto gasta:** o
  egresso do dia a dia, servindo foto de pet para celular em rede móvel. Sair é
  grátis; ficar é que custa por gigabyte.

Então o custo de saída real, para nós, não é a conta de transferência: é
**quanto do desenho fica preso**. E por construção isso é quase zero nos três,
com uma única exceção, que é o adaptador de armazenamento do Azure.

## O critério do cliente: o menor custo para ficar ligado 24 horas

Esta é agora a seção que decide. Todos os valores são **preço de tabela, ordem de
grandeza, em dólar, para conferir na contratação** — a conclusão não depende de
acertar o centavo, e sim da distância entre as faixas, que é grande.

### Primeiro, um requisito que muda a conta antes de qualquer comparação

**A região precisa ser São Paulo, e isso não é preferência.** O orçamento de
qualidade da seção 7 pede TTFB de 400 ms no p95 da rota pública do QR. Do
Sudeste para us-east são cerca de 120 ms de ida e volta, e uma conexão nova gasta
três a quatro voltas entre DNS, TLS e a primeira resposta: passa de 400 ms antes
de o servidor fazer qualquer coisa. Fora do Brasil, o número que eu mesmo
escrevi não fecha.

Consequência prática: **a região brasileira custa de 30% a 50% mais que a
americana em todas as nuvens**, e provedores muito baratos que não têm presença
no Brasil saem da lista por latência, não por preço. É o primeiro filtro, e ele
elimina mais opções do que a comparação entre as três grandes.

### As camadas baratas, que é onde a conta muda de ordem de grandeza

Comparar Fargate com Cloud Run com Container Apps responde a pergunta errada. A
pergunta dele é uma instância pequena ligada o mês inteiro.

| Configuração | AWS | GCP | Azure | VM comum (Vultr, região SP) |
|---|---|---|---|---|
| Instância pequena 24/7 (2 GB) | Lightsail, ~US$ 12, com franquia de tráfego generosa | `e2-small`, ~US$ 18 – 20 em São Paulo | série B (B1ms/B2s), ~US$ 15 – 35 | ~US$ 12, com franquia de tráfego |
| Peças para manter | 1 | 1 | 1 | 1 |
| Postgres **em container na mesma máquina** | US$ 0 | US$ 0 | US$ 0 | US$ 0 |
| Postgres **gerenciado** | RDS `t4g.micro` + disco: **US$ 16 – 20** | Cloud SQL menor + disco: **US$ 12 – 18** | Flexible B1ms + disco: **US$ 14 – 20** | não existe: seria contratar fora |
| **Total tudo em container, por mês** | **~US$ 12** | **~US$ 20** | **~US$ 15 – 20** | **~US$ 12** |
| **Total com Postgres gerenciado, por mês** | ~US$ 30 | ~US$ 35 | ~US$ 32 | ~US$ 27 (VM + banco gerenciado de outro) |
| **Total com tudo gerenciado** (container gerenciado + banco + CDN) | ~US$ 45 – 70 | ~US$ 45 – 70 | ~US$ 45 – 70 | — |

**A resposta direta à pergunta dele: o maior item isolado da conta é o banco
gerenciado, e ele mais que dobra o custo neste volume.** US$ 12 viram US$ 30 sem
que o produto entregue uma única coisa a mais para o tutor que perdeu o cachorro.
Em seguida vem a diferença entre serviço de container gerenciado e uma instância
comum, que é a segunda multiplicação.

### Doze meses, não o primeiro

É o recorte que o crédito distorce, e é o que ele pediu:

| Configuração | Mês 1 (com crédito) | Meses 7 a 12 | **Ano 1, real** |
|---|---|---|---|
| Uma VM com tudo em container | US$ 0 | ~US$ 12 – 20 | **~US$ 150 – 240** |
| VM + Postgres gerenciado | US$ 0 | ~US$ 30 | **~US$ 360** |
| Tudo gerenciado | US$ 0 | ~US$ 45 – 70 | **~US$ 540 – 840** |

O crédito de US$ 200 a 300 cobre **seis meses** da configuração barata e **quatro
meses** da cara — e é justamente por isso que ele engana: a configuração cara
parece igual à barata durante o tempo em que ninguém está olhando.

### Onde o gerenciado custa mais do que entrega, e onde ele passa a valer

Neste tamanho — 3.000 pets, 10.000 usuários, um container e um banco que cabem
numa máquina de 2 GB — **o banco gerenciado custa mais do que entrega**. O que
ele dá é backup automático, recuperação para um ponto no tempo, atualização de
versão menor e troca automática em falha. Num ambiente de homologação, sem dado
real, nada disso vale US$ 18 por mês: um `pg_dump` diário guardado fora do host
resolve o risco que existe.

**Ele passa a valer no dia em que existir dado de usuário real que não pode ser
perdido**, e esse dia é o lançamento, não hoje. Esse é o gatilho, e ele é
verificável: enquanto o ambiente for homologação e não receber dado real, banco
em container; do primeiro usuário real em diante, banco gerenciado. Vale
lembrar que isso já está registrado como dívida 12 no documento de arquitetura,
com o mesmo gatilho.

### Custo de operação, apresentado em separado

O cliente escreveu "o provider que seja mais complexo", e a frase admite duas
leituras: erro de digitação para "menos complexo", ou "aceito mais complexidade
se for mais barato". **Não resolvo a ambiguidade por conta própria**, e não
preciso: apresento a operação separada do preço, e neste caso as duas leituras
levam ao mesmo lugar.

| | Uma VM com tudo | VM + banco gerenciado | Tudo gerenciado |
|---|---|---|---|
| Peças para manter | **1** | 2 | 4 a 5 |
| Trabalho de configuração inicial | ~1 dia | ~1,5 dia | ~3 dias |
| Trabalho recorrente | atualização do sistema, espaço em disco, **conferir o backup** | atualização do sistema | quase nenhum |
| O que quebra sozinho | disco enche; backup que ninguém confere; a máquina morre e **não há troca automática: a recuperação é manual** | disco da aplicação | pouca coisa, e a fatura cresce |
| Custo mensal | o menor | o dobro | de três a cinco vezes |

**Menos peças e menos dinheiro apontam para o mesmo lugar aqui; mais trabalho
recorrente é o preço, e ele é de horas por mês, não por dia.** Por isso a
recomendação serve às duas leituras da frase — e por isso ela não depende de
resolver a ambiguidade, embora valha resolvê-la.

## O que o crédito inicial esconde

Os três dão crédito de entrada, e ele vale a pena — mas ele some no mês em que o
produto começa a valer a pena, e por três motivos que não aparecem no anúncio:

1. **O crédito expira por data, não por consumo.** No nosso volume, US$ 200 a
   300 cobrem de quatro a seis meses, e a janela costuma ser menor que isso: uma
   das ofertas expira em **30 dias**, independentemente de quanto sobrou.
2. **A camada gratuita cobre o que é barato e não cobre o que é caro.** O que
   pesa na nossa conta é banco e container sempre ligados, e é exatamente aí que
   a gratuidade termina primeiro.
3. **O crédito esconde o custo unitário no momento em que ele é aprendido.** Nos
   primeiros meses ninguém olha o painel porque nada é cobrado, e quando a
   primeira fatura chega o desenho já está tomado. A contramedida não é escolher
   melhor: é **ligar alerta de orçamento no dia um**, com teto, em qualquer dos
   três.

## Decisão do cliente: GCP

**Provedor: Google Cloud Platform.** Decidido em 17/09/2026, por dois critérios
que ele deu e que estão registrados aqui porque explicam a escolha melhor do que
a tabela:

1. **Custo de manter um servidor ligado 24 horas**, que é o critério que ele
   corrigiu em cima da minha primeira versão deste ADR — e com razão, porque eu
   tinha deixado um dia de trabalho de adaptação decidir uma conta mensal.
2. **Consolidação de fornecedor**: o produto já vai usar vários serviços do
   Google. É argumento legítimo e não é técnico: menos contratos, menos faturas,
   menos contas para administrar, e uma relação comercial só.

A minha recomendação técnica, na seção seguinte, também apontava GCP entre as
três grandes. As duas conclusões coincidem por caminhos diferentes, e isso é bom:
significa que a escolha não depende de um dos dois argumentos estar certo.

### O desenho aprovado, confirmado com duas ressalvas

**`e2-small` no Compute Engine, região `southamerica-east1`, rodando o
`compose.yaml` inteiro**, sem serviço gerenciado, e a mesma máquina servindo de
mínimo hospedado até 22/09. **Confirmo**, e a região é requisito e não
preferência, pelo orçamento de TTFB.

Duas ressalvas, e a primeira é a que morde:

**1. `e2-small` tem 2 GB, e o processamento de imagem é quem estoura.** A conta
de memória fica assim: Postgres com PostGIS quer 256 a 512 MB de cache, a API
fica em 150 a 300 MB, o MinIO em 100 a 200 MB, o proxy em 50 MB. Sobra pouco, e
o worker que redimensiona foto **aloca centenas de megabytes de uma vez** para
decodificar uma imagem de 10 MB. Quando falta memória, quem o sistema mata é o
processo maior, que quase sempre é o **banco** — e o sintoma que aparece é "o
banco caiu sozinho", sem nenhuma relação aparente com upload de foto.

Mitigação, obrigatória e barata: **limite de memória declarado por container** no
`compose.yaml`, `WORKER_IMAGE_CONCURRENCY=1`, e swap configurado na máquina. Com
isso o worker falha sozinho e reprocessa, em vez de derrubar o banco junto.

**2. `e2-small` é de núcleo compartilhado**, com desempenho sustentado bem abaixo
do pico. Para o volume do MVP — cerca de 33 fotos por dia — isso é irrelevante.
Deixa de ser no dia em que houver processamento contínuo de imagem.

**Se qualquer das duas apertar, a saída é `e2-medium`**, que dobra a memória por
cerca do dobro do preço. É **reinício, não migração**: mesma imagem, mesma
máquina, mesmo disco. O gatilho está na seção 16 do documento de arquitetura.

### Duas correções de premissa que precisam ficar escritas

**O Firebase Dynamic Links foi descontinuado em agosto de 2025 e não existe
mais.** O deep link deste projeto é **App Links e Universal Links servidos pelo
próprio domínio**, por `assetlinks.json` e `apple-app-site-association`, sem
intermediário nenhum. O Firebase continua no projeto **pelo FCM, que é push, e
só** (ADR-0008). Escrevo isto porque o risco é de leitura: quem lê "Firebase" e
entende "deep link resolvido" relaxa no domínio e nos arquivos de associação, que
são o que de fato entrega o deep link — e são eles que têm data limite em 22/09.

**Google Workspace é fatura separada do GCP**, cobrada por usuário. A
consolidação vale para Maps e FCM, que entram na conta do GCP; **não vale para o
e-mail de recebimento**, que é contrato próprio. E não muda nada no envio
transacional, que é Postmark por decisão do ADR-0009.

## Recomendação técnica, que precedeu a decisão

**Recomendo não contratar nuvem agora. Uma máquina virtual pequena, em região de
São Paulo, rodando o `compose.yaml` inteiro, por cerca de US$ 12 por mês.**

É a resposta ao critério que ele deu, e ela é a mesma coisa que o mínimo
hospedado que já está desenhado — o que significa que não há trabalho novo, nem
migração entre uma etapa e a seguinte. Três razões, na ordem de peso:

1. **É o mais barato para ficar ligado 24 horas**, que é o critério dele, e por
   uma margem grande: de três a cinco vezes menos que a configuração gerenciada
   equivalente, e metade da configuração com banco gerenciado.
2. **É também o que tem menos peças**, então serve às duas leituras da frase
   sobre complexidade. O preço é trabalho recorrente medido em horas por mês.
3. **Não fecha porta nenhuma.** O contrato de portabilidade da seção 11 continua
   valendo, a imagem é a mesma, e migrar dali para qualquer das três nuvens é
   apontar variáveis de ambiente e o DNS.

**Entre as três grandes, quando a decisão chegar, minha recomendação é GCP**, e
mudei de posição em relação à primeira versão deste ADR. O motivo é o critério
dele aplicado ao que resta: no volume em que a conta começa a doer, o item que
pesa é o banco gerenciado, e o do GCP é o mais barato dos três na faixa pequena
**e** o mais simples de habilitar PostGIS — o usuário `postgres` padrão já é
membro de `cloudsqlsuperuser`, sem parâmetro de servidor para mexer antes. O
custo dessa escolha é trocar o upload direto para `method: PUT`, que o contrato
já prevê: algumas horas, uma vez.

**A AWS continua sendo escolha defensável** e vira a certa se a franquia de
tráfego do Lightsail importar — ela é generosa e simplifica a previsão da conta
no dia em que a mídia crescer. **A Azure fica em terceiro por custo**, não por
capacidade, e some um dia de adaptador de armazenamento; ela vira a primeira se
já existir contrato corporativo lá, porque aí o desconto real supera tudo isto.

### Quando esta decisão deixa de ser a certa

Três gatilhos, e cada um tem número:

| Gatilho | Número | O que muda |
|---|---|---|
| **Dado de usuário real em produção** | o primeiro cadastro que não seja de teste | banco em container passa a banco gerenciado. É o gatilho mais importante e o mais próximo |
| **A máquina apertar** | uso sustentado acima de 70% de CPU ou de memória, ou banco acima de ~50 GB | separar banco e aplicação, e aí a nuvem entra para valer |
| **Egresso** | acima de **1 TB por mês**, que a 150 KB por imagem são cerca de 7 milhões de visualizações, umas cem vezes o MVP | o egresso vira a maior linha da conta e a mídia sai para armazenamento de egresso zero, **sem trocar de nuvem**, porque a porta `ObjectStorage` permite |

**E um quarto gatilho que não é de volume: quando a indisponibilidade passar a
custar.** Uma VM sem troca automática significa recuperação manual. Enquanto o
produto for homologação, isso é aceitável e está registrado como dívida 12. No
dia em que um tutor depender do alerta para achar o cachorro dele, deixa de ser.

### A tabela para outro critério levar a outra conclusão

É o que uma decisão de negócio precisa ter: quem paga a conta pode pesar
diferente de mim e chegar a outro lugar com método, não por discordância.

| Se o critério que mais pesa for… | A escolha é | O que custa |
|---|---|---|
| **Menor custo para ficar ligado** (o critério dado) | **uma VM pequena em São Paulo, tudo em container** | backup e atualização por nossa conta; sem troca automática em falha |
| Menor conta no dia em que o banco tiver que ser gerenciado | **GCP** | algumas horas trocando o upload direto para `method: PUT` |
| Previsibilidade da conta quando a mídia crescer | **AWS**, pela franquia de tráfego do Lightsail | papel especial na migração inicial do PostGIS |
| Já existe contrato ou crédito corporativo | **Azure** | um dia de adaptador de armazenamento, mais o passo de lista permitida da extensão |
| Menos trabalho recorrente, aceitando pagar por ele | qualquer uma das três, tudo gerenciado | de três a cinco vezes a conta, sem entregar nada a mais ao tutor neste volume |
| Latência para o usuário brasileiro | qualquer opção **com região em São Paulo** | 30% a 50% a mais que a região americana, e isso não é negociável pelo orçamento de TTFB |

**Se nenhum desses critérios for decisivo, a decisão certa continua sendo a mais
barata de tomar e de desfazer: uma VM hoje, e a nuvem no dia em que existir dado
real.** Adiar mais não melhora a informação disponível; contratar antes só
antecipa a fatura.

## Alternativas consideradas

| Opção | Prós | Contras | Por que não |
|---|---|---|---|
| Continuar sem nuvem, só no mínimo hospedado | custo mínimo, zero decisão | sem redundância, sem backup gerenciado, sem escala; não deve receber dado real | é homologação, e está escrito assim (dívida 12) |
| **Uma VM comum com Docker (a recomendação)** | o mais barato para ficar ligado, menos peças, zero trabalho novo porque é o mínimo hospedado | sem troca automática em falha, backup por nossa conta, atualização do sistema por nossa conta | **é a escolhida**, com os gatilhos de saída escritos |
| Provedor fora do Brasil, mais barato ainda (Hetzner e semelhantes, a partir de ~US$ 5) | metade do preço | **sem região no Brasil**: 120 ms de ida e volta estouram o orçamento de 400 ms de TTFB da rota do achador | preço não compra latência; o filtro de região elimina antes da comparação de custo |
| Camada sempre gratuita de algum provedor | US$ 0 | capacidade escassa e sem garantia, e o dia em que ela falta é o dia em que o produto está no ar | não se constrói um prazo em cima de disponibilidade não garantida |
| Multi-nuvem desde já | portabilidade máxima | paga duas vezes para não decidir | portabilidade já está garantida por contrato de código |
| Decidir a nuvem antes de subir o mínimo hospedado | uma decisão a menos depois | atrasa o 22/09 por uma decisão comercial que não bloqueia nada | as duas são independentes, e mantê-las assim é o desenho |

## Consequências

Fica mais fácil: provisionar, porque os requisitos estão escritos e a lista de
verificação do ADR-0006 pode ser executada antes de aprovar o provedor.

Fica mais difícil: `infra/` passa a ser escrito para um provedor, e essa parte é
reescrita se a escolha mudar — está declarado na seção 11.6 como não portátil, e
continua verdade.

Passa a ser irreversível na prática: nada, desde que o contrato de portabilidade
continue sendo imposto na revisão. **É esse contrato, e não este ADR, que mantém
a escolha reversível.** O dia em que um `import` de SDK aparecer fora de
`adapters/external/`, esta decisão deixa de ser uma decisão e vira um casamento.

**Dependência que precisa estar dita:** escolher a nuvem **não** destrava nada do
dia 30 e **não** bloqueia nada. Quem bloqueia o dia 30 é o mínimo hospedado, e
ele depende de DNS, certificado, conta Apple e chave de assinatura do APK —
nenhum dos quatro depende deste ADR.
