import express from "express"
import { Response } from 'express';
import dotenv from 'dotenv';
import cors from 'cors';
import WebSocket, { WebSocketServer } from 'ws';
import mongoose from 'mongoose';
import jwt from "jsonwebtoken";
import { PrismaClient } from '@prisma/client';
import Chat from './model/chatModel';

dotenv.config();

const prisma = new PrismaClient();
const PORT = process.env.PORT || 8080;
const MONGO_URI = process.env.URI as string;
const JWT_SECRET = process.env.JWT_SECRET as string

const app = express();
const corsOptions = {
  origin: "http://localhost:3000",
  credentials: true,
};

app.get("/health", (_, res: Response) => {
  res.status(200).json({
    success: "success"
  })
})

app.use(express.json());
app.use(cors(corsOptions));

mongoose.connect(MONGO_URI)
  .then(() => {
    console.log('MongoDB connected');

    const httpServer = app.listen(PORT, () => {
      console.log(`Server is running on port ${PORT}`);
    });

    const wss = new WebSocketServer({ server: httpServer });

    wss.on('connection', (ws) => {
      console.log("User connected");

      ws.on('error', console.error);
      let authenticated = false;

      ws.on('message', async (data, isBinary) => {
        try {
          const message = JSON.parse(data.toString());

          if (message.type === "auth") {
            try {
              const decodedToken = jwt.verify(message.token, JWT_SECRET);
              authenticated = true;
              console.log("User authenticated:", decodedToken);
            } catch (err) {
              console.error('Invalid token');
              ws.close();
            }
            return;
          }

          if (!authenticated) {
            ws.send(JSON.stringify({ error: 'You are not Authorized and donot have token' }));
            console.error('You are not Authorized');
            return;
          }

          if (!message.token || !message.content || !message.userId || !message.serverId || !message.channelId || !message.username) {
            ws.send(JSON.stringify({ error: 'Invalid message format' }));
            console.error('Invalid message format');
            return;
          }
          const validatedFields = await prisma.server.findUnique({
            where: {
              id: message.serverId,
            },
            include: {
              channels: {
                where: {
                  id: message.channelId,
                },
              },
              members: {
                where: {
                  userId: message.userId,
                },
              },
            },
          });

          if (!validatedFields || validatedFields.channels.length === 0 || validatedFields.members.length === 0) {
            ws.send(JSON.stringify({ error: 'fields are not proper' }));
            console.error('Fields are not proper');
            return;
          }

          const chatMessage = new Chat({
            content: message.content,
            userId: message.userId,
            username: message.username,
            channelId: message.channelId,
            serverId: message.serverId,
          });

          await chatMessage.save();


          wss.clients.forEach((client) => {
            if (client.readyState === WebSocket.OPEN) {
              client.send(data, { binary: isBinary });
            }
          });
        } catch (err) {
          console.error('Error processing message:', err);
          ws.send(JSON.stringify({ error: err }));
        }
      });

      ws.send('Hello! Message From Server!!');
    });

  })
  .catch((err) => {
    console.error('MongoDB connection error:', err);
    process.exit(1);
  });

