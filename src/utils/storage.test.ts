import test from 'node:test';
import assert from 'node:assert';
import {
  isStorageExplicitlyCleared,
  setStorageExplicitlyCleared,
  hasUserVisitedBefore,
  markUserVisited
} from './storage.js';

// Setup mock global window and localStorage for node:test environment
const mockStorage: Record<string, string> = {};
(global as any).window = {
  localStorage: {
    getItem: (key: string) => mockStorage[key] || null,
    setItem: (key: string, val: string) => { mockStorage[key] = val; },
    removeItem: (key: string) => { delete mockStorage[key]; },
    clear: () => {
      for (const k in mockStorage) delete mockStorage[k];
    }
  }
};

test('storage helpers: tracks explicitly cleared flag correctly', () => {
  (global as any).window.localStorage.clear();

  assert.strictEqual(isStorageExplicitlyCleared(), false);

  setStorageExplicitlyCleared(true);
  assert.strictEqual(isStorageExplicitlyCleared(), true);

  setStorageExplicitlyCleared(false);
  assert.strictEqual(isStorageExplicitlyCleared(), false);
});

test('storage helpers: tracks user first visit flag', () => {
  (global as any).window.localStorage.clear();

  assert.strictEqual(hasUserVisitedBefore(), false);

  markUserVisited();
  assert.strictEqual(hasUserVisitedBefore(), true);
});
