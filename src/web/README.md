# `web/` — as rotas HTML servidas pelo próprio backend

Aqui moram os modelos das páginas públicas: a página da tag (`/t/<código>`), a
conversa do achador sem conta, o cartaz, a página do caso, o perfil por slug e
as páginas de confirmação de e-mail e de redefinição de senha.

Três regras que vêm da pesquisa de UX e da segurança, e que **não são
preferência de implementação**:

1. **O botão funciona sem JavaScript.** `<form method="post">`, com o script
   melhorando por cima. Celular antigo com script lento não pode perder o botão,
   e esse é o fluxo mais crítico do produto.
2. **Sem fonte web bloqueando a renderização** e sem recurso de terceiro nas
   páginas que carregam token (SEC-005).
3. **Conteúdo crítico embutido**, para carregar no primeiro pacote útil. O
   orçamento é 30 KB de HTML com CSS crítico e 30 KB de JavaScript inicial,
   comprimidos, e ele quebra o build quando estoura (§7).

As páginas de verificação de e-mail e de redefinição de senha existem porque o
SEC-005 **proíbe confirmar por `GET` na URL do e-mail**: varredor de link de
antivírus e pré-visualização de mensageiro consomem o token antes da pessoa. O
link abre uma página com um botão, e a confirmação acontece no `POST`.
