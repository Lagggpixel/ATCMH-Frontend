import ConsentPageContent from "@/src/dashboard/components/consent/ConsentPage";
import SiteFrame from "@/src/platform/SiteFrame";

export const dynamic = "force-dynamic";

export default function ConsentPage() {
    return <SiteFrame><ConsentPageContent/></SiteFrame>;
}
