import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { BrowserRouter, Route, Routes } from "react-router";
import "./theme.css";
import AppShell from "./components/AppShell";
import Hub from "./pages/Hub";
import PlayMenu from "./pages/PlayMenu";
import GuessXg from "./pages/GuessXg";
import GoalOrNot from "./pages/GoalOrNot";
import ExploreCompetitions from "./pages/ExploreCompetitions";
import ExploreMatches from "./pages/ExploreMatches";
import MatchView from "./pages/MatchView";
import Simulator from "./pages/Simulator";
import Model from "./pages/Model";
import Players from "./pages/Players";
import PlayerView from "./pages/PlayerView";
import Credits from "./pages/Credits";

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <BrowserRouter>
      <Routes>
        <Route element={<AppShell />}>
          <Route index element={<Hub />} />
          <Route path="jugar" element={<PlayMenu />} />
          <Route path="jugar/adivina" element={<GuessXg />} />
          <Route path="jugar/gol-o-no" element={<GoalOrNot />} />
          <Route path="explorar" element={<ExploreCompetitions />} />
          <Route path="explorar/:competitionId/:seasonId" element={<ExploreMatches />} />
          <Route path="partido/:matchId" element={<MatchView />} />
          <Route path="jugadores" element={<Players />} />
          <Route path="jugador/:playerId" element={<PlayerView />} />
          <Route path="simulador" element={<Simulator />} />
          <Route path="modelo" element={<Model />} />
          <Route path="creditos" element={<Credits />} />
        </Route>
      </Routes>
    </BrowserRouter>
  </StrictMode>,
);
