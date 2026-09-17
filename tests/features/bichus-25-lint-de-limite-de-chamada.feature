# language: pt
# BICHUS-25 — Lint de OpenAPI: toda operação pública precisa declarar limite de chamada.
#
# Portão é a única categoria de software em que o caminho feliz é irrelevante.
# Por isso os cenários abaixo são quase todos negativos: eles descrevem o que o
# lint PRECISA reprovar, e as iscas que sustentam cada um estão guardadas em
# `tests/lint-limite/`.
#
# O lint ainda não existe no repositório. A regra do Spectral que existe hoje
# (`infra/spectral/.spectral.yaml`, bichu-efeito-exige-limite) cobre outra
# classe: operação com `x-effects`. Uma rota pública de leitura, sem efeito
# declarado e sem teto, passa por ela. Estes cenários são a especificação do
# que falta.

Funcionalidade: O lint que recusa operação pública sem teto de chamada

  Contexto:
    Dado o lint de limite de chamada, rodando com a versão que a esteira executa

  Cenário: A versão da ferramenta é dita no resultado
    Quando o lint termina
    Então o relatório deve dizer qual versão da ferramenta rodou
    # Regra testada numa versão e pinada em outra já foi declarada funcionando
    # sendo cega, e justamente no caso que ela existia para pegar.

  Esquema do Cenário: O que o lint precisa acusar
    Dado a isca "tests/lint-limite/deve-reprovar-operacao-publica-sem-limite.yaml"
    Quando o lint roda sobre ela
    Então ele deve reprovar a operação "<operacao>"
    E a mensagem deve dizer "<motivo>"

    Exemplos:
      | operacao                    | motivo                                             |
      | publicaSemLimite            | operação pública sem x-rate-limit                  |
      | opcionalSemLimite           | autenticação opcional sem x-rate-limit             |
      | limiteComPalavraInventada   | on_exceed fora do vocabulário do contrato          |
      | limiteComCountsInventado    | counts fora dos valores declarados no contrato     |

  Cenário: A isca que passa derruba o próprio lint
    Dado que a isca de "tests/lint-limite/" está ausente ou foi corrigida
    Quando a esteira roda
    Então ela deve reprovar dizendo que o lint parou de enxergar
    E ela não deve seguir por não ter encontrado o arquivo

  Esquema do Cenário: O que o lint não pode acusar
    Dado a contraprova "tests/lint-limite/deve-aprovar-excecoes-declaradas.yaml"
    Quando o lint roda sobre ela
    Então ele deve aprovar a operação "<operacao>"

    Exemplos:
      | operacao                  |
      | health                    |
      | androidAssetLinks         |
      | appleAppSiteAssociation   |
      | jwks                      |
      | publicaComLimite          |

  Cenário: A exceção vive na lista do lint, com o motivo escrito
    Quando eu leio a lista de exceções do lint
    Então ela deve ter exatamente um item de rota sem limite nenhum, que é "GET /health"
    E o motivo escrito deve ser que quem chama é a sonda do balanceador
    E nenhuma exceção deve existir por omissão

  Cenário: Os arquivos que o sistema operacional busca não podem recusar nem desafiar
    Dado os arquivos de associação e o conjunto de chaves
    Quando o lint avalia o limite deles
    Então o valor de on_exceed deve ser "log_and_alert"
    E os valores "challenge" e "deny_429" devem ser reprovados nessas operações

  Cenário: Rota pública nova nasce coberta
    Dado uma operação pública acrescentada à especificação depois de hoje
    Quando ela não declara x-rate-limit
    Então o lint deve reprová-la
    E ninguém deve precisar acrescentar essa rota a lista nenhuma

  Cenário: Sem especificação para ler, o lint reprova
    Dado que "api/openapi.yaml" não carrega ou não é encontrado
    Quando o job roda
    Então ele deve falhar com o motivo na mensagem
    E ele nunca deve passar verde por não ter o que checar
    # Hoje é isso que acontece de fato: a especificação tem YAML inválido
    # (chave duplicada), e o carregamento reprova. É o comportamento certo.
