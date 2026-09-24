> **Status:** pronto para aplicar
> **Atualizado:** 2026-09-19
> **Issue:** BICHUS-135 (destrava BICHUS-13, critérios 3, 6, 7, 8, 9, 10 e 12)
> **Decisão que este roteiro executa:** `docs/07-devops.md` 16.1, 16.2 e 16.3 — ADR-0013.

# Roteiro de provisionamento do host de homologação

Este arquivo existe para que **o dia 1 seja aplicar e não decidir**. Tudo que é
escolha já foi decidido em 16.3 e não se reabre aqui: `e2-small` no Compute
Engine, região `southamerica-east1`, rodando o `compose.yaml` inteiro, sem
nenhum serviço gerenciado no caminho da aplicação.

Citar GCP e `southamerica-east1` aqui é o certo: este é o lugar do nome do
provedor. O ADR-0007 proíbe nome de provedor em `src/`, `migrations/`,
`app/lib/` e `web/`, e o portão `infra/verificacao/verificar_portabilidade.py`
varre exatamente essas quatro raízes. `infra/` fica de fora de propósito — é
para cá que o nome deve ser empurrado, e um portão que varresse configuração
acusaria o próprio remédio.

---

## As três regras que governam o roteiro inteiro

**1. Passo sem verificação não é passo, é desejo.** Cada item abaixo tem um
comando que **prova** que ele funcionou. Um roteiro em que os passos só dizem o
que digitar produz a pior forma de erro de infraestrutura: a que aparece três
passos depois, com sintoma que não se parece com a causa.

**2. O servidor sobe e é testado POR IP antes de o DNS apontar (16.1).** Não é
preferência de estilo. O TLD `.app` inteiro está na lista de pré-carregamento
de HSTS: **não existe `http://bichu.app` em hipótese nenhuma**, nem para teste.
Errar a emissão do certificado com o domínio já apontado deixa o domínio sem
responder a nada em navegador — erro de TLS, sem página, sem `http://` para
diagnosticar, sem caminho de diagnóstico pelo próprio domínio. E há um segundo
efeito, pior de desfazer: cada tentativa falha de emissão consome o limite do
emissor por hora, e o castigo é ficar sem poder emitir justamente quando tudo
já estiver pronto.

**3. Todo comando `gcloud` leva `--project=bichu-app-508914` escrito (16.3).**
Nesta máquina a configuração ativa aponta para `leega-digital-prd-linkedin-ce`,
projeto de outra empresa com `prd` no nome. A assimetria é o que torna a regra
inegociável: esquecer `--account` **falha** (a conta da Leega não tem acesso ao
nosso projeto), esquecer `--project` **funciona, no lugar errado**. O erro que
dá certo é o que machuca.

```bash
gcloud config configurations create bichu
gcloud config set account leandro@tecla.consulting
gcloud config set project bichu-app-508914
gcloud config set compute/region southamerica-east1
export CLOUDSDK_ACTIVE_CONFIG_NAME=bichu
```

**Verificação:** a configuração ativa é a nossa, e não a `default`.

```bash
gcloud config configurations list
# bichu  True  leandro@tecla.consulting  bichu-app-508914
```

---

## Passo 0 — Pré-requisitos que são do cliente, e sem os quais nada roda

Não crio conta em nuvem nem provisiono recurso. Estes quatro são dele:

| O que | Por que trava tudo |
|---|---|
| Projeto `bichu-app-508914` criado no GCP | não há onde criar a VM |
| **Faturamento vinculado ao projeto** | sem faturamento a `e2-small` não sobe. E, pior que falhar: **o Maps não falha — ele renderiza o mapa com marca d'água de erro**, que passa por defeito visual e some no relatório de homologação |
| `gcloud auth login` feito nesta máquina | o sintoma da ausência é erro de credencial, não de permissão, e leva meia hora para ser lido como o que é |
| Nenhum serviço gerenciado habilitado, **com uma exceção** | ressalva explícita do cliente: nada de Cloud SQL, GCS no caminho da aplicação nem CDN. **O Secret Manager saiu desta lista em 19/09 pelo ADR-0022** e é o único gerenciado autorizado; a API já está habilitada no projeto. Os segredos e o papel `roles/secretmanager.secretAccessor` **por segredo** são criados pelo cliente, e nada neste roteiro os cria |

**Verificação, antes de digitar qualquer outra coisa:**

```bash
gcloud auth list --project=bichu-app-508914
gcloud beta billing projects describe bichu-app-508914 \
  --format='value(billingEnabled)'          # precisa imprimir: True
```

Se `billingEnabled` imprimir `False`, **pare aqui**. Seguir a partir daqui
produz uma sequência de erros que não mencionam faturamento.

---

## Parte A — A máquina, sem DNS nenhum apontando para ela

### Passo 1 — Alerta de orçamento, ANTES da primeira máquina (16.2)

Este passo vem primeiro de propósito, e não por zelo burocrático. A decisão de
usar GCP criou um risco que ela mesma trouxe: **um console cheio de botões que
ligam serviço com um clique e aparecem na fatura no mês seguinte.** O crédito
inicial esconde o custo unitário por meses, e quando a primeira fatura real
chega o desenho já está tomado.

