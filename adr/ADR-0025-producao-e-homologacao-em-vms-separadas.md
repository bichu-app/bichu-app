# ADR-0025: Produção e homologação em VMs separadas, antes de o site subir

**Status:** aceito. Duas perguntas ao cliente no fim; a primeira é pré-condição
do passo 3 do plano
**Data:** 2026-09-23
**Depende de:** ADR-0013 (a VM e os tetos de memória), ADR-0022 (segredos),
ADR-0017 emenda 1 e ADR-0004 (o host impresso), ADR-0024 (o site e os hosts)
**Revisa:** ADR-0024, item 5 (a tabela de hosts passa a ter duas máquinas)

> A primeira versão deste ADR, publicada na mesma branch em 23/09, punha os dois
> ambientes na mesma VM. O cliente trocou a premissa no mesmo dia, e esta versão
> a substitui por inteiro.

## Contexto

O cliente decidiu em 23/09, em três rodadas:

1. **produção e homologação separadas antes de o site subir**;
2. **uma e2-small para cada ambiente, em VMs separadas.** Dentro de cada
   ambiente continua valendo a decisão anterior: site e API na mesma máquina,
   em imagens Docker separadas (ADR-0024);
3. **nenhuma plaquinha foi impressa.** Todo o dado de hoje vira homologação, e
   produção começa vazia;
4. alerta de memória em 70% sustentado.

O ponto de partida, conferido no repositório e de fora:

- **uma** VM, `bichu-hml` (`bichu-app-508914`, `southamerica-east1-a`, e2-small,
  30 GB `pd-balanced`, IP estático `bichu-ip`, conta de serviço `bichu-vm`);
- nela, **uma** pilha: `db` (Postgres com PostGIS, banco `bichu`, e a aplicação
  entra como `bichu`, o **superusuário** do container), `objeto` (MinIO, buckets
  `bichu-media-private` e `bichu-media-public`, com a raiz igual à credencial da
  aplicação), `api`, `worker`, `edge`;
- `hml.bichu.app`, `bichu.app`, `tag.bichu.app`, `img.bichu.app` e
  `img-hml.bichu.app` resolvem todos para essa VM;
- os segredos de runtime vêm do Secret Manager de `bichu-app-508914`, com
  **valores de homologação**. O nome do segredo é o nome da variável, sem
  prefixo, e o que separa ambientes é o **projeto** em `SECRET_STORE_PROJECT`
  (ADR-0022 e `src/shared/config/segredos.ts`);
- o app no aparelho do cliente foi compilado com
  `API_BASE_URL=https://hml.bichu.app`.

## Decisão

### 1. A `bichu-hml` de hoje continua sendo homologação. Produção nasce numa VM nova

**Decidido:** `bichu-hml` fica como está, e vira homologação de direito além de
nome. Produção nasce em `bichu-prod`, máquina nova, com IP novo.

O motivo é o que cada máquina carrega:

- **a `bichu-hml` tem o dado de teste, o IP para onde `hml.bichu.app` aponta e o
  aparelho do cliente pendurado nela.** Promovê-la a produção obrigaria a mover
  o dado de teste para uma máquina nova, trocar o DNS do host que o cliente usa
  e interromper o teste dele, só para depois **apagar** o dado de teste da
  máquina promovida, porque produção começa vazia;
- **produção começa vazia**, então nascer numa máquina nova não custa migração
  nenhuma. E ela nasce limpa: disco sem histórico, snapshots sem dado de teste,
  sem `.env` antigo em lugar nenhum, nome certo;
- o único custo de produção nascer nova é mover o DNS de `bichu.app`,
  `tag.bichu.app` e `img.bichu.app`. Hoje esses três servem 404 e os dois
  arquivos de associação, sem app publicado que dependa deles.

### 2. Memória por VM, com a e2-small de 2 GB

A conta de 2112 MB **soma todo `mem_limit` do `compose.yaml` fora o de
`ferramentas`**, e isso não é o que roda na VM. Conferido em `38371aa`, serviço
por serviço:

| Serviço | Teto | Roda na VM? |
|---|---|---|
| `db` | 640 | sim, sempre |
| `objeto` | 320 | sim, sempre |
| `api` | 320 | sim, sempre |
| `worker` | 448 | sim, sempre |
| `edge` | 64 | sim, sempre |
| `migracao` | 256 | **só na subida**, e termina antes de `api` e `worker` começarem (`depends_on: service_completed_successfully`) |
| `mail` | 64 | **não**: `profiles: [dev, qa]` |
| `objeto_init` | **sem teto** | só na subida, segundos. É lacuna: ganha `mem_limit: 32m` |
| `ferramentas` | 1024 | **não**: perfil próprio, só sob comando |

