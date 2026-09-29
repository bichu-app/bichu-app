#!/bin/sh
# Aplica `verificar_boot_do_alvo_prod.py` ao alvo `prod` DE VERDADE, localmente.
#
# POR QUE ELE EXISTE
#
# O juizo em `verificar_boot_do_alvo_prod.py` tinha, no Makefile, so
# `--autoteste`: as iscas provam que o juizo ENXERGA, e nada aplicava o juizo ao
# alvo `prod`. Essa metade vivia na linha 1076 de `.github/workflows/ci.yml`, e a
# esteira nao roda. Iscas sem aplicacao sao um juizo provado e nunca usado --
# a imagem `prod` podia parar de construir, ou o boot podia SUBIR sem gerenciador
# de segredos (que e reprovacao pela ADR-0022), sem nada acusar em lugar nenhum.
#
# DUAS DIFERENCAS DELIBERADAS CONTRA O PASSO DA ESTEIRA
#
# 1. NAO USA `timeout`. O passo da esteira faz `timeout 60 docker wait`. Nesta
#    maquina `timeout` NAO EXISTE (nem `gtimeout`): o shell responde 127, que o
#    `if` le como "o container nao morreu" -- veredito certo por acidente hoje e
#    errado no dia em que ele morrer. A espera aqui e um laco limitado sobre
#    `docker inspect`, que nao depende de ferramenta externa.
# 2. NAO USA `--network bichu_default`. A rede do compose pertence a pilha de dev
#    que outra sessao pode estar usando, e este container nao precisa dela: ele
#    morre no gerenciador de segredos ANTES de abrir conexao. O nome do container
#    carrega o PID para duas execucoes em paralelo nao brigarem pelo mesmo nome.
set -eu

raiz=$(cd "$(dirname "$0")/../.." && pwd)
cd "$raiz"

espera=${ESPERA_MAXIMA:-60}
nome="prova-prod-$$"
log=$(mktemp)

limpar() { docker rm -f "$nome" > /dev/null 2>&1 || true; rm -f "$log"; }
trap limpar EXIT INT TERM

# Lido do `.env` e nao escrito a mao, igual ao passo da esteira: o portao confere
# que o boot procurou no projeto que ESTA arvore declara. Copiar o nome para ca
# faria as duas pontas divergirem em silencio.
projeto=$(sed -n 's/^SECRET_STORE_PROJECT=//p' .env | head -1)
if [ -z "$projeto" ]; then
  echo "REPROVA: SECRET_STORE_PROJECT vazia no .env desta arvore. Sem ela nao da para saber em que projeto o boot deveria ter procurado" >&2
  exit 1
fi

BUILD_TARGET=prod IMAGE_TAG=prod BUILD_COMMIT=$(git rev-parse HEAD) \
  docker compose build api

# `MAIL_TRANSPORT=postmark` entrou em 29/09, e nao e detalhe: producao entrega
# e-mail pelo provedor (ADR-0009), e desde a correcao do token condicional a
# lista de segredos que a subida resolve DEPENDE do transporte. Provar o alvo
# `prod` em `smtp` -- que e o padrao do `.env` de quem desenvolve -- provaria uma
# subida que producao nunca faz, e cobraria sete dos oito segredos que
# `SEGREDOS_DE_RUNTIME` declara. Com o transporte de producao, o juizo volta a
# ver a lista inteira, que e o que ele existe para conferir.
docker run -d --name "$nome" --env-file .env \
  -e NODE_ENV=production -e BIND_HOST=0.0.0.0 -e PORT=3000 \
  -e MAIL_TRANSPORT=postmark bichu-app:prod > /dev/null

# `docker wait` sem teto penduraria a rodada inteira quando o container NAO morre
# -- e nao morrer tambem e reprovacao, e precisa ser dita com outras palavras.
i=0
saida=nenhuma
while [ "$i" -lt "$espera" ]; do
  if [ "$(docker inspect -f '{{.State.Running}}' "$nome")" = "false" ]; then
    saida=$(docker inspect -f '{{.State.ExitCode}}' "$nome")
    break
  fi
  sleep 1
  i=$((i + 1))
done

docker logs "$nome" > "$log" 2>&1
echo "saida do processo: $saida (esperei no maximo ${espera}s)"
cat "$log"

# `set -e` abortaria aqui na reprovacao e a linha de baixo -- a que diz o que
# este portao NAO prova -- nunca sairia. O veredito e guardado e devolvido no
# fim; `$?` depois de um comando que o `-e` ja abortou nunca e lido.
if python3 infra/verificacao/verificar_boot_do_alvo_prod.py \
     --log "$log" --saida "$saida" --projeto "$projeto"; then
  veredito=0
else
  veredito=$?
fi

echo "Este portao NAO prova que o alvo \`prod\` atende requisicao: sem gerenciador de segredos nesta maquina, essa prova e de implantacao (BICHUS-213)."
exit "$veredito"