Orçamento mensal de **US$ 50**, alertas em 50%, 90% e 100%, notificando um
endereço real do Workspace. US$ 50 é cerca de 60% acima da estimativa de
US$ 28 a 32: perto o bastante para acusar cedo, longe o bastante para não virar
ruído que se aprende a ignorar.

**O detalhe que faz o alerta funcionar de verdade: exclua os créditos do
cálculo.** Orçamento que conta o custo líquido fica perto de zero enquanto
houver crédito, dispara o alerta no dia em que o crédito acaba, e informa
exatamente quando já não adianta.

**A conta de faturamento do Bichu e em BRL** (conferido em 19/09:
`gcloud beta billing accounts describe` devolve `currencyCode: BRL`). O valor do
orcamento precisa estar na moeda da CONTA -- `50USD` devolve
`INVALID_ARGUMENT: Request contains an invalid argument`, sem dizer qual
argumento, que foi meia hora de diagnostico. Confira a moeda antes:

```bash
gcloud beta billing accounts describe 010D34-805F24-7B501C \
  --format='value(currencyCode)'
```

**Este passo ja estava cumprido em 19/09**: existe o orcamento `bichu-app-200`,
de R$ 200, com os tres limiares e `EXCLUDE_ALL_CREDITS`. Nao crie um segundo --
dois alertas sobre a mesma conta ensinam a ignorar os dois. O comando abaixo
fica para quem for montar isto de novo do zero.

```bash
CONTA=$(gcloud beta billing projects describe bichu-app-508914 \
  --format='value(billingAccountName)')

gcloud billing budgets create \
  --billing-account="${CONTA##*/}" \
  --display-name="bichu - teto mensal" \
  --budget-amount=200BRL \
  --threshold-rule=percent=0.5 \
  --threshold-rule=percent=0.9 \
  --threshold-rule=percent=1.0 \
  --filter-projects="projects/bichu-app-508914" \
  --credit-types-treatment=exclude-all-credits
```

**Verificação:** o orçamento existe **e** está com os créditos excluídos. As
duas coisas, porque um orçamento criado sem a exclusão parece idêntico na
listagem resumida.

```bash
gcloud billing budgets list --billing-account="${CONTA##*/}" \
  --format='table(displayName, amount.specifiedAmount.units, budgetFilter.creditTypesTreatment)'
# bichu-app-200  200  BRL  EXCLUDE_ALL_CREDITS
```

Se a coluna vier vazia ou com `INCLUDE_ALL_CREDITS`, o alerta está ligado e
**não vai avisar nada** enquanto houver crédito.

---

### Passo 2 — IP externo estático, reservado ANTES de criar a VM

```bash
gcloud compute addresses create bichu-ip \
  --project=bichu-app-508914 --region=southamerica-east1
```

O IP efêmero, que é o padrão, **muda quando a máquina é parada e religada**.
Num site comum isso custaria um susto. Aqui é pior e vale soletrar: o registro
`A` passaria a apontar para o vazio e, como `.app` é HSTS pré-carregado, o
navegador **recusa a conexão sem carregar nada** — sem página de erro nossa,
sem `http://` para diagnosticar, e com o cliente vendo um site que sumiu.

E há o motivo de ser *antes*: o IP é o valor que o cliente precisa receber de
nós para publicar o DNS. Reservá-lo depois de a VM existir significa descobrir,
no meio do dia 1, que o número que você mandou já não é o número que atende.

**Verificação:** guarde o endereço; ele é usado em todos os passos seguintes.

```bash
IP=$(gcloud compute addresses describe bichu-ip \
  --project=bichu-app-508914 --region=southamerica-east1 \
  --format='value(address)')
echo "$IP"    # precisa imprimir um IPv4, e o status precisa ser RESERVED
gcloud compute addresses describe bichu-ip --project=bichu-app-508914 \
  --region=southamerica-east1 --format='value(status)'
```

---

### Passo 3 — Regra de firewall, porque o GCP nega tudo por padrão

Num VPS comum este passo não existe, e é exatamente por isso que ele é pulado:
ninguém o executa por hábito. A VM sobe sem nada aberto, e o sintoma de
esquecer é tempo esgotado na conexão, que se parece com "a pilha não subiu".

```bash
gcloud compute firewall-rules create bichu-web \
  --project=bichu-app-508914 \
  --network=default --direction=INGRESS --action=ALLOW \
  --rules=tcp:80,tcp:443 --source-ranges=0.0.0.0/0 \
  --target-tags=bichu-web
```

A porta 80 fica aberta mesmo com `.app` sendo HTTPS obrigatório: ela serve o
redirecionamento permanente e o desafio de emissão do certificado, e **nenhum
dos dois é navegador** — o pré-carregamento de HSTS vale para navegador e só.

**A 22 não entra nessa regra.** SSH por encaminhamento IAP dispensa porta
aberta e registra quem entrou:

```bash
gcloud compute ssh bichu-hml --project=bichu-app-508914 \
  --zone=southamerica-east1-a --tunnel-through-iap
```

**Verificação:** a regra existe, com as duas portas e a etiqueta certa.

```bash
gcloud compute firewall-rules describe bichu-web --project=bichu-app-508914 \
  --format='value(allowed, targetTags, sourceRanges)'
# tcp:80,tcp:443   bichu-web   0.0.0.0/0
```

---

### Passo 4 — Conta de serviço com o mínimo, porque o padrão é generoso demais

