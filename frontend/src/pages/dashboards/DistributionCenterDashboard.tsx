import { useEffect, useState } from "react";
import { addEvent, listPapers } from "../../api/client";
import type { ExamPaper } from "../../types";
import Message from "../../components/Message";
import StatusBadge from "../../components/StatusBadge";

export default function DistributionCenterDashboard() {
  const [papers, setPapers] = useState<ExamPaper[]>([]);
  const [loadError, setLoadError] = useState("");
  const [rowError, setRowError] = useState<Record<number, string>>({});
  const [rowSuccess, setRowSuccess] = useState<Record<number, string>>({});
  const [busyId, setBusyId] = useState<number | null>(null);

  useEffect(() => {
    void load();
  }, []);

  async function load() {
    setLoadError("");
    try {
      const { papers: fetched } = await listPapers();
      setPapers(fetched);
    } catch (err) {
      setLoadError(err instanceof Error ? err.message : "Failed to load papers");
    }
  }

  async function markEvent(paperId: number, eventType: "DISPATCHED" | "RECEIVED_AT_CENTER", label: string) {
    setBusyId(paperId);
    setRowError((prev) => ({ ...prev, [paperId]: "" }));
    setRowSuccess((prev) => ({ ...prev, [paperId]: "" }));
    try {
      await addEvent(paperId, eventType, {});
      setRowSuccess((prev) => ({ ...prev, [paperId]: `${label}.` }));
      await load();
    } catch (err) {
      setRowError((prev) => ({
        ...prev,
        [paperId]: err instanceof Error ? err.message : `Failed to mark ${label.toLowerCase()}`,
      }));
    } finally {
      setBusyId(null);
    }
  }

  return (
    <section className="panel">
      <h2>Papers</h2>
      <Message type="error" text={loadError} />
      {papers.length === 0 ? (
        <p className="muted">No papers yet.</p>
      ) : (
        <table className="data-table">
          <thead>
            <tr>
              <th>Title</th>
              <th>Status</th>
              <th>Actions</th>
            </tr>
          </thead>
          <tbody>
            {papers.map((paper) => (
              <tr key={paper.id}>
                <td>{paper.title}</td>
                <td>
                  <StatusBadge status={paper.status} />
                </td>
                <td>
                  <div className="actions-row">
                    <button
                      type="button"
                      disabled={busyId === paper.id}
                      onClick={() => markEvent(paper.id, "DISPATCHED", "Marked as dispatched")}
                    >
                      Mark Dispatched
                    </button>
                    <button
                      type="button"
                      disabled={busyId === paper.id}
                      onClick={() => markEvent(paper.id, "RECEIVED_AT_CENTER", "Marked as received")}
                    >
                      Mark Received
                    </button>
                  </div>
                  <Message type="error" text={rowError[paper.id] ?? ""} />
                  <Message type="success" text={rowSuccess[paper.id] ?? ""} />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </section>
  );
}
