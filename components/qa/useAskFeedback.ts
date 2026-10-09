"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { QaAgentRequest, QaAskAgent } from "@/lib/qa/client";

const MESSAGES = {
  sent: "已发给 Agent，进度见左侧对话",
  composed: "已放进输入框，补全后回车发送",
  unavailable: "先在左侧打开项目并开始一个会话",
} as const;

/** Runs an agent request from a panel button and says briefly what happened. */
export function useAskFeedback(onAskAgent: QaAskAgent): {
  ask: (request: QaAgentRequest) => void;
  feedback: string;
} {
  const [feedback, setFeedback] = useState("");
  const timer = useRef<number | null>(null);
  useEffect(() => () => {
    if (timer.current !== null) window.clearTimeout(timer.current);
  }, []);
  const ask = useCallback((request: QaAgentRequest) => {
    setFeedback(MESSAGES[onAskAgent(request)]);
    if (timer.current !== null) window.clearTimeout(timer.current);
    timer.current = window.setTimeout(() => setFeedback(""), 5000);
  }, [onAskAgent]);
  return { ask, feedback };
}