A VM, por omissão, recebe a conta de serviço padrão do Compute Engine, **que
tem papel de Editor no projeto inteiro**. Uma aplicação exposta à internet
rodando com permissão de editar o projeto é exagero que ninguém escolheria
conscientemente: acontece por não escolher.

```bash
gcloud iam service-accounts create bichu-vm \
  --project=bichu-app-508914 --display-name="VM Bichu"

SA=bichu-vm@bichu-app-508914.iam.gserviceaccount.com

gcloud projects add-iam-policy-binding bichu-app-508914 \
  --member="serviceAccount:$SA" --role=roles/logging.logWriter
gcloud projects add-iam-policy-binding bichu-app-508914 \
  --member="serviceAccount:$SA" --role=roles/monitoring.metricWriter
```

O papel de escrita no bucket de backup vem no passo 11, **no bucket e não no
projeto**, e é `objectCreator` e não `objectAdmin`: a VM escreve backup e **não
consegue apagar backup**. Se a máquina for comprometida, o atacante não apaga o
que restaria para restaurar.

**Verificação:** a conta não tem papel amplo nenhum.

```bash
gcloud projects get-iam-policy bichu-app-508914 \
  --flatten='bindings[].members' \
  --filter="bindings.members:$SA" \
  --format='value(bindings.role)'
# esperado: logging.logWriter e monitoring.metricWriter. NADA de roles/editor
```

Se `roles/editor` aparecer nesta saída, a VM está rodando com permissão de
editar o projeto e o passo falhou.

---

### Passo 4.1 — Os segredos de runtime (ADR-0022)

**Nada deste passo foi executado, e ele não é para eu executar.** Criar segredo e
conceder papel é do cliente, e está aqui como proposta a conferir junto com o
desenho — que é o que o ADR-0022 entrega.

Vale só para `prod` e `preprod`. Em `dev`, `qa` e `homolog` os segredos continuam
no arquivo de ambiente, e a aplicação sobe sem falar com o GCP.

**O identificador do segredo é o nome da variável, sem tradução.** É contrato da
porta `SecretProvider`, e é o que faz a §6 de `docs/07-devops.md` continuar
verdadeira. Os oito de hoje estão em `SEGREDOS_DE_RUNTIME`
(`src/shared/config/segredos.ts`): `DATABASE_URL`, `IP_HMAC_KEY`, `TAG_CODE_KEY`,
`TAG_CODE_INDEX_KEY`, `JWT_ACTIVE_PRIVATE_KEY`, `JWT_NEXT_PRIVATE_KEY`,
`OBJECT_STORAGE_ACCESS_KEY_ID`, `OBJECT_STORAGE_SECRET_ACCESS_KEY`.

`TAG_CODE_INDEX_KEY` e `TAG_CODE_KEY` **precisam ser valores diferentes**, e a
aplicação recusa subir se forem iguais. Uma cifra o código para reimpressão, a
outra o indexa; iguais, quem vazasse uma vazaria as duas e o índice cego deixaria
de ser cego.

```bash
# `printf %s`, NUNCA `echo`. `echo` acrescenta \n ao final, e o adaptador
# devolve os bytes como foram gravados, de proposito -- ele nao apara nada,
# porque um PEM PRECISA da quebra final e uma chave hexadecimal nao pode ter
# nenhuma. Um `\n` grudado numa chave de 32 bytes vira chave de 33 e a falha
# aparece longe daqui.
printf %s "$VALOR" | gcloud secrets create TAG_CODE_KEY \
  --project=bichu-app-508914 --replication-policy=automatic --data-file=-

# Papel POR SEGREDO, nunca no projeto: e a mesma regra do bucket de backup no
# passo 11. `secretAccessor` le versao; ele nao lista, nao cria e nao apaga.
gcloud secrets add-iam-policy-binding TAG_CODE_KEY \
  --project=bichu-app-508914 \
  --member="serviceAccount:$SA" --role=roles/secretmanager.secretAccessor
```

**Verificação, e ela importa mais que o comando:** a mensagem de falha da
aplicação precisa citar o segredo. Subir com um segredo faltando tem que
imprimir o NOME dele — se imprimir `permission denied` cru, alguma coisa
contornou o adaptador, e o defeito é esse, não o IAM.

Rotacionar é `gcloud secrets versions add <NOME> --data-file=-` e reiniciar o
processo: o adaptador lê `latest`. Não passa por deploy, de propósito.

#### `TAG_CODE_INDEX_KEY` é a exceção, e ela está escrita antes de a chave existir

**Este parágrafo vale para uma chave só, e é o único lugar onde o procedimento
acima está errado.** Ele está aqui antes de a chave ser criada, de propósito: é
o tipo de coisa que, descoberta depois, é descoberta durante um incidente.

`TAG_CODE_INDEX_KEY` **não é rotacionável.** `code_hash` é
HMAC-SHA-256(chave, código) e é por ele que a resolução busca, numa igualdade
sobre `pet_tags_code_hash_unico`. Publicar uma versão nova e reiniciar — que é o
giro normal das outras sete — faz **toda tag do produto parar de resolver no
mesmo instante**, porque o valor procurado passa a ser outro e nada no banco
mudou. Não há degradação parcial e não há aviso: a plaquinha de todo mundo vira
404 de uma vez.

Trocá-la é uma **operação de manutenção**, com a aplicação no meio e janela
combinada:

