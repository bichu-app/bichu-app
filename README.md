# Bichu

App mobile de comunidade pet no Brasil. O tutor cadastra o pet com foto e sinais,
vincula uma tag QR na coleira e, quando o pet some, dispara um alerta para
tutores num raio de 5 km. **Quem encontra o animal avisa o tutor em segundos,
com ou sem o app, sem ver telefone nem endereço.**

Domínio: `bichu.app`.

## O que é cada pasta

| Pasta | O que tem |
|---|---|
| `api/` | **`openapi.yaml`, o contrato.** É a fonte da verdade, escrito antes do código |
| `src/` | código-fonte: monólito modular em TypeScript. Comece por `src/README.md` |
| `app/` | aplicativo Flutter |
| `tests/` | cenários Gherkin e specs de ponta a ponta |
| `infra/` | infraestrutura como código |
| `docs/` | arquitetura, produto, segurança, UX, design system, devops, testes |
| `adr/` | uma decisão por arquivo, com o que foi descartado e por quê |

## Para quem está abrindo isto pela primeira vez

Leia nesta ordem. São quatro arquivos, e eles respondem quase tudo:

1. **`BRIEFING.md`** — o produto, o escopo fechado do MVP e o que ficou de fora.
2. **`api/openapi.yaml`** — o que o sistema faz. Toda operação declara o que
   exige de credencial, que efeito produz fora do processo e que teto tem.
3. **`docs/03-arquitetura.md`** — como está montado. A §4 tem o modelo de dados,
   a §11 o contrato de portabilidade, a §16 o caminho de crescimento.
4. **`adr/`** — por quê. Quando um documento e um ADR divergirem, **o ADR vale**,
   porque é ele que carrega o motivo.

## Cinco regras que explicam quase todas as decisões

1. **O fluxo mais crítico é anônimo.** Quem acha o animal não tem conta, está na
   rua, com uma mão só, em rede móvel ruim. Meta: do scan ao aviso em menos de
   60 segundos. Tudo que atrapalha esse caminho perde para ele.
2. **Um identificador deste sistema é impresso em plástico.** O código da tag não
   se reemite. É o único ponto verdadeiramente irreversível do produto.
3. **Contato é sempre mediado, e não há recompensa no produto.** É a contramedida
   ao golpe do falso achador, que é padrão conhecido no Brasil.
4. **Superfície pública nunca mostra coordenada, contato ou identificador
   interno.** O nível máximo de precisão geográfica em público é o bairro. A
   lista completa está no ADR-0010, e ela vale como critério de reprovação de PR.
5. **Toda regra de negócio vive no servidor.** O teste: se alguém chamar a API
   direto, sem passar pela tela, o sistema continua íntegro.

## Rodando

O ambiente inteiro sobe em containers, sem conta em nuvem nenhuma.

```sh
cp .env.example .env     # preencha os valores vazios (chaves de dev, senhas)
make up                  # constrói a imagem, aplica as migrações e sobe tudo
curl http://localhost:3000/v1/health   # ou a porta que o `make up` imprimir
```

**A porta pode não ser a 3000 na sua máquina, e isso é esperado.** Na primeira
invocação o `make` sonda as portas, escolhe o primeiro par livre e grava a
escolha em `portas.local.mk`. O arquivo não é versionado, é só seu, e o par fica
o mesmo em todas as subidas seguintes. O endereço de verdade sai no fim do
`make up`:

```
aplicação: http://localhost:3200
mídia:     http://localhost:3201
```

Não há passo manual: o arquivo nasce sozinho. O que existe para você fazer, se
quiser, é **editar os dois números dentro dele** para fixar outra porta, ou
rodar `make portas` para reescolher do zero.

`make up` é o comando único: `compose.yaml` traz a aplicação, PostgreSQL com
PostGIS, armazenamento de objeto compatível com S3, um receptor de e-mail local
e a borda. As migrações são aplicadas antes de a aplicação subir, por um job
próprio; `make reset` apaga o volume e repete tudo do zero, que é o que prova a
migração em banco vazio.

