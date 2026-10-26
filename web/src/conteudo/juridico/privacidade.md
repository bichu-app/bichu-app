Esta política explica quais dados o Bichu trata, para quê, com que base na lei, por quanto tempo e com quem eles são compartilhados. Ela vale para o aplicativo Bichu e para o site bichu.app.

Escrevemos do jeito mais direto que conseguimos. Onde uma regra ainda não está funcionando do jeito que deveria, dizemos isso aqui, em vez de prometer o que não acontece.

## 1. Quem somos e como falar com a gente

- **Controlador dos dados:** [NOME DA EMPRESA — DECISÃO DO CLIENTE], CNPJ [DECISÃO DO CLIENTE], com sede em [ENDEREÇO — DECISÃO DO CLIENTE].
- **Encarregado pelo tratamento de dados pessoais (DPO):** Leandro Panegassi, pelo e-mail **privacidade@bichu.app**.
- **Dúvidas gerais e denúncias:** oi@bichu.app.
- **Instagram:** @bichu.app. Use o Instagram para conversar com a gente, e não para pedidos sobre os seus dados: mensagens ali ficam também sob as regras da Meta. Pedidos sobre dados vão para privacidade@bichu.app.

## 2. O essencial, em poucas linhas

- **Quem acha o seu pet nunca vê o seu telefone, o seu e-mail nem o seu endereço.** A conversa entre vocês passa pelo Bichu, e telefone, e-mail, endereço e links são retirados das mensagens antes de chegarem ao outro lado.
- **Não vendemos dados, não mostramos anúncios e não usamos ferramenta de análise de comportamento** (como Google Analytics ou Firebase Analytics).
- **A sua localização é guardada de forma aproximada**, arredondada para uma área de cerca de 100 metros, e só a mais recente.
- **Em página pública, o lugar mais preciso que aparece é o bairro e a cidade.** Nunca rua, número, CEP, coordenada ou mapa com pino.
- **Você pode pedir acesso, correção ou exclusão dos seus dados** pelo privacidade@bichu.app.

## 3. De quem tratamos dados

- **Tutor:** quem cria conta no Bichu e cadastra pets.
- **Quem acha um pet:** pode ser alguém sem conta, que escaneou a plaquinha na rua e avisou o tutor.
- **Visitante do site bichu.app.**
- **Pessoa convidada para receber um pet** numa transferência, que pode ainda não ter conta.
- **Profissional ou estabelecimento do diretório**, que aceitou aparecer no Bichu.

## 4. O que tratamos, para quê, com qual base legal e por quanto tempo

As bases legais citadas estão no art. 7º da Lei Geral de Proteção de Dados (Lei 13.709/2018, a LGPD).

Sobre prazos: **o Bichu não apaga dado por prazo.** A coluna "por quanto tempo" não traz um contador: ela diz qual é a finalidade que sustenta a guarda, e o dado fica enquanto essa finalidade durar. Onde o dado tem um fim natural, o fim está escrito — "enquanto a conta existir", "enquanto o pet estiver cadastrado". Onde não há fim natural, dizemos que o dado fica, em vez de prometer um prazo que não acontece.

Três prazos são exceção, e eles estão escritos como número porque de fato apagam: a sua localização de referência (30 dias), o código de acesso ao aviso de quem achou (30 dias) e a trilha de auditoria (24 meses).

Guardar sem prazo não tira o seu direito. Pelo art. 18 da LGPD você pode pedir a eliminação dos seus dados, e o pedido vai para **privacidade@bichu.app** (item 9).

### 4.1 A sua conta

