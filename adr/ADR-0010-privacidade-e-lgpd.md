# ADR-0010: Privacidade e LGPD — retenção, dado de terceiro e o que a rota pública jamais exibe

**Status:** aceito
**Data:** 2026-09-17

## Contexto

O produto trata três categorias sensíveis ao mesmo tempo: localização de
pessoas, foto que pode identificar lugar, e dado de contato de alguém que **não
é usuário** (o achador que ajudou e foi embora). Some-se o golpe do falso achador,
que é padrão conhecido no Brasil, e a regra deixa de ser de tela e passa a ser
estrutural.

"Não expor endereço" precisa ser propriedade do esquema e do contrato, não
lembrete de quem escreve a interface.

## Decisão

### Bases legais (Lei 13.709/2018, art. 7º)

| Tratamento | Base legal |
|---|---|
| Conta, pet, caso, conversa mediada | execução de contrato (art. 7º, V) |
| Alerta geolocalizado a tutores próximos | legítimo interesse (art. 7º, IX), com oposição por desligar a localização |
| Localização precisa e push | consentimento do titular, revogável nas configurações do sistema |
| Perfil público por `@slug` | consentimento, por opt-in explícito |
| Perfil de profissional criado pela comunidade | legítimo interesse, com direito de oposição e canal de remoção (ver ADR-0011) |
| Trilha de auditoria | cumprimento de obrigação e exercício regular de direito |

### Retenção, por dado

| Dado | Retenção | Observação |
|---|---|---|
| Localização de referência do usuário | **só a última**, quantizada a ~100 m, validade de 30 dias | sem histórico; apagada ao sair da conta e ao excluir a conta |
| Última localização do pet no caso | precisa enquanto o caso estiver aberto | 30 dias após o encerramento, reduzida a rótulo de bairro; apagada em 12 meses |
| Local do achado | igual ao acima | nunca exposta em rota pública |
| Leituras da tag | 90 dias, com **HMAC-SHA-256 do IP com chave secreta rotacionada a cada 90 dias**, e /24 antes do HMAC; nunca IP em claro e nunca hash puro (SEC-010) | serve para detectar clonagem e abuso |
| Dados do achador sem conta (nome e um canal) | vida do caso mais 30 dias | é dado de terceiro coletado com finalidade única |
| Mensagens da conversa mediada | 12 meses após o encerramento | prova em caso de denúncia de extorsão |
| Fotos | ver ADR-0007 | expurgo 30 dias após exclusão |
| Trilha de auditoria | 24 meses | apenas inserção, esquema e papel de banco separados |
| Conta excluída | exclusão lógica imediata, expurgo em 30 dias | casos encerrados e tags revogadas na hora |

### O que a rota pública jamais exibe

Vale para `/t/<codigo>`, `/@<slug>`, `/cartaz/<token>`, a listagem pública de
perdidos e **qualquer JSON que as sirva**:

1. telefone, e-mail e qualquer endereço de contato, de quem quer que seja;
2. endereço, CEP e número de residência;
3. sobrenome do tutor — só primeiro nome ou apelido;
4. coordenada de qualquer precisão, do pet ou de pessoa, mesmo arredondada,
   mesmo em campo "aproximado", mesmo dentro de metadado de imagem;
5. mapa com pino, em qualquer zoom;
6. `pet_id`, `user_id`, `case_id` ou qualquer UUID do banco — **sem exceção**.
   A versão anterior desta regra abria um parêntese para o `case_id` na listagem
   pública e com isso se contradizia (SEC-002): UUIDv7 é ordenável e carrega o
   instante de criação, então publicar um por caso entrega a base inteira como
   telemetria. A chave estável da listagem é o `share_token` opaco, que o link
   de compartilhamento já carrega;
7. outros pets do mesmo tutor, e qualquer coisa que permita agrupá-los;
8. histórico de casos anteriores do pet;
9. código de outra tag, ou qualquer parte dele;
10. dado de outro achador, inclusive a existência dele.

