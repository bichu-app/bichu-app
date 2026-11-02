> **Status:** pronto para aplicar
> **Atualizado:** 2026-09-23
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

### Passo 7 — Construir e PUBLICAR as imagens aqui, e mandar só a release

O `compose.yaml` é o artefato de configuração, e é o **mesmo** dos dois destinos.
O que muda é o arquivo de ambiente — é isso que torna a portabilidade do
critério 12 um fato verificável em vez de uma frase.

**As imagens são construídas AQUI, publicadas no Artifact Registry, e a VM as
puxa por digest.** Nada de código-fonte na VM, nada de build na VM. Quem faz
isso são dois scripts, e eles são a única forma suportada:

| Script | O que faz |
|---|---|
| `infra/cd/construir-imagem.sh` | constrói UMA imagem (ou reaproveita a que já existe para a mesma **árvore**), publica no registro, e imprime `ref=` (o digest), `arvore=`, `commit=` e `plataforma=` |
| `infra/cd/implantar.sh` | roda **na VM**, puxa por digest, confere árvore/plataforma/commit, sobe o serviço e confere que o container de pé roda aquele digest |

#### O que este passo deixou de ser, a data, e a queda que ele causou

> **Até 27/10/2026 este passo era `scp` do código-fonte e `docker compose build`
> NA VM.** A lista do `scp` levava `src/`, `migrations/`, `admin/`, `web/`,
> `package.json`, `tsconfig.json` e o `Dockerfile`, e o passo 8 construía lá.
>
> **Em 27/10 isso tirou o hml do ar.** Construir na VM concorre pela memória da
> e2-small com a pilha que está servindo: o build estourou a máquina e derrubou
> o que estava de pé. Não foi azar de um dia — é o que esse procedimento faz
> sempre que o build e a pilha disputam a mesma memória, e a e2-small não tem
> folga para os dois (ADR-0028, ADR-0029).
>
> **E ele tinha um segundo defeito, mais velho e mais silencioso.** `scp
> --recurse` copia por cima e nunca remove: arquivo que saiu do repositório
> continuava na VM e o `tsc` o compilava; migração renumerada continuava com o
> nome antigo e o migrador a aplicava de novo ou morria no `checkOrder`. Por
> isso o procedimento antigo precisava de um `rm -rf -- ./src ./migrations
> ./admin` antes de cada cópia — um `rm -rf` na mão, no host, ao lado do `.env`
> que não tem cópia em lugar nenhum. Em 22/09 a lista do `scp` não levava `src/`
> e o build na VM reconstruiu, **com toda a aparência de sucesso, o código que
> já estava na máquina** (de 19/09): a esteira ficou verde, a imagem subiu, a
> sonda respondeu, e a alteração simplesmente não estava lá.
>
> **Está escrito aqui para ninguém ressuscitá-lo.** Imagem construída aqui e
> promovida por digest não tem nenhum dos dois defeitos: o build não disputa
> memória com a pilha, e o conteúdo da imagem é o da árvore que a construiu,
> conferido dentro do artefato.

#### 7.1 — O commit e a árvore saem DAQUI

`~/bichu` na VM **não é um repositório Git** e nunca foi: não existe `.git` lá.
O commit e a árvore saem desta máquina, onde o repositório existe, e viajam como
valor — nunca como "o que estiver na VM".

```bash
COMMIT=$(git rev-parse HEAD)
ARVORE=$(git rev-parse 'HEAD^{tree}')
echo "commit=$COMMIT arvore=$ARVORE"
# A arvore precisa estar LIMPA: `git status --porcelain` vazio. Arvore suja
# publica uma imagem que nenhum commit descreve.
test -z "$(git status --porcelain)" || echo "REPROVA: arvore suja, nao publique daqui"
```

#### 7.2 — Construir e publicar

```bash
export REGISTRO=southamerica-east1-docker.pkg.dev/bichu-app-508914/bichu
# A chave de SITE do reCAPTCHA entra por NOME, lida do ambiente: o valor nunca
# aparece em argv, em log nem em historico. O script RECUSA construir `admin/`
# sem ela, porque o painel sairia com o login recusando "captcha indisponivel".
set -a; . .env; set +a

bash infra/cd/construir-imagem.sh bichu-app       .            prod
bash infra/cd/construir-imagem.sh bichu-migrador  .            migrador
bash infra/cd/construir-imagem.sh bichu-web       web
bash infra/cd/construir-imagem.sh bichu-admin-web admin
bash infra/cd/construir-imagem.sh bichu-edge      infra/caddy
```

Cada chamada imprime quatro linhas. **Guarde `ref=` e `arvore=` de cada uma: é
o plano.** `commit=` é informativo (ele alimenta a sonda de `/v1/health` e o
histórico); desde 02/11/2026 **quem autoriza o deploy é a árvore, não o commit**
— o porquê está em `divergencia_de_arvore`, em `infra/cd/implantar.sh`.

**A plataforma é explícita e não se herda do ambiente.** O script passa
`--platform linux/amd64` e codifica a arquitetura na tag da árvore. Isso conserta
um defeito medido em 02/11: sem `--platform`, nesta máquina (arm64) ele publicava
**arm64 em silêncio**, e o portão aprovava porque lia o commit rodando o
contêiner sob emulação — e, por causa do chaveamento pela árvore, aquela imagem
arm64 seria **reaproveitada indefinidamente**. O portão novo mede a arquitetura
no **blob de configuração** da imagem, que é o único lugar que não se engana sob
emulação. Para outro destino, `PLATAFORMA=<os>/<arch>`; nunca
`DOCKER_DEFAULT_PLATFORM`.

**Verificação, e ela não custa nada porque o próprio script já a faz:** toda
saída tem `ref=...@sha256:...` (digest, nunca rótulo móvel), `arvore=` igual à
do passo 7.1, e `plataforma=linux/amd64`. Divergência aí é reprovação, não aviso.

#### 7.3 — A release, que é o que viaja

A VM precisa de dois arquivos que **não** vão dentro das imagens: o
`compose.yaml` e a configuração da borda (o `Caddyfile` é **montado**, de
propósito — trocar uma regra de borda é recriar o container, sem reconstruir
imagem). Eles viajam numa release, e só eles.

```bash
tar -czf "/tmp/release-$COMMIT.tar.gz" compose.yaml infra/caddy/Caddyfile infra/caddy/well-known
gcloud compute scp --project=bichu-app-508914 --zone=southamerica-east1-a \
  --tunnel-through-iap "/tmp/release-$COMMIT.tar.gz" bichu-hml:/home/leandropanegassi/bichu/.cd/releases/
```

