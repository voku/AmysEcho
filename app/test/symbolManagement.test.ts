import { loadSymbols, saveSymbols, getSymbolById } from '../src/services/symbolService';

// Mock WatermelonDB database with in-memory symbols
const mockSymbols: any[] = [
  {
    id: 'hello',
    name: 'Hello',
    emoji: '👋',
    color: '#ffcc00',
    audioUri: 'hello.mp3',
    dgsVideoAssetPath: 'dgs/hello.mp4',
    healthScore: 1,
  },
  {
    id: 'drink',
    name: 'Drink',
    emoji: '🥤',
    color: '#0099ff',
    audioUri: 'drink.mp3',
    dgsVideoAssetPath: 'dgs/drink.mp4',
    healthScore: 1,
  },
  {
    id: 'red',
    name: 'Red',
    emoji: '🔴',
    color: '#ff0000',
    audioUri: 'red.mp3',
    dgsVideoAssetPath: 'dgs/red.mp4',
    healthScore: 1,
  },
  {
    id: 'blue',
    name: 'Blue',
    emoji: '🔵',
    color: '#0000ff',
    audioUri: 'blue.mp3',
    dgsVideoAssetPath: 'dgs/blue.mp4',
    healthScore: 1,
  },
  {
    id: 'green',
    name: 'Green',
    emoji: '🟢',
    color: '#00ff00',
    audioUri: 'green.mp3',
    dgsVideoAssetPath: 'dgs/green.mp4',
    healthScore: 1,
  },
  {
    id: 'yellow',
    name: 'Yellow',
    emoji: '🟡',
    color: '#ffff00',
    audioUri: 'yellow.mp3',
    dgsVideoAssetPath: 'dgs/yellow.mp4',
    healthScore: 1,
  },
  {
    id: 'apple',
    name: 'Apple',
    emoji: '🍎',
    color: '#ff6b35',
    audioUri: 'apple.mp3',
    dgsVideoAssetPath: 'dgs/apple.mp4',
    healthScore: 1,
  },
  {
    id: 'banana',
    name: 'Banana',
    emoji: '🍌',
    color: '#ffe135',
    audioUri: 'banana.mp3',
    dgsVideoAssetPath: 'dgs/banana.mp4',
    healthScore: 1,
  },
  {
    id: 'bread',
    name: 'Bread',
    emoji: '🍞',
    color: '#d2691e',
    audioUri: 'bread.mp3',
    dgsVideoAssetPath: 'dgs/bread.mp4',
    healthScore: 1,
  },
  {
    id: 'milk',
    name: 'Milk',
    emoji: '🥛',
    color: '#ffffff',
    audioUri: 'milk.mp3',
    dgsVideoAssetPath: 'dgs/milk.mp4',
    healthScore: 1,
  },
];

jest.mock('../db', () => {
  const mockCollection = {
    query: () => ({ fetch: async () => mockSymbols }),
    find: async (id: string) => {
      const symbol = mockSymbols.find(s => s.id === id);
      if (!symbol) throw new Error('not found');
      return symbol;
    },
    create: (cb: any) => {
      const symbol: any = {};
      cb(symbol);
      const index = mockSymbols.findIndex(s => s.id === symbol.id);
      if (index >= 0) {
        mockSymbols[index] = symbol;
      } else {
        mockSymbols.push(symbol);
      }
    },
  };
  const mockDatabase = {
    get: () => mockCollection,
    write: async (fn: any) => fn(),
  };
  return { database: mockDatabase };
});

