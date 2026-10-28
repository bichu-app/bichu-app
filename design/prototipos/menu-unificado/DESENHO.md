# Unificação de menu do Perfil — desenho

**Bichu · 28/10/2026 · protótipo HTML no lugar do Figma**, por autorização do
cliente de 23/09/2026 (a conta não tem cota). Abra `index.html` no navegador: o
painel do topo troca a largura (320, 375, 412 dp — **412 é a referência do
app**) e as nove telas.

Medido sobre `origin/development` em **`675c516c`**. Design system do **app**
(o "Sério"), e não a linguagem expressiva do site.

---

## 1. A PRIMEIRA MEDIÇÃO CONTRARIA O BRIEFING: o menu de hoje tem ONZE itens

O briefing descreve oito entradas em três grupos, sendo o primeiro sem título.
`app/lib/telas/abas.dart` no commit medido declara outra coisa:

| grupo | entradas HOJE |
|---|---|
| **`Conta`** (tem título) | Meus dados · Minhas fotos · **Usuários bloqueados** |
| `Pets na rua` | Escanear uma tag · **Registrar achado avulso** · **Meus achados** |
| `Comunidade` | **Pedidos de conexão** · **Conexões** · **Convide tutores** · Meus eventos · Minhas indicações |
| (fora de grupo) | Sair da conta |

**Três linhas que existem não estavam no briefing:** `Convide tutores` (que a
decisão mata), e `Meus eventos` e `Minhas indicações` — **que o cliente não
citou e que por isso ficam exatamente onde estão**, no mesmo grupo e na mesma
ordem.

Duas consequências, e as duas estão desenhadas:

- **a conta real é 11 → 7** (`Sair da conta` fora da conta nos dois lados), e
  não 8 → 5. As cinco do briefing são as cinco das frentes tocadas;
- **o rótulo do segundo item de conexões já é `Conexões`**, não "Minhas
  conexões": `TelaDeMinhasConexoes.titulo` é `'Conexões'` desde 22/10. A
  unificação não precisa inventar nome.

**O menu não muda de ordem.** A ordem é decisão dele de 18/10 e 21/10,
`perfil_ordem_dos_itens_test.dart` a guarda, e três pares dela são contrato de
portão. As três linhas saem; nada mais se mexe.

**Nenhum grupo ficou com um item só** — 2, 2 e 3 —, e isso foi conferido
porque o código avisa que o órfão possível era `Conta`. Com `Usuários
bloqueados` fora, `Conta` fica com `Meus dados` e `Minhas fotos`, que são dois.

---

## 2. O que eu desenhei, tela por tela

| tela do palco | o que ela responde |
|---|---|
| `menu hoje × menu novo` | a perda de descoberta, nos dois aparelhos lado a lado, na mesma largura |
| `Conexões · aba 1` | a lista de aceitas, com foto |
| `Pendentes · com pedido` | o contador na aba, o segmento `Recebidos`/`Enviados`, e `Aceitar`/`Recusar` |
| `Pendentes · vazia` | o estado comum — e o contador **sumindo**, não virando `0` |
| `Bloqueados · aba 3` | `Desbloquear`, e o custo que esta aba cobra |
| `Achados · com lista` | o botão **fixo no topo do corpo**, com a lista passando por baixo |
| `Achados · vazia` | o botão **continua visível e óbvio** |
| `QR em Meus dados` | recolhido (como a página abre) **e** aberto |
| `a notificação` | a outra metade da escolha dele, e o toque que cai na aba 2 |

---

## 3. As decisões de desenho, e o que as produziu

### 3.1 O contador fica na ABA, e o menu continua sem número

A escolha dele foi literal: *"aba interna de pendentes **+** notificação"* — as
duas coisas. O contador sai de **`ConnectionSummary.requests_received_count`**,
que **já existe no contrato**; e a notificação **`connection_requested`** já
está no `NotificationKind`, por decisão dele de 22/10. **As duas são mudança de
lugar, não construção.**

**Ele conta só o recebido.** `pending_sent_count` fica fora: pedido que eu
mandei não espera nada de mim, e um número que soma os dois manda a pessoa
decidir algo que não é dela.

**Zero não vira pastilha com `0`**: a pastilha some. Pastilha com zero é um
aviso que afirma que não há aviso.

**E a linha `Conexões` do menu continua sem contador**, porque o contador foi
pedido na aba. `ItemDeMenu` hoje **não tem parâmetro** para isso (só `rotulo`,
`apoio`, `critico`, `aoTocar`) e nenhuma das doze linhas pinta número ou ícone.
Isso é fiel à decisão **e é a maior fragilidade dela** — ver 4.2.

### 3.2 Três formas de cartão debaixo de um título só, e eu não as igualei

| aba | foto | controles |
|---|---|---|
| `Conexões` | **sim**, 56 dp | nenhum |
| `Pendentes` | **não** | `Aceitar` / `Recusar` |
| `Bloqueados` | **não** | `Desbloquear` |

A ausência de foto não é descuido meu: a **emenda 3 do ADR-0010** libera a foto
de perfil **entre conexões aceitas**, e pedido pendente é exatamente o estado em
que ninguém aceitou; `BlockedPerson` **não traz foto no contrato**.

