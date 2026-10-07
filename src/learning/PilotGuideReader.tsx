"use client";

import {useId, useLayoutEffect, useMemo, useRef, useState, type KeyboardEvent} from "react";
import {ArrowLeftIcon} from "@phosphor-icons/react/ArrowLeft";
import {ArrowRightIcon} from "@phosphor-icons/react/ArrowRight";
import {CaretDownIcon} from "@phosphor-icons/react/CaretDown";
import type {PilotGuide} from "./pilot-guide";
import {sanitizePilotGuideHtml} from "./pilot-guide-html";
import contentStyles from "./PilotGuideContent.module.css";
import styles from "./PilotGuideReader.module.css";

export type PilotGuideReaderProps = {
  guide: PilotGuide;
  initialChapterId?: string;
};

function lastUpdatedLabel(value: string): string {
  const date = new Date(`${value}T12:00:00Z`);
  if (Number.isNaN(date.getTime())) return value;
  return new Intl.DateTimeFormat("en-US", {month: "long", day: "numeric", year: "numeric", timeZone: "UTC"}).format(date);
}

export default function PilotGuideReader({guide, initialChapterId}: PilotGuideReaderProps) {
  const chapters = guide.chapters;
  const [selectedId, setSelectedId] = useState(() => initialChapterId ?? chapters[0]?.id ?? "");
  const [chaptersOpen, setChaptersOpen] = useState(false);
  const mobileToggle = useRef<HTMLButtonElement>(null);
  const focusChapterList = useRef(false);
  const chapterTabs = useRef<HTMLDivElement>(null);
  const tabs = useRef<Array<HTMLButtonElement | null>>([]);
  const panels = useRef<Array<HTMLDivElement | null>>([]);
  const revealChapter = useRef(false);
  const id = useId();
  const selectedIndex = Math.max(0, chapters.findIndex(chapter => chapter.id === selectedId));
  const selected = chapters[selectedIndex];
  const previous = chapters[selectedIndex - 1];
  const next = chapters[selectedIndex + 1];
  const selectedHtml = useMemo(() => sanitizePilotGuideHtml(selected?.html ?? ""), [selected?.html]);

  useLayoutEffect(() => {
    const container = chapterTabs.current;
    const tab = tabs.current[selectedIndex];
    if (!container || !tab) return;
    const revealTab = () => {
      const offset = tab.getBoundingClientRect().top - container.getBoundingClientRect().top;
      const bottom = offset + tab.offsetHeight;
      if (offset < 0) container.scrollTop += offset;
      else if (bottom > container.clientHeight) container.scrollTop += bottom - container.clientHeight;
    };
    // Reveal the active row within the outline without moving the document.
    revealTab();
    const observer = new ResizeObserver(revealTab);
    observer.observe(container);
    observer.observe(tab);
    return () => observer.disconnect();
  }, [selectedIndex, chapters]);

  useLayoutEffect(() => {
    if (chaptersOpen && focusChapterList.current) {
      focusChapterList.current = false;
      tabs.current[selectedIndex]?.focus();
    }
  }, [chaptersOpen, selectedIndex]);

  useLayoutEffect(() => {
    if (!revealChapter.current) return;
    revealChapter.current = false;
    const panel = panels.current[selectedIndex];
    if (!panel) return;
    panel.focus({preventScroll: true});
    // Previous/next returns readers to the new chapter, including from a long chapter's footer.
    panel.scrollIntoView({block: "start", behavior: "instant"});
  }, [selectedIndex, chaptersOpen]);

  function navigateToChapter(chapterId: string) {
    if (chapterId === selected?.id && !chaptersOpen) {
      const panel = panels.current[selectedIndex];
      panel?.focus({preventScroll: true});
      panel?.scrollIntoView({block: "start", behavior: "instant"});
      return;
    }
    revealChapter.current = true;
    setChaptersOpen(false);
    setSelectedId(chapterId);
  }

  function handleTabKeyDown(event: KeyboardEvent<HTMLButtonElement>, index: number) {
    let target: number;
    if (event.key === "Escape" && mobileToggle.current?.getClientRects().length) {
      event.preventDefault();
      setChaptersOpen(false);
      mobileToggle.current.focus({preventScroll: true});
      return;
    }
    if (event.key === "ArrowDown" || event.key === "ArrowRight") target = (index + 1) % chapters.length;
    else if (event.key === "ArrowUp" || event.key === "ArrowLeft") target = (index - 1 + chapters.length) % chapters.length;
    else if (event.key === "Home") target = 0;
    else if (event.key === "End") target = chapters.length - 1;
    else return;
    event.preventDefault();
    setSelectedId(chapters[target].id);
    tabs.current[target]?.focus({preventScroll: true});
  }

  function handleToggleKeyDown(event: KeyboardEvent<HTMLButtonElement>) {
    if (event.key === "ArrowDown" || event.key === "ArrowUp") {
      event.preventDefault();
      if (chaptersOpen) tabs.current[selectedIndex]?.focus();
      else {
        focusChapterList.current = true;
        setChaptersOpen(true);
      }
    } else if (event.key === "Escape") {
      setChaptersOpen(false);
    }
  }

  return <main className={styles.page} aria-labelledby={`${id}-guide-title`} data-pilot-guide-page>
    <header className={styles.introduction}>
      <div className={styles.introductionHeading}>
        <h1 id={`${id}-guide-title`}>{guide.title}</h1>
        <p className={styles.lastUpdated}>Last updated <time dateTime={guide.lastUpdated}>{lastUpdatedLabel(guide.lastUpdated)}</time></p>
      </div>
      <p>{guide.introduction}</p>
    </header>

    {selected ? <div className={styles.readerLayout}>
      <aside className={styles.chapterSidebar} aria-label="Guide outline" data-open={chaptersOpen}>
        <h2 className={styles.chapterListHeading}>Chapters</h2>
        <button
          ref={mobileToggle}
          className={styles.mobileToggle}
          type="button"
          aria-label={`Chapters: ${selected.title}, ${selectedIndex + 1} of ${chapters.length}`}
          aria-expanded={chaptersOpen}
          aria-controls={`${id}-chapters`}
          onClick={() => setChaptersOpen(open => !open)}
          onKeyDown={handleToggleKeyDown}
        >
          <span className={styles.mobileSelection}><span className={styles.chapterNumber} aria-hidden="true">{String(selectedIndex + 1).padStart(2, "0")}</span><span className={styles.chapterTitle}>{selected.title}</span></span>
          <CaretDownIcon className={styles.toggleChevron} size={21} aria-hidden="true"/>
        </button>
        <div id={`${id}-chapters`} ref={chapterTabs} className={styles.chapterTabs} role="tablist" aria-label="Pilot guide chapters" aria-orientation="vertical">
          {chapters.map((chapter, index) => <button
            key={chapter.id}
            ref={element => {tabs.current[index] = element;}}
            id={`${id}-tab-${chapter.id}`}
            type="button"
            role="tab"
            aria-selected={index === selectedIndex}
            aria-controls={`${id}-panel-${chapter.id}`}
            tabIndex={index === selectedIndex ? 0 : -1}
            className={styles.chapterTab}
            onClick={() => navigateToChapter(chapter.id)}
            onKeyDown={event => handleTabKeyDown(event, index)}
          ><span className={styles.chapterNumber} aria-hidden="true">{String(index + 1).padStart(2, "0")}</span><span className={styles.chapterTitle}>{chapter.title}</span></button>)}
        </div>
        <div className={styles.chapterPosition}>
          <span>Chapter {selectedIndex + 1} of {chapters.length}</span>
          <div className={styles.progressTrack} role="progressbar" aria-label="Chapter position" aria-valuemin={1} aria-valuemax={chapters.length} aria-valuenow={selectedIndex + 1} aria-valuetext={`Chapter ${selectedIndex + 1} of ${chapters.length}: ${selected.title}`}><span style={{width: `${(selectedIndex + 1) / chapters.length * 100}%`}}/></div>
        </div>
      </aside>

      <div className={styles.readingCanvas}>
        <div className={styles.chapterContext}>
          <span aria-live="polite" aria-atomic="true">Chapter {selectedIndex + 1} of {chapters.length}</span>
        </div>

        {chapters.map((chapter, index) => <div
          key={chapter.id}
          ref={element => {panels.current[index] = element;}}
          id={`${id}-panel-${chapter.id}`}
          role="tabpanel"
          aria-labelledby={`${id}-tab-${chapter.id}`}
          tabIndex={0}
          hidden={index !== selectedIndex}
          className={styles.chapterPanel}
        >
          {index === selectedIndex ? <article className={styles.article} aria-labelledby={`${id}-heading-${chapter.id}`}>
            <h2 id={`${id}-heading-${chapter.id}`}>{chapter.title}</h2>
            <div className={`${contentStyles.content} ${styles.articleContent}`} dangerouslySetInnerHTML={{__html: selectedHtml}}/>
          </article> : null}
        </div>)}
        {previous || next ? <nav className={styles.pageNavigation} aria-label="Chapter navigation">
          {previous ? <button className={styles.previousButton} type="button" aria-label={`Previous chapter: ${previous.title}`} onClick={() => navigateToChapter(previous.id)}><ArrowLeftIcon size={19} aria-hidden="true"/><span><span className={styles.navigationLabel}>Previous chapter</span><span className={styles.navigationTitle}>{previous.title}</span></span></button> : null}
          {next ? <button className={styles.nextButton} type="button" aria-label={`Next chapter: ${next.title}`} onClick={() => navigateToChapter(next.id)}><span><span className={styles.navigationLabel}>Continue to</span><span className={styles.navigationTitle}>{next.title}</span></span><ArrowRightIcon size={19} aria-hidden="true"/></button> : null}
        </nav> : null}
      </div>
    </div> : <p className={styles.emptyState}>The pilot guide is not available right now.</p>}
  </main>;
}