**Regime normal, por VM:** 640 + 320 + 320 + 448 + 64 = **1792 MB**, que é o
número do cabeçalho do `compose.yaml`. **Com o site, +96 = 1888 MB.** Cabe nos
2048, com **160 MB** para o sistema.

**O pico que a soma de 2112 também não mostra, e é o que morde:** num
redeploy, `docker compose up -d` roda `migracao` **enquanto `api` e `worker`
antigos ainda estão de pé**, e só depois os recria. Com o site, isso dá 1888 +
256 = **2144 MB**, acima da máquina. A regra de implantação passa a ser:
**parar o `worker` antes de migrar.** O pico cai para 1888 − 448 + 256 = **1696
MB**. O `worker` parado por um minuto não perde nada, porque o trabalho está na
tabela `jobs` e ele o retoma ao voltar. Isso vale igual nas duas VMs.

**Os 160 MB para o sistema são pouco, e é bom estar escrito:** eles cobrem o
núcleo, o `dockerd`, o `containerd`, o `sshd` e o Ops Agent (que o alerta
exige). Os tetos são limites e não consumo; o consumo real vai ser medido pelo
próprio alerta. Duas coisas passam a ser obrigatórias em cada VM, e não
recomendação: **swap de 2 GB** (a mitigação que o ADR-0013 já pedia) e o alerta
da seção 11. Se ele disparar, o gatilho do ADR-0013 decide.

### 3. Um banco por VM, e a aplicação deixa de entrar como superusuário

Cada VM tem o seu Postgres. **Os nomes são os mesmos nas duas** (banco `bichu`,
role `bichu_app`), porque máquinas diferentes não colidem, e configuração
idêntica é paridade: o que funciona em homologação funciona em produção pelo
mesmo motivo.

- `bichu_app` é **dona do banco `bichu` e não é superusuária.** O superusuário
  do container fica para operação e para criar extensão;
- `postgis` e `citext` são criados pelo superusuário **antes** da primeira
  migração. A migração `20260917000001` usa `CREATE EXTENSION IF NOT EXISTS`, que
  vira nada quando a extensão já existe, e por isso a role sem superusuário
  consegue migrar;
- **homologação passa pela mesma mudança, na janela do passo 4**, por
  `pg_dump`/`pg_restore --no-owner --role=bichu_app` num banco novo, que depois
  troca de nome com o antigo. Três razões: é em homologação que a role sem
  superusuário precisa ser testada antes de produção; os objetos de hoje
  pertencem ao superusuário de inicialização, cujo `REASSIGN OWNED` o Postgres
  recusa; e o banco antigo fica intacto como ponto de retorno.

O gatilho do ADR-0013 para banco gerenciado continua valendo, e passa a
disparar em produção: **o primeiro cadastro que não seja de teste.**

### 4. Buckets

Cada VM tem o seu MinIO, **com os mesmos nomes de bucket nas duas**
(`bichu-media-private`, `bichu-media-public`), pelo mesmo motivo de paridade. Em
cada uma, a aplicação passa a usar um usuário `bichu-app`, com política só nos
dois buckets, e a raiz do MinIO sai da configuração da aplicação (variáveis
próprias `MINIO_ROOT_USER` e `MINIO_ROOT_PASSWORD`).

`img-hml.bichu.app` continua na VM de homologação, e `img.bichu.app` passa para
a de produção. Cada bloco de mídia roteia só o bucket público da sua máquina e
responde `X-Robots-Tag: noindex` (ADR-0024 item 11).

### 5. Segredos e conta de serviço por VM

| | Homologação (`bichu-hml`) | Produção (`bichu-prod`) |
|---|---|---|
| Conta de serviço da VM | `bichu-vm` (a de hoje) | **`bichu-prod-vm`, nova** |
| `SECRET_STORE_PROJECT` | **projeto GCP de homologação** (pergunta 1) | `bichu-app-508914` |
| Valores | os de hoje, **copiados** (a sessão do cliente sobrevive) | **todos gerados de novo** |
| Acesso | `secretAccessor` para `bichu-vm`, **por segredo**, só no projeto de homologação | `secretAccessor` para `bichu-prod-vm`, por segredo. **`bichu-vm` perde toda permissão** nos segredos de `bichu-app-508914` |

Segredos separados, todos: `DATABASE_URL`, `IP_HMAC_KEY`, `TAG_CODE_KEY`,
`TAG_CODE_INDEX_KEY`, `JWT_ACTIVE_PRIVATE_KEY`, `JWT_NEXT_PRIVATE_KEY`,
`OBJECT_STORAGE_ACCESS_KEY_ID`, `OBJECT_STORAGE_SECRET_ACCESS_KEY`, e
`MAIL_API_TOKEN` e `MAIL_WEBHOOK_SECRET` quando o adaptador do Postmark existir.
Os `kid` de produção são novos. Um token de um ambiente é recusado no outro por
emissor, por `kid` e por assinatura; um código de tag não resolve no outro,
porque o índice cego é diferente.

