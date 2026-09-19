# ADR-0022: Secret Manager para os segredos de runtime

**Status:** **aceito** — decidido pelo cliente em 19/09/2026
**Data:** 2026-09-19
**Altera:** ADR-0013 (parcialmente). **Não revoga** ADR-0012 nem o contrato de
portabilidade da §11 de `docs/03-arquitetura.md`.

## O que muda, em uma frase

**Os segredos de runtime dos ambientes hospedados saem do arquivo `.env` no
disco da VM e passam a vir do Secret Manager do GCP.** Em `dev`, em teste e no
`compose.yaml` nada muda: continuam vindo de variável de ambiente, e continuam
subindo sem nuvem nenhuma.

## Por que este ADR existe: ele contraria uma decisão registrada

O ADR-0013 registrou a ressalva do cliente com todas as letras, e ela aparece
três vezes naquele documento e uma no roteiro de provisionamento:

> "o mínimo hospedado continua **sem serviço gerenciado**. No dia em que ele
> ganhar um banco gerenciado, uma fila gerenciada ou um balanceador
> proprietário, ele deixou de ser ponte e virou a escolha de nuvem por omissão"

**O Secret Manager é serviço gerenciado.** Não há leitura em que ele não seja: é
API do provedor, cobrada pelo provedor, com IAM do provedor, e sem ele a
aplicação não sobe naquele ambiente. Este ADR não suaviza isso, não o chama de
"serviço de plataforma" nem o esconde atrás da palavra "porta". **É uma exceção
à ressalva, pedida e aceita pelo cliente**, e a única forma honesta de abri-la é
escrevendo junto o critério que impede a próxima — o que a seção "O portão para
o próximo" faz.

## O argumento que mudou a decisão

Não foi conveniência, e não foi "agora que estamos no GCP, vamos usar". Foram
dois fatos do roteiro de provisionamento que só passaram a existir quando a
aplicação saiu de `localhost`:

**1. `.env` no disco de uma VM entra em snapshot de disco.** O roteiro prevê
snapshot diário do disco da instância — que é, hoje, metade da resposta de
recuperação, já que não há banco gerenciado (divergência 3 de
`docs/07-devops.md`). O snapshot é uma cópia integral do disco, **incluindo o
arquivo de segredos**, e ele nasce com política de retenção própria. A
consequência é a que ninguém escreve no dia em que liga o snapshot: **cada
segredo passa a ter N cópias, guardadas por um prazo que quem escolheu a senha
não definiu e provavelmente não sabe.** Trocar a senha do banco não alcança
nenhuma delas. Em `localhost` isso não existia; a partir da VM, existe todo dia
às 3 da manhã.

**2. Rotacionar exige entrar na máquina — então, na prática, ninguém
rotaciona.** Com o segredo em arquivo, a rotação é: `ssh` na instância, editar
um arquivo com um editor de terminal, reiniciar o container, torcer para não ter
errado uma linha, e repetir a cada ambiente. Isso não é caro, é **chato**, e
tarefa chata sem prazo não acontece. O resultado observável é uma chave de
assinatura de token com dois anos de idade e nenhum registro de quem a viu.

Com o gerenciador, rotacionar é criar uma versão nova e reiniciar o processo — e
por isso o adaptador lê `latest` de propósito, e não uma versão fixa: fixar o
número devolveria a rotação para dentro do ciclo de entrega, que é exatamente o
atrito que faz ela não ser feita.

**Nenhum dos dois é argumento contra o `.env`, e sim contra o `.env` NA
NUVEM.** É por isso que a mudança vale só para ambiente hospedado.

## O que continua valendo do ADR-0013, sem asterisco

Esta seção existe para que a exceção não seja lida como reabertura da escolha.

| Decisão do ADR-0013 | Continua? |
|---|---|
| **O `compose.yaml` é o artefato**, e a VM roda a mesma imagem | **sim**, intacto |
| **Nada de Cloud SQL.** Postgres em container na mesma máquina | **sim**, e o gatilho continua sendo o primeiro dado de usuário real |
| **Nada de GCS no caminho da aplicação.** MinIO em container, atrás de `ObjectStorage` | **sim**, intacto |
| **Nada de CDN gerenciada, nada de balanceador proprietário** | **sim**, a borda continua sendo o Caddy |
| `e2-small` em `southamerica-east1`, com os limites de memória por container | **sim** |
| Alerta de orçamento antes da primeira máquina | **sim**, e agora com mais razão |
| Os três gatilhos de saída e o quarto (indisponibilidade que custa) | **sim** |

O que muda é **uma linha** da tabela de equivalência da §3.8 de
`docs/07-devops.md`: "Segredo | arquivo `.env` fora do git" passa a valer só para
`dev`, `qa` e `homolog`.

