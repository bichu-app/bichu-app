> **Status:** rascunho
> **Atualizado:** 2026-09-17

# Os arquivos de associacao de deep link

Servidos pela borda em `/.well-known/`, estaticos, com `application/json` e
**sem redirecionamento**. Quem os busca e o sistema operacional do aparelho, nao
o navegador: o Android e a Apple exigem 200 direto, e um redirecionamento aqui
invalida a associacao nas duas plataformas **sem produzir erro em lugar nenhum**.

Nao sao servidos pela aplicacao (ADR-0017: o back-end nao serve HTML nem
estatico do dominio da plaquinha). Em producao o host deles e o do time web; os
arquivos daqui existem para o ambiente LOCAL, onde tudo mora no mesmo host e o
caminho do deep link precisa continuar sendo exercitado.

## Por que as duas listas estao VAZIAS

`sha256_cert_fingerprints` e `applinks.details` estao vazios **de proposito**, e
isso e o estado correto hoje:

- a impressao digital da chave de assinatura do APK depende da chave, que ainda
  nao existe (dispensa `apk-assinado` em `.github/quality-gates.yml`, vence em
  2026-09-22);
- o `appID` da Apple depende do Team ID, que depende da conta Apple Developer,
  que tambem nao existe (dispensa `ios`, mesma data).

**Lista vazia e recusa honesta:** o sistema operacional nao encontra
correspondencia e nao abre o app, que e exatamente o que acontece na realidade.
Preencher com um valor de exemplo seria pior do que o 404 que havia antes: o
arquivo passaria a responder 200 com JSON valido, qualquer conferencia
superficial ficaria verde, e a falha so apareceria no aparelho de um usuario --
depois de a plaquinha ter sido impressa com o dominio.

`infra/verificacao/verificar_borda_local.py` acusa a lista vazia a cada
execucao, e **reprova** assim que a dispensa correspondente vencer. Ou o insumo
chegou e o valor entra aqui, ou nao chegou e isso precisa ser dito em voz alta.
