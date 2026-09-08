/**
 * LineageStrip — source-conversation quote block inside the Atom drawer.
 *
 * The consolidated view always shows a user-facing quote. Full lineage such as
 * candidate / raw_event JSON should be inspected directly from SQLite.
 */

import { useEffect, useState } from "react";
import { Skeleton, Typography } from "antd";

import {
  memoryDashboardApi,
  type AtomItem,
  type CandidateItem,
} from "../../../../api/modules/memoryDashboard";

interface RawEventShape {
  id?: string;
  content?: string;
  text?: string;
  [k: string]: unknown;
}

interface Props {
  agentId: string;
  atom: AtomItem;
}

export default function LineageStrip({ agentId, atom }: Props) {
  const [rawEvent, setRawEvent] = useState<RawEventShape | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setRawEvent(null);

    (async () => {
      try {
        if (!atom.candidate_id) return;
        if (typeof memoryDashboardApi.getCandidate !== "function") return;
        const cand = (await memoryDashboardApi
          .getCandidate(agentId, atom.candidate_id)
          .catch(() => null)) as CandidateItem | null;
        if (cancelled) return;
        const eventId = cand?.quote_event_id;
        if (eventId && typeof memoryDashboardApi.getRawEvent === "function") {
          const ev = (await memoryDashboardApi
            .getRawEvent(agentId, eventId)
            .catch(() => null)) as RawEventShape | null;
          if (cancelled) return;
          setRawEvent(ev);
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [agentId, atom.id, atom.candidate_id]);

  if (loading) {
    return (
      <div style={lineageBox}>
        <Skeleton active paragraph={{ rows: 1 }} title={false} />
      </div>
    );
  }

  const fromQuote = rawEvent?.content || rawEvent?.text || atom.verbatim_quote;
  if (!fromQuote) {
    return (
      <div style={lineageBox}>
        <Typography.Text type="secondary" style={{ fontSize: 12 }}>
          🧬 由威小蜜AI 从对话中提取
        </Typography.Text>
      </div>
    );
  }
  return (
    <div style={lineageBox}>
      <Typography.Text type="secondary" style={{ fontSize: 12 }}>
        🧬 来源对话片段：
      </Typography.Text>
      <div
        style={{
          marginTop: 4,
          fontSize: 12,
          color: "#595959",
          background: "#fafafa",
          padding: "6px 8px",
          borderRadius: 4,
          borderLeft: "3px solid #d9d9d9",
          whiteSpace: "pre-wrap",
          maxHeight: 80,
          overflow: "hidden",
          textOverflow: "ellipsis",
        }}
      >
        {truncate(String(fromQuote), 200)}
      </div>
    </div>
  );
}

const lineageBox: React.CSSProperties = {
  border: "1px solid #f0f0f0",
  background: "#fcfcfc",
  borderRadius: 6,
  padding: "10px 12px",
  marginBottom: 14,
};

function truncate(s: string, n: number): string {
  if (s.length <= n) return s;
  return s.slice(0, n) + "…";
}
