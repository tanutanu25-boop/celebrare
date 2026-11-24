
const express = require("express");
const cors = require("cors");
const mongoose = require("mongoose");
require("dotenv").config();

const app = express();

app.use(cors());
app.use(express.json());

mongoose.connect(process.env.MONGO_URI)
  .then(() => console.log("MongoDB Connected Successfully!"))
  .catch((err) => console.log("MongoDB Error:", err.message));

app.get("/", (req, res) => {
  res.send("Celebrare Backend is Running!");
});

app.get("/api/health", (req, res) => {
  res.json({
    success: true,
    message: "Celebrare API is working!"
  });
});

app.get("/api/test", (req, res) => {
  res.json({
    project: "Celebrare",
    message: "Backend is connected and responding."
  });
});

const PORT = process.env.PORT || 5000;

app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});
