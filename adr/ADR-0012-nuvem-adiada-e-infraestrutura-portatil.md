# ADR-0012: Escolha de nuvem adiada, infraestrutura portátil e o mínimo hospedado

**Status:** aceito
**Data:** 2026-09-17
**Revisado em:** 2026-09-17 — o cliente decidiu que o hostname e variavel e
comeca em `localhost`. A decisao deste ADR nao muda; o que muda e que o dominio
deixou de bloquear o inicio da implementacao e passou a ter data limite.

## Contexto

O cliente adiou a escolha de provedor: *"por enquanto vamos criar a
infraestrutura local através de imagem docker e depois que for decidido a cloud
criamos a conta na aws, gcp ou azure"*. O manifesto passou a declarar
`available.clouds: []`, `preprod` local e `prod` remoto sem provedor.

Isto substitui a premissa de AWS que estava no desenho original desta onda, e
tem uma consequência que precisa ser dita antes de qualquer outra: **um produto
cujo fluxo mais crítico é um estranho abrindo uma URL impressa numa coleira não
cabe inteiro em `localhost`.** A decisão não é só "rodar local"; é rodar local
**e** definir o mínimo que precisa estar hospedado para que o produto exista.

## Decisão

**1. O desenvolvimento roda inteiro em Docker local**, por `compose.yaml`:
aplicação, PostgreSQL com PostGIS (ADR-0006), MinIO (ADR-0007) e um receptor de
e-mail local. Nenhuma conta em nuvem é criada, nenhum recurso é provisionado, e
nenhuma proposta de infraestrutura pressupõe provedor.

**2. A portabilidade é obrigação de código, não promessa de documento.** O
contrato normativo está na seção 11 de `docs/03-arquitetura.md`: o que é
proibido no código, o que sai para variável de ambiente, o que fica atrás de
porta, e o que não é portável. Ele vale como critério de reprovação em revisão.

**3. A URL base é variável de ambiente e começa em `localhost`.** `PUBLIC_BASE_URL`
atravessa o que o QR codifica, o cartaz, o link do caso, os links dos e-mails e
o perfil público. **Nenhuma URL é persistida**: o banco guarda código e token, e
a URL é montada na leitura. Trocar `localhost` pelo domínio é variável de
ambiente e reinício, nunca migração de dados.

**4. Existe um mínimo hospedado, e ele não é opcional — só deixou de bloquear o
começo.** Uma origem pública em HTTPS, no **domínio definitivo** (o mesmo que
vai impresso na coleira), servindo a rota pública do QR, os arquivos de
associação e o domínio de mídia. Sem ele não há deep link, não há câmera nem
geolocalização no navegador do achador, e não há definição de pronto no dia 30.
A camada intermediária, o IP da rede local, já permite demonstrar F4 com um
aparelho físico antes do domínio. Seção 12 do documento de arquitetura, com a
data limite calculada: **22/09/2026**, e limite absoluto **25/09/2026**.

**5. O mínimo hospedado não é a escolha de nuvem.** Ele é deliberadamente
pequeno e substituível: um host com Docker, TLS por certificado automático, e a
**mesma imagem** do `compose.yaml` com outras variáveis de ambiente. Nenhum
serviço gerenciado, nenhum recurso que só exista em um provedor. Se ele virar
difícil de abandonar, ele deixou de cumprir o que foi decidido aqui.

**6. A prova da portabilidade é executar, não afirmar.** A esteira sobe o
ambiente por `compose.yaml` e roda a suíte contra ele; o mínimo hospedado roda a
mesma imagem. Dois destinos com o mesmo artefato é o que transforma "é portátil"
em fato verificável. Portabilidade que vive numa frase evapora.

## Alternativas consideradas

| Opção | Prós | Contras | Por que não |
|---|---|---|---|
| Escolher uma nuvem agora e migrar depois | desenho concreto, serviços gerenciados desde já | contraria decisão explícita do cliente, e o que se constrói em 13 dias com serviço gerenciado é o que mais custa para desfazer | a decisão é dele e já foi tomada |
| Só Docker local, sem nada hospedado | zero custo e zero conta | o fluxo mais crítico do produto é uma URL aberta por um estranho: `localhost` não atende celular alheio, e os arquivos de associação exigem HTTPS no domínio impresso | tornaria o dia 30 indemonstrável |
| Túnel de desenvolvimento (ngrok e similares) como solução de homologação | rápido, zero infraestrutura | domínio efêmero, e o domínio é justamente o que vai impresso e o que os arquivos de associação exigem | serve para receber webhook em desenvolvimento, não para homologação |
| Fixar a URL base no código e trocar depois | uma variável a menos | vira migração de dados no dia da troca, e o que já foi impresso não volta | a decisão do cliente foi a oposta, e ela está certa |
| Kubernetes local para "ficar igual à produção" | paridade | paridade com uma produção que ainda não existe, e complexidade num prazo de 13 dias | `compose.yaml` é o mais simples que atende |
| Camada de abstração multi-nuvem | portabilidade "grátis" | abstrai pelo menor denominador e esconde o que importa | portas pequenas e nossas resolvem |

## Consequências

Fica mais fácil: começar hoje, sem esperar decisão comercial; reproduzir o
ambiente inteiro com um comando; e chegar na escolha de nuvem com um sistema que
já prova rodar em dois lugares.

Fica mais difícil: não há serviço gerenciado a favor de ninguém. Backup,
disponibilidade e escala do mínimo hospedado são responsabilidade explícita de
quem opera, e a expectativa precisa ser essa: **o mínimo hospedado é ambiente de
homologação, não produção**, e não deve receber dado de usuário real.

Passa a ser irreversível o de sempre: **o domínio**. Ele vai impresso na tag,
ancora os arquivos de associação e assina os e-mails. Adiar a nuvem é barato;
adiar o domínio não é, e é a pendência que trava mais coisa neste projeto.

Dívida registrada: o desenho de produção (escala, alta disponibilidade, CDN,
backup gerenciado, segredos) fica em aberto até a escolha. Gatilho de pagamento:
a decisão de nuvem, que dispara um ADR novo com a topologia do provedor
escolhido, sem reabrir nada que esteja neste.