| O que | Para quê | Base legal | Por quanto tempo |
|---|---|---|---|
| E-mail | Entrar, recuperar a senha, confirmar a conta e receber avisos da conta | Execução de contrato (art. 7º, V) | Enquanto a conta existir |
| Senha | Entrar | Execução de contrato | Guardamos só um resumo criptográfico (PBKDF2). Ninguém no Bichu consegue ler a sua senha |
| Nome de exibição | Como você aparece dentro do app, por exemplo na conversa com quem achou o seu pet. Não aparece em página pública | Execução de contrato | Enquanto a conta existir |
| Telefone (opcional) | Contato da conta. **Nunca aparece para ninguém**, nem para quem acha o seu pet | Execução de contrato | Enquanto a conta existir |
| Região de referência em texto (CEP, bairro, cidade e UF, todos opcionais) | Mostrar o que é da sua região | Execução de contrato | Enquanto a conta existir |
| Data de nascimento | Cumprir a idade mínima de 16 anos: calculamos a sua idade no servidor e recusamos o cadastro de quem tem menos. **Nunca aparece para ninguém**, nem em página pública | Execução de contrato | Enquanto a conta existir. Ela não é descartada depois da conferência: é ela que prova que a idade mínima foi conferida |
| Versão dos termos que você aceitou e a data | Saber o que você aceitou | Exercício regular de direitos (art. 7º, VI) | Enquanto a conta existir |

Quando a conta é excluída, ela deixa de funcionar na hora e deixa de ser encontrada em qualquer página ou função do Bichu. Os dados acima **não são apagados da base**: a conta fica desabilitada, e é a desabilitação que faz você desaparecer do produto. Isso é uma escolha nossa, e está dita com todas as letras no item 9, junto do que você pode pedir.

### 4.2 Sessão e segurança da conta

| O que | Para quê | Base legal | Por quanto tempo |
|---|---|---|---|
| Registros de sessão: identificação do aparelho, o nome do navegador ou do app (user agent) e um resumo do endereço IP | Manter você conectado, perceber uso indevido da conta e permitir o "Não fui eu" | Execução de contrato e legítimo interesse em segurança (art. 7º, IX) | Enquanto a conta existir. Encerrar a sessão marca o registro como revogado e **não o apaga**: é ele que responde "de que aparelho entraram na minha conta, e quando". Não há apagamento por prazo |
| Códigos de confirmação de e-mail, de redefinição de senha e de reautenticação | Confirmar que é você | Execução de contrato | Guardados só como resumo criptográfico. Cada código vence sozinho e deixa de funcionar; o registro de que ele foi emitido e usado fica enquanto a conta existir, porque é ele que mostra quem pediu a troca de senha. Não há apagamento por prazo |

A sessão no app dura até **180 dias**. Em "Sair de todos os aparelhos" você encerra todas as sessões de uma vez.

**Sobre o endereço IP.** Nas tabelas do produto, o IP nunca é guardado como está: ele é cortado (os últimos números são descartados) e passa por uma função criptográfica com chave secreta, que o transforma num código que não dá para reverter sem a chave. Já os **registros técnicos do servidor** (os logs de acesso) guardam o endereço IP completo de cada acesso, junto com o horário e o endereço da página pedida. Eles não são apagados por prazo: ficam enquanto servirem para investigar abuso, fraude e falha do serviço, que é a finalidade que justifica guardá-los.

### 4.3 Os seus pets

| O que | Para quê | Base legal | Por quanto tempo |
|---|---|---|---|
| Nome, espécie, raça, porte, cores, sexo, se é castrado, data de nascimento aproximada, sinais particulares | Identificar o pet e ajudar no reencontro | Execução de contrato | Enquanto o pet estiver cadastrado. Pet excluído sai das telas na hora e o registro continua guardado; excluir a conta também não o apaga. Não há apagamento por prazo |
| Cartão de manejo (até 280 caracteres, como "é medroso, não corra atrás") | Ajudar quem está com o animal nos primeiros minutos | Execução de contrato | Igual ao acima |
| Número do microchip e RG Animal (SinPatinhas), opcionais | Identificação | Execução de contrato | Igual ao acima |

O cartão de manejo **é público por natureza**: ele aparece para quem escaneia a plaquinha. Por isso, antes de gravar, o Bichu retira dele telefone, e-mail, endereço e links. Se você não quer que algo apareça, não escreva no cartão.

