> **Status:** rascunho
> **Atualizado:** 2026-10-27

# Os arquivos de associacao de deep link

Servidos pela borda em `/.well-known/`, estaticos, com `application/json` e
**sem redirecionamento**. Quem os busca e o sistema operacional do aparelho, nao
o navegador: o Android e a Apple exigem 200 direto, e um redirecionamento aqui
invalida a associacao nas duas plataformas **sem produzir erro em lugar nenhum**.

Nao sao servidos pela aplicacao (ADR-0017: o back-end nao serve HTML nem
estatico do dominio da plaquinha). Pelo ADR-0028 item 6 os arquivos ficam AQUI,
servidos pela borda e fora da imagem do site, e o trecho `(associacao_deep_link)`
do `Caddyfile` e importado por TRES blocos -- a origem da aplicacao, o apex do
site e o host da tag -- para que as copias nao possam divergir.

## 2026-10-27, BICHUS-301: este arquivo deixou de servir so deep link

O passkey entrou (credencial digital depois do cadastro). Duas mudancas no
`assetlinks.json`, e as duas sao necessarias:

### 1. A relacao `get_login_creds`

`delegate_permission/common.handle_all_urls` e **deep link e so isso**. Ela nao
habilita passkey. Quem habilita o Android a entregar credencial WebAuthn ao app
e `delegate_permission/common.get_login_creds`. As duas convivem no MESMO
enunciado (um objeto, duas relacoes) e nao em dois objetos.

Isso foi deliberado: `infra/verificacao/verificar_borda_local.py` le a digital
por INDICE -- `d[0]["target"]["sha256_cert_fingerprints"]`. Dois objetos
separados fariam o verificador conferir um e ignorar o outro, e as duas copias
divergiriam exatamente como o ADR-0028 item 6 existe para impedir. Um objeto com
duas relacoes mantem o verificador correto e a digital escrita uma unica vez.

### 2. A digital de DEBUG entrou, e o que isso custa

```
5D:7A:C5:50:5F:C6:C4:77:28:F9:86:75:F8:F9:7E:9A:64:27:AB:95:4A:2E:B7:74:B8:FF:72:6F:CA:3F:12:55
```

**De onde ela saiu, medido em 27/10 e nao deduzido.** Os APKs sao assinados por
`APK Signature Scheme v2` e **nao tem assinatura v1**: `keytool -printcert
-jarfile` responde `Not a signed jar file` nos 31 arquivos de
`workspace/artefatos-app/`. A digital foi extraida parseando o *APK Signing
Block* (par de id `0x7109871a`), pegando o primeiro certificado do
`signed data` e tirando o SHA-256 do DER. Duas conferencias independentes
fecharam no mesmo valor:

- `openssl x509 -inform DER -noout -fingerprint -sha256` sobre o certificado
  extraido (controle positivo do parser: o certificado decodifica, e
  `subject=CN=Android Debug, O=Android, C=US`);
- `keytool -list -v -keystore ~/.android/debug.keystore -storepass android`,
  alias `androiddebugkey`.

**Os 31 APKs tem UMA unica digital.** Medido, nao suposto: a extracao rodou nos
31 e `sort -u` devolve uma linha. Isso confirma o que o cliente afirmou em 25/10
("os dez tem o mesmo certificado") e e o que torna o passkey utilizavel nos
APKs que ele ja instalou.

**A ressalva de 22/09 CONTINUA VERDADE, e agora tem fronteira medida.** O texto
anterior deste arquivo dizia para nao preencher porque a digital de debug nao e
estavel: `~/.android/debug.keystore` e gerado pela cadeia de ferramentas em cada
maquina, com senha e DN fixos mas **par RSA sorteado** (medido em 22/09: tres
`keytool -genkeypair` identicos, tres digitais diferentes). Isso nao foi
refutado. O que a medicao de 27/10 acrescenta e o alcance:

- os 31 APKs ja distribuidos **batem** com esta digital, porque todos sairam
  desta mesma maquina;
- um APK construido em OUTRA maquina **nao vai bater**, e ali o deep link e o
  passkey falham **em silencio**, sem erro em lugar nenhum.

Preencher foi escolhido porque a BICHUS-106 ja autorizou em 17/09 registrar a
digital de debug e troca-la pela de release no dia da publicacao, e porque o
caminho de distribuicao real hoje e APK construido aqui e instalado a mao. O
preco e o de cima, e esta escrito para nao virar surpresa: **enquanto nao houver
keystore de debug compartilhado, quem construir o app noutra maquina tem de
trocar esta linha pela digital dela, ou o passkey nao funciona no aparelho dele.**

### 3. A digital de RELEASE FALTA