**Repare no caminho, e ele não é `~`.** O login do `gcloud compute ssh` é
`oi_bichu_app`, e a pilha mora em `/home/leandropanegassi/bichu` — `~/bichu`
resolve para `/home/oi_bichu_app/bichu`, onde a pilha **não** está. Todo comando
deste roteiro na VM leva `BICHU_DIR=/home/leandropanegassi/bichu`. O
`implantar.sh` **recusa** rodar num diretório que não tenha `compose.yaml` e
`.env`, nomeando os candidatos que encontra: ele não adivinha, porque implantar
no diretório errado não dá erro — dá um deploy que ninguém está olhando.

**Verificação:** a release chegou e tem o que precisa.

```bash
gcloud compute ssh bichu-hml --project=bichu-app-508914 \
  --zone=southamerica-east1-a --tunnel-through-iap \
  --command "tar -tzf /home/leandropanegassi/bichu/.cd/releases/release-$COMMIT.tar.gz"
# precisa listar compose.yaml E infra/caddy/Caddyfile. Lista vazia ou sem um
# dos dois e falha: o `implantar.sh` reprova nos dois casos, nomeando o que faltou.
```

#### 7.4 — O `.env` do host, que é do operador e o CD não cria

No host, o `.env` de homologação a partir do `.env.example`, com as diferenças
que importam. **O `implantar.sh` não lê nem escreve este arquivo** (ADR-0022): ele
só recusa rodar onde ele não existe.

| Variável | Valor na VM | Por quê |
|---|---|---|
| `ENVIRONMENT` | `homolog` | `make reset` se recusa a rodar com este valor: apagar volume aqui apaga a massa de teste do QA |
| `PUBLIC_BASE_URL` | `https://hml.bichu.app` | o Caddy escuta na porta que está aqui, e daqui sai o `type` do `problem+json`. **Ele deixou de ser o que o QR codifica em 19/09**: as duas linhas abaixo tiraram esse papel dele (ADR-0017 item 2). Enquanto era um valor só, este campo dizia `https://bichu.app` e estava errado de um jeito perigoso — o apex serve a página da Squarespace, e uma tag gerada assim apontaria para uma página que não é nossa, de forma **irreversível** (ADR-0004) |
| `TAG_BASE_URL` | `https://tag.bichu.app` | **o que o QR codifica e o que vai prensado na plaquinha.** Decisão do cliente de 19/09. É a única variável desta tabela que não se conserta depois: trocar o valor não muda nenhuma tag que já saiu. **`tag.bichu.app` ainda não resolve no DNS**, e enquanto não resolver, toda tag gerada aqui aponta para lugar nenhum. **NÃO IMPRIMA TAG A PARTIR DESTE AMBIENTE.** Confira o valor efetivo antes de gerar **qualquer** código: `docker compose exec -T api printenv TAG_BASE_URL` |
| `WEB_BASE_URL` | `https://hml.bichu.app` | onde o site serve cartaz, página do caso, perfil, conversa do achador e as telas de e-mail e senha (ADR-0017, ADR-0028). É a base dos links dos e-mails. Reversível: trocar aqui muda o link do próximo e-mail e nada mais. **O valor depende do ambiente** e esta tabela é a da VM de homologação; a de produção é `https://bichu.app` (ADR-0029 seção 7). **Corrigido em 28/09, por decisão do cliente:** esta linha prescrevia o apex, e o apex **ainda é da Squarespace** — um link de verificação enviado de homologação levava o usuário para a página de um terceiro, o que é pior do que um 404 nosso. **Atualizado em 18/10/2026: o link RESPONDE 200 em `hml.bichu.app`.** Os dois motivos do 404 anterior deixaram de valer: `web/src/pages/` passou a ter `verificar-email.astro`, `redefinir-senha.astro`, `termos.astro` e `privacidade.astro` (entre outras), e `BORDA_RESTO_DA_APP=site` foi acrescentada ao `.env` de homologação — sem ela as páginas existiam e a borda nunca chegava no container `web`, o que custou dois dias de links de termos e de política quebrados. Ver o passo 15. Conferir junto com a de cima: `docker compose exec -T api printenv WEB_BASE_URL`. A aplicação **recusa subir** se esta e a de cima estiverem em domínios registráveis diferentes |
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

### Passo 8 — Implantar na VM **por digest**, com as URLs sempre por NOME

Esta é a linha que a ordem de 16.1 protege, e a razão de o roteiro existir.

Nada é construído aqui. A VM puxa o digest que o passo 7.2 imprimiu, confere a
**árvore** dentro da imagem, confere a **plataforma** no blob de configuração,
sobe o serviço e confere que o container que ficou de pé roda **aquele** digest.

#### As URLs vão por NOME, e nunca pelo IP

> **Até 27/10/2026 este passo mandava subir com `PUBLIC_BASE_URL="http://$IP"` e
> `MEDIA_PUBLIC_BASE_URL="http://$IP:3001"`.** Isso **quebra o MinIO**: ele
> **assina a URL com o host pelo qual ele se conhece**, então uma base apontada
> para o IP produz assinatura que não fecha com o host pelo qual o cliente
> chega, e o erro que aparece é de assinatura — não diz que é de host, e manda
> procurar na credencial. Testar a pilha por IP parecia prudente e custou dias de
> diagnóstico no lugar errado.
>
> As bases ficam com o valor do `.env` do host, que é por nome. Quem testa por
> IP é a sonda da borda (abaixo), que bate na porta publicada sem mexer em base
> nenhuma — e é justamente o que ela precisa fazer.

`TAG_BASE_URL` e `WEB_BASE_URL` também não entram em linha de comando, e isso é
ainda mais sério: o endereço do QR fica no plástico, e a máquina troca de IP
quando alguém a recria. A aplicação recusa subir com `TAG_BASE_URL` e
`WEB_BASE_URL` em domínios registráveis diferentes (ADR-0017 item 2), o que
também acusaria um IP copiado para lá por distração.

#### 8.1 — A api (migrador + api + worker)

O worker **para antes** de migrar (ADR-0029 seção 2): com ele de pé a migração
soma 256 MB à pilha inteira e passa da máquina, e o worker parado não perde nada
porque o trabalho está na tabela `jobs`.

