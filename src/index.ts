import express, { Express, Request, Response } from "express";
import dotenv from "dotenv";
import cors from "cors";
import mongoose from "mongoose";

dotenv.config();

const app: Express = express();
app.use(cors());
app.use(express.json())
const port = process.env.PORT || 8000;
const URI = process.env.URI as string

app.get("/health", (req: Request, res: Response) => {
  res.send("server is healthy");
});

mongoose.connect(URI)
  .then(() => {
    app.listen(port, () => {
      console.log(`[server]: Server is running at http://localhost:${port}`);
    });
  }).catch(err => {
    console.log(err)
  })


