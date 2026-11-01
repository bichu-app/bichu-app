import { useCallback, useId, useRef, useState } from 'react';
import { Link } from 'react-router';

import { Banner, EstadoVazio, LinhasCarregando, Selo } from '../componentes/basicos.tsx';
import { Dialogo } from '../componentes/Dialogo.tsx';
import { Icone } from '../componentes/Icone.tsx';
import { useListaPaginada, useParametrosDaLista } from '../componentes/lista.ts';
import {
  ERRO_AO_SAIR_DO_TELEFONE,
  LIMITE_DO_TELEFONE,
  erraAoSairDoTelefone,
  mascaraDeTelefone,
  telefoneEmE164,
} from '../formato/telefone.ts';
import { useSessao } from '../sessao/ProvedorDeSessao.tsx';
import {
  ATIVIDADES,
  MENSAGEM_DO_SLUG,
  PADRAO_DO_SLUG,
  slugSugerido,
  TIPOS_DE_ENTIDADE,
} from './dominio.ts';
import {
  ABAS,
  CONTATOS,
  LIMITE_DO_MOTIVO,
  ROTULO_DA_ABA,
  VAZIO_DA_ABA,
  lugarDa,
  marcaDasFotos,
  precisaDeTelefone,
  type EstadoDaIndicacao,
  type Indicacao,
} from './fila.ts';
import { ImagensDaIndicacao, LogoDaIndicacao } from './ImagensDaIndicacao.tsx';

const POR_PAGINA = 50;

const PADROES = { aba: 'pending' };

const ehAba = (v: string): v is EstadoDaIndicacao => (ABAS as readonly string[]).includes(v);

function plural(n: number) {
  return n === 1 ? 'indicação' : 'indicações';
}

const SELO_DA_ABA = {
  pending: 'rascunho',
  approved: 'publicado',
  declined: 'retirado',
} as const satisfies Record<EstadoDaIndicacao, 'rascunho' | 'publicado' | 'retirado'>;

function quando(iso: string): string {
  return new Date(iso).toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit', year: 'numeric' });
}

