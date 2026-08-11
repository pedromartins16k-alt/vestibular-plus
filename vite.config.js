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
        flashcards: resolve(__dirname, 'src/pages/flashcards.html'),
        novaSenha: resolve(__dirname, 'src/pages/nova-senha.html'),
        cronograma: resolve(__dirname, 'src/pages/cronograma.html'),
        metas: resolve(__dirname, 'src/pages/metas.html'),
        ranking: resolve(__dirname, 'src/pages/ranking.html'),
        vestibulares: resolve(__dirname, 'src/pages/vestibulares.html'),
        perfil: resolve(__dirname, 'src/pages/perfil.html'),
        progresso: resolve(__dirname, 'src/pages/progresso.html'),
        notificacoes: resolve(__dirname, 'src/pages/notificacoes.html'),
        favoritos: resolve(__dirname, 'src/pages/favoritos.html'),
        admin: resolve(__dirname, 'src/pages/admin.html'),
        estatisticas: resolve(__dirname, 'src/pages/estatisticas.html'),
      }
    }
  },
  server: { port: 5173 }
});
