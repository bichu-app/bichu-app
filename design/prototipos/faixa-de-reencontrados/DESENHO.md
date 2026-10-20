# Faixa de reencontrados — desenho

**Bichu · 20/10/2026 · protótipo HTML no lugar do Figma**, por autorização do
cliente de 23/09/2026 (a conta não tem cota). Abra `index.html` no navegador: o
painel do topo troca a largura (320, 375, 412 dp) e as seis telas.

## A decisão, e o número que a produziu

O cliente decidiu em 20/10, em três rodadas no mesmo dia:

1. *"quando o usuário confirmar que o pet foi encontrado, vamos criar uma tag na
   seção de pets e um filtro para mostrar que o pet foi encontrado pela
   comunidade"*;
2. *"o pet ganha um selo/filtro na pagina de pets como encontrado por 30 dias e
   depois ele expira e sai"*, e **"Também na lista padrão"**;
3. depois da medição abaixo, **faixa separada**, sem disputar as 20 vagas.

**O que mudou a terceira decisão foi uma medição, não uma opinião.** A rota
ordena por `last_seen_at DESC`, e um pet reencontrado foi visto por último
**antes** de voltar — o `last_seen_at` dele é necessariamente mais velho que o de
um caso aberto hoje. Medido contra Postgres com massa realista (reencontrados
encerrados nos últimos 30 dias, caso durando de 1 a 14 dias):

| | |
|---|---|
| composição da página 1 | **20 de 20 abertos, ZERO reencontrados** |
| posição do primeiro reencontrado | **250** → página **13** |
| corte da página 1 | `last_seen_at` de ~2 h atrás |
| reencontrado mais recente | 27 h atrás |

Com os dois conjuntos na mesma lista ele abriria o app e **não veria selo
nenhum**. A faixa é consulta separada: ela não disputa as vinte vagas, não muda a
ordem, e aparece sempre.

## Como ela não parece a lista principal, em três eixos

Quem abre esta tela está procurando um animal perdido. A faixa não pode ser a
primeira coisa que o olho encontra nem ser confundida com a lista. Três eixos, e
nenhum deles é só cor (WCAG 2.1 SC 1.4.1):

1. **POSIÇÃO.** Ela vem **depois** da barra de busca e do resumo. O primeiro
   controle da tela continua sendo a busca, e o primeiro texto continua sendo
   *"18 pets perdidos"*. A faixa entra abaixo disso, antes do primeiro cartão.
2. **FORMA.** Cartão **deitado** de 232 × 122 dp em trilha horizontal, contra o
   cartão **vertical** de largura inteira da lista. Medido no navegador a 320 dp:
   a trilha mostra 1,2 cartão, então o segundo espia e diz que rola.
3. **TINTA.** `successContainer` (`sage-100`), o mesmo chão que a `Rede` desenha,
   contra o `surface` com borda `outline` da lista. O chip do item é
   `successContainer` com texto `textPrimary` — medido: 14,39:1 no tema claro e
   11,20:1 no escuro, contra os 4,47:1 que `success` daria no claro e reprovaria
   o 4,5:1 de texto pequeno.

## As quatro perguntas que o coordenador fez

### 1. Zero reencontrados — a faixa some inteira

Tela `ZERO reencontrados`. Não fica título órfão, não fica caixa verde vazia, não
fica *"nenhum pet voltou ainda"*. A tela é **idêntica** à de antes desta entrega.

O motivo é o mesmo da BICHUS-62: tela que afirma coisa sobre dado que ela não
tem. Uma faixa vazia dizendo *"ninguém voltou"* seria uma afirmação sobre a
comunidade inteira a partir de um recorte de 30 dias numa cidade.

### 2. O 11º item — rolagem horizontal, e o último lugar abre o filtro

Tela `mais de 10`. A trilha mostra **10** cartões; o 11º lugar é um alvo
`Ver os N outros` que abre a folha de filtros com `Encontrados` marcado.