`make ajuda` lista o resto dos alvos.

### Quando a subida reclamar de porta

```
porta ocupada por outro processo: 3200
  esta pilha esta configurada para 3200 (aplicacao) e 3201 (midia).
  livre agora: 3300 e 3301. Para fixar este par nesta maquina:
    make portas
```

Alguém subiu outra coisa na porta que era sua desde a última vez. `make portas`
reescolhe e regrava; `make up PORTA=3300 PORTA_MIDIA=3301` usa outro par só
nesta subida, sem fixar.

**Não troque de porta editando as URLs do `.env`.** É o atalho óbvio e é o pior
dos caminhos: o serviço sobe, a sonda passa, e todo link de tag e de e-mail
passa a apontar para uma porta que não responde. Isso é pior do que não subir,
porque não falha na hora — falha no telefone de quem leu o QR, e o que o QR
guarda não se corrige depois (ADR-0004). O `Makefile` deriva as cinco URLs base
(`PUBLIC_BASE_URL`, `TAG_BASE_URL`, `WEB_BASE_URL`, `API_BASE_URL` e
`MEDIA_PUBLIC_BASE_URL`) dos mesmos dois números, e `make verificar-portas`
reprova quando porta publicada e URL base discordam. Ele roda dentro do
`make up`, antes do Docker.

O mesmo vale para `make up HOST=<ip da sua máquina>`, que serve na rede local
para um segundo aparelho físico alcançar a rota pública do QR: ele move host e
porta nas cinco de uma vez, e o portão reprova se alguma ficar para trás.

### Subir exige um checkout do git

A imagem carrega, gravado dentro dela, o commit de que ela saiu, e o build
**reprova** sem ele: um serviço que não sabe de onde veio responde `status: ok`
igual a um que sabe, e aí quem está rodando código antigo fica indistinguível de
quem está rodando o novo. O `make` resolve isso sozinho — ele lê
`git rev-parse HEAD` e exporta o valor.

O que isso quer dizer na prática: **`make up` de um tarball, de uma cópia da
pasta ou de um diretório sem `.git` não sobe**, e você vai ver a mensagem
dizendo qual dos dois casos é o seu. A saída certa é construir de um checkout, e
não inventar um valor: um SHA falso engana pior que a ausência, porque a sonda
passa a afirmar em vez de calar. Para apontar um commit específico,
`make up BUILD_COMMIT=<sha>`.

| Comando | O que faz |
|---|---|
| `make up` | sobe dev, aplicando as migrações |
| `make reset` | derruba apagando o volume e sobe do zero |
| `make test` | testes unitários, dentro da imagem |
| `npm run test:integration` | integração contra um Postgres de verdade, em pilha própria |
| `make logs` | tail agregado dos serviços |
| `make down` | derruba preservando o volume |
| `make portas` | reescolhe o par de portas desta máquina |
| `make verificar` | roda os portões locais, na ordem da esteira |

O detalhe de cada um, e o porquê das decisões, está em `docs/07-devops.md`.

### Integração a partir de um worktree

`npm run test:integration` funciona de qualquer diretório de trabalho, incluindo
um criado por `git worktree add`, e **não encosta na pilha de desenvolvimento**.
Ele sobe uma pilha própria, com nome de projeto derivado do caminho e sem
publicar porta nenhuma: quem roda a suíte é um serviço dentro daquela rede. O
`.env` não precisa ser copiado — ele é gerado com valores de teste que não
autenticam em lugar nenhum, porque segredo mora no Secret Manager (ADR-0022).

A suíte só roda em banco que se declara descartável. Se ela recusar dizendo isso,
o `DATABASE_URL` do ambiente está apontando para outro lugar.

O caminho inteiro está em `infra/integracao/`, e cada arquivo explica o porquê.

### `git stash` não é seguro neste repositório

A pilha de stash mora no diretório git comum, não em cada worktree: os cerca de
60 worktrees deste repositório compartilham uma pilha só. Dois agentes que
empilham em paralelo dão `pop` no trabalho um do outro, e nada na saída do
comando avisa. Já aconteceu: duas medições de base com 76 segundos de diferença
terminaram com cada worktree segurando o trabalho do outro.