**O projeto de homologação continua necessário com VMs separadas?** Sim, e por
um motivo que não tem a ver com isolamento: o nome do segredo é o nome da
variável, então **`DATABASE_URL` de homologação e `DATABASE_URL` de produção não
cabem no mesmo projeto.** A alternativa é mudar o código para prefixar o nome
por ambiente, o que reabre o ADR-0022 e a guarda que ele protege. Um projeto
só com o cofre custa perto de zero. Pergunta 1.

**Isto resolve o "limite honesto" da versão anterior?** **Resolve o que eu tinha
nomeado**, e sobra um resíduo menor, que fica escrito:

- **resolvido:** um container de homologação comprometido pede ao servidor de
  metadados o token **da sua VM**, que é `bichu-vm`, e essa conta não tem
  permissão em nenhum segredo de produção nem no bucket de backup de produção.
  Banco e objetos de produção estão em outra máquina, sem porta publicada: não
  há caminho de rede até eles;
- **resíduo:** as duas VMs continuam no mesmo projeto `bichu-app-508914`. Um erro
  de IAM **no nível do projeto** (um papel largo dado a uma conta) vale para as
  duas máquinas. As duas contas escrevem log e métrica no mesmo projeto, e a
  separação ali é pelo rótulo da instância. E quem opera o projeto vê os dois
  ambientes. A regra que segura isso: **toda permissão de segredo e de bucket é
  por recurso, nunca no projeto**, e o passo 13 do plano a verifica.

### 6. O QR: os dois ambientes nunca emitem o mesmo host

- **Produção:** `TAG_BASE_URL=https://tag.bichu.app`, o host da plaquinha,
  irreversível depois de impresso (ADR-0004, emenda 1).
- **Homologação:** `TAG_BASE_URL=https://hml.bichu.app`. O QR de teste abre
  `https://hml.bichu.app/t/{código}`, servido pelo site de homologação. Mesmo
  domínio registrável, então a guarda de `app-config.ts` aceita. Não precisa de
  DNS nem de certificado novo.

**Nenhuma plaquinha foi impressa** (resposta do cliente), então o corte não mata
plástico. Os códigos de teste existentes passam a gerar QR com `hml.bichu.app`,
porque o QR é montado a partir do código cifrado com a base do momento.

`hml.bichu.app` não é host declarado no app (emenda 1). O QR de homologação abre
o navegador, e não o app, a menos que um build de homologação declare esse host.

O passo 12 do plano escreve uma verificação permanente que reprova se os dois
ambientes tiverem o mesmo host em `TAG_BASE_URL`, o mesmo `TOKEN_ISSUER` ou o
mesmo `SECRET_STORE_PROJECT`.

### 7. Configuração de cada ambiente

| Variável | Homologação | Produção |
|---|---|---|
| `ENVIRONMENT` | `homolog` (o de hoje; é ele que faz `make reset` recusar) | `prod` |
| `PUBLIC_BASE_URL` | `https://hml.bichu.app` | `https://api.bichu.app` |
| `TOKEN_ISSUER` | **o valor atual, sem mudar**, conferido com `printenv` antes do passo 4 | `https://api.bichu.app` |
| `TAG_BASE_URL` | `https://hml.bichu.app` | `https://tag.bichu.app` |
| `WEB_BASE_URL` | `https://hml.bichu.app` | `https://bichu.app` |
| `MEDIA_PUBLIC_BASE_URL` | `https://img-hml.bichu.app` | `https://img.bichu.app` |
| `API_BASE_URL` do build do app | `https://hml.bichu.app` (o de hoje) | `https://api.bichu.app` |
| `SECRET_STORE_PROJECT` | projeto de homologação | `bichu-app-508914` |
| `MAIL_TRANSPORT` | `log` até o adaptador existir; depois, o *Server* Postmark de homologação, com o token que já está no cofre | `log` até o adaptador existir; depois, *Server* Postmark de produção, token novo |
| webhook do Postmark | `https://hml.bichu.app/webhooks/postmark` | `https://api.bichu.app/webhooks/postmark` |
| `PUSH_TRANSPORT` | `log` até existir o app de homologação (`app.bichu.hml`) registrado no projeto de homologação | `fcm` quando o ADR-0008 fechar, com `FCM_PROJECT=bichu-app-508914`; o papel `bichu.pushSender` passa para `bichu-prod-vm` |
| `SENTRY_DSN` | DSN do projeto Sentry de homologação | DSN do projeto Sentry de produção |

