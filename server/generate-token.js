import jwt from 'jsonwebtoken';

const JWT_SECRET = 'test-secret';

const user = {
  userId: 'test-user-123',
  username: 'testuser',
  role: 'user'
};

const token = jwt.sign(user, JWT_SECRET, { expiresIn: '15m' });
console.log('Bearer', token);