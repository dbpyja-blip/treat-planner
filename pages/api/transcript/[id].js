import axios from "axios";

// Polls AssemblyAI for the status/result of a transcription job.
export default async function handler(req, res) {
  if (req.method !== "GET") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  const apiKey = process.env.ASSEMBLYAI_API_KEY || "dcdc1cd44c08485789174de212de84c6";
  if (!apiKey) {
    return res.status(500).json({ error: "Missing AssemblyAI API key" });
  }

  const { id } = req.query;
  if (!id) {
    return res.status(400).json({ error: "Transcript id is required" });
  }

  try {
    const pollingEndpoint = `https://api.assemblyai.com/v2/transcript/${id}`;
    const pollingResponse = await axios.get(pollingEndpoint, {
      headers: { authorization: apiKey },
    });

    return res.status(200).json(pollingResponse.data);
  } catch (error) {
    console.error("Polling error:", error);
    const details = error.response?.data || error.message || "Failed to fetch transcription";
    return res.status(500).json({ error: "Failed to get transcription status", details });
  }
}

