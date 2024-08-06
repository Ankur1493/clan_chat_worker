import express from 'express';
import dotenv from 'dotenv';
import cors from 'cors';
import WebSocket, { WebSocketServer } from 'ws';
import mongoose from 'mongoose';
import jwt from 'jsonwebtoken';
import Chat from './model/chatModel';

dotenv.config();

const PORT = process.env.PORT || 8080;
const MONGO_URI = process.env.URI as string;
const JWT_SECRET = process.env.JWT_SECRET as string;

const app = express();
app.use(express.json());
app.use(cors({
  origin: "http://localhost:3000"
}));

mongoose.connect(MONGO_URI)
  .then(() => {
    console.log('MongoDB connected');

    const httpServer = app.listen(PORT, () => {
      console.log(`Server is running on port ${PORT}`);
    });

    const wss = new WebSocketServer({ server: httpServer });

    wss.on('connection', function connection(ws) {
      console.log("user connected")
      ws.on('error', console.error);

      let authenticated: boolean = false;
      let currentServerId: string | null = null;
      let currentChannelId: string | null = null;
      let currentUserId: string | null = null;

      ws.on('message', async function message(data, isBinary) {
        const parsedMessage = JSON.parse(data.toString());

        // Handle authentication
        try {
          const decodedToken = jwt.verify(parsedMessage.token, JWT_SECRET) as { sub: string };
          authenticated = true;
          currentUserId = decodedToken.sub;
        } catch (err) {
          console.error('Invalid token');
          ws.close();
        }

        if (!authenticated) {
          console.error('Unauthenticated message');
          ws.close();
          return;
        }

        // Handle join message to store server and channel ID
        if (parsedMessage.type === "join") {
          currentServerId = parsedMessage.serverId;
          currentChannelId = parsedMessage.channelId;
          console.log("server joined")
          return;
        }

        // Validate message format
        if (!parsedMessage.content || !parsedMessage.userId || !parsedMessage.username || !parsedMessage.serverId || !parsedMessage.channelId) {
          console.error('Invalid message format');
          return;
        }

        // Verify user ID matches the one in the token
        if (parsedMessage.userId !== currentUserId) {
          console.error('User ID does not match token');
          ws.close();
          return;
        }

        //storing messages in mongodb forever
        const storePersistentMessage = async () => {
          try {
            const chatMessage = new Chat({
              content: parsedMessage.content,
              userId: parsedMessage.userId,
              username: parsedMessage.username,
              channelId: parsedMessage.channelId,
              serverId: parsedMessage.serverId
            });
            await chatMessage.save();
          } catch (err) {
            console.error('Error saving message:', err);
          }
        };
        storePersistentMessage();

        // Broadcast message only to clients in the same server and channel

        wss.clients.forEach((client) => {
          console.log("trying sending")
          if (client.readyState === WebSocket.OPEN
            && currentServerId === parsedMessage.serverId
            && currentChannelId === parsedMessage.channelId) {
            client.send(JSON.stringify({
              content: parsedMessage.content,
              userId: parsedMessage.userId,
              username: parsedMessage.username,
              serverId: parsedMessage.serverId,
              channelId: parsedMessage.channelId
            }), { binary: isBinary });
            console.log("message send")
          }
        });

      });

      ws.on('close', () => {
        console.log("user chala gya")
      });

      ws.send('Hello! Message From Server!!');
    });

  })
  .catch((err) => {
    console.error('MongoDB connection error:', err);
    process.exit(1);
  });