**Mas a unificação cria um problema que hoje não existe:** as três listas moram
em três telas e ninguém as compara. Debaixo de um título só, a aba 1 com foto e
as abas 2 e 3 sem leem como inconsistência. **Não resolvi isso** — resolver
seria mexer no ADR-0010, que é decisão e não desenho.

### 3.3 `Recebidos`/`Enviados` viraram chips, e isso é decisão aberta

`Pedidos de conexão` tem **hoje** duas abas internas, por pedido dele de 26/10:
*"divida recebidos e enviados por abas, igual na pagina de rede"*. Com
`Pendentes` virando aba, as duas **não cabem** como `TabBar`: este aplicativo
tem **uma** `TabBar` só (`rede/secao_da_rede.dart`; a tela de pedidos copiou o
padrão de lá), e aba dentro de aba é o controle que ninguém sabe qual dos dois
está mexendo.

Viraram **chips no topo do corpo**, que é onde o padrão de listagem deste
projeto manda pôr controle — **no corpo, nunca na barra**. O segmento **fica
mesmo com `Recebidos` vazio**: escondê-lo faria o controle aparecer e sumir sob
a mão da pessoa, e ela não teria como descobrir que há pedidos **enviados**
esperando resposta do outro lado.

**Qual é o certo é decisão dele**, e `Enviados` **não está desenhado** de
propósito: desenhar o lado que ele não decidiu seria propor por conta própria.

### 3.4 Achados: por que FIXO, e não só "no topo"

Com 20 itens e `Carregar mais`, um botão que rola embora obriga a voltar ao
início para registrar o próximo achado — e quem registra um achado costuma estar
**na rua, com um animal na mão**. `position: sticky` dentro do corpo que rola;
chão opaco com borda para o texto do primeiro cartão não aparecer atrás dele.

**No vazio o botão é o MESMO botão, no mesmo lugar, com o mesmo rótulo.** Não
cresce, não muda de tinta e não vira *"Registrar o seu primeiro achado"*: botão
que muda entre o vazio e a lista é um botão que a pessoa aprende duas vezes.

**A segunda linha do vazio é o único acréscimo meu**, e ela aponta para
`Escanear uma tag`. Motivo medido e **já respondido pelo cliente, não reabrir**:
`Registrar achado avulso` **não exige conta**, mas este menu só existe logado, e
a porta sem conta era o alvo secundário da ação flutuante de `Pets`, que ele
mandou sair em 20/10. A resposta dele foi *"O fluxo ja existe dentro do botao
escanear… podemos deixar como esta"*.

### 3.5 O QR dentro de `Meus dados`: três eixos, e nenhum é só tamanho

1. **POSIÇÃO.** Último bloco da página, **depois de `Salvar`**. Quem veio trocar
   o telefone nunca passa por ele.
2. **ESTADO.** **Recolhido por padrão** — 48 dp fechado (um `ItemDeMenu`) contra
   os **200 dp** do quadrado. Os 200 são `QrDoConvite.lado`, o mesmo número de
   `QrDaPlaquinha`, e **não encolhem**: QR que encolhe de uma tela para a outra é
   QR que a câmera do vizinho pega numa e não pega na outra.
3. **TINTA.** Chão `surfaceSunken` com borda `outline`, **não** cartão `surface`
   com sombra. Afundado lê como gaveta de apoio; elevado leria como o assunto da
   tela, que são os dados pessoais.

O quadrado é **preto e branco fixos** (`0xFFFFFFFF` / `0xFF000000`) com a zona
silenciosa de `e3`, por função óptica — está escrito em `qr_do_convite.dart`, e
no tema escuro um QR escuro sobre escuro não é lido por nada.

A frase *"a câmera comum do celular não abre este código"* **viaja junto, e não é
consolo: é a instrução.** O quadrado carrega o **token**, não uma URL.

---

## 4. O QUE FICOU MAIS DIFÍCIL DE ACHAR

Esta é a seção que importa. Três palavras saem do menu e **não existem em mais
lugar nenhum dele** — quem procurava a função lendo o texto deixa de achá-la por
leitura.

### 4.1 `Usuários bloqueados` — a pior, e não é opinião

**O bloqueio é simétrico no servidor**: quem bloqueia alguém passa a receber
`404` no perfil dessa pessoa, e o `Desbloquear` morava dentro do menu daquele
perfil — que nunca mais abre. **Esta lista é o único lugar de onde o desbloqueio
sai no aplicativo inteiro.** A prosa do item em `abas.dart` diz, literal, que
ela é *"a mais crítica deste menu caso se perdesse"*.

- **hoje:** 1 toque, e a palavra que a pessoa procura está escrita no menu;
- **depois:** **2 toques**, e a palavra some — ela fica debaixo de `Conexões`,
  que é **o oposto** do que a pessoa veio desfazer.

