// ISCA NEGATIVA, em Dart. Este arquivo EXISTE PARA **NAO** SER REPROVADO pelo
// portao de portabilidade. Nao "corrija" apagando os enderecos: sao eles que o
// provam. Ver `nao-deve-reprovar-comentario.ts`, que faz o mesmo em TypeScript.
//
// Ele existe em Dart, e nao so em TypeScript, porque `app/lib/` e a maior
// superficie varrida e o apagador de comentario tem um dialeto PROPRIO para
// Dart (aspa tripla, sem literal de template). Tres dos sete falsos positivos
// medidos em 20/10/2026 eram comentarios `///` de arquivos deste diretorio.
//
// Este arquivo nao e analisado pelo Dart: ele mora fora de `app/`, que e onde
// vive o `pubspec.yaml`. E massa de teste do portao, e so.

/// O endereco completo e `https://img-hml.bichu.app/events/card/<chave>.jpeg`, // nao-isca: host literal em URL absoluta
/// e a chave que o app guarda e relativa -- este comentario explica a FORMA.
// Em `https://hml.bichu.app` o contador do sino conta por conversa. // nao-isca: host literal em URL absoluta
// Contra o emulador o alvo e `http://10.0.2.2:3000`. // nao-isca: literal de IP privado
// Em desenvolvimento a API responde em `http://localhost:3000`. // nao-isca: literal `localhost`

const prosaNaoAmarra = true;

// A outra metade -- host em CODIGO reprova -- e cobrada em
// `deve-reprovar-hostname.ts` e, para o apagador de cada dialeto, pela tabela
// CASOS_DO_APAGADOR do proprio portao, que confere que uma URL dentro de string
// SOBREVIVE ao apagador. Esse e o defeito grave: comentario de pe so faz
// barulho, mas codigo comido cega o portao em silencio.
