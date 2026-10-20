# ADR-0006: Consulta geoespacial no Postgres e o critério de quem é notificado

**Status:** aceito, com emenda 1
**Data:** 2026-09-17

**Emenda 1, 19/10/2026 (decisão do cliente):** a proibição de geocodificação
passa a ter uma exceção de **escopo fechado e um sentido só** —
**coordenada → nome de cidade**, pelo serviço de plataforma do aparelho, para
preencher o filtro de cidade da página de pets. **Endereço → coordenada
continua proibido**, e é a metade que o documento mais defendia. A coordenada
**não** entra em pedido da nossa API: o app resolve e manda só o nome da
cidade. Ver o fim do documento.

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

**Não há geocodificação no MVP** — *e a emenda 1 de 19/10/2026 abre um sentido
disto, o de coordenada para nome de cidade. Leia a emenda no fim do documento
antes de concluir qualquer coisa deste parágrafo.*

CEP e bairro são rótulo de exibição e filtro de
listagem, não fonte de coordenada: não há serviço de geocodificação contratado e
o SinPatinhas não tem API. **Esta metade — endereço virando coordenada —
continua inteira depois da emenda.** A coordenada vem de duas origens, e só
duas:

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

---

# Emenda 1 — coordenada vira nome de cidade, e só isso (19/10/2026)

**Decisão do cliente**, nas palavras dele:

> "autorizar o gps, e trazer algum valor padrão em caso de fallback"

Ela responde a um pedido que ele fez duas vezes. O primeiro foi *"a pagina de
pets, não deve escolher uma cidade, devemos mostrar todos os pets, ordenado pela
geolocalização do usuário"*; quando a frente respondeu com ordenação por
distância, ele corrigiu: *"mas eu não entendi o que a proximidade tem a ve? eu
quero que você pegue a cidade que o usuário esta pela localização dele e monte os
pets cadastrados nessa cidade"*. Não era ordem por distância. Era a **cidade**,
derivada da localização.

## O que esta emenda autoriza, e é uma frase

**Coordenada → nome de cidade**, no aparelho, pelo serviço de geocodificação
reversa da própria plataforma (`CLGeocoder` no iOS, `android.location.Geocoder`
no Android), para **preencher o filtro `city` da listagem pública de perdidos**.

## O que ela NÃO autoriza, e cada ausência tem dono

| Não autorizado | Por quê |
|---|---|
| **endereço, CEP ou bairro → coordenada** | é a metade que este documento mais defendia: *"o CEP que 'acha' o ponto de quem negou o GPS"*. O `map_pin` existe justamente para resolver isso com um toque e zero dependência, e continua sendo o caminho |
| **coordenada → bairro** | a emenda fala de **cidade**. Bairro é mais fino que o que a pessoa escolheu entregar, e o nível máximo em superfície pública continua bairro e cidade **como rótulo que o tutor digitou** (ADR-0010 itens 4 e 5) |
| **coordenada → endereço ou rua** | não foi pedido e não tem uso: o produto nunca mostra mais que bairro |
| **coordenada em pedido da nossa API** | segue valendo a frase desta mesma decisão: *"a listagem pública de perdidos filtra por cidade e bairro digitados, jamais por latitude e longitude"*. O app resolve no aparelho e manda **só o nome da cidade**, no parâmetro `city` que já existia. Nenhuma coordenada atravessa a nossa borda, e a projeção pública não ganhou um campo |
| **distância ou ordenação por proximidade** | foi medido que exigiria coordenada no pedido ou distância na resposta, e os dois seguem proibidos. `distance_m`, `distance_km` e `radius_m` continuam reprovados por `src/tools/portao-contrato-publico.ts` em qualquer operação alcançável sem conta |
| **serviço de geocodificação contratado** | continua não havendo. Se a plataforma passar a exigir chave de API ou conta de serviço, a natureza da decisão muda e esta emenda deixa de cobrir |

## O que o cliente aceitou em troca, e ele viu os três antes de decidir

A primeira versão desta decisão foi tomada sobre a premissa de que a resolução
acontecia **no aparelho, sem nada viajar**. **Essa premissa estava errada.** Ela
foi medida contra o README e o fonte do pacote, corrigida com o cliente, e ele
decidiu de novo com o fato na mesa. Fica registrado porque premissa errada é mais
fácil de repetir que decisão.

1. **Um terceiro no caminho de um dado pessoal.** A coordenada sai do aparelho
   para a Apple (iOS) ou para o Google (Android) a cada resolução. O README do
   pacote é literal: *"This plugin uses the free Geocoding services provided by
   the iOS, macOS and Android platforms. This means that there are restrictions
   to their use"*. Não existe resolução local.
