# ADR-0025: Produção e homologação separadas na mesma VM, antes de o site subir

**Status:** aceito na forma. **A execução depende de uma resposta do cliente**
sobre a máquina (seção 3): com os tetos de memória que o projeto usa, os dois
ambientes não cabem na e2-small
**Data:** 2026-09-23
**Depende de:** ADR-0013 (a VM e os tetos de memória), ADR-0022 (segredos),
ADR-0017 emenda 1 e ADR-0004 (o host impresso), ADR-0024 (o site e os hosts)
**Revisa:** ADR-0024, item 5 (a tabela de hosts ganha os dois ambientes)

## Contexto

Em 23/09 o cliente decidiu três coisas que se tocam:

1. **produção e homologação ficam separadas antes de o site subir**;
2. tudo continua **na mesma VM** (`bichu-hml`, `bichu-app-508914`,
   `southamerica-east1-a`), em containers separados;
3. a máquina fica na **e2-small**, com alerta de memória em 70% sustentado.

O estado de hoje, que é o ponto de partida do corte:

- **uma** pilha: `db` (Postgres com PostGIS, banco `bichu`, e a aplicação entra
  como `bichu`, que é o **superusuário** do container), `objeto` (MinIO, buckets
  `bichu-media-private` e `bichu-media-public`), `api`, `worker` e `edge`;
- `hml.bichu.app`, `bichu.app` e `tag.bichu.app` são aliases do mesmo bloco da
  API. `img.bichu.app` é alias de `img-hml.bichu.app`;
- os segredos de runtime vêm do Secret Manager do projeto `bichu-app-508914`
  (ADR-0022), com **valores de homologação**. O nome do segredo é o nome da
  variável, sem prefixo, e o que separa ambientes é o **projeto** apontado por
  `SECRET_STORE_PROJECT`. Isso já estava decidido e escrito em
  `src/shared/config/segredos.ts`: *"é por isso que não existe
  `MAIL_API_TOKEN_HML`"*;
- o `MinIO` sobe com o usuário raiz igual à credencial que a aplicação usa
  (`compose.yaml`: `MINIO_ROOT_USER: ${OBJECT_STORAGE_ACCESS_KEY_ID}`);
- o app no aparelho do cliente foi compilado com
  `API_BASE_URL=https://hml.bichu.app`;
- `TAG_BASE_URL` da pilha é `https://tag.bichu.app` desde 19/09. **Os códigos de
  tag gerados até hoje estão no banco de homologação e apontam para o host de
  produção.**

## Decisão

### 1. Todo dado que existe hoje é de homologação

O banco `bichu`, os dois buckets e os segredos do cofre de hoje **são
homologação**. Produção nasce vazia, com chaves novas. Assim o aparelho do
cliente continua falando com o mesmo dado, a mesma sessão e as mesmas fotos, e
nada de teste escorre para produção.

### 2. O que é de cada ambiente

| Recurso | Homologação | Produção | Por quê |
|---|---|---|---|
| Banco | database `bichu_hml`, role `bichu_hml` (dona do banco, **sem** superusuário), no mesmo Postgres | database `bichu_prod`, role `bichu_prod`, idem | seção 4 |
| API, worker, site | `api-hml`, `worker-hml`, `web-hml`, `migracao-hml` | `api-prod`, `worker-prod`, `web-prod`, `migracao-prod` | nomes distintos na rede; seção 5 |
| `ENVIRONMENT` | `homolog` (o que já é; é ele que faz `make reset` recusar) | `prod` | |
| Buckets | `bichu-media-private`, `bichu-media-public` (os de hoje) | `bichu-prod-media-private`, `bichu-prod-media-public` | bucket S3 não se renomeia; quem já tem dado fica com o nome |
| Usuário do MinIO | `bichu-hml`, com política só nos dois buckets dele | `bichu-prod`, idem | a raiz sai da aplicação |
| Mídia pública | `https://img-hml.bichu.app` | `https://img.bichu.app` | dois blocos na borda, cada um roteando só o seu bucket público |
| Cofre (`SECRET_STORE_PROJECT`) | **projeto GCP novo de homologação** (a criar pelo cliente) | `bichu-app-508914` | nome igual, projeto diferente (ADR-0022) |
| `PUBLIC_BASE_URL` | `https://hml.bichu.app` | `https://api.bichu.app` | |
| `TOKEN_ISSUER` | **o valor atual, sem mudar**, conferido com `printenv TOKEN_ISSUER` antes do passo 8, para a sessão do cliente sobreviver | `https://api.bichu.app` | token de um ambiente é recusado no outro por emissor, por `kid` e por assinatura |
| `TAG_BASE_URL` | **`https://hml.bichu.app`** | **`https://tag.bichu.app`** | seção 7 |
| `WEB_BASE_URL` | `https://hml.bichu.app` | `https://bichu.app` | os links de e-mail de hml abrem o site de hml |
| `API_BASE_URL` do build do app | `https://hml.bichu.app` (o de hoje) | `https://api.bichu.app` | seção 8 |
| E-mail (Postmark) | servidor Postmark de homologação, com o token que já está no cofre | servidor Postmark de produção, token novo | seção 6 |
| Push (FCM) | `PUSH_TRANSPORT=log` até existir o app de homologação registrado no projeto novo | `FCM_PROJECT=bichu-app-508914`, conta `bichu-push` que já existe | seção 6 |
| Sentry | DSN próprio | DSN próprio | seção 6 |
| Backup do banco | `gs://bichu-backup-hml`, 14 dias (o de hoje) | `gs://bichu-backup-prod`, 30 dias, no projeto de produção | seção 9 |