1. Parar a emissão de tags (a rota de emissão, não a de resolução).
2. Para cada tag `active`: decifrar `code_ciphertext` com `TAG_CODE_KEY`,
   recalcular `code_hash` com a chave nova, gravar. É para isso que o cifrado
   existe.
3. Publicar a versão nova do segredo e reiniciar, **só depois** do passo 2.

**Tags `revoked` não sobrevivem a essa operação, e isso não é defeito do
procedimento.** A revogação apaga `code_ciphertext`
(`pet_tags_revogada_nao_guarda_o_codigo`), então o código delas não é recuperável
de lugar nenhum: elas passariam a responder 404 em vez do 410 que carrega o
`next_action` de quem está com o animal no colo. Antes de rotacionar, conte
quantas existem; se houver mais que zero, a decisão é de quem responde por
produto, e a saída desenhada é a `code_hash_legacy` da seção 12.2 da Emenda 1 do
ADR-0004.

**Então a rotação desta chave é resposta a comprometimento, não higiene de
calendário.** Não a coloque no mesmo ciclo das outras.

---

### Passo 5 — A `e2-small`

```bash
gcloud compute instances create bichu-hml \
  --project=bichu-app-508914 \
  --zone=southamerica-east1-a \
  --machine-type=e2-small \
  --address="$IP" \
  --tags=bichu-web \
  --service-account="$SA" \
  --scopes=cloud-platform \
  --boot-disk-size=30GB \
  --boot-disk-type=pd-balanced \
  --image-family=debian-12 --image-project=debian-cloud
```

**Verificação:** a máquina está de pé, com o IP reservado e a etiqueta.

```bash
gcloud compute instances describe bichu-hml --project=bichu-app-508914 \
  --zone=southamerica-east1-a \
  --format='value(status, machineType.basename(), tags.items, networkInterfaces[0].accessConfigs[0].natIP)'
# RUNNING  e2-small  ['bichu-web']  <o mesmo $IP do passo 2>
```

Se o `natIP` for diferente de `$IP`, a VM subiu com IP efêmero: ela funciona
hoje e **troca de endereço no primeiro religamento**, que é o modo de falha do
passo 2 chegando pela porta dos fundos.

---

### Passo 6 — Docker na máquina

```bash
gcloud compute ssh bichu-hml --project=bichu-app-508914 \
  --zone=southamerica-east1-a --tunnel-through-iap --command '
    curl -fsSL https://get.docker.com | sudo sh &&
    sudo usermod -aG docker "$USER"
  '
```

**Verificação:** o compose v2 existe (o roteiro inteiro depende dele, e a
versão antiga `docker-compose` não entende `mem_limit` junto de perfis):

```bash
gcloud compute ssh bichu-hml --project=bichu-app-508914 \
  --zone=southamerica-east1-a --tunnel-through-iap \
  --command 'docker compose version && docker run --rm hello-world >/dev/null && echo docker-ok'
```

---

### Passo 7 — O artefato e o ambiente de homologação

> **OBSOLETO PARA LEVAR CÓDIGO À VM, desde 24/09/2026.** O `scp` deste passo e o
> `docker compose up` que constrói na VM (passo 8) foram substituídos pelo CD
> (`.github/workflows/cd.yml`): a imagem é construída uma vez no CI, publicada no
> Artifact Registry e implantada **por digest** por `infra/cd/implantar.sh`, que
> também entrega o `compose.yaml` e a configuração da borda. Construir na VM foi o
> que deixou o `src/` da homologação quatro dias atrás, e o `scp` abaixo nem
> copiava o código (correção nunca mesclada em
> `correcao/receita-de-provisionamento-copia-o-codigo`). Continua valendo deste
> passo: a tabela do `.env` do host, que o CD não cria nem altera.

O `compose.yaml` é o artefato, e é o **mesmo** dos dois destinos. O que muda é
o arquivo de ambiente — é isso que torna a portabilidade do critério 12 um fato
verificável em vez de uma frase.

```bash
gcloud compute scp --project=bichu-app-508914 --zone=southamerica-east1-a \
  --tunnel-through-iap --recurse \
  ./compose.yaml ./Dockerfile ./Makefile ./migrations ./infra ./api \
  bichu-hml:~/bichu/
```

No host, o `.env` de homologação a partir do `.env.example`, com as diferenças
que importam:

