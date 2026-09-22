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
flutter build apk --debug --dart-define=API_BASE_URL=http://SEU_IP:3000
adb install -r build/app/outputs/flutter-apk/app-debug.apk
```

O endereço aparece como marcador, e não como IP de exemplo: endereço privado
escrito no repositório é amarração de ambiente, e o portão de portabilidade
(`infra/verificacao/verificar_portabilidade.py`) reprova.

### As três configurações opcionais

Além de `API_BASE_URL`, que é obrigatória, o build aceita três valores que o
app usa e que **ainda não têm de onde sair**. Elas não derrubam o arranque
quando faltam, porque sem API o app não faz nada e o certo é parar, enquanto
sem elas o app funciona inteiro e só a linha de termos fica sem link.

| Variável | Para que serve | O que acontece sem ela |
|---|---|---|
| `TERMS_VERSION` | vai em `accepted_terms_version` no cadastro | a chave não vai no corpo, e o backend não grava `accepted_terms_at`: fica registro de que a pessoa criou conta e **nenhum** registro de qual versão dos termos ela aceitou |
| `TERMS_URL` | destino do link "termos de uso" | a expressão fica texto comum, e não vira link que não abre nada |
| `PRIVACY_URL` | destino do link "política de privacidade" | idem |

```bash
flutter run \
  --dart-define=API_BASE_URL=http://localhost:3000 \
  --dart-define=TERMS_VERSION=2026-09-17 \
  --dart-define=TERMS_URL=https://exemplo.com.br/termos \
  --dart-define=PRIVACY_URL=https://exemplo.com.br/privacidade
```

Nenhuma delas tem valor padrão, e a ausência é deliberada. A versão dos termos
precisa ser "o identificador do arquivo versionado no repositório, não `v1`
digitado à mão" (`docs/04-seguranca.md` §6.6), e esse arquivo não existe:
inventar um número aqui gravaria no banco a prova de um aceite a um documento
inexistente, que é pior que não gravar. As duas URLs são páginas web, de outro
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
```

A configuração dos dois está no fim do `pubspec.yaml`, comentada. A **arte** é
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

### Pendência medida no splash do iOS

No simulador (iOS 27, iPhone 18 Pro) o fundo do splash do iOS renderiza
`#9F2049`, e não a cor da marca. É um vermelho mais saturado que ela. Medido
comparando, na mesma captura, com a borda do botão `Escanear uma tag`, que o
Flutter pinta a partir do mesmo token e que lê o valor exato: os dois
vermelhos ficam diferentes lado a lado.

A causa tem conta fechada: converter `P3(0.5725, 0.1725, 0.2902)` para sRGB dá
exatamente `#9F2049`, ou seja o sistema usa os componentes do storyboard como
se já fossem Display P3. Três saídas foram testadas e nenhuma resolveu (cor
nomeada de catálogo, PNG num imageset, e `displayP3` declarado com os
componentes convertidos); estão listadas no comentário do
`LaunchScreen.storyboard` para ninguém refazer o caminho.

**O Android não tem esse problema:** o APK carrega o valor exato, conferido
com `aapt2 dump resources` em `values-v31`, `values-night-v31` e no
`launch_background`.

**O que fecha:** `dart run flutter_native_splash:create` com a arte, que resolve
o fundo do iOS por PNG gerado — e PNG carrega perfil de cor. Esse é o caminho
que vai para a loja; o storyboard escrito à mão é o remendo de antes da arte.
**Meça de novo depois de rodar o gerador.**

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
