import { useId, useState, type ReactNode } from 'react';
import { Link } from 'react-router';

import { Icone, type NomeDoIcone } from './Icone.tsx';

type TipoDeBanner = 'erro' | 'alerta' | 'info' | 'ok';

const ICONE_DO_BANNER: Record<TipoDeBanner, NomeDoIcone> = { erro: 'error', alerta: 'warning', info: 'info', ok: 'check' };

/**
 * Banner (secao 11.6). Erro e `role="alert"`; o resto e `status`. `aoFechar`
 * poe o botao Fechar (sucesso persistente, secao 25.5).
 */
export function Banner({
  tipo,
  titulo,
  children,
  acao,
  aoFechar,
  id,
  className,
}: {
  tipo: TipoDeBanner;
  titulo?: ReactNode;
  children?: ReactNode;
  acao?: ReactNode;
  aoFechar?: () => void;
  id?: string;
  className?: string;
}) {
  return (
    <div
      className={`banner ${tipo}${className ? ` ${className}` : ''}`}
      role={tipo === 'erro' ? 'alert' : 'status'}
      {...(id ? { id } : {})}
      tabIndex={id ? -1 : undefined}
    >
      <Icone nome={ICONE_DO_BANNER[tipo]} />
      <div className="bt">
        {titulo && <span className="t-title">{titulo}</span>}
        {children && <span className="t-body-sm">{children}</span>}
      </div>
      {(acao || aoFechar) && (
        <div className="acts">
          {acao}
          {aoFechar && (
            <button type="button" className="ibtn" aria-label="Fechar aviso" onClick={aoFechar}>
              <Icone nome="close" />
            </button>
          )}
        </div>
      )}
    </div>
  );
}

export type TipoDeSelo = 'publicado' | 'rascunho' | 'retirado' | 'vencido' | 'ativo' | 'inativo' | 'ativa' | 'inativa';

const SELOS: Record<TipoDeSelo, [string, NomeDoIcone, string]> = {
  publicado: ['pub', 'check', 'Publicado'],
  rascunho: ['rasc', 'edit', 'Rascunho'],
  retirado: ['rasc', 'hide', 'Retirado'],
  vencido: ['venc', 'schedule', 'Preço vencido'],
  ativo: ['pub', 'check', 'Ativo'],
  inativo: ['rasc', 'hide', 'Inativo'],
  ativa: ['pub', 'check', 'Ativa'],
  inativa: ['rasc', 'hide', 'Inativa'],
};

export function Selo({ tipo }: { tipo: TipoDeSelo }) {
  const [classe, icone, rotulo] = SELOS[tipo];
  return (
    <span className={`selo ${classe} t-overline`}>
      <Icone nome={icone} tamanho="s16" />
      {rotulo}
    </span>
  );
}

/** Estado vazio (secao 11.10): a lista nao tem nenhum registro, sem busca nem filtro. */
export function EstadoVazio({ titulo, corpo, acao, destino }: { titulo: string; corpo: string; acao: string; destino: string }) {
  return (
    <div className="vazio">
      <div className="moldura" aria-hidden="true">
        <Icone nome="image" />
      </div>
      <h2 className="t-title-lg">{titulo}</h2>
      <p className="t-body c-sec">{corpo}</p>
      <Link className="btn sec" to={destino}>
        {acao}
      </Link>
    </div>
  );
}

/** Uma linha de carregamento da tabela (`BO/Linha · carregando`). */
export function LinhasCarregando({ linhas, colunas }: { linhas: number; colunas: string[] }) {
  return (
    <>
      {Array.from({ length: linhas }, (_, i) => (
        <tr key={i} aria-hidden="true">
          <td>
            <div className="prod">
              <span className="thumb" />
              <span className="tx" style={{ gap: 'var(--bichu-space-2)', width: '60%' }}>
                <span className="skel" style={{ width: '80%' }} />
                <span className="skel" style={{ width: '50%' }} />
              </span>
            </div>
          </td>
          {colunas.map((c) => (
            <td key={c} className={c}>
              <span className="skel" style={{ width: '60%' }} />
            </td>
          ))}
        </tr>
      ))}
    </>
  );
}

