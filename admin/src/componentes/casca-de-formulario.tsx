import { useCallback, useEffect, useLayoutEffect, useRef, useState, type ReactNode } from 'react';
import { Link } from 'react-router';

import { Banner, ResumoDeErros } from './basicos.tsx';
import { Icone } from './Icone.tsx';
import { useSessao } from '../sessao/ProvedorDeSessao.tsx';
import { guardarRascunho } from '../sessao/rascunho.ts';

/** O estado de uma tela que carrega um registro antes de poder editar. */
export type FaseDaCarga = 'carregando' | 'pronto' | 'erro' | 'nao-encontrado';

/** O que a carga GRAVA: `carregando` e derivado, nunca guardado. */
export type FaseGravada = 'pronto' | 'erro' | 'nao-encontrado';

/** A falha de gravacao que o formulario mostra em banner, acima dos campos. */
export interface FalhaDoFormulario {
  texto: string;
  /** Oferece `Recarregar` no banner (conflito de versao). */
  recarregar?: boolean;
  /** Azul em vez de vermelho: nada deu errado, so nao havia o que gravar. */
  informativo?: boolean;
}

/**
 * Guarda o formulario no rascunho da sessao.
 *
 * O `valores` entra por referencia viva: o callback registrado le o ULTIMO
 * valor renderizado, e nao o da renderizacao em que foi registrado. O
 * `paraGuardar` recorta o que nao sobrevive a recarga (arquivo, previa `blob:`).
 */
export function useRascunhoDoFormulario<V>(
  rota: string,
  valores: V,
  paraGuardar?: (v: V) => unknown,
): void {
  const { registrarRascunho } = useSessao();
  const valoresRef = useRef(valores);
  const recorteRef = useRef(paraGuardar);
  useLayoutEffect(() => {
    valoresRef.current = valores;
    recorteRef.current = paraGuardar;
  });
  useEffect(
    () =>
      registrarRascunho(() => {
        const recorte = recorteRef.current;
        guardarRascunho(rota, recorte ? recorte(valoresRef.current) : valoresRef.current);
      }),
    [registrarRascunho, rota],
  );
}

/**
 * A carga de um registro por CHAVE, com recarga.
 *
 * A chave junta a identidade do registro com um contador de recarga, e e ela
 * que decide se o que esta na tela pertence a esta carga: resposta de carga
 * velha que chega depois nao pinta a tela nova. `identidade` indefinida quer
 * dizer "nada a carregar" (cadastro novo), e a fase ja nasce `pronto` --
 * `carregaSempre` existe para a tela que busca dado de apoio mesmo no cadastro
 * novo.
 */
export function useCargaDoFormulario(
  identidade: string | undefined,
  opcoes?: { carregaSempre?: boolean },
): {
  chave: string;
  fase: FaseDaCarga;
  definir: (carga: { chave: string; fase: FaseGravada }) => void;
  recarregar: () => void;
} {
  const [carga, setCarga] = useState<{ chave: string; fase: FaseGravada }>();
  const [versao, setVersao] = useState(0);
  const chave = `${identidade ?? 'novo'}#${String(versao)}`;
  const fase: FaseDaCarga =
    identidade === undefined && opcoes?.carregaSempre !== true
      ? 'pronto'
      : carga?.chave === chave
        ? carga.fase
        : 'carregando';
  const recarregar = useCallback(() => setVersao((n) => n + 1), []);
  return { chave, fase, definir: setCarga, recarregar };
}

/**
 * Roda UMA carga e grava a fase que ela produziu.
 *
 * O que estava copiado em cada formulario era isto: abrir o `AbortController`,
 * conferir `aborted` antes de pintar, mandar a fase de erro no `catch` e
 * devolver a limpeza do efeito. O `tentar` devolve a fase, ou `undefined`
 * quando nao ha o que pintar (a carga foi descartada no meio).
 *
 * Fica FORA de `useEffect` de proposito: cada tela mantem o seu efeito e as
 * suas dependencias, porque e la que se sabe o que faz a carga valer de novo.
 */
