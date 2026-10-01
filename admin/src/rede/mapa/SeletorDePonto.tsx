/**
 * Seletor de ponto no mapa (`BO/Seletor de ponto no mapa`, 25.3), com Leaflet
 * empacotado e tiles do OpenStreetMap carregados como imagem (ADR-0027 item
 * 6): sem chave, sem custo, e a CSP libera so `tile.openstreetmap.org` em
 * `img-src`. **Sem busca de endereco**: seria geocodificacao, e o ADR-0006 a
 * proibe (D.4). A alternativa de teclado (WCAG 2.1.1) e a mira: com o mapa em
 * foco, as setas movem o mapa sob a mira fixa no centro, + aproxima e - afasta
 * (teclado nativo do Leaflet) e Enter ou espaco marca o centro.
 *
 * O ponto e opcional no contrato (BO-8): a tela recomenda, nao bloqueia.
 */
import 'leaflet/dist/leaflet.css';

import L from 'leaflet';
import { useCallback, useEffect, useId, useRef, useState } from 'react';

import { configuracao } from '../../config.ts';
import type { Ponto } from '../dominio/tipos.ts';
import estilos from './SeletorDePonto.module.css';

export const URL_DOS_TILES = configuracao.urlDosTiles;
const ATRIBUICAO = `&copy; <a href="${configuracao.urlDaAtribuicaoDoMapa}">OpenStreetMap</a>`;
/** Os limites de `NetworkEventPoint` no contrato. */
const LIMITES = L.latLngBounds([-34, -74], [6, -32]);
/** Sem ponto, o mapa abre no centro de Sao Paulo, onde a v1 opera. */
const CENTRO_PADRAO: L.LatLngTuple = [-23.5505, -46.6333];

const PINO = `<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 22s7-6.2 7-12a7 7 0 1 0-14 0c0 5.8 7 12 7 12z"/><circle cx="12" cy="10" r="2.5"/></svg>`;

export function textoDaCoordenada(p: Ponto): string {
  const f = (n: number) => n.toFixed(4).replace('.', ',').replace('-', '−');
  return `${f(p.lat)}, ${f(p.lon)}`;
}

function dentroDoBrasil(lat: number, lon: number): boolean {
  return LIMITES.contains([lat, lon]);
}

export interface PropsDoSeletor {
  ponto: Ponto | null;
  aoMudar: (ponto: Ponto | null) => void;
  /** Erro de validacao vindo do formulario. */
  erro?: string | undefined;
  desabilitado?: boolean;
}