### 4.4 Fotos

| O que | Para quê | Base legal | Por quanto tempo |
|---|---|---|---|
| Foto original enviada pelo app | Gerar as versões que aparecem no Bichu | Execução de contrato | Veja o aviso abaixo |
| Versões tratadas (miniatura e cartão) | Mostrar o pet no app e nas páginas públicas | Execução de contrato | Veja o aviso abaixo |

A foto original fica num armazenamento fechado, que só você acessa, por link temporário. As versões que aparecem no Bichu são geradas **sem os metadados do arquivo**, entre eles a localização de GPS que o celular grava na foto e que normalmente aponta para a sua casa. A foto tratada é publicada num endereço público difícil de adivinhar.

**Aviso importante:** quando você apaga uma foto, um pet ou a conta, a foto some do Bichu, mas **o arquivo não é apagado do armazenamento**, e a versão tratada pode continuar acessível por quem já tiver o endereço exato dela. Isso não é uma pendência nossa: é uma decisão, e o arquivo fica. Se você quer que ele saia, peça a remoção pelo privacidade@bichu.app.

### 4.5 A plaquinha (tag QR)

| O que | Para quê | Base legal | Por quanto tempo |
|---|---|---|---|
| Código da plaquinha | Ligar a plaquinha ao seu pet | Execução de contrato | Guardado só como resumo criptográfico e, enquanto a tag estiver ativa, cifrado para você poder reimprimir. A cópia cifrada é apagada quando a tag é revogada |
| Leituras da plaquinha: data e hora, resumo do IP cortado e resumo do navegador | Contar as leituras e perceber clonagem ou abuso da plaquinha | Legítimo interesse (art. 7º, IX) | Enquanto a plaquinha existir no Bichu. A leitura é a própria evidência de clonagem e de abuso, e por isso ela fica: não há apagamento por prazo. A chave secreta que transforma o IP em código é trocada a cada 90 dias, e isso protege o dado — não é prazo de guarda |

O código impresso funciona como uma chave: quem está com a plaquinha consegue avisar você. Se perder a plaquinha, revogue a tag no app e emita outra.

### 4.6 Pet perdido e alerta da vizinhança

| O que | Para quê | Base legal | Por quanto tempo |
|---|---|---|---|
| Onde o pet foi visto por último (um ponto no mapa, opcional, e/ou bairro, cidade e UF), quando, a descrição e o desfecho do caso | Avisar a vizinhança, cruzar com achados e registrar o reencontro | Execução de contrato | Enquanto o pet estiver cadastrado. O ponto exato continua guardado depois que o caso é encerrado, e não é apagado por prazo. Em página pública ele nunca aparece: o máximo é bairro e cidade (item 5) |
| Quem recebeu cada alerta e quando | Não mandar mais de 3 alertas por pessoa em 24 horas | Legítimo interesse | Fica guardado e não é apagado por prazo. Dizemos o que isso tem de desconfortável: o teto de 3 alertas olha só as últimas 24 horas, e o registro continua existindo depois disso. Você pode pedir a eliminação dele pelo privacidade@bichu.app |

**Quem recebe o alerta:** pessoas com conta que informaram uma localização válida a até **5 km** do ponto e que deixaram as notificações ligadas, até 500 pessoas por alerta. O alerta mostra o bairro, nunca o ponto. Se o caso foi aberto só com bairro e cidade, sem ponto, o alerta de 5 km não é disparado.

Você pode deixar de receber alertas a qualquer momento: apague a sua localização ou desligue as notificações do Bichu no celular.

### 4.7 A sua localização de referência

| O que | Para quê | Base legal | Por quanto tempo |
|---|---|---|---|
| Um ponto aproximado de onde você está ou mora, vindo do GPS do celular ou de um toque no mapa | Saber se você está a até 5 km de um pet perdido | Consentimento (art. 7º, I) | Só a última. Vale 30 dias e depois é apagada automaticamente |

