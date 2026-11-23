import {permanentRedirect} from "next/navigation";

export default async function LegacyCourseDetailRedirectPage({
  params,
  searchParams,
}: {
  params: Promise<{courseId: string}>;
  searchParams: Promise<{subsection?: string}>;
}) {
  const {courseId} = await params;
  const {subsection} = await searchParams;
  const query = subsection ? `?subsection=${encodeURIComponent(subsection)}` : "";
  permanentRedirect(`/ground-school/${encodeURIComponent(courseId)}${query}`);
}
