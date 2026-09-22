/**
 * @regressao — Erro em `application/problem+json` com `type` estável e
 * `correlation_id`, e sem rastro de pilha nem nome de tabela (§4.1).
 *
 * Este é o único dos dez que exercita apenas operações já implementadas, então
 * ele é o sinal vivo da suíte: se ele ficar vermelho, é defeito, e não módulo
 * faltando.
 *
 * O padrão é a RFC 9457. O cliente decide por `type`, nunca pelo texto, e é por
 * isso que as asserções são sobre `type`, `status` e `correlation_id`, e não
 * sobre a frase — teste que casa a frase amarra o contrato à redação e quebra
 * no dia em que a UX melhora o texto.
 */
import { criarConta, SENHA_PADRAO } from '../apoio/massa';
import type { OuProblema, Problema, Sessao } from '../apoio/respostas';

/** Rastro que nunca pode chegar ao cliente. */
const VESTIGIOS_INTERNOS = [
  'at Object.',
  'node_modules',
  '/src/',
  '.ts:',
  'Error:',
  'select ',
  'insert into',
  'pg_',
  'relation "',
  'kysely',
  'fastify',
];

function conferirFormatoDeProblema(r: Cypress.Response<Partial<Problema>>, statusEsperado: number, rotulo: string): void {
  expect(r.status, rotulo).to.eq(statusEsperado);
  expect(r.headers['content-type'], `${rotulo}: media type`).to.include('application/problem+json');

  expect(r.body.type, `${rotulo}: type`).to.be.a('string');
  expect(r.body.type, `${rotulo}: type precisa ser URI absoluta e estável`).to.match(/^https?:\/\//);
  expect(r.body.title, `${rotulo}: title`).to.be.a('string').and.have.length.greaterThan(0);
  expect(r.body.status, `${rotulo}: status do corpo bate com o da resposta`).to.eq(statusEsperado);

  expect(r.body.correlation_id, `${rotulo}: correlation_id`).to.match(
    /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i,
  );
  expect(
    r.body.correlation_id,
    `${rotulo}: o correlation_id do corpo precisa ser o mesmo do cabeçalho, senão ele não liga captura de tela a linha de log`,
  ).to.eq(r.headers['x-correlation-id']);

  const serializado = JSON.stringify(r.body);
  for (const vestigio of VESTIGIOS_INTERNOS) {
    expect(serializado.toLowerCase(), `${rotulo}: vestígio interno "${vestigio}" no corpo do erro`).to.not.include(vestigio.toLowerCase());
  }
}

describe('@regressao formato de erro', () => {
  it('409 de e-mail já cadastrado segue a RFC 9457', () => {
    criarConta('problem-409').then((conta) => {
      cy.request<OuProblema<Sessao>>({
        method: 'POST',
        url: '/v1/auth/register',
        failOnStatusCode: false,
        body: { email: conta.email, password: SENHA_PADRAO },
      }).then((r) => {
        conferirFormatoDeProblema(r, 409, 'registerUser duplicado');
        expect(r.body.type, 'type estável do e-mail já cadastrado').to.include('email-already-registered');
        expect(r.body.next_action, 'a tela oferece entrar em vez de criar outra').to.eq('sign_in');
      });
    });
  });

  it('400 de validação traz `errors` com campo e código', () => {
    cy.request<OuProblema<Sessao>>({ method: 'POST', url: '/v1/auth/register', failOnStatusCode: false, body: {} }).then((r) => {
      conferirFormatoDeProblema(r, 400, 'registerUser sem corpo');
      expect(r.body.errors, 'o cliente precisa saber qual campo corrigir').to.be.an('array').and.have.length.greaterThan(0);
      for (const erro of r.body.errors ?? []) {
        expect(erro, 'cada erro tem code').to.have.property('code');
        expect(
          erro.field,
          'o nome do campo precisa vir preenchido: `field` vazio faz a tela não ter onde pousar a mensagem, e a pessoa fica olhando um formulário sem nenhum campo marcado',
        ).to.be.a('string').and.have.length.greaterThan(0);
      }
    });
  });

  it('401 sem token manda entrar, e não é confundido com 403 nem com 404', () => {
    cy.request<OuProblema<Record<string, unknown>>>({ method: 'POST', url: '/v1/auth/logout', failOnStatusCode: false }).then((r) => {
      conferirFormatoDeProblema(r, 401, 'logout sem token');
      expect(r.body.type, 'token ausente é `unauthenticated`, e não `forbidden`').to.include('unauthenticated');
      expect(r.body.next_action).to.eq('sign_in');
    });
  });

  it('422 de senha fraca é distinto do 400 de validação', () => {
    // A fronteira entre os dois é de camada, e foi medida contra o serviço:
    // senha com menos de 10 caracteres não passa no `minLength` do esquema e
    // reprova como 400 antes de a política rodar. O 422 é para a senha que
    // **passa** no esquema e reprova na política — aqui, semelhança com o
    // e-mail. Escrever o valor-limite errado faria este caso acusar defeito
    // onde há duas camadas funcionando.
    const email = `qa-senha-fraca-${Date.now()}@exemplo.com.br`;

    cy.request<OuProblema<Sessao>>({ method: 'POST', url: '/v1/auth/register', failOnStatusCode: false, body: { email, password: '123' } }).then((r) => {
      expect(r.status, 'abaixo do mínimo do esquema é 400, na borda').to.eq(400);
    });

    cy.request<OuProblema<Sessao>>({ method: 'POST', url: '/v1/auth/register', failOnStatusCode: false, body: { email, password: email } }).then((r) => {
      conferirFormatoDeProblema(r, 422, 'senha parecida com o e-mail');
      expect(r.body.type, 'dois problemas diferentes não podem compartilhar type').to.include('weak-password');
      expect(
        (r.body.errors ?? []).map((e) => e.code),
        'o código do erro diz qual regra reprovou',
      ).to.include('similar_to_identity');
    });
  });

  it('credencial recusada não revela se a conta existe', () => {
    const inexistente = `qa-nao-existe-${Date.now()}@exemplo.com.br`;

    criarConta('problem-opaco').then((conta) => {
      let corpoDaContaReal = '';
      cy.request<OuProblema<Sessao>>({ method: 'POST', url: '/v1/auth/login', failOnStatusCode: false, body: { email: conta.email, password: 'senha-errada-mas-longa' } })
        .then((r) => {
          conferirFormatoDeProblema(r, 401, 'login com senha errada');
          corpoDaContaReal = String(r.body.type);
          return cy.request<OuProblema<Sessao>>({ method: 'POST', url: '/v1/auth/login', failOnStatusCode: false, body: { email: inexistente, password: SENHA_PADRAO } });
        })
        .then((r) => {
          conferirFormatoDeProblema(r, 401, 'login com e-mail inexistente');
          expect(
            String(r.body.type),
            'e-mail inexistente e senha errada precisam responder igual, senão o login vira oráculo de conta',
          ).to.eq(corpoDaContaReal);
        });
    });
  });

  it('caminho desconhecido também responde problem+json', () => {
    cy.request<OuProblema<Record<string, unknown>>>({ method: 'GET', url: '/v1/caminho-que-nao-existe', failOnStatusCode: false }).then((r) => {
      conferirFormatoDeProblema(r, 404, 'caminho desconhecido');
      // Registrado como achado: este corpo é idêntico ao 404 legítimo do
      // contrato, e é por isso que `apoio/rotas.ts` existe.
      expect(r.body.type).to.include('not-found');
    });
  });
});
