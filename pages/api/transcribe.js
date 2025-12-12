import axios from "axios";

// Starts a transcription job with AssemblyAI for a given audio URL.
export default async function handler(req, res) {
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  const apiKey = process.env.ASSEMBLYAI_API_KEY || "dcdc1cd44c08485789174de212de84c6";
  if (!apiKey) {
    return res.status(500).json({ error: "Missing AssemblyAI API key" });
  }

  const { audioUrl } = req.body || {};
  if (!audioUrl) {
    return res.status(400).json({ error: "Audio URL is required" });
  }

  try {
    const data = { audio_url: audioUrl, speech_model: "universal" };
    const response = await axios.post("https://api.assemblyai.com/v2/transcript", data, {
      headers: { authorization: apiKey },
    });

    return res.status(200).json({ transcriptId: response.data.id });
  } catch (error) {
    console.error("Transcription start error:", error);
    const details = error.response?.data || error.message || "Failed to start transcription";
    return res.status(500).json({ error: "Failed to start transcription", details });
  }
}

