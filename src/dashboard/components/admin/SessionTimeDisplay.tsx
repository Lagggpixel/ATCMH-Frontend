"use client";
import {useEffect, useState} from "react";
import {formatAdminUtcDate} from "../../utils/AdminDateUtils";
import {formatSessionLocalTime, sessionTimePreview} from "../../utils/SessionTime";
import type {Session} from "../../types/Session";

export default function SessionTimeDisplay({value}: {value: Session["time"]}) {
    const [local, setLocal] = useState("");
    useEffect(() => setLocal(formatSessionLocalTime(value)), [value]);
    const date = new Date(value);
    return <span><time dateTime={Number.isNaN(date.getTime()) ? undefined : date.toISOString()}>{formatAdminUtcDate(value)}</time>{local ? <small style={{display: "block"}}>{local}</small> : null}</span>;
}
export function SessionTimePreview({value}: {value: string}) {
    return <small role="status">{sessionTimePreview(value)}</small>;
}
