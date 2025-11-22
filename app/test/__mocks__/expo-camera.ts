export const Camera = {
  getCameraPermissionsAsync: jest.fn().mockResolvedValue({ granted: true }),
  requestCameraPermissionsAsync: jest.fn().mockResolvedValue({ granted: true }),
  getMicrophonePermissionsAsync: jest.fn().mockResolvedValue({ granted: true }),
  requestMicrophonePermissionsAsync: jest.fn().mockResolvedValue({ granted: true }),
};

export default Camera;
