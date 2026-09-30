/**
 * As chaves de objeto, e por que as duas classes têm formas diferentes.
 *
 * A chave **não é detalhe de armazenamento: é parte do contrato.** O ADR-0007
 * diz isso de forma explícita ao descrever a migração para outro provedor —
 * copiar os objetos sem preservar a chave quebra *todas* as URLs de foto já
 * compartilhadas em cartaz e em conversa mediada. Um cartaz impresso e colado num
 * poste continua apontando para a chave de hoje.
 *
 * ## Privada: 128 bits aleatórios também, e o critério 21 é explícito
 *
 * `pets/{petId}/original/{128 bits}`. A primeira versão deste arquivo usava o
 * UUIDv7 da intenção, e estava **errada**: UUIDv7 carrega carimbo de tempo no
 * prefixo e tem bem menos entropia que 128 bits — quem conhece o `petId` e a
 * janela de tempo enumera as chaves.
 *
 * O bucket privado não tem leitura anônima, então a chave adivinhável não abre
 * o objeto sozinha. Ela abre uma **escrita**: a política assinada restringe a
 * chave por igualdade, mas uma chave previsível é o que permite mirar o prefixo
 * de outro pet caso qualquer outra defesa ceda. O critério 21 fecha isso na
 * origem — e é pelo mesmo motivo que **nome de arquivo do cliente nunca é
 * aceito nem derivado**.
 *
 * ## Pública: 128 bits aleatórios, porque não há assinatura para protegê-la
 *
 * A derivada pública é servida pelo domínio de mídia com cache longo e **sem
 * assinatura** — assinar inviabilizaria o cache, que é o motivo de ela existir.
 * O que impede alguém de enumerar as fotos do produto é a chave não ser
 * adivinhável.
 *
 * `petId` e `fotoId` **não entram** na chave pública, e essa ausência é
 * deliberada: a chave viaja em cartaz, em mensagem e em página pública, e o
 * ADR-0010 item 6 proíbe identificador interno em superfície pública **sem
 * exceção**. Uma chave pública que carregasse `pets/{petId}/` entregaria o
 * `pet_id` a qualquer pessoa que clicasse com o botão direito na foto.
 */
import type { ObjectKey } from '../../../shared/types/brands.js';

/** Os únicos tipos aceitos. SVG não é aceito em nenhuma hipótese (ADR-0007). */
export const TIPOS_ACEITOS = ['image/jpeg', 'image/png', 'image/heic', 'image/webp'] as const;

export type TipoAceito = (typeof TIPOS_ACEITOS)[number];

export function ehTipoAceito(tipo: string): tipo is TipoAceito {
  return (TIPOS_ACEITOS as readonly string[]).includes(tipo);
}

export const TETO_DE_BYTES = 10 * 1024 * 1024;

/**
 * O que uma DERIVADA pode ser, e por que a lista não é a da entrada.
 *
 * `TIPOS_ACEITOS` é o que o tutor pode enviar; estas duas listas são o que o
 * worker pode gravar. Elas são separadas porque a derivada não é o arquivo que
 * chegou: o critério 14 manda reescrever a imagem em WebP com alternativa
 * JPEG, então HEIC entra e nunca sai. Gravar aceitando a lista da entrada
 * permitiria escrever um `image/heic` que derivada nenhuma produz — e a lista
 * larga é justamente o que não se percebe no dia em que ela deixa de valer.
 *
 * As duas andam juntas: extensão e tipo descrevem o mesmo arquivo, e mexer em
 * uma sem mexer na outra grava `.jpg` servido como `image/webp`.
 */
export const EXTENSOES_DE_DERIVADA = ['webp', 'jpg', 'jpeg'] as const;

export type ExtensaoDeDerivada = (typeof EXTENSOES_DE_DERIVADA)[number];

export function ehExtensaoDeDerivada(extensao: string): extensao is ExtensaoDeDerivada {
  return (EXTENSOES_DE_DERIVADA as readonly string[]).includes(extensao);
}

export const TIPOS_DE_DERIVADA = ['image/webp', 'image/jpeg'] as const;

export type TipoDeDerivada = (typeof TIPOS_DE_DERIVADA)[number];

/**
 * Por IGUALDADE, nunca por prefixo — o mesmo desenho do critério 22 na entrada.
 * `startsWith('image/')` aceitaria `image/svg+xml`, que é documento com script,
 * e o domínio de mídia é separado da origem do app exatamente para conter isso.
 */
export function ehTipoDeDerivada(tipo: string): tipo is TipoDeDerivada {
  return (TIPOS_DE_DERIVADA as readonly string[]).includes(tipo);
}

/**
 * O teto de tamanho da chave, que é o do armazenamento e não uma escolha nossa.
 * Uma chave acima disso não é chave: é linha corrompida chegando do banco.
 */
