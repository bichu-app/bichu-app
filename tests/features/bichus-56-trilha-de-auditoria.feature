# language: pt
# BICHUS-56 — Trilha de auditoria em esquema separado, com papel de banco sem
# UPDATE nem DELETE.
#
# A trilha não tem tela: ninguém a lê pela interface, e nenhum caso de
# homologação a prova. O executor dos cenários de esquema e de permissão é
# `tests/integration/esquema.test.ts`. Os cenários de evento e de expurgo
# dependem da aplicação gravando, e ainda não têm executor.

Funcionalidade: A trilha que ninguém consegue alterar nem apagar

  Contexto:
    Dado um banco com todas as migrações de "migrations/" aplicadas

  Cenário: A trilha mora separada do domínio
    Quando a inspeção lê o catálogo
    Então deve existir um esquema "audit" separado
    E a tabela de eventos deve viver dentro dele

  Cenário: O papel da aplicação grava e lê, e só
    Quando a inspeção lê as permissões do papel da aplicação sobre a tabela de eventos
    Então ele deve ter INSERT e SELECT
    E ele não deve ter UPDATE nem DELETE

  Cenário: O banco recusa de fato, e não só no catálogo
    Dado que a aplicação assumiu o papel dela antes de gravar
    Quando ela tenta alterar ou apagar um evento já gravado
    Então o banco deve recusar com permissão negada
    # Privilégio no catálogo e recusa no banco não são a mesma afirmação: o dono
    # da tabela contorna qualquer concessão. Este é o caso guardado que precisa
    # reprovar se a permissão for afrouxada.

  Cenário: O expurgo é um papel separado
    Quando a inspeção lê as permissões do papel de expurgo
    Então ele deve ter SELECT e DELETE
    E ele não deve ter INSERT nem UPDATE

  Cenário: A trilha não é legível por todo mundo
    Quando a inspeção lê as permissões concedidas a PUBLIC
    Então PUBLIC não deve ter nenhuma permissão sobre a tabela de eventos
    E PUBLIC não deve conseguir usar o esquema

  Cenário: O ator é o identificador interno, nunca o e-mail
    Quando a inspeção lê as colunas da tabela de eventos
    Então deve existir a coluna do identificador do ator, do tipo uuid
    E não deve existir nenhuma coluna de e-mail do ator

  Cenário: O endereço de origem é HMAC, e não hash simples
    Quando a inspeção lê a coluna do endereço de origem
    Então ela deve guardar um valor binário calculado com chave secreta
    E não deve existir nenhuma coluna guardando o endereço em claro
    # Hash sem chave sobre IPv4 se reverte por força bruta em minutos, e a
    # trilha guardaria IP em claro achando que anonimizou.

  Cenário: A trilha sobrevive à conta que ela documenta
    Quando a inspeção percorre as chaves estrangeiras do esquema de auditoria
    Então nenhuma delas deve apontar para a tabela de usuários
    # Chave estrangeira com CASCADE apagaria exatamente a evidência do pedido de
    # exclusão no momento em que ele fosse atendido.

  Esquema do Cenário: Os eventos obrigatórios gravam linha
    Dado que a aplicação está no ar
    Quando acontece "<evento>"
    Então deve existir uma linha na trilha com essa ação
    E ela deve trazer o ator, o instante, a correlação e o recurso

    Exemplos:
      | evento                        |
      | login                         |
      | falha de login                |
      | troca de senha                |
      | criação de tag                |
      | revogação de tag              |
      | abertura de caso              |
      | encerramento de caso          |
      | disparo de alerta             |
      | decisão sobre candidato       |
      | denúncia                      |
      | bloqueio                      |
      | pedido de exclusão de dados   |
      | pedido de exportação de dados |
      | decisão de moderação          |

  Cenário: O expurgo de 24 meses roda e é conferido
    Dado um registro com data retroagida para além de 24 meses
    Quando o job de expurgo roda
    Então esse registro deve ter sumido
    E o job deve falhar ruidosamente se não achar o registro que deveria expurgar

  Cenário: A consulta da trilha tem dono e regra escrita
    Quando alguém precisa consultar a trilha
    Então deve estar escrito quem pode consultar e como
    # Consulta sem controle transforma a trilha numa segunda base de dado
    # pessoal, com o agravante de guardar o histórico inteiro.
