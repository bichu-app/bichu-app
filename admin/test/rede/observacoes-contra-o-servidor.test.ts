/**
 * O detector de tela das observacoes precisa dar a mesma resposta que o
 * servidor (`errosDasObservacoes`, D59). Este teste roda os dois lado a lado:
 * recusar no painel o que o servidor aceita trava a pessoa sem motivo (a data
 * "10.10.2026" ja foi esse caso), e aceitar o que ele recusa so adia o erro.
 *
 * Le o dominio do servidor direto do repositorio: o teste existe para reprovar
 * quando os dois lados se afastarem, e so pode fazer isso olhando para os dois.
 */
import { describe, expect, it } from 'vitest';

import { errosDasObservacoes } from '../../../src/modules/network/domain/escrita-do-encontro.ts';
import { achadosNasObservacoes } from '../../src/rede/dominio/observacoes.ts';

const CASOS = [
  // datas, horarios e numeros curtos: complemento comum
  'Encontro em 10/10/2026, das 9h às 11h.',
  'Até 10 filhotes por turma.',
  'Traga água; a praça tem pouca sombra depois das 10h.',
  'Ponto de encontro ao lado do lago.',
  'Encontro na Praça Benedito Calixto, perto do coreto.',
  'Portão 3 do parque.',
  // contato e pagamento
  'Chama no (11) 98765-4321',
  'zap 11987654321',
  'liga 11 9 8765 4321',
  'nove nove oito sete seis cinco quatro tres dois',
  'com largura zero 1​1​9​8​7​6​5​4​3',
  'dígitos de largura total １１９８７６５４３２１',
  'escreve para ana@exemplo.com.br',
  'ana arroba exemplo ponto com',
  'inscrição em https://exemplo.com/x',
  'veja www.exemplo.com',
  'site exemplo.com.br',
  'paga no Pix antes',
  'chave 123e4567-e89b-12d3-a456-426614174000',
  'CPF 123.456.789-09',
  'fica na Rua das Flores, 123',
  'Av. Paulista perto do metrô',
  'Praça Benedito Calixto, 100',
  'cep 01234-000',
  // o caso do QA: data com pontos
  'Encontro em 10.10.2026, até 12h.',
  'Remarcado de 03.10.2026 para 10.10.2026.',
];

describe('observações: painel e servidor dão a mesma resposta', () => {
  it.each(CASOS)('%s', (texto) => {
    const servidor = errosDasObservacoes('notes', texto).length > 0;
    const painel = achadosNasObservacoes(texto).length > 0;
    expect(painel, `servidor ${servidor ? 'recusa' : 'aceita'}`).toBe(servidor);
  });
});
