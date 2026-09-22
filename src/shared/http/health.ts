/**
 * Sonda de saúde.
 *
 * Única operação pública sem teto de chamadas, e a ausência é deliberada: quem
 * chama é a sonda do balanceador e do orquestrador, e limitar a sonda faz o
 * serviço ser tirado de rotação justamente sob carga, que é quando ele precisa
 * continuar respondendo.
 *
 * A proteção aqui é **não expor nada**: sem versão de dependência, sem nome de
 * host, sem string de conexão, sem contagem de registro. E a sonda toca o banco
 * de verdade — sonda que não sonda nada sempre responde que está tudo bem.
 *
 * `build` é a única exceção, e ela é estreita de propósito. `version` vem do
 * `package.json` e é o mesmo `0.1.0` em qualquer build desde que alguém
 * escreveu aquele número: ela não distingue destino, nem data, nem código. Sem
 * um identificador que VIAJE com o artefato, "os dois destinos rodam a mesma
 * coisa" é palavra (critério 12 de BICHUS-13). O que entra aqui é um resumo do
 * conteúdo do próprio artefato e um commit declarado — nenhum dos dois diz nada
 * sobre a máquina, a rede ou o banco. Ver `shared/artefato/identidade-do-artefato`.
 */
import type { FastifyReply, FastifyRequest } from 'fastify';
import { defineRoute } from './route-definition.js';
import { registrarRota, type RegistradorDeRotas } from './registrar-rota.js';
import { problemas } from './errors.js';
import { responderProblema } from './server.js';
import type { AbsoluteUrl } from '../types/brands.js';
import type { IdentidadeDoArtefato } from '../artefato/identidade-do-artefato.js';

export const rotaDeSaude = defineRoute({
  operationId: 'health',
  method: 'get',
  path: '/health',
  effects: [],
});

export interface DependenciasDaSaude {
  readonly version: string;
  /**
   * Identidade do artefato, calculada UMA VEZ na subida e não por requisição:
   * ela resume arquivos em disco, e o disco não muda debaixo de um processo em
   * execução. Calcular por requisição transformaria a sonda — que o
   * orquestrador chama a cada 10 segundos — em leitura de `dist/` inteiro.
   */
  readonly build: IdentidadeDoArtefato;
  readonly problemBaseUrl: AbsoluteUrl;
  readonly verificacoes: Readonly<Record<string, () => Promise<void>>>;
}

export function registrarSaude(app: RegistradorDeRotas, deps: DependenciasDaSaude): void {
  registrarRota(app, rotaDeSaude, {}, async (request: FastifyRequest, reply: FastifyReply) => {
    const checks: Record<string, 'ok' | 'fail'> = {};
    let saudavel = true;

    for (const [nome, verificar] of Object.entries(deps.verificacoes)) {
      try {
        await verificar();
        checks[nome] = 'ok';
      } catch (erro) {
        checks[nome] = 'fail';
        saudavel = false;
        // O motivo vai para o log, nunca para a resposta.
        request.log.error({ err: erro, check: nome }, 'verificação de saúde falhou');
      }
    }

    if (!saudavel) {
      return responderProblema(
        request,
        reply,
        problemas.sondaIndisponivel(),
        deps.problemBaseUrl,
      );
    }
    return reply.send({ status: 'ok', version: deps.version, build: deps.build, checks });
  });
}
