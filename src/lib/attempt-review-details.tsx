import type { AttemptReview } from "./attempt-result";

export function AttemptReviewDetails({ review }: { review: AttemptReview }) {
  if (!review.available) {
    return <p className="attempt-review__legacy">Detailed review is unavailable for this attempt.</p>;
  }
  return (
    <ol className="attempt-review__questions">
      {review.questions.map((question, index) => (
        <li className={`attempt-review__question attempt-review__question--${question.state}`} key={`${index}-${question.prompt}`}>
          <h2><span>Question {index + 1}</span>{question.prompt}</h2>
          <p><strong>Your answer:</strong> {question.selectedText ?? "Unanswered"}</p>
          {review.revealCorrectness && question.state !== "correct" ? <p><strong>Correct answer:</strong> {question.correctText ?? "Unavailable"}</p> : null}
          <span className="attempt-review__status">
            {question.state === "correct" ? "Correct" : question.state === "incorrect" ? "Incorrect" : question.state === "unanswered" ? "Unanswered" : "Selected answer"}
          </span>
        </li>
      ))}
    </ol>
  );
}
