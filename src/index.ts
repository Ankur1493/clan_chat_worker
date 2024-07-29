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

    // Store clients with their server and channel information
    const clients = new Map();

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
        if (parsedMessage.type === "auth") {
          try {
            const decodedToken = jwt.verify(parsedMessage.token, JWT_SECRET) as { userId: string };
            authenticated = true;
            currentUserId = decodedToken.userId;
            console.log("User authenticated:", decodedToken.userId);
          } catch (err) {
            console.error('Invalid token');
            ws.close();
          }
          return;
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
          clients.set(ws, { serverId: currentServerId, channelId: currentChannelId });
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
          const clientInfo = clients.get(client);
          if (client.readyState === WebSocket.OPEN && clientInfo
            && clientInfo.serverId === parsedMessage.serverId
            && clientInfo.channelId === parsedMessage.channelId) {
            client.send(data, { binary: isBinary });
          }
        });
      });

      ws.on('close', () => {
        clients.delete(ws);
        console.log("user chala gya")
      });

      ws.send('Hello! Message From Server!!');
    });

  })
  .catch((err) => {
    console.error('MongoDB connection error:', err);
    process.exit(1);
  });