| Variável | Valor na VM | Por quê |
|---|---|---|
| `ENVIRONMENT` | `homolog` | `make reset` se recusa a rodar com este valor: apagar volume aqui apaga a massa de teste do QA |
| `PUBLIC_BASE_URL` | `https://hml.bichu.app` | o Caddy escuta na porta que está aqui, e daqui sai o `type` do `problem+json`. **Ele deixou de ser o que o QR codifica em 19/09**: as duas linhas abaixo tiraram esse papel dele (ADR-0017 item 2). Enquanto era um valor só, este campo dizia `https://bichu.app` e estava errado de um jeito perigoso — o apex serve a página da Squarespace, e uma tag gerada assim apontaria para uma página que não é nossa, de forma **irreversível** (ADR-0004) |
| `TAG_BASE_URL` | `https://tag.bichu.app` | **o que o QR codifica e o que vai prensado na plaquinha.** Decisão do cliente de 19/09. É a única variável desta tabela que não se conserta depois: trocar o valor não muda nenhuma tag que já saiu. **`tag.bichu.app` ainda não resolve no DNS**, e enquanto não resolver, toda tag gerada aqui aponta para lugar nenhum. **NÃO IMPRIMA TAG A PARTIR DESTE AMBIENTE.** Confira o valor efetivo antes de gerar **qualquer** código: `docker compose exec -T api printenv TAG_BASE_URL` |
| `WEB_BASE_URL` | `https://bichu.app` | onde o outro time web serve cartaz, página do caso, perfil, conversa do achador e as telas de e-mail e senha (ADR-0017). É a base dos links dos e-mails. Reversível: trocar aqui muda o link do próximo e-mail e nada mais. **Hoje o apex ainda é da Squarespace**, então um link de verificação enviado deste ambiente leva à página deles — motivo de sobra para conferir junto com a de cima: `docker compose exec -T api printenv WEB_BASE_URL`. A aplicação **recusa subir** se esta e a de cima estiverem em domínios diferentes |
| `MEDIA_PUBLIC_BASE_URL` | `https://img.bichu.app` | o MinIO **assina a URL com o host pelo qual ele se conhece**. Divergir daqui quebra TODA URL assinada, com erro de assinatura que não diz que é de host |
| `MAIL_TRANSPORT` | `log` | o Mailpit tem `profiles: [dev, qa]` e não sobe aqui, e ele nunca provou entregabilidade de qualquer forma. **Não use `postmark`:** a chave de HML já está no cofre, mas o adaptador do Postmark não existe (ADR-0009), e `app-config.ts` recusa o valor na subida. Com `log` o e-mail é escrito no log e nada sai — que é a verdade do estado de hoje |
| `PORTA_APP` / `PORTA_MIDIA` | `80` e a porta da mídia | ver o passo 8 |

**Correção de estado em 19/09, e ela é importante o bastante para parar aqui.**
A tabela acima prescreve `https://bichu.app` e `https://img.bichu.app`, que é o
destino depois do passo 9. **Hoje o passo 9 não aconteceu:** o apex continua nos
quatro registros A da Squarespace, e o que a VM atende de fato é
`https://hml.bichu.app` e `https://img-hml.bichu.app`, conferido por `curl` na
mesma data. Enquanto for assim, uma base apontada para `https://bichu.app` na VM
faz o cartaz e o link do e-mail levarem à página de estacionamento de outra
empresa.

**E `tag.bichu.app` é pior do que isso, porque nem existe.** O nome foi decidido
em 19/09 e ainda não tem registro de DNS: um QR gerado com ele hoje não abre
nada em telefone nenhum, e diferente de todo o resto desta tabela, isso não se
conserta trocando uma variável depois — o que está prensado está prensado
(ADR-0004). A regra, então, é de uma linha só: **nesta VM não se imprime tag.**
Antes de gerar **qualquer** código, conferir os valores no host:

```bash
docker compose exec -T api printenv TAG_BASE_URL WEB_BASE_URL \
  PUBLIC_BASE_URL MEDIA_PUBLIC_BASE_URL
```

**Verificação — e esta é a que já pegou defeito real:** a pilha falha
ruidosamente quando falta variável, com o nome dela na mensagem (critérios 5 e
11). Provoque a falha de propósito **antes** de subir para valer:

```bash
docker compose config -q && echo "compose válido"
docker compose run --rm --no-deps -e TAG_CODE_KEY= api node dist/bin/api.js
# precisa falhar assim, nomeando a variável, e não subir degradado:
#   Error: Variável de ambiente obrigatória ausente: TAG_CODE_KEY.
```

---

### Passo 8 — Subir a pilha e testar **POR IP**, com o certificado ainda desligado

Esta é a linha que a ordem de 16.1 protege, e a razão de o roteiro existir.

Na VM, com o `PUBLIC_BASE_URL` apontando para o **IP**, e não para o domínio:

```bash
PUBLIC_BASE_URL="http://$IP" MEDIA_PUBLIC_BASE_URL="http://$IP:3001" \
  docker compose up -d --wait
```

**`TAG_BASE_URL` e `WEB_BASE_URL` NÃO entram nesta linha, e isso é deliberado.**
Testar a pilha por IP é legítimo; codificar um IP dentro de um QR não é — o
endereço fica no plástico e a máquina troca de IP quando alguém a recria. As
duas continuam com o valor do `.env`, e a aplicação recusa subir com elas em
domínios diferentes um do outro (ADR-0017 item 2), o que também acusaria um
`TAG_BASE_URL="http://$IP"` copiado para cá por distração.

Repare que `up` sem `--profile dev` já exclui o Mailpit, e que `depends_on` de
`objeto_init` com `service_completed_successfully` é o que impede `--wait` de
ler a saída esperada daquele contêiner como erro.

**Verificação em três camadas, porque elas falham de jeitos diferentes:**