**Segredos separados, todos:** `DATABASE_URL`, `IP_HMAC_KEY`, `TAG_CODE_KEY`,
`TAG_CODE_INDEX_KEY`, `JWT_ACTIVE_PRIVATE_KEY`, `JWT_NEXT_PRIVATE_KEY`,
`OBJECT_STORAGE_ACCESS_KEY_ID`, `OBJECT_STORAGE_SECRET_ACCESS_KEY`, mais
`MAIL_API_TOKEN` e `MAIL_WEBHOOK_SECRET` quando o adaptador do Postmark existir.
Produção gera **todos** de novo. Os `kid` de produção são novos e diferentes dos
de homologação. Um código de tag de um ambiente não resolve no outro, porque o
índice cego (`TAG_CODE_INDEX_KEY`) é diferente.

### 3. A memória não fecha na e2-small, e isso precisa voltar ao cliente

O `compose.yaml` fixa uma regra, com o motivo escrito no topo dele: **a soma dos
tetos cabe na memória da máquina**, porque, quando não cabe, quem o sistema mata
é o Postgres. Com os dois ambientes:

| Serviço | Teto (MB) |
|---|---|
| `db` (um só) | 640 |
| `objeto` (um só) | 320 |
| `edge` (um só) | 64 |
| `api-prod` + `worker-prod` + `web-prod` | 320 + 448 + 96 |
| `api-hml` + `worker-hml` + `web-hml` | 320 + 448 + 96 |
| **Soma** | **2752** |

A e2-small tem **2048**. Não há ajuste de teto que resolva: tirando o `web-hml`,
e com os dois `worker` na metade, a soma ainda passa de 2 GB, e o `worker` é
quem decodifica foto (ADR-0013 registra "centenas de megabytes de uma vez").

As três formas de fazer caber são decisão de custo e estão na pergunta 1, no fim.
**Este plano está escrito para a opção (a), e2-medium**, que é a minha
recomendação: mesma VM, mesmo disco, reinício de minutos (ADR-0013), e sobram
~1,3 GB. Na opção (b), segunda VM, o plano muda e eu o reescrevo. Na opção (c),
com homologação ligada só sob demanda, os passos são os mesmos e a regra da soma
vale só com homologação desligada.

**O alerta de memória vale em qualquer das três:**

- **onde mora:** política de alerta no Cloud Monitoring do projeto
  `bichu-app-508914`, com a definição versionada em
  `infra/monitoramento/alerta-memoria.json` e aplicada por
  `gcloud monitoring policies create --policy-from-file`. A métrica é
  `agent.googleapis.com/memory/percent_used` (estado `used`), que exige o **Ops
  Agent** na VM; sem ele, a memória do convidado não chega ao Monitoring e o
  alerta nunca dispara, sem erro nenhum;
- **"sustentado" em número:** média acima de **70% por 15 minutos**. Uma segunda
  condição, acima de **90% por 5 minutos**, é a de urgência;
- **canal:** e-mail `oi@bichu.app`, a menos que o cliente indique outro;
- **o gatilho de decisão, que é diferente do alerta:** o alerta de 70% disparando
  em **3 dias distintos dentro de 7**, ou ficando aberto por **mais de 1 hora**,
  reabre a pergunta da máquina ao cliente (ADR-0013: "a máquina apertar");
- **prova de que funciona:** uma cópia temporária da política com limiar de 1% e
  duração de 60 s precisa entregar o e-mail; depois ela é apagada. Alerta que
  nunca disparou é suposição.

O Monitoring não entra na conta do portão de serviço gerenciado do ADR-0022: a
aplicação não o lê, não sobe com ele e não depende dele. É operação, como o
alerta de orçamento que já existe.

### 4. Banco: database e role separados no mesmo Postgres

**Decidido: um Postgres, dois bancos, duas roles sem superusuário.** Instância
separada custaria outros 640 MB de teto, que é mais do que a e2-medium deixa com
folga, e a separação que importa (credencial, dado e backup) se obtém dentro de
uma instância:

