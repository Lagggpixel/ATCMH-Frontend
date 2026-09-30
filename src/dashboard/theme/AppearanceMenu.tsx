"use client";

import {useEffect, useId, useRef, useState} from "react";
import {CheckIcon} from "@phosphor-icons/react/Check";
import {DesktopIcon} from "@phosphor-icons/react/Desktop";
import {MoonIcon} from "@phosphor-icons/react/Moon";
import {SunIcon} from "@phosphor-icons/react/Sun";
import {useDashboardAppearance} from "./DashboardThemeProvider";
import type {DashboardAppearance} from "./appearance";
import styles from "./AppearanceMenu.module.css";

const options = [
    {value: "light", label: "Light", Icon: SunIcon},
    {value: "dark", label: "Dark", Icon: MoonIcon},
    {value: "system", label: "System", Icon: DesktopIcon},
] as const;

export default function AppearanceMenu() {
    const {appearance, setAppearance} = useDashboardAppearance();
    const [open, setOpen] = useState(false);
    const container = useRef<HTMLDivElement>(null);
    const trigger = useRef<HTMLButtonElement>(null);
    const id = useId();
    const CurrentIcon = options.find(option => option.value === appearance)?.Icon ?? DesktopIcon;

    useEffect(() => {
        if (!open) return;
        container.current?.querySelector<HTMLButtonElement>('[aria-checked="true"]')?.focus();
        const onPointerDown = (event: PointerEvent) => { if (!container.current?.contains(event.target as Node)) setOpen(false); };
        const onKeyDown = (event: KeyboardEvent) => {
            if (event.key === "Escape") { event.preventDefault(); setOpen(false); trigger.current?.focus(); }
            if (["ArrowDown", "ArrowUp", "Home", "End"].includes(event.key)) {
                const buttons = [...(container.current?.querySelectorAll<HTMLButtonElement>('[role="menuitemradio"]') ?? [])];
                if (!buttons.length) return;
                event.preventDefault();
                const current = buttons.indexOf(document.activeElement as HTMLButtonElement);
                const next = event.key === "Home" ? 0 : event.key === "End" ? buttons.length - 1 : (current + (event.key === "ArrowDown" ? 1 : -1) + buttons.length) % buttons.length;
                buttons[next].focus();
            }
            if (event.key === "Tab") { setOpen(false); trigger.current?.focus(); }
        };
        document.addEventListener("pointerdown", onPointerDown);
        container.current?.addEventListener("keydown", onKeyDown);
        const element = container.current;
        return () => {document.removeEventListener("pointerdown", onPointerDown); element?.removeEventListener("keydown", onKeyDown);};
    }, [open]);

    const select = (value: DashboardAppearance) => { setAppearance(value); setOpen(false); trigger.current?.focus(); };
    return <div className={styles.container} ref={container}>
        <button ref={trigger} className={styles.trigger} type="button" aria-label={`Appearance: ${appearance}`} aria-haspopup="menu" aria-expanded={open} aria-controls={id} onClick={() => setOpen(value => !value)}><CurrentIcon size={21}/></button>
        {open ? <div id={id} className={styles.menu} role="menu" aria-label="Appearance">
            <p>Appearance</p>
            {options.map(({value, label, Icon}) => <button key={value} role="menuitemradio" aria-checked={appearance === value} type="button" onClick={() => select(value)}><Icon size={20}/><span>{label}</span>{appearance === value ? <CheckIcon size={18}/> : null}</button>)}
        </div> : null}
    </div>;
}
