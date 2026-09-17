# language: pt
# BICHUS-31 — Formato único de erro, idempotência e comportamento padrão sem conexão.
#
# O critério que faltava caso escrito é este, textual: "quando a rede é cortada
# no meio de cada fluxo do inventário de telas, então nenhuma tela fica em
# branco e nenhuma fica em esqueleto permanente".
#
# "No meio" é o que dá trabalho e é o que pega defeito. Cortar antes de abrir a
# tela exercita o caminho que todo mundo já tratou; cortar DEPOIS do toque e
# ANTES da resposta exercita o estado que ninguém desenhou. Por isso o momento
# do corte está escrito tela por tela, e não como "sem conexão".
#
# O inventário é o da seção 6 de docs/05-ux-research.md, com as 39 telas. Tela
# que entrar lá depois entra aqui: o caso é por tela, não por fluxo feliz.

Funcionalidade: A rede cortada no meio de cada fluxo

  Contexto:
    Dado que eu abri a tela com conexão
    E que a rede cai depois da minha ação e antes da resposta do servidor

  # ---------------------------------------------------------------------------
  # A regra que vale para as 39 telas, sem exceção.
  # ---------------------------------------------------------------------------
  Esquema do Cenário: O corte no meio não deixa a tela sem saída
    Dado que estou na tela "<tela>"
    Quando a rede cai no meio de "<momento do corte>"
    Então a tela não deve ficar em branco
    E ela não deve ficar em esqueleto permanente
    E devo ver o que houve e o que fazer agora
    E o texto não deve conter "erro", "inválido", "falhou", "ops", "algo deu errado" nem código técnico
    E devo ter uma saída visível na própria tela

    Exemplos: Cadastro de tutor e pet
      | tela                                 | momento do corte                        |
      | F1.1 Criar conta                     | o envio do cadastro                     |
      | F1.2 Verifique seu e-mail            | o reenvio do e-mail de verificação      |
      | F1.3 Cadastrar pet: identificação    | o envio do primeiro passo               |
      | F1.4 Cadastrar pet: foto             | o envio da foto                         |
      | F1.5 Cadastrar pet: sinais           | o envio do último passo                 |
      | F1.6 Pet cadastrado / QR gerado      | a emissão do código                     |
      | F1.7 A tag da Nina                   | a geração do arquivo de impressão       |

    Exemplos: Scan da tag pelo app
      | tela                                 | momento do corte                        |
      | F2.1 Leitor de QR                    | a consulta do código lido               |
      | F2.2 Achei este pet (app)            | o envio do aviso ao tutor               |
      | F2.3 Modo dono                       | o carregamento da ficha do próprio pet  |

    Exemplos: Perdido e achado
      | tela                                 | momento do corte                        |
      | F3.1 Confirmar perdido: onde e quando| o envio de onde e quando                |
      | F3.2 Confirmar perdido: alcance      | o cálculo do alcance                    |
      | F3.3 Caso aberto                     | a atualização do estado do caso         |
      | F3.4 Alerta recebido (vizinho)       | a abertura do caso a partir do alerta   |
      | F3.5 Registrar achado avulso         | o envio do achado                       |
      | F3.6 Possíveis correspondências      | o carregamento da lista de candidatos   |
      | F3.7 Conversa (contato mediado)      | o envio da mensagem                     |
      | F3.8 Encerrar caso: desfecho         | o envio do desfecho                     |
      | F3.9 Cartaz                          | a geração do cartaz                     |

    Exemplos: Rota pública do QR
      | tela                                 | momento do corte                        |
      | F4.1 Achei este pet (web)            | o envio do aviso ao tutor               |
      | F4.2 Aviso enviado (web)             | o carregamento da confirmação           |
      | F4.3 Contar mais (web)               | o envio da foto e do recado             |
      | F4.4 Conversa (web, por token)       | o envio da mensagem                     |
      | F4.5 Código não encontrado           | o carregamento da página da tag         |

    Exemplos: Telas comuns
      | tela                                 | momento do corte                        |
      | C.1 Guarda de ação                   | a retomada da intenção depois do login  |
      | C.2 Entrar                           | o envio das credenciais                 |
      | C.3 Pedido de permissão (antessala)  | o registro do aparelho para notificação |
      | C.4 Esqueci minha senha              | o pedido de redefinição                 |
      | C.5 Criar uma senha nova             | o envio da senha nova                   |
      | C.6 Senha alterada                   | o carregamento da confirmação           |
      | C.7 Denunciar                        | o envio da denúncia                     |

    Exemplos: Tutor e transferência
      | tela                                 | momento do corte                        |
      | T.1 Detalhe do pet                   | o carregamento da ficha                 |
      | T.2 Perfil                           | o carregamento do perfil                |
      | T.3 Transferir a Nina                | o envio da transferência                |
      | T.4 Receber um pet                   | o aceite da transferência               |

  # ---------------------------------------------------------------------------
  # Onde o UX declarou o texto exato, o caso cobra o texto exato.
  # ---------------------------------------------------------------------------
  Esquema do Cenário: O texto que a tela mostra é o da tabela 12.4
    Dado que estou na tela "<tela>"
    Quando a rede cai no meio de "<momento do corte>"
    Então devo ver "<texto>"

    Exemplos:
      | tela                          | momento do corte           | texto                                                                 |
      | F2.2 Achei este pet (app)     | o envio do aviso ao tutor  | Você está sem conexão. Vamos enviar assim que o sinal voltar.         |
      | F3.5 Registrar achado avulso  | o envio do achado          | Você está sem conexão. Vamos enviar assim que o sinal voltar.         |
      | F1.1 Criar conta              | o envio do cadastro        | Isso precisa de conexão. Tente de novo quando tiver sinal.            |
      | C.2 Entrar                    | o envio das credenciais    | Isso precisa de conexão. Tente de novo quando tiver sinal.            |
      | F1.4 Cadastrar pet: foto      | o envio da foto            | A foto não foi enviada. Ela está salva aqui.                          |
      | F1.7 A tag da Nina            | a geração do arquivo       | Não conseguimos montar o arquivo da tag agora.                        |
      | F3.2 Confirmar perdido: alcance | o cálculo do alcance     | Não conseguimos calcular quantos tutores estão por perto agora.       |
      | F3.7 Conversa                 | o envio da mensagem        | Esta mensagem não foi enviada.                                        |
      | F4.4 Conversa (web, por token)| o envio da mensagem        | Esta mensagem não foi enviada.                                        |
      | F2.1 Leitor de QR             | a consulta do código lido  | Estamos sem conexão.                                                  |

  Cenário: A ação que não pode esperar diz isso, e não gira para sempre
    Dado que estou numa ação que exige servidor
    Quando a rede cai no meio dela
    Então devo ver "Isso precisa de conexão. Tente de novo quando tiver sinal."
    E não deve existir nenhum indicador de progresso sem fim na tela

  # ---------------------------------------------------------------------------
  # A fila, que é o que transforma "sem conexão" em "vai sair depois".
  # ---------------------------------------------------------------------------
  Cenário: A ação enfileirada sobrevive ao aplicativo ser encerrado pelo sistema
    Dado que a minha ação entrou na fila local sem conexão
    Quando o aplicativo é encerrado pelo sistema e aberto de novo
    Então a ação deve continuar na fila
    E a tela deve mostrar que ela ainda não foi enviada

  Cenário: A tela nunca mostra sucesso que ainda não aconteceu
    Dado que existe uma ação na fila local
    Quando eu abro a tela dessa ação
    Então devo ver o estado real dela
    E não devo ver confirmação de envio antes de o servidor ter respondido

  Cenário: O reenvio usa a mesma chave de idempotência da primeira tentativa
    Dado que uma ação foi enfileirada sem conexão
    Quando a conexão volta e a fila reenvia
    Então o servidor deve receber a mesma chave de idempotência da primeira tentativa
    E o efeito deve acontecer uma única vez

  Cenário: A rede que cai depois de o servidor ter executado não duplica nada
    Dado que o servidor executou a minha ação e a resposta não chegou até mim
    Quando eu repito a ação com a mesma chave de idempotência
    Então devo receber a resposta original
    E o efeito não deve acontecer de novo

  Cenário: Chave reaproveitada para outra coisa é recusada
    Dado que eu usei uma chave de idempotência numa ação
    Quando eu envio uma ação diferente com a mesma chave
    Então a requisição deve ser recusada
    E a resposta da primeira ação não deve ser devolvida

  # ---------------------------------------------------------------------------
  # O formato do erro, que é o que faz a tela saber o que mostrar.
  # ---------------------------------------------------------------------------
  Cenário: Todo erro vem no formato único
    Quando qualquer operação da API falha
    Então a resposta deve ser "application/problem+json"
    E ela deve trazer type estável, title, status e correlation_id
    E o correlation_id deve ser o mesmo que aparece no log e no rastro

  Cenário: Mudar o texto do erro não muda o comportamento da tela
    Dado uma resposta de erro com um type conhecido
    Quando o title e o detail dessa resposta mudam de texto
    Então a tela deve se comportar exatamente do mesmo jeito
    E a decisão da tela deve ter sido tomada pelo type

  Cenário: O erro que tem saída alternativa traz a saída
    Quando a operação falha e existe uma saída alternativa
    Então a resposta deve trazer next_action
    E o valor deve ser um dos quatro do contrato
    E a tela deve montar a ação a partir desse campo, e não deduzir pelo status

  Cenário: A recusa por excesso diz quando tentar de novo
    Quando a operação é recusada por excesso de chamadas
    Então a resposta deve trazer o cabeçalho Retry-After em segundos
    E o corpo deve estar no formato único de erro

  Esquema do Cenário: O leitor de tela é avisado da forma certa
    Dado um estado do tipo "<tipo>"
    Quando ele aparece na tela
    Então ele deve ser anunciado como "<anuncio>"

    Exemplos:
      | tipo                          | anuncio                       |
      | erro que exige ação minha     | role="alert"                  |
      | informação sobre o andamento  | role="status" aria-live polite |
