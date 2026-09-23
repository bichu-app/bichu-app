/**
 * A trava de ambiente do `seed`, e a massa que ele grava.
 *
 * ## Por que este arquivo existe
 *
 * `seed.ts` recusa semear em producao desde que foi escrito, e ate hoje essa
 * recusa estava a **0% de cobertura**. Uma trava sem teste e uma trava por
 * confianca: ninguem a exercita, ninguem sabe o dia em que ela para de valer, e
 * o dia em que ela para de valer e o dia em que alguem apaga dado real.
 *
 * O caso mais importante deste arquivo e o penultimo: ele NAO afirma que a
 * trava recusa -- afirma que ela **precisa** recusar, e ele foi conferido
 * desligando a trava no codigo de producao.
 *
 * | o que foi desligado em `seed.ts` | `fail` |
 * |---|---|
 * | `NODE_ENV === 'production'` removido | 1 |
 * | `AMBIENTES_QUE_ACEITAM_MASSA` ganhando `'prod'` | 2 |
 * | `nivelDaEntrada` devolvendo `'document_verified'` fixo | 2 |
 *
 * (Medido em 22/09/2026, Node 22 desta maquina, com a alteracao conferida no
 * disco por `git diff --stat` nao vazio antes de rodar.)
 */
import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { AMBIENTES_QUE_ACEITAM_MASSA, AmbienteRecusado, conferirAmbiente, nivelDaEntrada } from './seed.js';
import { MASSA_DO_DIRETORIO, PUBLICADAS } from './massa-do-diretorio.js';

void describe('a trava de ambiente do seed', () => {
  void it('recusa NODE_ENV=production, mesmo com ENVIRONMENT descartavel', () => {
    assert.throws(
      () => {
        conferirAmbiente({ NODE_ENV: 'production', ENVIRONMENT: 'dev' });
      },
      AmbienteRecusado,
      'NODE_ENV=production e o que uma imagem de producao carrega por padrao. ' +
        'Um ENVIRONMENT descartavel ao lado nao torna o banco descartavel.',
    );
  });

  void it('recusa prod e preprod', () => {
    for (const ambiente of ['prod', 'preprod']) {
      assert.throws(
        () => {
          conferirAmbiente({ ENVIRONMENT: ambiente });
        },
        AmbienteRecusado,
        `semear em '${ambiente}' e perda de dado, nao recriacao de massa.`,
      );
    }
  });

  void it('recusa ambiente que ninguem previu, em vez de deixar passar', () => {
    // A ARMADILHA QUE ESTE CASO FECHA: com uma lista de PROIBIDOS, um ambiente
    // novo cairia no caso padrao -- que seria semear. Aqui a pergunta e a
    // inversa, e o desconhecido recusa.
    assert.throws(
      () => {
        conferirAmbiente({ ENVIRONMENT: 'homologacao-do-cliente' });
      },
      AmbienteRecusado,
    );
  });

  void it('aceita os ambientes descartaveis, e nao mais que eles', () => {
    for (const ambiente of AMBIENTES_QUE_ACEITAM_MASSA) {
      assert.doesNotThrow(() => {
        conferirAmbiente({ ENVIRONMENT: ambiente });
      });
    }
    assert.equal(
      AMBIENTES_QUE_ACEITAM_MASSA.has('prod'),
      false,
      'ISCA: acrescentar prod a lista de aceitos precisa reprovar aqui.',
    );
    assert.equal(AMBIENTES_QUE_ACEITAM_MASSA.has('preprod'), false);
  });

  void it('sem ENVIRONMENT nenhum, o padrao e dev e semear e permitido', () => {
    assert.doesNotThrow(() => {
      conferirAmbiente({});
    });
  });
});

