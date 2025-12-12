// Audio recording state
// These primitives track the lifetime of a single capture: chunks while recording,
// the final blob once stopped, and flags so the UI can mirror recorder status.
let mediaRecorder = null;
let audioChunks = [];
let audioBlob = null;
let isRecording = false;
let isPaused = false;
let startTime = null;
let elapsedTime = 0;
let timerInterval = null;

// DOM elements
// We cache every node we touch to avoid repeated lookups and make the flow clearer.
const recordBtn = document.getElementById("recordBtn");
const pauseBtn = document.getElementById("pauseBtn");
const stopBtn = document.getElementById("stopBtn");
const submitBtn = document.getElementById("submitBtn");
const recordingStatus = document.getElementById("recordingStatus");
const timer = document.getElementById("timer");
const errorMessage = document.getElementById("errorMessage");
const recordingView = document.getElementById("recordingView");
const transcriptionView = document.getElementById("transcriptionView");
const transcriptionContent = document.getElementById("transcriptionContent");
const backBtn = document.getElementById("backBtn");

// Initialize
// Bind all UI events on page load so the controls feel snappy.
async function init() {
  recordBtn.addEventListener("click", startRecording);
  pauseBtn.addEventListener("click", pauseRecording);
  stopBtn.addEventListener("click", stopRecording);
  submitBtn.addEventListener("click", submitTranscription);
  backBtn.addEventListener("click", resetView);
}

// Start recording
// Requests mic access, streams data into MediaRecorder, and updates UI/timer state.
async function startRecording() {
  try {
    errorMessage.innerHTML = "";
    const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
    
    mediaRecorder = new MediaRecorder(stream);
    audioChunks = [];
    elapsedTime = 0;
    
    mediaRecorder.ondataavailable = (event) => {
      if (event.data.size > 0) {
        audioChunks.push(event.data);
      }
    };
    
    mediaRecorder.onstop = () => {
      audioBlob = new Blob(audioChunks, { type: "audio/webm" });
      submitBtn.disabled = false;
      stream.getTracks().forEach(track => track.stop());
    };
    
    mediaRecorder.start();
    isRecording = true;
    isPaused = false;
    startTime = Date.now();
    
    updateUI();
    startTimer();
  } catch (error) {
    console.error("Error starting recording:", error);
    showError("Failed to start recording. Please check microphone permissions.");
  }
}

// Pause recording
// Toggles between pause/resume while preserving elapsed timer state.
function pauseRecording() {
  if (mediaRecorder && mediaRecorder.state === "recording") {
    mediaRecorder.pause();
    isPaused = true;
    stopTimer();
    updateUI();
  } else if (mediaRecorder && mediaRecorder.state === "paused") {
    mediaRecorder.resume();
    isPaused = false;
    startTime = Date.now() - elapsedTime;
    startTimer();
    updateUI();
  }
}

// Stop recording
// Finalizes the blob and resets flags so the user can submit or record again.
function stopRecording() {
  if (mediaRecorder && mediaRecorder.state !== "inactive") {
    mediaRecorder.stop();
    isRecording = false;
    isPaused = false;
    stopTimer();
    updateUI();
  }
}

// Update UI based on recording state
// Keeps button labels, colors, and status text aligned with the recorder lifecycle.
function updateUI() {
  if (isRecording && !isPaused) {
    recordBtn.textContent = "Recording...";
    recordBtn.classList.add("recording");
    recordBtn.disabled = true;
    pauseBtn.disabled = false;
    stopBtn.disabled = false;
    recordingStatus.textContent = "🔴 Recording";
    recordingStatus.classList.add("recording");
  } else if (isPaused) {
    recordBtn.textContent = "Resume";
    recordBtn.classList.remove("recording");
    recordBtn.disabled = false;
    pauseBtn.textContent = "Resume";
    stopBtn.disabled = false;
    recordingStatus.textContent = "⏸ Paused";
    recordingStatus.classList.remove("recording");
    recordingStatus.classList.add("paused");
  } else {
    recordBtn.textContent = "Start Recording";
    recordBtn.classList.remove("recording");
    recordBtn.disabled = false;
    pauseBtn.disabled = true;
    pauseBtn.textContent = "Pause";
    stopBtn.disabled = true;
    recordingStatus.textContent = audioBlob ? "✅ Recording complete" : "";
    recordingStatus.classList.remove("recording", "paused");
  }
}

