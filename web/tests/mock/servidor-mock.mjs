#!/usr/bin/env node
// Mock da API gerado DO CONTRATO (api/openapi.yaml), para o teste de ponta a
// ponta e para o orcamento por rota (ADR-0028, item 10).
//
// "Gerado do contrato, sem resposta inventada" quer dizer, aqui:
//   - as rotas sao as de `paths` do contrato, com o prefixo /v1 de `servers`;
//     caminho fora do contrato responde 404 not-found e fica registrado como erro;
//   - o corpo de sucesso e o `example` do contrato quando o cenario pede um, ou
//     e sintetizado do `schema` da resposta (campos obrigatorios, valor do tipo);
//   - o corpo de erro e o `Problem` do contrato, com `type` montado de
//     `x-problem-types`, e o status PRECISA ser o que a lista fechada declara
//     para aquele tipo;
//   - `sobrescrever` so aceita campo que existe no schema da resposta: o mock
//     recusa subir um cenario com campo que o contrato nao tem;
//   - cabecalho obrigatorio (`Idempotency-Key`) e campo obrigatorio do corpo, com
//     `minLength`, sao conferidos como o contrato declara, e a falta vira o 400
//     `validation-failed` que a API responderia.
//
// O cenario (qual resposta do contrato sai para qual codigo ou token) esta em
// `cenarios.mjs`. Cada chamada recebida fica em GET /__mock/pedidos, para o
// teste conferir o que o site mandou (Idempotency-Key, X-Forwarded-For).
//
//   node tests/mock/servidor-mock.mjs [porta]      (padrao 4399)

import { createServer } from 'node:http';
import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { parse } from 'yaml';
import { CENARIOS } from './cenarios.mjs';

const AQUI = dirname(fileURLToPath(import.meta.url));
const CONTRATO = resolve(AQUI, '../../../api/openapi.yaml');
const contrato = parse(readFileSync(CONTRATO, 'utf8'));
const DOMINIO = contrato.servers?.[0]?.variables?.dominio?.default ?? 'dominio-a-definir.com.br';
const TIPOS = new Map((contrato['x-problem-types'] ?? []).map((t) => [t.slug, t.status]));

