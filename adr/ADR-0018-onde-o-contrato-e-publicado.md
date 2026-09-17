# ADR-0018: Onde o contrato é publicado, e para quem

**Status:** aceito
**Data:** 2026-09-17
**Depende de:** ADR-0016 (a borda que roteia), ADR-0017 (o consumidor externo)

O cliente decidiu, por escrito, que a Swagger UI é **fechada** e não vai ao ar
pública. O mecanismo é o deste ADR: os dois, autenticação **e** restrição a
ambiente.

## Contexto

O ADR-0001 diz "Swagger UI é servido da mesma spec", e `docs/03-arquitetura.md`
repete. **Não existe.** Não há pacote de UI em `package.json` e não há rota
registrada em `src/bin/api.ts`. Hoje o contrato existe só como arquivo no
repositório, e a promessa escrita em dois documentos é promessa não cumprida.

Isso era tolerável enquanto o único consumidor era o app Flutter, feito pelo
mesmo squad, com acesso ao repositório. Deixou de ser: o ADR-0017 tirou as oito
páginas públicas deste serviço e passou-as para um front web de outro time.
**Existe um consumidor externo do contrato**, e mandar um YAML de 79 operações
por e-mail não é entrega de contrato — é entrega de arquivo.

E há a pergunta que ninguém fez ainda, e que é a razão de isso ser um ADR em vez
de uma tarefa: **uma UI de API aberta publica a superfície inteira do produto**,
incluindo o caminho de reautenticação, o de transferência de pet e o de
revogação de tag. Não é vazamento de credencial, mas é o mapa: quem vai atacar
um produto começa por saber o que ele tem, e uma UI navegável entrega isso
pronto, com exemplos.

## Decisão

### 1. A UI vai ao ar. Em `preprod`, e nunca em produção

| Ambiente | Swagger UI | Por quê |
|---|---|---|
| `dev`, `qa`, `preprod` | **sim** | é onde o outro time implementa e onde este squad revisa |
| `prod` | **não** | não há consumidor legítimo dela em produção, e há um ilegítimo |

Em produção, o app e o front web já foram construídos contra o contrato: eles
não leem a UI em tempo de execução, leem em tempo de desenvolvimento. Publicar
em produção não serve a ninguém que já não tenha o que precisa, e serve a quem
está procurando por onde começar.

Isso não é segurança por obscuridade — a segurança está nos esquemas declarados e
na revalidação no serviço, e continuaria valendo com a UI aberta. É recusar
oferecer o mapa de graça quando oferecer não tem benefício. A distinção importa:
se alguém precisar da UI em produção um dia, a resposta é liberar com acesso
controlado, não é "não pode porque é secreto".

### 2. Fechada por credencial de rede, na borda

Nos três ambientes onde ela existe, a UI fica atrás de autenticação básica na
borda, com credencial de ambiente. Na borda, e não na aplicação, por dois
motivos:

- é a única coisa deste projeto que a borda pode proteger **inteira** sem
  conhecer o produto: é um caminho estático, sem regra de negócio;
- protegê-la na aplicação significaria escrever um caminho de autenticação que
  não é nenhum dos cinco esquemas do contrato, só para uma página de
  documentação. Esquema de autenticação número seis, existindo só para a
  documentação, é superfície nova pelo motivo mais fraco possível.

### 2.1 "Fechada" precisa ser provada, não configurada e esquecida

Uma UI que está fechada porque alguém configurou certo no dia da implantação é o
tipo de garantia que se perde em silêncio: muda o ambiente, muda quem implanta,
e ninguém recebe aviso quando ela volta a responder 200 para qualquer um. Como
está escrito no topo do `ci.yml` deste projeto, job que fica verde sem verificar
não é neutro — ele ocupa o lugar de um que funcionaria.

Requisito, seguindo o precedente de `infra/verificacao/verificar_associacao.py`:
uma **verificação externa e agendada**, que roda de fora, sem acesso
privilegiado, porque o ponto de vista que importa é o de quem está na internet.
Ela precisa afirmar três coisas, e reprovar em qualquer uma:

1. em **produção**, `GET {API_BASE_URL}/v1/docs` e `GET
   {API_BASE_URL}/v1/openapi.yaml` respondem **404**, sem credencial nenhuma —
   não 401, não 403: o caminho não existe ali;
2. em **homologação**, os dois respondem **401** sem credencial. Um 200 aqui é
   reprovação: significa que a exigência caiu;
3. em **homologação**, com a credencial, respondem 200 — porque uma proteção que
   também barra quem deveria entrar seria descoberta pelo outro time, não por
   nós, e no pior momento.

