import type {ReactNode} from "react";
import {SiteHeader} from "@/src/marketing/SiteHeader";
import SiteFooter from "@/src/marketing/SiteFooter";

interface SiteFrameProps {
  children: ReactNode;
  showLogin?: boolean;
  footer?: boolean;
  header?: ReactNode;
}

export default function SiteFrame({children, showLogin = false, footer = true, header}: SiteFrameProps) {
  return <div className="marketing-product unified-product">{header ?? <SiteHeader variant="solid" showLogin={showLogin}/>}<div className="unified-product-content">{children}</div>{footer ? <SiteFooter/> : null}</div>;
}
