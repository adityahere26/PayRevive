import { useEffect, useRef, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { api } from "../api/client.js";
import { formatINR } from "../lib/format.js";
import { Card } from "../components/ui/Card.jsx";
import { Badge, StatusBadge } from "../components/ui/Badge.jsx";
import { Button, buttonClasses } from "../components/ui/Button.jsx";
import { Alert } from "../components/ui/Alert.jsx";
import { Field } from "../components/ui/PageHeader.jsx";
import { ArrowLeftIcon, MicIcon } from "../components/ui/icons.jsx";

// AGENT_DESIGN.md § Voice pipeline. Browser mic (Web Speech API — Chrome recommended) ->
// transcript -> POST /voice/turn -> Gemini intent classification -> the SAME deterministic
// Eligibility/Policy Engine as text recovery -> (if approved) the SAME simulated executor ->
// Gemini-phrased response, spoken back via browser SpeechSynthesis. Text input is available at
// all times and feeds the exact same backend turn, so this works in browsers without speech
// support too.
//
// Two text forms come back per turn (server/src/ai/gemini/responseGenerator.js): `response`
// (Roman-script Hinglish, shown in the transcript below) and `speechText` (Devanagari Hindi,
// what's actually spoken). Chrome's hi-IN voices pronounce Devanagari correctly; the same
// content transliterated into Roman letters is read back as broken, word-by-word English by
// most hi-IN synthesis voices — that mismatch was the original pronunciation problem.

const SpeechRecognitionCtor =
  typeof window !== "undefined" ? window.SpeechRecognition || window.webkitSpeechRecognition : null;
const speechSynthesisSupported = typeof window !== "undefined" && "speechSynthesis" in window;

// Chrome (and others) populate the voice list asynchronously — getVoices() can return an empty
// array until the 'voiceschanged' event fires, so the very first utterance of a page load would
// otherwise always miss a hi-IN voice even if one exists. Cached module-level so this only has
// to happen once per page load, not once per turn.
let voicesReadyPromise = null;

function loadVoices() {
  if (!speechSynthesisSupported) return Promise.resolve([]);
  const existing = window.speechSynthesis.getVoices();
  if (existing.length > 0) return Promise.resolve(existing);
  if (!voicesReadyPromise) {
    voicesReadyPromise = new Promise((resolve) => {
      const onVoicesChanged = () => {
        window.speechSynthesis.removeEventListener("voiceschanged", onVoicesChanged);
        resolve(window.speechSynthesis.getVoices());
      };
      window.speechSynthesis.addEventListener("voiceschanged", onVoicesChanged);
      // Some browsers never fire 'voiceschanged' at all — don't hang forever waiting for one.
      setTimeout(() => resolve(window.speechSynthesis.getVoices()), 1000);
    });
  }
  return voicesReadyPromise;
}

// Never hardcode a specific voice name — availability differs by OS/Chrome build. Prefer an
// exact hi-IN voice; fall back to any Hindi-language voice; otherwise return null and let the
// browser use its own default voice (still correct, just not guaranteed Hindi-accented).
function pickHindiVoice(voices) {
  return (
    voices.find((v) => v.lang?.toLowerCase() === "hi-in") ||
    voices.find((v) => v.lang?.toLowerCase().startsWith("hi")) ||
    null
  );
}

const TERMINAL_STATUSES = ["RECOVERED", "STOPPED", "ESCALATED", "EXPIRED"];

const STATUS_LABELS = {
  IDLE: "Not started",
  READY: "Ready — tap the mic or type below",
  LISTENING: "Listening…",
  THINKING: "Thinking…",
  RESPONDING: "Responding…",
  ENDED: "Session ended",
};

export default function VoiceRecovery() {
  const { caseId } = useParams();

  const [recoveryCase, setRecoveryCase] = useState(null);
  const [loadError, setLoadError] = useState(null);

  const [sessionId, setSessionId] = useState(null);
  const [uiState, setUiState] = useState("IDLE");
  const [sessionError, setSessionError] = useState(null);
  const [turnError, setTurnError] = useState(null);
  const [micError, setMicError] = useState(null);
  const [conversation, setConversation] = useState([]);
  const [textInput, setTextInput] = useState("");
  const [lastTurn, setLastTurn] = useState(null);
  const [starting, setStarting] = useState(false);

  const recognitionRef = useRef(null);

  useEffect(() => {
    api
      .getRecoveryCase(caseId)
      .then((res) => setRecoveryCase(res.recoveryCase))
      .catch((err) => setLoadError(err.message));
  }, [caseId]);

  useEffect(() => {
    return () => {
      recognitionRef.current?.stop();
      if (speechSynthesisSupported) window.speechSynthesis.cancel();
    };
  }, []);

  const micSupported = Boolean(SpeechRecognitionCtor);
  const isTerminal = recoveryCase && TERMINAL_STATUSES.includes(recoveryCase.status);
  const isLive = uiState === "LISTENING" || uiState === "THINKING" || uiState === "RESPONDING";

  async function handleStart() {
    setStarting(true);
    setSessionError(null);
    try {
      const res = await api.startVoiceSession(caseId);
      setSessionId(res.sessionId);
      setRecoveryCase((prev) => ({ ...prev, ...res.recoveryCase }));
      setUiState("READY");
    } catch (err) {
      setSessionError(err.message);
    } finally {
      setStarting(false);
    }
  }

  async function speak(text) {
    if (!speechSynthesisSupported || !text) {
      setUiState((s) => (s === "RESPONDING" ? "READY" : s));
      return;
    }
    const utterance = new SpeechSynthesisUtterance(text);
    utterance.lang = "hi-IN";
    const hindiVoice = pickHindiVoice(await loadVoices());
    if (hindiVoice) utterance.voice = hindiVoice;
    utterance.onend = () => setUiState((s) => (s === "RESPONDING" ? "READY" : s));
    utterance.onerror = () => setUiState((s) => (s === "RESPONDING" ? "READY" : s));
    window.speechSynthesis.cancel();
    window.speechSynthesis.speak(utterance);
  }

  async function submitTranscript(transcript) {
    const trimmed = (transcript || "").trim();
    if (!trimmed || !sessionId) return;

    setTurnError(null);
    setConversation((c) => [...c, { speaker: "customer", text: trimmed }]);
    setUiState("THINKING");

    try {
      const res = await api.sendVoiceTurn(caseId, { sessionId, transcript: trimmed });
      setRecoveryCase(res.recoveryCase);
      setLastTurn(res);
      setConversation((c) => [...c, { speaker: "assistant", text: res.response }]);

      setUiState(TERMINAL_STATUSES.includes(res.recoveryCase.status) ? "ENDED" : "RESPONDING");
      // Spoken aloud in Devanagari Hindi (speechText) — displayed on-screen in Roman Hinglish
      // (response, added to the conversation above). Falls back to `response` defensively if
      // an older/unexpected payload ever lacks speechText.
      speak(res.speechText || res.response);
    } catch (err) {
      setTurnError(err.message);
      setUiState("READY");
    }
  }

  function handleMicStart() {
    setMicError(null);
    if (!micSupported || !sessionId) return;

    const recognition = new SpeechRecognitionCtor();
    recognition.lang = "hi-IN";
    recognition.interimResults = false;
    recognition.maxAlternatives = 1;

    recognition.onresult = (event) => {
      const transcript = event.results[0]?.[0]?.transcript;
      if (transcript) submitTranscript(transcript);
    };
    recognition.onerror = (event) => {
      if (event.error === "not-allowed" || event.error === "permission-denied") {
        setMicError("Microphone access denied. Please allow microphone permissions, or type your response below.");
      } else if (event.error === "no-speech") {
        setMicError("No speech detected — please try again, or type your response below.");
      } else {
        setMicError(`Voice input error (${event.error}). You can type your response below.`);
      }
      setUiState("READY");
    };
    recognition.onend = () => {
      setUiState((s) => (s === "LISTENING" ? "READY" : s));
    };

    recognitionRef.current = recognition;
    setUiState("LISTENING");
    try {
      recognition.start();
    } catch {
      setMicError("Could not start the microphone. Please type your response below.");
      setUiState("READY");
    }
  }

  function handleMicStop() {
    recognitionRef.current?.stop();
    setUiState("READY");
  }

  function handleTextSubmit(e) {
    e.preventDefault();
    const value = textInput;
    setTextInput("");
    submitTranscript(value);
  }

  async function handleEnd() {
    recognitionRef.current?.stop();
    if (speechSynthesisSupported) window.speechSynthesis.cancel();
    if (sessionId) {
      try {
        await api.endVoiceSession(caseId, sessionId);
      } catch {
        // best-effort — ending the session is not itself a recovery decision
      }
    }
    setUiState("ENDED");
  }

  function handleRetry() {
    recognitionRef.current?.stop();
    if (speechSynthesisSupported) window.speechSynthesis.cancel();
    setSessionId(null);
    setUiState("IDLE");
    setConversation([]);
    setLastTurn(null);
    setTurnError(null);
    setSessionError(null);
    setMicError(null);
  }

  if (loadError) {
    return <Alert tone="danger" title="Could not load this recovery case">{loadError}</Alert>;
  }
  if (!recoveryCase) {
    return (
      <Card>
        <div className="h-3 w-32 animate-pulse rounded bg-slate-100" />
        <div className="mt-3 h-8 w-56 animate-pulse rounded bg-slate-100" />
      </Card>
    );
  }

  return (
    <div className="space-y-6">
      <div>
        <Link to={`/recovery-cases/${caseId}`} className="inline-flex items-center gap-1 text-xs font-medium text-slate-400 hover:text-brand-700">
          <ArrowLeftIcon className="h-3.5 w-3.5" />
          Back to case
        </Link>
        <div className="mt-1.5 flex items-center gap-2.5">
          <span className="flex h-8 w-8 items-center justify-center rounded-full bg-mint-100 text-brand-600">
            <MicIcon className="h-4 w-4" />
          </span>
          <h1 className="text-2xl font-bold tracking-tight text-brand-900">Hinglish Voice Recovery</h1>
        </div>
      </div>

      {/* Recovery case summary */}
      <Card>
        <dl className="grid grid-cols-2 gap-4 sm:grid-cols-4">
          <Field label="Amount at Risk" value={formatINR(recoveryCase.amount)} />
          <Field label="Recovery Status" value={<StatusBadge status={recoveryCase.status} />} />
          <Field label="Root Cause" value={recoveryCase.rootCause} />
          <Field label="Voice Attempts" value={`${recoveryCase.voiceAttempts ?? 0}`} />
        </dl>
      </Card>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
        {/* Voice conversation panel */}
        <div className="space-y-4 lg:col-span-2">
          <Card
            title="Voice Conversation"
            action={
              <span className="inline-flex items-center gap-1.5 rounded-full bg-mint-50 px-2.5 py-0.5 text-xs font-medium text-brand-700">
                {isLive && <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-brand-500" />}
                {STATUS_LABELS[uiState]}
              </span>
            }
          >
            {uiState === "IDLE" && (
              <div className="rounded-xl border border-dashed border-slate-200 bg-mint-50/40 p-8 text-center">
                <Button onClick={handleStart} disabled={starting || isTerminal} size="lg">
                  {starting ? "Starting…" : "Start Voice Recovery"}
                </Button>
                {sessionError && <p className="mt-3 text-xs text-red-600">{sessionError}</p>}
                {isTerminal && (
                  <p className="mt-3 text-xs text-slate-500">
                    This case has already reached a final state ({recoveryCase.status}) — no voice session available.
                  </p>
                )}
                {!micSupported && (
                  <p className="mt-3 text-xs text-slate-500">
                    Voice input isn't supported in this browser (Chrome is recommended). You'll still be able to
                    type your response once the session starts — it runs through the exact same pipeline.
                  </p>
                )}
              </div>
            )}

            {uiState !== "IDLE" && (
              <>
                <div className="mb-3 max-h-80 space-y-2 overflow-y-auto rounded-xl bg-slate-50/70 p-3">
                  {conversation.length === 0 && (
                    <p className="text-xs text-slate-400">
                      Say something like "Bhai payment fail ho gaya tha, ek baar phir try karwa do" — or type it below.
                    </p>
                  )}
                  {conversation.map((entry, i) => (
                    <div
                      key={i}
                      className={`max-w-[85%] rounded-2xl px-3.5 py-2 text-sm ${
                        entry.speaker === "customer"
                          ? "ml-auto bg-brand-700 text-white"
                          : "border border-slate-200 bg-white text-slate-800"
                      }`}
                    >
                      {entry.text}
                    </div>
                  ))}
                </div>

                <div className="flex items-center gap-3">
                  {micSupported && (
                    <button
                      type="button"
                      onClick={uiState === "LISTENING" ? handleMicStop : handleMicStart}
                      disabled={uiState === "THINKING" || uiState === "RESPONDING" || uiState === "ENDED"}
                      className={`inline-flex items-center gap-1.5 rounded-full px-4 py-2 text-sm font-medium shadow-sm transition-colors disabled:cursor-not-allowed disabled:opacity-40 ${
                        uiState === "LISTENING" ? "bg-red-600 text-white hover:bg-red-700" : "bg-brand-700 text-white hover:bg-brand-800"
                      }`}
                    >
                      <MicIcon className="h-4 w-4" />
                      {uiState === "LISTENING" ? "Stop" : "Speak"}
                    </button>
                  )}

                  <form onSubmit={handleTextSubmit} className="flex flex-1 gap-2">
                    <input
                      type="text"
                      value={textInput}
                      onChange={(e) => setTextInput(e.target.value)}
                      placeholder="Type your response (Hinglish works)…"
                      disabled={uiState === "THINKING" || uiState === "ENDED"}
                      className="flex-1 rounded-lg border border-slate-200 px-3 py-2 text-sm shadow-sm focus:border-brand-400 focus:outline-none focus:ring-1 focus:ring-brand-400 disabled:opacity-50"
                    />
                    <button
                      type="submit"
                      disabled={uiState === "THINKING" || uiState === "ENDED" || !textInput.trim()}
                      className={buttonClasses({ variant: "secondary" })}
                    >
                      Send
                    </button>
                  </form>

                  {uiState !== "ENDED" && (
                    <button type="button" onClick={handleEnd} className={buttonClasses({ variant: "tertiary" })}>
                      End
                    </button>
                  )}
                </div>

                {micError && <p className="mt-2 text-xs text-amber-600">{micError}</p>}
                {turnError && <p className="mt-2 text-xs text-red-600">{turnError}</p>}

                {uiState === "ENDED" && (
                  <div className="mt-3 flex items-center gap-3 rounded-xl bg-mint-50/60 p-3">
                    <span className="text-xs text-slate-600">
                      Session ended{isTerminal ? ` — case is now ${recoveryCase.status}.` : "."}
                    </span>
                    {!isTerminal && (
                      <button type="button" onClick={handleRetry} className="text-xs font-medium text-brand-700 underline hover:no-underline">
                        Retry
                      </button>
                    )}
                  </div>
                )}
              </>
            )}
          </Card>
        </div>

        {/* Decision panel */}
        <div className="space-y-4">
          <Card title="AI Recommendation">
            {!lastTurn && <p className="text-xs text-slate-400">Nothing yet — start the conversation.</p>}
            {lastTurn && (
              <dl className="space-y-4">
                <Field label="Detected Intent" value={lastTurn.aiIntent?.intent} />
                <Field
                  label="Confidence"
                  value={lastTurn.aiIntent?.confidence != null ? `${Math.round(lastTurn.aiIntent.confidence * 100)}%` : null}
                />
                {lastTurn.aiIntent?.fallback && (
                  <p className="text-xs text-amber-600">AI provider was unavailable — a safe deterministic fallback was used.</p>
                )}
              </dl>
            )}
          </Card>

          <Card title="Policy Decision">
            {!lastTurn && <p className="text-xs text-slate-400">Not evaluated yet.</p>}
            {lastTurn && (
              <dl className="space-y-4">
                <Field label="Candidate Action" value={lastTurn.candidateAction} />
                <Field label="Policy Outcome" value={lastTurn.policyResult?.outcome} />
                <Field label="Reason Code" value={lastTurn.policyResult?.reasonCode || recoveryCase.policyDecision} />
              </dl>
            )}
          </Card>

          <Card title="Action">
            {!lastTurn?.action && <p className="text-xs text-slate-400">No action executed yet.</p>}
            {lastTurn?.action && (
              <dl className="space-y-4">
                <Field label="Action" value={lastTurn.action.action} />
                <Field label="Status" value={lastTurn.action.status} />
                <Field
                  label="Result"
                  value={lastTurn.action.success === null ? lastTurn.action.outcome : lastTurn.action.success ? "SUCCESS" : "FAILURE"}
                />
                {lastTurn.paymentLink?.shortUrl && (
                  <div>
                    <dt className="text-xs font-medium uppercase tracking-wide text-slate-400">Payment Link</dt>
                    <dd className="mt-1">
                      <Badge tone="brand" size="sm">Razorpay Test Mode</Badge>
                      <a
                        href={lastTurn.paymentLink.shortUrl}
                        target="_blank"
                        rel="noreferrer"
                        className="mt-1 block break-all font-mono text-xs text-brand-700 underline hover:text-brand-900"
                      >
                        {lastTurn.paymentLink.shortUrl}
                      </a>
                    </dd>
                  </div>
                )}
              </dl>
            )}
          </Card>

          <Link
            to={`/recovery-cases/${caseId}`}
            className="block rounded-2xl border border-dashed border-slate-200 bg-white/60 p-4 text-center text-xs text-slate-500 hover:bg-mint-50/60"
          >
            View full audit trail on the case page →
          </Link>
        </div>
      </div>
    </div>
  );
}
