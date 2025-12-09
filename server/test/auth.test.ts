import { Request, Response, NextFunction } from 'express';
import { AuthService } from '../src/services/authService.js';

describe('Auth Middleware', () => {
  let mockReq: Partial<Request>;
  let mockRes: Partial<Response>;
  let mockNext: NextFunction;
  let originalEnv: NodeJS.ProcessEnv;
  let validToken: string;

  beforeAll(() => {
    originalEnv = process.env;
    process.env.JWT_SECRET = 'test-jwt-secret';
    process.env.JWT_REFRESH_SECRET = 'test-refresh-secret';
    process.env.NODE_ENV = 'test';

    // Generate a valid JWT token for testing
    const testUser = {
      id: 'test-user',
      username: 'testuser',
      role: 'caregiver' as const,
    };
    validToken = AuthService.generateTokens(testUser).accessToken;
  });

  // Import after setting environment variables
  let auth: any;
  beforeAll(async () => {
    const authModule = await import('../src/middleware/auth');
    auth = authModule.auth;
  });

  afterAll(() => {
    process.env = originalEnv;
  });

  beforeEach(() => {
    mockReq = {};
    mockRes = {
      status: jest.fn().mockReturnThis(),
      json: jest.fn(),
    };
    mockNext = jest.fn();
  });

  afterEach(() => {
    process.env = originalEnv;
  });

  it('should call next() for valid JWT token', () => {
    mockReq.headers = { authorization: `Bearer ${validToken}` };

    auth(mockReq as Request, mockRes as Response, mockNext);

    expect(mockNext).toHaveBeenCalled();
    expect(mockRes.status).not.toHaveBeenCalled();
  });

  it('should return 401 for missing authorization header', () => {
    mockReq.headers = {};

    auth(mockReq as Request, mockRes as Response, mockNext);

    expect(mockRes.status).toHaveBeenCalledWith(401);
    expect(mockRes.json).toHaveBeenCalledWith({ error: 'Authorization header missing or invalid' });
    expect(mockNext).not.toHaveBeenCalled();
  });

  it('should return 401 for invalid token', () => {
    mockReq.headers = { authorization: 'Bearer invalid-token' };

    auth(mockReq as Request, mockRes as Response, mockNext);

    expect(mockRes.status).toHaveBeenCalledWith(401);
    expect(mockRes.json).toHaveBeenCalledWith({ error: 'Invalid or expired token' });
    expect(mockNext).not.toHaveBeenCalled();
  });

  it('should return 401 for wrong format', () => {
    mockReq.headers = { authorization: 'invalid-format' };

    auth(mockReq as Request, mockRes as Response, mockNext);

    expect(mockRes.status).toHaveBeenCalledWith(401);
    expect(mockRes.json).toHaveBeenCalledWith({ error: 'Authorization header missing or invalid' });
    expect(mockNext).not.toHaveBeenCalled();
  });

  it('should attach user to request for valid token', () => {
    mockReq.headers = { authorization: `Bearer ${validToken}` };

    auth(mockReq as Request, mockRes as Response, mockNext);

    expect(mockReq.user).toBeDefined();
    expect(mockReq.user?.id).toBe('test-user');
    expect(mockReq.user?.username).toBe('testuser');
    expect(mockReq.user?.role).toBe('caregiver');
  });

});