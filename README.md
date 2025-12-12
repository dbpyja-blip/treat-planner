# AssemblyAI Medical Transcription

Medical transcription service using AssemblyAI API with a web-based UI for audio recording and transcription.

## Setup

1. Install dependencies:
```bash
npm install
```

## Usage

### Web UI (Recommended)

Start the server:
```bash
npm start
```

Open your browser and navigate to:
```
http://localhost:3000
```

**Features:**
- **Start Recording**: Click to begin recording audio from your microphone
- **Pause**: Pause/resume recording
- **Stop**: Stop recording
- **Submit**: Upload and transcribe the recorded audio
- **View Transcription**: See the transcription result on the next screen

### Command Line Transcription

For command-line transcription, use:
```bash
npm run transcribe
```

or

```bash
node transcribe.js
```

### Upload Local Audio File

To transcribe a local audio file, uncomment and modify the file upload section in `transcribe.js`:

```javascript
const path = "./my-audio.mp3";
const audioData = await fs.readFile(path);
const uploadResponse = await axios.post(`${baseUrl}/v2/upload`, audioData, {
  headers,
});
const audioUrl = uploadResponse.data.upload_url;
```

Then comment out or remove the hardcoded `audioUrl` line.

## API Key

The API key is configured in `server.js` and `transcribe.js`. For production use, consider using environment variables.

## Supported Audio Formats

- MP3
- WAV
- M4A
- FLAC
- OGG