### 8. Hosts e DNS

| Host | Aponta para | Muda? |
|---|---|---|
| `hml.bichu.app` | IP de `bichu-hml` | **não** |
| `img-hml.bichu.app` | IP de `bichu-hml` | não |
| `bichu.app` | IP de `bichu-prod` | **sim**, sai de `bichu-hml` |
| `tag.bichu.app` | IP de `bichu-prod` | **sim** |
| `img.bichu.app` | IP de `bichu-prod` | **sim** |
| `api.bichu.app` | IP de `bichu-prod` | **novo** |
| `www.bichu.app` | IP de `bichu-prod` | **novo** |
| `MX`, `TXT` (SPF, DMARC), DKIM | Google Workspace e Postmark | **não podem mudar** |

A borda de produção é a tabela do ADR-0024 item 5, com `api` e `web` da VM de
produção. A de homologação: `hml.bichu.app` com a API de homologação, os
arquivos de associação e o site de homologação no que hoje é 404 (os links que
homologação emite passam a apontar para lá), com `noindex` em tudo;
`img-hml.bichu.app` como hoje. Os nomes que saem de `bichu-hml` saem também de
`HOSTS_EXTRA_APP` e `HOSTS_EXTRA_MIDIA` dela, **depois** do DNS, para que o Caddy
de lá não fique tentando renovar certificado de nome que não é mais dele.

### 9. O aparelho do cliente e a janela

O app instalado aponta para `https://hml.bichu.app` e continua apontando, para a
mesma máquina. Depois do corte, o dado é o mesmo (copiado dentro da própria VM),
as chaves JWT são as mesmas (copiadas para o cofre de homologação) e o
`TOKEN_ISSUER` é o mesmo. **A sessão dele sobrevive e ele não reinstala nada.**

**Há uma janela só, e ela é do passo 4:** cerca de 20 minutos com a API de
homologação parada, para copiar o banco, trocar a credencial do MinIO e religar
lendo o cofre novo. O cliente escolhe dia e hora antes; ao fim, ele abre o app e
confirma que está logado e vê os pets e as fotos. **O resto do corte não o
afeta:** produção sobe em outra máquina, e os nomes que mudam de DNS não são os
que ele usa.

### 10. Backup

| | Homologação | Produção |
|---|---|---|
| Snapshot do disco | diário, 7 dias (o de hoje) | diário, **14 dias**, política própria |
| `pg_dump` diário | para `gs://bichu-backup-hml`, 14 dias (o de hoje), `bichu-vm` só com `objectCreator` | para `gs://bichu-backup-prod`, **30 dias**, `bichu-prod-vm` só com `objectCreator`. `bichu-vm` **sem** acesso |
| Ensaio de restauração | — | antes de o site subir, e depois todo mês |

**Lacuna aceita:** as fotos de produção só existem no disco da VM de produção e
nos snapshots dele. Gatilho para espelhar o bucket privado fora da máquina: o
primeiro tutor real com foto.

### 11. Alerta de memória, por VM

- **Onde mora:** política de alerta no Cloud Monitoring de `bichu-app-508914`,
  **uma por VM** (filtro pelo nome da instância), com a definição versionada em
  `infra/monitoramento/alerta-memoria.json` e aplicada por
  `gcloud monitoring policies create --policy-from-file`. A métrica é
  `agent.googleapis.com/memory/percent_used` (estado `used`), que exige o **Ops
  Agent** em cada VM; sem ele a memória do convidado não chega ao Monitoring, e o
  alerta nunca dispara, sem erro nenhum.
- **"Sustentado" em número:** média acima de **70% por 15 minutos**. Segunda
  condição, de urgência: acima de **90% por 5 minutos**.
- **Canal:** e-mail `oi@bichu.app`, a menos que o cliente indique outro.
- **Gatilho de decisão, que não é o alerta:** o alerta de 70% disparando em **3
  dias distintos dentro de 7**, ou aberto por **mais de 1 hora**, reabre ao
  cliente a pergunta da máquina daquela VM (ADR-0013: "a máquina apertar").
- **Prova de que funciona:** uma cópia temporária com limiar de 1% e duração de
  60 s precisa entregar o e-mail; depois é apagada.

O Monitoring não passa pelo portão de serviço gerenciado do ADR-0022: a
aplicação não o lê nem depende dele para subir. É operação, como o alerta de
orçamento.

### 12. Custo mensal

Preços de lista de `southamerica-east1`, conferidos em 23/09 em
gcloud-compute.com (dados de 21/09/2026). O preço do IP e o do snapshot não
estavam na página, e uso o preço de lista publicado pelo Google (IPv4 externo em
uso: US$ 0,005 por hora). Premissa de câmbio: **R$ 5,50 por dólar**.

