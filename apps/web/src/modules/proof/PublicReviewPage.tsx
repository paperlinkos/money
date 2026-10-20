import { useEffect, useState, type FormEvent } from 'react'

async function api(path: string, options?: RequestInit) {
  const response = await fetch(path, {
    credentials: 'include',
    headers: { 'Content-Type': 'application/json', ...(options?.headers ?? {}) },
    ...options,
  })
  const body = await response.json().catch(() => ({}))
  if (!response.ok) throw Error(body.error || 'Request failed')
  return body
}

type Feedback = { participant: string | null; comments: any[]; favorites: string[]; approvals: string[] }

export function PublicReviewPage({ token }: { token: string }) {
  const [data, setData] = useState<any>()
  const [feedback, setFeedback] = useState<Feedback>({ participant: null, comments: [], favorites: [], approvals: [] })
  const [name, setName] = useState('')
  const [error, setError] = useState('')
  const [settingName, setSettingName] = useState(false)

  const load = () => Promise.all([
    api(`/api/public/review/${token}`),
    api(`/api/public/review/${token}/feedback`),
  ]).then(([review, receivedFeedback]) => {
    setData(review)
    setFeedback(receivedFeedback)
    setName(receivedFeedback.participant || '')
    setError('')
  }).catch((loadError) => setError(loadError.message))

  useEffect(() => { load() }, [token])

  async function identify(event: FormEvent) {
    event.preventDefault()
    setSettingName(true)
    try {
      await api(`/api/public/review/${token}/participant`, { method: 'POST', body: JSON.stringify({ name }) })
      await load()
    } catch (identifyError) {
      setError(identifyError instanceof Error ? identifyError.message : 'Could not save your name.')
    } finally {
      setSettingName(false)
    }
  }

  if (error) return <main className="mx-auto max-w-xl px-5 py-12"><h1 className="text-3xl font-black">Review unavailable</h1><p className="mt-3 text-slate-600">{error}</p></main>
  if (!data) return <main className="p-10">Loading review…</main>

  return <main className="mx-auto max-w-3xl px-5 py-10">
    <p className="text-sm font-bold text-emerald-700">PaperlinkOS review</p>
    <h1 className="mt-2 text-3xl font-black">{data.project.name}</h1>
    {!feedback.participant && <form onSubmit={identify} className="mt-6 rounded-xl border bg-white p-4">
      <label className="block text-sm font-bold">Tell the creator who you are<input required maxLength={80} className="mt-2 w-full rounded border p-2" value={name} onChange={(event) => setName(event.target.value)} placeholder="Display name" /></label>
      <button disabled={settingName} className="mt-3 rounded bg-slate-950 px-3 py-2 text-sm font-bold text-white disabled:opacity-60">{settingName ? 'Saving…' : 'Continue'}</button>
    </form>}
    <section className="mt-8 space-y-5">
      {data.deliverables.map((deliverable: any) => <PublicDeliverable key={deliverable.version.id} deliverable={deliverable} token={token} feedback={feedback} refresh={load} />)}
    </section>
  </main>
}