const LIMITE_DA_CHAVE = 1024;

/**
 * O conjunto de caracteres: os de base64url, mais a barra que separa segmentos e
 * o ponto da extensão. Nada além disso.
 *
 * A lista é fechada porque a chave vira `pathname` de URL, e é o parser de URL
 * que decide o que cada caractere significa lá dentro. Barra invertida vira
 * separador de caminho; `%` reabre a porta da codificação percentual; espaço,
 * acento e caractere de controle viram `%XX` e a chave gravada deixa de ser a
 * chave pedida. Nenhum desses aparece numa chave que este domínio escreve.
 */
const CARACTERES_DA_CHAVE = /^[A-Za-z0-9._/-]+$/;

function recusarChave(valor: string, motivo: string): never {
  throw new Error(`Chave de objeto recusada (${motivo}): ${JSON.stringify(valor)}.`);
}

/**
 * O ÚNICO caminho para a marca `ObjectKey`, e por que ela precisava de um.
 *
 * Antes daqui a marca era obtida por `as` — seis vezes no adaptador de
 * persistência, sobre texto vindo direto de `SELECT` (BICHUS-134). `as` não
 * valida nada: ele promete ao compilador que alguém já validou. Quando esse
 * alguém não existe, a marca é documentação falsa, e o texto do banco segue até
 * o `pathname` da URL do objeto.
 *
 * E o `pathname` RESOLVE `..`: uma chave `card/../../x` vira `/x` no próprio
 * parser de URL, fora do prefixo da variante e fora do bucket. É a mesma classe
 * do BICHUS-133, só que entrando pelo banco em vez de pela porta da imagem —
 * importação, migração ou correção manual em produção escrevem sem passar pelo
 * domínio.
 *
 * A conferência tem duas partes, e a separação é proposital:
 *
 * 1. **A forma segura de um caminho**: conjunto de caracteres fechado, sem
 *    segmento vazio, sem `.` e sem `..`. É esta parte que impede a travessia, e
 *    ela vale para qualquer chave que este sistema venha a ter.
 * 2. **A forma que este sistema escreve**: `pets/{petId}/original/{nome}` ou
 *    `{thumb|card}/{nome}.{extensão}`. Sem ela a marca aceitaria qualquer
 *    caminho bem-comportado, e voltaria a não valer nada.
 *
 * O que ela deliberadamente **não** exige: tamanho do nome sorteado, `petId` em
 * formato de UUID, extensão dentro de `EXTENSOES_DE_DERIVADA`. Essas são regras
 * de ESCRITA, e prendê-las aqui quebraria a leitura de linha antiga no dia em
 * que a regra de escrita mudasse — a chave é contrato (ADR-0007), e um cartaz
 * colado num poste continua apontando para a chave de ontem. Recusar a foto de
 * um pet porque a extensão saiu da lista depois seria apagar do aplicativo a
 * foto pela qual a tutora reconhece o animal dela num achado.
 *
 * Quando a forma nova aparecer (foto de aviso do achador, por exemplo), o que
 * falha é o teste, no dia de escrever o código — e não a leitura em produção.
 *
 * ## A DEPENDÊNCIA entre as duas partes, que é o que segura o arranjo
 *
 * A leitura é deliberadamente mais frouxa que a escrita, e isso só é seguro por
 * um motivo, que precisa estar escrito porque ninguém o deduz lendo a parte 2:
 *
 * > **A parte 2 pode ser frouxa PORQUE a parte 1 é fechada. A parte 1 não pode
 * > afrouxar porque a parte 2 já é frouxa.** A implicação vale numa direção só.
 *
 * O que impede a travessia é a parte 1 — conjunto de caracteres fechado,
 * nenhum segmento vazio, nenhum `.` e nenhum `..`. A parte 2 não é defesa: ela
 * é o formato de hoje, e existe para a marca não valer para qualquer caminho
 * bem-comportado. Se um dia a parte 2 precisar aceitar uma forma nova, ela
 * afrouxa e a parte 1 continua segurando. Se a parte 1 afrouxar, **não há mais
 * nada embaixo** — a parte 2 aceita `{thumb|card}/{nome}.{ext}` e um `nome`
 * como `..%2fx` ou `a/../../b` passaria a montar um caminho que sai do prefixo,
 * e daí para o `pathname` da URL é direto.
 *
 * Então: relaxar a parte 1 "porque a parte 2 já é frouxa" inverte o argumento e
 * abre exatamente o buraco do BICHUS-133 e do BICHUS-134. Se a parte 1 tiver
 * mesmo de mudar, a conferência inteira volta para a mesa — não é ajuste de
 * regex.
 */
