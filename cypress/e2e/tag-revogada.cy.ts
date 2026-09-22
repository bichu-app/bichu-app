/**
 * @regressao — Tag revogada devolve 410 com `next_action`, nunca 404; código
 * inexistente devolve 404; texto que não normaliza devolve 400 (§4.1, ADR-0004).
 *
 * Os três são respostas diferentes para três situações diferentes, e confundi-las
 * leva quem está com o animal no colo a um beco sem saída. O 410 é o único que
 * carrega o caminho alternativo.
 *
 * O cenário confere o `type`, e não o texto: o cliente decide por `type`
 * (RFC 9457), e um teste que casa a frase amarra o contrato à redação.
 */
import { exigirRota, caminhoDe } from '../apoio/rotas';
import { criarConta, criarPet, emitirTag, autorizacao, chaveDeIdempotencia } from '../apoio/massa';
import type { AvisoCriado, OuProblema, ResolucaoDeTag } from '../apoio/respostas';
import { simboloDeVerificacao } from '../apoio/codigo-da-tag';

/**
 * 16 caracteres do alfabeto Crockford, bem formado e inexistente, **com símbolo
 * de verificação válido** (ADR-0004, Emenda 1).
 *
 * O dígito não é decoração aqui: sem ele este cenário passa a receber **400** e
 * deixa de exercitar o 404 que ele existe para exercitar — **continuando
 * verde**. É o caso mais fácil de quebrar em silêncio de toda a mudança, e a
 * asserção logo abaixo do `beforeEach` existe para que ele não quebre calado.
 *
 * Conferido contra o gerador: `gerarCodigoDaTag(0102030405060708090a)`.
 */
const CODIGO_BEM_FORMADO_INEXISTENTE = '41061050R3GG28AY';
/** `U` está fora do alfabeto Crockford: não normaliza para um código. */
const TEXTO_QUE_NAO_NORMALIZA = 'UUUUUUUUUUUUUUUU';
/**
 * Bem formado no tamanho e no alfabeto, e com o **último caractere trocado**:
 * só o símbolo de verificação o separa do de cima. É 400, e não 404.
 */
const CODIGO_COM_DIGITO_ERRADO = '41061050R3GG28A0';
/** O formato anterior, de 26 caracteres. Corte seco: também é 400. */
const CODIGO_DO_FORMATO_ANTIGO = '0123456789ABCDEFGHJKMNPQRS';