function PublicDeliverable({ deliverable, token, feedback, refresh }: { deliverable: any; token: string; feedback: Feedback; refresh: () => void }) {
  const [favoriteError, setFavoriteError] = useState('')
  const [favoriteBusy, setFavoriteBusy] = useState(false)
  const [approvalBusy, setApprovalBusy] = useState(false)
  const [approvalNotice, setApprovalNotice] = useState('')
  const version = deliverable.version
  const source = `/api/public/review/${token}/files/${version.id}`
  const isImage = version.type.startsWith('image/')
  const selected = feedback.favorites.includes(version.id)
  const approved = feedback.approvals.includes(version.id)
  const comments = feedback.comments.filter((comment: any) => comment.version_id === version.id)

  async function toggleFavorite() {
    setFavoriteBusy(true)
    setFavoriteError('')
    try {
      await api(`/api/public/review/${token}/favorites/${version.id}`, { method: selected ? 'DELETE' : 'PUT' })
      await refresh()
    } catch (error) {
      setFavoriteError(error instanceof Error ? error.message : 'Could not update image selection.')
    } finally {
      setFavoriteBusy(false)
    }
  }

  async function approve() {
    if (!confirm(`Approve ${deliverable.name}, Version ${version.number}? This is not a legal signature.`)) return
    setApprovalBusy(true)
    setApprovalNotice('')
    try {
      await api(`/api/public/review/${token}/approvals`, { method: 'POST', body: JSON.stringify({ versionId: version.id, confirmed: true }) })
      await refresh()
      setApprovalNotice('Version approved.')
    } catch (error) {
      setApprovalNotice(error instanceof Error ? error.message : 'Could not approve this version.')
    } finally { setApprovalBusy(false) }
  }

  return <article className="overflow-hidden rounded-2xl border bg-white">
    <div className="p-4"><b>{deliverable.name}</b><span className="float-right text-sm">Version {version.number}</span></div>
    {isImage ? <img src={source} alt={version.name} className="max-h-[28rem] w-full object-contain" /> : <iframe title={version.name} src={source} className="h-96 w-full" />}
    <div className="p-4">
      <a href={source} download={version.name} className="text-sm font-bold text-emerald-700">Download file</a>
      {isImage && feedback.participant && <button onClick={toggleFavorite} disabled={favoriteBusy} className="ml-4 text-sm font-bold text-emerald-700 disabled:opacity-60">{favoriteBusy ? 'Saving…' : selected ? 'Remove favorite' : 'Favorite image'}</button>}
      {feedback.participant && <button onClick={approve} disabled={approvalBusy || approved} className="ml-4 text-sm font-bold text-emerald-700 disabled:opacity-60">{approvalBusy ? 'Saving…' : approved ? 'Approved' : `Approve Version ${version.number}`}</button>}
      {favoriteError && <p className="mt-2 text-sm text-rose-700">{favoriteError}</p>}
      {approvalNotice && <p className="mt-2 text-sm text-emerald-700">{approvalNotice}</p>}
      <FeedbackForms token={token} versionId={version.id} ready={Boolean(feedback.participant)} comments={comments} refresh={refresh} />
    </div>
  </article>
}

function FeedbackForms({ token, versionId, ready, comments, refresh }: { token: string; versionId: string; ready: boolean; comments: any[]; refresh: () => void }) {
  const [comment, setComment] = useState('')
  const [revision, setRevision] = useState('')
  const [busy, setBusy] = useState('')
  const [notice, setNotice] = useState('')

  async function send(kind: 'comments' | 'revisions', body: string, clear: (value: string) => void) {
    if (!body.trim()) return setNotice('Please enter your feedback before sending.')
    setBusy(kind)
    setNotice('')
    try {
      await api(`/api/public/review/${token}/${kind}`, { method: 'POST', body: JSON.stringify({ versionId, body }) })
      clear('')
      setNotice(kind === 'revisions' ? 'Your change request was sent.' : 'Your comment was sent.')
      await refresh()
    } catch (error) {
      setNotice(error instanceof Error ? error.message : 'Could not send feedback.')
    } finally {
      setBusy('')
    }
  }

  return <div className="mt-4 border-t pt-4">
    <b className="text-sm">Feedback</b>
    {comments.map((commentItem) => <p className="mt-2 rounded bg-slate-50 p-2 text-sm" key={`${commentItem.created_at}-${commentItem.body}`}><strong>{commentItem.client_name}</strong>: {commentItem.body}</p>)}
    {ready && <>
      <form onSubmit={(event) => { event.preventDefault(); send('comments', comment, setComment) }} className="mt-3 flex gap-2">
        <input className="flex-1 rounded border p-2 text-sm" value={comment} maxLength={2000} onChange={(event) => setComment(event.target.value)} placeholder="Leave a comment" />
        <button disabled={busy !== ''} className="rounded bg-slate-950 px-3 text-sm font-bold text-white disabled:opacity-60">{busy === 'comments' ? 'Saving…' : 'Send'}</button>
      </form>
      <form onSubmit={(event) => { event.preventDefault(); send('revisions', revision, setRevision) }} className="mt-3">
        <label className="text-sm font-bold">Request changes for this version</label>
        <div className="mt-1 flex gap-2"><input className="flex-1 rounded border p-2 text-sm" value={revision} maxLength={2000} onChange={(event) => setRevision(event.target.value)} placeholder="Describe what should change" /><button disabled={busy !== ''} className="rounded border px-3 text-sm font-bold text-emerald-700 disabled:opacity-60">{busy === 'revisions' ? 'Sending…' : 'Request'}</button></div>
      </form>
      {notice && <p className="mt-2 text-sm text-emerald-700">{notice}</p>}
    </>}
  </div>
}
