# ADR-0007: Fotos em armazenamento de objeto compatível com S3

**Status:** aceito
**Data:** 2026-09-17
**Revisado em:** 2026-09-17 — a nuvem deixou de ser AWS e passou a ser decisão
adiada. A decisão de desenho não mudou; mudou de onde o armazenamento vem, e o
ADR passou a declarar o que é proibido usar para que a porta continue aberta.
A dependência de notificação de bucket foi **removida**, não substituída.

## Contexto

A foto é o dado mais importante do produto (é ela que faz o achador reconhecer o
animal) e é também o mais perigoso: foto de celular carrega EXIF com GPS, ou
seja, a casa do tutor. Mídia de usuário servida na mesma origem da aplicação é
XSS com acesso à sessão.

O cliente adiou a escolha de nuvem: o desenvolvimento inteiro até 30/09 roda em
Docker local, e AWS, GCP ou Azure será decidido depois. O armazenamento precisa
funcionar hoje, sem conta em nuvem nenhuma, e a troca depois precisa ser
configuração.

## Decisão

**Armazenamento de objeto compatível com a API S3**, tratado como interface e
não como produto. **Hoje: MinIO em container**, pinado por versão no
`compose.yaml`. Amanhã: S3, GCS (modo de interoperabilidade), R2, Spaces ou
outro compatível, trocando **endpoint, credencial e região por variável de
ambiente**. Nenhuma linha de código muda.

```
STORAGE_ENDPOINT=http://minio:9000       # vazio = endpoint padrão do provedor
STORAGE_REGION=us-east-1                 # qualquer valor no MinIO; obrigatório na assinatura V4
STORAGE_ACCESS_KEY / STORAGE_SECRET_KEY  # nunca no repositório
STORAGE_FORCE_PATH_STYLE=true            # true no MinIO; false na maioria dos gerenciados
STORAGE_BUCKET_PRIVATE / STORAGE_BUCKET_PUBLIC
MEDIA_PUBLIC_BASE_URL=https://img.<dominio>
```

**Dois buckets, nunca um.** `bichu-media-private` (originais e derivadas
privadas, acesso só por URL assinada de 10 minutos, e só para o dono) e
`bichu-media-public` (só as derivadas que a rota pública mostra). Ambos nascem
sem leitura anônima; o público é exposto por um domínio de mídia separado,
**nunca pela origem da aplicação**.

**O backend nunca recebe os bytes.** O cliente pede `photo-upload-intent` e
envia direto ao armazenamento. O contrato devolve `method`: `POST` com política
de formulário (caminho de hoje, MinIO e S3) ou `PUT` com cabeçalhos assinados,
para o provedor que não suportar política de POST. **O cliente lê o campo em vez
de presumir a forma** — é isso que impede que a troca de provedor vire mudança
de app publicado.

**Processamento disparado pela confirmação, não por evento do armazenamento.**
Mudança em relação ao desenho anterior: o cliente já chama
`POST /v1/pets/{petId}/photos` para confirmar, e é essa chamada que enfileira o
trabalho na tabela `jobs`. Upload que nunca é confirmado é varrido pela
expiração de `upload_intents`. Notificação de bucket existe em todos os
provedores com nome, formato e garantia diferentes, e amarrá-la ao caminho
crítico compraria um acoplamento inteiro em troca de nada.

O worker então: valida os **bytes reais** (números mágicos), nunca o
`Content-Type` declarado; **remove todo o EXIF, inclusive GPS**, sem exceção;
reescreve a imagem (o que neutraliza a maior parte dos arquivos poliglota); gera
`thumb` 160 px e `card` 1024 px em WebP com alternativa JPEG; e marca a foto como
`ready`. Antes disso ela não serve a rota pública. **SVG não é aceito em nenhuma
hipótese.**

### A separação que a rota pública exige

| Arquivo | Quem vê | Onde mora |
|---|---|---|
| Original da foto do pet | só o dono, por URL assinada | privado |
| `card` do pet (1024 px, sem EXIF) | **é a única coisa que a rota pública mostra** | público, chave com 128 bits aleatórios |
| `thumb` do pet | app e listagem pública | público |
| Foto enviada pelo achador | **só o tutor, dentro da conversa mediada** | privado, URL assinada |
| Qualquer foto não marcada como pública | ninguém além do dono | privado |

A chave da derivada pública carrega 128 bits aleatórios: é pública, não é
adivinhável, e por isso tem cache longo sem assinatura. Trocar a foto gera chave
nova e apaga a antiga.

**Ciclo de vida:** original mantido enquanto o pet existir; expurgo definitivo 30
dias após a exclusão do pet ou da conta; foto de achador apagada 30 dias após o
encerramento do caso. A expiração é executada por um job nosso, **não** por
regra de ciclo de vida do provedor.

