#!/usr/bin/env bash
# Bootstrap UNICO do CD na GCP e no GitHub. Revisavel e idempotente: cada passo
# pergunta se o recurso ja existe antes de criar, e rodar de novo nao muda nada.
#
#   bash infra/bootstrap-cd.sh             # SO MOSTRA o que faria (padrao)
#   bash infra/bootstrap-cd.sh --aplicar   # aplica. So com o ok do cliente.
#
# O QUE ESTE SCRIPT NAO FAZ, e cada ausencia e regra:
#   - nao cria, nao gera e nao grava valor de segredo (ADR-0022). Ele LISTA os
#     segredos de runtime que faltam no cofre; criar e passo com ok do cliente;
#   - nao cria conta de administrador do backoffice nem senha de ninguem (a
#     conta sai do comando da BICHUS-260, com a senha digitada por uma pessoa);
#   - nao mexe em DNS. Os registros pendentes sao impressos no fim;
#   - nao cria a VM de producao (ADR-0029, passo 6). Os vinculos da producao
#     so sao aplicados se a `bichu-prod` ja existir; senao, o passo diz isso;
#   - nao troca a conta de servico de VM nenhuma (exige parar a maquina).
#
# Custo: ver o fim do arquivo.
set -euo pipefail

APLICAR=nao
[[ "${1:-}" == --aplicar ]] && APLICAR=sim

export CLOUDSDK_ACTIVE_CONFIG_NAME=bichu
export CLOUDSDK_CORE_ACCOUNT=oi@bichu.app
PROJ=bichu-app-508914
REGIAO=southamerica-east1
ZONA=southamerica-east1-a
REPO_GH=bichu-app/bichu-app
AR=bichu                                   # repositorio docker no Artifact Registry
REGISTRO="$REGIAO-docker.pkg.dev/$PROJ/$AR"
POOL=github
PROVEDOR=bichu-app
CD_SA_NOME=bichu-cd
CD_SA="$CD_SA_NOME@$PROJ.iam.gserviceaccount.com"
# Conta de servico de cada VM, MEDIDA e nao suposta: a `bichu-hml` roda com
# `bichu-hml-app` (servidor de metadados, 23/09). A de producao e a do ADR-0029.
VM_HML=bichu-hml;  SA_VM_HML="bichu-hml-app@$PROJ.iam.gserviceaccount.com"
VM_PROD=bichu-prod; SA_VM_PROD="bichu-prod-vm@$PROJ.iam.gserviceaccount.com"
IP_HML=bichu-hml-ip
SEGREDOS_DE_RUNTIME="DATABASE_URL IP_HMAC_KEY TAG_CODE_KEY TAG_CODE_INDEX_KEY JWT_ACTIVE_PRIVATE_KEY JWT_NEXT_PRIVATE_KEY OBJECT_STORAGE_ACCESS_KEY_ID OBJECT_STORAGE_SECRET_ACCESS_KEY"

g() { gcloud --project="$PROJ" "$@"; }
passo() { printf '\n== %s\n' "$*"; }
faz() { # executa, ou so mostra
  if [[ "$APLICAR" == sim ]]; then printf '  + %s\n' "$*"; "$@"; else printf '  (faria) %s\n' "$*"; fi
}
existe() { "$@" >/dev/null 2>&1; }

passo "0. conta e projeto"
[[ "$(gcloud config get-value account 2>/dev/null)" == "$CLOUDSDK_CORE_ACCOUNT" ]] || { echo "conta ativa nao e $CLOUDSDK_CORE_ACCOUNT"; exit 1; }
NUM_PROJ="$(g projects describe "$PROJ" --format='value(projectNumber)')"
echo "  projeto $PROJ ($NUM_PROJ), modo: $([[ $APLICAR == sim ]] && echo APLICAR || echo so-mostrar)"

passo "1. APIs"
faz g services enable iam.googleapis.com iamcredentials.googleapis.com sts.googleapis.com \
  artifactregistry.googleapis.com iap.googleapis.com oslogin.googleapis.com compute.googleapis.com

passo "2. Artifact Registry ($REGISTRO)"
if existe g artifacts repositories describe "$AR" --location="$REGIAO"; then echo "  ja existe"; else
  faz g artifacts repositories create "$AR" --repository-format=docker --location="$REGIAO" \
    --description="Imagens do Bichu, promovidas por digest pelo CD"
fi
# Limpeza: guarda as 30 versoes mais recentes de cada imagem e apaga o que nao
# tem tag ha mais de 30 dias. As 30 cobrem com folga a pilha de reversao.
politica="$(mktemp)"
cat > "$politica" <<'JSON'
[
  {"name": "guarda-as-30-mais-recentes", "action": {"type": "Keep"}, "mostRecentVersions": {"keepCount": 30}},
  {"name": "apaga-sem-tag-velha", "action": {"type": "Delete"}, "condition": {"tagState": "untagged", "olderThan": "30d"}}
]
JSON
faz g artifacts repositories set-cleanup-policies "$AR" --location="$REGIAO" --policy="$politica" --no-dry-run

