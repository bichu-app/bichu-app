# Os dois motores, no mesmo corpus

Corpus de 10.011 linhas (os dois medidos no MESMO corpus, para a comparação valer).
Motor de hoje: `texto_para_busca(display_name) LIKE padrao_de_busca($1)`, ordem alfabética.
Motor candidato: casamento por **palavra** (`word_similarity`) em **três campos** com peso
(nome 1,00; cidade e bairro 0,65), todo termo obrigado a casar, ordenado por **relevância**
com bônus de nome exato (+1,00), prefixo (+0,35) e nome curto.

## Placar

| | motor de hoje | motor candidato |
|---|---|---|
| passa | **16** | **27** |
| reprova | **14** | **3** |
| não julgado (piso) | 1 | 1 |

### O que o candidato conserta (11 casos)
`ERR-01` a `ERR-05` (todo erro de digitação, de uma e de duas letras) ·
`PON-01`, `PON-03`, `PON-04`, `PON-06` (hífen omitido, apóstrofo nas três formas, travessão) ·
`CMP-02`, `CMP-03` (termo composto nome+cidade e fora de ordem) ·
`REL-01` (o nome exato passa a ganhar do nome que só contém o termo).

### O que o candidato NÃO conserta (2 casos)
- **`CMP-01` `vet vila mariana`** — achou, mas em 29º lugar, e o esperado era ≤5. O peso
  0,65 de bairro é baixo demais quando o termo casa o bairro **inteiro**. Conserto conhecido:
  casamento de campo inteiro vale mais que casamento parcial. Não é limitação de trigrama.
- **`PLU-01` `cães` → `Casa do Cão`** — e este é estrutural, não ajustável. Ver abaixo.

### O que o candidato PIORA (1 regressão, e ela é real)
- **`PLU-02` `pata`** — o alvo cai de 1º para **375º**. `word_similarity` dá nota alta a
  centenas de `Pata Amiga` e `Quatro Patas`, e o alvo se perde entre eles. É o preço de
  afrouxar: quem tolera erro também tolera parecido demais. **O conserto é o desenho de dois
  estágios abaixo**, que nem chega a chamar o motor difuso quando o substring já acha.

## O custo, medido

| volume | motor de hoje | candidato ingênuo (varredura) | candidato com pré-filtro `<%` + GIN |
|---|---|---|---|
| 10.011 | **0,306 ms** | 887,47 ms | 30,29 ms |
| 100.011 | **0,992 ms** | 4.409,04 ms | **157,75 ms** |

**O pré-filtro `<%` usa o índice `professionals_busca_por_nome` que JÁ EXISTE** — confirmado
no plano (`Bitmap Index Scan on professionals_busca_por_nome`). Nenhum índice novo para
`display_name`. A versão ingênua é varredura com função cara por linha e está aqui só para
mostrar a diferença entre "usar trigrama" e "usar o índice de trigrama".

## A conclusão que os dois quadros juntos impõem: DOIS ESTÁGIOS

O candidato é 159× mais lento que o motor de hoje e acerta 11 casos a mais. Nenhum dos dois
números justifica trocar um pelo outro — eles justificam **encadear**:

1. **Estágio barato**: o `LIKE` de hoje, com o índice de hoje. **0,99 ms** em 100 mil linhas.
   Passa nos 16 casos que já passam, e `PLU-02` volta a 1º lugar porque o difuso nem roda.
2. **Estágio difuso**: só quando o estágio 1 devolve **zero**. Paga 158 ms, e paga **só na
   consulta que hoje devolve tela vazia** — que é exatamente a consulta em que a pessoa
   está disposta a esperar, porque a alternativa é não achar.
3. A tela diz que recuou (estado 3 do protótipo), porque três resultados aproximados sem
   aviso parecem três resultados certos.

Isso é o **recuo** que o cliente pediu, e ele é ao mesmo tempo a estratégia de desempenho:
o caminho caro só roda no caso raro. Custo médio fica perto de 1 ms; a tela vazia some.

## Por que trigrama, e não busca de texto completo — medido

A conclusão provisória estava certa, e aqui está a medida que a sustenta:

| | trigrama | texto completo (`portuguese`) |
|---|---|---|
| `cães` acha `Cão` (PLU-01) | **não** | **sim** — `cães`→`'cã'`, `cão`→`'cã'` |
| `cães` acha `Cão` **sem acento** | não | **não** — `caes`→`'caes'`, `cao`→`'cao'` |
| acento ausente na consulta (ACE-01) | **sim** | **não** (`false`, medido) |
| erro de uma letra (ERR-01) | **sim** | **não** (`false`, medido) |

**O achado que decide**: o radicalizador português só unifica `cães`/`cão` **enquanto o
acento está lá**. Normalizar acento — que é obrigatório, porque teclado de celular não
acentua e `ACE-01` é o caso mais comum do produto — **desliga o ganho da radicalização**.
Busca de texto completo compraria 1 caso e perderia 4, sem consertar nenhum erro de digitação.

`portuguese` aparecer zero vez no projeto não era omissão. Era a escolha certa, sem registro.
