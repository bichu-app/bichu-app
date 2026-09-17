# ADR-0001: Monólito modular em TypeScript, sem BFF, com borda única

**Status:** aceito, com as seções "Sem BFF" e "Borda" substituídas pelo ADR-0016
**Data:** 2026-09-17
**Revisado em:** 2026-09-17 — a nuvem deixou de ser AWS e passou a ser decisao
adiada (ADR-0012). A decisao de monolito modular, de contrato e de ausencia de
BFF nao muda; a descricao da borda deixou de nomear servico de provedor.
**Revisado em:** 2026-09-17 — o cliente decidiu implementar uma camada de
gateway em `/v1`. A borda descrita aqui era um proxy reverso cego; ela passa a
conhecer caminho, e a decisão vigente sobre ela é o **ADR-0016**. Este ADR
continua valendo para tudo o mais: monólito modular, limites entre módulos,
persistência, contrato e revalidação no serviço.

## Contexto

Treze dias de desenvolvimento, um squad de agentes, um único cliente móvel
(Flutter) e uma superfície pública em HTML servida pelo mesmo produto (ela saiu
daqui em 17/09/2026, pelo ADR-0017). A stack
está fixada: TypeScript, PostgreSQL, armazenamento de objeto, GitHub Actions,
sem Python. **A nuvem não está escolhida** (ADR-0012): o desenvolvimento roda em
Docker local e o provedor será decidido depois.

A pergunta estrutural não é "microsserviço ou monólito": com este prazo e este
time, serviço separado é monólito distribuído com o pior dos dois mundos. A
pergunta é onde ficam os limites internos e o que entra na borda.

## Decisão

**Um serviço, um repositório, um banco.** Monólito modular em Node 22 LTS com
Fastify, organizado por Clean Architecture, com módulos de domínio que não se
importam entre si diretamente:

```
identity · pets · tags · lostfound · messaging · professionals · notifications · media · audit
```

A primeira fronteira extraível é `media`, e ela só é extraível de verdade
depois do ADR-0016: até 17/09/2026 as operações de mídia estavam espalhadas por
três prefixos (`/pets`, `/found-reports`, `/finder`), o que tornava impossível
roteá-la para fora sem uma lista de caminhos à mão. O ADR-0016 move as três
operações de mídia pura para `/v1/media/` e registra o limite: as duas operações
de foto que pertencem a `pets` **não** saem junto.

Dependência aponta para dentro. O domínio não conhece Fastify, S3, FCM nem
Postgres. Módulo fala com módulo por porta declarada no módulo consumidor, nunca
por `import` de tabela alheia. Cada módulo tem seu próprio conjunto de tabelas e
nenhum `JOIN` atravessa fronteira de módulo: quando precisar, a consulta passa
pela porta. É esta regra, e só ela, que torna a extração de um serviço uma
decisão futura em vez de um projeto.

**Persistência:** Kysely (construtor de consultas tipado) sobre `node-postgres`,
com migrações em SQL puro versionadas. Sem ORM com mapeamento mágico.

**Contrato:** `api/openapi.yaml` é a fonte da verdade e é escrito antes do
código. Como os schemas de OpenAPI 3.1 **são** JSON Schema 2020-12, e o Fastify
valida com JSON Schema, a mesma definição que documenta é a que valida em tempo
de execução. Uma fonte, não duas. Swagger UI é servido da mesma spec; Spectral e
comparação de compatibilidade rodam na esteira como portão.

**Sem BFF.** As três condições do BFF não se cumprem: há um cliente só, a rota
pública consome uma projeção que o próprio serviço já produz, e não existe um
segundo cliente com forma diferente do mesmo dado. Um BFF aqui seria uma segunda
superfície de deriva sem nada em troca.