Para medir a base, use `git worktree add` a partir de um ref limpo, ou meça num
clone descartável.

Se você já perdeu trabalho assim, ele não sumiu: o commit de stash vira objeto
inalcançável. Ancore antes de qualquer outra coisa, com
`git update-ref refs/resgate/<nome> <sha>`, e só depois mexa no worktree. Um
stash feito com `-u` guarda os não rastreados num terceiro pai (`<sha>^3`);
restaurar só a árvore principal perde esses arquivos.

**Isto é convenção, não portão: nada te impede de empilhar.** Existe um gancho
pronto que recusaria o `git stash push` quando o repositório tem mais de um
worktree, e ele está em `.githooks/desligado/reference-transaction`, desligado
de propósito. A medição está no cabeçalho dele: ligá-lo custa cerca de 130 ms a
mais em **todo** commit, porque o git chama esse gancho sete vezes por commit e
cada chamada é um processo novo. O caso que ele precisa reprovar, e os cinco que
ele não pode reprovar, estão em `infra/verificacao/verificar-portao-de-stash.sh`.

E mesmo ligado ele não protegeria todo mundo: `core.hooksPath` é configuração
**por clone**, aplicada pelo `make setup`. Um clone novo nasce sem gancho
nenhum. Estar no repositório não é o mesmo que estar valendo na sua máquina.


## Homologação

Existe um ambiente de homologação de pé, e ele **não** é `bichu.app`:

| Para que | Endereço |
|---|---|
| API | `https://hml.bichu.app` (health em `/v1/health`) |
| Contrato, atrás de credencial | `https://hml.bichu.app/v1/docs` |
| Mídia pública | `https://img-hml.bichu.app` |

Build para instalar no aparelho Android apontando para lá:

```sh
flutter build apk --debug --dart-define=API_BASE_URL=https://hml.bichu.app
adb install -r build/app/outputs/flutter-apk/app-debug.apk
```

**Sem `/v1` no valor**: o `ApiClient` acrescenta a versão em cada chamada, e
`.../v1` no build produz requisições para `/v1/v1/...` e um 404 que parece
defeito de servidor.

É **homologação e não produção**, e ela **não deve receber dado de usuário
real** — o apex `bichu.app` ainda nem é nosso, o push não está configurado, o
deep link sobe com as listas vazias e o e-mail não sai do log. O endereço, o que
funciona, o que não funciona e o backup estão na seção 9.0 de
`docs/07-devops.md`; como a máquina foi montada, em
`infra/roteiro-provisionamento.md`.

## Configuração que ainda não existe

Estes pontos estão declarados e **não têm valor definido**. Onde aparecerem, é
variável de ambiente sem padrão: a aplicação recusa subir sem eles, com o nome na
mensagem, em vez de usar um exemplo que alguém confunda com o real.

| O que falta | Onde entra |
|---|---|
| Team ID da conta Apple | `apple-app-site-association` |
| Impressão digital SHA-256 da chave de assinatura do APK | `assetlinks.json` |
| Chaves do Google Maps | configuração do app |

O nome do pacote saiu desta tabela em 19/09 porque ele foi decidido:
`app.bichu` nas duas plataformas, e é esse valor que o `assetlinks.json` servido
em homologação já carrega.

Enquanto os outros três faltarem, os dois arquivos de associação sobem **com as
listas vazias** — conferido em 19/09: `200` com `application/json` e
`sha256_cert_fingerprints` e `applinks.details` vazios. Lista vazia é recusa
honesta: o sistema operacional não encontra correspondência, não abre o app, e é
exatamente isso que acontece na realidade. Preencher com valor de exemplo seria
pior, porque qualquer conferência superficial ficaria verde e a falha só
apareceria no aparelho de um usuário — depois de a plaquinha ter sido impressa
com o domínio. O raciocínio inteiro está em `infra/caddy/well-known/LEIA-ME.md`.