As três saídas consideradas, e por que esta:

| saída | por que não |
|---|---|
| **corte seco** no 10º | esconde item sem dizer que escondeu, e quem voltou no 11º some da única superfície onde ele aparece |
| **"ver todos" sozinho**, sem rolagem | troca seis toques por um, mas transforma a faixa numa linha de texto: o cliente pediu para **mostrar** que o pet voltou, e uma linha que leva a outra tela não mostra nada |
| **rolagem + alvo no fim** (escolhida) | mostra os dez primeiros sem custo nenhum, não esconde ninguém, e o alvo é o **fim da rolagem** e não um substituto dela |

**Dez, e não vinte**, porque o teto da rota é `limit: 20` e a faixa é um aperitivo,
não uma segunda lista. Dez cartões de 232 dp são 2 584 dp de trilha — já é
rolagem longa a 320 dp.

### 3. Não roubar a primeira coisa que o olho encontra

Resolvido pelos três eixos acima. O ponto que decide é o **1**: ela está abaixo
do resumo. Se um dia alguém a subir para cima da busca, o cliente perde a busca
como primeira ação — e é isso que a isca de ordem deve travar quando o código
existir.

### 4. Deslogado

Tela `deslogado`. A lista é pública e a faixa também. **Nada muda na faixa sem
conta**: ela não tem ação que exija conta, e o toque num item abre a página
pública do caso pelo `share_token`. A única diferença na tela é a foto da barra
de topo, que já era assim.

## O selo em cada item, sem repetir a frase inteira

O chip do cartão da faixa diz **`Encontrado`**. Quem diz *pela comunidade* é o
título da faixa — **uma vez, e não dez**.

A frase inteira continua em **cada** item, no `aria-label` do cartão
(`"Encontrado pela comunidade. Mel, Vila Mariana, São Paulo. Voltou há 3
dias."`), porque quem usa leitor de tela **não** recebe o título da seção junto
do item: ele desliza de cartão em cartão.

No filtro `Encontrados`, onde não há título de seção porque os reencontrados são
a lista inteira, o chip volta a dizer a frase inteira — é a tela
`filtro Encontrados`.

## O que o protótipo NÃO muda, e é de propósito

- **`barra_de_listagem.dart` continua intocado.** O grupo `Estado` da folha é
  dado entregue ao componente compartilhado, como já é hoje;
- **a janela de 30 dias continua valendo** na faixa e no filtro: reencontrado com
  31 dias sai dos dois;
- **o selo é derivado por item** (`status === 'closed_reunited'`), nunca do
  conjunto que a tela pediu;
- **o conjunto aberto não perde nenhuma linha nem nenhuma vaga.** Com a faixa
  isso fica mais forte do que estava com a união: a lista de abertos volta a ser
  **exatamente** o recorte histórico, e a faixa é outra consulta;
- **nenhum dado novo no cartão** além do que a Emenda 4 do ADR-0010 já autoriza:
  nome de exibição, bairro e cidade, e o tempo desde o reencontro. Sem data
  exata, sem coordenada, sem quem encontrou, sem identificador interno.

## O que fica para a implementação decidir, e está anotado

- **O "Voltou há N dias" do cartão** vem de `closed_at`, que **não** está em
  `PublicLostPet` hoje. Ou o campo entra na projeção pública — e aí a Emenda 4
  precisa dizer, porque é um fato novo sobre o animal e o lugar —, ou o cartão
  mostra só nome e bairro. **Eu recomendo a segunda**: o selo precisa dizer que
  voltou, não quando, e a janela de 30 dias é aplicada pelo servidor. O protótipo
  desenha a linha para a decisão ser tomada vendo-a, não imaginando-a.
- **Quantas chamadas a tela faz.** A faixa é um segundo `GET` com
  `case_state=reunited&limit=10`. Duas chamadas ao abrir `Pets`, e a segunda é a
  barata (índice próprio, 33 ms medidos com 20 000 casos).
