import { useEffect, useState } from "react";
import { downloadPaper, getStatus, listPapers } from "../../api/client";
import type { ExamPaper } from "../../types";
import Message from "../../components/Message";

interface DownloadState {
  loading: boolean;
  content: string | null;
  error: string;
}

function formatCountdown(ms: number): string {
  if (ms <= 0) return "00:00:00";
  const totalSeconds = Math.floor(ms / 1000);
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;
  return `${String(hours).padStart(2, "0")}:${String(minutes).padStart(2, "0")}:${String(seconds).padStart(2, "0")}`;
}

export default function InvigilatorDashboard() {
  const [papers, setPapers] = useState<ExamPaper[]>([]);
  const [examDatetimes, setExamDatetimes] = useState<Record<number, string>>({});
  const [loadError, setLoadError] = useState("");
  const [now, setNow] = useState(() => Date.now());
  const [downloads, setDownloads] = useState<Record<number, DownloadState>>({});

  useEffect(() => {
    void load();
  }, []);

  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(timer);
  }, []);

  async function load() {
    setLoadError("");
    try {
      const { papers: fetched } = await listPapers();
      setPapers(fetched);

      const results = await Promise.all(
        fetched.map(async (paper) => {
          try {
            const status = await getStatus(paper.id);
            return [paper.id, status.exam_datetime] as const;
          } catch {
            return [paper.id, paper.exam_datetime] as const;
          }
        })
      );
      setExamDatetimes(Object.fromEntries(results));
    } catch (err) {
      setLoadError(err instanceof Error ? err.message : "Failed to load papers");
    }
  }

  async function handleDownload(paperId: number) {
    setDownloads((prev) => ({ ...prev, [paperId]: { loading: true, content: null, error: "" } }));
    try {
      const { content } = await downloadPaper(paperId);
      setDownloads((prev) => ({ ...prev, [paperId]: { loading: false, content, error: "" } }));
      await load();
    } catch (err) {
      setDownloads((prev) => ({
        ...prev,
        [paperId]: {
          loading: false,
          content: null,
          error: err instanceof Error ? err.message : "Download failed",
        },
      }));
    }
  }

  return (
    <section className="panel">
      <h2>Papers</h2>
      <Message type="error" text={loadError} />
      {papers.length === 0 ? (
        <p className="muted">No papers yet.</p>
      ) : (
        <div className="paper-cards">
          {papers.map((paper) => {
            const examDatetime = examDatetimes[paper.id] ?? paper.exam_datetime;
            const remainingMs = new Date(examDatetime).getTime() - now;
            const locked = remainingMs > 0;
            const download = downloads[paper.id];

            return (
              <article key={paper.id} className="paper-card">
                <h3>{paper.title}</h3>
                <p className="muted">Exam time: {new Date(examDatetime).toLocaleString()}</p>

                {locked ? (
                  <>
                    <p className="lock-status lock-status-locked">Paper locked.</p>
                    <p className="countdown-timer">Unlocks in: {formatCountdown(remainingMs)}</p>
                  </>
                ) : (
                  <p className="lock-status lock-status-unlocked">Unlocked — ready to download</p>
                )}

                <button
                  type="button"
                  className="btn-primary"
                  disabled={download?.loading}
                  onClick={() => handleDownload(paper.id)}
                >
                  {download?.loading ? "Downloading…" : "Download Paper"}
                </button>

                <Message type="error" text={download?.error ?? ""} />

                {download?.content && (
                  <div className="content-box">
                    <h4>Paper Content</h4>
                    <p>{download.content}</p>
                  </div>
                )}
              </article>
            );
          })}
        </div>
      )}
    </section>
  );
}