void describe('a massa do diretorio', () => {
  void it('tem dez entradas publicadas, que e o que o cliente pediu para ver', () => {
    assert.equal(PUBLICADAS.length, 10);
  });

  void it('tem entrada nao publicada, que e o que da o que medir a isca do filtro', () => {
    const naoPublicadas = MASSA_DO_DIRETORIO.filter((uma) => uma.status !== 'published');
    assert.ok(
      naoPublicadas.length >= 2,
      'sem rascunho e sem oculto na massa, a isca do `status` nao mede nada: ' +
        'ela passaria com o filtro desligado.',
    );
    assert.deepEqual(
      [...new Set(naoPublicadas.map((uma) => uma.status))].sort(),
      ['draft', 'hidden'],
    );
  });

  void it('nenhum slug se repete: a unicidade e do banco e a massa nao pode viola-la', () => {
    const slugs = MASSA_DO_DIRETORIO.map((uma) => uma.slug);
    assert.equal(new Set(slugs).size, slugs.length);
  });

  void it('nenhum identificador se repete, nem de entrada, nem de titular, nem de prova', () => {
    const entradas = MASSA_DO_DIRETORIO.map((uma) => uma.id);
    const titulares = MASSA_DO_DIRETORIO.map((uma) => uma.titularId);
    const provas = MASSA_DO_DIRETORIO.flatMap((uma) => uma.verificacoes.map((v) => v.id));
    assert.equal(new Set(entradas).size, entradas.length);
    assert.equal(new Set(titulares).size, titulares.length);
    assert.equal(new Set(provas).size, provas.length);
    assert.equal(
      new Set([...entradas, ...titulares, ...provas]).size,
      entradas.length + titulares.length + provas.length,
      'identificador repetido entre tabelas confunde quem lê log, e mascara ' +
        'uma troca de argumento que o teste deveria pegar.',
    );
  });

  void it('a variedade que o cliente vai julgar existe de fato', () => {
    // Cada afirmacao aqui e um caso de DESENHO que uma lista homogenea
    // esconderia, e nao um numero bonito.
    assert.ok(
      PUBLICADAS.some((uma) => uma.displayName.length > 40),
      'sem nome longo, ninguem descobre que o cartao quebra em duas linhas.',
    );
    assert.ok(
      PUBLICADAS.some((uma) => uma.displayName.length <= 10),
      'sem nome curto ao lado do longo, o contraste nao aparece.',
    );
    assert.ok(
      PUBLICADAS.some((uma) => uma.phoneE164 === null),
      'sem entrada sem telefone, a tela nunca precisa desenhar o cartao sem o botao de ligar.',
    );
    assert.ok(
      PUBLICADAS.some((uma) => uma.about === null),
      'sem entrada sem apresentacao, o cartao curto nunca aparece.',
    );
    assert.ok(
      PUBLICADAS.some((uma) => uma.ponto === null),
      'sem entrada sem coordenada, o caso REAL de hoje fica de fora: ninguem ' +
        'escreve `geo` porque nao ha painel de cadastro.',
    );
    assert.ok(
      PUBLICADAS.some((uma) => uma.verificacoes.length === 0),
      'sem entrada nao verificada, a tela so ve cartao com selo.',
    );
    assert.deepEqual(
      [...new Set(PUBLICADAS.map(nivelDaEntrada))].sort(),
      ['contact_verified', 'document_verified', 'none'],
      'os tres niveis precisam aparecer: e o selo que o cliente vai julgar.',
    );
    assert.equal(
      new Set(PUBLICADAS.map((uma) => uma.kind)).size,
      6,
      'as seis atividades de `professionals.kind` precisam estar na tela.',
    );
    assert.ok(
      new Set(PUBLICADAS.map((uma) => uma.city)).size >= 2,
      'sem uma segunda cidade, o filtro por cidade nao tem o que deixar de fora.',
    );
  });

  void it('verificacao PENDENTE nao levanta o nivel da entrada', () => {
    const comPendente = MASSA_DO_DIRETORIO.find((uma) =>
      uma.verificacoes.some((v) => !v.aprovada),
    );
    assert.ok(
      comPendente !== undefined,
      'a massa precisa ter uma prova pendente: sem ela, "pendente nao conta" ' +
        'nunca e exercido contra dado de verdade.',
    );
    assert.ok(comPendente.verificacoes.some((v) => v.evidenceKind === 'document' && !v.aprovada));
    assert.equal(
      nivelDaEntrada(comPendente),
      'contact_verified',
      'um `document` PENDENTE viraria `document_verified` se a derivacao ' +
        'deixasse de filtrar por decisao -- e "pedi para ser verificado" ' +
        'passaria a ler "fui verificado".',
    );
  });

  void it('toda entrada publicada tem cidade e UF: sem lugar nao ha diretorio', () => {
    for (const entrada of PUBLICADAS) {
      assert.ok(entrada.city !== null && entrada.city !== '', entrada.slug);
      assert.ok(entrada.state !== null && entrada.state.length === 2, entrada.slug);
    }
  });

  void it('nenhuma entrada promete campo que o banco nao tem onde guardar', () => {
    // Horario, rua, foto, site, e-mail, redes, servicos, preco e avaliacao NAO
    // tem coluna em `professionals`. Este caso vigia a forma do objeto para que
    // a tela nao seja desenhada em cima de dado que a rota nunca vai devolver.
    const permitidos = new Set([
      'id', 'titularId', 'titularEmail', 'slug', 'kind', 'displayName', 'about',
      'city', 'state', 'neighborhood', 'ponto', 'phoneE164', 'crmvNumber',
      'crmvUf', 'cnpj', 'status', 'verificacoes',
    ]);
    for (const entrada of MASSA_DO_DIRETORIO) {
      for (const campo of Object.keys(entrada)) {
        assert.ok(
          permitidos.has(campo),
          `'${campo}' nao tem coluna em professionals. Acrescentar campo aqui ` +
            'faz a massa prometer o que a rota nao devolve.',
        );
      }
    }
  });

  void it('o par de coordenada esta em (lon, lat), a ordem de ST_MakePoint', () => {
    // Sao Paulo fica por volta de lon -46,5 e lat -23,5. Trocar os dois nao
    // falha em lugar nenhum: grava o Brasil no meio da Somalia, e so uma
    // medicao de distancia acusa. Este caso pega a troca ANTES de o banco subir.
    for (const entrada of MASSA_DO_DIRETORIO) {
      if (entrada.ponto === null) continue;
      const [lon, lat] = entrada.ponto;
      assert.ok(lon > -47 && lon < -46, `${entrada.slug}: longitude fora de Sao Paulo (${String(lon)})`);
      assert.ok(lat > -24 && lat < -23, `${entrada.slug}: latitude fora de Sao Paulo (${String(lat)})`);
    }
  });
});
