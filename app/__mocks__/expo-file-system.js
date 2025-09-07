
let fs = {};

export const documentDirectory = 'file:///test-documents/';
export const cacheDirectory = 'file:///test-cache/';

export async function getInfoAsync(fileUri) {
  if (fs[fileUri]) {
    return { exists: true, isDirectory: false, uri: fileUri };
  }
  return { exists: false, isDirectory: false, uri: fileUri };
}

export async function readAsStringAsync(fileUri) {
  return fs[fileUri] || null;
}

export async function writeAsStringAsync(fileUri, contents) {
  fs[fileUri] = contents;
}

export async function deleteAsync(fileUri) {
  delete fs[fileUri];
}

export async function moveAsync(options) {
  fs[options.to] = fs[options.from];
  delete fs[options.from];
}

export async function makeDirectoryAsync(fileUri) {
  // no-op
}

export function __clear() {
  fs = {};
}
