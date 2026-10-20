import { useEffect, useState, type ChangeEvent, type FormEvent, type ReactNode } from 'react'
import { reviewLinkState } from './link-status'

type Project = Record<string, any>
type Link = { id: string; created_at: string; expires_at: string | null; revoked_at: string | null }
type Feedback = {
  comments: Array<{ version_id: string; body: string; created_at: string; client_name: string; original_name: string }>
  favorites: Array<{ version_id: string; original_name: string; count: number }>
  revisions: Array<{ id: string; version_id: string; body: string; status: 'Open' | 'Addressed'; created_at: string; client_name: string; original_name: string }>
  approvals: Array<{ version_id: string; created_at: string; client_name: string; original_name: string; version_number: number; deliverable_name: string; current: boolean }>
}

const field = 'mt-1 w-full rounded-lg border border-slate-300 p-2 text-sm'

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

function Input({ name, value, set }: { name: string; value: string; set: (value: string) => void }) {
  return <label className="mt-3 block text-xs font-bold uppercase tracking-wide text-slate-600">{name}<input className={field} value={value} onChange={(event) => set(event.target.value)} /></label>
}

export function ProofPage() {
  const [projects, setProjects] = useState<Project[]>([])
  const [selected, setSelected] = useState<Project | null>(null)
  const [note, setNote] = useState('')
  const load = () => api('/api/proof/projects').then(setProjects).catch((error) => setNote(error.message))

  useEffect(() => { load() }, [])

  if (selected) return <ProjectDetail project={selected} onBack={() => { setSelected(null); load() }} />

  return <section className="mx-auto max-w-5xl px-5 py-8">
    <a href="/tools" className="text-sm font-bold text-emerald-700">← All tools</a>
    <h1 className="mt-2 text-3xl font-black">ProofFlow</h1>
    {note && <Notice text={note} />}
    <NewProject done={load} fail={setNote} />
    <div className="mt-6 space-y-3">
      {projects.map((project) => <button key={project.id} onClick={() => api(`/api/proof/projects/${project.id}`).then(setSelected).catch((error) => setNote(error.message))} className="block w-full rounded-xl border bg-white p-4 text-left">
        <b>{project.name}</b><span className="float-right text-sm">{project.status}</span><p className="text-sm text-slate-600">{project.client_name}</p>
      </button>)}
    </div>
  </section>
}

function NewProject({ done, fail }: { done: () => void; fail: (message: string) => void }) {
  const [form, setForm] = useState({ name: '', clientName: '', clientEmail: '', description: '' })
  async function submit(event: FormEvent) {
    event.preventDefault()
    try {
      await api('/api/proof/projects', { method: 'POST', body: JSON.stringify(form) })
      setForm({ name: '', clientName: '', clientEmail: '', description: '' })
      done()
    } catch (error) { fail(error instanceof Error ? error.message : 'Could not create project') }
  }
  return <form onSubmit={submit} className="mt-6 rounded-2xl border bg-white p-5">
    <h2 className="text-xl font-black">New project</h2>
    <Input name="Project name" value={form.name} set={(name) => setForm({ ...form, name })} />
    <Input name="Client name" value={form.clientName} set={(clientName) => setForm({ ...form, clientName })} />
    <Input name="Client email" value={form.clientEmail} set={(clientEmail) => setForm({ ...form, clientEmail })} />
    <Input name="Description" value={form.description} set={(description) => setForm({ ...form, description })} />
    <button className="mt-4 rounded-lg bg-slate-950 px-4 py-2 text-sm font-bold text-white">Create project</button>
  </form>
}