passo "3. conta de servico do CD ($CD_SA), sem papel nenhum no projeto"
if existe g iam service-accounts describe "$CD_SA"; then echo "  ja existe"; else
  faz g iam service-accounts create "$CD_SA_NOME" --display-name="CD do Bichu (GitHub Actions)"
fi

passo "4. Workload Identity Federation: so o repositorio $REPO_GH"
if existe g iam workload-identity-pools describe "$POOL" --location=global; then echo "  pool ja existe"; else
  faz g iam workload-identity-pools create "$POOL" --location=global --display-name="GitHub Actions"
fi
if existe g iam workload-identity-pools providers describe "$PROVEDOR" --location=global --workload-identity-pool="$POOL"; then echo "  provedor ja existe"; else
  # A condicao amarra o token ao REPOSITORIO e ao DONO, e nao so ao nome: um
  # repositorio renomeado para `bichu-app/bichu-app` por outra conta nao passa.
  faz g iam workload-identity-pools providers create-oidc "$PROVEDOR" --location=global \
    --workload-identity-pool="$POOL" --issuer-uri="https://token.actions.githubusercontent.com" \
    --attribute-mapping="google.subject=assertion.sub,attribute.repository=assertion.repository,attribute.repository_owner=assertion.repository_owner,attribute.ref=assertion.ref,attribute.environment=assertion.environment" \
    --attribute-condition="assertion.repository=='$REPO_GH' && assertion.repository_owner=='bichu-app'"
fi
PRINCIPAL="principalSet://iam.googleapis.com/projects/$NUM_PROJ/locations/global/workloadIdentityPools/$POOL/attribute.repository/$REPO_GH"
faz g iam service-accounts add-iam-policy-binding "$CD_SA" --role=roles/iam.workloadIdentityUser --member="$PRINCIPAL"

passo "5. papeis do CD, POR RECURSO"
# Publicar imagem: so no repositorio do Artifact Registry.
faz g artifacts repositories add-iam-policy-binding "$AR" --location="$REGIAO" \
  --role=roles/artifactregistry.writer --member="serviceAccount:$CD_SA"
# Entrar na VM (OS Login, com sudo para o docker) e usar a conta da VM: so nas
# duas instancias e nas duas contas delas.
vincular_vm() { # vm conta_da_vm
  if ! existe g compute instances describe "$1" --zone="$ZONA"; then
    echo "  a VM $1 ainda nao existe (ADR-0029, passo 6): vinculos dela ficam para depois"; return
  fi
  faz g compute instances add-iam-policy-binding "$1" --zone="$ZONA" --role=roles/compute.osAdminLogin --member="serviceAccount:$CD_SA"
  faz g compute instances add-metadata "$1" --zone="$ZONA" --metadata=enable-oslogin=TRUE
  faz g iam service-accounts add-iam-policy-binding "$2" --role=roles/iam.serviceAccountUser --member="serviceAccount:$CD_SA"
  # A VM puxa as imagens com a propria conta: leitura so no repositorio.
  faz g artifacts repositories add-iam-policy-binding "$AR" --location="$REGIAO" \
    --role=roles/artifactregistry.reader --member="serviceAccount:$2"
}
vincular_vm "$VM_HML" "$SA_VM_HML"
vincular_vm "$VM_PROD" "$SA_VM_PROD"
# Tunel do IAP: o papel nao tem vinculo por instancia na CLI. Vai no projeto,
# com CONDICAO de porta 22. E a unica permissao do CD no nivel do projeto, e nao
# e de segredo, de bucket nem de editor (ADR-0029, passo 13).
faz g projects add-iam-policy-binding "$PROJ" --role=roles/iap.tunnelResourceAccessor \
  --member="serviceAccount:$CD_SA" --condition='expression=destination.port == 22,title=so-ssh-pelo-iap'
if existe g compute firewall-rules describe permite-ssh-pelo-iap; then echo "  regra de firewall do IAP ja existe"; else
  faz g compute firewall-rules create permite-ssh-pelo-iap --network=default --direction=INGRESS \
    --action=allow --rules=tcp:22 --source-ranges=35.235.240.0/20 --target-tags=bichu-web
fi

passo "6. IP estatico da homologacao ($IP_HML)"
if existe g compute addresses describe "$IP_HML" --region="$REGIAO"; then
  echo "  ja e estatico: $(g compute addresses describe "$IP_HML" --region="$REGIAO" --format='value(address,status)')"
else
  # Promove o IP que a VM ja usa: o DNS de `hml` continua valido.
  atual="$(g compute instances describe "$VM_HML" --zone="$ZONA" --format='value(networkInterfaces[0].accessConfigs[0].natIP)')"
  faz g compute addresses create "$IP_HML" --region="$REGIAO" --addresses="$atual"
fi

passo "7. push: o papel bichu.pushSender (ADR-0008) na conta da VM de PRODUCAO"
# ADR-0029, secao 7: homologacao fica em PUSH_TRANSPORT=log; o papel vai para
# `bichu-prod-vm`. Uma permissao so: cloudmessaging.messages.create.
if existe g iam roles describe pushSender; then echo "  papel ja existe"; else
  faz g iam roles create pushSender --title="bichu.pushSender" --permissions=cloudmessaging.messages.create --stage=GA
