import { Game } from './Game';

const canvas = document.querySelector<HTMLCanvasElement>('#game');
const ui = document.querySelector<HTMLElement>('#ui');
const loading = document.querySelector<HTMLElement>('#loading');
if (!canvas || !ui) throw new Error('Missing #game canvas or #ui root');

try {
  const game = await Game.create(canvas, ui);
  loading?.remove();
  game.start();
} catch (error) {
  console.error(error);
  if (loading) loading.textContent = 'Failed to load the game. Check the console for details.';
}