| Item, por VM | US$/mês |
|---|---|
| e2-small sob demanda | 19,41 |
| disco `pd-balanced` 30 GB (US$ 0,15/GB) | 4,50 |
| IPv4 externo estático em uso (US$ 0,005 × 730 h) | 3,65 |
| snapshots (estimativa: ~10 GB ocupados, incrementais) | ~0,50 a 1,00 |
| **Subtotal por VM** | **~28,10 a 28,60** |

| | US$/mês | R$/mês (a 5,50) |
|---|---|---|
| Uma VM (hoje) | ~28,50 | ~157 |
| **Duas VMs** | **~57** | **~314** |
| Secret Manager, buckets de backup, egresso do MVP | < 2 | < 11 |

**O alerta de orçamento de R$ 200 fica abaixo do custo só das máquinas.**
Hoje ele já está em ~78% com uma VM; com duas, estoura todo mês. Alerta que
dispara todo mês é ignorado, e é o jeito de ele deixar de proteger. Pergunta 2.
Os valores não incluem Maps nem o que mais estiver na mesma conta de
faturamento, e o alerta atual cobre a conta inteira.

## Plano de execução

O DevOps executa. **Passo cuja verificação não passa não libera o seguinte.**
Nenhum valor de segredo aparece em tela, log ou histórico: gerar em variável,
gravar direto no cofre, comparar por SHA-256.

```bash
PROJ=bichu-app-508914
PROJ_HML=<ID informado pelo cliente>        # pergunta 1
ZONA=southamerica-east1-a
SA_HML=bichu-vm@bichu-app-508914.iam.gserviceaccount.com
SA_PROD=bichu-prod-vm@bichu-app-508914.iam.gserviceaccount.com
SEGREDOS="DATABASE_URL IP_HMAC_KEY TAG_CODE_KEY TAG_CODE_INDEX_KEY JWT_ACTIVE_PRIVATE_KEY JWT_NEXT_PRIVATE_KEY OBJECT_STORAGE_ACCESS_KEY_ID OBJECT_STORAGE_SECRET_ACCESS_KEY"
```

Se `MAIL_API_TOKEN` e `MAIL_WEBHOOK_SECRET` existirem em `$PROJ`
(`gcloud secrets list`), eles entram em `$SEGREDOS`.

### Pré-condições

- **P1.** Pergunta 1 respondida e o ID do projeto de homologação informado.
- **P2.** Pergunta 2 respondida, com o alerta de orçamento ajustado **antes** do
  passo 5, que cria a segunda máquina.
- **P3.** Dia e hora da janela do passo 4 combinados com o cliente.
- **P4.** Mesclado em `development` o que o plano usa do repositório: no
  `compose.yaml`, a raiz do MinIO separada da credencial da aplicação,
  `mem_limit: 32m` em `objeto_init` e o serviço `web`; o Caddyfile por ambiente
  (seção 8); `infra/monitoramento/alerta-memoria.json`; a regra de implantação
  "parar o `worker` antes de migrar" no alvo de implantação.

### Passo 1: ponto de retorno em homologação

Snapshot manual do disco de `bichu-hml` e dump em formato custom do banco
`bichu` para `gs://bichu-backup-hml/pre-separacao-<data>.dump`.

**Verificação:** snapshot com `status: READY`; objeto no bucket com tamanho
maior que zero; `pg_restore --list` do arquivo lista linhas `TABLE DATA`.

### Passo 2: TTL baixo, 24 horas antes do passo 10

TTL de 300 s nos registros A de `bichu.app`, `tag.bichu.app` e `img.bichu.app`.

**Verificação:** `dig @1.1.1.1` e `dig @8.8.8.8` mostram TTL ≤ 300 nos três.

### Passo 3: cofre de homologação, copiando os valores de hoje

Para cada nome em `$SEGREDOS`, criar o segredo em `$PROJ_HML` (replicação em
`southamerica-east1`) com o valor `latest` de `$PROJ`, por pipe, sem arquivo.
`roles/secretmanager.secretAccessor` para `$SA_HML` **por segredo**.

**Verificação:** para cada nome, SHA-256 de `latest` **igual** nos dois projetos
(nesta etapa é cópia); o script imprime só o nome e `igual` ou `DIFERENTE`.
`get-iam-policy` de cada segredo em `$PROJ_HML` mostra `$SA_HML` e mais ninguém.

### Passo 4: a janela de homologação (~20 minutos, combinada em P3)

