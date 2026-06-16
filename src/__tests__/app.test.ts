import request from 'supertest';
import express from 'express';

// Lightweight test app (no DB, no socket.io)
const app = express();
app.use(express.json());

app.get('/health', (req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

app.use((req, res) => {
  res.status(404).json({ success: false, message: 'Route not found' });
});

describe('Server Health', () => {
  it('GET /health harus mengembalikan status ok', async () => {
    const res = await request(app).get('/health');
    expect(res.status).toBe(200);
    expect(res.body.status).toBe('ok');
    expect(res.body.timestamp).toBeDefined();
  });

  it('GET /route-yang-tidak-ada harus mengembalikan 404', async () => {
    const res = await request(app).get('/route-yang-tidak-ada');
    expect(res.status).toBe(404);
    expect(res.body.success).toBe(false);
  });
});

describe('API Structure', () => {
  it('JSON body harus bisa diparse', async () => {
    // Test bahwa middleware express.json() bekerja
    const testApp = express();
    testApp.use(express.json());
    testApp.post('/test', (req, res) => {
      res.json({ received: req.body });
    });

    const res = await request(testApp)
      .post('/test')
      .send({ nama: 'Test', nilai: 100 })
      .set('Content-Type', 'application/json');

    expect(res.status).toBe(200);
    expect(res.body.received.nama).toBe('Test');
    expect(res.body.received.nilai).toBe(100);
  });
});

describe('Middleware Auth Guard', () => {
  it('Request tanpa token Authorization harus ditolak dari endpoint terproteksi', async () => {
    // Simulate auth middleware logic
    const authApp = express();
    authApp.use(express.json());

    // Simulate the auth middleware
    const fakeAuthMiddleware = (req: any, res: any, next: any) => {
      const authHeader = req.headers['authorization'];
      if (!authHeader || !authHeader.startsWith('Bearer ')) {
        return res.status(401).json({ success: false, message: 'Token tidak valid' });
      }
      next();
    };

    authApp.get('/protected', fakeAuthMiddleware, (req, res) => {
      res.json({ success: true, message: 'Berhasil diakses' });
    });

    // Test without token
    const resNoToken = await request(authApp).get('/protected');
    expect(resNoToken.status).toBe(401);
    expect(resNoToken.body.success).toBe(false);

    // Test with token
    const resWithToken = await request(authApp)
      .get('/protected')
      .set('Authorization', 'Bearer some-valid-token');
    expect(resWithToken.status).toBe(200);
    expect(resWithToken.body.success).toBe(true);
  });
});
