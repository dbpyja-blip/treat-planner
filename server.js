import express from "express";
import cors from "cors";
import multer from "multer";
import axios from "axios";
import path from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const PORT = 3000;

// Middleware
app.use(cors());
app.use(express.json());
app.use(express.static("public"));

// Configure multer for file uploads
const upload = multer({ 
  storage: multer.memoryStorage(),
  limits: { fileSize: 100 * 1024 * 1024 } // 100MB limit
});

const baseUrl = "https://api.assemblyai.com";
const headers = {
  authorization: "dcdc1cd44c08485789174de212de84c6", // AesthatiQ API Key
};

// Serve the main page
app.get("/", (req, res) => {
  res.sendFile(path.join(__dirname, "public", "index.html"));
});

// Upload audio file to AssemblyAI
app.post("/api/upload", upload.single("audio"), async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ error: "No audio file provided" });
    }

    // Upload to AssemblyAI
    const uploadResponse = await axios.post(
      `${baseUrl}/v2/upload`,
      req.file.buffer,
      { headers }
    );

    res.json({ uploadUrl: uploadResponse.data.upload_url });
  } catch (error) {
    console.error("Upload error:", error);
    res.status(500).json({ 
      error: "Failed to upload audio", 
      details: error.response?.data || error.message 
    });
  }
});

// Start transcription
app.post("/api/transcribe", async (req, res) => {
  try {
    const { audioUrl } = req.body;

    if (!audioUrl) {
      return res.status(400).json({ error: "Audio URL is required" });
    }

    const data = {
      audio_url: audioUrl,
      speech_model: "universal",
    };

    const response = await axios.post(`${baseUrl}/v2/transcript`, data, {
      headers: headers,
    });

    res.json({ transcriptId: response.data.id });
  } catch (error) {
    console.error("Transcription error:", error);
    res.status(500).json({
      error: "Failed to start transcription",
      details: error.response?.data || error.message,
    });
  }
});

// Get transcription status and result
app.get("/api/transcript/:id", async (req, res) => {
  try {
    const { id } = req.params;
    const pollingEndpoint = `${baseUrl}/v2/transcript/${id}`;

    const pollingResponse = await axios.get(pollingEndpoint, {
      headers: headers,
    });

    res.json(pollingResponse.data);
  } catch (error) {
    console.error("Polling error:", error);
    res.status(500).json({
      error: "Failed to get transcription status",
      details: error.response?.data || error.message,
    });
  }
});

app.listen(PORT, () => {
  console.log(`Server running on http://localhost:${PORT}`);
});