function resolver(no) {
  if (no && typeof no === 'object' && typeof no.$ref === 'string') {
    const caminho = no.$ref.replace(/^#\//, '').split('/');
    let alvo = contrato;
    for (const parte of caminho) alvo = alvo?.[parte];
    if (!alvo) throw new Error(`$ref sem alvo no contrato: ${no.$ref}`);
    return resolver(alvo);
  }
  return no;
}

// ---------------------------------------------------------------- rotas do contrato
const ROTAS = [];
for (const [modelo, item] of Object.entries(contrato.paths)) {
  for (const metodo of ['get', 'post', 'put', 'patch', 'delete']) {
    const op = item[metodo];
    if (!op) continue;
    const nomes = [];
    const regex = new RegExp(
      `^/v1${modelo.replace(/[.*+?^$()|[\]\\]/g, '\\$&').replace(/\\?\{([^}]+)\\?\}/g, (_, n) => {
        nomes.push(n);
        return '([^/]+)';
      })}$`,
    );
    const parametros = [...(item.parameters ?? []), ...(op.parameters ?? [])].map(resolver);
    ROTAS.push({ metodo: metodo.toUpperCase(), modelo, regex, nomes, op, parametros });
  }
}

// ---------------------------------------------------------------- sintese pelo schema
function sintetizar(schema) {
  const s = resolver(schema) ?? {};
  if (s.example !== undefined) return s.example;
  if (Array.isArray(s.enum)) return s.enum[0];
  const tipo = Array.isArray(s.type) ? s.type.find((t) => t !== 'null') : s.type;
  if (s.properties || tipo === 'object') {
    const obj = {};
    for (const campo of s.required ?? []) obj[campo] = sintetizar(s.properties?.[campo] ?? {});
    return obj;
  }
  if (s.allOf) return Object.assign({}, ...s.allOf.map(sintetizar));
  if (s.oneOf || s.anyOf) return sintetizar((s.oneOf ?? s.anyOf)[0]);
  switch (tipo) {
    case 'string':
      if (s.format === 'uri') return `https://${DOMINIO}/exemplo`;
      if (s.format === 'uuid') return '018f7c1e-7a2b-7c3d-9e4f-2b1a0c9d8e7f';
      if (s.format === 'date-time') return '2026-09-23T12:00:00Z';
      if (s.format === 'email') return 'nome@exemplo.com.br';
      return 'string';
    case 'integer':
    case 'number':
      return s.minimum ?? 0;
    case 'boolean':
      return true;
    case 'array':
      return [];
    default:
      return null;
  }
}

function camposDoSchema(schema) {
  const s = resolver(schema) ?? {};
  const campos = new Map(Object.entries(s.properties ?? {}));
  for (const parte of s.allOf ?? []) for (const [k, v] of camposDoSchema(parte)) campos.set(k, v);
  return campos;
}

/** Aplica `sobrescrever` recusando campo que o schema nao declara (inclusive aninhado). */
function sobrescrever(corpo, mudancas, schema, onde) {
  const campos = camposDoSchema(schema);
  for (const [campo, valor] of Object.entries(mudancas ?? {})) {
    if (!campos.has(campo)) throw new Error(`cenario ${onde}: o campo "${campo}" nao existe no schema do contrato`);
    const sub = resolver(campos.get(campo));
    if (valor && typeof valor === 'object' && !Array.isArray(valor) && sub?.properties) {
      corpo[campo] = sobrescrever({ ...(corpo[campo] ?? {}) }, valor, sub, `${onde}.${campo}`);
    } else {
      corpo[campo] = valor;
    }
  }
  return corpo;
}

function problema(slug, extra, onde) {
  const status = TIPOS.get(slug);
  if (!status) throw new Error(`cenario ${onde}: o tipo "${slug}" nao existe em x-problem-types`);
  const esquema = resolver(contrato.components.schemas.Problem);
  const corpo = {
    type: `https://${DOMINIO}/problems/${slug}`,
    title: slug,
    status,
    correlation_id: '018f7c1e-7a2b-7c3d-9e4f-2b1a0c9d8e7f',
  };
  if (extra?.next_action) {
    const valores = resolver(esquema.properties.next_action).enum;
    if (!valores.includes(extra.next_action)) throw new Error(`cenario ${onde}: next_action "${extra.next_action}" fora do enum do contrato`);
  }
  return { status, corpo: sobrescrever(corpo, extra, esquema, onde) };
}

// ---------------------------------------------------------------- validacao do pedido
function validarPedido(rota, cabecalhos, corpo) {
  for (const p of rota.parametros) {
    if (p.in === 'header' && p.required && !cabecalhos[p.name.toLowerCase()]) {
      return { campo: p.name, codigo: 'required' };
    }
  }
  const esquemaCorpo = resolver(rota.op.requestBody)?.content?.['application/json']?.schema;
  if (esquemaCorpo) {
    const s = resolver(esquemaCorpo);
    for (const campo of s.required ?? []) {
      const valor = corpo?.[campo];
      if (valor === undefined || valor === null || valor === '') return { campo, codigo: 'required' };
      const prop = resolver(s.properties?.[campo]);
      if (typeof valor === 'string' && prop?.minLength && valor.length < prop.minLength) return { campo, codigo: 'minLength' };
    }
  }
  return null;
}

// ---------------------------------------------------------------- resposta de um cenario
function responder(rota, cenario, onde) {
  const declaradas = rota.op.responses ?? {};
  if (cenario.slug) {
    const { status, corpo } = problema(cenario.slug, cenario.sobrescrever, onde);
    if (!declaradas[String(status)] && !cenario.foraDaOperacao && cenario.slug !== 'internal') {
      throw new Error(`cenario ${onde}: ${rota.op.operationId} nao declara ${status} (use foraDaOperacao para simular resposta inesperada)`);
    }
    const exemplo = cenario.exemplo
      ? resolver(declaradas[String(status)])?.content?.['application/problem+json']?.examples?.[cenario.exemplo]?.value
      : null;
    if (cenario.exemplo && !exemplo) throw new Error(`cenario ${onde}: exemplo "${cenario.exemplo}" nao existe no contrato`);
    return { status, tipo: 'application/problem+json', corpo: exemplo ?? corpo };
  }
  const status = cenario.status;
  const resposta = resolver(declaradas[String(status)]);
  if (!resposta) throw new Error(`cenario ${onde}: ${rota.op.operationId} nao declara ${status}`);
  const conteudo = resposta.content?.['application/json'];
  if (!conteudo) return { status, tipo: null, corpo: null };
  let corpo;
  if (cenario.exemplo) {
    corpo = structuredClone(conteudo.examples?.[cenario.exemplo]?.value);
    if (corpo === undefined) throw new Error(`cenario ${onde}: exemplo "${cenario.exemplo}" nao existe no contrato`);
  } else {
    corpo = sintetizar(conteudo.schema);
  }
  return { status, tipo: 'application/json', corpo: sobrescrever(corpo, cenario.sobrescrever, conteudo.schema, onde) };
}

// Confere todos os cenarios na subida: cenario que o contrato nao sustenta derruba o mock.
for (const [operacao, porChave] of Object.entries(CENARIOS)) {
  const rota = ROTAS.find((r) => r.op.operationId === operacao);
  if (!rota) throw new Error(`cenarios.mjs: a operacao ${operacao} nao existe no contrato`);
  for (const [chave, cenario] of Object.entries(porChave)) responder(rota, cenario, `${operacao}[${chave}]`);
}

const pedidos = [];

async function lerCorpo(req) {
  const partes = [];
  for await (const p of req) partes.push(p);
  const texto = Buffer.concat(partes).toString('utf8');
  if (!texto) return undefined;
  try {
    return JSON.parse(texto);
  } catch {
    return Symbol.for('invalido');
  }
}

const servidor = createServer(async (req, res) => {
  const url = new URL(req.url ?? '/', 'http://mock');
  if (url.pathname === '/__mock/pedidos') {
    if (req.method === 'DELETE') pedidos.length = 0;
    res.setHeader('Content-Type', 'application/json');
    return res.end(JSON.stringify(pedidos));
  }
  const corpo = await lerCorpo(req);
  const rota = ROTAS.find((r) => r.metodo === req.method && r.regex.test(url.pathname));
  const registro = { metodo: req.method, caminho: url.pathname, operacao: rota?.op.operationId ?? null, cabecalhos: req.headers, corpo };
  pedidos.push(registro);

  const enviar = ({ status, tipo, corpo: c, cabecalhos = {} }) => {
    res.statusCode = status;
    if (tipo) res.setHeader('Content-Type', tipo);
    for (const [k, v] of Object.entries(cabecalhos)) res.setHeader(k, v);
    res.end(c === null || c === undefined ? undefined : JSON.stringify(c));
  };

  if (!rota) {
    registro.erro = 'caminho fora do contrato';
    return enviar({ ...problema('not-found', null, 'rota'), tipo: 'application/problem+json' });
  }
  const params = Object.fromEntries(rota.nomes.map((n, i) => [n, decodeURIComponent(rota.regex.exec(url.pathname)[i + 1])]));
  const invalido = validarPedido(rota, req.headers, corpo);
  if (invalido || corpo === Symbol.for('invalido')) {
    const { status, corpo: p } = problema('validation-failed', { errors: [{ field: invalido?.campo ?? 'body', code: invalido?.codigo ?? 'json' }] }, 'validacao');
    return enviar({ status, tipo: 'application/problem+json', corpo: p });
  }

  const porChave = CENARIOS[rota.op.operationId] ?? {};
  const chave = params.code ?? params.token ?? corpo?.token ?? '';
  const cenario = porChave[`${chave}|${corpo?.new_password ?? ''}`] ?? porChave[chave] ?? porChave['*'];
  if (!cenario) {
    registro.erro = 'sem cenario';
    return enviar({ ...problema('not-found', null, 'sem-cenario'), tipo: 'application/problem+json' });
  }
  if (cenario.atrasoMs) await new Promise((r) => setTimeout(r, cenario.atrasoMs));
  const resposta = responder(rota, cenario, rota.op.operationId);
  return enviar({ ...resposta, cabecalhos: cenario.cabecalhos });
});

const porta = Number(process.argv[2] ?? process.env.PORTA_MOCK ?? 4399);
servidor.listen(porta, '127.0.0.1', () => {
  process.stdout.write(`mock do contrato em http://127.0.0.1:${porta}/v1 (${ROTAS.length} operacoes, cenarios conferidos)\n`);
});
for (const sinal of ['SIGTERM', 'SIGINT']) process.on(sinal, () => servidor.close(() => process.exit(0)));
