"use client";

import Image from "next/image";
import Link from "next/link";
import { useEffect, useState } from "react";

const navLinks = [
  { href: "/#fonctionnalites", label: "Fonctionnalités" },
  { href: "/#montre", label: "Montre" },
  { href: "/#progression", label: "Progression" },
  { href: "/#tarifs", label: "Tarifs" },
  { href: "/#faq", label: "FAQ" },
  { href: "/contact", label: "Contact" },
] as const;

export function PublicHeader({ isAuthenticated = false }: { isAuthenticated?: boolean }) {
  const [isScrolled, setIsScrolled] = useState(false);
  const [isOpen, setIsOpen] = useState(false);

  useEffect(() => {
    const onScroll = () => setIsScrolled(window.scrollY > 18);
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  return (
    <header className={`trk-header${isScrolled ? " is-scrolled" : ""}`}>
      <nav className="trk-header__inner" aria-label="Navigation principale">
        <Link className="trk-header__brand" href="/" onClick={() => setIsOpen(false)}>
          <Image
            src="/brand/traknio-site-lockup-v2.png"
            alt="Traknio - Train smarter. Progress further."
            width={1614}
            height={311}
            className="trk-header__site-logo"
            priority
          />
        </Link>

        <div className="trk-header__links">
          {navLinks.map((link) => (
            <a key={link.href} href={link.href}>
              {link.label}
            </a>
          ))}
        </div>

        <Link className="trk-header__cta" href={isAuthenticated ? "/dashboard" : "/login"}>
          {isAuthenticated ? "Ouvrir Traknio" : "Se connecter"}
        </Link>

        <button
          className="trk-menu-button"
          type="button"
          aria-label={isOpen ? "Fermer le menu" : "Ouvrir le menu"}
          aria-expanded={isOpen}
          onClick={() => setIsOpen((value) => !value)}
        >
          <span />
          <span />
          <span />
        </button>
      </nav>

      <div className={`trk-mobile-menu${isOpen ? " is-open" : ""}`}>
        {navLinks.map((link) => (
          <a key={link.href} href={link.href} onClick={() => setIsOpen(false)}>
            {link.label}
          </a>
        ))}
        <Link href={isAuthenticated ? "/dashboard" : "/login"} onClick={() => setIsOpen(false)}>
          {isAuthenticated ? "Ouvrir Traknio" : "Se connecter"}
        </Link>
      </div>
    </header>
  );
}