/** Campo de senha com o olho (secao 11.2.1). */
export function CampoDeSenha({
  id,
  rotulo,
  valor,
  aoMudar,
  erro,
  ajuda,
  desabilitado,
  somenteLeitura,
  autoFoco,
  referencia,
}: {
  id: string;
  rotulo: string;
  valor: string;
  aoMudar: (v: string) => void;
  erro?: string | undefined;
  ajuda?: string | undefined;
  desabilitado?: boolean;
  somenteLeitura?: boolean;
  autoFoco?: boolean;
  referencia?: React.Ref<HTMLInputElement>;
}) {
  const [visivel, setVisivel] = useState(false);
  const idDaAjuda = `${id}-ajuda`;
  return (
    <div className={erro ? 'field err' : 'field'}>
      <label htmlFor={id}>{rotulo}</label>
      <div className="pw">
        <input
          ref={referencia}
          className="input"
          id={id}
          type={visivel ? 'text' : 'password'}
          autoComplete="current-password"
          value={valor}
          onChange={(e) => aoMudar(e.target.value)}
          disabled={desabilitado}
          readOnly={somenteLeitura}
          aria-invalid={erro ? true : undefined}
          aria-describedby={erro || ajuda ? idDaAjuda : undefined}
          {...(autoFoco ? { 'data-foco-inicial': true } : {})}
        />
        <button
          type="button"
          className="ibtn"
          aria-label={visivel ? 'Ocultar senha' : 'Mostrar senha'}
          aria-pressed={visivel}
          onClick={() => setVisivel((v) => !v)}
          disabled={desabilitado}
        >
          <Icone nome={visivel ? 'hide' : 'eye'} />
        </button>
      </div>
      {erro ? (
        <span className="help err" id={idDaAjuda} aria-live="polite">
          <Icone nome="error" tamanho="s20" />
          {erro}
        </span>
      ) : (
        ajuda && (
          <span className="help" id={idDaAjuda}>
            {ajuda}
          </span>
        )
      )}
    </div>
  );
}

/** Campo de texto com rotulo, ajuda e erro ligados por `aria-describedby`. */
export function CampoDeTexto({
  id,
  rotulo,
  valor,
  aoMudar,
  erro,
  ajuda,
  contador,
  maximo,
  tipo = 'text',
  modoDeEntrada,
  autoComplete,
  somenteLeitura,
  autoFoco,
  referencia,
}: {
  id: string;
  rotulo: string;
  valor: string;
  aoMudar: (v: string) => void;
  erro?: string | undefined;
  ajuda?: string | undefined;
  contador?: boolean;
  maximo?: number;
  tipo?: 'text' | 'email' | 'url' | 'date' | 'number';
  modoDeEntrada?: 'decimal' | 'numeric' | 'url' | 'text';
  autoComplete?: string;
  somenteLeitura?: boolean;
  autoFoco?: boolean;
  referencia?: React.Ref<HTMLInputElement>;
}) {
  const idDaAjuda = `${id}-ajuda`;
  const idDoContador = `${id}-contador`;
  const descritores = [erro || ajuda ? idDaAjuda : undefined, contador ? idDoContador : undefined].filter(Boolean).join(' ');
  return (
    <div className={erro ? 'field err' : 'field'}>
      <label htmlFor={id}>{rotulo}</label>
      <input
        ref={referencia}
        className="input"
        id={id}
        type={tipo}
        value={valor}
        onChange={(e) => aoMudar(e.target.value)}
        {...(maximo ? { maxLength: maximo } : {})}
        {...(modoDeEntrada ? { inputMode: modoDeEntrada } : {})}
        {...(autoComplete ? { autoComplete } : {})}
        readOnly={somenteLeitura}
        aria-invalid={erro ? true : undefined}
        aria-describedby={descritores || undefined}
        {...(autoFoco ? { 'data-foco-inicial': true } : {})}
      />
      {erro ? (
        <span className="help err" id={idDaAjuda}>
          <Icone nome="error" tamanho="s20" />
          {erro}
        </span>
      ) : (
        ajuda && (
          <span className="help" id={idDaAjuda}>
            {ajuda}
          </span>
        )
      )}
      {contador && maximo && (
        <span className="help contador" id={idDoContador}>
          {valor.length}/{maximo}
        </span>
      )}
    </div>
  );
}

/** Mensagem de erro de um grupo (fieldset, galeria, seletor). */
export function ErroDoCampo({ id, children }: { id: string; children: ReactNode }) {
  return (
    <span className="help err" id={id}>
      <Icone nome="error" tamanho="s20" />
      {children}
    </span>
  );
}

/**
 * Resumo de erros no topo do formulario (3.13): um link por campo, e o foco
 * vai para o resumo quando ele aparece.
 */
export function ResumoDeErros({
  titulo,
  erros,
  referencia,
}: {
  titulo: string;
  erros: { campo: string; rotulo: string }[];
  referencia: React.Ref<HTMLDivElement>;
}) {
  const id = useId();
  return (
    <div ref={referencia} className="banner erro" role="alert" tabIndex={-1} aria-labelledby={id}>
      <Icone nome="error" />
      <div className="bt">
        <span className="t-title" id={id}>
          {titulo}
        </span>
        <span className="links t-body-sm">
          {erros.map((e) => (
            <a
              key={e.campo}
              className="link"
              href={`#${e.campo}`}
              onClick={(ev) => {
                ev.preventDefault();
                document.getElementById(e.campo)?.focus();
              }}
            >
              {e.rotulo}
            </a>
          ))}
        </span>
      </div>
    </div>
  );
}