- cada role é **dona** do seu banco e **não** conecta no do outro:
  `REVOKE CONNECT ON DATABASE ... FROM PUBLIC` nos três bancos;
- nenhuma aplicação entra como `bichu`. O superusuário fica para operação e
  para criar extensão;
- `postgis` e `citext` são criados pelo superusuário em cada banco novo **antes**
  da primeira migração. A migração `20260917000001` usa
  `CREATE EXTENSION IF NOT EXISTS`, que vira nada quando a extensão já existe, e
  por isso a role sem superusuário consegue migrar;
- **homologação muda de banco por `pg_dump`/`pg_restore --no-owner
  --role=bichu_hml`**, e não por renomear nem por trocar dono objeto a objeto.
  Três razões: os objetos de hoje pertencem ao superusuário de inicialização,
  cujo `REASSIGN OWNED` o Postgres recusa; a cópia deixa todos os objetos com a
  dona certa de uma vez; e o banco `bichu` antigo fica intacto como ponto de
  retorno.

**O que isso não separa, dito por extenso:** CPU, memória e disco são
compartilhados, então uma consulta pesada em homologação atrasa produção. E o
superusuário vê os dois. O gatilho do ADR-0013 para banco gerenciado continua
valendo e é o mais próximo: **o primeiro cadastro que não seja de teste**. Ele
passa a disparar no dia em que o site de produção abrir cadastro.

### 5. Containers e rede

Os dois ambientes rodam a **mesma imagem** com configuração diferente. A forma
do arquivo de composição é do DevOps; o que ela não pode ter:

- **dois serviços com o mesmo nome numa rede compartilhada.** O Compose dá a
  cada serviço o próprio nome como alias em toda rede em que ele está. Dois
  `api` numa rede comum viram DNS em rodízio, e metade das requisições de
  produção cai em homologação, sem erro;
- **rota de homologação para produção.** Duas redes, `rede-prod` e `rede-hml`.
  `db`, `objeto` e `edge` ficam nas duas. `api-*`, `worker-*`, `web-*` e
  `migracao-*` ficam só na do seu ambiente.

O `web-prod` chama `http://api-prod:3000`, e o `web-hml` chama
`http://api-hml:3000` (`API_INTERNAL_URL`, ADR-0024 item 3).

**O limite honesto desta separação:** numa VM só, os dois ambientes usam a mesma
conta de serviço, pelo servidor de metadados. Um container de homologação
comprometido consegue pedir o token da VM e ler o cofre de produção. Separar a
identidade exigiria chave de conta de serviço em arquivo, que a organização
proíbe e o ADR-0022 existe para evitar. A separação daqui protege contra
**engano** (configuração trocada, dado de teste em produção, credencial usada no
lugar errado), e não contra invasão de um ambiente pelo outro. Essa proteção
chega com a segunda VM ou com a saída para serviço gerenciado.

### 6. E-mail, push e monitoramento de erro

- **Postmark:** um *Server* por ambiente, na mesma conta, cada um com o seu
  token e o seu webhook. O de homologação é o token que já está no cofre desde
  19/09. O webhook aponta para o host do seu ambiente
  (`https://hml.bichu.app/webhooks/postmark` e
  `https://api.bichu.app/webhooks/postmark`), com `MAIL_WEBHOOK_SECRET`
  diferente. Hoje os dois ficam em `MAIL_TRANSPORT=log`, porque o adaptador não
  existe (ADR-0009). Nada muda no dia do corte.
- **FCM:** produção usa o projeto `bichu-app-508914` e a conta `bichu-push` que
  já existem. Homologação fica em `PUSH_TRANSPORT=log` até existir um app de
  homologação (`app.bichu.hml`, variante do build) registrado no projeto GCP de
  homologação, que também serve de projeto Firebase. Mandar push de homologação
  pelo projeto de produção misturaria os tokens de aparelho dos dois ambientes
  no mesmo remetente.
- **Sentry:** um projeto por ambiente, cada um com o seu `SENTRY_DSN`, para que o
  ruído de teste não gaste a cota nem dispare o alerta de produção. Os dois estão
  vazios hoje, e o envio fica desligado até a conta existir.

### 7. O QR: os dois ambientes nunca emitem o mesmo host

- **Produção:** `TAG_BASE_URL=https://tag.bichu.app`. É o host da plaquinha, e é
  irreversível depois de impresso (ADR-0004, emenda 1).
- **Homologação:** `TAG_BASE_URL=https://hml.bichu.app`. O QR de teste abre
  `https://hml.bichu.app/t/{código}`, servido pelo `web-hml`. Não precisa de
  DNS nem de certificado novo, e o domínio registrável é o mesmo, então a guarda
  de `app-config.ts` aceita.

Isso é conferido, não suposto: o passo 14 escreve uma verificação permanente que
reprova se os dois ambientes tiverem o mesmo host de `TAG_BASE_URL`, o mesmo
`TOKEN_ISSUER`, o mesmo `SECRET_STORE_PROJECT` ou o mesmo bucket.