### O que é proibido usar hoje, para não fechar a porta amanhã

Esta lista é normativa e vale como critério de reprovação em revisão:

1. **SDK amarrado a provedor no domínio.** O SDK vive em
   `modules/media/adapters/external/`, atrás da porta `ObjectStorage`
   (`createUploadIntent`, `getSignedReadUrl`, `head`, `get`, `put`, `delete`).
   Nenhum outro módulo o importa.
2. **URL de bucket, endpoint, região ou nome de bucket em código.** Tudo vem de
   ambiente. Um `https://s3.amazonaws.com/...` escrito à mão em qualquer lugar é
   defeito.
3. **Notificação de bucket, gatilho de evento e função serverless do provedor.**
   O disparo é nosso, pela confirmação.
4. **Regra de ciclo de vida, tiering e classe de armazenamento do provedor.**
   A retenção é regra de negócio e está no ADR-0010; ela não pode viver num
   painel que muda de nome entre nuvens.
5. **Criptografia com chave gerenciada do provedor (KMS) como dependência do
   domínio.** O texto cifrado do código da tag (ADR-0004) usa a porta
   `SecretCipher`, cuja implementação de hoje é AES-256-GCM com chave de
   ambiente; amanhã pode ser KMS, Cloud KMS ou Key Vault, sem mudar quem chama.
6. **Identidade de carga de trabalho do provedor** (perfil de instância, conta de
   serviço implícita) como único caminho de credencial. Chave por variável de
   ambiente precisa continuar funcionando, porque é o que existe em Docker local.
7. **Recurso sem equivalente nos três**: seleção de objeto por consulta, replicação
   entre regiões, pré-assinatura com condição exótica, controle de acesso por
   política de bucket específica de um provedor.

### O que não é portátil, e precisa estar dito

- **Azure Blob não fala a API S3.** MinIO, S3, GCS (interoperabilidade), R2 e
  Spaces falam. Se a escolha cair no Azure, é preciso um segundo adaptador atrás
  da mesma porta `ObjectStorage`: estimo **cerca de um dia**, mais o teste.
  Não é reescrita, mas também não é zero, e quem decide a nuvem precisa saber
  disso antes de decidir.
- **A política de POST assinado não é idêntica entre provedores.** Por isso o
  contrato já carrega `method`. No GCS, a compatibilidade da política de POST
  pela API de interoperabilidade é **a confirmar** no dia da escolha; o caminho
  `PUT` é a saída conhecida.
- **A CDN na frente do domínio de mídia é específica de quem hospedar.** O que
  não muda é o contrato: um domínio separado, cache longo para chave imutável,
  e nada de servir mídia pela origem da aplicação.

## Alternativas consideradas

| Opção | Prós | Contras | Por que não |
|---|---|---|---|
| Esperar a nuvem e guardar foto em disco | nada para instalar | reescreve o upload inteiro depois, e o app já teria aprendido outro caminho | o cliente não pode ficar sem foto até a decisão |
| Guardar imagem no Postgres | um componente a menos | infla banco e backup, e serve estático pela aplicação | o servidor não serve arquivo |
| MinIO como decisão definitiva | simples | vira infraestrutura para operar quando houver tráfego real | hoje é implementação, não decisão |
| Camada de abstração genérica de nuvem | portabilidade "grátis" | abstrai pelo menor denominador e esconde o que importa | uma porta nossa, pequena, resolve |
| Upload pelo backend | validação centralizada | gasta CPU e banda e derruba upload em rede móvel ruim | o servidor não recebe arquivo |
| Notificação de bucket para processar | desacoplado | recurso que varia de provedor, no caminho crítico | a confirmação já existe no contrato |

## Consequências

Fica mais fácil: rodar tudo em `docker compose up` sem conta em nuvem nenhuma, e
provar a portabilidade com o mesmo código em dois destinos.

Fica mais difícil: o MinIO precisa ser criado, semeado e ter os buckets
provisionados na subida do ambiente local, e o domínio de mídia precisa existir
mesmo no mínimo hospedado — não dá para servir mídia pela origem da aplicação
"só por enquanto".

Dívida registrada: sem varredura antivírus no upload, mitigada por validação de
bytes reais, reescrita da imagem e, no upload anônimo, descarte imediato do
original.

**Gatilho corrigido (SEC-009).** O gatilho original era "abertura de upload a
usuário não autenticado em qualquer fluxo novo", e ele **já nascia disparado**,
pela própria foto do achador do MVP. Gatilho que já nasceu disparado não é
gatilho: é dívida sem condição de pagamento. O gatilho válido passa a ser
**qualquer retenção de arquivo original enviado por quem não está
autenticado**, ou o primeiro relato de conteúdo ilícito, o que vier antes.