```bash
VM="gcloud compute ssh bichu-hml --project=bichu-app-508914 --zone=southamerica-east1-a --tunnel-through-iap"

$VM --command "cd /home/leandropanegassi/bichu && \
  BICHU_DIR=/home/leandropanegassi/bichu \
  ACAO=implantar SERVICO=api \
  COMMIT=$COMMIT \
  REF_APP=<ref= do bichu-app> ARVORE_APP=<arvore= do bichu-app> \
  REF_MIGRADOR=<ref= do bichu-migrador> ARVORE_MIGRADOR=<arvore= do bichu-migrador> \
  RELEASE=/home/leandropanegassi/bichu/.cd/releases/release-$COMMIT.tar.gz \
  bash infra/cd/implantar.sh"
```

#### 8.2 — Site, backoffice, mídia e borda, um por vez

```bash
# web, admin, midia: a mesma forma, trocando SERVICO/REF/ARVORE
$VM --command "cd /home/leandropanegassi/bichu && \
  BICHU_DIR=/home/leandropanegassi/bichu \
  ACAO=implantar SERVICO=web COMMIT=$COMMIT REF=<ref=> ARVORE=<arvore=> \
  RELEASE=/home/leandropanegassi/bichu/.cd/releases/release-$COMMIT.tar.gz \
  bash infra/cd/implantar.sh"
```

**`SERVICO=midia` entrou em 02/11/2026, e o motivo é medido.** O leitor da mídia
pública usa a **mesma imagem** da api (`bichu-app`, outro comando), mas não tinha
nome no CD — então nenhum caminho o alcançava. Resultado: em 02/11 o
`bichu-midia-1` rodava `bichu-app:local` carimbado em **d5c382dc, de 27/10**,
seis dias atrás, enquanto api e worker seguiam adiante. A borda depende dele
(`depends_on: midia`). O `implantar.sh` agora **avisa** quando a api vai adiante
e o `midia` não está sob o CD, e **reprova** quando ele está sob o CD num digest
diferente: metade do backend num commit e metade em outro não é estado que
alguém escolheu.

**Antes de aplicar qualquer um deles, veja o plano sem executá-lo:**

```bash
ACAO=conferir-plano SERVICO=midia COMMIT=$COMMIT REF=<ref=> ARVORE=<arvore=> \
  RELEASE=<tar> BICHU_DIR=/home/leandropanegassi/bichu bash infra/cd/implantar.sh
# Nao puxa, nao sobe, nao grava nada, e nao precisa de docker: imprime o
# digest, a arvore, a linha que iria para o compose.override.yaml, os seis
# passos na ordem, e o que NAO seria tocado.
```

A borda é a última, e tem três cuidados que um CD genérico erra: o `Caddyfile`
é montado (então o que se compara é imagem **+** hash da configuração), recriá-la
derruba todos os hosts e zera o contador de taxa (em memória), e o site precisa
estar saudável **antes** (ADR-0028: senão o apex dá 502). `implantar.sh` trata os
três; ela só é recriada quando imagem **ou** configuração mudam.

```bash
$VM --command "cd /home/leandropanegassi/bichu && \
  BICHU_DIR=/home/leandropanegassi/bichu \
  ACAO=implantar SERVICO=borda COMMIT=$COMMIT REF=<ref=> ARVORE=<arvore=> \
  HOST_SONDA=hml.bichu.app \
  RELEASE=/home/leandropanegassi/bichu/.cd/releases/release-$COMMIT.tar.gz \
  bash infra/cd/implantar.sh"
```

#### 8.3 — Verificação em quatro camadas, porque elas falham de jeitos diferentes

```bash
# 1. os limites de memória VALEM. `deploy.resources` fora do Swarm é ignorado
#    em silêncio, e o arquivo parece correto do mesmo jeito.
docker stats --no-stream --format 'table {{.Name}}\t{{.MemUsage}}'
# a coluna de limite precisa mostrar 640MiB no db e 448MiB no worker,
# e NÃO a memória total da máquina

# 2. as migrações aplicadas batem com as que a IMAGEM do migrador conhece.
#    O `implantar.sh` já faz esta comparação e reprova nos dois sentidos
#    (migração da imagem que não aplicou; migração aplicada que a imagem não
#    conhece). A conferência é com a LISTA, nunca com um número fixo: número
#    fixo aqui vira mentira na próxima migração e ninguém percebe.
docker compose logs migracao | tail -5

# 3. a borda responde o que o contrato promete, PELA PORTA PUBLICADA.
#    AQUI o IP é legítimo: a sonda bate na porta, não configura base nenhuma.
python3 infra/verificacao/verificar_borda_local.py "http://$IP" .

# 4. o artefato NO AR e o commit que voce pediu -- nao um qualquer, e nao nulo
node infra/verificacao/verificar-commit-no-health.mjs "https://hml.bichu.app" "$COMMIT"
```

A quarta é a que fecha o buraco de 22/09, e ela não custa nada porque já existe:
`verificar-commit-no-health.mjs` (BICHUS-210) reprova `null`, `''` e rótulo móvel
(`latest`, `HEAD`, `unknown`), e **compara o commit que a sonda reporta com o
commit passado como segundo argumento**, dizendo os dois valores quando diferem.
Sem o segundo argumento ela só confere que há um valor, e é exatamente a metade
que deixa passar o artefato velho: uma imagem construída de um `src/` de três
dias atrás reporta um commit perfeitamente bem-formado. **Passe sempre o
`$COMMIT`.** Ela também tem alvo no `Makefile`
(`make verificar-commit-de-build`) e roda as próprias iscas antes de consultar a
rede: se ela perder a capacidade de reprovar, falha em vez de aprovar.

A terceira é a que pega a família de defeito que nenhuma leitura de arquivo
pega: **a regra escrita e não valendo**. Foi exatamente o que houve em 17/09 — o
`Caddyfile` tinha os dois blocos de associação e `/srv/well-known` não estava
montado, e o `file_server` respondia 404 com `Content-Type: application/json`,
um 404 que parece um arquivo. Sonda batida de dentro do contêiner não pega isso:
por dentro o serviço servia `/.well-known/jwks.json` com 200 o tempo inteiro.

**Não siga para a Parte B enquanto esta terceira verificação não imprimir
`APROVADO`.** Os dois avisos sobre lista vazia são esperados até os insumos da
Apple e do APK chegarem (ver adiante); qualquer `REPROVA` não é.

#### 8.4 — As iscas do CD, e elas rodam ANTES de qualquer subida

```bash
ACAO=autoteste bash infra/cd/implantar.sh   # as funcoes puras, sem docker
bash infra/cd/isca-digest-errado.sh         # o caminho real, com registro local
```

