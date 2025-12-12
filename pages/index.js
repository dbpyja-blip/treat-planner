import { useEffect, useRef, useState } from "react";
import Head from "next/head";
import { useRouter } from "next/router";

// Main UI for recording and transcription with brown/gold/white theme.
export default function Home() {
  const router = useRouter();
  const mediaRecorderRef = useRef(null);
  const audioChunksRef = useRef([]);
  const audioBlobRef = useRef(null);
  const timerRef = useRef(null);
  const startTimeRef = useRef(null);
  const pollTimeoutRef = useRef(null);

  const [recordingState, setRecordingState] = useState("idle"); // idle | recording | paused | stopped
  const [elapsedMs, setElapsedMs] = useState(0);
  const [error, setError] = useState("");
  const [canSubmit, setCanSubmit] = useState(false);

  const [transcriptionStatus, setTranscriptionStatus] = useState("idle"); // idle | uploading | processing | completed | error
  const [transcriptionText, setTranscriptionText] = useState("");
  const [transcriptionMessage, setTranscriptionMessage] = useState("Processing transcription...");

  // Treatment planning state (now handled in dedicated planner page; kept for compatibility)
  const [planError, setPlanError] = useState("");

  useEffect(() => {
    // Cleanup timers and polling on unmount so we don't leak handles.
    return () => {
      stopTimer();
      if (pollTimeoutRef.current) {
        clearTimeout(pollTimeoutRef.current);
      }
      if (mediaRecorderRef.current && mediaRecorderRef.current.state !== "inactive") {
        mediaRecorderRef.current.stop();
      }
    };
  }, []);

  const formatTime = (ms) => {
    const totalSeconds = Math.floor(ms / 1000);
    const minutes = Math.floor(totalSeconds / 60);
    const seconds = totalSeconds % 60;
    return `${String(minutes).padStart(2, "0")}:${String(seconds).padStart(2, "0")}`;
  };

  const startTimer = () => {
    startTimeRef.current = Date.now();
    setElapsedMs(0);
    timerRef.current = setInterval(() => {
      setElapsedMs(Date.now() - startTimeRef.current);
    }, 100);
  };

  const stopTimer = () => {
    if (timerRef.current) {
      clearInterval(timerRef.current);
      timerRef.current = null;
    }
  };

  const startRecording = async () => {
    try {
      setError("");
      setTranscriptionStatus("idle");
      setTranscriptionText("");
      setTranscriptionMessage("Processing transcription...");
      audioChunksRef.current = [];
      audioBlobRef.current = null;
      setCanSubmit(false);

      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const recorder = new MediaRecorder(stream);
      mediaRecorderRef.current = recorder;

      recorder.ondataavailable = (event) => {
        if (event.data.size > 0) {
          audioChunksRef.current.push(event.data);
        }
      };

      recorder.onstop = () => {
        audioBlobRef.current = new Blob(audioChunksRef.current, { type: "audio/webm" });
        setCanSubmit(true);
        stream.getTracks().forEach((track) => track.stop());
      };

      recorder.start();
      setRecordingState("recording");
      startTimer();
    } catch (err) {
      console.error("Error starting recording:", err);
      setError("Failed to start recording. Please check microphone permissions.");
    }
  };

  const pauseRecording = () => {
    const recorder = mediaRecorderRef.current;
    if (!recorder) return;

    if (recorder.state === "recording") {
      recorder.pause();
      setRecordingState("paused");
      stopTimer();
    } else if (recorder.state === "paused") {
      // Resume while maintaining elapsed time.
      startTimeRef.current = Date.now() - elapsedMs;
      recorder.resume();
      setRecordingState("recording");
      startTimer();
    }
  };

  const stopRecording = () => {
    const recorder = mediaRecorderRef.current;
    if (!recorder || recorder.state === "inactive") return;

    recorder.stop();
    setRecordingState("stopped");
    stopTimer();
  };

  const resetView = () => {
    stopTimer();
    if (pollTimeoutRef.current) {
      clearTimeout(pollTimeoutRef.current);
    }
    setRecordingState("idle");
    setElapsedMs(0);
    setError("");
    setCanSubmit(false);
    audioChunksRef.current = [];
    audioBlobRef.current = null;
    setTranscriptionStatus("idle");
    setTranscriptionText("");
    setTranscriptionMessage("Processing transcription...");
    setPlanError("");
  };

  const submitTranscription = async () => {
    if (!audioBlobRef.current) {
      setError("No audio recorded. Please record audio first.");
      return;
    }

    try {
      setError("");
      setTranscriptionStatus("uploading");
      setTranscriptionText("");
      setTranscriptionMessage("Uploading audio and processing transcription...");

      const formData = new FormData();
      formData.append("audio", audioBlobRef.current, "recording.webm");

      const uploadResponse = await fetch("/api/upload", { method: "POST", body: formData });
      if (!uploadResponse.ok) {
        const errBody = await uploadResponse.json().catch(() => ({}));
        throw new Error(errBody.error || "Failed to upload audio");
      }
      const { uploadUrl } = await uploadResponse.json();

      const transcribeResponse = await fetch("/api/transcribe", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ audioUrl: uploadUrl }),
      });

      if (!transcribeResponse.ok) {
        const errBody = await transcribeResponse.json().catch(() => ({}));
        throw new Error(errBody.error || "Failed to start transcription");
      }

      const { transcriptId } = await transcribeResponse.json();
      pollTranscription(transcriptId, 0);
    } catch (err) {
      console.error("Transcription error:", err);
      setTranscriptionStatus("error");
      setTranscriptionMessage(err.message || "Failed to process transcription");
    }
  };

  const pollTranscription = (transcriptId, attempt) => {
    const maxAttempts = 100; // ~5 minutes at 3s intervals
    const delay = 3000;

    const executePoll = async () => {
      try {
        const response = await fetch(`/api/transcript/${transcriptId}`);
        if (!response.ok) {
          throw new Error("Failed to get transcription status");
        }

        const result = await response.json();
        if (result.status === "completed") {
          setTranscriptionStatus("completed");
          setTranscriptionText(result.text || "No transcription text available.");
          setTranscriptionMessage("Transcription completed.");
          return;
        }

        if (result.status === "error") {
          throw new Error(result.error || "Transcription failed");
        }

        setTranscriptionStatus("processing");
        setTranscriptionMessage(`Processing transcription... (${result.status})`);

        if (attempt + 1 >= maxAttempts) {
          throw new Error("Transcription timeout. Please try again.");
        }

        pollTimeoutRef.current = setTimeout(() => pollTranscription(transcriptId, attempt + 1), delay);
      } catch (err) {
        console.error("Polling error:", err);
        setTranscriptionStatus("error");
        setTranscriptionMessage(err.message || "Failed to get transcription");
      }
    };

    executePoll();
  };

  const isRecording = recordingState === "recording";
  const isPaused = recordingState === "paused";
  const transcriptionActive = transcriptionStatus !== "idle";

  // Treatment Plan Generation Flow now handled on a dedicated page.
  const generatePlans = () => {
    if (!transcriptionText) {
      setPlanError("No transcription text available. Finish transcription first.");
      return;
    }

    try {
      setPlanError("");
      // Persist the editable transcription so planner page can read it.
      if (typeof window !== "undefined") {
        window.sessionStorage.setItem("planner:transcription", transcriptionText);
      }
      router.push("/planner");
    } catch (err) {
      console.error("Plan navigation error:", err);
      setPlanError(err.message || "Failed to start treatment planner");
    }
  };

  return (
    <>
      <Head>
        <title>Treatment Plan Planner | AssemblyAI</title>
        <meta name="description" content="Record audio, edit transcript, and generate treatment plans." />
      </Head>

      <div className="shell">
        <div className="glass">
          <div className="header">
            <div className="hero">
              <div className="title">
                <div className="badge">Live Beta</div>
                <h1>Treatment Plan Planner</h1>
              </div>
              <p className="subtitle">
                Capture crystal-clear audio, pause and resume seamlessly, then submit for instant AssemblyAI transcription.
                Crafted for clinicians, researchers, and note-takers who value precision.
              </p>
            </div>
            <div className="status-chip">
              <span className="status-dot" />
              Secure connection ready
            </div>
          </div>
        </div>

        <div className="card">
          <div className="grid">
            <div className="panel">
              <div className="info-bar">
                <div className="stat-group">
                  <span className="pill">High fidelity</span>
                  <span className="stat-label">AssemblyAI Universal model</span>
                </div>
                <div className="timer">{formatTime(elapsedMs)}</div>
              </div>

              <p className="muted">Control the recorder, then submit when you are satisfied.</p>

              <div className="controls">
                <button
                  className={`btn-record ${isRecording ? "recording" : ""}`}
                  onClick={startRecording}
                  disabled={isRecording || isPaused}
                >
                  {isRecording ? "Recording..." : isPaused ? "Resume" : "Start Recording"}
                </button>
                <button className="btn-pause" onClick={pauseRecording} disabled={!isRecording && !isPaused}>
                  {isPaused ? "Resume" : "Pause"}
                </button>
                <button className="btn-stop" onClick={stopRecording} disabled={!isRecording && !isPaused}>
                  Stop
                </button>
                <button className="btn-submit" onClick={submitTranscription} disabled={!canSubmit}>
                  Submit for Transcription
                </button>
              </div>

              <div
                className={`recording-status ${
                  isRecording ? "recording" : isPaused ? "paused" : ""
                }`}
              >
                {isRecording ? "🔴 Recording" : isPaused ? "⏸ Paused" : canSubmit ? "✅ Recording complete" : ""}
              </div>
              {error && <div className="error" style={{ marginTop: 12 }}>{error}</div>}

              <div className="timeline">
                <div className="step">
                  <h3>① Capture</h3>
                  <p>Start recording from your microphone. Pause and resume without losing your place.</p>
                </div>
                <div className="step">
                  <h3>② Review</h3>
                  <p>Stop to finalize the clip. The timer locks in your total duration.</p>
                </div>
                <div className="step">
                  <h3>③ Submit</h3>
                  <p>Upload securely, then sit back while AssemblyAI processes the transcript.</p>
                </div>
              </div>
            </div>

            <div className={`panel transcription-section ${transcriptionActive ? "active" : ""}`}>
              <div className="transcription-header">
                <div>
                  <h2>Transcription Result</h2>
                  <p className="muted">Live status and final text appear here.</p>
                </div>
                <button className="btn-back" onClick={resetView}>Record Again</button>
              </div>

              <div className="transcription-content">
                {transcriptionStatus === "idle" && (
                  <div className="muted">Submit a recording to see your transcript.</div>
                )}
                {transcriptionStatus === "uploading" || transcriptionStatus === "processing" ? (
                  <div className="loading">
                    <div className="spinner" />
                    <p>{transcriptionMessage}</p>
                  </div>
                ) : null}
                {transcriptionStatus === "completed" && (
                  <div className="transcription-content" style={{ padding: 0, border: "none", boxShadow: "none", background: "transparent" }}>
                    <textarea
                      aria-label="Editable transcription"
                      style={{
                        width: "100%",
                        minHeight: 220,
                        borderRadius: 12,
                        border: "1px solid #f0e7d9",
                        padding: 14,
                        fontFamily: "Inter, sans-serif",
                        fontSize: 15,
                        lineHeight: 1.6,
                        background: "#fffdf6",
                        resize: "vertical",
                      }}
                      value={transcriptionText}
                      onChange={(e) => setTranscriptionText(e.target.value)}
                    />
                  </div>
                )}
                {transcriptionStatus === "error" && (
                  <div className="error">
                    {transcriptionMessage}
                    <div style={{ marginTop: 12 }}>
                      <button className="btn-back" onClick={resetView}>Try Again</button>
                    </div>
                  </div>
                )}
              </div>

              {transcriptionStatus === "completed" && (
                <div style={{ marginTop: 16, display: "grid", gap: 10 }}>
                  <div className="info-bar" style={{ background: "#fff3d9", borderColor: "#f0d59a" }}>
                    <div className="stat-group">
                      <span className="pill">Treatment Planner</span>
                      <span className="stat-label">Send transcript to planner (opens dedicated page).</span>
                    </div>
                  </div>
                  <button className="btn-submit" onClick={generatePlans}>
                    Generate Treatment Plans
                  </button>
                  {planError && <div className="error">{planError}</div>}
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
    </>
  );
}

