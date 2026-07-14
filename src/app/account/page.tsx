import SiteFrame from "@/src/platform/SiteFrame";
import AccountRoute from "@/src/platform/auth/AccountRoute";

export const dynamic = "force-dynamic";

export default function AccountPage() {
    return <SiteFrame><AccountRoute/></SiteFrame>;
}
