/**
 * Phaser 4 Entry Point
 *
 * This module initializes the Phaser game using the PhaserBridge.
 * The bridge exposes methods for the HTML UI to interact with the game.
 *
 * Usage from HTML/JS:
 *   window.phaserBridge.init('phaser-container');
 *   window.phaserBridge.connect(authToken);
 *   window.phaserBridge.joinRoom(roomId, playerName, avatar);
 */

import { phaserBridge } from './PhaserBridge';

// Auto-initialize in development mode
function initGame(): void {
  const container = document.getElementById('phaser-container');
  if (!container) {
    console.warn('Phaser container not found. Call phaserBridge.init() manually when ready.');
    return;
  }

  // Check if this is the development HTML (index-phaser.html)
  const isDevMode = document.title.includes('Development');

  // Initialize Phaser
  phaserBridge.init('phaser-container', isDevMode);

  console.log('Phaser game initialized via main.ts');
}

// Wait for DOM to be ready
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', initGame);
} else {
  initGame();
}

// Export for module usage
export { phaserBridge };
