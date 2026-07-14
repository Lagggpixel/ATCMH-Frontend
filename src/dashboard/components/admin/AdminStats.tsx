import {
    Bar,
    BarChart,
    CartesianGrid,
    Cell,
    Legend,
    Line,
    LineChart,
    Pie,
    PieChart,
    ResponsiveContainer,
    Tooltip,
    XAxis,
    YAxis
} from "recharts";
import type {Session} from "../../types/Session.ts";
import type {AtcmhUser} from "../../types/AtcmhUser.ts";
import AdminErrorScreen from "./AdminErrorScreen.tsx";
import AdminLoadingScreen from "./AdminLoadingScreen.tsx";
import AdminLoginScreen from "./AdminLoginScreen.tsx";
import AdminUnauthorizedScreen from "./AdminUnauthorizedScreen.tsx";
import {useMemo} from "react";
import styles from "./AdminStats.module.css"

interface AdminStatsProps {
    loaded: boolean;
    loggedIn: boolean;
    error: string | undefined;
    sessions: Session[] | undefined;
    users: AtcmhUser[] | undefined;
}

const AdminStats = ({
                        loaded,
                        loggedIn,
                        error,
                        sessions,
                        users
                    } : AdminStatsProps) => {
    const tooltipStyle = {
        backgroundColor: "var(--row-bg)",
        borderColor: "var(--accent-color)",
        color: "var(--text-color)"
    };

    const stats = useMemo(() => {
        if (!sessions || !users) return null;

        const totalSessions = sessions.length;
        const cancelledSessions = sessions.filter(s => s.cancelled).length;
        const cancelledHasAttendeeSessions = sessions.filter(s => s.cancelled && s.attendees.length > 0).length;
        const cancelledNoAttendeeSessions = sessions.filter(s => s.cancelled && s.attendees.length === 0).length;
        const activeSessions = totalSessions - cancelledSessions;

        const overallStats = [
            {name: "Running", fill: "#2ecc71" ,value: activeSessions},
            {name: "Insufficient attendance", fill: "#e74c3c" ,value: cancelledHasAttendeeSessions},
            {name: "Cancelled", fill: "#FFA500" ,value: cancelledNoAttendeeSessions}
        ];

        const sessionsByMentor = new Map<string, Session[]>();
        const sessionsByMentee = new Map<string, Session[]>();
        const usersById = new Map(users.map(user => [user.id, user]));

        sessions.forEach(session => {
            const mentorSessions = sessionsByMentor.get(session.mentor) ?? [];
            mentorSessions.push(session);
            sessionsByMentor.set(session.mentor, mentorSessions);

            const menteeSessions = sessionsByMentee.get(session.mentee) ?? [];
            menteeSessions.push(session);
            sessionsByMentee.set(session.mentee, menteeSessions);
        });

        const mentorStats = Array.from(sessionsByMentor.entries())
            .map(([mentorId, mentorSessions]) => {
                const mentor = usersById.get(mentorId);

                return {
                    mentorId,
                    mentorName: mentor ? mentor.username : `User (${mentorId})`,
                    total: mentorSessions.length,
                    cancelled: mentorSessions.filter(s => s.cancelled).length,
                    active: mentorSessions.filter(s => !s.cancelled).length
                };
            })
            .sort((a, b) => b.total - a.total);

        const menteeStats = Array.from(sessionsByMentee.entries())
            .map(([menteeId, menteeSessions]) => {
                const mentee = usersById.get(menteeId);

                return {
                    menteeId,
                    menteeName: mentee ? mentee.username : `User (${menteeId})`,
                    total: menteeSessions.length,
                    cancelled: menteeSessions.filter(s => s.cancelled).length,
                    active: menteeSessions.filter(s => !s.cancelled).length
                };
            })
            .sort((a, b) => b.total - a.total);

        const hourCounts = Array(24).fill(0).map((_, hour) => {
            const sessionsInHourWithMessageId = sessions.filter(
                s => new Date(s.time).getHours() === hour && s.messageId !== undefined && s.messageId !== "0"
            );
            const cancelledInHourDueToLowAttendance = sessionsInHourWithMessageId.filter(s => s.cancelled).length;
            const lowAttendanceCancellationRate = sessionsInHourWithMessageId.length > 0
                ? Number(((cancelledInHourDueToLowAttendance / sessionsInHourWithMessageId.length) * 100).toFixed(2))
                : 0;

            return {
                hour,
                running: sessions.filter(s => new Date(s.time).getHours() === hour && !s.cancelled).length,
                cancelledHasAttendeeSessions: sessions.filter(s => new Date(s.time).getHours() === hour && s.cancelled && s.attendees.length > 0).length,
                cancelledNoAttendeeSessions: sessions.filter(s => new Date(s.time).getHours() === hour && s.cancelled && s.attendees.length === 0).length,
                lowAttendanceCancellationRate
            };
        });

        const sessionsWithMessageId = sessions.filter(session => session.messageId !== undefined && session.messageId !== "0").length;
        const cancelledDueToLowAttendance = sessions.filter(session => session.cancelled && session.messageId !== undefined && session.messageId !== "0").length;
        const lowAttendanceCancellationRate = sessionsWithMessageId > 0
            ? Number(((cancelledDueToLowAttendance / sessionsWithMessageId) * 100).toFixed(2))
            : 0;

        const attendanceByDate = sessions
            .filter(session => session.messageId !== "0")
            .reduce((acc: Record<string, { attending: number; requested: number }>, session) => {
                const date = new Date(session.time).toISOString().split("T")[0];
                const dayCounts = acc[date] || { attending: 0, requested: 0 };

                dayCounts.attending += session.attendees.length;
                dayCounts.requested += session.pilots;

                acc[date] = dayCounts;
                return acc;
            }, {});

        const attendanceDates = Object.keys(attendanceByDate).sort();

        const attendanceMovingAverage = attendanceDates.map((date, index) => {
            const windowStart = Math.max(0, index - 6);
            const windowDates = attendanceDates.slice(windowStart, index + 1);

            const attendance = attendanceByDate[date];
            const windowTotals = windowDates.reduce(
                (totals, windowDate) => {
                    const day = attendanceByDate[windowDate];
                    return {
                        attending: totals.attending + day.attending,
                        requested: totals.requested + day.requested
                    };
                },
                { attending: 0, requested: 0 }
            );

            const dailyPercentage = attendance.requested > 0
                ? (attendance.attending / attendance.requested) * 100
                : 0;
            const movingWindowPercentage = windowTotals.requested > 0
                ? (windowTotals.attending / windowTotals.requested) * 100
                : 0;

            return {
                date,
                attendancePercentage: Number(dailyPercentage.toFixed(2)),
                movingAveragePercentage: Number(movingWindowPercentage.toFixed(2))
            };
        });

        return {
            overallStats,
            mentorStats,
            menteeStats,
            hourCounts,
            attendanceMovingAverage,
            sessionsWithMessageId,
            cancelledDueToLowAttendance,
            lowAttendanceCancellationRate,
            totalSessions,
            cancelledSessions,
            cancelledHasAttendeeSessions,
            cancelledNoAttendeeSessions,
            activeSessions
        };
    }, [sessions, users]);

    if (!loggedIn) {
        return <AdminLoginScreen/>
    }

    if (!loaded) {
        return <AdminLoadingScreen/>;
    }

    if (error) {
        return <AdminErrorScreen content={error}></AdminErrorScreen>;
    }

    if (!sessions || !users) {
        return <AdminUnauthorizedScreen />;
    }

    return (
        <div className={styles.adminStatsContainer}>
            <div className={styles.adminStatsSubContainer}>
                <h2>Session Statistics</h2>
                {stats?.totalSessions === 0 ? (
                    <p className={styles.adminStatsEmptyState}>
                        No session data is available yet.
                    </p>
                ) : null}
                <p>Total Sessions: {stats?.totalSessions} (Active: {stats?.activeSessions},
                    Cancelled: {stats?.cancelledSessions})</p>

                <div className={styles.adminStatsGrid}>
                    <div className={styles.adminStatCard}>
                        <h3>Session Status Distribution</h3>
                        <div className={styles.adminStatsChartContainer}>
                            <ResponsiveContainer width="100%" height={300}>
                                <PieChart>
                                    <Pie
                                        data={stats?.overallStats}
                                        cx="50%"
                                        cy="50%"
                                        labelLine={false}
                                        outerRadius={80}
                                        fill="#8884d8"
                                        dataKey="value"
                                        label={({
                                                    name,
                                                    percent
                                                }) => `${name}: ${((percent || 0) * 100).toFixed(0)}%`}
                                    >
                                        {stats?.overallStats.map((entry, index) => <Cell
                                            key={`cell-${index}`}
                                            fill={entry.fill}
                                        />)}
                                    </Pie>
                                    <Tooltip
                                        contentStyle={tooltipStyle}
                                        itemStyle={{ color: "var(--text-color)" }}
                                        labelStyle={{ color: "var(--text-color)" }}
                                    />
                                </PieChart>
                            </ResponsiveContainer>
                        </div>
                    </div>

                    <div className={styles.adminStatCard}>
                        <h3>Session Time Distribution</h3>
                        <div className={styles.adminStatsChartContainer}>
                            <ResponsiveContainer width="100%" height={300}>
                                <BarChart data={stats?.hourCounts}>
                                    <XAxis dataKey="hour"/>
                                    <YAxis/>
                                    <YAxis yAxisId="right" orientation="right" tickFormatter={(value) => `${value}%`}/>
                                    <Tooltip
                                        contentStyle={tooltipStyle}
                                        itemStyle={{ color: "var(--text-color)" }}
                                        labelStyle={{ color: "var(--text-color)" }}
                                    />
                                    <Legend/>
                                    <Bar dataKey="running" name="Running sessions" fill="#2ecc71"/>
                                    <Bar dataKey="cancelledHasAttendeeSessions" name="Insufficient attendance" fill="#e74c3c"/>
                                    <Bar dataKey="cancelledNoAttendeeSessions" name="Cancelled" fill="#FFA500"/>
                                    <Bar yAxisId="right" dataKey="lowAttendanceCancellationRate" name="Low-attendance cancellation rate" fill="#3498db"/>
                                </BarChart>
                            </ResponsiveContainer>
                        </div>
                    </div>

                    <div className={styles.adminStatCard}>
                        <h3>Attendance Rate</h3>
                        <div className={styles.adminStatsChartContainer}>
                            <ResponsiveContainer width="100%" height={300}>
                                <LineChart data={stats?.attendanceMovingAverage ?? []}>
                                    <CartesianGrid strokeDasharray="3 3"/>
                                    <XAxis dataKey="date"/>
                                    <YAxis domain={[0, 100]} tickFormatter={(value) => `${value}%`}/>
                                    <Tooltip
                                        formatter={(value) => `${value ?? 0}%`}
                                        contentStyle={tooltipStyle}
                                        itemStyle={{ color: "var(--text-color)" }}
                                        labelStyle={{ color: "var(--text-color)" }}
                                    />
                                    <Legend/>
                                    <Line type="monotone" dataKey="attendancePercentage" name="1d average" stroke="#8884d8" strokeWidth={2}/>
                                    <Line type="monotone" dataKey="movingAveragePercentage" name="7d moving average" stroke="#2ecc71" strokeWidth={3} dot={false}/>
                                </LineChart>
                            </ResponsiveContainer>
                        </div>
                    </div>

                    <div className={styles.adminStatCard}>
                        <h3>Top Mentors by Sessions</h3>
                        <div className={styles.adminStatsTable}>
                            <table className={styles.adminStatsDataTable}>
                                <thead>
                                <tr>
                                    <th scope="col">Mentor</th>
                                    <th scope="col">Total</th>
                                    <th scope="col">Active</th>
                                    <th scope="col">Cancelled</th>
                                </tr>
                                </thead>
                                <tbody>
                                {stats?.mentorStats.slice(0, 5).map(mentor => (
                                    <tr key={mentor.mentorId}>
                                        <td data-label="Mentor">{mentor.mentorName}</td>
                                        <td data-label="Total">{mentor.total}</td>
                                        <td data-label="Active">{mentor.active}</td>
                                        <td data-label="Cancelled">{mentor.cancelled}</td>
                                    </tr>
                                ))}
                                </tbody>
                            </table>
                        </div>
                    </div>
                </div>
            </div>
        </div>
    );
}

export default AdminStats;
