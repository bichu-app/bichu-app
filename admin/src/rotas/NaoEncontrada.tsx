import { Link } from 'react-router';

/** Rota que o painel nao conhece. */
export default function NaoEncontrada() {
  return (
    <div className="form">
      <h1 className="t-headline">Página não encontrada</h1>
      <p className="t-body c-sec">Este endereço não existe no backoffice.</p>
      <Link className="btn sec voltar" to="/loja">
        Ir para a Loja
      </Link>
    </div>
  );
}
