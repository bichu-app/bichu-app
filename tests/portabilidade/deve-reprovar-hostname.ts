// ISCA. Este arquivo EXISTE PARA SER REPROVADO pelo portao de portabilidade.
// Hostname escrito a mao faz a troca de dominio deixar de ser uma variavel.
// Nao corrija este arquivo. Ver docs/07-devops.md 3.6 e 3.9.
//
// Uma linha por regra de REGRAS_HOSTNAME, cada uma dizendo qual regra ela
// acorda em `// isca: <motivo>`. O autoteste cobra o par nos dois sentidos:
// regra sem linha anotada reprova, e linha anotada sem regra que a case reprova
// tambem -- e esse segundo sentido e o que pega a regra APAGADA, que nao esta
// mais na lista para ser cobrada por ela mesma.
export const linkDoCartaz = (codigo: string) => `https://bichu.com.br/t/${codigo}`; // isca: host literal em URL absoluta
export const apiLocal = "http://192.168.0.10:3000"; // isca: literal de IP privado

// As tres regras que ainda nao tinham linha nesta isca. As duas de cima
// cobriam o arquivo inteiro sozinhas enquanto o autoteste exigia so um achado,
// e estas tres podiam ser apagadas do portao em silencio.
export const apiNoLaptop = "http://localhost:3000/v1/pets"; // isca: literal `localhost`
export const bancoNoLoopback = "http://127.0.0.1:5432"; // isca: literal 127.0.0.1
export const bindDeDesenvolvimento = "http://0.0.0.0:8080"; // isca: literal 0.0.0.0

// A DISPENSA DE COMENTARIO, e a testemunha dela.
//
// Comentario nao e codigo: nao e compilado, nao vai ao navegador e nao decide
// host nenhum em tempo de execucao -- o mesmo argumento com que
// SUFIXOS_DE_TESTE ja tira o teste da varredura. Em 20/10/2026 este portao
// reprovava a `development` por cinco achados, QUATRO deles prosa, e como ele
// e o primeiro job da esteira todo o resto ficava `skipped`: a esteira parou
// de avaliar mudanca nenhuma, em PR nenhum.
//
// A anotacao vai no FIM da linha, depois de `//`, e diz
// `dispensa-de-comentario` seguido de dois-pontos e o motivo. Escrita aqui sem
// os dois-pontos de proposito: com eles, esta explicacao entraria como
// dispensa de um motivo que nunca existiu.
//
// O autoteste cobra os DOIS lados, e nenhum deles sozinho prova nada: o texto
// CRU da linha tem de reprovar (senao a testemunha e vazia e sobreviveria a
// uma dispensa quebrada) e a linha MEDIDA nao pode (senao a dispensa nao
// existe). As linhas de `isca` acima continuam provando o outro sentido --
// host em CODIGO reprova, e e para isso que o portao existe.
// Medido contra a homologacao: a derivada da grade saiu em `https://img-hml.bichu.app/people/thumb/x.jpeg`. // dispensa-de-comentario: host literal em URL absoluta
// E a dispensa nao e so da regra generica: `http://localhost:3000` em prosa tambem e prosa. // dispensa-de-comentario: literal `localhost`
