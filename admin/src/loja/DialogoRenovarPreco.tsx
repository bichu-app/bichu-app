import { useState } from 'react';

import type { Esquemas } from '../api/cliente.ts';
import { tipoDoProblema, versaoComoEtag } from '../api/problema.ts';
import { Banner, CampoDeTexto } from '../componentes/basicos.tsx';
import { Dialogo } from '../componentes/Dialogo.tsx';
import { Icone } from '../componentes/Icone.tsx';
import { useSessao } from '../sessao/ProvedorDeSessao.tsx';
import { centavosParaCampo, hojeCivil, precoEmCentavos } from './dominio.ts';

type Item = Esquemas['AdminStoreItem'];

/**
 * `BO/Dialogo · renovar consulta de preco` (3.8). Renovar pede o preco de novo,
 * pre-preenchido: renovar sem olhar o valor e o caminho para um preco errado
 * com data nova (secao 25.5, aprovado em 29.7). A data e hoje.
 */
export function DialogoRenovarPreco({
  item,
  etag,
  aoFechar,
  aoRenovar,
  aoConflito,
}: {
  item: Item;
  /** O ETag da ultima leitura, inteiro; sem ele, o da `version` da lista. */
  etag?: string;
  aoFechar: () => void;
  aoRenovar: (novo: Item, etag: string | undefined) => void;
  aoConflito: () => void;
}) {
  const { api } = useSessao();
  const [preco, setPreco] = useState(item.price ? centavosParaCampo(item.price.amount) : '');
  const [erro, setErro] = useState<string>();
  const [falha, setFalha] = useState<string>();
  const [salvando, setSalvando] = useState(false);

  async function renovar() {
    const amount = precoEmCentavos(preco);
    if (amount === undefined) {
      setErro('Informe o preço em reais, por exemplo 89,90.');
      document.getElementById('r-preco')?.focus();
      return;
    }
    setErro(undefined);
    setFalha(undefined);
    setSalvando(true);
    try {
      const { data, error, response } = await api.PATCH('/admin/store/items/{itemSlug}', {
        params: { path: { itemSlug: item.slug }, header: { 'If-Match': etag ?? versaoComoEtag(item.version) } },
        body: { price: { amount, currency: 'BRL', checked_at: hojeCivil() } },
      });
      if (data) aoRenovar(data, response.headers.get('ETag') ?? undefined);
      else if (tipoDoProblema(error) === 'precondition-failed') aoConflito();
      else setFalha('Não conseguimos renovar a consulta. Tente de novo.');
    } catch {
      setFalha('Não conseguimos falar com o servidor. Confira a internet e tente de novo.');
    } finally {
      setSalvando(false);
    }
  }

  return (
    <Dialogo titulo="Renovar a consulta de preço" aoFechar={salvando ? undefined : aoFechar} largo>
      <p className="t-body c-sec">
        {item.title}, em {item.partner.name}. Confira o preço no site do parceiro hoje e confirme o valor.
      </p>
      <a className="link t-label" href={item.target_url} target="_blank" rel="noopener noreferrer">
        Abrir a página do produto no parceiro <Icone nome="open" tamanho="s16" />
        <span className="sr">(abre em nova aba)</span>
      </a>
      {falha && <Banner tipo="erro">{falha}</Banner>}
      <form
        className="form"
        noValidate
        onSubmit={(e) => {
          e.preventDefault();
          void renovar();
        }}
      >
        <CampoDeTexto id="r-preco" rotulo="Preço (R$)" valor={preco} aoMudar={setPreco} erro={erro} modoDeEntrada="decimal" autoFoco />
        <div className="acoes">
          <button type="button" className="btn sec" onClick={aoFechar}>
            Cancelar
          </button>
          <button type="submit" className="btn pri" aria-busy={salvando || undefined}>
            {salvando && <span className="spin" aria-hidden="true" />}
            Renovar
          </button>
        </div>
      </form>
    </Dialogo>
  );
}
