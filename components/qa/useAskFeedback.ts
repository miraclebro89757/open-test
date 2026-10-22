"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useI18n } from "@/hooks/useI18n";
import type { QaAgentRequest, QaAskAgent } from "@/lib/qa/client";

/** Runs an agent request from a panel button and says briefly what happened. */
export function useAskFeedback(onAskAgent: QaAskAgent): {
  ask: (request: QaAgentRequest) => void;
  feedback: string;
} {
  const { t } = useI18n();
  const [feedback, setFeedback] = useState("");
  const timer = useRef<number | null>(null);
  useEffect(() => () => {
    if (timer.current !== null) window.clearTimeout(timer.current);
  }, []);
  const ask = useCallback((request: QaAgentRequest) => {
    const outcome = onAskAgent(request);
    const messages = {
      sent: t("qa.ask.sent"),
      composed: t("qa.ask.composed"),
      unavailable: t("qa.ask.unavailable"),
    };
    setFeedback(messages[outcome]);
    if (timer.current !== null) window.clearTimeout(timer.current);
    timer.current = window.setTimeout(() => setFeedback(""), 5000);
  }, [onAskAgent, t]);
  return { ask, feedback };
}
