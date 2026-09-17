# ADR-0009: Provedor de e-mail transacional — Postmark

**Status:** aceito
**Data:** 2026-09-17

## Contexto

O cliente pediu explicitamente que esta virasse decisão formal do arquiteto
nesta onda. O manifesto lista `resend` em `tecnologias_extras`, o que era registro
de uma opção em aberto, não decisão tomada.

O e-mail neste produto não é acessório. Ele carrega: a verificação de cadastro,
que é **o bloqueio** para marcar um pet como perdido; a redefinição de senha; o
aviso de que alguém encontrou o pet, para quem negou o push; e o lembrete de
desfecho, que é o instrumento de medição da métrica de reencontro. Um e-mail que
não chega aqui não é incômodo: é um tutor que não consegue abrir o caso do
animal que sumiu.

Volume esperado é pequeno: a meta de 3.000 pets em 90 dias coloca o produto na
casa de poucos milhares de mensagens por mês.

## Decisão

**Postmark, plano Basic (US$ 15/mês por 10.000 mensagens).** Três motivos, na
ordem de peso:

1. **Histórico de mensagem de 45 dias, pesquisável por destinatário.** É a
   resposta direta para "o e-mail de recuperação não chegou": abre-se a mensagem,
   vê-se se saiu, se foi entregue, se voltou, e qual foi a resposta do servidor
   de destino. Sem isso, o suporte responde por adivinhação.
2. **Streams separados para transacional e divulgação**, em infraestrutura
   distinta. No dia em que o produto mandar qualquer comunicação em massa, a
   reputação do e-mail de recuperação de senha não vai junto.
3. **O custo não é critério aqui.** No volume do Bichu, a diferença entre as
   opções fica abaixo de US$ 15 por mês.

**O Resend perde por dois pontos concretos, não por qualidade:** o plano gratuito
tem **teto de 100 mensagens por dia**, que é uma falha silenciosa em dia de
lançamento ou de campanha, justamente quando muita gente se cadastra ao mesmo
tempo; e a infraestrutura de envio é compartilhada entre transacional e
divulgação, sem o isolamento de reputação do Postmark. A retenção de log do plano
gratuito é menor que 45 dias (**a confirmar** o número exato no plano
contratado). Para um produto em que o e-mail está no caminho crítico de um pet
desaparecido, essas duas coisas pesam mais do que a diferença de experiência de
desenvolvimento entre os dois.

### O que é obrigatório, escolhido o provedor que for

- **Subdomínio dedicado de envio** (por exemplo `mail.<dominio>`), nunca o
  domínio raiz. Problema de reputação fica contido.
- **SPF, DKIM e DMARC** publicados e propagados antes do primeiro teste.
  Começar em `p=none`, subir para `p=quarantine` depois de duas semanas de
  relatório limpo.
- **Uma porta só no código:** interface `EmailSender` com um adaptador. Trocar
  de provedor é trocar o adaptador, algumas horas. Nenhum módulo de domínio
  importa o SDK.
- **Tabela `email_deliveries` nossa**, com `provider_message_id` e o estado
  atualizado por webhook (entregue, devolvido, marcado como spam). O suporte
  responde sem sair do nosso sistema, e a exclusão de conta apaga o registro.

### Quando o e-mail de recuperação não chega

Regras de produto, decididas aqui porque elas moldam o contrato:

1. A resposta da API é **sempre 202**, exista ou não a conta. Nunca revelar se
   um e-mail está cadastrado.
2. Token de uso único, 30 minutos, e pedir de novo invalida o anterior.
3. Limite de 3 pedidos por e-mail por hora e 10 por IP por hora.
4. **Devolução definitiva marca o endereço como não entregável**, e o app passa a
   exibir o aviso persistente com a oferta de corrigir o e-mail. Isto é o que
   fecha o ciclo com o cadastro que pode ser completado depois.
5. **A lista de supressão do provedor precisa ser lida pelo webhook.** Quem
   marcou uma mensagem como spam uma vez entra em supressão, e todo envio
   seguinte falha em silêncio para sempre se ninguém ler o evento. É a armadilha
   mais comum deste componente.
6. O caminho alternativo de recuperação para quem perdeu o acesso ao e-mail
   **não existe no MVP**, e isso é dívida consciente: a UX prevê "usar meu
   telefone", que exige provedor de SMS não contratado (ver pendência no
   documento de arquitetura).

## Alternativas consideradas

| Opção | Prós | Contras | Por que não |
|---|---|---|---|
| Resend | 3.000/mês grátis, ótima experiência de desenvolvimento | teto de 100/dia no gratuito; sem isolamento de reputação entre transacional e divulgação | o teto diário falha exatamente no dia de pico |
| E-mail da própria nuvem (SES e equivalentes) | mais barato em escala | exige a nuvem escolhida, que não existe; saída de sandbox por análise; painel pobre e sem histórico por mensagem pronto | depuração de entrega ficaria por nossa conta, e amarraria o e-mail ao provedor |
| SMTP de provedor comum | familiar | reputação compartilhada, sem webhook, sem rastreabilidade | não serve para caminho crítico |
| SendGrid ou Mailgun | maduros | camada gratuita instável e suporte a reboque; nada que o Postmark não entregue aqui | sem vantagem no nosso volume |

## Consequências

Fica mais fácil: responder "esse e-mail chegou?" com evidência, e isolar
reputação quando houver comunicação em massa.

Fica mais difícil: uma assinatura mensal desde o dia um, e o manifesto da
aplicação passa a divergir desta decisão enquanto listar `resend` — a correção do
manifesto precisa acontecer para que o registro não contradiga o ADR.

O envio **fica bloqueado** até haver conta no provedor e DNS com SPF e DKIM
propagados no domínio definitivo. Sem isso, a verificação de cadastro não pode
ser demonstrada, e sem ela não se abre caso de perdido: esta pendência trava o
fluxo F3 inteiro em homologação.
