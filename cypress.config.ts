import { defineConfig } from 'cypress';
export default defineConfig({
  projectId: 'd6zdjn',
  e2e: { baseUrl: 'http://localhost:3300', supportFile: false },
});
