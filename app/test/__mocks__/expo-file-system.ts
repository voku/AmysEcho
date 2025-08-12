const files: Record<string, string> = {};

export const documentDirectory = '/mock-docs/';
export const writeAsStringAsync = jest.fn(async (uri: string, data: string) => {
  files[uri] = data;
});
export const readAsStringAsync = jest.fn(async (uri: string) => files[uri]);
export const getInfoAsync = jest.fn(async (uri: string) => ({ exists: uri in files }));
export const EncodingType = { UTF8: 'utf8' } as const;
export const __resetMock = () => {
  Object.keys(files).forEach((k) => delete files[k]);
};
