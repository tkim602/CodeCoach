import { useState } from "react";
import { content, externalLinks, type Locale } from "./content";
import {
  ArrowRightIcon,
  ArrowUpRightIcon,
  CheckIcon,
  ChevronDownIcon,
  ChromeIcon,
  GitHubIcon,
  LanguageIcon,
} from "./components/Icons";
import { ProductDemo } from "./components/ProductDemo";

interface AppProps {
  locale: Locale;
}

export function App({ locale }: AppProps) {
  const copy = content[locale];
  const [openFaq, setOpenFaq] = useState<number | null>(null);
  const languageHref = locale === "ko" ? "/CodeCoach/" : "/CodeCoach/ko/";
  const privacyHref = locale === "ko" ? "/CodeCoach/privacy-policy.html" : "privacy-policy.html";

  return (
    <>
      <a className="skip-link" href="#main">
        {copy.skipLink}
      </a>

      <header className="site-header">
        <div className="shell nav">
          <a className="brand" href={locale === "ko" ? "/CodeCoach/ko/" : "/CodeCoach/"} aria-label="CodeCoach home">
            <span className="brand__mark" aria-hidden="true">C</span>
            <span>CodeCoach</span>
          </a>
          <nav className="nav__links" aria-label={locale === "ko" ? "주요 메뉴" : "Primary navigation"}>
            <a href="#features">{copy.nav.features}</a>
            <a href="#flow">{copy.nav.flow}</a>
            <a href="#faq">{copy.nav.faq}</a>
          </nav>
          <div className="nav__actions">
            <a className="language-link" href={languageHref} hrefLang={locale === "ko" ? "en" : "ko"}>
              <LanguageIcon />
              <span>{copy.nav.language}</span>
            </a>
            <a className="button button--nav" href={externalLinks.store} target="_blank" rel="noreferrer">
              <ChromeIcon />
              <span>{copy.nav.install}</span>
            </a>
          </div>
        </div>
      </header>

      <main id="main">
        <section className="hero shell">
          <div className="hero__copy">
            <p className="eyebrow">{copy.hero.eyebrow}</p>
            <h1>{copy.hero.title}</h1>
            <p className="hero__lede">{copy.hero.copy}</p>
            <div className="button-row">
              <a className="button button--primary" href={externalLinks.store} target="_blank" rel="noreferrer">
                <ChromeIcon />
                <span>{copy.hero.install}</span>
                <ArrowUpRightIcon className="button__arrow" />
              </a>
              <a className="button button--secondary" href={externalLinks.github} target="_blank" rel="noreferrer">
                <GitHubIcon />
                <span>{copy.hero.github}</span>
              </a>
            </div>
            <ul className="fact-list" aria-label={locale === "ko" ? "제품 정보" : "Product facts"}>
              {copy.hero.facts.map((fact) => (
                <li key={fact}>
                  <CheckIcon />
                  <span>{fact}</span>
                </li>
              ))}
            </ul>
          </div>
          <div className="hero__demo">
            <ProductDemo content={copy.demo} />
            <p className="demo-caption">{copy.demo.label} · {copy.demo.copy}</p>
          </div>
        </section>

        <section className="demo-story section-shell" aria-labelledby="demo-title">
          <div className="shell split-heading">
            <p className="section-index">01 · {copy.demo.label}</p>
            <div>
              <h2 id="demo-title">{copy.demo.title}</h2>
              <p>{copy.demo.copy}</p>
            </div>
          </div>
        </section>

        <section className="features section-shell" id="features" aria-labelledby="features-title">
          <div className="shell">
            <header className="section-intro split-heading">
              <p className="section-index">02 · {copy.featuresIntro.label}</p>
              <div>
                <h2 id="features-title">{copy.featuresIntro.title}</h2>
                <p>{copy.featuresIntro.copy}</p>
              </div>
            </header>
            <div className="feature-list">
              {copy.features.map((feature) => (
                <article className="feature" key={feature.number}>
                  <span className="feature__number">{feature.number}</span>
                  <h3>{feature.title}</h3>
                  <p className="feature__summary">{feature.summary}</p>
                  <p className="feature__detail">{feature.detail}</p>
                </article>
              ))}
            </div>
          </div>
        </section>

        <section className="practice section-shell" id="flow" aria-labelledby="flow-title">
          <div className="shell practice__grid">
            <div className="practice__intro">
              <p className="section-index">03 · {copy.practice.label}</p>
              <h2 id="flow-title">{copy.practice.title}</h2>
              <p>{copy.practice.copy}</p>
            </div>
            <ol className="practice__steps">
              {copy.practiceSteps.map((step) => (
                <li key={step.number}>
                  <span>{step.number}</span>
                  <div>
                    <h3>{step.title}</h3>
                    <p>{step.copy}</p>
                  </div>
                </li>
              ))}
            </ol>
          </div>
        </section>

        <section className="trust section-shell" aria-labelledby="trust-title">
          <div className="shell trust__grid">
            <div>
              <p className="section-index">04 · {copy.trust.label}</p>
              <h2 id="trust-title">{copy.trust.title}</h2>
            </div>
            <div className="trust__copy">
              <p>{copy.trust.copy}</p>
              <ul>
                {copy.trust.points.map((point) => (
                  <li key={point}>
                    <CheckIcon />
                    <span>{point}</span>
                  </li>
                ))}
              </ul>
              <a href={privacyHref}>{copy.footer.privacy}<ArrowRightIcon /></a>
            </div>
          </div>
        </section>

        <section className="faq section-shell" id="faq" aria-labelledby="faq-title">
          <div className="shell faq__grid">
            <header>
              <p className="section-index">05 · {copy.faq.label}</p>
              <h2 id="faq-title">{copy.faq.title}</h2>
              <p>{copy.faq.copy}</p>
            </header>
            <div className="faq__list">
              {copy.faqs.map((item, index) => {
                const isOpen = openFaq === index;
                const answerId = `faq-answer-${index}`;
                return (
                  <article className={`faq__item${isOpen ? " is-open" : ""}`} key={item.question}>
                    <h3>
                      <button
                        type="button"
                        aria-expanded={isOpen}
                        aria-controls={answerId}
                        onClick={() => setOpenFaq(isOpen ? null : index)}
                      >
                        <span>{item.question}</span>
                        <ChevronDownIcon />
                      </button>
                    </h3>
                    <div id={answerId} className="faq__answer" hidden={!isOpen}>
                      <p>{item.answer}</p>
                    </div>
                  </article>
                );
              })}
            </div>
          </div>
        </section>

        <section className="closing shell" aria-labelledby="closing-title">
          <p className="closing__mark" aria-hidden="true">C</p>
          <h2 id="closing-title">{copy.closing.title}</h2>
          <p>{copy.closing.copy}</p>
          <a className="button button--primary" href={externalLinks.store} target="_blank" rel="noreferrer">
            <ChromeIcon />
            <span>{copy.closing.install}</span>
            <ArrowUpRightIcon className="button__arrow" />
          </a>
        </section>
      </main>

      <footer className="site-footer">
        <div className="shell footer__row">
          <p>{copy.footer.disclaimer}</p>
          <nav aria-label={locale === "ko" ? "푸터 메뉴" : "Footer navigation"}>
            <a href={privacyHref}>{copy.footer.privacy}</a>
            <a href={externalLinks.github} target="_blank" rel="noreferrer">{copy.footer.github}</a>
            <a href={languageHref} hrefLang={locale === "ko" ? "en" : "ko"}>{copy.footer.language}</a>
          </nav>
        </div>
      </footer>
    </>
  );
}
