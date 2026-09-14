import { motion } from "motion/react";
import { Home, Gamepad2, Compass, Sliders, LineChart } from "lucide-react";
import { NavLink } from "react-router";

const ITEMS = [
  { to: "/", label: "Inicio", icon: Home },
  { to: "/jugar", label: "Jugar", icon: Gamepad2 },
  { to: "/explorar", label: "Explorar", icon: Compass },
  { to: "/simulador", label: "Simulador", icon: Sliders },
  { to: "/modelo", label: "Modelo", icon: LineChart },
];

export default function NavBar() {
  return (
    <>
      {/* Desktop / tablet: pill nav in the header */}
      <nav className="hidden items-center gap-1 sm:flex">
        {ITEMS.map((item) => (
          <NavLink key={item.to} to={item.to} end={item.to === "/"} className="relative">
            {({ isActive }) => (
              <span className="interactive relative flex items-center gap-1.5 rounded-full px-3.5 py-2 text-sm font-medium">
                {isActive && (
                  <motion.span
                    layoutId="nav-pill"
                    className="absolute inset-0 rounded-full bg-(--color-lime) shadow-(--shadow-glow-lime)"
                    transition={{ type: "spring", stiffness: 500, damping: 35 }}
                  />
                )}
                <item.icon size={15} className={`relative z-10 ${isActive ? "text-(--color-bg)" : "text-(--color-text-dim)"}`} />
                <span className={`relative z-10 ${isActive ? "text-(--color-bg)" : "text-(--color-text-dim)"}`}>{item.label}</span>
              </span>
            )}
          </NavLink>
        ))}
      </nav>

      {/* Mobile: bottom app bar */}
      <nav className="fixed inset-x-0 bottom-0 z-30 flex items-center justify-around border-t border-(--color-border) bg-(--color-surface)/95 px-1 py-1.5 backdrop-blur-lg sm:hidden">
        {ITEMS.map((item) => (
          <NavLink key={item.to} to={item.to} end={item.to === "/"} className="flex flex-col items-center gap-0.5 px-2 py-1">
            {({ isActive }) => (
              <>
                <item.icon size={20} className={isActive ? "text-(--color-lime)" : "text-(--color-text-faint)"} />
                <span className={`text-[10px] ${isActive ? "text-(--color-lime)" : "text-(--color-text-faint)"}`}>{item.label}</span>
              </>
            )}
          </NavLink>
        ))}
      </nav>
    </>
  );
}
