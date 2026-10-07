import { SiteHeader } from './SiteHeader'
import SiteFooter from './SiteFooter'
import HomeLoginModal from '@/src/platform/auth/HomeLoginModal'
import Eligibility from '@/src/marketing/Eligibility'
import { Suspense, type ReactNode } from 'react'
import { AirplaneTiltIcon } from '@phosphor-icons/react/dist/ssr/AirplaneTilt'
import { BookOpenIcon } from '@phosphor-icons/react/dist/ssr/BookOpen'
import { BroadcastIcon } from '@phosphor-icons/react/dist/ssr/Broadcast'
import { GraduationCapIcon } from '@phosphor-icons/react/dist/ssr/GraduationCap'
import { GlobeHemisphereWestIcon } from '@phosphor-icons/react/dist/ssr/GlobeHemisphereWest'
import { ArrowDownIcon } from '@phosphor-icons/react/dist/ssr/ArrowDown'
import { CommunityCount, CommunityStatsProvider } from './CommunityStats'

type Service = {
	title: string
	description: string
	tag: string
	num: string
	icon: ReactNode
}

const services: Service[] = [
	{
		title: 'Full Mentorship',
		description:
			'A structured program that combines theoretical knowledge with the practical controlling skills needed to successfully complete the written and practical exams. This pathway is designed to develop highly capable, quality controllers.',
		tag: 'Most Popular',
		num: '01',
		icon: <AirplaneTiltIcon size={28} weight="duotone" />,
	},
	{
		title: 'Written Exam Prep',
		description:
			'Struggling with understanding questions on the written exam? A Mentor will guide you through them while giving you clear explanations to ensure full understanding.',
		tag: 'Knowledge',
		num: '02',
		icon: <BookOpenIcon size={28} weight="duotone" />,
	},
	{
		title: 'Mock Practical',
		description:
			'A simulated practical examination conducted to evaluate performance, identify improvement areas, and prepare candidates for the IFATC practical. This is only recommended for returning members.',
		tag: 'Final Prep',
		num: '03',
		icon: <BroadcastIcon size={28} weight="duotone" />,
	},
]

function Hero() {
	return (
		<section className="hero">
			<img className="hero-bg" src="/assets/home-airport-hero.webp" alt="" aria-hidden="true" fetchPriority="high" />
			<div className="hero-overlay" />
			<div className="hero-content">
				<h1>
					Learn. <span>Practice.</span> Control.
				</h1>
				<p><em>Preparing the next generation of Infinite Flight controllers.</em></p>
				<div className="hero-actions">
					<a className="primary-button" href="/apply">
						Apply
					</a>
				</div>
				<div className="hero-stats" aria-label="ATCMH statistics">
					<div><CommunityCount kind="members" /><span>Members</span></div>
					<div><CommunityCount kind="graduates" /><span>Graduates</span></div>
					<div><strong>FREE</strong><span>Services</span></div>
				</div>
			</div>
			<a className="scroll-cue" href="#about" aria-label="Scroll to About">
				<ArrowDownIcon size={28} aria-hidden="true" />
			</a>
		</section>
	)
}

function About() {
	return (
		<section id="about" className="section about-section">
			<div className="section-heading">
				<span>About ATCMH</span>
				<h2>
					Your Gateway to <em>Expert Server ATC</em>
				</h2>
			</div>
			<div className="about-grid">
				<div className="image-card">
					<img src="/assets/about-bg-Bep2E5iO.jpg" alt="ATC radar control room" />
				</div>
				<div className="about-copy">
					<p>
						ATC Mentorship Hub is dedicated to helping aspiring IFATC obtain the necessary
						skills and knowledge to control the Expert Server skies in Infinite Flight.
					</p>
					<p>
						We provide Written Exam Help, Mentor Sessions, and Mock Practical exams to prepare
						individuals for the IFATC local written and practical exams. Our team is committed
						to guiding and supporting individuals in their journey towards becoming a successful
						IFATC controller.
					</p>
					<div className="about-stats">
						<div className="mini-card">
							<span aria-hidden="true"><GraduationCapIcon size={28} weight="duotone" /></span>
							<CommunityCount kind="graduates" />
							<small>Graduates</small>
						</div>
						<div className="mini-card">
							<span aria-hidden="true"><GlobeHemisphereWestIcon size={28} weight="duotone" /></span>
							<strong>24/7</strong>
							<small>Global Coverage</small>
						</div>
					</div>
				</div>
			</div>
		</section>
	)
}

function Services() {
	return (
		<section id="services" className="section services-section">
			<div className="section-heading">
				<span>Our Services</span>
				<h2>Explore What We Offer</h2>
				<p>Three tailored programs to get you from aspiring controller to IFATC ready.</p>
			</div>
			<div className="service-grid">
				{services.map((service) => (
					<article key={service.title} className="service-card">
						<div className="service-topline">
							<div className="service-icon" aria-hidden="true">
								{service.icon}
							</div>
							<span>{service.tag}</span>
						</div>
						<strong className="service-num">{service.num}</strong>
						<h3>{service.title}</h3>
						<p>{service.description}</p>
						<div className="service-rule" />
					</article>
				))}
			</div>
			<div className="centered-action">
				<a className="primary-button" href="/apply">
					Start an application →
				</a>
			</div>
		</section>
	)
}

function Cta() {
	return (
		<section className="cta-section">
			<div className="cta-card">
				<img src="/assets/cta-bg-CaxtVWzJ.jpg" alt="" aria-hidden="true" />
				<div className="cta-overlay" />
				<div className="cta-content">
					<span>Start your journey today</span>
					<h2>
						Ready to Start Your
						<br />
						IFATC Journey?
					</h2>
					<p>
						Apply online for mentorship, written exam help, or a mock practical. Discord remains
						available for community support and the legacy application path.
					</p>
					<a href="/apply">
						Apply
					</a>
				</div>
			</div>
		</section>
	)
}

export default function Home() {
	return (
		<div className="marketing-product">
			<SiteHeader showLogin />
			<Suspense fallback={null}><HomeLoginModal /></Suspense>
			<main>
				<CommunityStatsProvider>
					<Hero />
					<About />
					<Services />
					<Eligibility />
					<Cta />
				</CommunityStatsProvider>
			</main>
			<SiteFooter />
		</div>
	)
}
