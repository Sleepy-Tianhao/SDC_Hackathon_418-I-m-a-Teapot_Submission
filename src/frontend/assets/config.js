/**
 * Runtime configuration, loaded before the application module.
 * The backend (or a deployment script) can overwrite these values without a rebuild.
 *
 *   window.AI_CAREER_CONFIG = {
 *     apiBaseUrl: "/api/v1",   // or "https://api.example.com/api/v1", or "demo"
 *     mode: "auto",            // "auto" | "live" | "demo"
 *     stream: true,            // use Server-Sent Events for the narrative
 *     requestTimeoutMs: 120000
 *   };
 *
 * A URL override is also supported for demos: ?api=http://localhost:8000/api/v1&mode=live
 */
window.AI_CAREER_CONFIG = Object.assign(
  {
    apiBaseUrl: "/api/v1",
    mode: "auto",
    stream: true,
    requestTimeoutMs: 120000,
    streamTimeoutMs: 120000,
  },
  window.AI_CAREER_CONFIG || {},
);