```bash
# 1. os limites de memória VALEM. `deploy.resources` fora do Swarm é ignorado
#    em silêncio, e o arquivo parece correto do mesmo jeito.
docker stats --no-stream --format 'table {{.Name}}\t{{.MemUsage}}'
# a coluna de limite precisa mostrar 640MiB no db e 448MiB no worker,
# e NÃO a memória total da máquina

# 2. as migrações aplicadas batem com as que existem em disco
docker compose logs migracao | tail -5
esperado=$(find migrations -maxdepth 1 -name '*.sql' | wc -l | tr -d ' ')
aplicadas=$(docker compose exec -T db psql -U bichu -d bichu -tAc 'select count(*) from pgmigrations')
test "$esperado" = "$aplicadas" || echo "REPROVA: $esperado em disco, $aplicadas aplicadas"
# a comparação é com a CONTAGEM DE ARQUIVOS: número fixo aqui vira mentira na
# próxima migração, e ninguém percebe porque a conferência continua verde

# 3. a borda responde o que o contrato promete, PELA PORTA PUBLICADA
python3 infra/verificacao/verificar_borda_local.py "http://$IP" .
```

A terceira é a que pega a família de defeito que nenhuma leitura de arquivo
pega: **a regra escrita e não valendo**. Foi exatamente o que houve em 17/09 —
o `Caddyfile` tinha os dois blocos de associação e `/srv/well-known` não estava
montado, e o `file_server` respondia 404 com `Content-Type: application/json`,
um 404 que parece um arquivo. Sonda batida de dentro do contêiner não pega
isso: por dentro o serviço servia `/.well-known/jwks.json` com 200 o tempo
inteiro.

**Não siga para a Parte B enquanto esta terceira verificação não imprimir
`APROVADO`.** Os dois avisos sobre lista vazia são esperados até os insumos da
Apple e do APK chegarem (ver adiante); qualquer `REPROVA` não é.

---

## Parte B — Só agora o DNS

### Passo 9 — Devolver o IP ao cliente e substituir os registros

O cliente publica. É dele o DNS, e é o único valor que ele precisa receber de
nós.

**Substituir, nunca acrescentar.** Os quatro `A` do Squarespace saem **no mesmo
momento** em que o `A` do apex com o nosso IP entra. Acrescentar deixa a
resolução sorteando entre a nossa origem e a página de estacionamento, e o
sintoma é "às vezes funciona", que é o mais caro de diagnosticar.

**Sem `www` e sem redirecionamento na raiz.** Um redirecionamento de raiz para
`www`, mesmo perfeito para pessoas, **quebra o deep link nas duas plataformas**,
e o sintoma é o link abrindo no navegador em vez do app, sem erro em lugar
nenhum. E mantenha os registros do host em **modo somente DNS (nuvem cinza)**,
não em modo proxy: o proxy põe um intermediário na frente dos arquivos de
associação e a verificação do sistema operacional falha sem aparecer em log
nenhum.

**A origem precisa estar de pé ANTES do corte, e isso se confere, não se
supõe.** A regra 2 do preâmbulo existe por isto, e em 21/09 ela pegou o caso
real: a VM `bichu-hml` estava `TERMINATED`, `hml.bichu.app` resolvia certo e
respondia nada, e um corte feito naquele dia teria trocado uma página de
estacionamento que responde 200 por uma recusa de conexão em domínio
pré-carregado em HSTS — sem certificado, sem página de erro nossa e sem
`http://` para diagnosticar. Antes de tocar em qualquer registro:

```bash
gcloud compute instances describe bichu-hml \
  --project=bichu-app-508914 --zone=southamerica-east1-a \
  --format='value(status)'                    # precisa imprimir RUNNING
curl -sI --max-time 10 http://$IP/v1/health   # precisa responder, pelo IP
```

**Guarde os registros ANTES de mexer, e compare depois.** O corte mexe em `A` e
em `www`; ele **não** pode mexer em `MX`, `TXT` (SPF) nem `DKIM`. As contas
`oi@bichu.app` e `privacidade@bichu.app` dependem deles, e a segunda é o canal
do encarregado de dados exigido pela LGPD (ADR-0010). Derrubar e-mail numa
troca de `A` é o erro clássico desta operação, e ele não aparece em nenhuma
verificação de HTTP.

```bash
# ANTES do corte
for t in A AAAA MX TXT NS CAA; do echo "== $t"; dig +short $t bichu.app @1.1.1.1; done > /tmp/dns-antes.txt
# DEPOIS do corte
for t in A AAAA MX TXT NS CAA; do echo "== $t"; dig +short $t bichu.app @1.1.1.1; done > /tmp/dns-depois.txt
diff /tmp/dns-antes.txt /tmp/dns-depois.txt   # só as linhas de A podem diferir
```

**Verificação — antes de ligar o certificado:**

```bash
dig +short bichu.app        # = $IP, e SÓ ele. Nenhum 198.185.159.x sobrando
dig +short api.bichu.app
dig +short img.bichu.app
dig +short AAAA bichu.app   # precisa vir VAZIO: AAAA órfão leva o cliente
                            # IPv6 para lugar nenhum e o IPv4 nunca é tentado
dig +short MX bichu.app     # = 10 smtp.google.com. — idêntico ao de antes
dig +short hml.bichu.app    # = $IP, intocado: é o ambiente de teste do cliente
```

**Confira contra resolvedor público, nunca contra o cache do seu.** `@1.1.1.1`
e `@8.8.8.8` dão respostas independentes; o resolvedor da sua máquina guarda o
valor antigo pelo TTL e faz um corte recém-feito parecer não ter acontecido, ou
o contrário.

---

### Passo 10 — Ligar a emissão do certificado, e só então a primeira carga pelo domínio

