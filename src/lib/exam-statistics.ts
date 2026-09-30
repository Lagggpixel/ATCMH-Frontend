import type {RowDataPacket} from "mysql2";
import {queryReadOnly} from "./db";
import type {ExamStatisticsPeriod, ExamStatisticsReport, ExamStatisticsRow, StatisticsWindow} from "../dashboard/types/ProgrammeStatistics";

type Aggregate = RowDataPacket & {quiz_id: string | null; title: string | null; attempts: number; identified: number; unidentified: number; timed_out: number};
type ScoreBucket = RowDataPacket & {quiz_id: string; percentage: number; amount: number};

export function histogramMedian(buckets: Array<{percentage: number; amount: number}>): number | null {
    const ordered = buckets.filter(bucket => Number.isFinite(bucket.percentage) && bucket.amount > 0).sort((a, b) => a.percentage - b.percentage);
    const size = ordered.reduce((sum, bucket) => sum + bucket.amount, 0);
    if (!size) return null;
    const lower = Math.floor((size - 1) / 2), upper = Math.floor(size / 2);
    let count = 0, a: number | null = null;
    for (const bucket of ordered) {
        const next = count + bucket.amount;
        if (a === null && lower < next) a = bucket.percentage;
        if (upper < next) return (a! + bucket.percentage) / 2;
        count = next;
    }
    return null;
}

// Match the canonical mention-first identity rule in parseAttemptStudentDiscordId.
const identity = `CASE
    WHEN student_name REGEXP '^<@!?[0-9]{15,20}>$' THEN REPLACE(REPLACE(REPLACE(student_name, '<@!', ''), '<@', ''), '>', '')
    WHEN student_discord_id REGEXP '^[0-9]{15,20}$' THEN student_discord_id ELSE NULL END`;
const sqlDate = (value: string) => new Date(value).toISOString().replace("T", " ").replace("Z", "");

async function period(from: string | null, to: string): Promise<{summary: ExamStatisticsPeriod; quizzes: ExamStatisticsRow[]}> {
    const values = from === null ? [sqlDate(to)] : [sqlDate(from), sqlDate(to)];
    const source = `SELECT attempts.quiz_id, quizzes.title, attempts.percentage, ${identity} AS learner_id,
        CASE WHEN submission_reason = 'timeout' OR timed_out = 1 THEN 1 ELSE 0 END AS timeout
        FROM attempts JOIN quizzes ON quizzes.id = attempts.quiz_id
        WHERE ${from === null ? "" : "submitted_at >= ? AND "}submitted_at < ?`;
    const [aggregates, scores] = await Promise.all([
        queryReadOnly<Aggregate[]>(`SELECT quiz_id, MAX(title) AS title, COUNT(*) AS attempts,
            COUNT(DISTINCT learner_id) AS identified, SUM(learner_id IS NULL) AS unidentified, SUM(timeout) AS timed_out
            FROM (${source}) reporting GROUP BY quiz_id WITH ROLLUP`, values),
        queryReadOnly<ScoreBucket[]>(`SELECT quiz_id, percentage, COUNT(*) AS amount FROM (${source}) reporting
            GROUP BY quiz_id, percentage`, values),
    ]);
    const buckets = new Map<string, ScoreBucket[]>();
    for (const row of scores) {
        row.percentage = Number(row.percentage); row.amount = Number(row.amount);
        const group = buckets.get(row.quiz_id) ?? []; group.push(row); buckets.set(row.quiz_id, group);
    }
    const metrics = (row?: Aggregate): ExamStatisticsPeriod => {
        const attempts = Number(row?.attempts ?? 0), timedOutAttempts = Number(row?.timed_out ?? 0);
        return {attempts, identifiedLearners: Number(row?.identified ?? 0), unidentifiedAttempts: Number(row?.unidentified ?? 0),
            timedOutAttempts, timeoutRate: attempts ? timedOutAttempts * 100 / attempts : null,
            medianScore: histogramMedian(row?.quiz_id ? buckets.get(row.quiz_id) ?? [] : scores)};
    };
    return {summary: metrics(aggregates.find(row => row.quiz_id === null)),
        quizzes: aggregates.filter(row => row.quiz_id !== null).map(row => ({quizId: row.quiz_id!, title: row.title ?? "Unknown quiz", ...metrics(row)}))
            .sort((a, b) => b.attempts - a.attempts || a.title.localeCompare(b.title))};
}

export async function getExamStatistics(window: StatisticsWindow): Promise<ExamStatisticsReport> {
    const [current, previous, undated] = await Promise.all([
        period(window.from, window.to),
        window.from === null ? Promise.resolve(null) : period(window.previousFrom, window.from),
        queryReadOnly<Array<RowDataPacket & {amount: number}>>("SELECT COUNT(*) AS amount FROM attempts JOIN quizzes ON quizzes.id = attempts.quiz_id WHERE submitted_at IS NULL"),
    ]);
    return {window, current: current.summary, previous: previous?.summary ?? null, quizzes: current.quizzes, undatedAttempts: Number(undated[0]?.amount ?? 0)};
}