O argumento que pôs o item em `Conta` está escrito no código: *"ninguém vem aqui
ver os bloqueados; vem DESFAZER um bloqueio. Isso é ajuste da própria conta."*
A decisão dele (*"devemos centralizar tudo em um unico local"*) reverte esse
argumento. **O protótipo a cumpre e mostra o custo; não o esconde.**

### 4.2 `Pedidos de conexão` — e o menu não mostra número

Do menu, **um pedido esperando é invisível**: `Conexões` não pinta contador, e o
único sinal continua sendo o ponto na barra de topo. É exatamente por isso que o
cliente pediu **aba com contador *e* notificação** — mas as duas só funcionam
*depois* que a pessoa abre a caixa de avisos ou a tela.

**Lembrete do histórico:** `Pedidos de conexão` já ficou **sem porta nenhuma**
entre 18/10 e 19/10, e ninguém viu. É o item que mais merece cautela.

### 4.3 `Registrar achado avulso` — terceira casa em oito dias

O rótulo some do menu e vira texto de botão dentro de `Achados`. A prosa de
`abas.dart` diz que o rótulo foi mantido igual ao da folha anterior *"porque
quem usava a ação acha pelo texto"* — e esta é a **terceira** casa dela em oito
dias (folha do FAB → item de menu → botão de tela). Mantive a palavra **avulso**
no botão por esse motivo.

### 4.4 `Convide tutores` — o placar perde a casa, e ninguém decidiu isso

A tela que morre tem **mais que o QR**:

- o placar *"Quem você trouxe para o Bichu"* (`invited_joined_count`);
- a ação `Criar o meu QR de convite`.

**Pôr o QR em `Meus dados` sem dizer onde vai o placar o apaga em silêncio.** O
protótipo o põe como **uma linha** dentro do bloco do QR — **proposta minha, não
decisão dele**; se ele quiser o placar fora, ele sai.

A ação `Criar` **viaja junto, e é ressalva parada nele desde 26/10**: ele disse
que o QR da pessoa *deveria* ser criado automaticamente, mas hoje isso não é
alcançável sem mexer no `openapi.yaml` — não existe operação de **leitura** do
próprio convite, o token em claro existe uma vez só (o banco guarda o SHA-256), e
emitir na abertura revogaria o anterior a cada visita. **Sem o botão, a seção não
teria QR nenhum para mostrar.**

### 4.5 O título da tela de achados tem de mudar junto

`MeusAchados.titulo` é `'Meus achados'` e serve de **rótulo do menu e de título
da barra** — uma constante para os dois, porque quem procura a função pelo nome
do menu precisa ver o mesmo nome na barra da tela que abriu. Menu dizendo
`Achados` e barra dizendo `Meus achados` quebraria isso.

---

## 5. As perguntas fechadas que eu levaria ao cliente

1. **`Conexões` leva contador no MENU também, além de na aba?** Hoje nenhuma das
   doze linhas pinta número, e `ItemDeMenu` não tem parâmetro para isso — é a
   única coisa que torna um pedido pendente visível sem abrir nada.
   (a) sim, contador no menu · (b) não, só na aba, como ele decidiu.
2. **`Enviados` entra na unificação?** (a) chip no topo do corpo da aba
   `Pendentes`, como desenhado · (b) `Enviados` sai e os pedidos enviados
   deixam de ter tela.
3. **O placar `invited_joined_count` fica?** (a) uma linha dentro do bloco do
   QR, como desenhado · (b) some com a tela.
4. **O aviso de "sua solicitação foi aceita" (o par de `connection_requested`)
   existe?** Levantado em 22/10 e **sem resposta**. Com `Pedidos de conexão`
   saindo do menu, quem **mandou** um pedido perde o lugar onde ia conferir —
   **ele agora tem um motivo novo para decidir isso.**

---

## 6. O QUE EU NÃO MEDI

- **Nada de Flutter foi tocado, construído ou rodado.** Nenhum `.dart` mudou,
  `api/openapi.yaml` e `src/` não foram abertos para escrita, e as duas frentes
  em curso (`src/modules/professionals` e `app/lib/telas/perto/`) não foram
  tocadas.
- **Não rodei suíte nenhuma** — nem Flutter, nem integração, nem portão. Esta
  entrega é um arquivo HTML em `design/prototipos/`; não há código de produto
  para medir.
- **Não medi contraste com ferramenta.** As cores saem de `design/tokens.json`
  pelo mesmo recorte que os protótipos anteriores usam, mas **os pares novos
  desta entrega não foram passados por `design/contrast-pairs.json`** — em
  particular o contador `primary`/`onPrimary` sobre a aba, e o chip de segmento
  `primaryContainer`/`onPrimaryContainer`.
- **Só tema claro.** O protótipo não desenha o tema escuro, como os três
  anteriores também não desenham.
- **Não medi a altura real do menu num aparelho.** Os dois aparelhos do palco
  têm 900 px de altura fixa para caber a comparação lado a lado; quantos itens
  cabem sem rolar num telefone de verdade **não foi medido**.
- **O QR do palco é um padrão desenhado em CSS, não um código válido.** De
  propósito: um quadrado escaneável que não leva a lugar nenhum seria uma
  promessa falsa.
- **Não abri Jira nem movi cartão.**
