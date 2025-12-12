// Install the axios and fs-extra package by executing the command "npm install axios fs-extra"

import axios from "axios";
import fs from "fs-extra";

const baseUrl = "https://api.assemblyai.com";
const headers = {
  authorization: "dcdc1cd44c08485789174de212de84c6", // AesthatiQ API Key
};

// You can upload a local file using the following code
// const path = "./my-audio.mp3";
// const audioData = await fs.readFile(path);
// const uploadResponse = await axios.post(`${baseUrl}/v2/upload`, audioData, {
//   headers,
// });
// const audioUrl = uploadResponse.data.upload_url;

const audioUrl = "https://assembly.ai/wildfires.mp3";

const data = {
  audio_url: audioUrl,
  speech_model: "universal",
};

const url = `${baseUrl}/v2/transcript`;

const response = await axios.post(url, data, { headers: headers });

const transcriptId = response.data.id;

const pollingEndpoint = `${baseUrl}/v2/transcript/${transcriptId}`;

while (true) {
  const pollingResponse = await axios.get(pollingEndpoint, {
    headers: headers,
  });

  const transcriptionResult = pollingResponse.data;

  if (transcriptionResult.status === "completed") {
    console.log(transcriptionResult.text);
    break;
  } else if (transcriptionResult.status === "error") {
    throw new Error(`Transcription failed: ${transcriptionResult.error}`);
  } else {
    await new Promise((resolve) => setTimeout(resolve, 3000));
  }
}

