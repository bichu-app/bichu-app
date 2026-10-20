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
