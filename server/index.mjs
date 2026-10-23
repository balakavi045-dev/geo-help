import { createApp } from './app.mjs';
if (process.argv.includes('--production')) process.env.NODE_ENV = 'production';
const port = Number(process.env.PORT || 3001);
createApp().listen(port, '0.0.0.0', () => console.log(`Terra API listening on ${port}`));
