"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import {ArrowRight} from "@phosphor-icons/react";
import type { QuizSummary } from "@/src/lib/exams-repository";
import { filterQuizSummaries, quizCategoryOptions } from "@/src/lib/quiz-catalogue";

interface QuizCatalogueProps {
  quizzes: QuizSummary[];
  showVisibility: boolean;
  unavailable: boolean;
}

export default function QuizCatalogue({ quizzes, showVisibility, unavailable }: QuizCatalogueProps) {
  const [query, setQuery] = useState("");
  const [category, setCategory] = useState("all");
  const [openFolders, setOpenFolders] = useState<Record<string, boolean>>({});
  const categories = useMemo(() => quizCategoryOptions(quizzes), [quizzes]);
  const filteredQuizzes = useMemo(
    () => filterQuizSummaries(quizzes, { query, category }),
    [category, query, quizzes],
  );
  const folders = useMemo(() => categories.map(option => ({
    ...option,
    quizzes: filteredQuizzes.filter(quiz => quiz.categoryId === option.id),
  })).filter(folder => folder.quizzes.length > 0), [categories, filteredQuizzes]);

  return (
    <section className="exam-catalogue" aria-labelledby="catalogue-title">
      <div className="exam-catalogue__toolbar">
        <div>
          <h2 id="catalogue-title" className="sr-only">Available quizzes</h2>
        </div>
        {!unavailable && quizzes.length > 0 ? (
          <div className="exam-catalogue__filters" role="search" aria-label="Filter quizzes">
            <label>
              <span className="sr-only">Search quizzes</span>
              <input type="search" value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search quizzes" />
            </label>
            <label>
              <span className="sr-only">Quiz category</span>
              <select value={category} onChange={(event) => setCategory(event.target.value)}>
                <option value="all">All folders</option>
                {categories.map((option) => <option key={option.id} value={option.id}>{option.label}</option>)}
              </select>
            </label>
          </div>
        ) : null}
      </div>

      {unavailable ? <p className="exam-catalogue__state" role="alert">Quizzes are temporarily unavailable. Please try again later.</p> : null}
      {!unavailable && quizzes.length === 0 ? <p className="exam-catalogue__state">No quizzes are available right now.</p> : null}
      {!unavailable && quizzes.length > 0 && filteredQuizzes.length === 0 ? <p className="exam-catalogue__state">No quizzes match those filters.</p> : null}

      {folders.length > 0 ? <div className="exam-folder-list" aria-live="polite">{folders.map((folder, index) => <details className="exam-folder" key={folder.id} open={Boolean(query.trim()) || category !== "all" || (openFolders[folder.id] ?? index === 0)}>
        <summary onClick={event => { event.preventDefault(); setOpenFolders(current => ({...current, [folder.id]: !(current[folder.id] ?? index === 0)})); }}><span>{folder.label}</span><span className="exam-folder__count">{folder.quizzes.length} {folder.quizzes.length === 1 ? "quiz" : "quizzes"}</span></summary>
        <ul className="exam-quiz-list">{folder.quizzes.map(quiz => <li className="exam-quiz-row" key={quiz.id}>
          <div className="exam-quiz-row__content"><h3>{quiz.title}</h3>{quiz.description ? <p>{quiz.description}</p> : null}{showVisibility ? <small>{quiz.isPrivate ? "Private" : "Public"}</small> : null}</div>
          <Link className="exam-quiz-row__action" href={`/exams/quizzes/${quiz.id}`}>View quiz <ArrowRight size={17} aria-hidden="true"/></Link>
        </li>)}</ul>
      </details>)}</div> : null}
    </section>
  );
}
