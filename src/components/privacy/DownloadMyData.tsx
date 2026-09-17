"use client";

import { appStore } from "@/lib/storage/settings";
import { localStamp } from "@/hooks/useAccount";

/**
 * The portability right, as a button. Everything StrumLab holds about a
 * player in this browser is one JSON document, so "give me my data" is a
 * file download rather than an email thread. The synced copy in an account
 * is the same document, so this covers that too.
 */
export function DownloadMyData() {
  const download = () => {
    const doc = {
      exportedAt: new Date().toISOString(),
      lastSavedAt: localStamp() ? new Date(localStamp()).toISOString() : null,
      state: appStore.get(),
    };
    const blob = new Blob([JSON.stringify(doc, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `strumlab-data-${doc.exportedAt.slice(0, 10)}.json`;
    a.click();
    URL.revokeObjectURL(url);
  };
  return (
    <button type="button" className="btn text-xs" onClick={download}>
      Download my data (JSON)
    </button>
  );
}
