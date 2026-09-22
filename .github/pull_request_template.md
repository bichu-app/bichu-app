## O que muda

<!-- Uma frase. O que este PR entrega, do ponto de vista de quem usa. -->

## Issue

<!-- BICHUS-000. A chave vem do acionamento da tarefa, nao da memoria nem do
     nome da branch. O projeto e BICHUS: chave BICHU-<n> e da numeracao antiga e
     aponta para outro cartao. Sem chave de issue, explique por que nao ha uma. -->
Fecha BICHUS-

## Onda

<!-- Marque uma. Ver docs/fluxo.md. -->
- [ ] Onda 0 - modelo de dados, autenticacao, ambiente de homologacao
- [ ] Onda 1 - cadastro, QR, scan, foto
- [ ] Onda 2 - rota publica, deep link, verificacao de e-mail
- [ ] Onda 3 - perdido e achado, push, contato mediado
- [ ] Fora de onda - infraestrutura, correcao, documentacao

## Criterio de aceite

<!-- Copie o criterio da issue e diga onde, no repositorio, ele e verificavel. -->

## Como foi verificado

<!-- Comando executado e resultado. "Testei local" nao e verificacao. -->

```
```

## Checklist

- [ ] O criterio de aceite da issue esta atendido, nao parcialmente atendido
- [ ] Ha teste automatizado cobrindo o comportamento novo, ou esta dito por que nao ha
- [ ] Nenhum segredo, token, chave ou credencial no diff (inclusive em teste e fixture)
- [ ] Nenhum dado pessoal real em fixture, seed ou log
- [ ] Migracao de banco, se houver, e reversivel ou tem plano de reversao escrito
- [ ] Contrato em `api/openapi.yaml` atualizado quando a resposta mudou, campo a campo
- [ ] Variavel de ambiente nova esta em `.env.example` com valor vazio

## Impacto irreversivel

<!-- Marque se o PR toca algo que nao se desfaz, e explique. -->
- [ ] Toca o codigo da tag QR, o dominio impresso, ou chave de assinatura
- [ ] Toca esquema de banco sobre dado ja existente
- [ ] Toca politica de bucket, CORS, ou cabecalho de seguranca
- [ ] Nada irreversivel

## Risco de privacidade

<!-- LGPD. Foto, localizacao e contato sao os tres dados sensiveis do produto. -->
- [ ] Nao expoe localizacao mais precisa que bairro em superficie publica
- [ ] Nao expoe telefone, e-mail ou endereco fora do canal mediado
- [ ] Nao se aplica
