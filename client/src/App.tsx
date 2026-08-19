import { Toaster } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import AnalyticsPage from "@/pages/AnalyticsPage";
import BackupsPage from "@/pages/BackupsPage";
import BoardPage from "@/pages/BoardPage";
import DataPage from "@/pages/DataPage";
import Home from "@/pages/Home";
import KioskPage from "@/pages/KioskPage";
import NotFound from "@/pages/NotFound";
import PatientsPage from "@/pages/PatientsPage";
import PdaPage from "@/pages/PdaPage";
import SchedulesPage from "@/pages/SchedulesPage";
import StaffPage from "@/pages/StaffPage";
import { Route, Switch } from "wouter";
import ErrorBoundary from "./components/ErrorBoundary";
import { ThemeProvider } from "./contexts/ThemeContext";

function Router() {
  return <Switch>
    <Route path="/" component={Home} />
    <Route path="/patients" component={PatientsPage} />
    <Route path="/schedules" component={SchedulesPage} />
    <Route path="/pda" component={PdaPage} />
    <Route path="/kiosk" component={KioskPage} />
    <Route path="/board" component={BoardPage} />
    <Route path="/analytics" component={AnalyticsPage} />
    <Route path="/data" component={DataPage} />
    <Route path="/backups" component={BackupsPage} />
    <Route path="/staff" component={StaffPage} />
    <Route component={NotFound} />
  </Switch>;
}

export default function App() {
  return <ErrorBoundary><ThemeProvider defaultTheme="light"><TooltipProvider><Toaster /><Router /></TooltipProvider></ThemeProvider></ErrorBoundary>;
}

