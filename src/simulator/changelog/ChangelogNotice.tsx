"use client";
import {useCallback, useEffect, useState} from "react";
import {usePathname} from "next/navigation";
import ChangelogDialog from "./ChangelogDialog";
import {browserChangelogPreference, changelogKey, CHANGELOG_PATH, unreadChangelog, visibleChangelog, type ChangelogDay} from "./changelog";

/** Mounted only for mentors on the Sweatbox library pages. Mentees and live sessions never receive this dialog. */
export default function ChangelogNotice({accountId}: {accountId: string}) {
  const pathname = usePathname().replace(/^\/simulator(?=\/|$)/, "/sweatbox").replace(/\/$/, "");
  const [days, setDays] = useState<readonly ChangelogDay[]>([]);
  const [open, setOpen] = useState(false);
  const presented = useCallback(() => {
    if (days[0]) browserChangelogPreference(accountId).write(days[0].date);
  }, [accountId, days]);
  useEffect(() => {
    const preference = browserChangelogPreference(accountId), current = visibleChangelog();
    if (!current.length) return;
    // Reading the full list already presents the changelog; do not obscure it with a popup.
    if (pathname === CHANGELOG_PATH) {preference.write(current[0].date); return;}
    if (!unreadChangelog(current, preference.read()).length) return;
    let offered = false;
    const check = () => {
      if (offered || document.visibilityState === "hidden" || document.querySelector('dialog[open], [role="dialog"]')) return;
      const unread = unreadChangelog(current, preference.read());
      if (!unread.length) return;
      offered = true; changes.disconnect(); setDays(unread); setOpen(true);
    };
    // Let the existing first-visit tutorial mount before deciding which notice can open.
    const timer = window.setTimeout(check, 150);
    const changes = new MutationObserver(check);
    changes.observe(document.body, {childList: true, subtree: true, attributes: true, attributeFilter: ["open"]});
    const storage = (event: StorageEvent) => {
      if (event.key === changelogKey(accountId) && !unreadChangelog(current, preference.read()).length) setOpen(false);
    };
    window.addEventListener("storage", storage);
    document.addEventListener("visibilitychange", check);
    return () => {clearTimeout(timer); changes.disconnect(); window.removeEventListener("storage", storage); document.removeEventListener("visibilitychange", check);};
  }, [accountId, pathname]);
  return <ChangelogDialog open={open} days={days} onClose={() => setOpen(false)} onPresented={presented}/>;
}