> **Continua valendo, e não é o que foi pedido depois.** O cliente pediu uma
> *camada de gateway*, que é outra coisa: borda genérica que roteia e protege,
> proibida de conhecer o produto. BFF é uma camada **por cliente**, que conhece
> as telas daquele cliente e devolve a tela pronta. O ADR-0016 constrói o
> gateway; nenhum BFF foi criado, e a recusa acima segue de pé pelos mesmos
> motivos. Se algum dia a resposta de uma operação for moldada a uma tela
> específica na borda, esta seção foi violada.

**Borda — substituída pelo ADR-0016.** O que está descrito abaixo foi o desenho
até 17/09/2026 e ficou pequeno: era um `reverse_proxy` catch-all, que não
conhecia `/v1` nem caminho nenhum, e por isso não havia onde apoiar a extração de
um módulo. **Leia o ADR-0016 para o desenho vigente**, inclusive para onde o
`/v1` passa a viver, por que a borda não reescreve caminho, por que ela não
valida token, e por que o teto por operação continua sendo do contrato.

O desenho anterior, para registro: um **proxy reverso na frente do serviço**, e
não um produto de nuvem: um container (Caddy ou Nginx) no `compose.yaml` e no
mínimo hospedado, com TLS, limite por IP, tamanho máximo de requisição, CORS e
propagação de `X-Correlation-Id`. Quando a nuvem for escolhida, o papel pode
passar para o gateway ou a CDN do provedor sem que a aplicação mude, **porque
nada do que a borda faz é exclusivo dela** — e essa substituibilidade é
justamente o que o ADR-0016 preserva ao recusar plugin e validação de token na
borda.

**O serviço revalida tudo**: limite por código de tag, limite por conta e
validação de token acontecem também dentro, porque basta um job ou uma rota
interna nova para a borda ser contornada. Essa duplicação, que em outro desenho
seria desperdício, é o que torna a borda substituível.

**Sem HTML, desde o ADR-0017.** As oito rotas públicas em página saíram para um
front web de outro time; o que fica aqui é a mesma lógica exposta em JSON. Os
módulos e os limites entre eles não mudam, e a superfície pública em HTML citada
no Contexto deixou de ser servida por este produto.

**Limite de chamadas no MVP roda em processo**, com o serviço em uma única
tarefa. Quando passar de uma tarefa, o contador precisa sair para um armazenamento
compartilhado; está registrado como dívida com gatilho em `docs/03-arquitetura.md`.

## Alternativas consideradas

| Opção | Prós | Contras | Por que não |
|---|---|---|---|
| Microsserviços por domínio | escala e ciclo de vida independentes | 5 pipelines, 5 deploys, transação distribuída no fluxo mais crítico | não há escala nem time que justifique; em 13 dias, custo puro |
| NestJS | estrutura pronta, injeção de dependência | camada de abstração e tempo de partida maiores, mais convenção para o squad seguir | Fastify + composição manual entrega o mesmo limite com menos superfície |
| Prisma | produtividade, migrações geradas | `geography` do PostGIS é tipo não suportado: toda consulta geográfica viraria SQL cru | o raio de 5 km é o coração do produto; não pode ser o caso excepcional do ORM |
| BFF para o app | resposta moldada à tela | segunda definição de "o que a tela precisa", que deriva | cliente único; a API já é modelada por caso de uso |
| Função sob demanda por endpoint | custo zero ocioso | partida a frio no scan da tag, que tem meta de 60 s do scan ao aviso, e amarração ao provedor | latência no único fluxo que não pode ser lento, e a nuvem nem foi escolhida |

## Consequências

Fica mais fácil: entregar em 13 dias, rodar tudo localmente com um
`compose.yaml`, alterar contrato e implementação no mesmo PR, e depurar um fluxo
inteiro com um `correlation_id`.

Fica mais difícil: escalar uma parte sozinha (o serviço escala inteiro) e
impedir por ferramenta que um módulo importe outro — isso depende de regra de
lint de fronteira, que precisa existir na esteira, e de revisão.

Passa a ser irreversível dentro do MVP: a escolha do runtime e do contrato REST.
Trocar para GraphQL depois significa reescrever o cliente.