**Quando não conseguir verificar, reprova**, com o motivo. Falha de rede, de DNS,
de TLS ou de leitura de configuração são reprovação, nunca "está tudo bem": a
assimetria é deliberada, porque confiança falsa é pior que ausência de
verificação — ninguém procura o que acredita já ter.

O caso que essa verificação **precisa** reprovar vai junto no repositório, e a
esteira exige a reprovação dele. Prova negativa que vive numa frase evapora: sem
o caso guardado, a verificação passa a valer pela confiança no dia em que foi
escrita.

### 2.2 Como o outro time consome

**Pela UI fechada, no ambiente de homologação, com credencial de ambiente.** Não
pelo YAML enviado, e não por acesso ao repositório.

O motivo é o mesmo do item 3: qualquer forma de entrega que produza um arquivo na
mão deles é uma cópia, e a cópia envelhece na primeira mudança do contrato sem
que ninguém perceba. A UI lê o arquivo vivo; se o contrato mudar hoje, eles veem
a mudança hoje.

A credencial é a mesma que já existe para o acesso ao ambiente de homologação, e
ela precisa estar emitida **antes** de o outro time começar — o que a coloca no
mesmo caminho crítico datado do ADR-0017.

### 3. Ela lê `api/openapi.yaml`. Nunca uma cópia

**Requisito duro, e é o item pelo qual este ADR existe:** a UI é servida a partir
do mesmo arquivo que a aplicação carrega na subida (`carregarContrato`,
`config.openapiSpecPath`). Não há cópia no build, não há arquivo publicado em
bucket, não há spec "de documentação".

Documentação que vira cópia é a segunda fonte da verdade que este projeto inteiro
foi desenhado para não ter, e ela é a pior das segundas fontes: ninguém revisa
documentação com o mesmo cuidado com que revisa contrato, então a cópia envelhece
e ninguém percebe até alguém implementar contra ela.

A consequência prática, que precisa estar escrita para quem implementa: a rota da
UI serve o **mesmo `api/openapi.yaml` do disco**, e o processo derruba a
aplicação na subida se ele não carregar — o que já acontece hoje. Uma UI que
mostra a versão de ontem porque o arquivo dela é outro é exatamente o defeito que
este item proíbe.

### 4. Quem serve

A rota vive na aplicação (`/v1/docs` e `/v1/openapi.yaml`), atrás da borda como
todo o resto, e por isso segue a regra do ADR-0016: caminho sob `/v1`, sem
reescrita. A borda apenas acrescenta a exigência de credencial no caminho
`/v1/docs*` e recusa esse caminho inteiro no ambiente de produção.

Servir a UI de um bucket estático foi considerado e descartado: exigiria publicar
uma cópia da spec junto, que é o que o item 3 proíbe.

**Os dois caminhos não são declarados em `api/openapi.yaml`, e é decisão.** Um
contrato que descreve o próprio visualizador é um contrato que descreve a
ferramenta em vez do produto, e o `operationId` dele viraria função no cliente
gerado do app. A regra "rota sem `security` declarado não sobe" continua íntegra:
ela vale para a superfície do produto, e a UI não é superfície do produto — a
credencial dela é exigida na borda, que é onde ela está escrita.

## Alternativas consideradas

| Opção | Prós | Contras | Por que não |
|---|---|---|---|
| Nenhuma UI; o outro time consome o YAML do repositório | zero trabalho | dá acesso ao repositório a um time externo, ou cria o envio manual de arquivo — que é cópia, e envelhece na primeira mudança | o problema que se quer resolver é justamente a cópia |
| UI pública em produção | ninguém precisa de credencial | publica o mapa da superfície, incluindo reautenticação, transferência e revogação de tag | não há consumidor legítimo em produção que já não tenha o contrato |
| UI num bucket estático com CDN | não consome o serviço | precisa de uma cópia da spec publicada junto | viola o item 3, que é a razão deste ADR |
| Portal de documentação de terceiro | melhor navegação, changelog | a spec sai do nosso controle e vira cópia hospedada fora; e é ferramenta nova a dez semanas do fim | custo e amarração sem ganho proporcional |

## Consequências

**Fica mais fácil:** o outro time implementa as páginas lendo um contrato
navegável em vez de um YAML; e a promessa que estava escrita no ADR-0001 e na
arquitetura passa a ser verdadeira.

**Fica mais difícil:** a borda passa a ter uma credencial de ambiente para
administrar, que é segredo novo, e ele entra na mesma política de segredos do
resto.

**O que fica em aberto:** instalar o pacote e registrar a rota é implementação, e
não é minha. A credencial da UI em homologação precisa existir antes de o outro
time começar, o que a coloca no mesmo caminho crítico do ADR-0017.
