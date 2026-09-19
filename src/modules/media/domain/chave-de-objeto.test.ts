/**
 * O que se prova aqui é a **ausência** de identificador interno na chave
 * pública, e não o formato dela.
 *
 * O caso central é negativo porque o erro que ele pega é silencioso: uma chave
 * pública com `pets/{petId}/` funcionaria perfeitamente, passaria em qualquer
 * teste de "a foto aparece", e entregaria o `pet_id` a quem clicasse com o botão
 * direito na imagem de um cartaz.
 */
import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { posix } from 'node:path';
import {
  TETO_DE_BYTES,
  chaveDaDerivada,
  chaveDoOriginal,
  comoObjectKey,
  ehTipoAceito,
  ehTipoDeDerivada,
} from './chave-de-objeto.js';

const PET = '01a0b47d-ae11-7d5b-9b58-d77530774256';
const FOTO = '01a0b480-0000-7000-8000-000000000001';

void describe('chave da derivada pública', () => {
  void it('NÃO carrega pet_id, foto_id nem user_id', () => {
    const chave = chaveDaDerivada('card', new Uint8Array(16).fill(7), 'webp');
    for (const interno of [PET, FOTO, 'pets/']) {
      assert.ok(!chave.includes(interno), `a chave pública vazou "${interno}": ${chave}`);
    }
  });

  void it('não é adivinhável: dois sorteios dão chaves diferentes', () => {
    const a = chaveDaDerivada('card', new Uint8Array([1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16]), 'webp');
    const b = chaveDaDerivada('card', new Uint8Array([16, 15, 14, 13, 12, 11, 10, 9, 8, 7, 6, 5, 4, 3, 2, 1]), 'webp');
    assert.notEqual(a, b);
  });

  void it('sobrevive a URL sem escape: base64url não tem +, / nem =', () => {
    // A chave viaja em cartaz impresso e em mensagem. Um `+` virando espaço no
    // meio do caminho quebraria a foto de um jeito que ninguém reproduz.
    //
    // A conferência olha só a PARTE SORTEADA: a barra que separa o prefixo é a
    // estrutura da chave, e é para estar ali. (Primeira versão deste teste
    // reprovava por causa dela, e o defeito era do teste.)
    const chave = chaveDaDerivada('thumb', new Uint8Array(16).fill(251), 'webp');
    const sorteada = chave.slice(chave.indexOf('/') + 1);
    assert.ok(!/[+=]/.test(sorteada), sorteada);
    assert.ok(!sorteada.includes('/'), sorteada);
  });

  void it('RECUSA aleatório curto — é ela que não tem assinatura protegendo', () => {
    // A ironia do BICHUS-134: a exigência existia só no original, que já está
    // atrás de URL assinada, e faltava justamente aqui. A chave da derivada é
    // pública e servida sem assinatura; não ser adivinhável é a proteção
    // inteira. Com 1 byte, a foto do pet fica a 256 tentativas de quem souber o
    // formato — e a foto é como a tutora reconhece o animal dela num achado.
    for (const curto of [0, 1, 8, 15]) {
      assert.throws(
        () => chaveDaDerivada('card', new Uint8Array(curto), 'webp'),
        /128 bits/,
        `aceitou ${curto} bytes de aleatório`,
      );
    }
  });

  void it('16 bytes continuam gerando chave — recusar tudo não é defesa', () => {
    // O contrapeso. Sem ele, uma implementação que recusasse todo aleatório
    // passaria no caso acima e pararia o processamento de toda foto.
    for (const variante of ['card', 'thumb'] as const) {
      const chave = chaveDaDerivada(variante, new Uint8Array(16).fill(5), 'webp');
      assert.ok(chave.startsWith(`${variante}/`), chave);
      // 16 bytes em base64url são 22 caracteres: a mesma conta do original.
      assert.equal(chave.slice(`${variante}/`.length, chave.indexOf('.')).length, 22);
    }
  });
});

