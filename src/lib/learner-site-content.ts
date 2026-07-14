export const siteNavigation = [
  { href: "/", label: "Home" },
  { href: "/exams/quizzes", label: "Quizzes" },
] as const;

export const quizCatalogueTitle = "Quizzes";

export const learnerAuthLabel = (discordId: string | undefined) => discordId ? "Logged in" : "Login";

export const homeStats = [
  { label: "Published Quizzes", value: "24" },
  { label: "Learning Pages", value: "0" },
  { label: "Current Notices", value: "1" },
] as const;

export const mentorshipSteps = [
  { title: "Apply to IFATC", description: "Apply to IFATC via the official website." },
  { title: "Mentorship", description: "Request mentorship in ATCMH and receive mentorship." },
  { title: "Exams", description: "Take the written and practical exam." },
  { title: "IFATC!", description: "You will be part of IFATC when you pass!" },
] as const;
