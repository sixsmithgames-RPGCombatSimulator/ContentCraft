import { useEffect, useId, useRef } from 'react';

interface WorldEntry {
  canonical_name: string;
  type: string;
  aliases?: string[];
  tags?: string[];
  claims?: Array<{ text: string }>;
}

/** Read the already-authorized campaign response; never infer scene presence. */
export default function WorldEntryReader({ entity, onClose }: { entity: WorldEntry; onClose: () => void }) {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const titleId = useId();
  useEffect(() => {
    const previousFocus = document.activeElement as HTMLElement | null;
    const dialog = dialogRef.current;
    dialog?.showModal();
    return () => { dialog?.close(); previousFocus?.focus(); };
  }, []);
  return <dialog ref={dialogRef} className="world-entry-reader" aria-labelledby={titleId} onCancel={event => { event.preventDefault(); onClose(); }}>
    <header className="flex items-start justify-between gap-4">
      <div><p className="text-sm text-gray-500">Campaign reference · {entity.type}</p><h2 id={titleId} className="text-2xl font-semibold break-words">{entity.canonical_name}</h2></div>
      <button type="button" onClick={onClose} className="btn-secondary">Close</button>
    </header>
    <p className="text-sm text-gray-500 my-4">Reading this entry does not change it or place it in the current scene.</p>
    {Boolean(entity.aliases?.length) && <p className="mb-4">Also known as: {entity.aliases?.join(', ')}</p>}
    <section aria-label="Saved facts">
      <h3 className="font-semibold mb-3">Saved facts</h3>
      {entity.claims?.length ? <ul className="space-y-4 list-disc pl-5">{entity.claims.map((claim, index) => <li key={index} className="whitespace-pre-wrap break-words">{claim.text}</li>)}</ul> : <p>No facts are recorded in this entry. Close this reader and choose Edit to add details.</p>}
    </section>
    {Boolean(entity.tags?.length) && <p className="mt-6 text-sm text-gray-500">Tags: {entity.tags?.join(', ')}</p>}
  </dialog>;
}