- O Bichu pede ao Android apenas a **localização aproximada**, e só enquanto o app está aberto. Nunca em segundo plano.
- O servidor **arredonda o ponto para uma área de cerca de 100 metros** antes de gravar. O ponto exato não é guardado em lugar nenhum.
- **Não guardamos histórico:** existe uma localização por conta, sempre a mais recente.
- Ela é apagada quando vence (30 dias), quando você a apaga e quando você exclui a conta.
- **Sair da conta ainda não apaga a localização.** Se você quer que ela saia junto, apague a localização antes de sair.

### 4.8 Notificações no celular

| O que | Para quê | Base legal | Por quanto tempo |
|---|---|---|---|
| Identificador de notificação do aparelho (token do Firebase Cloud Messaging), sistema, se você permitiu notificações, versão do app e do sistema | Enviar alertas de pet perdido e avisos da conta | Consentimento, que você dá ao permitir as notificações | Até você remover o aparelho, até o Google avisar que o identificador não vale mais, ou até a conta ser excluída |

**Sair da conta ainda não desliga as notificações daquele aparelho.** Para parar de receber, desligue as notificações do Bichu nas configurações do celular.

O texto das notificações não leva e-mail, telefone, endereço nem coordenada.

### 4.9 Quem acha um pet e não tem conta

Quem escaneia a plaquinha consegue avisar o tutor **sem criar conta**, com um toque só. Nesse caso, tratamos:

| O que | Para quê | Base legal | Por quanto tempo |
|---|---|---|---|
| Data e hora do aviso | Avisar o tutor | Legítimo interesse (art. 7º, IX), do tutor e do animal | Fica guardado junto do aviso e não é apagado por prazo: é o registro de que alguém avisou e de quando, e é ele que sustenta a conversa com o tutor |
| Recado opcional, de até 500 caracteres | Contar ao tutor o que você quiser | Consentimento (art. 7º, I): você escreve se quiser | Fica guardado junto do aviso e não é apagado por prazo. Como o recado é seu e você escreveu por vontade própria, você pode retirar o consentimento e pedir a eliminação dele pelo privacidade@bichu.app — mesmo sem ter conta |
| Resumo do IP cortado combinado ao resumo do navegador | Juntar num aviso só os avisos repetidos da mesma pessoa, para o tutor não ser acordado várias vezes, e perceber abuso | Legítimo interesse | Fica guardado junto do aviso e não é apagado por prazo: é ele que impede o mesmo aviso de acordar o tutor várias vezes e que permite perceber abuso da plaquinha |
| Código de acesso ao aviso | Permitir que você volte ao aviso sem ter conta | Legítimo interesse | Guardado só como resumo criptográfico, vale 30 dias |

Nenhum desses dados vira cadastro, entra em lista de e-mail ou é usado para marketing.

### 4.10 Achado registrado por quem tem conta

Quem tem conta pode registrar um animal que encontrou, mesmo sem plaquinha.

| O que | Para quê | Base legal | Por quanto tempo |
|---|---|---|---|
| Espécie, porte, sexo, raça, cor, onde foi visto (ponto opcional e/ou bairro, cidade e UF), foto e recado | Procurar casos de pet perdido parecidos e avisar os tutores | Execução de contrato | Enquanto o achado estiver registrado. Ele continua guardado depois que o caso do pet é encerrado, e não é apagado por prazo |

O cruzamento entre achados e casos é feito automaticamente, mas **ele só sugere**: quem decide se é o mesmo animal é o tutor. A foto de um achado é vista só pelo tutor, dentro da conversa, e nunca em página pública.

### 4.11 A conversa entre tutor e quem achou

