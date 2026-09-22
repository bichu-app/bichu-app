/**
 * O serviço do cadastro, sem banco e sem relógio de parede.
 *
 * Três dos casos abaixo são o motivo do arquivo, e os três são negativos:
 *
 * - **pet de outro tutor responde 404**, e não 403. Um 403 confirma que o
 *   registro existe a quem não deveria saber que ele existe.
 * - **`care_notes` chega redigido ao repositório**. A prova é feita no ponto de
 *   escrita, e não na resposta: redigir só na resposta deixaria o telefone em
 *   claro no banco, e é justamente esse o erro que o teste precisa pegar.
 * - **o teto da conta é conferido antes de gerar o id**, para que a recusa não
 *   deixe rastro.
 */
import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { PetService, TETO_DE_PETS_POR_CONTA } from './pet-service.js';
import type { EntradaDoPet } from './pet-service.js';
import type { DadosDoPet, PetGravado, PetRepository } from '../ports/pet-repository.js';
import type { AuditEvent, AuditLog } from '../../audit/ports/audit-log.js';
import type { PetId, UserId } from '../../../shared/types/brands.js';
import { dataFixa, relogioParado } from '../../../shared/time/relogio-de-teste.js';

const DONO = 'u-1' as UserId;
const OUTRO = 'u-2' as UserId;

const entradaBase: EntradaDoPet = {
  name: 'Mel',
  species: 'dog',
  breedCode: 'srd_dog',
  breedFreeText: null,
  refDataVersion: '2026-09-01',
  size: 'M',
  primaryColorCode: 'caramelo',
  secondaryColorCode: null,
  sex: 'female',
  neutered: true,
  birthDateApprox: '2020-03-01',
  distinctiveMarks: 'mancha branca no peito',
  careNotes: null,
  microchipNumber: null,
  sinpatinhasId: null,
};

const chamador = { userId: DONO, correlationId: 'c-1', ip: undefined };

class RepositorioFalso implements PetRepository {
  public criados: { dono: UserId; dados: DadosDoPet }[] = [];
  public quantos = 0;
  public guardado: PetGravado | null = null;
  public excluiu = false;

  contarDoTutor(): Promise<number> {
    return Promise.resolve(this.quantos);
  }

  conferirCodigos(): Promise<{
    especieExiste: boolean;
    porteExiste: boolean;
    racaExisteNaEspecie: boolean;
    corPrimariaExiste: boolean;
    corSecundariaExiste: boolean;
    versaoExiste: boolean;
  }> {
    return Promise.resolve({
      especieExiste: true,
      porteExiste: true,
      racaExisteNaEspecie: true,
      corPrimariaExiste: true,
      corSecundariaExiste: true,
      versaoExiste: true,
    });
  }

  criar(id: PetId, dono: UserId, dados: DadosDoPet): Promise<PetGravado> {
    this.criados.push({ dono, dados });
    return Promise.resolve({ ...dados, id, breedLabel: 'SRD', status: 'active' as const,
      slug: null, publicProfileEnabled: false, activeTagCount: 0, openCaseId: null,
      createdAt: dataFixa(), updatedAt: dataFixa() });
  }

  listarDoTutor(): Promise<readonly PetGravado[]> {
    return Promise.resolve([]);
  }

  buscarDoTutor(_pet: PetId, dono: UserId): Promise<PetGravado | null> {
    // O falso imita a cláusula WHERE vinculada da porta: dono diferente não vê.
    return Promise.resolve(dono === DONO ? this.guardado : null);
  }

  atualizar(_pet: PetId, dono: UserId, dados: DadosDoPet): Promise<PetGravado | null> {
    if (dono !== DONO || this.guardado === null) return Promise.resolve(null);
    this.criados.push({ dono, dados });
    return Promise.resolve({ ...this.guardado, ...dados });
  }

  excluir(_pet: PetId, dono: UserId): Promise<boolean> {
    if (dono !== DONO) return Promise.resolve(false);
    this.excluiu = true;
    return Promise.resolve(true);
  }
}