export function comoObjectKey(valor: string): ObjectKey {
  if (valor.length === 0 || valor.length > LIMITE_DA_CHAVE) {
    recusarChave(valor, 'tamanho');
  }
  if (!CARACTERES_DA_CHAVE.test(valor)) {
    recusarChave(valor, 'caractere fora do conjunto da chave');
  }

  const segmentos = valor.split('/');
  // Segmento vazio cobre a barra no começo, no fim e a barra dupla; `.` e `..`
  // são a travessia propriamente dita. RECUSA e não normalização: normalizar
  // aqui devolveria uma chave diferente da que está gravada, e a foto passaria
  // a ser lida de um lugar onde ninguém a escreveu.
  //
  // ESTA CONFERÊNCIA E A DE CARACTERES ACIMA SÃO A PARTE 1. Nada abaixo delas
  // impede travessia — a forma (parte 2) é o formato de hoje, não uma defesa.
  // Afrouxar aqui "porque a parte 2 já é frouxa" inverte a dependência e abre o
  // buraco. Ver a seção sobre isso no comentário desta função.
  if (segmentos.some((s) => s === '' || s === '.' || s === '..')) {
    recusarChave(valor, 'segmento que atravessa o caminho');
  }

  if (segmentos.length === 4 && segmentos[0] === 'pets' && segmentos[2] === 'original') {
    return valor as ObjectKey;
  }

  // A FORMA NOVA que o comentário desta função antecipou ("foto de aviso do
  // achador, por exemplo"), e ela chegou como previsto: BICHUS-35, critério 9.
  //
  // Mesmo desenho do original do pet — prefixo do dono do objeto, `original/`,
  // e 128 bits de CSPRNG no nome. O prefixo separado de `pets/` não é
  // cosmético: é o que permite a uma política de bucket, a um ciclo de vida e a
  // uma varredura de expurgo tratarem os dois de formas diferentes, e o
  // ADR-0010 exige isso — a foto do achador some 30 dias depois do
  // encerramento, a do pet segue a vida do cadastro.
  if (segmentos.length === 4 && segmentos[0] === 'found-reports' && segmentos[2] === 'original') {
    return valor as ObjectKey;
  }

  // A imagem de catalogo do backoffice (ADR-0027 item 10, BICHUS-267). Sem
  // segmento de dono, porque ela nao tem dono: e conteudo do produto, nao de uma
  // pessoa. O prefixo proprio e o que deixa uma politica de bucket, um ciclo de
  // vida e o CORS do envio pelo navegador (ADR-0027 item 4: "so no prefixo do
  // catalogo") valerem para ela e para nada mais.
  if (segmentos.length === 3 && segmentos[0] === 'catalog' && segmentos[1] === 'original') {
    return valor as ObjectKey;
  }

  if (segmentos.length === 2 && (segmentos[0] === 'thumb' || segmentos[0] === 'card')) {
    const nome = segmentos[1] ?? '';
    const ponto = nome.lastIndexOf('.');
    // Nome e extensão os dois não vazios: `card/.webp` e `card/x.` não são
    // chaves que a geração produz.
    if (ponto > 0 && ponto < nome.length - 1) return valor as ObjectKey;
  }

  return recusarChave(valor, 'forma que este sistema não escreve');
}

/** 128 bits. O piso das DUAS chaves, e a mesma recusa ruidosa para as duas. */
const BYTES_DE_ALEATORIO = 16;

/**
 * O piso de entropia, exigido no mesmo lugar para as duas chaves.
 *
 * Estava só no original, e o original é o que **já está atrás de URL assinada**.
 * A que não tinha exigência era a da derivada — a pública, servida sem
 * assinatura, onde não ser adivinhável é a proteção inteira (BICHUS-134). Com 1
 * byte, a foto de um pet fica a 256 tentativas de quem souber o formato da
 * chave; e a foto é como a tutora reconhece o animal dela num achado.
 *
 * Falha ruidosa: uma chave com menos entropia que o critério exige passaria em
 * todo teste de "a foto sobe" e só seria descoberta por quem a explorasse.
 */
function exigirAleatorioForte(qualChave: string, aleatorio: Uint8Array): void {
  if (aleatorio.length < BYTES_DE_ALEATORIO) {
    throw new Error(
      `A chave ${qualChave} exige 128 bits (${BYTES_DE_ALEATORIO} bytes) de aleatório.`,
    );
  }
}

export function chaveDoOriginal(petId: string, aleatorio: Uint8Array): ObjectKey {
  exigirAleatorioForte('do original', aleatorio);
  // Passa pela mesma porta que a leitura do banco: a geração também é uma
  // entrada. `petId` chega como `string` e nunca foi conferido aqui — um `/`
  // dentro dele montaria uma chave com um segmento a mais, fora do prefixo do
  // pet, e ninguém veria.
  return comoObjectKey(`pets/${petId}/original/${Buffer.from(aleatorio).toString('base64url')}`);
}

