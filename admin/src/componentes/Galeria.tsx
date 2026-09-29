import { useRef, useState } from 'react';

import { conferirArquivo, conferirDimensao, FalhaDeEnvio, MAXIMO_DE_IMAGENS, type Proposito } from './envio-de-imagem.ts';
import { Icone } from './Icone.tsx';

/**
 * Uma imagem da galeria, do ponto de vista da tela.
 *
 * - `enviando` / `erro`: so existem no navegador, antes da escrita do item.
 * - `enviada`: os bytes chegaram; falta a escrita do item confirmar o envio.
 * - `processing` / `ready` / `rejected`: o estado que o servidor devolve
 *   (`AdminCatalogGalleryImage.status`) depois da escrita.
 */
export interface ImagemDaGaleria {
  chave: string;
  uploadId?: string;
  alt: string;
  estado: 'enviando' | 'erro' | 'enviada' | 'processing' | 'ready' | 'rejected';
  progresso?: number;
  erro?: string;
  motivo?: string | null;
  /** A derivada publica quando pronta, ou a previa local (`blob:`) do arquivo escolhido. */
  previa?: string | null;
  arquivo?: File;
}

let contador = 0;
export function novaChave(): string {
  contador += 1;
  return `img-${Date.now().toString(36)}-${contador}`;
}

/** A descricao so e cobrada de imagem que chegou (secao 25.5.1). */
export function precisaDeDescricao(imagem: ImagemDaGaleria): boolean {
  return imagem.estado !== 'erro' && imagem.estado !== 'rejected' && imagem.estado !== 'enviando';
}

export function descricaoValida(alt: string): boolean {
  const t = alt.trim();
  return t.length >= 2 && t.length <= 150;
}

export interface PropsDaGaleria {
  id: string;
  imagens: ImagemDaGaleria[];
  aoMudar: (atualizar: (atual: ImagemDaGaleria[]) => ImagemDaGaleria[]) => void;
  enviar: (arquivo: File, aoProgredir: (p: number) => void) => Promise<string>;
  proposito: Proposito;
  mostrarErrosDeDescricao: boolean;
  erro?: string | undefined;
  titulo?: string;
  principal?: string;
  ajuda?: string;
}

/**
 * Galeria de ate 8 imagens (secao 25.5.1, UX 29.10): a primeira e a principal;
 * mover, usar como principal e remover por botao, com a posicao no nome
 * acessivel; arrastar para reordenar e atalho, nao requisito (SC 2.5.7).
 */
