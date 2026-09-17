# ADR-0008: Notificação push com FCM

**Status:** aceito
**Data:** 2026-09-17
**Revisado em:** 2026-09-17 — conferido contra o adiamento da escolha de nuvem.
**A decisao nao muda**: push e servico externo em qualquer provedor, e o FCM nao
depende de AWS, GCP nem Azure (o projeto Firebase e conta propria, nao conta de
nuvem). O que foi acrescentado e a secao sobre o que nao funciona em ambiente
local, que o plano de homologacao precisa absorver.

## Contexto

O push é o canal do alerta de 5 km e do lembrete de desfecho, que é o caminho
por onde a maior parte da métrica de reencontro vai ser coletada. Precisa
funcionar em Android e iOS a partir de um backend TypeScript, e precisa ter uma
resposta definida para quem negou a permissão.

## Decisão

**Firebase Cloud Messaging, HTTP v1, chamado direto do backend** com uma conta
de serviço. A API legada do FCM foi descontinuada; só a v1 com OAuth2 existe.
Credenciais por variável de ambiente, vindas do cofre de segredos de cada
ambiente (arquivo fora do git em Docker local; o gerenciado do provedor quando
houver um), **nunca no repositório**. No app, `firebase_messaging`.

**O Firebase entra apenas como transporte de mensagem.** Nada de Firebase Auth,
Analytics, Firestore ou Crashlytics: identidade é nossa (ADR-0002) e
observabilidade é Sentry, conforme o manifesto. Vale escrever porque o SDK puxa
os outros produtos com facilidade e a fronteira some sem ninguém decidir.

**iOS depende da chave de autenticação APNs (`.p8`)** carregada no projeto
Firebase, o que depende da conta Apple Developer ativa. É pendência do cliente e
bloqueia o push no iOS, não o Android.

### Comportamento

- **Alerta de pet perdido:** mensagem de notificação mais dados
  (`case_id`, `pet_id`, tipo), prioridade alta, `collapse_key` por caso (um caso
  nunca empilha várias notificações), **TTL de 6 horas** — alerta velho é ruído e
  atrapalha o caso seguinte.
- **Lembrete de desfecho:** 24 h após a abertura, depois a cada 48 h, com as
  ações rápidas `Voltou` e `Ainda não`. Some quando o caso encerra.
- **Mensagem na conversa mediada:** prioridade normal, agrupada por conversa.
- **Segundo plano e app encerrado:** mensagem de notificação é entregue pelo
  sistema, e o toque abre o app no destino pelos mesmos dados. Em fabricantes
  com gestão agressiva de bateria (comum no parque Android brasileiro) a entrega
  pode atrasar; isso não é contornável pelo aplicativo e precisa aparecer no
  plano de teste como caso conhecido, não como defeito intermitente.
- **Higiene de token:** `UNREGISTERED` ou `NOT_FOUND` do FCM apaga o aparelho na
  hora; sair da conta apaga o token.

### Quem negou a permissão

O aparelho **continua registrado**, com `push_permission: denied`. Três
consequências, todas deliberadas:

1. o usuário não é contado como alcançável na prévia de alcance, o que mantém a
   métrica honesta;
2. ele recebe o alerta por **e-mail**, quando tem e-mail verificado e está no
   raio;
3. o aviso de que alguém encontrou o seu pet é sempre também por e-mail,
   independentemente do push. É a única coisa neste produto que não pode
   depender de um canal só.

## Alternativas consideradas

| Opção | Prós | Contras | Por que não |
|---|---|---|---|
| Serviço de push de uma nuvem (SNS e equivalentes) | uma conta a menos, se a nuvem fosse essa | continua exigindo credencial de FCM e de APNs por baixo, acrescenta uma camada, e amarraria o push ao provedor | abstração sem ganho, e a nuvem nem está escolhida |
| OneSignal ou similar | painel, segmentação, agendamento | terceiro processando dado de usuário, com implicação de LGPD e contrato | não precisamos de segmentação |
| APNs direto no iOS e FCM no Android | um intermediário a menos no iOS | dois caminhos de envio, dois formatos, dois modos de falhar | um caminho só, em 13 dias |
| WebSocket ou busca periódica | sem provedor | não acorda o app encerrado, que é justamente o caso do alerta | não resolve o problema |

## O que não funciona em Docker local

A regra que resume tudo: **o que sai funciona; o que entra, não.** O backend
local tem saída para a internet, então enviar push e enviar e-mail funcionam de
`localhost`. O que não funciona é qualquer coisa que exija alguém **chegar** até
nós, ou que dependa de um domínio público.

| Item | Local | Por quê, e o que fazer |
|---|---|---|
| Enviar push pelo FCM | **funciona** | é chamada de saída autenticada por conta de serviço |
| Receber push num aparelho físico | **funciona** | o aparelho fala com o FCM, não com o nosso servidor. Basta o build ter o arquivo de configuração do Firebase |
| Push no iOS | **não funciona** | depende de chave APNs, que depende da conta Apple Developer |
| Tocar na notificação e abrir o app na tela certa | **parcial** | abrir o app funciona; abrir pela URL do pet depende do deep link, que depende do domínio |
| Webhook de entrega do Postmark | **não chega** | é chamada de entrada. Em desenvolvimento, túnel; em homologação, o mínimo hospedado |
| Ações rápidas do lembrete de desfecho (`Voltou` / `Ainda não`) | **funciona** se o aparelho alcançar a API | exige que a API esteja acessível pelo aparelho, e não em `localhost` |
| Link dentro do e-mail (verificação, redefinição) | **não abre no celular** | o link aponta para um host que o aparelho precisa alcançar |
| Entrega em segundo plano com o app encerrado | **funciona, com ressalva** | gestão agressiva de bateria em alguns fabricantes Android atrasa; caso conhecido, não defeito intermitente |

Consequência direta para o plano de teste: **o fluxo do alerta só fecha de ponta
a ponta contra o mínimo hospedado**, não contra `localhost`. Em ambiente local
dá para verificar que a mensagem foi montada, enfileirada e aceita pelo FCM, e é
isso que o teste automatizado deve afirmar; a entrega no aparelho e o toque que
abre a tela certa são verificação manual, em homologação, com o domínio no ar.

Recomendo um adaptador de push de registro em log, ligado por variável de
ambiente, para que o desenvolvimento não dependa de credencial do Firebase:
mesma porta, outra implementação, e o teste de contrato afirma o que foi
enviado.

## Consequências

Fica mais fácil: um caminho de envio, SDK maduro no Flutter e entrega sem
servidor de push próprio, sem nenhum vínculo com a nuvem que vier a ser
escolhida.

Fica mais difícil: uma dependência do Google no caminho do alerta, e uma conta
Firebase a criar e administrar (pendência do cliente, junto com a conta Apple).
Ela é conta de produto, não de nuvem: criá-la **não** antecipa nem condiciona a
escolha entre AWS, GCP e Azure.

O teste de ponta a ponta do alerta em iOS **fica bloqueado** até a conta Apple
estar ativa. Em Android, não há bloqueio além da chave de assinatura do APK, que
é pendência do App Links e não do push.
