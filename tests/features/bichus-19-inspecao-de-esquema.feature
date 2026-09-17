# language: pt
# BICHUS-19 — Identidade de conta com UUID interno estável e tabela de identidades.
#
# Esta história não tem tela, e por isso nenhum caso de homologação a prova.
# Os critérios 1, 2, 4, 5 e 6 são afirmações sobre o modelo de dados, e a única
# forma de conferi-las sem perguntar a alguém é perguntar ao catálogo do banco.
# O executor destes cenários é `tests/integration/esquema.test.ts`.
#
# O "Então" de cada cenário é uma consulta ao catálogo, não a leitura de um
# diagrama: quem revisa reexecuta e vê o mesmo resultado, e no dia em que a
# promessa deixar de valer o cenário reprova sozinho.

Funcionalidade: A identidade da conta conferida por inspeção de esquema

  Contexto:
    Dado um banco com todas as migrações de "migrations/" aplicadas

  Cenário: A inspeção reprova quando não tem o que inspecionar
    Dado um banco sem as migrações aplicadas
    Quando a inspeção de esquema roda
    Então ela deve falhar dizendo qual tabela faltou
    E ela não deve terminar verde por não ter encontrado nada

  Cenário: O identificador da conta é um UUID e é a chave primária
    Quando a inspeção lê a definição da tabela de usuários
    Então a coluna "id" deve ser do tipo uuid
    E ela deve ser a chave primária da tabela

  Cenário: Toda referência a usuário aponta para o identificador interno
    Quando a inspeção percorre as chaves estrangeiras do banco
    Então toda chave estrangeira que aponta para a tabela de usuários deve apontar para a coluna "id"
    E a quantidade de chaves estrangeiras encontradas deve ser maior que zero

  Esquema do Cenário: Valor que o usuário troca não vira chave estrangeira
    Quando a inspeção percorre as chaves estrangeiras do banco
    Então nenhuma delas deve usar a coluna "<coluna>", nem como origem nem como destino

    Exemplos:
      | coluna            |
      | email             |
      | pending_email     |
      | email_at_provider |
      | phone_e164        |
      | login             |
      | provider_subject  |
      | tag_code          |
      | qr_code           |

  Cenário: Trocar o e-mail não obriga migração de nada
    Quando a inspeção procura quem referencia o e-mail do usuário
    Então ninguém deve referenciá-lo
    E pets, casos, conversas e registros de auditoria devem continuar ligados pelo identificador interno

  Cenário: A tabela de identidades existe desde o primeiro dia
    Quando a inspeção lê a tabela de identidades
    Então deve existir unicidade sobre o par provedor e assunto do provedor
    E deve existir unicidade sobre o par conta e provedor
    E o provedor "local" deve ser um valor aceito

  Cenário: A credencial local mora separada do vínculo
    Quando a inspeção lê a tabela de credenciais locais
    Então ela deve referenciar a tabela de identidades pelo identificador dela
    E a tabela de usuários não deve carregar nenhuma coluna de senha nem de provedor

  Cenário: Um provedor novo é uma linha nova, e não uma alteração de tabela
    Quando a inspeção lê as colunas da tabela de usuários
    Então não deve existir nenhuma coluna de provedor, de assunto de provedor nem de identificador externo
    E acrescentar login social deve caber num INSERT na tabela de identidades

  Cenário: Nenhum valor impresso em QR é chave estrangeira
    Quando a inspeção percorre as chaves estrangeiras do banco
    Então nenhuma tabela cujo nome termine em "tag" ou "tags" deve ser referenciada por outra coluna que não o identificador interno dela
    E a inspeção deve registrar quantas tabelas de tag encontrou
    # O registro da contagem é o que impede alguém ler "passou" como "a tag foi
    # conferida" enquanto a migração da tag ainda não existe. No dia em que ela
    # entrar, a asserção passa a valer sem ninguém precisar lembrar de nada.