1. Parar `api` e `worker`.
2. Como superusuário: `CREATE ROLE bichu_app LOGIN NOSUPERUSER NOCREATEDB
   NOCREATEROLE`; `CREATE DATABASE bichu_novo OWNER bichu_app`; em `bichu_novo`,
   `CREATE EXTENSION postgis` e `CREATE EXTENSION citext`.
3. `pg_dump -Fc bichu` e `pg_restore --no-owner --role=bichu_app -d bichu_novo`.
4. `ALTER DATABASE bichu RENAME TO bichu_antigo`; `ALTER DATABASE bichu_novo
   RENAME TO bichu`; `REVOKE CONNECT ON DATABASE bichu, bichu_antigo FROM PUBLIC`;
   `GRANT CONNECT ON DATABASE bichu TO bichu_app`.
5. Senha de `bichu_app` gerada (`openssl rand -base64 32`), aplicada com `ALTER
   ROLE` e gravada como nova versão de `DATABASE_URL` em `$PROJ_HML`.
6. MinIO: usuário `bichu-app` com política só nos dois buckets; as chaves como
   nova versão das duas `OBJECT_STORAGE_*` em `$PROJ_HML`.
7. Religar com `SECRET_STORE_PROJECT=$PROJ_HML` e a configuração de homologação
   da seção 7.

**Verificação:**

- os únicos erros do `pg_restore` são de `COMMENT ON EXTENSION`; qualquer outro
  aborta a janela e aplica a ordem inversa;
- contagem de linhas por tabela de `public` idêntica entre `bichu_antigo` e
  `bichu` (script que conta nos dois e faz `diff`; saída vazia);
- nenhuma relação de `public` em `bichu` com dono diferente de `bichu_app`,
  descontando membros de extensão (`pg_depend.deptype = 'e'`);
- `select count(*) from pgmigrations` igual nos dois;
- `curl https://hml.bichu.app/v1/health` em `200`;
- `docker compose exec -T api printenv SECRET_STORE_PROJECT TAG_BASE_URL WEB_BASE_URL`
  imprime `$PROJ_HML`, `https://hml.bichu.app`, `https://hml.bichu.app`;
- `pg_stat_activity`: conexões só de `bichu_app`, só no banco `bichu`;
- com as credenciais de `bichu-app`, `mc admin info` é **recusado** (não é raiz);
- `make reset` continua recusando;
- **o cliente abre o app sem reinstalar, continua logado e vê os pets e as
  fotos.** Isso fecha a janela.

### Passo 5: homologação deixa de ler o cofre de produção

Remover `$SA_HML` de toda política de IAM dos segredos de `$PROJ`. Reiniciar
`api` e `worker` de homologação.

**Verificação:** `get-iam-policy` de cada segredo de `$PROJ` **não** cita
`$SA_HML`; depois do reinício, `https://hml.bichu.app/v1/health` em `200`, o que
prova que homologação só lê `$PROJ_HML`.

### Passo 6: a máquina de produção

1. Conta de serviço `bichu-prod-vm` com `roles/logging.logWriter` e
   `roles/monitoring.metricWriter`, **e nada mais no projeto** (o roteiro,
   passo 3, vale igual).
2. IP estático `bichu-prod-ip` reservado **antes** da VM.
3. VM `bichu-prod`: e2-small, `$ZONA`, 30 GB `pd-balanced`, `debian-12`, etiqueta
   `bichu-web`, `--address` do IP reservado, `--service-account=$SA_PROD`.
4. Na VM: swap de 2 GB, Docker, Ops Agent.

**Verificação:** `describe` mostra `e2-small`, o IP reservado e `$SA_PROD`;
`swapon --show` lista 2 GB; `systemctl is-active google-cloud-ops-agent` em
`active`; `gcloud projects get-iam-policy $PROJ` mostra `$SA_PROD` só com os dois
papéis.

### Passo 7: cofre de produção com valores novos

Em `$PROJ`, versão nova de **cada** nome de `$SEGREDOS`, gerada agora:
`IP_HMAC_KEY` com `openssl rand -base64 32`; `TAG_CODE_KEY` e
`TAG_CODE_INDEX_KEY` com `openssl rand -hex 32`, **diferentes entre si**; dois
pares RS256 novos para as duas chaves JWT, com `JWT_ACTIVE_KID` e `JWT_NEXT_KID`
novos na configuração de produção; `DATABASE_URL` com a senha de `bichu_app` de
produção, que o passo 8 aplica; as duas `OBJECT_STORAGE_*` do usuário
`bichu-app` de produção, que o passo 8 cria. **Desabilitar todas as versões
anteriores**, que são as de homologação. `secretAccessor` para `$SA_PROD`, por
segredo.

