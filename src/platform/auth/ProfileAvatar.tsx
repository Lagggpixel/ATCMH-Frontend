"use client";

import {useState} from "react";
import Image from "next/image";
import {initialsFromDisplayName} from "@/src/dashboard/components/home/HomeUserMenuState";
import {safeAvatarUrl} from "./profile-avatar";
import styles from "./ProfileAvatar.module.css";

export default function ProfileAvatar({avatarUrl, displayName, size = 42}: {
  avatarUrl?: string | null; displayName: string; size?: number;
}) {
  const [failedUrl, setFailedUrl] = useState<string | null>(null);
  const url = safeAvatarUrl(avatarUrl);
  return <span className={styles.avatar} style={{width: size, height: size}} aria-hidden="true">
    {url && url !== failedUrl
      ? <Image key={url} src={url} width={size} height={size} alt="" unoptimized referrerPolicy="no-referrer" onError={() => setFailedUrl(url)}/>
      : <span className={styles.initials}>{initialsFromDisplayName(displayName) || "U"}</span>}
  </span>;
}
