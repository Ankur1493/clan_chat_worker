import mongoose from "mongoose";

const chatSchema = new mongoose.Schema({
  content: { type: String, required: true },
  userId: { type: String, required: true },
  username: { type: String, required: true },
  channelId: { type: String, required: true },
  serverId: { type: String, required: true },
  timestamp: { type: Date, default: Date.now }
});

chatSchema.index({ serverId: 1, channelId: 1, timestamp: -1 });

const Chat = mongoose.model('Chat', chatSchema);

export default Chat

