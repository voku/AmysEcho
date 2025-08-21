jest.mock('../../src/screens/RecognitionScreen', () => 'RecognitionScreen');
import RecognitionScreen from '../../src/screens/RecognitionScreen';
import { render, fireEvent, waitFor } from '@testing-library/react-native';

// Mock the dependencies
jest.mock('../../src/hooks/useTensorflowModel');
jest.mock('../../src/ml/gestureClassifier');

describe.skip('Hybrid Recognition Integration', () => {
  test('should use local classification when confidence is high', async () => {
    const mockClassifyGesture = jest.fn().mockReturnValue({
      label: 'thumbs_up',
      confidence: 0.9,
      probabilities: [0.1, 0.9, 0.0, 0.0, 0.0]
    });
    
    // Mock the hook to return our mock function
    require('../../src/hooks/useTensorflowModel').useTensorflowModel.mockReturnValue({
      classifyGesture: mockClassifyGesture,
      processFrame: jest.fn().mockResolvedValue([/* mock landmarks */]),
      isModelLoaded: true
    });
    
    const { getByTestId } = render(<RecognitionScreen />);
    
    // Simulate frame processing
    const mockFrame = { /* mock camera frame */ };
    // Trigger frame processing somehow (this depends on your implementation)
    
    await waitFor(() => {
      // Verify local classification was used
      expect(mockClassifyGesture).toHaveBeenCalled();
      
      // Verify UI shows the result
      expect(getByTestId('current-gesture')).toHaveTextContent('thumbs_up');
    });
  });
  
  test('should fallback to cloud when local confidence is low', async () => {
    const mockClassifyGesture = jest.fn().mockReturnValue({
      label: 'uncertain',
      confidence: 0.3,
      probabilities: [0.3, 0.2, 0.2, 0.2, 0.1]
    });
    
    // Mock fetch for cloud API
    global.fetch = jest.fn().mockResolvedValueOnce({
      ok: true,
      json: async () => ({ label: 'point', confidence: 0.8 })
    });
    
    require('../../src/hooks/useTensorflowModel').useTensorflowModel.mockReturnValue({
      classifyGesture: mockClassifyGesture,
      processFrame: jest.fn().mockResolvedValue([/* mock landmarks */]),
      isModelLoaded: true
    });
    
    const { getByTestId } = render(<RecognitionScreen />);
    
    // Simulate frame processing
    await waitFor(() => {
      // Verify cloud API was called
      expect(global.fetch).toHaveBeenCalledWith('https://your-server.com/api/recognize-gesture', expect.any(Object));
      
      // Verify UI shows cloud result
      expect(getByTestId('current-gesture')).toHaveTextContent('point');
    });
  });
});
