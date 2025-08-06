import { getEncouragementMessage } from '../src/services/encouragementService';

describe('encouragementService', () => {
  it('includes gesture name in message', () => {
    const msg = getEncouragementMessage('Winken');
    expect(msg).toMatch(/Winken/);
  });
});