/**
 * A chave da derivada pública, a partir de 16 bytes de CSPRNG.
 *
 * Trocar a foto gera chave nova e apaga a antiga — é assim que "trocar a foto"
 * se torna visível para quem já tinha o endereço antigo, em vez de o conteúdo
 * mudar debaixo de uma URL que alguém guardou.
 */
export function chaveDaDerivada(
  variante: 'thumb' | 'card',
  aleatorio: Uint8Array,
  extensao: string,
): ObjectKey {
  // A extensão vem do adaptador de imagem e é INTERPOLADA NO CAMINHO uma linha
  // abaixo. `webp/../../../publico/card/x.webp` não é extensão mal formatada: é
  // uma chave que sai do prefixo da variante e pode atravessar do bucket
  // privado para o público. O agravante é a ordem — a assinatura V4 é calculada
  // DEPOIS desta chave existir, então a gravação sairia assinada e válida para
  // o lugar errado, e o armazenamento não teria como recusar.
  //
  // RECUSA, e não saneamento: saneando em silêncio a foto vai parar num caminho
  // que ninguém escreveu, o log registra sucesso, e a chave gravada no banco
  // deixa de ser a chave que o adaptador pediu.
  if (!ehExtensaoDeDerivada(extensao)) {
    throw new Error(
      `Extensão de derivada recusada: ${JSON.stringify(extensao)}. ` +
        `As únicas aceitas são ${EXTENSOES_DE_DERIVADA.join(', ')}.`,
    );
  }
  // A exigência de entropia vem DEPOIS da extensão só porque a extensão é o
  // campo hostil; as duas recusam, e nenhuma saneia.
  exigirAleatorioForte('da derivada pública', aleatorio);
  const nome = Buffer.from(aleatorio).toString('base64url');
  return comoObjectKey(`${variante}/${nome}.${extensao}`);
}

/**
 * A chave da foto do aviso do achador (BICHUS-35, critério 9).
 *
 * `found-reports/{id}/original/{128 bits}`, no bucket **privado**. Ela nunca é
 * servida por rota pública e nunca ganha derivada pública: a foto é vista pelo
 * tutor dentro da conversa mediada, por URL assinada, e só.
 *
 * Separada de `chaveDoOriginal` e não um parâmetro a mais nela: um argumento
 * `prefixo: string` faria o lugar onde a foto do achador é gravada virar um
 * valor passado de fora, e a diferença entre o bucket do pet e o do achador é
 * regra de retenção, não configuração de chamada.
 */
export function chaveDaFotoDoAchado(foundReportId: string, aleatorio: Uint8Array): ObjectKey {
  exigirAleatorioForte('da foto do achado', aleatorio);
  // Mesma porta da leitura, pelo mesmo motivo: um `/` dentro do identificador
  // montaria uma chave com um segmento a mais, fora do prefixo do aviso.
  return comoObjectKey(
    `found-reports/${foundReportId}/original/${Buffer.from(aleatorio).toString('base64url')}`,
  );
}

/**
 * A chave do original de uma imagem de catalogo, no bucket PRIVADO.
 *
 * Mesmo piso de 128 bits das outras: o navegador do administrador envia direto
 * para esta chave, e ela nao pode ser adivinhavel por quem conhece o formato.
 */
export function chaveDoOriginalDeCatalogo(aleatorio: Uint8Array): ObjectKey {
  exigirAleatorioForte('do original de catalogo', aleatorio);
  return comoObjectKey(`catalog/original/${Buffer.from(aleatorio).toString('base64url')}`);
}

/**
 * A chave da foto de quem avisou SEM CONTA (BICHUS-41).
 *
 * `found-reports/sem-conta/original/{128 bits}`: a mesma forma de
 * `chaveDaFotoDoAchado`, com o segmento do aviso trocado por um rótulo fixo.
 * O motivo é que a chave SAI para o achador: a política de envio assinada
 * carrega `key` nos campos do formulário, e o envio por `PUT` a carrega no
 * caminho da URL. Com o id do aviso ali, o achador sem conta receberia um
 * UUIDv7 interno, que é o que o SEC-001 proíbe. O vínculo com o aviso fica em
 * `upload_intents.found_report_id`, do lado de dentro.
 */
export function chaveDaFotoDoAchadorSemConta(aleatorio: Uint8Array): ObjectKey {
  exigirAleatorioForte('da foto do achador sem conta', aleatorio);
  return comoObjectKey(
    `found-reports/sem-conta/original/${Buffer.from(aleatorio).toString('base64url')}`,
  );
}
