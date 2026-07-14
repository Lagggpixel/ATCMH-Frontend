import type {ReactNode} from "react";
import {SiteHeader} from "@/src/marketing/SiteHeader";
import SiteFooter from "@/src/marketing/SiteFooter";

export default function SiteFrame({children, showLogin = false, footer = true, accountAccessory}: {children: ReactNode; showLogin?: boolean; footer?: boolean; accountAccessory?: ReactNode}) {
  return <div className="marketing-product unified-product"><SiteHeader navigation="application" variant="solid" showLogin={showLogin} accountAccessory={accountAccessory}/><div className="unified-product-content">{children}</div>{footer ? <SiteFooter/> : null}</div>;
}