| O que | Para quê | Base legal | Por quanto tempo |
|---|---|---|---|
| Mensagens e fotos da conversa | Combinar o reencontro | Execução de contrato | Fica guardada e não é apagada por prazo. A guarda tem um mínimo de propósito — **12 meses depois do encerramento** —, porque a conversa é a prova das duas pessoas se houver denúncia de extorsão pelo golpe do falso achador. Quando a conta de um dos dois é excluída, a conversa **deixa de aparecer** para os dois, e não é apagada |
| Leitura automática das mensagens para retirar telefone, e-mail, endereço e links | Proteger as duas pessoas do golpe do falso achador e de exposição do endereço | Legítimo interesse em prevenção a fraude (art. 7º, IX) | A mensagem é gravada já sem esses trechos. O texto original não é guardado |
| Sinais de uso anormal, como volume alto de mensagens ou a mesma pessoa avisando muitos tutores | Reter a conversa até uma pessoa da equipe revisar | Legítimo interesse em prevenção a fraude | Enquanto a conversa existir |

Se a outra pessoa excluir a conta dela, a conversa deixa de aparecer para você também. Ela não é apagada: deixar de aparecer é o que a exclusão da conta faz.

### 4.12 Transferência de pet

| O que | Para quê | Base legal | Por quanto tempo |
|---|---|---|---|
| E-mail da pessoa que vai receber o pet, informado por você | Enviar o convite e confirmar a transferência | Execução de contrato (com você) e legítimo interesse (em relação a quem recebe) | O convite para de valer em 30 dias. O registro de que ele foi enviado, com o e-mail, fica guardado e não é apagado por prazo, porque é a prova de quem autorizou a transferência do pet |

Só informe o e-mail de alguém que sabe da transferência. Na sua tela, esse e-mail aparece mascarado.

### 4.13 Diretório de profissionais

Profissionais e estabelecimentos só aparecem no Bichu **depois de aceitarem**. Tratamos o nome, a atividade, a descrição, a cidade, o bairro e o ponto de atendimento, o telefone comercial, o CNPJ ou o CRMV e o resultado das verificações. Os documentos enviados para verificação ficam em armazenamento fechado. Base legal: execução de contrato com o profissional. Por quanto tempo: enquanto o profissional estiver no diretório. Os dados não são apagados por prazo, e o profissional pode pedir a remoção a qualquer momento pelo privacidade@bichu.app.

### 4.14 Trilha de auditoria

Registramos as ações importantes feitas no Bichu (por exemplo, entrar, trocar a senha, excluir a conta, revogar uma tag): quem fez, o quê, quando, sobre qual registro e um resumo do IP. Essa trilha fica separada do resto, ninguém consegue alterá-la, e ela **continua existindo depois que a conta é excluída**, porque é a prova de que o pedido de exclusão foi atendido.

- **Base legal:** cumprimento de obrigação legal (art. 7º, II) e exercício regular de direitos (art. 7º, VI). [JURÍDICO: confirmar a obrigação legal aplicável]
- **Por quanto tempo:** 24 meses. Depois disso, ela é apagada automaticamente.

### 4.15 E-mails que enviamos

Mandamos e-mails de confirmação de conta, redefinição de senha, avisos de segurança e convites de transferência. O provedor de e-mail avisa ao Bichu se a mensagem foi entregue, devolvida ou marcada como spam. Esse registro não guarda o seu endereço de e-mail. [PENDENTE: confirmar se o rastreamento de abertura está desligado no provedor]

### 4.16 Quem escreve para a gente

Se você escreve para oi@bichu.app ou privacidade@bichu.app, tratamos o que você mandar para responder. Base legal: legítimo interesse, ou cumprimento de obrigação legal quando for um pedido sobre os seus dados. Por quanto tempo: enquanto servir para responder a você e para provar que o pedido foi atendido. Não há apagamento por prazo.

### 4.17 O que o Bichu não coleta

Não pedimos CPF, endereço completo, foto de rosto, biometria nem nenhum dado sensível do art. 11 da LGPD (saúde, origem racial, religião, opinião política e outros). **A data de nascimento, sim, nós pedimos**, e só para cumprir a idade mínima de 16 anos: está no item 4.1 e no item 10. Dado de saúde do **animal**, como uma medicação no cartão de manejo, não é dado sensível do tutor, mas passa pela mesma limpeza de contato antes de ser gravado.

