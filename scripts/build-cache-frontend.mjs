import { build } from 'vite';

process.env.VITE_CACHE_API_ENABLED = 'true';
process.env.VITE_API_BASE_URL = '/api';
await build();
