#!/usr/bin/env bash
# Copia os objetos do MinIO da pilha para os buckets do armazenamento
# gerenciado (ADR-0007 Emenda 1). Roda NO HOST, em ~/bichu, com a pilha de pe.
#
#   infra/ferramentas/migrar-objetos-para-o-gcs.sh            # ensaio: so lista
#   infra/ferramentas/migrar-objetos-para-o-gcs.sh --aplicar  # copia
#
# A CHAVE E PRESERVADA. O banco guarda chave, nunca URL, e as formas antigas
# (`catalog/original/...`, `thumb/...`, `card/...`) continuam aceitas na
# leitura por `comoObjectKey`. Nenhuma linha do banco muda.
#
# Copia, nao move: o MinIO fica intacto ate a troca ser conferida, e voltar e
# so devolver as variaveis antigas ao `.env`.
#
# Le do `.env`, sem imprimir, DEPOIS da troca do passo 11.3:
#   origem   MIGRACAO_MINIO_ID / MIGRACAO_MINIO_SEGREDO (as credenciais antigas
#            do MinIO, guardadas antes da troca; o `objeto` NAO e recriado e
#            segue com elas) e os buckets antigos MIGRACAO_BUCKET_*_ORIGEM
#            (padrao: bichu-media-private / bichu-media-public)
#   destino  OBJECT_STORAGE_ENDPOINT, OBJECT_STORAGE_ACCESS_KEY_ID /
#            OBJECT_STORAGE_SECRET_ACCESS_KEY (o HMAC) e OBJECT_BUCKET_*
set -euo pipefail

aplicar=0
case "${1:-}" in
  --aplicar) aplicar=1 ;;
  "") ;;
  *) echo "uso: $0 [--aplicar]" >&2; exit 2 ;;
esac

test -f .env || { echo "rode em ~/bichu: .env nao encontrado" >&2; exit 2; }
# Variavel ja exportada no shell vence o `.env`: permite o ensaio e a copia
# ANTES de trocar o `.env` do host, sem tocar nele.
ler() { if [ -n "${!1:-}" ]; then printf '%s' "${!1}"; else { grep -E "^$1=" .env || true; } | tail -1 | cut -d= -f2-; fi; }

origem_id=$(ler MIGRACAO_MINIO_ID)
origem_segredo=$(ler MIGRACAO_MINIO_SEGREDO)
privado_origem=$(ler MIGRACAO_BUCKET_PRIVADO_ORIGEM); privado_origem=${privado_origem:-bichu-media-private}
publico_origem=$(ler MIGRACAO_BUCKET_PUBLICO_ORIGEM); publico_origem=${publico_origem:-bichu-media-public}
destino_id=$(ler OBJECT_STORAGE_ACCESS_KEY_ID)
destino_segredo=$(ler OBJECT_STORAGE_SECRET_ACCESS_KEY)
destino_endpoint=$(ler OBJECT_STORAGE_ENDPOINT)
privado_destino=$(ler OBJECT_BUCKET_PRIVATE)
publico_destino=$(ler OBJECT_BUCKET_PUBLIC)

for v in origem_id origem_segredo destino_id destino_segredo destino_endpoint privado_destino publico_destino; do
  test -n "${!v}" || { echo "falta no .env: $v" >&2; exit 2; }
done
if [ "$privado_destino" = "$privado_origem" ] || [ "$publico_destino" = "$publico_origem" ]; then
  echo "OBJECT_BUCKET_* ainda aponta para os buckets antigos: troque o .env primeiro" >&2
  exit 2
fi

rede=$(docker compose ps -q objeto | xargs docker inspect --format '{{range $k, $v := .NetworkSettings.Networks}}{{$k}}{{end}}')
imagem=$(docker compose config --images | grep -m1 'minio/mc')

modo="--dry-run"; [ "$aplicar" = 1 ] && modo=""

# As credenciais entram por variavel de ambiente do container e chegam ao `mc`
# pela ENTRADA PADRAO: nunca na linha de comando, entao nao aparecem em `ps`,
# e nao vao em URL (o segredo HMAC tem `/` e `+`, que quebrariam MC_HOST_*).
docker run --rm -i --network "$rede" \
  -e ORIGEM_ID="$origem_id" -e ORIGEM_SEGREDO="$origem_segredo" \
  -e DESTINO_ID="$destino_id" -e DESTINO_SEGREDO="$destino_segredo" \
  -e DESTINO_ENDPOINT="$destino_endpoint" \
  -e PRIVADO_ORIGEM="$privado_origem" -e PUBLICO_ORIGEM="$publico_origem" \
  -e PRIVADO_DESTINO="$privado_destino" -e PUBLICO_DESTINO="$publico_destino" \
  -e MODO="$modo" \
  --entrypoint sh "$imagem" <<'DENTRO'
set -e
printf '%s\n%s\n' "$ORIGEM_ID" "$ORIGEM_SEGREDO" | mc alias set origem http://objeto:9000 --api S3v4 >/dev/null
printf '%s\n%s\n' "$DESTINO_ID" "$DESTINO_SEGREDO" | mc alias set destino "$DESTINO_ENDPOINT" --api S3v4 >/dev/null
for par in "$PRIVADO_ORIGEM $PRIVADO_DESTINO" "$PUBLICO_ORIGEM $PUBLICO_DESTINO"; do
  set -- $par
  echo "== origem/$1 -> destino/$2 ($(mc ls --recursive "origem/$1" | wc -l) objeto(s))"
  mc mirror $MODO --preserve "origem/$1" "destino/$2"
done
echo '== contagem no destino'
for b in "$PRIVADO_DESTINO" "$PUBLICO_DESTINO"; do
  echo "destino/$b: $(mc ls --recursive "destino/$b" | wc -l)"
done
DENTRO

[ "$aplicar" = 1 ] || echo "ENSAIO: nada foi copiado. Repita com --aplicar."
