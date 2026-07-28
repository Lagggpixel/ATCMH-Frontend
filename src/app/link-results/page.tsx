import type {Metadata} from "next";
import {readApplicationIfcLinkResult} from "@/src/lib/application-ifc-link-result";
import ApplicationIfcLinkResultPage from "@/src/link-results/ApplicationIfcLinkResultPage";
import SiteFrame from "@/src/platform/SiteFrame";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Infinite Flight link result",
  description: "Review the result of linking an Infinite Flight account to ATCMH.",
  robots: {index: false, follow: false, noarchive: true},
};

export default async function LinkResultsPage({searchParams}: {
  searchParams: Promise<{result?: string | string[]}>;
}) {
  const query = await searchParams;
  const token = typeof query.result === "string" ? query.result : undefined;
  const result = readApplicationIfcLinkResult(
    process.env.APPLICATION_IFC_RESULT_SECRET,
    token,
  );
  return <SiteFrame><ApplicationIfcLinkResultPage result={result}/></SiteFrame>;
}