## O portão para o próximo serviço gerenciado

Sem isto, "abrimos uma exceção" vira "abrimos várias", e cada uma com um
argumento razoável. **Um serviço gerenciado só entra quando os seis itens abaixo
forem verdadeiros ao mesmo tempo**, e quem propuser o próximo responde a eles por
escrito, em ADR, com o nome de quem decidiu e a data.

| # | Critério | Por que ele está na lista |
|---|---|---|
| **1** | **Ele remove um risco que código NÃO remove.** Não "facilita", não "é mais robusto": remove algo que nenhuma linha nossa alcança | o `.env` em snapshot de disco passa. Um cache gerenciado não passaria: o risco que ele remove é lentidão, e lentidão se resolve com código |
| **2** | **Fica atrás de uma porta, com adaptador local escrito e em uso.** `npm test` e `docker compose up` continuam subindo **sem nuvem nenhuma** | é o contrato de portabilidade da §11, e é o que impede o adaptador que só roda em produção — que é o que quebra em produção |
| **3** | **Ele é lido na SUBIDA, não no caminho da requisição.** A indisponibilidade dele adia um arranque; nunca derruba um pedido de usuário | é o que separa esta exceção de Cloud SQL. O banco está em toda requisição: adotá-lo é aceitar a disponibilidade do provedor como a nossa, e essa é outra classe de decisão |
| **4** | **O custo mensal está calculado ANTES e cabe no teto do alerta de orçamento** | é o critério que o cliente corrigiu em cima da minha primeira versão do ADR-0013, e ele continua sendo dele |
| **5** | **A saída está escrita e é medida em horas.** Quem desligar precisa saber como voltar | aqui a saída é: devolver os valores ao arquivo de ambiente e apontar `ENVIRONMENT` para fora de `prod`/`preprod`. Nenhuma linha de código, nenhum dado para migrar |
| **6** | **Está registrado em ADR, com decisor e data** | porque a ressalva do ADR-0013 era escrita, e o que revoga algo escrito precisa ser escrito |

**Aplicando o portão hoje, a conta fecha assim:**

| Serviço | 1 | 2 | 3 | 4 | 5 | 6 | Entra? |
|---|---|---|---|---|---|---|---|
| **Secret Manager** | sim, snapshot de disco | sim, `SecretProvider` com dois adaptadores | sim, lido uma vez na subida | ~US$ 0,50/mês neste tamanho | sim, horas | este ADR | **sim** |
| Cloud SQL | sim (RPO e PITR) | sim | **NÃO — está em toda requisição** | ~US$ 12–18/mês | migração de dados | ADR-0013 | **não hoje.** Gatilho inalterado: o primeiro dado de usuário real |
| GCS no caminho da aplicação | **NÃO** — MinIO já resolve, e o ADR-0013 mostra que falar o mesmo protocolo nos dois lados é o que mantém a portabilidade executada duas vezes por dia | sim | não | — | — | — | **não** |
| Cloud KMS | não hoje: a cifra local resolve, e o único segredo cifrado é apagado na revogação | sim, `SecretCipher` existe | sim | baixo | horas | — | **não hoje** |
| Pub/Sub, Cloud Tasks, fila gerenciada | **NÃO** — a fila é uma tabela com `SKIP LOCKED` por decisão de desenho, não por falta de dinheiro | — | não | — | — | — | **não** |

## O desenho

### A porta, e onde ela mora

`SecretProvider`, em `src/shared/ports/secret-provider.ts`. É porta transversal
(`shared/`) e não de módulo, porque quem precisa dela é a configuração, que não
é de módulo nenhum. Ela declara **o que EXIGE de quem a implementa**, e a lista é
normativa — está escrita no cabeçalho do arquivo, com o porquê de cada item.
As duas que mandam:

- **O nome pedido é o nome da variável de ambiente, e a relação é identidade.**
  `MAIL_API_TOKEN` procura o segredo `MAIL_API_TOKEN`. Sem tabela de tradução,
  sem prefixo montado em código. É a promessa que a §6 de `docs/07-devops.md` já
  fazia — *"o nome da variável não muda"* —, e tabela de tradução é onde o
  operador cria `mail-token-prod`, o código continua lendo outro nome, e a
  divergência aparece no ambiente que ninguém testa.
- **Ausência vira erro com o NOME dentro, sempre.** Nenhum adaptador deixa
  escapar o erro cru do provedor. Ver "Falha ruidosa", abaixo.

O adaptador do GCP é `src/shared/adapters/external/gcp-secret-manager.ts` e é
**o único arquivo do sistema que sabe que GCP existe**, como
`s3-object-storage.ts` é o único que sabe que S3 existe. A porta não sabe. O
portão de portabilidade ganhou uma regra nova para o domínio do gerenciador,
**com isca própria** em `tests/portabilidade/deve-reprovar-provedor.ts`: sem ela,
o nome do gerenciador escrito em `config/` só seria acusado como "um `.com`
qualquer", que é a família errada de achado e a mensagem errada para quem lê.

