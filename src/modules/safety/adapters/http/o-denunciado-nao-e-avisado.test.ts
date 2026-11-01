import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

import {
  AVISOS_PROIBIDOS,
  PRAZOS_PROIBIDOS,
  O_QUE_O_DENUNCIANTE_RECEBE,
} from '../../domain/o-denunciado-nao-e-avisado.js';

const MODULO = join('src', 'modules', 'safety');

function arquivosDoModulo(dir = MODULO): readonly string[] {
  const achados: string[] = [];
  for (const entrada of readdirSync(dir, { withFileTypes: true })) {
    const caminho = join(dir, entrada.name);
    if (entrada.isDirectory()) achados.push(...arquivosDoModulo(caminho));
    else if (entrada.name.endsWith('.ts') && !entrada.name.startsWith('o-denunciado-nao-e-avisado'))
      achados.push(caminho);
  }
  return achados;
}

function semComentario(texto: string): readonly { linha: number; codigo: string }[] {
  const linhas = texto.split('\n');
  const limpas: { linha: number; codigo: string }[] = [];
  let emBloco = false;
  linhas.forEach((bruta, i) => {
    let linha = bruta;
    if (emBloco) {
      const fim = linha.indexOf('*/');
      if (fim < 0) return;
      linha = linha.slice(fim + 2);
      emBloco = false;
    }
    for (;;) {
      const abre = linha.indexOf('/*');
      if (abre < 0) break;
      const fecha = linha.indexOf('*/', abre + 2);
      if (fecha < 0) {
        linha = linha.slice(0, abre);
        emBloco = true;
        break;
      }
      linha = linha.slice(0, abre) + linha.slice(fecha + 2);
    }
    const barra = linha.indexOf('//');
    if (barra >= 0) linha = linha.slice(0, barra);
    if (linha.trim() !== '') limpas.push({ linha: i + 1, codigo: linha });
  });
  return limpas;
}

function ocorrencias(nomes: readonly string[], arquivos: readonly string[]): readonly string[] {
  const achados: string[] = [];
  for (const arquivo of arquivos) {
    for (const { linha, codigo } of semComentario(readFileSync(arquivo, 'utf8'))) {
      for (const nome of nomes) {
        const padrao = new RegExp(`(^|[^\\p{L}\\p{N}_])${nome.replace(/ /gu, '[ _]')}($|[^\\p{L}\\p{N}_])`, 'iu');
        if (padrao.test(codigo)) achados.push(`${arquivo}:${String(linha)} — ${nome}`);
      }
    }
  }
  return achados;
}

void describe('o denunciado não é avisado', () => {
  const arquivos = arquivosDoModulo();

  void it('o módulo tem arquivo: varredura sobre pasta vazia não aprova nada', () => {
    assert.ok(arquivos.length >= 5, `só ${String(arquivos.length)} arquivos varridos em ${MODULO}`);
  });

  void it('nenhum arquivo do módulo nomeia aviso ao denunciado', () => {
    assert.deepEqual(
      ocorrencias(AVISOS_PROIBIDOS, arquivos),
      [],
      'alguém acrescentou um caminho de aviso ao denunciado. Avisar o denunciado é ' +
        'RETALIAÇÃO: quem denuncia um assediador e vê o assediador receber "você foi ' +
        'denunciado" acaba de entregar a ele a informação de que reagiu. O lugar do ' +
        'conserto é apagar o aviso, não esta lista.',
    );
  });

  void it('nenhum arquivo do módulo promete prazo', () => {
    assert.deepEqual(
      ocorrencias(PRAZOS_PROIBIDOS, arquivos),
      [],
      'alguém prometeu prazo. NÃO EXISTE PRAZO: não há equipe de moderação de plantão, ' +
        'e o que faz a denúncia valer sem prazo é a ocultação imediata, que é filtro de ' +
        'leitura no banco.',
    );
  });

  void it('a porta do módulo não tem método de aviso, e por isso avisar não é exprimível', () => {
    const canais = ['push', 'notificar', 'notification', 'sendMail', 'enviarEmail', 'notificacao'];
    assert.deepEqual(
      ocorrencias(canais, [join(MODULO, 'ports', 'safety-repository.ts')]),
      [],
      'a porta ganhou um canal de saída: avisar o denunciado passou a ser exprimível, e ' +
        'avisar o denunciado é RETALIAÇÃO. O lugar do conserto é apagar o método.',
    );
    assert.deepEqual(
      ocorrencias(canais, [join(MODULO, 'application', 'seguranca-da-comunidade.ts')]),
      [],
      'o caso de uso ganhou uma porta de aviso',
    );
  });

  void it('a resposta ao denunciante é tudo o que ele recebe, e não carrega estado', () => {
    assert.deepEqual(O_QUE_O_DENUNCIANTE_RECEBE, { status: 'accepted' });
    assert.deepEqual(Object.keys(O_QUE_O_DENUNCIANTE_RECEBE), ['status']);
  });

  void it('ISCA POR DESLIGAMENTO: o varredor acha o nome proibido NO CÓDIGO', () => {
    const real = join(MODULO, 'domain', 'motivos-da-denuncia.ts');
    assert.ok(
      ocorrencias(['MOTIVOS_DE_PERFIL'], [real]).length > 0,
      'o varredor não achou `MOTIVOS_DE_PERFIL` no código de `motivos-da-denuncia.ts`: ' +
        'ele deixou de enxergar, e os casos acima estão verdes por isso.',
    );
    assert.deepEqual(
      ocorrencias(['notified_at'], [join(MODULO, 'ports', 'safety-repository.ts')]),
      [],
      'a porta ganhou `notified_at` no código',
    );
  });
});
