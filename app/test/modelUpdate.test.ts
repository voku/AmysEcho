jest.mock('../src/services/dgsModelClient', () => ({
  fetchMlpModel: jest.fn(),
  fetchCentroids: jest.fn(),
}));

const { fetchMlpModel, fetchCentroids } = require('../src/services/dgsModelClient');

const { checkForModelUpdate } = require('../src/services/modelUpdate');

describe('checkForModelUpdate', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('returns true when fetchMlpModel provides data', async () => {
    (fetchMlpModel as jest.Mock).mockResolvedValue('base64-model');

    const result = await checkForModelUpdate();

    expect(fetchMlpModel).toHaveBeenCalledWith(undefined);
    expect(result).toBe(true);
    expect(fetchCentroids).not.toHaveBeenCalled();
  });

  it('falls back to centroid refresh when MLP unavailable', async () => {
    (fetchMlpModel as jest.Mock).mockResolvedValue(null);
    (fetchCentroids as jest.Mock).mockResolvedValue({ centroids: {}, counts: {} });

    const result = await checkForModelUpdate('profile-1');

    expect(fetchMlpModel).toHaveBeenCalledWith('profile-1');
    expect(fetchCentroids).toHaveBeenCalledWith('profile-1');
    expect(result).toBe(true);
  });

  it('returns false when neither MLP nor centroid model is available', async () => {
    (fetchMlpModel as jest.Mock).mockResolvedValue(null);
    (fetchCentroids as jest.Mock).mockResolvedValue(null);

    const result = await checkForModelUpdate();

    expect(result).toBe(false);
  });
});
