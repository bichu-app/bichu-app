import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import { CaptchaIndisponivel } from '../src/entrar/captcha.ts';
import { Entrar, MENSAGEM_UNICA } from '../src/entrar/Entrar.tsx';
import { criarServidorFalso, json, problema, SESSAO, type Resposta } from './apoio/servidor-falso.ts';

const TOKEN = 'token-do-captcha-com-mais-de-vinte-caracteres';

function montar(resposta: Resposta, opcoes: { busca?: string; obterToken?: () => Promise<string> } = {}) {
  const servidor = criarServidorFalso({ 'POST /admin/auth/login': resposta });
  const navegarParaFora = vi.fn();
  const obterToken = opcoes.obterToken ?? vi.fn(() => Promise.resolve(TOKEN));
  const utils = render(<Entrar obterToken={obterToken} busca={opcoes.busca ?? ''} navegarParaFora={navegarParaFora} fetch={servidor.fetch} />);
  return { ...utils, servidor, navegarParaFora, obterToken };
}

function preencherEEntrar(email = 'operacao@exemplo.com.br', senha = 'uma frase longa de verdade') {
  fireEvent.change(screen.getByLabelText('E-mail'), { target: { value: email } });
  fireEvent.change(screen.getByLabelText('Senha'), { target: { value: senha } });
  fireEvent.click(screen.getByRole('button', { name: 'Entrar' }));
}

describe('1 · Login', () => {
  it('entra: manda e-mail, senha e X-Captcha-Token, e recarrega o painel', async () => {
    const { servidor, navegarParaFora } = montar(json(200, SESSAO));
    preencherEEntrar();
    await waitFor(() => expect(navegarParaFora).toHaveBeenCalledWith('/'));
    const [req] = servidor.requisicoes;
    expect(req?.cabecalhos.get('X-Captcha-Token')).toBe(TOKEN);
    expect(req?.corpo).toEqual({ email: 'operacao@exemplo.com.br', password: 'uma frase longa de verdade' });
    expect(req?.cabecalhos.get('Authorization')).toBeNull();
  });

  it('volta para a rota em que a pessoa estava, e so para rota interna', async () => {
    const certo = montar(json(200, SESSAO), { busca: '?motivo=expirada&volta=%2Floja%2Fracao-10kg' });
    expect(screen.getByRole('status')).toHaveTextContent('Sua sessão terminou. Entre de novo para continuar.');
    preencherEEntrar();
    await waitFor(() => expect(certo.navegarParaFora).toHaveBeenCalledWith('/loja/racao-10kg'));
    certo.unmount();

    const malicioso = montar(json(200, SESSAO), { busca: '?volta=%2F%2Fevil.example%2Fx' });
    preencherEEntrar();
    await waitFor(() => expect(malicioso.navegarParaFora).toHaveBeenCalledWith('/'));
  });

  it('D44: conta inexistente, senha errada e conta sem papel dao a MESMA tela', async () => {
    // O servidor responde o mesmo 401 aos tres casos; o painel tambem trata
    // igual o 400 de validacao e qualquer outra recusa. Nada pode variar.
    const casos: Resposta[] = [
      problema(401, 'invalid-credentials'),
      problema(401, 'invalid-credentials', { title: 'outro titulo qualquer' }),
      problema(400, 'validation-failed', { errors: [{ field: 'email', code: 'format' }] }),
      problema(403, 'forbidden'),
    ];
    const telas: string[] = [];
    for (const caso of casos) {
      const { container, unmount } = montar(caso);
      preencherEEntrar('alguem@exemplo.com.br', 'senha-que-nao-confere');
      await screen.findByText(MENSAGEM_UNICA);
      expect(screen.getByRole('alert')).toHaveTextContent(MENSAGEM_UNICA);
      expect(screen.getByLabelText('E-mail')).toHaveValue('alguem@exemplo.com.br');
      expect(screen.getByLabelText('Senha')).toHaveValue('');
      await waitFor(() => expect(screen.getByLabelText('Senha')).toHaveFocus());
      telas.push(container.innerHTML);
      unmount();
    }
    expect(new Set(telas).size).toBe(1);
  });

  it('1.4: muitas tentativas diz a espera por extenso e desabilita Entrar ate o prazo', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    try {
      montar(problema(429, 'rate-limited', {}, { 'Retry-After': '900' }));
      preencherEEntrar();
      await screen.findByText('Muitas tentativas de entrar. Tente de novo em 15 minutos.');
      const entrar = screen.getByRole('button', { name: 'Entrar' });
      expect(entrar).toBeDisabled();
      await act(async () => {
        await vi.advanceTimersByTimeAsync(900_000);
      });
      expect(entrar).toBeEnabled();
    } finally {
      vi.useRealTimers();
    }
  });

  it('1.8: verificacao recusada pelo servidor', async () => {
    montar(problema(403, 'captcha-rejected'));
    preencherEEntrar();
    expect(await screen.findByRole('alert')).toHaveTextContent(
      'Não conseguimos confirmar este acesso. Tente de outra rede ou fale com o responsável pelo backoffice.',
    );
  });

  it('1.9: o script da verificacao nao carregou e nenhuma chamada sai', async () => {
    const { servidor } = montar(json(200, SESSAO), { obterToken: () => Promise.reject(new CaptchaIndisponivel('x')) });
    preencherEEntrar();
    expect(await screen.findByRole('status')).toHaveTextContent('A verificação de segurança do login não carregou.');
    expect(servidor.requisicoes).toHaveLength(0);
  });

  it('1.10: sem conexao', async () => {
    const navegarParaFora = vi.fn();
    const fetch = vi.fn(() => Promise.reject(new TypeError('Failed to fetch'))) as unknown as typeof globalThis.fetch;
    render(<Entrar obterToken={() => Promise.resolve(TOKEN)} busca="" navegarParaFora={navegarParaFora} fetch={fetch} />);
    preencherEEntrar();
    expect(await screen.findByRole('alert')).toHaveTextContent('Não conseguimos falar com o servidor. Confira a internet e tente entrar de novo.');
  });

  it('1.11 e 1.12: os avisos de saida', () => {
    const um = montar(json(200, SESSAO), { busca: '?motivo=saiu' });
    expect(screen.getByRole('status')).toHaveTextContent('Você saiu do backoffice.');
    um.unmount();
    montar(json(200, SESSAO), { busca: '?motivo=saiu_todas' });
    expect(screen.getByRole('status')).toHaveTextContent('Você saiu do backoffice em todos os navegadores e computadores.');
  });
});
