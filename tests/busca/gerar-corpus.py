# -*- coding: utf-8 -*-
"""Gera corpus sintetico realista de entradas do diretorio para medir a busca.

Saida: TSV para COPY (display_name, kind, city, state, neighborhood, status).

DUAS PROPRIEDADES QUE A MEDICAO EXIGE, E QUE A PRIMEIRA VERSAO NAO TINHA:

1. NOMES QUASE TODOS DISTINTOS. Um gerador puramente combinatorio de
   16x34x9 produz 4.896 nomes distintos; em 100 mil linhas cada nome repete
   ~20 vezes. Isso falseia DOIS numeros: a seletividade do indice (o trigrama
   acha 20 linhas onde acharia 1) e qualquer medida de relevancia (nao ha
   "a posicao do registro certo" quando ha 20 registros identicos). Por isso
   entra um qualificador de unidade, que e tambem como diretorio real se
   parece: "... - Unidade Moema", "... - Filial 3".

2. ALVOS UNICOS E VERIFICAVEIS. Cada alvo do conjunto de referencia usa
   tokens RESERVADOS, excluidos dos sorteios, para que a resposta esperada
   seja UMA linha identificavel pela string exata -- e nao "o que o gerador
   tiver produzido naquela semente".

Deterministico: semente fixa, para a medicao ser repetivel.
"""
import random, sys

N = int(sys.argv[1])
OUT = sys.argv[2]
random.seed(20261021)

PREFIXOS = [
    "Clínica Veterinária", "Hospital Veterinário", "Pet Shop", "Banho e Tosa",
    "Centro Veterinário", "Espaço Animal", "Casa do Pet", "Consultório Veterinário",
    "Clínica Vet", "Agropet", "Pet Center", "Clínica de Animais",
    "Veterinária", "Petshop", "Clinivet", "Policlínica Veterinária",
]
NOMES = [
    "São Jorge", "Bichano", "Patinhas", "Amigo Fiel", "Quatro Patas",
    "Cão & Cia", "Mundo Animal", "Vida Animal", "Au Au", "Miau", "Rex",
    "Bicho Solto", "Paraíso dos Bichos", "Doutor Pet", "Anjo da Guarda",
    "Coração Animal", "Nosso Bicho", "Vet Já", "Pata Amiga", "Lar dos Bichos",
    "Pelo Bom", "Esperança", "Natureza Viva", "Reino Animal",
    "Companhia Animal", "Bem-Querer", "Saint-Clair", "D'Ávila",
]
SUFIXOS = ["", " Ltda", " ME", " 24h", " Express", " Premium", " Popular"]
QUALIF = [""] + [" - Unidade %s" % b for b in (
    "Moema","Centro","Norte","Sul","Leste","Oeste","Jardins","Praia",
    "Alphaville","Industrial","Velho","Novo")] + \
    [" - Filial %d" % i for i in range(1, 40)] + \
    [" %d" % i for i in range(2, 30)]
CIDADES = [
    ("São Paulo","SP"), ("Rio de Janeiro","RJ"), ("Belo Horizonte","MG"),
    ("Brasília","DF"), ("Curitiba","PR"), ("Porto Alegre","RS"),
    ("Salvador","BA"), ("Fortaleza","CE"), ("Recife","PE"), ("Goiânia","GO"),
    ("Campinas","SP"), ("Santo André","SP"), ("São Bernardo do Campo","SP"),
    ("Niterói","RJ"), ("Florianópolis","SC"), ("Vitória","ES"),
    ("Belém","PA"), ("Manaus","AM"), ("Maceió","AL"), ("Teresina","PI"),
]
BAIRROS = [
    "Vila Mariana", "Pinheiros", "Moema", "Itaim Bibi", "Jardim Paulista",
    "Perdizes", "Santana", "Tatuapé", "Ipiranga", "Lapa", "Butantã",
    "Vila Madalena", "Brooklin", "Campo Belo", "Saúde", "Bela Vista",
    "Copacabana", "Ipanema", "Botafogo", "Tijuca", "Barra da Tijuca",
    "Savassi", "Funcionários", "Lourdes", "Centro", "Boa Viagem",
    "Vila Olímpia", "Higienópolis", "Consolação", "Liberdade",
]
KINDS = ["vet", "groomer", "walker", "sitter", "trainer", "clinic"]
STATUS = ["published"]*88 + ["draft"]*6 + ["hidden"]*4 + ["removed"]*2

def nome():
    return ("%s %s%s%s" % (random.choice(PREFIXOS), random.choice(NOMES),
                           random.choice(SUFIXOS), random.choice(QUALIF)))[:120]

linhas = []
for _ in range(N):
    cidade, uf = random.choice(CIDADES)
    linhas.append((nome(), random.choice(KINDS), cidade, uf,
                   random.choice(BAIRROS), random.choice(STATUS)))

# --- OS ALVOS DO CONJUNTO DE REFERENCIA ---
# Tokens reservados (`São Francisco`, `Vacinação`, `Bem-Estar`, `D'Angelo`,
# `Cão -`, `Focinho Feliz`, `Santo Antônio`, `Rascunho Oculto`) NAO aparecem
# nos sorteios acima, entao cada alvo e a UNICA linha com aquele nome.
ALVOS = [
    ("Clínica Veterinária São Francisco",      "clinic",  "São Paulo",      "SP","Vila Mariana","published"),
    ("Vacinação Animal Vila Mariana",          "clinic",  "São Paulo",      "SP","Vila Mariana","published"),
    ("Pet Shop Bem-Estar Animal",              "groomer", "São Paulo",      "SP","Pinheiros",   "published"),
    ("Clínica D'Angelo",                       "vet",     "São Paulo",      "SP","Moema",       "published"),
    ("Casa do Cão - Banho e Tosa",             "groomer", "Curitiba",       "PR","Centro",      "published"),
    ("Adestramento Quatro Patas Niterói",      "trainer", "Niterói",        "RJ","Icaraí",      "published"),
    ("Hospital Veterinário Santo Antônio",     "clinic",  "Belo Horizonte", "MG","Savassi",     "published"),
    ("Passeio com Cães Focinho Feliz",         "walker",  "São Paulo",      "SP","Perdizes",    "published"),
    ("Clínica Veterinária Rascunho Oculto",    "vet",     "São Paulo",      "SP","Lapa",        "draft"),
    # O PAR QUE ISOLA A FALTA DE RELEVANCIA, e a razao de ele existir:
    # as duas linhas casam `zoonoses vet` por SUBSTRING, com o mesmo direito.
    # Quem digita `zoonoses vet` quer a primeira -- o nome e exatamente isso.
    # A ordenacao alfabetica de hoje devolve a segunda, porque "Amor" < "Zoonoses".
    # Nenhum ajuste de limiar conserta isso: e ordenacao, nao casamento.
    ("Zoonoses Vet",                           "clinic",  "São Paulo",      "SP","Santana",     "published"),
    ("Amor Animal Zoonoses Vet Clínica",       "clinic",  "São Paulo",      "SP","Santana",     "published"),
]
linhas.extend(ALVOS)
random.shuffle(linhas)

with open(OUT, "w", encoding="utf-8") as f:
    for r in linhas:
        f.write("\t".join(r) + "\n")

distintos = len(set(r[0] for r in linhas))
print("linhas=%d  nomes_distintos=%d  repeticao_media=%.2f  arquivo=%s"
      % (len(linhas), distintos, len(linhas)/distintos, OUT))
