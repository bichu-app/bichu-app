-- Isca. A marca foi APAGADA de proposito: sem ela o portao fica sem lista, e
-- um portao sem lista aprova tudo em silencio. Ele precisa reprovar aqui.
CREATE TABLE isca (quem_convidou uuid);
COMMENT ON COLUMN isca.quem_convidou IS 'Coluna comum, sem marca nenhuma.';