Com o nome resolvendo para nós, o `PUBLIC_BASE_URL` passa a ser o domínio e o
Caddy emite sozinho.

**Não crie o registro CAA antes deste passo.** O CAA é bom e deve existir —
depois. Um valor errado impede a emissão e, com `.app` pré-carregado, o domínio
fica completamente inacessível em navegador, sem página de erro nossa e sem
`http://` para diagnosticar. É um tiro no pé com o pé preso.

**Verificação:**

```bash
docker compose logs edge | grep -i 'certificate obtained'
python3 infra/verificacao/verificar_borda_local.py https://bichu.app .
curl -sI http://bichu.app/v1/health | head -1   # 301/308 para https, e não 200
```

---

### Passo 11 — Os arquivos de associação pelo domínio, e o portão externo

Só aqui, e nesta ordem: TLS conferido primeiro, associação depois.

Preencha `ip_esperado` em `infra/verificacao/associacao.yml` com o IP do passo
2. Enquanto ele está vazio a asserção mais direta contra proxy ligado por
engano está desligada, e o próprio script diz isso em voz alta e reprova a
partir de `esperado_a_partir_de`.

**Feito em 19/09:** `ip_esperado: "35.247.247.16"` e
`bucket_privado_url: "https://img-hml.bichu.app/bichu-media-private/"`. O
segundo já passa — o prefixo privado responde `404` e o público `403`, o que
prova que a origem está de pé e roteando, e não que ela está morta respondendo
`404` a tudo. O primeiro ainda reprova, e **é para reprovar**: ele agora diz
"`bichu.app` resolve para os quatro endereços da Squarespace, esperado
35.247.247.16", que nomeia o bloqueio real, em vez de reclamar da própria
configuração. Preencher não criou falso verde: a asserção de IP só acrescenta
achado, nunca transforma reprovação em aprovação.

**Não mexa nas datas de `esperado_a_partir_de` para calar o portão.** Ele
reprova hoje porque a página de estacionamento do Squarespace responde **200
com `text/html`** naqueles dois caminhos — o que é pior que 404, porque o
sistema operacional recebe sucesso com o conteúdo errado. Essa reprovação é o
portão funcionando. Empurrar a data para o futuro transformaria "estamos
atrasados" em "está tudo bem", que é a única saída de que este repositório não
abre mão.

**Verificação:**

```bash
python3 infra/verificacao/verificar_associacao.py     # precisa imprimir APROVADO
curl -sI https://bichu.app/.well-known/apple-app-site-association \
  | grep -i 'content-type\|location\|^HTTP'
# HTTP/2 200, content-type: application/json, e NENHUM location
```

---

## Parte C — O que precisa existir antes de a máquina receber o primeiro dado

### Passo 12 — `pg_dump` diário guardado FORA do host (critério 10 de BICHUS-13)

**Numa VM, backup é responsabilidade nossa e de mais ninguém.** Não há serviço
gerenciado, então não há nada acontecendo sozinho. Duas camadas, porque falham
de jeitos diferentes:

| Camada | O quê | Frequência | Recupera |
|---|---|---|---|
| Snapshot do disco | política de recurso do Compute Engine | diário, retenção de 7 dias | a máquina inteira, inclusive os objetos do MinIO e a configuração |
| `pg_dump` para bucket | tarefa diária na VM | diário, retenção de 14 dias | só o banco, mas é restaurável em outro lugar e legível |

O snapshot sozinho não basta: recupera a máquina, não o dado, e restaurar um
snapshot para conferir uma tabela é caro demais para ser feito de verdade. O
`pg_dump` sozinho também não: não traz os objetos do MinIO.

**Sobre o bucket, e é honesto dizer em voz alta:** guardar o dump num bucket é
a única forma de ele estar *fora do host*, que é o que o critério 10 pede —
dump no disco da própria VM morre junto com a VM, e aí nunca houve backup. Isso
**não** reabre a ressalva do cliente contra serviço gerenciado: a aplicação
nunca lê desse bucket, nenhuma porta do domínio o conhece, e tirá-lo do desenho
não muda uma linha de `src/`. É destino de arquivo, não dependência de produto;
o dump é um `.sql.gz` que restaura em qualquer Postgres, em qualquer lugar.

```bash
gcloud storage buckets create gs://bichu-backup-hml \
  --project=bichu-app-508914 --location=southamerica-east1 \
  --uniform-bucket-level-access

# escreve e NÃO apaga, e o escopo é o bucket e não o projeto
gcloud storage buckets add-iam-policy-binding gs://bichu-backup-hml \
  --project=bichu-app-508914 \
  --member="serviceAccount:$SA" --role=roles/storage.objectCreator

# quem envelhece o que envelheceu é a regra de ciclo de vida, do lado de lá,
# porque a VM não tem permissão de apagar — e essa é a ideia
printf '{"rule":[{"action":{"type":"Delete"},"condition":{"age":14}}]}' > ciclo.json
gcloud storage buckets update gs://bichu-backup-hml \
  --project=bichu-app-508914 --lifecycle-file=ciclo.json

# snapshot diário do disco
gcloud compute resource-policies create snapshot-schedule bichu-snap-diario \
  --project=bichu-app-508914 --region=southamerica-east1 \
  --max-retention-days=7 --daily-schedule --start-time=06:00
gcloud compute disks add-resource-policies bichu-hml \
  --project=bichu-app-508914 --zone=southamerica-east1-a \
  --resource-policies=bichu-snap-diario
```