**O que o corte quebra, e precisa ser dito antes:** os códigos de tag criados em
homologação até hoje foram gerados com `tag.bichu.app`. Depois do corte, esse
host aponta para produção, onde o código não existe, e responde 404. Se algum
desses QR foi **impresso**, ele morreu. O `qr_png_url` de homologação passa a
sair com `hml.bichu.app`, porque o QR é gerado a partir do código cifrado com a
base do momento, mas plástico não se regera. Pergunta 2.

Uma consequência sobre o deep link: `hml.bichu.app` não é host declarado no app
(emenda 1: `tag.bichu.app` e `bichu.app`). O QR de homologação abre o navegador,
e não o app, a menos que o build de homologação declare esse host.

### 8. O aparelho do cliente

O app instalado aponta para `https://hml.bichu.app` e continua apontando. Depois
do corte, esse host é a API de homologação, com o **mesmo dado** (copiado para
`bichu_hml`), as **mesmas chaves JWT** (copiadas para o cofre de homologação) e o
**mesmo `TOKEN_ISSUER`**. A sessão dele sobrevive e ele não reinstala nada. Ele
fica sem serviço só durante a janela do passo 7 (~15 minutos), e o dia e a hora
são combinados com ele antes.

O build de loja passa a usar `API_BASE_URL=https://api.bichu.app`. Esse build é
outro APK, e o de homologação não muda.

### 9. Backup

| | Homologação | Produção |
|---|---|---|
| `pg_dump` diário | `bichu_hml` → `gs://bichu-backup-hml`, 14 dias (o de hoje, trocando o banco) | `bichu_prod` → `gs://bichu-backup-prod` no projeto `bichu-app-508914`, **30 dias**, VM só com `objectCreator` |
| Objetos | snapshot do disco | snapshot do disco |
| Snapshot da VM | diário, 7 dias (o de hoje), cobre os dois | idem |
| Ensaio de restauração | — | **antes de o site subir**, e depois todo mês: restaurar o dump do dia num banco `ensaio_restauracao`, contar as linhas e apagar o banco de ensaio |

**Lacuna aceita:** as fotos de produção só existem no disco da VM e nos
snapshots dele. Perder a VM e os snapshots perde as fotos. Gatilho para espelhar
o bucket privado de produção fora do host: o primeiro tutor real com foto.

### 10. O que `hml.bichu.app` passa a servir

A API de homologação, **igual a hoje** (`/v1/*`, JWKS, descoberta OIDC, webhook,
documentação atrás de credencial, arquivos de associação), **mais** o site de
homologação no que hoje é 404: `/t/*`, `/verificar-email`, `/redefinir-senha` e
o resto das rotas do site, porque os links que a homologação emite passam a
apontar para lá. Nada do que o app usa muda de caminho. O `web-hml` responde com
`X-Robots-Tag: noindex` em tudo.

## Plano de execução

O DevOps executa. Cada passo tem uma verificação, e **passo cuja verificação não
passa não libera o seguinte.** Nenhum valor de segredo aparece em tela, em log ou
em histórico de shell: gerar em variável, gravar direto no cofre e comparar por
SHA-256.

Variáveis usadas abaixo:

```bash
PROJ_PROD=bichu-app-508914
PROJ_HML=<ID informado pelo cliente>      # pré-condição P2
ZONA=southamerica-east1-a
VM=bichu-hml
SA=bichu-vm@bichu-app-508914.iam.gserviceaccount.com
SEGREDOS="DATABASE_URL IP_HMAC_KEY TAG_CODE_KEY TAG_CODE_INDEX_KEY JWT_ACTIVE_PRIVATE_KEY JWT_NEXT_PRIVATE_KEY OBJECT_STORAGE_ACCESS_KEY_ID OBJECT_STORAGE_SECRET_ACCESS_KEY"
```

`MAIL_API_TOKEN` e `MAIL_WEBHOOK_SECRET` entram na lista do passo 4 se
existirem no cofre (`gcloud secrets list --project=$PROJ_PROD`).

### Pré-condições (do cliente, antes do passo 1)

- **P1.** Resposta à pergunta 1 (máquina). O plano abaixo é o da opção (a).
- **P2.** Projeto GCP de homologação criado, com a API do Secret Manager ligada,
  e o ID informado.
- **P3.** Resposta à pergunta 2 (QR de homologação impresso).
- **P4.** Dia e hora da janela do passo 7 combinados com o cliente.

### Passo 1: ponto de retorno

Snapshot manual do disco e dump em formato custom do banco `bichu`.