O array `sha256_cert_fingerprints` tem **uma** entrada e precisa de **duas**.
A segunda e a do certificado de publicacao, que **ainda nao existe**:

- `app/android/app/build.gradle.kts` ainda tem `buildTypes.release` usando
  `signingConfigs.getByName("debug")` -- o APK de release e assinado com a chave
  de DEPURACAO;
- nao existe keystore de release, e o `.gitignore` exclui `*.keystore`;
- a dispensa `apk-assinado` em `.github/quality-gates.yml` descreve isso.

JSON nao aceita comentario, entao o lugar de registrar a vaga e aqui. **No dia
da publicacao, acrescente a digital de release como SEGUNDO elemento do array e
nao remova a de debug** enquanto houver APK de debug instalado em campo: o
Android aceita qualquer digital da lista, e remover a primeira tranca o passkey
de quem ja cadastrou credencial. Se a publicacao usar *Play App Signing*, a
digital que entra e a do certificado que o Google gera, nao a do upload key.

### 4. O criterio 8 da BICHUS-39 ficou sem efeito AQUI, e segue de pe no outro

O criterio 8 pedia que, sem digital, o arquivo respondesse **503** e nunca 200
com lista vazia, porque o sistema operacional **cacheia a associacao quebrada**.
Para o `assetlinks.json` isso virou discussao sem objeto: a lista nao esta mais
vazia.

**Para o `apple-app-site-association` o conflito continua exatamente onde
estava** -- a borda serve 200 com `applinks.details` vazio, que e o que o
criterio 8 proibe. Nao foi resolvido aqui porque iOS esta dormente por decisao
do cliente (so Android, BICHUS-253) e porque escolher entre os dois desenhos e
de quem coordena. Fica dito para nao sumir.

## Por que `applinks.details` e `webcredentials.apps` continuam VAZIOS

O `appID` depende do Team ID, que depende da conta Apple Developer, que nao
existe (dispensa `ios` em `.github/quality-gates.yml`, **vence em 2026-10-31** --
quatro dias depois desta atualizacao). Esta esperando insumo de fora.

`webcredentials.apps` e o campo que o iOS le para passkey, equivalente ao
`get_login_creds` do Android. Esta vazio pelo MESMO motivo e nao por esquecimento:
sem Team ID nao ha `appID` para escrever. **O `RP ID` escolhido (`bichu.app`) ja
serve iOS** -- ver abaixo --, entao quando a conta Apple existir basta preencher
este array, sem tocar em credencial nenhuma ja emitida.

## O `RP ID` do passkey e `bichu.app`, e por que

O `RP ID` e o unico parametro do WebAuthn que **nao pode mudar depois**: trocar
invalida toda credencial ja emitida. Por isso ele foi escolhido antes da tela e
nao depois.

`bichu.app` (o apex) porque:

1. e dominio registravel, que e o que a especificacao exige;
2. credencial de `bichu.app` vale para qualquer subdominio -- app, `www`,
   `admin` --, enquanto credencial de um subdominio **nao** sobe para o apex;
3. o apex ja serve este arquivo: o trecho `(associacao_deep_link)` e importado
   pelo bloco `{$SITE_HOSTS}` do `Caddyfile`, que e o apex do site (ADR-0028);
4. **nao inviabiliza iOS**: `Associated Domains` usa
   `webcredentials:bichu.app` com o `apple-app-site-association` no mesmo apex,
   que e exatamente o par que esta pasta serve.

O que foi **rejeitado** e vale registrar: `tag.bichu.app` prenderia a credencial
ao host da plaquinha, e `hml.bichu.app` prenderia ao ambiente de homologacao --
nos dois casos a migracao para producao exigiria trocar o `RP ID`, isto e,
**invalidar todas as passkeys**. Um `RP ID` de ambiente e uma armadilha de via
unica.

**Dependencia que NAO esta resolvida:** o apex `bichu.app` ainda responde pelos
quatro registros A da Squarespace (ver `infra/verificacao/associacao.yml`). Ate
o passo 9 do roteiro de provisionamento acontecer, `https://bichu.app/.well-known/assetlinks.json`
nao e servido por nos, e **o passkey nao funciona em producao** -- por DNS, nao
por codigo. Em homologacao o caminho exercitado e o mesmo arquivo servido pelos
tres blocos da borda.

`infra/verificacao/verificar_borda_local.py` acusa lista vazia a cada execucao e
**reprova** assim que a dispensa correspondente vencer. Com a digital preenchida,
o caso `assetlinks.json` passa a sair limpo; o caso `apple-app-site-association`
continua saindo como aviso enquanto a dispensa `ios` valer, e vira reprovacao em
2026-10-31.
