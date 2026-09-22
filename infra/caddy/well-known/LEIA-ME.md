> **Status:** rascunho
> **Atualizado:** 2026-09-22

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
isso e o estado correto hoje. O motivo de cada uma e diferente, e a diferenca
importa porque so uma delas esta esperando insumo de fora:

- **`applinks.details` (iOS):** o `appID` depende do Team ID, que depende da
  conta Apple Developer, que nao existe (dispensa `ios` em
  `.github/quality-gates.yml`, vence em 2026-09-29). Esta esperando insumo.

- **`sha256_cert_fingerprints` (Android):** NAO esta esperando a chave de
  release. A BICHUS-106 ja autorizou, em 17/09, registrar aqui a digital do
  certificado de **debug** e troca-la pela de release no dia da publicacao. O
  que impede nao e falta de autorizacao, e sim que **a digital de debug nao e
  estavel**: o `~/.android/debug.keystore` e gerado pela cadeia de ferramentas
  em cada maquina, com senha e DN fixos mas **par RSA sorteado**. Medido em
  22/09 com tres `keytool -genkeypair` identicos: tres digitais diferentes.
  Registrar a digital de uma maquina faria o deep link abrir no computador de
  quem a registrou e falhar em silencio em todos os outros aparelhos.

  Destravar exige decidir onde vive um keystore de debug **compartilhado** (o
  keystore e a senha sao segredo, vao para o Secret Manager por ADR-0022; a
  digital que sai dele nao e segredo e e o que entra neste arquivo). A medicao
  inteira esta registrada em `.github/quality-gates.yml`, na dispensa
  `apk-assinado`.

**Lista vazia e recusa honesta:** o sistema operacional nao encontra
correspondencia e nao abre o app, que e exatamente o que acontece na realidade.
Preencher com um valor de exemplo seria pior do que o 404 que havia antes: o
arquivo passaria a responder 200 com JSON valido, qualquer conferencia
superficial ficaria verde, e a falha so apareceria no aparelho de um usuario --
depois de a plaquinha ter sido impressa com o dominio.

**Ressalva registrada, e ela nao e nossa para resolver:** o criterio 8 da
BICHUS-39 pede que, sem a digital, o arquivo responda **503**, e **nunca 200 com
lista vazia**, porque o sistema operacional **cacheia a associacao quebrada**. O
que a borda serve hoje e 200 com lista vazia, ou seja, o que esse criterio
proibe. Os dois desenhos foram escritos por gente diferente e nenhum dos dois e
descuido; decidir qual vale e de quem coordena, e esta escrito aqui para nao
sumir.

`infra/verificacao/verificar_borda_local.py` acusa a lista vazia a cada
execucao, e **reprova** assim que a dispensa correspondente vencer. Conferido em
22/09 contra `https://tag.bichu.app`: com a dispensa valendo sai `[aviso]` e
APROVADO; com a data recuada um dia sai REPROVADO com codigo de saida 1. Ou o
insumo chegou e o valor entra aqui, ou nao chegou e isso precisa ser dito em voz
alta.
