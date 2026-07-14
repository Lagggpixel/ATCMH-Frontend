import { discordUrl, SiteHeader } from './SiteHeader'
import SiteFooter from './SiteFooter'
import HomeLoginModal from '@/src/platform/auth/HomeLoginModal'
import Eligibility from '@/src/marketing/Eligibility'
import { Suspense } from 'react'

type Service = {
	title: string
	description: string
	tag: string
	num: string
	icon: string
}

type Stat = {
	value: string
	label: string
}

const stats: Stat[] = [
	{ value: '700+', label: 'Members' },
	{ value: '200+', label: 'Graduates' },
	{ value: 'FREE', label: 'Services' },
]

const aboutStats = [
	{ value: '200+', label: 'Graduates', icon: '✦' },
	{ value: 'IFVARB', label: 'Approved', icon: '✓' },
	{ value: '24/7', label: 'Global Coverage', icon: '⌁' },
	{ value: '3', label: 'Mentorship Options', icon: '◆' },
]

const services: Service[] = [
	{
		title: 'Full Mentorship',
		description:
			'A structured program that combines theoretical knowledge with the practical controlling skills needed to successfully complete the written and practical exams. This pathway is designed to develop highly capable, quality controllers.',
		tag: 'Most Popular',
		num: '01',
		icon: '✈',
	},
	{
		title: 'Written Exam Prep',
		description:
			'Struggling with understanding questions on the written exam? A Mentor will guide you through them while giving you clear explanations to ensure full understanding.',
		tag: 'Knowledge',
		num: '02',
		icon: '□',
	},
	{
		title: 'Mock Practical',
		description:
			'A simulated practical examination conducted to evaluate performance, identify improvement areas, and prepare candidates for the IFATC practical. This is only recommended for returning members.',
		tag: 'Final Prep',
		num: '03',
		icon: '◉',
	},
]

function Hero() {
	return (
		<section className="hero">
			<img className="hero-bg" src="/assets/hero-bg-e1SohDT3.jpg" alt="" aria-hidden="true" />
			<div className="hero-overlay" />
			<div className="hero-content">
				<h1>
					Control the <span>Expert Server</span> Skies
				</h1>
				<p>Professional mentorship for aspiring Infinite Flight Air Traffic Controllers.</p>
				<div className="hero-actions">
					<a className="primary-button" href={discordUrl} target="_blank" rel="noopener noreferrer">
						Get Started →
					</a>
				</div>
				<div className="hero-stats" aria-label="ATCMH statistics">
					{stats.map((stat) => (
						<div key={stat.label}>
							<strong>{stat.value}</strong>
							<span>{stat.label}</span>
						</div>
					))}
				</div>
			</div>
			<a className="scroll-cue" href="#about" aria-label="Scroll to About">
				↓
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
						{aboutStats.map((stat) => (
							<div key={stat.label} className="mini-card">
								<span aria-hidden="true">{stat.icon}</span>
								<strong>{stat.value}</strong>
								<small>{stat.label}</small>
							</div>
						))}
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
				<a className="primary-button" href={discordUrl} target="_blank" rel="noopener noreferrer">
					Join Discord to Get Started ↗
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
						Join our Discord community and take the first step towards controlling the Expert
						Server skies.
					</p>
					<a href={discordUrl} target="_blank" rel="noopener noreferrer">
						Join Our Discord →
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
				<Hero />
				<About />
				<Services />
				<Eligibility />
				<Cta />
			</main>
			<SiteFooter />
		</div>
	)
}