void describe('chave do original', () => {
  void it('carrega o petId no prefixo e 128 bits de aleatório no nome', () => {
    const chave = chaveDoOriginal(PET, new Uint8Array(16).fill(9));
    assert.ok(chave.startsWith(`pets/${PET}/original/`), chave);
    assert.equal(chave.slice(`pets/${PET}/original/`.length).length, 22);
  });

  void it('RECUSA aleatório curto, em vez de gerar chave fraca em silêncio', () => {
    // Uma chave com menos entropia que o critério 21 exige passaria em todo
    // teste de "a foto sobe" e só apareceria para quem a explorasse.
    assert.throws(() => chaveDoOriginal(PET, new Uint8Array(8)), /128 bits/);
  });

  void it('NÃO deriva do identificador da intenção, que é enumerável', () => {
    // UUIDv7 tem carimbo de tempo no prefixo: quem conhece o petId e a janela
    // de tempo enumera as chaves. Foi o erro da primeira versão deste arquivo.
    const chave = chaveDoOriginal(PET, new Uint8Array(16).fill(3));
    assert.ok(!chave.includes(FOTO), chave);
  });
});

void describe('tipos aceitos', () => {
  void it('aceita os quatro do contrato', () => {
    for (const t of ['image/jpeg', 'image/png', 'image/heic', 'image/webp']) {
      assert.ok(ehTipoAceito(t), t);
    }
  });

  void it('RECUSA SVG, que é o vetor de XSS servido como imagem', () => {
    // SVG é um documento com script. Servido do domínio de mídia ele não alcança
    // a sessão, mas continua sendo página executável hospedada por nós.
    assert.ok(!ehTipoAceito('image/svg+xml'));
    assert.ok(!ehTipoAceito('text/html'));
    assert.ok(!ehTipoAceito('image/gif'));
  });

  void it('o teto é o do contrato', () => {
    assert.equal(TETO_DE_BYTES, 10_485_760);
  });
});

/**
 * A extensão da derivada, que é o campo que VIRA CAMINHO (BICHUS-133).
 *
 * O que se prova aqui não é a mensagem do erro: é que **nenhuma chave sai do
 * prefixo da variante**. A afirmação é sobre a chave e não sobre a exceção de
 * propósito — uma implementação que saneasse a extensão em silêncio também não
 * lançaria, e gravaria a foto num caminho que ninguém escreveu.
 */
const ALEATORIO = new Uint8Array(16).fill(42);

/** A chave, ou `null` quando a geração recusou. */
function chaveOuNada(variante: 'thumb' | 'card', extensao: string): string | null {
  try {
    return chaveDaDerivada(variante, ALEATORIO, extensao);
  } catch {
    return null;
  }
}

/**
 * O primeiro segmento DEPOIS de resolver `..`, que é onde o objeto grava de
 * verdade. Comparar o texto cru diria "começa com `card/`" para uma chave que
 * o armazenamento resolve para `publico/`.
 */
function prefixoEfetivo(chave: string): string {
  return posix.normalize(chave).split('/')[0] ?? '';
}

const EXTENSOES_HOSTIS = [
  // A do relato: escapa do prefixo da variante e do bucket privado para o
  // público, com a assinatura V4 calculada depois — gravação válida no lugar
  // errado, que o armazenamento não tem como recusar.
  'webp/../../../publico/card/x.webp',
  '../thumb/x.webp',
  'webp/x.webp',
  'webp/..',
  '.webp',
  '',
  // Caixa alta: a lista é por IGUALDADE, e `WEBP` não é `webp`. Extensão que
  // ninguém gera hoje não passa por ser parecida com uma que gera.
  'WEBP',
];

