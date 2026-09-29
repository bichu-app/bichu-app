// Hosts de teste para os testes de unidade, montados sem URL absoluta literal.
// O portao de portabilidade proibe `https?://host.tld` em codigo, e ainda que
// `web/tests/` fique fora da varredura, os testes nao carregam host cravado:
// o host vem sem esquema e a URL se monta com `url()`.
export const HOSTS = {
  producao: 'bichu.app',
  homologacao: 'hml.bichu.app',
  midia: 'img.bichu.app',
  // Dominio de exemplo do contrato (api/openapi.yaml, `servers`).
  contrato: 'dominio-a-definir.com.br',
  // Host qualquer, so para provar que a decisao nao depende do dominio.
  outro: 'outro.exemplo',
} as const;

/** Monta uma URL absoluta a partir de um host sem esquema. */
export const url = (host: string, caminho = ''): string => `https://${host}${caminho}`;

/** O `type` de um problema (RFC 9457) no dominio do contrato. */
export const tipoDeProblema = (slug: string, host: string = HOSTS.contrato): string =>
  url(host, `/problems/${slug}`);