function ProjectDetail({ project, onBack }: { project: Project; onBack: () => void }) {
  const [current, setCurrent] = useState(project)
  const [note, setNote] = useState('')
  const [uploading, setUploading] = useState(false)
  const [newLink, setNewLink] = useState('')
  const [links, setLinks] = useState<Link[]>([])
  const [feedback, setFeedback] = useState<Feedback>({ comments: [], favorites: [], revisions: [], approvals: [] })
  const refresh = async () => setCurrent(await api(`/api/proof/projects/${current.id}`))
  const loadLinks = () => api(`/api/proof/projects/${current.id}/review-links`).then(setLinks).catch((error) => setNote(error.message))
  const loadFeedback = () => api(`/api/proof/projects/${current.id}/feedback`).then(setFeedback).catch((error) => setNote(error.message))

  useEffect(() => { loadLinks(); loadFeedback() }, [current.id])

  async function upload(event: ChangeEvent<HTMLInputElement>) {
    const file = event.currentTarget.files?.[0]
    if (!file) return
    if (!['image/jpeg', 'image/png', 'image/webp', 'application/pdf'].includes(file.type) || file.size > 5 * 1024 * 1024) {
      setNote('Use JPEG, PNG, WebP, or PDF up to 5 MB.')
      return
    }
    setUploading(true)
    try {
      const data = await new Promise<string>((resolve, reject) => {
        const reader = new FileReader()
        reader.onload = () => resolve(String(reader.result))
        reader.onerror = reject
        reader.readAsDataURL(file)
      })
      await api(`/api/proof/projects/${current.id}/files`, { method: 'POST', body: JSON.stringify({ name: file.name, data }) })
      await refresh()
      setNote('File uploaded.')
    } catch (error) { setNote(error instanceof Error ? error.message : 'Upload failed.')
    } finally { setUploading(false); event.currentTarget.value = '' }
  }

  async function save(event: FormEvent) {
    event.preventDefault()
    try {
      await api(`/api/proof/projects/${current.id}`, { method: 'PATCH', body: JSON.stringify({ name: current.name, clientName: current.client_name, clientEmail: current.client_email || '', description: current.description, status: current.status }) })
      setNote('Project saved.')
    } catch (error) { setNote(error instanceof Error ? error.message : 'Could not save project') }
  }

  return <section className="mx-auto max-w-5xl px-5 py-8">
    <button onClick={onBack} className="text-sm font-bold text-emerald-700">← Projects</button>
    <h1 className="mt-3 text-3xl font-black">{current.name}</h1>
    {note && <Notice text={note} />}
    <form onSubmit={save} className="mt-6 rounded-2xl border bg-white p-5">
      <h2 className="text-xl font-black">Project & client</h2>
      <Input name="Project name" value={current.name} set={(name) => setCurrent({ ...current, name })} />
      <Input name="Client name" value={current.client_name} set={(client_name) => setCurrent({ ...current, client_name })} />
      <Input name="Client email" value={current.client_email || ''} set={(client_email) => setCurrent({ ...current, client_email })} />
      <Input name="Description" value={current.description} set={(description) => setCurrent({ ...current, description })} />
      <button className="mt-4 rounded-lg bg-slate-950 px-4 py-2 text-sm font-bold text-white">Save details</button>
    </form>
    <Deliverables project={current} uploading={uploading} upload={upload} refresh={refresh} note={setNote} feedback={feedback} />
    <FeedbackPanel feedback={feedback} reload={loadFeedback} note={setNote} />
    <ReviewLinks projectId={current.id} links={links} reload={loadLinks} newLink={newLink} setNewLink={setNewLink} note={setNote} />
  </section>
}