```bash
gcloud compute disks snapshot $VM --zone=$ZONA --project=$PROJ_PROD --snapshot-names=pre-separacao-$(date +%Y%m%d)
docker compose exec -T db pg_dump -U bichu -Fc bichu | gcloud storage cp - gs://bichu-backup-hml/pre-separacao-$(date +%Y%m%d).dump
```

**Verificação:** o snapshot aparece com `status: READY`; o objeto no bucket tem
tamanho maior que zero; `pg_restore --list` do arquivo baixado lista linhas
`TABLE DATA`.

### Passo 2: máquina

```bash
gcloud compute instances stop $VM --zone=$ZONA --project=$PROJ_PROD
gcloud compute instances set-machine-type $VM --machine-type=e2-medium --zone=$ZONA --project=$PROJ_PROD
gcloud compute instances start $VM --zone=$ZONA --project=$PROJ_PROD
```

**Verificação:** `describe --format='value(machineType)'` termina em `e2-medium`;
`free -m` na VM mostra perto de 3900 MB de total; `curl -s -o /dev/null -w
'%{http_code}' https://hml.bichu.app/v1/health` responde `200`; `docker stats
--no-stream` mostra os tetos de cada container. O teto do alerta de orçamento
(hoje 200 BRL) é conferido contra o custo novo e, se não couber, vira pergunta
ao cliente **antes** do passo 3.

### Passo 3: Ops Agent e alertas

Instalar o Ops Agent na VM e criar as duas políticas da seção 3 a partir de
`infra/monitoramento/alerta-memoria.json`.

**Verificação:** `systemctl is-active google-cloud-ops-agent` responde
`active`; a métrica `agent.googleapis.com/memory/percent_used` tem pontos nos
últimos 10 minutos; `gcloud monitoring policies list` mostra as duas políticas
habilitadas; a cópia temporária com limiar de 1% entrega o e-mail em até 10
minutos e é apagada em seguida.

### Passo 4: cofre de homologação, copiando os valores de hoje

Para cada nome em `$SEGREDOS`, criar o segredo em `$PROJ_HML` (replicação em
`southamerica-east1`) com o valor `latest` de `$PROJ_PROD`, por pipe, sem
passar por arquivo. Conceder `roles/secretmanager.secretAccessor` à `$SA` **por
segredo**, nunca no projeto.

**Verificação:** para cada nome, `gcloud secrets versions access latest` nos dois
projetos, cada um passado por `sha256sum`, dá **igual** (nesta etapa é cópia). O
script imprime só o nome e `igual` ou `DIFERENTE`. `gcloud secrets
get-iam-policy` de cada segredo em `$PROJ_HML` mostra a `$SA` e mais ninguém.

### Passo 5: roles e bancos

Como superusuário, no container `db`:

```sql
CREATE ROLE bichu_hml  LOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE;
CREATE ROLE bichu_prod LOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE;
CREATE DATABASE bichu_hml  OWNER bichu_hml;
CREATE DATABASE bichu_prod OWNER bichu_prod;
REVOKE CONNECT ON DATABASE bichu, bichu_hml, bichu_prod FROM PUBLIC;
\c bichu_hml
CREATE EXTENSION postgis; CREATE EXTENSION citext;
\c bichu_prod
CREATE EXTENSION postgis; CREATE EXTENSION citext;
```

A senha de `bichu_hml` é gerada com `openssl rand -base64 32`, aplicada com
`ALTER ROLE ... PASSWORD` a partir da variável de shell e gravada como nova
versão de `DATABASE_URL` em `$PROJ_HML`, que ninguém lê ainda. **`bichu_prod`
fica sem senha até o passo 9.** Motivo: a API de hoje lê `latest` de
`$PROJ_PROD`, e uma versão nova ali antes do passo 8 faria qualquer reinício
dela conectar no banco vazio de produção.

**Verificação:** `\l` mostra `bichu_hml` e `bichu_prod` com as donas certas;
conectar como `bichu_hml` em `bichu_prod` **falha** com `permission denied for
database`, e o contrário também; `\dx` em cada banco novo lista `postgis` e
`citext`.

### Passo 6: MinIO

1. Separar no compose a raiz do MinIO da credencial da aplicação: variáveis
   próprias `MINIO_ROOT_USER` e `MINIO_ROOT_PASSWORD`, com o valor da raiz de
   hoje, para que o `objeto` continue subindo igual.
2. Criar `bichu-prod-media-private` e `bichu-prod-media-public`, com a mesma
   política anônima de leitura que o `objeto_init` aplica ao bucket público de
   hoje.
3. Criar o usuário `bichu-hml` (leitura e escrita só em `bichu-media-private`
   e `bichu-media-public`). As chaves vão como nova versão de
   `OBJECT_STORAGE_ACCESS_KEY_ID` e `OBJECT_STORAGE_SECRET_ACCESS_KEY` em
   `$PROJ_HML`. O usuário `bichu-prod` só nasce no passo 9, pelo mesmo motivo
   da senha de `bichu_prod`.

