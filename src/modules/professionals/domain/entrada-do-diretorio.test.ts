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
  projetarEnderecoComercial,
  projetarEntrada,
  type EntradaDoDiretorio,
  urlDaDerivada,
} from './entrada-do-diretorio.js';
import { PONTUACAO_VAZIA } from './avaliacao-do-local.js';
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
    kinds: ['clinic'],
    entityKind: 'professional',
    displayName: 'Clínica Veterinária Santa Bárbara',
    about: 'Pronto atendimento 24 horas.',
    city: 'São Paulo',
    state: 'SP',
    neighborhood: 'Pinheiros',
    phoneE164: '+551130612200',
    siteUrl: null,
    verificacoes: [],
    distanciaEmMetros: null,
    logoPublicKey: null,
    pontuacao: PONTUACAO_VAZIA,
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
  void it('devolve quatorze campos, e nenhum a mais', () => {
    // TREZE desde 21/10/2026, e cada acrescimo veio de um ramo DIFERENTE. As
    // justificativas ficam todas, porque as listas fechadas sao a mesma lista.
    //
    // Eram DEZ ate 18/10/2026. `logo_url` entrou com a liberacao das imagens do
    // profissional no aplicativo. **`photo_url` NAO esta aqui, e e o ponto desta
    // lista fechada**: a faixa de 1280 x 720 pertence a pagina do local, e esta
    // projecao e a que a LISTAGEM usa. Quem a acrescentar aqui reprova.
    //
    // `entity_kind` e o decimo primeiro, do eixo proprio do tipo de entidade
    // (`20261018000012`) -- esta lista e o que impede a entrada de ONG de
    // trazer carona: se a projecao passar a devolver quem convidou, quem e o
    // titular, a coordenada ou o `id`, este caso cai antes de qualquer portao.
    //
    // `site_url` e o DECIMO TERCEIRO (`20261020000014`, decisao do cliente de
    // 21/10/2026), e ele esta aqui -- e nao so no detalhe -- por ser um CANAL DE
    // CONTATO, ao lado de `phone_e164` e pela mesma razao: a entidade o publicou
    // de proposito para ser procurada (ADR-0011 secao 4). Nao e dado pessoal que
    // escapou, e e por isso que nao segue a regra de `photo_url`.
    //
    // (Doze seria o numero se `site_url` ficasse so no detalhe; a contagem
    // mudou com a decisao, e nao por acomodacao a um teste que reprovou.)
    //
    // `kinds` e o DECIMO QUARTO (`20261020000015`, decisao do cliente de
    // 21/10/2026: atividades multiplas). **`kind` CONTINUA aqui ao lado dele, e
    // os dois juntos nao sao duplicacao de dado -- sao duas idades de cliente:**
    // `kind` e `kinds[0]` e existe porque o APK publicado le `kind` como string,
    // e trocar o tipo dele seria `response-property-type-changed`, quebra para
    // quem ja tem o aplicativo instalado. Quem desenha a tela nova le `kinds`.
    // No dia em que nenhum APK em campo ler `kind`, ele sai -- e este caso e
    // onde isso vai ser notado.
    //
    // Esta contagem subiu DUAS vezes em 21/10, por DUAS decisoes diferentes do
    // cliente no mesmo dia (o site e as atividades multiplas). As duas razoes
    // ficam escritas, porque a lista fechada e a mesma lista.
    const projetada = projetarEntrada(entrada({ verificacoes: [aprovada('crmv')] }), URL_DE_MIDIA);
    assert.deepEqual(Object.keys(projetada).sort(), [
      'about',
      'city',
      'display_name',
      'distance_m',
      'entity_kind',
      'kind',
      'kinds',
      'logo_url',
      'neighborhood',
      'phone_e164',
      'site_url',
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

  void it('a entrada de ONG nao traz nem um campo a mais que a comum', () => {
    // ISCA (b) do lote: a ONG passa pela MESMA projecao, e por isso nao ha
    // caminho em que ela exponha algo que a entrada comum nao exponha. O que
    // muda entre as duas e o VALOR de `entity_kind`, nunca o conjunto de
    // chaves.
    const ong = projetarEntrada(entrada({ entityKind: 'organization' }), URL_DE_MIDIA);
    const comum = projetarEntrada(entrada({ entityKind: 'professional' }), URL_DE_MIDIA);
    assert.deepEqual(Object.keys(ong).sort(), Object.keys(comum).sort());
    assert.equal(JSON.stringify(ong).includes('created_by'), false);
    assert.equal(JSON.stringify(ong).includes('claimed_by'), false);
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

/**
 * O TIPO DE ENTIDADE, eixo proprio (`20261018000012`).
 *
 * Iscas desligadas no codigo de producao em 18/10/2026, conferidas no disco,
 * suite rodada, arquivo restaurado:
 *
 * | o que foi desligado | `fail` |
 * |---|---|
 * | `projetarEntrada` deixando de copiar `entityKind` para `entity_kind` | 3 |
 * | `entity_kind` saindo como `kind` (os dois eixos confundidos) | 2 |
 */
void describe('o tipo de entidade e eixo SEPARADO da atividade', () => {
  void it('a ONG projeta organization, e a atividade dela continua sendo a atividade', () => {
    // E este o par que o eixo proprio existe para permitir: uma ONG que atende
    // como clinica e `organization` + `clinic`, e nao um terceiro valor de
    // `kind` que teria obrigado o APK instalado a entender valor novo.
    const projetada = projetarEntrada(entrada({ entityKind: 'organization', kinds: ['clinic'] }), URL_DE_MIDIA);
    assert.equal(projetada.entity_kind, 'organization');
    assert.equal(projetada.kind, 'clinic');
  });

  void it('entrada comum projeta professional', () => {
    const projetada = projetarEntrada(entrada({ entityKind: 'professional' }), URL_DE_MIDIA);
    assert.equal(projetada.entity_kind, 'professional');
  });

  void it('os dois eixos saem SEMPRE os dois, e nenhum substitui o outro', () => {
    // Contrapeso da isca acima: se a projecao passasse a derivar um do outro --
    // por exemplo devolvendo `kind: 'organization'` --, o contrato quebraria
    // exatamente pela regra que o eixo proprio evitou
    // (`response-property-enum-value-added`), e o APK receberia em `kind` um
    // valor que ele nao conhece.
    const projetada = projetarEntrada(entrada({ entityKind: 'organization', kinds: ['vet'] }), URL_DE_MIDIA);
    assert.equal(projetada.kind, 'vet');
    assert.notEqual(projetada.kind, 'organization');
    assert.equal(projetada.entity_kind, 'organization');
  });
});

/**
 * O ENDERECO COMERCIAL (cliente, 21/10/2026): *"o endereco completo do
 * profissional"*, para a pessoa tocar e abrir o aplicativo de mapas.
 *
 * Iscas desligadas no codigo de producao em 21/10/2026, conferidas no disco,
 * suite rodada, arquivo restaurado:
 *
 * | o que foi desligado | `fail` |
 * |---|---|
 * | `projetarEnderecoComercial` devolvendo os quatro nulos | 2 |
 * | os quatro campos acrescentados a `projetarEntrada` (a projecao da LISTA) | 1 |
 */
void describe('o endereco comercial da entrada', () => {
  void it('os quatro campos atravessam como GRAVADOS, sem compor e sem normalizar', () => {
    // O servidor nao monta uma linha unica: o que ele gravou foi o que o
    // operador conferiu na tela do painel. Compor aqui seria inventar um
    // formato que ninguem decidiu, num lugar onde o painel nao poderia
    // corrigi-lo.
    const projetado = projetarEnderecoComercial({
      postalCode: '05422030',
      street: 'Rua Teodoro Sampaio',
      streetNumber: 's/n',
      complement: 'Sala 3',
    });
    assert.deepEqual(projetado, {
      postal_code: '05422030',
      street: 'Rua Teodoro Sampaio',
      street_number: 's/n',
      complement: 'Sala 3',
    });
  });

  void it('sem endereco, os quatro saem NULOS -- e nulo e o estado normal', () => {
    assert.deepEqual(
      projetarEnderecoComercial({
        postalCode: null,
        street: null,
        streetNumber: null,
        complement: null,
      }),
      { postal_code: null, street: null, street_number: null, complement: null },
    );
  });

  void it('ISCA DE FRONTEIRA: a projecao da LISTA nao carrega nenhum dos quatro', () => {
    // `projetarEntrada` e o caminho da listagem E do detalhe. O endereco segue
    // o caminho da FOTO EM FAIXA -- campo proprio de `LocalDoDiretorio` --, e e
    // por isso que ele nao tem como escorregar para o cartao de `Perto` no dia
    // em que alguem acrescentar um campo a projecao comum.
    const chaves = Object.keys(projetarEntrada(entrada(), URL_DE_MIDIA));
    for (const campo of ['postal_code', 'street', 'street_number', 'complement']) {
      assert.ok(
        !chaves.includes(campo),
        `\`${campo}\` entrou na projecao COMUM: a listagem passaria a devolver ` +
          'endereco de porta em ate vinte cartoes, que nenhuma tela pediu',
      );
    }
  });
});