function Deliverables({ project, uploading, upload, refresh, note, feedback }: { project: Project; uploading: boolean; upload: (event: ChangeEvent<HTMLInputElement>) => void; refresh: () => Promise<void>; note: (message: string) => void; feedback: Feedback }) {
  const [replacing, setReplacing] = useState('')
  async function replacement(deliverableId: string, event: ChangeEvent<HTMLInputElement>) {
    const file = event.currentTarget.files?.[0]
    if (!file) return
    if (!['image/jpeg', 'image/png', 'image/webp', 'application/pdf'].includes(file.type) || file.size > 5 * 1024 * 1024) return note('Use JPEG, PNG, WebP, or PDF up to 5 MB.')
    setReplacing(deliverableId)
    try {
      const data = await new Promise<string>((resolve, reject) => { const reader = new FileReader(); reader.onload = () => resolve(String(reader.result)); reader.onerror = reject; reader.readAsDataURL(file) })
      await api(`/api/proof/deliverables/${deliverableId}/versions`, { method: 'POST', body: JSON.stringify({ name: file.name, data }) })
      await refresh()
      note('New version uploaded.')
    } catch (error) { note(error instanceof Error ? error.message : 'Could not upload new version.')
    } finally { setReplacing(''); event.currentTarget.value = '' }
  }
  return <section className="mt-6 rounded-2xl border bg-white p-5">
    <h2 className="text-xl font-black">Deliverables</h2>
    <p className="mt-1 text-sm text-slate-600">JPEG, PNG, WebP, or PDF; maximum 5 MB. Upload a new version to preserve earlier files and feedback.</p>
    <input className="mt-4 text-sm" type="file" disabled={uploading} accept="image/jpeg,image/png,image/webp,application/pdf" onChange={upload} />
    {uploading && <p className="mt-2 text-sm">Uploading…</p>}
    <div className="mt-4 space-y-3">
      {project.deliverables?.map((deliverable: any) => <article key={deliverable.id} className="rounded-lg border p-3">
        <b>{deliverable.name}</b><span className="float-right text-sm">Current: Version {deliverable.versions[0]?.number}</span>
        <a href={`/api/proof/files/${deliverable.versions[0]?.id}`} target="_blank" rel="noreferrer" className="mt-3 block text-sm font-bold text-emerald-700">Preview / download current version</a>
        <label className="mt-3 block text-sm font-bold text-emerald-700">{replacing === deliverable.id ? 'Uploading new version…' : 'Upload new version'}<input className="mt-1 block text-sm font-normal text-slate-700" type="file" disabled={replacing !== ''} accept="image/jpeg,image/png,image/webp,application/pdf" onChange={(event) => replacement(deliverable.id, event)} /></label>
        <p className="mt-3 text-sm font-bold">Version history</p>
        <div className="mt-2 space-y-2">{deliverable.versions.map((version: any, index: number) => <div key={version.id} className="flex flex-wrap items-center justify-between gap-2 rounded bg-slate-50 p-2 text-sm"><span>Version {version.number} · {version.name} {index === 0 ? '· Current' : '· Superseded'}</span><a href={`/api/proof/files/${version.id}`} target="_blank" rel="noreferrer" className="font-bold text-emerald-700">Open</a></div>)}</div>
        <p className="mt-3 text-sm text-slate-600">{feedback.approvals.some((approval) => approval.version_id === deliverable.versions[0]?.id && approval.current) ? 'Approved by at least one client' : feedback.revisions.some((revision) => revision.version_id === deliverable.versions[0]?.id && revision.status === 'Open') ? 'Changes requested' : 'Awaiting review'}</p>
      </article>)}
    </div>
  </section>
}

function FeedbackPanel({ feedback, reload, note }: { feedback: Feedback; reload: () => void; note: (message: string) => void }) {
  const [busyId, setBusyId] = useState('')
  const total = feedback.comments.length + feedback.revisions.length + feedback.favorites.reduce((sum, favorite) => sum + Number(favorite.count), 0) + feedback.approvals.length
  async function address(revisionId: string) {
    if (!confirm('Mark this revision request as addressed?')) return
    setBusyId(revisionId)
    try {
      await api(`/api/proof/revisions/${revisionId}`, { method: 'PATCH', body: JSON.stringify({ status: 'Addressed' }) })
      await reload()
      note('Revision request marked as addressed.')
    } catch (error) { note(error instanceof Error ? error.message : 'Could not update revision request.')
    } finally { setBusyId('') }
  }
  return <section className="mt-6 rounded-2xl border bg-white p-5">
    <div className="flex flex-wrap items-baseline justify-between gap-2"><h2 className="text-xl font-black">Client feedback</h2><p className="text-sm text-slate-600">{total} feedback item{total === 1 ? '' : 's'}</p></div>
    <div className="mt-5 grid gap-5 lg:grid-cols-2">
      <FeedbackGroup title="Comments" empty="No comments yet.">{feedback.comments.map((comment) => <article key={`${comment.created_at}-${comment.body}`} className="rounded-lg bg-slate-50 p-3 text-sm"><p><b>{comment.client_name}</b> on {comment.original_name}</p><p className="mt-1 text-slate-600">{comment.body}</p><time className="mt-2 block text-xs text-slate-500">{new Date(comment.created_at).toLocaleString()}</time></article>)}</FeedbackGroup>
      <FeedbackGroup title="Favorite images" empty="No image selections yet.">{feedback.favorites.map((favorite) => <article key={favorite.version_id} className="rounded-lg bg-slate-50 p-3 text-sm"><b>{favorite.original_name}</b><p className="mt-1 text-slate-600">{favorite.count} unique selection{Number(favorite.count) === 1 ? '' : 's'}</p></article>)}</FeedbackGroup>
      <FeedbackGroup title="Revision requests" empty="No revision requests yet.">{feedback.revisions.map((revision) => <article key={revision.id} className="rounded-lg bg-slate-50 p-3 text-sm"><p><b>{revision.client_name}</b> on {revision.original_name}</p><p className="mt-1 text-slate-600">{revision.body}</p><time className="mt-2 block text-xs text-slate-500">{new Date(revision.created_at).toLocaleString()}</time><div className="mt-2 flex items-center justify-between gap-2"><span className={revision.status === 'Addressed' ? 'font-bold text-emerald-700' : 'font-bold text-amber-700'}>{revision.status}</span>{revision.status === 'Open' && <button disabled={busyId === revision.id} onClick={() => address(revision.id)} className="font-bold text-emerald-700 disabled:opacity-60">{busyId === revision.id ? 'Saving…' : 'Mark as addressed'}</button>}</div></article>)}</FeedbackGroup>
      <FeedbackGroup title="Approval history" empty="No approvals yet.">{feedback.approvals.map((approval) => <article key={`${approval.version_id}-${approval.client_name}-${approval.created_at}`} className="rounded-lg bg-slate-50 p-3 text-sm"><p><b>{approval.client_name}</b> approved {approval.deliverable_name}</p><p className="mt-1 text-slate-600">Version {approval.version_number} · {approval.current ? 'Current version' : 'Superseded version'}</p><time className="mt-2 block text-xs text-slate-500">{new Date(approval.created_at).toLocaleString()}</time></article>)}</FeedbackGroup>
    </div>
  </section>
}