O nível máximo de precisão geográfica em superfície pública é **bairro e
cidade**. Este item é requisito de aceite e vale como critério de reprovação em
revisão de PR.

**Uma exceção com escopo, e ela é regra e não permissão:** o cartão de manejo
(`pets.care_notes`, até 280 caracteres) aparece na página do achador
(`/t/{code}`), na página pública do caso e no cartaz, e **nunca** no perfil
público por `@slug`. A diferença é o tempo de vida e o público: mostrar a quem
está com o animal na mão que ele toma medicação é o que faz o animal ser bem
cuidado nos próximos minutos; deixar isso numa página indexável e permanente é
outra coisa. Dado de saúde do **animal** não é dado sensível do titular — mas
nome de clínica, nome do tutor e endereço são identificação por outro caminho, e
por isso o campo passa pela mesma redação das mensagens do canal mediado antes
de ser gravado. Ele não tem interruptor de visibilidade de propósito: um campo
cuja única finalidade é aparecer, guardado sem aparecer, é retenção sem
finalidade — a forma de não publicar é não preencher.

### Dado de quem achou e não é usuário

Coleta **opcional** e mínima: um nome de exibição e um canal de contato, e nada
mais. Finalidade única e declarada na própria tela: avisar a resposta do tutor e
o desfecho do caso. Não vira conta, não entra em lista, não recebe comunicação de
produto. O token de acesso à conversa é opaco, tem escopo de uma conversa só, e
não carrega dado pessoal. O apagamento é automático 30 dias após o encerramento
do caso, sem o titular precisar pedir.

### Direitos do titular

`DELETE /v1/me` e `POST /v1/me/data-export` existem desde o MVP. O atendimento
pode ser operacionalmente manual no início, mas o pedido é registrado, datado e
auditado — é isso que torna o prazo verificável.

### Duas consequências que precisam estar ditas

- **Não há recompensa intermediada no produto, em nenhuma forma.** É decisão de
  segurança contra o golpe do falso achador, e por isso a conversa mediada redige
  telefone, e-mail e endereço antes de entregar a mensagem, explicando ao
  remetente o que foi retirado.
- **A trilha de auditoria não pode morar junto do log da aplicação.** Esquema
  próprio, papel de banco sem `UPDATE` nem `DELETE`, e leitura restrita. Trilha
  com o mesmo acesso do log não serve para o que auditoria existe.

## Alternativas consideradas

| Opção | Prós | Contras | Por que não |
|---|---|---|---|
| Mostrar ponto aproximado no mapa público | ajuda quem procura | o conjunto de pontos reconstrói a rotina e a casa do tutor | rastreamento de pessoa disfarçado de utilidade |
| Guardar histórico de localização | heurísticas melhores depois | acúmulo sem finalidade declarada | minimização (art. 6º, III) |
| Exigir conta do achador | rastreabilidade | destrói o fluxo mais crítico do produto | a exceção permanente é decisão fechada |
| Guardar IP em claro nas leituras | investigação mais fácil | dado pessoal acumulado sem necessidade | o HMAC com chave atende detecção de abuso |
| SHA-256 do IP, sem chave | simples | 4,3 bilhões de endereços IPv4 são percorridos em minutos: hash reversível não é anonimização | HMAC com chave secreta e rotação |
| Consentimento para tudo | juridicamente simples | consentimento revogado desligaria o alerta que é o núcleo do serviço | legítimo interesse é a base adequada, com oposição |

## Consequências

Fica mais fácil: auditar a superfície pública, porque a lista do que nunca sai é
finita e verificável em teste.

Fica mais difícil: nenhuma tela de mapa público, e o suporte não consegue
reconstruir o trajeto de um caso.

Aberto e dependente do cliente: quem responde pelos pedidos de titular, qual
endereço de contato do encarregado aparece na política de privacidade, e quem
assina os textos de termos e privacidade. Sem isso, a rota pública não pode ir ao
ar com link de política funcionando.
