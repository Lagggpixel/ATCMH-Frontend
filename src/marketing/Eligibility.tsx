"use client";

import {useEffect, useState} from "react";
import {ApiUtils, type EligibilityRequirement, type EligibilityResponse} from "@/src/dashboard/utils/ApiUtils";
import {loginPath} from "@/src/dashboard/utils/AuthSessionUtils";
import {usePortalAuth} from "@/src/platform/auth/PortalAuthProvider";
import {homeLoginHref} from "@/src/platform/auth/login-routing";

const requirements = [
    "Trust Level 1 on IFC",
    "At least 14 years of age",
    "Grade 3 with Expert Server access",
    "Minimum of 500 ATC operations",
    "Current IFATC recruit",
    "All-time stats do not exceed 50% Level 1 Violation to landing ratio",
    "At least 60 days since last Level 2 or 3 Violation",
    "Must be able to access Discord",
    "Must have an active IFC account that is in good standing",
    "Must not be listed on the IFVARB Blacklist or Watchlist",
];

const statusLabel = {pass: "Met", fail: "Not met", manual: "Manual verification required"} as const;

function RequirementsList({items}: {items?: EligibilityRequirement[]}) {
    const resultByLabel = new Map(items?.map(item => [item.label, item]) ?? []);
    return <ul className="check-list eligibility-results">{requirements.map(label => {
        const result = resultByLabel.get(label);
        return <li key={label} className={result ? `eligibility-result eligibility-result-${result.status}` : undefined}>
            <span>{label}</span>
            {result ? <small><strong>{statusLabel[result.status]}</strong>{result.detail ? ` — ${result.detail}` : ""}</small> : null}
        </li>;
    })}</ul>;
}

export default function Eligibility() {
    const {session, loading} = usePortalAuth();
    const [result, setResult] = useState<EligibilityResponse>();
    const [error, setError] = useState<string>();
    const hasIfcIdentity = session?.identities.some(identity => identity.provider.toLowerCase() === "ifc") ?? false;

    useEffect(() => {
        if (!session || !hasIfcIdentity) {
            return;
        }
        let current = true;
        void ApiUtils.getEligibility().then(value => {
            if (current) {
                setError(undefined);
                setResult(value);
            }
        }).catch(reason => {
            if (current) setError(reason instanceof Error ? reason.message : "Eligibility information is temporarily unavailable.");
        });
        return () => { current = false; };
    }, [hasIfcIdentity, session]);

    const linkIfcHref = loginPath(ApiUtils.apiOrigin, "ifc", "/");
    return <section id="eligibility" className="section eligibility-section">
        <div className="section-heading">
            <span>Requirements</span>
            <h2>Eligibility</h2>
            <p>Here&apos;s what you need to get started with ATCMH.</p>
        </div>
        <div className="eligibility-grid">
            <div className="info-card">
                <h3>Requirements</h3>
                {loading ? <p className="eligibility-message">Checking your account…</p> : !session ? <div className="eligibility-message"><p>Log in to see your account&apos;s eligibility information.</p><a className="primary-button" href={homeLoginHref("dashboard", "/")}>Log in</a></div> : !hasIfcIdentity ? <div className="eligibility-message"><p>Link your Infinite Flight account to compare it with the requirements.</p><a className="primary-button" href={linkIfcHref}>Link Infinite Flight account</a></div> : error ? <p className="eligibility-message" role="alert">{error}</p> : !result ? <p className="eligibility-message">Checking your Infinite Flight account…</p> : result.status === "not_linked" ? <div className="eligibility-message"><p>Link your Infinite Flight account to compare it with the requirements.</p><a className="primary-button" href={linkIfcHref}>Link Infinite Flight account</a></div> : result.status === "unavailable" ? <p className="eligibility-message" role="alert">Eligibility information is temporarily unavailable. Please try again later.</p> : result.status === "already_ifatc" ? <p className="eligibility-message">You are already an IFATC; the remaining mentorship eligibility requirements do not apply.</p> : <RequirementsList items={result.requirements}/>} 
            </div>
            <div className="info-card gold-card">
                <h3>Important Notes</h3>
                <ul className="dot-list">
                    <li>We are not directly affiliated with the IFATC Recruitment Process</li>
                    <li>Completion of our program does not guarantee IFATC acceptance</li>
                </ul>
                <div className="notice">Some requirements cannot be confirmed through the Infinite Flight profile and need manual verification by the ATCMH team.</div>
            </div>
        </div>
    </section>;
}
