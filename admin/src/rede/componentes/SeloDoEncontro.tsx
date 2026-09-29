import { Icone, type NomeDoIcone } from '../../componentes/Icone.tsx';
import { SELOS, seloDoEncontro, type Selo } from '../dominio/lista.ts';
import type { Encontro } from '../dominio/tipos.ts';
import estilos from '../rede.module.css';

const ICONE: Record<Selo, NomeDoIcone> = {
  agendado: 'schedule',
  agora: 'groups',
  encerrado: 'check',
  cancelado: 'close',
  removido: 'delete',
};

/**
 * AGENDADO, ACONTECENDO AGORA e ENCERRADO sao os textos do app (UX 29.5);
 * CANCELADO usa o par neutro invertido, como no app (25.5.2), porque a cor de
 * urgencia e do pet perdido.
 */
export function SeloDoEncontro({ encontro }: { encontro: Pick<Encontro, 'publication_status' | 'timing'> }) {
  const tipo = seloDoEncontro(encontro);
  return (
    <span className={`selo t-overline ${estilos[`selo-${tipo}`] ?? ''}`}>
      <Icone nome={ICONE[tipo]} tamanho="s16" />
      {SELOS[tipo]}
    </span>
  );
}