function montar(): { servico: PetService; repo: RepositorioFalso; eventos: AuditEvent[] } {
  const repo = new RepositorioFalso();
  const eventos: AuditEvent[] = [];
  const trilha: AuditLog = {
    record(e) {
      eventos.push(e);
      return Promise.resolve();
    },
  };
  let proximo = 0;
  const servico = new PetService({
    repositorio: repo,
    ids: {
      uuidv7: () => `pet-${(proximo += 1)}`,
      opaqueToken: () => 'x' as never,
      random128: () => new Uint8Array(16),
      random80: () => new Uint8Array(10),
    },
    clock: relogioParado(),
    trilha,
  });
  return { servico, repo, eventos };
}

void describe('cadastro do pet', () => {
  void it('grava e registra a trilha com o ator interno', async () => {
    const { servico, repo, eventos } = montar();
    const pet = await servico.criar(entradaBase, chamador);

    assert.equal(pet.id, 'pet-1');
    assert.equal(repo.criados.length, 1);
    assert.equal(eventos[0]?.action, 'pet.created');
    assert.equal(eventos[0]?.actorUserId, DONO);
  });

  void it('CARE_NOTES CHEGA REDIGIDO AO REPOSITÓRIO, e não só à resposta', async () => {
    const { servico, repo } = montar();
    await servico.criar(
      { ...entradaBase, careNotes: 'medo de fogos, liga 11987654321' },
      chamador,
    );

    const gravado = repo.criados[0]!.dados;
    assert.ok(!/\d{8}/.test(gravado.careNotes!.replace(/\D/g, '')), 'o telefone foi para o banco');
    assert.deepEqual(gravado.careNotesRedactions.map((r) => r.kind), ['phone']);
    // O resto da nota sobrevive: a redação tira o telefone, não a informação.
    assert.ok(gravado.careNotes!.includes('medo de fogos'));
  });

  void it('recusa no teto da conta ANTES de gerar o id', async () => {
    const { servico, repo } = montar();
    repo.quantos = TETO_DE_PETS_POR_CONTA;

    await assert.rejects(() => servico.criar(entradaBase, chamador), /limite de pets/i);
    assert.equal(repo.criados.length, 0, 'a recusa deixou rastro no repositório');
  });

  void it('recusa texto livre junto de raça da lista, com o campo nomeado', async () => {
    const { servico } = montar();
    await assert.rejects(
      () => servico.criar({ ...entradaBase, breedCode: 'shih_tzu', breedFreeText: 'poodle' }, chamador),
      (e: Error & { errors?: { field: string }[] }) => {
        assert.equal(e.errors?.[0]?.field, 'breed_free_text');
        return true;
      },
    );
  });
});

void describe('códigos de referência inválidos', () => {
  /**
   * Cada ramo destes existe para que o erro seja `validation-failed` **com o
   * nome do campo**, e não a violação de `CHECK` que o banco devolveria como
   * 500. A pessoa que digitou um código inválido precisa saber qual campo
   * recusar, e "erro interno" não diz nada a ninguém.
   */
  const casos: { nome: string; ausente: string; campo: string }[] = [
    { nome: 'espécie desconhecida', ausente: 'especieExiste', campo: 'species' },
    { nome: 'porte desconhecido', ausente: 'porteExiste', campo: 'size' },
    { nome: 'raça de outra espécie', ausente: 'racaExisteNaEspecie', campo: 'breed_code' },
    { nome: 'cor primária desconhecida', ausente: 'corPrimariaExiste', campo: 'primary_color_code' },
    { nome: 'cor secundária desconhecida', ausente: 'corSecundariaExiste', campo: 'secondary_color_code' },
    { nome: 'versão de lista desconhecida', ausente: 'versaoExiste', campo: 'ref_data_version' },
  ];

  for (const caso of casos) {
    void it(`${caso.nome} nomeia o campo ${caso.campo}`, async () => {
      const { servico, repo } = montar();
      repo.conferirCodigos = () =>
        Promise.resolve({
          especieExiste: true,
          porteExiste: true,
          racaExisteNaEspecie: true,
          corPrimariaExiste: true,
          corSecundariaExiste: true,
          versaoExiste: true,
          [caso.ausente]: false,
        } as never);

      await assert.rejects(
        () => servico.criar(entradaBase, chamador),
        (e: Error & { problemType?: string; errors?: { field: string }[] }) => {
          assert.equal(e.problemType, 'validation-failed');
          assert.ok(
            e.errors?.some((x) => x.field === caso.campo),
            `o campo ${caso.campo} não foi nomeado`,
          );
          return true;
        },
      );
      assert.equal(repo.criados.length, 0, 'gravou apesar do código inválido');
    });
  }

  void it('vários inválidos de uma vez saem JUNTOS, e não um por vez', async () => {
    // Devolver o primeiro e esconder os outros faz a pessoa corrigir, reenviar,
    // e descobrir o próximo — uma vez por campo.
    const s = montar();
    s.repo.conferirCodigos = () =>
      Promise.resolve({
        especieExiste: false,
        porteExiste: false,
        racaExisteNaEspecie: true,
        corPrimariaExiste: true,
        corSecundariaExiste: true,
        versaoExiste: true,
      });

    await assert.rejects(
      () => s.servico.criar(entradaBase, chamador),
      (e: Error & { errors?: { field: string }[] }) => {
        assert.equal(e.errors?.length, 2);
        return true;
      },
    );
  });
});