**Verificação:** com as credenciais de `bichu-hml`, `mc ls` em
`bichu-prod-media-private` responde `Access Denied`;
`curl -I` numa foto existente em `https://img-hml.bichu.app/bichu-media-public/...`
continua `200`.

### Passo 7: janela de homologação (~15 minutos, combinada em P4)

1. Parar `api` e `worker` (os de hoje).
2. `pg_dump -Fc bichu` e `pg_restore --no-owner --role=bichu_hml -d bichu_hml`.

**Verificação:**

- os únicos erros do `pg_restore` são de `COMMENT ON EXTENSION`; qualquer outro
  aborta a janela e aplica a ordem inversa (religar `api` e `worker` de hoje,
  que continuam apontando para o banco `bichu` e o cofre de `$PROJ_PROD`);
- contagem de linhas por tabela de `public` idêntica entre `bichu` e
  `bichu_hml` (script que conta nos dois e faz `diff`; a saída tem que vir
  vazia);
- nenhuma relação de `public` em `bichu_hml` com dono diferente de `bichu_hml`,
  descontando as que pertencem a extensão (`pg_depend.deptype = 'e'`);
- `select count(*) from pgmigrations` igual nos dois (29 em `38371aa`).

### Passo 8: homologação religada, com a identidade nova

Subir `migracao-hml`, `api-hml` e `worker-hml` com `SECRET_STORE_PROJECT=$PROJ_HML`,
`ENVIRONMENT=homolog`, `PUBLIC_BASE_URL`, `TAG_BASE_URL` e `WEB_BASE_URL` iguais a
`https://hml.bichu.app`, `MEDIA_PUBLIC_BASE_URL=https://img-hml.bichu.app`,
`TOKEN_ISSUER` com o valor atual, buckets de hoje. O bloco de `hml.bichu.app` na
borda passa a apontar para `api-hml`.

**Verificação:**

- `curl https://hml.bichu.app/v1/health` responde `200`;
- `docker compose exec -T api-hml printenv SECRET_STORE_PROJECT TAG_BASE_URL MEDIA_PUBLIC_BASE_URL`
  imprime `$PROJ_HML`, `https://hml.bichu.app` e `https://img-hml.bichu.app`;
- `pg_stat_activity` mostra conexões de `bichu_hml` só em `bichu_hml`, e
  **nenhuma** em `bichu`;
- `make reset` continua recusando;
- o cliente abre o app **sem reinstalar**, continua logado e vê os pets e as
  fotos de antes. Isso fecha a janela.

### Passo 9: cofre de produção com valores novos

Em `$PROJ_PROD`, gravar versão nova de **todos** os nomes de `$SEGREDOS`, com
valores gerados agora: `IP_HMAC_KEY` com `openssl rand -base64 32`;
`TAG_CODE_KEY` e `TAG_CODE_INDEX_KEY` com `openssl rand -hex 32`, **diferentes
entre si**; dois pares RS256 novos para `JWT_ACTIVE_PRIVATE_KEY` e
`JWT_NEXT_PRIVATE_KEY`, com `JWT_ACTIVE_KID` e `JWT_NEXT_KID` novos na
configuração de produção. Agora, e não antes: gerar a senha de `bichu_prod`
(`ALTER ROLE bichu_prod PASSWORD ...`) e gravar `DATABASE_URL` de produção;
criar o usuário `bichu-prod` do MinIO (só nos dois `bichu-prod-*`) e gravar as
duas de objeto. Depois, **desabilitar todas as versões anteriores** em
`$PROJ_PROD`, que são os valores de homologação.

**Verificação:** com as credenciais de `bichu-prod`, `mc ls` em
`bichu-media-private` responde `Access Denied`. Para cada nome, o SHA-256 de
`latest` em `$PROJ_PROD` é **diferente** do de `$PROJ_HML`. Qualquer `igual` reprova o passo.
`gcloud secrets versions list` de cada nome em `$PROJ_PROD` mostra uma única
versão `enabled`. E homologação continua de pé
(`https://hml.bichu.app/v1/health` em `200`), o que prova que ela não lê mais
`$PROJ_PROD`.

### Passo 10: produção sobe, ainda sem rota pública

Subir `migracao-prod`, `api-prod` e `worker-prod` na `rede-prod`, com
`ENVIRONMENT=prod`, `SECRET_STORE_PROJECT=$PROJ_PROD`,
`PUBLIC_BASE_URL=https://api.bichu.app`, `TOKEN_ISSUER=https://api.bichu.app`,
`TAG_BASE_URL=https://tag.bichu.app`, `WEB_BASE_URL=https://bichu.app`,
`MEDIA_PUBLIC_BASE_URL=https://img.bichu.app`, buckets `bichu-prod-*`,
`MAIL_TRANSPORT=log`, `PUSH_TRANSPORT=log`.