describe('Symbol Management - Colors and Food for Amy', () => {
  describe('Color Symbols', () => {
    it('loads red symbol correctly', async () => {
      const symbols = await loadSymbols();
      const redSymbol = symbols.find(s => s.id === 'red');

      expect(redSymbol).toBeDefined();
      expect(redSymbol!.name).toBe('Red');
      expect(redSymbol!.emoji).toBe('🔴');
      expect(redSymbol!.color).toBe('#ff0000');
      expect(redSymbol!.audioUri).toBe('red.mp3');
      expect(redSymbol!.dgsVideoUri).toBe('dgs/red.mp4');
    });

    it('loads blue symbol correctly', async () => {
      const symbols = await loadSymbols();
      const blueSymbol = symbols.find(s => s.id === 'blue');

      expect(blueSymbol).toBeDefined();
      expect(blueSymbol!.name).toBe('Blue');
      expect(blueSymbol!.emoji).toBe('🔵');
      expect(blueSymbol!.color).toBe('#0000ff');
    });

    it('loads green symbol correctly', async () => {
      const symbols = await loadSymbols();
      const greenSymbol = symbols.find(s => s.id === 'green');

      expect(greenSymbol).toBeDefined();
      expect(greenSymbol!.name).toBe('Green');
      expect(greenSymbol!.emoji).toBe('🟢');
      expect(greenSymbol!.color).toBe('#00ff00');
    });

    it('loads yellow symbol correctly', async () => {
      const symbols = await loadSymbols();
      const yellowSymbol = symbols.find(s => s.id === 'yellow');

      expect(yellowSymbol).toBeDefined();
      expect(yellowSymbol!.name).toBe('Yellow');
      expect(yellowSymbol!.emoji).toBe('🟡');
      expect(yellowSymbol!.color).toBe('#ffff00');
    });
  });

  describe('Food Symbols', () => {
    it('loads apple symbol correctly', async () => {
      const symbols = await loadSymbols();
      const appleSymbol = symbols.find(s => s.id === 'apple');

      expect(appleSymbol).toBeDefined();
      expect(appleSymbol!.name).toBe('Apple');
      expect(appleSymbol!.emoji).toBe('🍎');
      expect(appleSymbol!.color).toBe('#ff6b35');
      expect(appleSymbol!.audioUri).toBe('apple.mp3');
    });

    it('loads banana symbol correctly', async () => {
      const symbols = await loadSymbols();
      const bananaSymbol = symbols.find(s => s.id === 'banana');

      expect(bananaSymbol).toBeDefined();
      expect(bananaSymbol!.name).toBe('Banana');
      expect(bananaSymbol!.emoji).toBe('🍌');
      expect(bananaSymbol!.color).toBe('#ffe135');
    });

    it('loads bread symbol correctly', async () => {
      const symbols = await loadSymbols();
      const breadSymbol = symbols.find(s => s.id === 'bread');

      expect(breadSymbol).toBeDefined();
      expect(breadSymbol!.name).toBe('Bread');
      expect(breadSymbol!.emoji).toBe('🍞');
      expect(breadSymbol!.color).toBe('#d2691e');
    });

    it('loads milk symbol correctly', async () => {
      const symbols = await loadSymbols();
      const milkSymbol = symbols.find(s => s.id === 'milk');

      expect(milkSymbol).toBeDefined();
      expect(milkSymbol!.name).toBe('Milk');
      expect(milkSymbol!.emoji).toBe('🥛');
      expect(milkSymbol!.color).toBe('#ffffff');
    });
  });

  describe('Symbol Retrieval', () => {
    it('retrieves symbol by ID', async () => {
      const redSymbol = await getSymbolById('red');
      expect(redSymbol).toBeDefined();
      expect(redSymbol!.id).toBe('red');
      expect(redSymbol!.name).toBe('Red');
    });

    it('returns null for non-existent symbol', async () => {
      const nonExistent = await getSymbolById('nonexistent');
      expect(nonExistent).toBeNull();
    });

    it('loads all Amy-appropriate symbols', async () => {
      const symbols = await loadSymbols();
      const amySymbols = symbols.filter(s =>
        ['hello', 'drink', 'red', 'blue', 'green', 'yellow', 'apple', 'banana', 'bread', 'milk'].includes(s.id)
      );

      expect(amySymbols).toHaveLength(10);
      expect(amySymbols.every(s => s.healthScore === 1)).toBe(true);
    });
  });

  describe('Symbol Categories', () => {
    it('identifies color symbols correctly', async () => {
      const symbols = await loadSymbols();
      const colorSymbols = symbols.filter(s =>
        ['red', 'blue', 'green', 'yellow'].includes(s.id)
      );

      expect(colorSymbols).toHaveLength(4);
      colorSymbols.forEach(symbol => {
        expect(symbol.name).toMatch(/(Red|Blue|Green|Yellow)/);
        expect(symbol.emoji).toMatch(/[🔴🔵🟢🟡]/);
      });
    });

    it('identifies food symbols correctly', async () => {
      const symbols = await loadSymbols();
      const foodSymbols = symbols.filter(s =>
        ['apple', 'banana', 'bread', 'milk', 'drink'].includes(s.id)
      );

      expect(foodSymbols).toHaveLength(5);
      foodSymbols.forEach(symbol => {
        expect(symbol.name).toMatch(/(Apple|Banana|Bread|Milk|Drink)/);
        expect(symbol.emoji).toMatch(/[🍎🍌🍞🥛🥤]/);
      });
    });

    it('all symbols have required properties', async () => {
      const symbols = await loadSymbols();

      symbols.forEach(symbol => {
        expect(symbol.id).toBeDefined();
        expect(symbol.name).toBeDefined();
        expect(symbol.emoji).toBeDefined();
        expect(symbol.color).toBeDefined();
        expect(symbol.audioUri).toBeDefined();
        expect(symbol.dgsVideoUri).toBeDefined();
        expect(symbol.healthScore).toBeDefined();
      });
    });
  });

  describe('Symbol Persistence', () => {
    it('saves symbols correctly', async () => {
      const testSymbols = [
        {
          id: 'test_red',
          name: 'Test Red',
          emoji: '🔴',
          color: '#ff0000',
          audioUri: 'test_red.mp3',
          dgsVideoUri: 'dgs/test_red.mp4',
          healthScore: 1
        }
      ];

      await saveSymbols(testSymbols);
      const loadedSymbols = await loadSymbols();
      const testSymbol = loadedSymbols.find(s => s.id === 'test_red');

      expect(testSymbol).toBeDefined();
      expect(testSymbol!.name).toBe('Test Red');
    });

    it('handles symbol updates', async () => {
      const updatedSymbol = {
        id: 'red',
        name: 'Updated Red',
        emoji: '🔴',
        color: '#ff0000',
        audioUri: 'red.mp3',
        dgsVideoUri: 'dgs/red.mp4',
        healthScore: 1
      };

      await saveSymbols([updatedSymbol]);
      const loadedSymbol = await getSymbolById('red');

      expect(loadedSymbol!.name).toBe('Updated Red');
    });
  });
});