### REST à mão, e não o SDK do Google

Mesma pergunta do cabeçalho do `s3-object-storage.ts`, mesmo critério, mesma
resposta — e aqui há uma terceira razão que lá não existia:

1. **Quatro dependências de produção.** O cliente oficial puxa gRPC, protobuf e
   a camada de autenticação do Google para fazer **uma** requisição `GET` na
   subida do processo. E poria o nome do provedor no `package.json`, que é o
   lugar mais difícil de tirar depois.
2. **A superfície usada é uma chamada.** `versions/latest:access` devolve JSON
   com o valor em base64. Sem paginação, sem streaming, sem retentativa
   sofisticada para herdar. São ~40 linhas de HTTP.
3. **A liberação de lint é por módulo, não por `src/`.** A exceção de
   `no-restricted-imports` em `eslint.config.mjs` cobre
   `src/modules/<módulo>/adapters/external/`. Esta porta é transversal e mora em
   `shared/`: importar o SDK daqui reprovaria no lint, e a saída seria afrouxar o
   confinamento de SDK para todo o `src/shared/` — pagar com a fronteira de
   arquitetura inteira por uma conveniência de quarenta linhas. **Sem SDK, a
   pergunta não se coloca.** (A alternativa honesta seria estender a liberação
   para `src/*/adapters/external/`; ela é defensável e ficou registrada em
   "Alternativas", mas não é uma decisão que este trabalho devia tomar de
   passagem.)

A decisão se inverte no dia em que precisarmos de rotação notificada por Pub/Sub
ou de CMEK — e nesse dia ela se inverte **naquele arquivo**, sem tocar em mais
nada.

**A credencial vem do servidor de metadados da instância**, não de um arquivo de
conta de serviço. Um JSON de conta de serviço no disco seria o `.env` de volta,
com a agravante de abrir o gerenciador inteiro em vez de um segredo — e de ser
tão copiável quanto.

### Falha ruidosa, nos dois ambientes

A regra do projeto é que configuração ausente mata a subida citando o nome da
variável (§11.2, `requireEnv`). **Trocar a fonte não pode rebaixar isso**, e o
risco concreto é `permission denied` no log de subida: ele não diz qual segredo
faltou, e num arranque que resolve sete de uma vez essa é a única informação que
importa.

| Situação | `dev`, teste, `compose` | `prod` / `preprod` |
|---|---|---|
| Fonte | variável de ambiente (arquivo fora do git, por `env_file`) | Secret Manager, versão `latest` |
| Variável ausente | morre citando o nome | — |
| Variável **vazia** | vazio é ausência, morre citando o nome | idem, e diz que a versão existe e está VAZIA |
| Segredo não existe no gerenciador | — | morre citando o nome do segredo **e** explicando que o `403` do provedor significa *ou* "não existe" *ou* "sem `secretAccessor` nele" — porque ele não distingue os dois, e ler `403` como problema de IAM é o caminho errado mais comum |
| Versão inexistente ou desabilitada | — | morre citando o segredo e a versão |
| VM sem conta de serviço | — | morre citando o segredo, e dizendo que não é consertável por variável de ambiente |
| Rede/DNS/timeout | — | morre citando o segredo, nunca um erro de rede órfão |
| Faltam vários | — | morre **uma vez**, com a lista inteira, e não na primeira viagem de sete |

Duas regras que valem nos dois ambientes: **o valor nunca entra em mensagem de
erro, log, `cause` ou stack**, e **nada é escrito no ambiente se algum segredo
faltar** — resolução parcial deixaria o processo meio configurado no momento em
que a exceção sobe, e alguém, um dia, vai capturar essa exceção e tentar seguir.

### Qual ambiente usa qual, e por quê o predicado é reusado

`exigeGerenciadorDeSegredos` é **o mesmo predicado** de `exigeChaveDeRotacao`:
`NODE_ENV=production`, ou `ENVIRONMENT` em `prod`/`preprod`. Ele saiu de dentro
do `app-config.ts` para `shared/config/ambiente-hospedado.ts`, e as duas pontas
passaram a delegar — pelo motivo que já estava escrito lá: *"duas respostas
diferentes para 'estou num ambiente de gente de verdade?' viram duas verdades, e
a que fica para trás é sempre a que protege"*. Se divergissem, a subida passaria
a exigir uma chave de rotação que a outra metade não foi buscar.

`dev` e teste ficam de fora **de propósito**: em `localhost` o arquivo não entra
em snapshot de disco de VM nenhuma, que é o problema inteiro. Exigir nuvem para
rodar `npm test` seria atrito novo sem risco atrás dele — e é a mesma frase, com
os mesmos nomes, do ADR-0002.