export function Galeria({
  id,
  imagens,
  aoMudar,
  enviar,
  proposito,
  mostrarErrosDeDescricao,
  erro,
  titulo = 'Imagens do produto',
  principal = 'Principal',
  ajuda = 'JPG, PNG ou WebP, até 5 MB cada, com pelo menos 800 × 800 pixels. A primeira é a principal: ela aparece na lista e no app. Arraste para reordenar, ou use os botões de mover.',
}: PropsDaGaleria) {
  const [anuncio, setAnuncio] = useState('');
  const seletor = useRef<HTMLInputElement>(null);
  const trocarEm = useRef<number | null>(null);
  const arrastando = useRef<number | null>(null);
  const lista = useRef<HTMLOListElement>(null);
  const n = imagens.length;
  const cheio = n >= MAXIMO_DE_IMAGENS;
  const principalMinusculo = principal.toLowerCase();

  function focar(seletorCss: string) {
    requestAnimationFrame(() => lista.current?.querySelector<HTMLElement>(seletorCss)?.focus());
  }

  function atualizar(chave: string, mudanca: Partial<ImagemDaGaleria>) {
    aoMudar((atual) => atual.map((im) => (im.chave === chave ? { ...im, ...mudanca } : im)));
  }

  async function subir(chave: string, arquivo: File) {
    const recusa = conferirArquivo(arquivo) ?? (await conferirDimensao(arquivo, proposito));
    if (recusa) {
      atualizar(chave, { estado: 'erro', erro: recusa, arquivo });
      setAnuncio(recusa);
      return;
    }
    atualizar(chave, { estado: 'enviando', progresso: 0, arquivo });
    try {
      const uploadId = await enviar(arquivo, (p) => atualizar(chave, { progresso: p }));
      atualizar(chave, { estado: 'enviada', uploadId, progresso: 100 });
      setAnuncio('Imagem enviada.');
    } catch (e) {
      const mensagem = e instanceof FalhaDeEnvio ? e.mensagem : 'A imagem não foi enviada.';
      atualizar(chave, { estado: 'erro', erro: mensagem });
      setAnuncio(mensagem);
    }
  }

  function escolher(arquivos: FileList | null) {
    if (!arquivos || arquivos.length === 0) return;
    const indice = trocarEm.current;
    trocarEm.current = null;
    if (indice !== null) {
      const arquivo = arquivos[0];
      const alvo = imagens[indice];
      if (!arquivo || !alvo) return;
      const nova: ImagemDaGaleria = { chave: novaChave(), alt: alvo.alt, estado: 'enviando', progresso: 0, previa: URL.createObjectURL(arquivo) };
      aoMudar((atual) => atual.map((im) => (im.chave === alvo.chave ? nova : im)));
      setAnuncio('Enviando outra imagem.');
      void subir(nova.chave, arquivo);
      return;
    }
    const livres = MAXIMO_DE_IMAGENS - n;
    const escolhidos = [...arquivos].slice(0, livres);
    const novas = escolhidos.map<ImagemDaGaleria>((arquivo) => ({
      chave: novaChave(),
      alt: '',
      estado: 'enviando',
      progresso: 0,
      previa: URL.createObjectURL(arquivo),
    }));
    aoMudar((atual) => [...atual, ...novas]);
    setAnuncio(escolhidos.length === 1 ? 'Enviando imagem.' : `Enviando ${escolhidos.length} imagens.`);
    novas.forEach((im, i) => {
      const arquivo = escolhidos[i];
      if (arquivo) void subir(im.chave, arquivo);
    });
  }

  function mover(i: number, delta: number) {
    const j = i + delta;
    if (j < 0 || j >= n) return;
    aoMudar((atual) => {
      const copia = [...atual];
      const [x] = copia.splice(i, 1);
      if (x) copia.splice(j, 0, x);
      return copia;
    });
    setAnuncio(`Imagem movida para a posição ${j + 1} de ${n}.${j === 0 ? ` Ela agora é a ${principalMinusculo}.` : ''}`);
    focar(`[data-indice="${j}"] [data-mover="${delta}"]:not([disabled])`);
  }

  function tornarPrincipal(i: number) {
    aoMudar((atual) => {
      const copia = [...atual];
      const [x] = copia.splice(i, 1);
      if (x) copia.unshift(x);
      return copia;
    });
    setAnuncio(`Esta imagem agora é a ${principalMinusculo}.`);
    focar('[data-indice="0"] [data-remover]');
  }

  function remover(i: number) {
    const alvo = imagens[i];
    aoMudar((atual) => atual.filter((_, k) => k !== i));
    if (alvo?.previa?.startsWith('blob:')) URL.revokeObjectURL(alvo.previa);
    setAnuncio(`Imagem removida. ${n - 1} de ${MAXIMO_DE_IMAGENS}.`);
    focar('[data-adicionar]');
  }

  const idDaAjuda = `${id}-ajuda`;
  const idDoErro = `${id}-erro`;

  return (
    <div className={erro ? 'field err' : 'field'}>
      <div className="lab-row">
        <span className="lab" id={`${id}-titulo`}>
          {titulo}
        </span>
        <span className="t-body-sm c-sec contador-img">
          {n} de {MAXIMO_DE_IMAGENS} imagens
        </span>
      </div>
      <ol
        ref={lista}
        id={id}
        tabIndex={-1}
        className="galeria"
        aria-labelledby={`${id}-titulo`}
        aria-describedby={[idDaAjuda, erro ? idDoErro : ''].filter(Boolean).join(' ')}
      >
        {imagens.map((im, i) => {
          const podeMover = im.estado !== 'enviando' && im.estado !== 'erro';
          const erroDeDescricao = mostrarErrosDeDescricao && precisaDeDescricao(im) && !descricaoValida(im.alt);
          const idDoAlt = `${id}-alt-${i}`;
          return (
            <li
              key={im.chave}
              className={im.estado === 'erro' || im.estado === 'rejected' ? 'tile err' : 'tile'}
              data-indice={i}
              aria-label={`Imagem ${i + 1} de ${n}${i === 0 ? `, ${principalMinusculo}` : ''}`}
              draggable={podeMover}
              onDragStart={(e) => {
                arrastando.current = i;
                e.dataTransfer.effectAllowed = 'move';
              }}
              onDragOver={(e) => {
                if (arrastando.current !== null) e.preventDefault();
              }}
              onDrop={(e) => {
                e.preventDefault();
                const de = arrastando.current;
                arrastando.current = null;
                if (de === null || de === i) return;
                mover(de, i - de);
              }}
            >
              <div className="tile-img">
                {im.previa ? <img src={im.previa} alt="" /> : <Icone nome="image" />}
                {i === 0 && (
                  <span className="selo pub t-overline tile-principal">
                    <Icone nome="check" tamanho="s16" />
                    {principal}
                  </span>
                )}
                {im.estado === 'enviando' && (
                  <div className="tile-over">
                    <div
                      className="barra-prog"
                      role="progressbar"
                      aria-valuenow={im.progresso ?? 0}
                      aria-valuemin={0}
                      aria-valuemax={100}
                      aria-label={`Enviando imagem ${i + 1}`}
                    >
                      <span style={{ width: `${im.progresso ?? 0}%` }} />
                    </div>
                    <span className="t-caption">Enviando… {im.progresso ?? 0}%</span>
                  </div>
                )}
                {im.estado === 'processing' && (
                  <div className="tile-over">
                    <span className="spin" aria-hidden="true" />
                    <span className="t-caption">Conferindo a imagem…</span>
                  </div>
                )}
                {im.estado === 'erro' && (
                  <div className="tile-over err">
                    <span className="t-caption">{im.erro ?? 'A imagem não foi enviada.'}</span>
                  </div>
                )}
                {im.estado === 'rejected' && (
                  <div className="tile-over err">
                    <span className="t-label">Imagem recusada</span>
                    {im.motivo && <span className="t-caption">{im.motivo}</span>}
                  </div>
                )}
              </div>
              {precisaDeDescricao(im) && (
                <div className={erroDeDescricao ? 'field tile-alt err' : 'field tile-alt'}>
                  <label className="t-caption" htmlFor={idDoAlt}>
                    Descrição da imagem *
                  </label>
                  <input
                    className="input"
                    id={idDoAlt}
                    maxLength={150}
                    value={im.alt}
                    onChange={(e) => atualizar(im.chave, { alt: e.target.value })}
                    aria-invalid={erroDeDescricao || undefined}
                    aria-describedby={erroDeDescricao ? `${idDoAlt}-erro` : `${id}-ajuda-alt`}
                  />
                  {erroDeDescricao && (
                    <span className="help err" id={`${idDoAlt}-erro`}>
                      <Icone nome="error" tamanho="s20" />
                      Descreva a imagem.
                    </span>
                  )}
                </div>
              )}
              <div className="tile-acts">
                {im.estado === 'rejected' ? (
                  <button
                    type="button"
                    className="btn ghost sm"
                    onClick={() => {
                      trocarEm.current = i;
                      seletor.current?.click();
                    }}
                  >
                    Enviar outra
                  </button>
                ) : im.estado === 'erro' ? (
                  im.arquivo && !conferirArquivo(im.arquivo) ? (
                    <button
                      type="button"
                      className="btn ghost sm"
                      onClick={() => {
                        setAnuncio('Enviando de novo.');
                        if (im.arquivo) void subir(im.chave, im.arquivo);
                      }}
                    >
                      Tentar de novo
                    </button>
                  ) : null
                ) : (
                  <>
                    <button
                      type="button"
                      className="ibtn"
                      data-mover="-1"
                      disabled={i === 0 || !podeMover}
                      aria-label={`Mover para a esquerda a imagem ${i + 1} de ${n}`}
                      title="Mover para a esquerda"
                      onClick={() => mover(i, -1)}
                    >
                      <Icone nome="back" tamanho="s20" />
                    </button>
                    <button
                      type="button"
                      className="ibtn"
                      data-mover="1"
                      disabled={i === n - 1 || !podeMover}
                      aria-label={`Mover para a direita a imagem ${i + 1} de ${n}`}
                      title="Mover para a direita"
                      onClick={() => mover(i, 1)}
                    >
                      <Icone nome="back" tamanho="s20" espelhado />
                    </button>
                    {i > 0 && podeMover && (
                      <button
                        type="button"
                        className="ibtn"
                        aria-label={`Usar como ${principalMinusculo} a imagem ${i + 1} de ${n}`}
                        title={`Usar como ${principalMinusculo}`}
                        onClick={() => tornarPrincipal(i)}
                      >
                        <Icone nome="check" tamanho="s20" />
                      </button>
                    )}
                  </>
                )}
                <button
                  type="button"
                  className="ibtn"
                  data-remover
                  aria-label={`Remover a imagem ${i + 1} de ${n}`}
                  title="Remover"
                  onClick={() => remover(i)}
                >
                  <Icone nome="delete" tamanho="s20" />
                </button>
              </div>
            </li>
          );
        })}
        <li className="tile">
          <button type="button" className="imgzone" data-adicionar disabled={cheio} onClick={() => seletor.current?.click()}>
            <Icone nome={cheio ? 'info' : 'add'} />
            <span className="t-body-sm">{cheio ? `Limite de ${MAXIMO_DE_IMAGENS} imagens atingido` : 'Adicionar imagens'}</span>
          </button>
        </li>
      </ol>
      <input
        ref={seletor}
        type="file"
        accept="image/jpeg,image/png,image/webp"
        multiple
        hidden
        data-testid={`${id}-arquivo`}
        data-cy={`${id}-arquivo`}
        onChange={(e) => {
          escolher(e.target.files);
          e.target.value = '';
        }}
      />
      <span className="help" id={idDaAjuda}>
        {ajuda}
      </span>
      <span className="help" id={`${id}-ajuda-alt`}>
        Descrição da imagem: uma frase sobre o que aparece na foto. É lida para quem usa leitor de tela.
      </span>
      {erro && (
        <span className="help err" id={idDoErro}>
          <Icone nome="error" tamanho="s20" />
          {erro}
        </span>
      )}
      <span className="sr" aria-live="polite">
        {anuncio}
      </span>
    </div>
  );
}
