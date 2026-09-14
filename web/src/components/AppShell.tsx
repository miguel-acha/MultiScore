import { AnimatePresence } from "motion/react";
import { Link, Outlet, useLocation } from "react-router";
import { useEffect, useState } from "react";
import NavBar from "./NavBar";
import PageTransition from "./PageTransition";
import { loadProgress } from "../lib/progress";

export default function AppShell() {
  const location = useLocation();
  const [score, setScore] = useState(0);

  useEffect(() => {
    setScore(loadProgress().totalScore);
  }, [location.pathname]);

  return (
    <>
      <header className="sticky top-0 z-20 flex justify-center px-3 pt-4 sm:px-5">
        <div className="flex w-full max-w-6xl items-center justify-between gap-4 rounded-full border border-(--color-border) bg-(--color-surface)/70 py-2 pl-5 pr-2 shadow-(--shadow-card) backdrop-blur-xl">
          <Link to="/" className="flex shrink-0 items-center gap-2.5">
            <img src="/images/logo-white.png" alt="MultiScore" className="h-7 w-auto" />
          </Link>
          <NavBar />
          <div className="clip-menu-sm hidden shrink-0 items-center gap-1.5 border border-(--color-lime)/30 bg-(--color-lime)/10 px-3 py-1.5 text-xs font-semibold text-(--color-lime) sm:flex">
            <span>PUNTOS</span>
            <span className="text-stat text-sm">{score}</span>
          </div>
        </div>
      </header>

      <div className="mx-auto max-w-6xl px-3 pb-24 pt-6 sm:px-5 sm:pb-10">
        <AnimatePresence mode="wait">
          <PageTransition key={location.pathname}>
            <Outlet />
          </PageTransition>
        </AnimatePresence>
      </div>
    </>
  );
}
