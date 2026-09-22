/**
 * @critico — Ciclo completo do caso por API (§4.1).
 *
 * É o MVP inteiro num cenário só: criar conta, pet, tag, resolver código,
 * avisar, abrir caso, candidato, decidir, conversar, encerrar com desfecho.
 * Hoje nada prova esse caminho — os unitários testam funções e os de
 * integração testam esquema; o produto de ponta a ponta não é exercitado por
 * ninguém.
 *
 * Um `it` por etapa, encadeado pelo estado que a etapa anterior produziu. A
 * primeira etapa que reprovar interrompe as seguintes, e isso é desejado: a
 * lista do que falta construir sai em ordem de caminho, e não como dez falhas
 * sem relação entre si.
 */
import { exigirRota, caminhoDe } from '../apoio/rotas';
import { criarConta, criarPet, emitirTag, autorizacao, chaveDeIdempotencia, type Conta } from '../apoio/massa';
import { TAG_RESOLUTION, FOUND_REPORT_CREATED, chavesForaDaLista, vazamentosDeContato, uuidsEmRespostaPublica } from '../apoio/lista-de-permissao';
import type { AvisoCriado, Candidato, Caso, ListaDeTags, OuProblema, PaginaDeCandidatos, PaginaDeConversas, PreviaDeAlcance, ResolucaoDeTag } from '../apoio/respostas';

/**
 * O ciclo é encadeado, e uma etapa que não roda precisa dizer isso com essas
 * palavras. Sem esta guarda, a etapa 3 reprovaria com "falta o valor de
 * {petId}", que se lê como defeito do teste quando a causa é a etapa 2 não ter
 * concluído.
 */
function exigirEtapaAnterior(valor: string | undefined, etapa: string): string {
  if (valor === undefined || valor === '') {
    throw new Error(`ETAPA ANTERIOR NÃO CONCLUIU: falta ${etapa}, produzido por uma etapa que reprovou antes desta.`);
  }
  return valor;
}