A segunda publica imagens mínimas num registro descartável e confere que árvore
errada, imagem sem carimbo de árvore, plano sem árvore e plataforma errada
**reprovam nomeando o motivo**, e que o **reaproveitamento legítimo** (outro
commit, mesma árvore) e a plataforma certa **passam**. Portão que reprova tudo
não verifica nada: cada reprovação ali tem controle positivo do lado.

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

### Passo 11.1 — `admin-hml.bichu.app`, o backoffice (ADR-0027)

> **Em qual máquina, e qual nome.** Pelo ADR-0029, homologação e produção ficam
> em VMs separadas: `admin.bichu.app` é o nome de **produção** (`bichu-prod`), e
> homologação tem o seu próprio, `admin-hml.bichu.app`. Em 23/09 `bichu-prod`
> **não existe** (`gcloud compute instances list` lista só `bichu-hml`); os
> passos abaixo valem igual nas duas, trocando o nome.
>
> **Corrigido em 02/11/2026.** Este passo prescrevia `admin.bichu.app` em tudo —
> no `ADMIN_HOSTS` e nas seis linhas da verificação. Medido no mesmo dia:
> `admin.bichu.app` **não resolve** em DNS (`dig +short` volta vazio), enquanto
> `admin-hml.bichu.app`, `hml.bichu.app`, `midia-hml.bichu.app` e `bichu.app`
> resolvem todos para o IP da `bichu-hml` — ou seja, o vazio é ausência de
> registro, e não falha de consulta. O `ADMIN_HOSTS` efetivo na VM é
> `admin-hml.bichu.app`. Seguir o documento ao pé da letra punha no `.env` um
> nome que não existe, e o Caddy ficaria tentando emitir certificado por HTTP-01
> para um host que ninguém resolve.

O backoffice é o container `admin-web`, atrás da mesma borda, na mesma origem
que `/v1/admin/*`. A borda é imagem própria (plugin de taxa, emenda 2 do
ADR-0016), e desde 27/10/2026 **ela não é construída no host**: as duas imagens
vêm do registro, pelo passo 7, e a VM as puxa por digest.

**Ordem que não se inverte: configuração, depois DNS.** O certificado sai por
HTTP-01, e o Caddy só tenta emitir para nome que esteja num bloco. Nome no DNS
sem bloco é falha de handshake em domínio `.app` pré-carregado em HSTS, sem
`http://` para diagnosticar.

1. Com a release do passo 7.3 no host, no `.env`:

   ```bash
   ADMIN_HOSTS=https://admin-hml.bichu.app   # em producao: https://admin.bichu.app
   # A chave de SITE do reCAPTCHA Enterprise, publica, e build arg do admin-web
   # (sem ela o login do painel recusa). O mesmo valor de CAPTCHA_SITE_KEY.
   VITE_CAPTCHA_SITE_KEY=<chave de site do reCAPTCHA>
   # ADMIN_CSP_UPLOAD=<host público de UploadIntent.url>  -- quando decidido;
   # vazio, o envio de imagem pelo painel fica bloqueado pela CSP
   ```

2. Construir e recriar **só** os dois serviços. Recriar a borda derruba as
   conexões abertas por alguns segundos, em todos os hosts: faça fora de uso.

   **A VM não tem Git** (passo 8): `git rev-parse` lá devolve vazio. O commit
   sai **da máquina local**, de onde os arquivos saíram, e vai na linha:

   ```bash
   COMMIT=$(git rev-parse HEAD)     # AQUI, no repositorio local. Nao na VM.
   echo "$COMMIT"
   ```

   As duas imagens são construídas **aqui** e publicadas (passo 7.2), e a VM as
   puxa por digest. Nada de `docker compose build` na VM: em 27/10/2026 construir
   na VM tirou o hml do ar, porque o build disputa a memória da e2-small com a
   pilha que está servindo.

   ```bash
   # AQUI
   bash infra/cd/construir-imagem.sh bichu-admin-web admin        # exige VITE_CAPTCHA_SITE_KEY
   bash infra/cd/construir-imagem.sh bichu-edge      infra/caddy

   # NA VM, uma por vez, o painel antes da borda
   $VM --command "cd /home/leandropanegassi/bichu && BICHU_DIR=/home/leandropanegassi/bichu \
     ACAO=implantar SERVICO=admin COMMIT=$COMMIT REF=<ref=> ARVORE=<arvore=> \
     RELEASE=/home/leandropanegassi/bichu/.cd/releases/release-$COMMIT.tar.gz \
     bash infra/cd/implantar.sh"
   $VM --command "cd /home/leandropanegassi/bichu && BICHU_DIR=/home/leandropanegassi/bichu \
     ACAO=implantar SERVICO=borda COMMIT=$COMMIT REF=<ref=> ARVORE=<arvore=> \
     HOST_SONDA=hml.bichu.app \
     RELEASE=/home/leandropanegassi/bichu/.cd/releases/release-$COMMIT.tar.gz \
     bash infra/cd/implantar.sh"

   docker compose run --rm --no-deps --entrypoint caddy edge list-modules --skip-standard
   # esperado: um único módulo não-padrão, http.handlers.rate_limit
   ```

   A partir daqui, e **antes do DNS**, `/v1/admin*` já responde 404 da borda
   nos hosts do app (D33):

   ```bash
   curl -sS -o /dev/null -w '%{http_code} %{content_type}\n' https://hml.bichu.app/v1/admin/ping
   # 404 text/plain -- com application/problem+json quem respondeu foi a API
   ```

3. O registro, **em nuvem cinza** (sem proxy): o teto de taxa é por IP de quem
   conecta na borda, e com proxy todo mundo teria o IP da Cloudflare. A zona
   `bichu.app` está na Cloudflare (`aurora`/`wesley.ns.cloudflare.com`).

   ```bash
   # O token de DNS esta no Secret Manager (`CLOUDFLARE_DNS_TOKEN`), lido para
   # a variavel sem passar por tela nem historico. IP_PROD = o do `bichu-prod-ip`.
   CF_API_TOKEN=$(gcloud secrets versions access latest --secret=CLOUDFLARE_DNS_TOKEN --project=bichu-app-508914)
   IP_PROD=$(gcloud compute addresses describe bichu-prod-ip --region=southamerica-east1 --project=bichu-app-508914 --format='value(address)')
   ZONA=$(curl -sS "https://api.cloudflare.com/client/v4/zones?name=bichu.app" \
     -H "Authorization: Bearer $CF_API_TOKEN" | jq -r '.result[0].id')
   curl -sS -X POST "https://api.cloudflare.com/client/v4/zones/$ZONA/dns_records" \
     -H "Authorization: Bearer $CF_API_TOKEN" -H "Content-Type: application/json" \
     --data "{\"type\":\"A\",\"name\":\"admin\",\"content\":\"$IP_PROD\",\"ttl\":300,\"proxied\":false,\"comment\":\"backoffice admin-web (ADR-0027)\"}" \
     | jq '{success, errors, id: .result.id, proxied: .result.proxied}'
   ```

   Só o `A`. Sem `AAAA` (a VM não tem IPv6, e `AAAA` órfão leva o cliente IPv6
   para lugar nenhum) e sem mexer em nenhum outro registro.

