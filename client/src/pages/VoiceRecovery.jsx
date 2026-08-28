import { useEffect, useRef, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { api } from "../api/client.js";
import { formatINR, humanize } from "../lib/format.js";
import { statusLabel } from "../lib/statusMeta.js";
import { deriveVoiceRecoveryView } from "../lib/voiceRecoveryView.js";
import { Card } from "../components/ui/Card.jsx";
import { Badge, StatusBadge } from "../components/ui/Badge.jsx";
import { Button, buttonClasses } from "../components/ui/Button.jsx";
import { Alert } from "../components/ui/Alert.jsx";
import { PageHeader, Field } from "../components/ui/PageHeader.jsx";
import { ArrowLeftIcon, MicIcon } from "../components/ui/icons.jsx";
import { RevealOnScroll } from "../components/motion/RevealOnScroll.jsx";

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

// A CSS-only waveform — no audio-visualization library. Bars stay flat until `active`, then rise
// on a staggered keyframe loop; the reduced-motion query is embedded directly in this scoped
// <style> block so the effect degrades to a static bar row without depending on JS state.
function VoiceWaveform({ active }) {
  const bars = 22;
  return (
    <div className="flex h-14 items-end justify-center gap-[3px]" aria-hidden="true">
      <style>{`
        @keyframes pr-voice-wave { 0%, 100% { transform: scaleY(.22); } 50% { transform: scaleY(1); } }
        .pr-voice-bar { animation: pr-voice-wave 1.15s ease-in-out infinite; transform-origin: bottom; }
        @media (prefers-reduced-motion: reduce) {
          .pr-voice-bar { animation: none !important; transform: scaleY(.5) !important; }
        }
      `}</style>
      {Array.from({ length: bars }).map((_, i) => (
        <span
          key={i}
          className={`w-[3px] rounded-full ${active ? "bg-white pr-voice-bar" : "bg-white/20"}`}
          style={{
            height: "100%",
            animationDelay: `${(i * 65) % 1000}ms`,
            transform: active ? undefined : "scaleY(.16)",
          }}
        />
      ))}
    </div>
  );
}

export default function VoiceRecovery() {
  const { caseId } = useParams();

  const [recoveryCase, setRecoveryCase] = useState(null);
  const [policy, setPolicy] = useState(null);
  const [plan, setPlan] = useState(null);
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
    let cancelled = false;
    // Case is required; policy (voice limit / voiceEnabled) and the current recovery plan are
    // best-effort — the view derivation degrades gracefully if either is unavailable.
    Promise.all([
      api.getRecoveryCase(caseId),
      api.getMerchantPolicy().catch(() => null),
      api.getCurrentRecoveryPlan().catch(() => null),
    ])
      .then(([caseRes, policyRes, planRes]) => {
        if (cancelled) return;
        setRecoveryCase(caseRes.recoveryCase);
        setPolicy(policyRes?.policy || null);
        setPlan(planRes?.plan || null);
      })
      .catch((err) => {
        if (!cancelled) setLoadError(err.message);
      });
    return () => {
      cancelled = true;
    };
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
        <div className="h-3 w-32 animate-pulse rounded bg-brand-100" />
        <div className="mt-3 h-8 w-56 animate-pulse rounded bg-brand-100" />
      </Card>
    );
  }

  // Single source of truth for the IDLE stage + decision panels — see lib/voiceRecoveryView.js.
  const voiceView = deriveVoiceRecoveryView({ recoveryCase, policy, plan });

  // "Action" panel fallback (when no voice turn has produced an action yet) — reflects the
  // recovery plan's real state instead of always saying "No action executed yet".
  let actionFallbackText = "No action executed yet.";
  if (!lastTurn?.action) {
    if (TERMINAL_STATUSES.includes(recoveryCase.status)) {
      actionFallbackText = `${statusLabel(recoveryCase.status)}.`;
    } else if (recoveryCase.status === "WAITING_OUTCOME") {
      actionFallbackText = "Payment link sent — awaiting payment.";
    } else if (voiceView.mode === "started") {
      actionFallbackText = "Voice intervention initiated after plan confirmation.";
    } else if (recoveryCase.selectedIntervention) {
      actionFallbackText = "Awaiting merchant confirmation.";
    }
  }

  return (
    <div className="space-y-6">
      <RevealOnScroll>
        <PageHeader
          eyebrow={
            <Link to={`/recovery-cases/${caseId}`} className="inline-flex items-center gap-1 text-xs font-medium text-brand-400 hover:text-brand-900">
              <ArrowLeftIcon className="h-3.5 w-3.5" />
              Back to case
            </Link>
          }
          title={
            <span className="inline-flex items-center gap-2.5">
              <span className="flex h-9 w-9 items-center justify-center rounded-full bg-brand-950 text-white">
                <MicIcon className="h-4 w-4" />
              </span>
              Hinglish Voice Recovery
            </span>
          }
        />
      </RevealOnScroll>

      {/* Recovery case summary */}
      <RevealOnScroll delay={60}>
        <Card>
          <dl className="grid grid-cols-2 gap-4 sm:grid-cols-4">
            <Field label="Amount at Risk" value={formatINR(recoveryCase.amount)} />
            <Field label="Recovery Status" value={<StatusBadge status={recoveryCase.status} />} />
            <Field label="Root Cause" value={humanize(recoveryCase.rootCause)} />
            <Field
              label="Voice Attempts"
              value={
                voiceView.attemptsLimit != null
                  ? `${voiceView.attemptsUsed} / ${voiceView.attemptsLimit}`
                  : `${voiceView.attemptsUsed}`
              }
            />
          </dl>
        </Card>
      </RevealOnScroll>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
        {/* Voice conversation panel */}
        <RevealOnScroll delay={110} className="space-y-4 lg:col-span-2" as="div">
          <Card
            title="Voice Conversation"
            action={
              <span className="label-mono inline-flex items-center gap-1.5 text-[11px] text-brand-400">
                {isLive && <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-brand-950" />}
                LIVE
              </span>
            }
          >
            {/* The stage — always visible, shows current voice state + waveform */}
            <div className="gradient-brand rounded-2xl px-6 py-10 text-center text-white sm:px-10">
              <div className="label-mono text-[11px] text-white/50">VOICE RECOVERY</div>
              <div className="mt-2 text-lg font-medium">
                {uiState === "IDLE" ? voiceView.headline : STATUS_LABELS[uiState]}
              </div>
              <div className="mt-6">
                <VoiceWaveform active={isLive} />
              </div>

              {uiState === "IDLE" && (
                <div className="mt-7 space-y-3">
                  <p className="mx-auto max-w-sm text-sm text-white/70">{voiceView.message}</p>

                  {/* A start action is offered in exactly one state: a not-yet-planned case
                      where the backend's POST /voice/session is genuinely accepted. Every other
                      state either navigates to the recovery plan or offers nothing. */}
                  {voiceView.showStartButton && (
                    <div>
                      <Button onClick={handleStart} disabled={starting} variant="inverse" size="lg">
                        {starting ? "Starting…" : "Start Voice Recovery"}
                      </Button>
                      {sessionError && <p className="mt-3 text-xs text-red-300">{sessionError}</p>}
                      {!micSupported && (
                        <p className="mt-3 text-xs text-white/50">
                          Voice input isn't supported in this browser (Chrome is recommended). You'll still be able to
                          type your response once the session starts — it runs through the exact same pipeline.
                        </p>
                      )}
                    </div>
                  )}

                  {voiceView.ctaLabel && voiceView.ctaTo && (
                    <div>
                      <Link to={voiceView.ctaTo} className={buttonClasses({ variant: "inverse", size: "lg" })}>
                        {voiceView.ctaLabel}
                      </Link>
                    </div>
                  )}

                  {(voiceView.mode === "limit_reached" || voiceView.mode === "started") &&
                    voiceView.attemptsLimit != null && (
                      <p className="text-xs text-white/60">
                        {voiceView.attemptsUsed} / {voiceView.attemptsLimit} voice attempts used
                      </p>
                    )}
                </div>
              )}
            </div>

            {uiState !== "IDLE" && (
              <div className="mt-5">
                <div className="mb-3 max-h-80 space-y-2 overflow-y-auto rounded-xl bg-brand-50/70 p-3">
                  {conversation.length === 0 && (
                    <p className="text-xs text-brand-400">
                      Say something like "Bhai payment fail ho gaya tha, ek baar phir try karwa do" — or type it below.
                    </p>
                  )}
                  {conversation.map((entry, i) => (
                    <div
                      key={i}
                      className={`max-w-[85%] rounded-2xl px-3.5 py-2 text-sm ${
                        entry.speaker === "customer"
                          ? "ml-auto bg-brand-900 text-white"
                          : "border border-brand-900/10 bg-white text-brand-800"
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
                      className={`inline-flex items-center gap-1.5 rounded-full px-4 py-2 text-sm font-medium transition-colors disabled:cursor-not-allowed disabled:opacity-40 ${
                        uiState === "LISTENING" ? "bg-red-600 text-white hover:bg-red-700" : "bg-brand-950 text-white hover:bg-brand-700"
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
                      className="flex-1 rounded-full border border-brand-200 px-3.5 py-2 text-sm focus:border-brand-500 focus:outline-none focus:ring-2 focus:ring-brand-400/25 disabled:opacity-50"
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
                  <div className="mt-3 flex items-center gap-3 rounded-xl bg-brand-50 p-3">
                    <span className="text-xs text-brand-600">
                      Session ended{isTerminal ? ` — case is now ${recoveryCase.status}.` : "."}
                    </span>
                    {!isTerminal && (
                      <button type="button" onClick={handleRetry} className="text-xs font-medium text-brand-700 underline hover:no-underline">
                        Retry
                      </button>
                    )}
                  </div>
                )}
              </div>
            )}
          </Card>
        </RevealOnScroll>

        {/* Decision panel */}
        <RevealOnScroll delay={160} className="space-y-4" as="div">
          <Card title="Recovery Recommendation">
            {!lastTurn && !recoveryCase.selectedIntervention && recoveryCase.recoveryProbability == null && (
              <p className="text-xs text-brand-400">PayRevive hasn't analysed this case into a recommendation yet.</p>
            )}
            {!lastTurn && (recoveryCase.selectedIntervention || recoveryCase.recoveryProbability != null) && (
              <dl className="space-y-4">
                <Field label="Recommended Intervention" value={humanize(recoveryCase.selectedIntervention)} />
                <Field
                  label="Recovery Probability"
                  value={
                    recoveryCase.recoveryProbability != null
                      ? `${Math.round(recoveryCase.recoveryProbability * 100)}%`
                      : null
                  }
                />
                {recoveryCase.rootCause && <Field label="Root Cause" value={humanize(recoveryCase.rootCause)} />}
              </dl>
            )}
            {lastTurn && (
              <dl className="space-y-4">
                <Field label="Detected Intent" value={lastTurn.aiIntent?.intent} />
                <Field
                  label="Confidence"
                  value={lastTurn.aiIntent?.confidence != null ? `${Math.round(lastTurn.aiIntent.confidence * 100)}%` : null}
                />
                {lastTurn.aiIntent?.fallback && (
                  <p className="text-xs text-amber-600">The voice service was briefly unavailable — a safe deterministic fallback was used.</p>
                )}
              </dl>
            )}
          </Card>

          <Card title="Policy Decision">
            {!lastTurn && !recoveryCase.policyDecision && (
              <p className="text-xs text-brand-400">Not evaluated yet.</p>
            )}
            {!lastTurn && recoveryCase.policyDecision && (
              <dl className="space-y-4">
                <Field label="Decision" value={humanize(recoveryCase.policyDecision)} />
                <Field label="Reason Code" value={recoveryCase.policyDecision} />
                <Field label="Case Status" value={statusLabel(recoveryCase.status)} />
              </dl>
            )}
            {lastTurn && (
              <dl className="space-y-4">
                <Field label="Candidate Action" value={lastTurn.candidateAction} />
                <Field label="Policy Outcome" value={lastTurn.policyResult?.outcome} />
                <Field label="Reason Code" value={lastTurn.policyResult?.reasonCode || recoveryCase.policyDecision} />
              </dl>
            )}
          </Card>

          <Card title="Action">
            {!lastTurn?.action && (
              <div className="space-y-2">
                <p className="text-xs text-brand-400">{actionFallbackText}</p>
                {recoveryCase.razorpayPaymentLinkShortUrl && (
                  <a
                    href={recoveryCase.razorpayPaymentLinkShortUrl}
                    target="_blank"
                    rel="noreferrer"
                    className="block break-all font-mono text-xs text-brand-700 underline hover:text-brand-900"
                  >
                    {recoveryCase.razorpayPaymentLinkShortUrl}
                  </a>
                )}
              </div>
            )}
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
                    <dt className="label-mono text-[11px] text-brand-400">PAYMENT LINK</dt>
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
            className="block rounded-2xl border border-brand-900/10 bg-white/60 p-4 text-center text-xs text-brand-500 transition-colors hover:border-brand-300 hover:bg-brand-50"
          >
            View full audit trail on the case page →
          </Link>
        </RevealOnScroll>
      </div>
    </div>
  );
}