function FeedbackGroup({ title, empty, children }: { title: string; empty: string; children: ReactNode }) {
  const items = Array.isArray(children) ? children : [children]
  return <div><h3 className="font-bold">{title}</h3><div className="mt-3 space-y-2">{items.length ? items : <p className="text-sm text-slate-500">{empty}</p>}</div></div>
}

function ReviewLinks({ projectId, links, reload, newLink, setNewLink, note }: { projectId: string; links: Link[]; reload: () => void; newLink: string; setNewLink: (value: string) => void; note: (message: string) => void }) {
  const [busy, setBusy] = useState('')
  async function make() {
    setBusy('new')
    try {
      const result = await api(`/api/proof/projects/${projectId}/review-links`, { method: 'POST', body: '{}' })
      setNewLink(`${location.origin}${result.url}`)
      reload()
    } catch (error) { note(error instanceof Error ? error.message : 'Could not create link.')
    } finally { setBusy('') }
  }
  async function revoke(id: string) {
    if (!confirm('Revoke this review link? It will stop working immediately.')) return
    setBusy(id)
    try { await api(`/api/proof/review-links/${id}/revoke`, { method: 'POST' }); note('Review link revoked.'); reload()
    } catch (error) { note(error instanceof Error ? error.message : 'Could not revoke link.')
    } finally { setBusy('') }
  }
  return <section className="mt-6 rounded-2xl border bg-white p-5">
    <h2 className="text-xl font-black">Review links</h2><p className="text-sm text-slate-600">Tokens are only shown once when created.</p>
    <button onClick={make} disabled={busy === 'new'} className="mt-3 rounded-lg bg-slate-950 px-4 py-2 text-sm font-bold text-white">{busy === 'new' ? 'Generating…' : 'Generate review link'}</button>
    {newLink && <div className="mt-3 break-all rounded-lg bg-slate-50 p-3 text-sm">{newLink}<button onClick={() => navigator.clipboard?.writeText(newLink)} className="ml-3 font-bold text-emerald-700">Copy</button></div>}
    <div className="mt-4 space-y-3">{links.map((link) => { const status = reviewLinkState(link); return <div className="flex flex-wrap items-center justify-between gap-3 rounded-lg bg-slate-50 p-3 text-sm" key={link.id}><span>Created {new Date(link.created_at).toLocaleString()} · {link.expires_at ? `Expires ${new Date(link.expires_at).toLocaleString()}` : 'No expiry'} · <b>{status}</b></span>{status === 'Active' && <button disabled={busy === link.id} onClick={() => revoke(link.id)} className="font-bold text-rose-600">{busy === link.id ? 'Revoking…' : 'Revoke'}</button>}</div> })}</div>
  </section>
}

function Notice({ text }: { text: string }) { return <p className="mt-4 rounded-lg bg-emerald-50 p-3 text-sm text-emerald-900">{text}</p> }
