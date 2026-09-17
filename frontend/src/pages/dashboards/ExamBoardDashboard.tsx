import { useEffect, useState } from "react";
import type { FormEvent } from "react";
import {
  createPaper,
  getChain,
  listPapers,
  uploadContent,
  verifyChain,
} from "../../api/client";
import type { CustodyEvent, ExamPaper } from "../../types";
import Message from "../../components/Message";
import IntegrityBadge from "../../components/IntegrityBadge";
import StatusBadge from "../../components/StatusBadge";
import ChainTimeline from "../../components/ChainTimeline";

export default function ExamBoardDashboard() {
  const [papers, setPapers] = useState<ExamPaper[]>([]);
  const [integrity, setIntegrity] = useState<Record<number, boolean | null>>({});
  const [loadError, setLoadError] = useState("");
  const [successMsg, setSuccessMsg] = useState("");

  const [title, setTitle] = useState("");
  const [examDatetime, setExamDatetime] = useState("");
  const [creating, setCreating] = useState(false);
  const [createError, setCreateError] = useState("");

  const [uploadingPaperId, setUploadingPaperId] = useState<number | null>(null);
  const [contentDraft, setContentDraft] = useState("");
  const [uploadError, setUploadError] = useState("");
  const [uploading, setUploading] = useState(false);

  const [viewingPaperId, setViewingPaperId] = useState<number | null>(null);
  const [chainEvents, setChainEvents] = useState<CustodyEvent[]>([]);
  const [chainError, setChainError] = useState("");
  const [chainLoading, setChainLoading] = useState(false);

  useEffect(() => {
    void loadPapers();
  }, []);

  useEffect(() => {
    if (!successMsg) return;
    const timer = setTimeout(() => setSuccessMsg(""), 4000);
    return () => clearTimeout(timer);
  }, [successMsg]);

  async function loadPapers() {
    setLoadError("");
    try {
      const { papers: fetched } = await listPapers();
      setPapers(fetched);

      const results = await Promise.all(
        fetched.map(async (paper) => {
          try {
            const result = await verifyChain(paper.id);
            return [paper.id, result.valid] as const;
          } catch {
            return [paper.id, null] as const;
          }
        })
      );
      setIntegrity(Object.fromEntries(results));
    } catch (err) {
      setLoadError(err instanceof Error ? err.message : "Failed to load papers");
    }
  }

  async function handleCreate(event: FormEvent) {
    event.preventDefault();
    setCreateError("");

    if (!title.trim()) {
      setCreateError("Title is required");
      return;
    }
    if (!examDatetime) {
      setCreateError("Exam date/time is required");
      return;
    }

    setCreating(true);
    try {
      const isoDatetime = new Date(examDatetime).toISOString();
      await createPaper(title.trim(), isoDatetime);
      setTitle("");
      setExamDatetime("");
      setSuccessMsg("Paper created.");
      await loadPapers();
    } catch (err) {
      setCreateError(err instanceof Error ? err.message : "Failed to create paper");
    } finally {
      setCreating(false);
    }
  }

  function startUpload(paperId: number) {
    setUploadingPaperId(paperId);
    setContentDraft("");
    setUploadError("");
  }

  function cancelUpload() {
    setUploadingPaperId(null);
    setContentDraft("");
    setUploadError("");
  }

  async function submitUpload(paperId: number) {
    setUploadError("");
    if (!contentDraft.trim()) {
      setUploadError("Content is required");
      return;
    }

    setUploading(true);
    try {
      await uploadContent(paperId, contentDraft);
      setUploadingPaperId(null);
      setContentDraft("");
      setSuccessMsg(`Content uploaded for "${papers.find((p) => p.id === paperId)?.title ?? paperId}".`);
      await loadPapers();
    } catch (err) {
      setUploadError(err instanceof Error ? err.message : "Upload failed");
    } finally {
      setUploading(false);
    }
  }

  async function handleViewChain(paperId: number) {
    setChainError("");
    setChainLoading(true);
    setViewingPaperId(paperId);
    try {
      const { events } = await getChain(paperId);
      setChainEvents(events);
    } catch (err) {
      setChainError(err instanceof Error ? err.message : "Failed to load chain");
      setChainEvents([]);
    } finally {
      setChainLoading(false);
    }
  }

  async function handleVerify(paperId: number) {
    setChainError("");
    try {
      const result = await verifyChain(paperId);
      setIntegrity((prev) => ({ ...prev, [paperId]: result.valid }));
      setSuccessMsg(
        result.valid
          ? `Paper #${paperId}: chain verified — no tampering detected.`
          : `Paper #${paperId}: TAMPERED — ${result.reason ?? "chain broken"} (event #${result.brokenAtEventId ?? "?"}).`
      );
      if (viewingPaperId === paperId) {
        await handleViewChain(paperId);
      }
    } catch (err) {
      setChainError(err instanceof Error ? err.message : "Verify failed");
    }
  }

  const viewingPaper = papers.find((p) => p.id === viewingPaperId) ?? null;

  return (
    <section>
      <section className="panel">
        <h2>Create Paper</h2>
        <form className="inline-form" onSubmit={handleCreate}>
          <label className="field">
            Title
            <input
              type="text"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="Math Final 2026"
            />
          </label>
          <label className="field">
            Exam Date/Time
            <input
              type="datetime-local"
              value={examDatetime}
              onChange={(e) => setExamDatetime(e.target.value)}
            />
          </label>
          <button type="submit" className="btn-primary" disabled={creating}>
            {creating ? "Creating…" : "Create Paper"}
          </button>
        </form>
        <Message type="error" text={createError} />
      </section>

      <Message type="success" text={successMsg} />
      <Message type="error" text={loadError} />

      <section className="panel">
        <h2>Papers</h2>
        {papers.length === 0 ? (
          <p className="muted">No papers yet. Create one above.</p>
        ) : (
          <table className="data-table">
            <thead>
              <tr>
                <th>Title</th>
                <th>Status</th>
                <th>Exam Time</th>
                <th>Chain Integrity</th>
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
                  <td>{new Date(paper.exam_datetime).toLocaleString()}</td>
                  <td>
                    <IntegrityBadge valid={integrity[paper.id] ?? null} />
                  </td>
                  <td className="actions-cell">
                    <div className="actions-row">
                      <button type="button" onClick={() => startUpload(paper.id)}>
                        Upload Content
                      </button>
                      <button type="button" onClick={() => handleViewChain(paper.id)}>
                        View Chain
                      </button>
                      <button type="button" onClick={() => handleVerify(paper.id)}>
                        Verify Chain
                      </button>
                    </div>

                    {uploadingPaperId === paper.id && (
                      <div className="upload-box">
                        <textarea
                          value={contentDraft}
                          onChange={(e) => setContentDraft(e.target.value)}
                          placeholder="Paste exam paper content here…"
                          rows={4}
                        />
                        <div className="actions-row">
                          <button
                            type="button"
                            className="btn-primary"
                            disabled={uploading}
                            onClick={() => submitUpload(paper.id)}
                          >
                            {uploading ? "Saving…" : "Save Content"}
                          </button>
                          <button type="button" onClick={cancelUpload}>
                            Cancel
                          </button>
                        </div>
                        <Message type="error" text={uploadError} />
                      </div>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </section>

      {viewingPaperId !== null && (
        <section className="panel">
          <h2>Custody Timeline — {viewingPaper ? viewingPaper.title : `Paper #${viewingPaperId}`}</h2>
          <Message type="error" text={chainError} />
          {chainLoading ? <p className="muted">Loading…</p> : <ChainTimeline events={chainEvents} />}
        </section>
      )}
    </section>
  );
}
