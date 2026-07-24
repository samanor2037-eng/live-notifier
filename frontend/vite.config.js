import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// Chrome disables the deprecated `unload` event by default; TikTok's embed
// scripts still register unload handlers, which floods the console with
// "[Violation] Permissions policy violation: unload is not allowed" warnings.
// Opting back in via Permissions-Policy silences them.
const headers = {
  'Permissions-Policy': 'unload=*',
};

export default defineConfig({
  plugins: [react()],
  server: {
    port: 5173,
    headers,
  },
  preview: {
    headers,
  },
});
