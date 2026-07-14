import styles from "./ImpersonationBanner.module.css";
import {impersonationBannerText} from "./ImpersonationState.ts";

export default function ImpersonationBanner({accountId, onExit}: {accountId: string; onExit: () => Promise<void>}) {
    return <aside className={styles.banner} role="status"><strong>{impersonationBannerText(accountId)}</strong><span>Actions are attributed to your real administrator account.</span><button type="button" onClick={() => void onExit()}>Exit impersonation</button></aside>;
}
