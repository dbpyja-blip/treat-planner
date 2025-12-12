import axios from "axios";
import formidable from "formidable";
import fs from "fs/promises";

export const config = {
  api: {
    bodyParser: false,
    sizeLimit: "100mb",
  },
};

// Parses multipart form data and uploads the audio file to AssemblyAI.
export default async function handler(req, res) {
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  const apiKey = process.env.ASSEMBLYAI_API_KEY || "dcdc1cd44c08485789174de212de84c6";
  if (!apiKey) {
    return res.status(500).json({ error: "Missing AssemblyAI API key" });
  }

  try {
    const { file } = await parseForm(req);
    // Formidable may return a single file object or an array; normalize it.
    const audioFile = Array.isArray(file) ? file[0] : file;

    if (!audioFile || !audioFile.filepath) {
      return res.status(400).json({ error: "No audio file provided" });
    }

    const fileBuffer = await fs.readFile(audioFile.filepath);
    const uploadResponse = await axios.post(
      "https://api.assemblyai.com/v2/upload",
      fileBuffer,
      {
        headers: { authorization: apiKey },
        maxBodyLength: Infinity,
      }
    );

    return res.status(200).json({ uploadUrl: uploadResponse.data.upload_url });
  } catch (error) {
    console.error("Upload error:", error);
    const details = error.response?.data || error.message || "Upload failed";
    return res.status(500).json({ error: "Failed to upload audio", details });
  }
}

function parseForm(req) {
  const form = formidable({ maxFileSize: 100 * 1024 * 1024, multiples: false });
  return new Promise((resolve, reject) => {
    form.parse(req, (err, fields, files) => {
      if (err) return reject(err);
      const file = files.audio;
      resolve({ fields, file });
    });
  });
}