describe('@critico ciclo completo do caso por API', () => {
  let conta: Conta;
  let petId: string;
  let codigoDaTag: string;
  let finderToken: string;
  let caseId: string;
  let candidateId: string;
  let conversationId: string;

  it('1. cria a conta e a sessão nasce junto', () => {
    criarConta('ciclo').then((criada) => {
      conta = criada;
      expect(conta.accessToken, 'access_token').to.be.a('string').and.have.length.greaterThan(0);
      expect(conta.userId, 'user.id').to.be.a('string');
    });
  });

  it('2. cadastra o pet', () => {
    exigirEtapaAnterior(conta?.accessToken, 'a conta da etapa 1');
    criarPet(conta).then((id) => {
      petId = id;
    });
  });

  it('3. emite a tag e recebe o código em claro, uma única vez', () => {
    emitirTag(conta, exigirEtapaAnterior(petId, 'o pet da etapa 2')).then((tag) => {
      codigoDaTag = tag.code;
      // 16: 15 símbolos de aleatoriedade (75 bits) e 1 de verificação
      // (ADR-0004, Emenda 1). O número vira plaquinha impressa, e é por isso
      // que ele está afirmado aqui e não só no teste de domínio.
      expect(codigoDaTag, 'código normalizado de 16 caracteres').to.have.length(16);
      expect(codigoDaTag, 'quatro grupos de quatro na forma impressa').to.match(
        /^[0-9A-HJKMNP-TV-Z]{16}$/,
      );
    });

    // `listPetTags` nunca devolve o código em claro, nem para o dono.
    cy.request<OuProblema<ListaDeTags>>({ method: 'GET', url: `/v1/pets/${petId}/tags`, headers: autorizacao(conta), failOnStatusCode: false }).then((r) => {
      expect(r.status).to.eq(200);
      expect(JSON.stringify(r.body), 'o código em claro não pode voltar em listPetTags').to.not.include(codigoDaTag);
    });
  });

  it('4. um estranho resolve o código sem conta, e não recebe UUID nem contato', () => {
    exigirEtapaAnterior(codigoDaTag, 'o código da tag da etapa 3');
    exigirRota('resolveTagCode', { code: codigoDaTag });

    cy.request<OuProblema<ResolucaoDeTag>>({ method: 'GET', url: caminhoDe('resolveTagCode', { code: codigoDaTag }), failOnStatusCode: false }).then((r) => {
      expect(r.status, 'código válido resolve').to.eq(200);
      expect(r.body.viewer, 'quem não tem conta é anonymous').to.eq('anonymous');
      expect(r.body.pet.display_name).to.eq('Thor');

      expect(chavesForaDaLista(r.body, TAG_RESOLUTION), 'chaves fora da lista de permissão').to.deep.eq([]);
      expect(vazamentosDeContato(r.body), 'telefone, endereço ou coordenada na resposta').to.deep.eq([]);
      expect(uuidsEmRespostaPublica(r.body), 'resolveTagCode não devolve UUID a quem não tem conta (SEC-001)').to.deep.eq([]);
    });
  });

  it('5. o achador avisa o tutor com um toque e corpo vazio', () => {
    exigirEtapaAnterior(codigoDaTag, 'o código da tag da etapa 3');
    exigirRota('createFoundReportFromTag', { code: codigoDaTag });

    cy.request<OuProblema<AvisoCriado>>({
      method: 'POST',
      url: caminhoDe('createFoundReportFromTag', { code: codigoDaTag }),
      failOnStatusCode: false,
      headers: { 'Idempotency-Key': chaveDeIdempotencia('ciclo-aviso') },
      body: {},
    }).then((r) => {
      expect(r.status, 'a operação mais crítica do produto aceita corpo vazio').to.eq(201);
      expect(r.body.finder_token, 'finder_token').to.be.a('string').and.have.length.greaterThan(0);
      expect(r.body.conversation_url, 'conversation_url').to.be.a('string');
      expect(r.body.owner_notified, 'owner_notified').to.be.a('boolean');

      expect(chavesForaDaLista(r.body, FOUND_REPORT_CREATED)).to.deep.eq([]);
      expect(uuidsEmRespostaPublica(r.body), 'FoundReportCreated não devolve identificador interno').to.deep.eq([]);
      finderToken = r.body.finder_token;
    });
  });

  it('6. a prévia de alcance responde antes de abrir o caso', () => {
    exigirEtapaAnterior(petId, 'o pet da etapa 2');
    exigirRota('previewLostCaseReach', { petId });

    cy.request<OuProblema<PreviaDeAlcance>>({
      method: 'GET',
      url: caminhoDe('previewLostCaseReach', { petId }),
      headers: autorizacao(conta),
      failOnStatusCode: false,
      qs: { lat: -23.5505, lon: -46.6333 },
    }).then((r) => {
      expect(r.status).to.eq(200);
      expect(r.body.reach_status, 'quatro estados, e zero não é "não calculei"').to.be.oneOf(['computed', 'unavailable', 'no_location']);
      expect(r.body).to.have.property('radius_m');
      expect(r.body.blockers, 'blockers vem junto, para a folha de bloqueio não precisar de segunda chamada').to.be.an('array');
    });
  });

  it('7. abre o caso de perdido e o alerta é enfileirado', () => {
    exigirEtapaAnterior(petId, 'o pet da etapa 2');
    exigirRota('openLostCase', { petId });

    cy.request<OuProblema<Caso>>({
      method: 'POST',
      url: caminhoDe('openLostCase', { petId }),
      headers: { ...autorizacao(conta), 'Idempotency-Key': chaveDeIdempotencia('ciclo-caso') },
      failOnStatusCode: false,
      body: {
        last_seen_at: new Date().toISOString(),
        last_seen_location: { lat: -23.5505, lon: -46.6333 },
        description: 'Fugiu pelo portão aberto.',
      },
    }).then((r) => {
      if (r.status === 409) {
        // Bloqueio legítimo do contrato: canal de contato não verificado ou pet
        // sem foto. A conta criada por API nasce com o e-mail não verificado, e
        // não há caminho de API para verificar. É o item 5 dos requisitos de
        // testabilidade (§4.3): tarefa de semeadura autenticada em `qa`.
        throw new Error(
          'PRÉ-CONDIÇÃO AUSENTE: openLostCase respondeu 409 com ' +
            JSON.stringify(r.body) +
            '. A conta criada por API nasce com e-mail não verificado e o pet sem foto, e o contrato não ' +
            'declara operação que verifique o e-mail sem o link enviado por e-mail. Sem a tarefa de semeadura ' +
            'do item 5 da §4.3, este cenário não tem como chegar ao caso aberto. Não é defeito do servidor.',
        );
      }
      expect(r.status, 'caso aberto').to.eq(201);
      expect(r.body.status).to.eq('open');
      expect(r.body.alert.reach_status).to.be.oneOf(['computed', 'unavailable', 'queued', 'no_location']);
      caseId = r.body.id;
    });
  });

  it('8. o aviso do achador aparece como candidato do caso', () => {
    exigirEtapaAnterior(caseId, 'o caso da etapa 7');
    exigirRota('listLostCaseCandidates', { caseId });

    cy.request<OuProblema<PaginaDeCandidatos>>({
      method: 'GET',
      url: caminhoDe('listLostCaseCandidates', { caseId }),
      headers: autorizacao(conta),
      failOnStatusCode: false,
    }).then((r) => {
      expect(r.status).to.eq(200);
      expect(r.body.items, 'lista vazia é estado legítimo, mas aqui houve aviso pela tag').to.be.an('array').and.have.length.greaterThan(0);
      const primeiro = r.body.items[0];
      expect(primeiro, 'o primeiro candidato').to.not.eq(undefined);
      candidateId = primeiro?.id ?? '';
    });
  });

  it('9. o tutor decide, e nada se confirma sem decisão humana', () => {
    exigirEtapaAnterior(candidateId, 'o candidato da etapa 8');
    exigirRota('decideLostCaseCandidate', { caseId, candidateId });

    cy.request<OuProblema<Candidato>>({
      method: 'POST',
      url: caminhoDe('decideLostCaseCandidate', { caseId, candidateId }),
      headers: autorizacao(conta),
      failOnStatusCode: false,
      body: { decision: 'confirmed' },
    }).then((r) => {
      expect(r.status).to.eq(200);
      expect(r.body.decision).to.eq('confirmed');
    });
  });

  it('10. confirmar abre a conversa mediada, e ela não carrega contato', () => {
    exigirEtapaAnterior(caseId, 'o caso da etapa 7');
    exigirRota('listConversations');

    cy.request<OuProblema<PaginaDeConversas>>({ method: 'GET', url: caminhoDe('listConversations'), headers: autorizacao(conta), failOnStatusCode: false }).then((r) => {
      expect(r.status).to.eq(200);
      expect(r.body.items, 'confirmar o candidato abre a conversa').to.be.an('array').and.have.length.greaterThan(0);
      const primeira = r.body.items[0];
      expect(primeira, 'a primeira conversa').to.not.eq(undefined);
      conversationId = primeira?.id ?? '';
    });

    cy.then(() => {
      cy.request<OuProblema<Record<string, unknown>>>({
        method: 'POST',
        url: caminhoDe('postConversationMessage', { conversationId }),
        headers: autorizacao(conta),
        failOnStatusCode: false,
        body: { body: 'Obrigado por avisar. Onde você está agora?' },
      }).then((r) => {
        expect(r.status).to.be.oneOf([200, 201]);
        expect(vazamentosDeContato(r.body), 'a conversa é mediada: nenhum telefone ou endereço na resposta').to.deep.eq([]);
      });
    });

    // O lado do achador vê a mesma conversa pelo token, sem conta.
    cy.then(() => {
      cy.request<OuProblema<Record<string, unknown>>>({
        method: 'GET',
        url: caminhoDe('getFinderConversation'),
        failOnStatusCode: false,
        headers: { authorization: `Bearer ${finderToken}` },
      }).then((r) => {
        expect(r.status, 'o achador volta à conversa sem ter conta').to.eq(200);
        expect(vazamentosDeContato(r.body), 'contato mediado dos dois lados').to.deep.eq([]);
      });
    });
  });

  it('11. encerra com desfecho declarado, que é o instrumento de medição', () => {
    exigirEtapaAnterior(caseId, 'o caso da etapa 7');
    exigirRota('closeLostCase', { caseId });

    cy.request<OuProblema<Caso>>({
      method: 'POST',
      url: caminhoDe('closeLostCase', { caseId }),
      headers: autorizacao(conta),
      failOnStatusCode: false,
      body: { outcome: 'reunited', reunion_channel: 'tag_scan', note: 'Reencontrado pela plaquinha.' },
    }).then((r) => {
      expect(r.status).to.eq(200);
      expect(r.body.status, 'o desfecho vira estado do caso').to.eq('closed_reunited');
      expect(r.body.resolution?.outcome).to.eq('reunited');
      expect(r.body.resolution?.reunion_channel, 'sem canal a métrica de reencontro não é atribuível').to.eq('tag_scan');
      expect(r.body.reopen_deadline, 'encerrar é reversível por 7 dias').to.be.a('string');
    });
  });

  it('12. encerrar sem desfecho é recusado', () => {
    exigirEtapaAnterior(caseId, 'o caso da etapa 7');
    cy.request<OuProblema<Caso>>({
      method: 'POST',
      url: caminhoDe('closeLostCase', { caseId }),
      headers: autorizacao(conta),
      failOnStatusCode: false,
      body: {},
    }).then((r) => {
      expect(r.status, '`outcome` é obrigatório em LostCaseClosure').to.eq(400);
    });
  });
});
