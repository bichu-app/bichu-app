// Cabecalho das paginas de Termos e Privacidade. O corpo vem dos rascunhos em
// conteudo/juridico/*.md, copiados de .jarvis/juridico-rascunho-*.md (v0.3).
// As duas paginas sobem com noindex e com o aviso de rascunho visivel ate o
// cliente e o juridico aprovarem o texto: isso e pre-requisito de producao.
//
// A VERSAO NAO E ESCRITA AQUI, E ISSO NAO E ENFEITE
// ==================================================
//
// Ate 01/11/2026 este arquivo trazia a versao como PROSA solta
// (`'Versão 0.3 de 23/09/2026. ...'`) e o comando de build do aplicativo
// trazia a sua propria copia, tambem solta
// (`TERMS_VERSION=2026-09-17`, em `infra/verificacao/verificar-apk.sh:76`).
// Dois literais, dois lugares, mantidos por coincidencia -- e eles ja tinham
// divergido: **17/09 contra 23/09**.
//
// A consequencia nao e cosmetica. O valor do aplicativo vai para
// `users.accepted_terms_version` (migracao `20260917000001`, contrato
// `accepted_terms_version` em api/openapi.yaml), entao o consentimento gravado
// no banco apontava para uma versao que NUNCA esteve no ar: `2026-09-17` e a
// data em que os ADR-0001..0013 foram escritos, e nao a de nenhum texto legal
// publicado. O rascunho v0.3, de 23/09/2026, e o unico texto que existe.
//
// MEDIDO em 01/11/2026 no APK de homologacao `bichu-hml-d03d1a6c-31-10.apk`:
// a cadeia `2026-09-17` aparece 1x em cada um dos tres `lib/<abi>/libapp.so`,
// com a string de controle `hml.bichu.app` presente (1x) e o NOME da chave
// `TERMS_VERSION` ausente (0x, porque `String.fromEnvironment` e dobrado em
// constante). Ou seja: o defeito estava dentro de um binario ja distribuido, e
// nao so no texto do script.
//
// O CONSERTO: a identidade da versao mora em `versao-legal.json`, e os dois
// lados a LEEM. O site renderiza a prosa a partir dela (abaixo); o comando de
// build do aplicativo tira dela o `--dart-define=TERMS_VERSION`. O portao
// `infra/verificacao/verificar-versao-dos-termos.mjs` reprova quando as duas
// pontas divergem, nomeando as duas.
//
// POR QUE A FONTE E O SITE, E NAO O APLICATIVO
// =============================================
//
// O aplicativo nao carrega copia do texto legal: ele MANDA o usuario ler no
// site -- `TERMS_URL=https://bichu.app/termos` e
// `PRIVACY_URL=https://bichu.app/privacidade`, no mesmo comando de build. Quem
// publica o texto que o usuario aceita e o site; logo, a versao e identidade do
// que o site publica, e o aplicativo e um CONSUMIDOR dela. Fonte no aplicativo
// permitiria registrar aceite de uma versao que o site nunca publicou -- que e
// exatamente o defeito que acabou de ser consertado.
//
// O QUE NAO SE DECIDE AQUI: o texto, o aviso de rascunho e qual versao o
// juridico vai aprovar. O texto e rascunho PENDENTE DE REVISAO JURIDICA, e isso
// e decisao do cliente com o advogado dele.
import VERSAO_LEGAL from './versao-legal.json' with { type: 'json' };

// `AAAA-MM-DD` cru, porque e a forma que vai para `accepted_terms_version` (o
// contrato a declara `maxLength: 20`) e a que o `--dart-define` carrega.
const PUBLICADA_EM = VERSAO_LEGAL.publicadaEm;

// LANCA, e nao conserta nem adivinha. Data em forma errada aqui significaria
// publicar um aviso com data quebrada e gravar aceite com valor quebrado; as
// duas coisas em silencio. Falhar o build do site e barato, e e o lado certo.
if (!/^\d{4}-\d{2}-\d{2}$/.test(PUBLICADA_EM)) {
  throw new Error(
    `versao-legal.json: publicadaEm='${PUBLICADA_EM}' nao esta em AAAA-MM-DD. ` +
      'Esse valor vai para `users.accepted_terms_version` e para o aviso das ' +
      'paginas legais: em forma errada, o aceite fica gravado apontando para nada.',
  );
}
if (VERSAO_LEGAL.rotulo.length === 0) {
  throw new Error(
    'versao-legal.json: `rotulo` vazio. O aviso publicado diria "Versão  de ...", ' +
      'e a versao do texto legal ficaria sem nome na pagina que o usuario aceita.',
  );
}

// `slice` e nao desestruturacao de `exec`: com `noUncheckedIndexedAccess` os
// grupos vem `string | undefined`, e um `undefined` interpolado publicaria
// "undefined/09/2026" sem reclamar de nada.
const DATA_PUBLICADA = `${PUBLICADA_EM.slice(8, 10)}/${PUBLICADA_EM.slice(5, 7)}/${PUBLICADA_EM.slice(0, 4)}`;

export const LEGAL = {
  aviso: 'Rascunho — pendente de revisão jurídica',
  versao: `Versão ${VERSAO_LEGAL.rotulo} de ${DATA_PUBLICADA}. O texto pode mudar antes da versão final.`,
  // A MESMA cadeia que o aplicativo grava no aceite. Exportada para que o
  // portao leia o valor pela porta da frente -- pelo modulo que o site
  // realmente publica -- em vez de reconhecer a prosa por expressao regular.
  versaoRegistrada: PUBLICADA_EM,
  termos: {
    titulo: 'Termos de Uso do Bichu',
    tituloDaPagina: 'Termos de uso',
    descricao: 'Termos de uso do Bichu, em rascunho.',
  },
  privacidade: {
    titulo: 'Política de Privacidade do Bichu',
    tituloDaPagina: 'Política de privacidade',
    descricao: 'Política de privacidade do Bichu, em rascunho.',
  },
};
