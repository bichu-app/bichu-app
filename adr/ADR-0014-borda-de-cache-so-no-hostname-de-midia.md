# ADR-0014: Cache de borda apenas em `img.bichu.app`

**Status:** proposto
**Data:** 2026-09-17

## Contexto

Surgiu a ideia de ligar o proxy da Cloudflare **somente** no hostname de mídia,
e o raciocínio por trás dela está certo: o proxy no domínio principal é
proibido, porque os arquivos de associação de deep link exigem **200 direto, sem
nenhum intermediário**, mas a mídia tem hostname próprio desde o desenvolvimento
(ADR-0007). Os dois problemas não se tocam.

O que precisa ser resolvido antes de recomendar é a interação entre cache de
borda e URL assinada: cache servindo conteúdo assinado para quem não deveria é o
modo clássico de um proxy transformar controle de acesso em enfeite.

## A pergunta que precisava de resposta: a separação atual já garante isso?

**Sim, e por construção, não por configuração.** O ADR-0007 separou as duas
classes de mídia **fisicamente**, em buckets diferentes e em caminhos diferentes:

| Classe | Onde mora | Como é acessada | Cacheável na borda |
|---|---|---|---|
| Derivada pública (`card`, `thumb`) | bucket público | chave com **128 bits aleatórios**, URL estável, **sem assinatura** | **sim, e sem risco** |
| Original do pet | bucket privado | **URL assinada**, 10 min, só para o dono | **nunca passa pelo hostname de mídia** |
| Foto do achador | bucket privado | URL assinada, só o tutor, dentro da conversa | idem |

A derivada pública não é protegida por assinatura: ela é protegida por ser
**inadivinhável**. E é exatamente isso que a torna segura de cachear — não há
autorização para a borda ignorar, porque não há autorização nenhuma. O conteúdo
assinado não passa por ali, então não existe a interação perigosa.

**O invariante, e ele é a decisão:**

> **`img.bichu.app` serve apenas derivadas públicas, imutáveis, de chave
> inadivinhável e sem assinatura. Nada assinado atravessa esse hostname, nunca.**

Se alguém um dia rotear URL assinada por ali, o defeito aparece e é silencioso: a
primeira requisição popula o cache, e as seguintes recebem o objeto **sem
apresentar assinatura nenhuma**, porque a chave de cache não inclui o que
autoriza. Pior ainda com a opção "ignorar query string" ligada, que é um clique
na interface. Por isso o invariante é escrito como proibição, e não como cuidado.

## Decisão

**Ligar o proxy da Cloudflare em `img.bichu.app`, e só nele.** Todos os demais
registros do domínio ficam **sem proxy**.

**Cabeçalhos exigidos na derivada pública:**

- `Cache-Control: public, max-age=31536000, immutable` — a chave carrega
  aleatoriedade, então o objeto nunca muda; trocar a foto gera chave nova.
- **Nenhum `Set-Cookie`.** Resposta com cookie deixa de ser cacheável na maioria
  das bordas, e o hostname de mídia não tem motivo para emitir cookie.
- `Content-Type` correto e `X-Content-Type-Options: nosniff`.
- Sem `Vary: Cookie`.
- **"Ignorar query string" permanece desligado**, como defesa em profundidade
  para o dia em que alguém errar o invariante acima.

**Invalidação não é problema, e isso remove a principal objeção a cache longo:**
a chave é imutável por desenho, então não existe a operação "limpar cache de uma
foto". Trocar a foto é publicar outra chave e apagar a anterior.

## Vale ligar agora, ou esperar o gatilho de 1 TB?

**Ligar agora — e o palpite sobre latência está certo, não é por ela.**

Com Cloudflare tendo presença em São Paulo e o servidor em São Paulo, o ganho de
latência é de dezenas de milissegundos para um público hiperlocal. Se o
argumento fosse latência, a resposta seria esperar.

**O argumento que decide é pico, e ele não espera volume médio nenhum.** O
formato deste produto é: um caso de pet perdido é compartilhado num grupo de
WhatsApp de bairro, e **a mesma foto é pedida milhares de vezes em minutos, da
mesma região**. Isso acontece com um caso, no primeiro mês, com tráfego médio
irrisório — e é o pior formato possível para uma única `e2-small` de 2 GB que
também roda o banco e o processador de imagem.

A distinção que importa, e que vale registrar porque ela se repete:

> **O gatilho de 1 TB é de custo. O pico é de disponibilidade, e ele não depende
> de a média crescer.** Um evento raro e concentrado derruba uma máquina pequena
> muito antes de o volume mensal justificar qualquer gasto.

Some-se que é gratuito no plano de entrada, que absorve o egresso que sairia a
cerca de US$ 0,12 por gigabyte, e que dá TLS e absorção de ataque no hostname
mais exposto sem tocar no domínio principal.

## O que isso custa, dito antes de alguém descobrir

**Para ter proxy em um subdomínio, a zona inteira precisa estar na Cloudflare.**
`bichu.app` passa a ter os servidores de nome dela, com **todos** os registros
sem proxy, exceto `img`. Isso cria um risco operacional novo, e ele é de um
clique:

> **Ligar o proxy no registro raiz ou em `api` quebra o deep link em silêncio.**
> Os arquivos de associação passam a ser servidos por um intermediário, a
> verificação do sistema operacional falha, e **nada aparece no log da
> aplicação** — o app simplesmente deixa de abrir pelo link, dias depois, sem
> ninguém ter mexido em código.

Mitigação exigida, e ela é de esteira, não de disciplina: **uma verificação
periódica que busca `assetlinks.json` e `apple-app-site-association` de fora,
confirma 200 sem redirecionamento e sem cabeçalho de intermediário, e falha
ruidosamente.** Verificação que não consegue verificar precisa reprovar; esta
consegue, e precisa existir antes de a zona mudar de lugar.

## Alternativas consideradas

| Opção | Prós | Contras | Por que não |
|---|---|---|---|
| Proxy no domínio inteiro | cache e proteção em tudo | **quebra os arquivos de associação**, que exigem 200 direto | é o motivo de o proxy estar restrito a um subdomínio |
| Nenhum proxy, servir do servidor | zero peças novas | um caso viral num grupo de bairro derruba a máquina que também roda o banco | o formato de pico deste produto não perdoa |
| CDN do próprio provedor | fica na mesma conta | custa, e o ganho sobre o proxy gratuito é pequeno neste volume | quando a mídia for para o Cloud Storage, reavaliar |
| Esperar o gatilho de 1 TB | uma decisão a menos agora | confunde custo com disponibilidade: o pico chega antes do volume | o gatilho de 1 TB continua valendo, para outra coisa |
| Assinar também a derivada pública | controle uniforme | mata o cache e acrescenta latência no fluxo de 60 segundos | a chave inadivinhável já resolve |

## Consequências

Fica mais fácil: aguentar um caso que viraliza sem que a máquina do banco sinta,
e sair do MinIO para o Cloud Storage depois sem tocar no hostname público.

Fica mais difícil: o DNS passa a ter um lugar onde um clique quebra o deep link
sem alarme, e por isso a verificação externa dos arquivos de associação deixa de
ser recomendação e vira portão.

Passa a ser irreversível: nada. Desligar o proxy é um clique, e o hostname
continua servindo do mesmo lugar.
