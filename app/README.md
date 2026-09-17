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
```

O arquivo gerado é versionado e começa com o aviso de que não deve ser editado.
O outro destino previsto por §18.2.2, o CSS da rota pública do QR, é gerado
fora deste pacote.

**A trava que não pode cair:** `ColorScheme.primary` é a tinta framboesa
`#922C4A`, não a manteiga. A manteiga `#E7B93E` dá 1.73:1 contra a superfície
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
