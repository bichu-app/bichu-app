import estilos from './Inicio.module.css';

/**
 * Placeholder da fundacao. Nenhuma tela de produto entra sem desenho no Figma;
 * esta rota existe so para provar roteamento, tokens e build.
 */
export default function Inicio() {
  return (
    <main className={estilos.pagina}>
      <h1 className={estilos.titulo}>Backoffice Bichu</h1>
    </main>
  );
}
