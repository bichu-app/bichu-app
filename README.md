# Bichu

App mobile de comunidade pet no Brasil. O tutor cadastra o pet com foto e sinais,
vincula uma tag QR na coleira e, quando o pet some, dispara um alerta para
tutores num raio de 5 km. **Quem encontra o animal avisa o tutor em segundos,
com ou sem o app, sem ver telefone nem endereço.**

Domínio: `bichu.app`.

## O que é cada pasta

| Pasta | O que tem |
|---|---|
| `api/` | **`openapi.yaml`, o contrato.** É a fonte da verdade, escrito antes do código |
| `src/` | código-fonte: monólito modular em TypeScript. Comece por `src/README.md` |
| `app/` | aplicativo Flutter |
| `tests/` | cenários Gherkin e specs de ponta a ponta |
| `infra/` | infraestrutura como código |
| `docs/` | arquitetura, produto, segurança, UX, design system, devops, testes |
| `adr/` | uma decisão por arquivo, com o que foi descartado e por quê |

## Para quem está abrindo isto pela primeira vez

Leia nesta ordem. São quatro arquivos, e eles respondem quase tudo:

1. **`BRIEFING.md`** — o produto, o escopo fechado do MVP e o que ficou de fora.
2. **`api/openapi.yaml`** — o que o sistema faz. Toda operação declara o que
   exige de credencial, que efeito produz fora do processo e que teto tem.
3. **`docs/03-arquitetura.md`** — como está montado. A §4 tem o modelo de dados,
   a §11 o contrato de portabilidade, a §16 o caminho de crescimento.
4. **`adr/`** — por quê. Quando um documento e um ADR divergirem, **o ADR vale**,
   porque é ele que carrega o motivo.

## Cinco regras que explicam quase todas as decisões

1. **O fluxo mais crítico é anônimo.** Quem acha o animal não tem conta, está na
   rua, com uma mão só, em rede móvel ruim. Meta: do scan ao aviso em menos de
   60 segundos. Tudo que atrapalha esse caminho perde para ele.
2. **Um identificador deste sistema é impresso em plástico.** O código da tag não
   se reemite. É o único ponto verdadeiramente irreversível do produto.
3. **Contato é sempre mediado, e não há recompensa no produto.** É a contramedida
   ao golpe do falso achador, que é padrão conhecido no Brasil.
4. **Superfície pública nunca mostra coordenada, contato ou identificador
   interno.** O nível máximo de precisão geográfica em público é o bairro. A
   lista completa está no ADR-0010, e ela vale como critério de reprovação de PR.
5. **Toda regra de negócio vive no servidor.** O teste: se alguém chamar a API
   direto, sem passar pela tela, o sistema continua íntegro.

## Rodando

O ambiente inteiro sobe em containers, sem conta em nuvem nenhuma.

```sh
cp .env.example .env     # preencha os valores vazios (chaves de dev, senhas)
make up                  # constrói a imagem, aplica as migrações e sobe tudo
curl http://localhost:3000/v1/health
```

`make up` é o comando único: `compose.yaml` traz a aplicação, PostgreSQL com
PostGIS, armazenamento de objeto compatível com S3, um receptor de e-mail local
e a borda. As migrações são aplicadas antes de a aplicação subir, por um job
próprio; `make reset` apaga o volume e repete tudo do zero, que é o que prova a
migração em banco vazio.

Se a porta 3000 da sua máquina já é de outro projeto, `make up PORTA=3100` troca
porta publicada e URL base juntas. `make ajuda` lista o resto dos alvos.

| Comando | O que faz |
|---|---|
| `make up` | sobe dev, aplicando as migrações |
| `make reset` | derruba apagando o volume e sobe do zero |
| `make test` | testes unitários, dentro da imagem |
| `make logs` | tail agregado dos serviços |
| `make down` | derruba preservando o volume |

O detalhe de cada um, e o porquê das decisões, está em `docs/07-devops.md`.

## Configuração que ainda não existe

Estes pontos estão declarados e **não têm valor definido**. Onde aparecerem, é
variável de ambiente sem padrão: a aplicação recusa subir sem eles, com o nome na
mensagem, em vez de usar um exemplo que alguém confunda com o real.

| O que falta | Onde entra |
|---|---|
| Nome do pacote do aplicativo | manifesto Android e projeto iOS |
| Team ID da conta Apple | `apple-app-site-association` |
| Impressão digital SHA-256 da chave de assinatura do APK | `assetlinks.json` |
| Chaves do Google Maps | configuração do app |

Enquanto faltarem, as rotas dos dois arquivos de associação respondem **503**, e
não um arquivo vazio: arquivo válido e errado faz o sistema operacional cachear
uma associação quebrada, e o deep link passa a falhar em silêncio.
