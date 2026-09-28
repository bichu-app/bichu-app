// A decisao de tela por `type` do problema, sem navegador (modulos de src/dominio).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { lerEspera, resultadoDeProblema, slugDoTipo, type Resultado } from '../../src/dominio/resultado.ts';
import { telaAoAbrir, telaAoAvisar, type ResolucaoDaTag, type AvisoCriado } from '../../src/dominio/telas-da-tag.ts';
import { telaAoConferirLink, telaAoConfirmarEmail, telaAoSalvarSenha } from '../../src/dominio/telas-de-conta.ts';

const tipo = (slug: string) => `https://dominio-a-definir.com.br/problems/${slug}`;
const problema = (status: number, slug: string, extra: Record<string, unknown> = {}, retry: string | null = null) =>
  resultadoDeProblema(status, { type: tipo(slug), title: 'qualquer texto', status, ...extra }, retry);
const falha: Resultado<never> = { tipo: 'falha', motivo: 'tempo' };

test('slug sai do type em qualquer dominio, e so se estiver na lista fechada', () => {
  assert.equal(slugDoTipo('https://hml.bichu.app/problems/tag-revoked'), 'tag-revoked');
  assert.equal(slugDoTipo('https://x/problems/nao-existe-na-lista'), null);
  assert.equal(slugDoTipo('tag-revoked'), null);
  assert.equal(slugDoTipo(undefined), null);
});

test('Retry-After em segundos ou em data HTTP', () => {
  assert.equal(lerEspera('600'), 600);
  assert.equal(lerEspera(new Date(Date.UTC(2026, 8, 23, 12, 10)).toUTCString(), Date.UTC(2026, 8, 23, 12, 0)), 600);
  assert.equal(lerEspera(null), null);
  assert.equal(lerEspera('amanha'), null);
});

test('a tela nunca decide pelo texto: title igual, type diferente, tela diferente', () => {
  const a = telaAoAbrir(problema(404, 'tag-code-not-found'));
  const b = telaAoAbrir(problema(410, 'tag-revoked', { next_action: 'register_stray_found_report' }));
  assert.equal(a.tela, 'codigo-inexistente');
  assert.equal(b.tela, 'tag-desativada');
  assert.equal(b.tela === 'tag-desativada' && b.proximaAcao, 'register_stray_found_report');
});

test('/t/ ao abrir: cada estado do contrato', () => {
  const ok: Resultado<ResolucaoDaTag> = { tipo: 'ok', status: 200, dados: { viewer: 'anonymous', pet: { display_name: 'Thor', species: 'dog', size: 'M' } } };
  assert.deepEqual(telaAoAbrir(ok).tela, 'pet');
  assert.equal(telaAoAbrir(problema(400, 'tag-code-malformed')).http, 400);
  const espere = telaAoAbrir(problema(429, 'rate-limited', {}, '600'));
  assert.equal(espere.tela, 'espere');
  assert.equal(espere.tela === 'espere' && espere.esperaSegundos, 600);
  assert.deepEqual(telaAoAbrir(falha), { tela: 'nao-abriu', http: 503 });
  assert.equal(telaAoAbrir(problema(500, 'internal')).tela, 'fora-do-ar');
  assert.equal(telaAoAbrir(resultadoDeProblema(502, '<html>', null)).tela, 'nao-abriu');
  const desconhecido = telaAoAbrir(problema(403, 'forbidden', { correlation_id: 'abc' }));
  assert.equal(desconhecido.tela, 'erro');
  assert.equal(desconhecido.tela === 'erro' && desconhecido.correlationId, 'abc');
});

test('/t/ ao avisar: 429 confirma o aviso, como o contrato manda', () => {
  const ok: Resultado<AvisoCriado> = { tipo: 'ok', status: 201, dados: { finder_token: 't', conversation_url: 'https://x/c/t', owner_notified: false, pet_display_name: 'Thor' } };
  assert.deepEqual(telaAoAvisar(ok), { tela: 'avisado', http: 200, nome: 'Thor' });
  assert.deepEqual(telaAoAvisar(problema(429, 'rate-limited')), { tela: 'recebido', http: 200 });
  assert.deepEqual(telaAoAvisar(falha), { tela: 'nao-avisou', http: 503 });
  assert.equal(telaAoAvisar(problema(410, 'tag-revoked')).tela, 'tag-desativada');
});

test('verificar e-mail: 410, 400 de token e falha de rede', () => {
  assert.equal(telaAoConfirmarEmail({ tipo: 'ok', status: 200, dados: {} }).tela, 'confirmado');
  assert.deepEqual(telaAoConfirmarEmail(problema(410, 'verification-token-expired')), { tela: 'expirado', http: 410 });
  assert.deepEqual(telaAoConfirmarEmail(problema(400, 'validation-failed')), { tela: 'expirado', http: 400 });
  assert.deepEqual(telaAoConfirmarEmail(falha), { tela: 'nao-confirmou', http: 503 });
});

test('redefinir senha: o motivo da recusa sai de errors[].code, nunca do texto', () => {
  assert.equal(telaAoConferirLink({ tipo: 'ok', status: 200, dados: { valid: true } }).tela, 'formulario');
  assert.equal(telaAoConferirLink(problema(410, 'verification-token-expired')).tela, 'expirado');
  assert.equal(telaAoConferirLink(falha).tela, 'nao-conferiu');
  const vazada = telaAoSalvarSenha(problema(422, 'weak-password', { errors: [{ field: 'new_password', code: 'breached', message: 'texto do servidor' }] }));
  assert.deepEqual(vazada, { tela: 'formulario-com-erro', http: 422, codigo: 'breached' });
  const estranho = telaAoSalvarSenha(problema(422, 'weak-password', { errors: [{ field: 'new_password', code: 'regra_nova' }] }));
  assert.equal(estranho.tela === 'formulario-com-erro' && estranho.codigo, 'desconhecido');
  assert.equal(telaAoSalvarSenha(problema(400, 'validation-failed', { errors: [{ field: 'token', code: 'minLength' }] })).tela, 'expirado');
  assert.equal(telaAoSalvarSenha(falha).tela, 'nao-salvou');
  assert.equal(telaAoSalvarSenha({ tipo: 'ok', status: 204, dados: undefined }).tela, 'alterada');
});