void describe('extensão da derivada', () => {
  void it('nenhuma extensão hostil produz chave fora do prefixo da variante', () => {
    for (const hostil of EXTENSOES_HOSTIS) {
      const chave = chaveOuNada('card', hostil);
      assert.ok(
        chave === null || prefixoEfetivo(chave) === 'card',
        `a chave escapou do prefixo da variante: ${String(chave)}`,
      );
      assert.equal(chave, null, `saneou em silêncio em vez de recusar: ${String(chave)}`);
    }
  });

  void it('RECUSA com a extensão no texto, para o defeito aparecer no log', () => {
    assert.throws(
      () => chaveDaDerivada('card', ALEATORIO, 'webp/../../../publico/card/x.webp'),
      /Extensão de derivada recusada/,
    );
  });

  void it('a extensão legítima continua passando — recusar tudo não é defesa', () => {
    // O contrapeso. Sem ele, uma implementação que recusasse toda extensão
    // passaria nos casos acima e quebraria o processamento inteiro em silêncio.
    for (const boa of ['webp', 'jpg', 'jpeg']) {
      const chave = chaveDaDerivada('card', ALEATORIO, boa);
      assert.equal(prefixoEfetivo(chave), 'card', chave);
      assert.ok(chave.endsWith(`.${boa}`), chave);
    }
    assert.equal(prefixoEfetivo(chaveDaDerivada('thumb', ALEATORIO, 'webp')), 'thumb');
  });
});

void describe('tipo da derivada — o que pode ser GRAVADO', () => {
  void it('aceita os dois que o worker produz', () => {
    // Contrapeso do lado da gravação: o caminho feliz precisa continuar existindo.
    assert.ok(ehTipoDeDerivada('image/webp'));
    assert.ok(ehTipoDeDerivada('image/jpeg'));
  });

  void it('RECUSA por igualdade, e o prefixo `image/` não é critério', () => {
    // `starts-with: image/` aceitaria `image/svg+xml`, que é documento com
    // script servido pelo domínio de mídia — o mesmo erro que o critério 22
    // proíbe na entrada.
    for (const ruim of ['image/svg+xml', 'text/html', 'image/', 'image/webp; charset=utf-8', 'IMAGE/WEBP']) {
      assert.ok(!ehTipoDeDerivada(ruim), ruim);
    }
  });

  void it('RECUSA image/heic, que entra mas nunca sai', () => {
    // Aceito no ENVIO e impossível como derivada: o worker reescreve tudo em
    // WebP. Gravar HEIC seria a lista da entrada vazando para a saída.
    assert.ok(ehTipoAceito('image/heic'));
    assert.ok(!ehTipoDeDerivada('image/heic'));
  });
});

/**
 * `comoObjectKey`, que é a única porta para a marca (BICHUS-134).
 *
 * O que se prova aqui não é a mensagem do erro: é que **nenhuma chave aceita
 * resolve para fora do lugar onde foi escrita**. A afirmação é sobre o caminho
 * efetivo e não sobre a exceção de propósito — uma implementação que
 * normalizasse `..` em silêncio também não lançaria, e leria a foto de um lugar
 * onde ninguém a gravou.
 */

/** A marca, ou `null` quando a conferência recusou. */
function chaveOuNulo(valor: string): string | null {
  try {
    return comoObjectKey(valor);
  } catch {
    return null;
  }
}

const ORIGINAL_BOA = `pets/${PET}/original/KioqKioqKioqKioqKioqKg`;
const DERIVADA_BOA = 'card/KioqKioqKioqKioqKioqKg.webp';

