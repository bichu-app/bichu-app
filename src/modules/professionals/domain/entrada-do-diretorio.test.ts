/**
 * A projecao da entrada e a derivacao do selo, sem banco e sem servidor.
 *
 * ## As iscas deste arquivo, e como cada uma foi provada
 *
 * Cada linha foi desligada no codigo de producao, a mudanca foi conferida no
 * disco (`git diff --stat` nao vazio), a suite rodou e reprovou, e o arquivo foi
 * restaurado. 22/09/2026, Node 22 (`/opt/homebrew/opt/node@22`).
 *
 * | o que foi desligado | `fail` |
 * |---|---|
 * | `nivelDerivado` deixando de filtrar por `decision === 'approved'` | 3 |
 * | `phone_callback` entrando em `EVIDENCIAS_DE_DOCUMENTO` | 2 |
 * | `distanciaNaGrade` com `Math.round` puro, sem o piso de uma celula | 1 |
 * | `distanciaNaGrade` devolvendo `0` no lugar de `null` | 1 |
 * | `projetarEntrada` acrescentando `id` a saida | 1 |
 */
import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import {
  distanciaNaGrade,
  GRADE_EM_METROS,
  projetarEntrada,
  type EntradaDoDiretorio,
  urlDaDerivada,
} from './entrada-do-diretorio.js';
import {
  evidenciasAprovadas,
  nivelDerivado,
  type VerificacaoDaEntidade,
} from './nivel-de-verificacao.js';

/** A montagem de URL de midia, pela porta. Nenhum caso deste arquivo tem imagem. */
const URL_DE_MIDIA = (chave: string): string => `https://img.bichu.test/${chave}`;

function entrada(ajustes: Partial<EntradaDoDiretorio> = {}): EntradaDoDiretorio {
  return {
    slug: 'clinica-veterinaria-santa-barbara',
    kind: 'clinic',
    displayName: 'Clínica Veterinária Santa Bárbara',
    about: 'Pronto atendimento 24 horas.',
    city: 'São Paulo',
    state: 'SP',
    neighborhood: 'Pinheiros',
    phoneE164: '+551130612200',
    verificacoes: [],
    distanciaEmMetros: null,
    logoPublicKey: null,
    ...ajustes,
  };
}

const aprovada = (evidenceKind: VerificacaoDaEntidade['evidenceKind']): VerificacaoDaEntidade => ({
  evidenceKind,
  decision: 'approved',
});
const pendente = (evidenceKind: VerificacaoDaEntidade['evidenceKind']): VerificacaoDaEntidade => ({
  evidenceKind,
  decision: 'pending',
});
const recusada = (evidenceKind: VerificacaoDaEntidade['evidenceKind']): VerificacaoDaEntidade => ({
  evidenceKind,
  decision: 'rejected',
});

void describe('o nivel de verificacao e DERIVADO, e so prova aprovada conta', () => {
  void it('sem verificacao nenhuma, none -- que e estado publicavel', () => {
    assert.equal(nivelDerivado([]), 'none');
  });

  void it('CRMV, CNPJ e documento aprovados dao document_verified', () => {
    assert.equal(nivelDerivado([aprovada('crmv')]), 'document_verified');
    assert.equal(nivelDerivado([aprovada('cnpj')]), 'document_verified');
    assert.equal(nivelDerivado([aprovada('document')]), 'document_verified');
  });

  void it('retorno de telefone prova CONTATO, e nao identidade', () => {
    assert.equal(
      nivelDerivado([aprovada('phone_callback')]),
      'contact_verified',
      'ISCA: com `phone_callback` em EVIDENCIAS_DE_DOCUMENTO, atender ao ' +
        'telefone passaria a valer por documento conferido.',
    );
  });

  void it('PENDENTE nao conta: pedir verificacao nao e ser verificado', () => {
    assert.equal(nivelDerivado([pendente('crmv')]), 'none');
    assert.equal(
      nivelDerivado([aprovada('phone_callback'), pendente('document')]),
      'contact_verified',
      'a prova pendente ao lado de uma aprovada nao pode levantar o nivel.',
    );
  });

  void it('RECUSADA nao conta: um "nao" ja dado nao vira selo', () => {
    assert.equal(nivelDerivado([recusada('cnpj')]), 'none');
    assert.equal(nivelDerivado([recusada('document'), aprovada('phone_callback')]), 'contact_verified');
  });

  void it('a prova mais forte vence, na ordem em que ela chegar', () => {
    assert.equal(nivelDerivado([aprovada('phone_callback'), aprovada('crmv')]), 'document_verified');
    assert.equal(nivelDerivado([aprovada('crmv'), aprovada('phone_callback')]), 'document_verified');
  });

  void it('as evidencias saem sem repeticao, em ordem de forca, e vazias em none', () => {
    assert.deepEqual(
      evidenciasAprovadas([aprovada('phone_callback'), aprovada('cnpj'), aprovada('cnpj')]),
      ['cnpj', 'phone_callback'],
    );
    assert.deepEqual(evidenciasAprovadas([pendente('crmv')]), []);
  });

  void it('o selo e a lista de provas sao coerentes por construcao', () => {
    const verificacoes = [aprovada('crmv'), pendente('cnpj')];
    assert.equal(nivelDerivado(verificacoes), 'document_verified');
    assert.deepEqual(
      evidenciasAprovadas(verificacoes),
      ['crmv'],
      'dizer "verificado" sem dizer O QUE foi verificado e o que o ADR-0011 proibe.',
    );
  });
});

