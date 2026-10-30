export function ehAmbienteHospedado(environment: string): boolean {
  return (
    process.env['NODE_ENV'] === 'production' ||
    environment === 'prod' ||
    environment === 'preprod'
  );
}
