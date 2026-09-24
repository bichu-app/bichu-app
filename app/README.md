# Bichu — app Flutter

Identidade digital do pet, tag QR e rede local de perdido e achado. Android e
iOS, mesmo código, Material 3 como base.

Identificador do app: `app.bichu` nas duas plataformas.

## Rodar

A única configuração obrigatória é `API_BASE_URL`, e ela é resolvida **no build
do app**, não no runtime do servidor. Sem ela o app não sobe: ele abre numa tela
dizendo o nome da variável que faltou. Um app apontado para lugar nenhum passa
na homologação como se fosse problema de rede.

```bash
flutter pub get
flutter run --dart-define=API_BASE_URL=http://localhost:3000
```

Para alcançar a API a partir de um **aparelho físico** na mesma Wi-Fi, use o IP
da máquina, e não `localhost`. Troque `SEU_IP` pelo endereço da sua máquina
(`ipconfig getifaddr en0` no macOS, `hostname -I` no Linux):

```bash
flutter run --dart-define=API_BASE_URL=http://SEU_IP:3000
```

Build para instalar no aparelho:

```bash
flutter build apk --debug \
  --dart-define=API_BASE_URL=http://SEU_IP:3000 \
  --dart-define=TERMS_VERSION=2026-09-17
adb install -r build/app/outputs/flutter-apk/app-debug.apk
```

