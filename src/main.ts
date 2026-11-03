import { Game } from './Game';

const canvas = document.querySelector<HTMLCanvasElement>('#game');
const loading = document.querySelector<HTMLElement>('#loading');
if (!canvas) throw new Error('Missing #game canvas');

try {
  const game = await Game.create(canvas);
  loading?.remove();
  game.start();
} catch (error) {
  console.error(error);
  if (loading) loading.textContent = 'Failed to load the game. Check the console for details.';
}
