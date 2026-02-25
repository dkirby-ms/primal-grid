import { Application } from 'pixi.js';

async function bootstrap(): Promise<void> {
  const app = new Application();

  await app.init({
    width: 800,
    height: 600,
    backgroundColor: 0x000000,
    antialias: true,
  });

  const container = document.getElementById('app');
  if (!container) {
    throw new Error('Could not find #app element');
  }

  container.appendChild(app.canvas);
}

bootstrap().catch(console.error);
