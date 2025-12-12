import axios from "axios";
import https from "https";

// Keep-alive agent to reduce TLS handshake overhead on long calls.
const httpsAgent = new https.Agent({ keepAlive: true });

// Proxies treatment planner request to external gateway.
// Expects: session_id (dynamic), user_id, slot_id (hardcoded acceptable), treatment_planner_text.
export default async function handler(req, res) {
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  const { session_id, user_id, slot_id, treatment_planner_text } = req.body || {};

  if (!session_id || !treatment_planner_text) {
    return res.status(400).json({ error: "session_id and treatment_planner_text are required" });
  }

  // Build and log a reproducible curl for debugging (truncates text for safety).
  const truncatedText = treatment_planner_text.length > 400
    ? `${treatment_planner_text.slice(0, 400)}... [truncated ${treatment_planner_text.length - 400} chars]`
    : treatment_planner_text;

  const curlSnippet = [
    "curl --location 'https://dev-api-gateway.aesthatiq.com/mcp-orch-service/orch' \\",
    "--header 'Content-Type: application/json' \\",
    `--data '${JSON.stringify({
      session_id,
      user_id,
      slot_id,
      treatment_planner_text: truncatedText,
    }, null, 2)}'`,
  ].join("\n");

  console.log("[planner] outgoing request body", {
    session_id,
    user_id,
    slot_id,
    treatment_planner_text_preview: truncatedText,
  });
  console.log("[planner] curl to reproduce:\n", curlSnippet);

  // Simple retry wrapper for transient gateway slowness/timeouts.
  const maxAttempts = 2;
  let lastError = null;

  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    const startedAt = Date.now();
    try {
      const response = await axios.post(
        "https://dev-api-gateway.aesthatiq.com/mcp-orch-service/orch",
        {
          session_id,
          user_id,
          slot_id,
          treatment_planner_text,
        },
        {
          headers: {
            "Content-Type": "application/json",
          },
          timeout: 180000, // allow up to 3 minutes; service may take ~2 minutes
          maxBodyLength: Infinity,
          maxContentLength: Infinity,
          httpsAgent,
        }
      );

      // Log a concise summary of the upstream response for observability.
      console.log("[planner] session:", session_id, {
        attempt,
        status: response.status,
        duration_ms: Date.now() - startedAt,
        success: response.data?.success,
        plans_returned: Array.isArray(response.data?.treatment_plans)
          ? response.data.treatment_plans.length
          : 0,
      });

      return res.status(200).json(response.data);
    } catch (error) {
      lastError = error;
      const duration = Date.now() - startedAt;
      const timeoutLike =
        error.code === "ECONNABORTED" ||
        error.code === "ETIMEDOUT" ||
        error.message?.toLowerCase().includes("timeout");

      console.error("[planner] attempt failed", {
        session_id,
        attempt,
        duration_ms: duration,
        code: error.code,
        message: error.message,
      });

      if (attempt < maxAttempts && timeoutLike) {
        // Brief backoff then retry.
        await new Promise((r) => setTimeout(r, 2000));
        continue;
      }

      const details = error.response?.data || error.message || "Failed to generate treatment plans";
      const status = timeoutLike ? 504 : 500;
      return res.status(status).json({ error: "Failed to generate treatment plans", details });
    }
  }

  // Fallback (should not reach here).
  return res.status(500).json({ error: "Failed to generate treatment plans", details: lastError?.message });
}