### 4.18 A Loja e os links de parceiro

A Loja é navegável **sem conta**, a lista é a mesma para todo mundo e **não é personalizada**: não guardamos o que você olhou nem em que produto você tocou.

- Ao abrir um produto, o Bichu manda você para o **site do parceiro**, no navegador do seu aparelho, com o endereço exatamente como ele está no nosso catálogo. **Não acrescentamos nenhum identificador seu ao link** — nem e-mail, nem código de conta, nem nada que diga ao parceiro que foi você.
- Dali em diante você está no site dele, e o que o parceiro faz com os seus dados é governado pela **política de privacidade do parceiro**, não por esta.
- Preço, venda e disponibilidade não são assunto de dado pessoal: estão no item 13 dos [Termos de Uso](/termos), que diz que o Bichu não vende nada e não controla preço nem estoque.

### 4.19 Funções que ainda não estão no ar

Algumas partes do Bichu estão sendo construídas e **ainda não coletam nada**. Antes de cada uma entrar no ar, esta política será atualizada com o que ela trata, para quê e por quanto tempo:

- a conversa pelo site para quem achou um pet e não tem conta, em que a pessoa poderá deixar, se quiser, um nome e um e-mail para receber a resposta do tutor;
- os eventos criados pela comunidade, com galeria de fotos;
- as avaliações de profissionais do diretório;
- os pontos, que serão só para quem tem conta;
- a lista pública de pets perdidos da cidade.

## 5. O que fica público

**Nunca aparece em página pública, de ninguém:** telefone, e-mail, endereço, CEP, sobrenome, coordenada de qualquer precisão, mapa com pino, os outros pets do mesmo tutor e o histórico de casos do pet.

**A página da plaquinha** (bichu.app/t/...) mostra para quem escaneia: o nome do pet, espécie, raça, porte, cor, sinais particulares, o cartão de manejo, a foto tratada e se ele está perdido. Nenhum dado do tutor aparece nela. Essa página **não aparece no Google**.

**A página do caso de pet perdido** (bichu.app/p/...) **e o perfil público do pet** (bichu.app/@nome-do-pet) entram no ar depois do lançamento do site. Quando entrarem, valem estas regras:

- As duas **aparecem no Google** e em outros buscadores. Isso é diferente de "só vê quem tem o link": o buscador guarda uma cópia do texto e da data por um tempo que o Bichu não controla.
- O perfil público do pet **nasce desligado**. Ele só existe se você o ligar.
- A foto do pet aparece na página, mas o Bichu pede aos buscadores que ela **não entre na busca de imagens**.
- O texto livre (descrição do caso e cartão de manejo) aparece na página, mas o Bichu pede aos buscadores que ele não apareça no trecho do resultado de busca.
- Quando o caso é encerrado, a página passa a responder que o caso não está mais aberto, sem dizer o desfecho. **O resultado antigo pode continuar no Google por dias ou semanas**, até o buscador passar de novo. Prévia de link já enviada por WhatsApp fica guardada na conversa de quem recebeu, e isso o Bichu não consegue apagar.
- Se você precisa que uma página suma do Google com urgência, escreva para privacidade@bichu.app.

**O diretório de profissionais** é público.

## 6. Com quem compartilhamos

**Não vendemos dados pessoais para ninguém.** Compartilhamos só com empresas que prestam serviço ao Bichu (operadores), para o que está descrito abaixo, e com autoridades quando a lei ou uma ordem judicial exigir.

| Empresa | Serviço | O que recebe | Onde os dados ficam |
|---|---|---|---|
| Google Cloud Platform (Google) | Servidores, banco de dados, armazenamento de fotos, cópias de segurança e cofre de senhas do sistema | Todos os dados descritos nesta política | Brasil, região southamerica-east1 (São Paulo) |
| Firebase Cloud Messaging (Google) | Entrega das notificações no celular | O identificador de notificação do aparelho e o texto da notificação | Estados Unidos e outros países onde o Google opera |
| Postmark (ActiveCampaign) | Envio de e-mails | O seu endereço de e-mail e o conteúdo da mensagem | Estados Unidos |