**Verificação:** para cada nome, SHA-256 de `latest` em `$PROJ` **diferente** do
de `$PROJ_HML`; qualquer `igual` reprova. `versions list` mostra uma única versão
`enabled` por nome. A política de cada segredo cita `$SA_PROD` e mais ninguém.

### Passo 8: a pilha de produção

Na `bichu-prod`, pelo roteiro de provisionamento (código copiado e imagem
construída na máquina, como hoje):

1. `db` e `objeto` sobem sozinhos. Como superusuário: `bichu_app` com a senha do
   passo 7, dona de `bichu`, `postgis` e `citext` criados, `REVOKE CONNECT ...
   FROM PUBLIC`. No MinIO, o usuário `bichu-app` com as chaves do passo 7 e os
   dois buckets, com a mesma política anônima de leitura que o `objeto_init`
   aplica ao público.
2. `migracao`, depois `api`, `worker`, `web` e `edge`, com a configuração de
   produção da seção 7. A borda já conhece `bichu.app`, `tag.bichu.app`,
   `img.bichu.app`, `api.bichu.app` e `www.bichu.app` (configuração antes de DNS).

**Verificação:** `pgmigrations` com a mesma contagem dos arquivos de
`migrations/`; `docker compose exec -T api printenv ENVIRONMENT TAG_BASE_URL
SECRET_STORE_PROJECT` imprime `prod`, `https://tag.bichu.app`, `bichu-app-508914`;
de dentro da rede, `GET http://api:3000/v1/health` em `200`; `docker stats
--no-stream` mostra os tetos, e a soma dos containers de pé é 1888 MB; log de
subida sem erro.

### Passo 9: backup e alertas de produção

`gs://bichu-backup-prod` em `$PROJ` (`southamerica-east1`, acesso uniforme,
ciclo de vida de 30 dias, `$SA_PROD` só com `objectCreator`); tarefa diária de
`pg_dump` na `bichu-prod`; política de snapshot diário de 14 dias no disco dela.
As duas políticas de alerta da seção 11 para cada VM.

**Verificação:** um dump manual chega ao bucket com tamanho maior que zero;
**ensaio de restauração** desse dump num banco `ensaio_restauracao`, com
`pgmigrations` igual, e o banco de ensaio apagado; `$SA_HML` **sem** nenhuma
permissão em `gs://bichu-backup-prod`; a cópia temporária do alerta com limiar de
1% entrega o e-mail para cada VM e é apagada.

### Passo 10: DNS

Guardar antes `A`, `AAAA`, `MX`, `TXT`, `NS`, `CAA` de `bichu.app` (roteiro,
passo 9). Trocar o A de `bichu.app`, `tag.bichu.app` e `img.bichu.app` para o IP
de `bichu-prod`; criar o A de `api.bichu.app` e de `www.bichu.app` com o mesmo IP.

**Verificação:**

- `dig @1.1.1.1` e `@8.8.8.8`: os cinco nomes no IP de produção;
  `hml.bichu.app` e `img-hml.bichu.app` no IP de homologação, intocados;
- `diff` dos registros de antes e de depois: só as linhas de `A` diferem;
  `MX` idêntico;
- log da borda de produção com `certificate obtained` para os cinco nomes;
- os `kid` de `https://api.bichu.app/.well-known/jwks.json` e de
  `https://hml.bichu.app/.well-known/jwks.json` são **disjuntos**, que é a prova
  de fora de que cada host responde por um ambiente;
- `https://bichu.app/v1/health` em `200`; `https://bichu.app/v1/docs` em `404`
  sem pedir credencial;
- os quatro alvos de `infra/verificacao/associacao.yml` em `200`;
- `https://www.bichu.app/x` responde `308` para `https://bichu.app/x`;
- o cliente segue logado no app.

### Passo 11: homologação solta os nomes que saíram

Tirar `bichu.app`, `tag.bichu.app` e `img.bichu.app` de `HOSTS_EXTRA_APP` e de
`HOSTS_EXTRA_MIDIA` em `bichu-hml`; recarregar a borda. Voltar o TTL do passo 2
ao valor anterior.

**Verificação:** `hml.bichu.app/v1/health` em `200`; o log da borda de
homologação sem tentativa de certificado para os nomes que saíram, nas 24 horas
seguintes.

### Passo 12: a verificação permanente

Um script em `infra/verificacao/` que lê a configuração **não secreta** dos dois
ambientes, versionada por ambiente no repositório, e **reprova** se `TAG_BASE_URL`
(host), `TOKEN_ISSUER` ou `SECRET_STORE_PROJECT` forem iguais. O job agendado
externo acrescenta a comparação dos `kid` dos dois JWKS. Isca no repositório: a
mesma `TAG_BASE_URL` nos dois ambientes **precisa reprovar**, e a esteira exige a
reprovação.

