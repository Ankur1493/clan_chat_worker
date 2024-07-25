import express from 'express';
import dotenv from 'dotenv';
import cors from 'cors';
import WebSocket, { WebSocketServer } from 'ws';
import mongoose from 'mongoose';

dotenv.config();

const PORT = process.env.PORT || 8080;
const MONGO_URI = process.env.URI as string;

const app = express();
app.use(express.json());
app.use(cors());

mongoose.connect(MONGO_URI)
  .then(() => {
    console.log('MongoDB connected');

    const httpServer = app.listen(PORT, () => {
      console.log(`Server is running on port ${PORT}`);
    });

    const wss = new WebSocketServer({ server: httpServer });

    wss.on('connection', function connection(ws) {
      ws.on('error', console.error);

      ws.on('message', function message(data, isBinary) {
        wss.clients.forEach(function each(client) {
          if (client.readyState === WebSocket.OPEN) {
            client.send(data, { binary: isBinary });
          }
        });
      });

      ws.send('Hello! Message From Server!!');
    });

  })
  .catch((err) => {
    console.error('MongoDB connection error:', err);
    process.exit(1)
  });

