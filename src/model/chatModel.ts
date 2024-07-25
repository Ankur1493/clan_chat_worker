import mongoose from "mongoose";

const chatSchema = new mongoose.Schema({
  content: { type: String, required: true },
  userId: { type: String, required: true }, // user ID from PostgreSQL
  channelId: { type: String, required: true }, // channel ID from PostgreSQL
  serverId: { type: String, required: true }, // server ID from PostgreSQL
  timestamp: { type: Date, default: Date.now }
});

const Chat = mongoose.model('Chat', chatSchema);

export default Chat

