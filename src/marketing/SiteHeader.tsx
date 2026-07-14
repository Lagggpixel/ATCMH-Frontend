'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'

export const discordUrl = 'https://discord.gg/P3kcYbzTBU'

type NavLink = {
	label: string
	href: string
	external?: boolean
}

const navLinks: NavLink[] = [
	{ label: 'About', href: '/#about' },
	{ label: 'Services', href: '/#services' },
	{ label: 'Eligibility', href: '/#eligibility' },
	{ label: 'Leaderboard', href: '/leaderboard' },
	{ label: 'Exam Center', href: '/exams' },
	{ label: 'Dashboard', href: '/auth?returnTo=/dashboard' },
	{ label: 'Contact', href: discordUrl, external: true },
]

export function SiteHeader() {
	const [hasScrolled, setHasScrolled] = useState(false)

	useEffect(() => {
		const updateHeaderFill = () => {
			setHasScrolled(window.scrollY > 24)
		}

		updateHeaderFill()
		window.addEventListener('scroll', updateHeaderFill, { passive: true })

		return () => {
			window.removeEventListener('scroll', updateHeaderFill)
		}
	}, [])

	return (
		<header className={`site-header${hasScrolled ? ' is-scrolled' : ''}`}>
			<Link className="brand" href="/" aria-label="ATC Mentorship Hub home">
				<img src="/assets/logoLight-DWbJHT7m.png" alt="ATCMH" />
			</Link>
			<nav className="nav-links" aria-label="Primary navigation">
				{navLinks.map((link) => (
					<a
						key={link.label}
						href={link.href}
						target={link.external ? '_blank' : undefined}
						rel={link.external ? 'noopener noreferrer' : undefined}
					>
						{link.label}
					</a>
				))}
				<details className="nav-dropdown">
					<summary>Legal</summary>
					<div className="nav-dropdown-menu">
						<a href="/policy">Privacy Policy</a>
						<a href="/terms">Terms of Service</a>
					</div>
				</details>
			</nav>
			<a className="nav-cta" href={discordUrl} target="_blank" rel="noopener noreferrer">
				Enroll Now
			</a>
		</header>
	)
}