**Implantação de versão nova do backoffice** (depois da primeira): o
`admin-web` não tem banco, não tem segredo e não tem estado, então implantar é
reconstruir a imagem e recriar só ele. Guardar a imagem que está no ar ANTES,
com o commit dela, é o que torna o retorno um comando só:

O ponto de retorno não é mais uma tag local: **é o histórico do CD.** Cada
`implantar` empilha uma linha em `.cd/historico`, e `reverter` desempilha — duas
reversões voltam duas implantações (Z → Y → X), e não alternam entre as duas
últimas.

```bash
# avançar: o mesmo comando do item 2 acima, com o ref/arvore novos
# conferir o que esta de pe:
docker run --rm --entrypoint cat "$(docker compose images -q admin-web)" /etc/bichu/commit; echo
```

A borda só muda de imagem quando `infra/caddy/Dockerfile` muda; mudança só no
Caddyfile viaja na release e o `implantar.sh` recria a borda sozinho quando
imagem **ou** hash da configuração mudam — e **não** recria quando os dois são
iguais aos de pé, porque recriar derruba as conexões de todos os hosts e zera o
contador de taxa (que é em memória).

**Retorno (rollback)**, sem rede nova e sem build:

```bash
$VM --command "cd /home/leandropanegassi/bichu && BICHU_DIR=/home/leandropanegassi/bichu \
  ACAO=reverter SERVICO=admin bash infra/cd/implantar.sh"
# e, para a borda, SERVICO=borda: ela volta pela release guardada em
# .cd/releases/<commit>.tar, de onde sai o Caddyfile anterior. Nao ha `git show`
# nem `scp` no caminho: a VM nao tem Git, e a release e o que guarda a
# configuracao de cada implantacao.
```

Retirar o backoffice do ar inteiro sem tocar nos outros hosts continua sendo
`ADMIN_HOSTS=http://admin.localhost` no `.env` e recriar o `edge` (o nome some da
borda; o registro DNS pode ficar).

O retorno é testado em homologação antes da primeira implantação de produção:
implantar um commit, voltar, e conferir o commit servido. E as iscas do CD
(passo 8.4) rodam antes de qualquer subida: elas provam que digest de outra
árvore reprova e que o reaproveitamento legítimo passa.

**Verificação:**

```bash
# O NOME E O DE HOMOLOGACAO. `admin.bichu.app` nao resolve (medido em 02/11) e
# e o nome de producao; em `bichu-prod`, troque ADMIN por `admin.bichu.app`.
ADMIN=admin-hml.bichu.app
dig +short "$ADMIN" @1.1.1.1          # = o IP desta VM, e só ele
dig +short AAAA "$ADMIN" @1.1.1.1     # vazio
# CONTROLE POSITIVO da consulta: um nome que SABIDAMENTE resolve. Sem ele, um
# `dig` vazio nao distingue "nao existe" de "nao consegui perguntar".
dig +short hml.bichu.app @1.1.1.1     # precisa imprimir o IP
docker compose logs edge | grep -i "$ADMIN" | grep -i 'certificate obtained'
curl -sSI "https://$ADMIN/" | grep -iE '^(HTTP|strict-transport|content-security|x-robots|cache-control)'
# 200, HSTS, CSP sem unsafe-* e sem google, X-Robots-Tag noindex, no-store
curl -sSI "https://$ADMIN/v1/health" | head -1        # 404: o host admin não é a API inteira
for i in $(seq 11); do curl -s -o /dev/null -w '%{http_code} ' -X POST "https://$ADMIN/v1/admin/auth/login"; done; echo
# os dez primeiros NÃO são 429; o 11º é 429 (espere 1 min antes de repetir)
```

---

### Passo 11.2 — `midia-hml.bichu.app`, o envio de foto pelo navegador e pelo app (07-devops 17.5)

Até aqui a autorização de envio e a leitura assinada saíam com
`OBJECT_STORAGE_ENDPOINT=http://objeto:9000`, que nenhum cliente resolve: o
painel tinha o envio bloqueado pela CSP, e o app nunca enviou uma foto em hml
(`pet_photos` vazia, nenhuma chamada de mídia no log da `api` em 7 dias,
medido em 07/10). Um host próprio resolve os dois, sem tocar na origem de
mídia pública, cujo invariante é nunca ver URL assinada.

**Ordem: configuração, depois DNS** (HTTP-01, como no 11.1).

1. No `.env` do host, os três juntos:

   ```bash
   OBJECT_STORAGE_PUBLIC_ENDPOINT=https://midia-hml.bichu.app
   MEDIA_UPLOAD_HOSTS=https://midia-hml.bichu.app
   ADMIN_CSP_UPLOAD=https://midia-hml.bichu.app
   ```

   `ADMIN_ORIGIN` já está no `.env`, e o compose a repassa ao `objeto` como
   `MINIO_API_CORS_ALLOW_ORIGIN`: só o painel passa na pré-verificação.

2. Recriar `objeto` (CORS), `api` e `worker` (endereço público) e `edge` (bloco
   novo). O `objeto` volta em segundos; a borda derruba conexões de todos os
   hosts por alguns segundos.

   ```bash
   BUILD_COMMIT="$COMMIT" docker compose up -d --no-build --no-deps --wait objeto api worker edge
   ```

3. DNS (cliente): `A midia-hml` → `35.247.247.16`, TTL 300, **sem proxy**, sem `AAAA`.

**Verificação:**

