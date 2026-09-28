import { useState } from 'react';

import type { Esquemas } from '../api/cliente.ts';
import { errosDoProblema, tipoDoProblema } from '../api/problema.ts';
import { Banner, CampoDeTexto } from '../componentes/basicos.tsx';
import { Dialogo } from '../componentes/Dialogo.tsx';
import { useSessao } from '../sessao/ProvedorDeSessao.tsx';
import { MAXIMO_DE_TAGS_ATIVAS, PADRAO_DO_ROTULO_DE_TAG } from './dominio.ts';

type Tag = Esquemas['AdminStoreTag'];

/** Mensagens da tag (secao 25.5.1, ATENCAO): o servidor decide, a tela so traduz o codigo. */
export function mensagemDeErroDaTag(tipo: string | undefined, codigos: string[]): string {
  if (tipo === 'slug-taken') return 'Já existe uma tag com esse nome.';
  if (codigos.includes('tag_vocabulary_full')) return `Já há ${MAXIMO_DE_TAGS_ATIVAS} tags ativas, o limite.`;
  if (codigos.includes('tag_charset')) return 'Use só letras, números, espaço e hífen.';
  if (tipo === 'validation-failed') return 'Use de 2 a 24 caracteres.';
  return 'Não conseguimos salvar a tag. Tente de novo.';
}

export function conferirRotulo(rotulo: string): string | undefined {
  const t = rotulo.trim().replace(/\s+/g, ' ');
  if (t.length < 2 || t.length > 24) return 'Use de 2 a 24 caracteres.';
  if (!PADRAO_DO_ROTULO_DE_TAG.test(t)) return 'Use só letras, números, espaço e hífen.';
  return undefined;
}

/**
 * "Criar tag" (`createAdminStoreTag`). Tag e vocabulario curado: nasce aqui, e
 * o produto so a referencia pelo `slug` (ADR-0027 item 17).
 */
export function DialogoCriarTag({ aoFechar, aoCriar }: { aoFechar: () => void; aoCriar: (tag: Tag) => void }) {
  const { api } = useSessao();
  const [rotulo, setRotulo] = useState('');
  const [erro, setErro] = useState<string>();
  const [falha, setFalha] = useState<string>();
  const [salvando, setSalvando] = useState(false);

  async function criar() {
    const recusa = conferirRotulo(rotulo);
    if (recusa) {
      setErro(recusa);
      document.getElementById('nova-tag')?.focus();
      return;
    }
    setErro(undefined);
    setFalha(undefined);
    setSalvando(true);
    try {
      const { data, error } = await api.POST('/admin/store/tags', { body: { label: rotulo.trim().replace(/\s+/g, ' ') } });
      if (data) {
        aoCriar(data);
        return;
      }
      const tipo = tipoDoProblema(error);
      if (tipo === 'slug-taken' || tipo === 'validation-failed') {
        setErro(mensagemDeErroDaTag(tipo, errosDoProblema(error).map((e) => e.code)));
        document.getElementById('nova-tag')?.focus();
      } else setFalha(mensagemDeErroDaTag(tipo, []));
    } catch {
      setFalha('Não conseguimos falar com o servidor. Confira a internet e tente de novo.');
    } finally {
      setSalvando(false);
    }
  }

  return (
    <Dialogo titulo="Criar tag" aoFechar={salvando ? undefined : aoFechar}>
      <p className="t-body c-sec">A tag nova fica disponível para todos os produtos, e o app mostra este nome.</p>
      {falha && <Banner tipo="erro">{falha}</Banner>}
      <form
        className="form"
        noValidate
        onSubmit={(e) => {
          e.preventDefault();
          void criar();
        }}
      >
        <CampoDeTexto
          id="nova-tag"
          rotulo="Nome da tag"
          valor={rotulo}
          aoMudar={setRotulo}
          maximo={24}
          erro={erro}
          ajuda={`De 2 a 24 caracteres: letras, números, espaço e hífen. Até ${MAXIMO_DE_TAGS_ATIVAS} tags ativas.`}
          autoFoco
        />
        <div className="acoes">
          <button type="button" className="btn sec" onClick={aoFechar}>
            Cancelar
          </button>
          <button type="submit" className="btn pri" aria-busy={salvando || undefined}>
            {salvando && <span className="spin" aria-hidden="true" />}
            Criar tag
          </button>
        </div>
      </form>
    </Dialogo>
  );
}
