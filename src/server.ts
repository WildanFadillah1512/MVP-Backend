import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import morgan from 'morgan';
import dotenv from 'dotenv';
import { createServer } from 'http';
import { initSocket } from './socket';
import routes from './routes';
import { setupCronJobs } from './utils/cron';

dotenv.config();

const app = express();
const httpServer = createServer(app);
initSocket(httpServer);

app.use(express.json());
app.use(cors({
  origin: process.env.CORS_ORIGIN || '*',
}));
app.use(helmet());
app.use(morgan('dev'));

app.use('/api', routes);

app.get('/health', (req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

// 404 handler
app.use((req, res) => {
  res.status(404).json({
    success: false,
    message: 'Route not found'
  });
});

const PORT = process.env.PORT || 8080;

setupCronJobs();

httpServer.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});
