export const Database = jest.fn();
export const appSchema = jest.fn();
export const tableSchema = jest.fn();
export const column = jest.fn();
export const Model = jest.fn();
export const Q = {
  where: jest.fn((column: string, value: unknown) =>
    value != null && typeof value === 'object' && 'values' in (value as any)
      ? { left: column, comparison: { right: { values: (value as any).values } } }
      : { left: column, comparison: { right: { value } } }
  ),
  oneOf: jest.fn((values: any[]) => ({ values })),
};
export const Relation = jest.fn();
export const associations = jest.fn();
export const SQLiteAdapter = jest.fn(() => ({
  schema: {},
  initializeJSI: jest.fn(),
}));