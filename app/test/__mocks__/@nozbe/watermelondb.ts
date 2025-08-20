export const Database = jest.fn();
export const appSchema = jest.fn();
export const tableSchema = jest.fn();
export const column = jest.fn();
export const Model = jest.fn();
export const Q = {
  where: jest.fn((column: string, value: any) => ({ column, value })),
};
export const Relation = jest.fn();
export const associations = jest.fn();
export const SQLiteAdapter = jest.fn(() => ({
  schema: {},
  initializeJSI: jest.fn(),
}));