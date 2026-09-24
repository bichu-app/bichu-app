// Configuracao minima do site (ADR-0028, item 9). O desenho real das paginas e
// do front; o que esta aqui e o encanamento que a imagem e a borda precisam:
// saida estatica por padrao, rotas com parametro renderizadas no servidor pelo
// adaptador Node em modo `middleware`, montado por `servidor.mjs`.
import { defineConfig } from 'astro/config';
import node from '@astrojs/node';

export default defineConfig({
  output: 'static',
  adapter: node({ mode: 'middleware' }),
});
