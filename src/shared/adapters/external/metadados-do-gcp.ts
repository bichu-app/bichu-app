/**
 * O endereco do token da conta de servico da VM, no servidor de metadados do
 * GCP. Um so, para os tres adaptadores que o usam (Secret Manager, FCM e
 * reCAPTCHA Enterprise).
 *
 * `service-accounts/default/token`, no PLURAL e com a conta: a forma sem
 * `default` (`instance/service-account/token`) responde 404, e foi ela que
 * esteve aqui ate 29/09 nos tres adaptadores, derrubando o login do painel em
 * hml. O DevOps conferiu as duas formas de dentro do container na VM. Os
 * testes dos tres adaptadores so respondem neste endereco EXATO, como o
 * servidor de verdade: outra forma volta a reprovar.
 *
 * Nao e dominio publico: so resolve dentro da VM.
 */
export const TOKEN_DA_CONTA_DE_SERVICO =
  'http://metadata.google.internal/computeMetadata/v1/instance/service-accounts/default/token';