```bash
docker compose logs edge | grep -i 'midia-hml.bichu.app' | grep -i 'certificate obtained'
curl -sS -o /dev/null -w '%{http_code}\n' https://midia-hml.bichu.app/bichu-media-private/x   # 404 da borda: sem assinatura
curl -sS -o /dev/null -w '%{http_code}\n' https://midia-hml.bichu.app/bichu-media-public/x    # 404 da borda: bucket publico nao passa aqui
curl -sSI -X OPTIONS https://midia-hml.bichu.app/bichu-media-private \
  -H 'Origin: https://admin-hml.bichu.app' -H 'Access-Control-Request-Method: POST' \
  | grep -i 'access-control-allow-origin'                                                   # = https://admin-hml.bichu.app
curl -sSI -X OPTIONS https://midia-hml.bichu.app/bichu-media-private \
  -H 'Origin: https://exemplo.com' -H 'Access-Control-Request-Method: POST' \
  | grep -ci 'access-control-allow-origin'                                                  # 0
```

E de ponta a ponta: uma foto enviada pelo painel (encontro ou produto) e uma
pelo app (pet) chegam a `catalog_images` / `pet_photos` com estado `ready`.

---

### Passo 11.3 — Imagens no armazenamento gerenciado (ADR-0007 Emenda 1)

Substitui o 11.2 em hml: o envio vai direto ao gerenciado, e `midia-hml` não
é criado. Buckets, CORS e ciclo de vida já existem (criados em 07/10):
`bichu-hml-media-private` (prevenção de acesso público imposta, CORS só para
`https://admin-hml.bichu.app`) e `bichu-hml-media-public`.

1. **Cliente** (IAM e HMAC; o segredo vai do `gcloud` direto para o `.env` da
   VM, sem tela e sem agente): ver o bloco no relatório de 07/10 ou
   `docs/07-devops.md`.
2. No `.env` do host (o HMAC já escrito pelo passo 1):

   ```bash
   OBJECT_STORAGE_ENDPOINT=https://storage.googleapis.com
   OBJECT_STORAGE_PUBLIC_ENDPOINT=https://storage.googleapis.com
   OBJECT_STORAGE_REGION=southamerica-east1
   OBJECT_STORAGE_SIGNATURE_DIALECT=goog
   OBJECT_BUCKET_PRIVATE=bichu-hml-media-private
   OBJECT_BUCKET_PUBLIC=bichu-hml-media-public
   ADMIN_CSP_UPLOAD=https://storage.googleapis.com
   ```

   `OBJECT_STORAGE_ACCESS_KEY_ID`/`SECRET` passam a ser o HMAC. ANTES de
   trocá-las, copie as antigas para `MIGRACAO_MINIO_ID`/`MIGRACAO_MINIO_SEGREDO`:
   o `objeto` não é recriado e segue com elas, e o script de migração as lê.
3. Migração (copia, preserva chave; ensaio primeiro):
   `infra/ferramentas/migrar-objetos-para-o-gcs.sh` e depois `--aplicar`.
4. Recriar `api`, `worker`, `edge` e subir o `midia` (o leitor da mídia pública:
   a organização recusa `allUsers`, e a leitura vai autenticada).

**Verificação:** `curl -sI https://img-hml.bichu.app/` → 404 (a raiz não
lista); uma foto pelo painel e uma pelo app chegam a `ready`, e a derivada
abre em `https://img-hml.bichu.app/{categoria}/card/...`.

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

### Passo 14 — Conta administrativa do backoffice (ADR-0027 item 20.3; D43, D51, D61, D63)

O painel tem **cadastro próprio** (`admin_accounts`), separado das contas do app
(item 20): uma conta do app nunca entra no painel, e uma do painel nunca entra
no app. Conta do painel **não se cria nem se redefine por tela** (D51, D61): é
um comando no servidor, que só quem entra na máquina roda, e que grava cada
escrita em `audit.events` com `actor_kind = 'system'` e o nome de quem rodou em
`metadata.operator`, na mesma transação.

**A senha é do cliente, e só dele.** Quem digita a senha de uma conta do painel
é a pessoa que vai usá-la, no terminal, na hora. **Nenhum agente gera, grava,
lê ou digita essa senha, e nenhum roteiro de agente roda `criar`,
`redefinir-senha` ou `reativar`.** A senha é pedida **duas vezes, sem eco**, e
nunca entra por argumento, variável de ambiente ou arquivo: o comando recusa
`--senha`, `--password`, `-p` e afins pelo **nome**, sem repetir o valor, e
recusa rodar sem terminal. Se alguém digitou a senha como argumento, ela ficou
no histórico do shell: escolha outra.

O `-it` é obrigatório. Sem ele não há terminal, e o comando sai com código 2
antes de perguntar qualquer coisa.

```bash
# criar a conta do painel (pede "sim" e a senha duas vezes)
docker compose run --rm -it api node dist/bin/conta-admin.js criar \
  --email operacao@exemplo.com.br --nome "Nome que aparece no painel" --operador "Nome de quem roda"

# redefinir a senha: encerra todas as sessoes e remove o bloqueio (dez falhas ou "nao fui eu")
docker compose run --rm -it api node dist/bin/conta-admin.js redefinir-senha --email <e-mail>

# desativar (a conta nao se apaga; as sessoes caem na hora)
docker compose run --rm -it api node dist/bin/conta-admin.js desativar --email <e-mail>

# reativar: volta a ativa COM senha nova, digitada no mesmo passo
docker compose run --rm -it api node dist/bin/conta-admin.js reativar --email <e-mail>

# encerrar todas as sessoes sem mexer na senha
docker compose run --rm -it api node dist/bin/conta-admin.js encerrar-sessoes --email <e-mail>

# listar: e-mail, nome, estado, bloqueio e ultimo login (nunca o hash)
docker compose run --rm -it api node dist/bin/conta-admin.js listar

# ajuda
docker compose run --rm api node dist/bin/conta-admin.js --ajuda
```

A senha de conta do painel segue D43: **mínimo de 15 caracteres, máximo de 256**,
sem regra de composição, recusada se parecer com o e-mail, e **conferida contra
a base pública de senhas vazadas**. A consulta manda para fora só os 5 primeiros
caracteres hexadecimais do SHA-1 da senha (k-anonimato), e exige saída HTTPS do
container da `api` para `api.pwnedpasswords.com`. **Sem essa saída, a senha é
recusada e nada é gravado.** Pela D63, ela também é recusada se for **a mesma
senha da conta do app com o mesmo e-mail**: quem descobrir uma não pode ganhar a
outra. Só o hash vai para o banco, no mesmo esquema do login (PBKDF2-SHA512 em
PHC).