const CHAVES_HOSTIS = [
  // A travessia: o `pathname` da URL RESOLVE `..`, então esta chave lê de fora
  // do bucket, e não de `card/`. Conferido com o parser de URL do Node.
  'card/../../etc/senha',
  '../thumb/x.webp',
  'card/./x.webp',
  `pets/${PET}/original/..`,
  // Barra no começo, no fim e dobrada: segmento vazio é caminho que não é o que
  // está escrito.
  '/card/x.webp',
  'card/x.webp/',
  'card//x.webp',
  // Codificação percentual: `%2e%2e` é `..` depois que alguém decodifica. As
  // duas formas importam — a que a forma da chave já barra por ter segmento a
  // mais, e a que passaria por ela se o conjunto de caracteres não existisse.
  'card/%2e%2e/x.webp',
  'card/x%2e%2e.webp',
  // Espaço e acento viram `%XX` no `pathname`: a chave pedida deixa de ser a
  // chave gravada, e a política assinada compara por IGUALDADE.
  'card/x y.webp',
  'card/café.webp',
  // Barra invertida, que o parser de URL trata como separador de caminho.
  'card\\..\\x.webp',
  // Fora das duas formas que este sistema escreve.
  'publico/x.webp',
  'card/x.webp/extra',
  `pets/${PET}/x.webp`,
  'card/semextensao',
  'card/.webp',
  'card/x.',
  '',
];

void describe('comoObjectKey — a marca que agora exige forma', () => {
  void it('nenhuma chave aceita resolve para fora do que está escrito', () => {
    for (const hostil of CHAVES_HOSTIS) {
      const chave = chaveOuNulo(hostil);
      assert.ok(
        chave === null || posix.normalize(chave) === chave,
        `aceitou chave que o caminho resolve para outro lugar: ${String(chave)}`,
      );
      assert.equal(chave, null, `normalizou em silêncio em vez de recusar: ${String(chave)}`);
    }
  });

  void it('a travessia sai mesmo do bucket quando a URL é montada', () => {
    // O porquê do caso acima, em vez da afirmação abstrata: é isto que uma
    // linha corrompida no banco faria com a URL do objeto.
    const url = new URL('https://midia.invalid/bucket/');
    url.pathname = '/bucket/card/../../etc/senha';
    assert.equal(url.pathname, '/etc/senha');
    assert.equal(chaveOuNulo('card/../../etc/senha'), null);
  });

  void it('RECUSA com a chave no texto, para a linha ruim aparecer no log', () => {
    // Quem for diagnosticar precisa saber QUAL linha do banco está torta.
    assert.throws(() => comoObjectKey('card/../../etc/senha'), /Chave de objeto recusada/);
    assert.throws(() => comoObjectKey('card/../../etc/senha'), /etc\/senha/);
  });

  void it('as duas formas que já estão gravadas continuam passando', () => {
    // O contrapeso, e ele não é cerimônia: uma conferência que recusasse tudo
    // passaria em todos os casos acima e apagaria do aplicativo a foto de todo
    // pet — que é como a tutora reconhece o animal dela num achado.
    for (const boa of [ORIGINAL_BOA, DERIVADA_BOA, 'thumb/KioqKioqKioqKioqKioqKg.jpg']) {
      assert.equal(comoObjectKey(boa), boa);
    }
  });

  void it('não prende a leitura às regras de ESCRITA de hoje', () => {
    // Linha antiga não pode quebrar porque a regra de escrita mudou depois: a
    // chave é contrato (ADR-0007), e um cartaz colado num poste continua
    // apontando para a chave de ontem.
    //
    // `pets/{petId}/original/{uuid}` é a forma que a PRIMEIRA versão deste
    // arquivo gerava, antes de trocar para 128 bits sorteados.
    assert.equal(comoObjectKey(`pets/${PET}/original/${FOTO}`), `pets/${PET}/original/${FOTO}`);
    // Extensão fora de `EXTENSOES_DE_DERIVADA`: recusada na escrita desde o
    // BICHUS-133, e ainda assim legível se estiver gravada.
    assert.equal(comoObjectKey('card/abc.png'), 'card/abc.png');
  });

  void it('é a porta por onde a própria geração passa', () => {
    // Se a geração continuasse usando `as`, a marca teria duas portas e a
    // conferência valeria só para metade das chaves.
    assert.equal(chaveDaDerivada('card', ALEATORIO, 'webp'), comoObjectKey(String(chaveDaDerivada('card', ALEATORIO, 'webp'))));
    assert.throws(() => chaveDoOriginal('../outro', new Uint8Array(16)), /Chave de objeto recusada/);
  });
});