**Buscadores**, como o Google, não são operadores do Bichu: eles leem as páginas que são públicas por natureza, descritas no item 5.

**O que o Bichu não usa hoje:** ferramenta de análise de comportamento (Google Analytics, Firebase Analytics), relatório de falhas de terceiros (Crashlytics, Sentry), publicidade, verificação anti-robô do Google (reCAPTCHA) e Google Maps. Se algum desses passar a ser usado, esta política será atualizada **antes** de ele começar a receber dados.

## 7. Transferência para fora do Brasil

O Firebase Cloud Messaging e o Postmark tratam dados fora do Brasil, principalmente nos Estados Unidos. Essa transferência é feita com base em [HIPÓTESE DO ART. 33 DA LGPD — DECISÃO JURÍDICA], para as finalidades descritas no item 6.

## 8. Como protegemos os dados

- Senhas, códigos de confirmação e códigos de sessão são guardados só como resumo criptográfico.
- O código da plaquinha é guardado de forma que um vazamento do banco, sozinho, não entregue códigos válidos.
- Nas tabelas do produto, o IP é cortado e passa por função criptográfica com chave secreta.
- A foto original fica em armazenamento fechado. A versão pública é gerada sem os metadados de localização.
- As chaves do sistema ficam num cofre de segredos, e não no código.
- Toda comunicação com o app e com o site usa conexão cifrada (HTTPS).

Nenhum sistema é imune a falhas. Se acontecer um incidente de segurança que possa causar risco ou dano relevante a você, vamos comunicar a Autoridade Nacional de Proteção de Dados (ANPD) e as pessoas afetadas, como manda o art. 48 da LGPD.

## 9. Os seus direitos, e como exercer

Pelo art. 18 da LGPD, você pode pedir:

- **confirmação** de que tratamos dados seus, e **acesso** a eles;
- **correção** de dado incompleto, errado ou desatualizado;
- **anonimização, bloqueio ou eliminação** de dado desnecessário, excessivo ou tratado em desacordo com a lei;
- **portabilidade** dos dados;
- **eliminação** dos dados tratados com base no seu consentimento;
- **informação** sobre com quem compartilhamos os seus dados;
- **informação sobre a possibilidade de não dar consentimento**, e o que acontece se você não der;
- **revogação do consentimento**;
- **oposição** a tratamento feito com base em legítimo interesse;
- **revisão** de decisão tomada só de forma automatizada.

**Como pedir.** Escreva para **privacidade@bichu.app**, de preferência a partir do e-mail da sua conta. Podemos pedir uma confirmação de que você é você antes de atender, para não entregar os seus dados a outra pessoa. Todo pedido é registrado com data.

**Prazo de resposta:** [PRAZO — DECISÃO DO CLIENTE]. Para o pedido de acesso completo, a lei dá até 15 dias contados do pedido (art. 19, II, da LGPD).

**O que você já faz sozinho:**

- corrigir os dados do perfil e dos pets pelo app;
- apagar a sua localização de referência;
- desligar as notificações nas configurações do celular;
- excluir um pet pelo app;
- sair de todos os aparelhos.

**Exclusão da conta.** Hoje a exclusão da conta é pedida pelo privacidade@bichu.app. [PENDENTE: o botão de excluir a conta no app ainda não existe] O que acontece:

