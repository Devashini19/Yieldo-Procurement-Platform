import "dotenv/config";
import express from "express";
import cors from "cors";
import farmerRoutes from "./routes/farmers.js";
import adminRoutes from "./routes/admin.js";
import authRoutes from "./routes/auth.js";
import chatbotRoutes from "./routes/chatbot.js";
import adminChatbotRoutes from "./routes/adminChatbot.js";
import ticketRoutes from "./routes/tickets.js";

const app = express();
app.use(cors());
app.use(express.json());

app.use("/api", farmerRoutes);
app.use("/api", adminRoutes);
app.use("/api", authRoutes);
app.use("/api", chatbotRoutes);
app.use("/api", adminChatbotRoutes);
app.use("/api", ticketRoutes);

app.get("/", (req, res) => {
  res.json({ status: "Yieldo API running" });
});

const PORT = process.env.PORT || 4000;
app.listen(PORT, () => {
  console.log(`Yieldo backend running on http://localhost:${PORT}`);
});