export default function FilaDeIndicacoes() {
  const { api } = useSessao();
  const [p, mudar] = useParametrosDaLista(PADROES);
  const aba: EstadoDaIndicacao = ehAba(p.aba) ? p.aba : 'pending';
  const [versao, setVersao] = useState(0);
  const [pendentes, setPendentes] = useState<number>();
  const [aviso, setAviso] = useState<{ tipo: 'ok' | 'erro'; texto: string }>();
  const [decidindo, setDecidindo] = useState<Indicacao>();
  const [recusando, setRecusando] = useState<Indicacao>();
  const idDoPainel = useId();

  const chave = JSON.stringify([aba, versao]);

  const buscar = useCallback(
    async (pagina: number, sinal: AbortSignal) => {
      const { data } = await api.GET('/admin/directory/suggestions', {
        params: { query: { review_status: aba, page: pagina, limit: POR_PAGINA } },
        signal: sinal,
      });
      if (!data) return undefined;
      setPendentes(data.pending_total);
      return { itens: data.items, total: data.total };
    },
    [api, aba],
  );
  const { estado, carregarMais, recarregar } = useListaPaginada<Indicacao>(chave, buscar);

  const cabecalho = (
    <header className="pghead">
      <div>
        <h1 className="t-headline">Indicações do Perto</h1>
        <p className="t-body-sm c-sec">
          O que as pessoas indicaram pelo aplicativo. Nada aparece na seção Perto antes de alguém
          aprovar aqui. Quem indicou não aparece nesta tela.
        </p>
      </div>
      <Link className="btn sec" to="/perto">
        <Icone nome="search" tamanho="s20" />
        Ver o diretório
      </Link>
    </header>
  );

  if (estado.fase === 'pronto' && estado.total === 0 && aba === 'pending' && pendentes === 0) {
    return (
      <>
        {cabecalho}
        <EstadoVazio
          titulo="Nenhuma indicação na fila"
          corpo="Quando alguém indicar uma clínica, um estabelecimento ou um profissional pelo aplicativo, a indicação aparece aqui para revisão."
          acao="Ver o diretório"
          destino="/perto"
        />
      </>
    );
  }

  return (
    <>
      {cabecalho}
      {aviso && (
        <Banner tipo={aviso.tipo} aoFechar={() => setAviso(undefined)}>
          {aviso.texto}
        </Banner>
      )}
      {estado.fase === 'erro' && (
        <Banner
          tipo="erro"
          acao={
            <button type="button" className="btn ghost sm" onClick={recarregar}>
              Atualizar
            </button>
          }
        >
          Não conseguimos carregar a fila de indicações.
        </Banner>
      )}
      {
}
      <div className="chips">
        <div className="chips-grupo" role="radiogroup" aria-label="Filtrar por situação">
          {ABAS.map((k) => (
            <button
              key={k}
              type="button"
              className="chip"
              data-cy={`filtro-${k}`}
              role="radio"
              aria-checked={aba === k}
              onClick={() => mudar({ aba: k })}
            >
              {aba === k && <Icone nome="tick" tamanho="s16" />}
              {ROTULO_DA_ABA[k]}
              {k === 'pending' && pendentes !== undefined ? ` (${pendentes})` : ''}
            </button>
          ))}
        </div>
      </div>
      <div id={idDoPainel}>
        {estado.fase === 'pronto' && (
          <p className="t-body-sm c-sec" aria-live="polite">
            {estado.itens.length < estado.total
              ? `Mostrando ${estado.itens.length} de ${estado.total} ${plural(estado.total)}`
              : `${estado.total} ${plural(estado.total)}`}
          </p>
        )}
        {estado.fase === 'pronto' && estado.total === 0 ? (
          <div className="semres">
            <p className="t-title">{VAZIO_DA_ABA[aba]}</p>
          </div>
        ) : (
          estado.fase !== 'erro' && (
            <div className="tabwrap">
              <table aria-busy={estado.fase === 'carregando' || undefined}>
                <caption className="sr">Indicações da comunidade para o diretório de Perto</caption>
                <thead>
                  <tr>
                    <th scope="col">Indicação</th>
                    <th scope="col" className="w-preco">
                      Onde atende
                    </th>
                    <th scope="col" className="w-upd">
                      Contato público
                    </th>
                    <th scope="col" className="w-status">
                      Situação
                    </th>
                    <th scope="col" className="w-acts">
                      <span className="sr">Ações</span>
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {estado.fase === 'carregando' ? (
                    <LinhasCarregando
                      linhas={5}
                      colunas={['w-preco', 'w-upd', 'w-status', 'w-acts']}
                    />
                  ) : (
                    estado.itens.map((i) => (
                      <tr key={i.reference} data-cy="indicacao-linha" data-ref={i.reference}>
                        <td>
                          <div className="prod">
                            <LogoDaIndicacao indicacao={i} />
                            <span className="tx">
                              <span className="t-label">{i.display_name}</span>
                              <span className="t-caption c-sec">
                                {TIPOS_DE_ENTIDADE[i.entity_kind]} · {ATIVIDADES[i.kind]} · indicada
                                em {quando(i.created_at)}
                              </span>
                              <span className="t-caption fotos-marca" data-cy="marca-de-fotos">
                                {marcaDasFotos(i)}
                              </span>
                              {i.note && <span className="t-caption c-sec">“{i.note}”</span>}
                              {i.decline_reason && (
                                <span className="t-caption c-sec">
                                  Recusada: {i.decline_reason}
                                </span>
                              )}
                            </span>
                          </div>
                        </td>
                        <td className="w-preco t-body-sm">{lugarDa(i)}</td>
                        <td className="w-upd t-body-sm">
                          {CONTATOS[i.public_contact.kind]}: {i.public_contact.value}
                        </td>
                        <td className="w-status">
                          <Selo tipo={SELO_DA_ABA[i.review_status]} />
                        </td>
                        <td className="w-acts">
                          {i.review_status === 'pending' ? (
                            <>
                              <button
                                type="button"
                                className="btn sec"
                                data-cy="recusar"
                                aria-label={`Recusar a indicação de ${i.display_name}`}
                                onClick={() => setRecusando(i)}
                              >
                                Recusar
                              </button>{' '}
                              <button
                                type="button"
                                className="btn pri"
                                data-cy="aprovar"
                                aria-label={`Aprovar a indicação de ${i.display_name}`}
                                onClick={() => setDecidindo(i)}
                              >
                                Aprovar
                              </button>
                            </>
                          ) : i.entry_slug ? (
                            <Link className="t-label" to={`/perto/${i.entry_slug}`}>
                              Ver a entrada
                            </Link>
                          ) : (
                            <span className="t-body-sm c-sec">—</span>
                          )}
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          )
        )}
        {estado.fase === 'pronto' && estado.itens.length < estado.total && (
          <button
            type="button"
            className="btn sec"
            aria-busy={estado.carregandoMais || undefined}
            onClick={carregarMais}
          >
            Carregar mais
          </button>
        )}
      </div>
      {decidindo && (
        <DialogoDeAprovacao
          indicacao={decidindo}
          aoFechar={() => setDecidindo(undefined)}
          aoAprovar={async (slug, telefone) => {
            const { data, error, response } = await api.POST(
              '/admin/directory/suggestions/{suggestionRef}/approval',
              {
                params: { path: { suggestionRef: decidindo.reference } },
                body: { slug, ...(telefone ? { phone_e164: telefone } : {}) },
              },
            );
            if (!response.ok || !data) return { ok: false, mensagem: mensagemDoErro(response.status, error) };
            setAviso({
              tipo: 'ok',
              texto: data.entry_created
                ? `${data.entry.display_name} aprovada. ${
                    data.entry.status === 'published'
                      ? 'A entrada já está no ar na seção Perto.'
                      : 'A entrada foi criada em rascunho: falta o telefone para ela ir ao ar.'
                  }`
                : `${decidindo.display_name} aprovada e ligada à entrada que já estava no Perto (${data.entry.slug}). Nada na entrada existente foi alterado.`,
            });
            setVersao((v) => v + 1);
            return { ok: true };
          }}
        />
      )}
      {recusando && (
        <DialogoDeRecusa
          indicacao={recusando}
          aoFechar={() => setRecusando(undefined)}
          aoRecusar={async (motivo) => {
            const { error, response } = await api.POST(
              '/admin/directory/suggestions/{suggestionRef}/decline',
              {
                params: { path: { suggestionRef: recusando.reference } },
                body: { reason: motivo },
              },
            );
            if (!response.ok) return { ok: false, mensagem: mensagemDoErro(response.status, error) };
            setAviso({
              tipo: 'ok',
              texto: `${recusando.display_name} recusada. O motivo fica registrado para a próxima revisão, e a indicação não é apagada.`,
            });
            setVersao((v) => v + 1);
            return { ok: true };
          }}
        />
      )}
    </>
  );
}

type Resultado = { ok: true } | { ok: false; mensagem: string };

function mensagemDoErro(status: number, erro: unknown): string {
  const codigos = (erro as { errors?: { code?: string }[] } | undefined)?.errors ?? [];
  if (codigos.some((e) => e.code === 'suggestion_not_pending')) {
    return 'Esta indicação já foi decidida por outra pessoa. Atualize a fila.';
  }
  if (status === 400) return 'O servidor recusou os dados. Confira o endereço e o telefone.';
  if (status === 404) return 'Esta indicação não existe mais.';
  if (status === 429) return 'Muitas decisões em pouco tempo. Tente de novo em alguns minutos.';
  return 'Não conseguimos falar com o servidor. Confira a internet e tente de novo.';
}

function DialogoDeAprovacao({
  indicacao: i,
  aoAprovar,
  aoFechar,
}: {
  indicacao: Indicacao;
  aoAprovar: (slug: string, telefone: string | null) => Promise<Resultado>;
  aoFechar: () => void;
}) {
  const [slug, setSlug] = useState(() => slugSugerido(i.display_name));
  const [telefone, setTelefone] = useState('');
  const [erroDoSlug, setErroDoSlug] = useState<string>();
  const [erroDoTelefone, setErroDoTelefone] = useState<string>();
  const [falha, setFalha] = useState<string>();
  const [carregando, setCarregando] = useState(false);
  const idDoCorpo = useId();
  const idDoSlug = useId();
  const idDoTelefone = useId();
  const campoDoSlug = useRef<HTMLInputElement>(null);
  const pedeTelefone = precisaDeTelefone(i);

  async function confirmar() {
    if (carregando) return;
    setFalha(undefined);
    if (!PADRAO_DO_SLUG.test(slug)) {
      setErroDoSlug(MENSAGEM_DO_SLUG);
      campoDoSlug.current?.focus();
      return;
    }
    setErroDoSlug(undefined);
    const e164 = telefone.trim() === '' ? null : telefoneEmE164(telefone);
    if (telefone.trim() !== '' && e164 === null) {
      setErroDoTelefone(ERRO_AO_SAIR_DO_TELEFONE);
      return;
    }
    setErroDoTelefone(undefined);
    setCarregando(true);
    try {
      const r = await aoAprovar(slug, e164);
      if (r.ok) aoFechar();
      else setFalha(r.mensagem);
    } finally {
      setCarregando(false);
    }
  }

  return (
    <Dialogo
      titulo={`Aprovar ${i.display_name}?`}
      aoFechar={carregando ? undefined : aoFechar}
      descricaoId={idDoCorpo}
      largo
    >
      <div id={idDoCorpo}>
        <p className="t-body c-sec">
          Aprovar cria a entrada no diretório de Perto com o nome, a atividade e o lugar da
          indicação. O recado de quem indicou não é publicado.
        </p>
        <p className="t-body c-sec">
          <strong>Se já existir uma entrada neste endereço</strong>, nada é criado e nada nela é
          alterado: a indicação passa a apontar para a entrada que já está lá. É assim que se
          resolve uma indicação repetida — procure o nome no diretório e use o endereço dela.
        </p>
        <p className="t-body c-sec">
          Contato indicado: {CONTATOS[i.public_contact.kind]} — {i.public_contact.value}.
        </p>
      </div>
      <ImagensDaIndicacao indicacao={i} />
      {falha && <Banner tipo="erro">{falha}</Banner>}
      <form
        className="form"
        noValidate
        onSubmit={(e) => {
          e.preventDefault();
          void confirmar();
        }}
      >
        <div className={erroDoSlug ? 'field err' : 'field'}>
          <label htmlFor={idDoSlug}>Endereço da entrada *</label>
          <input
            ref={campoDoSlug}
            id={idDoSlug}
            className="input"
            data-cy="slug-da-aprovacao"
            value={slug}
            maxLength={30}
            onChange={(e) => setSlug(e.target.value)}
            readOnly={carregando}
            aria-invalid={erroDoSlug ? true : undefined}
            aria-describedby={`${idDoSlug}-ajuda`}
            data-foco-inicial
          />
          <span className={erroDoSlug ? 'help err' : 'help'} id={`${idDoSlug}-ajuda`}>
            {erroDoSlug ?? MENSAGEM_DO_SLUG}
          </span>
        </div>
        <div className={erroDoTelefone ? 'field err' : 'field'}>
          <label htmlFor={idDoTelefone}>Telefone comercial</label>
          <input
            id={idDoTelefone}
            className="input"
            inputMode="tel"
            data-cy="telefone-da-aprovacao"
            value={telefone}
            maxLength={LIMITE_DO_TELEFONE}
            onChange={(e) => setTelefone(mascaraDeTelefone(e.target.value))}
            onBlur={() => setErroDoTelefone(erraAoSairDoTelefone(telefone) ? ERRO_AO_SAIR_DO_TELEFONE : undefined)}
            readOnly={carregando}
            aria-invalid={erroDoTelefone ? true : undefined}
            aria-describedby={`${idDoTelefone}-ajuda`}
          />
          <span className={erroDoTelefone ? 'help err' : 'help'} id={`${idDoTelefone}-ajuda`}>
            {erroDoTelefone ??
              (pedeTelefone
                ? 'O contato indicado não é telefone, e o cadastro só tem telefone como canal. Sem ele a entrada é criada em rascunho e não aparece no Perto.'
                : 'Opcional. Em branco, vale o telefone que veio na indicação.')}
          </span>
        </div>
        <div className="acoes">
          <button type="button" className="btn sec" onClick={aoFechar}>
            Cancelar
          </button>
          <button
            type="submit"
            className="btn pri"
            data-cy="confirmar-aprovacao"
            aria-busy={carregando || undefined}
          >
            {carregando && <span className="spin" aria-hidden="true" />}
            Aprovar e criar a entrada
          </button>
        </div>
      </form>
    </Dialogo>
  );
}

function DialogoDeRecusa({
  indicacao: i,
  aoRecusar,
  aoFechar,
}: {
  indicacao: Indicacao;
  aoRecusar: (motivo: string) => Promise<Resultado>;
  aoFechar: () => void;
}) {
  const [motivo, setMotivo] = useState('');
  const [erroDoMotivo, setErroDoMotivo] = useState<string>();
  const [falha, setFalha] = useState<string>();
  const [carregando, setCarregando] = useState(false);
  const idDoCorpo = useId();
  const idDoMotivo = useId();
  const campoDoMotivo = useRef<HTMLTextAreaElement>(null);

  async function confirmar() {
    if (carregando) return;
    setFalha(undefined);
    const m = motivo.trim();
    if (m.length < 2) {
      setErroDoMotivo('Escreva o motivo.');
      campoDoMotivo.current?.focus();
      return;
    }
    setErroDoMotivo(undefined);
    setCarregando(true);
    try {
      const r = await aoRecusar(m);
      if (r.ok) aoFechar();
      else setFalha(r.mensagem);
    } finally {
      setCarregando(false);
    }
  }

  return (
    <Dialogo
      titulo={`Recusar ${i.display_name}?`}
      aoFechar={carregando ? undefined : aoFechar}
      descricaoId={idDoCorpo}
      largo
    >
      <div id={idDoCorpo}>
        <p className="t-body c-sec">
          A indicação <strong>não é apagada</strong>: ela fica na aba Recusadas, com o motivo.
          Nenhuma entrada é criada no diretório.
        </p>
        <p className="t-body c-sec">
          O motivo é para quem revisar a próxima indicação do mesmo lugar. Ele não é publicado e
          não chega a quem indicou.
        </p>
      </div>
      <ImagensDaIndicacao indicacao={i} />
      {falha && <Banner tipo="erro">{falha}</Banner>}
      <form
        className="form"
        noValidate
        onSubmit={(e) => {
          e.preventDefault();
          void confirmar();
        }}
      >
        <div className={erroDoMotivo ? 'field err' : 'field'}>
          <label htmlFor={idDoMotivo}>Motivo da recusa *</label>
          <textarea
            ref={campoDoMotivo}
            id={idDoMotivo}
            className="input"
            data-cy="motivo-da-recusa"
            rows={3}
            maxLength={LIMITE_DO_MOTIVO}
            value={motivo}
            onChange={(e) => setMotivo(e.target.value)}
            readOnly={carregando}
            aria-invalid={erroDoMotivo ? true : undefined}
            aria-describedby={`${idDoMotivo}-ajuda`}
            data-foco-inicial
          />
          <span className={erroDoMotivo ? 'help err' : 'help'} id={`${idDoMotivo}-ajuda`}>
            {erroDoMotivo ?? 'Por exemplo: “fechou em 2025”, “não atende pet”, “telefone de pessoa física”.'}
          </span>
        </div>
        <div className="acoes">
          <button type="button" className="btn sec" onClick={aoFechar}>
            Cancelar
          </button>
          <button
            type="submit"
            className="btn danger"
            data-cy="confirmar-recusa"
            aria-busy={carregando || undefined}
          >
            {carregando && <span className="spin" aria-hidden="true" />}
            Recusar com este motivo
          </button>
        </div>
      </form>
    </Dialogo>
  );
}
