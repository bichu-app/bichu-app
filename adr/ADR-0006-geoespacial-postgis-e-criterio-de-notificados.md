# ADR-0006: Consulta geoespacial no Postgres e o critério de quem é notificado

**Status:** aceito
**Data:** 2026-09-17
**Revisado em:** 2026-09-17 — a nuvem deixou de ser AWS e passou a ser decisao
adiada. A decisao de usar PostGIS continua de pe; muda de onde ele vem (container,
nao engine gerenciada) e passa a existir uma lista do que verificar no dia da
escolha, porque a versao de PostGIS varia entre provedores.

## Contexto

O alerta em 5 km é o coração do produto e a métrica que decide se ele funciona
não é o número de cadastros: é **200 tutores alcançáveis por push num raio de
5 km em pelo menos uma região**. A consulta precisa ser correta (distância
esférica, não plana), rápida com índice, e honesta quando não consegue
responder.

## Decisão

**PostGIS, com `geography(Point, 4326)` e índice GiST.** Uma extensão, um tipo,
`ST_DWithin` acelerado por índice e distância em metros sem conversão manual.

**De onde ele vem hoje: container.** A imagem é
**`postgis/postgis:16-3.4`**, pinada por digest no `compose.yaml`, e usada
igualmente em desenvolvimento, teste e esteira — PostgreSQL 16 com PostGIS 3.4.
A extensão é criada pela **primeira migração** (`CREATE EXTENSION IF NOT EXISTS
postgis;`), nunca por script de imagem e nunca à mão: é assim que o mesmo
comando reproduz o banco em qualquer destino.

### O que verificar no dia em que a nuvem for escolhida

A versão de PostGIS varia entre provedores e entre versões de engine, e o que
quebra costuma ser privilégio, não função. Antes de aprovar o provedor:

1. **A extensão está na lista permitida** e em qual versão. Exigimos PostGIS
   **3.3 ou superior** com PostgreSQL 15 ou superior; abaixo disso, reavaliar.
2. **Qual papel pode executar `CREATE EXTENSION`.** Em serviço gerenciado isso
   costuma exigir um papel específico, e o usuário da aplicação normalmente não
   o tem. A migração inicial pode precisar rodar com outro papel, e isso muda a
   esteira, não o código.
3. **Diferença de versão menor não altera nada que usamos**, porque usamos um
   subconjunto pequeno e antigo: `geography`, `ST_DWithin`, `ST_Distance`,
   `ST_MakePoint`, `ST_SetSRID` e índice GiST.
4. **`pg_dump` e restauração preservam colunas `geography`** entre a versão do
   container e a do destino. Testar a restauração antes de migrar dado real.
5. **Não usamos, e não passaremos a usar sem novo ADR:** raster, topologia,
   `postgis_tiger_geocoder`, `pgrouting` e qualquer extensão adicional. São
   justamente as que costumam não ser oferecidas, e nenhuma delas resolve algo
   que este produto precise.

**A localização do usuário é quantizada em uma grade de cerca de 100 m antes de
ser gravada**, e existe **uma linha por usuário**, sempre a última. Não há
histórico de localização de usuário neste produto. Precisão maior não melhora em
nada um raio de 5 km e só aumenta o dano de um vazamento. Validade de 30 dias;
expirada, o usuário sai da base de alerta até informar de novo.

**Não há geocodificação no MVP.** CEP e bairro são rótulo de exibição e filtro de
listagem, não fonte de coordenada: não há serviço de geocodificação contratado e
o SinPatinhas não tem API. A coordenada vem de duas origens, e só duas:

1. `device_gps` — permissão concedida no app;
2. `map_pin` — **um toque no mapa durante o cadastro**, dizendo aproximadamente
   onde a pessoa mora.

O `map_pin` existe por um motivo que precisa estar escrito: sem ele, quem nega a
permissão de localização sai do raio de alerta, e a base alcançável encolhe
exatamente na métrica que decide o produto.

### Quem entra na lista de notificados

Um usuário é notificado quando **todas** as condições valem:

1. tem localização conhecida, de qualquer uma das duas origens;
2. essa localização foi capturada há **30 dias ou menos**;
3. `ST_DWithin(localizacao, ponto_do_caso, 5000)` é verdadeiro;
4. tem ao menos um aparelho com `push_permission = granted` e token válido;
5. não é o próprio tutor do caso;
6. não recebeu mais de **3 alertas nas últimas 24 h** (teto de fadiga);
7. o caso não mandou alerta nas últimas 24 h (um disparo por caso por dia).

**Teto de 500 destinatários por disparo**, ordenados por distância crescente.
O teto existe para limitar custo e efeito de um caso em região densa; quando ele
é atingido, fica registrado no disparo, porque isso muda a leitura da métrica.

**O centro do raio é a última localização conhecida do pet** informada pelo
tutor ao abrir o caso; na ausência dela, a localização de referência do tutor.

**Falha de cálculo não vira zero.** A prévia devolve `reach_status: unavailable`
com `reachable_tutors: null`, e a tela diz que não conseguiu calcular. Mostrar
zero quando houve erro é a forma mais barata de mentir para alguém em pânico, e
verificação que não consegue verificar precisa dizer que não conseguiu.

**Coordenada nunca sai em resposta pública.** A listagem pública de perdidos
filtra por cidade e bairro digitados, jamais por latitude e longitude: um ponto
por caso, ainda que arredondado, permite montar o mapa que a regra de privacidade
existe para impedir.

## Alternativas consideradas

| Opção | Prós | Contras | Por que não |
|---|---|---|---|
| `cube` + `earthdistance` | já vem no Postgres | API antiga, pouco expressiva, e a evolução para o diretório de profissionais pediria PostGIS do mesmo jeito | adia um trabalho que já sabemos que virá |
| Caixa delimitadora + haversine à mão | zero extensão | reimplementa o que a extensão faz certo, e erra nas bordas | risco desnecessário no fluxo mais crítico |
| Geohash com prefixo indexado | simples, sem extensão | consulta por raio vira união de células, com bordas imprecisas | precisão inconsistente em 5 km |
| Serviço de geocodificação de CEP | alcança quem nega GPS sem pedir toque no mapa | custo, conta nova e dependência externa no caminho crítico | `map_pin` resolve com um toque e zero dependência |
| Histórico de localização do usuário | melhores heurísticas depois | dado sensível acumulado sem finalidade declarada | LGPD: minimização não é opcional |

## Consequências

Fica mais fácil: uma consulta correta e indexada, e o diretório de profissionais
por proximidade depois sem nova decisão.

Fica mais difícil: o ambiente local precisa da imagem com PostGIS, a esteira
precisa criar a extensão na migração inicial, e o dia da escolha de nuvem ganha
uma lista de verificação que alguém precisa executar antes de aprovar o
provedor.

Consequência de produto que precisa chegar a quem define escopo: **o alcance do
alerta depende de permissão de localização ou do toque no mapa.** Quem não
concede nem um nem outro não é alcançável, e não deve ser contado na métrica dos
200 tutores. O número honesto é o de usuários com localização válida e push
concedido, não o de cadastros.
