import type {ReactNode} from "react";
import {SiteHeader} from "@/src/marketing/SiteHeader";
import SiteFooter from "@/src/marketing/SiteFooter";

export default function SiteFrame({children, showLogin = false, footer = true}: {children: ReactNode; showLogin?: boolean; footer?: boolean}) {
  return <div className="marketing-product unified-product"><SiteHeader variant="solid" showLogin={showLogin}/><div className="unified-product-content">{children}</div>{footer ? <SiteFooter/> : null}</div>;
}