export function carregarPorChave(
  chave: string,
  definir: (carga: { chave: string; fase: FaseGravada }) => void,
  tentar: (sinal: AbortSignal) => Promise<FaseGravada | undefined>,
): () => void {
  const controle = new AbortController();
  tentar(controle.signal)
    .then((fase) => {
      if (fase !== undefined && !controle.signal.aborted) definir({ chave, fase });
    })
    .catch(() => {
      if (!controle.signal.aborted) definir({ chave, fase: 'erro' });
    });
  return () => controle.abort();
}

/**
 * A referencia do resumo de erros e o foco nele.
 *
 * O foco vai num `requestAnimationFrame` porque o resumo so existe no DOM
 * depois da pintura que o erro causou.
 */
export function useResumoDeErros(): {
  referencia: React.RefObject<HTMLDivElement | null>;
  focar: () => void;
} {
  const referencia = useRef<HTMLDivElement>(null);
  const focar = useCallback(() => {
    requestAnimationFrame(() => referencia.current?.focus());
  }, []);
  return { referencia, focar };
}

/** O `Voltar para X` que abre toda tela de formulario. */
export function VoltarPara({
  para,
  children,
  className,
}: {
  para: string;
  children: ReactNode;
  className?: string;
}) {
  return (
    <Link className={`btn ghost voltar${className ? ` ${className}` : ''}`} to={para}>
      <Icone nome="back" tamanho="s20" />
      {children}
    </Link>
  );
}

/**
 * A tela de quem nao conseguiu carregar: o voltar continua la, porque a pessoa
 * precisa de saida mesmo quando nada carregou.
 */
export function CargaQueFalhou({
  voltar,
  children,
  aoAtualizar,
}: {
  voltar: ReactNode;
  children: ReactNode;
  /** Quando dado, o banner oferece `Atualizar` (erro de rede, nao 404). */
  aoAtualizar?: (() => void) | undefined;
}) {
  return (
    <div className="form">
      {voltar}
      <Banner
        tipo="erro"
        acao={
          aoAtualizar ? (
            <button type="button" className="btn ghost sm" onClick={aoAtualizar}>
              Atualizar
            </button>
          ) : undefined
        }
      >
        {children}
      </Banner>
    </div>
  );
}

/** `Corrija N campos para salvar:` com o atalho para cada campo. */
export function ResumoDosCampos({
  referencia,
  erros,
  acao,
}: {
  referencia: React.Ref<HTMLDivElement>;
  erros: { campo: string; rotulo: string }[];
  /** O verbo do botao que a pessoa tentou apertar: `salvar`, `publicar`… */
  acao: string;
}) {
  if (erros.length === 0) return null;
  return (
    <ResumoDeErros
      referencia={referencia}
      titulo={`Corrija ${erros.length} ${erros.length === 1 ? 'campo' : 'campos'} para ${acao}:`}
      erros={erros}
    />
  );
}

/** O banner da falha de gravacao, com `Recarregar` quando a versao conflitou. */
export function BannerDaFalha({
  falha,
  aoRecarregar,
}: {
  falha: FalhaDoFormulario | undefined;
  aoRecarregar?: (() => void) | undefined;
}) {
  if (!falha) return null;
  return (
    <Banner
      tipo={falha.informativo ? 'info' : 'erro'}
      acao={
        falha.recarregar && aoRecarregar ? (
          <button type="button" className="btn ghost sm" onClick={aoRecarregar}>
            Recarregar
          </button>
        ) : undefined
      }
    >
      {falha.texto}
    </Banner>
  );
}

/** `Cancelar` e o botao de envio, com a ampulheta de quem esta gravando. */
export function RodapeDoFormulario({
  cancelarPara,
  rotulo,
  salvando,
  dataCy,
}: {
  cancelarPara: string;
  rotulo: string;
  salvando: boolean;
  dataCy?: string;
}) {
  return (
    <div className="rodape-form">
      <Link className="btn sec" to={cancelarPara}>
        Cancelar
      </Link>
      <button
        type="submit"
        className="btn pri"
        aria-busy={salvando || undefined}
        disabled={salvando}
        {...(dataCy !== undefined ? { 'data-cy': dataCy } : {})}
      >
        {salvando && <span className="spin" aria-hidden="true" />}
        {rotulo}
      </button>
    </div>
  );
}
