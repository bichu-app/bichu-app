// ISCA. Este arquivo EXISTE PARA SER REPROVADO pelo portao de portabilidade.
// Se o portao passar com ele presente, o portao parou de enxergar.
// Nao corrija este arquivo. Nao o use como exemplo. Ver docs/07-devops.md 3.6.
//
// Cada linha tem UMA regra de REGRAS_PROVEDOR para acordar, e diz qual no
// comentario `// isca: <motivo>`. A anotacao nao e enfeite: ela e a testemunha
// independente da lista de regras. O autoteste confere o par nos dois sentidos,
// entao apagar uma regra do portao reprova aqui citando o motivo dela -- que e
// a coisa que a versao "pelo menos um achado por arquivo" deixava passar.
// Linha nova exige regra nova, e regra nova exige linha nova.

// Acrescentado pelo ADR-0022: o gerenciador de segredos e o primeiro servico
// gerenciado do runtime, e a regra que o confina precisa da propria isca.
export const segredoNoLugarErrado =
  "https://secretmanager.googleapis.com/v1/projects/p/secrets/s/versions/latest:access"; // isca: dominio de provedor (Secret Manager)

// ADR-0008: o FCM e o transporte do push, e o endereco dele nao e
// configuracao -- e provedor. Fora de `adapters/external/` ele precisa
// reprovar como AMARRACAO EM PROVEDOR, e nao como hostname a ser empurrado
// para uma variavel, que e o que a regra generica diria.
export const pushNoLugarErrado =
  "https://fcm.googleapis.com/v1/projects/projeto/messages:send"; // isca: dominio de provedor (FCM)

export const clienteErrado = {
  endpoint: "https://s3.us-east-1.amazonaws.com", // isca: dominio de provedor (AWS)
  region: "sa-east-1", // isca: literal de regiao
  bucket: "bichu-media-private", // isca: nome de bucket em codigo
};

// As quatro regras que ainda nao tinham linha nesta isca: GCS, Azure, R2 e o
// literal de regiao na forma longa do GCP. Enquanto o autoteste exigia so UM
// achado no arquivo, elas podiam ser apagadas do portao sem nada ficar
// vermelho -- as linhas acima continuavam casando com as outras regras.
export const armazenamentoErradoGcs =
  "https://storage.googleapis.com/bichu-media/pets/foto.jpg"; // isca: dominio de provedor (GCS)

export const armazenamentoErradoAzure =
  "https://bichumedia.blob.core.windows.net/media/pets/foto.jpg"; // isca: dominio de provedor (Azure)

export const armazenamentoErradoR2 =
  "https://a1b2c3d4.r2.cloudflarestorage.com/bichu-media/pets/foto.jpg"; // isca: dominio de provedor (R2)

// Esta linha e a de `region: "sa-east-1"` acima compartilham o motivo "literal
// de regiao": sao DUAS regras com o mesmo nome. Por isso a conferencia e por
// linha, e nao por motivo solto -- so assim apagar uma das duas reprova.
export const regiaoErradaNaFormaLonga = { region: "southamerica-east1" }; // isca: literal de regiao
