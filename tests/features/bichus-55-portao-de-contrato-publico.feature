# language: pt
# BICHUS-55 — Portão de contrato: nenhuma resposta pública devolve campo proibido.
#
# Parte desta história já tem teste: `src/tools/portao-contrato-publico.test.ts`
# cobre quem o portão percorre, o que ele precisa reprovar, o campo parecido que
# ele não pode acusar, e a ausência de alvo como reprovação. A isca interna do
# próprio portão roda a cada execução.
#
# O que os cenários abaixo acrescentam é o que nenhum teste de unidade alcança:
# o portão rodando contra a especificação de verdade, dentro da esteira, e a
# passada humana sobre as respostas reais. Portão que só existe dentro do
# próprio teste de unidade prova que a função funciona, não que a regra vale.

Funcionalidade: O portão de contrato rodando onde ele precisa valer

  Cenário: O portão roda contra a especificação de verdade, na esteira
    Dado a especificação "api/openapi.yaml"
    Quando a esteira roda
    Então o portão de contrato deve ser executado contra ela
    E o resultado dele deve decidir se a esteira passa
    # Hoje nenhum job da esteira executa o portão: ele só roda dentro do teste
    # de unidade, sobre contratos de mentira escritos no próprio teste. Enquanto
    # for assim, o critério 4 ("rota pública nova é coberta sem ninguém precisar
    # lembrar de nada") não vale, porque nada percorre a rota nova.

  Cenário: Especificação que não carrega reprova, e diz por quê
    Dado que "api/openapi.yaml" não é YAML válido
    Quando o portão roda
    Então ele deve reprovar
    E a mensagem deve dizer em que linha a especificação quebrou
    # Verificado em 2026-09-17: a especificação de hoje não carrega
    # ("Map keys must be unique at line 1545"), e o portão reprova. É o
    # comportamento certo, e é a razão de o portão nunca ter passado verde
    # contra o contrato real.

  Cenário: Rota pública nova nasce coberta
    Dado uma operação pública acrescentada à especificação depois de hoje
    Quando o portão roda
    Então ele deve percorrer essa operação
    E a contagem de operações percorridas deve ter aumentado em um

  Cenário: A versão da ferramenta é dita, e é a mesma da esteira
    Quando o portão termina
    Então o relatório deve dizer a versão do portão, a do Node e a do leitor de YAML
    E essas versões devem ser as mesmas com que a esteira executa

  Cenário: A passada humana sobre as respostas reais
    Dado as oito operações públicas da especificação
    Quando a homologação acontece
    Então alguém deve ler a resposta real de cada uma
    E nenhuma delas deve trazer coordenada, telefone, e-mail, endereço nem identificador interno
    # O portão lê o contrato; a passada lê a resposta. Os dois existem porque a
    # implementação pode devolver campo que o contrato não declara, e portão que
    # só procura o que o documento diz nunca vê o que a resposta entrega a mais.

  Esquema do Cenário: Os seis cabeçalhos da rota pública, na resposta real
    Dado a página pública da tag
    Quando ela é servida em homologação
    Então a resposta deve trazer "<cabecalho>"

    Exemplos:
      | cabecalho                        |
      | X-Robots-Tag: noindex            |
      | Referrer-Policy: no-referrer     |
      | Cache-Control: no-store          |
      | Content-Security-Policy          |
      | X-Content-Type-Options: nosniff  |
      | og: genérico                     |
    # Três destes seis não estão declarados em lugar nenhum do contrato, e por
    # isso o portão os cobra e reprova. A leitura da resposta real é o único
    # lugar onde eles podem ser confirmados enquanto o contrato não os declarar.
