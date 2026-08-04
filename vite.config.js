import { defineConfig } from 'vite';
import { resolve } from 'path';

// Configuração multi-página: cada HTML em src/pages vira uma rota estática.
export default defineConfig({
  root: 'src',
  publicDir: '../public',
  build: {
    outDir: '../dist',
    emptyOutDir: true,
    rollupOptions: {
      input: {
        main: resolve(__dirname, 'src/index.html'),
        login: resolve(__dirname, 'src/pages/login.html'),
        cadastro: resolve(__dirname, 'src/pages/cadastro.html'),
        recuperarSenha: resolve(__dirname, 'src/pages/recuperar-senha.html'),
        dashboard: resolve(__dirname, 'src/pages/dashboard.html'),
        resumos: resolve(__dirname, 'src/pages/resumos.html'),
       questoes: resolve(__dirname, 'src/pages/questoes.html'),
        simulados: resolve(__dirname, 'src/pages/simulados.html'),
      }
    }
  },
  server: { port: 5173 }
});