2. **Teto de uso.** `PlatformException(IO_ERROR, ...)` significa, na maior parte
   das vezes, que o teto foi atingido — palavras do README. A resolução falha sob
   volume, e falhar é o caminho normal, não o excepcional.
3. **Indisponibilidade por país e por aparelho.** *"The availability of the
   Google Play Services depends on your country"*, e o geocoder do Android pode
   simplesmente não estar presente — é por isso que o pacote expõe `isPresent()`.

Isto **contradiz parcialmente** o raciocínio que escolheu o `geolocator` e ligou
`forceLocationManager: true` por padrão, cuja razão escrita era não ter *"uma
dependência de terceiro no caminho de um dado pessoal"*. Aquela escolha
**continua valendo para a medição da posição**, e o que mudou é que a conversão
para nome de cidade passou a existir, com terceiro, por decisão datada. As duas
coisas são separadas de propósito: quem desligar a resolução de cidade não
degrada a medição de posição.

## A alternativa que foi medida e recusada, com o número

Preencher o filtro com `Me.reference_area.city` — a cidade que a pessoa já
informou no perfil. Zero dependência, zero terceiro, e é rótulo e não
geocodificação. Medido em homologação em 19/10/2026: **3 de 47 contas** têm
`reference_city` preenchido, e **nenhum visitante deslogado** tem. Ela cobriria
6% das contas, e o cliente pediu duas vezes a cidade de quem está usando o app.

Ela **não foi descartada**: virou a segunda reserva da cadeia.

## A cadeia de reserva, e nenhum elo pode travar a tela

1. **cidade resolvida pelo GPS**, com permissão concedida;
2. **`Me.reference_area.city`**, a cidade que a pessoa informou — rótulo, e por
   isso legítima aqui;
3. **os 20 casos abertos mais recentes do país inteiro, sem cidade nenhuma.**

A terceira é o estado em que a página já funciona, e ela **nunca mente sobre
onde a pessoa está**. Fixar uma cidade no código como "valor padrão" foi
recusado: *"São Paulo"* como padrão faria quem abre o app em Recife ver pets de
São Paulo sem entender por quê, o que é pior que a lista nacional.

**Oito motivos de a resolução não dar nome, e os oito caem para a reserva sem
erro na tela**: permissão negada, permissão negada em definitivo, serviço de
localização desligado, GPS sem fix no prazo, localização indisponível no build,
geocoder ausente no aparelho, teto de uso estourado e resolução sem resultado.
Eles vivem em `MotivoDeNaoTerCidade`, em `app/lib/dispositivo/localizacao.dart`.

## A grade de ~100 m vale para a resolução também

Este documento exige que a localização do usuário seja quantizada numa grade de
cerca de 100 m, porque *"precisão maior não melhora em nada um raio de 5 km e só
aumenta o dano de um vazamento"*. O mesmo raciocínio vale, com folga, para nome
de cidade: **andar 100 m não troca a cidade.** Por isso a porta do aparelho
guarda a última resolução e só repergunta quando o ponto se move além da grade.
Sem isso, cada abertura da tela mandaria a coordenada ao terceiro de novo, sem
nenhuma chance de a resposta mudar — gastando o teto de uso de quem mais usa o
app, que é justamente quem está procurando um pet.

## Onde a proibição que sobrou passa a morar, e por que ela ficou mais frágil

**Isto é a parte desta emenda que exige mais cuidado de quem vier depois.**

A proibição de endereço → coordenada era garantida pela **ausência da
dependência**: o código para converter não estava no binário, e nenhuma
disciplina era necessária. O pacote `geocoding` traz os **dois** sentidos no
mesmo arquivo, e não há como importar meio pacote. Então a garantia mudou de
forma: ela passou a ser **asserção sobre o uso**, que é mais fraca por natureza.

O portão `app/test/dispositivo/sem_geocodificacao_test.dart` **foi estreitado, e
não removido**. Ele passou a:

- permitir **um** pacote, nomeado e datado, e reprovar se ele **sair** — porque
  perder a resolução em silêncio derrubaria a cidade para a reserva sem ninguém
  perceber;
- permitir `placemarkFromCoordinates` **só dentro da porta do aparelho**, e
  reprovar a chamada ou o importe em qualquer outro arquivo;
- reprovar `locationFromAddress` e os nomes equivalentes **em qualquer arquivo,
  a porta inclusive** — caso próprio, e não linha numa lista geral, porque linha
  em lista geral desaparece numa edição distraída;
- manter a **camada 3 intocada**. Ela é a que não depende de nome: `AreaDigitada`
  não carrega coordenada e `PontoCapturado` não carrega bairro nem cidade. Depois
  desta emenda ela é a camada que mais importa, porque é a única que sobrevive a
  alguém escrever a conversão à mão.
