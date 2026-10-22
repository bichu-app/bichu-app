// ISCA NEGATIVA. Este arquivo EXISTE PARA **NAO** SER REPROVADO pelo portao de
// portabilidade. Se ele reprovar, o portao voltou a acusar PROSA.
// Nao "corrija" este arquivo apagando os enderecos: sao eles que o provam.
//
// O par dele e `deve-reprovar-hostname.ts`: la o host esta no CODIGO e TEM de
// reprovar; aqui o mesmo host esta em COMENTARIO e NAO pode. As duas metades
// juntas sao a regra inteira. Cada uma sozinha se satisfaz do jeito errado --
// so a positiva deixa passar um portao que acusa tudo, e so a negativa deixa
// passar um portao que nao acusa nada.
//
// Medido em 20/10/2026 na development: a familia hostname acusava tres
// comentarios de documentacao em Dart e um bloco de TypeScript que registra
// contra qual ambiente uma rota foi medida. Sete achados, nenhuma amarracao, e
// todo PR nascendo vermelho por heranca. Comentario nao amarra nada: EXPLICA.
//
// Cada linha marcada diz qual regra nao pode disparar nela, na forma
// `nao-isca:` seguida do motivo. O autoteste cobra os dois lados: a linha CRUA
// tem de conter o defeito (senao a isca prova silencio com silencio) e a linha
// sem comentario nao pode conter nada.

// A foto derivada vem de `https://img-hml.bichu.app/pets/thumb/<chave>.jpg`, e // nao-isca: host literal em URL absoluta
// o prefixo e do ambiente -- esta linha explica a FORMA, nao o endereco.
/// Doc de uma linha, a forma que o Dart usa: `https://hml.bichu.app/v1/pets`. // nao-isca: host literal em URL absoluta
// Em desenvolvimento a API responde em `http://localhost:3000`. // nao-isca: literal `localhost`

/**
 * Bloco de documentacao, que foi um dos quatro falsos positivos medidos:
 * a rota foi medida contra `https://hml.bichu.app` e respondia 404. // nao-isca: host literal em URL absoluta
 */
export const prosaNaoAmarra = true;

// O outro lado, que esta isca NAO cobre e nao deve cobrir: host em codigo. Ele
// e cobrado em `deve-reprovar-hostname.ts`, e a linha abaixo mostra por que os
// dois arquivos existem separados -- ela e codigo, e por isso nao mora aqui:
//   export const errado = "https://hml.bichu.app"; // isca: host literal em URL absoluta

// O OUTRO FALSO POSITIVO, E ELE NAO ERA COMENTARIO (21/10/2026). O texto de
// ajuda de um campo de formulario e PROSA, como um comentario, mas vive dentro
// de uma STRING: ele vai no pacote que chega ao navegador, e nenhum portao
// consegue distinguir essa string de uma URL que o codigo busca. Entao o
// conserto do achado do commit `e62064c6` NAO foi afrouxar o portao -- foi
// trocar o host de verdade pelo host de DOCUMENTACAO que o repositorio ja usava
// no mesmo campo do formulario irmao da Loja e no contrato: um nome sob o TLD
// `.test`, reservado pela RFC 6761 justamente para que exemplo nunca resolva
// para o site de alguem.
//
// A linha abaixo e CODIGO, com a mesma frase do campo "Site" do diretorio, e
// NAO pode dar achado nenhum. Ela e a metade "o falso positivo morreu"; a
// metade "o portao nao ficou cego" e a MESMA frase com um host de verdade, em
// `deve-reprovar-hostname.ts`, que tem de REPROVAR.
//
// A marca e `nao-isca-sem-host` (e nao `nao-isca`) porque aqui a afirmacao e a
// da regra nao casar DE JEITO NENHUM -- nem na linha crua: nao ha host que a
// regra conheca nesta linha, e nao e o fato de ser comentario que a salva.
// Mesma forma usada pelo literal de regex em `nao-deve-reprovar-comentario.sql`.
// Se alguem acrescentar `test` a lista de TLD da regra generica, esta linha
// fica vermelha -- que e exatamente o aviso que se quer.
export const ajudaDoCampoDeSite = "Opcional. O endereço completo, começando com https:// — por exemplo https://clinica.exemplo.test/contato."; // nao-isca-sem-host: host literal em URL absoluta