void describe('a distancia sai na grade de 100 m, e nunca mente', () => {
  void it('sem medicao, nulo -- e nulo e um resultado', () => {
    assert.equal(
      distanciaNaGrade(null),
      null,
      'ISCA: devolver 0 aqui poria "0 m" no cartao de quem nao foi medido.',
    );
  });

  void it('arredonda para a grade em que o proprio ponto foi quantizado', () => {
    assert.equal(distanciaNaGrade(1234), 1200);
    assert.equal(distanciaNaGrade(1250), 1300);
    assert.equal(distanciaNaGrade(4980), 5000);
  });

  void it('quem esta pertissimo nao vira zero: o piso e uma celula', () => {
    assert.equal(
      distanciaNaGrade(12),
      GRADE_EM_METROS,
      'ISCA: com `Math.round` puro, 12 m viram 0 -- e "0 m" numa lista le-se ' +
        '"esta aqui dentro", sobre um ponto que ja foi arredondado a 100 m.',
    );
    assert.equal(distanciaNaGrade(0), GRADE_EM_METROS);
  });

  void it('valor nao finito e tratado como ausencia, e nao propagado', () => {
    assert.equal(distanciaNaGrade(Number.NaN), null);
    assert.equal(distanciaNaGrade(Number.POSITIVE_INFINITY), null);
  });
});