**Verificação:** aprova a configuração real e reprova a isca, com o nome da
variável na mensagem.

### Passo 13: nenhuma permissão no nível do projeto

**Verificação:** `gcloud projects get-iam-policy $PROJ` não dá a `$SA_HML` nem
a `$SA_PROD` papel de Secret Manager, de Storage ou de editor no projeto; toda
permissão dessas duas contas em segredo e em bucket é por recurso. É a regra que
segura o resíduo da seção 5.

### Passo 14: o banco antigo de homologação

`ALTER DATABASE bichu_antigo ALLOW_CONNECTIONS false`. Ele fica 7 dias como
ponto de retorno. **Apagar exige o ok do cliente.**

**Verificação:** conectar em `bichu_antigo` falha; homologação de pé.

### Ordem inversa, por fase

- **Na janela (passo 4):** parar `api` e `worker`, desfazer a troca de nomes dos
  bancos se ela já aconteceu, e religar com `SECRET_STORE_PROJECT=$PROJ`. O cofre
  de `$PROJ` ainda tem os valores de hoje até o passo 7.
- **Entre os passos 5 e 9:** produção não tem tráfego; derrubar a `bichu-prod`
  não afeta ninguém.
- **Depois do passo 10:** voltar os três A para o IP de homologação (TTL de 300
  s) e devolver os nomes ao `HOSTS_EXTRA_*` da `bichu-hml`. `api` e `www` podem
  ficar apontando para produção sem problema.

## Alternativas consideradas

| Opção | Prós | Contras | Por que não |
|---|---|---|---|
| Promover `bichu-hml` a produção e criar homologação nova | produção fica com o IP de hoje | mover o dado de teste, trocar o DNS do host do cliente, interromper o teste dele e depois apagar o dado de teste na máquina promovida; produção herda disco e snapshots com histórico de teste | todo o custo cai no ambiente que tem gente usando, e nenhum no que está vazio |
| Mesma VM, dois ambientes (primeira versão deste ADR) | uma máquina | não cabe na e2-small; conta de serviço compartilhada | decisão do cliente |
| Sem projeto de homologação, prefixo de ambiente no nome do segredo | um projeto só | reabre o ADR-0022 e cega a guarda da esteira | pergunta 1 |
| Nomes diferentes de banco e bucket por ambiente | nome diz o ambiente | configuração diferente entre ambientes é o que faz um defeito aparecer só em produção | máquinas separadas já separam; o nome igual é paridade |
| Manter a aplicação como superusuário em homologação | janela menor | a role sem superusuário seria testada pela primeira vez em produção | homologação existe para isso |

## Consequências

**Fica mais fácil:** um engano ou um comprometimento em homologação não alcança
segredo, banco nem foto de produção; produção nasce sem dado de teste e com
chaves que nunca estiveram em homologação; o site pode ser testado em
`hml.bichu.app` antes de ir para `bichu.app`.

**Fica mais difícil:** duas máquinas para atualizar, duas bordas, dois backups,
duas contas de serviço. E o custo de infraestrutura dobra.

**Irreversível:** nada. O banco antigo só some com o ok do cliente, e o host da
plaquinha de produção continua o de antes.

**Dívida aceita, com gatilho:**

1. as duas VMs no mesmo projeto (resíduo da seção 5). Gatilho: o primeiro
   usuário real, ou a primeira exigência de auditoria;
2. banco em container em produção. Gatilho do ADR-0013: o primeiro cadastro
   real;
3. fotos de produção só no disco. Gatilho: o primeiro tutor real com foto;
4. 160 MB de folga para o sistema em cada VM. Gatilho: o da seção 11.

## Perguntas ao cliente

**1. Criar um projeto GCP só para os segredos de homologação?**
(a) Sim: custo perto de zero; é o que o passo 3 usa, e depois serve de projeto
Firebase para o app de homologação. (b) Não: aí `DATABASE_URL` de homologação e a
de produção não cabem no mesmo cofre, e a saída é mudar o código para prefixar
o nome por ambiente, o que reabre o ADR-0022.
**Recomendo (a).** Máquinas separadas não dispensam isso: o motivo é o nome do
segredo, não o isolamento.

**2. As duas máquinas custam ~R$ 314 por mês, e o alerta de orçamento está em
R$ 200. Para quanto vai o alerta?**
(a) R$ 400: cobre as máquinas, o cofre, os backups e alguma folga. (b) R$ 350:
mais apertado, e dispara com qualquer serviço novo. (c) Fica em R$ 200: dispara
todo mês e deixa de ser lido.
**Recomendo (a).** O valor em reais depende do câmbio (premissa: R$ 5,50), e
Maps e outros serviços da mesma conta de faturamento entram na mesma soma.