### O gerenciador SOBRESCREVE o ambiente, e isso é decisão

Em `prod`/`preprod` o valor lido do gerenciador vence o que já estiver em
`process.env`. Se fosse o contrário, um `.env` esquecido no disco da VM
continuaria sendo a fonte de verdade **em silêncio**: o segredo seguiria em
snapshot, a rotação no gerenciador não teria efeito nenhum, e nada acusaria.
Duas fontes para o mesmo segredo não são redundância, são ambiguidade.

## O que este ADR NÃO faz

- **Nenhum segredo foi criado no GCP e nenhuma política de IAM foi tocada.** É
  do cliente, depois de ver este desenho. A recomendação é
  `roles/secretmanager.secretAccessor` **por segredo**, para a conta de serviço
  da VM, nunca no projeto.
- **A fiação em `src/bin/api.ts` e `src/bin/worker.ts` não foi escrita**, por
  disciplina de território: são duas linhas (`criarSecretProvider(environment)` e
  `await resolverSegredos(provider)`) **antes** de `loadAppConfig()`, e depois de
  `assertSafeBoot()`. Está dito aqui para não virar dívida sem dono.
- **`.env.example` não ganhou `SECRET_STORE_PROJECT` e `SECRET_STORE_VERSION`**,
  pelo mesmo motivo. Os nomes estão em `docs/07-devops.md` §3.5.

## Alternativas consideradas

| Opção | Por que não |
|---|---|
| **Continuar com `.env` no disco e cifrar o arquivo** | a chave para decifrar teria que estar na máquina, e entraria no mesmo snapshot. Move o problema um passo e o deixa mais difícil de ver |
| **Continuar com `.env` e excluir o arquivo do snapshot** (disco separado, sem snapshot) | resolve o fato 1 e **não resolve o 2**: rotacionar continua sendo `ssh` e editor de terminal. E acrescenta uma peça de infraestrutura cuja falha é silenciosa — ninguém percebe que o disco não está sendo copiado até precisar dele |
| **Usar o SDK `@google-cloud/secret-manager`** | dezenas de pacotes transitivos por uma chamada, o nome do provedor no `package.json`, e a necessidade de afrouxar o confinamento de SDK para todo o `src/shared/` |
| **Estender a liberação de lint para `src/*/adapters/external/`** | é a alternativa defensável, e talvez a certa no dia em que houver a segunda porta transversal com adaptador de provedor. Não é decisão para tomar de passagem dentro de outro trabalho, e não é necessária enquanto não houver SDK para importar |
| **Adotar Secret Manager em TODOS os ambientes, inclusive `dev`** | quebraria `npm test` e `docker compose up` sem credencial de nuvem, que é o contrário do contrato de portabilidade — e criaria adaptador que só roda em produção |
| **Fixar a versão do segredo em vez de ler `latest`** | devolveria a rotação para dentro do ciclo de entrega, que é o atrito que faz a rotação não acontecer. O custo aceito é que uma versão nova entra no próximo reinício, e não sob revisão |
| **Esperar o Cloud SQL e adotar os dois juntos** | são decisões independentes, e o gatilho do banco (primeiro dado real) não é o gatilho deste. Juntá-las faria a exceção maior do que precisa |

## Consequências

**Fica mais fácil:** rotacionar de verdade; dar acesso por segredo em vez de por
máquina; saber quem leu o quê, porque o gerenciador registra acesso e o arquivo
não registra nada.

**Fica mais difícil:** subir um ambiente hospedado novo, que passa a exigir os
segredos criados e o papel concedido antes do primeiro arranque — e é por isso
que a mensagem de falha carrega o nome do segredo e as duas leituras do `403`.
O primeiro arranque em `prod` também passa a depender de uma chamada de rede
que antes não existia; ela tem timeout de 5 segundos e mata a subida em vez de
pendurá-la.

**Passa a ser irreversível na prática:** nada. A saída é devolver os valores ao
arquivo de ambiente e apontar `ENVIRONMENT` para fora de `prod`/`preprod` —
nenhuma linha de código. O que mantém isso verdadeiro **não é este ADR**: é o
portão de portabilidade continuar reprovando nome de provedor fora de
`adapters/external/`, e o adaptador local continuar sendo o que roda em `dev`
todo dia.

**Precedente que fica aberto, e é o risco real deste ADR:** a primeira exceção é
a que ensina que exceções são possíveis. O contrapeso é a seção "O portão para o
próximo" — e ela só vale se a próxima proposta for obrigada a responder aos seis
itens por escrito. Se alguém adotar um serviço gerenciado sem esse ADR, o defeito
não é o serviço: é a regra ter virado recomendação.