// Timer functions
// A lightweight stopwatch tied to recording start/resume events.
function startTimer() {
  timerInterval = setInterval(() => {
    elapsedTime = Date.now() - startTime;
    updateTimerDisplay();
  }, 100);
}

function stopTimer() {
  if (timerInterval) {
    clearInterval(timerInterval);
    timerInterval = null;
  }
}

function updateTimerDisplay() {
  const totalSeconds = Math.floor(elapsedTime / 1000);
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  timer.textContent = `${String(minutes).padStart(2, "0")}:${String(seconds).padStart(2, "0")}`;
}

// Submit transcription
// Uploads the recorded blob, kicks off transcription, then polls until complete.
async function submitTranscription() {
  if (!audioBlob) {
    showError("No audio recorded. Please record audio first.");
    return;
  }

  try {
    errorMessage.innerHTML = "";
    submitBtn.disabled = true;
    submitBtn.textContent = "Submitting...";
    
    // Show transcription view
    recordingView.style.display = "none";
    transcriptionView.classList.add("active");
    transcriptionContent.innerHTML = `
      <div class="loading">
        <div class="spinner"></div>
        <p>Uploading audio and processing transcription...</p>
      </div>
    `;

    // Upload audio file
    const formData = new FormData();
    formData.append("audio", audioBlob, "recording.webm");

    const uploadResponse = await fetch("/api/upload", {
      method: "POST",
      body: formData,
    });

    if (!uploadResponse.ok) {
      const error = await uploadResponse.json();
      throw new Error(error.error || "Failed to upload audio");
    }

    const { uploadUrl } = await uploadResponse.json();

    // Start transcription
    const transcribeResponse = await fetch("/api/transcribe", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ audioUrl: uploadUrl }),
    });

    if (!transcribeResponse.ok) {
      const error = await transcribeResponse.json();
      throw new Error(error.error || "Failed to start transcription");
    }

    const { transcriptId } = await transcribeResponse.json();

    // Poll for transcription result
    await pollTranscription(transcriptId);
  } catch (error) {
    console.error("Transcription error:", error);
    showErrorInTranscription(error.message || "Failed to process transcription");
  } finally {
    submitBtn.disabled = false;
    submitBtn.textContent = "Submit for Transcription";
  }
}

// Poll for transcription result
// Reuses the transcript id to fetch status every 3 seconds until finished.
async function pollTranscription(transcriptId) {
  const maxAttempts = 100; // 5 minutes max (100 * 3 seconds)
  let attempts = 0;

  const poll = async () => {
    try {
      const response = await fetch(`/api/transcript/${transcriptId}`);
      
      if (!response.ok) {
        throw new Error("Failed to get transcription status");
      }

      const result = await response.json();

      if (result.status === "completed") {
        transcriptionContent.innerHTML = `
          <div class="transcription-text">${result.text || "No transcription text available"}</div>
        `;
        return;
      } else if (result.status === "error") {
        throw new Error(result.error || "Transcription failed");
      } else {
        // Still processing
        attempts++;
        if (attempts >= maxAttempts) {
          throw new Error("Transcription timeout. Please try again.");
        }
        
        transcriptionContent.innerHTML = `
          <div class="loading">
            <div class="spinner"></div>
            <p>Processing transcription... (${result.status})</p>
          </div>
        `;
        
        setTimeout(poll, 3000); // Poll every 3 seconds
      }
    } catch (error) {
      console.error("Polling error:", error);
      showErrorInTranscription(error.message || "Failed to get transcription");
    }
  };

  poll();
}

// Show error message
function showError(message) {
  errorMessage.innerHTML = `<div class="error">${message}</div>`;
}

// Show error in transcription view
function showErrorInTranscription(message) {
  transcriptionContent.innerHTML = `
    <div class="error">${message}</div>
    <button class="btn-back" onclick="resetView()" style="margin-top: 20px;">Try Again</button>
  `;
}

// Reset view to recording
// Clears the last run so the user can start fresh.
function resetView() {
  recordingView.style.display = "block";
  transcriptionView.classList.remove("active");
  audioBlob = null;
  submitBtn.disabled = true;
  timer.textContent = "00:00";
  recordingStatus.textContent = "";
  errorMessage.innerHTML = "";
  transcriptionContent.innerHTML = "";
}

// Initialize on page load
init();