void describe('a projecao publica da entrada', () => {
  void it('devolve onze campos, e nenhum a mais', () => {
    const projetada = projetarEntrada(entrada({ verificacoes: [aprovada('crmv')] }), URL_DE_MIDIA);
    // Eram dez ate 18/10/2026; `logo_url` entrou com a liberacao das imagens do
    // profissional no aplicativo. **`photo_url` NAO esta aqui, e e o ponto desta
    // lista fechada**: a faixa de 1280 x 720 pertence a pagina do local, e esta
    // projecao e a que a LISTAGEM usa. Quem a acrescentar aqui reprova.
    assert.deepEqual(Object.keys(projetada).sort(), [
      'about',
      'city',
      'display_name',
      'distance_m',
      'kind',
      'logo_url',
      'neighborhood',
      'phone_e164',
      'slug',
      'state',
      'verification',
    ]);
  });

  // -----------------------------------------------------------------------
  // AS DUAS ISCAS DA LIBERACAO DAS IMAGENS NO APLICATIVO (18/10/2026)
  // -----------------------------------------------------------------------

  void it('ISCA: o ORIGINAL nao vaza para a resposta de leitura, em nenhuma categoria', () => {
    // A chave do original tem a forma `{categoria}/original/{128 bits}` e mora
    // no balde PRIVADO. Se ela chegasse a esta projecao, o aplicativo receberia
    // ou um 403 na tela ou -- no dia em que alguem afrouxasse a politica do
    // balde -- a foto COM EXIF, com a coordenada de onde ela foi tirada.
    //
    // `urlDaDerivada` recusa pela FORMA, e nao por confianca em quem chama: o
    // tipo `string | null` nao distingue chave de original de chave de derivada,
    // e a consulta e uma linha de SQL de distancia de um `JOIN` errado.
    for (const original of [
      'directory/original/KioqKioqKioqKioqKioqKg',
      'people/original/KioqKioqKioqKioqKioqKg',
      'pets/original/KioqKioqKioqKioqKioqKg',
      'products/original/KioqKioqKioqKioqKioqKg',
      'found-reports/abc/original/KioqKioqKioqKioqKioqKg',
      'found-reports/abc/sanitized/KioqKioqKioqKioqKioqKg.jpeg',
    ]) {
      assert.equal(urlDaDerivada(original, URL_DE_MIDIA), null, original);
      assert.equal(
        projetarEntrada(entrada({ logoPublicKey: original }), URL_DE_MIDIA).logo_url,
        null,
        original,
      );
    }

    // CONTRAPESO: a chave de DERIVADA produz a URL. Sem ele, as recusas acima
    // passariam para uma projecao que nunca devolve imagem nenhuma -- e um
    // recurso que nao mostra logo tambem "nao vaza o original".
    assert.equal(
      projetarEntrada(
        entrada({ logoPublicKey: 'directory/card/KioqKioqKioqKioqKioqKg.jpeg' }),
        URL_DE_MIDIA,
      ).logo_url,
      'https://img.bichu.test/directory/card/KioqKioqKioqKioqKioqKg.jpeg',
    );
  });

  void it('ISCA: entrada SEM logo nao quebra a listagem -- o cartao sai sem imagem', () => {
    // O modo de falhar que esta isca existe para impedir e o pior de todos nesta
    // tela: uma entrada sem logo derrubando a PAGINA inteira, e a pessoa que
    // procura um veterinario perto vendo lista vazia por causa de um campo
    // opcional. Nulo tem de atravessar a projecao sem erro.
    const semLogo = projetarEntrada(entrada({ logoPublicKey: null }), URL_DE_MIDIA);
    assert.equal(semLogo.logo_url, null);
    // O resto do cartao continua inteiro: nome, atividade e endereco publico.
    assert.equal(semLogo.display_name, entrada().displayName);
    assert.ok(semLogo.slug.length > 0);
    assert.equal(semLogo.verification.level, 'none');

    // E uma pagina MISTA -- algumas com logo, outras sem -- projeta inteira, na
    // ordem, sem buraco: e assim que a listagem real chega.
    const pagina = [
      entrada({ logoPublicKey: 'directory/card/AAAAAAAAAAAAAAAAAAAAAA.jpeg' }),
      entrada({ logoPublicKey: null }),
      entrada({ logoPublicKey: 'directory/thumb/BBBBBBBBBBBBBBBBBBBBBB.jpeg' }),
    ].map((e) => projetarEntrada(e, URL_DE_MIDIA));
    assert.equal(pagina.length, 3);
    assert.deepEqual(
      pagina.map((p) => p.logo_url === null),
      [false, true, false],
    );
  });

  void it('NAO devolve identificador interno: o endereco e o slug (ADR-0010)', () => {
    const bruto = JSON.stringify(projetarEntrada(entrada(), URL_DE_MIDIA));
    // Os nomes das colunas de vinculo NAO sao escritos aqui de proposito: o
    // portao de saida procura o literal em todo `src/`, e escreve-lo num teste
    // reprovaria o build. O que este caso afirma e mais forte que o nome: a
    // projecao nao carrega identificador nenhum, entao nao ha como um deles
    // entrar sem que a primeira asserção acuse.
    assert.equal(
      /[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/i.test(bruto),
      false,
      'nenhum UUID na projecao: nem o da entrada, nem o de conta nenhuma.',
    );
    for (const proibido of ['"id"', 'user_id', 'geo', '"lat"', '"lon"']) {
      assert.equal(
        bruto.includes(proibido),
        false,
        `ISCA: ${proibido} apareceu na projecao. O portao de contrato so procura ` +
          'o que SUMIU da resposta; propriedade a mais passa por ele.',
      );
    }
  });

  void it('o selo sai derivado das provas, e nao copiado de um campo', () => {
    assert.deepEqual(projetarEntrada(entrada({ verificacoes: [aprovada('cnpj')] }), URL_DE_MIDIA).verification, {
      level: 'document_verified',
      evidence_kinds: ['cnpj'],
    });
    assert.deepEqual(projetarEntrada(entrada(), URL_DE_MIDIA).verification, {
      level: 'none',
      evidence_kinds: [],
    });
  });

  void it('leva a distancia ja na grade, e o nulo intacto', () => {
    assert.equal(projetarEntrada(entrada({ distanciaEmMetros: 2740 }), URL_DE_MIDIA).distance_m, 2700);
    assert.equal(projetarEntrada(entrada({ distanciaEmMetros: null }), URL_DE_MIDIA).distance_m, null);
  });

  void it('cidade, UF e bairro saem como texto, e nao viram rotulo unico', () => {
    // A listagem de perdidos junta em "Bairro, Cidade" porque a tela dela e
    // outra. Aqui os tres saem separados de proposito: a folha de filtros do
    // diretorio precisa compara-los, e um rotulo unico obrigaria a tela a
    // desmonta-lo de volta.
    const projetada = projetarEntrada(entrada(), URL_DE_MIDIA);
    assert.equal(projetada.city, 'São Paulo');
    assert.equal(projetada.state, 'SP');
    assert.equal(projetada.neighborhood, 'Pinheiros');
  });

  void it('entrada sem lugar nenhum projeta nulos, e nao texto vazio', () => {
    const projetada = projetarEntrada(entrada({ city: null, state: null, neighborhood: null }), URL_DE_MIDIA);
    assert.equal(projetada.city, null);
    assert.equal(projetada.neighborhood, null);
  });
});
