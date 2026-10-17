"use client";
import {useEffect, useId, useRef, useState} from "react";
import {createPortal} from "react-dom";
import {useRouter} from "next/navigation";
import {RADAR_TOUR, SESSION_TOUR, placeTourCard, shouldStartTutorial, tutorialPreference, type TutorialOutcome, type TourRect} from "./tutorial";
import styles from "./StaffTutorial.module.css";

export default function StaffTutorial({accountId, live = false}: {accountId: string; live?: boolean}) {
  const router = useRouter();
  const [open, setOpen] = useState(false), [step, setStep] = useState(0);
  const [layout, setLayout] = useState<{target: TourRect | null; left: number; top: number} | null>(null);
  const card = useRef<HTMLElement>(null), heading = useRef<HTMLHeadingElement>(null), trigger = useRef<HTMLButtonElement>(null);
  const titleId = useId(), descriptionId = useId();
  const steps = live ? RADAR_TOUR : SESSION_TOUR, current = steps[step], last = step === steps.length - 1;
  const placed = layout !== null;
  useEffect(() => {if (open && placed) heading.current?.focus({preventScroll: true});}, [open, step, placed]);
  useEffect(() => {
    const timer = window.setTimeout(() => {if (shouldStartTutorial(tutorialPreference(accountId).read(), live)) setOpen(true);}, 0);
    return () => window.clearTimeout(timer);
  }, [accountId, live]);
  const dismiss = (outcome: TutorialOutcome) => {
    tutorialPreference(accountId).write(outcome); setOpen(false); setLayout(null); trigger.current?.focus();
  };
  useEffect(() => {
    if (!open) return;
    const escape = (event: KeyboardEvent) => {
      if (event.key !== "Escape") return;
      if (document.querySelector("dialog[open]")) return;
      event.preventDefault(); event.stopImmediatePropagation();
      tutorialPreference(accountId).write("skipped"); setOpen(false); setLayout(null); trigger.current?.focus();
    };
    window.addEventListener("keydown", escape, true);
    return () => window.removeEventListener("keydown", escape, true);
  }, [open, accountId]);
  useEffect(() => {
    if (!open) return;
    let frame = 0, observed: Element | null = null;
    const findTarget = () => [current.target, current.fallback].flatMap(name => name ? [...document.querySelectorAll<HTMLElement>(`[data-simulator-tour="${name}"]`)] : []).find(element => {const rect = element.getBoundingClientRect(); return rect.width > 0 && rect.height > 0 && !element.closest("[inert]");});
    const resize = new ResizeObserver(() => schedule());
    const update = () => {
      const element = findTarget();
      if (element !== observed) {
        if (observed) resize.unobserve(observed);
        if (element) {resize.observe(element); element.scrollIntoView({block: "nearest", inline: "nearest", behavior: "instant"});}
        observed = element ?? null;
      }
      const rect = element?.getBoundingClientRect();
      const visible = rect && rect.bottom > 0 && rect.top < innerHeight && rect.right > 0 && rect.left < innerWidth;
      const target = visible ? {left: Math.max(4, rect.left - 5), top: Math.max(4, rect.top - 5), width: Math.max(0, Math.min(innerWidth - 4, rect.right + 5) - Math.max(4, rect.left - 5)), height: Math.max(0, Math.min(innerHeight - 4, rect.bottom + 5) - Math.max(4, rect.top - 5))} : null;
      const box = card.current?.getBoundingClientRect();
      const position = placeTourCard(target, {width: innerWidth, height: innerHeight}, {width: box?.width ?? 340, height: box?.height ?? 300});
      const next = {target, ...position};
      setLayout(previous => JSON.stringify(previous) === JSON.stringify(next) ? previous : next);
    };
    function schedule() {cancelAnimationFrame(frame); frame = requestAnimationFrame(update);}
    const resized = () => {findTarget()?.scrollIntoView({block: "nearest", inline: "nearest", behavior: "instant"}); schedule();};
    findTarget()?.scrollIntoView({block: "nearest", inline: "nearest", behavior: "instant"});
    if (card.current) resize.observe(card.current);
    const mutations = new MutationObserver(schedule); mutations.observe(document.body, {childList: true, subtree: true});
    window.addEventListener("resize", resized); window.addEventListener("scroll", schedule, true); schedule();
    return () => {cancelAnimationFrame(frame); resize.disconnect(); mutations.disconnect(); window.removeEventListener("resize", resized); window.removeEventListener("scroll", schedule, true);};
  }, [open, current]);
  const advance = () => {
    if (!last) {setStep(value => value + 1); return;}
    if (live) {dismiss("completed"); return;}
    const link = document.querySelector<HTMLAnchorElement>('[data-simulator-tour="staff-radar-link"]');
    dismiss("radar");
    if (link) router.push(link.pathname);
  };
  return <>
    <button ref={trigger} type="button" className={styles.trigger} onClick={() => {setStep(0); setLayout(null); setOpen(true);}}>Tutorial</button>
    {open ? createPortal(<div className={`${styles.tour} ${live ? styles.live : ""}`}>
      {layout?.target && layout.target.width > 0 && layout.target.height > 0 ? <div className={styles.spotlight} data-testid="tutorial-spotlight" aria-hidden="true" style={layout.target}/> : null}
      <section ref={card} className={styles.card} role="dialog" aria-modal="false" aria-labelledby={titleId} aria-describedby={descriptionId} style={{left: layout?.left ?? 12, top: layout?.top ?? 12, visibility: layout ? "visible" : "hidden"}}>
        <header><span>{live ? "Staff radar" : "Getting started"} · <span aria-live="polite">{step + 1} of {steps.length}</span></span><button type="button" onClick={() => dismiss("skipped")}>Skip tour</button></header>
        <div className={styles.progress} aria-hidden="true">{steps.map((item, index) => <span key={item.target} className={index <= step ? styles.reached : undefined}/>)}</div>
        <h2 id={titleId} ref={heading} tabIndex={-1}>{current.title}</h2>
        <p id={descriptionId}>{current.text}</p><p className={styles.hint}>{current.hint}</p>
        {!layout?.target ? <p className={styles.hint}>This control is not visible yet. You can continue the tour or return after opening a session.</p> : null}
        <footer><button type="button" disabled={step === 0} onClick={() => setStep(value => value - 1)}>Back</button><button type="button" className={styles.next} onClick={advance}>{last ? live ? "Finish tour" : "Continue on radar" : "Next"}</button></footer>
      </section>
    </div>, document.body) : null}
  </>;
}
