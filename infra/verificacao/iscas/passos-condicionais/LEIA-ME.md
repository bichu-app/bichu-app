# Iscas do portão de passos condicionais

Cada arquivo aqui é um workflow **falso**, que existe para ser julgado por
`infra/verificacao/verificar_passos_condicionais.py --autoteste`. Nenhum deles
está em `.github/workflows/` e nenhum deles roda.

**Um arquivo isola uma regra.** Isca que reprova por dois motivos ao mesmo tempo
deixa o autoteste verde no dia em que a regra que ela existia para testar for
desligada: o segundo motivo continua reprovando e ninguém percebe. Ao
acrescentar uma isca, confira que ela reprova pelo motivo **certo** — a saída do
autoteste imprime o motivo.
