import Link from "next/link";
import {discordUrl} from "./SiteHeader";

export default function SiteFooter() {
  return <footer className="site-footer">
    <div className="footer-top">
      <Link className="footer-brand" href="/"><img src="/assets/logo-Czz1Kl8u.png" alt="ATCMH Logo"/><span><strong>ATC Mentorship Hub</strong><small>Your Gateway to IFATC</small></span></Link>
      <nav aria-label="Footer navigation"><Link href="/#about">About</Link><Link href="/#services">Services</Link><Link href="/#eligibility">Eligibility</Link><Link href="/leaderboard">Leaderboard</Link><Link href="/exams">Exam Center</Link><Link href="/terms">Terms of Service</Link><Link href="/policy">Privacy Policy</Link><a href={discordUrl} target="_blank" rel="noopener noreferrer">Discord</a></nav>
    </div>
    <div className="footer-divider"/>
    <div className="footer-bottom"><p>© {new Date().getFullYear()} ATC Mentorship Hub. All rights reserved.</p><p>Not directly affiliated with the IFATC Recruitment Process.</p></div>
  </footer>;
}