**Recuperação de senha (item 20.4):** não existe link por e-mail. Quem esqueceu
a senha, foi bloqueado por dez falhas em 24 horas, ou clicou "não fui eu", pede
ao responsável, que roda `redefinir-senha`, e a pessoa digita a senha nova.

`criar`, `redefinir-senha`, `desativar` e `reativar` **avisam por e-mail todos os
administradores ativos**, e `criar` avisa também o dono do endereço novo. Falha
de envio não desfaz a escrita: o comando diz no terminal quem não recebeu. É o
que faz uma conta criada por quem tomou a máquina aparecer na caixa de alguém.

Códigos de saída, para quem roda por roteiro:

| Código | Significado |
|---|---|
| 0 | feito, ou nada a fazer (a conta já estava desativada, ou já ativa) |
| 1 | erro inesperado (a mensagem traz nome e código do erro, nunca a linha do banco) |
| 2 | uso: subcomando ou opção inválida, senha por argumento, sem terminal |
| 3 | não há conta administrativa com esse e-mail; **nada é criado** |
| 4 | senha recusada: curta, longa, vazada, igual à do app, digitações diferentes, ou base de vazadas inalcançável |
| 5 | cancelado: a confirmação não foi `sim`, ou Ctrl-C |
| 6 | conflito: `criar` para e-mail que já tem conta do painel |

**Verificação:** a trilha registra quem, quando e o quê, e **nunca** a senha.

```bash
docker compose exec -T db psql -U bichu -d bichu -c "
  select occurred_at, action, actor_kind, metadata->>'operator' as operador, before, after
    from audit.events
   where action like 'admin.account.%'
   order by occurred_at desc limit 10"
# esperado: actor_kind = system, operador preenchido, resource_kind = admin_account
```

### Passo 15 — O site (container `web`), e o corte dos hosts para ele

Decisão do cliente de 23/09/2026 e ADR-0028: o site (institucional e páginas
públicas) é um container Astro com renderização no servidor, **nesta mesma
VM**, em **imagem separada** da API (`web/Dockerfile`), atrás da mesma borda.
O mecanismo de implantação é o dos passos 7 e 8, e não outro: a imagem é
construída **aqui**, publicada no registro e puxada **por digest** pela VM.

> **Corrigido em 27/10/2026.** Este trecho dizia "os arquivos vão para o host e o
> compose constrói lá. Não há registry no caminho" — e mandava `scp ./web` mais
> `docker compose build web` na VM. Há registry no caminho desde que `infra/cd/`
> entrou, e construir na VM tirou o hml do ar em 27/10, porque o build disputa a
> memória da e2-small com a pilha que está servindo.

**Implantar ou atualizar o site** (não toca API, banco nem borda):

```bash
# AQUI
bash infra/cd/construir-imagem.sh bichu-web web      # imprime ref= e arvore=

# NA VM. `BICHU_DIR` e obrigatorio: o login do ssh e `oi_bichu_app`, e a pilha
# mora em /home/leandropanegassi/bichu -- `~/bichu` resolve para o `~` errado.
$VM --command "cd /home/leandropanegassi/bichu && BICHU_DIR=/home/leandropanegassi/bichu \
  ACAO=implantar SERVICO=web COMMIT=$COMMIT REF=<ref=> ARVORE=<arvore=> \
  RELEASE=/home/leandropanegassi/bichu/.cd/releases/release-$COMMIT.tar.gz \
  bash infra/cd/implantar.sh"
```

A espera por saudável é a metade que importa, e o `implantar.sh` a faz: a borda
só pode passar a mandar um host para o `web` depois de ele estar saudável. Na
ordem contrária o host responde 502. Ele também reprova quando o serviço não
declara `healthcheck`: sem sonda, "subiu" não quer dizer nada.

**`BORDA_RESTO_DA_APP=site` no `.env` do host é OBRIGATÓRIA enquanto
`WEB_BASE_URL` e `PUBLIC_BASE_URL` forem o mesmo host.** Em homologação os dois
são `https://hml.bichu.app`, então o site não tem host próprio ali: sem a
linha, o catch-all do bloco da aplicação é `resto_fechado` e **todas** as
páginas do site respondem `404 nao encontrado` em `text/plain` — `/termos`,
`/privacidade`, `/`, `/verificar-email` e `/redefinir-senha` — com as páginas
existindo em `web/src/pages/` e o container `web` saudável. **Essa ausência
custou dois dias de links de termos e de política quebrados no aparelho do
cliente (corrigido em 18/10/2026):** o padrão `fechado` protege contra
vazamento de rota, não contra link quebrado, e só é o valor certo onde o site
tem host próprio em `SITE_HOSTS`. Os dois únicos valores são `site`
(`resto_site`, vai para `web:4321`) e `fechado` (`resto_fechado`, 404);
qualquer outro **não sobe a borda**, de propósito.

A borda roda com `admin off`, então **não há `caddy reload`**, e variável de
ambiente só entra em container novo. Validar primeiro, sem escrever segredo em
arquivo nenhum, e só então recriar **somente** o `edge`:

```bash
# com a linha já acrescentada ao .env (acrescentar, nunca sobrescrever: confira
# o sha256 antes e depois e exija que a única diferença seja essa linha)
docker compose exec -e BORDA_RESTO_DA_APP=site -T edge caddy validate --config /etc/caddy/Caddyfile
docker compose up -d --no-deps edge   # recria SÓ a borda; nunca --remove-orphans
```

**Verificação, de fora, pelas cinco URLs** — nenhuma pode devolver
`nao encontrado` em `text/plain`:

```bash
for u in /termos /privacidade / /verificar-email /redefinir-senha; do
  curl -sS -o /dev/null -w "$u %{http_code} %{content_type}\n" "https://hml.bichu.app$u"
done
# esperado: 200 text/html nas quatro primeiras; /redefinir-senha é HTML também
# (400 sem token, 410 com token inválido — é a validação da própria página)
curl -sS https://hml.bichu.app/v1/health            # 200, status ok, commit inalterado
curl -sS -o /dev/null -w '%{http_code}\n' https://hml.bichu.app/v1/admin/ping   # 404 DA BORDA
```

`/v1/*` **não** regride: `import gateway_v1` vem antes do catch-all no bloco, e
`/v1/admin*` continua 404 da borda. Se alguma rota de `/v1` passar a devolver
HTML do site, a ordem do bloco foi invertida e isso é defeito grave.