A tarefa diária na VM, às 05:00, reusando o alvo que já existe no `Makefile`:

```bash
sudo tee /etc/cron.d/bichu-backup >/dev/null <<'CRON'
0 5 * * * bichu cd /home/bichu/bichu && \
  docker compose exec -T db pg_dump -U bichu bichu | gzip \
  | gcloud storage cp - "gs://bichu-backup-hml/bichu-$(date +\%Y\%m\%d).sql.gz"
CRON
```

**Verificação — e é a parte que costuma faltar: quem confere que o backup
existe.** Backup que ninguém confere é o jeito mais comum de descobrir que não
havia backup, e a descoberta acontece no pior dia possível. A conferência roda
**na esteira e não na VM**, porque uma VM morta não reclama de si mesma:

```bash
# 1. o dump mais recente tem menos de 26 horas. 26 e não 24, para tolerar
#    variação de horário sem tolerar um dia inteiro perdido
gcloud storage ls -l gs://bichu-backup-hml/ --project=bichu-app-508914 | tail -3

# 2. e tem tamanho plausível: dump vazio tem SUCESSO e ocupa 20 bytes
gcloud storage ls -l gs://bichu-backup-hml/ --project=bichu-app-508914 \
  | awk '$1 < 10000 {print "REPROVA: dump suspeito de vazio: " $0}'

# 3. o snapshot do disco também existe
gcloud compute snapshots list --project=bichu-app-508914 \
  --filter='sourceDisk~bichu-hml' --format='table(name, creationTimestamp)'
```

**E uma restauração exercitada de verdade, uma vez, antes de 30/09.** Backup
nunca restaurado não é backup:

```bash
make restore   # contra uma cópia, e conferindo a contagem de uma tabela depois
```

---

### Passo 13 — Está escrito que isto é homologação, e não produção

Critério 10 de BICHUS-13, e é texto e não comando porque o que ele protege é o
que as pessoas acreditam sobre a máquina:

> Esta máquina é **ambiente de homologação e não produção**. Ela **não deve
> receber dado de usuário real**. Ela tem `pg_dump` diário guardado fora do
> host (passo 12) e snapshot diário do disco.

Esse texto passou a existir também onde o QA lê, e não só onde o DevOps executa:
seção 9.0 de `docs/07-devops.md` e a seção "Homologação" do `README.md`. Regra
escrita num roteiro de provisionamento é lida uma vez, por uma pessoa, no dia em
que a máquina nasce; quem manda dado real para lá é alguém que nunca abriu este
arquivo.

**E uma pendência declarada em 19/09, porque o texto acima afirma no presente
uma coisa que eu não consegui conferir:** que o `pg_dump` diário está de fato
rodando e que existe dump recente no bucket. Isso não se confere de fora — só
com `gcloud storage ls -l gs://bichu-backup-hml/`, credencial que tem quem
montou a máquina. **Dono: DevOps. Até 24/09**, junto com a restauração
exercitada, porque conferir que o backup existe e conferir que ele restaura são
a mesma tarefa feita pela metade quando se faz só uma.

**Verificação:** a própria pilha diz isso, para quem chegar pela porta em vez
de pelo documento.

```bash
docker compose exec -T api printenv ENVIRONMENT      # homolog
make reset                                           # precisa RECUSAR, e não apagar
# "recusado: reset no perfil de homologacao apaga a massa de teste"
```

A segunda linha é a verificação que importa: a recusa do `make reset` é a única
proteção automática entre um comando de hábito e a massa de teste do QA. Se ela
não recusar, o `ENVIRONMENT` do host ficou em `dev` e o passo 7 falhou em
silêncio.

---

## O que este roteiro NÃO resolve, e continua dependendo exclusivamente do cliente

| Pendência | Sem ela | Prazo |
|---|---|---|
| Conta e projeto no GCP, faturamento vinculado, `gcloud auth login` | nada da Parte A roda | passo 0 |
| Publicar os registros de DNS | nada da Parte B roda | dia 1 |
| **Impressão digital SHA-256 da chave de assinatura do APK** | `assetlinks.json` sobe com a lista vazia e o deep link **não abre o app** no Android | 22/09, dispensa `apk-assinado` |
| **Team ID da conta Apple Developer** | `apple-app-site-association` sobe com `details` vazio e o Universal Link **não abre o app** no iOS | 22/09, dispensa `ios` |
| Chave do Postmark, seletor e chave DKIM | o e-mail sai sem assinatura válida de um domínio com reputação zero, e a recuperação leva semanas | antes do primeiro envio |
| BICHUS-112: máquina sempre ligada ou janela anunciada | decide se a homologação tem horário | 24/09 |

As duas do meio são as que mais enganam, e por isso estão detalhadas em
`infra/caddy/well-known/LEIA-ME.md`: os arquivos existem, respondem **200 com
JSON válido**, e as listas estão **vazias de propósito**. Lista vazia é recusa
honesta — o sistema operacional não encontra correspondência e não abre o app,
que é exatamente o que acontece na realidade. Preencher com valor de exemplo
seria pior que o 404 que havia antes: qualquer conferência superficial ficaria
verde e a falha só apareceria no aparelho de um usuário, **depois de a plaquinha
ter sido impressa com o domínio**.