**`TERMS_VERSION` está aqui de propósito, e não é enfeite.** Um APK construído
só com `API_BASE_URL` sobe, navega e faz login, mas **não cria conta**: a tela
de cadastro recusa, porque sem essa variável não há o que gravar como aceite. O
motivo inteiro está em [As três configurações opcionais](#as-três-configurações-opcionais),
logo abaixo. Foi assim que o cadastro chegou travado no aparelho em 22/09/2026,
com a API de homologação no ar.

O mesmo vale para o build de homologação do `README.md` da raiz, que hoje passa
apenas `API_BASE_URL`: quem instalar por aquele comando recebe um app que não
cria conta.

O endereço aparece como marcador, e não como IP de exemplo: endereço privado
escrito no repositório é amarração de ambiente, e o portão de portabilidade
(`infra/verificacao/verificar_portabilidade.py`) reprova.

### As três configurações opcionais

Além de `API_BASE_URL`, que é obrigatória, o build aceita três valores que o
app usa e que **ainda não têm de onde sair**. Elas não derrubam o arranque
quando faltam — sem API o app não faz nada e o certo é parar —, mas a primeira
delas **fecha o cadastro** quando falta, e o motivo está abaixo.

| Variável | Para que serve | O que acontece sem ela |
|---|---|---|
| `TERMS_VERSION` | vai em `accepted_terms_version` no cadastro | **a tela de cadastro recusa criar conta**, dizendo `Não conseguimos registrar o aceite dos termos nesta versão do app.` O resto do app funciona |
| `TERMS_URL` | destino do link "termos de uso" | a expressão fica texto comum, e não vira link que não abre nada |
| `PRIVACY_URL` | destino do link "política de privacidade" | idem |

**Por que o cadastro para, em vez de seguir sem registrar.** O caminho do aceite
está inteiro: a tela manda `accepted_terms_version`, o contrato a declara em
`RegisterRequest`, a rota a lê (`routes.ts:512`) e o banco grava as duas colunas
(`kysely-identity-repository.ts:118-119`, onde `accepted_terms_at` só recebe
data quando a versão chega). O que falta é **valor**, não código.

Enquanto a variável faltava, a chave saía do corpo em silêncio pelo `?` do
elemento nulo-ciente, a conta nascia com `accepted_terms_version` e
`accepted_terms_at` nulos, e **nada falhava**. Com a caixa de aceite na tela
(BICHUS-222) isso virou a pior combinação possível: a pessoa marca que aceitou,
a tela afirma o aceite, e o banco não tem registro nenhum. Ônus da prova não é
detalhe de tela.

Então a tela recusa alto. É a mesma disciplina do `MAIL_WEBHOOK_SECRET`, que
derruba o boot da API nomeando a variável: **verificação que não consegue
verificar precisa reprovar, nunca aprovar.**

A isca está em `app/test/telas/criar_conta_termos_test.dart`, e ela cobra o
corpo enviado e não o widget — um caso que confirmasse "existe um `Checkbox`"
ficaria verde com o aceite não sendo gravado.

```bash
flutter run \
  --dart-define=API_BASE_URL=http://localhost:3000 \
  --dart-define=TERMS_VERSION=2026-09-17 \
  --dart-define=TERMS_URL=https://exemplo.com.br/termos \
  --dart-define=PRIVACY_URL=https://exemplo.com.br/privacidade
```

Nenhuma delas tem valor padrão, e a ausência é deliberada. A versão dos termos
precisa ser "o identificador do arquivo versionado no repositório, não `v1`
digitado à mão" (`docs/04-seguranca.md` §6.6), e **esse arquivo ainda não
existe** (`BICHUS-30`): inventar um número aqui gravaria no banco a prova de um
aceite a um documento inexistente, que é pior que não gravar. As duas URLs são páginas web, de outro
time, e montá-las sobre uma base pública seria inventar a rota delas.

O que impede a omissão de virar esquecimento não é este README: é a assinatura
de `AuthApi.criarConta`, onde `versaoDosTermos` é parâmetro **obrigatório e
nulável**. O tipo admite "não tenho o valor" e o `required` obriga cada chamador
a dizer isso. Foi assim que o campo sumiu antes — ele era opcional, ninguém
passava, e a chave saía do corpo em silêncio.

## Ícone e splash

O ícone do app e a tela de abertura são **gerados**, e não editados à mão: são
quinze arquivos por plataforma em densidades que precisam bater exatamente, e a
divergência entre densidades feita à mão só aparece no aparelho de outra pessoa.

```bash
dart run flutter_launcher_icons         # ícone, Android e iOS
dart run flutter_native_splash:create   # splash, Android e iOS
dart run tool/corrigir_splash_ios.dart  # SEMPRE depois dos dois acima
```

**O terceiro comando não é limpeza, é parte da geração.** Os dois primeiros
escrevem os PNG do catálogo de assets do iOS sem nenhum chunk de espaço de cor,
e escrevem o `backgroundColor` do `LaunchScreen.storyboard` em branco. Sem ele a
splash nativa do iOS abre **branca** — esse é o defeito que o terceiro comando
conserta de fato. O `#AD0038` do primeiro quadro é outra coisa, tem causa
própria e não tem conserto; está explicado logo abaixo. Quem esquecer o passo
derruba `test/marca/splash_ios_test.dart`, que nomeia o arquivo e repete o
comando.

A configuração dos dois primeiros está no fim do `pubspec.yaml`, comentada. A **arte** é
entrega da designer e cai em `design/marca/app/`, na raiz do repositório, fora
deste pacote — mesmo arranjo de `tool/gen_tokens.dart`, que lê
`../design/tokens.json`. Enquanto os arquivos não estiverem lá, os dois comandos
**falham dizendo qual arquivo faltou**, que é o comportamento certo: gerador que
não acha a arte precisa parar, não emitir ícone em branco.

**O fundo do splash é o Carmim `#9E0B3A`**, que é `raspberry.700` de
`design/tokens.json` e o `primary` do tema claro. Não é o fundo neutro do app.
Era a Framboesa `#922C4A` até 21/09/2026, quando o cliente trocou a semente.

O valor está duplicado à mão nos quatro campos de `flutter_native_splash` em
`pubspec.yaml`, porque XML de recurso do Android e catálogo de assets do iOS são
lidos pelo sistema antes de existir processo Dart e não conseguem ler
`design/tokens.json`. Os arquivos nativos saem desses quatro campos, pelo
gerador.

**Trocar a cor sem rodar os geradores reprova**, desde 21/09/2026:
`test/marca/arte_do_app_test.dart` lê `design/tokens.json`, decodifica os PNG
que os geradores assam e compara pixel com token. Antes disso nada no
repositório lia pixel, e um produto com splash e ícone na cor velha passava pela
esteira inteira em verde.

### O desvio de cor do splash do iOS: duas fases, e só a primeira erra

A splash **nativa** do iOS é exibida **duas vezes**, e as duas medem cores
diferentes. Medido no simulador (iPhone 18 Pro, iOS 27), em aparelhos criados
do zero:

| fase | o que é | mede |
|---|---|---|
| snapshot | o que o iOS guardou de uma abertura anterior | `#AD0038` |
| render vivo | o processo do app desenhando o mesmo storyboard | `#9E0B3A` |

**Não tem conserto no app, e a versão anterior deste texto dizia o contrário.**
Ela explicava o `#AD0038` pelo catálogo de assets: PNG sem chunk de espaço de
cor, `actool` interpretando os componentes como Display P3. O QA refutou em
22/09 e a refutação é limpa — o `Assets.car` compilado é **idêntico** antes e
depois da correção, porque o `actool` do Xcode 27 já marcava o PNG como sRGB.
Cinco medições do build "corrigido", em simuladores novos, deram `#AD0038` de
novo.

A causa real (BICHUS-209): o primeiro quadro vem de
`Library/SplashBoard/Snapshots/<bundle>`, um contêiner ASTC da Apple na
variante **sem** `sRGB`, sem função de transferência nem primárias. Números
sRGB vão crus para um buffer Display P3, e isso dá exatamente:

```
P3(#9E0B3A) lido cru num buffer P3 = #AD0038   (Carmim, hoje)
P3(#922C4A) lido cru num buffer P3 = #9F204A   (Framboesa, antes)
```

Pré-compensar consertaria o snapshot e **estragaria o render vivo**: não há
valor que sirva para as duas fases. E não é do Bichu — um app de
`flutter create` puro, sem asset nenhum, reproduz as duas fases idênticas em
três aparelhos criados do zero, e o mesmo PNG desenhado pelo SpringBoard como
ícone da tela inicial mede `#9E0B3A` exato **na mesma captura**.

**O que `dart run tool/corrigir_splash_ios.dart` continua fazendo, e por quê.**
Ele carimba `sRGB`, `gAMA` e `cHRM` nos 26 PNG do catálogo (§11.3.3.5 da
ISO/IEC 15948) e troca o branco de fábrica do `backgroundColor` do storyboard
pela semente. O carimbo não muda o `Assets.car`, mas faz o PNG **se descrever**
em vez de depender do que a ferramenta da vez assume; a troca do
`backgroundColor` é correção de verdade e independente disso. Ele é idempotente
e precisa rodar depois de cada execução dos outros dois geradores, que desfazem
os dois ajustes.

**O que falta, e é do cliente:** medir em aparelho físico. O `devicectl` só
enxerga simuladores nesta máquina. Se o desvio não existir no aparelho de
verdade, a BICHUS-142 precisa de um critério que diga **em qual das duas fases**
a cor tem de valer. Os instrumentos estão versionados em
`tool/medir_splash_ios.sh` e `tool/sonda_splash_ios.storyboard`.

**O Android não tem esse problema:** o APK carrega o valor exato, conferido
com `aapt2 dump resources` em `values-v31`, `values-night-v31` e no
`launch_background`. Os PNG do Android também não declaram perfil, e ali isso
não desvia nada: o decodificador do Android assume sRGB na ausência de
declaração, em vez de assumir o gamut do display.

**O ícone de notificação do Android está deliberadamente vazio**, com o motivo
no `AndroidManifest.xml`: ele exige silhueta monocromática de 24 dp, e a régua
de redução de `docs/06-design-system.md` §3.10 reprova o símbolo abaixo de
48 px. Falta o vetor da marca, que é item do cliente. O mesmo vale para
`adaptive_icon_monochrome` no `pubspec.yaml`.

O iOS compila com `flutter build ios --debug --no-codesign`. Instalar em iPhone
depende da conta Apple Developer, que ainda não está ativa.

## Verificar

```bash
flutter analyze
flutter test
```

`flutter analyze` precisa passar limpo. `flutter test` puro enxerga a suíte de
acessibilidade da raiz (`test/a11y/`) pela ponte `test/a11y_suite_test.dart`, e
é ela que recalcula os 70 pares do design system a partir de
`../design/tokens.json`, com **arquivo-isca**: fixtures erradas de propósito que
o verificador precisa reprovar. Se a isca passar, a verificação parou de
verificar.

Não há um segundo verificador de contraste dentro de `app/`. Havia, e ele
divergiu do da raiz na primeira troca de paleta, que é exatamente o defeito que
§18.2.2 existe para impedir. `test/tema/` guarda só o que é do Flutter: o
`ThemeData`, o `ColorScheme` e os estilos de componente.

## Tokens de design

A fonte única é `design/tokens.json` **na raiz do repositório**, não aqui
dentro: uma cópia em `app/` seria uma segunda fonte da verdade, que é o defeito
que `docs/06-design-system.md` §18.2.2 existe para impedir. Nenhum widget
escreve cor, espaçamento, raio ou tamanho de tipo à mão.

```bash
dart run tool/gen_tokens.dart   # regera lib/theme/bichu_tokens.g.dart
dart run tool/gen_marca.dart    # regera lib/theme/marca_vetor.g.dart
```

**O vetor da marca segue o mesmo arranjo, e pelo mesmo motivo.** A fonte é
`design/marca/vetor/*.svg`, na raiz; `gen_marca.dart` lê os três que o app
consome e emite as curvas mais o **nome do papel de cor**, nunca o valor — quem
pinta resolve pelo tema. Cor de SVG que não seja primitivo de `tokens.json`
reprova a geração. Quem mexer num SVG e não rodar o comando derruba
`test/marca/vetor_da_marca_test.dart` com o nome do arquivo.

Os arquivos gerados são versionados e começam com o aviso de que não devem ser
editados.
O outro destino previsto por §18.2.2, o CSS da rota pública do QR, é gerado
fora deste pacote.

**A trava que não pode cair:** `ColorScheme.primary` é a tinta carmim
`#9E0B3A`, não a manteiga. A manteiga `#E7B93E` dá 1.73:1 contra a superfície
marfim e nunca pode ser texto; ela chega à tela por `filledButtonTheme`,
`floatingActionButtonTheme` e `BichuColors.actionFillBox`. O único campo que
entrega o valor bruto se chama `actionFillRawDoNotUseAsText`.

São **quatro** os papéis que nunca podem pintar texto — `action-fill`,
`action-fill-pressed`, `community-fill` e `accent-fill` — e a lista não está
escrita no gerador: ele a lê de `$extensions.bichu.nunca-texto` em
`design/tokens.json`. Papel novo entra no contrato e o nome feio sai do
gerador sozinho; papel declarado que a paleta não tem derruba a geração com o
nome do papel na mensagem.

## Estrutura

```
tool/       gerador de tokens (lê ../design/tokens.json)
lib/
  api/        camada de acesso, Problem (RFC 9457) e mensagens de erro
  config/     API_BASE_URL, lida no arranque
  sessao/     sessão no chaveiro do sistema e renovação por rotação
  roteamento/ endereços do app
  telas/      abertura, conta e as quatro abas
  theme/      Material 3 sobre os tokens
  widgets/    campo, botões e faixa de aviso
assets/fonts/ Inter e Plus Jakarta Sans, embarcadas (SIL OFL 1.1, ver OFL.txt)
```

As fontes são embarcadas e não baixadas em tempo de execução: a tela do achador
pode ser a primeira tela que o aparelho vê, com sinal ruim.
