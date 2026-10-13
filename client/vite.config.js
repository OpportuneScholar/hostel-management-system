import { defineConfig } from 'vite';
export default defineConfig({ server: { port: 5173, host: '0.0.0.0', proxy: { '/api': 'http://127.0.0.1:3001' } } });
