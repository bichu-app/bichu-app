// Melhoria progressiva dos formularios publicos. Sem este script tudo funciona
// (o formulario faz POST e o servidor responde a pagina); com ele:
//   - o botao mostra que esta enviando e anuncia isso ao leitor de tela;
//   - um segundo toque no mesmo envio nao manda o formulario duas vezes;
//   - o campo de senha ganha o botao de mostrar e esconder.
// "Uma acao, um caminho" (ADR-0028, item 4): o script nunca chama a API; o
// envio continua sendo o do formulario, para a mesma acao do servidor.

for (const formulario of document.querySelectorAll<HTMLFormElement>('form[data-envio]')) {
  formulario.addEventListener('submit', (evento) => {
    const botao =
      formulario.querySelector<HTMLButtonElement>('button[type="submit"]') ??
      (formulario.id ? document.querySelector<HTMLButtonElement>(`button[type="submit"][form="${formulario.id}"]`) : null);
    if (!botao) return;
    if (botao.getAttribute('aria-busy') === 'true') {
      evento.preventDefault();
      return;
    }
    botao.setAttribute('aria-busy', 'true');
    const anuncio = botao.parentElement?.querySelector<HTMLElement>('[data-anuncio]');
    if (anuncio) anuncio.textContent = botao.dataset.enviando ?? '';
  });
}

// Voltar para a pagina pelo cache do navegador nao pode deixar o botao preso.
window.addEventListener('pageshow', (evento) => {
  if (!evento.persisted) return;
  for (const botao of document.querySelectorAll('button[aria-busy="true"]')) botao.removeAttribute('aria-busy');
  for (const anuncio of document.querySelectorAll<HTMLElement>('[data-anuncio]')) anuncio.textContent = '';
});

for (const botao of document.querySelectorAll<HTMLButtonElement>('button[data-revelar]')) {
  const campo = document.getElementById(botao.dataset.revelar ?? '') as HTMLInputElement | null;
  if (!campo) continue;
  botao.hidden = false;
  botao.addEventListener('click', () => {
    const mostrar = campo.type === 'password';
    campo.type = mostrar ? 'text' : 'password';
    botao.setAttribute('aria-pressed', String(mostrar));
  });
}