void describe('listar e excluir', () => {
  void it('listar devolve o que o repositório tem', async () => {
    const { servico } = montar();
    assert.deepEqual(await servico.listar(chamador), []);
  });

  void it('excluir o próprio pet registra a trilha', async () => {
    const { servico, repo, eventos } = montar();
    await servico.excluir('p-1' as PetId, chamador);
    assert.equal(repo.excluiu, true);
    assert.equal(eventos[0]?.action, 'pet.deleted');
  });

  void it('atualizar o próprio pet registra a trilha', async () => {
    const { servico, repo, eventos } = montar();
    repo.guardado = {
      ...entradaBase,
      id: 'p-1' as PetId,
      careNotesRedactions: [],
      breedLabel: 'SRD',
      status: 'active',
      slug: null,
      publicProfileEnabled: false,
      activeTagCount: 0,
      openCaseId: null,
      createdAt: dataFixa(),
      updatedAt: dataFixa(),
    };
    await servico.atualizar('p-1' as PetId, entradaBase, chamador);
    assert.equal(eventos[0]?.action, 'pet.updated');
  });

  void it('buscar o próprio pet devolve o que está gravado', async () => {
    const { servico, repo } = montar();
    repo.guardado = {
      ...entradaBase,
      id: 'p-1' as PetId,
      careNotesRedactions: [],
      breedLabel: 'SRD',
      status: 'active',
      slug: null,
      publicProfileEnabled: false,
      activeTagCount: 0,
      openCaseId: null,
      createdAt: dataFixa(),
      updatedAt: dataFixa(),
    };
    assert.equal((await servico.buscar('p-1' as PetId, chamador)).id, 'p-1');
  });
});

void describe('cadastro do pet — pet de outro tutor', () => {
  void it('BUSCAR responde 404, e não 403', async () => {
    const { servico, repo } = montar();
    repo.guardado = null;
    await assert.rejects(
      () => servico.buscar('p-1' as PetId, { ...chamador, userId: OUTRO }),
      (e: Error & { problemType?: string; status?: number }) => {
        assert.equal(e.problemType, 'not-found', 'um 403 confirmaria que o pet existe');
        assert.equal(e.status, 404);;
        return true;
      },
    );
  });

  void it('ATUALIZAR responde 404, e não 403', async () => {
    const { servico } = montar();
    await assert.rejects(
      () => servico.atualizar('p-1' as PetId, entradaBase, { ...chamador, userId: OUTRO }),
      (e: Error & { problemType?: string; status?: number }) => {
        assert.equal(e.problemType, 'not-found');
        assert.equal(e.status, 404);
        return true;
      },
    );
  });

  void it('EXCLUIR responde 404, e não apaga nada', async () => {
    const { servico, repo } = montar();
    await assert.rejects(
      () => servico.excluir('p-1' as PetId, { ...chamador, userId: OUTRO }),
      (e: Error & { problemType?: string; status?: number }) => {
        assert.equal(e.problemType, 'not-found');
        assert.equal(e.status, 404);
        return true;
      },
    );
    assert.equal(repo.excluiu, false);
  });
});