**Verificação:** `select count(*) from pgmigrations` em `bichu_prod` igual ao
número de arquivos em `migrations/`; `docker compose exec -T api-prod printenv
TAG_BASE_URL SECRET_STORE_PROJECT` imprime `https://tag.bichu.app` e
`bichu-app-508914`; log de subida sem erro; de dentro da `rede-prod`, `GET
http://api-prod:3000/v1/health` em `200`; de dentro de um container da
`rede-hml`, `api-prod` **não resolve**.

### Passo 11: os dois sites

Quando a imagem do site existir (ADR-0024): `web-prod` com
`API_INTERNAL_URL=http://api-prod:3000`, `SITE_BASE_URL=https://bichu.app`,
indexável; `web-hml` com `API_INTERNAL_URL=http://api-hml:3000`,
`SITE_BASE_URL=https://hml.bichu.app`, `noindex` em tudo.

**Verificação:** `/healthz` em `200` nos dois; `curl -sI` de qualquer página de
`web-hml` traz `X-Robots-Tag: noindex`.

Até o site existir, os passos 12 a 16 rodam sem ele: nos blocos da borda, onde a
tabela manda para `web-*`, fica o 404 de hoje.

### Passo 12: borda, e depois DNS

Configuração primeiro, DNS depois (certificado por HTTP-01, `.app` em HSTS):

1. Blocos novos no Caddyfile conforme o ADR-0024 item 5, com `api-prod` e
   `web-prod` onde lá diz `api` e `web`; `api.bichu.app` num bloco da API de
   produção; `hml.bichu.app` com `api-hml`, arquivos de associação e `web-hml`
   no catch-all; `img.bichu.app` num bloco próprio roteando **só**
   `/bichu-prod-media-public/*`, e `img-hml.bichu.app` roteando **só**
   `/bichu-media-public/*`, com `X-Robots-Tag: noindex` nos dois (ADR-0024).
2. Recarregar o Caddy.
3. Criar os registros A de `api.bichu.app` e `www.bichu.app` para o IP da VM,
   guardando antes e comparando depois os registros `MX`, `TXT` e `DKIM`
   (roteiro, passo 9).

**Verificação:**

- `hml.bichu.app/v1/health` em `200`, e o cliente ainda logado no app;
- os `kid` de `https://api.bichu.app/.well-known/jwks.json` e de
  `https://hml.bichu.app/.well-known/jwks.json` são **disjuntos**. É a prova, de
  fora, de que os dois hosts respondem por ambientes diferentes;
- `https://bichu.app/v1/health` em `200`, e os `kid` do JWKS de produção são os
  mesmos por `api.bichu.app`;
- `https://bichu.app/v1/docs` em `404`, sem pedir credencial;
- um objeto de teste gravado em `bichu-prod-media-public` responde `200` por
  `img.bichu.app` e `404` por `img-hml.bichu.app`, e o contrário para um objeto
  de homologação; o objeto de teste é apagado em seguida;
- os quatro alvos de `infra/verificacao/associacao.yml` em `200`;
- `https://www.bichu.app/qualquer` responde `308` para
  `https://bichu.app/qualquer`.

### Passo 13: backup separado

Criar `gs://bichu-backup-prod` em `$PROJ_PROD` (`southamerica-east1`, acesso
uniforme, ciclo de vida de 30 dias, `$SA` só com `objectCreator`). Trocar a
tarefa diária por duas: `bichu_hml` para `gs://bichu-backup-hml` e `bichu_prod`
para `gs://bichu-backup-prod`.

**Verificação:** no dia seguinte, um objeto novo e maior que zero em cada
bucket; ensaio de restauração do dump de produção num banco
`ensaio_restauracao`, com contagem de `pgmigrations` igual à de `bichu_prod`, e o
banco de ensaio apagado em seguida; a conferência externa do backup, que já
existe para homologação, passa a olhar os dois buckets.

### Passo 14: a verificação permanente

Um script em `infra/verificacao/` que lê a configuração não secreta dos dois
ambientes e **reprova** se `TAG_BASE_URL` (host), `TOKEN_ISSUER`,
`SECRET_STORE_PROJECT`, `OBJECT_BUCKET_PRIVATE` ou `OBJECT_BUCKET_PUBLIC`
forem iguais entre eles. O job agendado externo acrescenta a comparação dos
`kid` dos dois JWKS. Isca no repositório: uma configuração com o mesmo
`TAG_BASE_URL` nos dois ambientes **precisa reprovar**, e a esteira exige essa
reprovação.

**Verificação:** o script aprova a configuração real e reprova a isca, com o
nome da variável na mensagem.

### Passo 15: raiz do MinIO fora da aplicação

Girar a senha da raiz do MinIO e guardá-la como segredo de operação em
`$PROJ_PROD` (`MINIO_ROOT_PASSWORD`, fora da lista de runtime, como o token da
Cloudflare).

