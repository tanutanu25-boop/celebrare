import {
  Camera,
  FlaskConical,
  LayoutDashboard,
  ShieldCheck,
  Sparkles,
} from "lucide-react";

function Navbar({ activeTab, onChangeTab, currentUser, demoMode, onLogout }) {
  const menuItems = [
    { id: "gallery", icon: Camera, label: "Guest Gallery" },
    { id: "dashboard", icon: LayoutDashboard, label: "Photographer Studio" },
    { id: "admin", icon: ShieldCheck, label: "Admin Review" },
    ...(demoMode
      ? [{ id: "demo", icon: FlaskConical, label: "Demo Lab (A–E)" }]
      : []),
  ];

  return (
    <aside className="sidebar">
      <div className="brand-block">
        <div className="brand-badge">
          <Sparkles size={18} />
        </div>
        <div>
          <h2 className="logo">
            Celebrare<span>.</span>
          </h2>
          <small className="brand-sub">Direct UPI Photos</small>
        </div>
      </div>

      <p className="menu-title">WORKSPACES</p>

      <nav className="sidebar-menu" aria-label="Primary navigation">
        {menuItems.map((item) => {
          const Icon = item.icon;
          return (
            <button
              key={item.id}
              type="button"
              className={activeTab === item.id ? "nav-item active" : "nav-item"}
              onClick={() => onChangeTab(item.id)}
            >
              <span className="nav-icon">
                <Icon size={18} />
              </span>
              <span className="nav-label">{item.label}</span>
            </button>
          );
        })}
      </nav>

      <div className="sidebar-bottom">
        {currentUser ? (
          <div className="profile-card">
            <div className="profile">
              <div className="avatar">
                {currentUser.name?.charAt(0)?.toUpperCase() || "U"}
              </div>
              <div className="profile-meta">
                <strong>{currentUser.name}</strong>
                <small>
                  {currentUser.role === "admin"
                    ? "Trust & Safety Admin"
                    : currentUser.upiId || "UPI not set"}
                </small>
              </div>
            </div>
            <button
              type="button"
              className="secondary-btn small-btn"
              onClick={onLogout}
            >
              Sign Out
            </button>
          </div>
        ) : (
          <div className="profile">
            <div className="avatar">G</div>
            <div>
              <strong>Guest Browser</strong>
              <small>No login needed to buy</small>
            </div>
          </div>
        )}
      </div>
    </aside>
  );
}

export default Navbar;