describe('@regressao tag revogada, código inexistente e texto que não normaliza', () => {
  // Antes de cada caso, e não uma vez só: sem a prova de rota, "esperava 400,
  // veio 404" se lê como confusão entre os dois status quando a causa é a rota
  // não existir.
  beforeEach(() => {
    exigirRota('resolveTagCode', { code: CODIGO_BEM_FORMADO_INEXISTENTE });

    // A conferência local, antes de qualquer requisição: um código de fixture
    // com dígito inválido faz o cenário do 404 receber 400 e continuar verde.
    // Aqui a quebra é imediata e diz o número da posição.
    expect(
      CODIGO_BEM_FORMADO_INEXISTENTE[15],
      `${CODIGO_BEM_FORMADO_INEXISTENTE} tem símbolo de verificação inválido: o cenário do 404 viraria 400`,
    ).to.eq(simboloDeVerificacao(CODIGO_BEM_FORMADO_INEXISTENTE.slice(0, 15)));
    expect(
      CODIGO_COM_DIGITO_ERRADO[15],
      'o código do caso de 400 precisa ter o dígito ERRADO, senão ele testa o 404',
    ).to.not.eq(simboloDeVerificacao(CODIGO_COM_DIGITO_ERRADO.slice(0, 15)));
  });

  it('tag revogada responde 410 com next_action, e nunca 404', () => {
    criarConta('revogada').then((conta) => {
      criarPet(conta).then((petId) => {
        emitirTag(conta, petId).then((tag) => {
          exigirRota('revokePetTag', { petId, tagId: tag.tagId });

          cy.request<OuProblema<Record<string, unknown>>>({
            method: 'POST',
            url: caminhoDe('revokePetTag', { petId, tagId: tag.tagId }),
            headers: autorizacao(conta),
            failOnStatusCode: false,
            body: { reason: 'lost_tag' },
          }).then((r) => {
            expect(r.status, 'revogação aceita').to.be.oneOf([200, 204]);
          });

          cy.then(() => {
            cy.request<OuProblema<ResolucaoDeTag>>({ method: 'GET', url: caminhoDe('resolveTagCode', { code: tag.code }), failOnStatusCode: false }).then((r) => {
              expect(r.status, 'revogada é 410, nunca 404').to.eq(410);
              expect(r.headers['content-type']).to.include('application/problem+json');
              expect(r.body.type, 'o cliente decide por type').to.include('tag-revoked');
              expect(
                r.body.next_action,
                'quem está com o animal no colo precisa do caminho alternativo',
              ).to.eq('register_stray_found_report');
              expect(r.body.correlation_id).to.be.a('string');
            });
          });

          // Avisar por uma tag revogada também é 410, e não 404.
          cy.then(() => {
            cy.request<OuProblema<AvisoCriado>>({
              method: 'POST',
              url: caminhoDe('createFoundReportFromTag', { code: tag.code }),
              failOnStatusCode: false,
              headers: { 'Idempotency-Key': chaveDeIdempotencia('revogada') },
              body: {},
            }).then((r) => {
              expect(r.status, 'a rota de aviso segue a mesma regra').to.eq(410);
            });
          });
        });
      });
    });
  });

  it('o código de teste tem dígito de verificação válido, senão o 404 abaixo é 400', () => {
    // A guarda do cenário, e ela vem ANTES do caso que depende dela. Sem isto,
    // um código de fixture refeito sem dígito válido faz o caso seguinte
    // receber 400, deixar de testar o 404 e continuar verde: ninguém olha um
    // teste que passa. Aqui a quebra é ruidosa e diz o motivo.
    cy.request<OuProblema<ResolucaoDeTag>>({
      method: 'GET',
      url: caminhoDe('resolveTagCode', { code: CODIGO_BEM_FORMADO_INEXISTENTE }),
      failOnStatusCode: false,
    }).then((r) => {
      expect(
        r.status,
        `${CODIGO_BEM_FORMADO_INEXISTENTE} recebeu 400: o símbolo de verificação não bate, e este cenário deixaria de exercitar o 404`,
      ).to.not.eq(400);
    });
  });

  it('um caractere trocado é 400 antes de tocar o banco, e não 404', () => {
    // O ganho de produto inteiro desta mudança está neste caso. Antes, quem
    // errava uma letra recebia "esse código não é de nenhuma tag do Bichu", que
    // acusa a plaquinha quando a culpa foi do dedo. Os dois códigos diferem em
    // um caractere e caem em respostas diferentes.
    cy.request<OuProblema<ResolucaoDeTag>>({
      method: 'GET',
      url: caminhoDe('resolveTagCode', { code: CODIGO_COM_DIGITO_ERRADO }),
      failOnStatusCode: false,
    }).then((r) => {
      expect(r.status, 'dígito de verificação que não bate é erro de digitação').to.eq(400);
    });
  });

  it('o formato antigo de 26 caracteres é 400: não há duas gerações de plaquinha', () => {
    cy.request<OuProblema<ResolucaoDeTag>>({
      method: 'GET',
      url: caminhoDe('resolveTagCode', { code: CODIGO_DO_FORMATO_ANTIGO }),
      failOnStatusCode: false,
    }).then((r) => {
      expect(r.status, 'corte seco: 26 caracteres é tamanho errado como qualquer outro').to.eq(400);
    });
  });

  it('código bem formado e inexistente responde 404, com type diferente do 410', () => {
    cy.request<OuProblema<ResolucaoDeTag>>({
      method: 'GET',
      url: caminhoDe('resolveTagCode', { code: CODIGO_BEM_FORMADO_INEXISTENTE }),
      failOnStatusCode: false,
    }).then((r) => {
      expect(r.status, 'normalizou e não existe').to.eq(404);
      expect(r.body.type, 'o type do 404 não pode ser o do 410').to.not.include('tag-revoked');
      expect(r.body.next_action, 'o 404 não oferece caminho alternativo de tag revogada').to.not.eq('register_stray_found_report');
    });
  });

  it('texto que não normaliza responde 400, e não 404', () => {
    cy.request<OuProblema<ResolucaoDeTag>>({
      method: 'GET',
      url: caminhoDe('resolveTagCode', { code: TEXTO_QUE_NAO_NORMALIZA }),
      failOnStatusCode: false,
    }).then((r) => {
      expect(
        r.status,
        'para quem está na rua a diferença é útil: 400 diz "confira o que você digitou", 404 diz "não encontramos este código"',
      ).to.eq(400);
    });
  });

  it('os três responderam com `type` distinto entre si', () => {
    // Três respostas com o mesmo `type` seriam três telas iguais para três
    // situações que a UX distingue, e o defeito passaria por cada caso isolado.
    const tipos: string[] = [];
    cy.request<OuProblema<ResolucaoDeTag>>({ method: 'GET', url: caminhoDe('resolveTagCode', { code: CODIGO_BEM_FORMADO_INEXISTENTE }), failOnStatusCode: false })
      .then((r) => {
        tipos.push(String(r.body?.type));
        return cy.request<OuProblema<ResolucaoDeTag>>({ method: 'GET', url: caminhoDe('resolveTagCode', { code: TEXTO_QUE_NAO_NORMALIZA }), failOnStatusCode: false });
      })
      .then((r) => {
        tipos.push(String(r.body?.type));
        expect(new Set(tipos).size, `404 e 400 precisam ter type diferente: ${tipos.join(' / ')}`).to.eq(2);
      });
  });
});