**O preço de `site` neste bloco:** o valor vale para o BLOCO INTEIRO da
aplicação, então **todo nome em `HOSTS_EXTRA_APP` passa a servir o site junto**
— hoje `bichu.app` e `tag.bichu.app`. Confira a lista antes de aplicar, e
decida com o cliente se publicar o site nesses nomes é desejado agora ou se o
caminho é o corte abaixo.

Enquanto as variáveis `SITE_*` não estiverem no `.env`, os blocos do site na
borda existem só com os nomes de teste (`site.localhost`, `tag.localhost`,
`www.localhost`), que nenhum DNS resolve. `bichu.app` e `tag.bichu.app`
continuam em `HOSTS_EXTRA_APP`, respondendo como hoje.

**Verificação — o site responde pela rede interna, e nada público mudou:**

```bash
docker compose exec -T web node -e "fetch('http://web:4321/healthz').then(r=>console.log(r.status))"   # 200
curl -sS -o /dev/null -w '%{http_code} %{content_type}\n' https://bichu.app/   # 404 text/plain ENQUANTO BORDA_RESTO_DA_APP estiver ausente; com `site` o apex passa a servir o site, porque ele está em HOSTS_EXTRA_APP
curl -sS https://hml.bichu.app/v1/health                                       # 200, status ok
```

**Ensaiar a tabela do ADR-0028 sem tocar a borda que está no ar.** Uma borda
descartável, na mesma rede do compose, com a configuração do corte e
certificado interno (`local_certs`, só na cópia de ensaio): ela alcança o `web`
e a `api` reais, não publica 80 nem 443, e some ao final.

```bash
sed 's/^\tadmin off$/\tadmin off\n\tlocal_certs/' infra/caddy/Caddyfile > /tmp/Caddyfile.ensaio
docker run -d --name borda-ensaio --network bichu_default -p 127.0.0.1:18443:443 \
  -v /tmp/Caddyfile.ensaio:/etc/caddy/Caddyfile:ro -v "$PWD/infra/caddy/well-known:/srv/well-known:ro" \
  -e PUBLIC_BASE_URL=https://hml.bichu.app -e 'HOSTS_EXTRA_APP=, https://api.bichu.app' \
  -e MEDIA_PUBLIC_BASE_URL=https://img-hml.bichu.app -e 'HOSTS_EXTRA_MIDIA=, https://img.bichu.app' \
  -e OBJECT_BUCKET_PUBLIC=bichu-media-public -e SITE_HOSTS=https://bichu.app \
  -e SITE_TAG_HOSTS=https://tag.bichu.app -e SITE_WWW_HOSTS=https://www.bichu.app \
  -e SITE_BASE_URL=https://bichu.app \
  caddy:2.8-alpine@sha256:af32e97399febea808609119bb21544d0265c58a02836576e32a2d082c262c17
curl -sk -o /dev/null -w '%{http_code} %{content_type}\n' --resolve bichu.app:18443:127.0.0.1 https://bichu.app:18443/
docker rm -f borda-ensaio
```

**O corte.** Só quando o site real existir; o placeholder técnico **não** vai
para `bichu.app`. `bichu.app` e `tag.bichu.app` já resolvem para esta máquina
e já têm certificado no volume `caddy_dados`, então para eles o corte é só de
configuração. `www` e `api` ainda não resolvem: configuração primeiro, DNS
logo depois, na mesma janela.

0. `compose.yaml` e `infra/caddy/Caddyfile` do host são os deste repositório
   (o serviço `edge` repassa as variáveis `SITE_*` e `BORDA_RESTO_DA_APP`).
   Com o `compose.yaml` antigo, as variáveis abaixo não chegam à borda.
1. `docker compose up -d --no-deps --wait web` e `web` saudável.
2. No `.env` do host:

   ```
   HOSTS_EXTRA_APP=, https://api.bichu.app
   SITE_HOSTS=https://bichu.app
   SITE_TAG_HOSTS=https://tag.bichu.app
   SITE_WWW_HOSTS=https://www.bichu.app
   SITE_BASE_URL=https://bichu.app
   ```

   `BORDA_RESTO_DA_APP` **sai** neste passo, e só neste: depois do corte o
   site tem host próprio em `SITE_HOSTS`, `WEB_BASE_URL` aponta para lá, e o
   catch-all de `hml` e `api` volta a ser 404, que é o seguro. **Antes do
   corte ela é obrigatória com `site`** (veja acima), porque até aqui
   `hml.bichu.app` é ao mesmo tempo `PUBLIC_BASE_URL` e `WEB_BASE_URL`. Ao
   tirá-la, reabra as cinco URLs do site no host novo: o 404 que volta em
   `hml` é esperado, o 404 em `bichu.app/termos` não é.
3. Validar antes de aplicar (um nome em dois blocos reprova aqui, e não com a
   borda fora do ar):

   ```bash
   docker compose config edge --format json | python3 -c "import json,sys; print('\n'.join(f'{k}={v}' for k,v in json.load(sys.stdin)['services']['edge']['environment'].items()))" > /tmp/edge.env
   docker run --rm --env-file /tmp/edge.env -v "$PWD/infra/caddy/Caddyfile:/etc/caddy/Caddyfile:ro" \
     caddy:2.8-alpine@sha256:af32e97399febea808609119bb21544d0265c58a02836576e32a2d082c262c17 \
     caddy validate --config /etc/caddy/Caddyfile && rm /tmp/edge.env
   ```

4. `docker compose up -d --no-deps edge`. **Recria** o edge, e é inevitável: a
   borda roda com `admin off`, sem `caddy reload`, e variável de ambiente só
   entra em container novo. São alguns segundos sem resposta em `hml` também;
   fora de sessão de teste do cliente.
5. Criar no DNS `www` e `api` (A para o IP do passo 2, `proxied:false`).

**Conferência depois, de fora** (ADR-0028, item 5): `hml.bichu.app/v1/health`
200 e `hml.bichu.app/t/x` 404; `bichu.app/` 200 `text/html`;
`bichu.app/v1/health` 200; `bichu.app/v1/docs` 404 sem pedir credencial;
`tag.bichu.app/t/<código inexistente>` respondendo pela página do site;
`tag.bichu.app/` 308 para `https://bichu.app/`; os quatro alvos de
`infra/verificacao/associacao.yml` em 200.

**Reverter:** voltar as cinco linhas do passo 2 ao valor anterior
(`HOSTS_EXTRA_APP=, https://bichu.app, https://tag.bichu.app` e sem as `SITE_*`)
e repetir o passo 4.

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
