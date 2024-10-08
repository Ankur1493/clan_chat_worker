import express from 'express';
import dotenv from 'dotenv';
import cors from 'cors';
import WebSocket, { WebSocketServer } from 'ws';
import mongoose from 'mongoose';
import jwt from 'jsonwebtoken';
import Chat from './model/chatModel';
import { Redis } from 'ioredis';

dotenv.config();

const PORT = process.env.PORT || 8080;
const MONGO_URI = process.env.URI as string;
const JWT_SECRET = process.env.JWT_SECRET as string;
const REDIS_URI = process.env.REDIS_URI as string;

const redisPublisher = new Redis(REDIS_URI);
const redisSubscriber = new Redis(REDIS_URI);
redisPublisher.on('error', (err) => {
  console.error('Redis publisher error:', err);
});
redisSubscriber.on('error', (err) => {
  console.error('Redis subscribe error:', err);
});

const app = express();
app.use(express.json());
app.use(cors({
  origin: process.env.CLIENT_URL || "http://localhost:3000"
}));

mongoose.connect(MONGO_URI)
  .then(() => {
    console.log('MongoDB connected');

    const httpServer = app.listen(PORT, () => {
      console.log(`Server is running on port ${PORT}`);
    });

    const wss = new WebSocketServer({ server: httpServer });

    // Map to track connections by serverId and channelId
    const connectionsMap: Map<string, Map<string, Set<WebSocket>>> = new Map();

    wss.on('connection', function connection(ws) {
      console.log("user connected");

      let authenticated: boolean = false;
      let currentServerId: string | null = null;
      let currentChannelId: string | null = null;
      let currentUserId: string | null = null;

      ws.on('message', async function message(data) {
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

          if (!currentServerId || !currentChannelId) {
            console.error('Invalid serverId or channelId');
            ws.close();
            return;
          }

          // Update connections map
          if (!connectionsMap.has(currentServerId)) {
            connectionsMap.set(currentServerId, new Map());
          }
          const channelMap = connectionsMap.get(currentServerId)!;
          if (!channelMap.has(currentChannelId)) {
            channelMap.set(currentChannelId, new Set());
          }
          channelMap.get(currentChannelId)!.add(ws);

          console.log("server joined");
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

        const publishMessage = () => {
          redisPublisher.publish('chat', JSON.stringify(parsedMessage));
        };
        publishMessage();
      });

      ws.on('close', () => {
        console.log("user disconnected");

        // Remove from connections map
        connectionsMap.forEach((channelMap, serverId) => {
          channelMap.forEach((wsSet, channelId) => {
            wsSet.delete(ws);
            if (wsSet.size === 0) {
              channelMap.delete(channelId);
            }
          });
          if (channelMap.size === 0) {
            connectionsMap.delete(serverId);
          }
        });
      });

      ws.send('Hello! Message From Server!!');
    });

    redisSubscriber.subscribe("chat");
    redisSubscriber.on('message', (channel, message) => {
      if (channel === 'chat') {
        const parsedMessage = JSON.parse(message);

        const serverId = parsedMessage.serverId;
        const channelId = parsedMessage.channelId;

        if (connectionsMap.has(serverId)) {
          const channelMap = connectionsMap.get(serverId)!;
          if (channelMap.has(channelId)) {
            const clients = channelMap.get(channelId)!;
            clients.forEach((client) => {
              if (client.readyState === WebSocket.OPEN) {
                client.send(JSON.stringify({
                  content: parsedMessage.content,
                  userId: parsedMessage.userId,
                  username: parsedMessage.username,
                  serverId: parsedMessage.serverId,
                  channelId: parsedMessage.channelId,
                  timestamp: Date.now()
                }));
              }
            });
          }
        }
      }
    });

  })
  .catch((err) => {
    console.error('MongoDB connection error:', err);
    process.exit(1);
  });

