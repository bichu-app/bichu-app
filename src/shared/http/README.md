# `shared/http/`

Middleware de borda, formato de erro, identificador de correlação e limite de
chamadas. Nada daqui conhece domínio.

## Defesa em profundidade, que é a regra que mais se esquece

O serviço **não confia** que a borda já validou. Limite por código de tag, limite
por conta e validação de token acontecem também aqui dentro, porque basta um job,
uma rota interna nova ou um endpoint publicado por engano para a borda ser
contornada — e aí o limite vira decoração (ADR-0001).

Essa duplicação, que em outro desenho seria desperdício, é o que torna a borda
substituível: hoje é um proxy em container, amanhã pode ser o gateway do
provedor, e nada do que protege o produto depende dessa troca.

## `route-definition.ts`

É onde uma regra normativa virou erro de compilação: rota com efeito declarado e
sem teto **não compila**. Ver o cabeçalho do arquivo.