export function SeletorDePonto({ ponto, aoMudar, erro, desabilitado = false }: PropsDoSeletor) {
  const idDoStatus = useId();
  const idDaDica = useId();
  const idDoErro = useId();
  const caixa = useRef<HTMLDivElement>(null);
  const mapa = useRef<L.Map | null>(null);
  const pino = useRef<L.Marker | null>(null);
  const pontoAtual = useRef(ponto);
  useEffect(() => {
    pontoAtual.current = ponto;
  });
  const movendo = useRef(false);
  const [falhou, setFalhou] = useState(false);
  const [tentativa, setTentativa] = useState(0);
  const [foraDoBrasil, setForaDoBrasil] = useState(false);
  const aoMudarRef = useRef(aoMudar);
  useEffect(() => {
    aoMudarRef.current = aoMudar;
  });
  const pontoInicial = useRef(ponto);

  const marcar = useCallback((lat: number, lon: number): boolean => {
    if (!dentroDoBrasil(lat, lon)) {
      setForaDoBrasil(true);
      return false;
    }
    setForaDoBrasil(false);
    // Quatro casas decimais: cerca de 11 m, e o ponto e de praca, nao de porta.
    aoMudarRef.current({ lat: Number(lat.toFixed(5)), lon: Number(lon.toFixed(5)) });
    return true;
  }, []);

  // Monta o mapa uma vez por tentativa (Tentar de novo recria so o mapa).
  useEffect(() => {
    const el = caixa.current;
    if (!el) return;
    const inicial = pontoInicial.current;
    const m = L.map(el, {
      center: inicial ? [inicial.lat, inicial.lon] : CENTRO_PADRAO,
      zoom: inicial ? 16 : 12,
      minZoom: 4,
      maxZoom: 19,
      maxBounds: LIMITES.pad(0.1),
      keyboard: true,
      keyboardPanDelta: 40,
      attributionControl: true,
      zoomControl: true,
    });
    let carregados = 0;
    let erros = 0;
    const camada = L.tileLayer(URL_DOS_TILES, { attribution: ATRIBUICAO, maxZoom: 19, referrerPolicy: 'strict-origin-when-cross-origin' });
    camada.on('tileload', () => {
      carregados += 1;
    });
    camada.on('tileerror', () => {
      erros += 1;
      if (carregados === 0 && erros >= 4) setFalhou(true);
    });
    camada.addTo(m);
    m.on('click', (e: L.LeafletMouseEvent) => marcar(e.latlng.lat, e.latlng.lng));
    m.on('movestart', () => {
      movendo.current = true;
    });
    m.on('moveend', () => {
      movendo.current = false;
    });
    mapa.current = m;
    return () => {
      m.remove();
      mapa.current = null;
      pino.current = null;
    };
  }, [tentativa, marcar]);

  // O pino acompanha o ponto do formulario.
  useEffect(() => {
    const m = mapa.current;
    if (!m) return;
    if (!ponto) {
      pino.current?.remove();
      pino.current = null;
      return;
    }
    if (!pino.current) {
      const icone = L.divIcon({ className: estilos.pino ?? '', html: PINO, iconSize: [32, 32], iconAnchor: [16, 30] });
      // Arrastavel (pedido de 01/10). `keyboard: false` deixa o pino fora da ordem
      // de tabulacao: no teclado, quem marca e a mira do mapa (WCAG 2.1.1), e o
      // arraste e atalho, nao requisito (WCAG 2.5.7).
      const marcador = L.marker([ponto.lat, ponto.lon], { icon: icone, keyboard: false, draggable: true, autoPan: true }).addTo(m);
      marcador.on('dragend', () => {
        const ll = marcador.getLatLng();
        if (!marcar(ll.lat, ll.lng)) {
          // Fora do Brasil: o pino volta para o ponto que valia.
          const atual = pontoAtual.current;
          if (atual) marcador.setLatLng([atual.lat, atual.lon]);
        }
      });
      pino.current = marcador;
    } else {
      pino.current.setLatLng([ponto.lat, ponto.lon]);
    }
    if (desabilitado) pino.current.dragging?.disable();
    else pino.current.dragging?.enable();
  }, [ponto, tentativa, marcar, desabilitado]);

  useEffect(() => {
    const m = mapa.current;
    if (!m) return;
    if (desabilitado) {
      m.dragging.disable();
      m.keyboard.disable();
      m.off('click');
    }
  }, [desabilitado, tentativa]);

  function aoTeclar(evento: React.KeyboardEvent<HTMLDivElement>) {
    if (desabilitado || (evento.key !== 'Enter' && evento.key !== ' ')) return;
    evento.preventDefault();
    const m = mapa.current;
    if (!m) return;
    // Seta seguida de Enter: a mira e o centro de DEPOIS do deslocamento, nao o do meio da animacao.
    const marcarOCentro = () => {
      const c = m.getCenter();
      marcar(c.lat, c.lng);
    };
    if (movendo.current) m.once('moveend', marcarOCentro);
    else marcarOCentro();
  }

  function mudarOPonto() {
    const m = mapa.current;
    if (m && ponto) m.setView([ponto.lat, ponto.lon], Math.max(m.getZoom(), 16));
    caixa.current?.focus();
  }

  if (falhou) {
    return (
      <div className={estilos.falha}>
        <p className="t-body">Não conseguimos carregar o mapa agora.</p>
        <button
          type="button"
          className="btn sec sm"
          onClick={() => {
            setFalhou(false);
            setTentativa((t) => t + 1);
          }}
        >
          Tentar de novo
        </button>
      </div>
    );
  }

  const mensagemDeErro = foraDoBrasil ? 'Marque um ponto dentro do Brasil.' : erro;

  return (
    <div className={estilos.envoltorio}>
      <div className={`${estilos.moldura} ${mensagemDeErro ? estilos.erro : ''}`}>
        <div
          key={tentativa}
          ref={caixa}
          className={estilos.mapa}
          role="application"
          aria-roledescription="mapa"
          aria-label="Mapa para marcar o ponto do encontro"
          aria-describedby={`${idDaDica}${mensagemDeErro ? ` ${idDoErro}` : ''} ${idDoStatus}`}
          aria-disabled={desabilitado || undefined}
          tabIndex={desabilitado ? -1 : 0}
          onKeyDown={aoTeclar}
          data-testid="mapa"
        />
        <span className={estilos.mira} aria-hidden="true" />
        <span className={`${estilos.dica} t-body-sm`} id={idDaDica}>
          Setas movem a mira. Enter marca o ponto. + aproxima e − afasta.
        </span>
      </div>
      {/* Erro e ponto sao linhas separadas: um arraste recusado nao esconde o
          ponto que continua valendo (QA 4). */}
      {mensagemDeErro && (
        <span className="help err" id={idDoErro} aria-live="polite">
          {mensagemDeErro}
        </span>
      )}
      {ponto ? (
        <div className={estilos.status} id={idDoStatus} aria-live="polite">
          <span className="t-body-sm c-sec">Ponto marcado: {textoDaCoordenada(ponto)}</span>
          {!desabilitado && (
            <>
              <button type="button" className="btn ghost sm" onClick={mudarOPonto}>
                Mudar o ponto
              </button>
              <button type="button" className="btn ghost sm" onClick={() => aoMudar(null)}>
                Tirar o ponto
              </button>
            </>
          )}
        </div>
      ) : (
        <span className="t-body-sm c-sec" id={idDoStatus} aria-live="polite">
          Nenhum ponto marcado.
        </span>
      )}
    </div>
  );
}