**Verificação:** o SHA-256 da raiz é diferente do das duas
`OBJECT_STORAGE_SECRET_ACCESS_KEY`; as duas aplicações continuam gravando foto
(envio de teste em homologação pelo app do cliente).

### Passo 16: o banco antigo

`ALTER DATABASE bichu ALLOW_CONNECTIONS false`, e ele fica por 7 dias como ponto
de retorno. **Apagar exige o ok do cliente**, porque é destrutivo.

**Verificação:** conectar em `bichu` falha; homologação e produção de pé.

### Ordem inversa (se um passo falhar)

- Até o passo 8: religar `api` e `worker` antigos com o cofre de
  `$PROJ_PROD` e o banco `bichu`, ambos intactos até ali.
- Depois do 8 e antes do 12: produção não tem tráfego; derrubar os `*-prod`
  não afeta ninguém.
- Depois do 12: voltar o Caddyfile anterior e recarregar. O DNS novo (`api`,
  `www`) pode ficar, porque sem bloco ele não serve nada.

## Alternativas consideradas

| Opção | Prós | Contras | Por que não |
|---|---|---|---|
| Instância Postgres separada por ambiente | isolamento de CPU, memória e superusuário | +640 MB de teto; duas cópias de PostGIS para atualizar | a separação que o cliente pediu (dado, credencial, backup) se obtém dentro de uma instância |
| Renomear `bichu` para `bichu_hml` e trocar dono objeto a objeto | sem cópia | `REASSIGN OWNED` do superusuário de inicialização é recusado; troca manual erra fácil; não deixa ponto de retorno | a cópia é mais curta e reversível |
| Prefixo de ambiente no nome do segredo (`hml-IP_HMAC_KEY`) | um projeto só | reabre o ADR-0022 (tabela de tradução) e cega a guarda da esteira | o projeto separado já é a forma decidida |
| Segredos de homologação em `.env` no disco | nenhum projeto novo | a imagem de produção (`NODE_ENV=production`) exige o cofre; e o `.env` voltaria ao snapshot | contraria o ADR-0022 e o código |
| `TAG_BASE_URL` de homologação em `tag-hml.bichu.app` | espelha produção | DNS e certificado novos, sem ganho | `hml.bichu.app` já existe e não é impresso |
| Produção herda o dado de hoje, e homologação nasce vazia | prod "com conteúdo" | dado de teste em produção, pública e indexada; o cliente perde a massa de teste | é exatamente o que a separação existe para evitar |

## Consequências

**Fica mais fácil:** um engano de configuração num ambiente não alcança o outro;
produção nasce sem dado de teste e com chaves que nunca estiveram em
homologação; o site pode ser testado em `hml.bichu.app` antes de ir para
`bichu.app`.

**Fica mais difícil:** dois de cada coisa para manter (cofre, backup, variáveis
de ambiente), e a máquina custa mais (pergunta 1).

**Irreversível:** nada. O banco antigo só some com o ok do cliente, e o host da
plaquinha de produção continua o de antes.

**Dívida aceita, com gatilho:**

1. mesma conta de serviço para os dois ambientes (seção 5). Gatilho: o primeiro
   usuário real, ou a segunda VM, o que vier antes;
2. um Postgres para os dois (seção 4). Gatilho: o do ADR-0013, primeiro cadastro
   real;
3. fotos de produção só no disco da VM (seção 9). Gatilho: o primeiro tutor real
   com foto.

## Perguntas ao cliente

**1. Os dois ambientes não cabem na e2-small: 2752 MB de teto para 2048 MB de
máquina. Como faz caber?**
(a) e2-medium (4 GB), na mesma VM: reinício de minutos, cerca do dobro do preço
da máquina. (b) Uma segunda e2-small só para homologação: preço parecido com
(a), e separa também a conta de serviço e o banco; contraria "tudo na mesma VM".
(c) Fica na e2-small e homologação só liga quando você for testar: sem custo
novo, mas com homologação ligada a soma passa da memória, e, se faltar memória,
quem o sistema derruba é o banco de produção.
**Recomendo (a).**

**2. Alguma plaquinha foi impressa com QR gerado até hoje?**
(a) Não: o corte segue. (b) Sim: essas plaquinhas apontam para `tag.bichu.app`
e vão responder "não encontrado" em produção depois do corte. Precisam ser
refeitas a partir de produção, depois que o site subir.
**Não há recomendação**: é uma pergunta de fato.

**3. Criar o projeto GCP de homologação?**
(a) Sim, só com cofre de segredos e, depois, com o app Firebase de homologação:
custo próximo de zero. (b) Não. Nesse caso a separação dos segredos exige
mudança de código e reabre o ADR-0022.
**Recomendo (a).** É ele que o passo 4 usa, e o ID dele é a pré-condição P2.