- a conta deixa de funcionar na hora, as sessões são encerradas, a localização de referência é apagada e o e-mail fica livre para uma conta nova;
- os dados da conta, dos pets, das tags, dos casos, dos achados e das conversas **não são apagados da base**. A conta fica desabilitada: você deixa de ser encontrado em qualquer página ou função do Bichu, e é a desabilitação, e não a ausência do registro, que faz você desaparecer do produto. Essa é uma decisão nossa, e preferimos dizê-la a prometer um apagamento que não acontece;
- **se você quer a eliminação de fato**, peça pelo privacidade@bichu.app. O art. 18, VI, da LGPD é o seu direito, e o pedido é tratado por uma pessoa, uma a uma — não por um prazo automático;
- **o que isso quer dizer, item por item:** a trilha de auditoria continua, e ela é a única coisa aqui que de fato é apagada por prazo, em 24 meses (item 4.14); os arquivos de foto ficam (item 4.4); e as cópias de segurança ficam até vencerem, em até [PRAZO DAS CÓPIAS DE SEGURANÇA — CONFIRMAR EM PRODUÇÃO] dias;
- as conversas de que você participou deixam de aparecer para você e para a outra pessoa, e não são apagadas.

**Cópia dos seus dados.** Hoje a cópia é preparada manualmente, a partir do pedido pelo privacidade@bichu.app. Ela traz os seus dados e as mensagens que você escreveu. Não traz dados de outras pessoas, como o nome ou o contato de quem conversou com você.

**Decisões automáticas.** O Bichu não toma sozinho decisões sobre você. O cruzamento entre achados e casos só sugere, e a confirmação é sempre do tutor. Quando uma conversa é retida automaticamente, ela fica parada até uma pessoa da equipe revisar.

**Reclamação à ANPD.** Se não ficar satisfeito com a nossa resposta, você pode reclamar à Autoridade Nacional de Proteção de Dados, em gov.br/anpd.

## 10. Crianças e adolescentes

**O Bichu é para quem tem 16 anos ou mais, e não trata de propósito dados de crianças nem de adolescentes com menos de 16 anos.** No cadastro pedimos a sua data de nascimento. O Bichu calcula a sua idade no servidor e, com menos de 16 anos, não cria a conta.

**Conferimos a data que você informa, e não um documento.** Não pedimos documento de identidade e não temos como saber se a data é verdadeira. A conferência barra quem informa uma data de menor de 16 anos; ela não barra quem informa uma data falsa.

**O que fazemos com a sua data de nascimento:**

- ela serve só para cumprir a idade mínima de 16 anos, e para nada mais;
- ela **não aparece para outras pessoas**: nem dentro do app, nem em página pública, nem para quem acha o seu pet;
- por quanto tempo ela fica: enquanto a conta existir (item 4.1). Ela não é descartada depois da conferência, porque é ela que prova que a idade mínima de 16 anos foi conferida.

Se descobrirmos que uma conta é de alguém com menos de 16 anos, ela é suspensa e os dados dela são apagados, como na exclusão de conta (item 9). Se você é responsável por uma criança ou adolescente que usa o Bichu, ou sabe de um caso, escreva para privacidade@bichu.app.

[JURÍDICO: com a idade mínima em 16 anos, o Bichu passa a ter adolescentes de 16 e 17 anos como titulares. Dizer aqui o que o art. 14 da LGPD exige nesse caso, e se o melhor interesse do adolescente pede alguma informação ou cuidado a mais nesta política]

Quem avisa pela plaquinha sem conta não precisa informar nenhum dado pessoal. Se for menor de idade, pedimos que não escreva no recado nome, telefone, e-mail ou endereço.

## 11. Cookies e o que fica no seu aparelho

- **O site bichu.app não usa cookies** e não carrega nenhum script de terceiros.
- **O app** guarda o seu código de sessão no cofre de segurança do celular (Keystore do Android) e guarda no próprio aparelho as ações feitas sem internet, até conseguir enviá-las.

## 12. Mudanças nesta política

Quando esta política mudar, a versão e a data no topo mudam junto. Se a mudança for importante, vamos avisar pelo app ou por e-mail antes de ela valer. [JURÍDICO: definir o que é mudança importante e se ela exige novo aceite]

## 13. Lei aplicável

Esta política segue a legislação brasileira, em especial a LGPD (Lei 13.709/2018) e o Marco Civil da Internet (Lei 12.965/2014).
