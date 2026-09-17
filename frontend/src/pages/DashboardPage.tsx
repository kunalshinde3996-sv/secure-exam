import { useNavigate } from "react-router-dom";
import { clearSession, getUser } from "../api/client";
import ExamBoardDashboard from "./dashboards/ExamBoardDashboard";
import PressDashboard from "./dashboards/PressDashboard";
import DistributionCenterDashboard from "./dashboards/DistributionCenterDashboard";
import InvigilatorDashboard from "./dashboards/InvigilatorDashboard";
import RoleBadge from "../components/RoleBadge";

export default function DashboardPage() {
  const navigate = useNavigate();
  const user = getUser();

  if (!user) {
    navigate("/login", { replace: true });
    return null;
  }

  function handleLogout() {
    clearSession();
    navigate("/login", { replace: true });
  }

  return (
    <div className="dashboard-page">
      <header className="dashboard-header">
        <div>
          <h1>SecureExam</h1>
          <p className="muted">
            {user.name} — <RoleBadge role={user.role} />
          </p>
        </div>
        <button type="button" className="btn-secondary" onClick={handleLogout}>
          Log Out
        </button>
      </header>

      <main>
        {user.role === "EXAM_BOARD" && <ExamBoardDashboard />}
        {user.role === "PRESS" && <PressDashboard />}
        {user.role === "DISTRIBUTION_CENTER" && <DistributionCenterDashboard />}
        {user.role === "INVIGILATOR" && <InvigilatorDashboard />}
      </main>
    </div>
  );
}
