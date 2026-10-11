import Link from "next/link";
export default function TrainerNotice() {
  return <p style={{fontSize: 13, lineHeight: 1.6, color: "#94a3b8"}}>Independent ATCMH practice for IFATC training. Not affiliated with or endorsed by Infinite Flight. Simulation only; not for real-world navigation. <Link href="/simulator/about">About, data and licences</Link> · <Link href="/policy">Privacy and retention</Link></p>;
}
