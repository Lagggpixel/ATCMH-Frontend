"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import type { QuizSummary } from "@/src/lib/exams-repository";
import { filterQuizSummaries, quizCategoryOptions } from "@/src/lib/quiz-catalogue";

interface QuizCatalogueProps {
  quizzes: QuizSummary[];
  showVisibility: boolean;
  unavailable: boolean;
}

const timeLimitLabel = (seconds: number) => seconds > 0 ? `${Math.ceil(seconds / 60)} min` : "Untimed";

export default function QuizCatalogue({ quizzes, showVisibility, unavailable }: QuizCatalogueProps) {
  const [query, setQuery] = useState("");
  const [category, setCategory] = useState("all");
  const categories = useMemo(() => quizCategoryOptions(quizzes), [quizzes]);
  const filteredQuizzes = useMemo(
    () => filterQuizSummaries(quizzes, { query, category }),
    [category, query, quizzes],
  );

  return (
    <section className="exam-catalogue" aria-labelledby="catalogue-title">
      <div className="exam-catalogue__toolbar">
        <div>
          <p className="exam-catalogue__eyebrow">Quiz catalogue</p>
          <h2 id="catalogue-title">Available quizzes</h2>
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
                <option value="all">All categories</option>
                {categories.map((option) => <option key={option.id} value={option.id}>{option.label}</option>)}
              </select>
            </label>
          </div>
        ) : null}
      </div>

      {unavailable ? <p className="exam-catalogue__state" role="alert">Quizzes are temporarily unavailable. Please try again later.</p> : null}
      {!unavailable && quizzes.length === 0 ? <p className="exam-catalogue__state">No quizzes are available right now.</p> : null}
      {!unavailable && quizzes.length > 0 && filteredQuizzes.length === 0 ? <p className="exam-catalogue__state">No quizzes match those filters.</p> : null}

      {filteredQuizzes.length > 0 ? (
        <ul className="exam-quiz-list" aria-live="polite">
          {filteredQuizzes.map((quiz) => (
            <li className="exam-quiz-row" key={quiz.id}>
              <div className="exam-quiz-row__content">
                <div className="exam-quiz-row__meta">
                  <span className="exam-quiz-row__category">{quiz.category}</span>
                  {showVisibility ? <span>{quiz.isPrivate ? "Private" : "Public"}</span> : null}
                </div>
                <h3>{quiz.title}</h3>
                <p>{quiz.description}</p>
              </div>
              <p className="exam-quiz-row__time">{timeLimitLabel(quiz.timeLimitSeconds)}</p>
              <Link className="exam-quiz-row__action" href={`/exams/quizzes/${quiz.id}`}>View quiz</Link>
            </li>
          ))}
        </ul>
      ) : null}
    </section>
  );
}