fi
if existe g iam service-accounts describe "$SA_VM_PROD"; then
  faz g projects add-iam-policy-binding "$PROJ" --role="projects/$PROJ/roles/pushSender" --member="serviceAccount:$SA_VM_PROD" --condition=None
else
  echo "  $SA_VM_PROD ainda nao existe (ADR-0029, passo 6): o vinculo fica para depois"
fi

passo "8. segredos de runtime (ADR-0022): SO a lista, nenhum valor"
faltam=""
for s in $SEGREDOS_DE_RUNTIME; do
  if existe g secrets describe "$s"; then echo "  [existe] $s"; else echo "  [FALTA]  $s"; faltam="$faltam $s"; fi
done
[[ -z "$faltam" ]] || echo "  -> criar:$faltam. Passo do cliente, com o ADR-0029 passo 7. Este script nao gera nem grava valor."

passo "9. GitHub: variaveis e environments"
faz gh variable set REGISTRO --repo "$REPO_GH" --body "$REGISTRO"
faz gh variable set WIF_PROVIDER --repo "$REPO_GH" --body "projects/$NUM_PROJ/locations/global/workloadIdentityPools/$POOL/providers/$PROVEDOR"
faz gh variable set CD_SA --repo "$REPO_GH" --body "$CD_SA"
faz gh variable set PROJETO_GCP --repo "$REPO_GH" --body "$PROJ"
# O admin nasce DESLIGADO nos dois ambientes (ver cd.yml).
faz gh variable set CD_ADMIN_HML --repo "$REPO_GH" --body desligado
faz gh variable set CD_ADMIN_PRODUCAO --repo "$REPO_GH" --body desligado
faz gh api -X PUT "repos/$REPO_GH/environments/hml" --silent
# Producao: revisor obrigatorio. REVISOR_GH e o login de quem aprova (o cliente).
: "${REVISOR_GH:=}"
if [[ -z "$REVISOR_GH" ]]; then
  echo "  defina REVISOR_GH=<login do GitHub de quem aprova producao> e rode de novo: sem revisor, producao nao tem portao"
else
  id_revisor="$(gh api "users/$REVISOR_GH" --jq .id)"
  faz gh api -X PUT "repos/$REPO_GH/environments/producao" --input - <<JSON
{"reviewers":[{"type":"User","id":$id_revisor}],"prevent_self_review":false,"deployment_branch_policy":{"protected_branches":false,"custom_branch_policies":true}}
JSON
  faz gh api -X POST "repos/$REPO_GH/environments/producao/deployment-branch-policies" -f name=main -f type=branch
fi
env_var() { faz gh variable set "$2" --repo "$REPO_GH" --env "$1" --body "$3"; }
env_var hml VM "$VM_HML"; env_var hml ZONA "$ZONA"; env_var hml BICHU_DIR /home/leandropanegassi/bichu
env_var hml URL_API https://hml.bichu.app; env_var hml HOST_SONDA hml.bichu.app
env_var producao VM "$VM_PROD"; env_var producao ZONA "$ZONA"; env_var producao BICHU_DIR /opt/bichu
env_var producao URL_API https://api.bichu.app; env_var producao HOST_SONDA api.bichu.app

passo "10. DNS PENDENTE (nao aplicado aqui; Cloudflare, registro A, SEM proxy)"
cat <<'TXT'
  admin.bichu.app      -> IP da bichu-prod   (depois de ADMIN_HOSTS no .env e da recriacao so de edge e admin-web)
  admin-hml.bichu.app  -> IP da bichu-hml    (idem, em homologacao)
  api.bichu.app        -> IP da bichu-prod   (ADR-0029, passo 10)
  www.bichu.app        -> IP da bichu-prod   (ADR-0029, passo 10)
  Ordem: configuracao da borda primeiro, DNS depois (certificado por HTTP-01, .app em HSTS).
TXT

# CUSTO MENSAL ESTIMADO (precos de lista em USD, southamerica-east1, 09/2026):
#   - Workload Identity Federation, IAP para TCP, OS Login, conta de servico: 0.
#   - Artifact Registry: 0,5 GB gratis; depois ~US$ 0,10/GB-mes. Imagens: app
#     ~250 MB, migrador ~250 MB, site ~560 MB, admin ~50 MB, borda ~50 MB; com a
#     limpeza de 30 versoes e camadas compartilhadas, 3 a 8 GB: US$ 0,30 a 0,80.
#   - Trafego registro -> VM na mesma regiao: 0.
#   - IP estatico da hml: ja existia ou e o mesmo IP promovido. Um IPv4 externo
#     em uso custa ~US$ 0,005/h (~US$ 3,65/mes) sendo estatico OU efemero; o
#     que muda com o estatico e a VM PARADA: ~US$ 0,01/h (~US$ 7,30/mes) pelo
#     IP reservado sem uso.
#   - GitHub Actions: repositorio privado consome minutos do plano (cerca de 10
#     a 15 minutos por deploy completo).
# Total novo na GCP: menos de US$ 1/mes, fora o IP que ja existe.
