// ISCA. Este arquivo EXISTE PARA SER REPROVADO pelo portao de portabilidade.
// Se o portao passar com ele presente, o portao parou de enxergar.
// Nao corrija este arquivo. Nao o use como exemplo. Ver docs/07-devops.md 3.6.
// Acrescentado pelo ADR-0022: o gerenciador de segredos e o primeiro servico
// gerenciado do runtime, e a regra que o confina precisa da propria isca.
export const segredoNoLugarErrado =
  "https://secretmanager.googleapis.com/v1/projects/p/secrets/s/versions/latest:access";

// ADR-0008: o FCM e o transporte do push, e o endereco dele nao e
// configuracao -- e provedor. Fora de `adapters/external/` ele precisa
// reprovar como AMARRACAO EM PROVEDOR, e nao como hostname a ser empurrado
// para uma variavel, que e o que a regra generica diria.
export const pushNoLugarErrado =
  "https://fcm.googleapis.com/v1/projects/projeto/messages:send";

export const clienteErrado = {
  endpoint: "https://s3.us-east-1.amazonaws.com",
  region: "sa-east-1",
  bucket: "bichu-media-private",
};
