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

  void it('todo slug cabe no formato que o banco impoe', () => {
    const formato = /^[a-z0-9][a-z0-9-]{1,28}[a-z0-9]$/;
    for (const entrada of MASSA_DO_DIRETORIO) {
      assert.match(entrada.slug, formato, `slug '${entrada.slug}' nao passa no CHECK do banco`);
    }
  });

  void it('todo nome de exibicao cabe entre 2 e 120 caracteres', () => {
    for (const entrada of MASSA_DO_DIRETORIO) {
      assert.ok(
        entrada.displayName.length >= 2 && entrada.displayName.length <= 120,
        `'${entrada.displayName}' tem ${String(entrada.displayName.length)} caracteres`,
      );
    }
  });

  void it('todo telefone cabe no formato internacional que a coluna impoe', () => {
    const formato = /^\+[1-9][0-9]{7,14}$/;
    for (const entrada of MASSA_DO_DIRETORIO) {
      if (entrada.phoneE164 === null) continue;
      assert.match(entrada.phoneE164, formato, entrada.slug);
    }
  });

  void it('todo CNPJ tem os catorze digitos que a coluna exige', () => {
    for (const entrada of MASSA_DO_DIRETORIO) {
      if (entrada.cnpj === null) continue;
      assert.match(entrada.cnpj, /^[0-9]{14}$/, entrada.slug);
    }
  });

  void it('todo endereco publico de titular cabe na forma que a coluna impoe', () => {
    const forma = /^[A-Za-z0-9_-]{22}$/;
    for (const entrada of MASSA_DO_DIRETORIO) {
      assert.match(entrada.titularPublicRef, forma, entrada.slug);
    }
    const refs = MASSA_DO_DIRETORIO.map((uma) => uma.titularPublicRef);
    assert.equal(
      new Set(refs).size,
      refs.length,
      'dois titulares com o mesmo `public_ref`: `users_public_ref_unico` recusa o segundo ' +
        'INSERT, e a massa para no meio. O endereco de uma conta nao se reemite a outra.',
    );
  });

  void it('toda UF tem exatamente duas letras', () => {
    for (const entrada of MASSA_DO_DIRETORIO) {
      if (entrada.state === null) continue;
      assert.equal(entrada.state.length, 2, entrada.slug);
    }
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
    const permitidos = new Set([
      'id', 'titularId', 'titularEmail', 'titularPublicRef', 'slug', 'kind',
      'displayName', 'about', 'city', 'state', 'neighborhood', 'ponto',
      'phoneE164', 'crmvNumber', 'crmvUf', 'cnpj', 'status', 'verificacoes',
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
    for (const entrada of MASSA_DO_DIRETORIO) {
      if (entrada.ponto === null) continue;
      const [lon, lat] = entrada.ponto;
      assert.ok(lon > -47 && lon < -46, `${entrada.slug}: longitude fora de Sao Paulo (${String(lon)})`);
      assert.ok(lat > -24 && lat < -23, `${entrada.slug}: latitude fora de Sao Paulo (${String(lat)})`);
    }
  });
});
